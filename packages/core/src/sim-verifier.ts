import { VerifyResultFail } from './internal';
import type { CoreConfig, VerifyResult } from './types';

const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

const SIM_MAX_AGE_SEC = 7 * 86_400;

export async function signSimulationReceipt(secret: string, amountUnits: number): Promise<string> {
  const nonce = hex(crypto.getRandomValues(new Uint8Array(12)).buffer);
  const ts = Math.floor(Date.now() / 1000);
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = hex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${nonce}.${amountUnits}.${ts}`)));
  return `sim_${nonce}_${amountUnits}_${ts}_${mac}`;
}

export async function verifySimulationReceipt(cfg: CoreConfig, token: string, minUnits: number): Promise<VerifyResult> {
  if (!cfg.simSecret) return VerifyResultFail('SIMULATION_DISABLED', false);
  const parts = token.split('_');
  const [, nonce, amount, tsOrMac, maybeMac] = parts;
  const hasTs = parts.length >= 5;
  const ts = hasTs ? tsOrMac : undefined;
  const mac = hasTs ? maybeMac : tsOrMac;
  if (!nonce || !amount || !mac) return VerifyResultFail('MALFORMED_SIMULATION_RECEIPT', false);
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(cfg.simSecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const payload = hasTs ? `${nonce}.${amount}.${ts}` : `${nonce}.${amount}`;
  const expected = hex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload)));
  if (expected !== mac) return VerifyResultFail('BAD_SIMULATION_SIGNATURE', false);
  if (ts && Date.now() / 1000 - Number(ts) > SIM_MAX_AGE_SEC) return VerifyResultFail('SIMULATION_EXPIRED', false);
  const amountUnits = Number(amount);
  if (!Number.isInteger(amountUnits) || amountUnits < minUnits) return VerifyResultFail('AMOUNT_TOO_LOW', false);
  return {
    ok: true,
    payment: { network: 'simulation', reference: token, payer: 'simulated-agent', amountUnits, settledAt: Math.floor(Date.now() / 1000) },
  };
}
