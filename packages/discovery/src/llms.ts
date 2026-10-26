import { ALL_ROUTES, unitsToUsdc, type RouteSpec } from '@tollgate/core';
import type { DiscoveryContext } from './context';

const paid = (r: RouteSpec) => (r.priceUnits === null ? 'free (platform fee on swap output)' : `${unitsToUsdc(r.priceUnits)} USDC per call`);

const section = (ctx: DiscoveryContext, r: RouteSpec): string => {
  const props = Object.entries(r.input.schema.properties ?? {})
    .map(([k, v]) => `    - ${k}${r.input.schema.required?.includes(k) ? ' (required)' : ''}: ${(v as { description?: string }).description ?? (v as { type?: string }).type}`)
    .join('\n');
  return `### ${r.method} ${r.path}
Price: ${paid(r)}
${r.description}
Input (${r.input.in}):
${props}
Example: curl -X ${r.method} '${ctx.origin}${r.path}${r.method === 'GET' && Object.keys(r.example.input).length ? '?' + new URLSearchParams(Object.entries(r.example.input).map(([k, v]) => [k, String(v)])) : ''}'`;
};

export function llmsTxt(ctx: DiscoveryContext): string {
  const routes = ALL_ROUTES;
  return `# Agent Tollgate Engine

> Pay-per-call market intelligence and fee-bearing swap routing for autonomous trading agents. No accounts, no API keys: pay in USDC per request using HTTP 402.

## Payment protocol (x402)
1. Call a paid route without payment. The server answers HTTP 402 with a JSON body listing \`accepts\`: network, asset (USDC), payTo address, maxAmountRequired (base units, 6 decimals) and a nonce.
2. Send a USDC transfer of at least that amount to payTo on one of the accepted networks.
3. Repeat the original request with the proof in a header. Accepted proofs:
   - \`Authorization: Bearer <polygon_tx_hash>\` (0x + 64 hex)
   - \`Authorization: Bearer <solana_tx_signature>\` (base58)
   - \`X-402-Signature: <base64 x402 payment payload>\` (settled through the facilitator, when enabled)
4. Each transaction proves exactly one request. Reuse returns 402 PAYMENT_ALREADY_USED. Transfers older than 15 minutes are rejected.

Accepted networks and recipients:
- base: USDC 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913 -> ${ctx.merchantEvm}
- polygon: USDC 0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359 -> ${ctx.merchantEvm}
- solana: USDC EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v -> ${ctx.merchantSol}

## Endpoints
${routes.map((r) => section(ctx, r)).join('\n\n')}

## Swap routing fee
quote-and-build embeds a ${ctx.feeBps} bps (${(ctx.feeBps / 100).toFixed(2)}%) platform fee. Solana-to-Solana routes use Jupiter; all other routes use LI.FI. The response contains an unsigned transaction. The caller signs and broadcasts it. The server never holds keys or funds.

## Machine-readable resources
- OpenAPI 3.1: ${ctx.origin}/openapi.json
- MCP (JSON-RPC over HTTP): POST ${ctx.origin}/mcp
- MCP (stdio): npx tsx packages/discovery/src/mcp/stdio.ts (env BASE_URL)
`;
}
