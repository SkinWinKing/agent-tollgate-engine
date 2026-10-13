export class RpcError extends Error {
  constructor(message: string, readonly code?: number) {
    super(message);
  }
}

export async function jsonRpc<T>(url: string, method: string, params: unknown[], timeoutMs = 8000): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new RpcError(`RPC ${method} HTTP ${res.status}`);
  const body = (await res.json()) as { result?: T; error?: { code: number; message: string } };
  if (body.error) throw new RpcError(`RPC ${method}: ${body.error.message}`, body.error.code);
  return body.result as T;
}
