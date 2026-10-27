import { EVM_ADDRESS, SOLANA_ADDRESS } from '@tollgate/core';
import { keccak_256 } from '@noble/hashes/sha3';
import qrcode from 'qrcode-generator';
import { cached, DataError, EVM_RPCS, rpcAny } from './data-tools';
import type { UtilEnv } from './util-tools';

export interface MoreEnv extends UtilEnv {
  browserToken?: string;
}

type Handler = (q: URLSearchParams, env: MoreEnv) => Promise<Record<string, unknown>>;

const UA = 'AgentTollgate/1.0 (+https://skinwinking.com)';
const ENS_REGISTRY = '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e';

function need(q: URLSearchParams, key: string, max = 2000): string {
  const v = q.get(key)?.trim();
  if (!v) throw new DataError(`${key} required`, 400);
  if (v.length > max) throw new DataError(`${key} longer than ${max} characters`, 400);
  return v;
}

const intParam = (q: URLSearchParams, key: string, def: number, min: number, max: number) => {
  const n = Number(q.get(key) ?? def);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.floor(n))) : def;
};

async function getJson<T>(url: string, timeoutMs = 10_000, headers: Record<string, string> = {}): Promise<T> {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), headers: { accept: 'application/json', 'user-agent': UA, ...headers } });
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
  const host = u.hostname.toLowerCase();
  if (!['http:', 'https:'].includes(u.protocol) || /^[\d.]+$/.test(host) || host.includes(':') || host === 'localhost' || !host.includes('.') || /\.(local|internal|lan|home|localhost)$/.test(host)) {
    throw new DataError('url must be a public http(s) URL', 400);
  }
  return u;
}

const hex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, '0')).join('');

function namehash(name: string): string {
  let node: Uint8Array = new Uint8Array(32);
  for (const label of name.toLowerCase().split('.').filter(Boolean).reverse()) {
    const buf = new Uint8Array(64);
    buf.set(node, 0);
    buf.set(keccak_256(new TextEncoder().encode(label)), 32);
    node = keccak_256(buf);
  }
  return '0x' + hex(node);
}

function toChecksum(addr: string): string {
  const a = addr.toLowerCase().replace(/^0x/, '');
  const h = hex(keccak_256(new TextEncoder().encode(a)));
  return '0x' + [...a].map((c, i) => (parseInt(h[i]!, 16) >= 8 ? c.toUpperCase() : c)).join('');
}

const word = (hexStr: string, i: number) => hexStr.slice(2 + i * 64, 2 + (i + 1) * 64);
const decodeAddress = (ret: string | null) => (ret && ret.length >= 66 ? '0x' + word(ret, 0).slice(24) : null);

function decodeString(ret: string | null): string | null {
  if (!ret || ret.length < 130) return null;
  const off = parseInt(word(ret, 0), 16) / 32;
  const len = parseInt(word(ret, off), 16);
  const data = ret.slice(2 + (off + 1) * 64, 2 + (off + 1) * 64 + len * 2);
  return new TextDecoder().decode(Uint8Array.from(data.match(/../g) ?? [], (b) => parseInt(b, 16))) || null;
}

const ethCall = (to: string, data: string) => rpcAny<string>(EVM_RPCS.ethereum!, 'eth_call', [{ to, data }, 'latest']).catch(() => null);

async function ensResolver(node: string) {
  const r = decodeAddress(await ethCall(ENS_REGISTRY, '0x0178b8bf' + node.slice(2)));
  return r && !/^0x0{40}$/.test(r) ? r : null;
}

async function browserRun(env: MoreEnv, path: string, body: Record<string, unknown>): Promise<Response> {
  if (!env.browserToken) throw new DataError('Browser rendering not configured', 503);
  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${env.intel.account}/browser-rendering/${path}`, {
    method: 'POST',
    signal: AbortSignal.timeout(45_000),
    headers: { authorization: `Bearer ${env.browserToken}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (res.status === 429) throw new DataError('Browser pool busy; retry in a minute', 503);
  if (!res.ok) throw new DataError(`Browser rendering failed: HTTP ${res.status}`, 502);
  return res;
}

const SANCTION_LISTS: Record<string, string> = { ETH: 'ETH', XBT: 'XBT', TRX: 'TRX', USDT: 'USDT', USDC: 'USDC', SOL: 'SOL', ARB: 'ARB', BSC: 'BSC', LTC: 'LTC', XMR: 'XMR' };

export const MORE_HANDLERS: Record<string, Handler> = {
  async document_to_markdown(q, env) {
    const url = publicUrl(need(q, 'url', 4000));
    const res = await fetch(url, { signal: AbortSignal.timeout(20_000), headers: { 'user-agent': UA } });
    if (!res.ok) throw new DataError(`Document fetch failed: HTTP ${res.status}`, 502);
    const len = Number(res.headers.get('content-length') ?? 0);
    if (len > 10_000_000) throw new DataError('Document larger than 10 MB', 413);
    const blob = await res.blob();
    if (blob.size > 10_000_000) throw new DataError('Document larger than 10 MB', 413);
    const name = decodeURIComponent(url.pathname.split('/').pop() || 'document') || 'document';
    let out: { format: string; data?: string; error?: string; mimeType?: string; tokens?: number }[];
    try {
      out = (await env.ai.toMarkdown([{ name, blob }])) as unknown as typeof out;
    } catch (err) {
      throw new DataError(`Conversion failed: ${err instanceof Error ? err.message : 'unknown'}`, 502);
    }
    const r = out[0];
    if (!r || r.format === 'error') throw new DataError(`Unsupported or unreadable document: ${r?.error ?? 'unknown'}`, 415);
    const max = intParam(q, 'maxChars', 50_000, 1000, 200_000);
    return { url: url.toString(), name, mimeType: r.mimeType ?? blob.type, markdown: (r.data ?? '').slice(0, max), truncated: (r.data ?? '').length > max };
  },

  async web_render(q, env) {
    const url = publicUrl(need(q, 'url', 4000)).toString();
    const body = (await (await browserRun(env, 'markdown', { url, gotoOptions: { waitUntil: 'networkidle2', timeout: 30_000 } })).json()) as { success: boolean; result?: string };
    const max = intParam(q, 'maxChars', 30_000, 1000, 150_000);
    const md = body.result ?? '';
    return { url, renderedWith: 'headless Chromium', markdown: md.slice(0, max), truncated: md.length > max };
  },

  async web_screenshot(q, env) {
    const url = publicUrl(need(q, 'url', 4000)).toString();
    const width = intParam(q, 'width', 1280, 320, 1920);
    const height = intParam(q, 'height', 800, 240, 1920);
    const res = await browserRun(env, 'screenshot', {
      url,
      viewport: { width, height },
      screenshotOptions: { type: 'jpeg', quality: 80, fullPage: q.get('fullPage') === 'true' },
      gotoOptions: { waitUntil: 'networkidle2', timeout: 30_000 },
    });
    const buf = new Uint8Array(await res.arrayBuffer());
    let bin = '';
    for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    return { url, width, height, bytes: buf.byteLength, image: `data:image/jpeg;base64,${btoa(bin)}` };
  },

  async qr_code(q) {
    const text = need(q, 'text', 2000);
    const level = (q.get('ecc') ?? 'M').toUpperCase();
    if (!['L', 'M', 'Q', 'H'].includes(level)) throw new DataError('ecc must be L, M, Q or H', 400);
    const qr = qrcode(0, level as 'L' | 'M' | 'Q' | 'H');
    qr.addData(text);
    try {
      qr.make();
    } catch {
      throw new DataError('text too long for a QR code', 400);
    }
    const cell = intParam(q, 'cellSize', 6, 1, 20);
    return { text, ecc: level, modules: qr.getModuleCount(), svg: qr.createSvgTag({ cellSize: cell, margin: cell * 4, scalable: true }), image: qr.createDataURL(cell, cell * 4) };
  },

  async ens_resolve(q) {
    const input = need(q, 'name', 255);
    if (EVM_ADDRESS.test(input)) {
      const node = namehash(`${input.toLowerCase().slice(2)}.addr.reverse`);
      const resolver = await ensResolver(node);
      const name = resolver ? decodeString(await ethCall(resolver, '0x691f3431' + node.slice(2))) : null;
      // A reverse record only counts if the name resolves forward to the same address.
      let verified = false;
      if (name) {
        const fwdResolver = await ensResolver(namehash(name));
        const fwd = fwdResolver ? decodeAddress(await ethCall(fwdResolver, '0x3b3b57de' + namehash(name).slice(2))) : null;
        verified = !!fwd && fwd.toLowerCase() === input.toLowerCase();
      }
      return { address: toChecksum(input), name: verified ? name : null, reverseRecord: name, verified };
    }
    if (!/^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/i.test(input)) throw new DataError('name must be an ENS name (vitalik.eth) or a 0x address', 400);
    const node = namehash(input);
    const resolver = await ensResolver(node);
    if (!resolver) return { name: input, address: null, resolver: null, registered: false };
    const [addr, avatar, url, twitter] = await Promise.all([
      ethCall(resolver, '0x3b3b57de' + node.slice(2)).then(decodeAddress),
      ...['avatar', 'url', 'com.twitter'].map((key) => {
        const k = hex(new TextEncoder().encode(key));
        const data = '0x59d1d43c' + node.slice(2) + (64).toString(16).padStart(64, '0') + key.length.toString(16).padStart(64, '0') + k.padEnd(Math.ceil(k.length / 64) * 64, '0');
        return ethCall(resolver, data).then(decodeString);
      }),
    ]);
    return { name: input, address: addr && !/^0x0{40}$/.test(addr) ? toChecksum(addr) : null, resolver, records: { avatar, url, twitter } };
  },

  async sanctions_check(q, env) {
    const address = need(q, 'address', 120);
    const evm = EVM_ADDRESS.test(address);
    const lists = await Promise.all(
      Object.keys(SANCTION_LISTS).map((sym) =>
        cached(env, `ofac:${sym}`, 21_600, async () => {
          const res = await fetch(`https://raw.githubusercontent.com/0xB10C/ofac-sanctioned-digital-currency-addresses/lists/sanctioned_addresses_${sym}.txt`, { signal: AbortSignal.timeout(10_000) });
          return res.ok ? (await res.text()).split('\n').map((s) => s.trim()).filter(Boolean) : [];
        }).then((addrs) => ({ sym, addrs })),
      ),
    );
    const norm = (a: string) => (EVM_ADDRESS.test(a) ? a.toLowerCase() : a);
    const target = norm(address);
    const hits = lists.filter((l) => l.addrs.some((a) => norm(a) === target)).map((l) => l.sym);
    const total = lists.reduce((s, l) => s + l.addrs.length, 0);
    return {
      address,
      format: evm ? 'evm' : SOLANA_ADDRESS.test(address) ? 'solana' : 'other',
      sanctioned: hits.length > 0,
      lists: hits.map((s) => `OFAC SDN (${s})`),
      addressesChecked: total,
      source: 'US Treasury OFAC SDN list, digital currency addresses (via 0xB10C/ofac-sanctioned-digital-currency-addresses)',
      note: 'Screens against published OFAC addresses only; not legal advice.',
    };
  },

  async stock_quote(q, env) {
    const symbols = need(q, 'symbols', 200).toUpperCase().split(',').map((s) => s.trim()).filter((s) => /^[A-Z0-9.^=-]{1,15}$/.test(s)).slice(0, 10);
    if (!symbols.length) throw new DataError('symbols must list 1-10 tickers such as AAPL,MSFT,^GSPC', 400);
    type Chart = { chart: { result?: { meta: Record<string, number | string> }[]; error?: { description: string } } };
    const quotes = await Promise.all(
      symbols.map((s) =>
        cached(env, `yq:${s}`, 60, () => getJson<Chart>(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(s)}?range=1d&interval=1d`, 8000, { 'user-agent': 'Mozilla/5.0' }))
          .then((d) => {
            const m = d.chart.result?.[0]?.meta;
            if (!m) return { symbol: s, error: d.chart.error?.description ?? 'not found' };
            const price = Number(m.regularMarketPrice);
            const prev = Number(m.chartPreviousClose ?? m.previousClose);
            return {
              symbol: s,
              name: m.longName ?? m.shortName ?? null,
              price,
              currency: m.currency,
              change: prev ? Number((price - prev).toFixed(4)) : null,
              changePct: prev ? Number((((price - prev) / prev) * 100).toFixed(3)) : null,
              dayHigh: m.regularMarketDayHigh ?? null,
              dayLow: m.regularMarketDayLow ?? null,
              volume: m.regularMarketVolume ?? null,
              exchange: m.fullExchangeName ?? m.exchangeName,
              marketTime: m.regularMarketTime ? new Date(Number(m.regularMarketTime) * 1000).toISOString() : null,
            };
          })
          .catch((err: Error) => ({ symbol: s, error: err.message })),
      ),
    );
    return { quotes, note: 'Market data may be delayed.' };
  },

  async public_holidays(q, env) {
    const country = need(q, 'country', 2).toUpperCase();
    if (!/^[A-Z]{2}$/.test(country)) throw new DataError('country must be a 2-letter ISO code such as HR, US, DE', 400);
    const year = intParam(q, 'year', new Date().getUTCFullYear(), 1975, 2075);
    type H = { date: string; localName: string; name: string; global: boolean; types: string[]; counties: string[] | null };
    const rows = await cached(env, `hol:${country}:${year}`, 86_400, () => getJson<H[]>(`https://date.nager.at/api/v3/PublicHolidays/${year}/${country}`));
    const today = new Date().toISOString().slice(0, 10);
    return {
      country,
      year,
      holidays: rows.map((h) => ({ date: h.date, name: h.name, localName: h.localName, nationwide: h.global, types: h.types, regions: h.counties })),
      next: rows.find((h) => h.date >= today) ?? null,
    };
  },

  async geocode(q) {
    const place = need(q, 'place', 120);
    const limit = intParam(q, 'limit', 5, 1, 10);
    type G = { results?: { name: string; country?: string; country_code?: string; admin1?: string; latitude: number; longitude: number; population?: number; timezone?: string; elevation?: number }[] };
    const d = await getJson<G>(`https://geocoding-api.open-meteo.com/v1/search?count=${limit}&name=${encodeURIComponent(place)}&language=${encodeURIComponent(q.get('lang') ?? 'en')}`);
    return {
      query: place,
      results: (d.results ?? []).map((r) => ({ name: r.name, region: r.admin1 ?? null, country: r.country ?? null, countryCode: r.country_code ?? null, lat: r.latitude, lon: r.longitude, population: r.population ?? null, timezone: r.timezone ?? null, elevationM: r.elevation ?? null })),
      source: 'open-meteo geocoding (GeoNames)',
    };
  },

  async hn_search(q) {
    const term = need(q, 'q', 200);
    const sort = q.get('sort') === 'date' ? 'search_by_date' : 'search';
    type H = { hits: { title: string | null; url: string | null; points: number | null; num_comments: number | null; author: string; created_at: string; objectID: string; story_text?: string | null }[]; nbHits: number };
    const d = await getJson<H>(`https://hn.algolia.com/api/v1/${sort}?tags=story&hitsPerPage=${intParam(q, 'limit', 10, 1, 30)}&query=${encodeURIComponent(term)}`);
    return {
      query: term,
      total: d.nbHits,
      stories: d.hits.map((h) => ({ title: h.title, url: h.url ?? `https://news.ycombinator.com/item?id=${h.objectID}`, discussion: `https://news.ycombinator.com/item?id=${h.objectID}`, points: h.points, comments: h.num_comments, author: h.author, date: h.created_at })),
    };
  },

  async package_info(q) {
    const name = need(q, 'name', 214);
    const registry = (q.get('registry') ?? 'npm').toLowerCase();
    if (registry === 'pypi') {
      if (!/^[A-Za-z0-9._-]+$/.test(name)) throw new DataError('invalid PyPI package name', 400);
      type P = { info: { name: string; version: string; summary: string; license: string | null; home_page: string | null; project_urls: Record<string, string> | null; requires_python: string | null; author: string | null }; releases: Record<string, { upload_time: string }[]> };
      const d = await getJson<P>(`https://pypi.org/pypi/${encodeURIComponent(name)}/json`);
      const latest = d.releases[d.info.version]?.[0]?.upload_time ?? null;
      return { registry, name: d.info.name, version: d.info.version, summary: d.info.summary, license: d.info.license, author: d.info.author, requiresPython: d.info.requires_python, released: latest, releaseCount: Object.keys(d.releases).length, links: d.info.project_urls ?? (d.info.home_page ? { homepage: d.info.home_page } : {}) };
    }
    if (registry !== 'npm') throw new DataError('registry must be npm or pypi', 400);
    if (!/^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/.test(name)) throw new DataError('invalid npm package name', 400);
    type N = { name: string; description?: string; 'dist-tags': Record<string, string>; time: Record<string, string>; license?: string; homepage?: string; repository?: { url?: string }; maintainers?: { name: string }[] };
    const d = await getJson<N>(`https://registry.npmjs.org/${name.replace('/', '%2F')}`, 10_000, { accept: 'application/vnd.npm.install-v1+json; q=1.0, application/json; q=0.8' }).catch(() =>
      getJson<N>(`https://registry.npmjs.org/${name.replace('/', '%2F')}`),
    );
    const latest = d['dist-tags']?.latest;
    const dl = await getJson<{ downloads: number }>(`https://api.npmjs.org/downloads/point/last-week/${name}`).catch(() => null);
    return { registry, name: d.name, version: latest, description: d.description ?? null, license: d.license ?? null, released: latest ? (d.time?.[latest] ?? null) : null, created: d.time?.created ?? null, weeklyDownloads: dl?.downloads ?? null, homepage: d.homepage ?? null, repository: d.repository?.url ?? null, distTags: d['dist-tags'] };
  },

  async arxiv_search(q) {
    const term = need(q, 'q', 300);
    const limit = intParam(q, 'limit', 10, 1, 30);
    const res = await fetch(`https://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(term)}&start=0&max_results=${limit}&sortBy=${q.get('sort') === 'date' ? 'submittedDate' : 'relevance'}`, { signal: AbortSignal.timeout(15_000), headers: { 'user-agent': UA } });
    if (!res.ok) throw new DataError(`arXiv HTTP ${res.status}`, 502);
    const xml = await res.text();
    const tag = (s: string, t: string) => s.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`))?.[1]?.replace(/\s+/g, ' ').trim() ?? null;
    const papers = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map((m) => {
      const e = m[1]!;
      return {
        title: tag(e, 'title'),
        authors: [...e.matchAll(/<name>([\s\S]*?)<\/name>/g)].map((a) => a[1]!.trim()),
        published: tag(e, 'published'),
        summary: tag(e, 'summary')?.slice(0, 1200) ?? null,
        url: tag(e, 'id'),
        pdf: e.match(/<link[^>]+title="pdf"[^>]+href="([^"]+)"/)?.[1] ?? null,
        category: e.match(/<arxiv:primary_category[^>]+term="([^"]+)"/)?.[1] ?? null,
      };
    });
    return { query: term, papers };
  },

  async ssl_certificates(q, env) {
    const domain = need(q, 'domain', 253).toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    if (!/^(?=.{1,253}$)([a-z0-9-]{1,63}\.)+[a-z]{2,63}$/.test(domain)) throw new DataError('invalid domain', 400);
    type C = { issuer_name: string; common_name: string; name_value: string; not_before: string; not_after: string; serial_number: string; entry_timestamp: string };
    const rows = await cached(env, `crt:${domain}`, 3600, () => getJson<C[]>(`https://crt.sh/?q=${encodeURIComponent(domain)}&output=json&exclude=expired`, 25_000));
    const now = Date.now();
    const certs = rows
      .sort((a, b) => Date.parse(b.not_before) - Date.parse(a.not_before))
      .slice(0, intParam(q, 'limit', 20, 1, 100))
      .map((c) => ({ commonName: c.common_name, names: [...new Set(c.name_value.split('\n'))], issuer: c.issuer_name.match(/O=([^,]+)/)?.[1] ?? c.issuer_name, validFrom: c.not_before, validTo: c.not_after, daysLeft: Math.floor((Date.parse(c.not_after + 'Z') - now) / 86_400_000), serial: c.serial_number }));
    const subdomains = [...new Set(rows.flatMap((c) => c.name_value.split('\n')).filter((n) => n.endsWith(domain) && !n.startsWith('*')))].slice(0, 200);
    return { domain, activeCertificates: rows.length, certificates: certs, subdomainsSeen: subdomains, soonestExpiryDays: certs.length ? Math.min(...certs.map((c) => c.daysLeft)) : null, source: 'Certificate Transparency logs (crt.sh)' };
  },

  async password_breach_check(q) {
    // Accepts a SHA-1 hash so the plaintext never has to leave the caller; plaintext is hashed here and never stored or logged.
    const raw = (q.get('sha1') ?? q.get('password') ?? '').trim();
    if (!raw || raw.length > 200) throw new DataError('password or sha1 required', 400);
    const sha1 = /^[a-f0-9]{40}$/i.test(raw) ? raw.toUpperCase() : hex(new Uint8Array(await crypto.subtle.digest('SHA-1', new TextEncoder().encode(raw)))).toUpperCase();
    const res = await fetch(`https://api.pwnedpasswords.com/range/${sha1.slice(0, 5)}`, { signal: AbortSignal.timeout(8000), headers: { 'user-agent': UA, 'add-padding': 'true' } });
    if (!res.ok) throw new DataError(`HIBP HTTP ${res.status}`, 502);
    const suffix = sha1.slice(5);
    const line = (await res.text()).split('\n').find((l) => l.startsWith(suffix));
    const count = line ? Number(line.split(':')[1]) : 0;
    return { breached: count > 0, timesSeen: count, method: 'k-anonymity range query (only the first 5 hash characters are sent to Have I Been Pwned)', source: 'Have I Been Pwned Pwned Passwords' };
  },
};
