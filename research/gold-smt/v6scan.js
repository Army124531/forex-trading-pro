'use strict';
// V6: zyada qism ke key levels — har aik alag, seekhne (60%) + imtihan (40%). Usage: node v6scan.js OUT.json [names...]
const fs = require('fs');
const { g, v3, get } = require('./v3run.js');
const raw = { gold1: get('XAUUSD'), partner1: get('XAGUSD') };
const T0 = raw.gold1[0].t, T1 = raw.gold1[raw.gold1.length - 1].end, split = T0 + Math.round((T1 - T0) * 0.6);
const months = (T1 - T0) / (30.4 * 864e5);
const tst = rs => { const n = rs.length; if (n < 2) return null; const m = rs.reduce((a, b) => a + b, 0) / n, sd = Math.sqrt(rs.reduce((a, b) => a + (b - m) ** 2, 0) / (n - 1)); return +(m / (sd / Math.sqrt(n))).toFixed(2); };
const V5 = { entryMin: 3, keyTypes: 'fvg', eq: false, eqMode: 'fast', hrlrAtr: 1.0, hrlrMaxMin: 30, tpMode: 'h1swing', maxTries: 1, maxRR: 4, minRR: 1.5, zoneLifeH: 72 };
const C = {
  'K1 H4 gap → H1 SMT → M3 (V5)': V5,
  'K2 H1 gap → M15 SMT → M3': { ...V5, keyMin: 60, smtMin: 15, zoneLifeH: 24, armH: 12 },
  'K3 H1 gap → M15 SMT → M1': { ...V5, keyMin: 60, smtMin: 15, entryMin: 1, zoneLifeH: 24, armH: 12 },
  'K4 M15 gap → M5 SMT → M1': { ...V5, keyMin: 15, smtMin: 5, entryMin: 1, zoneLifeH: 8, armH: 4, l2FreshMin: 30 },
  'K5 PDH/PDL → H1 SMT → M3': { ...V5, keyTypes: 'pdl' },
  'K6 PDH/PDL → M15 SMT → M3': { ...V5, keyTypes: 'pdl', smtMin: 15, armH: 12 },
  'K7 Asia high/low → M15 SMT → M3': { ...V5, keyTypes: 'asia', smtMin: 15, armH: 10 },
  'K8 Asia high/low → M5 SMT → M1': { ...V5, keyTypes: 'asia', smtMin: 5, entryMin: 1, armH: 10, l2FreshMin: 30 },
};
const only = process.argv.slice(3);
const out = {};
const fmt = s => s.n ? `${s.n}/${s.winRate}%/${s.avgR > 0 ? '+' : ''}${s.avgR}` : '0';
for (const [name, o] of Object.entries(C)) {
  if (only.length && !only.some(k => name.startsWith(k))) continue;
  const t0 = Date.now();
  const al = v3.runV3(raw, o);
  const Rs = al.trades.map(t => t.R);
  const tr = g.stats(al.trades.filter(t => t.entryT < split).map(t => t.R)), te = g.stats(al.trades.filter(t => t.entryT >= split).map(t => t.R));
  out[name] = { opts: o, stats: al.stats, t: tst(Rs), train: tr, test: te, money: al.money, years: al.byYear, byDir: al.byDir, perMonth: +(al.trades.length / months).toFixed(1), trades: al.trades };
  console.log(name.padEnd(34), (out[name].perMonth + '/mah').padEnd(9), 'all', fmt(al.stats).padEnd(17), 'PF', String(al.stats.pf).padEnd(5), 't', String(out[name].t).padEnd(6), 'train', fmt(tr).padEnd(16), 'test', fmt(te).padEnd(16), 'yrs', Object.values(al.byYear).map(y => y.avgR).join('/'), ` (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
}
fs.writeFileSync(process.argv[2], JSON.stringify({ split, out }, null, 1));
