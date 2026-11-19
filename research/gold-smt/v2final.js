'use strict';
const fs = require('fs');
const { load, g, v2 } = require('./v2run.js');
const gold5 = g.resample(load('hist/XAUUSD.csv'), 5);
const P = { silver: g.resample(load('hist/XAGUSD.csv'), 5), dxy: g.resample(load('hist/DXY.csv'), 5) };
const T0 = gold5[0].t, T1 = gold5[gold5.length - 1].end, split = T0 + Math.round((T1 - T0) * 0.6);
const tst = rs => { const n = rs.length; if (n < 2) return null; const m = rs.reduce((a, b) => a + b, 0) / n, sd = Math.sqrt(rs.reduce((a, b) => a + (b - m) ** 2, 0) / (n - 1)); return +(m / (sd / Math.sqrt(n))).toFixed(2); };
const C = {
  'V1 (pehla code, behtar setting)': null,
  'V2 asal (Silver SMT)': { partner: 'silver' },
  'V2 + RR 4 tak (Silver)': { partner: 'silver', maxRR: 4 },
  'V2 + RR 1.5-4 (Silver)': { partner: 'silver', maxRR: 4, minRR: 1.5 },
  'V2 + RR 4 tak (DXY)': { partner: 'dxy', maxRR: 4 },
};
const out = {};
for (const [name, o] of Object.entries(C)) {
  if (!o) continue;
  const raw = { gold5, partner5: P[o.partner] };
  const r = v2.runV2(raw, o), tr = v2.runV2(raw, { ...o, to: split }).stats, te = v2.runV2(raw, { ...o, from: split }).stats;
  const Rs = r.trades.map(t => t.R);
  const c2 = g.stats(r.trades.map(t => t.R - 0.30 / t.risk));
  out[name] = { opts: o, stats: r.stats, t: tst(Rs), money: r.money, train: tr, test: te, byYear: r.byYear, byDir: r.byDir, bySession: r.bySession, byExit: r.byExit, cost2x: c2, avgRR: r.avgRR, trades: r.trades, byMonth: r.byMonth };
  const s = r.stats;
  console.log('\n== ' + name);
  console.log(` ${s.n} trades, win ${s.winRate}%, avgR ${s.avgR}, PF ${s.pf}, netR ${s.netR}, t ${tst(Rs)} | 10k -> ${r.money.end} (${r.money.returnPct}%), maxDD ${r.money.maxDdPct}% | avg RR ${r.avgRR}`);
  console.log(` train ${tr.n}/${tr.avgR}  test ${te.n}/${te.avgR} | spread 2x: avgR ${c2.avgR} PF ${c2.pf}`);
  console.log(' years', Object.entries(r.byYear).map(([y, x]) => `${y}: ${x.n}tr ${x.avgR}R PF ${x.pf}`).join(' | '));
  console.log(' dir', Object.entries(r.byDir).map(([k, x]) => `${k} ${x.n}/${x.avgR}`).join(' '), '| sess', Object.entries(r.bySession).map(([k, x]) => `${k} ${x.n}/${x.avgR}`).join(' '), '| exit', Object.entries(r.byExit).map(([k, x]) => `${k}:${x.n}`).join(' '));
  const months = Object.values(r.byMonth); console.log(' months +', months.filter(m => m.netR > 0).length, '/', months.length);
}
fs.writeFileSync(process.argv[2], JSON.stringify({ split, out }, null, 1));
