import { LEGAL_PATHS } from './legal';
import { ALL_ROUTES, unitsToUsdc, type RouteSpec } from '@tollgate/core';
import { Hono } from 'hono';
import type { AppEnv } from './env';

/**
 * Agent-readiness documents (Cloudflare Agent Readiness / isitagentready.com checks):
 * sitemap, RFC 9727 API catalog, auth.md, Agent Skills index, MCP server card and a small A2A endpoint.
 */
export const discovery = new Hono<AppEnv>();

const origin = (url: string) => new URL(url).origin;
const price = (r: RouteSpec) => (r.priceUnits === null ? 'free' : `${unitsToUsdc(r.priceUnits)} USDC`);

// Advertise the machine-readable entry points on every response (RFC 8288 Link headers).
discovery.use('*', async (c, next) => {
  await next();
  c.res.headers.append(
    'Link',
    '</.well-known/api-catalog>; rel="api-catalog", </openapi.json>; rel="service-desc"; type="application/openapi+json", </llms.txt>; rel="describedby"; type="text/markdown", </.well-known/mcp/server-card.json>; rel="mcp-server-card"',
  );
});

discovery.get('/sitemap.xml', (c) => {
  const o = origin(c.req.url);
  const paths = ['/', ...LEGAL_PATHS, '/llms.txt', '/openapi.json', '/auth.md', '/.well-known/api-catalog', '/.well-known/agent-card.json', '/.well-known/mcp/server-card.json', '/.well-known/agent-skills/index.json', '/skills/agent-tollgate/SKILL.md'];
  const today = new Date().toISOString().slice(0, 10);
  const urls = paths.map((p) => `  <url><loc>${o}${p}</loc><lastmod>${today}</lastmod></url>`).join('\n');
  return c.body(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`, 200, { 'content-type': 'application/xml; charset=utf-8' });
});

discovery.get('/.well-known/api-catalog', (c) => {
  const o = origin(c.req.url);
  return c.body(
    JSON.stringify({
      linkset: [
        {
          anchor: `${o}/api/v1`,
          'service-desc': [{ href: `${o}/openapi.json`, type: 'application/openapi+json' }],
          'service-doc': [{ href: `${o}/llms.txt`, type: 'text/markdown' }],
          status: [{ href: `${o}/health`, type: 'application/json' }],
        },
      ],
    }),
    200,
    { 'content-type': 'application/linkset+json' },
  );
});

discovery.get('/auth.md', (c) => {
  const o = origin(c.req.url);
  return c.body(
    `# Agent Tollgate auth.md

## Audience
Autonomous AI agents and their operators calling the pay-per-call tools at ${o}.

## Registration
None. There are no accounts, API keys or OAuth clients to provision. The paying wallet is the identity.

## Supported methods
- **x402 (HTTP 402 Payment Required)**: call any route under ${o}/api/v1 without payment, read the 402 response (\`PAYMENT-REQUIRED\` header and JSON body: network, asset, amount, payTo), pay in USDC on Base, Polygon or Solana, and repeat the request with the payment in \`PAYMENT-SIGNATURE\` (x402 v2), \`X-PAYMENT\` (v1) or \`Authorization: Bearer <tx hash or signature>\`.
- **MCP**: POST ${o}/mcp (Streamable HTTP, JSON-RPC). Paid tools accept a \`paymentProof\` argument.

## Credential use
Each payment authorises exactly one request and is rejected if reused or older than 15 minutes. Nothing is stored between calls.

## Discovery
- Tools and prices: ${o}/llms.txt, ${o}/openapi.json, ${o}/.well-known/x402
- Agent card: ${o}/.well-known/agent-card.json
- Contact: support@skinwinking.com
`,
    200,
    { 'content-type': 'text/markdown; charset=utf-8' },
  );
});

const skillMd = (o: string) => `---
name: agent-tollgate
description: Pay-per-call crypto market data, token rug-pull audits, swap routing, web, DNS and threat-intel lookups and AI text tools over x402. Use when an agent needs live crypto or web data and can pay a few cents in USDC.
---

# Agent Tollgate

${ALL_ROUTES.length} tools at ${o}, each paid per request in USDC (Base, Polygon or Solana) with x402. No account or API key.

## How to call
1. Request the route. The server answers HTTP 402 with payment requirements.
2. Pay with any x402 client and repeat the request with the payment header.
3. Or connect over MCP at ${o}/mcp.

## Tools
${ALL_ROUTES.map((r) => `- \`${r.method} ${r.path}\` (${price(r)}): ${r.summary}`).join('\n')}

Full schemas: ${o}/openapi.json
`;

async function sha256Hex(text: string) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

discovery.get('/skills/agent-tollgate/SKILL.md', (c) => c.body(skillMd(origin(c.req.url)), 200, { 'content-type': 'text/markdown; charset=utf-8' }));

discovery.get('/.well-known/agent-skills/index.json', async (c) => {
  const o = origin(c.req.url);
  return c.json({
    $schema: 'https://schemas.agentskills.io/discovery/0.2.0/schema.json',
    skills: [
      {
        name: 'agent-tollgate',
        type: 'skill-md',
        description: 'Pay-per-call crypto data, token audits, swap routing, web and threat-intel lookups and AI text tools for agents over x402.',
        url: `${o}/skills/agent-tollgate/SKILL.md`,
        digest: `sha256:${await sha256Hex(skillMd(o))}`,
      },
    ],
  });
});
discovery.get('/.well-known/skills/index.json', (c) => c.redirect('/.well-known/agent-skills/index.json', 301));

discovery.get('/.well-known/mcp/server-card.json', (c) => {
  const o = origin(c.req.url);
  return c.json({
    $schema: 'https://static.modelcontextprotocol.io/schemas/mcp-server-card/v1.json',
    version: '1.0',
    protocolVersion: '2025-06-18',
    serverInfo: { name: 'com.skinwinking/agent-tollgate', title: 'Agent Tollgate', version: '1.4.0' },
    description: `${ALL_ROUTES.length} x402 pay-per-call tools: crypto data, token audits, swaps, web/DNS checks, threat intel, AI text and images.`,
    documentationUrl: `${o}/llms.txt`,
    transport: { type: 'streamable-http', endpoint: `${o}/mcp` },
    endpoint: `${o}/mcp`,
    capabilities: { tools: { listChanged: false } },
    authentication: { required: false, schemes: ['x402'] },
    tools: ALL_ROUTES.map((r) => ({ name: r.id, title: r.summary, description: `${r.description} Price: ${price(r)}.` })),
  });
});
discovery.get('/.well-known/mcp.json', (c) => c.redirect('/.well-known/mcp/server-card.json', 301));

/** Keyword match of a free-text task against the tool catalog. */
export function recommendTools(task: string, limit = 5) {
  const words = task.toLowerCase().match(/[a-z0-9]{3,}/g) ?? [];
  return ALL_ROUTES.map((r) => {
    const hay = `${r.id} ${r.summary} ${r.description}`.toLowerCase();
    return { r, score: words.reduce((s, w) => s + (hay.includes(w) ? (r.id.includes(w) ? 3 : 1) : 0), 0) };
  })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ r }) => r);
}

// Minimal A2A JSON-RPC agent: takes a task in plain language and answers with the tools that fit and how to pay.
discovery.post('/a2a', async (c) => {
  const msg = await c.req.json<{ jsonrpc?: string; id?: unknown; method?: string; params?: { message?: { parts?: { kind?: string; text?: string }[]; messageId?: string; contextId?: string } } }>().catch(() => null);
  if (!msg || msg.jsonrpc !== '2.0') return c.json({ jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Invalid Request' } }, 400);
  if (!['message/send', 'SendMessage'].includes(msg.method ?? '')) {
    return c.json({ jsonrpc: '2.0', id: msg.id ?? null, error: { code: -32601, message: 'Method not found. Supported: message/send' } });
  }
  const task = (msg.params?.message?.parts ?? []).map((p) => p.text ?? '').join(' ').slice(0, 2000);
  const o = origin(c.req.url);
  const hits = recommendTools(task);
  const text = hits.length
    ? `Tools that fit "${task.slice(0, 120)}":\n${hits.map((r) => `- ${r.method} ${o}${r.path} (${price(r)}): ${r.summary}`).join('\n')}\nCall the route, read the HTTP 402 payment requirements, pay in USDC with x402 and retry. Schemas: ${o}/openapi.json`
    : `No matching tool. The catalog is at ${o}/llms.txt.`;
  return c.json({
    jsonrpc: '2.0',
    id: msg.id ?? null,
    result: {
      kind: 'message',
      role: 'agent',
      messageId: crypto.randomUUID(),
      ...(msg.params?.message?.contextId ? { contextId: msg.params.message.contextId } : {}),
      parts: [{ kind: 'text', text }, { kind: 'data', data: { tools: hits.map((r) => ({ id: r.id, method: r.method, url: `${o}${r.path}`, price: price(r) })) } }],
    },
  });
});
