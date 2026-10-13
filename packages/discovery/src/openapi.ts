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
      protocol: 'x402',
      priceUsdc: unitsToUsdc(r.priceUnits),
      amountBaseUnits: String(r.priceUnits),
      asset: 'USDC',
      networks: [
        { network: 'polygon', asset: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359', payTo: ctx.merchantEvm },
        { network: 'solana', asset: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', payTo: ctx.merchantSol },
      ],
      proofHeaders: ['Authorization: Bearer <tx_hash|signature>', 'X-402-Signature'],
    };
  } else {
    base['x-payment-info'] = { protocol: 'fee-on-output', platformFeeBps: ctx.feeBps };
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
    },
    servers: [{ url: ctx.origin }],
    paths,
  };
}
