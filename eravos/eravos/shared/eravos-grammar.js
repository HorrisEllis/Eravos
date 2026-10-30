/* ══════════════════════════════════════════════════════════════════════════
   ERAVOS SHARED GRAMMAR  ·  eravos-grammar.js  ·  v0.7.0
   UUID: eravos-grammar-store-0001-0000-000000000001
   HOOK: eravos.grammar:store:00001
   PARENT: eravos-kernel   OWNER: shared/eravos-grammar.js   (§17.1)
   ══════════════════════════════════════════════════════════════════════════

   The vocabulary that means something specific between two people — words
   carrying more than the dictionary gives them.

   ── TWO-SIDED BY CONSTRUCTION, NOT BY POLICY ────────────────────────────

   A word is not shared grammar because one person said it. It becomes shared
   when the other one TAKES IT UP. That is enforced structurally: `propose()`
   creates a `proposed` entry and there is no argument, flag or admin path
   that promotes it. Only `takeUp()`, called from the other side, can — and
   it refuses when the caller is the proposer.

   This matters more than it sounds. "Shared" is a claim about two people. A
   store that lets one person declare it unilaterally is recording a fact
   that is not true, and every derivation reading it downstream inherits the
   lie (§1.2).

   ── TWO MEANINGS, NEVER MERGED ──────────────────────────────────────────

   Each side records what the word means TO THEM, separately, and both are
   kept. There is no canonical meaning field and no merge step, because the
   interesting thing about shared grammar is usually the gap between the two.
   Collapsing them into one "correct" definition destroys exactly the signal
   the feature exists to hold (§0.3 — information is never lost).

   Meanings are editable and every edit is kept with its timestamp. A word's
   meaning drifting over two years is a real relational fact, not noise.

   ── DELIBERATELY NOT AUTOMATIC (§1.1) ───────────────────────────────────

   Nothing in this file infers grammar. A word does not become a candidate
   because the lattice noticed it twice. Inferring private meaning from
   frequency is the system telling two people what their own words mean to
   them — the exact overreach §1.1 forbids. `candidates()` exists and
   returns [] with a stated reason, so the absence is visible rather than
   looking like a missing feature.

   ── RETIREMENT, NOT DELETION ────────────────────────────────────────────

   Words fall out of use, and some carry things people no longer want live.
   `retire()` moves an entry out of the active set and keeps it. §0.3.
   Either side can retire unilaterally — taking something up requires both,
   putting it down does not.
   ══════════════════════════════════════════════════════════════════════════ */

(function (global) {
  'use strict';

  var GRAMMAR_VERSION = '0.7.0';
  var GRAMMAR_UUID = 'eravos-grammar-store-0001-0000-000000000001';

  var STORE_KEY = 'eravors_grammar';
  var MAX_ENTRIES = 400;
  var MAX_TERM = 80;
  var MAX_MEANING = 600;

  var STATES = ['proposed', 'shared', 'retired'];

  function defaultStore() {
    if (global.DB && typeof global.DB.get === 'function') {
      return { get: function (k, d) { return global.DB.get(k, d); },
               set: function (k, v) { global.DB.set(k, v); } };
    }
    throw new Error('[grammar] no storage available — DB is not loaded. Refusing to operate blind.');
  }

  function slug(term) {
    return String(term).toLowerCase().trim().replace(/\s+/g, '_').replace(/[^a-z0-9_'-]/g, '').slice(0, 60);
  }

  /**
   * @param {object} opts
   *   store  injectable persistence
   *   me     stable side id — 'self' or 'partner'. NOT a display name:
   *          a rename must not orphan authorship (the exact failure the
   *          admin engine's root-cause fix was about).
   *   send   function(type, data) -> boolean. Defaults to emitSync.
   */
  function GrammarStore(opts) {
    opts = opts || {};
    this.store = opts.store || defaultStore();
    this.me = opts.me === 'partner' ? 'partner' : 'self';
    this._send = opts.send || function (t, d) {
      if (typeof global.emitSync === 'function') return global.emitSync(t, d);
      return false;
    };
    this._listeners = [];
  }

  GrammarStore.VERSION = GRAMMAR_VERSION;
  GrammarStore.UUID = GRAMMAR_UUID;
  GrammarStore.STATES = STATES;

  GrammarStore.prototype._all = function () { return this.store.get(STORE_KEY, []) || []; };
  GrammarStore.prototype._save = function (list) {
    if (list.length > MAX_ENTRIES) {
      // §0.4 bounded — but retired entries go before live ones, and never a
      // shared entry while a retired one remains.
      var retired = list.filter(function (e) { return e.state === 'retired'; });
      var live = list.filter(function (e) { return e.state !== 'retired'; });
      retired.sort(function (a, b) { return (a.retiredAt || 0) - (b.retiredAt || 0); });
      while (retired.length && retired.length + live.length > MAX_ENTRIES) retired.shift();
      list = live.concat(retired);
      if (list.length > MAX_ENTRIES) list = list.slice(-MAX_ENTRIES);
    }
    this.store.set(STORE_KEY, list);
    this._emit();
    return list;
  };

  GrammarStore.prototype.on = function (fn) {
    this._listeners.push(fn);
    var l = this._listeners;
    return function () { var i = l.indexOf(fn); if (i >= 0) l.splice(i, 1); };
  };
  GrammarStore.prototype._emit = function () {
    var self = this;
    this._listeners.forEach(function (fn) {
      try { fn(self.entries()); }
      catch (e) { if (typeof console !== 'undefined') console.error('[grammar] listener threw: ' + e.message); }
    });
  };

  GrammarStore.prototype.get = function (id) {
    var hit = this._all().filter(function (e) { return e.id === id; })[0];
    return hit || null;
  };

  GrammarStore.prototype.entries = function (state) {
    var list = this._all();
    if (state) {
      if (STATES.indexOf(state) === -1) {
        throw new Error('[grammar] entries(): unknown state "' + state + '". Known: ' + STATES.join(', '));
      }
      list = list.filter(function (e) { return e.state === state; });
    }
    return list.slice().sort(function (a, b) { return (b.updatedAt || 0) - (a.updatedAt || 0); });
  };

  /** The active vocabulary — what both people took up. */
  GrammarStore.prototype.shared = function () { return this.entries('shared'); };

  /** Waiting on the other side. Split so neither surface has to guess. */
  GrammarStore.prototype.pending = function () {
    var me = this.me;
    var p = this.entries('proposed');
    return {
      awaitingThem: p.filter(function (e) { return e.proposedBy === me; }),
      awaitingMe:   p.filter(function (e) { return e.proposedBy !== me; }),
    };
  };

  /* ── propose ─────────────────────────────────────────────────────── */

  /**
   * One side puts a word forward. This is ALWAYS `proposed`. There is no
   * argument that makes it shared — see takeUp().
   */
  GrammarStore.prototype.propose = function (term, meaning, opts) {
    opts = opts || {};
    var t = String(term == null ? '' : term).trim();
    if (!t) throw new Error('[grammar] propose(): a word is required');
    if (t.length > MAX_TERM) throw new Error('[grammar] propose(): ' + MAX_TERM + ' characters max for a term (got ' + t.length + ')');
    var m = String(meaning == null ? '' : meaning).trim();
    if (m.length > MAX_MEANING) throw new Error('[grammar] propose(): ' + MAX_MEANING + ' characters max for a meaning');

    var id = 'g:' + slug(t);
    var list = this._all();
    var existing = list.filter(function (e) { return e.id === id; })[0];
    if (existing) {
      if (existing.state === 'retired') {
        existing.state = 'proposed';
        existing.retiredAt = null;
        existing.updatedAt = Date.now();
        this._save(list);
        return { ok: true, id: id, revived: true, state: 'proposed',
                 note: 'This word was retired. Proposing it again brings it back as proposed — it needs taking up afresh.' };
      }
      throw new Error('[grammar] propose(): "' + t + '" already exists (state: ' + existing.state + '). Use addMeaning() or takeUp().');
    }

    var entry = {
      id: id, term: t,
      state: 'proposed',
      proposedBy: this.me,
      proposedAt: Date.now(),
      updatedAt: Date.now(),
      takenUpBy: null, takenUpAt: null,
      retiredAt: null,
      // TWO columns. Never merged, no canonical field.
      meanings: { self: [], partner: [] },
      origin: opts.origin || 'manual',      // manual | chat | call
      originRef: opts.originRef || null,
    };
    if (m) entry.meanings[this.me].push({ text: m, ts: Date.now() });
    list.push(entry);
    this._save(list);

    try { this._send('grammar:propose', { id: id, term: t, meaning: m || null, origin: entry.origin }); } catch (e) {}
    return { ok: true, id: id, state: 'proposed', revived: false,
             note: 'Proposed. It is not shared grammar until they take it up.' };
  };

  /* ── take up — the ONLY path to shared ────────────────────────────── */

  GrammarStore.prototype.takeUp = function (id, meaning) {
    var list = this._all();
    var e = list.filter(function (x) { return x.id === id; })[0];
    if (!e) throw new Error('[grammar] takeUp(): no entry "' + id + '"');
    if (e.state === 'shared') return { ok: true, id: id, state: 'shared', already: true };
    if (e.state === 'retired') throw new Error('[grammar] takeUp(): "' + e.term + '" is retired. Propose it again first.');
    if (e.proposedBy === this.me) {
      // The structural guarantee, enforced here and nowhere circumventable.
      throw new Error('[grammar] takeUp(): you proposed "' + e.term + '". ' +
                      'A word becomes shared grammar when the OTHER person takes it up — ' +
                      'that is what makes it shared rather than announced.');
    }
    var m = String(meaning == null ? '' : meaning).trim();
    if (m.length > MAX_MEANING) throw new Error('[grammar] takeUp(): ' + MAX_MEANING + ' characters max for a meaning');

    e.state = 'shared';
    e.takenUpBy = this.me;
    e.takenUpAt = Date.now();
    e.updatedAt = Date.now();
    if (m) e.meanings[this.me].push({ text: m, ts: Date.now() });
    this._save(list);

    try { this._send('grammar:takeup', { id: id, meaning: m || null }); } catch (err) {}
    return { ok: true, id: id, state: 'shared', term: e.term,
             note: 'Shared now — both of you have hold of it.' };
  };

  /** Declining is a real answer and is recorded as one, not as silence. */
  GrammarStore.prototype.decline = function (id, why) {
    var list = this._all();
    var e = list.filter(function (x) { return x.id === id; })[0];
    if (!e) throw new Error('[grammar] decline(): no entry "' + id + '"');
    if (e.proposedBy === this.me) throw new Error('[grammar] decline(): you proposed this one');
    e.state = 'retired';
    e.retiredAt = Date.now();
    e.updatedAt = Date.now();
    e.declined = { by: this.me, why: why ? String(why).slice(0, 300) : null, ts: Date.now() };
    this._save(list);
    try { this._send('grammar:decline', { id: id, why: e.declined.why }); } catch (err) {}
    return { ok: true, id: id, state: 'retired',
             note: 'Declined and kept. §0.3 — it is retired, not deleted, and can be proposed again.' };
  };

  /* ── meanings: two columns, both kept, edits kept too ─────────────── */

  GrammarStore.prototype.addMeaning = function (id, text) {
    var list = this._all();
    var e = list.filter(function (x) { return x.id === id; })[0];
    if (!e) throw new Error('[grammar] addMeaning(): no entry "' + id + '"');
    var t = String(text == null ? '' : text).trim();
    if (!t) throw new Error('[grammar] addMeaning(): empty meaning');
    if (t.length > MAX_MEANING) throw new Error('[grammar] addMeaning(): ' + MAX_MEANING + ' characters max');
    // Appended, never overwritten — a meaning drifting over two years is a
    // real relational fact, not noise to be flattened (§0.3).
    e.meanings[this.me].push({ text: t, ts: Date.now() });
    e.updatedAt = Date.now();
    this._save(list);
    try { this._send('grammar:meaning', { id: id, text: t }); } catch (err) {}
    return { ok: true, id: id, side: this.me, revisions: e.meanings[this.me].length };
  };

  /** Current meaning per side, plus whether they diverge. */
  GrammarStore.prototype.meaningsOf = function (id) {
    var e = this.get(id);
    if (!e) throw new Error('[grammar] meaningsOf(): no entry "' + id + '"');
    var cur = function (arr) { return arr.length ? arr[arr.length - 1] : null; };
    var s = cur(e.meanings.self), p = cur(e.meanings.partner);
    return {
      id: id, term: e.term,
      self: s, partner: p,
      selfHistory: e.meanings.self, partnerHistory: e.meanings.partner,
      // NOT a judgment about who is right. Just: they wrote different things.
      bothPresent: !!(s && p),
      diverge: !!(s && p && s.text.trim().toLowerCase() !== p.text.trim().toLowerCase()),
      note: 'Two meanings, never merged. The gap between them is usually the interesting part.',
    };
  };

  /* ── retire ──────────────────────────────────────────────────────── */

  GrammarStore.prototype.retire = function (id, why) {
    var list = this._all();
    var e = list.filter(function (x) { return x.id === id; })[0];
    if (!e) throw new Error('[grammar] retire(): no entry "' + id + '"');
    e.state = 'retired';
    e.retiredAt = Date.now();
    e.updatedAt = Date.now();
    e.retiredWhy = why ? String(why).slice(0, 300) : null;
    this._save(list);
    try { this._send('grammar:retire', { id: id, why: e.retiredWhy }); } catch (err) {}
    // Unilateral on purpose: taking something up needs both, putting it down
    // does not. Nobody should need permission to stop using a word.
    return { ok: true, id: id, state: 'retired',
             note: 'Retired, not deleted. Either side can do this alone — taking a word up needs both, putting it down does not.' };
  };

  /* ── inbound from the sync gates ─────────────────────────────────── */

  var REMOTE_ACTIONS = ['propose', 'takeup', 'meaning', 'retire', 'decline'];

  GrammarStore.prototype.applyRemote = function (action, data) {
    // Validate the ACTION before the entry. Found by test: an unknown action
    // about an unknown entry hit the `!e -> return null` branch first and was
    // swallowed, so a malformed or future message type would have looked like
    // a routine miss. The unknown action is the more important fact and must
    // be named (§1.2 — same ordering principle as the admin engine's
    // admin-account guard firing before key validation).
    if (REMOTE_ACTIONS.indexOf(action) === -1) {
      throw new Error('[grammar] applyRemote(): unknown action "' + action + '". Known: ' + REMOTE_ACTIONS.join(', '));
    }
    var other = this.me === 'self' ? 'partner' : 'self';
    var list = this._all();
    var e = list.filter(function (x) { return x.id === (data && data.id); })[0];

    if (action === 'propose') {
      if (e && e.state !== 'retired') return null;
      if (e) { e.state = 'proposed'; e.retiredAt = null; }
      else {
        e = { id: data.id, term: data.term, state: 'proposed', proposedBy: other,
              proposedAt: Date.now(), updatedAt: Date.now(), takenUpBy: null, takenUpAt: null,
              retiredAt: null, meanings: { self: [], partner: [] },
              origin: data.origin || 'manual', originRef: null };
        list.push(e);
      }
      if (data.meaning) e.meanings[other].push({ text: data.meaning, ts: Date.now() });
      e.updatedAt = Date.now();
    } else if (!e) {
      return null;   // an action about something we have never seen: ignore quietly
    } else if (action === 'takeup') {
      if (e.proposedBy === other) return null;   // they cannot take up their own
      e.state = 'shared'; e.takenUpBy = other; e.takenUpAt = Date.now();
      if (data.meaning) e.meanings[other].push({ text: data.meaning, ts: Date.now() });
      e.updatedAt = Date.now();
    } else if (action === 'meaning') {
      if (!data.text) return null;
      e.meanings[other].push({ text: String(data.text), ts: Date.now() });
      e.updatedAt = Date.now();
    } else {   // retire | decline — both validated above
      e.state = 'retired'; e.retiredAt = Date.now(); e.updatedAt = Date.now();
      if (action === 'decline') e.declined = { by: other, why: data.why || null, ts: Date.now() };
      else e.retiredWhy = data.why || null;
    }
    this._save(list);
    return e;
  };

  /* ── lattice dimension support ───────────────────────────────────── */

  /** Shared terms present in a piece of text. Substring on word boundaries. */
  GrammarStore.prototype.termsIn = function (text) {
    var lower = ' ' + String(text || '').toLowerCase().replace(/[^a-z0-9'\s-]/g, ' ') + ' ';
    return this.shared()
      .filter(function (e) { return lower.indexOf(' ' + e.term.toLowerCase() + ' ') !== -1; })
      .map(function (e) { return e.id; });
  };

  /* ── the thing this file deliberately does not do (§1.1) ──────────── */

  /**
   * AUTOMATIC — added in v0.12.0 at the owner's direction, and the earlier
   * position is recorded rather than erased (§17.3).
   *
   * I argued the other way and shipped v0.7.0 with this returning []. The
   * argument was that inferring private meaning from frequency is the system
   * telling two people what their own words mean to them. That argument was
   * about ASSIGNING meaning — and it still holds. What it does not cover is
   * NOTICING repetition, which is a fact about the text and not a claim about
   * anybody.
   *
   * So automatic exists, and the line is drawn where the principle actually
   * sits rather than where it was convenient:
   *
   *   NOTICING   automatic. A phrase you have both used repeatedly is
   *              surfaced as a candidate.
   *   PROPOSING  still a person pressing a button.
   *   SHARING    still requires the other side to take it up.
   *
   * A candidate is never auto-proposed and never auto-shared. `auto` off
   * returns [] with the reason, so manual-only remains a real mode, not a
   * setting that quietly does nothing.
   */
  GrammarStore.prototype.candidates = function (corpus, opts) {
    opts = opts || {};
    if (opts.auto === false) {
      return { candidates: [], auto: false,
               reason: 'Automatic detection is off. Proposals are manual only.' };
    }
    if (!Array.isArray(corpus) || !corpus.length) {
      return { candidates: [], auto: true, reason: 'nothing to read yet' };
    }
    var minCount = opts.minCount || 3;
    var minWords = opts.minWords || 2;
    var maxWords = opts.maxWords || 5;

    var known = {};
    this._all().forEach(function (e) { known[e.term.toLowerCase()] = e.state; });

    var counts = new Map(), sources = new Map();
    for (var i = 0; i < corpus.length; i++) {
      var entry = corpus[i];
      var text = typeof entry === 'string' ? entry : (entry && entry.text) || '';
      var who = (entry && entry.speaker) || 'unknown';
      var words = String(text).toLowerCase().replace(/[^a-z0-9'\s-]/g, ' ').split(/\s+/).filter(Boolean);
      var seenHere = new Set();
      for (var n = minWords; n <= maxWords; n++) {
        for (var s = 0; s + n <= words.length; s++) {
          var phrase = words.slice(s, s + n).join(' ');
          if (phrase.length < 6 || phrase.length > 80) continue;
          if (seenHere.has(phrase)) continue;      // once per utterance
          seenHere.add(phrase);
          counts.set(phrase, (counts.get(phrase) || 0) + 1);
          if (!sources.has(phrase)) sources.set(phrase, new Set());
          sources.get(phrase).add(who);
        }
      }
    }

    var out = [];
    counts.forEach(function (count, phrase) {
      if (count < minCount) return;
      if (known[phrase]) return;                   // already in the vocabulary
      var speakers = sources.get(phrase);
      out.push({
        term: phrase, count: count,
        speakers: [...speakers],
        // A phrase BOTH people use is a stronger candidate than one only you
        // repeat — shared grammar is by definition mutual.
        mutual: speakers.size > 1,
        why: count + ' uses' + (speakers.size > 1 ? ', both of you' : ', you only'),
      });
    });
    // longer phrases first at equal strength: they carry more meaning than
    // the two-word fragments inside them
    out.sort(function (a, b) {
      return (b.mutual - a.mutual) || (b.count - a.count) || (b.term.length - a.term.length);
    });

    // drop a candidate wholly contained in a stronger one already kept
    var kept = [];
    out.forEach(function (c) {
      if (kept.some(function (k) { return k.term.indexOf(c.term) !== -1; })) return;
      kept.push(c);
    });

    return {
      candidates: kept.slice(0, opts.limit || 12),
      auto: true,
      scanned: corpus.length,
      note: 'Noticed, not decided. Nothing here is proposed or shared until you press a button and they take it up.',
    };
  };

  /* ── §9.4 export · §12.6 diagnostics ─────────────────────────────── */

  GrammarStore.prototype.export = function () {
    return { version: GRAMMAR_VERSION, exportedAt: new Date().toISOString(), entries: this._all() };
  };

  GrammarStore.prototype.health = function () {
    var all = this._all();
    var by = { proposed: 0, shared: 0, retired: 0 };
    all.forEach(function (e) { by[e.state] = (by[e.state] || 0) + 1; });
    var self = this;
    var sharedList = this.shared();
    var diverging = sharedList.filter(function (e) {
      try { return self.meaningsOf(e.id).diverge; } catch (x) { return false; }
    });
    var oneSided = sharedList.filter(function (e) {
      return !(e.meanings.self.length && e.meanings.partner.length);
    });
    var p = this.pending();
    return {
      version: GRAMMAR_VERSION,
      total: all.length, cap: MAX_ENTRIES,
      byState: by,
      awaitingThem: p.awaitingThem.length,
      awaitingMe: p.awaitingMe.length,
      // §12.5 — a gap is information. Shared words only one side ever
      // described are worth seeing, not hiding.
      sharedWithOnlyOneMeaning: oneSided.map(function (e) { return e.term; }),
      divergingMeanings: diverging.map(function (e) { return e.term; }),
      autoProposed: 0,       // structurally zero: candidates are never proposed for you
      autoShared: 0,         // structurally zero: only takeUp() shares, ever
      status: all.length === 0 ? 'empty'
            : p.awaitingMe.length ? 'awaiting-you'
            : by.shared === 0 ? 'nothing-shared-yet'
            : 'healthy',
    };
  };

  global.GrammarStore = GrammarStore;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { GrammarStore: GrammarStore, STORE_KEY: STORE_KEY, STATES: STATES };
  }
})(typeof window !== 'undefined' ? window : globalThis);
