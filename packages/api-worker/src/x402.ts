import {
  bazaarExtension,
  buildRequirements,
  extractProof,
  facilitatorSolanaFeePayer,
  loadConfig,
  unitsToUsdc,
  verifyPayment,
  type NonceStore,
  type RouteSpec,
} from '@tollgate/core';
import type { MiddlewareHandler } from 'hono';
import type { AppEnv } from './env';

const STATS_TTL_SEC = 60 * 86_400;

type Store = { bump(key: string, ttlSec: number): Promise<void> };
/** Daily usage counter, read back via /internal/stats. Never awaited on the hot path's critical result. */
export const track = (stub: Store, evt: string) => stub.bump(`stat:${new Date().toISOString().slice(0, 10)}:${evt}`, STATS_TTL_SEC).catch(() => {});

const b64 = (value: unknown) => btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(value))));

export const x402PaymentGate = (route: RouteSpec): MiddlewareHandler<AppEnv> => async (c, next) => {
  const cfg = loadConfig(c.env as unknown as Record<string, unknown>);
  const resource = new URL(c.req.url).toString();
  const requirements = buildRequirements(cfg, route, resource, await facilitatorSolanaFeePayer(cfg));
  const extensions = bazaarExtension(route);
  const nonce = crypto.randomUUID();

  const challenge = (error: string, retryable: boolean) => {
    c.header('WWW-Authenticate', 'x402');
    c.header('X-402-Nonce', nonce);
    c.header(
      'PAYMENT-REQUIRED',
      b64({
        x402Version: 2,
        error,
        resource: { url: resource, description: route.summary, mimeType: 'application/json' },
        accepts: requirements.v2,
        extensions,
      }),
    );
    return c.json(
      {
        x402Version: 1,
        error,
        retryable,
        nonce,
        price: { amount: unitsToUsdc(route.priceUnits ?? 0), currency: 'USDC', baseUnits: String(route.priceUnits) },
        accepts: requirements.v1,
        extensions,
        instructions: [
          'Send a USDC transfer of at least price.baseUnits to payTo on one accepted network.',
          'Retry this request with `Authorization: Bearer <tx_hash_or_signature>`, or sign an x402 payment and send it in `PAYMENT-SIGNATURE` (v2) / `X-PAYMENT` (v1).',
          'Each payment covers exactly one request and must be under ' + cfg.maxAgeSec + ' seconds old.',
        ],
      },
      402,
    );
  };

  const proof = extractProof(c.req.raw.headers);
  const stub = c.env.NONCE_STORE.get(c.env.NONCE_STORE.idFromName('global'));

  if (!proof) {
    c.executionCtx.waitUntil(track(stub, `402:${route.id}`));
    return challenge('PAYMENT_REQUIRED', true);
  }

  const nonces: NonceStore = { consume: (key, ttl) => stub.consume(key, ttl) };
  const { result, extensionResponses } = await verifyPayment(cfg, proof, route, requirements, nonces);
  if (!result.ok) return challenge(result.reason, result.retryable);

  c.set('payment', result.payment);
  c.executionCtx.waitUntil(track(stub, `paid:${route.id}:${result.payment.network}`));
  const receipt = b64({ success: true, network: result.payment.network, transaction: result.payment.reference, payer: result.payment.payer });
  c.header('PAYMENT-RESPONSE', receipt);
  c.header('X-PAYMENT-RESPONSE', receipt);
  if (extensionResponses) c.header('EXTENSION-RESPONSES', extensionResponses);
  await next();
};
