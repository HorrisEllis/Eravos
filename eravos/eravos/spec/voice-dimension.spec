// voice-dimension — component spec, in Emerge.
// AXIOMS v3.1 is law. §6.3: entered in SPEC-REGISTRY.md on creation.

version 0.1.0
domain  "audio"
owner   "eravos/tabs/voice"          // §17.1
lifecycle "Implemented"               // §17.2
parent  "eravos-kernel"

// ─────────────────────────────────────────────────────────────────────
// SOURCE  (§17.5 — every output has provenance)
// ─────────────────────────────────────────────────────────────────────
// Rheon Voice v7. Scanned the full lineage: 16 uploads -> 54 files after
// recursive extraction -> 32 unique by SHA-256 (§9.5). v1 through v6 are
// single-file HTML; v7 is the only decomposed build and the only one with
// a README, a package.json and a stated invariant list. v7 is canonical.
//
//   js/analysis-engine.js  pitchEngine (L222), oscillationEngine (L185)
//   js/audio-engine.js     autocorrelation F0, RMS, ZCR, spectral centroid
//
// Both ported mechanically. Coefficients, thresholds and tags unchanged.

// ─────────────────────────────────────────────────────────────────────
// THE DIMENSION THIS ADDS  (§0.1 — measured, and a prior claim corrected)
// ─────────────────────────────────────────────────────────────────────
// I previously stated COHERENCE and ENGAGEMENT were the dimensions text
// could not reach. Measured, that was wrong: text-affect-bridge.js's
// sig.APPROACH/sig.WITHDRAWAL carry COHERENCE +0.3, so both close on text.
//
// Real coverage, per-dimension Kalman uncertainty. 0.500 = never observed:
//
//   dimension     text only   + voice    producer
//   VALENCE         0.046      0.039     sentiment
//   AROUSAL         0.144      0.046     lexical friction -> acoustic
//   SUPPRESSION     0.500      0.040     NONE -> jitter + shimmer
//   COHERENCE       0.065      0.040     sig.APPROACH -> HNR + F0 contour
//   ENGAGEMENT      0.055      0.039     pronoun SUBSTITUTION -> prosody
//
// SUPPRESSION is the dimension with no text producer at all. It is also the
// one the whole relational stack most needs: the gap between what is shown
// and what is felt. Voice is the first real measurement of it.

// ─────────────────────────────────────────────────────────────────────
// GROUNDING  (§0.1 — epistemically sourced, not chosen by taste)
// ─────────────────────────────────────────────────────────────────────
// jitter, shimmer and HNR are the standard acoustic voice-quality triad —
// the measures Praat computes, used clinically for vocal strain and studied
// as correlates of physiological arousal and affective stress.
//
//   jitter   cycle-to-cycle variation in fundamental frequency
//   shimmer  cycle-to-cycle variation in amplitude
//   HNR      periodic energy vs. aperiodic noise
//
// This is DIRECT measurement of vocal perturbation, not a lexical proxy.
// It is the thing text-affect-bridge.js was substituting for — and that
// substitution was benchmarked and shown NOT to unlock emo.dominant. Voice
// is not the same trick done better; it is a different kind of evidence.
//
// §1.1 restated: high jitter is not "anxious" or "lying." It is signal.
// Interpretation lives above this file, never inside it.

// ─────────────────────────────────────────────────────────────────────
// MAPPING  (§13.2 — every edge named, typed, with failure modes)
// ─────────────────────────────────────────────────────────────────────
// Every key below ALREADY EXISTS in latent-model.js's OBS_MODELS with its
// own noise model R. No vendor file is edited (§5.3). No video event is
// fabricated (§1.3). Fed through the declared observe() API only (§5.10).

edge stressed {
  when : "jitter > 0.08 AND shimmer > 0.15"
  to   : "sig.STRESS_ACUTE  { VAL -0.6, AR +0.8, SUP +0.3, COH -0.2 }  R 0.15"
  why  : "combined F0 and amplitude perturbation is the signature of vocal strain"
}
edge tense {
  when : "jitter > 0.05, amplitude stable"
  to   : "sig.COGNITIVE_LOAD  { VAL -0.2, AR +0.4, COH +0.3, ENG +0.2 }  R 0.20"
  why  : "effortful production, still engaged. COHERENCE RISES -- load is not fragmentation."
}
edge clear {
  when : "hnr > 0.7 AND jitter < 0.03"
  to   : "sig.GENUINE_ENGAGEMENT  { VAL +0.6, SUP -0.6, COH +0.6, ENG +0.7 }  R 0.15"
  why  : "relaxed unguarded phonation. One key, four dimensions."
}
edge dissonance {
  when : "F0 contour regularity < 0.3, >=5 voiced samples"
  to   : "sig.DISSONANCE  { COH -0.8, SUP +0.4, AR +0.3 }  R 0.15"
  why  : "prosodic incoherence, measured on the contour rather than inferred"
}
edge energy {
  when : "always, when voiced"
  to   : "alk.audio.frame -- a channel latent-model.js ALREADY subscribes to"
  why  : "an existing wire stops being dead. Nothing new declared."
}
edge tone {
  when : "always, when voiced"
  to   : "alk.verbal.analysis.tone { energy }"
  why  : "NervousSystemModule._energyWindow was EMPTY on text, so avg() returned
          0 and contributed 0.2 to dorsalScore from a channel never measured.
          With real audio that term becomes evidence instead of an artefact."
}

// ─────────────────────────────────────────────────────────────────────
// PER-SPEAKER BASELINE  (§12.4 — invariants crystallise from evidence)
// ─────────────────────────────────────────────────────────────────────
// Absolute jitter/shimmer are speaker-specific: vocal tract, age, health and
// microphone all shift them. A fixed global threshold would assert a constant
// that is really a variable -- a §0.1 violation. Anomalies are z-scored
// against this speaker's own rolling baseline, and NO anomaly is claimed
// until 5 readings have warmed it. Locked by test.

// ─────────────────────────────────────────────────────────────────────
// ABSTENTION  (§1.2 — a silent failure corrupts the causal record)
// ─────────────────────────────────────────────────────────────────────
// A real bug, found by the benchmark and fixed:
//   `sufficient` originally checked only prosodyTag !== 'insufficient'.
//   Pure silence therefore reported sufficient=true with jitter=0, shimmer=0
//   -- indistinguishable from a perfectly stable voice. Absence of evidence
//   becoming evidence, exactly the class flagged elsewhere in this codebase.
//   Now 'unvoiced' abstains, emits alk.voice.abstained, and produces ZERO
//   observations. Regression test locked in.

// ─────────────────────────────────────────────────────────────────────
// TAB IS A MODULE  (§5.9 / §5.10 / §5.11 / §5.12)
// ─────────────────────────────────────────────────────────────────────
module voice {
  sovereign  : "owns its own state, lifecycle, diagnostics"
  contract   : "eravos/contracts/voice.contract.json -- inputs, outputs,
                failure modes, invariants, idempotency, all declared"
  handshake  : "mount() verifies bus, latent.observe(), audioEngine.snapshot()
                before anything starts. Never optimistically (§5.11)."
  ui         : "render() optional. Module runs headless (§5.12, §3.4)."
  diagnostic : "health() on all three layers (§12.6)."
  authority  : "owns AUDIO only. Never writes the text path's channels (§10.1)."
}

status: implemented
verified_by: "test/voice.test.mjs -- 23/23. Includes the silence-abstention
              regression, a hand-checkable jitter ratio, bounded-window under
              10k frames, null/NaN frames, and the uncertainty-convergence
              invariant. verify-voice.mjs is the named benchmark (§17.11),
              reporting the unfavourable silence case alongside the wins."
