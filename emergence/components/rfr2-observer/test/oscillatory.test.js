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
  await test('oscillatory: neutral text produces an honest null, not a fabricated positive', async () => {
    const drawbridge = buildObserverGate();
    const flow = new Flow({}); flow.register(drawbridge);
    await flow.emit(new Cause('rfr2:observe', { text: 'the meeting is at 3pm tomorrow' }));
    const r = flow.pending.filter(e => e.type === 'rfr2:observed').slice(-1)[0];
    assert.strictEqual(r.data.oscillatory, null);
  });

  await test('oscillatory: single hot-cold message triggers real intermittent-reinforcement detection', async () => {
    const drawbridge = buildObserverGate();
    const flow = new Flow({}); flow.register(drawbridge);
    await flow.emit(new Cause('rfr2:observe', {
      text: 'I love you so much, you mean everything to me, but you always disappoint me and I cant with you',
    }));
    const r = flow.pending.filter(e => e.type === 'rfr2:observed').slice(-1)[0];
    assert.ok(r.data.oscillatory, 'expected a real oscillatory signal from co-present warmth+cold language');
    assert.strictEqual(r.data.oscillatory.subtype, 'intermittent_reinforcement');
    assert.ok(r.data.oscillatory.score > 0);
  });

  await test('oscillatory: real hot-cold cycling across multiple ticks produces sigma=OSCILLATORY regime detection', async () => {
    const drawbridge = buildObserverGate();
    const flow = new Flow({}); flow.register(drawbridge);
    const cycle = [
      'I love you so much, you are perfect',
      'you are useless and worthless, I am so disappointed',
      'I love you so much, you mean everything',
      'you always disappoint me, I cant with you',
      'I need you, come back',
      'leave me alone, too much',
      'I love you, you are wonderful',
    ];
    let lastData = null;
    for (const text of cycle) {
      await flow.emit(new Cause('rfr2:observe', { text }));
      lastData = flow.pending.filter(e => e.type === 'rfr2:observed').slice(-1)[0].data;
    }
    assert.ok(lastData.oscillatory, 'expected a real oscillatory signal after genuine cycling history');
    assert.ok(lastData.oscillatory.evidence.some(e => e.includes('OSCILLATORY')),
      'the real sigma-regime classifier should detect OSCILLATORY from the actual warmth-signal pattern, not be asserted');
  });

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exitCode = 1;
}

main();
