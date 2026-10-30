/* ══════════════════════════════════════════════════════════════════════════
   ERAVOS REGULATION  ·  eravos-regulation.js  ·  v0.17.0
   UUID: eravos-regulation-gate-0001-0000-000000000001
   HOOK: eravos.regulation:gate:00001
   PARENT: eravos-kernel   OWNER: shared/eravos-regulation.js   (§17.1)
   ══════════════════════════════════════════════════════════════════════════

   A check before entering a mode you cannot take back.

   ── WHY THIS IS PHASE I AND NOT A NICE EXTRA ────────────────────────────

   Four of the things ahead touch someone at their worst moment: unretractable
   messages, a live shared cursor, a model of how they change, and a record of
   what they need when upset. Each is good, and each has a failure mode that
   lands on whoever is least able to absorb it.

   So this comes first, and the risky ones sit behind it.

   ── ADVISES. NEVER BLOCKS. ──────────────────────────────────────────────

   If someone reads as activated or dysregulated it says so plainly, offers
   the door out, and then lets them through if they still want in.

   Blocking an adult from their own app because a slider said so is its own
   harm: it is paternalism at exactly the moment someone has least patience
   for it, and it teaches people to lie to the slider. Being told *"this might
   not be the moment"* is usually enough, and when it is not, the person is
   still the one who decides.

   ── LOCAL. NEVER SYNCED. NEVER ATTACHED TO ANYTHING. ────────────────────

   Two rules, and the second is the one people miss:

   1. Your partner is never told you rated yourself dysregulated. Same rule as
      the safety layer, same reason.

   2. It is NEVER USED TO EXPLAIN SOMEONE AWAY. It gates a mode. It never
      annotates a message with "he was at 8 when he sent this", and it never
      travels with a rupture or a chat line. A self-report that can be quoted
      back at you is not a self-report, it is ammunition — and the moment it
      could be, people stop answering honestly and the whole thing is worth
      nothing.

      Enforced structurally: readings are stored under one local key, keyed by
      time only, with no reference to any message, rupture or event id. A test
      asserts no method returns a reading joined to anything else.

   ── THE THREE READS ─────────────────────────────────────────────────────

     feeling      free text or a chosen word — routed through the choice
                  primitive, so "Other → in your words" is always there
     activation   0-10 · how much charge is in your body right now
     regulation   0-10 · how much access you have to yourself right now

   Activation and regulation are NOT opposites and are asked separately.
   Calm-and-unreachable is a real state, and so is lit-up-and-completely-here.
   Collapsing them into one number loses exactly the case that matters.
   ══════════════════════════════════════════════════════════════════════════ */

(function (global) {
  'use strict';

  var REG_VERSION = '0.17.0';
  var REG_UUID = 'eravos-regulation-gate-0001-0000-000000000001';
  var STORE_KEY = 'eravors_regulation';        // local only, never synced
  var PREF_KEY = 'eravors_regulation_prefs';
  var MAX_KEPT = 200;
  var STALE_MS = 45 * 60 * 1000;               // a read older than this is not "now"

  // Advice thresholds. Deliberately not thin — a 6 is a normal Tuesday.
  var HIGH_ACTIVATION = 8;
  var LOW_REGULATION = 3;

  function defaultStore() {
    if (global.DB && typeof global.DB.get === 'function') {
      return { get: function (k, d) { return global.DB.get(k, d); },
               set: function (k, v) { global.DB.set(k, v); } };
    }
    throw new Error('[regulation] no storage available — DB is not loaded. Refusing to operate blind.');
  }

  function Regulation(opts) {
    opts = opts || {};
    this.store = opts.store || defaultStore();
    this.now = opts.now || function () { return Date.now(); };
    // No bus. No send. Nothing here can reach a transport.
  }

  Regulation.VERSION = REG_VERSION;
  Regulation.UUID = REG_UUID;
  Regulation.STALE_MS = STALE_MS;
  Regulation.THRESHOLDS = { HIGH_ACTIVATION: HIGH_ACTIVATION, LOW_REGULATION: LOW_REGULATION };

  Regulation.prototype.prefs = function () {
    var p = this.store.get(PREF_KEY, null) || {};
    return {
      askBefore: p.askBefore !== false,     // ask before irreversible modes
      gatedModes: p.gatedModes || ['unretractable', 'sparring', 'desires', 'shared_typing'],
    };
  };
  Regulation.prototype.setPrefs = function (patch) {
    var cur = this.prefs();
    if ('askBefore' in patch) cur.askBefore = !!patch.askBefore;
    if (Array.isArray(patch.gatedModes)) cur.gatedModes = patch.gatedModes;
    this.store.set(PREF_KEY, cur);
    return cur;
  };

  Regulation.prototype._all = function () { return this.store.get(STORE_KEY, []) || []; };

  /**
   * Record a reading. Keyed by TIME ONLY — no message id, no rupture id, no
   * event reference of any kind. There is deliberately no parameter for one.
   */
  Regulation.prototype.record = function (reading) {
    reading = reading || {};
    var act = Number(reading.activation);
    var reg = Number(reading.regulation);
    if (!Number.isFinite(act) || act < 0 || act > 10) throw new Error('[regulation] activation must be 0-10');
    if (!Number.isFinite(reg) || reg < 0 || reg > 10) throw new Error('[regulation] regulation must be 0-10');
    var entry = {
      ts: this.now(),
      feeling: reading.feeling ? String(reading.feeling).slice(0, 120) : null,
      activation: act,
      regulation: reg,
      // what they were about to do. The MODE, never the content.
      mode: reading.mode ? String(reading.mode).slice(0, 40) : null,
      proceeded: null,
    };
    var all = this._all();
    all.push(entry);
    if (all.length > MAX_KEPT) all = all.slice(-MAX_KEPT);
    this.store.set(STORE_KEY, all);
    return { ok: true, ts: entry.ts, advice: this.advise(entry) };
  };

  /** Their most recent reading, or null if there is none fresh enough. */
  Regulation.prototype.current = function () {
    var all = this._all();
    var last = all[all.length - 1];
    if (!last) return null;
    if (this.now() - last.ts > STALE_MS) return null;   // an hour ago is not now
    return last;
  };

  /**
   * The advice. Says its piece, offers the door, and NEVER decides.
   * `allowed` is always true — this is stated in the return so nobody
   * downstream mistakes it for a permission check.
   */
  Regulation.prototype.advise = function (reading) {
    reading = reading || this.current();
    if (!reading) {
      return { allowed: true, advise: false, reason: null,
               note: 'No recent reading. Nothing is being assumed about how you are.' };
    }
    var hot = reading.activation >= HIGH_ACTIVATION;
    var low = reading.regulation <= LOW_REGULATION;
    if (!hot && !low) {
      return { allowed: true, advise: false, reason: null };
    }
    var reason = hot && low
      ? 'You are at ' + reading.activation + ' for activation and ' + reading.regulation + ' for regulation.'
      : hot ? 'You are at ' + reading.activation + ' for activation.'
            : 'You are at ' + reading.regulation + ' for regulation.';
    return {
      allowed: true,             // ALWAYS. This advises; it does not gate.
      advise: true,
      reason: reason,
      // Describes, then hands it back. Same discipline as the safety layer.
      says: reason + ' This might not be the moment for something you cannot take back.',
      question: 'Do you want to come back to it, or go ahead anyway?',
      options: ['come back to it', 'go ahead anyway'],
      note: 'Either answer is fine and neither is recorded as a judgment. You decide.',
    };
  };

  /** Record what they chose, so the advice can be measured against reality. */
  Regulation.prototype.proceeded = function (didProceed) {
    var all = this._all();
    if (!all.length) return { ok: false, reason: 'no reading to attach to' };
    all[all.length - 1].proceeded = !!didProceed;
    this.store.set(STORE_KEY, all);
    return { ok: true };
  };

  /** Does this mode want a check right now? */
  Regulation.prototype.shouldAsk = function (mode) {
    var p = this.prefs();
    if (!p.askBefore) return false;
    if (p.gatedModes.indexOf(mode) === -1) return false;
    return this.current() === null;      // fresh reading = no re-asking
  };

  /**
   * §9.4 export — and note what it deliberately CANNOT return: a reading
   * joined to a message, a rupture, or anything someone said.
   */
  Regulation.prototype.export = function () {
    return {
      version: REG_VERSION, exportedAt: new Date().toISOString(),
      readings: this._all(),
      note: 'Times, numbers and the mode you were entering. No reading is linked to ' +
            'anything you wrote — that link does not exist in the data.',
    };
  };

  /** §12.6 diagnostics. Trends only, never a verdict. */
  Regulation.prototype.health = function () {
    var all = this._all();
    // this.now(), not Date.now(). An injectable clock bypassed in ONE place
    // makes the tested behaviour differ from the real behaviour, silently —
    // caught by a test that measured 0 where the engine reported 1 (§1.2).
    var nowMs = this.now();
    var recent = all.filter(function (r) { return nowMs - r.ts < 30 * 86400000; });
    var advised = recent.filter(function (r) {
      return r.activation >= HIGH_ACTIVATION || r.regulation <= LOW_REGULATION;
    });
    var mean = function (xs) { return xs.length ? +(xs.reduce(function (a, b) { return a + b; }, 0) / xs.length).toFixed(1) : null; };
    return {
      version: REG_VERSION,
      readings: all.length,
      last30d: recent.length,
      meanActivation: mean(recent.map(function (r) { return r.activation; })),
      meanRegulation: mean(recent.map(function (r) { return r.regulation; })),
      timesAdvised: advised.length,
      // The number worth watching: advice that is always ignored is advice
      // pitched wrong, not a person being stubborn (§12.5).
      wentAheadAnyway: advised.filter(function (r) { return r.proceeded === true; }).length,
      // Structural facts, each asserted by a test.
      synced: 0,
      hasTransport: false,
      blocksAnything: false,
      linkedToContent: false,
      status: all.length === 0 ? 'never asked' : 'ok',
    };
  };

  global.Regulation = Regulation;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { Regulation: Regulation, STORE_KEY: STORE_KEY, PREF_KEY: PREF_KEY,
                       STALE_MS: STALE_MS, THRESHOLDS: Regulation.THRESHOLDS };
  }
})(typeof window !== 'undefined' ? window : globalThis);
