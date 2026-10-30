'use strict';
const assert = require('assert');
const { Cause, Drawbridge, Axiom, Flow, FlowLog } = require('../core');

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log(`  ok — ${name}`); }
  catch (e) { fail++; console.log(`  FAIL — ${name}: ${e.message}`); }
}

console.log('WARP core tests');

test('Cause is immutable', () => {
  const e = new Cause('test.cause', { value: 1 });
  assert.throws(() => { e.data.value = 2; }, /* frozen data */);
  assert.strictEqual(e.data.value, 1);
});

test('Cause requires a non-empty type', () => {
  assert.throws(() => new Cause(''), /type must be a non-empty string/);
});

test('Drawbridge dispatches via signature match by default', () => {
  const g = new Drawbridge('foo.bar', { transform: () => {} });
  assert.strictEqual(g.matches(new Cause('foo.bar')), true);
  assert.strictEqual(g.matches(new Cause('other')), false);
});

test('Drawbridge.transform is pure — returns events, never touches a flow (testable in total isolation)', () => {
  const g = new Drawbridge('double', { transform: (cause) => new Cause('doubled', { v: cause.data.v * 2 }) });
  const result = g.transform(new Cause('double', { v: 21 }));
  assert.strictEqual(result.type, 'doubled');
  assert.strictEqual(result.data.v, 42);
  // No flow object was ever created or passed — this is the whole point.
});

test('Flow signature collision is a hard error', () => {
  const s = new Flow();
  s.register(new Drawbridge('x', { transform: () => {} }));
  assert.throws(() => s.register(new Drawbridge('x', { transform: () => {} })), /Signature collision/);
});

test('Flow depth-first dispatch — drawbridge returns the next cause, Flow emits it', () => {
  const s = new Flow();
  const seen = [];
  s.register(new Drawbridge('a', { transform: (e) => { seen.push('a'); return new Cause('b'); } }));
  s.register(new Drawbridge('b', { transform: () => { seen.push('b'); } }));
  s.emit(new Cause('a'));
  assert.deepStrictEqual(seen, ['a', 'b']);
});

test('Drawbridge returning an array of events emits all of them, depth-first', () => {
  const s = new Flow();
  const seen = [];
  s.register(new Drawbridge('fanout', { transform: () => [new Cause('x'), new Cause('y')] }));
  s.register(new Drawbridge('x', { transform: () => { seen.push('x'); } }));
  s.register(new Drawbridge('y', { transform: () => { seen.push('y'); } }));
  s.emit(new Cause('fanout'));
  assert.deepStrictEqual(seen, ['x', 'y']);
});

test('Unclaimed cause lands in pending', () => {
  const s = new Flow();
  s.emit(new Cause('unclaimed'));
  assert.strictEqual(s.pending.length, 1);
});

test('Axiom hard failure rejects the transform — never runs, never silent', () => {
  const s = new Flow();
  let ran = false;
  s.register(new Drawbridge('risky', { transform: () => { ran = true; } }));
  s.registerAxiom(new Axiom('no-negative', {
    severity: 'hard',
    check: (cause) => (cause.data.value ?? 0) >= 0,
  }));
  s.emit(new Cause('risky', { value: -5 }));
  assert.strictEqual(ran, false, 'drawbridge must not run on hard axiom failure');
  assert.strictEqual(s.rejected.length, 1);
  assert.strictEqual(s.pending.length, 0, 'rejected is a distinct bucket from pending');
});

test('Axiom soft failure logs but does not block', () => {
  const s = new Flow();
  let ran = false;
  s.register(new Drawbridge('ok', { transform: () => { ran = true; } }));
  s.registerAxiom(new Axiom('style-hint', { severity: 'soft', check: () => false }));
  s.emit(new Cause('ok', {}));
  assert.strictEqual(ran, true, 'soft failure must not block execution');
  assert.strictEqual(s.rejected.length, 0);
});

test('FlowLog records every dispatch, including rejections', () => {
  const log = new FlowLog();
  const s = new Flow({ log });
  s.register(new Drawbridge('a', { transform: () => {} }));
  s.registerAxiom(new Axiom('always-fail', { severity: 'hard', check: () => false }));
  s.emit(new Cause('a'));
  s.emit(new Cause('unclaimed'));
  assert.strictEqual(log.entries().length, 2);
});

test('hook() rejects unknown kinds and non-function plugins', () => {
  const s = new Flow();
  assert.throws(() => s.hook('nonsense', () => {}), /unknown hook kind/);
  assert.throws(() => s.hook('scorer', 'not-a-function'), /must be a function/);
});

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail > 0 ? 1 : 0);
