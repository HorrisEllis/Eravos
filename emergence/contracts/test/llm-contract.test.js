'use strict';
/**
 * llm-contract.test.js — shape validation only, per the contract's own
 * honest acceptance.contract_tests: false. No LLM bridge implementation
 * exists yet to test real behavior against (no component in Emergence
 * calls an LLM). This proves the contract document itself is
 * well-formed and internally consistent, nothing more.
 */
const assert = require('assert');

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log(`  ok  - ${name}`); }
  catch (e) { fail++; console.log(`  FAIL - ${name}\n         ${e.message}`); }
}

async function main() {
  const { LLM_CONTRACT } = await import('../LLM_CONTRACT.js');

  test('top-level shape matches rheon-idea-os\'s real seam contract format', () => {
    for (const key of ['name', 'version', 'status', 'between', 'description', 'contract', 'isolation', 'metrics', 'traceability', 'acceptance']) {
      assert.ok(key in LLM_CONTRACT, `missing required top-level field: ${key}`);
    }
  });

  test('every command has payload, returns, errors, idempotent, timeout_ms', () => {
    for (const [name, cmd] of Object.entries(LLM_CONTRACT.contract.commands)) {
      for (const field of ['payload', 'returns', 'errors', 'idempotent', 'timeout_ms']) {
        assert.ok(field in cmd, `command ${name} missing ${field}`);
      }
      assert.strictEqual(typeof cmd.idempotent, 'boolean', `${name}.idempotent must be boolean`);
      assert.strictEqual(typeof cmd.timeout_ms, 'number', `${name}.timeout_ms must be a number`);
      assert.ok(Array.isArray(cmd.errors), `${name}.errors must be an array`);
    }
  });

  test('every error has a code and a message', () => {
    for (const [name, cmd] of Object.entries(LLM_CONTRACT.contract.commands)) {
      for (const err of cmd.errors) {
        assert.ok(err.code, `an error in ${name} is missing a code`);
        assert.ok(err.message, `${name}.${err.code} is missing a message`);
      }
    }
  });

  test('every event has payload and ordering', () => {
    for (const [name, ev] of Object.entries(LLM_CONTRACT.contract.events)) {
      assert.ok('payload' in ev, `event ${name} missing payload`);
      assert.ok(['guaranteed', 'best-effort'].includes(ev.ordering), `event ${name} has invalid ordering: ${ev.ordering}`);
    }
  });

  test('isolation rules include the two carried from ollama.js verbatim', () => {
    assert.ok(LLM_CONTRACT.isolation.rules.includes('Local first. Cloud is never the default path.'));
    assert.ok(LLM_CONTRACT.isolation.rules.includes('If the LLM bridge is unavailable, an offline mirror runs. Nothing silently fails.'));
  });

  test('status is honestly draft -- no implementation exists yet', () => {
    assert.strictEqual(LLM_CONTRACT.status, 'draft');
    assert.strictEqual(LLM_CONTRACT.acceptance.contract_tests, false);
  });

  test('llm.complete timeout matches ollama.js\'s real TIMEOUT_MS constant (30000), not an arbitrary number', () => {
    assert.strictEqual(LLM_CONTRACT.contract.commands['llm.complete'].timeout_ms, 30000);
  });

  test('llm.available timeout matches ollama.js\'s real availability-check timeout (3000), not an arbitrary number', () => {
    assert.strictEqual(LLM_CONTRACT.contract.commands['llm.available'].timeout_ms, 3000);
  });

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exitCode = 1;
}

main();
