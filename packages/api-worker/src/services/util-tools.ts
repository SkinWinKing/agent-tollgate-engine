import { ALL_ROUTES, unitsToUsdc } from '@tollgate/core';
import { recommendTools } from '../agent-discovery';
import { DataError, type DataEnv } from './data-tools';

export interface UtilEnv extends DataEnv {
  ai: Ai;
  intel: { account: string; token: string };
}

async function cfIntel<T>(env: UtilEnv, path: string): Promise<T | null> {
  if (!env.intel.token) throw new DataError('Threat intel not configured', 503);
  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${env.intel.account}/${path}`, {
    signal: AbortSignal.timeout(8000),
    headers: { authorization: `Bearer ${env.intel.token}` },
  });
  if (!res.ok) return null;
  const body = (await res.json()) as { result?: T; results?: T };
  return (body.result ?? body.results ?? null) as T | null;
}

const IPV4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;

type Handler = (q: URLSearchParams, env: UtilEnv) => Promise<Record<string, unknown>>;

const MAX_TEXT = 20_000;
const LLM = '@cf/meta/llama-3.1-8b-instruct-fast';
const UA = 'AgentTollgate/1.0 (+https://skinwinking.com)';
// AI Gateway caches identical prompts (no neuron spend on repeats) and rate-limits the free quota.
const GATEWAY = { gateway: { id: 'tollgate' } };

function need(q: URLSearchParams, key: string, max = MAX_TEXT): string {
  const v = q.get(key);
  if (!v || !v.trim()) throw new DataError(`${key} required`, 400);
  if (v.length > max) throw new DataError(`${key} longer than ${max} characters`, 400);
  return v;
}

function intParam(q: URLSearchParams, key: string, def: number, min: number, max: number): number {
  const n = Number(q.get(key) ?? def);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.floor(n))) : def;
}

async function getJson<T>(url: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(8000), headers: { accept: 'application/json', 'user-agent': UA, ...(init.headers ?? {}) } });
  if (res.status === 404) throw new DataError('Not found', 404);
  if (!res.ok) throw new DataError(`Upstream HTTP ${res.status}`, 502);
  return (await res.json()) as T;
}

/** Public http(s) URLs only: refuse IP literals and local names so the Worker cannot be aimed at internal hosts. */
function publicUrl(raw: string): URL {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new DataError('url must be an absolute http(s) URL', 400);
  }
  const host = u.hostname.toLowerCase();
  if (!['http:', 'https:'].includes(u.protocol)) throw new DataError('only http and https URLs', 400);
  if (/^[\d.]+$/.test(host) || host.includes(':') || host === 'localhost' || !host.includes('.') || /\.(local|internal|lan|home|localhost)$/.test(host)) {
    throw new DataError('url must use a public hostname', 400);
  }
  return u;
}

const toList = (raw: string, max: number): string[] => {
  let items: unknown = raw;
  if (raw.trim().startsWith('[')) {
    try {
      items = JSON.parse(raw);
    } catch {
      throw new DataError('text is not a valid JSON array', 400);
    }
  }
  const list = (Array.isArray(items) ? items : [items]).map(String).filter((s) => s.trim());
  if (!list.length || list.length > max) throw new DataError(`provide 1-${max} texts`, 400);
  return list;
};

const bytesToHex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
const bytesToB64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));

function b64UrlDecode(s: string): string {
  const pad = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(pad + '='.repeat((4 - (pad.length % 4)) % 4));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

// ---- CSV -------------------------------------------------------------------

function parseCsv(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delimiter) {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c !== ''));
}

const csvCell = (v: unknown, d: string) => {
  const s = v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
  return /["\n\r]/.test(s) || s.includes(d) ? `"${s.replace(/"/g, '""')}"` : s;
};

// ---- Crypto units ----------------------------------------------------------

const UNIT_DECIMALS: Record<string, number> = { wei: 0, gwei: 9, ether: 18, eth: 18, lamports: 0, sol: 9 };

function toBase(value: string, decimals: number): bigint {
  if (!/^-?\d+(\.\d+)?$/.test(value)) throw new DataError('value must be a decimal number', 400);
  const neg = value.startsWith('-');
  const [i, f = ''] = value.replace('-', '').split('.');
  if (f.length > decimals) throw new DataError(`value has more than ${decimals} decimals for this unit`, 400);
  const n = BigInt(i! + f.padEnd(decimals, '0'));
  return neg ? -n : n;
}

function fromBase(n: bigint, decimals: number): string {
  const neg = n < 0n;
  const s = (neg ? -n : n).toString().padStart(decimals + 1, '0');
  const int = s.slice(0, s.length - decimals);
  const frac = s.slice(s.length - decimals).replace(/0+$/, '');
  return (neg ? '-' : '') + int + (frac ? '.' + frac : '');
}

// ---- HTML ------------------------------------------------------------------

const decodeEntities = (s: string) =>
  s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)));

function metaContent(html: string, key: string): string | null {
  const re = new RegExp(`<meta[^>]+(?:name|property)=["']${key}["'][^>]*>`, 'i');
  const tag = html.match(re)?.[0];
  return tag ? decodeEntities(tag.match(/content=["']([^"']*)["']/i)?.[1] ?? '') || null : null;
}

function htmlToText(html: string): string {
  const body = html
    .replace(/<(script|style|noscript|svg|nav|footer|header|aside|form|iframe)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr|\/section|\/article)[^>]*>/gi, '\n')
    .replace(/<li[^>]*>/gi, '\n- ')
    .replace(/<[^>]+>/g, ' ');
  return decodeEntities(body)
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}

// ---- DNS -------------------------------------------------------------------

const DNS_TYPES = new Set(['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'SOA', 'CAA', 'SRV', 'PTR']);

async function dns(name: string, type: string) {
  const d = await getJson<{ Status: number; Answer?: { name: string; type: number; TTL: number; data: string }[] }>(
    `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=${type}`,
    { headers: { accept: 'application/dns-json' } },
  );
  return { status: d.Status === 0 ? 'NOERROR' : d.Status === 3 ? 'NXDOMAIN' : `RCODE_${d.Status}`, answers: (d.Answer ?? []).map((a) => ({ name: a.name, ttl: a.TTL, data: a.data.replace(/^"|"$/g, '').replace(/" "/g, '') })) };
}

const domainParam = (q: URLSearchParams, key = 'domain') => {
  const d = need(q, key, 253).trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  if (!/^(?=.{1,253}$)([a-z0-9-]{1,63}\.)+[a-z]{2,63}$/.test(d)) throw new DataError(`invalid ${key}`, 400);
  return d;
};

const DISPOSABLE = new Set(['mailinator.com', 'guerrillamail.com', '10minutemail.com', 'tempmail.com', 'temp-mail.org', 'yopmail.com', 'trashmail.com', 'getnada.com', 'sharklasers.com', 'dispostable.com', 'maildrop.cc', 'throwawaymail.com', 'fakeinbox.com', 'mintemail.com', 'emailondeck.com', 'moakt.com', 'mohmal.com', 'tempail.com', 'burnermail.io', 'mail.tm']);
const ROLE = new Set(['admin', 'info', 'support', 'sales', 'contact', 'noreply', 'no-reply', 'postmaster', 'abuse', 'webmaster', 'billing', 'help', 'office', 'hello']);

// ---- AI --------------------------------------------------------------------

async function llm(env: UtilEnv, system: string, user: string, maxTokens = 512, json = false): Promise<string> {
  let out: unknown;
  try {
    out = await env.ai.run(LLM as Parameters<Ai['run']>[0], {
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      max_tokens: maxTokens,
      ...(json ? { response_format: { type: 'json_object' } } : {}),
    } as never, GATEWAY);
  } catch (err) {
    throw new DataError(`AI model error: ${err instanceof Error ? err.message : 'unknown'}`, 502);
  }
  const o = out as { response?: unknown; choices?: { message?: { content?: string } }[] };
  const text = typeof o.response === 'string' ? o.response : o.response !== undefined ? JSON.stringify(o.response) : (o.choices?.[0]?.message?.content ?? '');
  return text.trim();
}

function parseJsonLoose(text: string): unknown {
  const start = text.search(/[[{]/);
  const end = Math.max(text.lastIndexOf('}'), text.lastIndexOf(']'));
  if (start < 0 || end < start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

const aiRun = async <T>(env: UtilEnv, model: string, input: Record<string, unknown>): Promise<T> => {
  try {
    return (await env.ai.run(model as Parameters<Ai['run']>[0], input as never, GATEWAY)) as T;
  } catch (err) {
    throw new DataError(`AI model error: ${err instanceof Error ? err.message : 'unknown'}`, 502);
  }
};

// ---- Handlers --------------------------------------------------------------

export const UTIL_HANDLERS: Record<string, Handler> = {
  async tool_catalog(q) {
    const task = q.get('task')?.slice(0, 500) ?? '';
    const routes = task ? recommendTools(task, 10) : ALL_ROUTES;
    return {
      task: task || null,
      tools: routes.map((r) => ({ id: r.id, method: r.method, path: r.path, price: r.priceUnits === null ? 'free' : `${unitsToUsdc(r.priceUnits)} USDC`, summary: r.summary, input: r.input })),
    };
  },

  async hash(q) {
    const algo = (q.get('algo') ?? 'sha256').toLowerCase().replace('-', '');
    const name = { sha1: 'SHA-1', sha256: 'SHA-256', sha384: 'SHA-384', sha512: 'SHA-512' }[algo];
    if (!name) throw new DataError('algo must be sha1, sha256, sha384 or sha512', 400);
    const digest = await crypto.subtle.digest(name, new TextEncoder().encode(need(q, 'text')));
    return { algo, hex: bytesToHex(digest), base64: bytesToB64(new Uint8Array(digest)) };
  },

  async base64(q) {
    const text = need(q, 'text');
    const url = q.get('url') === 'true';
    if ((q.get('mode') ?? 'encode') === 'decode') {
      try {
        return { mode: 'decode', result: b64UrlDecode(text.trim()) };
      } catch {
        throw new DataError('text is not valid base64', 400);
      }
    }
    let out = bytesToB64(new TextEncoder().encode(text));
    if (url) out = out.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    return { mode: 'encode', result: out };
  },

  async uuid(q) {
    const count = intParam(q, 'count', 1, 1, 100);
    const bytes = intParam(q, 'tokenBytes', 0, 0, 64);
    return {
      uuids: Array.from({ length: count }, () => crypto.randomUUID()),
      ...(bytes ? { token: bytesToHex(crypto.getRandomValues(new Uint8Array(bytes)).buffer as ArrayBuffer) } : {}),
    };
  },

  async jwt_decode(q) {
    const parts = need(q, 'token', 16_000).trim().split('.');
    if (parts.length < 2) throw new DataError('token is not a JWT', 400);
    let header: Record<string, unknown>;
    let payload: Record<string, unknown>;
    try {
      header = JSON.parse(b64UrlDecode(parts[0]!));
      payload = JSON.parse(b64UrlDecode(parts[1]!));
    } catch {
      throw new DataError('token header or payload is not valid base64url JSON', 400);
    }
    const now = Math.floor(Date.now() / 1000);
    const iso = (v: unknown) => (typeof v === 'number' ? new Date(v * 1000).toISOString() : null);
    return {
      header,
      payload,
      issuedAt: iso(payload.iat),
      notBefore: iso(payload.nbf),
      expiresAt: iso(payload.exp),
      expired: typeof payload.exp === 'number' ? payload.exp < now : null,
      secondsToExpiry: typeof payload.exp === 'number' ? payload.exp - now : null,
      signatureVerified: false,
    };
  },

  async json_format(q) {
    const text = need(q, 'text', 200_000);
    let value: unknown;
    try {
      value = JSON.parse(text);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'invalid JSON';
      const pos = Number(msg.match(/position (\d+)/)?.[1] ?? NaN);
      const before = Number.isFinite(pos) ? text.slice(0, pos) : '';
      return { valid: false, error: msg, ...(Number.isFinite(pos) ? { line: before.split('\n').length, column: pos - before.lastIndexOf('\n') } : {}) };
    }
    const sortDeep = (v: unknown): unknown =>
      Array.isArray(v) ? v.map(sortDeep) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortDeep((v as Record<string, unknown>)[k])])) : v;
    if (q.get('sortKeys') === 'true') value = sortDeep(value);
    let keys = 0;
    const depth = (v: unknown): number => {
      if (Array.isArray(v)) return 1 + Math.max(0, ...v.map(depth));
      if (v && typeof v === 'object') {
        keys += Object.keys(v).length;
        return 1 + Math.max(0, ...Object.values(v).map(depth));
      }
      return 0;
    };
    const d = depth(value);
    return { valid: true, type: Array.isArray(value) ? 'array' : value === null ? 'null' : typeof value, keys, depth: d, result: q.get('mode') === 'minify' ? JSON.stringify(value) : JSON.stringify(value, null, 2) };
  },

  async csv_to_json(q) {
    const text = need(q, 'text', 500_000);
    if (q.get('mode') === 'to_csv') {
      let rows: unknown;
      try {
        rows = JSON.parse(text);
      } catch {
        throw new DataError('text must be a JSON array of objects for mode=to_csv', 400);
      }
      if (!Array.isArray(rows) || !rows.every((r) => r && typeof r === 'object')) throw new DataError('text must be a JSON array of objects', 400);
      const d = q.get('delimiter') || ',';
      const cols = [...new Set(rows.flatMap((r) => Object.keys(r as object)))];
      const csv = [cols.map((c) => csvCell(c, d)).join(d), ...rows.map((r) => cols.map((c) => csvCell((r as Record<string, unknown>)[c], d)).join(d))].join('\n');
      return { columns: cols, rowCount: rows.length, csv };
    }
    const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
    const delimiter = q.get('delimiter') || [',', ';', '\t', '|'].sort((a, b) => firstLine.split(b).length - firstLine.split(a).length)[0]!;
    const [head, ...body] = parseCsv(text, delimiter);
    if (!head) throw new DataError('empty CSV', 400);
    const columns = head.map((h, i) => h.trim() || `column${i + 1}`);
    const rows = body.map((r) => Object.fromEntries(columns.map((c, i) => [c, r[i] ?? ''])));
    return { delimiter, columns, rowCount: rows.length, rows };
  },

  async units_convert(q) {
    const from = need(q, 'from', 20).toLowerCase();
    const to = need(q, 'to', 20).toLowerCase();
    const custom = intParam(q, 'decimals', 18, 0, 36);
    const dec = (u: string) => (u === 'units' ? 0 : u === 'token' ? custom : UNIT_DECIMALS[u]);
    const fd = dec(from);
    const td = dec(to);
    if (fd === undefined || td === undefined) throw new DataError('units must be wei, gwei, ether, lamports, sol, units or token', 400);
    const solFamily = (u: string) => u === 'lamports' || u === 'sol';
    if ((solFamily(from) && ['wei', 'gwei', 'ether', 'eth'].includes(to)) || (solFamily(to) && ['wei', 'gwei', 'ether', 'eth'].includes(from))) {
      throw new DataError('cannot convert between Solana and EVM units', 400);
    }
    const base = toBase(need(q, 'value', 80).trim(), fd);
    return { value: q.get('value'), from, to, result: fromBase(base, td), baseUnits: base.toString() };
  },

  async timestamp_convert(q) {
    const raw = q.get('value')?.trim();
    let date: Date;
    if (!raw) date = new Date();
    else if (/^-?\d+(\.\d+)?$/.test(raw)) {
      const n = Number(raw);
      date = new Date(Math.abs(n) >= 1e11 ? n : n * 1000);
    } else date = new Date(raw);
    if (Number.isNaN(date.getTime())) throw new DataError('value is not a timestamp or date', 400);
    const tz = q.get('tz') || 'UTC';
    let local: string;
    try {
      local = new Intl.DateTimeFormat('en-CA', { timeZone: tz, dateStyle: 'short', timeStyle: 'long', hour12: false }).format(date);
    } catch {
      throw new DataError('tz must be an IANA time zone such as Europe/Zagreb', 400);
    }
    const diff = Math.round((date.getTime() - Date.now()) / 1000);
    const rel = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
    const abs = Math.abs(diff);
    const relative = abs < 60 ? rel.format(diff, 'second') : abs < 3600 ? rel.format(Math.round(diff / 60), 'minute') : abs < 86400 ? rel.format(Math.round(diff / 3600), 'hour') : rel.format(Math.round(diff / 86400), 'day');
    return { iso: date.toISOString(), unix: Math.floor(date.getTime() / 1000), unixMs: date.getTime(), timeZone: tz, local, dayOfWeek: date.toLocaleDateString('en-US', { weekday: 'long', timeZone: tz }), relative };
  },

  async url_parse(q) {
    let u: URL;
    try {
      u = new URL(need(q, 'url', 8000));
    } catch {
      throw new DataError('url must be absolute', 400);
    }
    const tracking = [...u.searchParams.keys()].filter((k) => /^(utm_|fbclid|gclid|dclid|msclkid|mc_|igshid|ref_src|_ga)/i.test(k));
    const clean = new URL(u.toString());
    tracking.forEach((k) => clean.searchParams.delete(k));
    return {
      protocol: u.protocol.replace(':', ''),
      username: u.username || null,
      host: u.hostname,
      port: u.port || null,
      origin: u.origin,
      path: u.pathname,
      segments: u.pathname.split('/').filter(Boolean),
      query: Object.fromEntries(u.searchParams),
      fragment: u.hash.replace('#', '') || null,
      trackingParams: tracking,
      cleanUrl: clean.toString(),
    };
  },

  async text_stats(q) {
    const text = need(q, 'text', 500_000);
    const words = text.match(/[\p{L}\p{N}'’-]+/gu) ?? [];
    const sentences = text.split(/[.!?]+(?:\s|$)/).filter((s) => s.trim()).length;
    const freq = new Map<string, number>();
    for (const w of words) {
      const k = w.toLowerCase();
      if (k.length > 3) freq.set(k, (freq.get(k) ?? 0) + 1);
    }
    return {
      characters: text.length,
      charactersNoSpaces: text.replace(/\s/g, '').length,
      words: words.length,
      sentences,
      paragraphs: text.split(/\n\s*\n/).filter((p) => p.trim()).length,
      avgWordsPerSentence: sentences ? Number((words.length / sentences).toFixed(1)) : 0,
      readingTimeSec: Math.ceil((words.length / 238) * 60),
      speakingTimeSec: Math.ceil((words.length / 150) * 60),
      topWords: [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([word, count]) => ({ word, count })),
    };
  },

  async web_extract(q) {
    const url = publicUrl(need(q, 'url', 4000));
    const maxChars = intParam(q, 'maxChars', 15_000, 500, 50_000);
    const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(10_000), headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5' } });
    const type = res.headers.get('content-type') ?? '';
    if (!res.ok) throw new DataError(`Page returned HTTP ${res.status}`, 502);
    if (!/text|html|xml|json/.test(type)) throw new DataError(`Unsupported content type ${type}`, 415);
    const raw = (await res.text()).slice(0, 2_000_000);
    if (!/html/.test(type)) return { url: res.url, contentType: type, text: raw.slice(0, maxChars), truncated: raw.length > maxChars };
    const title = decodeEntities(raw.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() ?? '') || null;
    const main = raw.match(/<(article|main)[^>]*>[\s\S]*?<\/\1>/i)?.[0] ?? raw.match(/<body[^>]*>[\s\S]*<\/body>/i)?.[0] ?? raw;
    const text = htmlToText(main);
    const headings = [...raw.matchAll(/<h([1-3])[^>]*>([\s\S]*?)<\/h\1>/gi)].slice(0, 30).map((m) => ({ level: Number(m[1]), text: htmlToText(m[2]!).replace(/\n/g, ' ') })).filter((h) => h.text);
    return {
      url: res.url,
      status: res.status,
      title,
      description: metaContent(raw, 'description') ?? metaContent(raw, 'og:description'),
      canonical: raw.match(/<link[^>]+rel=["']canonical["'][^>]*href=["']([^"']+)["']/i)?.[1] ?? null,
      language: raw.match(/<html[^>]+lang=["']([^"']+)["']/i)?.[1] ?? null,
      openGraph: { title: metaContent(raw, 'og:title'), image: metaContent(raw, 'og:image'), type: metaContent(raw, 'og:type'), siteName: metaContent(raw, 'og:site_name') },
      headings,
      linkCount: (raw.match(/<a\s[^>]*href=/gi) ?? []).length,
      wordCount: (text.match(/\S+/g) ?? []).length,
      text: text.slice(0, maxChars),
      truncated: text.length > maxChars,
    };
  },

  async dns_lookup(q) {
    const name = domainParam(q, 'name');
    const type = (q.get('type') ?? 'A').toUpperCase();
    if (!DNS_TYPES.has(type)) throw new DataError(`type must be one of ${[...DNS_TYPES].join(', ')}`, 400);
    return { name, type, ...(await dns(name, type)) };
  },

  async http_check(q) {
    let url = publicUrl(need(q, 'url', 4000));
    const chain: { url: string; status: number }[] = [];
    const started = Date.now();
    let res: Response | undefined;
    for (let hop = 0; hop < 6; hop++) {
      res = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(8000), headers: { 'user-agent': UA } });
      chain.push({ url: url.toString(), status: res.status });
      const loc = res.headers.get('location');
      if (res.status < 300 || res.status >= 400 || !loc) break;
      url = publicUrl(new URL(loc, url).toString());
    }
    const h = res!.headers;
    const body = await res!.arrayBuffer();
    return {
      finalUrl: url.toString(),
      status: res!.status,
      redirects: chain.slice(0, -1),
      latencyMs: Date.now() - started,
      contentType: h.get('content-type'),
      bytes: body.byteLength,
      server: h.get('server'),
      securityHeaders: {
        hsts: h.has('strict-transport-security'),
        csp: h.has('content-security-policy'),
        xFrameOptions: h.get('x-frame-options'),
        xContentTypeOptions: h.get('x-content-type-options'),
        referrerPolicy: h.get('referrer-policy'),
        permissionsPolicy: h.has('permissions-policy'),
      },
      https: url.protocol === 'https:',
    };
  },

  async whois(q) {
    const domain = domainParam(q);
    type Rdap = { ldhName?: string; status?: string[]; events?: { eventAction: string; eventDate: string }[]; nameservers?: { ldhName: string }[]; entities?: { roles?: string[]; vcardArray?: [string, [string, unknown, string, string][]] }[] };
    const d = await getJson<Rdap>(`https://rdap.org/domain/${domain}`, { headers: { accept: 'application/rdap+json' } });
    const ev = (a: string) => d.events?.find((e) => e.eventAction === a)?.eventDate ?? null;
    const registrar = d.entities?.find((e) => e.roles?.includes('registrar'))?.vcardArray?.[1]?.find((f) => f[0] === 'fn')?.[3] ?? null;
    const created = ev('registration');
    return {
      domain: d.ldhName?.toLowerCase() ?? domain,
      registrar,
      created,
      updated: ev('last changed'),
      expires: ev('expiration'),
      ageDays: created ? Math.floor((Date.now() - Date.parse(created)) / 86_400_000) : null,
      status: d.status ?? [],
      nameservers: (d.nameservers ?? []).map((n) => n.ldhName.toLowerCase()),
    };
  },

  async email_validate(q) {
    const email = need(q, 'email', 320).trim();
    const syntax = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@([A-Za-z0-9-]+\.)+[A-Za-z]{2,63}$/.test(email) && !email.includes('..');
    if (!syntax) return { email, valid: false, syntax: false, reason: 'invalid syntax' };
    const [local, domain] = email.toLowerCase().split('@') as [string, string];
    const [mx, a] = await Promise.all([dns(domain, 'MX'), dns(domain, 'A')]);
    const nullMx = mx.answers.some((r) => /^0 \.?$/.test(r.data));
    const canReceive = !nullMx && (mx.answers.length > 0 || a.answers.length > 0);
    const disposable = DISPOSABLE.has(domain);
    return {
      email,
      valid: canReceive && !disposable,
      syntax: true,
      domain,
      mx: mx.answers.map((r) => r.data),
      acceptsMail: canReceive,
      disposable,
      roleAccount: ROLE.has(local),
      freeProvider: ['gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'icloud.com', 'proton.me', 'protonmail.com', 'gmx.com', 'aol.com'].includes(domain),
    };
  },

  async domain_email_security(q) {
    const domain = domainParam(q);
    const [txt, dmarcTxt, mx] = await Promise.all([dns(domain, 'TXT'), dns(`_dmarc.${domain}`, 'TXT'), dns(domain, 'MX')]);
    const spf = txt.answers.map((r) => r.data).find((t) => t.toLowerCase().startsWith('v=spf1')) ?? null;
    const dmarc = dmarcTxt.answers.map((r) => r.data).find((t) => t.toLowerCase().startsWith('v=dmarc1')) ?? null;
    const tag = (rec: string | null, k: string) => rec?.match(new RegExp(`(?:^|;)\\s*${k}=([^;]+)`, 'i'))?.[1]?.trim() ?? null;
    const issues: string[] = [];
    if (!spf) issues.push('No SPF record');
    else if (/\+all/.test(spf)) issues.push('SPF +all lets anyone send as this domain');
    else if (/\?all/.test(spf)) issues.push('SPF ?all is neutral and gives no protection');
    if (!dmarc) issues.push('No DMARC record');
    else if (tag(dmarc, 'p') === 'none') issues.push('DMARC p=none only monitors, does not block spoofing');
    if (!mx.answers.length) issues.push('No MX records');
    return {
      domain,
      spf: { present: !!spf, record: spf, all: spf?.match(/[~?+-]all/)?.[0] ?? null, lookups: spf ? (spf.match(/\b(include|a|mx|ptr|exists|redirect)[:=]/g) ?? []).length : 0 },
      dmarc: { present: !!dmarc, record: dmarc, policy: tag(dmarc, 'p'), subdomainPolicy: tag(dmarc, 'sp'), reportTo: tag(dmarc, 'rua') },
      mx: mx.answers.map((r) => r.data),
      issues,
      grade: issues.length === 0 ? 'A' : issues.length === 1 ? 'B' : issues.length === 2 ? 'C' : 'F',
    };
  },

  async fx_rates(q) {
    const base = (q.get('base') ?? 'EUR').toUpperCase();
    const symbols = q.get('symbols')?.toUpperCase().replace(/\s/g, '');
    const date = q.get('date');
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new DataError('date must be YYYY-MM-DD', 400);
    if (!/^[A-Z]{3}$/.test(base) || (symbols && !/^[A-Z]{3}(,[A-Z]{3})*$/.test(symbols))) throw new DataError('currencies must be 3-letter ISO codes', 400);
    const amount = Number(q.get('amount') ?? 1);
    const d = await getJson<{ base: string; date: string; rates: Record<string, number> }>(
      `https://api.frankfurter.app/${date ?? 'latest'}?from=${base}${symbols ? `&to=${symbols}` : ''}`,
    );
    return {
      base: d.base,
      date: d.date,
      amount,
      rates: d.rates,
      ...(amount !== 1 ? { converted: Object.fromEntries(Object.entries(d.rates).map(([k, v]) => [k, Number((v * amount).toFixed(4))])) } : {}),
      source: 'European Central Bank via frankfurter.app',
    };
  },

  async weather(q) {
    let lat = Number(q.get('lat'));
    let lon = Number(q.get('lon'));
    let place = q.get('place');
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || q.get('lat') === null) {
      if (!place) throw new DataError('give place or lat and lon', 400);
      const g = await getJson<{ results?: { name: string; country?: string; latitude: number; longitude: number }[] }>(
        `https://geocoding-api.open-meteo.com/v1/search?count=1&name=${encodeURIComponent(place.slice(0, 100))}`,
      );
      const hit = g.results?.[0];
      if (!hit) throw new DataError(`Place not found: ${place}`, 404);
      lat = hit.latitude;
      lon = hit.longitude;
      place = [hit.name, hit.country].filter(Boolean).join(', ');
    }
    type W = { current: Record<string, number>; daily: Record<string, (number | string)[]>; timezone: string };
    const w = await getJson<W>(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&timezone=auto&forecast_days=3&current=temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,wind_speed_10m,wind_direction_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max`,
    );
    const c = w.current;
    return {
      place: place ?? null,
      lat,
      lon,
      timezone: w.timezone,
      current: { temperatureC: c.temperature_2m, feelsLikeC: c.apparent_temperature, humidityPct: c.relative_humidity_2m, precipitationMm: c.precipitation, windKmh: c.wind_speed_10m, windDirectionDeg: c.wind_direction_10m, weatherCode: c.weather_code },
      daily: (w.daily.time ?? []).map((t, i) => ({
        date: t,
        maxC: w.daily.temperature_2m_max?.[i],
        minC: w.daily.temperature_2m_min?.[i],
        precipitationMm: w.daily.precipitation_sum?.[i],
        precipitationChancePct: w.daily.precipitation_probability_max?.[i],
        maxWindKmh: w.daily.wind_speed_10m_max?.[i],
        weatherCode: w.daily.weather_code?.[i],
      })),
      weatherCodes: 'WMO: 0 clear, 1-3 cloudy, 45-48 fog, 51-67 rain/drizzle, 71-77 snow, 80-82 showers, 95-99 thunderstorm',
      source: 'open-meteo.com',
    };
  },

  async wikipedia(q) {
    const lang = (q.get('lang') ?? 'en').toLowerCase();
    if (!/^[a-z]{2,3}(-[a-z]+)?$/.test(lang)) throw new DataError('lang must be a Wikipedia language code', 400);
    const term = need(q, 'q', 200);
    const s = await getJson<{ pages?: { key: string }[] }>(`https://${lang}.wikipedia.org/w/rest.php/v1/search/title?limit=1&q=${encodeURIComponent(term)}`);
    const key = s.pages?.[0]?.key;
    if (!key) throw new DataError(`No article for ${term}`, 404);
    const d = await getJson<{ title: string; description?: string; extract: string; thumbnail?: { source: string }; content_urls?: { desktop?: { page?: string } } }>(
      `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(key)}`,
    );
    return { title: d.title, description: d.description ?? null, extract: d.extract, thumbnail: d.thumbnail?.source ?? null, url: d.content_urls?.desktop?.page ?? null, lang };
  },

  async github_repo(q) {
    const repo = need(q, 'repo', 140).trim().replace(/^https?:\/\/github\.com\//, '').replace(/\/$/, '');
    if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new DataError('repo must be owner/name', 400);
    type R = { full_name: string; description: string | null; stargazers_count: number; forks_count: number; open_issues_count: number; subscribers_count: number; language: string | null; license: { spdx_id: string } | null; topics: string[]; pushed_at: string; created_at: string; archived: boolean; default_branch: string; html_url: string; homepage: string | null };
    const gh = { headers: { accept: 'application/vnd.github+json' } };
    const [r, rel] = await Promise.all([
      getJson<R>(`https://api.github.com/repos/${repo}`, gh),
      getJson<{ tag_name: string; name: string; published_at: string }>(`https://api.github.com/repos/${repo}/releases/latest`, gh).catch(() => null),
    ]);
    return {
      repo: r.full_name,
      description: r.description,
      stars: r.stargazers_count,
      forks: r.forks_count,
      openIssues: r.open_issues_count,
      watchers: r.subscribers_count,
      language: r.language,
      license: r.license?.spdx_id ?? null,
      topics: r.topics,
      createdAt: r.created_at,
      lastPush: r.pushed_at,
      daysSinceLastPush: Math.floor((Date.now() - Date.parse(r.pushed_at)) / 86_400_000),
      archived: r.archived,
      defaultBranch: r.default_branch,
      latestRelease: rel ? { tag: rel.tag_name, name: rel.name, publishedAt: rel.published_at } : null,
      url: r.html_url,
      homepage: r.homepage,
    };
  },

  async image_transform(q) {
    const url = publicUrl(need(q, 'url', 4000));
    const fit = q.get('fit') ?? 'scale-down';
    const format = q.get('format') ?? 'webp';
    if (!['scale-down', 'contain', 'cover', 'crop', 'pad'].includes(fit)) throw new DataError('fit must be scale-down, contain, cover, crop or pad', 400);
    if (!['webp', 'avif', 'jpeg', 'png', 'auto'].includes(format)) throw new DataError('format must be webp, avif, jpeg, png or auto', 400);
    const width = q.get('width') ? intParam(q, 'width', 0, 1, 4096) : undefined;
    const height = q.get('height') ? intParam(q, 'height', 0, 1, 4096) : undefined;
    // cf.image runs Cloudflare Image Transformations on the zone (enabled for skinwinking.com).
    const res = await fetch(url, {
      signal: AbortSignal.timeout(15_000),
      headers: { 'user-agent': UA, accept: 'image/avif,image/webp,image/*' },
      cf: { image: { fit, format: format === 'auto' ? undefined : format, quality: intParam(q, 'quality', 85, 1, 100), ...(width ? { width } : {}), ...(height ? { height } : {}) } },
    } as RequestInit);
    if (!res.ok) throw new DataError(`Image fetch or transform failed: HTTP ${res.status}`, 502);
    const type = res.headers.get('content-type') ?? 'application/octet-stream';
    if (!type.startsWith('image/')) throw new DataError(`URL did not return an image (${type})`, 415);
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.byteLength > 4_000_000) throw new DataError('Output larger than 4 MB; request a smaller width', 413);
    let bin = '';
    for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    return { contentType: type, bytes: buf.byteLength, transformed: res.headers.has('cf-resized'), image: `data:${type};base64,${btoa(bin)}` };
  },

  async domain_reputation(q, env) {
    const domain = domainParam(q);
    type Cat = { id: number; name: string };
    type Intel = { popularity_rank?: number; application?: { name?: string }; content_categories?: Cat[]; inherited_content_categories?: Cat[]; risk_types?: Cat[]; inherited_risk_types?: Cat[] };
    type Scan = { task: { time: string; url: string }; verdicts: { malicious: boolean }; result: string };
    const [intel, scans, rdap] = await Promise.all([
      cfIntel<Intel>(env, `intel/domain?domain=${domain}`),
      cfIntel<Scan[]>(env, `urlscanner/v2/search?q=page.domain:${encodeURIComponent(domain)}&size=10`),
      getJson<{ events?: { eventAction: string; eventDate: string }[] }>(`https://rdap.org/domain/${domain}`, { headers: { accept: 'application/rdap+json' } }).catch(() => null),
    ]);
    const created = rdap?.events?.find((e) => e.eventAction === 'registration')?.eventDate ?? null;
    const ageDays = created ? Math.floor((Date.now() - Date.parse(created)) / 86_400_000) : null;
    const categories = [...(intel?.content_categories ?? []), ...(intel?.inherited_content_categories ?? [])].map((c) => c.name);
    const risks = [...(intel?.risk_types ?? []), ...(intel?.inherited_risk_types ?? [])].map((c) => c.name);
    const maliciousScans = (scans ?? []).filter((s) => s.verdicts?.malicious);
    const flags: string[] = [];
    if (risks.length) flags.push(...risks.map((r) => `RISK:${r}`));
    if (maliciousScans.length) flags.push(`MALICIOUS_SCANS:${maliciousScans.length}`);
    if (ageDays !== null && ageDays < 30) flags.push('NEWLY_REGISTERED');
    if (!intel?.popularity_rank && !categories.length) flags.push('UNKNOWN_TO_CLOUDFLARE');
    const verdict = risks.length || maliciousScans.length ? 'malicious' : flags.length ? 'suspicious' : 'clean';
    return {
      domain,
      verdict,
      flags,
      popularityRank: intel?.popularity_rank ?? null,
      application: intel?.application?.name ?? null,
      categories: [...new Set(categories)],
      riskTypes: [...new Set(risks)],
      registered: created,
      ageDays,
      recentScans: (scans ?? []).slice(0, 5).map((s) => ({ time: s.task.time, url: s.task.url, malicious: s.verdicts?.malicious ?? false, report: s.result })),
      source: 'Cloudflare threat intelligence, URL scanner, RDAP',
    };
  },

  async ip_reputation(q, env) {
    const ip = need(q, 'ip', 45).trim();
    const v6 = ip.includes(':');
    if (!v6 && !IPV4.test(ip)) throw new DataError('ip must be an IPv4 or IPv6 address', 400);
    type IpIntel = { belongs_to_ref?: { value: number; country: string; description: string; type: string }; ip_lists?: string[] | null; ptr_lookup?: { ptr_domains?: string[] }; iana_reservations?: unknown[] };
    const r = await cfIntel<IpIntel[]>(env, `intel/ip?${v6 ? 'ipv6' : 'ipv4'}=${encodeURIComponent(ip)}`);
    const d = r?.[0];
    if (!d) throw new DataError('No data for this IP', 404);
    const lists = d.ip_lists ?? [];
    const reserved = (d.iana_reservations ?? []).length > 0;
    return {
      ip,
      asn: d.belongs_to_ref?.value ?? null,
      network: d.belongs_to_ref?.description ?? null,
      networkType: d.belongs_to_ref?.type ?? null,
      country: d.belongs_to_ref?.country ?? null,
      lists,
      ptr: d.ptr_lookup?.ptr_domains ?? [],
      reserved,
      isTor: lists.includes('tor'),
      isAnonymizer: lists.some((l) => /tor|vpn|proxy|anonym/i.test(l)),
      verdict: reserved ? 'reserved' : lists.length ? 'flagged' : 'no_known_flags',
      source: 'Cloudflare threat intelligence',
    };
  },

  async ai_summarize(q, env) {
    const length = q.get('length') ?? 'short';
    const words = { short: 60, medium: 150, long: 300 }[length] ?? 60;
    const lang = q.get('language');
    const out = await llm(
      env,
      `You summarize text. Reply with JSON only: {"summary": string (about ${words} words${lang ? `, in ${lang}` : ', in the language of the text'}), "keyPoints": string[] (3-6 short bullets)}. Use only facts from the text.`,
      need(q, 'text'),
      Math.min(1024, words * 4 + 200),
      true,
    );
    const j = parseJsonLoose(out) as { summary?: string; keyPoints?: string[] } | null;
    return { summary: j?.summary ?? out, keyPoints: j?.keyPoints ?? [], model: LLM };
  },

  async ai_translate(q, env) {
    const to = need(q, 'to', 40).toLowerCase();
    const from = q.get('from')?.toLowerCase();
    const r = await aiRun<{ translated_text?: string }>(env, '@cf/meta/m2m100-1.2b', { text: need(q, 'text', 5000), target_lang: to, ...(from ? { source_lang: from } : {}) });
    if (!r.translated_text) throw new DataError('Translation failed; use a language name like german or a code like de', 502);
    return { translation: r.translated_text, to, from: from ?? 'auto', model: 'm2m100-1.2b' };
  },

  async ai_sentiment(q, env) {
    const texts = toList(need(q, 'text'), 50);
    const results = await Promise.all(
      texts.map(async (text) => {
        const r = await aiRun<{ label: string; score: number }[]>(env, '@cf/huggingface/distilbert-sst-2-int8', { text: text.slice(0, 2000) });
        const top = [...r].sort((a, b) => b.score - a.score)[0]!;
        return { text: text.slice(0, 80), label: top.label, score: Number(top.score.toFixed(4)) };
      }),
    );
    return texts.length === 1 ? { label: results[0]!.label, score: results[0]!.score } : { results };
  },

  async ai_classify(q, env) {
    const labels = need(q, 'labels', 1000).split(',').map((l) => l.trim()).filter(Boolean);
    if (labels.length < 2 || labels.length > 30) throw new DataError('labels must list 2-30 options', 400);
    const out = await llm(
      env,
      `Classify the user's text into exactly one of these labels: ${JSON.stringify(labels)}. Reply with JSON only: {"label": one of the labels, "confidence": number 0-1, "reason": short string}.`,
      need(q, 'text'),
      150,
      true,
    );
    const j = parseJsonLoose(out) as { label?: string; confidence?: number; reason?: string } | null;
    const label = labels.find((l) => l.toLowerCase() === String(j?.label ?? '').toLowerCase()) ?? labels.find((l) => out.toLowerCase().includes(l.toLowerCase())) ?? null;
    return { label, confidence: typeof j?.confidence === 'number' ? j.confidence : null, reason: j?.reason ?? null, labels };
  },

  async ai_extract(q, env) {
    const fields = q.get('fields')?.split(',').map((f) => f.trim()).filter(Boolean) ?? [];
    const schema = fields.length
      ? `an object with exactly these keys: ${JSON.stringify(fields)}; use null when a value is missing`
      : 'an object with keys people, organizations, places, dates, amounts, tickers, each an array of strings';
    const out = await llm(env, `Extract data from the user's text. Reply with JSON only: ${schema}. Copy values exactly as written; never invent values.`, need(q, 'text'), 800, true);
    const data = parseJsonLoose(out);
    if (!data) throw new DataError('Model did not return valid JSON; try a shorter text', 502);
    return { data, fields: fields.length ? fields : 'entities' };
  },

  async ai_answer(q, env) {
    const out = await llm(
      env,
      'Answer the question using only the provided context. Reply with JSON only: {"answer": string or null, "found": boolean, "quote": the shortest exact supporting quote from the context or null}. If the context does not contain the answer, set found to false and answer to null.',
      `Context:\n${need(q, 'context')}\n\nQuestion: ${need(q, 'question', 1000)}`,
      400,
      true,
    );
    const j = parseJsonLoose(out) as { answer?: string | null; found?: boolean; quote?: string | null } | null;
    return { answer: j?.answer ?? null, found: j?.found ?? false, quote: j?.quote ?? null };
  },

  async ai_chat(q, env) {
    const text = await llm(env, q.get('system')?.slice(0, 4000) || 'You are a helpful, concise assistant.', need(q, 'prompt'), intParam(q, 'maxTokens', 512, 16, 1024));
    return { text, model: LLM };
  },

  async ai_rewrite(q, env) {
    const tone = (q.get('tone') ?? 'fix').toLowerCase();
    const task =
      tone === 'fix'
        ? 'Correct grammar, spelling and punctuation. Change nothing else.'
        : `Rewrite the text in a ${tone} tone while keeping its meaning and language.`;
    const text = await llm(env, `${task} Reply with the rewritten text only, no preamble or quotes.`, need(q, 'text', 8000), 1024);
    return { text, tone };
  },

  async ai_embeddings(q, env) {
    const texts = toList(need(q, 'text', 200_000), 50).map((t) => t.slice(0, 2000));
    const r = await aiRun<{ shape: number[]; data: number[][] }>(env, '@cf/baai/bge-base-en-v1.5', { text: texts });
    return { model: 'bge-base-en-v1.5', dimensions: r.shape?.[1] ?? r.data[0]?.length ?? 0, count: r.data.length, vectors: r.data };
  },

  async ai_image(q, env) {
    const r = await aiRun<{ image?: string }>(env, '@cf/black-forest-labs/flux-1-schnell', { prompt: need(q, 'prompt', 2000), steps: intParam(q, 'steps', 4, 1, 8) });
    if (!r.image) throw new DataError('Image generation failed', 502);
    return { image: `data:image/jpeg;base64,${r.image}`, model: 'flux-1-schnell' };
  },
};
