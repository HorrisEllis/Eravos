/* ─────────────────────────────────────────────────────────────────────────
   admin tab glue  ·  v0.5.0  ·  HOOK eravos.admin:tab:00002
   Classic script. The engine (shared/eravos-admin.js) owns every write;
   this file only renders and confirms. §5.12 — deleting this removes the
   view, not the capability.
   ───────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  var engine = null;
  function eng() {
    if (engine) return engine;
    if (!window.AdminEngine) throw new Error('[admin] shared/eravos-admin.js is not loaded');
    engine = new window.AdminEngine();
    return engine;
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function show(result) {
    var card = document.getElementById('adm-result-card');
    var pre = document.getElementById('adm-result');
    if (!pre) return;
    var shown = JSON.parse(JSON.stringify(result));
    // snapshots are large; report the size, offer the download, don't dump it
    if (shown.snapshot) shown.snapshot = '(' + (result.snapshot.keyCount || 0) + ' keys captured — download offered above)';
    pre.textContent = JSON.stringify(shown, null, 1);
    if (card) card.style.display = '';
    if (window.showToast) window.showToast(result.operation + ' complete');
    renderAdminTab();
  }

  function fail(e) {
    var card = document.getElementById('adm-result-card');
    var pre = document.getElementById('adm-result');
    if (pre) pre.textContent = '✗ ' + e.message;   // §1.2 loud, named, visible
    if (card) card.style.display = '';
    if (window.showToast) window.showToast('Refused: ' + e.message);
  }

  function download(obj, name) {
    try {
      var blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = name;
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
    } catch (e) {
      console.error('[admin] export download failed:', e);
      if (window.showToast) window.showToast('Export failed: ' + e.message);
    }
  }

  /* ── render ─────────────────────────────────────────────────────── */

  function renderAdminTab() {
    var host = document.getElementById('adm-users');
    if (!host) return;
    var e;
    try { e = eng(); } catch (err) {
      host.innerHTML = '<div class="adm-warn adm-danger">' + esc(err.message) + '</div>';
      return;
    }

    var users = e.users();
    var h = e.health();

    var sum = document.getElementById('adm-summary');
    if (sum) sum.innerHTML =
      '<span class="tag">' + users.length + ' user' + (users.length === 1 ? '' : 's') + '</span>' +
      '<span class="tag">' + h.totalKeys + ' stored keys</span>' +
      '<span class="tag">' + (h.coCreationActive ? 'co-creation live' : 'no co-creation') + '</span>' +
      '<span class="tag">status: ' + esc(h.status) + '</span>';

    host.innerHTML = users.map(function (u) {
      var cls = u.isAdmin ? 'is-admin' : 'is-partner';
      return '' +
        '<div class="adm-row ' + cls + '">' +
          '<div class="adm-who">' +
            '<div class="adm-name">' + esc(u.name) + ' <span class="tag">' + esc(u.role) + '</span></div>' +
            '<div class="adm-sub">' +
              'key <strong>' + esc(u.key) + '</strong> · namespace <strong>' + esc(u.dbPrefix) + '_</strong> · ' +
              u.dataKeys + ' data key' + (u.dataKeys === 1 ? '' : 's') + '<br>' +
              'peer ' + esc(u.peerId || '—') + '<br>partner ' + esc(u.partnerId || '— not linked') +
            '</div>' +
          '</div>' +
          '<div class="adm-acts">' +
            '<button class="btn ghost" onclick="admToggle(\'edit-' + esc(u.key) + '\')">Edit</button>' +
            '<button class="btn ghost" onclick="admToggle(\'rename-' + esc(u.key) + '\')">Rename</button>' +
            (u.isAdmin ? '' :
              '<button class="btn ghost" onclick="admToggle(\'replace-' + esc(u.key) + '\')">Replace</button>' +
              '<button class="btn danger" onclick="admToggle(\'remove-' + esc(u.key) + '\')">Remove</button>') +
            '<button class="btn ghost" onclick="admExportUser(\'' + esc(u.key) + '\')">⬇ Export</button>' +
          '</div>' +
        '</div>' +
        admEditForm(u) + admRenameForm(u) + (u.isAdmin ? '' : admReplaceForm(u) + admRemoveForm(u));
    }).join('');

    var pair = document.getElementById('adm-cocreation');
    if (pair) {
      pair.innerHTML = h.pairKeysLive.length
        ? h.pairKeysLive.map(function (k) { return '<div class="adm-pair live">' + esc(k) + '</div>'; }).join('')
        : '<div class="adm-pair">No pair state stored. Nothing to disconnect.</div>';
    }

    var themes = document.getElementById('adm-themes');
    if (themes) {
      themes.textContent = 'Active theme class on <body>: ' +
        (document.body.className.match(/\b\w+-theme\b/) || ['(none — default)'])[0];
    }

    var hd = document.getElementById('adm-health');
    if (hd) hd.textContent = JSON.stringify(h, null, 1);

    admLoadPublicOrigin();
  }

  /* ── forms (collapsed until asked for) ──────────────────────────── */

  function admEditForm(u) {
    return '<div class="adm-form" id="edit-' + esc(u.key) + '" style="display:none">' +
      '<label>Display name</label><input id="f-name-' + esc(u.key) + '" value="' + esc(u.name) + '">' +
      '<label>Role</label><select id="f-role-' + esc(u.key) + '">' +
        '<option value="partner"' + (u.role === 'partner' ? ' selected' : '') + '>partner</option>' +
        '<option value="admin"' + (u.role === 'admin' ? ' selected' : '') + '>admin</option>' +
      '</select>' +
      '<label style="display:flex;align-items:center;gap:10px;cursor:pointer;margin-top:10px">' +
        '<input type="checkbox" id="f-recovery-' + esc(u.key) + '"' + (u.recoveryViaPartner ? ' checked' : '') + ' style="width:16px;height:16px;accent-color:var(--fire);cursor:pointer">' +
        '<span>Let the other account reset ' + esc(u.name) + '\'s password (Forgot password? on the login screen)</span>' +
      '</label>' +
      '<div class="flex gap10 mt8"><button class="btn" onclick="admEdit(\'' + esc(u.key) + '\')">Save</button></div>' +
    '</div>';
  }

  function admRenameForm(u) {
    return '<div class="adm-form" id="rename-' + esc(u.key) + '" style="display:none">' +
      '<div class="adm-warn">Same person, new label. Every one of their ' + u.dataKeys +
        ' data keys moves with them. Peer identity and crypto keys are preserved — ' +
        'they are still the same party to the connection.</div>' +
      '<label>New account key (a–z 0–9 _ -)</label><input id="r-key-' + esc(u.key) + '" placeholder="e.g. anjali">' +
      '<label>New display name</label><input id="r-name-' + esc(u.key) + '" placeholder="e.g. Anjali">' +
      '<div class="flex gap10 mt8"><button class="btn" onclick="admRename(\'' + esc(u.key) + '\')">Rename &amp; move data</button></div>' +
    '</div>';
  }

  function admReplaceForm(u) {
    return '<div class="adm-form" id="replace-' + esc(u.key) + '" style="display:none">' +
      '<div class="adm-warn adm-danger">A <strong>different person</strong> takes this slot. ' +
        esc(u.name) + '\'s ' + u.dataKeys + ' data keys do <strong>not</strong> transfer — their ' +
        'feelings, ruptures and history are theirs. The co-creation pairing is torn down, a new ' +
        'peer identity is issued, and crypto keys are regenerated. An export is taken first, ' +
        'automatically, whatever you choose below.</div>' +
      '<label>New account key</label><input id="p-key-' + esc(u.key) + '" placeholder="e.g. anjali">' +
      '<label>New display name</label><input id="p-name-' + esc(u.key) + '" placeholder="e.g. Anjali">' +
      '<label>Login password for the new account</label><input id="p-pass-' + esc(u.key) + '" type="password" placeholder="required">' +
      '<label>What happens to ' + esc(u.name) + '\'s data</label>' +
      '<select id="p-disp-' + esc(u.key) + '">' +
        '<option value="">— choose (no default) —</option>' +
        '<option value="archive">Archive it — kept, moved aside, recoverable</option>' +
        '<option value="purge">Purge it — removed from this device after the export</option>' +
      '</select>' +
      '<div class="flex gap10 mt8"><button class="btn danger" onclick="admReplace(\'' + esc(u.key) + '\')">Replace ' + esc(u.name) + '</button></div>' +
    '</div>';
  }

  function admRemoveForm(u) {
    return '<div class="adm-form" id="remove-' + esc(u.key) + '" style="display:none">' +
      '<div class="adm-warn adm-danger">Removes the account and unlinks any partner pointing at it. ' +
        'An export is taken first, automatically.</div>' +
      '<label>What happens to their ' + u.dataKeys + ' data keys</label>' +
      '<select id="d-disp-' + esc(u.key) + '">' +
        '<option value="">— choose (no default) —</option>' +
        '<option value="archive">Archive</option>' +
        '<option value="purge">Purge</option>' +
      '</select>' +
      '<label>Type the account key to confirm</label><input id="d-conf-' + esc(u.key) + '" placeholder="' + esc(u.key) + '">' +
      '<div class="flex gap10 mt8"><button class="btn danger" onclick="admRemove(\'' + esc(u.key) + '\')">Remove ' + esc(u.name) + '</button></div>' +
    '</div>';
  }

  /* ── actions ────────────────────────────────────────────────────── */

  window.admToggle = function (id) {
    var el = document.getElementById(id);
    if (el) el.style.display = el.style.display === 'none' ? '' : 'none';
  };

  window.admEdit = function (key) {
    try {
      show(eng().editUser(key, {
        name: (document.getElementById('f-name-' + key) || {}).value,
        role: (document.getElementById('f-role-' + key) || {}).value,
        recoveryViaPartner: !!(document.getElementById('f-recovery-' + key) || {}).checked
      }));
    } catch (e) { fail(e); }
  };

  window.admRename = function (key) {
    try {
      var nk = (document.getElementById('r-key-' + key) || {}).value;
      var nn = (document.getElementById('r-name-' + key) || {}).value;
      var r = eng().renameUser(key, nk, nn);
      download(r.snapshot, 'eravos-' + key + '-before-rename.json');
      show(r);
    } catch (e) { fail(e); }
  };

  window.admReplace = function (key) {
    try {
      var disp = (document.getElementById('p-disp-' + key) || {}).value;
      var pass = (document.getElementById('p-pass-' + key) || {}).value;
      if (!pass) throw new Error('a login password for the new account is required');
      var r = eng().replacePartner(key, {
        key: (document.getElementById('p-key-' + key) || {}).value,
        name: (document.getElementById('p-name-' + key) || {}).value,
        password: window.sha256Hex ? null : pass
      }, { disposition: disp });
      download(r.snapshot, 'eravos-' + key + '-before-replace.json');
      show(r);
    } catch (e) { fail(e); }
  };

  window.admRemove = function (key) {
    try {
      var conf = (document.getElementById('d-conf-' + key) || {}).value;
      if (conf !== key) throw new Error('confirmation did not match the account key');
      var r = eng().removeUser(key, { disposition: (document.getElementById('d-disp-' + key) || {}).value });
      download(r.snapshot, 'eravos-' + key + '-before-remove.json');
      show(r);
    } catch (e) { fail(e); }
  };

  window.admClearCoCreation = function () {
    try {
      var r = eng().clearCoCreation();
      download(r.snapshot, 'eravos-before-disconnect.json');
      show(r);
    } catch (e) { fail(e); }
  };

  window.admPurgeThemes = function () {
    try { show(eng().purgeThemes()); } catch (e) { fail(e); }
  };

  window.admExportAll = function () {
    try { download(eng().exportAll(), 'eravos-full-export.json'); if (window.showToast) window.showToast('Exported'); }
    catch (e) { fail(e); }
  };

  window.admExportUser = function (key) {
    try { download(eng().exportUser(key), 'eravos-' + key + '.json'); if (window.showToast) window.showToast('Exported ' + key); }
    catch (e) { fail(e); }
  };

  var ORIGIN_QUICK_OPTIONS = [
    { label: 'anonymousservers.info', value: 'https://anonymousservers.info' },
    { label: '24.21.239.115', value: 'http://24.21.239.115' },
  ];

  function admLoadPublicOrigin() {
    var currentEl = document.getElementById('adm-origin-current');
    var quickEl = document.getElementById('adm-origin-quick');
    var inputEl = document.getElementById('adm-origin-input');
    function renderQuickOptions(options) {
      if (!quickEl) return;
      quickEl.innerHTML = options.map(function (o) {
        return '<button class="btn ghost" style="font-size:.75rem" onclick="admQuickSetOrigin(\'' + o.value.replace(/'/g, "\\'") + '\')">' + o.label + '</button>';
      }).join('');
    }
    renderQuickOptions(ORIGIN_QUICK_OPTIONS);
    // Real, live LAN IP -- what actually makes the invite QR scannable
    // from a phone on the same wifi right now, as opposed to the two
    // options above which both need real external setup (DDNS+cert, or
    // a static/forwarded public IP) to actually work.
    fetch('/api/config/lan-ip').then(function (r) { return r.json(); }).then(function (d) {
      if (d && d.suggestion) {
        renderQuickOptions([{ label: '📱 this device\u2019s LAN IP — ' + d.lanIP, value: d.suggestion }].concat(ORIGIN_QUICK_OPTIONS));
      }
    }).catch(function () { /* quick-options above still work without this */ });
    fetch('/api/config/public-origin').then(function (r) { return r.json(); }).then(function (cfg) {
      var val = cfg && cfg.publicOrigin;
      if (currentEl) currentEl.textContent = val ? ('Real, currently configured: ' + val) : 'Not set — currently auto-detecting from whatever browser generates the invite.';
      if (inputEl && !inputEl.value) inputEl.value = val || '';
    }).catch(function (e) {
      if (currentEl) currentEl.textContent = '⚠ Could not read the current value: ' + e.message;
    });
  }

  function _admSaveOrigin(value) {
    var statusEl = document.getElementById('adm-origin-status');
    if (statusEl) { statusEl.textContent = 'Saving…'; statusEl.style.color = 'var(--dim)'; }
    fetch('/api/config/public-origin', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ publicOrigin: value }),
    }).then(function (r) { return r.json().then(function (body) { return { ok: r.ok, body: body }; }); })
      .then(function (res) {
        if (!res.ok) { if (statusEl) { statusEl.textContent = '⚠ ' + res.body.error; statusEl.style.color = 'var(--rose)'; } return; }
        // Real, live update -- the very next invite generated uses this,
        // no reload needed. setOrigin() is the real fix from earlier
        // this session (see eravos-pairing.js's own header comment on
        // it) for the actual root gap: this config used to be read but
        // never applied anywhere.
        if (window.eravosPairing && typeof eravosPairing.setOrigin === 'function') {
          eravosPairing.setOrigin(res.body.publicOrigin || (location.origin));
        }
        if (statusEl) {
          var msg = res.body.publicOrigin ? ('✓ Saved — invites now use ' + res.body.publicOrigin) : '✓ Cleared — invites will auto-detect';
          msg += '. New addresses were added to allowedOrigins too, but that only takes effect on the relay\'s next real restart — the address will work for generating/opening invites right away, real device-to-device sync from it needs a restart first.';
          statusEl.textContent = msg;
          statusEl.style.color = 'var(--teal)';
        }
        admLoadPublicOrigin();
      })
      .catch(function (e) { if (statusEl) { statusEl.textContent = '⚠ ' + e.message; statusEl.style.color = 'var(--rose)'; } });
  }

  window.admSetPublicOrigin = function () {
    var inputEl = document.getElementById('adm-origin-input');
    var value = inputEl ? inputEl.value.trim() : '';
    if (!value) { _admSaveOrigin(''); return; }
    _admSaveOrigin(value);
  };
  window.admClearPublicOrigin = function () {
    var inputEl = document.getElementById('adm-origin-input');
    if (inputEl) inputEl.value = '';
    _admSaveOrigin('');
  };
  window.admQuickSetOrigin = function (value) {
    var inputEl = document.getElementById('adm-origin-input');
    if (inputEl) inputEl.value = value;
    _admSaveOrigin(value);
  };

  window.renderAdminTab = renderAdminTab;
  window.EravosTabInitRenderers = window.EravosTabInitRenderers || {};
  window.EravosTabInitRenderers.admin = renderAdminTab;
})();
