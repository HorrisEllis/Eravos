/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  EXISTENTIAL MODULE  ·  modules/existential/index.js  ·  v1.0.0       ║
 * ║  UUID: lim-mod-existential-1000-0000-000000000012                     ║
 * ║                                                                        ║
 * ║  Identity, values-behavior gap, meaning, purpose, shadow.            ║
 * ║  The gaps that protect who someone believes they are.                 ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */

'use strict';

import { LIM }        from './bus.js';
import { GAP_TYPE, GAP_REASON, DOMAIN, GapSignal, tokenize, matchCount, _r4, _clamp } from './core.js';

export const MODULE_ID      = 'existential';
export const MODULE_VERSION = '1.0.0';
export const MODULE_UUID    = 'lim-mod-existential-1000-0000-000000000012';

export class ExistentialModule {
  constructor({ bus }) {
    this._bus          = bus;
    this._sessionCount = 0;
  }

  attach() {
    this._bus.on(LIM.INGEST_TRANSLATED, (payload) => {
      const text   = payload.resonanceText ?? payload.text;
      const result = this.analyze(text, payload);
      if (result) {
        this._bus.emit(LIM.GAP_EXISTENTIAL, result);
        this._sessionCount++;
      }
    });
    this._bus.emit(LIM.MODULE_READY, { moduleId: MODULE_ID, version: MODULE_VERSION });
    return this;
  }

  analyze(text, meta = {}) {
    const words = tokenize(text);
    if (words.length < 5) return null;

    const a = this._axisIdentityAssumption(text);
    const b = this._axisValuesBehaviorGap(text);
    const c = this._axisMeaningSPOF(text);
    const d = this._axisShadowGap(text);
    const e = this._axisTemporalSelf(text);
    const f = this._axisPurposeGap(text);

    const axes = [a, b, c, d, e, f].filter(x => x.score > 0.15);
    if (!axes.length) return null;

    axes.sort((a, b) => b.score - a.score);
    const dominant  = axes[0];
    const composite = _clamp(
      axes.slice(0, 3).reduce((s, a, i) => s + a.score * [0.5, 0.3, 0.2][i], 0),
      0, 1
    );

    return GapSignal.build({
      moduleId:            MODULE_ID,
      type:                GAP_TYPE.ASSUMPTION,
      subtype:             dominant.name,
      domain:              dominant.domain ?? DOMAIN.IDENTITY,
      score:               composite,
      description:         dominant.description,
      reason:              [GAP_REASON.IDENTITY_REFLECTION, GAP_REASON.AVOIDANCE],
      evidence:            axes.map(a => `${a.name}=${_r4(a.score)}`),
      textExcerpt:         text.slice(0, 120),
      loadBearingQuestion: dominant.question,
      axes:                axes.map(a => ({ name: a.name, score: _r4(a.score), label: a.description })),
      asAbove:             'The identity gap is the key signature of the whole composition — everything is played in that key, usually without knowing it.',
      author:              meta.author ?? null,
      ts:                  meta.ts ?? null,
    });
  }

  _axisIdentityAssumption(text) {
    const identRe  = /\b(i'm not|i could never|i'm just|i've always been|that's not me|that's just who i am|i'm bad at|i can't|i was born|i don't have what it takes|i'm the kind of person who)\b/gi;
    const hits     = matchCount(text, identRe);
    return {
      name:        'identity_assumption',
      score:       _clamp(hits * 0.35, 0, 0.85),
      domain:      DOMAIN.IDENTITY,
      description: 'Core belief about self treated as fact — identity installed without examination',
      question:    'When did this become true? What evidence exists? What would you lose by questioning it?',
    };
  }

  _axisValuesBehaviorGap(text) {
    const valRe    = /\b(i believe|i value|i care about|it matters to me|i'm committed|my priority is|i stand for|i think it's important)\b/gi;
    const actRe    = /\b(but i keep|but i still|but i never|but i always|yet i find myself|despite that|i can't seem to)\b/gi;
    const vHits    = matchCount(text, valRe);
    const aHits    = matchCount(text, actRe);
    const score    = vHits > 0 && aHits > 0 ? _clamp((vHits + aHits) * 0.3, 0, 0.85) : 0;
    return {
      name:        'values_behavior_gap',
      score,
      domain:      DOMAIN.VALUES,
      description: 'Stated values contradict revealed behavior — the gap between the person you say you are and the person the evidence shows',
      question:    'What do your actions actually reveal about your values? Which is the real priority?',
    };
  }

  _axisMeaningSPOF(text) {
    // Single source of meaning — fragile if removed
    const meaningRe = /\b(my whole life is|everything is|i live for|the only thing that|without (my|this|that|them|him|her)|i am nothing without|my entire identity|i don't know who i'd be)\b/gi;
    const hits      = matchCount(text, meaningRe);
    return {
      name:        'meaning_single_point_failure',
      score:       _clamp(hits * 0.40, 0, 0.85),
      domain:      DOMAIN.MEANING,
      description: 'Meaning concentrated in single source — structural fragility if removed',
      question:    'What remains if this source disappears? Is this concentration known and chosen?',
    };
  }

  _axisShadowGap(text) {
    // Strong negative reaction to others with no self-examination
    const projRe   = /\b(i hate people who|i can't stand (people who|when people)|the worst kind of person|that type of person disgusts|how could anyone|i would never)\b/gi;
    const examRe   = /\b(i wonder if|maybe i|i recognize|i see myself|i do that too|i've been that person)\b/gi;
    const pHits    = matchCount(text, projRe);
    const eHits    = matchCount(text, examRe);
    const score    = pHits > 0 && eHits === 0 ? _clamp(pHits * 0.40, 0, 0.80) : 0;
    return {
      name:        'shadow_gap',
      score,
      domain:      DOMAIN.PSYCHOLOGICAL,
      description: 'Strong negative reaction without self-examination — possible shadow projection',
      question:    'What is being rejected in others that may be present in yourself? Where does the intensity come from?',
    };
  }

  _axisTemporalSelf(text) {
    // Self-concept based on past version of self
    const pastRe   = /\b(i used to|i was once|back when|i used to be|the person i was|i'm not that person|that was the old me)\b/gi;
    const updateRe = /\b(now i'm|i've become|i've grown|i've changed|these days|now i|i am now)\b/gi;
    const pHits    = matchCount(text, pastRe);
    const uHits    = matchCount(text, updateRe);
    // Gap: past self referenced a lot without update markers
    const score    = pHits > 1 && uHits === 0 ? _clamp(pHits * 0.25, 0, 0.70) : 0;
    return {
      name:        'temporal_self_concept',
      score,
      domain:      DOMAIN.IDENTITY,
      description: 'Self-concept anchored in past — no update to current evidence',
      question:    'Who are you now? What has changed that the self-concept hasn\'t caught up with yet?',
    };
  }

  _axisPurposeGap(text) {
    const driftRe  = /\b(i don't know why|what's the point|going through the motions|just existing|no direction|lost|what am i doing|where is this going|i have no idea)\b/gi;
    const hits     = matchCount(text, driftRe);
    return {
      name:        'purpose_gap',
      score:       _clamp(hits * 0.35, 0, 0.85),
      domain:      DOMAIN.PURPOSE,
      description: 'Actions disconnected from purpose — means/ends chain broken',
      question:    'What is all of this in service of? What would it feel like to have a clear answer?',
    };
  }

  get sessionCount() { return this._sessionCount; }
}
