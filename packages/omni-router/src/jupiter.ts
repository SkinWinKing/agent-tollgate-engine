import { SOLANA_ADDRESS } from '@tollgate/core';
import { SOLANA_MINTS } from './chains';
import { accountExists, associatedTokenAddress, tokenProgramOf } from './solana-rpc';
import { staticAccountKeys } from './tx-inspect';
import { RouterError, type QuoteRequest, type QuoteResponse, type RouterConfig } from './types';

const JITO_TRANSACTIONS_ENDPOINT = 'https://mainnet.block-engine.jito.wtf/api/v1/transactions';

interface JupiterQuote {
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  otherAmountThreshold: string;
  priceImpactPct: string;
  platformFee?: { amount: string; feeBps: number };
  routePlan: unknown[];
}

interface JupiterSwap {
  swapTransaction: string;
  lastValidBlockHeight: number;
  prioritizationFeeLamports?: number;
}

export const resolveMint = (token: string): string => {
  const mapped = SOLANA_MINTS[token.toUpperCase()];
  if (mapped) return mapped;
  if (!SOLANA_ADDRESS.test(token)) throw new RouterError('INVALID_TOKEN', `Unknown Solana token: ${token}`, 400);
  return token;
};

async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  let lastStatus = 0;
  let lastText = '';
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 400 * attempt));
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(15000) });
    const text = await res.text();
    if (res.ok) return JSON.parse(text) as T;
    lastStatus = res.status;
    lastText = text;
    if (res.status < 500) break;
  }
  throw new RouterError('UPSTREAM_ERROR', `Jupiter ${lastStatus}: ${lastText.slice(0, 200)}`, 502);
}

async function merchantFeeAccount(cfg: RouterConfig, mint: string): Promise<string | null> {
  const program = await tokenProgramOf(cfg.solanaRpcUrl, mint);
  const account = await associatedTokenAddress(cfg.merchantSol, mint, program);
  return (await accountExists(cfg.solanaRpcUrl, account)) ? account : null;
}

export async function quoteJupiter(cfg: RouterConfig, r: QuoteRequest): Promise<QuoteResponse> {
  const inputMint = resolveMint(r.inputToken);
  const outputMint = resolveMint(r.outputToken);
  if (inputMint === outputMint) throw new RouterError('INVALID_REQUEST', 'inputToken and outputToken must differ', 400);

  // Jupiter accepts the platform fee in either the input or the output mint; prefer output,
  // fall back to input so swaps into tokens we hold no account for still carry the fee.
  const outFee = await merchantFeeAccount(cfg, outputMint);
  const feeAccount = outFee ?? (await merchantFeeAccount(cfg, inputMint));
  const feeMint = outFee ? outputMint : inputMint;
  if (!feeAccount) {
    throw new RouterError(
      'FEE_ACCOUNT_MISSING',
      `No merchant token account for ${inputMint} or ${outputMint}; route one side through USDC`,
      503,
    );
  }

  const params = new URLSearchParams({
    inputMint,
    outputMint,
    amount: r.amount,
    slippageBps: String(r.slippageBps),
    platformFeeBps: String(cfg.feeBps),
  });
  const quote = await getJson<JupiterQuote>(`${cfg.jupiterApiUrl}/quote?${params}`);

  const prioritizationFeeLamports =
    r.priority === 'turbo'
      ? { jitoTipLamports: cfg.jitoTipLamports }
      : r.priority === 'fast'
        ? { priorityLevelWithMaxLamports: { maxLamports: 1_000_000, priorityLevel: 'high' } }
        : 0;

  const swap = await getJson<JupiterSwap>(`${cfg.jupiterApiUrl}/swap`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      quoteResponse: quote,
      userPublicKey: r.userAddress,
      feeAccount,
      dynamicComputeUnitLimit: true,
      prioritizationFeeLamports,
    }),
  });

  const feeEmbedded = staticAccountKeys(swap.swapTransaction).includes(feeAccount);
  if (!feeEmbedded) throw new RouterError('FEE_NOT_EMBEDDED', 'Route rejected: platform fee account absent from built transaction', 502);

  return {
    route: 'jupiter',
    unsignedTransaction: {
      chain: 'solana',
      encoding: 'base64',
      serialized: swap.swapTransaction,
      lastValidBlockHeight: swap.lastValidBlockHeight,
    },
    quote: {
      inputMint,
      outputMint,
      inAmount: quote.inAmount,
      outAmount: quote.outAmount,
      minOutAmount: quote.otherAmountThreshold,
      priceImpactPct: quote.priceImpactPct,
      hops: quote.routePlan.length,
    },
    fee: {
      bps: cfg.feeBps,
      mechanism: 'jupiter-platform-fee',
      collectedIn: feeMint,
      // Jupiter's quote reports the fee in output units; when we collect in the input mint compute it ourselves.
      amount: outFee ? (quote.platformFee?.amount ?? null) : ((BigInt(quote.inAmount) * BigInt(cfg.feeBps)) / 10_000n).toString(),
      recipient: feeAccount,
      recipientOwner: cfg.merchantSol,
      verifiedInQuote: quote.platformFee?.feeBps === cfg.feeBps,
    },
    submission:
      r.priority === 'turbo'
        ? {
            method: 'jito',
            endpoint: JITO_TRANSACTIONS_ENDPOINT,
            rpcMethod: 'sendTransaction',
            params: { encoding: 'base64' },
            tipLamports: cfg.jitoTipLamports,
          }
        : { method: 'rpc', rpcMethod: 'sendTransaction', params: { encoding: 'base64', skipPreflight: false } },
  };
}
