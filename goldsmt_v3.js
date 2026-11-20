// Forex Trading Pro — Gold SMT Intraday backtest, VERSION 3 (malik ki do asal trades ke mutabiq)
// SIRF research: live engine / website se koi talluq nahi.
//
// V3 = V2 + malik ki doosri misaal (SELL, 2 Jan 2026): H4 ne range low (SSL) sweep kar ke CSD kiya,
// objective range high 4404. Price 4401.9 tak gayi (failure swing — high tak nahi pahunchi), H1 par
// Gold higher high / Silver lower high (SMT). M3 CSD + aakhri leg ka E.Q (50%) bhi toota → SELL 4392.3,
// SL high ke oopar, TP Asia ka H1 swing low (~4371). Naye rules:
//   - Key level ki doosri qism: H4 range high/low (pichla pakka H4 swing) — price us ke qareeb palte.
//   - E.Q invalidation: CSD wali close aakhri leg (L2 aur us se pehle ke entry-TF swing) ke 50% se aage ho.
//   - TP: entry ke waqt ka sab se taaza pakka H1 swing, opposite side par (dono misaalon me sahi).
//   - Entry timeframe M3 ya M5 (1-minute data se).
//
// --- V2 ka asal bayan: ---
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

const V3_DEFAULTS = {
  entryMin: 3,         // entry timeframe (M3; M5 bhi)
  keyTypes: 'both',    // 'fvg' (H4 gap) | 'range' (H4 range high/low) | 'both'
  rangeTol: 1.0,       // range level ke dono taraf kitne H1 ATR tak 'qareeb'
  rangeCtx: true,      // range level tabhi objective jab doosri taraf sweep + H4 close wapas range me (SSL sweep + CSD)
  maxTries: 2,         // aik zone par zyada se zyada itni trades
  eq: true,            // E.Q invalidation har trade par zaroori
  eqMode: null,        // 'hrlr' = E.Q sirf jab aakhri leg choppy (HRLR) ho; null = 'eq' wali setting
  hrlrEff: 0.3,        // (purana 'hrlr') leg ki seedhi chaal / candles ki kul range — is se kam
  hrlrAtr: 1.0,        // 'fast': malik ki definition — HRLR = tez + bari expansion: leg >= itne H1 ATR...
  hrlrMaxMin: 60,      // ...aur itne minute ke andar bani ho
  smtWith: 'p1',       // 'p1' (sirf pehla partner) | 'both' (Silver + DXY dono) | 'either'
  smtMinPct: 0,        // strength SMT: Gold aur partner ki chaal me kam az kam itna % farq
  fvgMinAtr: 0,        // H4 gap ka size kam az kam itne H4 ATR
  keyMin: 240,         // key level (FVG) ka timeframe minute me: 240 = H4, 60 = H1, 15 = M15
  smtMin: 60,          // SMT / swings / TP ka timeframe minute me: 60 = H1, 15 = M15, 5 = M5
  liqTol: 0.5,         // PDH/PDL aur Asia high/low ke dono taraf kitne SMT-TF ATR tak 'qareeb'
  tpMode: 'h1swing',   // 'h1swing' (taaza H1 swing) | 'between' (V2: dono lows ke beech ka high)
  partner: 'silver',   // 'silver' | 'dxy'
  keyFilter: 'bos',    // 'bos' | 'any'
  discount: false,     // true = FVG H4 dealing range ke discount me ho
  zoneLifeH: 120,      // FVG kitne ghante zinda (5 din)
  armH: 48,            // tap ke baad setup kitni der tak dhoonda jaye
  minRR: 1.0,
  maxRR: 99,
  slBuf: 0.5,          // $ — SL, L2 se itna neeche
  l2FreshMin: 60,      // L2 zyada se zyada itne minute purana ho
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

function findV3(D, P, dirName) {
  const { e, ep, h1, h1p, h4, ep2, h1p2 } = D;
  const atrH4 = g.atrArr(h4, 14);
  const atrH1 = g.atrArr(h1, 14);
  const h4P = g.pivots(h4, 2);
  const h1Piv = g.pivots(h1, 1);
  const h1Lows = h1Piv.lows, h1Highs = h1Piv.highs;
  const eHighs = g.pivots(e, 2).highs;
  const atrAt = (t) => { let lo = 0, hi = h1.length - 1, k = -1; while (lo <= hi) { const m = (lo + hi) >> 1; if (h1[m].end <= t) { k = m; lo = m + 1; } else hi = m - 1; } return k >= 0 ? atrH1[k] : null; };
  const h1Idx = new Map(h1.map((b, k) => [b.t, k]));

  // 1. Key levels. keyTypes: 'fvg' | 'range' | 'both' | 'pdl' (pichle din ka low/high) | 'asia' (Asia session low/high)
  const useFvg = P.keyTypes === 'fvg' || P.keyTypes === 'both';
  const useRange = P.keyTypes === 'range' || P.keyTypes === 'both';
  const zones = [];
  let sp = 0, lastSH = null, lastSL = null, spl = 0;
  for (let j = 2; j < h4.length; j++) {
    while (sp < h4P.highs.length && h4P.highs[sp].confirmT <= h4[j - 1].t) { lastSH = h4P.highs[sp].p; sp++; }
    while (spl < h4P.lows.length && h4P.lows[spl].confirmT <= h4[j - 1].t) { lastSL = h4P.lows[spl].p; spl++; }
    if (!useFvg) continue;
    if (!(h4[j - 2].h < h4[j].l)) continue;
    if (P.fvgMinAtr > 0 && !(atrH4[j - 1] != null && h4[j].l - h4[j - 2].h >= P.fvgMinAtr * atrH4[j - 1])) continue;
    if (P.keyFilter === 'bos' && !(lastSH != null && (h4[j - 1].c > lastSH || h4[j].c > lastSH))) continue;
    if (P.discount && lastSH != null && lastSL != null && h4[j].l > (lastSH + lastSL) / 2) continue;
    zones.push({ kind: (P.keyMin === 240 ? 'H4' : P.keyMin === 60 ? 'H1' : 'M' + P.keyMin) + ' FVG', top: h4[j].l, bottom: h4[j - 2].h, dispT: h4[j - 1].t, availT: h4[j].end, expT: h4[j].end + P.zoneLifeH * HOUR, tapT: null, used: false, tries: 0 });
  }
  // Key level ki doosri qism: H4 range low (pakka H4 swing low) — agla swing low pakka hone tak
  if (useRange) {
    const L = h4P.lows;
    const Hs = h4P.highs;
    for (let k = 0; k < L.length; k++) {
      const a = atrAt(L[k].confirmT);
      if (a == null) continue;
      const next = k + 1 < L.length ? L[k + 1].confirmT : Infinity;
      const expT = Math.min(next, L[k].confirmT + P.zoneLifeH * HOUR);
      let availT = L[k].confirmT;
      if (P.rangeCtx) {
        // Doosri taraf (range high) — is low ke pakka hone tak ka aakhri pakka H4 swing high
        let opp = null;
        for (const hp of Hs) { if (hp.confirmT <= L[k].confirmT) opp = hp.p; else break; }
        if (opp == null) continue;
        // Us high ka sweep, phir H4 close wapas us ke neeche (CSD) — tab ye low objective banta hai
        let swept = false; availT = null;
        for (let j = 0; j < h4.length; j++) {
          if (h4[j].t < L[k].confirmT) continue;
          if (h4[j].end > expT) break;
          if (h4[j].c < L[k].p) break; // objective pehle hi paar
          if (!swept && h4[j].h > opp) swept = true;
          if (swept && h4[j].c < opp) { availT = h4[j].end; break; }
        }
        if (availT == null) continue;
      }
      zones.push({ kind: 'H4 range', top: L[k].p + P.rangeTol * a, bottom: L[k].p - P.rangeTol * a, level: L[k].p, dispT: availT, availT, expT, tapT: null, used: false, tries: 0 });
    }
    zones.sort((x, y) => x.availT - y.availT);
  }
  // Liquidity levels: pichle (NY) din ka low, ya aaj ke Asia session (00:00–07:00 UTC) ka low. Sweep ke baad palatna.
  if (P.keyTypes === 'pdl') {
    const d1 = resampleNY(e, 1440);
    for (const d of d1) { const a = atrAt(d.end); if (a == null) continue; zones.push({ kind: 'PDL', top: d.l + P.liqTol * a, bottom: d.l - P.liqTol * a, level: d.l, dispT: d.end, availT: d.end, expT: d.end + 24 * HOUR, tapT: null, used: false, tries: 0 }); }
  }
  if (P.keyTypes === 'asia') {
    const byDay = new Map();
    for (const b of e) { const t0 = Math.floor(b.t / (24 * HOUR)) * 24 * HOUR; if (b.t - t0 >= 7 * HOUR) continue; const cur = byDay.get(t0); if (!cur) byDay.set(t0, { l: b.l, n: 1 }); else { cur.l = Math.min(cur.l, b.l); cur.n++; } }
    for (const [t0, v] of byDay) { if (v.n < 20) continue; const at = t0 + 7 * HOUR, a = atrAt(at); if (a == null) continue; zones.push({ kind: 'Asia low', top: v.l + P.liqTol * a, bottom: v.l - P.liqTol * a, level: v.l, dispT: at, availT: at, expT: t0 + 17 * HOUR, tapT: null, used: false, tries: 0 }); }
  }
  zones.sort((x, y) => x.availT - y.availT);

  const signals = [];
  const funnel = { zones: zones.length, tapped: 0, smt: 0, csd: 0, rrSkip: 0, outOfSession: 0 };
  signals.funnel = funnel;
  let zi = 0, active = [], h1k = 0, lowK = 0, highK = 0, eHK = 0;
  for (let i = 30; i < e.length - 1; i++) {
    const now = e[i].end;
    while (zi < zones.length && zones[zi].availT <= now) { active.push(zones[zi]); zi++; }
    active = active.filter(z => !z.used && now <= z.expT && e[i].c >= z.bottom && (z.tapT == null || now - z.tapT <= P.armH * HOUR));
    for (const z of active) if (z.tapT == null && e[i].l <= z.top) { z.tapT = e[i].t; funnel.tapped++; }
    while (h1k < h1.length && h1[h1k].end <= now) h1k++;
    while (lowK < h1Lows.length && h1Lows[lowK].confirmT <= now) lowK++;
    while (highK < h1Highs.length && h1Highs[highK].confirmT <= now) highK++;
    while (eHK < eHighs.length && eHighs[eHK].confirmT <= now) eHK++;
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
      while (a > 0 && e[a - 1].t >= L1.t + P.smtMin * MIN) a--;
      if (a >= i) continue;
      let hI = a;
      for (let k = a; k <= i; k++) if (e[k].h > e[hI].h) hI = k;
      if (hI >= i - 1) continue;
      let l2I = hI + 1;
      for (let k = hI + 1; k <= i; k++) if (e[k].l < e[l2I].l) l2I = k;
      if (l2I >= i || e[i].t - e[l2I].t > P.l2FreshMin * MIN) continue;
      const L2 = e[l2I].l, H = e[hI].h;
      if (z.lastL2T != null && e[l2I].t <= z.lastL2T) continue; // pichli koshish wala hi low dobara nahi
      if (L2 > z.top + tol || L2 < z.bottom) continue;
      // 3. SMT
      const li = h1Idx.get(L1.t);
      if (li == null) continue;
      const smt = (pe, ph) => {
        let p1 = Infinity, p2 = Infinity;
        for (let k = Math.max(0, li - 1); k <= Math.min(ph.length - 1, li + 1); k++) p1 = Math.min(p1, ph[k].l);
        for (let k = hI; k <= i; k++) p2 = Math.min(p2, pe[k].l);
        return { div: (L2 > L1.p) !== (p2 > p1), str: Math.abs((L2 - L1.p) / Math.abs(L1.p) - (p2 - p1) / Math.abs(p1)) * 100 };
      };
      const s1 = smt(ep, h1p);
      let ok = s1.div, str = s1.div ? s1.str : 0;
      if (P.smtWith !== 'p1') {
        const s2 = smt(ep2, h1p2);
        ok = P.smtWith === 'both' ? s1.div && s2.div : s1.div || s2.div;
        str = Math.max(s1.div ? s1.str : 0, s2.div ? s2.str : 0);
      }
      if (!ok || str < P.smtMinPct) continue;
      funnel.smt++;
      // 4. CSD
      let j = i - 1;
      while (j > hI && !(e[j].c < e[j].o)) j--;
      if (j <= hI || j < l2I - 3) continue;
      let s = j;
      while (s - 1 > hI && e[s - 1].c < e[s - 1].o) s--;
      const level = e[s].o;
      if (!(e[i].c > level && e[i].c > e[i].o)) continue;
      // E.Q invalidation: aakhri leg (L2 se pehle ka entry-TF swing high → L2) ka 50% bhi paar ho
      const eqMode = P.eqMode || (P.eq ? 'always' : 'off');
      if (eqMode !== 'off') {
        let k = eHK - 1;
        while (k >= 0 && eHighs[k].i >= l2I) k--;
        let need = true;
        if (eqMode === 'hrlr' && k >= 0) { // purana tajurba: leg choppy ho tab E.Q
          let path = 0;
          for (let x = eHighs[k].i; x <= l2I; x++) path += e[x].h - e[x].l;
          need = path > 0 && (eHighs[k].p - L2) / path < P.hrlrEff;
        }
        if (eqMode === 'fast' && k >= 0) { // HRLR = tez + bari expansion (malik ki definition): tab hi E.Q chahiye
          need = (eHighs[k].p - L2) >= P.hrlrAtr * atr && (e[l2I].t - e[eHighs[k].i].t) <= P.hrlrMaxMin * MIN;
        }
        if (need && (k < 0 || !(e[i].c > (eHighs[k].p + L2) / 2))) continue;
      }
      funnel.csd++;
      z.tries++; z.lastL2T = e[l2I].t; if (z.tries >= P.maxTries) z.used = true;
      z.tapT = e[i].t; // nayi koshish ke liye L1 ab is ke baad
      const nb = e[i + 1];
      const hr = new Date(nb.t).getUTCHours();
      if (nb.t - e[i].end > 30 * MIN || hr < P.sessionStartUTC || hr >= P.sessionEndUTC) { funnel.outOfSession++; break; }
      const entry = nb.o, sl = L2 - P.slBuf;
      let tp = H;
      if (P.tpMode === 'h1swing') {
        tp = null;
        for (let k = highK - 1; k >= 0 && h1Highs[k].t >= now - 72 * HOUR; k--) if (h1Highs[k].p > entry) { tp = h1Highs[k].p; break; }
        if (tp == null) { funnel.rrSkip++; break; }
      }
      const risk = entry - sl;
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
      signals.push({ dir: dirName, kind: z.kind, entryT: nb.t, exitT, reason, entry, sl, tp, exit: exitP, risk, rr, R: (exitP - entry - g.COST) / risk, zoneTop: z.top, zoneBottom: z.bottom, L1: L1.p, L2, H });
      break;
    }
  }
  return signals;
}

function runV3(raw, opts) {
  const P = { ...V3_DEFAULTS, ...(opts || {}) };
  let [e, ep] = g.align(g.resample(raw.gold1, P.entryMin), g.resample(raw.partner1, P.entryMin));
  if (P.partner === 'dxy') ep = g.mirror(ep); // DXY ulta chalta hai — ulta kar ke wahi SMT
  let ep2 = null;
  if (P.smtWith !== 'p1') { // doosra partner (DXY, ulta) — teeno ki common candles
    const m2 = new Map(g.resample(raw.partner2, P.entryMin).map(x => [x.t, x]));
    const keep2 = e.map(x => m2.has(x.t));
    e = e.filter((x, k) => keep2[k]); ep = ep.filter((x, k) => keep2[k]);
    ep2 = g.mirror(e.map(x => m2.get(x.t)));
  }
  const h1 = g.resample(e, P.smtMin), h1p = g.resample(ep, P.smtMin);
  let [h1A, h1pA] = g.align(h1, h1p);
  let h1p2A = null;
  if (ep2) { const m = new Map(g.resample(ep2, P.smtMin).map(x => [x.t, x])); const kp = h1A.map(x => m.has(x.t)); h1A = h1A.filter((x, k) => kp[k]); h1pA = h1pA.filter((x, k) => kp[k]); h1p2A = h1A.map(x => m.get(x.t)); }
  const h4 = resampleNY(raw.gold1, P.keyMin);
  const cut = (arr) => arr.filter(x => (!P.from || x.t >= P.from) && (!P.to || x.t < P.to));
  const keep = e.map(x => (!P.from || x.t >= P.from) && (!P.to || x.t < P.to));
  const eC = e.filter((x, k) => keep[k]), epC = ep.filter((x, k) => keep[k]);
  const ep2C = ep2 ? ep2.filter((x, k) => keep[k]) : null;
  const buys = findV3({ e: eC, ep: epC, h1: h1A, h1p: h1pA, h4, ep2: ep2C, h1p2: h1p2A }, P, 'BUY');
  const sells = findV3({ e: g.mirror(eC), ep: g.mirror(epC), h1: g.mirror(h1A), h1p: g.mirror(h1pA), h4: g.mirror(h4), ep2: ep2C && g.mirror(ep2C), h1p2: h1p2A && g.mirror(h1p2A) }, P, 'SELL');
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

module.exports = { runV3, V3_DEFAULTS, resampleNY, nyOffsetH };
