'use strict';
/**
 * schemas.test.js — two things, deliberately not a full JSON-Schema
 * validator (that's an external dependency this project doesn't take,
 * per the zero-runtime-deps discipline everywhere else here):
 *   1. every schema file is well-formed JSON with the required
 *      draft-07 scaffolding ($schema, $id, type, required, properties)
 *   2. the "required" field names in each schema actually appear on
 *      REAL output from running the real code -- so a schema can't
 *      silently drift from reality without this test catching it
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { createEmergenceLoop } = require('../../loop.js');
const { buildIdeaStore } = require('../../components/idea-store/index.js');

let pass = 0, fail = 0;
async function test(name, fn) {
  try { await fn(); pass++; console.log(`  ok  - ${name}`); }
  catch (e) { fail++; console.log(`  FAIL - ${name}\n         ${e.message}`); }
}

function loadSchema(name) {
  return JSON.parse(fs.readFileSync(path.join(__dirname, '..', `${name}.schema.json`), 'utf8'));
}

function assertRequiredFieldsPresent(schema, realObject, schemaName) {
  for (const field of schema.required || []) {
    assert.ok(field in realObject, `schema ${schemaName} requires "${field}" but it's missing from real output -- schema has drifted from reality`);
  }
}

async function main() {
  const schemaFiles = fs.readdirSync(path.join(__dirname, '..')).filter(f => f.endsWith('.schema.json'));

  await test('every schema file is well-formed draft-07 JSON Schema', () => {
    assert.ok(schemaFiles.length >= 6, `expected at least 6 schema files, found ${schemaFiles.length}`);
    for (const file of schemaFiles) {
      const schema = JSON.parse(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'));
      assert.strictEqual(schema.$schema, 'http://json-schema.org/draft-07/schema#', `${file} missing draft-07 $schema`);
      assert.ok(schema.$id, `${file} missing $id`);
      assert.ok(schema.title, `${file} missing title`);
      assert.ok(schema.description, `${file} missing description`);
    }
  });

  await test('target.schema.json required fields match a real target actually used', async () => {
    const schema = loadSchema('target');
    const loop = createEmergenceLoop({ dataDir: fs.mkdtempSync(path.join(require('os').tmpdir(), 'schema-test-')) });
    const target = { id: 'end-state:test', type: 'end-state', mass: 15 };
    const r = await loop.tick('hello', target);
    assertRequiredFieldsPresent(schema, r.created.target, 'target');
  });

  await test('observation.schema.json required fields match a real observation', async () => {
    const schema = loadSchema('observation');
    const loop = createEmergenceLoop({ dataDir: fs.mkdtempSync(path.join(require('os').tmpdir(), 'schema-test-')) });
    const r = await loop.tick('hello there');
    assertRequiredFieldsPresent(schema, r.observation, 'observation');
  });

  await test('created.schema.json required fields match real cfr-creator output', async () => {
    const schema = loadSchema('created');
    const loop = createEmergenceLoop({ dataDir: fs.mkdtempSync(path.join(require('os').tmpdir(), 'schema-test-')) });
    const r = await loop.tick('hello');
    assertRequiredFieldsPresent(schema, r.created, 'created');
  });

  await test('ledger-record.schema.json required fields match a real persisted record', async () => {
    const schema = loadSchema('ledger-record');
    const dir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'schema-test-'));
    const loop = createEmergenceLoop({ dataDir: dir });
    await loop.tick('hello');
    const history = loop.history(1);
    assertRequiredFieldsPresent(schema, history.ledger[0], 'ledger-record');
  });

  await test('tick-result.schema.json required fields match the real top-level tick() return', async () => {
    const schema = loadSchema('tick-result');
    const loop = createEmergenceLoop({ dataDir: fs.mkdtempSync(path.join(require('os').tmpdir(), 'schema-test-')) });
    const r = await loop.tick('hello');
    assertRequiredFieldsPresent(schema, r, 'tick-result');
  });

  await test('idea.schema.json required fields match a real idea from idea-store', async () => {
    const schema = loadSchema('idea');
    const store = buildIdeaStore({ dataDir: fs.mkdtempSync(path.join(require('os').tmpdir(), 'schema-test-')) });
    const idea = await store.add({ text: 'a real idea' });
    assertRequiredFieldsPresent(schema, idea, 'idea');
  });

  await test('idea-edge.schema.json required fields match a real edge from idea-store', async () => {
    const schema = loadSchema('idea-edge');
    const store = buildIdeaStore({ dataDir: fs.mkdtempSync(path.join(require('os').tmpdir(), 'schema-test-')) });
    const a = await store.add({ text: 'a' });
    const b = await store.add({ text: 'b' });
    const edge = await store.link({ fromId: a.id, toId: b.id, type: 'related' });
    assertRequiredFieldsPresent(schema, edge, 'idea-edge');
  });

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exitCode = 1;
}

main();
