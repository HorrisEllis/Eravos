/* ══════════════════════════════════════════════════════════════════════════
   ERAVOS CHOICE  ·  eravos-choice.js  ·  v0.6.0
   UUID: eravos-choice-primitive-0001-0000-000000000001
   HOOK: eravos.choice:primitive:00001
   PARENT: eravos-kernel   OWNER: shared/eravos-choice.js   (§17.1)
   ══════════════════════════════════════════════════════════════════════════

   Every prompt in Eravos that offers options offers "Other", and lets the
   person write their own — which is then kept and offered back next time.

   ── WHY THIS IS PHASE A, BENEATH EVERYTHING ELSE (§3.1) ──────────────────

   Because it is not a feature. It is a property every other prompt has to
   already have. Feelings, needs, triggers, boundaries, compass, rupture,
   struggles, the chat composer's attach menu — every one of them presents a
   closed list today. Building any of them further on a closed list means
   retrofitting all of them later.

   The spec's own non-negotiable says it plainly: "Gender, orientation, and
   values fields always accept free text over a closed list." This generalises
   that from three fields to the whole app.

   ── WHY IT MATTERS MORE THAN IT LOOKS ───────────────────────────────────

   A closed list is a claim about what a person is allowed to feel. For
   someone whose experience does not map onto the vocabulary a stranger
   chose, being handed 62 options and none of them right is not a small
   annoyance — it is the app telling them their state does not exist. The
   most common response is to pick the nearest wrong one, which then
   silently corrupts every derivation downstream that reads it (§1.2 —
   a wrong value recorded confidently is worse than an absent one).

   Concretely, so this is testable and not a sentiment:

     1. EVERY prompt built on this primitive has "Other" — no opt-out flag,
        no per-prompt override. `render()` cannot omit it.
     2. A custom option is REMEMBERED and offered first next time. Making
        someone re-type their own word every time is its own small tax.
     3. Nothing is ever forced. `allowSkip` defaults TRUE and every prompt
        can be dismissed with no value at all. A skipped prompt records
        `null`, not a guess.
     4. Custom options are PRIVATE by default. Sharing one with a partner
        is a separate, explicit act — `share: true` — never a side effect
        of writing it down.
     5. Nothing is deleted. `remove()` archives (§0.3).

   §1.1 — signal, not diagnosis. This primitive stores what someone said
   they meant. It never infers, normalises, or maps a custom entry onto a
   "real" canonical option behind their back.
   ══════════════════════════════════════════════════════════════════════════ */

(function (global) {
  'use strict';

  var CHOICE_VERSION = '0.6.0';
  var CHOICE_UUID = 'eravos-choice-primitive-0001-0000-000000000001';

  var STORE_KEY = 'eravors_custom_options';   // { promptId: [ {value,label,ts,share,archived} ] }
  var MAX_PER_PROMPT = 200;

  function defaultStore() {
    if (global.DB && typeof global.DB.get === 'function') {
      return { get: function (k, d) { return global.DB.get(k, d); },
               set: function (k, v) { global.DB.set(k, v); } };
    }
    throw new Error('[choice] no storage available — DB is not loaded. Refusing to operate blind.');
  }

  function ChoiceRegistry(store) {
    this.store = store || defaultStore();
    this.prompts = {};        // promptId -> definition
  }

  ChoiceRegistry.VERSION = CHOICE_VERSION;
  ChoiceRegistry.UUID = CHOICE_UUID;

  /**
   * Declare a prompt. §5.10 — the contract is declared, not implied.
   *
   * @param {object} def
   *   id          {string}  stable identifier, e.g. 'feeling', 'need', 'trigger.body'
   *   label       {string}  what is being asked
   *   options     {Array}   built-in options: string | {value,label,emoji,color}
   *   multi       {boolean} more than one selectable
   *   allowSkip   {boolean} DEFAULTS TRUE. Nothing is forced.
   *   otherLabel  {string}  copy for the Other affordance
   *   otherPrompt {string}  copy for the write-your-own field
   */
  ChoiceRegistry.prototype.define = function (def) {
    if (!def || !def.id) throw new Error('[choice] define(): a prompt needs an `id`');
    if (this.prompts[def.id]) {
      // SISO Design Law 1 — a collision is a hard error, never silent precedence.
      throw new Error('[choice] define(): prompt "' + def.id + '" is already defined. ' +
                      'Two definitions of one prompt is the silent-precedence shape Design Law 1 forbids.');
    }
    this.prompts[def.id] = {
      id: def.id,
      label: def.label || def.id,
      options: (def.options || []).map(normalise),
      multi: !!def.multi,
      // §"Nothing is forced" — skippable unless the caller explicitly opts out,
      // and even then the UI still renders a dismiss path.
      allowSkip: def.allowSkip !== false,
      otherLabel: def.otherLabel || 'Something else',
      otherPrompt: def.otherPrompt || 'In your words',
    };
    return this.prompts[def.id];
  };

  function normalise(o) {
    if (typeof o === 'string') return { value: o, label: o, custom: false };
    return { value: o.value != null ? o.value : o.label,
             label: o.label != null ? o.label : o.value,
             emoji: o.emoji || null, color: o.color || null, custom: false };
  }

  /** Built-in options plus this person's own, theirs first. */
  ChoiceRegistry.prototype.optionsFor = function (promptId) {
    var def = this.prompts[promptId];
    if (!def) throw new Error('[choice] optionsFor(): no prompt "' + promptId + '". Define it first.');
    var custom = this.customFor(promptId);
    return custom.concat(def.options);
  };

  ChoiceRegistry.prototype.customFor = function (promptId) {
    var all = this.store.get(STORE_KEY, {}) || {};
    return (all[promptId] || [])
      .filter(function (o) { return !o.archived; })
      .sort(function (a, b) { return (b.ts || 0) - (a.ts || 0); })
      .map(function (o) {
        return { value: o.value, label: o.label, custom: true, share: !!o.share, ts: o.ts };
      });
  };

  /**
   * Record someone's own option. Private unless explicitly shared.
   * Idempotent on value — re-adding refreshes recency, never duplicates.
   */
  ChoiceRegistry.prototype.addCustom = function (promptId, label, opts) {
    opts = opts || {};
    if (!this.prompts[promptId]) throw new Error('[choice] addCustom(): no prompt "' + promptId + '"');
    var text = String(label == null ? '' : label).trim();
    if (!text) throw new Error('[choice] addCustom(): an empty option is not an option');
    if (text.length > 120) throw new Error('[choice] addCustom(): 120 characters max (got ' + text.length + ')');

    var all = this.store.get(STORE_KEY, {}) || {};
    var list = all[promptId] || [];
    var value = 'custom:' + text.toLowerCase().replace(/\s+/g, '_').slice(0, 60);

    var existing = null;
    for (var i = 0; i < list.length; i++) if (list[i].value === value) existing = list[i];
    if (existing) {
      existing.ts = Date.now();
      existing.archived = false;
      if (opts.share !== undefined) existing.share = !!opts.share;
    } else {
      list.unshift({ value: value, label: text, ts: Date.now(),
                     share: !!opts.share, archived: false });
      if (list.length > MAX_PER_PROMPT) list = list.slice(0, MAX_PER_PROMPT);
    }
    all[promptId] = list;
    this.store.set(STORE_KEY, all);
    return { ok: true, promptId: promptId, value: value, label: text,
             shared: !!opts.share, reused: !!existing };
  };

  /** §0.3 — archived, never deleted. It can come back. */
  ChoiceRegistry.prototype.remove = function (promptId, value) {
    var all = this.store.get(STORE_KEY, {}) || {};
    var list = all[promptId] || [];
    var hit = null;
    for (var i = 0; i < list.length; i++) if (list[i].value === value) { list[i].archived = true; hit = list[i]; }
    all[promptId] = list;
    this.store.set(STORE_KEY, all);
    if (!hit) throw new Error('[choice] remove(): no custom option "' + value + '" on "' + promptId + '"');
    return { ok: true, archived: value, note: 'Archived, not deleted — §0.3. restore() brings it back.' };
  };

  ChoiceRegistry.prototype.restore = function (promptId, value) {
    var all = this.store.get(STORE_KEY, {}) || {};
    var list = all[promptId] || [];
    var hit = null;
    for (var i = 0; i < list.length; i++) if (list[i].value === value) { list[i].archived = false; hit = list[i]; }
    this.store.set(STORE_KEY, all);
    if (!hit) throw new Error('[choice] restore(): no option "' + value + '" on "' + promptId + '"');
    return { ok: true, restored: value };
  };

  /**
   * Free-text search across built-ins and customs.
   * Substring, case-insensitive, no fuzzy guessing — §1.1, it finds what is
   * there rather than deciding what someone probably meant.
   */
  ChoiceRegistry.prototype.search = function (promptId, query) {
    var q = String(query == null ? '' : query).toLowerCase().trim();
    var all = this.optionsFor(promptId);
    if (!q) return all;
    var starts = [], contains = [];
    all.forEach(function (o) {
      var l = String(o.label).toLowerCase();
      if (l.indexOf(q) === 0) starts.push(o);
      else if (l.indexOf(q) !== -1) contains.push(o);
    });
    return starts.concat(contains);
  };

  /**
   * Resolve an answer. Returns a record, never a bare value.
   * §16.2 — every answer traces back to how it was arrived at.
   */
  ChoiceRegistry.prototype.resolve = function (promptId, selection, opts) {
    opts = opts || {};
    var def = this.prompts[promptId];
    if (!def) throw new Error('[choice] resolve(): no prompt "' + promptId + '"');

    if (selection == null || (Array.isArray(selection) && !selection.length)) {
      if (!def.allowSkip && !opts.forceSkip) {
        throw new Error('[choice] resolve(): "' + promptId + '" was declared allowSkip:false. ' +
                        'Pass forceSkip to override — but reconsider: nothing in Eravos is forced.');
      }
      // A skip records a skip. NOT a default, NOT the first option, NOT a guess.
      return { promptId: promptId, skipped: true, value: null, source: 'skipped', ts: Date.now() };
    }

    var self = this;
    var many = Array.isArray(selection) ? selection : [selection];
    if (!def.multi && many.length > 1) {
      throw new Error('[choice] resolve(): "' + promptId + '" is single-select, got ' + many.length);
    }

    var resolved = many.map(function (sel) {
      var v = typeof sel === 'string' ? sel : (sel && sel.value);
      var known = self.optionsFor(promptId).filter(function (o) { return o.value === v; })[0];
      if (known) return { value: known.value, label: known.label, source: known.custom ? 'custom' : 'builtin' };
      // Unknown value: it is a fresh write-your-own. Record it, don't map it
      // onto the nearest canonical option (§1.1 — never infer on their behalf).
      var added = self.addCustom(promptId, typeof sel === 'string' ? sel : sel.label,
                                 { share: !!(sel && sel.share) });
      return { value: added.value, label: added.label, source: 'other' };
    });

    return {
      promptId: promptId, skipped: false,
      value: def.multi ? resolved : resolved[0],
      source: resolved.length === 1 ? resolved[0].source : 'mixed',
      ts: Date.now(),
    };
  };

  /** Options this person chose to share. Never everything — sharing is explicit. */
  ChoiceRegistry.prototype.shareable = function (promptId) {
    return this.customFor(promptId).filter(function (o) { return o.share; });
  };

  /** §12.6 diagnostics. */
  ChoiceRegistry.prototype.health = function () {
    var all = this.store.get(STORE_KEY, {}) || {};
    var ids = Object.keys(this.prompts);
    var counts = {}, total = 0, shared = 0, archived = 0;
    for (var p in all) {
      counts[p] = all[p].filter(function (o) { return !o.archived; }).length;
      total += counts[p];
      shared += all[p].filter(function (o) { return o.share && !o.archived; }).length;
      archived += all[p].filter(function (o) { return o.archived; }).length;
    }
    var self = this;
    return {
      version: CHOICE_VERSION,
      promptsDefined: ids.length,
      customOptions: total, sharedOptions: shared, archivedOptions: archived,
      byPrompt: counts,
      // §12.5 — a prompt nobody has ever needed to extend is information too
      promptsNeverExtended: ids.filter(function (id) { return !counts[id]; }),
      // orphaned customs whose prompt no longer exists — never silently dropped
      orphanedPrompts: Object.keys(all).filter(function (p) { return ids.indexOf(p) === -1; }),
      status: ids.length === 0 ? 'no-prompts-defined' : 'healthy',
    };
  };

  global.ChoiceRegistry = ChoiceRegistry;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { ChoiceRegistry: ChoiceRegistry, STORE_KEY: STORE_KEY };
  }
})(typeof window !== 'undefined' ? window : globalThis);
