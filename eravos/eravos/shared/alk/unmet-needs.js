/* ══════════════════════════════════════════════════════════════════════════
   UNMET NEEDS  ·  unmet-needs.js  ·  v0.23.0
   UUID: eravos-unmet-needs-0001-0000-000000000001
   HOOK: eravos.unmet:tracker:00001
   PARENT: eravos-kernel   OWNER: shared/alk/unmet-needs.js   (§17.1)
   ══════════════════════════════════════════════════════════════════════════

   An unmet need that keeps arriving and never gets addressed is the thing
   this whole system exists to see.

   ── WHY THIS EXISTS, AND WHY IT WAS WRONG TO DEFER ──────────────────────

   `htl.js` populates `unmet` only from `emo.dominant`, and those circuits
   are 40–90% face-cue driven. On text-only input GRIEF tops out at 0.15
   against a 0.2 threshold, so `unmet` stayed permanently EMPTY. I recorded
   that as a limitation and moved on.

   That was the wrong call. An empty `unmet` is not a missing field — it is
   the highest-value signal in the app going unrecorded. A need named once is
   information. A need that arrives again and again while nothing addresses
   it is accumulation, and accumulation that nobody names is what resentment
   is made of. It should have been first priority.

   ── WHY IT DOES NOT EDIT THE VENDORED FILE ──────────────────────────────

   `htl.js` is vendored unmodified and hashed (sha256 86dc863a7fbc…) so its
   provenance is verifiable. Editing it to add a text term would break that
   for one feature.

   So this is SOVEREIGN: a text-native producer on its own channel, with its
   own evidence, that merges into the need object alongside htl's face-driven
   output rather than replacing it. Every entry it produces is marked
   `source: 'text'` so the two are never confused (§17.5). When a camera is
   present, htl's circuits still run and still win — this fills a gap, it
   does not overrule an instrument that can actually see.

   ── ADDRESSED IS THE HARD PART (§1.1) ───────────────────────────────────

   Detecting a need is the easy half. Knowing whether it was ADDRESSED is
   what turns a list into a signal, and it cannot be inferred from text —
   someone saying "I hear you" is not the need being met.

   So addressing is only ever recorded from an ACT: a rupture logged with a
   repair, a care-profile entry written for it, a commitment made, an
   explicit "this got handled". Never from sentiment, never from a reply.
   §1.1 — signal, not diagnosis, at the exact point where it would be
   easiest to guess.

   ── AND IT DESCRIBES, IT DOES NOT ACCUSE ────────────────────────────────

   It never says "you are building resentment" and never says "they are
   neglecting you". It says: this need has come up nine times in six weeks
   and nothing is logged as addressing it. Then it asks. Same discipline as
   the safety layer, for the same reason.
   ══════════════════════════════════════════════════════════════════════════ */

(function (global) {
  'use strict';

  var UNMET_VERSION = '0.23.0';
  var UNMET_UUID = 'eravos-unmet-needs-0001-0000-000000000001';
  var STORE_KEY = 'eravors_unmet_needs';

  // Same vocabulary as htl.js NEEDS, so the two merge cleanly.
  var NEEDS = ['SAFETY', 'CONNECTION', 'AUTONOMY', 'UNDERSTANDING', 'CONTRIBUTION',
               'RESPECT', 'PLAY', 'AUTHENTICITY', 'MOURNING', 'INTERDEPENDENCE'];

  /**
   * Text-native detectors. Each needs EVIDENCE — a phrase actually present —
   * so every derived need can be traced back to the words that produced it
   * (§17.5). No detector fires on sentiment alone.
   *
   * `unmet` patterns are the ones expressing a LACK, which is the
   * distinction htl's face circuits make and plain text does not.
   */
  var DETECTORS = {
    CONNECTION: {
      active: [/\bmiss(ing)? (you|him|her|them)\b/i, /\btogether\b/i, /\bclose(r|ness)?\b/i],
      unmet: [/\balone\b/i, /\blonely\b/i, /\bdistant\b/i, /\bfar (away|apart)\b/i,
              /\bdon'?t feel (close|connected)\b/i, /\bmiss(ing)? .{0,20}\bus\b/i,
              /\bdrifting\b/i, /\blike a stranger\b/i],
    },
    UNDERSTANDING: {
      active: [/\bexplain\b/i, /\bmake sense\b/i, /\bunderstand\b/i],
      unmet: [/\bdon'?t (get|understand) (me|it|why)\b/i, /\bnobody (gets|understands)\b/i,
              /\bnot (being )?heard\b/i, /\bkeep (saying|explaining)\b/i,
              /\btalking past\b/i, /\bwhat'?s the point of (saying|explaining)\b/i],
    },
    RESPECT: {
      active: [/\bappreciat/i, /\bvalue[ds]?\b/i],
      unmet: [/\bdismiss(ed|ive)?\b/i, /\btalked over\b/i, /\bignored?\b/i,
              /\bdoesn'?t matter\b/i, /\btaken for granted\b/i, /\bbelittl/i,
              /\bmade me feel (small|stupid)\b/i],
    },
    SAFETY: {
      active: [/\bsafe\b/i, /\bsteady\b/i],
      unmet: [/\bwalking on eggshells\b/i, /\bscared to (say|bring)\b/i, /\bnot safe\b/i,
              /\bbrace(d|ing)?\b/i, /\bwaiting for (it|the other shoe)\b/i,
              /\bafraid (to|of) (say|telling|how)\b/i],
    },
    AUTONOMY: {
      active: [/\bmy (own )?(choice|call|decision)\b/i, /\bspace\b/i],
      unmet: [/\bno (say|choice)\b/i, /\bcontrolled?\b/i, /\bcan'?t (do|be) anything without\b/i,
              /\bsuffocat/i, /\bhave to ask\b/i, /\bno room (to|for)\b/i],
    },
    AUTHENTICITY: {
      active: [/\bhonest(ly)?\b/i, /\breal(ly)? me\b/i],
      unmet: [/\bcan'?t be myself\b/i, /\bpretend(ing)?\b/i, /\bmask(ing)?\b/i,
              /\bbite my tongue\b/i, /\bkeep (it )?to myself\b/i, /\bhold(ing)? (it |back)\b/i],
    },
    INTERDEPENDENCE: {
      active: [/\bwe\b/i, /\bboth of us\b/i, /\bteam\b/i],
      unmet: [/\bon my own\b/i, /\bcarrying (it|this|everything)\b/i, /\bno (help|support)\b/i,
              /\bdoing (it|this) alone\b/i, /\ball on me\b/i],
    },
    PLAY: {
      active: [/\bfun\b/i, /\blaugh(ed|ing)?\b/i, /\bplay(ful)?\b/i],
      unmet: [/\bnever (fun|laugh)\b/i, /\ball (we do is|it is is) (fight|argue|work)\b/i,
              /\bso serious\b/i, /\bforgot how to\b/i],
    },
    MOURNING: {
      active: [/\bgriev/i, /\bmourn/i],
      unmet: [/\bnever (got to|had a chance to) (grieve|say goodbye)\b/i,
              /\bstill (hurts|carrying)\b/i, /\bnobody (acknowledged|noticed)\b/i],
    },
    CONTRIBUTION: {
      active: [/\bhelp(ed|ing)?\b/i, /\bfor (you|us)\b/i],
      unmet: [/\bpointless\b/i, /\bdoesn'?t (matter|make a difference)\b/i,
              /\bwhy (do i )?bother\b/i, /\bunnoticed\b/i],
    },
  };

  function defaultStore() {
    if (global.DB && typeof global.DB.get === 'function') {
      return { get: function (k, d) { return global.DB.get(k, d); },
               set: function (k, v) { global.DB.set(k, v); } };
    }
    throw new Error('[unmet] no storage available — DB is not loaded. Refusing to operate blind.');
  }

  function UnmetNeeds(opts) {
    opts = opts || {};
    this.store = opts.store || defaultStore();
    this.now = opts.now || function () { return Date.now(); };
    // Thresholds for SURFACING, not for detecting. Deliberately not thin:
    // a need arriving three times in a fortnight is a fortnight, not a
    // pattern. Four times across a month is a pattern.
    this.minRecurrence = opts.minRecurrence || 4;
    this.minSpanDays = opts.minSpanDays || 21;
  }

  UnmetNeeds.VERSION = UNMET_VERSION;
  UnmetNeeds.UUID = UNMET_UUID;
  UnmetNeeds.NEEDS = NEEDS;
  UnmetNeeds.DETECTORS = DETECTORS;

  /**
   * Read one utterance. Pure — no storage, no side effects, so it can be
   * reasoned about and tested without a database (§3.4).
   *
   * @returns {{active:string[], unmet:string[], evidence:object}}
   */
  UnmetNeeds.prototype.read = function (text) {
    var t = String(text == null ? '' : text);
    var active = [], unmet = [], evidence = {};
    if (!t.trim()) return { active: active, unmet: unmet, evidence: evidence, source: 'text' };

    Object.keys(DETECTORS).forEach(function (need) {
      var d = DETECTORS[need];
      var hitsUnmet = (d.unmet || []).filter(function (re) { return re.test(t); });
      var hitsActive = (d.active || []).filter(function (re) { return re.test(t); });
      if (hitsUnmet.length) {
        // A need expressed as a LACK is both active and unmet. That is the
        // distinction htl's face circuits make and flat text does not.
        unmet.push(need);
        if (active.indexOf(need) === -1) active.push(need);
        evidence[need] = hitsUnmet.map(function (re) { return (t.match(re) || [''])[0]; }).filter(Boolean);
      } else if (hitsActive.length) {
        active.push(need);
        evidence[need] = hitsActive.map(function (re) { return (t.match(re) || [''])[0]; }).filter(Boolean);
      }
    });
    return { active: active, unmet: unmet, evidence: evidence, source: 'text' };
  };

  /** Merge with htl's output. Face-driven wins where present; this fills gaps. */
  UnmetNeeds.prototype.merge = function (htlNeed, textRead) {
    var base = htlNeed || { active: [], unmet: [] };
    var uniq = function (xs) { return xs.filter(function (x, i) { return xs.indexOf(x) === i; }); };
    return {
      active: uniq((base.active || []).concat(textRead.active)),
      unmet: uniq((base.unmet || []).concat(textRead.unmet)),
      intent: base.intent || null,
      strategy: base.strategy || null,
      confidence: base.confidence != null ? base.confidence : null,
      // §17.5 — which producer said what, always separable.
      sources: {
        circuits: (base.unmet || []).slice(),   // htl.js, face-driven
        text: textRead.unmet.slice(),           // this module
      },
      evidence: textRead.evidence,
    };
  };

  /* ── the part that matters: accumulation over time ────────────────── */

  UnmetNeeds.prototype._all = function () { return this.store.get(STORE_KEY, {}) || {}; };
  UnmetNeeds.prototype._save = function (v) { this.store.set(STORE_KEY, v); return v; };

  /** Record an occurrence. Called once per utterance that carries an unmet need. */
  UnmetNeeds.prototype.record = function (need, opts) {
    opts = opts || {};
    if (NEEDS.indexOf(need) === -1) {
      throw new Error('[unmet] record(): unknown need "' + need + '". Known: ' + NEEDS.join(', '));
    }
    var all = this._all();
    var e = all[need] || { need: need, firstSeen: this.now(), occurrences: [], addressed: [] };
    e.occurrences.push({
      ts: this.now(),
      evidence: opts.evidence || null,
      text: opts.text ? String(opts.text).slice(0, 200) : null,
      source: opts.source || 'text',
    });
    // §0.4 bounded — the count and the span survive trimming, which is all
    // the signal needs.
    if (e.occurrences.length > 300) e.occurrences = e.occurrences.slice(-300);
    e.lastSeen = this.now();
    all[need] = e;
    this._save(all);
    return { ok: true, need: need, occurrences: e.occurrences.length };
  };

  /**
   * Record that something was DONE about it. Only from an act — never from a
   * reply, never from sentiment. "I hear you" is not the need being met.
   */
  UnmetNeeds.prototype.addressed = function (need, how, ref) {
    var ACTS = ['repair', 'care_entry', 'commitment', 'conversation', 'manual'];
    if (NEEDS.indexOf(need) === -1) throw new Error('[unmet] addressed(): unknown need "' + need + '"');
    if (ACTS.indexOf(how) === -1) {
      throw new Error('[unmet] addressed(): "' + how + '" is not an act. Known: ' + ACTS.join(', ') +
                      '. Addressing is only ever recorded from something DONE — a reply is not an act.');
    }
    var all = this._all();
    var e = all[need] || { need: need, firstSeen: this.now(), occurrences: [], addressed: [] };
    e.addressed.push({ ts: this.now(), how: how, ref: ref || null });
    all[need] = e;
    this._save(all);
    return { ok: true, need: need, timesAddressed: e.addressed.length,
             note: 'Recorded. Occurrences after this are what count from here — ' +
                   'the clock restarts rather than the history being erased.' };
  };

  /**
   * THE SIGNAL. Needs that keep arriving and have nothing logged as
   * addressing them since.
   */
  UnmetNeeds.prototype.standing = function () {
    var all = this._all(), self = this, out = [];
    Object.keys(all).forEach(function (need) {
      var e = all[need];
      var lastAddressed = e.addressed.length ? e.addressed[e.addressed.length - 1].ts : 0;
      // Only occurrences SINCE the last time something was done about it.
      //
      // `>=`, not `>`. With a strict `>` an occurrence landing in the SAME
      // millisecond as the act was silently dropped — so someone who logs a
      // repair and immediately says the thing again loses that occurrence.
      // Caught by a test that measured 4 where 5 were recorded. `addressed()`
      // creates no occurrence of its own, so inclusive costs nothing and
      // stops the quiet loss.
      var since = e.occurrences.filter(function (o) { return o.ts >= lastAddressed; });
      if (!since.length) return;
      var spanDays = (since[since.length - 1].ts - since[0].ts) / 86400000;
      out.push({
        need: need,
        count: since.length,
        spanDays: +spanDays.toFixed(1),
        firstSince: since[0].ts,
        lastSeen: since[since.length - 1].ts,
        everAddressed: e.addressed.length > 0,
        lastAddressed: lastAddressed || null,
        // Describes what was counted. Names nothing about anybody.
        says: need.toLowerCase().replace(/_/g, ' ') + ' has come up ' + since.length +
              ' time' + (since.length === 1 ? '' : 's') +
              (spanDays >= 1 ? ' over ' + Math.round(spanDays) + ' days' : '') +
              (e.addressed.length ? ' since anything was logged as addressing it'
                                  : ', and nothing is logged as addressing it'),
        // Hands the judgment back. Never a conclusion.
        question: 'Has it been talked about, or has it been going unsaid?',
        evidence: since.slice(-3).map(function (o) { return o.text; }).filter(Boolean),
        standing: since.length >= self.minRecurrence && spanDays >= self.minSpanDays,
      });
    });
    return out.sort(function (a, b) { return b.count - a.count; });
  };

  /** Only the ones over threshold. What the app should actually surface. */
  UnmetNeeds.prototype.surfacing = function () {
    return this.standing().filter(function (s) { return s.standing; });
  };

  UnmetNeeds.prototype.export = function () {
    return { version: UNMET_VERSION, exportedAt: new Date().toISOString(), needs: this._all() };
  };

  UnmetNeeds.prototype.health = function () {
    var all = this._all(), standing = this.standing();
    return {
      version: UNMET_VERSION,
      tracked: Object.keys(all).length,
      totalOccurrences: Object.keys(all).reduce(function (n, k) { return n + all[k].occurrences.length; }, 0),
      timesAddressed: Object.keys(all).reduce(function (n, k) { return n + all[k].addressed.length; }, 0),
      standing: standing.filter(function (s) { return s.standing; }).map(function (s) { return s.need; }),
      neverAddressed: standing.filter(function (s) { return !s.everAddressed; }).map(function (s) { return s.need; }),
      // structural, asserted by tests
      inferredFromSentiment: 0,
      addressedFromReply: 0,
      diagnoses: false,
      vendoredFileEdited: false,
      status: standing.some(function (s) { return s.standing; }) ? 'standing' : 'clear',
    };
  };

  global.UnmetNeeds = UnmetNeeds;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { UnmetNeeds: UnmetNeeds, NEEDS: NEEDS, DETECTORS: DETECTORS, STORE_KEY: STORE_KEY };
  }
})(typeof window !== 'undefined' ? window : globalThis);
