'use strict';
/**
 * FilePersistence — JSON snapshot to disk. Zero dependencies (fs/path
 * only), per §5.5: no database import for something this small earns its
 * complexity yet (§0.5, §16.4) — a database becomes justified after this
 * actually repeats across projects, not before.
 *
 * §2.1/§2.2: state that matters must be stored, and the storage device is
 * the source of truth. On load, the file — not any in-memory assumption
 * — decides what the buffer contained.
 */

const fs = require('fs');
const path = require('path');

class FilePersistence {
  constructor(filePath) {
    this.filePath = path.resolve(filePath);
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
  }

  /** Snapshot { capacity, items (oldest-first), stats, savedAt } to disk. Atomic via temp-file rename. */
  save(core) {
    const snapshot = {
      capacity: core.capacity,
      items: core.toArray(),
      stats: core.stats(),
      savedAt: Date.now(),
    };
    const tmp = `${this.filePath}.tmp-${process.pid}-${Date.now()}`;
    fs.writeFileSync(tmp, JSON.stringify(snapshot, null, 2));
    fs.renameSync(tmp, this.filePath); // atomic on POSIX — no torn reads on crash mid-write
    return snapshot;
  }

  /** Returns { capacity, items } or null if no snapshot exists yet (fresh start, not an error). */
  load() {
    if (!fs.existsSync(this.filePath)) return null;
    const raw = fs.readFileSync(this.filePath, 'utf8');
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      // §1.2: a corrupt snapshot is a loud, specific failure — never a silent empty-buffer fallback.
      throw new Error(`[FilePersistence] snapshot at ${this.filePath} is corrupt JSON: ${e.message}`);
    }
    if (!Number.isInteger(parsed.capacity) || !Array.isArray(parsed.items)) {
      throw new Error(`[FilePersistence] snapshot at ${this.filePath} has wrong shape: expected {capacity:int, items:array}`);
    }
    return { capacity: parsed.capacity, items: parsed.items };
  }

  exists() {
    return fs.existsSync(this.filePath);
  }
}

module.exports = { FilePersistence };
