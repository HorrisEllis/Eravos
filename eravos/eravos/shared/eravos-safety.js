/* ══════════════════════════════════════════════════════════════════════════
   ERAVOS SAFETY  ·  eravos-safety.js  ·  v0.16.0
   UUID: eravos-safety-patterns-0001-0000-000000000001
   HOOK: eravos.safety:patterns:00001
   PARENT: eravos-kernel   OWNER: shared/eravos-safety.js   (§17.1)
   ══════════════════════════════════════════════════════════════════════════

   Surfacing patterns a person might not have named yet, and putting help
   within reach — without ever telling anyone what their relationship is.

   ── THE FOUR RULES THIS CANNOT BREAK ────────────────────────────────────

   1. NEVER SYNCED. Not one byte of this crosses the relay. Not the patterns,
      not the counts, not that it ran. If a partner could learn the app had
      flagged something, the person it flagged is in more danger than before
      — and that is not a hypothetical, it is the single most common way
      safety features get people hurt.

      Enforced structurally: this module holds no `send`, no bus, no
      `emitSync`. It is not wired to a transport at all, and a test asserts
      no method on it can reach one.

   2. NEVER DIAGNOSES. It does not say "you are being abused" and it does not
      say "you are abusive". Both are claims this software is not entitled to
      make, and both land wrong often enough to do harm. It describes what it
      counted, in plain words, and lets the person decide what it means.
      §1.1 — signal, not diagnosis, and here that is not a slogan.

   3. RESOURCES ARE ALWAYS AVAILABLE, NEVER TRIGGERED AT SOMEONE. `resources()`
      can be opened from Settings at any time by anyone. A pattern notice
      offers them; it does not announce them at you.

   4. DISMISSING IS PERMANENT AND SILENT. One dismissal per pattern, forever.
      No re-asking, no escalation, no "are you sure". Someone who has decided
      they do not want to look at this has made a decision, and pressing them
      is its own harm.

   ── WHAT IT ACTUALLY LOOKS AT ───────────────────────────────────────────

   Only things already recorded, and only counts over time:
     - ruptures logged with no repair attempt, repeatedly
     - the same subject returning in hardtalk with "I could not say it"
     - desires withdrawn shortly after being matched
     - a long run of one-sided goal proposals never taken up

   It does not read message content for "abusive language". A classifier over
   private messages between two people is surveillance with a kind face, and
   the false-positive cost lands on the person least able to absorb it.

   ── THE NUMBERS ARE HIGH ON PURPOSE (§0.1) ──────────────────────────────

   Thresholds are set so a bad week does not trip anything. A false positive
   here is not a minor annoyance — telling someone their relationship looks
   dangerous when it does not is a real harm, and it also burns the credibility
   of the one time it matters.
   ══════════════════════════════════════════════════════════════════════════ */

(function (global) {
  'use strict';

  var SAFETY_VERSION = '0.16.0';
  var SAFETY_UUID = 'eravos-safety-patterns-0001-0000-000000000001';
  var DISMISS_KEY = 'eravors_safety_dismissed';   // local only, never synced
  var ENABLED_KEY = 'eravors_safety_enabled';

  /**
   * Patterns are DESCRIPTIONS, not labels. Each says what was counted and
   * what it might mean, in the person's own frame, and never names a
   * diagnosis. `question` is the point of each one — it hands the judgment
   * back rather than making it.
   */
  var PATTERNS = [
    {
      id: 'ruptures_without_repair',
      minCount: 6,
      windowDays: 60,
      says: 'You have logged {n} ruptures in the last two months, and none of them ' +
            'have a repair recorded.',
      question: 'Is repair happening and just not getting written down — or is it not happening?',
    },
    {
      id: 'could_not_say_it',
      minCount: 4,
      windowDays: 90,
      says: 'Four times now you have come back from a hard conversation and written ' +
            'that you could not say it.',
      question: 'What is in the way? Is it the subject, or is it what happens when you raise it?',
    },
    {
      id: 'withdrawn_after_match',
      minCount: 3,
      windowDays: 90,
      says: 'You have taken {n} things off the table shortly after they matched.',
      question: 'Was that you changing your mind, or something that happened after?',
    },
    {
      id: 'one_sided_proposals',
      minCount: 8,
      windowDays: 120,
      says: '{n} goals you proposed as shared have not been taken up.',
      // The first draft ended "Some things are not wanted, and that is an
      // answer too." — a statement, and a quietly conclusive one. The test
      // caught it, and it was right to: softening a conclusion is still
      // making one. It hands the judgment back now.
      question: 'Have you talked about them, or have they gone unanswered?',
    },
    {
      id: 'feelings_flattening',
      minCount: 30,
      windowDays: 45,
      says: 'For six weeks your logged feeling has almost always been the same one. ' +
            'Steady and flat can look identical from inside.',
      // Same correction as one_sided_proposals: "They can look identical
      // from inside" is a true observation and still a conclusion tacked
      // onto a question. Moved into `says`, where describing belongs.
      question: 'Is that steady, or is it flat?',
    },
  ];

  /**
   * Resources. Deliberately NOT a single national hotline number hardcoded
   * into a file that may be read years from now in another country — a
   * disconnected number at the moment someone needs it is worse than none.
   * These are stable, findable, and the person is pointed at how to find the
   * right one where they are (§0.1 — do not assert a fact that will rot).
   */
  var RESOURCES = [
    { id: 'local', label: 'Find a service where you are',
      detail: 'Search for domestic abuse or relationship support in your country. Most have a ' +
              '24-hour line and a webchat, and you do not have to be in danger to call one.' },
    { id: 'talk_to_someone', label: 'Someone who is not in it',
      detail: 'A friend, a GP, a therapist. The hardest part of a pattern is that from inside it ' +
              'looks like the weather rather than something with a shape.' },
    { id: 'leave_no_trace', label: 'If you need this to be private',
      detail: 'This app keeps everything on your device. Settings › Admin can delete all of it, ' +
              'and it exports first. Browsers also keep history — a private window leaves less.' },
    { id: 'not_now', label: 'Not now',
      detail: 'This will not ask again on its own. It is in Settings whenever you want it.' },
  ];

  function defaultStore() {
    if (global.DB && typeof global.DB.get === 'function') {
      return { get: function (k, d) { return global.DB.get(k, d); },
               set: function (k, v) { global.DB.set(k, v); } };
    }
    throw new Error('[safety] no storage available — DB is not loaded. Refusing to operate blind.');
  }

  /**
   * @param {object} opts
   *   store   injectable
   *   read    () -> { ruptures, hardtalk, desires, goals, feelings }
   *           Counting functions only. This module never reads message text.
   */
  function Safety(opts) {
    opts = opts || {};
    this.store = opts.store || defaultStore();
    this.read = opts.read || function () { return {}; };
    this.now = opts.now || function () { return Date.now(); };
    // Deliberately absent: no bus, no send, no emitSync, no transport of any
    // kind. There is nothing here that could put this on the wire.
  }

  Safety.VERSION = SAFETY_VERSION;
  Safety.UUID = SAFETY_UUID;
  Safety.PATTERNS = PATTERNS;
  Safety.RESOURCES = RESOURCES;

  Safety.prototype.enabled = function () {
    return this.store.get(ENABLED_KEY, true) !== false;
  };
  Safety.prototype.setEnabled = function (on) {
    this.store.set(ENABLED_KEY, !!on);
    return { ok: true, on: !!on,
             note: on ? null : 'Off. Resources stay available in Settings — turning this off hides notices, not help.' };
  };

  Safety.prototype._dismissed = function () { return this.store.get(DISMISS_KEY, {}) || {}; };

  /** Permanent and silent. One dismissal per pattern, forever. */
  Safety.prototype.dismiss = function (patternId) {
    var d = this._dismissed();
    d[patternId] = this.now();
    this.store.set(DISMISS_KEY, d);
    return { ok: true, note: 'It will not raise this again.' };
  };

  /**
   * @returns {Array} patterns whose count is met and which have not been
   *          dismissed. Empty is the normal, expected result.
   */
  Safety.prototype.check = function () {
    if (!this.enabled()) return [];
    var counts, self = this;
    try { counts = this.read() || {}; }
    catch (e) {
      // §1.2 — if the data cannot be read, raise NOTHING. Guessing here is
      // the one place guessing is unacceptable.
      if (global.console) console.error('[safety] could not read counts, raising nothing: ' + e.message);
      return [];
    }
    var dismissed = this._dismissed();
    return PATTERNS.filter(function (p) {
      if (dismissed[p.id]) return false;
      var n = counts[p.id];
      return typeof n === 'number' && n >= p.minCount;
    }).map(function (p) {
      var n = counts[p.id];
      return {
        id: p.id,
        // Describes what was counted. Names nothing.
        says: p.says.replace('{n}', n),
        question: p.question,
        count: n,
        windowDays: p.windowDays,
        // §17.5 — the person can always see exactly what produced this
        because: 'counted ' + n + ' in the last ' + p.windowDays + ' days',
        // Never a conclusion. Always a door.
        offers: 'resources',
      };
    });
  };

  /** Always available, to anyone, at any time. Never triggered AT someone. */
  Safety.prototype.resources = function () {
    return { version: SAFETY_VERSION, items: RESOURCES,
             note: 'Open from Settings any time. Nothing here is recorded, and opening it changes nothing.' };
  };

  /** §12.6 diagnostics — and the invariants, asserted in the report itself. */
  Safety.prototype.health = function () {
    var d = this._dismissed();
    return {
      version: SAFETY_VERSION,
      enabled: this.enabled(),
      patternsDefined: PATTERNS.length,
      dismissed: Object.keys(d),
      // Structural facts, not aspirations. Each is asserted by a test.
      synced: 0,
      hasTransport: false,
      readsMessageContent: false,
      diagnoses: false,
      note: 'Nothing here crosses the relay. Not the patterns, not the counts, not that it ran.',
      status: this.enabled() ? 'watching' : 'off',
    };
  };

  global.Safety = Safety;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { Safety: Safety, PATTERNS: PATTERNS, RESOURCES: RESOURCES,
                       DISMISS_KEY: DISMISS_KEY, ENABLED_KEY: ENABLED_KEY };
  }
})(typeof window !== 'undefined' ? window : globalThis);
