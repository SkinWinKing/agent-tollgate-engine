import { ALL_ROUTES, loadConfig, unitsToUsdc } from '@tollgate/core';
import { handleRpc, llmsTxt, openApiSpec, type DiscoveryContext } from '@tollgate/discovery';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { AppEnv } from './env';
import { routes } from './routes';

export { NonceStore } from './nonce-store';

const app = new Hono<AppEnv>();

app.use('*', cors({ origin: '*', exposeHeaders: ['PAYMENT-REQUIRED', 'PAYMENT-RESPONSE', 'X-PAYMENT-RESPONSE', 'EXTENSION-RESPONSES', 'X-402-Nonce', 'WWW-Authenticate'], allowHeaders: ['Content-Type', 'Authorization', 'PAYMENT-SIGNATURE', 'X-PAYMENT', 'X-402-Signature'] }));

const context = (env: AppEnv['Bindings'], url: string): DiscoveryContext => {
  const cfg = loadConfig(env as unknown as Record<string, unknown>);
  return { origin: new URL(url).origin, merchantSol: cfg.merchantSol, merchantEvm: cfg.merchantEvm, feeBps: cfg.feeBps };
};

const FAVICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#0b1220"/><path d="M14 44V28l18-12 18 12v16" fill="none" stroke="#4ade80" stroke-width="5" stroke-linejoin="round"/><path d="M24 44V34h16v10" fill="none" stroke="#4ade80" stroke-width="5" stroke-linejoin="round"/></svg>`;
// One Analytics Engine point per tool call: which tools agents ask for, how often they pay, from where.
const ROUTE_BY_PATH = new Map(ALL_ROUTES.map((r) => [r.path, r.id]));
app.use('/api/v1/*', async (c, next) => {
  const started = Date.now();
  await next();
  const status = c.res.status;
  const outcome = status === 402 ? 'payment_required' : status < 300 ? 'paid' : status === 429 ? 'rate_limited' : status < 500 ? 'client_error' : 'server_error';
  const ua = (c.req.header('user-agent') ?? 'none').split(/[\s/;(]/)[0]!.slice(0, 40);
  const source = c.req.header('x-tollgate-source') ?? 'http';
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

app.get('/favicon.ico', (c) => c.body(FAVICON, 200, { 'content-type': 'image/svg+xml', 'cache-control': 'public, max-age=86400' }));
app.get('/favicon.svg', (c) => c.body(FAVICON, 200, { 'content-type': 'image/svg+xml', 'cache-control': 'public, max-age=86400' }));
app.get('/health', (c) => c.json({ ok: true }));
app.get('/', (c) => c.redirect('/llms.txt'));
app.get('/llms.txt', (c) => c.text(llmsTxt(context(c.env, c.req.url))));
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
    description: 'Pay-per-call crypto market data, token security audits, technical indicators and fee-bearing swap routing for autonomous agents. Pay per request in USDC over x402; no account or API key.',
    url: `${origin}/mcp`,
    preferredTransport: 'JSONRPC',
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
app.get('/.well-known/agent.json', (c) => c.redirect('/.well-known/agent-card.json', 301));

app.get('/mcp', (c) => c.body(null, 405, { Allow: 'POST' }));

app.post('/mcp', async (c) => {
  const msg = await c.req.json().catch(() => null);
  if (!msg || msg.jsonrpc !== '2.0') return c.json({ jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Invalid Request' } }, 400);
  const dispatch = async (path: string, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    headers.set('cf-connecting-ip', c.req.header('cf-connecting-ip') ?? 'unknown');
    headers.set('x-tollgate-source', 'mcp');
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

app.route('/', routes);

app.onError((err, c) => {
  console.error(err);
  return c.json({ error: 'INTERNAL_ERROR', message: 'Unexpected failure' }, 500);
});

export default app;
