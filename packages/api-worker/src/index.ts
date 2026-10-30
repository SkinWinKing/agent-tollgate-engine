import { ALL_ROUTES, loadConfig, unitsToUsdc } from '@tollgate/core';
import { resolveOutcome } from './analytics';
import { handleRpc, llmsTxt, openApiSpec, type DiscoveryContext } from '@tollgate/discovery';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { AppEnv } from './env';
import { discovery } from './agent-discovery';
import { auth } from './auth';
import { routes, TOOL_HANDLERS } from './routes';
import { trade } from './trade';
import { apiKeyFrom, apiKeys } from './api-keys';
import { legal } from './legal';
import { cryptapi } from './cryptapi';
import { serveApp, webApp } from './web-app';

export { NonceStore } from './nonce-store';

const app = new Hono<AppEnv>();

/*
 * Subrequests from the skinwinking.com custom domain to some origins outside Cloudflare (GitHub, open-meteo,
 * Wikipedia, alternative.me, PayAI) fail with a Cloudflare 525, while the same fetch from a Worker without the
 * zone context succeeds (a service binding inherits the zone context, so it does not help). Retry those once through
 * the tollgate-egress Worker on workers.dev, authenticated with a shared secret.
 */
const nativeFetch = globalThis.fetch.bind(globalThis);
let egress: { url: string; token: string } | undefined;
// Replay a request through the egress Worker. Only safe when the body can be replayed
// (strings/buffers in init), never a consumed stream, so callers pass a replayable init.
const viaEgress = (input: RequestInfo | URL, init?: RequestInit) => {
  const url = input instanceof Request ? input.url : String(input);
  const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
  headers.set('x-egress-url', url);
  headers.set('x-egress-token', egress!.token);
  return nativeFetch(egress!.url, { method: init?.method ?? (input instanceof Request ? input.method : 'GET'), headers, body: init?.body ?? undefined, signal: init?.signal ?? undefined });
};
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const replayable = egress && !(input instanceof Request && input.body);
  try {
    const res = await nativeFetch(input, init);
    // Some non-Cloudflare origins answer 525 from the zone context; others reject at the TLS layer
    // and throw below. Both succeed from the zone-free egress Worker, so retry once there.
    if (res.status !== 525 || !replayable) return res;
    return await viaEgress(input, init);
  } catch (err) {
    if (!replayable) throw err;
    return await viaEgress(input, init);
  }
}) as typeof fetch;

app.use('*', async (c, next) => {
  if (!egress && c.env.EGRESS_URL && c.env.EGRESS_TOKEN) egress = { url: c.env.EGRESS_URL, token: c.env.EGRESS_TOKEN };
  await next();
});

app.use('*', cors({ origin: '*', exposeHeaders: ['PAYMENT-REQUIRED', 'PAYMENT-RESPONSE', 'X-PAYMENT-RESPONSE', 'EXTENSION-RESPONSES', 'X-402-Nonce', 'WWW-Authenticate'], allowHeaders: ['Content-Type', 'Authorization', 'PAYMENT-SIGNATURE', 'X-PAYMENT', 'X-402-Signature'] }));

const context = (env: AppEnv['Bindings'], url: string): DiscoveryContext => {
  const cfg = loadConfig(env as unknown as Record<string, unknown>);
  return { origin: new URL(url).origin, merchantSol: cfg.merchantSol, merchantEvm: cfg.merchantEvm, feeBps: cfg.feeBps };
};

// One Analytics Engine point per tool call: which tools agents ask for, how often they pay, from where.
const ROUTE_BY_PATH = new Map(ALL_ROUTES.map((r) => [r.path, r.id]));
app.use('/api/v1/*', async (c, next) => {
  const started = Date.now();
  await next();
  const status = c.res.status;
  const payment = c.get('payment');
  const outcome = resolveOutcome(status, payment, !!apiKeyFrom(c.req.raw.headers));
  const ua = (c.req.header('user-agent') ?? 'none').split(/[\s/;(]/)[0]!.slice(0, 40);
  const source = (c.req.header('x-tollgate-source') ?? 'http').replace(/[^\w.-]/g, '').slice(0, 32) || 'http';
  const tool = ROUTE_BY_PATH.get(c.req.path);
  if (tool) {
    const stub = c.env.NONCE_STORE.get(c.env.NONCE_STORE.idFromName('global'));
    const country = String((c.req.raw.cf as { country?: string } | undefined)?.country ?? 'XX');
    c.executionCtx.waitUntil(stub.logEvent({ t: Date.now(), tool, outcome, source, country }).catch(() => {}));
  }
  try {
    c.env.EVENTS.writeDataPoint({
      indexes: [ROUTE_BY_PATH.get(c.req.path) ?? 'unknown'],
      blobs: [ROUTE_BY_PATH.get(c.req.path) ?? c.req.path.slice(0, 80), outcome, String((c.req.raw.cf as { country?: string } | undefined)?.country ?? 'XX'), ua, source],
      doubles: [status, Date.now() - started],
    });
  } catch {
    // Analytics must never break a paid response.
  }
});

// Paid answers and 402 challenges carry one-time nonces: never cache them. Discovery documents may be cached briefly.
const DYNAMIC = /^\/(api|mcp|a2a|internal)(\/|$)/;
app.use('*', async (c, next) => {
  await next();
  if (c.res.headers.has('cache-control')) return;
  if (DYNAMIC.test(c.req.path) || c.res.status === 402 || c.req.method !== 'GET') c.res.headers.set('cache-control', 'no-store');
  else if (c.res.status === 200) c.res.headers.set('cache-control', 'public, max-age=300');
});

app.route('/', discovery);

app.get('/favicon.ico', (c) => c.redirect('/brand/skw-coin.webp', 302));
app.get('/favicon.svg', (c) => c.redirect('/brand/skw-coin.webp', 302));
app.get('/health', (c) => c.json({ ok: true }));
// Agents asking for markdown get the catalog directly; everyone else is redirected to it.
// Agents asking for markdown get the catalog, browsers get the web app, everything else is sent to the catalog.
app.get('/', (c) => {
  const accept = c.req.header('accept') ?? '';
  if (accept.includes('text/markdown')) return c.body(llmsTxt(context(c.env, c.req.url)), 200, { 'content-type': 'text/markdown; charset=utf-8', vary: 'Accept' });
  if (accept.includes('text/html')) return serveApp(c);
  return c.redirect('/llms.txt');
});
app.route('/', auth);
app.route('/', apiKeys);
app.route('/', legal);
app.route('/', webApp);
app.route('/', trade);
app.route('/', cryptapi);
app.get('/llms.txt', (c) => c.body(llmsTxt(context(c.env, c.req.url)), 200, { 'content-type': 'text/markdown; charset=utf-8' }));
app.get('/openapi.json', (c) => c.json(openApiSpec(context(c.env, c.req.url))));

// x402 discovery manifest read by crawlers (x402scan, Agent402 index) to list every paid resource.
app.get('/.well-known/x402', (c) => {
  const origin = new URL(c.req.url).origin;
  return c.json({ version: 1, resources: ALL_ROUTES.map((r) => `${origin}${r.path}`) });
});

// A2A agent card so agent frameworks can discover the tools without knowing x402.
app.get('/.well-known/agent-card.json', (c) => {
  const origin = new URL(c.req.url).origin;
  return c.json({
    protocolVersion: '0.3.0',
    name: 'Agent Tollgate Engine',
    description: `Tell it a task in plain language and it returns the matching pay-per-call tools (${ALL_ROUTES.length} total: crypto data, token audits, swaps, web and threat-intel lookups, AI tools) with prices. Tools are paid per request in USDC over x402; no account or API key. MCP: ${origin}/mcp`,
    url: `${origin}/a2a`,
    preferredTransport: 'JSONRPC',
    supportedInterfaces: [{ url: `${origin}/a2a`, protocolBinding: 'JSONRPC', protocolVersion: '0.3.0' }],
    additionalInterfaces: [{ url: `${origin}/a2a`, transport: 'JSONRPC' }],
    version: '1.0.0',
    provider: { organization: 'Agent Tollgate', url: origin },
    documentationUrl: `${origin}/llms.txt`,
    capabilities: { streaming: false, pushNotifications: false },
    defaultInputModes: ['application/json'],
    defaultOutputModes: ['application/json'],
    skills: ALL_ROUTES.map((r) => ({
      id: r.id,
      name: r.summary,
      description: `${r.description} Price: ${r.priceUnits === null ? 'free' : `${unitsToUsdc(r.priceUnits)} USDC`} via x402 at ${r.method} ${origin}${r.path}.`,
      tags: ['x402', 'crypto', r.path.split('/')[3] ?? 'api'],
    })),
  });
});
// AI crawlers and agents are the customers here: invite them in and point them at the machine-readable docs.
app.get('/robots.txt', (c) => {
  const origin = new URL(c.req.url).origin;
  return c.text(
    `User-agent: *\nContent-Signal: search=yes, ai-input=yes, ai-train=yes\nAllow: /\nDisallow: /internal/\n\n# Pay-per-call tools for AI agents (x402). Start here:\n# ${origin}/llms.txt\n# ${origin}/openapi.json\n# ${origin}/.well-known/x402\n# MCP: ${origin}/mcp\n\nSitemap: ${origin}/sitemap.xml\n`,
  );
});

// RFC 9116 contact for vulnerability reports.
app.get('/.well-known/security.txt', (c) => {
  const expires = new Date(Date.now() + 180 * 86_400_000).toISOString();
  return c.text(
    `Contact: mailto:support@skinwinking.com\nExpires: ${expires}\nPreferred-Languages: en, hr\nCanonical: ${new URL(c.req.url).origin}/.well-known/security.txt\nPolicy: https://github.com/SkinWinKing/agent-tollgate-engine/security\n`,
  );
});
app.get('/security.txt', (c) => c.redirect('/.well-known/security.txt', 301));
app.get('/.well-known/agent.json', (c) => c.redirect('/.well-known/agent-card.json', 301));
app.get('/.well-known/mcptry-verify.txt', (c) => new Response('mcptry-verify=qgY-BF-cVVLhadpHaZL8SSll5q3msH4P\n', { headers: { 'content-type': 'text/plain' } }));

app.get('/mcp', (c) => c.body(null, 405, { Allow: 'POST' }));

app.post('/mcp', async (c) => {
  const msg = await c.req.json().catch(() => null);
  if (!msg || msg.jsonrpc !== '2.0') return c.json({ jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Invalid Request' } }, 400);
  const dispatch = async (path: string, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    headers.set('cf-connecting-ip', c.req.header('cf-connecting-ip') ?? 'unknown');
    headers.set('x-tollgate-source', 'mcp');
    const key = apiKeyFrom(c.req.raw.headers);
    if (key && !apiKeyFrom(headers)) headers.set('x-api-key', key);
    return app.fetch(new Request(new URL(path, c.req.url), { ...init, headers }), c.env, c.executionCtx);
  };
  const response = await handleRpc(msg, dispatch);
  return response ? c.json(response) : c.body(null, 202);
});

// Usage counters for the operator; disabled unless STATS_TOKEN is set as a secret.
app.get('/internal/stats', async (c) => {
  const token = c.env.STATS_TOKEN;
  if (!token || c.req.header('authorization') !== `Bearer ${token}`) return c.json({ error: 'NOT_FOUND' }, 404);
  const stub = c.env.NONCE_STORE.get(c.env.NONCE_STORE.idFromName('global'));
  const [counters, byRoute, recent] = await Promise.all([
    stub.stats('stat:'),
    c.env.SALES.prepare('SELECT route, network, COUNT(*) AS calls, SUM(amount_units) / 1e6 AS usdc FROM sales GROUP BY route, network ORDER BY usdc DESC').all(),
    c.env.SALES.prepare('SELECT ts, route, network, amount_units / 1e6 AS usdc, payer, reference FROM sales ORDER BY id DESC LIMIT 20').all(),
  ]);
  return c.json({ sales: { byRoute: byRoute.results, recent: recent.results }, counters });
});

// Operator-only: run any tool handler live without paying, for smoke tests after a deploy.
app.get('/internal/tool/:id', async (c) => {
  const token = c.env.STATS_TOKEN;
  if (!token || c.req.header('authorization') !== `Bearer ${token}`) return c.json({ error: 'NOT_FOUND' }, 404);
  const handler = TOOL_HANDLERS[c.req.param('id')];
  if (!handler) return c.json({ error: 'NOT_FOUND' }, 404);
  try {
    return c.json(await handler(new URL(c.req.url).searchParams, { ...loadConfig(c.env as unknown as Record<string, unknown>), ai: c.env.AI, cache: c.env.CACHE, intel: { account: c.env.CF_ACCOUNT_ID ?? '', token: c.env.CF_INTEL_TOKEN ?? '' }, browserToken: c.env.CF_BROWSER_TOKEN }));
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : 'failed' }, 500);
  }
});

app.route('/', routes);

// Crawlers still remember the old SkinWinKing shop; send them to the agent-readable catalog instead of a 404.
const OLD_SHOP = /^\/(checkout|products?|catalog|cart|shop|category|categories|account|login|register|privacy|terms|faq|about|contact|blog)(\/|$)/i;
app.notFound((c) => {
  if (c.req.method === 'GET' && OLD_SHOP.test(c.req.path)) return c.redirect('/llms.txt', 301);
  return c.json({ error: 'NOT_FOUND', message: 'See /llms.txt for the list of tools' }, 404);
});

app.onError((err, c) => {
  console.error(err);
  return c.json({ error: 'INTERNAL_ERROR', message: 'Unexpected failure' }, 500);
});

/** Nightly copy of the D1 sales ledger to R2, so paid-call history survives any database mishap. */
async function backupSales(env: AppEnv['Bindings']) {
  const PAGE = 5000;
  const all: unknown[] = [];
  let lastId = 0;
  for (;;) {
    const page = await env.SALES.prepare('SELECT * FROM sales WHERE id > ? ORDER BY id LIMIT ?').bind(lastId, PAGE).all();
    all.push(...page.results);
    if (page.results.length < PAGE) break;
    lastId = (page.results.at(-1) as { id: number }).id;
  }
  const day = new Date().toISOString().slice(0, 10);
  await env.BACKUPS.put(`sales/${day}.json`, JSON.stringify({ exportedAt: new Date().toISOString(), rows: all }), { httpMetadata: { contentType: 'application/json' } });
}

export default {
  fetch: app.fetch,
  scheduled: (_event: ScheduledController, env: AppEnv['Bindings'], ctx: ExecutionContext) => ctx.waitUntil(backupSales(env)),
};
