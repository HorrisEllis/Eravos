'use strict';
/**
 * RingBufferCore — the actual circular buffer. Pure data structure.
 * No I/O, no WARP, no globals. Testable with zero other modules involved,
 * same discipline WARP's own Gate.js follows for the same reason: a
 * component that can only be tested through everything above it hasn't
 * actually been tested in isolation.
 *
 * §0.5 (complexity must earn its existence): this is the entire feature.
 * Fixed capacity, overwrite-oldest-on-full, O(1) push, O(n) read of a
 * window. No generic "eviction policy" plugin system — that's a second
 * ring buffer's problem, not this one's, until it's actually needed.
 */

class RingBufferCore {
  constructor(capacity) {
    if (!Number.isInteger(capacity) || capacity < 1) {
      throw new Error(`[RingBufferCore] capacity must be a positive integer, got ${JSON.stringify(capacity)}`);
    }
    this.capacity = capacity;
    this._buf = new Array(capacity);
    this._size = 0;   // how many live slots (grows to capacity, then stays)
    this._head = 0;   // index of the OLDEST live item
    this._tail = 0;   // index where the NEXT item will be written
    this._totalPushed = 0;
    this._totalEvicted = 0;
  }

  /**
   * push(item) -> { evicted: item|null, index: number }
   * item may be anything except undefined (undefined is indistinguishable
   * from "empty slot" — that ambiguity is exactly the kind of silent
   * failure §1.2 rules out, so it's rejected at this layer, not just by
   * an upstream axiom, so the invariant holds even if this class is used
   * directly without WARP wired in front of it).
   */
  push(item) {
    if (item === undefined) {
      throw new Error('[RingBufferCore] cannot push undefined — indistinguishable from an empty slot');
    }
    const writeIndex = this._tail;
    let evicted = null;
    const wasFull = this._size === this.capacity;

    if (wasFull) {
      evicted = this._buf[this._head];
      this._head = (this._head + 1) % this.capacity;
      this._totalEvicted++;
    } else {
      this._size++;
    }

    this._buf[writeIndex] = item;
    this._tail = (this._tail + 1) % this.capacity;
    this._totalPushed++;

    return { evicted, index: writeIndex, wasFull };
  }

  /** Oldest-first snapshot of everything currently live. */
  toArray() {
    const out = new Array(this._size);
    for (let i = 0; i < this._size; i++) {
      out[i] = this._buf[(this._head + i) % this.capacity];
    }
    return out;
  }

  /** Last n items, oldest-first within that window. n defaults to entire buffer. */
  tail(n = this._size) {
    const arr = this.toArray();
    if (n >= arr.length) return arr;
    return arr.slice(arr.length - n);
  }

  size() { return this._size; }
  isFull() { return this._size === this.capacity; }
  isEmpty() { return this._size === 0; }

  stats() {
    return {
      capacity: this.capacity,
      size: this._size,
      utilization: +(this._size / this.capacity).toFixed(4),
      totalPushed: this._totalPushed,
      totalEvicted: this._totalEvicted,
    };
  }

  /**
   * Restore state from a persisted snapshot (see persist/FilePersistence.js).
   * Rebuilds head/tail/size from a plain oldest-first array + capacity,
   * rather than trusting a serialized head/tail/size directly — the array
   * is the source of truth (§2.2), the pointers are derived from it.
   */
  static fromSnapshot(capacity, items) {
    const rb = new RingBufferCore(capacity);
    for (const item of items) rb.push(item);
    return rb;
  }
}

module.exports = { RingBufferCore };
