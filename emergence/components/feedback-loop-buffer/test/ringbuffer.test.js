'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { test, assert, summarize } = require('./runner');

const { RingBufferCore } = require('../core/RingBufferCore');
const { buildRingAxioms, buildRingGate, createRingStream } = require('../core/wire');
const { Cause } = require('../../../../warp');
const { FilePersistence } = require('../persist/FilePersistence');
const { EvictionLedger } = require('../persist/EvictionLedger');
const { RingBuffer } = require('../index');

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ring-buffer-test-'));
}

// ─────────────────────────────────────────────────────────────────────────
// LAYER 1 — RingBufferCore in total isolation. No WARP, no I/O.
// ─────────────────────────────────────────────────────────────────────────

test('core: rejects capacity 0', () => {
  assert.throws(() => new RingBufferCore(0), /positive integer/);
});
test('core: rejects negative capacity', () => {
  assert.throws(() => new RingBufferCore(-5), /positive integer/);
});
test('core: rejects non-integer capacity', () => {
  assert.throws(() => new RingBufferCore(3.5), /positive integer/);
});
test('core: rejects missing capacity', () => {
  assert.throws(() => new RingBufferCore(undefined), /positive integer/);
});
test('core: rejects NaN capacity', () => {
  assert.throws(() => new RingBufferCore(NaN), /positive integer/);
});

test('core: empty buffer reads', () => {
  const rb = new RingBufferCore(5);
  assert.deepStrictEqual(rb.toArray(), []);
  assert.deepStrictEqual(rb.tail(), []);
  assert.deepStrictEqual(rb.tail(10), []);
  assert.strictEqual(rb.isEmpty(), true);
  assert.strictEqual(rb.isFull(), false);
});

test('core: push rejects undefined', () => {
  const rb = new RingBufferCore(3);
  assert.throws(() => rb.push(undefined), /cannot push undefined/);
});

test('core: push accepts null (distinct from undefined)', () => {
  const rb = new RingBufferCore(3);
  const r = rb.push(null);
  assert.strictEqual(r.evicted, null);
  assert.deepStrictEqual(rb.toArray(), [null]);
});

test('core: basic push and order preservation', () => {
  const rb = new RingBufferCore(3);
  rb.push('a'); rb.push('b'); rb.push('c');
  assert.deepStrictEqual(rb.toArray(), ['a', 'b', 'c']);
  assert.strictEqual(rb.isFull(), true);
});

test('core: overwrite-oldest-on-full, wraparound correctness', () => {
  const rb = new RingBufferCore(3);
  rb.push(1); rb.push(2); rb.push(3);
  const r4 = rb.push(4);
  assert.strictEqual(r4.evicted, 1);
  assert.deepStrictEqual(rb.toArray(), [2, 3, 4]);
  const r5 = rb.push(5);
  assert.strictEqual(r5.evicted, 2);
  assert.deepStrictEqual(rb.toArray(), [3, 4, 5]);
});

test('core: capacity=1 edge case — every push evicts the previous', () => {
  const rb = new RingBufferCore(1);
  const r1 = rb.push('x');
  assert.strictEqual(r1.evicted, null);
  const r2 = rb.push('y');
  assert.strictEqual(r2.evicted, 'x');
  assert.deepStrictEqual(rb.toArray(), ['y']);
});

test('core: tail(n) window semantics', () => {
  const rb = new RingBufferCore(5);
  [1, 2, 3, 4, 5].forEach(v => rb.push(v));
  assert.deepStrictEqual(rb.tail(2), [4, 5]);
  assert.deepStrictEqual(rb.tail(0), []);
  assert.deepStrictEqual(rb.tail(100), [1, 2, 3, 4, 5]); // n > size clamps to full
});

test('core: stats tracks totals across eviction', () => {
  const rb = new RingBufferCore(2);
  rb.push(1); rb.push(2); rb.push(3); rb.push(4);
  const s = rb.stats();
  assert.strictEqual(s.totalPushed, 4);
  assert.strictEqual(s.totalEvicted, 2);
  assert.strictEqual(s.utilization, 1);
});

test('core: fromSnapshot reconstructs identical state', () => {
  const original = new RingBufferCore(3);
  original.push('a'); original.push('b'); original.push('c'); original.push('d');
  const restored = RingBufferCore.fromSnapshot(3, original.toArray());
  assert.deepStrictEqual(restored.toArray(), original.toArray());
});

test('core: high-volume push correctness (10k pushes, capacity 100)', () => {
  const rb = new RingBufferCore(100);
  for (let i = 0; i < 10000; i++) rb.push(i);
  const arr = rb.toArray();
  assert.strictEqual(arr.length, 100);
  assert.strictEqual(arr[0], 9900);
  assert.strictEqual(arr[99], 9999);
  assert.strictEqual(rb.stats().totalEvicted, 9900);
});

test('core: unicode and exotic values survive round-trip', () => {
  const rb = new RingBufferCore(5);
  const values = ['日本語', '🔥💀', '', 'a\nb\tc', { emoji: '🎉', nested: { x: 1 } }];
  values.forEach(v => rb.push(v));
  assert.deepStrictEqual(rb.toArray(), values);
});

// ─────────────────────────────────────────────────────────────────────────
// LAYER 2 — Drawbridge and Axioms in isolation, no Flow involved (WARP's own
// stated design goal for Drawbridge.js: testable with zero Flow object at all).
// ─────────────────────────────────────────────────────────────────────────

test('drawbridge: transform in isolation produces correct Cause[] shape, no Flow', () => {
  const core = new RingBufferCore(3);
  const drawbridge = buildRingGate(core);
  const produced = drawbridge.transform(new Cause('ring:push', { value: 'solo' }));
  assert.strictEqual(produced.length, 1);
  assert.strictEqual(produced[0].type, 'ring:pushed');
  assert.strictEqual(produced[0].data.value, 'solo');
  assert.strictEqual(produced[0].data.wasFull, false);
});

test('drawbridge: transform emits ring:evicted only when a push actually evicts', () => {
  const core = new RingBufferCore(1);
  const drawbridge = buildRingGate(core);
  const first = drawbridge.transform(new Cause('ring:push', { value: 'a' }));
  assert.strictEqual(first.length, 1); // no eviction yet
  const second = drawbridge.transform(new Cause('ring:push', { value: 'b' }));
  assert.strictEqual(second.length, 2);
  assert.strictEqual(second[1].type, 'ring:evicted');
  assert.strictEqual(second[1].data.value, 'a');
});

test('drawbridge: schema validateOutput catches wrong shape', () => {
  const core = new RingBufferCore(3);
  const drawbridge = buildRingGate(core);
  const result = drawbridge.validateOutput({ index: 'not-a-number', wasFull: false });
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.wrongType[0].key, 'index');
});

test('axioms: ring:no-undefined rejects in isolation', () => {
  const [noUndefined] = buildRingAxioms();
  assert.strictEqual(noUndefined.check(new Cause('ring:push', { value: undefined })), false);
  assert.strictEqual(noUndefined.check(new Cause('ring:push', { value: 0 })), true);
  assert.strictEqual(noUndefined.check(new Cause('ring:push', { value: null })), true);
});

test('axioms: ring:no-function rejects functions', () => {
  const [, noFunction] = buildRingAxioms();
  assert.strictEqual(noFunction.check(new Cause('ring:push', { value: () => {} })), false);
  assert.strictEqual(noFunction.check(new Cause('ring:push', { value: 'ok' })), true);
});

test('axioms: ring:size-budget is soft and catches unserializable circular data', () => {
  const [, , sizeBudget] = buildRingAxioms({ sizeBudgetBytes: 1000 });
  assert.strictEqual(sizeBudget.severity, 'soft');
  const circular = {}; circular.self = circular;
  assert.strictEqual(sizeBudget.check(new Cause('ring:push', { value: circular })), false);
  assert.strictEqual(sizeBudget.check(new Cause('ring:push', { value: 'small' })), true);
});

test('axioms: ring:size-budget flags oversized items', () => {
  const [, , sizeBudget] = buildRingAxioms({ sizeBudgetBytes: 10 });
  assert.strictEqual(sizeBudget.check(new Cause('ring:push', { value: 'this string is definitely over ten bytes' })), false);
});

// ─────────────────────────────────────────────────────────────────────────
// LAYER 3 — full wired Flow (createRingStream). Hard axioms actually drawbridge.
// ─────────────────────────────────────────────────────────────────────────

test('flow: push through full WARP wiring updates core', () => {
  const { push, core } = createRingStream(3);
  push('a'); push('b');
  assert.deepStrictEqual(core.toArray(), ['a', 'b']);
});

test('flow: push() return value has correct shape — not the raw stored value', () => {
  // Regression test: an earlier version returned core.tail(1)[0] (the raw
  // pushed value itself) instead of push metadata. That's a silent-enough
  // bug that all other tests still passed — they only checked core state,
  // never the facade's own return shape — while the live API response was
  // visibly wrong ({"0":"a","ok":true} from spreading a string). §12.2:
  // a test that never asserts the actual contract proves nothing about it.
  const { push } = createRingStream(3);
  const r1 = push('a');
  assert.strictEqual(typeof r1, 'object');
  assert.strictEqual(r1.value, 'a');
  assert.strictEqual(r1.wasFull, false);
  assert.strictEqual(r1.evicted, null);
  assert.strictEqual(typeof r1.index, 'number');
});

test('flow: push() return value reports eviction correctly', () => {
  const { push } = createRingStream(1);
  push('a');
  const r2 = push('b');
  assert.strictEqual(r2.evicted, 'a');
  assert.strictEqual(r2.wasFull, true);
});

test('flow: hard axiom violation throws and does NOT mutate core', () => {
  const { push, core } = createRingStream(3);
  push('a');
  assert.throws(() => push(undefined), /rejected by hard axiom/);
  assert.deepStrictEqual(core.toArray(), ['a']);
});

test('flow: hard axiom rejection is logged, not silent', () => {
  const { push, flow } = createRingStream(3);
  try { push(() => {}); } catch { /* expected */ }
  assert.strictEqual(flow.rejected.length, 1);
  assert.ok(flow.rejected[0].failures.some(f => f.axiomId === 'ring:no-function'));
});

test('flow: soft axiom violation does NOT block the push', () => {
  const { push, core } = createRingStream(3, { sizeBudgetBytes: 5 });
  push('this is definitely more than five bytes'); // soft violation, should still succeed
  assert.strictEqual(core.size(), 1);
});

test('flow: every dispatch step is recorded in FlowLog (nothing silent)', () => {
  const { push, log } = createRingStream(3);
  push('a'); push('b');
  const entries = log.entries();
  // 2 pushes × 2 log entries each: the 'ring:push' cause (claimed by the
  // drawbridge) AND the 'ring:pushed' cause it produces (recursively emitted by
  // Flow, unclaimed since no drawbridge matches 'ring:pushed', so it lands in
  // `pending` — and is logged there too. Nothing that flows through the
  // Flow is exempt from the log, including a drawbridge's own output.
  assert.strictEqual(entries.length, 4);
  assert.strictEqual(entries[0].drawbridgeClaimed, 'ring:push');
  assert.strictEqual(entries[1].drawbridgeClaimed, null);
  assert.strictEqual(entries[1].causeType, 'ring:pushed');
});

// ─────────────────────────────────────────────────────────────────────────
// LAYER 4 — persistence: round trip, corruption, missing file.
// ─────────────────────────────────────────────────────────────────────────

test('persistence: missing snapshot returns null, not an error (fresh start)', () => {
  const dir = tmpDir();
  const p = new FilePersistence(path.join(dir, 'snap.json'));
  assert.strictEqual(p.load(), null);
});

test('persistence: save/load round trip preserves order and capacity', () => {
  const dir = tmpDir();
  const p = new FilePersistence(path.join(dir, 'snap.json'));
  const core = new RingBufferCore(3);
  core.push('a'); core.push('b'); core.push('c'); core.push('d');
  p.save(core);
  const loaded = p.load();
  assert.strictEqual(loaded.capacity, 3);
  assert.deepStrictEqual(loaded.items, ['b', 'c', 'd']);
});

test('persistence: corrupt snapshot throws loud, specific error (not silent empty buffer)', () => {
  const dir = tmpDir();
  const file = path.join(dir, 'snap.json');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, '{not valid json!!');
  const p = new FilePersistence(file);
  assert.throws(() => p.load(), /corrupt JSON/);
});

test('persistence: wrong-shape snapshot throws loud, specific error', () => {
  const dir = tmpDir();
  const file = path.join(dir, 'snap.json');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ foo: 'bar' }));
  const p = new FilePersistence(file);
  assert.throws(() => p.load(), /wrong shape/);
});

// ─────────────────────────────────────────────────────────────────────────
// LAYER 5 — eviction ledger.
// ─────────────────────────────────────────────────────────────────────────

test('eviction ledger: attaches to flow and records evictions only', () => {
  const dir = tmpDir();
  const ledger = new EvictionLedger(path.join(dir, 'ev.ndjson'));
  const { push, flow } = createRingStream(2);
  ledger.attach(flow);
  push('a'); push('b'); // no eviction yet
  assert.strictEqual(ledger.count(), 0);
  push('c'); // evicts 'a'
  assert.strictEqual(ledger.count(), 1);
  assert.strictEqual(ledger.tail(1)[0].value, 'a');
});

// ─────────────────────────────────────────────────────────────────────────
// LAYER 6 — full facade integration: restart recovery, capacity conflict,
// autosave, health reporting.
// ─────────────────────────────────────────────────────────────────────────

test('facade: push() return shape is correct end-to-end', () => {
  const dir = tmpDir();
  const rb = new RingBuffer({ capacity: 2, dataDir: dir, autosaveEvery: 0 });
  const r1 = rb.push('a');
  assert.strictEqual(r1.value, 'a');
  assert.strictEqual(r1.evicted, null);
  const r2 = rb.push('b');
  const r3 = rb.push('c');
  assert.strictEqual(r3.evicted, 'a');
});

test('facade: end-to-end push, eviction, health reflects state', () => {
  const dir = tmpDir();
  const rb = new RingBuffer({ capacity: 3, dataDir: dir, autosaveEvery: 0 });
  rb.push('a'); rb.push('b'); rb.push('c'); rb.push('d');
  assert.deepStrictEqual(rb.toArray(), ['b', 'c', 'd']);
  const h = rb.health();
  assert.strictEqual(h.status, 'healthy');
  assert.strictEqual(h.buffer.totalEvicted, 1);
});

test('facade: restart recovers exact prior state from disk', () => {
  const dir = tmpDir();
  const rb1 = new RingBuffer({ capacity: 3, dataDir: dir, autosaveEvery: 0 });
  rb1.push('a'); rb1.push('b'); rb1.push('c'); rb1.push('d');
  rb1.save();

  const rb2 = new RingBuffer({ dataDir: dir }); // no capacity passed — must come from snapshot
  assert.deepStrictEqual(rb2.toArray(), ['b', 'c', 'd']);
  rb2.push('e');
  assert.deepStrictEqual(rb2.toArray(), ['c', 'd', 'e']);
});

test('facade: capacity conflict with existing snapshot throws', () => {
  const dir = tmpDir();
  const rb1 = new RingBuffer({ capacity: 3, dataDir: dir, autosaveEvery: 0 });
  rb1.push('a'); rb1.save();
  assert.throws(() => new RingBuffer({ capacity: 5, dataDir: dir }), /conflicts with persisted capacity/);
});

test('facade: missing capacity with no snapshot throws', () => {
  const dir = tmpDir();
  assert.throws(() => new RingBuffer({ dataDir: dir }), /capacity must be provided/);
});

test('facade: autosave triggers at configured threshold', () => {
  const dir = tmpDir();
  const rb = new RingBuffer({ capacity: 5, dataDir: dir, autosaveEvery: 3 });
  rb.push(1); rb.push(2);
  assert.strictEqual(rb.persistence.exists(), false); // not yet
  rb.push(3);
  assert.strictEqual(rb.persistence.exists(), true); // autosave fired
});

test('facade: invalid push throws via facade and buffer state is untouched', () => {
  const dir = tmpDir();
  const rb = new RingBuffer({ capacity: 3, dataDir: dir, autosaveEvery: 0 });
  rb.push('a');
  assert.throws(() => rb.push(undefined));
  assert.deepStrictEqual(rb.toArray(), ['a']); // rejected push did not corrupt state
});

test('facade: high-volume concurrent-style rapid pushes stay correct', () => {
  const dir = tmpDir();
  const rb = new RingBuffer({ capacity: 50, dataDir: dir, autosaveEvery: 0 });
  for (let i = 0; i < 5000; i++) rb.push(i);
  const arr = rb.toArray();
  assert.strictEqual(arr.length, 50);
  assert.strictEqual(arr[0], 4950);
  assert.strictEqual(arr[49], 4999);
});

summarize();
