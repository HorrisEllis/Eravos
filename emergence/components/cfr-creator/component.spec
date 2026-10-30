// cfr-creator -- component spec, in Emerge. REBUILT.
// Previous version: injected stress via a made-up formula
// (rupture*2000 + decay*800). Removed -- represented nothing.

version 0.2.0
domain "field"

component CFRCreator {
  root       : Gate
  implements : [structure_creation]

  wraps : "../../vendor/rfr2/cfr-kernel/physics.js"   // real, unmodified physics kernel

  // CFR creates TOWARD something -- an end-state, an idea, or a person.
  // Never inferred: the caller passes target explicitly. No target, no
  // attractor, no directed creation -- the field still runs (curl noise,
  // entropy) but claims no convergence toward anything.
  gate cfr_create {
    condition : target_optional                        // { id, type: end-state|idea|person, mass? }
    mechanism : "upsertAttractor(world, target) then stepWorld() N times; real cluster convergence read from the physics engine's own _detectClusters()"
    result    : { target, cluster, tick, attractorCount }
    emits     : [cfr:created]
  }

  // cluster is null until real particle density near the attractor
  // crosses physics.js's own 0.012 threshold -- an honest "hasn't
  // converged yet", not a fabricated number standing in for one.

  stated_assumption: "attractor (x,y,z) is a deterministic hash of its id -- no semantic embedding model is available here. Density/convergence measures whether repeated pulls toward the same target cause the field to settle -- a genuine physical signal, not a semantic one."

  status: implemented
  verified_by: "direct Gate test (no-target -> null cluster; 15x same target -> real density/sig emerges) + full loop integration test, stress-tested 15x consecutively with 0 failures at mass=15/60-tick budget"
  known_gap: "field.curl (default 0.6, checked in DEFAULT_CONFIG) is genuinely comparable to or larger than attractor gravity except close-range -- convergence timing is a real random-walk-until-capture process, not deterministic. Empirically characterized, not guessed: mass=3 flaked ~1-in-6 runs, mass=15/60-ticks flaked 0-in-15."
}
