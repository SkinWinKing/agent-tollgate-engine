// Single-page app served at / (for browsers) and /app. Inline so the Worker has no static-asset dependency.
export const APP_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>SKW Trading Market &amp; Tollgate for Agents</title>
<meta name="description" content="SKW Trading Market: trade Solana tokens with a rug-pull check on every order, watch AI agents trade live, and give your agents 128 pay-per-call x402 tools.">
<meta property="og:title" content="SKW Trading Market &amp; Tollgate for Agents"><meta property="og:image" content="https://skinwinking.com/brand/skw-crest.webp">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Exo+2:wght@400;500;600;700&family=Orbitron:wght@500;600;700;800&display=swap">
<link rel="icon" href="/brand/skw-coin.webp" type="image/webp">
<link rel="alternate" type="text/markdown" href="/llms.txt">
<style>
:root{--bg:#000;--panel:#0b0b0d;--line:#2b2618;--text:#ffffff;--muted:#c0c4cc;--acc:#f5c542;--gold2:#ffdf7e;--silver:#d9dde3;--neon:#3ab8ff;--up:#f5c542;--down:#3ab8ff;--warn:#ffb020;--bad:#ff4d5e;--blue:#d9dde3}
*{box-sizing:border-box}body{margin:0;background:radial-gradient(1100px 520px at 80% -10%,rgba(245,197,66,.10),transparent 60%),radial-gradient(900px 500px at -10% 25%,rgba(217,221,227,.06),transparent 60%),#000;color:var(--text);font:15px/1.55 'Exo 2',system-ui,-apple-system,Segoe UI,Roboto,sans-serif;letter-spacing:-.005em;min-height:100vh}
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
.live{background:var(--neon)!important;box-shadow:0 0 10px var(--neon)}.ok{color:var(--up)!important}.bad{color:var(--down)!important}
a{color:var(--blue)}header{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 20px;border-bottom:1px solid var(--line);position:sticky;top:0;background:rgba(0,0,0,.88);backdrop-filter:blur(6px);z-index:5}
.brand{display:flex;align-items:center;gap:10px;font-weight:700}.brand svg{width:28px;height:28px}
nav{display:flex;gap:4px}nav button{background:none;border:0;color:var(--muted);padding:8px 12px;border-radius:8px;cursor:pointer;font:inherit}nav button.on{background:var(--panel);color:var(--text)}
main{max-width:none;margin:0;padding:20px clamp(12px,2vw,32px)}section{display:none}section.on{display:block}
.grid{display:grid;gap:14px;grid-template-columns:repeat(auto-fit,minmax(220px,1fr))}
.card{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:16px}
.k{color:var(--muted);font-size:13px}.v{font-size:26px;font-weight:700;margin-top:4px}.live{display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--acc);margin-right:6px;animation:p 1.6s infinite}
@keyframes p{50%{opacity:.3}}h2{font-size:17px;margin:22px 0 10px}
table{width:100%;border-collapse:collapse}td,th{padding:8px;border-bottom:1px solid var(--line);text-align:left;font-size:14px}th{color:var(--muted);font-weight:500}
.btn{background:linear-gradient(180deg,#ffe9a8,#f5c542 55%,#c99a1a);color:#120d00;border:0;border-radius:10px;padding:10px 16px;font:700 14px 'Exo 2',system-ui,sans-serif;cursor:pointer;box-shadow:0 0 0 1px rgba(255,223,126,.6),0 0 18px rgba(245,197,66,.45);transition:box-shadow .2s,transform .2s}.btn:hover{transform:translateY(-1px);box-shadow:0 0 0 1px #ffdf7e,0 0 28px rgba(245,197,66,.7)}.btn.sec{background:linear-gradient(180deg,#1a1a1d,#0b0b0d);color:var(--silver);border:1px solid rgba(217,221,227,.35);box-shadow:0 0 12px rgba(217,221,227,.12)}.btn.sec:hover{color:#fff;box-shadow:0 0 18px rgba(217,221,227,.3)}.btn:disabled{opacity:.5;cursor:not-allowed}
input,select{background:#050506;color:var(--text);border:1px solid var(--line);border-radius:10px;padding:10px;font:inherit;width:100%}
label{display:block;color:var(--muted);font-size:13px;margin:10px 0 4px}.row{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.note{color:var(--muted);font-size:13px}.ok{color:var(--acc)}.warn{color:var(--warn)}.bad{color:var(--bad)}
.pill{display:inline-block;border:1px solid var(--line);border-radius:999px;padding:2px 8px;font-size:12px;color:var(--muted)}
code{background:#111113;color:var(--gold2);padding:2px 6px;border-radius:6px;font-size:13px}#who{font-size:13px;color:var(--muted)}
#wm{position:fixed;inset:0;background:rgba(0,0,0,.72);backdrop-filter:blur(6px);display:none;align-items:center;justify-content:center;z-index:20}#wm.on{display:flex}
.wmbox{width:min(440px,92vw);background:linear-gradient(180deg,#121214,#070708);border:1px solid rgba(245,197,66,.35);border-radius:16px;padding:18px;box-shadow:0 0 40px rgba(245,197,66,.18)}
.wmhead{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}.wmhead b{font-size:17px;color:#fff}.wmx{background:none;border:0;color:var(--muted);font-size:22px;cursor:pointer}
.wgrp{color:var(--silver);font-size:12px;letter-spacing:.08em;text-transform:uppercase;margin:14px 0 6px}
.wbtn{display:flex;align-items:center;gap:12px;width:100%;background:#0d0d10;border:1px solid #232327;border-radius:12px;padding:10px 12px;color:#fff;font:600 14px 'Exo 2',system-ui,sans-serif;cursor:pointer;margin-bottom:8px;transition:border-color .2s,box-shadow .2s}.wbtn:hover{border-color:var(--acc);box-shadow:0 0 16px rgba(245,197,66,.25)}
.wbtn img,.wbtn .wi{width:28px;height:28px;border-radius:8px;flex:none;display:grid;place-items:center;font-size:13px;font-weight:800}.wbtn small{margin-left:auto;color:var(--muted);font-weight:500}
#reso-c{width:100%;height:560px;display:block}.feed{max-height:520px;overflow:auto;font:13px ui-monospace,Menlo,monospace}.feed div{padding:6px 0;border-bottom:1px solid #18181b;display:flex;gap:8px}.feed .t{color:var(--muted)}
.legend{display:flex;gap:14px;flex-wrap:wrap;font-size:12px;color:var(--muted);margin-top:8px}.legend i{display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:5px;vertical-align:-1px}
html{scroll-behavior:smooth}.fxg{display:grid;gap:12px;grid-template-columns:repeat(auto-fill,minmax(170px,1fr))}.fx{position:relative;background:linear-gradient(180deg,rgba(14,14,16,.9),rgba(6,6,8,.8));border:1px solid #1d1d22;border-radius:12px;padding:8px;cursor:pointer;transition:box-shadow .3s,border-color .3s}.fx canvas{width:100%;height:150px;display:block}.fx .l{font-size:12px;color:var(--muted);display:flex;justify-content:space-between}.fx .l b{color:#fff}.fx.act{border-color:var(--acc);box-shadow:0 0 22px rgba(245,197,66,.35)}.fx.pin{border-color:#7df9ff;box-shadow:0 0 22px rgba(125,249,255,.35)}
#fsk-c,#dna-c{width:100%;height:230px;display:block}.mand{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}.mand canvas{width:100%;height:220px;display:block}
.fsklog{font:12px ui-monospace,Menlo,monospace;max-height:150px;overflow:auto;margin-top:8px}.fsklog div{padding:3px 0;border-bottom:1px solid #151518}.hz{color:#7df9ff}
.tl{display:grid;grid-template-columns:300px minmax(0,1fr) 360px;gap:14px;min-height:calc(100vh - 120px)}.mk{max-height:calc(100vh - 130px);overflow:auto}.mk table td{padding:6px 6px;font-size:13px;cursor:pointer}.mk tr:hover td{background:rgba(245,197,66,.06)}.mk tr.sel td{background:rgba(245,197,66,.12)}
.thead{display:flex;flex-wrap:wrap;gap:18px;align-items:baseline;margin-bottom:8px}.thead .px{font-size:26px;font-weight:800;color:#fff}.thead .s{font-size:12px;color:var(--muted)}.thead .s b{display:block;color:#fff;font-size:14px}
.ivs button{background:none;border:1px solid #232327;color:var(--muted);border-radius:8px;padding:4px 10px;margin-right:4px;cursor:pointer;font:600 12px 'Exo 2',system-ui,sans-serif}.ivs button.on{color:var(--gold2);border-color:var(--acc)}
#chart{width:100%;height:calc(100vh - 290px);min-height:420px}.ob{font:12px ui-monospace,Menlo,monospace}.ob .r{display:grid;grid-template-columns:1fr 1fr;padding:2px 6px;position:relative}.ob .a{color:var(--down)}.ob .b{color:var(--up)}.ob .mid{text-align:center;color:#fff;font-weight:800;padding:6px;border-top:1px solid #1d1d22;border-bottom:1px solid #1d1d22;display:block}
.ob i{position:absolute;right:0;top:0;bottom:0;opacity:.14}.side{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:8px 0}.side button{padding:10px;border-radius:10px;border:1px solid #232327;background:#0d0d10;color:#fff;font:700 14px 'Exo 2',system-ui,sans-serif;cursor:pointer}.side button.long.on{background:linear-gradient(180deg,rgba(245,197,66,.25),rgba(245,197,66,.08));border-color:var(--up);color:var(--gold2);box-shadow:0 0 18px rgba(245,197,66,.25)}.side button.short.on{background:linear-gradient(180deg,rgba(58,184,255,.25),rgba(58,184,255,.08));border-color:var(--down);color:#9fdcff;box-shadow:0 0 18px rgba(58,184,255,.25)}
@media(max-width:1100px){.tl{grid-template-columns:1fr}.mk{max-height:300px}}
*::-webkit-scrollbar{width:8px;height:8px}*::-webkit-scrollbar-thumb{background:linear-gradient(180deg,#f5c542,#3ab8ff);border-radius:8px}*::-webkit-scrollbar-track{background:#050506}
.card{border-radius:16px!important}.thead .px{font-size:34px;letter-spacing:-.02em;background:linear-gradient(90deg,#fff,#ffdf7e);-webkit-background-clip:text;background-clip:text;color:transparent}
.mk table tr.sel td:first-child{box-shadow:inset 3px 0 0 var(--up)}.grid{gap:16px}
.brand img{height:40px;width:auto;filter:drop-shadow(0 0 8px rgba(245,197,66,.35))}.brand span{color:var(--gold2)}a.brand{text-decoration:none}
.home{padding:48px 0 10px}.crest{width:min(420px,78vw);height:auto;display:block;margin:0 auto 6px;filter:drop-shadow(0 0 40px rgba(245,197,66,.35));animation:float 6s ease-in-out infinite}
@keyframes float{50%{transform:translateY(-8px)}}.home h1 small{display:block;font-size:.5em;letter-spacing:.06em;margin-top:6px}
.plans .card{display:flex;flex-direction:column;gap:6px}.plans .card.cur{box-shadow:0 0 0 1px var(--acc),0 0 30px rgba(245,197,66,.25)}.plans .pr{font:800 30px Orbitron,sans-serif;color:#fff}.plans .pr small{font-size:13px;color:var(--muted)}.plans ul{margin:4px 0 8px;padding-left:18px;color:var(--muted);font-size:14px}.plans .buy{display:flex;gap:6px;margin-top:auto}.plans select{padding:8px}.kr{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid #16161a}.newkey{margin-top:10px;padding:10px;border:1px dashed var(--acc);border-radius:10px;word-break:break-all}
.entry .card{cursor:pointer}.entry .card b{font-size:18px;color:#fff;display:block;margin:6px 0}.entry .card .ic{font-size:26px}.entry .card .go{color:var(--gold2);font-size:14px;margin-top:8px;display:inline-block}
.steps{counter-reset:s}.steps .card b{color:#fff}.steps .card b:before{counter-increment:s;content:counter(s);display:inline-grid;place-items:center;width:26px;height:26px;border-radius:50%;margin-right:8px;background:var(--acc);color:#000;font-size:13px}
footer.site{position:relative;z-index:1;border-top:1px solid #1d1d22;margin-top:40px;padding:28px clamp(16px,2vw,32px) 18px;color:var(--muted);font-size:14px}
.fcols{display:grid;gap:22px;grid-template-columns:2fr repeat(4,1fr)}.fcols h4{color:#fff;margin:0 0 10px;font-size:14px}.fcols a{display:block;color:var(--muted);text-decoration:none;margin:5px 0}.fcols a:hover{color:var(--gold2)}
.fbrand img{height:70px;width:auto}.fbot{border-top:1px solid #16161a;margin-top:22px;padding-top:14px;display:flex;flex-wrap:wrap;justify-content:space-between;gap:10px;font-size:13px}
@media(max-width:820px){.fcols{grid-template-columns:1fr 1fr}.fbrand{grid-column:1/-1}}
@media(max-width:640px){header{flex-wrap:wrap}.row{grid-template-columns:1fr}.brand span{display:none}}
h1,h2,h3,h4,.brand,.v,.px,nav button,.btn{font-family:'Orbitron','Exo 2',system-ui,sans-serif}.v,.px,.hz{font-variant-numeric:tabular-nums}
h1,h2{letter-spacing:.02em;text-transform:uppercase}h1{font-weight:800}.home h1 small,.k,nav button,.fcols h4,.btn{letter-spacing:.12em;text-transform:uppercase;font-size:.82em}.home h1 small{font-size:.42em;letter-spacing:.32em;background:linear-gradient(90deg,#c99a1a,#f5c542,#ffe9a8,#f5c542,#c99a1a);-webkit-background-clip:text;background-clip:text;color:transparent}.k{font-size:11px}.brand{letter-spacing:.06em;text-transform:uppercase}
</style>
</head>
<body>
<canvas id="bg"></canvas>
<header>
  <a class="brand" href="#home" data-go="home"><img src="/brand/skw-coin.webp" alt="SKW" width="40" height="40">SKW <span>Trading Market</span></a>
  <nav><button data-t="home" class="on">Home</button><button data-t="freq">Agentic trading</button><button data-t="dash">Live</button><button data-t="trade">Trade</button><button data-t="keys">API keys</button><button data-t="profile" id="nav-profile" style="display:none">Profile</button></nav>
  <div><span id="who"></span> <button class="btn sec" id="connect">Sign in</button></div>
</header>
<main>
<section id="home" class="on">
  <div class="hero home">
    <img class="crest" src="/brand/skw-crest.webp" alt="SKW crest" width="624" height="354" fetchpriority="high">
    <h1>SKW Trading Market<small>&amp; Tollgate for Agents</small></h1>
    <p>Trade any Solana token with a rug-pull check on every order. Watch AI agents trade and talk in real time. Give your own agents 128 pay-per-call tools. Non-custodial: you sign every transaction in your own wallet.</p>
    <div class="cta"><button class="btn" data-go="trade">Start trading</button><button class="btn sec" data-go="freq">Watch agentic trading</button></div>
  </div>
  <div class="grid entry">
    <div class="card" data-go="freq"><div class="ic">📡</div><b>Agentic trading</b><div class="note">Every real agent call as a tone, a wave and a point in the quantum field. Frequencies, resonance and the council at work.</div><span class="go">Open →</span></div>
    <div class="card" data-go="dash"><div class="ic">📊</div><b>Live</b><div class="note">Agent traffic today, paid tool calls, tool demand spectrum and the crypto market at a glance.</div><span class="go">Open →</span></div>
    <div class="card" data-go="trade"><div class="ic">⚡</div><b>Trade</b><div class="note">Solana terminal with live charts and best-price routing through Jupiter. Ethereum, Base, Arbitrum and Polygon through cross-chain swap.</div><span class="go">Open →</span></div>
    <div class="card" data-go="keys"><div class="ic">🤖</div><b>Tollgate for Agents</b><div class="note">Connect your own AI agent with an API key: 10 tools free, all 124 with Pro or Desk. Or pay per call in USDC over x402 and MCP.</div><span class="go">Open →</span></div>
  </div>
  <h2>How it works</h2>
  <div class="grid steps">
    <div class="card"><b>Sign in with Google</b><p class="note">One click, no extension needed. Add a wallet address in your profile when you want to trade live.</p></div>
    <div class="card"><b>Pick a token</b><p class="note">Live price, liquidity, volume and buy/sell pressure. Every order is checked for rug-pull and honeypot signs before you sign.</p></div>
    <div class="card"><b>Sign in your wallet</b><p class="note">We build the transaction, you sign it in Phantom, Solflare or MetaMask. Funds go straight from your wallet to the DEX. A 0.3% platform fee is shown before you sign.</p></div>
  </div>
</section>

<section id="dash">
  <div class="hero">
    <h1>Live</h1>
    <p>What agents are doing on the tollgate right now: requests, paid calls, the most wanted tools and the market.</p>
    <div class="cta"><button class="btn" data-go="trade">Trade</button><button class="btn sec" data-go="agents">Connect your agent</button></div>
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



<section id="trade">
  <div class="tl">
    <div class="card mk"><input id="mk-q" placeholder="Search any Solana token or paste a mint"><table><thead><tr><th>Token</th><th>Price</th><th>24h</th></tr></thead><tbody id="mk-b"></tbody></table></div>
    <div class="card">
      <div class="thead"><span class="px" id="t-px">–</span><span class="s">Market<b id="t-coin">SOL / USD</b></span><span class="s">1h<b id="t-ch1">–</b></span><span class="s">24h<b id="t-ch">–</b></span><span class="s">Liquidity<b id="t-liq">–</b></span><span class="s">24h volume<b id="t-vol">–</b></span><span class="s">Market cap<b id="t-mc">–</b></span><span class="s">Buys / sells 24h<b id="t-bs">–</b></span></div>
      <div class="ivs" id="ivs"><button data-i="1m">1m</button><button data-i="5m">5m</button><button data-i="15m" class="on">15m</button><button data-i="1h">1h</button><button data-i="4h">4h</button><button data-i="1d">1D</button></div>
      <div id="chart"></div>
      <p class="note">Live Solana DEX prices (GeckoTerminal, DEX Screener). Orders route through Jupiter for the best price across all Solana DEXs.</p>
    </div>
    <div>
      <div class="card">
        <div class="k">Trade</div>
        <div class="side"><button class="long on" id="t-long">Buy</button><button class="short" id="t-short">Sell</button></div>
        <label id="t-lbl">Spend (USDC)</label><input id="t-size" type="number" min="0" step="any" value="10">
        <div class="note" id="t-est" style="margin-top:8px"></div>
        <button class="btn" style="width:100%;margin-top:10px" id="t-go">Sign in to trade</button>
        <div class="note" id="t-msg" style="margin-top:8px">Non-custodial: you sign every trade in your own wallet. Every trade is rug-checked first. 0.3% platform fee is included in the route.</div>
        <button class="btn sec" style="width:100%;margin-top:10px" data-go="swap">Other chains: Ethereum, Base, Arbitrum, Polygon →</button>
      </div>
      <div class="card ob" style="margin-top:12px"><div class="k" style="display:block;margin-bottom:6px">Recent trades</div><div id="tr-l"></div></div>
    </div>
  </div>
</section>

<section id="freq">
  <div class="hero" style="padding-top:18px"><h1 style="font-size:clamp(24px,4vw,40px)">Agentic trading</h1><p>Agents talk in frequencies. Every tool has its own carrier frequency. Each real agent call is encoded as 16-FSK: every byte becomes two tones nine hertz apart, then decoded back to text. Press listen to hear the traffic. A visualization of real requests, not a trading signal.</p></div>
  <div class="card"><div class="k" style="display:flex;justify-content:space-between;align-items:center"><span>📡 16-FSK agent communication · live <span id="fsk-info" class="note"></span></span><button class="btn sec" id="fsk-snd">🔊 Listen</button></div><canvas id="fsk-c"></canvas><div class="fsklog" id="fsk-log"><div class="note">Waiting for the next agent call…</div></div></div>
  <div class="card" style="margin-top:14px"><div class="k">🧬 Agent DNA · every base pair is one real call (newest on the right). Base from the carrier frequency, double rung = paid call.</div><canvas id="dna-c"></canvas></div>
  <div class="grid" style="grid-template-columns:2fr 1fr;margin-top:14px">
    <div class="card"><div class="k" style="display:flex;justify-content:space-between"><span>🎼 Frequency spectrum · 22 tones</span><span>active <b class="hz" id="f-act">528 Hz</b> · next <b class="hz" id="f-next">639 Hz</b></span></div><canvas id="spec-c" style="width:100%;height:190px;display:block"></canvas></div>
    <div class="card"><div class="k" style="display:flex;justify-content:space-between"><span>〰 Schumann resonance + harmonics</span><b class="hz" id="sch-hz">7.83 Hz</b></div><canvas id="sch-c" style="width:100%;height:150px;display:block"></canvas><div class="note" id="sch-note">Kp –</div></div>
  </div>
  <h2>Sacred geometry of every frequency</h2>
  <p class="note">Each card glows when an agent calls a tool tuned to that frequency. Click a card to pin it.</p>
  <div id="fx-grid" class="fxg"></div>

  <div class="hero" style="padding-top:18px"><h1 style="font-size:clamp(24px,4vw,40px)">Resonance and the quantum field</h1><p>Every tool is an oscillator on the ring. Each real agent call travels from the consensus core as a wave and makes its tool resonate. All waves add up in one field: the dome above, interference on the ground, the core in the middle. A call stamped with a quantum random byte travels as an entangled double helix.</p><p class="note" id="q-src">Entropy source: checking…</p></div>
  <div class="grid" style="grid-template-columns:3fr 1fr">
    <div class="card" style="padding:8px"><canvas id="reso-c"></canvas></div>
    <div class="card"><div class="k">Live signal feed</div><div class="feed" id="feed"><div class="note">Listening for agents…</div></div></div>
  </div>
  <div class="legend"><span><i style="background:#f5c542"></i>paid</span><span><i style="background:#d9dde3"></i>402 payment request</span><span><i style="background:#3ab8ff"></i>via MCP</span><span><i style="background:#ff4d5e"></i>error</span><span><i style="background:#d2aaff"></i>quantum-stamped (entangled double helix)</span><span>Ring colour = tool family</span></div>
</section>

<section id="swap">
  <div class="card" style="max-width:560px">
    <a href="#trade" data-go="trade">← Back to Trade</a><h2>Cross-chain swap with a rug-pull check</h2>
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

<section id="keys">
  <div class="hero" style="padding-top:18px"><h1 style="font-size:clamp(24px,4vw,40px)">API keys for your agent</h1><p>Connect your own AI agent and let it trade and research automatically. Non-custodial: the agent signs its own transactions, we never hold keys or funds. Every trade carries the 0.3% platform fee.</p></div>
  <div class="grid plans" id="plans"></div>
  <div class="grid" style="grid-template-columns:2fr 1fr;margin-top:14px">
    <div class="card"><div class="k" style="display:flex;justify-content:space-between;align-items:center"><span>Your keys <span id="k-plan" class="note"></span></span><span style="display:flex;gap:8px"><input id="k-label" placeholder="Agent name" style="width:160px;padding:7px"><button class="btn" id="k-new">Create key</button></span></div><div id="k-new-out"></div><div id="k-list" class="note" style="margin-top:10px">Sign in to create a key.</div></div>
    <div class="card"><div class="k">Use it</div><p class="note">HTTP: send the key in a header with any tool.</p><code style="display:block;white-space:pre-wrap;word-break:break-all">curl -H "X-API-Key: skw_…" https://skinwinking.com/api/v1/data/fear-greed</code><p class="note">MCP: add the header <code>X-API-Key</code> to <code>https://skinwinking.com/mcp</code>, or pass the key as <code>paymentProof</code>. Without a key, every tool still works pay-per-call over x402.</p><p class="note">Free plan tools: <span id="k-free"></span></p></div>
  </div>
  <div id="k-msg" class="note" style="margin-top:10px"></div>
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
<section id="profile">
  <div class="card" style="max-width:560px;margin:40px auto">
    <h2>Profile</h2>
    <div id="p-info" class="note">Loading…</div>
    <label>Solana wallet address</label><input id="p-sol" placeholder="e.g. DSvMhi…">
    <label>EVM wallet address (Ethereum, Base, Polygon…)</label><input id="p-evm" placeholder="e.g. 0x64f0…">
    <button class="btn" style="width:100%;margin-top:14px" id="p-save">Save wallets</button>
    <div id="p-msg" class="note" style="margin-top:10px">Add your wallet addresses to trade. Your keys stay yours — we never hold funds.</div>
  </div>
</section>

<div id="wm"><div class="wmbox"><div class="wmhead"><b>Connect wallet</b><button class="wmx" id="wmx">×</button></div><div class="note">Connect a wallet to sign transactions. Your keys never leave your wallet.</div><div id="wlist"></div></div></div>
<footer class="site">
  <div class="fcols">
    <div class="fbrand"><img src="/brand/skw-crest.webp" alt="SKW" width="124" height="70"><p><b style="color:#fff">SKW Trading Market &amp; Tollgate for Agents</b><br>Non-custodial. You sign every transaction in your own wallet.</p></div>
    <div><h4>Market</h4><a href="#trade" data-go="trade">Trade</a><a href="#swap" data-go="swap">Cross-chain swap</a><a href="#freq" data-go="freq">Agentic trading</a><a href="#dash" data-go="dash">Live</a></div>
    <div><h4>Company</h4><a href="/about">About us</a><a href="/contact">Contact</a><a href="mailto:support@skinwinking.com">support@skinwinking.com</a></div>
    <div><h4>Legal</h4><a href="/privacy">Privacy Policy</a><a href="/terms">Terms of Service</a><a href="/cookies">Cookie Policy</a><a href="/risk">Risk Disclosure</a></div>
    <div><h4>Developers</h4><a href="#keys" data-go="keys">API keys</a><a href="#agents" data-go="agents">API &amp; tools</a><a href="/llms.txt">llms.txt</a><a href="/openapi.json">OpenAPI</a><a href="/.well-known/agent-card.json">A2A agent card</a><a href="/.well-known/security.txt">Security</a></div>
  </div>
  <div class="fbot"><span>© 2026 SKW · SkinWinKing</span><span>Crypto-assets are volatile. Nothing here is investment advice.</span></div>
</footer>
<script src="https://cdn.jsdelivr.net/npm/@solana/web3.js@1.95.3/lib/index.iife.min.js" defer></script>
<script src="https://cdn.jsdelivr.net/npm/lightweight-charts@4.2.0/dist/lightweight-charts.standalone.production.js" defer></script>
<script>
const $=s=>document.querySelector(s), fmt=n=>Number(n).toLocaleString('en-US'), H=t=>String(t??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const TOKENS={
 solana:[['SOL','SOL',9],['USDC','USDC',6],['USDT','USDT',6],['JUP','JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN',6],['BONK','DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',5],['WIF','EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm',6]],
 evm:[['ETH','ETH',18],['USDC','USDC',6]],
 polygon:[['POL','POL',18],['USDC','USDC',6]]};
const CHAIN_ID={ethereum:'0x1',base:'0x2105',arbitrum:'0xa4b1',polygon:'0x89'};
const EXPLORER={solana:'https://solscan.io/tx/',ethereum:'https://etherscan.io/tx/',base:'https://basescan.org/tx/',arbitrum:'https://arbiscan.io/tx/',polygon:'https://polygonscan.com/tx/'};
let me=null,lastQuote=null;
function go(t){if(!t||!document.getElementById(t)||document.getElementById(t).tagName!=='SECTION')t='home';document.querySelectorAll('nav button,section').forEach(x=>x.classList.remove('on'));$('#'+t).classList.add('on');if(t==='agents')$('#tools').classList.add('on');const b=document.querySelector('nav button[data-t='+t+']');if(b)b.classList.add('on');if(t==='freq')dispatchEvent(new Event('resize'));if(t==='trade'&&window.onTrade)onTrade();try{history.replaceState(null,'','#'+t)}catch(e){}scrollTo({top:0})}
document.querySelectorAll('nav button').forEach(b=>b.onclick=()=>go(b.dataset.t));
document.addEventListener('click',e=>{const g=e.target.closest('[data-go]');if(g){e.preventDefault();go(g.dataset.go)}});

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
 const cols=['245,197,66','217,221,227','58,184,255','255,223,126'];
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
function openWallets(){window.location.href='/auth/google'}
function connectWallet(){const l=$('#wlist');l.innerHTML='';
 const g1=document.createElement('div');g1.className='wgrp';g1.textContent='Solana';l.appendChild(g1);
 solanaWallets().forEach(w=>l.appendChild(wbtn(w.name,w.icon,w.p?'Detected':'Install',()=>{if(w.p){w.p.connect().then(()=>{wallet={kind:'solana',name:w.name,p:w.p};$('#wm').classList.remove('on')}).catch(()=>{})}else open(w.url,'_blank')})));
 const g2=document.createElement('div');g2.className='wgrp';g2.textContent='Ethereum, Base, Arbitrum, Polygon';l.appendChild(g2);
 evmWallets.forEach(w=>l.appendChild(wbtn(w.info.name,w.info.icon,'Detected',()=>{w.provider.request({method:'eth_requestAccounts'}).then(()=>{wallet={kind:'evm',name:w.info.name,p:w.provider};$('#wm').classList.remove('on')}).catch(()=>{})})));
 if(!evmWallets.length&&window.ethereum)l.appendChild(wbtn('Browser wallet','#f5c542','Detected',()=>{window.ethereum.request({method:'eth_requestAccounts'}).then(()=>{wallet={kind:'evm',name:'Browser wallet',p:window.ethereum};$('#wm').classList.remove('on')}).catch(()=>{})}));
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
function showMe(){if(window.loadKeys)setTimeout(loadKeys,0);lastQuote=null;$('#sign').disabled=true;
 if(me&&me.email){$('#who').textContent=me.name||me.email;$('#nav-profile').style.display=''}
 else if(me){$('#who').textContent=(me.wallet?me.wallet+' · ':'')+me.address.slice(0,4)+'…'+me.address.slice(-4);$('#nav-profile').style.display='none'}
 else{$('#who').textContent='';$('#nav-profile').style.display='none'}
 $('#connect').textContent=me?'Sign out':'Sign in'}
$('#connect').onclick=async()=>{if(me){await fetch('/auth/logout',{method:'POST'});me=null;wallet=null;showMe()}else openWallets()};
function alertBox(t){$('#qout').innerHTML='<span class=bad>'+H(t)+'</span>';go('swap')}

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
 if(!wallet)return connectWallet();
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
 const FAM={data:'245,197,66',web:'217,221,227',util:'58,184,255',ai:'255,223,126',core:'255,255,255'};
 const OUT={paid:'245,197,66',payment_required:'217,221,227',mcp:'58,184,255',client_error:'255,77,94',server_error:'255,77,94',rate_limited:'255,176,32'};
 const fit=()=>{const r=c.getBoundingClientRect();W=c.width=r.width*devicePixelRatio;H=c.height=560*devicePixelRatio;layout()};
 function layout(){const R=Math.min(W,H)*0.40;nodes=cat.map((t,i)=>{const a=-Math.PI/2+i*2*Math.PI/cat.length,fam=(t.path.split('/')[3]||'core');return{id:t.id,fam:FAM[fam]?fam:'core',x:W/2+Math.cos(a)*R,y:H/2+Math.sin(a)*R,a,f:0.6+(i%9)*0.22,e:0}})}
 fetch('/app/catalog').then(r=>r.json()).then(j=>{cat=j;fit()});addEventListener('resize',()=>{if(cat.length)fit()});
 function pulse(ev){const qb=Q.bytes.length?Q.bytes.shift():null;ev.q=qb!==null&&Q.quantum;ev.phase=qb===null?0:qb/255*Math.PI*2;Q.n++;if(ev.q)Q.q++;window.onAgentEvent&&window.onAgentEvent(ev);const n=nodes.find(n=>n.id===ev.tool);if(!n)return;const col=ev.q?'210,170,255':ev.source==='mcp'&&ev.outcome==='payment_required'?OUT.mcp:(OUT[ev.outcome]||OUT.payment_required);waves.push({n,col,p:0,q:ev.q,ph:ev.phase});core=1;
  const f=$('#feed');if(f.firstChild&&f.firstChild.classList&&f.firstChild.classList.contains('note'))f.innerHTML='';const d=document.createElement('div');d.innerHTML='<span class=t>'+new Date(ev.t).toLocaleTimeString()+'</span><span style="color:rgb('+col+')">●</span><span>'+H(ev.tool.replace(/_/g,' '))+'</span><span class=t>'+H(ev.source)+' · '+H(ev.country)+'</span>';f.prepend(d);while(f.children.length>40)f.lastChild.remove()}
 const Q={bytes:[],quantum:false,src:'',n:0,q:0};async function qpool(){try{const d=await (await fetch('/app/quantum')).json();Q.bytes=Q.bytes.concat(d.bytes||[]).slice(-512);Q.quantum=!!d.quantum;Q.src=d.source;$('#q-src').textContent='Entropy source: '+d.source+(d.round?' · round '+d.round:'')+' · '+(Q.n?Math.round(100*Q.q/Q.n):0)+'% of calls stamped'}catch(e){}}qpool();setInterval(qpool,60000);
 async function poll(){try{const r=await (await fetch('/app/events?since='+since)).json();r.events.forEach((e,i)=>setTimeout(()=>pulse(e),i*180));if(r.events.length)since=r.events[r.events.length-1].t}catch(e){}}
 poll();setInterval(poll,4000);
 const still=matchMedia('(prefers-reduced-motion: reduce)').matches;
 let core=0;const DOME=Array.from({length:160},(_,i)=>({a:Math.random()*Math.PI,r:0.62+Math.random()*0.4,sp:0.2+Math.random()*0.6}));
 (function frame(){if(!W){requestAnimationFrame(frame);return}t+=0.016;x.clearRect(0,0,W,H);const cx=W/2,cy=H/2,d=devicePixelRatio,Rr=Math.min(W,H)*0.4;core*=0.97;
  // quantum field: interference of waves from every resonating tool, sampled on a grid
  const hotN=nodes.filter(n=>n.e>0.04);const gs=14*d;for(let gx=gs/2;gx<W;gx+=gs)for(let gy=gs/2;gy<H;gy+=gs){let v=Math.sin(Math.hypot(gx-cx,gy-cy)/(18*d)-t*3)*(0.15+core*0.5);for(const n of hotN)v+=Math.sin(Math.hypot(gx-n.x,gy-n.y)/(11*d)-t*6)*n.e;const a=Math.min(0.5,Math.abs(v)*0.12);if(a>0.02){x.fillStyle=v>0?'rgba(210,170,255,'+a+')':'rgba(125,249,255,'+a+')';x.fillRect(gx-1.2*d,gy-1.2*d,2.4*d,2.4*d)}}
  // dome of the field
  for(const p of DOME){const ang=p.a+Math.sin(t*p.sp)*0.05,rr=Rr*p.r*(1+core*0.05);x.fillStyle='rgba(210,170,255,'+(0.15+0.35*Math.abs(Math.sin(t*p.sp*2+p.a*5)))+')';x.beginPath();x.arc(cx+Math.cos(Math.PI+ang)*rr,cy-Math.sin(ang)*rr*0.55-Rr*0.15,1.3*d,0,7);x.fill()}
  x.strokeStyle='rgba(210,170,255,.25)';x.lineWidth=1*d;x.beginPath();x.ellipse(cx,cy-Rr*0.15,Rr*1.02,Rr*0.6,0,Math.PI,2*Math.PI);x.stroke();
  // consensus core
  const cg=x.createRadialGradient(cx,cy,0,cx,cy,Rr*0.22*(1+core*0.6));cg.addColorStop(0,'rgba(255,255,255,'+(0.25+core*0.6)+')');cg.addColorStop(0.4,'rgba(245,197,66,'+(0.15+core*0.4)+')');cg.addColorStop(1,'rgba(210,170,255,0)');x.fillStyle=cg;x.beginPath();x.arc(cx,cy,Rr*0.22*(1+core*0.6),0,7);x.fill();
  for(let k=0;k<3;k++){x.beginPath();const r0=Math.min(W,H)*(0.07+k*0.035);for(let a=0;a<=Math.PI*2+0.01;a+=0.04){const rr=r0+Math.sin(a*(6+k*3)+t*(2+k))*4*d*(1+energy*2);x.lineTo(cx+Math.cos(a)*rr,cy+Math.sin(a)*rr)}x.strokeStyle='rgba(245,197,66,'+(0.55-k*0.15)+')';x.lineWidth=1.5*d;x.shadowColor='rgba(245,197,66,.8)';x.shadowBlur=12*d;x.stroke()}
  x.shadowBlur=0;x.fillStyle='#fff';x.font=(12*d)+'px system-ui';x.textAlign='center';x.fillText('AGENTS',cx,cy+4*d);
  waves=waves.filter(w=>w.p<=1);for(const w of waves){w.p+=0.018;const n=w.n,len=Math.hypot(n.x-cx,n.y-cy),ux=(n.x-cx)/len,uy=(n.y-cy)/len,px=-uy,py=ux;x.beginPath();
   for(const sgn of w.q?[1,-1]:[1]){x.beginPath();for(let s=0;s<=1;s+=0.02){const along=Math.min(w.p,1)*len*s,env=Math.sin(Math.PI*s)*Math.max(0,1-Math.abs(s-1)*0.6),wob=sgn*Math.sin(s*28-t*12+w.ph)*7*d*env;x.lineTo(cx+ux*along+px*wob,cy+uy*along+py*wob)}
   x.strokeStyle='rgba('+w.col+',.9)';x.lineWidth=(w.q?1.6:2)*d;x.shadowColor='rgba('+w.col+',1)';x.shadowBlur=16*d;x.stroke()}if(w.p>=0.98)n.e=1}
  x.shadowBlur=0;for(const n of nodes){n.e*=0.985;const base=3*d,ring=base+2*d+Math.sin(t*n.f*6)*1.5*d+n.e*14*d;
   x.beginPath();x.arc(n.x,n.y,base,0,Math.PI*2);x.fillStyle='rgba('+FAM[n.fam]+','+(0.55+n.e*0.45)+')';x.fill();
   x.beginPath();for(let a=0;a<=Math.PI*2+0.01;a+=0.2){const rr=ring+Math.sin(a*5+t*n.f*8)*n.e*4*d;x.lineTo(n.x+Math.cos(a)*rr,n.y+Math.sin(a)*rr)}
   x.strokeStyle='rgba('+FAM[n.fam]+','+(0.18+n.e*0.8)+')';x.lineWidth=(1+n.e*1.5)*d;if(n.e>0.05){x.shadowColor='rgba('+FAM[n.fam]+',1)';x.shadowBlur=18*d*n.e}x.stroke();x.shadowBlur=0;
   if(n.e>0.15){x.fillStyle='rgba(255,255,255,'+n.e+')';x.font=(11*d)+'px system-ui';x.textAlign=Math.cos(n.a)>0?'left':'right';x.fillText(n.id.replace(/_/g,' '),n.x+Math.cos(n.a)*12*d,n.y+Math.sin(n.a)*12*d+4*d)}}
  if(!still||waves.length)requestAnimationFrame(frame);else setTimeout(()=>requestAnimationFrame(frame),500)})()})();
// Frequencies (ported from Algoritam Superlive): 22 tones, 16-FSK, agent DNA, sacred geometry, Schumann scope.
(function freqs(){
 const SOLF=[[40,'γ40','#ffffff','gamma, focus'],[111,'111','#d9dde3','beginning'],[174,'Ut','#ff4466','release tension'],[222,'222','#d9dde3','balance'],[285,'Re','#ff8c40','regeneration'],[333,'333','#d9dde3','growth'],[369,'369','#ffd700','Tesla 3-6-9, inflow'],[396,'Mi','#f0b429','release fear'],[417,'Fa','#9be15d','change'],[432,'432','#d9dde3','natural tuning'],[444,'444','#d9dde3','stability'],[528,'Sol','#00e5a0','renewal'],[555,'555','#d9dde3','new direction'],[639,'La','#00cfff','connection'],[693,'693','#e6c200','money, 693'],[741,'Si','#1a6fff','clarity'],[777,'777','#d9dde3','luck'],[852,'Do+','#9945ff','awakening'],[888,'∞','#b048ff','flow'],[936,'936','#fff176','abundance'],[963,'AUM','#ff66cc','higher frequency'],[999,'999','#d9dde3','cycle complete']];
 const hexRgb=h=>[parseInt(h.slice(1,3),16),parseInt(h.slice(3,5),16),parseInt(h.slice(5,7),16)];
 const rgb=(c,k,a)=>'rgba('+Math.min(255,Math.round(c[0]*k))+','+Math.min(255,Math.round(c[1]*k))+','+Math.min(255,Math.round(c[2]*k))+','+a+')';
 const FAMIDX={data:11,web:13,util:8,ai:15,council:20,router:7,alpha:17,security:4,core:6};
 let cat=[],carriers={};fetch('/app/catalog').then(r=>r.json()).then(j=>{cat=j;const seen={};j.forEach(t=>{const fam=(t.path||'').split('/')[3]||'core';const base=FAMIDX[fam]??6;seen[fam]=(seen[fam]||0)+1;carriers[t.id]=SOLF[(base+(seen[fam]-1)*5)%SOLF.length][0]})});
 const F={tones:[],n:0,snd:false,ac:null,STEP:9},DNA=[],HOT={};let act=528,next=639,pin=0,T=0,kp=0;
 const enc=(hz,txt)=>{const b=new TextEncoder().encode(txt.slice(0,32)),t=[];b.forEach(x=>{t.push(hz+(x>>4)*F.STEP,hz+(x&15)*F.STEP)});return t};
 const dec=(hz,t)=>{const b=[];for(let i=0;i+1<t.length;i+=2)b.push((Math.round((t[i]-hz)/F.STEP)<<4)|Math.round((t[i+1]-hz)/F.STEP));return new TextDecoder().decode(new Uint8Array(b))};
 const OUTC={paid:'245,197,66',payment_required:'217,221,227',client_error:'255,77,94',server_error:'255,77,94',rate_limited:'255,176,32'};
 window.onAgentEvent=ev=>{const hz=carriers[ev.tool]||528;const msg=ev.tool+':'+(ev.outcome==='paid'?'PAID':'402')+':'+ev.country;
  const tones=enc(hz,msg),back=dec(hz,tones),ok=back===msg,col=ev.source==='mcp'?'58,184,255':(OUTC[ev.outcome]||'217,221,227');
  tones.forEach(f=>F.tones.push({f,col}));if(F.tones.length>1400)F.tones.splice(0,F.tones.length-1400);F.n++;HOT[hz]=1;
  const i=SOLF.findIndex(s=>s[0]===hz);next=act;act=hz;if(i>=0)next=SOLF[(i+1)%SOLF.length][0];$('#f-act').textContent=act+' Hz';$('#f-next').textContent=next+' Hz';
  const lg=$('#fsk-log');if(lg.firstChild&&lg.firstChild.classList&&lg.firstChild.classList.contains('note'))lg.innerHTML='';
  const nm=(SOLF.find(s=>s[0]===hz)||[0,''])[1];const d=document.createElement('div');d.innerHTML='<span class="hz">'+hz+' Hz '+nm+'</span> '+tones.length+' tones → <b>'+back.replace(/</g,'&lt;')+'</b> '+(ok?'<span class=ok>✔</span>':'<span class=bad>✘</span>');lg.prepend(d);while(lg.children.length>30)lg.lastChild.remove();
  $('#fsk-info').textContent='· '+F.n+' messages encoded';
  DNA.push({hz,base:'ATGC'[hz%4],col,paid:ev.outcome==='paid',t:performance.now()});if(DNA.length>70)DNA.shift();energy=Math.min(1,energy+0.05);
  if(F.snd&&F.ac){let t0=F.ac.currentTime+0.02;tones.slice(0,32).forEach(f=>{const o=F.ac.createOscillator(),g=F.ac.createGain();o.frequency.value=f;o.type='sine';g.gain.setValueAtTime(0,t0);g.gain.linearRampToValueAtTime(0.06,t0+0.005);g.gain.linearRampToValueAtTime(0,t0+0.055);o.connect(g).connect(F.ac.destination);o.start(t0);o.stop(t0+0.06);t0+=0.06})}};
 $('#fsk-snd').onclick=e=>{F.snd=!F.snd;if(F.snd&&!F.ac){try{F.ac=new (window.AudioContext||window.webkitAudioContext)()}catch(_){F.snd=false}}e.target.textContent=F.snd?'🔇 Mute':'🔊 Listen'};
 const fitC=c=>{const r=c.getBoundingClientRect();if(!r.width)return null;const d=devicePixelRatio;if(c.width!==Math.round(r.width*d)){c.width=Math.round(r.width*d);c.height=Math.round(r.height*d)}return {x:c.getContext('2d'),W:c.width,H:c.height,d}};
 function drawFsk(){const g=fitC($('#fsk-c'));if(!g)return;const {x,W,H,d}=g;x.fillStyle='rgba(0,0,0,.35)';x.fillRect(0,0,W,H);
  const fmin=20,fmax=1150,y=f=>H-10*d-(f-fmin)/(fmax-fmin)*(H-20*d);x.lineWidth=1;x.font=(9*d)+'px system-ui';
  SOLF.forEach((s,i)=>{if(i%2)return;x.strokeStyle='rgba(217,221,227,.07)';x.beginPath();x.moveTo(0,y(s[0]));x.lineTo(W,y(s[0]));x.stroke();x.fillStyle='rgba(217,221,227,.4)';x.fillText(s[0]+' Hz',4*d,y(s[0])-2*d)});
  const n=F.tones.length,w=Math.max(1.5*d,W/Math.max(380,n));F.tones.forEach((tn,i)=>{const px=W-(n-i)*w;if(px<0)return;x.fillStyle='rgba('+tn.col+',.9)';x.shadowColor='rgba('+tn.col+',1)';x.shadowBlur=6*d;x.fillRect(px,y(tn.f)-2*d,w,4*d)});x.shadowBlur=0}
 function drawDna(){const g=fitC($('#dna-c'));if(!g)return;const {x,W,H,d}=g;x.clearRect(0,0,W,H);const n=DNA.length,step=W/72,cy=H/2,amp=H*0.32,t=T*0.016;
  for(let k=0;k<2;k++){x.beginPath();for(let px=0;px<=W;px+=4){const ph=px/W*Math.PI*7+t*1.4+k*Math.PI;x.lineTo(px,cy+Math.sin(ph)*amp)}x.strokeStyle=k?'rgba(217,221,227,.55)':'rgba(245,197,66,.7)';x.lineWidth=2*d;x.stroke()}
  DNA.forEach((b,i)=>{const px=W-(n-i)*step-step/2;if(px<0)return;const ph=px/W*Math.PI*7+t*1.4,y1=cy+Math.sin(ph)*amp,y2=cy+Math.sin(ph+Math.PI)*amp,age=Math.min(1,(performance.now()-b.t)/600);
   x.strokeStyle='rgba('+b.col+','+(0.35+0.6*age)+')';x.lineWidth=(b.paid?3:1.6)*d;x.shadowColor='rgba('+b.col+',1)';x.shadowBlur=(i===n-1?16:6)*d;x.beginPath();x.moveTo(px,y1);x.lineTo(px,y2);x.stroke();
   if(b.paid){x.beginPath();x.moveTo(px+3*d,y1);x.lineTo(px+3*d,y2);x.stroke()}x.shadowBlur=0;x.fillStyle='rgba(255,255,255,.85)';x.font=(9*d)+'px ui-monospace';x.textAlign='center';x.fillText(b.base,px,Math.min(y1,y2)-6*d)})}
 function drawSpec(){const g=fitC($('#spec-c'));if(!g)return;const {x,W,H,d}=g;x.clearRect(0,0,W,H);const n=SOLF.length,bw=W/n;
  SOLF.forEach((s,i)=>{const c=hexRgb(s[2]),hot=HOT[s[0]]||0,on=s[0]===(pin||act),h=(H-26*d)*(0.12+0.25*Math.abs(Math.sin(T*0.02*(1+i%5)+i))*(0.4+energy)+0.6*hot+(on?0.15:0));
   const gr=x.createLinearGradient(0,H-20*d-h,0,H-20*d);gr.addColorStop(0,rgb(c,1.2,0.95));gr.addColorStop(1,rgb(c,0.4,0.2));x.fillStyle=gr;x.shadowColor=rgb(c,1,1);x.shadowBlur=(on?18:6+12*hot)*d;
   x.fillRect(i*bw+bw*0.18,H-20*d-h,bw*0.64,h);x.shadowBlur=0;x.fillStyle=on?'#fff':'rgba(217,221,227,.7)';x.font=(on?'bold ':'')+(9*d)+'px system-ui';x.textAlign='center';x.fillText(String(s[0]),i*bw+bw/2,H-6*d)})}
 function drawSch(){const g=fitC($('#sch-c'));if(!g)return;const {x,W,H,d}=g;x.clearRect(0,0,W,H);x.strokeStyle='#15151a';x.lineWidth=1;for(let y=0;y<=H;y+=H/4){x.beginPath();x.moveTo(0,y);x.lineTo(W,y);x.stroke()}
  const f=1+kp*0.015,harm=[[1,0.28],[1.83,0.09],[2.66,0.05],[3.49,0.03],[4.32,0.02]];[['#7df9ff',0],['rgba(245,197,66,.6)',1]].forEach(([col,k])=>{x.beginPath();x.strokeStyle=col;x.lineWidth=(k?1:1.8)*d;x.shadowColor=col;x.shadowBlur=8*d;
   for(let px=0;px<W;px+=2){const ph=px/W*Math.PI*2*2.4+T*0.05*f+k*0.6;let y=H/2;harm.forEach(([m,a])=>{y+=Math.sin(ph*m)*H*a*(k?0.6:1)*(1+kp*0.06)});px?x.lineTo(px,y):x.moveTo(px,y)}x.stroke()});x.shadowBlur=0}
 // 3D helpers and the Superlive geometry set
 const rot3=(p,ry,rx)=>{const cy=Math.cos(ry),sy=Math.sin(ry),x1=p[0]*cy+p[2]*sy,z1=-p[0]*sy+p[2]*cy,cx=Math.cos(rx),sx=Math.sin(rx);return [x1,p[1]*cx-z1*sx,p[1]*sx+z1*cx]};
 const pj=(p,cx,cy,sc,cam)=>{const f=cam/(cam+p[2]);return {x:cx+p[0]*sc*f,y:cy-p[1]*sc*f,z:p[2],s:f}};
 const pathOf=(c,pts)=>{c.beginPath();pts.forEach((p,j)=>j?c.lineTo(p.x,p.y):c.moveTo(p.x,p.y))};
 const view=(W,H,ry,rx,sc)=>p=>pj(rot3(p,ry,rx),W/2,H/2,sc,5);
 const edges=(c,V,E,col,a,lw)=>{c.strokeStyle=rgb(col,1,a);c.lineWidth=lw||1.2;E.forEach(([i,j])=>{c.beginPath();c.moveTo(V[i].x,V[i].y);c.lineTo(V[j].x,V[j].y);c.stroke()})};
 const dot=(c,p,r,col,a)=>{c.fillStyle=rgb(col,1,Math.max(0,Math.min(1,a)));c.beginPath();c.arc(p.x,p.y,Math.max(0.6,r*p.s),0,7);c.fill()};
 const TETRA=[[1,1,1],[1,-1,-1],[-1,1,-1],[-1,-1,1]].map(v=>v.map(q=>q*0.7)),P4=[[0,1],[0,2],[0,3],[1,2],[1,3],[2,3]],OCTA=[[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]].map(v=>v.map(q=>q*0.85));
 const rnd=(a,b)=>a+Math.random()*(b-a);const GAL=Array.from({length:240},(_,i)=>{const arm=i%3,r=0.08+Math.pow(Math.random(),0.7)*0.95;return {r,th0:arm*Math.PI*2/3+r*3.2+rnd(-0.25,0.25),y:rnd(-0.06,0.06)}});
 const FIB=Array.from({length:200},(_,i)=>{const k=i+0.5;return {ph:Math.acos(1-2*k/200),th:Math.PI*(1+Math.sqrt(5))*k}});
 const FX={
  174:['Tetrahedron',(c,W,H,t,col,a,s)=>{const f=view(W,H,t*0.012*s,-0.4+Math.sin(t*0.01)*0.2,Math.min(W,H)*0.3*(1+0.1*Math.sin(t*0.05*s)));const V=TETRA.map(f);edges(c,V,P4,col,a,1.6);edges(c,TETRA.map(p=>f(p.map(q=>-q*0.5))),P4,col,a*0.55,1);V.forEach(p=>dot(c,p,3,col,a))}],
  285:['Double helix',(c,W,H,t,col,a,s)=>{const f=view(W,H,t*0.01*s,-0.25,Math.min(W,H)*0.34),A=[],B=[];for(let k=0;k<48;k++){const y=(k/47-0.5)*2.6,g=y*2.2+t*0.03*s;A.push(f([Math.cos(g)*0.6,y,Math.sin(g)*0.6]));B.push(f([-Math.cos(g)*0.6,y,-Math.sin(g)*0.6]))}[A,B].forEach(S=>{pathOf(c,S);c.strokeStyle=rgb(col,1,a);c.lineWidth=1.8;c.stroke()});for(let k=0;k<48;k+=3){c.beginPath();c.moveTo(A[k].x,A[k].y);c.lineTo(B[k].x,B[k].y);c.strokeStyle=rgb(col,1,a*0.4);c.lineWidth=1;c.stroke()}}],
  396:['Lattice',(c,W,H,t,col,a,s)=>{const f=view(W,H,t*0.011*s,-0.45+Math.sin(t*0.008)*0.15,Math.min(W,H)*0.3),P=[],sz=1+0.12*Math.sin(t*0.06*s);for(let x=-1;x<=1;x++)for(let y=-1;y<=1;y++)for(let z=-1;z<=1;z++)P.push({v:[x,y,z],p:f([x*0.6*sz,y*0.6*sz,z*0.6*sz])});c.strokeStyle=rgb(col,1,a*0.25);c.lineWidth=1;P.forEach((A,i)=>P.forEach((B,j)=>{if(j>i&&Math.abs(A.v[0]-B.v[0])+Math.abs(A.v[1]-B.v[1])+Math.abs(A.v[2]-B.v[2])===1){c.beginPath();c.moveTo(A.p.x,A.p.y);c.lineTo(B.p.x,B.p.y);c.stroke()}}));P.forEach(q=>dot(c,q.p,3.2,col,a))}],
  417:['Galaxy',(c,W,H,t,col,a,s)=>{const f=view(W,H,t*0.004*s,-0.9,Math.min(W,H)*0.42);GAL.forEach(g=>{const th=g.th0+t*0.012*s/(0.3+g.r);dot(c,f([g.r*Math.cos(th),g.y,g.r*Math.sin(th)]),1.6,col,a*(1-g.r*0.55))});dot(c,f([0,0,0]),5,col,a)}],
  528:['Merkaba',(c,W,H,t,col,a,s)=>{const sc=Math.min(W,H)*0.3,f1=view(W,H,t*0.014*s,-0.4,sc),f2=view(W,H,-t*0.014*s+1,-0.4,sc);const U=TETRA.map(f1),D=TETRA.map(p=>f2([-p[0],-p[1],-p[2]]));edges(c,U,P4,col,a,1.6);edges(c,D,P4,[255,255,255],a*0.6,1.2);U.concat(D).forEach(p=>dot(c,p,2.6,col,a))}],
  639:['Torus',(c,W,H,t,col,a,s)=>{const f=view(W,H,t*0.01*s,-0.7,Math.min(W,H)*0.34),R=0.75,r=0.3;for(let v=0;v<14;v++){const pts=[];for(let u=0;u<=36;u++){const U=u/36*Math.PI*2,V=v/14*Math.PI*2+t*0.01*s;pts.push(f([(R+r*Math.cos(V))*Math.cos(U),r*Math.sin(V),(R+r*Math.cos(V))*Math.sin(U)]))}pathOf(c,pts);c.strokeStyle=rgb(col,1,a*0.45);c.lineWidth=1;c.stroke()}for(let u=0;u<10;u++){const pts=[];for(let v=0;v<=24;v++){const U=u/10*Math.PI*2+t*0.008*s,V=v/24*Math.PI*2;pts.push(f([(R+r*Math.cos(V))*Math.cos(U),r*Math.sin(V),(R+r*Math.cos(V))*Math.sin(U)]))}pathOf(c,pts);c.strokeStyle=rgb(col,1,a*0.7);c.lineWidth=1.2;c.stroke()}}],
  741:['Cymatics',(c,W,H,t,col,a,s)=>{const f=view(W,H,t*0.01*s,-0.35,Math.min(W,H)*0.32);FIB.forEach(q=>{const r=1+0.3*Math.sin(5*q.ph+t*0.06*s)*Math.cos(3*q.th-t*0.03*s),p=f([r*Math.sin(q.ph)*Math.cos(q.th),r*Math.cos(q.ph),r*Math.sin(q.ph)*Math.sin(q.th)]);dot(c,p,1.8,col,a*(0.35+0.65*(1-(p.z+1.3)/2.6)))})}],
  852:['Octahedron',(c,W,H,t,col,a,s)=>{const f=view(W,H,t*0.013*s,-0.5,Math.min(W,H)*0.3),V=OCTA.map(f),E=[];for(let i=0;i<6;i++)for(let j=i+1;j<6;j++)if(!(i%2===0&&j===i+1))E.push([i,j]);edges(c,V,E,col,a,1.5);for(let k=0;k<3;k++){const pts=[];const q=(g,r)=>k===0?[r*Math.cos(g),0,r*Math.sin(g)]:k===1?[r*Math.cos(g),r*Math.sin(g),0]:[0,r*Math.cos(g),r*Math.sin(g)];for(let j=0;j<=32;j++)pts.push(f(q(j/32*Math.PI*2,1.15+k*0.12)));pathOf(c,pts);c.strokeStyle=rgb(col,1,a*0.35);c.lineWidth=1;c.stroke();dot(c,f(q(t*0.03*s*(1+k*0.4)+k*2,1.15+k*0.12)),3.5,col,a)}}],
  888:['Lemniscate',(c,W,H,t,col,a,s)=>{const f=view(W,H,t*0.009*s,-0.75,Math.min(W,H)*0.4),cv=u=>{const dd=1+Math.sin(u)**2;return [1.15*Math.cos(u)/dd,1.15*Math.sin(u)*Math.cos(u)/dd,0.45*Math.sin(2*u)]};const pts=[];for(let j=0;j<=120;j++)pts.push(f(cv(j/120*Math.PI*2)));pathOf(c,pts);c.strokeStyle=rgb(col,1,a*0.5);c.lineWidth=1.6;c.stroke();const u0=t*0.04*s;for(let k=0;k<14;k++)dot(c,f(cv(u0-k*0.07)),4-k*0.25,col,a*(1-k/14))}],
  963:['Vortex',(c,W,H,t,col,a,s)=>{const f=view(W,H,t*0.006*s,-0.55,Math.min(W,H)*0.36);for(let i=0;i<150;i++){const q=((i/150)+t*0.004*s)%1,y=q*2-1,r=0.12+0.8*q,g=q*14+i*0.7+t*0.02*s;dot(c,f([r*Math.cos(g),y,r*Math.sin(g)]),2.2,col,a*(0.25+0.75*q))}}],
  369:['Tesla 3-6-9',(c,W,H,t,col,a,s)=>{const f=view(W,H,t*0.01*s,-0.5,Math.min(W,H)*0.32);[3,6,9].forEach((k,j)=>{const pts=[];for(let u=0;u<=72;u++){const g=u/72*Math.PI*2,r=0.55+0.25*Math.cos(k*g+t*0.02*s);pts.push(f([r*Math.cos(g),0.18*Math.sin(k*g)+(j-1)*0.25,r*Math.sin(g)]))}pathOf(c,pts);c.strokeStyle=rgb(col,1,a*(0.4+0.2*j));c.lineWidth=1.3;c.stroke()});for(let k=0;k<9;k++){const g=k/9*Math.PI*2+t*0.015*s;dot(c,f([0.8*Math.cos(g),0,0.8*Math.sin(g)]),k%3===2?4:2.4,col,a)}}],
  693:['Spiral of inflow',(c,W,H,t,col,a,s)=>{const f=view(W,H,t*0.008*s,-0.85,Math.min(W,H)*0.4);for(let i=0;i<180;i++){const q=((i/180)+t*0.003*s)%1,r=1.05*Math.exp(-2.6*q),g=q*18;dot(c,f([r*Math.cos(g),0.1*Math.sin(g*2),r*Math.sin(g)]),1+2.2*(1-q),col,a*(0.3+0.7*(1-q)))}dot(c,f([0,0,0]),4.5,col,a)}],
  936:['Crystal of abundance',(c,W,H,t,col,a,s)=>{const p=(1+Math.sqrt(5))/2,V=[[-1,p,0],[1,p,0],[-1,-p,0],[1,-p,0],[0,-1,p],[0,1,p],[0,-1,-p],[0,1,-p],[p,0,-1],[p,0,1],[-p,0,-1],[-p,0,1]].map(v=>v.map(q=>q*0.5));const f=view(W,H,t*0.012*s,-0.4+Math.sin(t*0.01)*0.2,Math.min(W,H)*0.3),P=V.map(f),E=[];for(let i=0;i<12;i++)for(let j=i+1;j<12;j++){const dd=Math.hypot(V[i][0]-V[j][0],V[i][1]-V[j][1],V[i][2]-V[j][2]);if(Math.abs(dd-1)<0.05)E.push([i,j])}edges(c,P,E,col,a*0.8,1.2);P.forEach(q=>dot(c,q,2.6,col,a))}]};
 SOLF.forEach(([hz])=>{if(FX[hz])return;const A=1+hz%7,B=1+Math.floor(hz/7)%5;FX[hz]=['Lissajous '+A+':'+B,(c,W,H,t,col,al,sp)=>{const f=view(W,H,t*0.008*sp,-0.45,Math.min(W,H)*0.38),pts=[];for(let j=0;j<=240;j++){const u=j/240*Math.PI*2;pts.push(f([Math.sin(A*u+t*0.01*sp),Math.sin(B*u),0.6*Math.cos((A+B)*u*0.5+t*0.006)]))}pathOf(c,pts);c.strokeStyle=rgb(col,1,al*0.85);c.lineWidth=1.4;c.stroke();dot(c,f([Math.sin(A*t*0.02),Math.sin(B*t*0.02),0]),4,col,al)}]});
 const grid=$('#fx-grid'),cards=SOLF.map(([hz,name,col,desc])=>{const d=document.createElement('div');d.className='fx';d.title=desc;d.innerHTML='<canvas></canvas><div class="l"><b>'+hz+' Hz · '+name+'</b><span>'+FX[hz][0]+'</span></div>';d.onclick=()=>{pin=pin===hz?0:hz;cards.forEach(k=>k.el.classList.toggle('pin',k.hz===pin))};grid.appendChild(d);return {hz,el:d,cv:d.querySelector('canvas'),col:hexRgb(col)}});
 function drawFx(){cards.forEach(k=>{const g=fitC(k.cv);if(!g)return;const {x,W,H}=g;const hot=HOT[k.hz]||0,on=k.hz===(pin||act);k.el.classList.toggle('act',hot>0.2||on&&!pin);x.clearRect(0,0,W,H);x.shadowColor=rgb(k.col,1,1);x.shadowBlur=(4+14*hot+(on?8:0))*devicePixelRatio;FX[k.hz][1](x,W,H,T,k.col,0.45+0.55*Math.max(hot,on?0.8:0),1+hot*2+energy);x.shadowBlur=0})}
 fetch('/app/market').then(r=>r.json()).then(m=>{const sw=m.spaceWeather;if(sw){kp=sw.kp||0;$('#sch-note').textContent='Kp '+kp+' · storm '+sw.storm+(sw.solarWind?' · solar wind '+Math.round(sw.solarWind.speedKmS)+' km/s':'')+' (NOAA). Visualization, not a trading signal.';$('#sch-hz').textContent=(7.83*(1+kp*0.015)).toFixed(2)+' Hz'}}).catch(()=>{});
 (function frame(){if($('#freq').classList.contains('on')){T+=1;drawFsk();drawDna();drawSpec();drawSch();drawFx()}for(const k in HOT){HOT[k]*=0.985;if(HOT[k]<0.01)delete HOT[k]}energy*=0.999;requestAnimationFrame(frame)})();
})();
// Trade: Solana spot terminal. Orders use the same fee-bearing Jupiter route as Swap.
(function tradeView(){let markets=[],cur=null,iv='15m',chart=null,cs=null,vs=null,side='buy',tq=null,searchT=0;
 const USDC='EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
 const usd=n=>n==null?'–':n>=1e9?'$'+(n/1e9).toFixed(2)+'B':n>=1e6?'$'+(n/1e6).toFixed(2)+'M':n>=1e3?'$'+(n/1e3).toFixed(1)+'K':'$'+Math.round(n);
 const pf=n=>n>=1000?n.toLocaleString('en-US',{maximumFractionDigits:2}):n>=1?n.toFixed(3):n>=0.01?n.toFixed(5):n.toPrecision(4);
 const pct=n=>'<span class="'+(n>=0?'ok':'bad')+'">'+(n>=0?'+':'')+Number(n).toFixed(2)+'%</span>';
 const visible=()=>$('#trade').classList.contains('on');
 async function loadMk(q){try{markets=(await (await fetch('/app/spot/markets'+(q?'?q='+encodeURIComponent(q):''))).json()).markets;if(!cur&&markets.length)cur=markets[0];else if(cur){const u=markets.find(m=>m.mint===cur.mint);if(u)cur=u}drawMk();head()}catch(e){}}
 function drawMk(){$('#mk-b').innerHTML=markets.map(m=>'<tr data-m="'+H(m.mint)+'" class="'+(cur&&m.mint===cur.mint?'sel':'')+'"><td><b>'+H(m.symbol)+'</b><div class=note>'+usd(m.liquidityUsd)+' liq</div></td><td>'+pf(m.price)+'</td><td>'+pct(m.change24hPct)+'</td></tr>').join('')||'<tr><td colspan=3 class=note>No Solana market found</td></tr>';
  document.querySelectorAll('#mk-b tr[data-m]').forEach(r=>r.onclick=()=>{cur=markets.find(m=>m.mint===r.dataset.m);tq=null;drawMk();head();loadCandles(true);loadTrades()})}
 $('#mk-q').oninput=()=>{clearTimeout(searchT);searchT=setTimeout(()=>loadMk($('#mk-q').value.trim()),350)};
 function head(){if(!cur)return;$('#t-px').textContent='$'+pf(cur.price);$('#t-coin').textContent=cur.symbol+' / USD';$('#t-ch1').innerHTML=pct(cur.change1hPct);$('#t-ch').innerHTML=pct(cur.change24hPct);$('#t-liq').textContent=usd(cur.liquidityUsd);$('#t-vol').textContent=usd(cur.volume24hUsd);$('#t-mc').textContent=usd(cur.marketCap);
  const tot=cur.buys24h+cur.sells24h;$('#t-bs').innerHTML='<span class=ok>'+cur.buys24h+'</span> / <span class=bad>'+cur.sells24h+'</span>'+(tot?' ('+Math.round(100*cur.buys24h/tot)+'% buys)':'');est()}
 function ensureChart(){if(chart||!window.LightweightCharts)return;const el=$('#chart');chart=LightweightCharts.createChart(el,{width:el.clientWidth,height:el.clientHeight||440,layout:{background:{color:'transparent'},textColor:'#c0c4cc'},grid:{vertLines:{color:'rgba(217,221,227,.05)'},horzLines:{color:'rgba(217,221,227,.05)'}},rightPriceScale:{borderColor:'#232327'},timeScale:{borderColor:'#232327',timeVisible:true},localization:{priceFormatter:p=>pf(p)}});
  cs=chart.addCandlestickSeries({upColor:'#f5c542',downColor:'#3ab8ff',borderVisible:false,wickUpColor:'#f5c542',wickDownColor:'#3ab8ff',priceFormat:{type:'custom',formatter:p=>pf(p),minMove:0.00000001}});vs=chart.addHistogramSeries({priceFormat:{type:'volume'},priceScaleId:''});vs.priceScale().applyOptions({scaleMargins:{top:0.82,bottom:0}});
  new ResizeObserver(()=>chart.applyOptions({width:el.clientWidth,height:el.clientHeight})).observe(el)}
 async function loadCandles(fit){ensureChart();if(!cs||!cur)return;try{const k=await (await fetch('/app/spot/candles?pool='+cur.pool+'&tf='+iv)).json();if(!Array.isArray(k))return;cs.setData(k);vs.setData(k.map(c=>({time:c.time,value:c.volume,color:c.close>=c.open?'rgba(245,197,66,.35)':'rgba(58,184,255,.35)'})));if(fit)chart.timeScale().fitContent()}catch(e){}}
 async function loadTrades(){if(!cur)return;try{const t=(await (await fetch('/app/spot/trades?pool='+cur.pool)).json()).trades||[];
  $('#tr-l').innerHTML=t.slice(0,18).map(x=>'<div class="r '+(x.side==='buy'?'b':'a')+'"><span>'+(x.side==='buy'?'▲ ':'▼ ')+pf(x.price)+'</span><span style="text-align:right">'+usd(x.usd)+' · '+new Date(x.time).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit'})+'</span></div>').join('')||'<div class=note>No trades yet</div>'}catch(e){}}
 document.querySelectorAll('#ivs button').forEach(b=>b.onclick=()=>{document.querySelectorAll('#ivs button').forEach(x=>x.classList.remove('on'));b.classList.add('on');iv=b.dataset.i;loadCandles(true)});
 $('#t-long').onclick=()=>{side='buy';$('#t-long').classList.add('on');$('#t-short').classList.remove('on');$('#t-lbl').textContent='Spend (USDC)';tq=null;est()};
 $('#t-short').onclick=()=>{side='sell';$('#t-short').classList.add('on');$('#t-long').classList.remove('on');$('#t-lbl').textContent='Sell ('+(cur?cur.symbol:'token')+')';tq=null;est()};
 $('#t-size').oninput=()=>{tq=null;est()};
 function est(){if(!cur)return;const a=Number($('#t-size').value)||0;const v=side==='buy'?a:a*cur.price;
  $('#t-est').innerHTML=(side==='buy'?'Buy ≈ <b>'+(cur.price?pf(a/cur.price):'–')+' '+cur.symbol+'</b>':'Receive ≈ <b>$'+pf(v)+' USDC</b>')+' · platform fee ≈ $'+(v*0.003).toFixed(3);
  $('#t-go').textContent=!me?'Sign in to trade':(tq?'Confirm '+(side==='buy'?'buy':'sell')+' in wallet':'Get best price')}
 async function decimals(mint){if(mint==='So11111111111111111111111111111111111111112')return 9;const r=await (await fetch('/app/decimals?chain=solana&token='+mint)).json();return r.decimals}
 $('#t-go').onclick=async()=>{if(!me)return openWallets();if(!cur)return;
  try{if(!tq){const a=Number($('#t-size').value);if(!(a>0))return;$('#t-msg').textContent='Finding the best route and checking the token…';
    const dec=side==='buy'?6:await decimals(cur.mint);const amount=BigInt(Math.round(a*10**Math.min(dec,9)))*10n**BigInt(Math.max(dec-9,0));
    const body=side==='buy'?{fromChain:'solana',toChain:'solana',inputToken:USDC,outputToken:cur.mint,amount:amount.toString()}:{fromChain:'solana',toChain:'solana',inputToken:cur.mint,outputToken:USDC,amount:amount.toString()};
    const r=await fetch('/app/quote',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});const q=await r.json();if(!r.ok){$('#t-msg').innerHTML='<span class=bad>'+H(q.message||q.error)+'</span>';return}
    tq=q;const risk=q.outputTokenRisk;const outDec=side==='buy'?dec:6;const out=q.quote&&q.quote.outAmount?Number(q.quote.outAmount)/10**(side==='buy'?await decimals(cur.mint):6):null;
    $('#t-msg').innerHTML='You get ≈ <b>'+(out!=null?pf(out)+' '+(side==='buy'?cur.symbol:'USDC'):'see wallet')+'</b>'+(q.quote&&q.quote.priceImpactPct?' · impact '+(Number(q.quote.priceImpactPct)*100).toFixed(2)+'%':'')+(risk?'<div>Token risk: <b class="'+(risk.riskLevel==='low'||risk.riskLevel==='trusted'?'ok':risk.riskLevel==='medium'?'warn':'bad')+'">'+(risk.riskLevel||'unknown')+'</b>'+(risk.warning?' <span class=bad>'+H(risk.warning)+'</span>':'')+'</div>':'');est();return}
   if(!wallet)return connectWallet();const bytes=Uint8Array.from(atob(tq.unsignedTransaction.serialized),c=>c.charCodeAt(0));const vtx=solanaWeb3.VersionedTransaction.deserialize(bytes);const res=await wallet.p.signAndSendTransaction(vtx);const sig=res&&res.signature||res;
   $('#t-msg').innerHTML='<span class=ok>Order sent.</span> <a target=_blank rel=noopener href="https://solscan.io/tx/'+sig+'">View on Solscan</a>';tq=null;est();setTimeout(loadTrades,4000)}catch(e){tq=null;$('#t-msg').innerHTML='<span class=bad>'+(e.message||String(e))+'</span>';est()}};
 window.onTrade=()=>{loadMk().then(()=>{setTimeout(()=>loadCandles(true),60);loadTrades()})};if($('#trade').classList.contains('on'))onTrade();
 setInterval(()=>{if(visible())loadTrades()},8000);setInterval(()=>{if(visible())loadCandles(false)},15000);setInterval(()=>{if(visible()&&!$('#mk-q').value)loadMk()},20000)})();
// API keys and plans
(function(){let K=null;const esc=t=>String(t??'').replace(/[&<>"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch]));
 const msg=(t,cls)=>{$('#k-msg').innerHTML=t?'<span class="'+(cls||'')+'">'+t+'</span>':''};
 window.loadKeys=async()=>{try{K=await (await fetch('/app/keys',{cache:'no-store'})).json()}catch(e){return}
  $('#k-free').textContent=K.freeTools.join(', ');const cur=K.signedIn?K.plan:null;
  $('#plans').innerHTML=['free','pro','desk'].map(id=>{const p=K.plans[id];return '<div class="card'+(cur===id?' cur':'')+'"><div class="k">'+p.name+(cur===id?' · your plan'+(K.expires?' until '+K.expires.slice(0,10):''):'')+'</div><div class="pr">'+(p.priceUsdc?p.priceUsdc+' <small>USDC / 30 days</small>':'0 <small>free</small>')+'</div><ul><li>'+(p.tools==='all'?'All tools and skills':'10 tools: prices, token audit, trade quotes, council, Kelly')+'</li><li>'+p.perDay.toLocaleString()+' calls a day, '+p.perMinute+' a minute</li><li>'+p.maxKeys+' API key'+(p.maxKeys>1?'s':'')+(p.maxKeys>1?' (one per bot)':'')+'</li><li>0.3% fee on each trade</li></ul>'+(p.priceUsdc?'<div class="buy"><select data-net="'+id+'"><option value="solana">USDC on Solana</option><option value="base">USDC on Base</option><option value="polygon">USDC on Polygon</option></select><button class="btn" data-buy="'+id+'">'+(cur===id?'Extend':'Buy')+'</button></div>':'')+'</div>'}).join('');
  if(!K.signedIn){$('#k-plan').textContent='';$('#k-list').textContent='Sign in to create a key.';return}
  $('#k-plan').textContent='· '+K.plans[K.plan].name+' plan';
  $('#k-list').innerHTML=K.keys.length?K.keys.map(k=>'<div class="kr"><span><b>'+esc(k.label)+'</b><div class="note">created '+k.created.slice(0,10)+(k.last_used?' · last used '+k.last_used.slice(0,16).replace('T',' '):' · never used')+'</div></span><button class="btn sec" data-revoke="'+k.id+'">Revoke</button></div>').join(''):'No keys yet.'};
 $('#k-new').onclick=async()=>{if(!me)return openWallets();const r=await fetch('/app/keys',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({label:$('#k-label').value||'My agent'})});const j=await r.json();
  if(!r.ok)return msg(j.message||j.error,'bad');$('#k-new-out').innerHTML='<div class="newkey"><b>'+j.key+'</b><div class="note">Copy it now, it is shown only once. <button class="btn sec" id="k-copy">Copy</button></div></div>';$('#k-copy').onclick=()=>navigator.clipboard.writeText(j.key).then(()=>{$('#k-copy').textContent='Copied'});loadKeys()};
 document.addEventListener('click',async e=>{const rv=e.target.closest('[data-revoke]');if(rv){await fetch('/app/keys/'+rv.dataset.revoke,{method:'DELETE'});loadKeys();return}
  const b=e.target.closest('[data-buy]');if(!b)return;const plan=b.dataset.buy,net=document.querySelector('[data-net='+plan+']').value;
  if(!me)return openWallets();if(!wallet)return connectWallet();const amount=BigInt(K.plans[plan].priceUsdc)*1000000n;const pay=K.pay[net];
  try{let tx;if(net==='solana'){if(wallet.kind!=='solana')return msg('Sign in with a Solana wallet (Phantom, Solflare, Backpack) to pay on Solana, or pick Base / Polygon.','bad');
    const W=solanaWeb3,owner=new W.PublicKey(me.address),mint=new W.PublicKey(pay.usdc),dest=new W.PublicKey(pay.payTo);const TP=new W.PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'),AP=new W.PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');
    const ata=o=>W.PublicKey.findProgramAddressSync([o.toBuffer(),TP.toBuffer(),mint.toBuffer()],AP)[0];const Buf=owner.toBuffer().constructor;const data=new Uint8Array(10);data[0]=12;let a=amount;for(let i=1;i<9;i++){data[i]=Number(a&255n);a>>=8n}data[9]=6;
    const ix=new W.TransactionInstruction({programId:TP,keys:[{pubkey:ata(owner),isSigner:false,isWritable:true},{pubkey:mint,isSigner:false,isWritable:false},{pubkey:ata(dest),isSigner:false,isWritable:true},{pubkey:owner,isSigner:true,isWritable:false}],data:Buf.from(data)});
    const bh=await (await fetch('/app/solana/blockhash')).json();if(!bh.blockhash)throw new Error('Solana RPC busy, try again');const t=new W.Transaction({feePayer:owner,blockhash:bh.blockhash,lastValidBlockHeight:bh.lastValidBlockHeight}).add(ix);
    msg('Approve the '+K.plans[plan].priceUsdc+' USDC payment in your wallet…');const res=await wallet.p.signAndSendTransaction(t);tx=res.signature||res}
   else{if(wallet.kind!=='evm')return msg('Sign in with an EVM wallet (MetaMask, Rabby, Coinbase…) to pay on '+net+', or pick Solana.','bad');
    try{await wallet.p.request({method:'wallet_switchEthereumChain',params:[{chainId:pay.chainId}]})}catch(e){throw new Error('Switch your wallet to '+net)}
    const pad=h=>h.replace(/^0x/,'').padStart(64,'0');msg('Approve the '+K.plans[plan].priceUsdc+' USDC payment in your wallet…');
    tx=await wallet.p.request({method:'eth_sendTransaction',params:[{from:me.address,to:pay.usdc,data:'0xa9059cbb'+pad(pay.payTo.toLowerCase())+pad(amount.toString(16))}]})}
   for(let i=0;i<36;i++){msg('Payment sent. Confirming on chain… ('+(i*5)+'s)');const r=await fetch('/app/plan',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({plan,network:net,tx})});const j=await r.json();
    if(r.ok){msg(K.plans[plan].name+' plan active until '+j.expires.slice(0,10)+'.','ok');return loadKeys()}if(!j.retryable)return msg('Payment not accepted: '+(j.message||j.error)+'. Transaction: '+esc(tx),'bad');await new Promise(z=>setTimeout(z,5000))}
   msg('Still confirming. Your transaction: '+esc(tx)+'. Reload this page in a minute; if the plan is not active, email support@skinwinking.com with the transaction.','bad')}catch(e){msg(e.message||String(e),'bad')}});
 loadKeys()})();
// Profile load/save
async function loadProfile(){if(!me||!me.email)return;try{const p=await (await fetch('/app/profile')).json();if(p.wallet_sol)$('#p-sol').value=p.wallet_sol;if(p.wallet_evm)$('#p-evm').value=p.wallet_evm;$('#p-info').innerHTML='Signed in as <b>'+H(p.name||p.email)+'</b> ('+H(p.email)+')'}catch(e){}}
$('#p-save').onclick=async()=>{const sol=$('#p-sol').value.trim(),evm=$('#p-evm').value.trim();
 const r=await fetch('/app/profile',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({wallet_sol:sol,wallet_evm:evm})});const j=await r.json();
 if(r.ok)$('#p-msg').innerHTML='<span class=ok>Wallets saved. You can now trade.</span>';else $('#p-msg').innerHTML='<span class=bad>'+H(j.message||j.error)+'</span>'};
if(location.hash.length>1)go(location.hash.slice(1));
fillTokens();loadStats();loadMarket();loadCatalog();setInterval(loadStats,30000);setInterval(loadMarket,60000);
fetch('/auth/me').then(r=>r.ok?r.json():null).then(m=>{me=m;showMe();if(me&&me.email)loadProfile()});
</script>
</body>
</html>`;
