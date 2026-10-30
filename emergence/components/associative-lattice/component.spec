// associative-lattice -- component spec, in Emerge. REBUILT four times.
// v0.2: physics-noise similarity -> Jaccard invariants. v0.3: added
// Jaa durability, last-node-only rehydration. v0.4: full-chain replay
// (correct, unbounded cost). v0.5: sigma-baseline snapshotting (bounded).

version 0.5.0
domain "record"

component AssociativeLattice {
  root       : Record
  implements : [resonance_graph]

  wraps        : "../../vendor/rfr2/lattice/lattice.js"        // real LatticeGraph + LatticeEngine
  persisted_by : "../../vendor/jaa/{FileStore,FileRefs}.js"     // same pattern as event-ledger

  // Resonance = shared INVARIANTS (Emerge domain "structure":
  // invariant = always_true_within_a_system), Jaccard-weighted.
  invariant_set {
    trajectory   : "rfr2-observer's summary.trajectory"
    rupture      : "rfr2-observer's summary.rupture_active"
    decay        : "banded low|mid|high from summary.decay_score"
    target_type  : "cfr-creator's target.type, if a target was given"
    convergence  : "cfr-creator's cluster.sig, or 'none' if not converged"
  }

  gate lattice_record {
    condition : observation_and_creation_provided
    mechanism : "extract invariant set, connect to previous node weighted by Jaccard(|shared|/|union|), then content-address + hash-chain the record to emergence/lattice/head"
    result    : { nodeId, invariants, nodeCount, edgeCount, edge, hash }
    emits     : [lattice:recorded]
  }

  rehydration_on_restart {
    mechanism   : "sigma baselines. Every snapshotInterval (default 25, stated/tunable) commits, a BASELINE -- full serialized graph state -- is written to emergence/lattice/baseline. Restart loads the baseline directly (one read) and replays ONLY the chain segment since it -- the real sigma, per Emerge's own canonical definition (emerge-language.spec: sigma = divergence_from_baseline)."
    proven_by  : "test/loop.test.js: 7 commits at snapshotInterval=3 writes baselines at commits 3 and 6, sigmaSize() shrinks back to 1 instead of growing to 7; a fresh process's next tick after that still reports the TRUE total (nodeCount=8, edgeCount=7), proving correctness held even though replay only touched the small sigma segment, not genesis-to-head"
    prior_gap  : "v0.4 replayed the ENTIRE chain from genesis on every restart -- correct, but unbounded cost for a long-running project. Closed here, not left stated-and-unaddressed."
  }

  status: implemented
  verified_by: "unit test on jaccard() math + Gate test proving matched states resonate at 1.0 vs 0.14 for a sharp shift + full loop integration test including a real-process-restart test proving the next tick after restart connects to the true prior node, not a fresh graph"
}
