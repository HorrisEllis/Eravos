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
  await test('conversationAnalytics is present with all 4 real fields on a single message', async () => {
    const gate = buildObserverGate();
    const flow = new Flow({}); flow.register(gate);
    await flow.emit(new Cause('rfr2:observe', { text: 'hello there' }));
    const r = flow.pending.filter(e => e.type === 'rfr2:observed').slice(-1)[0];
    const ca = r.data.conversationAnalytics;
    assert.ok(ca);
    assert.strictEqual(typeof ca.dysfluency, 'number');
    assert.strictEqual(typeof ca.coherence, 'number');
    assert.ok(Array.isArray(ca.contradictions));
    assert.ok(Array.isArray(ca.frameworks));
  });

  await test('dysfluency genuinely responds to real repeated-word/filler patterns vs clean text', async () => {
    const gate = buildObserverGate();
    const flow = new Flow({}); flow.register(gate);
    await flow.emit(new Cause('rfr2:observe', { text: 'i i think um the the thing is' }));
    const r1 = flow.pending.filter(e => e.type === 'rfr2:observed').slice(-1)[0];
    await flow.emit(new Cause('rfr2:observe', { text: 'the meeting is scheduled for tomorrow afternoon' }));
    const r2 = flow.pending.filter(e => e.type === 'rfr2:observed').slice(-1)[0];
    assert.ok(r1.data.conversationAnalytics.dysfluency > r2.data.conversationAnalytics.dysfluency,
      'text with real repeated words and fillers should score higher dysfluency than clean text');
  });

  await test('contradiction detection fires against real prior session text, not the current message alone', async () => {
    const gate = buildObserverGate();
    const flow = new Flow({}); flow.register(gate);
    await flow.emit(new Cause('rfr2:observe', { text: 'I trust you completely' }));
    const r1 = flow.pending.filter(e => e.type === 'rfr2:observed').slice(-1)[0];
    assert.strictEqual(r1.data.conversationAnalytics.contradictions.length, 0, 'no prior history yet -- nothing to contradict');

    await flow.emit(new Cause('rfr2:observe', { text: 'actually I distrust this now' }));
    const r2 = flow.pending.filter(e => e.type === 'rfr2:observed').slice(-1)[0];
    assert.strictEqual(r2.data.conversationAnalytics.contradictions.length, 1, 'distrust now vs trust earlier in this session should be caught');
    assert.strictEqual(r2.data.conversationAnalytics.contradictions[0].prevText, 'I trust you completely');
  });

  await test('coherence compares against real prior text -- topically related messages score higher than a topic jump', async () => {
    // scoreCoherence requires >= 2 prior nodes before it computes anything
    // beyond its 0.5 default -- verified directly against the real source
    // (nodes.length < 2 -> early return). 3 messages, not 2, so the 3rd
    // message's coherence check has real history to compare against.
    const gate = buildObserverGate();
    const flow = new Flow({}); flow.register(gate);
    await flow.emit(new Cause('rfr2:observe', { text: 'we need to talk about the budget planning process' }));
    await flow.emit(new Cause('rfr2:observe', { text: 'budget planning meetings happen every quarter' }));
    await flow.emit(new Cause('rfr2:observe', { text: 'the budget planning timeline needs review' }));
    const related = flow.pending.filter(e => e.type === 'rfr2:observed').slice(-1)[0];

    const flow2 = new Flow({}); const gate2 = buildObserverGate(); flow2.register(gate2);
    await flow2.emit(new Cause('rfr2:observe', { text: 'we need to talk about the budget planning process' }));
    await flow2.emit(new Cause('rfr2:observe', { text: 'budget planning meetings happen every quarter' }));
    await flow2.emit(new Cause('rfr2:observe', { text: 'my cat knocked a plant off the windowsill' }));
    const unrelated = flow2.pending.filter(e => e.type === 'rfr2:observed').slice(-1)[0];

    assert.ok(related.data.conversationAnalytics.coherence > unrelated.data.conversationAnalytics.coherence,
      'shared real vocabulary across messages should score higher coherence than an unrelated topic jump');
  });

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exitCode = 1;
}

main();
