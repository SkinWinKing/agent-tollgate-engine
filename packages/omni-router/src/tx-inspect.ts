import { getAddressDecoder } from '@solana/kit';

function readShortVec(bytes: Uint8Array, offset: number): [number, number] {
  let value = 0;
  let shift = 0;
  let pos = offset;
  for (;;) {
    const byte = bytes[pos++];
    if (byte === undefined) throw new Error('truncated shortvec');
    value |= (byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) return [value, pos];
    shift += 7;
  }
}

export function staticAccountKeys(base64Tx: string): string[] {
  const bytes = Uint8Array.from(atob(base64Tx), (c) => c.charCodeAt(0));
  const [sigCount, afterSigs] = readShortVec(bytes, 0);
  let pos = afterSigs + sigCount * 64;
  if (((bytes[pos] ?? 0) & 0x80) !== 0) pos += 1;
  pos += 3;
  const [keyCount, keysStart] = readShortVec(bytes, pos);
  const decoder = getAddressDecoder();
  const keys: string[] = [];
  for (let i = 0; i < keyCount; i++) {
    keys.push(decoder.decode(bytes.slice(keysStart + i * 32, keysStart + (i + 1) * 32)));
  }
  return keys;
}
