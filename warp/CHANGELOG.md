# Changelog

## 1.5.0

- Added `firstSuccessPromotionPolicy` — a third pluggable `PopulationStore` promotion policy ("compounding"): crystallizes into the exact cache after 1 success above the fitness floor, instead of the default 3 retentions. Same shape as the existing `defaultPromotionPolicy`/`reuseCountPromotionPolicy`, opt-in, no change to existing callers.
- Added a top-level `index.js` entry point re-exporting `core` + `dispatch` + `plugins` — previously there was no single import path, only `core/index.js` and `dispatch/index.js` separately.

## 1.4.0

- Canonicalization pipeline (`canonicalize`, `fingerprintKey`, `similarityScore`) — deterministic key-sorted digests for exact-cache hits, plus structural fingerprinting for fuzzy matches.
- Fuzzy pre-generation reuse (`preGeneration: { enabled, threshold }`, opt-in) — skips generation, never verification, when something structurally close enough already exists in the population.
- Population lifecycle control — `decayRate`/`pruneThreshold` on `PopulationStore` (both 0 by default, no-op unless configured): untouched variants decay on every retain, variants below threshold prune, only the fittest variant per structural fingerprint survives.
- Two-stage generation (`runTwoStage`) — skips refinement on a clean skeleton pass, escalates on failed validation or low confidence.
- Gate fusion (`fuseChain`, `canFuse`) — runs two gates as one fused stage, preserving events that don't match the next stage instead of dropping them.
- Axiom cost weighting — axioms evaluate highest-weight-first (hard 1.0, soft 0.3 default) so an expensive soft check never delays a cheap hard rejection. `skipVerifiedSoftAxioms` (opt-in) allows a soft axiom to be treated as passed only on an already-scored digest; hard axioms are never skippable under any option.
- Structural delta cache (`deltaCache.js`, `DeltaCrystallizer`) — first entry per class stored in full, later entries as diffs, both reconstruct exactly.
- `reuseCountPromotionPolicy` — a second named promotion policy (2 hits, success rate >= 0.7), alongside the existing default.

## 1.1.0

- Token axis — `estimateTokens`, `scoreDefault` rewards staying under a token budget and penalizes exceeding it.
- Bounded exploration (`exploreWidth`) — runs multiple candidates per miss, keeps the highest-scoring one, not just the first that passes. Defaults to 1 (no behavior change, no extra cost) for existing callers.
- Rollback — `crystallizer.invalidate()` rolls back a promoted entry.
- Schema validation — `Gate.schema` validates required keys and types with no external dependency.

## 1.0.1

- `Gate.transform` now **returns** the events it produces instead of calling `stream.emit()` as a side effect — a gate can be tested completely in isolation, asserting on the returned array, with no `Stream` object involved at all.
- Digest fix: `computeDigest` now hashes the full canonicalized `event.data`, not just its keys — fixes a collision bug where two different requests with the same shape produced the same cache key. An axiom version bump also now changes the digest, so old cache entries don't silently survive a rule change.

## 1.0.0

- Initial primitives: `Event`, `Gate`, `Axiom`, `Stream`, `StreamLog`.
- `Axiom` as an enforced invariant with the same standing as `Gate` — a hard violation rejects a transform outright, logged, never silently completed.
