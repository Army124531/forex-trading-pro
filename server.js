// Forex Trading Pro — hosting wala version (Node.js + Express)
// Sirf ek dependency: express. Data JSON file me save hota hai (data/db.json).
// Chalane ke liye: npm install && npm start
const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ---------------- Database (JSON file) ----------------
function defaultDb() {
  return {
    users: [],          // {username, passHash, salt, role:'admin'|'buyer', plan, createdAt, expiresAt, suspended, tgCode, tgChatId, pushSubscriptions:[], notifyPairs:null|[]|['XAUUSD',...]}
    sessions: [],       // {token, username, createdAt}
    signals: [],        // {id, pair, direction, entry, sl, tp1, tp2, tp3, score, gate, engine, createdAt, outcome, outcomeAt}
    logs: [],           // {at, text}
    settings: {
      engines: { terminal: true, smc: true, session: true, news: true },
      aiEnabled: true,
      defaultPair: 'XAUUSD',
      priceMode: 'last', // MT5 price mode: last | bid | ask | mid (Kraken bid/ask se; na ho to last)
      engine: { minQuality: 85, slBufferPct: 0.3, tp1R: 1, tp2R: 2, tp3R: 3, maxConcurrent: 3, sessions: { sydney: true, tokyo: true, london: true, newyork: true } },
    },
    lastPrices: {},     // pairId -> last good quote (backup)
    telegramOffset: 0,  // Telegram getUpdates ka offset (poll karte waqt aage badhta hai)
    buildNote: 'Strategy Refiner ka cutoff sirf is build ke baad record hone wale signals par lagta hai, kyunke purane signals me gate score save nahi hua.',
  };
}
let db = defaultDb();
try { if (fs.existsSync(DB_FILE)) db = Object.assign(defaultDb(), JSON.parse(fs.readFileSync(DB_FILE, 'utf8'))); } catch (e) { console.error('DB load fail, fresh start:', e.message); }
function saveDb() {
  // Foran likhein (debounce nahi) — taake restart/crash par data na khoye.
  try { fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2)); } catch (e) { console.error('DB save fail:', e.message); }
}
function logEvent(text) {
  db.logs.unshift({ at: Date.now(), text });
  if (db.logs.length > 60) db.logs.length = 60;
  saveDb();
}

// ---------------- Auth (scrypt hashing, token sessions) ----------------
function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}
function makeToken() { return crypto.randomBytes(32).toString('hex'); }
function findUser(username) { return db.users.find(u => u.username === username); }
function authUser(req) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return null;
  const s = db.sessions.find(x => x.token === token);
  if (!s) return null;
  const u = findUser(s.username);
  if (!u) return null;
  return u;
}
function requireAuth(req, res, next) {
  const u = authUser(req);
  if (!u) return res.status(401).json({ error: 'not_logged_in', message: 'Pehle login karein.' });
  if (u.suspended) return res.status(403).json({ error: 'suspended', message: 'Account band hai. Admin se rabta karein.' });
  if (u.role === 'buyer' && u.expiresAt && Date.now() > u.expiresAt) {
    return res.status(403).json({ error: 'expired', message: 'Plan khatam ho gaya hai. Admin se renew karwayein.' });
  }
  req.user = u; next();
}
function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'not_admin', message: 'Sirf admin kar sakta hai.' });
    next();
  });
}
const PLAN_DAYS = { Monthly: 30, Quarterly: 90, Yearly: 365, Lifetime: null };

// ---------------- Fetch helpers (parallel, timeouts) ----------------
async function fetchJson(url, timeoutMs = 5000, headers = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': 'ForexTradingPro/1.0', ...headers } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } finally { clearTimeout(t); }
}
async function tryFetch(url, timeoutMs = 5000) {
  try { return await fetchJson(url, timeoutMs); } catch (e) { return null; }
}
async function fetchText(url, timeoutMs = 6000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': 'ForexTradingPro/1.0' } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.text();
  } finally { clearTimeout(t); }
}

// ---------------- Pairs ----------------
const PAIRS = [
  { id: 'XAUUSD', label: 'XAU/USD', name: 'Gold', type: 'metal', kraken: 'PAXGUSD', yahoo: 'GC=F', cg: 'pax-gold', dec: 2 },
  { id: 'XAGUSD', label: 'XAG/USD', name: 'Silver', type: 'metal', kraken: null, yahoo: 'SI=F', cg: null, dec: 2 },
  { id: 'BTCUSD', label: 'BTC/USD', name: 'Bitcoin', type: 'crypto', kraken: 'XBTUSD', yahoo: 'BTC-USD', cg: 'bitcoin', dec: 2 },
  { id: 'ETHUSD', label: 'ETH/USD', name: 'Ethereum', type: 'crypto', kraken: 'ETHUSD', yahoo: 'ETH-USD', cg: 'ethereum', dec: 2 },
  { id: 'SOLUSD', label: 'SOL/USD', name: 'Solana', type: 'crypto', kraken: 'SOLUSD', yahoo: 'SOL-USD', cg: 'solana', dec: 2 },
  { id: 'BNBUSD', label: 'BNB/USD', name: 'Binance Coin', type: 'crypto', kraken: 'BNBUSD', yahoo: 'BNB-USD', cg: 'binancecoin', dec: 2 },
  { id: 'XRPUSD', label: 'XRP/USD', name: 'XRP', type: 'crypto', kraken: 'XRPUSD', yahoo: 'XRP-USD', cg: 'ripple', dec: 4 },
  { id: 'DOGEUSD', label: 'DOGE/USD', name: 'Dogecoin', type: 'crypto', kraken: 'DOGEUSD', yahoo: 'DOGE-USD', cg: 'dogecoin', dec: 4 },
  { id: 'ADAUSD', label: 'ADA/USD', name: 'Cardano', type: 'crypto', kraken: 'ADAUSD', yahoo: 'ADA-USD', cg: 'cardano', dec: 4 },
  { id: 'EURUSD', label: 'EUR/USD', name: 'Euro / Dollar', type: 'forex', kraken: 'EURUSD', yahoo: 'EURUSD=X', dec: 5 },
  { id: 'GBPUSD', label: 'GBP/USD', name: 'Pound / Dollar', type: 'forex', kraken: 'GBPUSD', yahoo: 'GBPUSD=X', dec: 5 },
  { id: 'USDJPY', label: 'USD/JPY', name: 'Dollar / Yen', type: 'forex', kraken: 'USDJPY', yahoo: 'USDJPY=X', dec: 3 },
  { id: 'AUDUSD', label: 'AUD/USD', name: 'Aussie / Dollar', type: 'forex', kraken: 'AUDUSD', yahoo: 'AUDUSD=X', dec: 5 },
  { id: 'USDCAD', label: 'USD/CAD', name: 'Dollar / CAD', type: 'forex', kraken: 'USDCAD', yahoo: 'USDCAD=X', dec: 5 },
  { id: 'USDCHF', label: 'USD/CHF', name: 'Dollar / Franc', type: 'forex', kraken: 'USDCHF', yahoo: 'USDCHF=X', dec: 5 },
];
const KRAKEN_TICKER_PAIRS = ['PAXGUSD', 'XBTUSD', 'ETHUSD', 'SOLUSD', 'BNBUSD', 'XRPUSD', 'DOGEUSD', 'ADAUSD', 'EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'USDCAD', 'USDCHF'];
function krakenKeyToPair(key) {
  // 'XXBTZUSD' -> 'XBTUSD', 'ZEURZUSD' -> 'EURUSD', 'PAXGUSD' -> 'PAXGUSD'
  let k = key.replace(/^X/, '').replace(/^Z/, '');
  k = k.replace('ZUSD', 'USD');
  if (k === 'DGUSD') k = 'DOGEUSD'; // Kraken par Dogecoin ka code XDG hai
  return k;
}

// ---------------- Live prices (ONE parallel batch, ~3s cache) ----------------
let priceCache = { at: 0, data: null };
let priceInflight = null;
// Har source aakhri dafa kab kamyab hua (per-source freshness ke liye) — memory me hi, DB me nahi.
const sourceFresh = {};

async function fetchAllPrices(force) {
  const now = Date.now();
  if (!force && priceCache.data && now - priceCache.at < 3000) return priceCache.data;
  if (priceInflight) return priceInflight;
  priceInflight = (async () => {
    const started = Date.now();
    const sources = [];
    // SAB sources ek saath (parallel) — koi sust source refresh ko nahi rok sakta.
    const krakenP = tryFetch('https://api.kraken.com/0/public/Ticker?pair=' + KRAKEN_TICKER_PAIRS.join(','), 5000);
    const yahooPs = PAIRS.filter(p => p.yahoo).map(p =>
      tryFetch('https://query1.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(p.yahoo) + '?interval=1m&range=1d', 5000)
        .then(d => ({ id: p.id, d })));
    const exP = tryFetch('https://api.exchangerate-api.com/v4/latest/USD', 5000);
    const goldApiPs = ['XAU', 'XAG'].map(s =>
      tryFetch('https://api.gold-api.com/price/' + s, 4000).then(d => ({ s, d })));
    // Binance (key-less, free): crypto 24h change ke liye — CoinGecko ka free tier rate-limit karta hai, is liye Binance use hota hai.
    const BIN_SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT', 'DOGEUSDT', 'ADAUSDT'];
    const binP = tryFetch('https://data-api.binance.vision/api/v3/ticker/24hr?symbols=' + encodeURIComponent(JSON.stringify(BIN_SYMBOLS)), 5000);

    const [kraken, yahooList, ex, goldApiList, bin] = await Promise.all([
      krakenP, Promise.all(yahooPs), exP, Promise.all(goldApiPs), binP,
    ]);

    const krakenMap = {};
    if (kraken && kraken.result) {
      for (const [k, v] of Object.entries(kraken.result)) {
        const pair = krakenKeyToPair(k);
        krakenMap[pair] = { bid: parseFloat(v.b[0]), ask: parseFloat(v.a[0]), last: parseFloat(v.c[0]), open: parseFloat(v.o), high24: parseFloat(v.h[1]), low24: parseFloat(v.l[1]) };
      }
      sources.push({ name: 'Kraken', status: 'CONNECTED' });
      sourceFresh['Kraken'] = Date.now();
    } else sources.push({ name: 'Kraken', status: 'RETRY' });

    const yahooMap = {};
    let yahooOk = 0;
    for (const { id, d } of yahooList) {
      const m = d && d.chart && d.chart.result && d.chart.result[0] && d.chart.result[0].meta;
      if (m && typeof m.regularMarketPrice === 'number') { yahooMap[id] = { price: m.regularMarketPrice, prevClose: m.previousClose }; yahooOk++; }
    }
    sources.push({ name: 'Yahoo Finance', status: yahooOk ? 'CONNECTED' : 'RETRY' });
    if (yahooOk) sourceFresh['Yahoo Finance'] = Date.now();

    const exRates = (ex && ex.rates) ? ex.rates : null;
    sources.push({ name: 'ExchangeRate-API', status: exRates ? 'CONNECTED' : 'RETRY' });
    if (exRates) sourceFresh['ExchangeRate-API'] = Date.now();

    const goldMap = {};
    for (const { s, d } of goldApiList) {
      if (d && typeof d.price === 'number') goldMap[s] = d.price;
    }
    sources.push({ name: 'Gold-API', status: Object.keys(goldMap).length ? 'CONNECTED' : 'RETRY' });
    if (Object.keys(goldMap).length) sourceFresh['Gold-API'] = Date.now();

    // Binance: crypto 24h change (non-critical — Kraken/Yahoo se bhi change nikal sakta hai)
    const binMap = {};
    if (Array.isArray(bin)) {
      for (const b of bin) {
        const sym = (b.symbol || '').replace('USDT', 'USD');
        const chg = parseFloat(b.priceChangePercent);
        if (sym && isFinite(chg)) binMap[sym] = chg;
      }
    }
    sources.push({ name: 'Binance', status: Object.keys(binMap).length ? 'CONNECTED' : 'STANDBY' });
    if (Object.keys(binMap).length) sourceFresh['Binance'] = Date.now();

    const out = [];
    for (const p of PAIRS) {
      let price = null, bid = null, ask = null, change = null, source = 'backup', live = false;
      const k = p.kraken ? krakenMap[p.kraken] : null;
      const y = yahooMap[p.id];
      if (price == null && p.id === 'XAUUSD' && goldMap.XAU) { price = goldMap.XAU; source = 'Gold-API'; live = true; }
      if (price == null && p.id === 'XAGUSD' && goldMap.XAG) { price = goldMap.XAG; source = 'Gold-API'; live = true; }
      if (price == null && k) { price = k.last; bid = k.bid; ask = k.ask; source = 'Kraken' + (p.id === 'XAUUSD' ? ' PAX Gold' : ''); live = true; }
      if (price == null && y) { price = y.price; source = 'Yahoo Finance'; live = true; }
      if (price == null && p.type === 'forex' && exRates) {
        const code = p.id.slice(0, 3) === 'USD' ? p.id.slice(3) : p.id.slice(0, 3);
        if (p.id.startsWith('USD')) { if (exRates[code]) price = exRates[code]; }
        else if (exRates[code]) price = 1 / exRates[code];
        if (price != null) { source = 'ExchangeRate-API'; live = false; }
      }
      if (price == null && db.lastPrices[p.id]) {
        const lp = db.lastPrices[p.id];
        price = lp.price; bid = lp.bid; ask = lp.ask; source = 'backup (purani price)'; live = false;
      }
      if (price != null) {
        if (bid == null || ask == null) { const sp = price * 0.0004; bid = price - sp / 2; ask = price + sp / 2; }
        // 24h change: crypto ke liye Binance, baaki ke liye Kraken open ya Yahoo prevClose
        if (p.type === 'crypto' && binMap[p.id] != null) change = binMap[p.id];
        else if (k && k.open) change = (k.last - k.open) / k.open * 100;
        else if (y && y.prevClose) change = (y.price - y.prevClose) / y.prevClose * 100;
        const q = { id: p.id, label: p.label, name: p.name, type: p.type, price, bid, ask, spread: +(ask - bid).toFixed(p.dec), change24h: change == null ? null : +change.toFixed(2), source, live, dec: p.dec };
        db.lastPrices[p.id] = { price, bid, ask };
        out.push(q);
      } else {
        out.push({ id: p.id, label: p.label, name: p.name, type: p.type, price: null, bid: null, ask: null, spread: null, change24h: null, source: 'unavailable', live: false, dec: p.dec });
      }
    }
    const data = { pairs: out, sources, updatedAt: Date.now(), fetchMs: Date.now() - started };
    priceCache = { at: Date.now(), data };
    saveDb();
    priceInflight = null;
    return data;
  })();
  return priceInflight;
}

// ---------------- Candles (Kraken OHLC, Yahoo fallback) ----------------
const candleCache = new Map(); // key pair|interval -> {at, data}
const INTERVAL_MIN = { '1m': 1, '5m': 5, '15m': 15, '30m': 30, '1H': 60, '4H': 240, '1D': 1440 };
function krakenCandlePair(pairId) {
  const p = PAIRS.find(x => x.id === pairId);
  if (!p) return null;
  if (pairId === 'XAUUSD') return 'PAXGUSD';
  if (pairId === 'XAGUSD') return null; // Kraken par silver pair nahi hai
  return p.kraken;
}
async function krakenCandles(krakenPair, intervalMin) {
  const d = await tryFetch(`https://api.kraken.com/0/public/OHLC?pair=${krakenPair}&interval=${intervalMin}`, 6000);
  if (!d || !d.result) return null;
  const key = Object.keys(d.result).find(k => k !== 'last');
  if (!key || !Array.isArray(d.result[key])) return null;
  return d.result[key].map(c => ({ t: c[0] * 1000, o: +c[1], h: +c[2], l: +c[3], c: +c[4], v: +c[6] }));
}
async function yahooCandles(symbol, interval, range) {
  const d = await tryFetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${interval}&range=${range}`, 6000);
  const r = d && d.chart && d.chart.result && d.chart.result[0];
  if (!r || !r.timestamp) return null;
  const q = r.indicators.quote[0];
  const out = [];
  for (let i = 0; i < r.timestamp.length; i++) {
    if (q.close[i] == null) continue;
    out.push({ t: r.timestamp[i] * 1000, o: q.open[i], h: q.high[i], l: q.low[i], c: q.close[i], v: q.volume[i] || 0 });
  }
  return out.length ? out : null;
}
const YAHOO_INTERVAL = { 1: ['1m', '1d'], 5: ['5m', '5d'], 15: ['15m', '5d'], 30: ['30m', '1mo'], 60: ['1h', '3mo'], 240: ['1h', '3mo'], 1440: ['1d', '1y'] };
async function getCandles(pairId, intervalLabel) {
  const iv = INTERVAL_MIN[intervalLabel] || 15;
  const key = pairId + '|' + iv;
  const cached = candleCache.get(key);
  if (cached && Date.now() - cached.at < 60000) return cached.data;
  let data = null;
  const kp = krakenCandlePair(pairId);
  if (kp) data = await krakenCandles(kp, iv);
  if (!data) {
    const p = PAIRS.find(x => x.id === pairId);
    if (p && p.yahoo) {
      const [yi, yr] = YAHOO_INTERVAL[iv] || ['15m', '5d'];
      data = await yahooCandles(p.yahoo, yi, yr);
    }
  }
  if (data && data.length) {
    // 4H candles 1H se banayein (Kraken 240 deta hai, Yahoo nahi)
    candleCache.set(key, { at: Date.now(), data });
  }
  return data || [];
}

// ---------------- Indicators (asal candles se) ----------------
function emaArr(values, period) {
  const k = 2 / (period + 1);
  const out = new Array(values.length).fill(null);
  let prev = null;
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) continue;
    if (prev == null) { let s = 0; for (let j = i - period + 1; j <= i; j++) s += values[j]; prev = s / period; }
    else prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}
function lastVal(arr) { for (let i = arr.length - 1; i >= 0; i--) if (arr[i] != null) return arr[i]; return null; }
function rsiArr(closes, period = 14) {
  const out = new Array(closes.length).fill(null);
  let gain = 0, loss = 0;
  for (let i = 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    const g = Math.max(d, 0), l = Math.max(-d, 0);
    if (i <= period) { gain += g; loss += l; if (i === period) { const rs = loss === 0 ? 100 : gain / loss; out[i] = 100 - 100 / (1 + rs); } }
    else {
      gain = (gain * (period - 1) + g) / period; loss = (loss * (period - 1) + l) / period;
      const rs = loss === 0 ? 100 : gain / loss; out[i] = 100 - 100 / (1 + rs);
    }
  }
  return out;
}
function atrArr(candles, period = 14) {
  const tr = [];
  for (let i = 0; i < candles.length; i++) {
    if (i === 0) tr.push(candles[i].h - candles[i].l);
    else tr.push(Math.max(candles[i].h - candles[i].l, Math.abs(candles[i].h - candles[i - 1].c), Math.abs(candles[i].l - candles[i - 1].c)));
  }
  const out = new Array(candles.length).fill(null);
  let s = 0;
  for (let i = 0; i < tr.length; i++) {
    s += tr[i];
    if (i >= period - 1) { out[i] = i === period - 1 ? s / period : (out[i - 1] * (period - 1) + tr[i]) / period; }
  }
  return out;
}
function sma(values, period) {
  const out = new Array(values.length).fill(null);
  for (let i = period - 1; i < values.length; i++) { let s = 0; for (let j = i - period + 1; j <= i; j++) s += values[j]; out[i] = s / period; }
  return out;
}
function stddev(values, period) {
  const m = sma(values, period); const out = new Array(values.length).fill(null);
  for (let i = period - 1; i < values.length; i++) { let s = 0; for (let j = i - period + 1; j <= i; j++) s += Math.pow(values[j] - m[i], 2); out[i] = Math.sqrt(s / period); }
  return out;
}
function macdArr(closes) {
  const e12 = emaArr(closes, 12), e26 = emaArr(closes, 26);
  const line = closes.map((_, i) => (e12[i] != null && e26[i] != null) ? e12[i] - e26[i] : null);
  const sigVals = line.map(v => v == null ? 0 : v);
  const sig = emaArr(sigVals, 9);
  const i = line.length - 1;
  return { macd: line[i], signal: sig[i], hist: (line[i] != null && sig[i] != null) ? line[i] - sig[i] : null };
}
function adxArr(candles, period = 14) {
  // Simplified ADX: +DM/-DM aur TR se
  const n = candles.length;
  if (n < period + 2) return null;
  let trS = 0, dmPS = 0, dmMS = 0;
  for (let i = 1; i <= period; i++) {
    const c = candles[i], p = candles[i - 1];
    trS += Math.max(c.h - c.l, Math.abs(c.h - p.c), Math.abs(c.l - p.c));
    dmPS += Math.max(c.h - p.h, 0) > Math.max(p.l - c.l, 0) ? Math.max(c.h - p.h, 0) : 0;
    dmMS += Math.max(p.l - c.l, 0) > Math.max(c.h - p.h, 0) ? Math.max(p.l - c.l, 0) : 0;
  }
  let dxSum = 0, dxCount = 0;
  for (let i = period + 1; i < n; i++) {
    const c = candles[i], p = candles[i - 1];
    const tr = Math.max(c.h - c.l, Math.abs(c.h - p.c), Math.abs(c.l - p.c));
    const dmP = Math.max(c.h - p.h, 0) > Math.max(p.l - c.l, 0) ? Math.max(c.h - p.h, 0) : 0;
    const dmM = Math.max(p.l - c.l, 0) > Math.max(c.h - p.h, 0) ? Math.max(p.l - c.l, 0) : 0;
    trS = trS - trS / period + tr; dmPS = dmPS - dmPS / period + dmP; dmMS = dmMS - dmMS / period + dmM;
    const diP = trS ? 100 * dmPS / trS : 0, diM = trS ? 100 * dmMS / trS : 0;
    const dx = (diP + diM) ? 100 * Math.abs(diP - diM) / (diP + diM) : 0;
    dxSum += dx; dxCount++;
  }
  return dxCount ? dxSum / dxCount : null;
}
function stochArr(candles, period = 14) {
  const n = candles.length;
  if (n < period) return { k: null, d: null };
  const ks = [];
  for (let i = period - 1; i < n; i++) {
    let hi = -Infinity, lo = Infinity;
    for (let j = i - period + 1; j <= i; j++) { hi = Math.max(hi, candles[j].h); lo = Math.min(lo, candles[j].l); }
    ks.push(hi === lo ? 50 : (candles[i].c - lo) / (hi - lo) * 100);
  }
  const k = ks[ks.length - 1];
  const d = ks.length >= 3 ? (ks[ks.length - 1] + ks[ks.length - 2] + ks[ks.length - 3]) / 3 : k;
  return { k, d };
}
// Daily Pivot Points: pichle poore UTC din ke H/L/C se (asal 1H candles).
// P = (H+L+C)/3, R1 = 2P−L, S1 = 2P−H, R2 = P+(H−L), S2 = P−(H−L).
// Poora din na mile to null (koi number banaya nahi jata).
// v9.6.1: pivots pair ke asal decimals me (pehle hamesha 2 — forex "1.33" dikhta tha).
// Sirf Indicators tab ki display values hain — signal engine inhe use nahi karta.
function dailyPivots(candles, dec) {
  if (!candles || candles.length < 25) return null;
  const keyOf = (t) => { const d = new Date(t); return d.getUTCFullYear() + '-' + (d.getUTCMonth() + 1) + '-' + d.getUTCDate(); };
  const lastKey = keyOf(candles[candles.length - 1].t);
  let day = null, H = -Infinity, L = Infinity, C = null;
  for (let i = candles.length - 1; i >= 0; i--) {
    const k = keyOf(candles[i].t);
    if (k === lastKey) continue; // aaj (chaloo din) ki candles skip — poora din chahiye
    if (day === null) day = k;
    if (k !== day) break;
    H = Math.max(H, candles[i].h); L = Math.min(L, candles[i].l);
    if (C === null) C = candles[i].c; // peeche se pehli candle = us din ki aakhri candle ka close
  }
  if (day === null || !isFinite(H) || !isFinite(L) || C == null) return null;
  const P = (H + L + C) / 3;
  const f = (v) => +v.toFixed(dec ?? 2);
  return { P: f(P), R1: f(2 * P - L), S1: f(2 * P - H), R2: f(P + (H - L)), S2: f(P - (H - L)), dayHigh: H, dayLow: L, dayClose: C };
}

// Gold Buy/Sell Zones (v9.6.3): asal 1H candles se — pivot (3/3) + impulse (1.0 x ATR(14)).
// Supply (SELL) zone: pivot high, phir price zor se neeche. Demand (BUY) zone: pivot low, phir price zor se upar.
// Zone toot jata hai jab 1H candle uske bahar close ho (supply ke upar / demand ke neeche).
// Re-entry par tests++ (sirf tab jab pichli candle zone ke andar nahi thi).
// Sirf display — signal engine inhe use nahi karta. Sirf XAUUSD ke liye.
function computeZones(candles) {
  if (!candles || candles.length < 25) return null;
  const n = candles.length;
  const atr = atrArr(candles, 14);
  const supply = [], demand = [];
  const inZone = (z, k) => candles[k].l <= z.top && candles[k].h >= z.bottom;
  for (let k = 0; k < n; k++) {
    const c = candles[k];
    // Maujooda zones: break / test (formation bar par test nahi — sirf baad wali bars par)
    for (let s = supply.length - 1; s >= 0; s--) {
      const z = supply[s];
      if (c.c > z.top) { supply.splice(s, 1); continue; }
      if (k > 0 && inZone(z, k) && !inZone(z, k - 1)) z.tests++;
    }
    for (let s = demand.length - 1; s >= 0; s--) {
      const z = demand[s];
      if (c.c < z.bottom) { demand.splice(s, 1); continue; }
      if (k > 0 && inZone(z, k) && !inZone(z, k - 1)) z.tests++;
    }
    // Naya zone: pivot i = k-3, confirm bar k
    const i = k - 3;
    if (i >= 3 && i <= n - 4) {
      const a = atr[k];
      if (a != null && a > 0) {
        const hi = candles[i].h, lo = candles[i].l;
        let isPH = true, isPL = true;
        for (let d = 1; d <= 3; d++) {
          if (!(hi > candles[i - d].h) || !(hi >= candles[i + d].h)) isPH = false;
          if (!(lo < candles[i - d].l) || !(lo <= candles[i + d].l)) isPL = false;
        }
        if (isPH) {
          let bot = Infinity;
          for (let b = k - 6; b <= k; b++) bot = Math.min(bot, candles[b].l);
          if (hi - c.c > 1.0 * a) {
            supply.push({ side: 'supply', top: hi, bottom: bot, tests: 0, formedAt: candles[i].t, confirmedAt: candles[k].t });
            if (supply.length > 5) supply.shift();
          }
        }
        if (isPL) {
          let top = -Infinity;
          for (let b = k - 6; b <= k; b++) top = Math.max(top, candles[b].h);
          if (c.c - lo > 1.0 * a) {
            demand.push({ side: 'demand', top, bottom: lo, tests: 0, formedAt: candles[i].t, confirmedAt: candles[k].t });
            if (demand.length > 5) demand.shift();
          }
        }
      }
    }
  }
  const price = candles[n - 1].c;
  const lastAtr = atr[n - 1];
  let nearestBuy = null, nearestSell = null;
  for (const z of demand) if (z.top <= price && (!nearestBuy || z.top > nearestBuy.top)) nearestBuy = z;
  for (const z of supply) if (z.bottom >= price && (!nearestSell || z.bottom < nearestSell.bottom)) nearestSell = z;
  const inBuy = demand.some(z => price >= z.bottom && price <= z.top);
  const inSell = supply.some(z => price >= z.bottom && price <= z.top);
  let status;
  if (!supply.length && !demand.length) status = 'none';
  else if (inBuy) status = 'in_buy';
  else if (inSell) status = 'in_sell';
  else if (nearestBuy && lastAtr != null && price - nearestBuy.top <= 0.5 * lastAtr) status = 'near_buy';
  else if (nearestSell && lastAtr != null && nearestSell.bottom - price <= 0.5 * lastAtr) status = 'near_sell';
  else status = 'between';
  return { price, atr: lastAtr, supply: supply.slice().reverse(), demand: demand.slice().reverse(), nearestBuy, nearestSell, status };
}

// ---------------- Trend Panel (v9.6.4) ----------------
// TradingView Trend Panel ka hisaab, asal candles se — display only, koi signal nahi.
// Har timeframe — TradingView panel wala asal rule (Pine):
// Bullish = close > EMA50 aur EMA20 > EMA50; Bearish = close < EMA50 aur EMA20 < EMA50; warna Mixed.
// Overall BUY sirf jab 15m+30m+1H+4H sab Bullish, SELL sirf jab sab Bearish — Daily sirf dikhaya jata hai.
function trendStateOf(tf) {
  if (!tf || tf.error || tf.ema20 == null || tf.ema50 == null || tf.lastPrice == null) return 'nodata';
  if (tf.lastPrice > tf.ema50 && tf.ema20 > tf.ema50) return 'bullish';
  if (tf.lastPrice < tf.ema50 && tf.ema20 < tf.ema50) return 'bearish';
  return 'mixed';
}
function computeTrendPanel(timeframes) {
  const tfs = ['15m', '30m', '1H', '4H', '1D'];
  const rows = tfs.map(tf => {
    const d = timeframes ? timeframes[tf] : null;
    return { tf, state: trendStateOf(d), ema20: d && !d.error ? d.ema20 : null, ema50: d && !d.error ? d.ema50 : null, price: d && !d.error ? d.lastPrice : null };
  });
  const core = rows.slice(0, 4).map(r => r.state);
  const overall = core.every(s => s === 'bullish') ? 'BUY' : core.every(s => s === 'bearish') ? 'SELL' : 'WAIT';
  return { rows, overall };
}

function computeIndicators(candles) {
  const closes = candles.map(c => c.c);
  const last = candles[candles.length - 1];
  const e20 = emaArr(closes, 20), e50 = emaArr(closes, 50), e200 = emaArr(closes, 200);
  const rsi = rsiArr(closes, 14), atr = atrArr(candles, 14);
  const macd = macdArr(closes);
  const adx = adxArr(candles, 14);
  const bbMid = lastVal(sma(closes, 20)), bbSd = lastVal(stddev(closes, 20));
  const st = stochArr(candles, 14);
  // CCI
  let cci = null;
  if (candles.length >= 20) {
    const tp = candles.map(c => (c.h + c.l + c.c) / 3);
    const m = lastVal(sma(tp, 20));
    let md = 0; for (let i = tp.length - 20; i < tp.length; i++) md += Math.abs(tp[i] - m);
    md /= 20; cci = md ? (tp[tp.length - 1] - m) / (0.015 * md) : null;
  }
  // Williams %R
  let wr = null;
  if (candles.length >= 14) {
    let hi = -Infinity, lo = Infinity;
    for (let i = candles.length - 14; i < candles.length; i++) { hi = Math.max(hi, candles[i].h); lo = Math.min(lo, candles[i].l); }
    wr = hi === lo ? null : (hi - last.c) / (hi - lo) * -100;
  }
  // Ichimoku (9/26/52)
  function donchian(period, offset) {
    let hi = -Infinity, lo = Infinity;
    const end = candles.length - 1 - (offset || 0);
    for (let i = end - period + 1; i <= end; i++) { if (i < 0) return null; hi = Math.max(hi, candles[i].h); lo = Math.min(lo, candles[i].l); }
    return (hi + lo) / 2;
  }
  const tenkan = donchian(9, 0), kijun = donchian(26, 0);
  const spanA = (tenkan != null && kijun != null) ? (tenkan + kijun) / 2 : null;
  const spanB = donchian(52, 0);
  const chikou = candles.length > 26 ? candles[candles.length - 1 - 26].c : null;
  // VWAP (typical price, volume weighted, aaj ki candles)
  let vwap = null, pv = 0, vv = 0;
  for (const c of candles.slice(-96)) { const tp = (c.h + c.l + c.c) / 3; pv += tp * (c.v || 1); vv += (c.v || 1); }
  if (vv) vwap = pv / vv;
  // Volume: OBV / CMF / MFI
  let obv = 0;
  for (let i = 1; i < candles.length; i++) { obv += candles[i].c > candles[i - 1].c ? (candles[i].v || 0) : candles[i].c < candles[i - 1].c ? -(candles[i].v || 0) : 0; }
  let cmf = null, mfi = null;
  const cmfN = Math.min(20, candles.length);
  let mfSum = 0, volSum = 0;
  for (let i = candles.length - cmfN; i < candles.length; i++) {
    const c = candles[i]; const mf = c.h === c.l ? 0 : ((c.c - c.l) - (c.h - c.c)) / (c.h - c.l);
    mfSum += mf * (c.v || 0); volSum += (c.v || 0);
  }
  if (volSum) cmf = mfSum / volSum;
  const mfiN = 14;
  if (candles.length > mfiN) {
    let pos = 0, neg = 0;
    for (let i = candles.length - mfiN; i < candles.length; i++) {
      const c = candles[i], p = candles[i - 1];
      const tp = (c.h + c.l + c.c) / 3, ptp = (p.h + p.l + p.c) / 3;
      if (tp > ptp) pos += tp * (c.v || 0); else if (tp < ptp) neg += tp * (c.v || 0);
    }
    mfi = (pos + neg) ? 100 - 100 / (1 + pos / (neg || 1e-9)) : null;
  }
  // Support / Resistance: aakhri swing levels
  const swings = findSwings(candles);
  const support = swings.low, resistance = swings.high;
  // Fibonacci: aakhri swing high/low se
  const fib = {};
  if (swings.high != null && swings.low != null) {
    const range = swings.high - swings.low;
    for (const [k, r] of [['38.2', 0.382], ['61.8', 0.618], ['78.6', 0.786]]) fib[k] = swings.high - range * r;
  }
  // Parabolic SAR (simplified): aakhri trend ki taraf
  const sar = last.c > (lastVal(e20) || last.c) ? last.l : last.h;
  const atrV = lastVal(atr);
  return {
    ema20: lastVal(e20), ema50: lastVal(e50), ema200: lastVal(e200),
    rsi14: lastVal(rsi), atr14: atrV, macd: macd.macd, macdSignal: macd.signal, macdHist: macd.hist,
    adx14: adx, bbUpper: bbMid != null && bbSd != null ? bbMid + 2 * bbSd : null,
    bbMiddle: bbMid, bbLower: bbMid != null && bbSd != null ? bbMid - 2 * bbSd : null,
    stochK: st.k, stochD: st.d, cci, williamsR: wr,
    tenkan, kijun, spanA, spanB, chikou, vwap,
    obv, cmf, mfi, support, resistance, fib, sar,
    lastPrice: last.c, lastOpen: last.o,
  };
}
function findSwings(candles) {
  let high = null, low = null;
  const n = candles.length;
  for (let i = 2; i < n - 2; i++) {
    if (candles[i].h > candles[i - 1].h && candles[i].h > candles[i - 2].h && candles[i].h >= candles[i + 1].h && candles[i].h >= candles[i + 2].h) high = candles[i].h;
    if (candles[i].l < candles[i - 1].l && candles[i].l < candles[i - 2].l && candles[i].l <= candles[i + 1].l && candles[i].l <= candles[i + 2].l) low = candles[i].l;
  }
  if (high == null) high = Math.max(...candles.slice(-30).map(c => c.h));
  if (low == null) low = Math.min(...candles.slice(-30).map(c => c.l));
  return { high, low };
}

// ---------------- v4: Extended confluence (sirf display — signal ki direction/gates nahi badalte) ----------------
// Sab kuch asal 1H candles se hisaab hota hai. Jo cheez data me nahi milti, wo null / available:false hoti hai — kabhi banayi nahi jati.
function macdLineArr(closes) {
  const e12 = emaArr(closes, 12), e26 = emaArr(closes, 26);
  return closes.map((_, i) => (e12[i] != null && e26[i] != null) ? e12[i] - e26[i] : null);
}
function localExtrema(candles, fromIdx) {
  const lows = [], highs = [];
  for (let i = Math.max(2, fromIdx); i < candles.length - 2; i++) {
    const c = candles[i];
    if (c.l < candles[i - 1].l && c.l < candles[i - 2].l && c.l <= candles[i + 1].l && c.l <= candles[i + 2].l) lows.push(i);
    if (c.h > candles[i - 1].h && c.h > candles[i - 2].h && c.h >= candles[i + 1].h && c.h >= candles[i + 2].h) highs.push(i);
  }
  return { lows, highs };
}
function pearson(xs, ys) {
  const n = xs.length;
  if (n < 2) return null;
  const mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { const dx = xs[i] - mx, dy = ys[i] - my; sxy += dx * dy; sxx += dx * dx; syy += dy * dy; }
  if (!sxx || !syy) return null;
  return sxy / Math.sqrt(sxx * syy);
}
function correlation20(closesA, timesA, closesB, timesB) {
  // Aakhri 20 matched pairs (timestamp 30 min ke andar) par Pearson correlation.
  const pairs = [];
  const tol = 30 * 60 * 1000;
  for (let i = timesA.length - 1; i >= 0 && pairs.length < 20; i--) {
    let best = null, bestDiff = tol;
    for (let j = 0; j < timesB.length; j++) {
      const d = Math.abs(timesB[j] - timesA[i]);
      if (d < bestDiff) { bestDiff = d; best = closesB[j]; }
    }
    if (best != null) pairs.push([closesA[i], best]);
  }
  if (pairs.length < 10) return null;
  return pearson(pairs.map(p => p[0]), pairs.map(p => p[1]));
}
function killzoneInfo(now) {
  const d = now || new Date();
  const utcH = d.getUTCHours() + d.getUTCMinutes() / 60;
  const zones = [
    { code: 'asian', start: 0, end: 3 },
    { code: 'london', start: 7, end: 10 },
    { code: 'newyork', start: 12, end: 15 },
  ];
  let active = null;
  for (const z of zones) if (utcH >= z.start && utcH < z.end) active = z;
  let next = null, nextIn = Infinity;
  for (const z of zones) {
    let diff = (z.start - utcH + 24) % 24;
    if (diff === 0) diff = 24;
    if (diff < nextIn) { nextIn = diff; next = z; }
  }
  return { active: active ? active.code : null, activeStart: active ? active.start : null, activeEnd: active ? active.end : null, next: next.code, nextStart: next.start, nextInMin: Math.round(nextIn * 60) };
}
// Candlestick patterns: aakhri band (closed) 1H candle + us se pehle ki 2 candles.
function detectCandlePattern(last3) {
  if (!last3 || last3.length < 3) return null;
  const a = last3[0], b = last3[1], c = last3[2];
  const body = (x) => Math.abs(x.c - x.o);
  const range = (x) => x.h - x.l;
  // Morning / Evening star (3 candles)
  if (a.c < a.o && body(b) <= 0.35 * range(b) && b.c < a.c && c.c > c.o && c.c > (a.o + a.c) / 2) return { code: 'morningStar', direction: 'BUY' };
  if (a.c > a.o && body(b) <= 0.35 * range(b) && b.c > a.c && c.c < c.o && c.c < (a.o + a.c) / 2) return { code: 'eveningStar', direction: 'SELL' };
  // Engulfing (2 candles)
  if (b.c < b.o && c.c > c.o && c.o <= b.c && c.c >= b.o) return { code: 'bullEngulf', direction: 'BUY' };
  if (b.c > b.o && c.c < c.o && c.o >= b.c && c.c <= b.o) return { code: 'bearEngulf', direction: 'SELL' };
  // Pin bar / doji (1 candle)
  const cb = body(c), cr = range(c);
  if (cr > 0 && cb <= 0.1 * cr) return { code: 'doji', direction: 'NEUTRAL' };
  if (cb > 0) {
    const upper = c.h - Math.max(c.o, c.c), lower = Math.min(c.o, c.c) - c.l;
    if (lower >= 2 * cb && upper <= cb) return { code: 'hammer', direction: 'BUY' };
    if (upper >= 2 * cb && lower <= cb) return { code: 'shootingStar', direction: 'SELL' };
  }
  return null;
}
function computeFibLevels(high, low) {
  if (high == null || low == null || !(high > low)) return null;
  const r = high - low;
  const levels = [
    { label: '23.6%', price: high - 0.236 * r },
    { label: '38.2%', price: high - 0.382 * r },
    { label: '50%', price: high - 0.5 * r },
    { label: '61.8%', price: high - 0.618 * r },
    { label: '78.6%', price: high - 0.786 * r },
    { label: '127.2%↑', price: high + 0.272 * r },
    { label: '161.8%↑', price: high + 0.618 * r },
    { label: '127.2%↓', price: low - 0.272 * r },
    { label: '161.8%↓', price: low - 0.618 * r },
  ];
  return { high, low, levels };
}
function nearestLevel(levels, price) {
  let best = null;
  for (const l of levels) if (!best || Math.abs(l.price - price) < Math.abs(best.price - price)) best = l;
  return best;
}
function findAllOBs(candles, dir, lookback) {
  const out = [];
  const start = Math.max(0, candles.length - lookback);
  for (let i = candles.length - 3; i >= start; i--) {
    const c = candles[i], nxt = candles[i + 1], nxt2 = candles[i + 2];
    if (!nxt || !nxt2) continue;
    if (dir === 'bullish' && c.c < c.o && nxt.c > nxt.o && nxt2.c > nxt2.o) out.push({ low: Math.min(c.l, nxt.l), high: Math.max(c.h, nxt.h), idx: i, dir: 'bullish' });
    if (dir === 'bearish' && c.c > c.o && nxt.c < nxt.o && nxt2.c < nxt2.o) out.push({ low: Math.min(c.l, nxt.l), high: Math.max(c.h, nxt.h), idx: i, dir: 'bearish' });
  }
  return out;
}
function classifyBlocks(candles, lookback) {
  const blocks = [];
  for (const dir of ['bullish', 'bearish']) {
    for (const ob of findAllOBs(candles, dir, lookback)) {
      let touched = false, broken = false;
      for (let j = ob.idx + 3; j < candles.length; j++) {
        const c = candles[j];
        if (c.l <= ob.high && c.h >= ob.low) touched = true;
        if (dir === 'bullish' && c.c < ob.low) { broken = true; break; }
        if (dir === 'bearish' && c.c > ob.high) { broken = true; break; }
      }
      if (broken) blocks.push({ type: 'Breaker', dir: dir === 'bullish' ? 'SELL' : 'BUY', low: ob.low, high: ob.high, idx: ob.idx });
      else if (touched) blocks.push({ type: 'Mitigation', dir: dir === 'bullish' ? 'BUY' : 'SELL', low: ob.low, high: ob.high, idx: ob.idx });
    }
  }
  blocks.sort((a, b) => b.idx - a.idx);
  // Aas-paas ki same-direction blocks aik hi zone hain — taaza wali rakhein, purani overlap wali hata dein.
  const kept = [];
  for (const b of blocks) {
    const overlaps = kept.some(k => k.dir === b.dir && b.low <= k.high && b.high >= k.low);
    if (!overlaps) kept.push(b);
    if (kept.length >= 2) break;
  }
  return kept;
}
function detectMacdDivergence(candles) {
  const n = candles.length;
  if (n < 40) return { found: false, type: null };
  const closes = candles.map(c => c.c);
  const macd = macdLineArr(closes);
  const ex = localExtrema(candles, Math.max(0, n - 32));
  const lows = ex.lows.filter(i => macd[i] != null);
  const highs = ex.highs.filter(i => macd[i] != null);
  let bull = null, bear = null;
  if (lows.length >= 2) {
    const i1 = lows[lows.length - 2], i2 = lows[lows.length - 1];
    if (candles[i2].l < candles[i1].l && macd[i2] > macd[i1]) bull = i2;
  }
  if (highs.length >= 2) {
    const i1 = highs[highs.length - 2], i2 = highs[highs.length - 1];
    if (candles[i2].h > candles[i1].h && macd[i2] < macd[i1]) bear = i2;
  }
  if (bull != null && bear != null) return bull > bear ? { found: true, type: 'bullish' } : { found: true, type: 'bearish' };
  if (bull != null) return { found: true, type: 'bullish' };
  if (bear != null) return { found: true, type: 'bearish' };
  return { found: false, type: null };
}
function volumeInfo(candles) {
  if (!candles || candles.length < 22) return { available: false, ratio: null, trend: null };
  const done = candles.slice(0, -1); // in-progress candle nahi
  const prev20 = done.slice(-21, -1);
  const last = done[done.length - 1];
  const sum = prev20.reduce((a, c) => a + (c.v || 0), 0) + (last.v || 0);
  if (sum <= 0) return { available: false, ratio: null, trend: null };
  const avg = prev20.reduce((a, c) => a + (c.v || 0), 0) / prev20.length;
  if (!avg) return { available: false, ratio: null, trend: null };
  const ratio = (last.v || 0) / avg;
  return { available: true, ratio: +ratio.toFixed(2), trend: ratio >= 1.2 ? 'rising' : ratio <= 0.8 ? 'falling' : 'normal' };
}
function asianRange(candles, live) {
  if (!candles || !candles.length) return null;
  const now = new Date();
  let start = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  if (now.getUTCHours() < 6) start -= 24 * 3600000;
  const end = start + 6 * 3600000;
  let high = null, low = null, count = 0;
  for (const c of candles) {
    if (c.t >= start && c.t < end) {
      high = high == null ? c.h : Math.max(high, c.h);
      low = low == null ? c.l : Math.min(low, c.l);
      count++;
    }
  }
  if (count < 3 || high == null || low == null) return null;
  return { high, low, expanded: live > high ? 'above' : live < low ? 'below' : null };
}
function vwapBands(candles, live) {
  if (!candles || !candles.length) return null;
  const now = new Date();
  const start = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const sess = candles.filter(c => c.t >= start);
  if (sess.length < 4) return null;
  const volSum = sess.reduce((a, c) => a + (c.v || 0), 0);
  if (!volSum) return null; // asal volume nahi hai to VWAP banaya nahi jata
  let pv = 0, vv = 0;
  const tps = [];
  for (const c of sess) {
    const tp = (c.h + c.l + c.c) / 3, w = c.v || 1;
    pv += tp * w; vv += w; tps.push({ tp, w });
  }
  if (!vv) return null;
  const vwap = pv / vv;
  let vs = 0;
  for (const x of tps) vs += x.w * Math.pow(x.tp - vwap, 2);
  const sd = Math.sqrt(vs / vv);
  if (!sd) return null;
  const bands = [
    { label: '+2σ', price: vwap + 2 * sd },
    { label: '+1σ', price: vwap + sd },
    { label: 'VWAP', price: vwap },
    { label: '−1σ', price: vwap - sd },
    { label: '−2σ', price: vwap - 2 * sd },
  ];
  return { vwap, plus1: vwap + sd, minus1: vwap - sd, plus2: vwap + 2 * sd, minus2: vwap - 2 * sd, nearest: nearestLevel(bands, live) };
}

// Extended confluence — sirf display. Pure function: koi fetch/DB nahi, signal direction/gates ko nahi chhoota.
function computeExtended(c1h, live, ema20, ema50, atr1h, dxy) {
  const ext = {
    candle: null,
    choch: { found: false, dir: null },
    mss: { found: false, dir: null },
    trend: 'flat',
    breakers: [],
    idm: { found: false, side: null },
    fib: null,
    bollinger: null,
    macdDiv: { found: false, type: null },
    meanRev: null,
    killzone: killzoneInfo(),
    asian: null,
    dxy: { available: false, value: null, corr20: null },
    vwapBands: null,
    volume: { available: false, ratio: null, trend: null },
  };
  if (!c1h || c1h.length < 40 || live == null) return ext;
  try {
    const n = c1h.length;
    const closes = c1h.map(c => c.c);
    // 1) Candlestick pattern — aakhri band (closed) 1H candle
    ext.candle = detectCandlePattern(c1h.slice(-4, -1));
    // 2) Trend (1H EMA20/EMA50)
    if (ema20 != null && ema50 != null) ext.trend = ema20 > ema50 ? 'up' : ema20 < ema50 ? 'down' : 'flat';
    // 3) BOS events + IDM — aik hi scan (aakhri 60 candles)
    const events = [];
    let lastUpLevel = null, lastDownLevel = null;
    const scanFrom = Math.max(10, n - 60);
    for (let i = scanFrom; i < n; i++) {
      const prevSw = findSwings(c1h.slice(0, i));
      const c = c1h[i];
      if (prevSw.high != null && c.c > prevSw.high && prevSw.high !== lastUpLevel) { events.push({ dir: 'up', at: c.t, level: prevSw.high }); lastUpLevel = prevSw.high; }
      if (prevSw.low != null && c.c < prevSw.low && prevSw.low !== lastDownLevel) { events.push({ dir: 'down', at: c.t, level: prevSw.low }); lastDownLevel = prevSw.low; }
      if (i >= n - 30) {
        if (prevSw.low != null && c.l < prevSw.low && c.c > prevSw.low) {
          for (let j = i + 1; j <= Math.min(n - 1, i + 5); j++) {
            if (c1h[j].c > c.h) { ext.idm = { found: true, side: 'SSL' }; break; }
          }
        } else if (prevSw.high != null && c.h > prevSw.high && c.c < prevSw.high) {
          for (let j = i + 1; j <= Math.min(n - 1, i + 5); j++) {
            if (c1h[j].c < c.l) { ext.idm = { found: true, side: 'BSL' }; break; }
          }
        }
      }
    }
    const lastEv = events.length ? events[events.length - 1] : null;
    const prevEv = events.length > 1 ? events[events.length - 2] : null;
    if (lastEv) {
      if (ext.trend !== 'flat' && lastEv.dir !== ext.trend) ext.choch = { found: true, dir: lastEv.dir };
      if (prevEv && lastEv.dir === ext.trend && prevEv.dir !== lastEv.dir) ext.mss = { found: true, dir: lastEv.dir };
    }
    // 4) Breaker / mitigation blocks (1H, aakhri 60 candles)
    ext.breakers = classifyBlocks(c1h, 60);
    // 5) Fibonacci — aakhri 1H swing high/low
    const sw = findSwings(c1h);
    const fib = computeFibLevels(sw.high, sw.low);
    if (fib) ext.fib = { high: fib.high, low: fib.low, levels: fib.levels, nearest: nearestLevel(fib.levels, live) };
    // 6) Bollinger squeeze + %B
    const mid = sma(closes, 20), sd = stddev(closes, 20);
    if (mid[n - 1] != null && sd[n - 1] != null) {
      const bw = [];
      for (let i = 19; i < n; i++) if (mid[i] != null && sd[i] != null && mid[i] !== 0) bw.push(4 * sd[i] / mid[i]);
      const cur = bw[bw.length - 1];
      if (cur != null && bw.length >= 20) {
        const last20 = bw.slice(-20);
        const pct = last20.filter(x => x <= cur).length / last20.length * 100;
        const upper = mid[n - 1] + 2 * sd[n - 1], lower = mid[n - 1] - 2 * sd[n - 1];
        const percentB = upper === lower ? 50 : (live - lower) / (upper - lower) * 100;
        ext.bollinger = { squeeze: pct <= 20, bandwidthPct: +pct.toFixed(0), percentB: +percentB.toFixed(1) };
      }
    }
    // 7) MACD divergence
    ext.macdDiv = detectMacdDivergence(c1h);
    // 8) Mean reversion — EMA20 se doori (ATR units) + %B
    if (ema20 != null && atr1h) {
      const distATR = (live - ema20) / atr1h;
      const a = Math.abs(distATR);
      ext.meanRev = { distATR: +distATR.toFixed(2), percentB: ext.bollinger ? ext.bollinger.percentB : null, label: a <= 0.5 ? 'near' : a <= 1.5 ? 'extended' : 'overextended', side: distATR >= 0 ? 'above' : 'below' };
    }
    // 9) Asian range
    ext.asian = asianRange(c1h, live);
    // 10) VWAP bands (aaj ka UTC session)
    ext.vwapBands = vwapBands(c1h, live);
    // 11) Volume
    ext.volume = volumeInfo(c1h);
    // 12) DXY + correlation
    if (dxy) {
      if (typeof dxy.value === 'number') { ext.dxy.value = dxy.value; ext.dxy.available = true; }
      if (dxy.candles && dxy.candles.length) {
        const corr = correlation20(closes, c1h.map(c => c.t), dxy.candles.map(c => c.c), dxy.candles.map(c => c.t));
        if (corr != null) { ext.dxy.corr20 = +corr.toFixed(2); ext.dxy.available = true; }
      }
    }
  } catch (e) {
    // Koi aik item fail ho to baaki items phir bhi dikhte hain (partial ext wapas jata hai).
  }
  return ext;
}

// ---------------- Signal Engine: 6 gates / 100 points, BUY/SELL sirf 85%+ par ----------------
function gateScore(candles, ind, livePrice, side, opts) {
  // side: 'buy' ya 'sell'. Har gate 0..points.
  // Weights: wRsiRr re-weighting (2026-11-07, accuracy study out-of-sample winner):
  // Trend 15, Structure 15, RSI 25, R/R 20, Macro 10, Freshness 15 = 100, gate 85.
  // Candidate only — forward-validate on live signals; revert if live PF < 1.0.
  const gates = [];
  const price = livePrice || ind.lastPrice;
  const e20 = ind.ema20, e50 = ind.ema50, e200 = ind.ema200;
  // 1) Indicator Trend — 15
  let g1 = 0;
  if (side === 'buy') { if (e20 && e50 && price > e20 && e20 > e50) g1 = 15; else if (e50 && price > e50) g1 = 8; }
  else { if (e20 && e50 && price < e20 && e20 < e50) g1 = 15; else if (e50 && price < e50) g1 = 8; }
  gates.push({ name: side === 'buy' ? 'Indicator Trend (BUY)' : 'Indicator Trend (SELL)', points: g1, max: 15 });
  // 2) Structure Swing — 15
  const sw = findSwings(candles);
  let g2 = 0;
  if (side === 'buy') { if (sw.low != null && price > sw.low) g2 = 15; else if (sw.low != null) g2 = 4; }
  else { if (sw.high != null && price < sw.high) g2 = 15; else if (sw.high != null) g2 = 4; }
  gates.push({ name: 'Structure Swing', points: g2, max: 15 });
  // 3) RSI Recovery — 25
  let g3 = 0;
  const rsi = ind.rsi14;
  if (rsi != null) {
    if (side === 'buy') { if (rsi >= 50 && rsi <= 70) g3 = 25; else if (rsi >= 45 && rsi < 50) g3 = 13; }
    else { if (rsi >= 30 && rsi <= 50) g3 = 25; else if (rsi > 50 && rsi <= 55) g3 = 13; }
  }
  gates.push({ name: 'RSI Recovery', points: g3, max: 25 });
  // 4) R/R Geometry — 20
  let g4 = 0;
  if (sw.high != null && sw.low != null) {
    if (side === 'buy') { const rr = (sw.high - price) / Math.max(price - sw.low, 1e-9); if (rr >= 1.5) g4 = 20; else if (rr >= 1) g4 = 11; }
    else { const rr = (price - sw.low) / Math.max(sw.high - price, 1e-9); if (rr >= 1.5) g4 = 20; else if (rr >= 1) g4 = 11; }
  }
  gates.push({ name: 'R/R Geometry', points: g4, max: 20 });
  // 5) Macro EMA200 — 10
  let g5 = 0;
  if (side === 'buy') { if (e200 && price > e200 && e50 && e50 > e200) g5 = 10; else if (e200 && price > e200) g5 = 5; }
  else { if (e200 && price < e200 && e50 && e50 < e200) g5 = 10; else if (e200 && price < e200) g5 = 5; }
  gates.push({ name: 'Macro EMA200', points: g5, max: 10 });
  // 6) Data Freshness — 15
  // Backtest me freshness hamesha 15 hoti hai, bilkul live jaisi: live candle hamesha
  // fresh hoti hai, is liye live engine ko ye 15 points milte hain. Purane code me
  // backtest ki har bar par freshness 0 thi (Date.now() se umar napna) — is bug se
  // ghalat "88.2% win rate, PF 5.0" claim bana tha.
  let g6 = 0;
  if (opts && opts.backtest) { g6 = 15; }
  else {
    const lastT = candles.length ? candles[candles.length - 1].t : 0;
    const ageMin = (Date.now() - lastT) / 60000;
    if (ageMin <= 15) g6 = 15; else if (ageMin <= 45) g6 = 8;
  }
  gates.push({ name: 'Data Freshness', points: g6, max: 15 });
  const total = gates.reduce((s, g) => s + g.points, 0);
  return { gates, total };
}
function buildPlan(livePrice, atr, side) {
  const R = Math.max(atr || livePrice * 0.002, livePrice * 0.0005);
  if (side === 'buy') {
    const entry = livePrice;
    const sl = entry - 1.5 * R; // BUY ka SL HAMESHA entry se neeche
    return { direction: 'BUY', entry, entryZone: [entry - 0.5 * R, entry + 0.5 * R], trigger: entry, sl, tp1: entry + 1 * R, tp2: entry + 2 * R, tp3: entry + 3 * R, rr: '1:2' };
  }
  const entry = livePrice;
  const sl = entry + 1.5 * R; // SELL ka SL HAMESHA entry se upar
  return { direction: 'SELL', entry, entryZone: [entry - 0.5 * R, entry + 0.5 * R], trigger: entry, sl, tp1: entry - 1 * R, tp2: entry - 2 * R, tp3: entry - 3 * R, rr: '1:2' };
}
function planStatus(score, gate) {
  // Gate score se status: gate+ = gate paar, trade active (IN_ZONE);
  // gate-15 se gate-1 = gate ke kareeb (APPROACHING); is se kam = WAIT.
  // Sirf price se status nahi nikala ja sakta, kyunke entry zone live price
  // ke ird-gird banti hai — price hamesha zone ke andar hota hai.
  const g = gate || 85;
  if (score >= g) return 'IN_ZONE';
  if (score >= g - 15) return 'APPROACHING';
  return 'WAIT';
}
// Zone check: trade sirf tabhi jab us direction ke peeche koi proper zone ho
// (fresh order block, directional FVG, ya demand/supply zone jisme price ho ya qareeb ho).
// Ye gate (85%/80%) ya risk model nahi badalta — sirf final trade/no-trade faisla
// zone par rukta hai. Jo zone mile, wo trade zone ke tor par wapas milta hai.
function zoneSupportFor(smc, demandZone, supplyZone, live, atr, dir) {
  if (!smc) return { ok: false, zone: null };
  const near = (zone) => zone && Math.min(Math.abs(live - zone[0]), Math.abs(live - zone[1])) <= (atr || 0);
  const inside = (zone) => zone && live >= zone[0] && live <= zone[1];
  if (dir === 'BUY') {
    if (smc.bullOB && !smc.bullOB.mitigated) return { ok: true, zone: { type: 'Order Block', low: smc.bullOB.low, high: smc.bullOB.high } };
    const bf = (smc.fvgs || []).find(f => f.type === 'Bullish');
    if (bf) return { ok: true, zone: { type: 'FVG', low: bf.low, high: bf.high } };
    if (inside(demandZone) || near(demandZone)) return { ok: true, zone: { type: 'Demand Zone', low: demandZone[0], high: demandZone[1] } };
    return { ok: false, zone: null };
  }
  if (smc.bearOB && !smc.bearOB.mitigated) return { ok: true, zone: { type: 'Order Block', low: smc.bearOB.low, high: smc.bearOB.high } };
  const sf = (smc.fvgs || []).find(f => f.type === 'Bearish');
  if (sf) return { ok: true, zone: { type: 'FVG', low: sf.low, high: sf.high } };
  if (inside(supplyZone) || near(supplyZone)) return { ok: true, zone: { type: 'Supply Zone', low: supplyZone[0], high: supplyZone[1] } };
  return { ok: false, zone: null };
}
let signalCache = new Map(); // pair -> {at, data}
async function computeSignal(pairId, lang, force) {
  // v9.8: cache key me priceMode + gate bhi — setting badle to purana signal na mile.
  const priceMode = (db.settings && db.settings.priceMode) || 'last';
  const gate = Math.max(85, engineSettings().minQuality || 85);
  const cacheKey = pairId + '|' + (lang === 'en' ? 'en' : 'ur') + '|' + priceMode + '|' + gate;
  if (force) signalCache.delete(cacheKey);
  const cached = signalCache.get(cacheKey);
  if (cached && Date.now() - cached.at < 30000) return cached.data;
  const prices = await fetchAllPrices(force);
  const quote = prices.pairs.find(p => p.id === pairId);
  const candles = await getCandles(pairId, '15m');
  if (!candles.length || !quote || quote.price == null) {
    return { pair: pairId, error: 'no_data', message: 'Is pair ka live data nahi mila.' };
  }
  const ind = computeIndicators(candles);
  const live = priceByMode(quote, priceMode); // MT5 price mode — Bid/Ask/Mid/Last (Kraken bid/ask se; Yahoo fallback par sirf Last).
  const buy = gateScore(candles, ind, live, 'buy');
  const sell = gateScore(candles, ind, live, 'sell');
  // SMC facts (asal 15M + 5M candles se) — Terminal par single-direction signal ke saath checklist dikhane ke liye
  // 1H candles bhi ek saath (parallel) — v4 extended confluence ke liye
  const [candles5, candles1h] = await Promise.all([getCandles(pairId, '5m'), getCandles(pairId, '1H')]);
  const smc = computeSmc(candles, candles5);
  // v9.8: Terminal ke sab panels ke liye EIK source (1H) — RSI/EMA kahi bhi alag na dikhein.
  const ind1h = computeIndicators(candles1h);
  const swing1h = findSwings(candles1h);
  let direction = buy.total >= gate ? 'BUY' : sell.total >= gate ? 'SELL' : 'WAIT'; // Gate kabhi 85 se neeche nahi
  const confluence = Math.max(buy.total, sell.total);
  const buyPlan = buildPlan(live, ind.atr14, 'buy');
  const sellPlan = buildPlan(live, ind.atr14, 'sell');
  buyPlan.status = planStatus(buy.total, gate);
  sellPlan.status = planStatus(sell.total, gate);
  // Sentiment: aakhri 24 candles
  const recent = candles.slice(-24);
  const bulls = recent.filter(c => c.c >= c.o).length;
  const bullPct = recent.length ? Math.round(bulls / recent.length * 100) : 50;
  const sw = findSwings(candles);
  const atr = ind.atr14 || live * 0.002;
  const sentiment = {
    bullishPct: bullPct, bearishPct: 100 - bullPct,
    demandZone: sw.low != null ? [sw.low, sw.low + atr] : null,
    supplyZone: sw.high != null ? [sw.high - atr, sw.high] : null,
    label: bullPct >= 60 ? 'BULLISH' : bullPct <= 40 ? 'BEARISH' : 'NEUTRAL',
  };
  // Zone requirement: gate paar karne ke baad bhi trade sirf tabhi jab us direction
  // ke peeche koi proper zone ho. Zone na ho to direction WAIT ho jata hai —
  // signal record bhi nahi hota, banner/alert bhi WAIT dikhate hain.
  let direction2 = direction, tradeZone = null, zoneBlocked = false, blockedDirection = null, zoneNote = null;
  if (direction !== 'WAIT') {
    const zs = zoneSupportFor(smc, sentiment.demandZone, sentiment.supplyZone, live, ind.atr14, direction);
    if (zs.ok) tradeZone = zs.zone;
    else {
      zoneBlocked = true; blockedDirection = direction; direction2 = 'WAIT';
      zoneNote = lang === 'en'
        ? 'No zone behind ' + blockedDirection + ' — no fresh order block, no directional FVG, and price is not in or near the zone. Showing WAIT instead.'
        : blockedDirection + ' ke peeche koi proper zone nahi — na fresh order block, na directional FVG, price zone me ya qareeb nahi. Is liye WAIT dikhaya ja raha hai.';
    }
  }
  direction = direction2;
  const comments = [];
  const en = lang === 'en';
  if (zoneBlocked && zoneNote) comments.push(zoneNote);
  if (direction === 'WAIT' && !zoneBlocked) comments.push(en ? 'WAIT — no trade. The ' + gate + '% gate is not met (' + confluence + '%).' : 'WAIT — koi trade nahi. ' + gate + '% gate poora nahi hua (' + confluence + '%).');
  if (buy.total >= sell.total) comments.push(en ? 'BUY side confluence is ' + buy.total + '%.' : 'BUY taraf ' + buy.total + '% confluence hai.');
  else comments.push(en ? 'SELL side confluence is ' + sell.total + '%.' : 'SELL taraf ' + sell.total + '% confluence hai.');
  if (ind.rsi14 != null) comments.push('RSI 14: ' + ind.rsi14.toFixed(1) + (ind.rsi14 > 70 ? ' (Overbought)' : ind.rsi14 < 30 ? ' (Oversold)' : ''));
  if (ind.ema200 && live > ind.ema200) comments.push(en ? 'Price is above EMA 200 — the big trend is up.' : 'Price EMA 200 ke upar hai — bara trend upar.');
  else if (ind.ema200) comments.push(en ? 'Price is below EMA 200 — the big trend is down.' : 'Price EMA 200 ke neeche hai — bara trend neeche.');
  const pdh = Math.max(...candles.slice(-96).map(c => c.h));
  const pdl = Math.min(...candles.slice(-96).map(c => c.l));
  // Signal code + validity: pair + aaj ki tareekh (YYMMDD) + aaj ka sequence number.
  // Sequence = aaj is pair/direction ke record kiye gaye signals + 1 (asal ginti, banayi nahi).
  // Validity = agle 1H candle ka close (signal 1H par banta hai) — UTC ghante ke hisaab se.
  const nowD = new Date();
  const dayStr = String(nowD.getUTCFullYear()).slice(2) + String(nowD.getUTCMonth() + 1).padStart(2, '0') + String(nowD.getUTCDate()).padStart(2, '0');
  const utcDayStart = Date.UTC(nowD.getUTCFullYear(), nowD.getUTCMonth(), nowD.getUTCDate());
  const seqToday = db.signals.filter(s => s.pair === pairId && s.direction === direction && s.createdAt >= utcDayStart).length + 1;
  const signalCode = direction === 'WAIT' ? null : 'FTP-' + pairId + '-' + dayStr + '-' + seqToday;
  const validUntil = Math.floor(Date.now() / 3600000) * 3600000 + 3600000;
  // v4 extended confluence — sirf display; direction/gates ko nahi chhoota.
  let extended = null;
  try {
    const dxy = await fetchDxy();
    const closes1h = candles1h.map(c => c.c);
    extended = computeExtended(candles1h, live, lastVal(emaArr(closes1h, 20)), lastVal(emaArr(closes1h, 50)), lastVal(atrArr(candles1h, 14)), dxy);
  } catch (e) { extended = null; }
  const data = {
    pair: pairId, price: live, bid: quote.bid, ask: quote.ask, spread: quote.spread, priceMode,
    direction, confluence, threshold: gate,
    buyGates: buy.gates, sellGates: sell.gates,
    buyScore: buy.total, sellScore: sell.total,
    buyPlan, sellPlan,
    tradeZone, zoneBlocked, blockedDirection, zoneNote,
    // SMC confluence (asal data — checklist ke liye; signal logic nahi badalti)
    smc: smc.error ? null : {
      score: smc.score, gate: 80, parts: smc.parts,
      sweep: smc.sweep, sweepFound: smc.sweepFound, sweepCode: smc.sweepCode,
      bos: smc.bos, mss: smc.mss, bosDir: smc.bosDir,
      bullOB: smc.bullOB, bearOB: smc.bearOB, fvgs: smc.fvgs, sslSweeps: smc.sslSweeps,
      swingHigh: smc.swingHigh, swingLow: smc.swingLow,
      demandZone: sentiment.demandZone, supplyZone: sentiment.supplyZone,
    },
    // v4 extended confluence (display only)
    extended,
    sentiment, range: { pdh, pdl },
    rsi14: ind.rsi14, atr14: ind.atr14, ema20: ind.ema20, ema50: ind.ema50, ema200: ind.ema200,
    ind1h: { rsi14: ind1h.rsi14, ema20: ind1h.ema20, ema50: ind1h.ema50, ema200: ind1h.ema200, atr14: ind1h.atr14 },
    swing1h,
    comments, nextCheckInSec: 30, updatedAt: Date.now(),
    signalCode, validUntil,
  };
  signalCache.set(cacheKey, { at: Date.now(), data });
  // Record BUY/SELL signal (WAIT kabhi record nahi hota) — gate breakdown bhi save karein
  // taake History me har signal ki details (audit) dikh sake.
  if (direction !== 'WAIT') {
    const plan = direction === 'BUY' ? buyPlan : sellPlan;
    const res = recordTerminalSignal(pairId, direction, plan, confluence, direction === 'BUY' ? buy.gates : sell.gates, smc.error ? null : smc.score, signalCode);
    if (res.recorded) { sendSignalAlert(res.signal); sendPushAlert(res.signal); } // naya signal — Telegram + Browser push (fire-and-forget)
    else if (res.signal && res.signal.signalCode) { data.signalCode = res.signal.signalCode; } // display = recorded code
  }
  return data;
}

// Terminal signal record karna — user visit aur background recorder DONO isi ek raaste se.
// Dedupe key: pair + direction + engine 'terminal' + 1H candle ka UTC ghanta (candleHour).
// Isi ghante me dobara record nahi hota — user visit aur recorder ek hi record banate hain.
// WAIT kabhi record nahi hota. Gates/weights ko nahi chhoota — sirf record karne ka waqt badalta hai.
function recordTerminalSignal(pairId, direction, plan, score, gates, smcScore, signalCode) {
  if (direction === 'WAIT') return { recorded: false, signal: null };
  const candleHour = Math.floor(Date.now() / 3600000) * 3600000;
  const existing = db.signals.find(s => s.pair === pairId && s.direction === direction && s.engine === 'terminal' && s.candleHour === candleHour);
  if (existing) return { recorded: false, signal: existing };
  const rec = { id: 'SIG-' + Date.now().toString(36).toUpperCase(), pair: pairId, direction, entry: plan.entry, sl: plan.sl, tp1: plan.tp1, tp2: plan.tp2, tp3: plan.tp3, score, gate: 85, engine: 'terminal', createdAt: Date.now(), candleHour, outcome: null, outcomeAt: null, gates, smcScore, signalCode, telegramSent: false, pushSent: false };
  db.signals.unshift(rec);
  if (db.signals.length > 500) db.signals.length = 500;
  logEvent(direction + ' signal: ' + pairId + ' @ ' + plan.entry.toFixed(2) + ' (' + score + '%)');
  saveDb();
  return { recorded: true, signal: rec };
}

// ---------------- SMC (asal 15M candles se) ----------------
function computeSmc(candles15, candles5) {
  if (!candles15.length) return { error: 'no_data' };
  const sw = findSwings(candles15);
  const last = candles15[candles15.length - 1];
  // Liquidity sweeps: aakhri 15 candles me swing ke neeche/upar wick phir wapas
  let sweep = false, sweepSide = null, sweepCode = null;
  for (let i = Math.max(0, candles15.length - 15); i < candles15.length; i++) {
    const c = candles15[i];
    if (sw.low != null && c.l < sw.low && c.c > sw.low) { sweep = true; sweepSide = 'SSL (neeche sweep)'; sweepCode = 'SSL'; }
    if (sw.high != null && c.h > sw.high && c.c < sw.high) { sweep = true; sweepSide = 'BSL (upar sweep)'; sweepCode = 'BSL'; }
  }
  // BOS / MSS: aakhri swing toota ya nahi
  let bos = false, mss = false, bosDir = null;
  const prevSw = findSwings(candles15.slice(0, -5));
  if (prevSw.high != null && last.c > prevSw.high) { bos = true; mss = true; bosDir = 'up'; }
  if (prevSw.low != null && last.c < prevSw.low) { bos = true; mss = true; bosDir = 'down'; }
  // Order blocks: strong move se pehle ki aakhri opposite candle (kisi bhi candle set par).
  function findOBIn(cs, dir) {
    const lc = cs[cs.length - 1];
    for (let i = cs.length - 3; i >= Math.max(0, cs.length - 40); i--) {
      const c = cs[i], nxt = cs[i + 1], nxt2 = cs[i + 2];
      if (dir === 'bullish' && c.c < c.o && nxt.c > nxt.o && nxt2 && nxt2.c > nxt2.o) return { low: Math.min(c.l, nxt.l), high: Math.max(c.h, nxt.h), mitigated: lc.c < c.l };
      if (dir === 'bearish' && c.c > c.o && nxt.c < nxt.o && nxt2 && nxt2.c < nxt2.o) return { low: Math.min(c.l, nxt.l), high: Math.max(c.h, nxt.h), mitigated: lc.c > c.h };
    }
    return null;
  }
  const bullOB = findOBIn(candles15, 'bullish'), bearOB = findOBIn(candles15, 'bearish');
  // FVG: candle i-1 high < candle i+1 low (bullish gap) ya ulta (kisi bhi candle set par).
  function findFVGsIn(cs) {
    const out = [];
    for (let i = cs.length - 1; i >= Math.max(1, cs.length - 30); i--) {
      const a = cs[i - 1], b = cs[i + 1];
      if (!a || !b) continue;
      if (a.h < b.l) out.push({ type: 'Bullish', low: a.h, high: b.l });
      if (a.l > b.h) out.push({ type: 'Bearish', low: b.h, high: a.l });
      if (out.length >= 4) break;
    }
    return out;
  }
  const fvgs = findFVGsIn(candles15);
  // 5M micro: sweeps ki asal list (SSL + BSL) — aakhri 40 5M candles se.
  let sslSweeps = 0; const microSweeps = [];
  if (candles5 && candles5.length) {
    const sw5 = findSwings(candles5);
    for (const c of candles5.slice(-40)) {
      if (sw5.low != null && c.l < sw5.low && c.c > sw5.low) { sslSweeps++; microSweeps.push({ side: 'SSL', price: c.l, time: c.t }); }
      if (sw5.high != null && c.h > sw5.high && c.c < sw5.high) microSweeps.push({ side: 'BSL', price: c.h, time: c.t });
    }
  }
  const microOB = { bull: candles5 && candles5.length ? findOBIn(candles5, 'bullish') : null, bear: candles5 && candles5.length ? findOBIn(candles5, 'bearish') : null };
  const microFVGs = candles5 && candles5.length ? findFVGsIn(candles5) : [];
  // Liquidity pools: aakhri 60 15M candles ke asal swing levels (na ke fixed number).
  const ex = localExtrema(candles15, Math.max(2, candles15.length - 60));
  const poolsList = [
    ...ex.highs.map(i => ({ type: 'Resistance', price: candles15[i].h, time: candles15[i].t })),
    ...ex.lows.map(i => ({ type: 'Support', price: candles15[i].l, time: candles15[i].t })),
  ].sort((a, b) => b.time - a.time).slice(0, 10);
  // Score: 5 hisse x 20
  const parts = [];
  parts.push({ name: 'Liquidity Sweep', score: sweep ? 20 : 8, max: 20 });
  parts.push({ name: 'Market Structure', score: mss ? 20 : bos ? 12 : 6, max: 20 });
  parts.push({ name: 'Order Block', score: (bullOB && !bullOB.mitigated) || (bearOB && !bearOB.mitigated) ? 20 : (bullOB || bearOB) ? 10 : 4, max: 20 });
  parts.push({ name: 'FVG', score: fvgs.length >= 2 ? 20 : fvgs.length === 1 ? 12 : 5, max: 20 });
  const atr = lastVal(atrArr(candles15, 14)) || 0;
  const rrOk = atr && sw.high != null && sw.low != null && Math.abs(last.c - sw.low) > 0 && ((sw.high - last.c) / Math.max(last.c - sw.low, 1e-9) >= 1.2 || (last.c - sw.low) / Math.max(sw.high - last.c, 1e-9) >= 1.2);
  parts.push({ name: 'Risk & Reward', score: rrOk ? 20 : 9, max: 20 });
  const score = parts.reduce((s, p) => s + p.score, 0);
  return {
    score, gate: 80, parts,
    swingHigh: sw.high, swingLow: sw.low,
    sweep: sweep ? sweepSide : 'Aakhri candles me koi sweep nahi hua.',
    sweepFound: sweep, sweepCode,
    bos, mss, bosDir, bullOB, bearOB, fvgs, sslSweeps,
    pools: poolsList.length, poolsList, microSweeps: microSweeps.slice(-5).reverse(), microOB, microFVGs,
    updatedAt: Date.now(),
  };
}
let scannerCache = { at: 0, data: null };
async function computeScanner() {
  if (scannerCache.data && Date.now() - scannerCache.at < 45000) return scannerCache.data;
  // Scanner site ke 15 pairs par chalta hai (EURJPY/NAS100 site pairs nahi — hata diye).
  const uniq = PAIRS.map(p => p.id);
  const prices = await fetchAllPrices();
  const rows = [];
  for (const id of uniq) {
    let candles = [], price = null;
    candles = await getCandles(id, '15m');
    const q = prices.pairs.find(p => p.id === id);
    price = q ? q.price : null;
    let score = null, dir = 'WAIT', smc = null;
    if (candles.length) {
      smc = computeSmc(candles, []);
      score = smc.score;
      dir = score >= 80 ? (candles[candles.length - 1].c >= candles[candles.length - 1].o ? 'BUY' : 'SELL') : 'WAIT';
    }
    // v9.5: per-pair SMC tasdeeq cards ke liye — computeSmc se pehle se nikle hue fields
    // (bias, OB, FVG) bhi row me bhejte hain. Koi naya engine nahi, sirf display data.
    // A+ (80%+) rows ke liye asal Entry/SL/TP — SMC ke 15M candles se (koi signal nahi, sirf setup card).
    let plan = null;
    if (score != null && score >= 80 && candles.length) {
      const ind = computeIndicators(candles);
      plan = buildPlan(price != null ? price : candles[candles.length - 1].c, ind.atr14, dir);
    }
    rows.push({ pair: id, price, smcScore: score, direction: dir, plan,
      bosDir: smc ? smc.bosDir : null, sweepCode: smc ? smc.sweepCode : null,
      bullOB: smc ? smc.bullOB : null, bearOB: smc ? smc.bearOB : null,
      fvgs: smc ? smc.fvgs : [] });
  }
  const data = { rows, cycleSec: 45, updatedAt: Date.now(), confirmedSignals: db.signals.filter(s => s.engine === 'smc').length };
  scannerCache = { at: Date.now(), data };
  return data;
}
// Dollar Index (DXY) — Yahoo DX-Y.NYB, 60s cache. Na mile to available:false (koi number banaya nahi jata).
let dxyCache = { at: 0, data: null };
async function fetchDxy() {
  if (dxyCache.data && Date.now() - dxyCache.at < 60000) return dxyCache.data;
  const [value, candles] = await Promise.all([
    fetchYahooPrice('DX-Y.NYB'),
    yahooCandles('DX-Y.NYB', '1h', '3mo'),
  ]);
  const data = { value, candles: candles || [] };
  dxyCache = { at: Date.now(), data };
  return data;
}
async function fetchYahooPrice(sym) {
  const d = await tryFetch('https://query1.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(sym) + '?interval=1m&range=1d', 5000);
  const m = d && d.chart && d.chart.result && d.chart.result[0] && d.chart.result[0].meta;
  return m && typeof m.regularMarketPrice === 'number' ? m.regularMarketPrice : null;
}

// ---------------- History outcomes (baad ki candles se) ----------------
async function checkOutcome(sig) {
  if (sig.outcome) return sig;
  const candles = await getCandles(sig.pair, '15m');
  if (!candles.length) return sig;
  const after = candles.filter(c => c.t > sig.createdAt);
  if (!after.length) return sig;
  let outcome = null;
  for (const c of after) {
    if (sig.direction === 'BUY') {
      if (c.l <= sig.sl) { outcome = 'Loss'; break; }
      if (c.h >= sig.tp1) {
        // TP1 ke baad entry par wapas aaya to Break-Even
        let be = false;
        for (const c2 of after.slice(after.indexOf(c) + 1)) {
          if (c2.l <= sig.entry) { be = true; break; }
          if (c2.h >= sig.tp2) break;
        }
        outcome = be ? 'Break-Even' : 'Win'; break;
      }
    } else {
      if (c.h >= sig.sl) { outcome = 'Loss'; break; }
      if (c.l <= sig.tp1) {
        let be = false;
        for (const c2 of after.slice(after.indexOf(c) + 1)) {
          if (c2.h >= sig.entry) { be = true; break; }
          if (c2.l <= sig.tp2) break;
        }
        outcome = be ? 'Break-Even' : 'Win'; break;
      }
    }
  }
  if (outcome) { sig.outcome = outcome; sig.outcomeAt = Date.now(); saveDb(); }
  return sig;
}
async function enrichHistory(signals) {
  const out = [];
  for (const s of signals) out.push(await checkOutcome({ ...s }));
  // db me outcome wapas likhein
  for (const s of out) {
    const row = db.signals.find(x => x.id === s.id);
    if (row && s.outcome && !row.outcome) { row.outcome = s.outcome; row.outcomeAt = s.outcomeAt; }
  }
  saveDb();
  return out.map(s => ({ ...s, status: s.outcome || 'In-Flight' }));
}

// ---------------- Sessions ----------------
const SESSIONS = [
  { id: 'sydney', name: 'Sydney', startUTC: 21, endUTC: 6 },
  { id: 'tokyo', name: 'Tokyo / Asian', startUTC: 0, endUTC: 9 },
  { id: 'london', name: 'London / European', startUTC: 7, endUTC: 16 },
  { id: 'newyork', name: 'New York', startUTC: 12, endUTC: 21 },
];
function sessionInfo(now = new Date()) {
  const utcH = now.getUTCHours() + now.getUTCMinutes() / 60;
  const inWindow = (s) => s.startUTC <= s.endUTC ? (utcH >= s.startUTC && utcH < s.endUTC) : (utcH >= s.startUTC || utcH < s.endUTC);
  const active = SESSIONS.find(inWindow) || SESSIONS[1];
  // Agla session
  let next = null, nextInMin = Infinity;
  for (const s of SESSIONS) {
    let start = s.startUTC;
    let diff = (start - utcH + 24) % 24;
    if (diff === 0) diff = 24;
    if (diff < nextInMin) { nextInMin = diff; next = s; }
  }
  const pkt = (h) => { const p = (h + 5) % 24; const hh = Math.floor(p); const mm = Math.round((p - hh) * 60); return String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0'); };
  return {
    active: { ...active, startPKT: pkt(active.startUTC), endPKT: pkt(active.endUTC) },
    next: { ...next, inMin: Math.round(nextInMin * 60) },
    nowPKT: pkt(utcH),
    all: SESSIONS.map(s => ({ ...s, startPKT: pkt(s.startUTC), endPKT: pkt(s.endUTC), isActive: s.id === active.id })),
    newsBlackout: { available: false, note: 'News blackout nahi lag sakta — koi free news source nahi hai. Is liye is ko jhoota nahi dikhaya gaya.' },
  };
}
function sessionQuality(ind, candles) {
  // 8 weights, kul 100: EMA trend 20, RSI 15, MACD 15, ADX 15, VWAP 10, ATR 10, Structure 15
  const closes = candles.map(c => c.c);
  const last = closes[closes.length - 1];
  let score = 0;
  const details = [];
  if (ind.ema20 && ind.ema50) { const v = last > ind.ema20 && ind.ema20 > ind.ema50 ? 20 : last > ind.ema50 ? 10 : 0; score += v; details.push({ name: 'EMA Trend', points: v, max: 20 }); }
  if (ind.rsi14 != null) { const v = ind.rsi14 >= 45 && ind.rsi14 <= 65 ? 15 : ind.rsi14 >= 35 && ind.rsi14 <= 75 ? 8 : 0; score += v; details.push({ name: 'RSI', points: v, max: 15 }); }
  if (ind.macdHist != null) { const v = ind.macdHist > 0 ? 15 : ind.macdHist > -1 ? 7 : 0; score += v; details.push({ name: 'MACD', points: v, max: 15 }); }
  if (ind.adx14 != null) { const v = ind.adx14 >= 25 ? 15 : ind.adx14 >= 18 ? 8 : 0; score += v; details.push({ name: 'ADX', points: v, max: 15 }); }
  if (ind.vwap != null) { const v = last > ind.vwap ? 10 : 4; score += v; details.push({ name: 'VWAP', points: v, max: 10 }); }
  if (ind.atr14 != null) { const v = ind.atr14 > 0 ? 10 : 0; score += v; details.push({ name: 'ATR / Volatility', points: v, max: 10 }); }
  const sw = findSwings(candles);
  const v = sw.high != null && sw.low != null && last > sw.low && last < sw.high ? 15 : 7; score += v;
  details.push({ name: 'Structure', points: v, max: 15 });
  return { score, details };
}

// ---------------- v9.8: Engine settings + price mode + notification groups ----------------
// Purane db.json me ye fields na hon to defaults se merge hota hai (koi crash nahi).
const ENGINE_DEFAULTS = { minQuality: 85, slBufferPct: 0.3, tp1R: 1, tp2R: 2, tp3R: 3, maxConcurrent: 3, sessions: { sydney: true, tokyo: true, london: true, newyork: true } };
function engineSettings() {
  const s = (db.settings && db.settings.engine) || {};
  return { ...ENGINE_DEFAULTS, ...s, sessions: { ...ENGINE_DEFAULTS.sessions, ...(s.sessions || {}) } };
}
// MT5 price mode — Kraken ticker se bid/ask aate hain; Yahoo fallback par sirf last hota hai.
function priceByMode(q, mode) {
  if (!q) return null;
  if (mode === 'bid' && q.bid != null) return q.bid;
  if (mode === 'ask' && q.ask != null) return q.ask;
  if (mode === 'mid' && q.bid != null && q.ask != null) return (q.bid + q.ask) / 2;
  return q.price;
}
// Notification groups (Hub presets + /api/alerts/feed filter) — sirf site ke 15 pairs.
const GROUP_PAIRS = {
  metals: ['XAUUSD', 'XAGUSD'],
  majors: ['EURUSD', 'GBPUSD', 'USDJPY', 'USDCHF', 'USDCAD', 'AUDUSD'],
  crypto: ['BTCUSD', 'ETHUSD', 'SOLUSD', 'BNBUSD', 'XRPUSD', 'DOGEUSD', 'ADAUSD'],
};

// ---------------- Telegram alerts + background recorder (v9) ----------------
// Bot token SIRF env var TELEGRAM_BOT_TOKEN se aata hai — kabhi file ya code me nahi likha jata.
// Token na ho to Telegram ka kaam chup-chaap skip hota hai, baaki sab (recorder, website) chalta rehta hai.
// Bot: @tradingforexprobot (getMe se verified: id 8435329849, "Forex trading pro alerts").
// Alerts un buyers ko jate hain jinka plan Active hai, aur admin ko bhi — koi bhi Start dabane wala nahi.
// Har buyer ka apna personal link hota hai: https://t.me/tradingforexprobot?start=<tgCode>
// (Account tab aur Terminal card me dikhta hai). /start ka code buyer se jor kar uska
// Telegram chat id save hota hai. Plan khatam ya suspend hone par alerts ruk jate hain,
// chat id save rehta hai taake renew par alerts khud wapas shuru ho jayein.
const TG_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TG_DRY_RUN = process.env.TELEGRAM_DRY_RUN === '1';
const TG_API = 'https://api.telegram.org';
const TG_BOT_LINK = 'https://t.me/tradingforexprobot';
const telegramDryRunSent = []; // sirf dry-run test ke liye — yahan kabhi asal message nahi jata

// ---------------- Web Push (v9.7) ----------------
// VAPID keys SIRF env vars (VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY) se — kabhi code ya file me nahi.
// Dono na hon to push chup-chaap band rehta hai, baaki sab chalta rehta hai (Telegram wala pattern).
// Public key client ko /api/push/vapid-public-key se milti hai; private key sirf server par rehti hai.
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || '';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '';
const PUSH_DRY_RUN = process.env.PUSH_DRY_RUN === '1';
const pushDryRunSent = []; // sirf dry-run test ke liye — yahan kabhi asal push nahi jata
let webpush = null;
try {
  if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
    webpush = require('web-push');
    webpush.setVapidDetails('mailto:shizabhatti15@gmail.com', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  }
} catch (e) { console.error('Web Push setup fail: ' + e.message); webpush = null; }

// Per-pair pasand (Telegram + Push dono par lagti hai): user ne jo pairs ON kiye hon, sirf un ke alerts.
// notifyPairs kabhi set nahi hua (null/undefined) = sab pairs; khaali list [] = koi alert nahi.
function notifyPairOn(u, pair) {
  if (!u || !Array.isArray(u.notifyPairs)) return true;
  return u.notifyPairs.includes(pair);
}

// Har user (buyer + admin) ka personal Telegram code — na ho to bana kar save karein (purane accounts ke liye bhi).
function ensureTgCode(u) {
  if (!u) return u;
  if (!u.tgCode) { u.tgCode = crypto.randomBytes(8).toString('hex'); saveDb(); }
  return u;
}
// Buyer Active hai? Plan khatam ya suspend nahi.
function buyerActive(u) {
  return !!(u && u.role === 'buyer' && !u.suspended && (!u.expiresAt || u.expiresAt > Date.now()));
}
function tgDeepLink(u) { return TG_BOT_LINK + '?start=' + (u && u.tgCode ? u.tgCode : ''); }

function fmtTgPrice(v) {
  if (v == null || !isFinite(v)) return '—';
  return v >= 100 ? Number(v).toFixed(2) : Number(v).toFixed(4);
}
function fmtTgTime(ms) {
  try { return new Date(ms).toLocaleTimeString('en-GB', { timeZone: 'Asia/Karachi', hour: '2-digit', minute: '2-digit', hour12: true }) + ' PKT'; }
  catch (e) { return new Date(ms).toLocaleTimeString(); }
}
function buildTelegramMessage(sig) {
  const validUntil = sig.createdAt ? Math.floor(sig.createdAt / 3600000) * 3600000 + 3600000 : Date.now() + 3600000;
  return [
    '🔔 Forex Trading Pro — NAYA SIGNAL',
    'Pair: ' + sig.pair,
    'Direction: ' + sig.direction,
    'Entry: ' + fmtTgPrice(sig.entry),
    'SL: ' + fmtTgPrice(sig.sl),
    'TP1: ' + fmtTgPrice(sig.tp1) + ' | TP2: ' + fmtTgPrice(sig.tp2) + ' | TP3: ' + fmtTgPrice(sig.tp3),
    'Score: ' + sig.score + '/100',
    'Code: ' + (sig.signalCode || sig.id || '—'),
    'Valid until: ' + fmtTgTime(validUntil),
    'Koi signal 100% profitable nahi hota.',
  ].join('\n');
}
async function sendTelegramMessage(chatId, text) {
  if (TG_DRY_RUN) { telegramDryRunSent.push({ chatId, text }); console.log('[Telegram dry-run] to ' + chatId + ': ' + String(text).split('\n')[0]); return { ok: true, dryRun: true }; }
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 25000);
  try {
    const r = await fetch(TG_API + '/bot' + TG_TOKEN + '/sendMessage', { method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': 'ForexTradingPro/1.0' }, body: JSON.stringify({ chat_id: chatId, text }), signal: ctrl.signal });
    const data = await r.json().catch(() => ({}));
    if (!r.ok || !data.ok) throw new Error('Telegram HTTP ' + r.status + ' ' + (data.description || ''));
    return data;
  } finally { clearTimeout(t); }
}
// Naye signal par alert — Active buyers + admin ko, ek signal code par sirf ek dafa, WAIT par kabhi nahi.
// Per-pair pasand: jis pair ki notification user ne OFF ki ho, us pair ka alert us ko nahi jata.
// Pehle claim karein (telegramSent=true), phir bhejein — taake dobara kabhi na jaye. Kabhi throw nahi karta.
async function sendSignalAlert(sig) {
  try {
    if (!TG_TOKEN || !sig) return;
    if (sig.telegramSent) return;
    const targets = db.users.filter(u => u.tgChatId != null && (buyerActive(u) || (u.role === 'admin' && !u.suspended)));
    if (!targets.length) return;
    sig.telegramSent = true; saveDb();
    const text = buildTelegramMessage(sig);
    for (const u of targets) {
      if (!notifyPairOn(u, sig.pair)) continue; // is pair ki notification user ne OFF ki hai
      try { await sendTelegramMessage(u.tgChatId, text); }
      catch (e) { console.error('Telegram alert fail (' + u.username + '): ' + e.message); }
    }
  } catch (e) { console.error('Telegram alert fail: ' + e.message); }
}
// Web Push payload — sirf signal ki asal values (Entry/SL/TP1/Score), koi banaya hua number nahi.
function buildPushPayload(sig) {
  return {
    title: '🔔 Forex Trading Pro — ' + sig.pair + ' ' + sig.direction + (sig.score != null ? ' ' + sig.score + '%' : ''),
    body: 'Entry ' + fmtTgPrice(sig.entry) + ' · SL ' + fmtTgPrice(sig.sl) + ' · TP1 ' + fmtTgPrice(sig.tp1) + (sig.score != null ? ' · Score ' + sig.score + '/100' : ''),
    url: '/',
 code: sig.signalCode || sig.id || null,
  };
}
// Browser notifications — sendSignalAlert jaisa, sirf Web Push ke liye.
// Claim-first (pushSent), ek signal par ek dafa, WAIT kabhi nahi (record path se hi aata hai).
// 404/410 aaye to wo subscription khatam kar dein (expired device), baaki ko na rokein. Kabhi throw nahi karta.
async function sendPushAlert(sig) {
  try {
    if (!sig || sig.pushSent) return;
    if (!webpush && !PUSH_DRY_RUN) return; // VAPID keys nahi — push band, baaki sab chalta hai
    const targets = db.users.filter(u => Array.isArray(u.pushSubscriptions) && u.pushSubscriptions.length && (buyerActive(u) || (u.role === 'admin' && !u.suspended)) && notifyPairOn(u, sig.pair));
    if (!targets.length) return;
    sig.pushSent = true; saveDb();
    const payload = JSON.stringify(buildPushPayload(sig));
    for (const u of targets) {
      for (const sub of (u.pushSubscriptions || [])) {
        try {
          if (PUSH_DRY_RUN) { pushDryRunSent.push({ username: u.username, endpoint: sub.endpoint, payload }); continue; }
          await webpush.sendNotification(sub, payload);
        } catch (e) {
          if (e && (e.statusCode === 404 || e.statusCode === 410)) {
            u.pushSubscriptions = (u.pushSubscriptions || []).filter(s => s.endpoint !== sub.endpoint);
            saveDb();
            console.log('Push subscription khatam ho gaya, hata diya (' + u.username + ')');
          } else {
            console.error('Push fail (' + u.username + '): ' + (e && e.message ? e.message : e));
          }
        }
      }
    }
  } catch (e) { console.error('Push alert fail: ' + e.message); }
}
// getUpdates ka jawab parse karein — ORDER barkarar (update_id ke hisaab se).
// Har event: {type:'start', code, chatId} | {type:'plainStart', chatId} | {type:'stop', chatId}
function parseTelegramUpdates(data) {
  const events = [];
  let nextOffset = null;
  const updates = (data && data.result) || [];
  for (const up of updates) {
    if (typeof up.update_id === 'number') nextOffset = Math.max(nextOffset || 0, up.update_id + 1);
    const msg = up.message || up.edited_message;
    if (!msg || typeof msg.text !== 'string') continue;
    const chatId = msg.chat && msg.chat.id;
    if (chatId == null) continue;
    const text = msg.text.trim();
    if (text === '/stop' || text.startsWith('/stop ')) { events.push({ type: 'stop', chatId }); continue; }
    const m = text.match(/^\/start(?:@[\w]+)?(?:\s+(.+))?$/);
    if (m) {
      const code = (m[1] || '').trim().split(/\s+/)[0] || '';
      if (code) events.push({ type: 'start', code, chatId });
      else events.push({ type: 'plainStart', chatId });
    }
  }
  return { events, nextOffset };
}
// Parsed events lagayein: code se buyer jorein, /stop par unlink, plain /start par hidayat bhejein.
async function applyTelegramUpdates(parsed) {
  for (const ev of parsed.events || []) {
    try {
      if (ev.type === 'stop') {
        const u = db.users.find(x => x.tgChatId === ev.chatId);
        if (u) { u.tgChatId = null; saveDb(); }
      } else if (ev.type === 'start') {
        const u = db.users.find(x => x.tgCode === ev.code);
        if (u) {
          const prev = db.users.find(x => x !== u && x.tgChatId === ev.chatId);
          if (prev) prev.tgChatId = null; // ek chat id sirf ek buyer se jurta hai
          const alreadyLinked = u.tgChatId === ev.chatId;
          u.tgChatId = ev.chatId; saveDb();
          if (!alreadyLinked) await sendTelegramMessage(ev.chatId, '✅ Forex Trading Pro alerts ON hain! BUY/SELL signal aate hi aap ko yahan message mile ga. Alerts band karne ke liye /stop likhein.');
        } else {
          await sendTelegramMessage(ev.chatId, 'Ye link ghalat hai ya khatam ho gaya hai — apne Forex Trading Pro account se apna personal Telegram link lein (Account tab me milta hai).');
        }
      } else if (ev.type === 'plainStart') {
        // Agar ye chat pehle se kisi account se linked hai to dobara yaad-dihani mat bhejo (restart par purana /start dobara parha jata hai).
        const linked = db.users.find(x => x.tgChatId === ev.chatId);
        if (!linked) await sendTelegramMessage(ev.chatId, 'Signal alerts lene ke liye apne Forex Trading Pro account se apna personal Telegram link kholein aur Start dabayein. Link Account tab me milta hai.');
      }
    } catch (e) { console.error('Telegram update apply fail: ' + e.message); }
  }
}
async function telegramPollUpdates() {
  if (!TG_TOKEN) { console.log('Telegram poll skip: TELEGRAM_BOT_TOKEN nahi mila.'); return; }
  try {
    const url = TG_API + '/bot' + TG_TOKEN + '/getUpdates?timeout=0' + (db.telegramOffset ? '&offset=' + db.telegramOffset : '');
    const data = await fetchJson(url, 25000);
    if (!data || !data.ok) { console.error('Telegram poll fail: Telegram se sahi jawab nahi mila (ok:false).'); return; }
    const fetched = (data.result || []).length;
    const parsed = parseTelegramUpdates(data);
    if (parsed.nextOffset) { db.telegramOffset = parsed.nextOffset; saveDb(); }
    await applyTelegramUpdates(parsed);
    console.log('Telegram poll ok: ' + fetched + ' update(s) mile, ' + (parsed.events || []).length + ' event(s) process kiye.');
  } catch (e) { console.error('Telegram poll fail: ' + e.message); }
}

// ---------------- Weekend market-closed (v9.3) ----------------
// Forex aur Gold (metal) ki market Hafta/Ittwaar ko band rehti hai; crypto 24/7 khula rehta hai.
// Band market me weekend Kraken PAXG data se signal banana ghalat hota — is liye
// recorder skip karta hai aur /api/signal WAIT + marketClosed deta hai.
// PKT (Asia/Karachi, UTC+5, no DST) ke hisaab se Hafta 00:00 se Ittwaar 23:59 tak band.
const PKT_OFFSET_MS = 5 * 3600 * 1000;
function isMarketClosed(pairId, date) {
  const p = PAIRS.find(x => x.id === (pairId || '').toUpperCase());
  if (!p || p.type === 'crypto') return false;
  const d = date ? new Date(date) : new Date();
  const pktDay = new Date(d.getTime() + PKT_OFFSET_MS).getUTCDay(); // 0 = Sunday, 6 = Saturday
  return pktDay === 0 || pktDay === 6;
}

// ---------------- Background recorder (v9) ----------------
// Server jab jaag raha ho, har 15 minute me main pairs ka Terminal signal khud
// compute karke record karein — chahe koi user site khole ya na khole. Signal ka
// hisaab bilkul wahi hai jo user visit par hota hai (computeSignal); sirf waqt
// badalta hai, signal nahi. WAIT kabhi record nahi hota.
// Background recorder (v9.6.4): tamam 15 pairs — Telegram alert site band ho tab bhi aaye.
// (Pehle sirf 4 pairs the; baaki 11 ka signal sirf user visit par banta tha.)
const RECORDER_PAIRS = PAIRS.map(p => p.id);
let recorderRunning = false;
async function recorderTick(computeFn) {
  if (recorderRunning) return { skipped: true };
  recorderRunning = true;
  try {
    if (!db.settings.engines.terminal) return { skipped: true, reason: 'terminal_off' };
    const fn = computeFn || computeSignal;
    const results = [];
    for (const pair of RECORDER_PAIRS) {
      // Weekend: forex/Gold band hai — koi naya signal record nahi hota (BTC chalta rehta hai).
      if (isMarketClosed(pair)) { results.push({ pair, closed: true }); continue; }
      try { const d = await fn(pair, 'ur', true); results.push({ pair, direction: d.direction || d.error || null }); }
      catch (e) { console.error('Recorder fail (' + pair + '): ' + e.message); results.push({ pair, error: e.message }); }
    }
    return { results };
  } finally { recorderRunning = false; }
}
let lastRecorderAt = 0, tickRunning = false, tickStartedAt = 0, tickId = 0;
// Ek tick kitni der me "phansa hua" mana jaye — is se zyada chalne par agla tick intezaar nahi karta.
// (Sirf test ke liye env se badla ja sakta hai; production default 120s.)
const TICK_STALE_MS = Math.max(10000, parseInt(process.env.TICK_STALE_MS || '120000', 10) || 120000);
async function backgroundTick() {
  if (tickRunning) {
    // Phansa hua tick (kabhi khatam na hone wala await) baad wale ticks ko hamesha ke liye rok na de —
    // TICK_STALE_MS se zyada chalne par use stale maan kar naya tick chala dein.
    if (Date.now() - tickStartedAt <= TICK_STALE_MS) return;
    console.error('Background tick stale: pichla tick ' + Math.round((Date.now() - tickStartedAt) / 1000) + 's se phansa hua tha — naya tick chala rahe hain.');
  }
  const myId = ++tickId;
  tickRunning = true;
  tickStartedAt = Date.now();
  try {
    await telegramPollUpdates();
    if (Date.now() - lastRecorderAt >= 15 * 60 * 1000) { lastRecorderAt = Date.now(); await recorderTick(); }
  } catch (e) { console.error('Background tick fail: ' + e.message); }
  finally { if (myId === tickId) tickRunning = false; } // hamesha reset — ek tick ke fail/hang hone par agle ticks chalte rahein
}

// ---------------- API routes ----------------
app.get('/api/health', (req, res) => res.json({ ok: true, name: 'Forex Trading Pro', time: new Date().toISOString(), pairs: PAIRS.length }));

// Public prices (login screen ke market cards ke liye) — NO auth, sirf 5 pairs, 3s cache.
app.get('/api/public-prices', async (req, res) => {
  try {
    const data = await fetchAllPrices();
    const want = ['XAUUSD', 'BTCUSD', 'EURUSD', 'GBPUSD', 'USDJPY'];
    res.json({
      pairs: data.pairs.filter(p => want.includes(p.id)).map(p => ({ id: p.id, label: p.label, price: p.price, change24h: p.change24h, live: p.live, dec: p.dec })),
      updatedAt: data.updatedAt,
    });
  } catch (e) { res.status(500).json({ error: 'price_fail', message: 'Price nahi mil saki.' }); }
});

// Fear & Greed Index (Bitcoin, alternative.me free API) — 5 min cache.
// API na mile to available:false (koi number banaya nahi jata).
let fngCache = { at: 0, data: null };
app.get('/api/feargreed', requireAuth, async (req, res) => {
  if (fngCache.data && Date.now() - fngCache.at < 300000) return res.json(fngCache.data);
  const d = await tryFetch('https://api.alternative.me/fng/?limit=1', 5000);
  const item = d && Array.isArray(d.data) && d.data[0];
  const data = item && item.value != null
    ? { available: true, value: parseInt(item.value, 10), classification: item.value_classification || '', updatedAt: Date.now(), source: 'alternative.me' }
    : { available: false, value: null, classification: '', updatedAt: Date.now(), source: 'alternative.me' };
  fngCache = { at: Date.now(), data };
  res.json(data);
});

// Auth state + setup + login
app.get('/api/auth/state', (req, res) => {
  const hasAdmin = db.users.some(u => u.role === 'admin');
  res.json({ needsSetup: !hasAdmin });
});
app.post('/api/auth/setup', (req, res) => {
  if (db.users.some(u => u.role === 'admin')) return res.status(400).json({ error: 'setup_done', message: 'Admin pehle se bana hua hai.' });
  const { username, password } = req.body || {};
  if (!username || username.length < 3) return res.status(400).json({ error: 'bad_username', message: 'Username kam se kam 3 harf ka ho.' });
  if (!password || password.length < 6) return res.status(400).json({ error: 'bad_password', message: 'Password kam se kam 6 harf ka ho.' });
  const salt = crypto.randomBytes(16).toString('hex');
  const adminUser = { username, passHash: hashPassword(password, salt), salt, role: 'admin', plan: 'Lifetime', createdAt: Date.now(), expiresAt: null, suspended: false, tgCode: crypto.randomBytes(8).toString('hex'), tgChatId: null };
  db.users.push(adminUser);
  const token = makeToken();
  db.sessions.push({ token, username, createdAt: Date.now() });
  logEvent('Admin account banaya gaya: ' + username);
  saveDb();
  res.json({ token, user: { username, role: 'admin', tgCode: adminUser.tgCode } });
});
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body || {};
  const u = findUser(username);
  if (!u || hashPassword(password || '', u.salt) !== u.passHash) return res.status(401).json({ error: 'wrong_login', message: 'Username ya password ghalat hai.' });
  if (u.suspended) return res.status(403).json({ error: 'suspended', message: 'Account band hai. Admin se rabta karein.' });
  if (u.role === 'buyer' && u.expiresAt && Date.now() > u.expiresAt) return res.status(403).json({ error: 'expired', message: 'Plan khatam ho gaya hai. Admin se renew karwayein.' });
  const token = makeToken();
  db.sessions.push({ token, username, createdAt: Date.now() });
  ensureTgCode(u);
  saveDb();
  res.json({ token, user: { username: u.username, role: u.role, plan: u.plan, expiresAt: u.expiresAt, tgCode: u.tgCode || null, tgLinked: !!u.tgChatId } });
});
app.post('/api/auth/logout', (req, res) => {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  db.sessions = db.sessions.filter(s => s.token !== token);
  saveDb();
  res.json({ ok: true });
});
app.get('/api/auth/me', requireAuth, (req, res) => {
  ensureTgCode(req.user);
  res.json({ user: { username: req.user.username, role: req.user.role, plan: req.user.plan, expiresAt: req.user.expiresAt, tgCode: req.user.tgCode || null, tgLinked: !!req.user.tgChatId } });
});

// Prices
app.get('/api/prices', requireAuth, async (req, res) => {
  try {
    const data = await fetchAllPrices(req.query.fresh === '1');
    // Per-source freshness: har source aakhri dafa kab kamyab hua (response ke waqt hisaab)
    const sources = data.sources.map(s => ({ ...s, ageSec: sourceFresh[s.name] ? Math.floor((Date.now() - sourceFresh[s.name]) / 1000) : null }));
    res.json({ ...data, sources });
  }
  catch (e) { res.status(500).json({ error: 'price_fail', message: 'Price nahi mil saki: ' + e.message }); }
});

// Terminal signal
app.get('/api/signal', requireAuth, async (req, res) => {
  if (!db.settings.engines.terminal) return res.json({ disabled: true, message: 'Terminal engine band hai (Admin ne band kiya hai).' });
  const pair = (req.query.pair || db.settings.defaultPair || 'XAUUSD').toUpperCase();
  // Weekend: forex/Gold market band hai — weekend PAXG data se kabhi BUY/SELL nahi banta.
  // Sirf aakhri available price ke saath WAIT + marketClosed wapas jata hai (kuch record nahi hota).
  if (isMarketClosed(pair)) {
    try {
      const prices = await fetchAllPrices();
      const quote = prices.pairs.find(p => p.id === pair);
      const price = quote && quote.price != null ? quote.price : null;
      return res.json({
        pair, price, bid: quote ? quote.bid : null, ask: quote ? quote.ask : null, spread: quote ? quote.spread : null,
        direction: 'WAIT', confluence: 0, threshold: 85,
        buyGates: [], sellGates: [], buyScore: 0, sellScore: 0,
        buyPlan: null, sellPlan: null,
        tradeZone: null, zoneBlocked: false, blockedDirection: null, zoneNote: null,
        smc: null, extended: null, sentiment: null,
        range: { pdh: null, pdl: null },
        rsi14: null, atr14: null, ema20: null, ema50: null, ema200: null,
        comments: [], nextCheckInSec: 30, updatedAt: Date.now(),
        signalCode: null, validUntil: null, marketClosed: true,
      });
    } catch (e) {
      return res.json({
        pair, price: null, bid: null, ask: null, spread: null,
        direction: 'WAIT', confluence: 0, threshold: 85,
        buyGates: [], sellGates: [], buyScore: 0, sellScore: 0,
        buyPlan: null, sellPlan: null,
        tradeZone: null, zoneBlocked: false, blockedDirection: null, zoneNote: null,
        smc: null, extended: null, sentiment: null,
        range: { pdh: null, pdl: null },
        rsi14: null, atr14: null, ema20: null, ema50: null, ema200: null,
        comments: [], nextCheckInSec: 30, updatedAt: Date.now(),
        signalCode: null, validUntil: null, marketClosed: true,
      });
    }
  }
  try { res.json(await computeSignal(pair, req.query.lang, req.query.fresh === '1')); }
  catch (e) { res.status(500).json({ error: 'signal_fail', message: e.message }); }
});

// Indicators Center
app.get('/api/indicators', requireAuth, async (req, res) => {
  const pair = (req.query.pair || 'XAUUSD').toUpperCase();
  const out = {};
  let candles1h = [];
  for (const tf of ['1m', '5m', '15m', '30m', '1H', '4H', '1D']) {
    const candles = await getCandles(pair, tf);
    if (tf === '1H') candles1h = candles;
    out[tf] = candles.length ? computeIndicators(candles) : { error: 'no_data' };
  }
  // Scorecard /100: 5 hisse x 20 (Trend, Momentum, Volatility, Strength, Structure)
  const ind = out['1H'] && !out['1H'].error ? out['1H'] : out['15m'];
  let score = 0; const parts = [];
  if (ind && !ind.error) {
    const trend = (ind.ema20 && ind.ema50 && ind.lastPrice > ind.ema20 && ind.ema20 > ind.ema50) ? 20 : (ind.ema20 && ind.lastPrice > ind.ema20 ? 10 : 4);
    const mom = (ind.rsi14 != null && ind.rsi14 >= 45 && ind.rsi14 <= 65) ? 20 : (ind.rsi14 != null && ind.rsi14 >= 35 && ind.rsi14 <= 75) ? 10 : 4;
    const vol = ind.atr14 ? 15 : 5;
    const str = (ind.macdHist != null && ind.macdHist > 0) ? 20 : 8;
    const struct = (ind.support != null && ind.resistance != null && ind.lastPrice > ind.support) ? 20 : 8;
    score = trend + mom + vol + str + struct;
    parts.push({ name: 'Trend', score: trend, max: 20 }, { name: 'Momentum', score: mom, max: 20 }, { name: 'Volatility', score: vol, max: 20 }, { name: 'Strength', score: str, max: 20 }, { name: 'Structure', score: struct, max: 20 });
  }
  // Pivot points: pichle poore UTC din se (asal 1H candles)
  const pivots = dailyPivots(candles1h, (PAIRS.find(p => p.id === pair) || {}).dec);
  // Gold zones (v9.6.3): sirf XAUUSD, asal 1H candles se — display only.
  // Trend Panel (v9.6.4): 15m/30m/1H/4H/1D EMA trend — display only.
  res.json({ pair, timeframes: out, scorecard: { score, parts, note: 'Score asal Kraken candles se banta hai.' }, pivots, zones: pair === 'XAUUSD' ? computeZones(candles1h) : null, panel: computeTrendPanel(out) });
});

// Candles (Terminal chart ke liye — asal Kraken/Yahoo candles)
app.get('/api/candles', requireAuth, async (req, res) => {
  const pair = (req.query.pair || 'XAUUSD').toUpperCase();
  const tf = req.query.tf || '15m';
  const candles = await getCandles(pair, tf);
  res.json({ pair, tf, candles: candles.slice(-200) });
});

// SMC
app.get('/api/smc', requireAuth, async (req, res) => {
  if (!db.settings.engines.smc) return res.json({ disabled: true, message: 'SMC engine band hai.' });
  const pair = (req.query.pair || 'XAUUSD').toUpperCase();
  const c15 = await getCandles(pair, '15m');
  const c5 = await getCandles(pair, '5m');
  if (!c15.length) return res.json({ error: 'no_data', message: 'Candles nahi milin.' });
  const smc = computeSmc(c15, c5);
  // SMC signal record (score 80%+ par)
  if (smc.score >= 80) {
    const dir = c15[c15.length - 1].c >= c15[c15.length - 1].o ? 'BUY' : 'SELL';
    const recentSame = db.signals.find(s => s.pair === pair && s.direction === dir && s.engine === 'smc' && Date.now() - s.createdAt < 3600000);
    if (!recentSame) {
      const prices = await fetchAllPrices();
      const q = prices.pairs.find(p => p.id === pair);
      const live = q ? q.price : c15[c15.length - 1].c;
      const ind = computeIndicators(c15);
      const plan = buildPlan(live, ind.atr14, dir === 'SELL' ? 'sell' : 'buy');
      db.signals.unshift({ id: 'SIG-' + Date.now().toString(36).toUpperCase(), pair, direction: dir, entry: plan.entry, sl: plan.sl, tp1: plan.tp1, tp2: plan.tp2, tp3: plan.tp3, score: smc.score, gate: 80, engine: 'smc', createdAt: Date.now(), outcome: null, outcomeAt: null, gates: smc.parts.map(p => ({ name: p.name, points: p.score, max: p.max })) });
      if (db.signals.length > 500) db.signals.length = 500;
      logEvent('SMC signal: ' + pair + ' ' + dir + ' (' + smc.score + '%)');
      saveDb();
    }
  }
  res.json({ pair, ...smc });
});
app.get('/api/scanner', requireAuth, async (req, res) => {
  try { res.json(await computeScanner()); }
  catch (e) { res.status(500).json({ error: 'scanner_fail', message: e.message }); }
});

// Sessions
let sessionCache = { at: 0, data: null };
app.get('/api/sessions', requireAuth, async (req, res) => {
  if (!db.settings.engines.session) return res.json({ disabled: true, message: 'Session engine band hai.' });
  if (sessionCache.data && Date.now() - sessionCache.at < 30000) return res.json(sessionCache.data);
  const info = sessionInfo();
  info.all = info.all.map(s => ({ ...s, enabled: engineSettings().sessions[s.id] !== false }));
  const pairs = ['EURUSD', 'GBPUSD', 'USDJPY', 'XAUUSD', 'BTCUSD', 'AUDUSD'];
  const prices = await fetchAllPrices();
  // Tamam pairs ek saath (parallel) — pehle ek ek karke 6 pairs ke candles mangwaye jate the,
  // is liye endpoint 6-30+ second leta tha aur tab khaali dikhta tha. Ab har pair alag hai:
  // ek slow pair baakiyon ko nahi rokta.
  const rows = (await Promise.all(pairs.map(async (id) => {
    try {
      const candles = await getCandles(id, '1H');
      if (!candles.length) return null;
      const ind = computeIndicators(candles);
      const q = sessionQuality(ind, candles);
      const live = (prices.pairs.find(p => p.id === id) || {}).price || candles[candles.length - 1].c;
      const dir = q.score >= 85 ? (ind.ema20 && live > ind.ema20 ? 'BUY' : 'SELL') : 'WAIT';
      const plan = buildPlan(live, ind.atr14, dir === 'SELL' ? 'sell' : 'buy');
      if (dir !== 'WAIT') {
        const recentSame = db.signals.find(s => s.pair === id && s.direction === dir && s.engine === 'session' && Date.now() - s.createdAt < 3600000);
        if (!recentSame) {
          db.signals.unshift({ id: 'SIG-' + Date.now().toString(36).toUpperCase(), pair: id, direction: dir, entry: plan.entry, sl: plan.sl, tp1: plan.tp1, tp2: plan.tp2, tp3: plan.tp3, score: q.score, gate: 85, engine: 'session', createdAt: Date.now(), outcome: null, outcomeAt: null, gates: q.details });
          if (db.signals.length > 500) db.signals.length = 500;
          saveDb();
        }
      }
      return { pair: id, price: live, quality: q.score, qualityDetails: q.details, direction: dir, rsi: ind.rsi14, adx: ind.adx14, entry: plan.entry, sl: plan.sl, tp1: plan.tp1, tp2: plan.tp2, tp3: plan.tp3 };
    } catch (e) { return null; }
  }))).filter(Boolean);
  const sessionSignals = db.signals.filter(s => s.engine === 'session');
  const data = { ...info, pairs: rows, stats: { total: sessionSignals.length, buy: sessionSignals.filter(s => s.direction === 'BUY').length, sell: sessionSignals.filter(s => s.direction === 'SELL').length, wait: 0, note: 'WAIT signals kabhi record nahi hote, is liye WAIT ki ginti hamesha 0 hoti hai.' } };
  sessionCache = { at: Date.now(), data };
  res.json(data);
});
// ---------------- v9.8: Backtest runner (Backtest Center + Session simulator) ----------------
// Asal candles par engine rule + TP rule + risk sizing. Data span hamesha bataya jata hai —
// Yahoo/Kraken ki had (1H ~90 din, 15M ~5-7 din) se zyada period mango to sirf available data use hota hai.
function walkExit(dir, entry, sl, tp1, tp2, tp3, forward) {
  const ev = { slFirst: false, tp1: false, tp2: false, tp3: false, slAfter: false, exitIdx: forward.length };
  let tp1Hit = false;
  for (let k = 0; k < forward.length; k++) {
    const c = forward[k];
    const slHit = dir === 'BUY' ? c.l <= sl : c.h >= sl;
    const tp1H = dir === 'BUY' ? c.h >= tp1 : c.l <= tp1;
    const tp2H = dir === 'BUY' ? c.h >= tp2 : c.l <= tp2;
    const tp3H = dir === 'BUY' ? c.h >= tp3 : c.l <= tp3;
    if (!tp1Hit) {
      if (slHit) { ev.slFirst = true; ev.exitIdx = k; return ev; }
      if (tp1H) {
        ev.tp1 = true; tp1Hit = true;
        // Aik hi candle TP1 se TP3 tak chali jaye to wo bhi isi candle me ginein
        if (tp3H) { ev.tp2 = true; ev.tp3 = true; ev.exitIdx = k; return ev; }
        if (tp2H) ev.tp2 = true;
      }
      continue;
    }
    if (slHit) { ev.slAfter = true; ev.exitIdx = k; return ev; }
    if (tp3H) { ev.tp2 = true; ev.tp3 = true; ev.exitIdx = k; return ev; }
    if (tp2H) ev.tp2 = true;
  }
  return ev;
}
function rForRule(rule, ev, t1, t2, t3) {
  if (ev.slFirst) return { r: -1, exit: 'SL', open: false };
  if (!ev.tp1) return { r: 0, exit: 'OPEN', open: true };
  if (rule === 'quick') return { r: t1, exit: 'TP1', open: false };
  if (rule === 'standard') {
    if (ev.tp2 || ev.tp3) return { r: 0.5 * t1 + 0.5 * t2, exit: 'TP2', open: false };
    if (ev.slAfter) return { r: 0.5 * t1 - 0.5, exit: 'SL_AFTER_TP1', open: false };
    return { r: 0, exit: 'OPEN', open: true };
  }
  if (ev.tp3) return { r: t3, exit: 'TP3', open: false };
  if (ev.slAfter) return { r: 0, exit: 'BE', open: false };
  return { r: 0, exit: 'OPEN', open: true };
}
function hourInSession(h, s) {
  return s.startUTC <= s.endUTC ? (h >= s.startUTC && h < s.endUTC) : (h >= s.startUTC || h < s.endUTC);
}
async function runBacktest({ engine, pairs, days, balance, riskPct, tp, session }) {
  const es = engineSettings();
  const gate = Math.max(85, es.minQuality || 85);
  const riskUsd = balance * riskPct / 100;
  const maxConc = Math.max(1, Math.min(5, es.maxConcurrent || 3));
  const trades = [];
  let candlesUsed = 0, from = null, to = null;
  for (const id of pairs) {
    const tf = engine === 'smc' ? '15m' : '1H';
    const candles = await getCandles(id, tf);
    if (!candles.length) continue;
    const perDay = tf === '15m' ? 96 : 24;
    const need = Math.min(candles.length, days * perDay);
    const slice = candles.slice(-need);
    candlesUsed += slice.length;
    if (!from || slice[0].t < from) from = slice[0].t;
    if (!to || slice[slice.length - 1].t > to) to = slice[slice.length - 1].t;
    const fwdBars = tf === '15m' ? 96 : 48;
    const step = engine === 'smc' ? 4 : 2;
    const startI = engine === 'smc' ? 60 : (engine === 'session' ? 50 : 220);
    const openExits = []; // khule trades ke exit bar (max concurrent ke liye)
    for (let i = startI; i < slice.length - 5; i += step) {
      const window = engine === 'terminal' ? slice.slice(Math.max(0, i - 220), i + 1) : engine === 'smc' ? slice.slice(Math.max(0, i - 60), i + 1) : slice.slice(0, i + 1);
      const lastC = window[window.length - 1];
      let dir = null, atr = null;
      const entry = lastC.c;
      if (engine === 'terminal') {
        const ind = computeIndicators(window);
        const buy = gateScore(window, ind, entry, 'buy', { backtest: true });
        const sell = gateScore(window, ind, entry, 'sell', { backtest: true });
        dir = buy.total >= gate ? 'BUY' : sell.total >= gate ? 'SELL' : null;
        if (!dir) continue;
        atr = ind.atr14 || entry * 0.002;
      } else if (engine === 'smc') {
        const smc = computeSmc(window, []);
        if (!smc || smc.error || smc.score < 80) continue;
        dir = lastC.c >= lastC.o ? 'BUY' : 'SELL';
        atr = lastVal(atrArr(window, 14)) || entry * 0.002;
      } else { // session
        const ind = computeIndicators(window);
        const q = sessionQuality(ind, window);
        if (q.score < 85) continue;
        const hourUTC = new Date(lastC.t).getUTCHours();
        if (session && session !== 'all') {
          const ssn = SESSIONS.find(x => x.id === session);
          if (!ssn || !hourInSession(hourUTC, ssn)) continue;
        } else {
          const enabled = SESSIONS.filter(x => es.sessions[x.id] !== false);
          if (enabled.length && !enabled.some(x => hourInSession(hourUTC, x))) continue;
        }
        dir = ind.ema20 && entry > ind.ema20 ? 'BUY' : 'SELL';
        atr = ind.atr14 || entry * 0.001;
      }
      while (openExits.length && openExits[0] <= i) openExits.shift();
      if (openExits.length >= maxConc) continue;
      const plan = buildPlan(entry, atr, dir);
      const forward = slice.slice(i + 1, Math.min(slice.length, i + 1 + fwdBars));
      const ev = walkExit(dir, entry, plan.sl, plan.tp1, plan.tp2, plan.tp3, forward);
      const R = Math.abs(entry - plan.sl) || 1;
      const out = rForRule(tp, ev, Math.abs(plan.tp1 - entry) / R, Math.abs(plan.tp2 - entry) / R, Math.abs(plan.tp3 - entry) / R);
      const exitAt = forward.length ? forward[Math.min(ev.exitIdx, forward.length - 1)].t : lastC.t;
      trades.push({ pair: id, direction: dir, entry, sl: plan.sl, tp1: plan.tp1, tp2: plan.tp2, tp3: plan.tp3, time: lastC.t, exitAt, r: +out.r.toFixed(2), usd: +(out.r * riskUsd).toFixed(2), exit: out.exit, open: out.open });
      openExits.push(i + 1 + ev.exitIdx);
      openExits.sort((a, b) => a - b);
    }
  }
  const closed = trades.filter(x => !x.open);
  const wins = closed.filter(x => x.r > 0), losses = closed.filter(x => x.r < 0), be = closed.filter(x => x.r === 0);
  const grossWin = wins.reduce((x, y) => x + y.r, 0), grossLoss = losses.reduce((x, y) => x + Math.abs(y.r), 0);
  const netR = closed.reduce((x, y) => x + y.r, 0);
  let eq = balance, peak = balance, maxDd = 0;
  const equity = [{ t: from, v: balance }];
  for (const x of [...closed].sort((a, b) => a.exitAt - b.exitAt)) {
    eq += x.usd;
    if (eq > peak) peak = eq;
    if (peak - eq > maxDd) maxDd = peak - eq;
    equity.push({ t: x.exitAt, v: +eq.toFixed(2) });
  }
  const spanDays = from && to ? Math.max(1, Math.round((to - from) / 86400000)) : 0;
  const eqStep = Math.max(1, Math.floor(equity.length / 100));
  return {
    engine, pairs, days, spanDays, candlesUsed, from, to, balance, riskPct, tp, session: session || 'all',
    trades: closed.length, wins: wins.length, losses: losses.length, breakEven: be.length, open: trades.length - closed.length,
    winRate: closed.length ? +(wins.length / closed.length * 100).toFixed(1) : 0,
    profitFactor: grossLoss ? +(grossWin / grossLoss).toFixed(2) : (wins.length ? 99 : 0),
    netR: +netR.toFixed(2), netUsd: +(netR * riskUsd).toFixed(2), maxDrawdownUsd: +maxDd.toFixed(2),
    equity: equity.filter((_, i) => i % eqStep === 0 || i === equity.length - 1),
    tradesList: [...closed].sort((a, b) => b.time - a.time).slice(0, 50),
    note: 'Backtest asal ' + (engine === 'smc' ? '15M' : '1H') + ' candles par chala hai. Available data: ' + spanDays + ' din (' + candlesUsed + ' candles). Zyada period mango to bhi sirf available data use hota hai — koi number banaya nahi gaya.',
  };
}
app.get('/api/backtest', requireAuth, async (req, res) => {
  const engine = (req.query.engine || 'terminal').toLowerCase();
  if (!['terminal', 'smc', 'session'].includes(engine)) return res.status(400).json({ error: 'bad_engine', message: 'Engine terminal, smc ya session hona chahiye.' });
  const pair = (req.query.pair || 'XAUUSD').toUpperCase();
  const days = Math.max(1, Math.min(parseInt(req.query.days || '30', 10) || 30, 365));
  const balance = Math.max(100, Math.min(parseFloat(req.query.balance || '1000') || 1000, 10000));
  const riskPct = Math.max(0.1, Math.min(parseFloat(req.query.risk || '1') || 1, 3));
  const tp = ['quick', 'standard', 'trail'].includes((req.query.tp || '').toLowerCase()) ? req.query.tp.toLowerCase() : 'standard';
  const session = (req.query.session || 'all').toLowerCase();
  const pairs = engine === 'session' && !req.query.pair ? ['EURUSD', 'GBPUSD'] : [pair];
  try { res.json(await runBacktest({ engine, pairs, days, balance, riskPct, tp, session })); }
  catch (e) { res.status(500).json({ error: 'backtest_fail', message: e.message }); }
});
app.get('/api/session/backtest', requireAuth, async (req, res) => {
  const days = Math.min(parseInt(req.query.days || '30', 10) || 30, 90);
  const session = (req.query.session || 'all').toLowerCase();
  const balance = Math.max(100, Math.min(parseFloat(req.query.balance || '1000') || 1000, 10000));
  const riskPct = Math.max(0.1, Math.min(parseFloat(req.query.risk || '1') || 1, 3));
  const tp = ['quick', 'standard', 'trail'].includes((req.query.tp || '').toLowerCase()) ? req.query.tp.toLowerCase() : 'standard';
  const out = await runBacktest({ engine: 'session', pairs: ['EURUSD', 'GBPUSD'], days, balance, riskPct, tp, session });
  res.json({ ...out, note: 'Ye backtest asal 1H candles par chala hai — koi banaya hua number nahi. ' + out.note });
});
app.get('/api/smc/backtest', requireAuth, async (req, res) => {
  const days = Math.min(parseInt(req.query.days || '30', 10) || 30, 30);
  const pair = (req.query.pair || 'XAUUSD').toUpperCase();
  const balance = Math.max(100, Math.min(parseFloat(req.query.balance || '1000') || 1000, 10000));
  const riskPct = Math.max(0.1, Math.min(parseFloat(req.query.risk || '1') || 1, 3));
  const tp = ['quick', 'standard', 'trail'].includes((req.query.tp || '').toLowerCase()) ? req.query.tp.toLowerCase() : 'standard';
  const out = await runBacktest({ engine: 'smc', pairs: [pair], days, balance, riskPct, tp, session: 'all' });
  res.json({ ...out, note: 'Ye backtest asal 15M candles par SMC rule (score 80%+) se chala hai — koi banaya hua number nahi. ' + out.note });
});

// History + performance + refiner
app.get('/api/history', requireAuth, async (req, res) => {
  let list = [...db.signals];
  const { outcome, engine, symbol } = req.query;
  if (engine) list = list.filter(s => s.engine === engine);
  if (symbol) list = list.filter(s => s.pair === symbol.toUpperCase());
  list = await enrichHistory(list.slice(0, 100));
  if (outcome) list = list.filter(s => (s.outcome || 'In-Flight') === outcome);
  res.json({ signals: list, total: list.length, note: 'Sirf asal record kiye gaye signals dikhaye jate hain — koi purani history banayi nahi gayi.' });
});
app.get('/api/performance', requireAuth, async (req, res) => {
  const list = await enrichHistory([...db.signals]);
  const closed = list.filter(s => s.outcome && s.outcome !== 'In-Flight');
  const wins = list.filter(s => s.outcome === 'Win').length;
  const losses = list.filter(s => s.outcome === 'Loss').length;
  const be = list.filter(s => s.outcome === 'Break-Even').length;
  const inflight = list.filter(s => !s.outcome).length;
  res.json({
    total: list.length, wins, losses, breakEven: be, inFlight: inflight,
    winRate: closed.length ? +(wins / closed.length * 100).toFixed(1) : null,
    note: 'Win rate sirf record kiye gaye signals se banta hai. Abhi tak koi signal record nahi hua to win rate khaali dikhega — ye sach hai, banaya hua number nahi.',
  });
});
// ---------------- v9.8: Notifications Hub feed — SIRF asal record kiye gaye alerts ----------------
// Har recorded signal par Telegram/Push alert bheja jata hai (sendSignalAlert/sendPushAlert) —
// feed wahi signals dikhata hai, kabhi banaya hua alert nahi. telegramSent/pushSent = claim flags.
app.get('/api/alerts/feed', requireAuth, async (req, res) => {
  const engine = (req.query.engine || 'all').toLowerCase();
  const group = (req.query.group || 'all').toLowerCase();
  let list = [...db.signals].sort((a, b) => b.createdAt - a.createdAt);
  if (engine !== 'all') list = list.filter(x => x.engine === engine);
  if (group !== 'all' && GROUP_PAIRS[group]) list = list.filter(x => GROUP_PAIRS[group].includes(x.pair));
  const total = list.length;
  const out = await enrichHistory(list.slice(0, 50));
  res.json({
    total,
    alerts: out.map(x => ({ id: x.id, pair: x.pair, direction: x.direction, engine: x.engine, score: x.score, createdAt: x.createdAt, signalCode: x.signalCode, outcome: x.outcome || 'In-Flight', telegramSent: !!x.telegramSent, pushSent: !!x.pushSent })),
    note: 'Ye feed sirf asal record kiye gaye signals dikhati hai — koi alert banaya nahi gaya. Har recorded signal par Telegram + Web Push alert bheja jata hai (jo pair aapne OFF kiya hai, uska alert nahi jata).',
  });
});
app.get('/api/refiner', requireAuth, async (req, res) => {
  const cutoff = parseInt(req.query.cutoff || '85', 10) || 85;
  // v9.3: engine filter — UI hamesha engine=terminal bhejta hai (Terminal-only).
  // Param na ho to purana all-engine hisaab (backward compatible).
  const engine = (req.query.engine || '').toLowerCase();
  const tpSel = ['quick', 'standard', 'trail'].includes((req.query.tp || '').toLowerCase()) ? req.query.tp.toLowerCase() : 'standard';
  let eligible = db.signals.filter(x => typeof x.score === 'number');
  if (engine) eligible = eligible.filter(x => x.engine === engine);
  const list = await enrichHistory(eligible.filter(x => x.score >= cutoff));
  // Profit-target rules — har qualifying signal ke liye 15M candles par asal exit check.
  const byPair = {};
  const mk = () => ({ trades: 0, wins: 0, losses: 0, breakEven: 0, open: 0, netR: 0, grossWin: 0, grossLoss: 0 });
  const rules = { quick: mk(), standard: mk(), trail: mk() };
  for (const sg of list) {
    if (!byPair[sg.pair]) byPair[sg.pair] = await getCandles(sg.pair, '15m');
    const R = Math.abs(sg.entry - sg.sl) || 0;
    if (!R) continue;
    const ev = walkExit(sg.direction, sg.entry, sg.sl, sg.tp1, sg.tp2, sg.tp3, byPair[sg.pair].filter(c => c.t > sg.createdAt));
    for (const rule of ['quick', 'standard', 'trail']) {
      const out = rForRule(rule, ev, Math.abs(sg.tp1 - sg.entry) / R, Math.abs(sg.tp2 - sg.entry) / R, Math.abs(sg.tp3 - sg.entry) / R);
      const st = rules[rule];
      if (out.open) { st.open++; continue; }
      st.trades++;
      if (out.r > 0) { st.wins++; st.grossWin += out.r; }
      else if (out.r < 0) { st.losses++; st.grossLoss += Math.abs(out.r); }
      else st.breakEven++;
      st.netR += out.r;
    }
  }
  const fin = (st) => ({ trades: st.trades, wins: st.wins, losses: st.losses, breakEven: st.breakEven, open: st.open, netR: +st.netR.toFixed(2), winRate: st.trades ? +(st.wins / st.trades * 100).toFixed(1) : null, profitFactor: st.grossLoss ? +(st.grossWin / st.grossLoss).toFixed(2) : (st.wins ? 99 : 0) });
  const rulesOut = { quick: fin(rules.quick), standard: fin(rules.standard), trail: fin(rules.trail) };
  res.json({
    cutoff, engine: engine || null, qualifying: list.length, tp: tpSel,
    winRate: rulesOut[tpSel].winRate,
    rules: rulesOut,
    signals: list.slice(0, 50),
    note: db.buildNote + ' Purane signals (jinke score nahi hain) is me nahi aate. Rules asal 15M candles se check kiye gaye hain — Quick = 100% TP1 par band, Standard = 50% TP1 + 50% TP2, Trail = TP3 tak, TP1 ke baad SL breakeven par.',
  });
});

// ---------------- Fundamental News (free RSS feeds, key-less) ----------------
function parseRss(xml, sourceName) {
  const clean = (s) => (s || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/<[^>]+>/g, '').trim();
  const tag = (block, name) => { const mm = block.match(new RegExp('<' + name + '[^>]*>([\\s\\S]*?)</' + name + '>')); return mm ? clean(mm[1]) : ''; };
  const items = [];
  const re = /<item>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = re.exec(xml)) && items.length < 15) {
    const b = m[1];
    const title = tag(b, 'title');
    const link = tag(b, 'link');
    const pub = tag(b, 'pubDate');
    const time = pub ? Date.parse(pub) : NaN;
    if (title) items.push({ title, link, source: sourceName, time: isFinite(time) ? time : Date.now() });
  }
  return items;
}
let newsCache = { at: 0, data: null };
app.get('/api/news', requireAuth, async (req, res) => {
  if (newsCache.data && Date.now() - newsCache.at < 300000) return res.json(newsCache.data);
  const feeds = [
    { name: 'FXStreet', url: 'https://www.fxstreet.com/rss/news' },
    { name: 'ForexLive', url: 'https://www.forexlive.com/feed/' },
  ];
  const results = await Promise.all(feeds.map(async (f) => {
    try { const xml = await fetchText(f.url, 6000); return { name: f.name, ok: true, items: parseRss(xml, f.name) }; }
    catch (e) { return { name: f.name, ok: false, items: [] }; }
  }));
  const all = results.flatMap(r => r.items).sort((a, b) => b.time - a.time).slice(0, 12);
  // Red-folder shock alerts — sirf asal headlines me high-impact keywords (CPI/NFP/FOMC...).
  const HI_RE = [/cpi/i, /nonfarm|nfp/i, /fomc/i, /interest rate decision/i, /rate decision/i, /\bfed\b/i, /\becb\b/i, /inflation report/i, /\bgdp\b/i, /jobs report/i, /unemployment rate/i, /central bank/i];
  const highImpact = all.filter(n => HI_RE.some(r => r.test(n.title || ''))).slice(0, 10);
  const data = {
    news: all,
    highImpact,
    engineOn: db.settings.engines.news !== false,
    sources: results.map(r => ({ name: r.name, status: r.ok ? 'CONNECTED' : 'RETRY' })),
    updatedAt: Date.now(),
    available: all.length > 0,
    note: 'Headlines FXStreet aur ForexLive ke free RSS feeds se aati hain — koi headline banayi nahi jati. Feed band ho to "news abhi nahi mil rahi" dikhaya jata hai.',
  };
  newsCache = { at: Date.now(), data };
  res.json(data);
});

// ---------------- Terminal backtest (signal quality review — asal 1H candles) ----------------
app.get('/api/terminal/backtest', requireAuth, async (req, res) => {
  const pair = (req.query.pair || 'XAUUSD').toUpperCase();
  const days = Math.min(parseInt(req.query.days || '30', 10) || 30, 30);
  const candles = await getCandles(pair, '1H');
  const trades = [];
  if (candles.length > 230) {
    const need = Math.min(candles.length, days * 24);
    const slice = candles.slice(-need);
    for (let i = 220; i < slice.length - 10; i += 2) {
      const window = slice.slice(i - 220, i + 1);
      const ind = computeIndicators(window);
      const live = window[window.length - 1].c;
      const buy = gateScore(window, ind, live, 'buy', { backtest: true });
      const sell = gateScore(window, ind, live, 'sell', { backtest: true });
      const dir = buy.total >= 85 ? 'BUY' : sell.total >= 85 ? 'SELL' : null;
      if (!dir) continue;
      const atr = ind.atr14 || live * 0.002;
      const sl = dir === 'BUY' ? live - 1.5 * atr : live + 1.5 * atr;
      const tp1 = dir === 'BUY' ? live + 1 * atr : live - 1 * atr;
      let outcome = null;
      for (let j = i + 1; j < Math.min(slice.length, i + 25); j++) {
        const c = slice[j];
        if (dir === 'BUY') { if (c.l <= sl) { outcome = 'Loss'; break; } if (c.h >= tp1) { outcome = 'Win'; break; } }
        else { if (c.h >= sl) { outcome = 'Loss'; break; } if (c.l <= tp1) { outcome = 'Win'; break; } }
      }
      if (!outcome) continue;
      trades.push({ dir, outcome, adx: ind.adx14, macdHist: ind.macdHist, hourUTC: new Date(window[window.length - 1].t).getUTCHours() });
    }
  }
  const stats = (list) => {
    const wins = list.filter(t => t.outcome === 'Win').length;
    const losses = list.length - wins;
    // Win = +1R (TP1), Loss = -1.5R (SL) — profit factor R se hisaab hota hai, sirf ginti se nahi.
    const grossWin = wins * 1, grossLoss = losses * 1.5;
    return { trades: list.length, wins, losses, winRate: list.length ? +(wins / list.length * 100).toFixed(1) : 0, profitFactor: grossLoss ? +(grossWin / grossLoss).toFixed(2) : (wins ? 99 : 0) };
  };
  res.json({
    pair, days,
    baseline: stats(trades),
    filters: {
      adx20: stats(trades.filter(t => t.adx != null && t.adx >= 20)),
      adx25: stats(trades.filter(t => t.adx != null && t.adx >= 25)),
      macdAgree: stats(trades.filter(t => t.macdHist != null && ((t.dir === 'BUY' && t.macdHist > 0) || (t.dir === 'SELL' && t.macdHist < 0)))),
      noDeadHours: stats(trades.filter(t => !(t.hourUTC >= 22 || t.hourUTC <= 1))),
    },
    note: 'Baseline = Terminal engine (6 gates, 85% gate) 1H candles par. Filters sirf un trades par lagte hain jo baseline me bane — gate kam nahi kiya gaya.',
  });
});

// Settings + logs + export + AI (in-app only)
app.get('/api/settings', requireAuth, (req, res) => res.json({ settings: { ...db.settings, priceMode: (db.settings && db.settings.priceMode) || 'last', engine: engineSettings() } }));
app.post('/api/settings', requireAdmin, (req, res) => {
  const { engines, defaultPair, priceMode, engine } = req.body || {};
  if (engines) db.settings.engines = { ...db.settings.engines, ...engines };
  if (defaultPair) db.settings.defaultPair = defaultPair;
  if (priceMode && ['last', 'bid', 'ask', 'mid'].includes(priceMode)) db.settings.priceMode = priceMode;
  if (engine && typeof engine === 'object') {
    const cur = engineSettings();
    const cl = (v, lo, hi, d) => { const num = parseFloat(v); return isFinite(num) ? Math.max(lo, Math.min(hi, num)) : d; };
    const next = { ...cur };
    if (engine.minQuality != null) next.minQuality = Math.round(cl(engine.minQuality, 85, 98, 85)); // Gate kabhi 85 se neeche nahi
    if (engine.slBufferPct != null) next.slBufferPct = +cl(engine.slBufferPct, 0, 2, 0.3).toFixed(2);
    if (engine.tp1R != null) next.tp1R = +cl(engine.tp1R, 0.5, 5, 1).toFixed(1);
    if (engine.tp2R != null) next.tp2R = +cl(engine.tp2R, 0.5, 5, 2).toFixed(1);
    if (engine.tp3R != null) next.tp3R = +cl(engine.tp3R, 0.5, 5, 3).toFixed(1);
    if (engine.maxConcurrent != null) next.maxConcurrent = Math.round(cl(engine.maxConcurrent, 1, 5, 3));
    if (engine.sessions && typeof engine.sessions === 'object') {
      next.sessions = { ...cur.sessions };
      for (const k of ['sydney', 'tokyo', 'london', 'newyork']) if (engine.sessions[k] != null) next.sessions[k] = !!engine.sessions[k];
    }
    db.settings.engine = next;
  }
  saveDb();
  res.json({ settings: { ...db.settings, priceMode: db.settings.priceMode || 'last', engine: engineSettings() } });
});
app.get('/api/logs', requireAdmin, (req, res) => res.json({ logs: db.logs })); // v9.3-sec: tracking logs me buyer usernames + admin activity hoti hai — sirf admin.
app.get('/api/export.csv', requireAuth, async (req, res) => {
  // v9.3: engine filter — UI hamesha engine=terminal bhejta hai (Terminal-only).
  // Param na ho to purana all-engine export (backward compatible).
  const engine = (req.query.engine || '').toLowerCase();
  let rows = [...db.signals];
  if (engine) rows = rows.filter(s => s.engine === engine);
  const list = await enrichHistory(rows);
  let csv = 'id,pair,direction,entry,sl,tp1,tp2,tp3,score,engine,createdAt,outcome\n';
  for (const s of list) csv += [s.id, s.pair, s.direction, s.entry, s.sl, s.tp1, s.tp2, s.tp3, s.score, s.engine, new Date(s.createdAt).toISOString(), s.outcome || 'In-Flight'].join(',') + '\n';
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="forex-trading-pro-signals.csv"');
  res.send(csv);
});
app.post('/api/ai', requireAuth, (req, res) => {
  // In-app helper only — koi bahar ki AI service nahi. Sirf site ke baare me jawab deta hai.
  const q = ((req.body || {}).question || '').toLowerCase();
  let a = 'Main in-app helper hoon (koi live AI nahi). Signal tabhi banta hai jab 85% gate poora ho — 6 gates me se points milte hain. WAIT ka matlab hai: abhi trade mat karein, shartein poori nahi hain.';
  if (q.includes('signal') || q.includes('buy') || q.includes('sell')) a = 'BUY/SELL signal sirf 85% gate paar hone par banta hai. Terminal tab me 6 gates dikhte hain — har gate ke points mile hue hote hain. WAIT ka matlab hai abhi koi trade nahi.';
  else if (q.includes('smc')) a = 'SMC tab me asal score dikhta hai (5 hisse x 20, gate 80%). Score 15M candles se banta hai — Liquidity Sweep, Market Structure, Order Block, FVG aur Risk/Reward.';
  else if (q.includes('price') || q.includes('live')) a = 'Prices har 5 second me refresh hoti hain — Kraken, Yahoo Finance aur ExchangeRate-API se. Upar "Last update" counter batata hai ke price kitni taaza hai.';
  else if (q.includes('plan') || q.includes('buy')) a = 'Plans: Monthly 30 din, Quarterly 90 din, Yearly 365 din, Lifetime. Plan khatam hone par buyer login khud band ho jata hai.';
  res.json({ answer: a, note: 'Ye jawab app ke andar se hai — koi bahar ki AI service use nahi hui.' });
});

// TF Matrix
app.get('/api/tfmatrix', requireAuth, async (req, res) => {
  const pair = (req.query.pair || 'XAUUSD').toUpperCase();
  const rows = [];
  for (const tf of ['1m', '5m', '15m', '30m', '1H', '4H', '1D']) {
    const candles = await getCandles(pair, tf);
    if (!candles.length) { rows.push({ tf, error: 'no_data' }); continue; }
    const ind = computeIndicators(candles);
    const macd = macdArr(candles.map(c => c.c));
    let sig = 'WAIT';
    if (ind.ema20 && ind.lastPrice > ind.ema20 && ind.rsi14 != null && ind.rsi14 > 55) sig = 'BUY';
    else if (ind.ema20 && ind.lastPrice < ind.ema20 && ind.rsi14 != null && ind.rsi14 < 45) sig = 'SELL';
    rows.push({ tf, rsi: ind.rsi14 != null ? +ind.rsi14.toFixed(1) : null, ema20: ind.ema20, macdHist: macd.hist, adx: ind.adx14 != null ? +ind.adx14.toFixed(1) : null, signal: sig });
  }
  res.json({ pair, rows, note: 'Har row apni timeframe ki asal candles se banti hai.' });
});

// ---------------- Web Push + per-pair notifications (v9.7) ----------------
// Har user sirf apni subscription aur apni pasand badalta hai (req.user).
// pushSubscriptions backup export me kabhi nahi jati — /api/admin/users sirf
// username/role/plan/dates bhejta hai, is liye wahan kuch strip karne ki zaroorat nahi.
app.get('/api/push/vapid-public-key', requireAuth, (req, res) => {
  res.json({ available: !!VAPID_PUBLIC_KEY, publicKey: VAPID_PUBLIC_KEY || null });
});
app.post('/api/push/subscribe', requireAuth, (req, res) => {
  const sub = (req.body || {}).subscription;
  if (!sub || typeof sub.endpoint !== 'string' || !sub.endpoint || !sub.keys || typeof sub.keys.p256dh !== 'string' || typeof sub.keys.auth !== 'string') {
    return res.status(400).json({ error: 'bad_subscription', message: 'Subscription ghalat hai.' });
  }
  if (!Array.isArray(req.user.pushSubscriptions)) req.user.pushSubscriptions = [];
  if (!req.user.pushSubscriptions.some(s => s.endpoint === sub.endpoint)) {
    req.user.pushSubscriptions.push({ endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } });
    saveDb();
  }
  res.json({ ok: true, count: req.user.pushSubscriptions.length });
});
app.post('/api/push/unsubscribe', requireAuth, (req, res) => {
  const endpoint = (req.body || {}).endpoint;
  if (!Array.isArray(req.user.pushSubscriptions)) req.user.pushSubscriptions = [];
  if (endpoint) req.user.pushSubscriptions = req.user.pushSubscriptions.filter(s => s.endpoint !== endpoint);
  saveDb();
  res.json({ ok: true, count: req.user.pushSubscriptions.length });
});
app.get('/api/notify-pairs', requireAuth, (req, res) => {
  res.json({ pairs: Array.isArray(req.user.notifyPairs) ? req.user.notifyPairs : PAIRS.map(p => p.id) });
});
app.post('/api/notify-pairs', requireAuth, (req, res) => {
  const pairs = (req.body || {}).pairs;
  const valid = PAIRS.map(p => p.id);
  if (!Array.isArray(pairs) || pairs.length > 15 || pairs.some(p => typeof p !== 'string' || !valid.includes(p))) {
    return res.status(400).json({ error: 'bad_pairs', message: 'Pairs ki list ghalat hai.' });
  }
  req.user.notifyPairs = [...new Set(pairs)]; saveDb();
  res.json({ ok: true, pairs: req.user.notifyPairs });
});

// ---------------- Admin: buyer accounts ----------------
app.get('/api/admin/users', requireAdmin, (req, res) => {
  const total = db.users.filter(u => u.role === 'buyer').length;
  const now = Date.now();
  const active = db.users.filter(u => u.role === 'buyer' && !u.suspended && (!u.expiresAt || u.expiresAt > now)).length;
  const expired = db.users.filter(u => u.role === 'buyer' && u.expiresAt && u.expiresAt <= now).length;
  const users = db.users.map(u => ({ username: u.username, role: u.role, plan: u.plan, createdAt: u.createdAt, expiresAt: u.expiresAt, suspended: !!u.suspended }));
  res.json({ total, active, expired, users });
});
app.post('/api/admin/users', requireAdmin, (req, res) => {
  const { username, password, plan } = req.body || {};
  if (!username || username.length < 3) return res.status(400).json({ error: 'bad_username', message: 'Username kam se kam 3 harf ka ho.' });
  if (!password || password.length < 6) return res.status(400).json({ error: 'bad_password', message: 'Password kam se kam 6 harf ka ho.' });
  if (!PLAN_DAYS.hasOwnProperty(plan)) return res.status(400).json({ error: 'bad_plan', message: 'Plan Monthly / Quarterly / Yearly / Lifetime me se ho.' });
  if (findUser(username)) return res.status(400).json({ error: 'exists', message: 'Ye username pehle se hai.' });
  const salt = crypto.randomBytes(16).toString('hex');
  const days = PLAN_DAYS[plan];
  db.users.push({ username, passHash: hashPassword(password, salt), salt, role: 'buyer', plan, createdAt: Date.now(), expiresAt: days ? Date.now() + days * 86400000 : null, suspended: false, tgCode: crypto.randomBytes(8).toString('hex'), tgChatId: null });
  logEvent('Buyer banaya gaya: ' + username + ' (' + plan + ')');
  saveDb();
  res.json({ ok: true });
});
app.post('/api/admin/users/:username/extend', requireAdmin, (req, res) => {
  const u = findUser(req.params.username);
  if (!u || u.role !== 'buyer') return res.status(404).json({ error: 'not_found' });
  if (!u.expiresAt) return res.status(400).json({ error: 'lifetime', message: 'Lifetime plan ko extend karne ki zaroorat nahi.' });
  u.expiresAt = Math.max(u.expiresAt, Date.now()) + 30 * 86400000;
  logEvent('Buyer +30 din: ' + u.username);
  saveDb();
  res.json({ ok: true, expiresAt: u.expiresAt });
});
app.post('/api/admin/users/:username/suspend', requireAdmin, (req, res) => {
  const u = findUser(req.params.username);
  if (!u || u.role !== 'buyer') return res.status(404).json({ error: 'not_found' });
  u.suspended = true; saveDb(); res.json({ ok: true });
});
app.post('/api/admin/users/:username/reopen', requireAdmin, (req, res) => {
  const u = findUser(req.params.username);
  if (!u || u.role !== 'buyer') return res.status(404).json({ error: 'not_found' });
  u.suspended = false; saveDb(); res.json({ ok: true });
});
app.post('/api/admin/users/:username/password', requireAdmin, (req, res) => {
  const u = findUser(req.params.username);
  if (!u) return res.status(404).json({ error: 'not_found' });
  const { password } = req.body || {};
  if (!password || password.length < 6) return res.status(400).json({ error: 'bad_password', message: 'Password kam se kam 6 harf ka ho.' });
  u.salt = crypto.randomBytes(16).toString('hex');
  u.passHash = hashPassword(password, u.salt);
  saveDb();
  res.json({ ok: true });
});
app.delete('/api/admin/users/:username', requireAdmin, (req, res) => {
  const u = findUser(req.params.username);
  if (!u) return res.status(404).json({ error: 'not_found', message: 'Ye user nahi mila.' });
  if (u.role === 'admin') return res.status(400).json({ error: 'cannot_delete', message: 'Admin ko delete nahi kar sakte.' });
  db.users = db.users.filter(x => x.username !== req.params.username);
  db.sessions = db.sessions.filter(s => s.username !== req.params.username);
  saveDb();
  res.json({ ok: true });
});

// ---------------- Start ----------------
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// Background kaam: Telegram poll har 5 minute, recorder har 15 minute (server jaag raha ho tab).
// Pehla tick 60 second baad — deploy ke baad lambi der tak intezaar nahi.
if (!TG_TOKEN) console.log('Telegram: TELEGRAM_BOT_TOKEN nahi mila — alerts band hain, baaki sab chal raha hai.');
if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) console.log('Web Push: VAPID keys nahi mileen — browser notifications band hain, baaki sab chal raha hai.');
setTimeout(() => { backgroundTick().catch(() => {}); }, 60000);
setInterval(() => { backgroundTick().catch(() => {}); }, 5 * 60 * 1000);
app.listen(PORT, () => console.log('Forex Trading Pro chal raha hai: http://localhost:' + PORT));

// Test ke liye (NODE_ENV=test) — production me kuch nahi badalta.
if (process.env.NODE_ENV === 'test') {
  module.exports = { recordTerminalSignal, sendSignalAlert, sendPushAlert, buildPushPayload, notifyPairOn, buildTelegramMessage, parseTelegramUpdates, applyTelegramUpdates, telegramPollUpdates, recorderTick, backgroundTick, ensureTgCode, buyerActive, gateScore, isMarketClosed, computeZones, computeTrendPanel, getDb: () => db, telegramDryRunSent, pushDryRunSent, webpush, engineSettings, priceByMode, walkExit, rForRule, runBacktest, computeSmc, computeScanner, GROUP_PAIRS };
}
