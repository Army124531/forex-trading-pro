// Gold scalping — 3 mashhoor tareeqe, pehle se pakke rules, 1-minute data par backtest.
// SIRF research. Website / live engine se koi talluq nahi.
//   A. NY Opening Range Breakout (M1): 09:30–09:45 NY ka range, bahar M1 close par entry,
//      SL range ki doosri taraf, TP 1.5R, 11:30 NY tak band. Din me 1 trade.
//   B. London Asian-range sweep (M5): Asia range 00:00–07:00 UTC. 07:00–10:00 UTC me price range ke
//      bahar jaye aur M5 close wapas andar ho → ulti taraf. SL sweep extreme + $0.5, TP range ka beech
//      (RR kam az kam 1). 12:00 UTC tak band. Din me 1 trade.
//   C. EMA pullback (M5): EMA9 > EMA21 > EMA50 (BUY; SELL ulta). Low EMA21 ko chhuye, phir close EMA9 ke
//      oopar → entry. SL pichle 5 candles ka low − $0.5, TP 1.5R. 07:00–17:00 UTC, 20:00 UTC band. Din me max 3.
// Usool: entry agli candle ke open par; SL aur TP aik hi candle me → SL; har trade se spread kaata jata hai.
'use strict';
const g = require('../../goldsmt');
const { nyOffsetH } = require('../../goldsmt_v3');
const MIN = 60000, HOUR = 60 * MIN, DAY = 24 * HOUR;

function emaArr(v, n) { const k = 2 / (n + 1); const o = new Array(v.length).fill(null); let p = null; for (let i = 0; i < v.length; i++) { p = p == null ? v[i] : v[i] * k + p * (1 - k); if (i >= n - 1) o[i] = p; } return o; }

// Aik trade ka nateeja M1 candles par (entryIdx se), SL pehle
function walk(m1, startIdx, dir, entry, sl, tp, endT, cost) {
  const risk = Math.abs(entry - sl);
  for (let k = startIdx; k < m1.length; k++) {
    const b = m1[k];
    if (b.t >= endT) return { exit: b.o, exitT: b.t, reason: 'Waqt khatam', R: ((b.o - entry) * dir - cost) / risk };
    const hitSL = dir > 0 ? b.l <= sl : b.h >= sl;
    const hitTP = dir > 0 ? b.h >= tp : b.l <= tp;
    if (hitSL) { const px = k > startIdx && (dir > 0 ? b.o < sl : b.o > sl) ? b.o : sl; return { exit: px, exitT: b.end, reason: 'SL', R: ((px - entry) * dir - cost) / risk }; }
    if (hitTP) { const px = k > startIdx && (dir > 0 ? b.o > tp : b.o < tp) ? b.o : tp; return { exit: px, exitT: b.end, reason: 'TP', R: ((px - entry) * dir - cost) / risk }; }
  }
  return null;
}
const idxAt = (arr, t) => { let lo = 0, hi = arr.length - 1, ans = arr.length; while (lo <= hi) { const m = (lo + hi) >> 1; if (arr[m].t >= t) { ans = m; hi = m - 1; } else lo = m + 1; } return ans; };
const dayKey = (t) => new Date(t).toISOString().slice(0, 10);

// ---------- A: NY Opening Range Breakout ----------
function stratA(m1, cost, P = {}) {
  const tpR = P.tpR || 1.5, out = [];
  const h1 = g.resample(m1, 60), atr = g.atrArr(h1, 14);
  const days = new Set(m1.map(b => dayKey(b.t)));
  for (const d of days) {
    const d0 = Date.parse(d + 'T00:00:00Z');
    const off = nyOffsetH(d0 + 14 * HOUR) * HOUR;
    const open = d0 + 9.5 * HOUR + off, rEnd = open + 15 * MIN, stop = d0 + 11.5 * HOUR + off;
    const a = idxAt(m1, open), b = idxAt(m1, rEnd);
    if (b - a < 12) continue; // range ke liye data poora nahi
    let hi = -Infinity, lo = Infinity;
    for (let k = a; k < b; k++) { hi = Math.max(hi, m1[k].h); lo = Math.min(lo, m1[k].l); }
    const hk = idxAt(h1, open) - 1, A = hk >= 0 ? atr[hk] : null;
    if (A == null || hi - lo < 0.3 * A || hi - lo > 1.5 * A) continue;
    for (let k = b; k < m1.length - 1 && m1[k].t < stop; k++) {
      const c = m1[k].c, dir = c > hi ? 1 : c < lo ? -1 : 0;
      if (!dir) continue;
      const entry = m1[k + 1].o, sl = dir > 0 ? lo : hi, risk = (entry - sl) * dir;
      if (risk <= 0.5) break;
      const r = walk(m1, k + 1, dir, entry, sl, entry + dir * tpR * risk, stop, cost);
      if (r) out.push({ s: 'A', dir: dir > 0 ? 'BUY' : 'SELL', entryT: m1[k + 1].t, entry, sl, risk, ...r });
      break;
    }
  }
  return out;
}

// ---------- B: London Asian-range sweep ----------
function stratB(m1, cost) {
  const m5 = g.resample(m1, 5), out = [];
  const days = new Set(m1.map(b => dayKey(b.t)));
  for (const d of days) {
    const d0 = Date.parse(d + 'T00:00:00Z');
    const a = idxAt(m5, d0), b = idxAt(m5, d0 + 7 * HOUR), e = idxAt(m5, d0 + 10 * HOUR);
    if (b - a < 60) continue;
    let hi = -Infinity, lo = Infinity;
    for (let k = a; k < b; k++) { hi = Math.max(hi, m5[k].h); lo = Math.min(lo, m5[k].l); }
    const mid = (hi + lo) / 2;
    let sweptHi = null, sweptLo = null;
    for (let k = b; k < e && k < m5.length - 1; k++) {
      const x = m5[k];
      if (x.h > hi) sweptHi = Math.max(sweptHi == null ? -Infinity : sweptHi, x.h);
      if (x.l < lo) sweptLo = Math.min(sweptLo == null ? Infinity : sweptLo, x.l);
      let dir = 0, sl;
      if (sweptHi != null && x.c < hi) { dir = -1; sl = sweptHi + 0.5; }
      else if (sweptLo != null && x.c > lo) { dir = 1; sl = sweptLo - 0.5; }
      if (!dir) continue;
      const entry = m5[k + 1].o, risk = (entry - sl) * dir, rew = (mid - entry) * dir;
      if (risk <= 0.5 || rew < risk) break;
      const mi = idxAt(m1, m5[k + 1].t);
      const r = walk(m1, mi, dir, entry, sl, mid, d0 + 12 * HOUR, cost);
      if (r) out.push({ s: 'B', dir: dir > 0 ? 'BUY' : 'SELL', entryT: m5[k + 1].t, entry, sl, risk, ...r });
      break;
    }
  }
  return out;
}

// ---------- C: EMA pullback ----------
function stratC(m1, cost, P = {}) {
  const tpR = P.tpR || 1.5, m5 = g.resample(m1, 5), out = [];
  const cl = m5.map(b => b.c), e9 = emaArr(cl, 9), e21 = emaArr(cl, 21), e50 = emaArr(cl, 50);
  let busy = 0; const per = {};
  for (let k = 60; k < m5.length - 1; k++) {
    const x = m5[k], hr = new Date(m5[k + 1].t).getUTCHours();
    if (hr < 7 || hr >= 17 || m5[k + 1].t < busy) continue;
    const dk = dayKey(x.t); if ((per[dk] || 0) >= 3) continue;
    let dir = 0;
    const up = e9[k] > e21[k] && e21[k] > e50[k], dn = e9[k] < e21[k] && e21[k] < e50[k];
    const touchedUp = m5[k - 1].l <= e21[k - 1] || x.l <= e21[k];
    const touchedDn = m5[k - 1].h >= e21[k - 1] || x.h >= e21[k];
    if (up && touchedUp && x.c > e9[k] && x.c > x.o && x.l > e50[k]) dir = 1;
    else if (dn && touchedDn && x.c < e9[k] && x.c < x.o && x.h < e50[k]) dir = -1;
    if (!dir) continue;
    let ext = dir > 0 ? Infinity : -Infinity;
    for (let j = k - 4; j <= k; j++) ext = dir > 0 ? Math.min(ext, m5[j].l) : Math.max(ext, m5[j].h);
    const entry = m5[k + 1].o, sl = ext - dir * 0.5, risk = (entry - sl) * dir;
    if (risk <= 0.5) continue;
    const d0 = Date.parse(dk + 'T00:00:00Z');
    const r = walk(m1, idxAt(m1, m5[k + 1].t), dir, entry, sl, entry + dir * tpR * risk, d0 + 20 * HOUR, cost);
    if (!r) continue;
    out.push({ s: 'C', dir: dir > 0 ? 'BUY' : 'SELL', entryT: m5[k + 1].t, entry, sl, risk, ...r });
    busy = r.exitT; per[dk] = (per[dk] || 0) + 1;
  }
  return out;
}

module.exports = { stratA, stratB, stratC };
