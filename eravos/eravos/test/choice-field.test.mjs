// §12.1 brutal. §12.2 informative failure.
//
// HONEST SCOPE (§1.1): this drives eravos-choice-field.js against a minimal
// DOM SHIM, not a browser. It proves the component's LOGIC — that Other is
// always present and always last, that customs come first, that a skip
// records null, that mountAll reports per-target. It does NOT prove
// rendering, focus, or event ordering in a real browser. Those need the
// two-device/real-browser pass that is already open in the phasemap.
import assert from 'assert';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

/* ── minimal DOM shim ─────────────────────────────────────────────── */
function mkEl(tag) {
  const el = {
    tagName: tag.toUpperCase(), children: [], parentNode: null,
    dataset: {}, style: {}, classList: { _s: new Set(), add(c){this._s.add(c)}, contains(c){return this._s.has(c)} },
    _listeners: {}, _html: '', options: [], value: '', hidden: false,
    placeholder: '', autocomplete: '', textContent: '',
    get innerHTML() { return this._html; },
    set innerHTML(v) {
      this._html = v;
      this.options = [...String(v).matchAll(/<option value="([^"]*)"([^>]*)>(.*?)<\/option>/g)]
        .map(m => ({ value: m[1], textContent: m[3].replace(/&amp;/g,'&'), _attrs: m[2] }));
      if (this.options.length && !this.options.some(o => o.value === this.value)) this.value = this.options[0].value;
      // The first draft of this shim only parsed <option>, so the write-in's
      // own <input>/<button> were never created and querySelector('.cf-input')
      // returned null — 10 failures that were MY SHIM, not the component
      // (§0.1: the test harness is as much a suspect as the code).
      this.children = this.children.filter(c => !c._fromHTML);
      for (const m of String(v).matchAll(/<(input|button)[^>]*class="([^"]+)"[^>]*>/g)) {
        const c = mkEl(m[1]);
        m[2].split(/\s+/).forEach(cl => c.classList.add(cl));
        c._fromHTML = true;
        c.parentNode = this;
        this.children.push(c);
      }
    },
    appendChild(c) { c.parentNode = this; this.children.push(c); return c; },
    insertBefore(c) { c.parentNode = this; this.children.unshift(c); return c; },
    addEventListener(t, fn) { (this._listeners[t] = this._listeners[t] || []).push(fn); },
    dispatchEvent(ev) { (this._listeners[ev.type] || []).forEach(fn => fn(ev)); return true; },
    getAttribute() { return null; },
    focus() { this._focused = true; },
    querySelector(sel) {
      const cls = sel.replace('.', '');
      const has = c => c.classList._s.has(cls) ||
                       String(c.className || '').split(/\s+/).includes(cls);
      const hit = this.children.find(has);
      if (hit) return hit;
      for (const c of this.children) { const d = c.querySelector && c.querySelector(sel); if (d) return d; }
      return null;
    },
    _fire(type, ev) { (this._listeners[type] || []).forEach(fn => fn(ev || { type, stopImmediatePropagation(){} })); },
  };
  return el;
}
function mkSelect(id, opts) {
  const el = mkEl('select');
  el.id = id;
  el.innerHTML = opts.map(o => `<option value="${o.value}">${o.label}</option>`).join('');
  el.value = opts[0].value;
  const parent = mkEl('div');
  parent.appendChild(el);
  return el;
}
const DOC = { _byId: {},
  getElementById(id) { return DOC._byId[id] || null; },
  createElement(t) { const e = mkEl(t); if (t === 'div') { e.innerHTML = ''; } return e; } };
globalThis.document = DOC;
globalThis.Event = class { constructor(t) { this.type = t; } stopImmediatePropagation() {} };
globalThis.window = globalThis;

/* ── real modules, no mocks (§1.2) ────────────────────────────────── */
const { ChoiceRegistry } = require('../shared/eravos-choice.js');
function mkStore(){ const m=new Map(); return {get:(k,d)=>(m.has(k)?m.get(k):(d!==undefined?d:null)),set:(k,v)=>m.set(k,v)}; }
globalThis.eravosChoice = new ChoiceRegistry(mkStore());
require('../shared/eravos-choice-field.js');
const CF = globalThis.eravosChoiceField;

let pass=0,fail=0;
const t=(n,f)=>{try{f();console.log('  ok  - '+n);pass++}catch(e){console.log('  FAIL- '+n+'\n        '+e.message);fail++}};

const fresh = (id, opts) => {
  globalThis.eravosChoice = new ChoiceRegistry(mkStore());
  const el = mkSelect(id, opts);
  DOC._byId[id] = el;
  return el;
};
const FEW = [{value:'chest',label:'Chest'},{value:'throat',label:'Throat'},{value:'gut',label:'Gut'}];

console.log('\nchoice-field');
t('"Something else" is ALWAYS present and ALWAYS last', () => {
  const el = fresh('somatic', FEW);
  CF.mount('somatic', { label: 'Where?' });
  const vals = el.options.map(o => o.value);
  assert.ok(vals.includes(CF.OTHER_VALUE), 'Other missing: ' + vals.join(','));
  const other = vals.indexOf(CF.OTHER_VALUE);
  const skip = vals.indexOf(CF.SKIP_VALUE);
  assert.ok(other === vals.length - 1 || (skip === vals.length - 1 && other === vals.length - 2),
    'Other must be last (or second-last with Skip): ' + vals.join(','));
});
t('there is NO flag that removes Other — mount takes no such option', () => {
  const el = fresh('nOther', FEW);
  CF.mount('nOther', { label: 'x', other: false, allowOther: false, hideOther: true });
  assert.ok(el.options.some(o => o.value === CF.OTHER_VALUE), 'a flag must not be able to remove it');
});
t('the vocabulary is SEEDED from the markup — nothing is restated (§16.5)', () => {
  fresh('seeded', FEW);
  CF.mount('seeded', { label: 'Where?' });
  const opts = globalThis.eravosChoice.optionsFor('seeded');
  assert.deepStrictEqual(opts.map(o => o.value), ['chest','throat','gut']);
});
t('a custom option is offered FIRST, above the built-ins', () => {
  fresh('cust', FEW);
  CF.mount('cust', { label: 'Where?' });          // defines the prompt
  globalThis.eravosChoice.addCustom('cust', 'behind my eyes');
  // remount on a new element against the SAME registry — this is what a
  // returning visit to the tab actually does
  const el2 = mkSelect('cust', FEW);
  DOC._byId['cust'] = el2;
  CF.mount('cust', { label: 'Where?' });
  assert.strictEqual(el2.options[0].textContent.replace('· ',''), 'behind my eyes');
  assert.ok(el2.options.some(o => o.textContent === 'Chest'), 'built-ins must still be there');
});
t('mount() is idempotent — mounting twice does not double the Other option', () => {
  const el = fresh('idem', FEW);
  CF.mount('idem', {}); CF.mount('idem', {});
  assert.strictEqual(el.options.filter(o => o.value === CF.OTHER_VALUE).length, 1);
});
t('a search bar appears only past the scanning threshold', () => {
  const few = fresh('few', FEW);
  CF.mount('few', {});
  assert.ok(!few.parentNode.querySelector('.cf-search'), 'no search for 3 options');
  const many = fresh('many', Array.from({length:12},(_,i)=>({value:'v'+i,label:'Option '+i})));
  CF.mount('many', {});
  assert.ok(many.parentNode.querySelector('.cf-search'), 'search expected for 12 (threshold ' + CF.SEARCH_THRESHOLD + ')');
});
t('choosing Skip records null — never a default, never the first option', () => {
  const el = fresh('skip', FEW);
  let rec = null;
  CF.mount('skip', { onChange: r => { rec = r; } });
  el.value = CF.SKIP_VALUE;
  el._fire('change', { type:'change', stopImmediatePropagation(){} });
  assert.ok(rec, 'onChange must fire on skip');
  assert.strictEqual(rec.skipped, true);
  assert.strictEqual(rec.value, null);
});
t('choosing Other reveals the write-in rather than committing a value', () => {
  const el = fresh('other', FEW);
  let rec = null;
  CF.mount('other', { onChange: r => { rec = r; } });
  el.value = CF.OTHER_VALUE;
  el._fire('change', { type:'change', stopImmediatePropagation(){} });
  assert.strictEqual(rec, null, 'selecting Other must not commit anything yet');
  const wi = el.parentNode.querySelector('.cf-writein');
  assert.ok(wi && wi.hidden === false, 'the write-in must be revealed');
});
t('mount() on a missing element throws, naming it (§1.2)', () => {
  assert.throws(() => CF.mount('does-not-exist', {}), /no element "does-not-exist"/);
});
t('mount() without the registry booted throws rather than degrading quietly', () => {
  const keep = globalThis.eravosChoice;
  delete globalThis.eravosChoice;
  fresh('noreg', FEW);
  globalThis.eravosChoice = undefined;
  assert.throws(() => CF.mount('noreg', {}), /eravosChoice is not booted/);
  globalThis.eravosChoice = keep;
});
t('mountAll reports per target — mounted, not-on-page, failed (§12.5)', () => {
  globalThis.eravosChoice = new ChoiceRegistry(mkStore());
  DOC._byId = {};
  const a = mkSelect('here', FEW); DOC._byId['here'] = a; delete a.dataset.choiceField;
  const r = CF.mountAll({ here: 'Here', elsewhere: 'Not on this page' });
  assert.deepStrictEqual(r.mounted, ['here']);
  assert.deepStrictEqual(r.notOnThisPage, ['elsewhere']);
  assert.deepStrictEqual(r.failed, []);
});
t('an onChange that throws is named and does not break the field', () => {
  const el = fresh('boom', FEW);
  CF.mount('boom', { onChange: () => { throw new Error('kaboom'); } });
  el.value = CF.SKIP_VALUE;
  el._fire('change', { type:'change', stopImmediatePropagation(){} });   // must not throw out
});

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail?1:0);
