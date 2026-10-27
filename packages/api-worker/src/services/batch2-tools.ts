import { secp256k1 } from '@noble/curves/secp256k1';
import { sha256 } from '@noble/hashes/sha256';
import { keccak_256 } from '@noble/hashes/sha3';
import { cached, DATA_HANDLERS, DataError, type DataEnv } from './data-tools';

type Handler = (q: URLSearchParams, env: DataEnv) => Promise<Record<string, unknown>>;

const UA = 'AgentTollgate/1.0 (+https://skinwinking.com)';
const te = new TextEncoder();
const hex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
const round = (v: number, dp = 4) => Number(v.toFixed(dp));

function need(q: URLSearchParams, key: string, max = 100_000): string {
  const v = q.get(key);
  if (v === null || v.trim() === '') throw new DataError(`${key} required`, 400);
  if (v.length > max) throw new DataError(`${key} too long`, 400);
  return v;
}
function num(q: URLSearchParams, key: string, def?: number): number {
  const raw = q.get(key);
  if (raw === null || raw === '') {
    if (def === undefined) throw new DataError(`${key} required`, 400);
    return def;
  }
  const v = Number(raw);
  if (!Number.isFinite(v)) throw new DataError(`${key} must be a number`, 400);
  return v;
}
const int = (q: URLSearchParams, key: string, def: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.floor(num(q, key, def))));

async function getJson<T>(url: string, timeoutMs = 10_000): Promise<T> {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), headers: { accept: 'application/json', 'user-agent': UA } });
  if (res.status === 404) throw new DataError('Not found', 404);
  if (res.status === 429) throw new DataError('Upstream is rate limiting; retry shortly', 503);
  if (!res.ok) throw new DataError(`Upstream HTTP ${res.status}`, 502);
  return (await res.json()) as T;
}

function publicUrl(raw: string): URL {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new DataError('url must be an absolute http(s) URL', 400);
  }
  const h = u.hostname.toLowerCase();
  if (!['http:', 'https:'].includes(u.protocol) || /^[\d.]+$/.test(h) || h.includes(':') || h === 'localhost' || !h.includes('.') || /\.(local|internal|lan|home|localhost)$/.test(h)) throw new DataError('url must be a public http(s) URL', 400);
  return u;
}

// ---- base58 / bech32 ----
const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function b58encode(bytes: Uint8Array): string {
  let n = BigInt('0x' + (hex(bytes) || '0'));
  let out = '';
  while (n > 0n) {
    out = B58[Number(n % 58n)] + out;
    n /= 58n;
  }
  for (const b of bytes) {
    if (b) break;
    out = '1' + out;
  }
  return out;
}
function b58decode(s: string): Uint8Array {
  let n = 0n;
  for (const ch of s) {
    const i = B58.indexOf(ch);
    if (i < 0) throw new DataError(`invalid base58 character '${ch}'`, 400);
    n = n * 58n + BigInt(i);
  }
  const out: number[] = [];
  while (n > 0n) {
    out.unshift(Number(n % 256n));
    n /= 256n;
  }
  for (const ch of s) {
    if (ch !== '1') break;
    out.unshift(0);
  }
  return Uint8Array.from(out);
}
const BECH = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
function bech32Check(addr: string): { ok: boolean; variant?: string; hrp?: string } {
  const a = addr.toLowerCase();
  const pos = a.lastIndexOf('1');
  if (pos < 1 || pos + 7 > a.length) return { ok: false };
  const hrp = a.slice(0, pos);
  const data = [...a.slice(pos + 1)].map((c) => BECH.indexOf(c));
  if (data.some((d) => d < 0)) return { ok: false };
  const G = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
  let chk = 1;
  for (const v of [...[...hrp].map((c) => c.charCodeAt(0) >> 5), 0, ...[...hrp].map((c) => c.charCodeAt(0) & 31), ...data]) {
    const top = chk >> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ v;
    for (let i = 0; i < 5; i++) if ((top >> i) & 1) chk ^= G[i]!;
  }
  return chk === 1 ? { ok: true, variant: 'bech32', hrp } : chk === 0x2bc830a3 ? { ok: true, variant: 'bech32m', hrp } : { ok: false };
}
function evmChecksum(addr: string): string {
  const a = addr.toLowerCase().replace(/^0x/, '');
  const h = hex(keccak_256(te.encode(a)));
  return '0x' + [...a].map((c, i) => (parseInt(h[i]!, 16) >= 8 ? c.toUpperCase() : c)).join('');
}

// ---- CSV and markdown ----
function parseCsv(text: string): string[][] {
  const delim = [',', ';', '\t', '|'].sort((x, y) => (text.split('\n')[0] ?? '').split(y).length - (text.split('\n')[0] ?? '').split(x).length)[0]!;
  const rows: string[][] = [];
  let row: string[] = [], f = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (q) {
      if (c === '"' && text[i + 1] === '"') { f += '"'; i++; } else if (c === '"') q = false; else f += c;
    } else if (c === '"') q = true;
    else if (c === delim) { row.push(f); f = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(f); rows.push(row); row = []; f = ''; }
    else f += c;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  return rows.filter((r) => r.some((x) => x !== ''));
}
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
function inlineMd(s: string): string {
  return esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" rel="nofollow noopener">$1</a>');
}
function markdownToHtml(md: string): string {
  const out: string[] = [];
  let list: 'ul' | 'ol' | null = null, code = false;
  const close = () => { if (list) { out.push(`</${list}>`); list = null; } };
  for (const line of md.split('\n')) {
    if (line.startsWith('```')) { close(); out.push(code ? '</code></pre>' : '<pre><code>'); code = !code; continue; }
    if (code) { out.push(esc(line)); continue; }
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    const ul = line.match(/^\s*[-*+]\s+(.*)$/);
    const ol = line.match(/^\s*\d+\.\s+(.*)$/);
    if (h) { close(); out.push(`<h${h[1]!.length}>${inlineMd(h[2]!)}</h${h[1]!.length}>`); }
    else if (ul || ol) { const k = ul ? 'ul' : 'ol'; if (list !== k) { close(); out.push(`<${k}>`); list = k; } out.push(`<li>${inlineMd((ul ?? ol)![1]!)}</li>`); }
    else if (line.startsWith('>')) { close(); out.push(`<blockquote>${inlineMd(line.replace(/^>\s?/, ''))}</blockquote>`); }
    else if (line.trim() === '') close();
    else { close(); out.push(`<p>${inlineMd(line)}</p>`); }
  }
  close();
  if (code) out.push('</code></pre>');
  return out.join('\n');
}

// ---- cron ----
function cronField(spec: string, lo: number, hi: number): Set<number> {
  const out = new Set<number>();
  for (const part of spec.split(',')) {
    const [range, stepS] = part.split('/');
    const step = stepS ? Number(stepS) : 1;
    let a = lo, b = hi;
    if (range !== '*') { const [x, y] = range!.split('-').map(Number); a = x!; b = y ?? (stepS ? hi : x!); }
    if (![a, b, step].every(Number.isFinite) || a < lo || b > hi || step < 1) throw new DataError(`invalid cron field '${part}'`, 400);
    for (let v = a; v <= b; v += step) out.add(v);
  }
  return out;
}
function tzParts(d: Date, tz: string) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', weekday: 'short' }).formatToParts(d).map((x) => [x.type, x.value]));
  return { y: +p.year!, mo: +p.month!, d: +p.day!, h: +p.hour!, mi: +p.minute!, dow: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday!) };
}

const tokenEstimate = (text: string) => Math.max(1, Math.round(text.length / 4 * 0.6 + (text.match(/\S+/g)?.length ?? 0) * 1.3 * 0.4));

async function geo(place: string) {
  const g = await getJson<{ results?: { name: string; country?: string; latitude: number; longitude: number; timezone?: string }[] }>(`https://geocoding-api.open-meteo.com/v1/search?count=1&name=${encodeURIComponent(place.slice(0, 100))}`);
  const r = g.results?.[0];
  if (!r) throw new DataError(`Place not found: ${place}`, 404);
  return r;
}

export const BATCH2_HANDLERS: Record<string, Handler> = {
  // ---- crypto data ----
  async btc_network() {
    const [fees, pool, height] = await Promise.all([
      getJson<Record<string, number>>('https://mempool.space/api/v1/fees/recommended'),
      getJson<{ count: number; vsize: number; total_fee: number }>('https://mempool.space/api/mempool'),
      fetch('https://mempool.space/api/blocks/tip/height', { signal: AbortSignal.timeout(8000) }).then((r) => r.text()),
    ]);
    return { feesSatPerVb: { fastest: fees.fastestFee, halfHour: fees.halfHourFee, hour: fees.hourFee, economy: fees.economyFee, minimum: fees.minimumFee }, mempool: { transactions: pool.count, vsizeMb: round(pool.vsize / 1e6, 2), totalFeeBtc: round(pool.total_fee / 1e8, 4) }, blockHeight: Number(height), source: 'mempool.space' };
  },
  async crypto_global(_q, env) {
    type G = { data: { total_market_cap: Record<string, number>; total_volume: Record<string, number>; market_cap_percentage: Record<string, number>; market_cap_change_percentage_24h_usd: number; active_cryptocurrencies: number; markets: number } };
    const d = await cached(env, 'cg:global', 120, () => getJson<G>('https://api.coingecko.com/api/v3/global'))
      .then((g) => g.data)
      .catch(async () => {
        // CoinGecko rate-limits shared Cloudflare IPs; CoinPaprika is the fallback.
        const p = await cached(env, 'cp:global', 120, () => getJson<{ market_cap_usd: number; volume_24h_usd: number; bitcoin_dominance_percentage: number; cryptocurrencies_number: number; market_cap_change_24h: number }>('https://api.coinpaprika.com/v1/global'));
        return { total_market_cap: { usd: p.market_cap_usd }, total_volume: { usd: p.volume_24h_usd }, market_cap_percentage: { btc: p.bitcoin_dominance_percentage }, market_cap_change_percentage_24h_usd: p.market_cap_change_24h, active_cryptocurrencies: p.cryptocurrencies_number, markets: 0 } as G['data'];
      });
    const dom = Object.entries(d.market_cap_percentage).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => ({ asset: k.toUpperCase(), pct: round(v, 2) }));
    return { marketCapUsd: Math.round(d.total_market_cap.usd ?? 0), volume24hUsd: Math.round(d.total_volume.usd ?? 0), marketCapChange24hPct: round(d.market_cap_change_percentage_24h_usd, 2), btcDominancePct: round(d.market_cap_percentage.btc ?? 0, 2), ethDominancePct: round(d.market_cap_percentage.eth ?? 0, 2), dominance: dom, activeCryptocurrencies: d.active_cryptocurrencies, markets: d.markets, source: 'CoinGecko' };
  },
  async crypto_categories(q, env) {
    type C = { name: string; market_cap: number | null; market_cap_change_24h: number | null; volume_24h: number | null }[];
    const rows = await cached(env, 'cg:categories', 600, () => getJson<C>('https://api.coingecko.com/api/v3/coins/categories'));
    const top = rows.filter((c) => (c.market_cap ?? 0) > 50_000_000 && c.market_cap_change_24h !== null).sort((a, b) => b.market_cap_change_24h! - a.market_cap_change_24h!);
    const lim = int(q, 'limit', 15, 1, 50);
    const map = (c: C[number]) => ({ category: c.name, change24hPct: round(c.market_cap_change_24h ?? 0, 2), marketCapUsd: Math.round(c.market_cap ?? 0), volume24hUsd: Math.round(c.volume_24h ?? 0) });
    return { leaders: top.slice(0, lim).map(map), laggards: top.slice(-Math.min(lim, 10)).reverse().map(map), note: 'Categories with market cap above $50M', source: 'CoinGecko' };
  },
  async multi_chain_gas(_q, env) {
    const chains = ['ethereum', 'base', 'arbitrum', 'polygon', 'solana'];
    const rows = await Promise.all(chains.map((chain) => DATA_HANDLERS.gas_price!(new URLSearchParams({ chain }), env).catch((e: Error) => ({ chain, error: e.message }))));
    return { chains: rows, note: 'EVM values in gwei; Solana in micro-lamports per compute unit (p50 = typical priority fee).' };
  },
  async stablecoin_chains(q, env) {
    type S = { name: string; totalCirculatingUSD?: { peggedUSD?: number } }[];
    const rows = await cached(env, 'llama:stablechains', 600, () => getJson<S>('https://stablecoins.llama.fi/stablecoinchains'));
    const list = rows.map((r) => ({ chain: r.name, supplyUsd: Math.round(r.totalCirculatingUSD?.peggedUSD ?? 0) })).sort((a, b) => b.supplyUsd - a.supplyUsd);
    const total = list.reduce((a, r) => a + r.supplyUsd, 0);
    return { totalUsd: total, chains: list.slice(0, int(q, 'limit', 15, 1, 50)).map((r) => ({ ...r, sharePct: round((r.supplyUsd / total) * 100, 2) })), source: 'DefiLlama' };
  },
  async top_movers(q, env) {
    type T = { symbol: string; openPrice: string; lastPrice: string; quoteVolume: string }[];
    const rows = await cached(env, 'bn:mini', 60, () => getJson<T>('https://data-api.binance.vision/api/v3/ticker/24hr?type=MINI', 12_000)).catch(async () => {
      // Binance blocks some Cloudflare locations; Bybit spot tickers carry the same fields.
      const b = await cached(env, 'by:spot', 60, () => getJson<{ result: { list: { symbol: string; lastPrice: string; prevPrice24h: string; turnover24h: string }[] } }>('https://api.bybit.com/v5/market/tickers?category=spot'));
      return b.result.list.map((x) => ({ symbol: x.symbol, openPrice: x.prevPrice24h, lastPrice: x.lastPrice, quoteVolume: x.turnover24h }));
    });
    const minVol = num(q, 'minVolumeUsd', 5_000_000);
    const lim = int(q, 'limit', 10, 1, 30);
    const list = rows
      .filter((r) => r.symbol.endsWith('USDT') && !/(UP|DOWN|BULL|BEAR)USDT$/.test(r.symbol) && Number(r.quoteVolume) >= minVol && Number(r.openPrice) > 0)
      .map((r) => ({ symbol: r.symbol.replace(/USDT$/, ''), price: Number(r.lastPrice), change24hPct: round(((Number(r.lastPrice) - Number(r.openPrice)) / Number(r.openPrice)) * 100, 2), volume24hUsd: Math.round(Number(r.quoteVolume)) }))
      .sort((a, b) => b.change24hPct - a.change24hPct);
    return { gainers: list.slice(0, lim), losers: list.slice(-lim).reverse(), universe: list.length, source: 'Binance or Bybit spot (USDT pairs)' };
  },
  async fx_history(q) {
    const from = need(q, 'from', 10), to = need(q, 'to', 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) throw new DataError('dates must be YYYY-MM-DD', 400);
    const base = (q.get('base') ?? 'EUR').toUpperCase(), sym = q.get('symbols')?.toUpperCase().replace(/\s/g, '');
    if (!/^[A-Z]{3}$/.test(base) || (sym && !/^[A-Z]{3}(,[A-Z]{3})*$/.test(sym))) throw new DataError('currencies must be ISO codes', 400);
    const d = await getJson<{ rates: Record<string, Record<string, number>> }>(`https://api.frankfurter.app/${from}..${to}?from=${base}${sym ? `&to=${sym}` : ''}`);
    const days = Object.keys(d.rates).sort();
    const first = d.rates[days[0]!] ?? {}, last = d.rates[days.at(-1)!] ?? {};
    return { base, from, to, days: days.length, change: Object.fromEntries(Object.keys(last).map((k) => [k, { first: first[k], last: last[k], changePct: first[k] ? round(((last[k]! - first[k]!) / first[k]!) * 100, 3) : null }])), rates: d.rates, source: 'ECB via frankfurter.app' };
  },

  // ---- finance calculators ----
  async apr_apy(q) {
    const n = int(q, 'periodsPerYear', 365, 1, 1_000_000);
    if (q.get('apy')) {
      const apy = num(q, 'apy') / 100;
      const apr = n * (Math.pow(1 + apy, 1 / n) - 1);
      return { apyPct: apy * 100, aprPct: round(apr * 100, 4), periodsPerYear: n, dailyRatePct: round((apr / 365) * 100, 6) };
    }
    const apr = num(q, 'apr') / 100;
    const apy = Math.pow(1 + apr / n, n) - 1;
    return { aprPct: apr * 100, apyPct: round(apy * 100, 4), periodsPerYear: n, dailyRatePct: round((apr / 365) * 100, 6), monthlyRatePct: round((apr / 12) * 100, 4) };
  },
  async impermanent_loss(q) {
    const r = 1 + num(q, 'priceChangePct') / 100;
    if (r <= 0) throw new DataError('priceChangePct must be above -100', 400);
    const il = (2 * Math.sqrt(r)) / (1 + r) - 1;
    const days = num(q, 'days', 30), fee = num(q, 'feeAprPct', 0) / 100;
    const earned = (fee * days) / 365;
    return { priceRatio: round(r, 4), impermanentLossPct: round(il * 100, 4), feesEarnedPct: round(earned * 100, 4), netVsHoldPct: round((il + earned) * 100, 4), breakEvenFeeAprPct: days ? round(((-il * 365) / days) * 100, 2) : null, note: 'Constant-product (x*y=k) 50/50 pool.' };
  },
  async liquidation_price(q) {
    const entry = num(q, 'entry'), lev = num(q, 'leverage'), mm = num(q, 'maintenanceMarginPct', 0.5) / 100, side = need(q, 'side', 5).toLowerCase();
    if (!(lev >= 1)) throw new DataError('leverage must be at least 1', 400);
    if (side !== 'long' && side !== 'short') throw new DataError('side must be long or short', 400);
    const liq = side === 'long' ? entry * (1 - 1 / lev + mm) : entry * (1 + 1 / lev - mm);
    return { side, entry, leverage: lev, maintenanceMarginPct: mm * 100, liquidationPrice: round(liq, 8), distancePct: round((Math.abs(entry - liq) / entry) * 100, 3), note: 'Isolated margin estimate; exchanges add fees and funding.' };
  },
  async position_pnl(q) {
    const entry = num(q, 'entry'), exit = num(q, 'exit'), size = num(q, 'size'), lev = num(q, 'leverage', 1), feePct = num(q, 'feePct', 0.1) / 100, side = need(q, 'side', 5).toLowerCase();
    if (side !== 'long' && side !== 'short') throw new DataError('side must be long or short', 400);
    const gross = (side === 'long' ? exit - entry : entry - exit) * size;
    const fees = ((entry + exit) / 2) * size * feePct;
    const margin = (entry * size) / Math.max(lev, 1);
    return { side, grossPnl: round(gross, 6), fees: round(fees, 6), netPnl: round(gross - fees, 6), pricePct: round(((exit - entry) / entry) * 100 * (side === 'long' ? 1 : -1), 4), margin: round(margin, 6), returnOnMarginPct: round(((gross - fees) / margin) * 100, 3) };
  },
  async dca_plan(q) {
    const pair = need(q, 'pair', 20).toUpperCase().replace(/[-/_\s]/g, '');
    if (!/^[A-Z0-9]{5,15}$/.test(pair)) throw new DataError('pair must look like BTC-USDT', 400);
    const amount = num(q, 'amount'), every = int(q, 'everyDays', 7, 1, 90), days = int(q, 'days', 365, 7, 1000);
    const k = await getJson<string[][]>(`https://data-api.binance.vision/api/v3/klines?symbol=${pair}&interval=1d&limit=${days}`).catch(async () => {
      const b = await getJson<{ retCode: number; result: { list: string[][] } }>(`https://api.bybit.com/v5/market/kline?category=spot&symbol=${pair}&interval=D&limit=${days}`);
      if (b.retCode !== 0) throw new DataError(`No price history for ${pair}`, 404);
      return b.result.list.reverse();
    });
    if (!k.length) throw new DataError('No price history', 404);
    let coins = 0, invested = 0, buys = 0;
    for (let i = 0; i < k.length; i += every) { const px = Number(k[i]![4]); coins += amount / px; invested += amount; buys++; }
    const last = Number(k.at(-1)![4]), firstPx = Number(k[0]![4]), value = coins * last, lump = (invested / firstPx) * last;
    return { pair, buys, invested: round(invested, 2), coins: round(coins, 8), averageCost: round(invested / coins, 6), lastPrice: last, value: round(value, 2), returnPct: round(((value - invested) / invested) * 100, 2), lumpSumValue: round(lump, 2), lumpSumReturnPct: round(((lump - invested) / invested) * 100, 2), from: new Date(Number(k[0]![0])).toISOString().slice(0, 10) };
  },
  async compound_interest(q) {
    const p = num(q, 'principal'), r = num(q, 'ratePct') / 100, years = num(q, 'years'), c = num(q, 'contribution', 0), n = int(q, 'periodsPerYear', 12, 1, 365);
    if (years > 100) throw new DataError('years must be 100 or less', 400);
    let bal = p, contributed = p;
    const schedule: { year: number; balance: number; contributed: number; interest: number }[] = [];
    for (let i = 1; i <= Math.round(years * n); i++) { bal = bal * (1 + r / n) + c; contributed += c; if (i % n === 0) schedule.push({ year: i / n, balance: round(bal, 2), contributed: round(contributed, 2), interest: round(bal - contributed, 2) }); }
    return { futureValue: round(bal, 2), totalContributed: round(contributed, 2), totalInterest: round(bal - contributed, 2), schedule: schedule.slice(0, 100) };
  },
  async loan_payment(q) {
    const P = num(q, 'principal'), n = int(q, 'periodsPerYear', 12, 1, 365), N = Math.round(num(q, 'years') * n), r = num(q, 'ratePct') / 100 / n;
    if (!(N > 0)) throw new DataError('years must be positive', 400);
    const pay = r === 0 ? P / N : (P * r) / (1 - Math.pow(1 + r, -N));
    const firstInterest = P * r;
    return { payment: round(pay, 2), payments: N, totalPaid: round(pay * N, 2), totalInterest: round(pay * N - P, 2), firstPayment: { interest: round(firstInterest, 2), principal: round(pay - firstInterest, 2) } };
  },
  async break_even_price(q) {
    const e = num(q, 'entry'), f = num(q, 'feePct', 0.1) / 100, sl = num(q, 'slippagePct', 0.1) / 100, side = (q.get('side') ?? 'long').toLowerCase();
    const c = f + sl;
    const be = side === 'short' ? (e * (1 - c)) / (1 + c) : (e * (1 + c)) / (1 - c);
    return { side, entry: e, breakEvenPrice: round(be, 8), movePct: round(((be - e) / e) * 100, 4), costPerSidePct: round(c * 100, 4) };
  },
  async risk_reward(q) {
    const e = num(q, 'entry'), s = num(q, 'stop'), t = num(q, 'target');
    const risk = Math.abs(e - s), reward = Math.abs(t - e);
    if (!risk) throw new DataError('stop must differ from entry', 400);
    const rr = reward / risk, amt = q.get('riskAmount') ? num(q, 'riskAmount') : null;
    return { riskPerUnit: round(risk, 8), rewardPerUnit: round(reward, 8), riskReward: round(rr, 3), winRateNeededPct: round((1 / (1 + rr)) * 100, 2), ...(amt ? { positionSize: round(amt / risk, 8), notional: round((amt / risk) * e, 2), potentialProfit: round(amt * rr, 2) } : {}), direction: t > e ? 'long' : 'short' };
  },
  async percent_change(q) {
    const out: Record<string, unknown> = {};
    if (q.get('from') && q.get('to')) { const a = num(q, 'from'), b = num(q, 'to'); out.change = { from: a, to: b, changePct: a ? round(((b - a) / Math.abs(a)) * 100, 6) : null, difference: b - a }; }
    if (q.get('percent') && q.get('of')) { const p = num(q, 'percent'), o = num(q, 'of'); out.percentOf = { value: round((p / 100) * o, 8), plus: round(o * (1 + p / 100), 8), minus: round(o * (1 - p / 100), 8), originalBeforeIncrease: round(o / (1 + p / 100), 8) }; }
    if (!Object.keys(out).length) throw new DataError('give from and to, or percent and of', 400);
    return out;
  },

  // ---- text ----
  async slugify(q) {
    const max = int(q, 'maxLength', 80, 1, 200);
    const slug = need(q, 'text', 2000).normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, max).replace(/-+$/, '');
    return { slug };
  },
  async case_convert(q) {
    const words = need(q, 'text', 2000).replace(/([a-z0-9])([A-Z])/g, '$1 $2').split(/[^A-Za-z0-9]+/).filter(Boolean).map((w) => w.toLowerCase());
    const cap = (w: string) => w[0]!.toUpperCase() + w.slice(1);
    return { camel: words.map((w, i) => (i ? cap(w) : w)).join(''), pascal: words.map(cap).join(''), snake: words.join('_'), kebab: words.join('-'), constant: words.join('_').toUpperCase(), title: words.map(cap).join(' '), sentence: words.length ? cap(words.join(' ')) : '', upper: words.join(' ').toUpperCase(), lower: words.join(' ') };
  },
  async regex_extract(q) {
    const text = need(q, 'text', 100_000), pattern = need(q, 'pattern', 500);
    const flags = (q.get('flags') ?? 'g').replace(/[^gimsuy]/g, '');
    let re: RegExp;
    try { re = new RegExp(pattern, flags.includes('g') ? flags : flags + 'g'); } catch (e) { throw new DataError(`invalid regex: ${(e as Error).message}`, 400); }
    if (q.get('replace') !== null) return { result: text.replace(re, q.get('replace')!) };
    const matches = [...text.matchAll(re)].slice(0, 1000).map((m) => ({ match: m[0], index: m.index, groups: m.slice(1), named: m.groups ?? null }));
    return { count: matches.length, matches };
  },
  async text_diff(q) {
    const a = need(q, 'a', 50_000), b = need(q, 'b', 50_000);
    const diff = (x: string[], y: string[]) => {
      if (x.length * y.length > 4_000_000) throw new DataError('texts too long to diff', 413);
      const dp = Array.from({ length: x.length + 1 }, () => new Uint32Array(y.length + 1));
      for (let i = x.length - 1; i >= 0; i--) for (let j = y.length - 1; j >= 0; j--) dp[i]![j] = x[i] === y[j] ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
      const ops: { op: string; text: string }[] = [];
      let i = 0, j = 0;
      while (i < x.length && j < y.length) { if (x[i] === y[j]) { ops.push({ op: '=', text: x[i]! }); i++; j++; } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) ops.push({ op: '-', text: x[i++]! }); else ops.push({ op: '+', text: y[j++]! }); }
      while (i < x.length) ops.push({ op: '-', text: x[i++]! });
      while (j < y.length) ops.push({ op: '+', text: y[j++]! });
      return { ops, common: dp[0]![0]! };
    };
    const lines = diff(a.split('\n'), b.split('\n'));
    const wa = a.split(/\s+/).filter(Boolean), wb = b.split(/\s+/).filter(Boolean);
    const words = diff(wa, wb);
    return { similarity: round((2 * words.common) / Math.max(1, wa.length + wb.length), 4), lines: lines.ops.filter((o) => o.op !== '='), words: { added: words.ops.filter((o) => o.op === '+').map((o) => o.text), removed: words.ops.filter((o) => o.op === '-').map((o) => o.text) } };
  },
  async password_generate(q) {
    const len = int(q, 'length', 20, 8, 128), count = int(q, 'count', 1, 1, 20);
    const set = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789' + (q.get('symbols') === 'false' ? '' : '!@#$%^&*()-_=+[]{}');
    const pick = () => { const buf = crypto.getRandomValues(new Uint32Array(len)); return [...buf].map((v) => set[v % set.length]).join(''); };
    return { passwords: Array.from({ length: count }, pick), entropyBits: round(len * Math.log2(set.length), 1) };
  },
  async hmac_sign(q) {
    const algo = { sha256: 'SHA-256', sha384: 'SHA-384', sha512: 'SHA-512' }[(q.get('algo') ?? 'sha256').toLowerCase()];
    if (!algo) throw new DataError('algo must be sha256, sha384 or sha512', 400);
    const key = await crypto.subtle.importKey('raw', te.encode(need(q, 'secret', 4096)), { name: 'HMAC', hash: algo }, false, ['sign']);
    const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, te.encode(need(q, 'message'))));
    return { algo, hex: hex(sig), base64: btoa(String.fromCharCode(...sig)) };
  },
  async json_query(q) {
    let data: unknown;
    try { data = JSON.parse(need(q, 'json', 500_000)); } catch { throw new DataError('json is not valid JSON', 400); }
    const tokens = need(q, 'path', 500).replace(/^\$\.?/, '').match(/[^.[\]]+|\[(\*|\d+)\]/g) ?? [];
    let cur: unknown[] = [data];
    for (const tk of tokens) {
      const next: unknown[] = [];
      for (const v of cur) {
        if (tk === '[*]' || tk === '*') { if (Array.isArray(v)) next.push(...v); else if (v && typeof v === 'object') next.push(...Object.values(v)); }
        else if (/^\[\d+\]$/.test(tk)) { if (Array.isArray(v)) next.push(v[Number(tk.slice(1, -1))]); }
        else if (v && typeof v === 'object' && tk in (v as object)) next.push((v as Record<string, unknown>)[tk]);
      }
      cur = next.filter((x) => x !== undefined);
    }
    return { count: cur.length, results: cur.slice(0, 1000) };
  },
  async csv_stats(q) {
    const [head, ...rows] = parseCsv(need(q, 'csv', 1_000_000));
    if (!head) throw new DataError('empty CSV', 400);
    const columns = head.map((name, i) => {
      const vals = rows.map((r) => (r[i] ?? '').trim());
      const filled = vals.filter((v) => v !== '');
      const nums = filled.map(Number).filter((v) => Number.isFinite(v));
      const numeric = filled.length > 0 && nums.length / filled.length > 0.9;
      const base = { name: name || `column${i + 1}`, type: numeric ? 'number' : 'text', count: vals.length, empty: vals.length - filled.length, unique: new Set(filled).size };
      if (!numeric) return { ...base, top: [...filled.reduce((m, v) => m.set(v, (m.get(v) ?? 0) + 1), new Map<string, number>())].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([value, n]) => ({ value, n })) };
      const s = [...nums].sort((a, b) => a - b), mean = s.reduce((a, b) => a + b, 0) / s.length;
      return { ...base, min: s[0], max: s.at(-1), mean: round(mean, 6), median: s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1]! + s[s.length / 2]!) / 2, stdev: round(Math.sqrt(s.reduce((a, v) => a + (v - mean) ** 2, 0) / s.length), 6), sum: round(s.reduce((a, b) => a + b, 0), 6) };
    });
    return { rows: rows.length, columns };
  },
  async markdown_to_html(q) {
    return { html: markdownToHtml(need(q, 'markdown', 200_000)) };
  },
  async token_count(q) {
    const text = need(q, 'text', 2_000_000);
    const tokens = tokenEstimate(text);
    return { characters: text.length, words: text.match(/\S+/g)?.length ?? 0, estimatedTokens: tokens, costAtPricePerMillion: Object.fromEntries([0.15, 1, 3, 15].map((p) => [`$${p}`, round((tokens / 1e6) * p, 6)])), note: 'Estimate for BPE tokenizers (GPT, Claude, Llama); exact counts vary by model.' };
  },
  async redact_pii(q) {
    let text = need(q, 'text', 500_000);
    const found: Record<string, number> = {};
    const luhn = (d: string) => { let s = 0, alt = false; for (let i = d.length - 1; i >= 0; i--) { let n = +d[i]!; if (alt) { n *= 2; if (n > 9) n -= 9; } s += n; alt = !alt; } return s % 10 === 0; };
    const rules: [string, RegExp, (m: string) => boolean][] = [
      ['private_key', /\b(0x)?[0-9a-fA-F]{64}\b|-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]+?-----END [A-Z ]*PRIVATE KEY-----/g, () => true],
      ['api_key', /\b(sk|pk|rk)_(live|test)_[0-9A-Za-z]{16,}\b|\bgh[pousr]_[0-9A-Za-z]{30,}\b|\bAKIA[0-9A-Z]{16}\b|\bxox[abp]-[0-9A-Za-z-]{10,}\b/g, () => true],
      ['email', /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, () => true],
      ['credit_card', /\b(?:\d[ -]?){13,19}\b/g, (m) => luhn(m.replace(/\D/g, ''))],
      ['iban', /\b[A-Z]{2}\d{2}(?:\s?[A-Z0-9]{4}){2,7}\s?[A-Z0-9]{1,4}\b/g, () => true],
      ['ip', /\b(?:\d{1,3}\.){3}\d{1,3}\b/g, () => true],
      ['phone', /(?:\+\d{1,3}[\s.-]?)?(?:\(?\d{2,4}\)?[\s.-]?)\d{3}[\s.-]?\d{3,4}\b/g, (m) => m.replace(/\D/g, '').length >= 8],
    ];
    for (const [kind, re, ok] of rules) text = text.replace(re, (m) => { if (!ok(m)) return m; found[kind] = (found[kind] ?? 0) + 1; return `[${kind.toUpperCase()}]`; });
    return { redacted: text, found };
  },
  async color_convert(q) {
    const raw = need(q, 'color', 60).trim().toLowerCase();
    let r: number, g: number, b: number;
    const hx = raw.match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/);
    const rg = raw.match(/^rgba?\((\d+)[,\s]+(\d+)[,\s]+(\d+)/);
    const hs = raw.match(/^hsla?\(([\d.]+)[,\s]+([\d.]+)%?[,\s]+([\d.]+)%?/);
    if (hx) { const v = hx[1]!.length === 3 ? [...hx[1]!].map((c) => c + c).join('') : hx[1]!; [r, g, b] = [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16)) as [number, number, number]; }
    else if (rg) [r, g, b] = [rg[1], rg[2], rg[3]].map(Number) as [number, number, number];
    else if (hs) { const h = +hs[1]! / 360, s = +hs[2]! / 100, l = +hs[3]! / 100; const f = (n: number) => { const k = (n + h * 12) % 12, a = s * Math.min(l, 1 - l); return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))); }; [r, g, b] = [f(0), f(8), f(4)]; }
    else throw new DataError('color must be #hex, rgb() or hsl()', 400);
    const mx = Math.max(r, g, b) / 255, mn = Math.min(r, g, b) / 255, l = (mx + mn) / 2, d = mx - mn;
    let h = 0;
    if (d) { const rr = r / 255, gg = g / 255, bb = b / 255; h = mx === rr ? ((gg - bb) / d) % 6 : mx === gg ? (bb - rr) / d + 2 : (rr - gg) / d + 4; h = Math.round(h * 60 + 360) % 360; }
    const s = d ? d / (1 - Math.abs(2 * l - 1)) : 0;
    const toHex = (x: number, y: number, z: number) => '#' + [x, y, z].map((v) => v.toString(16).padStart(2, '0')).join('');
    const lum = (x: number) => { const c = x / 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
    const L = 0.2126 * lum(r) + 0.7152 * lum(g) + 0.0722 * lum(b);
    const hslHex = (hh: number) => { const f = (n: number) => { const k = (n + hh / 30) % 12, a = s * Math.min(l, 1 - l); return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))); }; return toHex(f(0), f(8), f(4)); };
    return { hex: toHex(r, g, b), rgb: `rgb(${r}, ${g}, ${b})`, hsl: `hsl(${h}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%)`, complementary: hslHex((h + 180) % 360), analogous: [hslHex((h + 330) % 360), hslHex((h + 30) % 360)], contrast: { onWhite: round(1.05 / (L + 0.05), 2), onBlack: round((L + 0.05) / 0.05, 2) }, readableText: L > 0.179 ? '#000000' : '#ffffff' };
  },

  // ---- encoding and signatures ----
  async base58_codec(q) {
    const v = need(q, 'value', 10_000).trim();
    if ((q.get('mode') ?? 'decode') === 'encode') {
      const bytes = (q.get('input') ?? 'hex') === 'text' ? te.encode(v) : Uint8Array.from((v.replace(/^0x/, '').match(/../g) ?? []).map((h) => parseInt(h, 16)));
      return { base58: b58encode(bytes), bytes: bytes.length };
    }
    const b = b58decode(v);
    return { hex: hex(b), bytes: b.length, text: new TextDecoder('utf-8', { fatal: false }).decode(b), looksLikeSolanaKey: b.length === 32 };
  },
  async hex_codec(q) {
    const v = need(q, 'value', 10_000).trim(), from = need(q, 'from', 10).toLowerCase();
    let bytes: Uint8Array;
    if (from === 'text') bytes = te.encode(v);
    else if (from === 'hex') { const h = v.replace(/^0x/i, ''); if (!/^[0-9a-f]*$/i.test(h)) throw new DataError('invalid hex', 400); bytes = Uint8Array.from(((h.length % 2 ? '0' + h : h).match(/../g) ?? []).map((x) => parseInt(x, 16))); }
    else if (from === 'decimal') { if (!/^\d+$/.test(v)) throw new DataError('invalid decimal', 400); let n = BigInt(v); const out: number[] = []; while (n > 0n) { out.unshift(Number(n & 255n)); n >>= 8n; } bytes = Uint8Array.from(out.length ? out : [0]); }
    else throw new DataError('from must be text, hex or decimal', 400);
    const h = hex(bytes);
    return { hex: '0x' + h, decimal: BigInt('0x' + (h || '0')).toString(), text: new TextDecoder('utf-8', { fatal: false }).decode(bytes), bytes: bytes.length, ...(bytes.length <= 32 && from !== 'text' ? { asEther: Number(BigInt('0x' + (h || '0'))) / 1e18 } : {}) };
  },
  async url_codec(q) {
    const v = need(q, 'value', 100_000);
    if ((q.get('mode') ?? 'encode') === 'decode') { try { return { decoded: decodeURIComponent(v.replace(/\+/g, ' ')) }; } catch { throw new DataError('malformed percent-encoding', 400); } }
    return { component: encodeURIComponent(v), uri: encodeURI(v) };
  },
  async address_validate(q) {
    const a = need(q, 'address', 120).trim();
    if (/^0x[0-9a-fA-F]{40}$/.test(a)) { const cs = evmChecksum(a); const mixed = a !== a.toLowerCase() && a !== a.toUpperCase().replace('0X', '0x'); return { chain: 'evm', valid: !mixed || a === cs, checksummed: cs, checksumProvided: mixed, checksumValid: mixed ? a === cs : null }; }
    if (/^(bc|tb|bcrt)1[0-9a-z]{8,87}$/i.test(a)) { const r = bech32Check(a); return { chain: 'bitcoin', format: r.variant ?? 'bech32', valid: r.ok, network: r.hrp === 'bc' ? 'mainnet' : 'testnet', type: a.length > 50 ? (r.variant === 'bech32m' ? 'taproot (P2TR)' : 'P2WSH') : 'P2WPKH' }; }
    if (/^[1-9A-HJ-NP-Za-km-z]{25,44}$/.test(a)) {
      const b = b58decode(a);
      if (b.length === 25) { const ok = hex(sha256(sha256(b.slice(0, 21))).slice(0, 4)) === hex(b.slice(21)); const v = b[0]; return { chain: 'bitcoin', format: 'base58check', valid: ok, type: v === 0 ? 'P2PKH (1…)' : v === 5 ? 'P2SH (3…)' : v === 111 ? 'testnet P2PKH' : 'unknown version', network: v === 0 || v === 5 ? 'mainnet' : 'other' }; }
      if (b.length === 32) return { chain: 'solana', valid: true, note: 'Valid 32-byte public key; use address_check to see if it is a wallet, program or mint.' };
    }
    return { chain: 'unknown', valid: false };
  },
  async evm_signature_verify(q) {
    const msg = te.encode(need(q, 'message', 100_000)), sigHex = need(q, 'signature', 200).replace(/^0x/, '');
    if (!/^[0-9a-f]{130}$/i.test(sigHex)) throw new DataError('signature must be 65 bytes hex', 400);
    const digest = keccak_256(new Uint8Array([...te.encode(`\x19Ethereum Signed Message:\n${msg.length}`), ...msg]));
    const v = parseInt(sigHex.slice(128, 130), 16);
    let signer: string;
    try { const sig = secp256k1.Signature.fromCompact(sigHex.slice(0, 128)).addRecoveryBit(v >= 27 ? v - 27 : v); signer = evmChecksum('0x' + hex(keccak_256(sig.recoverPublicKey(digest).toRawBytes(false).slice(1))).slice(-40)); } catch { throw new DataError('signature could not be recovered', 400); }
    const expected = q.get('address');
    return { signer, ...(expected ? { matches: signer.toLowerCase() === expected.toLowerCase() } : {}), standard: 'EIP-191 personal_sign' };
  },
  async solana_signature_verify(q) {
    const addr = need(q, 'address', 60), sigRaw = need(q, 'signature', 200);
    const pub = b58decode(addr);
    if (pub.length !== 32) throw new DataError('address must be a Solana public key', 400);
    const sig = /^[0-9a-f]{128}$/i.test(sigRaw) ? Uint8Array.from(sigRaw.match(/../g)!.map((h) => parseInt(h, 16))) : b58decode(sigRaw);
    if (sig.length !== 64) throw new DataError('signature must be 64 bytes', 400);
    const key = await crypto.subtle.importKey('raw', new Uint8Array(pub), { name: 'Ed25519' }, false, ['verify']);
    return { valid: await crypto.subtle.verify({ name: 'Ed25519' }, key, new Uint8Array(sig), te.encode(need(q, 'message', 100_000))), address: addr, standard: 'ed25519 signMessage' };
  },

  // ---- time ----
  async cron_next(q) {
    const expr = need(q, 'cron', 100).trim().split(/\s+/);
    if (expr.length !== 5) throw new DataError('cron must have 5 fields: minute hour day month weekday', 400);
    const [mi, h, dom, mo, dow] = [cronField(expr[0]!, 0, 59), cronField(expr[1]!, 0, 23), cronField(expr[2]!, 1, 31), cronField(expr[3]!, 1, 12), cronField(expr[4]!.replace(/\b7\b/, '0'), 0, 6)];
    const tz = q.get('tz') || 'UTC';
    try { new Intl.DateTimeFormat('en', { timeZone: tz }); } catch { throw new DataError('invalid time zone', 400); }
    const count = int(q, 'count', 5, 1, 20), runs: string[] = [];
    let t = Math.ceil(Date.now() / 60_000) * 60_000;
    const end = t + 366 * 86_400_000;
    const domAny = expr[2] === '*', dowAny = expr[4] === '*';
    while (runs.length < count && t < end) {
      const p = tzParts(new Date(t), tz);
      const dayOk = domAny && dowAny ? true : domAny ? dow.has(p.dow) : dowAny ? dom.has(p.d) : dom.has(p.d) || dow.has(p.dow);
      if (!mo.has(p.mo) || !dayOk) { t += (24 * 60 - p.h * 60 - p.mi) * 60_000; continue; }
      if (!h.has(p.h)) { t += (60 - p.mi) * 60_000; continue; }
      if (mi.has(p.mi)) runs.push(new Date(t).toISOString());
      t += 60_000;
    }
    const desc = `At minute ${expr[0]} past hour ${expr[1]}, on day-of-month ${expr[2]}, in month ${expr[3]}, on weekday ${expr[4]} (${tz})`;
    return { cron: expr.join(' '), timeZone: tz, description: desc, nextRuns: runs };
  },
  async date_diff(q) {
    const parse = (v: string) => { const d = /^\d+$/.test(v) ? new Date(Number(v) * (v.length > 11 ? 1 : 1000)) : new Date(v); if (Number.isNaN(d.getTime())) throw new DataError(`invalid date '${v}'`, 400); return d; };
    const a = parse(need(q, 'from', 40)), b = q.get('to') ? parse(q.get('to')!) : new Date();
    const [x, y] = a <= b ? [a, b] : [b, a];
    let months = (y.getUTCFullYear() - x.getUTCFullYear()) * 12 + (y.getUTCMonth() - x.getUTCMonth());
    if (y.getUTCDate() < x.getUTCDate()) months--;
    const anchor = new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth() + months, x.getUTCDate(), x.getUTCHours(), x.getUTCMinutes(), x.getUTCSeconds()));
    const rest = (y.getTime() - anchor.getTime()) / 1000;
    return { from: a.toISOString(), to: b.toISOString(), direction: a <= b ? 'forward' : 'backward', years: Math.floor(months / 12), months: months % 12, days: Math.floor(rest / 86400), hours: Math.floor((rest % 86400) / 3600), minutes: Math.floor((rest % 3600) / 60), totalDays: round((y.getTime() - x.getTime()) / 86_400_000, 4), totalSeconds: Math.round((y.getTime() - x.getTime()) / 1000) };
  },
  async business_days(q, env) {
    const country = (q.get('country') ?? 'US').toUpperCase();
    const from = new Date(need(q, 'from', 10) + 'T00:00:00Z');
    if (Number.isNaN(from.getTime())) throw new DataError('from must be YYYY-MM-DD', 400);
    const years = new Set([from.getUTCFullYear(), from.getUTCFullYear() + 1]);
    const hol = new Set<string>();
    for (const y of years) {
      const rows = await cached(env, `hol:${country}:${y}`, 86_400, () => getJson<{ date: string; global: boolean }[]>(`https://date.nager.at/api/v3/PublicHolidays/${y}/${country}`)).catch(() => []);
      rows.filter((r) => r.global).forEach((r) => hol.add(r.date));
    }
    const isBiz = (d: Date) => d.getUTCDay() % 6 !== 0 && !hol.has(d.toISOString().slice(0, 10));
    if (q.get('add')) {
      let left = int(q, 'add', 0, -1000, 1000);
      const step = left < 0 ? -1 : 1, d = new Date(from);
      while (left !== 0) { d.setUTCDate(d.getUTCDate() + step); if (isBiz(d)) left -= step; }
      return { from: from.toISOString().slice(0, 10), added: Number(q.get('add')), result: d.toISOString().slice(0, 10), country };
    }
    const to = new Date(need(q, 'to', 10) + 'T00:00:00Z');
    if (Number.isNaN(to.getTime()) || (to.getTime() - from.getTime()) / 86_400_000 > 3660) throw new DataError('to must be a date within 10 years', 400);
    let biz = 0, hols = 0;
    for (const d = new Date(from); d <= to; d.setUTCDate(d.getUTCDate() + 1)) { if (isBiz(d)) biz++; else if (d.getUTCDay() % 6 !== 0) hols++; }
    return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10), country, businessDays: biz, holidaysOnWeekdays: hols, calendarDays: Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1 };
  },
  async timezone_convert(q) {
    const from = need(q, 'from', 60), targets = need(q, 'to', 500).split(',').map((z) => z.trim()).filter(Boolean).slice(0, 20);
    const m = need(q, 'time', 40).match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
    if (!m) throw new DataError('time must look like 2026-11-01 09:00', 400);
    const want = [+m[1]!, +m[2]!, +m[3]!, +m[4]!, +m[5]!];
    let guess = Date.UTC(want[0]!, want[1]! - 1, want[2], want[3], want[4]);
    for (let i = 0; i < 3; i++) { const p = tzParts(new Date(guess), from); guess -= (Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi) - Date.UTC(want[0]!, want[1]! - 1, want[2], want[3], want[4])); }
    const at = new Date(guess);
    const fmt = (tz: string) => { try { return { zone: tz, local: new Intl.DateTimeFormat('en-CA', { timeZone: tz, dateStyle: 'short', timeStyle: 'short', hourCycle: 'h23' }).format(at), offset: new Intl.DateTimeFormat('en', { timeZone: tz, timeZoneName: 'shortOffset' }).formatToParts(at).find((x) => x.type === 'timeZoneName')?.value }; } catch { return { zone: tz, error: 'invalid time zone' }; } };
    return { utc: at.toISOString(), source: fmt(from), targets: targets.map(fmt) };
  },

  // ---- web ----
  async ip_geolocation(q) {
    const ip = need(q, 'ip', 45).trim();
    if (!/^[0-9a-fA-F:.]{3,45}$/.test(ip)) throw new DataError('invalid IP', 400);
    try {
      const g = await getJson<Record<string, string | number | undefined>>(`https://get.geojs.io/v1/ip/geo/${ip}.json`);
      return { ip, country: g.country ?? null, countryCode: g.country_code ?? null, region: g.region ?? null, city: g.city ?? null, lat: g.latitude ? Number(g.latitude) : null, lon: g.longitude ? Number(g.longitude) : null, timezone: g.timezone ?? null, isp: g.organization_name ?? null, org: g.organization ?? null, asn: g.asn ?? null, source: 'GeoJS' };
    } catch {
      const d = await getJson<Record<string, unknown> & { success: boolean; message?: string; connection?: Record<string, unknown>; timezone?: Record<string, unknown> }>(`https://ipwho.is/${ip}`);
      if (!d.success) throw new DataError(d.message ?? 'lookup failed', 400);
      return { ip, country: d.country, countryCode: d.country_code, region: d.region, city: d.city, lat: d.latitude, lon: d.longitude, timezone: d.timezone?.id ?? null, isp: d.connection?.isp ?? null, org: d.connection?.org ?? null, asn: d.connection?.asn ?? null, source: 'ipwho.is' };
    }
  },
  async url_unshorten(q) {
    let url = publicUrl(need(q, 'url', 4000));
    const hops: { url: string; status: number }[] = [];
    for (let i = 0; i < 10; i++) {
      const res = await fetch(url, { method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(8000), headers: { 'user-agent': UA } });
      hops.push({ url: url.toString(), status: res.status });
      res.body?.cancel().catch(() => {});
      const loc = res.headers.get('location');
      if (res.status < 300 || res.status >= 400 || !loc) break;
      url = publicUrl(new URL(loc, url).toString());
    }
    const final = new URL(url.toString());
    const tracking = [...final.searchParams.keys()].filter((k) => /^(utm_|fbclid|gclid|ref$|ref_)/i.test(k));
    return { finalUrl: final.toString(), hops, redirects: hops.length - 1, finalDomain: final.hostname, trackingParams: tracking };
  },
  async robots_check(q) {
    const url = publicUrl(need(q, 'url', 4000)), agent = (q.get('agent') ?? '*').toLowerCase();
    const res = await fetch(`${url.origin}/robots.txt`, { signal: AbortSignal.timeout(8000), headers: { 'user-agent': UA } });
    if (res.status === 404) return { robotsTxt: false, allowed: true, reason: 'no robots.txt' };
    const text = (await res.text()).slice(0, 500_000);
    const groups: { agents: string[]; rules: { allow: boolean; path: string }[]; delay?: number }[] = [];
    const sitemaps: string[] = [];
    let cur: (typeof groups)[number] | null = null, lastWasAgent = false;
    for (const raw of text.split('\n')) {
      const line = raw.replace(/#.*/, '').trim();
      const m = line.match(/^([a-z-]+)\s*:\s*(.*)$/i);
      if (!m) continue;
      const [k, v] = [m[1]!.toLowerCase(), m[2]!.trim()];
      if (k === 'user-agent') { if (!lastWasAgent || !cur) { cur = { agents: [], rules: [] }; groups.push(cur); } cur.agents.push(v.toLowerCase()); lastWasAgent = true; continue; }
      lastWasAgent = false;
      if (k === 'sitemap') sitemaps.push(v);
      else if (cur && (k === 'allow' || k === 'disallow') && v !== '') cur.rules.push({ allow: k === 'allow', path: v });
      else if (cur && k === 'crawl-delay') cur.delay = Number(v);
    }
    const group = groups.find((g) => g.agents.some((a) => a !== '*' && agent.includes(a))) ?? groups.find((g) => g.agents.includes('*'));
    const path = url.pathname + url.search;
    const toRe = (p: string) => new RegExp('^' + p.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\\\$$/, '$'));
    const matches = (group?.rules ?? []).filter((r) => toRe(r.path).test(path)).sort((a, b) => b.path.length - a.path.length || Number(b.allow) - Number(a.allow));
    const rule = matches[0];
    return { robotsTxt: true, agent, matchedGroup: group?.agents ?? null, path, allowed: rule ? rule.allow : true, rule: rule ?? null, crawlDelay: group?.delay ?? null, sitemaps };
  },
  async link_extract(q) {
    const url = publicUrl(need(q, 'url', 4000));
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000), headers: { 'user-agent': UA, accept: 'text/html' } });
    if (!res.ok) throw new DataError(`Page returned HTTP ${res.status}`, 502);
    const html = (await res.text()).slice(0, 2_000_000), base = new URL(res.url);
    const links = [...html.matchAll(/<a\s[^>]*href=["']([^"'#][^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi)].map((m) => {
      let href: URL | null = null;
      try { href = new URL(m[1]!, base); } catch { /* ignore */ }
      const rel = m[0].match(/rel=["']([^"']+)["']/i)?.[1] ?? null;
      return href && /^https?:$/.test(href.protocol) ? { url: href.toString(), text: m[2]!.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120), internal: href.hostname === base.hostname, rel } : null;
    }).filter((x): x is NonNullable<typeof x> => !!x);
    const uniq = [...new Map(links.map((l) => [l.url, l])).values()].slice(0, int(q, 'limit', 200, 1, 500));
    return { page: res.url, total: uniq.length, internal: uniq.filter((l) => l.internal).length, external: uniq.filter((l) => !l.internal).length, nofollow: uniq.filter((l) => l.rel?.includes('nofollow')).length, links: uniq };
  },
  async sitemap_parse(q) {
    const input = publicUrl(need(q, 'url', 4000)), limit = int(q, 'limit', 200, 1, 1000);
    const fetchText = async (u: string) => { const r = await fetch(u, { signal: AbortSignal.timeout(10_000), headers: { 'user-agent': UA } }); return r.ok ? (await r.text()).slice(0, 5_000_000) : null; };
    let start = input.pathname.endsWith('.xml') ? input.toString() : null;
    if (!start) { const robots = await fetchText(`${input.origin}/robots.txt`); start = robots?.match(/^sitemap:\s*(\S+)/im)?.[1] ?? `${input.origin}/sitemap.xml`; }
    const urls: { loc: string; lastmod: string | null }[] = [], seen = new Set<string>(), queue = [start];
    while (queue.length && urls.length < limit && seen.size < 10) {
      const u = queue.shift()!;
      if (seen.has(u)) continue;
      seen.add(u);
      const xml = await fetchText(u);
      if (!xml) continue;
      if (/<sitemapindex/i.test(xml)) { for (const m of xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)) queue.push(m[1]!); continue; }
      for (const m of xml.matchAll(/<url>([\s\S]*?)<\/url>/gi)) { const loc = m[1]!.match(/<loc>\s*([^<\s]+)/i)?.[1]; if (loc) urls.push({ loc, lastmod: m[1]!.match(/<lastmod>\s*([^<\s]+)/i)?.[1] ?? null }); if (urls.length >= limit) break; }
    }
    if (!urls.length) throw new DataError('No sitemap found', 404);
    return { sitemapsRead: [...seen], count: urls.length, urls };
  },

  // ---- knowledge ----
  async dictionary(q) {
    const word = need(q, 'word', 60).trim().toLowerCase();
    if (!/^[a-z' -]+$/.test(word)) throw new DataError('word must be English letters', 400);
    type D = { word: string; phonetic?: string; phonetics: { text?: string; audio?: string }[]; meanings: { partOfSpeech: string; definitions: { definition: string; example?: string }[]; synonyms: string[]; antonyms: string[] }[] }[];
    const d = await getJson<D>(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);
    const e = d[0]!;
    return { word: e.word, phonetic: e.phonetic ?? e.phonetics.find((p) => p.text)?.text ?? null, audio: e.phonetics.find((p) => p.audio)?.audio || null, meanings: e.meanings.map((m) => ({ partOfSpeech: m.partOfSpeech, definitions: m.definitions.slice(0, 4).map((x) => ({ definition: x.definition, example: x.example ?? null })), synonyms: m.synonyms.slice(0, 10), antonyms: m.antonyms.slice(0, 10) })) };
  },
  async book_search(q) {
    type B = { numFound: number; docs: { title: string; author_name?: string[]; first_publish_year?: number; edition_count?: number; isbn?: string[]; cover_i?: number; key: string; subject?: string[] }[] };
    const d = await getJson<B>(`https://openlibrary.org/search.json?q=${encodeURIComponent(need(q, 'q', 200))}&limit=${int(q, 'limit', 10, 1, 30)}&fields=title,author_name,first_publish_year,edition_count,isbn,cover_i,key,subject`, 15_000);
    return { total: d.numFound, books: d.docs.map((b) => ({ title: b.title, authors: b.author_name ?? [], firstPublished: b.first_publish_year ?? null, editions: b.edition_count ?? null, isbn: b.isbn?.slice(0, 3) ?? [], subjects: b.subject?.slice(0, 5) ?? [], cover: b.cover_i ? `https://covers.openlibrary.org/b/id/${b.cover_i}-M.jpg` : null, url: `https://openlibrary.org${b.key}` })) };
  },
  async earthquakes(q, env) {
    const win = q.get('window') === 'week' ? 'week' : 'day', min = num(q, 'minMagnitude', 4.5);
    type E = { features: { properties: { mag: number; place: string; time: number; tsunami: number; url: string; alert: string | null }; geometry: { coordinates: number[] } }[] };
    const d = await cached(env, `usgs:${win}`, 300, () => getJson<E>(`https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_${win}.geojson`));
    const list = d.features.filter((f) => f.properties.mag >= min).sort((a, b) => b.properties.mag - a.properties.mag).map((f) => ({ magnitude: f.properties.mag, place: f.properties.place, time: new Date(f.properties.time).toISOString(), depthKm: f.geometry.coordinates[2], lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0], tsunami: !!f.properties.tsunami, alert: f.properties.alert, url: f.properties.url }));
    return { window: win, count: list.length, strongest: list[0] ?? null, earthquakes: list.slice(0, 50), source: 'USGS' };
  },
  async air_quality(q) {
    let lat = Number(q.get('lat')), lon = Number(q.get('lon')), place: string | null = null;
    if (q.get('lat') === null || !Number.isFinite(lat) || !Number.isFinite(lon)) { const g = await geo(need(q, 'place', 100)); lat = g.latitude; lon = g.longitude; place = [g.name, g.country].filter(Boolean).join(', '); }
    type A = { current: Record<string, number> };
    const d = await getJson<A>(`https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&current=us_aqi,european_aqi,pm2_5,pm10,ozone,nitrogen_dioxide,uv_index`);
    const aqi = d.current.us_aqi ?? 0;
    return { place, lat, lon, usAqi: aqi, level: aqi <= 50 ? 'good' : aqi <= 100 ? 'moderate' : aqi <= 150 ? 'unhealthy for sensitive groups' : aqi <= 200 ? 'unhealthy' : 'very unhealthy', europeanAqi: d.current.european_aqi, pm2_5: d.current.pm2_5, pm10: d.current.pm10, ozone: d.current.ozone, no2: d.current.nitrogen_dioxide, uvIndex: d.current.uv_index, source: 'open-meteo (CAMS)' };
  },
  async github_user(q) {
    const user = need(q, 'user', 40).trim();
    if (!/^[A-Za-z0-9-]{1,39}$/.test(user)) throw new DataError('invalid GitHub username', 400);
    type U = { login: string; name: string | null; type: string; bio: string | null; company: string | null; blog: string; location: string | null; followers: number; following: number; public_repos: number; created_at: string; html_url: string };
    const [u, repos] = await Promise.all([getJson<U>(`https://api.github.com/users/${user}`), getJson<{ name: string; stargazers_count: number; language: string | null; html_url: string; fork: boolean }[]>(`https://api.github.com/users/${user}/repos?per_page=100&sort=updated`).catch(() => [])]);
    return { login: u.login, name: u.name, type: u.type, bio: u.bio, company: u.company, website: u.blog || null, location: u.location, followers: u.followers, following: u.following, publicRepos: u.public_repos, accountAgeDays: Math.floor((Date.now() - Date.parse(u.created_at)) / 86_400_000), topRepos: repos.filter((r) => !r.fork).sort((a, b) => b.stargazers_count - a.stargazers_count).slice(0, 5).map((r) => ({ name: r.name, stars: r.stargazers_count, language: r.language, url: r.html_url })), url: u.html_url };
  },
  async sun_times(q) {
    const g = await geo(need(q, 'place', 100));
    const date = q.get('date') ?? new Date().toISOString().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new DataError('date must be YYYY-MM-DD', 400);
    type W = { daily: { sunrise: string[]; sunset: string[]; daylight_duration: number[] }; timezone: string };
    const d = await getJson<W>(`https://api.open-meteo.com/v1/forecast?latitude=${g.latitude}&longitude=${g.longitude}&timezone=auto&daily=sunrise,sunset,daylight_duration&start_date=${date}&end_date=${date}`);
    const synodic = 29.530588853, known = Date.UTC(2000, 0, 6, 18, 14);
    const age = ((((Date.parse(date + 'T12:00:00Z') - known) / 86_400_000) % synodic) + synodic) % synodic;
    const phase = ['new moon', 'waxing crescent', 'first quarter', 'waxing gibbous', 'full moon', 'waning gibbous', 'last quarter', 'waning crescent'][Math.floor(((age / synodic) * 8 + 0.5) % 8)];
    return { place: [g.name, g.country].filter(Boolean).join(', '), date, timezone: d.timezone, sunrise: d.daily.sunrise[0], sunset: d.daily.sunset[0], daylightHours: round((d.daily.daylight_duration[0] ?? 0) / 3600, 2), moon: { phase, ageDays: round(age, 1), illuminationPct: round(((1 - Math.cos((2 * Math.PI * age) / synodic)) / 2) * 100, 1) } };
  },
};
