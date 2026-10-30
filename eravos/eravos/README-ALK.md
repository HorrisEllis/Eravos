# ERAVOS 0.4.0 — the ALK layer

The lattice is no longer a word cloud.

```bash
node eravos/test/run-all.mjs      # 46 passed, 0 failed
# then serve eravos/ and open index.html in Chrome
```

## What changed

`buildLatticeData()` produced a top-60 word-frequency list with two booleans.
One axis, no edges. Its tab copy promised "defensive word clusters" it never
computed; its contract said "hooks not yet scoped." That is retired.

In its place: **seven independent dimensions over one node set.** Every line
you speak or log is compared against every prior line on each dimension
separately.

| dimension | source | what an edge means |
|---|---|---|
| lexical | `codec.js` AssociationEngine | the same language came back |
| signal | Resonance `heuristics.ts`, 15 axes | the shape of the expression matched |
| needs | `htl.js` NEED-04 · Rosenberg NVC | the same underlying need was live |
| intent | `htl.js` NEED-04 | the same relational move was being made |
| affect | `latent-model.js` Kalman delta | it moved the field the same way |
| prosody | Rheon Voice v7 pitchEngine | the voice carried it the same way |
| temporal | §3.2 eventTs | close in time — context, never evidence |

## The point is where they disagree

```
needs link, lexical does NOT   → the same need in new language. Circling.
lexical link, affect does NOT  → the phrase survived; what's under it moved.
intent link, needs do NOT      → strategy outliving its cause.
lexical ALONE                  → coincidence. Filtered.
```

Measured on a 7-line transcript: *"We keep circling the same thing"* linked to
*"I miss you, I feel so alone"* on needs+intent, seven lines apart, with an
unrelated scheduling line in between. A word cloud cannot see that.

**The signal/noise filter is not a component.** It falls out of the structure:
no dimension links, no edge; one dimension alone, recorded but not surfaced.

## Voice adds the dimension text cannot reach

| dimension | text only | + voice |
|---|---|---|
| valence | 0.046 | 0.039 |
| arousal | 0.144 | 0.046 |
| **suppression** | **0.500** | **0.040** |
| coherence | 0.065 | 0.040 |
| engagement | 0.055 | 0.039 |

Kalman uncertainty. `0.500` is the initial value — never observed. Suppression
is the gap between what's shown and what's felt, and written language has no
producer for it at all. jitter, shimmer and harmonics-to-noise measure vocal
perturbation directly.

Signal, not diagnosis. High jitter measures perturbation; it does not mean
anxious or untruthful. Nothing is recorded or transmitted — frames are
measured and discarded.

## Where things are

```
shared/alk/     alk-boot.js (the one ESM entry → window.ALK)
                alk-bus.js · dimensions.js · multi-lattice.js
                signal-vector.js · text-affect-bridge.js
                latent-model.js · htl.js   (vendored unmodified, hashed)
tabs/voice/     prosody.js · voice-observer.js · voice.module.js + html/css/js
tabs/lattice/   html/css/js
spec/           alk-lattice.spec · voice-dimension.spec
test/           run-all.mjs
```

`SPEC-REGISTRY.md` tracks every spec, UUID, hook, vendored hash and port with
its source line. `ALK-CHANGELOG.md` records what moved, including two root
causes found and fixed mid-build and one pre-existing duplicate key.

## Known state

`prosody` reports as a silent dimension until a mic is opened — that is
`health().silentDimensions` working as designed, not a failure. `unmet` needs
stay empty on text-only input; the Panksepp circuits in `htl.js` are 40–90%
face-cue driven per circuit and the fix requires a decision recorded in
`spec/alk-lattice.spec`, not a unilateral edit.
