// Forex Trading Pro — Auto Trade page (v10).
// app.js ke baad load hota hai aur uske api(), esc(), me, showTab() use karta hai.
// Onclick attributes me sirf index number jata hai (username kabhi nahi) — injection se bachao.
(function () {
  'use strict';
  let atData = null;
  let atKeyShown = false;
  let atAdminUsers = [];

  function el(id) { return document.getElementById(id); }
  function ago(ms) {
    if (!ms) return 'kabhi nahi';
    const m = Math.floor((Date.now() - ms) / 60000);
    if (m < 1) return 'abhi abhi';
    if (m < 60) return m + ' minute pehle';
    const h = Math.floor(m / 60);
    if (h < 48) return h + ' ghante pehle';
    return Math.floor(h / 24) + ' din pehle';
  }
  function maskKey(k) { return k ? k.slice(0, 8) + '••••••••••••••••••••' + k.slice(-4) : ''; }
  function isAdmin() { return typeof me !== 'undefined' && me && me.role === 'admin'; }

  function renderMine() {
    const d = atData; if (!d) return;
    const live = d.lastSeen && (Date.now() - d.lastSeen < 12 * 60000);
    let state;
    if (!d.globalEnabled) state = '<span class="sell">Auto Trade admin ne band kiya hua hai</span>';
    else if (d.disabledByAdmin) state = '<span class="sell">Aapka Auto Trade admin ne band kiya hai</span>';
    else if (!d.allowed) state = '<span class="sell">Plan khatam ya account band — key kaam nahi kare gi</span>';
    else if (live) state = '<span class="buy">EA juda hua hai aur chal raha hai</span>';
    else state = '<span>Key tayyar hai — EA abhi juda nahi</span>';
    el('atStatus').innerHTML =
      '<p><b>Halat:</b> ' + state + '</p>' +
      (d.demoOnly ? '<p class="notice-banner">Abhi Auto Trade <b>sirf DEMO account</b> par chalta hai. Real account wale EA ko signal nahi milta, kyunke signals ka munafa abhi saabit nahi hua.</p>' : '') +
      '<p class="fine">MT account: <b>' + esc(d.boundAccount || 'abhi koi nahi') + '</b>' +
      (d.platform ? ' · ' + esc(d.platform.toUpperCase()) : '') +
      (d.demo == null ? '' : (d.demo ? ' · DEMO' : ' · <span class="sell">REAL</span>')) +
      ' · EA aakhri dafa: ' + esc(ago(d.lastSeen)) + '</p>' +
      '<p class="fine">EA ko sirf Terminal ke taaza signals milte hain (' + esc(d.maxAgeMin) + ' minute se purane nahi). Abhi taaza signals: <b>' + esc(d.freshSignals) + '</b></p>';
    el('atKeyBox').innerHTML =
      '<p><code class="at-key">' + esc(atKeyShown ? d.key : maskKey(d.key)) + '</code></p>' +
      '<p style="display:flex;gap:6px;flex-wrap:wrap">' +
      '<button class="btn small" onclick="atToggleKey()">' + (atKeyShown ? 'Chhupayein' : 'Dikhayein') + '</button>' +
      '<button class="btn small gold" onclick="atCopyKey()">📋 Key Copy Karein</button>' +
      '<button class="btn small" onclick="atResetKey()">Nayi Key Banayein</button></p>' +
      '<p class="fine" id="atKeyMsg"></p>';
    el('atSiteUrl').textContent = location.origin;
  }

  async function loadMine() {
    try { atData = await api('/api/autotrade/me'); renderMine(); }
    catch (e) { el('atStatus').innerHTML = '<p>' + esc(e.message) + '</p>'; }
  }

  function renderAdmin(d) {
    atAdminUsers = d.users || [];
    el('atAdminGlobal').innerHTML =
      '<p><b>Sab ke liye Auto Trade:</b> ' + (d.globalEnabled ? '<span class="buy">ON</span>' : '<span class="sell">OFF</span>') +
      ' <button class="btn small" onclick="atAdminGlobal(' + (d.globalEnabled ? 'false' : 'true') + ')">' + (d.globalEnabled ? 'Sab ke liye band karein' : 'Chalu karein') + '</button></p>' +
      '<p class="fine">Band karne par kisi bhi EA ko naya signal nahi milta. Pehle se khuli trades apne SL/TP par chalti rehti hain.</p>' +
      '<p><b>Sirf DEMO accounts:</b> ' + (d.demoOnly ? '<span class="buy">ON (real accounts band)</span>' : '<span class="sell">OFF (real accounts ki ijazat hai)</span>') +
      ' <button class="btn small" onclick="atAdminDemoOnly(' + (d.demoOnly ? 'false' : 'true') + ')">' + (d.demoOnly ? 'Real accounts ki ijazat dein' : 'Sirf demo tak mehdood karein') + '</button></p>' +
      '<p class="fine">Jab tak Strategy Lab me koi version saaf na jeete, isay ON rakhein. Ye lock ghalti se real paisa lagne se rokta hai.</p>' +
      '<p>Signal kitne minute tak EA ko jaye: <input id="atMaxAge" type="number" min="2" max="60" value="' + esc(d.maxAgeMin) + '" style="width:80px"> ' +
      '<button class="btn small" onclick="atAdminMaxAge()">Save</button></p>';
    el('atAdminUsers').innerHTML = atAdminUsers.map(function (u, i) {
      const live = u.lastSeen && (Date.now() - u.lastSeen < 12 * 60000);
      return '<div class="price-cell" style="margin:6px 0"><b>' + esc(u.username) + '</b> (' + esc(u.role) + ') · ' +
        (u.disabledByAdmin ? '<span class="sell">Auto Trade band</span>' : (u.allowed ? '<span class="buy">ijazat hai</span>' : '<span class="sell">plan khatam / band</span>')) +
        ' · MT account: ' + esc(u.boundAccount || '—') + (u.platform ? ' ' + esc(u.platform.toUpperCase()) : '') +
        (u.demo == null ? '' : (u.demo ? ' DEMO' : ' <span class="sell">REAL</span>')) +
        ' · EA: ' + (live ? '<span class="buy">chal raha hai</span>' : esc(ago(u.lastSeen))) +
        '<div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap">' +
        '<button class="btn small" onclick="atAdminUser(' + i + ',\'toggle\')">' + (u.disabledByAdmin ? 'Auto Trade chalu' : 'Auto Trade band') + '</button>' +
        '<button class="btn small" onclick="atAdminUser(' + i + ',\'unbind\')">MT account hatayein</button>' +
        '<button class="btn small" onclick="atAdminUser(' + i + ',\'reset\')">Key reset</button></div></div>';
    }).join('') || '<p>Koi user nahi.</p>';
  }

  async function loadAdminPart() {
    const card = el('atAdminCard');
    if (!isAdmin()) { card.style.display = 'none'; el('atAdminGlobal').innerHTML = ''; el('atAdminUsers').innerHTML = ''; return; }
    card.style.display = '';
    try { renderAdmin(await api('/api/admin/autotrade')); }
    catch (e) { el('atAdminUsers').innerHTML = '<p>' + esc(e.message) + '</p>'; }
  }

  window.loadAutoTrade = function () { loadMine(); loadAdminPart(); };
  window.atToggleKey = function () { atKeyShown = !atKeyShown; renderMine(); };
  window.atCopyKey = async function () {
    if (!atData) return;
    const msg = el('atKeyMsg');
    try { await navigator.clipboard.writeText(atData.key); if (msg) msg.textContent = 'Key copy ho gayi.'; }
    catch (e) { atKeyShown = true; renderMine(); const m2 = el('atKeyMsg'); if (m2) m2.textContent = 'Copy nahi ho saki — key upar dikha di hai, khud copy kar lein.'; }
  };
  window.atResetKey = async function () {
    if (!confirm('Nayi key banane se purani key foran band ho jaye gi aur EA me nayi key dalni pare gi. Jaari rakhein?')) return;
    try { atData = Object.assign(atData || {}, await api('/api/autotrade/reset-key', { method: 'POST' })); atKeyShown = true; renderMine(); }
    catch (e) { alert(e.message); }
  };
  window.atAdminGlobal = async function (on) {
    if (!on && !confirm('Sab users ka Auto Trade band karein?')) return;
    try { await api('/api/admin/autotrade', { method: 'POST', body: JSON.stringify({ enabled: !!on }) }); window.loadAutoTrade(); }
    catch (e) { alert(e.message); }
  };
  window.atAdminDemoOnly = async function (on) {
    if (!on && !confirm('Real accounts ko Auto Trade ki ijazat dein? Strategy Lab me abhi tak koi version nahi jeeta — buyers ka asal paisa lag sakta hai.')) return;
    try { await api('/api/admin/autotrade', { method: 'POST', body: JSON.stringify({ demoOnly: !!on }) }); window.loadAutoTrade(); }
    catch (e) { alert(e.message); }
  };
  window.atAdminMaxAge = async function () {
    try { await api('/api/admin/autotrade', { method: 'POST', body: JSON.stringify({ maxAgeMin: parseInt(el('atMaxAge').value, 10) }) }); window.loadAutoTrade(); }
    catch (e) { alert(e.message); }
  };
  window.atAdminUser = async function (i, action) {
    const u = atAdminUsers[i]; if (!u) return;
    let body;
    if (action === 'toggle') body = { disabled: !u.disabledByAdmin };
    else if (action === 'unbind') body = { unbind: true };
    else if (action === 'reset') { if (!confirm(u.username + ' ki key reset karein? Purani key band ho jaye gi.')) return; body = { resetKey: true }; }
    else return;
    try { await api('/api/admin/users/' + encodeURIComponent(u.username) + '/autotrade', { method: 'POST', body: JSON.stringify(body) }); window.loadAutoTrade(); }
    catch (e) { alert(e.message); }
  };

  // showTab ko wrap karein taake Auto Trade tab khulte hi data load ho. Asal showTab waise hi chalta hai.
  const origShowTab = window.showTab;
  if (typeof origShowTab === 'function') {
    window.showTab = function (t) {
      origShowTab(t);
      if (t === 'autotrade') window.loadAutoTrade();
    };
  }
})();
