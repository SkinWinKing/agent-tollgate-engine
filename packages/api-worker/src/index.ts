import { loadConfig } from '@tollgate/core';
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

app.get('/health', (c) => c.json({ ok: true }));
app.get('/', (c) => c.redirect('/llms.txt'));
app.get('/llms.txt', (c) => c.text(llmsTxt(context(c.env, c.req.url))));
app.get('/openapi.json', (c) => c.json(openApiSpec(context(c.env, c.req.url))));

app.get('/mcp', (c) => c.body(null, 405, { Allow: 'POST' }));

app.post('/mcp', async (c) => {
  const msg = await c.req.json().catch(() => null);
  if (!msg || msg.jsonrpc !== '2.0') return c.json({ jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Invalid Request' } }, 400);
  const dispatch = async (path: string, init?: RequestInit) => app.fetch(new Request(new URL(path, c.req.url), init), c.env, c.executionCtx);
  const response = await handleRpc(msg, dispatch);
  return response ? c.json(response) : c.body(null, 202);
});

app.route('/', routes);

app.onError((err, c) => {
  console.error(err);
  return c.json({ error: 'INTERNAL_ERROR', message: 'Unexpected failure' }, 500);
});

export default app;
