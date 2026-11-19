'use strict';
const fs = require('fs'); const g = require('../../goldsmt.js');
const load = f => fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map(l => { const [t, o, h, lo, c] = l.split(',').map(Number); return { t: t * 1000, end: t * 1000 + 60000, o, h, l: lo, c }; });
const raw = { gold5: g.resample(load(process.argv[2]), 5), silver5: g.resample(load(process.argv[3]), 5) };
const T0 = raw.gold5[0].t, T1 = raw.gold5[raw.gold5.length - 1].end, split = T0 + Math.round((T1 - T0) * 0.6);
const tst = rs => { const n = rs.length, m = rs.reduce((a, b) => a + b, 0) / n, sd = Math.sqrt(rs.reduce((a, b) => a + (b - m) ** 2, 0) / (n - 1)); return +(m / (sd / Math.sqrt(n))).toFixed(2); };
const C = {
  'Asal (pehli setting)': {},
  'SMT sirf M30 + TP 1.5R': { smt: 1, tp: '1.5R' },
  'SMT sirf M30 + TP 1.5R + BE': { smt: 1, tp: '1.5R', be: true },
  'SMT ke baghair (muqabla)': { smt: 0 },
};
const out = {};
for (const [name, o] of Object.entries(C)) {
  const r = g.runGoldSmt(raw, o), tr = g.runGoldSmt(raw, { ...o, to: split }).stats, te = g.runGoldSmt(raw, { ...o, from: split }).stats;
  const Rs = r.trades.map(t => t.R);
  const byYear = {}; for (const t of r.trades) { const y = new Date(t.entryT).getUTCFullYear(); (byYear[y] = byYear[y] || []).push(t.R); }
  const cost2 = r.trades.map(t => t.R - 0.30 / t.risk); // spread $0.60
  out[name] = { opts: o, stats: r.stats, t: tst(Rs), money: r.money, train: tr, test: te, byDir: r.byDir, bySession: r.bySession, byExit: r.byExit,
    byYear: Object.fromEntries(Object.entries(byYear).map(([y, a]) => [y, g.stats(a)])), cost2x: g.stats(cost2), avgRisk: +(r.trades.reduce((a, t) => a + t.risk, 0) / r.trades.length).toFixed(2), trades: r.trades, byMonth: r.byMonth, data: r.data, funnel: r.funnel };
  const s = r.stats;
  console.log('\n== ' + name, JSON.stringify(o));
  console.log(` trades ${s.n} win ${s.winRate}% avgR ${s.avgR} PF ${s.pf} netR ${s.netR} t ${tst(Rs)} | 10k -> ${r.money.end} (${r.money.returnPct}%) maxDD ${r.money.maxDdPct}% | avg SL ${out[name].avgRisk}`);
  console.log(` train ${tr.n}/${tr.avgR} test ${te.n}/${te.avgR} | spread 2x: avgR ${out[name].cost2x.avgR} PF ${out[name].cost2x.pf}`);
  console.log(' years', Object.entries(out[name].byYear).map(([y, x]) => `${y}: ${x.n} tr ${x.avgR}R PF ${x.pf}`).join(' | '));
  console.log(' dir', `BUY ${r.byDir.BUY.n}/${r.byDir.BUY.avgR}`, `SELL ${r.byDir.SELL.n}/${r.byDir.SELL.avgR}`, '| sess', `Lon ${r.bySession.London.n}/${r.bySession.London.avgR}`, `NY ${r.bySession['New York'].n}/${r.bySession['New York'].avgR}`, '| exits', r.byExit.map(x => x.reason + ':' + x.n).join(' '));
}
fs.writeFileSync(process.argv[4], JSON.stringify({ split, out }, null, 1));
