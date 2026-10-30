/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  ALK BUS ADAPTER  ·  alk-bus.js  ·  v0.4.0                              ║
 * ║  UUID: alk-lattice-bus-0001-0000-000000000001                           ║
 * ║  HOOK: eravos.alk:bus-adapter:00001                                     ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * §5.10 — interaction through contracts only. §5.14 — every layer is
 * replaceable. This is the one seam between ERAVOS's kernel and the ALK
 * modules, declared explicitly rather than left as an implicit shape match.
 *
 * THE MISMATCH, STATED:
 *   ERAVOS Stream : emit(SEvent) routes to ONE gate by signature;
 *                   onEmit(fn) observes ALL events. No per-type pub/sub.
 *   ALK modules   : bus.on(channel, handler) — MANY subscribers per channel;
 *                   bus.emit(channel, payload).
 *
 * Registering a Gate per ALK channel would collide the moment two modules
 * want the same channel — and htl.js has six modules listening on
 * `alk.verbal.transcript` alone. ERAVOS's own Stream.register() throws on
 * collision by design (SISO Design Law 1). So the adapter provides real
 * per-channel fan-out and bridges both directions:
 *
 *   ERAVOS event  --(mapped)-->  ALK channel
 *   ALK emission  --(mirrored)-> appStream, so the kernel log sees everything
 *                                (§2.3 — all state must be observable)
 *
 * §1.2 — a subscriber that throws is caught, named, and reported. Something
 * watching must never break something running, but it must never fail
 * silently either.
 */

'use strict';

export const ALK_BUS_VERSION = '0.4.0';
export const ALK_BUS_UUID    = 'alk-lattice-bus-0001-0000-000000000001';

/** ERAVOS event type -> ALK channel. §13.2: every edge named. */
export const CHANNEL_MAP = Object.freeze({
  'call:transcript_line': 'alk.verbal.transcript',
  'lattice:utterance':    'alk.verbal.transcript',
  'rupture:logged':       'alk.behavior.escalation',
  'spar:turn':            'alk.verbal.transcript',
});

export class AlkBus {
  static UUID    = ALK_BUS_UUID;
  static VERSION = ALK_BUS_VERSION;

  /**
   * @param {object} opts
   * @param {object} [opts.appStream] ERAVOS Stream. Omit for headless/test use.
   * @param {function} [opts.onError] (channel, err) -> void. §1.2.
   */
  constructor({ appStream = null, onError = null } = {}) {
    this._handlers = new Map();   // channel -> [fn]
    this._appStream = appStream;
    this._onError = onError;
    this._stats = { emitted: 0, delivered: 0, errors: 0, byChannel: new Map() };
    this._faults = [];            // §13.3 — named, kept, queryable

    if (appStream && typeof appStream.onEmit === 'function') {
      appStream.onEmit(ev => {
        const channel = CHANNEL_MAP[ev.type];
        if (channel) this.emit(channel, ev.data);
      });
    }
  }

  on(channel, handler) {
    if (typeof channel !== 'string' || !channel) {
      throw new Error('[alk-bus] on(): channel must be a non-empty string');
    }
    if (typeof handler !== 'function') {
      throw new Error(`[alk-bus] on('${channel}'): handler must be a function`);
    }
    if (!this._handlers.has(channel)) this._handlers.set(channel, []);
    this._handlers.get(channel).push(handler);
    return () => {
      const arr = this._handlers.get(channel) || [];
      const i = arr.indexOf(handler);
      if (i >= 0) arr.splice(i, 1);
    };
  }

  emit(channel, payload) {
    this._stats.emitted++;
    this._stats.byChannel.set(channel, (this._stats.byChannel.get(channel) ?? 0) + 1);

    for (const fn of (this._handlers.get(channel) || [])) {
      try {
        fn({ payload });
        this._stats.delivered++;
      } catch (err) {
        // §1.2 — loud, specific, traceable. Module, operation, input, cause.
        this._stats.errors++;
        const fault = {
          class: 'ALK_SUBSCRIBER_THREW',
          channel,
          handler: fn.name || '(anonymous)',
          message: err && err.message,
          ts: Date.now(),
        };
        this._faults.push(fault);
        if (this._onError) this._onError(channel, err, fault);
        else if (typeof console !== 'undefined') {
          console.error(`[alk-bus] subscriber threw on '${channel}' (${fault.handler}): ${fault.message}`);
        }
      }
    }

    // Mirror ALK emissions back to the kernel log so nothing the ALK layer
    // does is invisible to ERAVOS. §2.3.
    if (this._appStream && channel.startsWith('alk.') && this._appStream.listeners) {
      try {
        this._appStream.listeners.forEach(l => l({ type: channel, data: payload, ts: Date.now() }, true));
      } catch (_) { /* mirroring must never break the run */ }
    }
  }

  /** §12.6 — every component has a diagnostic engine, queryable live. */
  health() {
    return {
      version: ALK_BUS_VERSION,
      channels: [...this._handlers.keys()].sort(),
      subscribers: [...this._handlers.entries()].reduce((n, [, a]) => n + a.length, 0),
      emitted: this._stats.emitted,
      delivered: this._stats.delivered,
      errors: this._stats.errors,
      byChannel: Object.fromEntries(this._stats.byChannel),
      recentFaults: this._faults.slice(-10),
      status: this._stats.errors === 0 ? 'healthy'
            : this._stats.errors < 5   ? 'degraded'
            : 'failing',
    };
  }
}

/**
 * ── FrictionAnalyzer ────────────────────────────────────────────────────────
 * PORT of NEXUS-CODEC v1.9.0 `codec.js` lines 136-190 (FRICTION lexicon) and
 * 291-358 (the class). Mechanical translation, no logic changed.
 *
 * WHY IT IS HERE AND NOT LEFT BEHIND — measured, not assumed:
 *   latent-model.js OBS_MODELS maps
 *     'speech.positive'/'speech.negative' -> { VALENCE } only
 *     'speech.friction'                   -> { AROUSAL +0.3, SUPPRESSION +0.3 }
 *   Sentiment alone never touches AROUSAL. With arousal pinned at 0,
 *   NervousSystemModule._computeState() scores 0.9 against a 0.6 threshold and
 *   reports DORSAL forever, which forces intent = SEEKING_SPACE on every line.
 *   Wiring this one class flips "I miss you, I feel so alone" from
 *   SEEKING_SPACE/withdrawal to SEEKING_UNDERSTANDING/direct-expression.
 *   That is the whole reason it is taken. §16.1 — the nearest gap.
 */

const FRICTION = Object.freeze({
  disfluency: new Set([
    'uh', 'uhh', 'uhhh', 'um', 'umm', 'ummm', 'er', 'err', 'ah', 'ahh',
    'hm', 'hmm', 'hmmm', 'uh-huh', 'mm', 'mmm',
  ]),
  filler:        [/\byou know\b/, /\bi mean\b/, /\bkind of\b/, /\bsort of\b/, /\bbasically\b/],
  memoryGap:     [/\bi can'?t remember\b/, /\bwhat was it\b/, /\bi forget\b/, /\bblanking\b/],
  cognitiveLoad: [/\bwait\b/, /\bhold on\b/, /\blet me think\b/, /\bgive me a second\b/],
  tension:       [/\bi don'?t know\b/, /\bi'?m not sure\b/, /\bit'?s hard to say\b/, /\bi guess\b/],
  denial:        [/\bit'?s not that\b/, /\bi'?m not saying\b/, /\bthat'?s not\b/, /\bi never said\b/],
});

const HEURISTIC_PROMOTE = 3; // codec.js: pattern fires N times -> heuristic

export class FrictionAnalyzer {
  constructor() {
    this._sessionTotal  = 0;
    this._patternCounts = new Map();
  }

  /** @returns {{friction:boolean, markers:Array, types:string[], score:number, density:number, promoted:Array}|null} */
  analyze(text) {
    if (!text) return null;
    const lower = String(text).toLowerCase();
    const words = lower.split(/\s+/).filter(Boolean);
    const found = [];

    for (const w of words) {
      if (FRICTION.disfluency.has(w)) found.push({ type: 'disfluency', marker: w });
    }
    for (const cat of ['filler', 'memoryGap', 'cognitiveLoad', 'tension', 'denial']) {
      for (const re of FRICTION[cat]) {
        if (re.test(lower)) {
          found.push({ type: cat, marker: lower.match(re)?.[0] ?? cat });
          this._patternCounts.set(cat, (this._patternCounts.get(cat) ?? 0) + 1);
        }
      }
    }

    const density = words.length > 0 ? found.length / words.length : 0;
    if (found.length > 0) this._sessionTotal++;

    return {
      friction: found.length > 0,
      markers:  found,
      types:    [...new Set(found.map(f => f.type))],
      score:    Math.min(1, found.length / 3),
      density:  Math.round(density * 1000) / 1000,
      promoted: [...this._patternCounts.entries()]
        .filter(([, n]) => n === HEURISTIC_PROMOTE)
        .map(([pattern, count]) => ({ pattern, count })),
    };
  }

  reset() { this._sessionTotal = 0; this._patternCounts.clear(); }
}
