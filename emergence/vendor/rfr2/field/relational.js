/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  ALK Relational Module  ·  relational.js  ·  v1.0.0                   ║
 * ║  UUID: alk-mod-relational-0000-2200-0000-000000000001                  ║
 * ║  HOOK: alk.module.relational:relational:00001                          ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * §1.1 — All outputs labeled as signals. Not diagnoses. Not judgments.
 * §1.2 — All failures loud and specific.
 * §5.1 — UUID, hook, event bus registration on every detector.
 * §5.5 — No external runtime dependencies.
 * §5.6 — Same structural pattern across all abstraction layers.
 * §5.7 — Zero direct module calls. All I/O via kernel events only.
 * §5.8 — Composable detectors, not configured monolith.
 * §7.0 — Event ontology separation: observational vs authoritative.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHAT THIS MODULE IS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The Relational Module tracks the structure of the relationship between
 * two (or more) systems as they co-create meaning, experience decay, and
 * move through rupture and repair.
 *
 * It does not model individuals. It models the space between them.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * DETECTION DOMAINS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * 1. CO-CREATED MEANING TRACKER
 *    Surfaces when new shared meaning is being actively constructed.
 *    Markers: new metaphors coined, shared vocabulary emerging, mutual
 *    elaboration (A extends B's frame, B extends A's), co-completion of
 *    sentences, recursive reference to shared concepts.
 *
 * 2. RELATIONAL DECAY DETECTOR
 *    Tracks slow-moving degradation that is invisible event-by-event.
 *    Axes: positivity ratio decay, semantic distance growth,
 *    pronoun shift (we → I/you), reciprocity collapse,
 *    meaning deflation (same words losing charge), bid-response ratio.
 *
 * 3. RUPTURE DETECTOR
 *    Identifies structural breaks in relational continuity.
 *    Rupture is not conflict — it's disconnection.
 *    Sources: sudden coherence collapse, bid rejection sequence,
 *    interpersonal gap onset (withdrawal + pursuit), meaning failure
 *    (words no longer communicating), narrative discontinuity.
 *
 * 4. REPAIR ENGINE
 *    Detects and scores repair attempts — not resolution, just attempt.
 *    Dimensions: repair type, timing (early/late), reception,
 *    depth (surface/structural), reciprocity.
 *
 * 5. RELATIONAL TRAJECTORY
 *    The overall vector of the relationship in this session:
 *    approach/retreat, deepening/flattening, opening/closing,
 *    convergent/divergent.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * EVENT SURFACE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Listens:
 *   alk.verbal.chunk.transcribed
 *   alk.verbal.analysis.sentiment
 *   alk.verbal.analysis.tone
 *   alk.latent.update
 *   alk.htl.ns.state
 *   alk.htl.emo.state
 *   alk.htl.att.state
 *   alk.htl.need.state
 *   alk.htl.rel.state
 *   alk.behavior.escalation.alert
 *   alk.behavior.pattern.detected
 *   alk.gap.composite
 *   alk.gap.shadow_field
 *   alk.icm.shared_field.update      — from ICM module
 *   alk.icm.breakdown
 *   alk.session.capture.start/stop
 *
 * Emits:
 *   alk.rel.meaning.created          — new shared meaning event
 *   alk.rel.meaning.deflated         — existing meaning losing charge
 *   alk.rel.decay.detected           — decay pattern identified
 *   alk.rel.decay.threshold          — decay crossed significant threshold
 *   alk.rel.rupture.detected         — structural disconnection event
 *   alk.rel.rupture.severity         — severity assessment
 *   alk.rel.repair.attempt           — repair attempt detected
 *   alk.rel.repair.received          — repair acknowledged/accepted
 *   alk.rel.repair.rejected          — repair not received
 *   alk.rel.trajectory.update        — relational vector update
 *   alk.rel.bid.detected             — connection bid detected
 *   alk.rel.bid.response             — bid response classified
 *   alk.rel.summary                  — interval summary
 *   alk.rel.error
 */

'use strict';

import { ALKModule } from './ALKModule.js';

// ─── Version ──────────────────────────────────────────────────────────────────

export const RELATIONAL_VERSION = '1.0.0';
export const RELATIONAL_UUID    = 'alk-mod-relational-0000-2200-0000-000000000001';

// ─── Shared utilities ─────────────────────────────────────────────────────────

function r4(n)           { return Math.round((n ?? 0) * 10000) / 10000; }
function clamp(v, lo, hi){ return Math.max(lo, Math.min(hi, v)); }
function mean(arr)       { return arr.length ? arr.reduce((s,v)=>s+v,0)/arr.length : 0; }

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

const C = Object.freeze({ HIGH: 'HIGH', MEDIUM: 'MEDIUM', LOW: 'LOW' });
function conf(v) { return v >= 0.65 ? C.HIGH : v >= 0.35 ? C.MEDIUM : C.LOW; }

// ─── Relational State Constants ───────────────────────────────────────────────

export const REL_TRAJECTORY = Object.freeze({
  DEEPENING:   'DEEPENING',     // toward more depth, vulnerability, shared model
  STABLE:      'STABLE',        // steady state — neither decay nor growth
  FLATTENING:  'FLATTENING',    // losing depth, becoming transactional
  RETREATING:  'RETREATING',    // active movement away
  RUPTURING:   'RUPTURING',     // structural break underway
  REPAIRING:   'REPAIRING',     // repair attempt in progress
  RECOVERING:  'RECOVERING',    // post-rupture stabilization
});

export const RUPTURE_TYPE = Object.freeze({
  BID_REJECTION_SEQUENCE:  'BID_REJECTION_SEQUENCE',  // multiple bids rejected
  NARRATIVE_DISCONTINUITY: 'NARRATIVE_DISCONTINUITY', // shared story broken
  MEANING_FAILURE:         'MEANING_FAILURE',          // words stop communicating
  WITHDRAWAL_ONSET:        'WITHDRAWAL_ONSET',         // systemic retreat
  CONTEMPT_EVENT:          'CONTEMPT_EVENT',            // contempt = deepest rupture
  COHERENCE_COLLAPSE:      'COHERENCE_COLLAPSE',        // shared model lost
});

export const REPAIR_TYPE = Object.freeze({
  DIRECT_APOLOGY:    'DIRECT_APOLOGY',
  ACKNOWLEDGMENT:    'ACKNOWLEDGMENT',
  HUMOR:             'HUMOR',
  OFFERING_EMPATHY:  'OFFERING_EMPATHY',
  REFRAMING:         'REFRAMING',
  PHYSICAL_GESTURE:  'PHYSICAL_GESTURE',  // lean forward, touch proxy
  RETURN_TO_WE:      'RETURN_TO_WE',      // pronoun shift I→we
  TOPIC_RETURN:      'TOPIC_RETURN',       // coming back to abandoned topic
});

// ─── 1. CO-CREATED MEANING TRACKER ────────────────────────────────────────────

/**
 * Surfaces when new shared meaning is actively being constructed.
 * This is the creative layer of relational life.
 *
 * New meaning is detected when:
 *   - A novel metaphor appears and is extended (A coins it, B uses it)
 *   - New vocabulary is introduced and echoed
 *   - Co-completion occurs (B finishes A's sentence accurately)
 *   - Recursive reference forms (referring back to jointly created construct)
 *   - "Yes-and" structure appears (elaboration, not just agreement)
 */
export class MeaningTracker {
  static UUID    = 'alk-rel-mt-0000-2200-0000-000000000010';
  static VERSION = RELATIONAL_VERSION;

  constructor() {
    this._sharedVocab     = new Map();  // word → {count, firstSeen, lastSeen}
    this._metaphorSeeds   = [];         // candidate novel metaphors
    this._meaningEvents   = [];         // confirmed meaning creation events
    this._elaborationW    = new SlidingWindow(15);
    this._cocompletionW   = new SlidingWindow(10);
    this._wePronouns      = new SlidingWindow(20);
    this._sessionFinds    = 0;
    this._meaningCharge   = 0.5;        // current charge on shared meanings [0,1]
  }

  // Track vocabulary across utterances for emergence detection
  trackVocab(text) {
    const words = tokenize(text);
    const now   = Date.now();
    for (const w of words) {
      if (w.length < 4) continue;  // skip short words
      if (!this._sharedVocab.has(w)) {
        this._sharedVocab.set(w, { count: 0, firstSeen: now, lastSeen: now });
      }
      const e = this._sharedVocab.get(w);
      e.count++;
      e.lastSeen = now;
    }
  }

  analyze(text, prevText = '') {
    const words   = tokenize(text);
    if (!words.length) return null;

    // A. Elaboration detection — "yes-and" structures
    const elaborators = /\b(and also|building on that|to add to that|going further|what that means is|which connects to|that reminds me of|so that means|and that brings up)\b/i;
    const elaborationHits = (text.match(elaborators) || []).length;
    this._elaborationW.push(elaborationHits);
    const elaborationScore = clamp(this._elaborationW.avg() * 3, 0, 1);

    // B. We-pronoun density — shared model language
    const weHits = (text.match(/\b(we|our|us|together|both|shared|between us)\b/gi) || []).length;
    this._wePronouns.push(weHits / Math.max(1, words.length));
    const weScore = clamp(this._wePronouns.avg() * 8, 0, 1);

    // C. Novel metaphor detection — X-as-Y structure in new context
    const metaphorRe = /\b(\w+ is (?:like|as|a kind of|a form of|similar to|basically|essentially)|like a \w+|as if \w+|imagine it as)\b/i;
    const metaphorHits = (text.match(metaphorRe) || []).length;
    const metaphorScore = clamp(metaphorHits * 0.5, 0, 1);

    // D. Mutual reference — referring to something jointly created earlier
    const mutualRef = /\b(what we (said|talked about|mentioned|agreed|decided)|the thing we|like we (said|were saying)|going back to what)\b/i;
    const mutualHits = (text.match(mutualRef) || []).length;
    const mutualScore = clamp(mutualHits * 0.5, 0, 1);

    // E. Newly shared vocabulary — word appearing in both texts
    const prevWords = new Set(tokenize(prevText));
    const echoWords = words.filter(w => w.length > 4 && prevWords.has(w)).length;
    const echoScore = clamp(echoWords / Math.max(1, words.length) * 5, 0, 1);

    const composite = clamp(
      elaborationScore * 0.25 +
      weScore          * 0.25 +
      metaphorScore    * 0.20 +
      mutualScore      * 0.20 +
      echoScore        * 0.10, 0, 1);

    // Meaning charge tracks health of existing meanings
    this._meaningCharge = clamp(this._meaningCharge * 0.95 + composite * 0.05, 0, 1);

    if (composite < 0.18) return null;
    this._sessionFinds++;

    return {
      type:             'meaning_created',
      score:            r4(composite),
      confidence:       conf(composite),
      creation_type:    metaphorScore > 0.4 ? 'metaphor_emergence'
                      : mutualScore   > 0.4 ? 'recursive_reference'
                      : elaborationScore > 0.4 ? 'elaborative_extension'
                      : 'shared_vocabulary',
      meaning_charge:   r4(this._meaningCharge),
      we_density:       r4(weScore),
      axes: [
        { name: 'elaboration',         score: r4(elaborationScore) },
        { name: 'we_language',         score: r4(weScore) },
        { name: 'metaphor_emergence',  score: r4(metaphorScore) },
        { name: 'mutual_reference',    score: r4(mutualScore) },
        { name: 'vocabulary_echo',     score: r4(echoScore) },
      ],
      signal_note: 'Meaning creation is the generative layer of relationship — shared constructs being built.',
    };
  }

  // Deflation: existing meanings losing charge (words becoming hollow)
  detectDeflation() {
    if (this._sharedVocab.size < 5) return null;
    const now = Date.now();
    const recentThreshold = 60_000; // words not used in 60s start deflating
    const aging = [...this._sharedVocab.entries()]
      .filter(([, v]) => v.count > 3 && (now - v.lastSeen) > recentThreshold)
      .length;
    const deflationScore = clamp(aging / Math.max(1, this._sharedVocab.size) * 3, 0, 1);
    if (deflationScore < 0.3) return null;
    return {
      type:            'meaning_deflated',
      score:           r4(deflationScore),
      confidence:      conf(deflationScore),
      deflated_count:  aging,
      signal_note:     'Shared vocabulary from earlier in session not being used — meaning may be losing charge.',
    };
  }

  get charge()        { return this._meaningCharge; }
  get sessionFinds()  { return this._sessionFinds; }
}

// ─── 2. RELATIONAL DECAY DETECTOR ─────────────────────────────────────────────

/**
 * Slow-moving degradation. Invisible event-by-event.
 * Only visible across time.
 *
 * Decay is not rupture. Rupture is acute. Decay is chronic.
 *
 * Decay axes:
 *   A. Positivity ratio decay — moving below 5:1 (Gottman)
 *   B. Semantic distance growth — shared vocabulary shrinking
 *   C. Pronoun erosion — "we" → "I/you" over time
 *   D. Reciprocity collapse — one-directional elaboration
 *   E. Bid-response rate decline — fewer bids answered
 *   F. Meaning deflation — shared vocabulary losing charge
 */
export class RelationalDecayDetector {
  static UUID    = 'alk-rel-dd-0000-2200-0000-000000000020';
  static VERSION = RELATIONAL_VERSION;

  constructor() {
    this._positiveW       = new SlidingWindow(50);  // positive events
    this._negativeW       = new SlidingWindow(50);  // negative events
    this._weW             = new SlidingWindow(30);  // we-pronoun density
    this._bidW            = new SlidingWindow(20);  // bid detection
    this._bidResponseW    = new SlidingWindow(20);  // bid response rate
    this._reciprocityW    = new SlidingWindow(20);  // who is elaborating
    this._semDistW        = new SlidingWindow(30);  // semantic distance proxy

    // Thresholds
    this._POSITIVITY_CRITICAL = 0.167; // below 1:5 = severe decay
    this._POSITIVITY_WARNING  = 0.455; // below ~5:6 = warning

    this._decayScore      = 0;
    this._decayHistory    = new SlidingWindow(20);
    this._sessionFinds    = 0;
  }

  feedSentiment(score) {
    if (score > 0.15)  this._positiveW.push(1);
    else if (score < -0.15) this._negativeW.push(1);
    else { this._positiveW.push(0); this._negativeW.push(0); }
  }

  feedWeDensity(density) { this._weW.push(density); }
  feedBid(responded) {
    this._bidW.push(1);
    this._bidResponseW.push(responded ? 1 : 0);
  }

  analyze() {
    // A. Positivity ratio
    const pos = this._positiveW.avg();
    const neg = this._negativeW.avg() || 0.001;
    const posRatio = pos / (pos + neg);
    const positivityDecay = posRatio < this._POSITIVITY_CRITICAL ? 0.9
      : posRatio < this._POSITIVITY_WARNING ? 0.55
      : 0;

    // B. Pronoun erosion — we density declining
    const weDensity    = this._weW.avg();
    const pronounErosion = weDensity < 0.05 ? 0.7 : weDensity < 0.12 ? 0.35 : 0;

    // C. Bid-response rate
    const bidRate    = this._bidResponseW.avg();
    const bidDecay   = bidRate < 0.2 ? 0.8 : bidRate < 0.5 ? 0.4 : 0;

    // D. Semantic distance — low echo between utterances
    const semDist  = clamp(1 - this._semDistW.avg(), 0, 1);
    const semDecay = semDist > 0.7 ? semDist * 0.5 : 0;

    const composite = clamp(
      positivityDecay * 0.35 +
      pronounErosion  * 0.25 +
      bidDecay        * 0.25 +
      semDecay        * 0.15, 0, 1);

    this._decayScore = composite;
    this._decayHistory.push(composite);

    // Trend: is decay accelerating?
    const vals = this._decayHistory.vals;
    const trend = vals.length >= 6
      ? mean(vals.slice(-3)) > mean(vals.slice(0, 3)) ? 'accelerating' : 'stable'
      : 'insufficient_data';

    if (composite < 0.20) return null;
    this._sessionFinds++;

    const threshold = composite > 0.70 ? 'CRITICAL'
      : composite > 0.45 ? 'WARNING' : 'EARLY';

    return {
      type:              'decay_detected',
      score:             r4(composite),
      confidence:        conf(composite),
      threshold,
      trend,
      positivity_ratio:  r4(posRatio),
      below_gottman:     posRatio < 0.833,
      we_density:        r4(weDensity),
      bid_response_rate: r4(bidRate),
      axes: [
        { name: 'positivity_decay',   score: r4(positivityDecay),  reading: `ratio=${r4(posRatio)} (need >0.83 for stability)` },
        { name: 'pronoun_erosion',    score: r4(pronounErosion),   reading: '"we" language declining — shared frame shrinking' },
        { name: 'bid_response_decay', score: r4(bidDecay),         reading: 'Connection attempts going unanswered' },
        { name: 'semantic_distance',  score: r4(semDecay),         reading: 'Shared vocabulary not echoing — worlds diverging' },
      ].filter(a => a.score > 0).sort((a, b) => b.score - a.score),
      recovery_signal:   this._recoverySignal(composite, trend),
      signal_note:       'Decay is slow and structural — most visible in aggregate, not in events.',
    };
  }

  _recoverySignal(score, trend) {
    if (score < 0.3) return 'No intervention needed — within normal variance';
    if (trend === 'accelerating' && score > 0.5) return 'Active repair needed — trajectory is deteriorating';
    if (score > 0.7) return 'Structural repair — surface repair will not hold at this depth';
    return 'Monitor and introduce positive bids — early intervention is highest leverage';
  }

  get decayScore()    { return this._decayScore; }
  get sessionFinds()  { return this._sessionFinds; }
}

// ─── 3. RUPTURE DETECTOR ──────────────────────────────────────────────────────

/**
 * Structural break in relational continuity.
 * Rupture ≠ conflict. Conflict can exist within connection.
 * Rupture is the loss of the connection itself.
 *
 * Rupture markers:
 *   A. Bid rejection sequence — 3+ connection bids with no response
 *   B. Coherence collapse — shared narrative suddenly discontinuous
 *   C. Contempt event — the most predictive rupture signal
 *   D. Withdrawal onset — systemic retreat detectable from NS state
 *   E. Meaning failure — same words, no communication
 *   F. Narrative break — "you always / you never" — erasing history
 */
export class RuptureDetector {
  static UUID    = 'alk-rel-rd-0000-2200-0000-000000000030';
  static VERSION = RELATIONAL_VERSION;

  constructor() {
    this._bidRejections      = 0;
    this._contemptEvents     = 0;
    this._narrativeBreaks    = 0;
    this._coherenceW         = new SlidingWindow(20);
    this._withdrawalW        = new SlidingWindow(15);
    this._ruptureSeverity    = 0;
    this._activeRupture      = false;
    this._ruptureStart       = null;
    this._sessionFinds       = 0;
  }

  feedCoherence(v)          { this._coherenceW.push(v); }
  feedWithdrawal(v)         { this._withdrawalW.push(v); }
  feedBidRejection()        { this._bidRejections++; }
  feedContempt()            { this._contemptEvents++; }

  analyze(text, nsState = null, emoState = null) {
    const words = tokenize(text);

    // A. Contempt markers — the most predictive signal
    const contemptRe = /\b(pathetic|ridiculous|stupid|unbelievable|of course you|typical|what do you expect|I can't believe|you would|you always do this)\b/i;
    const contemptHits = words.length > 0 ? (text.match(contemptRe) || []).length : 0;
    if (contemptHits > 0) this._contemptEvents++;
    const contemptScore = clamp(this._contemptEvents * 0.35, 0, 1);

    // B. Narrative erasure — absolutist claims about history
    const narrativeErase = /\b(you (always|never|constantly|never ever)|I (always|never) (have to|do|am)|every single time|not once|you've never)\b/i;
    const narrativeHits  = words.length > 0 ? (text.match(narrativeErase) || []).length : 0;
    if (narrativeHits > 0) this._narrativeBreaks++;
    const narrativeScore = clamp(this._narrativeBreaks * 0.3, 0, 1);

    // C. Withdrawal markers (systemic retreat)
    const withdrawalMarkers = /\b(forget it|whatever|I give up|fine|do whatever|I don't care anymore|never mind|doesn't matter)\b/i;
    const withdrawHits = words.length > 0 ? (text.match(withdrawalMarkers) || []).length : 0;
    this._withdrawalW.push(withdrawHits);
    const withdrawalScore = clamp(this._withdrawalW.avg() * 3, 0, 1);

    // Also from NS state
    const nsWithdrawal = nsState?.polyvagalState === 'DORSAL' ? 0.5 : 0;
    const totalWithdrawal = clamp(withdrawalScore + nsWithdrawal, 0, 1);

    // D. Bid rejection sequence
    const bidRejectionScore = clamp(this._bidRejections * 0.25, 0, 1);

    // E. Coherence collapse (from latent model)
    const coh           = this._coherenceW.avg();
    const cohCollapse   = coh < 0.25 ? 0.75 : coh < 0.40 ? 0.40 : 0;

    // F. Meaning failure markers
    const meaningFailure = /\b(that's not what I (said|meant)|you're not (hearing|listening|understanding)|you don't get it|I can't explain|there's no point|you never understand|we always end up)\b/i;
    const meaningHits = words.length > 0 ? (text.match(meaningFailure) || []).length : 0;
    const meaningScore = clamp(meaningHits * 0.45, 0, 1);

    const composite = clamp(
      contemptScore    * 0.30 +
      narrativeScore   * 0.20 +
      totalWithdrawal  * 0.20 +
      bidRejectionScore* 0.15 +
      cohCollapse      * 0.10 +
      meaningScore     * 0.05, 0, 1);

    this._ruptureSeverity = composite;

    if (composite < 0.20) {
      if (this._activeRupture && composite < 0.10) {
        this._activeRupture = false;
        this._ruptureStart  = null;
      }
      return null;
    }

    if (!this._activeRupture) {
      this._activeRupture = true;
      this._ruptureStart  = Date.now();
      this._sessionFinds++;
    }

    // Classify rupture type
    const ruptureType = contemptScore > 0.4   ? RUPTURE_TYPE.CONTEMPT_EVENT
      : meaningScore > 0.5                    ? RUPTURE_TYPE.MEANING_FAILURE
      : narrativeScore > 0.4                  ? RUPTURE_TYPE.NARRATIVE_DISCONTINUITY
      : totalWithdrawal > 0.5                 ? RUPTURE_TYPE.WITHDRAWAL_ONSET
      : bidRejectionScore > 0.5              ? RUPTURE_TYPE.BID_REJECTION_SEQUENCE
      : RUPTURE_TYPE.COHERENCE_COLLAPSE;

    const severity = composite > 0.70 ? 'SEVERE'
      : composite > 0.45 ? 'MODERATE' : 'EARLY';

    return {
      type:           'rupture_detected',
      rupture_type:   ruptureType,
      severity,
      score:          r4(composite),
      confidence:     conf(composite),
      duration_ms:    this._ruptureStart ? Date.now() - this._ruptureStart : 0,
      // What does repair require at this severity?
      repair_requirement: this._repairRequirement(severity, ruptureType),
      axes: [
        { name: 'contempt',         score: r4(contemptScore),     reading: 'Contempt is the most corrosive rupture signal' },
        { name: 'narrative_erasure',score: r4(narrativeScore),    reading: 'Absolutist history claims erase shared narrative' },
        { name: 'withdrawal',       score: r4(totalWithdrawal),   reading: 'Systemic retreat from the relational field' },
        { name: 'bid_rejection',    score: r4(bidRejectionScore), reading: 'Connection attempts repeatedly unanswered' },
        { name: 'meaning_failure',  score: r4(meaningScore),      reading: 'Words no longer communicating — channel failed' },
        { name: 'coherence_collapse',score: r4(cohCollapse),      reading: 'Shared model lost — systems no longer synchronized' },
      ].filter(a => a.score > 0).sort((a, b) => b.score - a.score),
      signal_note: 'Rupture is not conflict. It is disconnection. Repair must address connection before content.',
    };
  }

  _repairRequirement(severity, type) {
    if (severity === 'SEVERE') {
      return type === RUPTURE_TYPE.CONTEMPT_EVENT
        ? 'Deep acknowledgment required — not apology, acknowledgment of impact. No content resolution at this severity.'
        : 'Structural repair needed — surface apology will not hold. Must address relational breach directly.';
    }
    if (severity === 'MODERATE') {
      return type === RUPTURE_TYPE.MEANING_FAILURE
        ? 'Slow down — meaning channel has failed. Return to simpler language. Acknowledge that something broke.'
        : 'Named repair attempt — acknowledge what happened, signal willingness to reconnect.';
    }
    return 'Early intervention — soft bid for reconnection now. The window is still open.';
  }

  get severity()      { return this._ruptureSeverity; }
  get active()        { return this._activeRupture; }
  get sessionFinds()  { return this._sessionFinds; }
}

// ─── 4. REPAIR ENGINE ────────────────────────────────────────────────────────

/**
 * Detects repair attempts and classifies their type, timing, and depth.
 * Repair is not resolution. It's the attempt to re-establish connection.
 *
 * Repair types range from surface (apology) to structural
 * (acknowledging the pattern, not just the event).
 */
export class RepairEngine {
  static UUID    = 'alk-rel-re-0000-2200-0000-000000000040';
  static VERSION = RELATIONAL_VERSION;

  constructor() {
    this._repairAttempts = [];
    this._lastRuptureTs  = null;
    this._sessionFinds   = 0;
  }

  markRupture() { this._lastRuptureTs = Date.now(); }

  analyze(text, nsState = null) {
    const words = tokenize(text);
    if (!words.length) return null;

    // Direct apology
    const apology = /\b(I('m| am) sorry|I apologize|forgive me|my fault|I was wrong|I shouldn't have|that was wrong of me)\b/i;
    const apologyHits = (text.match(apology) || []).length;

    // Acknowledgment (higher than apology — owns impact)
    const acknowledge = /\b(I (can see|understand|hear) that|that (hurt|was hard|was painful)|I can imagine|I didn't realize|I see why)\b/i;
    const ackHits = (text.match(acknowledge) || []).length;

    // Humor as repair (de-escalation attempt)
    const humorRe = /\b(haha|laugh|joke|funny|ridiculous\s+we|absurd that|come on|seriously though)\b/i;
    const humorHits = (text.match(humorRe) || []).length;

    // Empathy offer
    const empathyRe = /\b(that must (be|feel|have been)|I can (only imagine|see)|it makes sense (that|you would)|of course (you feel|you're))\b/i;
    const empathyHits = (text.match(empathyRe) || []).length;

    // Return to we — pronoun repair
    const weReturn = /\b(we|us|together|both of us|we could|let's|we should)\b/gi;
    const weHits = (text.match(weReturn) || []).length;

    // Reframe — offering a new way to see the event
    const reframeRe = /\b(what I (think|thought|meant)|maybe (what I was|I was trying)|I think what happened|from my side|the way I see it)\b/i;
    const reframeHits = (text.match(reframeRe) || []).length;

    const anyRepair = apologyHits + ackHits + humorHits + empathyHits + weHits + reframeHits;
    if (anyRepair === 0) return null;

    const score = clamp(
      apologyHits   * 0.4 +
      ackHits       * 0.5 +
      humorHits     * 0.25 +
      empathyHits   * 0.45 +
      (weHits > 0 ? 0.3 : 0) +
      reframeHits   * 0.35, 0, 1);

    if (score < 0.20) return null;

    this._sessionFinds++;

    // Classify repair type (most prominent)
    const repairType = ackHits > 0     ? REPAIR_TYPE.ACKNOWLEDGMENT
      : empathyHits > 0                ? REPAIR_TYPE.OFFERING_EMPATHY
      : apologyHits > 0               ? REPAIR_TYPE.DIRECT_APOLOGY
      : weHits > 2                    ? REPAIR_TYPE.RETURN_TO_WE
      : reframeHits > 0               ? REPAIR_TYPE.REFRAMING
      : REPAIR_TYPE.HUMOR;

    // Repair depth: structural vs surface
    const isStructural = ackHits > 0 || reframeHits > 0;
    const depth        = isStructural ? 'structural' : 'surface';

    // Timing: how long after rupture?
    const latencyMs    = this._lastRuptureTs ? Date.now() - this._lastRuptureTs : null;
    const timing       = latencyMs === null ? 'pre-rupture'
      : latencyMs < 10_000  ? 'immediate'
      : latencyMs < 60_000  ? 'early'
      : latencyMs < 300_000 ? 'delayed'
      : 'late';

    const repairEvent = {
      type:        'repair_attempt',
      repair_type: repairType,
      depth,
      timing,
      latency_ms:  latencyMs,
      score:       r4(score),
      confidence:  conf(score),
      axes: [
        { name: 'acknowledgment',  score: r4(ackHits * 0.5) },
        { name: 'empathy_offer',   score: r4(empathyHits * 0.45) },
        { name: 'direct_apology',  score: r4(apologyHits * 0.4) },
        { name: 'return_to_we',    score: r4(Math.min(weHits, 3) * 0.1) },
        { name: 'reframing',       score: r4(reframeHits * 0.35) },
        { name: 'humor',           score: r4(humorHits * 0.25) },
      ].filter(a => a.score > 0).sort((a, b) => b.score - a.score),
      // What's needed for this repair to land?
      reception_conditions: this._receptionConditions(repairType, nsState),
      signal_note: 'Repair attempt detected. Whether it is received depends on the other system\'s state.',
    };

    this._repairAttempts.push(repairEvent);
    return repairEvent;
  }

  _receptionConditions(type, nsState) {
    const zone = nsState?.windowZone ?? 'WINDOW';
    if (zone === 'HYPO') return 'System offline — repair cannot be received until NS returns to window';
    if (zone === 'HYPER') return 'System above window — slow down, reduce intensity, repair can land only when arousal falls';
    if (type === REPAIR_TYPE.ACKNOWLEDGMENT) return 'Optimal — acknowledgment is high-reception repair type. Let it breathe.';
    if (type === REPAIR_TYPE.HUMOR)  return 'Risky — humor repair requires shared safety. If contempt is present, it lands wrong.';
    if (type === REPAIR_TYPE.DIRECT_APOLOGY) return 'Moderate — apology lands better when not immediately followed by "but"';
    return 'Within window — repair has a good chance of being received';
  }

  get attempts()     { return this._repairAttempts.length; }
  get sessionFinds() { return this._sessionFinds; }
}

// ─── 5. BID DETECTOR ─────────────────────────────────────────────────────────

/**
 * Connection bids are the atoms of relationship.
 * Every bid is a request to connect — often invisible.
 * They can be turned toward, away, or against.
 */
export class BidDetector {
  static UUID    = 'alk-rel-bd-0000-2200-0000-000000000050';
  static VERSION = RELATIONAL_VERSION;

  constructor() {
    this._bidHistory   = new SlidingWindow(30);
    this._bidResponseHistory = new SlidingWindow(30);
    this._sessionBids  = 0;
    this._pendingBid   = null;
  }

  detectBid(text) {
    const words  = tokenize(text);
    if (!words.length) return null;

    // Bids are attempts to connect — can be questions, observations, humor, sharing
    const question    = /\?/.test(text) && words.length > 3;
    const observation = /\b(look at|did you (see|notice|hear)|have you (seen|heard|noticed)|isn't it|isn't that)\b/i.test(text);
    const sharing     = /\b(I (just|was|had|found|wanted to|need to (tell|show)|realized|thought))\b/i.test(text);
    const invitation  = /\b(what do you think|how do you feel|would you|could we|can we|do you want|shall we)\b/i.test(text);

    const bidScore = clamp(
      (question     ? 0.4 : 0) +
      (observation  ? 0.3 : 0) +
      (sharing      ? 0.35 : 0) +
      (invitation   ? 0.5 : 0), 0, 1);

    if (bidScore < 0.25) return null;
    this._sessionBids++;
    this._pendingBid = { text: text.slice(0, 60), score: bidScore, ts: Date.now() };
    this._bidHistory.push(bidScore);

    return {
      type:         'bid_detected',
      bid_type:     invitation ? 'invitation' : sharing ? 'sharing' : observation ? 'observation' : 'question',
      score:        r4(bidScore),
      bid_rate:     r4(this._bidHistory.avg()),
    };
  }

  classifyResponse(text) {
    if (!this._pendingBid) return null;
    const words = tokenize(text);
    if (!words.length) return null;

    // Turning toward: engagement, elaboration, response
    const toward  = /\b(yes|yeah|right|I know|tell me|really|that's|I think|what|how|when|where|oh|wow|interesting|same|agreed)\b/i.test(text) && words.length > 2;
    // Turning away: distraction, neutral non-response
    const away    = words.length < 4 && !/yes|no|yeah|right/.test(text);
    // Turning against: dismissal, contempt
    const against = /\b(whatever|I don't care|not now|stop|seriously|you always|here we go)\b/i.test(text);

    const response = against ? 'against' : toward ? 'toward' : 'away';
    const latencyMs = Date.now() - this._pendingBid.ts;
    const received  = response === 'toward';
    this._bidResponseHistory.push(received ? 1 : 0);
    this._pendingBid = null;

    return {
      type:            'bid_response',
      response,
      received,
      latency_ms:      latencyMs,
      response_rate:   r4(this._bidResponseHistory.avg()),
    };
  }

  get bidRate()      { return this._bidHistory.avg(); }
  get responseRate() { return this._bidResponseHistory.avg(); }
  get sessionBids()  { return this._sessionBids; }
}

// ─── RelationalModule — Integration Shell ────────────────────────────────────

export class RelationalModule extends ALKModule {
  static UUID    = RELATIONAL_UUID;
  static VERSION = RELATIONAL_VERSION;

  constructor({ kernel } = {}) {
    super({
      kernel,
      uuid:    RELATIONAL_UUID,
      version: RELATIONAL_VERSION,
      ns:      'alk.rel',
    });

    // Sub-detectors
    this._meaning  = new MeaningTracker();
    this._decay    = new RelationalDecayDetector();
    this._rupture  = new RuptureDetector();
    this._repair   = new RepairEngine();
    this._bid      = new BidDetector();

    // State from upstream
    this._latent       = { arousal: 0, suppression: 0, coherence: 0.5 };
    this._lastSentiment = 0;
    this._lastNSState   = null;
    this._lastEmoState  = null;
    this._lastAttState  = null;
    this._lastICMState  = null;

    // Relational trajectory
    this._trajectory    = REL_TRAJECTORY.STABLE;
    this._trajectoryW   = new SlidingWindow(20);
    this._prevText      = '';

    // Session
    this._session       = null;
    this._frame         = 0;
    this._lastSummary   = Date.now();

    this._SUMMARY_INTERVAL_MS = 30_000;
  }

  start() {
    this._sub('alk.session.capture.start',     (ev) => this._onSessionStart(ev));
    this._sub('alk.session.capture.stop',      (ev) => this._onSessionStop(ev));
    this._sub('alk.verbal.chunk.transcribed',  (ev) => this._onTranscript(ev));
    this._sub('alk.verbal.analysis.sentiment', (ev) => this._onSentiment(ev));
    this._sub('alk.verbal.analysis.tone',      (ev) => this._onTone(ev));
    this._sub('alk.latent.update',             (ev) => this._onLatent(ev));
    this._sub('alk.htl.ns.state',              (ev) => { this._lastNSState  = ev.payload; });
    this._sub('alk.htl.emo.state',             (ev) => { this._lastEmoState = ev.payload; });
    this._sub('alk.htl.att.state',             (ev) => { this._lastAttState = ev.payload; });
    this._sub('alk.behavior.escalation.alert', (ev) => this._onEscalation(ev));
    this._sub('alk.video.cue.detected',        (ev) => this._onCue(ev));
    this._sub('alk.icm.shared_field.update',   (ev) => { this._lastICMState = ev.payload; });
    this._sub('alk.icm.breakdown',             (ev) => this._onICMBreakdown(ev));
    this._sub('alk.kernel.pulse',              (ev) => this._onPulse(ev));

    this._emit('alk.rel.ready', {
      uuid:    RELATIONAL_UUID,
      version: RELATIONAL_VERSION,
    });
  }

  _onSessionStart(ev) {
    this._session     = ev.payload?.sessionId ?? 'unknown';
    this._frame       = 0;
    this._lastSummary = Date.now();
    this._trajectory  = REL_TRAJECTORY.STABLE;
    this._emit('alk.rel.session.start', { sessionId: this._session });
  }

  _onSessionStop() {
    this._emitSummary();
    const deflation = this._meaning.detectDeflation();
    if (deflation) this._emit('alk.rel.meaning.deflated', deflation);
    this._emit('alk.rel.session.stop', { sessionId: this._session });
  }

  _onLatent(ev) {
    const p = ev.payload ?? {};
    Object.assign(this._latent, {
      arousal:    p.arousal    ?? this._latent.arousal,
      suppression:p.suppression?? this._latent.suppression,
      coherence:  p.coherence  ?? this._latent.coherence,
    });
    this._rupture.feedCoherence(this._latent.coherence);
  }

  _onSentiment(ev) {
    this._lastSentiment = ev.payload?.score ?? 0;
    this._decay.feedSentiment(this._lastSentiment);
  }

  _onTone() {}

  _onCue(ev) {
    const cue = ev.payload?.cue ?? '';
    // Lean back / forward as connection bid proxy
    if (cue === 'lean_forward') this._bid.detectBid('__nonverbal_approach__');
    if (cue === 'lean_back')    this._rupture.feedWithdrawal(0.5);
    if (cue === 'contempt_micro') {
      this._rupture.feedContempt();
    }
  }

  _onEscalation() {
    this._rupture.feedBidRejection();
  }

  _onICMBreakdown(ev) {
    // ICM breakdown is a high-signal rupture precursor
    const p = ev.payload ?? {};
    this._emit('alk.rel.rupture.detected', {
      type:         'rupture_detected',
      source:       'icm_breakdown',
      rupture_type: RUPTURE_TYPE.COHERENCE_COLLAPSE,
      severity:     p.severity ?? 'MODERATE',
      score:        p.coEntropy ?? 0.5,
      confidence:   C.MEDIUM,
      signal_note:  'Shared model field collapsed (ICM) — structural rupture precursor.',
    });
  }

  _onTranscript(ev) {
    const text      = ev.payload?.text ?? ev.payload?.transcript ?? '';
    if (!text) return;
    const sessionId = this._session;
    const meta      = { causedBy: ev.id, sessionId };

    // Track vocab for meaning emergence
    this._meaning.trackVocab(text);

    // Bid detection
    const bid = this._bid.detectBid(text);
    if (bid) this._emit('alk.rel.bid.detected', bid, meta);

    // Bid response (applied to previous bid)
    const bidResp = this._bid.classifyResponse(text);
    if (bidResp) {
      this._decay.feedBid(bidResp.received);
      if (!bidResp.received) this._rupture.feedBidRejection();
      this._emit('alk.rel.bid.response', bidResp, meta);
    }

    // Meaning creation
    const meaning = this._meaning.analyze(text, this._prevText);
    if (meaning) this._emit('alk.rel.meaning.created', meaning, meta);

    // Decay
    const decay = this._decay.analyze();
    if (decay) {
      this._emit('alk.rel.decay.detected', decay, meta);
      if (decay.threshold === 'CRITICAL' || decay.threshold === 'WARNING') {
        this._emit('alk.rel.decay.threshold', { threshold: decay.threshold, score: decay.score }, meta);
      }
    }

    // Rupture
    const rupture = this._rupture.analyze(text, this._lastNSState, this._lastEmoState);
    if (rupture) {
      this._repair.markRupture();
      this._emit('alk.rel.rupture.detected', rupture, meta);
      if (rupture.severity === 'SEVERE') {
        this._emit('alk.rel.rupture.severity', { severity: 'SEVERE', score: rupture.score, rupture_type: rupture.rupture_type }, meta);
      }
    }

    // Repair
    const repair = this._repair.analyze(text, this._lastNSState);
    if (repair) this._emit('alk.rel.repair.attempt', repair, meta);

    // Trajectory update
    this._updateTrajectory(meaning, decay, rupture, repair);

    this._prevText = text;
  }

  _updateTrajectory(meaning, decay, rupture, repair) {
    let vector = 0; // -1 = retreating, +1 = deepening

    if (meaning)  vector += meaning.score * 0.4;
    if (decay)    vector -= decay.score   * 0.4;
    if (rupture)  vector -= rupture.score * 0.6;
    if (repair)   vector += repair.score  * 0.3;

    // ICM contribution
    if (this._lastICMState?.mode === 'EMERGENCE') vector += 0.3;
    if (this._lastICMState?.coEntropy > 0.7)      vector -= 0.3;

    this._trajectoryW.push(clamp(vector, -1, 1));
    const avg = this._trajectoryW.avg();

    const prev = this._trajectory;
    this._trajectory = avg > 0.25   ? REL_TRAJECTORY.DEEPENING
      : avg < -0.5 && rupture        ? REL_TRAJECTORY.RUPTURING
      : avg < -0.3 && repair         ? REL_TRAJECTORY.REPAIRING
      : avg < -0.5                   ? REL_TRAJECTORY.RETREATING
      : avg < -0.15                  ? REL_TRAJECTORY.FLATTENING
      : REL_TRAJECTORY.STABLE;

    if (this._trajectory !== prev) {
      this._emit('alk.rel.trajectory.update', {
        from:       prev,
        to:         this._trajectory,
        vector:     r4(avg),
        confidence: conf(Math.abs(avg)),
      });
    }
  }

  _onPulse() {
    this._frame++;
    if (this._frame % 30 !== 0) return;
    const now = Date.now();
    if (now - this._lastSummary > this._SUMMARY_INTERVAL_MS) {
      this._emitSummary();
      this._lastSummary = now;
    }
    // Periodic meaning deflation check
    const defl = this._meaning.detectDeflation();
    if (defl) this._emit('alk.rel.meaning.deflated', defl);
  }

  _emitSummary() {
    this._emit('alk.rel.summary', {
      sessionId:      this._session,
      trajectory:     this._trajectory,
      meaning_charge: r4(this._meaning.charge),
      decay_score:    r4(this._decay.decayScore),
      rupture_active: this._rupture.active,
      rupture_severity: r4(this._rupture.severity),
      repair_attempts:  this._repair.attempts,
      bid_rate:         r4(this._bid.bidRate),
      bid_response_rate:r4(this._bid.responseRate),
    });
  }

  health() {
    return {
      ...super.health(),
      trajectory:   this._trajectory,
      decay_score:  r4(this._decay.decayScore),
      rupture:      { active: this._rupture.active, severity: r4(this._rupture.severity) },
      meaning:      { charge: r4(this._meaning.charge), finds: this._meaning.sessionFinds },
      bids:         { total: this._bid.sessionBids, response_rate: r4(this._bid.responseRate) },
    };
  }
}

export default { RelationalModule, RELATIONAL_VERSION, RELATIONAL_UUID };
