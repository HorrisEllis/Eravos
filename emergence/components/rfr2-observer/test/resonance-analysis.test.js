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
  await test('resonanceAnalysis is present and well-formed on real designed text', async () => {
    const gate = buildObserverGate();
    const flow = new Flow({}); flow.register(gate);
    await flow.emit(new Cause('rfr2:observe', { text: 'They always do this to me. Everyone knows that is just how things are.' }));
    const r = flow.pending.filter(e => e.type === 'rfr2:observed').slice(-1)[0];
    assert.ok(r.data.resonanceAnalysis);
    assert.ok(r.data.resonanceAnalysis.gaps, 'real logical/argumentative gap detection should be present');
    assert.ok(r.data.resonanceAnalysis.emotion.primary.emotion, 'real emotion field should be present');
    assert.strictEqual(typeof r.data.resonanceAnalysis.gap_score, 'number');
  });

  await test('gap detection genuinely fires on a weak-assumption sentence, with real evidence', async () => {
    const gate = buildObserverGate();
    const flow = new Flow({}); flow.register(gate);
    await flow.emit(new Cause('rfr2:observe', { text: 'They always do this to me. Everyone knows that is just how things are.' }));
    const r = flow.pending.filter(e => e.type === 'rfr2:observed').slice(-1)[0];
    const detectorTypes = r.data.resonanceAnalysis.gaps.detectors.map(d => d.type);
    assert.ok(detectorTypes.includes('weak_assumption'), 'a confident, unqualified, agent-less claim should trip weak_assumption detection');
  });

  await test('CALIBRATION: like affectiveField, resonanceAnalysis never returns null -- even on neutral text', async () => {
    // same real, documented pattern as affectiveField (see that test file
    // and rfr2-observer/index.js's header) -- ResonanceEngine.analyzeText()
    // always computes a composite result, verified directly, not assumed.
    const gate = buildObserverGate();
    const flow = new Flow({}); flow.register(gate);
    await flow.emit(new Cause('rfr2:observe', { text: 'the meeting is at 3pm tomorrow' }));
    const r = flow.pending.filter(e => e.type === 'rfr2:observed').slice(-1)[0];
    assert.ok(r.data.resonanceAnalysis, 'resonanceAnalysis should still be a real object on neutral text, not null');
    assert.ok(r.data.resonanceAnalysis.emotion.primary.emotion, 'a closest emotion is still computed -- documented behavior, not a bug');
  });

  await test('the engine is stateful across calls within one session -- session_id and delta_position advance', async () => {
    const gate = buildObserverGate();
    const flow = new Flow({}); flow.register(gate);
    await flow.emit(new Cause('rfr2:observe', { text: 'first message' }));
    const r1 = flow.pending.filter(e => e.type === 'rfr2:observed').slice(-1)[0];
    await flow.emit(new Cause('rfr2:observe', { text: 'second message' }));
    const r2 = flow.pending.filter(e => e.type === 'rfr2:observed').slice(-1)[0];
    assert.strictEqual(r1.data.resonanceAnalysis.session_id, r2.data.resonanceAnalysis.session_id, 'same session -- one ResonanceEngine instance per observer session, not a fresh one per call');
    assert.ok(r2.data.resonanceAnalysis.delta_position > r1.data.resonanceAnalysis.delta_position, 'delta stream position should genuinely advance across real calls');
  });

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exitCode = 1;
}

main();
