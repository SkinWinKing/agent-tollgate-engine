import { ROUTES, unitsToUsdc, type RouteSpec } from '@tollgate/core';
import type { DiscoveryContext } from './context';

function operation(ctx: DiscoveryContext, r: RouteSpec): Record<string, unknown> {
  const parameters =
    r.input.in === 'query'
      ? Object.entries(r.input.schema.properties ?? {}).map(([name, schema]) => ({
          name,
          in: 'query',
          required: r.input.schema.required?.includes(name) ?? false,
          schema,
        }))
      : undefined;
  const base: Record<string, unknown> = {
    operationId: r.id,
    summary: r.summary,
    description: r.description,
    ...(parameters ? { parameters } : {}),
    ...(r.input.in === 'body' ? { requestBody: { required: true, content: { 'application/json': { schema: r.input.schema } } } } : {}),
    responses: {
      '200': { description: 'Success', content: { 'application/json': { schema: r.output } } },
      ...(r.priceUnits === null
        ? {}
        : {
            '402': {
              description: 'Payment required (x402). Body lists accepted networks, asset, payTo, amount and nonce.',
              content: { 'application/json': { schema: { type: 'object' } } },
            },
          }),
    },
  };
  if (r.priceUnits !== null) {
    base['x-payment-info'] = {
      price: { mode: 'fixed', currency: 'USD', amount: unitsToUsdc(r.priceUnits) },
      protocols: [{ x402: {} }],
    };
  } else {
    base.security = [];
    base.description = `${r.description} No x402 payment: a ${ctx.feeBps} bps platform fee is embedded in the returned transaction.`;
  }
  return base;
}

export function openApiSpec(ctx: DiscoveryContext): Record<string, unknown> {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const r of Object.values(ROUTES)) {
    paths[r.path] = { [r.method.toLowerCase()]: operation(ctx, r) };
  }
  return {
    openapi: '3.1.0',
    info: {
      title: 'Agent Tollgate Engine',
      version: '1.0.0',
      description: 'Pay-per-call trading intelligence (x402, USDC) and fee-bearing swap routing for autonomous agents.',
      contact: { name: 'Agent Tollgate', email: 'support@skinwinking.com', url: 'https://github.com/SkinWinKing/agent-tollgate-engine' },
      'x-guidance':
        'Paid routes answer HTTP 402 first. Pay 0.02 USDC (order book) or 0.20 USDC (token audit) on Base, Polygon or Solana with any x402 client, then repeat the same request with the payment attached. GET /api/v1/alpha/orderbook-imbalance?pair=SOL-USDT returns bid/ask depth imbalance and a directional signal. POST /api/v1/security/token-audit with {chain, address} returns a 0-100 rug-pull risk score for Solana, Polygon, Base or Ethereum tokens. POST /api/v1/router/quote-and-build is free and returns an unsigned swap transaction (Jupiter on Solana, LI.FI cross-chain) that carries a 30 bps platform fee; sign and broadcast it yourself. MCP is available at /mcp.',
    },
    servers: [{ url: ctx.origin }],
    paths,
  };
}
