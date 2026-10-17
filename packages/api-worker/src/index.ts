import { loadConfig } from '@tollgate/core';
import { handleRpc, llmsTxt, openApiSpec, type DiscoveryContext } from '@tollgate/discovery';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { AppEnv } from './env';
import { routes } from './routes';
import { internalMcpToken } from './x402';

export { NonceStore } from './nonce-store';

const app = new Hono<AppEnv>();

app.use('*', cors({ origin: '*', exposeHeaders: ['PAYMENT-REQUIRED', 'PAYMENT-RESPONSE', 'X-PAYMENT-RESPONSE', 'EXTENSION-RESPONSES', 'X-402-Nonce', 'WWW-Authenticate'], allowHeaders: ['Content-Type', 'Authorization', 'PAYMENT-SIGNATURE', 'X-PAYMENT', 'X-402-Signature'] }));

const context = (env: AppEnv['Bindings'], url: string): DiscoveryContext => {
  const cfg = loadConfig(env as unknown as Record<string, unknown>);
  return { origin: new URL(url).origin, merchantSol: cfg.merchantSol, merchantEvm: cfg.merchantEvm, feeBps: cfg.feeBps };
};

const FAVICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#0b1220"/><path d="M14 44V28l18-12 18 12v16" fill="none" stroke="#4ade80" stroke-width="5" stroke-linejoin="round"/><path d="M24 44V34h16v10" fill="none" stroke="#4ade80" stroke-width="5" stroke-linejoin="round"/></svg>`;
app.get('/favicon.ico', (c) => c.body(FAVICON, 200, { 'content-type': 'image/svg+xml', 'cache-control': 'public, max-age=86400' }));
app.get('/favicon.svg', (c) => c.body(FAVICON, 200, { 'content-type': 'image/svg+xml', 'cache-control': 'public, max-age=86400' }));
app.get('/health', (c) => c.json({ ok: true }));
app.get('/', (c) => c.redirect('/llms.txt'));
app.get('/llms.txt', (c) => c.text(llmsTxt(context(c.env, c.req.url))));
app.get('/openapi.json', (c) => c.json(openApiSpec(context(c.env, c.req.url))));

app.get('/mcp', (c) => c.body(null, 405, { Allow: 'POST' }));

app.post('/mcp', async (c) => {
  const msg = await c.req.json().catch(() => null);
  if (!msg || msg.jsonrpc !== '2.0') return c.json({ jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Invalid Request' } }, 400);
  const dispatch = async (path: string, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    headers.set('x-tollgate-mcp', internalMcpToken());
    headers.set('cf-connecting-ip', c.req.header('cf-connecting-ip') ?? 'unknown');
    return app.fetch(new Request(new URL(path, c.req.url), { ...init, headers }), c.env, c.executionCtx);
  };
  const response = await handleRpc(msg, dispatch);
  return response ? c.json(response) : c.body(null, 202);
});

app.route('/', routes);

app.onError((err, c) => {
  console.error(err);
  return c.json({ error: 'INTERNAL_ERROR', message: 'Unexpected failure' }, 500);
});

export default app;
