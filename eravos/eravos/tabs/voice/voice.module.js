/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  VOICE TAB MODULE  ·  voice.module.js  ·  v0.4.0                        ║
 * ║  UUID: eravos-voice-module-0001-0000-000000000003                       ║
 * ║  HOOK: eravos.voice:module:00003                                        ║
 * ║  PARENT: eravos-kernel   CATEGORY: space                                ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * "Each tab should be a module." This is that contract, made explicit rather
 * than left as a naming convention.
 *
 * §5.9  sovereign — owns its own state, lifecycle, diagnostics
 * §5.10 interaction through contracts only — declared inputs/outputs below
 * §5.11 every boundary performs a handshake — mount() verifies before running
 * §5.12 the UI is disposable — render() is optional; the module runs headless
 * §3.4  raw execution before interfaces — prosody.js and voice-observer.js
 *       are exercisable with plain arrays; this layer only wires them
 *
 * ── INTERACTION CONTRACT (§5.10) ───────────────────────────────────────────
 *
 *   requires   { bus: AlkBus, latent: LatentModel }
 *   optional   { audioEngine }  Rheon Voice v7 AudioEngine, or anything with
 *                               snapshot() -> {pitch, amplitude, zcr, spectralCentroid}
 *   emits      alk.voice.prosody     one reading per utterance
 *              alk.voice.abstained   §1.2, announced not silent
 *              alk.audio.frame       existing latent channel, no longer dead
 *              alk.verbal.analysis.tone
 *   consumes   call:transcript_line | lattice:utterance  (utterance boundary)
 *   failure    no audioEngine        -> mount() throws, loud and named
 *              unvoiced / silence    -> abstains, emits alk.voice.abstained
 *   idempotent mount() twice is a no-op returning the same handle
 *
 * ── WHY THIS TAB EXISTS ────────────────────────────────────────────────────
 *
 * Measured: on the text-only path, SUPPRESSION stayed at uncertainty 0.500 —
 * never observed, no producer at all. With voice it reaches 0.040. That is
 * the dimension this tab adds, and it is added by measurement, not proxy.
 */

'use strict';

import { ProsodyWindow, PROSODY_VERSION } from './prosody.js';
import { VoiceObserver } from './voice-observer.js';

export const VOICE_MODULE_VERSION = '0.4.0';   // §5.4 — one version string
export const VOICE_MODULE_UUID    = 'eravos-voice-module-0001-0000-000000000003';

export const VOICE_MODULE_MANIFEST = Object.freeze({
  id: 'voice',
  uuid: VOICE_MODULE_UUID,
  version: VOICE_MODULE_VERSION,
  parent: 'eravos-kernel',
  children: ['eravos-voice-prosody-0001-0000-000000000001',
             'eravos-voice-observer-0001-0000-000000000002'],
  category: 'space',
  owner: 'eravos/tabs/voice',                 // §17.1
  lifecycle: 'Implemented',                    // §17.2
  spec: 'spec/voice-dimension.spec',           // §6.3
  requires: ['bus', 'latent'],
  optional: ['audioEngine'],
  emits: ['alk.voice.prosody', 'alk.voice.abstained', 'alk.audio.frame', 'alk.verbal.analysis.tone'],
  consumes: ['call:transcript_line', 'lattice:utterance'],
  dom_ids_exposed: ['panel-voice', 'voice-prosody-readout', 'voice-health'],
  kernel_hooks_called: ['mountVoiceModule', 'unmountVoiceModule', 'voiceHealth'],
});

export class VoiceModule {
  static UUID     = VOICE_MODULE_UUID;
  static VERSION  = VOICE_MODULE_VERSION;
  static MANIFEST = VOICE_MODULE_MANIFEST;

  constructor() {
    this._mounted = false;
    this._bus = null;
    this._latent = null;
    this._audio = null;
    this._window = null;
    this._observer = null;
    this._sampler = null;
    this._readings = 0;
  }

  /**
   * §5.11 — handshake before execution. Identity, capabilities and health are
   * checked here; nothing starts optimistically.
   */
  mount({ bus, latent, audioEngine = null, sampleMs = 33 } = {}) {
    if (this._mounted) return this;   // idempotent, per the contract above

    // §1.2 — loud, specific, names the module, the operation and what is missing
    if (!bus)    throw new Error('[voice.module] mount(): `bus` (AlkBus) is required — nothing to publish to');
    if (!latent) throw new Error('[voice.module] mount(): `latent` (LatentModel) is required — nothing to observe into');
    if (typeof bus.on !== 'function' || typeof bus.emit !== 'function') {
      throw new Error('[voice.module] mount(): `bus` does not satisfy the AlkBus contract (needs on/emit)');
    }
    if (typeof latent.observe !== 'function') {
      throw new Error('[voice.module] mount(): `latent` does not expose observe() — wrong version of latent-model.js?');
    }
    if (audioEngine && typeof audioEngine.snapshot !== 'function') {
      throw new Error('[voice.module] mount(): `audioEngine` must expose snapshot() -> {pitch, amplitude, zcr, spectralCentroid}');
    }

    this._bus = bus;
    this._latent = latent;
    this._audio = audioEngine;
    this._window = new ProsodyWindow();
    this._observer = new VoiceObserver({ bus, latent });

    // An utterance boundary closes the current prosodic window and reads it.
    // The transcript itself is not consumed here — that is the text path's
    // job (§10.1, one write authority per data type). This tab owns audio.
    this._unsub = [
      bus.on('alk.verbal.transcript', () => this.closeUtterance()),
    ];

    if (audioEngine && typeof setInterval === 'function') {
      this._sampler = setInterval(() => {
        try { this._window.push(audioEngine.snapshot()); }
        catch (e) { this._bus.emit('alk.voice.abstained', { reason: 'audioEngine.snapshot() threw: ' + e.message }); }
      }, sampleMs);
    }

    this._mounted = true;
    return this;
  }

  /** Feed one frame directly — §3.4, exercisable without any audio engine. */
  pushFrame(snap) {
    if (!this._mounted) throw new Error('[voice.module] pushFrame(): not mounted');
    this._window.push(snap);
    return this;
  }

  /** Close the current window, read it, observe it, start a fresh one. */
  closeUtterance() {
    if (!this._mounted) return null;
    if (this._window.frameCount === 0) return null;
    const reading = this._window.read();
    this._window.reset();
    this._readings++;
    this._observer.observe(reading);
    return reading;
  }

  /** §5.12 — optional. Removing this changes nothing about execution. */
  render(el) {
    if (!el || !this._observer) return;
    const last = this._observer.last;
    const h = this._observer.health();
    if (!last || !last.reading || !last.reading.sufficient) {
      el.textContent = h.status === 'idle' ? 'no audio yet' : 'listening — not enough voiced audio to measure';
      return;
    }
    const r = last.reading;
    el.textContent =
      `${r.prosodyTag}  ·  jitter ${r.jitter}  shimmer ${r.shimmer}  hnr ${r.hnr}  ` +
      `f0 ${r.meanF0}Hz  ·  ${h.baselineWarm ? 'baseline warm' : `baseline warming ${h.baselineFrames}/5`}`;
  }

  /** §12.6 — diagnostic engine. Answers "is this healthy right now". */
  health() {
    return {
      module: 'voice',
      version: VOICE_MODULE_VERSION,
      prosodyVersion: PROSODY_VERSION,
      mounted: this._mounted,
      hasAudioEngine: !!this._audio,
      framesBuffered: this._window ? this._window.frameCount : 0,
      utterancesRead: this._readings,
      observer: this._observer ? this._observer.health() : null,
      status: !this._mounted ? 'unmounted'
            : !this._audio && this._readings === 0 ? 'idle'
            : this._observer.health().status,
    };
  }

  unmount() {
    if (!this._mounted) return this;
    if (this._sampler) { clearInterval(this._sampler); this._sampler = null; }
    (this._unsub || []).forEach(fn => { try { fn(); } catch (_) {} });
    this._unsub = [];
    this._window = null;
    this._observer = null;
    this._mounted = false;
    return this;
  }
}

export function mountVoiceModule(opts) { return new VoiceModule().mount(opts); }
