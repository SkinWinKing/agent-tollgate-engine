import { Hono } from 'hono';
import type { AppEnv } from './env';

/** Live Hyperliquid market data for the trading page, proxied with a short in-isolate cache. */
export const trade = new Hono<AppEnv>();

const HL = 'https://api.hyperliquid.xyz/info';
const memo = new Map<string, { exp: number; value: unknown }>();

async function hl<T>(body: Record<string, unknown>, ttlMs: number): Promise<T> {
  const key = JSON.stringify(body);
  const hit = memo.get(key);
  if (hit && hit.exp > Date.now()) return hit.value as T;
  const res = await fetch(HL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: key, signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`Hyperliquid HTTP ${res.status}`);
  const value = (await res.json()) as T;
  memo.set(key, { exp: Date.now() + ttlMs, value });
  if (memo.size > 400) for (const [k, v] of memo) if (v.exp < Date.now()) memo.delete(k);
  return value;
}

const COIN = /^[A-Za-z0-9]{1,20}$/;
const INTERVAL_MS: Record<string, number> = { '1m': 60e3, '5m': 300e3, '15m': 900e3, '1h': 3600e3, '4h': 14400e3, '1d': 86400e3 };

trade.get('/app/hl/markets', async (c) => {
  type Meta = { universe: { name: string; maxLeverage: number; szDecimals: number; isDelisted?: boolean }[] };
  type Ctx = { markPx: string; funding: string; openInterest: string; dayNtlVlm: string; prevDayPx: string; oraclePx: string };
  const [meta, ctxs] = await hl<[Meta, Ctx[]]>({ type: 'metaAndAssetCtxs' }, 5000);
  const markets = meta.universe
    .map((u, i) => {
      const x = ctxs[i]!;
      const mark = Number(x.markPx), prev = Number(x.prevDayPx);
      return { coin: u.name, maxLeverage: u.maxLeverage, szDecimals: u.szDecimals, delisted: !!u.isDelisted, mark, change24hPct: prev ? Number((((mark - prev) / prev) * 100).toFixed(2)) : 0, fundingHourlyPct: Number((Number(x.funding) * 100).toFixed(5)), openInterestUsd: Math.round(Number(x.openInterest) * mark), volume24hUsd: Math.round(Number(x.dayNtlVlm)) };
    })
    .filter((m) => !m.delisted)
    .sort((a, b) => b.volume24hUsd - a.volume24hUsd);
  return c.json({ markets, asOf: Date.now() }, 200, { 'cache-control': 'public, max-age=5' });
});

trade.get('/app/hl/candles', async (c) => {
  const coin = c.req.query('coin') ?? 'BTC';
  const interval = c.req.query('interval') ?? '15m';
  if (!COIN.test(coin) || !INTERVAL_MS[interval]) return c.json({ error: 'INVALID_REQUEST' }, 400);
  const startTime = Date.now() - INTERVAL_MS[interval]! * 300;
  type K = { t: number; o: string; h: string; l: string; c: string; v: string }[];
  const rows = await hl<K>({ type: 'candleSnapshot', req: { coin, interval, startTime } }, interval === '1m' ? 4000 : 10000);
  return c.json(rows.map((k) => ({ time: Math.floor(k.t / 1000), open: +k.o, high: +k.h, low: +k.l, close: +k.c, volume: +k.v })), 200, { 'cache-control': 'public, max-age=4' });
});

trade.get('/app/hl/book', async (c) => {
  const coin = c.req.query('coin') ?? 'BTC';
  if (!COIN.test(coin)) return c.json({ error: 'INVALID_REQUEST' }, 400);
  type B = { levels: [{ px: string; sz: string; n: number }[], { px: string; sz: string; n: number }[]] };
  const d = await hl<B>({ type: 'l2Book', coin }, 1500);
  const side = (l: { px: string; sz: string; n: number }[]) => l.slice(0, 14).map((x) => ({ px: +x.px, sz: +x.sz, n: x.n }));
  return c.json({ coin, bids: side(d.levels[0]), asks: side(d.levels[1]), asOf: Date.now() }, 200, { 'cache-control': 'public, max-age=2' });
});
