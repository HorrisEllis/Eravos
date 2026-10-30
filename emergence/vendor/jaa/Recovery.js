'use strict';
/**
 * Recovery.js — ported from Jaa/src/Persistence/Recovery.php. Write-
 * ahead log: begin() records an intended batch before it's applied,
 * commit() clears it once fully applied, recover() replays anything
 * left un-applied after a crash. Same shape as the PHP source.
 */

const fs = require('fs');
const path = require('path');

class Recovery {
  constructor(basePath) {
    this.walDir = path.join(basePath, 'wal');
    this.pendingPath = path.join(this.walDir, 'pending.json');
  }

  check() {
    if (!fs.existsSync(this.pendingPath)) return { clean: true, pending: null };
    const raw = fs.readFileSync(this.pendingPath, 'utf8');
    return { clean: false, pending: JSON.parse(raw) };
  }

  begin(puts, refSets, refDeletes) {
    fs.mkdirSync(this.walDir, { recursive: true });
    const batch = {
      timestamp: Date.now(),
      puts: puts.map(p => ({ hash: p.hash, content: p.content, applied: false })),
      refSets: refSets.map(r => ({ name: r.name, hash: r.hash, applied: false })),
      refDeletes: refDeletes.map(name => ({ name, applied: false })),
    };
    fs.writeFileSync(this.pendingPath, JSON.stringify(batch, null, 2));
    return batch;
  }

  commit() {
    if (fs.existsSync(this.pendingPath)) fs.unlinkSync(this.pendingPath);
  }

  /** Recover from crash — replay unapplied operations. store/refs: FileStore/FileRefs (or Memory equivalents). */
  recover(store, refs) {
    const status = this.check();
    if (status.clean) return;

    const batch = status.pending;

    for (const put of batch.puts) {
      if (!put.applied && put.content !== undefined) {
        const content = typeof put.content === 'string' ? JSON.parse(put.content) : put.content;
        store.put(content);
      }
    }
    for (const refSet of batch.refSets) {
      if (!refSet.applied) refs.set(refSet.name, refSet.hash);
    }
    for (const refDel of batch.refDeletes) {
      if (!refDel.applied) refs.delete(refDel.name);
    }

    this.commit();
  }
}

module.exports = { Recovery };
