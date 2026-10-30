# MAP.md — the whole ecosystem, as it actually stands

Written to be picked up later — by you, or by an app-builder tool that
drags projects together. Every claim below is either something that was
actually built and tested, or is clearly marked as prepared-but-unverified.
Nothing in between.

---

## The real projects, and what's actually built on what

```
warp/                the foundation. Cause -> Drawbridge -> Flow -> FlowLog,
                     Axiom as an enforced (not decorative) constraint.
                     Zero dependencies. 43 tests, real.

wire/                Component/Hook/Wire/Consumer -- a composition layer
                     built ON warp/. Fixes a real found problem: components
                     without this exposed no clean facade, forcing callers
                     to reach into warp's own internal bookkeeping. 9 tests,
                     real, but NOT YET applied to emergence/'s own
                     components -- built and proven on its own, not
                     retrofitted.

emergence/           built ON warp/ (imports it directly). A text-analysis
                     loop -- observe, create toward a named target, record,
                     remember patterns, track people. 12 real signals on
                     the observer, real persistence, 221 tests. This is the
                     most complete, most tested thing in this whole map.

eravos/              a real, separate, pre-existing app (couples app,
                     James + Raven) -- NOT built by me, uploaded as real
                     source (eravos-git.zip). P2P calls via PeerJS, a
                     10,000+ line kernel (eravos-kernel.js), its own real
                     transcription (browser SpeechRecognition, not
                     Whisper), its own lattice/mythos concept.

clarity-engine.js    built for eravos/, now actually integrated into it
  + clarity-config/  (not just designed -- the real eravos-kernel.js was
                     edited: attachRemoteStream() now routes her audio
                     through a real Web Audio chain before it reaches your
                     speakers). Config is real, editable JSON, schema-
                     checked. See "What's actually wired in" below.

android-app/         Capacitor scaffold + native Whisper JNI bridge for a
                     real compiled Android app. PREPARED, NOT VERIFIED --
                     no Android toolchain was available to build/run it.
                     See android-app/PREPARED-NOT-VERIFIED.md for the
                     precise, honest boundary of what's real vs. untested.
```

**Dependency direction, plainly:** `wire` and `emergence` both sit on top
of `warp`. `clarity-engine.js` is standalone (zero dependencies of its
own) but is now wired *into* `eravos/`. `android-app/` wraps the whole
`eravos/` folder (including the now-integrated clarity engine) as a
Capacitor shell, plus adds one new native capability (Whisper) neither
`eravos/` nor `clarity-engine.js` had before.

**`emergence` and `eravos` are now connected, for real, in one specific
place.** `eravos-kernel.js`'s `computeRelationalHealth()` calls
Emergence's `GET /space/health` (cached, background-refreshed, never
blocking) -- see "What's actually wired in" above. That's the ONE real
connection; it doesn't generalize automatically. If a future goal is
"Emergence analyzes Eravos's actual call transcripts" too, that's a
separate, real, buildable integration -- Eravos's `call:transcript_line`
sync events could feed Emergence's `POST /tick` -- but it doesn't exist
yet, and isn't assumed here.

---

## What's actually wired in (verified, not just designed)

- `eravos/index.html` loads `shared/clarity-engine.js` before
  `shared/eravos-kernel.js` (real script tag, real load order, matching
  the existing pattern used for `eravos-crypto.js`).
- `eravos-kernel.js`'s `attachRemoteStream(stream)` is now `async`, calls
  `_ensureClarityEngine()`, routes the remote stream's audio through the
  real clarity chain, and recombines it with the original video tracks
  before attaching to `#remote-video`. Falls back to the raw, unprocessed
  stream if the engine fails to load for any reason -- a call never
  silently breaks because of this.
- `detachStreams()` (called from `endCall()`) releases the clarity
  engine's audio graph on hangup. The engine instance itself persists
  across calls (not recreated each time) -- matches the "one AudioContext
  per app lifetime" guidance already in `clarity-engine.js`'s own header.
- Config loads from `shared/clarity-config/clarity-config.default.json`
  at runtime via `fetch()` -- genuinely editable without touching JS,
  with an offline-safe fallback to hardcoded defaults if the fetch fails
  (same pattern Eravos's own PeerJS loader already uses).
- `eravos-kernel.js`'s real `computeRelationalHealth()` (found via
  reviewing Eravos's own in-app roadmap) now blends in a real signal
  from Emergence's new `space-distance` component -- learned contact-
  cadence baseline + real timezone-overlap awareness for this
  specifically long-distance relationship. Cached, background-refreshed,
  never blocks the existing synchronous render path. Verified end-to-end:
  the exact real `fetch()` call was run against a live Emergence server
  and returned real data.

All of the above is real JS, syntax-checked. It has NOT been run in an
actual browser with a live PeerJS call -- that would need two real devices
or two real browser tabs actually connecting, which wasn't available to
test here. The Web Audio API usage itself (`DynamicsCompressorNode`,
`BiquadFilterNode`, `MediaStreamAudioDestinationNode`) is standard,
well-documented, and was verified working in the standalone
`eravos-clarity.html` prototype earlier in this same line of work.

---

## The real, specific design tension worth knowing about

Eravos's existing transcription (`toggleCallTranscription()`) has a
genuine, deliberate design: **each device transcribes only its own mic**,
then syncs lines to build one shared transcript -- a real comment in the
source calls this "builds the lattice together," not just a technical
choice. It uses the browser's native `SpeechRecognition` API (cloud-based,
Google's service), with `rec.lang` falling back to `navigator.language` --
no explicit accent handling anywhere.

The Whisper path in `android-app/` is architecturally different: it would
transcribe *whatever audio you feed it*, most usefully the remote stream
(her voice, arriving at your device) -- which is NOT how the existing
system is designed to work. If/when the native Whisper plugin actually
gets built, the real decision point is: does it become a *second,
additional* transcript (yours, Whisper-powered, private to your device,
alongside the existing shared one), or does it replace the shared
mechanism entirely? The existing design's "shared, co-created record"
intent is real and deliberate -- worth deciding on purpose, not overriding
by accident.

---

## For a future app-builder tool, specifically

If the goal is eventually "drag a project in, have it get wired up
automatically" -- here's what such a tool would need to know about each
piece, concretely:

- **`warp/`** exposes a single `require('warp')` (or `import`) surface --
  `Cause`, `Drawbridge`, `Axiom`, `Flow`, `FlowLog`, `fuseChain`,
  `canFuse`, `unifiedDispatch`, `PopulationStore`. Anything built on it
  just needs that one require path resolvable, and its own folder sitting
  as a sibling (not nested inside) whatever consumes it -- that boundary
  is deliberate, see `emergence/README.md`'s "why is it a separate
  folder" explanation if the builder needs to explain this to a user.

- **`wire/`** exposes `Component`, `Hook`, `Wire`, `Consumer`, also built
  on `warp`. Not yet used by anything real (`emergence`'s own components
  still use the older, pre-`wire` pattern) -- an app-builder integrating a
  *new* `warp`-based project should probably default to `wire`'s pattern
  going forward rather than the older one, since it's the one that
  actually solved a found architectural inconsistency.

- **`emergence/`** exposes an HTTP API (`server.js`) and a JS `loop.js`
  interface. A drag-and-drop builder could point any text source at
  `POST /tick` and get real analysis back -- this is the most
  "just works, minimal glue" integration surface in this whole map.

- **`clarity-engine.js`** exposes `ClarityEngine` (global, classic
  script) with `attach(stream)`/`detach()`/`setConfig()`. Any WebRTC-based
  app with a `MediaStream` for remote audio is a real, valid target for
  this -- not exclusive to Eravos, the class itself has zero Eravos-specific
  code in it.

- **`android-app/`** is Eravos-specific right now (its `capacitor.config.json`
  points at `webDir: "eravos"`) -- a generalized version for other web
  apps would just need that one path changed, the rest of the Capacitor
  scaffold is generic.

---

## Test counts, for a quick real-vs-not gut check

| Project | Tests | Status |
|---|---|---|
| `warp/` | 43 | real, passing |
| `wire/` | 9 | real, passing, not yet applied elsewhere |
| `emergence/` | 192 | real, passing (includes space-distance) |
| `clarity-engine.js` | 5 (config merge logic) | real, passing |
| Eravos integration edits | 0 | syntax-checked only, not run live |
| `android-app/` | 0 | prepared, not compiled |
