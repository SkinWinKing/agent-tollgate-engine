import { callTool, TOOLS, type Dispatch } from './tools';

interface RpcRequest {
  jsonrpc: '2.0';
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

export interface RpcResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string };
}

const PROTOCOL_VERSION = '2025-06-18';

export async function handleRpc(msg: RpcRequest, dispatch: Dispatch): Promise<RpcResponse | null> {
  const id = msg.id ?? null;
  const ok = (result: unknown): RpcResponse => ({ jsonrpc: '2.0', id, result });
  const fail = (code: number, message: string): RpcResponse => ({ jsonrpc: '2.0', id, error: { code, message } });

  if (msg.id === undefined) return null;

  switch (msg.method) {
    case 'initialize':
      return ok({
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: 'agent-tollgate-engine', version: '1.0.0' },
      });
    case 'ping':
      return ok({});
    case 'tools/list':
      return ok({ tools: TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) });
    case 'tools/call': {
      const name = msg.params?.name;
      if (typeof name !== 'string') return fail(-32602, 'params.name required');
      const args = (msg.params?.arguments ?? {}) as Record<string, unknown>;
      return ok(await callTool(name, args, dispatch));
    }
    default:
      return fail(-32601, `Method not found: ${msg.method}`);
  }
}
