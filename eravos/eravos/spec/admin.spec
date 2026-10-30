// admin — component spec, in Emerge.
// AXIOMS v3.1 is law. §8.5: no code before a spec file exists.
// §6.3: entered in SPEC-REGISTRY.md on creation.

version 0.5.0
domain  "system"
owner   "shared/eravos-admin.js"     // §17.1 — exactly one authority
lifecycle "Implemented"              // §17.2
parent  "eravos-kernel"

// ─────────────────────────────────────────────────────────────────────
// WHY  (§16.1 — the nearest gap)
// ─────────────────────────────────────────────────────────────────────
// Identity was a constant, not data. `seedContainedAccounts()` force-seeded
// the partner account on EVERY page load:
//
//     existing['raven'] = Object.assign({}, existing['raven']||{}, {...});
//
// so any rename made anywhere in the UI was silently reverted on the next
// reload. The edit appeared to work and then quietly undid itself — §1.2,
// a silent failure that corrupts state rather than crashing.
//
// Fixed structurally (§5.3), not patched at the call site: the partner slot
// is seeded ONCE, if and only if no partner account exists at all. After
// that this engine is the single write authority (§10.1) and the seeder
// defers to it.

// ─────────────────────────────────────────────────────────────────────
// THE CENTRAL DISTINCTION  (§17.3 — judgment recorded, not buried)
// ─────────────────────────────────────────────────────────────────────
operation rename {
  means : "the SAME person, a different label"
  data  : "follows them — their feelings, ruptures, vault, codex, growth are theirs"
  peer  : "PRESERVED. Still the same party to the connection."
  crypto: "PRESERVED."
}

operation replace {
  means : "a DIFFERENT person in the slot"
  data  : "does NOT follow. Migrating a previous partner's logged feelings into
           a new person's namespace would be false on its face, and would
           corrupt every downstream relational derivation that reads it."
  peer  : "NEW identity issued. §17.5 — provenance is not inherited."
  crypto: "REGENERATED. A new party cannot hold the old party's key."
  pair  : "torn down. The connection is established fresh."
}

// Offering only one of these would force the wrong one. Both exist, and the
// UI makes the difference explicit rather than leaving it to a guess.

// ─────────────────────────────────────────────────────────────────────
// DESTRUCTIVE OPERATIONS  (§0.3, §9.4, §1.2)
// ─────────────────────────────────────────────────────────────────────
// §0.3  an export snapshot is taken BEFORE anything moves, and returned to
//       the caller whether or not they asked for it.
// §9.4  export is first-class, not an afterthought.
// §1.2  `disposition` (archive | purge) has NO DEFAULT. It decides whether a
//       real person's logged history is kept. Choosing it silently on the
//       caller's behalf is not acceptable.
// §1.2  every operation returns a report naming each key touched. Never a
//       bare boolean, never "done".

// ─────────────────────────────────────────────────────────────────────
// CO-CREATION TEARDOWN
// ─────────────────────────────────────────────────────────────────────
// Clears the PAIR: partner mirrors, the shared_ namespace, outbox, pipeline
// code, invite state, and crypto identity keys so the next connection
// handshakes fresh. Nineteen keys named explicitly (§13.2) rather than
// matched by a loose wildcard that could take something unintended.
//
// NEITHER person's own journal, vault, codex or feeling history is touched.
// Those are individual, not shared. Tested.

// ─────────────────────────────────────────────────────────────────────
// THEMES  (§16.5 — delete before add)
// ─────────────────────────────────────────────────────────────────────
// raven-theme, golden-theme and romeo-theme are RETIRED. One remains: the
// unnamed default, "🔥 Original Fire".
//
// This cost nothing because 01-ARCHITECTURE.md §2's own rule was already
// being followed everywhere — no tab defines its own palette, every colour
// is a kernel CSS custom property. Removing the alternates changed ZERO tab
// stylesheets. Retired names are kept in RETIRED_THEMES so purgeThemes()
// can strip stale classes from devices that ran an earlier build (§0.3 —
// the migration path is information).
//
// Two retired theme setters were shims rather than deletions, because cached
// HTML may still have onclick handlers bound. A silent ReferenceError is the
// worse failure. Also removed: a SECOND live definition of setRavenTheme()
// shadowing the first — exactly the silent-precedence shape SISO Design Law
// 1 forbids.

// ─────────────────────────────────────────────────────────────────────
// FOUND BY TEST, NOT BY REVIEW  (§0.1)
// ─────────────────────────────────────────────────────────────────────
// The end-to-end replacement test reported `status: 'orphaned-data'` after a
// clean archive. Cause: the orphan detector's character class included '_',
// so /^([a-z0-9_-]+)_/ matched greedily across the entire key and resolved
// an archived key to a nonsense prefix. Fixed to capture the first segment
// only. The test found it; a review would not have.

status: implemented
verified_by: "test/admin.test.mjs — 28/28, ending in the full replacement sequence"
