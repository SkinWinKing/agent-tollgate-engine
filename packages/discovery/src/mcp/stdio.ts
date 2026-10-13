import { createInterface } from 'node:readline';
import { handleRpc } from './protocol';

const baseUrl = (process.env.BASE_URL ?? 'http://127.0.0.1:8787').replace(/\/+$/, '');

const dispatch = (path: string, init?: RequestInit) => fetch(`${baseUrl}${path}`, init);

const rl = createInterface({ input: process.stdin });
rl.on('line', async (line) => {
  if (!line.trim()) return;
  let response;
  try {
    response = await handleRpc(JSON.parse(line), dispatch);
  } catch {
    response = { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } };
  }
  if (response) process.stdout.write(JSON.stringify(response) + '\n');
});
