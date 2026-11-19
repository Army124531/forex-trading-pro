'use strict';
const fs = require('fs');
const { g, v3, get } = require('./v3run.js');
const raw = { gold1: get('XAUUSD'), partner1: get('XAGUSD') };
const T0 = raw.gold1[0].t, T1 = raw.gold1[raw.gold1.length - 1].end, split = T0 + Math.round((T1 - T0) * 0.6);
const tst = rs => { const n = rs.length; if (n < 2) return null; const m = rs.reduce((a, b) => a + b, 0) / n, sd = Math.sqrt(rs.reduce((a, b) => a + (b - m) ** 2, 0) / (n - 1)); return +(m / (sd / Math.sqrt(n))).toFixed(2); };
const V2B = { entryMin: 5, keyTypes: 'fvg', eq: false, tpMode: 'between', maxTries: 1, maxRR: 4, minRR: 1.5 };
const C = {
  'V2 best (M5, TP beech ka high)': V2B,
  'V3: M3 + TP taaza H1 swing': { ...V2B, entryMin: 3, tpMode: 'h1swing' },
  'V3 + sirf New York (12-17 UTC)': { ...V2B, entryMin: 3, tpMode: 'h1swing', sessionStartUTC: 12, sessionEndUTC: 17 },
  'V3 + range level bhi': { ...V2B, entryMin: 3, tpMode: 'h1swing', keyTypes: 'both' },
};
const out = {};
for (const [name, o] of Object.entries(C)) {
  const r = v3.runV3(raw, o), tr = v3.runV3(raw, { ...o, to: split }).stats, te = v3.runV3(raw, { ...o, from: split }).stats;
  const Rs = r.trades.map(t => t.R), c2 = g.stats(r.trades.map(t => t.R - 0.30 / t.risk));
  const months = Object.values(r.byMonth);
  out[name] = { opts: o, stats: r.stats, t: tst(Rs), money: r.money, train: tr, test: te, byYear: r.byYear, byDir: r.byDir, bySession: r.bySession, byExit: r.byExit, cost2x: c2, avgRR: r.avgRR, trades: r.trades, monthsPos: months.filter(m => m.netR > 0).length, months: months.length };
  const s = r.stats;
  console.log('\n== ' + name);
  console.log(` ${s.n} trades, win ${s.winRate}%, avgR ${s.avgR}, PF ${s.pf}, netR ${s.netR}, t ${tst(Rs)} | 10k -> ${r.money.end} (${r.money.returnPct}%), maxDD ${r.money.maxDdPct}% | avgRR ${r.avgRR}`);
  console.log(` train ${tr.n}/${tr.avgR}  test ${te.n}/${te.avgR} | spread 2x: avgR ${c2.avgR} PF ${c2.pf} | months+ ${out[name].monthsPos}/${months.length}`);
  console.log(' years', Object.entries(r.byYear).map(([y, x]) => `${y}: ${x.n}tr ${x.winRate}% ${x.avgR}R PF ${x.pf}`).join(' | '));
  console.log(' dir', Object.entries(r.byDir).map(([k, x]) => `${k} ${x.n}/${x.avgR}`).join(' '), '| sess', Object.entries(r.bySession).map(([k, x]) => `${k} ${x.n}/${x.avgR}`).join(' '), '| exit', Object.entries(r.byExit).map(([k, x]) => `${k}:${x.n}`).join(' '), '| maxDdR', s.maxDdR);
  console.log(' examples', JSON.stringify(r.trades.filter(t => [Date.UTC(2026, 0, 2), Date.UTC(2026, 0, 5)].some(d => t.entryT >= d && t.entryT < d + 864e5)).map(t => [t.dir, new Date(t.entryT).toISOString().slice(0, 16), +t.entry.toFixed(2), t.reason, +t.R.toFixed(2)])));
}
fs.writeFileSync(process.argv[2], JSON.stringify({ split, out }, null, 1));
