// §12.1 brutal. §12.2 informative failure.
import assert from 'assert';
import { readFileSync } from 'fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { FeatureRegistry, NEW_FEATURES } = require('../shared/eravos-features.js');
const { Desires, ANSWERS } = require('../shared/eravos-desires.js');
const { HardTalk, STATES: HT_STATES } = require('../shared/eravos-hardtalk.js');
const { Goals } = require('../shared/eravos-goals.js');

function mkStore(){ const m=new Map(); return {_m:m,get:(k,d)=>(m.has(k)?m.get(k):(d!==undefined?d:null)),
  set:(k,v)=>m.set(k,v),keys:()=>[...m.keys()]}; }
let pass=0,fail=0;
const t=(n,f)=>{try{f();console.log('  ok  - '+n);pass++}catch(e){console.log('  FAIL- '+n+'\n        '+e.message);fail++}};

console.log('\nfeature registry — the toggles are real now');
const reg = (defs=[]) => new FeatureRegistry({ store: mkStore(), defs });
t('a disabled feature HIDES its tab — the toggle gates, it does not just store', () => {
  const r = reg();
  assert.strictEqual(r.allowTab('hardtalk').allowed, true);
  r.set('hardtalk', false);
  const a = r.allowTab('hardtalk');
  assert.strictEqual(a.allowed, false);
  assert.ok(r.hiddenTabs().includes('hardtalk'));
});
t('§1.2 a refused tab says WHY, not just "disabled"', () => {
  const r = reg();
  r.set('hardtalk', false);
  assert.ok(/turned off in Settings/.test(r.allowTab('hardtalk').reason));
});
t('2026-08-12, corrected: cocreate was ALREADY gated via kernel FEATURE_DEFS (id:cocreate, tab:cocreate, line ~11602) — a prior turn missed that, added a second entry for it here, and the resulting duplicate id crashed FeatureRegistry\'s constructor at boot (real, reported: every tab click failed with a TDZ ReferenceError once eravosFeatures never finished constructing). Fixed by removing the erroneous NEW_FEATURES entry, not by weakening the duplicate check — the check was correct; the entry was the bug.', () => {
  const r = reg();
  assert.throws(() => new FeatureRegistry({ store: mkStore(), defs: [{ id: 'x' }, { id: 'x' }] }),
    /duplicate feature id/, 'duplicate ids must still hard-fail — this is the guard that caught the real bug, keep it strict');
});
t('NEW_FEATURES ids never collide with eravos-kernel.js\'s own FEATURE_DEFS — a permanent guard for the exact bug above', () => {
  const kernelSrc = readFileSync(new URL('../shared/eravos-kernel.js', import.meta.url), 'utf8');
  const m = kernelSrc.match(/const FEATURE_DEFS = \[([\s\S]*?)\n\];/);
  assert.ok(m, 'FEATURE_DEFS block not found in eravos-kernel.js — this test needs updating, not deleting, if that array moved or got renamed');
  const kernelIds = [...m[1].matchAll(/id:\s*'([^']+)'/g)].map(x => x[1]);
  assert.ok(kernelIds.length > 20, `expected the real ~40-entry FEATURE_DEFS list, only parsed ${kernelIds.length} — regex likely stale`);
  const newFeatureIds = FeatureRegistry.NEW_FEATURES.map(f => f.id);
  const collisions = newFeatureIds.filter(id => kernelIds.includes(id));
  assert.deepStrictEqual(collisions, [], `id(s) already exist in kernel FEATURE_DEFS: ${collisions.join(', ')} — this is precisely the crash from 2026-08-12`);
});
t('§0.3 disabling HIDES — the note says the data is untouched', () => {
  const r = reg();
  const res = r.set('hardtalk', false);
  assert.ok(/not deleted/i.test(res.note), res.note);
});
t('a dependency going off takes its dependants with it, and REPORTS them', () => {
  const r = new FeatureRegistry({ store: mkStore(),
    defs: [{ id:'pairing', tab:'pairing', label:'Pairing', defaultOn:true }] });
  r.set('desires', true);
  assert.strictEqual(r.enabled('desires'), true);
  const res = r.set('pairing', false);
  assert.ok(res.cascaded.includes('desires'), JSON.stringify(res.cascaded));
  assert.strictEqual(r.enabled('desires'), false);
  assert.ok(/needs "Pairing"/.test(r.reason('desires')), r.reason('desires'));
});
t('Desires is OFF by default — a sensitive feature is opted into, not out of', () => {
  const r = reg();
  assert.strictEqual(r.enabled('desires'), false);
  assert.strictEqual(r.enabled('hardtalk'), true);
  assert.strictEqual(NEW_FEATURES.find(f=>f.id==='desires').sensitive, true);
});
t('every new feature declares id, label, summary and category — tab only if it actually gates one', () => {
  NEW_FEATURES.forEach(f => ['id','cat','label','summary'].forEach(k =>
    assert.ok(f[k], f.id + ' missing ' + k)));
  // tab is genuinely optional -- confirmed directly in allowTab()'s own
  // logic (f.tab === tabId never matches an undefined tab), so a
  // background-behavior feature that doesn't own a single tab's
  // visibility (e.g. 'emergence', a relational-analysis toggle with no
  // tab of its own) correctly has none, rather than being forced to
  // claim one it doesn't actually gate.
});
t('a duplicate feature id is a HARD ERROR, never silent precedence', () => {
  assert.throws(() => new FeatureRegistry({ store: mkStore(),
    defs: [{ id:'desires', tab:'x', label:'Clash' }] }), /duplicate feature id/);
});
t('an unknown feature cannot be toggled', () => {
  assert.throws(() => reg().set('nope', true), /unknown feature/);
});
t('unknown tabs are never gated — the registry does not own the whole app', () => {
  assert.strictEqual(reg().allowTab('vault').allowed, true);
});

console.log('\ndesires — sealed until both answer');
const pair = () => { const s=mkStore();
  return { me:new Desires({store:s,me:'self'}), them:new Desires({store:s,me:'partner'}) }; };
t('my answer is SEALED until they answer the same item', () => {
  const { me } = pair();
  const r = me.answer('rope','yes');
  assert.strictEqual(r.sealed, true);
  assert.strictEqual(me.reveal('rope').state, 'sealed');
  assert.strictEqual(me.reveal('rope').theirAnswer, null);
});
t('unanswered is a REAL state — not answering is not an answer', () => {
  const { me, them } = pair();
  them.answer('rope','yes');
  const r = me.reveal('rope');
  assert.strictEqual(r.state, 'unanswered');
  assert.strictEqual(r.theirAnswer, null, 'their answer must not leak to someone who has not answered');
});
t('MUTUAL interest reveals — and only then', () => {
  const { me, them } = pair();
  me.answer('rope','yes'); them.answer('rope','curious');
  const r = me.reveal('rope');
  assert.strictEqual(r.state, 'mutual');
  assert.strictEqual(r.theirAnswer.value, 'curious');
  assert.strictEqual(r.together, 'curious', 'the more cautious answer sets the pace');
});
t('THE CORE RULE — a no reveals NOTHING about what they said', () => {
  const { me, them } = pair();
  me.answer('x','yes'); them.answer('x','no');
  const r = me.reveal('x');
  assert.strictEqual(r.state, 'not-a-match');
  assert.strictEqual(r.theirAnswer, null, '"they said no" must not surface as leverage');
  const r2 = them.reveal('x');
  assert.strictEqual(r2.theirAnswer, null, 'and it does not leak the other way either');
});
t('a maybe against a yes is a MAYBE, and carries its conditions', () => {
  const { me, them } = pair();
  me.answer('y','yes'); them.answer('y','maybe',{conditions:'only sober, only at home'});
  const r = me.reveal('y');
  assert.strictEqual(r.together, 'maybe');
  assert.strictEqual(r.theirAnswer.conditions, 'only sober, only at home');
});
t('a LIMIT is absolute — it stops the match dead from either side', () => {
  const { me, them } = pair();
  me.answer('z','yes'); them.setLimit('z','absolutely not');
  assert.strictEqual(me.reveal('z').state, 'not-a-match');
  assert.strictEqual(me.reveal('z').theirAnswer, null);
  assert.strictEqual(them.myLimits().length, 1);
});
t('my limits are MINE — never in an export of theirs, never revealed', () => {
  const { me, them } = pair();
  me.setLimit('q','no');
  assert.strictEqual(me.myLimits().length, 1);
  assert.strictEqual(them.myLimits().length, 0);
  const ex = them.export();
  assert.strictEqual(ex.answers.q ? ex.answers.q.mine : null, null);
});
t('WITHDRAWAL is instant, unilateral, and needs no reason', () => {
  const { me, them } = pair();
  me.answer('w','yes'); them.answer('w','yes');
  assert.strictEqual(me.reveal('w').state, 'mutual');
  const r = me.withdraw('w');
  assert.ok(/No reason needed/.test(r.note));
  assert.strictEqual(me.reveal('w').state, 'not-a-match', 'it takes effect immediately');
  assert.strictEqual(them.reveal('w').theirAnswer, null, 'and they are not told what it was');
});
t('changing your mind is kept for YOU and never shown to them', () => {
  const { me, them } = pair();
  me.answer('h','curious'); me.answer('h','yes');
  const ex = me.export();
  assert.strictEqual(ex.answers.h.history.length, 1);
  assert.strictEqual(them.export().answers.h ? them.export().answers.h.mine : null, null);
});
t('an invalid answer is refused, listing the real ones', () => {
  const { me } = pair();
  assert.throws(() => me.answer('a','sure'), /not one of yes, curious, maybe, no, limit/);
  assert.throws(() => me.answer('', 'yes'), /item id is required/);
});
t('§17.3 there are NO pressure mechanics, and the absence is reported', () => {
  const { me } = pair();
  const h = me.health();
  assert.strictEqual(h.pressureMechanics, 0);
  ['notify','remind','nudge','completion','streak','score'].forEach(m =>
    assert.strictEqual(typeof me[m], 'undefined', 'a "' + m + '" method must not exist'));
  assert.ok(h.absentByDesign.length >= 5);
});

console.log('\nhardtalk — return is the growth signal');
const ht = () => new HardTalk({ store: mkStore() });
t('circling is the default and is described as a real place to stay', () => {
  const h = ht();
  const r = h.add('the money conversation');
  assert.strictEqual(r.state, 'circling');
  assert.ok(/nothing here will chase you/.test(r.note));
});
t('there is NO resolved state — subjects do not close', () => {
  assert.ok(!HT_STATES.includes('resolved'), HT_STATES.join(','));
  assert.deepStrictEqual(HT_STATES, ['circling','named','had','shelved']);
});
t('having it twice APPENDS an attempt — it is not a correction', () => {
  const h = ht();
  const id = h.add('the money conversation').id;
  h.record(id, { went:'it went sideways' });
  const r = h.record(id, { went:'hard but honest', whatChanged:'he said the number out loud' });
  assert.strictEqual(r.attempts, 2);
  assert.ok(/growth signal, not a failure/.test(r.note));
});
t('arc() shows the shape over time and computes NO success rate', () => {
  const h = ht();
  const id = h.add('the money conversation').id;
  h.record(id,{went:'sideways',easierThanLast:false});
  h.record(id,{went:'better',easierThanLast:true,whatChanged:'we agreed a number'});
  const a = h.arc(id);
  assert.strictEqual(a.attempts, 2);
  assert.strictEqual(a.saidEasier, 1);
  assert.strictEqual(a.saidHarder, 1);
  assert.deepStrictEqual(a.changes, ['we agreed a number']);
  assert.strictEqual(h.health().successRate, null, 'a success rate must be absent, not zero');
});
t('shelving is a decision, and revisit brings it back with its history', () => {
  const h = ht();
  const id = h.add('the thing about his mother').id;
  h.record(id,{went:'we did not really get into it'});
  h.shelve(id,'not this month');
  assert.strictEqual(h.get(id).state,'shelved');
  const r = h.revisit(id);
  assert.strictEqual(r.state,'circling');
  assert.strictEqual(r.priorAttempts,1,'the history survives');
});
t('subjectsReturnedTo is the number that means something', () => {
  const h = ht();
  const a = h.add('one').id, b = h.add('two').id;
  h.record(a,{}); h.record(a,{}); h.record(b,{});
  assert.strictEqual(h.health().subjectsReturnedTo, 1);
  assert.strictEqual(h.health().totalAttempts, 3);
});
t('empty and over-long subjects are refused', () => {
  const h = ht();
  assert.throws(()=>h.add('   '), /subject is required/);
  assert.throws(()=>h.add('x'.repeat(250)), /200 characters/);
});

console.log('\ngoals — ours is not something you can declare alone');
const gp = () => { const s=mkStore();
  return { me:new Goals({store:s,me:'self'}), them:new Goals({store:s,me:'partner'}) }; };
t('asking for "ours" lands in PROPOSED — writing "we should" does not make it shared', () => {
  const { me } = gp();
  const r = me.add('move in together', { owner:'ours' });
  assert.strictEqual(r.owner, 'proposed');
  assert.ok(/becomes ours when they take it up/.test(r.note));
});
t('you cannot take up your OWN proposal', () => {
  const { me } = gp();
  const id = me.add('move in together',{owner:'ours'}).id;
  assert.throws(()=>me.takeUp(id), /THEY take it up/);
  assert.strictEqual(me.get(id).owner,'proposed');
});
t('the other side taking it up is the only path to ours', () => {
  const { me, them } = gp();
  const id = me.add('move in together',{owner:'ours'}).id;
  assert.strictEqual(them.takeUp(id).owner,'ours');
  assert.strictEqual(me.get(id).owner,'ours');
});
t('finishing every step does NOT auto-complete the goal', () => {
  const { me } = gp();
  const id = me.add('save for the trip').id;
  me.addStep(id,'open the account'); 
  const g = me.get(id);
  const r = me.toggleStep(id, g.steps[0].id);
  assert.strictEqual(r.allStepsDone, true);
  assert.notStrictEqual(me.get(id).state, 'done', 'only a person says a goal is done');
});
t('§17.3 no completion percentage, no overdue — reported as absent by design', () => {
  const { me } = gp();
  me.add('a'); me.add('b');
  const h = me.health();
  assert.strictEqual(h.completionPercent, null);
  assert.strictEqual(h.overdue, null);
  assert.ok(h.absentByDesign.includes('deadlines'));
});
t('a date is a HOPE, and nothing computes lateness from it', () => {
  const { me } = gp();
  const id = me.add('the trip',{ hope: 1 }).id;   // long past
  assert.strictEqual(me.get(id).hope, 1);
  assert.strictEqual(me.health().overdue, null);
});
t('§0.3 dropping keeps the record and the reason', () => {
  const { me } = gp();
  const id = me.add('a thing').id;
  const r = me.drop(id,'we want something else now');
  assert.strictEqual(r.state,'dropped');
  assert.strictEqual(me.get(id).dropped.why,'we want something else now');
  assert.ok(/Kept, not deleted/.test(r.note));
});
t('unknown owner or state on list() throws, listing the real ones', () => {
  const { me } = gp();
  assert.throws(()=>me.list({owner:'everyone'}), /Known: mine, theirs, ours, proposed/);
  assert.throws(()=>me.list({state:'vibing'}), /Known: open, moving, done, dropped/);
});

console.log('\nall three — refuse to operate blind');
t('every engine throws without storage rather than pretending', () => {
  const orig = globalThis.DB; delete globalThis.DB;
  [Desires, HardTalk, Goals, FeatureRegistry].forEach(C =>
    assert.throws(() => new C(), /Refusing to operate blind/, C.name + ' did not refuse'));
  if (orig) globalThis.DB = orig;
});

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail?1:0);
