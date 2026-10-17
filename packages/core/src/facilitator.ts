import { VerifyResultFail } from './internal';
import type { CoreConfig, PaymentRequirement, PaymentRequirementV2, Requirements, VerifyResult } from './types';

interface PaymentPayload {
  x402Version: number;
  scheme?: string;
  network?: string;
  accepted?: { network?: string; scheme?: string };
  payload?: { authorization?: { from?: string; nonce?: string } };
}

interface Kind {
  x402Version: number;
  network: string;
  extra?: { feePayer?: string };
}

const KINDS_TTL_MS = 10 * 60 * 1000;
let active: { at: number; url: string; feePayer: string | null } | null = null;

/**
 * First facilitator whose /supported answers. Some facilitators are unreachable from a
 * zone-routed Worker (Cloudflare 525), so we fall back down the list. The Solana feePayer
 * advertised in 402 must belong to the facilitator that later verifies, hence one shared pick.
 */
async function activeFacilitator(cfg: CoreConfig): Promise<{ url: string; feePayer: string | null } | null> {
  if (active && Date.now() - active.at < KINDS_TTL_MS && cfg.facilitatorUrls.includes(active.url)) return active;
  for (const url of cfg.facilitatorUrls) {
    try {
      const res = await fetch(`${url}/supported`, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) continue;
      const body = (await res.json()) as { kinds?: Kind[] };
      const feePayer = body.kinds?.find((k) => k.network === 'solana' && k.extra?.feePayer)?.extra?.feePayer ?? null;
      active = { at: Date.now(), url, feePayer };
      return active;
    } catch {
      continue;
    }
  }
  return active;
}

export async function facilitatorSolanaFeePayer(cfg: CoreConfig): Promise<string | null> {
  return (await activeFacilitator(cfg))?.feePayer ?? null;
}

const v2Network = (caip: string): 'polygon' | 'base' | 'solana' => (caip.startsWith('solana') ? 'solana' : caip === 'eip155:8453' ? 'base' : 'polygon');

function decodePayload(header: string): PaymentPayload | null {
  try {
    const json = new TextDecoder().decode(Uint8Array.from(atob(header), (c) => c.charCodeAt(0)));
    return JSON.parse(json) as PaymentPayload;
  } catch {
    return null;
  }
}

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`facilitator HTTP ${res.status}`);
  return (await res.json()) as T;
}

export async function verifyViaFacilitator(
  cfg: CoreConfig,
  header: string,
  requirements: Requirements,
): Promise<{ result: VerifyResult; nonceKey: string | null; extensionResponses: string | null }> {
  const fail = (reason: string, retryable: boolean) => ({ result: VerifyResultFail(reason, retryable), nonceKey: null, extensionResponses: null });
  if (cfg.facilitatorUrls.length === 0) return fail('FACILITATOR_NOT_CONFIGURED', false);
  const facilitator = await activeFacilitator(cfg);
  if (!facilitator) return fail('FACILITATOR_UNAVAILABLE', true);
  const paymentPayload = decodePayload(header);
  if (!paymentPayload) return fail('MALFORMED_PAYMENT_PAYLOAD', false);

  const version = paymentPayload.x402Version === 2 ? 2 : 1;
  let requirement: PaymentRequirement | PaymentRequirementV2 | undefined;
  if (version === 2) {
    const network = paymentPayload.accepted?.network;
    requirement = requirements.v2.find((r) => r.network === network && r.scheme === (paymentPayload.accepted?.scheme ?? 'exact'));
  } else {
    requirement = requirements.v1.find((r) => r.network === paymentPayload.network && r.scheme === paymentPayload.scheme);
  }
  if (!requirement) return fail('NETWORK_NOT_ACCEPTED', false);

  const amountUnits = Number('amount' in requirement ? requirement.amount : requirement.maxAmountRequired);
  const body = { x402Version: version, paymentPayload, paymentRequirements: requirement };
  try {
    const verify = await post<{ isValid: boolean; invalidReason?: string; payer?: string }>(`${facilitator.url}/verify`, body);
    if (!verify.isValid) return fail(verify.invalidReason ?? 'FACILITATOR_REJECTED', false);
    const settleRes = await fetch(`${facilitator.url}/settle`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30000),
    });
    const settle = (await settleRes.json()) as { success: boolean; errorReason?: string; transaction?: string; payer?: string; network?: string };
    if (!settle.success || !settle.transaction) return fail(settle.errorReason ?? 'SETTLEMENT_FAILED', false);
    const nonce = paymentPayload.payload?.authorization?.nonce ?? settle.transaction;
    const network = 'amount' in requirement ? v2Network(requirement.network) : requirement.network;
    return {
      result: {
        ok: true,
        payment: {
          network: network as 'polygon' | 'solana',
          reference: settle.transaction,
          payer: settle.payer ?? verify.payer ?? paymentPayload.payload?.authorization?.from ?? null,
          amountUnits,
          settledAt: Math.floor(Date.now() / 1000),
        },
      },
      nonceKey: `auth:${nonce}`,
      extensionResponses: settleRes.headers.get('extension-responses'),
    };
  } catch {
    return fail('FACILITATOR_UNAVAILABLE', true);
  }
}
