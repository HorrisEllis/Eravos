/* ══════════════════════════════════════════════════════════════════════════
   ERAVOS CO-CREATION SETTINGS  ·  eravos-cocreation.js  ·  v0.25.0
   UUID: eravos-cocreation-settings-0001-0000-000000000001
   HOOK: eravos.cocreation:settings:00001
   PARENT: eravos-kernel   OWNER: shared/eravos-cocreation.js   (§17.1)
   ══════════════════════════════════════════════════════════════════════════

   Every shared setting, asked once, in one place.

   ── WHY ONE POPUP AND NOT SETTINGS ──────────────────────────────────────

   These decisions were scattered across four engines — chat prefs, presence,
   the planner, the calendar — each defaulting on its own and each needing to
   be found. In practice nobody finds them, so the app runs on whatever the
   defaults happened to be and the pair never actually chooses.

   Asking once, at the moment you pair, is the only time these questions are
   live. After that it is Settings, and it does not ask again.

   ── EVERY SETTING IS EITHER MINE OR OURS, AND THEY BEHAVE DIFFERENTLY ───

     MINE   what I broadcast. I decide alone, either of us can stop alone,
            and turning it on does NOT turn it on for them.
     OURS   what we both agreed to. Requires both. Either can end it alone.

   That distinction is the whole safety model and it is enforced here:
   `set()` refuses to write an `ours` setting without both sides, and a
   refusal names which side is missing. One person cannot configure a pair.

   ── DEFAULTS LEAN TOWARD PRESENCE ───────────────────────────────────────

   For two people who have deliberately paired, off-by-default means the app
   starts cold and stays cold. So presence is on. Read receipts are not —
   "seen at 11:04 and said nothing" is a different kind of information, and
   it is the one that gets used against people.
   ══════════════════════════════════════════════════════════════════════════ */

(function (global) {
  'use strict';

  var CC_VERSION = '0.25.0';
  var CC_UUID = 'eravos-cocreation-settings-0001-0000-000000000001';
  var STORE_KEY = 'eravors_cocreation_settings';
  var ASKED_KEY = 'eravors_cocreation_asked';

  /**
   * §13.2 — every setting named, with its scope, default, and what it costs.
   * `scope: 'ours'` means it cannot be set by one person alone.
   */
  var SETTINGS = [
    { id: 'shareCursor', scope: 'mine', def: true,
      label: 'Let them see my cursor',
      why: 'Most of what "navigating this together" actually is. Never written down — ' +
           'not capped, never stored. They only see it if they are sharing too.' },
    { id: 'shareTab', scope: 'mine', def: true,
      label: 'Let them see which tab I am on',
      why: 'A quiet line that says where you are. Nothing about what you are writing.' },
    { id: 'followEnabled', scope: 'mine', def: true,
      label: 'Let them go with me',
      why: 'They can follow you between tabs. You are told when they do — a follow you ' +
           'cannot see would be surveillance rather than company.' },
    { id: 'readReceipts', scope: 'mine', def: false,
      label: 'Read receipts',
      why: 'Off on purpose. "Seen at 11:04 and said nothing" is the kind of information ' +
           'that gets used against people.' },

    { id: 'sharedPlanner', scope: 'ours', def: true,
      label: 'A planner we both see',
      why: 'Events either of you adds, visible to both. You can still keep something to ' +
           'yourself — every event has a scope.' },
    { id: 'plannerProposals', scope: 'ours', def: true,
      label: 'Proposing, not scheduling',
      why: 'An event one of you adds arrives as a PROPOSAL the other accepts or declines. ' +
           'Putting something in someone else\'s calendar is not planning together.' },
    { id: 'sharedLattice', scope: 'ours', def: true,
      label: 'One lattice from both of us',
      why: 'What you both say feeds the same graph. Without this it reads half a ' +
           'conversation and calls it a relationship.' },
    { id: 'sharedGrammar', scope: 'ours', def: true,
      label: 'Shared grammar',
      why: 'Words that mean something specific between you. A word is only shared once ' +
           'the other takes it up.' },
    { id: 'presenceInShell', scope: 'ours', def: true,
      label: 'Show where they are, everywhere',
      why: 'Not just inside Chat. A quiet line above the ticker, hidden when there is ' +
           'nothing to say.' },
    { id: 'mergedDashboard', scope: 'ours', def: false,
      label: 'One dashboard for both of you',
      why: 'Their pulse beside yours. Nothing comparative — no counts, no who-logged-more. ' +
           'A dashboard that scores two people against each other is a machine for resentment.' },
  ];

  function defaultStore() {
    if (global.DB && typeof global.DB.get === 'function') {
      return { get: function (k, d) { return global.DB.get(k, d); },
               set: function (k, v) { global.DB.set(k, v); } };
    }
    throw new Error('[cocreation] no storage available — DB is not loaded. Refusing to operate blind.');
  }

  function CoCreation(opts) {
    opts = opts || {};
    this.store = opts.store || defaultStore();
    this.me = opts.me === 'partner' ? 'partner' : 'self';
    this.now = opts.now || function () { return Date.now(); };
    this.send = opts.send || function (t, d) {
      if (typeof global.emitSync === 'function') return global.emitSync(t, d);
      return false;
    };
  }

  CoCreation.VERSION = CC_VERSION;
  CoCreation.UUID = CC_UUID;
  CoCreation.SETTINGS = SETTINGS;

  CoCreation.prototype.def = function (id) {
    return SETTINGS.filter(function (s) { return s.id === id; })[0] || null;
  };
  CoCreation.prototype._raw = function () { return this.store.get(STORE_KEY, {}) || {}; };

  /** Resolved value, with WHY it is what it is. Never a bare boolean. */
  CoCreation.prototype.get = function (id) {
    var d = this.def(id);
    if (!d) throw new Error('[cocreation] unknown setting "' + id + '". Known: ' +
                            SETTINGS.map(function (s) { return s.id; }).join(', '));
    var v = this._raw()[id];
    if (d.scope === 'mine') {
      return { id: id, on: v && typeof v.self === 'boolean' ? v.self : d.def,
               scope: 'mine', bothRequired: false };
    }
    var self = v && v.self, partner = v && v.partner;
    var mine = typeof self === 'boolean' ? self : d.def;
    var theirs = typeof partner === 'boolean' ? partner : null;
    return {
      id: id, scope: 'ours', bothRequired: true,
      // An `ours` setting is on only when BOTH have said yes. An unanswered
      // partner is not a yes — §"not answering is not an answer".
      on: mine === true && theirs === true,
      mine: mine, theirs: theirs,
      waitingOn: mine !== true ? 'you' : (theirs !== true ? 'them' : null),
    };
  };

  /**
   * Set YOUR side. There is deliberately no parameter for the other person's
   * side — one person cannot configure a pair.
   */
  CoCreation.prototype.set = function (id, on) {
    var d = this.def(id);
    if (!d) throw new Error('[cocreation] unknown setting "' + id + '"');
    var all = this._raw();
    var v = all[id] || {};
    v[this.me] = !!on;
    all[id] = v;
    this.store.set(STORE_KEY, all);
    try { this.send('cocreation:setting', { id: id, on: !!on }); } catch (e) {}
    var state = this.get(id);
    return {
      ok: true, id: id, on: state.on,
      note: d.scope === 'ours' && !state.on && on
        ? 'Set on your side. It needs them too — one person cannot turn on something you both live in.'
        : (!on && d.scope === 'ours'
            ? 'Off. Either of you can end a shared setting alone; neither needs permission.'
            : null),
    };
  };

  /** Their side, arriving over the wire. */
  CoCreation.prototype.applyRemote = function (id, on) {
    if (!this.def(id)) return null;
    var them = this.me === 'self' ? 'partner' : 'self';
    var all = this._raw();
    var v = all[id] || {};
    v[them] = !!on;
    all[id] = v;
    this.store.set(STORE_KEY, all);
    return this.get(id);
  };

  /* ── the one-time ask ─────────────────────────────────────────────── */

  CoCreation.prototype.shouldAsk = function () {
    return !this.store.get(ASKED_KEY, false);
  };

  /**
   * Answer everything at once. Dismissing without answering is a real
   * outcome — the defaults stand and it does not ask again.
   */
  CoCreation.prototype.complete = function (answers, how) {
    answers = answers || {};
    var self = this, applied = [];
    SETTINGS.forEach(function (s) {
      var v = (s.id in answers) ? !!answers[s.id] : s.def;
      self.set(s.id, v);
      applied.push({ id: s.id, on: v });
    });
    this.store.set(ASKED_KEY, { ts: this.now(), how: how || 'answered' });
    return { ok: true, applied: applied,
             note: 'Set. It will not ask again — Settings has all of it whenever you want to change something.' };
  };

  CoCreation.prototype.skip = function () {
    this.store.set(ASKED_KEY, { ts: this.now(), how: 'skipped' });
    return { ok: true, note: 'The defaults stand. Nothing here is locked in — Settings has all of it.' };
  };

  /** What to render in the popup, already grouped. */
  CoCreation.prototype.questions = function () {
    var self = this;
    return {
      mine: SETTINGS.filter(function (s) { return s.scope === 'mine'; })
        .map(function (s) { return Object.assign({}, s, { current: self.get(s.id).on }); }),
      ours: SETTINGS.filter(function (s) { return s.scope === 'ours'; })
        .map(function (s) { return Object.assign({}, s, { current: self.get(s.id).mine }); }),
    };
  };

  CoCreation.prototype.health = function () {
    var self = this;
    var states = SETTINGS.map(function (s) { return self.get(s.id); });
    return {
      version: CC_VERSION,
      settings: SETTINGS.length,
      on: states.filter(function (s) { return s.on; }).length,
      waitingOnThem: states.filter(function (s) { return s.waitingOn === 'them'; }).map(function (s) { return s.id; }),
      waitingOnYou: states.filter(function (s) { return s.waitingOn === 'you'; }).map(function (s) { return s.id; }),
      asked: this.store.get(ASKED_KEY, false),
      // structural, asserted by tests
      oneSidedOursSettings: states.filter(function (s) {
        return s.scope === 'ours' && s.on && s.theirs !== true;
      }).length,
      status: this.shouldAsk() ? 'not-yet-asked' : 'configured',
    };
  };

  global.CoCreation = CoCreation;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { CoCreation: CoCreation, SETTINGS: SETTINGS, STORE_KEY: STORE_KEY, ASKED_KEY: ASKED_KEY };
  }
})(typeof window !== 'undefined' ? window : globalThis);
