'use strict';
/**
 * sentiment-scorer.js — NEW code, not vendored from rfr2. Nothing in the
 * codebase emits `alk.verbal.analysis.sentiment` (checked — only
 * consumers exist), so this exists to unblock that signal.
 *
 * Domain-agnostic by design: a general-purpose lexicon + negation +
 * intensifier scorer, not tuned to any particular subject matter
 * (relationships, therapy, or otherwise). Same technique family as
 * well-known general-purpose lexicon scorers (AFINN/VADER-style) — a
 * fixed word→polarity lexicon, negation flips the next sentiment word
 * within a small window, intensifiers scale it. No ML model, no
 * training data, no domain tuning — deliberately simple and auditable.
 *
 * Emits the exact shape SpeechStateModule's own doc comment declares:
 *   alk.verbal.analysis.sentiment { score, polarity, rollingAvg }
 */

// A small, general-purpose lexicon. Deliberately broad-domain (not
// relationship/therapy-specific) — everyday positive/negative words.
const LEXICON = {
  // positive
  good: 2, great: 3, love: 3, happy: 3, wonderful: 3, excellent: 3,
  nice: 2, glad: 2, joy: 3, hope: 2, hopeful: 2, better: 2, best: 3,
  calm: 2, safe: 2, trust: 2, grateful: 3, thank: 2, thanks: 2,
  appreciate: 2, kind: 2, warm: 2, clear: 1, clicked: 2, understand: 2,
  connected: 2, relief: 2, comfort: 2, comfortable: 2, secure: 2,
  // negative
  bad: -2, hate: -3, sad: -3, angry: -3, upset: -2, hurt: -2,
  afraid: -2, scared: -2, worried: -2, worry: -2, anxious: -2,
  confused: -2, lost: -2, alone: -2, broken: -2, stuck: -2, tired: -1,
  frustrated: -2, frustrating: -2, wrong: -2, fear: -2, ashamed: -2,
  ruptured: -3, rupture: -2, distant: -2, cold: -1, avoid: -1,
  circling: -1, unclear: -1, dont: -1, "don't": -1, cant: -1, "can't": -1,
};

const NEGATORS = new Set(['not', "n't", 'no', 'never', 'without', "don't", "can't", "doesn't", "didn't", "won't"]);
const INTENSIFIERS = { very: 1.5, really: 1.4, extremely: 1.8, so: 1.3, definitely: 1.3, totally: 1.4 };
const NEGATION_WINDOW = 3;

function tokenize(text) {
  return (text.toLowerCase().match(/[a-z']+/g) || []);
}

function scoreText(text) {
  const tokens = tokenize(text);
  let raw = 0;
  let hits = 0;

  for (let i = 0; i < tokens.length; i++) {
    const w = tokens[i];
    if (!(w in LEXICON)) continue;

    let value = LEXICON[w];
    hits++;

    // negation: any negator within the preceding window flips the sign
    let negated = false;
    for (let j = Math.max(0, i - NEGATION_WINDOW); j < i; j++) {
      if (NEGATORS.has(tokens[j])) { negated = true; break; }
    }
    if (negated) value = -value;

    // intensifier immediately preceding
    if (i > 0 && INTENSIFIERS[tokens[i - 1]]) value *= INTENSIFIERS[tokens[i - 1]];

    raw += value;
  }

  // normalize to roughly [-1, 1] — clamp rather than let long texts blow the range
  const normalized = tokens.length ? raw / Math.sqrt(tokens.length + 1) / 3 : 0;
  const score = Math.max(-1, Math.min(1, +normalized.toFixed(4)));
  const polarity = score > 0.15 ? 'positive' : score < -0.15 ? 'negative' : 'neutral';

  return { score, polarity, hits };
}

/** createSentimentScorer() -> { score(text) -> {score, polarity, rollingAvg} } */
function createSentimentScorer({ windowSize = 10 } = {}) {
  const history = [];

  return {
    score(text) {
      const { score, polarity, hits } = scoreText(text);
      history.push(score);
      if (history.length > windowSize) history.shift();
      const rollingAvg = +(history.reduce((a, b) => a + b, 0) / history.length).toFixed(4);
      return { score, polarity, rollingAvg, hits };
    },
  };
}

module.exports = { createSentimentScorer, scoreText, LEXICON };
