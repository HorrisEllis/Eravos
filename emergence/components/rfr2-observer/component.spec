// rfr2-observer — component spec, in Emerge.

version 0.4.0
domain "signal"

component RFR2Observer {
  root       : Lens
  implements : [observation]                       // domain "lens": lens = an_observer_that_annotates_without_changing_flow

  wraps : "../../vendor/rfr2/field/relational.js"    // real, unmodified RelationalModule — not reimplemented

  // ── STRUCTURE ────────────────────────────────────────────────────────
  compartment bridge {
    seam kernel_adapter {
      from: warp.Stream
      to:   RelationalModule
      // RelationalModule expects an ALK kernel: emit(type,payload,meta),
      // subscribe(pattern,handler)->unsub. kernel-adapter.mjs is the
      // smallest object satisfying that contract — not a reimplementation
      // of the real ALK kernel, which is a much larger sovereign system.
    }
  }

  gate rfr2_observe {
    condition : text_is_provided
    result    : { summary, health }
    emits     : [rfr2:observed]
  }

  // ── WHAT'S ACTUALLY LIVE VS PINNED ──────────────────────────────────
  // meaning_charge  : LIVE — verified varying against different real text
  // decay_score     : LIVE — sentiment-scorer.js (NEW, not vendored) now
  //                    feeds alk.verbal.analysis.sentiment, which nothing
  //                    in rfr2 itself actually produces. Domain-agnostic
  //                    lexicon scorer, not tuned to any specific subject.
  // rupture_severity : still pinned to default — needs alk.latent.update,
  //                    whose real producer (LatentModel) requires
  //                    multimodal input (face/body/voice/speech) this
  //                    text-only pipeline doesn't have. Not faked.
  //
  // FOUR ADDITIONAL SIGNALS, all real, all from vendor/rfr2/liminal/,
  // all wired through Liminal's own real bus (createBus() — no adapter
  // needed, unlike RelationalModule's ALKModule kernel contract):
  //   oscillatory    : real pendulum math (period/amplitude/damping) +
  //                    intermittent-reinforcement/approach-retreat detection
  //   relationalGaps : gaslighting (6 layers), manipulation, control patterns
  //                    (Liminal's OWN RelationalModule -- name collision
  //                    with field/relational.js's class, aliased on import)
  //   reversal       : meaning inversions ("fine" meaning not fine, etc.)
  //   negativeSpace  : what's systematically avoided across a rolling window
  //
  // FIVE MORE SIGNALS, same wiring pattern, same shared bus:
  //   shadow         : unspoken emotional/cognitive material
  //   assumption     : load-bearing assumptions treated as fact
  //   structural     : the conversation's own implicit power geometry
  //   existential    : identity/meaning concentrated in a single source
  //   contrastive    : stated position vs. what the text is actually doing
  //
  // HONEST CALIBRATION, checked directly: 8 of these 9 signals verified
  // to stay null on ordinary neutral text ("the meeting is at 3pm
  // tomorrow", "the weather is nice today"). `assumption` is the one
  // exception -- its real threshold (composite < 0.18, hardcoded, not
  // configurable -- checked its constructor) fires on any unhedged
  // declarative sentence. Not a bug in this wiring; verified to be the
  // module's actual designed behavior. Treat assumption firing as a much
  // weaker signal than the other eight.
  // All four verified: honest null on neutral text, real detection on
  // matching text, and independently selective when attached to the
  // same bus (one signal firing doesn't cause false positives on the others).

  status: implemented
  verified_by: "direct Gate test + full loop integration test — meaning_charge AND decay_score both shown to vary across distinct real inputs; sentiment-scorer.js has its own 8-test suite; oscillatory/relational-gaps/reversal-negspace/shadow-etc each have their own test suites (20 tests total) covering honest-null, real-positive, cross-signal selectivity, and two documented calibration limitations (assumption over-triggers on neutral text; affectiveField never returns null and has a narrow trigger-vocabulary blind spot)"
  known_gap: "rupture_severity requires genuine multimodal input — no honest text-only path to unblock it. code and music Liminal modules deliberately left unwired -- domain-specific to code review / music, not relational text, out of scope for this observer."
  tenth_signal: "affectiveField -- different lineage (vendor/resonance-v5.1/relational-physics.js, not rfr2). Self-contained, zero deps. Two real syntax errors found and fixed in the source (missing/unclosed JSDoc comments swallowing a class declaration and two constants) -- the file had never been executed by anyone before this integration."
}
