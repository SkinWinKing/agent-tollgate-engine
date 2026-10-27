import { ALL_ROUTES, unitsToUsdc, type RouteSpec } from '@tollgate/core';

const price = (r: RouteSpec) => (r.priceUnits === null ? 0 : Number(unitsToUsdc(r.priceUnits)));
const byId = new Map(ALL_ROUTES.map((r) => [r.id, r]));

/** Multi-step workflows an agent can run end to end. Each step names a tool; `{x}` placeholders come from arguments. */
export const WORKFLOWS: Record<string, { title: string; description: string; args: { name: string; description: string; required: boolean }[]; steps: { tool: string; why: string; input: Record<string, string> }[] }> = {
  safe_token_buy: {
    title: 'Safe token buy',
    description: 'Check a token for liquidity and rug-pull risk, screen the counterparty, then build the swap.',
    args: [
      { name: 'chain', description: 'solana, base, ethereum, polygon or arbitrum', required: true },
      { name: 'token', description: 'Token mint or contract address to buy', required: true },
      { name: 'wallet', description: 'Your wallet address (signer)', required: true },
    ],
    steps: [
      { tool: 'token_market', why: 'Liquidity, volume and buy/sell pressure', input: { chain: '{chain}', address: '{token}' } },
      { tool: 'token_audit', why: 'Mint/freeze authority, honeypot traits, holder concentration', input: { chain: '{chain}', address: '{token}' } },
      { tool: 'sanctions_check', why: 'Make sure your own wallet is not sanctioned before trading', input: { address: '{wallet}' } },
      { tool: 'router_quote_and_build', why: 'Best route and unsigned transaction with the rug check of the output token', input: { fromChain: '{chain}', toChain: '{chain}', inputToken: 'USDC', outputToken: '{token}', userAddress: '{wallet}' } },
    ],
  },
  wallet_due_diligence: {
    title: 'Wallet due diligence',
    description: 'Before paying or accepting funds: identity, sanctions, balances and account type.',
    args: [
      { name: 'address', description: 'Wallet address (EVM or Solana)', required: true },
      { name: 'chain', description: 'Chain of the address', required: true },
    ],
    steps: [
      { tool: 'sanctions_check', why: 'OFAC SDN screening', input: { address: '{address}' } },
      { tool: 'address_check', why: 'Wallet, contract, token mint or unused', input: { address: '{address}', chain: '{chain}' } },
      { tool: 'ens_resolve', why: 'Verified ENS name for EVM addresses', input: { name: '{address}' } },
      { tool: 'wallet_balance', why: 'Native and token balances', input: { chain: '{chain}', address: '{address}' } },
    ],
  },
  council: {
    title: 'Council verdict before a trade',
    description: 'Ask the seven-agent council, check for wash trading and hype, then size the position with Kelly.',
    args: [
      { name: 'chain', description: 'Token chain', required: true },
      { name: 'token', description: 'Token address', required: true },
      { name: 'bankroll', description: 'Trading bankroll in USD', required: false },
    ],
    steps: [
      { tool: 'council_verdict', why: 'Seven-agent vote with Guardian and Wash Detector vetoes', input: { chain: '{chain}', address: '{token}' } },
      { tool: 'wash_trading_check', why: 'Detail behind any fake-volume flags', input: { chain: '{chain}', address: '{token}' } },
      { tool: 'hype_signal', why: 'Attention and timing', input: { chain: '{chain}', address: '{token}' } },
      { tool: 'kelly_size', why: 'How much to risk if the council says buy', input: { winRate: '0.5', avgWin: '40', avgLoss: '20', bankroll: '{bankroll}', stopLossPct: '20' } },
    ],
  },
  market_brief: {
    title: 'Market brief',
    description: 'Price, trend, momentum, derivatives positioning and sentiment for an asset.',
    args: [{ name: 'symbol', description: 'Asset symbol, e.g. SOL', required: true }],
    steps: [
      { tool: 'crypto_price', why: 'Spot price and 24h change', input: { symbols: '{symbol}' } },
      { tool: 'technical_indicators', why: 'RSI, MACD, moving averages, volatility and signal', input: { pair: '{symbol}-USDT', interval: '4h' } },
      { tool: 'orderbook_imbalance', why: 'Liquidity walls and order-book skew', input: { pair: '{symbol}-USDT' } },
      { tool: 'funding_rates', why: 'Perp funding and open interest', input: { symbol: '{symbol}' } },
      { tool: 'fear_greed', why: 'Market-wide sentiment', input: {} },
    ],
  },
  site_recon: {
    title: 'Website and domain recon',
    description: 'Is a domain safe and well run? Reputation, age, DNS, email security, certificates and HTTP posture.',
    args: [{ name: 'domain', description: 'Domain, e.g. example.com', required: true }],
    steps: [
      { tool: 'domain_reputation', why: 'Phishing/malware verdict and age', input: { domain: '{domain}' } },
      { tool: 'whois', why: 'Registrar and registration dates', input: { domain: '{domain}' } },
      { tool: 'domain_email_security', why: 'SPF, DMARC and MX posture', input: { domain: '{domain}' } },
      { tool: 'ssl_certificates', why: 'Certificates and subdomains from CT logs', input: { domain: '{domain}' } },
      { tool: 'http_check', why: 'Status, redirects and security headers', input: { url: 'https://{domain}' } },
    ],
  },
  research_brief: {
    title: 'Research brief',
    description: 'Collect sources on a topic from Hacker News, arXiv and Wikipedia, then summarize.',
    args: [{ name: 'topic', description: 'Topic to research', required: true }],
    steps: [
      { tool: 'wikipedia', why: 'Background', input: { q: '{topic}' } },
      { tool: 'hn_search', why: 'Practitioner discussion', input: { q: '{topic}' } },
      { tool: 'arxiv_search', why: 'Recent papers', input: { q: '{topic}', sort: 'date' } },
      { tool: 'ai_summarize', why: 'Condense the collected text', input: { text: '<concatenate the results above>' } },
    ],
  },
};

const fill = (input: Record<string, string>, args: Record<string, string>) =>
  Object.fromEntries(Object.entries(input).map(([k, v]) => [k, v.replace(/\{(\w+)\}/g, (_, n: string) => args[n] ?? `{${n}}`)]));

export function workflowPlan(name: string, args: Record<string, string>) {
  const wf = WORKFLOWS[name];
  if (!wf) return null;
  const steps = wf.steps.map((s, i) => {
    const r = byId.get(s.tool);
    return { step: i + 1, tool: s.tool, why: s.why, method: r?.method, path: r?.path, priceUsdc: r ? price(r) : null, input: fill(s.input, args) };
  });
  return { workflow: name, title: wf.title, steps, estimatedCostUsdc: Number(steps.reduce((a, s) => a + (s.priceUsdc ?? 0), 0).toFixed(4)) };
}

/** Free planner: matches a plain-language task to a workflow or to the best single tools. */
export function planTask(task: string) {
  const t = task.toLowerCase();
  const pick =
    /(council|vote|consensus|should i (buy|trade)|verdict)/.test(t) ? 'council'
    : /(buy|ape|swap|trade).*(token|coin|meme)|rug|honeypot/.test(t) ? 'safe_token_buy'
    : /(wallet|address).*(check|safe|sanction|who)|sanction|kyc|counterparty/.test(t) ? 'wallet_due_diligence'
    : /(price|market|trend|rsi|macd|funding|sentiment|analy[sz])/.test(t) ? 'market_brief'
    : /(domain|website|site|phish|dns|ssl|certificate|dmarc|spf)/.test(t) ? 'site_recon'
    : /(research|paper|summar|learn about|explain)/.test(t) ? 'research_brief'
    : null;
  const words = t.match(/[a-z0-9]{3,}/g) ?? [];
  const tools = ALL_ROUTES.map((r) => ({ r, score: words.reduce((s, w) => s + (`${r.id} ${r.summary} ${r.description}`.toLowerCase().includes(w) ? (r.id.includes(w) ? 3 : 1) : 0), 0) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)
    .map(({ r }) => ({ tool: r.id, method: r.method, path: r.path, priceUsdc: price(r), summary: r.summary }));
  return {
    task,
    suggestedWorkflow: pick ? { name: pick, title: WORKFLOWS[pick]!.title, description: WORKFLOWS[pick]!.description, args: WORKFLOWS[pick]!.args, getWith: `prompts/get name=${pick}` } : null,
    matchingTools: tools,
    howToPay: 'Each tool answers HTTP 402 first; pay in USDC over x402 (Base, Polygon, Solana) and retry, or pass paymentProof in tools/call.',
  };
}
