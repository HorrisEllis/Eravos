'use strict';
/**
 * Minimal zero-dep test runner. §5.5: a test framework is a dev-tool
 * exemption, but this project is small enough that even that dependency
 * doesn't earn its weight yet (§0.5) — plain assert + a tiny harness
 * covers everything the suite below needs.
 */
const assert = require('assert');

let pass = 0, fail = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    pass++;
    console.log(`  ok  - ${name}`);
  } catch (e) {
    fail++;
    failures.push({ name, error: e });
    console.log(`  FAIL - ${name}`);
    console.log(`         ${e.message}`);
  }
}

function summarize() {
  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) {
    console.log('\nFailures:');
    for (const f of failures) console.log(`  - ${f.name}: ${f.error.message}`);
    process.exitCode = 1;
  }
}

module.exports = { test, assert, summarize };
