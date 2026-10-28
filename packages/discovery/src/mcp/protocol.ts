import { ALL_ROUTES } from '@tollgate/core';
import { planTask, WORKFLOWS, workflowPlan } from './planner';
import { callTool, TOOLS, type Dispatch } from './tools';

const PLAN_TOOL = {
  name: 'plan_task',
  description: 'FREE. Describe a job in plain language and get the best workflow and tools for it, with prices and ready-to-use inputs. Start here when you are not sure which tool to call.',
  inputSchema: { type: 'object', properties: { task: { type: 'string', description: 'What you want to do, e.g. buy this Solana token safely' } }, required: ['task'] },
  annotations: { readOnlyHint: true, openWorldHint: false },
};

const RESOURCES = [
  { uri: 'tollgate://catalog', name: 'Tool catalog', description: `All ${ALL_ROUTES.length} tools with prices and endpoints`, mimeType: 'application/json', path: '/app/catalog' },
  { uri: 'tollgate://llms', name: 'Agent guide', description: 'How to call and pay (llms.txt)', mimeType: 'text/markdown', path: '/llms.txt' },
  { uri: 'tollgate://market', name: 'Market snapshot', description: 'Crypto prices and Fear & Greed', mimeType: 'application/json', path: '/app/market' },
  { uri: 'tollgate://activity', name: 'Live activity', description: 'Agent request counts and top tools today', mimeType: 'application/json', path: '/app/stats' },
];

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
        capabilities: { tools: { listChanged: false }, prompts: { listChanged: false }, resources: { listChanged: false } },
        serverInfo: { name: 'agent-tollgate-engine', title: 'Agent Tollgate', version: '1.4.0' },
        instructions: `${ALL_ROUTES.length} pay-per-call tools (x402, USDC). Call plan_task (free) with your goal to get the right workflow, use prompts/get for multi-step workflows, then call tools; paid tools answer with payment instructions first.`,
      });
    case 'ping':
      return ok({});
    case 'tools/list':
      return ok({ tools: [PLAN_TOOL, ...TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema }))] });
    case 'tools/call': {
      const name = msg.params?.name;
      if (typeof name !== 'string') return fail(-32602, 'params.name required');
      const args = (msg.params?.arguments ?? {}) as Record<string, unknown>;
      if (name === 'plan_task') {
        const plan = planTask(String(args.task ?? ''));
        return ok({ content: [{ type: 'text', text: JSON.stringify(plan, null, 2) }], structuredContent: plan });
      }
      return ok(await callTool(name, args, dispatch));
    }
    case 'prompts/list':
      return ok({ prompts: Object.entries(WORKFLOWS).map(([name, w]) => ({ name, title: w.title, description: w.description, arguments: w.args })) });
    case 'prompts/get': {
      const name = String(msg.params?.name ?? '');
      const args = (msg.params?.arguments ?? {}) as Record<string, string>;
      const plan = workflowPlan(name, args);
      if (!plan) return fail(-32602, `Unknown prompt: ${name}`);
      const text = `Run this ${plan.title} workflow step by step with the Agent Tollgate tools. Stop and report if any step shows high risk.\n\n${plan.steps.map((s) => `${s.step}. ${s.tool} (${s.priceUsdc} USDC): ${s.why}\n   input: ${JSON.stringify(s.input)}`).join('\n')}\n\nEstimated cost: ${plan.estimatedCostUsdc} USDC.`;
      return ok({ description: WORKFLOWS[name]!.description, messages: [{ role: 'user', content: { type: 'text', text } }] });
    }
    case 'resources/list':
      return ok({ resources: RESOURCES.map(({ path: _p, ...r }) => r) });
    case 'resources/read': {
      const res = RESOURCES.find((r) => r.uri === msg.params?.uri);
      if (!res) return fail(-32602, 'Unknown resource');
      const body = await (await dispatch(res.path, { headers: { accept: res.mimeType } })).text();
      return ok({ contents: [{ uri: res.uri, mimeType: res.mimeType, text: body }] });
    }
    default:
      return fail(-32601, `Method not found: ${msg.method}`);
  }
}
