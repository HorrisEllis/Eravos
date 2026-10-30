// §12.1 brutal. Both of these touch someone at their worst moment, so the
// invariants are asserted structurally rather than trusted.
import assert from 'assert';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { Regulation, STALE_MS, THRESHOLDS } = require('../shared/eravos-regulation.js');
const { CareProfile, SECTIONS, MOMENTS } = require('../shared/eravos-careprofile.js');
const fs = require('fs');

function mkStore(){ const m=new Map(); return {_m:m,get:(k,d)=>(m.has(k)?m.get(k):(d!==undefined?d:null)),
  set:(k,v)=>m.set(k,v),keys:()=>[...m.keys()]}; }
let CLOCK = 1_700_000_000_000;
const reg = () => new Regulation({ store: mkStore(), now: () => CLOCK });

let pass=0,fail=0;
const t=(n,f)=>{try{CLOCK=1_700_000_000_000;f();console.log('  ok  - '+n);pass++}catch(e){console.log('  FAIL- '+n+'\n        '+e.message);fail++}};

console.log('\nregulation — ADVISES, never blocks');
t('THE CORE RULE — allowed is ALWAYS true, at every level', () => {
  const r = reg();
  for (let a = 0; a <= 10; a++) for (let g = 0; g <= 10; g++) {
    const res = r.record({ activation: a, regulation: g });
    assert.strictEqual(res.advice.allowed, true,
      `blocked at activation=${a} regulation=${g} — this advises, it does not gate`);
  }
  assert.strictEqual(r.health().blocksAnything, false);
});
t('high activation advises, and hands the decision back', () => {
  const r = reg();
  const a = r.record({ activation: 9, regulation: 6 }).advice;
  assert.strictEqual(a.advise, true);
  assert.ok(/might not be the moment/.test(a.says));
  assert.ok(a.question.endsWith('?'), 'it must ask, not conclude');
  assert.deepStrictEqual(a.options, ['come back to it', 'go ahead anyway']);
  assert.ok(/You decide/.test(a.note));
});
t('low regulation advises independently of activation', () => {
  const r = reg();
  assert.strictEqual(r.record({ activation: 2, regulation: 2 }).advice.advise, true,
    'calm-and-unreachable is a real state');
});
t('activation and regulation are NOT opposites — lit-up-and-here passes', () => {
  const r = reg();
  assert.strictEqual(r.record({ activation: 7, regulation: 9 }).advice.advise, false);
});
t('an ordinary Tuesday advises nothing', () => {
  const r = reg();
  assert.strictEqual(r.record({ activation: 6, regulation: 5 }).advice.advise, false);
});
t('no reading assumes NOTHING rather than the worst', () => {
  const a = reg().advise();
  assert.strictEqual(a.allowed, true);
  assert.strictEqual(a.advise, false);
  assert.ok(/Nothing is being assumed/.test(a.note));
});

console.log('\nregulation — never synced, never attached to content');
t('the source has no transport at all', () => {
  const src = fs.readFileSync(new URL('../shared/eravos-regulation.js', import.meta.url), 'utf8');
  const body = src.replace(/\/\*[\s\S]*?\*\//g,'').replace(/^\s*\/\/.*$/gm,'');
  ['emitSync','syncStream','WebSocket','fetch(','sendBeacon','bus.emit','this._send']
    .forEach(tok => assert.ok(!body.includes(tok), 'found transport token "' + tok + '"'));
  assert.strictEqual(reg().health().hasTransport, false);
});
t('THE ONE PEOPLE MISS — a reading cannot be linked to anything said', () => {
  const r = reg();
  // there is deliberately no parameter for a message/rupture id
  r.record({ activation: 9, regulation: 2, messageId: 'm-1', ruptureId: 'r-1', text: 'what I said' });
  const e = r.export().readings[0];
  ['messageId','ruptureId','text','content','eventId'].forEach(k =>
    assert.strictEqual(e[k], undefined, 'a reading must not carry "' + k + '" — it would become ammunition'));
  assert.strictEqual(r.health().linkedToContent, false);
  assert.ok(/No reading is linked to anything you wrote/.test(r.export().note));
});
t('it records the MODE, never the content', () => {
  const r = reg();
  r.record({ activation: 9, regulation: 2, mode: 'unretractable' });
  assert.strictEqual(r.export().readings[0].mode, 'unretractable');
});
t('nothing is written to a synced namespace', () => {
  const s = mkStore(); const r = new Regulation({ store: s, now: () => CLOCK });
  r.record({ activation: 5, regulation: 5 }); r.setPrefs({ askBefore: false });
  s.keys().forEach(k => assert.ok(!k.startsWith('shared_') && !k.startsWith('eravors_outbox'), k + ' would sync'));
});

console.log('\nregulation — staleness and re-asking');
t('a reading from an hour ago is not "now"', () => {
  const r = reg();
  r.record({ activation: 9, regulation: 2 });
  assert.ok(r.current());
  CLOCK += STALE_MS + 1000;
  assert.strictEqual(r.current(), null);
});
t('a fresh reading means no re-asking', () => {
  const r = reg();
  assert.strictEqual(r.shouldAsk('unretractable'), true);
  r.record({ activation: 5, regulation: 5 });
  assert.strictEqual(r.shouldAsk('unretractable'), false);
});
t('an ungated mode is never asked about', () => {
  assert.strictEqual(reg().shouldAsk('reading the codex'), false);
});
t('turning the check off is respected', () => {
  const r = reg();
  r.setPrefs({ askBefore: false });
  assert.strictEqual(r.shouldAsk('unretractable'), false);
});
t('§12.5 advice that is always ignored is advice pitched wrong — and counted', () => {
  const r = reg();
  r.record({ activation: 9, regulation: 2 }); r.proceeded(true);
  assert.strictEqual(r.health().timesAdvised, 1);
  assert.strictEqual(r.health().wentAheadAnyway, 1);
});
t('an out-of-range rating is refused rather than clamped', () => {
  const r = reg();
  assert.throws(() => r.record({ activation: 11, regulation: 5 }), /0-10/);
  assert.throws(() => r.record({ activation: 5 }), /regulation must be 0-10/);
});

console.log('\ncare profile — authorship is absolute');
const pair = () => { const s = mkStore();
  return { me: new CareProfile({ store: s, me: 'self' }), them: new CareProfile({ store: s, me: 'partner' }) }; };
t('"When I\'m upset, I need affection" — the shape works', () => {
  const { me } = pair();
  me.add('when_then', 'I need affection, not solutions',
         { trigger: "when I'm upset", moments: ['upset','rupture'] });
  const e = me.list({ author: 'self' })[0];
  assert.strictEqual(e.trigger, "when I'm upset");
  assert.deepStrictEqual(e.moments, ['upset','rupture']);
});
t('THE CORE RULE — you cannot edit their entry', () => {
  const { me, them } = pair();
  const id = them.add('boundaries', 'I do not want to be called at work').id;
  assert.throws(() => me.edit(id, 'actually it is fine'),
    /you cannot rewrite it.*projection, not a profile/s);
  assert.strictEqual(me.list({ author: 'partner' })[0].text, 'I do not want to be called at work');
});
t('you cannot delete their entry either', () => {
  const { me, them } = pair();
  const id = them.add('dislikes', 'surprise visitors').id;
  assert.throws(() => me.remove(id), /Only the person it is about/);
});
t('authorship is not a parameter — it is always the caller', () => {
  const { me } = pair();
  const r = me.add('what_helps', 'tea', { author: 'partner' });
  assert.strictEqual(r.author, 'self', 'author must not be settable');
});
t('a remote entry is forced to THEIR authorship, never trusted from the payload', () => {
  const { me } = pair();
  me.applyRemote({ id: 'x1', section: 'boundaries', text: 'mine now', author: 'self' });
  assert.strictEqual(me.get('x1').author, 'partner');
});

console.log('\ncare profile — surfaced, not filed');
t('forMoment pulls THEIR entries for what is happening now', () => {
  const { me, them } = pair();
  them.add('when_then', 'stay close', { trigger: 'when I go quiet', moments: ['upset'] });
  them.add('gratitude', 'you always ask', { moments: ['celebration'] });
  const r = me.forMoment('upset');
  assert.strictEqual(r.length, 1);
  assert.strictEqual(r[0].text, 'stay close');
});
t('"anytime" entries surface at every moment', () => {
  const { me, them } = pair();
  them.add('how_to_hold', 'slowly');
  assert.strictEqual(me.forMoment('rupture').length, 1);
  assert.strictEqual(me.forMoment('illness').length, 1);
});
t('an unknown moment throws, listing the real ones', () => {
  assert.throws(() => pair().me.forMoment('vibing'), /Known: rupture, upset/);
});
t('an unknown section throws, listing the real ones', () => {
  assert.throws(() => pair().me.add('astrology', 'x'), /Known: when_then, how_to_hold/);
});

console.log('\ncare profile — history is the author\'s alone');
t('§0.3 editing keeps the previous version', () => {
  const { me } = pair();
  const id = me.add('what_helps', 'space').id;
  const r = me.edit(id, 'closeness, actually');
  assert.strictEqual(r.revisions, 1);
  assert.strictEqual(me.get(id).history[0].text, 'space');
  assert.ok(/worth having too/.test(r.note));
});
t('a partner NEVER sees their history — it would be a receipt', () => {
  const { me, them } = pair();
  const id = them.add('what_helps', 'space').id;
  them.edit(id, 'closeness, actually');
  const seen = me.list({ author: 'partner' })[0];
  assert.strictEqual(seen.history, undefined, '"she used to need X" turns this into a receipt');
  assert.strictEqual(seen.text, 'closeness, actually');
});
t('their history is not held locally when it arrives over the wire', () => {
  const { me } = pair();
  me.applyRemote({ id: 'y1', section: 'what_helps', text: 'now', history: [{ text: 'before' }] });
  assert.deepStrictEqual(me.get('y1').history, []);
});

console.log('\ncare profile — no completion pressure');
t('§17.3 untouched sections are information, not a to-do list', () => {
  const { me } = pair();
  me.add('gratitude', 'thank you');
  const h = me.health();
  assert.strictEqual(h.completionPercent, null);
  assert.ok(h.untouchedSections.length > 0);
  assert.strictEqual(h.editsOfTheirs, 0);
});
t('every section declares a label and a hint', () => {
  SECTIONS.forEach(s => { assert.ok(s.label, s.id + ' has no label'); assert.ok(s.hint, s.id + ' has no hint'); });
  assert.ok(SECTIONS.some(s => s.id === 'when_then'));
});
t('empty and over-long entries are refused', () => {
  const { me } = pair();
  assert.throws(() => me.add('gratitude', '   '), /empty entry/);
  assert.throws(() => me.add('gratitude', 'x'.repeat(700)), /600 characters/);
});
t('both refuse to operate with no storage', () => {
  const orig = globalThis.DB; delete globalThis.DB;
  [Regulation, CareProfile].forEach(C =>
    assert.throws(() => new C(), /Refusing to operate blind/, C.name));
  if (orig) globalThis.DB = orig;
});

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail?1:0);
