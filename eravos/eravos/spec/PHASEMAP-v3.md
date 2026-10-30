# PHASEMAP v3 — shared grammar, chat, presence

Supersedes the phase list rendered by `tabs/roadmap/roadmap.html` v0.5.0.
Bottom-up per **§3.1**: no phase starts until the phase below it has a
passing check. Every phase ends shippable.

**§8.5** — this file exists before the code it describes.
**§6.3** — registered in `SPEC-REGISTRY.md`.

---

## The dependency argument, stated once

Everything asked for here — the popup composer, the add-menu, shared cursors,
the shared grammar — sits on two things that did not exist:

1. **A message engine that is not owned by a surface.** A popup that owns its
   own thread means two stores that disagree the first time both surfaces are
   open. §10.1.
2. **An option primitive that always offers "Other".** Every prompt that would
   feed the grammar — feelings, needs, triggers, repair — presented a closed
   list. Building the grammar on top of closed lists means retrofitting all of
   them later, and in the meantime the grammar only contains words a stranger
   chose.

So those are Phase A and Phase B, and the popup is Phase C. That ordering is
not caution, it is the only order in which the later phases don't have to be
rebuilt.

---

## Phase A — Choice & search *(complete, v0.6.0)*

The foundation nothing else can skip.

- [x] `shared/eravos-choice.js` — the Other primitive. Every declared prompt
      offers "Other → in your words". No opt-out flag; `render()` cannot omit
      it. Custom options are remembered, offered **first** next time, private
      unless explicitly shared, and archived rather than deleted (§0.3).
- [x] Skip is real. `allowSkip` defaults **true**; a skip records `null`, never
      a default and never the first option. Even `allowSkip:false` needs an
      explicit override, and the error says reconsider.
- [x] Free-text search across built-ins and customs. Prefix matches first, no
      fuzzy guessing — it finds what is there rather than deciding what someone
      probably meant (§1.1).
- [x] Feelings search bar, above the grid. The vocabulary went 18 → 62 in
      Phase 1, and 62 tiles is more scanning than someone in distress should
      have to do to say how they are.
- [x] `selectFeeling()` accepts a custom value. It previously returned early on
      anything not in the built-in list, which would have made every "Other"
      tile silently do nothing (§1.2).
- [x] Five prompts declared in the kernel: `feeling`, `need`, `trigger.body`,
      `trigger.hold`, `repair`.

**Why this is the bottom layer, not a nicety.** A closed list is a claim about
what a person is allowed to feel. Handed 62 options and none of them right, the
common response is to pick the nearest wrong one — which then silently corrupts
every derivation downstream that reads it. A confidently-recorded wrong value is
worse than an absent one (§1.2).

**Verified:** `test/choice-chat.test.mjs`, 15 choice assertions.

---

## Phase B — Chat transport & engine *(complete, v0.6.0)*

- [x] `shared/eravos-chat.js`. One engine, injectable store, exercisable with
      no DOM at all (§3.4). Every test runs headless.
- [x] Five gates on the **existing** syncStream — no new pipeline:
      `chat:message`, `chat:receipt`, `chat:typing`, `presence:cursor`,
      `presence:tab`. `emitSync()` already owns queue-on-failure centrally, so
      an offline send lands in the Phase 1 outbox and replays on reconnect
      without this file reimplementing that check.
- [x] Attachments are **references**, not copies: `{kind, id, preview}`. Eight
      kinds — vault, feeling, need, spar_invite, codex, poem, canvas, grammar.
      Sending a vault piece sends a pointer, so it stays one artifact with one
      version rather than a duplicate that drifts.
- [x] **Ephemeral means ephemeral.** Typing and cursor positions are never
      persisted — not capped, not trimmed, never written. `_assertEphemeral()`
      enforces it and a test asserts the store stays empty under a thousand
      cursor events. Someone's mouse path through a relational app is not a
      record anyone consented to keep.
- [x] Bounded at 500 messages (§0.4). Duplicate replay is idempotent.
- [x] An offline send is marked `queued`, stays in the thread, and reports
      `queued-offline` in health. A transport throw is recorded **on the
      message**, not swallowed.

**Verified:** `test/choice-chat.test.mjs`, 21 chat assertions.

---

## Phase C — Chat surfaces *(complete, v0.6.0)*

- [x] `tabs/chat/` — the full page. Search over the thread, call button top
      right, add-menu, typing indicator, presence line.
- [x] The **popup composer**, mounted globally from any tab. Same engine, same
      thread. Unread badge, add-menu, call button top-right of the menu,
      expand-to-full-page.
- [x] Two engines over one store proven not to diverge — a test opens both and
      asserts they see the same thread.
- [x] Attachment pickers for all eight kinds. A picker with nothing to offer
      **says so** rather than silently attaching nothing (§1.2).

---

## Phase D — Shared presence *(complete except two-device verification, v0.10.0)*

- [x] Cursor sharing, **off by default**, opt-in on **both** sides. The engine
      never enables it because the other side asked.
- [x] Throttled at 80ms — 50 mouse moves in one tick send once, so a mouse path
      cannot flood the pipe carrying messages.
- [x] Stale presence expires rather than hanging: a cursor older than 5s and a
      typing flag older than 6s stop being reported.
- [x] Remote cursor renders as a soft presence, not a pointer — a glow with a
      name, and it removes itself when it goes stale.
- [x] `presence:tab` — which tab the other person is on.
- [ ] **Two-device verification.** Same exit-criteria discipline as Phase 1:
      cursor and tab presence across a real network, not a mocked one. This
      environment cannot run it.
- [x] **Presence in the shell.** A quiet line — *"Anjali is in Vault"* —
      above the ticker, hidden entirely when there is nothing to say. An
      always-visible "not connected" is a nag, not information.
- [x] **Co-navigation.** "go with them" opens the tab they are on and carries
      you as they move. One tap to stop, from either side.
- [x] **The asymmetry closed deliberately (§17.3).** Following someone through
      an app is one step from watching them, so: you can only follow someone
      already sharing their tab; the follow is **broadcast**, and their shell
      says *following you* — a follow they cannot see is surveillance, not
      co-navigation; and either side ends it alone.
- [x] **A follow never steals focus mid-sentence.** It defers while a text
      field holds content, retries, and is cancelled by unfollowing. Being
      yanked out of a half-written sentence to your partner is not
      togetherness.
- [x] Persists **nothing** — a test drives 200 tab moves and asserts the store
      stays empty. That a record of someone's movement through a relational
      app would be *useful* is exactly why it is not kept.

---

## Phase E — Shared grammar *(complete, v0.11.0)*

The grammar is the vocabulary that means something specific between two
people — words that carry more than the dictionary gives them.

- [x] `grammar` attachment kind. Typing a word and sending it makes it a shared
      artifact, which is the manual path: **type it, she sees it.**
- [x] `shared/eravos-grammar.js`. **Two-sided by construction**: `proposed →
      shared` has exactly one path, `takeUp()`, and it refuses the proposer.
      No flag, argument or admin path bypasses it, and the guarantee holds over
      the wire — `applyRemote('takeup')` refuses a sender who was also the
      proposer.
- [x] Grammar tab. Two meanings per entry, kept separately, **no canonical
      field exists**. Divergence is reported, never resolved. Meanings append
      rather than overwrite, so a word's sense drifting over years is kept.
- [x] Eighth lattice dimension, with `SHARED_LANGUAGE` as the
      highest-weight resonance class (7). Deliberately not folded into
      `lexical` — averaging a shared word into an ordinary-word score destroys
      the distinction the feature exists for. Terms resolve at ingest, so a
      word taken up later does not retroactively rewrite history.
- [x] Declining is recorded as an answer, not as silence. Retiring is
      unilateral by design: taking a word up needs both, putting it down does
      not.
- [x] Chat's `grammar` attachment now **proposes** the word. Sending it is
      offering it, not declaring it.
- [x] **Manual entry from anywhere.** Select a phrase in any tab — a rupture
      you logged, a poem, a message she sent — and put it forward without
      leaving the page. Still lands in `proposed`; a selection can never make
      something shared.
- [x] **The affordance is deliberately hard to trigger.** 3–60 characters,
      2–6 words, must contain letters, never inside a field you are writing
      in, never a duplicate. It never takes the caret and never opens a modal.
- [x] **The noise is measured, not assumed away.** `shownButIgnored` and
      `offerRate` are reported, and health flips to *"noisy — tighten the
      rule"* when offers outrun actions. An affordance that fires when nobody
      wanted it is a bug, not a discovery feature.

**Deliberately not automatic.** A word does not become shared grammar because
the lattice noticed it twice. Inferring private meaning from frequency is
exactly the overreach §1.1 forbids — the system would be telling two people
what their words mean to them.

---

## Phase F — Fluid pass *(three most-used prompts done, v0.9.0)*

The brief: *less boxes and deterministic, more fluid, custom.*

- [x] Chat is the pilot. No bubbles, no cards, no avatars, no per-message
      container. Speaker carried by indent and colour weight, time by spacing,
      attachments as a quiet reference line. Messages fade in rather than
      appear.
- [x] Search bars as a rule, not a box.
- [x] `shared/eravos-fluid.css` — Feelings, Needs, Rupture. Cards become left
      rules, inputs become underlines, buttons lose their fill, list items
      stop being tiles. Nothing glows at rest; focus is the only thing that
      brightens.
- [x] `.card`-in-`.card` stops drawing twice.
- [x] Motion carries state changes instead of a toast announcing them — and
      it respects `prefers-reduced-motion`, because someone with vestibular
      sensitivity or a migraine is exactly who is using these three tabs.
- [x] **Purely additive.** No ids move, no handlers change, no JS touched.
      Deleting the one `<link>` returns the tabs to the previous look with
      zero functional difference — which is the actual test of whether a UI
      layer is disposable (§5.12).
- [x] Extended to Triggers, Struggles, Commitments, Growth, Codex and Vault
      — the next tier by use. Still purely additive.
- [ ] Extend to the creative tabs (Poetry, Canvas, Mythos, Music), where the
      boxes carry more weight and the call is less obvious.

**Constraint that does not move:** `01-ARCHITECTURE.md` §2 — no tab defines its
own palette. Every colour stays a kernel custom property. The fluid pass is
layout, motion and typography; it is not a licence for hex.

---

## Phase G — Retrofit the Other primitive *(complete, v0.8.0)*

Phase A built it and wired five prompts. Every remaining closed list is a
prompt still telling someone their answer isn't available.

- [x] `shared/eravos-choice-field.js`. Retrofitting a prompt is now one entry
      in a table, not bespoke markup. Vocabularies are **seeded from the
      markup already in the tab**, so nothing is restated (§16.5).
- [x] **All 17 self-description selects routed** — somatic location and
      quality, growth category, commitment level, mythos type and tone, codex
      type, planner type, mutator style, music vibe, canvas mode, idea
      category, poem form, relationship stage and domain, ritual mode and
      duration.
- [x] **`test/choice-lint.mjs`, and it runs inside `run-all`.** Every
      `<select>` must be classified SELF or SYSTEM. An **unclassified** one
      fails the build — that is the point, more than the two lists: a new
      select cannot land without someone deciding which it is.
- [x] 11 system selects exempt with a stated reason each (§17.3). A closed
      list is *correct* for a vault filter or a model picker; bolting "Other"
      onto them would be noise, and noise makes the real rule easier to ignore.

**Debt paid, v0.9.0.** `rup-status` stays SYSTEM — relational-health
derivations read it as a state machine and free text would break every
consumer. But *"still there, we just don't talk about it"* fits none of
open/healing/resolved, and being made to pick the nearest wrong one is
exactly the §1.2 corruption. `#rup-status-note` now carries the person's own
words **alongside** the status, saved to `statusNote` and into
`status_history`. The derivations keep their state machine; the person keeps
their words. Nothing downstream had to change.

---

## Phase H — Voice & video grammar *(blocked on the A/V layer)*

- [ ] WebRTC A/V calls (the base call exists; this is the layer on top).
- [ ] Live transcription into the lattice during a call — the prosody module
      from v0.4.0 already measures the voice; this gives it words to attach to.
- [ ] Grammar candidates surfaced **after** a call, never during. Two people
      talking should not be watched by a suggestion engine in real time.
- [ ] Both-sides confirmation before anything becomes grammar, same rule as
      Phase E.

**Platform constraint, not an oversight:** no Web Speech API on iOS Safari.

---

## Standing constraints, carried into every phase

| | |
|---|---|
| **Nothing is forced** | Every prompt skippable. Every share opt-in on both sides. No decline re-asked more than once a day. |
| **Ephemeral means ephemeral** | Cursors and typing are never written. Not capped — never written. |
| **Two-sided by construction** | Shared grammar, cursor sharing, receipts: one person cannot turn them on for both. |
| **Signal, not diagnosis** | The system records what someone said they meant. It never infers a "real" meaning behind their words. |
| **One write authority** | The chat engine owns the thread. The choice registry owns custom options. Surfaces render; they do not store. |
| **Kernel tokens only** | No tab defines its own palette, through every restyle. |
