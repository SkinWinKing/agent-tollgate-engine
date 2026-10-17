import { jsonRpc, RpcError } from '@tollgate/core';
import { concentrationFlags, scoreFlags, type Flag } from './risk';

interface MintAccount {
  value: {
    owner: string;
    data: {
      parsed?: {
        type: string;
        info: {
          mintAuthority: string | null;
          freezeAuthority: string | null;
          supply: string;
          decimals: number;
          isInitialized: boolean;
          extensions?: { extension: string; state: Record<string, unknown> }[];
        };
      };
    };
  } | null;
}

interface Largest {
  value: { address: string; amount: string }[];
}

interface Multiple {
  value: ({ data: { parsed?: { info?: { owner?: string } } } } | null)[];
}

export class AuditError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** `quick` skips the holder lookup (slow for large mints); used by the free check inside swap quotes. */
export async function auditSolanaToken(rpcUrl: string, mint: string, opts: { quick?: boolean } = {}) {
  const account = await jsonRpc<MintAccount>(rpcUrl, 'getAccountInfo', [mint, { encoding: 'jsonParsed', commitment: 'confirmed' }]);
  const parsed = account.value?.data.parsed;
  if (!account.value || parsed?.type !== 'mint') throw new AuditError('Address is not an SPL token mint', 404);
  const info = parsed.info;
  const supply = BigInt(info.supply);
  const flags: Flag[] = [];

  if (info.mintAuthority) flags.push({ code: 'MINT_AUTHORITY_ACTIVE', severity: 'critical', message: `Mint authority ${info.mintAuthority} can inflate supply`, points: 30 });
  if (info.freezeAuthority) flags.push({ code: 'FREEZE_AUTHORITY_ACTIVE', severity: 'high', message: `Freeze authority ${info.freezeAuthority} can freeze holder accounts`, points: 25 });

  for (const ext of info.extensions ?? []) {
    if (ext.extension === 'permanentDelegate') flags.push({ code: 'PERMANENT_DELEGATE', severity: 'critical', message: 'Permanent delegate can transfer or burn any holder balance', points: 35 });
    if (ext.extension === 'transferHook') flags.push({ code: 'TRANSFER_HOOK', severity: 'high', message: 'Transfer hook executes arbitrary program on every transfer', points: 15 });
    if (ext.extension === 'nonTransferable') flags.push({ code: 'NON_TRANSFERABLE', severity: 'high', message: 'Token is non-transferable', points: 30 });
    if (ext.extension === 'transferFeeConfig') {
      const newer = (ext.state.newerTransferFee ?? {}) as { transferFeeBasisPoints?: number };
      const bps = Number(newer.transferFeeBasisPoints ?? 0);
      if (bps > 0) flags.push({ code: 'TRANSFER_FEE', severity: bps >= 500 ? 'high' : 'medium', message: `Transfer fee of ${bps} bps`, points: bps >= 500 ? 20 : 8 });
    }
  }

  let holders: { address: string; owner: string | null; amount: string; share: number }[] | null = null;
  if (opts.quick) {
    // authority and extension checks only
  } else if (supply > 0n) {
    try {
      const largest = await jsonRpc<Largest>(rpcUrl, 'getTokenLargestAccounts', [mint, { commitment: 'confirmed' }]);
      const top = largest.value.slice(0, 10);
      const owners = await jsonRpc<Multiple>(rpcUrl, 'getMultipleAccounts', [top.map((t) => t.address), { encoding: 'jsonParsed', commitment: 'confirmed' }]);
      holders = top.map((t, i) => ({
        address: t.address,
        owner: owners.value[i]?.data.parsed?.info?.owner ?? null,
        amount: t.amount,
        share: Number((BigInt(t.amount) * 1_000_000n) / supply) / 1_000_000,
      }));
      const top1 = holders[0]?.share ?? 0;
      const top10 = holders.reduce((acc, h) => acc + h.share, 0);
      flags.push(...concentrationFlags(top1, top10));
    } catch (err) {
      if (!(err instanceof RpcError)) throw err;
      flags.push({ code: 'HOLDER_DATA_UNAVAILABLE', severity: 'info', message: 'Holder distribution unavailable from RPC for this mint (too many accounts)', points: 0 });
    }
  } else {
    flags.push({ code: 'ZERO_SUPPLY', severity: 'medium', message: 'Token has zero supply', points: 10 });
  }

  return {
    chain: 'solana',
    address: mint,
    standard: account.value.owner,
    decimals: info.decimals,
    supply: info.supply,
    mintAuthority: info.mintAuthority,
    freezeAuthority: info.freezeAuthority,
    holders: holders ? { top10: holders, top10Share: holders.reduce((a, h) => a + h.share, 0) } : null,
    flags,
    ...scoreFlags(flags),
    asOf: new Date().toISOString(),
  };
}
