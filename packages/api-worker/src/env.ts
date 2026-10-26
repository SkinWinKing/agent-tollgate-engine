import type { VerifiedPayment } from '@tollgate/core';
import type { NonceStore } from './nonce-store';

export interface WorkerEnv {
  NONCE_STORE: DurableObjectNamespace<NonceStore>;
  AI: Ai;
  MERCHANT_PAYOUT_ADDRESS_SOL: string;
  MERCHANT_PAYOUT_ADDRESS_EVM: string;
  SOLANA_RPC_URL?: string;
  EVM_RPC_URL?: string;
  PLATFORM_FEE_BPS?: string;
  EVM_MIN_CONFIRMATIONS?: string;
  PAYMENT_MAX_AGE_SEC?: string;
  LIFI_INTEGRATOR?: string;
  LIFI_API_KEY?: string;
  JITO_TIP_LAMPORTS?: string;
  X402_FACILITATOR_URL?: string;
  SIM_SECRET?: string;
  STATS_TOKEN?: string;
}

export type AppEnv = { Bindings: WorkerEnv; Variables: { payment: VerifiedPayment } };
