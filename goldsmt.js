// Forex Trading Pro — Gold SMT Intraday backtest (v12.0)
// SIRF research: ye file live signal engine ko nahi chhooti, koi signal ya setting nahi badalti.
//
// Strategy (har step ka pakka rule — aankh se parhne wali cheez ko code ka rule banaya gaya hai):
//   1. Dealing range (H4): H4 ka aakhri pakka swing high aur swing low (fractal, 2 candles dono taraf).
//      Range ka beech (50%) = equilibrium. Neeche "discount" (sirf BUY), oopar "premium" (sirf SELL).
//   2. Key level (H4/H1): discount me bullish FVG (H4 ya H1) ya pichle din ka low (PDL).
//      Premium me bearish FVG ya pichle din ka high (PDH).
//   3. Tap: M5 candle key level ko chhoo le. Har key level se sirf aik setup.
//   4. Qualified swing + 2-stage SMT (Gold vs Silver):
//        Stage 1 (M30): tap ke baad bana swing low, key level ke andar/qareeb. Us par SMT:
//                       Gold lower low aur Silver higher low (ya ulta). Gold ka ye low = protected low.
//        Stage 2 (M5):  isi low par M5 par bhi SMT, aur protected low toota na ho.
//   5. CSD (M5): protected low ke baad pichli bearish candles ki series ke open ke oopar close.
//      Entry agli M5 candle ke open par. SL protected low ke neeche. SELL bilkul ulta.
//   6. Intraday: entry sirf 07:00–17:00 UTC (12:00–22:00 PKT, London + New York), 20:00 UTC
//      (01:00 PKT) par har khuli trade band. Din me zyada se zyada 2 trades, aik waqt me aik.
//
// Imaandari ke usool (lab.js wale hi):
//   - Asal candles (Yahoo Finance: GC=F gold futures, SI=F silver futures).
//   - Har swing tabhi gina jata hai jab woh pakka ho chuka ho (aage ka data nahi dekha jata).
//   - Har trade se spread + slippage ($0.30) kaata jata hai.
//   - Aik hi candle me SL aur TP dono lagein to SL gina jata hai.
//   - Settings pehle se tay ki gayi hain, nateeje dekh kar nahi chuni gayin.
'use strict';

const MIN = 60000;
const HOUR = 60 * MIN;
const COST = 0.30; // lab.js LAB_COST.XAUUSD jaisa

const DEFAULTS = {
  entryMin: 5,          // entry / stage-2 timeframe (M5; M3 bhi chal sakta hai)
  tp: '2R',             // '1.5R' | '2R' | '3R' | 'liq' (agla M30 swing) | 'eod' (sirf din ke aakhir tak)
  smt: 2,               // 2 = dono stages, 1 = sirf M30, 0 = SMT ke baghair (muqable ke liye)
  sessionStartUTC: 7,
  sessionEndUTC: 17,
  closeUTC: 20,
  maxPerDay: 2,
  keyTypes: 'all',      // 'all' | 'fvg' (sirf FVG) | 'pd' (sirf PDH/PDL)
  trend: 'none',        // 'none' | 'h4' (sirf H4 structure ki simt me)
  csdBody: 0,           // CSD candle ki body, range ka kam az kam itna hissa (0–1)
  be: false,            // 1R par SL entry par (break-even)
  maxRiskAtr: 3,        // SL zyada se zyada itne M30 ATR
  balance: 10000,
  riskPct: 1,
};

// ---------------- Candles ----------------
function fromYahoo(json, ivMin) {
  const r = json && json.chart && json.chart.result && json.chart.result[0];
  if (!r || !r.timestamp) return [];
  const q = r.indicators.quote[0];
  const out = [];
  for (let i = 0; i < r.timestamp.length; i++) {
    const o = q.open[i], h = q.high[i], l = q.low[i], c = q.close[i];
    if (o == null || h == null || l == null || c == null || !(h >= l) || c <= 0) continue;
    const t = r.timestamp[i] * 1000;
    if (t % (ivMin * MIN) !== 0) continue; // adhuri (abhi chal rahi) candle
    out.push({ t, end: t + ivMin * MIN, o, h, l, c });
  }
  return out;
}
// Gold aur Silver ki sirf wo candles jo dono me hon — taake index aik doosre se milte rahein.
function align(a, b) {
  const mb = new Map(b.map(x => [x.t, x]));
  const ga = [], sb = [];
  for (const x of a) { const y = mb.get(x.t); if (y) { ga.push(x); sb.push(y); } }
  return [ga, sb];
}
function resample(c, ivMin) {
  const iv = ivMin * MIN, out = [];
  let cur = null;
  for (const x of c) {
    const t = Math.floor(x.t / iv) * iv;
    if (!cur || cur.t !== t) { cur = { t, end: t + iv, o: x.o, h: x.h, l: x.l, c: x.c, last: x.end }; out.push(cur); }
    else { cur.h = Math.max(cur.h, x.h); cur.l = Math.min(cur.l, x.l); cur.c = x.c; cur.last = x.end; }
  }
  // Aakhri bucket adhura ho to hata dein
  if (out.length && out[out.length - 1].last < out[out.length - 1].end) out.pop();
  return out;
}
function atrArr(b, n) {
  const out = new Array(b.length).fill(null);
  let a = null;
  for (let i = 1; i < b.length; i++) {
    const tr = Math.max(b[i].h - b[i].l, Math.abs(b[i].h - b[i - 1].c), Math.abs(b[i].l - b[i - 1].c));
    if (i < n) { a = (a || 0) + tr / n; if (i === n - 1) out[i] = a; continue; }
    a = a == null ? tr : (a * (n - 1) + tr) / n;
    out[i] = a;
  }
  return out;
}
// Fractal swings. confirmT = jis waqt swing pakka hua (k candles baad).
function pivots(b, k) {
  const highs = [], lows = [];
  for (let i = k; i < b.length - k; i++) {
    let isH = true, isL = true;
    for (let j = 1; j <= k; j++) {
      if (!(b[i].h > b[i - j].h && b[i].h >= b[i + j].h)) isH = false;
      if (!(b[i].l < b[i - j].l && b[i].l <= b[i + j].l)) isL = false;
    }
    if (isH) highs.push({ i, t: b[i].t, p: b[i].h, confirmT: b[i + k].end });
    if (isL) lows.push({ i, t: b[i].t, p: b[i].l, confirmT: b[i + k].end });
  }
  return { highs, lows };
}
// SELL ko BUY jaisa parhne ke liye chart ulta (price * -1, high/low badal kar).
function mirror(b) { return b.map(x => ({ t: x.t, end: x.end, o: -x.o, h: -x.l, l: -x.h, c: -x.c })); }

function stats(rs) {
  const n = rs.length;
  if (!n) return { n: 0, winRate: null, avgR: null, pf: null, netR: 0, maxDdR: 0 };
  let sum = 0, gw = 0, gl = 0, wins = 0, eq = 0, peak = 0, dd = 0;
  for (const r of rs) { sum += r; if (r > 0) { gw += r; wins++; } else gl -= r; eq += r; if (eq > peak) peak = eq; if (peak - eq > dd) dd = peak - eq; }
  return { n, winRate: +(wins / n * 100).toFixed(1), avgR: +(sum / n).toFixed(3), pf: gl ? +(gw / gl).toFixed(2) : null, netR: +sum.toFixed(2), maxDdR: +dd.toFixed(2) };
}

// SMT: Gold ke do swing lows (A1, A2) ke waqt Silver ke lows (±1 candle) se muqabla.
function smtAt(A1, A2, silver) {
  const sLow = (i) => Math.min(...[i - 1, i, i + 1].filter(j => j >= 0 && j < silver.length).map(j => silver[j].l));
  const s1 = sLow(A1.i), s2 = sLow(A2.i);
  const goldLL = A2.p < A1.p, silverLL = s2 < s1;
  return goldLL !== silverLL;
}

// ---------------- Setup dhoondna (aik taraf; SELL ke liye mirrored data aata hai) ----------------
function findSignals(D, P, dirName) {
  const { e, es, m, ms, h1, h4 } = D;
  const atrE = atrArr(e, 14), atrM = atrArr(m, 14), atrH1 = atrArr(h1, 14);
  const h4P = pivots(h4, 2), mP = pivots(m, 2), eP = pivots(e, 2);

  // Key levels: bullish FVG (H1/H4) + pichle din ka low
  const zones = [];
  const addFvg = (b, tf, life) => {
    for (let j = 2; j < b.length; j++) {
      if (b[j - 2].h < b[j].l) zones.push({ kind: tf + ' FVG', top: b[j].l, bottom: b[j - 2].h, availT: b[j].end, expT: b[j].end + life });
    }
  };
  if (P.keyTypes !== 'pd') { addFvg(h1, 'H1', 3 * 24 * HOUR); addFvg(h4, 'H4', 10 * 24 * HOUR); }
  if (P.keyTypes !== 'fvg') { // PDL — UTC din ke hisaab se, H1 candles se
    let day = null, lo = Infinity, lastJ = -1;
    for (let j = 0; j < h1.length; j++) {
      const d = Math.floor(h1[j].t / (24 * HOUR));
      if (day !== null && d !== day && lastJ >= 0) {
        const a = atrH1[lastJ] || 0;
        zones.push({ kind: dirName === 'BUY' ? 'PDL' : 'PDH', top: lo, bottom: lo - a, availT: h1[lastJ].end, expT: h1[lastJ].end + 24 * HOUR });
        lo = Infinity;
      }
      day = d; lo = Math.min(lo, h1[j].l); lastJ = j;
    }
  }
  zones.sort((a, b) => a.availT - b.availT);

  const signals = [];
  const funnel = { tap: 0, stage1: 0, stage2: 0, csd: 0, outOfSession: 0, badRisk: 0, expired: 0, broken: 0 };
  signals.funnel = funnel;
  let zi = 0, hpI = 0, lpI = 0;
  let rangeH = null, rangeL = null;
  let active = [];
  let st = null; // armed setup
  let mIdx = 0, mAtr = null, h1Idx = 0, h4Idx = 0, bias = 0;
  const lastConfirmed = (list, now, upto) => { // aakhri do pakke swings (index list se)
    let k = upto;
    while (k < list.length && list[k].confirmT <= now) k++;
    return k;
  };
  let mLowK = 0, eLowK = 0, mHighK = 0;

  for (let i = 15; i < e.length - 1; i++) {
    const now = e[i].end;
    // Dealing range (H4)
    while (hpI < h4P.highs.length && h4P.highs[hpI].confirmT <= now) { rangeH = h4P.highs[hpI].p; hpI++; }
    while (lpI < h4P.lows.length && h4P.lows[lpI].confirmT <= now) { rangeL = h4P.lows[lpI].p; lpI++; }
    while (mIdx < m.length && m[mIdx].end <= now) { mAtr = atrM[mIdx] != null ? atrM[mIdx] : mAtr; mIdx++; }
    while (h1Idx < h1.length && h1[h1Idx].end <= now) h1Idx++;
    while (h4Idx < h4.length && h4[h4Idx].end <= now) {
      if (rangeH != null && h4[h4Idx].c > rangeH) bias = 1; else if (rangeL != null && h4[h4Idx].c < rangeL) bias = -1;
      h4Idx++;
    }
    mLowK = lastConfirmed(mP.lows, now, mLowK);
    mHighK = lastConfirmed(mP.highs, now, mHighK);
    eLowK = lastConfirmed(eP.lows, now, eLowK);
    if (rangeH == null || rangeL == null || rangeH <= rangeL || mAtr == null || atrE[i] == null) continue;
    const eq = (rangeH + rangeL) / 2;

    // Key levels ki zindagi
    while (zi < zones.length && zones[zi].availT <= now) { active.push(zones[zi]); zi++; }
    active = active.filter(z => now <= z.expT && e[i].c >= z.bottom && !z.used);

    // Armed setup ki jaanch
    if (st) {
      if (now > st.exp) { funnel.expired++; st = null; }
      else if (st.stage === 1 && e[i].c < st.zone.bottom - mAtr) { funnel.broken++; st = null; }
      else if (st.prot != null && e[i].l < st.prot) { funnel.broken++; st = null; }
    }

    // 3. Tap — sirf discount me
    if (!st) {
      if (P.trend === 'h4' && bias !== 1) continue;
      for (const z of active) {
        if (z.top > eq || z.top < rangeL - mAtr * 2) continue;
        if (e[i].l <= z.top && e[i].h >= z.bottom) {
          z.used = true; funnel.tap++;
          st = { zone: z, tapT: e[i].t, exp: e[i].t + 8 * HOUR, stage: P.smt >= 1 ? 1 : 2, prot: null, eq, rangeH, rangeL };
          break;
        }
      }
      if (!st) continue;
    }

    // 4a. Stage 1 — M30 qualified swing + SMT
    if (st.stage === 1 && mLowK >= 2) {
      const A2 = mP.lows[mLowK - 1], A1 = mP.lows[mLowK - 2];
      if (A2.t >= st.tapT - 30 * MIN && A2.p <= st.zone.top + 0.5 * mAtr && A2.i - A1.i <= 48 && smtAt(A1, A2, ms)) {
        funnel.stage1++; st.stage = 2; st.prot = A2.p; st.qualT = A2.t; st.exp = Math.max(st.exp, now + 4 * HOUR);
      }
    }
    // 4b. Stage 2 — M5 SMT usi low par (ya SMT ke baghair wale muqable me sirf M5 swing low)
    if (st && st.stage === 2 && eLowK >= 2) {
      const B2 = eP.lows[eLowK - 1], B1 = eP.lows[eLowK - 2];
      const afterQual = st.qualT != null ? B2.t >= st.qualT : B2.t >= st.tapT - 30 * MIN;
      const holds = st.prot == null ? B2.p <= st.zone.top + 0.5 * mAtr : B2.p >= st.prot - 1e-9;
      const smtOk = P.smt >= 2 ? (B2.i - B1.i <= 36 && smtAt(B1, B2, es)) : true;
      if (afterQual && holds && smtOk) {
        funnel.stage2++; st.stage = 3; st.prot = st.prot == null ? B2.p : Math.min(st.prot, B2.p); st.lowI = B2.i; st.csdBy = now + 3 * HOUR;
      }
    }
    // 5. CSD
    if (st && st.stage === 3) {
      if (now > st.csdBy) { funnel.expired++; st = null; continue; }
      let j = i - 1;
      while (j > st.lowI - 4 && !(e[j].c < e[j].o)) j--;
      if (j <= st.lowI - 4) continue;
      let s = j;
      while (s - 1 >= 0 && e[s - 1].c < e[s - 1].o) s--;
      const level = e[s].o;
      if (!(e[i].c > level && e[i].c > e[i].o)) continue;
      if (P.csdBody > 0 && (e[i].c - e[i].o) < P.csdBody * (e[i].h - e[i].l)) continue;

      const nb = e[i + 1];
      const hr = new Date(nb.t).getUTCHours();
      const setup = st; st = null; funnel.csd++;
      if (nb.t - e[i].end > 30 * MIN || hr < P.sessionStartUTC || hr >= P.sessionEndUTC) { funnel.outOfSession++; continue; }
      const entry = nb.o;
      const sl = setup.prot - 0.25 * atrE[i];
      const risk = entry - sl;
      if (risk < 1.0 || risk > P.maxRiskAtr * mAtr) { funnel.badRisk++; continue; }

      let tp;
      if (P.tp === 'eod') tp = Infinity;
      else if (P.tp === 'liq') {
        tp = null;
        for (let k = mHighK - 1; k >= 0 && k >= mHighK - 12; k--) { const hp = mP.highs[k].p; if (hp - entry >= risk && (tp == null || hp < tp)) tp = hp; }
        if (tp == null) tp = entry + 2 * risk;
      } else tp = entry + parseFloat(P.tp) * risk;

      // Trade chalana
      const d0 = new Date(nb.t); d0.setUTCHours(P.closeUTC, 0, 0, 0);
      const closeT = d0.getTime();
      let exitP = null, exitT = null, reason = null, stop = sl;
      for (let k = i + 1; k < e.length; k++) {
        const b = e[k];
        if (b.t >= closeT) { exitP = b.o; exitT = b.t; reason = 'Din band'; break; }
        if (b.l <= stop) { exitP = k > i + 1 && b.o < stop ? b.o : stop; exitT = b.end; reason = stop === sl ? 'SL' : 'BE'; break; }
        if (b.h >= tp) { exitP = k > i + 1 && b.o > tp ? b.o : tp; exitT = b.end; reason = 'TP'; break; }
        if (P.be && b.h >= entry + risk) stop = Math.max(stop, entry + COST);
        if (k === e.length - 1) { exitP = b.c; exitT = b.end; reason = 'Data khatam'; }
      }
      if (exitP == null) continue;
      const R = (exitP - entry - COST) / risk;
      signals.push({
        dir: dirName, entryT: nb.t, exitT, reason, keyLevel: setup.zone.kind,
        entry, sl, tp: isFinite(tp) ? tp : null, exit: exitP, risk, R,
      });
    }
  }
  return signals;
}

// ---------------- Poora backtest ----------------
function runGoldSmt(raw, opts) {
  const P = { ...DEFAULTS, ...(opts || {}) };
  const ivE = P.entryMin;
  const baseG = P.entryMin === 5 ? raw.gold5 : raw.gold1, baseS = P.entryMin === 5 ? raw.silver5 : raw.silver1;
  const [g0, s0] = align(baseG, baseS);
  const e = ivE === 5 ? g0 : resample(g0, ivE), es = ivE === 5 ? s0 : resample(s0, ivE);
  let [eA, esA] = align(e, es);
  if (P.from || P.to) {
    const keep = eA.map((x, k) => (!P.from || x.t >= P.from) && (!P.to || x.t < P.to));
    eA = eA.filter((x, k) => keep[k]); esA = esA.filter((x, k) => keep[k]);
  }
  const m = resample(g0, 30), ms = resample(s0, 30);
  const [mA, msA] = align(m, ms);
  // H1/H4 lambi history se; sirf woh hissa jo entry data se pehle 30 din tak ho
  const from = eA.length ? eA[0].t - 30 * 24 * HOUR : 0;
  const h1 = (raw.gold60 || resample(raw.gold5, 60)).filter(x => x.t >= from);
  const h4 = resample(h1, 240);

  const fix = (sig) => {
    // mirrored prices wapas asal me
    for (const s of sig) { s.entry = -s.entry; s.sl = -s.sl; s.exit = -s.exit; if (s.tp != null) s.tp = -s.tp; }
    return sig;
  };
  const buys = findSignals({ e: eA, es: esA, m: mA, ms: msA, h1, h4 }, P, 'BUY');
  const sells = fix(findSignals({ e: mirror(eA), es: mirror(esA), m: mirror(mA), ms: mirror(msA), h1: mirror(h1), h4: mirror(h4) }, P, 'SELL'));
  const funnel = {};
  for (const k of Object.keys(buys.funnel)) funnel[k] = buys.funnel[k] + sells.funnel[k];
  const all = buys.concat(sells).sort((a, b) => a.entryT - b.entryT);

  // Aik waqt me aik trade, din me max 2
  const trades = [];
  let busyUntil = 0;
  const perDay = {};
  for (const s of all) {
    const day = new Date(s.entryT).toISOString().slice(0, 10);
    if (s.entryT < busyUntil || (perDay[day] || 0) >= P.maxPerDay) continue;
    perDay[day] = (perDay[day] || 0) + 1;
    busyUntil = s.exitT;
    trades.push(s);
  }

  // Paisa (har trade par balance ka riskPct%)
  let bal = P.balance, peak = bal, ddPct = 0;
  for (const t of trades) {
    const pnl = bal * P.riskPct / 100 * t.R;
    bal += pnl; t.pnl = +pnl.toFixed(2); t.balance = +bal.toFixed(2);
    if (bal > peak) peak = bal;
    ddPct = Math.max(ddPct, (peak - bal) / peak * 100);
    for (const k of ['entry', 'sl', 'tp', 'exit', 'risk']) if (t[k] != null) t[k] = +t[k].toFixed(2);
    t.R = +t.R.toFixed(2);
  }
  const Rs = trades.map(t => t.R);
  const half = Math.floor(trades.length / 2);
  const byMonth = {};
  for (const t of trades) { const k = new Date(t.entryT).toISOString().slice(0, 7); (byMonth[k] = byMonth[k] || []).push(t.R); }
  const sess = (t) => new Date(t.entryT).getUTCHours() < 12 ? 'London' : 'New York';

  return {
    params: P,
    data: {
      from: eA.length ? eA[0].t : null, to: eA.length ? eA[eA.length - 1].end : null,
      entryBars: eA.length, m30Bars: mA.length, h1Bars: h1.length, h4Bars: h4.length,
      tradingDays: new Set(eA.map(x => new Date(x.t).toISOString().slice(0, 10))).size,
    },
    stats: stats(Rs),
    money: { start: P.balance, end: +bal.toFixed(2), returnPct: +((bal / P.balance - 1) * 100).toFixed(2), maxDdPct: +ddPct.toFixed(2) },
    byDir: { BUY: stats(trades.filter(t => t.dir === 'BUY').map(t => t.R)), SELL: stats(trades.filter(t => t.dir === 'SELL').map(t => t.R)) },
    bySession: { London: stats(trades.filter(t => sess(t) === 'London').map(t => t.R)), 'New York': stats(trades.filter(t => sess(t) === 'New York').map(t => t.R)) },
    byHalf: { pehla: stats(Rs.slice(0, half)), doosra: stats(Rs.slice(half)) },
    byMonth: Object.keys(byMonth).sort().map(k => ({ month: k, ...stats(byMonth[k]) })),
    byExit: ['TP', 'SL', 'BE', 'Din band', 'Data khatam'].map(r => ({ reason: r, n: trades.filter(t => t.reason === r).length })),
    signalsFound: all.length,
    funnel,
    trades,
  };
}

// Mukammal report: asal setting + TP ke versions + SMT ke baghair muqabla + M3 jaanch
function fullReport(raw, opts) {
  const base = { ...(opts || {}) };
  const main = runGoldSmt(raw, base);
  const pick = (r) => ({ ...r.stats, returnPct: r.money.returnPct, maxDdPct: r.money.maxDdPct });
  const variants = ['1.5R', '2R', '3R', 'liq', 'eod'].map(tp => ({ id: tp, ...pick(runGoldSmt(raw, { ...base, tp })) }));
  const ablation = [2, 1, 0].map(smt => ({ id: smt, ...pick(runGoldSmt(raw, { ...base, smt })) }));
  let m3 = null;
  if (raw.gold1 && raw.gold1.length && raw.silver1 && raw.silver1.length) {
    const r = runGoldSmt(raw, { ...base, entryMin: 3 });
    m3 = { data: r.data, stats: r.stats, money: r.money, trades: r.trades };
  }
  return { generatedAt: Date.now(), main, variants, ablation, m3 };
}

// Yahoo se data (server me fetchJson diya jata hai)
async function loadYahoo(fetchJson) {
  const get = async (sym, iv, range, ivMin) => fromYahoo(await fetchJson(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=${iv}&range=${range}`, 20000), ivMin);
  const [gold5, silver5, gold60, gold1, silver1] = await Promise.all([
    get('GC=F', '5m', '60d', 5), get('SI=F', '5m', '60d', 5), get('GC=F', '1h', '730d', 60),
    get('GC=F', '1m', '7d', 1).catch(() => []), get('SI=F', '1m', '7d', 1).catch(() => []),
  ]);
  if (!gold5.length || !silver5.length || !gold60.length) throw new Error('Yahoo se gold/silver candles nahi aayin');
  return { gold5, silver5, gold60, gold1, silver1 };
}

module.exports = { runGoldSmt, fullReport, loadYahoo, fromYahoo, DEFAULTS, pivots, resample, stats, align, atrArr, mirror, COST };
