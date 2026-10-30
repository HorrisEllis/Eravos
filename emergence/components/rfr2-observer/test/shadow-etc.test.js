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
  await test('shadow/structural/existential/contrastive all stay honestly null on neutral text', async () => {
    const drawbridge = buildObserverGate();
    const flow = new Flow({}); flow.register(drawbridge);
    await flow.emit(new Cause('rfr2:observe', { text: 'the weather is nice today' }));
    const r = flow.pending.filter(e => e.type === 'rfr2:observed').slice(-1)[0];
    assert.strictEqual(r.data.shadow, null);
    assert.strictEqual(r.data.structural, null);
    assert.strictEqual(r.data.existential, null);
    assert.strictEqual(r.data.contrastive, null);
  });

  await test('existential fires real meaning_single_point_failure on identity-concentrated text', async () => {
    const drawbridge = buildObserverGate();
    const flow = new Flow({}); flow.register(drawbridge);
    await flow.emit(new Cause('rfr2:observe', {
      text: 'They always do this to me. Everyone knows that is just how things are. I am fine, everything is fine.',
    }));
    const r = flow.pending.filter(e => e.type === 'rfr2:observed').slice(-1)[0];
    assert.ok(r.data.existential, 'expected a real existential signal');
    assert.strictEqual(r.data.existential.subtype, 'meaning_single_point_failure');
  });

  await test('HONEST CALIBRATION: assumption fires on ordinary neutral declarative text -- verified, not a bug', async () => {
    // this is the real, documented difference from the other 8 signals.
    // assumption's threshold (composite < 0.18 -> null) is hardcoded and
    // not configurable -- checked its constructor. Ordinary unhedged
    // statements cross it. This test locks in that REAL behavior so a
    // future change to the calibration note doesn't go unnoticed.
    const drawbridge = buildObserverGate();
    const flow = new Flow({}); flow.register(drawbridge);
    await flow.emit(new Cause('rfr2:observe', { text: 'the meeting is at 3pm tomorrow' }));
    const r = flow.pending.filter(e => e.type === 'rfr2:observed').slice(-1)[0];
    assert.ok(r.data.assumption, 'assumption is known to fire on ordinary declarative text -- if this ever stops firing, the calibration note is stale, not fixed');
  });

  await test('all 9 Liminal signals present on the observation object, even when null', async () => {
    const drawbridge = buildObserverGate();
    const flow = new Flow({}); flow.register(drawbridge);
    await flow.emit(new Cause('rfr2:observe', { text: 'hello' }));
    const r = flow.pending.filter(e => e.type === 'rfr2:observed').slice(-1)[0];
    for (const key of ['oscillatory', 'relationalGaps', 'reversal', 'negativeSpace', 'shadow', 'assumption', 'structural', 'existential', 'contrastive']) {
      assert.ok(key in r.data, `${key} should be present on the observation object (null or real), not missing entirely`);
    }
  });

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exitCode = 1;
}

main();
