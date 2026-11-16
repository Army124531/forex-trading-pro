// Forex Trading Pro — Strategy Lab ka UI (v10.1). Terminal Backtest card ke andar dikhta hai, sirf admin ko.
// app.js ke api(), esc(), me, showTab() use karta hai. Sirf research — koi setting ya signal nahi badalta.
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
    return '<td>' + s.n + '</td><td>' + num(s.winRate, '%') + '</td><td class="' + rCls(s.avgR) + '"><b>' + rTxt(s.avgR) + '</b></td><td>' + num(s.pf) + '</td>';
  }
  function verdictHtml(v) {
    if (v === 'JEETA') return '<span class="buy"><b>JEETA</b></span>';
    if (v === 'KAMZOR') return '<span class="wait">kamzor</span>';
    return '<span class="sell">nahi</span>';
  }
  const HEAD = '<tr><th>Version</th><th>Trades</th><th>Win %</th><th>Ausat</th><th>PF</th><th>Trades</th><th>Win %</th><th>Ausat</th><th>PF</th><th>Pairs +</th><th>Nateeja</th></tr>';
  const GROUP_HEAD = '<tr><th></th><th colspan="4">Seekhne wala hissa (60%)</th><th colspan="4">Imtihan wala hissa (40%)</th><th></th><th></th></tr>';
  function row(r, withVerdict) {
    return '<tr><td>' + (r.isBaseline ? '<b>AAJ KA ENGINE</b><br>' : '') + esc(r.name) + '</td>' + statCells(r.train) + statCells(r.test) +
      '<td>' + r.pairsPositive + '/' + r.pairsTested + '</td><td>' + (withVerdict ? verdictHtml(r.verdict) : '') + '</td></tr>';
  }

  function renderResult(d) {
    const used = d.pairs.filter(p => p.used), skipped = d.pairs.filter(p => !p.used);
    let h = '<p class="notice-banner"><b>Faisla:</b> ' + esc(d.verdict) + '</p>';
    h += '<p class="fine">' + esc(d.tfLabel) + ' · ' + used.length + ' pairs · ' + d.variantsTested + ' versions aazmaye · ' + esc(d.splitNote) + '</p>';
    if (d.baseline) {
      h += '<h4>Aaj ka live engine (kharcha kaat kar)</h4><div class="table-wrap"><table>' + GROUP_HEAD + HEAD + row(d.baseline, false) + '</table></div>';
    }
    h += '<h4>Sab se behtar 5 versions (seekhne wale hisse par chune gaye)</h4>';
    h += d.top.length ? '<div class="table-wrap"><table>' + GROUP_HEAD + HEAD + d.top.map(r => row(r, true)).join('') + '</table></div>' : '<p>Kisi version ke kaafi trades nahi bane.</p>';
    h += '<p class="fine">"JEETA" tabhi likha jata hai jab imtihan wale hisse me: 80+ trades, ausat munafa musbat, PF 1.15+, nateeja ittefaq se door (t 2.5+), aur 60%+ pairs munafe me hon. Ausat = har trade ka ausat munafa R me (1R = SL tak ka risk). PF 1.00 = barabar.</p>';
    if (d.geometryOnly && d.geometryOnly.length) {
      h += '<h4>Sirf SL/TP badalne ka asar (baaki sab aaj jaisa)</h4><div class="table-wrap"><table>' + GROUP_HEAD + HEAD + d.geometryOnly.map(r => row(r, false)).join('') + '</table></div>';
      h += '<p class="fine">Agar yahan sab versions ka ausat taqreeban barabar (ya manfi) ho, to matlab SL/TP badalne se win rate badalta hai, munafa nahi.</p>';
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
      el('labBody').innerHTML = '<p>Lab chal raha hai… pair ' + ((p.done || 0) + 1) + '/' + (p.total || '?') + (p.pair ? ' (' + esc(p.pair) + ')' : '') + '. Is me 1-3 minute lag sakte hain — page khula rakhein.</p>';
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
      await api('/api/terminal/backtest/lab', { method: 'POST', body: JSON.stringify({ tf: el('labTf').value, group: el('labGroup').value }) });
      el('labBody').innerHTML = '<p>Lab shuru ho gaya…</p>';
    } catch (e) { el('labBody').innerHTML = '<p>' + esc(e.message) + '</p>'; }
    timer = setTimeout(poll, 1500);
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
