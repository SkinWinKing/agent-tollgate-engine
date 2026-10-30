import { ALL_ROUTES, ENGINE_VERSION, unitsToUsdc, type RouteSpec } from '@tollgate/core';
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
  for (const r of ALL_ROUTES) {
    paths[r.path] = { [r.method.toLowerCase()]: operation(ctx, r) };
  }
  return {
    openapi: '3.1.0',
    info: {
      title: 'Agent Tollgate Engine',
      version: ENGINE_VERSION,
      description: `${ALL_ROUTES.length} pay-per-call tools for agents over x402 (USDC on Base, Polygon, Solana): crypto market data, token audits, indicators, swap routing, web extraction, DNS/WHOIS/email checks, FX, weather and AI text/image tools.`,
      contact: { name: 'Agent Tollgate', email: 'support@skinwinking.com', url: 'https://github.com/SkinWinKing/agent-tollgate-engine' },
      'x-guidance':
        'Paid routes answer HTTP 402 first. Prices run from 0.001 USDC (data tools under /api/v1/data: prices, candles, indicators, funding rates, gas, balances, tx status, DEX token data, stablecoin pegs, TVL) to 0.20 USDC (token audit); utility tools under /api/v1/util, web tools under /api/v1/web, AI tools under /api/v1/ai (Workers AI, 24/7); payable on Base, Polygon or Solana with any x402 client, then repeat the same request with the payment attached. GET /api/v1/alpha/orderbook-imbalance?pair=SOL-USDT returns bid/ask depth imbalance and a directional signal. POST /api/v1/security/token-audit with {chain, address} returns a 0-100 rug-pull risk score for Solana, Polygon, Base or Ethereum tokens. POST /api/v1/router/quote-and-build costs 0.001 USDC and returns an unsigned swap transaction (Jupiter on Solana, LI.FI cross-chain) that carries a 30 bps platform fee; sign and broadcast it yourself. MCP is available at /mcp.',
    },
    servers: [{ url: ctx.origin }],
    paths,
  };
}
