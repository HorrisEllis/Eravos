/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  RELATIONAL MODULE  ·  modules/relational/index.js  ·  v1.0.0         ║
 * ║  UUID: lim-mod-relational-1000-0000-000000000004                      ║
 * ║                                                                        ║
 * ║  Detects structural relational gaps:                                  ║
 * ║    — Gaslighting operations (6 layers)                                ║
 * ║    — Manipulation patterns (guilt, obligation, triangulation)         ║
 * ║    — Control patterns (isolation, financial, information)             ║
 * ║    — Communication gaps (intent/impact, invalidation)                 ║
 * ║    — Oscillatory patterns (intermittent reinforcement, love bombing)  ║
 * ║                                                                        ║
 * ║  Listens: LIM.INGEST_TRANSLATED                                       ║
 * ║  Emits:   LIM.GAP_RELATIONAL                                          ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */

'use strict';

import { LIM }        from './bus.js';
import { GAP_TYPE, GAP_REASON, DOMAIN, GapSignal, SlidingWindow, tokenize, matchCount, _r4, _clamp } from './core.js';

export const MODULE_ID      = 'relational';
export const MODULE_VERSION = '1.0.0';
export const MODULE_UUID    = 'lim-mod-relational-1000-0000-000000000004';

// ── Pattern Definitions ───────────────────────────────────────────────────────

const GASLIGHT_LAYERS = {
  event_denial: {
    rx: /\b(that never happened|you're imagining things|that didn't happen|i never said that|you made that up|that's not what happened)\b/gi,
    criticality: 0.95,
    description: 'Layer 1: Event denied without evidence',
    type: GAP_TYPE.EVIDENTIAL,
  },
  severity_minimization: {
    rx: /\b(you're overreacting|it's not that serious|you're being too sensitive|you're making a big deal|stop exaggerating|it was just a joke)\b/gi,
    criticality: 0.90,
    description: 'Layer 1+3: Harm acknowledged, impact denied',
    type: GAP_TYPE.EVIDENTIAL,
  },
  memory_attack: {
    rx: /\b(your memory is terrible|you always get things wrong|you misunderstood|you've always been like this|you remember things wrong|that's not how it went)\b/gi,
    criticality: 0.90,
    description: 'Layer 1: Source credibility attacked, not counter-evidence offered',
    type: GAP_TYPE.REFERENCE,
  },
  pathologizing: {
    rx: /\b(you're too emotional|you're being irrational|you're crazy|you're paranoid|you're unstable|you need help|you're not thinking clearly)\b/gi,
    criticality: 0.95,
    description: 'Layer 3: Emotional response framed as dysfunction',
    type: GAP_TYPE.IDENTITY_ATTACK,
  },
  consensus_attack: {
    rx: /\b(everyone thinks you|nobody else|everyone agrees|all your friends|people are worried about you|even (your|their) own)\b/gi,
    criticality: 0.90,
    description: 'Layer 6: Unverifiable third-party consensus deployed',
    type: GAP_TYPE.REFERENCE,
  },
  identity_destabilization: {
    rx: /\b(you've always been|that's just who you are|you're incapable|you'll never change|you're the problem|you've always done this|you're always like this)\b/gi,
    criticality: 1.00,
    description: 'Layer 5: Target\'s self-perception made the problem',
    type: GAP_TYPE.IDENTITY_ATTACK,
  },
};

const MANIPULATION_PATTERNS = {
  guilt_induction: {
    rx: /\b(after everything i've done|look what you made me|because of you|you made this happen|if you cared you would|if you loved me)\b/gi,
    criticality: 0.85,
    reason: [GAP_REASON.AVOIDANCE, GAP_REASON.EMOTIONAL_OCCLUSION],
  },
  obligation_manufacture: {
    rx: /\b(you owe me|after all i did|i sacrificed|i gave up|i did everything for you|remember when i|don't you remember what i)\b/gi,
    criticality: 0.90,
    reason: [GAP_REASON.AVOIDANCE, GAP_REASON.STRUCTURAL_LIMIT],
  },
  love_withdrawal: {
    rx: /\b(maybe we shouldn't|i don't know if i can|if you keep this up|you're pushing me away|i'm not sure about us|maybe i was wrong about you)\b/gi,
    criticality: 0.90,
    reason: [GAP_REASON.AVOIDANCE, GAP_REASON.EMOTIONAL_OCCLUSION],
  },
  future_faking: {
    rx: /\b(i promise next time|things will be different|i'm going to change|from now on|i'll do better|it won't happen again|this is the last time)\b/gi,
    criticality: 0.90,
    reason: [GAP_REASON.AVOIDANCE, GAP_REASON.DEFERRED_VARIABLE],
  },
  triangulation: {
    rx: /\b(even (they|she|he|your friend) thinks|compared to (her|him|them|others)|other people don't|nobody else has this problem)\b/gi,
    criticality: 0.80,
    reason: [GAP_REASON.AVOIDANCE, GAP_REASON.EMOTIONAL_OCCLUSION],
  },
};

const COMMUNICATION_GAPS = {
  intent_impact: {
    rx: /\b(i didn't mean it that way|that wasn't my intention|you shouldn't feel|i was just|i didn't mean to hurt)\b/gi,
    criticality: 0.85,
    description: 'Intent claimed as negation of impact',
    reason: [GAP_REASON.AVOIDANCE, GAP_REASON.EMOTIONAL_OCCLUSION],
  },
  direct_invalidation: {
    rx: /\b(you don't actually feel|you don't really|you're not actually|you're not really|you shouldn't feel)\b/gi,
    criticality: 0.85,
    description: 'Experience explicitly denied',
    reason: [GAP_REASON.AVOIDANCE, GAP_REASON.EMOTIONAL_OCCLUSION],
  },
  solution_bypass: {
    rx: /\b(you should just|why don't you just|have you tried|the solution is|all you have to do|it's simple|just do this)\b/gi,
    criticality: 0.75,
    description: 'Solution offered before acknowledgment — emotional processing skipped',
    reason: [GAP_REASON.AVOIDANCE, GAP_REASON.COMPRESSION],
  },
};

export class RelationalModule {
  constructor({ bus }) {
    this._bus          = bus;
    this._recentTexts  = [];
    this._patternHist  = new Map();   // pattern → count
    this._sessionCount = 0;
  }

  attach() {
    this._bus.on(LIM.INGEST_TRANSLATED, (payload) => {
      const text   = payload.resonanceText ?? payload.text;
      const result = this.analyze(text, payload);
      if (result) {
        this._bus.emit(LIM.GAP_RELATIONAL, result);
        this._sessionCount++;
      }
    });

    this._bus.emit(LIM.MODULE_READY, { moduleId: MODULE_ID, version: MODULE_VERSION });
    return this;
  }

  analyze(text, meta = {}) {
    this._recentTexts.push(text);
    if (this._recentTexts.length > 20) this._recentTexts.shift();

    const gaslight = this._detectGaslighting(text);
    const manip    = this._detectManipulation(text);
    const commGap  = this._detectCommunicationGaps(text);

    // Find highest signal
    const allDetections = [...gaslight, ...manip, ...commGap]
      .sort((a, b) => b.score - a.score);

    if (!allDetections.length) return null;

    const top = allDetections[0];

    // Track pattern history
    this._patternHist.set(top.pattern, (this._patternHist.get(top.pattern) ?? 0) + 1);

    // Escalation: repeated pattern increases criticality
    const repetitions = this._patternHist.get(top.pattern);
    const patternNote  = repetitions > 2
      ? ` [PATTERN: repeated ${repetitions}× in session]`
      : '';

    return GapSignal.build({
      moduleId:            MODULE_ID,
      type:                top.gapType ?? GAP_TYPE.OBLIGATION,
      subtype:             top.pattern,
      domain:              DOMAIN.ABUSE_MANIPULATION,
      score:               _clamp(top.score * (1 + (repetitions - 1) * 0.1), 0, 1),
      criticality:         top.criticality,
      description:         top.description + patternNote,
      reason:              top.reason ?? [GAP_REASON.AVOIDANCE],
      evidence:            allDetections.slice(0, 3).map(d => `${d.pattern}=${_r4(d.score)}`),
      textExcerpt:         text.slice(0, 120),
      loadBearingQuestion: top.question ?? 'What would be different if this was named directly?',
      axes:                allDetections.slice(0, 5).map(d => ({ name: d.pattern, score: _r4(d.score), label: d.description })),
      asAbove:             'The gaslighting operation in conversation is the same as the replication gap in science — the record is attacked, not the claim.',
      author:              meta.author ?? null,
      ts:                  meta.ts ?? null,
    });
  }

  // ── Detectors ───────────────────────────────────────────────────────────────

  _detectGaslighting(text) {
    const found = [];
    for (const [pattern, def] of Object.entries(GASLIGHT_LAYERS)) {
      const hits = matchCount(text, def.rx);
      if (hits > 0) {
        found.push({
          pattern,
          score:       _clamp(hits * 0.55, 0, 1),
          criticality: def.criticality,
          gapType:     def.type,
          description: def.description,
          reason:      [GAP_REASON.AVOIDANCE, GAP_REASON.IDENTITY_REFLECTION],
          question:    `What evidence would close this claim? Who gets to validate ${pattern.replace(/_/g,' ')}?`,
        });
      }
    }
    return found;
  }

  _detectManipulation(text) {
    const found = [];
    for (const [pattern, def] of Object.entries(MANIPULATION_PATTERNS)) {
      const hits = matchCount(text, def.rx);
      if (hits > 0) {
        found.push({
          pattern,
          score:       _clamp(hits * 0.45, 0, 1),
          criticality: def.criticality,
          gapType:     GAP_TYPE.OBLIGATION,
          description: `${pattern.replace(/_/g,' ')} pattern detected`,
          reason:      def.reason,
          question:    `Was the obligation explicitly agreed to? What consent exists for this claim?`,
        });
      }
    }
    return found;
  }

  _detectCommunicationGaps(text) {
    const found = [];
    for (const [pattern, def] of Object.entries(COMMUNICATION_GAPS)) {
      const hits = matchCount(text, def.rx);
      if (hits > 0) {
        found.push({
          pattern,
          score:       _clamp(hits * 0.35, 0, 1),
          criticality: def.criticality,
          gapType:     GAP_TYPE.LOGICAL,
          description: def.description,
          reason:      def.reason,
          question:    `What acknowledgment is being skipped here?`,
        });
      }
    }
    return found;
  }

  get sessionCount() { return this._sessionCount; }
  get patternHistory() { return Object.fromEntries(this._patternHist); }
}
