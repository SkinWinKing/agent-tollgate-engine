const GMGN_BASE = 'https://openapi.gmgn.ai';
const GMGN_KEY = 'gmgn_basesolbscethmonadtron';

export class GmgnError extends Error {
  constructor(message: string, readonly status: number = 502) { super(message); }
}

function authParams(): string {
  const ts = Math.floor(Date.now() / 1000);
  const id = crypto.randomUUID();
  return `timestamp=${ts}&client_id=${id}`;
}

async function gmgnGet(path: string, qs: URLSearchParams): Promise<unknown> {
  const url = `${GMGN_BASE}${path}?${qs}&${authParams()}`;
  const res = await fetch(url, {
    headers: { 'X-APIKEY': GMGN_KEY, accept: 'application/json' },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    if (res.status === 429) throw new GmgnError('GMGN rate limited', 429);
    throw new GmgnError(`GMGN ${res.status}: ${text.slice(0, 300)}`, res.status >= 500 ? 502 : 400);
  }
  const body = await res.json() as { code: number; data?: { code?: number; data?: unknown; [k: string]: unknown } };
  if (body.code !== 0) throw new GmgnError(`GMGN error code ${body.code}`, 502);
  return body.data?.data ?? body.data;
}

export async function trendingTokens(params: URLSearchParams) {
  const chain = params.get('chain') ?? 'sol';
  const interval = params.get('interval') ?? '1h';
  const limit = params.get('limit') ?? '20';
  const orderBy = params.get('orderBy') ?? 'default';
  const filters = params.get('filters') ?? 'not_honeypot';

  const qs = new URLSearchParams({ chain, interval, limit, order_by: orderBy, direction: 'desc', filters });
  const data = await gmgnGet('/v1/market/rank', qs) as { rank?: unknown[] };
  const raw = data?.rank ?? [];

  const tokens = (raw as any[]).map((t) => ({
    chain: t.chain,
    address: t.address,
    name: t.name,
    symbol: t.symbol,
    price: t.price,
    priceChange1h: t.price_change_percent1h,
    priceChange5m: t.price_change_percent5m,
    volume: t.volume,
    marketCap: t.market_cap,
    liquidity: t.liquidity,
    holders: t.holder_count,
    swaps: t.swaps,
    buys: t.buys,
    sells: t.sells,
    top10HolderRate: t.top_10_holder_rate,
    launchpad: t.launchpad_platform ?? t.launchpad,
    // Sniper-relevant data
    sniperCount: t.sniper_count,
    smartDegenCount: t.smart_degen_count,
    botDegenCount: t.bot_degen_count,
    bundlerRate: t.bundler_rate,
    rugRatio: t.rug_ratio,
    entrapmentRatio: t.entrapment_ratio,
    isHoneypot: t.is_honeypot === 1,
    renouncedMint: t.renounced_mint === 1,
    renouncedFreeze: t.renounced_freeze_account === 1,
    devTeamHoldRate: t.dev_team_hold_rate,
    twitter: t.twitter_username || null,
    website: t.website || null,
    createdAt: t.creation_timestamp ? new Date(t.creation_timestamp * 1000).toISOString() : null,
  }));

  return { chain, interval, count: tokens.length, tokens };
}

export async function gasPrice(params: URLSearchParams) {
  const chain = params.get('chain') ?? 'sol';
  const qs = new URLSearchParams({ chain });
  const data = await gmgnGet('/v1/trade/gas_price', qs) as Record<string, unknown>;
  return {
    chain: data.chain,
    nativeTokenUsd: data.native_token_usd_price,
    recommended: { fee: data.auto, mev: data.auto_mev },
    tiers: {
      high: { fee: data.high, estimateTimeSec: data.high_estimate_time },
      average: { fee: data.average, estimateTimeSec: data.average_estimate_time },
      low: { fee: data.low, estimateTimeSec: data.low_estimate_time },
    },
  };
}
