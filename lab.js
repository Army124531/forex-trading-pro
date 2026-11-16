// Forex Trading Pro — Strategy Lab (v10.1)
// Terminal Backtest ka gehra version. SIRF research: ye file live signal engine ko nahi chhooti.
// Live engine ke asal functions (gateScore, computeSmc, zoneSupportFor) hi use hote hain, taake
// "Baseline" bilkul wahi ho jo site aaj signal deti hai — phir us ke versions aazmaye jate hain.
//
// Imaandari ke usool:
//   1. Asal candles (Yahoo Finance lambi history; na mile to site ka apna candle source).
//   2. Har trade se spread/slippage ka kharcha kaata jata hai.
//   3. Entry agli candle ke open par (signal wali candle ke close ke baad) — aage ka data nahi dekha jata.
//   4. Aik hi candle me SL aur TP dono lagein to SL gina jata hai (bura nateeja maan kar).
//   5. Data do hisson me: pehla 60% "seekhne" ke liye, aakhri 40% "imtihan" ke liye.
//      Versions seekhne wale hisse par chune jate hain, faisla imtihan wale hisse par hota hai.
'use strict';

// Aik trade ka round-trip kharcha (spread + thori slippage), price units me. Crypto: price ka 0.06%.
const LAB_COST = { EURUSD: 0.00012, GBPUSD: 0.00015, AUDUSD: 0.00014, USDCAD: 0.00016, USDCHF: 0.00016, USDJPY: 0.014, XAUUSD: 0.30, XAGUSD: 0.03 };
function labCost(pairId, price) { return LAB_COST[pairId] != null ? LAB_COST[pairId] : price * 0.0006; }

const TF = {
  '15m': { ivMin: 15, yahoo: ['15m', '60d'], maxHold: 192, label: '15M (live engine jaisa), taqreeban 60 din' },
  '1H': { ivMin: 60, yahoo: ['1h', '730d'], maxHold: 96, label: '1H, taqreeban 2 saal' },
};
// SL aur TP, ATR ke hisaab se. Pehla wala aaj ka live plan hai (TP1 par nikalna).
const GEOMETRIES = [
  { id: 'SL1.5/TP1.0', sl: 1.5, tp: 1.0, live: true },
  { id: 'SL1.5/TP1.5', sl: 1.5, tp: 1.5 },
  { id: 'SL1.5/TP2.25', sl: 1.5, tp: 2.25 },
  { id: 'SL1.5/TP3.0', sl: 1.5, tp: 3.0 },
  { id: 'SL1.0/TP1.5', sl: 1.0, tp: 1.5 },
  { id: 'SL2.0/TP2.0', sl: 2.0, tp: 2.0 },
];
const GATES = [85, 95, 100]; // 95 aur 100 = kam signals, sakht chunao
// Filters: Z = zone (live me pehle se hai), H = bare timeframe ka trend, A = ADX >= 20, S = London/New York ke ghante.
const FILTER_SETS = ['Z', '', 'ZH', 'ZA', 'ZS', 'ZHA', 'ZHS', 'ZHAS', 'H', 'HA'];
const FILTER_NAMES = { Z: 'Zone', H: 'Bara trend', A: 'ADX≥20', S: 'London/NY' };
const SPLIT = 0.6;

function adxSeries(candles, period) {
  const n = candles.length, out = new Array(n).fill(null);
  if (n < period * 2 + 2) return out;
  let trS = 0, pS = 0, mS = 0, adx = null, dxSum = 0, dxCount = 0;
  for (let i = 1; i < n; i++) {
    const c = candles[i], p = candles[i - 1];
    const tr = Math.max(c.h - c.l, Math.abs(c.h - p.c), Math.abs(c.l - p.c));
    const up = c.h - p.h, dn = p.l - c.l;
    const pDM = up > dn && up > 0 ? up : 0, mDM = dn > up && dn > 0 ? dn : 0;
    if (i <= period) { trS += tr; pS += pDM; mS += mDM; if (i < period) continue; }
    else { trS = trS - trS / period + tr; pS = pS - pS / period + pDM; mS = mS - mS / period + mDM; }
    if (!trS) continue;
    const pDI = 100 * pS / trS, mDI = 100 * mS / trS;
    const dx = (pDI + mDI) ? 100 * Math.abs(pDI - mDI) / (pDI + mDI) : 0;
    if (adx == null) { dxSum += dx; dxCount++; if (dxCount === period) adx = dxSum / period; }
    else adx = (adx * (period - 1) + dx) / period;
    out[i] = adx;
  }
  return out;
}

function stats(rs) {
  const n = rs.length;
  if (!n) return { n: 0, winRate: null, avgR: null, pf: null, netR: 0, tStat: null, maxDdR: 0 };
  let sum = 0, gw = 0, gl = 0, wins = 0, eq = 0, peak = 0, dd = 0;
  for (const r of rs) { sum += r; if (r > 0) { gw += r; wins++; } else gl -= r; eq += r; if (eq > peak) peak = eq; if (peak - eq > dd) dd = peak - eq; }
  const mean = sum / n;
  let v = 0; for (const r of rs) v += (r - mean) * (r - mean);
  const sd = n > 1 ? Math.sqrt(v / (n - 1)) : 0;
  return { n, winRate: +(wins / n * 100).toFixed(1), avgR: +mean.toFixed(3), pf: gl ? +(gw / gl).toFixed(2) : null, netR: +sum.toFixed(1), tStat: sd ? +(mean / (sd / Math.sqrt(n))).toFixed(2) : null, maxDdR: +dd.toFixed(1) };
}

function createLab(deps) {
  const { gateScore, computeSmc, findSwings, zoneSupportFor, emaArr, rsiArr, atrArr, PAIRS, getCandles, fetchJson } = deps;
  let job = { status: 'idle' };
  const tick = () => new Promise(r => setImmediate(r));

  async function loadCandles(pairId, tf) {
    const cfg = TF[tf];
    const p = PAIRS.find(x => x.id === pairId);
    let data = null, source = null;
    if (p && p.yahoo) {
      try {
        const d = await fetchJson(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(p.yahoo)}?interval=${cfg.yahoo[0]}&range=${cfg.yahoo[1]}`, 20000);
        const r = d && d.chart && d.chart.result && d.chart.result[0];
        if (r && r.timestamp) {
          const q = r.indicators.quote[0];
          data = [];
          for (let i = 0; i < r.timestamp.length; i++) {
            const o = q.open[i], h = q.high[i], l = q.low[i], c = q.close[i];
            if (o == null || h == null || l == null || c == null || !(h >= l) || c <= 0) continue;
            data.push({ t: r.timestamp[i] * 1000, o, h, l, c });
          }
          source = 'Yahoo Finance';
        }
      } catch (e) { data = null; }
    }
    if (!data || data.length < 600) {
      const alt = await getCandles(pairId, tf);
      if (alt && alt.length > (data ? data.length : 0)) { data = alt.map(c => ({ t: c.t, o: c.o, h: c.h, l: c.l, c: c.c })); source = 'Site ka candle source (chhoti history)'; }
    }
    return { candles: data || [], source };
  }

  // Har bar ke liye live engine ka score + filters ke flags (aik dafa), phir har version sirf exit chalata hai.
  async function prepare(pairId, candles, tf, onProgress) {
    const n = candles.length, cfg = TF[tf];
    const closes = candles.map(c => c.c);
    const e20 = emaArr(closes, 20), e50 = emaArr(closes, 50), e200 = emaArr(closes, 200);
    const rsi = rsiArr(closes, 14), atr = atrArr(candles, 14), adx = adxSeries(candles, 14);
    // Bara timeframe: 4 guna (15M -> 1H, 1H -> 4H). Sirf MUKAMMAL bare candle use hote hain — aage ka data nahi.
    const bucketMs = cfg.ivMin * 4 * 60000;
    const hClose = [], hIdxOfBar = new Array(n);
    let curB = null;
    for (let i = 0; i < n; i++) {
      const b = Math.floor(candles[i].t / bucketMs);
      if (b !== curB) { hClose.push(candles[i].c); curB = b; } else hClose[hClose.length - 1] = candles[i].c;
      hIdxOfBar[i] = hClose.length - 1;
    }
    const h20 = emaArr(hClose, 20), h50 = emaArr(hClose, 50);
    const bars = new Array(n).fill(null);
    for (let i = 220; i < n - 1; i++) {
      if (i % 300 === 0) { if (onProgress) onProgress(i / n); await tick(); }
      if (atr[i] == null || e200[i] == null) continue;
      const window = candles.slice(i - 220, i + 1);
      const price = closes[i];
      const ind = { ema20: e20[i], ema50: e50[i], ema200: e200[i], rsi14: rsi[i], lastPrice: price };
      const buy = gateScore(window, ind, price, 'buy', { backtest: true }).total;
      const sell = gateScore(window, ind, price, 'sell', { backtest: true }).total;
      if (buy < 85 && sell < 85) continue;
      // Live engine ka zone check (BUY/SELL ke peeche order block / FVG / demand-supply zone).
      const smc = computeSmc(window, []);
      const sw = findSwings(window);
      const demand = sw.low != null ? [sw.low, sw.low + atr[i]] : null;
      const supply = sw.high != null ? [sw.high - atr[i], sw.high] : null;
      const smcOk = smc && !smc.error ? smc : null;
      const zBuy = buy >= 85 ? !!zoneSupportFor(smcOk, demand, supply, price, atr[i], 'BUY').ok : false;
      const zSell = sell >= 85 ? !!zoneSupportFor(smcOk, demand, supply, price, atr[i], 'SELL').ok : false;
      const hi = hIdxOfBar[i] - 1; // aakhri mukammal bara candle
      let hUp = false, hDown = false;
      if (hi >= 0 && h20[hi] != null && h50[hi] != null) { hUp = hClose[hi] > h50[hi] && h20[hi] > h50[hi]; hDown = hClose[hi] < h50[hi] && h20[hi] < h50[hi]; }
      const hour = new Date(candles[i].t).getUTCHours();
      bars[i] = { buy, sell, zBuy, zSell, hUp, hDown, adxOk: adx[i] != null && adx[i] >= 20, sess: hour >= 7 && hour < 21 };
    }
    return { bars, atr };
  }

  function simulate(pairId, candles, prep, tf, geo, gate, fset) {
    const { bars, atr } = prep, n = candles.length, maxHold = TF[tf].maxHold;
    const splitIdx = Math.floor(n * SPLIT);
    const train = [], test = [];
    let i = 220;
    while (i < n - 1) {
      const b = bars[i];
      if (!b) { i++; continue; }
      const dir = b.buy >= gate ? 'BUY' : b.sell >= gate ? 'SELL' : null; // live engine jaisi tarteeb
      if (!dir) { i++; continue; }
      const isBuy = dir === 'BUY';
      if (fset.indexOf('Z') >= 0 && !(isBuy ? b.zBuy : b.zSell)) { i++; continue; }
      if (fset.indexOf('H') >= 0 && !(isBuy ? b.hUp : b.hDown)) { i++; continue; }
      if (fset.indexOf('A') >= 0 && !b.adxOk) { i++; continue; }
      if (fset.indexOf('S') >= 0 && !b.sess) { i++; continue; }
      const risk = geo.sl * atr[i], reward = geo.tp * atr[i];
      const entry = candles[i + 1].o;
      if (!(risk > 0) || !(entry > 0)) { i++; continue; }
      const sl = isBuy ? entry - risk : entry + risk, tp = isBuy ? entry + reward : entry - reward;
      let r = null, exitIdx = Math.min(n - 1, i + maxHold);
      for (let j = i + 1; j <= Math.min(n - 1, i + maxHold); j++) {
        const c = candles[j];
        if (j > i + 1) { // gap: candle SL ke paar khule to wahi (bura) price milta hai
          if (isBuy ? c.o <= sl : c.o >= sl) { r = (isBuy ? c.o - entry : entry - c.o) / risk; exitIdx = j; break; }
        }
        if (isBuy ? c.l <= sl : c.h >= sl) { r = -1; exitIdx = j; break; } // SL pehle (bura maan kar)
        if (isBuy ? c.h >= tp : c.l <= tp) { r = reward / risk; exitIdx = j; break; }
      }
      if (r == null) { const c = candles[exitIdx]; r = (isBuy ? c.c - entry : entry - c.c) / risk; } // waqt khatam — close par nikal
      r -= labCost(pairId, entry) / risk;
      (i + 1 < splitIdx ? train : test).push({ t: candles[i + 1].t, r });
      i = exitIdx + 1; // aik pair par aik waqt me aik trade
    }
    return { train, test };
  }

  function fsetName(f) { return f === '' ? 'Koi filter nahi' : f.split('').map(x => FILTER_NAMES[x]).join(' + '); }

  async function run(tf, pairIds) {
    const variants = [];
    for (const geo of GEOMETRIES) for (const gate of GATES) for (const f of FILTER_SETS) {
      variants.push({ key: geo.id + '|' + gate + '|' + f, geo, gate, fset: f, name: geo.id + ' · gate ' + gate + ' · ' + fsetName(f), isBaseline: !!geo.live && gate === 85 && f === 'Z', train: [], test: [], perPairTest: {} });
    }
    const dataInfo = [];
    for (let pi = 0; pi < pairIds.length; pi++) {
      const pairId = pairIds[pi];
      job.progress = { pair: pairId, done: pi, total: pairIds.length, step: 'candles' };
      const { candles, source } = await loadCandles(pairId, tf);
      if (candles.length < 600) { dataInfo.push({ pair: pairId, bars: candles.length, used: false, note: 'Data kam hai — chhor diya.' }); continue; }
      job.progress.step = 'score';
      const prep = await prepare(pairId, candles, tf, (f) => { job.progress.frac = f; });
      const splitT = candles[Math.floor(candles.length * SPLIT)].t;
      dataInfo.push({ pair: pairId, bars: candles.length, used: true, source, from: candles[0].t, to: candles[candles.length - 1].t, splitAt: splitT, costR: null });
      job.progress.step = 'versions';
      for (let vi = 0; vi < variants.length; vi++) {
        if (vi % 20 === 0) await tick();
        const v = variants[vi];
        const res = simulate(pairId, candles, prep, tf, v.geo, v.gate, v.fset);
        for (const x of res.train) v.train.push(x);
        for (const x of res.test) v.test.push(x);
        v.perPairTest[pairId] = res.test.map(x => x.r);
      }
    }
    const byTime = (a, b) => a.t - b.t;
    const rows = variants.map(v => {
      const tr = stats(v.train.sort(byTime).map(x => x.r)), te = stats(v.test.sort(byTime).map(x => x.r));
      const pp = Object.keys(v.perPairTest).map(k => v.perPairTest[k]).filter(a => a.length >= 10);
      const pos = pp.filter(a => a.reduce((s, r) => s + r, 0) > 0).length;
      return { name: v.name, isBaseline: v.isBaseline, sl: v.geo.sl, tp: v.geo.tp, gate: v.gate, filters: v.fset, train: tr, test: te, pairsTested: pp.length, pairsPositive: pos };
    });
    // Chunao SIRF seekhne wale hisse par (kam se kam 50 trades). Faisla imtihan wale hisse par.
    const eligible = rows.filter(r => r.train.n >= 50 && r.train.avgR != null).sort((a, b) => b.train.avgR - a.train.avgR);
    const top = eligible.slice(0, 5);
    const judge = (r) => {
      const t = r.test;
      const strong = t.n >= 80 && t.avgR > 0 && t.pf != null && t.pf >= 1.15 && t.tStat != null && t.tStat >= 2.5 && r.pairsTested > 0 && r.pairsPositive / r.pairsTested >= 0.6;
      if (strong) return 'JEETA';
      if (t.n >= 40 && t.avgR > 0 && t.pf != null && t.pf > 1) return 'KAMZOR';
      return 'NAHI';
    };
    top.forEach(r => { r.verdict = judge(r); });
    const baseline = rows.find(r => r.isBaseline) || null;
    const winners = top.filter(r => r.verdict === 'JEETA');
    const geometryOnly = rows.filter(r => r.gate === 85 && r.filters === 'Z'); // sirf SL/TP badalne ka asar
    let verdict;
    if (!dataInfo.some(d => d.used)) verdict = 'Kisi pair ka kaafi data nahi mila — test nahi ho saka. Thori der baad dobara chalayein.';
    else if (winners.length) verdict = winners.length + ' version imtihan wale data par saaf jeeta. Live engine me lagane se pehle isay doosre timeframe par bhi chala kar dekhein.';
    else if (top.some(r => r.verdict === 'KAMZOR')) verdict = 'Koi version saaf nahi jeeta. Kuch thore behtar hain, lekin itne nahi ke un par bharosa kiya ja sake — live engine me abhi kuch na badlein.';
    else verdict = 'Koi version nahi jeeta. Is engine ke scores, in filters aur in SL/TP ke saath, kharcha kaat kar munafa nahi dikha rahe.';
    return {
      tf, tfLabel: TF[tf].label, pairs: dataInfo, variantsTested: rows.length, splitNote: 'Pehla 60% data seekhne ke liye, aakhri 40% imtihan ke liye.',
      costNote: 'Har trade se spread/slippage kaata gaya (forex ~1.2-1.6 pip, gold $0.30, crypto price ka 0.06%). Aap ke broker ka kharcha alag ho sakta hai.',
      limits: 'News filter history me nahi lagaya ja saka (purana calendar maujood nahi). Yahoo ki price broker ki price se thori alag hoti hai. ' + rows.length + ' versions aazmaye gaye — itne versions me koi aik sirf ittefaq se bhi acha dikh sakta hai, is liye faisla sirf imtihan wale hisse par aur sakht shart se hota hai.',
      baseline, top, geometryOnly, verdict, finishedAt: Date.now(),
    };
  }

  // ================= v10.2: NAYE TAREEQE (maujooda engine se bilkul alag) =================
  // Maujooda 6-gate score Gold/Forex par nahi jeeta, is liye yahan 4 mashhoor, saada tareeqe
  // usi sakht imtihan se guzarte hain. Jaan boojh kar sirf 20 versions — jitne kam versions,
  // utna kam ittefaq. Sab 1H candles par (~2 saal); bare timeframe ke liye 4H candles 1H se bante hain.
  // Har signal: { i (signal wali 1H candle), dir, slDist, tpDist } — entry agli candle ke open par.
  function walk(pairId, candles, sigs, maxHold) {
    const n = candles.length, splitIdx = Math.floor(n * SPLIT), train = [], test = [];
    let free = 0;
    for (const s of sigs) {
      const i = s.i;
      if (i < free || i + 1 >= n) continue; // aik pair par aik waqt me aik trade
      const isBuy = s.dir === 'BUY', risk = s.slDist, reward = s.tpDist, entry = candles[i + 1].o;
      if (!(risk > 0) || !(reward > 0) || !(entry > 0)) continue;
      const sl = isBuy ? entry - risk : entry + risk, tp = isBuy ? entry + reward : entry - reward;
      const last = Math.min(n - 1, i + maxHold);
      let r = null, exitIdx = last;
      for (let j = i + 1; j <= last; j++) {
        const c = candles[j];
        if (j > i + 1 && (isBuy ? c.o <= sl : c.o >= sl)) { r = (isBuy ? c.o - entry : entry - c.o) / risk; exitIdx = j; break; }
        if (isBuy ? c.l <= sl : c.h >= sl) { r = -1; exitIdx = j; break; }
        if (isBuy ? c.h >= tp : c.l <= tp) { r = reward / risk; exitIdx = j; break; }
      }
      if (r == null) { const c = candles[exitIdx]; r = (isBuy ? c.c - entry : entry - c.c) / risk; }
      r -= labCost(pairId, entry) / risk;
      (i + 1 < splitIdx ? train : test).push({ t: candles[i + 1].t, r });
      free = exitIdx + 1;
    }
    return { train, test };
  }
  function smaArr(v, p) { const o = new Array(v.length).fill(null); let s = 0; for (let i = 0; i < v.length; i++) { s += v[i]; if (i >= p) s -= v[i - p]; if (i >= p - 1) o[i] = s / p; } return o; }
  function sdArr(v, p, m) { const o = new Array(v.length).fill(null); for (let i = p - 1; i < v.length; i++) { let s = 0; for (let j = i - p + 1; j <= i; j++) s += (v[j] - m[i]) * (v[j] - m[i]); o[i] = Math.sqrt(s / p); } return o; }
  // 1H se 4H candles. endIdx[k] = us 4H candle ki aakhri 1H candle — signal sirf tab jab 4H candle MUKAMMAL ho.
  function build4H(candles) {
    const H = [], endIdx = [], hkOf = new Array(candles.length);
    let cur = null;
    for (let i = 0; i < candles.length; i++) {
      const c = candles[i], b = Math.floor(c.t / (4 * 3600000));
      if (b !== cur) { H.push({ t: c.t, o: c.o, h: c.h, l: c.l, c: c.c }); endIdx.push(i); cur = b; }
      else { const x = H[H.length - 1]; if (c.h > x.h) x.h = c.h; if (c.l < x.l) x.l = c.l; x.c = c.c; endIdx[endIdx.length - 1] = i; }
      hkOf[i] = H.length - 1;
    }
    return { H, endIdx, hkOf };
  }
  function features(candles) {
    const closes = candles.map(c => c.c);
    const f = { closes, e20: emaArr(closes, 20), rsi: rsiArr(closes, 14), atr: atrArr(candles, 14), adx: adxSeries(candles, 14) };
    f.sma20 = smaArr(closes, 20); f.sd20 = sdArr(closes, 20, f.sma20);
    const h = build4H(candles); f.H = h.H; f.endIdx = h.endIdx; f.hkOf = h.hkOf;
    const hc = h.H.map(x => x.c);
    f.hE50 = emaArr(hc, 50); f.hE200 = emaArr(hc, 200); f.hAtr = atrArr(h.H, 14);
    // 1H candle i ke close par aakhri MUKAMMAL 4H candle ka index
    f.doneHk = new Array(candles.length);
    for (let i = 0; i < candles.length; i++) f.doneHk[i] = (i + 1 < candles.length && h.hkOf[i + 1] !== h.hkOf[i]) ? h.hkOf[i] : h.hkOf[i] - 1;
    return f;
  }
  // 1) Breakout: 4H candle pichle N 4H candles ke high/low ke paar band ho.
  function sigBreakout(candles, f, N, rr, trend) {
    const out = [], H = f.H;
    for (let k = Math.max(N + 2, 16); k < H.length - 1; k++) {
      if (f.hAtr[k] == null) continue;
      let hh = -Infinity, ll = Infinity;
      for (let j = k - N; j < k; j++) { if (H[j].h > hh) hh = H[j].h; if (H[j].l < ll) ll = H[j].l; }
      const prevIn = H[k - 1].c <= hh && H[k - 1].c >= ll; // taaza breakout — pichla candle range ke andar tha
      if (!prevIn) continue;
      let dir = H[k].c > hh ? 'BUY' : H[k].c < ll ? 'SELL' : null;
      if (!dir) continue;
      if (trend) { if (f.hE200[k] == null) continue; if (dir === 'BUY' ? H[k].c < f.hE200[k] : H[k].c > f.hE200[k]) continue; }
      const slDist = 2 * f.hAtr[k];
      out.push({ i: f.endIdx[k], dir, slDist, tpDist: rr * slDist });
    }
    return out;
  }
  // 2) Trend me pullback: 4H trend ek taraf, 1H price EMA20 ke us paar kuch candles reh kar wapas aaye.
  function sigPullback(candles, f, rr, minBars) {
    const out = [], c = f.closes, n = candles.length;
    for (let i = 60; i < n - 1; i++) {
      const k = f.doneHk[i];
      if (k < 0 || f.hE50[k] == null || f.hE200[k] == null || f.e20[i] == null || f.atr[i] == null) continue;
      const up = f.hE50[k] > f.hE200[k] && f.H[k].c > f.hE200[k], down = f.hE50[k] < f.hE200[k] && f.H[k].c < f.hE200[k];
      if (!up && !down) continue;
      if (up ? !(c[i] > f.e20[i]) : !(c[i] < f.e20[i])) continue;
      let cnt = 0, ext = up ? candles[i].l : candles[i].h;
      for (let j = i - 1; j >= 0 && cnt < 40; j--) {
        if (f.e20[j] == null) break;
        if (up ? c[j] < f.e20[j] : c[j] > f.e20[j]) { cnt++; ext = up ? Math.min(ext, candles[j].l) : Math.max(ext, candles[j].h); } else break;
      }
      if (cnt < minBars) continue;
      let slDist = Math.max(Math.abs(c[i] - ext), f.atr[i]);
      if (slDist > 3 * f.atr[i]) continue; // pullback bohat gehra — trend toot gaya ho sakta hai
      out.push({ i, dir: up ? 'BUY' : 'SELL', slDist, tpDist: rr * slDist });
    }
    return out;
  }
  // 3) Wapsi (mean reversion): price Bollinger band ke bahar aur RSI inteha par; nishana beech wali line (SMA20).
  function sigMeanRev(candles, f, lo, hi, adxOn) {
    const out = [], c = f.closes, n = candles.length;
    for (let i = 40; i < n - 1; i++) {
      if (f.rsi[i] == null || f.sma20[i] == null || f.sd20[i] == null || f.atr[i] == null) continue;
      if (adxOn && !(f.adx[i] != null && f.adx[i] < 20)) continue;
      let dir = null;
      if (f.rsi[i] < lo && c[i] < f.sma20[i] - 2 * f.sd20[i]) dir = 'BUY';
      else if (f.rsi[i] > hi && c[i] > f.sma20[i] + 2 * f.sd20[i]) dir = 'SELL';
      if (!dir) continue;
      const tpDist = Math.abs(f.sma20[i] - c[i]);
      if (tpDist < 0.75 * f.atr[i]) continue;
      out.push({ i, dir, slDist: 1.5 * f.atr[i], tpDist });
    }
    return out;
  }
  // 4) London breakout: Asia (00-07 UTC) ki range, 07-10 UTC me us ke paar pehla close. Din me aik signal.
  function sigLondon(candles, f, slMode, tpMult) {
    const out = [], n = candles.length;
    let day = null, rh = -Infinity, rl = Infinity, cnt = 0, done = false;
    for (let i = 0; i < n - 1; i++) {
      const d = new Date(candles[i].t), dk = Math.floor(candles[i].t / 86400000), h = d.getUTCHours();
      if (dk !== day) { day = dk; rh = -Infinity; rl = Infinity; cnt = 0; done = false; }
      if (h < 7) { if (candles[i].h > rh) rh = candles[i].h; if (candles[i].l < rl) rl = candles[i].l; cnt++; continue; }
      if (h > 10 || done || cnt < 5 || f.atr[i] == null) continue;
      const range = rh - rl, c = candles[i].c;
      if (!(range > 0.5 * f.atr[i])) continue;
      const dir = c > rh ? 'BUY' : c < rl ? 'SELL' : null;
      if (!dir) continue;
      done = true;
      const stop = slMode === 'mid' ? (rh + rl) / 2 : (dir === 'BUY' ? rl : rh);
      const slDist = Math.abs(c - stop);
      if (slDist < 0.3 * f.atr[i]) continue;
      out.push({ i, dir, slDist, tpDist: tpMult * range });
    }
    return out;
  }
  const NEW_STRATEGIES = [];
  for (const N of [20, 55]) for (const rr of [1.5, 3]) for (const tr of [true, false])
    NEW_STRATEGIES.push({ name: 'Breakout 4H · pichle ' + N + ' candles · munafa ' + rr + 'x risk · ' + (tr ? 'trend ke saath' : 'trend filter nahi'), maxHold: 240, gen: (c, f) => sigBreakout(c, f, N, rr, tr) });
  for (const rr of [1.5, 2.5]) for (const mb of [3, 6])
    NEW_STRATEGIES.push({ name: 'Trend me pullback 1H · ' + mb + '+ candles ka pullback · munafa ' + rr + 'x risk', maxHold: 96, gen: (c, f) => sigPullback(c, f, rr, mb) });
  for (const th of [[25, 75], [30, 70]]) for (const ax of [true, false])
    NEW_STRATEGIES.push({ name: 'Wapsi (mean reversion) 1H · RSI ' + th[0] + '/' + th[1] + ' · ' + (ax ? 'sirf bina-trend market' : 'har market'), maxHold: 48, gen: (c, f) => sigMeanRev(c, f, th[0], th[1], ax) });
  for (const sm of ['mid', 'far']) for (const tm of [1, 2])
    NEW_STRATEGIES.push({ name: 'London breakout · SL ' + (sm === 'mid' ? 'range ke beech' : 'range ke us paar') + ' · munafa ' + tm + 'x range', maxHold: 24, gen: (c, f) => sigLondon(c, f, sm, tm) });

  async function runNew(pairIds) {
    const variants = NEW_STRATEGIES.map(s => ({ s, train: [], test: [], perPairTest: {} }));
    const dataInfo = [];
    for (let pi = 0; pi < pairIds.length; pi++) {
      const pairId = pairIds[pi];
      job.progress = { pair: pairId, done: pi, total: pairIds.length, step: 'candles' };
      const { candles, source } = await loadCandles(pairId, '1H');
      if (candles.length < 2000) { dataInfo.push({ pair: pairId, bars: candles.length, used: false, note: 'Data kam hai — chhor diya.' }); continue; }
      await tick();
      const f = features(candles);
      dataInfo.push({ pair: pairId, bars: candles.length, used: true, source, from: candles[0].t, to: candles[candles.length - 1].t });
      for (const v of variants) {
        await tick();
        const res = walk(pairId, candles, v.s.gen(candles, f), v.s.maxHold);
        for (const x of res.train) v.train.push(x);
        for (const x of res.test) v.test.push(x);
        v.perPairTest[pairId] = res.test.map(x => x.r);
      }
    }
    const byTime = (a, b) => a.t - b.t;
    const rows = variants.map(v => {
      const pp = Object.keys(v.perPairTest).map(k => v.perPairTest[k]).filter(a => a.length >= 10);
      return { name: v.s.name, isBaseline: false, train: stats(v.train.sort(byTime).map(x => x.r)), test: stats(v.test.sort(byTime).map(x => x.r)), pairsTested: pp.length, pairsPositive: pp.filter(a => a.reduce((s, r) => s + r, 0) > 0).length };
    });
    const judge = (r) => {
      const t = r.test;
      if (t.n >= 80 && t.avgR > 0 && t.pf != null && t.pf >= 1.15 && t.tStat != null && t.tStat >= 2.5 && r.pairsTested > 0 && r.pairsPositive / r.pairsTested >= 0.6) return 'JEETA';
      if (t.n >= 40 && t.avgR > 0 && t.pf != null && t.pf > 1) return 'KAMZOR';
      return 'NAHI';
    };
    const top = rows.filter(r => r.train.n >= 50 && r.train.avgR != null).sort((a, b) => b.train.avgR - a.train.avgR).slice(0, 5);
    top.forEach(r => { r.verdict = judge(r); });
    const winners = top.filter(r => r.verdict === 'JEETA');
    let verdict;
    if (!dataInfo.some(d => d.used)) verdict = 'Kisi pair ka kaafi data nahi mila — test nahi ho saka. Thori der baad dobara chalayein.';
    else if (winners.length) verdict = winners.length + ' naya tareeqa imtihan wale data par saaf jeeta. Live me lagane se pehle isay doosre pairs par bhi chala kar dekhein, aur phir chhote demo test se guzarein.';
    else if (top.some(r => r.verdict === 'KAMZOR')) verdict = 'Koi naya tareeqa saaf nahi jeeta. Kuch thore musbat hain, lekin itne nahi ke un par paisa lagaya jaye.';
    else verdict = 'Koi naya tareeqa nahi jeeta. In saada tareeqon se, kharcha kaat kar, munafa nahi dikha.';
    return {
      mode: 'new', tf: '1H', tfLabel: 'Naye tareeqe · 1H candles (4H trend ke saath), taqreeban 2 saal', pairs: dataInfo, variantsTested: rows.length,
      splitNote: 'Pehla 60% data seekhne ke liye, aakhri 40% imtihan ke liye.',
      costNote: 'Har trade se spread/slippage kaata gaya (forex ~1.2-1.6 pip, gold $0.30, crypto price ka 0.06%). Aap ke broker ka kharcha alag ho sakta hai.',
      limits: 'Ye maujooda signal engine nahi — bilkul alag, saada tareeqe hain. News ka asar shamil nahi. Yahoo ki price broker ki price se thori alag hoti hai. ' + rows.length + ' versions aazmaye gaye; faisla sirf imtihan wale hisse par aur sakht shart se hota hai. Yahan jeetna bhi live munafe ki guarantee nahi.',
      baseline: null, top, all: rows.slice().sort((a, b) => (b.test.avgR == null ? -9 : b.test.avgR) - (a.test.avgR == null ? -9 : a.test.avgR)), geometryOnly: [], verdict, finishedAt: Date.now(),
    };
  }

  function start(tf, pairIds, mode) {
    if (job.status === 'running') return { ok: false, message: 'Lab pehle se chal raha hai.' };
    if (mode === 'new') tf = '1H';
    if (!TF[tf]) return { ok: false, message: 'Timeframe 15m ya 1H ho.' };
    const ids = (pairIds || []).filter(id => PAIRS.some(p => p.id === id));
    if (!ids.length) return { ok: false, message: 'Kam se kam aik pair chunein.' };
    job = { status: 'running', startedAt: Date.now(), tf, pairs: ids, progress: { done: 0, total: ids.length } };
    (mode === 'new' ? runNew(ids) : run(tf, ids)).then(result => { job = { status: 'done', startedAt: job.startedAt, tf, pairs: ids, result }; })
      .catch(e => { job = { status: 'error', startedAt: job.startedAt, tf, pairs: ids, message: String(e && e.message || e) }; });
    return { ok: true };
  }
  function status() { return job; }
  return { start, status, _run: run, _runNew: runNew, _prepare: prepare, _simulate: simulate, _features: features, _strategies: NEW_STRATEGIES, _walk: walk };
}

module.exports = { createLab, stats, adxSeries, labCost, GEOMETRIES, GATES, FILTER_SETS };
