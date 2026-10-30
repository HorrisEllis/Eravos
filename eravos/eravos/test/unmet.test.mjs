// §12.1 brutal. This is the signal James named as first priority, so the
// rules that keep it honest are asserted rather than trusted.
import assert from 'assert';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { UnmetNeeds, NEEDS, DETECTORS } = require('../shared/alk/unmet-needs.js');
const fs = require('fs');

function mkStore(){ const m=new Map(); return {get:(k,d)=>(m.has(k)?m.get(k):(d!==undefined?d:null)),set:(k,v)=>m.set(k,v)}; }
let CLOCK = 1_700_000_000_000;
const DAY = 86400000;
const rig = () => new UnmetNeeds({ store: mkStore(), now: () => CLOCK });

let pass=0,fail=0;
const t=(n,f)=>{try{CLOCK=1_700_000_000_000;f();console.log('  ok  - '+n);pass++}catch(e){console.log('  FAIL- '+n+'\n        '+e.message);fail++}};

console.log('\nunmet — the gap that was permanently empty');
t('an unmet need is detected on TEXT ALONE — no camera, no circuits', () => {
  const u = rig();
  assert.deepStrictEqual(u.read('I feel so alone in this even when you are here').unmet, ['CONNECTION']);
  assert.deepStrictEqual(u.read('you dont get it, I keep explaining').unmet, ['UNDERSTANDING']);
  assert.deepStrictEqual(u.read('I am carrying all of this on my own').unmet, ['INTERDEPENDENCE']);
  assert.deepStrictEqual(u.read('I bite my tongue every time').unmet, ['AUTHENTICITY']);
  assert.deepStrictEqual(u.read('walking on eggshells around this').unmet, ['SAFETY']);
});
t('a need expressed as a LACK is both active AND unmet', () => {
  const r = rig().read('I feel so alone');
  assert.ok(r.unmet.includes('CONNECTION'));
  assert.ok(r.active.includes('CONNECTION'), 'a lack is still the need being live');
});
t('a need expressed as PRESENT is active but NOT unmet', () => {
  const r = rig().read('we laughed so much today');
  assert.ok(r.active.includes('PLAY'));
  assert.deepStrictEqual(r.unmet, [], 'having it is not lacking it');
});
t('§17.5 every detection carries the words that produced it', () => {
  const r = rig().read('I feel so alone in this');
  assert.ok(r.evidence.CONNECTION.length > 0);
  assert.ok(/alone/i.test(r.evidence.CONNECTION[0]), JSON.stringify(r.evidence));
});
t('ordinary text detects nothing', () => {
  const u = rig();
  assert.deepStrictEqual(u.read('the meeting is at 3pm tomorrow').unmet, []);
  assert.deepStrictEqual(u.read('').unmet, []);
  assert.deepStrictEqual(u.read(null).unmet, []);
});
t('every declared need has a detector, or is honestly absent from them', () => {
  Object.keys(DETECTORS).forEach(n =>
    assert.ok(NEEDS.includes(n), 'detector for unknown need: ' + n));
  Object.keys(DETECTORS).forEach(n => {
    assert.ok(DETECTORS[n].unmet && DETECTORS[n].unmet.length,
      n + ' has no unmet patterns — it could never produce the signal');
  });
});

console.log('\nunmet — it does NOT edit the vendored file');
t('htl.js is untouched and still merges with this', () => {
  const src = fs.readFileSync(new URL('../shared/alk/unmet-needs.js', import.meta.url), 'utf8');
  assert.ok(!/require\(.*htl|import.*htl/.test(src), 'it must not reach into the vendored file');
  const u = rig();
  const merged = u.merge({ active: ['CONNECTION'], unmet: ['CONNECTION'], intent: 'SEEKING_CONNECTION' },
                         u.read('I am carrying this on my own'));
  assert.deepStrictEqual(merged.unmet.sort(), ['CONNECTION', 'INTERDEPENDENCE']);
  assert.deepStrictEqual(merged.sources.circuits, ['CONNECTION'], 'face-driven kept separable');
  assert.deepStrictEqual(merged.sources.text, ['INTERDEPENDENCE'], 'text-derived kept separable');
  assert.strictEqual(merged.intent, 'SEEKING_CONNECTION', 'htl fields survive the merge');
  assert.strictEqual(u.health().vendoredFileEdited, false);
});
t('merging with NOTHING from htl still works — the gap case', () => {
  const u = rig();
  const merged = u.merge(null, u.read('I feel so alone'));
  assert.deepStrictEqual(merged.unmet, ['CONNECTION'], 'this is the case that was permanently empty');
});

console.log('\nunmet — accumulation is the signal');
t('THE POINT — a need recurring with nothing addressing it stands', () => {
  const u = rig();
  for (let i = 0; i < 5; i++) { u.record('CONNECTION', { text: 'alone again' }); CLOCK += 7 * DAY; }
  const s = u.surfacing();
  assert.strictEqual(s.length, 1);
  assert.strictEqual(s[0].need, 'CONNECTION');
  assert.strictEqual(s[0].count, 5);
  assert.ok(/nothing is logged as addressing it/.test(s[0].says), s[0].says);
});
t('thresholds are not thin — a bad fortnight does not stand', () => {
  const u = rig();
  for (let i = 0; i < 3; i++) { u.record('CONNECTION'); CLOCK += 2 * DAY; }
  assert.deepStrictEqual(u.surfacing(), [], 'three times in six days is a week, not a pattern');
  assert.strictEqual(u.standing().length, 1, 'but it is still tracked and visible');
});
t('the clock RESTARTS when something is done — history is not erased', () => {
  const u = rig();
  for (let i = 0; i < 6; i++) { u.record('CONNECTION'); CLOCK += 7 * DAY; }
  assert.strictEqual(u.surfacing().length, 1);
  u.addressed('CONNECTION', 'repair', 'r-1');
  assert.deepStrictEqual(u.surfacing(), [], 'addressed means it stops standing');
  assert.strictEqual(u.export().needs.CONNECTION.occurrences.length, 6, 'the history survives');
  for (let i = 0; i < 5; i++) { u.record('CONNECTION'); CLOCK += 7 * DAY; }
  const s = u.surfacing();
  assert.strictEqual(s[0].count, 5, 'only occurrences SINCE the act count');
  assert.ok(/since anything was logged as addressing it/.test(s[0].says));
});
t('§1.1 ADDRESSED comes only from an ACT — a reply is not an act', () => {
  const u = rig();
  assert.throws(() => u.addressed('CONNECTION', 'reply'), /is not an act.*a reply is not an act/s);
  assert.throws(() => u.addressed('CONNECTION', 'sentiment'), /not an act/);
  ['repair','care_entry','commitment','conversation','manual'].forEach(a =>
    assert.doesNotThrow(() => u.addressed('CONNECTION', a)));
  assert.strictEqual(u.health().addressedFromReply, 0);
});
t('it DESCRIBES and asks — it never names resentment or blames anyone', () => {
  const u = rig();
  for (let i = 0; i < 6; i++) { u.record('RESPECT'); CLOCK += 6 * DAY; }
  const s = u.surfacing()[0];
  const text = (s.says + ' ' + s.question).toLowerCase();
  ['resent','neglect','abus','toxic','they are','he is','she is','your fault']
    .forEach(w => assert.ok(!text.includes(w), 'contains "' + w + '" — this does not get to make that claim'));
  assert.ok(s.question.trim().endsWith('?'), 'it must hand the judgment back');
  assert.strictEqual(u.health().diagnoses, false);
});
t('recent evidence travels with it, so the count is never bare', () => {
  const u = rig();
  for (let i = 0; i < 5; i++) { u.record('CONNECTION', { text: 'utterance ' + i }); CLOCK += 7 * DAY; }
  const s = u.surfacing()[0];
  assert.strictEqual(s.evidence.length, 3, 'the last three, not all of them');
  assert.ok(s.evidence[2].includes('utterance 4'));
});
t('an unknown need is refused, listing the real ones', () => {
  assert.throws(() => rig().record('VIBES'), /Known: SAFETY, CONNECTION/);
});
t('§0.4 occurrences are bounded, and the count survives trimming', () => {
  const u = rig();
  for (let i = 0; i < 400; i++) { u.record('CONNECTION'); CLOCK += 3600000; }
  assert.ok(u.export().needs.CONNECTION.occurrences.length <= 300);
  assert.ok(u.standing()[0].count > 0);
});
t('nothing standing says so without making it a score', () => {
  const u = rig();
  assert.deepStrictEqual(u.surfacing(), []);
  assert.strictEqual(u.health().status, 'clear');
});
t('refuses to operate with no storage', () => {
  const orig = globalThis.DB; delete globalThis.DB;
  assert.throws(() => new UnmetNeeds(), /Refusing to operate blind/);
  if (orig) globalThis.DB = orig;
});

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail?1:0);
