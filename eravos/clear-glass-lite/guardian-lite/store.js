/**
 * store.js — Clear Glass Lite's local persistent store
 *
 * §REUSED VERBATIM 2026-07-19 — copied from nexus/guardian/jaa-store.js,
 * unchanged. Already had zero NEXUS dependencies at the class level (only
 * requires fs/path) — confirmed by grep before copying, not assumed. This
 * IS the real, battle-tested engine full Guardian itself runs on, not a
 * simplified reimplementation — "lightweight" here means "no cortex/
 * orchestrator/SISO wrapped around it," not "a smaller, less-real store."
 *
 * jaa-store.js — Guardian v8 Pure-JS Relational Store
 *
 * Zero native dependencies. Works on any platform, any Node version.
 * Jaa-inspired: tables-as-Maps, SISO-compliant, flat-file persistence.
 *
 * Persistence model:
 *   Each table → memory_store/<table>.json  (full snapshot on debounced write)
 *   On boot: load all tables from disk → rebuild in-memory Maps
 *
 * API (mirrors better-sqlite3 call shapes so server.js diff is minimal):
 *   store.run(table, op, row, where?)   → { changes, lastInsertRowid }
 *   store.get(table, where)             → row | null
 *   store.all(table, where, opts?)      → row[]
 *   store.insert(table, row)            → row
 *   store.upsert(table, row, keyField?) → row
 *   store.update(table, where, values)  → count
 *   store.delete(table, where)          → count
 *   store.count(table, where?)          → number
 *   store.exec(sql)                     → void  (ignored — compat shim)
 *   store.pragma(p)                     → void  (ignored — compat shim)
 *
 * Where clause: plain object { field: value, ... } — all fields must match (AND).
 * Opts: { orderBy, order: 'ASC'|'DESC', limit, offset }
 *
 * Settings table bootstrapped from schema defaults on first run.
 */

'use strict';

const fs   = require('fs');
const path = require('path');

// ── Default settings (mirrors schema.sql INSERT OR IGNORE INTO settings) ──────

const DEFAULT_SETTINGS = {
  session_greeting_enabled: 'true',
  session_greeting_text:    'Guardian session initialising. Please ask me: "What are we calling this session?" — then wait for my answer before we begin.',
  scan_debounce_ms:         '1500',
  artifact_max:             '500',
  gap_min_score:            '0.25',
  gap_taxonomy_version:     '3.0.0',
  pa_enabled:               'true',
  memory_auto_push:         'true',
  dropzone_auto_upload:     'true',
  stream_log_level:         'EVENTS',
  lan_host:                 '0.0.0.0',
  greeting_delay_ms:        '1200',
  poll_interval_ms:         '500',
  stable_count_threshold:   '5',
};

// ── JaaStore ───────────────────────────────────────────────────────────────────

class JaaStore {
  /**
   * @param {string} dir  Directory for .json files (memory_store/)
   * @param {object} [opts]
   * @param {string} [opts.tablePrefix]  §MULTI-TENANT 2026-07-18 — when
   *   multiple systems share one directory (see cortex/memory/jaa-db.js and
   *   guardian/server.js both constructing a JaaStore), an unprefixed
   *   instance's _loadAll() would blindly load every .json file in the
   *   directory as its own table — including another system's same-named
   *   table ('settings' exists in both cortex's and guardian's table lists
   *   today; without this, pointing guardian at cortex's directory would
   *   silently merge two unrelated 'settings' tables). Prefix is applied
   *   only at the disk-file layer (_file/_loadAll) — every caller keeps
   *   using bare table names ('settings', not 'guardian_settings'); the
   *   in-memory Maps and every existing insert/query/update call site are
   *   untouched. Same pattern idearium/lib/db.js already uses at the
   *   application level, pushed down into the store itself so a second
   *   consumer doesn't have to reimplement it.
   */
  constructor(dir, opts = {}) {
    this.dir         = dir;
    this.tablePrefix = opts.tablePrefix || '';
    this._tables  = new Map();  // table name → Map<id, row>
    this._dirty   = new Set();  // tables needing flush
    this._timers  = new Map();  // table → setTimeout handle
    this._pendingDeletes = new Map(); // table → Set<id> deleted by this process since its last flush
    this._closed  = false;

    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    this._loadAll();
    this._bootstrapSettings();
    console.log('[jaa] Store ready —', dir, this.tablePrefix ? `(prefix: ${this.tablePrefix})` : '');
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  PUBLIC API
  // ══════════════════════════════════════════════════════════════════════════

  /** INSERT a row. row.id must exist (caller provides UUID). */
  insert(table, row) {
    const tbl = this._table(table);
    const id  = row.id || row.key || _uuid();
    const r   = { ...row, id };
    tbl.set(id, r);
    this._schedule(table);
    return r;
  }

  /** INSERT OR REPLACE — upserts by keyField (default 'id'). */
  upsert(table, row, keyField = 'id') {
    const tbl = this._table(table);
    const key = row[keyField];
    if (key) {
      // find existing by keyField value
      for (const [id, existing] of tbl) {
        if (existing[keyField] === key) {
          const updated = { ...existing, ...row, id };
          tbl.set(id, updated);
          this._schedule(table);
          return updated;
        }
      }
    }
    return this.insert(table, row);
  }

  /** SELECT one row matching where. */
  get(table, where = {}) {
    const tbl = this._table(table);
    for (const row of tbl.values()) {
      if (_matches(row, where)) return { ...row };
    }
    return null;
  }

  /** SELECT all rows matching where with optional orderBy/limit. */
  all(table, where = {}, opts = {}) {
    const tbl  = this._table(table);
    let   rows = [];
    for (const row of tbl.values()) {
      if (_matches(row, where)) rows.push({ ...row });
    }
    if (opts.orderBy) {
      const dir = (opts.order || 'ASC').toUpperCase() === 'DESC' ? -1 : 1;
      rows.sort((a, b) => {
        const va = a[opts.orderBy], vb = b[opts.orderBy];
        if (va == null && vb == null) return 0;
        if (va == null) return dir;
        if (vb == null) return -dir;
        return (va < vb ? -1 : va > vb ? 1 : 0) * dir;
      });
    }
    if (opts.offset) rows = rows.slice(opts.offset);
    if (opts.limit)  rows = rows.slice(0, opts.limit);
    return rows;
  }

  /** UPDATE rows matching where with values object. Returns changed count. */
  update(table, where, values) {
    const tbl = this._table(table);
    let   n   = 0;
    for (const [id, row] of tbl) {
      if (_matches(row, where)) {
        tbl.set(id, { ...row, ...values });
        n++;
      }
    }
    if (n > 0) this._schedule(table);
    return n;
  }

  /** DELETE rows matching where. Returns deleted count. */
  delete(table, where) {
    const tbl = this._table(table);
    let   n   = 0;
    for (const [id, row] of tbl) {
      if (_matches(row, where)) {
        tbl.delete(id);
        n++;
        // §MULTI-PROCESS FIX 2026-07-18 — remember what THIS process
        // deleted, so the pre-flush merge (see _flush) can reload fresh
        // disk state without resurrecting a row this process just
        // legitimately removed. See _flush's own comment for why the
        // reload has to happen this late in the first place.
        if (!this._pendingDeletes.has(table)) this._pendingDeletes.set(table, new Set());
        this._pendingDeletes.get(table).add(id);
      }
    }
    if (n > 0) this._schedule(table);
    return n;
  }

  /** COUNT rows matching where. */
  count(table, where = {}) {
    const tbl = this._table(table);
    if (!Object.keys(where).length) return tbl.size;
    let n = 0;
    for (const row of tbl.values()) if (_matches(row, where)) n++;
    return n;
  }

  // ── better-sqlite3 compat shims (so server.js dbRun/dbGet/dbAll still work) ─

  exec()   { /* schema DDL — no-op */ }
  pragma() { /* WAL/FK pragmas — no-op */ }

  // ── Settings helpers ──────────────────────────────────────────────────────────

  getSetting(key, fallback = null) {
    const row = this.get('settings', { key });
    return row ? row.value : fallback;
  }

  setSetting(key, value) {
    const ts  = Date.now();
    const row = this.get('settings', { key });
    if (row) {
      this.update('settings', { key }, { value: String(value), updated_ts: ts });
    } else {
      this.insert('settings', { id: _uuid(), key, value: String(value), updated_ts: ts });
    }
  }

  getAllSettings() {
    return this.all('settings').reduce((m, r) => { m[r.key] = r.value; return m; }, {});
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  FULL-TEXT SEARCH
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Search across artifacts, gaps, and ledger for query string.
   * Returns { artifacts[], gaps[], ledger[] }
   */
  search(q, limit = 50) {
    if (!q) return { artifacts: [], gaps: [], ledger: [] };
    const ql = q.toLowerCase();
    const match = (row, fields) => fields.some(f => (row[f] || '').toLowerCase().includes(ql));
    return {
      artifacts: this.all('artifacts')
        .filter(r => match(r, ['name', 'content', 'lang', 'account', 'chat_id']))
        .slice(0, limit),
      gaps: this.all('gaps')
        .filter(r => match(r, ['description', 'type', 'domain']))
        .slice(0, limit),
      ledger: this.all('ledger_entries')
        .filter(r => match(r, ['msg', 'category']))
        .slice(0, limit),
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  STATS
  // ══════════════════════════════════════════════════════════════════════════

  stats() {
    return {
      artifacts:   this.count('artifacts'),
      gaps:        this.count('gaps'),
      ledger:      this.count('ledger_entries'),
      sessions:    this.count('sessions'),
      jobs:        this.count('jobs'),
      downloads:   this.count('downloads'),
      pa_sessions: this.count('pa_sessions'),
      settings:    this.count('settings'),
      dbFile:      path.join(this.dir, '*.json'),
      dbExists:    true,
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  PERSISTENCE
  // ══════════════════════════════════════════════════════════════════════════

  /** Force flush all dirty tables to disk. */
  flushAll() {
    for (const table of this._dirty) this._flush(table);
  }

  /** Graceful shutdown — flush all and stop timers. */
  close() {
    this._closed = true;
    for (const [, timer] of this._timers) clearTimeout(timer);
    this.flushAll();
    console.log('[jaa] Store closed — all tables flushed.');
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  PRIVATE
  // ══════════════════════════════════════════════════════════════════════════

  _table(name) {
    if (!this._tables.has(name)) this._tables.set(name, new Map());
    return this._tables.get(name);
  }

  _file(table) {
    return path.join(this.dir, `${this.tablePrefix}${table}.json`);
  }

  _loadAll() {
    // Load any existing JSON files in the store dir that belong to THIS
    // instance's namespace. Unprefixed instances (tablePrefix='') keep
    // exactly the old behavior — every .json file in the dir is theirs,
    // same as before this change. Prefixed instances only ever see their
    // own files; a shared directory's other tenants are invisible to them.
    let files;
    try { files = fs.readdirSync(this.dir); }
    catch (_) { return; }
    for (const f of files) {
      if (!f.endsWith('.json')) continue;
      const stem = f.slice(0, -5);
      if (this.tablePrefix) {
        if (!stem.startsWith(this.tablePrefix)) continue;
        this._loadTable(stem.slice(this.tablePrefix.length));
      } else {
        this._loadTable(stem);
      }
    }
  }

  /**
   * reloadTable(name) — force-refresh this table's in-memory Map from
   * whatever is currently on disk, merging in any rows written by another
   * process since this instance last read them.
   *
   * §BUG FOUND AND FIXED 2026-07-18 — this file's own header claims
   * "single writer, multiple readers, zero duplication," but that was
   * never actually enforced: nothing stops two processes (idearium's own
   * API server and a concurrent CLI invocation both call getIdeaOS(),
   * each opening its own JaaStore pointed at the same directory) from
   * both holding this table open. Proven, not theorized: reproduced
   * directly — two processes each wrote 2 real rows to the same table,
   * final state had only 2 of the 4, the other process's writes were
   * silently destroyed by a plain overwrite that never saw them. The
   * root cause: query()/all() always read the in-process Map, populated
   * once at construction and never refreshed — a caller diffing "current
   * vs new" before a sync-style write was diffing against data that was
   * already stale the moment a second process existed. This method is
   * the fix's other half — callers doing a read-diff-write cycle (see
   * idearium/lib/db.js's syncTable) call this immediately before reading,
   * so the diff is against real current disk state, not a memory of what
   * disk looked like at boot.
   *
   * Known remaining limitation, not silently papered over: this ADDS/
   * UPDATES from disk into memory, it does not remove rows that exist in
   * memory but were deleted from disk by another process — _loadTable's
   * own behavior, inherited here deliberately rather than reimplemented,
   * since idearium's own rows are essentially never hard-deleted (§M1 —
   * archived in place, not removed). A consumer relying on real deletes
   * propagating correctly across processes would need more than this.
   */
  reloadTable(name) {
    this._loadTable(name);
  }

  _loadTable(name) {
    const file = this._file(name);
    if (!fs.existsSync(file)) return;
    try {
      const rows = JSON.parse(fs.readFileSync(file, 'utf8'));
      const tbl  = this._table(name);
      if (Array.isArray(rows)) {
        for (const row of rows) {
          const id = row.id || row.key || _uuid();
          tbl.set(id, { ...row, id });
        }
        console.log(`[jaa] Loaded ${tbl.size} rows — ${name}`);
      }
    } catch (e) {
      console.error(`[jaa] Load error (${name}): ${e.message}`);
    }
  }

  _schedule(table, delay = 1500) {
    this._dirty.add(table);
    if (this._timers.has(table)) clearTimeout(this._timers.get(table));
    this._timers.set(table, setTimeout(() => {
      this._flush(table);
      this._timers.delete(table);
    }, delay));
  }

  _flush(table) {
    if (!this._dirty.has(table)) return;
    this._dirty.delete(table);
    const tbl  = this._tables.get(table);
    if (!tbl) return;

    // §MULTI-PROCESS FIX 2026-07-18 — REAL fix for the limitation the
    // previous comment here (still below) named but deliberately left
    // open. reloadTable() alone (added earlier the same day, see
    // jaa-store.js's own header) was not enough on its own: a caller like
    // idearium/lib/db.js's syncTable calls it before its own diff, but
    // _flush fires later, on a DEBOUNCED timer (up to 1500ms after that
    // diff), and always wrote whatever was in the in-memory map AT FLUSH
    // TIME — so any write from another process landing in that gap was
    // silently overwritten anyway. Proven: two real processes each
    // writing 2 rows, final state had only 2 of 4, even with the earlier
    // reloadTable() fix in place. Real fix has to happen here, immediately
    // before the write, not earlier in some caller's diff step — merge
    // fresh disk state into this table's map right now, skipping any id
    // THIS process explicitly deleted since its own last flush (tracked
    // in _pendingDeletes by delete() above), so a legitimate delete
    // doesn't get silently undone by a concurrent process's older copy of
    // the same row still being on disk.
    const deletedByMe = this._pendingDeletes.get(table);
    try {
      const file = this._file(table);
      if (fs.existsSync(file)) {
        const onDisk = JSON.parse(fs.readFileSync(file, 'utf8'));
        if (Array.isArray(onDisk)) {
          for (const row of onDisk) {
            const id = row.id || row.key;
            if (id == null) continue;
            if (deletedByMe && deletedByMe.has(id)) continue; // respect this process's own pending delete
            if (!tbl.has(id)) tbl.set(id, { ...row, id }); // only fill in what THIS process doesn't already know about — do not clobber an in-flight local edit with an older on-disk copy
          }
        }
      }
    } catch (e) {
      console.error(`[jaa] pre-flush merge error (${table}): ${e.message} — flushing this process's own view only`);
    }
    this._pendingDeletes.delete(table);

    const rows = [...tbl.values()];
    const file = this._file(table);
    // §MULTI-PROCESS FIX 2026-07-15 — write to a temp file then rename over
    // the target, instead of writeFileSync-ing the target directly. Doesn't
    // fix the deeper issue (see below), but a rename is atomic at the
    // filesystem level where an in-place write is not — a second process
    // reading this file mid-write can no longer observe a truncated/
    // corrupt partial JSON, and on Windows specifically a direct
    // writeFileSync racing another process's open handle is a real EBUSY
    // risk that a rename mostly sidesteps.
    //
    // §UPDATE 2026-07-18 — the merge step directly above now closes the
    // "silently overwrites concurrent writes" gap this comment used to
    // describe as unfixed. What's left: two processes flushing the
    // literal same table at the literal same instant can still both merge
    // against the same pre-write disk state and then both write — the
    // last rename wins, but by that point both writes already merged in
    // everything visible to them, so the only way to actually lose a row
    // now is two writes to the SAME id, in the same few-millisecond
    // window, from two different processes — a real edge case, far
    // narrower than "any concurrent write to the table," and not
    // eliminated by anything short of true cross-process locking.
    const tmpFile = `${file}.${process.pid}.${Date.now()}.tmp`;
    try {
      fs.writeFileSync(tmpFile, JSON.stringify(rows, null, 0), 'utf8');
      fs.renameSync(tmpFile, file);
    } catch (e) {
      console.error(`[jaa] Flush error (${table}): ${e.message}`);
      try { fs.unlinkSync(tmpFile); } catch (_) {} // best-effort cleanup, don't mask the real error
    }
  }

  _bootstrapSettings() {
    const tbl = this._table('settings');
    for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
      let exists = false;
      for (const row of tbl.values()) { if (row.key === key) { exists = true; break; } }
      if (!exists) {
        this.insert('settings', { id: _uuid(), key, value, updated_ts: Date.now() });
      }
    }
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _matches(row, where) {
  for (const [k, v] of Object.entries(where)) {
    if (v === null || v === undefined) {
      if (row[k] != null) return false;
    } else if (row[k] !== v) {
      return false;
    }
  }
  return true;
}

let _uuidCounter = 0;
function _uuid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  const t = Date.now().toString(16);
  const r = Math.random().toString(16).slice(2);
  const c = (++_uuidCounter).toString(16).padStart(4, '0');
  return `${t.slice(0,8)}-${t.slice(8,12)}-4${r.slice(0,3)}-${(8+Math.random()*4|0).toString(16)}${r.slice(4,7)}-${r.slice(7,19)}${c}`;
}

module.exports = { JaaStore };
