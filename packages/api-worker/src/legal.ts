import { Hono } from 'hono';
import type { AppEnv } from './env';
import { SKW_CREST_WEBP, SKW_ICON_WEBP } from './brand';

/** Brand assets and the human pages linked from the footer: about, contact, privacy, terms, cookies, risk. */
export const legal = new Hono<AppEnv>();

const EFFECTIVE = '27 October 2026';
const CONTACT = 'support@skinwinking.com';

const webp = (b64: string) => {
  const bin = atob(b64);
  return Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
};
const CREST = webp(SKW_CREST_WEBP);
const ICON = webp(SKW_ICON_WEBP);

legal.get('/brand/skw.webp', (c) => c.body(new Uint8Array(CREST), 200, { 'content-type': 'image/webp', 'cache-control': 'public, max-age=604800, immutable' }));
legal.get('/brand/skw-icon.webp', (c) => c.body(new Uint8Array(ICON), 200, { 'content-type': 'image/webp', 'cache-control': 'public, max-age=604800, immutable' }));

const PAGES: Record<string, { title: string; body: string }> = {
  about: {
    title: 'About us',
    body: `<p><b>SKW Trading Market &amp; Tollgate for Agents</b> is run by the SKW (SkinWinKing) team. It has two parts.</p>
<h2>For people</h2>
<p>A trading terminal for Solana tokens with live charts, a rug-pull check on every order and best-price routing through Jupiter. A cross-chain swap covers Ethereum, Base, Arbitrum and Polygon through LI.FI. You connect your own wallet and sign every transaction yourself. We never hold your funds or your keys.</p>
<h2>For AI agents</h2>
<p>More than a hundred pay-per-call tools that autonomous agents use without accounts or API keys. Market data, token audits, sanctions screening, web and document tools, threat intelligence and AI. Agents pay a fraction of a cent in USDC per call over the open <a href="https://x402.org">x402</a> standard on Base, Polygon or Solana. The same tools are on our MCP server at <code>/mcp</code>.</p>
<h2>Agentic trading</h2>
<p>The Agentic trading page shows real agent traffic as it happens: every call becomes a tone, a wave and a point in the resonance field. It is a visualization of real requests, not investment advice and not a trading signal.</p>
<h2>How we earn</h2>
<p>A 0.3% platform fee is built into each swap route and shown before you sign. Agents pay the listed price per tool call. We do not sell data and we show no ads.</p>`,
  },
  contact: {
    title: 'Contact',
    body: `<p>Email: <a href="mailto:${CONTACT}">${CONTACT}</a></p>
<p>We answer within two business days. For a transaction, include the transaction hash and the chain. Never send us your seed phrase or private key. No one from SKW will ever ask for them.</p>
<p>Security reports: see <a href="/.well-known/security.txt">security.txt</a>.</p>`,
  },
  privacy: {
    title: 'Privacy Policy',
    body: `<p>This policy explains what data SKW Trading Market &amp; Tollgate for Agents ("we") processes when you use skinwinking.com. Contact: <a href="mailto:${CONTACT}">${CONTACT}</a>.</p>
<h2>What we process</h2>
<ul>
<li><b>Wallet address.</b> When you sign in, you sign a message with your wallet. We store your public address in a signed session cookie so the site knows you are signed in. We never receive your private key or seed phrase.</li>
<li><b>Swap requests.</b> To build a route we send the tokens, amount and your public address to routing providers (Jupiter for Solana, LI.FI for EVM chains). The transaction is signed in your wallet and broadcast to a public blockchain, where it is visible to everyone.</li>
<li><b>Paid tool calls.</b> For agents that pay over x402 we record the tool, the price, the paying address and the transaction reference. This is our sales record.</li>
<li><b>Usage statistics.</b> We count requests per tool and per day. The public dashboards show aggregated counts only, never wallets or IP addresses.</li>
<li><b>Technical data.</b> Our hosting provider, Cloudflare, processes IP addresses and request metadata to deliver the site and protect it from abuse.</li>
</ul>
<h2>Why</h2>
<p>To provide the service you request (sign-in, quotes, tool calls), to keep it secure, to keep accounting records and to meet legal obligations.</p>
<h2>Sharing</h2>
<p>We share data only with the providers needed to run the service: Cloudflare (hosting, storage), Jupiter and LI.FI (routing), and public blockchain RPC and data providers. We do not sell personal data and we do not use advertising trackers.</p>
<h2>Retention</h2>
<p>Session cookies expire after at most 7 days or when you sign out. Sales records are kept as long as accounting law requires. Aggregated statistics contain no personal data.</p>
<h2>Your rights</h2>
<p>You can ask for access, correction, deletion or restriction of your personal data, object to processing, and complain to your data protection authority. Write to <a href="mailto:${CONTACT}">${CONTACT}</a>. Data written to a public blockchain cannot be deleted by anyone.</p>`,
  },
  terms: {
    title: 'Terms of Service',
    body: `<p>By using skinwinking.com you agree to these terms.</p>
<h2>The service</h2>
<p>We provide software: market data, token risk checks, routing quotes and unsigned transactions, and pay-per-call tools for AI agents. We are not a broker, exchange, custodian or investment adviser. We never hold your assets or keys.</p>
<h2>Your wallet, your responsibility</h2>
<p>You sign every transaction yourself. Check the details in your wallet before signing. Blockchain transactions are final and cannot be reversed by us.</p>
<h2>Fees</h2>
<p>A 0.3% platform fee is included in each swap route and shown before you sign. Network fees go to the blockchain. Agent tools cost the price listed in the catalog, paid in USDC per call. Payments are final once settled on chain.</p>
<h2>No advice</h2>
<p>Prices, risk scores, council verdicts and visualizations are information, not financial advice. Risk checks lower risk but cannot remove it. A token rated low risk can still lose its value.</p>
<h2>Acceptable use</h2>
<p>Do not use the service for money laundering, sanctions evasion, market manipulation, attacks on the service or anything illegal where you are. You must be of legal age and allowed to use crypto-asset services in your country. We may block access to protect the service or comply with law.</p>
<h2>Availability and liability</h2>
<p>The service is provided as is. Third-party providers (routers, RPCs, data sources) can fail or be wrong. To the extent the law allows, we are not liable for indirect losses, lost profits or losses caused by your own wallet, third parties or market movements.</p>
<h2>Changes</h2>
<p>We may update these terms. The date at the top shows the current version.</p>
<p>Questions: <a href="mailto:${CONTACT}">${CONTACT}</a></p>`,
  },
  cookies: {
    title: 'Cookie Policy',
    body: `<p>We use one cookie, and only after you sign in with your wallet:</p>
<table><tr><th>Name</th><th>Purpose</th><th>Duration</th></tr><tr><td><code>tg_session</code></td><td>Keeps you signed in. Contains your public wallet address and a signature. HttpOnly, Secure, SameSite.</td><td>Up to 7 days or until you sign out</td></tr></table>
<p>It is strictly necessary for the service you request, so no consent banner is needed. We use no advertising or tracking cookies. Your browser may also store small preferences, such as the selected chart interval, locally on your device.</p>`,
  },
  risk: {
    title: 'Risk Disclosure',
    body: `<p>Crypto-assets are highly volatile and you can lose all the money you put in. Only trade what you can afford to lose.</p>
<ul>
<li><b>Token risk.</b> New tokens can be scams, honeypots or rug pulls. Our checks look for known warning signs but cannot catch everything.</li>
<li><b>Price impact and slippage.</b> Thin markets move against large orders. Check the quoted amount before signing.</li>
<li><b>Smart contract and bridge risk.</b> DEXs, aggregators and bridges are third-party code that can fail or be exploited.</li>
<li><b>Final transactions.</b> A signed transaction cannot be undone. Sending to a wrong address means the funds are lost.</li>
<li><b>Wallet security.</b> Anyone with your seed phrase controls your funds. Keep it offline and never share it.</li>
<li><b>No protection schemes.</b> Crypto-assets are not covered by deposit guarantee or investor compensation schemes.</li>
<li><b>Regulation and tax.</b> Rules differ by country and change. You are responsible for your own taxes.</li>
</ul>
<p>Nothing on this site is investment advice.</p>`,
  },
};

const STYLE = `:root{color-scheme:dark}body{margin:0;background:#000;color:#e9e9ee;font:16px/1.65 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
a{color:#3ab8ff}header{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px clamp(16px,3vw,32px);border-bottom:1px solid #1d1d22}
.brand{display:flex;align-items:center;gap:10px;color:#fff;font-weight:700;text-decoration:none}.brand img{height:32px;width:auto}.brand span{color:#f5c542}
main{max-width:760px;margin:0 auto;padding:28px 16px 40px}h1{margin:0 0 4px;font-size:clamp(28px,5vw,40px);color:#f5c542}h2{margin:28px 0 8px;font-size:20px;color:#fff}
.eff{color:#8b8b96;font-size:14px;margin:0 0 24px}li{margin:6px 0}table{border-collapse:collapse;width:100%;font-size:14px}td,th{border:1px solid #23232a;padding:8px;text-align:left;vertical-align:top}
code{background:#121216;padding:1px 6px;border-radius:5px}footer{border-top:1px solid #1d1d22;padding:18px 16px;text-align:center;color:#8b8b96;font-size:14px}footer a{margin:0 6px}`;

const NAV = [
  ['about', 'About us'],
  ['contact', 'Contact'],
  ['privacy', 'Privacy Policy'],
  ['terms', 'Terms of Service'],
  ['cookies', 'Cookies'],
  ['risk', 'Risk Disclosure'],
];

const page = (slug: string, p: { title: string; body: string }) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${p.title} · SKW Trading Market</title><link rel="icon" href="/brand/skw-icon.webp" type="image/webp"><link rel="canonical" href="https://skinwinking.com/${slug}"><style>${STYLE}</style></head><body>
<header><a class="brand" href="/"><img src="/brand/skw-icon.webp" alt="SKW" width="48" height="32">SKW <span>Trading Market</span></a><a href="/">← Back to the market</a></header>
<main><h1>${p.title}</h1><p class="eff">Effective ${EFFECTIVE}</p>${p.body}</main>
<footer>${NAV.map(([s, t]) => `<a href="/${s}">${t}</a>`).join('')}<div>© 2026 SKW · SkinWinKing · non-custodial</div></footer></body></html>`;

export const LEGAL_PATHS = Object.keys(PAGES).map((s) => `/${s}`);

for (const [slug, p] of Object.entries(PAGES)) {
  const html = page(slug, p);
  legal.get(`/${slug}`, (c) => c.html(html, 200, { 'cache-control': 'public, max-age=3600' }));
}
