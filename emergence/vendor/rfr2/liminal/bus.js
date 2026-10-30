/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  LIMINAL BUS  ·  bus/index.js  ·  v1.0.0                              ║
 * ║  UUID: lim-bus-0000-0000-1000-0000-000000000001                       ║
 * ║                                                                        ║
 * ║  The isolated event fabric for the Liminal gap detection system.      ║
 * ║  No module calls another module. Every signal travels through here.   ║
 * ║                                                                        ║
 * ║  §B1  Zero cross-module imports. All coupling via channel strings.    ║
 * ║  §B2  All errors surface as LIM.ERROR events. Never throws to caller. ║
 * ║  §B3  All events are immutable once emitted.                          ║
 * ║  §B4  Wildcard subscriptions supported: 'lim.gap.*', 'lim.**'        ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */

'use strict';

export const BUS_VERSION = '1.0.0';
export const BUS_UUID    = 'lim-bus-0000-0000-1000-0000-000000000001';

// ── Channel Registry ──────────────────────────────────────────────────────────
// Every module reads and writes named channels.
// No module has a reference to any other module.

export const LIM = Object.freeze({

  // ── Ingest ────────────────────────────────────────────────────────────────
  // Anything entering the liminal system starts here.
  INGEST:               'lim.ingest',              // { text, author, ts, id, platform? }
  INGEST_TRANSLATED:    'lim.ingest.translated',   // { id, text, resonanceText, author, ts, surfaceType }

  // ── Per-module gap channels ───────────────────────────────────────────────
  // Each module owns exactly one emit channel.

  GAP_ASSUMPTION:       'lim.gap.assumption',      // WeakAssumptionModule
  GAP_SHADOW:           'lim.gap.shadow',          // ShadowFieldModule
  GAP_CONTRASTIVE:      'lim.gap.contrastive',     // ContrastiveModule
  GAP_NEGATIVE_SPACE:   'lim.gap.negative_space',  // NegativeSpaceModule
  GAP_STRUCTURAL:       'lim.gap.structural',      // StructuralAssumptionModule
  GAP_REVERSAL:         'lim.gap.reversal',        // ReversalModule
  GAP_FIELD:            'lim.gap.field',           // FieldModule (oscillation, edges, fractal)
  GAP_RELATIONAL:       'lim.gap.relational',      // RelationalModule (manipulation, abuse patterns)
  GAP_OSCILLATORY:      'lim.gap.oscillatory',     // OscillatoryModule (sigma-regime gaps)
  GAP_MUSIC:            'lim.gap.music',           // MusicModule (harmonic, lyric, rhythm)
  GAP_CODE:             'lim.gap.code',            // CodeModule (lang-specific, arch gaps)
  GAP_EXISTENTIAL:      'lim.gap.existential',     // ExistentialModule (identity, values, meaning)

  // ── Composite / aggregation ───────────────────────────────────────────────
  GAP_ANY:              'lim.gap.*',               // wildcard — kernel listens to all gaps

  GAP_COMPOSITE:        'lim.gap.composite',       // { gaps[], pressure, dominantType, entityId }
  GAP_FIELD_UPDATE:     'lim.gap.field.update',    // { entityId, field }
  SHADOW_FIELD:         'lim.gap.shadow.field',    // { text, signals[], score }

  // ── Kernel control ────────────────────────────────────────────────────────
  MODULE_READY:         'lim.module.ready',        // { moduleId, version }
  MODULE_ERROR:         'lim.module.error',        // { moduleId, error }
  SESSION_START:        'lim.session.start',       // { sessionId }
  SESSION_END:          'lim.session.end',         // { sessionId, summary }

  // ── Ledger ────────────────────────────────────────────────────────────────
  LEDGER_GAP_OPEN:      'lim.ledger.gap.open',     // { gapId, type, domain, score }
  LEDGER_GAP_CLOSED:    'lim.ledger.gap.closed',   // { gapId, resolution }
  LEDGER_BOTTLENECK:    'lim.ledger.bottleneck',   // { domain, count, totalScore }

  // ── System ────────────────────────────────────────────────────────────────
  ERROR:                'lim.error',               // { source, error, context }
  READY:                'lim.ready',               // { module }
});

// ── Module IDs ────────────────────────────────────────────────────────────────

export const MODULE = Object.freeze({
  ASSUMPTION:       'assumption',
  SHADOW:           'shadow',
  CONTRASTIVE:      'contrastive',
  NEGATIVE_SPACE:   'negative_space',
  STRUCTURAL:       'structural',
  REVERSAL:         'reversal',
  FIELD:            'field',
  RELATIONAL:       'relational',
  OSCILLATORY:      'oscillatory',
  MUSIC:            'music',
  CODE:             'code',
  EXISTENTIAL:      'existential',
});

// ── Bus Implementation ────────────────────────────────────────────────────────

export class LiminalBus {
  constructor({ debug = false, maxHistory = 2000 } = {}) {
    this._listeners   = new Map();   // channel → Set<fn>
    this._wildcards   = [];          // [{ pattern, channel, fn }]
    this._history     = [];
    this._maxHistory  = maxHistory;
    this._debug       = debug;
    this._seq         = 0;
    this._paused      = false;
    this._queue       = [];
  }

  /**
   * Subscribe to a channel.
   * Supports wildcards: 'lim.gap.*', 'lim.**', 'lim.gap.**.error'
   * Returns unsubscribe function.
   */
  on(channel, fn) {
    if (channel.includes('*')) {
      const pattern = _compilePattern(channel);
      this._wildcards.push({ pattern, channel, fn });
    } else {
      if (!this._listeners.has(channel)) this._listeners.set(channel, new Set());
      this._listeners.get(channel).add(fn);
    }
    return () => this.off(channel, fn);
  }

  off(channel, fn) {
    const set = this._listeners.get(channel);
    if (set) set.delete(fn);
    this._wildcards = this._wildcards.filter(w => !(w.channel === channel && w.fn === fn));
  }

  once(channel, fn) {
    const wrapper = (payload) => { this.off(channel, wrapper); fn(payload); };
    return this.on(channel, wrapper);
  }

  /**
   * Emit an event. All subscriber errors become LIM.ERROR events.
   * Frozen payload — modules cannot mutate each other's output.
   */
  emit(channel, payload = {}) {
    if (this._paused) {
      this._queue.push({ channel, payload });
      return;
    }

    const event = Object.freeze({
      id:      `${Date.now().toString(36)}-${(this._seq++).toString(36)}`,
      channel,
      payload: Object.freeze({ ...payload }),
      ts:      Date.now(),
    });

    this._history.push(event);
    if (this._history.length > this._maxHistory) this._history.shift();

    if (this._debug) console.log(`[liminal-bus] ${channel}`, payload);

    // Direct listeners
    const direct = this._listeners.get(channel);
    if (direct) {
      for (const fn of direct) _callSafe(this, fn, payload, channel);
    }

    // Wildcard listeners
    for (const { pattern, fn } of this._wildcards) {
      if (pattern.test(channel)) _callSafe(this, fn, payload, channel);
    }
  }

  /** Pause all event delivery into a queue */
  pause() { this._paused = true; }

  /** Resume and flush queue */
  resume() {
    this._paused = false;
    const q = this._queue.splice(0);
    for (const { channel, payload } of q) this.emit(channel, payload);
  }

  /** Wait for a channel (promise). Times out at timeoutMs. */
  wait(channel, timeoutMs = 5000) {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error(`[LiminalBus] wait timeout: ${channel}`)), timeoutMs);
      this.once(channel, (payload) => { clearTimeout(t); resolve(payload); });
    });
  }

  /**
   * history(prefix?, n?) — recent events.
   * prefix = 'lim.gap' → only gap events.
   */
  history(prefix = null, n = 100) {
    const all = prefix
      ? this._history.filter(e => e.channel.startsWith(prefix))
      : this._history;
    return all.slice(-n);
  }

  /** All gap events in history, sorted by score descending */
  topGaps(n = 10) {
    return this._history
      .filter(e => e.channel.startsWith('lim.gap.') && !e.channel.includes('composite') && !e.channel.includes('field') && !e.channel.includes('shadow.field'))
      .sort((a, b) => (b.payload.score ?? 0) - (a.payload.score ?? 0))
      .slice(0, n)
      .map(e => e.payload);
  }

  get listenerCount() {
    let count = 0;
    for (const s of this._listeners.values()) count += s.size;
    count += this._wildcards.length;
    return count;
  }
}

// ── Internals ─────────────────────────────────────────────────────────────────

function _callSafe(bus, fn, payload, channel) {
  try {
    fn(payload);
  } catch (err) {
    if (channel !== LIM.ERROR) {
      bus.emit(LIM.ERROR, { source: channel, error: err.message, stack: err.stack });
    }
  }
}

function _compilePattern(channel) {
  const escaped = channel
    .replace(/\./g, '\\.')
    .replace(/\*\*/g, '§ANY§')
    .replace(/\*/g, '[^.]+')
    .replace(/§ANY§/g, '.*');
  return new RegExp(`^${escaped}$`);
}

/** Factory */
export function createBus(opts = {}) {
  return new LiminalBus(opts);
}
