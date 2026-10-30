// §12.1 brutal. The invariants here are the ones that would hurt someone if
// they broke, so they are asserted structurally rather than trusted.
import assert from 'assert';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { Safety, PATTERNS, RESOURCES, DISMISS_KEY } = require('../shared/eravos-safety.js');
const fs = require('fs');

function mkStore(){ const m=new Map(); return {_m:m,get:(k,d)=>(m.has(k)?m.get(k):(d!==undefined?d:null)),
  set:(k,v)=>m.set(k,v),keys:()=>[...m.keys()]}; }
const rig = (counts={}) => { const s=mkStore();
  return { s, safety: new Safety({ store:s, read:()=>counts }) }; };

let pass=0,fail=0;
const t=(n,f)=>{try{f();console.log('  ok  - '+n);pass++}catch(e){console.log('  FAIL- '+n+'\n        '+e.message);fail++}};

console.log('\nsafety — NEVER SYNCED (the rule that hurts someone if it breaks)');
t('the source contains NO transport of any kind', () => {
  const src = fs.readFileSync(new URL('../shared/eravos-safety.js', import.meta.url), 'utf8');
  const body = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  ['emitSync','syncStream','WebSocket','fetch(','XMLHttpRequest','navigator.sendBeacon','this._send','bus.emit']
    .forEach(tok => assert.ok(!body.includes(tok),
      'safety must have no way to transmit — found "' + tok + '"'));
});
t('no method on the instance can reach a bus or a socket', () => {
  const { safety } = rig();
  ['send','emit','sync','publish','post','notify'].forEach(m =>
    assert.strictEqual(typeof safety[m], 'undefined', 'a "' + m + '" method must not exist'));
  assert.strictEqual(safety.health().hasTransport, false);
  assert.strictEqual(safety.health().synced, 0);
});
t('nothing it writes is in a synced namespace', () => {
  const { s, safety } = rig({ could_not_say_it: 9 });
  safety.check(); safety.dismiss('could_not_say_it'); safety.setEnabled(false);
  s.keys().forEach(k => {
    assert.ok(!k.startsWith('shared_'), k + ' is in the SHARED namespace — it would sync');
    assert.ok(!k.startsWith('eravors_outbox'), k + ' would be replayed to the partner');
  });
});

console.log('\nsafety — never diagnoses');
t('no pattern text names a diagnosis, a label, or the other person', () => {
  const banned = ['abuse','abusive','abuser','victim','narcissis','toxic','gaslight',
                  'controlling','manipulat','your partner is','he is','she is','they are'];
  PATTERNS.forEach(p => {
    const text = (p.says + ' ' + p.question).toLowerCase();
    banned.forEach(w => assert.ok(!text.includes(w),
      'pattern "' + p.id + '" contains "' + w + '" — this software does not get to make that claim'));
  });
});
t('every pattern ends in a QUESTION, not a conclusion', () => {
  PATTERNS.forEach(p => {
    assert.ok(p.question && p.question.trim().endsWith('?'),
      p.id + ' must hand the judgment back, not make it');
  });
});
t('a raised pattern always shows the count that produced it (§17.5)', () => {
  const { safety } = rig({ ruptures_without_repair: 7 });
  const r = safety.check()[0];
  assert.ok(/counted 7/.test(r.because), r.because);
  assert.strictEqual(r.count, 7);
  assert.strictEqual(safety.health().diagnoses, false);
});

console.log('\nsafety — thresholds are high on purpose');
t('a bad week trips NOTHING', () => {
  const { safety } = rig({ ruptures_without_repair: 3, could_not_say_it: 2,
                           withdrawn_after_match: 1, one_sided_proposals: 4 });
  assert.deepStrictEqual(safety.check(), [], 'a rough patch must not be flagged');
});
t('nothing is raised on an empty install', () => {
  assert.deepStrictEqual(rig({}).safety.check(), []);
});
t('a pattern raises only AT its threshold, never below', () => {
  PATTERNS.forEach(p => {
    const under = {}; under[p.id] = p.minCount - 1;
    assert.strictEqual(rig(under).safety.check().length, 0, p.id + ' fired below threshold');
    const at = {}; at[p.id] = p.minCount;
    assert.strictEqual(rig(at).safety.check().length, 1, p.id + ' did not fire at threshold');
  });
});

console.log('\nsafety — dismissal is permanent and silent');
t('one dismissal, forever, across reloads', () => {
  const { s, safety } = rig({ could_not_say_it: 9 });
  assert.strictEqual(safety.check().length, 1);
  safety.dismiss('could_not_say_it');
  assert.strictEqual(safety.check().length, 0);
  const fresh = new Safety({ store: s, read: () => ({ could_not_say_it: 40 }) });
  assert.strictEqual(fresh.check().length, 0, 'a higher count must NOT re-raise a dismissed pattern');
});
t('there is no escalation, re-ask, or confirm path', () => {
  const { safety } = rig();
  ['escalate','remind','reAsk','confirmDismiss','undismiss'].forEach(m =>
    assert.strictEqual(typeof safety[m], 'undefined', '"' + m + '" must not exist'));
});
t('dismissing one pattern does not dismiss the others', () => {
  const { safety } = rig({ could_not_say_it: 9, ruptures_without_repair: 9 });
  safety.dismiss('could_not_say_it');
  assert.strictEqual(safety.check().length, 1);
});

console.log('\nsafety — resources');
t('resources are available with no pattern raised, to anyone', () => {
  const r = rig().safety.resources();
  assert.ok(r.items.length >= 3);
  assert.ok(/any time/.test(r.note));
});
t('no hardcoded phone number that will rot', () => {
  const src = fs.readFileSync(new URL('../shared/eravos-safety.js', import.meta.url), 'utf8');
  assert.ok(!/\b\d{3}[- ]?\d{3}[- ]?\d{4}\b/.test(src),
    'a disconnected number at the moment someone needs it is worse than none');
  assert.ok(RESOURCES.some(r => /search|find/i.test(r.detail)), 'must point at how to find a live service');
});
t('there is a "not now" that is a real exit', () => {
  assert.ok(RESOURCES.some(r => r.id === 'not_now'));
});
t('turning it OFF hides notices, not help — and says so', () => {
  const { safety } = rig({ could_not_say_it: 9 });
  const r = safety.setEnabled(false);
  assert.strictEqual(safety.check().length, 0);
  assert.ok(/Resources stay available/.test(r.note));
  assert.ok(safety.resources().items.length > 0, 'resources must still open when notices are off');
});

console.log('\nsafety — fails closed');
t('§1.2 if the counts cannot be read it raises NOTHING, rather than guessing', () => {
  const s = new Safety({ store: mkStore(), read: () => { throw new Error('storage gone'); } });
  assert.deepStrictEqual(s.check(), []);
});
t('a non-numeric count is ignored rather than coerced', () => {
  assert.deepStrictEqual(rig({ could_not_say_it: 'lots' }).safety.check(), []);
  assert.deepStrictEqual(rig({ could_not_say_it: null }).safety.check(), []);
});
t('refuses to operate with no storage', () => {
  const orig = globalThis.DB; delete globalThis.DB;
  assert.throws(() => new Safety(), /Refusing to operate blind/);
  if (orig) globalThis.DB = orig;
});

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail?1:0);
