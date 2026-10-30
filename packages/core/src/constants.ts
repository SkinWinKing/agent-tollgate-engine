export const ENGINE_VERSION = '1.4.1';
export const USDC_DECIMALS = 6;
export const USDC_POLYGON = '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359';
export const USDC_SOLANA = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
export const POLYGON_CHAIN_ID = 137;
export const ERC20_TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
export const DEFAULT_SOLANA_RPC = 'https://api.mainnet-beta.solana.com';
// Comma-separated; the EVM verifier falls through on any error. publicnode alone rejects archive lookups.
export const DEFAULT_EVM_RPC = 'https://polygon.drpc.org,https://polygon-bor-rpc.publicnode.com,https://1rpc.io/matic';
export const SOLANA_CAIP_CHAIN_ID = 1151111101161;

export const EVM_TX_HASH = /^0x[0-9a-fA-F]{64}$/;
export const EVM_ADDRESS = /^0x[0-9a-fA-F]{40}$/;
export const SOLANA_ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
export const SOLANA_SIGNATURE = /^[1-9A-HJ-NP-Za-km-z]{64,96}$/;

export function usdcToUnits(usdc: number): number {
  return Math.round(usdc * 10 ** USDC_DECIMALS);
}

export function unitsToUsdc(units: number): string {
  return (units / 10 ** USDC_DECIMALS).toFixed(USDC_DECIMALS).replace(/0+$/, '').replace(/\.$/, '.0');
}

export const CAIP_POLYGON = 'eip155:137';
export const CAIP_SOLANA = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp';

export const BASE_CHAIN_ID = 8453;
export const USDC_BASE = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
export const CAIP_BASE = 'eip155:8453';
// Public Base RPCs that reliably serve eth_getTransactionReceipt (verified 2026-10-27). base.llamarpc.com
// returns empty bodies and base-rpc.publicnode.com rejects archive lookups, so both are dropped; the verifier
// falls through this list on any error. Override with BASE_RPC_URL (e.g. a free Alchemy/Ankr key) for best uptime.
export const DEFAULT_BASE_RPC = 'https://base.meowrpc.com,https://base.drpc.org,https://mainnet.base.org,https://base.gateway.tenderly.co,https://1rpc.io/base';
