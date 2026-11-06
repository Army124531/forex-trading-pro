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
    users: [],          // {username, passHash, salt, role:'admin'|'buyer', plan, createdAt, expiresAt, suspended}
    sessions: [],       // {token, username, createdAt}
    signals: [],        // {id, pair, direction, entry, sl, tp1, tp2, tp3, score, gate, engine, createdAt, outcome, outcomeAt}
    logs: [],           // {at, text}
    settings: {
      engines: { terminal: true, smc: true, session: true, news: true },
      aiEnabled: true,
      defaultPair: 'XAUUSD',
    },
    lastPrices: {},     // pairId -> last good quote (backup)
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
let cgCache = { at: 0, data: null };

async function fetchAllPrices() {
  const now = Date.now();
  if (priceCache.data && now - priceCache.at < 3000) return priceCache.data;
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
      tryFetch('https://api.gold-api.com/api/' + s + '/USD', 3000).then(d => ({ s, d })));
    // Swissquote: koshish ki jati hai; agar JSON quotes mile to use hoga, warna ignore.
    const sqP = tryFetch('https://www.swissquote.com/sqx-api/1.0/market/quotes?symbols=XAUUSD,EURUSD,GBPUSD,USDJPY,AUDUSD,USDCAD,USDCHF,XAGUSD', 3000);
    let cg = null;
    if (!cgCache.data || now - cgCache.at > 60000) {
      cg = await tryFetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana,binancecoin,ripple,dogecoin,cardano,pax-gold&vs_currencies=usd&include_24hr_change=true', 5000);
      if (cg) cgCache = { at: now, data: cg };
    } else cg = cgCache.data;

    const [kraken, yahooList, ex, goldApiList, sq] = await Promise.all([
      krakenP, Promise.all(yahooPs), exP, Promise.all(goldApiPs), sqP,
    ]);

    const krakenMap = {};
    if (kraken && kraken.result) {
      for (const [k, v] of Object.entries(kraken.result)) {
        const pair = krakenKeyToPair(k);
        krakenMap[pair] = { bid: parseFloat(v.b[0]), ask: parseFloat(v.a[0]), last: parseFloat(v.c[0]), open: parseFloat(v.o), high24: parseFloat(v.h[1]), low24: parseFloat(v.l[1]) };
      }
      sources.push({ name: 'Kraken', status: 'CONNECTED' });
    } else sources.push({ name: 'Kraken', status: 'RETRY' });

    const yahooMap = {};
    let yahooOk = 0;
    for (const { id, d } of yahooList) {
      const m = d && d.chart && d.chart.result && d.chart.result[0] && d.chart.result[0].meta;
      if (m && typeof m.regularMarketPrice === 'number') { yahooMap[id] = { price: m.regularMarketPrice, prevClose: m.previousClose }; yahooOk++; }
    }
    sources.push({ name: 'Yahoo Finance', status: yahooOk ? 'CONNECTED' : 'RETRY' });

    const exRates = (ex && ex.rates) ? ex.rates : null;
    sources.push({ name: 'ExchangeRate-API', status: exRates ? 'CONNECTED' : 'RETRY' });

    const goldMap = {};
    for (const { s, d } of goldApiList) {
      if (d && typeof d.price === 'number') goldMap[s] = d.price;
    }
    sources.push({ name: 'Gold-API', status: Object.keys(goldMap).length ? 'CONNECTED' : 'RETRY' });

    // Swissquote parse (agar JSON array mile)
    const sqMap = {};
    if (Array.isArray(sq)) {
      for (const q of sq) {
        const sym = (q.symbol || q.instrument || '').toString().toUpperCase().replace('/', '');
        const bid = parseFloat(q.bid ?? q.bidPrice); const ask = parseFloat(q.ask ?? q.askPrice);
        if (sym && isFinite(bid) && isFinite(ask)) sqMap[sym] = { bid, ask, price: (bid + ask) / 2 };
      }
    }
    sources.push({ name: 'Swissquote', status: Object.keys(sqMap).length ? 'CONNECTED' : 'RETRY' });
    sources.push({ name: 'CoinGecko', status: cg ? 'CONNECTED' : 'RETRY' });

    const out = [];
    for (const p of PAIRS) {
      let price = null, bid = null, ask = null, change = null, source = 'backup', live = false;
      const k = p.kraken ? krakenMap[p.kraken] : null;
      const y = yahooMap[p.id];
      if (sqMap[p.id]) { // Swissquote pehle (agar mila)
        price = sqMap[p.id].price; bid = sqMap[p.id].bid; ask = sqMap[p.id].ask; source = 'Swissquote'; live = true;
      }
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
        // 24h change
        if (p.cg && cg && cg[p.cg] && typeof cg[p.cg].usd_24h_change === 'number') change = cg[p.cg].usd_24h_change;
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
    lastPrice: last.c,
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

// ---------------- Signal Engine: 6 gates / 100 points, BUY/SELL sirf 85%+ par ----------------
function gateScore(candles, ind, livePrice, side) {
  // side: 'buy' ya 'sell'. Har gate 0..points.
  const gates = [];
  const price = livePrice || ind.lastPrice;
  const e20 = ind.ema20, e50 = ind.ema50, e200 = ind.ema200;
  // 1) Indicator Trend — 20
  let g1 = 0;
  if (side === 'buy') { if (e20 && e50 && price > e20 && e20 > e50) g1 = 20; else if (e50 && price > e50) g1 = 10; }
  else { if (e20 && e50 && price < e20 && e20 < e50) g1 = 20; else if (e50 && price < e50) g1 = 10; }
  gates.push({ name: side === 'buy' ? 'Indicator Trend (BUY)' : 'Indicator Trend (SELL)', points: g1, max: 20 });
  // 2) Structure Swing — 20
  const sw = findSwings(candles);
  let g2 = 0;
  if (side === 'buy') { if (sw.low != null && price > sw.low) g2 = 20; else if (sw.low != null) g2 = 5; }
  else { if (sw.high != null && price < sw.high) g2 = 20; else if (sw.high != null) g2 = 5; }
  gates.push({ name: 'Structure Swing', points: g2, max: 20 });
  // 3) RSI Recovery — 15
  let g3 = 0;
  const rsi = ind.rsi14;
  if (rsi != null) {
    if (side === 'buy') { if (rsi >= 50 && rsi <= 70) g3 = 15; else if (rsi >= 45 && rsi < 50) g3 = 8; }
    else { if (rsi >= 30 && rsi <= 50) g3 = 15; else if (rsi > 50 && rsi <= 55) g3 = 8; }
  }
  gates.push({ name: 'RSI Recovery', points: g3, max: 15 });
  // 4) R/R Geometry — 15
  let g4 = 0;
  if (sw.high != null && sw.low != null) {
    if (side === 'buy') { const rr = (sw.high - price) / Math.max(price - sw.low, 1e-9); if (rr >= 1.5) g4 = 15; else if (rr >= 1) g4 = 8; }
    else { const rr = (price - sw.low) / Math.max(sw.high - price, 1e-9); if (rr >= 1.5) g4 = 15; else if (rr >= 1) g4 = 8; }
  }
  gates.push({ name: 'R/R Geometry', points: g4, max: 15 });
  // 5) Macro EMA200 — 15
  let g5 = 0;
  if (side === 'buy') { if (e200 && price > e200 && e50 && e50 > e200) g5 = 15; else if (e200 && price > e200) g5 = 8; }
  else { if (e200 && price < e200 && e50 && e50 < e200) g5 = 15; else if (e200 && price < e200) g5 = 8; }
  gates.push({ name: 'Macro EMA200', points: g5, max: 15 });
  // 6) Data Freshness — 15
  let g6 = 0;
  const lastT = candles.length ? candles[candles.length - 1].t : 0;
  const ageMin = (Date.now() - lastT) / 60000;
  if (ageMin <= 15) g6 = 15; else if (ageMin <= 45) g6 = 8;
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
function planStatus(plan, livePrice) {
  const [lo, hi] = plan.entryZone;
  return (livePrice >= lo && livePrice <= hi) ? 'IN_ZONE' : 'APPROACHING';
}
let signalCache = new Map(); // pair -> {at, data}
async function computeSignal(pairId) {
  const cached = signalCache.get(pairId);
  if (cached && Date.now() - cached.at < 30000) return cached.data;
  const prices = await fetchAllPrices();
  const quote = prices.pairs.find(p => p.id === pairId);
  const candles = await getCandles(pairId, '15m');
  if (!candles.length || !quote || quote.price == null) {
    return { pair: pairId, error: 'no_data', message: 'Is pair ka live data nahi mila.' };
  }
  const ind = computeIndicators(candles);
  const live = quote.price;
  const buy = gateScore(candles, ind, live, 'buy');
  const sell = gateScore(candles, ind, live, 'sell');
  const direction = buy.total >= 85 ? 'BUY' : sell.total >= 85 ? 'SELL' : 'WAIT';
  const confluence = Math.max(buy.total, sell.total);
  const buyPlan = buildPlan(live, ind.atr14, 'buy');
  const sellPlan = buildPlan(live, ind.atr14, 'sell');
  buyPlan.status = planStatus(buyPlan, live);
  sellPlan.status = planStatus(sellPlan, live);
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
  const comments = [];
  if (direction === 'WAIT') comments.push('WAIT — koi trade nahi. 85% gate poora nahi hua (' + confluence + '%).');
  if (buy.total >= sell.total) comments.push('BUY taraf ' + buy.total + '% confluence hai.');
  else comments.push('SELL taraf ' + sell.total + '% confluence hai.');
  if (ind.rsi14 != null) comments.push('RSI 14: ' + ind.rsi14.toFixed(1) + (ind.rsi14 > 70 ? ' (Overbought)' : ind.rsi14 < 30 ? ' (Oversold)' : ''));
  if (ind.ema200 && live > ind.ema200) comments.push('Price EMA 200 ke upar hai — bara trend upar.');
  else if (ind.ema200) comments.push('Price EMA 200 ke neeche hai — bara trend neeche.');
  const pdh = Math.max(...candles.slice(-96).map(c => c.h));
  const pdl = Math.min(...candles.slice(-96).map(c => c.l));
  const data = {
    pair: pairId, price: live, bid: quote.bid, ask: quote.ask, spread: quote.spread,
    direction, confluence, threshold: 85,
    buyGates: buy.gates, sellGates: sell.gates,
    buyPlan, sellPlan,
    sentiment, range: { pdh, pdl },
    rsi14: ind.rsi14, atr14: ind.atr14, ema20: ind.ema20, ema50: ind.ema50, ema200: ind.ema200,
    comments, nextCheckInSec: 30, updatedAt: Date.now(),
  };
  signalCache.set(pairId, { at: Date.now(), data });
  // Record BUY/SELL signal (WAIT kabhi record nahi hota)
  if (direction !== 'WAIT') {
    const plan = direction === 'BUY' ? buyPlan : sellPlan;
    const recentSame = db.signals.find(s => s.pair === pairId && s.direction === direction && Date.now() - s.createdAt < 3600000);
    if (!recentSame) {
      db.signals.unshift({ id: 'SIG-' + Date.now().toString(36).toUpperCase(), pair: pairId, direction, entry: plan.entry, sl: plan.sl, tp1: plan.tp1, tp2: plan.tp2, tp3: plan.tp3, score: confluence, gate: 85, engine: 'terminal', createdAt: Date.now(), outcome: null, outcomeAt: null });
      if (db.signals.length > 500) db.signals.length = 500;
      logEvent(direction + ' signal: ' + pairId + ' @ ' + plan.entry.toFixed(2) + ' (' + confluence + '%)');
      saveDb();
    }
  }
  return data;
}

// ---------------- SMC (asal 15M candles se) ----------------
function computeSmc(candles15, candles5) {
  if (!candles15.length) return { error: 'no_data' };
  const sw = findSwings(candles15);
  const last = candles15[candles15.length - 1];
  // Liquidity sweeps: aakhri 15 candles me swing ke neeche/upar wick phir wapas
  let sweep = false, sweepSide = null;
  for (let i = Math.max(0, candles15.length - 15); i < candles15.length; i++) {
    const c = candles15[i];
    if (sw.low != null && c.l < sw.low && c.c > sw.low) { sweep = true; sweepSide = 'SSL (neeche sweep)'; }
    if (sw.high != null && c.h > sw.high && c.c < sw.high) { sweep = true; sweepSide = 'BSL (upar sweep)'; }
  }
  // BOS / MSS: aakhri swing toota ya nahi
  let bos = false, mss = false;
  const prevSw = findSwings(candles15.slice(0, -5));
  if (prevSw.high != null && last.c > prevSw.high) { bos = true; mss = true; }
  if (prevSw.low != null && last.c < prevSw.low) { bos = true; mss = true; }
  // Order blocks: strong move se pehle ki aakhri opposite candle
  function findOB(dir) {
    for (let i = candles15.length - 3; i >= Math.max(0, candles15.length - 40); i--) {
      const c = candles15[i], nxt = candles15[i + 1], nxt2 = candles15[i + 2];
      if (dir === 'bullish' && c.c < c.o && nxt.c > nxt.o && nxt2 && nxt2.c > nxt2.o) return { low: Math.min(c.l, nxt.l), high: Math.max(c.h, nxt.h), mitigated: last.c < c.l };
      if (dir === 'bearish' && c.c > c.o && nxt.c < nxt.o && nxt2 && nxt2.c < nxt2.o) return { low: Math.min(c.l, nxt.l), high: Math.max(c.h, nxt.h), mitigated: last.c > c.h };
    }
    return null;
  }
  const bullOB = findOB('bullish'), bearOB = findOB('bearish');
  // FVG: candle i-1 high < candle i+1 low (bullish gap) ya ulta
  const fvgs = [];
  for (let i = candles15.length - 1; i >= Math.max(1, candles15.length - 30); i--) {
    const a = candles15[i - 1], b = candles15[i + 1];
    if (!a || !b) continue;
    if (a.h < b.l) fvgs.push({ type: 'Bullish', low: a.h, high: b.l });
    if (a.l > b.h) fvgs.push({ type: 'Bearish', low: b.h, high: a.l });
    if (fvgs.length >= 4) break;
  }
  // 5M micro: SSL sweeps count
  let sslSweeps = 0;
  if (candles5 && candles5.length) {
    const sw5 = findSwings(candles5);
    for (const c of candles5.slice(-40)) {
      if (sw5.low != null && c.l < sw5.low && c.c > sw5.low) sslSweeps++;
    }
  }
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
    bos, mss, bullOB, bearOB, fvgs, sslSweeps,
    pools: 15, // liquidity pools ki taadad (swing levels se)
    updatedAt: Date.now(),
  };
}
let scannerCache = { at: 0, data: null };
async function computeScanner() {
  if (scannerCache.data && Date.now() - scannerCache.at < 45000) return scannerCache.data;
  const uniq = ['XAUUSD', 'XAGUSD', 'EURUSD', 'GBPUSD', 'USDJPY', 'EURJPY', 'NAS100', 'BTCUSD', 'ETHUSD', 'BNBUSD', 'SOLUSD'];
  const prices = await fetchAllPrices();
  const rows = [];
  for (const id of uniq) {
    let candles = [], price = null;
    if (id === 'NAS100') {
      candles = await yahooCandles('^NDX', '15m', '5d') || [];
      price = await fetchYahooPrice('^NDX');
    } else if (id === 'EURJPY') {
      candles = await getCandles('EURUSD', '15m');
      price = await fetchYahooPrice('EURJPY=X');
    } else {
      candles = await getCandles(id, '15m');
      const q = prices.pairs.find(p => p.id === id);
      price = q ? q.price : null;
    }
    let score = null, dir = 'WAIT';
    if (candles.length) {
      const smc = computeSmc(candles, []);
      score = smc.score;
      dir = score >= 80 ? (candles[candles.length - 1].c >= candles[candles.length - 1].o ? 'BUY' : 'SELL') : 'WAIT';
    }
    rows.push({ pair: id, price, smcScore: score, direction: dir });
  }
  const data = { rows, cycleSec: 45, updatedAt: Date.now(), confirmedSignals: db.signals.filter(s => s.engine === 'smc').length };
  scannerCache = { at: Date.now(), data };
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

// ---------------- API routes ----------------
app.get('/api/health', (req, res) => res.json({ ok: true, name: 'Forex Trading Pro', time: new Date().toISOString(), pairs: PAIRS.length }));

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
  db.users.push({ username, passHash: hashPassword(password, salt), salt, role: 'admin', plan: 'Lifetime', createdAt: Date.now(), expiresAt: null, suspended: false });
  const token = makeToken();
  db.sessions.push({ token, username, createdAt: Date.now() });
  logEvent('Admin account banaya gaya: ' + username);
  saveDb();
  res.json({ token, user: { username, role: 'admin' } });
});
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body || {};
  const u = findUser(username);
  if (!u || hashPassword(password || '', u.salt) !== u.passHash) return res.status(401).json({ error: 'wrong_login', message: 'Username ya password ghalat hai.' });
  if (u.suspended) return res.status(403).json({ error: 'suspended', message: 'Account band hai. Admin se rabta karein.' });
  if (u.role === 'buyer' && u.expiresAt && Date.now() > u.expiresAt) return res.status(403).json({ error: 'expired', message: 'Plan khatam ho gaya hai. Admin se renew karwayein.' });
  const token = makeToken();
  db.sessions.push({ token, username, createdAt: Date.now() });
  saveDb();
  res.json({ token, user: { username: u.username, role: u.role, plan: u.plan, expiresAt: u.expiresAt } });
});
app.post('/api/auth/logout', (req, res) => {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  db.sessions = db.sessions.filter(s => s.token !== token);
  saveDb();
  res.json({ ok: true });
});
app.get('/api/auth/me', requireAuth, (req, res) => {
  res.json({ user: { username: req.user.username, role: req.user.role, plan: req.user.plan, expiresAt: req.user.expiresAt } });
});

// Prices
app.get('/api/prices', requireAuth, async (req, res) => {
  try { res.json(await fetchAllPrices()); }
  catch (e) { res.status(500).json({ error: 'price_fail', message: 'Price nahi mil saki: ' + e.message }); }
});

// Terminal signal
app.get('/api/signal', requireAuth, async (req, res) => {
  if (!db.settings.engines.terminal) return res.json({ disabled: true, message: 'Terminal engine band hai (Admin ne band kiya hai).' });
  const pair = (req.query.pair || db.settings.defaultPair || 'XAUUSD').toUpperCase();
  try { res.json(await computeSignal(pair)); }
  catch (e) { res.status(500).json({ error: 'signal_fail', message: e.message }); }
});

// Indicators Center
app.get('/api/indicators', requireAuth, async (req, res) => {
  const pair = (req.query.pair || 'XAUUSD').toUpperCase();
  const out = {};
  for (const tf of ['15m', '1H', '1D']) {
    const iv = tf === '15m' ? '15m' : tf === '1H' ? '1H' : '1D';
    const candles = await getCandles(pair, iv);
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
  res.json({ pair, timeframes: out, scorecard: { score, parts, note: 'Score asal Kraken candles se banta hai.' } });
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
      const plan = buildPlan(live, ind.atr14, dir);
      db.signals.unshift({ id: 'SIG-' + Date.now().toString(36).toUpperCase(), pair, direction: dir, entry: plan.entry, sl: plan.sl, tp1: plan.tp1, tp2: plan.tp2, tp3: plan.tp3, score: smc.score, gate: 80, engine: 'smc', createdAt: Date.now(), outcome: null, outcomeAt: null });
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
app.get('/api/sessions', requireAuth, async (req, res) => {
  if (!db.settings.engines.session) return res.json({ disabled: true, message: 'Session engine band hai.' });
  const info = sessionInfo();
  const pairs = ['EURUSD', 'GBPUSD', 'USDJPY', 'XAUUSD', 'BTCUSD', 'AUDUSD'];
  const prices = await fetchAllPrices();
  const rows = [];
  for (const id of pairs) {
    const candles = await getCandles(id, '1H');
    if (!candles.length) continue;
    const ind = computeIndicators(candles);
    const q = sessionQuality(ind, candles);
    const live = (prices.pairs.find(p => p.id === id) || {}).price || candles[candles.length - 1].c;
    const dir = q.score >= 85 ? (ind.ema20 && live > ind.ema20 ? 'BUY' : 'SELL') : 'WAIT';
    const plan = dir === 'WAIT' ? buildPlan(live, ind.atr14, 'BUY') : buildPlan(live, ind.atr14, dir);
    rows.push({ pair: id, price: live, quality: q.score, qualityDetails: q.details, direction: dir, rsi: ind.rsi14, adx: ind.adx14, entry: plan.entry, sl: plan.sl, tp1: plan.tp1, tp2: plan.tp2, tp3: plan.tp3 });
    if (dir !== 'WAIT') {
      const recentSame = db.signals.find(s => s.pair === id && s.direction === dir && s.engine === 'session' && Date.now() - s.createdAt < 3600000);
      if (!recentSame) {
        db.signals.unshift({ id: 'SIG-' + Date.now().toString(36).toUpperCase(), pair: id, direction: dir, entry: plan.entry, sl: plan.sl, tp1: plan.tp1, tp2: plan.tp2, tp3: plan.tp3, score: q.score, gate: 85, engine: 'session', createdAt: Date.now(), outcome: null, outcomeAt: null });
        if (db.signals.length > 500) db.signals.length = 500;
        saveDb();
      }
    }
  }
  const sessionSignals = db.signals.filter(s => s.engine === 'session');
  res.json({ ...info, pairs: rows, stats: { total: sessionSignals.length, buy: sessionSignals.filter(s => s.direction === 'BUY').length, sell: sessionSignals.filter(s => s.direction === 'SELL').length, wait: 0, note: 'WAIT signals kabhi record nahi hote, is liye WAIT ki ginti hamesha 0 hoti hai.' } });
});
app.get('/api/session/backtest', requireAuth, async (req, res) => {
  const days = Math.min(parseInt(req.query.days || '30', 10) || 30, 90);
  const session = (req.query.session || 'all').toLowerCase();
  // Asal 1H candles par session rule chalakar dekhein (EURUSD + GBPUSD)
  let trades = 0, wins = 0, losses = 0, be = 0, grossWin = 0, grossLoss = 0;
  for (const id of ['EURUSD', 'GBPUSD']) {
    const candles = await getCandles(id, '1H');
    if (candles.length < 100) continue;
    const need = Math.min(candles.length, days * 24);
    const slice = candles.slice(-need);
    for (let i = 50; i < slice.length - 10; i++) {
      const window = slice.slice(0, i + 1);
      const ind = computeIndicators(window);
      const q = sessionQuality(ind, window);
      if (q.score < 85) continue;
      const entry = window[window.length - 1].c;
      const dir = ind.ema20 && entry > ind.ema20 ? 'BUY' : 'SELL';
      const atr = ind.atr14 || entry * 0.001;
      const sl = dir === 'BUY' ? entry - 1.5 * atr : entry + 1.5 * atr;
      const tp1 = dir === 'BUY' ? entry + 1.5 * atr : entry - 1.5 * atr;
      let outcome = null;
      for (let j = i + 1; j < Math.min(slice.length, i + 25); j++) {
        const c = slice[j];
        if (dir === 'BUY') { if (c.l <= sl) { outcome = 'Loss'; break; } if (c.h >= tp1) { outcome = 'Win'; break; } }
        else { if (c.h >= sl) { outcome = 'Loss'; break; } if (c.l <= tp1) { outcome = 'Win'; break; } }
      }
      if (!outcome) continue;
      trades++;
      if (outcome === 'Win') { wins++; grossWin += 1.5; } else { losses++; grossLoss += 1.5; }
    }
  }
  res.json({ days, session, trades, wins, losses, winRate: trades ? +(wins / trades * 100).toFixed(1) : 0, profitFactor: grossLoss ? +(grossWin / grossLoss).toFixed(2) : (wins ? 99 : 0), note: 'Ye backtest asal 1H candles par chala hai — koi banaya hua number nahi.' });
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
app.get('/api/refiner', requireAuth, async (req, res) => {
  const cutoff = parseInt(req.query.cutoff || '85', 10) || 85;
  const eligible = db.signals.filter(s => typeof s.score === 'number');
  const list = await enrichHistory(eligible.filter(s => s.score >= cutoff));
  const closed = list.filter(s => s.outcome && s.outcome !== 'In-Flight');
  const wins = list.filter(s => s.outcome === 'Win').length;
  res.json({
    cutoff, qualifying: list.length,
    winRate: closed.length ? +(wins / closed.length * 100).toFixed(1) : null,
    signals: list.slice(0, 50),
    note: db.buildNote + ' Purane signals (jinke score nahi hain) is me nahi aate.',
  });
});

// Settings + logs + export + AI (in-app only)
app.get('/api/settings', requireAuth, (req, res) => res.json({ settings: db.settings }));
app.post('/api/settings', requireAdmin, (req, res) => {
  const { engines, defaultPair } = req.body || {};
  if (engines) db.settings.engines = { ...db.settings.engines, ...engines };
  if (defaultPair) db.settings.defaultPair = defaultPair;
  saveDb();
  res.json({ settings: db.settings });
});
app.get('/api/logs', requireAuth, (req, res) => res.json({ logs: db.logs }));
app.get('/api/export.csv', requireAuth, async (req, res) => {
  const list = await enrichHistory([...db.signals]);
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
  db.users.push({ username, passHash: hashPassword(password, salt), salt, role: 'buyer', plan, createdAt: Date.now(), expiresAt: days ? Date.now() + days * 86400000 : null, suspended: false });
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
app.listen(PORT, () => console.log('Forex Trading Pro chal raha hai: http://localhost:' + PORT));
