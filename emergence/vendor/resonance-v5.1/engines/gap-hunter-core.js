/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  ALK GapHunter  ·  gap-hunter.js  ·  v1.0.0                           ║
 * ║  UUID: alk-mod-gaphunter-0000-2100-0000-000000000001                   ║
 * ║  HOOK: alk.module.gaphunter:gap-hunter:00001                           ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * §1.1 — All outputs labeled as signals, not diagnoses.
 * §1.2 — All failures loud and specific.
 * §5.1 — UUID, hook, event bus registration on every detector.
 * §5.5 — No external runtime dependencies.
 * §5.6 — Same structural pattern across all abstraction layers.
 * §5.7 — Zero direct module calls. All I/O via kernel events only.
 * §5.8 — Composable detectors, not configured monolith.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHAT THIS MODULE IS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * GapHunter surfaces the structure of what is NOT being said, NOT being
 * thought, or NOT being seen — across verbal, behavioral, and relational
 * signal streams.
 *
 * It is not a transcript analyzer. It is a field detector. It hunts the
 * shape of the absence.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * DETECTION DOMAINS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * 1. WEAK ASSUMPTION HUNTER
 *    Surfaces load-bearing assumptions treated as facts —
 *    things said without evidence that structure everything downstream.
 *    Sources: assertion density without hedging, causal leap detection,
 *    certainty without prior, tautological reasoning chains.
 *
 * 2. SHADOW FIELD DETECTOR
 *    What is present but unspoken. The emotional or conceptual content
 *    that is being carried but not expressed.
 *    Sources: pronoun displacement patterns, intensity mismatch,
 *    overgeneralization, projected attribution (you/they instead of I),
 *    over-apology as aggression signal.
 *
 * 3. CONTRASTIVE GAP DETECTOR
 *    The gap between what is said and what the body/behavior is doing.
 *    The gap between stated position and actual orientation.
 *    Sources: cross-modal mismatch, semantic vs somatic divergence,
 *    belief-behavior gap, word-emotion gap.
 *
 * 4. NEGATIVE SPACE DETECTOR
 *    What is systematically avoided. The shape of the unspeakable.
 *    Sources: topic orbit analysis, avoidance trajectory, vocabulary
 *    field absence, semantic gravity wells (circling without landing).
 *
 * 5. STRUCTURAL ASSUMPTION AUDITOR
 *    The implicit architecture of the conversation itself —
 *    what must be true for this conversation to be happening this way.
 *    Sources: frame analysis, presupposition chains, power geometry,
 *    who gets to define terms, whose model is treated as ground truth.
 *
 * 6. REVERSAL DETECTOR
 *    Points where meaning inverts — irony, negation as assertion,
 *    "fine" meaning not fine, minimization as maximization.
 *    Sources: prosodic contour vs lexical content, negation clustering,
 *    minimization pattern + high arousal, rhetorical question density.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * EVENT SURFACE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Listens:
 *   alk.verbal.chunk.transcribed
 *   alk.verbal.analysis.tone
 *   alk.verbal.analysis.sentiment
 *   alk.latent.update
 *   alk.behavior.pattern.detected
 *   alk.behavior.shadow.signal
 *   alk.behavior.somatic.state
 *   alk.htl.ns.state
 *   alk.htl.emo.state
 *   alk.video.cue.detected
 *   alk.session.capture.start / stop
 *
 * Emits:
 *   alk.gap.weak_assumption        — load-bearing assertion without evidence
 *   alk.gap.shadow_field           — present-but-unspoken content detected
 *   alk.gap.contrastive            — word/body/behavior divergence
 *   alk.gap.negative_space         — systematic avoidance pattern
 *   alk.gap.structural_assumption  — implicit frame surfaced
 *   alk.gap.reversal               — meaning inversion detected
 *   alk.gap.composite              — multi-gap event (highest signal)
 *   alk.gap.summary                — session interval summary
 *   alk.gap.error
 */

'use strict';

import { ALKModule } from './kernel-stub.js';

// ─── Version ──────────────────────────────────────────────────────────────────

export const GAPHUNTER_VERSION = '1.0.0';
export const GAPHUNTER_UUID    = 'alk-mod-gaphunter-0000-2100-0000-000000000001';

// ─── Shared utilities ─────────────────────────────────────────────────────────

function r4(n)           { return Math.round((n ?? 0) * 10000) / 10000; }
function clamp(v, lo, hi){ return Math.max(lo, Math.min(hi, v)); }
function mean(arr)       { return arr.length ? arr.reduce((s,v) => s+v, 0)/arr.length : 0; }

function tokenize(text) {
  return (text ?? '').toLowerCase().replace(/[^a-z0-9'\s]/g, '').split(/\s+/).filter(Boolean);
}

class SlidingWindow {
  constructor(cap) { this._buf = []; this._cap = cap; }
  push(v)  { this._buf.push(v); if (this._buf.length > this._cap) this._buf.shift(); }
  get vals(){ return this._buf; }
  get len() { return this._buf.length; }
  avg()    { return mean(this._buf); }
  last()   { return this._buf[this._buf.length - 1] ?? null; }
  clear()  { this._buf = []; }
}

// Confidence tiers
const C = Object.freeze({ HIGH: 'HIGH', MEDIUM: 'MEDIUM', LOW: 'LOW' });
function conf(v) { return v >= 0.65 ? C.HIGH : v >= 0.35 ? C.MEDIUM : C.LOW; }

// ─── 1. WEAK ASSUMPTION HUNTER ────────────────────────────────────────────────

/**
 * Surfaces assertions that are treated as facts but carry no evidence.
 * These are the load-bearing walls of a conversation — if they fall,
 * everything built on them falls too.
 *
 * Detection axes:
 *   A. Assertion without hedge — high certainty + no qualification
 *   B. Causal leap — "therefore / so / that's why" without antecedent
 *   C. Universalization — "everyone / always / nobody / never" without basis
 *   D. Tautology — conclusion restates premise
 *   E. Unnamed agent — "they / people / someone" without reference
 */
export class WeakAssumptionHunter {
  static UUID    = 'alk-gh-wa-0000-2100-0000-000000000010';
  static VERSION = GAPHUNTER_VERSION;

  constructor() {
    this._assertionW    = new SlidingWindow(20);
    this._causalLeapW   = new SlidingWindow(20);
    this._universalW    = new SlidingWindow(20);
    this._tautologyW    = new SlidingWindow(20);
    this._evidenceW     = new SlidingWindow(20);
    this._hedgeW        = new SlidingWindow(20);
    this._sessionFinds  = 0;
    this._lastText      = [];
  }

  // Axis A: assertion density — confident declaratives without hedge
  _detectAssertions(words) {
    const assertion = /\b(is|are|was|were|will be|must be|clearly|obviously|definitely|certainly|absolutely|always|never|of course)\b/;
    const hedge     = /\b(maybe|perhaps|might|could|seems|appears|possibly|probably|somewhat|kind of|sort of|I think|I believe|I feel)\b/;
    const text      = words.join(' ');
    const assertHits = (text.match(assertion) || []).length;
    const hedgeHits  = (text.match(hedge)     || []).length;
    this._hedgeW.push(hedgeHits / Math.max(1, words.length));
    const assertScore = clamp((assertHits - hedgeHits * 1.5) / Math.max(1, words.length) * 8, 0, 1);
    this._assertionW.push(assertScore);
    return assertScore;
  }

  // Axis B: causal leap — conclusion without demonstrated premise
  _detectCausalLeap(words) {
    const leapMarkers = /\b(therefore|so|that's why|which means|hence|obviously because|clearly because|that proves|that shows)\b/;
    const evidence    = /\b(because|since|given that|as evidenced|data shows|research|studies|the fact that|we know that)\b/;
    const text        = words.join(' ');
    const leaps       = (text.match(leapMarkers) || []).length;
    const evidenced   = (text.match(evidence)    || []).length;
    this._evidenceW.push(evidenced / Math.max(1, words.length));
    const score = clamp(leaps * 0.4 - evidenced * 0.3, 0, 1);
    this._causalLeapW.push(score);
    return score;
  }

  // Axis C: universalization — unbounded claims
  _detectUniversal(words) {
    const universals = /\b(everyone|nobody|always|never|all|none|every single|no one|the whole|completely|totally|entirely|absolutely everyone)\b/;
    const bounded    = /\b(some|most|many|often|usually|generally|typically|in my experience|in this case)\b/;
    const text       = words.join(' ');
    const uHits      = (text.match(universals) || []).length;
    const bHits      = (text.match(bounded)    || []).length;
    const score      = clamp((uHits * 0.5 - bHits * 0.25) / Math.max(1, words.length) * 6, 0, 1);
    this._universalW.push(score);
    return score;
  }

  // Axis D: unnamed agent ("they / people / someone did X" — who?)
  _detectUnnamedAgent(words, prevTexts) {
    const vague = /\b(they|people|someone|everybody|the system|society|those people|you know how|you know what)\b/;
    const text  = words.join(' ');
    const hits  = (text.match(vague) || []).length;
    // More suspicious when it follows an assertion or claim
    const followsAssertion = prevTexts.some(t => /\b(is|was|will|must)\b/.test(t));
    return clamp(hits * 0.3 * (followsAssertion ? 1.5 : 1), 0, 1);
  }

  analyze(text, prevTexts = []) {
    const words    = tokenize(text);
    if (!words.length) return null;

    this._lastText.push(text);
    if (this._lastText.length > 8) this._lastText.shift();

    const assertScore   = this._detectAssertions(words);
    const causalScore   = this._detectCausalLeap(words);
    const universalScore= this._detectUniversal(words);
    const agentScore    = this._detectUnnamedAgent(words, prevTexts);

    const composite = clamp(
      assertScore   * 0.30 +
      causalScore   * 0.30 +
      universalScore* 0.25 +
      agentScore    * 0.15, 0, 1);

    if (composite < 0.20) return null;

    this._sessionFinds++;

    // Find the dominant assumption type
    const axes = [
      { name: 'assertion_without_evidence', score: assertScore,    example: 'confident declarative without qualification' },
      { name: 'causal_leap',               score: causalScore,    example: 'conclusion asserted without demonstrated premise' },
      { name: 'universalization',           score: universalScore, example: 'unbounded claim about all/always/never' },
      { name: 'unnamed_agent',              score: agentScore,     example: '"they/people/someone" — reference without referent' },
    ].sort((a, b) => b.score - a.score);

    const dominant = axes[0];

    // Surface the load-bearing question: what must be true for this to be said?
    const question = this._loadBearingQuestion(dominant.name, text);

    return {
      type:          'weak_assumption',
      subtype:       dominant.name,
      score:         r4(composite),
      confidence:    conf(composite),
      load_bearing_question: question,
      axes:          axes.map(a => ({ name: a.name, score: r4(a.score), example: a.example })),
      // §1.1 — labeled as signal
      signal_note:  'This is a detected pattern, not a judgment. Assumptions are necessary — this surfaces unexamined ones.',
      evidence:     [`assert=${r4(assertScore)}`, `causal=${r4(causalScore)}`, `universal=${r4(universalScore)}`, `agent=${r4(agentScore)}`],
    };
  }

  _loadBearingQuestion(type, text) {
    const questions = {
      assertion_without_evidence: `What is the evidence for this? What would have to be false for this not to be true?`,
      causal_leap:                `What's the missing step between the premise and this conclusion?`,
      universalization:           `Who or what is the exception? What would falsify "always/never/everyone"?`,
      unnamed_agent:              `Who specifically? What is the source of this attribution?`,
    };
    return questions[type] ?? `What is assumed here that has not been examined?`;
  }

  get sessionFinds() { return this._sessionFinds; }
}

// ─── 2. SHADOW FIELD DETECTOR ─────────────────────────────────────────────────

/**
 * Surfaces what is emotionally or cognitively present but not spoken.
 * The shadow is not the lie — it's the unintegrated material.
 *
 * Detection axes:
 *   A. Pronoun displacement — "you/they" when pattern suggests "I"
 *   B. Intensity mismatch — mild words over high arousal
 *   C. Over-qualification — covering something with too many qualifiers
 *   D. Projected attribution — attributing to others what applies to self
 *   E. Over-apology — apology as aggression proxy (hostility wearing compliance)
 *   F. Minimization inversion — "it's fine" + high arousal
 */
export class ShadowFieldDetector {
  static UUID    = 'alk-gh-sf-0000-2100-0000-000000000020';
  static VERSION = GAPHUNTER_VERSION;

  constructor() {
    this._arousalW          = new SlidingWindow(30);
    this._displacementW     = new SlidingWindow(20);
    this._minimizationW     = new SlidingWindow(20);
    this._overQualW         = new SlidingWindow(20);
    this._projectionHistory = [];
    this._sessionFinds      = 0;
  }

  feedArousal(v) { this._arousalW.push(v); }

  analyze(text, arousal = null) {
    const words   = tokenize(text);
    if (!words.length) return null;
    const ar      = arousal ?? this._arousalW.avg();

    // A. Pronoun displacement
    const iCount   = (text.match(/\b(i|i'm|i've|i was|i feel|i think|i need)\b/gi) || []).length;
    const youThey  = (text.match(/\b(you|they|people|everyone|he|she)\b/gi) || []).length;
    const dispScore = words.length < 5 ? 0
      : clamp((youThey - iCount * 0.5) / Math.max(1, words.length) * 5, 0, 1);
    this._displacementW.push(dispScore);

    // B. Intensity mismatch — calm vocabulary over activated body
    const mildWords = /\b(fine|okay|ok|alright|not a big deal|whatever|doesn't matter|I guess|sort of|kind of)\b/i;
    const mildHits  = (text.match(mildWords) || []).length;
    const intensMismatch = ar > 0.55 && mildHits > 0
      ? clamp(ar * mildHits * 0.6, 0, 1)
      : 0;

    // C. Over-qualification
    const qualifiers = /\b(just|only|sort of|kind of|a bit|a little|slightly|somewhat|maybe|possibly|I don't know if|I'm not sure if|it might be)\b/gi;
    const qualHits   = (text.match(qualifiers) || []).length;
    const qualScore  = clamp(qualHits / Math.max(1, words.length) * 8, 0, 1);
    this._overQualW.push(qualScore);

    // D. Projection — attributing universal quality that clearly is first-person
    const projPatterns = [
      /\b(it's normal to feel|everyone feels|most people would|anyone would be|it's natural to)\b/i,
      /\b(you'd be (angry|upset|hurt|scared|frustrated) if|anyone would (feel|think|say))\b/i,
    ];
    const projHits = projPatterns.reduce((s, re) => s + (text.match(re) || []).length, 0);
    const projScore = clamp(projHits * 0.4, 0, 1);
    this._projectionHistory.push(projScore);
    if (this._projectionHistory.length > 20) this._projectionHistory.shift();

    // E. Over-apology — apology without clear wrong, or apology as aggression
    const apologyRe = /\b(sorry|I apologize|I'm sorry|forgive me|excuse me)\b/gi;
    const apologies = (text.match(apologyRe) || []).length;
    const postApology = /\b(but|however|although|except|still|yet)\b/i.test(text);
    const apologyScore = apologies > 0 && (ar > 0.5 || postApology)
      ? clamp(apologies * 0.35 * (postApology ? 1.5 : 1), 0, 1)
      : 0;

    // F. Minimization inversion
    const minimizers = /\b(not a big deal|doesn't matter|I don't care|whatever|fine|it's fine|no problem)\b/i;
    const minHits    = (text.match(minimizers) || []).length;
    const minScore   = ar > 0.5 && minHits > 0 ? clamp(ar * minHits * 0.7, 0, 1) : 0;
    this._minimizationW.push(minScore);

    const composite = clamp(
      dispScore     * 0.25 +
      intensMismatch* 0.25 +
      qualScore     * 0.15 +
      projScore     * 0.15 +
      apologyScore  * 0.10 +
      minScore      * 0.10, 0, 1);

    if (composite < 0.18) return null;
    this._sessionFinds++;

    const axes = [
      { name: 'pronoun_displacement',     score: r4(dispScore),      surface: 'attributing to "you/they" what is likely "I"' },
      { name: 'intensity_mismatch',       score: r4(intensMismatch), surface: 'mild words over activated nervous system' },
      { name: 'over_qualification',       score: r4(qualScore),      surface: 'excessive softening — protecting something' },
      { name: 'projection',               score: r4(projScore),      surface: 'universal claim masking personal experience' },
      { name: 'apology_as_aggression',    score: r4(apologyScore),   surface: 'sorry-but structure — apology carrying charge' },
      { name: 'minimization_inversion',   score: r4(minScore),       surface: '"fine" + high activation = not fine' },
    ].filter(a => a.score > 0).sort((a, b) => b.score - a.score);

    const dominant = axes[0];

    return {
      type:       'shadow_field',
      subtype:    dominant?.name ?? 'mixed',
      score:      r4(composite),
      confidence: conf(composite),
      // What is being carried but not said?
      shadow_content: this._nameShadow(dominant?.name, ar),
      axes,
      // §1.1
      signal_note: 'Shadow detection identifies probable unexpressed content — not repressed content, not pathology.',
      evidence:   [`arousal=${r4(ar)}`, `displacement=${r4(dispScore)}`, `mismatch=${r4(intensMismatch)}`],
    };
  }

  _nameShadow(type, arousal) {
    const names = {
      pronoun_displacement:  'First-person experience attributed to external — "I am angry/hurt/afraid" spoken as "you/they"',
      intensity_mismatch:    arousal > 0.7
        ? 'Activated nervous system underneath calm vocabulary — body is expressing what words are not'
        : 'Mild language over elevated activation — something is being contained',
      over_qualification:    'Protecting a truth with too many layers of softening — what is underneath the hedges?',
      projection:            '"Everyone feels this" is often "I feel this and it is hard to claim"',
      apology_as_aggression: 'Apology structure carrying criticism — "I\'m sorry you feel that way"',
      minimization_inversion:'Downplaying signals heightening — what cannot be spoken directly',
    };
    return names[type] ?? 'Probable unspoken content detected — structure unclear';
  }

  get sessionFinds() { return this._sessionFinds; }
}

// ─── 3. CONTRASTIVE GAP DETECTOR ─────────────────────────────────────────────

/**
 * The gap between stated position and actual orientation.
 * Between word and body. Between belief and behavior.
 * Between what is claimed and what is demonstrated.
 *
 * This is the structural contrast — not emotional contradiction,
 * but model-level divergence.
 *
 * Detection axes:
 *   A. Word-body gap (verbal vs somatic)
 *   B. Stated-value vs behavioral gap (claimed belief vs action pattern)
 *   C. Before-after asymmetry (says X, then does not-X)
 *   D. Self-contradiction within window
 *   E. Semantic reversal (affirm then negate)
 */
export class ContrastiveGapDetector {
  static UUID    = 'alk-gh-cg-0000-2100-0000-000000000030';
  static VERSION = GAPHUNTER_VERSION;

  constructor() {
    this._sentimentW     = new SlidingWindow(20);
    this._arousalW       = new SlidingWindow(20);
    this._expressionW    = new SlidingWindow(20);
    this._positionHistory= [];
    this._sessionFinds   = 0;
  }

  feedState(sentiment, arousal, expressionAmp) {
    this._sentimentW.push(sentiment);
    this._arousalW.push(arousal);
    this._expressionW.push(expressionAmp);
  }

  analyze(text, somatic = null) {
    const words   = tokenize(text);
    if (!words.length) return null;
    const textStr = words.join(' ');

    // A. Word-body gap (uses somatic state if provided)
    const wordSentiment = this._sentimentW.avg();
    const bodyArousal   = this._arousalW.avg();
    const expressionAmp = this._expressionW.avg();
    const somaticGap    = somatic?.gap_type;

    let wordBodyScore = 0;
    if (somaticGap === 'BODY_AHEAD_OF_WORDS')  wordBodyScore = 0.75;
    if (somaticGap === 'WORDS_AHEAD_OF_BODY')  wordBodyScore = 0.60;
    if (somaticGap === 'PERFORMED_EMOTION')    wordBodyScore = 0.85;
    // Fallback: sentiment vs arousal divergence
    if (!somaticGap && wordSentiment > 0.3 && bodyArousal > 0.6) wordBodyScore = 0.55;
    if (!somaticGap && wordSentiment < -0.3 && bodyArousal < 0.2) wordBodyScore = 0.50;

    // B. Before-after asymmetry — "I don't care about X" then describes X in detail
    const dismissal = /\b(don't care|doesn't matter|not important|irrelevant|beside the point|whatever)\b/i;
    const dismissed = text.match(dismissal);
    // If text dismisses AND is long with detail, the detail contradicts dismissal
    const dismissScore = dismissed && words.length > 15 ? 0.55 : 0;

    // C. Self-contradiction within utterance
    const affirm = /\b(yes|yeah|right|correct|true|absolutely|definitely|of course|exactly)\b/i;
    const negate  = /\b(but|however|although|yet|still|except|unless|no|not|never)\b/i;
    const affirmHits = (text.match(affirm) || []).length;
    const negateHits  = (text.match(negate)  || []).length;
    const contrastScore = affirmHits > 0 && negateHits > 0
      ? clamp((affirmHits * negateHits) / Math.max(1, words.length) * 5, 0, 1)
      : 0;

    // D. Stated-value vs behavioral marker
    // "I'm fine with that" + high suppression + specific topic
    const valueClaims = /\b(I'm fine with|I accept|I understand|I agree|no problem|I'm okay with)\b/i;
    const valueHits   = (text.match(valueClaims) || []).length;
    const valueConflict = valueHits > 0 && this._arousalW.last() > 0.55 ? 0.60 : 0;

    // E. Semantic reversal — saying something and immediately undermining it
    const reversal = /\b(not that|I mean|actually|wait|no wait|I don't mean|that came out wrong|that's not what I)\b/i;
    const reversalScore = (text.match(reversal) || []).length > 0 ? 0.45 : 0;

    const composite = clamp(
      wordBodyScore  * 0.35 +
      dismissScore   * 0.20 +
      contrastScore  * 0.20 +
      valueConflict  * 0.15 +
      reversalScore  * 0.10, 0, 1);

    if (composite < 0.20) return null;
    this._sessionFinds++;

    const axes = [
      { name: 'word_body_gap',      score: r4(wordBodyScore),  gap: somaticGap ?? 'inferred from signal' },
      { name: 'dismissal_detail',   score: r4(dismissScore),   gap: 'dismisses then elaborates — detail contradicts dismissal' },
      { name: 'affirm_negate',      score: r4(contrastScore),  gap: 'yes-but structure within single utterance' },
      { name: 'stated_value_vs_body', score: r4(valueConflict), gap: '"fine with it" while system is activated' },
      { name: 'semantic_reversal',  score: r4(reversalScore),  gap: 'retracted or immediately modified claim' },
    ].filter(a => a.score > 0).sort((a, b) => b.score - a.score);

    return {
      type:       'contrastive_gap',
      subtype:    axes[0]?.name ?? 'mixed',
      score:      r4(composite),
      confidence: conf(composite),
      // What is the actual message under the stated message?
      contrastive_reading: this._readContrast(axes[0]?.name, somaticGap),
      axes,
      signal_note: 'Contrastive detection surfaces divergence between channels — not deception, divergence.',
      evidence:   [`wordBody=${r4(wordBodyScore)}`, `contrast=${r4(contrastScore)}`, `sentiment=${r4(wordSentiment)}`],
    };
  }

  _readContrast(type, somaticGap) {
    const reads = {
      word_body_gap:        somaticGap === 'PERFORMED_EMOTION'
        ? 'Displayed affect does not match felt state — body carrying different signal than expression'
        : 'Verbal content and somatic activation are not in the same conversation',
      dismissal_detail:     'Amount of elaboration on a "dismissed" topic suggests it is not actually dismissed',
      affirm_negate:        '"Yes-but" is frequently "no with extra steps" — the but is the real message',
      stated_value_vs_body: 'Claimed acceptance with activated nervous system — body has not agreed to what was said',
      semantic_reversal:    'Retraction or modification suggests the first version was closer to truth',
    };
    return reads[type] ?? 'Stated position and demonstrated orientation are diverging';
  }

  get sessionFinds() { return this._sessionFinds; }
}

// ─── 4. NEGATIVE SPACE DETECTOR ──────────────────────────────────────────────

/**
 * What is systematically avoided.
 * Not what is unspoken once — what is never reached despite circling.
 *
 * The negative space is defined by:
 *   - semantic gravity wells (topics orbited without landing)
 *   - vocabulary field absence (expected words that never appear)
 *   - topic return rate (coming back to X without completing X)
 *   - avoidance velocity (how hard the conversation steers away)
 *
 * Detection axes:
 *   A. Orbit without landing — topic repeatedly approached, never entered
 *   B. Vocabulary gap — semantic field missing from expected context
 *   C. Abrupt redirect — conversation changes direction at high speed
 *   D. Completion avoidance — sentences that don't finish their own logic
 */
export class NegativeSpaceDetector {
  static UUID    = 'alk-gh-ns-0000-2100-0000-000000000040';
  static VERSION = GAPHUNTER_VERSION;

  constructor() {
    this._topicHistory    = [];       // [{topic, count, lastTs}]
    this._topicWindow     = new SlidingWindow(30);
    this._redirectHistory = new SlidingWindow(15);
    this._incompleteW     = new SlidingWindow(20);
    this._sessionFinds    = 0;
    this._conversationTopics = new Map(); // topic → { visits, completions }
  }

  // Topic orbit tracking — called from behavior module's edge detection
  trackTopic(topicLabel, completed = false) {
    if (!this._conversationTopics.has(topicLabel)) {
      this._conversationTopics.set(topicLabel, { visits: 0, completions: 0 });
    }
    const t = this._conversationTopics.get(topicLabel);
    t.visits++;
    if (completed) t.completions++;
  }

  analyze(text) {
    const words  = tokenize(text);
    if (!words.length) return null;

    // A. Detect abrupt redirect markers
    const redirectors = /\b(anyway|moving on|but never mind|let's not go there|forget it|never mind|let's change the subject|can we talk about|different topic|actually|enough about)\b/i;
    const redirectHits = (text.match(redirectors) || []).length;
    this._redirectHistory.push(redirectHits);
    const redirectScore = clamp(this._redirectHistory.avg() * 3, 0, 1);

    // B. Sentence incompleteness — trailing off, abandoning logic
    const incomplete = /\.\.\.|—\s*$|,\s*$|and\s*$|but\s*$|because\s*$|so\s*$|I mean\s*$|like\s*$|you know\s*$/.test(text.trim());
    this._incompleteW.push(incomplete ? 1 : 0);
    const incompleteScore = clamp(this._incompleteW.avg() * 3, 0, 1);

    // C. Orbit detection — high-visit, low-completion topics
    const orbitedTopics = [];
    for (const [topic, data] of this._conversationTopics) {
      if (data.visits >= 3) {
        const completionRate = data.completions / data.visits;
        if (completionRate < 0.3) {
          orbitedTopics.push({ topic, visits: data.visits, completionRate: r4(completionRate) });
        }
      }
    }
    const orbitScore = orbitedTopics.length > 0
      ? clamp(orbitedTopics.length * 0.3 + (1 - orbitedTopics[0]?.completionRate ?? 0) * 0.4, 0, 1)
      : 0;

    // D. Vocabulary field detection — what should be here but isn't?
    // If someone describes a conflict without any feeling words — absence of affect vocabulary
    const conflictWords = /\b(fight|argue|conflict|disagreement|problem|issue|difficult|hard|challenging)\b/i;
    const feelingWords  = /\b(feel|felt|feeling|hurt|angry|sad|scared|frustrated|upset|worried)\b/i;
    const hasConflict   = conflictWords.test(text);
    const hasFeelings   = feelingWords.test(text);
    const affectAbsence = hasConflict && !hasFeelings ? 0.55 : 0;

    const composite = clamp(
      redirectScore   * 0.30 +
      incompleteScore * 0.25 +
      orbitScore      * 0.30 +
      affectAbsence   * 0.15, 0, 1);

    if (composite < 0.20) return null;
    this._sessionFinds++;

    return {
      type:       'negative_space',
      score:      r4(composite),
      confidence: conf(composite),
      // What is the shape of the avoidance?
      avoided_field: this._describeAvoidance(orbitedTopics, redirectScore, affectAbsence),
      orbited_topics: orbitedTopics,
      axes: [
        { name: 'redirect_pattern',    score: r4(redirectScore),   pattern: 'conversation steered away repeatedly' },
        { name: 'sentence_incomplete', score: r4(incompleteScore), pattern: 'logic abandoned before landing' },
        { name: 'topic_orbit',         score: r4(orbitScore),      pattern: 'approached but not entered' },
        { name: 'affect_vocabulary_absent', score: r4(affectAbsence), pattern: 'conflict described without feeling words' },
      ].filter(a => a.score > 0).sort((a, b) => b.score - a.score),
      signal_note: 'Negative space is defined by the shape of what surrounds the absence — not by its content.',
      evidence:   [`redirect=${r4(redirectScore)}`, `incomplete=${r4(incompleteScore)}`, `orbit=${r4(orbitScore)}`],
    };
  }

  _describeAvoidance(orbited, redirectScore, affectAbsence) {
    if (orbited.length > 0) {
      return `Topic "${orbited[0].topic}" visited ${orbited[0].visits} times, completed ${Math.round(orbited[0].completionRate * 100)}% — probable center of negative space`;
    }
    if (redirectScore > 0.4) return 'Repeated directional changes — avoidance path detectable from trajectory alone';
    if (affectAbsence > 0.3) return 'Conflict content without emotional vocabulary — affect field is the negative space';
    return 'Diffuse avoidance — shape detectable from redirects, not from a specific orbited topic';
  }

  get sessionFinds() { return this._sessionFinds; }
}

// ─── 5. STRUCTURAL ASSUMPTION AUDITOR ────────────────────────────────────────

/**
 * The implicit architecture of the conversation itself.
 * Who defines the terms. Whose model is ground truth. What must be true
 * for this conversation to be happening this way.
 *
 * This is the meta-gap — not what is assumed in the content,
 * but what is assumed about the conversation structure.
 *
 * Detection axes:
 *   A. Term definition asymmetry — one speaker defines all contested terms
 *   B. Framing capture — whose problem-frame is operative
 *   C. Presupposition chains — what must be accepted to engage
 *   D. Power geometry — who has the burden of proof
 *   E. Epistemological closure — what kinds of evidence are inadmissible
 */
export class StructuralAssumptionAuditor {
  static UUID    = 'alk-gh-sa-0000-2100-0000-000000000050';
  static VERSION = GAPHUNTER_VERSION;

  constructor() {
    this._framingW        = new SlidingWindow(20);
    this._definitionW     = new SlidingWindow(20);
    this._presupW         = new SlidingWindow(20);
    this._sessionFinds    = 0;
  }

  analyze(text) {
    const words  = tokenize(text);
    if (!words.length) return null;

    // A. Term definition capture — "what I mean by X is..." repeatedly
    const definitionCapture = /\b(what I mean by|by that I mean|in other words|what that means is|the real question is|the issue is really|the problem is really|that's not the point|the point is)\b/i;
    const defHits = (text.match(definitionCapture) || []).length;
    this._definitionW.push(defHits / Math.max(1, words.length) * 8);
    const defScore = clamp(this._definitionW.avg(), 0, 1);

    // B. Framing capture — declaring what the conversation is about
    const framingCapture = /\b(this is (really )?about|we need to talk about|the real issue|what's really happening|what this comes down to|let's be honest|the truth is|in reality|let's call it what it is)\b/i;
    const frameHits = (text.match(framingCapture) || []).length;
    this._framingW.push(frameHits / Math.max(1, words.length) * 8);
    const frameScore = clamp(this._framingW.avg(), 0, 1);

    // C. Presupposition embedding — questions that assume their own answer
    const presup = /\b(don't you think|wouldn't you agree|isn't it obvious|isn't it clear|you must see that|surely you can see|you know that|we both know|obviously you can tell)\b/i;
    const presupHits = (text.match(presup) || []).length;
    this._presupW.push(presupHits / Math.max(1, words.length) * 8);
    const presupScore = clamp(this._presupW.avg(), 0, 1);

    // D. Burden shift — making the other responsible for proving a negative
    const burdenShift = /\b(prove to me|show me|convince me|I don't see how|I don't understand why you|explain to me why)\b/i;
    const burdenHits  = (text.match(burdenShift) || []).length;
    const burdenScore = clamp(burdenHits * 0.45, 0, 1);

    // E. Epistemological closure — dismissing evidence types
    const closureRe = /\b(that doesn't count|that's not the same|you can't compare|that's different|that's not relevant|that doesn't apply|that's just your opinion)\b/i;
    const closureHits = (text.match(closureRe) || []).length;
    const closureScore = clamp(closureHits * 0.4, 0, 1);

    const composite = clamp(
      defScore    * 0.25 +
      frameScore  * 0.25 +
      presupScore * 0.25 +
      burdenScore * 0.15 +
      closureScore* 0.10, 0, 1);

    if (composite < 0.15) return null;
    this._sessionFinds++;

    const axes = [
      { name: 'term_definition_capture', score: r4(defScore),    reading: 'One speaker defines contested terms without negotiation' },
      { name: 'frame_capture',          score: r4(frameScore),   reading: 'Declaring what the conversation is about — re-centering' },
      { name: 'presupposition_chain',   score: r4(presupScore),  reading: 'Questions that assume their own answer — forced agreement' },
      { name: 'burden_shift',           score: r4(burdenScore),  reading: 'Making other party responsible for proving a negative' },
      { name: 'epistemological_closure',score: r4(closureScore), reading: 'Ruling out classes of evidence before examination' },
    ].filter(a => a.score > 0).sort((a, b) => b.score - a.score);

    return {
      type:       'structural_assumption',
      subtype:    axes[0]?.name ?? 'mixed',
      score:      r4(composite),
      confidence: conf(composite),
      structural_question: `What must be accepted to engage with this conversation on these terms? Who set those terms?`,
      axes,
      signal_note: 'Structural assumptions define what questions can be asked — surfacing them opens the frame.',
      evidence:   [`def=${r4(defScore)}`, `frame=${r4(frameScore)}`, `presup=${r4(presupScore)}`],
    };
  }

  get sessionFinds() { return this._sessionFinds; }
}

// ─── 6. REVERSAL DETECTOR ────────────────────────────────────────────────────

/**
 * Points where meaning inverts. The hardest things to see because
 * they look like what they are not.
 *
 * Detection axes:
 *   A. Tonal irony — prosodic contour inverts lexical content
 *   B. Rhetorical question as assertion
 *   C. Negation clustering — density of "not" as actual affirmation
 *   D. Litotes — understatement where exaggeration is meant
 *   E. Performative contradiction — saying X while doing not-X
 */
export class ReversalDetector {
  static UUID    = 'alk-gh-rd-0000-2100-0000-000000000060';
  static VERSION = GAPHUNTER_VERSION;

  constructor() {
    this._toneWindow       = new SlidingWindow(20);
    this._sentimentWindow  = new SlidingWindow(20);
    this._rhetoricW        = new SlidingWindow(20);
    this._sessionFinds     = 0;
  }

  feedTone(energy, pitch) {
    this._toneWindow.push({ energy, pitch });
  }

  feedSentiment(score) {
    this._sentimentWindow.push(score);
  }

  analyze(text, energy = null, sentiment = null) {
    const words   = tokenize(text);
    if (!words.length) return null;

    // A. Rhetorical question — question as statement
    const rhetoricalQ = /\b(do I really need to|is it too much to ask|would it kill you|how hard is it to|is that so (hard|difficult|much)|you think I (don't|didn't)|what am I supposed to)\b/i;
    const rhetoricHits = (text.match(rhetoricalQ) || []).length;
    this._rhetoricW.push(rhetoricHits);
    const rhetoricScore = clamp(this._rhetoricW.avg() * 2, 0, 1);

    // B. Negation as positive assertion — "not terrible" = good
    const litotes = /\b(not (bad|terrible|wrong|unfair|unimportant)|can't complain|not nothing|doesn't not|wouldn't not|isn't (wrong|incorrect))\b/i;
    const litotesHits = (text.match(litotes) || []).length;
    const litotesScore = clamp(litotesHits * 0.4, 0, 1);

    // C. Negation clustering — density of "not" inversions
    const negations = (text.match(/\b(not|n't|never|no|neither|nor)\b/gi) || []).length;
    const negScore = clamp(negations / Math.max(1, words.length) * 4, 0, 1);

    // D. Sarcasm markers — irony flag words
    const sarcasm = /\b(oh sure|yeah right|great|wonderful|fantastic|brilliant|amazing)\b/i;
    const negSentiment = this._sentimentWindow.avg() < -0.2;
    const sarcasmHits  = (text.match(sarcasm) || []).length;
    const sarcasmScore = sarcasmHits > 0 && (negSentiment || (energy ?? 0) > 0.6)
      ? clamp(sarcasmHits * 0.5, 0, 1)
      : 0;

    // E. Performative contradiction — claiming calm while being activated
    const calmClaim = /\b(I'm calm|I'm not angry|I'm not upset|I don't care|this doesn't bother me)\b/i;
    const calmHits  = (text.match(calmClaim) || []).length;
    const perfContradiction = calmHits > 0 && (energy ?? 0) > 0.55 ? 0.70 : 0;

    const composite = clamp(
      rhetoricScore       * 0.30 +
      sarcasmScore        * 0.25 +
      perfContradiction   * 0.25 +
      litotesScore        * 0.10 +
      negScore            * 0.10, 0, 1);

    if (composite < 0.20) return null;
    this._sessionFinds++;

    const axes = [
      { name: 'rhetorical_question',         score: r4(rhetoricScore),     inversion: 'Question is really a statement or accusation' },
      { name: 'sarcasm',                     score: r4(sarcasmScore),      inversion: 'Positive vocabulary, negative signal — inverted polarity' },
      { name: 'performative_contradiction',  score: r4(perfContradiction), inversion: 'Claiming a state not demonstrated by any channel' },
      { name: 'litotes',                     score: r4(litotesScore),       inversion: 'Understatement as exaggeration — "not bad" = very good' },
      { name: 'negation_cluster',            score: r4(negScore),           inversion: 'Dense negation field — meaning may be inverted throughout' },
    ].filter(a => a.score > 0).sort((a, b) => b.score - a.score);

    return {
      type:       'reversal',
      subtype:    axes[0]?.name ?? 'mixed',
      score:      r4(composite),
      confidence: conf(composite),
      inverted_meaning: `The stated meaning and the actual message are likely in opposite directions.`,
      axes,
      signal_note: 'Reversal detection: stated content may be the inverse of intended content. Context required.',
      evidence:   [`rhetoric=${r4(rhetoricScore)}`, `sarcasm=${r4(sarcasmScore)}`, `perfContra=${r4(perfContradiction)}`],
    };
  }

  get sessionFinds() { return this._sessionFinds; }
}

// ─── GapHunterModule — primary integration class ──────────────────────────────

/**
 * The integration shell. Wires all detectors to the kernel event bus,
 * synthesizes cross-detector composite signals, and emits the event surface.
 */
export class GapHunterModule extends ALKModule {
  static UUID    = GAPHUNTER_UUID;
  static VERSION = GAPHUNTER_VERSION;

  constructor({ kernel } = {}) {
    super({
      kernel,
      uuid:    GAPHUNTER_UUID,
      version: GAPHUNTER_VERSION,
      ns:      'alk.gap',
    });

    // Detectors
    this._weakAssumption = new WeakAssumptionHunter();
    this._shadowField    = new ShadowFieldDetector();
    this._contrastive    = new ContrastiveGapDetector();
    this._negativeSpace  = new NegativeSpaceDetector();
    this._structural     = new StructuralAssumptionAuditor();
    this._reversal       = new ReversalDetector();

    // Shared state from upstream modules
    this._latent         = { arousal: 0, suppression: 0, coherence: 0.5, engagement: 0, valence: 0 };
    this._lastSentiment  = 0;
    this._lastEnergy     = 0;
    this._lastSomatic    = null;
    this._lastNSState    = null;

    // Session tracking
    this._session        = null;
    this._sessionText    = [];
    this._intervalFinds  = [];
    this._frame          = 0;

    // Composite scoring — when multiple detectors fire simultaneously
    this._activeFinds    = new SlidingWindow(5); // recent gap events

    // Config
    this._config = {
      minScore:          0.20,
      compositeWindow:   10_000,  // ms — time window for composite detection
      summaryIntervalMs: 30_000,
    };
    this._lastSummary = Date.now();
  }

  start() {
    this._sub('alk.session.capture.start',      (ev) => this._onSessionStart(ev));
    this._sub('alk.session.capture.stop',       (ev) => this._onSessionStop(ev));
    this._sub('alk.verbal.chunk.transcribed',   (ev) => this._onTranscript(ev));
    this._sub('alk.verbal.analysis.tone',       (ev) => this._onTone(ev));
    this._sub('alk.verbal.analysis.sentiment',  (ev) => this._onSentiment(ev));
    this._sub('alk.latent.update',              (ev) => this._onLatent(ev));
    this._sub('alk.behavior.somatic.state',     (ev) => this._onSomatic(ev));
    this._sub('alk.htl.ns.state',               (ev) => { this._lastNSState = ev.payload; });
    this._sub('alk.behavior.pattern.detected',  (ev) => this._onBehaviorPattern(ev));
    this._sub('alk.kernel.pulse',               (ev) => this._onPulse(ev));

    this._emit('alk.gap.ready', {
      uuid: GAPHUNTER_UUID, version: GAPHUNTER_VERSION,
      detectors: ['weak_assumption', 'shadow_field', 'contrastive', 'negative_space', 'structural', 'reversal'],
    });
  }

  _onSessionStart(ev) {
    this._session     = ev.payload?.sessionId ?? ev.payload?.session ?? 'unknown';
    this._sessionText = [];
    this._intervalFinds = [];
    this._frame       = 0;
    this._lastSummary = Date.now();
    this._emit('alk.gap.session.start', { sessionId: this._session });
  }

  _onSessionStop(ev) {
    this._emitSummary();
    this._emit('alk.gap.session.stop', {
      sessionId:    this._session,
      totalFinds:   {
        weakAssumption: this._weakAssumption.sessionFinds,
        shadowField:    this._shadowField.sessionFinds,
        contrastive:    this._contrastive.sessionFinds,
        negativeSpace:  this._negativeSpace.sessionFinds,
        structural:     this._structural.sessionFinds,
        reversal:       this._reversal.sessionFinds,
      },
    });
  }

  _onLatent(ev) {
    const p = ev.payload ?? {};
    Object.assign(this._latent, {
      arousal:    p.arousal    ?? this._latent.arousal,
      suppression:p.suppression?? this._latent.suppression,
      coherence:  p.coherence  ?? this._latent.coherence,
      engagement: p.engagement ?? this._latent.engagement,
      valence:    p.valence    ?? this._latent.valence,
    });
    this._shadowField.feedArousal(this._latent.arousal);
    this._contrastive.feedState(this._lastSentiment, this._latent.arousal, 0.5);
    this._reversal.feedSentiment(this._lastSentiment);
  }

  _onTone(ev) {
    const p       = ev.payload ?? {};
    this._lastEnergy = p.energy ?? 0;
    this._reversal.feedTone(this._lastEnergy, p.f0 ?? 0);
  }

  _onSentiment(ev) {
    this._lastSentiment = ev.payload?.score ?? 0;
    this._reversal.feedSentiment(this._lastSentiment);
  }

  _onSomatic(ev) {
    this._lastSomatic = ev.payload ?? null;
  }

  _onBehaviorPattern(ev) {
    const p = ev.payload ?? {};
    // Track topic edges from behavior module for negative space
    if (p.domain === 'geometry' || p.domain === 'contrastive') {
      this._negativeSpace.trackTopic(p.pattern ?? 'unknown', false);
    }
  }

  _onTranscript(ev) {
    const text = ev.payload?.text ?? ev.payload?.transcript ?? '';
    if (!text) return;
    this._sessionText.push(text);
    if (this._sessionText.length > 20) this._sessionText.shift();
    this._runDetectors(text, ev.id);
  }

  _runDetectors(text, causedBy) {
    const sessionId = this._session;
    const meta      = { causedBy, sessionId };
    const found     = [];

    this._safeRun('weak_assumption', () => {
      const r = this._weakAssumption.analyze(text, this._sessionText.slice(-4));
      if (r) { found.push(r); this._emit('alk.gap.weak_assumption', r, meta); }
    });

    this._safeRun('shadow_field', () => {
      const r = this._shadowField.analyze(text, this._latent.arousal);
      if (r) { found.push(r); this._emit('alk.gap.shadow_field', r, meta); }
    });

    this._safeRun('contrastive', () => {
      const r = this._contrastive.analyze(text, this._lastSomatic);
      if (r) { found.push(r); this._emit('alk.gap.contrastive', r, meta); }
    });

    this._safeRun('negative_space', () => {
      const r = this._negativeSpace.analyze(text);
      if (r) { found.push(r); this._emit('alk.gap.negative_space', r, meta); }
    });

    this._safeRun('structural', () => {
      const r = this._structural.analyze(text);
      if (r) { found.push(r); this._emit('alk.gap.structural_assumption', r, meta); }
    });

    this._safeRun('reversal', () => {
      const r = this._reversal.analyze(text, this._lastEnergy, this._lastSentiment);
      if (r) { found.push(r); this._emit('alk.gap.reversal', r, meta); }
    });

    // Composite event — when 2+ detectors fire on same utterance
    if (found.length >= 2) {
      this._emitComposite(found, meta);
    }

    // Track for summary
    this._intervalFinds.push(...found);
  }

  _emitComposite(finds, meta) {
    const score = clamp(finds.reduce((s, f) => s + (f.score ?? 0), 0) / finds.length * 1.3, 0, 1);
    this._emit('alk.gap.composite', {
      type:         'composite_gap',
      score:        r4(score),
      confidence:   conf(score),
      constituents: finds.map(f => ({ type: f.type, subtype: f.subtype, score: f.score })),
      synthesis:    this._synthesize(finds),
      // §1.1
      signal_note:  'Multiple gap types detected simultaneously — compound structure. Highest signal density.',
    }, meta);
  }

  _synthesize(finds) {
    const types = finds.map(f => f.type);
    if (types.includes('shadow_field') && types.includes('contrastive_gap')) {
      return 'Unspoken content AND word-body divergence co-present — what is being held is also leaking';
    }
    if (types.includes('weak_assumption') && types.includes('structural_assumption')) {
      return 'Load-bearing assumption AND frame capture — the model defines its own evidence';
    }
    if (types.includes('negative_space') && types.includes('reversal')) {
      return 'Systematic avoidance AND meaning inversion — what is being said about the unsaid is itself inverted';
    }
    if (types.includes('shadow_field') && types.includes('weak_assumption')) {
      return 'Unspoken material is driving an unexamined assertion — the shadow is the engine of the assumption';
    }
    return `${finds.length} gap types simultaneously present — convergence of absence`;
  }

  _onPulse() {
    this._frame++;
    if (this._frame % 20 !== 0) return;
    const now = Date.now();
    if (now - this._lastSummary > this._config.summaryIntervalMs) {
      this._emitSummary();
      this._lastSummary = now;
    }
    this._emit('alk.gap.pulse', {
      uuid:    GAPHUNTER_UUID,
      version: GAPHUNTER_VERSION,
      frame:   this._frame,
      finds:   this._intervalFinds.length,
    });
  }

  _emitSummary() {
    if (!this._intervalFinds.length) return;
    const byType = {};
    for (const f of this._intervalFinds) {
      byType[f.type] = (byType[f.type] ?? 0) + 1;
    }
    const dominant = Object.entries(byType).sort(([,a],[,b]) => b - a)[0]?.[0] ?? null;
    this._emit('alk.gap.summary', {
      sessionId:   this._session,
      intervalFinds: this._intervalFinds.length,
      byType,
      dominant,
      avgScore:    r4(mean(this._intervalFinds.map(f => f.score ?? 0))),
      interpretation: dominant
        ? `Dominant gap pattern: ${dominant.replace(/_/g,' ')} — this is where the structure is thinnest`
        : 'No significant gap patterns in interval',
    });
    this._intervalFinds = [];
  }

  _safeRun(name, fn) {
    try { fn(); }
    catch (err) {
      this._emitError(`DETECTOR_${name.toUpperCase()}_FAILED`, err.message, { detector: name });
    }
  }

  health() {
    return {
      ...super.health(),
      detectors: {
        weakAssumption: { finds: this._weakAssumption.sessionFinds },
        shadowField:    { finds: this._shadowField.sessionFinds },
        contrastive:    { finds: this._contrastive.sessionFinds },
        negativeSpace:  { finds: this._negativeSpace.sessionFinds },
        structural:     { finds: this._structural.sessionFinds },
        reversal:       { finds: this._reversal.sessionFinds },
      },
    };
  }
}

export default { GapHunterModule, GAPHUNTER_VERSION, GAPHUNTER_UUID };
