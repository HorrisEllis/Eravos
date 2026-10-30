'use strict';
/**
 * FileStore.js — ported from Jaa/src/Persistence/FileStore.php. Same
 * scheme exactly: SHA-256(canonical(content)) is the address, content
 * lives at store/<hash[0:2]>/<hash[2:]>, atomic write via temp-file +
 * rename (matching FilePersistence.js's own pattern elsewhere in this
 * project, and Jaa's real crash-safety guarantee — a torn write is
 * never observable).
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { canonicalize } = require('./canonicalize.js');

class FileStore {
  constructor(basePath) {
    this.root = path.join(basePath, 'store');
    fs.mkdirSync(this.root, { recursive: true });
  }

  put(content) {
    const canonical = canonicalize(content);
    const hash = crypto.createHash('sha256').update(canonical).digest('hex');
    const filePath = this._path(hash);

    if (fs.existsSync(filePath)) return hash; // dedup — content-addressed, so this is definitionally the same content

    fs.mkdirSync(path.dirname(filePath), { recursive: true });

    const tmp = `${filePath}.tmp.${process.pid}`;
    fs.writeFileSync(tmp, canonical);
    fs.renameSync(tmp, filePath);

    return hash;
  }

  get(hash) {
    const filePath = this._path(hash);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Object not found: ${hash}`);
    }
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  }

  has(hash) {
    return fs.existsSync(this._path(hash));
  }

  _path(hash) {
    return path.join(this.root, hash.slice(0, 2), hash.slice(2));
  }
}

module.exports = { FileStore };
