import { loadConfig, ROUTES, SOLANA_ADDRESS } from '@tollgate/core';
import { loadRouterConfig, quoteAndBuild, RouterError } from '@tollgate/omni-router';
import { Hono } from 'hono';
import type { AppEnv } from './env';
import { auditEvmToken, EVM_CHAINS, type EvmChain } from './services/audit-evm';
import { auditSolanaToken, AuditError } from './services/audit-solana';
import { orderbookImbalance, OrderbookError } from './services/orderbook';
import { x402PaymentGate } from './x402';

export const routes = new Hono<AppEnv>();

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
    return c.json(await quoteAndBuild(loadRouterConfig(c.env as unknown as Record<string, unknown>), body));
  } catch (err) {
    if (err instanceof RouterError) return c.json({ error: err.code, message: err.message }, err.status as 400);
    throw err;
  }
});
