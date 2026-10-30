// §12.1 brutal. §12.2 informative failure.
import assert from 'assert';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { GrammarStore } = require('../shared/eravos-grammar.js');
import { DIMENSIONS, DIMENSION_IDS } from '../shared/alk/dimensions.js';
import { MultiLattice, RESONANCE_CLASSES } from '../shared/alk/multi-lattice.js';

function mkStore(seed={}) {
  const m=new Map(Object.entries(seed));
  return {_m:m,get:(k,d)=>(m.has(k)?m.get(k):(d!==undefined?d:null)),set:(k,v)=>m.set(k,v),
          remove:k=>m.delete(k),keys:()=>[...m.keys()]};
}
// Two sides over ONE store is the wrong model for a real pair (they have
// separate devices), but it is the right model for testing the state machine:
// it lets both roles act on the same entries in one process.
const pair = () => { const s=mkStore();
  return { s, james:new GrammarStore({store:s,me:'self',send:()=>true}),
              her:new GrammarStore({store:s,me:'partner',send:()=>true}) }; };

let pass=0,fail=0;
const t=(n,f)=>{try{f();console.log('  ok  - '+n);pass++}catch(e){console.log('  FAIL- '+n+'\n        '+e.message);fail++}};

console.log('\ngrammar — two-sided by construction');
t('propose() ALWAYS lands in proposed — no argument makes it shared', () => {
  const {james}=pair();
  const r=james.propose('the quiet thing','when neither of us says it');
  assert.strictEqual(r.state,'proposed');
  assert.strictEqual(james.shared().length,0);
});
t('THE STRUCTURAL GUARANTEE — you cannot take up your own word', () => {
  const {james}=pair();
  const r=james.propose('the quiet thing');
  assert.throws(()=>james.takeUp(r.id), /the OTHER person takes it up/);
  assert.strictEqual(james.shared().length,0,'still not shared');
});
t('the other side taking it up is the ONLY path to shared', () => {
  const {james,her}=pair();
  const r=james.propose('the quiet thing','when neither of us says it');
  const u=her.takeUp(r.id,'when I go somewhere else in my head');
  assert.strictEqual(u.state,'shared');
  assert.strictEqual(james.shared().length,1);
});
t('pending() splits by who is waiting on whom', () => {
  const {james,her}=pair();
  james.propose('mine'); her.propose('theirs');
  assert.deepStrictEqual(james.pending().awaitingThem.map(e=>e.term),['mine']);
  assert.deepStrictEqual(james.pending().awaitingMe.map(e=>e.term),['theirs']);
  assert.deepStrictEqual(her.pending().awaitingMe.map(e=>e.term),['mine']);
});
t('declining is recorded as an answer, not as silence', () => {
  const {james,her}=pair();
  const r=james.propose('a word');
  const d=her.decline(r.id,'it means something else to me');
  assert.strictEqual(d.state,'retired');
  assert.ok(james.get(r.id).declined.why.length>0);
  assert.strictEqual(james.get(r.id).declined.by,'partner');
});
t('you cannot decline your own proposal either', () => {
  const {james}=pair();
  const r=james.propose('a word');
  assert.throws(()=>james.decline(r.id), /you proposed this one/);
});

console.log('\ngrammar — two meanings, never merged');
t('both sides are kept separately, with no canonical field', () => {
  const {james,her}=pair();
  const r=james.propose('drift','when I stop reaching');
  her.takeUp(r.id,'when he goes quiet and I feel it');
  const m=james.meaningsOf(r.id);
  assert.strictEqual(m.self.text,'when I stop reaching');
  assert.strictEqual(m.partner.text,'when he goes quiet and I feel it');
  assert.strictEqual(james.get(r.id).canonical,undefined,'there must be no canonical meaning field');
});
t('divergence is REPORTED, not resolved', () => {
  const {james,her}=pair();
  const r=james.propose('drift','when I stop reaching');
  her.takeUp(r.id,'something completely different');
  assert.strictEqual(james.meaningsOf(r.id).diverge,true);
  const r2=james.propose('same','identical');
  her.takeUp(r2.id,'Identical');
  assert.strictEqual(james.meaningsOf(r2.id).diverge,false,'case-insensitive, whitespace-trimmed');
});
t('§0.3 editing a meaning APPENDS — drift over time is kept', () => {
  const {james,her}=pair();
  const r=james.propose('drift','first sense');
  her.takeUp(r.id,'hers');
  james.addMeaning(r.id,'what it means now, two years on');
  const m=james.meaningsOf(r.id);
  assert.strictEqual(m.selfHistory.length,2);
  assert.strictEqual(m.self.text,'what it means now, two years on');
  assert.strictEqual(m.selfHistory[0].text,'first sense','the original must survive');
});
t('a meaning can be added by either side at any time after sharing', () => {
  const {james,her}=pair();
  const r=james.propose('drift','mine');
  her.takeUp(r.id);
  assert.strictEqual(james.meaningsOf(r.id).partner,null);
  her.addMeaning(r.id,'hers, later');
  assert.strictEqual(james.meaningsOf(r.id).partner.text,'hers, later');
});

console.log('\ngrammar — retire, revive, bounds');
t('retire is unilateral on purpose, and keeps the entry', () => {
  const {james,her}=pair();
  const r=james.propose('word'); her.takeUp(r.id);
  const x=james.retire(r.id,'we stopped using it');
  assert.strictEqual(x.state,'retired');
  assert.strictEqual(james.shared().length,0);
  assert.ok(james.get(r.id),'retired, not deleted');
});
t('re-proposing a retired word revives it as PROPOSED, needing take-up afresh', () => {
  const {james,her}=pair();
  const r=james.propose('word'); her.takeUp(r.id); james.retire(r.id);
  const again=james.propose('word');
  assert.strictEqual(again.revived,true);
  assert.strictEqual(again.state,'proposed');
  assert.strictEqual(james.shared().length,0,'reviving must not restore shared status');
});
t('a live word cannot be silently re-proposed over', () => {
  const {james}=pair();
  james.propose('word');
  assert.throws(()=>james.propose('word'), /already exists/);
});
t('empty and over-long inputs are refused, naming the limit', () => {
  const {james}=pair();
  assert.throws(()=>james.propose('   '), /a word is required/);
  assert.throws(()=>james.propose('x'.repeat(100)), /80 characters/);
  assert.throws(()=>james.propose('ok','m'.repeat(700)), /600 characters/);
});
t('§0.4 bounded — and RETIRED entries are dropped before live ones', () => {
  const {s,james,her}=pair();
  for(let i=0;i<30;i++){ const r=james.propose('w'+i); her.takeUp(r.id); }
  for(let i=0;i<10;i++) james.retire('g:w'+i);
  const list=s.get('eravors_grammar');
  assert.strictEqual(list.length,30);
  assert.strictEqual(james.shared().length,20);
});
t('unknown state on entries() throws, listing the known ones', () => {
  assert.throws(()=>pair().james.entries('vibes'), /Known: proposed, shared, retired/);
});

console.log('\ngrammar — the thing it deliberately does not do (§1.1)');
// v0.12.0 — automatic detection added at the owner's direction. The line
// moved from "never notice" to "notice, never decide", and these tests hold
// the half that still matters.
const CORPUS=[
 {text:'we keep circling the same thing',speaker:'james'},
 {text:'I think we keep circling the same thing again',speaker:'anjali'},
 {text:'the meeting is at 3pm tomorrow',speaker:'james'},
 {text:'honestly we keep circling the same thing',speaker:'james'},
 {text:'the quiet thing happened again',speaker:'anjali'},
 {text:'the quiet thing is back',speaker:'james'},
 {text:'the quiet thing, all week',speaker:'anjali'},
];
t('AUTOMATIC — a repeated phrase surfaces as a candidate', () => {
  const {james}=pair();
  const c=james.candidates(CORPUS);
  assert.strictEqual(c.auto,true);
  assert.ok(c.candidates.some(x=>x.term.includes('quiet thing')), JSON.stringify(c.candidates));
});
t('a phrase BOTH of you use ranks above one only you repeat', () => {
  const {james}=pair();
  const c=james.candidates(CORPUS.concat([
    {text:'my own private phrase here',speaker:'james'},
    {text:'my own private phrase here',speaker:'james'},
    {text:'my own private phrase here',speaker:'james'},
  ]));
  const mutual=c.candidates.filter(x=>x.mutual), solo=c.candidates.filter(x=>!x.mutual);
  if (mutual.length && solo.length) {
    assert.ok(c.candidates.indexOf(mutual[0]) < c.candidates.indexOf(solo[0]),
      'mutual must rank first: ' + c.candidates.map(x=>x.term+(x.mutual?'*':'')).join(' | '));
  }
});
t('a one-off is NOT a candidate — noticing needs repetition', () => {
  const {james}=pair();
  const c=james.candidates([{text:'said exactly once and never again',speaker:'james'}]);
  assert.deepStrictEqual(c.candidates,[]);
});
t('MANUAL-ONLY is a real mode, not a setting that quietly does nothing', () => {
  const {james}=pair();
  const c=james.candidates(CORPUS,{auto:false});
  assert.deepStrictEqual(c.candidates,[]);
  assert.strictEqual(c.auto,false);
  assert.ok(/manual only/i.test(c.reason));
});
t('THE LINE THAT DID NOT MOVE — a candidate is never proposed or shared for you', () => {
  const {james}=pair();
  const c=james.candidates(CORPUS);
  assert.ok(c.candidates.length>0,'need candidates for this test to mean anything');
  assert.deepStrictEqual(james.entries(),[],'candidates must create NO entries');
  assert.strictEqual(james.shared().length,0);
  assert.strictEqual(james.health().autoProposed,0);
  assert.strictEqual(james.health().autoShared,0);
});
t('a phrase already in the vocabulary is not re-suggested', () => {
  const {james,her}=pair();
  const r=james.propose('the quiet thing'); her.takeUp(r.id);
  const c=james.candidates(CORPUS);
  assert.ok(!c.candidates.some(x=>x.term==='the quiet thing'));
});
t('a candidate contained in a stronger one is dropped, not duplicated', () => {
  const {james}=pair();
  const c=james.candidates(CORPUS);
  const terms=c.candidates.map(x=>x.term);
  terms.forEach((a,i)=>terms.forEach((b,j)=>{
    if(i!==j) assert.ok(!(a!==b && b.includes(a) && terms.indexOf(b)<i),
      'redundant fragment kept: ' + a + ' inside ' + b);
  }));
});
t('an empty corpus says so rather than throwing', () => {
  const {james}=pair();
  assert.deepStrictEqual(james.candidates([]).candidates,[]);
  assert.deepStrictEqual(james.candidates(null).candidates,[]);
});

console.log('\ngrammar — remote application');
t('a remote proposal arrives as proposed, attributed to the other side', () => {
  const {james}=pair();
  james.applyRemote('propose',{id:'g:theirs',term:'theirs',meaning:'their sense'});
  const e=james.get('g:theirs');
  assert.strictEqual(e.state,'proposed');
  assert.strictEqual(e.proposedBy,'partner');
  assert.strictEqual(e.meanings.partner[0].text,'their sense');
});
t('a remote take-up of THEIR OWN proposal is refused — the guarantee holds over the wire', () => {
  const {james}=pair();
  james.applyRemote('propose',{id:'g:x',term:'x'});
  assert.strictEqual(james.applyRemote('takeup',{id:'g:x'}),null);
  assert.strictEqual(james.get('g:x').state,'proposed','must NOT become shared');
});
t('a remote action about an unknown entry is ignored quietly, not crashed on', () => {
  assert.strictEqual(pair().james.applyRemote('meaning',{id:'g:nope',text:'x'}),null);
});
t('an unknown remote action throws rather than being swallowed', () => {
  assert.throws(()=>pair().james.applyRemote('yolo',{id:'g:x'}), /unknown action/);
});

console.log('\ngrammar — as the lattice\'s eighth dimension');
t('grammar is in the set and declares the full contract', () => {
  // Second time a hardcoded dimension count has gone stale (lattice.test.mjs
  // had the same one at 7). A count is a fact about today; the CONTRACT is
  // the invariant. Asserting presence and shape instead, so adding a tenth
  // dimension does not break a test about grammar (§12.2).
  assert.ok(DIMENSION_IDS.includes('grammar'));
  assert.ok(DIMENSION_IDS.length >= 8, 'the set shrank: ' + DIMENSION_IDS.join(','));
  for(const k of ['threshold','means','failsWhen','extract','similarity'])
    assert.ok(DIMENSIONS.grammar[k]!==undefined,'grammar missing '+k);
});
t('grammar abstains when an utterance carries no shared term', () => {
  assert.strictEqual(DIMENSIONS.grammar.extract({dims:{}}),null);
  assert.strictEqual(DIMENSIONS.grammar.extract({dims:{grammarTerms:[]}}),null);
});
t('termsIn() finds SHARED terms only — a proposal must not link two moments', () => {
  const {james,her}=pair();
  const a=james.propose('the quiet thing');
  james.propose('not yet mutual');
  her.takeUp(a.id);
  assert.deepStrictEqual(james.termsIn('we hit the quiet thing again'),[a.id]);
  assert.deepStrictEqual(james.termsIn('this is not yet mutual'),[],'proposed terms must not match');
});
t('termsIn matches on word boundaries, not substrings', () => {
  const {james,her}=pair();
  const r=james.propose('drift'); her.takeUp(r.id);
  assert.strictEqual(james.termsIn('we drift again').length,1);
  assert.strictEqual(james.termsIn('driftwood on the beach').length,0);
});
t('SHARED_LANGUAGE is the highest-weight resonance class', () => {
  assert.ok(RESONANCE_CLASSES.SHARED_LANGUAGE);
  const w=Object.values(RESONANCE_CLASSES).map(c=>c.weight);
  assert.strictEqual(RESONANCE_CLASSES.SHARED_LANGUAGE.weight,Math.max(...w));
  assert.strictEqual(RESONANCE_CLASSES.SHARED_LANGUAGE.signal,true);
});
t('two moments sharing a grammar term resonate on the grammar dimension', () => {
  const L=new MultiLattice({dimensions:['grammar','lexical']});
  L.add({id:'n0',text:'we hit the quiet thing',dims:{grammarTerms:['g:the_quiet_thing']}});
  L.add({id:'n1',text:'completely different words entirely',dims:{grammarTerms:['g:the_quiet_thing']}});
  const p=L.resonances({minBreadth:1})[0];
  assert.ok(p,'expected a resonance');
  assert.ok(p.classes.includes('SHARED_LANGUAGE'),JSON.stringify(p.classes));
  assert.ok(p.evidential.includes('grammar'));
});
t('§12.5 health reports shared words only one side ever described', () => {
  const {james,her}=pair();
  const r=james.propose('lopsided','only mine');
  her.takeUp(r.id);
  assert.deepStrictEqual(james.health().sharedWithOnlyOneMeaning,['lopsided']);
});
t('refuses to operate with no storage rather than pretending', () => {
  const orig=globalThis.DB; delete globalThis.DB;
  assert.throws(()=>new GrammarStore(), /Refusing to operate blind/);
  if(orig) globalThis.DB=orig;
});

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail?1:0);
