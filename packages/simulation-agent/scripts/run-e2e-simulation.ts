import { ROUTES, signSimulationReceipt, unitsToUsdc } from '@tollgate/core';
import { staticAccountKeys } from '@tollgate/omni-router';

const BASE_URL = (process.env.BASE_URL ?? 'http://127.0.0.1:8787').replace(/\/+$/, '');
const SIM_SECRET = process.env.SIM_SECRET ?? 'dev-simulation-secret';
const USER_SOL = process.env.SIM_USER_SOL ?? 'DSvMhichkVACpR89fmuN2m1UZry8AgNb1QXFZetmDmT1';
const USER_EVM = process.env.SIM_USER_EVM ?? '0x64f0117D37DDf366405747D7f9520851907fd077';

const log = (step: string, msg: string) => console.log(`[${step}] ${msg}`);
const ledger: { label: string; usdc: string; direction: 'in' | 'pending' }[] = [];

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
}

interface Challenge {
  nonce: string;
  price: { amount: string; baseUnits: string };
  accepts: { network: string; payTo: string; asset: string; maxAmountRequired: string }[];
}

async function stepA(): Promise<Challenge> {
  const res = await fetch(`${BASE_URL}${ROUTES.orderbook.path}?pair=SOL-USDT`);
  assert(res.status === 402, `expected 402 without payment, got ${res.status}`);
  const challenge = (await res.json()) as Challenge;
  assert(challenge.accepts.length > 0, '402 body has no accepted networks');
  log('A', `402 Payment Required: ${challenge.price.amount} USDC, nonce ${challenge.nonce}`);
  for (const a of challenge.accepts) log('A', `  accepts ${a.network}: payTo ${a.payTo} amount ${a.maxAmountRequired} units`);
  return challenge;
}

async function stepB(challenge: Challenge): Promise<string> {
  const units = Number(challenge.price.baseUnits);
  const receipt = await signSimulationReceipt(SIM_SECRET, units);
  log('B', `signed simulated micropayment of ${unitsToUsdc(units)} USDC -> ${challenge.accepts[0]?.payTo}`);

  const res = await fetch(`${BASE_URL}${ROUTES.orderbook.path}?pair=SOL-USDT`, { headers: { authorization: `Bearer ${receipt}` } });
  const raw = await res.text();
  assert(res.status === 200, `paid request failed: ${res.status} ${raw}`);
  const data = JSON.parse(raw) as { venue: string; mid: number; skew: number; signal: string; bands: { bps: number; imbalance: number }[] };
  log('B', `signal ${data.signal} skew ${data.skew} mid ${data.mid} venue ${data.venue}`);
  ledger.push({ label: 'orderbook-imbalance micropayment', usdc: unitsToUsdc(units), direction: 'in' });

  const replay = await fetch(`${BASE_URL}${ROUTES.orderbook.path}?pair=SOL-USDT`, { headers: { authorization: `Bearer ${receipt}` } });
  const replayBody = (await replay.json()) as { error: string };
  assert(replay.status === 402 && replayBody.error === 'PAYMENT_ALREADY_USED', `replay must be rejected, got ${replay.status} ${replayBody.error}`);
  log('B', 'replay of the same receipt rejected: PAYMENT_ALREADY_USED');
  return receipt;
}

interface QuoteBody {
  route: string;
  unsignedTransaction: { serialized?: string };
  quote: { inAmount?: string; outAmount?: string; toAmount?: string };
  fee: { bps: number; amount: string | null; recipient: string; recipientOwner: string; verifiedInQuote: boolean; mechanism: string };
}

async function postQuote(body: Record<string, unknown>): Promise<QuoteBody> {
  const res = await fetch(`${BASE_URL}${ROUTES.quote.path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  assert(res.status === 200, `quote failed: ${res.status} ${text}`);
  return JSON.parse(text) as QuoteBody;
}

async function stepC(): Promise<void> {
  const sol = await postQuote({
    fromChain: 'solana',
    toChain: 'solana',
    inputToken: 'SOL',
    outputToken: 'USDC',
    amount: '1000000000',
    userAddress: USER_SOL,
    priority: 'turbo',
  });
  assert(sol.route === 'jupiter', 'expected jupiter route');
  assert(sol.fee.bps === 30, `fee bps must be 30, got ${sol.fee.bps}`);
  assert(sol.fee.verifiedInQuote, 'Jupiter quote does not carry 30 bps platform fee');
  assert(sol.unsignedTransaction.serialized, 'no serialized transaction');
  const keys = staticAccountKeys(sol.unsignedTransaction.serialized);
  assert(keys.includes(sol.fee.recipient), `fee account ${sol.fee.recipient} not present in final transaction`);
  log('C', `jupiter: 1 SOL -> ${sol.quote.outAmount} USDC units, platform fee ${sol.fee.amount} units (${sol.fee.bps} bps)`);
  log('C', `fee account ${sol.fee.recipient} (owner ${sol.fee.recipientOwner}) verified inside the built transaction (${keys.length} static accounts)`);
  ledger.push({ label: 'solana swap fee (output token units)', usdc: `${sol.fee.amount} units of USDC`, direction: 'pending' });

  const cross = await postQuote({
    fromChain: 'polygon',
    toChain: 'base',
    inputToken: 'USDC',
    outputToken: 'USDC',
    amount: '100000000',
    userAddress: USER_EVM,
    priority: 'fast',
  });
  assert(cross.route === 'lifi', 'expected lifi route');
  assert(cross.fee.bps === 30, `fee bps must be 30, got ${cross.fee.bps}`);
  assert(cross.fee.verifiedInQuote, 'LI.FI quote does not list the 30 bps integrator fee (register the integrator in the LI.FI portal)');
  log('C', `lifi: 100 USDC polygon -> base, receive ${cross.quote.toAmount} units, integrator fee ${cross.fee.amount} units (${cross.fee.bps} bps)`);
  ledger.push({ label: 'cross-chain swap fee', usdc: `${cross.fee.amount} units`, direction: 'pending' });
}

function stepD(): void {
  log('D', 'money flow');
  for (const l of ledger) console.log(`     ${l.direction === 'in' ? '+' : '~'} ${l.label}: ${l.usdc}${l.direction === 'in' ? ' USDC (settled)' : ' (accrues on execution by the agent)'}`);
}

const challenge = await stepA();
await stepB(challenge);
await stepC();
stepD();
log('OK', 'simulation passed');
