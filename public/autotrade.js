// Forex Trading Pro — Auto Trade page (v10).
// app.js ke baad load hota hai aur uske api(), esc(), t(), me, showTab() use karta hai.
// Saare dikhai dene wale strings t('at...') keys se aate hain (I18N dict, app.js) —
// is liye Auto Trade tab bhi baaki site ke saath language badalta hai (v10.9).
// Onclick attributes me sirf index number jata hai (username kabhi nahi) — injection se bachao.
(function () {
  'use strict';
  let atData = null;
  let atKeyShown = false;
  let atAdminUsers = [];

  function el(id) { return document.getElementById(id); }
  // {b}...{/b} aur {c}...{/c} markers ko <b>/<code> me badlein — I18N values me HTML nahi hota.
  function atHtml(s) {
    return String(s ?? '').replace(/\{b\}/g, '<b>').replace(/\{\/b\}/g, '</b>').replace(/\{c\}/g, '<code>').replace(/\{\/c\}/g, '</code>');
  }
  function ago(ms) {
    if (!ms) return t('atAgoNever');
    const m = Math.floor((Date.now() - ms) / 60000);
    if (m < 1) return t('atAgoNow');
    if (m < 60) return t('atAgoMin').replace('{n}', String(m));
    const h = Math.floor(m / 60);
    if (h < 48) return t('atAgoHour').replace('{n}', String(h));
    return t('atAgoDay').replace('{n}', String(Math.floor(h / 24)));
  }
  function maskKey(k) { return k ? k.slice(0, 8) + '••••••••••••••••••••' + k.slice(-4) : ''; }
  function isAdmin() { return typeof me !== 'undefined' && me && me.role === 'admin'; }

  // Static (markup wale) hisse — steps list + real-account note — language ke mutabiq render karein.
  // data-i18n yahan nahi chal sakta (applyLang textContent lagata hai, <b>/<code> mit jate).
  function renderAtStatic() {
    const steps = el('atSteps');
    if (steps) {
      let html = '';
      for (let n = 1; n <= 7; n++) {
        html += '<li>' + atHtml(t('atStep' + n));
        if (n === 3) html += ' <code id="atSiteUrl"></code>';
        html += '</li>';
      }
      steps.innerHTML = html;
      const u = el('atSiteUrl'); if (u) u.textContent = location.origin;
    }
    const rn = el('atRealNote');
    if (rn) rn.innerHTML = atHtml(t('atRealNote'));
  }

  function renderMine() {
    const d = atData; if (!d) return;
    const live = d.lastSeen && (Date.now() - d.lastSeen < 12 * 60000);
    let state;
    if (!d.globalEnabled) state = '<span class="sell">' + esc(t('atStateGlobalOff')) + '</span>';
    else if (d.disabledByAdmin) state = '<span class="sell">' + esc(t('atStateUserOff')) + '</span>';
    else if (!d.allowed) state = '<span class="sell">' + esc(t('atStateNoPlan')) + '</span>';
    else if (live) state = '<span class="buy">' + esc(t('atStateLive')) + '</span>';
    else state = '<span>' + esc(t('atStateReady')) + '</span>';
    el('atStatus').innerHTML =
      '<p><b>' + esc(t('atStatusLbl')) + '</b> ' + state + '</p>' +
      (d.demoOnly ? '<p class="notice-banner">' + atHtml(t('atDemoOnly')) + '</p>' : '') +
      '<p class="fine">' + esc(t('atMtAccount')) + ' <b>' + esc(d.boundAccount || t('atNoAccount')) + '</b>' +
      (d.platform ? ' · ' + esc(d.platform.toUpperCase()) : '') +
      (d.demo == null ? '' : (d.demo ? ' · DEMO' : ' · <span class="sell">REAL</span>')) +
      ' · ' + esc(t('atLastSeen')) + ' ' + esc(ago(d.lastSeen)) + '</p>' +
      '<p class="fine">' + esc(t('atFreshNote').replace('{n}', String(d.maxAgeMin))) + ' ' + esc(t('atFreshNow')) + ' <b>' + esc(d.freshSignals) + '</b></p>';
    el('atKeyBox').innerHTML =
      '<p><code class="at-key">' + esc(atKeyShown ? d.key : maskKey(d.key)) + '</code></p>' +
      '<p style="display:flex;gap:6px;flex-wrap:wrap">' +
      '<button class="btn small" onclick="atToggleKey()">' + esc(atKeyShown ? t('atHideKey') : t('atShowKey')) + '</button>' +
      '<button class="btn small gold" onclick="atCopyKey()">' + esc(t('atCopyKey')) + '</button>' +
      '<button class="btn small" onclick="atResetKey()">' + esc(t('atResetKey')) + '</button></p>' +
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
      '<p><b>' + esc(t('atGlobalLbl')) + '</b> ' + (d.globalEnabled ? '<span class="buy">ON</span>' : '<span class="sell">OFF</span>') +
      ' <button class="btn small" onclick="atAdminGlobal(' + (d.globalEnabled ? 'false' : 'true') + ')">' + esc(d.globalEnabled ? t('atGlobalOffAll') : t('atGlobalOnAll')) + '</button></p>' +
      '<p class="fine">' + esc(t('atGlobalOffNote')) + '</p>' +
      '<p><b>' + esc(t('atDemoOnlyLbl')) + '</b> ' + (d.demoOnly ? '<span class="buy">' + esc(t('atDemoOn')) + '</span>' : '<span class="sell">' + esc(t('atDemoOff')) + '</span>') +
      ' <button class="btn small" onclick="atAdminDemoOnly(' + (d.demoOnly ? 'false' : 'true') + ')">' + esc(d.demoOnly ? t('atDemoAllowReal') : t('atDemoRestrict')) + '</button></p>' +
      '<p class="fine">' + esc(t('atDemoNote')) + '</p>' +
      '<p>' + esc(t('atMaxAgeLbl')) + ' <input id="atMaxAge" type="number" min="2" max="60" value="' + esc(d.maxAgeMin) + '" style="width:80px"> ' +
      '<button class="btn small" onclick="atAdminMaxAge()">' + esc(t('atSave')) + '</button></p>';
    el('atAdminUsers').innerHTML = atAdminUsers.map(function (u, i) {
      const live = u.lastSeen && (Date.now() - u.lastSeen < 12 * 60000);
      return '<div class="price-cell" style="margin:6px 0"><b>' + esc(u.username) + '</b> (' + esc(u.role) + ') · ' +
        (u.disabledByAdmin ? '<span class="sell">' + esc(t('atUserOff')) + '</span>' : (u.allowed ? '<span class="buy">' + esc(t('atUserAllowed')) + '</span>' : '<span class="sell">' + esc(t('atUserNoPlan')) + '</span>')) +
        ' · ' + esc(t('atMtAccount')) + ' ' + esc(u.boundAccount || '—') + (u.platform ? ' ' + esc(u.platform.toUpperCase()) : '') +
        (u.demo == null ? '' : (u.demo ? ' DEMO' : ' <span class="sell">REAL</span>')) +
        ' · EA: ' + (live ? '<span class="buy">' + esc(t('atUserEaRunning')) + '</span>' : esc(ago(u.lastSeen))) +
        '<div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap">' +
        '<button class="btn small" onclick="atAdminUser(' + i + ',\'toggle\')">' + esc(u.disabledByAdmin ? t('atUserEnable') : t('atUserDisable')) + '</button>' +
        '<button class="btn small" onclick="atAdminUser(' + i + ',\'unbind\')">' + esc(t('atUserUnbind')) + '</button>' +
        '<button class="btn small" onclick="atAdminUser(' + i + ',\'reset\')">' + esc(t('atUserReset')) + '</button></div></div>';
    }).join('') || '<p>' + esc(t('atNoUsers')) + '</p>';
  }

  async function loadAdminPart() {
    const card = el('atAdminCard');
    if (!isAdmin()) { card.style.display = 'none'; el('atAdminGlobal').innerHTML = ''; el('atAdminUsers').innerHTML = ''; return; }
    card.style.display = '';
    try { renderAdmin(await api('/api/admin/autotrade')); }
    catch (e) { el('atAdminUsers').innerHTML = '<p>' + esc(e.message) + '</p>'; }
  }

  window.loadAutoTrade = function () { renderAtStatic(); loadMine(); loadAdminPart(); };
  window.atToggleKey = function () { atKeyShown = !atKeyShown; renderMine(); };
  window.atCopyKey = async function () {
    if (!atData) return;
    const msg = el('atKeyMsg');
    try { await navigator.clipboard.writeText(atData.key); if (msg) msg.textContent = t('atCopied'); }
    catch (e) { atKeyShown = true; renderMine(); const m2 = el('atKeyMsg'); if (m2) m2.textContent = t('atCopyFail'); }
  };
  window.atResetKey = async function () {
    if (!confirm(t('atResetConfirm'))) return;
    try { atData = Object.assign(atData || {}, await api('/api/autotrade/reset-key', { method: 'POST' })); atKeyShown = true; renderMine(); }
    catch (e) { alert(e.message); }
  };
  window.atAdminGlobal = async function (on) {
    if (!on && !confirm(t('atConfirmGlobalOff'))) return;
    try { await api('/api/admin/autotrade', { method: 'POST', body: JSON.stringify({ enabled: !!on }) }); window.loadAutoTrade(); }
    catch (e) { alert(e.message); }
  };
  window.atAdminDemoOnly = async function (on) {
    if (!on && !confirm(t('atConfirmDemoReal'))) return;
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
    else if (action === 'reset') { if (!confirm(t('atConfirmUserReset').replace('{u}', u.username))) return; body = { resetKey: true }; }
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

  // Static hisse page load par bhi render karein (tab khulne se pehle bhi sahi language ho).
  renderAtStatic();
})();
