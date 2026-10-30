/* ══════════════════════════════════════════════════════════════════════════
   ERAVOS CHOICE FIELD  ·  eravos-choice-field.js  ·  v0.8.0
   UUID: eravos-choice-field-0001-0000-000000000001
   HOOK: eravos.choice:field:00001
   PARENT: eravos-choice-primitive-0001-0000-000000000001   (§17.1)
   ══════════════════════════════════════════════════════════════════════════

   Phase G. The primitive existed; this is the thing that makes retrofitting
   a prompt one call instead of bespoke markup each time.

   ── WHY A COMPONENT AND NOT 15 EDITS ────────────────────────────────────

   Phase A wired five prompts by hand. There are 28 <select> elements in the
   app. Hand-editing the rest would produce fifteen slightly different
   "Other" affordances, each with its own bug, and nothing stopping the
   sixteenth from being a plain closed list again.

   §16.7 — an abstraction has to remove more complexity than it adds. This
   removes: the Other option, the write-your-own field, remembering customs,
   offering them first, and the skip path, from every call site. It adds one
   function. It earns its place.

   ── WHAT IT GUARANTEES AT EVERY CALL SITE ───────────────────────────────

     1. "Something else" is ALWAYS the last option. `mount()` cannot omit it
        — there is no flag for that.
     2. Customs are offered FIRST, above the built-ins.
     3. A skip path exists and records null, never a default.
     4. Search appears once a prompt has more than SEARCH_THRESHOLD options,
        because scanning is the cost the Feelings grid demonstrated.

   ── WHAT IT DELIBERATELY DOES NOT COVER ─────────────────────────────────

   System selects. Filtering a vault by type, choosing particle density,
   picking an Ollama model — a closed list is CORRECT there, because those
   are properties of the software, not claims about a person. Applying the
   Other primitive to them would be noise, and noise makes the real rule
   easier to ignore. The lint (test/choice-lint.mjs) holds that line
   explicitly, with a stated reason per exemption.
   ══════════════════════════════════════════════════════════════════════════ */

(function (global) {
  'use strict';

  var FIELD_VERSION = '0.8.0';
  var FIELD_UUID = 'eravos-choice-field-0001-0000-000000000001';
  var SEARCH_THRESHOLD = 8;
  var OTHER_VALUE = '__other__';
  var SKIP_VALUE = '__skip__';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function registry() {
    if (!global.eravosChoice) {
      throw new Error('[choice-field] eravosChoice is not booted — shared/eravos-choice.js must load first');
    }
    return global.eravosChoice;
  }

  /**
   * Turn an existing <select> into a choice field, in place.
   *
   * The element keeps its id, so every existing `document.getElementById(...)
   * .value` read at the call site keeps working — §5.14, the layer is
   * replaceable without its consumers knowing. A custom answer reads back as
   * its `custom:` value, which is a real value, not a sentinel.
   *
   * @param {string|Element} target  select element or its id
   * @param {object} opts
   *   promptId  {string}   choice registry prompt id. Defined if absent,
   *                        seeded from the <option>s already in the markup.
   *   label     {string}
   *   onChange  {function} (record) -> void, the resolve() record
   */
  function mount(target, opts) {
    opts = opts || {};
    var el = typeof target === 'string' ? document.getElementById(target) : target;
    if (!el) throw new Error('[choice-field] mount(): no element "' + target + '"');
    if (el.dataset.choiceField === '1') return el;      // idempotent

    var promptId = opts.promptId || el.id;
    var reg = registry();

    // Seed the prompt from the markup that is already there, so a retrofit
    // never has to restate a vocabulary that exists (§16.5 delete before add).
    if (!reg.prompts[promptId]) {
      var seeded = [];
      for (var i = 0; i < el.options.length; i++) {
        var o = el.options[i];
        if (!o.value) continue;                          // placeholder rows
        seeded.push({ value: o.value, label: o.textContent.trim() });
      }
      reg.define({
        id: promptId,
        label: opts.label || el.getAttribute('aria-label') || promptId,
        options: seeded,
        multi: false,
        otherLabel: opts.otherLabel || 'Something else',
        otherPrompt: opts.otherPrompt || 'In your words',
      });
    }

    var def = reg.prompts[promptId];
    var wrap = document.createElement('div');
    wrap.className = 'cf-wrap';
    el.parentNode.insertBefore(wrap, el);
    wrap.appendChild(el);
    el.dataset.choiceField = '1';
    el.classList.add('cf-select');

    var search = null;
    var writein = document.createElement('div');
    writein.className = 'cf-writein';
    writein.hidden = true;
    writein.innerHTML =
      '<input class="cf-input" placeholder="' + esc(def.otherPrompt) + '" maxlength="120">' +
      '<button type="button" class="cf-save">Keep it</button>';
    wrap.appendChild(writein);

    function repaint(keepValue) {
      var prev = keepValue !== undefined ? keepValue : el.value;
      var opts2 = reg.optionsFor(promptId);
      var q = search && search.value ? search.value : '';
      var shown = q ? reg.search(promptId, q) : opts2;

      el.innerHTML =
        shown.map(function (o) {
          return '<option value="' + esc(o.value) + '"' + (o.custom ? ' data-custom="1"' : '') + '>' +
                 (o.custom ? '· ' : '') + esc(o.label) + '</option>';
        }).join('') +
        // ALWAYS last, always present. There is no flag that removes it.
        '<option value="' + OTHER_VALUE + '">' + esc(def.otherLabel) + ' …</option>' +
        (def.allowSkip ? '<option value="' + SKIP_VALUE + '">Skip this</option>' : '');

      if (prev && prev !== OTHER_VALUE && prev !== SKIP_VALUE) el.value = prev;
      if (search) search.hidden = opts2.length < SEARCH_THRESHOLD;
    }

    if (reg.optionsFor(promptId).length >= SEARCH_THRESHOLD) {
      search = document.createElement('input');
      search.className = 'cf-search';
      search.placeholder = 'search';
      search.autocomplete = 'off';
      wrap.insertBefore(search, el);
      search.addEventListener('input', function () { repaint(); });
    }

    // REAL BUG, caught by test/choice-field.test.mjs, not by review:
    // commit() dispatched a synthetic 'change', which re-entered the capture
    // handler below. With the sentinel value still selected it committed
    // again, and again — unbounded recursion in a real browser too, not just
    // under the shim. Two fixes, both structural (§5.3):
    //   1. the sentinel is cleared BEFORE dispatching, so a re-entry finds a
    //      real value and falls through
    //   2. a re-entrancy guard, because a consumer's own handler could still
    //      set the value back
    var committing = false;
    function commit(rec) {
      if (committing) return;
      committing = true;
      try {
        if (opts.onChange) {
          try { opts.onChange(rec); }
          catch (e) { if (global.console) console.error('[choice-field] onChange threw on "' + promptId + '": ' + e.message); }
        }
        el.dispatchEvent(new Event('change', { bubbles: true }));
      } finally { committing = false; }
    }

    el.addEventListener('change', function (ev) {
      if (el.value === OTHER_VALUE) {
        ev.stopImmediatePropagation();
        writein.hidden = false;
        writein.querySelector('.cf-input').focus();
        return;
      }
      if (el.value === SKIP_VALUE) {
        ev.stopImmediatePropagation();
        writein.hidden = true;
        el.value = '';   // clear the sentinel before commit re-dispatches
        // A skip records a skip. Not a default, not the first option.
        commit(reg.resolve(promptId, null));
      }
    }, true);

    function saveWritein() {
      var input = writein.querySelector('.cf-input');
      var text = input.value.trim();
      if (!text) { writein.hidden = true; repaint(''); return; }
      var rec;
      try { rec = reg.resolve(promptId, text); }
      catch (e) {
        // §1.2 — the limit is shown, not silently truncated.
        if (global.showToast) showToast(e.message); else if (global.console) console.error(e.message);
        return;
      }
      input.value = '';
      writein.hidden = true;
      repaint(rec.value.value);
      el.value = rec.value.value;
      commit(rec);
    }
    writein.querySelector('.cf-save').addEventListener('click', saveWritein);
    writein.querySelector('.cf-input').addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter') { ev.preventDefault(); saveWritein(); }
    });

    repaint();
    return el;
  }

  /** Mount many at once. Returns a per-target report — never a bare count. */
  function mountAll(spec) {
    var done = [], missing = [], failed = [];
    Object.keys(spec).forEach(function (id) {
      var conf = typeof spec[id] === 'string' ? { label: spec[id] } : spec[id];
      if (!document.getElementById(id)) { missing.push(id); return; }
      try { mount(id, conf); done.push(id); }
      catch (e) { failed.push({ id: id, error: e.message }); }
    });
    // §12.5 — a select that was expected and is not on this page is
    // information (the tab may simply not be mounted), not something to hide.
    return { mounted: done, notOnThisPage: missing, failed: failed };
  }

  global.eravosChoiceField = { mount: mount, mountAll: mountAll,
                               VERSION: FIELD_VERSION, UUID: FIELD_UUID,
                               OTHER_VALUE: OTHER_VALUE, SKIP_VALUE: SKIP_VALUE,
                               SEARCH_THRESHOLD: SEARCH_THRESHOLD };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { mount: mount, mountAll: mountAll, OTHER_VALUE: OTHER_VALUE,
                       SKIP_VALUE: SKIP_VALUE, SEARCH_THRESHOLD: SEARCH_THRESHOLD };
  }
})(typeof window !== 'undefined' ? window : globalThis);
