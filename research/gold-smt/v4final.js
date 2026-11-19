'use strict';
const fs = require('fs');
const { g, v3, get } = require('./v3run.js');
const raw = { gold1: get('XAUUSD'), partner1: get('XAGUSD') };
const T0 = raw.gold1[0].t, T1 = raw.gold1[raw.gold1.length - 1].end, split = T0 + Math.round((T1 - T0) * 0.6);
const tst = rs => { const n = rs.length; if (n < 2) return null; const m = rs.reduce((a, b) => a + b, 0) / n, sd = Math.sqrt(rs.reduce((a, b) => a + (b - m) ** 2, 0) / (n - 1)); return +(m / (sd / Math.sqrt(n))).toFixed(2); };
const V3B = { entryMin: 3, keyTypes: 'fvg', eq: false, tpMode: 'h1swing', maxTries: 1, maxRR: 4, minRR: 1.5 };
const T = { zoneLifeH: 72, minRR: 2 };
const C = {
  'V4 (M3, zone 72h, minRR 1.5)': { ...V3B, zoneLifeH: 72 },
  'V4 M2 (zone 72h, minRR 1.5)': { ...V3B, zoneLifeH: 72, entryMin: 2 },
  'V3 (M3)': V3B,
  'V4 M3 (zone 72h, minRR 2)': { ...V3B, ...T },
  'V4 M2 (zone 72h, minRR 2)': { ...V3B, ...T, entryMin: 2 },
  'V4 M1 (zone 72h, minRR 2)': { ...V3B, ...T, entryMin: 1 },
  'V4 M3 + SL buf 0.25': { ...V3B, ...T, slBuf: 0.25 },
};
const out = {};
for (const [name, o] of Object.entries(C)) {
  const r = v3.runV3(raw, o), tr = v3.runV3(raw, { ...o, to: split }).stats, te = v3.runV3(raw, { ...o, from: split }).stats;
  const Rs = r.trades.map(t => t.R);
  const c2 = g.stats(r.trades.map(t => t.R - 0.30 / t.risk)), c3 = g.stats(r.trades.map(t => t.R - 0.70 / t.risk));
  const months = Object.values(r.byMonth);
  const avgRisk = r.trades.reduce((a, t) => a + t.risk, 0) / r.trades.length;
  out[name] = { opts: o, stats: r.stats, t: tst(Rs), money: r.money, train: tr, test: te, byYear: r.byYear, byDir: r.byDir, bySession: r.bySession, byExit: r.byExit, cost2x: c2, cost3x: c3, avgRR: r.avgRR, avgRisk, trades: r.trades, monthsPos: months.filter(m => m.netR > 0).length, months: months.length };
  const s = r.stats;
  console.log('\n== ' + name);
  console.log(` ${s.n} trades, win ${s.winRate}%, avgR ${s.avgR}, PF ${s.pf}, t ${tst(Rs)} | 10k -> ${r.money.end} (${r.money.returnPct}%), maxDD ${r.money.maxDdPct}% (${s.maxDdR}R) | avgRR ${r.avgRR}, avg SL $${avgRisk.toFixed(2)}`);
  console.log(` train ${tr.n}/${tr.avgR}  test ${te.n}/${te.avgR} | spread $0.60: ${c2.avgR}R PF ${c2.pf} | spread $1.00: ${c3.avgR}R PF ${c3.pf} | months+ ${out[name].monthsPos}/${months.length}`);
  console.log(' years', Object.entries(r.byYear).map(([y, x]) => `${y}: ${x.n}tr ${x.winRate}% ${x.avgR}R`).join(' | '), '| dir', Object.entries(r.byDir).map(([k, x]) => `${k} ${x.n}/${x.avgR}`).join(' '), '| sess', Object.entries(r.bySession).map(([k, x]) => `${k} ${x.n}/${x.avgR}`).join(' '));
  console.log(' 5 Jan', JSON.stringify(r.trades.filter(t => t.entryT >= Date.UTC(2026, 0, 5) && t.entryT < Date.UTC(2026, 0, 6)).map(t => [t.dir, new Date(t.entryT).toISOString().slice(11, 16), +t.entry.toFixed(2), +t.sl.toFixed(2), +t.tp.toFixed(2), t.reason, +t.R.toFixed(2)])));
}
fs.writeFileSync(process.argv[2], JSON.stringify({ split, out }, null, 1));
