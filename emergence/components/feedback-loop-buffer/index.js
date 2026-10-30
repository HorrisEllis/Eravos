'use strict';
/**
 * ring-buffer — top-level facade. §3.4 raw execution before interfaces:
 * this is the "library" layer, callable directly with zero API/CLI
 * involved, which is what makes the API and CLI thin wrappers instead of
 * where the logic actually lives.
 */

const path = require('path');
const { RingBufferCore } = require('./core/RingBufferCore');
const { createRingStream } = require('./core/wire');
const { FilePersistence } = require('./persist/FilePersistence');
const { EvictionLedger } = require('./persist/EvictionLedger');
const { computeHealth } = require('./diagnostics/health');

class RingBuffer {
  /**
   * @param {object} opts
   * @param {number} opts.capacity - required if no snapshot exists yet
   * @param {string} [opts.dataDir] - defaults to ./data relative to cwd
   * @param {number} [opts.sizeBudgetBytes] - soft-axiom per-item byte budget
   * @param {number} [opts.autosaveEvery] - snapshot to disk every N pushes (default 10; 0 disables)
   */
  constructor(opts = {}) {
    const dataDir = opts.dataDir || path.join(process.cwd(), 'data');
    this.persistence = new FilePersistence(path.join(dataDir, 'ring-snapshot.json'));
    this.evictionLedger = new EvictionLedger(path.join(dataDir, 'evictions.ndjson'));
    this.autosaveEvery = opts.autosaveEvery ?? 10;
    this._pushesSinceSave = 0;

    const existing = this.persistence.load();
    const capacity = existing ? existing.capacity : opts.capacity;
    if (!Number.isInteger(capacity) || capacity < 1) {
      throw new Error('[RingBuffer] capacity must be provided (no existing snapshot found)');
    }
    if (existing && opts.capacity && opts.capacity !== existing.capacity) {
      throw new Error(
        `[RingBuffer] requested capacity ${opts.capacity} conflicts with persisted capacity ${existing.capacity}. ` +
        `Capacity cannot change on an existing buffer without an explicit migration.`
      );
    }

    const initialCore = existing
      ? RingBufferCore.fromSnapshot(existing.capacity, existing.items)
      : capacity;
    const { core, flow, log, push } = createRingStream(initialCore, { sizeBudgetBytes: opts.sizeBudgetBytes });
    this.core = core;
    this.flow = flow;
    this.log = log;
    this._push = push;

    this.evictionLedger.attach(this.flow);
  }

  push(value) {
    const result = this._push(value);
    this._pushesSinceSave++;
    if (this.autosaveEvery > 0 && this._pushesSinceSave >= this.autosaveEvery) {
      this.save();
    }
    return result;
  }

  tail(n) { return this.core.tail(n); }
  toArray() { return this.core.toArray(); }
  size() { return this.core.size(); }
  isFull() { return this.core.isFull(); }
  isEmpty() { return this.core.isEmpty(); }

  save() {
    const snap = this.persistence.save(this.core);
    this._pushesSinceSave = 0;
    return snap;
  }

  health() {
    return computeHealth({ core: this.core, flow: this.flow, evictionLedger: this.evictionLedger });
  }

  evictions(n) { return this.evictionLedger.tail(n); }
}

module.exports = { RingBuffer, RingBufferCore, createRingStream };
