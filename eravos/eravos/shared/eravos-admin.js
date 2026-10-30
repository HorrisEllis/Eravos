/* ══════════════════════════════════════════════════════════════════════════
   ERAVOS ADMIN ENGINE  ·  eravos-admin.js  ·  v0.5.0
   UUID: eravos-admin-engine-0001-0000-000000000001
   HOOK: eravos.admin:engine:00001
   PARENT: eravos-kernel   OWNER: shared/eravos-admin.js   (§17.1)
   ══════════════════════════════════════════════════════════════════════════

   Classic script, same as the rest of the kernel layer. No build step.

   ── WHY THIS EXISTS (§16.1 — the nearest gap) ────────────────────────────

   Identity was hardcoded. `seedContainedAccounts()` FORCE-SEEDS the partner
   account on every single page load:

       existing['raven'] = Object.assign({}, existing['raven']||{}, {
         name:'Raven', ... dbPrefix:'raven', ...
       });

   So any rename made anywhere in the UI is silently reverted on the next
   reload. Editing the user through Settings looks like it worked and then
   quietly undoes itself — §1.2, a silent failure that corrupts state rather
   than crashing. This engine is the write authority (§10.1); the seeder is
   changed to defer to it.

   ── THE CENTRAL DISTINCTION (§17.3 — judgment recorded, not buried) ──────

   RENAME and REPLACE are NOT the same operation and must never share a code
   path:

     RENAME  — the same person, a different label. Their feelings, ruptures,
               vault, codex, growth log all belong to them and MUST follow
               the rename. Crypto identity and peer IDs are preserved: it is
               still the same party to the connection.

     REPLACE — a different person in the partner slot. The outgoing person's
               data is THEIRS. Migrating a previous partner's logged feelings,
               ruptures and shared history into a new person's namespace
               would be false on its face and would corrupt every downstream
               relational derivation that reads it. So data does NOT follow.
               Crypto identity is regenerated (a new party cannot inherit the
               old party's key — §17.5, provenance) and peer IDs are reissued.

   Offering only one of these would force the wrong one. Both exist, and the
   UI makes the difference explicit rather than leaving it to a guess.

   ── EVERY DESTRUCTIVE OPERATION (§0.3, §9.4, §1.2) ───────────────────────

   §0.3 information is never lost — an export snapshot is taken BEFORE any
   destructive step, and the caller gets it back whether or not they asked.
   §9.4 export is a first-class operation, not an afterthought.
   §1.2 every operation returns a REPORT naming each key touched. Never a
   bare boolean, never "done".
   ══════════════════════════════════════════════════════════════════════════ */

(function (global) {
  'use strict';

  var ADMIN_VERSION = '0.5.0';
  var ADMIN_UUID    = 'eravos-admin-engine-0001-0000-000000000001';

  var USERS_KEY       = 'eravors_users';
  var ACTIVE_USER_KEY = 'eravors_active_user_key';

  /* Keys that describe the PAIR, not either person. Cleared when a
     co-creation connection is torn down or a partner is replaced.
     §13.2 — every one named explicitly rather than matched by a loose
     wildcard that could take something unintended with it. */
  var COCREATION_KEYS = [
    'eravors_partner_feeling_latest',
    'eravors_partner_signal_latest',
    'eravors_partner_mirror_received',
    'eravors_partner_struggles_checklist',
    'eravors_partner_struggles_story',
    'eravors_partner_trigger_map_shared',
    'eravors_pipeline_code',
    'eravors_pipeline_name',
    'eravors_pending_invite',
    'eravors_last_connected',
    'eravors_last_pong',
    'eravors_connection_history',
    'eravors_love_inbox',
    'eravors_love_sent',
    'eravors_safety_requests',
    'eravors_poke_history',
    'eravors_last_one_way_received',
    'eravors_duo_ask_declined_at',
    'shared_partner_feeling_expresses'
  ];

  /* Prefixes for pair-scoped namespaces cleared wholesale. */
  var COCREATION_PREFIXES = ['shared_', 'eravors_outbox_', 'eravors_identity_'];

  /* ── storage adapter ──────────────────────────────────────────────────
     Injectable so the engine is exercisable with no browser at all
     (§3.4 — raw execution before interfaces). Defaults to the kernel's DB. */

  function defaultStore() {
    if (global.DB && typeof global.DB.get === 'function') {
      return {
        get: function (k, d) { return global.DB.get(k, d); },
        set: function (k, v) { global.DB.set(k, v); },
        remove: function (k) {
          if (global.DB.remove) global.DB.remove(k);
          else if (global.localStorage) global.localStorage.removeItem(k);
        },
        keys: function () {
          var out = [];
          if (!global.localStorage) return out;
          for (var i = 0; i < global.localStorage.length; i++) out.push(global.localStorage.key(i));
          return out;
        }
      };
    }
    throw new Error('[admin] no storage available — DB is not loaded. Refusing to operate blind.');
  }

  function AdminEngine(store) {
    if (!store) store = defaultStore();
    this.store = store;
    this.log = [];
  }

  AdminEngine.VERSION = ADMIN_VERSION;
  AdminEngine.UUID    = ADMIN_UUID;
  AdminEngine.COCREATION_KEYS = COCREATION_KEYS;

  AdminEngine.prototype._note = function (action, detail) {
    this.log.push({ action: action, detail: detail, ts: Date.now() });
  };

  /* ── read ─────────────────────────────────────────────────────────── */

  AdminEngine.prototype.users = function () {
    var raw = this.store.get(USERS_KEY, {}) || {};
    var out = [];
    for (var key in raw) {
      if (!Object.prototype.hasOwnProperty.call(raw, key)) continue;
      var u = raw[key] || {};
      out.push({
        key: key,
        name: u.name || key,
        email: u.email || key,
        role: u.role || 'partner',
        isAdmin: !!u.isAdmin,
        mode: u.mode || 'duo',
        recoveryViaPartner: !!u.recoveryViaPartner,
        dbPrefix: u.dbPrefix || key,
        peerId: u.peerId || null,
        partnerId: u.partnerId || null,
        created: u.created || null,
        dataKeys: this.keysFor(u.dbPrefix || key).length
      });
    }
    return out.sort(function (a, b) { return (b.isAdmin ? 1 : 0) - (a.isAdmin ? 1 : 0); });
  };

  /** Every stored key belonging to one namespace. §2.3 — state is observable. */
  AdminEngine.prototype.keysFor = function (prefix) {
    if (!prefix) return [];
    var p = prefix + '_';
    var extra = ['eravors_' + prefix + '_theme', prefix + '_avatar_img'];
    return this.store.keys().filter(function (k) {
      return k.indexOf(p) === 0 || extra.indexOf(k) !== -1;
    });
  };

  /** §9.4 — full snapshot. Taken before every destructive operation. */
  AdminEngine.prototype.exportAll = function () {
    var self = this, data = {};
    this.store.keys().forEach(function (k) { data[k] = self.store.get(k, null); });
    return {
      exportedAt: new Date().toISOString(),
      engine: ADMIN_VERSION,
      keyCount: Object.keys(data).length,
      data: data
    };
  };

  AdminEngine.prototype.exportUser = function (userKey) {
    var users = this.store.get(USERS_KEY, {}) || {};
    var u = users[userKey];
    if (!u) throw new Error('[admin] exportUser: no user "' + userKey + '"');
    var self = this, data = {};
    this.keysFor(u.dbPrefix || userKey).forEach(function (k) { data[k] = self.store.get(k, null); });
    return {
      exportedAt: new Date().toISOString(),
      userKey: userKey, profile: u,
      keyCount: Object.keys(data).length, data: data
    };
  };

  /* ── edit ─────────────────────────────────────────────────────────── */

  /** Edit display fields only. Never touches the account key or dbPrefix —
      that is what rename() is for, and conflating them is how data orphans. */
  AdminEngine.prototype.editUser = function (userKey, fields) {
    var users = this.store.get(USERS_KEY, {}) || {};
    if (!users[userKey]) throw new Error('[admin] editUser: no user "' + userKey + '"');
    var allowed = ['name', 'bio', 'role', 'isAdmin', 'mode', 'recoveryViaPartner'];
    var changed = {};
    for (var f in fields) {
      if (allowed.indexOf(f) === -1) continue;
      if (users[userKey][f] === fields[f]) continue;
      changed[f] = { from: users[userKey][f], to: fields[f] };
      users[userKey][f] = fields[f];
    }
    // role and isAdmin must agree — two fields encoding one fact is drift
    if ('role' in changed || 'isAdmin' in changed) {
      users[userKey].isAdmin = users[userKey].role === 'admin';
    }
    this.store.set(USERS_KEY, users);
    this._note('editUser', { userKey: userKey, changed: changed });
    return { ok: true, userKey: userKey, changed: changed,
             note: Object.keys(changed).length ? null : 'nothing changed' };
  };

  /* ── rename: SAME person, data follows ───────────────────────────── */

  AdminEngine.prototype.renameUser = function (oldKey, newKey, newName) {
    newKey = String(newKey || '').toLowerCase().trim();
    if (!/^[a-z0-9_-]{2,32}$/.test(newKey)) {
      throw new Error('[admin] renameUser: key must be 2-32 chars of a-z 0-9 _ - (got "' + newKey + '")');
    }
    var users = this.store.get(USERS_KEY, {}) || {};
    if (!users[oldKey]) throw new Error('[admin] renameUser: no user "' + oldKey + '"');
    if (users[newKey] && newKey !== oldKey) throw new Error('[admin] renameUser: "' + newKey + '" already exists');

    var snapshot = this.exportUser(oldKey);   // §0.3 before anything moves
    var self = this;
    var oldPrefix = users[oldKey].dbPrefix || oldKey;
    var moved = [];

    // 1. move every namespaced key. Same person -> their data follows them.
    this.keysFor(oldPrefix).forEach(function (k) {
      var nk = k.indexOf(oldPrefix + '_') === 0
        ? newKey + k.slice(oldPrefix.length)
        : k.split(oldPrefix).join(newKey);
      if (nk === k) return;
      self.store.set(nk, self.store.get(k, null));
      self.store.remove(k);
      moved.push({ from: k, to: nk });
    });

    // 2. move the account entry
    var profile = users[oldKey];
    profile.email = newKey;
    profile.dbPrefix = newKey;
    if (newName) profile.name = newName;
    // peer identity is PRESERVED — same party to the connection
    delete users[oldKey];
    users[newKey] = profile;
    this.store.set(USERS_KEY, users);

    // 3. repoint the counterpart's partnerId if it referenced the old peer
    var repointed = [];
    for (var k2 in users) {
      if (users[k2].partnerId === profile.peerId) repointed.push(k2);
    }

    if (this.store.get(ACTIVE_USER_KEY, null) === oldKey) this.store.set(ACTIVE_USER_KEY, newKey);

    this._note('renameUser', { from: oldKey, to: newKey, moved: moved.length });
    return {
      ok: true, operation: 'rename', from: oldKey, to: newKey,
      keysMoved: moved, peerIdPreserved: profile.peerId,
      cryptoIdentityPreserved: true, counterpartsRepointed: repointed,
      snapshot: snapshot,
      note: 'Same person, new label. Their data followed them. Peer identity and ' +
            'crypto keys preserved — still the same party to the connection.'
    };
  };

  /* ── replace: DIFFERENT person, data does NOT follow ─────────────── */

  /**
   * @param {string} slotKey      account being vacated
   * @param {object} incoming     { key, name, password }
   * @param {object} opts         { disposition: 'archive' | 'purge' }
   *
   * disposition is REQUIRED and has no default. §1.2 — a destructive choice
   * must never be made silently on the caller's behalf.
   */
  AdminEngine.prototype.replacePartner = function (slotKey, incoming, opts) {
    opts = opts || {};
    if (opts.disposition !== 'archive' && opts.disposition !== 'purge') {
      throw new Error('[admin] replacePartner: opts.disposition must be "archive" or "purge". ' +
                      'There is no default — this decides whether a real person\'s logged history is kept.');
    }
    // Order matters. The admin-account refusal is the MORE IMPORTANT reason,
    // so it fires first -- otherwise a typo'd key masks it and the message
    // names the wrong problem (§1.2: name the real cause, not the first one hit).
    var users = this.store.get(USERS_KEY, {}) || {};
    if (!users[slotKey]) throw new Error('[admin] replacePartner: no user "' + slotKey + '"');
    if (users[slotKey].role === 'admin') {
      throw new Error('[admin] replacePartner: refusing to replace the admin account. Use renameUser, or edit the role first.');
    }
    var newKey = String(incoming && incoming.key || '').toLowerCase().trim();
    if (!/^[a-z0-9_-]{2,32}$/.test(newKey)) {
      throw new Error('[admin] replacePartner: key must be 2-32 chars of a-z 0-9 _ - (got "' + newKey + '")');
    }
    if (users[newKey]) throw new Error('[admin] replacePartner: "' + newKey + '" already exists');

    var outgoing = users[slotKey];
    var snapshot = this.exportUser(slotKey);          // §0.3, always
    var self = this;
    var oldPrefix = outgoing.dbPrefix || slotKey;

    // 1. outgoing person's data. It is THEIRS -- it does not transfer.
    var archived = [], purged = [];
    this.keysFor(oldPrefix).forEach(function (k) {
      if (opts.disposition === 'archive') {
        var ak = 'eravors_archive_' + oldPrefix + '_' + Date.now() + '__' + k;
        self.store.set(ak, self.store.get(k, null));
        archived.push({ from: k, to: ak });
      } else {
        purged.push(k);
      }
      self.store.remove(k);
    });

    // 2. tear the pair down. A new person does not inherit the old pairing.
    var teardown = this.clearCoCreation({ _internal: true });

    // 3. new account. NEW peer identity -- §17.5, provenance is not inherited.
    var newPeer = 'eravos-' + newKey + '-' + Math.random().toString(36).slice(2, 10);
    var counterpart = null;
    for (var k3 in users) { if (users[k3].role === 'admin') counterpart = k3; }

    users[newKey] = {
      name: incoming.name || newKey,
      email: newKey,
      password: incoming.password || outgoing.password,
      mode: 'duo',
      theme: '',                       // themes retired -- default only
      role: outgoing.role || 'partner',
      peerId: newPeer,
      partnerId: counterpart ? users[counterpart].peerId : null,
      created: Date.now(),
      dbPrefix: newKey,
      isAdmin: false
    };
    delete users[slotKey];
    if (counterpart) users[counterpart].partnerId = newPeer;
    this.store.set(USERS_KEY, users);

    if (this.store.get(ACTIVE_USER_KEY, null) === slotKey) this.store.remove(ACTIVE_USER_KEY);

    this._note('replacePartner', { from: slotKey, to: newKey, disposition: opts.disposition });
    return {
      ok: true, operation: 'replace',
      outgoing: { key: slotKey, name: outgoing.name, peerId: outgoing.peerId },
      incoming: { key: newKey, name: users[newKey].name, peerId: newPeer },
      disposition: opts.disposition,
      archived: archived, purged: purged,
      coCreationTeardown: teardown,
      cryptoIdentityRegenerated: true,
      counterpartRepointed: counterpart,
      snapshot: snapshot,
      note: 'A different person now holds this slot. The previous person\'s data did NOT ' +
            'transfer — it was ' + opts.disposition + 'd. New peer identity issued; crypto ' +
            'keys regenerated. The new connection must be established fresh.'
    };
  };

  /* ── remove ──────────────────────────────────────────────────────── */

  AdminEngine.prototype.removeUser = function (userKey, opts) {
    opts = opts || {};
    if (opts.disposition !== 'archive' && opts.disposition !== 'purge') {
      throw new Error('[admin] removeUser: opts.disposition must be "archive" or "purge". No default.');
    }
    var users = this.store.get(USERS_KEY, {}) || {};
    if (!users[userKey]) throw new Error('[admin] removeUser: no user "' + userKey + '"');
    if (users[userKey].role === 'admin') {
      var admins = 0;
      for (var k in users) if (users[k].role === 'admin') admins++;
      if (admins <= 1) throw new Error('[admin] removeUser: refusing to remove the last admin account. The app would become unadministrable.');
    }

    var snapshot = this.exportUser(userKey);
    var self = this, prefix = users[userKey].dbPrefix || userKey;
    var archived = [], purged = [];
    this.keysFor(prefix).forEach(function (k) {
      if (opts.disposition === 'archive') {
        var ak = 'eravors_archive_' + prefix + '_' + Date.now() + '__' + k;
        self.store.set(ak, self.store.get(k, null));
        archived.push({ from: k, to: ak });
      } else { purged.push(k); }
      self.store.remove(k);
    });

    var peerId = users[userKey].peerId;
    delete users[userKey];
    var repointed = [];
    for (var k2 in users) {
      if (users[k2].partnerId === peerId) { users[k2].partnerId = null; repointed.push(k2); }
    }
    this.store.set(USERS_KEY, users);
    if (this.store.get(ACTIVE_USER_KEY, null) === userKey) this.store.remove(ACTIVE_USER_KEY);

    this._note('removeUser', { userKey: userKey, disposition: opts.disposition });
    return { ok: true, operation: 'remove', userKey: userKey, disposition: opts.disposition,
             archived: archived, purged: purged, partnersUnlinked: repointed, snapshot: snapshot };
  };

  /* ── co-creation teardown ────────────────────────────────────────── */

  /**
   * Clears the PAIR. Neither person's own journal, vault, codex or feeling
   * history is touched — those are individual, not shared.
   */
  AdminEngine.prototype.clearCoCreation = function (opts) {
    opts = opts || {};
    var snapshot = opts._internal ? null : this.exportAll();
    var self = this, cleared = [];

    COCREATION_KEYS.forEach(function (k) {
      if (self.store.get(k, null) !== null) { self.store.remove(k); cleared.push(k); }
    });
    this.store.keys().forEach(function (k) {
      for (var i = 0; i < COCREATION_PREFIXES.length; i++) {
        if (k.indexOf(COCREATION_PREFIXES[i]) === 0) { self.store.remove(k); cleared.push(k); return; }
      }
    });

    var users = this.store.get(USERS_KEY, {}) || {};
    var unlinked = [];
    for (var uk in users) {
      if (users[uk].partnerId) { users[uk].partnerId = null; unlinked.push(uk); }
    }
    this.store.set(USERS_KEY, users);

    this._note('clearCoCreation', { cleared: cleared.length });
    return {
      ok: true, operation: 'clearCoCreation',
      keysCleared: cleared, partnersUnlinked: unlinked,
      snapshot: snapshot,
      note: 'Pair state only. Neither person\'s own journal, vault, codex or feeling ' +
            'history was touched — those are individual, not shared. Crypto identity ' +
            'keys were cleared, so the next connection performs a fresh handshake.'
    };
  };

  /* ── themes ──────────────────────────────────────────────────────── */

  /** §16.5 — delete before add. Strips every retired theme from storage. */
  AdminEngine.prototype.purgeThemes = function () {
    var RETIRED = ['raven-theme', 'golden-theme', 'romeo-theme'];
    var self = this, cleared = [];
    ['eravors_active_theme', 'eravors_james_theme', 'eravors_raven_theme'].forEach(function (k) {
      if (self.store.get(k, null) !== null) { self.store.remove(k); cleared.push(k); }
    });
    var users = this.store.get(USERS_KEY, {}) || {};
    var reset = [];
    for (var uk in users) {
      if (users[uk].theme && RETIRED.indexOf(users[uk].theme) !== -1) {
        users[uk].theme = ''; reset.push(uk);
      }
    }
    this.store.set(USERS_KEY, users);
    this._note('purgeThemes', { cleared: cleared.length, reset: reset.length });
    return { ok: true, operation: 'purgeThemes', keysCleared: cleared,
             usersReset: reset, remaining: ['(default) 🔥 Original Fire'] };
  };

  /* ── §12.6 diagnostics ───────────────────────────────────────────── */

  AdminEngine.prototype.health = function () {
    var users = this.users();
    var self = this;
    var pairKeysLive = COCREATION_KEYS.filter(function (k) { return self.store.get(k, null) !== null; });
    var admins = users.filter(function (u) { return u.isAdmin; }).length;
    var orphanPrefixes = [];
    var known = {};
    users.forEach(function (u) { known[u.dbPrefix] = 1; });
    this.store.keys().forEach(function (k) {
      // Capture the FIRST segment only. '_' must NOT be in the class or the
      // match runs greedily across the entire key -- found by the end-to-end
      // test, which saw a clean archive report as 'orphaned-data'.
      var m = /^([a-z0-9-]+)_/.exec(k);
      if (!m) return;
      var p = m[1];
      if (p === 'eravors' || p === 'shared' || p === 'solo') return;
      if (k.indexOf('eravors_archive_') === 0) return;   // archived on purpose, not orphaned
      if (!known[p] && orphanPrefixes.indexOf(p) === -1) orphanPrefixes.push(p);
    });
    return {
      version: ADMIN_VERSION,
      users: users.length,
      admins: admins,
      coCreationActive: pairKeysLive.length > 0,
      pairKeysLive: pairKeysLive,
      orphanedDataPrefixes: orphanPrefixes,   // §12.5 — a gap is information
      totalKeys: this.store.keys().length,
      recentOperations: this.log.slice(-10),
      status: admins === 0 ? 'unadministrable'
            : orphanPrefixes.length ? 'orphaned-data'
            : 'healthy'
    };
  };

  global.AdminEngine = AdminEngine;
  if (typeof module !== 'undefined' && module.exports) module.exports = { AdminEngine: AdminEngine, COCREATION_KEYS: COCREATION_KEYS };
})(typeof window !== 'undefined' ? window : globalThis);
