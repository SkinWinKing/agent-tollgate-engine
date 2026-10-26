import { EVM_ADDRESS, jsonRpc, SOLANA_ADDRESS } from '@tollgate/core';
import { normalizePair } from './orderbook';

export class DataError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export interface DataEnv {
  solanaRpcUrl: string;
  evmRpcUrl: string;
  cache?: KVNamespace;
}

/** Caches slow-changing upstream JSON in KV so repeat calls skip the upstream (KV minimum TTL is 60 s). */
export async function cached<T>(env: DataEnv, key: string, ttlSec: number, load: () => Promise<T>): Promise<T> {
  const hit = await env.cache?.get<T>(key, 'json').catch(() => null);
  if (hit) return hit;
  const value = await load();
  await env.cache?.put(key, JSON.stringify(value), { expirationTtl: Math.max(60, ttlSec) }).catch(() => {});
  return value;
}

type Handler = (q: URLSearchParams, env: DataEnv) => Promise<Record<string, unknown>>;

const EVM: Record<string, { rpc: (env: DataEnv) => string; native: string; usdc: string; dexId: string }> = {
  ethereum: { rpc: () => 'https://ethereum-rpc.publicnode.com', native: 'ETH', usdc: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', dexId: 'ethereum' },
  base: { rpc: () => 'https://mainnet.base.org', native: 'ETH', usdc: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', dexId: 'base' },
  polygon: { rpc: (env) => env.evmRpcUrl, native: 'POL', usdc: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359', dexId: 'polygon' },
  arbitrum: { rpc: () => 'https://arb1.arbitrum.io/rpc', native: 'ETH', usdc: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', dexId: 'arbitrum' },
};
const TOKEN_PROGRAMS = ['TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb'];
const INTERVALS = new Set(['1m', '5m', '15m', '30m', '1h', '4h', '1d', '1w']);
const BYBIT_INTERVAL: Record<string, string> = { '1m': '1', '5m': '5', '15m': '15', '30m': '30', '1h': '60', '4h': '240', '1d': 'D', '1w': 'W' };

async function getJson<T>(url: string, timeoutMs = 8000): Promise<T> {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), headers: { accept: 'application/json' } });
  if (!res.ok) throw new DataError(`Upstream HTTP ${res.status}`, 502);
  return (await res.json()) as T;
}

const round = (n: number, dp = 6) => Number(n.toFixed(dp));
const num = (v: unknown) => (v === undefined || v === null || v === '' ? null : Number(v));

function need(q: URLSearchParams, key: string): string {
  const v = q.get(key)?.trim();
  if (!v) throw new DataError(`${key} query parameter required`, 400);
  return v;
}

function intParam(q: URLSearchParams, key: string, def: number, max: number): number {
  const n = Number(q.get(key) ?? def);
  return Number.isFinite(n) ? Math.min(max, Math.max(1, Math.floor(n))) : def;
}

function chainParam(q: URLSearchParams): string {
  const c = need(q, 'chain').toLowerCase();
  if (c !== 'solana' && !(c in EVM)) throw new DataError('chain must be solana, ethereum, base, polygon or arbitrum', 400);
  return c;
}

function addressFor(chain: string, address: string) {
  if (chain === 'solana' ? !SOLANA_ADDRESS.test(address) : !EVM_ADDRESS.test(address)) throw new DataError(`invalid ${chain} address`, 400);
  return address;
}

// ---- CEX market data -------------------------------------------------------

type Candle = { t: number; o: number; h: number; l: number; c: number; v: number };

const toCandle = (r: string[]): Candle => ({ t: Number(r[0]), o: Number(r[1]), h: Number(r[2]), l: Number(r[3]), c: Number(r[4]), v: Number(r[5]) });

async function candles(pair: string, interval: string, limit: number): Promise<{ venue: string; symbol: string; candles: Candle[] }> {
  const symbol = normalizePair(pair);
  if (!INTERVALS.has(interval)) throw new DataError(`interval must be one of ${[...INTERVALS].join(', ')}`, 400);
  try {
    const rows = await getJson<string[][]>(`https://data-api.binance.vision/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`);
    return { venue: 'binance', symbol, candles: rows.map(toCandle) };
  } catch {
    const d = await getJson<{ retCode: number; result: { list: string[][] } }>(
      `https://api.bybit.com/v5/market/kline?category=spot&symbol=${symbol}&interval=${BYBIT_INTERVAL[interval]}&limit=${limit}`,
    );
    if (d.retCode !== 0 || !d.result.list.length) throw new DataError(`No candles for ${symbol}`, 404);
    const list = d.result.list.map(toCandle);
    return { venue: 'bybit', symbol, candles: list.reverse() };
  }
}

const sma = (xs: number[], n: number) => (xs.length < n ? null : xs.slice(-n).reduce((a, b) => a + b, 0) / n);

function emaSeries(xs: number[], n: number): number[] {
  const k = 2 / (n + 1);
  const out: number[] = [];
  xs.forEach((x, i) => out.push(i === 0 ? x : x * k + out[i - 1]! * (1 - k)));
  return out;
}

function rsi(closes: number[], n = 14): number | null {
  if (closes.length <= n) return null;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= n; i++) {
    const d = closes[i]! - closes[i - 1]!;
    if (d > 0) gain += d;
    else loss -= d;
  }
  gain /= n;
  loss /= n;
  for (let i = n + 1; i < closes.length; i++) {
    const d = closes[i]! - closes[i - 1]!;
    gain = (gain * (n - 1) + Math.max(d, 0)) / n;
    loss = (loss * (n - 1) + Math.max(-d, 0)) / n;
  }
  return loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
}

function atr(cs: Candle[], n = 14): number | null {
  if (cs.length <= n) return null;
  const trs = cs.slice(1).map((c, i) => Math.max(c.h - c.l, Math.abs(c.h - cs[i]!.c), Math.abs(c.l - cs[i]!.c)));
  return trs.slice(-n).reduce((a, b) => a + b, 0) / n;
}

// ---- Solana / EVM helpers ---------------------------------------------------

async function solanaTokens(rpc: string, owner: string) {
  const results = await Promise.all(
    TOKEN_PROGRAMS.map((programId) =>
      jsonRpc<{ value: { account: { data: { parsed: { info: { mint: string; tokenAmount: { uiAmount: number; decimals: number } } } } } }[] }>(
        rpc,
        'getTokenAccountsByOwner',
        [owner, { programId }, { encoding: 'jsonParsed' }],
      ).catch(() => ({ value: [] })),
    ),
  );
  return results
    .flatMap((r) => r.value)
    .map((a) => a.account.data.parsed.info)
    .filter((i) => i.tokenAmount.uiAmount > 0)
    .map((i) => ({ mint: i.mint, amount: i.tokenAmount.uiAmount, decimals: i.tokenAmount.decimals }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 100);
}

const hexToNum = (h: string | null | undefined) => (h ? Number(BigInt(h)) : 0);

// ---- DEX Screener -----------------------------------------------------------

interface DexPair {
  chainId: string;
  dexId: string;
  url: string;
  pairAddress: string;
  baseToken: { address: string; name: string; symbol: string };
  quoteToken: { symbol: string };
  priceUsd?: string;
  liquidity?: { usd?: number };
  volume?: Record<string, number>;
  priceChange?: Record<string, number>;
  txns?: Record<string, { buys: number; sells: number }>;
  fdv?: number;
  marketCap?: number;
  pairCreatedAt?: number;
}

const pairSummary = (p: DexPair) => ({
  chain: p.chainId,
  dex: p.dexId,
  pair: `${p.baseToken.symbol}/${p.quoteToken.symbol}`,
  pairAddress: p.pairAddress,
  priceUsd: num(p.priceUsd),
  liquidityUsd: p.liquidity?.usd ?? null,
  volume24h: p.volume?.h24 ?? null,
  priceChange24hPct: p.priceChange?.h24 ?? null,
  url: p.url,
});

interface DexListing {
  chainId: string;
  tokenAddress: string;
  url: string;
  description?: string;
  totalAmount?: number;
  links?: { type?: string; label?: string; url: string }[];
}

const listing = (t: DexListing) => ({
  chain: t.chainId,
  address: t.tokenAddress,
  ...(t.totalAmount !== undefined ? { boostAmount: t.totalAmount } : {}),
  description: t.description?.slice(0, 200) ?? null,
  links: (t.links ?? []).map((l) => ({ type: l.type ?? l.label ?? 'link', url: l.url })),
  url: t.url,
});

const chainFilter = (q: URLSearchParams) => q.get('chain')?.toLowerCase() || null;

// ---- Handlers ---------------------------------------------------------------

export const DATA_HANDLERS: Record<string, Handler> = {
  async crypto_price(q) {
    const quote = (q.get('quote') ?? 'USDT').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const bases = need(q, 'symbols')
      .toUpperCase()
      .split(',')
      .map((s) => s.trim().replace(/[^A-Z0-9]/g, ''))
      .filter(Boolean);
    if (!bases.length || bases.length > 20) throw new DataError('symbols must list 1-20 assets', 400);
    const symbols = bases.map((b) => b + quote);
    type T = { symbol: string; lastPrice: string; priceChangePercent: string; highPrice: string; lowPrice: string; quoteVolume: string };
    let rows: T[];
    try {
      rows = await getJson<T[]>(`https://data-api.binance.vision/api/v3/ticker/24hr?symbols=${encodeURIComponent(JSON.stringify(symbols))}`);
    } catch {
      // Binance rejects the whole batch on one unknown symbol; fall back to Bybit per symbol.
      const each = await Promise.all(
        symbols.map((s) =>
          getJson<{ result: { list: { symbol: string; lastPrice: string; price24hPcnt: string; highPrice24h: string; lowPrice24h: string; turnover24h: string }[] } }>(
            `https://api.bybit.com/v5/market/tickers?category=spot&symbol=${s}`,
          )
            .then((d) => d.result.list[0])
            .catch(() => undefined),
        ),
      );
      rows = each
        .filter((r) => r !== undefined)
        .map((r) => ({ symbol: r.symbol, lastPrice: r.lastPrice, priceChangePercent: String(Number(r.price24hPcnt) * 100), highPrice: r.highPrice24h, lowPrice: r.lowPrice24h, quoteVolume: r.turnover24h }));
    }
    if (!rows.length) throw new DataError('No prices found for those symbols', 404);
    return {
      prices: rows.map((r) => ({
        symbol: r.symbol,
        price: Number(r.lastPrice),
        change24hPct: round(Number(r.priceChangePercent), 3),
        high24h: Number(r.highPrice),
        low24h: Number(r.lowPrice),
        quoteVolume24h: round(Number(r.quoteVolume), 2),
      })),
      asOf: new Date().toISOString(),
    };
  },

  async token_market(q) {
    const chain = chainParam(q);
    const address = addressFor(chain, need(q, 'address'));
    const pairs = await getJson<DexPair[]>(`https://api.dexscreener.com/tokens/v1/${chain === 'solana' ? 'solana' : EVM[chain]!.dexId}/${address}`);
    if (!pairs.length) throw new DataError('No DEX pairs found for this token', 404);
    pairs.sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0));
    const top = pairs[0]!;
    const sum = (k: string) => pairs.reduce((acc, p) => acc + (p.volume?.[k] ?? 0), 0);
    const tx24 = pairs.reduce((acc, p) => ({ buys: acc.buys + (p.txns?.h24?.buys ?? 0), sells: acc.sells + (p.txns?.h24?.sells ?? 0) }), { buys: 0, sells: 0 });
    return {
      token: top.baseToken,
      chain,
      priceUsd: num(top.priceUsd),
      priceChangePct: top.priceChange ?? {},
      liquidityUsd: round(pairs.reduce((acc, p) => acc + (p.liquidity?.usd ?? 0), 0), 2),
      volume: { m5: round(sum('m5'), 2), h1: round(sum('h1'), 2), h6: round(sum('h6'), 2), h24: round(sum('h24'), 2) },
      txns24h: { ...tx24, buyRatio: tx24.buys + tx24.sells ? round(tx24.buys / (tx24.buys + tx24.sells), 3) : null },
      fdv: top.fdv ?? null,
      marketCap: top.marketCap ?? null,
      oldestPairCreatedAt: Math.min(...pairs.map((p) => p.pairCreatedAt ?? Infinity)) || null,
      pairCount: pairs.length,
      pairs: pairs.slice(0, 5).map(pairSummary),
      asOf: new Date().toISOString(),
    };
  },

  async dex_search(q) {
    const term = need(q, 'q').slice(0, 64);
    const limit = intParam(q, 'limit', 10, 25);
    const d = await getJson<{ pairs: DexPair[] | null }>(`https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(term)}`);
    const pairs = (d.pairs ?? []).sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0)).slice(0, limit);
    return { query: term, results: pairs.map((p) => ({ ...pairSummary(p), token: p.baseToken })) };
  },

  async trending_tokens(q, env) {
    const chain = chainFilter(q);
    const rows = await cached(env, 'dex:boosts', 60, () => getJson<DexListing[]>('https://api.dexscreener.com/token-boosts/top/v1'));
    return { source: 'dexscreener boosts', tokens: rows.filter((t) => !chain || t.chainId === chain).map(listing) };
  },

  async new_token_profiles(q, env) {
    const chain = chainFilter(q);
    const rows = await cached(env, 'dex:profiles', 60, () => getJson<DexListing[]>('https://api.dexscreener.com/token-profiles/latest/v1'));
    return {
      tokens: rows.filter((t) => !chain || t.chainId === chain).map(listing),
      note: 'New launches are high risk; run /api/v1/security/token-audit before buying.',
    };
  },

  async gas_price(q, env) {
    const chain = chainParam(q);
    if (chain === 'solana') {
      const fees = await jsonRpc<{ prioritizationFee: number }[]>(env.solanaRpcUrl, 'getRecentPrioritizationFees', [[]]);
      const sorted = fees.map((f) => f.prioritizationFee).sort((a, b) => a - b);
      const pct = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] ?? 0;
      return { chain, unit: 'micro-lamports per compute unit', samples: sorted.length, p25: pct(25), p50: pct(50), p75: pct(75), p90: pct(90), max: sorted.at(-1) ?? 0 };
    }
    const rpc = EVM[chain]!.rpc(env);
    const [gas, tip, block] = await Promise.all([
      jsonRpc<string>(rpc, 'eth_gasPrice', []),
      jsonRpc<string>(rpc, 'eth_maxPriorityFeePerGas', []).catch(() => null),
      jsonRpc<{ baseFeePerGas?: string; number: string }>(rpc, 'eth_getBlockByNumber', ['latest', false]).catch(() => null),
    ]);
    const gwei = (h: string | null | undefined) => (h ? round(hexToNum(h) / 1e9, 6) : null);
    return { chain, unit: 'gwei', gasPrice: gwei(gas), baseFee: gwei(block?.baseFeePerGas), priorityFee: gwei(tip), block: block ? hexToNum(block.number) : null };
  },

  async wallet_balance(q, env) {
    const chain = chainParam(q);
    const address = addressFor(chain, need(q, 'address'));
    if (chain === 'solana') {
      const [bal, tokens] = await Promise.all([jsonRpc<{ value: number }>(env.solanaRpcUrl, 'getBalance', [address]), solanaTokens(env.solanaRpcUrl, address)]);
      return { chain, address, native: { symbol: 'SOL', amount: bal.value / 1e9 }, tokens };
    }
    const cfg = EVM[chain]!;
    const rpc = cfg.rpc(env);
    const data = '0x70a08231' + address.slice(2).toLowerCase().padStart(64, '0');
    const [bal, usdc] = await Promise.all([jsonRpc<string>(rpc, 'eth_getBalance', [address, 'latest']), jsonRpc<string>(rpc, 'eth_call', [{ to: cfg.usdc, data }, 'latest']).catch(() => null)]);
    return {
      chain,
      address,
      native: { symbol: cfg.native, amount: Number(BigInt(bal)) / 1e18 },
      tokens: [{ symbol: 'USDC', address: cfg.usdc, amount: usdc && usdc !== '0x' ? Number(BigInt(usdc)) / 1e6 : 0 }],
    };
  },

  async tx_status(q, env) {
    const chain = chainParam(q);
    const tx = need(q, 'tx');
    if (chain === 'solana') {
      if (!/^[1-9A-HJ-NP-Za-km-z]{64,90}$/.test(tx)) throw new DataError('invalid Solana signature', 400);
      const r = await jsonRpc<{ value: ({ slot: number; confirmations: number | null; err: unknown; confirmationStatus: string } | null)[] }>(
        env.solanaRpcUrl,
        'getSignatureStatuses',
        [[tx], { searchTransactionHistory: true }],
      );
      const s = r.value[0];
      if (!s) return { chain, tx, status: 'not_found' };
      return { chain, tx, status: s.err ? 'failed' : s.confirmationStatus, slot: s.slot, confirmations: s.confirmations, error: s.err ?? null };
    }
    if (!/^0x[0-9a-fA-F]{64}$/.test(tx)) throw new DataError('invalid transaction hash', 400);
    const rpc = EVM[chain]!.rpc(env);
    const [receipt, head] = await Promise.all([
      jsonRpc<{ status: string; blockNumber: string; gasUsed: string; from: string; to: string | null } | null>(rpc, 'eth_getTransactionReceipt', [tx]),
      jsonRpc<string>(rpc, 'eth_blockNumber', []),
    ]);
    if (!receipt) {
      const pending = await jsonRpc<unknown>(rpc, 'eth_getTransactionByHash', [tx]).catch(() => null);
      return { chain, tx, status: pending ? 'pending' : 'not_found' };
    }
    const block = hexToNum(receipt.blockNumber);
    return {
      chain,
      tx,
      status: receipt.status === '0x1' ? 'confirmed' : 'failed',
      block,
      confirmations: hexToNum(head) - block + 1,
      gasUsed: hexToNum(receipt.gasUsed),
      from: receipt.from,
      to: receipt.to,
    };
  },

  async funding_rates(q) {
    const base = need(q, 'symbol').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const [bybit, okx] = await Promise.all([
      getJson<{ result: { list: Record<string, string>[] } }>(`https://api.bybit.com/v5/market/tickers?category=linear&symbol=${base}USDT`)
        .then((d) => d.result.list[0])
        .catch(() => undefined),
      getJson<{ data: Record<string, string>[] }>(`https://www.okx.com/api/v5/public/funding-rate?instId=${base}-USDT-SWAP`)
        .then((d) => d.data[0])
        .catch(() => undefined),
    ]);
    const venues = [];
    if (bybit) {
      const rate = Number(bybit.fundingRate);
      const hours = Number(bybit.fundingIntervalHour || 8);
      venues.push({
        venue: 'bybit',
        fundingRate: rate,
        intervalHours: hours,
        annualizedPct: round(rate * (8760 / hours) * 100, 2),
        nextFundingTime: new Date(Number(bybit.nextFundingTime)).toISOString(),
        markPrice: Number(bybit.markPrice),
        indexPrice: Number(bybit.indexPrice),
        openInterestUsd: Number(bybit.openInterestValue),
      });
    }
    if (okx) {
      const rate = Number(okx.fundingRate);
      const hours = (Number(okx.nextFundingTime) - Number(okx.fundingTime)) / 3_600_000 || 8;
      venues.push({ venue: 'okx', fundingRate: rate, intervalHours: hours, annualizedPct: round(rate * (8760 / hours) * 100, 2), nextFundingTime: new Date(Number(okx.fundingTime)).toISOString() });
    }
    if (!venues.length) throw new DataError(`No perpetual found for ${base}`, 404);
    const avg = venues.reduce((a, v) => a + v.fundingRate, 0) / venues.length;
    return { symbol: base, venues, bias: avg > 0.0001 ? 'longs_paying' : avg < 0 ? 'shorts_paying' : 'neutral', asOf: new Date().toISOString() };
  },

  async fear_greed(q, env) {
    const days = intParam(q, 'days', 7, 30);
    const d = await cached(env, `fng:${days}`, 900, () => getJson<{ data: { value: string; value_classification: string; timestamp: string }[] }>(`https://api.alternative.me/fng/?limit=${days}`));
    const rows = d.data.map((r) => ({ value: Number(r.value), classification: r.value_classification, date: new Date(Number(r.timestamp) * 1000).toISOString().slice(0, 10) }));
    if (!rows.length) throw new DataError('Index unavailable', 502);
    return { value: rows[0]!.value, classification: rows[0]!.classification, history: rows, source: 'alternative.me' };
  },

  async ohlcv(q) {
    const r = await candles(need(q, 'pair'), q.get('interval') ?? '1h', intParam(q, 'limit', 100, 500));
    return { ...r, interval: q.get('interval') ?? '1h' };
  },

  async technical_indicators(q) {
    const interval = q.get('interval') ?? '1h';
    const { venue, symbol, candles: cs } = await candles(need(q, 'pair'), interval, 300);
    const closes = cs.map((c) => c.c);
    const last = closes.at(-1)!;
    const e12 = emaSeries(closes, 12);
    const e26 = emaSeries(closes, 26);
    const macdLine = closes.map((_, i) => e12[i]! - e26[i]!);
    const signalLine = emaSeries(macdLine, 9);
    const sma20 = sma(closes, 20);
    const sma50 = sma(closes, 50);
    const sma200 = sma(closes, 200);
    const std20 = sma20 === null ? null : Math.sqrt(closes.slice(-20).reduce((a, c) => a + (c - sma20) ** 2, 0) / 20);
    const returns = closes.slice(1).map((c, i) => Math.log(c / closes[i]!));
    const meanR = returns.reduce((a, b) => a + b, 0) / returns.length;
    const stdR = Math.sqrt(returns.reduce((a, r) => a + (r - meanR) ** 2, 0) / returns.length);
    const perYear: Record<string, number> = { '15m': 35040, '30m': 17520, '1h': 8760, '4h': 2190, '1d': 365, '1w': 52, '5m': 105120, '1m': 525600 };
    const r14 = rsi(closes);
    const hist = macdLine.at(-1)! - signalLine.at(-1)!;
    const trend = sma50 === null ? 'unknown' : last > sma50 && (sma200 === null || sma50 > sma200) ? 'up' : last < sma50 && (sma200 === null || sma50 < sma200) ? 'down' : 'sideways';
    let score = 0;
    if (trend === 'up') score++;
    if (trend === 'down') score--;
    if (hist > 0) score++;
    else score--;
    if (r14 !== null && r14 < 30) score++;
    if (r14 !== null && r14 > 70) score--;
    const signal = score >= 2 ? 'bullish' : score <= -2 ? 'bearish' : 'neutral';
    const dp = last < 1 ? 8 : 4;
    return {
      pair: symbol,
      venue,
      interval,
      price: last,
      rsi14: r14 === null ? null : round(r14, 2),
      sma: { sma20: sma20 && round(sma20, dp), sma50: sma50 && round(sma50, dp), sma200: sma200 && round(sma200, dp) },
      ema: { ema12: round(e12.at(-1)!, dp), ema26: round(e26.at(-1)!, dp) },
      macd: { macd: round(macdLine.at(-1)!, dp), signal: round(signalLine.at(-1)!, dp), histogram: round(hist, dp) },
      bollinger: sma20 === null || std20 === null ? null : { upper: round(sma20 + 2 * std20, dp), middle: round(sma20, dp), lower: round(sma20 - 2 * std20, dp), widthPct: round(((4 * std20) / sma20) * 100, 3) },
      atr14: (() => {
        const a = atr(cs);
        return a === null ? null : { value: round(a, dp), pctOfPrice: round((a / last) * 100, 3) };
      })(),
      realizedVolAnnualPct: round(stdR * Math.sqrt(perYear[interval] ?? 8760) * 100, 2),
      trend,
      signal,
      candlesUsed: cs.length,
      asOf: new Date().toISOString(),
    };
  },

  async stablecoin_pegs(q, env) {
    const limit = intParam(q, 'limit', 15, 50);
    type Asset = {
      name: string;
      symbol: string;
      pegType: string;
      pegMechanism: string;
      price: number | null;
      circulating: Record<string, number>;
      circulatingPrevDay: Record<string, number>;
      circulatingPrevWeek: Record<string, number>;
      circulatingPrevMonth: Record<string, number>;
    };
    const d = await cached(env, 'llama:stables', 300, () => getJson<{ peggedAssets: Asset[] }>('https://stablecoins.llama.fi/stablecoins?includePrices=true', 10_000));
    const usd = d.peggedAssets.filter((a) => a.pegType === 'peggedUSD');
    const circ = (r: Record<string, number> | undefined) => r?.peggedUSD ?? 0;
    const change = (now: number, prev: number) => (prev ? round(((now - prev) / prev) * 100, 3) : null);
    const rows = usd
      .sort((a, b) => circ(b.circulating) - circ(a.circulating))
      .slice(0, limit)
      .map((a) => {
        const now = circ(a.circulating);
        const dev = a.price ? round((a.price - 1) * 10_000, 1) : null;
        return {
          name: a.name,
          symbol: a.symbol,
          mechanism: a.pegMechanism,
          price: a.price,
          pegDeviationBps: dev,
          depeg: dev !== null && Math.abs(dev) > 50,
          circulatingUsd: round(now, 0),
          supplyChangePct: { d1: change(now, circ(a.circulatingPrevDay)), d7: change(now, circ(a.circulatingPrevWeek)), d30: change(now, circ(a.circulatingPrevMonth)) },
        };
      });
    return { stablecoins: rows, depegged: rows.filter((r) => r.depeg).map((r) => r.symbol), source: 'defillama' };
  },

  async chain_tvl(q, env) {
    const rows = await cached(env, 'llama:chains', 300, () =>
      getJson<{ name: string; tvl: number; tokenSymbol: string | null; chainId: number | null }[]>('https://api.llama.fi/v2/chains'),
    );
    const want = q.get('chain')?.toLowerCase();
    const sorted = rows.sort((a, b) => b.tvl - a.tvl).map((r, i) => ({ rank: i + 1, name: r.name, tvlUsd: round(r.tvl, 0), token: r.tokenSymbol, chainId: r.chainId }));
    if (want) {
      const hit = sorted.find((r) => r.name.toLowerCase() === want);
      if (!hit) throw new DataError(`Unknown chain ${want}`, 404);
      return hit;
    }
    return { chains: sorted.slice(0, intParam(q, 'limit', 20, 100)), source: 'defillama' };
  },

  async protocol_tvl(q) {
    const slug = need(q, 'protocol').toLowerCase();
    if (!/^[a-z0-9.-]{2,60}$/.test(slug)) throw new DataError('protocol must be a DefiLlama slug such as aave', 400);
    const res = await fetch(`https://api.llama.fi/tvl/${slug}`, { signal: AbortSignal.timeout(8000) });
    const text = await res.text();
    const tvl = Number(text);
    if (!res.ok || !Number.isFinite(tvl)) throw new DataError(`Unknown protocol ${slug}`, 404);
    return { protocol: slug, tvlUsd: round(tvl, 0), source: 'defillama', asOf: new Date().toISOString() };
  },

  async address_check(q, env) {
    const address = need(q, 'address');
    if (EVM_ADDRESS.test(address)) {
      const chain = (q.get('chain') ?? 'ethereum').toLowerCase();
      if (!(chain in EVM)) throw new DataError('chain must be ethereum, base, polygon or arbitrum for 0x addresses', 400);
      const rpc = EVM[chain]!.rpc(env);
      const [code, nonce, bal] = await Promise.all([
        jsonRpc<string>(rpc, 'eth_getCode', [address, 'latest']),
        jsonRpc<string>(rpc, 'eth_getTransactionCount', [address, 'latest']),
        jsonRpc<string>(rpc, 'eth_getBalance', [address, 'latest']),
      ]);
      const isContract = code !== '0x';
      // EIP-7702 delegated EOAs carry a 23-byte 0xef0100 designator instead of real bytecode.
      const delegated = code.startsWith('0xef0100');
      return {
        format: 'evm',
        chain,
        kind: delegated ? 'eoa_with_7702_delegation' : isContract ? 'contract' : hexToNum(nonce) > 0 || hexToNum(bal) > 0 ? 'wallet' : 'unused_address',
        bytecodeBytes: isContract ? (code.length - 2) / 2 : 0,
        txCount: hexToNum(nonce),
        nativeBalance: Number(BigInt(bal)) / 1e18,
      };
    }
    if (SOLANA_ADDRESS.test(address)) {
      const info = await jsonRpc<{ value: { owner: string; executable: boolean; lamports: number; data: { parsed?: { type?: string } } | unknown[] } | null }>(
        env.solanaRpcUrl,
        'getAccountInfo',
        [address, { encoding: 'jsonParsed' }],
      );
      const v = info.value;
      if (!v) return { format: 'solana', chain: 'solana', exists: false, kind: 'unused_address' };
      const parsedType = !Array.isArray(v.data) ? (v.data as { parsed?: { type?: string } }).parsed?.type : undefined;
      const tokenProgram = TOKEN_PROGRAMS.includes(v.owner);
      const kind = v.executable
        ? 'program'
        : tokenProgram && parsedType === 'mint'
          ? 'token_mint'
          : tokenProgram && parsedType === 'account'
            ? 'token_account'
            : v.owner === '11111111111111111111111111111111'
              ? 'wallet'
              : 'program_owned_account';
      return { format: 'solana', chain: 'solana', exists: true, kind, owner: v.owner, sol: v.lamports / 1e9 };
    }
    throw new DataError('address is neither an EVM (0x...) nor a Solana address', 400);
  },

  async solana_network(_q, env) {
    const [samples, epoch, height] = await Promise.all([
      jsonRpc<{ numTransactions: number; samplePeriodSecs: number }[]>(env.solanaRpcUrl, 'getRecentPerformanceSamples', [10]),
      jsonRpc<{ epoch: number; slotIndex: number; slotsInEpoch: number; absoluteSlot: number }>(env.solanaRpcUrl, 'getEpochInfo', []),
      jsonRpc<number>(env.solanaRpcUrl, 'getBlockHeight', []),
    ]);
    const secs = samples.reduce((a, s) => a + s.samplePeriodSecs, 0) || 1;
    return {
      tps: round(samples.reduce((a, s) => a + s.numTransactions, 0) / secs, 1),
      slot: epoch.absoluteSlot,
      blockHeight: height,
      epoch: epoch.epoch,
      epochProgressPct: round((epoch.slotIndex / epoch.slotsInEpoch) * 100, 2),
      asOf: new Date().toISOString(),
    };
  },
};
