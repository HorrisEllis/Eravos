/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  ALK HUMAN TRANSLATION LAYER  ·  htl.js  ·  v1.0.0                    ║
 * ║  UUID: alk-htl-0000-2000-0000-000000000001                             ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * 12 modules. One file. All buildable now.
 *
 * NS-01   NervousSystemModule      polyvagal state, window of tolerance
 * EMO-02  EmotionalSystemsModule   Panksepp's 7 primary affect circuits
 * COG-03  CognitiveArchModule      process order, channel, scope, orientation
 * NEED-04 NeedsIntentModule        NVC needs + intent inference
 * VAL-05  ValuesBeliefsModule      Haidt moral foundations + belief frames
 * ATT-06  AttachmentModule         attachment pattern + intimacy tolerance
 * MOD-07  ModalitiesModule         love languages + learning styles
 * LANG-08 LanguageCultureModule    cultural calibration + emotional vocabulary
 * SOM-09  SomaticSemanticModule    body↔words bridge + gap detection
 * GAP-10  GapTaxonomyModule        9 silence types + timing deltas
 * XLAT-11 HumanTranslatorModule    translation output synthesis
 * REL-12  RelationshipModule       dyad model + demand-withdraw cycle
 *
 * §1.1 — All outputs labeled as signal, not diagnosis.
 * §1.2 — All errors loud. Zero silent failures.
 * §4.3 — No PII. Behavioral signals only.
 * §5.5 — No external dependencies.
 * §5.7 — All I/O via kernel bus only.
 *
 * Bus interface (same as all ALK modules):
 *   bus.on(channel, handler)
 *   bus.emit(channel, payload)
 *
 * Usage:
 *   import { createHTL } from './htl.js';
 *   const htl = createHTL({ bus: kernel });
 *   htl.start();
 */

'use strict';

export const HTL_VERSION = '1.0.0';
export const HTL_UUID    = 'alk-htl-0000-2000-0000-000000000001';

// ─── Shared utilities ─────────────────────────────────────────────────────────

function r4(n) { return Math.round((n ?? 0) * 10000) / 10000; }

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function mean(arr) {
  if (!arr.length) return 0;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

function tokenize(text) {
  return text.toLowerCase().replace(/[^a-z0-9'\s]/g, '').split(/\s+/).filter(Boolean);
}

class SlidingWindow {
  constructor(maxLen) { this._buf = []; this._max = maxLen; }
  push(v)    { this._buf.push(v); if (this._buf.length > this._max) this._buf.shift(); }
  get vals() { return this._buf; }
  get len()  { return this._buf.length; }
  avg()      { return this._buf.length ? mean(this._buf) : 0; }
  last()     { return this._buf[this._buf.length - 1] ?? null; }
  min()      { return this._buf.length ? Math.min(...this._buf) : 0; }
  max()      { return this._buf.length ? Math.max(...this._buf) : 0; }
  clear()    { this._buf = []; }
}

const CONF = Object.freeze({ HIGH: 'HIGH', MEDIUM: 'MEDIUM', LOW: 'LOW' });

function confScore(v, hiThresh = 0.65, medThresh = 0.35) {
  return v >= hiThresh ? CONF.HIGH : v >= medThresh ? CONF.MEDIUM : CONF.LOW;
}

// ─── NS-01 · Nervous System Module ───────────────────────────────────────────

export const NS_UUID    = 'alk-htl-ns01-2000-0000-000000000010';
export const NS_VERSION = '1.0.0';

// Polyvagal state thresholds
const NS_THRESHOLDS = Object.freeze({
  SYMPATHETIC_AROUSAL:  0.65,   // arousal above → sympathetic candidate
  DORSAL_AROUSAL:       0.18,   // arousal below + expression flat → dorsal
  DORSAL_COHERENCE:     0.28,   // coherence below → dorsal candidate
  DORSAL_ENERGY:        0.025,  // audio energy below → dorsal candidate
  WINDOW_HYPER:         0.72,   // arousal above → above window
  WINDOW_HYPO:          0.20,   // arousal below + coherence low → below window
  FAWN_SUPPRESSION:     0.60,   // suppression above while sympathetic → fawn
  FREEZE_COHERENCE:     0.22,   // coherence collapse during sympathetic
});

export class NervousSystemModule {
  static UUID    = NS_UUID;
  static VERSION = NS_VERSION;

  constructor({ bus } = {}) {
    this._bus = bus;

    // State from upstream modules
    this._arousal     = 0;
    this._suppression = 0;
    this._coherence   = 0.5;
    this._energy      = 0;          // audio energy
    this._expressionAmp = 0.5;      // expression amplitude (0=collapsed, 1=full)

    // Active cues from video
    this._activeCues  = new Set();

    // Temporal tracking
    this._arousalWindow     = new SlidingWindow(30);  // ~1s at 30fps
    this._coherenceWindow   = new SlidingWindow(30);
    this._energyWindow      = new SlidingWindow(50);

    // State history for trend detection
    this._stateHistory      = new SlidingWindow(60);  // ~2s
    this._prevState         = null;

    // Frame counter
    this._frame = 0;
  }

  // ── Bus wiring ──────────────────────────────────────────────────────────────

  start() {
    const b = this._bus;
    b.on('alk.latent.update', ev => {
      const p = ev.payload ?? ev;
      this._arousal     = p.arousal     ?? this._arousal;
      this._suppression = p.suppression ?? this._suppression;
      this._coherence   = p.coherence   ?? this._coherence;
      this._arousalWindow.push(this._arousal);
      this._coherenceWindow.push(this._coherence);
    });
    b.on('alk.verbal.analysis.tone', ev => {
      const p = ev.payload ?? ev;
      this._energy = p.energy ?? this._energy;
      this._energyWindow.push(this._energy);
    });
    b.on('alk.video.cue.detected', ev => {
      this._activeCues.add((ev.payload ?? ev).cue);
    });
    b.on('alk.video.cue.released', ev => {
      this._activeCues.delete((ev.payload ?? ev).cue);
    });
    b.on('alk.expression.state', ev => {
      const p = ev.payload ?? ev;
      // Expression amplitude: mean of top blendshape scores
      const scores = Object.values(p.scores ?? {}).filter(Number.isFinite);
      this._expressionAmp = scores.length ? mean(scores) : this._expressionAmp;
    });

    // Emit state every 10 frames
    b.on('alk.kernel.pulse', () => this._tick());
  }

  _tick() {
    this._frame++;
    if (this._frame % 10 !== 0) return;

    const state = this._computeState();
    this._stateHistory.push(state.polyvagalState);

    if (state.polyvagalState !== this._prevState) {
      this._bus.emit('alk.htl.ns.shift', {
        from: this._prevState,
        to:   state.polyvagalState,
        windowZone: state.windowZone,
      });
      if (state.polyvagalState === 'DORSAL') {
        this._bus.emit('alk.htl.ns.offline', state);
      }
    }
    this._prevState = state.polyvagalState;
    this._bus.emit('alk.htl.ns.state', state);
  }

  _computeState() {
    const ar  = this._arousalWindow.avg();
    const coh = this._coherenceWindow.avg();
    const en  = this._energyWindow.avg();
    const sup = this._suppression;

    // Dorsal vagal: low arousal, low coherence, low energy, expression flat
    const dorsalScore =
      (ar   < NS_THRESHOLDS.DORSAL_AROUSAL  ? 0.4 : 0) +
      (coh  < NS_THRESHOLDS.DORSAL_COHERENCE ? 0.3 : 0) +
      (en   < NS_THRESHOLDS.DORSAL_ENERGY    ? 0.2 : 0) +
      (this._expressionAmp < 0.15            ? 0.1 : 0);

    // Sympathetic: high arousal
    const sympatheticScore = ar > NS_THRESHOLDS.SYMPATHETIC_AROUSAL ? ar : 0;

    // Fawn: sympathetic + high suppression (mask on top of activation)
    const fawnScore = sympatheticScore > 0 && sup > NS_THRESHOLDS.FAWN_SUPPRESSION
      ? (sympatheticScore + sup) / 2 : 0;

    // Freeze: sympathetic activation but coherence collapsed
    const freezeScore = sympatheticScore > 0 && coh < NS_THRESHOLDS.FREEZE_COHERENCE
      ? sympatheticScore : 0;

    // Determine state
    let polyvagalState, confidence;
    if (dorsalScore > 0.6) {
      polyvagalState = 'DORSAL'; confidence = r4(dorsalScore);
    } else if (freezeScore > 0.5) {
      polyvagalState = 'FREEZE'; confidence = r4(freezeScore);
    } else if (fawnScore > 0.55) {
      polyvagalState = 'FAWN'; confidence = r4(fawnScore);
    } else if (sympatheticScore > 0) {
      polyvagalState = 'SYMPATHETIC'; confidence = r4(sympatheticScore);
    } else {
      polyvagalState = 'VENTRAL'; confidence = r4(1 - ar);
    }

    // Window of tolerance
    let windowZone, windowPosition;
    if (ar > NS_THRESHOLDS.WINDOW_HYPER) {
      windowZone = 'HYPER'; windowPosition = r4(clamp((ar - 0.72) / 0.28, 0, 1));
    } else if (ar < NS_THRESHOLDS.WINDOW_HYPO && coh < 0.35) {
      windowZone = 'HYPO';  windowPosition = r4(-clamp((0.2 - ar) / 0.2, 0, 1));
    } else {
      windowZone = 'WINDOW'; windowPosition = r4((ar - 0.46) / 0.26); // centered
    }

    // Trend: is arousal rising or falling?
    const arVals = this._arousalWindow.vals;
    const arTrend = arVals.length >= 6
      ? (mean(arVals.slice(-3)) > mean(arVals.slice(0, 3)) ? 'rising' : 'falling')
      : 'stable';

    // Capacity: how much cognitive/emotional processing is available
    const capacity = r4(polyvagalState === 'VENTRAL' ? 0.8 + coh * 0.2
      : polyvagalState === 'DORSAL' ? 0.05
      : polyvagalState === 'FREEZE' ? 0.1
      : clamp(1 - ar, 0.1, 0.6));

    const regulation = capacity > 0.6  ? 'self-regulating'
      : capacity > 0.25 ? 'needs-co-regulation'
      : 'offline';

    return {
      polyvagalState,
      windowZone,
      windowPosition,
      capacity,
      trend: arTrend,
      regulationEst: regulation,
      confidence,
      // §1.1
      evidence: [
        `arousal=${r4(ar)}`,
        `coherence=${r4(coh)}`,
        `energy=${r4(en)}`,
        `suppression=${r4(sup)}`,
        `expressionAmp=${r4(this._expressionAmp)}`,
      ],
    };
  }

  // Public access for downstream modules
  get state() { return this._computeState(); }
}

// ─── EMO-02 · Emotional Systems Module ───────────────────────────────────────

export const EMO_UUID    = 'alk-htl-em02-2000-0000-000000000020';
export const EMO_VERSION = '1.0.0';

// Panksepp's 7 primary affect systems
export const EMO_SYSTEMS = Object.freeze({
  SEEKING:    'SEEKING',     // curiosity, drive, wanting
  RAGE:       'RAGE',        // frustration, anger
  FEAR:       'FEAR',        // anxiety, dread, threat
  CARE:       'CARE',        // nurturance, warmth, love
  GRIEF:      'GRIEF',       // separation distress, panic
  LUST:       'LUST',        // (proxy only — see §1.1)
  PLAY:       'PLAY',        // joyful engagement, humor
});

// Known system interactions
const EMO_INTERACTIONS = Object.freeze({
  'SEEKING+FEAR':  'approach_avoidance',   // anxiety — wants to move forward but scared
  'RAGE+GRIEF':    'betrayal_grief',        // profound betrayal or complicated loss
  'CARE+GRIEF':    'love_grief',            // grief for someone still loved
  'RAGE+FEAR':     'conflict_cycle',        // Gottman criticism/defensiveness
  'PLAY+CARE':     'open_connected',        // optimal window for difficult conversation
  'FEAR+GRIEF':    'abandoned_terror',      // disorganized attachment activation
});

export class EmotionalSystemsModule {
  static UUID    = EMO_UUID;
  static VERSION = EMO_VERSION;

  constructor({ bus, ns } = {}) {
    this._bus = bus;
    this._ns  = ns;  // NervousSystemModule reference

    // Per-system activation scores [0,1]
    this._scores = Object.fromEntries(Object.keys(EMO_SYSTEMS).map(k => [k, 0]));

    // Smoothing windows per system
    this._windows = Object.fromEntries(
      Object.keys(EMO_SYSTEMS).map(k => [k, new SlidingWindow(20)])
    );

    // Current face cues
    this._faceCues     = new Set();
    this._sentiment    = 0;
    this._arousal      = 0;
    this._energy       = 0;
    this._engagement   = 0;
    this._fricDensity  = 0;
    this._laughter     = false;

    this._frame = 0;
  }

  start() {
    const b = this._bus;
    b.on('alk.latent.update', ev => {
      const p = ev.payload ?? ev;
      this._arousal    = p.arousal    ?? 0;
      this._engagement = p.engagement ?? 0;
    });
    b.on('alk.verbal.analysis.sentiment', ev => {
      this._sentiment = (ev.payload ?? ev).score ?? 0;
    });
    b.on('alk.verbal.analysis.tone', ev => {
      this._energy = (ev.payload ?? ev).energy ?? 0;
    });
    b.on('alk.video.cue.detected', ev => {
      this._faceCues.add((ev.payload ?? ev).cue);
    });
    b.on('alk.video.cue.released', ev => {
      this._faceCues.delete((ev.payload ?? ev).cue);
    });
    b.on('alk.verbal.transcript', ev => {
      this._fricDensity = (ev.payload ?? ev).friction?.density ?? this._fricDensity;
    });
    b.on('alk.kernel.pulse', () => this._tick());
  }

  _tick() {
    this._frame++;
    if (this._frame % 15 !== 0) return;

    const scores = this._computeScores();
    const result = this._buildResult(scores);
    this._bus.emit('alk.htl.emo.state', result);
  }

  _computeScores() {
    const fc = this._faceCues;
    const ar = this._arousal;
    const en = this._engagement;
    const s  = this._sentiment;
    const e  = this._energy;

    return {
      // SEEKING: arousal rising + engagement positive + forward lean + new topics
      SEEKING: clamp(
        (ar > 0.4 ? ar * 0.4 : 0) +
        (en > 0.2 ? en * 0.35 : 0) +
        (fc.has('lean_forward') ? 0.15 : 0) +
        (s > 0.3 ? s * 0.1 : 0), 0, 1),

      // RAGE: high arousal + contempt/jaw + shoulder asymmetry + friction
      RAGE: clamp(
        (ar > 0.7 ? (ar - 0.7) * 2 : 0) +
        (fc.has('jaw_clench')           ? 0.2 : 0) +
        (fc.has('contempt_micro')       ? 0.25 : 0) +
        (fc.has('shoulder_asymmetry')   ? 0.1 : 0) +
        (this._fricDensity > 0.3        ? this._fricDensity * 0.15 : 0), 0, 1),

      // FEAR: fear micro + gaze aversion + brow raise + shoulder raise
      FEAR: clamp(
        (fc.has('fear_micro')           ? 0.4 : 0) +
        (fc.has('gaze_aversion')        ? 0.2 : 0) +
        (fc.has('brow_raise')           ? 0.15 : 0) +
        (fc.has('shoulder_raise')       ? 0.15 : 0) +
        (ar > 0.5 && en < -0.1         ? ar * 0.1 : 0), 0, 1),

      // CARE: genuine smile + forward lean + voice softening + positive sentiment
      CARE: clamp(
        (fc.has('smile_genuine')        ? 0.35 : 0) +
        (fc.has('lean_forward')         ? 0.2 : 0) +
        (s > 0.4                        ? s * 0.25 : 0) +
        (e > 0 && e < 0.4              ? 0.1 : 0), 0, 1),

      // GRIEF: sadness expression + inward gaze + self-touch + negative sentiment
      GRIEF: clamp(
        (fc.has('gaze_down')            ? 0.25 : 0) +
        (fc.has('self_touch_face')      ? 0.15 : 0) +
        (s < -0.3                       ? Math.abs(s) * 0.3 : 0) +
        (ar < 0.3 && en < -0.2         ? 0.2 : 0), 0, 1),

      // LUST: proxy only — warmth + sustained contact. §1.1: labeled as closeness-seeking only.
      LUST: 0, // not inferred without explicit consent framing

      // PLAY: laughter energy pattern + genuine smile + rhythm variation + positive
      PLAY: clamp(
        (fc.has('smile_genuine')        ? 0.2 : 0) +
        (e > 0.5 && s > 0.5            ? 0.3 : 0) +  // energy + positive = laughter proxy
        (s > 0.6                        ? s * 0.2 : 0) +
        (fc.has('lean_forward')         ? 0.1 : 0), 0, 1),
    };
  }

  _buildResult(raw) {
    // Smooth each system
    for (const [k, v] of Object.entries(raw)) {
      this._windows[k].push(v);
      this._scores[k] = r4(this._windows[k].avg());
    }

    // Find active systems (score > 0.2) and dominant
    const active = Object.entries(this._scores)
      .filter(([, v]) => v > 0.2)
      .sort(([, a], [, b]) => b - a);

    const dominant = active[0]?.[0] ?? null;
    const activeKeys = active.map(([k]) => k);

    // Detect interaction patterns
    let interaction = null;
    for (const [pair, name] of Object.entries(EMO_INTERACTIONS)) {
      const [a, b] = pair.split('+');
      if (activeKeys.includes(a) && activeKeys.includes(b)) {
        interaction = name; break;
      }
    }

    // Blocked systems: FEAR blocks SEEKING; shame (suppression) blocks RAGE
    const blocked = [];
    if (this._scores.FEAR > 0.4 && raw.SEEKING > 0.3) blocked.push('SEEKING');

    const confidence = r4(dominant ? this._scores[dominant] : 0);

    return {
      scores:      this._scores,
      active:      activeKeys,
      dominant,
      interaction,
      blocked,
      confidence,
      // §1.1
      evidence: [`dominant=${dominant}`, `active=[${activeKeys.join(',')}]`,
                 `arousal=${r4(this._arousal)}`, `engagement=${r4(this._engagement)}`],
    };
  }

  get scores() { return { ...this._scores }; }
}

// ─── COG-03 · Cognitive Architecture Module ───────────────────────────────────

export const COG_UUID    = 'alk-htl-cg03-2000-0000-000000000030';
export const COG_VERSION = '1.0.0';

// Process order vocabulary markers
const FEEL_FIRST_WORDS = new Set([
  'feel','felt','feeling','feels','hurt','hurts','scared','afraid','sad','angry',
  'upset','overwhelmed','heartbroken','devastated','terrified','anxious',
]);
const THINK_FIRST_WORDS = new Set([
  'think','thought','realize','understand','analyze','consider','evaluate','assess',
  'logically','rationally','objectively','conclude','determine','process',
]);
const BODY_FIRST_WORDS = new Set([
  'body','gut','chest','throat','stomach','shoulders','hands','breath','breathe',
  'tense','tight','heavy','light','numb','buzzing','shaking','trembling',
]);

export class CognitiveArchModule {
  static UUID    = COG_UUID;
  static VERSION = COG_VERSION;

  constructor({ bus } = {}) {
    this._bus = bus;

    // Accumulated evidence across session
    this._feelFirstCount  = 0;
    this._thinkFirstCount = 0;
    this._bodyFirstCount  = 0;
    this._totalUtterances = 0;

    // Verbal vs somatic channel
    this._verbalRate      = 0;  // words/minute when speaking
    this._pauseDurations  = new SlidingWindow(20);

    // Scope: sequential vs holistic
    this._topicJumps      = 0;  // semantic edge count
    this._topicWindows    = 0;  // total windows observed

    // Orientation: internal vs external (pauses → internal; talk-while-think → external)
    this._longPauses      = 0;  // pauses > 3s before substantive response
    this._selfCorrections = 0;  // real-time revision count

    // Thinking type
    this._hedgeDensityW   = new SlidingWindow(20);
    this._questionDensityW = new SlidingWindow(20);
    this._conditionalW    = new SlidingWindow(20);

    this._lastProfile = null;
  }

  start() {
    const b = this._bus;
    b.on('alk.verbal.transcript', ev => this._onTranscript(ev.payload ?? ev));
    b.on('alk.geometry.edge',     () => { this._topicJumps++; this._topicWindows++; });
    b.on('alk.htl.gap.detected',  ev => {
      const t = (ev.payload ?? ev).type;
      if (t === 'PROCESSING_TIME') this._longPauses++;
    });
    b.on('alk.session.capture.stop', () => this._emitProfile());
    // Emit partial profile every 5 transcript batches
    this._transcriptCount = 0;
  }

  _onTranscript(p) {
    const text  = p.text ?? '';
    const words = tokenize(text);
    if (!words.length) return;

    this._totalUtterances++;
    this._transcriptCount = (this._transcriptCount ?? 0) + 1;

    // Process order detection (first 5 words are most diagnostic)
    const head = words.slice(0, 8);
    const feelHits  = head.filter(w => FEEL_FIRST_WORDS.has(w)).length;
    const thinkHits = head.filter(w => THINK_FIRST_WORDS.has(w)).length;
    const bodyHits  = head.filter(w => BODY_FIRST_WORDS.has(w)).length;

    if (feelHits > thinkHits && feelHits > bodyHits)  this._feelFirstCount++;
    else if (bodyHits >= thinkHits)                    this._bodyFirstCount++;
    else if (thinkHits > 0)                            this._thinkFirstCount++;

    // Self-corrections (verbal channel marker)
    const selfCorr = /\bi mean\b|\bactually\b|\bwait\b|\bno,?\s+(i mean|actually)\b/.test(text);
    if (selfCorr) this._selfCorrections++;

    // Verbal rate proxy from word count (normalised)
    this._verbalRate = words.length; // raw; actual rate needs duration

    // Hedge / question / conditional density
    const hedges     = words.filter(w => /\b(maybe|perhaps|might|could|sort of|kind of|probably|possibly|somewhat)\b/.test(w)).length;
    const questions  = (text.match(/\?/g) || []).length;
    const conditionals = words.filter(w => /\b(if|unless|assuming|provided|suppose|imagine)\b/.test(w)).length;
    this._hedgeDensityW.push(hedges / words.length);
    this._questionDensityW.push(questions / Math.max(1, words.length / 10));
    this._conditionalW.push(conditionals / words.length);

    if (this._transcriptCount % 5 === 0) this._emitProfile();
  }

  _emitProfile() {
    if (this._totalUtterances < 3) return;

    const tot = this._feelFirstCount + this._thinkFirstCount + this._bodyFirstCount || 1;
    const processOrder =
      this._bodyFirstCount / tot > 0.4  ? 'BODY_FIRST'
      : this._feelFirstCount / tot > 0.4 ? 'FEEL_FIRST'
      : 'THINK_FIRST';

    const orientation = this._selfCorrections > this._longPauses * 2
      ? 'EXTERNAL' : 'INTERNAL';

    const scope = this._topicWindows > 0 && this._topicJumps / this._topicWindows > 0.4
      ? 'HOLISTIC' : 'SEQUENTIAL';

    const hedgeAvg = this._hedgeDensityW.avg();
    const qAvg     = this._questionDensityW.avg();
    const condAvg  = this._conditionalW.avg();

    const convergent  = r4(clamp(1 - hedgeAvg * 5 - qAvg * 0.5, 0, 1));
    const abstract    = r4(clamp(condAvg * 8 + qAvg * 0.3, 0, 1));
    const systematic  = r4(clamp(condAvg * 6 - hedgeAvg * 3, 0, 1));

    const profile = {
      processOrder,
      channel:     this._selfCorrections > 3 ? 'VERBAL' : 'UNKNOWN',
      scope,
      orientation,
      thinking:    { convergent, abstract, systematic },
      confidence:  confScore(this._totalUtterances / 20), // grows with data
      sessionEvidence: [
        `utterances=${this._totalUtterances}`,
        `feelFirst=${this._feelFirstCount}`,
        `thinkFirst=${this._thinkFirstCount}`,
        `bodyFirst=${this._bodyFirstCount}`,
        `longPauses=${this._longPauses}`,
        `selfCorrections=${this._selfCorrections}`,
      ],
    };

    this._lastProfile = profile;
    this._bus.emit('alk.htl.cog.profile', profile);
  }

  get profile() { return this._lastProfile; }
}

// ─── NEED-04 · Needs + Intent Module ─────────────────────────────────────────

export const NEED_UUID    = 'alk-htl-nd04-2000-0000-000000000040';
export const NEED_VERSION = '1.0.0';

export const NEEDS = Object.freeze({
  SAFETY:          'SAFETY',
  CONNECTION:      'CONNECTION',
  AUTONOMY:        'AUTONOMY',
  UNDERSTANDING:   'UNDERSTANDING',
  CONTRIBUTION:    'CONTRIBUTION',
  RESPECT:         'RESPECT',
  PLAY:            'PLAY',
  AUTHENTICITY:    'AUTHENTICITY',
  MOURNING:        'MOURNING',
  INTERDEPENDENCE: 'INTERDEPENDENCE',
});

export const INTENTS = Object.freeze({
  SEEKING_CONNECTION:   'SEEKING_CONNECTION',
  SEEKING_UNDERSTANDING:'SEEKING_UNDERSTANDING',
  SEEKING_VALIDATION:   'SEEKING_VALIDATION',
  SEEKING_SAFETY:       'SEEKING_SAFETY',
  SEEKING_AUTONOMY:     'SEEKING_AUTONOMY',
  SEEKING_SPACE:        'SEEKING_SPACE',
  SEEKING_REPAIR:       'SEEKING_REPAIR',
  EXPRESSING_PAIN:      'EXPRESSING_PAIN',
  PROTECTING_SELF:      'PROTECTING_SELF',
  TESTING:              'TESTING',
});

// Need vocabulary lexicon
const NEED_VOCAB = {
  SAFETY:        /\b(safe|unsafe|scared|afraid|worried|threat|danger|protect)\b/,
  CONNECTION:    /\b(alone|lonely|miss|together|close|distance|abandon|left)\b/,
  AUTONOMY:      /\b(control|choice|decide|my own|let me|stop telling|space)\b/,
  UNDERSTANDING: /\b(understand|get me|listen|hear me|see me|matter|invisible)\b/,
  RESPECT:       /\b(respect|dignity|fair|unfair|dismiss|ignore|belittle|value)\b/,
  MOURNING:      /\b(grieve|loss|gone|miss|mourn|wish it were|used to)\b/,
};

const REPAIR_VOCAB = /\b(sorry|apologize|my fault|start over|i love you|didn't mean|forgive|can we)\b/i;

export class NeedsIntentModule {
  static UUID    = NEED_UUID;
  static VERSION = NEED_VERSION;

  constructor({ bus, emo, ns } = {}) {
    this._bus = bus;
    this._emo = emo;
    this._ns  = ns;

    this._recentText  = [];
    this._repairCount = 0;
    this._escalCount  = 0;
    this._lastEmoState = null;
    this._lastNSState  = null;
  }

  start() {
    const b = this._bus;
    b.on('alk.verbal.transcript', ev => this._onTranscript(ev.payload ?? ev));
    b.on('alk.htl.emo.state',     ev => { this._lastEmoState = ev.payload ?? ev; });
    b.on('alk.htl.ns.state',      ev => { this._lastNSState  = ev.payload ?? ev; });
    b.on('alk.behavior.escalation', () => this._escalCount++);
  }

  _onTranscript(p) {
    const text = p.text ?? '';
    this._recentText.push(text);
    if (this._recentText.length > 10) this._recentText.shift();

    if (REPAIR_VOCAB.test(text)) this._repairCount++;

    const result = this._infer(text);
    if (result) this._bus.emit('alk.htl.need.state', result);
  }

  _infer(text) {
    const emo  = this._lastEmoState;
    const ns   = this._lastNSState;
    const joined = this._recentText.join(' ');

    // Active needs from emotional system
    const active = [];
    const unmet  = [];

    if (emo?.dominant === 'GRIEF')    { active.push(NEEDS.CONNECTION); unmet.push(NEEDS.CONNECTION); }
    if (emo?.dominant === 'FEAR')     { active.push(NEEDS.SAFETY);     unmet.push(NEEDS.SAFETY); }
    if (emo?.dominant === 'RAGE')     { active.push(NEEDS.RESPECT);    unmet.push(NEEDS.RESPECT); }
    if (emo?.dominant === 'SEEKING')  { active.push(NEEDS.UNDERSTANDING); }
    if (emo?.dominant === 'CARE')     { active.push(NEEDS.INTERDEPENDENCE); }

    // Lexical need detection
    for (const [need, re] of Object.entries(NEED_VOCAB)) {
      if (re.test(joined) && !active.includes(need)) active.push(need);
    }

    // Intent inference
    let intent;
    const nsZone  = ns?.windowZone ?? 'WINDOW';
    const nsState = ns?.polyvagalState ?? 'VENTRAL';

    if (REPAIR_VOCAB.test(text))              intent = INTENTS.SEEKING_REPAIR;
    else if (nsState === 'DORSAL')            intent = INTENTS.SEEKING_SPACE;
    else if (nsZone === 'HYPER' && this._escalCount > 2) intent = INTENTS.PROTECTING_SELF;
    else if (emo?.dominant === 'GRIEF')       intent = INTENTS.SEEKING_CONNECTION;
    else if (emo?.dominant === 'FEAR')        intent = INTENTS.SEEKING_SAFETY;
    else if (emo?.dominant === 'RAGE')        intent = INTENTS.EXPRESSING_PAIN;
    else if (/\?/.test(text) && joined.split('?').length > 3) intent = INTENTS.TESTING;
    else                                      intent = INTENTS.SEEKING_UNDERSTANDING;

    return {
      active, unmet,
      suppressed: [],  // future: cross-reference suppression module
      intent,
      strategy:   nsState === 'SYMPATHETIC' ? 'escalation'
                : nsState === 'DORSAL'      ? 'withdrawal'
                : 'direct-expression',
      confidence: confScore(active.length / 3),
      evidence:   [`dominant_emo=${emo?.dominant}`, `ns=${nsState}`, `repairs=${this._repairCount}`],
    };
  }
}

// ─── VAL-05 · Values + Beliefs Module ────────────────────────────────────────

export const VAL_UUID    = 'alk-htl-vl05-2000-0000-000000000050';
export const VAL_VERSION = '1.0.0';

const VAL_LEXICONS = {
  CARE:        /\b(hurt|harm|suffering|pain|vulnerable|protect|compassion|empathy)\b/i,
  FAIRNESS:    /\b(fair|unfair|equal|deserve|rights|justice|betray|reciproc)\b/i,
  LOYALTY:     /\b(loyal|betray|side|team|us|we|together|commitment|solidarity)\b/i,
  AUTHORITY:   /\b(rules|authority|legitimate|proper|hierarchy|respect|order|tradition)\b/i,
  SANCTITY:    /\b(wrong|immoral|disgust|pure|sacred|violat|corrupt|degrad)\b/i,
  AUTONOMY:    /\b(choice|freedom|my body|my decision|control|paternali|independ)\b/i,
  AUTHENTICITY:/\b(honest|real|genuine|fake|pretend|authentic|true|mask)\b/i,
};

export class ValuesBeliefsModule {
  static UUID    = VAL_UUID;
  static VERSION = VAL_VERSION;

  constructor({ bus } = {}) {
    this._bus = bus;
    this._scores   = Object.fromEntries(Object.keys(VAL_LEXICONS).map(k => [k, 0]));
    this._windows  = Object.fromEntries(Object.keys(VAL_LEXICONS).map(k => [k, new SlidingWindow(30)]));
    this._totalUtterances = 0;
    // Belief frame
    this._absolutistW = new SlidingWindow(20);
    this._conditionalW = new SlidingWindow(20);
  }

  start() {
    const b = this._bus;
    b.on('alk.verbal.transcript', ev => this._onTranscript(ev.payload ?? ev));
    b.on('alk.session.capture.stop', () => this._emitProfile());
    this._count = 0;
  }

  _onTranscript(p) {
    const text = p.text ?? '';
    if (!text) return;
    this._totalUtterances++;
    this._count = (this._count ?? 0) + 1;

    for (const [val, re] of Object.entries(VAL_LEXICONS)) {
      const hits = (text.match(re) || []).length;
      this._windows[val].push(hits / Math.max(1, tokenize(text).length) * 10);
    }

    // Absolutist language (sanctity, certainty)
    const absolutist = /\b(always|never|everyone|no one|obviously|clearly|definitely|must|wrong)\b/i.test(text);
    this._absolutistW.push(absolutist ? 1 : 0);

    // Conditional language (nuance, context-sensitivity)
    const conditional = /\b(depends|context|sometimes|it varies|could be|might|perhaps)\b/i.test(text);
    this._conditionalW.push(conditional ? 1 : 0);

    if (this._count % 8 === 0) this._emitProfile();
  }

  _emitProfile() {
    if (this._totalUtterances < 5) return;

    for (const k of Object.keys(this._scores)) {
      this._scores[k] = r4(this._windows[k].avg());
    }

    const sorted = Object.entries(this._scores).sort(([,a],[,b]) => b - a);
    const dominant = sorted.slice(0, 3).map(([k]) => k).filter(k => this._scores[k] > 0.05);

    const moralLanguage = {
      absolutist:      r4(this._absolutistW.avg()),
      consequentialist:r4(this._scores.CARE + this._scores.FAIRNESS) / 2,
      deontological:   r4(this._scores.SANCTITY + this._scores.AUTHORITY) / 2,
    };

    this._bus.emit('alk.htl.val.profile', {
      scores: { ...this._scores },
      dominant,
      triggers: [],  // populated by high-score spikes
      moralLanguage,
      confidence: confScore(this._totalUtterances / 15),
    });
  }
}

// ─── ATT-06 · Attachment Module ───────────────────────────────────────────────

export const ATT_UUID    = 'alk-htl-at06-2000-0000-000000000060';
export const ATT_VERSION = '1.0.0';

export const ATT_PATTERNS = Object.freeze({
  SECURE:       'SECURE',
  ANXIOUS:      'ANXIOUS',
  AVOIDANT:     'AVOIDANT',
  DISORGANIZED: 'DISORGANIZED',
});

const REPAIR_WORDS = new Set(['sorry','apologize','forgive','my fault','love you','mean to','start over']);
const PROTEST_WORDS = /\b(why won't you|you never|you always|don't care|don't matter|leaving me|abandon)\b/i;
const PURSUIT_WORDS = /\b(please respond|talk to me|answer me|where are you|come back|don't go)\b/i;

export class AttachmentModule {
  static UUID    = ATT_UUID;
  static VERSION = ATT_VERSION;

  constructor({ bus, ns, emo } = {}) {
    this._bus = bus;
    this._ns  = ns;
    this._emo = emo;

    // Behavioral signals
    this._repairAttempts   = 0;
    this._protestCount     = 0;
    this._pursuitCount     = 0;
    this._withdrawalCount  = 0;

    // Approach/withdrawal tracking
    this._engagementW      = new SlidingWindow(30);
    this._suppressionW     = new SlidingWindow(30);

    // Cue tracking
    this._activeCues       = new Set();

    // Intimacy tolerance
    this._intimacyW        = new SlidingWindow(20);

    // Pattern history
    this._patternHistory   = new SlidingWindow(40);

    this._lastNS  = null;
    this._lastEmo = null;
  }

  start() {
    const b = this._bus;
    b.on('alk.latent.update', ev => {
      const p = ev.payload ?? ev;
      this._engagementW.push(p.engagement ?? 0);
      this._suppressionW.push(p.suppression ?? 0);
    });
    b.on('alk.htl.ns.state',  ev => { this._lastNS  = ev.payload ?? ev; });
    b.on('alk.htl.emo.state', ev => { this._lastEmo = ev.payload ?? ev; });
    b.on('alk.verbal.transcript', ev => this._onTranscript(ev.payload ?? ev));
    b.on('alk.video.cue.detected', ev => this._activeCues.add((ev.payload ?? ev).cue));
    b.on('alk.video.cue.released', ev => this._activeCues.delete((ev.payload ?? ev).cue));
    b.on('alk.behavior.escalation', () => this._protestCount++);
    b.on('alk.kernel.pulse', () => this._tick());
  }

  _onTranscript(p) {
    const text = p.text ?? '';
    const words = tokenize(text);
    if (words.some(w => REPAIR_WORDS.has(w))) this._repairAttempts++;
    if (PROTEST_WORDS.test(text)) this._protestCount++;
    if (PURSUIT_WORDS.test(text)) this._pursuitCount++;
  }

  _tick() {
    const ns  = this._lastNS;
    const emo = this._lastEmo;

    const en  = this._engagementW.avg();
    const sup = this._suppressionW.avg();
    const fc  = this._activeCues;

    // Detect attachment pattern
    let pattern, confidence;

    // Disorganized: approach+withdrawal oscillating simultaneously
    const approaching  = en > 0.3 && fc.has('lean_forward');
    const withdrawing  = en < -0.2 && fc.has('lean_back');
    const coherCollapse = ns?.windowZone === 'HYPO' && emo?.active?.includes('FEAR');

    if (approaching && withdrawing && coherCollapse) {
      pattern = ATT_PATTERNS.DISORGANIZED; confidence = 0.6;
    }
    // Anxious: high pursuit + protest + GRIEF + approach motivation
    else if (this._pursuitCount > 2 || this._protestCount > 3) {
      pattern = ATT_PATTERNS.ANXIOUS;
      confidence = clamp(this._pursuitCount * 0.15 + this._protestCount * 0.1, 0, 1);
    }
    // Avoidant: high suppression + withdrawal + dorsal tendency
    else if (sup > 0.55 && en < -0.1 && ns?.polyvagalState !== 'VENTRAL') {
      pattern = ATT_PATTERNS.AVOIDANT; confidence = r4(sup);
    }
    // Secure: repair attempts present, engagement positive, within window
    else if (this._repairAttempts > 0 && en > 0 && ns?.windowZone === 'WINDOW') {
      pattern = ATT_PATTERNS.SECURE; confidence = 0.6;
    }
    else {
      pattern = ATT_PATTERNS.SECURE; confidence = 0.35; // default with low conf
    }

    // Intimacy tolerance: inverse of suppression when approaching
    const intimacy = r4(clamp(1 - sup - (fc.has('lean_back') ? 0.3 : 0), 0, 1));
    this._intimacyW.push(intimacy);
    this._patternHistory.push(pattern);

    this._bus.emit('alk.htl.att.state', {
      pattern,
      intimacyTolerance: r4(this._intimacyW.avg()),
      intimacyTrend:     en > 0 ? 'opening' : en < -0.1 ? 'closing' : 'stable',
      repairAttempts:    this._repairAttempts,
      coreFeature:       pattern === 'ANXIOUS'  ? 'abandonment_fear'
                       : pattern === 'AVOIDANT'  ? 'engulfment_fear'
                       : pattern === 'DISORGANIZED' ? 'approach_avoidance'
                       : 'secure_base',
      confidence:        r4(confidence),
      evidence: [
        `engagement=${r4(en)}`,
        `suppression=${r4(sup)}`,
        `repairs=${this._repairAttempts}`,
        `pursuit=${this._pursuitCount}`,
        `protest=${this._protestCount}`,
      ],
    });
  }
}

// ─── MOD-07 · Modalities Module ───────────────────────────────────────────────

export const MOD_UUID    = 'alk-htl-md07-2000-0000-000000000070';
export const MOD_VERSION = '1.0.0';

export const LOVE_LANGS = Object.freeze({
  WORDS:   'WORDS_OF_AFFIRMATION',
  ACTS:    'ACTS_OF_SERVICE',
  GIFTS:   'RECEIVING_GIFTS',
  TIME:    'QUALITY_TIME',
  TOUCH:   'PHYSICAL_TOUCH',
});

const AFFIRM_VOCAB  = /\b(thank you|appreciate|love how you|you're so|means a lot|grateful|proud of)\b/i;
const SERVICE_VOCAB = /\b(let me|i'll do|i'll handle|i took care|i made|i fixed|i prepared)\b/i;
const TOUCH_VOCAB   = /\b(hold|hug|touch|close|near me|next to me|physical)\b/i;
const TIME_VOCAB    = /\b(time with|be there|present|here for|focus on me|not distracted|undivided)\b/i;

export class ModalitiesModule {
  static UUID    = MOD_UUID;
  static VERSION = MOD_VERSION;

  constructor({ bus, cog } = {}) {
    this._bus = bus;
    this._cog = cog;

    this._affirmCount  = 0;
    this._serviceCount = 0;
    this._touchCount   = 0;
    this._timeCount    = 0;
    this._activeCues   = new Set();
    this._totalCount   = 0;
  }

  start() {
    const b = this._bus;
    b.on('alk.verbal.transcript', ev => this._onTranscript(ev.payload ?? ev));
    b.on('alk.video.cue.detected', ev => {
      const cue = (ev.payload ?? ev).cue;
      this._activeCues.add(cue);
      if (cue === 'lean_forward') this._touchCount += 0.5;
    });
    b.on('alk.video.cue.released', ev => this._activeCues.delete((ev.payload ?? ev).cue));
    b.on('alk.kernel.pulse', () => this._tick());
    this._frame = 0;
  }

  _onTranscript(p) {
    const text = p.text ?? '';
    if (AFFIRM_VOCAB.test(text))   this._affirmCount++;
    if (SERVICE_VOCAB.test(text))  this._serviceCount++;
    if (TOUCH_VOCAB.test(text))    this._touchCount++;
    if (TIME_VOCAB.test(text))     this._timeCount++;
    this._totalCount++;
  }

  _tick() {
    this._frame++;
    if (this._frame % 30 !== 0 || this._totalCount < 5) return;

    const scores = {
      [LOVE_LANGS.WORDS]:  this._affirmCount,
      [LOVE_LANGS.ACTS]:   this._serviceCount,
      [LOVE_LANGS.TOUCH]:  this._touchCount,
      [LOVE_LANGS.TIME]:   this._timeCount,
      [LOVE_LANGS.GIFTS]:  0,  // not inferable from audio/video alone
    };

    const sorted = Object.entries(scores).sort(([,a],[,b]) => b - a);
    const primaryGiving = sorted[0][0];

    // Receiving: harder to infer — use need patterns
    // Proxy: what they express lacking most often
    const primaryReceiving = primaryGiving; // default; REL-12 refines from partner interaction

    const cog = this._cog?.profile;
    const learningStyle =
      cog?.channel === 'VERBAL'           ? 'AUDITORY'
      : cog?.processOrder === 'BODY_FIRST' ? 'KINESTHETIC'
      : cog?.orientation === 'INTERNAL'    ? 'READ_WRITE'
      : 'VISUAL';

    this._bus.emit('alk.htl.mod.profile', {
      loveLanguage: {
        giving:    primaryGiving,
        receiving: primaryReceiving,
        mismatch:  false,   // REL-12 detects cross-person mismatch
      },
      learningStyle,
      processingStyle: cog?.processOrder ?? 'UNKNOWN',
      scores,
      confidence: confScore(this._totalCount / 10),
    });
  }
}

// ─── LANG-08 · Language + Culture Module ─────────────────────────────────────

export const LANG_UUID    = 'alk-htl-lg08-2000-0000-000000000080';
export const LANG_VERSION = '1.0.0';

// Cultural frame calibration values
const CULTURAL_FRAMES = Object.freeze({
  JAPANESE:         { expressionNorm:0.30, directnessNorm:0.20, prosodyAmp:1.00, silenceValence:+0.60, touchNorm:0.20, eyeContactNorm:0.35 },
  ARABIC:           { expressionNorm:0.90, directnessNorm:0.50, prosodyAmp:1.60, silenceValence:-0.20, touchNorm:0.70, eyeContactNorm:0.75 },
  SCANDINAVIAN:     { expressionNorm:0.40, directnessNorm:0.90, prosodyAmp:0.80, silenceValence:+0.40, touchNorm:0.30, eyeContactNorm:0.65 },
  LATIN_AMERICAN:   { expressionNorm:0.85, directnessNorm:0.55, prosodyAmp:1.40, silenceValence:-0.10, touchNorm:0.90, eyeContactNorm:0.80 },
  EAST_ASIAN:       { expressionNorm:0.35, directnessNorm:0.20, prosodyAmp:0.90, silenceValence:+0.30, touchNorm:0.25, eyeContactNorm:0.35 },
  ANGLO_AMERICAN:   { expressionNorm:0.65, directnessNorm:0.80, prosodyAmp:1.00, silenceValence:-0.30, touchNorm:0.45, eyeContactNorm:0.70 },
  DEFAULT:          { expressionNorm:0.65, directnessNorm:0.70, prosodyAmp:1.00, silenceValence:-0.20, touchNorm:0.50, eyeContactNorm:0.65 },
});

// Language detection from vocabulary patterns (very basic — first-pass)
const LANG_MARKERS = {
  JAPANESE:       /\b(desu|masu|san|kun|chan|ne|yo|ka)\b/i,
  ARABIC:         /[\u0600-\u06FF]/,
  SCANDINAVIAN:   /\b(och|eller|men|att|som|det|är|ikke|og|jeg)\b/i,
  LATIN_AMERICAN: /\b(pero|porque|como|también|muy|bien|sí|gracias)\b/i,
};

export class LanguageCultureModule {
  static UUID    = LANG_UUID;
  static VERSION = LANG_VERSION;

  constructor({ bus } = {}) {
    this._bus          = bus;
    this._detectedLang = null;
    this._frame        = Object.assign({}, CULTURAL_FRAMES.DEFAULT);
    this._textSamples  = [];
    this._calibrationApplied = false;
  }

  start() {
    const b = this._bus;
    b.on('alk.verbal.transcript', ev => this._onTranscript(ev.payload ?? ev));
  }

  _onTranscript(p) {
    const text = p.text ?? '';
    if (!text) return;

    this._textSamples.push(text);
    if (this._textSamples.length > 5) {
      this._detectLanguage(this._textSamples.join(' '));
      this._textSamples = [];
    }
  }

  _detectLanguage(text) {
    for (const [lang, re] of Object.entries(LANG_MARKERS)) {
      if (re.test(text)) {
        if (lang !== this._detectedLang) {
          this._detectedLang = lang;
          this._frame = Object.assign({}, CULTURAL_FRAMES[lang] ?? CULTURAL_FRAMES.DEFAULT);
          this._bus.emit('alk.htl.lang.detected', {
            language: lang,
            frame:    this._frame,
            note:     `Cultural calibration updated: ${lang}`,
          });
        }
        return;
      }
    }
    if (!this._detectedLang) {
      this._detectedLang = 'ANGLO_AMERICAN';
      this._frame = Object.assign({}, CULTURAL_FRAMES.ANGLO_AMERICAN);
    }
  }

  // Other modules call this to calibrate their scores
  calibrate(rawSuppressionScore) {
    return r4(rawSuppressionScore / Math.max(0.1, this._frame.expressionNorm));
  }

  calibrateF0(rawF0Range) {
    return r4(rawF0Range / Math.max(0.1, this._frame.prosodyAmp));
  }

  calibrateSilence(silenceScore) {
    // Positive silenceValence culture → silence is not a problem signal
    return r4(silenceScore * (1 - Math.max(0, this._frame.silenceValence)));
  }

  get frame()    { return this._frame; }
  get language() { return this._detectedLang; }
}

// ─── SOM-09 · Somatic-Semantic Bridge ────────────────────────────────────────

export const SOM_UUID    = 'alk-htl-sm09-2000-0000-000000000090';
export const SOM_VERSION = '1.0.0';

// Somatic signature library: cue pattern → body words + emotional meaning
const SOMATIC_SIGNATURES = [
  {
    cues:    ['shoulder_raise', 'blink_rate_high'],
    nsState: 'SYMPATHETIC',
    words:   ['tight', 'braced', 'on-guard', 'held', 'tense'],
    emotion: 'fear/threat response',
    offer:   'Your body seems braced — like preparing for something difficult',
  },
  {
    cues:    ['lean_forward', 'smile_genuine'],
    nsState: 'VENTRAL',
    words:   ['open', 'warm', 'drawn-toward', 'soft', 'moved'],
    emotion: 'care/connection',
    offer:   'There\'s a warmth coming through — like being drawn toward something',
  },
  {
    cues:    ['jaw_clench', 'shoulder_asymmetry'],
    nsState: 'SYMPATHETIC',
    words:   ['tight', 'burning', 'hard', 'contracted', 'sharp'],
    emotion: 'rage/injustice',
    offer:   'Something sharp is there — a tightness that wants to push back',
  },
  {
    cues:    ['gaze_down', 'self_touch_face'],
    nsState: null,
    words:   ['heavy', 'hollow', 'weight', 'pressing', 'ache'],
    emotion: 'grief/separation',
    offer:   'Something feels heavy — like a weight, or a hollow',
  },
  {
    cues:    [],
    nsState: 'DORSAL',
    words:   ['collapsed', 'numb', 'flat', 'gone', 'heavy'],
    emotion: 'shutdown/overwhelm',
    offer:   'Something seems to have gone quiet — like a heaviness or numbness',
  },
];

// Emotion → somatic location mapping
const EMOTION_SOMATICS = Object.freeze({
  RAGE:   { locations: ['chest','jaw','hands','throat'], qualities: ['tight','burning','hot','hard','sharp'] },
  FEAR:   { locations: ['chest','stomach','legs','throat'], qualities: ['cold','constricted','hollow','frozen'] },
  GRIEF:  { locations: ['chest','throat','eyes','arms'], qualities: ['heavy','hollow','pressing','aching','soft'] },
  PLAY:   { locations: ['chest','face','body'], qualities: ['light','expanding','warm','buoyant','open'] },
  CARE:   { locations: ['chest','hands','face'], qualities: ['warm','soft','full','expanding','gentle'] },
  SEEKING:{ locations: ['chest','head','body'], qualities: ['forward','pulling','energized','reaching'] },
});

export class SomaticSemanticModule {
  static UUID    = SOM_UUID;
  static VERSION = SOM_VERSION;

  constructor({ bus, ns, emo } = {}) {
    this._bus = bus;
    this._ns  = ns;
    this._emo = emo;

    this._activeCues   = new Set();
    this._lastNSState  = null;
    this._lastEmoState = null;
    this._lastSentiment = 0;
    this._lastArousal   = 0;
    this._expressionAmp = 0.5;
    this._energy        = 0;

    this._gapHistory   = new SlidingWindow(10);
    this._frame        = 0;
  }

  start() {
    const b = this._bus;
    b.on('alk.video.cue.detected',   ev => this._activeCues.add((ev.payload ?? ev).cue));
    b.on('alk.video.cue.released',   ev => this._activeCues.delete((ev.payload ?? ev).cue));
    b.on('alk.htl.ns.state',         ev => { this._lastNSState  = ev.payload ?? ev; });
    b.on('alk.htl.emo.state',        ev => { this._lastEmoState = ev.payload ?? ev; });
    b.on('alk.latent.update',        ev => { this._lastArousal   = (ev.payload ?? ev).arousal ?? 0; });
    b.on('alk.verbal.analysis.sentiment', ev => { this._lastSentiment = (ev.payload ?? ev).score ?? 0; });
    b.on('alk.verbal.analysis.tone', ev => { this._energy = (ev.payload ?? ev).energy ?? 0; });
    b.on('alk.expression.state',     ev => {
      const scores = Object.values((ev.payload ?? ev).scores ?? {}).filter(Number.isFinite);
      this._expressionAmp = scores.length ? mean(scores) : this._expressionAmp;
    });
    b.on('alk.kernel.pulse', () => this._tick());
  }

  _tick() {
    this._frame++;
    if (this._frame % 15 !== 0) return;

    const somatic = this._computeSomatic();
    const gap     = this._computeGap();

    if (somatic) this._bus.emit('alk.htl.som.somatic',  somatic);
    if (gap)     this._bus.emit('alk.htl.som.gap',      gap);

    // Somatic for dominant emotion
    const dom = this._lastEmoState?.dominant;
    if (dom && EMOTION_SOMATICS[dom]) {
      this._bus.emit('alk.htl.som.semantic_to_somatic', {
        emotion:           dom,
        somatic_locations: EMOTION_SOMATICS[dom].locations,
        somatic_qualities: EMOTION_SOMATICS[dom].qualities,
        grounding_prompt:  `Can you feel where the ${dom.toLowerCase()} lives? ${EMOTION_SOMATICS[dom].locations.join(', ')}?`,
      });
    }
  }

  _computeSomatic() {
    const ns    = this._lastNSState?.polyvagalState ?? null;
    const fc    = this._activeCues;

    for (const sig of SOMATIC_SIGNATURES) {
      const cueMatch = sig.cues.length === 0 || sig.cues.every(c => fc.has(c));
      const nsMatch  = !sig.nsState || sig.nsState === ns;
      if (cueMatch && nsMatch) {
        return {
          somatic_description: sig.offer,
          candidate_words:     sig.words,
          emotional_layer:     sig.emotion,
          offer:               sig.offer + ' — does any of this feel close?',
          confidence:          confScore(cueMatch && nsMatch ? 0.65 : 0.35),
        };
      }
    }
    return null;
  }

  _computeGap() {
    const ar    = this._lastArousal;
    const s     = this._lastSentiment;
    const expAmp = this._expressionAmp;
    const en    = this._energy;

    // Body ahead of words: high somatic activation, low verbal emotional content
    const bodyHigh  = ar > 0.55 || this._activeCues.has('shoulder_raise');
    const wordsLow  = Math.abs(s) < 0.25 && en < 0.3;
    if (bodyHigh && wordsLow) {
      return { gap_type: 'BODY_AHEAD_OF_WORDS', gap_score: r4(ar), confidence: CONF.MEDIUM,
               description: 'Body is showing more activation than words are saying',
               intervention: 'Acknowledge the body first, not the words' };
    }

    // Words ahead of body: emotional language but flat body
    const wordsHigh  = Math.abs(s) > 0.5;
    const bodyFlat   = expAmp < 0.15 && ar < 0.25;
    if (wordsHigh && bodyFlat) {
      return { gap_type: 'WORDS_AHEAD_OF_BODY', gap_score: r4(1 - expAmp), confidence: CONF.MEDIUM,
               description: 'Describing emotion from a distance — may not be feeling it yet',
               intervention: 'Slow down — ask what\'s happening in the body right now' };
    }

    // Performed emotion: positive expression + negative somatic
    const perfSmile = this._activeCues.has('smile_genuine') || this._activeCues.has('smile_social');
    const negSomatic = this._activeCues.has('shoulder_raise') || this._activeCues.has('lean_back');
    if (perfSmile && negSomatic && ar > 0.45) {
      return { gap_type: 'PERFORMED_EMOTION', gap_score: r4(ar * 0.6 + 0.3), confidence: CONF.HIGH,
               description: 'Social smile over activated body — display may not match felt state',
               intervention: 'Do not engage with the performed emotion — acknowledge gently' };
    }

    // Full congruence
    return { gap_type: 'CONGRUENT', gap_score: 0, confidence: CONF.HIGH,
             description: 'Body and words appear aligned — high-quality signal',
             intervention: 'Engage directly with content' };
  }
}

// ─── GAP-10 · Gap Taxonomy Module ────────────────────────────────────────────

export const GAP_UUID    = 'alk-htl-gp10-2000-0000-000000000100';
export const GAP_VERSION = '1.0.0';

export const GAP_TYPES = Object.freeze({
  SILENT_TREATMENT:  'SILENT_TREATMENT',
  NEEDING_SPACE:     'NEEDING_SPACE',
  PROCESSING_TIME:   'PROCESSING_TIME',
  RHYTHMIC_PAUSE:    'RHYTHMIC_PAUSE',
  FREEZE:            'FREEZE',
  FLOODING:          'FLOODING',
  DISSOCIATION:      'DISSOCIATION',
  GRIEF_SILENCE:     'GRIEF_SILENCE',
  STONEWALLING:      'STONEWALLING',
});

const GAP_RESPONSES = Object.freeze({
  SILENT_TREATMENT: {
    do:     'Name it without escalating: "I notice you\'ve gone quiet — are you okay?"',
    dont:   'Do not pursue repeatedly. Do not threaten. Do not match with silence.',
  },
  NEEDING_SPACE: {
    do:     '"I\'ll give you some space — can we check back in an hour?"',
    dont:   'Do not interpret space as rejection. Do not withdraw punitively.',
  },
  PROCESSING_TIME: {
    do:     'Wait. Do not fill the silence. Quality of response increases with time given.',
    dont:   'Do not repeat the question. Do not interpret slow response as avoidance.',
  },
  RHYTHMIC_PAUSE: {
    do:     'Nothing. This is conversation breathing.',
    dont:   'Filling rhythmic pauses is the error — it breaks natural exchange.',
  },
  FREEZE: {
    do:     'Slow down. Lower your voice. Create safety. No new information.',
    dont:   'Do not increase intensity. Do not ask complex questions.',
  },
  FLOODING: {
    do:     '"Let\'s pause and come back — I\'m not going anywhere." Then wait 20 minutes minimum.',
    dont:   '"Why won\'t you talk to me." / "We need to resolve this now." / Following them.',
  },
  DISSOCIATION: {
    do:     'Gentle grounding. Presence without agenda. "I\'m here — you don\'t have to do anything."',
    dont:   'Do not try to reason or problem-solve. Not information, not explanations.',
  },
  GRIEF_SILENCE: {
    do:     'Witness. "I\'m here." Do not try to move them through it.',
    dont:   'Do not fix. Do not minimize. Do not offer silver linings.',
  },
  STONEWALLING: {
    do:     'Do not pursue. Create safety for return. Give time.',
    dont:   'Pursuing stonewalling escalates it. Do not interpret as final rejection.',
  },
});

export class GapTaxonomyModule {
  static UUID    = GAP_UUID;
  static VERSION = GAP_VERSION;

  constructor({ bus, ns, emo, att, lang } = {}) {
    this._bus  = bus;
    this._ns   = ns;
    this._emo  = emo;
    this._att  = att;
    this._lang = lang;

    // Gap tracking
    this._inGap        = false;
    this._gapStartTs   = null;
    this._lastSpeechTs = null;
    this._gapType      = null;

    // Pre-gap context
    this._preGapArousal    = 0;
    this._preGapNSState    = null;
    this._preGapEmoState   = null;
    this._preGapAttPattern = null;

    // Temporal tracking
    this._arousalAtOnset   = 0;
    this._arousalWindow    = new SlidingWindow(20);
    this._contemptHistory  = new SlidingWindow(30);
    this._contemptCount    = 0;

    // Current state
    this._lastNS        = null;
    this._lastEmo       = null;
    this._lastAtt       = null;
    this._lastArousal   = 0;
    this._expressionAmp = 0.5;
    this._engagement    = 0;
    this._energy        = 0;

    this._sessionMeanPause  = 1200;  // ms, updates with data
    this._pauseDurations    = new SlidingWindow(20);
  }

  start() {
    const b = this._bus;
    b.on('alk.verbal.transcript',     ev => this._onSpeech(ev));
    b.on('alk.verbal.analysis.tone',  ev => { this._energy = (ev.payload ?? ev).energy ?? 0; });
    b.on('alk.htl.ns.state',          ev => { this._lastNS  = ev.payload ?? ev; });
    b.on('alk.htl.emo.state',         ev => { this._lastEmo = ev.payload ?? ev; });
    b.on('alk.htl.att.state',         ev => { this._lastAtt = ev.payload ?? ev; });
    b.on('alk.latent.update',         ev => {
      const p = ev.payload ?? ev;
      this._lastArousal = p.arousal ?? 0;
      this._engagement  = p.engagement ?? 0;
      this._arousalWindow.push(this._lastArousal);
    });
    b.on('alk.expression.state',      ev => {
      const scores = Object.values((ev.payload ?? ev).scores ?? {}).filter(Number.isFinite);
      this._expressionAmp = scores.length ? mean(scores) : this._expressionAmp;
    });
    b.on('alk.video.cue.detected',    ev => {
      if ((ev.payload ?? ev).cue === 'contempt_micro') this._contemptCount++;
    });
    b.on('alk.kernel.pulse',          () => this._tick());
  }

  _onSpeech(ev) {
    const now = Date.now();

    if (this._inGap && this._gapStartTs) {
      const dur = now - this._gapStartTs;
      this._pauseDurations.push(dur);
      this._sessionMeanPause = this._pauseDurations.avg();

      this._bus.emit('alk.htl.gap.resolved', {
        type:        this._gapType,
        duration_ms: dur,
        resolved_by: 'speech',
      });
      this._inGap = false;
      this._gapType = null;
    }

    this._lastSpeechTs     = now;
    this._preGapArousal    = this._lastArousal;
    this._preGapNSState    = this._lastNS?.polyvagalState;
    this._preGapEmoState   = this._lastEmo?.dominant;
    this._preGapAttPattern = this._lastAtt?.pattern;
  }

  _tick() {
    const now = Date.now();
    if (!this._lastSpeechTs) return;

    const silenceDuration = now - this._lastSpeechTs;

    // Apply cultural calibration for silence interpretation
    const silenceThreshold = this._lang
      ? 1800 + this._lang.frame.silenceValence * 600  // positive silenceValence → higher threshold
      : 1800;

    if (silenceDuration < silenceThreshold) {
      if (this._inGap) {
        this._bus.emit('alk.htl.gap.resolved', { type: this._gapType, duration_ms: silenceDuration });
        this._inGap = false; this._gapType = null;
      }
      return;
    }

    // We are in a gap
    if (!this._inGap) {
      this._inGap     = true;
      this._gapStartTs = now - silenceDuration;
      this._arousalAtOnset = this._preGapArousal;
    }

    const currentType = this._classify(silenceDuration);

    if (currentType !== this._gapType) {
      this._gapType = currentType;
      const response = GAP_RESPONSES[currentType] ?? {};

      this._bus.emit('alk.htl.gap.detected', {
        type:         currentType,
        duration_ms:  silenceDuration,
        confidence:   this._confidenceForType(currentType),
        metrics: {
          onset_ts:            this._gapStartTs,
          arousal_at_onset:    r4(this._arousalAtOnset),
          arousal_current:     r4(this._lastArousal),
          arousal_trend:       this._arousalWindow.vals.length > 6
            ? (mean(this._arousalWindow.vals.slice(-3)) > mean(this._arousalWindow.vals.slice(0, 3)) ? 'rising' : 'falling')
            : 'stable',
          expression_amp:      r4(this._expressionAmp),
          engagement:          r4(this._engagement),
          vs_session_baseline: r4(silenceDuration / Math.max(1, this._sessionMeanPause)),
          contempt_history:    this._contemptCount,
        },
        recommended_response: response.do   ?? '',
        what_not_to_do:       response.dont ?? '',
        // §1.1
        evidence: [
          `ns=${this._lastNS?.polyvagalState}`,
          `emo=${this._lastEmo?.dominant}`,
          `att=${this._lastAtt?.pattern}`,
          `arousal_onset=${r4(this._arousalAtOnset)}`,
          `arousal_now=${r4(this._lastArousal)}`,
          `contempt_count=${this._contemptCount}`,
          `expression_amp=${r4(this._expressionAmp)}`,
        ],
      });
    }

    // Sustained gap warning
    if (silenceDuration > 60_000) {
      this._bus.emit('alk.htl.gap.sustained', { type: this._gapType, duration_ms: silenceDuration });
    }
  }

  _classify(duration) {
    const ns     = this._lastNS?.polyvagalState ?? 'VENTRAL';
    const zone   = this._lastNS?.windowZone     ?? 'WINDOW';
    const emo    = this._lastEmo?.dominant       ?? null;
    const att    = this._lastAtt?.pattern        ?? null;
    const ar     = this._lastArousal;
    const arOnset = this._arousalAtOnset;
    const arTrend = this._arousalWindow.vals.length > 6
      ? (mean(this._arousalWindow.vals.slice(-3)) < mean(this._arousalWindow.vals.slice(0,3)) ? 'falling' : 'rising')
      : 'stable';
    const coh    = this._lastNS?.windowZone === 'HYPO';
    const eng    = this._engagement;

    // Rhythmic pause: very short, all signals stable
    if (duration < 3000 && Math.abs(ar - arOnset) < 0.1) {
      return GAP_TYPES.RHYTHMIC_PAUSE;
    }

    // Processing time: internal orientation, low arousal, coherent, not avoidant
    if (ar < 0.35 && ns !== 'DORSAL' && att !== 'AVOIDANT' && eng > -0.1) {
      return GAP_TYPES.PROCESSING_TIME;
    }

    // Flooding: extreme arousal onset then rapid collapse
    if (arOnset > 0.75 && ar < 0.30 && arTrend === 'falling') {
      return GAP_TYPES.FLOODING;
    }

    // Freeze: high arousal + coherence collapse + expression suppressed
    if (ns === 'FREEZE' || (arOnset > 0.6 && this._expressionAmp < 0.12 && zone === 'HYPER')) {
      return GAP_TYPES.FREEZE;
    }

    // Dissociation: dorsal vagal + low engagement + not grief
    if (ns === 'DORSAL' && eng < 0.1 && emo !== 'GRIEF') {
      return GAP_TYPES.DISSOCIATION;
    }

    // Grief silence: dorsal + GRIEF system + low engagement
    if ((ns === 'DORSAL' || ar < 0.25) && emo === 'GRIEF') {
      return GAP_TYPES.GRIEF_SILENCE;
    }

    // Stonewalling: contempt history + avoidant attachment + dorsal
    if (this._contemptCount > 3 && att === 'AVOIDANT' && ns === 'DORSAL') {
      return GAP_TYPES.STONEWALLING;
    }

    // Silent treatment: sympathetic + contempt + negative engagement
    if (ns === 'SYMPATHETIC' && this._contemptCount > 1 && eng < -0.3) {
      return GAP_TYPES.SILENT_TREATMENT;
    }

    // Needing space: NS dropping toward VENTRAL, suppression falling
    if (arTrend === 'falling' && arOnset > 0.5 && ar < arOnset * 0.7) {
      return GAP_TYPES.NEEDING_SPACE;
    }

    // Default: processing time (safest assumption — see §GAP failure modes)
    return GAP_TYPES.PROCESSING_TIME;
  }

  _confidenceForType(type) {
    // Some types have clearer signatures than others
    const baseConf = {
      RHYTHMIC_PAUSE:  0.85,
      FLOODING:        0.80,
      FREEZE:          0.75,
      DISSOCIATION:    0.70,
      GRIEF_SILENCE:   0.65,
      STONEWALLING:    0.60,
      SILENT_TREATMENT:0.55,
      NEEDING_SPACE:   0.55,
      PROCESSING_TIME: 0.50,
    };
    return confScore(baseConf[type] ?? 0.5);
  }
}

// ─── XLAT-11 · Human Translator ──────────────────────────────────────────────

export const XLAT_UUID    = 'alk-htl-xl11-2000-0000-000000000110';
export const XLAT_VERSION = '1.0.0';

export class HumanTranslatorModule {
  static UUID    = XLAT_UUID;
  static VERSION = XLAT_VERSION;

  constructor({ bus, ns, emo, cog, need, val, att, mod, lang, som, gap } = {}) {
    this._bus  = bus;
    this._modules = { ns, emo, cog, need, val, att, mod, lang, som, gap };

    // Latest state from each module
    this._state = {
      ns: null, emo: null, cog: null, need: null,
      val: null, att: null, mod: null, lang: null,
      som: null, gap: null,
    };

    this._frame = 0;
  }

  start() {
    const b = this._bus;
    const sub = (ch, key) => b.on(ch, ev => { this._state[key] = ev.payload ?? ev; });

    sub('alk.htl.ns.state',     'ns');
    sub('alk.htl.emo.state',    'emo');
    sub('alk.htl.cog.profile',  'cog');
    sub('alk.htl.need.state',   'need');
    sub('alk.htl.val.profile',  'val');
    sub('alk.htl.att.state',    'att');
    sub('alk.htl.mod.profile',  'mod');
    sub('alk.htl.lang.detected','lang');
    sub('alk.htl.som.gap',      'som');
    sub('alk.htl.gap.detected', 'gap');

    b.on('alk.htl.gap.detected', () => this._translate());  // always translate on gap
    b.on('alk.htl.ns.shift',     () => this._translate());  // always on state shift
    b.on('alk.kernel.pulse',     () => {
      this._frame++;
      if (this._frame % 60 === 0) this._translate(); // periodic
    });
  }

  _translate() {
    const { ns, emo, cog, need, att, mod, lang, som, gap } = this._state;
    if (!ns && !emo) return;  // not enough data yet

    const output = this._buildOutput({ ns, emo, cog, need, att, mod, lang, som, gap });
    this._bus.emit('alk.htl.translation', output);
  }

  _buildOutput({ ns, emo, cog, need, att, mod, lang, som, gap }) {
    const zone    = ns?.windowZone        ?? 'WINDOW';
    const nsState = ns?.polyvagalState    ?? 'VENTRAL';
    const capacity = ns?.capacity         ?? 0.7;
    const dom     = emo?.dominant         ?? null;
    const intent  = need?.intent          ?? null;
    const attPat  = att?.pattern          ?? null;
    const ll      = mod?.loveLanguage?.receiving ?? null;
    const process = cog?.processOrder     ?? null;
    const gapType = gap?.type             ?? null;

    // What they're feeling (somatic layer)
    const feeling = som?.description
      ?? (dom ? `${dom.toLowerCase()} system active` : 'unknown');

    // What they need
    const primaryNeed = need?.unmet?.[0] ?? need?.active?.[0] ?? 'unknown';

    // What the gap means (if in a gap)
    const gapMeaning = gapType
      ? `${gapType.replace(/_/g,' ').toLowerCase()} — ${this._gapNarrative(gapType)}`
      : null;

    // How to reach them
    const reachModality = capacity < 0.2  ? 'presence only — no words'
      : capacity < 0.45 ? 'body-first — somatic acknowledgment before content'
      : process === 'FEEL_FIRST' ? 'emotional acknowledgment before information'
      : process === 'THINK_FIRST' ? 'logical frame before emotional content'
      : 'direct — they can receive content now';

    const whatToSay   = this._generateWhatToSay({ nsState, zone, dom, attPat, gapType, need });
    const whatNotTo   = this._generateWhatNotTo({ nsState, zone, dom, attPat, gapType });
    const cultureNote = lang ? `Cultural frame: ${lang.language ?? 'unknown'} — ${this._culturalNote(lang)}` : null;

    const confidence = r4(mean([
      ns?.confidence ? 0.9 : 0.3,
      emo ? 0.7 : 0.2,
      need ? 0.6 : 0.2,
    ]));

    return {
      // §1.1: labeled as signal, not diagnosis
      nervous_system_state:  `${nsState.toLowerCase()} — ${zone.toLowerCase()} zone`,
      window_zone:            zone,
      processing_capacity:   `${Math.round(capacity * 100)}% — ${ns?.regulationEst ?? 'unknown'}`,
      emotional_system:      dom ? `${dom} active` : 'unclear',
      somatic_description:   feeling,
      somatic_semantic_gap:  som?.gap_type ?? 'CONGRUENT',
      active_need:           primaryNeed,
      intent:                intent?.replace(/_/g, ' ').toLowerCase() ?? 'unclear',
      what_wont_work_now:    this._whatWontWork({ zone, process, nsState }),
      surface_signal:        gapType ? `silence — ${gapType}` : 'speaking',
      gap_type:              gapType,
      actual_meaning:        gapMeaning,
      modality:              ll ?? 'unknown',
      cognitive_entry:       reachModality,
      attachment_approach:   this._attachmentApproach(attPat),
      what_to_say:           whatToSay,
      what_not_to_say:       whatNotTo,
      cultural_calibration:  cultureNote,
      confidence,
      evidence_summary:      this._buildEvidence({ ns, emo, att, gap }),
      uncertainty:           this._buildUncertainty({ ns, emo, cog, att }),
    };
  }

  _gapNarrative(type) {
    const narratives = {
      SILENT_TREATMENT: 'deliberate withholding — interpersonal',
      NEEDING_SPACE:    'nervous system regulation — not punitive',
      PROCESSING_TIME:  'cognitive processing — the answer is building',
      RHYTHMIC_PAUSE:   'natural conversation rhythm — not communicative',
      FREEZE:           'threat response — body is immobilized',
      FLOODING:         'system overwhelmed — 20min minimum to return',
      DISSOCIATION:     'overwhelm → offline — involuntary',
      GRIEF_SILENCE:    'loss-induced — not about the relationship',
      STONEWALLING:     'contempt-driven emotional withdrawal',
    };
    return narratives[type] ?? 'unclear';
  }

  _whatWontWork({ zone, process, nsState }) {
    if (zone === 'HYPER' || nsState === 'FREEZE') {
      return 'reasoning, problem-solving, explaining your position, increasing intensity';
    }
    if (nsState === 'DORSAL') {
      return 'any complex communication — system is offline';
    }
    if (process === 'FEEL_FIRST') {
      return 'jumping to solutions before emotional acknowledgment';
    }
    if (process === 'THINK_FIRST') {
      return 'leading with emotion before establishing logic frame';
    }
    return 'none apparent — window is open';
  }

  _generateWhatToSay({ nsState, zone, dom, attPat, gapType, need }) {
    if (nsState === 'DORSAL' || zone === 'HYPO') {
      return '"I\'m here. You don\'t have to do anything right now."';
    }
    if (gapType === 'FLOODING') {
      return '"Let\'s pause — I\'m not going anywhere. Can we come back in 20 minutes?"';
    }
    if (gapType === 'NEEDING_SPACE') {
      return '"Take the time you need. I\'ll be here when you\'re ready."';
    }
    if (attPat === 'ANXIOUS') {
      return '"You\'re not in trouble. I\'m not leaving. I just need a moment."';
    }
    if (dom === 'GRIEF') {
      return '"I hear you. I\'m here. You don\'t have to explain it."';
    }
    if (dom === 'RAGE') {
      return '"That sounds really unfair. Tell me more about what happened."';
    }
    if (need?.intent === 'SEEKING_VALIDATION') {
      return '"That makes complete sense — of course you feel that way."';
    }
    return '"I\'m listening. Take your time."';
  }

  _generateWhatNotTo({ nsState, zone, attPat, gapType }) {
    const nots = [];
    if (zone === 'HYPER')  nots.push('"We need to resolve this now"');
    if (gapType === 'FLOODING') nots.push('"Why won\'t you talk to me"', '"Fine, I\'ll leave"');
    if (attPat === 'AVOIDANT') nots.push('Pursuing — each pursuit increases their withdrawal');
    if (attPat === 'ANXIOUS')  nots.push('Leaving without reassurance of return');
    if (nsState === 'DORSAL')  nots.push('Reasoning, explaining, problem-solving');
    return nots.join(' / ') || 'none — proceed with care';
  }

  _attachmentApproach(pat) {
    const approaches = {
      SECURE:       'Direct, honest — they can receive it',
      ANXIOUS:      'Slow, steady, reassure continuity — "I\'m not going anywhere"',
      AVOIDANT:     'Give space first, approach slowly, no pressure or pursuit',
      DISORGANIZED: 'Move very slowly, no sudden changes, establish safety first',
    };
    return approaches[pat] ?? 'unknown — proceed gently';
  }

  _culturalNote(lang) {
    if (!lang?.language) return 'default frame';
    const notes = {
      JAPANESE:       'high-context — silence may be respectful, not avoidant',
      ARABIC:         'high vocal amplitude is baseline — not aggression',
      SCANDINAVIAN:   'direct communication is respectful — not cold',
      LATIN_AMERICAN: 'physical warmth is baseline — not intrusive',
      EAST_ASIAN:     'indirect communication is sophistication — not evasion',
    };
    return notes[lang.language] ?? 'calibrated';
  }

  _buildEvidence({ ns, emo, att, gap }) {
    return [
      ns  ? `NS: ${ns.polyvagalState} (${ns.windowZone})` : null,
      emo ? `EMO: ${emo.dominant} [${emo.active?.join(',')}]`  : null,
      att ? `ATT: ${att.pattern}` : null,
      gap ? `GAP: ${gap.type} (${gap.duration_ms}ms)` : null,
    ].filter(Boolean);
  }

  _buildUncertainty({ ns, emo, cog, att }) {
    const unc = [];
    if (!cog || cog.confidence === CONF.LOW)    unc.push('cognitive style uncertain — need more speech');
    if (!att || att.confidence < 0.5)           unc.push('attachment pattern provisional — short session');
    if (!emo || emo.confidence === CONF.LOW)    unc.push('emotional system inference low confidence');
    if (!ns)                                    unc.push('nervous system state unavailable');
    return unc.length ? unc.join('; ') : 'sufficient data for this inference';
  }
}

// ─── REL-12 · Relationship Module ────────────────────────────────────────────

export const REL_UUID    = 'alk-htl-rl12-2000-0000-000000000120';
export const REL_VERSION = '1.0.0';

export const REL_CYCLES = Object.freeze({
  DEMAND_WITHDRAW: 'DEMAND_WITHDRAW',
  ESCALATION:      'ESCALATION',
  FREEZE_PURSUE:   'FREEZE_PURSUE',
  CRITICISM_DEF:   'CRITICISM_DEFENSIVENESS',
  STABLE:          'STABLE',
});

export class RelationshipModule {
  static UUID    = REL_UUID;
  static VERSION = REL_VERSION;

  constructor({ bus, personA_bus, personB_bus } = {}) {
    // Dual-bus mode: separate event buses for two persons
    // Single-bus mode: use sessionId to separate
    this._bus = bus;
    this._busA = personA_bus ?? bus;
    this._busB = personB_bus ?? null;

    // Per-person state
    this._personA = this._blankPersonState('A');
    this._personB = this._blankPersonState('B');

    // Relationship metrics
    this._positiveEvents = 0;
    this._negativeEvents = 0;
    this._ruptures       = [];
    this._repairAttempts = [];
    this._horsemenSeen   = new Set();
    this._activeCycle    = REL_CYCLES.STABLE;
    this._cycleStart     = null;

    // Synchrony windows
    this._nsSyncW   = new SlidingWindow(20);
    this._emoSyncW  = new SlidingWindow(20);

    this._frame = 0;
  }

  _blankPersonState(id) {
    return {
      id, ns: null, emo: null, att: null, arousal: 0, engagement: 0,
      sentiment: 0, contemptCount: 0, escalCount: 0,
    };
  }

  start() {
    // NOTE: In single-bus mode, use sessionId or prefix to distinguish persons.
    // This implementation assumes single bus with all events for both persons.
    // In production: instantiate with two separate buses.

    const b = this._bus;

    // For now, A = primary speaker, B = secondary (session capture)
    // REL-12 needs explicit dual-person routing — this is a placeholder
    b.on('alk.htl.ns.state',          ev => { this._personA.ns = ev.payload ?? ev; });
    b.on('alk.htl.emo.state',         ev => { this._personA.emo = ev.payload ?? ev; });
    b.on('alk.htl.att.state',         ev => { this._personA.att = ev.payload ?? ev; });
    b.on('alk.latent.update',         ev => {
      const p = ev.payload ?? ev;
      this._personA.arousal    = p.arousal    ?? 0;
      this._personA.engagement = p.engagement ?? 0;
    });
    b.on('alk.verbal.analysis.sentiment', ev => {
      this._personA.sentiment = (ev.payload ?? ev).score ?? 0;
      if (this._personA.sentiment > 0.2) this._positiveEvents++;
      else if (this._personA.sentiment < -0.2) this._negativeEvents++;
    });
    b.on('alk.video.cue.detected', ev => {
      if ((ev.payload ?? ev).cue === 'contempt_micro') {
        this._personA.contemptCount++;
        this._horsemenSeen.add('contempt');
      }
    });
    b.on('alk.behavior.escalation', () => {
      this._personA.escalCount++;
      this._horsemenSeen.add('escalation');
    });
    b.on('alk.kernel.pulse', () => this._tick());
  }

  _tick() {
    this._frame++;
    if (this._frame % 30 !== 0) return;

    const cycle   = this._detectCycle();
    const syncNS  = this._computeNSSynchrony();
    const posRatio = this._positiveEvents / Math.max(1, this._positiveEvents + this._negativeEvents);

    if (cycle !== this._activeCycle) {
      if (cycle !== REL_CYCLES.STABLE) this._cycleStart = Date.now();
      this._activeCycle = cycle;
    }

    const cycleDuration = this._cycleStart ? Date.now() - this._cycleStart : 0;

    this._bus.emit('alk.htl.rel.state', {
      activeCycle:      cycle,
      cycleDuration_ms: cycleDuration,
      nsSynchrony:      r4(syncNS),
      positivityRatio:  r4(posRatio),
      belowGottmanRatio: posRatio < 0.833,  // below 5:1
      horsemenActive:   [...this._horsemenSeen],
      ruptures:         this._ruptures.length,
      repairs:          this._repairAttempts.length,
      repairDepth:      this._computeRepairDepth(),
      interventionTarget: this._interventionTarget(),
      confidence:       CONF.MEDIUM,  // always medium — REL-12 needs dual capture for HIGH
    });
  }

  _detectCycle() {
    const A = this._personA;

    // Demand-withdraw: high escalation + high contempt → DEMAND; then avoidant withdrawal
    if (A.escalCount > 3 && A.att?.pattern === 'ANXIOUS') {
      return REL_CYCLES.DEMAND_WITHDRAW;
    }
    // Escalation: mutual high arousal + sentiment negative + no repair
    if (A.arousal > 0.65 && A.sentiment < -0.3 && A.escalCount > 2) {
      return REL_CYCLES.ESCALATION;
    }
    // Criticism + defensiveness: contempt present + defensive language
    if (A.contemptCount > 2) {
      return REL_CYCLES.CRITICISM_DEF;
    }
    return REL_CYCLES.STABLE;
  }

  _computeNSSynchrony() {
    // With single bus: can only estimate — return moderate value
    // With dual bus: compare NS states directly
    return 0.5; // placeholder — needs dual capture
  }

  _computeRepairDepth() {
    if (this._repairAttempts.length === 0) return 0;
    const successful = this._repairAttempts.filter(r => r.success).length;
    return r4(successful / this._repairAttempts.length);
  }

  _interventionTarget() {
    // Demand-withdraw: address withdrawer's safety need first
    if (this._activeCycle === REL_CYCLES.DEMAND_WITHDRAW) {
      return { person: 'withdrawer', reason: 'Address safety need first — when withdrawer feels safe, pursuer can calm' };
    }
    // Escalation: both need co-regulation before content
    if (this._activeCycle === REL_CYCLES.ESCALATION) {
      return { person: 'both', reason: 'Both above window — regulate before any content processing' };
    }
    return null;
  }
}

// ─── Factory: createHTL ───────────────────────────────────────────────────────

/**
 * Create and wire all 12 HTL modules.
 *
 * @param {object} opts
 * @param {object} opts.bus      — ALK kernel or any { on, emit } bus
 * @returns {object}             — { start, modules, destroy }
 *
 * Usage:
 *   const htl = createHTL({ bus: kernel });
 *   htl.start();
 *   kernel.subscribe('alk.htl.translation', ev => console.log(ev.payload));
 */
export function createHTL({ bus } = {}) {
  if (!bus) throw new Error('[ALK HTL] bus is required');

  // Wrap kernel's subscribe interface to match bus.on / bus.emit
  const b = {
    on:   (ch, fn) => bus.subscribe ? bus.subscribe(ch, ev => fn(ev)) : bus.on(ch, fn),
    emit: (ch, payload) => bus.emit ? bus.emit(ch, payload, {}) : bus.emit(ch, payload),
  };

  // Instantiate modules
  const ns   = new NervousSystemModule({ bus: b });
  const emo  = new EmotionalSystemsModule({ bus: b, ns });
  const cog  = new CognitiveArchModule({ bus: b });
  const need = new NeedsIntentModule({ bus: b, emo, ns });
  const val  = new ValuesBeliefsModule({ bus: b });
  const att  = new AttachmentModule({ bus: b, ns, emo });
  const mod  = new ModalitiesModule({ bus: b, cog });
  const lang = new LanguageCultureModule({ bus: b });
  const som  = new SomaticSemanticModule({ bus: b, ns, emo });
  const gap  = new GapTaxonomyModule({ bus: b, ns, emo, att, lang });
  const xlat = new HumanTranslatorModule({ bus: b, ns, emo, cog, need, val, att, mod, lang, som, gap });
  const rel  = new RelationshipModule({ bus: b });

  const all = [ns, emo, cog, need, val, att, mod, lang, som, gap, xlat, rel];

  return {
    start() {
      for (const m of all) m.start();
      b.emit('alk.htl.ready', { version: HTL_VERSION, modules: all.length });
    },
    modules: { ns, emo, cog, need, val, att, mod, lang, som, gap, xlat, rel },
    // §1.8 — expose health check
    health() {
      return all.map(m => ({
        uuid:    m.constructor.UUID,
        version: m.constructor.VERSION,
        name:    m.constructor.name,
      }));
    },
  };
}

export default { createHTL, HTL_VERSION, HTL_UUID };
