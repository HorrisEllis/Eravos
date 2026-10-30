// causal-graph -- component spec, in Emerge. REBUILT four times.
// v0.2: adjacency -> real dt-determined causality. v0.3: added Jaa
// durability, last-tick-only rehydration. v0.4: full-chain replay
// (correct, unbounded cost). v0.5: sigma-baseline snapshotting (bounded).

version 0.6.0
domain "record"

component CausalGraph {
  root       : Record
  implements : [causal_dag]

  wraps        : "../../vendor/rfr2/causality/index.js"        // real causal store, real edge-type taxonomy
  persisted_by : "../../vendor/jaa/{FileStore,FileRefs}.js"     // same pattern as event-ledger

  // Causality is DETERMINED BY the amount of time in between -- not
  // assumed from adjacency. dt is real elapsed simulation time (physics
  // world tick, per AXIOMS Sec3.2).
  gate causal_record {
    condition : creation_occurred
    mechanism : "dt = tick_now - tick_previous. dt <= causalWindowTicks (stated default 0.5) -> causal/rule. dt > causalWindowTicks -> observational. Then content-address + hash-chain the record to emergence/causal/head."
    result    : { nodeId, dt, edgeType, rejected, hash }
    emits     : [causal:recorded]
  }

  // REVERSE CAUSAL CONDITION MAPPING: traceToRoot walks BACKWARD from a
  // node through only real causal/rule edges -- observational edges
  // break the trace (the real store's own C-3 invariant: "observational
  // edges are sideband annotations, never traversed"). Not a new
  // algorithm: this method already existed, unexposed, in
  // vendor/rfr2/causality/index.js. Wired through here.
  gate trace_to_root {
    mechanism : "walk backward from nodeId while the incoming edge is causal/rule; stop at the first observational edge or missing parent"
    result    : "{ path, depth, truncated }"
    proven_by : "direct test: 5 creations, an artificial 9.5-tick gap between creation:2 and creation:3 forces an observational edge there; traceToRoot('creation:4') returns exactly ['creation:3','creation:4'] -- proves the trace genuinely stops at the boundary, not that it always walks to genesis regardless"
  }

  rehydration_on_restart {
    mechanism  : "sigma baselines, same mechanism as associative-lattice. Every snapshotInterval commits, a BASELINE (the full causal edge set, tracked directly since the real store exposes no edge-list getter -- checked its source) is written to emergence/causal/baseline. Restart loads it directly and replays only the real sigma since."
    proven_by  : "test/loop.test.js: same scenario as lattice -- sigmaSize() shrinks after baseline, and a restart's next tick still computes a real dt against the true prior tick with no false diamond-parent rejection, proving the baseline correctly seeded the real causal store"
    prior_gap  : "v0.4 replayed the ENTIRE chain from genesis on every restart. Closed here."
  }

  stated_threshold: "causalWindowTicks defaults to 0.5 simulation-time units -- a stated, tunable default, not a discovered constant."

  status: implemented
  verified_by: "direct Gate test proving dt=0.2 -> causal/rule and dt=4.7 -> observational + full loop integration test including a real-process-restart test proving dt after restart is a real number against the true prior tick, not null as if this were the first creation ever"
}
