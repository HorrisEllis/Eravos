/* ══════════════════════════════════════════════════════════════════════════
   ERAVOS CARE PROFILE  ·  eravos-careprofile.js  ·  v0.17.0
   UUID: eravos-careprofile-0001-0000-000000000001
   HOOK: eravos.care:profile:00001
   PARENT: eravos-kernel   OWNER: shared/eravos-careprofile.js   (§17.1)
   ══════════════════════════════════════════════════════════════════════════

   "When I'm upset, I need affection." — and everything else in that shape.

   A living reference about each other, written by the person it is about,
   surfaced at the moment it is useful rather than filed and forgotten.

   ── AUTHORSHIP IS ABSOLUTE (§10.1, and it is the whole point) ────────────

   Their entries are THEIRS. You can read them. You cannot edit them, cannot
   delete them, cannot add one on their behalf.

   A profile of someone that the other person can rewrite is not a profile,
   it is a projection — and the exact failure this is meant to prevent is one
   person deciding what the other needs. `edit()` and `remove()` refuse when
   the caller is not the author. Structurally, not by convention.

   ── SURFACED, NOT STORED ────────────────────────────────────────────────

   A care profile nobody reads is a form you filled in once. `forMoment()`
   pulls the entries tagged for what is happening right now — their "when I'm
   upset" appears when a rupture is logged, not in a tab you would have to
   think to open.

   ── EVERY ENTRY IS REVOCABLE, AND HISTORY IS KEPT (§0.3) ────────────────

   What someone needed two years ago is not what they need now. Editing keeps
   the previous version with its date, because the change is often the more
   interesting fact. Only the author sees their own history — a partner seeing
   "she used to need X" turns a living document into a receipt.
   ══════════════════════════════════════════════════════════════════════════ */

(function (global) {
  'use strict';

  var CARE_VERSION = '0.17.0';
  var CARE_UUID = 'eravos-careprofile-0001-0000-000000000001';
  var STORE_KEY = 'eravors_care_profile';

  /** §13.2 — every section named, with what it is for. */
  var SECTIONS = [
    { id: 'when_then',  label: 'When ___, I need ___',
      hint: 'The most useful thing in here. "When I go quiet, I need you to stay." ' +
            '"When I\'m upset, I need affection — not solutions."' },
    { id: 'how_to_hold', label: 'How to hold me',
      hint: 'What actually lands when things are hard.' },
    { id: 'what_helps',  label: 'What helps',
      hint: 'Small and specific beats big and vague.' },
    { id: 'what_doesnt', label: 'What does not help',
      hint: 'Even when it is meant well. Especially then.' },
    { id: 'boundaries',  label: 'Boundaries',
      hint: 'Not up for negotiation, and not a punishment.' },
    { id: 'dislikes',    label: 'Dislikes',
      hint: 'The small things. Nobody remembers these and everybody wishes they did.' },
    { id: 'reactions',   label: 'My reactions, and what they mean',
      hint: '"If I get very tidy, I am anxious." Reading someone wrong is mostly ' +
            'not knowing their tells.' },
    { id: 'gratitude',   label: 'Things I am grateful for',
      hint: 'Written down because it is easy to feel and hard to say.' },
    { id: 'forget_to_say', label: 'Things I forget to say',
      hint: 'The ones that never quite come out at the time.' },
  ];

  /** Moments an entry can be tagged to, so it surfaces when it is needed. */
  var MOMENTS = ['rupture', 'upset', 'distance', 'reunion', 'conflict', 'illness',
                 'overwhelm', 'celebration', 'anytime'];

  function defaultStore() {
    if (global.DB && typeof global.DB.get === 'function') {
      return { get: function (k, d) { return global.DB.get(k, d); },
               set: function (k, v) { global.DB.set(k, v); } };
    }
    throw new Error('[care] no storage available — DB is not loaded. Refusing to operate blind.');
  }

  /** @param {object} opts  me: 'self' | 'partner' — the stable SIDE */
  function CareProfile(opts) {
    opts = opts || {};
    this.store = opts.store || defaultStore();
    this.me = opts.me === 'partner' ? 'partner' : 'self';
    this.now = opts.now || function () { return Date.now(); };
  }

  CareProfile.VERSION = CARE_VERSION;
  CareProfile.UUID = CARE_UUID;
  CareProfile.SECTIONS = SECTIONS;
  CareProfile.MOMENTS = MOMENTS;

  CareProfile.prototype._all = function () { return this.store.get(STORE_KEY, []) || []; };
  CareProfile.prototype._save = function (v) { this.store.set(STORE_KEY, v); return v; };

  /**
   * Write something about YOURSELF. There is deliberately no parameter for
   * whose profile this goes in — it always goes in yours.
   */
  CareProfile.prototype.add = function (sectionId, text, opts) {
    opts = opts || {};
    if (!SECTIONS.some(function (s) { return s.id === sectionId; })) {
      throw new Error('[care] add(): unknown section "' + sectionId + '". Known: ' +
                      SECTIONS.map(function (s) { return s.id; }).join(', '));
    }
    var t = String(text == null ? '' : text).trim();
    if (!t) throw new Error('[care] add(): empty entry');
    if (t.length > 600) throw new Error('[care] add(): 600 characters max');

    var moments = (opts.moments || []).filter(function (m) { return MOMENTS.indexOf(m) !== -1; });
    var entry = {
      id: 'c-' + this.now() + '-' + Math.random().toString(36).slice(2, 7),
      author: this.me,                 // never a parameter. Always the caller.
      section: sectionId,
      text: t,
      // "when X" is only half an entry; the other half is what you need then.
      trigger: sectionId === 'when_then' ? (opts.trigger || null) : null,
      moments: moments.length ? moments : ['anytime'],
      createdAt: this.now(), updatedAt: this.now(),
      history: [],
    };
    var all = this._all();
    all.push(entry);
    this._save(all);
    return { ok: true, id: entry.id, author: entry.author };
  };

  CareProfile.prototype.get = function (id) {
    return this._all().filter(function (e) { return e.id === id; })[0] || null;
  };

  /** Whose profile to read. Defaults to theirs — that is what it is for. */
  CareProfile.prototype.list = function (opts) {
    opts = opts || {};
    var side = opts.author === 'self' ? this.me
             : opts.author === 'partner' ? (this.me === 'self' ? 'partner' : 'self')
             : null;
    var self = this;
    return this._all().filter(function (e) {
      if (side && e.author !== side) return false;
      if (opts.section && e.section !== opts.section) return false;
      return true;
    }).map(function (e) {
      // History is the AUTHOR'S alone. A partner seeing "she used to need X"
      // turns a living document into a receipt.
      if (e.author !== self.me) { var c = Object.assign({}, e); delete c.history; return c; }
      return e;
    }).sort(function (a, b) { return b.updatedAt - a.updatedAt; });
  };

  /** THE POINT — what to read right now. Defaults to their entries. */
  CareProfile.prototype.forMoment = function (moment, opts) {
    opts = opts || {};
    if (MOMENTS.indexOf(moment) === -1) {
      throw new Error('[care] forMoment(): unknown moment "' + moment + '". Known: ' + MOMENTS.join(', '));
    }
    var want = opts.author === 'self' ? this.me : (this.me === 'self' ? 'partner' : 'self');
    return this.list({ author: opts.author || 'partner' }).filter(function (e) {
      return e.author === want && (e.moments.indexOf(moment) !== -1 || e.moments.indexOf('anytime') !== -1);
    });
  };

  /** §0.3 — editing keeps the previous version. Author only. */
  CareProfile.prototype.edit = function (id, text, opts) {
    opts = opts || {};
    var all = this._all();
    var e = all.filter(function (x) { return x.id === id; })[0];
    if (!e) throw new Error('[care] edit(): no entry "' + id + '"');
    if (e.author !== this.me) {
      throw new Error('[care] edit(): this is theirs. You can read it; you cannot rewrite it — ' +
                      'a profile the other person can edit is a projection, not a profile.');
    }
    var t = String(text == null ? '' : text).trim();
    if (!t) throw new Error('[care] edit(): empty entry');
    e.history.push({ text: e.text, trigger: e.trigger, ts: e.updatedAt });
    e.text = t;
    if ('trigger' in opts) e.trigger = opts.trigger || null;
    if (Array.isArray(opts.moments)) {
      e.moments = opts.moments.filter(function (m) { return MOMENTS.indexOf(m) !== -1; });
      if (!e.moments.length) e.moments = ['anytime'];
    }
    e.updatedAt = this.now();
    this._save(all);
    return { ok: true, id: id, revisions: e.history.length,
             note: 'Kept the previous version. What you needed then is worth having too.' };
  };

  CareProfile.prototype.remove = function (id) {
    var all = this._all();
    var e = all.filter(function (x) { return x.id === id; })[0];
    if (!e) throw new Error('[care] remove(): no entry "' + id + '"');
    if (e.author !== this.me) {
      throw new Error('[care] remove(): this is theirs. Only the person it is about can take it down.');
    }
    this._save(all.filter(function (x) { return x.id !== id; }));
    return { ok: true, id: id };
  };

  /** Their entries arriving over the wire. Authorship is forced, not trusted. */
  CareProfile.prototype.applyRemote = function (entry) {
    if (!entry || !entry.id || !entry.text) return null;
    var them = this.me === 'self' ? 'partner' : 'self';
    var all = this._all();
    var existing = all.filter(function (x) { return x.id === entry.id; })[0];
    var clean = {
      id: entry.id,
      author: them,                    // never taken from the payload
      section: SECTIONS.some(function (s) { return s.id === entry.section; }) ? entry.section : 'when_then',
      text: String(entry.text).slice(0, 600),
      trigger: entry.trigger ? String(entry.trigger).slice(0, 200) : null,
      moments: (entry.moments || ['anytime']).filter(function (m) { return MOMENTS.indexOf(m) !== -1; }),
      createdAt: entry.createdAt || this.now(),
      updatedAt: entry.updatedAt || this.now(),
      history: [],                     // their history is not ours to hold
    };
    if (!clean.moments.length) clean.moments = ['anytime'];
    if (existing) Object.assign(existing, clean); else all.push(clean);
    this._save(all);
    return clean;
  };

  CareProfile.prototype.export = function () {
    var me = this.me;
    return { version: CARE_VERSION, exportedAt: new Date().toISOString(),
             mine: this._all().filter(function (e) { return e.author === me; }) };
  };

  CareProfile.prototype.health = function () {
    var all = this._all(), me = this.me;
    var mine = all.filter(function (e) { return e.author === me; });
    var theirs = all.filter(function (e) { return e.author !== me; });
    var bySection = {};
    SECTIONS.forEach(function (s) { bySection[s.id] = mine.filter(function (e) { return e.section === s.id; }).length; });
    return {
      version: CARE_VERSION,
      mine: mine.length, theirs: theirs.length,
      bySection: bySection,
      // §12.5 — sections nobody has filled in are information, not a to-do
      // list. There is no completion score and no nudge to finish.
      untouchedSections: SECTIONS.filter(function (s) { return !bySection[s.id]; }).map(function (s) { return s.id; }),
      completionPercent: null,
      editsOfTheirs: 0,          // structurally impossible
      status: mine.length === 0 && theirs.length === 0 ? 'empty' : 'healthy',
    };
  };

  global.CareProfile = CareProfile;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { CareProfile: CareProfile, SECTIONS: SECTIONS, MOMENTS: MOMENTS, STORE_KEY: STORE_KEY };
  }
})(typeof window !== 'undefined' ? window : globalThis);
