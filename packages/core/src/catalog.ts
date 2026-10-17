import { usdcToUnits } from './constants';
import type { RouteSpec } from './types';

export const ROUTES: Record<'orderbook' | 'tokenAudit' | 'quote', RouteSpec> = {
  orderbook: {
    id: 'orderbook_imbalance',
    method: 'GET',
    path: '/api/v1/alpha/orderbook-imbalance',
    priceUnits: usdcToUnits(0.02),
    summary: 'Order book liquidity imbalance and skew for a trading pair',
    description:
      'Aggregates spot order book depth and returns bid/ask notional within 10/25/50/100 bps of mid, signed imbalance in [-1,1], largest liquidity walls and a directional signal.',
    input: {
      in: 'query',
      schema: {
        type: 'object',
        properties: {
          pair: { type: 'string', description: 'Trading pair such as SOL-USDT, BTC-USDT, ETH-USDT' },
        },
        required: ['pair'],
      },
    },
    example: {
      input: { pair: 'SOL-USDT' },
      output: {
        pair: 'SOLUSDT',
        venue: 'binance',
        mid: 108.275,
        spreadBps: 0.924,
        bands: [
          { bps: 25, bidNotional: 184210.55, askNotional: 161032.1, imbalance: 0.0669 },
          { bps: 100, bidNotional: 1204410.9, askNotional: 902114.4, imbalance: 0.1426 },
        ],
        skew: 0.1,
        signal: 'neutral',
        walls: {
          bid: { price: 107.5, notional: 98211.0, distanceBps: 71.6 },
          ask: { price: 109.0, notional: 70220.5, distanceBps: 66.9 },
        },
        asOf: '2026-10-13T12:00:00.000Z',
      },
    },
    output: {
      type: 'object',
      properties: {
        pair: { type: 'string' },
        venue: { type: 'string' },
        mid: { type: 'number' },
        spreadBps: { type: 'number' },
        bands: { type: 'array' },
        skew: { type: 'number' },
        signal: { type: 'string', enum: ['bullish_accumulation', 'bearish_distribution', 'neutral'] },
      },
    },
  },
  tokenAudit: {
    id: 'token_audit',
    method: 'POST',
    path: '/api/v1/security/token-audit',
    priceUnits: usdcToUnits(0.2),
    summary: 'Solana/EVM token contract security audit with rug-pull risk score',
    description:
      'Inspects mint and freeze authority, token-2022 extensions, proxy and ownership state, privileged functions and top holder concentration. Returns a 0-100 risk score with itemised flags.',
    input: {
      in: 'body',
      schema: {
        type: 'object',
        properties: {
          chain: { type: 'string', enum: ['solana', 'polygon', 'base', 'ethereum'] },
          address: { type: 'string', description: 'Token mint (Solana) or contract address (EVM)' },
        },
        required: ['chain', 'address'],
      },
    },
    example: {
      input: { chain: 'solana', address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' },
      output: {
        chain: 'solana',
        address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        decimals: 6,
        mintAuthority: '2wmVCSfPxGPjrnMMn7rchp4uaeoTqN39mXFC2zhPdri9',
        freezeAuthority: '7dGbd2QZcCKcTndnHcTL8q7SMVXAkp688NTQYwrRCrar',
        flags: [{ code: 'MINT_AUTHORITY_ACTIVE', severity: 'critical', message: 'Mint authority can inflate supply', points: 30 }],
        riskScore: 55,
        riskLevel: 'high',
        asOf: '2026-10-13T12:00:00.000Z',
      },
    },
    output: {
      type: 'object',
      properties: {
        riskScore: { type: 'integer' },
        riskLevel: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
        flags: { type: 'array' },
        holders: { type: 'object' },
      },
    },
  },
  quote: {
    id: 'router_quote_and_build',
    method: 'POST',
    path: '/api/v1/router/quote-and-build',
    priceUnits: null,
    summary: 'Safe swap: best-route quote plus free rug-pull check of the token you buy, as an unsigned transaction',
    description:
      'Free to call. Returns the best route and an unsigned transaction, and for Solana swaps a rug-pull risk check of the output token (mint/freeze authority, token-2022 traps, holder concentration) so agents do not buy honeypots. Same-chain Solana swaps route through Jupiter with a referral fee account. Cross-chain and EVM swaps route through LI.FI with an integrator fee. The response contains a serialized unsigned transaction to be signed and broadcast by the caller. A 30 bps platform fee is embedded in the route.',
    input: {
      in: 'body',
      schema: {
        type: 'object',
        properties: {
          fromChain: { type: 'string', enum: ['solana', 'ethereum', 'arbitrum', 'base', 'polygon'] },
          toChain: { type: 'string', enum: ['solana', 'ethereum', 'arbitrum', 'base', 'polygon'] },
          inputToken: { type: 'string', description: 'Token address/mint, or symbol (SOL, USDC, USDT, ETH)' },
          outputToken: { type: 'string', description: 'Token address/mint, or symbol' },
          amount: { type: 'string', description: 'Input amount in base units (lamports, wei, 1e-6 USDC)' },
          userAddress: { type: 'string', description: 'Wallet that signs the transaction on fromChain' },
          destinationAddress: { type: 'string', description: 'Receiver on toChain; defaults to userAddress' },
          slippageBps: { type: 'integer', minimum: 1, maximum: 1000, default: 50 },
          priority: { type: 'string', enum: ['none', 'fast', 'turbo'], default: 'fast' },
        },
        required: ['fromChain', 'toChain', 'inputToken', 'outputToken', 'amount', 'userAddress'],
      },
    },
    example: {
      input: { fromChain: 'solana', toChain: 'solana', inputToken: 'SOL', outputToken: 'USDC', amount: '1000000000', userAddress: 'DSvMhichkVACpR89fmuN2m1UZry8AgNb1QXFZetmDmT1' },
      output: { route: 'jupiter', fee: { bps: 30 }, quote: { inAmount: '1000000000', outAmount: '107738625' } },
    },
    output: {
      type: 'object',
      properties: {
        route: { type: 'string', enum: ['jupiter', 'lifi'] },
        unsignedTransaction: { type: 'object' },
        fee: { type: 'object' },
        quote: { type: 'object' },
      },
    },
  },
};
