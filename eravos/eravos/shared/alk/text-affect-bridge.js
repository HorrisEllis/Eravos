/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  TEXT-SIDE AFFECT BRIDGE  ·  text-affect-bridge.js  ·  v0.4.0           ║
 * ║  UUID: alk-lattice-tab-0001-0000-000000000002                           ║
 * ║  HOOK: eravos.alk:text-affect-bridge:00002                              ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * ── THE PROVEN GAP (§0.1 — measured, not assumed) ───────────────────────────
 *
 * latent-model.js's ENGAGEMENT dimension has two producers, both video:
 * posture lean and gaze. Run on text alone it never leaves its initial
 * state — value 0, uncertainty 0.5 (untouched).
 *
 * htl.js's Panksepp circuits are then starved. Per circuit, the share of the
 * maximum score that requires a face cue:
 *
 *     FEAR    0.90    fear_micro, gaze_aversion, brow_raise, shoulder_raise
 *     CARE    0.55    smile_genuine, lean_forward
 *     RAGE    0.55    jaw_clench, contempt_micro, shoulder_asymmetry
 *     GRIEF   0.40    gaze_down, self_touch_face
 *     PLAY    0.30    smile_genuine, lean_forward
 *
 * GRIEF is the most text-reachable at 0.5 maximum, and its largest
 * text-side term is `(arousal < 0.3 && engagement < -0.2) ? 0.2`. With
 * engagement stuck at 0 that term can never fire, so GRIEF tops out at 0.15
 * against a 0.2 activation threshold. Measured on a 7-line relational
 * transcript: `emo.dominant === null` on every single line.
 *
 * That null is load-bearing. NeedsIntentModule populates `unmet` needs ONLY
 * from `emo.dominant`. So the single most valuable output of the whole
 * relational stack — which need is going unmet — is permanently empty on
 * text input. Missing by 0.05.
 *
 * ── WHAT THIS DOES, AND WHY IT IS NOT A MONKEY PATCH (§5.3) ────────────────
 *
 * It does NOT edit htl.js. It does NOT edit latent-model.js. It does NOT
 * emit fabricated `alk.video.cue.detected` events — that would be inventing
 * sensor data, a §1.3 violation, and it would corrupt the causal record
 * (§1.2) by making a text run indistinguishable from a camera run.
 *
 * Instead it uses latent-model.js's OWN declared interface. `OBS_MODELS`
 * already contains two modality-agnostic composite keys:
 *
 *     'sig.APPROACH'    { ENGAGEMENT:+0.8, VALENCE:+0.3, COHERENCE:+0.3 }  R 0.20
 *     'sig.WITHDRAWAL'  { ENGAGEMENT:-0.7, VALENCE:-0.3, AROUSAL:+0.3   }  R 0.20
 *
 * These are cross-stream behavioural composites, not video primitives. A
 * text-derived approach/withdrawal reading belongs there, fused through the
 * same Kalman gain and the same declared noise model R=0.20 as any other
 * observation. §5.10 — interaction through the declared contract.
 *
 * ── GROUNDING (§0.1 — epistemically sourced, not invented from taste) ──────
 *
 * ENGAGEMENT FROM FUNCTION WORDS.
 *   Pennebaker and colleagues' work on function-word analysis (LIWC) finds
 *   pronoun distribution tracks relational orientation more reliably than
 *   content words do: first-person plural and direct second-person address
 *   mark engagement toward the other; third-person, impersonal and
 *   generalised constructions mark distancing. This bridge computes exactly
 *   that ratio. It is a well-evidenced correlate of relational orientation.
 *   It is NOT the same construct as posture-derived approach motivation.
 *
 * THE FOUR HORSEMEN.
 *   Gottman and Levenson: criticism, contempt, defensiveness and
 *   stonewalling predict relational outcome, and each has documented
 *   lexical markers. Contempt in particular is the strongest single
 *   predictor in that literature. Stonewalling maps to withdrawal.
 *
 * BIDS FOR CONNECTION.
 *   Also Gottman: small attempts to secure attention, affection or support.
 *   Turning toward a bid is the maintenance behaviour; turning away is the
 *   erosion behaviour. Bids are lexically visible (direct address, shared
 *   reference, request-for-attention forms).
 *
 * REUSE, NOT RE-INVENTION (§5.5 / §16.5).
 *   ERAVOS's kernel already ships `LATTICE_FRICTION_WORDS` containing
 *   exactly: always, never, fine, whatever, nothing, should, supposed,
 *   again, still, ignored, ignoring, defensive, shut, shutdown, withdrew,
 *   withdrawn, silent, silence, stonewalling, blame, blamed, fault, unheard,
 *   dismissed. That is already a Four-Horsemen lexicon under a different
 *   name. It is imported here, not duplicated.
 *
 * ── HONEST STATUS (§0.1, §12.3) ────────────────────────────────────────────
 *
 *   VERIFIED: that these observations lift the circuits above threshold, and
 *   that intent begins tracking content afterward. Tested, locked in.
 *
 *   NOT VERIFIED: that the resulting engagement value equals what a camera
 *   would have measured. It does not. This is a SUBSTITUTION with a
 *   different provenance, and every emission is tagged `modality: 'text'` and
 *   `substituted: true` so nothing downstream can mistake one for the other
 *   (§17.5 — every output has provenance).
 *
 *   §1.1 — all outputs are signal, not diagnosis. "High contempt density"
 *   is not "this person is contemptuous."
 */

'use strict';

export const TAB_VERSION = '0.4.0';
export const TAB_UUID    = 'alk-lattice-tab-0001-0000-000000000002';

// ── Function-word banks (Pennebaker-style; closed-class, not content) ───────

const APPROACH_PRONOUNS   = /\b(we|us|our|ours|you|your|yours|let'?s|together)\b/gi;
const DISTANCE_PRONOUNS   = /\b(they|them|their|it|its|one|people|someone|everyone|anybody|nobody)\b/gi;
const DIRECT_ADDRESS      = /\b(you|your)\b/gi;
const IMPERSONAL_FRAME    = /\b(there (is|are|was|were)|it (is|was|seems)|things? (are|is|just)|that'?s (just )?how)\b/gi;

// ── Gottman: Four Horsemen. Lexical markers only. ──────────────────────────

const HORSEMEN = Object.freeze({
  // absolutes + character attribution ("you always", "you never", "you're so")
  criticism:     [/\byou (always|never)\b/i, /\byou'?re (so|such)\b/i, /\bwhat'?s wrong with you\b/i,
                  /\byou (don'?t|didn'?t) even\b/i, /\bwhy (do|can'?t) you\b/i],
  // contempt — strongest predictor in the literature
  contempt:      [/\bwhatever\b/i, /\bpathetic\b/i, /\bridiculous\b/i, /\bgrow up\b/i,
                  /\bare you serious\b/i, /\bobviously\b/i, /\bof course you\b/i, /\btypical\b/i],
  defensiveness: [/\bit'?s not my fault\b/i, /\bi didn'?t (do|say)\b/i, /\bwhat about (you|when you)\b/i,
                  /\bi'?m not the one\b/i, /\byou'?re the one who\b/i],
  stonewalling:  [/\bi'?m done\b/i, /\bforget it\b/i, /\bnever ?mind\b/i, /\bi don'?t want to talk\b/i,
                  /\bnothing\b/i, /\bit'?s fine\b/i, /\bdrop it\b/i],
});

// ── Gottman: bids for connection, and repair attempts ──────────────────────

const BIDS = [
  /\bdo you (remember|think|want|know)\b/i, /\bcan we\b/i, /\bwill you\b/i,
  /\bi (miss|need|want) you\b/i, /\bare you (ok|okay|there|awake)\b/i,
  /\blook at\b/i, /\bcome here\b/i, /\btell me\b/i, /\bi love you\b/i,
];

const REPAIR = [
  /\bi'?m sorry\b/i, /\bmy fault\b/i, /\bi didn'?t mean\b/i, /\bcan we start over\b/i,
  /\bforgive me\b/i, /\bi hear you\b/i, /\byou'?re right\b/i, /\blet me try again\b/i,
];

// ── Loss / separation-distress vocabulary (GRIEF, Panksepp's PANIC system) ──
// Aligned with htl.js's own NVC MOURNING lexicon rather than a parallel one.

const LOSS_VOCAB = /\b(miss|missed|missing|alone|lonely|gone|lost|left|abandon\w*|empty|used to|anymore|without you)\b/gi;

// ── ERAVOS's own friction lexicon, imported not duplicated (§5.5) ──────────
// Mirrors kernel.js LATTICE_FRICTION_WORDS. If ERAVOS is present the real one
// is used; this is the fallback so the module stands alone (§5.9 sovereignty).
export const ERAVOS_FRICTION_WORDS = new Set([
  'always', 'never', 'fine', 'whatever', 'nothing', 'should', "shouldn't",
  'supposed', 'again', 'still', 'ignored', 'ignoring', 'defensive', 'shut',
  'shutdown', 'withdrew', 'withdrawn', 'silent', 'silence', 'stonewalling',
  'blame', 'blamed', 'fault', 'unheard', 'dismissed',
]);

function countMatches(text, re) {
  const m = String(text).match(re);
  return m ? m.length : 0;
}

function hits(text, patterns) {
  const found = [];
  for (const re of patterns) if (re.test(text)) found.push(re.source.slice(0, 28));
  return found;
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

/**
 * Pure function. Exported standalone so it can be reasoned about and tested
 * without a bus, same discipline as every other core function here.
 *
 * @returns {{engagement:number, approach:number, withdrawal:number,
 *            horsemen:object, bids:number, repair:number, loss:number,
 *            evidence:string[], modality:'text', substituted:true}}
 */
export function readTextAffect(text, frictionWords = ERAVOS_FRICTION_WORDS) {
  const t = String(text || '');
  const words = t.toLowerCase().match(/\b[a-z']+\b/g) || [];
  const n = Math.max(words.length, 1);

  // ── engagement from function words (Pennebaker) ──
  const approachTokens = countMatches(t, APPROACH_PRONOUNS);
  const distanceTokens = countMatches(t, DISTANCE_PRONOUNS);
  const impersonal     = countMatches(t, IMPERSONAL_FRAME);
  const addressed      = countMatches(t, DIRECT_ADDRESS);

  // normalised difference, scaled by utterance length so one pronoun in a
  // three-word line does not saturate (the saturation failure already
  // documented for signal-vector.js — not repeated here)
  const rawEngagement = (approachTokens - distanceTokens - impersonal * 1.5) / Math.sqrt(n);
  let engagement = clamp(rawEngagement, -1, 1);

  // ── Four Horsemen ──
  const horsemen = {
    criticism:     hits(t, HORSEMEN.criticism),
    contempt:      hits(t, HORSEMEN.contempt),
    defensiveness: hits(t, HORSEMEN.defensiveness),
    stonewalling:  hits(t, HORSEMEN.stonewalling),
  };
  const horsemenCount = Object.values(horsemen).reduce((s, a) => s + a.length, 0);

  // stonewalling and contempt are withdrawal-shaped; they pull engagement down
  if (horsemen.stonewalling.length) engagement -= 0.35;
  if (horsemen.contempt.length)     engagement -= 0.25;

  // ── bids and repair are approach-shaped; they pull it up ──
  const bidCount    = hits(t, BIDS).length;
  const repairCount = hits(t, REPAIR).length;
  if (bidCount)    engagement += 0.30;
  if (repairCount) engagement += 0.35;

  engagement = clamp(engagement, -1, 1);

  // ── loss / separation distress (GRIEF) ──
  const lossHits = countMatches(t, LOSS_VOCAB);
  const loss = clamp(lossHits / Math.sqrt(n) * 1.2, 0, 1);

  // ── ERAVOS friction words, reused ──
  const frictionHits = words.filter(w => frictionWords.has(w));

  const evidence = [
    `approach=${approachTokens}`, `distance=${distanceTokens}`, `impersonal=${impersonal}`,
    `addressed=${addressed}`, `horsemen=${horsemenCount}`, `bids=${bidCount}`,
    `repair=${repairCount}`, `loss=${lossHits}`, `eravosFriction=${frictionHits.length}`,
  ];

  return {
    engagement: Math.round(engagement * 10000) / 10000,
    approach:   engagement > 0 ? engagement : 0,
    withdrawal: engagement < 0 ? -engagement : 0,
    horsemen, horsemenCount,
    bids: bidCount, repair: repairCount, loss,
    frictionWords: frictionHits,
    evidence,
    modality: 'text',      // §17.5 — provenance on every emission
    substituted: true,     // NOT the video-derived construct. Never conflate.
  };
}

/**
 * Bus-attached bridge. Subscribes to transcript, emits real observations
 * into latent-model.js through its declared `observe()` API.
 */
export class TextAffectBridge {
  static UUID    = TAB_UUID;
  static VERSION = TAB_VERSION;

  /**
   * @param {object} opts
   * @param {object} opts.bus            AlkBus
   * @param {object} opts.latent         LatentModel instance (uses its public observe())
   * @param {Set}   [opts.frictionWords] ERAVOS's real LATTICE_FRICTION_WORDS if available
   */
  constructor({ bus, latent, frictionWords = ERAVOS_FRICTION_WORDS } = {}) {
    if (!bus)    throw new Error('[text-affect-bridge] bus is required');
    if (!latent) throw new Error('[text-affect-bridge] latent (LatentModel) is required');
    this._bus = bus;
    this._latent = latent;
    this._frictionWords = frictionWords;
    this._stats = { lines: 0, approach: 0, withdrawal: 0, horsemen: 0, bids: 0, repair: 0 };
    this._last = null;
  }

  start() {
    this._bus.on('alk.verbal.transcript', ev => this._onLine(ev.payload ?? ev));
    return this;
  }

  _onLine(p) {
    const text = p && p.text;
    if (!text) return;
    this._stats.lines++;

    const r = readTextAffect(text, this._frictionWords);
    this._last = r;

    // Feed latent through its OWN declared composite keys. Not a video event.
    if (r.approach   > 0.05) { this._latent.observe('sig.APPROACH',   r.approach);   this._stats.approach++; }
    if (r.withdrawal > 0.05) { this._latent.observe('sig.WITHDRAWAL', r.withdrawal); this._stats.withdrawal++; }
    if (r.horsemenCount) this._stats.horsemen += r.horsemenCount;
    if (r.bids)   this._stats.bids++;
    if (r.repair) this._stats.repair++;

    // Publish for anything else that wants it — the lattice reads this.
    this._bus.emit('alk.text.affect', { ...r, text, ts: p.ts ?? Date.now() });
  }

  get last() { return this._last; }

  /** §12.6 — diagnostic engine. */
  health() {
    return {
      version: TAB_VERSION,
      ...this._stats,
      status: this._stats.lines === 0 ? 'idle'
            : (this._stats.approach + this._stats.withdrawal) === 0 ? 'degraded'
            : 'healthy',
      note: 'engagement here is a text SUBSTITUTION, not the video-derived construct',
    };
  }
}
