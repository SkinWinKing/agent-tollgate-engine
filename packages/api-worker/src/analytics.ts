import type { VerifiedPayment } from '@tollgate/core';

export function resolveOutcome(status: number, payment: VerifiedPayment | undefined, hasApiKey: boolean): string {
  if (status === 402) return 'payment_required';
  if (status >= 200 && status < 300) {
    if (payment) return payment.network === 'simulation' ? 'simulated' : 'paid';
    if (hasApiKey) return 'api_key';
    return 'free';
  }
  if (status === 429) return 'rate_limited';
  if (status < 500) return 'client_error';
  return 'server_error';
}
