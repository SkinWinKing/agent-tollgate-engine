import { RpcError } from '@tollgate/core';
import { quoteJupiter } from './jupiter';
import { quoteLifi } from './lifi';
import { quoteIntents, supportsIntents } from './intents';
import { parseQuoteRequest } from './validate';
import { RouterError, type QuoteResponse, type RouterConfig } from './types';

export { loadRouterConfig } from './config';
export { staticAccountKeys } from './tx-inspect';
export { RouterError } from './types';
export type { QuoteRequest, QuoteResponse, RouterConfig } from './types';

export async function quoteAndBuild(cfg: RouterConfig, rawRequest: unknown): Promise<QuoteResponse> {
  const request = parseQuoteRequest(rawRequest);
  if (request.fromChain === 'solana' && request.toChain === 'solana') {
    try {
      return await quoteJupiter(cfg, request);
    } catch (err) {
      if (err instanceof RpcError) throw new RouterError('RPC_UNAVAILABLE', `Solana RPC failed: ${err.message}`, 503);
      throw err;
    }
  }
  if (request.fromChain === request.toChain && request.inputToken === request.outputToken) {
    throw new RouterError('INVALID_REQUEST', 'inputToken and outputToken must differ', 400);
  }
  if ((request.fromChain === 'bitcoin' && !cfg.merchantBtc) || (request.fromChain === 'tron' && !cfg.merchantTrx)) {
    throw new RouterError('CHAIN_NOT_CONFIGURED', `${request.fromChain} merchant address not set`, 503);
  }
  // Try Intents first for cross-chain routes (better pricing from solvers), fall back to classic LI.FI.
  if (request.fromChain !== request.toChain && supportsIntents(request.fromChain, request.toChain)) {
    try {
      return await quoteIntents(cfg, request);
    } catch {
      // Intents unavailable or no solver quote — fall through to classic LI.FI.
    }
  }
  return quoteLifi(cfg, request);
}
