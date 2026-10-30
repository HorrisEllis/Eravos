/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  ALK BOOT  ·  alk-boot.js  ·  v0.4.0                                    ║
 * ║  UUID: eravos-alk-boot-0001-0000-000000000000                           ║
 * ║  HOOK: eravos.alk:boot:00000                                            ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * §3.1 — bottom-up. This is the ONE place the ALK stack is assembled, and it
 * assembles in dependency order: bus, then latent, then observers, then the
 * modules that consume their output, then the lattice that consumes all of it.
 *
 * §5.11 — every boundary performs a handshake. Boot verifies each layer loaded
 * and each contract is satisfied before the next layer starts. A partial boot
 * is reported as a partial boot, never as a success.
 *
 * ── WHY A BOOT FILE AT ALL ─────────────────────────────────────────────────
 *
 * ERAVOS loads split-tab JS as CLASSIC scripts (`document.createElement
 * ('script')`, no type=module). The ALK layer is ESM. Rather than downgrade
 * eight modules to globals, this single ESM entry loads once from index.html
 * and publishes one frozen namespace at `window.ALK`. Tab scripts stay
 * classic and read from it. One seam, declared, instead of eight implicit ones.
 *
 * §5.12 — the UI is disposable. Everything here runs with no DOM at all.
 */

'use strict';

import { AlkBus, FrictionAnalyzer, ALK_BUS_VERSION } from './alk-bus.js';
import { LatentModel } from './latent-model.js';
import { TextAffectBridge, readTextAffect } from './text-affect-bridge.js';
import { extractHeuristic, toVector, AXES } from './signal-vector.js';
import { MultiLattice, RESONANCE_CLASSES, LATTICE_VERSION } from './multi-lattice.js';
import { DIMENSIONS, DIMENSION_IDS } from './dimensions.js';
import {
  NervousSystemModule, EmotionalSystemsModule, NeedsIntentModule,
} from './htl.js';
import { VoiceModule, VOICE_MODULE_MANIFEST } from '../../tabs/voice/voice.module.js';
import { ProsodyWindow } from '../../tabs/voice/prosody.js';

export const ALK_VERSION = '0.4.0';          // §5.4 — one version string
export const ALK_UUID    = 'eravos-alk-boot-0001-0000-000000000000';

const PULSE_FRAMES = 16;   // latent ticks per utterance, stated not magic

class AlkStack {
  constructor() {
    this.version = ALK_VERSION;
    this.booted = false;
    this.faults = [];      // §13.3 — kept, named, queryable
  }

  /**
   * @param {object} [opts]
   * @param {object} [opts.appStream]   ERAVOS Stream — mirrors ALK events to the kernel log
   * @param {Set}    [opts.frictionWords] ERAVOS LATTICE_FRICTION_WORDS, reused not duplicated
   * @param {number} [opts.maxNodes]
   */
  boot({ appStream = null, frictionWords = null, maxNodes = 500 } = {}) {
    if (this.booted) return this;
    const stage = (name, fn) => {
      try { return fn(); }
      catch (e) {
        // §1.2 — loud, specific, names the stage. Boot continues so a single
        // failed layer degrades the stack instead of blanking the app.
        this.faults.push({ stage: name, message: e.message });
        if (typeof console !== 'undefined') console.error(`[alk-boot] stage "${name}" failed: ${e.message}`);
        return null;
      }
    };

    this.bus      = stage('bus',      () => new AlkBus({ appStream }));
    this.latent   = stage('latent',   () => new LatentModel({ bus: this.bus }));
    this.friction = stage('friction', () => new FrictionAnalyzer());

    this.ns   = stage('nervous-system',  () => new NervousSystemModule({ bus: this.bus }).start());
    this.emo  = stage('emotional',       () => new EmotionalSystemsModule({ bus: this.bus }).start());
    this.need = stage('needs-intent',    () => new NeedsIntentModule({ bus: this.bus, emo: this.emo, ns: this.ns }).start());

    this.textBridge = stage('text-affect', () => new TextAffectBridge({
      bus: this.bus, latent: this.latent,
      ...(frictionWords ? { frictionWords } : {}),
    }).start());

    this.voice = stage('voice', () => new VoiceModule().mount({ bus: this.bus, latent: this.latent }));

    this.lattice = stage('lattice', () => new MultiLattice({ bus: this.bus, maxNodes }));

    // latest per-utterance state, captured off the bus rather than reached for
    this._lastNeed = null;
    this._lastProsody = null;
    this._lastField = null;
    if (this.bus) {
      this.bus.on('alk.htl.need.state', ev => { this._lastNeed = ev.payload; });
      this.bus.on('alk.voice.prosody',  ev => { this._lastProsody = ev.payload; });
      // Emergence publishes here when attached. Nothing subscribes if it is
      // not, and _lastField stays null — which is the abstention.
      this.bus.on('alk.field.state',    ev => { this._lastField = ev.payload; });
    }

    this.booted = this.faults.length === 0;
    this.degraded = this.faults.length > 0;
    return this;
  }

  /**
   * THE ONE ENTRY POINT. Text (and optionally voice frames) in, a fully
   * dimensioned lattice node out.
   *
   * §16.2 — the returned node carries every dimension that produced it, so
   * anything downstream can trace backward to the evidence.
   *
   * @param {string} text
   * @param {object} [meta] { ts, speaker, prosody }
   */
  ingest(text, meta = {}) {
    if (!this.bus) throw new Error('[alk] ingest(): stack not booted');
    if (typeof text !== 'string' || !text.trim()) return null;

    const ts = meta.ts || Date.now();
    const speaker = meta.speaker || 'self';

    // 1. friction -> the AROUSAL producer that sentiment alone never reaches
    const fr = this.friction ? this.friction.analyze(text) : null;

    // 2. lexical sentiment (kept local: no dependency on Emergence's scorer)
    const affect = readTextAffect(text);
    const sentiment = affect.loss > 0 || affect.horsemenCount > 0
      ? -Math.min(1, 0.3 + affect.loss * 0.4 + affect.horsemenCount * 0.2)
      : (affect.bids || affect.repair) ? 0.4 : 0;

    // 3. publish -> latent, HTL, voice all observe from the bus
    this.bus.emit('alk.verbal.analysis.sentiment', { score: sentiment, ts });
    this.bus.emit('alk.verbal.transcript', {
      text, ts, speaker,
      sentiment: { score: sentiment },
      ...(fr && fr.friction ? { friction: fr } : {}),
    });

    // 4. advance the filter, capturing the DELTA this utterance produced.
    //    The absolute fused state is near-identical between consecutive
    //    utterances by construction -- that is what smoothing does. The delta
    //    is what characterises THIS utterance. See dimensions.js `affect`.
    const before = this.latent ? { ...this.latent.state } : null;
    for (let i = 0; i < PULSE_FRAMES; i++) {
      if (this.latent) this.latent.tick();
      this.bus.emit('alk.kernel.pulse', { ts });
    }
    const after = this.latent ? this.latent.state : null;
    const latentDelta = (before && after) ? {
      valence:     +(after.valence     - before.valence).toFixed(4),
      arousal:     +(after.arousal     - before.arousal).toFixed(4),
      suppression: +(after.suppression - before.suppression).toFixed(4),
      coherence:   +(after.coherence   - before.coherence).toFixed(4),
      engagement:  +(after.engagement  - before.engagement).toFixed(4),
      uncertainty: Array.from(after.uncertainty),
    } : null;

    // 5. assemble the multidimensional node
    const sv = extractHeuristic(speaker, text);
    const node = {
      text, ts, speaker,
      dims: {
        signalVector: toVector(sv),
        signal: sv,
        // htl.js's face-driven circuits MERGED with the sovereign text
        // producer. Circuits win where present; text fills the gap that made
        // `unmet` permanently empty on text-only input — which was the
        // highest-value signal in the app going unrecorded, not a missing
        // field (§0.1).
        need: (typeof globalThis !== 'undefined' && globalThis.eravosUnmet)
          ? globalThis.eravosUnmet.merge(this._lastNeed, globalThis.eravosUnmet.read(text))
          : this._lastNeed,
        latent: after ? { ...after, uncertainty: Array.from(after.uncertainty) } : null,
        latentDelta,
        prosody: meta.prosody || this._lastProsody || null,
        // Shared grammar present in this utterance. Read from the store at
        // ingest time so a word taken up LATER does not retroactively rewrite
        // history — the node records what was shared when it was said.
        grammarTerms: (typeof globalThis !== 'undefined' && globalThis.eravosGrammar)
          ? globalThis.eravosGrammar.termsIn(text) : (meta.grammarTerms || []),
        friction: fr,
        textAffect: affect,
        // Emergence's relational field, if it is attached. Read at ingest so
        // the node records the state the relationship was ACTUALLY in when
        // this was said — not the state it is in now when you look back.
        // Null when Emergence is absent, and the dimension abstains on null
        // rather than guessing at a field it cannot see.
        field: meta.field || this._lastField || null,
      },
    };

    return this.lattice ? this.lattice.add(node) : { node, edges: {}, pairs: [] };
  }

  /** §12.6 — one call answers "is the whole stack healthy right now". */
  health() {
    return {
      version: ALK_VERSION,
      booted: this.booted,
      degraded: !!this.degraded,
      faults: this.faults,
      bus:     this.bus     ? this.bus.health()     : null,
      voice:   this.voice   ? this.voice.health()   : null,
      lattice: this.lattice ? this.lattice.health() : null,
      text:    this.textBridge ? this.textBridge.health() : null,
      latent:  this.latent  ? { dimensionsMeasured: this.latent.state.uncertainty
                                  .map((u, i) => u < 0.45 ? ['VALENCE','AROUSAL','SUPPRESSION','COHERENCE','ENGAGEMENT'][i] : null)
                                  .filter(Boolean) } : null,
    };
  }
}

const stack = new AlkStack();

// Frozen public surface. §5.10 — the contract, not the internals.
const ALK = Object.freeze({
  version: ALK_VERSION,
  uuid: ALK_UUID,
  busVersion: ALK_BUS_VERSION,
  latticeVersion: LATTICE_VERSION,
  stack,
  boot: opts => stack.boot(opts),
  ingest: (text, meta) => stack.ingest(text, meta),
  health: () => stack.health(),
  // classes, for anything that needs its own instance
  AlkBus, LatentModel, MultiLattice, VoiceModule, ProsodyWindow,
  TextAffectBridge, FrictionAnalyzer,
  NervousSystemModule, EmotionalSystemsModule, NeedsIntentModule,
  // pure functions and tables
  readTextAffect, extractHeuristic, toVector,
  AXES, DIMENSIONS, DIMENSION_IDS, RESONANCE_CLASSES,
  VOICE_MODULE_MANIFEST,
});

if (typeof window !== 'undefined') {
  window.ALK = ALK;
  // Reuse ERAVOS's own friction lexicon if the kernel has already loaded.
  const fw = window.LATTICE_FRICTION_WORDS instanceof Set ? window.LATTICE_FRICTION_WORDS : null;
  stack.boot({ appStream: window.appStream || null, frictionWords: fw });
  window.dispatchEvent(new CustomEvent('alk:ready', { detail: stack.health() }));
}

export default ALK;
export { ALK, AlkStack };
