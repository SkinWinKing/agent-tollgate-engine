import { jsonRpc } from '@tollgate/core';
import { address, getAddressEncoder, getProgramDerivedAddress } from '@solana/kit';

export const TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
export const TOKEN_2022_PROGRAM = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb';
const ASSOCIATED_TOKEN_PROGRAM = 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL';

export async function tokenProgramOf(rpcUrl: string, mint: string): Promise<string> {
  const info = await jsonRpc<{ value: { owner: string } | null }>(rpcUrl, 'getAccountInfo', [
    mint,
    { encoding: 'base64', dataSlice: { offset: 0, length: 0 }, commitment: 'confirmed' },
  ]);
  if (!info.value) return TOKEN_PROGRAM;
  return info.value.owner === TOKEN_2022_PROGRAM ? TOKEN_2022_PROGRAM : TOKEN_PROGRAM;
}

export async function associatedTokenAddress(owner: string, mint: string, tokenProgram: string): Promise<string> {
  const encoder = getAddressEncoder();
  const [pda] = await getProgramDerivedAddress({
    programAddress: address(ASSOCIATED_TOKEN_PROGRAM),
    seeds: [encoder.encode(address(owner)), encoder.encode(address(tokenProgram)), encoder.encode(address(mint))],
  });
  return pda;
}

export async function accountExists(rpcUrl: string, account: string): Promise<boolean> {
  const info = await jsonRpc<{ value: unknown | null }>(rpcUrl, 'getAccountInfo', [
    account,
    { encoding: 'base64', dataSlice: { offset: 0, length: 0 }, commitment: 'confirmed' },
  ]);
  return info.value !== null;
}
