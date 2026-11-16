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
      const costR = labCost(pairId, entry) / risk;
      r -= costR;
      // c = kharcha R me, d = trade kitne din khuli rahi, rp = risk price ka kitna hissa — kharche ke test (v10.7) ke liye
      (i + 1 < splitIdx ? train : test).push({ t: candles[i + 1].t, r, c: costR, d: (exitIdx - i) / 24, rp: risk / entry });
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
    NEW_STRATEGIES.push({ id: 'brk-' + N + '-' + rr + '-' + (tr ? 't' : 'n'), name: 'Breakout 4H · pichle ' + N + ' candles · munafa ' + rr + 'x risk · ' + (tr ? 'trend ke saath' : 'trend filter nahi'), maxHold: 240, gen: (c, f) => sigBreakout(c, f, N, rr, tr) });
  for (const rr of [1.5, 2.5]) for (const mb of [3, 6])
    NEW_STRATEGIES.push({ id: 'pb-' + mb + '-' + rr, name: 'Trend me pullback 1H · ' + mb + '+ candles ka pullback · munafa ' + rr + 'x risk', maxHold: 96, gen: (c, f) => sigPullback(c, f, rr, mb) });
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

  // ================= v10.4: TASDEEQI IMTIHAN (crypto, purana an-dekha data) =================
  // "Naye tareeqe" wale test me crypto par do ishare mile, lekin koi JEETA nahi. Usi data par dobara
  // dekhna kuch saabit nahi karta, is liye yahan sirf DO umeedwar, jo 2026-11-16 ko likh kar pakke
  // kiye gaye, aise data par chalte hain jo ab tak kisi test me use nahi hua:
  // Binance 1H candles, 2021-11-16 se 2024-11-16 (pichle test ka data 2024-11-17 se shuru hota tha).
  // Yahan seekhne/imtihan ki taqseem nahi — poora data imtihan hai. Umeedwar ya tarteeb na badlein,
  // warna ye imtihan apni qeemat kho deta hai.
  const CONFIRM_FROM = Date.UTC(2021, 10, 16), CONFIRM_TO = Date.UTC(2024, 10, 16);
  const CONFIRM_PAIRS = ['BTCUSD', 'ETHUSD', 'SOLUSD', 'BNBUSD', 'XRPUSD', 'DOGEUSD', 'ADAUSD'];
  const CONFIRM_CANDIDATES = [
    { id: 'brk-20-3-t', why: 'Seekhne wale hisse me sab se behtar tha (imaandar chunao).' },
    { id: 'pb-6-2.5', why: 'Imtihan wale hisse me sab se behtar dikha, lekin baad me chuna gaya — is liye is par zyada shak rakhein.' },
  ];
  // v10.5: Gold ka tasdeeqi imtihan. Sirf-Gold wale test me breakout acha dikha, lekin sirf 38-42 trades par
  // aur aise 2 saal me jab Gold zyada tar upar hi gaya. Umeedwar (aik hi) 2026-11-16 ko pakka kiya gaya.
  // Data: Binance PAX Gold (PAXGUSDT) 1H, 2021-11-16 se 2024-06-26 — pichla Gold test 2024-06-26 se shuru hota tha.
  const CONFIRM_SETS = {
    crypto: { label: 'crypto', from: CONFIRM_FROM, to: CONFIRM_TO, pairs: CONFIRM_PAIRS, candidates: CONFIRM_CANDIDATES, minPairs: 4, symbol: (id) => id.replace(/USD$/, 'USDT'), costText: 'Har trade se price ka 0.06% (spread + slippage) kaata gaya.', extraLimit: '' },
    gold: { label: 'Gold', from: CONFIRM_FROM, to: Date.UTC(2024, 5, 26), pairs: ['XAUUSD'], candidates: [{ id: 'brk-20-3-t', why: 'Sirf-Gold wale test ke baad pakka kiya gaya akela umeedwar.' }], minPairs: 1, symbol: () => 'PAXGUSDT', costText: 'Har trade se $0.30 (Gold ka spread + slippage) kaata gaya.', extraLimit: ' Data PAX Gold (tokenized gold) ka hai: ye hafte ke saaton din chalta hai aur kabhi kabhi asal Gold se thora hat jata hai, is liye broker ke Gold par nateeja thora alag ho sakta hai. Sirf aik pair hai, is liye "pairs" wali shart yahan kuch saabit nahi karti.' },
  };
  const BINANCE_HOSTS = ['https://data-api.binance.vision', 'https://api.binance.com'];
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  async function loadBinance(pairId, onFrac, cfg) {
    cfg = cfg || CONFIRM_SETS.crypto;
    const symbol = cfg.symbol(pairId), CONFIRM_FROM = cfg.from, CONFIRM_TO = cfg.to; // is function ke andar set ki apni muddat
    for (const host of BINANCE_HOSTS) {
      const out = []; let start = CONFIRM_FROM, fails = 0, ok = true;
      while (start < CONFIRM_TO) {
        let rows = null;
        try { rows = await fetchJson(host + '/api/v3/klines?symbol=' + symbol + '&interval=1h&startTime=' + start + '&endTime=' + (CONFIRM_TO - 1) + '&limit=1000', 15000); } catch (e) { rows = null; }
        if (!Array.isArray(rows)) { if (++fails > 2) { ok = false; break; } await sleep(800); continue; }
        fails = 0;
        if (!rows.length) break;
        for (const k of rows) {
          const t = +k[0], o = +k[1], h = +k[2], l = +k[3], c = +k[4];
          if (!(t >= CONFIRM_FROM && t < CONFIRM_TO) || !(h >= l) || !(c > 0) || !(o > 0)) continue;
          if (out.length && t <= out[out.length - 1].t) continue;
          out.push({ t, o, h, l, c });
        }
        const lastT = +rows[rows.length - 1][0];
        if (!(lastT + 3600000 > start)) break; // aage na barhe to ruk jao (hamesha ke loop se bachao)
        start = lastT + 3600000;
        if (onFrac) onFrac((start - CONFIRM_FROM) / (CONFIRM_TO - CONFIRM_FROM));
        if (rows.length < 1000) break;
        await sleep(120);
      }
      if (ok && out.length >= 15000) return { candles: out, source: 'Binance (' + host.replace('https://', '') + ')' };
    }
    return { candles: [], source: null };
  }
  async function runConfirm(setName) {
    const cfg = CONFIRM_SETS[setName] || CONFIRM_SETS.crypto;
    const CONFIRM_PAIRS = cfg.pairs, CONFIRM_CANDIDATES = cfg.candidates;
    const variants = NEW_STRATEGIES.map(s => ({ s, trades: [], perPair: {} }));
    const dataInfo = [];
    for (let pi = 0; pi < CONFIRM_PAIRS.length; pi++) {
      const pairId = CONFIRM_PAIRS[pi];
      job.progress = { pair: pairId, done: pi, total: CONFIRM_PAIRS.length, step: 'candles' };
      const { candles, source } = await loadBinance(pairId, (f) => { job.progress.frac = f; }, cfg);
      if (!candles.length) { dataInfo.push({ pair: pairId, bars: 0, used: false, note: 'Binance se purana data nahi mila — chhor diya.' }); continue; }
      await tick();
      const f = features(candles);
      dataInfo.push({ pair: pairId, bars: candles.length, used: true, source, from: candles[0].t, to: candles[candles.length - 1].t });
      for (const v of variants) {
        await tick();
        const res = walk(pairId, candles, v.s.gen(candles, f), v.s.maxHold);
        const all = res.train.concat(res.test);
        for (const x of all) v.trades.push(x);
        v.perPair[pairId] = all.map(x => x.r);
      }
    }
    const byTime = (a, b) => a.t - b.t;
    const rowOf = (v) => {
      const tr = v.trades.sort(byTime);
      const pp = Object.keys(v.perPair).map(k => v.perPair[k]).filter(a => a.length >= 10);
      const years = {};
      for (const x of tr) { const y = new Date(x.t).getUTCFullYear(); (years[y] = years[y] || []).push(x.r); }
      const byYear = Object.keys(years).sort().map(y => ({ year: +y, ...stats(years[y]) }));
      return { id: v.s.id || null, name: v.s.name, isBaseline: false, test: stats(tr.map(x => x.r)), pairsTested: pp.length, pairsPositive: pp.filter(a => a.reduce((s, r) => s + r, 0) > 0).length, byYear, yearsPositive: byYear.filter(y => y.n >= 20 && y.avgR > 0).length, yearsCounted: byYear.filter(y => y.n >= 20).length };
    };
    const rows = variants.map(rowOf);
    const judge = (r) => {
      const t = r.test;
      const strong = t.n >= 80 && t.avgR > 0 && t.pf != null && t.pf >= 1.15 && t.tStat != null && t.tStat >= 2.5 && r.pairsTested > 0 && r.pairsPositive / r.pairsTested >= 0.6 && r.yearsCounted >= 2 && r.yearsPositive >= r.yearsCounted - 1;
      if (strong) return 'JEETA';
      if (t.n >= 40 && t.avgR > 0 && t.pf != null && t.pf > 1) return 'KAMZOR';
      return 'NAHI';
    };
    // v10.7: kharche ka test. Imtihan me kharcha kam maana gaya tha (crypto 0.06%); broker par chhote coins ka
    // spread aur kai din trade khuli rakhne ki fees (swap) zyada ho sakti hai. Wohi trades, sirf kharcha barha kar.
    // Ye umeedwar ya faisla nahi badalta — sirf batata hai ke munafa kitne kharche tak bachta hai.
    const SWAP_PER_DAY = 0.0005; // price ka 0.05% rozana (~18% saalana) — crypto CFD par aam andaza
    const costScenarios = (v) => {
      const tr = v.trades.slice().sort(byTime);
      if (!tr.length || tr[0].c == null) return null;
      const sc = (name, mult, swap) => ({ name, ...stats(tr.map(x => x.r - x.c * (mult - 1) - (swap ? SWAP_PER_DAY * x.d / x.rp : 0))) });
      const avgDays = tr.reduce((s, x) => s + x.d, 0) / tr.length, avgCostR = tr.reduce((s, x) => s + x.c, 0) / tr.length;
      return {
        avgDays: +avgDays.toFixed(1), avgCostR: +avgCostR.toFixed(3),
        rows: [sc('Imtihan wala kharcha (1x)', 1, false), sc('Kharcha 2.5x', 2.5, false), sc('Kharcha 5x', 5, false), sc('Kharcha 2.5x + swap 0.05%/din', 2.5, true), sc('Kharcha 5x + swap 0.05%/din', 5, true)],
      };
    };
    const candidates = CONFIRM_CANDIDATES.map(c => { const r = rows.find(x => x.id === c.id); const v = variants.find(x => x.s.id === c.id); return r ? { ...r, why: c.why, verdict: judge(r), costs: v ? costScenarios(v) : null } : null; }).filter(Boolean);
    const winners = candidates.filter(r => r.verdict === 'JEETA');
    const usedPairs = dataInfo.filter(d => d.used).length;
    let verdict;
    if (usedPairs < cfg.minPairs) verdict = 'Purana data kaafi pairs ka nahi mila (' + usedPairs + '/' + CONFIRM_PAIRS.length + ') — tasdeeqi imtihan nahi ho saka. Thori der baad dobara chalayein.';
    else if (winners.length === candidates.length && candidates.length === 1) verdict = 'Umeedwar an-dekhe purane data par bhi saaf jeeta. Agla qadam: khamosh mode (signal record ho, buyers ko na jaye) me chand hafte.';
    else if (candidates.length === 1 && candidates[0].verdict === 'KAMZOR') verdict = 'Umeedwar an-dekhe data par saaf nahi jeeta. Halka sa musbat hai, lekin itna nahi ke is par paisa lagaya jaye.';
    else if (candidates.length === 1) verdict = 'Umeedwar an-dekhe purane data par nakaam raha. Pichle test ka ishara us waqt ki market ki wajah se tha.';
    else if (winners.length === candidates.length) verdict = 'Dono umeedwar an-dekhe purane data par bhi saaf jeete. Agla qadam: khamosh mode (signal record ho, buyers ko na jaye) me chand hafte.';
    else if (winners.length) verdict = winners.length + ' umeedwar an-dekhe purane data par bhi saaf jeeta: ' + winners.map(w => w.name.split(' · ')[0]).join(', ') + '. Agla qadam: sirf isay khamosh mode me chand hafte chalana.';
    else if (candidates.some(r => r.verdict === 'KAMZOR')) verdict = 'Koi umeedwar an-dekhe data par saaf nahi jeeta. Halka sa musbat hai, lekin itna nahi ke is par paisa lagaya jaye.';
    else verdict = 'Dono umeedwar an-dekhe purane data par nakaam rahe. Pichle test ke ishare ittefaq the.';
    return {
      mode: 'confirm', set: cfg.label, tf: '1H', tfLabel: 'Tasdeeqi imtihan · ' + cfg.label + ' · Binance 1H candles · ' + new Date(cfg.from).toISOString().slice(0, 10) + ' se ' + new Date(cfg.to).toISOString().slice(0, 10) + ' (an-dekha data)', pairs: dataInfo, variantsTested: candidates.length,
      splitNote: 'Poora data imtihan hai — yahan seekhne wala hissa nahi.',
      costNote: cfg.costText + ' Aap ke broker ka kharcha alag ho sakta hai.',
      limits: (candidates.length === 1 ? 'Sirf aik umeedwar, jo 2026-11-16 ko ye data dekhe baghair pakka kiya gaya.' : 'Sirf do umeedwar, jo 2026-11-16 ko ye data dekhe baghair pakke kiye gaye.') + cfg.extraLimit + ' ' + 'Yaad rahe: "JEETA" ke liye yahan aik shart zyada hai: munafa sirf aik saal par na tika ho (taqreeban har saal musbat). Baaqi tareeqon ki table sirf dekhne ke liye hai — us me se ab kuch chunna phir wohi ghalti hogi. Purana data jeetna bhi aage ke munafe ki guarantee nahi.',
      baseline: null, top: [], candidates, all: rows.slice().sort((a, b) => (b.test.avgR == null ? -9 : b.test.avgR) - (a.test.avgR == null ? -9 : a.test.avgR)), geometryOnly: [], verdict, finishedAt: Date.now(),
    };
  }

  // ================= v10.6: KHAMOSH MODE (crypto Breakout — aage ka asal data, buyers ko kuch nahi jata) =================
  // Tasdeeqi imtihan me crypto ka Breakout 4H (20 candles, munafa 3x, trend ke saath) jeeta. Live lagane se
  // pehle ye mode usi tareeqe ko 2026-11-17 se aage ke data par chup-chaap chalata hai:
  //   - na Telegram, na push, na EA, na History — sirf admin ko ye table dikhti hai.
  //   - Signal aur exit BILKUL Lab wale functions se bante hain (features + sigBreakout + wohi exit ke usool),
  //     is liye ye backtest ka seedha aage ka hissa hai.
  //   - Kuch save nahi hota: har dafa Binance ke candles se dobara hisaab hota hai. Server so jaye ya
  //     redeploy ho, nateeja wahi rehta hai, aur koi trade "bhool" nahi sakta.
  // SHADOW_START aur tareeqe ki settings na badlein — wo imtihan se pehle pakki ki gayi thin.
  const SHADOW = { id: 'brk-20-3-t', N: 20, rr: 3, trend: true, maxHold: 240, startAt: Date.UTC(2026, 10, 17), warmupDays: 170, pairs: CONFIRM_PAIRS };
  async function klines1h(symbol, startMs, endMs) {
    for (const host of BINANCE_HOSTS) {
      const out = []; let start = startMs, fails = 0, ok = true, guard = 0;
      while (start < endMs && guard++ < 60) {
        let rows = null;
        try { rows = await fetchJson(host + '/api/v3/klines?symbol=' + symbol + '&interval=1h&startTime=' + start + '&endTime=' + (endMs - 1) + '&limit=1000', 15000); } catch (e) { rows = null; }
        if (!Array.isArray(rows)) { if (++fails > 2) { ok = false; break; } await sleep(600); continue; }
        fails = 0;
        if (!rows.length) break;
        for (const k of rows) {
          const t = +k[0], o = +k[1], h = +k[2], l = +k[3], c = +k[4];
          if (!(t >= startMs && t < endMs) || !(h >= l) || !(c > 0) || !(o > 0)) continue;
          if (out.length && t <= out[out.length - 1].t) continue;
          out.push({ t, o, h, l, c });
        }
        const lastT = +rows[rows.length - 1][0];
        if (!(lastT + 3600000 > start)) break;
        start = lastT + 3600000;
        if (rows.length < 1000) break;
        await sleep(100);
      }
      if (ok && out.length) return out;
    }
    return [];
  }
  // walk() jaisa hi — aik aik line wohi usool — lekin har trade ki tafseel aur "abhi khula hai" ki halat ke saath.
  // Farq sirf ye: jis trade ka waqt (maxHold) abhi poora nahi hua aur SL/TP nahi laga, wo Open rehta hai
  // (backtest me data khatam hone par close par band kar diya jata hai; live me aisa karna ghalat hoga).
  function walkDetailed(pairId, candles, sigs, maxHold) {
    const n = candles.length, out = [];
    let free = 0;
    for (const s of sigs) {
      const i = s.i;
      if (i < free || i + 1 >= n) continue;
      const isBuy = s.dir === 'BUY', risk = s.slDist, reward = s.tpDist, entry = candles[i + 1].o;
      if (!(risk > 0) || !(reward > 0) || !(entry > 0)) continue;
      const sl = isBuy ? entry - risk : entry + risk, tp = isBuy ? entry + reward : entry - reward;
      const last = Math.min(n - 1, i + maxHold), complete = i + maxHold <= n - 1;
      let r = null, exitIdx = last, exit = null;
      for (let j = i + 1; j <= last; j++) {
        const c = candles[j];
        if (j > i + 1 && (isBuy ? c.o <= sl : c.o >= sl)) { r = (isBuy ? c.o - entry : entry - c.o) / risk; exitIdx = j; exit = 'SL (gap)'; break; }
        if (isBuy ? c.l <= sl : c.h >= sl) { r = -1; exitIdx = j; exit = 'SL'; break; }
        if (isBuy ? c.h >= tp : c.l <= tp) { r = reward / risk; exitIdx = j; exit = 'TP'; break; }
      }
      const cost = labCost(pairId, entry) / risk;
      const base = { pair: pairId, dir: s.dir, signalAt: candles[i].t + 3600000, entryAt: candles[i + 1].t, entry, sl, tp, riskPct: +(risk / entry * 100).toFixed(2) };
      if (r == null && !complete) { // abhi chal raha hai
        const c = candles[n - 1];
        out.push({ ...base, status: 'Open', r: null, runningR: +((isBuy ? c.c - entry : entry - c.c) / risk - cost).toFixed(2), exitAt: null, exit: null });
        free = n; // jab tak ye khula hai, is pair par naya trade nahi
        continue;
      }
      if (r == null) { const c = candles[exitIdx]; r = (isBuy ? c.c - entry : entry - c.c) / risk; exit = 'Waqt khatam'; }
      r -= cost;
      out.push({ ...base, status: r > 0 ? 'Win' : 'Loss', r: +r.toFixed(3), runningR: null, exitAt: candles[exitIdx].t + 3600000, exit });
      free = exitIdx + 1;
    }
    return out;
  }
  let shadowCache = { at: 0, data: null, inflight: null };
  async function computeShadow(nowMs) {
    const now = nowMs || Date.now();
    const histFrom = SHADOW.startAt - SHADOW.warmupDays * 86400000;
    const trades = [], dataInfo = [];
    for (const pairId of SHADOW.pairs) {
      const raw = await klines1h(pairId.replace(/USD$/, 'USDT'), histFrom, now);
      const candles = raw.filter(c => c.t + 3600000 <= now); // jo candle abhi ban rahi hai, wo shamil nahi
      if (candles.length < 3000) { dataInfo.push({ pair: pairId, bars: candles.length, used: false, note: 'Binance se data nahi mila.' }); continue; }
      await tick();
      const f = features(candles);
      // Sirf wo signals jin ki entry SHADOW_START ke baad hai — is se pehle ka sab data imtihanon me use ho chuka hai.
      const sigs = sigBreakout(candles, f, SHADOW.N, SHADOW.rr, SHADOW.trend).filter(s => s.i + 1 < candles.length && candles[s.i + 1].t >= SHADOW.startAt);
      for (const t of walkDetailed(pairId, candles, sigs, SHADOW.maxHold)) trades.push(t);
      dataInfo.push({ pair: pairId, bars: candles.length, used: true, to: candles[candles.length - 1].t + 3600000 });
    }
    trades.sort((a, b) => b.entryAt - a.entryAt);
    const closed = trades.filter(t => t.status !== 'Open').sort((a, b) => a.exitAt - b.exitAt);
    const st = stats(closed.map(t => t.r));
    const days = Math.max(0, (now - SHADOW.startAt) / 86400000);
    // Faisle ke usool — pehle se likhe hue, taake baad me nateeja dekh kar na badlein.
    let stage, advice;
    if (!dataInfo.some(d => d.used)) { stage = 'nodata'; advice = 'Binance se data nahi mila — thori der baad dobara dekhein.'; }
    else if (st.n >= 30 && st.netR <= -12) { stage = 'stop'; advice = 'RUK JAYEIN: ' + st.n + ' band trades me ' + st.netR + 'R. Ye backtest ki umeed se bohat neeche hai — is tareeqe ko live na lagayein, pehle wajah dekhein.'; }
    else if (st.n < 40 || days < 42) { stage = 'wait'; advice = 'Intezaar: faisle ke liye kam se kam 40 band trades aur 6 hafte chahiye (abhi ' + st.n + ' trades, ' + Math.floor(days) + ' din).'; }
    else if (st.netR > 0 && st.pf != null && st.pf >= 1) { stage = 'ok'; advice = 'Khamosh mode backtest ke mutabiq chal raha hai (' + st.n + ' trades, ' + (st.netR > 0 ? '+' : '') + st.netR + 'R, PF ' + st.pf + '). Ab malik faisla kar sakti hain ke crypto ke liye isay live signal banaya jaye ya nahi.'; }
    else { stage = 'weak'; advice = st.n + ' trades ke baad nateeja musbat nahi (' + st.netR + 'R). Live na lagayein; mazeed intezaar karein ya tareeqe par dobara ghaur karein.'; }
    return {
      strategy: 'Breakout 4H · pichle 20 candles · munafa 3x risk · trend ke saath', market: 'Crypto (7 pairs)', startAt: SHADOW.startAt, asOf: now, days: +days.toFixed(1),
      stats: st, open: trades.filter(t => t.status === 'Open').length, stage, advice, trades: trades.slice(0, 200), pairs: dataInfo,
      reference: 'Tasdeeqi imtihan (2021-24, an-dekha data): 1,111 trades, PF 1.26, t 3.35.',
      notes: [
        'Ye signals kisi buyer ko nahi jate: na Telegram, na push, na EA, na History.',
        'Har trade se price ka 0.06% kharcha kaata gaya hai. Khule trades ka "chalta R" abhi ki price se hai.',
        'Chand hafton ke trades se munafa SAABIT nahi hota — itne kam trades me achha ya bura dono ittefaq se ho sakta hai. Asal saboot 3 saal ka tasdeeqi imtihan hai; ye mode sirf ye dekhta hai ke aage ka data us se bohat alag to nahi, aur code sahi chal raha hai.',
        'Signal 4H candle band hone ke taqreeban 1 ghante baad yahan dikhta hai; entry ki price phir bhi wahi hai jo backtest me hoti (agli candle ka open).',
      ],
    };
  }
  async function shadow(force) {
    const now = Date.now();
    if (shadowCache.inflight) return shadowCache.inflight;
    if (shadowCache.data && now - shadowCache.at < (force ? 60000 : 15 * 60000)) return shadowCache.data;
    shadowCache.inflight = computeShadow(now).then(d => { shadowCache = { at: Date.now(), data: d, inflight: null }; return d; })
      .catch(e => { shadowCache.inflight = null; throw e; });
    return shadowCache.inflight;
  }

  function start(tf, pairIds, mode) {
    if (job.status === 'running') return { ok: false, message: 'Lab pehle se chal raha hai.' };
    if (mode === 'confirm' || mode === 'confirm-gold') {
      const setName = mode === 'confirm-gold' ? 'gold' : 'crypto', cp = CONFIRM_SETS[setName].pairs;
      job = { status: 'running', startedAt: Date.now(), tf: '1H', pairs: cp, progress: { done: 0, total: cp.length } };
      runConfirm(setName).then(result => { job = { status: 'done', startedAt: job.startedAt, tf: '1H', pairs: cp, result }; })
        .catch(e => { job = { status: 'error', startedAt: job.startedAt, tf: '1H', pairs: cp, message: String(e && e.message || e) }; });
      return { ok: true };
    }
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
  return { start, status, shadow, _computeShadow: computeShadow, _walkDetailed: walkDetailed, _sigBreakout: sigBreakout, _run: run, _runNew: runNew, _runConfirm: runConfirm, _prepare: prepare, _simulate: simulate, _features: features, _strategies: NEW_STRATEGIES, _walk: walk };
}

module.exports = { createLab, stats, adxSeries, labCost, GEOMETRIES, GATES, FILTER_SETS };
