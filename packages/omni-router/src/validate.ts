import { CHAINS, isValidAddress } from './chains';
import { RouterError, type ChainName, type Priority, type QuoteRequest } from './types';

const PRIORITIES: Priority[] = ['none', 'fast', 'turbo'];

function req(body: Record<string, unknown>, key: string): string {
  const v = body[key];
  if (typeof v !== 'string' || v.trim() === '') throw new RouterError('INVALID_REQUEST', `${key} is required`, 400);
  return v.trim();
}

function chain(body: Record<string, unknown>, key: string): ChainName {
  const v = req(body, key).toLowerCase();
  if (!(v in CHAINS)) throw new RouterError('INVALID_REQUEST', `${key} must be one of ${Object.keys(CHAINS).join(', ')}`, 400);
  return v as ChainName;
}

export function parseQuoteRequest(raw: unknown): QuoteRequest {
  if (typeof raw !== 'object' || raw === null) throw new RouterError('INVALID_REQUEST', 'JSON body required', 400);
  const body = raw as Record<string, unknown>;
  const fromChain = chain(body, 'fromChain');
  const toChain = chain(body, 'toChain');
  const amount = req(body, 'amount');
  if (!/^[1-9][0-9]{0,38}$/.test(amount)) throw new RouterError('INVALID_REQUEST', 'amount must be a positive integer string in base units', 400);

  const userAddress = req(body, 'userAddress');
  if (!isValidAddress(CHAINS[fromChain].kind, userAddress)) {
    throw new RouterError('INVALID_REQUEST', `userAddress is not a valid ${CHAINS[fromChain].kind} address`, 400);
  }
  const destinationAddress = typeof body.destinationAddress === 'string' && body.destinationAddress ? body.destinationAddress : userAddress;
  if (!isValidAddress(CHAINS[toChain].kind, destinationAddress)) {
    throw new RouterError('INVALID_REQUEST', `destinationAddress must be a valid ${CHAINS[toChain].kind} address`, 400);
  }

  const slippageBps = body.slippageBps === undefined ? 50 : Number(body.slippageBps);
  if (!Number.isInteger(slippageBps) || slippageBps < 1 || slippageBps > 1000) {
    throw new RouterError('INVALID_REQUEST', 'slippageBps must be an integer in 1..1000', 400);
  }
  const priority = (body.priority ?? 'fast') as Priority;
  if (!PRIORITIES.includes(priority)) throw new RouterError('INVALID_REQUEST', `priority must be one of ${PRIORITIES.join(', ')}`, 400);

  return {
    fromChain,
    toChain,
    inputToken: req(body, 'inputToken'),
    outputToken: req(body, 'outputToken'),
    amount,
    userAddress,
    destinationAddress,
    slippageBps,
    priority,
  };
}
