/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  PROSODY  ·  prosody.js  ·  v0.4.0                                      ║
 * ║  UUID: eravos-voice-prosody-0001-0000-000000000001                      ║
 * ║  HOOK: eravos.voice:prosody:00001                                       ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * PORT of Rheon Voice v7 `js/analysis-engine.js` — `pitchEngine()` (line 222)
 * and `oscillationEngine()` (line 185). Mechanical translation to ESM +
 * strict mode. Coefficients, thresholds and tags carried across unchanged.
 *
 * §5.7 — no DOM access. Pure transforms. Testable with arrays alone.
 * §1.1 — every value computed, never estimated. Insufficient data returns
 *        an explicit 'insufficient' tag, not a fabricated number.
 *
 * ── WHY VOICE IS THE DIMENSION THAT WAS MISSING ────────────────────────────
 *
 * Measured on the text-only path, latent-model.js's five dimensions had these
 * producers:
 *
 *   VALENCE     sentiment                       real
 *   AROUSAL     lexical friction only           weak proxy
 *   SUPPRESSION lexical friction only           weak proxy
 *   COHERENCE   NONE                            uncertainty stayed 0.500
 *   ENGAGEMENT  NONE (a pronoun substitution)   substituted, not measured
 *
 * jitter, shimmer and HNR are the standard acoustic voice-quality triad —
 * the same measures Praat computes, used clinically for vocal strain and
 * studied extensively as correlates of physiological arousal and affective
 * stress in the speech-science literature. They are DIRECT measurement of
 * the thing text could only proxy.
 *
 *   jitter   cycle-to-cycle variation in fundamental frequency (F0)
 *   shimmer  cycle-to-cycle variation in amplitude
 *   HNR      harmonics-to-noise ratio — periodic energy vs. aperiodic noise
 *
 * §1.1, restated because it matters here: high jitter is not "this person is
 * lying" or "this person is anxious." It is signal. It measures vocal
 * perturbation. Interpretation lives above this file, never inside it.
 */

'use strict';

export const PROSODY_VERSION = '0.4.0';
export const PROSODY_UUID    = 'eravos-voice-prosody-0001-0000-000000000001';

/**
 * pitchEngine — jitter, shimmer, HNR, prosody classification.
 * PORT: rheon-voice-v7 analysis-engine.js:222-250, thresholds unchanged.
 *
 * @param {number[]} pitchVals  per-frame F0 in Hz, 0 = unvoiced
 * @param {number[]} ampVals    per-frame RMS amplitude
 */
export function pitchEngine(pitchVals, ampVals) {
  const n = Math.min(pitchVals.length, ampVals.length);
  if (n < 4) return { jitter: 0, shimmer: 0, hnr: 0, prosodyTag: 'insufficient', voiced: false, frames: n };

  let jSum = 0, jN = 0, meanF0 = 0, voicedN = 0;
  for (let i = 0; i < n; i++) if (pitchVals[i] > 0) { meanF0 += pitchVals[i]; voicedN++; }
  meanF0 = voicedN > 0 ? meanF0 / voicedN : 0;

  for (let j = 1; j < n; j++) {
    if (pitchVals[j] > 0 && pitchVals[j - 1] > 0) { jSum += Math.abs(pitchVals[j] - pitchVals[j - 1]); jN++; }
  }
  const jitter = (jN > 0 && meanF0 > 0) ? jSum / jN / meanF0 : 0;

  let shSum = 0, shN = 0;
  const meanAmp = ampVals.slice(0, n).reduce((a, b) => a + b, 0) / n;
  for (let k = 1; k < n; k++) { shSum += Math.abs(ampVals[k] - ampVals[k - 1]); shN++; }
  const shimmer = (shN > 0 && meanAmp > 0) ? shSum / shN / (meanAmp + 0.0001) : 0;

  const variance = ampVals.slice(0, n).reduce((s, v) => s + Math.pow(v - meanAmp, 2), 0) / n;
  const hnr = meanAmp > 0.001 ? Math.max(0, 1 - Math.sqrt(variance) / (meanAmp + 0.0001)) : 0;

  let prosodyTag;
  if      (meanF0 === 0 || voicedN / n < 0.4) prosodyTag = 'unvoiced';
  else if (jitter > 0.08 && shimmer > 0.15)   prosodyTag = 'stressed';
  else if (jitter > 0.05)                      prosodyTag = 'tense';
  else if (hnr > 0.7 && jitter < 0.03)         prosodyTag = 'clear';
  else                                         prosodyTag = 'normal';

  return {
    jitter:  Math.round(jitter * 1000) / 1000,
    shimmer: Math.round(shimmer * 1000) / 1000,
    hnr:     Math.round(hnr * 100) / 100,
    meanF0:  Math.round(meanF0),
    prosodyTag,
    voiced:  voicedN / n > 0.4,
    frames:  n,
  };
}

/**
 * oscillationEngine — period, amplitude, regularity, phase of any series.
 * PORT: rheon-voice-v7 analysis-engine.js:185-221, unchanged.
 * Applied here to the F0 contour: regularity is prosodic stability.
 */
export function oscillationEngine(values) {
  const n = values.length;
  if (n < 5) return { period: 0, amplitude: 0, regularity: 0, phase: 'unknown', samples: n };

  const peaks = [], troughs = [];
  for (let i = 1; i < n - 1; i++) {
    if (values[i] > values[i - 1] && values[i] > values[i + 1]) peaks.push(i);
    else if (values[i] < values[i - 1] && values[i] < values[i + 1]) troughs.push(i);
  }

  let period = 0;
  if (peaks.length >= 2) {
    const diffs = [];
    for (let j = 1; j < peaks.length; j++) diffs.push(peaks[j] - peaks[j - 1]);
    period = diffs.reduce((a, b) => a + b, 0) / diffs.length;
  }

  let amp = 0;
  if (peaks.length > 0 && troughs.length > 0) {
    const pM = peaks.map(i => values[i]).reduce((a, b) => a + b, 0) / peaks.length;
    const tM = troughs.map(i => values[i]).reduce((a, b) => a + b, 0) / troughs.length;
    amp = Math.max(0, pM - tM);
  }

  let regularity = 0;
  if (peaks.length >= 3) {
    const d2 = [];
    for (let k = 1; k < peaks.length; k++) d2.push(peaks[k] - peaks[k - 1]);
    const dM = d2.reduce((a, b) => a + b, 0) / d2.length;
    const dS = Math.sqrt(d2.reduce((s, v) => s + (v - dM) * (v - dM), 0) / d2.length);
    regularity = Math.max(0, 1 - dS / (dM + 0.001));
  }

  return {
    period:     Math.round(period * 10) / 10,
    amplitude:  Math.round(amp * 100) / 100,
    regularity: Math.round(regularity * 100) / 100,
    phase:      values[n - 1] > values[n - 2] ? 'rising' : 'falling',
    samples:    n,
  };
}

/**
 * ProsodyWindow — accumulates per-frame acoustic snapshots and produces one
 * prosodic reading per utterance.
 *
 * Input frames come from Rheon Voice v7's `AudioEngine.snapshot()`:
 *   { pitch, amplitude, zcr, spectralCentroid }
 * — real autocorrelation F0, RMS, zero-crossing rate, spectral centroid.
 * That file stays where it is (§5.9 sovereignty); this consumes its output
 * shape through a declared contract, not by reaching into it (§5.10).
 */
export class ProsodyWindow {
  static UUID    = PROSODY_UUID;
  static VERSION = PROSODY_VERSION;

  constructor({ maxFrames = 240 } = {}) {   // ~8s at 30fps
    this._max = maxFrames;
    this.reset();
  }

  reset() {
    this._pitch = [];
    this._amp = [];
    this._zcr = [];
    this._centroid = [];
    this._frames = 0;
  }

  /** @param {{pitch:number, amplitude:number, zcr:number, spectralCentroid:number}} snap */
  push(snap) {
    if (!snap) return;
    this._pitch.push(snap.pitch ?? 0);
    this._amp.push(snap.amplitude ?? 0);
    this._zcr.push(snap.zcr ?? 0);
    this._centroid.push(snap.spectralCentroid ?? 0);
    this._frames++;
    if (this._pitch.length > this._max) {
      this._pitch.shift(); this._amp.shift(); this._zcr.shift(); this._centroid.shift();
    }
  }

  get frameCount() { return this._pitch.length; }

  /**
   * One prosodic reading for the accumulated window.
   * §1.2 — returns `sufficient: false` rather than a plausible-looking
   * number when there isn't enough voiced audio to measure anything.
   */
  read() {
    const voice = pitchEngine(this._pitch, this._amp);
    const voicedOnly = this._pitch.filter(p => p > 0);
    const contour = oscillationEngine(voicedOnly.length >= 5 ? voicedOnly : this._pitch);

    const mean = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
    const energy = mean(this._amp);
    const zcr = mean(this._zcr);
    const centroid = mean(this._centroid);

    // §1.2 — 'unvoiced' means no measurable phonation. Reporting it as a
    // sufficient reading would let jitter=0 / shimmer=0 be consumed as
    // "perfectly stable voice" when it is actually "no voice at all."
    // Found by the silence case in verify-voice.mjs: abstained was false on
    // pure silence. Absence of evidence must not become evidence.
    const sufficient = voice.prosodyTag !== 'insufficient'
                    && voice.prosodyTag !== 'unvoiced'
                    && voice.voiced
                    && this._pitch.length >= 4;

    return {
      sufficient,
      ...voice,
      contour,
      energy:   Math.round(energy * 10000) / 10000,
      zcr:      Math.round(zcr * 10000) / 10000,
      centroid: Math.round(centroid),
      voicedRatio: this._pitch.length ? +(voicedOnly.length / this._pitch.length).toFixed(3) : 0,
      modality: 'audio',       // §17.5 — provenance. NOT a text substitution.
      substituted: false,
      frames: this._pitch.length,
    };
  }
}
