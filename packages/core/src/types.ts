export type PaymentNetwork = 'polygon' | 'base' | 'solana';

export interface CoreConfig {
  merchantSol: string;
  merchantEvm: string;
  merchantBtc: string | null;
  merchantTrx: string | null;
  solanaRpcUrl: string;
  evmRpcUrl: string;
  evmChainId: number;
  evmNetwork: 'polygon';
  baseRpcUrl: string;
  usdcBase: string;
  usdcEvm: string;
  usdcSol: string;
  minConfirmations: number;
  maxAgeSec: number;
  feeBps: number;
  /** Ordered list; the first one reachable from the Worker is used. */
  facilitatorUrls: string[];
  simSecret: string | null;
}

export interface NonceStore {
  consume(key: string, ttlSec: number): Promise<boolean>;
}

export type PaymentProof =
  | { kind: 'evm-tx'; hash: string }
  | { kind: 'solana-tx'; signature: string }
  | { kind: 'facilitator'; payload: string }
  | { kind: 'simulation'; token: string };

export interface VerifiedPayment {
  network: PaymentNetwork | 'simulation';
  reference: string;
  payer: string | null;
  amountUnits: number;
  settledAt: number;
}

export type VerifyResult =
  | { ok: true; payment: VerifiedPayment }
  | { ok: false; reason: string; retryable: boolean };

export interface JsonSchema {
  type: string;
  properties?: Record<string, unknown>;
  required?: string[];
  [key: string]: unknown;
}

export interface RouteSpec {
  id: string;
  method: 'GET' | 'POST';
  path: string;
  priceUnits: number | null;
  summary: string;
  description: string;
  input: { in: 'query' | 'body'; schema: JsonSchema };
  output: JsonSchema;
  example: { input: Record<string, unknown>; output: Record<string, unknown> };
}

export interface PaymentRequirement {
  scheme: 'exact';
  network: PaymentNetwork;
  maxAmountRequired: string;
  resource: string;
  description: string;
  mimeType: string;
  payTo: string;
  maxTimeoutSeconds: number;
  asset: string;
  extra: Record<string, unknown>;
}

export interface PaymentRequirementV2 {
  scheme: 'exact';
  network: string;
  asset: string;
  amount: string;
  payTo: string;
  maxTimeoutSeconds: number;
  extra: Record<string, unknown>;
}

export interface Requirements {
  v1: PaymentRequirement[];
  v2: PaymentRequirementV2[];
}
