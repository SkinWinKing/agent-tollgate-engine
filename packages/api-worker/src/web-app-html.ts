// Single-page app served at / (for browsers) and /app. Inline so the Worker has no static-asset dependency.
export const APP_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Agent Tollgate — pay-per-call tools for AI agents</title>
<meta name="description" content="68 pay-per-call tools for AI agents over x402, live agent activity, and a non-custodial swap with rug-pull checks. Sign in with Phantom or MetaMask.">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="alternate" type="text/markdown" href="/llms.txt">
<style>
:root{--bg:#000;--panel:#0b0b0d;--line:#2b2618;--text:#ffffff;--muted:#c0c4cc;--acc:#f5c542;--gold2:#ffdf7e;--silver:#d9dde3;--neon:#39ff88;--warn:#ffb020;--bad:#ff4d5e;--blue:#d9dde3}
*{box-sizing:border-box}body{margin:0;background:radial-gradient(1100px 520px at 80% -10%,rgba(245,197,66,.10),transparent 60%),radial-gradient(900px 500px at -10% 25%,rgba(217,221,227,.06),transparent 60%),#000;color:var(--text);font:15px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;min-height:100vh}
#bg{position:fixed;inset:0;width:100%;height:100%;z-index:0;pointer-events:none;opacity:.9}header,main{position:relative;z-index:1}
.hero{padding:42px 0 18px;text-align:center}.hero h1{font-size:clamp(28px,5vw,52px);line-height:1.05;margin:0 0 12px;letter-spacing:-.02em;background:linear-gradient(90deg,#ffffff 0%,#ffdf7e 30%,#f5c542 50%,#d9dde3 75%,#ffffff 100%);background-size:200% auto;animation:shine 6s linear infinite;-webkit-background-clip:text;background-clip:text;color:transparent;filter:drop-shadow(0 0 18px rgba(245,197,66,.35))}
@keyframes shine{to{background-position:200% center}}
.hero p{color:var(--muted);max-width:640px;margin:0 auto 18px;font-size:16px}.cta{display:flex;gap:10px;justify-content:center;flex-wrap:wrap}
.card{backdrop-filter:blur(10px);background:linear-gradient(180deg,rgba(18,18,20,.88),rgba(8,8,10,.7))!important;border-color:rgba(245,197,66,.18)!important;box-shadow:0 0 0 1px rgba(217,221,227,.04),0 10px 30px rgba(0,0,0,.6);transition:transform .2s,box-shadow .2s}.card:hover{transform:translateY(-2px);box-shadow:0 0 0 1px rgba(245,197,66,.45),0 0 24px rgba(245,197,66,.18)}
.spectrum{display:flex;align-items:flex-end;gap:8px;height:170px;padding-top:10px}.bar{flex:1;display:flex;flex-direction:column;align-items:center;gap:6px;min-width:0}.bar i{display:block;width:100%;border-radius:8px 8px 3px 3px;background:linear-gradient(180deg,#fff6d5,#f5c542 35%,#8a6a12);box-shadow:0 0 18px rgba(245,197,66,.45);transition:height 1s cubic-bezier(.2,.8,.2,1);animation:eq 1.4s ease-in-out infinite alternate}.bar span{font-size:11px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}
@keyframes eq{from{filter:brightness(.85)}to{filter:brightness(1.25)}}
.spark{width:100%;height:120px}.glow{color:var(--gold2);text-shadow:0 0 18px rgba(245,197,66,.6)}
.v{color:#fff;text-shadow:0 0 12px rgba(255,255,255,.12)}h2{background:linear-gradient(90deg,#d9dde3,#ffffff);-webkit-background-clip:text;background-clip:text;color:transparent}
.brand{color:#fff}.brand svg rect{fill:#0b0b0d}.brand svg path{stroke:#f5c542}nav button.on{color:var(--gold2)!important;box-shadow:inset 0 -2px 0 var(--acc)}
.live{background:var(--neon)!important;box-shadow:0 0 10px var(--neon)}.ok{color:var(--neon)!important}
a{color:var(--blue)}header{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 20px;border-bottom:1px solid var(--line);position:sticky;top:0;background:rgba(0,0,0,.88);backdrop-filter:blur(6px);z-index:5}
.brand{display:flex;align-items:center;gap:10px;font-weight:700}.brand svg{width:28px;height:28px}
nav{display:flex;gap:4px}nav button{background:none;border:0;color:var(--muted);padding:8px 12px;border-radius:8px;cursor:pointer;font:inherit}nav button.on{background:var(--panel);color:var(--text)}
main{max-width:1100px;margin:0 auto;padding:20px}section{display:none}section.on{display:block}
.grid{display:grid;gap:14px;grid-template-columns:repeat(auto-fit,minmax(220px,1fr))}
.card{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:16px}
.k{color:var(--muted);font-size:13px}.v{font-size:26px;font-weight:700;margin-top:4px}.live{display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--acc);margin-right:6px;animation:p 1.6s infinite}
@keyframes p{50%{opacity:.3}}h2{font-size:17px;margin:22px 0 10px}
table{width:100%;border-collapse:collapse}td,th{padding:8px;border-bottom:1px solid var(--line);text-align:left;font-size:14px}th{color:var(--muted);font-weight:500}
.btn{background:linear-gradient(180deg,#ffe9a8,#f5c542 55%,#c99a1a);color:#120d00;border:0;border-radius:10px;padding:10px 16px;font:700 14px system-ui;cursor:pointer;box-shadow:0 0 0 1px rgba(255,223,126,.6),0 0 18px rgba(245,197,66,.45);transition:box-shadow .2s,transform .2s}.btn:hover{transform:translateY(-1px);box-shadow:0 0 0 1px #ffdf7e,0 0 28px rgba(245,197,66,.7)}.btn.sec{background:linear-gradient(180deg,#1a1a1d,#0b0b0d);color:var(--silver);border:1px solid rgba(217,221,227,.35);box-shadow:0 0 12px rgba(217,221,227,.12)}.btn.sec:hover{color:#fff;box-shadow:0 0 18px rgba(217,221,227,.3)}.btn:disabled{opacity:.5;cursor:not-allowed}
input,select{background:#050506;color:var(--text);border:1px solid var(--line);border-radius:10px;padding:10px;font:inherit;width:100%}
label{display:block;color:var(--muted);font-size:13px;margin:10px 0 4px}.row{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.note{color:var(--muted);font-size:13px}.ok{color:var(--acc)}.warn{color:var(--warn)}.bad{color:var(--bad)}
.pill{display:inline-block;border:1px solid var(--line);border-radius:999px;padding:2px 8px;font-size:12px;color:var(--muted)}
code{background:#111113;color:var(--gold2);padding:2px 6px;border-radius:6px;font-size:13px}#who{font-size:13px;color:var(--muted)}
#wm{position:fixed;inset:0;background:rgba(0,0,0,.72);backdrop-filter:blur(6px);display:none;align-items:center;justify-content:center;z-index:20}#wm.on{display:flex}
.wmbox{width:min(440px,92vw);background:linear-gradient(180deg,#121214,#070708);border:1px solid rgba(245,197,66,.35);border-radius:16px;padding:18px;box-shadow:0 0 40px rgba(245,197,66,.18)}
.wmhead{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}.wmhead b{font-size:17px;color:#fff}.wmx{background:none;border:0;color:var(--muted);font-size:22px;cursor:pointer}
.wgrp{color:var(--silver);font-size:12px;letter-spacing:.08em;text-transform:uppercase;margin:14px 0 6px}
.wbtn{display:flex;align-items:center;gap:12px;width:100%;background:#0d0d10;border:1px solid #232327;border-radius:12px;padding:10px 12px;color:#fff;font:600 14px system-ui;cursor:pointer;margin-bottom:8px;transition:border-color .2s,box-shadow .2s}.wbtn:hover{border-color:var(--acc);box-shadow:0 0 16px rgba(245,197,66,.25)}
.wbtn img,.wbtn .wi{width:28px;height:28px;border-radius:8px;flex:none;display:grid;place-items:center;font-size:13px;font-weight:800}.wbtn small{margin-left:auto;color:var(--muted);font-weight:500}
#reso-c{width:100%;height:560px;display:block}.feed{max-height:520px;overflow:auto;font:13px ui-monospace,Menlo,monospace}.feed div{padding:6px 0;border-bottom:1px solid #18181b;display:flex;gap:8px}.feed .t{color:var(--muted)}
.legend{display:flex;gap:14px;flex-wrap:wrap;font-size:12px;color:var(--muted);margin-top:8px}.legend i{display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:5px;vertical-align:-1px}
#fsk-c,#dna-c{width:100%;height:230px;display:block}.mand{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}.mand canvas{width:100%;height:220px;display:block}
.fsklog{font:12px ui-monospace,Menlo,monospace;max-height:150px;overflow:auto;margin-top:8px}.fsklog div{padding:3px 0;border-bottom:1px solid #151518}.hz{color:#7df9ff}
@media(max-width:640px){header{flex-wrap:wrap}.row{grid-template-columns:1fr}}
</style>
</head>
<body>
<canvas id="bg"></canvas>
<header>
  <div class="brand"><svg viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#0b0b0d"/><path d="M14 44V28l18-12 18 12v16" fill="none" stroke="#f5c542" stroke-width="5" stroke-linejoin="round"/><path d="M24 44V34h16v10" fill="none" stroke="#d9dde3" stroke-width="5" stroke-linejoin="round"/></svg>Agent Tollgate</div>
  <nav><button data-t="dash" class="on">Live</button><button data-t="reso">Resonance</button><button data-t="freq">Frequencies</button><button data-t="swap">Swap</button><button data-t="tools">Tools</button><button data-t="agents">For agents</button></nav>
  <div><span id="who"></span> <button class="btn sec" id="connect">Connect wallet</button></div>
</header>
<main>
<section id="dash" class="on">
  <div class="hero">
    <h1>The live tollgate for AI agents</h1>
    <p>68 pay-per-call tools for autonomous agents: crypto data, rug-pull audits, swaps, web, documents, threat intel and AI. Agents pay a fraction of a cent in USDC per call. No accounts, no API keys.</p>
    <div class="cta"><button class="btn" onclick="document.querySelector('nav button[data-t=swap]').click()">Swap with rug-check</button><button class="btn sec" onclick="document.querySelector('nav button[data-t=agents]').click()">Connect your agent</button></div>
  </div>
  <div class="grid">
    <div class="card"><div class="k"><span class="live"></span>Agent requests today</div><div class="v glow" id="s-today">–</div></div>
    <div class="card"><div class="k">Requests, last 7 days</div><div class="v" id="s-week">–</div></div>
    <div class="card"><div class="k">Paid tool calls</div><div class="v" id="s-paid">–</div></div>
    <div class="card"><div class="k">Tools available</div><div class="v" id="s-tools">–</div></div>
  </div>
  <h2>Market</h2>
  <div class="grid" id="market"></div>
  <div class="grid" style="grid-template-columns:2fr 1fr;margin-top:14px">
    <div class="card"><div class="k">Tool demand spectrum · today</div><div class="spectrum" id="spectrum"></div></div>
    <div class="card"><div class="k">Agent traffic · 7 days</div><svg class="spark" id="spark" viewBox="0 0 300 120" preserveAspectRatio="none"></svg><div class="note" id="spark-l"></div></div>
  </div>
  <p class="note">Updates every 30 seconds. Aggregated counts only; no wallets or IPs are shown.</p>
</section>

<section id="reso">
  <div class="hero" style="padding-top:18px"><h1 style="font-size:clamp(24px,4vw,40px)">Agent resonance</h1><p>Every tool is an oscillator tuned to its own frequency. Each real agent request travels from the core to the tool as a wave and makes it resonate. Gold is a paid call, silver a payment request, neon an MCP call.</p></div>
  <div class="grid" style="grid-template-columns:3fr 1fr">
    <div class="card" style="padding:8px"><canvas id="reso-c"></canvas></div>
    <div class="card"><div class="k">Live signal feed</div><div class="feed" id="feed"><div class="note">Listening for agents…</div></div></div>
  </div>
  <div class="legend"><span><i style="background:#f5c542"></i>paid</span><span><i style="background:#d9dde3"></i>402 payment request</span><span><i style="background:#39ff88"></i>via MCP</span><span><i style="background:#ff4d5e"></i>error</span><span>Ring colour = tool family: data, web, util, ai</span></div>
</section>

<section id="freq">
  <div class="hero" style="padding-top:18px"><h1 style="font-size:clamp(24px,4vw,40px)">Agents talk in frequencies</h1><p>Every tool has its own carrier frequency. Each real agent call is encoded as 16-FSK: every byte becomes two tones nine hertz apart, then decoded back to text. Press listen to hear the traffic. A visualization of real requests, not a trading signal.</p></div>
  <div class="card"><div class="k" style="display:flex;justify-content:space-between;align-items:center"><span>📡 16-FSK agent communication · live <span id="fsk-info" class="note"></span></span><button class="btn sec" id="fsk-snd">🔊 Listen</button></div><canvas id="fsk-c"></canvas><div class="fsklog" id="fsk-log"><div class="note">Waiting for the next agent call…</div></div></div>
  <div class="card" style="margin-top:14px"><div class="k">🧬 Agent DNA · every base pair is one real call (newest on the right). Base from the carrier frequency, double rung = paid call.</div><canvas id="dna-c"></canvas></div>
  <div class="mand" style="margin-top:14px">
    <div class="card"><div class="k">369 Hz · Tesla 3-6-9</div><canvas id="m369"></canvas></div>
    <div class="card"><div class="k">693 Hz · spiral of inflow</div><canvas id="m693"></canvas></div>
    <div class="card"><div class="k">936 Hz · crystal of abundance</div><canvas id="m936"></canvas></div>
  </div>
</section>

<section id="swap">
  <div class="card" style="max-width:560px">
    <h2 style="margin-top:0">Swap with a rug-pull check</h2>
    <p class="note">Non-custodial: we build the transaction, you sign it in your own wallet. Keys and funds never touch our servers. A 0.3% platform fee is included in the route.</p>
    <label>Chain</label>
    <select id="chain"><option value="solana">Solana (Phantom)</option><option value="base">Base (MetaMask)</option><option value="ethereum">Ethereum (MetaMask)</option><option value="arbitrum">Arbitrum (MetaMask)</option><option value="polygon">Polygon (MetaMask)</option></select>
    <div class="row"><div><label>From</label><select id="from"></select></div><div><label>To</label><select id="to"></select></div></div>
    <div id="custom-wrap" style="display:none"><label>Token address / mint</label><input id="custom" placeholder="Paste a token mint or 0x address"></div>
    <label>Amount</label><input id="amount" type="number" min="0" step="any" placeholder="0.1">
    <div style="display:flex;gap:10px;margin-top:14px"><button class="btn" id="quote">Get quote</button><button class="btn sec" id="sign" disabled>Sign in wallet</button></div>
    <div id="qout" class="note" style="margin-top:14px"></div>
  </div>
</section>

<section id="tools">
  <p class="note">Every tool is pay-per-call in USDC over <a href="https://x402.org">x402</a> on Base, Polygon or Solana. Agents call the URL, get HTTP 402 with payment details, pay, and retry. Schemas: <a href="/openapi.json">openapi.json</a> · catalog: <a href="/llms.txt">llms.txt</a></p>
  <input id="filter" placeholder="Filter tools, e.g. audit, price, pdf, dns">
  <div class="card" style="margin-top:12px"><table><thead><tr><th>Tool</th><th>Price</th><th>Endpoint</th></tr></thead><tbody id="catalog"></tbody></table></div>
</section>

<section id="agents">
  <div class="grid">
    <div class="card"><b>MCP</b><p class="note">Streamable HTTP, no install</p><code>https://skinwinking.com/mcp</code></div>
    <div class="card"><b>x402 manifest</b><p class="note">Every paid resource</p><a href="/.well-known/x402">/.well-known/x402</a></div>
    <div class="card"><b>A2A agent</b><p class="note">Describe a task, get the right tools</p><a href="/.well-known/agent-card.json">agent-card.json</a></div>
    <div class="card"><b>Docs for LLMs</b><p class="note">Markdown catalog and how to pay</p><a href="/llms.txt">llms.txt</a> · <a href="/auth.md">auth.md</a></div>
  </div>
  <h2>Pay per call</h2>
  <div class="card"><code>curl -i https://skinwinking.com/api/v1/data/fear-greed</code><p class="note">→ HTTP 402 with <code>PAYMENT-REQUIRED</code>. Pay with any x402 client (e.g. <code>@x402/fetch</code>) and repeat the request.</p></div>
</section>
</main>
<div id="wm"><div class="wmbox"><div class="wmhead"><b>Connect a wallet</b><button class="wmx" id="wmx">×</button></div><div class="note">Sign a message to prove ownership. No transaction, no fee, keys never leave your wallet.</div><div id="wlist"></div></div></div>
<script src="https://cdn.jsdelivr.net/npm/@solana/web3.js@1.95.3/lib/index.iife.min.js" defer></script>
<script>
const $=s=>document.querySelector(s), fmt=n=>Number(n).toLocaleString('en-US');
const TOKENS={
 solana:[['SOL','SOL',9],['USDC','USDC',6],['USDT','USDT',6],['JUP','JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN',6],['BONK','DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',5],['WIF','EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm',6]],
 evm:[['ETH','ETH',18],['USDC','USDC',6]],
 polygon:[['POL','POL',18],['USDC','USDC',6]]};
const CHAIN_ID={ethereum:'0x1',base:'0x2105',arbitrum:'0xa4b1',polygon:'0x89'};
const EXPLORER={solana:'https://solscan.io/tx/',ethereum:'https://etherscan.io/tx/',base:'https://basescan.org/tx/',arbitrum:'https://arbiscan.io/tx/',polygon:'https://polygonscan.com/tx/'};
let me=null,lastQuote=null;
document.querySelectorAll('nav button').forEach(b=>b.onclick=()=>{document.querySelectorAll('nav button,section').forEach(x=>x.classList.remove('on'));b.classList.add('on');$('#'+b.dataset.t).classList.add('on');if(b.dataset.t==='reso'||b.dataset.t==='freq')dispatchEvent(new Event('resize'))});

let energy=0.3;
function countTo(el,to){const from=Number(el.dataset.v||0),t0=performance.now();el.dataset.v=to;const step=t=>{const k=Math.min(1,(t-t0)/900);el.textContent=fmt(Math.round(from+(to-from)*(1-Math.pow(1-k,3))));if(k<1)requestAnimationFrame(step)};requestAnimationFrame(step)}
async function loadStats(){try{const s=await (await fetch('/app/stats')).json();countTo($('#s-today'),s.requestsToday);countTo($('#s-week'),s.requests7d);countTo($('#s-paid'),s.paidCalls);countTo($('#s-tools'),s.tools);
 energy=Math.min(1,0.25+Math.log10(1+s.requestsToday)/3.5);
 const top=s.topToolsToday.length?s.topToolsToday:[{tool:'waiting for agents',calls:0}],max=Math.max(1,...top.map(t=>t.calls));
 $('#spectrum').innerHTML=top.map((t,i)=>'<div class="bar" title="'+t.tool+': '+t.calls+'"><i style="height:'+Math.max(6,Math.round(140*t.calls/max))+'px;animation-delay:'+(i*0.15)+'s"></i><span>'+t.tool.replace(/_/g,' ')+'</span></div>').join('');
 const d=s.daily||[];if(d.length){const mx=Math.max(1,...d.map(x=>x.requests)),pts=d.map((x,i)=>[i*(300/Math.max(1,d.length-1)),112-100*x.requests/mx]);
  const line=pts.map(p=>p.join(',')).join(' ');$('#spark').innerHTML='<defs><linearGradient id=g x1=0 y1=0 x2=0 y2=1><stop offset=0 stop-color=#f5c542 stop-opacity=.5 /><stop offset=1 stop-color=#f5c542 stop-opacity=0 /></linearGradient></defs><polygon fill=url(#g) points="0,120 '+line+' 300,120"/><polyline fill=none stroke=#ffdf7e stroke-width=2.5 points="'+line+'"/>';
  $('#spark-l').textContent=d[0].date.slice(5)+' → '+d[d.length-1].date.slice(5)+' · peak '+fmt(mx)+'/day'}}catch(e){}}
// Frequency waves: amplitude follows live agent traffic.
(function waves(){const c=$('#bg'),x=c.getContext('2d');let w,h,t=0;const fit=()=>{w=c.width=innerWidth*devicePixelRatio;h=c.height=innerHeight*devicePixelRatio};fit();addEventListener('resize',fit);
 const cols=['245,197,66','217,221,227','57,255,136','255,223,126'];
 const still=matchMedia('(prefers-reduced-motion: reduce)').matches;
 (function frame(){x.clearRect(0,0,w,h);t+=0.006+energy*0.012;for(let k=0;k<4;k++){x.beginPath();const amp=h*(0.06+energy*0.10)*(1-k*0.15),f=0.0018+k*0.0009,y0=h*(0.30+k*0.05);
  for(let i=0;i<=w;i+=6){const y=y0+Math.sin(i*f+t*(1.4+k*0.35))*amp+Math.sin(i*f*2.7-t*2.1)*amp*0.32;i?x.lineTo(i,y):x.moveTo(i,y)}
  x.strokeStyle='rgba('+cols[k]+','+(0.55-k*0.1)+')';x.lineWidth=(2.2-k*0.35)*devicePixelRatio;x.shadowColor='rgba('+cols[k]+',.8)';x.shadowBlur=14*devicePixelRatio;x.stroke()}if(!still)requestAnimationFrame(frame)})();if(still)addEventListener('resize',()=>{fit();})})();
async function loadMarket(){try{const m=await (await fetch('/app/market')).json();const cards=(m.prices||[]).map(p=>'<div class="card"><div class="k">'+p.symbol.replace('USDT','')+'</div><div class="v">$'+fmt(p.price)+'</div><div class="'+(p.change24hPct>=0?'ok':'bad')+'">'+(p.change24hPct>=0?'+':'')+p.change24hPct+'% 24h</div></div>');
 if(m.fearGreed)cards.unshift('<div class="card"><div class="k">Fear &amp; Greed</div><div class="v">'+m.fearGreed.value+'</div><div class="note">'+m.fearGreed.classification+'</div></div>');$('#market').innerHTML=cards.join('')}catch(e){}}
async function loadCatalog(){const c=await (await fetch('/app/catalog')).json();const draw=()=>{const f=$('#filter').value.toLowerCase();$('#catalog').innerHTML=c.filter(t=>!f||(t.id+t.summary).toLowerCase().includes(f)).map(t=>'<tr><td><b>'+t.id+'</b><div class=note>'+t.summary+'</div></td><td><span class=pill>'+t.price+'</span></td><td><code>'+t.method+' '+t.path+'</code></td></tr>').join('')};$('#filter').oninput=draw;draw()}

function fillTokens(){const ch=$('#chain').value,list=ch==='solana'?TOKENS.solana:ch==='polygon'?TOKENS.polygon:TOKENS.evm;
 const opts=list.map(t=>'<option value="'+t[1]+'" data-d="'+t[2]+'">'+t[0]+'</option>').join('');$('#from').innerHTML=ch==='solana'?opts:'<option value="'+list[0][1]+'" data-d="18">'+list[0][0]+'</option>';$('#to').innerHTML=opts+'<option value="custom">Other token…</option>';$('#to').selectedIndex=1;$('#custom-wrap').style.display='none'}
$('#chain').onchange=fillTokens;$('#to').onchange=()=>{$('#custom-wrap').style.display=$('#to').value==='custom'?'block':'none'};

const evmWallets=[];addEventListener('eip6963:announceProvider',e=>{if(!evmWallets.some(w=>w.info.uuid===e.detail.info.uuid))evmWallets.push(e.detail)});dispatchEvent(new Event('eip6963:requestProvider'));
let wallet=null;
function solanaWallets(){const out=[];const add=(name,p,icon,url)=>out.push({name,p,icon,url});
 add('Phantom',window.phantom?.solana?.isPhantom?window.phantom.solana:null,'#ab9ff2','https://phantom.app/download');
 add('Solflare',window.solflare?.isSolflare?window.solflare:null,'#fc7a26','https://solflare.com/download');
 add('Backpack',window.backpack?.isBackpack?window.backpack:(window.xnft?.solana||null),'#e33e3f','https://backpack.app/downloads');return out}
const EVM_INSTALL=[['MetaMask','https://metamask.io/download/','#f6851b'],['Coinbase Wallet','https://www.coinbase.com/wallet/downloads','#0052ff'],['Rabby','https://rabby.io/','#7084ff'],['Trust Wallet','https://trustwallet.com/download','#3375bb']];
function wbtn(name,icon,label,act){const b=document.createElement('button');b.className='wbtn';b.innerHTML=(icon&&icon.startsWith('data:')?'<img alt="" src="'+icon+'">':'<span class="wi" style="background:'+(icon||'#333')+'">'+name[0]+'</span>')+'<span>'+name+'</span><small>'+label+'</small>';b.onclick=act;return b}
function openWallets(){const l=$('#wlist');l.innerHTML='';
 const g1=document.createElement('div');g1.className='wgrp';g1.textContent='Solana';l.appendChild(g1);
 solanaWallets().forEach(w=>l.appendChild(wbtn(w.name,w.icon,w.p?'Detected':'Install',()=>w.p?signIn({kind:'solana',name:w.name,p:w.p}):open(w.url,'_blank'))));
 const g2=document.createElement('div');g2.className='wgrp';g2.textContent='Ethereum, Base, Arbitrum, Polygon';l.appendChild(g2);
 evmWallets.forEach(w=>l.appendChild(wbtn(w.info.name,w.info.icon,'Detected',()=>signIn({kind:'evm',name:w.info.name,p:w.provider}))));
 if(!evmWallets.length&&window.ethereum)l.appendChild(wbtn('Browser wallet','#f5c542','Detected',()=>signIn({kind:'evm',name:'Browser wallet',p:window.ethereum})));
 EVM_INSTALL.filter(([n])=>!evmWallets.some(w=>w.info.name.toLowerCase().includes(n.split(' ')[0].toLowerCase()))).forEach(([n,u,c])=>l.appendChild(wbtn(n,c,'Install',()=>open(u,'_blank'))));
 $('#wm').classList.add('on')}
$('#wmx').onclick=()=>$('#wm').classList.remove('on');$('#wm').onclick=e=>{if(e.target.id==='wm')$('#wm').classList.remove('on')};
const toHex=b=>[...b].map(x=>x.toString(16).padStart(2,'0')).join('');
async function signIn(w){try{let address,sign;
 if(w.kind==='solana'){const r=await w.p.connect();address=(r?.publicKey||w.p.publicKey).toString();
  sign=async m=>{const res=await w.p.signMessage(new TextEncoder().encode(m),'utf8');const sig=res?.signature||res;return toHex(new Uint8Array(sig))}}
 else{[address]=await w.p.request({method:'eth_requestAccounts'});sign=m=>w.p.request({method:'personal_sign',params:[m,address]})}
 const n=await (await fetch('/auth/nonce?address='+encodeURIComponent(address))).json();if(n.error)throw new Error(n.error);
 const signature=await sign(n.message);
 const v=await (await fetch('/auth/verify',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({nonce:n.nonce,signature})})).json();
 if(v.error)throw new Error('Sign-in failed: '+v.error);me={...v,wallet:w.name};wallet=w;$('#wm').classList.remove('on');showMe();
 if(w.kind==='evm'&&$('#chain').value==='solana'){$('#chain').value='base';fillTokens()}if(w.kind==='solana'){$('#chain').value='solana';fillTokens()}
 }catch(e){$('#wm').classList.remove('on');alertBox(e.message||String(e))}}
function showMe(){$('#who').textContent=me?(me.wallet?me.wallet+' · ':'')+me.address.slice(0,4)+'…'+me.address.slice(-4):'';$('#connect').textContent=me?'Sign out':'Connect wallet'}
$('#connect').onclick=async()=>{if(me){await fetch('/auth/logout',{method:'POST'});me=null;wallet=null;showMe()}else openWallets()};
function alertBox(t){$('#qout').innerHTML='<span class=bad>'+t+'</span>';document.querySelector('nav button[data-t=swap]').click()}

async function decimalsOf(chain,token){if(['SOL','USDC','USDT','ETH','POL'].includes(token))return null;const r=await (await fetch('/app/decimals?chain='+chain+'&token='+token)).json();return r.decimals}
$('#quote').onclick=async()=>{
 if(!me)return openWallets();const ch=$('#chain').value,fromOpt=$('#from').selectedOptions[0];let to=$('#to').value;if(to==='custom')to=$('#custom').value.trim();
 const amt=Number($('#amount').value);if(!(amt>0))return alertBox('Enter an amount.');
 const dec=Number(fromOpt.dataset.d);const base=BigInt(Math.round(amt*10**Math.min(dec,9)))*10n**BigInt(Math.max(dec-9,0));
 $('#qout').textContent='Finding the best route…';$('#sign').disabled=true;
 const r=await fetch('/app/quote',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({fromChain:ch,toChain:ch,inputToken:fromOpt.value,outputToken:to,amount:base.toString()})});const q=await r.json();
 if(!r.ok)return alertBox(q.message||q.error);lastQuote={...q,chain:ch};
 let outDec=Number($('#to').selectedOptions[0]?.dataset.d||0);if($('#to').value==='custom')outDec=await decimalsOf(ch,to)??0;
 const out=q.quote?.outAmount?Number(q.quote.outAmount)/10**outDec:(q.quote?.toAmount?Number(q.quote.toAmount)/10**outDec:null);
 const risk=q.outputTokenRisk;const riskHtml=risk?('<div>Token risk: <b class="'+(risk.riskLevel==='low'||risk.riskLevel==='trusted'?'ok':risk.riskLevel==='medium'?'warn':'bad')+'">'+(risk.riskLevel||'unknown')+'</b>'+(risk.flags&&risk.flags.length?' · '+risk.flags.join(', '):'')+(risk.warning?'<div class=bad>'+risk.warning+'</div>':'')+'</div>'):'';
 $('#qout').innerHTML='<div>You receive ≈ <b>'+(out!==null?fmt(out):'see route')+'</b></div><div class=note>Route: '+q.route+' · fee '+(q.fee?.bps??30)+' bps'+(q.quote?.priceImpactPct?' · impact '+(Number(q.quote.priceImpactPct)*100).toFixed(2)+'%':'')+'</div>'+riskHtml;$('#sign').disabled=false};

$('#sign').onclick=async()=>{const q=lastQuote;if(!q)return;try{const tx=q.unsignedTransaction;let sig;
 if(!wallet)return openWallets();
 if(q.chain==='solana'){const bytes=Uint8Array.from(atob(tx.serialized),c=>c.charCodeAt(0));const vtx=solanaWeb3.VersionedTransaction.deserialize(bytes);const r=await wallet.p.signAndSendTransaction(vtx);sig=r?.signature||r}
 else{await wallet.p.request({method:'wallet_switchEthereumChain',params:[{chainId:CHAIN_ID[q.chain]}]});sig=await wallet.p.request({method:'eth_sendTransaction',params:[{from:me.address,to:tx.to,data:tx.data,value:tx.value,gas:tx.gasLimit}]})}
 $('#qout').innerHTML='<span class=ok>Sent.</span> <a target=_blank rel=noopener href="'+EXPLORER[q.chain]+sig+'">View transaction</a>';$('#sign').disabled=true;lastQuote=null}catch(e){alertBox(e.message||String(e))}};

// WebMCP: expose read-only tools to in-browser AI agents where supported.
if(navigator.modelContext?.provideContext){navigator.modelContext.provideContext({tools:[
 {name:'list_tools',description:'List the pay-per-call tools on this site with prices and endpoints',inputSchema:{type:'object',properties:{filter:{type:'string'}}},async execute({filter}){const c=await (await fetch('/app/catalog')).json();return{content:[{type:'text',text:JSON.stringify(c.filter(t=>!filter||(t.id+t.summary).toLowerCase().includes(filter.toLowerCase())))}]}}},
 {name:'market_snapshot',description:'Current crypto prices and the Fear and Greed index',inputSchema:{type:'object',properties:{}},async execute(){return{content:[{type:'text',text:JSON.stringify(await (await fetch('/app/market')).json())}]}}},
 {name:'live_activity',description:'Live agent request counts and the most requested tools today',inputSchema:{type:'object',properties:{}},async execute(){return{content:[{type:'text',text:JSON.stringify(await (await fetch('/app/stats')).json())}]}}}]})}

// Resonance view: tools as tuned oscillators on a ring; agent calls arrive as travelling waves.
(function resonance(){const c=$('#reso-c'),x=c.getContext('2d');let W,H,cat=[],nodes=[],waves=[],since=Date.now()-120000,t=0;
 const FAM={data:'245,197,66',web:'217,221,227',util:'57,255,136',ai:'255,223,126',core:'255,255,255'};
 const OUT={paid:'245,197,66',payment_required:'217,221,227',mcp:'57,255,136',client_error:'255,77,94',server_error:'255,77,94',rate_limited:'255,176,32'};
 const fit=()=>{const r=c.getBoundingClientRect();W=c.width=r.width*devicePixelRatio;H=c.height=560*devicePixelRatio;layout()};
 function layout(){const R=Math.min(W,H)*0.40;nodes=cat.map((t,i)=>{const a=-Math.PI/2+i*2*Math.PI/cat.length,fam=(t.path.split('/')[3]||'core');return{id:t.id,fam:FAM[fam]?fam:'core',x:W/2+Math.cos(a)*R,y:H/2+Math.sin(a)*R,a,f:0.6+(i%9)*0.22,e:0}})}
 fetch('/app/catalog').then(r=>r.json()).then(j=>{cat=j;fit()});addEventListener('resize',()=>{if(cat.length)fit()});
 function pulse(ev){window.onAgentEvent&&window.onAgentEvent(ev);const n=nodes.find(n=>n.id===ev.tool);if(!n)return;const col=ev.source==='mcp'&&ev.outcome==='payment_required'?OUT.mcp:(OUT[ev.outcome]||OUT.payment_required);waves.push({n,col,p:0});
  const f=$('#feed');if(f.firstChild&&f.firstChild.classList&&f.firstChild.classList.contains('note'))f.innerHTML='';const d=document.createElement('div');d.innerHTML='<span class=t>'+new Date(ev.t).toLocaleTimeString()+'</span><span style="color:rgb('+col+')">●</span><span>'+ev.tool.replace(/_/g,' ')+'</span><span class=t>'+ev.source+' · '+ev.country+'</span>';f.prepend(d);while(f.children.length>40)f.lastChild.remove()}
 async function poll(){try{const r=await (await fetch('/app/events?since='+since)).json();r.events.forEach((e,i)=>setTimeout(()=>pulse(e),i*180));if(r.events.length)since=r.events[r.events.length-1].t}catch(e){}}
 poll();setInterval(poll,4000);
 const still=matchMedia('(prefers-reduced-motion: reduce)').matches;
 (function frame(){if(!W){requestAnimationFrame(frame);return}t+=0.016;x.clearRect(0,0,W,H);const cx=W/2,cy=H/2,d=devicePixelRatio;
  for(let k=0;k<3;k++){x.beginPath();const r0=Math.min(W,H)*(0.07+k*0.035);for(let a=0;a<=Math.PI*2+0.01;a+=0.04){const rr=r0+Math.sin(a*(6+k*3)+t*(2+k))*4*d*(1+energy*2);x.lineTo(cx+Math.cos(a)*rr,cy+Math.sin(a)*rr)}x.strokeStyle='rgba(245,197,66,'+(0.55-k*0.15)+')';x.lineWidth=1.5*d;x.shadowColor='rgba(245,197,66,.8)';x.shadowBlur=12*d;x.stroke()}
  x.shadowBlur=0;x.fillStyle='#fff';x.font=(12*d)+'px system-ui';x.textAlign='center';x.fillText('AGENTS',cx,cy+4*d);
  waves=waves.filter(w=>w.p<=1);for(const w of waves){w.p+=0.018;const n=w.n,len=Math.hypot(n.x-cx,n.y-cy),ux=(n.x-cx)/len,uy=(n.y-cy)/len,px=-uy,py=ux;x.beginPath();
   for(let s=0;s<=1;s+=0.02){const along=Math.min(w.p,1)*len*s,env=Math.sin(Math.PI*s)*Math.max(0,1-Math.abs(s-1)*0.6),wob=Math.sin(s*28-t*12)*7*d*env;x.lineTo(cx+ux*along+px*wob,cy+uy*along+py*wob)}
   x.strokeStyle='rgba('+w.col+',.9)';x.lineWidth=2*d;x.shadowColor='rgba('+w.col+',1)';x.shadowBlur=16*d;x.stroke();if(w.p>=0.98)n.e=1}
  x.shadowBlur=0;for(const n of nodes){n.e*=0.985;const base=3*d,ring=base+2*d+Math.sin(t*n.f*6)*1.5*d+n.e*14*d;
   x.beginPath();x.arc(n.x,n.y,base,0,Math.PI*2);x.fillStyle='rgba('+FAM[n.fam]+','+(0.55+n.e*0.45)+')';x.fill();
   x.beginPath();for(let a=0;a<=Math.PI*2+0.01;a+=0.2){const rr=ring+Math.sin(a*5+t*n.f*8)*n.e*4*d;x.lineTo(n.x+Math.cos(a)*rr,n.y+Math.sin(a)*rr)}
   x.strokeStyle='rgba('+FAM[n.fam]+','+(0.18+n.e*0.8)+')';x.lineWidth=(1+n.e*1.5)*d;if(n.e>0.05){x.shadowColor='rgba('+FAM[n.fam]+',1)';x.shadowBlur=18*d*n.e}x.stroke();x.shadowBlur=0;
   if(n.e>0.15){x.fillStyle='rgba(255,255,255,'+n.e+')';x.font=(11*d)+'px system-ui';x.textAlign=Math.cos(n.a)>0?'left':'right';x.fillText(n.id.replace(/_/g,' '),n.x+Math.cos(n.a)*12*d,n.y+Math.sin(n.a)*12*d+4*d)}}
  if(!still||waves.length)requestAnimationFrame(frame);else setTimeout(()=>requestAnimationFrame(frame),500)})()})();
// Frequencies: 16-FSK encoding of live calls, agent DNA and the 369/693/936 mandalas.
(function freqs(){const FAMHZ={data:528,web:639,util:417,ai:741,council:963,router:396,alpha:852,security:285,core:369};
 const carrier=t=>{const fam=(t.path||'').split('/')[3]||'core';let h=0;for(const ch of t.id)h=(h*31+ch.charCodeAt(0))%997;return (FAMHZ[fam]||432)+(h%6)*3};
 let cat=[];fetch('/app/catalog').then(r=>r.json()).then(j=>cat=j);
 const F={tones:[],log:[],n:0,snd:false,ac:null,STEP:9},DNA=[];
 const enc=(hz,txt)=>{const b=new TextEncoder().encode(txt.slice(0,32)),t=[];b.forEach(x=>{t.push(hz+(x>>4)*F.STEP,hz+(x&15)*F.STEP)});return t};
 const dec=(hz,t)=>{const b=[];for(let i=0;i+1<t.length;i+=2)b.push((Math.round((t[i]-hz)/F.STEP)<<4)|Math.round((t[i+1]-hz)/F.STEP));return new TextDecoder().decode(new Uint8Array(b))};
 const OUTC={paid:'245,197,66',payment_required:'217,221,227',client_error:'255,77,94',server_error:'255,77,94',rate_limited:'255,176,32'};
 window.onAgentEvent=ev=>{const t=cat.find(c=>c.id===ev.tool)||{id:ev.tool,path:''};const hz=carrier(t);const msg=ev.tool+':'+(ev.outcome==='paid'?'PAID':'402')+':'+ev.country;
  const tones=enc(hz,msg),back=dec(hz,tones),ok=back===msg,col=ev.source==='mcp'?'57,255,136':(OUTC[ev.outcome]||'217,221,227');
  tones.forEach(f=>F.tones.push({f,col}));if(F.tones.length>1400)F.tones.splice(0,F.tones.length-1400);F.n++;
  const lg=$('#fsk-log');if(lg.firstChild&&lg.firstChild.classList&&lg.firstChild.classList.contains('note'))lg.innerHTML='';
  const d=document.createElement('div');d.innerHTML='<span class="hz">'+hz+' Hz</span> '+tones.length+' tones → <b>'+back.replace(/</g,'&lt;')+'</b> '+(ok?'<span class=ok>✔</span>':'<span class=bad>✘</span>');lg.prepend(d);while(lg.children.length>30)lg.lastChild.remove();
  $('#fsk-info').textContent='· '+F.n+' messages encoded';
  DNA.push({hz,base:'ATGC'[hz%4],col,paid:ev.outcome==='paid',t:performance.now()});if(DNA.length>70)DNA.shift();
  energy=Math.min(1,energy+0.05);
  if(F.snd&&F.ac){let t0=F.ac.currentTime+0.02;tones.slice(0,32).forEach(f=>{const o=F.ac.createOscillator(),g=F.ac.createGain();o.frequency.value=f;o.type='sine';g.gain.setValueAtTime(0,t0);g.gain.linearRampToValueAtTime(0.06,t0+0.005);g.gain.linearRampToValueAtTime(0,t0+0.055);o.connect(g).connect(F.ac.destination);o.start(t0);o.stop(t0+0.06);t0+=0.06})}};
 $('#fsk-snd').onclick=e=>{F.snd=!F.snd;if(F.snd&&!F.ac){try{F.ac=new (window.AudioContext||window.webkitAudioContext)()}catch(_){F.snd=false}}e.target.textContent=F.snd?'🔇 Mute':'🔊 Listen'};
 const fitC=c=>{const r=c.getBoundingClientRect();if(!r.width)return null;const d=devicePixelRatio;if(c.width!==Math.round(r.width*d)){c.width=Math.round(r.width*d);c.height=Math.round(r.height*d)}return {x:c.getContext('2d'),W:c.width,H:c.height,d}};
 let t=0;
 function drawFsk(){const g=fitC($('#fsk-c'));if(!g)return;const {x,W,H,d}=g;x.fillStyle='rgba(0,0,0,.35)';x.fillRect(0,0,W,H);
  const fmin=250,fmax=1150,y=f=>H-10*d-(f-fmin)/(fmax-fmin)*(H-20*d);x.strokeStyle='rgba(217,221,227,.08)';x.lineWidth=1;x.font=(10*d)+'px system-ui';x.fillStyle='rgba(217,221,227,.4)';
  [285,369,417,528,639,693,741,852,936,963].forEach(f=>{x.beginPath();x.moveTo(0,y(f));x.lineTo(W,y(f));x.stroke();x.fillText(f+' Hz',4*d,y(f)-3*d)});
  const n=F.tones.length,w=Math.max(1.5*d,W/Math.max(380,n));F.tones.forEach((tn,i)=>{const px=W-(n-i)*w;if(px<0)return;x.fillStyle='rgba('+tn.col+',.9)';x.shadowColor='rgba('+tn.col+',1)';x.shadowBlur=6*d;x.fillRect(px,y(tn.f)-2*d,w,4*d)});x.shadowBlur=0}
 function drawDna(){const g=fitC($('#dna-c'));if(!g)return;const {x,W,H,d}=g;x.clearRect(0,0,W,H);const n=DNA.length,step=W/72,cy=H/2,amp=H*0.32;
  for(let k=0;k<2;k++){x.beginPath();for(let px=0;px<=W;px+=4){const ph=px/W*Math.PI*7+t*1.4+k*Math.PI;x.lineTo(px,cy+Math.sin(ph)*amp)}x.strokeStyle=k?'rgba(217,221,227,.55)':'rgba(245,197,66,.7)';x.lineWidth=2*d;x.stroke()}
  DNA.forEach((b,i)=>{const px=W-(n-i)*step-step/2;if(px<0)return;const ph=px/W*Math.PI*7+t*1.4,y1=cy+Math.sin(ph)*amp,y2=cy+Math.sin(ph+Math.PI)*amp,age=Math.min(1,(performance.now()-b.t)/600);
   x.strokeStyle='rgba('+b.col+','+(0.35+0.6*age)+')';x.lineWidth=(b.paid?3:1.6)*d;x.shadowColor='rgba('+b.col+',1)';x.shadowBlur=(i===n-1?16:6)*d;x.beginPath();x.moveTo(px,y1);x.lineTo(px,y2);x.stroke();
   if(b.paid){x.beginPath();x.moveTo(px+3*d,y1);x.lineTo(px+3*d,y2);x.stroke()}x.shadowBlur=0;x.fillStyle='rgba(255,255,255,.85)';x.font=(9*d)+'px ui-monospace';x.textAlign='center';x.fillText(b.base,px,Math.min(y1,y2)-6*d)})}
 function mand(id,hz,fn){const g=fitC($(id));if(!g)return;const {x,W,H,d}=g;x.clearRect(0,0,W,H);x.save();x.translate(W/2,H/2);fn(x,Math.min(W,H)*0.4,d,t*(hz/600)*(0.6+energy));x.restore()}
 const glow=(x,c,d)=>{x.strokeStyle=c;x.shadowColor=c;x.shadowBlur=12*d;x.lineWidth=1.6*d};
 function m369(x,R,d,tt){glow(x,'rgba(245,197,66,.9)',d);[3,6,9].forEach((k,i)=>{const r=R*(0.35+i*0.22)*(1+Math.sin(tt*k)*0.04*(1+energy));x.beginPath();for(let a=0;a<=Math.PI*2+0.01;a+=0.03){const rr=r+Math.sin(a*k+tt*2)*R*0.05;x.lineTo(Math.cos(a)*rr,Math.sin(a)*rr)}x.stroke()});
  for(let i=0;i<9;i++){const a=i/9*Math.PI*2+tt*0.3;x.beginPath();x.arc(Math.cos(a)*R*0.79,Math.sin(a)*R*0.79,2.5*d,0,7);x.fillStyle='#fff';x.fill()}}
 function m693(x,R,d,tt){glow(x,'rgba(217,221,227,.85)',d);for(let arm=0;arm<3;arm++){x.beginPath();for(let s=0;s<=1;s+=0.005){const a=s*Math.PI*6+arm*Math.PI*2/3-tt*1.2,r=R*(1-s)*(0.9+0.1*Math.sin(tt*3));x.lineTo(Math.cos(a)*r,Math.sin(a)*r)}x.stroke()}
  x.beginPath();x.arc(0,0,R*0.08*(1+energy),0,7);x.fillStyle='rgba(255,223,126,.9)';x.fill()}
 function m936(x,R,d,tt){glow(x,'rgba(125,249,255,.85)',d);const pts=[];for(let i=0;i<12;i++){const ph=Math.acos(1-2*(i+0.5)/12),th=Math.PI*(1+Math.sqrt(5))*i+tt;pts.push([Math.sin(ph)*Math.cos(th),Math.cos(ph),Math.sin(ph)*Math.sin(th)])}
  const P=pts.map(([a,b,c])=>{const cs=Math.cos(tt*0.7),sn=Math.sin(tt*0.7),y2=b*cs-c*sn;return [a*R*0.85,y2*R*0.85]});for(let i=0;i<P.length;i++)for(let j=i+1;j<P.length;j++){const dx=P[i][0]-P[j][0],dy=P[i][1]-P[j][1];if(Math.hypot(dx,dy)<R*1.05){x.beginPath();x.moveTo(P[i][0],P[i][1]);x.lineTo(P[j][0],P[j][1]);x.stroke()}}}
 const still=matchMedia('(prefers-reduced-motion: reduce)').matches;
 (function frame(){if($('#freq').classList.contains('on')){t+=0.016;drawFsk();drawDna();mand('#m369',369,m369);mand('#m693',693,m693);mand('#m936',936,m936)}energy*=0.999;requestAnimationFrame(frame)})();
 if(still)t=1})();
fillTokens();loadStats();loadMarket();loadCatalog();setInterval(loadStats,30000);setInterval(loadMarket,60000);
fetch('/auth/me').then(r=>r.ok?r.json():null).then(m=>{me=m;showMe()});
</script>
</body>
</html>`;
