// Forex Trading Pro — frontend (single page app)
let token = localStorage.getItem('ftp_token') || null;
let me = null;
let currentPair = 'XAUUSD';
let currentTab = 'terminal';
let prevPrices = {};
let lastUpdateAt = 0;
let priceTimer = null;
let countdownTimer = null;

const PAIR_IDS = ['XAUUSD','XAGUSD','BTCUSD','ETHUSD','SOLUSD','BNBUSD','XRPUSD','DOGEUSD','ADAUSD','EURUSD','GBPUSD','USDJPY','AUDUSD','USDCAD','USDCHF'];
function fmt(n, dec) { return n == null ? '—' : Number(n).toLocaleString('en-US', { minimumFractionDigits: dec ?? 2, maximumFractionDigits: dec ?? 2 }); }
function esc(s) { return String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
async function api(path, opts = {}) {
  const r = await fetch(path, { ...opts, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(opts.headers || {}) } });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.message || ('HTTP ' + r.status));
  return d;
}
function showMsg(t) { document.getElementById('authMsg').textContent = t || ''; }

async function init() {
  try {
    const st = await api('/api/auth/state');
    if (st.needsSetup) { document.getElementById('setupBox').style.display = 'block'; }
    else if (token) {
      try { me = (await api('/api/auth/me')).user; enterApp(); return; }
      catch (e) { token = null; localStorage.removeItem('ftp_token'); document.getElementById('loginBox').style.display = 'block'; }
    } else document.getElementById('loginBox').style.display = 'block';
  } catch (e) { showMsg('Server se rabta nahi ho raha: ' + e.message); }
}
async function doSetup() {
  const username = document.getElementById('setupUser').value.trim();
  const password = document.getElementById('setupPass').value;
  try {
    const d = await api('/api/auth/setup', { method: 'POST', body: JSON.stringify({ username, password }) });
    token = d.token; localStorage.setItem('ftp_token', token); me = d.user; enterApp();
  } catch (e) { showMsg(e.message); }
}
async function doLogin() {
  const username = document.getElementById('loginUser').value.trim();
  const password = document.getElementById('loginPass').value;
  try {
    const d = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) });
    token = d.token; localStorage.setItem('ftp_token', token); me = d.user; enterApp();
  } catch (e) { showMsg(e.message); }
}
async function doLogout() {
  try { await api('/api/auth/logout', { method: 'POST' }); } catch (e) {}
  token = null; me = null; localStorage.removeItem('ftp_token');
  clearInterval(priceTimer); clearInterval(countdownTimer);
  document.getElementById('mainScreen').style.display = 'none';
  document.getElementById('authScreen').style.display = 'block';
  document.getElementById('loginBox').style.display = 'block';
  document.getElementById('setupBox').style.display = 'none';
}
function enterApp() {
  document.getElementById('authScreen').style.display = 'none';
  document.getElementById('mainScreen').style.display = 'block';
  document.getElementById('helloUser').textContent = 'Salam, ' + me.username;
  document.getElementById('roleBadge').textContent = me.role === 'admin' ? 'ADMIN' : (me.plan || 'BUYER');
  if (me.role === 'admin') document.getElementById('adminTabBtn').style.display = '';
  buildPairSelect();
  showTab('terminal');
  refreshPrices(true);
  priceTimer = setInterval(() => refreshPrices(false), 5000);
  countdownTimer = setInterval(tickLastUpdate, 1000);
}
function buildPairSelect() {
  document.getElementById('pairSelect').innerHTML = PAIR_IDS.map(id =>
    `<button class="${id === currentPair ? 'active' : ''}" onclick="selectPair('${id}')">${id.replace('USD', '/USD')}</button>`).join('');
}
function selectPair(id) { currentPair = id; buildPairSelect(); loadTerminal(); loadIndicators(); loadSmc(); loadTfMatrix(); }
function showTab(t) {
  currentTab = t;
  document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === t));
  document.querySelectorAll('.tab').forEach(s => s.style.display = 'none');
  document.getElementById('tab-' + t).style.display = 'block';
  if (t === 'terminal') loadTerminal();
  if (t === 'indicators') loadIndicators();
  if (t === 'smc') { loadSmc(); loadScanner(); }
  if (t === 'session') loadSession();
  if (t === 'history') { loadHistory(); loadPerf(); loadRefiner(); }
  if (t === 'account') buildAcctSubtabs();
  if (t === 'admin') loadAdmin();
}
async function refreshPrices(manual) {
  const btn = document.getElementById('refreshBtn');
  if (manual) { btn.disabled = true; btn.textContent = 'Refresh ho raha hai…'; }
  try {
    const d = await api('/api/prices');
    lastUpdateAt = Date.now();
    const grid = document.getElementById('priceList');
    grid.innerHTML = d.pairs.map(p => {
      const prev = prevPrices[p.id];
      const arrow = p.price != null && prev != null ? (p.price > prev ? ' <span class="up">▲</span>' : p.price < prev ? ' <span class="down">▼</span>' : '') : '';
      if (p.price != null) prevPrices[p.id] = p.price;
      const chg = p.change24h == null ? '—' : (p.change24h >= 0 ? '+' : '') + p.change24h.toFixed(2) + '%';
      return `<div class="price-cell"><div>${esc(p.label)} <span style="color:#8ea0c2;font-size:11px">${p.live ? 'LIVE' : esc(p.source)}</span></div><b>${fmt(p.price, p.dec)}${arrow}</b><div style="color:${(p.change24h || 0) >= 0 ? '#3ddc84' : '#ff6b6b'}">${chg}</div></div>`;
    }).join('');
    document.getElementById('liveCount').textContent = 'LIVE ' + d.pairs.filter(p => p.live).length + '/' + d.pairs.length;
    document.getElementById('apiHealth').textContent = d.sources.map(s => s.name + ': ' + s.status).join(' · ');
    if (currentTab === 'terminal') loadTerminal(true);
  } catch (e) { document.getElementById('apiHealth').textContent = 'Price load nahi hui: ' + e.message; }
  if (manual) { btn.disabled = false; btn.textContent = 'Refresh'; }
}
function tickLastUpdate() {
  if (!lastUpdateAt) return;
  const s = Math.floor((Date.now() - lastUpdateAt) / 1000);
  document.getElementById('lastUpdate').textContent = 'Last update · ' + s + ' sec pehle';
}
async function loadTerminal(fromPrice) {
  const el = document.getElementById('terminalCard');
  try {
    const d = await api('/api/signal?pair=' + currentPair);
    if (d.disabled) { el.innerHTML = '<p>' + esc(d.message) + '</p>'; return; }
    if (d.error) { el.innerHTML = '<p>' + esc(d.message) + '</p>'; return; }
    const dirCls = d.direction === 'BUY' ? 'buy' : d.direction === 'SELL' ? 'sell' : 'wait';
    const planHtml = (plan, label) => `<div style="border:1px solid #2a3550;border-radius:10px;padding:10px;margin:6px 0">
      <b>${label} ${plan.direction}</b> — ${plan.status}<br>
      Entry Zone: ${fmt(plan.entryZone[0], 2)} – ${fmt(plan.entryZone[1], 2)} · Trigger: ${fmt(plan.trigger, 2)}<br>
      SL: <span class="sell">${fmt(plan.sl, 2)}</span> · TP1: <span class="buy">${fmt(plan.tp1, 2)}</span> · TP2: ${fmt(plan.tp2, 2)} · TP3: ${fmt(plan.tp3, 2)}</div>`;
    const gatesHtml = (gates, title) => `<h4>${title}</h4>` + gates.map(g =>
      `<div class="gate"><span>${esc(g.name)}</span><span>${g.points}/${g.max}</span></div>`).join('');
    el.innerHTML = `
      <h3>${esc(currentPair.replace('USD', '/USD'))} — <span class="${dirCls}">${d.direction}</span> ${d.direction === 'WAIT' ? '(koi trade nahi)' : ''}</h3>
      <p>Price: <b>${fmt(d.price, 2)}</b> · Bid ${fmt(d.bid, 2)} · Ask ${fmt(d.ask, 2)} · Spread ${fmt(d.spread, 2)} · Confluence: <b>${d.confluence}%</b> (gate 85%)</p>
      <p>PDH ${fmt(d.range.pdh, 2)} · PDL ${fmt(d.range.pdl, 2)} · Range ${fmt(d.range.pdl, 2)} – ${fmt(d.range.pdh, 2)}</p>
      ${gatesHtml(d.buyGates, 'BUY Gates')} ${gatesHtml(d.sellGates, 'SELL Gates')}
      <h4>BUY aur SELL plans — dono ek saath</h4>
      ${planHtml(d.buyPlan, 'BUY')} ${planHtml(d.sellPlan, 'SELL')}
      <h4>24H Sentiment — ${esc(d.sentiment.label)}</h4>
      <p>Bullish ${d.sentiment.bullishPct}% · Bearish ${d.sentiment.bearishPct}%</p>
      <p>Demand Zone: ${d.sentiment.demandZone ? fmt(d.sentiment.demandZone[0], 2) + ' – ' + fmt(d.sentiment.demandZone[1], 2) : '—'} · Supply Zone: ${d.sentiment.supplyZone ? fmt(d.sentiment.supplyZone[0], 2) + ' – ' + fmt(d.sentiment.supplyZone[1], 2) : '—'}</p>
      <h4>Live Comments</h4>
      <ul>${d.comments.map(c => '<li>' + esc(c) + '</li>').join('')}</ul>
      <p>Next check in ${d.nextCheckInSec}s (30 second monitoring)</p>`;
  } catch (e) { if (!fromPrice) el.innerHTML = '<p>Signal load nahi hua: ' + esc(e.message) + '</p>'; }
}

async function loadIndicators() {
  const body = document.getElementById('indBody');
  try {
    const d = await api('/api/indicators?pair=' + currentPair);
    document.getElementById('indScore').textContent = 'Scorecard: ' + d.scorecard.score + ' / 100';
    const tf = d.timeframes['1H'];
    if (!tf || tf.error) { body.innerHTML = '<p>Indicators ke liye candles nahi milin.</p>'; return; }
    const row = (k, v) => `<div class="gate"><span>${k}</span><span>${v}</span></div>`;
    body.innerHTML = `
      <h4>Trend</h4>${row('EMA 20', fmt(tf.ema20, 2))}${row('EMA 50', fmt(tf.ema50, 2))}${row('EMA 200', fmt(tf.ema200, 2))}${row('MACD', fmt(tf.macd, 2) + ' / Signal ' + fmt(tf.macdSignal, 2) + ' / Hist ' + fmt(tf.macdHist, 2))}${row('ADX 14', fmt(tf.adx14, 1))}
      <h4>Momentum</h4>${row('RSI 14', fmt(tf.rsi14, 1))}${row('Stochastic K/D', fmt(tf.stochK, 1) + ' / ' + fmt(tf.stochD, 1))}${row('CCI 20', fmt(tf.cci, 1))}${row('Williams %R', fmt(tf.williamsR, 1))}
      <h4>Volatility</h4>${row('ATR 14', fmt(tf.atr14, 2))}${row('Bollinger Upper', fmt(tf.bbUpper, 2))}${row('Bollinger Middle', fmt(tf.bbMiddle, 2))}${row('Bollinger Lower', fmt(tf.bbLower, 2))}
      <h4>Volume</h4>${row('OBV', fmt(tf.obv, 0))}${row('CMF', fmt(tf.cmf, 2))}${row('MFI 14', fmt(tf.mfi, 1))}
      <h4>Structure</h4>${row('Support', fmt(tf.support, 2))}${row('Resistance', fmt(tf.resistance, 2))}${row('Fibonacci 38.2%', fmt(tf.fib['38.2'], 2))}${row('Fibonacci 61.8%', fmt(tf.fib['61.8'], 2))}
      <h4>Ichimoku</h4>${row('Tenkan', fmt(tf.tenkan, 2))}${row('Kijun', fmt(tf.kijun, 2))}${row('Span A', fmt(tf.spanA, 2))}${row('Span B', fmt(tf.spanB, 2))}${row('Chikou', fmt(tf.chikou, 2))}
      <h4>VWAP / SAR</h4>${row('VWAP', fmt(tf.vwap, 2))}${row('Parabolic SAR', fmt(tf.sar, 2))}
      <h4>15M aur Daily</h4>
      <p>15M — RSI ${fmt(d.timeframes['15m'].rsi14, 1)} · EMA20 ${fmt(d.timeframes['15m'].ema20, 2)} · ATR ${fmt(d.timeframes['15m'].atr14, 2)}</p>
      <p>Daily — RSI ${fmt(d.timeframes['1D'].rsi14, 1)} · EMA20 ${fmt(d.timeframes['1D'].ema20, 2)} · ATR ${fmt(d.timeframes['1D'].atr14, 2)}</p>`;
  } catch (e) { body.innerHTML = '<p>Indicators load nahi hue: ' + esc(e.message) + '</p>'; }
}
async function loadSmc() {
  const el = document.getElementById('smcBody');
  try {
    const d = await api('/api/smc?pair=' + currentPair);
    if (d.disabled) { el.innerHTML = '<p>' + esc(d.message) + '</p>'; return; }
    if (d.error) { el.innerHTML = '<p>SMC data nahi mila.</p>'; return; }
    el.innerHTML = `
      <p class="score">SMC Score: ${d.score} / 100 (gate 80%) — ${d.score >= 80 ? '<span class="buy">Gate paar!</span>' : '<span class="wait">Gate poora nahi hua</span>'}</p>
      ${d.parts.map(p => `<div class="gate"><span>${esc(p.name)}</span><span>${p.score}/${p.max}</span></div>`).join('')}
      <h4>Swing Levels</h4><p>Aakhri Swing High: ${fmt(d.swingHigh, 2)} · Aakhri Swing Low: ${fmt(d.swingLow, 2)}</p>
      <h4>Liquidity Sweeps</h4><p>${esc(d.sweep)}</p>
      <h4>Order Blocks</h4>
      <p>Bullish OB: ${d.bullOB ? fmt(d.bullOB.low, 2) + ' – ' + fmt(d.bullOB.high, 2) + (d.bullOB.mitigated ? ' (mitigated)' : ' (fresh)') : '—'}</p>
      <p>Bearish OB: ${d.bearOB ? fmt(d.bearOB.low, 2) + ' – ' + fmt(d.bearOB.high, 2) + (d.bearOB.mitigated ? ' (mitigated)' : ' (fresh)') : '—'}</p>
      <h4>Fair Value Gaps (FVG)</h4>
      ${d.fvgs.length ? d.fvgs.map(f => `<p>${f.type}: ${fmt(f.low, 2)} – ${fmt(f.high, 2)}</p>`).join('') : '<p>Koi FVG nahi mila.</p>'}
      <p>5M Micro SSL sweeps: ${d.sslSweeps} · Liquidity pools: ${d.pools}</p>`;
  } catch (e) { el.innerHTML = '<p>SMC load nahi hua: ' + esc(e.message) + '</p>'; }
}
async function loadScanner() {
  const el = document.getElementById('scannerBody');
  try {
    const d = await api('/api/scanner');
    el.innerHTML = `<table><tr><th>Pair</th><th>Price</th><th>SMC Score</th><th>Direction</th></tr>` +
      d.rows.map(r => `<tr><td>${esc(r.pair)}</td><td>${fmt(r.price, 2)}</td><td>${r.smcScore == null ? '—' : r.smcScore + '/100'}</td><td>${esc(r.direction)}</td></tr>`).join('') + `</table>
      <p>Confirmed SMC signals: ${d.confirmedSignals} · Cycle: har ${d.cycleSec} second</p>`;
  } catch (e) { el.innerHTML = '<p>Scanner load nahi hua: ' + esc(e.message) + '</p>'; }
}
async function loadSession() {
  const el = document.getElementById('sessionBody');
  try {
    const d = await api('/api/sessions');
    if (d.disabled) { el.innerHTML = '<p>' + esc(d.message) + '</p>'; return; }
    el.innerHTML = `
      <p><b>${esc(d.active.name)}</b> Active — ${d.active.startPKT} – ${d.active.endPKT} PKT · Abhi PKT time: ${d.nowPKT}</p>
      <p>Agla session: ${esc(d.next.name)} — ${d.next.inMin} minute me</p>
      <p>News blackout: <b>Available nahi hai</b> — ${esc(d.newsBlackout.note)}</p>
      <table><tr><th>Pair</th><th>Price</th><th>Quality</th><th>Direction</th><th>Entry</th><th>SL</th><th>TP1</th></tr>
      ${d.pairs.map(p => `<tr><td>${esc(p.pair)}</td><td>${fmt(p.price, 2)}</td><td>${p.quality}/100</td><td>${esc(p.direction)}</td><td>${fmt(p.entry, 2)}</td><td>${fmt(p.sl, 2)}</td><td>${fmt(p.tp1, 2)}</td></tr>`).join('')}</table>
      <p>Session stats — Total: ${d.stats.total} · BUY: ${d.stats.buy} · SELL: ${d.stats.sell} · WAIT: ${d.stats.wait}</p>
      <p>${esc(d.stats.note)}</p>
      <button class="btn small" onclick="loadSessionHistory()">Session History Dekhein</button>
      <div id="sessionHistory"></div>`;
  } catch (e) { el.innerHTML = '<p>Session load nahi hua: ' + esc(e.message) + '</p>'; }
}
async function loadSessionHistory() {
  const el = document.getElementById('sessionHistory');
  try {
    const d = await api('/api/history?engine=session');
    el.innerHTML = d.signals.length ? d.signals.map(s => `<p>${esc(s.pair)} ${s.direction} — Entry ${fmt(s.entry, 2)} · ${esc(s.outcome || 'In-Flight')} · ${new Date(s.createdAt).toLocaleString()}</p>`).join('') : '<p>Abhi tak koi session signal record nahi hua.</p>';
  } catch (e) { el.innerHTML = '<p>' + esc(e.message) + '</p>'; }
}
async function runBacktest() {
  const el = document.getElementById('backtestBody');
  el.innerHTML = '<p>Backtest chal raha hai…</p>';
  try {
    const d = await api('/api/session/backtest?days=30');
    el.innerHTML = `<p>Trades: ${d.trades} · Wins: ${d.wins} · Losses: ${d.losses} · Win Rate: ${d.winRate}% · Profit Factor: ${d.profitFactor}</p><p>${esc(d.note)}</p>`;
  } catch (e) { el.innerHTML = '<p>' + esc(e.message) + '</p>'; }
}
async function loadPerf() {
  try {
    const d = await api('/api/performance');
    document.getElementById('perfBody').innerHTML = `<p>Total Executed: ${d.total} · Wins: ${d.wins} · Losses: ${d.losses} · Break-Even: ${d.breakEven} · In-Flight: ${d.inFlight} · Win Rate: ${d.winRate == null ? '— (abhi koi closed signal nahi)' : d.winRate + '%'}</p><p>${esc(d.note)}</p>`;
  } catch (e) {}
}
async function loadHistory() {
  const el = document.getElementById('historyBody');
  const o = document.getElementById('fOutcome').value, en = document.getElementById('fEngine').value;
  try {
    const d = await api('/api/history?outcome=' + o + '&engine=' + en);
    el.innerHTML = d.signals.length ? d.signals.map(s => `<div class="price-cell" style="margin:6px 0"><b>${esc(s.pair)}</b> <span class="${s.direction === 'BUY' ? 'buy' : 'sell'}">${s.direction}</span> · ${new Date(s.createdAt).toLocaleString()}<br>Entry ${fmt(s.entry, 2)} · SL ${fmt(s.sl, 2)} · TP1 ${fmt(s.tp1, 2)} · TP2 ${fmt(s.tp2, 2)} · TP3 ${fmt(s.tp3, 2)} · Score ${s.score}% · ${esc(s.engine)} · <b>${esc(s.outcome || 'In-Flight')}</b></div>`).join('') : '<p>Abhi tak koi signal record nahi hua.</p>';
  } catch (e) { el.innerHTML = '<p>' + esc(e.message) + '</p>'; }
}
async function loadRefiner() {
  const el = document.getElementById('refinerBody');
  const c = document.getElementById('refCutoff').value;
  try {
    const d = await api('/api/refiner?cutoff=' + c);
    el.innerHTML = `<p>Cutoff ${d.cutoff}% — Qualifying setups: ${d.qualifying} · Simulated Win Rate: ${d.winRate == null ? '—' : d.winRate + '%'}</p><p>${esc(d.note)}</p>`;
  } catch (e) { el.innerHTML = '<p>' + esc(e.message) + '</p>'; }
}
function exportCsv() { window.open('/api/export.csv', '_blank'); }

// ---- Account: 9 sub-tabs ----
const ACCT_TABS = ['Overview', 'Engine Controls', 'Signal Details', 'Signal History', 'TF Matrix', 'Tracking Logs', 'Export CSV', 'AI Agent', 'Preferences'];
let acctTab = 'Overview';
function buildAcctSubtabs() {
  document.getElementById('acctSubtabs').innerHTML = ACCT_TABS.map(t => `<button class="${t === acctTab ? 'active' : ''}" onclick="acctTab='${t}';buildAcctSubtabs();loadAcct()">${t}</button>`).join('');
  loadAcct();
}
async function loadAcct() {
  const el = document.getElementById('acctBody');
  try {
    if (acctTab === 'Overview') {
      const s = await api('/api/settings');
      const p = await api('/api/performance');
      el.innerHTML = `<p>Username: <b>${esc(me.username)}</b> · Role: ${esc(me.role)} · Plan: ${esc(me.plan || '—')}</p>
      <p>Engines: Terminal ${s.settings.engines.terminal ? 'ON' : 'OFF'} · SMC ${s.settings.engines.smc ? 'ON' : 'OFF'} · Session ${s.settings.engines.session ? 'ON' : 'OFF'}</p>
      <p>Signals: Total ${p.total} · Wins ${p.wins} · Losses ${p.losses} · In-Flight ${p.inFlight}</p>`;
    } else if (acctTab === 'Engine Controls') {
      const s = await api('/api/settings');
      el.innerHTML = ['terminal', 'smc', 'session', 'news'].map(k => `<div class="gate"><span>${k === 'terminal' ? 'Main Terminal' : k === 'smc' ? 'SMC Engine' : k === 'session' ? 'Session Engine' : 'News Intelligence'}</span><button class="btn small ${s.settings.engines[k] ? 'gold' : ''}" onclick="toggleEngine('${k}', ${!s.settings.engines[k]})">${s.settings.engines[k] ? 'ON' : 'OFF'}</button></div>`).join('') +
      `<p>OFF wala engine asal me band ho jata hai — uske signals nahi bante. Test Push sirf app ke andar test message hai, asal push notification nahi.</p>
      <button class="btn small" onclick="testPush()">Test Push (in-app test)</button> <span id="pushMsg"></span>`;
    } else if (acctTab === 'Signal Details') {
      const d = await api('/api/signal?pair=' + currentPair);
      el.innerHTML = d.error ? '<p>' + esc(d.message) + '</p>' : `<p>BUY — Entry ${fmt(d.buyPlan.entryZone[0], 2)} – ${fmt(d.buyPlan.entryZone[1], 2)} · Trigger ${fmt(d.buyPlan.trigger, 2)} · SL ${fmt(d.buyPlan.sl, 2)} · TP ${fmt(d.buyPlan.tp1, 2)} / ${fmt(d.buyPlan.tp2, 2)} / ${fmt(d.buyPlan.tp3, 2)}</p>
      <p>SELL — Entry ${fmt(d.sellPlan.entryZone[0], 2)} – ${fmt(d.sellPlan.entryZone[1], 2)} · Trigger ${fmt(d.sellPlan.trigger, 2)} · SL ${fmt(d.sellPlan.sl, 2)} · TP ${fmt(d.sellPlan.tp1, 2)} / ${fmt(d.sellPlan.tp2, 2)} / ${fmt(d.sellPlan.tp3, 2)}</p>`;
    } else if (acctTab === 'Signal History') {
      el.innerHTML = `<p>History tab me tamam signals hain.</p><button class="btn small gold" onclick="showTab('history')">History Kholein</button>`;
    } else if (acctTab === 'TF Matrix') {
      await loadTfMatrix();
    } else if (acctTab === 'Tracking Logs') {
      const d = await api('/api/logs');
      el.innerHTML = d.logs.length ? d.logs.map(l => `<p>${new Date(l.at).toLocaleTimeString()} — ${esc(l.text)}</p>`).join('') : '<p>Abhi koi log nahi hai.</p>';
    } else if (acctTab === 'Export CSV') {
      el.innerHTML = `<p>Signals CSV me download karein.</p><button class="btn small gold" onclick="exportCsv()">Export CSV</button>`;
    } else if (acctTab === 'AI Agent') {
      el.innerHTML = `<p><b>AI Agent — in-app only.</b> Ye koi live AI service nahi hai, sirf app ke andar ka helper hai.</p>
      <input id="aiQ" placeholder="Sawal likhein, jaise: signal kab banta hai?"><button class="btn gold" onclick="askAi()">Poochein</button><p id="aiA"></p>`;
    } else if (acctTab === 'Preferences') {
      el.innerHTML = `<p>Default pair: <select id="prefPair" onchange="savePref()">${PAIR_IDS.map(p => `<option ${p === currentPair ? 'selected' : ''}>${p}</option>`).join('')}</select></p><p id="prefMsg"></p>`;
    }
  } catch (e) { el.innerHTML = '<p>' + esc(e.message) + '</p>'; }
}
async function loadTfMatrix() {
  const el = document.getElementById('acctBody');
  el.innerHTML = '<p>TF Matrix load ho raha hai…</p>';
  try {
    const d = await api('/api/tfmatrix?pair=' + currentPair);
    el.innerHTML = `<table><tr><th>TF</th><th>RSI</th><th>EMA20</th><th>MACD Hist</th><th>ADX</th><th>Signal</th></tr>` +
      d.rows.map(r => `<tr><td>${esc(r.tf)}</td><td>${r.rsi ?? '—'}</td><td>${fmt(r.ema20, 2)}</td><td>${fmt(r.macdHist, 2)}</td><td>${r.adx ?? '—'}</td><td>${esc(r.signal)}</td></tr>`).join('') + `</table><p>${esc(d.note)}</p>`;
  } catch (e) { el.innerHTML = '<p>' + esc(e.message) + '</p>'; }
}
async function toggleEngine(k, val) {
  try { await api('/api/settings', { method: 'POST', body: JSON.stringify({ engines: { [k]: val } }) }); loadAcct(); }
  catch (e) { alert(e.message); }
}
function testPush() { document.getElementById('pushMsg').textContent = 'Test push (in-app): ye sirf test hai, asal push notification nahi.'; }
async function askAi() {
  const q = document.getElementById('aiQ').value;
  try { const d = await api('/api/ai', { method: 'POST', body: JSON.stringify({ question: q }) }); document.getElementById('aiA').textContent = d.answer + ' (' + d.note + ')'; }
  catch (e) { document.getElementById('aiA').textContent = e.message; }
}
async function savePref() {
  try { await api('/api/settings', { method: 'POST', body: JSON.stringify({ defaultPair: document.getElementById('prefPair').value }) }); document.getElementById('prefMsg').textContent = 'Save ho gaya.'; }
  catch (e) { document.getElementById('prefMsg').textContent = e.message; }
}

// ---- Admin ----
async function loadAdmin() {
  const el = document.getElementById('adminUsers');
  try {
    const d = await api('/api/admin/users');
    document.getElementById('adminCounts').innerHTML = `<p>Total buyers: ${d.total} · Active: ${d.active} · Expired: ${d.expired}</p>`;
    el.innerHTML = d.users.length ? d.users.map(u => `<div class="price-cell" style="margin:6px 0">
      <b>${esc(u.username)}</b> (${esc(u.role)}) · Plan: ${esc(u.plan)} · ${u.expiresAt ? 'Expiry: ' + new Date(u.expiresAt).toLocaleDateString() : 'Lifetime'} · ${u.suspended ? '<span class="sell">Band hai</span>' : '<span class="buy">Active</span>'}
      ${u.role === 'buyer' ? `<div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap">
      <button class="btn small" onclick="adminAction('${esc(u.username)}','extend')">+30 din</button>
      <button class="btn small" onclick="adminAction('${esc(u.username)}','${u.suspended ? 'reopen' : 'suspend'}')">${u.suspended ? 'Kholna' : 'Band karna'}</button>
      <button class="btn small" onclick="adminPass('${esc(u.username)}')">Password badlein</button>
      <button class="btn small" onclick="adminDelete('${esc(u.username)}')">Delete</button></div>` : ''}</div>`).join('') : '<p>Abhi koi buyer nahi hai.</p>';
  } catch (e) { el.innerHTML = '<p>' + esc(e.message) + '</p>'; }
}
async function createBuyer() {
  const username = document.getElementById('newBuyerUser').value.trim();
  const password = document.getElementById('newBuyerPass').value;
  const plan = document.getElementById('newBuyerPlan').value;
  try { await api('/api/admin/users', { method: 'POST', body: JSON.stringify({ username, password, plan }) }); alert('Buyer ban gaya: ' + username + ' (' + plan + ')'); loadAdmin(); }
  catch (e) { alert(e.message); }
}
async function adminAction(username, action) {
  try { await api('/api/admin/users/' + encodeURIComponent(username) + '/' + action, { method: 'POST' }); loadAdmin(); }
  catch (e) { alert(e.message); }
}
async function adminPass(username) {
  const p = prompt('Naya password (kam se kam 6 harf):');
  if (!p) return;
  try { await api('/api/admin/users/' + encodeURIComponent(username) + '/password', { method: 'POST', body: JSON.stringify({ password: p }) }); alert('Password badal gaya.'); }
  catch (e) { alert(e.message); }
}
async function adminDelete(username) {
  if (!confirm(username + ' ko delete karein?')) return;
  try { await api('/api/admin/users/' + encodeURIComponent(username), { method: 'DELETE' }); loadAdmin(); }
  catch (e) { alert(e.message); }
}

init();
