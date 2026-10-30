/* ══════════════════════════════════════════════════════════════════════════
   ERAVOS DESIRES  ·  eravos-desires.js  ·  v0.14.0
   UUID: eravos-desires-engine-0001-0000-000000000001
   HOOK: eravos.desires:engine:00001
   PARENT: eravos-kernel   OWNER: shared/eravos-desires.js   (§17.1)
   ══════════════════════════════════════════════════════════════════════════

   Exploring what you each want, and what you don't, without either of you
   having to go first.

   ── THE THREE RULES THIS IS BUILT AROUND ────────────────────────────────

   1. SEALED UNTIL BOTH ANSWER. Your answers are invisible to them, and
      theirs to you, until you have both answered THAT ITEM. Otherwise the
      second person answers in response to the first, which is a different
      thing from answering honestly — and they can feel the difference even
      when they cannot name it.

   2. ONLY MUTUAL INTEREST IS EVER REVEALED. If you said yes and they said
      no, you learn nothing except that it is not a match. You are never told
      "they said maybe to the thing you wanted", because that is not
      information, it is leverage.

   3. LIMITS ARE ABSOLUTE AND UNILATERAL. A `no` is a no. There is no
      "discuss", no "revisit", no counter-offer, no notification to the other
      person that you moved something off the table. Withdrawal is instant,
      needs no reason, and propagates immediately.

   ── WHAT IS DELIBERATELY ABSENT (§0.4, §17.3) ───────────────────────────

   No completion percentage. No streaks. No "your partner is waiting on you".
   No "3 new matches!". No nudge, ever. Every one of those converts a private
   act into an obligation, and an obligation is the one thing that cannot be
   present here — a yes given under any pressure is not a yes.

   The absence is structural, not stylistic. `health()` reports
   `pressureMechanics: 0` and a test asserts no method exists that could
   notify, remind, or score completion.

   ── SCALE (§13.2 — every value named) ───────────────────────────────────

     yes       I want this
     curious   I would explore this
     maybe     under some conditions — the conditions field is yours
     no        not for me
     limit     hard limit. Absolute, never softened, never negotiated here.

   `unanswered` is a real state and is never treated as a soft no or a soft
   yes. Not having answered is not an answer.
   ══════════════════════════════════════════════════════════════════════════ */

(function (global) {
  'use strict';

  var DESIRES_VERSION = '0.14.0';
  var DESIRES_UUID = 'eravos-desires-engine-0001-0000-000000000001';
  var STORE_KEY = 'eravors_desires';
  var ANSWERS = ['yes', 'curious', 'maybe', 'no', 'limit'];
  var MUTUAL_LEVELS = ['yes', 'curious', 'maybe'];   // states that can match

  function defaultStore() {
    if (global.DB && typeof global.DB.get === 'function') {
      return { get: function (k, d) { return global.DB.get(k, d); },
               set: function (k, v) { global.DB.set(k, v); } };
    }
    throw new Error('[desires] no storage available — DB is not loaded. Refusing to operate blind.');
  }

  /**
   * @param {object} opts
   *   me      'self' | 'partner' — the stable SIDE, never a display name
   *   store   injectable
   */
  function Desires(opts) {
    opts = opts || {};
    this.store = opts.store || defaultStore();
    this.me = opts.me === 'partner' ? 'partner' : 'self';
    this.them = this.me === 'self' ? 'partner' : 'self';
    this.now = opts.now || function () { return Date.now(); };
    this._listeners = [];
  }

  Desires.VERSION = DESIRES_VERSION;
  Desires.UUID = DESIRES_UUID;
  Desires.ANSWERS = ANSWERS;

  Desires.prototype.on = function (fn) { this._listeners.push(fn); var l = this._listeners;
    return function () { var i = l.indexOf(fn); if (i >= 0) l.splice(i, 1); }; };
  Desires.prototype._emit = function () {
    this._listeners.forEach(function (fn) { try { fn(); }
      catch (e) { if (global.console) console.error('[desires] listener threw: ' + e.message); } });
  };

  Desires.prototype._all = function () { return this.store.get(STORE_KEY, {}) || {}; };
  Desires.prototype._save = function (v) { this.store.set(STORE_KEY, v); this._emit(); return v; };

  /* ── answering ───────────────────────────────────────────────────── */

  /**
   * Record YOUR answer to one item. Never visible to them until they have
   * answered the same item.
   */
  Desires.prototype.answer = function (itemId, value, opts) {
    opts = opts || {};
    if (!itemId) throw new Error('[desires] answer(): an item id is required');
    if (ANSWERS.indexOf(value) === -1) {
      throw new Error('[desires] answer(): "' + value + '" is not one of ' + ANSWERS.join(', '));
    }
    var all = this._all();
    var it = all[itemId] || { self: null, partner: null };
    var prev = it[this.me];
    it[this.me] = {
      value: value,
      conditions: value === 'maybe' ? (opts.conditions || null) : null,
      note: opts.note || null,
      ts: this.now(),
    };
    // §0.3 — the history of your own answers is yours and is kept. It is
    // never shown to them; changing your mind is not evidence.
    it[this.me + 'History'] = (it[this.me + 'History'] || []).concat(
      prev ? [{ value: prev.value, ts: prev.ts }] : []);
    all[itemId] = it;
    this._save(all);
    return { ok: true, itemId: itemId, value: value,
             sealed: !it[this.them],
             note: it[this.them] ? null : 'Sealed until they answer this one too.' };
  };

  /**
   * WITHDRAW. Instant, unilateral, no reason required, no notification of
   * what it used to be. This is the most important method in the file.
   */
  Desires.prototype.withdraw = function (itemId) {
    var all = this._all();
    var it = all[itemId];
    if (!it || !it[this.me]) return { ok: true, note: 'nothing to withdraw' };
    var prev = it[this.me];
    it[this.me] = { value: 'no', conditions: null, note: null, ts: this.now(), withdrawn: true };
    it[this.me + 'History'] = (it[this.me + 'History'] || []).concat([{ value: prev.value, ts: prev.ts }]);
    all[itemId] = it;
    this._save(all);
    return { ok: true, itemId: itemId,
             note: 'Off the table. No reason needed, nobody is told what it was, and it takes effect now.' };
  };

  Desires.prototype.setLimit = function (itemId, note) {
    return this.answer(itemId, 'limit', { note: note || null });
  };

  Desires.prototype.myAnswer = function (itemId) {
    var it = this._all()[itemId];
    return (it && it[this.me]) || null;
  };

  /* ── the seal ────────────────────────────────────────────────────── */

  /**
   * What you are allowed to see for one item. THE core of this engine.
   *
   * Their answer is returned ONLY when: you have both answered, neither of
   * you said no or limit, and both are at yes/curious/maybe.
   */
  Desires.prototype.reveal = function (itemId) {
    var it = this._all()[itemId];
    var mine = it && it[this.me];
    var theirs = it && it[this.them];

    if (!mine) return { state: 'unanswered', theirAnswer: null,
                        note: 'You have not answered this one. Not answering is not an answer.' };
    if (!theirs) return { state: 'sealed', theirAnswer: null,
                          note: 'Sealed until they answer it too — so neither of you is answering in response to the other.' };

    var hardStop = mine.value === 'limit' || theirs.value === 'limit' ||
                   mine.value === 'no' || theirs.value === 'no';
    if (hardStop) {
      // You learn ONLY that it is not a match. Never who said what, never
      // how close it was. "They said maybe" is leverage, not information.
      return { state: 'not-a-match', theirAnswer: null,
               note: 'Not a match. Nothing more than that is shown, in either direction.' };
    }
    if (MUTUAL_LEVELS.indexOf(mine.value) !== -1 && MUTUAL_LEVELS.indexOf(theirs.value) !== -1) {
      return {
        state: 'mutual',
        theirAnswer: { value: theirs.value, conditions: theirs.conditions || null },
        // The lower of the two sets the pace. Two "yes" is yes; a yes and a
        // maybe is a maybe, and the maybe's conditions come with it.
        together: (mine.value === 'yes' && theirs.value === 'yes') ? 'yes'
                : (mine.value === 'no' || theirs.value === 'no') ? 'no'
                : (mine.value === 'maybe' || theirs.value === 'maybe') ? 'maybe' : 'curious',
        note: 'Both of you are open to this. The more cautious answer sets the pace.',
      };
    }
    return { state: 'not-a-match', theirAnswer: null };
  };

  /** Every mutual match. The only place their answers surface at all. */
  Desires.prototype.mutual = function () {
    var self = this, all = this._all(), out = [];
    Object.keys(all).forEach(function (id) {
      var r = self.reveal(id);
      if (r.state === 'mutual') out.push({ itemId: id, together: r.together, theirs: r.theirAnswer });
    });
    return out;
  };

  /** Your own limits, listed for you. Never sent anywhere. */
  Desires.prototype.myLimits = function () {
    var all = this._all(), me = this.me, out = [];
    Object.keys(all).forEach(function (id) {
      if (all[id][me] && all[id][me].value === 'limit') out.push({ itemId: id, note: all[id][me].note || null });
    });
    return out;
  };

  /** Their answers arriving over the wire. Stored sealed; the seal is in reveal(). */
  Desires.prototype.applyRemote = function (itemId, payload) {
    if (!itemId || !payload || ANSWERS.indexOf(payload.value) === -1) return null;
    var all = this._all();
    var it = all[itemId] || { self: null, partner: null };
    it[this.them] = { value: payload.value, conditions: payload.conditions || null,
                      note: null, ts: payload.ts || this.now() };
    all[itemId] = it;
    this._save(all);
    return it[this.them];
  };

  /** §9.4 export — your side only. Theirs is not yours to export. */
  Desires.prototype.export = function () {
    var all = this._all(), me = this.me, out = {};
    Object.keys(all).forEach(function (id) {
      out[id] = { mine: all[id][me] || null, history: all[id][me + 'History'] || [] };
    });
    return { version: DESIRES_VERSION, exportedAt: new Date().toISOString(), side: me, answers: out };
  };

  /** §12.6 diagnostics. Deliberately contains no completion score. */
  Desires.prototype.health = function () {
    var all = this._all(), me = this.me, self = this;
    var ids = Object.keys(all);
    var answered = ids.filter(function (id) { return all[id][me]; });
    return {
      version: DESIRES_VERSION,
      itemsTouched: ids.length,
      answeredByMe: answered.length,
      myLimits: this.myLimits().length,
      sealed: ids.filter(function (id) { return self.reveal(id).state === 'sealed'; }).length,
      mutual: this.mutual().length,
      // §17.3 — the absence is structural and reported, so nobody adds one
      // later thinking it was an oversight.
      pressureMechanics: 0,
      absentByDesign: ['completion percentage', 'streaks', 'partner-waiting notices',
                       'match alerts', 'nudges', 'reminders'],
      status: ids.length === 0 ? 'untouched' : 'healthy',
    };
  };

  global.Desires = Desires;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { Desires: Desires, ANSWERS: ANSWERS, STORE_KEY: STORE_KEY };
  }
})(typeof window !== 'undefined' ? window : globalThis);
