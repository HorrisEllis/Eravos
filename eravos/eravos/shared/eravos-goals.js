/* ══════════════════════════════════════════════════════════════════════════
   ERAVOS GOALS  ·  eravos-goals.js  ·  v0.14.0
   UUID: eravos-goals-engine-0001-0000-000000000001
   HOOK: eravos.goals:engine:00001
   PARENT: eravos-kernel   OWNER: shared/eravos-goals.js   (§17.1)
   ══════════════════════════════════════════════════════════════════════════

   Shared goals and the steps under them.

   ── OWNERSHIP IS FOUR-VALUED, NOT TWO ───────────────────────────────────

     mine      I am carrying this
     theirs    they are
     ours      both, and it needs both of us to move
     proposed  I want this to be ours and they have not said yet

   `proposed` is the one that matters. Writing "we should" on a shared list
   does not make it shared — the same rule as the grammar store and the
   pairing code: one person offers, the other takes it up. A goal sitting in
   `proposed` is honest about where it actually is.

   ── NO DEADLINES BY DEFAULT, AND NO OVERDUE ─────────────────────────────

   A date is optional and is called a `hope`, not a deadline. Nothing here
   turns red, nothing is ever marked overdue, and `health()` computes no
   completion percentage. A relational roadmap that shames you for a slow
   month is worse than no roadmap.

   §17.3 — the absence is structural and reported, so nobody adds a progress
   bar later thinking it was an oversight.

   ── DROPPING IS A REAL OUTCOME ──────────────────────────────────────────

   `drop()` is a first-class state with a reason field, not a delete.
   Deciding you do not want something any more is a result, and the record
   of having wanted it is worth keeping (§0.3).
   ══════════════════════════════════════════════════════════════════════════ */

(function (global) {
  'use strict';

  var GOALS_VERSION = '0.14.0';
  var GOALS_UUID = 'eravos-goals-engine-0001-0000-000000000001';
  var STORE_KEY = 'eravors_goals';
  var OWNERS = ['mine', 'theirs', 'ours', 'proposed'];
  var STATES = ['open', 'moving', 'done', 'dropped'];

  function defaultStore() {
    if (global.DB && typeof global.DB.get === 'function') {
      return { get: function (k, d) { return global.DB.get(k, d); },
               set: function (k, v) { global.DB.set(k, v); } };
    }
    throw new Error('[goals] no storage available — DB is not loaded. Refusing to operate blind.');
  }

  function Goals(opts) {
    opts = opts || {};
    this.store = opts.store || defaultStore();
    this.me = opts.me === 'partner' ? 'partner' : 'self';
    this.now = opts.now || function () { return Date.now(); };
  }
  Goals.VERSION = GOALS_VERSION;
  Goals.UUID = GOALS_UUID;
  Goals.OWNERS = OWNERS;
  Goals.STATES = STATES;

  Goals.prototype._all = function () { return this.store.get(STORE_KEY, []) || []; };
  Goals.prototype._save = function (v) { this.store.set(STORE_KEY, v); return v; };

  Goals.prototype.add = function (title, opts) {
    opts = opts || {};
    var t = String(title == null ? '' : title).trim();
    if (!t) throw new Error('[goals] add(): a title is required');
    if (t.length > 200) throw new Error('[goals] add(): 200 characters max');
    var owner = OWNERS.indexOf(opts.owner) !== -1 ? opts.owner : 'mine';
    // Claiming something is "ours" unilaterally is the thing this prevents.
    if (owner === 'ours') owner = 'proposed';
    var list = this._all();
    var g = {
      id: 'g-' + this.now() + '-' + Math.random().toString(36).slice(2, 7),
      title: t, why: opts.why || null,
      owner: owner, proposedBy: owner === 'proposed' ? this.me : null,
      state: 'open',
      hope: opts.hope || null,        // a date you HOPE for. Never a deadline.
      steps: [], createdAt: this.now(), updatedAt: this.now(), dropped: null,
    };
    list.push(g);
    this._save(list);
    return { ok: true, id: g.id, owner: owner,
             note: owner === 'proposed'
               ? 'Proposed as shared. It becomes ours when they take it up — writing "we should" does not make it shared.'
               : null };
  };

  Goals.prototype.get = function (id) { return this._all().filter(function (g) { return g.id === id; })[0] || null; };
  Goals.prototype.list = function (filter) {
    filter = filter || {};
    var l = this._all().slice().sort(function (a, b) { return b.updatedAt - a.updatedAt; });
    if (filter.owner) {
      if (OWNERS.indexOf(filter.owner) === -1) throw new Error('[goals] list(): unknown owner "' + filter.owner + '". Known: ' + OWNERS.join(', '));
      l = l.filter(function (g) { return g.owner === filter.owner; });
    }
    if (filter.state) {
      if (STATES.indexOf(filter.state) === -1) throw new Error('[goals] list(): unknown state "' + filter.state + '". Known: ' + STATES.join(', '));
      l = l.filter(function (g) { return g.state === filter.state; });
    }
    return l;
  };

  /** The other side takes up a proposal. The ONLY path to `ours`. */
  Goals.prototype.takeUp = function (id) {
    var list = this._all();
    var g = list.filter(function (x) { return x.id === id; })[0];
    if (!g) throw new Error('[goals] takeUp(): no goal "' + id + '"');
    if (g.owner === 'ours') return { ok: true, id: id, owner: 'ours', already: true };
    if (g.owner !== 'proposed') throw new Error('[goals] takeUp(): "' + g.title + '" was not proposed as shared');
    if (g.proposedBy === this.me) {
      throw new Error('[goals] takeUp(): you proposed this one. It becomes ours when THEY take it up — ' +
                      'that is what makes it shared rather than assigned.');
    }
    g.owner = 'ours'; g.takenUpAt = this.now(); g.updatedAt = this.now();
    this._save(list);
    return { ok: true, id: id, owner: 'ours' };
  };

  Goals.prototype.addStep = function (id, text) {
    var list = this._all();
    var g = list.filter(function (x) { return x.id === id; })[0];
    if (!g) throw new Error('[goals] addStep(): no goal "' + id + '"');
    var t = String(text == null ? '' : text).trim();
    if (!t) throw new Error('[goals] addStep(): empty step');
    g.steps.push({ id: 's-' + this.now() + '-' + g.steps.length, text: t, done: false, ts: this.now() });
    g.updatedAt = this.now();
    if (g.state === 'open') g.state = 'moving';
    this._save(list);
    return { ok: true, goalId: id, steps: g.steps.length };
  };

  Goals.prototype.toggleStep = function (goalId, stepId) {
    var list = this._all();
    var g = list.filter(function (x) { return x.id === goalId; })[0];
    if (!g) throw new Error('[goals] toggleStep(): no goal "' + goalId + '"');
    var s = g.steps.filter(function (x) { return x.id === stepId; })[0];
    if (!s) throw new Error('[goals] toggleStep(): no step "' + stepId + '"');
    s.done = !s.done; s.doneAt = s.done ? this.now() : null;
    g.updatedAt = this.now();
    this._save(list);
    // Finishing every step does NOT auto-complete the goal. Only a person
    // says a goal is done — a checklist emptying is not the same thing.
    return { ok: true, done: s.done, allStepsDone: g.steps.every(function (x) { return x.done; }),
             goalState: g.state };
  };

  Goals.prototype.complete = function (id, note) {
    var list = this._all();
    var g = list.filter(function (x) { return x.id === id; })[0];
    if (!g) throw new Error('[goals] complete(): no goal "' + id + '"');
    g.state = 'done'; g.doneAt = this.now(); g.doneNote = note || null; g.updatedAt = this.now();
    this._save(list);
    return { ok: true, id: id, state: 'done' };
  };

  /** Deciding you do not want it is a RESULT, not a deletion (§0.3). */
  Goals.prototype.drop = function (id, why) {
    var list = this._all();
    var g = list.filter(function (x) { return x.id === id; })[0];
    if (!g) throw new Error('[goals] drop(): no goal "' + id + '"');
    g.state = 'dropped'; g.dropped = { why: why || null, ts: this.now() }; g.updatedAt = this.now();
    this._save(list);
    return { ok: true, id: id, state: 'dropped',
             note: 'Kept, not deleted. Deciding you do not want something is a result worth having a record of.' };
  };

  Goals.prototype.export = function () {
    return { version: GOALS_VERSION, exportedAt: new Date().toISOString(), goals: this._all() };
  };

  Goals.prototype.health = function () {
    var all = this._all(), byOwner = {}, byState = {};
    OWNERS.forEach(function (o) { byOwner[o] = 0; });
    STATES.forEach(function (s) { byState[s] = 0; });
    all.forEach(function (g) { byOwner[g.owner]++; byState[g.state]++; });
    var self = this;
    return {
      version: GOALS_VERSION,
      total: all.length, byOwner: byOwner, byState: byState,
      awaitingThem: all.filter(function (g) { return g.owner === 'proposed' && g.proposedBy === self.me; }).length,
      awaitingMe: all.filter(function (g) { return g.owner === 'proposed' && g.proposedBy !== self.me; }).length,
      // §17.3 — absent on purpose. A relational roadmap that shames you for a
      // slow month is worse than no roadmap.
      completionPercent: null,
      overdue: null,
      absentByDesign: ['completion percentage', 'overdue', 'deadlines', 'streaks', 'reminders'],
      status: all.length === 0 ? 'empty' : 'healthy',
    };
  };

  global.Goals = Goals;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { Goals: Goals, OWNERS: OWNERS, STATES: STATES, STORE_KEY: STORE_KEY };
  }
})(typeof window !== 'undefined' ? window : globalThis);
