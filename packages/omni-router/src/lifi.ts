import { EVM_NATIVE, CHAINS } from './chains';
import { evmFeeOverrides } from './gas';
import { RouterError, type QuoteRequest, type QuoteResponse, type RouterConfig } from './types';

interface LifiFeeCost {
  name: string;
  percentage?: string;
  amount?: string;
  included?: boolean;
  token?: { address: string; symbol: string };
}

interface LifiQuote {
  tool: string;
  estimate: { toAmount: string; toAmountMin: string; feeCosts?: LifiFeeCost[]; executionDuration?: number };
  transactionRequest: {
    from?: string;
    to?: string;
    data: string;
    value?: string;
    gasLimit?: string;
    chainId?: number;
  };
}

const normalizeToken = (chain: keyof typeof CHAINS, token: string): string =>
  CHAINS[chain].kind === 'evm' && token.toLowerCase() === 'native' ? EVM_NATIVE : token;

export async function quoteLifi(cfg: RouterConfig, r: QuoteRequest): Promise<QuoteResponse> {
  const fraction = cfg.feeBps / 10_000;
  const params = new URLSearchParams({
    fromChain: String(CHAINS[r.fromChain].lifiId),
    toChain: String(CHAINS[r.toChain].lifiId),
    fromToken: normalizeToken(r.fromChain, r.inputToken),
    toToken: normalizeToken(r.toChain, r.outputToken),
    fromAmount: r.amount,
    fromAddress: r.userAddress,
    toAddress: r.destinationAddress,
    integrator: cfg.lifiIntegrator,
    fee: String(fraction),
    slippage: String(r.slippageBps / 10_000),
  });
  const headers: Record<string, string> = { accept: 'application/json' };
  if (cfg.lifiApiKey) headers['x-lifi-api-key'] = cfg.lifiApiKey;

  const res = await fetch(`${cfg.lifiApiUrl}/quote?${params}`, { headers, signal: AbortSignal.timeout(20000) });
  const text = await res.text();
  if (!res.ok) throw new RouterError('NO_ROUTE', `LI.FI ${res.status}: ${text.slice(0, 300)}`, res.status === 404 ? 404 : 502);
  const quote = JSON.parse(text) as LifiQuote;
  if (!quote.transactionRequest?.data) throw new RouterError('NO_ROUTE', 'LI.FI returned no transaction', 502);

  const feeCost = quote.estimate.feeCosts?.find((f) => Number(f.percentage) >= fraction - 1e-9);
  const totalBps = feeCost ? Math.round(Number(feeCost.percentage) * 10_000) : 0;
  const ourAmount = feeCost?.amount && totalBps > 0 ? ((BigInt(feeCost.amount) * BigInt(cfg.feeBps)) / BigInt(totalBps)).toString() : null;

  const source = CHAINS[r.fromChain];
  let unsignedTransaction: Record<string, unknown>;
  if (source.kind === 'solana') {
    unsignedTransaction = { chain: 'solana', encoding: 'base64', serialized: quote.transactionRequest.data };
  } else {
    const rpc = cfg.evmRpcUrls[r.fromChain];
    const overrides = r.priority !== 'none' && rpc ? await evmFeeOverrides(rpc, r.priority) : null;
    unsignedTransaction = {
      chain: r.fromChain,
      encoding: 'evm-transaction-request',
      chainId: source.lifiId,
      to: quote.transactionRequest.to,
      from: r.userAddress,
      data: quote.transactionRequest.data,
      value: quote.transactionRequest.value ?? '0x0',
      gasLimit: quote.transactionRequest.gasLimit,
      ...(overrides ?? {}),
    };
  }

  return {
    route: 'lifi',
    unsignedTransaction,
    quote: {
      tool: quote.tool,
      toAmount: quote.estimate.toAmount,
      minOutAmount: quote.estimate.toAmountMin,
      estimatedDurationSec: quote.estimate.executionDuration ?? null,
    },
    fee: {
      bps: cfg.feeBps,
      mechanism: 'lifi-integrator-fee',
      collectedIn: feeCost?.token?.address ?? r.inputToken,
      amount: ourAmount,
      totalChargedBps: totalBps || null,
      lifiShareBps: totalBps ? totalBps - cfg.feeBps : null,
      recipient: cfg.merchantEvm,
      recipientOwner: cfg.merchantEvm,
      verifiedInQuote: feeCost !== undefined,
    },
    submission: { method: source.kind === 'solana' ? 'rpc' : 'evm-eth_sendRawTransaction', note: 'Sign unsignedTransaction with the userAddress key and broadcast.' },
  };
}
