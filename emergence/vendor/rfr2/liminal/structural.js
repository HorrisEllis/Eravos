/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  STRUCTURAL MODULE  ·  modules/structural/index.js  ·  v1.0.0         ║
 * ║  UUID: lim-mod-structural-1000-0000-000000000008                      ║
 * ║                                                                        ║
 * ║  The implicit architecture of the conversation itself.                ║
 * ║  What must be true for this conversation to be happening this way.    ║
 * ║  Frame analysis. Power geometry. Who defines terms.                   ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */

'use strict';

import { LIM }        from './bus.js';
import { GAP_TYPE, GAP_REASON, DOMAIN, GapSignal, tokenize, matchCount, _r4, _clamp } from './core.js';

export const MODULE_ID      = 'structural';
export const MODULE_VERSION = '1.0.0';
export const MODULE_UUID    = 'lim-mod-structural-1000-0000-000000000008';

export class StructuralAssumptionModule {
  constructor({ bus }) {
    this._bus          = bus;
    this._sessionCount = 0;
  }

  attach() {
    this._bus.on(LIM.INGEST_TRANSLATED, (payload) => {
      const text   = payload.resonanceText ?? payload.text;
      const result = this.analyze(text, payload);
      if (result) {
        this._bus.emit(LIM.GAP_STRUCTURAL, result);
        this._sessionCount++;
      }
    });
    this._bus.emit(LIM.MODULE_READY, { moduleId: MODULE_ID, version: MODULE_VERSION });
    return this;
  }

  analyze(text, meta = {}) {
    const words = tokenize(text);
    if (words.length < 5) return null;

    // Presupposition loading — the question contains a buried assumption
    const presupRe = /\b(when did you stop|why do you keep|how long have you been|isn't it true that|don't you think|you know that)\b/gi;
    const preHits  = matchCount(text, presupRe);

    // Frame control — who defines the terms
    const frameRe  = /\b(by definition|what i mean is|in other words|the way i see|my definition|let's define|let me reframe|the real question is)\b/gi;
    const frameHits= matchCount(text, frameRe);

    // Power geometry — who is positioned as expert / authority
    const powerRe  = /\b(i know better|trust me|you should|you need to|you have to|i'm telling you|as someone who knows|i've seen this)\b/gi;
    const powerHits= matchCount(text, powerRe);

    // Naturalisation — presenting contingent arrangements as inevitable
    const naturalRe= /\b(that's just how|it's always been|that's the way it is|that's just life|that's just reality|it can't be changed|there's no other way)\b/gi;
    const natHits  = matchCount(text, naturalRe);

    const composite = _clamp(
      (preHits   * 0.5 +
       frameHits * 0.4 +
       powerHits * 0.35 +
       natHits   * 0.4) / Math.max(1, words.length) * 8,
      0, 1
    );

    if (composite < 0.18) return null;

    const axes = [
      { name: 'presupposition_loading', score: _r4(_clamp(preHits * 0.5, 0, 1)),   label: 'buried assumption in the question itself' },
      { name: 'frame_control',          score: _r4(_clamp(frameHits * 0.4, 0, 1)), label: 'speaker controls definitional frame' },
      { name: 'power_geometry',         score: _r4(_clamp(powerHits * 0.35, 0, 1)),label: 'speaker positioned as authority over experience' },
      { name: 'naturalisation',         score: _r4(_clamp(natHits * 0.4, 0, 1)),   label: 'contingent arrangement presented as inevitable' },
    ].sort((a, b) => b.score - a.score);

    return GapSignal.build({
      moduleId:            MODULE_ID,
      type:                GAP_TYPE.ASSUMPTION,
      subtype:             'structural_assumption',
      domain:              DOMAIN.EPISTEMOLOGICAL,
      score:               composite,
      description:         `Structural gap: ${axes[0].label}`,
      reason:              [GAP_REASON.IDENTITY_REFLECTION, GAP_REASON.NARRATIVE_SOOTHING],
      evidence:            axes.filter(a => a.score > 0).map(a => `${a.name}=${a.score}`),
      textExcerpt:         text.slice(0, 120),
      loadBearingQuestion: 'What must be true for this conversation to be happening this way? Who benefits from the frame?',
      axes,
      author:              meta.author ?? null,
      ts:                  meta.ts ?? null,
    });
  }

  get sessionCount() { return this._sessionCount; }
}
