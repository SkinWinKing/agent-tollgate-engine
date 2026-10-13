import { ROUTES, type RouteSpec } from '@tollgate/core';

export type Dispatch = (path: string, init?: RequestInit) => Promise<Response>;

export interface ToolResult {
  content: { type: 'text'; text: string }[];
  isError?: boolean;
}

interface ToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  route: RouteSpec;
}

const proofProperty = {
  paymentProof: {
    type: 'string',
    description:
      'Payment proof: Polygon USDC tx hash (0x...) or Solana tx signature. Omit on the first call to receive the 402 payment instructions, pay, then call again with the proof.',
  },
};

const withProof = (route: RouteSpec) => {
  const s = route.input.schema;
  return route.priceUnits === null ? s : { ...s, properties: { ...s.properties, ...proofProperty } };
};

export const TOOLS: ToolDef[] = [
  {
    name: 'orderbook_imbalance',
    description: `${ROUTES.orderbook.description} Paid: 0.02 USDC per call via x402.`,
    inputSchema: withProof(ROUTES.orderbook),
    route: ROUTES.orderbook,
  },
  {
    name: 'token_audit',
    description: `${ROUTES.tokenAudit.description} Paid: 0.20 USDC per call via x402.`,
    inputSchema: withProof(ROUTES.tokenAudit),
    route: ROUTES.tokenAudit,
  },
  {
    name: 'swap_quote_and_build',
    description: ROUTES.quote.description,
    inputSchema: withProof(ROUTES.quote),
    route: ROUTES.quote,
  },
];

export async function callTool(name: string, args: Record<string, unknown>, dispatch: Dispatch): Promise<ToolResult> {
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) return { isError: true, content: [{ type: 'text', text: `Unknown tool: ${name}` }] };

  const { paymentProof, ...input } = args;
  const headers: Record<string, string> = { accept: 'application/json' };
  if (typeof paymentProof === 'string' && paymentProof) headers.authorization = `Bearer ${paymentProof}`;

  let res: Response;
  if (tool.route.method === 'GET') {
    const qs = new URLSearchParams(Object.entries(input).map(([k, v]) => [k, String(v)]));
    res = await dispatch(`${tool.route.path}?${qs}`, { headers });
  } else {
    res = await dispatch(tool.route.path, {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify(input),
    });
  }
  const text = await res.text();
  if (res.status === 402) {
    return { content: [{ type: 'text', text: `HTTP 402 Payment Required. Pay as instructed, then retry with paymentProof.\n${text}` }] };
  }
  return { isError: !res.ok, content: [{ type: 'text', text }] };
}
