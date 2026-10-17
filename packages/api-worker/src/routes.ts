import { loadConfig, ROUTES, SOLANA_ADDRESS } from '@tollgate/core';
import { loadRouterConfig, quoteAndBuild, RouterError } from '@tollgate/omni-router';
import { Hono } from 'hono';
import type { AppEnv } from './env';
import { auditEvmToken, EVM_CHAINS, type EvmChain } from './services/audit-evm';
import { auditSolanaToken, AuditError } from './services/audit-solana';
import { orderbookImbalance, OrderbookError } from './services/orderbook';
import { x402PaymentGate } from './x402';

export const routes = new Hono<AppEnv>();

const QUOTE_LIMIT_PER_MINUTE = 30;
const RISK_TIMEOUT_MS = 2500;
// Well-known mints are not worth an RPC round trip.
const TRUSTED_MINTS = new Set([
  'So11111111111111111111111111111111111111112',
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
]);

/** Free, time-boxed rug check of the token being bought; the full itemised audit stays a paid route. */
async function quickRisk(rpcUrl: string, mint: string) {
  if (TRUSTED_MINTS.has(mint)) return { mint, riskLevel: 'trusted', riskScore: 0, flags: [] as string[] };
  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), RISK_TIMEOUT_MS));
  const audit = await Promise.race([auditSolanaToken(rpcUrl, mint, { quick: true }).catch(() => null), timeout]);
  if (!audit) return { mint, available: false, fullAudit: ROUTES.tokenAudit.path };
  return {
    mint,
    riskScore: audit.riskScore,
    riskLevel: audit.riskLevel,
    flags: audit.flags.filter((f) => f.points > 0).map((f) => f.code),
    scope: 'authorities and token-2022 extensions; holder concentration is in the full audit',
    ...(audit.riskLevel === 'high' || audit.riskLevel === 'critical' ? { warning: 'High rug-pull risk: review before signing' } : {}),
    fullAudit: ROUTES.tokenAudit.path,
  };
}

routes.use(ROUTES.quote.path, async (c, next) => {
  const ip = c.req.header('cf-connecting-ip') ?? 'unknown';
  const stub = c.env.NONCE_STORE.get(c.env.NONCE_STORE.idFromName('global'));
  const bucket = Math.floor(Date.now() / 60_000);
  if (!(await stub.hit(`rl:quote:${ip}:${bucket}`, QUOTE_LIMIT_PER_MINUTE, 120))) {
    c.header('Retry-After', '60');
    return c.json({ error: 'RATE_LIMITED', message: `Limit is ${QUOTE_LIMIT_PER_MINUTE} requests per minute per IP` }, 429);
  }
  await next();
});

routes.use(ROUTES.orderbook.path, x402PaymentGate(ROUTES.orderbook));
routes.use(ROUTES.tokenAudit.path, x402PaymentGate(ROUTES.tokenAudit));

routes.get(ROUTES.orderbook.path, async (c) => {
  const pair = c.req.query('pair');
  if (!pair) return c.json({ error: 'INVALID_REQUEST', message: 'pair query parameter required' }, 400);
  try {
    return c.json(await orderbookImbalance(pair));
  } catch (err) {
    if (err instanceof OrderbookError) return c.json({ error: 'ORDERBOOK_ERROR', message: err.message }, err.status as 400);
    throw err;
  }
});

routes.post(ROUTES.tokenAudit.path, async (c) => {
  const body = await c.req.json<{ chain?: string; address?: string }>().catch(() => null);
  if (!body?.chain || !body.address) return c.json({ error: 'INVALID_REQUEST', message: 'chain and address required' }, 400);
  const cfg = loadConfig(c.env as unknown as Record<string, unknown>);
  try {
    if (body.chain === 'solana') {
      if (!SOLANA_ADDRESS.test(body.address)) return c.json({ error: 'INVALID_REQUEST', message: 'invalid Solana mint' }, 400);
      return c.json(await auditSolanaToken(cfg.solanaRpcUrl, body.address));
    }
    if (body.chain in EVM_CHAINS) {
      const chain = body.chain as EvmChain;
      const rpc = chain === 'polygon' ? cfg.evmRpcUrl : chain === 'base' ? 'https://mainnet.base.org' : 'https://ethereum-rpc.publicnode.com';
      return c.json(await auditEvmToken(rpc, chain, body.address));
    }
    return c.json({ error: 'INVALID_REQUEST', message: 'chain must be solana, polygon, base or ethereum' }, 400);
  } catch (err) {
    if (err instanceof AuditError) return c.json({ error: 'AUDIT_ERROR', message: err.message }, err.status as 400);
    throw err;
  }
});

routes.post(ROUTES.quote.path, async (c) => {
  const body = await c.req.json().catch(() => null);
  try {
    const quote = await quoteAndBuild(loadRouterConfig(c.env as unknown as Record<string, unknown>), body);
    const outputMint = quote.route === 'jupiter' ? String(quote.quote.outputMint ?? '') : '';
    const outputTokenRisk = outputMint ? await quickRisk(loadConfig(c.env as unknown as Record<string, unknown>).solanaRpcUrl, outputMint) : undefined;
    return c.json({ ...quote, ...(outputTokenRisk ? { outputTokenRisk } : {}) });
  } catch (err) {
    if (err instanceof RouterError) {
      // Field names only (no values) so we can see what agents send without logging wallets.
      const keys = body && typeof body === 'object' ? Object.keys(body).join(',') : typeof body;
      console.log(JSON.stringify({ evt: 'quote_error', code: err.code, message: err.message, keys }));
      return c.json({ error: err.code, message: err.message, ...err.details }, err.status as 400);
    }
    throw err;
  }
});
