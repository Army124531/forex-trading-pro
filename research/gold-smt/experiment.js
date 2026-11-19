// Gold SMT — accuracy experiment. Usage: node experiment.js GOLD.csv SILVER.csv OUT.json
// Train (pehla 60%) par aik aik setting badal kar dekhna, phir test (aakhri 40%) par jaanch.
'use strict';
const fs = require('fs');
const g = require('../../goldsmt.js');
const [goldCsv, silverCsv, outFile] = process.argv.slice(2);

function load(f) {
  const out = [];
  for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
    if (!line) continue;
    const [t, o, h, l, c] = line.split(',').map(Number);
    out.push({ t: t * 1000, end: t * 1000 + 60000, o, h, l, c });
  }
  return out;
}
const gold1 = load(goldCsv), silver1 = load(silverCsv);
const gold5 = g.resample(gold1, 5), silver5 = g.resample(silver1, 5);
const raw = { gold5, silver5 };
const T0 = gold5[0].t, T1 = gold5[gold5.length - 1].end;
const split = T0 + Math.round((T1 - T0) * 0.6);
console.log('data', new Date(T0).toISOString(), '->', new Date(T1).toISOString(), 'split', new Date(split).toISOString(), 'M5 bars', gold5.length);

function tstat(rs) { const n = rs.length; if (n < 2) return null; const m = rs.reduce((a, b) => a + b, 0) / n; const sd = Math.sqrt(rs.reduce((a, b) => a + (b - m) ** 2, 0) / (n - 1)); return sd ? +(m / (sd / Math.sqrt(n))).toFixed(2) : null; }
function run(opts, part) {
  const o = { ...opts };
  if (part === 'train') { o.to = split; }
  if (part === 'test') { o.from = split; }
  const r = g.runGoldSmt(raw, o);
  return { ...r.stats, t: tstat(r.trades.map(x => x.R)), ret: r.money.returnPct, dd: r.money.maxDdPct, r };
}
const short = (x) => ({ n: x.n, win: x.winRate, avgR: x.avgR, pf: x.pf, netR: x.netR, t: x.t, ret: x.ret, dd: x.dd });

const base = {};
const results = { split, data: { from: T0, to: T1 }, baseline: {}, steps: [], final: {} };
for (const part of ['train', 'test', 'all']) results.baseline[part] = short(run(base, part));
console.log('BASELINE', JSON.stringify(results.baseline));

// Badalne wali cheezein (har aik ki choices)
const FACTORS = {
  tp: ['1.5R', '2R', '3R', 'liq'],
  smt: [0, 1, 2],
  keyTypes: ['all', 'fvg', 'pd'],
  trend: ['none', 'h4'],
  session: [[7, 17], [7, 12], [12, 17], [1, 17]],
  csdBody: [0, 0.5],
  be: [false, true],
  maxRiskAtr: [2, 3],
};
const apply = (o, k, v) => k === 'session' ? { ...o, sessionStartUTC: v[0], sessionEndUTC: v[1] } : { ...o, [k]: v };
const score = (x) => x.n >= 30 ? x.avgR : -9; // kam az kam 30 trades, warna ginti nahi

let cur = { ...base };
let curScore = score(run(cur, 'train'));
for (let pass = 1; pass <= 2; pass++) {
  for (const k of Object.keys(FACTORS)) {
    let best = null;
    const tried = [];
    for (const v of FACTORS[k]) {
      const x = run(apply(cur, k, v), 'train');
      tried.push({ v, ...short(x) });
      if (!best || score(x) > best.s) best = { v, s: score(x) };
    }
    const changed = best.s > curScore + 0.02; // chhota farq = shor, nahi badalte
    if (changed) { cur = apply(cur, k, best.v); curScore = best.s; }
    results.steps.push({ pass, factor: k, tried, chosen: changed ? best.v : '(waisa hi)' });
    console.log('pass', pass, k, changed ? 'CHANGED ->' + JSON.stringify(best.v) : 'same', 'trainAvgR', curScore.toFixed(3));
  }
}
results.chosen = cur;
for (const part of ['train', 'test', 'all']) {
  const x = run(cur, part);
  results.final[part] = short(x);
  if (part === 'test') results.testTrades = x.r.trades;
  if (part === 'all') { results.allByMonth = x.r.byMonth; results.allByDir = x.r.byDir; results.allBySession = x.r.bySession; results.allByExit = x.r.byExit; results.funnel = x.r.funnel; }
}
// Baseline ki test trades bhi (muqable ke liye)
results.baselineTestTrades = run(base, 'test').r.trades;
console.log('CHOSEN', JSON.stringify(cur));
console.log('FINAL', JSON.stringify(results.final));
fs.writeFileSync(outFile, JSON.stringify(results, null, 1));
