import { RpcError } from '@tollgate/core';
import { quoteJupiter } from './jupiter';
import { quoteLifi } from './lifi';
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
  return quoteLifi(cfg, request);
}
