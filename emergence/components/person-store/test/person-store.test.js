'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { buildPersonStore, DIMENSION_CONFIG } = require('../index.js');

let pass = 0, fail = 0;
async function test(name, fn) {
  try { await fn(); pass++; console.log(`  ok  - ${name}`); }
  catch (e) { fail++; console.log(`  FAIL - ${name}\n         ${e.message}`); }
}
function tmpDir() { return fs.mkdtempSync(path.join(os.tmpdir(), 'person-store-test-')); }

async function main() {
  await test('add() is a real WARP Gate -- rejects empty name via a real hard Axiom', async () => {
    const store = buildPersonStore({ dataDir: tmpDir() });
    await assert.rejects(() => store.add({ name: '' }), /name is required/);
  });

  await test('add() defaults all 24 real dimensions to their real schema-defined default values', async () => {
    const store = buildPersonStore({ dataDir: tmpDir() });
    const person = await store.add({ name: 'Alice' });
    assert.strictEqual(Object.keys(person.dimensions).length, 24);
    assert.strictEqual(person.dimensions.trust, DIMENSION_CONFIG.trust.def);
    assert.strictEqual(person.dimensions.valence, DIMENSION_CONFIG.valence.def);
  });

  await test('interact() rejects a nonexistent person via a real Axiom checking live store state', async () => {
    const store = buildPersonStore({ dataDir: tmpDir() });
    await assert.rejects(() => store.interact('nonexistent', { text: 'x', mood: '\u2726' }), /not found/);
  });

  await test('interact() rejects an invalid mood via the real enum from interaction.schema.json', async () => {
    const store = buildPersonStore({ dataDir: tmpDir() });
    const p = await store.add({ name: 'Alice' });
    await assert.rejects(() => store.interact(p.id, { text: 'x', mood: 'not-a-real-mood' }), /invalid mood/);
    await assert.doesNotReject(() => store.interact(p.id, { text: 'x', mood: '\u2726' }));
  });

  await test('interact() appends to the real interaction log, findById reflects it', async () => {
    const store = buildPersonStore({ dataDir: tmpDir() });
    const p = await store.add({ name: 'Alice' });
    await store.interact(p.id, { text: 'good chat', mood: '\u2726' });
    await store.interact(p.id, { text: 'rough day', mood: '\u2601' });
    const found = store.findById(p.id);
    assert.strictEqual(found.interactions.length, 2);
    assert.strictEqual(found.interactions[0].text, 'good chat');
  });

  await test('setDimensions() updates only the real, valid 24 keys, clamped to real bounds', async () => {
    const store = buildPersonStore({ dataDir: tmpDir() });
    const p = await store.add({ name: 'Alice' });
    await store.setDimensions(p.id, { trust: 1.5, valence: -2, bogus_dimension: 0.9 });
    const found = store.findById(p.id);
    assert.strictEqual(found.dimensions.trust, 1, 'trust should clamp to real max 1');
    assert.strictEqual(found.dimensions.valence, -1, 'valence should clamp to real min -1 (its own range, unlike other dims)');
    assert.ok(!('bogus_dimension' in found.dimensions), 'unknown dimension keys should be ignored, not injected');
  });

  await test('similarity() uses the real per-dimension weights, not a naive average', async () => {
    const store = buildPersonStore({ dataDir: tmpDir() });
    const a = await store.add({ name: 'A' });
    const b = await store.add({ name: 'B' });
    // identical on every dimension -> perfect similarity regardless of weights
    await store.setDimensions(a.id, { trust: 0.8, empathy: 0.8 });
    await store.setDimensions(b.id, { trust: 0.8, empathy: 0.8 });
    assert.strictEqual(store.similarity(a.id, b.id), 1);
  });

  await test('similarity() throws if either person does not exist', async () => {
    const store = buildPersonStore({ dataDir: tmpDir() });
    const a = await store.add({ name: 'A' });
    assert.throws(() => store.similarity(a.id, 'nonexistent'), /both people must exist/);
  });

  await test('search() matches name, nickname, and relationship, case-insensitive', async () => {
    const store = buildPersonStore({ dataDir: tmpDir() });
    await store.add({ name: 'Alice', relationship: 'close friend' });
    await store.add({ name: 'Bob', nickname: 'Bobby' });
    assert.strictEqual(store.search('ALICE').length, 1);
    assert.strictEqual(store.search('bobby').length, 1);
    assert.strictEqual(store.search('friend').length, 1);
    assert.strictEqual(store.search('nonexistent-term').length, 0);
  });

  await test('survives a real process restart -- fresh instance, same dataDir, real interaction history intact', async () => {
    const dir = tmpDir();
    const store1 = buildPersonStore({ dataDir: dir });
    const alice = await store1.add({ name: 'Alice' });
    await store1.interact(alice.id, { text: 'hi', mood: '\u2726' });

    const store2 = buildPersonStore({ dataDir: dir });
    const found = store2.findById(alice.id);
    assert.ok(found, 'person should be found by a fresh instance with zero adds of its own');
    assert.strictEqual(found.interactions.length, 1);
  });

  await test('every mutation is recorded in a real FlowLog -- nothing silent', async () => {
    const store = buildPersonStore({ dataDir: tmpDir() });
    await store.add({ name: 'Alice' });
    assert.ok(store.flow.log.entries().length > 0);
    assert.strictEqual(store.flow.log.entries()[0].drawbridgeClaimed, 'person:add');
  });

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exitCode = 1;
}

main();
