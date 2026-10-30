'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { buildPatternEngine, signature } = require('../index.js');

let pass = 0, fail = 0;
async function test(name, fn) {
  try { await fn(); pass++; console.log(`  ok  - ${name}`); }
  catch (e) { fail++; console.log(`  FAIL - ${name}\n         ${e.message}`); }
}
function tmpDir() { return fs.mkdtempSync(path.join(os.tmpdir(), 'pattern-engine-test-')); }

const tickA = { observation: { trajectory: 'FLATTENING', rupture_active: false, decay_score: 0.7, reversal: { x: 1 } }, created: { cluster: null } };
const tickB = { observation: { trajectory: 'STABLE', rupture_active: false, decay_score: 0.2 }, created: { cluster: { sig: 'laminar' } } };

async function main() {
  await test('signature() is a pure function -- same input always produces the same signature', () => {
    assert.strictEqual(signature(tickA), signature(tickA));
  });

  await test('signature() distinguishes genuinely different ticks', () => {
    assert.notStrictEqual(signature(tickA), signature(tickB));
  });

  await test('signature() is based on WHICH signals fired, not their values', () => {
    const variantA = { observation: { ...tickA.observation, reversal: { x: 999, totally: 'different value' } }, created: tickA.created };
    assert.strictEqual(signature(tickA), signature(variantA), 'signature should only care that reversal fired, not what its payload contains');
  });

  await test('recall: first occurrence of a pattern reports seenBefore=false', async () => {
    const engine = buildPatternEngine({ dataDir: tmpDir() });
    const r = await engine.observe(tickA, 'creation:0');
    assert.strictEqual(r.recall.seenBefore, false);
    assert.strictEqual(r.recall.count, 0);
  });

  await test('recall: a genuinely repeated pattern reports real prior occurrences', async () => {
    const engine = buildPatternEngine({ dataDir: tmpDir() });
    await engine.observe(tickA, 'creation:0');
    await engine.observe(tickB, 'creation:1');
    const r = await engine.observe(tickA, 'creation:2');
    assert.strictEqual(r.recall.seenBefore, true);
    assert.strictEqual(r.recall.count, 1);
    assert.deepStrictEqual(r.recall.priorNodeIds, ['creation:0']);
  });

  await test('prediction: null until a transition has genuinely repeated', async () => {
    const engine = buildPatternEngine({ dataDir: tmpDir() });
    const r1 = await engine.observe(tickA, 'creation:0');
    assert.strictEqual(r1.prediction, null, 'no prior tick to transition from yet');
    const r2 = await engine.observe(tickB, 'creation:1');
    assert.strictEqual(r2.prediction, null, 'transition A->B has never been observed before this moment -- nothing to predict from yet');
  });

  await test('prediction: real confidence once a transition genuinely repeats', async () => {
    const engine = buildPatternEngine({ dataDir: tmpDir() });
    await engine.observe(tickA, 'creation:0');
    await engine.observe(tickB, 'creation:1'); // records A->B for the first time
    await engine.observe(tickA, 'creation:2'); // records B->A for the first time
    const r = await engine.observe(tickB, 'creation:3'); // A->B again -- real repeat
    assert.ok(r.prediction, 'a real repeated transition should produce a prediction');
    assert.strictEqual(r.prediction.mostLikely, signature(tickB));
    assert.strictEqual(r.prediction.confidence, 1);
  });

  await test('survives a real process restart -- fresh instance, same dataDir, real history intact', async () => {
    const dir = tmpDir();
    const e1 = buildPatternEngine({ dataDir: dir });
    await e1.observe(tickA, 'creation:0');
    await e1.observe(tickA, 'creation:1');

    const e2 = buildPatternEngine({ dataDir: dir });
    const r = await e2.observe(tickA, 'creation:2');
    assert.strictEqual(r.recall.count, 2, 'both pre-restart occurrences should be counted');
    assert.deepStrictEqual(r.recall.priorNodeIds, ['creation:0', 'creation:1']);
  });

  await test('every observation is recorded in a real StreamLog -- WARP Gate dispatch, not a bare function call', async () => {
    const engine = buildPatternEngine({ dataDir: tmpDir() });
    await engine.observe(tickA, 'creation:0');
    assert.ok(engine.log.entries().length > 0);
    assert.strictEqual(engine.log.entries()[0].drawbridgeClaimed, 'pattern:observe');
  });

  await test('stats() reports real aggregate counts', async () => {
    const engine = buildPatternEngine({ dataDir: tmpDir() });
    await engine.observe(tickA, 'creation:0');
    await engine.observe(tickB, 'creation:1');
    await engine.observe(tickA, 'creation:2');
    const s = engine.stats();
    assert.strictEqual(s.distinctPatterns, 2);
    assert.strictEqual(s.mostCommon[0].count, 2);
  });

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exitCode = 1;
}

main();
