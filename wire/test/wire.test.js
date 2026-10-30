'use strict';
const assert = require('assert');
const { Component, Hook, Wire, Consumer } = require('../index.js');
const { Drawbridge, Axiom, Flow, Cause } = require('../../warp/core/index.js');

let pass = 0, fail = 0;
async function test(name, fn) {
  try { await fn(); pass++; console.log(`  ok  - ${name}`); }
  catch (e) { fail++; console.log(`  FAIL - ${name}\n         ${e.message}`); }
}

// ── real helper: a doubling component, built on real WARP ────────────────
function buildDoublerComponent() {
  const flow = new Flow({});
  flow.register(new Drawbridge('double.request', {
    transform: (cause) => [new Cause('double.result', { value: cause.data.n * 2 })],
  }));
  const component = new Component('doubler');
  component.defineHook(new Hook('double', {
    flow, causeType: 'double.request', resultType: 'double.result',
    buildCauseData: (n) => ({ n }),
  }));
  return component;
}

// ── real helper: an incrementing component, built on real WARP ──────────
function buildIncrementerComponent() {
  const flow = new Flow({});
  flow.register(new Drawbridge('increment.request', {
    transform: (cause) => [new Cause('increment.result', { value: cause.data.n + 1 })],
  }));
  const component = new Component('incrementer');
  component.defineHook(new Hook('increment', {
    flow, causeType: 'increment.request', resultType: 'increment.result',
    buildCauseData: (n) => ({ n }),
  }));
  return component;
}

async function main() {
  await test('Hook: real end-to-end call through actual WARP Flow/Drawbridge', async () => {
    const component = buildDoublerComponent();
    const result = await component.call('double', 21, { consumer: 'test' });
    assert.strictEqual(result.value, 42);
  });

  await test('Component: throws on unknown hook, lists real defined hooks in the error', async () => {
    const component = buildDoublerComponent();
    await assert.rejects(
      () => component.call('nonexistent', 1),
      /no such hook: 'nonexistent'.*Defined hooks: double/
    );
  });

  await test('Component: rejects defining the same hook name twice', () => {
    const component = buildDoublerComponent();
    assert.throws(() => component.defineHook(new Hook('double', {
      flow: new Flow({}), causeType: 'x', resultType: 'y',
    })), /already defined/);
  });

  await test('Component: real usage tracking, not just a count', async () => {
    const component = buildDoublerComponent();
    await component.call('double', 1, { consumer: 'alice' });
    await component.call('double', 2, { consumer: 'bob' });
    await component.call('double', 3, { consumer: 'alice' });
    const usage = component.usage('double');
    assert.strictEqual(usage.length, 3);
    assert.deepStrictEqual(component.consumers('double').sort(), ['alice', 'bob']);
  });

  await test('Consumer: auto-tags calls, no need to remember { consumer: ... } by hand', async () => {
    const component = buildDoublerComponent();
    const alice = new Consumer('alice');
    await alice.call(component, 'double', 5);
    assert.deepStrictEqual(component.consumers('double'), ['alice']);
  });

  await test('Hook: axiom rejection produces a real, specific error, not a silent failure', async () => {
    const badAxiom = new Axiom('always-fail', { severity: 'hard', check: () => false });
    const flow = new Flow({ axioms: [badAxiom] });
    flow.register(new Drawbridge('x.request', { transform: (c) => [new Cause('x.result', {})] }));
    const component = new Component('rejecting');
    component.defineHook(new Hook('x', { flow, causeType: 'x.request', resultType: 'x.result' }));
    await assert.rejects(() => component.call('x', {}), /rejected by hard axiom\(s\): always-fail/);
  });

  await test('Wire: real end-to-end -- carries a real result from one component to another', async () => {
    const doubler = buildDoublerComponent();
    const incrementer = buildIncrementerComponent();

    const wire = new Wire('double-then-increment', {
      to: incrementer, toHook: 'increment',
      transform: (doublerResult) => doublerResult.value, // {value: N} -> N, shaping across the boundary
    });

    const doubled = await doubler.call('double', 10, { consumer: 'test' });
    const final = await wire.carry(doubled);
    assert.strictEqual(final.value, 21); // (10*2)+1
    assert.strictEqual(wire.carryCount(), 1);
  });

  await test('Wire: its own carries show up as real, distinctly-named usage on the target component', async () => {
    const incrementer = buildIncrementerComponent();
    const wire = new Wire('some-source-to-incrementer', { to: incrementer, toHook: 'increment' });
    await wire.carry(5);
    assert.deepStrictEqual(incrementer.consumers('increment'), ['wire:some-source-to-incrementer']);
  });

  await test('Full network: Consumer -> Component -> Wire -> Component, real trace on both ends', async () => {
    const doubler = buildDoublerComponent();
    const incrementer = buildIncrementerComponent();
    const wire = new Wire('pipeline', { to: incrementer, toHook: 'increment', transform: (r) => r.value });
    const app = new Consumer('app');

    const doubled = await app.call(doubler, 'double', 100);
    const final = await wire.carry(doubled);

    assert.strictEqual(final.value, 201); // (100*2)+1
    assert.deepStrictEqual(doubler.consumers('double'), ['app']);
    assert.deepStrictEqual(incrementer.consumers('increment'), ['wire:pipeline']);
  });

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exitCode = 1;
}

main();
