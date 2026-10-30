'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { buildIdeaStore, EDGE_TYPES } = require('../index.js');

let pass = 0, fail = 0;
async function test(name, fn) {
  try { await fn(); pass++; console.log(`  ok  - ${name}`); }
  catch (e) { fail++; console.log(`  FAIL - ${name}\n         ${e.message}`); }
}
function tmpDir() { return fs.mkdtempSync(path.join(os.tmpdir(), 'idea-store-test-')); }

async function main() {
  await test('add() is a real WARP Gate -- rejects empty text via a real hard Axiom', async () => {
    const store = buildIdeaStore({ dataDir: tmpDir() });
    await assert.rejects(() => store.add({ text: '' }), /idea text is required/);
    await assert.rejects(() => store.add({ text: '   ' }), /idea text is required/);
  });

  await test('rejected add() does not mutate the ideas chain (real axiom, not a post-hoc check)', async () => {
    const store = buildIdeaStore({ dataDir: tmpDir() });
    await store.add({ text: 'real idea' });
    await assert.rejects(() => store.add({ text: '' }));
    assert.strictEqual(store.list().length, 1, 'the rejected add should not have appended anything');
  });

  await test('add() then findById() round-trips through real WARP dispatch', async () => {
    const store = buildIdeaStore({ dataDir: tmpDir() });
    const idea = await store.add({ text: 'a real idea', tags: ['x'] });
    const found = store.findById(idea.id);
    assert.strictEqual(found.text, 'a real idea');
    assert.deepStrictEqual(found.tags, ['x']);
  });

  await test('list() returns newest-first', async () => {
    const store = buildIdeaStore({ dataDir: tmpDir() });
    const a = await store.add({ text: 'first' });
    const b = await store.add({ text: 'second' });
    const list = store.list();
    assert.strictEqual(list[0].id, b.id);
    assert.strictEqual(list[1].id, a.id);
  });

  await test('list() filters by projectId and tags', async () => {
    const store = buildIdeaStore({ dataDir: tmpDir() });
    await store.add({ text: 'a', projectId: 'p1', tags: ['x'] });
    await store.add({ text: 'b', projectId: 'p2', tags: ['x', 'y'] });
    await store.add({ text: 'c', projectId: 'p1', tags: ['y'] });
    assert.strictEqual(store.list({ projectId: 'p1' }).length, 2);
    assert.strictEqual(store.list({ tags: ['y'] }).length, 2);
    assert.strictEqual(store.list({ projectId: 'p1', tags: ['y'] }).length, 1);
  });

  await test('search() matches text and tags, case-insensitive', async () => {
    const store = buildIdeaStore({ dataDir: tmpDir() });
    await store.add({ text: 'sigma baselines bound replay cost', tags: ['performance'] });
    await store.add({ text: 'unrelated idea', tags: ['other'] });
    assert.strictEqual(store.search('SIGMA').length, 1);
    assert.strictEqual(store.search('performance').length, 1);
    assert.strictEqual(store.search('nonexistent-term').length, 0);
  });

  await test('link() is a real WARP Gate -- validates edge type via a real hard Axiom', async () => {
    const store = buildIdeaStore({ dataDir: tmpDir() });
    const a = await store.add({ text: 'a' });
    const b = await store.add({ text: 'b' });
    await assert.rejects(() => store.link({ fromId: a.id, toId: b.id, type: 'bogus' }), /invalid edge type/);
    for (const type of EDGE_TYPES) {
      await assert.doesNotReject(() => store.link({ fromId: a.id, toId: b.id, type }));
    }
  });

  await test('link() rejects unknown fromId/toId via real Axioms that check live store state', async () => {
    const store = buildIdeaStore({ dataDir: tmpDir() });
    const a = await store.add({ text: 'a' });
    await assert.rejects(() => store.link({ fromId: 'nonexistent', toId: a.id, type: 'related' }), /fromId 'nonexistent' not found/);
    await assert.rejects(() => store.link({ fromId: a.id, toId: 'nonexistent', type: 'related' }), /toId 'nonexistent' not found/);
  });

  await test('every mutation is recorded in a real StreamLog -- nothing silent', async () => {
    const store = buildIdeaStore({ dataDir: tmpDir() });
    await store.add({ text: 'a' });
    assert.ok(store.flow.log.entries().length > 0);
    assert.strictEqual(store.flow.log.entries()[0].drawbridgeClaimed, 'idea:add');
  });

  await test('graph() returns real nodes and edges, scoped by projectId when given', async () => {
    const store = buildIdeaStore({ dataDir: tmpDir() });
    const a = await store.add({ text: 'a', projectId: 'p1' });
    const b = await store.add({ text: 'b', projectId: 'p1' });
    await store.add({ text: 'c', projectId: 'p2' });
    await store.link({ fromId: a.id, toId: b.id, type: 'related' });
    const full = store.graph();
    assert.strictEqual(full.nodes.length, 3);
    assert.strictEqual(full.edges.length, 1);
    const scoped = store.graph('p1');
    assert.strictEqual(scoped.nodes.length, 2);
  });

  await test('neighbours() returns real connected ideas via real edges', async () => {
    const store = buildIdeaStore({ dataDir: tmpDir() });
    const a = await store.add({ text: 'a' });
    const b = await store.add({ text: 'b' });
    const c = await store.add({ text: 'c' });
    await store.link({ fromId: a.id, toId: b.id, type: 'related' });
    const neighbours = store.neighbours(a.id);
    assert.strictEqual(neighbours.length, 1);
    assert.strictEqual(neighbours[0].id, b.id);
    assert.strictEqual(store.neighbours(c.id).length, 0);
  });

  await test('survives a real process restart -- fresh instance, same dataDir', async () => {
    const dir = tmpDir();
    const store1 = buildIdeaStore({ dataDir: dir });
    const idea = await store1.add({ text: 'persisted across restart' });
    const store2 = buildIdeaStore({ dataDir: dir });
    const found = store2.findById(idea.id);
    assert.ok(found, 'idea should be found by a fresh instance with zero adds of its own');
    assert.strictEqual(found.text, 'persisted across restart');
  });

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exitCode = 1;
}

main();
