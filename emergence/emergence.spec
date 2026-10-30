// EMERGENCE — project spec, written in Emerge.
// Declares the system this codebase is. Not documentation about the
// system — per emerge.spec's own claim, this IS the language the system
// is described in. Edit this file, everything that reads it updates.

version 0.1.0

// ─────────────────────────────────────────────────────────────────────────
// This system uses Emerge's DOMAIN 2 — SIGNAL vocabulary directly:
//   feedback = an_output_that_becomes_an_input
//   loop     = a_component_that_repeats
//   flow     = a_directed_path_a_signal_takes
// and DOMAIN 8 — LENS:
//   lens     = an_observer_that_annotates_without_changing_flow
// ─────────────────────────────────────────────────────────────────────────

system Emergence {
  version   : semver  = 0.1.0
  intent    : string  = a_systems_thinking_substrate_where_observation_creates_structure_that_feeds_back_into_observation
  substrate : string  = warp                    // execution: Event -> Gate -> Axiom -> Stream -> StreamLog
                                                  // ../warp -- the FOUNDATION, a sibling of this project,
                                                  // not vendored inside it. See MANIFEST.json's "shared" field.
  language  : string  = emerge                  // description: this file and every component.spec below it
  law       : string  = AXIOMS_v3.1              // constraint: every component answers to this before anything else
}

// ─────────────────────────────────────────────────────────────────────────
// THE LOOP THIS PROJECT IS BUILT AROUND
// ─────────────────────────────────────────────────────────────────────────
// rfr2 observes  — a lens. maps conditions and relations. never gates,
//                   never creates, only annotates what's already there.
// CFR creates    — a gate. turns Observation into Structure: computes
//                   sigma, delta, gap, resonance from what rfr2 saw.
// feedback-loop-buffer — CFR's output becomes rfr2's next input. This is
//                   the literal mechanism of Emerge's `feedback` primitive:
//                   without something holding the window between what was
//                   just created and what gets observed next, there is no
//                   loop — only a one-shot pipe.
//
// seam Emergence.Loop {
//   from: CFR.output
//   via:  feedback-loop-buffer
//   to:   rfr2.input
// }

component "feedback-loop-buffer" {
  root        : Signal                          // this component IS a feedback primitive, not a utility
  role        : loop                             // domain "signal": loop = a_component_that_repeats
  mechanism   : feedback                          // domain "signal": feedback = an_output_that_becomes_an_input
  spec        : "./components/feedback-loop-buffer/component.spec"
  status      : implemented                       // 43/43 tests passing, live integration verified
  note        : "was storage-only until loop.js wired it to actually feed back -- see seam Emergence.Loop below"
}

component "rfr2-observer" {
  root        : Lens
  role        : observation
  wraps       : "vendor/rfr2/field/relational.js"  // real, unmodified RelationalModule
  new_glue    : "sentiment-scorer.js — domain-agnostic lexicon scorer, not vendored, feeds a real rfr2 event contract nothing in rfr2 itself produces"
  spec        : "./components/rfr2-observer/component.spec"
  status      : implemented
  known_gap   : "rupture_severity pinned — needs alk.latent.update, whose real producer requires multimodal input this text-only pipeline doesn't have. meaning_charge and decay_score are both fully live."
}

component "cfr-creator" {
  root        : Gate
  role        : structure_creation
  wraps       : "vendor/rfr2/cfr-kernel/physics.js"  // real attractor gravity + cluster convergence, not a made-up stress formula
  spec        : "./components/cfr-creator/component.spec"
  status      : implemented
  note        : "REBUILT — creates TOWARD an explicit target (end-state|idea|person), never inferred. See spec's revision note."
}

component "associative-lattice" {
  root        : Record
  role        : resonance_graph
  wraps       : "vendor/rfr2/lattice/lattice.js"
  spec        : "./components/associative-lattice/component.spec"
  status      : implemented
  note        : "REBUILT — resonance = shared invariants (Jaccard), not physics-noise similarity. See spec's revision note."
}

component "causal-graph" {
  root        : Record
  role        : causal_dag
  wraps       : "vendor/rfr2/causality/index.js"
  spec        : "./components/causal-graph/component.spec"
  status      : implemented
  note        : "REBUILT — causal vs observational is determined by real elapsed time between creations, not assumed from adjacency. See spec's revision note."
}

component "event-ledger" {
  root        : Record
  role        : authoritative_history
  wraps       : "vendor/rfr2/ledger/index.js"
  persisted_by: "vendor/jaa/{FileStore,FileRefs}.js"
  spec        : "./components/event-ledger/component.spec"
  status      : implemented
  note        : "REBUILT -- real cross-restart durability via ported Jaa persistence, hash-chained. See spec's revision note."
}

// Sigma, applied literally per Emerge's own canonical definition:
//   sigma = divergence_from_baseline
//   observation = the_result_of_applying_sigma_to_a_baseline
// associative-lattice and causal-graph both replayed their ENTIRE
// persisted chain on every restart (v0.4) -- correct, but unbounded
// cost for a long-running project. v0.5 closes it: periodic full-state
// BASELINEs, and only the real sigma (the chain segment since the last
// baseline) gets replayed. Not a generic checkpoint scheme invented for
// this -- this project's own vocabulary already named the concept.
seam Emergence.SigmaSnapshot {
  applies_to : [associative-lattice, causal-graph]
  baseline   : "full serialized state, written every snapshotInterval commits (default 25, stated/tunable)"
  sigma      : "the chain segment between head and the last baseline -- what actually needs replaying on restart"
  inspect    : "loop.sigma() -> { lattice, causal } current divergence size per component"
}

// END-STATE FIRST, REVERSE CAUSAL CONDITION MAPPING: forward causal
// classification (causal-graph's normal job) asks "given two things
// that happened, were they causally linked going forward?" This is the
// inverse question: "given an end-state that was actually reached,
// what conditions causally preceded it, walking BACKWARD?" Built on
// causality/index.js's own traceToRoot(), which already walked
// backward through only real causal/rule edges (observational edges
// break the trace) -- it just wasn't exposed anywhere until now.
// Combined with associative-lattice's per-node invariant lookup so the
// backward path shows not just THAT nodes were causally linked, but
// WHAT conditions (trajectory, rupture, decay, convergence state) held
// at each step.
seam Emergence.EndStateFirst {
  trigger  : "the moment a tick's cfr-creator output shows real convergence (created.cluster is truthy) -- not merely that a target was set"
  mechanism: "loop.traceEndState(nodeId) = causal-graph.traceToRoot(nodeId) + associative-lattice.getInvariants(each step)"
  surfaced_as: "tick()'s return value includes endStateConditions automatically -- not something you have to separately query for once an end-state is actually reached"
  proven_by: "test/loop.test.js: artificial 9.5-tick gap forces an observational break, traceToRoot correctly stops there rather than walking to genesis regardless -- and a full loop test confirms endStateConditions populates the moment real convergence happens, stays honestly null otherwise"
}

// Jaa: the persistence substrate. Ported (not vendored-as-is, since the
// source was PHP) from Jaa.zip's src/Persistence/* -- Canonicalize,
// FileStore, FileRefs, Recovery. The much larger SQL engine (Gates for
// DDL/DML/query planning) in that upload was NOT ported -- Emergence
// needs durable content-addressed storage, not a SQL database, and
// AXIOMS Sec0.5/Sec16.4 (complexity earns its existence) says don't
// build the rest until something here actually needs it.
component "jaa-persistence" {
  root        : Record
  role        : content_addressed_storage
  ported_from : "Jaa.zip / src/Persistence/{Canonicalize,FileStore,FileRefs,Recovery}.php"
  location    : "vendor/jaa/"
  status      : implemented
  scope_note  : "Only the persistence layer. The SQL engine (Gates/Database, Gates/Query/SQL -- ~30 files) was deliberately not ported -- out of scope for what this project needs."
  verified_by : "17-test suite: canonicalize determinism, content-addressing, dedup, cross-restart durability, ref prefix listing, WAL crash-recovery replay"
}

// LLM request contract -- NEW content, not a port (checked: no LLM
// contract exists anywhere in any upload). Follows rheon-idea-os's own
// real seam-contract format. Status: draft -- no component calls an LLM
// yet, this declares the seam before the implementation exists,
// per Sec3.3 map before build.
component "llm-contract" {
  root     : Record
  role     : request_contract
  status   : draft
  location : "contracts/LLM_CONTRACT.js"
  verified_by: "contracts/test/llm-contract.test.js -- shape validation, 8 tests. No bridge implementation exists yet to test real behavior against."
}

// server.js -- zero-dependency HTTP+SSE interface to the loop. Architecture
// adapted from rheon-idea-os's real server pattern (route -> tick ->
// broadcast -> ledger), rebuilt without express to hold this project's
// zero-runtime-deps discipline. Verified with a real SSE client receiving
// a real broadcast, not just a 200 response.
component "server" {
  root     : Gate
  role     : http_interface
  location : "server.js"
  adapted_from : "build-tools/rheon-idea-os/server/index.js (architecture only -- rebuilt without express)"
  status   : implemented
  verified_by: "test/server.test.js -- 11 tests, real server + real HTTP calls + real SSE broadcast, stress-tested 5x for timing reliability"
}

component "idea-store" {
  root     : Record
  role     : idea_registry
  location : "components/idea-store/"
  spec     : "./components/idea-store/component.spec"
  refactored_from : "build-tools/rheon-idea-os/storage/IdeaStore.js -- real API kept faithful, rebuilt onto Jaa persistence instead of raw JSONL files"
  status   : implemented
  note     : "REBUILT AGAIN -- mutations (add/link) are now real WARP Gates with real hard Axioms, not plain function calls. Was the one component in this project inconsistent with its own architecture. See spec's revision note."
  verified_by: "12 tests including real Axiom rejection, rejected-mutation-doesn't-corrupt-state, real StreamLog entries, real cross-restart durability, end-to-end proof through the real HTTP server"
}

// pattern-engine -- built in response to a direct request for "a
// pattern engine, with pattern memory," split explicitly into three
// possible meanings before building (prediction, recall, rule
// generation) since they're different builds with different risk
// profiles. Rule generation is forge's territory, not touched.
component "pattern-engine" {
  root     : Record
  role     : recall_and_prediction
  location : "components/pattern-engine/"
  spec     : "./components/pattern-engine/component.spec"
  found_in : "scanners/crystalball-test-suite.html's PredictiveEngine -- real Markov transition tracking, the basis for prediction here"
  status   : implemented
  verified_by: "10 tests including real recall, real prediction confidence, real cross-restart durability, real StreamLog dispatch"
}

// space-distance -- built for a genuinely long-distance relationship,
// found a real gap in Eravos's own computeRelationalHealth() (zero
// distance-awareness) and hooked directly into it.
component "space-distance" {
  root     : Record
  role     : cadence_and_timezone_health
  location : "components/space-distance/"
  spec     : "./components/space-distance/component.spec"
  found_gap_in: "eravos/shared/eravos-kernel.js's computeRelationalHealth()"
  status   : implemented
  verified_by: "12 tests including two real bug-regression tests -- an asymmetric timezone-overlap bug and a zero-variance-history bug, both found by testing, not assumed"
}

// The assembled loop — real, running, tested. See loop.js and test/loop.test.js.
// target (end-state|idea|person) is optional per tick — feedback-loop-buffer
// now actually closes the loop: omit target and the previous tick's target
// is reused (an output becoming an input, per Emerge's own definition),
// not silently invented from nothing.
seam Emergence.Loop {
  from: rfr2-observer.output
  via:  feedback-loop-buffer       // ACTUALLY feeds back now — see loop.js's tick()
  to:   cfr-creator.input          // target optional; defaults to feedback's last target
  then: [associative-lattice, causal-graph, event-ledger]   // parallel record layer, ledger now durable
}
