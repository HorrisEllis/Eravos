'use strict';
const assert = require('assert');
const { createSentimentScorer, scoreText } = require('../sentiment-scorer.js');

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log(`  ok  - ${name}`); }
  catch (e) { fail++; console.log(`  FAIL - ${name}\n         ${e.message}`); }
}

test('positive text scores positive', () => {
  const r = scoreText('Thank you, I really appreciate you being so kind.');
  assert.ok(r.score > 0.15, `expected positive, got ${r.score}`);
});

test('negative text scores negative', () => {
  const r = scoreText('I am really hurt and angry, this is bad.');
  assert.ok(r.score < -0.15, `expected negative, got ${r.score}`);
});

test('negation flips polarity', () => {
  const positive = scoreText('this is good');
  const negated = scoreText('this is not good');
  assert.ok(negated.score < positive.score, 'negation should lower the score');
  assert.strictEqual(negated.polarity, 'negative');
});

test('intensifier amplifies magnitude', () => {
  const plain = scoreText('I am happy');
  const intensified = scoreText('I am really happy');
  assert.ok(Math.abs(intensified.score) >= Math.abs(plain.score), 'intensifier should not reduce magnitude');
});

test('neutral text with no lexicon hits scores near zero', () => {
  const r = scoreText('the table is next to the window');
  assert.strictEqual(r.hits, 0);
  assert.strictEqual(r.polarity, 'neutral');
});

test('empty string does not throw, scores neutral', () => {
  const r = scoreText('');
  assert.strictEqual(r.score, 0);
  assert.strictEqual(r.polarity, 'neutral');
});

test('rollingAvg smooths across calls within a window', () => {
  const s = createSentimentScorer({ windowSize: 3 });
  s.score('this is good');
  s.score('this is good');
  const r = s.score('this is bad');
  assert.notStrictEqual(r.rollingAvg, r.score, 'rolling avg should differ from single-call score once history exists');
});

test('domain-agnostic: no relationship/therapy-specific vocabulary required to score', () => {
  // scores general-purpose text unrelated to any relational/therapeutic domain
  const r = scoreText('The weather was great today, I had a wonderful time at the park.');
  assert.ok(r.score > 0, 'should score positive on fully generic, non-domain-specific text');
});

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exitCode = 1;
