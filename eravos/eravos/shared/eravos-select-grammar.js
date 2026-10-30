/* ══════════════════════════════════════════════════════════════════════════
   SELECT → GRAMMAR  ·  eravos-select-grammar.js  ·  v0.11.0
   UUID: eravos-select-grammar-0001-0000-000000000001
   HOOK: eravos.grammar:select:00001
   PARENT: eravos-grammar-store-0001-0000-000000000001   (§17.1)
   ══════════════════════════════════════════════════════════════════════════

   Phase E's last item. Select a word or phrase anywhere in Eravos — in a
   rupture you logged, a poem, a message she sent — and put it forward as
   shared grammar without leaving the tab.

   ── A SURFACE, NOT A STORE (§0.5, §10.1) ────────────────────────────────

   GrammarStore owns everything: the state machine, the two-sided guarantee,
   the meanings. This adds one entry path. It writes nothing itself, and
   `propose()` still lands in `proposed` — selecting a phrase and pressing a
   button cannot make it shared, exactly as before.

   ── THE HARD PART IS NOT SHOWING IT (§ trauma / ND aware) ────────────────

   An affordance that appears every time you highlight anything is a tax on
   people who select text to read, to copy, or because their hands do it. So
   the conditions are deliberately narrow and stated:

     - a real phrase, not a stray character: 2..MAX_WORDS words,
       MIN_CHARS..MAX_CHARS characters
     - not inside an input, textarea or contenteditable — selecting inside a
       field you are writing in is editing, never proposing
     - not a duplicate of something already in the vocabulary
     - dismissed by Escape, by clicking away, or by selecting anything else
     - NEVER steals focus. It is a button that appears; it does not take the
       caret, does not scroll, does not open a modal.

   If it fires when someone did not mean it, that is a bug, not a discovery
   feature. `health().shownButIgnored` counts exactly that, so the noise is
   measurable rather than assumed away (§12.5).

   ── STILL NOT AUTOMATIC (§1.1) ──────────────────────────────────────────

   This is a faster manual path, not inference. The system never decides a
   phrase is meaningful — a person selects it and presses a button. Nothing
   here reads frequency, and nothing suggests candidates.
   ══════════════════════════════════════════════════════════════════════════ */

(function (global) {
  'use strict';

  var SG_VERSION = '0.11.0';
  var SG_UUID = 'eravos-select-grammar-0001-0000-000000000001';

  var MIN_CHARS = 3;
  var MAX_CHARS = 60;
  var MAX_WORDS = 6;

  function SelectGrammar(opts) {
    opts = opts || {};
    this.store = opts.store || global.eravosGrammar || null;
    this.onPropose = opts.onPropose || null;
    this._stats = { selections: 0, offered: 0, proposed: 0, dismissed: 0, rejected: {} };
    this._lastOffer = null;
  }

  SelectGrammar.VERSION = SG_VERSION;
  SelectGrammar.UUID = SG_UUID;
  SelectGrammar.LIMITS = { MIN_CHARS: MIN_CHARS, MAX_CHARS: MAX_CHARS, MAX_WORDS: MAX_WORDS };

  function _count(stats, reason) { stats.rejected[reason] = (stats.rejected[reason] || 0) + 1; }

  /**
   * Pure. Exported so the offer rule can be reasoned about and tested
   * without a browser — the noisy-affordance question is decided here, not
   * in an event handler (§3.4).
   *
   * @param {string} text      the selected text
   * @param {object} ctx       { inEditable:boolean }
   * @returns {{offer:boolean, term?:string, reason?:string}}
   */
  SelectGrammar.prototype.evaluate = function (text, ctx) {
    ctx = ctx || {};
    this._stats.selections++;
    var t = String(text == null ? '' : text).replace(/\s+/g, ' ').trim();

    if (ctx.inEditable) { _count(this._stats, 'inEditable'); return { offer: false, reason: 'selecting inside a field you are writing in is editing, not proposing' }; }
    if (!t) { _count(this._stats, 'empty'); return { offer: false, reason: 'empty selection' }; }
    if (t.length < MIN_CHARS) { _count(this._stats, 'tooShort'); return { offer: false, reason: 'under ' + MIN_CHARS + ' characters' }; }
    if (t.length > MAX_CHARS) { _count(this._stats, 'tooLong'); return { offer: false, reason: 'over ' + MAX_CHARS + ' characters — a phrase, not a paragraph' }; }

    var words = t.split(' ').filter(Boolean);
    if (words.length > MAX_WORDS) { _count(this._stats, 'tooManyWords'); return { offer: false, reason: 'over ' + MAX_WORDS + ' words' }; }
    if (!/[a-z]/i.test(t)) { _count(this._stats, 'noLetters'); return { offer: false, reason: 'no letters in it' }; }

    if (this.store) {
      var lower = t.toLowerCase();
      var existing = this.store.entries().filter(function (e) { return e.term.toLowerCase() === lower; })[0];
      if (existing) {
        _count(this._stats, 'alreadyKnown');
        return { offer: false, reason: 'already ' + existing.state + ' in your vocabulary', existing: existing.id };
      }
    }

    this._stats.offered++;
    this._lastOffer = t;
    return { offer: true, term: t };
  };

  /** Put the selected phrase forward. Still lands in `proposed` (§ Phase E). */
  SelectGrammar.prototype.propose = function (term, origin) {
    if (!this.store) throw new Error('[select-grammar] grammar store not booted');
    var r = this.store.propose(term, '', { origin: origin || 'selection' });
    this._stats.proposed++;
    if (this.onPropose) {
      try { this.onPropose(r); }
      catch (e) { if (global.console) console.error('[select-grammar] onPropose threw: ' + e.message); }
    }
    return r;
  };

  SelectGrammar.prototype.dismiss = function () { this._stats.dismissed++; this._lastOffer = null; };

  /** §12.5 — an affordance that fires when nobody wanted it is a bug. Measure it. */
  SelectGrammar.prototype.health = function () {
    var s = this._stats;
    return {
      version: SG_VERSION,
      selections: s.selections,
      offered: s.offered,
      proposed: s.proposed,
      dismissed: s.dismissed,
      // The number that says whether this is noise. If it climbs while
      // `proposed` does not, the offer rule is too loose and should tighten.
      shownButIgnored: Math.max(0, s.offered - s.proposed - s.dismissed),
      offerRate: s.selections ? +(s.offered / s.selections).toFixed(3) : 0,
      rejectedBy: s.rejected,
      inferred: 0,        // structurally zero — this is a manual path
      status: !this.store ? 'no-grammar-store'
            : s.offered && s.offered > 6 * (s.proposed + s.dismissed + 1) ? 'noisy — tighten the rule'
            : 'healthy',
    };
  };

  /* ── browser attachment. No DOM in the logic above. ────────────────── */

  SelectGrammar.prototype.attach = function (doc) {
    doc = doc || global.document;
    if (!doc) return this;
    var self = this;
    var btn = null;

    function editable(node) {
      while (node && node !== doc.body) {
        var tag = (node.tagName || '').toLowerCase();
        if (tag === 'input' || tag === 'textarea' || node.isContentEditable) return true;
        node = node.parentNode;
      }
      return false;
    }
    function hide() { if (btn) { btn.remove(); btn = null; } }

    doc.addEventListener('selectionchange', function () {
      var sel = doc.getSelection && doc.getSelection();
      if (!sel || sel.isCollapsed) { hide(); return; }
      var r = self.evaluate(sel.toString(), { inEditable: editable(sel.anchorNode) });
      if (!r.offer) { hide(); return; }

      hide();
      btn = doc.createElement('button');
      btn.className = 'sg-offer';
      btn.type = 'button';
      btn.textContent = 'this means something between us';
      // NEVER take the caret. mousedown default is what moves focus.
      btn.addEventListener('mousedown', function (e) { e.preventDefault(); });
      btn.addEventListener('click', function () {
        try {
          self.propose(r.term);
          if (global.showToast) showToast('Put forward — it is shared when they take it up');
        } catch (e) {
          if (global.showToast) showToast(e.message);   // §1.2 named, visible
        }
        hide();
      });
      try {
        var rect = sel.getRangeAt(0).getBoundingClientRect();
        btn.style.left = Math.max(8, rect.left) + 'px';
        btn.style.top = Math.max(8, rect.top - 38) + 'px';
      } catch (e) { /* no geometry: it still appears, just unpositioned */ }
      doc.body.appendChild(btn);
    });

    doc.addEventListener('keydown', function (e) { if (e.key === 'Escape' && btn) { self.dismiss(); hide(); } });
    doc.addEventListener('scroll', hide, true);
    return this;
  };

  global.SelectGrammar = SelectGrammar;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { SelectGrammar: SelectGrammar, LIMITS: SelectGrammar.LIMITS };
  }
})(typeof window !== 'undefined' ? window : globalThis);
