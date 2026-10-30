'use strict';
/**
 * Database.js — one encrypted database, backed by one FileStore + one
 * FileRefs, living at a single directory on disk. A "database" here is
 * just a directory: a user's private database, and a couple's shared
 * database, are both just Database instances pointed at different dirs
 * with different keys.
 */

const { FileStore } = require('../persistence/FileStore.js');
const { FileRefs } = require('../persistence/FileRefs.js');
const { Recovery } = require('../persistence/Recovery.js');
const { Table } = require('./Table.js');

class Database {
  /**
   * @param {string} dir - directory this database lives in
   * @param {Buffer} key - 32-byte data-encryption key (never the user's password directly)
   */
  constructor(dir, key) {
    this.dir = dir;
    this.key = key;
    this.store = new FileStore(dir);
    this.refs = new FileRefs(dir);
    this.recovery = new Recovery(dir);
    this.recovery.recover(this.store, this.refs); // replay any crashed-mid-write batch
    this._tables = new Map();
  }

  table(name) {
    if (!this._tables.has(name)) {
      this._tables.set(name, new Table(this.store, this.refs, name, this.key));
    }
    return this._tables.get(name);
  }

  /** Define multiple tables at once from a schema map: { tableName: [columns] } */
  defineSchema(schemaMap) {
    for (const [tableName, columns] of Object.entries(schemaMap)) {
      this.table(tableName).createTable(columns);
    }
    return this;
  }
}

module.exports = { Database };
