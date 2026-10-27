import type { VerifiedPayment } from '@tollgate/core';
import type { NonceStore } from './nonce-store';

export interface WorkerEnv {
  NONCE_STORE: DurableObjectNamespace<NonceStore>;
  AI: Ai;
  SALES: D1Database;
  CACHE: KVNamespace;
  EVENTS: AnalyticsEngineDataset;
  CF_ACCOUNT_ID?: string;
  CF_INTEL_TOKEN?: string;
  CF_BROWSER_TOKEN?: string;
  EGRESS_URL?: string;
  EGRESS_TOKEN?: string;
  SESSION_SECRET?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  BACKUPS: R2Bucket;
  MERCHANT_PAYOUT_ADDRESS_SOL: string;
  MERCHANT_PAYOUT_ADDRESS_EVM: string;
  MERCHANT_PAYOUT_ADDRESS_BTC?: string;
  MERCHANT_PAYOUT_ADDRESS_TRX?: string;
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
