import { CHAINS } from './chains';
import { RouterError, type QuoteRequest, type QuoteResponse, type RouterConfig } from './types';

const ORDER_SERVER = 'https://order.li.fi';

interface IntentQuote {
  preview: { outputs: { amount: string; asset: string }[] };
  order: {
    openIntentTx: { to: string; data: string; value?: string; chainId?: number };
    checks: { allowances: { token: string; spender: string; required: string }[] };
    orderId?: string;
  };
  solver?: { id: string };
}

interface IntentResponse {
  quotes: IntentQuote[];
}

const INTENTS_CHAINS = new Set(['ethereum', 'base', 'arbitrum', 'polygon', 'solana', 'tron']);

export function supportsIntents(fromChain: string, toChain: string): boolean {
  return INTENTS_CHAINS.has(fromChain) && INTENTS_CHAINS.has(toChain);
}

export async function quoteIntents(cfg: RouterConfig, r: QuoteRequest): Promise<QuoteResponse> {
  const fromCaip = CHAINS[r.fromChain].caip2;
  const toCaip = CHAINS[r.toChain].caip2;

  const body = {
    user: { chain: fromCaip, address: r.userAddress },
    intent: {
      intentType: 'oif-swap',
      inputs: [{
        chain: fromCaip,
        user: r.userAddress,
        asset: r.inputToken,
        amount: r.amount,
      }],
      outputs: [{
        chain: toCaip,
        receiver: r.destinationAddress,
        asset: r.outputToken,
        amount: null,
      }],
      swapType: 'exact-input',
    },
    supportedTypes: ['oif-user-open-v0'],
  };

  const res = await fetch(`${ORDER_SERVER}/api/v1/integrator/quote/request`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    signal: AbortSignal.timeout(20000),
    body: JSON.stringify(body),
  });

  const text = await res.text();
  if (!res.ok) throw new RouterError('NO_INTENTS_ROUTE', `LI.FI Intents ${res.status}: ${text.slice(0, 300)}`, res.status >= 500 ? 502 : 404);

  const data = JSON.parse(text) as IntentResponse;
  if (!data.quotes?.length) throw new RouterError('NO_INTENTS_ROUTE', 'No solver quotes available', 404);

  const best = data.quotes[0]!;
  const outAmount = best.preview.outputs[0]?.amount ?? '0';
  const tx = best.order.openIntentTx;

  const source = CHAINS[r.fromChain];
  let unsignedTransaction: Record<string, unknown>;

  if (source.kind === 'solana') {
    unsignedTransaction = { chain: 'solana', encoding: 'base64', serialized: tx.data };
  } else {
    unsignedTransaction = {
      chain: r.fromChain,
      encoding: 'evm-transaction-request',
      chainId: source.lifiId,
      to: tx.to,
      from: r.userAddress,
      data: tx.data,
      value: tx.value ?? '0x0',
    };
  }

  return {
    route: 'lifi-intents',
    unsignedTransaction,
    quote: {
      solver: best.solver?.id ?? 'unknown',
      outAmount,
      allowances: best.order.checks.allowances,
      orderId: best.order.orderId ?? null,
      trackUrl: best.order.orderId ? `${ORDER_SERVER}/orders/status?onChainOrderId=${best.order.orderId}` : null,
    },
    fee: {
      bps: cfg.feeBps,
      mechanism: 'lifi-intents-escrow',
      collectedIn: r.inputToken,
      amount: ((BigInt(r.amount) * BigInt(cfg.feeBps)) / 10_000n).toString(),
      recipient: cfg.merchantEvm,
      recipientOwner: cfg.merchantEvm,
      verifiedInQuote: false,
    },
    submission: {
      method: source.kind === 'solana' ? 'rpc' : 'evm-eth_sendRawTransaction',
      note: 'Sign openIntentTx, broadcast, then track order at trackUrl until Settled.',
      trackEndpoint: `${ORDER_SERVER}/orders/status`,
    },
  };
}
