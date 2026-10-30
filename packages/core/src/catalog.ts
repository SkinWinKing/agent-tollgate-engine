import { usdcToUnits } from './constants';
import type { RouteSpec } from './types';

export const ROUTES: Record<'orderbook' | 'tokenAudit' | 'quote' | 'earnVaults' | 'earnDeposit' | 'trendingTokens' | 'gasPrice', RouteSpec> = {
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
    priceUnits: usdcToUnits(0.001),
    summary: 'Safe swap: best-route quote plus rug-pull check of the token you buy, as an unsigned transaction',
    description:
      'Costs 0.001 USDC per call via x402. Returns the best route and an unsigned transaction, and for Solana swaps a rug-pull risk check of the output token (mint/freeze authority, token-2022 traps, holder concentration) so agents do not buy honeypots. Same-chain Solana swaps route through Jupiter with a referral fee account. Cross-chain routes try LI.FI Intents (solver-based, competitive pricing) first, then fall back to classic LI.FI routing. Supports Solana, Ethereum, Base, Arbitrum, Polygon, Bitcoin and Tron. The response contains a serialized unsigned transaction to be signed and broadcast by the caller. A 30 bps platform fee is embedded in the route.',
    input: {
      in: 'body',
      schema: {
        type: 'object',
        properties: {
          fromChain: { type: 'string', enum: ['solana', 'ethereum', 'arbitrum', 'base', 'polygon', 'bitcoin', 'tron'] },
          toChain: { type: 'string', enum: ['solana', 'ethereum', 'arbitrum', 'base', 'polygon', 'bitcoin', 'tron'] },
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
        route: { type: 'string', enum: ['jupiter', 'lifi', 'lifi-intents'] },
        unsignedTransaction: { type: 'object' },
        fee: { type: 'object' },
        quote: { type: 'object' },
      },
    },
  },
  earnVaults: {
    id: 'earn_vaults',
    method: 'GET',
    path: '/api/v1/earn/vaults',
    priceUnits: usdcToUnits(0.001),
    summary: 'Discover DeFi yield vaults sorted by APY or TVL',
    description:
      'Lists transactional DeFi vaults across EVM chains via LI.FI Earn. Filter by chainId, asset symbol, protocol name, or minimum TVL. Returns APY, TVL, underlying tokens and vault token address needed for the earn-deposit tool. Cursor-paginated.',
    input: {
      in: 'query',
      schema: {
        type: 'object',
        properties: {
          chainId: { type: 'integer', description: 'EVM chain ID (e.g. 8453 for Base, 137 for Polygon)' },
          asset: { type: 'string', description: 'Underlying token symbol or address (e.g. USDC, WETH)' },
          protocol: { type: 'string', description: 'Protocol name (e.g. morpho-v1, aave-v3)' },
          sortBy: { type: 'string', enum: ['apy', 'tvl'], default: 'apy' },
          limit: { type: 'integer', minimum: 1, maximum: 50, default: 10 },
          cursor: { type: 'string', description: 'Pagination cursor from previous response' },
        },
        required: [],
      },
    },
    example: {
      input: { chainId: 8453, asset: 'USDC', sortBy: 'apy', limit: 3 },
      output: {
        vaults: [
          { address: '0x...', chainId: 8453, name: 'Morpho USDC Vault', protocol: 'morpho-v1', apy: 8.42, tvlUsd: 12500000, lpToken: { address: '0x...', symbol: 'mUSDC' } },
        ],
        total: 47,
        nextCursor: null,
      },
    },
    output: {
      type: 'object',
      properties: {
        vaults: { type: 'array' },
        total: { type: 'integer' },
        nextCursor: { type: 'string' },
      },
    },
  },
  earnDeposit: {
    id: 'earn_deposit',
    method: 'POST',
    path: '/api/v1/earn/deposit',
    priceUnits: usdcToUnits(0.001),
    summary: 'Quote and build an unsigned vault deposit transaction via LI.FI Composer',
    description:
      'Takes a vault token address (from earn-vaults lpToken.address), source token, amount and wallet, returns an unsigned EVM transaction that swaps + bridges + deposits in one step. Cross-chain supported: deposit from any chain into any vault. Uses LI.FI Composer under the hood. A 30 bps integrator fee is embedded.',
    input: {
      in: 'body',
      schema: {
        type: 'object',
        properties: {
          fromChain: { type: 'string', description: 'Source chain ID (e.g. 8453, 137, 1)' },
          toChain: { type: 'string', description: 'Vault chain ID' },
          fromToken: { type: 'string', description: 'Source token address (0x0…0 for native)' },
          vaultToken: { type: 'string', description: 'Vault LP token address from earn-vaults' },
          fromAmount: { type: 'string', description: 'Amount in smallest units (wei, 1e-6 USDC)' },
          fromAddress: { type: 'string', description: 'Wallet that signs and receives vault tokens' },
          slippage: { type: 'string', description: 'Slippage tolerance (default 0.005 = 0.5%)', default: '0.005' },
        },
        required: ['fromChain', 'toChain', 'fromToken', 'vaultToken', 'fromAmount', 'fromAddress'],
      },
    },
    example: {
      input: { fromChain: '8453', toChain: '8453', fromToken: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', vaultToken: '0x...mUSDC', fromAmount: '1000000', fromAddress: '0x64f0117D37DDf366405747D7f9520851907fd077' },
      output: { tool: 'composer', route: 'lifi-composer', unsignedTransaction: { to: '0x...', data: '0x...' }, fee: { bps: 30 } },
    },
    output: {
      type: 'object',
      properties: {
        route: { type: 'string' },
        unsignedTransaction: { type: 'object' },
        estimate: { type: 'object' },
        fee: { type: 'object' },
      },
    },
  },
  trendingTokens: {
    id: 'sniper_trending',
    method: 'GET',
    path: '/api/v1/sniper/trending',
    priceUnits: usdcToUnits(0.05),
    summary: 'Trending tokens with sniper-grade safety metrics via GMGN',
    description:
      'Real-time trending tokens across Solana, Base, BSC and Ethereum ranked by swaps, volume or market cap. Includes sniper-critical data: honeypot flag, bundler rate, rug ratio, smart-degen count, dev-team hold rate, top-10 holder concentration, entrapment ratio and sniper count. Agents use this to discover newly launched tokens and assess risk before sniping. Powered by GMGN.',
    input: {
      in: 'query',
      schema: {
        type: 'object',
        properties: {
          chain: { type: 'string', enum: ['sol', 'base', 'bsc', 'eth'], default: 'sol', description: 'Blockchain' },
          interval: { type: 'string', enum: ['1m', '5m', '1h', '6h', '24h'], default: '1h', description: 'Trending window' },
          limit: { type: 'integer', minimum: 1, maximum: 50, default: 20 },
          orderBy: { type: 'string', enum: ['default', 'swaps', 'volume', 'marketcap', 'holder_count', 'change1h'], default: 'default' },
          filters: { type: 'string', description: 'Comma-separated: not_honeypot, verified, renounced, has_social, not_wash_trading', default: 'not_honeypot' },
        },
        required: [],
      },
    },
    example: {
      input: { chain: 'sol', interval: '5m', limit: 5, filters: 'not_honeypot,renounced' },
      output: {
        chain: 'sol',
        interval: '5m',
        count: 5,
        tokens: [{ symbol: 'DOCK', price: 0.000107, priceChange1h: 32.35, volume: 1874690, marketCap: 105752, sniperCount: 0, smartDegenCount: 140, bundlerRate: 0.27, rugRatio: 0.24, isHoneypot: false }],
      },
    },
    output: {
      type: 'object',
      properties: {
        chain: { type: 'string' },
        interval: { type: 'string' },
        count: { type: 'integer' },
        tokens: { type: 'array' },
      },
    },
  },
  gasPrice: {
    id: 'sniper_gas',
    method: 'GET',
    path: '/api/v1/sniper/gas-price',
    priceUnits: usdcToUnits(0.05),
    summary: 'Real-time gas/priority fee tiers with MEV protection cost',
    description:
      'Current gas price tiers (high/average/low) with estimated confirmation times, MEV-protection fee and native token USD price. Agents use this to set optimal priority fees for snipe transactions. Covers Solana, Base, BSC and Ethereum.',
    input: {
      in: 'query',
      schema: {
        type: 'object',
        properties: {
          chain: { type: 'string', enum: ['sol', 'base', 'bsc', 'eth'], default: 'sol', description: 'Blockchain' },
        },
        required: [],
      },
    },
    example: {
      input: { chain: 'sol' },
      output: {
        chain: 'sol',
        nativeTokenUsd: 101.77,
        recommended: { fee: '0.0002365', mev: '0.001' },
        tiers: { high: { fee: '0.01', estimateTimeSec: 2 }, average: { fee: '0.005', estimateTimeSec: 4 }, low: { fee: '0.001', estimateTimeSec: 8 } },
      },
    },
    output: {
      type: 'object',
      properties: {
        chain: { type: 'string' },
        nativeTokenUsd: { type: 'number' },
        recommended: { type: 'object' },
        tiers: { type: 'object' },
      },
    },
  },
};
