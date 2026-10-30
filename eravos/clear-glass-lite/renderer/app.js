'use strict';
/**
 * §MULTI-ACCOUNT 2026-07-19 — "once it has cookies stored, then it splits
 * the button with an add another." Zero accounts -> one plain login
 * button. One or more accounts -> a row per account (open/sign out/
 * rename) plus a smaller "+ Add another account" button underneath —
 * that's the literal split this was asked for.
 */

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

function relativeTime(ts) {
  if (!ts) return null;
  const diffMin = Math.round((Date.now() - ts) / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${Math.round(diffHr / 24)}d ago`;
}

function renderAccountRow(providerId, account) {
  return `
    <div class="account-row" data-provider="${providerId}" data-account="${account.id}">
      <span class="account-dot"></span>
      <span class="account-label" data-editable="1" title="click to rename">${escapeHtml(account.label)}</span>
      <span class="account-meta">${account.lastUsedAt ? relativeTime(account.lastUsedAt) : ''}</span>
      <button class="btn-open" data-action="open" data-provider="${providerId}" data-account="${account.id}">Open</button>
      <button class="btn-logout" data-action="logout" data-provider="${providerId}" data-account="${account.id}">Sign out</button>
    </div>
  `;
}

function renderProvider(p) {
  const hasAccounts = p.accounts.length > 0;

  if (!hasAccounts) {
    // No split — just the one login button, exactly like before an
    // account exists to split around.
    return `
      <div class="provider-card" data-id="${p.id}">
        <div class="provider-header">
          <div class="provider-dot" style="background:${p.color}"></div>
          <div class="provider-name">${escapeHtml(p.name)}</div>
        </div>
        <button class="btn-login" data-action="open" data-provider="${p.id}">Log in with ${escapeHtml(p.name)}</button>
      </div>
    `;
  }

  // The split: real account rows, then a visually secondary "add
  // another" — secondary on purpose, so it never reads as "the" button
  // for a provider you're already signed into.
  return `
    <div class="provider-card" data-id="${p.id}">
      <div class="provider-header">
        <div class="provider-dot" style="background:${p.color}"></div>
        <div class="provider-name">${escapeHtml(p.name)}</div>
        <span class="account-count">${p.accounts.length} account${p.accounts.length > 1 ? 's' : ''}</span>
      </div>
      ${p.accounts.map(a => renderAccountRow(p.id, a)).join('')}
      <button class="btn-add-another" data-action="open" data-provider="${p.id}">+ Add another account</button>
    </div>
  `;
}

function render(providers) {
  document.getElementById('provider-list').innerHTML = providers.map(renderProvider).join('');
}

async function refresh() {
  render(await window.hub.getStatus());
}

document.getElementById('provider-list').addEventListener('click', async (e) => {
  // Rename: click the label itself, not a button — turns it into an
  // inline text input, same pattern as renaming a file.
  const label = e.target.closest('.account-label[data-editable]');
  if (label && !label.querySelector('input')) {
    const row = label.closest('.account-row');
    const { provider, account } = row.dataset;
    const current = label.textContent;
    label.innerHTML = `<input type="text" value="${escapeHtml(current)}" maxlength="40">`;
    const input = label.querySelector('input');
    input.focus();
    input.select();
    const commit = async () => {
      const next = input.value.trim() || current;
      await window.hub.rename(provider, account, next);
    };
    input.addEventListener('blur', commit);
    input.addEventListener('keydown', (ke) => {
      if (ke.key === 'Enter') input.blur();
      if (ke.key === 'Escape') { label.textContent = current; }
    });
    return;
  }

  const btn = e.target.closest('button[data-action]');
  if (!btn) return;
  const { action, provider, account } = btn.dataset;
  btn.disabled = true;
  try {
    if (action === 'open') await window.hub.openAccount(provider, account || null);
    else if (action === 'logout') await window.hub.logout(provider, account);
  } finally {
    btn.disabled = false;
  }
});

window.hub.onStatusChanged((status) => render(status));

async function refreshScripts() {
  const scripts = await window.hub.listScripts();
  const enabled = scripts.filter(s => s.enabled).length;
  document.getElementById('scripts-count').textContent =
    scripts.length === 0 ? 'No userscripts yet' : `${enabled}/${scripts.length} userscripts enabled`;
}

document.getElementById('btn-open-scripts').addEventListener('click', () => window.hub.openScriptsFolder());

// ── Options panel ──────────────────────────────────────────────────────
const PROVIDER_META = [
  { id: 'claude', name: 'Claude' },
  { id: 'chatgpt', name: 'ChatGPT' },
  { id: 'gemini', name: 'Gemini' },
  { id: 'perplexity', name: 'Perplexity' },
];

async function openOptions() {
  const panel = document.getElementById('options-panel');
  const cfg = await window.hub.getConfig();
  const guardianStatus = await window.hub.guardianStatus();

  document.getElementById('opt-guardian-enabled').checked = cfg.guardianLiteEnabled !== false;
  document.getElementById('opt-guardian-port').value = cfg.guardianLitePort;
  document.getElementById('opt-retention-limit').value = cfg.guardianLiteRetentionLimit || 0;
  document.getElementById('opt-userscripts-enabled').checked = cfg.userscriptsEnabled !== false;

  const badge = document.getElementById('guardian-status-badge');
  badge.textContent = guardianStatus.running ? `running :${guardianStatus.port}` : 'not running';
  badge.className = 'badge' + (guardianStatus.running ? ' running' : '');

  const providersList = document.getElementById('opt-providers-list');
  providersList.innerHTML = PROVIDER_META.map(p => {
    const checked = cfg.enabledProviders?.[p.id] !== false;
    return `<label><input type="checkbox" data-provider-toggle="${p.id}" ${checked ? 'checked' : ''}> ${p.name}</label>`;
  }).join('');

  panel.classList.remove('hidden');
}

function closeOptions() {
  document.getElementById('options-panel').classList.add('hidden');
}

document.getElementById('btn-options').addEventListener('click', () => {
  const panel = document.getElementById('options-panel');
  panel.classList.contains('hidden') ? openOptions() : closeOptions();
});

document.getElementById('btn-save-options').addEventListener('click', async () => {
  const oldConfig = await window.hub.getConfig();
  await window.hub.setConfig('guardianLiteEnabled', document.getElementById('opt-guardian-enabled').checked);
  await window.hub.setConfig('guardianLitePort', parseInt(document.getElementById('opt-guardian-port').value, 10) || 7823);
  await window.hub.setConfig('guardianLiteRetentionLimit', parseInt(document.getElementById('opt-retention-limit').value, 10) || 0);
  await window.hub.setConfig('userscriptsEnabled', document.getElementById('opt-userscripts-enabled').checked);

  const enabledProviders = {};
  document.querySelectorAll('[data-provider-toggle]').forEach(el => {
    enabledProviders[el.dataset.providerToggle] = el.checked;
  });
  await window.hub.setConfig('enabledProviders', enabledProviders);

  const newConfig = await window.hub.getConfig();
  // Only actually restart the server if something guardian-lite cares
  // about changed — provider visibility and userscript toggles don't
  // need it, getStatus()/injection both read config live on every call.
  // Retention limit is enforced at construction time (see server.js's
  // constructor), so changing it needs the same restart port/enabled do.
  const needsRestart = oldConfig.guardianLiteEnabled !== newConfig.guardianLiteEnabled
    || oldConfig.guardianLitePort !== newConfig.guardianLitePort
    || oldConfig.guardianLiteRetentionLimit !== newConfig.guardianLiteRetentionLimit;
  if (needsRestart) await window.hub.restartGuardian();

  closeOptions();
  refresh();
  refreshLedgerTables();
});

document.getElementById('btn-reset-options').addEventListener('click', async () => {
  await window.hub.resetConfig();
  openOptions();
  refresh();
});

// ── Error log viewer ──────────────────────────────────────────────────
document.getElementById('btn-view-log').addEventListener('click', async () => {
  const viewer = document.getElementById('log-viewer');
  if (!viewer.classList.contains('hidden')) { viewer.classList.add('hidden'); return; }
  const lines = await window.hub.getLog(100);
  viewer.textContent = lines.length ? lines.join('\n') : '(log is empty)';
  viewer.classList.remove('hidden');
  viewer.scrollTop = viewer.scrollHeight;
});

document.getElementById('btn-open-log').addEventListener('click', () => window.hub.openLog());

document.getElementById('btn-clear-log').addEventListener('click', async () => {
  if (!confirm('Clear the error log? This cannot be undone.')) return;
  await window.hub.clearLog();
  const viewer = document.getElementById('log-viewer');
  if (!viewer.classList.contains('hidden')) viewer.textContent = '(log is empty)';
});

// ── Ledger ────────────────────────────────────────────────────────────
// Real captured data from guardian-lite, browsable without leaving the
// hub window — the whole point of "ledger for the history."
function renderLedgerRows(rows) {
  const container = document.getElementById('ledger-rows');
  if (!rows.length) {
    container.innerHTML = '<div class="ledger-empty">No rows in this table yet</div>';
    return;
  }
  container.innerHTML = rows.map(r => {
    const { id, uuid, ts, ...rest } = r;
    const when = ts ? new Date(ts).toLocaleString() : '';
    return `
      <div class="ledger-row" data-id="${escapeHtml(id || '')}">
        <div class="ledger-row-main">
          <div class="ledger-row-ts">${escapeHtml(when)}</div>
          <div class="ledger-row-json">${escapeHtml(JSON.stringify(rest, null, 0))}</div>
        </div>
        <button class="ledger-row-del" data-action="ledger-delete" data-id="${escapeHtml(id || '')}" title="Delete this row">✕</button>
      </div>
    `;
  }).join('');
}

async function refreshLedgerTables() {
  const select = document.getElementById('ledger-table-select');
  const current = select.value;
  const tables = await window.hub.ledgerTables();
  select.innerHTML = tables.length
    ? tables.map(t => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join('')
    : '<option value="artifacts">artifacts</option>';
  if (tables.includes(current)) select.value = current;
}

async function refreshLedgerRows() {
  const table = document.getElementById('ledger-table-select').value || 'artifacts';
  const result = await window.hub.ledgerQuery(table, 100);
  if (!result.ok) {
    document.getElementById('ledger-rows').innerHTML = `<div class="ledger-empty">${escapeHtml(result.error || 'guardian-lite is not running')}</div>`;
    return;
  }
  renderLedgerRows(result.rows);
}

document.getElementById('btn-ledger-toggle').addEventListener('click', async () => {
  const body = document.getElementById('ledger-body');
  const btn = document.getElementById('btn-ledger-toggle');
  const opening = body.classList.contains('hidden');
  body.classList.toggle('hidden');
  btn.textContent = opening ? '▴' : '▾';
  if (opening) { await refreshLedgerTables(); await refreshLedgerRows(); }
});

document.getElementById('btn-ledger-refresh').addEventListener('click', refreshLedgerRows);
document.getElementById('ledger-table-select').addEventListener('change', refreshLedgerRows);

document.getElementById('ledger-rows').addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-action="ledger-delete"]');
  if (!btn) return;
  const table = document.getElementById('ledger-table-select').value;
  await window.hub.ledgerDelete(table, btn.dataset.id);
  refreshLedgerRows();
});

refreshScripts();
refresh();
