/* ─────────────────────────────────────────────────────────────────────────
   lattice tab glue  ·  v0.4.0  ·  HOOK eravos.lattice:tab:00003
   Classic script (ERAVOS loads split-tab JS without type=module). Reads the
   single frozen namespace published by shared/alk/alk-boot.js.
   §5.12 — disposable. Deleting this file removes the view, not the lattice.
   ───────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  function esc(s) {
    return String(s).replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));
  }

  function renderDims(host, health) {
    if (!host || !health) return;
    const silent = new Set(health.silentDimensions || []);
    const counts = health.edgesByDim || {};
    host.innerHTML = (health.dimensions || []).map(d => {
      const n = counts[d] || 0;
      const cls = silent.has(d) ? 'lat-chip silent' : (n > 0 ? 'lat-chip live' : 'lat-chip');
      const note = silent.has(d) ? 'no data yet' : n + ' edge' + (n === 1 ? '' : 's');
      return `<span class="${cls}" title="${esc(note)}">${esc(d)} · ${n}</span>`;
    }).join('');
  }

  function renderLatticeTab() {
    const empty = document.getElementById('lat-empty');
    const list  = document.getElementById('lat-resonances');
    const dot   = document.getElementById('lat-health');
    const diag  = document.getElementById('lat-diag-out');
    if (!list) return;

    // §1.2 — if the stack never booted, SAY SO. Never render a blank tab that
    // looks like "no data" when the real cause is a failed dependency.
    if (!window.ALK || !window.ALK.stack || !window.ALK.stack.lattice) {
      if (dot) dot.className = 'lat-dot bad';
      list.hidden = false;
      list.innerHTML = '<div class="lat-card"><div class="lat-label">ALK stack not loaded</div>' +
        '<p class="small">shared/alk/alk-boot.js did not boot. The lattice cannot render. ' +
        'Check the console — the failing stage is named there.</p></div>';
      if (empty) empty.hidden = true;
      return;
    }

    const stack = window.ALK.stack;
    const health = stack.lattice.health();
    const res = stack.lattice.resonances({ limit: 30 });

    const nodesEl = document.getElementById('lat-stat-nodes');
    const sigEl   = document.getElementById('lat-stat-signal');
    if (nodesEl) nodesEl.textContent = health.nodes + ' node' + (health.nodes === 1 ? '' : 's');
    if (sigEl)   sigEl.textContent = health.signal + ' signal · ' + health.noise + ' filtered';
    if (dot)     dot.className = 'lat-dot ' + (stack.faults.length ? 'warn' : 'ok');

    renderDims(document.getElementById('lat-dims'), health);
    if (diag) diag.textContent = JSON.stringify(window.ALK.health(), null, 1);

    if (!res.length) {
      if (empty) empty.hidden = false;
      list.hidden = true;
      return;
    }
    if (empty) empty.hidden = true;
    list.hidden = false;

    list.innerHTML = res.map(p => `
      <div class="lat-card w${p.weight}">
        <div class="lat-label">${esc(p.labels.join(' + '))}</div>
        <div class="lat-quote">${esc(p.aText)}</div>
        <div class="lat-quote">${esc(p.bText)}</div>
        <div class="lat-ev">${esc(p.evidential.join(' · '))} &nbsp;|&nbsp; ${esc(p.evidence.join('  '))}</div>
      </div>`).join('');
  }

  window.renderLatticeTab = renderLatticeTab;
  window.EravosTabInitRenderers = window.EravosTabInitRenderers || {};
  window.EravosTabInitRenderers.lattice = renderLatticeTab;

  window.addEventListener('alk:ready', renderLatticeTab);
  window.addEventListener('alk:lattice-changed', renderLatticeTab);
})();
