/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  OSCILLATORY MODULE  ·  modules/oscillatory/index.js  ·  v1.0.0       ║
 * ║  UUID: lim-mod-oscillatory-1000-0000-000000000009                     ║
 * ║                                                                        ║
 * ║  Detects rhythm-level relational gaps using pendulum math.            ║
 * ║  Sigma regime tracking over gap-pressure sequences.                   ║
 * ║  Intermittent reinforcement, love-bombing cycles, approach-retreat.   ║
 * ║                                                                        ║
 * ║  Listens: LIM.INGEST_TRANSLATED + all lim.gap.* for pressure feed    ║
 * ║  Emits:   LIM.GAP_OSCILLATORY                                         ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * SIGMA REGIMES:
 *   STABLE      — gap pressure consistent, system coherent
 *   DEGRADED    — slow upward slope, normalisation risk
 *   COLLAPSING  — accelerating pressure, hard edge approaching
 *   OSCILLATORY — cycling without resolution (most dangerous for relationships)
 */

'use strict';

import { LIM }        from './bus.js';
import { GAP_TYPE, GAP_REASON, DOMAIN, FIELD_GAP_SUBTYPE, SIGMA_REGIME, classifySigma,
         GapSignal, SlidingWindow, tokenize, matchCount, _r4, _clamp } from './core.js';

export const MODULE_ID      = 'oscillatory';
export const MODULE_VERSION = '1.0.0';
export const MODULE_UUID    = 'lim-mod-oscillatory-1000-0000-000000000009';

// ── Pendulum Math (inlined from pendulum-swing) ───────────────────────────────

function _mean(obs) {
  return obs.length ? obs.reduce((a, b) => a + b, 0) / obs.length : 0;
}

function _zeroCrossings(obs, m) {
  const c = [];
  for (let i = 1; i < obs.length; i++) {
    const p = obs[i - 1] - m, cur = obs[i] - m;
    if (p < 0 && cur >= 0) c.push({ i, dir: 'up' });
    else if (p >= 0 && cur < 0) c.push({ i, dir: 'down' });
  }
  return c;
}

function computePeriod(obs) {
  if (obs.length < 3) return null;
  const m  = _mean(obs);
  const up = _zeroCrossings(obs, m).filter(c => c.dir === 'up');
  if (up.length < 2) return null;
  const periods = [];
  for (let i = 1; i < up.length; i++) periods.push(up[i].i - up[i - 1].i);
  return Math.round(_mean(periods));
}

function computeAmplitude(obs) {
  const m = _mean(obs);
  let hi = 0, lo = 0;
  for (const v of obs) { const d = v - m; if (d > hi) hi = d; if (d < lo) lo = d; }
  return { positive: _r4(hi), negative: _r4(Math.abs(lo)) };
}

function computeDamping(obs) {
  if (obs.length < 6) return null;
  const m    = _mean(obs);
  const half = Math.floor(obs.length / 2);
  const amp  = (half) => { let mx = 0; for (const v of half) { const d = Math.abs(v - m); if (d > mx) mx = d; } return mx; };
  const a1   = amp(obs.slice(0, half));
  const a2   = amp(obs.slice(half));
  if (a1 === 0) return null;
  const coeff = _r4(a2 / a1);
  return { coefficient: coeff, direction: coeff < 0.92 ? 'damping' : coeff > 1.08 ? 'amplifying' : 'neutral' };
}

// ── Oscillatory Module ────────────────────────────────────────────────────────

export class OscillatoryModule {
  constructor({ bus, windowSize = 40 } = {}) {
    this._bus          = bus;
    this._pressure     = new SlidingWindow(windowSize);  // aggregate gap pressure
    this._warmth       = new SlidingWindow(windowSize);  // warmth signal (from text)
    this._lastSigma    = null;
    this._sessionCount = 0;
  }

  attach() {
    // Feed pressure from every gap detection
    this._bus.on('lim.gap.*', (payload) => {
      if (payload?.score != null) {
        this._pressure.push(payload.score);
        this._checkSigma(payload);
      }
    });

    // Feed warmth from text
    this._bus.on(LIM.INGEST_TRANSLATED, (payload) => {
      const text = payload.resonanceText ?? payload.text;
      this._updateWarmth(text);

      const result = this.analyzeText(text, payload);
      if (result) {
        this._bus.emit(LIM.GAP_OSCILLATORY, result);
        this._sessionCount++;
      }
    });

    this._bus.emit(LIM.MODULE_READY, { moduleId: MODULE_ID, version: MODULE_VERSION });
    return this;
  }

  analyzeText(text, meta = {}) {
    const words = tokenize(text);
    if (words.length < 4) return null;

    // Intermittent reinforcement text signals
    const warmRe  = /\b(love|wonderful|amazing|you're perfect|so good|i need you|you mean everything|you're everything|i adore)\b/gi;
    const coldRe  = /\b(useless|worthless|pathetic|you always|you never|i don't know why|disappointment|mistake|i can't with you)\b/gi;
    const wHits   = matchCount(text, warmRe);
    const cHits   = matchCount(text, coldRe);
    const irScore = wHits > 0 && cHits > 0 ? _clamp((wHits + cHits) * 0.3, 0, 1) : 0;

    // Hot-cold cycling in warmth window
    const warmVals = this._warmth.vals;
    let warmthSigma = null;
    if (warmVals.length >= 5) {
      warmthSigma = classifySigma(warmVals);
    }
    const irOscScore = warmthSigma?.regime === SIGMA_REGIME.OSCILLATORY
      ? _clamp(warmthSigma.confidence, 0, 1)
      : 0;

    // Approach-retreat language
    const approachRe = /\b(come closer|i want you|i miss you|i need us|let's fix this|come back|i love you)\b/gi;
    const retreatRe  = /\b(i need space|leave me alone|back off|too much|stop pushing|i can't|let me breathe)\b/gi;
    const appH       = matchCount(text, approachRe);
    const retH       = matchCount(text, retreatRe);
    const arScore    = appH > 0 && retH > 0 ? _clamp((appH + retH) * 0.3, 0, 1) : 0;

    const composite = _clamp(
      irScore    * 0.35 +
      irOscScore * 0.40 +
      arScore    * 0.25,
      0, 1
    );

    if (composite < 0.20) return null;

    const pendulumData = this._pendulumProfile();

    return GapSignal.build({
      moduleId:    MODULE_ID,
      type:        GAP_TYPE.OSCILLATORY,
      subtype:     'intermittent_reinforcement',
      domain:      DOMAIN.ABUSE_MANIPULATION,
      score:       composite,
      criticality: 0.95,
      description: `Oscillatory gap: warmth/withdrawal cycling${pendulumData ? ` (period≈${pendulumData.period})` : ''}`,
      reason:      [GAP_REASON.AVOIDANCE, GAP_REASON.STRUCTURAL_LIMIT],
      evidence:    [
        `ir_text=${_r4(irScore)}`,
        `ir_osc=${_r4(irOscScore)}`,
        `approach_retreat=${_r4(arScore)}`,
        warmthSigma ? `sigma=${warmthSigma.regime}` : null,
      ].filter(Boolean),
      textExcerpt:         text.slice(0, 120),
      loadBearingQuestion: 'What is the period of the cycle? What triggers the warmth? What triggers the withdrawal?',
      axes: [
        { name: 'intermittent_reinforcement', score: _r4(irScore),    label: 'warmth and cruelty in same message' },
        { name: 'warmth_oscillation',         score: _r4(irOscScore), label: `sigma ${warmthSigma?.regime ?? 'unknown'} on warmth signal` },
        { name: 'approach_retreat',           score: _r4(arScore),    label: 'approach and retreat language co-present' },
      ],
      asAbove: 'Intermittent reinforcement is variable-ratio scheduling — the most resistance-to-extinction schedule known. In music: the song that gives you the hook then takes it away.',
      author:  meta.author ?? null,
      ts:      meta.ts ?? null,
    });
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  _updateWarmth(text) {
    const warmRe  = /\b(love|good|wonderful|amazing|appreciate|grateful|thank|care|support|here for you|together)\b/gi;
    const coldRe  = /\b(hate|bad|terrible|useless|worthless|disappointed|don't care|leave|done|over|finished)\b/gi;
    const words   = tokenize(text);
    const wScore  = matchCount(text, warmRe) - matchCount(text, coldRe);
    const warmth  = _clamp(0.5 + (wScore / Math.max(1, words.length)) * 3, 0, 1);
    this._warmth.push(warmth);
  }

  _checkSigma(payload) {
    const seq = this._pressure.vals;
    if (seq.length < 5) return;
    const sigma = classifySigma(seq);
    if (sigma.regime === this._lastSigma?.regime) return;
    this._lastSigma = sigma;

    if (sigma.regime === SIGMA_REGIME.OSCILLATORY || sigma.regime === SIGMA_REGIME.COLLAPSING) {
      const result = GapSignal.build({
        moduleId:    MODULE_ID,
        type:        GAP_TYPE.OSCILLATORY,
        subtype:     FIELD_GAP_SUBTYPE.OSCILLATION,
        domain:      DOMAIN.FIELD,
        score:       _clamp(sigma.confidence, 0, 1),
        criticality: sigma.regime === SIGMA_REGIME.COLLAPSING ? 0.95 : 0.85,
        description: `Sigma regime transition → ${sigma.regime}`,
        reason:      [GAP_REASON.AVOIDANCE, GAP_REASON.STRUCTURAL_LIMIT],
        evidence:    [`regime=${sigma.regime}`, `confidence=${_r4(sigma.confidence)}`],
        loadBearingQuestion: `What is driving the ${sigma.regime.toLowerCase()} regime? Is this a system-level pattern?`,
        entityId:    payload.author ?? null,
      });
      this._bus.emit(LIM.GAP_OSCILLATORY, result);
    }
  }

  _pendulumProfile() {
    const obs = this._warmth.vals;
    if (obs.length < 6) return null;
    const period   = computePeriod(obs);
    const amp      = computeAmplitude(obs);
    const damping  = computeDamping(obs);
    return { period, amplitude: amp, damping };
  }

  get sessionCount() { return this._sessionCount; }
}
