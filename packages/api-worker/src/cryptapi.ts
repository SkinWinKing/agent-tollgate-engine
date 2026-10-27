import { Hono } from 'hono';
import type { AppEnv } from './env';

export const cryptapi = new Hono<AppEnv>();

const SUPPORTED: Record<string, { ticker: string; network: string; walletKey: 'MERCHANT_PAYOUT_ADDRESS_SOL' | 'MERCHANT_PAYOUT_ADDRESS_EVM' }> = {
  'polygon-usdc': { ticker: 'polygon/usdc', network: 'polygon', walletKey: 'MERCHANT_PAYOUT_ADDRESS_EVM' },
  'polygon-usdt': { ticker: 'polygon/usdt', network: 'polygon', walletKey: 'MERCHANT_PAYOUT_ADDRESS_EVM' },
  'bep20-usdc': { ticker: 'bep20/usdc', network: 'bsc', walletKey: 'MERCHANT_PAYOUT_ADDRESS_EVM' },
  'bep20-usdt': { ticker: 'bep20/usdt', network: 'bsc', walletKey: 'MERCHANT_PAYOUT_ADDRESS_EVM' },
  'sol-usdc': { ticker: 'sol/usdc', network: 'solana', walletKey: 'MERCHANT_PAYOUT_ADDRESS_SOL' },
  'btc': { ticker: 'btc', network: 'bitcoin', walletKey: 'MERCHANT_PAYOUT_ADDRESS_EVM' },
  'eth': { ticker: 'eth', network: 'ethereum', walletKey: 'MERCHANT_PAYOUT_ADDRESS_EVM' },
  'ltc': { ticker: 'ltc', network: 'litecoin', walletKey: 'MERCHANT_PAYOUT_ADDRESS_EVM' },
};

interface CryptAPICreateResponse {
  status: string;
  address_in: string;
  address_out: string;
  callback_url: string;
  minimum_transaction_coin: string;
  priority: string;
}

interface CryptAPICallback {
  uuid: string;
  coin: string;
  value_coin: string;
  value_forwarded_coin: string;
  fee_coin: string;
  txid_in: string;
  txid_out?: string;
  confirmations: string;
  pending?: string;
}

async function ensureTable(db: D1Database) {
  await db
    .prepare(
      `CREATE TABLE IF NOT EXISTS cryptapi_payments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        address_in TEXT UNIQUE NOT NULL,
        address_out TEXT NOT NULL,
        coin TEXT NOT NULL,
        network TEXT NOT NULL,
        plan TEXT,
        amount REAL,
        status TEXT NOT NULL DEFAULT 'pending',
        value_coin TEXT,
        value_forwarded TEXT,
        fee_coin TEXT,
        confirmations INTEGER DEFAULT 0,
        txid_in TEXT,
        txid_out TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT
      )`,
    )
    .run();
}

cryptapi.use('/app/payment/*', async (c, next) => {
  await ensureTable(c.env.SALES);
  await next();
});

// POST /app/payment/create — generate a CryptAPI deposit address for a plan or top-up
cryptapi.post('/app/payment/create', async (c) => {
  const body = await c.req.json<{ coin: string; plan?: string; amount?: number }>().catch(() => null);
  if (!body?.coin) return c.json({ error: 'MISSING_COIN', supported: Object.keys(SUPPORTED) }, 400);

  const entry = SUPPORTED[body.coin];
  if (!entry) return c.json({ error: 'UNSUPPORTED_COIN', supported: Object.keys(SUPPORTED) }, 400);

  const wallet = c.env[entry.walletKey];
  const origin = new URL(c.req.url).origin;
  const callbackUrl = `${origin}/app/payment/callback`;

  const params = new URLSearchParams({
    address: wallet,
    callback: callbackUrl,
    pending: '1',
  });

  const res = await fetch(`https://api.cryptapi.io/${entry.ticker}/create/?${params}`, {
    signal: AbortSignal.timeout(10_000),
  });
  const data = await res.json() as CryptAPICreateResponse;

  if (data.status !== 'success') return c.json({ error: 'CRYPTAPI_ERROR', detail: data }, 502);

  // Store pending payment in D1
  await c.env.SALES.prepare(
    `INSERT INTO cryptapi_payments (address_in, address_out, coin, network, plan, amount, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 'pending', datetime('now'))`,
  )
    .bind(data.address_in, data.address_out, body.coin, entry.network, body.plan ?? null, body.amount ?? null)
    .run();

  return c.json({
    address: data.address_in,
    coin: body.coin,
    network: entry.network,
    minimum: data.minimum_transaction_coin,
    plan: body.plan ?? null,
  });
});

// GET /app/payment/callback — CryptAPI calls this when payment arrives
cryptapi.get('/app/payment/callback', async (c) => {
  const q = c.req.query();
  const uuid = q.uuid ?? '';
  const coin = q.coin ?? '';
  const valueCoin = q.value_coin ?? '0';
  const valueForwarded = q.value_forwarded_coin ?? '0';
  const feeCoin = q.fee_coin ?? '0';
  const txidIn = q.txid_in ?? '';
  const txidOut = q.txid_out ?? '';
  const confirmations = parseInt(q.confirmations ?? '0', 10);
  const pending = q.pending === '1';
  const addressIn = q.address_in ?? '';

  if (!txidIn || !addressIn) return c.text('*ok*', 200);

  // Update payment record
  await c.env.SALES.prepare(
    `UPDATE cryptapi_payments SET status = ?, txid_in = ?, txid_out = ?, value_coin = ?, value_forwarded = ?,
     fee_coin = ?, confirmations = ?, updated_at = datetime('now')
     WHERE address_in = ? AND status != 'confirmed'`,
  )
    .bind(
      pending ? 'pending_mempool' : confirmations >= 1 ? 'confirmed' : 'seen',
      txidIn, txidOut, valueCoin, valueForwarded, feeCoin, confirmations, addressIn,
    )
    .run();

  // If confirmed, record sale
  if (!pending && confirmations >= 1) {
    const payment = await c.env.SALES.prepare('SELECT * FROM cryptapi_payments WHERE address_in = ?').bind(addressIn).first();
    if (payment?.plan) {
      await c.env.SALES.prepare(
        `INSERT INTO sales (ts, route, network, amount_units, payer, reference)
         VALUES (datetime('now'), ?, ?, ?, ?, ?)`,
      )
        .bind(`plan:${payment.plan}`, payment.network, Math.round(parseFloat(valueCoin) * 1e6), addressIn, txidIn)
        .run();
    }
  }

  return c.text('*ok*', 200);
});

// GET /app/payment/status/:address — check payment status
cryptapi.get('/app/payment/status/:address', async (c) => {
  const address = c.req.param('address');
  const row = await c.env.SALES.prepare(
    'SELECT address_in, coin, network, plan, amount, status, value_coin, confirmations, txid_in, created_at, updated_at FROM cryptapi_payments WHERE address_in = ?',
  )
    .bind(address)
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
