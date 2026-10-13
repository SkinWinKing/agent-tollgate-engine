import { x402Client, wrapFetchWithPayment, decodePaymentResponseHeader } from '@x402/fetch';
import { ExactEvmScheme, toClientEvmSigner } from '@x402/evm';
import { privateKeyToAccount } from 'viem/accounts';

const BASE_URL = (process.env.BASE_URL ?? 'https://skinwinking.com').replace(/\/+$/, '');
const key = process.env.BURNER_EVM_PRIVATE_KEY;
if (!key || !/^0x[0-9a-fA-F]{64}$/.test(key)) {
  console.error('BURNER_EVM_PRIVATE_KEY missing or malformed');
  process.exit(1);
}

const account = privateKeyToAccount(key as `0x${string}`);
const client = new x402Client().register('eip155:137', new ExactEvmScheme(toClientEvmSigner(account)));
const paidFetch = wrapFetchWithPayment(fetch, client);

const pair = process.argv[2] ?? 'SOL-USDT';
console.log(`payer ${account.address} -> ${BASE_URL}`);
const res = await paidFetch(`${BASE_URL}/api/v1/alpha/orderbook-imbalance?pair=${encodeURIComponent(pair)}`);
console.log('status', res.status);
const receipt = res.headers.get('payment-response') ?? res.headers.get('x-payment-response');
if (receipt) console.log('receipt', JSON.stringify(decodePaymentResponseHeader(receipt)));
const ext = res.headers.get('extension-responses');
if (ext) console.log('extension-responses', ext);
console.log((await res.text()).slice(0, 400));
