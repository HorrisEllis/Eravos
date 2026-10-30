/* ══════════════════════════════════════════════════════════════════════════
   ERAVOS HARD TALK  ·  eravos-hardtalk.js  ·  v0.14.0
   UUID: eravos-hardtalk-engine-0001-0000-000000000001
   HOOK: eravos.hardtalk:engine:00001
   PARENT: eravos-kernel   OWNER: shared/eravos-hardtalk.js   (§17.1)
   ══════════════════════════════════════════════════════════════════════════

   Uncomfortable conversations. Name one before you have it, record what
   actually happened after, and let the same subject returning be visible.

   ── THE GROWTH SIGNAL IS RETURN, NOT RESOLUTION ─────────────────────────

   The instinct is to score these: did it go well, is it resolved, how many
   have you closed. That measures the wrong thing. A conversation you have
   had four times is not four failures — it is one subject that matters, and
   the shape of the four is the growth: how long you circled before naming
   it, how it went each time, what actually changed.

   So `revisit()` links a new attempt to the same subject rather than
   creating a new row, and `arc()` returns the whole sequence. Nothing here
   computes a success rate.

   ── STATES (§13.3, named before they occur) ─────────────────────────────

     circling   you know it is there and have not said it yet. A real state.
                Most of these live here for a long time and that is not a
                failure to be nudged out of.
     named      you have written down what it is
     had        the conversation happened
     shelved    deliberately set down. NOT abandoned — a named decision.

   There is no `resolved`. Subjects do not close; they get easier or they
   do not, and a "resolved" state would invite closing something that is
   still live to look tidy.

   ── AFTER, NOT DURING ───────────────────────────────────────────────────

   Nothing here prompts you during a conversation. No timer, no checklist to
   work through while someone is upset in front of you. You write before to
   get it out of your head, and after to keep what happened.
   ══════════════════════════════════════════════════════════════════════════ */

(function (global) {
  'use strict';

  var HT_VERSION = '0.14.0';
  var HT_UUID = 'eravos-hardtalk-engine-0001-0000-000000000001';
  var STORE_KEY = 'eravors_hardtalk';
  var STATES = ['circling', 'named', 'had', 'shelved'];
  var WENT = ['better than I expected', 'hard but honest', 'we got somewhere',
              'it went sideways', 'we did not really get into it', 'I could not say it'];

  function defaultStore() {
    if (global.DB && typeof global.DB.get === 'function') {
      return { get: function (k, d) { return global.DB.get(k, d); },
               set: function (k, v) { global.DB.set(k, v); } };
    }
    throw new Error('[hardtalk] no storage available — DB is not loaded. Refusing to operate blind.');
  }

  function HardTalk(opts) {
    opts = opts || {};
    this.store = opts.store || defaultStore();
    this.now = opts.now || function () { return Date.now(); };
  }
  HardTalk.VERSION = HT_VERSION;
  HardTalk.UUID = HT_UUID;
  HardTalk.STATES = STATES;
  HardTalk.WENT = WENT;

  HardTalk.prototype._all = function () { return this.store.get(STORE_KEY, []) || []; };
  HardTalk.prototype._save = function (v) { this.store.set(STORE_KEY, v); return v; };

  /** Name one. `circling` is the default and a legitimate resting place. */
  HardTalk.prototype.add = function (subject, opts) {
    opts = opts || {};
    var s = String(subject == null ? '' : subject).trim();
    if (!s) throw new Error('[hardtalk] add(): a subject is required');
    if (s.length > 200) throw new Error('[hardtalk] add(): 200 characters max for a subject');
    var list = this._all();
    var entry = {
      id: 'ht-' + this.now() + '-' + Math.random().toString(36).slice(2, 7),
      subject: s,
      why: opts.why || null,               // why it is hard, for you
      wanted: opts.wanted || null,         // what you want out of it
      afraidOf: opts.afraidOf || null,     // what you are afraid will happen
      state: STATES.indexOf(opts.state) !== -1 ? opts.state : 'circling',
      createdAt: this.now(),
      updatedAt: this.now(),
      attempts: [],
      shelved: null,
    };
    list.push(entry);
    this._save(list);
    return { ok: true, id: entry.id, state: entry.state,
             note: entry.state === 'circling'
               ? 'Named but not had. That is a real place to leave it — nothing here will chase you about it.'
               : null };
  };

  HardTalk.prototype.get = function (id) {
    return this._all().filter(function (e) { return e.id === id; })[0] || null;
  };
  HardTalk.prototype.list = function (state) {
    if (state && STATES.indexOf(state) === -1) {
      throw new Error('[hardtalk] list(): unknown state "' + state + '". Known: ' + STATES.join(', '));
    }
    var l = this._all().slice().sort(function (a, b) { return b.updatedAt - a.updatedAt; });
    return state ? l.filter(function (e) { return e.state === state; }) : l;
  };

  /**
   * Record that it happened. Appends an ATTEMPT rather than replacing —
   * having the same conversation twice is the point, not a correction.
   */
  HardTalk.prototype.record = function (id, attempt) {
    attempt = attempt || {};
    var list = this._all();
    var e = list.filter(function (x) { return x.id === id; })[0];
    if (!e) throw new Error('[hardtalk] record(): no conversation "' + id + '"');
    e.attempts.push({
      ts: attempt.ts || this.now(),
      went: attempt.went || null,          // free text or one of WENT — never forced
      whatHappened: attempt.whatHappened || null,
      whatChanged: attempt.whatChanged || null,
      // §1.1 — signal, not diagnosis. This is what you FELT it was, not a score.
      easierThanLast: attempt.easierThanLast == null ? null : !!attempt.easierThanLast,
    });
    e.state = 'had';
    e.updatedAt = this.now();
    this._save(list);
    return { ok: true, id: id, attempts: e.attempts.length,
             note: e.attempts.length > 1
               ? 'Attempt ' + e.attempts.length + ' on the same subject. Returning to it is the growth signal, not a failure.'
               : null };
  };

  /** Same subject, coming back around. Never a new row. */
  HardTalk.prototype.revisit = function (id) {
    var list = this._all();
    var e = list.filter(function (x) { return x.id === id; })[0];
    if (!e) throw new Error('[hardtalk] revisit(): no conversation "' + id + '"');
    e.state = 'circling';
    e.shelved = null;
    e.updatedAt = this.now();
    this._save(list);
    return { ok: true, id: id, state: 'circling', priorAttempts: e.attempts.length };
  };

  /** Set it down deliberately. A decision, not an abandonment. */
  HardTalk.prototype.shelve = function (id, why) {
    var list = this._all();
    var e = list.filter(function (x) { return x.id === id; })[0];
    if (!e) throw new Error('[hardtalk] shelve(): no conversation "' + id + '"');
    e.state = 'shelved';
    e.shelved = { why: why || null, ts: this.now() };
    e.updatedAt = this.now();
    this._save(list);
    return { ok: true, id: id, note: 'Shelved, not dropped. It stays here and revisit() brings it back.' };
  };

  /** The whole shape of one subject over time. */
  HardTalk.prototype.arc = function (id) {
    var e = this.get(id);
    if (!e) throw new Error('[hardtalk] arc(): no conversation "' + id + '"');
    var first = e.attempts[0], last = e.attempts[e.attempts.length - 1];
    return {
      id: id, subject: e.subject, state: e.state,
      namedAt: e.createdAt,
      circledForMs: first ? first.ts - e.createdAt : this.now() - e.createdAt,
      attempts: e.attempts.length,
      spanMs: (first && last) ? last.ts - first.ts : 0,
      // Reported only if they said so themselves. Never inferred.
      saidEasier: e.attempts.filter(function (a) { return a.easierThanLast === true; }).length,
      saidHarder: e.attempts.filter(function (a) { return a.easierThanLast === false; }).length,
      changes: e.attempts.map(function (a) { return a.whatChanged; }).filter(Boolean),
      note: 'No success rate is computed. A subject you keep returning to is one that matters.',
    };
  };

  HardTalk.prototype.export = function () {
    return { version: HT_VERSION, exportedAt: new Date().toISOString(), conversations: this._all() };
  };

  HardTalk.prototype.health = function () {
    var self = this;
    var all = this._all(), by = {};
    STATES.forEach(function (s) { by[s] = 0; });
    all.forEach(function (e) { by[e.state] = (by[e.state] || 0) + 1; });
    var repeated = all.filter(function (e) { return e.attempts.length > 1; });
    return {
      version: HT_VERSION,
      total: all.length,
      byState: by,
      // The number that actually means something here.
      subjectsReturnedTo: repeated.length,
      totalAttempts: all.reduce(function (n, e) { return n + e.attempts.length; }, 0),
      longestCirclingMs: all.filter(function (e) { return e.state === 'circling'; })
        .reduce(function (m, e) { return Math.max(m, self.now() - e.createdAt); }, 0),
      successRate: null,          // §17.3 — deliberately absent, not missing
      absentByDesign: ['success rate', 'resolved state', 'nudges to have it', 'in-conversation prompts'],
      status: all.length === 0 ? 'empty' : 'healthy',
    };
  };

  global.HardTalk = HardTalk;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { HardTalk: HardTalk, STATES: STATES, WENT: WENT, STORE_KEY: STORE_KEY };
  }
})(typeof window !== 'undefined' ? window : globalThis);
