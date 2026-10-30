# Working in this repo

AXIOMS v3.1 is law. Nothing here restates it; this is only what it means
mechanically when you commit.

## Before you push

```bash
node eravos/test/run-all.mjs      # must be 0 failed
```

There is a promote gate — the checks that blocked this repo's own builds
three times in one session (§17.10). It is not optional and not a formality:

- **every tab stylesheet has zero hardcoded hex, and zero `var(--x, #hex)`
  fallbacks.** A fallback is a hex wearing a `var()` costume; it silently
  bypasses the theme when a token is absent. If a token is missing, declare
  it in `shared/eravos-kernel.css` rather than papering over its absence.
- **kernel CSS braces balance, and no rule has an empty selector.**
- **contract `version` matches `VERSION`.** Drift is a bug (§5.4).
- **`window.ALK.ingest()` appears exactly once in the codebase.** One write
  authority (§10.1).
- **no person's name is hardcoded in the seeder.** Identity is data.

## Committing

One commit per verified state. The message says what changed, what it fixed,
and **what was measured** — not what was intended. If a number appears in a
message, the benchmark that produced it is named (§17.11).

If you found a bug in your own work, put it in the message. That is the
useful half of the record.

## What a commit must never do

- claim a test was run that was not run
- report the favourable case and omit the unfavourable one
- delete a decision silently — record the rejection (§17.3)
- widen a `catch` to make a failure quiet (§1.2)

## Tags

`vX.Y.Z` is only applied to a tree whose suite passes **at that tree**, not
at the tip. Verified here by checking out each tag and running it.

Two tags are deliberately **held**: Phase 1's `v1-foundation` and Phase D's
presence both require two real devices. A code review is not that test.
