const EARN_BASE = 'https://earn.li.fi';
const COMPOSER_BASE = 'https://li.quest/v1';

export class EarnError extends Error {
  constructor(message: string, readonly status: number = 502) { super(message); }
}

interface EarnConfig {
  lifiApiKey: string | null;
  lifiIntegrator: string;
  merchantEvm: string;
  feeBps: number;
}

export async function earnVaults(params: URLSearchParams, cfg: EarnConfig) {
  const qs = new URLSearchParams();
  const chainId = params.get('chainId');
  const asset = params.get('asset');
  const protocol = params.get('protocol');
  const sortBy = params.get('sortBy') ?? 'apy';
  const limit = params.get('limit') ?? '10';
  const cursor = params.get('cursor');

  if (chainId) qs.set('chainId', chainId);
  if (asset) qs.set('asset', asset);
  if (protocol) qs.set('protocol', protocol);
  qs.set('sortBy', sortBy);
  qs.set('limit', limit);
  qs.set('isTransactional', 'true');
  if (cursor) qs.set('cursor', cursor);

  const headers: Record<string, string> = { accept: 'application/json' };
  if (cfg.lifiApiKey) headers['x-lifi-api-key'] = cfg.lifiApiKey;

  const res = await fetch(`${EARN_BASE}/v1/vaults?${qs}`, { headers, signal: AbortSignal.timeout(15000) });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new EarnError(`Earn API ${res.status}: ${text.slice(0, 300)}`, res.status >= 500 ? 502 : 400);
  }

  const data = await res.json() as { data: unknown[]; total: number; nextCursor?: string };

  // Slim down vault objects to what agents need
  const vaults = (data.data ?? []).map((v: any) => ({
    address: v.address,
    chainId: v.chainId,
    name: v.name,
    protocol: v.protocol?.name,
    underlyingTokens: (v.underlyingTokens ?? []).map((t: any) => ({ symbol: t.symbol, address: t.address, decimals: t.decimals })),
    lpToken: v.lpTokens?.[0] ? { address: v.lpTokens[0].address, symbol: v.lpTokens[0].symbol } : null,
    apy: v.analytics?.apy?.total ?? null,
    apy7d: v.analytics?.apy7d ?? null,
    tvlUsd: v.analytics?.tvl?.usd ?? null,
    redeemable: v.isRedeemable,
    timeLock: v.timeLock ?? 0,
  }));

  return { vaults, total: data.total, nextCursor: data.nextCursor ?? null };
}

export async function earnDeposit(params: URLSearchParams, cfg: EarnConfig) {
  const fromChain = params.get('fromChain');
  const toChain = params.get('toChain');
  const fromToken = params.get('fromToken');
  const vaultToken = params.get('vaultToken');
  const fromAmount = params.get('fromAmount');
  const fromAddress = params.get('fromAddress');
  const slippage = params.get('slippage') ?? '0.005';

  if (!fromChain || !toChain || !fromToken || !vaultToken || !fromAmount || !fromAddress) {
    throw new EarnError('Required: fromChain, toChain, fromToken, vaultToken, fromAmount, fromAddress', 400);
  }

  const qs = new URLSearchParams({
    fromChain, toChain, fromToken, toToken: vaultToken,
    fromAmount, fromAddress, toAddress: fromAddress,
    slippage, integrator: cfg.lifiIntegrator,
  });

  const headers: Record<string, string> = { accept: 'application/json' };
  if (cfg.lifiApiKey) headers['x-lifi-api-key'] = cfg.lifiApiKey;

  const res = await fetch(`${COMPOSER_BASE}/quote?${qs}`, { headers, signal: AbortSignal.timeout(20000) });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new EarnError(`Composer quote ${res.status}: ${text.slice(0, 300)}`, res.status >= 500 ? 502 : 400);
  }

  const q = await res.json() as any;

  return {
    tool: q.tool ?? q.type,
    route: 'lifi-composer',
    estimate: {
      toAmount: q.estimate?.toAmount,
      toAmountMin: q.estimate?.toAmountMin,
      approvalAddress: q.estimate?.approvalAddress,
      gasCosts: q.estimate?.gasCosts,
    },
    unsignedTransaction: {
      chain: fromChain,
      encoding: 'evm-transaction-request',
      to: q.transactionRequest?.to,
      from: q.transactionRequest?.from ?? fromAddress,
      data: q.transactionRequest?.data,
      value: q.transactionRequest?.value ?? '0x0',
      gasLimit: q.transactionRequest?.gasLimit,
    },
    action: {
      fromChainId: q.action?.fromChainId,
      toChainId: q.action?.toChainId,
      fromToken: q.action?.fromToken?.symbol,
      toToken: q.action?.toToken?.symbol,
    },
    fee: {
      bps: cfg.feeBps,
      mechanism: 'lifi-integrator-fee',
      recipient: cfg.merchantEvm,
    },
    status: q.action?.fromChainId !== q.action?.toChainId
      ? { trackEndpoint: `${COMPOSER_BASE}/status`, note: 'Poll with txHash, fromChain, toChain until DONE.' }
      : undefined,
  };
}
