import { SOLANA_ADDRESS } from '@tollgate/core';
import { Hono } from 'hono';
import type { AppEnv } from './env';

/**
 * Spot trading terminal data for Solana tokens: market list (DEX Screener), candles and recent trades (GeckoTerminal).
 * Orders execute through the existing Jupiter swap with the 0.3% platform fee; no deposits or third-party accounts.
 */
export const trade = new Hono<AppEnv>();

const memo = new Map<string, { exp: number; value: unknown }>();
async function getCached<T>(url: string, ttlMs: number): Promise<T> {
  const hit = memo.get(url);
  if (hit && hit.exp > Date.now()) return hit.value as T;
  const res = await fetch(url, { headers: { accept: 'application/json', 'user-agent': 'AgentTollgate/1.0 (+https://skinwinking.com)' }, signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`Upstream HTTP ${res.status}`);
  const value = (await res.json()) as T;
  memo.set(url, { exp: Date.now() + ttlMs, value });
  if (memo.size > 300) for (const [k, v] of memo) if (v.exp < Date.now()) memo.delete(k);
  return value;
}

const MARKETS = [
  'So11111111111111111111111111111111111111112', 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN', 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
  'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm', 'jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL', 'HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3',
  '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R', 'orcaEKTdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE', '7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr',
  '6p6xgHyF7AeE6TZkSmFsko444wqoP15icUSqi2jfGiPN', 'rndrizKT3MK1iimdxRdWabcF7Zg7AR5T4nud4EkHBof', '2zMMhcVQEXDtdE6vsFS7S7D5oUodfJHE8vd1gnBouauv',
  'MEW1gQWJ3nEXg2qgERiKu7FAFj79PHvQVREQUzScPP5', 'hntyVP6YFm1Hg25TN9WGLqM12b8TQmcknKrdu1oxWux', '85VBFQZC9TZkfaptBWjvUw7YbZjy52A6mjtPGjstQAmQ',
];
const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

interface Pair { chainId: string; pairAddress: string; baseToken: { address: string; symbol: string; name: string }; quoteToken: { symbol: string }; priceUsd?: string; priceChange?: Record<string, number>; liquidity?: { usd?: number }; volume?: Record<string, number>; marketCap?: number; fdv?: number; txns?: Record<string, { buys: number; sells: number }>; info?: { imageUrl?: string } }

function best(pairs: Pair[]) {
  const byToken = new Map<string, Pair>();
  for (const p of pairs) {
    if (p.chainId !== 'solana' || p.baseToken.address === USDC) continue;
    const cur = byToken.get(p.baseToken.address);
    if (!cur || (p.liquidity?.usd ?? 0) > (cur.liquidity?.usd ?? 0)) byToken.set(p.baseToken.address, p);
  }
  return [...byToken.values()].map((p) => ({
    mint: p.baseToken.address, symbol: p.baseToken.symbol, name: p.baseToken.name, pool: p.pairAddress, quote: p.quoteToken.symbol,
    price: Number(p.priceUsd ?? 0), change24hPct: p.priceChange?.h24 ?? 0, change1hPct: p.priceChange?.h1 ?? 0,
    liquidityUsd: Math.round(p.liquidity?.usd ?? 0), volume24hUsd: Math.round(p.volume?.h24 ?? 0), marketCap: p.marketCap ?? p.fdv ?? null,
    buys24h: p.txns?.h24?.buys ?? 0, sells24h: p.txns?.h24?.sells ?? 0, image: p.info?.imageUrl ?? null,
  }));
}

trade.get('/app/spot/markets', async (c) => {
  const q = (c.req.query('q') ?? '').trim().slice(0, 64);
  if (q) {
    const d = await getCached<{ pairs: Pair[] | null }>(`https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(q)}`, 30_000);
    return c.json({ markets: best(d.pairs ?? []).sort((a, b) => b.liquidityUsd - a.liquidityUsd).slice(0, 30) }, 200, { 'cache-control': 'public, max-age=30' });
  }
  const pairs = await getCached<Pair[]>(`https://api.dexscreener.com/tokens/v1/solana/${MARKETS.join(',')}`, 15_000);
  return c.json({ markets: best(pairs).sort((a, b) => b.volume24hUsd - a.volume24hUsd) }, 200, { 'cache-control': 'public, max-age=15' });
});

const TF: Record<string, [string, number]> = { '1m': ['minute', 1], '5m': ['minute', 5], '15m': ['minute', 15], '1h': ['hour', 1], '4h': ['hour', 4], '1d': ['day', 1] };

trade.get('/app/spot/candles', async (c) => {
  const pool = c.req.query('pool') ?? '';
  const tf = TF[c.req.query('tf') ?? '15m'];
  if (!SOLANA_ADDRESS.test(pool) || !tf) return c.json({ error: 'INVALID_REQUEST' }, 400);
  const d = await getCached<{ data: { attributes: { ohlcv_list: number[][] } } }>(`https://api.geckoterminal.com/api/v2/networks/solana/pools/${pool}/ohlcv/${tf[0]}?aggregate=${tf[1]}&limit=300&currency=usd`, 15_000);
  const rows = d.data.attributes.ohlcv_list.map(([t, o, h, l, cl, v]) => ({ time: t!, open: o!, high: h!, low: l!, close: cl!, volume: v! })).sort((a, b) => a.time - b.time);
  return c.json(rows, 200, { 'cache-control': 'public, max-age=15' });
});

trade.get('/app/spot/trades', async (c) => {
  const pool = c.req.query('pool') ?? '';
  if (!SOLANA_ADDRESS.test(pool)) return c.json({ error: 'INVALID_REQUEST' }, 400);
  type T = { data: { attributes: { kind: string; volume_in_usd: string; price_from_in_usd: string; price_to_in_usd: string; block_timestamp: string; tx_hash: string } }[] };
  const d = await getCached<T>(`https://api.geckoterminal.com/api/v2/networks/solana/pools/${pool}/trades`, 8_000);
  const trades = d.data.slice(0, 30).map(({ attributes: a }) => ({ side: a.kind, usd: Number(a.volume_in_usd), price: Number(a.kind === 'sell' ? a.price_from_in_usd : a.price_to_in_usd), time: a.block_timestamp, tx: a.tx_hash }));
  return c.json({ trades }, 200, { 'cache-control': 'public, max-age=8' });
});
