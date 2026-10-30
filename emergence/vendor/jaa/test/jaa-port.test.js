'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { canonicalize } = require('../canonicalize.js');
const { FileStore } = require('../FileStore.js');
const { FileRefs } = require('../FileRefs.js');
const { Recovery } = require('../Recovery.js');

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log(`  ok  - ${name}`); }
  catch (e) { fail++; console.log(`  FAIL - ${name}\n         ${e.message}`); }
}
function tmpDir() { return fs.mkdtempSync(path.join(os.tmpdir(), 'jaa-port-')); }

// ── canonicalize ─────────────────────────────────────────────────────
test('canonicalize: object keys sorted regardless of insertion order', () => {
  const a = canonicalize({ b: 1, a: 2 });
  const b = canonicalize({ a: 2, b: 1 });
  assert.strictEqual(a, b);
  assert.strictEqual(a, '{"a":2,"b":1}');
});
test('canonicalize: arrays preserve order (not sorted)', () => {
  assert.strictEqual(canonicalize([3, 1, 2]), '[3,1,2]');
});
test('canonicalize: nested structures canonicalize recursively', () => {
  assert.strictEqual(canonicalize({ z: [1, { y: 2, x: 1 }] }), '{"z":[1,{"x":1,"y":2}]}');
});
test('canonicalize: null and booleans', () => {
  assert.strictEqual(canonicalize(null), 'null');
  assert.strictEqual(canonicalize(true), 'true');
  assert.strictEqual(canonicalize(false), 'false');
});

// ── FileStore ────────────────────────────────────────────────────────
test('FileStore: put then get round-trips exactly', () => {
  const store = new FileStore(tmpDir());
  const hash = store.put({ hello: 'world', n: 42 });
  assert.strictEqual(typeof hash, 'string');
  assert.strictEqual(hash.length, 64); // sha256 hex
  const back = store.get(hash);
  assert.deepStrictEqual(back, { hello: 'world', n: 42 });
});
test('FileStore: same content always produces the same hash (content-addressed)', () => {
  const store = new FileStore(tmpDir());
  const h1 = store.put({ a: 1, b: 2 });
  const h2 = store.put({ b: 2, a: 1 }); // different key order, same content
  assert.strictEqual(h1, h2);
});
test('FileStore: different content produces different hashes', () => {
  const store = new FileStore(tmpDir());
  const h1 = store.put({ a: 1 });
  const h2 = store.put({ a: 2 });
  assert.notStrictEqual(h1, h2);
});
test('FileStore: has() reflects real presence', () => {
  const store = new FileStore(tmpDir());
  const hash = store.put({ x: 1 });
  assert.strictEqual(store.has(hash), true);
  assert.strictEqual(store.has('0'.repeat(64)), false);
});
test('FileStore: get() on missing hash throws loudly', () => {
  const store = new FileStore(tmpDir());
  assert.throws(() => store.get('0'.repeat(64)), /Object not found/);
});
test('FileStore: survives process restart (new instance, same dir)', () => {
  const dir = tmpDir();
  const store1 = new FileStore(dir);
  const hash = store1.put({ persisted: true });
  const store2 = new FileStore(dir); // fresh instance, same disk location
  assert.deepStrictEqual(store2.get(hash), { persisted: true });
});

// ── FileRefs ─────────────────────────────────────────────────────────
test('FileRefs: set then get round-trips', () => {
  const refs = new FileRefs(tmpDir());
  refs.set('emergence/ledger/head', 'abc123');
  assert.strictEqual(refs.get('emergence/ledger/head'), 'abc123');
});
test('FileRefs: get on missing ref returns null, not an error', () => {
  const refs = new FileRefs(tmpDir());
  assert.strictEqual(refs.get('nonexistent'), null);
});
test('FileRefs: delete removes the ref and cleans empty dirs', () => {
  const refs = new FileRefs(tmpDir());
  refs.set('a/b/c', 'hash1');
  refs.delete('a/b/c');
  assert.strictEqual(refs.get('a/b/c'), null);
});
test('FileRefs: list by prefix returns sorted matches', () => {
  const refs = new FileRefs(tmpDir());
  refs.set('emergence/ledger/head', 'h1');
  refs.set('emergence/lattice/head', 'h2');
  refs.set('other/thing', 'h3');
  const results = refs.list('emergence');
  assert.strictEqual(results.length, 2);
  assert.ok(results.includes('emergence/ledger/head'));
  assert.ok(results.includes('emergence/lattice/head'));
});

// ── Recovery ─────────────────────────────────────────────────────────
test('Recovery: clean state when no pending WAL exists', () => {
  const r = new Recovery(tmpDir());
  assert.strictEqual(r.check().clean, true);
});
test('Recovery: begin() writes a pending batch, commit() clears it', () => {
  const r = new Recovery(tmpDir());
  r.begin([{ hash: 'h1', content: { x: 1 } }], [{ name: 'ref1', hash: 'h1' }], []);
  assert.strictEqual(r.check().clean, false);
  r.commit();
  assert.strictEqual(r.check().clean, true);
});
test('Recovery: recover() replays an uncommitted batch after simulated crash', () => {
  const dir = tmpDir();
  const store = new FileStore(dir);
  const refs = new FileRefs(dir);
  const r = new Recovery(dir);

  r.begin([{ hash: 'placeholder', content: { recovered: true } }], [{ name: 'test/ref', hash: 'willbeoverwritten' }], []);
  // simulate crash: no commit() called, pending.json still on disk

  const r2 = new Recovery(dir); // fresh instance, as if process restarted
  r2.recover(store, refs);
  assert.strictEqual(r2.check().clean, true, 'recover() should commit (clear WAL) after replay');
  assert.strictEqual(refs.get('test/ref'), 'willbeoverwritten');
});

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exitCode = 1;
