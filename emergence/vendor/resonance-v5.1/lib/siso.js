/**
 * siso.js — SISO Core, browser bundle
 * @author  Jonathan Bailey
 * @version 1.0.0 (ALK browser port)
 *
 * Stream → Event → Gate → StreamLog
 * The entire event infrastructure in one file, no dependencies.
 * →E→E→
 */

'use strict';

// ── Event ─────────────────────────────────────────────────────────────────────
export class Event {
  constructor(type, data = {}) {
    this.type = type;
    this.data = data;
  }
}

// ── Gate ──────────────────────────────────────────────────────────────────────
export class Gate {
  constructor(signature) {
    this.signature = signature;
  }
  transform(event, stream) {}
}

// ── StreamLog ─────────────────────────────────────────────────────────────────
const LOG_LEVELS = { OFF: 0, EVENTS: 1, DEEP: 2, DATA: 3 };
let _streamIdCounter = 0;

export class StreamLog {
  constructor(level = 'EVENTS') {
    this.level = level;
    this.entries = [];
    this.seq = 0;
  }

  record({ streamId, parentStreamId, eventType, gateClaimed, eventData }) {
    const lvl = LOG_LEVELS[this.level] || 0;
    if (lvl === 0) return;
    const entry = { seq: this.seq++, time: Date.now(), type: eventType, claimed: gateClaimed };
    if (lvl >= 2) {
      entry.streamId = streamId;
      if (parentStreamId != null) entry.parentStreamId = parentStreamId;
    }
    if (lvl >= 3) entry.data = eventData;
    this.entries.push(entry);
  }

  nextStreamId() { return ++_streamIdCounter; }

  sample() { return { level: this.level, count: this.entries.length, entries: [...this.entries] }; }

  tail(n = 50) { return this.entries.slice(-n); }

  clear() { this.entries = []; this.seq = 0; }
}

// ── Stream ────────────────────────────────────────────────────────────────────
export class Stream {
  constructor({ log = null, parentStreamId = null } = {}) {
    this.gates = new Map();
    this.pending = [];
    this.eventCount = 0;
    this.log = log;
    this.streamId = log ? log.nextStreamId() : null;
    this.parentStreamId = parentStreamId;
  }

  register(gate) {
    if (this.gates.has(gate.signature)) {
      throw new Error(`[SISO] Signature collision: '${gate.signature}'`);
    }
    this.gates.set(gate.signature, gate);
    return this;
  }

  emit(event) {
    this.eventCount++;
    const gate = this.gates.get(event.type);
    if (this.log) {
      this.log.record({
        streamId: this.streamId,
        parentStreamId: this.parentStreamId,
        eventType: event.type,
        gateClaimed: gate ? gate.signature : null,
        eventData: event.data,
      });
    }
    if (gate) gate.transform(event, this);
    else this.pending.push(event);
    return this;
  }

  // Wildcard subscriptions: gates that claim any event matching a prefix
  // Used for ALK bus compatibility — alk.video.* style patterns
  registerWild(pattern, handler) {
    const key = `__wild__${pattern}`;
    if (this.gates.has(key)) throw new Error(`[SISO] Wild collision: '${pattern}'`);
    const g = new Gate(key);
    g._pattern = pattern;
    g._handler = handler;
    g._isWild = true;
    this.gates.set(key, g);
    return this;
  }

  sampleHere() {
    return { pending: [...this.pending], eventCount: this.eventCount, gateCount: this.gates.size };
  }
}

// ── SISOBus — ALK-compatible event bus on top of SISO Stream ─────────────────
// Wraps Stream to provide the .on(pattern, cb) / .emit(event, data) API
// that all existing ALK modules expect, while routing through SISO gates
// and recording everything in StreamLog.

export class SISOBus {
  constructor({ log = null } = {}) {
    this._log     = log ?? new StreamLog('DATA');
    this._stream  = new Stream({ log: this._log });
    this._subs    = new Map(); // pattern → [{ id, cb, test }]
    this._seq     = 0;
    this._stats   = { emitted: 0, claimed: 0, pending: 0 };

    // One wildcard gate that routes all events to subscribers
    const self = this;
    const routerGate = new Gate('__router__');
    routerGate.transform = (event, stream) => {
      self._route(event.type, event.data);
    };
    // Override: capture all events by wrapping emit
    this._routeAll = true;
  }

  /**
   * Subscribe to an event pattern. Supports wildcards: 'alk.video.*', '**'
   * @param {string} pattern
   * @param {Function} cb — called with (payload)
   * @returns {Function} unsubscribe
   */
  on(pattern, cb) {
    const id   = ++this._seq;
    const test = compilePattern(pattern);
    if (!this._subs.has(pattern)) this._subs.set(pattern, []);
    this._subs.get(pattern).push({ id, cb, test });
    return () => {
      const arr = this._subs.get(pattern) ?? [];
      const i = arr.findIndex(s => s.id === id);
      if (i >= 0) arr.splice(i, 1);
    };
  }

  /**
   * Emit an event. Records to StreamLog. Routes to all matching subscribers.
   * @param {string} type
   * @param {object} data
   */
  emit(type, data = {}) {
    this._stats.emitted++;
    // Record in SISO StreamLog
    const claimed = this._countSubscribers(type) > 0;
    this._log.record({
      streamId: this._stream.streamId,
      parentStreamId: null,
      eventType: type,
      gateClaimed: claimed ? type : null,
      eventData: data,
    });
    if (claimed) this._stats.claimed++;
    else         this._stats.pending++;
    // Route synchronously
    this._route(type, data);
    return this;
  }

  _route(type, payload) {
    for (const [, subs] of this._subs) {
      for (const s of subs) {
        try { if (s.test(type)) s.cb(payload); } catch (_) {}
      }
    }
  }

  _countSubscribers(type) {
    let n = 0;
    for (const [, subs] of this._subs) {
      for (const s of subs) if (s.test(type)) n++;
    }
    return n;
  }

  /** Get StreamLog for inspection */
  get log() { return this._log; }

  /** Bus stats */
  get stats() { return { ...this._stats, subscribers: this._subs.size }; }

  /** Sample log tail for debug UI */
  tail(n = 100) { return this._log.tail(n); }

  /** Change log level at runtime */
  setLogLevel(level) { this._log.level = level; }
}

// ── Pattern compiler (same as ALK kernel) ─────────────────────────────────────
function compilePattern(p) {
  if (p === '**') return () => true;
  const parts = p.split('.');
  function match(parts, segs, pi, si) {
    while (pi < parts.length && si < segs.length) {
      if (parts[pi] === '**') {
        for (let k = si; k <= segs.length; k++) if (match(parts, segs, pi+1, k)) return true;
        return false;
      } else if (parts[pi] === '*' || parts[pi] === segs[si]) { pi++; si++; }
      else return false;
    }
    while (pi < parts.length && parts[pi] === '**') pi++;
    return pi === parts.length && si === segs.length;
  }
  return t => match(parts, t.split('.'), 0, 0);
}

export { compilePattern };
