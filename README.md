# agent-tollgate-engine

Live at **https://skinwinking.com**. Machine-readable: [`/llms.txt`](https://skinwinking.com/llms.txt), [`/openapi.json`](https://skinwinking.com/openapi.json), MCP at `https://skinwinking.com/mcp`.

Pay-per-call trading intelligence and fee-bearing swap routing for autonomous agents, on Cloudflare Workers.

Revenue paths:
1. x402 micropayments in USDC (Polygon or Solana) for `orderbook-imbalance` (0.02 USDC) and `token-audit` (0.20 USDC).
2. 30 bps platform fee on swaps built by `quote-and-build` (Jupiter on Solana, LI.FI cross-chain/EVM).

All payments go straight to the merchant addresses in `wrangler.toml`. The server holds no keys and no funds.

## Layout

| Package | Role |
|---|---|
| `packages/core` | config, route catalog, on-chain payment verification (EVM, Solana, x402 facilitator), replay protection interface |
| `packages/api-worker` | Hono Worker, `x402PaymentGate` middleware, Durable Object nonce store, route handlers |
| `packages/omni-router` | Jupiter (Solana) and LI.FI (cross-chain) quote builders with fee embedding |
| `packages/discovery` | `/llms.txt`, `/openapi.json`, MCP server (HTTP at `/mcp`, stdio via `npm run mcp`) |
| `packages/simulation-agent` | end-to-end simulated agent |

## Local run

```bash
npm install
cp .env.example .dev.vars        # then set SOLANA_RPC_URL and EVM_RPC_URL to private endpoints
npm run dev                      # http://127.0.0.1:8787, simulation receipts enabled
```

`npm run dev` sets `SIM_SECRET`, which enables HMAC simulation receipts (`Bearer sim_...`). Never set `SIM_SECRET` in production.

If port 8787 is busy: `npx wrangler dev --port 8799 --var SIM_SECRET:dev-simulation-secret` and `BASE_URL=http://127.0.0.1:8799`.

## Simulation

With `npm run dev` running in another terminal:

```bash
npm run simulate
```

Steps: unpaid call returns 402, simulated payment succeeds, replay is rejected, a Solana swap quote proves the fee account is inside the built transaction, a Polygon to Base quote proves the LI.FI integrator fee.

## Production prerequisites

1. **RPC**: public endpoints are rate-limited or blocked. Use private ones.
   ```bash
   npx wrangler secret put SOLANA_RPC_URL
   npx wrangler secret put EVM_RPC_URL
   ```
2. **LI.FI integrator**: register `LIFI_INTEGRATOR` at https://portal.li.fi, set the fee wallet to the EVM payout address, and set the fee to 0.3%. Without it LI.FI rejects quotes that carry `fee`.
3. **Solana fee token accounts**: the Jupiter fee is paid in the output token to the merchant's associated token account for that mint. The route returns `FEE_ACCOUNT_MISSING` until that account exists. Receiving a small amount of the token (or creating the ATA in Phantom) creates it. USDC and wSOL cover the main pairs.
4. Optional `X402_FACILITATOR_URL` enables `X-402-Signature` settlement through an x402 facilitator.

## Deploy

```bash
npx wrangler deploy
```

Attach the domain under Workers & Routes in the Cloudflare dashboard (custom domain on the worker).

## Payment proofs

| Header | Meaning |
|---|---|
| `Authorization: Bearer 0x<64 hex>` | Polygon USDC transfer to the merchant, at least the route price, at least `EVM_MIN_CONFIRMATIONS` deep, younger than `PAYMENT_MAX_AGE_SEC` |
| `Authorization: Bearer <base58 signature>` | Solana USDC transfer, `confirmed` commitment |
| `X-402-Signature: <base64 payload>` | x402 payload verified and settled via the facilitator |

Each proof is accepted once (Durable Object, 7 day TTL).
