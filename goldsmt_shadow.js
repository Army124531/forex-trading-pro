// Forex Trading Pro — Gold SMT V5 KHAMOSH MODE (silent / shadow)
// SIRF admin dekhta hai. Koi signal kisi buyer ko nahi jata: na Telegram, na push, na EA, na History.
// Live signal engine se koi talluq nahi.
//
// Har run: Yahoo Finance se Gold (GC=F) aur Silver (SI=F) ka 1-minute data (pichle 7 din), phir V5 ke
// bilkul wahi rules (goldsmt_v3.js, settings neeche V5 me pakki). Sirf woh trades GINI jati hain jin ki
// entry khamosh mode shuru hone (startAt) ke baad hai. Band trade aik dafa save ho kar nahi badalti.
// Server so jaye (Render free plan) to bhi agli dafa 7 din ke andar ki trades khud pakar li jati hain.
'use strict';
const g = require('./goldsmt');
const v3 = require('./goldsmt_v3');

// V5 — 3 saal ke backtest (Jan 2024 – Nov 2026) ke baad pakki ki gayi settings. Inhein nateeja dekh kar na badlein.
const V5 = { entryMin: 3, keyTypes: 'fvg', eq: false, eqMode: 'fast', hrlrAtr: 1.0, hrlrMaxMin: 30, tpMode: 'h1swing', maxTries: 1, maxRR: 4, minRR: 1.5, zoneLifeH: 72, partner: 'silver' };
const REFRESH_MS = 5 * 60 * 1000;
// Khamosh mode ki pakki shuruat. Server restart / naye deploy par bhi yahi rehti hai, is liye 7 din ke andar
// ki trades dobara mil jati hain.
const START = Date.UTC(2026, 10, 19);
const DAY = 86400000;

function createGoldSmtShadow({ fetchJson, getDb, saveDb }) {
  let inflight = null;

  function state() {
    const db = getDb();
    if (!db.goldSmtShadow) db.goldSmtShadow = { startAt: START, trades: {}, lastRun: null, lastError: null, recent: [], funnel: null, dataTo: null, bars: 0 };
    return db.goldSmtShadow;
  }

  async function load(sym) {
    const url = 'https://query1.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(sym) + '?interval=1m&range=7d';
    return g.fromYahoo(await fetchJson(url, 20000), 1);
  }

  // Aik trade ko save karne ki shakal
  function shape(t, lastClose) {
    const open = t.reason === 'Data khatam';
    const dirSign = t.dir === 'BUY' ? 1 : -1;
    return {
      key: t.dir + '|' + t.entryT, pair: 'XAUUSD', dir: t.dir, entryAt: t.entryT,
      entry: +t.entry.toFixed(2), sl: +t.sl.toFixed(2), tp: +t.tp.toFixed(2), rr: +t.rr.toFixed(2),
      status: open ? 'Open' : t.R > 0 ? 'Win' : 'Loss', exit: open ? null : t.reason,
      r: open ? null : +t.R.toFixed(2),
      runningR: open && lastClose != null ? +(((lastClose - t.entry) * dirSign - g.COST) / t.risk).toFixed(2) : null,
      exitAt: open ? null : t.exitT, gapTop: +t.zoneTop.toFixed(2), gapBottom: +t.zoneBottom.toFixed(2),
    };
  }

  async function run() {
    const st = state();
    try {
      const gold1 = await load('GC=F');
      const silver1 = await load('SI=F');
      if (gold1.length < 2000 || silver1.length < 2000) throw new Error('Yahoo se 1-minute data kam aaya (gold ' + gold1.length + ', silver ' + silver1.length + ')');
      const r = v3.runV3({ gold1, partner1: silver1 }, V5);
      const lastClose = gold1[gold1.length - 1].c;
      for (const t of r.trades) {
        const s = shape(t, lastClose);
        const prev = st.trades[s.key];
        if (t.entryT >= st.startAt) {
          if (!prev || prev.status === 'Open') st.trades[s.key] = s; // band trade dobara nahi badalti
        }
      }
      // Jo trades abhi bhi 'Open' save hain magar ab is 7 din ki khirki me nahi (bohat purani), unhein wahi rehne dein.
      st.recent = r.trades.filter(t => t.entryT < st.startAt).map(t => shape(t, lastClose)).slice(-10);
      st.funnel = r.funnel;
      st.dataTo = gold1[gold1.length - 1].end;
      st.bars = gold1.length;
      st.lastRun = Date.now();
      st.lastError = null;
    } catch (e) {
      st.lastRun = Date.now();
      st.lastError = e.message;
    }
    saveDb();
  }

  function refresh() {
    if (!inflight) inflight = run().finally(() => { inflight = null; });
    return inflight;
  }

  async function status(force) {
    const st = state();
    if (force || !st.lastRun || Date.now() - st.lastRun > 3 * 60 * 1000) await refresh();
    const all = Object.values(st.trades).sort((a, b) => b.entryAt - a.entryAt);
    const closed = all.filter(t => t.status !== 'Open').sort((a, b) => a.exitAt - b.exitAt);
    const s = g.stats(closed.map(t => t.r));
    const days = Math.max(0, (Date.now() - st.startAt) / DAY);
    // Faisle ke usool — pehle se likhe hue (backtest: 34 trades / 3 saal, ausat +0.86R, sab se bara girao 5.6R)
    let stage, advice;
    if (st.lastError && !st.dataTo) { stage = 'nodata'; advice = 'Data nahi mila: ' + st.lastError + '. Thori der baad dobara dekhein.'; }
    else if (s.n >= 8 && s.netR <= -6) { stage = 'stop'; advice = 'RUK JAYEIN: ' + s.n + ' band trades me ' + s.netR + 'R. Ye backtest ke sab se bure daur (−5.6R) se bhi neeche hai. Live na lagayein, pehle wajah dekhein.'; }
    else if (s.n < 12 || days < 120) { stage = 'wait'; advice = 'Intezaar: faisle ke liye kam se kam 12 band trades aur 120 din chahiye (abhi ' + s.n + ' trades, ' + Math.floor(days) + ' din). Ye strategy mahine me taqreeban 1 trade deti hai.'; }
    else if (s.netR > 0 && s.pf != null && s.pf >= 1) { stage = 'ok'; advice = 'Khamosh mode backtest ke mutabiq musbat hai (' + s.n + ' trades, +' + s.netR + 'R, PF ' + s.pf + '). Ab malik faisla karein ke demo/live par lagana hai ya nahi.'; }
    else { stage = 'weak'; advice = s.n + ' trades ke baad nateeja musbat nahi (' + s.netR + 'R). Live na lagayein.'; }
    return {
      strategy: 'Gold SMT V5 · H4 gap (failed to manipulate) · H1 2-stage SMT (Silver) · M3 CSD · HRLR par E.Q · TP taaza H1 swing · RR 1.5–4',
      market: 'Gold futures (GC=F) + Silver (SI=F), Yahoo 1-minute',
      startAt: st.startAt, asOf: st.lastRun, dataTo: st.dataTo, bars: st.bars, days: +days.toFixed(1),
      stats: s, open: all.filter(t => t.status === 'Open').length, stage, advice,
      trades: all.slice(0, 200), recent: st.recent || [], funnel: st.funnel, lastError: st.lastError,
      pairs: [{ pair: 'XAUUSD', bars: st.bars, used: !!st.dataTo }],
      reference: 'Backtest (HistData spot, Jan 2024 – Nov 2026): 34 trades, 59% jeet, ausat +0.86R, PF 2.92, sab se bara girao 5.6R.',
      notes: [
        'Ye signals kisi buyer ko nahi jate: na Telegram, na push, na EA, na History. Live engine bilkul nahi badla.',
        'Har 5 minute par check hota hai. Signal M3 candle band hone ke baad bana, entry agli candle ke open par (backtest jaisa).',
        'Prices gold futures (GC=F) ki hain, spot XAUUSD se kuch dollar upar ho sakti hain. SL/TP ka R wahi rehta hai.',
        'Har trade se $0.30 spread kaata gaya. Khule trades ka "chalta R" abhi ki price se hai.',
        'Kam trades se munafa ya nuqsan saabit nahi hota. Ye mode sirf ye dekhta hai ke aage ka data backtest se bohat alag to nahi.',
      ],
      settings: V5,
    };
  }

  function start() {
    setTimeout(() => { refresh().catch(() => {}); }, 20000);
    setInterval(() => { refresh().catch(() => {}); }, REFRESH_MS);
  }

  return { status, refresh, start, V5 };
}

module.exports = { createGoldSmtShadow, V5 };
