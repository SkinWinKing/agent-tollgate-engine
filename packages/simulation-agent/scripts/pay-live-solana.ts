import { createKeyPairSignerFromPrivateKeyBytes } from '@solana/kit';
import { toClientSvmSigner } from '@x402/svm';
import { ExactSvmScheme } from '@x402/svm/exact/client';
import { decodePaymentResponseHeader, wrapFetchWithPayment, x402Client } from '@x402/fetch';

const BASE_URL = (process.env.BASE_URL ?? 'https://skinwinking.com').replace(/\/+$/, '');
const seedHex = process.env.SOL_BURNER_SEED_HEX;
if (!seedHex || !/^[0-9a-f]{64}$/i.test(seedHex)) {
  console.error('SOL_BURNER_SEED_HEX missing or malformed');
  process.exit(1);
}

const keypair = await createKeyPairSignerFromPrivateKeyBytes(Uint8Array.from(Buffer.from(seedHex, 'hex')));
const client = new x402Client().register('solana:*', new ExactSvmScheme(toClientSvmSigner(keypair)));
const paidFetch = wrapFetchWithPayment(fetch, client);

const pair = process.argv[2] ?? 'SOL-USDT';
console.log(`payer ${keypair.address} -> ${BASE_URL}`);
const res = await paidFetch(`${BASE_URL}/api/v1/alpha/orderbook-imbalance?pair=${encodeURIComponent(pair)}`);
console.log('status', res.status);
const receipt = res.headers.get('payment-response') ?? res.headers.get('x-payment-response');
if (receipt) console.log('receipt', JSON.stringify(decodePaymentResponseHeader(receipt)));
const ext = res.headers.get('extension-responses');
if (ext) console.log('extension-responses', ext);
console.log((await res.text()).slice(0, 400));
