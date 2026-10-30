// §12.1 brutal. §12.2 every test can fail informatively.
import assert from 'assert';
import { MultiLattice, RESONANCE_CLASSES } from '../shared/alk/multi-lattice.js';
import { DIMENSIONS, DIMENSION_IDS, jaccard, cosine } from '../shared/alk/dimensions.js';
import { AlkStack } from '../shared/alk/alk-boot.js';

let pass=0,fail=0;
const t=(n,f)=>{try{f();console.log('  ok  - '+n);pass++}catch(e){console.log('  FAIL- '+n+'\n        '+e.message);fail++}};

console.log('\ndimensions');
t('EVERY dimension declares threshold, means, failsWhen, extract, similarity (§13.2)', () => {
  // Deliberately counts rather than listing: the count is asserted in
  // grammar.test.mjs where the 8th was added, so this one stays about the
  // CONTRACT and cannot go stale every time a dimension lands.
  assert.ok(DIMENSION_IDS.length >= 7, 'dimension set shrank unexpectedly: ' + DIMENSION_IDS.join(','));
  for (const id of DIMENSION_IDS) {
    const d = DIMENSIONS[id];
    for (const k of ['threshold','means','failsWhen','extract','similarity'])
      assert.ok(d[k] !== undefined, `${id} missing ${k}`);
  }
});
t('jaccard and cosine are real, not placeholders', () => {
  assert.strictEqual(jaccard(new Set(['a','b']), new Set(['a','b'])), 1);
  assert.strictEqual(jaccard(new Set(['a']), new Set(['b'])), 0);
  assert.ok(Math.abs(cosine([1,0],[1,0]) - 1) < 1e-9);
  assert.ok(Math.abs(cosine([1,0],[0,1])) < 1e-9);
});
t('§1.2 affect EXCLUDES never-observed dimensions instead of scoring them zero', () => {
  const un = [0.5,0.5,0.5,0.5,0.5];   // nothing measured
  const a = {valence:.1,arousal:.1,suppression:.1,coherence:.1,engagement:.1,uncertainty:un};
  assert.strictEqual(DIMENSIONS.affect.similarity(a,a), 0, 'all-unobserved must score 0, not 1');
  const ob = [0.04,0.04,0.04,0.04,0.04];
  const b = {...a, uncertainty:ob};
  assert.ok(DIMENSIONS.affect.similarity(b,b) > 0.9, 'observed identical deltas must match');
});
t('§5.3 affect abstains on an utterance that moved nothing', () => {
  const flat = {dims:{latentDelta:{valence:0,arousal:0,suppression:0,coherence:0,engagement:0,uncertainty:[0,0,0,0,0]}}};
  assert.strictEqual(DIMENSIONS.affect.extract(flat), null);
});
t('prosody abstains on a text-only utterance rather than faking a match', () => {
  assert.strictEqual(DIMENSIONS.prosody.extract({dims:{}}), null);
  assert.strictEqual(DIMENSIONS.prosody.extract({dims:{prosody:{sufficient:false}}}), null);
});

console.log('\nmulti-lattice');
const mk = (o={}) => new MultiLattice({dimensions:['lexical','temporal'], ...o});
t('unknown dimension throws and NAMES what is known (§1.2)', () => {
  assert.throws(()=>new MultiLattice({dimensions:['telepathy']}), /telepathy.*Known:/s);
});
t('add() without string text throws', () => {
  assert.throws(()=>mk().add({}), /string `text`/);
});
t('links NON-ADJACENT nodes — the thing a chain cannot do', () => {
  const L=mk();
  L.add({id:'n0',text:'we keep circling the same thing every week'});
  L.add({id:'n1',text:'the meeting is at three tomorrow'});
  L.add({id:'n2',text:'we keep circling the same thing again'});
  assert.ok(L.edges('lexical').some(e=>e.a==='n2'&&e.b==='n0'), 'n0<->n2 must link across n1');
});
t('no shared content -> no edge (the signal/noise filter IS the structure)', () => {
  const L=mk();
  L.add({id:'a',text:'gravity bends spacetime around mass'});
  L.add({id:'b',text:'butter melts quickly inside warm pastry'});
  assert.strictEqual(L.edges('lexical').length,0);
});
t('§5.3 temporal forms edges but does NOT vote on classification', () => {
  const L=new MultiLattice({dimensions:['lexical','temporal']});
  const ts=Date.now();
  L.add({id:'a',text:'gravity bends spacetime',ts});
  L.add({id:'b',text:'butter melts in pastry',ts:ts+1000});
  assert.ok(L.edges('temporal').length>0,'temporal edge should exist');
  assert.strictEqual(L.resonances().length,0,'temporal alone must never be signal');
});
t('lexical-only is classified SURFACE_ONLY and filtered from resonances', () => {
  const L=mk();
  L.add({id:'a',text:'circling circling circling around'});
  L.add({id:'b',text:'circling circling circling around'});
  const h=L.health();
  assert.ok(h.classCounts.SURFACE_ONLY>=1, JSON.stringify(h.classCounts));
  assert.strictEqual(L.resonances().length,0,'noise must not surface');
});
t('§0.4 bounded — eviction happens and is ANNOUNCED', () => {
  const ev=[]; const bus={on(){},emit(t,p){if(t==='alk.lattice.evicted')ev.push(p)}};
  const L=new MultiLattice({dimensions:['lexical'],maxNodes:5,bus});
  for(let i=0;i<20;i++) L.add({id:'n'+i,text:'word'+i+' shared common thing'});
  assert.strictEqual(L.nodeCount,5);
  assert.strictEqual(ev.length,15,'every eviction must emit');
  assert.ok(L.edges('lexical').every(e=>L.node(e.a)&&L.node(e.b)),'no dangling edges after eviction');
});
t('§12.5 a dead dimension is REPORTED, not hidden', () => {
  const L=new MultiLattice({dimensions:['lexical','needs']});
  L.add({id:'a',text:'circling the same thing'});
  L.add({id:'b',text:'circling the same thing'});
  assert.ok(L.health().silentDimensions.includes('needs'));
});
t('every resonance class in the table is reachable by its own test fn', () => {
  for (const [id,def] of Object.entries(RESONANCE_CLASSES)) {
    assert.strictEqual(typeof def.test,'function',id+' has no test');
    assert.strictEqual(typeof def.signal,'boolean',id+' does not declare signal/noise');
  }
});
t('§16.2 every pair carries evidence tracing back to thresholds', () => {
  const L=mk();
  L.add({id:'a',text:'circling the same thing again'});
  L.add({id:'b',text:'circling the same thing always'});
  const p=[...L._pairs.values()][0];
  assert.ok(p.evidence.length>0 && p.evidence[0].includes('>='), JSON.stringify(p.evidence));
});
t('§9.4 export is first-class and round-trips its own health', () => {
  const L=mk(); L.add({id:'a',text:'one two three four'});
  const e=L.export();
  assert.strictEqual(e.nodes.length,1);
  assert.ok(e.health && e.version && e.exportedAt);
});

console.log('\nfull stack — alk-boot');
t('boots clean with zero faults, headless, no DOM', () => {
  const s=new AlkStack().boot({});
  assert.strictEqual(s.faults.length,0,JSON.stringify(s.faults));
  assert.strictEqual(s.booted,true);
});
t('ingest() returns a fully dimensioned node', () => {
  const s=new AlkStack().boot({});
  const r=s.ingest('I miss you and I feel so alone in this.');
  for (const k of ['signalVector','signal','need','latent','latentDelta','friction','textAffect'])
    assert.ok(r.node.dims[k]!==undefined,'missing dim '+k);
  assert.strictEqual(r.node.dims.signalVector.length,15);
});
t('ingest() ignores empty and whitespace input without throwing', () => {
  const s=new AlkStack().boot({});
  assert.strictEqual(s.ingest(''),null);
  assert.strictEqual(s.ingest('   '),null);
});
t('THE HEADLINE: same need, different words, across an unrelated line', () => {
  const s=new AlkStack().boot({});
  const ts=Date.now();
  ['I feel like we keep circling the same thing every week.',
   'The meeting is at 3pm tomorrow.',
   'I miss you. I feel so alone in this even when you are here.',
   'We keep circling the same thing and I do not know how to stop it.']
   .forEach((t,i)=>s.ingest(t,{ts:ts+i*30000}));
  const res=s.lattice.resonances();
  assert.ok(res.length>0,'expected at least one resonance');
  assert.ok(res.some(p=>p.classes.includes('SAME_NEED_DIFFERENT_WORDS')),
    'expected SAME_NEED_DIFFERENT_WORDS, got: '+res.map(p=>p.classes.join('/')).join(' | '));
});
t('§0.1 the unrelated line is NOT reported as resonating with the intimate one', () => {
  const s=new AlkStack().boot({});
  const ts=Date.now();
  s.ingest('The meeting is at 3pm tomorrow.',{ts});
  s.ingest('I miss you. I feel so alone in this even when you are here.',{ts:ts+30000});
  const bad=s.lattice.resonances().filter(p=>
    (p.aText.includes('3pm')||p.bText.includes('3pm')) && (p.aText.includes('miss you')||p.bText.includes('miss you')));
  assert.strictEqual(bad.length,0,'scheduling and grief must not read as resonant: '+JSON.stringify(bad.map(p=>p.evidential)));
});
t('health() answers for the WHOLE stack in one call (§12.6)', () => {
  const s=new AlkStack().boot({});
  s.ingest('we keep circling the same thing');
  const h=s.health();
  for (const k of ['bus','voice','lattice','text','latent']) assert.ok(h[k],'health missing '+k);
});
t('a failed stage degrades the stack and is NAMED, not swallowed', () => {
  const s=new AlkStack();
  s.boot({ appStream: { onEmit(){ throw new Error('boom'); } } });
  assert.ok(s.faults.length>0 && s.faults[0].stage==='bus', JSON.stringify(s.faults));
  assert.strictEqual(s.booted,false);
  assert.strictEqual(s.degraded,true);
});


console.log('\nmulti-lattice — adaptive thresholds (v0.13.0)');
t('cold, it uses the DECLARED threshold and says it is not adapting', () => {
  const L = new MultiLattice({ dimensions:['lexical'] });
  const r = L.health().thresholds.lexical;
  assert.strictEqual(r.adaptive, false);
  assert.strictEqual(r.inUse, r.declared);
  assert.strictEqual(r.clamped, null, 'clamped must be null when cold, not false');
});
t('warm, it LEARNS a threshold from this corpus rather than a stranger\'s constant', () => {
  const L = new MultiLattice({ dimensions:['lexical'] });
  const w = ['circling same thing again','meeting three tomorrow','quiet thing back week',
             'circling same thing stop','alone even when here'];
  for (let i=0;i<25;i++) L.add({ id:'n'+i, text: w[i%w.length]+' '+i });
  const r = L.health().thresholds.lexical;
  assert.strictEqual(r.adaptive, true);
  assert.ok(r.samples >= 40, 'needs enough samples to be warm, got ' + r.samples);
  assert.notStrictEqual(r.inUse, r.declared, 'a learned threshold that equals the constant learned nothing');
});
t('§12.5 a threshold pinned at its bound REPORTS which bound', () => {
  const L = new MultiLattice({ dimensions:['lexical'] });
  for (let i=0;i<25;i++) L.add({ id:'s'+i, text:'identical shared wording every single time here' });
  const r = L.health().thresholds.lexical;
  assert.strictEqual(r.clamped, 'ceil', 'an all-similar corpus must clamp at the ceiling: ' + JSON.stringify(r));
});
t('the distribution includes scores that did NOT link — no upward ratchet', () => {
  // A threshold learned only from its own successes would climb forever.
  // The first draft of this fixture said "wholly unrelated vocabulary item
  // number N" on every line — which shares five words across every pair and
  // is therefore highly SIMILAR. The threshold climbed and the test failed
  // correctly. My fixture was the bug (§0.1: the harness is a suspect too).
  const VOCAB = ['gravity bends spacetime','butter melts pastry','tundra freezes solid',
                 'oboe reeds crack','cistern collects rainfall','magnets repel copper',
                 'yeast ferments sugar','glaciers carve valleys','lichen colonises granite',
                 'sonar maps trenches'];
  const L = new MultiLattice({ dimensions:['lexical'] });
  for (let i=0;i<30;i++) L.add({ id:'u'+i, text: VOCAB[i % VOCAB.length] + ' ' + ['alpha','beta','gamma'][i%3] });
  const r = L.health().thresholds.lexical;
  assert.ok(r.samples > L.nodeCount, 'every PAIR must be sampled, not every link: ' + r.samples);
  assert.ok(r.inUse <= r.declared,
    'a mostly-dissimilar corpus must not raise the bar: ' + r.inUse + ' vs declared ' + r.declared);
  // §12.3 — I asserted 'floor' from assumption; measured, it lands at 0.1429
  // against a floor of 0.09. It IS below the declared 0.15, which is the real
  // invariant; being clamped was my guess about how far below. Asserting the
  // property that matters instead of the number I expected.
  assert.ok(r.clamped === null || r.clamped === 'floor',
    'it may reach the floor or sit above it, but must not clamp at the ceiling: ' + r.clamped);
});
t('adaptive can be turned OFF, and then the constant is used', () => {
  const L = new MultiLattice({ dimensions:['lexical'], adaptive:false });
  for (let i=0;i<25;i++) L.add({ id:'x'+i, text:'identical shared wording every single time here' });
  const r = L.health().thresholds.lexical;
  assert.strictEqual(L.health().adaptive, false);
  assert.strictEqual(r.inUse, r.declared);
});
t('intent keeps its declared threshold — adapting a two-valued metric is meaningless', () => {
  const L = new MultiLattice({ dimensions:['intent','lexical'] });
  for (let i=0;i<25;i++) L.add({ id:'i'+i, text:'a line here '+i, dims:{ need:{ intent:'SEEKING_REPAIR' } } });
  const r = L.health().thresholds.intent;
  assert.strictEqual(r.adaptive, false);
  assert.strictEqual(r.inUse, 1);
  assert.ok(/categorical/.test(r.note || ''), 'the exception must say why');
});
t('§16.2 evidence marks a LEARNED threshold distinctly from a declared one', () => {
  const L = new MultiLattice({ dimensions:['lexical'] });
  for (let i=0;i<25;i++) L.add({ id:'e'+i, text:'circling the same thing again and again '+i });
  const pairs = [...L._pairs.values()];
  assert.ok(pairs.length, 'need pairs');
  assert.ok(pairs.some(p => p.evidence.some(e => e.endsWith('~'))),
    'a learned threshold must be marked: ' + JSON.stringify(pairs[0].evidence));
});


console.log('\nmulti-lattice — the field dimension (v0.21.0)');
t('field ABSTAINS when Emergence is not attached — never guesses at a field it cannot see', () => {
  assert.strictEqual(DIMENSIONS.field.extract({ dims: {} }), null);
  assert.strictEqual(DIMENSIONS.field.extract({ dims: { field: null } }), null);
  assert.strictEqual(DIMENSIONS.field.extract({ dims: { field: { trajectory: 'STABLE' } } }), null,
    'a field with no numbers is not a reading');
});
t('a TRAJECTORY MISMATCH caps the score — DECAYING and REPAIRING are opposite motions', () => {
  const a = { trajectory: 'DECAYING',  decay_score: 0.5, rupture_severity: 0.5, meaning_charge: 0.5 };
  const b = { trajectory: 'REPAIRING', decay_score: 0.5, rupture_severity: 0.5, meaning_charge: 0.5 };
  const s = DIMENSIONS.field.similarity(a, b);
  assert.ok(s <= 0.3, 'identical numbers must not make opposite motions look similar: ' + s);
  assert.ok(s < DIMENSIONS.field.threshold, 'and it must not link');
});
t('the same trajectory with close numbers links', () => {
  const a = { trajectory: 'DECAYING', decay_score: 0.62, rupture_severity: 0.40, meaning_charge: 0.30 };
  const b = { trajectory: 'DECAYING', decay_score: 0.60, rupture_severity: 0.44, meaning_charge: 0.28 };
  assert.ok(DIMENSIONS.field.similarity(a, b) >= DIMENSIONS.field.threshold);
});
t('THE ONE ONLY THIS DIMENSION CAN SEE — no words, no need, same field', () => {
  const L = new MultiLattice({ dimensions: ['field', 'lexical'] });
  const f = { trajectory: 'DECAYING', decay_score: 0.6, rupture_severity: 0.5, meaning_charge: 0.2 };
  L.add({ id: 'a', text: 'gravity bends spacetime around mass', dims: { field: f } });
  L.add({ id: 'b', text: 'butter melts quickly inside warm pastry', dims: { field: { ...f, decay_score: 0.62 } } });
  const p = L.resonances({ minBreadth: 1 })[0];
  assert.ok(p, 'two unrelated sentences in the same field must still relate');
  assert.ok(p.classes.includes('SAME_FIELD_DIFFERENT_EVERYTHING'), JSON.stringify(p.classes));
  assert.deepStrictEqual(p.evidential, ['field'], 'and on nothing else');
});
t('§12.5 with no Emergence the field reports SILENT rather than absent from health', () => {
  const L = new MultiLattice({ dimensions: ['field', 'lexical'] });
  L.add({ id: 'a', text: 'circling the same thing again' });
  L.add({ id: 'b', text: 'circling the same thing again' });
  assert.ok(L.health().silentDimensions.includes('field'));
  assert.ok(L.health().thresholds.field, 'it must still be reported, not omitted');
});

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail?1:0);
