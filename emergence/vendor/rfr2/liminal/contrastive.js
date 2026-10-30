/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  CONTRASTIVE MODULE  ·  modules/contrastive/index.js  ·  v1.0.0       ║
 * ║  UUID: lim-mod-contrastive-1000-0000-000000000006                     ║
 * ║                                                                        ║
 * ║  The gap between what is said and what the behavior/state is doing.   ║
 * ║  Semantic vs somatic divergence. Stated vs actual orientation.        ║
 * ║                                                                        ║
 * ║  Listens: LIM.INGEST_TRANSLATED                                       ║
 * ║  Emits:   LIM.GAP_CONTRASTIVE                                         ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */

'use strict';

import { LIM }        from './bus.js';
import { GAP_TYPE, GAP_REASON, DOMAIN, GapSignal, tokenize, matchCount, _r4, _clamp } from './core.js';

export const MODULE_ID      = 'contrastive';
export const MODULE_VERSION = '1.0.0';
export const MODULE_UUID    = 'lim-mod-contrastive-1000-0000-000000000006';

export class ContrastiveModule {
  constructor({ bus }) {
    this._bus          = bus;
    this._sessionCount = 0;
  }

  attach() {
    this._bus.on(LIM.INGEST_TRANSLATED, (payload) => {
      const text   = payload.resonanceText ?? payload.text;
      const result = this.analyze(text, payload);
      if (result) {
        this._bus.emit(LIM.GAP_CONTRASTIVE, result);
        this._sessionCount++;
      }
    });
    this._bus.emit(LIM.MODULE_READY, { moduleId: MODULE_ID, version: MODULE_VERSION });
    return this;
  }

  analyze(text, meta = {}) {
    const words = tokenize(text);
    if (words.length < 4) return null;

    // Belief-behavior gap: state X then act against X in same utterance
    const believeRe  = /\b(i believe|i think|i value|i care about|it's important to me|i'm committed to|my priority is)\b/gi;
    const actRe      = /\b(but i keep|but i still|but i always|but i can't stop|but i never|yet i|despite that)\b/gi;
    const bHits      = matchCount(text, believeRe);
    const aHits      = matchCount(text, actRe);
    const beliefGap  = bHits > 0 && aHits > 0 ? _clamp((bHits + aHits) * 0.3, 0, 1) : 0;

    // Word-emotion gap: emotional language contradicted by hedging
    const emotRe     = /\b(devastated|heartbroken|ecstatic|furious|terrified|overjoyed|destroyed)\b/gi;
    const hedgeRe    = /\b(a little|sort of|kind of|i guess|maybe|not really|a bit)\b/gi;
    const eHits      = matchCount(text, emotRe);
    const hHits      = matchCount(text, hedgeRe);
    const wordEmot   = eHits > 0 && hHits > 0 ? _clamp((eHits + hHits) * 0.25, 0, 1) : 0;

    // Cross-modal: body language described vs content
    const bodyRe     = /\b(shaking|heart racing|can't breathe|chest tight|throat tight|can't stop crying|laughing|smiling|numb|frozen)\b/gi;
    const calmRe     = /\b(it's fine|no problem|all good|completely calm|totally relaxed|not bothered)\b/gi;
    const bodyHits   = matchCount(text, bodyRe);
    const calmHits   = matchCount(text, calmRe);
    const crossModal = bodyHits > 0 && calmHits > 0 ? _clamp((bodyHits + calmHits) * 0.35, 0, 1) : 0;

    const composite = _clamp(beliefGap * 0.4 + wordEmot * 0.3 + crossModal * 0.3, 0, 1);
    if (composite < 0.18) return null;

    const axes = [
      { name: 'belief_behavior_gap', score: _r4(beliefGap), label: 'stated values contradict revealed actions' },
      { name: 'word_emotion_gap',    score: _r4(wordEmot),  label: 'extreme language hedged immediately' },
      { name: 'cross_modal',         score: _r4(crossModal),label: 'body state described contradicts lexical content' },
    ].sort((a, b) => b.score - a.score);

    return GapSignal.build({
      moduleId:            MODULE_ID,
      type:                GAP_TYPE.CONTRADICTION,
      subtype:             axes[0].name,
      domain:              DOMAIN.PSYCHOLOGICAL,
      score:               composite,
      description:         `Contrastive gap: ${axes[0].label}`,
      reason:              [GAP_REASON.AVOIDANCE, GAP_REASON.EMOTIONAL_OCCLUSION],
      evidence:            axes.filter(a => a.score > 0).map(a => `${a.name}=${a.score}`),
      textExcerpt:         text.slice(0, 120),
      loadBearingQuestion: 'What is the distance between the stated position and the actual orientation?',
      axes,
      author:              meta.author ?? null,
      ts:                  meta.ts ?? null,
    });
  }

  get sessionCount() { return this._sessionCount; }
}
