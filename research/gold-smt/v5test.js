'use strict';
const fs = require('fs');
const { g, v3, get } = require('./v3run.js');
const raw = { gold1: get('XAUUSD'), partner1: get('XAGUSD'), partner2: get('DXY') };
const T0 = raw.gold1[0].t, T1 = raw.gold1[raw.gold1.length - 1].end, split = T0 + Math.round((T1 - T0) * 0.6);
const tst = rs => { const n = rs.length; if (n < 2) return null; const m = rs.reduce((a, b) => a + b, 0) / n, sd = Math.sqrt(rs.reduce((a, b) => a + (b - m) ** 2, 0) / (n - 1)); return +(m / (sd / Math.sqrt(n))).toFixed(2); };
const B = { entryMin: 3, keyTypes: 'fvg', eq: false, tpMode: 'h1swing', maxTries: 1, maxRR: 4, minRR: 1.5, zoneLifeH: 72 };
const V = [
  ['V4 asal', {}],
  ['HRLR E.Q (0.75 ATR, 60m)', { eqMode: 'fast', hrlrAtr: 0.75 }],
  ['HRLR E.Q (1.0 ATR, 60m)', { eqMode: 'fast', hrlrAtr: 1.0 }],
  ['HRLR E.Q (1.5 ATR, 60m)', { eqMode: 'fast', hrlrAtr: 1.5 }],
  ['HRLR E.Q (1.0 ATR, 30m)', { eqMode: 'fast', hrlrAtr: 1.0, hrlrMaxMin: 30 }],
  ['SMT Silver ya DXY', { smtWith: 'either' }],
  ['SMT ya + HRLR 1.0', { smtWith: 'either', eqMode: 'fast', hrlrAtr: 1.0 }],
  ['M2 asal', { entryMin: 2 }],
  ['M2 + HRLR 1.0', { entryMin: 2, eqMode: 'fast', hrlrAtr: 1.0 }],
  ['M2 + SMT ya', { entryMin: 2, smtWith: 'either' }],
  ['M2 + SMT ya + HRLR 1.0', { entryMin: 2, smtWith: 'either', eqMode: 'fast', hrlrAtr: 1.0 }],
];
const fmt = s => s.n ? `${s.n}/${s.winRate}%/${s.avgR > 0 ? '+' : ''}${s.avgR}` : '0';
const out = {};
for (const [name, o0] of V) {
  const o = { ...B, ...o0 };
  const al = v3.runV3(raw, o), tr = v3.runV3(raw, { ...o, to: split }).stats, te = v3.runV3(raw, { ...o, from: split }).stats;
  const ex = al.trades.filter(t => [Date.UTC(2026, 0, 2), Date.UTC(2026, 0, 5)].some(d => t.entryT >= d && t.entryT < d + 864e5)).map(t => t.dir + ' ' + new Date(t.entryT).toISOString().slice(5, 16) + ' ' + t.R.toFixed(2));
  out[name] = { opts: o, all: al.stats, t: tst(al.trades.map(t => t.R)), train: tr, test: te, money: al.money, years: al.byYear, byDir: al.byDir, trades: al.trades };
  console.log(name.padEnd(26), 'train', fmt(tr).padEnd(15), 'test', fmt(te).padEnd(15), 'all', fmt(al.stats).padEnd(15), 'PF', String(al.stats.pf).padEnd(5), 't', String(out[name].t).padEnd(5), 'ret', String(al.money.returnPct).padEnd(6), 'dd', String(al.money.maxDdPct).padEnd(5), 'yrs', Object.values(al.byYear).map(y => y.avgR).join('/'), '|', ex.join(', '));
}
fs.writeFileSync(process.argv[2], JSON.stringify({ split, out }, null, 1));
