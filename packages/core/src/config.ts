import {
  DEFAULT_EVM_RPC,
  DEFAULT_SOLANA_RPC,
  EVM_ADDRESS,
  POLYGON_CHAIN_ID,
  SOLANA_ADDRESS,
  USDC_POLYGON,
  USDC_SOLANA,
} from './constants';
import type { CoreConfig } from './types';

type RawEnv = Record<string, unknown>;

function str(env: RawEnv, key: string): string | null {
  const v = env[key];
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
}

function int(env: RawEnv, key: string, fallback: number): number {
  const v = str(env, key);
  if (v === null) return fallback;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0) throw new Error(`${key} must be a non-negative integer`);
  return n;
}

export function loadConfig(env: RawEnv): CoreConfig {
  const merchantSol = str(env, 'MERCHANT_PAYOUT_ADDRESS_SOL');
  const merchantEvm = str(env, 'MERCHANT_PAYOUT_ADDRESS_EVM');
  if (!merchantSol || !SOLANA_ADDRESS.test(merchantSol)) throw new Error('MERCHANT_PAYOUT_ADDRESS_SOL missing or invalid');
  if (!merchantEvm || !EVM_ADDRESS.test(merchantEvm)) throw new Error('MERCHANT_PAYOUT_ADDRESS_EVM missing or invalid');
  const feeBps = int(env, 'PLATFORM_FEE_BPS', 30);
  if (feeBps > 1000) throw new Error('PLATFORM_FEE_BPS must be <= 1000');
  return {
    merchantSol,
    merchantEvm,
    solanaRpcUrl: str(env, 'SOLANA_RPC_URL') ?? DEFAULT_SOLANA_RPC,
    evmRpcUrl: str(env, 'EVM_RPC_URL') ?? DEFAULT_EVM_RPC,
    evmChainId: POLYGON_CHAIN_ID,
    evmNetwork: 'polygon',
    usdcEvm: USDC_POLYGON,
    usdcSol: USDC_SOLANA,
    minConfirmations: int(env, 'EVM_MIN_CONFIRMATIONS', 3),
    maxAgeSec: int(env, 'PAYMENT_MAX_AGE_SEC', 900),
    feeBps,
    facilitatorUrl: str(env, 'X402_FACILITATOR_URL')?.replace(/\/+$/, '') ?? null,
    simSecret: str(env, 'SIM_SECRET'),
  };
}
