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

  function start(tf, pairIds) {
    if (job.status === 'running') return { ok: false, message: 'Lab pehle se chal raha hai.' };
    if (!TF[tf]) return { ok: false, message: 'Timeframe 15m ya 1H ho.' };
    const ids = (pairIds || []).filter(id => PAIRS.some(p => p.id === id));
    if (!ids.length) return { ok: false, message: 'Kam se kam aik pair chunein.' };
    job = { status: 'running', startedAt: Date.now(), tf, pairs: ids, progress: { done: 0, total: ids.length } };
    run(tf, ids).then(result => { job = { status: 'done', startedAt: job.startedAt, tf, pairs: ids, result }; })
      .catch(e => { job = { status: 'error', startedAt: job.startedAt, tf, pairs: ids, message: String(e && e.message || e) }; });
    return { ok: true };
  }
  function status() { return job; }
  return { start, status, _run: run, _prepare: prepare, _simulate: simulate };
}

module.exports = { createLab, stats, adxSeries, labCost, GEOMETRIES, GATES, FILTER_SETS };
