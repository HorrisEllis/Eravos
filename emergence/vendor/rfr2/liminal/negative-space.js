/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  NEGATIVE SPACE MODULE  ·  modules/negative-space/index.js  ·  v1.0.0 ║
 * ║  UUID: lim-mod-negspace-1000-0000-000000000003                        ║
 * ║                                                                        ║
 * ║  What is systematically avoided. The shape of the unspeakable.        ║
 * ║  Circling without landing. Topic orbiting with no approach vector.    ║
 * ║                                                                        ║
 * ║  Listens: LIM.INGEST_TRANSLATED                                       ║
 * ║  Emits:   LIM.GAP_NEGATIVE_SPACE                                      ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * DETECTION AXES:
 *   A. Topic orbit — circling around a subject without landing
 *   B. Avoidance trajectory — semantic gravity well without entry
 *   C. Vocabulary field absence — expected domain words missing
 *   D. Unresolved topic shift — "anyway / moving on / forget it"
 *   E. Semantic redirect — high-energy topic exit
 */

'use strict';

import { LIM }        from './bus.js';
import { GAP_TYPE, GAP_REASON, DOMAIN, GapSignal, SlidingWindow, tokenize, matchCount, _r4, _clamp } from './core.js';

export const MODULE_ID      = 'negative_space';
export const MODULE_VERSION = '1.0.0';
export const MODULE_UUID    = 'lim-mod-negspace-1000-0000-000000000003';

// ── Semantic gravity wells — topics that suggest related missing content ──────

const GRAVITY_WELLS = {
  relationship_distress: {
    approach: /\b(relationship|partner|together|us|we've been|things have been)\b/gi,
    expected: /\b(i feel|i need|i want|i'm hurt|i'm scared|i love|i miss)\b/gi,
    domain:   DOMAIN.INTERPERSONAL,
  },
  anger_unexpressed: {
    approach: /\b(it's fine|no worries|doesn't matter|all good|whatever)\b/gi,
    expected: /\b(upset|angry|frustrated|bothered|hurt|annoyed|bothers me)\b/gi,
    domain:   DOMAIN.PSYCHOLOGICAL,
  },
  accountability_avoided: {
    approach: /\b(mistake|error|went wrong|didn't work|failed|issue|problem)\b/gi,
    expected: /\b(i did|i caused|my responsibility|my fault|i should have|i chose)\b/gi,
    domain:   DOMAIN.EPISTEMOLOGICAL,
  },
  grief_unacknowledged: {
    approach: /\b(used to|before|back when|we used to|it was different|things changed)\b/gi,
    expected: /\b(miss|sad|grief|loss|gone|hurts|wish it was|i mourn)\b/gi,
    domain:   DOMAIN.GRIEF,
  },
};

export class NegativeSpaceModule {
  constructor({ bus }) {
    this._bus           = bus;
    this._recentTexts   = [];
    this._topicHistory  = new Map();   // topic → count
    this._sessionCount  = 0;
  }

  attach() {
    this._bus.on(LIM.INGEST_TRANSLATED, (payload) => {
      const text   = payload.resonanceText ?? payload.text;
      const result = this.analyze(text, payload);
      if (result) {
        this._bus.emit(LIM.GAP_NEGATIVE_SPACE, result);
        this._sessionCount++;
      }
    });

    this._bus.emit(LIM.MODULE_READY, { moduleId: MODULE_ID, version: MODULE_VERSION });
    return this;
  }

  analyze(text, meta = {}) {
    const words = tokenize(text);
    if (words.length < 4) return null;

    this._recentTexts.push(text);
    if (this._recentTexts.length > 15) this._recentTexts.shift();

    const a = this._axisTopicOrbit(text);
    const b = this._axisAvoidanceTrajectory(text);
    const c = this._axisVocabFieldAbsence(words);
    const d = this._axisUnresolvedShift(text);
    const e = this._axisSemanticRedirect(text);

    const composite = _clamp(
      a.score * 0.30 +
      b.score * 0.25 +
      c.score * 0.20 +
      d.score * 0.15 +
      e.score * 0.10,
      0, 1
    );

    if (composite < 0.18) return null;

    const axes = [
      { name: 'topic_orbit',              score: _r4(a.score), label: a.label, domain: a.domain },
      { name: 'avoidance_trajectory',     score: _r4(b.score), label: b.label },
      { name: 'vocab_field_absence',      score: _r4(c.score), label: c.label },
      { name: 'unresolved_topic_shift',   score: _r4(d.score), label: d.label },
      { name: 'semantic_redirect',        score: _r4(e.score), label: e.label },
    ].sort((a, b) => b.score - a.score);

    const dominant = axes[0];
    const topDomain = dominant.domain ?? DOMAIN.PSYCHOLOGICAL;

    return GapSignal.build({
      moduleId:            MODULE_ID,
      type:                GAP_TYPE.EVIDENTIAL,
      subtype:             'negative_space',
      domain:              topDomain,
      score:               composite,
      description:         `Negative space: ${dominant.label}`,
      reason:              [GAP_REASON.AVOIDANCE, GAP_REASON.EMOTIONAL_OCCLUSION],
      evidence:            axes.filter(a => a.score > 0).map(a => `${a.name}=${a.score}`),
      textExcerpt:         text.slice(0, 120),
      loadBearingQuestion: `What cannot be approached directly? What shape does the avoidance trace around?`,
      axes,
      asAbove:             'The unspeakable is the frequency the instrument will not produce — present in every gap between the notes.',
      author:              meta.author ?? null,
      ts:                  meta.ts ?? null,
    });
  }

  // ── Axes ────────────────────────────────────────────────────────────────────

  _axisTopicOrbit(text) {
    let best = { score: 0, label: 'circling without landing', domain: DOMAIN.PSYCHOLOGICAL };
    for (const [name, well] of Object.entries(GRAVITY_WELLS)) {
      const approachHits  = matchCount(text, well.approach);
      const expectedHits  = matchCount(text, well.expected);
      if (approachHits > 0 && expectedHits === 0) {
        const score = _clamp(approachHits * 0.35, 0, 1);
        if (score > best.score) {
          best = { score, label: `approaching "${name.replace(/_/g,' ')}" without entry`, domain: well.domain };
        }
      }
    }
    return best;
  }

  _axisAvoidanceTrajectory(text) {
    // Pattern: topic raised → immediately qualified/dismissed
    const raise    = /\b(i've been thinking|i wanted to say|i need to tell you|there's something|i should mention)\b/gi;
    const dismiss  = /\b(never mind|forget it|it doesn't matter|it's nothing|anyway|not important|maybe later)\b/gi;
    const rHits    = matchCount(text, raise);
    const dHits    = matchCount(text, dismiss);
    // Also check across recent texts
    const recentRaised = this._recentTexts.slice(-4).some(t => matchCount(t, raise) > 0);
    const score    = _clamp(
      (rHits * 0.4 + dHits * 0.4) * (recentRaised ? 1.5 : 1),
      0, 1
    );
    return { score, label: 'topic raised then retracted — approach/retreat cycle' };
  }

  _axisVocabFieldAbsence(words) {
    // If text contains context words from a field, check for expected words in that field
    const emotionalContext = /\b(feel|felt|feeling|emotion|heart|care|love|hurt|pain)\b/;
    const hasEmotionalCtx  = words.join(' ').match(emotionalContext);
    if (!hasEmotionalCtx) return { score: 0, label: 'no vocab field absence detected' };

    const expectedEmotional = /\b(because|want|need|afraid|scared|angry|sad|hurt|miss|wish)\b/gi;
    const hits = matchCount(words.join(' '), expectedEmotional);
    // Low density of expected words in emotional context = absence signal
    const density = hits / Math.max(1, words.length);
    const score   = density < 0.03 && words.length > 8 ? _clamp(0.4 - density * 10, 0, 0.6) : 0;
    return { score, label: 'emotional context without emotional vocabulary' };
  }

  _axisUnresolvedShift(text) {
    const unresolvedRe = /\b(anyway|moving on|forget it|never mind|whatever|let's just|can we talk about something else|never mind that|i don't want to get into it)\b/gi;
    const hits         = matchCount(text, unresolvedRe);
    const score        = _clamp(hits * 0.45, 0, 1);
    return { score, label: 'topic abandoned without resolution — predictive mismatch' };
  }

  _axisSemanticRedirect(text) {
    // High-energy exit markers — rapid change of subject after charged content
    const exitRe  = /\b(but (anyway|also|hey|so)|changing the subject|on another note|speaking of which|totally different thing)\b/gi;
    const chargeRe= /\b(i feel|that hurt|i was|it was really|honestly|to be honest|i have to say)\b/gi;
    const exits   = matchCount(text, exitRe);
    const charged = matchCount(text, chargeRe);
    const score   = charged > 0 && exits > 0 ? _clamp((charged + exits) * 0.2, 0, 1) : 0;
    return { score, label: 'charged content followed by rapid subject exit' };
  }

  get sessionCount() { return this._sessionCount; }
}
