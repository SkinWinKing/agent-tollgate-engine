import { ERC20_TRANSFER_TOPIC } from './constants';
import { jsonRpc } from './rpc';
import type { CoreConfig, PaymentNetwork, VerifyResult } from './types';

export interface EvmChain {
  network: Extract<PaymentNetwork, 'polygon' | 'base'>;
  rpcUrl: string;
  usdc: string;
}

export const evmChains = (cfg: CoreConfig): EvmChain[] => [
  { network: 'polygon', rpcUrl: cfg.evmRpcUrl, usdc: cfg.usdcEvm },
  { network: 'base', rpcUrl: cfg.baseRpcUrl, usdc: cfg.usdcBase },
];

interface Receipt {
  status: string;
  blockNumber: string;
  from: string;
  logs: { address: string; topics: string[]; data: string }[];
}

const padAddress = (addr: string) => '0x' + addr.slice(2).toLowerCase().padStart(64, '0');

export async function verifyEvmPayment(cfg: CoreConfig, chain: EvmChain, hash: string, minUnits: number): Promise<VerifyResult> {
  const receipt = await jsonRpc<Receipt | null>(chain.rpcUrl, 'eth_getTransactionReceipt', [hash]);
  if (!receipt) return { ok: false, reason: 'TX_NOT_FOUND_OR_PENDING', retryable: true };
  if (receipt.status !== '0x1') return { ok: false, reason: 'TX_REVERTED', retryable: false };

  const recipientTopic = padAddress(cfg.merchantEvm);
  const usdc = chain.usdc.toLowerCase();
  let received = 0n;
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== usdc) continue;
    if (log.topics[0] !== ERC20_TRANSFER_TOPIC || log.topics[2]?.toLowerCase() !== recipientTopic) continue;
    received += BigInt(log.data);
  }
  if (received === 0n) return { ok: false, reason: 'NO_USDC_TRANSFER_TO_MERCHANT', retryable: false };
  if (received < BigInt(minUnits)) return { ok: false, reason: 'AMOUNT_TOO_LOW', retryable: false };

  const [head, block] = await Promise.all([
    jsonRpc<string>(chain.rpcUrl, 'eth_blockNumber', []),
    jsonRpc<{ timestamp: string }>(chain.rpcUrl, 'eth_getBlockByNumber', [receipt.blockNumber, false]),
  ]);
  const confirmations = Number(BigInt(head) - BigInt(receipt.blockNumber)) + 1;
  if (confirmations < cfg.minConfirmations) return { ok: false, reason: 'INSUFFICIENT_CONFIRMATIONS', retryable: true };
  const settledAt = Number(BigInt(block.timestamp));
  if (Date.now() / 1000 - settledAt > cfg.maxAgeSec) return { ok: false, reason: 'PAYMENT_TOO_OLD', retryable: false };

  return {
    ok: true,
    payment: { network: chain.network, reference: hash.toLowerCase(), payer: receipt.from, amountUnits: Number(received), settledAt },
  };
}
