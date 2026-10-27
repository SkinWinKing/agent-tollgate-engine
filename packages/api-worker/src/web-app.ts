import { ALL_ROUTES, EVM_ADDRESS, jsonRpc, loadConfig, SOLANA_ADDRESS, unitsToUsdc } from '@tollgate/core';
import { loadRouterConfig, quoteAndBuild, RouterError } from '@tollgate/omni-router';
import { Hono } from 'hono';
import { ipLimited, readSession, sameOrigin } from './auth';
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
      "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self' https://api.mainnet-beta.solana.com; frame-ancestors 'none'; base-uri 'none'",
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

webApp.get('/app/events', async (c) => {
  const since = Number(c.req.query('since') ?? 0) || 0;
  const stub = c.env.NONCE_STORE.get(c.env.NONCE_STORE.idFromName('global'));
  return c.json({ now: Date.now(), events: await stub.recentEvents(since) }, 200, { 'cache-control': 'no-store' });
});

// Entropy for the quantum field view: ANU quantum RNG when reachable, otherwise the drand public beacon (labelled as such).
webApp.get('/app/quantum', async (c) => {
  const cache = c.env.CACHE;
  const hit = await cache.get('quantum:pool', 'json').catch(() => null);
  if (hit) return c.json(hit, 200, { 'cache-control': 'no-store' });
  let out: Record<string, unknown> | null = null;
  try {
    const r = await fetch('https://qrng.anu.edu.au/API/jsonI.php?length=64&type=uint8', { signal: AbortSignal.timeout(6000) });
    const d = (await r.json()) as { success?: boolean; data?: number[] };
    if (d.success && d.data?.length) out = { source: 'ANU QRNG (vacuum fluctuations)', quantum: true, bytes: d.data, fetchedAt: new Date().toISOString() };
  } catch {
    // fall through to drand
  }
  if (!out) {
    try {
      const d = (await (await fetch('https://api.drand.sh/public/latest', { signal: AbortSignal.timeout(6000) })).json()) as { round: number; randomness: string };
      out = { source: 'drand League of Entropy beacon (classical, publicly verifiable)', quantum: false, round: d.round, bytes: d.randomness.match(/../g)!.map((h) => parseInt(h, 16)), fetchedAt: new Date().toISOString() };
    } catch {
      out = { source: 'unavailable', quantum: false, bytes: [] };
    }
  }
  await cache.put('quantum:pool', JSON.stringify(out), { expirationTtl: 120 }).catch(() => {});
  return c.json(out, 200, { 'cache-control': 'no-store' });
});

webApp.get('/app/market', async (c) => {
  const env = toolEnv(c);
  const [fng, space, prices] = await Promise.all([
    TOOL_HANDLERS.fear_greed!(new URLSearchParams({ days: '7' }), env).catch(() => null),
    TOOL_HANDLERS.space_weather!(new URLSearchParams(), env).catch(() => null),
    TOOL_HANDLERS.crypto_price!(new URLSearchParams({ symbols: 'BTC,ETH,SOL,BNB,XRP,DOGE' }), env).catch(() => null),
  ]);
  return c.json({ fearGreed: fng, prices: prices?.prices ?? [], spaceWeather: space }, 200, { 'cache-control': 'public, max-age=60' });
});

webApp.get('/app/catalog', (c) =>
  c.json(
    ALL_ROUTES.map((r) => ({ id: r.id, method: r.method, path: r.path, price: r.priceUnits === null ? 'free' : `${unitsToUsdc(r.priceUnits)} USDC`, summary: r.summary })),
    200,
    { 'cache-control': 'public, max-age=300' },
  ),
);

webApp.get('/app/decimals', async (c) => {
  if (await ipLimited(c, 'decimals', 30)) return c.json({ error: 'RATE_LIMITED' }, 429);
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
webApp.get('/app/profile', async (c) => {
  const session = await readSession(c);
  if (!session) return c.json({ error: 'NOT_SIGNED_IN' }, 401);
  if (!session.email) return c.json({ address: session.address, chain: session.chain });
  const user = await c.env.SALES.prepare('SELECT email, name, picture, wallet_sol, wallet_evm FROM users WHERE email = ?').bind(session.email).first();
  return user ? c.json(user) : c.json({ email: session.email, name: session.name });
});

webApp.post('/app/profile', async (c) => {
  if (!sameOrigin(c)) return c.json({ error: 'FORBIDDEN' }, 403);
  const session = await readSession(c);
  if (!session || !session.email) return c.json({ error: 'NOT_SIGNED_IN' }, 401);
  const body = await c.req.json<{ wallet_sol?: string; wallet_evm?: string }>().catch(() => null);
  if (!body) return c.json({ error: 'INVALID_REQUEST' }, 400);
  if (body.wallet_sol && !SOLANA_ADDRESS.test(body.wallet_sol)) return c.json({ error: 'INVALID_SOL_ADDRESS' }, 400);
  if (body.wallet_evm && !EVM_ADDRESS.test(body.wallet_evm)) return c.json({ error: 'INVALID_EVM_ADDRESS' }, 400);
  const sets: string[] = [];
  const vals: string[] = [];
  if (body.wallet_sol !== undefined) { sets.push('wallet_sol = ?'); vals.push(body.wallet_sol || ''); }
  if (body.wallet_evm !== undefined) { sets.push('wallet_evm = ?'); vals.push(body.wallet_evm || ''); }
  if (!sets.length) return c.json({ error: 'NOTHING_TO_UPDATE' }, 400);
  sets.push("updated_at = datetime('now')");
  await c.env.SALES.prepare(`UPDATE users SET ${sets.join(', ')} WHERE email = ?`).bind(...vals, session.email).run();
  return c.json({ ok: true });
});

webApp.post('/app/quote', async (c) => {
  if (!sameOrigin(c)) return c.json({ error: 'FORBIDDEN' }, 403);
  const session = await readSession(c);
  if (!session) return c.json({ error: 'NOT_SIGNED_IN', message: 'Connect and sign in with your wallet first' }, 401);
  let userAddress = session.address;
  let userChain = session.chain;
  if (session.chain === 'google' && session.email) {
    const user = await c.env.SALES.prepare('SELECT wallet_sol, wallet_evm FROM users WHERE email = ?').bind(session.email).first<{ wallet_sol: string | null; wallet_evm: string | null }>();
    if (user?.wallet_sol) { userAddress = user.wallet_sol; userChain = 'solana'; }
    else if (user?.wallet_evm) { userAddress = user.wallet_evm; userChain = 'evm'; }
    else return c.json({ error: 'NO_WALLET', message: 'Add a wallet address in your profile before trading' }, 400);
  }
  const stub = c.env.NONCE_STORE.get(c.env.NONCE_STORE.idFromName('global'));
  if (!(await stub.hit(`rl:appquote:${userAddress}:${Math.floor(Date.now() / 60_000)}`, QUOTES_PER_MINUTE, 120))) {
    return c.json({ error: 'RATE_LIMITED', message: `Limit is ${QUOTES_PER_MINUTE} quotes per minute` }, 429);
  }
  const body = await c.req.json<Record<string, unknown>>().catch(() => null);
  if (!body) return c.json({ error: 'INVALID_REQUEST' }, 400);
  const fromChain = String(body.fromChain ?? '');
  const familyOk = userChain === 'solana' ? SOLANA_CHAINS.has(fromChain) : EVM_CHAINS.has(fromChain);
  if (!familyOk) return c.json({ error: 'CHAIN_MISMATCH', message: `Signed in with a ${userChain} wallet; pick a matching source chain` }, 400);
  try {
    const quote = await quoteAndBuild(loadRouterConfig(c.env as unknown as Record<string, unknown>), { ...body, userAddress, destinationAddress: body.destinationAddress ?? userAddress });
    const outputMint = quote.route === 'jupiter' ? String(quote.quote.outputMint ?? '') : '';
    const outputTokenRisk = outputMint ? await quickRisk(toolEnv(c).solanaRpcUrl, outputMint) : undefined;
    c.executionCtx.waitUntil(stub.bump(`stat:${new Date().toISOString().slice(0, 10)}:appquote:${quote.route}`, 60 * 86_400).catch(() => {}));
    return c.json({ ...quote, ...(outputTokenRisk ? { outputTokenRisk } : {}) }, 200, { 'cache-control': 'no-store' });
  } catch (err) {
    if (err instanceof RouterError) return c.json({ error: err.code, message: err.message }, err.status as 400);
    throw err;
  }
});
