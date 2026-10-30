# SESSION LOG — 2026-08-01

Everything done in one session, including the parts that did not ship.

**§0.1 — how to read this.** The four commits are real: each tree is a state
that actually ran and passed its own suite, verified at commit time. They are
*not* a keystroke-level history — the work was done in a container and
reconstructed into commits from the artifacts of each verified stage. Finer
detail than one-commit-per-version, including everything below that never
reached a commit, lives here rather than being fabricated into a fake tree.

```
e8c72f5  baseline: ERAVOS 0.3.17 as received        138 files
958c3ed  feat(alk): lattice + voice — 0.4.0          31 changed, +6159 −38     46/46
512630f  feat(admin): people, connections — 0.5.0    15 changed, +1517 −212    74/74
0a00e02  feat(chat): choice, chat, surfaces — 0.6.0  20 changed, +2136 −325   110/110
```

---

## Part 1 — forensics before any code

### Emergence and the associative lattice

Read the code rather than the docs, then measured it. The finding:

```
nodeCount : 60
edgeCount : 59
edges − (nodes−1) : 0
```

Exactly *n−1* edges, every run. `transform()` only ever connected
`lastNode → newNode`. **A path graph.** Association was the one thing it did
not do. `LatticeEngine.find/cluster/inspect/neighbors` — all present, none
used. `DEFAULT_THRESHOLD = 0.35` was dead code.

The Jaccard metric could only emit six values (`shared/(10−shared)`). In 60
real ticks it emitted **three**, and 39 of 59 edges were `1.0` — consecutive
states structurally identical, recorded anyway. That is the noise.

Also found and reproduced: `gate.history()` inherited a `stopAt` guard from
the rehydration walk where it does not belong. From a fresh process against
the same data:

```
10 real commits, history(100):   ledger 10 | lattice 0  | causal 0
12 real commits, history(100):   ledger 12 | lattice 2  | causal 2
```

At the default `snapshotInterval=25`, `:history` shows 0–24 entries and
**drops to zero every 25 ticks**, while the README says it shows everything.
Same defect in `causal-graph`.

### Two corrections I had to make to my own earlier statements

**"Maybe 15 unique files."** Recursive extraction of every nested archive
(5 passes, 0 zips remaining), deduped by SHA-256:

```
1,862 files → 1,376 code files → 187 unique by content
              113 pure — zero browser APIs, run in Node today
```

Off by an order of magnitude. The revision zips were nested and unopened.

**"Needs and feelings have no producer."** Said twice. False. `htl.js` —
2,043 lines, zero browser APIs, thirteen classes, the ALK Human Translation
Layer. Module NEED-04 is `NeedsIntentModule`: ten NVC needs, ten intents,
with `strategy`, `confidence` and `evidence` on every emission. Its header
already cited §1.1, §1.2, §4.3, §5.5, §5.7 — it was written against these
laws.

### A hypothesis I proposed and then falsified

Intent was pinning to `SEEKING_SPACE` on every line. I proposed that
`_computeState()` was scoring unmeasured coherence and energy as measured-low.
**My own test cases B and C disproved it** — coherence 0 vs 0.55 at identical
arousal both returned VENTRAL.

So I instrumented instead of asserting. Real cause: `latent.arousal` never
leaves `0.0000`. From `OBS_MODELS`, sentiment touches **VALENCE only**;
arousal has exactly two producers, `speech.friction` and
`speech.baseline_alert`, and neither was wired. Arousal at zero makes
`dorsalScore` 0.9 against a 0.6 threshold.

The falsified hypothesis is kept here on purpose. §0.1 — a wrong idea that
was tested and discarded is part of the record, not something to quietly
replace with the right one.

Separately: a `NervousSystemModule` with **zero observations** reports
`DORSAL, confidence 0.9`. A module that has measured nothing should not
report a confident state — §1.2.

---

## Part 2 — an invention that failed at what it was built for

`text-affect-bridge.js`. `ENGAGEMENT` had two producers, both video; on text
it sat at uncertainty 0.5, never observed. I built a text-side substitute
grounded in Pennebaker's function-word work (pronoun distribution as a
relational-orientation marker) plus Gottman's Four Horsemen and bids as
lexical markers, fed through `latent-model.js`'s own declared `observe()` API
with the modality-agnostic `sig.APPROACH`/`sig.WITHDRAWAL` keys — no vendor
edit, no fabricated video events.

It measured something real:

```
                  engagement    uncertainty[ENGAGEMENT]
without bridge       0                 0.500
with bridge          0.0704            0.0455
```

**And it failed at its stated purpose.** It was built to unlock `unmet` needs,
which are populated only from `emo.dominant`. §17.11 — the benchmark, named,
with the unfavourable case reported:

```
sentiment    bridge OFF          bridge ON
  -0.5       GRIEF 0.150 null    GRIEF 0.150 null
  -0.7       GRIEF 0.210 GRIEF   GRIEF 0.210 GRIEF
```

Identical columns. Zero difference. GRIEF is carried entirely by
`|sentiment| × 0.3`. The engagement term needs
`arousal < 0.3 && engagement < −0.2`; a withdrawn line reads −0.35 raw, but
Kalman fusion against prior positive readings lands it at **+0.2287**. One
withdrawn line cannot flip a session-level estimate.

Kept in the tree, marked `substituted: true` on every emission, and demoted to
a fallback once voice arrived. Recorded as a failure rather than reframed as a
win.

`unmet` needs remain unreachable on text-only input. The Panksepp circuits in
`htl.js` are 40–90% face-cue driven per circuit. The fix — wiring the `loss`
axis into GRIEF — requires editing a vendored file, so it is written up in
`spec/alk-lattice.spec` as a decision rather than taken unilaterally.

---

## Part 3 — bugs I wrote, caught by my own tests and gates

Listed because they are the useful half of the record.

| what | how it was caught |
|---|---|
| prosody reported `sufficient: true` on pure silence — jitter 0, shimmer 0, indistinguishable from a perfectly stable voice | the benchmark's unfavourable case |
| affect compared the smoothed Kalman state, scoring 0.93–0.96 between unrelated lines — the flat lattice's failure reproduced | reading the resonance output instead of trusting it |
| temporal voted on classification, making noise look like signal | same |
| the orphan detector's char class included `_`, so the regex matched greedily across whole keys | the end-to-end replacement test reported `orphaned-data` after a clean archive |
| `var(--dim, #8a8a99)` fallbacks — hex wearing a `var()` costume | the no-hex promote gate I added |
| regex-removing retired theme CSS left dangling selectors that would swallow the next rule | reading the diff output |
| an assertion that SUPPRESSION reaches <0.1 in one update — the code was right, the assertion was wrong | the test failing correctly |

Three pre-existing ones the gates caught too: a duplicate `lattice` key in
`TAB_SPLIT_PATHS`, version drift between the voice contract and the release,
and `background:#000` in `meaning.css`. None grandfathered.

---

## Part 4 — decisions recorded, not buried

**Rename ≠ Replace.** A different person does not inherit someone else's
logged feelings. Two operations, never one code path, and `disposition` has no
default because it decides whether a real person's history is kept.

**Shared grammar is deliberately not automatic.** A word does not become
shared because the lattice noticed it twice, and not because one person said
it. Two-sided by construction.

**Ephemeral means ephemeral.** Cursors and typing are never written — not
capped, never written.

**The Other primitive is beneath everything.** A closed list is a claim about
what a person is allowed to feel; handed 62 options and none right, the common
response is to pick the nearest wrong one, which corrupts every derivation
downstream.

**Not taken, with reasons:** `expression-engine`, `video-module`,
`suppression-score`, `trajectory/*` (all need a camera); `irs.js` (1247 ln),
`gap-hunter.js` (1102 ln) — real and pure, but overlapping the unimported HTL
modules, so §0.5, not yet earned.

---

## Open, by design

- **Two-device exit tests** — Phase 1's foundation tag and Phase D's presence
  both need two real devices. This environment cannot run either. The tags
  stay held.
- **`unmet` needs on text-only input** — blocked on the vendored-file decision
  above.
- **Phases E–H** of `spec/PHASEMAP-v3.md` — grammar store, Other-primitive
  retrofit, voice/video grammar.
- **The self-hosted relay** — hosting is settled as always-self-hosted; the
  runtime config still points at public PeerJS/TURN.
