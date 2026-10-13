import { jsonRpc } from '@tollgate/core';
import type { Priority } from './types';

const MULTIPLIER: Record<Exclude<Priority, 'none'>, bigint> = { fast: 15n, turbo: 30n };

export async function evmFeeOverrides(rpcUrl: string, priority: Exclude<Priority, 'none'>): Promise<Record<string, string> | null> {
  try {
    const [tip, block] = await Promise.all([
      jsonRpc<string>(rpcUrl, 'eth_maxPriorityFeePerGas', [], 5000),
      jsonRpc<{ baseFeePerGas?: string }>(rpcUrl, 'eth_getBlockByNumber', ['latest', false], 5000),
    ]);
    if (!block.baseFeePerGas) return null;
    const priorityFee = (BigInt(tip) * MULTIPLIER[priority]) / 10n;
    const maxFee = BigInt(block.baseFeePerGas) * 2n + priorityFee;
    return { maxPriorityFeePerGas: '0x' + priorityFee.toString(16), maxFeePerGas: '0x' + maxFee.toString(16) };
  } catch {
    return null;
  }
}
