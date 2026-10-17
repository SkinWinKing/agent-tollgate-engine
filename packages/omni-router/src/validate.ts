import { CHAINS, isValidAddress } from './chains';
import { RouterError, type ChainName, type Priority, type QuoteRequest } from './types';

const PRIORITIES: Priority[] = ['none', 'fast', 'turbo'];

export const QUOTE_EXAMPLE = {
  fromChain: 'solana',
  toChain: 'solana',
  inputToken: 'SOL',
  outputToken: 'USDC',
  amount: '1000000000',
  userAddress: 'DSvMhichkVACpR89fmuN2m1UZry8AgNb1QXFZetmDmT1',
};

// Field names other agent frameworks commonly send.
const ALIASES: Record<string, string[]> = {
  fromChain: ['fromChain', 'from_chain', 'chain', 'sourceChain', 'srcChain', 'chainFrom'],
  toChain: ['toChain', 'to_chain', 'destinationChain', 'destChain', 'dstChain', 'chainTo'],
  inputToken: ['inputToken', 'input_token', 'fromToken', 'from_token', 'inputMint', 'tokenIn', 'sellToken'],
  outputToken: ['outputToken', 'output_token', 'toToken', 'to_token', 'outputMint', 'tokenOut', 'buyToken'],
  amount: ['amount', 'amountIn', 'inAmount', 'fromAmount', 'sellAmount'],
  userAddress: ['userAddress', 'user_address', 'wallet', 'walletAddress', 'address', 'userPublicKey', 'taker', 'fromAddress'],
  destinationAddress: ['destinationAddress', 'destination_address', 'recipient', 'receiver', 'toAddress'],
  slippageBps: ['slippageBps', 'slippage_bps', 'slippage'],
};

const CHAIN_ALIASES: Record<string, ChainName> = {
  sol: 'solana', 'solana-mainnet': 'solana', mainnet: 'ethereum', eth: 'ethereum', '1': 'ethereum',
  arb: 'arbitrum', arbitrum_one: 'arbitrum', 'arbitrum-one': 'arbitrum', '42161': 'arbitrum',
  '8453': 'base', 'base-mainnet': 'base', matic: 'polygon', pol: 'polygon', '137': 'polygon',
};

const invalid = (message: string) => new RouterError('INVALID_REQUEST', message, 400, { example: QUOTE_EXAMPLE });

function pick(body: Record<string, unknown>, key: string): unknown {
  for (const k of ALIASES[key] ?? [key]) if (body[k] !== undefined && body[k] !== null && body[k] !== '') return body[k];
  return undefined;
}

function opt(body: Record<string, unknown>, key: string): string | undefined {
  const v = pick(body, key);
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined;
}

function req(body: Record<string, unknown>, key: string): string {
  const v = opt(body, key);
  if (v === undefined) throw invalid(`${key} is required`);
  return v;
}

function toChainName(raw: string, key: string): ChainName {
  const v = raw.toLowerCase().replace(/^eip155:/, '');
  const name = v in CHAINS ? (v as ChainName) : CHAIN_ALIASES[v] ?? (v.startsWith('solana:') ? 'solana' : undefined);
  if (!name) throw invalid(`${key} must be one of ${Object.keys(CHAINS).join(', ')}`);
  return name;
}

export function parseQuoteRequest(raw: unknown): QuoteRequest {
  if (typeof raw !== 'object' || raw === null) throw invalid('JSON body required');
  const body = raw as Record<string, unknown>;
  const userAddress = req(body, 'userAddress');

  // fromChain may be omitted when the wallet is a Solana address; toChain defaults to fromChain.
  const fromRaw = opt(body, 'fromChain') ?? (isValidAddress('solana', userAddress) ? 'solana' : undefined);
  if (!fromRaw) throw invalid('fromChain is required for EVM wallets');
  const fromChain = toChainName(fromRaw, 'fromChain');
  const toChain = toChainName(opt(body, 'toChain') ?? fromChain, 'toChain');

  const amount = req(body, 'amount');
  if (!/^[1-9][0-9]{0,38}$/.test(amount)) throw invalid('amount must be a positive integer in base units (e.g. "1000000000" = 1 SOL)');

  if (!isValidAddress(CHAINS[fromChain].kind, userAddress)) throw invalid(`userAddress is not a valid ${CHAINS[fromChain].kind} address`);
  const destinationAddress = opt(body, 'destinationAddress') ?? userAddress;
  if (!isValidAddress(CHAINS[toChain].kind, destinationAddress)) {
    throw invalid(`destinationAddress must be a valid ${CHAINS[toChain].kind} address (required when bridging between chain kinds)`);
  }

  const slippageRaw = pick(body, 'slippageBps');
  const slippageBps = slippageRaw === undefined ? 50 : Number(slippageRaw);
  if (!Number.isInteger(slippageBps) || slippageBps < 1 || slippageBps > 1000) throw invalid('slippageBps must be an integer in 1..1000');
  const priority = (typeof body.priority === 'string' ? body.priority.toLowerCase() : 'fast') as Priority;
  if (!PRIORITIES.includes(priority)) throw invalid(`priority must be one of ${PRIORITIES.join(', ')}`);

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
