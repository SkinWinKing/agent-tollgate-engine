import { secp256k1 } from '@noble/curves/secp256k1';
import { keccak_256 } from '@noble/hashes/sha3';
import { EVM_ADDRESS, SOLANA_ADDRESS } from '@tollgate/core';
import { Hono } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import type { Context } from 'hono';
import type { AppEnv } from './env';

/**
 * Sign-in with a wallet (Phantom / MetaMask). The user signs a one-time message; we verify the signature and set an
 * HMAC-signed, HttpOnly session cookie. No passwords, no private keys, nothing custodial.
 */
export const auth = new Hono<AppEnv>();

const COOKIE = 'tg_session';
const SESSION_TTL_SEC = 7 * 86_400;
const NONCE_TTL_SEC = 300;

export interface Session {
  address: string;
  chain: 'solana' | 'evm';
  exp: number;
}

const te = new TextEncoder();
const b64url = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4)), (c) => c.charCodeAt(0));
const hex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('');

const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function base58Decode(s: string): Uint8Array {
  let n = 0n;
  for (const ch of s) {
    const i = B58.indexOf(ch);
    if (i < 0) throw new Error('bad base58');
    n = n * 58n + BigInt(i);
  }
  const bytes: number[] = [];
  while (n > 0n) {
    bytes.unshift(Number(n % 256n));
    n /= 256n;
  }
  for (const ch of s) {
    if (ch !== '1') break;
    bytes.unshift(0);
  }
  return Uint8Array.from(bytes);
}

async function hmac(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', te.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(new Uint8Array(await crypto.subtle.sign('HMAC', key, te.encode(data))));
}

export async function readSession(c: Context<AppEnv>): Promise<Session | null> {
  const secret = c.env.SESSION_SECRET;
  const raw = getCookie(c, COOKIE);
  if (!secret || !raw) return null;
  const [payload, sig] = raw.split('.');
  if (!payload || !sig || (await hmac(secret, payload)) !== sig) return null;
  try {
    const s = JSON.parse(new TextDecoder().decode(fromB64url(payload))) as Session;
    return s.exp > Date.now() / 1000 ? s : null;
  } catch {
    return null;
  }
}

/** Same-origin guard for cookie-authenticated POSTs (defence in depth on top of SameSite=Lax). */
export function sameOrigin(c: Context<AppEnv>): boolean {
  const origin = c.req.header('origin');
  return !origin || origin === new URL(c.req.url).origin;
}

function loginMessage(domain: string, address: string, nonce: string, issuedAt: string) {
  return `${domain} wants you to sign in with your wallet:\n${address}\n\nSign in to Agent Tollgate. This request will not trigger a transaction or cost any fees.\n\nURI: https://${domain}\nNonce: ${nonce}\nIssued At: ${issuedAt}`;
}

auth.get('/auth/nonce', async (c) => {
  const address = c.req.query('address') ?? '';
  if (!EVM_ADDRESS.test(address) && !SOLANA_ADDRESS.test(address)) return c.json({ error: 'INVALID_ADDRESS' }, 400);
  const nonce = hex(crypto.getRandomValues(new Uint8Array(16)));
  const issuedAt = new Date().toISOString();
  await c.env.CACHE.put(`auth:nonce:${nonce}`, JSON.stringify({ address, issuedAt }), { expirationTtl: NONCE_TTL_SEC });
  return c.json({ nonce, message: loginMessage(new URL(c.req.url).host, address, nonce, issuedAt) });
});

auth.post('/auth/verify', async (c) => {
  if (!sameOrigin(c)) return c.json({ error: 'FORBIDDEN' }, 403);
  if (!c.env.SESSION_SECRET) return c.json({ error: 'AUTH_DISABLED' }, 503);
  const body = await c.req.json<{ nonce?: string; signature?: string }>().catch(() => null);
  if (!body?.nonce || !body.signature) return c.json({ error: 'INVALID_REQUEST' }, 400);
  const stored = await c.env.CACHE.get<{ address: string; issuedAt: string }>(`auth:nonce:${body.nonce}`, 'json');
  if (!stored) return c.json({ error: 'NONCE_EXPIRED' }, 400);
  await c.env.CACHE.delete(`auth:nonce:${body.nonce}`);
  const message = loginMessage(new URL(c.req.url).host, stored.address, body.nonce, stored.issuedAt);

  let ok = false;
  let chain: Session['chain'];
  try {
    if (EVM_ADDRESS.test(stored.address)) {
      chain = 'evm';
      // personal_sign: keccak256("\x19Ethereum Signed Message:\n" + len + message), signature r||s||v.
      const msg = te.encode(message);
      const digest = keccak_256(new Uint8Array([...te.encode(`\x19Ethereum Signed Message:\n${msg.length}`), ...msg]));
      const sigHex = body.signature.replace(/^0x/, '');
      const v = parseInt(sigHex.slice(128, 130), 16);
      const sig = secp256k1.Signature.fromCompact(sigHex.slice(0, 128)).addRecoveryBit(v >= 27 ? v - 27 : v);
      const pub = sig.recoverPublicKey(digest).toRawBytes(false);
      const recovered = '0x' + hex(keccak_256(pub.slice(1))).slice(-40);
      ok = recovered.toLowerCase() === stored.address.toLowerCase();
    } else {
      chain = 'solana';
      const key = await crypto.subtle.importKey('raw', new Uint8Array(base58Decode(stored.address)), { name: 'Ed25519' }, false, ['verify']);
      const sig = /^[0-9a-f]{128}$/i.test(body.signature) ? Uint8Array.from(body.signature.match(/../g)!, (h) => parseInt(h, 16)) : base58Decode(body.signature);
      ok = await crypto.subtle.verify({ name: 'Ed25519' }, key, new Uint8Array(sig), te.encode(message));
    }
  } catch {
    ok = false;
    chain = 'solana';
  }
  if (!ok) return c.json({ error: 'BAD_SIGNATURE' }, 401);

  const session: Session = { address: stored.address, chain, exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SEC };
  const payload = b64url(te.encode(JSON.stringify(session)));
  setCookie(c, COOKIE, `${payload}.${await hmac(c.env.SESSION_SECRET, payload)}`, { httpOnly: true, secure: true, sameSite: 'Lax', path: '/', maxAge: SESSION_TTL_SEC });
  return c.json({ address: session.address, chain: session.chain, expires: new Date(session.exp * 1000).toISOString() });
});

auth.get('/auth/me', async (c) => {
  const s = await readSession(c);
  return s ? c.json({ address: s.address, chain: s.chain, expires: new Date(s.exp * 1000).toISOString() }) : c.json({ error: 'NOT_SIGNED_IN' }, 401);
});

auth.post('/auth/logout', (c) => {
  if (!sameOrigin(c)) return c.json({ error: 'FORBIDDEN' }, 403);
  deleteCookie(c, COOKIE, { path: '/', secure: true });
  return c.json({ ok: true });
});
