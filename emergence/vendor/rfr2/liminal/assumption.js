/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  ASSUMPTION MODULE  ·  modules/assumption/index.js  ·  v1.0.0         ║
 * ║  UUID: lim-mod-assumption-1000-0000-000000000001                      ║
 * ║                                                                        ║
 * ║  Surfaces load-bearing assumptions treated as facts.                  ║
 * ║  Things said without evidence that structure everything downstream.   ║
 * ║                                                                        ║
 * ║  Listens: LIM.INGEST_TRANSLATED                                       ║
 * ║  Emits:   LIM.GAP_ASSUMPTION                                          ║
 * ║                                                                        ║
 * ║  §B1  Zero imports from other modules.                               ║
 * ║  §C2  All outputs are signals, not diagnoses.                        ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * DETECTION AXES:
 *   A. Assertion without evidence — confident declarative, no qualification
 *   B. Causal leap — "therefore / so / that's why" without antecedent
 *   C. Universalization — "always / never / everyone / nobody"
 *   D. Unnamed agent — "they / people / someone" with no referent
 *   E. Tautology — conclusion restates premise
 *   F. Epistemic closure — all counter-evidence rerouted to confirmation
 */

'use strict';

import { LIM }        from './bus.js';
import { GAP_TYPE, GAP_REASON, DOMAIN, GapSignal, SlidingWindow, tokenize, matchCount, _r4, _clamp } from './core.js';

export const MODULE_ID      = 'assumption';
export const MODULE_VERSION = '1.0.0';
export const MODULE_UUID    = 'lim-mod-assumption-1000-0000-000000000001';

export class AssumptionModule {
  constructor({ bus }) {
    this._bus         = bus;
    this._assertionW  = new SlidingWindow(20);
    this._causalW     = new SlidingWindow(20);
    this._universalW  = new SlidingWindow(20);
    this._hedgeW      = new SlidingWindow(20);
    this._history     = [];
    this._sessionCount = 0;
  }

  attach() {
    this._bus.on(LIM.INGEST_TRANSLATED, (payload) => {
      const result = this.analyze(payload.resonanceText ?? payload.text, payload);
      if (result) {
        this._bus.emit(LIM.GAP_ASSUMPTION, result);
        this._sessionCount++;
      }
    });

    this._bus.emit(LIM.MODULE_READY, { moduleId: MODULE_ID, version: MODULE_VERSION });
    return this;
  }

  analyze(text, meta = {}) {
    const words = tokenize(text);
    if (words.length < 3) return null;

    this._history.push(text);
    if (this._history.length > 10) this._history.shift();

    const a = this._axisAssertion(text, words);
    const b = this._axisCausalLeap(text, words);
    const c = this._axisUniversal(text, words);
    const d = this._axisUnnamedAgent(text, words);
    const e = this._axisTautology(text, words);
    const f = this._axisEpistemicClosure(text, words);

    const composite = _clamp(
      a.score * 0.25 +
      b.score * 0.25 +
      c.score * 0.20 +
      d.score * 0.15 +
      e.score * 0.10 +
      f.score * 0.05,
      0, 1
    );

    if (composite < 0.18) return null;

    const axes = [
      { name: 'assertion_without_evidence', score: _r4(a.score), label: a.label },
      { name: 'causal_leap',                score: _r4(b.score), label: b.label },
      { name: 'universalization',            score: _r4(c.score), label: c.label },
      { name: 'unnamed_agent',               score: _r4(d.score), label: d.label },
      { name: 'tautology',                   score: _r4(e.score), label: e.label },
      { name: 'epistemic_closure',           score: _r4(f.score), label: f.label },
    ].sort((a, b) => b.score - a.score);

    const dominant = axes[0];

    return GapSignal.build({
      moduleId:             MODULE_ID,
      type:                 GAP_TYPE.ASSUMPTION,
      subtype:              dominant.name,
      domain:               DOMAIN.EPISTEMOLOGICAL,
      score:                composite,
      description:          `Load-bearing assumption detected: ${dominant.label}`,
      reason:               _inferReasons(dominant.name),
      evidence:             axes.filter(a => a.score > 0).map(a => `${a.name}=${a.score}`),
      textExcerpt:          text.slice(0, 120),
      loadBearingQuestion:  _loadBearingQuestion(dominant.name),
      axes,
      asAbove:              'The unexamined assumption in a conversation is the unexamined premise in a proof is the unchecked input in a program.',
      author:               meta.author ?? null,
      ts:                   meta.ts ?? null,
    });
  }

  // ── Detection Axes ──────────────────────────────────────────────────────────

  _axisAssertion(text, words) {
    const assertion = /\b(is|are|was|were|will be|must be|clearly|obviously|definitely|certainly|absolutely|always|never|of course|everyone knows|it is obvious|it is clear)\b/gi;
    const hedge     = /\b(maybe|perhaps|might|could|seems|appears|possibly|probably|somewhat|kind of|sort of|i think|i believe|i feel|i wonder|it seems like)\b/gi;
    const aHits     = matchCount(text, assertion);
    const hHits     = matchCount(text, hedge);
    this._hedgeW.push(hHits / Math.max(1, words.length));
    const score = _clamp((aHits - hHits * 1.5) / Math.max(1, words.length) * 8, 0, 1);
    this._assertionW.push(score);
    return { score, label: 'confident declarative without qualification' };
  }

  _axisCausalLeap(text, words) {
    const leap     = /\b(therefore|so|that's why|which means|hence|clearly because|obviously because|that proves|that shows|this confirms|this proves)\b/gi;
    const evidence = /\b(because|since|given that|as evidenced|data shows|research shows|studies show|the fact that|we know that|evidence suggests)\b/gi;
    const lHits    = matchCount(text, leap);
    const eHits    = matchCount(text, evidence);
    const score    = _clamp(lHits * 0.4 - eHits * 0.3, 0, 1);
    this._causalW.push(score);
    return { score, label: 'conclusion asserted without demonstrated premise' };
  }

  _axisUniversal(text, words) {
    const universals = /\b(everyone|nobody|always|never|all|none|every single|no one|completely|totally|entirely|the whole|absolutely everyone|without exception|invariably)\b/gi;
    const bounded    = /\b(some|most|many|often|usually|generally|typically|in my experience|in this case|in many situations)\b/gi;
    const uHits      = matchCount(text, universals);
    const bHits      = matchCount(text, bounded);
    const score      = _clamp((uHits * 0.5 - bHits * 0.25) / Math.max(1, words.length) * 6, 0, 1);
    this._universalW.push(score);
    return { score, label: 'unbounded claim — always/never/everyone without basis' };
  }

  _axisUnnamedAgent(text, words) {
    const vague        = /\b(they|people|someone|somebody|everybody|the system|society|those people|them|the powers that be|certain people)\b/gi;
    const hits         = matchCount(text, vague);
    const prevAsserted = this._history.slice(-3).some(t => /\b(is|was|will|must)\b/.test(t));
    const score        = _clamp(hits * 0.3 * (prevAsserted ? 1.5 : 1) / Math.max(1, words.length) * 5, 0, 1);
    return { score, label: '"they/people/someone" — attribution without referent' };
  }

  _axisTautology(text, words) {
    // Simple heuristic: conclusion restates subject
    const tautRe = /\b(\w+)\b.{0,30}\bbecause\b.{0,30}\1/gi;
    const hits   = (text.match(tautRe) ?? []).length;
    const score  = _clamp(hits * 0.5, 0, 1);
    return { score, label: 'conclusion restates premise — circular reasoning' };
  }

  _axisEpistemicClosure(text, words) {
    // Counter-evidence language followed by dismissal
    const counter  = /\b(but|however|although|even though|despite|nevertheless)\b/gi;
    const dismissal= /\b(still|regardless|anyway|doesn't matter|doesn't change|that doesn't mean|irrelevant|beside the point)\b/gi;
    const cHits    = matchCount(text, counter);
    const dHits    = matchCount(text, dismissal);
    const score    = _clamp(cHits > 0 && dHits > 0 ? (cHits + dHits) * 0.15 : 0, 0, 1);
    return { score, label: 'counter-evidence rerouted to confirmation' };
  }

  get sessionCount() { return this._sessionCount; }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _loadBearingQuestion(axisName) {
  return {
    assertion_without_evidence: 'What is the evidence for this? What would have to be false for this to not be true?',
    causal_leap:                'What is the missing step between the premise and this conclusion?',
    universalization:           'Who is the exception? What would falsify "always/never/everyone"?',
    unnamed_agent:              'Who specifically? What is the source of this attribution?',
    tautology:                  'What does this claim add beyond restating what it assumes?',
    epistemic_closure:          'What evidence would change this view? Where is the update path?',
  }[axisName] ?? 'What is assumed here that has not been examined?';
}

function _inferReasons(axisName) {
  return {
    assertion_without_evidence: [GAP_REASON.COMPRESSION, GAP_REASON.IDENTITY_REFLECTION],
    causal_leap:                [GAP_REASON.ATTENTION, GAP_REASON.COMPRESSION],
    universalization:           [GAP_REASON.COMPRESSION, GAP_REASON.AVOIDANCE],
    unnamed_agent:              [GAP_REASON.AVOIDANCE, GAP_REASON.EMOTIONAL_OCCLUSION],
    tautology:                  [GAP_REASON.NARRATIVE_SOOTHING, GAP_REASON.IDENTITY_REFLECTION],
    epistemic_closure:          [GAP_REASON.IDENTITY_REFLECTION, GAP_REASON.AVOIDANCE],
  }[axisName] ?? [GAP_REASON.ATTENTION];
}
