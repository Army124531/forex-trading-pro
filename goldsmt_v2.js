// Forex Trading Pro — Gold SMT Intraday backtest, VERSION 2 (malik ki asal trade ke mutabiq)
// SIRF research: live engine / website se koi talluq nahi.
//
// Misaal trade (5 Jan 2026, NY time): H4 "failed to manipulate" ke baad market open par displacement
// ne H4 gap (FVG 4333–4397) banaya. Price gap me aayi: H1 par do lows (4389, phir 4396 = higher low),
// Silver ne lower low banaya = SMT. Phir M5 CSD (4411.8) par BUY, SL low (4396.9), TP dono lows ke
// beech ka high (4440). RR ~1.9.
//
// Rules (BUY; SELL bilkul ulta — chart ulta kar ke wahi code):
//   1. Key level: H4 bullish FVG (H4 candles New York time par: 18:00, 22:00, 02:00 ... jaise chart par).
//      keyFilter 'bos': FVG wali candles me se koi pichle pakke H4 swing high ke oopar band ho
//      (failed-to-manipulate ke baad displacement). 'any': har H4 FVG.
//   2. Tap: price FVG ke andar aaye.
//   3. 2-stage SMT (H1): L1 = FVG ke andar bana H1 swing low. Phir oopar ka high (H), phir pullback ka
//      low L2 (key level ke andar/qareeb). Gold aur partner (Silver, ya DXY ulta) ke L1→L2 alag simt me hon.
//      L2 = protected low.
//   4. CSD (M5): L2 tak aane wali bearish candles ki series ke open ke oopar close → agli candle par entry.
//   5. SL = L2 se thora neeche. TP = H (dono lows ke beech ka high, liquidity). RR kam az kam minRR.
//   6. Intraday: entry sessionStart–sessionEnd UTC, closeUTC par sab band, din me max 2, aik waqt me aik.
'use strict';
const g = require('./goldsmt');
const MIN = 60000, HOUR = 60 * MIN;

const V2_DEFAULTS = {
  partner: 'silver',   // 'silver' | 'dxy'
  keyFilter: 'bos',    // 'bos' | 'any'
  discount: false,     // true = FVG H4 dealing range ke discount me ho
  zoneLifeH: 120,      // FVG kitne ghante zinda (5 din)
  armH: 48,            // tap ke baad setup kitni der tak dhoonda jaye
  minRR: 1.0,
  maxRR: 99,
  slBuf: 0.5,          // $ — SL, L2 se itna neeche
  l2Fresh: 12,         // L2 zyada se zyada itni M5 candles purana ho (1 ghanta)
  sessionStartUTC: 7, sessionEndUTC: 17, closeUTC: 20,
  maxPerDay: 2,
  be: false,
  balance: 10000, riskPct: 1,
};

// New York ka UTC offset (US daylight saving ke saath)
function nyOffsetH(t) {
  const y = new Date(t).getUTCFullYear();
  const marDow = new Date(Date.UTC(y, 2, 1)).getUTCDay();
  const start = Date.UTC(y, 2, 1 + ((7 - marDow) % 7) + 7, 7);
  const novDow = new Date(Date.UTC(y, 10, 1)).getUTCDay();
  const end = Date.UTC(y, 10, 1 + ((7 - novDow) % 7), 6);
  return t >= start && t < end ? 4 : 5;
}
// Candles ko New York 18:00 se shuru hone wale buckets me jorna (H4 chart jaisa)
function resampleNY(c, ivMin) {
  const iv = ivMin * MIN, out = [];
  let cur = null;
  for (const x of c) {
    const off = nyOffsetH(x.t) * HOUR;
    const local = x.t - off;
    const startLocal = Math.floor((local - 18 * HOUR) / iv) * iv + 18 * HOUR;
    const t = startLocal + off;
    if (!cur || cur.t !== t) { cur = { t, end: t + iv, o: x.o, h: x.h, l: x.l, c: x.c, last: x.end }; out.push(cur); }
    else { cur.h = Math.max(cur.h, x.h); cur.l = Math.min(cur.l, x.l); cur.c = x.c; cur.last = x.end; }
  }
  if (out.length && out[out.length - 1].last < out[out.length - 1].end) out.pop();
  return out;
}

function findV2(D, P, dirName) {
  const { e, ep, h1, h1p, h4 } = D;
  const atrH1 = g.atrArr(h1, 14);
  const h4P = g.pivots(h4, 2);
  const h1Lows = g.pivots(h1, 1).lows;
  const h1Idx = new Map(h1.map((b, k) => [b.t, k]));

  // 1. Key levels (H4 FVG)
  const zones = [];
  let sp = 0, lastSH = null, lastSL = null, spl = 0;
  for (let j = 2; j < h4.length; j++) {
    while (sp < h4P.highs.length && h4P.highs[sp].confirmT <= h4[j - 1].t) { lastSH = h4P.highs[sp].p; sp++; }
    while (spl < h4P.lows.length && h4P.lows[spl].confirmT <= h4[j - 1].t) { lastSL = h4P.lows[spl].p; spl++; }
    if (!(h4[j - 2].h < h4[j].l)) continue;
    if (P.keyFilter === 'bos' && !(lastSH != null && (h4[j - 1].c > lastSH || h4[j].c > lastSH))) continue;
    if (P.discount && lastSH != null && lastSL != null && h4[j].l > (lastSH + lastSL) / 2) continue;
    zones.push({ top: h4[j].l, bottom: h4[j - 2].h, dispT: h4[j - 1].t, availT: h4[j].end, expT: h4[j].end + P.zoneLifeH * HOUR, tapT: null, used: false });
  }

  const signals = [];
  const funnel = { zones: zones.length, tapped: 0, smt: 0, csd: 0, rrSkip: 0, outOfSession: 0 };
  signals.funnel = funnel;
  let zi = 0, active = [], h1k = 0, lowK = 0;
  for (let i = 30; i < e.length - 1; i++) {
    const now = e[i].end;
    while (zi < zones.length && zones[zi].availT <= now) { active.push(zones[zi]); zi++; }
    active = active.filter(z => !z.used && now <= z.expT && e[i].c >= z.bottom && (z.tapT == null || now - z.tapT <= P.armH * HOUR));
    for (const z of active) if (z.tapT == null && e[i].l <= z.top) { z.tapT = e[i].t; funnel.tapped++; }
    while (h1k < h1.length && h1[h1k].end <= now) h1k++;
    while (lowK < h1Lows.length && h1Lows[lowK].confirmT <= now) lowK++;
    const atr = atrH1[h1k - 1];
    if (atr == null) continue;

    for (const z of active) {
      if (z.tapT == null) continue;
      const tol = 0.2 * atr;
      // L1: displacement candle ke shuru se ab tak FVG ke andar bana SAB SE NEECHE wala pakka H1 swing low
      // (misaal me pehla low gap pakka hone se pehle, displacement candle ke andar hi bana tha)
      let L1 = null;
      for (let k = lowK - 1; k >= 0 && h1Lows[k].t >= z.dispT; k--) {
        const c = h1Lows[k];
        if (c.p <= z.top + tol && c.p >= z.bottom && (!L1 || c.p < L1.p)) L1 = c;
      }
      if (!L1) continue;
      // L1 ke baad ka high (H) aur us ke baad pullback ka low (L2), M5 par
      let a = i;
      while (a > 0 && e[a - 1].t >= L1.t + HOUR) a--;
      if (a >= i) continue;
      let hI = a;
      for (let k = a; k <= i; k++) if (e[k].h > e[hI].h) hI = k;
      if (hI >= i - 1) continue;
      let l2I = hI + 1;
      for (let k = hI + 1; k <= i; k++) if (e[k].l < e[l2I].l) l2I = k;
      if (l2I >= i || i - l2I > P.l2Fresh) continue;
      const L2 = e[l2I].l, H = e[hI].h;
      if (L2 > z.top + tol || L2 < z.bottom) continue;
      // 3. SMT
      const li = h1Idx.get(L1.t);
      if (li == null) continue;
      let p1 = Infinity;
      for (let k = Math.max(0, li - 1); k <= Math.min(h1p.length - 1, li + 1); k++) p1 = Math.min(p1, h1p[k].l);
      let p2 = Infinity;
      for (let k = hI; k <= i; k++) p2 = Math.min(p2, ep[k].l);
      if ((L2 > L1.p) === (p2 > p1)) continue;
      funnel.smt++;
      // 4. CSD
      let j = i - 1;
      while (j > hI && !(e[j].c < e[j].o)) j--;
      if (j <= hI || j < l2I - 3) continue;
      let s = j;
      while (s - 1 > hI && e[s - 1].c < e[s - 1].o) s--;
      const level = e[s].o;
      if (!(e[i].c > level && e[i].c > e[i].o)) continue;
      funnel.csd++;
      z.used = true;
      const nb = e[i + 1];
      const hr = new Date(nb.t).getUTCHours();
      if (nb.t - e[i].end > 30 * MIN || hr < P.sessionStartUTC || hr >= P.sessionEndUTC) { funnel.outOfSession++; break; }
      const entry = nb.o, sl = L2 - P.slBuf, tp = H, risk = entry - sl;
      const rr = (tp - entry) / risk;
      if (risk < 1.0 || risk > 3 * atr || rr < P.minRR || rr > P.maxRR) { funnel.rrSkip++; break; }
      // 5. Trade chalana
      const d0 = new Date(nb.t); d0.setUTCHours(P.closeUTC, 0, 0, 0);
      const closeT = d0.getTime() > nb.t ? d0.getTime() : d0.getTime() + 24 * HOUR;
      let exitP = null, exitT = null, reason = null, stop = sl;
      for (let k = i + 1; k < e.length; k++) {
        const b = e[k];
        if (b.t >= closeT) { exitP = b.o; exitT = b.t; reason = 'Din band'; break; }
        if (b.l <= stop) { exitP = k > i + 1 && b.o < stop ? b.o : stop; exitT = b.end; reason = stop === sl ? 'SL' : 'BE'; break; }
        if (b.h >= tp) { exitP = k > i + 1 && b.o > tp ? b.o : tp; exitT = b.end; reason = 'TP'; break; }
        if (P.be && b.h >= entry + risk) stop = Math.max(stop, entry + g.COST);
        if (k === e.length - 1) { exitP = b.c; exitT = b.end; reason = 'Data khatam'; }
      }
      if (exitP == null) break;
      signals.push({ dir: dirName, entryT: nb.t, exitT, reason, entry, sl, tp, exit: exitP, risk, rr, R: (exitP - entry - g.COST) / risk, zoneTop: z.top, zoneBottom: z.bottom, L1: L1.p, L2, H });
      break;
    }
  }
  return signals;
}

function runV2(raw, opts) {
  const P = { ...V2_DEFAULTS, ...(opts || {}) };
  let [e, ep] = g.align(raw.gold5, raw.partner5);
  if (P.partner === 'dxy') ep = g.mirror(ep); // DXY ulta chalta hai — ulta kar ke wahi SMT
  const h1 = g.resample(e, 60), h1p = g.resample(ep, 60);
  const [h1A, h1pA] = g.align(h1, h1p);
  const h4 = resampleNY(raw.gold5, 240);
  const cut = (arr) => arr.filter(x => (!P.from || x.t >= P.from) && (!P.to || x.t < P.to));
  const keep = e.map(x => (!P.from || x.t >= P.from) && (!P.to || x.t < P.to));
  const eC = e.filter((x, k) => keep[k]), epC = ep.filter((x, k) => keep[k]);
  const buys = findV2({ e: eC, ep: epC, h1: h1A, h1p: h1pA, h4 }, P, 'BUY');
  const sells = findV2({ e: g.mirror(eC), ep: g.mirror(epC), h1: g.mirror(h1A), h1p: g.mirror(h1pA), h4: g.mirror(h4) }, P, 'SELL');
  for (const s of sells) for (const k of ['entry', 'sl', 'tp', 'exit', 'zoneTop', 'zoneBottom', 'L1', 'L2', 'H']) s[k] = -s[k];
  const funnel = {}; for (const k of Object.keys(buys.funnel)) funnel[k] = buys.funnel[k] + sells.funnel[k];
  const all = buys.concat(sells).sort((a, b) => a.entryT - b.entryT);
  const trades = []; let busy = 0; const perDay = {};
  for (const s of all) {
    const day = new Date(s.entryT).toISOString().slice(0, 10);
    if (s.entryT < busy || (perDay[day] || 0) >= P.maxPerDay) continue;
    perDay[day] = (perDay[day] || 0) + 1; busy = s.exitT; trades.push(s);
  }
  let bal = P.balance, peak = bal, dd = 0;
  for (const t of trades) {
    const pnl = bal * P.riskPct / 100 * t.R; bal += pnl;
    t.pnl = +pnl.toFixed(2); t.balance = +bal.toFixed(2);
    if (bal > peak) peak = bal; dd = Math.max(dd, (peak - bal) / peak * 100);
  }
  const Rs = trades.map(t => t.R);
  const by = (fn) => { const m = {}; for (const t of trades) (m[fn(t)] = m[fn(t)] || []).push(t.R); return Object.fromEntries(Object.keys(m).sort().map(k => [k, g.stats(m[k])])); };
  return {
    params: P, funnel, stats: g.stats(Rs),
    money: { start: P.balance, end: +bal.toFixed(2), returnPct: +((bal / P.balance - 1) * 100).toFixed(2), maxDdPct: +dd.toFixed(2) },
    byDir: by(t => t.dir), byYear: by(t => new Date(t.entryT).getUTCFullYear()), byMonth: by(t => new Date(t.entryT).toISOString().slice(0, 7)),
    bySession: by(t => new Date(t.entryT).getUTCHours() < 12 ? 'London' : 'New York'), byExit: by(t => t.reason),
    avgRR: trades.length ? +(trades.reduce((a, t) => a + t.rr, 0) / trades.length).toFixed(2) : null,
    trades,
  };
}

module.exports = { runV2, V2_DEFAULTS, resampleNY, nyOffsetH };
