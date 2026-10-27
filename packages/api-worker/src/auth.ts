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
  chain: 'solana' | 'evm' | 'google';
  email?: string;
  name?: string;
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

/** Constant-time HMAC check. */
export async function hmacOk(secret: string, data: string, sig: string): Promise<boolean> {
  let bytes: Uint8Array;
  try {
    bytes = fromB64url(sig);
  } catch {
    return false;
  }
  const key = await crypto.subtle.importKey('raw', te.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  return crypto.subtle.verify('HMAC', key, new Uint8Array(bytes), te.encode(data));
}
export { hmac };

/** Per-IP limit for unauthenticated endpoints that write state. */
async function ipLimited(c: Context<AppEnv>, bucket: string, perMinute: number): Promise<boolean> {
  const ip = c.req.header('cf-connecting-ip') ?? 'x';
  const stub = c.env.NONCE_STORE.get(c.env.NONCE_STORE.idFromName('global'));
  return !(await stub.hit(`rl:${bucket}:${ip}:${Math.floor(Date.now() / 60_000)}`, perMinute, 120));
}
export { ipLimited };

export async function readSession(c: Context<AppEnv>): Promise<Session | null> {
  const secret = c.env.SESSION_SECRET;
  const raw = getCookie(c, COOKIE);
  if (!secret || !raw) return null;
  const [payload, sig] = raw.split('.');
  if (!payload || !sig || !(await hmacOk(secret, payload, sig))) return null;
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
  if (await ipLimited(c, 'authnonce', 10)) return c.json({ error: 'RATE_LIMITED' }, 429);
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
  // KV is eventually consistent; the DO burn makes the nonce truly single-use.
  if (!(await c.env.NONCE_STORE.get(c.env.NONCE_STORE.idFromName('global')).consume(`auth:nonce:${body.nonce}`, NONCE_TTL_SEC))) return c.json({ error: 'NONCE_USED' }, 400);
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
  if (!s) return c.json({ error: 'NOT_SIGNED_IN' }, 401);
  return c.json({ address: s.address, chain: s.chain, email: s.email, name: s.name, expires: new Date(s.exp * 1000).toISOString() });
});

auth.post('/auth/logout', (c) => {
  if (!sameOrigin(c)) return c.json({ error: 'FORBIDDEN' }, 403);
  deleteCookie(c, COOKIE, { path: '/', secure: true });
  return c.json({ ok: true });
});

const GSTATE_COOKIE = 'tg_gstate';
const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo';

async function ensureUsersTable(db: D1Database) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    name TEXT,
    picture TEXT,
    wallet_sol TEXT,
    wallet_evm TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )`).run();
}

auth.get('/auth/google', async (c) => {
  const clientId = c.env.GOOGLE_CLIENT_ID;
  if (!clientId) return c.json({ error: 'GOOGLE_AUTH_DISABLED' }, 503);
  if (await ipLimited(c, 'gauth', 10)) return c.json({ error: 'RATE_LIMITED' }, 429);
  const origin = new URL(c.req.url).origin;
  const state = hex(crypto.getRandomValues(new Uint8Array(16)));
  await c.env.CACHE.put(`auth:gstate:${state}`, '1', { expirationTtl: NONCE_TTL_SEC });
  // Bind state to this browser so a callback link from someone else cannot log the victim into the attacker's account.
  setCookie(c, GSTATE_COOKIE, state, { httpOnly: true, secure: true, sameSite: 'Lax', path: '/auth/google', maxAge: NONCE_TTL_SEC });
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${origin}/auth/google/callback`,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    prompt: 'select_account',
  });
  return c.redirect(`${GOOGLE_AUTH_URL}?${params}`);
});

auth.get('/auth/google/callback', async (c) => {
  const clientId = c.env.GOOGLE_CLIENT_ID;
  const clientSecret = c.env.GOOGLE_CLIENT_SECRET;
  const sessionSecret = c.env.SESSION_SECRET;
  if (!clientId || !clientSecret || !sessionSecret) return c.json({ error: 'AUTH_DISABLED' }, 503);

  const code = c.req.query('code');
  const state = c.req.query('state');
  const error = c.req.query('error');
  if (error) return c.redirect('/#home');
  if (!code || !state) return c.json({ error: 'INVALID_CALLBACK' }, 400);
  const cookieState = getCookie(c, GSTATE_COOKIE);
  deleteCookie(c, GSTATE_COOKIE, { path: '/auth/google', secure: true });
  if (!cookieState || cookieState !== state) return c.json({ error: 'STATE_MISMATCH' }, 400);

  const stored = await c.env.CACHE.get(`auth:gstate:${state}`);
  if (!stored) return c.json({ error: 'STATE_EXPIRED' }, 400);
  await c.env.CACHE.delete(`auth:gstate:${state}`);

  const origin = new URL(c.req.url).origin;
  const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: `${origin}/auth/google/callback`,
      grant_type: 'authorization_code',
    }),
  });
  const tokens = await tokenRes.json<{ access_token?: string; error?: string }>().catch(() => ({} as { access_token?: string; error?: string }));
  if (!tokenRes.ok || !tokens.access_token) return c.json({ error: 'TOKEN_EXCHANGE_FAILED', detail: tokens.error }, 400);

  const userRes = await fetch(GOOGLE_USERINFO_URL, { headers: { authorization: `Bearer ${tokens.access_token}` } });
  const user = await userRes.json<{ email?: string; verified_email?: boolean; name?: string; picture?: string }>().catch(() => ({} as { email?: string; verified_email?: boolean; name?: string; picture?: string }));
  if (!userRes.ok || !user.email) return c.json({ error: 'NO_EMAIL' }, 400);
  if (user.verified_email !== true) return c.json({ error: 'EMAIL_NOT_VERIFIED' }, 403);

  await ensureUsersTable(c.env.SALES);
  const existing = await c.env.SALES.prepare('SELECT id FROM users WHERE email = ?').bind(user.email).first();
  if (existing) {
    await c.env.SALES.prepare('UPDATE users SET name = ?, picture = ?, updated_at = datetime(\'now\') WHERE email = ?').bind(user.name ?? '', user.picture ?? '', user.email).run();
  } else {
    await c.env.SALES.prepare('INSERT INTO users (email, name, picture) VALUES (?, ?, ?)').bind(user.email, user.name ?? '', user.picture ?? '').run();
  }

  // A profile wallet is only a payout/trade address, never an identity: it was not proven by signature.
  const session: Session = { address: '', chain: 'google', email: user.email, name: user.name, exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SEC };
  const payload = b64url(te.encode(JSON.stringify(session)));
  setCookie(c, COOKIE, `${payload}.${await hmac(sessionSecret, payload)}`, { httpOnly: true, secure: true, sameSite: 'Lax', path: '/', maxAge: SESSION_TTL_SEC });
  return c.redirect('/#home');
});
