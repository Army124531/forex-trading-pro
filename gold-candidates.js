'use strict';
// DRAFT, UNTESTED, NOT WIRED INTO lab.js OR server.js.
// Gold London-breakout candidates for development-period testing only (2021-11-16 .. 2024-11-16).
// Holdout (2024-11-17 .. 2026-11-16) must not be used for selection.
// Same entry/SL/TP logic as goldSignals in lab.js. Only extra filters differ.
// Daily high/low come from the 1H candles (dly.D has only t and c).
// walkR is NOT exported from lab.js, so the test must run inside lab.js or walkR must be exported first.

const DAY = 86400000;

// Daily high/low/close built from the 1H candles (dly.D has only t and c).
function dailyHlc(candles) {
  const m = new Map();
  for (const c of candles) {
    const d = Math.floor(c.t / DAY) * DAY;
    const b = m.get(d);
    if (!b) m.set(d, { t: d, h: c.h, l: c.l, c: c.c });
    else { if (c.h > b.h) b.h = c.h; if (c.l < b.l) b.l = c.l; b.c = c.c; }
  }
  return m;
}

// Average true range over the `n` daily bars ending at day `dayMs` (that day itself excluded).
function dailyAtr(hlc, dayMs, n) {
  const bars = [];
  for (let k = 1; bars.length < n + 1 && k < 60; k++) {
    const b = hlc.get(dayMs - k * DAY);
    if (b) bars.unshift(b);
  }
  if (bars.length < n + 1) return null;
  let sum = 0;
  for (let k = 1; k < bars.length; k++) {
    const prev = bars[k - 1].c, cur = bars[k];
    sum += Math.max(cur.h - cur.l, Math.abs(cur.h - prev), Math.abs(cur.l - prev));
  }
  return sum / n;
}

// opts: { rr, maxHold, minRangeAtr (candidate 2), adxSeries+adxMin (candidate 1) }
// adx1h: array aligned with candles (value per 1H bar, or null). Pass null to skip candidate 1.
function goldSignalsCandidate(candles, dly, opts) {
  const { rr = 2, minRangeAtr = null, adx1h = null, adxMin = null } = opts || {};
  const hlc = dailyHlc(candles);
  const ranges = new Map();
  for (const c of candles) {
    if (new Date(c.t).getUTCHours() >= 7) continue;
    const d = Math.floor(c.t / DAY) * DAY;
    const r = ranges.get(d);
    if (!r) ranges.set(d, { hi: c.h, lo: c.l }); else { if (c.h > r.hi) r.hi = c.h; if (c.l < r.lo) r.lo = c.l; }
  }
  const done = new Set(), sigs = [];
  for (let i = 0; i < candles.length - 1; i++) {
    const c = candles[i], hour = new Date(c.t).getUTCHours();
    if (hour < 7 || hour >= 10) continue;
    const d = Math.floor(c.t / DAY) * DAY;
    if (done.has(d)) continue;
    const r = ranges.get(d);
    if (!r || !(r.hi > r.lo)) continue;
    const di = dly.idx.get(d - DAY);
    if (di == null || dly.ema200[di] == null) continue;
    const up = dly.D[di].c > dly.ema200[di];
    let dir = null;
    if (c.c > r.hi && up) dir = 'BUY';
    else if (c.c < r.lo && !up) dir = 'SELL';
    if (!dir) continue;
    // Candidate 2: Asian range must be wide enough compared with daily ATR14.
    if (minRangeAtr != null) {
      const atr = dailyAtr(hlc, d, 14);
      if (atr == null || !(r.hi - r.lo >= minRangeAtr * atr)) continue;
    }
    // Candidate 1: 1H ADX filter.
    if (adx1h != null && adxMin != null) {
      const a = adx1h[i];
      if (a == null || a < adxMin) continue;
    }
    const slDist = dir === 'BUY' ? c.c - r.lo : r.hi - c.c;
    if (!(slDist > 0)) continue;
    done.add(d);
    sigs.push({ i, dir, slDist, tpDist: rr * slDist });
  }
  return sigs;
}

module.exports = { goldSignalsCandidate, dailyAtr };
