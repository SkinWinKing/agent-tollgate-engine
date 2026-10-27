export type ChainName = 'solana' | 'ethereum' | 'arbitrum' | 'base' | 'polygon' | 'bitcoin' | 'tron';
export type Priority = 'none' | 'fast' | 'turbo';

export interface QuoteRequest {
  fromChain: ChainName;
  toChain: ChainName;
  inputToken: string;
  outputToken: string;
  amount: string;
  userAddress: string;
  destinationAddress: string;
  slippageBps: number;
  priority: Priority;
}

export interface RouterConfig {
  merchantSol: string;
  merchantEvm: string;
  merchantBtc: string | null;
  merchantTrx: string | null;
  feeBps: number;
  solanaRpcUrl: string;
  jupiterApiUrl: string;
  lifiApiUrl: string;
  lifiApiKey: string | null;
  lifiIntegrator: string;
  jitoTipLamports: number;
  evmRpcUrls: Partial<Record<ChainName, string>>;
}

export interface FeeSummary {
  bps: number;
  mechanism: 'jupiter-platform-fee' | 'lifi-integrator-fee' | 'lifi-intents-escrow';
  collectedIn: string;
  amount: string | null;
  totalChargedBps?: number | null;
  lifiShareBps?: number | null;
  recipient: string;
  recipientOwner: string;
  verifiedInQuote: boolean;
}

export interface QuoteResponse {
  route: 'jupiter' | 'lifi' | 'lifi-intents';
  unsignedTransaction: Record<string, unknown>;
  quote: Record<string, unknown>;
  fee: FeeSummary;
  submission: Record<string, unknown>;
}

export class RouterError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}
