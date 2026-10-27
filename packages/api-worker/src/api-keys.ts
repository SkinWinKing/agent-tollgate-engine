import { evmChains, loadConfig, verifyEvmPayment, verifySolanaPayment, type RouteSpec, type VerifyResult } from '@tollgate/core';
import { Hono, type Context } from 'hono';
import { readSession, sameOrigin } from './auth';
import type { AppEnv } from './env';

/** API keys for users' own AI agents: a free tier with 10 tools, paid Pro and Desk plans bought with USDC from the signed-in wallet. */
export const apiKeys = new Hono<AppEnv>();

export const FREE_TOOLS = [
  'crypto_price',
  'token_market',
  'token_audit',
  'router_quote_and_build',
  'technical_indicators',
  'fear_greed',
  'council_verdict',
  'kelly_size',
  'wallet_balance',
  'dex_search',
];

type PlanId = 'free' | 'pro' | 'desk';
export const PLANS: Record<PlanId, { name: string; priceUsdc: number; perDay: number; perMinute: number; maxKeys: number; tools: 'free' | 'all' }> = {
  free: { name: 'Free', priceUsdc: 0, perDay: 200, perMinute: 10, maxKeys: 1, tools: 'free' },
  pro: { name: 'Pro', priceUsdc: 39, perDay: 5_000, perMinute: 60, maxKeys: 2, tools: 'all' },
  desk: { name: 'Desk', priceUsdc: 79, perDay: 25_000, perMinute: 120, maxKeys: 5, tools: 'all' },
};
const PLAN_DAYS = 30;
const KEY_PREFIX = 'skw_';

let schemaReady: Promise<unknown> | null = null;
const ensureSchema = (db: D1Database) =>
  (schemaReady ??= db
    .batch([
      db.prepare('CREATE TABLE IF NOT EXISTS api_keys (id TEXT PRIMARY KEY, hash TEXT UNIQUE NOT NULL, wallet TEXT NOT NULL, label TEXT, created TEXT NOT NULL, revoked INTEGER NOT NULL DEFAULT 0, last_used TEXT)'),
      db.prepare('CREATE INDEX IF NOT EXISTS api_keys_wallet ON api_keys (wallet)'),
      db.prepare('CREATE TABLE IF NOT EXISTS plans (wallet TEXT PRIMARY KEY, plan TEXT NOT NULL, expires TEXT NOT NULL, updated TEXT NOT NULL)'),
      db.prepare('CREATE TABLE IF NOT EXISTS plan_payments (reference TEXT PRIMARY KEY, wallet TEXT NOT NULL, plan TEXT NOT NULL, network TEXT NOT NULL, amount_units INTEGER NOT NULL, ts TEXT NOT NULL)'),
    ])
    .catch((err) => {
      schemaReady = null;
      throw err;
    }));

const sha256 = async (s: string) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map((b) => b.toString(16).padStart(2, '0')).join('');
const walletId = (address: string) => (address.startsWith('0x') ? address.toLowerCase() : address);

async function activePlan(db: D1Database, wallet: string): Promise<{ plan: PlanId; expires: string | null }> {
  const row = await db.prepare('SELECT plan, expires FROM plans WHERE wallet = ?').bind(wallet).first<{ plan: PlanId; expires: string }>();
  if (row && row.expires > new Date().toISOString() && row.plan in PLANS) return { plan: row.plan, expires: row.expires };
  return { plan: 'free', expires: null };
}

/** Records a plan payment once and extends (same tier) or replaces (other tier) the wallet's plan. Null if already used. */
export async function grantPlan(db: D1Database, wallet: string, planId: PlanId, network: string, reference: string, amountUnits: number): Promise<string | null> {
  await ensureSchema(db);
  const ins = await db.prepare('INSERT OR IGNORE INTO plan_payments (reference, wallet, plan, network, amount_units, ts) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(reference, wallet, planId, network, amountUnits, new Date().toISOString())
    .run();
  if (!ins.meta.changes) return null;
  const current = await activePlan(db, wallet);
  const start = current.plan === planId && current.expires ? new Date(current.expires) : new Date();
  const expires = new Date(start.getTime() + PLAN_DAYS * 86_400_000).toISOString();
  await db.prepare('INSERT INTO plans (wallet, plan, expires, updated) VALUES (?, ?, ?, ?) ON CONFLICT(wallet) DO UPDATE SET plan = excluded.plan, expires = excluded.expires, updated = excluded.updated')
    .bind(wallet, planId, expires, new Date().toISOString())
    .run();
  return expires;
}

export { walletId };
export type { PlanId };

/** Reads an agent's key from `X-API-Key` or `Authorization: Bearer skw_...`. */
export const apiKeyFrom = (headers: Headers) => {
  const direct = headers.get('x-api-key')?.trim();
  if (direct?.startsWith(KEY_PREFIX)) return direct;
  const bearer = headers.get('authorization')?.match(/^Bearer\s+(skw_\S+)$/i)?.[1];
  return bearer ?? null;
};

/** Gate used before x402: a valid key replaces the per-call payment within the plan's tools and limits. */
export async function checkApiKey(c: Context<AppEnv>, route: RouteSpec, key: string): Promise<Response | null> {
  await ensureSchema(c.env.SALES);
  const row = await c.env.SALES.prepare('SELECT id, wallet FROM api_keys WHERE hash = ? AND revoked = 0').bind(await sha256(key)).first<{ id: string; wallet: string }>();
  if (!row) return c.json({ error: 'INVALID_API_KEY', message: 'Unknown or revoked API key. Create one at https://skinwinking.com/#keys' }, 401);
  const { plan } = await activePlan(c.env.SALES, row.wallet);
  const spec = PLANS[plan];
  if (spec.tools === 'free' && !FREE_TOOLS.includes(route.id)) {
    return c.json({ error: 'PLAN_UPGRADE_REQUIRED', plan, message: `${route.id} is not in the Free plan. Upgrade to Pro (39 USDC / 30 days) or Desk (79 USDC / 30 days) at https://skinwinking.com/#keys, or pay per call over x402 without a key.`, freeTools: FREE_TOOLS }, 403);
  }
  const stub = c.env.NONCE_STORE.get(c.env.NONCE_STORE.idFromName('global'));
  const now = new Date();
  const minute = now.toISOString().slice(0, 16);
  const day = now.toISOString().slice(0, 10);
  if (!(await stub.hit(`ak:m:${row.wallet}:${minute}`, spec.perMinute, 120))) return c.json({ error: 'RATE_LIMITED', plan, limit: `${spec.perMinute}/minute` }, 429, { 'retry-after': '60' });
  if (!(await stub.hit(`ak:d:${row.wallet}:${day}`, spec.perDay, 2 * 86_400))) return c.json({ error: 'DAILY_LIMIT_REACHED', plan, limit: `${spec.perDay}/day`, message: 'Upgrade your plan or pay per call over x402.' }, 429);
  c.executionCtx.waitUntil(
    Promise.all([
      stub.bump(`stat:${now.toISOString().slice(0, 10)}:key:${plan}:${route.id}`, 60 * 86_400),
      c.env.SALES.prepare('UPDATE api_keys SET last_used = ? WHERE id = ?').bind(now.toISOString(), row.id).run(),
    ]).catch(() => {}),
  );
  c.header('X-Plan', plan);
  return null;
}

const session = async (c: Context<AppEnv>) => {
  const s = await readSession(c);
  // Keys and plans belong to a signature-proven wallet; Google sessions have none.
  if (!s || !s.address || s.chain === 'google') return null;
  return { ...s, wallet: walletId(s.address) };
};

apiKeys.get('/app/keys', async (c) => {
  const s = await session(c);
  const cfg = loadConfig(c.env as unknown as Record<string, unknown>);
  const pay = { solana: { payTo: cfg.merchantSol, usdc: cfg.usdcSol }, base: { payTo: cfg.merchantEvm, usdc: cfg.usdcBase, chainId: '0x2105' }, polygon: { payTo: cfg.merchantEvm, usdc: cfg.usdcEvm, chainId: '0x89' } };
  if (!s) return c.json({ signedIn: false, plans: PLANS, freeTools: FREE_TOOLS, pay });
  await ensureSchema(c.env.SALES);
  const [plan, keys] = await Promise.all([
    activePlan(c.env.SALES, s.wallet),
    c.env.SALES.prepare('SELECT id, label, created, last_used FROM api_keys WHERE wallet = ? AND revoked = 0 ORDER BY created').bind(s.wallet).all(),
  ]);
  return c.json({ signedIn: true, wallet: s.wallet, ...plan, plans: PLANS, freeTools: FREE_TOOLS, keys: keys.results, pay }, 200, { 'cache-control': 'no-store' });
});

apiKeys.post('/app/keys', async (c) => {
  if (!sameOrigin(c)) return c.json({ error: 'FORBIDDEN' }, 403);
  const s = await session(c);
  if (!s) return c.json({ error: 'SIGN_IN_REQUIRED' }, 401);
  await ensureSchema(c.env.SALES);
  const { plan } = await activePlan(c.env.SALES, s.wallet);
  const count = await c.env.SALES.prepare('SELECT COUNT(*) AS n FROM api_keys WHERE wallet = ? AND revoked = 0').bind(s.wallet).first<{ n: number }>();
  if ((count?.n ?? 0) >= PLANS[plan].maxKeys) return c.json({ error: 'KEY_LIMIT', message: `${PLANS[plan].name} allows ${PLANS[plan].maxKeys} key(s). Revoke one or upgrade.` }, 403);
  const body = await c.req.json<{ label?: string }>().catch(() => ({ label: undefined }));
  const raw = new Uint8Array(24);
  crypto.getRandomValues(raw);
  const key = KEY_PREFIX + [...raw].map((b) => b.toString(16).padStart(2, '0')).join('');
  const id = crypto.randomUUID();
  await c.env.SALES.prepare('INSERT INTO api_keys (id, hash, wallet, label, created) VALUES (?, ?, ?, ?, ?)')
    .bind(id, await sha256(key), s.wallet, String(body.label ?? 'My agent').slice(0, 40), new Date().toISOString())
    .run();
  return c.json({ id, key, note: 'Shown once. Store it in your agent as X-API-Key.' }, 201, { 'cache-control': 'no-store' });
});

apiKeys.delete('/app/keys/:id', async (c) => {
  if (!sameOrigin(c)) return c.json({ error: 'FORBIDDEN' }, 403);
  const s = await session(c);
  if (!s) return c.json({ error: 'SIGN_IN_REQUIRED' }, 401);
  await ensureSchema(c.env.SALES);
  await c.env.SALES.prepare('UPDATE api_keys SET revoked = 1 WHERE id = ? AND wallet = ?').bind(c.req.param('id'), s.wallet).run();
  return c.json({ ok: true });
});

/** Activates a plan after verifying the USDC transfer on chain. Each transaction can be used once. */
apiKeys.post('/app/plan', async (c) => {
  if (!sameOrigin(c)) return c.json({ error: 'FORBIDDEN' }, 403);
  const s = await session(c);
  if (!s) return c.json({ error: 'SIGN_IN_REQUIRED' }, 401);
  const body = await c.req.json<{ plan?: string; network?: string; tx?: string }>().catch(() => null);
  const planId = body?.plan as PlanId;
  if (!body?.tx || (planId !== 'pro' && planId !== 'desk')) return c.json({ error: 'BAD_REQUEST', message: 'plan (pro|desk), network and tx are required' }, 400);
  const cfg = loadConfig(c.env as unknown as Record<string, unknown>);
  const units = PLANS[planId].priceUsdc * 1_000_000;
  let result: VerifyResult;
  if (body.network === 'solana') result = await verifySolanaPayment(cfg, body.tx, units).catch(() => ({ ok: false as const, reason: 'RPC_UNAVAILABLE', retryable: true }));
  else {
    const chain = evmChains(cfg).find((ch) => ch.network === body.network);
    if (!chain) return c.json({ error: 'BAD_NETWORK', message: 'solana, base or polygon' }, 400);
    result = await verifyEvmPayment(cfg, chain, body.tx, units).catch(() => ({ ok: false as const, reason: 'RPC_UNAVAILABLE', retryable: true }));
  }
  if (!result.ok) return c.json({ error: result.reason, retryable: result.retryable }, result.retryable ? 409 : 402);
  const p = result.payment;
  if (walletId(p.payer ?? '') !== s.wallet) return c.json({ error: 'PAYER_MISMATCH', message: 'Pay from the wallet you are signed in with.' }, 402);
  // Burn the transaction for x402 too, so a plan payment cannot also pay for a tool call (and vice versa).
  if (!(await c.env.NONCE_STORE.get(c.env.NONCE_STORE.idFromName('global')).consume(`pay:${p.network}:${p.reference}`, 7 * 86_400))) return c.json({ error: 'PAYMENT_ALREADY_USED' }, 409);
  const expires = await grantPlan(c.env.SALES, s.wallet, planId, p.network, p.reference, p.amountUnits);
  if (!expires) return c.json({ error: 'PAYMENT_ALREADY_USED' }, 409);
  await c.env.SALES.prepare('INSERT OR IGNORE INTO sales (ts, route, network, amount_units, payer, reference) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(new Date().toISOString(), `plan_${planId}`, p.network, p.amountUnits, p.payer, p.reference)
    .run()
    .catch(() => {});
  return c.json({ ok: true, plan: planId, expires });
});

/** Recent blockhash for the in-browser USDC transfer, served from our RPC so the page needs no public RPC. */
apiKeys.get('/app/solana/blockhash', async (c) => {
  const cfg = loadConfig(c.env as unknown as Record<string, unknown>);
  const r = await fetch(cfg.solanaRpcUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getLatestBlockhash', params: [{ commitment: 'confirmed' }] }) });
  const j = await r.json<{ result?: { value: { blockhash: string; lastValidBlockHeight: number } } }>();
  if (!j.result) return c.json({ error: 'RPC_UNAVAILABLE' }, 503);
  return c.json(j.result.value, 200, { 'cache-control': 'no-store' });
});
