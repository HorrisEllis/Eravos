/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  LATTICE DIMENSIONS  ·  dimensions.js  ·  v0.4.0                        ║
 * ║  UUID: eravos-lattice-dimensions-0001-0000-000000000001                 ║
 * ║  HOOK: eravos.lattice:dimensions:00001                                  ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * A Dimension is a CONTRACT (§5.10), not a function that happens to return a
 * number. Each declares: what it extracts, how it compares two extractions,
 * the threshold above which an edge exists, what an edge MEANS, and how it
 * fails. Nothing is implicit.
 *
 * §13.2 — every edge is named, typed, with declared failure modes.
 * §5.14 — every layer replaceable: swap any dimension for another satisfying
 *         this shape and the lattice does not change.
 *
 * WHY SIX AND NOT ONE. The shipping lattice had one axis (word frequency)
 * and no edges. Measured on the Emergence chain variant: 60 nodes, 59 edges,
 * 39 of them weight 1.0 with no relation to content. One axis cannot tell
 * "the same words" from "the same need" from "the same feeling." The
 * DISAGREEMENT between axes is where the signal is — see multi-lattice.js.
 */

'use strict';

export const DIMENSIONS_VERSION = '0.4.0';
export const DIMENSIONS_UUID    = 'eravos-lattice-dimensions-0001-0000-000000000001';

// ── shared metrics ─────────────────────────────────────────────────────────

export function jaccard(a, b) {
  if (!a || !b || !a.size || !b.size) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

export function cosine(a, b) {
  if (!a || !b || a.length !== b.length || !a.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

const STOPWORDS = new Set([
  'the','and','for','that','this','with','from','have','been','were','they','their',
  'there','what','when','which','will','would','could','should','about','into','than',
  'then','your','more','also','some','just','like','over','such','these','those','very',
  'here','each','both','only','after','before','other','first','well','out','its','our',
  'all','any','who','how','but','not','are','was','can','does','did','has','had','him',
  'her','his','she','too','get','got','let','may','nor','off','per','set','via','yet',
]);

// ── the six ────────────────────────────────────────────────────────────────

export const DIMENSIONS = Object.freeze({

  /**
   * LEXICAL — PORT of AssociationEngine's content-word rule,
   * NEXUS-CODEC v1.9.0 codec.js:369-455. Same >=4 char rule, same stopwords,
   * same Jaccard.
   */
  lexical: {
    id: 'lexical',
    label: 'Words',
    source: 'codec.js AssociationEngine',
    threshold: 0.15,
    means: 'the same language came back',
    failsWhen: 'same meaning in different words — no embedding model here, stated not hidden',
    extract(u) {
      const words = String(u.text || '').toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/).filter(Boolean);
      return new Set(words.filter(w => w.length >= 4 && !STOPWORDS.has(w)));
    },
    similarity: jaccard,
    describe(a, b) { return [...a].filter(w => b.has(w)).slice(0, 8); },
  },

  /**
   * SIGNAL — 15 continuous axes from the ported Resonance heuristics.
   * KNOWN LIMIT, tested and locked: single short lines saturate. The
   * threshold is high (0.85) because cosine over 15 mostly-positive axes
   * runs high by construction; below that is genuine divergence.
   */
  signal: {
    id: 'signal',
    label: 'Shape',
    source: 'Resonance heuristics.ts, ported',
    threshold: 0.85,
    means: 'the shape of the expression matched',
    failsWhen: 'short single lines saturate the axes — window utterances where possible',
    extract(u) { return u.dims && u.dims.signalVector ? u.dims.signalVector : null; },
    similarity: cosine,
    describe() { return []; },
  },

  /**
   * NEEDS — NVC needs from htl.js NeedsIntentModule (Rosenberg).
   * §1.1: signal, not diagnosis.
   */
  needs: {
    id: 'needs',
    label: 'Needs',
    source: 'htl.js NEED-04 · Rosenberg NVC',
    threshold: 0.30,
    means: 'the same underlying need was live',
    failsWhen: 'needs are lexicon-gated + emotion-gated; a need expressed in unusual language is missed',
    extract(u) {
      const n = u.dims && u.dims.need;
      return new Set([...(n && n.active || []), ...((n && n.unmet || []).map(x => 'unmet:' + x))]);
    },
    similarity: jaccard,
    describe(a, b) { return [...a].filter(x => b.has(x)); },
  },

  /**
   * INTENT — categorical. Two moments either were the same relational move
   * or they were not; there is no 0.6 of an intent.
   */
  intent: {
    id: 'intent',
    label: 'Intent',
    source: 'htl.js NEED-04',
    threshold: 1.0,
    means: 'the same relational move was being made',
    failsWhen: 'intent is polyvagal-gated — a pinned nervous-system state pins intent (proven)',
    extract(u) { return (u.dims && u.dims.need && u.dims.need.intent) || null; },
    similarity(a, b) { return a && b && a === b ? 1 : 0; },
    describe(a) { return a ? [a] : []; },
  },

  /**
   * AFFECT — 5D latent state. §1.2: dimensions whose uncertainty is still at
   * the 0.5 initial value were NEVER OBSERVED and are gated OUT of the
   * comparison rather than scored as measured-zero. This is the exact bug
   * class found in NervousSystemModule and deliberately not repeated.
   */
  affect: {
    id: 'affect',
    label: 'Feeling',
    source: 'latent-model.js · Kalman fusion',
    threshold: 0.75,
    means: 'the utterance MOVED the field in the same direction and degree',
    failsWhen: 'an utterance that moves nothing abstains — no delta, no edge, never a false match',
    extract(u) {
      // The DELTA this utterance produced, not the smoothed absolute state.
      // Two snapshots of a Kalman filter are near-identical by construction --
      // measured 0.93-0.96 between unrelated lines, which is the flat
      // lattice's failure reproduced. The delta characterises the utterance.
      const d = u.dims && u.dims.latentDelta;
      if (!d) return null;
      const mag = Math.abs(d.valence) + Math.abs(d.arousal) + Math.abs(d.suppression)
                + Math.abs(d.coherence) + Math.abs(d.engagement);
      if (mag < 0.02) return null;   // this utterance moved nothing: abstain
      return d;
    },
    similarity(a, b) {
      if (!a || !b) return 0;
      const keys = ['valence', 'arousal', 'suppression', 'coherence', 'engagement'];
      let sum = 0, n = 0;
      for (let i = 0; i < keys.length; i++) {
        // gate: both sides must have actually measured this dimension (§1.2 --
        // uncertainty still at the 0.5 initial value means NEVER OBSERVED, and
        // must not be scored as measured-zero)
        const ua = a.uncertainty ? a.uncertainty[i] : 0;
        const ub = b.uncertainty ? b.uncertainty[i] : 0;
        if (ua >= 0.45 || ub >= 0.45) continue;
        const d = (a[keys[i]] ?? 0) - (b[keys[i]] ?? 0);
        sum += d * d; n++;
      }
      if (n === 0) return 0;                       // nothing measured on both sides
      // deltas are small; scale so a matching direction of movement scores high
      return Math.max(0, 1 - Math.sqrt(sum / n) * 6);
    },
    describe(a, b) {
      if (!a || !b) return [];
      const keys = ['valence', 'arousal', 'suppression', 'coherence', 'engagement'];
      return keys.filter((k, i) => (a.uncertainty ? a.uncertainty[i] : 0.5) < 0.45
                                && (b.uncertainty ? b.uncertainty[i] : 0.5) < 0.45);
    },
  },

  /**
   * PROSODY — voice only. jitter/shimmer/HNR + prosodic tag.
   * Abstains entirely when either side is text-only, rather than pretending
   * silence is a stable voice (§1.2, the abstention bug fixed in prosody.js).
   */
  prosody: {
    id: 'prosody',
    label: 'Voice',
    source: 'rheon-voice v7 pitchEngine, ported',
    threshold: 0.70,
    means: 'the voice carried it the same way',
    failsWhen: 'text-only utterances abstain — no reading, no edge, never a fabricated match',
    extract(u) {
      const p = u.dims && u.dims.prosody;
      return (p && p.sufficient) ? p : null;
    },
    similarity(a, b) {
      if (!a || !b) return 0;
      if (a.prosodyTag !== b.prosodyTag) return 0.3;  // different vocal register
      const dj = Math.abs(a.jitter - b.jitter);
      const ds = Math.abs(a.shimmer - b.shimmer);
      const dh = Math.abs(a.hnr - b.hnr);
      return Math.max(0, 1 - (dj * 4 + ds * 2 + dh));
    },
    describe(a, b) { return a && b && a.prosodyTag === b.prosodyTag ? [a.prosodyTag] : []; },
  },

  /**
   * GRAMMAR — shared vocabulary, from shared/eravos-grammar.js.
   *
   * Deliberately NOT folded into `lexical`. Two moments using the same
   * SHARED word are related differently from two using the same ordinary
   * word — that is the whole point of a private vocabulary. Averaging them
   * into one lexical score destroys the distinction.
   *
   * Only `shared` terms count. A proposed term is one person's idea and has
   * no business linking two moments as though it were mutual (§1.2).
   *
   * Abstains when either side carries no shared term — no fabricated match.
   */
  grammar: {
    id: 'grammar',
    label: 'Shared words',
    source: 'shared/eravos-grammar.js · manual, never inferred',
    threshold: 0.20,
    means: 'the same shared word was live in both',
    failsWhen: 'the vocabulary is empty or nothing was taken up yet — abstains rather than guessing',
    extract(u) {
      const t = u.dims && u.dims.grammarTerms;
      return (t && t.length) ? new Set(t) : null;
    },
    similarity: jaccard,
    describe(a, b) { return [...a].filter(x => b.has(x)); },
  },

  /**
   * FIELD — Emergence's relational field. The ninth, and different in kind
   * from the other eight.
   *
   * Every other dimension compares two MOMENTS. This one compares the STATE
   * THE RELATIONSHIP WAS IN when each was said: trajectory, decay score,
   * rupture severity, meaning charge. Two moments can share no words, no
   * need, no intent and no feeling-movement, and still belong together
   * because the field was in the same place both times — which is exactly
   * what none of the other eight can see.
   *
   * ABSTAINS WHEN EMERGENCE IS NOT ATTACHED. Same discipline as prosody with
   * no mic: no reading, no edge, never a fabricated match. Eravos runs
   * completely without it and this dimension simply reports silent (§12.5 —
   * a dead dimension is information, not something to hide).
   *
   * `trajectory` is categorical and dominates: two moments in DECAYING and
   * REPAIRING are not in the same field however close their numbers look, so
   * a trajectory mismatch caps the score rather than being averaged away.
   */
  field: {
    id: 'field',
    label: 'The field',
    source: 'emergence relational.js — attached, not vendored',
    threshold: 0.70,
    means: 'the relationship was in the same state both times',
    failsWhen: 'Emergence is not attached — abstains entirely rather than guessing at a field it cannot see',
    extract(u) {
      const f = u.dims && u.dims.field;
      if (!f || typeof f.decay_score !== 'number') return null;
      return f;
    },
    similarity(a, b) {
      if (!a || !b) return 0;
      // A trajectory mismatch is not a small difference. DECAYING and
      // REPAIRING are opposite motions; averaging them into a distance would
      // let two contradictory states read as similar because their decay
      // scores happened to match.
      if (a.trajectory && b.trajectory && a.trajectory !== b.trajectory) return 0.25;
      const keys = ['decay_score', 'rupture_severity', 'meaning_charge'];
      let sum = 0, n = 0;
      for (const k of keys) {
        if (typeof a[k] !== 'number' || typeof b[k] !== 'number') continue;
        const d = a[k] - b[k];
        sum += d * d; n++;
      }
      if (n === 0) return a.trajectory && a.trajectory === b.trajectory ? 0.75 : 0;
      return Math.max(0, 1 - Math.sqrt(sum / n));
    },
    describe(a, b) {
      const out = [];
      if (a.trajectory && a.trajectory === b.trajectory) out.push(a.trajectory);
      if (typeof a.rupture_severity === 'number' && typeof b.rupture_severity === 'number' &&
          Math.abs(a.rupture_severity - b.rupture_severity) < 0.15) out.push('same rupture load');
      return out;
    },
  },

  /**
   * TEMPORAL — §3.2, eventTs is the ordering axis. Wall clock is display
   * metadata only. Decays over a stated window, tunable, not a discovered
   * constant.
   */
  temporal: {
    id: 'temporal',
    label: 'Time',
    source: '§3.2 eventTs',
    threshold: 0.20,
    windowMs: 10 * 60 * 1000,   // stated default: 10 minutes
    means: 'close enough in time to be one movement',
    failsWhen: 'a long pause inside one real conversation reads as separation',
    extract(u) { return u.ts || 0; },
    similarity(a, b) {
      if (!a || !b) return 0;
      const dt = Math.abs(a - b);
      return Math.exp(-dt / DIMENSIONS.temporal.windowMs);
    },
    describe(a, b) {
      const s = Math.round(Math.abs(a - b) / 1000);
      return [s < 60 ? `${s}s apart` : `${Math.round(s / 60)}m apart`];
    },
  },
});

export const DIMENSION_IDS = Object.freeze(Object.keys(DIMENSIONS));
