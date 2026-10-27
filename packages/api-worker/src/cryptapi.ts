import { Hono } from 'hono';
import type { AppEnv } from './env';
import { grantPlan, PLANS, walletId, type PlanId } from './api-keys';
import { hmac, hmacOk, ipLimited, readSession, sameOrigin } from './auth';

export const cryptapi = new Hono<AppEnv>();

// Stablecoins only: the plan price is in USD, so the received amount can be checked 1:1.
const SUPPORTED: Record<string, { ticker: string; network: string; walletKey: 'MERCHANT_PAYOUT_ADDRESS_SOL' | 'MERCHANT_PAYOUT_ADDRESS_EVM' }> = {
  'polygon-usdc': { ticker: 'polygon/usdc', network: 'polygon', walletKey: 'MERCHANT_PAYOUT_ADDRESS_EVM' },
  'polygon-usdt': { ticker: 'polygon/usdt', network: 'polygon', walletKey: 'MERCHANT_PAYOUT_ADDRESS_EVM' },
  'bep20-usdc': { ticker: 'bep20/usdc', network: 'bsc', walletKey: 'MERCHANT_PAYOUT_ADDRESS_EVM' },
  'bep20-usdt': { ticker: 'bep20/usdt', network: 'bsc', walletKey: 'MERCHANT_PAYOUT_ADDRESS_EVM' },
  'sol-usdc': { ticker: 'sol/usdc', network: 'solana', walletKey: 'MERCHANT_PAYOUT_ADDRESS_SOL' },
};

interface CryptAPICreateResponse {
  status: string;
  address_in: string;
  address_out: string;
  callback_url: string;
  minimum_transaction_coin: string;
  priority: string;
}

let tableReady: Promise<unknown> | null = null;
const ensureTable = (db: D1Database) =>
  (tableReady ??= db
    .prepare(
      `CREATE TABLE IF NOT EXISTS cryptapi_orders (
        pid TEXT PRIMARY KEY,
        wallet TEXT NOT NULL,
        address_in TEXT UNIQUE NOT NULL,
        coin TEXT NOT NULL,
        network TEXT NOT NULL,
        plan TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        value_coin TEXT,
        confirmations INTEGER DEFAULT 0,
        txid_in TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT
      )`,
    )
    .run()
    .catch((err) => {
      tableReady = null;
      throw err;
    }));

const callbackToken = (secret: string, pid: string) => hmac(secret, `cryptapi:${pid}`);

cryptapi.use('/app/payment/*', async (c, next) => {
  await ensureTable(c.env.SALES);
  await next();
});

// POST /app/payment/create — deposit address for a plan, tied to the signed-in wallet
cryptapi.post('/app/payment/create', async (c) => {
  if (!sameOrigin(c)) return c.json({ error: 'FORBIDDEN' }, 403);
  const secret = c.env.SESSION_SECRET;
  if (!secret) return c.json({ error: 'DISABLED' }, 503);
  const s = await readSession(c);
  if (!s || !s.address || s.chain === 'google') return c.json({ error: 'SIGN_IN_REQUIRED', message: 'Sign in with the wallet that should get the plan' }, 401);
  if (await ipLimited(c, 'paycreate', 5)) return c.json({ error: 'RATE_LIMITED' }, 429);
  const body = await c.req.json<{ coin?: string; plan?: string }>().catch(() => null);
  const entry = body?.coin ? SUPPORTED[body.coin] : undefined;
  if (!entry) return c.json({ error: 'UNSUPPORTED_COIN', supported: Object.keys(SUPPORTED) }, 400);
  const planId = body?.plan as PlanId;
  if (planId !== 'pro' && planId !== 'desk') return c.json({ error: 'BAD_PLAN', message: 'plan must be pro or desk' }, 400);

  const pid = [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('');
  const callback = `${new URL(c.req.url).origin}/app/payment/callback?pid=${pid}&t=${await callbackToken(secret, pid)}`;
  const params = new URLSearchParams({ address: c.env[entry.walletKey], callback, pending: '1' });
  const res = await fetch(`https://api.cryptapi.io/${entry.ticker}/create/?${params}`, { signal: AbortSignal.timeout(10_000) });
  const data = (await res.json().catch(() => ({}))) as Partial<CryptAPICreateResponse>;
  if (data.status !== 'success' || !data.address_in) return c.json({ error: 'CRYPTAPI_ERROR' }, 502);

  await c.env.SALES.prepare(
    `INSERT INTO cryptapi_orders (pid, wallet, address_in, coin, network, plan, status, created_at) VALUES (?, ?, ?, ?, ?, ?, 'pending', datetime('now'))`,
  )
    .bind(pid, walletId(s.address), data.address_in, body!.coin, entry.network, planId)
    .run();

  return c.json({ address: data.address_in, coin: body!.coin, network: entry.network, minimum: data.minimum_transaction_coin, plan: planId, amount: PLANS[planId].priceUsdc });
});

// GET /app/payment/callback — CryptAPI calls this; only URLs we signed are accepted
cryptapi.get('/app/payment/callback', async (c) => {
  const q = c.req.query();
  const secret = c.env.SESSION_SECRET;
  const pid = q.pid ?? '';
  if (!secret || !pid || !q.t || !(await hmacOk(secret, `cryptapi:${pid}`, q.t))) return c.text('forbidden', 403);
  const order = await c.env.SALES.prepare('SELECT * FROM cryptapi_orders WHERE pid = ?').bind(pid).first<{ wallet: string; address_in: string; network: string; plan: PlanId; status: string }>();
  if (!order || (q.address_in && q.address_in !== order.address_in)) return c.text('*ok*', 200);
  if (order.status === 'confirmed') return c.text('*ok*', 200);

  const txidIn = q.txid_in ?? '';
  const valueCoin = parseFloat(q.value_coin ?? '0') || 0;
  const confirmations = parseInt(q.confirmations ?? '0', 10) || 0;
  const confirmed = q.pending !== '1' && confirmations >= 1 && !!txidIn;
  const paidEnough = valueCoin >= PLANS[order.plan].priceUsdc;
  const status = confirmed ? (paidEnough ? 'confirmed' : 'underpaid') : 'pending_mempool';

  await c.env.SALES.prepare(`UPDATE cryptapi_orders SET status = ?, txid_in = ?, value_coin = ?, confirmations = ?, updated_at = datetime('now') WHERE pid = ?`)
    .bind(status, txidIn, String(valueCoin), confirmations, pid)
    .run();

  if (status === 'confirmed') {
    const units = Math.round(valueCoin * 1e6);
    const granted = await grantPlan(c.env.SALES, order.wallet, order.plan, order.network, `cryptapi:${txidIn}`, units);
    if (granted) {
      await c.env.SALES.prepare('INSERT OR IGNORE INTO sales (ts, route, network, amount_units, payer, reference) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(new Date().toISOString(), `plan_${order.plan}`, order.network, units, order.wallet, `cryptapi:${txidIn}`)
        .run()
        .catch(() => {});
    }
  }
  return c.text('*ok*', 200);
});

// GET /app/payment/status/:address — status of one deposit address (no wallet or tx details)
cryptapi.get('/app/payment/status/:address', async (c) => {
  const row = await c.env.SALES.prepare('SELECT coin, network, plan, status, confirmations FROM cryptapi_orders WHERE address_in = ?')
    .bind(c.req.param('address'))
    .first();
  if (!row) return c.json({ error: 'NOT_FOUND' }, 404);
  return c.json(row);
});

// GET /app/payment/coins — list supported coins
cryptapi.get('/app/payment/coins', (c) => {
  return c.json(
    Object.entries(SUPPORTED).map(([id, s]) => ({ id, network: s.network })),
  );
});
