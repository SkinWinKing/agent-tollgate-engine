import { loadConfig } from '@tollgate/core';
import type { RouterConfig } from './types';

type RawEnv = Record<string, unknown>;

const str = (env: RawEnv, key: string): string | null => {
  const v = env[key];
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
};

export function loadRouterConfig(env: RawEnv): RouterConfig {
  const core = loadConfig(env);
  const jito = Number(str(env, 'JITO_TIP_LAMPORTS') ?? '100000');
  return {
    merchantSol: core.merchantSol,
    merchantEvm: core.merchantEvm,
    merchantBtc: core.merchantBtc,
    merchantTrx: core.merchantTrx,
    feeBps: core.feeBps,
    solanaRpcUrl: core.solanaRpcUrl,
    jupiterApiUrl: (str(env, 'JUPITER_API_URL') ?? 'https://lite-api.jup.ag/swap/v1').replace(/\/+$/, ''),
    lifiApiUrl: (str(env, 'LIFI_API_URL') ?? 'https://li.quest/v1').replace(/\/+$/, ''),
    lifiApiKey: str(env, 'LIFI_API_KEY'),
    lifiIntegrator: str(env, 'LIFI_INTEGRATOR') ?? 'agent-tollgate',
    jitoTipLamports: Number.isInteger(jito) && jito > 0 ? jito : 100000,
    evmRpcUrls: {
      polygon: core.evmRpcUrl,
      base: str(env, 'BASE_RPC_URL') ?? 'https://mainnet.base.org',
      ethereum: str(env, 'ETHEREUM_RPC_URL') ?? 'https://ethereum-rpc.publicnode.com',
      arbitrum: str(env, 'ARBITRUM_RPC_URL') ?? 'https://arb1.arbitrum.io/rpc',
    },
  };
}
