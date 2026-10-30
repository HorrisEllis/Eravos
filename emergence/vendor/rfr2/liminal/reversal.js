/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  REVERSAL MODULE  ·  modules/reversal/index.js  ·  v1.0.0             ║
 * ║  UUID: lim-mod-reversal-1000-0000-000000000007                        ║
 * ║                                                                        ║
 * ║  Detects meaning inversions: irony, negation-as-assertion,            ║
 * ║  "fine" meaning not fine, minimization as maximization,               ║
 * ║  rhetorical questions that are actually accusations.                  ║
 * ║                                                                        ║
 * ║  Listens: LIM.INGEST_TRANSLATED                                       ║
 * ║  Emits:   LIM.GAP_REVERSAL                                            ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */

'use strict';

import { LIM }        from './bus.js';
import { GAP_TYPE, GAP_REASON, DOMAIN, GapSignal, tokenize, matchCount, _r4, _clamp } from './core.js';

export const MODULE_ID      = 'reversal';
export const MODULE_VERSION = '1.0.0';
export const MODULE_UUID    = 'lim-mod-reversal-1000-0000-000000000007';

// Loaded reversal pairs — surface word → likely inversion
const REVERSAL_PAIRS = [
  { surface: /\b(fine|it's fine|i'm fine|we're fine)\b/gi,          inversion: 'significant distress', weight: 0.60 },
  { surface: /\b(doesn't matter|it doesn't matter)\b/gi,            inversion: 'matters intensely',   weight: 0.55 },
  { surface: /\b(do whatever you want|suit yourself)\b/gi,          inversion: 'strong preference violated', weight: 0.65 },
  { surface: /\b(that's fine|go ahead|by all means)\b/gi,           inversion: 'not fine at all',      weight: 0.50 },
  { surface: /\b(it's okay|no worries|don't worry about it)\b/gi,   inversion: 'concern present',      weight: 0.45 },
  { surface: /\b(i don't care|whatever|doesn't matter to me)\b/gi,  inversion: 'high care, defended',  weight: 0.60 },
];

export class ReversalModule {
  constructor({ bus }) {
    this._bus          = bus;
    this._recentTexts  = [];
    this._sessionCount = 0;
  }

  attach() {
    this._bus.on(LIM.INGEST_TRANSLATED, (payload) => {
      const text   = payload.resonanceText ?? payload.text;
      const result = this.analyze(text, payload);
      if (result) {
        this._bus.emit(LIM.GAP_REVERSAL, result);
        this._sessionCount++;
      }
    });
    this._bus.emit(LIM.MODULE_READY, { moduleId: MODULE_ID, version: MODULE_VERSION });
    return this;
  }

  analyze(text, meta = {}) {
    this._recentTexts.push(text);
    if (this._recentTexts.length > 10) this._recentTexts.shift();

    const detections = [];

    // Loaded reversals
    for (const pair of REVERSAL_PAIRS) {
      const hits = matchCount(text, pair.surface);
      if (hits > 0) {
        // Look for surrounding charged context
        const chargeRe = /\b(but|however|actually|and yet|even though|after all|despite)\b/gi;
        const charged  = matchCount(text, chargeRe);
        const score    = _clamp(hits * pair.weight * (1 + charged * 0.2), 0, 1);
        if (score > 0.20) {
          detections.push({ name: 'loaded_reversal', score, label: `"${pair.surface.source}" → likely "${pair.inversion}"` });
        }
      }
    }

    // Negation density — high negation without resolution
    const negRe    = /\b(not|no|never|neither|nowhere|nothing|nobody|can't|won't|don't|isn't|aren't|wasn't|weren't|doesn't)\b/gi;
    const negHits  = matchCount(text, negRe);
    const words    = tokenize(text);
    const negScore = _clamp(negHits / Math.max(1, words.length) * 5 - 0.3, 0, 1);
    if (negScore > 0.25) {
      detections.push({ name: 'negation_cluster', score: negScore, label: 'high negation density — may assert through denial' });
    }

    // Rhetorical questions as accusations
    const rhetRe   = /\b(how could you|why would you|what were you thinking|do you even|were you even|don't you|can't you|is it too much to|why can't you)\b/gi;
    const rhetHits = matchCount(text, rhetRe);
    if (rhetHits > 0) {
      detections.push({ name: 'rhetorical_accusation', score: _clamp(rhetHits * 0.5, 0, 1), label: 'rhetorical question functioning as accusation' });
    }

    if (!detections.length) return null;

    const dominant   = detections.sort((a, b) => b.score - a.score)[0];
    const composite  = dominant.score;

    return GapSignal.build({
      moduleId:            MODULE_ID,
      type:                GAP_TYPE.CONTRADICTION,
      subtype:             'reversal',
      domain:              DOMAIN.COMMUNICATION,
      score:               composite,
      description:         `Reversal: ${dominant.label}`,
      reason:              [GAP_REASON.AVOIDANCE, GAP_REASON.EMOTIONAL_OCCLUSION],
      evidence:            detections.map(d => `${d.name}=${_r4(d.score)}`),
      textExcerpt:         text.slice(0, 120),
      loadBearingQuestion: 'What is the surface language actually saying? What would the inverse be?',
      axes:                detections,
      author:              meta.author ?? null,
      ts:                  meta.ts ?? null,
    });
  }

  get sessionCount() { return this._sessionCount; }
}
