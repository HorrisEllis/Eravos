// pattern-engine -- component spec, in Emerge.
// NEW component, not a port. Built in direct response to "a pattern
// engine, with pattern memory" -- but checked real code first rather
// than inventing from nothing.

version 0.1.0
domain "record"

component PatternEngine {
  root       : Record
  implements : [recall, prediction]

  found_in : "scanners/crystalball-test-suite.html's PredictiveEngine -- a real, small Markov transition-frequency tracker. That primitive is the real basis for this component's prediction half. Its AssociationEngine sibling was NOT used (overlaps with associative-lattice); the file's GPGPU audio/video processors are out of scope entirely."

  // "pattern engine with memory" was explicitly split into three
  // possible meanings before building: prediction, recall/matching, and
  // rule generation. Rule generation (patterns compiling into new
  // detection code that runs itself) is forge's territory -- a
  // different risk category, flagged earlier, not touched without
  // explicit sign-off, which hasn't been given. Prediction and recall
  // are built here.

  gate pattern_observe {
    mechanism : "signature(tickResult) -> {trajectory, rupture, decay band, convergence state, WHICH of the 10 observer signals fired}. Richer than associative-lattice's invariant set (doesn't track which gap signals fired) -- built for pattern recognition specifically, not resonance weighting."
    result    : { signature, recall, prediction }
    emits     : [pattern:observed]
  }

  recall {
    mechanism  : "real exact-match lookup against persisted pattern memory -- NOT fuzzy similarity (that's associative-lattice's job, not duplicated here)"
    result     : "{ seenBefore, count, priorNodeIds, firstSeen } -- count is prior occurrences, before this tick is recorded"
  }

  prediction {
    mechanism  : "given the current signature, what signature has historically followed it and how often -- real transition counts, null until a transition has genuinely repeated at least once"
    result     : "{ mostLikely, confidence, candidateCount } | null"
  }

  persistence: "different pattern than the append-only chains elsewhere (ledger/lattice/causal-graph): pattern memory is AGGREGATE mutable state (counts, not an immutable sequence), so it's one current-state blob via Jaa's FileStore+FileRefs, write-through on every observation -- a different, still-real use of the same primitives, not a new storage style invented from scratch."

  status: implemented
  verified_by: "10 tests: pure-function signature determinism, signature keyed on WHICH signals fired not their values, real recall on genuine repeats, prediction staying honestly null until a transition repeats, real confidence once one does, real cross-restart durability, real StreamLog dispatch entries, real aggregate stats"
}
