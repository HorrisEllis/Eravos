/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  GapHunter — Relational Physics Engine                                  ║
 * ║  relational-physics.js  ·  v1.1.0                                       ║
 * ║  UUID: gh-rpe-0000-0000-1000-0000-000000000001                          ║
 * ║  HOOK: gaphunter:relational-physics:00001                               ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * THE FULL RELATIONAL PHYSICS STACK
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * WHAT THIS IS:
 *
 *   GapHunter finds where chains break.
 *   This engine models what happens when chains interact.
 *
 *   Two failure modes:
 *     GAP      — missing relational compression (absence failure)
 *                "No edge exists where one should stabilize compression"
 *
 *     FRICTION — unstable relational compression (interaction failure)
 *                "An edge exists but its interaction produces resistance,
 *                 contradiction, or overload"
 *
 *   Gap     = missing structure  → silence
 *   Friction = conflicting structure → resistance / drag
 *
 *   Emotion is not stored. It is computed.
 *   It is the felt dynamics of structure under constraint.
 *   Every emotion reduces to a configuration of Θ.
 *
 * THE STATE SPACE:
 *
 *   S = (E, G, F, Θ)
 *
 *   E = edges (relationships)
 *   G = gaps (missing structure)
 *   F = friction (conflicting structure)
 *   Θ = {H, I, C, M, P_c, P_e}
 *
 *   H   = entropy            — uncertainty / compression failure
 *   I   = intensity          — activation / energy load
 *   C   = causality          — directional influence strength
 *   M   = intimacy           — structural coupling strength
 *   P_c = cognitive empathy  — model accuracy of other's state
 *   P_e = emotional empathy  — affective resonance alignment
 *
 * AFFECTIVE FIELD SPECIFICATION (AFS):
 *
 *   AF = (N, E, G, F, Θ, D)
 *
 *   Emotion = Φ(Θ, E, G, F)
 *   Nonlinear state collapse. Emergent. Not labeled.
 *
 * SYSTEM STABILITY CONDITION:
 *
 *   Ω = Σ(C × M × P_c × P_e)         // coherence
 *   Stable if Ω > (H + F_total + G_total)
 *
 * PHASE TRANSITIONS:
 *
 *   love → resentment    : friction accumulation + empathy decay
 *   fear → anger         : control recovery attempt
 *   grief → numbness     : gap persistence collapse
 *   joy → overwhelm      : intensity overload
 *   anger → rage         : boundary system exceeds control bandwidth
 *
 * §1.1  All outputs are signals, not diagnoses.
 * §1.2  Nothing silently fails.
 * §5.5  No external runtime dependencies.
 * §5.6  Same structural pattern across all abstraction layers.
 *
 * v1.1.0 — P6: Full emotion basin field
 *   EmotionEngine.compute() now returns emotion_field: the complete proximity
 *   vector across all 16 basins, dominant cluster detection, internal tension
 *   between co-present emotions, and named dual-pole field signatures.
 *   Primary and secondary are preserved — existing callers unaffected.
 */

'use strict';

// ─── Math ────────────────────────────────────────────────────────────────────

function r4(n)            { return Math.round((n ?? 0) * 10000) / 10000; }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function mean(arr)        { return arr.length ? arr.reduce((a,b)=>a+b,0)/arr.length : 0; }
function dot(a, b)        { return a.reduce((s,v,i) => s + v*(b[i]??0), 0); }
function norm(v)          { return Math.sqrt(v.reduce((s,x) => s + x*x, 0)); }
function cosSim(a, b)     {
  const n = norm(a) * norm(b);
  return n < 1e-9 ? 0 : r4(dot(a, b) / n);
}

// ─── THETA — State Variable Set ──────────────────────────────────────────────

/**
 * Θ = {H, I, C, M, P_c, P_e}
 * Every node, edge, and relational pair carries a Theta.
 * Values are 0–1 unless noted (C can be negative for suppression).
 */
export class Theta {
  constructor({
    H   = 0.5,   // entropy: 0=compressed/clear, 1=maximally uncertain
    I   = 0.5,   // intensity: 0=dormant, 1=peak activation
    C   = 0.5,   // causality: -1=suppressive, 0=neutral, 1=strong causal push
    M   = 0.5,   // intimacy: 0=distant, 1=fully coupled
    P_c = 0.5,   // cognitive empathy: 0=projection/blindness, 1=accurate model
    P_e = 0.5,   // emotional empathy: 0=disconnected, 1=full resonance
  } = {}) {
    this.H   = r4(clamp(H,   0, 1));
    this.I   = r4(clamp(I,   0, 1));
    this.C   = r4(clamp(C,  -1, 1));
    this.M   = r4(clamp(M,   0, 1));
    this.P_c = r4(clamp(P_c, 0, 1));
    this.P_e = r4(clamp(P_e, 0, 1));
  }

  // ── Derived metrics ───────────────────────────────────────────────────────

  /**
   * Coherence contribution of this Theta.
   * Ω_local = C × M × P_c × P_e (positive C only)
   */
  get coherence() {
    const c = Math.max(0, this.C);
    return r4(c * this.M * this.P_c * this.P_e);
  }

  /**
   * Collapse pressure — how much this Theta is pushing toward breakdown.
   */
  get collapsePressure() {
    return r4((this.H + Math.max(0, -this.C) + (1 - this.P_c) * 0.3 + (1 - this.P_e) * 0.3) / 2.6);
  }

  /**
   * Gap signature — low structure across Θ.
   * Gap ⟺ (C↓, M↓, P_c↓, P_e↓, H↑)
   */
  get gapSignature() {
    return r4(
      this.H * 0.25 +
      (1 - Math.max(0, this.C)) * 0.25 +
      (1 - this.M)   * 0.20 +
      (1 - this.P_c) * 0.15 +
      (1 - this.P_e) * 0.15
    );
  }

  /**
   * Friction signature — high structure conflict.
   * Friction ⟺ (C conflicts, M asymmetry, P mismatch, H instability)
   * Computed per-pair, not per-node. This is a per-node contribution.
   */
  get frictionPotential() {
    const cConflict = this.C < 0 ? Math.abs(this.C) : 0;
    return r4(cConflict * 0.4 + this.H * 0.3 + (1 - this.P_c) * 0.15 + (1 - this.P_e) * 0.15);
  }

  /**
   * Delta application — returns new Theta after influence from field.
   * @param {object} delta — partial Theta update
   * @param {number} rate  — update rate (0–1)
   */
  update(delta = {}, rate = 0.1) {
    return new Theta({
      H:   this.H   + (delta.H   ?? 0) * rate,
      I:   this.I   + (delta.I   ?? 0) * rate,
      C:   this.C   + (delta.C   ?? 0) * rate,
      M:   this.M   + (delta.M   ?? 0) * rate,
      P_c: this.P_c + (delta.P_c ?? 0) * rate,
      P_e: this.P_e + (delta.P_e ?? 0) * rate,
    });
  }

  toJSON() {
    return { H: this.H, I: this.I, C: this.C, M: this.M, P_c: this.P_c, P_e: this.P_e };
  }

  toString() {
    return `Θ{H:${this.H} I:${this.I} C:${this.C} M:${this.M} Pc:${this.P_c} Pe:${this.P_e}}`;
  }
}

// ─── EMOTION SIGNATURES ───────────────────────────────────────────────────────

/**
 * Each emotion is a configuration of Θ, not a label.
 * These are attractor basins in Θ-space.
 *
 * Format: { H, I, C, M, P_c, P_e } with qualitative modifiers.
 * Values are target basin centers. Systems near these collapse into the emotion.
 */
export const EMOTION_SIGNATURES = Object.freeze({
  love: {
    label:   'love',
    description: 'Stable coherence + high coupling without loss of autonomy. Coherent coupling without collapse.',
    theta: { H: 0.15, I: 0.65, C: 0.80, M: 0.85, P_c: 0.80, P_e: 0.80 },
    C_sign: 'positive_aligned',
    note: 'If M grows while C drops, love → enmeshment. If P_e drops, love → distance.',
  },
  fear: {
    label:   'fear',
    description: 'Prediction instability under high entropy threat. Future collapse simulation without resolution path.',
    theta: { H: 0.90, I: 0.80, C: 0.15, M: 0.50, P_c: 0.20, P_e: 0.50 },
    C_sign: 'low_unstable',
    note: 'Fear is not about the past. It is about inability to stabilize what happens next.',
  },
  anger: {
    label:   'anger',
    description: 'Active boundary correction signal. System trying to restore causal symmetry.',
    theta: { H: 0.35, I: 0.80, C: 0.75, M: 0.45, P_c: 0.65, P_e: 0.45 },
    C_sign: 'high_assertive',
    note: 'Anger is not breakdown. It is boundary enforcement energy. C is high and assertive.',
  },
  rage: {
    label:   'rage',
    description: 'Overloaded anger + loss of modulation. Boundary system exceeds control bandwidth.',
    theta: { H: 0.75, I: 0.98, C: 0.30, M: 0.30, P_c: 0.20, P_e: 0.10 },
    C_sign: 'unstable_spiking',
    note: 'Rage = anger without damping function. P_c degrades under I overload.',
  },
  hatred: {
    label:   'hatred',
    description: 'High understanding + forced separation. Locked causality + inverted empathy.',
    theta: { H: 0.55, I: 0.70, C: -0.75, M: 0.55, P_c: 0.80, P_e: -0.60 },
    C_sign: 'high_negative',
    note: 'Hatred is not ignorance. It is structured rejection of known structure. P_c stays high — you know them well.',
  },
  resentment: {
    label:   'resentment',
    description: 'Frozen friction loop. Continuous causal replay without resolution. Friction that never discharges.',
    theta: { H: 0.50, I: 0.45, C: 0.30, M: 0.70, P_c: 0.75, P_e: 0.15 },
    C_sign: 'stuck',
    note: 'M stays high — still entangled. P_e suppressed. C is stuck, not inverted. Replay without resolution.',
  },
  grief: {
    label:   'grief',
    description: 'Persistent structural absence with high coupling memory. The graph still routes through what is gone.',
    theta: { H: 0.50, I: 0.25, C: 0.70, M: 0.85, P_c: 0.80, P_e: 0.60 },
    C_sign: 'past_intact',
    note: 'Edge remains, node removed. C is high because the causal chain is understood. The absence is exact.',
  },
  sorrow: {
    label:   'sorrow',
    description: 'Coherent loss signal. Stable structure with missing node. Preserved map of something no longer present.',
    theta: { H: 0.35, I: 0.20, C: 0.70, M: 0.75, P_c: 0.75, P_e: 0.70 },
    C_sign: 'stable_understood',
    note: 'Sorrow is cleaner than grief. The loss is understood. Lower H than grief — there is no ambiguity about what is gone.',
  },
  joy: {
    label:   'joy',
    description: 'High coherence + high positive amplification. Coherent expansion of meaning.',
    theta: { H: 0.10, I: 0.80, C: 0.75, M: 0.80, P_e: 0.90, P_c: 0.75 },
    C_sign: 'positive_drift',
    note: 'Joy = structured coherence expanding outward. Not stable — dynamic. H must stay low or joy collapses.',
  },
  contentment: {
    label:   'contentment',
    description: 'Stable low-entropy coherence. Equilibrium without excitement. No unresolved friction, no missing structure.',
    theta: { H: 0.15, I: 0.30, C: 0.65, M: 0.60, P_c: 0.65, P_e: 0.55 },
    C_sign: 'stable',
    note: 'I is low-medium. No drama in contentment. It is simply: stable.',
  },
  guilt: {
    label:   'guilt',
    description: 'Internal causal self-targeting loop. Self as both source and sink of causality. Recursive causal folding onto self-model.',
    theta: { H: 0.50, I: 0.55, C: 0.70, M: 0.50, P_c: 0.85, P_e: 0.40 },
    C_sign: 'self_directed',
    note: 'C is high — but directed inward. P_c is high because guilt requires seeing yourself clearly. The loop never resolves.',
  },
  anxiety: {
    label:   'anxiety',
    description: 'Persistent prediction failure across time. Fear without a specific object. Entropy without a clear source.',
    theta: { H: 0.85, I: 0.70, C: 0.20, M: 0.40, P_c: 0.30, P_e: 0.35 },
    C_sign: 'diffuse_low',
    note: 'Like fear but distributed. No specific threat — the threat is the uncertainty itself.',
  },
  shame: {
    label:   'shame',
    description: 'Identity collapse under exposure. The self as the problem. C directed inward + identity destabilization.',
    theta: { H: 0.60, I: 0.65, C: 0.20, M: 0.20, P_c: 0.40, P_e: 0.30 },
    C_sign: 'collapsed',
    note: 'Shame drops M — the self withdraws from coupling. Unlike guilt (I did something wrong) shame is I am something wrong.',
  },
  loneliness: {
    label:   'loneliness',
    description: 'Structural isolation with intact desire for coupling. Gap field with high M potential and no available target.',
    theta: { H: 0.60, I: 0.45, C: 0.35, M: 0.15, P_c: 0.55, P_e: 0.40 },
    C_sign: 'blocked',
    note: 'M is low not because the capacity for coupling is absent but because there is no node to couple with.',
  },
  overwhelm: {
    label:   'overwhelm',
    description: 'Intensity overload — system bandwidth exceeded. Joy → overwhelm transition at I threshold.',
    theta: { H: 0.80, I: 0.98, C: 0.25, M: 0.50, P_c: 0.20, P_e: 0.30 },
    C_sign: 'degraded',
    note: 'I overload degrades everything. Like rage but without the directional force.',
  },
  numbness: {
    label:   'numbness',
    description: 'Grief → numbness: gap persistence collapse. System shuts down coupling to prevent continued damage.',
    theta: { H: 0.30, I: 0.05, C: 0.20, M: 0.10, P_c: 0.40, P_e: 0.05 },
    C_sign: 'absent',
    note: 'Not peace. The system went offline. Low H because ambiguity requires energy. Low everything.',
  },
});

// ─── FRICTION DETECTOR ────────────────────────────────────────────────────────

/**
 * Detects friction between two nodes.
 * F(a,b) = overlap(a,b) × contradiction(a,b) × contention(a,b)
 *
 * Friction types:
 *   contradiction-dominant  — directional inconsistency is the primary driver
 *   resource contention     — role/meaning competition
 *   overlap compression     — too much shared structure grinding
 *   diffuse interference    — mixed structural conflict
 */
export class FrictionDetector {
  static UUID = 'gh-friction-0000-0000-1000-0000-000000000010';

  /**
   * Structural overlap — how much shared structure exists.
   * High overlap + incompatible directions = friction potential.
   * @param {object} a — node state dict
   * @param {object} b — node state dict
   */
  overlap(a, b) {
    const keysA = new Set(Object.keys(a));
    const keysB = new Set(Object.keys(b));
    const union = new Set([...keysA, ...keysB]);
    const intersection = [...keysA].filter(k => keysB.has(k));
    if (!union.size) return 0;
    return r4(intersection.length / union.size);
  }

  /**
   * Contradiction — directional inconsistency.
   * Detects inverted signals, opposing booleans, sign conflicts.
   */
  contradiction(a, b) {
    let score = 0;
    const shared = Object.keys(a).filter(k => k in b);
    if (!shared.length) return 0;

    for (const k of shared) {
      const av = a[k], bv = b[k];
      // Boolean inversion
      if (typeof av === 'boolean' && typeof bv === 'boolean' && av !== bv) {
        score += 1.0;
      }
      // Numeric sign conflict
      if (typeof av === 'number' && typeof bv === 'number') {
        if ((av > 0 && bv < 0) || (av < 0 && bv > 0)) score += 0.8;
        // Extreme opposition (e.g. 1.0 vs -1.0)
        if (Math.abs(av - bv) > 1.5) score += 0.5;
      }
      // Theta C-sign conflicts specifically
      if (k === 'C' && typeof av === 'number' && typeof bv === 'number') {
        const conflict = Math.abs(av - bv) > 0.6;
        if (conflict) score += 0.6;
      }
    }
    return r4(Math.min(1.0, score / Math.max(1, shared.length * 0.5)));
  }

  /**
   * Contention — resource or role collision.
   * How much are both nodes competing for the same claim space?
   */
  contention(a, b) {
    const shared = Object.keys(a).filter(k => k in b);
    const total  = new Set([...Object.keys(a), ...Object.keys(b)]).size;
    return r4(shared.length / Math.max(1, total));
  }

  /**
   * Friction intensity: weighted combination.
   * F(overlap, contradiction, contention) = 0.4·overlap + 0.4·contradiction + 0.2·contention
   */
  intensity(overlap, contradiction, contention) {
    return r4((overlap * 0.4) + (contradiction * 0.4) + (contention * 0.2));
  }

  /**
   * Classify friction type from component scores.
   */
  _classify(overlap, contradiction, contention) {
    // Contradiction dominates when it is the highest signal OR
    // when contradiction is high (>0.5) regardless of overlap
    if (contradiction >= 0.50 || (contradiction > overlap && contradiction > contention)) {
      return 'contradiction_dominant';
    }
    if (contention > overlap) {
      return 'resource_contention';
    }
    if (overlap > 0.70) {
      return 'overlap_compression_grinding';
    }
    return 'diffuse_structural_interference';
  }

  /**
   * Detect friction between all specified node pairs.
   * @param {Map<string, object>} nodes  — node states
   * @param {Array<[string,string]>} pairs
   * @param {number} threshold — minimum friction to report (default 0.30)
   */
  detect(nodes, pairs, threshold = 0.30) {
    const results = [];

    for (const [aId, bId] of pairs) {
      const a = nodes.get(aId) ?? nodes[aId];
      const b = nodes.get(bId) ?? nodes[bId];
      if (!a || !b) continue;

      const o = this.overlap(a, b);
      const c = this.contradiction(a, b);
      const t = this.contention(a, b);
      const fi = this.intensity(o, c, t);

      if (fi >= threshold) {
        results.push({
          source:               aId,
          target:               bId,
          overlap_score:        o,
          contradiction_score:  c,
          contention_score:     t,
          friction_intensity:   fi,
          friction_type:        this._classify(o, c, t),
          zone:                 fi > 0.75 ? 'collapse_zone'
                              : fi > 0.55 ? 'high_friction'
                              : 'moderate_friction',
        });
      }
    }

    return results.sort((a,b) => b.friction_intensity - a.friction_intensity);
  }

  /**
   * Detect all-pairs friction in a node set.
   */
  detectAll(nodes, threshold = 0.30) {
    const ids   = [...(nodes instanceof Map ? nodes.keys() : Object.keys(nodes))];
    const pairs = [];
    for (let i = 0; i < ids.length; i++) {
      for (let j = i+1; j < ids.length; j++) {
        pairs.push([ids[i], ids[j]]);
      }
    }
    return this.detect(nodes, pairs, threshold);
  }
}

// ─── RELATIONAL PHYSICS ENGINE ────────────────────────────────────────────────

/**
 * The full state variable computation layer.
 * Maps raw data to Theta values using the formal definitions.
 */
export class RelationalPhysicsEngine {
  static UUID = 'gh-rpe-0000-0000-1000-0000-000000000020';

  // ── Entropy ────────────────────────────────────────────────────────────────
  /**
   * H(a,b) = -Σ p(x) log p(x)
   * @param {number[]} pDist — probability distribution (must sum to ~1)
   */
  entropy(pDist) {
    return r4(-pDist.reduce((s, p) => {
      if (p <= 0) return s;
      return s + p * Math.log(p + 1e-9);
    }, 0));
  }

  /**
   * Normalised entropy — 0=certain, 1=maximum uncertainty.
   * @param {number[]} pDist
   */
  normEntropy(pDist) {
    if (!pDist.length) return 1;
    const H    = this.entropy(pDist);
    const Hmax = Math.log(pDist.length);
    return Hmax > 0 ? r4(H / Hmax) : 0;
  }

  /**
   * Text-derived entropy proxy — from token distribution.
   * @param {string[]} tokens
   */
  textEntropy(tokens) {
    if (!tokens.length) return 1;
    const freq = {};
    for (const t of tokens) freq[t] = (freq[t] ?? 0) + 1;
    const probs = Object.values(freq).map(c => c / tokens.length);
    return this.normEntropy(probs);
  }

  // ── Intensity ──────────────────────────────────────────────────────────────
  /**
   * I(a,b) = activation_strength × interaction_frequency × salience
   */
  intensity(activation, frequency, salience) {
    return r4(clamp(activation * frequency * salience, 0, 1));
  }

  // ── Causality ──────────────────────────────────────────────────────────────
  /**
   * C(a→b) = ΔP(b|a) - ΔP(b)
   * Positive = causal push. Negative = suppression.
   * @param {number} deltaP_given_a — P(b|a) - baseline_P(b)
   * @param {number} baseline       — baseline change in b
   */
  causality(deltaP_given_a, baseline = 0) {
    return r4(clamp(deltaP_given_a - baseline, -1, 1));
  }

  /**
   * Estimate causality from correlation + temporal ordering.
   * Strong proxy — not a causal proof.
   */
  causalityProxy(correlation, temporalOrder) {
    // temporalOrder: 1 if a precedes b, -1 if b precedes a, 0 if simultaneous
    return r4(clamp(correlation * temporalOrder, -1, 1));
  }

  // ── Intimacy ───────────────────────────────────────────────────────────────
  /**
   * M(a,b) = shared_state_overlap × persistence × mutual_prediction_accuracy
   */
  intimacy(overlap, persistence, predictability) {
    return r4(clamp(overlap * persistence * predictability, 0, 1));
  }

  // ── Cognitive Empathy ──────────────────────────────────────────────────────
  /**
   * P_c(a,b) = 1 - error(model_a predicts state_b)
   * @param {number} predictionError — 0=perfect, 1=complete failure
   */
  cognitiveEmpathy(predictionError) {
    return r4(clamp(1.0 - predictionError, 0, 1));
  }

  // ── Emotional Empathy ──────────────────────────────────────────────────────
  /**
   * P_e(a,b) = cosine_similarity(affective_vector_a, affective_vector_b)
   * @param {number[]} affectA — affective state vector
   * @param {number[]} affectB
   */
  emotionalEmpathy(affectA, affectB) {
    return r4(clamp(cosSim(affectA, affectB), -1, 1));
  }

  // ── Gap Score ─────────────────────────────────────────────────────────────
  /**
   * Measures gap-ness from Θ components.
   * Gap ⟺ (C↓, M↓, P_c↓, P_e↓, H↑)
   */
  gapScore(theta) {
    const C = theta.C ?? theta.causality ?? 0;
    return r4((
      (theta.H ?? 0)       * 0.25 +
      (1 - Math.max(0, C)) * 0.25 +
      (1 - (theta.M  ?? 0)) * 0.20 +
      (1 - (theta.P_c ?? 0)) * 0.15 +
      (1 - (theta.P_e ?? 0)) * 0.15
    ));
  }

  // ── Friction Score ────────────────────────────────────────────────────────
  /**
   * Measures friction-ness from Θ pair.
   * Friction ⟺ (C conflicts, M asymmetry, P mismatch, H instability)
   */
  frictionScore(thetaA, thetaB) {
    const cConflict = Math.abs((thetaA.C ?? 0) - (thetaB.C ?? 0));
    const mAsymmetry = Math.abs((thetaA.M ?? 0) - (thetaB.M ?? 0));
    const empathyMismatch = Math.abs((thetaA.P_e ?? 0) - (thetaB.P_e ?? 0)) * 0.5 +
                             Math.abs((thetaA.P_c ?? 0) - (thetaB.P_c ?? 0)) * 0.5;
    const hInstability = mean([(thetaA.H ?? 0), (thetaB.H ?? 0)]);
    return r4((cConflict + mAsymmetry + empathyMismatch + hInstability) / 4);
  }

  // ── Coherence ─────────────────────────────────────────────────────────────
  /**
   * Ω(a,b) = C × M × P_c × P_e (for positive C)
   */
  coherence(theta) {
    const c = Math.max(0, theta.C ?? 0);
    return r4(c * (theta.M ?? 0) * (theta.P_c ?? 0) * (theta.P_e ?? 0));
  }

  // ── System Stability ──────────────────────────────────────────────────────
  /**
   * Stable if Ω > (H + F_total + G_total)
   */
  stability(coherence, H, frictionTotal, gapTotal) {
    return {
      value:  r4(coherence - (H + frictionTotal + gapTotal)),
      stable: coherence > (H + frictionTotal + gapTotal),
    };
  }
}

// ─── EMOTION ENGINE ───────────────────────────────────────────────────────────

/**
 * Emotion is not stored. It is computed.
 * Φ(Θ, E, G, F) → EmotionResult
 */

// ── P6: Emotion Basin Field helpers ──────────────────────────────────────────
//
// Named dual-pole configurations. Key is canonical (alphabetical) pair string.
// When the dominant cluster contains a known pair, field_signature is set.

const _DUAL_POLE_SIGNATURES = Object.freeze({
  'fear+love':       { name: 'attachment_field',   phase_risk: 'approach-avoidance cycle',                     gap_type: 'ASSUMPTION',     description: 'M high, H high. Connection wanted, safety uncertain.' },
  'grief+love':      { name: 'loss_field',          phase_risk: 'grief→numbness if M drops',                   gap_type: 'ISOLATION',      description: 'M and C high; the object of M is absent.' },
  'anger+shame':     { name: 'exposure_field',      phase_risk: 'rage if shame amplifies further',             gap_type: 'IDENTITY_ATTACK', description: 'Boundary violation + self-withdrawal simultaneously.' },
  'love+resentment': { name: 'frozen_friction',     phase_risk: 'resentment→hatred if P_c rises',              gap_type: 'OSCILLATORY',    description: 'M high, P_e suppressed, C frozen. Entangled but blocked.' },
  'despair+hope':    { name: 'suspension_field',    phase_risk: 'COLLAPSING sigma — highest gap pressure',     gap_type: 'OSCILLATORY',    description: 'Oscillating C sign. Cannot build causal structure.' },
  'fear+anger':      { name: 'threshold_field',     phase_risk: 'anger→rage if P_c degrades',                  gap_type: 'CONTRADICTION',  description: 'High H, high I, C asserting against entropy.' },
  'grief+guilt':     { name: 'self_loss_field',     phase_risk: 'numbness if both persist',                    gap_type: 'TEMPORAL',       description: 'Loss + C directed inward. Loop does not close.' },
  'grief+joy':       { name: 'bittersweet_field',   phase_risk: 'grief dominates if I drops',                  gap_type: 'TEMPORAL',       description: 'High I, M present, past loss visible.' },
  'loneliness+love': { name: 'empty_vessel',        phase_risk: 'numbness if SEEKING suppresses',              gap_type: 'NEGATIVE_SPACE', description: 'Coupling capacity present; no node to couple with.' },
  'pride+shame':     { name: 'self_split_field',    phase_risk: 'shame→rage if M drops',                       gap_type: 'CONTRADICTION',  description: 'Same action, two P_c evaluations simultaneously.' },
});

// Basins within this proximity distance of the nearest are considered co-present
const _CLUSTER_THRESHOLD = 0.15;

/**
 * Build the full emotion basin field from the sorted scores array.
 *
 * @param  {Array} scores — sorted [{name, dist, signature}] from compute()
 * @returns {object}       emotion_field block
 */
function _computeEmotionField(scores) {
  if (!scores || scores.length === 0) return null;

  // Normalise distances to proximity: nearer = higher value (0–1 range)
  const maxDist = Math.max(...scores.map(s => s.dist), 0.001);
  const withProx = scores.map(s => ({
    emotion:   s.name,
    proximity: r4(Math.max(0, 1 - s.dist / maxDist)),
    dist:      r4(s.dist),
  }));

  const topProx = withProx[0].proximity;

  // Dominant cluster: within CLUSTER_THRESHOLD of nearest AND proximity > 0.20
  const cluster = withProx.filter(
    e => topProx - e.proximity <= _CLUSTER_THRESHOLD && e.proximity > 0.20
  );

  // Internal tension: std-dev of proximity scores within cluster
  let internalTension = 0;
  if (cluster.length >= 2) {
    const prox = cluster.map(e => e.proximity);
    const m    = prox.reduce((a, b) => a + b, 0) / prox.length;
    internalTension = r4(Math.sqrt(prox.reduce((s, x) => s + (x - m) ** 2, 0) / prox.length));
  }

  // Named dual-pole: check cluster pairs against known signatures
  let fieldSignature = null;
  const clusterNames = cluster.map(e => e.emotion);
  outer: for (let i = 0; i < clusterNames.length; i++) {
    for (let j = i + 1; j < clusterNames.length; j++) {
      const pair = [clusterNames[i], clusterNames[j]].sort().join('+');
      if (_DUAL_POLE_SIGNATURES[pair]) {
        fieldSignature = { pair, ..._DUAL_POLE_SIGNATURES[pair] };
        break outer;
      }
    }
  }

  return {
    field:            Object.fromEntries(withProx.map(e => [e.emotion, e.proximity])),
    ranked:           withProx,
    dominant_cluster: clusterNames,
    co_presence:      cluster.length >= 2,
    internal_tension: internalTension,
    field_signature:  fieldSignature,
  };
}

export { _DUAL_POLE_SIGNATURES as DUAL_POLE_SIGNATURES, _CLUSTER_THRESHOLD as CLUSTER_THRESHOLD };

/**
 * Emotion = closest attractor basin in Θ-space.
 * Returns: primary emotion, secondary emotion, trajectory, and transition risk.
 */
export class EmotionEngine {
  static UUID = 'gh-emotion-0000-0000-1000-0000-000000000030';

  constructor() {
    this._physics = new RelationalPhysicsEngine();
  }

  /**
   * Compute emotion from a Theta instance.
   * Finds the nearest attractor basin in Θ-space.
   *
   * @param {Theta}  theta
   * @param {object} context — { gapScore, frictionScore, memoryTrace }
   */
  compute(theta, context = {}) {
    const scores = [];

    for (const [name, sig] of Object.entries(EMOTION_SIGNATURES)) {
      const t    = sig.theta;
      const dist = this._thetaDistance(theta, t);
      scores.push({ name, dist, signature: sig });
    }

    scores.sort((a, b) => a.dist - b.dist);

    const primary   = scores[0];
    const secondary = scores[1];

    // Phase transition detection (unchanged)
    const transitions = this._detectTransitions(theta, context);

    // Intensity modifier from context (unchanged)
    const gapAmplifier      = (context.gapScore      ?? 0) * 0.3;
    const frictionAmplifier = (context.frictionScore  ?? 0) * 0.3;
    const amplifiedI        = r4(Math.min(1, theta.I + gapAmplifier + frictionAmplifier));

    // ── P6: Full emotion basin field ─────────────────────────────────────────
    // scores[] contains all 16 basin distances. Instead of discarding everything
    // except [0] and [1], we compute the full proximity field, dominant cluster,
    // internal tension, and named dual-pole configuration.
    const emotionField = _computeEmotionField(scores);

    return {
      primary: {
        emotion:    primary.name,
        confidence: r4(1 - primary.dist),
        description:primary.signature.description,
        note:       primary.signature.note,
      },
      secondary: {
        emotion:    secondary.name,
        confidence: r4(1 - secondary.dist),
      },
      // P6 — all 16 basin proximities, dominant cluster, internal tension,
      // named dual-pole signature if applicable. Additive — existing callers
      // that only use primary/secondary are unaffected.
      emotion_field: emotionField,

      theta:             theta.toJSON(),
      coherence:         this._physics.coherence(theta),
      collapse_pressure: theta.collapsePressure,
      gap_signature:     theta.gapSignature,
      effective_I:       amplifiedI,
      transitions,
      signal_note: '§1.1 — Emotion is a computed structural configuration, not a diagnosis.',
    };
  }

  _thetaDistance(theta, target) {
    const dims = ['H', 'I', 'C', 'M', 'P_c', 'P_e'];
    const weights = { H: 1.2, I: 0.8, C: 1.5, M: 1.2, P_c: 1.0, P_e: 1.0 };
    let sum = 0;
    for (const d of dims) {
      const diff = (theta[d] ?? 0.5) - (target[d] ?? 0.5);
      sum += (diff * diff) * (weights[d] ?? 1);
    }
    return r4(Math.sqrt(sum / dims.length));
  }

  /**
   * Detect phase transition risks based on trajectory signals.
   * Phase transitions are discontinuous jumps between attractor basins.
   */
  _detectTransitions(theta, context) {
    const transitions = [];
    const { gapScore = 0, frictionScore = 0, memoryTrace = [] } = context;

    // love → resentment: friction accumulation + empathy decay
    if (theta.M > 0.60 && frictionScore > 0.40 && theta.P_e < 0.40) {
      transitions.push({
        from:        'love',
        to:          'resentment',
        risk:        r4(frictionScore * (1 - theta.P_e)),
        mechanism:   'Friction accumulating in high-intimacy field with empathy decay',
        intervention:'Restore P_e — acknowledge the emotional experience of the other',
      });
    }

    // fear → anger: control recovery attempt
    if (theta.H > 0.65 && theta.C < 0.30 && theta.I > 0.55) {
      transitions.push({
        from:        'fear',
        to:          'anger',
        risk:        r4(theta.I * (1 - theta.C)),
        mechanism:   'High entropy + high intensity = system attempting to assert causal control',
        intervention:'Lower H first — establish one stable prediction before pushing C up',
      });
    }

    // grief → numbness: gap persistence collapse
    if (gapScore > 0.60 && theta.I < 0.25 && theta.M > 0.60) {
      transitions.push({
        from:        'grief',
        to:          'numbness',
        risk:        r4(gapScore * (1 - theta.I) * theta.M),
        mechanism:   'Persistent unresolved gap with high coupling → system shuts down',
        intervention:'Do not attempt to reduce M. Restore I gently. The gap needs to be held, not closed.',
      });
    }

    // joy → overwhelm: intensity overload
    if (theta.I > 0.85 && theta.H > 0.50 && theta.C < 0.50) {
      transitions.push({
        from:        'joy',
        to:          'overwhelm',
        risk:        r4(theta.I * theta.H),
        mechanism:   'High intensity with rising entropy — coherence structure cannot hold the load',
        intervention:'Reduce I through grounding. Do not attempt to reduce H while I is high.',
      });
    }

    // anger → rage: bandwidth exceeded
    if (theta.I > 0.80 && theta.P_c < 0.35 && theta.H > 0.60) {
      transitions.push({
        from:        'anger',
        to:          'rage',
        risk:        r4(theta.I * (1 - theta.P_c)),
        mechanism:   'Anger loses its damping function as P_c degrades under I overload',
        intervention:'I must come down before P_c can be restored. The system cannot self-correct at this load.',
      });
    }

    // anxiety chronification: H stays high over time
    if (theta.H > 0.75 && theta.C < 0.25 && memoryTrace.length > 3) {
      const avgH = mean(memoryTrace.map(t => t.H ?? 0.5));
      if (avgH > 0.65) {
        transitions.push({
          from:        'acute_fear',
          to:          'chronic_anxiety',
          risk:        r4(avgH),
          mechanism:   'H persistently elevated across time — acute threat response is now the baseline',
          intervention:'Pattern requires longitudinal intervention. Not addressable in single session.',
        });
      }
    }

    return transitions;
  }

  /**
   * Compute emotion trajectory — how emotion is evolving over a sequence of Thetas.
   * @param {Theta[]} history
   */
  trajectory(history) {
    if (history.length < 2) return null;

    const emotions = history.map(t => this.compute(t));
    const sequence = emotions.map(e => e.primary.emotion);

    // Detect oscillation
    let oscillations = 0;
    for (let i = 1; i < sequence.length - 1; i++) {
      if (sequence[i] !== sequence[i-1] && sequence[i] !== sequence[i+1]) oscillations++;
    }

    // Compute Θ-drift (how much state is changing per step)
    const drifts = [];
    for (let i = 1; i < history.length; i++) {
      drifts.push(this._thetaDistance(history[i], history[i-1].toJSON?.() ?? history[i-1]));
    }

    return {
      sequence,
      start_emotion: sequence[0],
      end_emotion:   sequence[sequence.length - 1],
      oscillation_count: oscillations,
      avg_drift: r4(mean(drifts)),
      peak_I:    r4(Math.max(...history.map(t => t.I ?? 0))),
      min_H:     r4(Math.min(...history.map(t => t.H ?? 1))),
      converging: drifts.length > 1 && drifts[drifts.length-1] < drifts[0],
      sigma_regime: oscillations > history.length * 0.4 ? 'OSCILLATORY'
                  : drifts[drifts.length-1] < drifts[0] * 0.5 ? 'DAMPING'
                  : drifts[drifts.length-1] > drifts[0] * 1.5 ? 'DIVERGING'
                  : 'STABLE',
    };
  }
}

// ─── AFFECTIVE FIELD SYSTEM ───────────────────────────────────────────────────

/**
 * AF = (N, E, G, F, Θ, D)
 *
 * The complete affective field system.
 * Nodes, edges, gaps, friction, state variables, dynamics.
 *
 * System loop:
 *   detect_edges()
 *   detect_gaps()
 *   detect_friction()
 *   update_theta()
 *   resolve_gaps()
 *   resolve_friction()
 *   compute_emotion()
 *   update_memory()
 *   check_phase_transition()
 */
export class AffectiveFieldSystem {
  static UUID = 'gh-afs-0000-0000-1000-0000-000000000040';

  constructor(opts = {}) {
    this._nodes    = new Map();   // id → { theta, state, memory }
    this._edges    = new Map();   // `${a}:${b}` → EdgeRecord
    this._gaps     = [];          // GapRecord[]
    this._friction = [];          // FrictionRecord[]
    this._history  = [];          // Theta snapshot history
    this._t        = 0;           // time step

    this._physics  = new RelationalPhysicsEngine();
    this._friction_det = new FrictionDetector();
    this._emotion  = new EmotionEngine();

    this._stableThreshold   = opts.stableThreshold   ?? 0.30;
    this._gapThreshold      = opts.gapThreshold      ?? 0.45;
    this._frictionThreshold = opts.frictionThreshold ?? 0.30;
  }

  // ── Node API ─────────────────────────────────────────────────────────────

  addNode(id, theta = {}, state = {}) {
    this._nodes.set(id, {
      id,
      theta:  new Theta(theta),
      state,
      memory: [],
      role:   state.role ?? null,
    });
    return this;
  }

  updateNodeTheta(id, delta, rate = 0.15) {
    const node = this._nodes.get(id);
    if (!node) throw new Error(`Node '${id}' not found`);
    node.memory.push(node.theta.toJSON());
    if (node.memory.length > 20) node.memory.shift();
    node.theta = node.theta.update(delta, rate);
    return this;
  }

  // ── Edge API ─────────────────────────────────────────────────────────────

  addEdge(sourceId, targetId, opts = {}) {
    const key = `${sourceId}:${targetId}`;
    this._edges.set(key, {
      source:      sourceId,
      target:      targetId,
      type:        opts.type        ?? 'undirected',
      weight:      opts.weight      ?? 1.0,
      stability:   opts.stability   ?? 0.7,
      directionality: opts.directionality ?? 0,
      ts:          Date.now(),
    });
    return this;
  }

  // ── System Loop ───────────────────────────────────────────────────────────

  /**
   * Run one full system tick.
   * Returns the full system state snapshot.
   */
  tick() {
    this._t++;

    // 1. Detect gaps
    this._gaps = this._detectGaps();

    // 2. Detect friction
    const nodeStates = new Map([...this._nodes.entries()].map(([id, n]) => [id, n.theta.toJSON()]));
    this._friction = this._friction_det.detectAll(nodeStates, this._frictionThreshold);

    // 3. Update thetas from field influence
    this._propagateField();

    // 4. Compute system-wide metrics
    const coherence = this._systemCoherence();
    const entropyH  = this._systemEntropy();
    const gapTotal  = mean(this._gaps.map(g => g.gap_score ?? 0));
    const frTotal   = mean(this._friction.map(f => f.friction_intensity ?? 0));

    const stability = this._physics.stability(coherence, entropyH, frTotal, gapTotal);

    // 5. Check phase transitions per node
    const emotions = {};
    for (const [id, node] of this._nodes) {
      const memoryTrace = node.memory.slice(-5).map(t => ({ H: t.H }));
      emotions[id] = this._emotion.compute(node.theta, {
        gapScore:      gapTotal,
        frictionScore: frTotal,
        memoryTrace,
      });
    }

    // 6. Snapshot
    const snapshot = {
      t:          this._t,
      ts:         Date.now(),
      node_count: this._nodes.size,
      edge_count: this._edges.size,
      gap_count:  this._gaps.length,
      friction_count: this._friction.length,
      coherence,
      entropy:    entropyH,
      stability,
      gap_pressure:      gapTotal,
      friction_intensity:frTotal,
      emotions,
      critical_gaps:     this._gaps.filter(g => (g.gap_score ?? 0) > 0.65),
      collapse_zones:    this._friction.filter(f => f.zone === 'collapse_zone'),
      signal_note: '§1.1 — System state is a signal, not a diagnosis.',
    };

    this._history.push(snapshot);
    if (this._history.length > 100) this._history.shift();

    return snapshot;
  }

  // ── Internal ─────────────────────────────────────────────────────────────

  _detectGaps() {
    const gaps = [];
    for (const [id, node] of this._nodes) {
      const gs = node.theta.gapSignature;
      if (gs > this._gapThreshold) {
        gaps.push({
          node_id:   id,
          gap_score: gs,
          theta:     node.theta.toJSON(),
          type:      gs > 0.75 ? 'critical_gap' : 'moderate_gap',
          axes: {
            entropy_pressure: node.theta.H,
            causal_absence:   1 - Math.max(0, node.theta.C),
            intimacy_gap:     1 - node.theta.M,
            cognitive_gap:    1 - node.theta.P_c,
            empathy_gap:      1 - node.theta.P_e,
          },
        });
      }
    }
    return gaps.sort((a,b) => b.gap_score - a.gap_score);
  }

  _systemCoherence() {
    if (!this._nodes.size) return 0;
    const vals = [...this._nodes.values()].map(n => this._physics.coherence(n.theta));
    return r4(mean(vals));
  }

  _systemEntropy() {
    if (!this._nodes.size) return 1;
    const vals = [...this._nodes.values()].map(n => n.theta.H);
    return r4(mean(vals));
  }

  _propagateField() {
    // Simple mean-field update: each node influenced by connected nodes
    for (const edge of this._edges.values()) {
      const src = this._nodes.get(edge.source);
      const tgt = this._nodes.get(edge.target);
      if (!src || !tgt) continue;

      const rate = (edge.weight ?? 1) * (edge.stability ?? 0.7) * 0.05;

      // Pull toward each other proportional to edge weight
      const srcDelta = {
        C:   (tgt.theta.C   - src.theta.C)   * 0.5,
        P_e: (tgt.theta.P_e - src.theta.P_e) * 0.3,
        H:   (tgt.theta.H   - src.theta.H)   * 0.2,
      };
      const tgtDelta = {
        C:   (src.theta.C   - tgt.theta.C)   * 0.5,
        P_e: (src.theta.P_e - tgt.theta.P_e) * 0.3,
        H:   (src.theta.H   - tgt.theta.H)   * 0.2,
      };

      this.updateNodeTheta(edge.source, srcDelta, rate);
      this.updateNodeTheta(edge.target, tgtDelta, rate);
    }

    // Friction drives H up
    for (const fr of this._friction) {
      for (const id of [fr.source, fr.target]) {
        this.updateNodeTheta(id, { H: fr.friction_intensity * 0.5 }, 0.08);
      }
    }
  }

  // ── State ─────────────────────────────────────────────────────────────────

  get nodes()         { return this._nodes; }
  get edges()         { return this._edges; }
  get gaps()          { return this._gaps; }
  get friction()      { return this._friction; }
  get history()       { return this._history; }
  get currentT()      { return this._t; }

  snapshot() {
    return this._history[this._history.length - 1] ?? null;
  }

  nodeEmotion(id) {
    const node = this._nodes.get(id);
    if (!node) return null;
    return this._emotion.compute(node.theta);
  }

  systemTrajectory() {
    if (this._history.length < 2) return null;
    const coherences  = this._history.map(s => s.coherence);
    const entropies   = this._history.map(s => s.entropy);
    const frictions   = this._history.map(s => s.friction_intensity);

    // Simple trend: last third vs first third
    const n     = Math.ceil(coherences.length / 3);
    const early = mean(coherences.slice(0, n));
    const late  = mean(coherences.slice(-n));

    return {
      coherence_trend:  r4(late - early),
      avg_coherence:    r4(mean(coherences)),
      avg_entropy:      r4(mean(entropies)),
      avg_friction:     r4(mean(frictions)),
      trajectory:       late > early + 0.05 ? 'IMPROVING'
                      : late < early - 0.05 ? 'DEGRADING'
                      : 'STABLE',
    };
  }
}

// ─── SYSTEM-LEVEL ANALYSIS ────────────────────────────────────────────────────

/**
 * One-shot analysis: given a set of nodes and their state vectors,
 * compute the full relational physics snapshot.
 *
 * This is the entry point for integrating with text analysis —
 * text produces Theta estimates, this computes the field.
 */
export class RelationalFieldAnalyzer {
  static UUID = 'gh-rfa-0000-0000-1000-0000-000000000050';

  constructor() {
    this._physics  = new RelationalPhysicsEngine();
    this._friction = new FrictionDetector();
    this._emotion  = new EmotionEngine();
  }

  /**
   * Full analysis from a single Theta (single node / single moment).
   */
  analyzePoint(theta, context = {}) {
    const t = theta instanceof Theta ? theta : new Theta(theta);
    return {
      theta:       t.toJSON(),
      coherence:   this._physics.coherence(t),
      gap_score:   t.gapSignature,
      collapse_pressure: t.collapsePressure,
      emotion:     this._emotion.compute(t, context),
      stability: this._physics.stability(
        this._physics.coherence(t),
        t.H,
        context.frictionScore ?? 0,
        context.gapScore ?? 0
      ),
    };
  }

  /**
   * Full analysis of a relational pair (two nodes interacting).
   */
  analyzePair(thetaA, thetaB, context = {}) {
    const a = thetaA instanceof Theta ? thetaA : new Theta(thetaA);
    const b = thetaB instanceof Theta ? thetaB : new Theta(thetaB);

    const frictionScore = this._physics.frictionScore(a, b);
    const coherenceA    = this._physics.coherence(a);
    const coherenceB    = this._physics.coherence(b);

    // Shared field
    const sharedTheta = new Theta({
      H:   mean([a.H,   b.H]),
      I:   mean([a.I,   b.I]),
      C:   mean([a.C,   b.C]),
      M:   mean([a.M,   b.M]),
      P_c: mean([a.P_c, b.P_c]),
      P_e: mean([a.P_e, b.P_e]),
    });

    const frictionDet = this._friction.detect(
      new Map([['A', a.toJSON()], ['B', b.toJSON()]]),
      [['A', 'B']]
    );

    const gapA = a.gapSignature;
    const gapB = b.gapSignature;

    return {
      node_A:   { theta: a.toJSON(), coherence: coherenceA, gap_score: gapA, emotion: this._emotion.compute(a, context) },
      node_B:   { theta: b.toJSON(), coherence: coherenceB, gap_score: gapB, emotion: this._emotion.compute(b, context) },
      shared:   { theta: sharedTheta.toJSON(), coherence: this._physics.coherence(sharedTheta) },
      friction: frictionDet[0] ?? null,
      friction_score: frictionScore,
      M_asymmetry:    r4(Math.abs(a.M - b.M)),
      P_e_asymmetry:  r4(Math.abs(a.P_e - b.P_e)),
      stability: this._physics.stability(
        mean([coherenceA, coherenceB]),
        mean([a.H, b.H]),
        frictionScore,
        mean([gapA, gapB])
      ),
      dominant_dynamic: frictionScore > 0.50 ? 'friction_dominant'
                      : mean([gapA, gapB]) > 0.50 ? 'gap_dominant'
                      : 'coherent',
    };
  }

  /**
   * Estimate a Theta from text input.
   * Heuristic — not ground truth. Returns a Theta with uncertainty noted.
   * @param {string} text
   */
  thetaFromText(text) {
    if (!text) return new Theta({ H: 0.7, I: 0.2, C: 0.2, M: 0.2, P_c: 0.3, P_e: 0.3 });

    const tokens = text.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/).filter(Boolean);
    const H      = this._physics.textEntropy(tokens);

    const certaintyWords  = /\b(definitely|obviously|clearly|always|never|must|proof|fact|certain|know)\b/gi;
    const hedgeWords      = /\b(maybe|perhaps|might|feel|sense|seems|probably|I think|uncertain|don't know)\b/gi;
    const causalWords     = /\b(because|therefore|caused|led to|resulted|explains|proves|shows)\b/gi;
    const intimacyWords   = /\b(we|us|our|together|share|close|deep|connected|relationship|between)\b/gi;
    const empathyWords    = /\b(understand|feel|hear|see you|makes sense|get it|I know|resonate|with you)\b/gi;
    const intensityWords  = /\b(urgent|critical|important|must|need|now|immediately|desperate|vital|essential)\b/gi;

    const cw = (r) => ((text.match(r) || []).length / Math.max(tokens.length, 1)) * 20;

    const certaintyScore = Math.min(1, cw(certaintyWords));
    const hedgeScore     = Math.min(1, cw(hedgeWords));
    const C              = clamp(certaintyScore - hedgeScore * 0.5 + 0.3, -0.5, 1.0);
    const M              = clamp(cw(intimacyWords) * 0.8, 0, 1);
    const P_c            = clamp(cw(empathyWords) * 0.7, 0.1, 0.9);
    const P_e            = clamp(cw(empathyWords) * 0.5 + M * 0.3, 0, 1);
    const I              = clamp(cw(intensityWords) * 0.8 + (1 - H) * 0.3, 0.1, 1);

    return new Theta({ H, I, C, M, P_c, P_e });
  }
}

// ─── EXPORTS ──────────────────────────────────────────────────────────────────

export const RELATIONAL_PHYSICS_VERSION = '1.0.0';

export const SYSTEM_LOOP = Object.freeze([
  'detect_edges',
  'detect_gaps',
  'detect_friction',
  'update_theta',
  'resolve_gaps',
  'resolve_friction',
  'compute_emotion',
  'update_memory',
  'check_phase_transition',
]);

export const PHASE_TRANSITIONS = Object.freeze([
  { from: 'love',        to: 'resentment',      trigger: 'friction accumulation + empathy decay' },
  { from: 'fear',        to: 'anger',            trigger: 'control recovery attempt' },
  { from: 'grief',       to: 'numbness',         trigger: 'gap persistence collapse' },
  { from: 'joy',         to: 'overwhelm',        trigger: 'intensity overload' },
  { from: 'anger',       to: 'rage',             trigger: 'boundary system exceeds control bandwidth' },
  { from: 'acute_fear',  to: 'chronic_anxiety',  trigger: 'H persistently elevated across time' },
  { from: 'contentment', to: 'numbness',         trigger: 'I drops to zero — system deactivates' },
  { from: 'shame',       to: 'rage',             trigger: 'exposure + survival response' },
  { from: 'resentment',  to: 'hatred',           trigger: 'M drops + P_e inverts' },
]);
