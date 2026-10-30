/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  VOICE OBSERVER  ·  voice-observer.js  ·  v0.4.0                        ║
 * ║  UUID: eravos-voice-observer-0001-0000-000000000002                     ║
 * ║  HOOK: eravos.voice:observer:00002                                      ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * The dimension bridge. Turns one prosodic reading into real observations on
 * latent-model.js's DECLARED keys. No vendor file is edited (§5.3). No
 * fabricated video events (§1.3). Every key used below already exists in
 * `OBS_MODELS` with its own noise model R.
 *
 * ── WHAT THIS REPLACES, AND WHY THAT MATTERS ───────────────────────────────
 *
 * text-affect-bridge.js invented an ENGAGEMENT reading from pronoun
 * distribution because the real producers were video-only. That was a
 * SUBSTITUTION, marked as one, and the benchmark showed it did not unlock
 * `emo.dominant` — GRIEF scored identically with the bridge on and off.
 *
 * Voice is not a substitution. jitter/shimmer/HNR measure vocal perturbation
 * directly. Where both are present, this observer's readings should be
 * preferred and the text substitution demoted to a fallback. It is left in
 * place, not deleted, because a typed-only session still needs something —
 * but it is no longer the primary path (§0.4, optionality preserved).
 *
 * ── MAPPING, EACH WITH ITS STATED REASON (§13.2 — every edge named) ────────
 *
 *   prosodyTag 'stressed'   jitter>0.08 AND shimmer>0.15
 *     -> sig.STRESS_ACUTE    { VAL -0.6, AR +0.8, SUP +0.3, COH -0.2 }  R 0.15
 *     Combined F0 and amplitude perturbation is the acoustic signature of
 *     vocal strain. The most confident model in the table (lowest R).
 *
 *   prosodyTag 'tense'      jitter>0.05
 *     -> sig.COGNITIVE_LOAD  { VAL -0.2, AR +0.4, COH +0.3, ENG +0.2 }  R 0.20
 *     F0 instability without amplitude instability: effortful production,
 *     still engaged. Note COHERENCE rises here — load is not fragmentation.
 *
 *   prosodyTag 'clear'      hnr>0.7 AND jitter<0.03
 *     -> sig.GENUINE_ENGAGEMENT { VAL +0.6, SUP -0.6, COH +0.6, ENG +0.7 } R 0.15
 *     High harmonic-to-noise with low perturbation: relaxed, unguarded
 *     phonation. This single key reaches FOUR dimensions including both that
 *     text could never touch.
 *
 *   contour.regularity < 0.3 with sufficient voiced frames
 *     -> sig.DISSONANCE      { COH -0.8, SUP +0.4, AR +0.3 }            R 0.15
 *     An irregular F0 contour is prosodic incoherence — measured, not inferred.
 *
 *   energy (RMS)
 *     -> alk.audio.frame, the channel latent-model.js ALREADY subscribes to.
 *     It routes internally to audio.energy_high / _low / _anomaly. Nothing
 *     new is declared; an existing wire simply stops being dead.
 *
 *   energy -> alk.verbal.analysis.tone { energy }
 *     NervousSystemModule's `_energyWindow` feeds its dorsal term. On text it
 *     was empty, so avg() returned 0 and scored a 0.2 dorsal contribution
 *     from a channel that had never been measured. With real audio that term
 *     becomes evidence instead of an artefact.
 *
 * ── ROLLING BASELINE (§12.4 — invariants crystallise from evidence) ────────
 *
 * Absolute jitter/shimmer values are speaker-specific: vocal tract, age,
 * health, microphone all shift them. A fixed global threshold would be a
 * §0.1 violation — asserting a constant that is really a per-speaker
 * variable. So an anomaly is z-scored against this speaker's own rolling
 * baseline, and no anomaly is claimed until the baseline has warmed up.
 */

'use strict';

export const VOICE_OBSERVER_VERSION = '0.4.0';
export const VOICE_OBSERVER_UUID    = 'eravos-voice-observer-0001-0000-000000000002';

const BASELINE_WARMUP = 5;   // readings before z-scores are trusted
const BASELINE_WINDOW = 30;
const ENERGY_Z_ALERT  = 2.0; // matches NEXUS-CODEC's own ENERGY_SIGMA_ALERT

class Rolling {
  constructor(n = BASELINE_WINDOW) { this._buf = []; this._n = n; }
  push(v) { this._buf.push(v); if (this._buf.length > this._n) this._buf.shift(); }
  get len() { return this._buf.length; }
  get mean() { return this._buf.length ? this._buf.reduce((a, b) => a + b, 0) / this._buf.length : 0; }
  get sd() {
    if (this._buf.length < 2) return 0;
    const m = this.mean;
    return Math.sqrt(this._buf.reduce((s, v) => s + (v - m) * (v - m), 0) / this._buf.length);
  }
  z(v) { const s = this.sd; return s > 0 ? (v - this.mean) / s : 0; }
  get warm() { return this._buf.length >= BASELINE_WARMUP; }
}

/**
 * Pure mapping function. Exported standalone so the mapping can be tested
 * and argued about without a bus, a mic, or a Kalman filter.
 *
 * @returns {{observations: Array<{key:string, strength:number, why:string}>,
 *            audioFrame: object, tone: object, baselineWarm: boolean}}
 */
export function mapProsodyToObservations(reading, baselines) {
  const obs = [];
  if (!reading || !reading.sufficient) {
    return { observations: obs, audioFrame: null, tone: null, baselineWarm: false,
             abstained: true, reason: 'insufficient voiced audio' };
  }

  const { prosodyTag, jitter, shimmer, hnr, energy, contour } = reading;

  if (prosodyTag === 'stressed') {
    obs.push({ key: 'sig.STRESS_ACUTE', strength: Math.min(1, (jitter / 0.08 + shimmer / 0.15) / 2),
               why: `jitter=${jitter} shimmer=${shimmer}` });
  } else if (prosodyTag === 'tense') {
    obs.push({ key: 'sig.COGNITIVE_LOAD', strength: Math.min(1, jitter / 0.08),
               why: `jitter=${jitter} without amplitude perturbation` });
  } else if (prosodyTag === 'clear') {
    obs.push({ key: 'sig.GENUINE_ENGAGEMENT', strength: Math.min(1, hnr),
               why: `hnr=${hnr} jitter=${jitter}` });
  }

  if (contour && contour.samples >= 5 && contour.regularity < 0.3) {
    obs.push({ key: 'sig.DISSONANCE', strength: Math.min(1, 1 - contour.regularity),
               why: `F0 contour regularity=${contour.regularity}` });
  }

  const warm = baselines ? baselines.energy.warm : false;
  const energyZ = baselines ? baselines.energy.z(energy) : 0;
  const audioFrame = {
    energy,
    energyZ: Math.round(energyZ * 100) / 100,
    // §1.1 — never claim an anomaly before the speaker's baseline exists
    energyAnomaly: warm && Math.abs(energyZ) > ENERGY_Z_ALERT,
    baselineWarm: warm,
  };

  return {
    observations: obs,
    audioFrame,
    tone: { energy, zcr: reading.zcr, centroid: reading.centroid },
    baselineWarm: warm,
    abstained: false,
  };
}

export class VoiceObserver {
  static UUID    = VOICE_OBSERVER_UUID;
  static VERSION = VOICE_OBSERVER_VERSION;

  /**
   * @param {object} opts
   * @param {object} opts.bus     AlkBus
   * @param {object} opts.latent  LatentModel — uses its public observe() only
   */
  constructor({ bus, latent } = {}) {
    if (!bus)    throw new Error('[voice-observer] bus is required');
    if (!latent) throw new Error('[voice-observer] latent (LatentModel) is required');
    this._bus = bus;
    this._latent = latent;
    this._baselines = { energy: new Rolling(), jitter: new Rolling(), shimmer: new Rolling() };
    this._stats = { readings: 0, abstained: 0, observations: 0, byKey: new Map(), anomalies: 0 };
    this._last = null;
  }

  /** Feed one prosodic reading (from ProsodyWindow.read()). */
  observe(reading) {
    this._stats.readings++;
    const mapped = mapProsodyToObservations(reading, this._baselines);
    this._last = { reading, mapped };

    if (mapped.abstained) {
      this._stats.abstained++;
      // §1.2 — abstention is announced, not silent.
      this._bus.emit('alk.voice.abstained', { reason: mapped.reason, frames: reading && reading.frames });
      return mapped;
    }

    // baseline update AFTER z-scoring, so a reading never scores against itself
    this._baselines.energy.push(reading.energy);
    this._baselines.jitter.push(reading.jitter);
    this._baselines.shimmer.push(reading.shimmer);

    for (const o of mapped.observations) {
      this._latent.observe(o.key, o.strength);
      this._stats.observations++;
      this._stats.byKey.set(o.key, (this._stats.byKey.get(o.key) ?? 0) + 1);
    }

    if (mapped.audioFrame) {
      if (mapped.audioFrame.energyAnomaly) this._stats.anomalies++;
      this._bus.emit('alk.audio.frame', mapped.audioFrame);
    }
    if (mapped.tone) this._bus.emit('alk.verbal.analysis.tone', mapped.tone);

    this._bus.emit('alk.voice.prosody', { ...reading, observations: mapped.observations });
    return mapped;
  }

  get last() { return this._last; }

  /** §12.6 — diagnostic engine, queryable live. */
  health() {
    return {
      version: VOICE_OBSERVER_VERSION,
      readings: this._stats.readings,
      abstained: this._stats.abstained,
      observations: this._stats.observations,
      byKey: Object.fromEntries(this._stats.byKey),
      anomalies: this._stats.anomalies,
      baselineWarm: this._baselines.energy.warm,
      baselineFrames: this._baselines.energy.len,
      status: this._stats.readings === 0 ? 'idle'
            : this._stats.observations === 0 ? 'degraded'
            : !this._baselines.energy.warm ? 'warming'
            : 'healthy',
    };
  }
}
