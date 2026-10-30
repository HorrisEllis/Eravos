/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  Pendulum Adapter  ·  lib/pendulum.js  ·  v1.1.0                       ║
 * ║  UUID: pend-adapter-1000-0000-000000000001                             ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * ESM wrapper around pendulum-swing math engine.
 * Tracks named resonance signals over time.
 *
 * Signals tracked by default:
 *   gap_pressure   — gap field strength per analysis
 *   friction       — edge friction intensity
 *   tension        — structural tension
 *   coherence      — theta coherence
 *   emotion_valence— primary emotion valence proxy
 *
 * All rhythm properties: period, amplitude, damping, phase, forced.
 *
 * v1.1.0 — P4: Edge detection
 *   observe() now detects signal edges (forced + active phase transition)
 *   and returns them in the profile result. Callers can subscribe to
 *   edge events via onEdge(fn). The edge condition is:
 *
 *     forced.isForced === true  AND  phase.position ∈ { 'rising', 'falling' }
 *
 *   This is the PREDICTIVE_MISMATCH signal from the Drift Engine — the
 *   signal is deviating from its own predicted pattern during an active
 *   phase transition. Something external is driving it.
 *
 *   detectEdge(profile) is exported for use by the CRE bridge layer.
 */

'use strict';

// ── Pure pendulum math (inlined from pendulum-swing/src/math.js) ──────────────

const MIN_OBS = 3;
const INSUFFICIENT = { value: null, confidence: 0, reason: 'INSUFFICIENT_DATA' };

function mean(obs) {
  if (!obs || !obs.length) return 0;
  return obs.reduce((a, o) => a + o.value, 0) / obs.length;
}

function zeroCrossings(obs, m) {
  const crossings = [];
  for (let i = 1; i < obs.length; i++) {
    const prev = obs[i - 1].value - m;
    const curr = obs[i].value - m;
    if (prev < 0 && curr >= 0)  crossings.push({ ts: obs[i].ts, direction: 'up' });
    else if (prev >= 0 && curr < 0) crossings.push({ ts: obs[i].ts, direction: 'down' });
  }
  return crossings;
}

function computePeriod(obs) {
  if (!obs || obs.length < MIN_OBS) return INSUFFICIENT;
  const m = mean(obs);
  const crossings = zeroCrossings(obs, m);
  const up   = crossings.filter(c => c.direction === 'up');
  const down = crossings.filter(c => c.direction === 'down');
  const same = up.length >= down.length ? up : down;
  if (same.length < 2) return { value: null, confidence: 0.1, reason: 'NEED_MORE_CYCLES' };
  const periods = [];
  for (let i = 1; i < same.length; i++) periods.push(same[i].ts - same[i - 1].ts);
  const avg = periods.reduce((a, b) => a + b, 0) / periods.length;
  const variance = periods.reduce((a, p) => a + Math.pow(p - avg, 2), 0) / periods.length;
  const cv = Math.sqrt(variance) / avg;
  const confidence = Math.max(0, Math.min(1, 1 - cv)) * Math.min(1, periods.length / 5);
  return { value: Math.round(avg), confidence: Math.round(confidence * 100) / 100, sampleSize: periods.length };
}

function computeAmplitude(obs) {
  if (!obs || obs.length < MIN_OBS) return INSUFFICIENT;
  const m = mean(obs);
  let maxAbove = 0, maxBelow = 0;
  for (const o of obs) {
    const d = o.value - m;
    if (d > maxAbove) maxAbove = d;
    if (d < maxBelow) maxBelow = d;
  }
  const pos = Math.round(maxAbove * 1000) / 1000;
  const neg = Math.round(Math.abs(maxBelow) * 1000) / 1000;
  return { positive: pos, negative: neg, asymmetry: neg > 0 ? Math.round((pos / neg) * 1000) / 1000 : null };
}

function computeDamping(obs) {
  if (!obs || obs.length < MIN_OBS * 2) return INSUFFICIENT;
  const m = mean(obs);
  const half = Math.floor(obs.length / 2);
  const first = obs.slice(0, half);
  const second = obs.slice(half);
  function halfAmp(o) { let max = 0; for (const x of o) { const d = Math.abs(x.value - m); if (d > max) max = d; } return max; }
  const a1 = halfAmp(first), a2 = halfAmp(second);
  if (a1 === 0) return INSUFFICIENT;
  const coeff = Math.round((a2 / a1) * 1000) / 1000;
  return { coefficient: coeff, direction: coeff < 0.95 ? 'damping' : coeff > 1.05 ? 'amplifying' : 'neutral' };
}

function computePhase(obs, periodResult) {
  if (!obs || obs.length < MIN_OBS || !periodResult?.value) return INSUFFICIENT;
  const m = mean(obs);
  const crossings = zeroCrossings(obs, m);
  if (!crossings.length) return INSUFFICIENT;
  const last = crossings[crossings.length - 1];
  const lastObs = obs[obs.length - 1];
  const p = periodResult.value;
  const posInHalf = ((lastObs.ts - last.ts) % (p / 2)) / (p / 2);
  let current = last.direction === 'up' ? 0.25 + posInHalf * 0.25 : 0.75 + posInHalf * 0.25;
  current = Math.round((current % 1) * 1000) / 1000;
  const position = current < 0.1 || current > 0.9 ? 'trough'
    : current < 0.4 ? 'rising'
    : current < 0.6 ? 'peak'
    : 'falling';
  return { current, position, confidence: periodResult.confidence };
}

function computeForced(obs, periodResult, phaseResult) {
  if (!obs || obs.length < MIN_OBS || !periodResult?.value || typeof phaseResult?.current !== 'number') return INSUFFICIENT;
  const m = mean(obs);
  const amp = computeAmplitude(obs);
  if (!amp || amp.positive == null) return INSUFFICIENT;
  const expected = m + Math.sin(phaseResult.current * 2 * Math.PI) * ((amp.positive + amp.negative) / 2);
  const deviation = Math.abs(obs[obs.length - 1].value - expected);
  const maxDev = amp.positive + amp.negative;
  const tensionScore = maxDev > 0 ? Math.min(1, Math.round((deviation / maxDev) * 1000) / 1000) : 0;
  return { isForced: tensionScore > 0.3, deviation: Math.round(deviation * 1000) / 1000, tensionScore };
}

function fullProfile(obs) {
  if (!obs || !obs.length) return { status: 'NO_DATA', observationCount: 0, period: INSUFFICIENT, amplitude: INSUFFICIENT, damping: INSUFFICIENT, phase: INSUFFICIENT, forced: INSUFFICIENT };
  const sorted = obs.slice().sort((a, b) => a.ts - b.ts);
  const p  = computePeriod(sorted);
  const a  = computeAmplitude(sorted);
  const d  = computeDamping(sorted);
  const ph = computePhase(sorted, p);
  const f  = computeForced(sorted, p, ph);
  return {
    status: sorted.length >= MIN_OBS ? 'ACTIVE' : 'WARMING',
    observationCount: sorted.length,
    timespan: sorted.length > 1 ? sorted[sorted.length - 1].ts - sorted[0].ts : 0,
    mean: Math.round(mean(sorted) * 1000) / 1000,
    period: p, amplitude: a, damping: d, phase: ph, forced: f,
  };
}

// ── P4: Edge Detection ────────────────────────────────────────────────────────

/**
 * Detect a signal edge from a pendulum profile.
 *
 * A signal edge is the formal definition of PREDICTIVE_MISMATCH:
 *   forced.isForced === true  AND  phase.position ∈ { 'rising', 'falling' }
 *
 * This means: the signal is deviating from its own predicted trajectory
 * while it is in an active transition phase. Something external is driving it.
 * This is structurally identical to the Drift Engine's PREDICTIVE_MISMATCH
 * signal and the pendulum's forced flag — they are the same operation at
 * different resolutions. Unified here.
 *
 * Returns null if no edge is detected.
 * Returns an edge descriptor if detected — callers emit this on their
 * alerts channel.
 *
 * @param  {string}  signalId  — the signal name
 * @param  {object}  profile   — result from PendulumStore.profile()
 * @returns {object|null}
 */
export function detectEdge(signalId, profile) {
  if (!profile?.profile) return null;
  const p = profile.profile;
  if (!p.forced?.isForced) return null;
  if (!['rising', 'falling'].includes(p.phase?.position)) return null;

  return {
    type:          'edge_detected',
    signal:        signalId,
    phase:         p.phase.position,
    deviation:     p.forced.deviation,
    tension_score: p.forced.tensionScore,
    amplitude:     p.amplitude,
    period:        p.period,
    damping:       p.damping?.direction ?? null,
    mean:          p.mean,
    observation_count: p.observationCount,
    note: 'PREDICTIVE_MISMATCH: signal deviating from predicted pattern during active phase transition. External driver suspected.',
  };
}

// ── Pendulum Signal Store ─────────────────────────────────────────────────────

const MAX_OBS_PER_SIGNAL = 200;

export class PendulumStore {
  constructor() {
    this._signals   = new Map();
    this._edgeListeners = new Set();  // P4: edge subscribers
  }

  /**
   * P4: Subscribe to edge events.
   * fn receives the edge descriptor whenever detectEdge fires.
   * Returns an unsubscribe function.
   */
  onEdge(fn) {
    this._edgeListeners.add(fn);
    return () => this._edgeListeners.delete(fn);
  }

  observe(signalId, value, source = 'cr', ts = Date.now()) {
    if (!this._signals.has(signalId)) {
      this._signals.set(signalId, { id: signalId, observations: [], createdAt: ts });
    }
    const sig = this._signals.get(signalId);
    const last = sig.observations[sig.observations.length - 1];
    if (last && ts < last.ts) {
      ts = last.ts + 1;
    }
    sig.observations.push({ ts, value: Number(value), source });
    sig.updatedAt = ts;
    if (sig.observations.length > MAX_OBS_PER_SIGNAL) sig.observations.shift();

    const profileResult = this.profile(signalId);

    // P4: check for edge on every observation
    const edge = detectEdge(signalId, profileResult);
    if (edge) {
      for (const fn of this._edgeListeners) {
        try { fn(edge); } catch {}
      }
      // Attach to profile result so callers can check it directly
      profileResult._edge = edge;
    }

    return profileResult;
  }

  profile(signalId) {
    const sig = this._signals.get(signalId);
    if (!sig) return null;
    return {
      signalId,
      createdAt: sig.createdAt,
      updatedAt: sig.updatedAt,
      profile:   fullProfile(sig.observations),
    };
  }

  profiles() {
    const out = {};
    for (const [id] of this._signals) {
      out[id] = this.profile(id);
    }
    return out;
  }

  signals() {
    return [...this._signals.entries()].map(([id, sig]) => ({
      id,
      observationCount: sig.observations.length,
      createdAt: sig.createdAt,
      updatedAt: sig.updatedAt,
    }));
  }

  compare(sigA, sigB) {
    const pA = this._signals.get(sigA);
    const pB = this._signals.get(sigB);
    if (!pA || !pB) return null;
    const profA = fullProfile(pA.observations);
    const profB = fullProfile(pB.observations);
    const phaseA = profA.phase?.current;
    const phaseB = profB.phase?.current;
    const phaseDelta = (phaseA != null && phaseB != null) ? Math.abs(phaseA - phaseB) : null;
    return {
      signalA: sigA, signalB: sigB,
      inPhase:     phaseDelta != null && phaseDelta < 0.1,
      inAntiPhase: phaseDelta != null && Math.abs(phaseDelta - 0.5) < 0.1,
      phaseDelta,
      periodRatio: profA.period?.value && profB.period?.value
        ? Math.round((profA.period.value / profB.period.value) * 1000) / 1000
        : null,
      dampingA: profA.damping?.direction,
      dampingB: profB.damping?.direction,
    };
  }

  snapshot() {
    const out = {};
    for (const [id, sig] of this._signals) {
      out[id] = { ...sig };
    }
    return out;
  }

  restore(snap) {
    this._signals.clear();
    for (const [id, sig] of Object.entries(snap)) {
      this._signals.set(id, sig);
    }
  }
}

export default PendulumStore;
