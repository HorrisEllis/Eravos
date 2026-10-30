/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  SHADOW FIELD MODULE  ·  modules/shadow/index.js  ·  v1.0.0           ║
 * ║  UUID: lim-mod-shadow-1000-0000-000000000002                          ║
 * ║                                                                        ║
 * ║  Surfaces what is emotionally or cognitively present but unspoken.    ║
 * ║  The shadow is not the lie — it is the unintegrated material.         ║
 * ║                                                                        ║
 * ║  Listens: LIM.INGEST_TRANSLATED                                       ║
 * ║  Emits:   LIM.GAP_SHADOW                                              ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * DETECTION AXES:
 *   A. Pronoun displacement — "you/they" when pattern suggests "I"
 *   B. Intensity mismatch — mild words over high-arousal signal
 *   C. Over-qualification — covering something with too many qualifiers
 *   D. Projected attribution — attributing to others what applies to self
 *   E. Over-apology — apology as aggression proxy
 *   F. Minimization inversion — "it's fine" + underlying content
 */

'use strict';

import { LIM }        from './bus.js';
import { GAP_TYPE, GAP_REASON, DOMAIN, GapSignal, SlidingWindow, tokenize, matchCount, _r4, _clamp } from './core.js';

export const MODULE_ID      = 'shadow';
export const MODULE_VERSION = '1.0.0';
export const MODULE_UUID    = 'lim-mod-shadow-1000-0000-000000000002';

export class ShadowFieldModule {
  constructor({ bus }) {
    this._bus             = bus;
    this._arousalW        = new SlidingWindow(30);
    this._displacementW   = new SlidingWindow(20);
    this._projectionHist  = [];
    this._sessionCount    = 0;
  }

  attach() {
    this._bus.on(LIM.INGEST_TRANSLATED, (payload) => {
      const text   = payload.resonanceText ?? payload.text;
      const result = this.analyze(text, payload.signalDensity ?? 0, payload);
      if (result) {
        this._bus.emit(LIM.GAP_SHADOW, result);
        this._bus.emit(LIM.SHADOW_FIELD, { text, signals: result.axes, score: result.score });
        this._sessionCount++;
      }
    });

    this._bus.emit(LIM.MODULE_READY, { moduleId: MODULE_ID, version: MODULE_VERSION });
    return this;
  }

  analyze(text, signalDensity = 0, meta = {}) {
    const words  = tokenize(text);
    if (words.length < 4) return null;

    // Arousal proxy: emotional word density + signal density input
    const negWords = matchCount(text, /\b(angry|scared|hurt|afraid|upset|frustrated|overwhelmed|anxious|terrified|devastated)\b/);
    const arousal  = _clamp(signalDensity * 1.5 + (negWords / Math.max(1, words.length)) * 3, 0, 1);
    this._arousalW.push(arousal);
    const avgArousal = this._arousalW.avg();

    const a = this._axisPronounDisplacement(text, words);
    const b = this._axisIntensityMismatch(text, avgArousal);
    const c = this._axisOverQualification(text, words);
    const d = this._axisProjection(text);
    const e = this._axisOverApology(text, avgArousal);
    const f = this._axisMinimization(text, avgArousal);

    const composite = _clamp(
      a.score * 0.25 +
      b.score * 0.22 +
      c.score * 0.18 +
      d.score * 0.15 +
      e.score * 0.10 +
      f.score * 0.10,
      0, 1
    );

    if (composite < 0.20) return null;

    const axes = [
      { name: 'pronoun_displacement',  score: _r4(a.score), label: a.label },
      { name: 'intensity_mismatch',    score: _r4(b.score), label: b.label },
      { name: 'over_qualification',    score: _r4(c.score), label: c.label },
      { name: 'projected_attribution', score: _r4(d.score), label: d.label },
      { name: 'over_apology',          score: _r4(e.score), label: e.label },
      { name: 'minimization_inversion',score: _r4(f.score), label: f.label },
    ].sort((a, b) => b.score - a.score);

    const dominant = axes[0];

    return GapSignal.build({
      moduleId:            MODULE_ID,
      type:                GAP_TYPE.ASSUMPTION,
      subtype:             'shadow_field',
      domain:              DOMAIN.PSYCHOLOGICAL,
      score:               composite,
      description:         `Shadow field: ${dominant.label}`,
      reason:              [GAP_REASON.AVOIDANCE, GAP_REASON.EMOTIONAL_OCCLUSION],
      evidence:            axes.filter(a => a.score > 0).map(a => `${a.name}=${a.score}`),
      textExcerpt:         text.slice(0, 120),
      loadBearingQuestion: _shadowQuestion(dominant.name),
      axes,
      asAbove:             'The shadow in a conversation is the suppressed harmonic in a chord — present in the overtones, absent in the notation.',
      author:              meta.author ?? null,
      ts:                  meta.ts ?? null,
    });
  }

  // ── Axes ────────────────────────────────────────────────────────────────────

  _axisPronounDisplacement(text, words) {
    const iCount    = matchCount(text, /\b(i|i'm|i've|i was|i feel|i think|i need|i want|i am)\b/);
    const youThey   = matchCount(text, /\b(you|they|people|everyone|he|she|one)\b/);
    const dispScore = words.length < 5 ? 0
      : _clamp((youThey - iCount * 0.5) / Math.max(1, words.length) * 5, 0, 1);
    this._displacementW.push(dispScore);
    return { score: dispScore, label: '"you/they" when pattern suggests "I" — ownership displaced' };
  }

  _axisIntensityMismatch(text, arousal) {
    const mildWords = /\b(fine|okay|ok|alright|not a big deal|whatever|doesn't matter|i guess|sort of|kind of|no problem|it's nothing)\b/gi;
    const mildHits  = matchCount(text, mildWords);
    const score     = arousal > 0.45 && mildHits > 0
      ? _clamp(arousal * mildHits * 0.65, 0, 1)
      : 0;
    return { score, label: 'mild vocabulary over activated emotional signal' };
  }

  _axisOverQualification(text, words) {
    const qualifiers = /\b(just|only|sort of|kind of|a bit|a little|slightly|somewhat|maybe|possibly|i don't know if|i'm not sure if|it might be|in a way|almost|like)\b/gi;
    const hits       = matchCount(text, qualifiers);
    const score      = _clamp(hits / Math.max(1, words.length) * 8, 0, 1);
    return { score, label: 'excessive qualification covering underlying content' };
  }

  _axisProjection(text) {
    const projRe = [
      /\b(it's normal to feel|everyone feels|most people would|anyone would be|it's natural to)\b/gi,
      /\b(you'd be (angry|upset|hurt|scared|frustrated) if|anyone would (feel|think|say))\b/gi,
      /\b(people like (us|that|this)|that's how (everyone|people|most) (feel|are))\b/gi,
    ];
    const hits    = projRe.reduce((s, re) => s + matchCount(text, re), 0);
    const score   = _clamp(hits * 0.38, 0, 1);
    this._projectionHist.push(score);
    if (this._projectionHist.length > 20) this._projectionHist.shift();
    return { score, label: 'universal attribution of first-person experience to others' };
  }

  _axisOverApology(text, arousal) {
    const apologyRe  = /\b(sorry|i apologize|i'm sorry|forgive me|excuse me|my fault|i was wrong)\b/gi;
    const apologies  = matchCount(text, apologyRe);
    const postApol   = /\b(but|however|although|except|still|yet|even though)\b/i.test(text);
    const score      = apologies > 0 && (arousal > 0.45 || postApol)
      ? _clamp(apologies * 0.35 * (postApol ? 1.5 : 1), 0, 1)
      : 0;
    return { score, label: 'apology as aggression proxy (sorry-but pattern)' };
  }

  _axisMinimization(text, arousal) {
    const minimizers = /\b(not a big deal|doesn't matter|i don't care|whatever|fine|it's fine|no problem|don't worry about it|forget it)\b/gi;
    const hits       = matchCount(text, minimizers);
    const score      = arousal > 0.45 && hits > 0
      ? _clamp(arousal * hits * 0.7, 0, 1)
      : 0;
    return { score, label: '"it\'s fine" over underlying activated content' };
  }

  get sessionCount() { return this._sessionCount; }
}

function _shadowQuestion(axisName) {
  return {
    pronoun_displacement:   'What would it look like to say "I" here instead of "you/they"?',
    intensity_mismatch:     'What is actually present that the mild language is covering?',
    over_qualification:     'What is being protected by all the qualifying language?',
    projected_attribution:  'Is this actually about you? What would change if it were?',
    over_apology:           'What is the apology doing that direct expression would do more honestly?',
    minimization_inversion: 'What would it look like to let it be a big deal?',
  }[axisName] ?? 'What is present here that is not being said?';
}
