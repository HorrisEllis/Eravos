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
  await test('relationalGaps: neutral text produces an honest null', async () => {
    const drawbridge = buildObserverGate();
    const flow = new Flow({}); flow.register(drawbridge);
    await flow.emit(new Cause('rfr2:observe', { text: 'the meeting is at 3pm tomorrow' }));
    const r = flow.pending.filter(e => e.type === 'rfr2:observed').slice(-1)[0];
    assert.strictEqual(r.data.relationalGaps, null);
  });

  await test('relationalGaps: real gaslighting language triggers event_denial detection', async () => {
    const drawbridge = buildObserverGate();
    const flow = new Flow({}); flow.register(drawbridge);
    await flow.emit(new Cause('rfr2:observe', {
      text: 'That never happened, you are imagining things, everyone thinks you are too sensitive',
    }));
    const r = flow.pending.filter(e => e.type === 'rfr2:observed').slice(-1)[0];
    assert.ok(r.data.relationalGaps, 'expected a real relational-gap signal from gaslighting language');
    assert.strictEqual(r.data.relationalGaps.subtype, 'event_denial');
    assert.ok(r.data.relationalGaps.evidence.some(e => e.startsWith('consensus_attack')),
      'the consensus-attack layer ("everyone thinks you") should also be detected, not just event_denial');
  });

  await test('oscillatory and relationalGaps both attach to the same Liminal bus without interfering', async () => {
    const drawbridge = buildObserverGate();
    const flow = new Flow({}); flow.register(drawbridge);
    // hot-cold cycling text that ALSO contains gaslighting language
    await flow.emit(new Cause('rfr2:observe', {
      text: 'I love you so much but that never happened, you always disappoint me and are imagining things',
    }));
    const r = flow.pending.filter(e => e.type === 'rfr2:observed').slice(-1)[0];
    assert.ok(r.data.relationalGaps, 'relational gaps should still fire');
    assert.ok(r.data.oscillatory, 'oscillatory should also fire on the same warm+cold text -- one bus, two independent real detectors');
  });

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exitCode = 1;
}

main();
