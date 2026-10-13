import { EVM_ADDRESS, jsonRpc } from '@tollgate/core';
import { AuditError } from './audit-solana';
import { concentrationFlags, scoreFlags, type Flag } from './risk';

export type EvmChain = 'polygon' | 'base' | 'ethereum';

export const EVM_CHAINS: Record<EvmChain, { blockscout: string }> = {
  polygon: { blockscout: 'https://polygon.blockscout.com' },
  base: { blockscout: 'https://base.blockscout.com' },
  ethereum: { blockscout: 'https://eth.blockscout.com' },
};

const SELECTORS: { selector: string; code: string; severity: Flag['severity']; message: string; points: number }[] = [
  { selector: '40c10f19', code: 'MINT_FUNCTION', severity: 'high', message: 'mint(address,uint256) present: supply may be inflatable', points: 20 },
  { selector: '8456cb59', code: 'PAUSABLE', severity: 'medium', message: 'pause() present: transfers can be halted', points: 12 },
  { selector: 'f9f92be4', code: 'BLACKLIST', severity: 'high', message: 'blacklist(address) present: holders can be blocked', points: 20 },
  { selector: 'fe575a87', code: 'BLACKLIST_CHECK', severity: 'medium', message: 'isBlacklisted(address) present', points: 8 },
  { selector: '3659cfe6', code: 'UPGRADEABLE', severity: 'medium', message: 'upgradeTo(address) present: logic can be replaced', points: 12 },
  { selector: '4f1ef286', code: 'UPGRADEABLE', severity: 'medium', message: 'upgradeToAndCall present: logic can be replaced', points: 12 },
];

const IMPLEMENTATION_SLOT = '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc';
const ZERO = '0x' + '0'.repeat(64);
const DEAD = '0x000000000000000000000000000000000000dead';

const call = (rpc: string, to: string, data: string) => jsonRpc<string>(rpc, 'eth_call', [{ to, data }, 'latest']).catch(() => null);
const word = (hex: string | null) => (hex && hex.length >= 66 ? hex.slice(0, 66) : null);

function decodeString(hex: string | null): string | null {
  if (!hex || hex.length < 130) return null;
  try {
    const len = Number(BigInt('0x' + hex.slice(66, 130)));
    const bytes = hex.slice(130, 130 + len * 2).match(/../g) ?? [];
    return new TextDecoder().decode(Uint8Array.from(bytes.map((b) => parseInt(b, 16))));
  } catch {
    return null;
  }
}

interface BlockscoutToken {
  total_supply: string | null;
  holders_count: string | null;
}

interface BlockscoutHolders {
  items: { address: { hash: string }; value: string }[];
}

async function blockscout<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

export async function auditEvmToken(rpc: string, chain: EvmChain, address: string) {
  if (!EVM_ADDRESS.test(address)) throw new AuditError('address is not a valid EVM address', 400);
  const code = await jsonRpc<string>(rpc, 'eth_getCode', [address, 'latest']);
  if (code === '0x') throw new AuditError('No contract deployed at this address', 404);

  const [supplyRaw, decimalsRaw, symbolRaw, ownerRaw, implSlot] = await Promise.all([
    call(rpc, address, '0x18160ddd'),
    call(rpc, address, '0x313ce567'),
    call(rpc, address, '0x95d89b41'),
    call(rpc, address, '0x8da5cb5b'),
    jsonRpc<string>(rpc, 'eth_getStorageAt', [address, IMPLEMENTATION_SLOT, 'latest']).catch(() => ZERO),
  ]);
  if (!word(supplyRaw)) throw new AuditError('Contract does not implement ERC-20 totalSupply()', 422);

  const flags: Flag[] = [];
  const bytecode = code.toLowerCase();
  const seen = new Set<string>();
  for (const s of SELECTORS) {
    if (bytecode.includes(s.selector) && !seen.has(s.code)) {
      seen.add(s.code);
      flags.push({ code: s.code, severity: s.severity, message: s.message, points: s.points });
    }
  }

  const ownerWord = word(ownerRaw);
  const owner = ownerWord ? '0x' + ownerWord.slice(26) : null;
  if (owner && owner !== '0x' + '0'.repeat(40) && owner !== DEAD) {
    flags.push({ code: 'OWNER_ACTIVE', severity: 'medium', message: `Privileged owner ${owner} has not renounced control`, points: 12 });
  }
  const isProxy = implSlot !== ZERO && implSlot.length === 66;
  if (isProxy) flags.push({ code: 'PROXY', severity: 'medium', message: `EIP-1967 proxy, implementation ${'0x' + implSlot.slice(26)}`, points: 10 });

  const base = EVM_CHAINS[chain].blockscout;
  const [tokenInfo, holdersPage] = await Promise.all([
    blockscout<BlockscoutToken>(`${base}/api/v2/tokens/${address}`),
    blockscout<BlockscoutHolders>(`${base}/api/v2/tokens/${address}/holders`),
  ]);
  const totalSupply = BigInt(word(supplyRaw) as string);

  let holders: { address: string; amount: string; share: number }[] | null = null;
  if (holdersPage && totalSupply > 0n) {
    holders = holdersPage.items.slice(0, 10).map((h) => ({
      address: h.address.hash,
      amount: h.value,
      share: Number((BigInt(h.value) * 1_000_000n) / totalSupply) / 1_000_000,
    }));
    flags.push(...concentrationFlags(holders[0]?.share ?? 0, holders.reduce((a, h) => a + h.share, 0)));
  } else {
    flags.push({ code: 'HOLDER_DATA_UNAVAILABLE', severity: 'info', message: 'Holder distribution could not be retrieved from explorer', points: 0 });
  }

  return {
    chain,
    address,
    symbol: decodeString(symbolRaw),
    decimals: decimalsRaw ? Number(BigInt(word(decimalsRaw) as string)) : null,
    totalSupply: totalSupply.toString(),
    owner,
    isProxy,
    holdersCount: tokenInfo?.holders_count ? Number(tokenInfo.holders_count) : null,
    holders: holders ? { top10: holders, top10Share: holders.reduce((a, h) => a + h.share, 0) } : null,
    flags,
    ...scoreFlags(flags),
    asOf: new Date().toISOString(),
  };
}
