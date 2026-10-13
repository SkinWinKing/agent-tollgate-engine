import { CAIP_BASE, CAIP_POLYGON, CAIP_SOLANA, EVM_TX_HASH, SOLANA_SIGNATURE, USDC_DECIMALS } from './constants';
import { evmChains, verifyEvmPayment } from './evm-verifier';
import { verifyViaFacilitator } from './facilitator';
import { VerifyResultFail } from './internal';
import { verifySimulationReceipt } from './sim-verifier';
import { verifySolanaPayment } from './solana-verifier';
import type { CoreConfig, NonceStore, PaymentProof, Requirements, RouteSpec, VerifyResult } from './types';

const REPLAY_TTL_SEC = 60 * 60 * 24 * 7;

export function extractProof(headers: Headers): PaymentProof | null {
  const x402 = headers.get('payment-signature') ?? headers.get('x-402-signature') ?? headers.get('x-payment');
  if (x402) return { kind: 'facilitator', payload: x402.trim() };
  const auth = headers.get('authorization');
  const match = auth?.match(/^Bearer\s+(\S+)$/i);
  if (!match?.[1]) return null;
  const token = match[1];
  if (EVM_TX_HASH.test(token)) return { kind: 'evm-tx', hash: token };
  if (SOLANA_SIGNATURE.test(token)) return { kind: 'solana-tx', signature: token };
  if (token.startsWith('sim_')) return { kind: 'simulation', token };
  return null;
}

export function buildRequirements(cfg: CoreConfig, route: RouteSpec, resource: string, solanaFeePayer: string | null): Requirements {
  const amount = String(route.priceUnits);
  const v1Base = {
    scheme: 'exact' as const,
    maxAmountRequired: amount,
    resource,
    description: route.summary,
    mimeType: 'application/json',
    maxTimeoutSeconds: cfg.maxAgeSec,
  };
  const evmExtra = { name: 'USD Coin', version: '2', decimals: USDC_DECIMALS, chainId: cfg.evmChainId };
  const v1 = [
    { ...v1Base, network: 'polygon' as const, payTo: cfg.merchantEvm, asset: cfg.usdcEvm, extra: evmExtra },
    { ...v1Base, network: 'base' as const, payTo: cfg.merchantEvm, asset: cfg.usdcBase, extra: { ...evmExtra, chainId: 8453 } },
    {
      ...v1Base,
      network: 'solana' as const,
      payTo: cfg.merchantSol,
      asset: cfg.usdcSol,
      extra: { decimals: USDC_DECIMALS, ...(solanaFeePayer ? { feePayer: solanaFeePayer } : {}) },
    },
  ];
  const v2Base = { scheme: 'exact' as const, amount, maxTimeoutSeconds: cfg.maxAgeSec };
  const v2 = [
    { ...v2Base, network: CAIP_BASE, payTo: cfg.merchantEvm, asset: cfg.usdcBase, extra: { name: 'USD Coin', version: '2' } },
    { ...v2Base, network: CAIP_POLYGON, payTo: cfg.merchantEvm, asset: cfg.usdcEvm, extra: { name: 'USD Coin', version: '2' } },
    ...(solanaFeePayer
      ? [{ ...v2Base, network: CAIP_SOLANA, payTo: cfg.merchantSol, asset: cfg.usdcSol, extra: { feePayer: solanaFeePayer } }]
      : []),
  ];
  return { v1, v2 };
}

export async function verifyPayment(
  cfg: CoreConfig,
  proof: PaymentProof,
  route: RouteSpec,
  requirements: Requirements,
  nonces: NonceStore,
): Promise<{ result: VerifyResult; extensionResponses: string | null }> {
  const price = route.priceUnits ?? 0;
  let result: VerifyResult;
  let nonceKey: string | null = null;
  let extensionResponses: string | null = null;
  try {
    switch (proof.kind) {
      case 'evm-tx': {
        let last: VerifyResult = VerifyResultFail('TX_NOT_FOUND_OR_PENDING', true);
        for (const chain of evmChains(cfg)) {
          last = await verifyEvmPayment(cfg, chain, proof.hash, price).catch(() => VerifyResultFail('RPC_UNAVAILABLE', true));
          if (last.ok || last.reason !== 'TX_NOT_FOUND_OR_PENDING') break;
        }
        result = last;
        break;
      }
      case 'solana-tx':
        result = await verifySolanaPayment(cfg, proof.signature, price);
        break;
      case 'simulation':
        result = await verifySimulationReceipt(cfg, proof.token, price);
        break;
      case 'facilitator': {
        const out = await verifyViaFacilitator(cfg, proof.payload, requirements);
        result = out.result;
        nonceKey = out.nonceKey;
        extensionResponses = out.extensionResponses;
        break;
      }
    }
  } catch {
    return { result: VerifyResultFail('RPC_UNAVAILABLE', true), extensionResponses: null };
  }
  if (!result.ok) return { result, extensionResponses: null };

  const fresh = await nonces.consume(nonceKey ?? `pay:${result.payment.network}:${result.payment.reference}`, REPLAY_TTL_SEC);
  return { result: fresh ? result : VerifyResultFail('PAYMENT_ALREADY_USED', false), extensionResponses };
}
