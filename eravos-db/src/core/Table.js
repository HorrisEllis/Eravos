'use strict';
/**
 * Table.js — a table abstraction built directly on the real FileStore +
 * FileRefs primitives (content-addressable blob store + mutable name->hash
 * pointers). No SQL layer — this is the honest, working equivalent of
 * `create_table_execute` / `insert_execute` etc. from Jaa.js's documented
 * API, minus the parts of that engine (Runner, Gates, Event) that don't
 * exist in the codebase yet.
 *
 * Every row is encrypted before it touches FileStore. FileRefs (the
 * mutable pointer layer) only ever holds ref-name -> hash strings, never
 * plaintext data — so even the "index" of what rows exist reveals row
 * *ids*, never content.
 *
 * Bonus you get for free from content-addressing: updating a row writes a
 * *new* hash and repoints the ref, but the old hash's blob is still sitting
 * in the store. That's genuine history, not a promise — see history(id).
 */

const crypto = require('crypto');
const { encrypt, decrypt } = require('../crypto/Cipher.js');

class Table {
  /**
   * @param {FileStore} store
   * @param {FileRefs} refs
   * @param {string} name - table name
   * @param {Buffer} key - 32-byte encryption key for this table's database
   */
  constructor(store, refs, name, key) {
    this.store = store;
    this.refs = refs;
    this.name = name;
    this.key = key;
  }

  /** Define (or redefine) the table's schema. Schema itself is encrypted too, for consistency. */
  createTable(columns) {
    const hash = this.store.put(encrypt(this.key, { columns, createdAt: new Date().toISOString() }));
    this.refs.set(`${this.name}:__schema`, hash);
    // Initialize an empty row-id index if one doesn't exist yet
    if (!this.refs.get(`${this.name}:__ids`)) {
      const idsHash = this.store.put(encrypt(this.key, []));
      this.refs.set(`${this.name}:__ids`, idsHash);
    }
    return this;
  }

  schema() {
    const hash = this.refs.get(`${this.name}:__schema`);
    if (!hash) return null;
    return decrypt(this.key, this.store.get(hash));
  }

  _getIds() {
    const hash = this.refs.get(`${this.name}:__ids`);
    if (!hash) return [];
    return decrypt(this.key, this.store.get(hash));
  }

  _setIds(ids) {
    const hash = this.store.put(encrypt(this.key, ids));
    this.refs.set(`${this.name}:__ids`, hash);
  }

  /** Insert a row. Returns the generated (or provided) id. */
  insert(row, { id } = {}) {
    const rowId = id || crypto.randomUUID();
    const record = { id: rowId, ...row, _insertedAt: new Date().toISOString() };
    const hash = this.store.put(encrypt(this.key, record));
    this.refs.set(`${this.name}:row:${rowId}`, hash);

    // append + append to history log
    const ids = this._getIds();
    if (!ids.includes(rowId)) {
      ids.push(rowId);
      this._setIds(ids);
    }
    this._appendHistory(rowId, hash);
    return rowId;
  }

  get(id) {
    const hash = this.refs.get(`${this.name}:row:${id}`);
    if (!hash) return null;
    return decrypt(this.key, this.store.get(hash));
  }

  /** Merge `patch` into the existing row. Old version remains recoverable via history(id). */
  update(id, patch) {
    const existing = this.get(id);
    if (!existing) throw new Error(`Table ${this.name}: no row with id ${id}`);
    const updated = { ...existing, ...patch, id, _updatedAt: new Date().toISOString() };
    const hash = this.store.put(encrypt(this.key, updated));
    this.refs.set(`${this.name}:row:${id}`, hash);
    this._appendHistory(id, hash);
    return updated;
  }

  delete(id) {
    this.refs.delete(`${this.name}:row:${id}`);
    const ids = this._getIds().filter((x) => x !== id);
    this._setIds(ids);
  }

  all() {
    return this._getIds().map((id) => this.get(id)).filter(Boolean);
  }

  find(predicate) {
    return this.all().filter(predicate);
  }

  findOne(predicate) {
    return this.all().find(predicate) || null;
  }

  _appendHistory(id, hash) {
    const refName = `${this.name}:history:${id}`;
    const existingHash = this.refs.get(refName);
    const log = existingHash ? decrypt(this.key, this.store.get(existingHash)) : [];
    log.push({ hash, at: new Date().toISOString() });
    const newLogHash = this.store.put(encrypt(this.key, log));
    this.refs.set(refName, newLogHash);
  }

  /** Full version history of a row, oldest first, each entry decrypted. */
  history(id) {
    const refName = `${this.name}:history:${id}`;
    const logHash = this.refs.get(refName);
    if (!logHash) return [];
    const log = decrypt(this.key, this.store.get(logHash));
    return log.map((entry) => ({
      at: entry.at,
      value: decrypt(this.key, this.store.get(entry.hash)),
    }));
  }
}

module.exports = { Table };
