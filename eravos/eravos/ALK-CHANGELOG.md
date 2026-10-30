# 0.3.17 → 0.4.0

§5.4 — the version string moves when behaviour moves.

## Added

- `shared/alk/` — the ALK layer. One ESM entry (`alk-boot.js`) publishes the
  frozen `window.ALK` namespace; split-tab scripts stay classic and read from
  it. One declared seam instead of eight implicit ones.
- `tabs/voice/` — voice as a module. Measures **suppression**, the dimension
  written language has no producer for at all.
- `tabs/lattice/` — the multidimensional lattice, replacing the word cloud.
- `spec/`, `SPEC-REGISTRY.md`, `contracts/voice.contract.json`, `test/`.

## Changed

- `index.html` — loads `shared/alk/alk-boot.js` as a module after the kernel;
  `voice` added to `TAB_IDS`, `TAB_SPLIT_PATHS` and the nav.
- `index.html` — **fixed a pre-existing duplicate key**: `lattice` appeared
  twice in `TAB_SPLIT_PATHS`. Silent drift; the later one won and the earlier
  was a lie. Deduped.
- `eravos-kernel.js` — `renderLattice()` now delegates. Every existing caller
  (`LATTICE_REFRESH_EVENTS`, tab mount, manual refresh) keeps working without
  knowing the implementation changed (§5.14).
- `eravos-kernel.js` — `LATTICE_FRICTION_WORDS` published to `window`. It was
  already a Four-Horsemen lexicon under another name; the ALK layer reuses
  **this** list rather than shipping a second copy (§5.5, §16.5).
- `eravos-kernel.js` — one ingest wire, `ALK_INGEST_EVENTS`. Transcript lines,
  ruptures, growth, codex, vault and sparring turns enter the lattice exactly
  once, at the source. §10.1 — no tab calls `ALK.ingest()` itself.
- `manifest.json` — `voice` registered under communication, beside call.
- `VERSION` — 0.3.17 → 0.4.0.

## Retired

- `buildLatticeData()`'s renderer. Kept addressable as
  `renderLatticeFlat_RETIRED_v0_3_17()` per §17.3.

## Two root causes found and fixed during the build (§5.3)

**1. Affect compared the smoothed cumulative state.** A Kalman filter's job is
smoothing, so two consecutive snapshots are near-identical by construction —
measured 0.93–0.96 similarity between *"the meeting is at 3pm tomorrow"* and
*"I miss you, I feel so alone."* That reproduced the exact failure of the flat
lattice (39/59 edges at weight 1.0). Now compares the **delta** the utterance
produced. Affect edges fell 21 → 2.

**2. Temporal counted as evidence.** Within one session nearly every pair is
temporally adjacent, so it made noise indistinguishable from signal. It still
forms edges and is still reported; it no longer votes on classification.

Both have regression tests.

## Verified

`node test/run-all.mjs` → **46 passed, 0 failed.**

Measured on a 7-line relational transcript: 7 dimensions live, signal ratio
0.471, noise correctly filtered (`INTENT_ONLY` ×5, `SURFACE_ONLY` ×1,
`AFFECT_ONLY` ×1). Top resonance found: *"We keep circling the same thing"* ↔
*"I miss you, I feel so alone"* on needs+intent, seven ticks apart —
`SAME_NEED_DIFFERENT_WORDS`, the class no word lattice can see.

`prosody` reports as a silent dimension until a mic is opened. That is
`health().silentDimensions` working as designed (§12.5), not a failure.

---

# 0.4.0 → 0.5.0

## Added

- **`shared/eravos-admin.js`** — the admin engine. People, connections, data.
  Injectable storage adapter, so it runs and is tested with no browser at all
  (§3.4). It is the sole write authority for `eravors_users` (§10.1).
- **`tabs/admin/`** — the panel. Only kernel design tokens, zero hardcoded hex,
  per `01-ARCHITECTURE.md` §2.
- `spec/admin.spec`, `contracts/admin.contract.json`, `test/admin.test.mjs`.

## Root cause fixed (§5.3)

`seedContainedAccounts()` **force-seeded the partner account on every page
load**. Any rename made through the UI was silently reverted on the next
reload — the edit appeared to work and then quietly undid itself. §1.2: a
silent failure that corrupts state instead of crashing.

The partner slot is now **data**, seeded once if and only if no partner
account exists. The seeder defers to the admin engine.

## Rename ≠ Replace (§17.3 — judgment recorded)

Two operations, never one code path:

- **Rename** — the same person, a different label. Their data follows. Peer
  identity and crypto keys preserved; still the same party to the connection.
- **Replace** — a different person in the slot. Their data does **not** follow.
  Migrating a previous partner's logged feelings into a new person's namespace
  would be false on its face and would corrupt every downstream relational
  derivation reading it. New peer identity issued, crypto regenerated, pair
  torn down.

`disposition` (archive | purge) has **no default**. It decides whether a real
person's history is kept; choosing it silently is not acceptable.

## Themes retired (§16.5)

`raven-theme`, `golden-theme`, `romeo-theme` removed. One remains — the
default 🔥 Original Fire. This cost nothing because
`01-ARCHITECTURE.md` §2's rule was already being followed everywhere: no tab
defines its own palette. **Zero tab stylesheets changed.**

Removed along the way: a **second live definition of `setRavenTheme()`**
shadowing the first — the silent-precedence shape SISO Design Law 1 forbids.
The retired setters are kept as named shims rather than deleted, because
cached HTML may still have handlers bound and a silent `ReferenceError` is
the worse failure.

## Roadmap rebuilt from spec v2 (§6.1)

`tabs/roadmap/roadmap.html` regenerated from `04-PHASEMAP.md`. The old v3.0
roadmap recommended **Tailscale** and **Cloudflare Tunnel**; spec v2 settled
the hosting question the other way — always self-hosted, with Tailscale
explicitly rejected and reasons given. That card is gone rather than left
contradicting the spec.

Phase 1 now shows what it actually is: code-complete with **one open item**,
the two-real-device exit test. The `v1-foundation` tag is held deliberately.
Phase 4 shows the lattice and voice items as delivered ahead of schedule in
0.4.0.

## Found by test, not by review (§0.1)

The end-to-end replacement test reported `status: 'orphaned-data'` after a
clean archive. The orphan detector's character class included `_`, so
`/^([a-z0-9_-]+)_/` matched greedily across the whole key and resolved an
archived key to a nonsense prefix. Fixed to capture the first segment only.

Also reordered: the admin-account refusal now fires **before** key-format
validation, so a typo'd key can't mask the real reason (§1.2 — name the
actual cause, not the first one hit).

## Verified

`node test/run-all.mjs` → **74 passed, 0 failed across 3 files.**

---

# 0.5.0 → 0.6.0

Phases **A, B, C** of `spec/PHASEMAP-v3.md`, built bottom-up. D–H specced.

## Why this order, not the order it was asked in

The popup composer, the add-menu, shared cursors and the shared grammar all
sit on two things that did not exist:

1. **A message engine not owned by a surface.** A popup that owns its own
   thread means two stores that disagree the first time both surfaces are
   open. §10.1.
2. **An option primitive that always offers "Other".** Every prompt that would
   feed the grammar presented a closed list. Build the grammar first and the
   grammar only contains words a stranger chose.

So A and B come before C. Not caution — the only order in which the later
phases don't have to be rebuilt.

## Phase A — Choice & search

- **`shared/eravos-choice.js`.** Every declared prompt offers "Other → in your
  words". No opt-out flag. Customs are remembered, offered **first** next
  time, private unless explicitly shared, archived rather than deleted (§0.3).
- `allowSkip` defaults **true**. A skip records `null` — never a default,
  never the first option. Even `allowSkip:false` needs an explicit override,
  and the error says reconsider.
- **Feelings search bar**, above the grid. The vocabulary went 18 → 62 in
  Phase 1; 62 tiles is more scanning than someone in distress should have to
  do to say how they are. Prefix matches first, no fuzzy guessing (§1.1).
- **Bug found while wiring it:** `selectFeeling()` returned early on any name
  not in the built-in `FEELINGS` list, which would have made every "Other"
  tile silently do nothing (§1.2). Fixed — a custom feeling is a real feeling.
- Five prompts declared in the kernel: `feeling`, `need`, `trigger.body`,
  `trigger.hold`, `repair`.

## Phase B — Chat engine & transport

- **`shared/eravos-chat.js`.** Injectable store, exercisable with no DOM.
  Every test runs headless (§3.4).
- Five gates on the **existing** syncStream — no new pipeline: `chat:message`,
  `chat:receipt`, `chat:typing`, `presence:cursor`, `presence:tab`.
  `emitSync()` already owns queue-on-failure, so this file does not
  reimplement the check Phase 1 consolidated away.
- **Attachments are references, not copies.** Eight kinds — vault, feeling,
  need, spar_invite, codex, poem, canvas, grammar. Sending a vault piece sends
  a pointer, so it stays one artifact with one version rather than a duplicate
  that drifts.
- **Ephemeral means ephemeral.** Typing and cursor positions are never
  persisted — not capped, not trimmed, **never written**. A test asserts the
  store stays completely empty under a thousand cursor events. Someone's mouse
  path through a relational app is not a record anyone consented to keep.
- Bounded at 500 messages. Duplicate replay idempotent — the outbox cannot
  double-post. Offline sends marked `queued` and kept in the thread. A
  transport throw is recorded **on the message**, not swallowed.

## Phase C — Chat surfaces

- **`tabs/chat/`** — the full page. Thread search, call button top right,
  add-menu, typing indicator, presence line.
- **The popup composer**, mounted globally from every tab. Same engine, same
  thread. Unread badge, add-menu, call button top-right of the menu,
  expand-to-full-page. A test opens both surfaces and asserts they cannot
  diverge.
- Attachment pickers for all eight kinds. A picker with nothing to offer
  **says so** rather than silently attaching nothing (§1.2).

## Phase D — Shared presence (built; verification open)

Cursor sharing is **off by default and opt-in on both sides** — the engine
never enables it because the other side asked, and a remote cursor is ignored
unless this side also opted in. Throttled at 80ms: 50 mouse moves in one tick
send once, so a mouse path cannot flood the pipe carrying messages. Stale
presence expires rather than hanging. The remote cursor renders as a soft glow
with a name and removes itself when it goes stale.

**Two-device verification is open by design** — same discipline as Phase 1's
exit criteria.

## Phase F — Fluid pass (pilot)

Chat is the pilot for *less boxes, more fluid*: no bubbles, no cards, no
avatars, no per-message container. Speaker carried by indent and colour
weight, time by spacing, attachments as a quiet reference line. Messages fade
in rather than appear. Search bars are a rule, not a box.

`01-ARCHITECTURE.md` §2 still holds through all of it — **zero hardcoded hex**
in any new stylesheet. Every colour is a kernel custom property.

## Phase E — the constraint that matters most

Shared grammar is **deliberately not automatic**. A word does not become
shared grammar because the lattice noticed it twice, and it is not shared
because one person said it — it becomes shared when the other one takes it up.
Two-sided by construction. Inferring private meaning from frequency is exactly
the overreach §1.1 forbids: the system would be telling two people what their
own words mean to them.

## Roadmap

`tabs/roadmap/roadmap.html` now renders phases A–H **alongside** the original
product phases 0–5 rather than replacing them, with the dependency argument
stated at the top. Standing constraints extended with *ephemeral means
ephemeral*, *two-sided by construction*, and *signal, not diagnosis*.

## Verified

`node test/run-all.mjs` → **110 passed, 0 failed across 4 files.**

## Caught by the promote gate, not by review (§17.10)

I added a no-hardcoded-hex check across every tab stylesheet, since
`01-ARCHITECTURE.md` §2 is law and had been asserted but never enforced. It
blocked the build three times:

1. **My own new stylesheets** used `var(--dim, #8a8a99)` fallbacks — a
   hardcoded hex wearing a `var()` costume, which silently bypasses the theme
   when a token is absent. The real fix was to **declare the missing tokens**
   (`--bg`, `--panel`, `--panel2`, `--good`, `--warn`, `--bad`) rather than
   paper over their absence. The gate now forbids `var()` fallbacks outright.
2. **A regression I introduced.** Removing the retired theme CSS by regex
   stripped rule *bodies* but left dangling selector lines like
   `body.raven-theme input[type=text],` with no `{...}` after them — broken
   CSS that would swallow whichever rule followed. Found by reading the output
   instead of trusting it (§0.1). Fixed, and the gate now checks brace balance
   and empty selectors.
3. **A pre-existing violation** in `tabs/meaning/meaning.css` — `background:#000`,
   arbitrarily darker than the app's own deepest surface. Not mine, not
   grandfathered: fixed to `var(--dark)`.

Six tab stylesheets, zero hex, zero fallbacks.

---

# 0.6.0 → 0.7.0

**Phase E of `spec/PHASEMAP-v3.md`** — the shared grammar store. The named
critical item, and the thing this whole line of work started from.

## Two-sided by construction, not by policy

A word is not shared grammar because one person said it. It becomes shared
when the other one **takes it up**. That is enforced structurally:
`propose()` creates a `proposed` entry, and there is no argument, flag or
admin path that promotes it. Only `takeUp()` can — and it refuses when the
caller is the proposer. The guarantee holds over the wire too:
`applyRemote('takeup')` refuses a sender who was also the proposer.

This matters more than it sounds. "Shared" is a claim about *two* people. A
store that lets one person declare it unilaterally records a fact that is not
true, and every derivation reading it downstream inherits the lie (§1.2).

## Two meanings, never merged

Each side records what the word means to them, separately, and **both are
kept**. There is no canonical meaning field and no merge step, because the
interesting thing about shared grammar is usually the gap between the two
senses. Divergence is *reported*, never resolved.

Meanings **append**. A word's sense drifting over two years is a real
relational fact, not noise to flatten (§0.3).

## Deliberately not automatic

Nothing in this file infers grammar. `candidates()` exists and returns `[]`
with a stated reason, so the absence is visible rather than looking like a
missing feature. `health().inferred` is structurally `0`.

A word does not become a candidate because the lattice noticed it twice.
Inferring private meaning from frequency is the system telling two people what
their own words mean to them — the exact overreach §1.1 forbids.

## Asymmetries that are on purpose

- **Declining is an answer**, recorded as one, not as silence.
- **Retiring is unilateral.** Taking a word up needs both; putting it down does
  not. Nobody should need permission to stop using a word.
- **Reviving a retired word returns it to `proposed`**, needing take-up afresh.
  It does not restore shared status.

## The eighth lattice dimension

`grammar`, threshold 0.20, with `SHARED_LANGUAGE` as the **highest-weight**
resonance class (7). Deliberately *not* folded into `lexical`: two moments
using the same shared word are related differently from two using the same
ordinary word, and averaging them into one score destroys exactly that.

Only `shared` terms count — a proposal is one person's idea and has no
business linking two moments as though it were mutual. Terms resolve **at
ingest**, so a word taken up later does not retroactively rewrite history.

Chat's `grammar` attachment now **proposes** the word rather than doing
nothing. Sending it is offering it, not declaring it.

## Two bugs, both caught by tests

1. **§1.2, in this file.** `applyRemote()` checked the entry before the
   action, so an unknown action about an unknown entry hit the
   `!e → return null` branch and was silently swallowed — a malformed or
   future message type would have looked like a routine miss. Action is now
   validated first. Same ordering principle as the admin engine's
   admin-account guard firing before key validation.
2. **A stale assertion.** `lattice.test.mjs` asserted exactly 7 dimensions and
   broke when the 8th landed. The code was right. Rewritten to assert the
   *contract* — every dimension declares threshold/means/failsWhen/extract/
   similarity — with the count asserted once in `grammar.test.mjs` where it
   belongs, so it cannot go stale every time a dimension is added.

## Verified

`node eravos/test/run-all.mjs` → **139 passed, 0 failed across 5 files.**
Promote gate clean: 7 tab stylesheets, zero hex, zero `var()` fallbacks.

---

# 0.7.0 → 0.8.0

**Phase G** — the Other-primitive retrofit, and the lint that stops it
regressing.

## A component, not fifteen edits

Phase A wired five prompts by hand. There are **28 `<select>` elements** in
the app. Hand-editing the rest would produce fifteen slightly different
"Other" affordances, each with its own bug, and nothing stopping the
sixteenth from being a plain closed list again.

`shared/eravos-choice-field.js` turns an existing `<select>` into a choice
field **in place**. It keeps the element's id, so every existing
`getElementById(...).value` read at the call site keeps working (§5.14 — the
layer is replaceable without its consumers knowing). Vocabularies are
**seeded from the markup already in the tab**, so a retrofit never restates a
list that exists (§16.5).

Guaranteed at every call site: "Something else" is always present and always
last (there is no flag that removes it), customs are offered first, a skip
records `null`, and search appears past 8 options — the scanning cost the
62-tile feeling grid demonstrated.

## The lint is the real deliverable

`test/choice-lint.mjs`, and it runs **inside `run-all`** rather than as
something to remember. Every `<select>` must be classified:

- **SELF-DESCRIPTION** — the person is telling the app something about
  themselves. A closed list here is a claim about what they're allowed to be,
  and "none of these fit" usually becomes "pick the nearest wrong one", which
  corrupts every derivation reading it. **17 routed.**
- **SYSTEM** — a property of the software: a filter, a config, a model
  picker. A closed list is *correct*. Bolting "Something else" onto a
  particle-density picker would be noise, and noise makes the real rule
  easier to ignore (§0.5). **11 exempt, each with a stated reason (§17.3).**

The point is not the two lists. It is that an **unclassified** select fails
the build. A new one cannot land without someone deciding which it is — which
is exactly the decision that would otherwise get skipped.

Running it immediately found eight selects I had not accounted for, including
`rel-stage` — *Early / Established / Long-Term / Transition / Repair* — which
is probably the closed list in this app most likely to fit nobody.

## Owed, and named rather than quietly accepted (§0.1)

`rup-status` is classified SYSTEM because relational-health derivations read
it as a state machine and free text would break every consumer. **The
limitation is real**: *"still there, we just don't talk about it"* fits none
of open/healing/resolved. The fix is a companion free-text field *alongside*
the status, not replacing it. Written into the lint and the phasemap, not
filed as fine.

## A real bug the test caught, and a lesson about my own edits

**Unbounded recursion.** `commit()` dispatched a synthetic `change`, which
re-entered the capture handler; with the sentinel value still selected it
committed again, and again. That is a real infinite loop **in a browser too**,
not an artefact of the test shim. Fixed structurally (§5.3): the sentinel is
cleared before dispatching, plus a re-entrancy guard.

Ten other failures in the same run were **my test shim**, not the component —
it only parsed `<option>`, so the write-in's own `<input>`/`<button>` were
never created. Worth recording because the harness is as much a suspect as
the code (§0.1).

And one on myself: I patched the shim with `str.replace()` without asserting
the anchor matched, and it silently no-opped — the exact §1.2 shape I keep
flagging in other people's code. Every edit in this pass asserts.

## Verified

`node eravos/test/run-all.mjs` → **151 passed, 0 failed across 6 files, plus
choice-lint clean.**

---

# 0.8.0 → 0.9.0

**Phase F** on the three most-used prompts, plus the Phase G debt paid, plus
a lint that found the hole the previous gate never looked through.

## The hole

The hex check only ever looked at tab **stylesheets**. It never looked at
inline `style="..."` attributes, and that is where the violations were:

```
rgba(0,229,204,.12)   ×24     — that is --teal at 12%, written by hand
rgba(255,106,0,...)   ×9      — --fire, likewise
```

A literal doesn't follow the palette, so those were drift by construction.
It also never looked at **nested** tab stylesheets — `tabs/relational/*/*.css`
was outside the glob — and that is where the worst of it was:
`rgba(139,0,0,…)` and `rgba(196,30,58,…)` are the **retired raven-theme reds**,
still baked into Triggers, Growth, Struggles and Sparring. Those tabs have
been rendering a dead theme's colours on the default palette.

`test/token-lint.mjs` closes it, and runs inside `run-all`:

1. no colour literal in any inline style
2. no colour literal in any stylesheet, nested included
3. no `var(--x, #fallback)` — a literal in a var() costume
4. **every `var(--token)` referenced actually exists**

(4) catches the next failure rather than this one, and immediately found two:
`var(--bg2)` referenced in `index.html` and never declared — that panel has
been rendering with **no background at all**, silently — and `var(--line)` in
`lattice.css`, which was mine. A `var()` that resolves to nothing does not
error; it just quietly does nothing. Along with it: a stray `))` typo in the
same file, also mine.

28 tokens became 55, all declared once. `--answer`/`--answer-deep` are
declared as a **deliberate** non-palette hue: "answer" reads as green
everywhere, and re-theming the call accept button to fire would make it
indistinguishable from decline. Better a recorded decision than a stray
literal (§17.3).

## The lint cried wolf twice, and that got fixed too

Its own token extractor was anchored to line start, so it missed every token
in the multi-declaration `:root` block and reported `--amber` as undeclared.
And its fallback rule forbade *all* `var()` fallbacks, flagging
`var(--drift, 30px)` — a length default for a JS-driven particle animation,
entirely legitimate. Both narrowed. A lint that cries wolf gets ignored,
which is worse than no lint (§0.5).

## Phase F — fluid, and provably disposable

`shared/eravos-fluid.css`, scoped to Feelings, Needs and Rupture: cards become
left rules, inputs become underlines, buttons lose their fill, list items stop
being tiles, `.card`-in-`.card` stops drawing twice. Nothing glows at rest;
focus is the only thing that brightens. Motion carries state changes instead
of a toast announcing them — and it respects `prefers-reduced-motion`, because
someone with vestibular sensitivity or a migraine is exactly who is using
these three tabs.

**Purely additive.** No ids move, no handlers change, no JS is touched.
Deleting the one `<link>` returns the tabs to the previous look with zero
functional difference — which is the actual test of whether a UI layer is
disposable, rather than a claim that it is.

## The Phase G debt, paid

`rup-status` stays a closed list, because relational-health derivations read it
as a state machine and free text would break every consumer. But *"still
there, we just don't talk about it"* fits none of open/healing/resolved, and
being made to pick the nearest wrong one is exactly the §1.2 corruption.

`#rup-status-note` now carries the person's own words **alongside** the
status, saved to `statusNote` and into `status_history`. The derivations keep
their state machine; the person keeps their words. Nothing downstream changed.

## Verified

`node eravos/test/run-all.mjs` → **151 passed, 0 failed, choice-lint ✓,
token-lint ✓.**

---

# 0.9.0 → 0.10.0

**Phase D's remainder** — presence in the shell, and co-navigation.

## Not a second engine

`ChatEngine` already owns `presence:tab` — transport, throttling, opt-in
gating, staleness. `shared/eravos-presence.js` is a **surface** on that
declared API, not a parallel one (§0.5). It stores nothing of its own.

Registering a second gate on `presence:tab` would have collided — SISO Design
Law 1, `Stream.register` throws on a duplicate signature — so the shell is fed
from ChatEngine's own `'tab'` listener rather than a second wire (§10.1).

## The design decision that mattered (§17.3)

Following someone through an app is one step from watching them. The
asymmetry is closed deliberately rather than left to trust:

1. You can only follow someone **already sharing their tab** — already opt-in,
   already two-sided.
2. When you follow, **they are told**. `presence:follow` is broadcast and
   their shell says *following you*. A follow the other person cannot see is
   surveillance, not co-navigation.
3. **Either side ends it alone** — the follower by unfollowing, the followed
   by turning tab sharing off. Neither needs the other's permission to stop.
4. Being followed is **reported, never asked for**. A pending approval would
   mean a follow could sit *hidden* while it waited, which is worse than one
   stated plainly.

## A follow never steals focus mid-sentence

If a text field holds content, the follow **defers**, retries, and is
cancelled by unfollowing. Being yanked out of a half-written sentence to your
partner is not togetherness. An empty field isn't typing; a checkbox focus
isn't typing.

## Nothing is persisted

Not the follow state, not who was where, not for how long. A test drives 200
tab moves in both directions and asserts the store stays completely empty.
That a record of someone's movement through a relational app over months
would be *useful* is exactly why it is not kept.

The shell line hides entirely when there is nothing to say. An always-visible
"not connected" is a nag, not information.

## A test that could not fail

One assertion in the first draft was a tautology —
`assert.ok(/x/.test(...) === false)` on an expression that was always `''`.
§12.2: a test that cannot fail informatively is worse than no test, because it
reads as coverage. Replaced with the real contract — that `follow()` returns a
note stating the other side is told.

## Verified

`node eravos/test/run-all.mjs` → **169 passed, 0 failed across 7 files,
choice-lint ✓, token-lint ✓.**

Two-device verification stays open, same discipline as Phase 1.

---

# 0.10.0 → 0.11.0

**Phase E closes.** Select a phrase anywhere in Eravos — a rupture you
logged, a poem, a message she sent — and put it forward as shared grammar
without leaving the page.

## Still not automatic (§1.1)

This is a faster **manual** path, not inference. The system never decides a
phrase is meaningful; a person selects it and presses a button. Nothing here
reads frequency and nothing suggests candidates — `health().inferred` is
structurally `0`.

And a selection still cannot make something shared. It lands in `proposed`,
and only the other side's `takeUp()` promotes it. That guarantee did not get
a new back door because a new entry path arrived.

## The hard part was not showing it

An affordance that appears every time you highlight anything is a tax on
people who select text to read, to copy, or because their hands do it. So the
conditions are narrow and stated: 3–60 characters, 2–6 words, must contain
letters, **never inside a field you are writing in** — selecting in a textarea
is editing, not proposing — and never a duplicate, with the reason naming
which state the existing term is in.

It never takes the caret (`mousedown` default prevented), never opens a modal,
never scrolls. Escape, a scroll, or a new selection dismisses it.

## The noise is measured, not assumed away (§12.5)

`shownButIgnored` and `offerRate` are reported, and `status` flips to
**"noisy — tighten the rule"** when offers outrun actions. If this fires when
someone didn't mean it, that's a bug, not a discovery feature — and the number
that would tell you sits in `health()` rather than in an assumption.

A test drives six ordinary selections and asserts the offer rate stays under
0.2. Ordinary selecting must mostly *not* offer.

## Phase F extended

Triggers, Struggles, Commitments, Growth, Codex and Vault get the same
treatment as the first three — cards to left rules, inputs to underlines,
`.card`-in-`.card` stops drawing twice. Still purely additive: no ids move,
no handlers change.

Left deliberately: the creative tabs (Poetry, Canvas, Mythos, Music), where
the boxes carry more weight and the call is less obvious. Better to leave
those than to flatten something that was doing work.

## Verified

`node eravos/test/run-all.mjs` → **186 passed, 0 failed across 8 files,
choice-lint ✓, token-lint ✓.**

The offer rule is fully tested. DOM positioning and the `selectionchange`
handler need a real-browser pass, stated rather than implied.

---

# 0.11.0 → 0.12.0

Solo by default, a pairing code you can scan, and automatic grammar
detection that still refuses to decide anything for you.

## Solo is the default, and it is not a waiting room

`seedContainedAccounts()` used to create a partner account whether or not one
existed, so **every install pretended to be a pair** — relational derivations
ran against a person who was not there. That is a §1.2 falsehood in the data,
not just in the UI.

Nothing is seeded now. A partner account comes into existence in
`acceptPartner()`, when a real person accepts. A one-time migration runs the
**admin engine** (not hand-edited storage) to archive the seeded partner's
data, tear down the pair including crypto identity, purge retired theme
state, and drop to solo. Idempotent, and a failure is recorded rather than
retried blindly.

The invite prompt appears **once**, with *"I'm riding solo"* beside *skip*,
and both silence it permanently. Being asked repeatedly whether you have a
partner yet is its own small cruelty. Pairing stays in Settings.

## Pairing: code, QR, email

A code is single-use and expires in 24h. **A pairing link that works forever
is a permanent open door** on whatever chat log or camera roll it passed
through. Revocable before then, and revoking kills a code already sent.

The payload carries a peer id, a key fingerprint, an expiry and a nonce — **no
name, no password, nothing about the person**. A code photographed off a
screen should reveal nothing about who made it.

**Scanning does not pair anyone.** It creates a request the issuing side
confirms — the same shape as the grammar store: one offers, the other takes it
up. Unpair is unilateral; nobody needs permission to be solo.

Email is composed locally into a `mailto:` — no sending service ever sees the
address or the code.

### A real leak the test caught

The test asserting *"the payload carries nothing about the person"* failed —
and it was not a fixture artifact. Peer ids were minted as
`eravos-<account key>-fixed`, so **every pairing code announced who made it**.
Fixed at the source with opaque ids, and the detector stays in `health()` so
the next one gets named too.

## The QR encoder, and what is actually verified

Byte mode, level M, versions 1–10, zero dependencies. Writing one from memory
is exactly the kind of thing that produces something that *looks* like a QR
code and does not scan, so the verification story is stated rather than
implied:

**Verified, independently of the encoder's own logic** — GF(256) against its
defining properties; Reed-Solomon by **syndrome evaluation**, which is
mathematically independent of the division used to encode (and a deliberately
corrupted codeword is asserted to *fail*, so the check can demonstrably fail);
format info against BCH(15,5) minimum distance; and the structure — finder
patterns, the *absence* of a fourth one, timing, dark module, mask variance.

**Not verified: that a phone camera reads it.** There is no scanner here.

So the code is **always shown as text under the QR**, and manual entry is a
first-class path rather than a fallback. If the QR is wrong, nobody is
stranded — which is the point of building it this way round.

## Automatic grammar — and the line that did not move

I argued the other way and shipped v0.7.0 with `candidates()` returning `[]`.
That argument was about **assigning meaning**, and it still holds. It did not
cover **noticing repetition**, which is a fact about the text and not a claim
about anybody. So automatic exists, and the line now sits where the principle
actually is:

```
NOTICING    automatic — a phrase you have both used repeatedly is surfaced
PROPOSING   still a person pressing a button
SHARING     still requires the other side to take it up
```

A phrase both of you use ranks above one only you repeat. `health()` reports
`autoProposed: 0` and `autoShared: 0` — structurally, always. Manual-only is a
real mode that returns `[]` with the reason, not a setting that quietly does
nothing.

## Verified

`node eravos/test/run-all.mjs` → **241 passed, 0 failed across 10 files,
choice-lint ✓, token-lint ✓.**

---

# 0.12.0 → 0.13.0

## The buttons, where you can actually reach them

The Admin tab existed but sat under **System → Admin** — two clicks into a
category most people never open. A destructive action nobody can find is not
a safety feature, it is a dead end.

**Settings → Admin** now carries all three, at the top:

- **Decouple from partner** — clears the pairing only. Both journals stay.
- **Remove partner account** — deletes their account and their data from this
  device. Type their key to confirm.
- **Delete my account** — deletes *everything* on this device. Type your own
  name to confirm.

Every one exports first and **downloads it before anything is touched**. If
the export fails, the delete does not run and says so — proceeding to delete
after a failed backup is the worst possible order of events.

## Onboarding: skip all of it, and stop asking what you already answered

**"Skip all of this"** sits beside the per-step Skip. It keeps whatever you
already answered and marks onboarding done, so it never reappears on its own.

And it is targeted now. Steps declare a `when(data)`, and the **active list is
recomputed after every answer** — so answering "solo" removes the partner
questions, and answering "still learning my patterns" stops the attachment
drilling. Progress counts the *active* steps: showing "3 / 10" when four no
longer apply is a progress bar that lies.

## The lattice got dynamic

Thresholds were fixed constants on corpus-dependent metrics — the same §0.1
error as a fixed jitter threshold across different voices. Lexical Jaccard at
0.15 links almost nothing across short utterances and almost everything across
long ones. The same number means "unusually alike" for one pair and "wrote a
sentence" for another.

Each dimension now **learns the distribution of scores it produces for this
pair** and links at the 85th percentile of it, over a rolling window. The
question becomes *"is this unusually alike for us"* rather than *"does it
clear a number a stranger picked."*

Measured: a similar corpus pushed it 0.15 → **0.375** and reported
`clamped: 'ceil'`; a dissimilar one pulled it to **0.1429**. Both correct, and
both visible in `health()`.

Guards that matter: it does not adapt while cold (40 samples, and it says
`adaptive: false` until then). Scores are observed **before** the threshold
test, so the distribution includes pairs that did not link — a threshold
learned only from its own successes would ratchet upward forever. `intent`
keeps its declared value because adapting a two-valued metric is meaningless,
and that exception is named rather than left to produce nonsense. A learned
threshold is marked `~` in every pair's evidence.

## Two of my own mistakes, both caught by tests

A test fixture that claimed to be a "wholly unrelated" corpus said *"wholly
unrelated vocabulary item number N"* on every line — five shared words per
pair, so it was highly **similar**. The threshold climbed and the test failed
correctly. The harness was the bug.

And I asserted a threshold would clamp at its floor; measured, it lands at
0.1429 against a floor of 0.09. It *is* below the declared value, which is
the real invariant — being clamped was my guess about how far. Assertion
corrected to the property that matters (§12.3).

Also: `clamped` returned the boolean `false` when cold, which reads as
"checked, not clamped" rather than "not checked yet". A diagnostic that
misreports is worse than one that is absent.

## Verified

`node eravos/test/run-all.mjs` → **248 passed, 0 failed across 10 files,
choice-lint ✓, token-lint ✓.**

---

# 0.13.0 → 0.14.0

Three new features — and the discovery that the toggle system they were
supposed to hook into did nothing.

## The finding that came first (§0.1)

Before registering three features, I checked whether the toggles worked:

```
call sites reading featOn('feat_*') : 0
anything that hides a tab on feat_* : NO
```

`setFeature()` wrote a boolean and showed a toast. `featOn()` existed and was
never called for a `feat_` key. **Every switch in Settings → Features was
cosmetic** — you could turn Rupture Tracker off and it stayed there, fully
working. A §6.1 violation in shipped code.

So the toggles became real first. A disabled feature now disappears from the
nav, **refuses `switchTab()` even when called programmatically**, moves you off
the tab if you're standing on it, and says why. Its data is never touched —
disabling is hiding, and the note says so.

Dependencies are declared, not discovered: turning off Pairing takes Desires
with it and **reports what it took**, rather than leaving a half-dead tab.

## Uncomfortable Conversations — `hardtalk`

Name one before you have it; record what happened after. There is **no
`resolved` state**. Subjects don't close, they get easier or they don't, and
a resolved state invites tidying away something still live.

`record()` **appends an attempt** rather than replacing. A conversation you've
had four times isn't four failures — it's one subject that matters, and the
shape of the four is the growth. `health()` reports `subjectsReturnedTo`
and `successRate: null`, absent by design.

`circling` is a legitimate resting place. Nothing chases you out of it, and
nothing prompts you *during* a conversation — no checklist to work through
while someone is upset in front of you.

## Goals & Relational Roadmap — `roadmap_shared`

Ownership is four-valued: `mine`, `theirs`, `ours`, `proposed`. Asking for
"ours" lands in **proposed** — writing "we should" on a shared list doesn't
make it shared, and you can't take up your own proposal. Same rule as the
grammar store and the pairing code.

Finishing every step does **not** auto-complete the goal. A checklist emptying
isn't the same as a person saying it's done.

A date is a `hope`, never a deadline. Nothing goes red, nothing is overdue,
`completionPercent` is `null`. A relational roadmap that shames you for a slow
month is worse than no roadmap. `drop()` keeps the record and the reason —
deciding against something is a result.

## Desires & Boundaries — `desires`

Three rules, and they're structural rather than stated:

**Sealed until both answer.** Your answers are invisible to them and theirs to
you until you've both answered *that item*. Otherwise the second person answers
in response to the first, which is a different thing from answering honestly —
and they can feel the difference even when they can't name it.

**Only mutual interest is ever revealed.** Said yes and they said no? You learn
it isn't a match, and nothing else. You are never told *"they said maybe to the
thing you wanted"*, because that isn't information, it's leverage. It doesn't
leak the other way either.

**Limits are absolute and unilateral.** No discuss, no revisit, no counter-offer
anywhere in the engine. `withdraw()` is instant, needs no reason, and they're
never told what it was.

`unanswered` is a real state — not answering is not an answer. Your own answer
history is kept for you and never shown to them; changing your mind is not
evidence.

**What's deliberately absent:** no completion percentage, no streaks, no
"your partner is waiting", no match alerts, no nudges. Every one converts a
private act into an obligation, and a yes given under pressure is not a yes.
`health()` reports `pressureMechanics: 0`, and a test asserts no `notify`,
`remind`, `nudge`, `streak` or `score` method exists at all.

Desires ships **off by default**. A sensitive feature is opted into.

## The lint caught my own select

`gl-owner` landed unclassified and blocked the build until I decided which it
was — exactly what that lint exists for. Classified SYSTEM: ownership feeds the
state machine `takeUp()` reads, and unlike `rup-status` it needs no companion
field, because "mine" and "propose as ours" are genuinely exhaustive.

## Verified

`node eravos/test/run-all.mjs` → **284 passed, 0 failed across 11 files,
choice-lint ✓, token-lint ✓.**

---

# 0.14.0 → 0.15.0

**One port.** The blocker, taken first — nothing else matters if she can't
reach it.

## Two ports became one

It was **8080** for the PWA and **8787** for the relay WebSocket. Two
port-forwards, two firewall rules, two reverse-proxy blocks, and two things
that can be up independently.

That last one is the real cost. If the relay is the one that's down, the app
loads perfectly and never connects — it looks exactly like *"she isn't
online"* and tells you nothing. `/_health` now reports both, and a relay that
fails to attach says so **at boot**.

Nothing about the relay's logic changed. It exports `attach()` and running
`relay-server.js` directly still works exactly as before (§16.5 — nothing
duplicated, §5.14 — the layer became replaceable). Attaching twice throws,
because a double attach would handle every message twice.

Verified live, not asserted: `200` on the app, `200` on kernel.js,
`101 Switching Protocols` on `/relay`, health reporting both.

## UPnP that's honest about failing

`--upnp` discovers a gateway over SSDP and asks it to map the port. Raw UDP
multicast and raw SOAP over HTTP — zero dependencies, both just strings over
sockets.

Three things most tools don't do:

- **It verifies.** A gateway can return `200` and map nothing, so the mapping
  is read back with `GetSpecificPortMappingEntry` before it's called success
  (§1.1 — don't trust a status code, check the state).
- **It detects CGNAT.** If your external IP is itself private, no port forward
  can reach you regardless of what the router says. Reporting a green success
  there would cost someone an evening.
- **It gives the manual step** with your real LAN IP when it can't.

## Reverse proxy configs that actually work

`--proxy-config=caddy|nginx`. The nginx block carries `Upgrade`,
`Connection: upgrade` and a long `proxy_read_timeout` — **the most common
reason a proxied relay silently fails while the app loads fine**. Tests
assert all three are present and that both locations point at the *same*
upstream port.

Caddy is one line, which is the point of consolidating.

## Range requests

Recorded media is served with `Accept-Ranges` and `206` handling, so a voice
or video message stays seekable instead of forcing a full download before it
plays. `.webm`, `.mp4`, `.ogg`, `.mp3` MIME types added — without them a
recorded message downloads instead of playing, and a test asserts each one.

## TLS refuses to downgrade

`--cert`/`--key` that can't be read **exits** rather than falling back to
plaintext. Someone who asked for TLS and silently got none is worse off than
someone who got an error.

## Verified

`node eravos/test/run-all.mjs` → **293 passed, 0 failed across 12 files,
choice-lint ✓, token-lint ✓.**

---

# 0.15.0 → 0.16.0

## The sparring bug, fixed at the root

You said it clears the input every second. Reproduced the save/restore logic
in isolation before touching anything, and there were **two** defects:

```
tick('hel', focused) -> { value:'hel', focused:true  }
tick('',    focused) -> { value:'',    focused:FALSE }   <-- every second
```

`if (savedValue)` — **an empty string is falsy**, so whenever the field was
empty and focused, the restore was skipped and focus was dropped. Once a
second. On a phone that closes the keyboard mid-sentence, which is exactly
what "it clears the input" feels like.

But the real cause was underneath: it **re-rendered a DOM subtree containing a
focused input once per second, forever, whether or not anything had changed.**
No save/restore makes that safe — it drops in-flight IME composition, resets
scroll, and fights the on-screen keyboard.

So the fix isn't a better restore. A cheap signature of the match state is
compared first, and the common case — a live match where nothing happened this
second — now does **no DOM work at all**. The clock updates on its own. The
restore stays for real re-renders, with the falsy guard corrected to `!== null`.

Also moved the interval handle to `window`: a module-scoped `let` can't clear a
timer from a previous evaluation, and two loops fighting over one input is the
same bug wearing a different hat.

## Safety — patterns, not diagnoses

The weightiest thing in this release, so the rules are structural rather than
promised:

**Never synced.** No bus, no `emitSync`, no fetch, no socket. The module has
no transport *at all*, and a test greps the source to prove it. If a partner
could learn the app had flagged something, the person it flagged is in more
danger than before — that isn't hypothetical, it's the most common way safety
features get people hurt.

**Never diagnoses.** It doesn't say "you are being abused" and it doesn't say
"you are abusive". A test bans a vocabulary list from every pattern string and
asserts each one **ends in a question**. It describes what it counted and hands
the judgment back.

**Never reads message content.** A classifier over private messages between two
people is surveillance with a kind face, and the false-positive cost lands on
whoever can least absorb it. It counts things already recorded — ruptures
without repair, "I could not say it" recurring, desires withdrawn after
matching.

**Thresholds are high on purpose.** A test feeds a bad week and asserts nothing
fires. A false positive is a real harm, and it burns the credibility of the one
time it matters.

**Dismissal is permanent and silent.** One per pattern, forever. No
`escalate`, no `remind`, no `undismiss` — a test asserts none of those methods
exist.

Resources live in Settings and are always open to anyone, whether or not
anything was noticed. No hardcoded phone number — a disconnected number at the
moment someone needs it is worse than none.

**My own tests caught me twice.** Two patterns ended in soft conclusions —
*"Some things are not wanted, and that is an answer too."* Softening a
conclusion is still making one. Both rewritten to actually ask.

## Terms and privacy policy

`legal/TERMS.md` and `legal/PRIVACY.md`, written from what the code does rather
than from a template.

The privacy policy states the encryption **accurately**: X25519 + AES-256-GCM,
static-key ECDH, **not ratcheted, no per-session forward secrecy.** It names
the public PeerJS/TURN bootstrap as a real open gap rather than hiding it. And
it says plainly that presence is never written down, that pattern notices
cannot reach your partner, and that if someone else has your device none of
this helps.

The terms say Eravos is not a therapist, not a safety device, and not evidence.

## Verified

`node eravos/test/run-all.mjs` → **312 passed, 0 failed across 13 files.**

---

# 0.16.0 → 0.17.0

**`spec/PHASEMAP-v4.md`** — everything outstanding, phased I through Q.

## The ordering argument

Four of the things asked for touch someone at their worst moment:
unretractable messages, a live shared cursor, a model of how they change, and
a record of what they need when upset. Each is good. Each has a failure mode
that lands on whoever is least able to absorb it.

So the regulation check is **Phase I**, and everything risky sits behind it.
Your instinct there was better than mine — I'd have built the no-backspace mode
and bolted a warning on afterwards.

## Phase I — the regulation gate

Three reads before an irreversible mode: **how are you**, **how activated**,
**how regulated**.

Activation and regulation are asked **separately and are not opposites**.
Calm-and-unreachable is a real state and so is lit-up-and-completely-here.
Collapsing them into one number loses exactly the case that matters.

**It advises. It never blocks.** A test asserts `allowed === true` across all
121 rating combinations. Blocking an adult from their own app because a slider
said so is paternalism at the moment someone has least patience for it, and it
teaches people to lie to the slider. It says *"this might not be the moment for
something you cannot take back"*, offers the door, and lets them through either
way.

**Local, and never attached to anything said.** There is deliberately no
parameter for a message or rupture id, and a test asserts none survives. This
is the rule people miss: a self-report that can be quoted back at you is not a
self-report, it's ammunition — and the moment it could be, people stop
answering honestly and the whole thing is worth nothing.

Thresholds aren't thin. A 6 is a normal Tuesday.

`wentAheadAnyway` is counted, because advice that's always ignored is advice
pitched wrong, not a person being stubborn.

## Phase L — the care profile

*"When I'm upset, I need affection."* And everything in that shape: how to
hold me, what helps, what doesn't, boundaries, dislikes, my reactions and what
they mean, gratitude, things I forget to say.

**Authorship is absolute.** Their entries are theirs — you can read them, you
cannot edit or delete them, and `author` is never a parameter; it's always the
caller. A remote entry is *forced* to their authorship rather than trusted
from the payload. A profile of someone the other person can rewrite is a
projection, not a profile, and one person deciding what the other needs is the
exact failure this prevents.

**Surfaced, not filed.** When a rupture is logged, their *"when I'm upset"*
entry appears. A care profile nobody reads is a form you filled in once.

**A partner never sees their edit history.** *"She used to need X"* turns a
living document into a receipt. Editing keeps the previous version — for the
author only.

## A real bug my own test caught

`health()` used `Date.now()` while everything else used the injected clock.
An injectable clock bypassed in **one** place is worse than none: the tested
behaviour silently stops matching the real behaviour. Found because a test
measured 0 where the engine reported 1. Same bug fixed in `hardtalk`.

## Verified

`node eravos/test/run-all.mjs` → **344 passed, 0 failed across 14 files.**

---

# 0.17.0 → 0.18.0

## Why the relay wasn't running — and it was my bug

v0.15.0 moved the relay onto the app's own port at `/relay`. **It did not move
the client.** `eravos-kernel.js` still pointed at `ws://localhost:8787`, where
nothing has listened since.

This is the exact failure I kept warning about while building the thing that
caused it: the app loads perfectly and never connects, which looks like *"she
just isn't online"* and tells you nothing.

**Fixed by removing the thing that could drift.** The client now *derives* the
relay URL from the page it is already on — same host, same port, `/relay`, with
the scheme matched (`wss://` from `https://`, `ws://` from `http://`). There is
nothing left to keep in sync. That is what made consolidating worth doing in
the first place; I did half of it.

Precedence, most specific first: **Settings override → `config/options.json` →
derived.** `relayUrlSource()` says which one is live, and it's shown in
Settings › Admin, because a wrong relay URL is a silent failure and the first
question is always "what is it actually using".

**And I nearly shipped a config option that did nothing.** I wrote the lookup
against `ERAVOS_OPTIONS` — a global I invented. The real one is
`window.EravosConfig`. That would have been the same cosmetic-toggle failure I
found in the feature system two releases ago, so: check the name, don't assume
it.

## Port config, with a stated precedence

```
--port  >  ERAVOS_PORT / PORT  >  eravos/config/options.json  >  8080
```

`node eravos-serve.js --show-config` prints which one won, along with the lock
state and paths. An unreadable config file is **named**, not silently defaulted
— that's how someone edits a file for an hour with no effect.

## Single instance, and kill-previous

Two instances isn't hypothetical here — the old `start-all` launched two
processes, and a stale one holding the port makes a fresh start fail with
`EADDRINUSE`, or worse, succeed on a *different* port while the browser still
talks to the old one.

A lock file records the pid. On start it checks whether that pid is **actually
alive** — a lock left by a crash is not a running server, and treating it as
one blocks every future start. Then it either stops the previous instance
(default) or refuses with a reason and the fix.

Details that matter: it waits for the port to free rather than racing into
`listen()`; it only removes **its own** lock, since deleting someone else's is
how two instances both believe they're alone; and `EADDRINUSE` with no lock now
says *"something that is not Eravos"* and tells you the three ways to change
the port.

`stop-all.sh` reads the lock and kills that pid, rather than pattern-matching
node processes.

## Verified live

Started one, started a second, watched it stop the first, and confirmed the
survivor serves the app, reports healthy, and returns `101 Switching Protocols`
on `/relay`. Six lock tests cover dead pid, live pid, missing file and corrupt
file.

**And I did the silent-`str.replace` thing again** — inserted tests without
asserting the anchor matched, and they didn't land. Caught by the test count
not moving. Every edit in this pass asserts.

## Verified

`node eravos/test/run-all.mjs` → **350 passed, 0 failed across 14 files.**

---

# 0.18.0 → 0.19.0

## The screenshot found a bug I could not have found from the code

Both invite dialogs rendering inline, stacked mid-page, one under the other.

`.modal` was used in the markup and **defined nowhere in the stylesheet.** A
class that exists only in HTML is not a class — it just does nothing, and the
divs render in the page flow. Defined now, with `.open` to show it.

Also: the prompt and the invite form could be open at once. One dialog at a
time now, and the first-run prompt waits for onboarding rather than stacking
underneath it — a dialog appearing before the page behind it has rendered
reads as a crash rather than a question.

## "I can't hear my partner" — four fixes, in order of how much they help

**1. Replay the last 15 seconds.** The highest-leverage thing here, and the
one nobody builds. You didn't mishear because the codec was bad — you missed
it because a bus went past, or you were thinking, or they trailed off. Every
other fix tries to *prevent* that. This just lets you hear it again, while the
call keeps running underneath. It's the "sorry, what?" without making them say
it twice.

Memory only, rolling, cleared when the call ends. A recording of your partner
that outlives the conversation is a different thing entirely, and not one
anybody consented to. A source grep asserts no `MediaRecorder`, no `Blob`, no
`writeFile`.

**2. Captions as the real fallback.** When audio is genuinely bad the answer
isn't better audio, it's text. On-device, local only — a caption is a *guess*
about what someone said, and a guess doesn't get transmitted as though it were
what they said. No Web Speech API on iOS Safari; that's reported, not silently
skipped.

**3. Constraints for a relationship, not a conference call.** The default
browser stack is tuned for meetings: aggressive noise suppression and AGC,
right for a laptop in an open office and wrong for someone speaking quietly to
you at midnight. Noise suppression eats breath and the near-silence at the end
of a sentence — often the part carrying the most. The default profile turns all
three **off**.

**4. Bitrate, last.** Opus 64k mono with in-band FEC, via SDP munging because
there's no API for `maxaveragebitrate`. `usedtx=0` on purpose — discontinuous
transmission cuts quiet passages, and quiet is where most of this conversation
lives. SDP with no Opus is returned **unchanged** with the reason; mangling the
offer would break the call outright.

## 146 ways to say it

Not an emoji picker — your keyboard already has every emoji. What it doesn't
have is a set **organised by what you're trying to say**, searchable by meaning
rather than Unicode name. Scrolling 3,000 pictures is more work than typing the
sentence, which is why people give up and send the fire.

Twelve groups: holding, affection, kissing, touch, wanting, missing you, when
it's hard, friction, good, playful, what I need, everyday.

**Every entry carries words.** That's the alt text, the search index, and what
makes it usable by someone who reads emoji differently than you do. An emoji
without words is a guess at both ends. Every one links to feelings, so sending
can set yours — but only when asked, because sending a heart isn't always a
declaration about your internal state.

**My own dupe check was wrong.** It flagged 🫂 appearing twice — but that's
"holding you" in one group and "I need to be held" in another, which are
opposite ends of the same gesture. Reuse across *meanings* is deliberate;
the same emoji meaning the same thing twice is the actual mistake. The check
distinguishes them now, and reported "healthy" while listing faults before,
which is a check that neither passes nor fails usefully.

"Something else" is always last — the private one that means something only
between two people is where the real vocabulary lives.

## Verified

`node eravos/test/run-all.mjs` → **373 passed, 0 failed across 15 files.**

Open: the replay buffer and captions need real Web Audio and a real mic. That's
a device pass, and it's stated rather than implied.

---

# 0.19.0 → 0.20.0

## Six engines were dead in the browser

You said the QR was missing and it was vital. It was — and it wasn't only the QR.

`eravos-kernel.js` constructs its engines **at parse time**, guarded:

```js
const eravosPairing = (typeof Pairing !== 'undefined') ? new Pairing({}) : null;
```

That guard exists so the kernel degrades instead of throwing. It also means a
class loading **after** the kernel produces a permanently `null` global and
**no error at all**.

The kernel was loading at index 10 of 20. Everything below it was dead:

```
eravosChat           needs ChatEngine       loads at 14
eravosChoice         needs ChoiceRegistry   loads at 12
eravosGrammar        needs GrammarStore     loads at 16
eravosSelectGrammar  needs SelectGrammar    loads at 17
eravosPresence       needs PresenceShell    loads at 15
eravosPairing        needs Pairing          loads at 19
```

Chat, the Other primitive, shared grammar, select-to-propose, presence, and
pairing. Six features I built, shipped, and described to you — none of them
ran. `openInvitePartner()` returns on its first line because `eravosPairing`
is null, which is exactly the "…" in your screenshot.

**Why the tests didn't catch it.** Every test constructs engines directly with
`new`. None of them goes through the browser's script load order, so none
could see this. 373 green tests and six dead features, simultaneously. §1.1 —
passing tests are not proof it runs, and I said that repeatedly while this was
sitting in the build.

**Fixed at the root**, not with per-call-site guards: engine classes now load
before the kernel that constructs them, and the ordering carries a comment
saying it is load-bearing.

**`test/boot-order.mjs`** is the check that would have caught it on day one.
It reads which globals the kernel builds at parse time, finds which file
defines each class, and fails the build if any of them loads later. It runs
inside `run-all` alongside the other two lints.

## Verified

`node eravos/test/run-all.mjs` → **373 passed, 0 failed, choice-lint ✓,
token-lint ✓, boot-order ✓.**

---

# 0.20.0 → 0.21.0

## The lattice was reading the margins

The app emits **45 event types. Six reached the lattice.** The two most-used
weren't among them:

- **every chat message** — the main text channel between you
- **every feeling you set** — with its body words attached

Both invisible. A relational lattice that can't see what you say to each other
or how you said you were is reading the margins.

Now 14 sources, with a rule stated so the next addition isn't a judgment call:
**an event is ingested if it carries human language or a stated inner state.**
Transport isn't — presence pings, sync frames, acks and call invites say
nothing about the relationship, and feeding them in would dilute every
dimension with noise that always co-occurs.

Added: chat, feelings set and expressed, mirrors, love letters, safety
requests, meaning, planner outcomes.

## The ninth dimension — the field

Emergence's relational field: trajectory, decay score, rupture severity,
meaning charge.

**Different in kind from the other eight.** Every one of those compares two
*moments*. This compares **the state the relationship was in** when each was
said. Two moments can share no words, no need, no intent and no
feeling-movement and still belong together because the field was in the same
place — and that is exactly what none of the others can see. It has its own
resonance class: *"nothing in common but the state you were both in."*

**Trajectory dominates.** A mismatch caps the score at 0.25 rather than being
averaged away. `DECAYING` and `REPAIRING` are opposite motions, and identical
decay scores must not make them look similar.

**Read at ingest**, so a node records the state the relationship was *actually*
in when it was said — not the state it's in now when you look back.

**It abstains when Emergence isn't attached.** Emergence is a separate project,
attached rather than vendored — the same relationship WARP has. Without it the
dimension returns null, reports *silent*, and everything else is unaffected.
The bridge says so **once** and stops trying; it never fabricates a field.

## A stale count, for the second time

`grammar.test.mjs` asserted exactly 8 dimensions and broke on the ninth —
the same failure `lattice.test.mjs` had at 7. A count is a fact about today;
the contract is the invariant. Both now assert presence and shape, so a tenth
dimension won't break a test about grammar.

## Verified

`node eravos/test/run-all.mjs` → **378 passed, 0 failed, all three lints ✓.**

---

# 0.21.0 → 0.22.0

## The four measures

You named three. There's a fourth, and it's the one the lattice actually runs on.

**Invariant** — what persists. Words in ≥80% of everything said. Slow, and it
means a lot when it changes. **Sigma** — deviation from a baseline that is
*yours*. Not "is this high" but "is this high *for you*". It's why jitter
thresholds are per-speaker and lattice thresholds are per-corpus. **Delta** —
what moved, and how far.

**Divergence** is the fourth: disagreement between measures taken *at the same
time*. Same need, different words. Same words, different feeling. It isn't
persistence, deviation, or change — it's two instruments reading one moment
differently, and that gap is usually where the information is. Every one of the
lattice's signal classes is a divergence.

Every record through the pipeline carries all four, so nothing downstream has
to recompute them from raw text.

## The pipeline kernel

v0.21.0 widened ingest from 6 sources to 14 by adding cases to a map. That
works while every source is an internal event. It stops the moment data comes
from *outside* — Instagram, Threads, Emergence — because those need consent,
provenance, deduplication and a way to withdraw one source without touching
the rest. Fourteen more cases would be fourteen places to get consent wrong.

**Consent is the only door.** `ingest()` **throws** on an external record
without a live grant from both sides — the spec's *"broken by design, an error
not silent degradation"*. An adapter cannot bypass it because the adapter never
touches the store. One side isn't consent, and the refusal names who's missing.
Consent **expires after 90 days**, because consent that never expires is
consent nobody is giving any more. Either side revokes alone.

**The server never stores relational data.** `/pipeline/ingest` parks records
in memory and drains them on read. A server-side store would be a second copy
outside the device.

## The userscript

One conversation with one named person, posted to your own machine.

It **reads nothing** when the open thread isn't the named contact — returns
before reading, not read-and-filter, because a tool that reads all your DMs
"and then filters" has already read all your DMs. `@grant none`, no storage,
no third party, matched only to `/direct/` pages. A badge sits on the page
whenever it's active: something reading your messages should never be
invisible, least of all to you.

Three tests grep the userscript source to hold that.

## A flaw my own test caught

My first fingerprint bucketed time to the minute. Two reads forty seconds apart
straddled a boundary and produced two records — a continuous scraper would have
**flooded the lattice with the same conversation on every page load**, poisoning
every dimension at once. There's no bucket size without that edge. Time is
ignored entirely now when the platform gives no id. The trade-off — two genuine
"ok"s collapse into one — is the right way round.

## Verified

`node eravos/test/run-all.mjs` → **400 passed, 0 failed, all three lints ✓.**

---

# → 0.24.0  ·  port 80, anonymousservers.info, and two silent data losses

Merged onto the uploaded working copy, which carries **Emergence and WARP** as
siblings. Brought the unmet-needs work across; everything else was already
there.

## Port 80 and the domain

`server.port` is now **80**, and `anonymousservers.info` replaces the
placeholder host throughout the proxy configs.

**The constraint, stated rather than discovered:** on Linux and macOS, ports
below 1024 need root or `CAP_NET_BIND_SERVICE`. It now preflights and, on
`EACCES`, prints the three real fixes instead of a stack trace — router
mapping, `setcap`, or a reverse proxy — and says plainly that running this as
root is not one of them, because it's a server holding two people's private
writing.

On Windows you likely won't hit it. What you *will* hit is something else
already on 80, and that path already names itself.

Worth knowing: the other session had already configured **external 80 →
internal 8080** via UPnP, which achieves the same thing with no privileges.
That option is still there if the direct bind fights you.

## The invite link that only works on your own machine

The boot-time `publicOrigin` fetch is fire-and-forget, so a modal opened
inside that window minted a QR encoding **`http://localhost:80/#pair=…`**.

That's the worst kind of broken: it encodes cleanly, scans cleanly, and
resolves to *her* machine. Nothing to diagnose.

`openInvitePartner()` now **awaits** the real origin before minting, and
`originIsShareable()` refuses loopback outright with the reason and the fix
shown on the modal.

**And a test found a second one.** The constructor's fallback is
`https://eravos.local` — a fabricated placeholder. Not loopback, so it sailed
past the first check, and `.local` is mDNS: fine on one LAN, meaningless over
the internet. Also refused now.

## Two ways data went quiet — both reproduced first

**The orphan namespace.** `_userKey()` is `(S.dbPrefix || 'solo') + '_' + key`.
Anything written before an account existed lands under `solo_*`; every read
after login looks at `james_*`. Reproduced:

```
write feeling with no prefix  →  solo_feeling
set dbPrefix = 'james'
dbGet('feeling')              →  null
```

On disk and unreachable. The worst failure shape available — the data is right
there and the person is told they never wrote it.

**Solo history at the moment of pairing.** `dbSet` writes the shared copy on
the *next* write, not at pairing. So a year of solo writing sits under
`james_*` while `shared_*` is empty, and the couple view looks like the history
began the day you paired.

`shared/eravos-persistence.js` fixes both. `adopt()` runs on login, `promote()`
at pairing. It **never deletes**, **never overwrites**, and when both sides
hold something that differs it keeps both and reports the conflict rather than
picking — a silent pick there is one person's history quietly winning over the
other's.

## Verified

`node eravos/test/run-all.mjs` → **424 passed, 0 failed across 18 files,
all three lints ✓.**

Still open, and only you can close it: none of this has run against two real
devices, and no camera has read the QR.

---

# 0.24.0 → 0.25.0  ·  presence baked in, co-creation asked once, planner shared

## Presence defaults on — and what did not change

I shipped `shareCursor` and `shareTab` **off**, reasoning that watching
someone's cursor is a lot. That reasoning was about a **stranger**. For two
people who have deliberately paired, off-by-default means the app starts cold
and stays cold until someone goes hunting in Settings — and the shared cursor
is most of what *"navigating this together"* actually is.

**The guarantee was never the default, and it hasn't moved:**

- it still takes **both** sides — a remote cursor is ignored unless this side
  is sharing too, so nobody can watch unilaterally
- either side turns it off **alone**, instantly, no permission
- still **never persisted** — not capped, never written

Default-on decides where you start. It does not decide who can stop.

**Read receipts stay off.** *"Seen at 11:04 and said nothing"* is a different
kind of information from where a cursor is, and it's the one that gets used
against people.

The two tests that broke were asserting the old *default*, not the guarantee.
Rewritten to assert the guarantee — plus a new one asserting the default
deliberately, so the change is on the record rather than a silent drift.

## Every shared setting, asked once

Ten settings across four engines, each defaulting on its own and each needing
to be found. In practice nobody finds them, so the app runs on whatever the
defaults happened to be and the pair never actually chooses.

One popup, at the moment you pair — the only time these questions are live.
It waits rather than stacking under onboarding or the invite prompt, and it
never asks twice. Skipping is a real outcome: the defaults stand.

**Mine vs Ours is the whole model.** A `mine` setting is what I broadcast — I
decide alone, either of us stops alone, and turning it on does **not** turn it
on for them. An `ours` setting requires both, and `set()` has **no parameter
for the other person**, so one person cannot configure a pair.

Every setting shows **what it costs** under its label. A switch whose
consequence you have to guess is not a choice.

## The planner

**Scope is per event, never per app.** Every event starts `mine`, and it stays
that way even when a shared calendar exists — being paired is not consent to
publish your diary. There's no share-everything switch, because that's a
decision nobody makes carefully once.

`share()` produces **`proposed`**, never `shared`. Only their `accept()` makes
it shared, and you cannot accept your own. Putting something in someone else's
calendar is scheduling them; the difference is the entire point of a shared
calendar between two people rather than a team one.

Declining is an answer and **the event stays in their own week** — they still
have the thing. Either side unshares alone. And sharing with no shared calendar
is refused loudly rather than queued into nothing.

**Solo is not a lesser mode.** Add, list and keep all work with no partner
anywhere, tested explicitly.

## Verified

`node eravos/test/run-all.mjs` → **452 passed, 0 failed across 19 files,
all three lints ✓.**

---

# 0.25.0 → 0.26.0  ·  the create-account path was invisible, not missing

Live on a tunnel at `anonymousservers.info`, registration enabled in admin,
and no Create Account button on the login screen.

## Three separate breaks in one path

The register form **already existed and was complete** — invite banner,
paste-a-link field, name, email, password, solo/duo select, and a `doRegister`
that genuinely scans the invite and emits `pairing:request`. All of it, sitting
in `index.html` behind `display:none`.

Nothing ever showed it:

1. **`setRegistrationEnabled()` was never defined.** The admin toggle has
   called it since the pane was written. `onchange` threw a `ReferenceError`
   into the console while the checkbox flipped visually and nothing was
   stored — so registration could never actually be turned on. A control that
   *looks* like it worked is worse than one that visibly fails.

2. **`applyRegState()` toggled `#register-tab-btn`, which didn't exist.** The
   login tab bar had been removed with a comment saying so; the button it used
   to contain went with it, and the function kept looking for it.

3. **Nothing called anything that would reveal the form.** No
   `showRegisterForm`, no way back to login if you got there.

Each break alone would have looked broken. Together they made the feature
**invisible**, which is why it survived this long.

All three fixed, plus `applyRegState()` is a real function now rather than a
one-shot IIFE, so turning the toggle re-runs it — and if registration is
switched off while someone has the form open, they're put back rather than
left with a form that will refuse on submit.

**Registration stays closed by default.** An open door on a public tunnel is
not a default.

## The invite path, walked end to end

```
1. james mints        YHUF658Y → https://anonymousservers.info/#pair=…
   shareable?         true
2. she opens the link the FULL link carries the peer id
   bare 8-char code   REFUSED — it cannot pair on its own
3. she registers      requested — paired? false
4. his device gets it from Anjali
5. he confirms        paired  ·  code now spent
```

Creating an account from an invite does **not** pair her. It creates a request
he confirms — the same two-sided rule as everywhere else. And `role: 'partner'`
is set at registration, because the pairing state machine being correct while
the account role is wrong would route her into the wrong path entirely.

## One test bug of my own

The handler-existence check flagged `if` as an undefined function — it was
matching `onkeydown="if(event.key==='Enter')…"`. The harness is a suspect too.

## Verified

`node eravos/test/run-all.mjs` → **464 passed, 0 failed across 20 files,
all three lints ✓.**

---

# 0.26.0 → 0.27.0  ·  QR overflow, 179 expressions, and `eravos://`

## The QR was never broken

It rendered correctly and burst out of the card. `eravos-kernel.css` already
capped it at 220px — and `eravos-fluid.css`, loaded later so it **wins**,
redefined `.iv-qr svg` with only a border-radius. The cap was silently
dropped.

Two rules for one class in two files is the silent-precedence shape Design
Law 1 forbids. The cap now lives in the winning rule, with a white quiet zone
inside the element so it scans against a dark card — a QR flush to a dark edge
is one a camera struggles to find.

`--qr-quiet` is declared as a token rather than punching an exemption in the
token lint. A QR's white is fixed on purpose — theming it would stop cameras
reading the symbol — but that's a reason to name it, not a reason for the lint
to have a hole.

## 179 expressions, and yours come first

Two new groups, specific rather than generic, because *"holding your hand"*,
*"fingers laced"* and *"squeezing once — I am here"* are three different acts:

**Hands (16)** — 🤝 holding your hand · 🫱🏽‍🫲🏾 not letting go · 🤲 both hands, take
them · 🫰 fingers laced with yours · 🤞 holding on for us · 🫳 hand on the back
of your neck · 🫴 palm up, waiting for yours · ✊ squeezing once — I am here ·
☝️ thumb across your knuckles · 🖐 palm flat on your chest · 🪢 hands knotted
together · 💍 the hand with the ring on it

**Closeness (12)** — 🧎 head in your lap · 🛌 curled into you · 🫶 pulled against
my chest · 👣 legs tangled · 🪞 forehead to forehead · 👃 nose in your hair ·
🦻 listening to your heartbeat · 🛋️ the same sofa, doing nothing · 🧦 your feet
on mine

Plus seven added to Touch — tracing circles, barely touching, hands in your
hair, lips at your ear, thumb on your wrist.

**The dupe check caught me twice.** I repeated 🫂 *holding you* and 🤙 *reach
for me* verbatim into the new group. Reuse across *meanings* is deliberate;
the same emoji meaning the same thing twice is the actual mistake, and that's
exactly what it exists to catch.

### Yours

The old "add your own" wrote a **text label into the choice registry** — it
recorded the words and produced nothing sendable, searchable, or linked to a
feeling. Now customs live in the expression set itself: stored, searchable by
meaning, mapped to feelings, and they come **first**, because the one that
means something only between you two is the one you actually reach for.

Private by default. An emoji with no words is refused — that's the alt text,
the search index, and what makes it usable by someone who reads emoji
differently than you do.

## `eravos://` — right instinct, wrong primitive

A magnet URI is a **BitTorrent** lookup key. `xt=urn:btih:<hash>` goes to the
public DHT and returns *whoever has that content*. Three problems: it's a
lookup key rather than an address, and you want **her device** — which the
peer id already names; the DHT is a very large third party in an app whose
whole point is that there isn't one; and it needs a BitTorrent stack you'd be
fighting rather than using.

`eravos://pair/<code>.<peer>.<fp>.<nonce>` does the job with the payload the
QR **already carries**. `inviteDeepLink()` emits it, `Pairing.parse()` reads
it, and both produce an identical payload to the https URL.

**The QR still encodes https**, deliberately: that works on any phone with
nothing installed, and the page can attempt `eravos://` first and fall through.
Same reasoning that keeps the manual code under the QR — a path nobody can
take is worse than no path.

`electron/PROTOCOL.md` has the handler, including `requestSingleInstanceLock()`
— without it a link launches a *second* Eravos that fights the first over the
port and the lock file.

And honestly on Electron: it buys the protocol handler, a tray icon so
presence survives a closed window, and no tunnel on the same LAN. It does
**not** make the connection more direct — two Electron instances on different
networks still need a relay exactly as two browsers do. It changes how you
*launch*, not how you *connect*.

## Verified

`node eravos/test/run-all.mjs` → **477 passed, 0 failed across 20 files,
all three lints ✓.**

---

# 0.27.1 → 0.28.0  ·  Electron: protocol handler, and a lock that wasn't there

## I nearly built a second Electron app

`electron-main.js` already existed in the repo — from the other session — and
it takes the right approach: it **requires `eravos-serve.js` and calls its
`main()` in-process**, rather than spawning or reimplementing. App, relay,
Emergence, wire: one process, one port, one window.

I had a competing `electron/main.js` half-written before I checked. Deleted.
Two Electron entry points would have drifted the first time either changed,
and silently — the desktop build behaving differently from the web build is
the divergence nobody notices until it matters.

What was actually missing got added **to it**:

## `eravos://` deep links

```
eravos://pair/YHUF658Y.eravos-9x4kd02m.fp-a91c.n0nce
```

The same payload the QR already carries, so `Pairing.parse()` reads it with
nothing new written.

Windows and Linux deliver it as an argv to a *second* instance; macOS fires
`open-url` on the first. Both handled. A link arriving before the window
exists is **held**, not dropped — clicking an invite while the app is starting
is the common case, not an edge one.

**Not a magnet link,** and worth being specific: a magnet URI is a BitTorrent
lookup key handed to the public DHT. It finds *whoever has this content* and
announces the search to a global network. You want **her device**, which the
peer id already names, with no third party in the path.

The QR still encodes **https**, deliberately — that works on any phone with
nothing installed, and the page can attempt `eravos://` first and fall
through.

## The lock that wasn't there

`electron-main.js` had **no `requestSingleInstanceLock()`**. Double-clicking
the icon twice started a whole second Eravos, which then fought the first over
the port, the lock file and the SQLite database.

That was a real bug before I touched anything — the protocol handler just made
it certain, since every link click would have launched one. Added.

## A preload, because the renderer is a web page

`contextIsolation` and `nodeIntegration` were already right; there was no
preload, so the page had no way to receive a pair link.

`electron-preload.js` exposes exactly three things: a version string, an
inbound pair listener, and a text-only notification call. It matters more here
than in most Electron apps — **this page renders text written by another
person over a network**, and a renderer with Node access turns a message into
a way to run code on your machine.

A test asserts every `ipcRenderer.send` has a matching `ipcMain.on`, because a
preload call nobody listens to looks wired and isn't.

## Packaging

`build` config bundles eravos and the relay inside the app; Emergence, WARP
and wire ship as extra resources. Data directories and lock files are excluded
— shipping someone's data inside an installer is not a small mistake.

Packaged, `resourcesPath` is passed as `--emergence-path`, because the
sibling-folder assumption doesn't survive packaging. Without it Emergence
degrades to "not attached" on every install while working perfectly in dev.

## What Electron does and does not buy you

**Real:** the protocol handler; a tray icon so **presence survives a closed
window** — the one thing the web version genuinely cannot do; no tunnel on the
same LAN; notifications when unfocused.

**Not real:** a more direct connection. Two Electron instances on different
networks still need the relay, exactly as two browsers do. It changes how you
launch, not how you connect.

**Costs:** ~150MB per install, an update mechanism you now own, and without
code signing the OS will tell her the app is untrusted — a bad first thing for
her to be told by software you asked her to install.

## Two of my own mistakes

I patched embeddability into the wrong `eravos-serve.js` — there are two trees
here and I edited the one that doesn't ship. And my preload security check
matched the **comment explaining the rule** rather than code. The harness is a
suspect too.

## Verified

`node eravos/test/run-all.mjs` → **497 passed, 0 failed across 21 files.**

Open: Electron cannot be launched here, so whether a built installer runs is a
device check. Stated rather than implied.
