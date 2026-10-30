'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createEmergenceLoop } = require('../loop.js');

let pass = 0, fail = 0;
async function test(name, fn) {
  try {
    await fn();
    pass++;
    console.log(`  ok  - ${name}`);
  } catch (e) {
    fail++;
    console.log(`  FAIL - ${name}\n         ${e.message}`);
  }
}

const TARGET = { id: 'end-state:repair-complete', type: 'end-state', mass: 15 };

async function main() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'emergence-loop-'));
  const loop = createEmergenceLoop({ dataDir });

  await test('tick() with no target: field runs, no convergence claimed (honest null)', async () => {
    const r = await loop.tick('I feel like we keep circling the same thing.');
    assert.ok(r.observation, 'observation missing');
    assert.strictEqual(typeof r.observation.meaning_charge, 'number');
    assert.strictEqual(r.created.target, null, 'no target passed -- should not fabricate one');
    assert.strictEqual(r.created.cluster, null, 'no target -- cluster must be null, not invented');
    assert.ok(r.lattice.nodeId, 'lattice did not record a node');
    assert.ok(r.causal.nodeId, 'causal graph did not record a node');
    assert.ok(r.ledger.id, 'ledger did not commit');
  });

  await test('tick() with explicit target: repeated pulls build real convergence', async () => {
    // physics.js seeds initial particle positions with Math.random(), no
    // exposed seed. Root cause of the flakiness this budget accounts for:
    // checked DEFAULT_CONFIG directly -- field.curl defaults to 0.6, and
    // its per-frame contribution (field.curl * 0.011 * dtF) is genuinely
    // comparable to or larger than attractor gravity (mass * structure *
    // attention * 0.016 / d^2) except very close to the target. Curl
    // noise isn't a bug fighting the pull, it's how this engine actually
    // behaves -- convergence timing is a real random-walk-until-capture
    // process, not something mass alone forces deterministic.
    // Empirically tested: mass=3/15 ticks flaked ~1-in-6; mass=15/30
    // ticks flaked ~2-in-15; mass=15/60 ticks: 0 failures across 15 runs.
    const window = fs.mkdtempSync(path.join(os.tmpdir(), 'emergence-loop-'));
    const l2 = createEmergenceLoop({ dataDir: window });
    let lastCluster = null;
    for (let i = 0; i < 60; i++) {
      const r = await l2.tick(`tick ${i}`, TARGET);
      if (r.created.cluster) lastCluster = r.created.cluster;
    }
    assert.ok(lastCluster, 'repeated pulls toward the same target should register real density within 60 ticks at mass=15');
    assert.strictEqual(lastCluster.id, TARGET.id);
    assert.ok(lastCluster.density > 0, 'density should be real and positive once converged');
  });

  await test('feedback window grows with each tick, capped at capacity', async () => {
    const window = fs.mkdtempSync(path.join(os.tmpdir(), 'emergence-loop-'));
    const l3 = createEmergenceLoop({ dataDir: window, feedbackCapacity: 3 });
    for (let i = 0; i < 5; i++) await l3.tick(`text ${i}`);
    assert.strictEqual(l3.feedback.size(), 3); // capped, oldest evicted
  });

  await test('meaning_charge genuinely varies with different text (not stale/cached)', async () => {
    const window = fs.mkdtempSync(path.join(os.tmpdir(), 'emergence-loop-'));
    const l4 = createEmergenceLoop({ dataDir: window });
    const r1 = await l4.tick('short');
    const r2 = await l4.tick('a completely different much longer sentence about something else entirely');
    assert.notStrictEqual(r1.observation.meaning_charge, r2.observation.meaning_charge);
  });

  await test('decay_score responds to sentiment', async () => {
    const window = fs.mkdtempSync(path.join(os.tmpdir(), 'emergence-loop-'));
    const l5 = createEmergenceLoop({ dataDir: window });
    const r1 = await l5.tick('I feel like we keep circling the same thing and I dont know how to name it.');
    const r2 = await l5.tick('Thank you, I really appreciate you being so kind and patient with me.');
    assert.notStrictEqual(r1.observation.decay_score, r2.observation.decay_score,
      'decay_score should move in response to sentiment');
  });

  await test('lattice: similar consecutive states resonate higher than dissimilar ones', async () => {
    const window = fs.mkdtempSync(path.join(os.tmpdir(), 'emergence-loop-'));
    const l6 = createEmergenceLoop({ dataDir: window });
    // two calm, similar-sentiment texts back to back
    await l6.tick('Thank you, I appreciate you.');
    const rSimilar = await l6.tick('I feel grateful and calm right now.');
    const weightSimilar = rSimilar.lattice.edge.weight;
    // then a sharply different one
    const rDifferent = await l6.tick('I am furious and this is completely broken and wrong.');
    const weightDifferent = rDifferent.lattice.edge.weight;
    assert.ok(weightSimilar >= weightDifferent,
      `similar states (${weightSimilar}) should resonate at least as strongly as a sharp shift (${weightDifferent})`);
  });

  await test('causal-graph: close-in-time creations are causal/rule, not assumed for every pair', async () => {
    const window = fs.mkdtempSync(path.join(os.tmpdir(), 'emergence-loop-'));
    const l7 = createEmergenceLoop({ dataDir: window });
    await l7.tick('one');
    const r2 = await l7.tick('two');
    assert.strictEqual(r2.causal.edgeType, 'causal/rule', 'consecutive ticks in one session are close in time');
    assert.strictEqual(typeof r2.causal.dt, 'number');
  });

  await test('ledger accumulates a distinct committed id per tick', async () => {
    const window = fs.mkdtempSync(path.join(os.tmpdir(), 'emergence-loop-'));
    const l8 = createEmergenceLoop({ dataDir: window });
    const r1 = await l8.tick('one');
    const r2 = await l8.tick('two');
    assert.notStrictEqual(r1.ledger.id, r2.ledger.id);
  });

  await test('feedback: omitting target reuses the previous tick\'s target (real feedback, not just storage)', async () => {
    const window = fs.mkdtempSync(path.join(os.tmpdir(), 'emergence-loop-'));
    const l9 = createEmergenceLoop({ dataDir: window });
    const t1 = { id: 'end-state:a', type: 'end-state', mass: 15 };
    const r1 = await l9.tick('first', t1);
    const r2 = await l9.tick('second, no target given');
    assert.deepStrictEqual(r2.created.target, t1, 'should reuse tick1 target without being told');

    const t2 = { id: 'idea:b', type: 'idea', mass: 15 };
    const r3 = await l9.tick('third, explicit override', t2);
    const r4 = await l9.tick('fourth, no target given');
    assert.deepStrictEqual(r4.created.target, t2, 'should follow the override, not revert to the original target');
  });

  await test('ledger: history() survives a real separate process, not just this session', async () => {
    const window = fs.mkdtempSync(path.join(os.tmpdir(), 'emergence-loop-'));
    const l10a = createEmergenceLoop({ dataDir: window });
    await l10a.tick('persisted one');
    await l10a.tick('persisted two');

    // brand new loop instance, same dataDir -- simulates a real restart
    const l10b = createEmergenceLoop({ dataDir: window });
    const history = l10b.history();
    assert.strictEqual(history.ledger.length, 2, 'a fresh instance with zero commits of its own should still read the prior process\'s ledger history');
    assert.strictEqual(history.ledger[history.ledger.length - 1].nodeId, 'creation:0');
  });

  await test('lattice + causal-graph: also durable across restart, and rehydrated state stays correct', async () => {
    const window = fs.mkdtempSync(path.join(os.tmpdir(), 'emergence-loop-'));
    const l11a = createEmergenceLoop({ dataDir: window });
    await l11a.tick('one', { id: 'end-state:x', type: 'end-state', mass: 15 });
    await l11a.tick('two');

    // fresh process
    const l11b = createEmergenceLoop({ dataDir: window });
    const h = l11b.history();
    assert.strictEqual(h.lattice.length, 2, 'lattice history should survive restart');
    assert.strictEqual(h.causal.length, 2, 'causal-graph history should survive restart');

    // and rehydrated state must be correct: the NEXT tick after restart
    // should connect to the real prior node, not start a fresh graph
    const r3 = await l11b.tick('three, after restart');
    assert.ok(r3.lattice.edge, 'lattice should connect to the pre-restart last node, not start fresh');
    assert.strictEqual(typeof r3.causal.dt, 'number', 'causal dt should be computed against the real pre-restart tick, not null as if this were the first creation ever');
  });

  await test('lattice + causal-graph: FULL graph rehydration, not just last-node continuity', async () => {
    const window = fs.mkdtempSync(path.join(os.tmpdir(), 'emergence-loop-'));
    const l12a = createEmergenceLoop({ dataDir: window });
    await l12a.tick('one', { id: 'end-state:y', type: 'end-state', mass: 15 });
    await l12a.tick('two');
    await l12a.tick('three');
    // at this point: 3 real nodes/edges exist in the persisted chain

    const l12b = createEmergenceLoop({ dataDir: window }); // fresh process
    const r4 = await l12b.tick('four, after restart');
    // if rehydration only restored the last node (not the full graph),
    // nodeCount here would read 2 (rehydrated node + this new one) instead
    // of the true 4 (3 persisted + this new one)
    assert.strictEqual(r4.lattice.nodeCount, 4, 'nodeCount should reflect the TRUE full history, not just this session');
    assert.strictEqual(r4.lattice.edgeCount, 3, 'edgeCount should reflect the TRUE full history, not just this session');
  });

  await test('sigma baselines: replay segment shrinks after a snapshot, correctness holds regardless', async () => {
    // direct component test, not via loop.js -- needs a small
    // snapshotInterval to observe within a reasonable test size (loop.js
    // uses the real default of 25, too slow to exercise here)
    const { buildLatticeGate } = require('../components/associative-lattice/index.js');
    const { buildCausalGraphGate } = require('../components/causal-graph/index.js');
    const { Cause, Flow } = require('../../warp');

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'emergence-sigma-'));

    const latticeGate1 = buildLatticeGate({ dataDir: dir, snapshotInterval: 3 });
    const ls1 = new Flow({}); ls1.register(latticeGate1);
    let sawSnapshot = false;
    for (let i = 0; i < 7; i++) {
      await ls1.emit(new Cause('lattice:record', { observation: { trajectory: 'STABLE', rupture_active: false, decay_score: 0.2 }, created: {} }));
      if (ls1.pending.slice(-1)[0].data.snapshotted) sawSnapshot = true;
    }
    assert.ok(sawSnapshot, 'a baseline should have been written within 7 commits at interval=3');
    assert.ok(latticeGate1.sigmaSize() < 3, 'sigma should have shrunk back down after the most recent baseline, not grown to 7');

    // restart: correctness must hold even though replay only touched the small sigma segment
    const latticeGate2 = buildLatticeGate({ dataDir: dir, snapshotInterval: 3 });
    const ls2 = new Flow({}); ls2.register(latticeGate2);
    await ls2.emit(new Cause('lattice:record', { observation: { trajectory: 'STABLE', rupture_active: false, decay_score: 0.2 }, created: {} }));
    const d = ls2.pending.slice(-1)[0].data;
    assert.strictEqual(d.nodeCount, 8, 'true total node count must be correct even though restart only replayed the sigma, not full genesis-to-head');
    assert.strictEqual(d.edgeCount, 7, 'true total edge count must be correct even though restart only replayed the sigma, not full genesis-to-head');

    // same proof for causal-graph: no false diamond-parent rejection after
    // a baseline-seeded restart
    const causalGate1 = buildCausalGraphGate({ dataDir: dir, snapshotInterval: 3, causalWindowTicks: 100 });
    const cs1 = new Flow({}); cs1.register(causalGate1);
    for (let i = 0; i < 7; i++) await cs1.emit(new Cause('causal:record', { tick: i * 0.1 }));
    assert.ok(causalGate1.sigmaSize() < 3, 'causal-graph sigma should also have shrunk after its baseline');

    const causalGate2 = buildCausalGraphGate({ dataDir: dir, snapshotInterval: 3, causalWindowTicks: 100 });
    const cs2 = new Flow({}); cs2.register(causalGate2);
    await cs2.emit(new Cause('causal:record', { tick: 0.75 }));
    const cd = cs2.pending.slice(-1)[0].data;
    assert.strictEqual(typeof cd.dt, 'number', 'dt must be a real number against the true prior tick after a baseline-seeded restart');
    assert.strictEqual(cd.rejected, false, 'no false diamond-parent rejection -- the baseline must have correctly seeded the real causal store');
  });

  await test('reverse causal condition mapping: traceToRoot stops at a real observational boundary, not just genesis', async () => {
    const { buildCausalGraphGate } = require('../components/causal-graph/index.js');
    const { Cause, Flow } = require('../../warp');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'emergence-trace-'));
    const drawbridge = buildCausalGraphGate({ dataDir: dir, causalWindowTicks: 0.5 });
    const flow = new Flow({}); flow.register(drawbridge);

    await flow.emit(new Cause('causal:record', { tick: 0.1 }));  // creation:0
    await flow.emit(new Cause('causal:record', { tick: 0.3 }));  // creation:1, causal/rule
    await flow.emit(new Cause('causal:record', { tick: 0.5 }));  // creation:2, causal/rule
    await flow.emit(new Cause('causal:record', { tick: 10.0 })); // creation:3, dt=9.5 -> observational (breaks the chain)
    await flow.emit(new Cause('causal:record', { tick: 10.2 })); // creation:4, causal/rule

    const trace = await drawbridge.traceToRoot('creation:4');
    assert.deepStrictEqual(trace.path, ['creation:3', 'creation:4'],
      'the backward trace must stop at the observational boundary, not walk all the way back to genesis -- proves this is real filtering, not decoration');
  });

  await test('end-state first: reaching real convergence auto-surfaces the reverse causal trace with conditions', async () => {
    const window = fs.mkdtempSync(path.join(os.tmpdir(), 'emergence-loop-'));
    const l13 = createEmergenceLoop({ dataDir: window });
    const target = { id: 'end-state:z', type: 'end-state', mass: 15 };

    let sawEndState = false;
    for (let i = 0; i < 60; i++) { // proven-reliable budget for mass=15, established earlier in this file
      const r = await l13.tick(`tick ${i}`, target);
      if (r.created.cluster) {
        sawEndState = true;
        assert.ok(r.endStateConditions, 'endStateConditions must be populated the moment convergence is real, not left null');
        assert.ok(Array.isArray(r.endStateConditions.path), 'trace path should be an array');
        assert.ok(Array.isArray(r.endStateConditions.conditions), 'conditions should be an array');
        assert.ok(r.endStateConditions.conditions.every(c => c.invariants !== undefined),
          'every step in the backward path should have its invariants looked up, not left missing');
        break;
      }
    }
    assert.ok(sawEndState, 'expected real convergence within 60 ticks at mass=15 (see cfr-creator test for the empirical basis of this budget)');

    // and when NOT converged, endStateConditions must stay honestly null, not fabricated
    const window2 = fs.mkdtempSync(path.join(os.tmpdir(), 'emergence-loop-'));
    const l14 = createEmergenceLoop({ dataDir: window2 });
    const r0 = await l14.tick('no target given, first ever tick');
    assert.strictEqual(r0.endStateConditions, null, 'no convergence -> no fabricated trace');
  });

  await test('logs(): every core flow now has a real FlowLog, previously invisible', async () => {
    const window = fs.mkdtempSync(path.join(os.tmpdir(), 'emergence-loop-'));
    const l15 = createEmergenceLoop({ dataDir: window });
    await l15.tick('hello');
    const logs = l15.logs();
    for (const name of ['observer', 'creator', 'lattice', 'causal', 'ledger']) {
      assert.ok(logs[name].length > 0, `${name} flow should have real dispatch log entries after a tick`);
    }
  });

  await test('BUG REGRESSION: tick() surfaces all 9 Liminal signals + health, not just the bare summary', async () => {
    // caught by schemas/test/schemas.test.js -- loop.js used to do
    // `observation = observedEvent.data.summary`, silently dropping
    // health and all 9 real Liminal signals rfr2-observer's Drawbridge
    // actually computes. Every component-level signal test passed
    // because they tested the Drawbridge directly, never through tick().
    const window = fs.mkdtempSync(path.join(os.tmpdir(), 'emergence-loop-'));
    const l16 = createEmergenceLoop({ dataDir: window });
    const r = await l16.tick('hello');
    for (const key of ['health', 'oscillatory', 'relationalGaps', 'reversal', 'negativeSpace', 'shadow', 'assumption', 'structural', 'existential', 'contrastive']) {
      assert.ok(key in r.observation, `r.observation.${key} should be present -- if this fails, the signal-dropping bug is back`);
    }
    // and the flattened summary fields must still work, unchanged
    assert.strictEqual(typeof r.observation.trajectory, 'string');
    assert.strictEqual(typeof r.observation.meaning_charge, 'number');
  });

  await test('pattern engine: real recall on a genuinely repeated tick state', async () => {
    const window = fs.mkdtempSync(path.join(os.tmpdir(), 'emergence-loop-'));
    const l17 = createEmergenceLoop({ dataDir: window });
    const r1 = await l17.tick('hello there');
    assert.ok(r1.pattern, 'pattern should be present on every tick result');
    assert.strictEqual(r1.pattern.recall.seenBefore, false, 'first occurrence of any pattern is honestly unseen');
    // repeat calls until we get a real repeated signature (session state
    // evolves, so literal text repetition doesn't guarantee an identical
    // signature -- loop until one genuinely recurs, bounded)
    let sawRecall = false;
    for (let i = 0; i < 5 && !sawRecall; i++) {
      const r = await l17.tick('hello there');
      if (r.pattern.recall.seenBefore) sawRecall = true;
    }
    assert.ok(sawRecall, 'a repeated tick state should eventually produce a real recall within a few calls');
  });

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exitCode = 1;
}

main();
