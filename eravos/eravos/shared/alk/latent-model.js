/**
 * @module       latent-model
 * @uuid         d4e5f6a7-b8c9-4d0e-1f2a-3b4c5d6e7f80
 * @version      1.0.0
 *
 * Latent State Estimator — Bayesian fusion of all signal streams
 * into a unified 5D model of internal state.
 *
 * ── THE CORE IDEA ─────────────────────────────────────────────────────────────
 *
 *   Every sensor (face, body, voice, speech) observes the same underlying
 *   person from a different angle. None of them see the truth directly.
 *   Each observation is a noisy, partial projection of the actual internal state.
 *
 *   The estimator maintains a probability distribution over the latent state
 *   and updates it every frame using Bayes' rule:
 *
 *     P(state | observations) ∝ P(observations | state) × P(state)
 *
 *   In practice: Kalman filter variant (Extended Kalman for nonlinear
 *   observation functions) where each engine's output is an observation
 *   with a known noise model.
 *
 * ── LATENT DIMENSIONS ─────────────────────────────────────────────────────────
 *
 *   VALENCE     [-1, +1]   Negative ←→ positive affect.
 *               Not sentiment (words). Not expression (face).
 *               The underlying hedonic tone — does this experience feel bad or good?
 *               Source: sentiment slope + polarity + expression JOY/SADNESS/FEAR
 *
 *   AROUSAL     [0, 1]     Calm ←→ activated.
 *               Physiological activation level.
 *               Source: audio energy σ, blink rate, speech rate, shoulder tension,
 *               micro-expression frequency, gaze saccade rate
 *
 *   SUPPRESSION [0, 1]     Authentic ←→ masked.
 *               The gain of the person's affect regulation system.
 *               High = what you see ≠ what they feel.
 *               Source: micro-expression rate × confidence, surface/subsurface gap,
 *               cross-channel incongruence, friction density × expression flatness
 *
 *   COHERENCE   [0, 1]     Integrated ←→ fragmented.
 *               Are all channels telling the same story?
 *               High coherence = face, body, voice, words all congruent.
 *               Source: cross-stream correlation score, signal entropy
 *
 *   ENGAGEMENT  [-1, +1]   Withdrawal ←→ approach motivation.
 *               Direction of motivational orientation.
 *               Source: forward lean, gaze contact, open posture vs gaze aversion,
 *               shoulder raise, backward lean
 *
 * ── UPDATE ARCHITECTURE ──────────────────────────────────────────────────────
 *
 *   State vector: x = [valence, arousal, suppression, coherence, engagement]
 *   Error covariance: P (5×5 diagonal, initialized to high uncertainty)
 *   Process noise: Q (5×5 diagonal — how much state can change per frame)
 *   Observation noise: R (per-observation — how reliable is each sensor?)
 *
 *   Each observation is a scalar update to one or more latent dimensions.
 *   The Kalman gain K = P·H^T · (H·P·H^T + R)^{-1} determines how much
 *   to trust the new observation vs the prior.
 *
 *   After N frames with no observations, uncertainty increases (P grows).
 *   When observations arrive, uncertainty decreases proportionally to
 *   their reliability (low R = high reliability = large update).
 *
 * ── OBSERVATION RELIABILITY (R values) ────────────────────────────────────────
 *
 *   Face landmarks     : R = 0.15  (high reliability, stable geometry)
 *   Blendshapes        : R = 0.20  (reliable but face-angle dependent)
 *   Micro-expression   : R = 0.10  (very reliable when suppression detected)
 *   Audio energy       : R = 0.30  (reliable for arousal proxy)
 *   Pitch contour      : R = 0.35  (noisy, mic quality dependent)
 *   Speech sentiment   : R = 0.40  (lexicon-based, imprecise)
 *   Speech friction    : R = 0.25  (reliable disfluency detection)
 *   Body pose          : R = 0.25  (reliable for gross posture)
 *   Signal topology    : R = 0.20  (composite, multi-source)
 *   Cross-stream       : R = 0.15  (high-value integrated signal)
 *
 * ── BUS EVENTS ────────────────────────────────────────────────────────────────
 *
 *   Subscribes:
 *     alk.expression.composite    — expression label + confidence
 *     alk.expression.micro        — suppressed micro-expression
 *     alk.expression.state        — full expression scores
 *     alk.signal.composite        — cross-stream behavioral composite
 *     alk.signal.transition       — dominant state change
 *     alk.video.landmarks.face    — EAR, gaze, head position
 *     alk.video.landmarks.pose    — body posture
 *     alk.video.cue.detected      — nonverbal cue
 *     alk.verbal.transcript       — speech batch (friction, sentiment, topology)
 *
 *   Emits:
 *     alk.latent.state            — full posterior every N frames
 *     alk.latent.update           — lightweight update every frame
 *     alk.latent.shift            — when any dimension moves > SHIFT_THRESHOLD
 *     alk.latent.pulse            — §1.8 heartbeat
 */

'use strict';

export const LATENT_UUID    = 'd4e5f6a7-b8c9-4d0e-1f2a-3b4c5d6e7f80';
export const LATENT_VERSION = '1.9.0';

// ── Dimension indices ────────────────────────────────────────────────────────
const DIM = Object.freeze({ VALENCE:0, AROUSAL:1, SUPPRESSION:2, COHERENCE:3, ENGAGEMENT:4 });
const N_DIM = 5;

// ── Kalman filter parameters ─────────────────────────────────────────────────
// Process noise Q: how much each dimension can change per frame
// Higher = faster response to changes, less smoothing
const Q = [0.008, 0.012, 0.006, 0.010, 0.010];

// Initial uncertainty P: start with high uncertainty (don't assume anything)
const P_INIT = [0.5, 0.5, 0.5, 0.5, 0.5];

// Shift detection threshold
const SHIFT_THRESHOLD = 0.12;

// State snapshot interval (frames)
const STATE_INTERVAL = 15;

// ── Observation model ─────────────────────────────────────────────────────────
// Maps observation sources to latent dimensions they inform + their reliability.
// R = observation noise variance (lower = more reliable = larger Kalman update).
// weight = how strongly this observation affects each dimension.
const OBS_MODELS = {

  // Expression composites → valence, arousal, suppression
  'expr.JOY_GENUINE':  { dims: { VALENCE:+0.8, AROUSAL:+0.3, SUPPRESSION:-0.4 }, R: 0.15 },
  'expr.JOY_SOCIAL':   { dims: { VALENCE:+0.3, AROUSAL:+0.2, SUPPRESSION:+0.3 }, R: 0.20 },
  'expr.FEAR':         { dims: { VALENCE:-0.7, AROUSAL:+0.8, SUPPRESSION:+0.1 }, R: 0.15 },
  'expr.ANGER':        { dims: { VALENCE:-0.6, AROUSAL:+0.7, SUPPRESSION:+0.2 }, R: 0.15 },
  'expr.DISGUST':      { dims: { VALENCE:-0.7, AROUSAL:+0.4, SUPPRESSION:+0.1 }, R: 0.15 },
  'expr.CONTEMPT':     { dims: { VALENCE:-0.5, AROUSAL:+0.2, SUPPRESSION:+0.5 }, R: 0.18 },
  'expr.SADNESS':      { dims: { VALENCE:-0.8, AROUSAL:-0.4, SUPPRESSION:+0.1 }, R: 0.15 },
  'expr.SURPRISE':     { dims: { VALENCE: 0.0, AROUSAL:+0.9, SUPPRESSION:-0.1 }, R: 0.12 },

  // Micro-expressions (suppressed) → high suppression signal
  'micro.FEAR':        { dims: { VALENCE:-0.5, AROUSAL:+0.6, SUPPRESSION:+0.7 }, R: 0.10 },
  'micro.ANGER':       { dims: { VALENCE:-0.4, AROUSAL:+0.5, SUPPRESSION:+0.7 }, R: 0.10 },
  'micro.DISGUST':     { dims: { VALENCE:-0.5, AROUSAL:+0.3, SUPPRESSION:+0.8 }, R: 0.10 },
  'micro.CONTEMPT':    { dims: { VALENCE:-0.3, AROUSAL:+0.2, SUPPRESSION:+0.9 }, R: 0.08 },
  'micro.SADNESS':     { dims: { VALENCE:-0.6, AROUSAL:-0.2, SUPPRESSION:+0.7 }, R: 0.10 },
  'micro.SURPRISE':    { dims: { VALENCE: 0.0, AROUSAL:+0.5, SUPPRESSION:+0.3 }, R: 0.12 },

  // Signal topology composites → all dimensions
  'sig.STRESS_ACUTE':       { dims: { VALENCE:-0.6, AROUSAL:+0.8, SUPPRESSION:+0.3, COHERENCE:-0.2 }, R: 0.15 },
  'sig.COGNITIVE_LOAD':     { dims: { VALENCE:-0.2, AROUSAL:+0.4, COHERENCE:+0.3, ENGAGEMENT:+0.2 }, R: 0.20 },
  'sig.SOCIAL_MASK':        { dims: { SUPPRESSION:+0.8, COHERENCE:-0.5, VALENCE:+0.1 }, R: 0.15 },
  'sig.GENUINE_ENGAGEMENT': { dims: { VALENCE:+0.6, SUPPRESSION:-0.6, COHERENCE:+0.6, ENGAGEMENT:+0.7 }, R: 0.15 },
  'sig.CONCEALMENT':        { dims: { SUPPRESSION:+0.9, COHERENCE:-0.6, VALENCE:-0.3 }, R: 0.12 },
  'sig.CONTEMPT_LEAK':      { dims: { VALENCE:-0.4, SUPPRESSION:+0.8, COHERENCE:-0.4 }, R: 0.12 },
  'sig.DISSONANCE':         { dims: { COHERENCE:-0.8, SUPPRESSION:+0.4, AROUSAL:+0.3 }, R: 0.15 },
  'sig.APPROACH':           { dims: { ENGAGEMENT:+0.8, VALENCE:+0.3, COHERENCE:+0.3 }, R: 0.20 },
  'sig.WITHDRAWAL':         { dims: { ENGAGEMENT:-0.7, VALENCE:-0.3, AROUSAL:+0.3 }, R: 0.20 },
  'sig.FREEZE':             { dims: { AROUSAL:-0.3, SUPPRESSION:+0.4, ENGAGEMENT:-0.4 }, R: 0.20 },

  // Nonverbal cues → targeted dimension updates
  'cue.gaze_aversion':    { dims: { ENGAGEMENT:-0.5, SUPPRESSION:+0.2 }, R: 0.25 },
  'cue.eye_contact':      { dims: { ENGAGEMENT:+0.5, SUPPRESSION:-0.1 }, R: 0.25 },
  'cue.shoulder_raise':   { dims: { AROUSAL:+0.4, VALENCE:-0.3, ENGAGEMENT:-0.2 }, R: 0.25 },
  'cue.brow_furrow':      { dims: { VALENCE:-0.3, AROUSAL:+0.3 }, R: 0.30 },
  'cue.smile_social':     { dims: { VALENCE:+0.2, SUPPRESSION:+0.2 }, R: 0.30 },
  'cue.hand_to_mouth':    { dims: { SUPPRESSION:+0.4, AROUSAL:+0.2 }, R: 0.25 },
  'cue.head_nod':         { dims: { ENGAGEMENT:+0.3, VALENCE:+0.1 }, R: 0.30 },
  'cue.open_palm':        { dims: { ENGAGEMENT:+0.4, SUPPRESSION:-0.2 }, R: 0.30 },
  'cue.head_tilt_left':   { dims: { ENGAGEMENT:+0.2, AROUSAL:+0.1 }, R: 0.35 },
  'cue.head_tilt_right':  { dims: { ENGAGEMENT:+0.2, AROUSAL:+0.1 }, R: 0.35 },

  // Audio / speech → arousal, valence, suppression
  'audio.energy_high':    { dims: { AROUSAL:+0.5 }, R: 0.30 },
  'audio.energy_low':     { dims: { AROUSAL:-0.3 }, R: 0.35 },
  'audio.energy_anomaly': { dims: { AROUSAL:+0.6, SUPPRESSION:+0.2 }, R: 0.25 },
  'speech.friction':      { dims: { AROUSAL:+0.3, SUPPRESSION:+0.3, VALENCE:-0.2 }, R: 0.25 },
  'speech.positive':      { dims: { VALENCE:+0.4 }, R: 0.40 },
  'speech.negative':      { dims: { VALENCE:-0.4 }, R: 0.40 },
  'speech.baseline_alert':{ dims: { AROUSAL:+0.4, SUPPRESSION:+0.3, COHERENCE:-0.2 }, R: 0.20 },
};

// ── Latent State Estimator ────────────────────────────────────────────────────
export class LatentModel {
  /**
   * @param {object} opts
   * @param {object} opts.bus            — { on, emit }
   * @param {number} [opts.stateInterval=15] — frames between full state emits
   */
  constructor({ bus, stateInterval = STATE_INTERVAL } = {}) {
    this._bus           = bus;
    this._stateInterval = stateInterval;
    this._frame         = 0;

    // Kalman state: x[i] = current estimate of dimension i
    this._x = new Float64Array(N_DIM);   // all start at 0 (neutral)
    // Kalman error covariance: diagonal P[i] = uncertainty in dimension i
    this._P = Float64Array.from(P_INIT);

    // History for shift detection and trajectory
    this._prevX = new Float64Array(N_DIM);
    this._shifts = [];           // recent significant shifts

    // Observation accumulator: average within a frame before applying
    this._frameObs = new Map(); // key → { sum, count, R }

    // Micro-expression rate tracker (suppression evidence)
    this._microCount  = 0;
    this._microWindow = 0;

    // Coherence: track inter-channel variance
    this._channelReadings = { face: null, body: null, voice: null, speech: null };

    // Session stats
    this.stats = {
      framesProcessed: 0,
      observationsTotal: 0,
      shiftsDetected: 0,
      byDimension: { VALENCE:0, AROUSAL:0, SUPPRESSION:0, COHERENCE:0, ENGAGEMENT:0 },
    };

    if (bus) this._bindBus();
  }

  // ── Bus wiring ─────────────────────────────────────────────────────────────

  _bindBus() {
    const b = this._bus;

    b.on('alk.expression.composite', ev => {
      const p = ev.payload ?? ev;
      const key = `expr.${p.label}`;
      const model = OBS_MODELS[key];
      if (!model) return;
      // Scale observation strength by confidence × scale multiplier
      const scaleMult = p.scale === 'MICRO' ? 1.4 : p.scale === 'PARTIAL' ? 1.0 : 0.8;
      const strength = (p.confidence ?? 0.5) * scaleMult;
      this._queueObs(key, strength, model.R, model.dims);
    });

    b.on('alk.expression.micro', ev => {
      const p = ev.payload ?? ev;
      const key = `micro.${p.label}`;
      const model = OBS_MODELS[key];
      if (!model) return;
      // Micro-expressions with high suppression confidence = strongest signal
      const strength = (p.suppressionConfidence ?? 0.5);
      this._queueObs(key, strength, model.R * (1 - strength * 0.5), model.dims);
      this._microCount++;
      this._microWindow++;
    });

    b.on('alk.signal.composite', ev => {
      const p = ev.payload ?? ev;
      const key = `sig.${p.label}`;
      const model = OBS_MODELS[key];
      if (!model) return;
      this._queueObs(key, p.score ?? 0.5, model.R, model.dims);
    });

    b.on('alk.video.cue.detected', ev => {
      const p = ev.payload ?? ev;
      const key = `cue.${p.cueType}`;
      const model = OBS_MODELS[key];
      if (!model) return;
      this._queueObs(key, p.intensity ?? 0.5, model.R, model.dims);
    });

    b.on('alk.video.landmarks.face', ev => {
      const p = ev.payload ?? ev;
      // EAR → arousal (low EAR = closing eyes = low arousal OR blink)
      const ear = ((p.leftEAR ?? 1) + (p.rightEAR ?? 1)) / 2;
      this._directUpdate(DIM.AROUSAL, ear > 0.25 ? 0 : -(0.25 - ear) * 4, 0.35);
      // Gaze deviation → engagement
      const gl = p.leftGaze, gr = p.rightGaze;
      if (gl && gr) {
        const dev = (Math.sqrt(gl.x**2+gl.y**2) + Math.sqrt(gr.x**2+gr.y**2)) / 2;
        this._directUpdate(DIM.ENGAGEMENT, -Math.min(1, dev * 3) * 0.5, 0.35);
      }
      this._channelReadings.face = this._x[DIM.VALENCE]; // snapshot for coherence
    });

    b.on('alk.video.landmarks.pose', ev => {
      const p = ev.payload ?? ev;
      const lms = p.rawLandmarks;
      if (!lms || lms.length < 17) return;
      // Shoulder symmetry → coherence proxy
      const ls = lms[11], rs = lms[12];
      if (ls && rs) {
        const asym = Math.abs(ls.y - rs.y);
        if (asym > 0.03) this._directUpdate(DIM.SUPPRESSION, Math.min(1, asym * 8) * 0.3, 0.30);
      }
      this._channelReadings.body = this._x[DIM.ENGAGEMENT];
    });

    b.on('alk.verbal.transcript', ev => {
      const p = ev.payload ?? ev;
      // Sentiment from speech
      const sent = p.sentiment?.score ?? 0;
      if (Math.abs(sent) > 0.1) {
        const key = sent > 0 ? 'speech.positive' : 'speech.negative';
        const model = OBS_MODELS[key];
        this._queueObs(key, Math.abs(sent), model.R, model.dims);
      }
      // Friction
      if (p.friction?.friction) {
        const model = OBS_MODELS['speech.friction'];
        this._queueObs('speech.friction', p.friction.score ?? 0.5, model.R, model.dims);
      }
      // Topology baseline alert
      if (p.topology?.baseline?.alert) {
        const model = OBS_MODELS['speech.baseline_alert'];
        const z = p.topology.baseline.compositeZ ?? 1;
        this._queueObs('speech.baseline_alert', Math.min(1, z / 4), model.R, model.dims);
      }
      this._channelReadings.speech = sent;
    });

    // Audio energy observations (from codec audio frame events)
    b.on('alk.audio.frame', ev => {
      const p = ev.payload ?? ev;
      if (p.energyAnomaly) {
        const model = OBS_MODELS['audio.energy_anomaly'];
        this._queueObs('audio.energy_anomaly', Math.min(1, Math.abs(p.energyZ ?? 2) / 4), model.R, model.dims);
      } else if (p.energy > 0.05) {
        const model = OBS_MODELS['audio.energy_high'];
        this._queueObs('audio.energy_high', Math.min(1, p.energy * 10), model.R, model.dims);
      } else {
        const model = OBS_MODELS['audio.energy_low'];
        this._queueObs('audio.energy_low', 0.3, model.R, model.dims);
      }
      this._channelReadings.voice = p.energy;
    });

    b.on('alk.video.frame.analyzed', ev => {
      const p = ev.payload ?? ev;
      this._frame = p.frameIndex ?? this._frame + 1;
      this._tick();
    });
  }

  // ── Observation queue ─────────────────────────────────────────────────────

  _queueObs(key, strength, R, dims) {
    // Accumulate observations within a frame: average them
    if (!this._frameObs.has(key)) {
      this._frameObs.set(key, { sum: 0, count: 0, R, dims });
    }
    const obs = this._frameObs.get(key);
    obs.sum += strength;
    obs.count++;
    obs.R = Math.min(obs.R, R); // take most reliable R
  }

  // ── Kalman update step (scalar observation per dimension) ─────────────────

  _kalmanUpdate(dimIdx, z, R) {
    // Predict (process noise grows uncertainty)
    this._P[dimIdx] += Q[dimIdx];

    // Gain: how much to trust new observation vs prior
    const K = this._P[dimIdx] / (this._P[dimIdx] + R);

    // Update: move state estimate toward observation
    this._x[dimIdx] = this._x[dimIdx] + K * (z - this._x[dimIdx]);

    // Update error covariance: uncertainty decreases with observation
    this._P[dimIdx] = (1 - K) * this._P[dimIdx];

    // Clamp to valid range
    const dim = Object.keys(DIM)[dimIdx];
    if (dim === 'VALENCE' || dim === 'ENGAGEMENT') {
      this._x[dimIdx] = Math.max(-1, Math.min(1, this._x[dimIdx]));
    } else {
      this._x[dimIdx] = Math.max(0, Math.min(1, this._x[dimIdx]));
    }
  }

  _directUpdate(dimIdx, delta, R) {
    // Direct delta update (for sensor readings that are changes, not targets)
    const target = Math.max(-1, Math.min(1, this._x[dimIdx] + delta));
    this._kalmanUpdate(dimIdx, target, R);
  }

  // ── Frame tick ─────────────────────────────────────────────────────────────

  _tick() {
    this.stats.framesProcessed++;

    // Apply accumulated frame observations
    for (const [, obs] of this._frameObs) {
      for (const [dimName, weight] of Object.entries(obs.dims)) {
        const dimIdx = DIM[dimName];
        if (dimIdx === undefined) continue;
        const avgStrength = obs.sum / obs.count;
        // Observation: push dimension toward weight * avgStrength
        const z = this._x[dimIdx] + weight * avgStrength;
        this._kalmanUpdate(dimIdx, Math.max(-1, Math.min(1, z)), obs.R);
        this.stats.observationsTotal++;
        this.stats.byDimension[dimName] = (this.stats.byDimension[dimName] ?? 0) + 1;
      }
    }
    this._frameObs.clear();

    // Update coherence from cross-channel variance
    this._updateCoherence();

    // Update suppression from micro-expression rate
    if (this._microWindow >= 30) {
      const microRate = this._microCount / this._microWindow;
      if (microRate > 0.05) {
        this._kalmanUpdate(DIM.SUPPRESSION,
          Math.min(1, this._x[DIM.SUPPRESSION] + microRate * 3), 0.20);
      }
      this._microCount = 0;
      this._microWindow = 0;
    } else {
      this._microWindow++;
    }

    // Detect significant shifts
    this._detectShifts();

    // Emit lightweight update every frame
    this._emit('alk.latent.update', this._snapshot(false));

    // Full state every N frames
    if (this._frame % this._stateInterval === 0) {
      this._emit('alk.latent.state', this._snapshot(true));
    }

    // §1.8 pulse every 30 frames
    if (this._frame % 30 === 0) {
      this._emit('alk.latent.pulse', {
        frameIndex: this._frame,
        x: [...this._x],
        dominantDim: this._dominantDim(),
      });
    }
  }

  // ── Coherence from cross-channel agreement ────────────────────────────────

  _updateCoherence() {
    const readings = Object.values(this._channelReadings).filter(v => v !== null);
    if (readings.length < 2) return;
    // Coherence = 1 - normalized variance across channel valence readings
    const mean = readings.reduce((s,v)=>s+v,0) / readings.length;
    const variance = readings.reduce((s,v)=>s+(v-mean)**2,0) / readings.length;
    const coherence = Math.max(0, 1 - Math.min(1, Math.sqrt(variance) * 2));
    this._kalmanUpdate(DIM.COHERENCE, coherence, 0.20);
  }

  // ── Shift detection ───────────────────────────────────────────────────────

  _detectShifts() {
    const shifts = [];
    for (let i = 0; i < N_DIM; i++) {
      const delta = this._x[i] - this._prevX[i];
      if (Math.abs(delta) > SHIFT_THRESHOLD) {
        const dimName = Object.keys(DIM)[i];
        shifts.push({ dim: dimName, delta: Math.round(delta*1000)/1000, from: Math.round(this._prevX[i]*1000)/1000, to: Math.round(this._x[i]*1000)/1000 });
        this.stats.shiftsDetected++;
        this.stats.byDimension[dimName] = (this.stats.byDimension[dimName] ?? 0) + 1;
      }
    }
    if (shifts.length > 0) {
      this._shifts.push(...shifts);
      if (this._shifts.length > 50) this._shifts.splice(0, this._shifts.length - 50);
      this._emit('alk.latent.shift', { shifts, frameIndex: this._frame, state: this._snapshot(false) });
    }
    // Update previous state
    this._prevX.set(this._x);
  }

  // ── State snapshot ────────────────────────────────────────────────────────

  _snapshot(full = false) {
    const s = {
      frameIndex:   this._frame,
      valence:      r4(this._x[DIM.VALENCE]),
      arousal:      r4(this._x[DIM.AROUSAL]),
      suppression:  r4(this._x[DIM.SUPPRESSION]),
      coherence:    r4(this._x[DIM.COHERENCE]),
      engagement:   r4(this._x[DIM.ENGAGEMENT]),
      uncertainty:  this._P.map(v => r4(v)),
    };
    if (full) {
      s.dominant  = this._dominantDim();
      s.quadrant  = this._quadrant();
      s.recentShifts = this._shifts.slice(-5);
      s.stats     = { ...this.stats };
    }
    return s;
  }

  _dominantDim() {
    // Which dimension has moved furthest from neutral (0 for bounded, 0.5 for [0,1])?
    const deviations = [
      { dim: 'VALENCE',    dev: Math.abs(this._x[DIM.VALENCE]) },
      { dim: 'AROUSAL',    dev: Math.abs(this._x[DIM.AROUSAL] - 0.5) },
      { dim: 'SUPPRESSION',dev: this._x[DIM.SUPPRESSION] },
      { dim: 'COHERENCE',  dev: 1 - this._x[DIM.COHERENCE] },
      { dim: 'ENGAGEMENT', dev: Math.abs(this._x[DIM.ENGAGEMENT]) },
    ];
    return deviations.sort((a,b)=>b.dev-a.dev)[0].dim;
  }

  _quadrant() {
    // Russell's circumplex quadrant label
    const v = this._x[DIM.VALENCE], a = this._x[DIM.AROUSAL];
    if (v >= 0 && a >= 0.5) return 'EXCITED';
    if (v >= 0 && a <  0.5) return 'CONTENT';
    if (v <  0 && a >= 0.5) return 'DISTRESSED';
    return 'DEPRESSED';
  }

  // ── Direct ingest API ─────────────────────────────────────────────────────

  /**
   * Feed a raw observation directly (for non-bus usage).
   * @param {string} obsKey — key from OBS_MODELS
   * @param {number} strength — [0,1]
   */
  observe(obsKey, strength) {
    const model = OBS_MODELS[obsKey];
    if (!model) return;
    this._queueObs(obsKey, strength, model.R, model.dims);
  }

  /**
   * Manually tick one frame (for non-bus usage).
   */
  tick(frameIndex) {
    this._frame = frameIndex ?? this._frame + 1;
    this._tick();
  }

  get state() { return this._snapshot(true); }
  get x()     { return [...this._x]; }
  get P()     { return [...this._P]; }

  reset() {
    this._x.fill(0);
    this._P.set(P_INIT);
    this._prevX.fill(0);
    this._frameObs.clear();
    this._shifts = [];
    this._microCount = 0;
    this._microWindow = 0;
    this._channelReadings = { face:null, body:null, voice:null, speech:null };
    this._frame = 0;
  }

  _emit(event, data) { try { this._bus?.emit(event, data); } catch (_) {} }

  health() {
    return {
      status:  'OK',
      uuid:    LATENT_UUID,
      version: LATENT_VERSION,
      frame:   this._frame,
      state:   this._snapshot(false),
      uncertainty: [...this._P],
      stats:   { ...this.stats },
    };
  }
}

function r4(v) { return Math.round(v * 10000) / 10000; }
export { OBS_MODELS, DIM };
