import { DataError, type DataEnv } from './data-tools';
import { COUNCIL_HANDLERS } from './council-tools';
import { DATA_HANDLERS } from './data-tools';
import { trendingTokens as gmgnTrending } from './gmgn';

type Handler = (q: URLSearchParams, env: DataEnv) => Promise<Record<string, unknown>>;

const round = (n: number, dp = 3) => Number(n.toFixed(dp));
const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));

interface SignalComponent {
  source: string;
  direction: 'bullish' | 'bearish' | 'neutral';
  strength: number; // 0-100
  detail: string;
}

interface CompositeSignal {
  chain: string;
  address: string;
  token: { symbol: string; name: string };
  signal: 'strong_buy' | 'buy' | 'neutral' | 'sell' | 'strong_sell';
  score: number; // -100 to 100
  confidence: number; // 0-1
  components: SignalComponent[];
  sizing: { kellyFraction: number; recommendedPct: number; maxPositionPct: number } | null;
  entry: { priceUsd: number; suggestedStopPct: number; suggestedTargetPct: number; riskReward: number } | null;
  warnings: string[];
  timestamp: string;
}

async function safeCall<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try { return await Promise.race([fn(), new Promise<T>((_, rej) => setTimeout(() => rej(new Error('timeout')), 8000))]); }
  catch { return fallback; }
}

function dirScore(dir: 'bullish' | 'bearish' | 'neutral', strength: number): number {
  if (dir === 'bullish') return strength;
  if (dir === 'bearish') return -strength;
  return 0;
}

function classifySignal(score: number): CompositeSignal['signal'] {
  if (score >= 55) return 'strong_buy';
  if (score >= 20) return 'buy';
  if (score <= -55) return 'strong_sell';
  if (score <= -20) return 'sell';
  return 'neutral';
}

export const SIGNAL_HANDLERS: Record<string, Handler> = {

  async composite_signal(q, env) {
    const chain = (q.get('chain') ?? '').toLowerCase();
    const address = (q.get('address') ?? '').trim();
    if (!chain || !address) throw new DataError('chain and address required', 400);

    const bankroll = Number(q.get('bankroll') || 0);
    const components: SignalComponent[] = [];
    const warnings: string[] = [];

    // 1. Council verdict (7-agent consensus)
    const council = await safeCall(
      () => COUNCIL_HANDLERS.council_verdict!(new URLSearchParams({ chain, address }), env) as Promise<Record<string, unknown>>,
      null,
    );

    let priceUsd = 0;
    let tokenInfo = { symbol: 'UNKNOWN', name: 'Unknown' };

    if (council) {
      const verdict = council.verdict as string;
      const consensus = council.consensus as number;
      const evidence = council.evidence as Record<string, unknown>;
      tokenInfo = council.token as { symbol: string; name: string };
      priceUsd = (evidence?.priceUsd as number) ?? 0;

      components.push({
        source: 'council_verdict',
        direction: verdict === 'buy' ? 'bullish' : verdict === 'avoid' ? 'bearish' : 'neutral',
        strength: Math.round(consensus * 80),
        detail: `Council: ${verdict} (${round(consensus * 100, 1)}% consensus)`,
      });

      if ((council.vetoedBy as string[])?.length) {
        warnings.push(`Vetoed by: ${(council.vetoedBy as string[]).join(', ')}`);
      }
      if ((evidence?.washScore as number) >= 50) warnings.push('Wash trading detected');
      if ((evidence?.audit as Record<string, unknown>)?.riskLevel === 'critical') warnings.push('Critical rug-pull risk');
    }

    // 2. Fear & Greed (market sentiment)
    const fg = await safeCall(
      () => DATA_HANDLERS.fear_greed!(new URLSearchParams(), env),
      null,
    );
    if (fg) {
      const value = (fg as Record<string, unknown>).value as number ?? 50;
      const cls = (fg as Record<string, unknown>).classification as string ?? 'neutral';
      components.push({
        source: 'fear_greed',
        direction: value >= 65 ? 'bullish' : value <= 35 ? 'bearish' : 'neutral',
        strength: Math.abs(value - 50) * 1.2,
        detail: `Fear/Greed: ${value} (${cls})`,
      });
    }

    // 3. Technical indicators (if we have a CEX symbol)
    const symbol = tokenInfo.symbol?.toUpperCase();
    if (symbol && !['UNKNOWN'].includes(symbol)) {
      const ta = await safeCall(
        () => DATA_HANDLERS.technical_indicators!(new URLSearchParams({ pair: `${symbol}-USDT`, interval: '1h' }), env),
        null,
      );
      if (ta) {
        const signal = (ta as Record<string, unknown>).signal as string;
        const trend = (ta as Record<string, unknown>).trend as string;
        const rsi = (ta as Record<string, unknown>).rsi14 as number;

        let dir: 'bullish' | 'bearish' | 'neutral' = 'neutral';
        let str = 30;
        if (signal === 'buy' || signal === 'strong_buy') { dir = 'bullish'; str = signal === 'strong_buy' ? 70 : 50; }
        else if (signal === 'sell' || signal === 'strong_sell') { dir = 'bearish'; str = signal === 'strong_sell' ? 70 : 50; }

        if (rsi > 80) warnings.push(`RSI overbought: ${round(rsi, 1)}`);
        if (rsi < 20) warnings.push(`RSI oversold: ${round(rsi, 1)}`);

        components.push({ source: 'technical_indicators', direction: dir, strength: str, detail: `TA: ${signal}, trend ${trend}, RSI ${round(rsi ?? 50, 1)}` });
      }
    }

    // 4. Funding rates (perp sentiment)
    if (symbol && !['UNKNOWN'].includes(symbol)) {
      const fr = await safeCall(
        () => DATA_HANDLERS.funding_rates!(new URLSearchParams({ symbol }), env),
        null,
      );
      if (fr) {
        const venues = (fr as Record<string, unknown>).venues as { fundingRate: number; annualizedPct: number }[];
        if (venues?.length) {
          const avgRate = venues.reduce((s, v) => s + v.fundingRate, 0) / venues.length;
          components.push({
            source: 'funding_rates',
            direction: avgRate > 0.0003 ? 'bearish' : avgRate < -0.0003 ? 'bullish' : 'neutral',
            strength: clamp(Math.abs(avgRate) * 100000, 0, 40),
            detail: `Funding: ${(avgRate * 100).toFixed(4)}% (${avgRate > 0 ? 'longs pay' : 'shorts pay'})`,
          });
          if (Math.abs(avgRate) > 0.001) warnings.push(`Extreme funding: ${(avgRate * 100).toFixed(4)}%`);
        }
      }
    }

    // 5. Hype signal
    const hype = await safeCall(
      () => COUNCIL_HANDLERS.hype_signal!(new URLSearchParams({ chain, address }), env),
      null,
    );
    if (hype) {
      const score = (hype as Record<string, unknown>).hypeScore as number ?? 0;
      const level = (hype as Record<string, unknown>).level as string;
      components.push({
        source: 'hype_signal',
        direction: score >= 35 ? 'bullish' : 'neutral',
        strength: clamp(score * 0.8, 0, 60),
        detail: `Hype: ${score}/100 (${level})`,
      });
      if (score >= 80) warnings.push('Extreme hype — late entry risk');
    }

    // Composite score: weighted average of component directions
    const weights: Record<string, number> = {
      council_verdict: 35,
      technical_indicators: 25,
      fear_greed: 10,
      funding_rates: 15,
      hype_signal: 15,
    };

    let totalWeight = 0;
    let weightedScore = 0;
    for (const c of components) {
      const w = weights[c.source] ?? 10;
      totalWeight += w;
      weightedScore += dirScore(c.direction, c.strength) * w;
    }

    const finalScore = totalWeight ? round(weightedScore / totalWeight, 1) : 0;
    const confidence = totalWeight ? round(Math.min(components.length / 5, 1) * (totalWeight / 100), 3) : 0;

    // Kelly sizing
    let sizing = null;
    if (bankroll > 0 && finalScore > 0) {
      const winRate = 0.5 + finalScore / 200; // map score to win rate
      const avgWin = 0.15; // 15% avg win
      const avgLoss = 0.08; // 8% avg loss
      const b = avgWin / avgLoss;
      const kelly = winRate - (1 - winRate) / b;
      const halfKelly = Math.max(0, kelly / 2);
      const maxRisk = 0.02; // 2% max
      const rec = Math.min(halfKelly, maxRisk);
      sizing = { kellyFraction: round(kelly, 4), recommendedPct: round(rec * 100, 2), maxPositionPct: 2 };
    }

    // Entry/exit suggestions
    let entry = null;
    if (priceUsd > 0 && finalScore !== 0) {
      const atr = 0.05; // 5% default ATR estimate
      const stopPct = round(atr * 1.5 * 100, 1);
      const targetPct = round(atr * 3 * 100, 1);
      entry = {
        priceUsd: round(priceUsd, 8),
        suggestedStopPct: finalScore > 0 ? stopPct : targetPct,
        suggestedTargetPct: finalScore > 0 ? targetPct : stopPct,
        riskReward: round(targetPct / stopPct, 2),
      };
    }

    const result: CompositeSignal = {
      chain, address,
      token: tokenInfo,
      signal: classifySignal(finalScore),
      score: finalScore,
      confidence,
      components,
      sizing,
      entry,
      warnings,
      timestamp: new Date().toISOString(),
    };

    return result as unknown as Record<string, unknown>;
  },

  async signal_scanner(q, env) {
    const chain = (q.get('chain') ?? 'solana').toLowerCase();
    const limit = Math.min(Math.max(Number(q.get('limit') || 10), 1), 20);
    const minScore = Number(q.get('minScore') || 0);

    // Get trending tokens from GMGN (sniper-grade data)
    type TrendToken = { address: string; symbol: string; price: number; priceChange1h: number; volume: number; marketCap: number; sniperCount?: number; isHoneypot?: boolean; rugRatio?: number };
    let trending: TrendToken[] = [];
    try {
      const chainMap: Record<string, string> = { solana: 'sol', ethereum: 'eth', base: 'base', bsc: 'bsc' };
      const raw = await gmgnTrending(new URLSearchParams({ chain: chainMap[chain] ?? 'sol', limit: String(limit * 3) }));
      trending = (raw.tokens ?? []) as TrendToken[];
    } catch { /* empty */ }

    // Filter out obvious honeypots/rugs
    const candidates = trending
      .filter(t => !t.isHoneypot && (t.rugRatio ?? 0) < 0.5)
      .slice(0, limit * 2);

    // Run composite signal on top candidates (parallel, max 5 at a time)
    const signals: Record<string, unknown>[] = [];
    const batches: TrendToken[][] = [];
    for (let i = 0; i < candidates.length; i += 5) batches.push(candidates.slice(i, i + 5));

    for (const batch of batches) {
      const results = await Promise.allSettled(
        batch.map(t =>
          SIGNAL_HANDLERS.composite_signal!(
            new URLSearchParams({ chain, address: t.address }),
            env,
          ).catch(() => null),
        ),
      );
      for (const r of results) {
        if (r.status === 'fulfilled' && r.value) signals.push(r.value);
      }
      if (signals.length >= limit) break;
    }

    const ranked = signals
      .filter(s => (s.score as number) >= minScore)
      .sort((a, b) => (b.score as number) - (a.score as number))
      .slice(0, limit);

    return {
      chain,
      scanned: candidates.length,
      results: ranked,
      timestamp: new Date().toISOString(),
      note: 'Automated signal scan. Each result combines council verdict, TA, funding, sentiment and hype. Not financial advice.',
    };
  },
};
