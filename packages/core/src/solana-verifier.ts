import { jsonRpc, RpcError } from './rpc';
import type { CoreConfig, VerifyResult } from './types';

interface TokenBalance {
  accountIndex: number;
  mint: string;
  owner?: string;
  uiTokenAmount: { amount: string };
}

interface SolanaTx {
  blockTime: number | null;
  meta: { err: unknown; preTokenBalances?: TokenBalance[]; postTokenBalances?: TokenBalance[] } | null;
  transaction: { message: { accountKeys: { pubkey: string; signer: boolean }[] } };
}

export async function verifySolanaPayment(cfg: CoreConfig, signature: string, minUnits: number): Promise<VerifyResult> {
  let tx: SolanaTx | null;
  try {
    tx = await jsonRpc<SolanaTx | null>(cfg.solanaRpcUrl, 'getTransaction', [
      signature,
      { encoding: 'jsonParsed', commitment: 'confirmed', maxSupportedTransactionVersion: 0 },
    ]);
  } catch (err) {
    if (err instanceof RpcError) return { ok: false, reason: 'RPC_ERROR', retryable: true };
    throw err;
  }
  if (!tx || !tx.meta) return { ok: false, reason: 'TX_NOT_FOUND_OR_PENDING', retryable: true };
  if (tx.meta.err) return { ok: false, reason: 'TX_FAILED', retryable: false };

  const sum = (balances: TokenBalance[] | undefined) =>
    (balances ?? [])
      .filter((b) => b.owner === cfg.merchantSol && b.mint === cfg.usdcSol)
      .reduce((acc, b) => acc + BigInt(b.uiTokenAmount.amount), 0n);
  const received = sum(tx.meta.postTokenBalances) - sum(tx.meta.preTokenBalances);
  if (received <= 0n) return { ok: false, reason: 'NO_USDC_TRANSFER_TO_MERCHANT', retryable: false };
  if (received < BigInt(minUnits)) return { ok: false, reason: 'AMOUNT_TOO_LOW', retryable: false };

  const settledAt = tx.blockTime ?? 0;
  if (!settledAt || Date.now() / 1000 - settledAt > cfg.maxAgeSec) {
    return { ok: false, reason: 'PAYMENT_TOO_OLD', retryable: false };
  }
  if (received > BigInt(Number.MAX_SAFE_INTEGER)) return { ok: false, reason: 'AMOUNT_OVERFLOW', retryable: false };
  const payer = tx.transaction.message.accountKeys.find((k) => k.signer)?.pubkey ?? null;
  return { ok: true, payment: { network: 'solana', reference: signature, payer, amountUnits: Number(received), settledAt } };
}
