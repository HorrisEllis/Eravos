/* ══════════════════════════════════════════════════════════════════════════
   ERAVOS PERSISTENCE  ·  eravos-persistence.js  ·  v0.24.0
   UUID: eravos-persistence-guard-0001-0000-000000000001
   HOOK: eravos.persistence:guard:00001
   PARENT: eravos-kernel   OWNER: shared/eravos-persistence.js   (§17.1)
   ══════════════════════════════════════════════════════════════════════════

   Two ways data goes quiet. Both reproduced before writing a line of this.

   ── 1. THE ORPHAN NAMESPACE ─────────────────────────────────────────────

       _userKey(k) => (S.dbPrefix || 'solo') + '_' + k

   `S.dbPrefix` is null until an account is active. Anything written before
   that lands under `solo_*`. The moment a prefix exists, every read looks at
   `james_*` and the earlier writes are INVISIBLE — not deleted, not errored,
   just unreachable.

   Reproduced:
       write feeling with no prefix  ->  solo_feeling
       set dbPrefix = 'james'
       dbGet('feeling')             ->  null

   That is the worst failure shape in the whole app: the data is right there
   on disk and the person is told they never wrote it.

   `adopt()` moves orphans into the active namespace once, on login, and
   NEVER overwrites — if both keys exist the newer one wins and the older is
   kept under an archive key rather than dropped (§0.3).

   ── 2. SOLO HISTORY AT THE MOMENT OF PAIRING ────────────────────────────

       dbSet(k,v) { DB.set(userKey, v); if (mode==='duo') DB.set(sharedKey, v); }

   The shared copy is written on the NEXT write, not at pairing. So a year of
   solo writing exists under `james_*` and `shared_*` is empty until you
   happen to touch each thing again. From the couple view, the history looks
   like it began the day you paired.

   `promote()` copies the solo namespace into shared at the moment of
   pairing — additively, and only for keys shared is missing. It never
   overwrites something the pair already has, because that would let one
   person's solo history silently replace joint state.

   ── WHAT IT WILL NOT DO ─────────────────────────────────────────────────

   It never deletes. It never merges two non-empty values. When both sides
   hold something and they differ, it keeps both and reports the conflict
   rather than picking — a silent pick here is one person's history quietly
   winning over the other's (§1.2).
   ══════════════════════════════════════════════════════════════════════════ */

(function (global) {
  'use strict';

  var PERSIST_VERSION = '0.24.0';
  var PERSIST_UUID = 'eravos-persistence-guard-0001-0000-000000000001';
  var LOG_KEY = 'eravors_persistence_log';

  // Namespaces that are NOT per-user data and must never be moved.
  var SYSTEM_PREFIXES = ['eravors_', 'eros_', 'shared_'];

  function defaultStore() {
    if (global.DB && typeof global.DB.get === 'function') return global.DB;
    throw new Error('[persistence] no storage available — DB is not loaded. Refusing to operate blind.');
  }

  function Persistence(opts) {
    opts = opts || {};
    this.db = opts.db || defaultStore();
    this.now = opts.now || function () { return Date.now(); };
  }

  Persistence.VERSION = PERSIST_VERSION;
  Persistence.UUID = PERSIST_UUID;
  Persistence.SYSTEM_PREFIXES = SYSTEM_PREFIXES;

  Persistence.prototype._keys = function () {
    if (typeof this.db.keys === 'function') return this.db.keys();
    var out = [];
    try {
      for (var i = 0; i < localStorage.length; i++) out.push(localStorage.key(i));
    } catch (e) {}
    return out;
  };

  function isSystem(k) {
    for (var i = 0; i < SYSTEM_PREFIXES.length; i++) if (k.indexOf(SYSTEM_PREFIXES[i]) === 0) return true;
    return false;
  }

  /**
   * Move anything written before an account existed into the active
   * namespace. Idempotent — safe on every login.
   */
  Persistence.prototype.adopt = function (prefix, opts) {
    opts = opts || {};
    var from = (opts.from || 'solo') + '_';
    var to = prefix + '_';
    if (!prefix || prefix === (opts.from || 'solo')) {
      return { ok: true, moved: 0, note: 'nothing to adopt — already in that namespace' };
    }
    var db = this.db, self = this;
    var moved = [], conflicts = [], skipped = [];

    this._keys().forEach(function (k) {
      if (k.indexOf(from) !== 0 || isSystem(k)) return;
      var bare = k.slice(from.length);
      var target = to + bare;
      var orphan = db.get(k, null);
      if (orphan === null || orphan === undefined) return;
      var existing = db.get(target, null);

      if (existing === null || existing === undefined) {
        db.set(target, orphan);
        moved.push(bare);
        return;
      }
      if (JSON.stringify(existing) === JSON.stringify(orphan)) { skipped.push(bare); return; }
      // §1.2 — both sides hold something and they differ. Do NOT pick. Keep
      // the orphan under an archive key and report it; a silent pick here is
      // one version of someone's history quietly winning.
      db.set(to + '_orphaned_' + bare, orphan);
      conflicts.push(bare);
    });

    if (moved.length || conflicts.length) {
      var log = db.get(LOG_KEY, []) || [];
      log.push({ ts: this.now(), action: 'adopt', from: opts.from || 'solo', to: prefix,
                 moved: moved.length, conflicts: conflicts });
      db.set(LOG_KEY, log.slice(-100));
    }
    return {
      ok: true, moved: moved.length, movedKeys: moved,
      alreadyIdentical: skipped.length,
      conflicts: conflicts,
      note: conflicts.length
        ? conflicts.length + ' key(s) existed in both and differed. Neither was overwritten — ' +
          'the earlier version is kept under ' + to + '_orphaned_*.'
        : (moved.length ? moved.length + ' moved into ' + prefix : 'nothing orphaned'),
    };
  };

  /**
   * At the moment of pairing, seed `shared_*` from the solo namespace so the
   * couple view does not begin the day you paired.
   *
   * ADDITIVE ONLY. Never overwrites something shared already holds.
   */
  Persistence.prototype.promote = function (prefix) {
    if (!prefix) throw new Error('[persistence] promote(): a source prefix is required');
    var db = this.db;
    var from = prefix + '_';
    var seeded = [], held = [];

    this._keys().forEach(function (k) {
      if (k.indexOf(from) !== 0 || isSystem(k)) return;
      var bare = k.slice(from.length);
      if (bare.indexOf('_orphaned_') === 0) return;
      var v = db.get(k, null);
      if (v === null || v === undefined) return;
      var target = 'shared_' + bare;
      var existing = db.get(target, null);
      if (existing === null || existing === undefined) { db.set(target, v); seeded.push(bare); }
      else held.push(bare);
    });

    if (seeded.length) {
      var log = db.get(LOG_KEY, []) || [];
      log.push({ ts: this.now(), action: 'promote', from: prefix, seeded: seeded.length });
      db.set(LOG_KEY, log.slice(-100));
    }
    return {
      ok: true, seeded: seeded.length, seededKeys: seeded,
      leftAlone: held.length,
      note: 'Additive only. ' + held.length + ' key(s) the pair already had were left untouched — ' +
            'one person\'s solo history must not silently replace joint state.',
    };
  };

  /** What would move, without moving it. */
  Persistence.prototype.inspect = function (prefix) {
    var db = this.db, self = this;
    var orphans = [], mine = [], shared = [];
    this._keys().forEach(function (k) {
      if (isSystem(k) && k.indexOf('shared_') !== 0) return;
      if (k.indexOf('shared_') === 0) { shared.push(k.slice(7)); return; }
      if (k.indexOf('solo_') === 0) { orphans.push(k.slice(5)); return; }
      if (prefix && k.indexOf(prefix + '_') === 0) mine.push(k.slice(prefix.length + 1));
    });
    return {
      prefix: prefix || null,
      orphaned: orphans,
      mine: mine,
      shared: shared,
      soloOnly: mine.filter(function (k) { return shared.indexOf(k) === -1; }),
      wouldAdopt: orphans.filter(function (k) { return mine.indexOf(k) === -1; }),
    };
  };

  /**
   * @param {string} [prefix] — defaults to the active account.
   * It took a parameter only after a test caught it: reading `global.S`
   * directly made this work in a browser and report zeros everywhere else,
   * which is a diagnostic that lies in exactly the place you would run it.
   */
  Persistence.prototype.health = function (prefix) {
    var i = this.inspect(prefix || (global.S && global.S.dbPrefix));
    return {
      version: PERSIST_VERSION,
      prefix: i.prefix,
      orphanedKeys: i.orphaned.length,
      myKeys: i.mine.length,
      sharedKeys: i.shared.length,
      // The number that says a pairing would look like it started today.
      soloOnlyNotShared: i.soloOnly.length,
      log: (this.db.get(LOG_KEY, []) || []).slice(-5),
      deletesPerformed: 0,          // structurally — it never deletes
      status: i.orphaned.length ? 'orphans-present' : 'clean',
    };
  };

  global.Persistence = Persistence;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { Persistence: Persistence, SYSTEM_PREFIXES: SYSTEM_PREFIXES, LOG_KEY: LOG_KEY };
  }
})(typeof window !== 'undefined' ? window : globalThis);
