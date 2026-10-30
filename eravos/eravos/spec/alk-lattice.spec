// alk-lattice — component spec, in Emerge.
// AXIOMS v3.1 is law. §8.5: no code before a spec file exists.
// §6.3: this file is entered in SPEC-REGISTRY.md on creation.

version 0.1.0
domain  "relational"
owner   "eravos/shared/alk"          // §17.1 — exactly one authority
lifecycle "Implemented"              // §17.2 — Draft->Specified->Implemented->Verified->...

system AlkLattice {
  intent    : string = a_multidimensional_relational_lattice_where_every_utterance_becomes_an_interdependent_node
  substrate : string = eravos_appStream          // §5.2 — the bus that already exists
  law       : string = AXIOMS_v3.1
  replaces  : "buildLatticeData() — a flat top-60 word-frequency list with two booleans"
}

// ─────────────────────────────────────────────────────────────────────
// WHY THIS EXISTS  (§0.4 — what does this cost the system's future options?)
// ─────────────────────────────────────────────────────────────────────
// ERAVOS's lattice tab renders a word cloud. Its own UI copy promises
// "defensive word clusters"; its contract file says "hooks not yet
// scoped/typed in kernel." That is a §6.1 violation (documentation as
// aspiration) sitting in shipped code.
//
// A word cloud is FLAT: one axis (frequency), no edges, no relations.
// This replaces it with N graphs over the same nodes — every utterance
// linked to every prior utterance it genuinely resonates with, PER
// DIMENSION, and the relationship BETWEEN dimensions measured as its own
// first-class signal.

// ─────────────────────────────────────────────────────────────────────
// DIMENSIONS  (§13.2 — every edge is named, typed, with failure modes)
// ─────────────────────────────────────────────────────────────────────
dimension lexical {
  source     : "AssociationEngine, NEXUS-CODEC v1.9.0 codec.js:369-455"
  extract    : "content words >=4 chars, stopwords removed"
  similarity : jaccard
  threshold  : 0.15
  means      : "the same language came back"
  fails_when : "same meaning, different words -- no embedding model here (stated, not hidden)"
}

dimension signal {
  source     : "Resonance/src/extraction/heuristics.ts, ported"
  extract    : "15 continuous axes -- 5 cognition, 5 affect, 5 language"
  similarity : cosine
  threshold  : 0.85
  means      : "the shape of the expression matched"
  fails_when : "single short lines saturate; needs windowing (proven, test-locked)"
}

dimension needs {
  source     : "NeedsIntentModule, htl.js NEED-04. Rosenberg, Nonviolent Communication."
  extract    : "10 NVC needs, active + unmet"
  similarity : jaccard
  threshold  : 0.30
  means      : "the same underlying need was live"
}

dimension intent {
  source     : "NeedsIntentModule, htl.js NEED-04"
  extract    : "1 of 10 intents + strategy"
  similarity : categorical_exact
  threshold  : 1.0
  means      : "the same relational move was being made"
}

dimension affect {
  source     : "LatentModel, latent-model.js. Kalman/Bayesian sensor fusion."
  extract    : "5D latent -- valence, arousal, suppression, coherence, engagement"
  similarity : "1 - normalised_euclidean, gated on per-dimension uncertainty"
  threshold  : 0.75
  means      : "it felt structurally similar underneath"
  fails_when : "coherence/engagement have no text producer -- gated OUT, never scored as measured-low (§1.2)"
}

dimension temporal {
  source     : "eventTs (§3.2 -- logical time is the ordering axis)"
  extract    : "utterance timestamp"
  similarity : "decay over dt"
  threshold  : 0.20
  means      : "close enough in time to be one movement"
}

// ─────────────────────────────────────────────────────────────────────
// INTERDEPENDENCE  (the reason this is not six lattices in a trenchcoat)
// ─────────────────────────────────────────────────────────────────────
// Dimensions are not independent, and the DISAGREEMENT between them is
// the highest-value signal in the system. §13.3: every fault class is
// named before it occurs -- so is every resonance class.

interdependence {
  breadth   : "how many dimensions link this pair"
  pattern   : "which dimensions agreed and which explicitly did not"

  class FULL_RESONANCE {
    when  : "lexical AND needs AND affect all link"
    means : "a genuine repeat -- the same thing, the same way, feeling the same"
  }
  class SAME_NEED_DIFFERENT_WORDS {
    when  : "needs links, lexical does NOT"
    means : "circling one unmet need in new language. The single most useful
             thing this system can surface -- invisible to any word lattice."
  }
  class SAME_WORDS_DIFFERENT_FEELING {
    when  : "lexical links, affect does NOT"
    means : "the phrase survived but what is under it moved. Repair, or decay."
  }
  class SAME_INTENT_DIFFERENT_NEED {
    when  : "intent links, needs do NOT"
    means : "same relational move, different thing driving it. Strategy outliving its cause."
  }
  class SURFACE_ONLY {
    when  : "lexical links and NOTHING else does"
    means : "coincidence. THIS IS THE NOISE. Filtered, not rendered."
  }
}

// ─────────────────────────────────────────────────────────────────────
// SIGNAL / NOISE  (§0.5 -- complexity must earn its existence)
// ─────────────────────────────────────────────────────────────────────
// The filter is not a component. It falls out of the structure:
//   no dimension links     -> no edge at all
//   only lexical links     -> SURFACE_ONLY, recorded but not surfaced
//   >=2 dimensions link    -> signal
// Measured on the shipping flat lattice: 39 of 59 edges were weight 1.0
// with no relation to content. That is what this removes.

// ─────────────────────────────────────────────────────────────────────
// INVENTED, AND MARKED AS SUCH  (§0.1 -- invented certainty is not valid)
// ─────────────────────────────────────────────────────────────────────
invention text_engagement {
  why        : "PROVEN GAP: LatentModel's ENGAGEMENT dimension has exactly two
                producers, both video (posture lean, gaze). On text it stays at
                its initial uncertainty of 0.5. htl.js's Panksepp GRIEF circuit
                needs `arousal<0.3 && engagement<-0.2` for its 0.2 term; without
                it GRIEF tops out at 0.15 against a 0.2 activation threshold.
                Measured: emo.dominant === null for every line of a 7-line
                relational transcript. That null makes NeedsIntentModule's
                `unmet` list permanently empty."
  grounding  : "Pennebaker et al., function-word analysis: pronoun distribution
                tracks relational orientation. First/second-person plural and
                direct address mark approach; third-person and impersonal
                constructions mark distancing."
  mechanism  : "engagement = (we/us/our/you-directed) - (they/it/one/impersonal),
                normalised, emitted as a REAL observation with its own R"
  status     : "SUBSTITUTION, not a validated measure. Verified only that it
                lifts the circuits above threshold and that intent tracks content
                afterward. NOT validated against labelled ground truth. Do not
                report it as if it were the video-derived engagement."
}

invention gottman_text_observers {
  why        : "Panksepp circuits in htl.js are 55-90% face-cue driven per
                circuit. On text they sit just under threshold."
  grounding  : "Gottman & Levenson: criticism, contempt, defensiveness and
                stonewalling predict relational outcome and are LEXICALLY
                detectable. Gottman's bids-for-connection likewise."
  reuse      : "ERAVOS's own LATTICE_FRICTION_WORDS already contains
                stonewalling / blame / dismissed / defensive / ignored. Reused,
                not re-invented (§5.5 / §16.5)."
  maps       : "contempt+criticism -> RAGE, bids -> CARE, loss vocabulary -> GRIEF,
                question/topic expansion -> SEEKING"
  status     : "lexical proxies for affect circuits. Signal, not diagnosis (§1.1)."
}

// ─────────────────────────────────────────────────────────────────────
// TAKEN, AND DELIBERATELY NOT TAKEN  (§17.3 -- record the rejections)
// ─────────────────────────────────────────────────────────────────────
taken {
  "latent-model.js"        : "570 ln, vendored unmodified. Proven text-capable."
  "htl.js"                 : "2043 ln, vendored unmodified. 3 of 12 modules imported."
  "AssociationEngine"      : "codec.js:369-455, ported. Real cross-linking."
  "FrictionAnalyzer"       : "codec.js:291-358, ported. The missing AROUSAL producer."
  "heuristics.ts"          : "ported to signal-vector.js. 15 axes."
}

not_taken {
  "expression-engine.js"   : "face blendshapes. No camera in this path."
  "video-module.js"        : "same."
  "suppression-score.js"   : "leans on micro-expression rate. Video-era."
  "trajectory/*"           : "attractor landscape needs sustained multimodal history."
  "irs.js, gap-hunter.js"  : "1247+1102 ln, real and pure -- but overlap what the
                              9 unimported HTL modules do. §0.5: not yet earned."
  "codec GPGPU"            : "pixel/audio pipelines. Wrong problem."
  "9 of 12 HTL modules"    : "video-dependent or not additive yet. Present in the
                              vendored file, not imported. §16.5."
}

status: implemented
verified_by: "test/alk-lattice.test.mjs -- brutal per §12.1, and every INVENTED
              mechanism carries a test that fails if it stops working"
