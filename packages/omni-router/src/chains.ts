import { EVM_ADDRESS, SOLANA_ADDRESS, SOLANA_CAIP_CHAIN_ID } from '@tollgate/core';
import type { ChainName } from './types';

export type ChainKind = 'evm' | 'solana' | 'utxo' | 'tvm';

export const CHAINS: Record<ChainName, { kind: ChainKind; lifiId: number; caip2: string }> = {
  solana: { kind: 'solana', lifiId: SOLANA_CAIP_CHAIN_ID, caip2: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp' },
  ethereum: { kind: 'evm', lifiId: 1, caip2: 'eip155:1' },
  arbitrum: { kind: 'evm', lifiId: 42161, caip2: 'eip155:42161' },
  base: { kind: 'evm', lifiId: 8453, caip2: 'eip155:8453' },
  polygon: { kind: 'evm', lifiId: 137, caip2: 'eip155:137' },
  bitcoin: { kind: 'utxo', lifiId: 20000000000001, caip2: 'bip122:000000000019d6689c085ae165831e93' },
  tron: { kind: 'tvm', lifiId: 728126428, caip2: 'tron:728126428' },
};

export const SOLANA_MINTS: Record<string, string> = {
  SOL: 'So11111111111111111111111111111111111111112',
  WSOL: 'So11111111111111111111111111111111111111112',
  USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  USDT: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
};

export const EVM_NATIVE = '0x0000000000000000000000000000000000000000';

const BTC_ADDRESS = /^(bc1[a-z0-9]{25,90}|[13][1-9A-HJ-NP-Za-km-z]{25,34})$/;
const TRON_ADDRESS = /^T[1-9A-HJ-NP-Za-km-z]{33}$/;

export const isValidAddress = (kind: ChainKind, addr: string) => {
  switch (kind) {
    case 'evm': return EVM_ADDRESS.test(addr);
    case 'solana': return SOLANA_ADDRESS.test(addr);
    case 'utxo': return BTC_ADDRESS.test(addr);
    case 'tvm': return TRON_ADDRESS.test(addr);
  }
};
