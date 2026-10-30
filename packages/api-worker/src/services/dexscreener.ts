const DS = 'https://api.dexscreener.com';

export class DexError extends Error {
  constructor(message: string, readonly status: number = 502) { super(message); }
}

async function dsGet<T>(path: string): Promise<T> {
  const res = await fetch(`${DS}${path}`, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new DexError(`DexScreener ${res.status}`, res.status >= 500 ? 502 : 400);
  return res.json() as Promise<T>;
}

interface BoostToken { chainId: string; tokenAddress: string; totalAmount: number; url: string; icon?: string; description?: string }
interface DsPair {
  chainId: string; dexId: string; pairAddress: string; url: string;
  baseToken: { address: string; name: string; symbol: string };
  quoteToken: { address: string; name: string; symbol: string };
  priceUsd: string; priceNative: string;
  txns: Record<string, { buys: number; sells: number }>;
  volume: Record<string, number>;
  priceChange: Record<string, number>;
  liquidity: { usd: number; base: number; quote: number };
  fdv: number; marketCap: number;
  pairCreatedAt: number;
  info?: { imageUrl?: string; websites?: { url: string }[]; socials?: { type: string; url: string }[] };
}

export async function topBoosted(): Promise<BoostToken[]> {
  return dsGet<BoostToken[]>('/token-boosts/top/v1');
}

export async function enrichPairs(tokens: BoostToken[]): Promise<DsPair[]> {
  const byChain = new Map<string, string[]>();
  for (const t of tokens) {
    const arr = byChain.get(t.chainId) ?? [];
    arr.push(t.tokenAddress);
    byChain.set(t.chainId, arr);
  }
  const pairs: DsPair[] = [];
  const batches: string[][] = [];
  for (const addrs of byChain.values()) {
    for (let i = 0; i < addrs.length; i += 30) batches.push(addrs.slice(i, i + 30));
  }
  const results = await Promise.all(batches.map(b => dsGet<{ pairs: DsPair[] }>(`/latest/dex/tokens/${b.join(',')}`).catch(() => ({ pairs: [] as DsPair[] }))));
  const seen = new Set<string>();
  for (const r of results) {
    for (const p of r.pairs) {
      if (!seen.has(p.baseToken.address)) { seen.add(p.baseToken.address); pairs.push(p); }
    }
  }
  return pairs;
}

export async function trendingPairs(chain?: string): Promise<unknown[]> {
  const boosts = await topBoosted();
  const filtered = chain ? boosts.filter(b => b.chainId === chain) : boosts;
  const top = filtered.slice(0, 30);
  if (!top.length) return [];
  const pairs = await enrichPairs(top);
  return pairs.map(p => ({
    chain: p.chainId,
    dex: p.dexId,
    pair: p.pairAddress,
    url: p.url,
    symbol: p.baseToken.symbol,
    name: p.baseToken.name,
    address: p.baseToken.address,
    priceUsd: p.priceUsd,
    txns: p.txns,
    volume: p.volume,
    priceChange: p.priceChange,
    liquidity: p.liquidity?.usd ?? 0,
    fdv: p.fdv,
    marketCap: p.marketCap,
    createdAt: p.pairCreatedAt,
    logo: p.info?.imageUrl ?? null,
  }));
}

export async function searchPairs(q: string): Promise<unknown[]> {
  const data = await dsGet<{ pairs: DsPair[] }>(`/latest/dex/search?q=${encodeURIComponent(q)}`);
  return (data.pairs ?? []).slice(0, 30).map(p => ({
    chain: p.chainId,
    dex: p.dexId,
    pair: p.pairAddress,
    url: p.url,
    symbol: p.baseToken.symbol,
    name: p.baseToken.name,
    address: p.baseToken.address,
    quote: p.quoteToken.symbol,
    priceUsd: p.priceUsd,
    txns: p.txns,
    volume: p.volume,
    priceChange: p.priceChange,
    liquidity: p.liquidity?.usd ?? 0,
    fdv: p.fdv,
    marketCap: p.marketCap,
    createdAt: p.pairCreatedAt,
    logo: p.info?.imageUrl ?? null,
  }));
}

export async function pairDetail(chainId: string, pairAddr: string) {
  const data = await dsGet<{ pairs: DsPair[] }>(`/latest/dex/pairs/${chainId}/${pairAddr}`);
  return data.pairs?.[0] ?? null;
}
