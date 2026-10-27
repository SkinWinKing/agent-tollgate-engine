import { EVM_ADDRESS, SOLANA_ADDRESS } from '@tollgate/core';
import { auditSolanaToken } from './audit-solana';
import { cached, DataError, type DataEnv } from './data-tools';

/**
 * Skills ported from the Algoritam council (Superlive): Guardian (wash-trading veto), Signal Master (hype),
 * Detective (whales), quantum-style consensus voting and the formula agent (Kelly sizing).
 */
type Handler = (q: URLSearchParams, env: DataEnv) => Promise<Record<string, unknown>>;

const UA = 'AgentTollgate/1.0 (+https://skinwinking.com)';
const DEX_CHAIN: Record<string, string> = { solana: 'solana', ethereum: 'ethereum', base: 'base', polygon: 'polygon', arbitrum: 'arbitrum', bsc: 'bsc' };

interface Pair {
  chainId: string;
  dexId: string;
  pairAddress: string;
  baseToken: { address: string; symbol: string; name: string };
  priceUsd?: string;
  liquidity?: { usd?: number };
  volume?: Record<string, number>;
  priceChange?: Record<string, number>;
  txns?: Record<string, { buys: number; sells: number }>;
  fdv?: number;
  marketCap?: number;
  pairCreatedAt?: number;
  boosts?: { active?: number };
  info?: { socials?: unknown[]; websites?: unknown[] };
}

async function getJson<T>(url: string, timeoutMs = 10_000): Promise<T> {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), headers: { accept: 'application/json', 'user-agent': UA } });
  if (res.status === 429) throw new DataError('Upstream is rate limiting; retry shortly', 503);
  if (!res.ok) throw new DataError(`Upstream HTTP ${res.status}`, 502);
  return (await res.json()) as T;
}

const round = (n: number, dp = 3) => Number(n.toFixed(dp));
const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));

function tokenParams(q: URLSearchParams) {
  const chain = (q.get('chain') ?? '').toLowerCase();
  const address = (q.get('address') ?? '').trim();
  if (!DEX_CHAIN[chain]) throw new DataError('chain must be solana, ethereum, base, polygon, arbitrum or bsc', 400);
  if (chain === 'solana' ? !SOLANA_ADDRESS.test(address) : !EVM_ADDRESS.test(address)) throw new DataError(`invalid ${chain} token address`, 400);
  return { chain, address };
}

async function pairsOf(env: DataEnv, chain: string, address: string): Promise<Pair[]> {
  const pairs = await cached(env, `dexp:${chain}:${address}`, 60, () => getJson<Pair[]>(`https://api.dexscreener.com/tokens/v1/${DEX_CHAIN[chain]}/${address}`));
  if (!pairs.length) throw new DataError('No DEX pairs found for this token', 404);
  return pairs.sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0));
}

/** Guardian: wash trading heuristics from DEX activity. */
function washAnalysis(pairs: Pair[]) {
  const liq = pairs.reduce((s, p) => s + (p.liquidity?.usd ?? 0), 0);
  const vol24 = pairs.reduce((s, p) => s + (p.volume?.h24 ?? 0), 0);
  const tx = pairs.reduce((s, p) => ({ b: s.b + (p.txns?.h24?.buys ?? 0), s: s.s + (p.txns?.h24?.sells ?? 0) }), { b: 0, s: 0 });
  const trades = tx.b + tx.s;
  const turnover = liq ? vol24 / liq : 0;
  const avgTrade = trades ? vol24 / trades : 0;
  const balance = trades ? Math.abs(tx.b - tx.s) / trades : 1;
  const move = Math.abs(pairs[0]?.priceChange?.h24 ?? 0);
  const flags: { code: string; message: string; points: number }[] = [];
  if (turnover > 30) flags.push({ code: 'EXTREME_TURNOVER', message: `24h volume is ${round(turnover, 1)}x liquidity`, points: 35 });
  else if (turnover > 10) flags.push({ code: 'HIGH_TURNOVER', message: `24h volume is ${round(turnover, 1)}x liquidity`, points: 18 });
  if (trades > 200 && balance < 0.03 && move < 3) flags.push({ code: 'SYMMETRIC_CHURN', message: 'Buys and sells almost perfectly balanced with a flat price: classic churn', points: 25 });
  if (avgTrade > 0 && avgTrade < 15 && trades > 2000) flags.push({ code: 'MICRO_TRADE_SPAM', message: `Thousands of trades averaging $${round(avgTrade, 2)}`, points: 15 });
  if (vol24 > 0 && liq < 5000) flags.push({ code: 'THIN_LIQUIDITY', message: `Only $${Math.round(liq)} liquidity behind $${Math.round(vol24)} volume`, points: 20 });
  if (trades > 0 && trades < 20 && vol24 > 100_000) flags.push({ code: 'FEW_LARGE_TRADES', message: `$${Math.round(vol24)} volume from only ${trades} trades`, points: 20 });
  const score = clamp(flags.reduce((s, f) => s + f.points, 0));
  return { washScore: score, verdict: score >= 50 ? 'likely_wash_traded' : score >= 25 ? 'suspicious' : 'looks_organic', flags, metrics: { liquidityUsd: Math.round(liq), volume24hUsd: Math.round(vol24), trades24h: trades, turnover: round(turnover, 2), avgTradeUsd: round(avgTrade, 2), buySellImbalance: round(balance, 3) } };
}

/** Signal Master: hype from boosts, volume acceleration, buy pressure and socials. */
function hypeAnalysis(pairs: Pair[], trending: Set<string>) {
  const top = pairs[0]!;
  const v = (k: string) => pairs.reduce((s, p) => s + (p.volume?.[k] ?? 0), 0);
  const accel1h = v('h24') ? (v('h1') * 24) / v('h24') : 0;
  const accel5m = v('h1') ? (v('m5') * 12) / v('h1') : 0;
  const h1 = pairs.reduce((s, p) => ({ b: s.b + (p.txns?.h1?.buys ?? 0), s: s.s + (p.txns?.h1?.sells ?? 0) }), { b: 0, s: 0 });
  const buyRatio = h1.b + h1.s ? h1.b / (h1.b + h1.s) : 0.5;
  const boosts = pairs.reduce((s, p) => s + (p.boosts?.active ?? 0), 0);
  const socials = (top.info?.socials?.length ?? 0) + (top.info?.websites?.length ?? 0);
  const isTrending = trending.has(top.baseToken.symbol.toLowerCase()) || trending.has(top.baseToken.address.toLowerCase());
  const parts = {
    volumeAcceleration: clamp((accel1h - 1) * 25, 0, 30),
    shortTermBurst: clamp((accel5m - 1) * 10, 0, 15),
    buyPressure: clamp((buyRatio - 0.5) * 80, 0, 20),
    paidBoosts: clamp(boosts / 10, 0, 15),
    trending: isTrending ? 15 : 0,
    socials: clamp(socials * 2.5, 0, 5),
  };
  const score = Math.round(Object.values(parts).reduce((a, b) => a + b, 0));
  return { hypeScore: score, level: score >= 60 ? 'viral' : score >= 35 ? 'heating_up' : score >= 15 ? 'warm' : 'quiet', components: Object.fromEntries(Object.entries(parts).map(([k, n]) => [k, round(n, 1)])), signals: { volumeAccel1h: round(accel1h, 2), volumeAccel5m: round(accel5m, 2), buyRatio1h: round(buyRatio, 3), activeBoosts: boosts, coingeckoTrending: isTrending } };
}

async function cgTrending(env: DataEnv): Promise<{ set: Set<string>; coins: { name: string; symbol: string; rank: number | null; priceChange24h: number | null }[] }> {
  type T = { coins: { item: { name: string; symbol: string; market_cap_rank: number | null; data?: { price_change_percentage_24h?: { usd?: number } }; platforms?: Record<string, string> } }[] };
  const d = await cached(env, 'cg:trending', 300, () => getJson<T>('https://api.coingecko.com/api/v3/search/trending')).catch(() => ({ coins: [] }) as T);
  const set = new Set<string>();
  for (const c of d.coins) {
    set.add(c.item.symbol.toLowerCase());
    for (const a of Object.values(c.item.platforms ?? {})) if (a) set.add(a.toLowerCase());
  }
  return { set, coins: d.coins.map((c) => ({ name: c.item.name, symbol: c.item.symbol, rank: c.item.market_cap_rank, priceChange24h: c.item.data?.price_change_percentage_24h?.usd ?? null })) };
}

export const COUNCIL_HANDLERS: Record<string, Handler> = {
  async wash_trading_check(q, env) {
    const { chain, address } = tokenParams(q);
    const pairs = await pairsOf(env, chain, address);
    return { chain, address, token: pairs[0]!.baseToken, ...washAnalysis(pairs), note: 'Heuristic screen from public DEX data; not proof of manipulation.' };
  },

  async hype_signal(q, env) {
    const trending = await cgTrending(env);
    if (!q.get('address')) {
      return { mode: 'market', coingeckoTrending: trending.coins.slice(0, 15), note: 'Pass chain and address to score a specific token.' };
    }
    const { chain, address } = tokenParams(q);
    const pairs = await pairsOf(env, chain, address);
    return { chain, address, token: pairs[0]!.baseToken, priceUsd: Number(pairs[0]!.priceUsd ?? 0), ...hypeAnalysis(pairs, trending.set), note: 'Hype is attention, not value. Pair with token_audit before buying.' };
  },

  async whale_watch(q, env) {
    const coin = (q.get('asset') ?? 'bitcoin').toLowerCase();
    if (!['bitcoin', 'ethereum'].includes(coin)) throw new DataError('asset must be bitcoin or ethereum', 400);
    type T = { total_holdings: number; total_value_usd: number; market_cap_dominance: number; companies: { name: string; symbol: string; country: string; total_holdings: number; total_current_value_usd: number; percentage_of_total_supply: number }[] };
    type S = { peggedAssets: { symbol: string; circulating: { peggedUSD?: number }; circulatingPrevDay: { peggedUSD?: number }; circulatingPrevWeek: { peggedUSD?: number } }[] };
    const [t, s] = await Promise.all([
      cached(env, `cg:treasury:${coin}`, 3600, () => getJson<T>(`https://api.coingecko.com/api/v3/companies/public_treasury/${coin}`)),
      cached(env, 'llama:stables', 300, () => getJson<S>('https://stablecoins.llama.fi/stablecoins?includePrices=true', 10_000)).catch(() => null),
    ]);
    const flows = (s?.peggedAssets ?? [])
      .filter((a) => ['USDT', 'USDC', 'USDE', 'DAI', 'FDUSD', 'PYUSD'].includes(a.symbol.toUpperCase()))
      .map((a) => {
        const now = a.circulating.peggedUSD ?? 0;
        return { symbol: a.symbol, supplyUsd: Math.round(now), change1dUsd: Math.round(now - (a.circulatingPrevDay.peggedUSD ?? now)), change7dUsd: Math.round(now - (a.circulatingPrevWeek.peggedUSD ?? now)) };
      });
    const net1d = flows.reduce((x, f) => x + f.change1dUsd, 0);
    return {
      asset: coin,
      corporateTreasuries: { totalHoldings: round(t.total_holdings, 2), totalValueUsd: Math.round(t.total_value_usd), shareOfSupplyPct: t.market_cap_dominance, top: t.companies.slice(0, 10).map((c) => ({ name: c.name, ticker: c.symbol, country: c.country, holdings: c.total_holdings, valueUsd: Math.round(c.total_current_value_usd), pctOfSupply: c.percentage_of_total_supply })) },
      stablecoinFlows: { netMint1dUsd: net1d, reading: net1d > 250_000_000 ? 'fresh dry powder entering crypto' : net1d < -250_000_000 ? 'capital leaving via redemptions' : 'flat', assets: flows },
      source: 'CoinGecko public treasuries, DefiLlama stablecoins',
    };
  },

  async council_verdict(q, env) {
    const { chain, address } = tokenParams(q);
    const [pairs, trending] = await Promise.all([pairsOf(env, chain, address), cgTrending(env)]);
    const top = pairs[0]!;
    const wash = washAnalysis(pairs);
    const hype = hypeAnalysis(pairs, trending.set);
    const liq = wash.metrics.liquidityUsd;
    const ageDays = top.pairCreatedAt ? (Date.now() - top.pairCreatedAt) / 86_400_000 : null;
    const ch24 = top.priceChange?.h24 ?? 0;
    const ch1 = top.priceChange?.h1 ?? 0;
    let audit: { riskLevel: string; riskScore: number; flags: string[] } | null = null;
    if (chain === 'solana') {
      const a = await Promise.race([auditSolanaToken(env.solanaRpcUrl, address, { quick: true }).catch(() => null), new Promise<null>((r) => setTimeout(() => r(null), 3000))]);
      if (a) audit = { riskLevel: a.riskLevel, riskScore: a.riskScore, flags: a.flags.filter((f) => f.points > 0).map((f) => f.code) };
    }
    type Vote = { agent: string; role: string; vote: 'buy' | 'hold' | 'avoid'; confidence: number; reason: string; veto?: boolean };
    const votes: Vote[] = [
      liq >= 250_000 ? { agent: 'Analyst', role: 'liquidity and depth', vote: 'buy', confidence: 0.7, reason: `$${liq.toLocaleString()} liquidity` }
      : liq >= 25_000 ? { agent: 'Analyst', role: 'liquidity and depth', vote: 'hold', confidence: 0.5, reason: `Moderate liquidity $${liq.toLocaleString()}` }
      : { agent: 'Analyst', role: 'liquidity and depth', vote: 'avoid', confidence: 0.8, reason: `Thin liquidity $${liq.toLocaleString()}` },
      audit
        ? audit.riskLevel === 'critical' || audit.riskLevel === 'high'
          ? { agent: 'Guardian', role: 'rug-pull veto', vote: 'avoid', confidence: 0.95, reason: `Contract risk ${audit.riskLevel}: ${audit.flags.join(', ')}`, veto: true }
          : { agent: 'Guardian', role: 'rug-pull veto', vote: 'buy', confidence: 0.6, reason: `No critical authority risks (${audit.riskLevel})` }
        : { agent: 'Guardian', role: 'rug-pull veto', vote: 'hold', confidence: 0.4, reason: chain === 'solana' ? 'Audit timed out' : 'Run token_audit for an EVM contract check' },
      wash.washScore >= 50
        ? { agent: 'Wash Detector', role: 'fake volume', vote: 'avoid', confidence: 0.85, reason: wash.flags.map((f) => f.code).join(', '), veto: true }
        : wash.washScore >= 25 ? { agent: 'Wash Detector', role: 'fake volume', vote: 'hold', confidence: 0.6, reason: wash.flags.map((f) => f.code).join(', ') }
        : { agent: 'Wash Detector', role: 'fake volume', vote: 'buy', confidence: 0.55, reason: 'Volume looks organic' },
      hype.hypeScore >= 60 ? { agent: 'Signal Master', role: 'attention and hype', vote: 'hold', confidence: 0.5, reason: 'Viral hype: late entries get punished' }
      : hype.hypeScore >= 25 ? { agent: 'Signal Master', role: 'attention and hype', vote: 'buy', confidence: 0.6, reason: `Hype heating up (${hype.hypeScore})` }
      : { agent: 'Signal Master', role: 'attention and hype', vote: 'hold', confidence: 0.4, reason: 'Little attention' },
      ch24 > 150 ? { agent: 'Momentum', role: 'trend', vote: 'avoid', confidence: 0.6, reason: `+${ch24}% in 24h: chasing a vertical move` }
      : ch1 > 0 && ch24 > 0 ? { agent: 'Momentum', role: 'trend', vote: 'buy', confidence: 0.55, reason: `Up ${ch1}% 1h and ${ch24}% 24h` }
      : ch24 < -30 ? { agent: 'Momentum', role: 'trend', vote: 'avoid', confidence: 0.6, reason: `${ch24}% in 24h` }
      : { agent: 'Momentum', role: 'trend', vote: 'hold', confidence: 0.4, reason: `${ch24}% in 24h` },
      ageDays === null ? { agent: 'Historian', role: 'pair age', vote: 'hold', confidence: 0.3, reason: 'Unknown age' }
      : ageDays < 1 ? { agent: 'Historian', role: 'pair age', vote: 'avoid', confidence: 0.7, reason: `Pair is ${round(ageDays * 24, 1)} hours old` }
      : ageDays > 30 ? { agent: 'Historian', role: 'pair age', vote: 'buy', confidence: 0.55, reason: `${Math.round(ageDays)} days of trading history` }
      : { agent: 'Historian', role: 'pair age', vote: 'hold', confidence: 0.45, reason: `${Math.round(ageDays)} days old` },
      (top.fdv ?? 0) > 0 && liq > 0 && (top.fdv ?? 0) / liq > 200
        ? { agent: 'Valuer', role: 'valuation vs liquidity', vote: 'avoid', confidence: 0.6, reason: `FDV is ${Math.round((top.fdv ?? 0) / liq)}x liquidity: exits will slip` }
        : { agent: 'Valuer', role: 'valuation vs liquidity', vote: 'buy', confidence: 0.45, reason: 'FDV reasonable against liquidity' },
    ];
    const weight = { buy: 0, hold: 0, avoid: 0 };
    for (const v of votes) weight[v.vote] += v.confidence;
    const vetoed = votes.filter((v) => v.veto && v.vote === 'avoid');
    const total = weight.buy + weight.hold + weight.avoid;
    const leader = (Object.entries(weight) as [keyof typeof weight, number][]).sort((a, b) => b[1] - a[1])[0]!;
    const verdict = vetoed.length ? 'avoid' : leader[0];
    return {
      chain,
      address,
      token: top.baseToken,
      verdict,
      consensus: round(leader[1] / total, 3),
      vetoedBy: vetoed.map((v) => v.agent),
      tally: Object.fromEntries(Object.entries(weight).map(([k, n]) => [k, round(n, 2)])),
      votes,
      evidence: { liquidityUsd: liq, priceChangePct: top.priceChange ?? {}, washScore: wash.washScore, hypeScore: hype.hypeScore, audit, pairAgeDays: ageDays === null ? null : round(ageDays, 1) },
      note: 'Rule-based council of seven agents with Guardian and Wash Detector vetoes. Decision support, not financial advice.',
    };
  },

  async kelly_size(q) {
    const p = Number(q.get('winRate'));
    const avgWin = Number(q.get('avgWin'));
    const avgLoss = Math.abs(Number(q.get('avgLoss')));
    const bankroll = Number(q.get('bankroll') ?? 0);
    const cap = Math.min(Math.max(Number(q.get('maxRiskPct') ?? 2), 0.1), 25) / 100;
    if (!(p > 0 && p < 1) || !(avgWin > 0) || !(avgLoss > 0)) throw new DataError('winRate (0-1), avgWin (>0) and avgLoss (>0) required', 400);
    const b = avgWin / avgLoss;
    const kelly = p - (1 - p) / b;
    const edge = p * avgWin - (1 - p) * avgLoss;
    const stop = Number(q.get('stopLossPct') ?? 0) / 100;
    const riskFraction = Math.max(0, Math.min(kelly / 2, cap));
    return {
      inputs: { winRate: p, avgWin, avgLoss, payoffRatio: round(b, 3), bankroll: bankroll || null, maxRiskPct: cap * 100 },
      expectancyPerTrade: round(edge, 4),
      hasEdge: kelly > 0,
      kellyFraction: round(kelly, 4),
      halfKelly: round(Math.max(0, kelly / 2), 4),
      recommendedRiskFraction: round(riskFraction, 4),
      ...(bankroll ? { riskAmount: round(bankroll * riskFraction, 2), ...(stop > 0 ? { positionSize: round((bankroll * riskFraction) / stop, 2), stopLossPct: stop * 100 } : {}) } : {}),
      note: kelly <= 0 ? 'Negative edge: Kelly says do not take this trade.' : 'Half Kelly capped at maxRiskPct; full Kelly is too volatile for real trading.',
    };
  },

  async space_weather(_q, env) {
    type K = { time_tag: string; kp_index: number; estimated_kp: number }[];
    type Wn = { time_tag: string; proton_speed: number; proton_density: number; active: boolean }[];
    const [kp, wind] = await Promise.all([
      cached(env, 'noaa:kp', 300, () => getJson<K>('https://services.swpc.noaa.gov/json/planetary_k_index_1m.json')),
      cached(env, 'noaa:wind', 300, () => getJson<Wn>('https://services.swpc.noaa.gov/json/rtsw/rtsw_wind_1m.json')).catch(() => [] as Wn),
    ]);
    const k = kp.at(-1);
    const w = wind.find((x) => x.active && x.proton_speed) ?? wind[0];
    const kpv = k?.estimated_kp ?? 0;
    return {
      kp: kpv,
      storm: kpv >= 9 ? 'G5 extreme' : kpv >= 8 ? 'G4 severe' : kpv >= 7 ? 'G3 strong' : kpv >= 6 ? 'G2 moderate' : kpv >= 5 ? 'G1 minor' : 'none',
      kpTime: k?.time_tag ?? null,
      solarWind: w ? { speedKmS: w.proton_speed, densityPcm3: w.proton_density, time: w.time_tag } : null,
      schumannBaseHz: 7.83,
      source: 'NOAA Space Weather Prediction Center',
    };
  },
};
