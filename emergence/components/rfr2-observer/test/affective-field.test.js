'use strict';
const assert = require('assert');
const { buildObserverGate } = require('../index.js');
const { Cause, Flow } = require('../../../../warp');

let pass = 0, fail = 0;
async function test(name, fn) {
  try { await fn(); pass++; console.log(`  ok  - ${name}`); }
  catch (e) { fail++; console.log(`  FAIL - ${name}\n         ${e.message}`); }
}

async function main() {
  await test('affectiveField is present and well-formed on real designed text', async () => {
    const drawbridge = buildObserverGate();
    const flow = new Flow({}); flow.register(drawbridge);
    await flow.emit(new Cause('rfr2:observe', { text: 'I feel like we keep circling the same thing and I dont know how to name it.' }));
    const r = flow.pending.filter(e => e.type === 'rfr2:observed').slice(-1)[0];
    assert.ok(r.data.affectiveField);
    assert.ok(r.data.affectiveField.emotion.primary.emotion);
    assert.ok(r.data.affectiveField.theta);
    assert.strictEqual(typeof r.data.affectiveField.coherence, 'number');
  });

  await test('CRITICAL CALIBRATION: unlike every other signal, affectiveField is NEVER null -- even on totally neutral text', async () => {
    // this is the one signal that has no abstention mechanism -- verified
    // directly against the module's own source (thetaFromText always
    // produces a Theta from defaults, analyzePoint always finds a
    // nearest basin). This test locks that real, documented behavior
    // in -- if this signal is ever made to return null on neutral text,
    // the calibration note in rfr2-observer/index.js's header is stale.
    const drawbridge = buildObserverGate();
    const flow = new Flow({}); flow.register(drawbridge);
    await flow.emit(new Cause('rfr2:observe', { text: 'the meeting is at 3pm tomorrow' }));
    const r = flow.pending.filter(e => e.type === 'rfr2:observed').slice(-1)[0];
    assert.ok(r.data.affectiveField, 'affectiveField should still be a real object, not null, even on totally neutral text');
    assert.ok(r.data.affectiveField.emotion.primary.emotion, 'a closest emotion should still be computed -- this is the honest, documented behavior, not a bug');
  });

  await test('different texts produce genuinely different fields WHEN they contain the module\'s real trigger vocabulary', async () => {
    // IMPORTANT LIMITATION, found while writing this test, not assumed:
    // thetaFromText() only responds to a narrow set of meta-linguistic
    // marker words (certainty/hedge/causal/intimacy/empathy/intensity --
    // see its regex lists in the source) -- NOT common emotion words.
    // "happy", "grateful", "furious", "broken" hit none of its six
    // trigger lists, so two clearly opposite-valence sentences using
    // only those words produce the IDENTICAL default Theta. Verified
    // directly. This test instead uses text that actually contains the
    // real trigger vocabulary (certainty vs. hedging words) to prove the
    // mechanism itself works -- see rfr2-observer/index.js's header for
    // the full honest note on this blind spot.
    const drawbridge = buildObserverGate();
    const flow = new Flow({}); flow.register(drawbridge);
    await flow.emit(new Cause('rfr2:observe', { text: 'I definitely know this is certain, it is a proven fact' } ));
    const r1 = flow.pending.filter(e => e.type === 'rfr2:observed').slice(-1)[0];
    await flow.emit(new Cause('rfr2:observe', { text: 'maybe perhaps I think this seems uncertain, I dont know' } ));
    const r2 = flow.pending.filter(e => e.type === 'rfr2:observed').slice(-1)[0];
    assert.notDeepStrictEqual(r1.data.affectiveField.theta, r2.data.affectiveField.theta,
      'certainty-marked vs hedge-marked text should produce genuinely different C (certainty) values');
  });

  await test('KNOWN BLIND SPOT: common emotion words alone do not differentiate the field -- verified, not assumed', async () => {
    const drawbridge = buildObserverGate();
    const flow = new Flow({}); flow.register(drawbridge);
    await flow.emit(new Cause('rfr2:observe', { text: 'I am so happy and grateful for you' } ));
    const r1 = flow.pending.filter(e => e.type === 'rfr2:observed').slice(-1)[0];
    await flow.emit(new Cause('rfr2:observe', { text: 'I am furious and this is completely broken' } ));
    const r2 = flow.pending.filter(e => e.type === 'rfr2:observed').slice(-1)[0];
    assert.deepStrictEqual(r1.data.affectiveField.theta, r2.data.affectiveField.theta,
      'this documents a real, verified limitation -- if this ever fails, the module started responding to common emotion words and this note is stale, which would be worth knowing');
  });

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exitCode = 1;
}

main();
