/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  LIMINAL CORE  ·  core/index.js  ·  v1.0.0                            ║
 * ║  UUID: lim-core-0000-0000-1000-0000-000000000001                      ║
 * ║                                                                        ║
 * ║  Shared taxonomy, gap field model, and utilities.                     ║
 * ║  All modules import from here. Nothing else is shared.               ║
 * ║                                                                        ║
 * ║  §C1  No module imports from another module. Only from core.          ║
 * ║  §C2  All outputs are signals. Not diagnoses.                         ║
 * ║  §C3  The recursion is not a bug. It is the engine.                   ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */

'use strict';

// ── Gap Types ─────────────────────────────────────────────────────────────────

export const GAP_TYPE = Object.freeze({
  LOGICAL:            'logical',
  EVIDENTIAL:         'evidential',
  TEMPORAL:           'temporal',
  DEFINITIONAL:       'definitional',
  REFERENCE:          'reference',
  OBLIGATION:         'obligation',
  ASSUMPTION:         'assumption',
  CONTRADICTION:      'contradiction',
  IDENTITY_ATTACK:    'identity_attack',
  CONSENT:            'consent',
  BOUNDARY:           'boundary',
  HIERARCHY:          'hierarchy',
  COERCION:           'coercion',
  ISOLATION:          'isolation',
  OSCILLATORY:        'oscillatory',
  CONDITION:          'condition',
});

export const GAP_TYPE_CRITICALITY = Object.freeze({
  [GAP_TYPE.ASSUMPTION]:       1.00,
  [GAP_TYPE.IDENTITY_ATTACK]:  1.00,
  [GAP_TYPE.COERCION]:         1.00,
  [GAP_TYPE.ISOLATION]:        0.95,
  [GAP_TYPE.CONTRADICTION]:    0.80,
  [GAP_TYPE.OSCILLATORY]:      0.85,
  [GAP_TYPE.TEMPORAL]:         0.75,
  [GAP_TYPE.LOGICAL]:          0.70,
  [GAP_TYPE.EVIDENTIAL]:       0.65,
  [GAP_TYPE.DEFINITIONAL]:     0.60,
  [GAP_TYPE.OBLIGATION]:       0.55,
  [GAP_TYPE.REFERENCE]:        0.50,
  [GAP_TYPE.CONDITION]:        0.70,
  [GAP_TYPE.CONSENT]:          0.80,
  [GAP_TYPE.BOUNDARY]:         0.65,
  [GAP_TYPE.HIERARCHY]:        0.70,
});

// ── Nine Reasons Gaps Exist ───────────────────────────────────────────────────
// Every gap exists for one or more of these.
// This is the meta-taxonomy of gap causation.

export const GAP_REASON = Object.freeze({
  COMPRESSION:          'compression',
  AVOIDANCE:            'avoidance',
  COMPATIBILITY:        'compatibility',
  ATTENTION:            'attention',
  EMOTIONAL_OCCLUSION:  'emotional_occlusion',
  NARRATIVE_SOOTHING:   'narrative_soothing',
  IDENTITY_REFLECTION:  'identity_reflection',
  DEFERRED_VARIABLE:    'deferred_variable',
  STRUCTURAL_LIMIT:     'structural_limit',
});

export const GAP_REASON_DESCRIPTION = Object.freeze({
  [GAP_REASON.COMPRESSION]:
    'Information density exceeds bandwidth — gaps form where content is compressed. The gap is the artefact of the compression algorithm.',
  [GAP_REASON.AVOIDANCE]:
    'The content is too threatening to hold consciously. Gaps are purposeful. The shape of the absence tells you what was avoided.',
  [GAP_REASON.COMPATIBILITY]:
    'Two systems that cannot fully interoperate. The gap lives at the interface — where one coordinate system meets another and the translation fails.',
  [GAP_REASON.ATTENTION]:
    'Finite attention cannot cover everything. The most important gaps are in the blind spot created by what was attended to.',
  [GAP_REASON.EMOTIONAL_OCCLUSION]:
    'Strong emotion casts a blind spot. The gap is invisible because of the emotion. Some truths can only be seen from a regulated state.',
  [GAP_REASON.NARRATIVE_SOOTHING]:
    'The story needs the gap to hold together. Closing it would require updating the narrative. It is protected by what it holds up.',
  [GAP_REASON.IDENTITY_REFLECTION]:
    'The gap protects an identity. What is missing would require updating who you are. The resistance is proportional to what the identity costs.',
  [GAP_REASON.DEFERRED_VARIABLE]:
    'The variable exists. It is known to exist. It is not processed yet — a structural deferral. You can name what is deferred.',
  [GAP_REASON.STRUCTURAL_LIMIT]:
    'The system cannot represent the content. A hard limit — not avoidance, not compression. The map cannot contain the territory at this resolution.',
});

// ── Domain Registry ───────────────────────────────────────────────────────────

export const DOMAIN = Object.freeze({
  EPISTEMOLOGICAL:    'epistemological',
  LOGIC:              'logic',
  POLITICAL:          'political',
  LEGAL:              'legal',
  RESEARCH:           'research',
  STATISTICS:         'statistics',
  CODE:               'code',
  SOFTWARE_ARCH:      'software_arch',
  AI_ML:              'ai_ml',
  SECURITY:           'security',
  QA:                 'qa',
  API_DESIGN:         'api_design',
  DATABASE:           'database',
  LANG_JS:            'lang_javascript',
  LANG_TS:            'lang_typescript',
  LANG_PYTHON:        'lang_python',
  LANG_SQL:           'lang_sql',
  LANG_GENERIC:       'lang_generic',
  INTERPERSONAL:      'interpersonal',
  PSYCHOLOGICAL:      'psychological',
  COMMUNICATION:      'communication',
  ABUSE_MANIPULATION: 'abuse_manipulation',
  RELATIONAL:         'relational',
  NARRATIVE:          'narrative',
  MUSIC:              'music',
  HARMONY:            'harmony',
  RHYTHM:             'rhythm',
  LYRICS:             'lyrics',
  SONGWRITING:        'songwriting',
  BUSINESS:           'business',
  FINANCE:            'finance',
  IDENTITY:           'identity',
  VALUES:             'values',
  PURPOSE:            'purpose',
  ETHICS:             'ethics',
  MEANING:            'meaning',
  GRIEF:              'grief',
  HEALTH:             'health',
  ORGANISATIONAL:     'organisational',
  FIELD:              'field',
  SIGNAL:             'signal',
  EDGE:               'edge',
  RECURSIVE:          'recursive',
  META:               'meta',
});

// ── Field Gap Model ───────────────────────────────────────────────────────────
// A gap is not a point. It is a field property.
// Four axes: expressed, inferred, omitted, uncertainty_weight.

export const FIELD_GAP_SUBTYPE = Object.freeze({
  SLOPE_CHANGE:           'slope_change',
  INFLECTION:             'inflection',
  PLATEAU:                'plateau',
  ASYMPTOTE:              'asymptote',
  DISCONTINUITY:          'discontinuity',
  OVERSHOOT:              'overshoot',
  CONVERGENCE:            'convergence',
  DIVERGENCE:             'divergence',
  OSCILLATION:            'oscillation',
  DAMPED_OSCILLATION:     'damped_oscillation',
  RESONANCE:              'resonance',
  PHASE_SHIFT:            'phase_shift',
  INTERFERENCE:           'interference',
  ALIASING:               'aliasing',
  RISING_EDGE:            'rising_edge',
  FALLING_EDGE:           'falling_edge',
  HARD_EDGE:              'hard_edge',
  SOFT_EDGE:              'soft_edge',
  BLURRED_EDGE:           'blurred_edge',
  HARMONIC_GAP:           'harmonic_gap',
  BEAT_FREQUENCY:         'beat_frequency',
  FRACTAL_GAP:            'fractal_gap',
  SCALE_INVARIANT:        'scale_invariant',
  SELF_SIMILAR:           'self_similar',
  MICRO_MACRO_DIVERGENCE: 'micro_macro_divergence',
});

// ── Sigma Regimes ─────────────────────────────────────────────────────────────
// Classifies the stability regime of any time-series of gap pressures.

export const SIGMA_REGIME = Object.freeze({
  STABLE:             'STABLE',
  DEGRADED:           'DEGRADED',
  COLLAPSING:         'COLLAPSING',
  OSCILLATORY:        'OSCILLATORY',
  INSUFFICIENT_DATA:  'INSUFFICIENT_DATA',
});

export function classifySigma(pressures, cfg = {}) {
  const minWindow        = cfg.minWindow        ?? 3;
  const slopeThreshold   = cfg.slopeThreshold   ?? 0.30;
  const accelThreshold   = cfg.accelThreshold   ?? 0.50;
  const oscillationCount = cfg.oscillationCount ?? 3;

  if (!pressures || pressures.length < minWindow) {
    return { regime: SIGMA_REGIME.INSUFFICIENT_DATA, confidence: 0, reason: 'need more data' };
  }

  const n    = pressures.length;
  const half = Math.ceil(n / 2);
  const firstHalf  = pressures.slice(0, half);
  const secondHalf = pressures.slice(half);
  const m1 = _mean(firstHalf);
  const m2 = _mean(secondHalf);
  const slope = m2 - m1;

  // Oscillation: count direction changes
  let dirChanges = 0;
  for (let i = 2; i < pressures.length; i++) {
    const d1 = pressures[i-1] - pressures[i-2];
    const d2 = pressures[i]   - pressures[i-1];
    if ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) dirChanges++;
  }
  const oscillationScore = dirChanges / Math.max(1, n - 2);

  if (oscillationScore > 0.55 && dirChanges >= oscillationCount) {
    return { regime: SIGMA_REGIME.OSCILLATORY, confidence: _clamp(oscillationScore, 0, 1), slope, dirChanges };
  }

  // Acceleration check — second derivative
  const accel = pressures.length >= 4
    ? (pressures[n-1] - pressures[n-2]) - (pressures[1] - pressures[0])
    : 0;

  if (slope > slopeThreshold && accel > accelThreshold) {
    return { regime: SIGMA_REGIME.COLLAPSING, confidence: _clamp(slope, 0, 1), slope, accel };
  }
  if (slope > slopeThreshold) {
    return { regime: SIGMA_REGIME.DEGRADED, confidence: _clamp(slope * 0.8, 0, 1), slope };
  }

  return { regime: SIGMA_REGIME.STABLE, confidence: _clamp(1 - Math.abs(slope), 0, 1), slope };
}

// ── Gap Base Class ────────────────────────────────────────────────────────────

export class GapSignal {
  /**
   * Create a standardised gap signal.
   * Every module produces these. Every gap is a signal, not a diagnosis.
   */
  static build({
    moduleId,
    id,
    type,
    subtype,
    domain,
    score,
    confidence,
    description,
    reason = [],
    evidence = [],
    textExcerpt = '',
    loadBearingQuestion = null,
    axes = [],
    asAbove = null,
    criticality = null,
    author = null,
    ts = null,
  }) {
    return Object.freeze({
      id:                   id ?? _uuid(),
      moduleId,
      type,
      subtype,
      domain,
      score:                _r4(score),
      confidence:           _confTier(score),
      confidenceScore:      _r4(confidence ?? score),
      description,
      reason,
      evidence,
      textExcerpt:          textExcerpt.slice(0, 200),
      loadBearingQuestion,
      axes,
      asAbove,
      criticality:          criticality ?? GAP_TYPE_CRITICALITY[type] ?? 0.5,
      author,
      ts:                   ts ?? Date.now(),
      // §C2 — always labeled
      signal_note:          'This is a detected pattern, not a judgment.',
    });
  }
}

// ── Sliding Window ────────────────────────────────────────────────────────────

export class SlidingWindow {
  constructor(cap = 20) { this._buf = []; this._cap = cap; }
  push(v)    { this._buf.push(v); if (this._buf.length > this._cap) this._buf.shift(); }
  get vals() { return [...this._buf]; }
  get len()  { return this._buf.length; }
  avg()      { return _mean(this._buf); }
  last()     { return this._buf[this._buf.length - 1] ?? null; }
  clear()    { this._buf = []; }
  std()      {
    if (this._buf.length < 2) return 0;
    const m = this.avg();
    return Math.sqrt(_mean(this._buf.map(x => (x - m) ** 2)));
  }
}

// ── Text utilities ────────────────────────────────────────────────────────────

export function tokenize(text) {
  return (text ?? '').toLowerCase()
    .replace(/[^a-z0-9'\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

export function matchCount(text, regex) {
  // Always reset lastIndex for safety
  const re = new RegExp(regex.source, 'gi');
  return (text.match(re) ?? []).length;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function _r4(n)            { return Math.round((n ?? 0) * 10000) / 10000; }
export function _clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function _mean(arr)               { return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0; }
function _confTier(v)             { return v >= 0.65 ? 'HIGH' : v >= 0.35 ? 'MEDIUM' : 'LOW'; }

function _uuid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

// ── Invariants ────────────────────────────────────────────────────────────────

export const INVARIANTS = Object.freeze([
  'The most critical gap is the one most avoided.',
  'Assumption gaps are always more load-bearing than they appear.',
  'Temporal gaps compound — small errors grow with time.',
  'Contradiction gaps generate energy — the oscillation is fuel if redirected before collapse.',
  'The observer always has blind spots that cannot be seen from inside the observation.',
  'Normalisation hides accumulation — point-in-time analysis misses what longitudinal reveals.',
  'Every system is optimised for what it actually rewards, not for what it says it values.',
  'The frame determines what can be found — the most important gaps are often outside the frame.',
  'Completeness is an illusion that causes premature closure.',
  'The gap in the gap detector is the most dangerous gap.',
]);

export const AS_ABOVE_SO_BELOW = Object.freeze([
  'The gap in a lyric line is the same operation as the gap in a legal contract — chain broken, obligation unmet, assumption never examined.',
  'The unresolved tritone in music is the unspoken word in conversation is the unclosed try/catch in code is the unenforced law in governance.',
  'What a song avoids saying at the pivot is what a person avoids feeling at the crisis is what an institution avoids measuring at the review.',
  'The hook exists where gap field pressure is maximum. In music, in argument, in relationship, in code — the most important moment is where expectation is highest and resolution is not yet guaranteed.',
  'Oscillation at the personal scale mirrors oscillation at the systemic scale.',
  'Compression creates the same artefacts at the bandwidth level as at the emotional level — the thing that doesn\'t fit gets dropped, and the absence is the gap.',
]);
