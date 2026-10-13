type Level = [price: number, qty: number];

interface Book {
  venue: string;
  symbol: string;
  bids: Level[];
  asks: Level[];
}

const BAND_BPS = [10, 25, 50, 100];

export class OrderbookError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export function normalizePair(pair: string): string {
  const symbol = pair.toUpperCase().replace(/[-/_\s]/g, '');
  if (!/^[A-Z0-9]{5,15}$/.test(symbol)) throw new OrderbookError('pair must look like SOL-USDT', 400);
  return symbol;
}

const parseLevels = (rows: [string, string][]): Level[] => rows.map(([p, q]) => [Number(p), Number(q)] as Level);

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T;
}

async function fetchBook(symbol: string): Promise<Book> {
  try {
    const d = await fetchJson<{ bids: [string, string][]; asks: [string, string][] }>(
      `https://data-api.binance.vision/api/v3/depth?symbol=${symbol}&limit=500`,
    );
    return { venue: 'binance', symbol, bids: parseLevels(d.bids), asks: parseLevels(d.asks) };
  } catch {
    const d = await fetchJson<{ retCode: number; result: { b: [string, string][]; a: [string, string][] } }>(
      `https://api.bybit.com/v5/market/orderbook?category=spot&symbol=${symbol}&limit=200`,
    );
    if (d.retCode !== 0) throw new OrderbookError(`No order book for ${symbol}`, 404);
    return { venue: 'bybit', symbol, bids: parseLevels(d.result.b), asks: parseLevels(d.result.a) };
  }
}

const notional = (levels: Level[]) => levels.reduce((acc, [p, q]) => acc + p * q, 0);
const round = (n: number, dp: number) => Number(n.toFixed(dp));

function largestWall(levels: Level[], mid: number) {
  const top = levels.reduce<Level | null>((best, l) => (best === null || l[0] * l[1] > best[0] * best[1] ? l : best), null);
  if (!top) return null;
  return { price: top[0], notional: round(top[0] * top[1], 2), distanceBps: round((Math.abs(top[0] - mid) / mid) * 10_000, 1) };
}

export async function orderbookImbalance(pair: string) {
  const symbol = normalizePair(pair);
  let book: Book;
  try {
    book = await fetchBook(symbol);
  } catch (err) {
    if (err instanceof OrderbookError) throw err;
    throw new OrderbookError(`Order book unavailable for ${symbol}`, 502);
  }
  const bestBid = book.bids[0]?.[0];
  const bestAsk = book.asks[0]?.[0];
  if (!bestBid || !bestAsk) throw new OrderbookError(`Empty order book for ${symbol}`, 404);
  const mid = (bestBid + bestAsk) / 2;

  const bands = BAND_BPS.map((bps) => {
    const bid = notional(book.bids.filter(([p]) => p >= mid * (1 - bps / 10_000)));
    const ask = notional(book.asks.filter(([p]) => p <= mid * (1 + bps / 10_000)));
    const total = bid + ask;
    return { bps, bidNotional: round(bid, 2), askNotional: round(ask, 2), imbalance: total === 0 ? 0 : round((bid - ask) / total, 4) };
  });

  const near = bands.find((b) => b.bps === 25)?.imbalance ?? 0;
  const wide = bands.find((b) => b.bps === 100)?.imbalance ?? 0;
  const skew = round(near * 0.6 + wide * 0.4, 4);
  const signal = skew > 0.2 ? 'bullish_accumulation' : skew < -0.2 ? 'bearish_distribution' : 'neutral';

  return {
    pair: `${symbol}`,
    venue: book.venue,
    mid: round(mid, 8),
    spreadBps: round(((bestAsk - bestBid) / mid) * 10_000, 3),
    bands,
    skew,
    signal,
    walls: { bid: largestWall(book.bids, mid), ask: largestWall(book.asks, mid) },
    asOf: new Date().toISOString(),
  };
}
