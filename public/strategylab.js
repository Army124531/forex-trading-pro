// Forex Trading Pro — Strategy Lab ka UI (v10.4). Terminal Backtest card ke andar dikhta hai, sirf admin ko.
// app.js ke api(), esc(), me, showTab() use karta hai. Sirf research — koi setting ya signal nahi badalta.
// v10.4: tables me IMTIHAN wale columns pehle (screenshot/PDF me kat na jayein), aur tasdeeqi imtihan ka mode.
(function () {
  'use strict';
  let timer = null;
  function el(id) { return document.getElementById(id); }
  function isAdmin() { return typeof me !== 'undefined' && me && me.role === 'admin'; }
  function num(v, suffix) { return v == null ? '—' : v + (suffix || ''); }
  function rCls(v) { return v == null ? '' : v > 0 ? 'up' : v < 0 ? 'down' : 'wait'; }
  function rTxt(v) { return v == null ? '—' : (v > 0 ? '+' : '') + v + 'R'; }
  function day(ms) { return ms ? new Date(ms).toISOString().slice(0, 10) : '—'; }

  function statCells(s) {
    if (!s) return '<td>—</td><td>—</td><td>—</td><td>—</td>';
    return '<td>' + s.n + '</td><td>' + num(s.winRate, '%') + '</td><td class="' + rCls(s.avgR) + '"><b>' + rTxt(s.avgR) + '</b></td><td>' + num(s.pf) + '</td>';
  }
  function verdictHtml(v) {
    if (v === 'JEETA') return '<span class="buy"><b>JEETA</b></span>';
    if (v === 'KAMZOR') return '<span class="wait">kamzor</span>';
    return '<span class="sell">nahi</span>';
  }
  const TBL = '<div class="table-wrap"><table class="lab-table">';
  // Imtihan pehle: faisla isi par hota hai, aur tang screen par dayen wale columns kat jate hain.
  const HEAD = '<tr><th>Version</th><th>Nateeja</th><th>Trades</th><th>Win %</th><th>Ausat</th><th>PF</th><th>Pairs +</th><th>Trades</th><th>Win %</th><th>Ausat</th><th>PF</th></tr>';
  const GROUP_HEAD = '<tr><th></th><th></th><th colspan="5">IMTIHAN wala hissa (40%) — faisla is par</th><th colspan="4">Seekhne wala hissa (60%)</th></tr>';
  function row(r, withVerdict) {
    return '<tr><td class="lab-name">' + (r.isBaseline ? '<b>AAJ KA ENGINE</b><br>' : '') + esc(r.name) + '</td><td>' + (withVerdict ? verdictHtml(r.verdict) : '') + '</td>' +
      statCells(r.test) + '<td>' + r.pairsPositive + '/' + r.pairsTested + '</td>' + statCells(r.train) + '</tr>';
  }
  // Tasdeeqi imtihan: sirf imtihan (poora data an-dekha hai) + saal ba saal.
  const C_HEAD = '<tr><th>Version</th><th>Nateeja</th><th>Trades</th><th>Win %</th><th>Ausat</th><th>PF</th><th>t</th><th>Pairs +</th><th>Saal +</th></tr>';
  function cRow(r, withVerdict) {
    const t = r.test;
    return '<tr><td class="lab-name">' + esc(r.name) + (r.why ? '<br><span class="fine">' + esc(r.why) + '</span>' : '') + '</td><td>' + (withVerdict ? verdictHtml(r.verdict) : '') + '</td>' +
      statCells(t) + '<td>' + num(t.tStat) + '</td><td>' + r.pairsPositive + '/' + r.pairsTested + '</td><td>' + r.yearsPositive + '/' + r.yearsCounted + '</td></tr>';
  }
  function yearTable(r) {
    return '<p class="fine"><b>' + esc(r.name) + '</b> — saal ba saal</p>' + TBL + '<tr><th>Saal</th><th>Trades</th><th>Win %</th><th>Ausat</th><th>PF</th></tr>' +
      (r.byYear || []).map(y => '<tr><td>' + y.year + '</td>' + statCells(y) + '</tr>').join('') + '</table></div>';
  }

  // v10.7: kharcha barha kar wohi trades — munafa kitne kharche tak bachta hai.
  function costTable(r) {
    const c = r.costs;
    return '<p class="fine"><b>' + esc(r.name) + '</b> — kharche ka test (wohi trades, sirf kharcha zyada). Aik trade ausat ' + c.avgDays + ' din khuli rehti hai; imtihan wala kharcha ausat ' + c.avgCostR + 'R fi trade tha.</p>' +
      TBL + '<tr><th>Kharcha</th><th>Trades</th><th>Win %</th><th>Ausat</th><th>PF</th><th>t</th></tr>' +
      c.rows.map(x => '<tr><td class="lab-name">' + esc(x.name) + '</td>' + statCells(x) + '<td>' + num(x.tStat) + '</td></tr>').join('') + '</table></div>' +
      '<p class="fine">Agar "Kharcha 2.5x + swap" wali line par bhi ausat musbat aur PF 1.10 se upar rahe, to tareeqa aam broker ke kharche bardasht kar sakta hai. Agar wahan manfi ho jaye, to sirf kam kharche wale broker ya bare coins par chalana parega. Apne broker ka asal spread aur swap dekh kar muqabla karein.</p>';
  }

  function renderConfirm(d) {
    let h = '<h4>' + (d.candidates.length === 1 ? 'Umeedwar (pehle se pakka kiya gaya)' : 'Do umeedwar (pehle se pakke kiye gaye)') + '</h4>';
    h += d.candidates.length ? TBL + C_HEAD + d.candidates.map(r => cRow(r, true)).join('') + '</table></div>' : '<p>Umeedwar nahi mile.</p>';
    h += '<p class="fine">"JEETA" tabhi: 80+ trades, ausat munafa musbat, PF 1.15+, t 2.5+, 60%+ pairs munafe me, aur taqreeban har saal musbat (munafa sirf aik saal par na tika ho). Ausat = har trade ka ausat munafa R me. PF 1.00 = barabar.</p>';
    h += d.candidates.map(yearTable).join('');
    h += d.candidates.filter(r => r.costs).map(costTable).join('');
    if (d.all && d.all.length) {
      h += '<h4>Baaqi tareeqe isi purane data par (sirf dekhne ke liye)</h4>' + TBL + C_HEAD + d.all.map(r => cRow(r, false)).join('') + '</table></div>';
      h += '<p class="fine">Is table se ab kuch chunna phir wohi ghalti hogi (imtihan dekh kar jawab chunna). Faisla sirf upar wale do umeedwaron par hai.</p>';
    }
    return h;
  }

  function renderResult(d) {
    const used = d.pairs.filter(p => p.used), skipped = d.pairs.filter(p => !p.used);
    let h = '<p class="notice-banner"><b>Faisla:</b> ' + esc(d.verdict) + '</p>';
    h += '<p class="fine">' + esc(d.tfLabel) + ' · ' + used.length + ' pairs · ' + d.variantsTested + (d.mode === 'confirm' ? ' umeedwar' : ' versions aazmaye') + ' · ' + esc(d.splitNote) + '</p>';
    if (d.mode === 'confirm') h += renderConfirm(d);
    else {
      if (d.baseline) h += '<h4>Aaj ka live engine (kharcha kaat kar)</h4>' + TBL + GROUP_HEAD + HEAD + row(d.baseline, false) + '</table></div>';
      h += '<h4>Sab se behtar 5 versions (seekhne wale hisse par chune gaye)</h4>';
      h += d.top.length ? TBL + GROUP_HEAD + HEAD + d.top.map(r => row(r, true)).join('') + '</table></div>' : '<p>Kisi version ke kaafi trades nahi bane.</p>';
      h += '<p class="fine">"JEETA" tabhi likha jata hai jab imtihan wale hisse me: 80+ trades, ausat munafa musbat, PF 1.15+, nateeja ittefaq se door (t 2.5+), aur 60%+ pairs munafe me hon. Ausat = har trade ka ausat munafa R me (1R = SL tak ka risk). PF 1.00 = barabar.</p>';
      if (d.geometryOnly && d.geometryOnly.length) {
        h += '<h4>Sirf SL/TP badalne ka asar (baaki sab aaj jaisa)</h4>' + TBL + GROUP_HEAD + HEAD + d.geometryOnly.map(r => row(r, false)).join('') + '</table></div>';
        h += '<p class="fine">Agar yahan sab versions ka ausat taqreeban barabar (ya manfi) ho, to matlab SL/TP badalne se win rate badalta hai, munafa nahi.</p>';
      }
      if (d.all && d.all.length) {
        h += '<h4>Sab naye tareeqe (imtihan wale hisse ke ausat ke hisaab se)</h4>' + TBL + GROUP_HEAD + HEAD + d.all.map(r => row(r, false)).join('') + '</table></div>';
        h += '<p class="fine">Ye table sirf dekhne ke liye hai. Faisla sirf upar wali 5 lines se hota hai, kyunke wo imtihan dekhe baghair chuni gayi thin.</p>';
      }
    }
    h += '<h4>Data</h4><p class="fine">' + used.map(p => esc(p.pair) + ': ' + p.bars + ' candles (' + day(p.from) + ' se ' + day(p.to) + ', ' + esc(p.source || '') + ')').join(' · ') + '</p>';
    if (skipped.length) h += '<p class="fine">Chhore gaye: ' + skipped.map(p => esc(p.pair) + ' (' + esc(p.note || '') + ')').join(', ') + '</p>';
    h += '<p class="fine">' + esc(d.costNote) + '</p><p class="fine">' + esc(d.limits) + '</p>';
    el('labBody').innerHTML = h;
  }

  function renderStatus(s) {
    const btn = el('labRunBtn');
    if (s.status === 'running') {
      if (btn) btn.disabled = true;
      const p = s.progress || {};
      const pct = p.frac != null && p.step === 'candles' ? ' · data ' + Math.round(Math.min(1, p.frac) * 100) + '%' : '';
      el('labBody').innerHTML = '<p>Lab chal raha hai… pair ' + ((p.done || 0) + 1) + '/' + (p.total || '?') + (p.pair ? ' (' + esc(p.pair) + ')' : '') + pct + '. Is me 1-5 minute lag sakte hain — page khula rakhein.</p>';
      return true;
    }
    if (btn) btn.disabled = false;
    if (s.status === 'done' && s.result) renderResult(s.result);
    else if (s.status === 'error') el('labBody').innerHTML = '<p class="sell">Lab nakaam: ' + esc(s.message || '') + '</p>';
    return false;
  }

  async function poll() {
    clearTimeout(timer);
    if (!isAdmin() || !el('labBody')) return;
    try {
      const s = await api('/api/terminal/backtest/lab');
      if (renderStatus(s)) timer = setTimeout(poll, 3000);
    } catch (e) { el('labBody').innerHTML = '<p>' + esc(e.message) + '</p>'; }
  }

  window.labRun = async function () {
    if (!isAdmin()) return;
    try {
      const mode = el('labMode') ? el('labMode').value : 'engine';
      await api('/api/terminal/backtest/lab', { method: 'POST', body: JSON.stringify({ mode: mode, tf: el('labTf').value, group: el('labGroup').value }) });
      el('labBody').innerHTML = '<p>Lab shuru ho gaya…</p>';
    } catch (e) { el('labBody').innerHTML = '<p>' + esc(e.message) + '</p>'; }
    timer = setTimeout(poll, 1500);
  };
  // Naye tareeqe hamesha 1H par; tasdeeqi imtihan ka timeframe aur pairs dono pakke hain.
  window.labModeChanged = function () {
    const mode = el('labMode') ? el('labMode').value : 'engine', tf = el('labTf'), grp = el('labGroup');
    if (tf) { if (mode !== 'engine') tf.value = '1H'; tf.disabled = mode !== 'engine'; }
    const fixed = mode === 'confirm' || mode === 'confirm-gold';
    if (grp) { if (mode === 'confirm') grp.value = 'crypto'; if (mode === 'confirm-gold') grp.value = 'gold'; grp.disabled = fixed; }
  };

  // v10.6: Khamosh mode — crypto Breakout ke aage ke trades (sirf admin dekhta hai, buyers ko kuch nahi jata).
  function dt(ms) { return ms ? new Date(ms).toISOString().slice(0, 16).replace('T', ' ') + ' UTC' : '—'; }
  function px(v) { return v == null ? '—' : (v >= 100 ? v.toFixed(2) : v >= 1 ? v.toFixed(4) : v.toFixed(5)); }
  function renderShadow(d) {
    const s = d.stats, cls = d.stage === 'ok' ? 'buy' : d.stage === 'stop' || d.stage === 'weak' ? 'sell' : 'wait';
    let h = '<p class="notice-banner"><b class="' + cls + '">' + esc(d.advice) + '</b></p>';
    h += '<p class="fine">' + esc(d.strategy) + ' · ' + esc(d.market) + ' · shuru: ' + day(d.startAt) + ' · ' + d.days + ' din · dekha gaya: ' + dt(d.asOf) + '</p>';
    h += TBL + '<tr><th>Band trades</th><th>Win %</th><th>Ausat</th><th>PF</th><th>Kul</th><th>Khule</th></tr><tr>' +
      '<td>' + s.n + '</td><td>' + num(s.winRate, '%') + '</td><td class="' + rCls(s.avgR) + '"><b>' + rTxt(s.avgR) + '</b></td><td>' + num(s.pf) + '</td><td class="' + rCls(s.netR) + '"><b>' + rTxt(s.netR) + '</b></td><td>' + d.open + '</td></tr></table></div>';
    h += '<p class="fine">' + esc(d.reference) + '</p>';
    h += d.trades.length ? TBL + '<tr><th>Pair</th><th>Taraf</th><th>Entry ka waqt</th><th>Entry</th><th>SL</th><th>TP</th><th>Halat</th><th>R</th><th>Band hua</th></tr>' +
      d.trades.map(t => '<tr><td>' + esc(t.pair) + '</td><td class="' + (t.dir === 'BUY' ? 'buy' : 'sell') + '">' + esc(t.dir) + '</td><td>' + dt(t.entryAt) + '</td><td>' + px(t.entry) + '</td><td>' + px(t.sl) + '</td><td>' + px(t.tp) + '</td><td>' +
        (t.status === 'Open' ? '<span class="wait">khula</span>' : t.status === 'Win' ? '<span class="buy">Win</span>' : '<span class="sell">Loss</span>') + (t.exit ? ' <span class="fine">' + esc(t.exit) + '</span>' : '') + '</td><td class="' + rCls(t.status === 'Open' ? t.runningR : t.r) + '">' +
        (t.status === 'Open' ? rTxt(t.runningR) + ' <span class="fine">chalta</span>' : rTxt(t.r)) + '</td><td>' + (t.exitAt ? dt(t.exitAt) : '—') + '</td></tr>').join('') + '</table></div>'
      : '<p>Abhi tak koi signal nahi bana. Ye tareeqa har pair par taqreeban hafte me aik signal deta hai.</p>';
    const bad = d.pairs.filter(p => !p.used);
    if (bad.length) h += '<p class="fine">Data nahi mila: ' + bad.map(p => esc(p.pair)).join(', ') + '</p>';
    h += d.notes.map(n => '<p class="fine">' + esc(n) + '</p>').join('');
    el('shadowBody').innerHTML = h;
  }
  window.labShadow = async function (fresh) {
    if (!isAdmin() || !el('shadowBody')) return;
    const btn = el('shadowBtn'); if (btn) btn.disabled = true;
    el('shadowBody').innerHTML = '<p>Binance se data aa raha hai… 10-40 second lag sakte hain.</p>';
    try { renderShadow(await api('/api/terminal/backtest/shadow' + (fresh ? '?fresh=1' : ''))); }
    catch (e) { el('shadowBody').innerHTML = '<p class="sell">' + esc(e.message) + '</p>'; }
    if (btn) btn.disabled = false;
  };

  // History tab khulne par: admin ko Lab dikhayein aur pichla nateeja (agar ho) le aayein.
  const prevShowTab = window.showTab;
  if (typeof prevShowTab === 'function') {
    window.showTab = function (t) {
      prevShowTab(t);
      const box = el('labBox');
      if (!box) return;
      if (t === 'history' && isAdmin()) { box.style.display = ''; poll(); }
      else { box.style.display = 'none'; clearTimeout(timer); }
    };
  }
})();
