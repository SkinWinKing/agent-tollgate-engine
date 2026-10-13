import { EVM_ADDRESS, SOLANA_ADDRESS, SOLANA_CAIP_CHAIN_ID } from '@tollgate/core';
import type { ChainName } from './types';

export const CHAINS: Record<ChainName, { kind: 'evm' | 'solana'; lifiId: number }> = {
  solana: { kind: 'solana', lifiId: SOLANA_CAIP_CHAIN_ID },
  ethereum: { kind: 'evm', lifiId: 1 },
  arbitrum: { kind: 'evm', lifiId: 42161 },
  base: { kind: 'evm', lifiId: 8453 },
  polygon: { kind: 'evm', lifiId: 137 },
};

export const SOLANA_MINTS: Record<string, string> = {
  SOL: 'So11111111111111111111111111111111111111112',
  WSOL: 'So11111111111111111111111111111111111111112',
  USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  USDT: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
};

export const EVM_NATIVE = '0x0000000000000000000000000000000000000000';

export const isValidAddress = (kind: 'evm' | 'solana', addr: string) =>
  kind === 'evm' ? EVM_ADDRESS.test(addr) : SOLANA_ADDRESS.test(addr);
