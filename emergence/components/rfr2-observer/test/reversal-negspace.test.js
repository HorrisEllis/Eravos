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
  await test('reversal: neutral text produces an honest null', async () => {
    const drawbridge = buildObserverGate();
    const flow = new Flow({}); flow.register(drawbridge);
    await flow.emit(new Cause('rfr2:observe', { text: 'the meeting is at 3pm tomorrow' }));
    const r = flow.pending.filter(e => e.type === 'rfr2:observed').slice(-1)[0];
    assert.strictEqual(r.data.reversal, null);
  });

  await test('reversal: loaded "fine" language triggers real detection', async () => {
    const drawbridge = buildObserverGate();
    const flow = new Flow({}); flow.register(drawbridge);
    await flow.emit(new Cause('rfr2:observe', {
      text: 'Oh sure, that is just fine, I am totally not upset at all',
    }));
    const r = flow.pending.filter(e => e.type === 'rfr2:observed').slice(-1)[0];
    assert.ok(r.data.reversal, 'expected a real reversal signal from loaded "fine" language');
    assert.strictEqual(r.data.reversal.type, 'contradiction');
  });

  await test('four Liminal signals stay independently selective on the same bus', async () => {
    const drawbridge = buildObserverGate();
    const flow = new Flow({}); flow.register(drawbridge);
    // text that should ONLY trip reversal, nothing else
    await flow.emit(new Cause('rfr2:observe', { text: 'Oh sure, that is just fine, I am totally not upset at all' }));
    const r = flow.pending.filter(e => e.type === 'rfr2:observed').slice(-1)[0];
    assert.ok(r.data.reversal, 'reversal should fire');
    assert.strictEqual(r.data.relationalGaps, null, 'no gaslighting language here -- should stay null');
    assert.strictEqual(r.data.oscillatory, null, 'no hot-cold cycling here -- should stay null');
    assert.strictEqual(r.data.negativeSpace, null, 'single message, no avoidance window built up yet -- should stay null');
  });

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exitCode = 1;
}

main();
