import { ALL_ROUTES, EVM_ADDRESS, jsonRpc, loadConfig, SOLANA_ADDRESS, unitsToUsdc } from '@tollgate/core';
import { loadRouterConfig, quoteAndBuild, RouterError } from '@tollgate/omni-router';
import { Hono } from 'hono';
import { readSession, sameOrigin } from './auth';
import type { AppEnv } from './env';
import { quickRisk, TOOL_HANDLERS } from './routes';
import { EVM_RPCS, rpcAny } from './services/data-tools';
import { APP_HTML } from './web-app-html';

/** Human-facing web app: live dashboard, wallet sign-in and a non-custodial swap that carries the platform fee. */
export const webApp = new Hono<AppEnv>();

const QUOTES_PER_MINUTE = 20;
const SOLANA_CHAINS = new Set(['solana']);
const EVM_CHAINS = new Set(['ethereum', 'base', 'polygon', 'arbitrum']);

const toolEnv = (c: { env: AppEnv['Bindings'] }) => ({
  ...loadConfig(c.env as unknown as Record<string, unknown>),
  ai: c.env.AI,
  cache: c.env.CACHE,
  intel: { account: c.env.CF_ACCOUNT_ID ?? '', token: c.env.CF_INTEL_TOKEN ?? '' },
  browserToken: c.env.CF_BROWSER_TOKEN,
});

export const serveApp = (c: { body: (b: string, s: 200, h: Record<string, string>) => Response }) =>
  c.body(APP_HTML, 200, {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'public, max-age=300',
    'content-security-policy':
      "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' https://api.mainnet-beta.solana.com; frame-ancestors 'none'; base-uri 'none'",
    'x-frame-options': 'DENY',
    'referrer-policy': 'strict-origin-when-cross-origin',
  });

webApp.get('/app', (c) => serveApp(c));

// Public, aggregated activity: no wallets or IPs.
webApp.get('/app/stats', async (c) => {
  const stub = c.env.NONCE_STORE.get(c.env.NONCE_STORE.idFromName('global'));
  const [counters, paid] = await Promise.all([
    stub.stats('stat:'),
    c.env.SALES.prepare('SELECT COUNT(*) AS calls, COALESCE(SUM(amount_units), 0) / 1e6 AS usdc FROM sales').first<{ calls: number; usdc: number }>(),
  ]);
  const today = new Date().toISOString().slice(0, 10);
  const byTool = new Map<string, number>();
  const daily = new Map<string, number>();
  let requestsToday = 0;
  let requests7d = 0;
  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);
  for (const [key, n] of Object.entries(counters)) {
    const [date, kind, tool] = key.replace(/^stat:/, '').split(':');
    if (!date || !kind || (kind !== '402' && kind !== 'paid' && kind !== 'free')) continue;
    if (date >= weekAgo) {
      requests7d += n;
      daily.set(date, (daily.get(date) ?? 0) + n);
    }
    if (date === today) {
      requestsToday += n;
      if (tool) byTool.set(tool, (byTool.get(tool) ?? 0) + n);
    }
  }
  return c.json(
    {
      tools: ALL_ROUTES.length,
      requestsToday,
      requests7d,
      paidCalls: paid?.calls ?? 0,
      paidUsdc: paid?.usdc ?? 0,
      daily: [...daily.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([date, requests]) => ({ date, requests })),
      topToolsToday: [...byTool.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([tool, calls]) => ({ tool, calls })),
      asOf: new Date().toISOString(),
    },
    200,
    { 'cache-control': 'public, max-age=30' },
  );
});

webApp.get('/app/market', async (c) => {
  const env = toolEnv(c);
  const [fng, prices] = await Promise.all([
    TOOL_HANDLERS.fear_greed!(new URLSearchParams({ days: '7' }), env).catch(() => null),
    TOOL_HANDLERS.crypto_price!(new URLSearchParams({ symbols: 'BTC,ETH,SOL,BNB,XRP,DOGE' }), env).catch(() => null),
  ]);
  return c.json({ fearGreed: fng, prices: prices?.prices ?? [] }, 200, { 'cache-control': 'public, max-age=60' });
});

webApp.get('/app/catalog', (c) =>
  c.json(
    ALL_ROUTES.map((r) => ({ id: r.id, method: r.method, path: r.path, price: r.priceUnits === null ? 'free' : `${unitsToUsdc(r.priceUnits)} USDC`, summary: r.summary })),
    200,
    { 'cache-control': 'public, max-age=300' },
  ),
);

webApp.get('/app/decimals', async (c) => {
  const chain = c.req.query('chain') ?? '';
  const token = c.req.query('token') ?? '';
  const env = toolEnv(c);
  try {
    if (chain === 'solana' && SOLANA_ADDRESS.test(token)) {
      const r = await jsonRpc<{ value: { decimals: number } }>(env.solanaRpcUrl, 'getTokenSupply', [token]);
      return c.json({ decimals: r.value.decimals });
    }
    if (EVM_CHAINS.has(chain) && EVM_ADDRESS.test(token)) {
      const urls = chain === 'polygon' ? [env.evmRpcUrl, ...EVM_RPCS.polygon!] : EVM_RPCS[chain]!;
      const r = await rpcAny<string>(urls, 'eth_call', [{ to: token, data: '0x313ce567' }, 'latest']);
      return c.json({ decimals: Number(BigInt(r)) });
    }
  } catch {
    return c.json({ error: 'TOKEN_NOT_FOUND' }, 404);
  }
  return c.json({ error: 'INVALID_REQUEST' }, 400);
});

// Signed-in wallets get swap quotes free; the platform fee inside the built transaction is the revenue.
webApp.post('/app/quote', async (c) => {
  if (!sameOrigin(c)) return c.json({ error: 'FORBIDDEN' }, 403);
  const session = await readSession(c);
  if (!session) return c.json({ error: 'NOT_SIGNED_IN', message: 'Connect and sign in with your wallet first' }, 401);
  const stub = c.env.NONCE_STORE.get(c.env.NONCE_STORE.idFromName('global'));
  if (!(await stub.hit(`rl:appquote:${session.address}:${Math.floor(Date.now() / 60_000)}`, QUOTES_PER_MINUTE, 120))) {
    return c.json({ error: 'RATE_LIMITED', message: `Limit is ${QUOTES_PER_MINUTE} quotes per minute` }, 429);
  }
  const body = await c.req.json<Record<string, unknown>>().catch(() => null);
  if (!body) return c.json({ error: 'INVALID_REQUEST' }, 400);
  const fromChain = String(body.fromChain ?? '');
  const familyOk = session.chain === 'solana' ? SOLANA_CHAINS.has(fromChain) : EVM_CHAINS.has(fromChain);
  if (!familyOk) return c.json({ error: 'CHAIN_MISMATCH', message: `Signed in with a ${session.chain} wallet; pick a matching source chain` }, 400);
  try {
    // The signer is always the signed-in wallet, so quotes cannot be built for someone else.
    const quote = await quoteAndBuild(loadRouterConfig(c.env as unknown as Record<string, unknown>), { ...body, userAddress: session.address, destinationAddress: body.destinationAddress ?? session.address });
    const outputMint = quote.route === 'jupiter' ? String(quote.quote.outputMint ?? '') : '';
    const outputTokenRisk = outputMint ? await quickRisk(toolEnv(c).solanaRpcUrl, outputMint) : undefined;
    c.executionCtx.waitUntil(stub.bump(`stat:${new Date().toISOString().slice(0, 10)}:appquote:${quote.route}`, 60 * 86_400).catch(() => {}));
    return c.json({ ...quote, ...(outputTokenRisk ? { outputTokenRisk } : {}) }, 200, { 'cache-control': 'no-store' });
  } catch (err) {
    if (err instanceof RouterError) return c.json({ error: err.code, message: err.message }, err.status as 400);
    throw err;
  }
});
