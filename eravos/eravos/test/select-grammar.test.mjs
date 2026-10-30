// §12.1 brutal. §12.2 informative failure.
//
// HONEST SCOPE (§1.1): this drives the OFFER RULE, which is where the
// noisy-affordance question is actually decided (§3.4 — the logic is pure and
// testable without a browser). It does not test DOM positioning or the
// selectionchange handler; those need a real browser pass.
import assert from 'assert';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { SelectGrammar, LIMITS } = require('../shared/eravos-select-grammar.js');
const { GrammarStore } = require('../shared/eravos-grammar.js');

function mkStore(){ const m=new Map(); return {get:(k,d)=>(m.has(k)?m.get(k):(d!==undefined?d:null)),set:(k,v)=>m.set(k,v)}; }
const rig = () => {
  const s = mkStore();
  const james = new GrammarStore({ store: s, me: 'self', send: () => true });
  const her   = new GrammarStore({ store: s, me: 'partner', send: () => true });
  return { sg: new SelectGrammar({ store: james }), james, her };
};

let pass=0,fail=0;
const t=(n,f)=>{try{f();console.log('  ok  - '+n);pass++}catch(e){console.log('  FAIL- '+n+'\n        '+e.message);fail++}};

console.log('\nselect → grammar — the offer rule');
t('a real phrase is offered', () => {
  const { sg } = rig();
  const r = sg.evaluate('the quiet thing', {});
  assert.strictEqual(r.offer, true);
  assert.strictEqual(r.term, 'the quiet thing');
});
t('whitespace is normalised, not preserved verbatim', () => {
  const { sg } = rig();
  assert.strictEqual(sg.evaluate('  the   quiet \n thing  ', {}).term, 'the quiet thing');
});
t('selecting INSIDE a field you are writing in is editing, never proposing', () => {
  const { sg } = rig();
  const r = sg.evaluate('the quiet thing', { inEditable: true });
  assert.strictEqual(r.offer, false);
  assert.ok(/editing, not proposing/.test(r.reason), r.reason);
});
t('a stray character does not fire the affordance', () => {
  const { sg } = rig();
  assert.strictEqual(sg.evaluate('a', {}).offer, false);
  assert.strictEqual(sg.evaluate('', {}).offer, false);
  assert.strictEqual(sg.evaluate('   ', {}).offer, false);
});
t('a paragraph does not fire it — this is a phrase, not a quote tool', () => {
  const { sg } = rig();
  const long = 'x'.repeat(LIMITS.MAX_CHARS + 1);
  assert.strictEqual(sg.evaluate(long, {}).offer, false);
  const many = Array.from({length: LIMITS.MAX_WORDS + 2}, (_,i)=>'word'+i).join(' ');
  const r = sg.evaluate(many, {});
  assert.strictEqual(r.offer, false);
  assert.ok(/over \d+ words/.test(r.reason), r.reason);
});
t('punctuation or digits alone do not fire it', () => {
  const { sg } = rig();
  assert.strictEqual(sg.evaluate('— — —', {}).offer, false);
  assert.strictEqual(sg.evaluate('3.14159', {}).offer, false);
});
t('a phrase already in the vocabulary is NOT re-offered, and says which state', () => {
  const { sg, james, her } = rig();
  const p = james.propose('the quiet thing');
  let r = sg.evaluate('The Quiet Thing', {});
  assert.strictEqual(r.offer, false);
  assert.ok(/already proposed/.test(r.reason), r.reason);
  assert.strictEqual(r.existing, p.id);
  her.takeUp(p.id);
  assert.ok(/already shared/.test(sg.evaluate('the quiet thing', {}).reason));
});
t('boundary values: exactly at the limits still offers', () => {
  const { sg } = rig();
  assert.strictEqual(sg.evaluate('abc', {}).offer, true, 'MIN_CHARS is inclusive');
  assert.strictEqual(sg.evaluate('x'.repeat(LIMITS.MAX_CHARS), {}).offer, true, 'MAX_CHARS is inclusive');
  const exact = Array.from({length: LIMITS.MAX_WORDS}, (_,i)=>'w'+i).join(' ');
  assert.strictEqual(sg.evaluate(exact, {}).offer, true, 'MAX_WORDS is inclusive');
});

console.log('\nselect → grammar — still not automatic (§1.1)');
t('proposing lands in PROPOSED — a selection cannot make something shared', () => {
  const { sg, james } = rig();
  const r = sg.propose('the quiet thing');
  assert.strictEqual(r.state, 'proposed');
  assert.strictEqual(james.shared().length, 0);
});
t('origin is recorded as `selection`, so provenance is traceable (§17.5)', () => {
  const { sg, james } = rig();
  const r = sg.propose('the quiet thing');
  assert.strictEqual(james.get(r.id).origin, 'selection');
});
t('nothing here infers — health().inferred is structurally 0', () => {
  const { sg } = rig();
  for (let i=0;i<50;i++) sg.evaluate('phrase number '+i, {});
  assert.strictEqual(sg.health().inferred, 0);
});
t('proposing without a store throws rather than silently doing nothing', () => {
  const sg = new SelectGrammar({ store: null });
  assert.throws(() => sg.propose('x'), /grammar store not booted/);
  assert.strictEqual(sg.health().status, 'no-grammar-store');
});

console.log('\nselect → grammar — the noise is MEASURED, not assumed away (§12.5)');
t('every rejection reason is counted by name', () => {
  const { sg } = rig();
  sg.evaluate('a', {});
  sg.evaluate('x'.repeat(200), {});
  sg.evaluate('ok phrase', { inEditable: true });
  const by = sg.health().rejectedBy;
  assert.strictEqual(by.tooShort, 1);
  assert.strictEqual(by.tooLong, 1);
  assert.strictEqual(by.inEditable, 1);
});
t('offerRate is reported — if it is high, the rule is too loose', () => {
  const { sg } = rig();
  ['a','b','','  ','x'.repeat(99)].forEach(s => sg.evaluate(s, {}));
  sg.evaluate('the quiet thing', {});
  const h = sg.health();
  assert.strictEqual(h.selections, 6);
  assert.strictEqual(h.offered, 1);
  assert.ok(h.offerRate < 0.2, 'ordinary selecting must mostly NOT offer, got ' + h.offerRate);
});
t('an affordance shown and never acted on is counted as such', () => {
  const { sg } = rig();
  for (let i=0;i<10;i++) sg.evaluate('phrase '+i, {});
  assert.strictEqual(sg.health().shownButIgnored, 10);
  assert.strictEqual(sg.health().status, 'noisy — tighten the rule');
});
t('dismissing and proposing both clear the ignored count', () => {
  const { sg } = rig();
  sg.evaluate('one two', {}); sg.propose('one two');
  sg.evaluate('three four', {}); sg.dismiss();
  assert.strictEqual(sg.health().shownButIgnored, 0);
  assert.strictEqual(sg.health().status, 'healthy');
});
t('an onPropose that throws is named and does not break the proposal', () => {
  const { sg, james } = rig();
  sg.onPropose = () => { throw new Error('boom'); };
  const r = sg.propose('still works');
  assert.strictEqual(r.state, 'proposed');
  assert.ok(james.get(r.id));
});

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail?1:0);
