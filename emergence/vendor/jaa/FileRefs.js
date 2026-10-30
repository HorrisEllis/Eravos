'use strict';
/**
 * FileRefs.js — ported from Jaa/src/Persistence/FileRefs.php. Mutable
 * name -> hash pointers (git-refs style), atomic write, prefix listing,
 * empty-directory cleanup on delete. Same logic as the PHP source,
 * translated directly rather than redesigned.
 */

const fs = require('fs');
const path = require('path');

class FileRefs {
  constructor(basePath) {
    this.root = path.join(basePath, 'refs');
    fs.mkdirSync(this.root, { recursive: true });
  }

  set(name, hash) {
    const filePath = this._path(name);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const tmp = `${filePath}.tmp.${process.pid}`;
    fs.writeFileSync(tmp, hash);
    fs.renameSync(tmp, filePath);
  }

  get(name) {
    const filePath = this._path(name);
    if (!fs.existsSync(filePath)) return null;
    return fs.readFileSync(filePath, 'utf8').trim();
  }

  delete(name) {
    const filePath = this._path(name);
    if (!fs.existsSync(filePath)) return;
    fs.unlinkSync(filePath);
    this._cleanEmptyDirs(path.dirname(filePath));
  }

  /** @returns {string[]} sorted ref names matching prefix */
  list(prefix) {
    const searchDir = path.join(this.root, prefix);

    if (!fs.existsSync(searchDir)) {
      const parent = path.dirname(searchDir);
      if (!fs.existsSync(parent) || !fs.statSync(parent).isDirectory()) return [];
      const results = [];
      for (const f of this._walk(parent)) {
        const name = this._relativePath(f);
        if (name.startsWith(prefix)) results.push(name);
      }
      return results.sort();
    }

    if (fs.statSync(searchDir).isFile()) return [prefix];

    const results = [];
    for (const f of this._walk(searchDir)) results.push(this._relativePath(f));
    return results.sort();
  }

  _path(name) {
    return path.join(this.root, name);
  }

  _relativePath(fullPath) {
    return fullPath.slice(this.root.length + 1);
  }

  _walk(dir) {
    const results = [];
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return results;
    for (const entry of fs.readdirSync(dir)) {
      if (entry.includes('.tmp.')) continue;
      const full = path.join(dir, entry);
      if (fs.statSync(full).isDirectory()) {
        results.push(...this._walk(full));
      } else {
        results.push(full);
      }
    }
    return results;
  }

  _cleanEmptyDirs(dir) {
    while (dir !== this.root && dir.startsWith(this.root)) {
      let entries;
      try { entries = fs.readdirSync(dir); } catch { break; }
      if (entries.length === 0) {
        try { fs.rmdirSync(dir); } catch { /* race with another writer — fine, not our job to win that race */ }
        dir = path.dirname(dir);
      } else {
        break;
      }
    }
  }
}

module.exports = { FileRefs };
