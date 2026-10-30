# PHASEMAP v4 — everything outstanding, phased

Supersedes v3's remainder. Bottom-up per **§3.1**: no phase starts until the
one below it has a passing check. **§8.5** — this exists before the code.

**2026-08-25:** Phase 0 added — accounts, partner linking, and the real
encrypted backend — and promoted ahead of Phase I. See "Direct priority
override" below for why.

**2026-08-25 (later same day):** Phases Y and Z added at the end —
closeness/co-creation features grounded in an actual pass over the
long-distance-relationship app market, the love-languages literature, and
neurodivergent/trauma-aware relationship-communication research, plus a
cross-cutting ambiguity/trauma/neurodivergence layer that applies
retroactively rather than living in one new tab. Nicknames-for-each-other
was already specced in Phase 0 above; Phase Y cross-references it rather
than re-specifying it.

Shipped as of v0.16.0: A–H of v3 (choice, chat, surfaces, presence, grammar,
fluid, retrofit), plus admin, pairing, QR, the three new features, one-port
deployment, and the safety layer.

---

## The ordering argument

Four of the things asked for touch someone at their worst moment: unretractable
messages, a live shared cursor, a model of how they change, and a record of
what they need when upset. Each is good and each has a failure mode that lands
on whoever is least able to absorb it.

So **Phase I comes first and everything risky sits behind it.** A regulation
check is not a nice extra — it is the gate that makes the rest safe to build.

**Direct priority override, James, 2026-08-25:** Phase 0 below is inserted
*ahead of* Phase I, not because the regulation gate stopped mattering, but
because everything Phase I–X assumes a per-person, per-couple place for its
data to live, and that place does not exist yet in server form. `dbPrefix`,
`solo_`/`shared_`, `adopt()`, `promote()` (all real, all in
`eravos-persistence.js` today) are a *local* namespace scheme keyed to
whatever device you're on — there is no account, no `users` table, and
nothing that survives a lost or wiped device. Phase 0 does not replace that
scheme; it gives it a durable, encrypted, server-side home and a real
identity to key it by. Everything below Phase 0 keeps working exactly as
specified once it lands.

---

## Phase 0 — Accounts, partner linking, and the real backend *(priority — ahead of Phase I)*

The foundation everything else in this document quietly assumes.

### The shape of it

- [ ] **Account creation creates a database, not a row.** `createUser(email,
      username, password)` provisions the user's own encrypted store the
      same moment the `users` index entry is written — never a shared table
      with a `user_id` column bolted on after. One person's data is never
      structurally adjacent to another's on disk.
- [ ] **Built on what's already vendored, not a new dependency.** `jaa`
      (`emergence/vendor/jaa/` — `FileStore`, `FileRefs`, `Recovery`,
      `canonicalize`) is already a real, content-addressed, crash-safe
      persistence engine, ported line-for-line from the PHP original and
      already exercised by `event-ledger` and `associative-lattice`. Each
      user's store is its own `FileStore` root
      (`data/users/<user_id>/store/`), addressed by `SHA-256(canonical(x))`
      exactly as it already works today — not a reinvention, an instance.
      `Recovery`'s WAL (`begin()`/`commit()`) is what makes "everything is
      persistent" literally true: a crash mid-write replays, it never
      silently drops the half-written record.
- [ ] **Encrypted at rest, for real.** The per-user `FileStore` is written
      through an AES-256-GCM layer keyed by a value derived from the
      account password (scrypt, Node's own `crypto.scrypt` — zero new
      dependency, matching this repo's own stated preference) — never the
      password itself, never a reversible encoding of it. The server holds
      ciphertext and a scrypt hash for login, never a plaintext password,
      never a key that unlocks a store without that user's own credential
      in the request.
- [ ] **`users` index** (`data/users/index/` via `FileRefs`, name → hash of
      the user record): `user_id`, `email`, `username`, `password_hash`
      (scrypt, salted), `created_at`. Nothing else lives at this level —
      onboarding answers, module data, chat, and emergence each get their
      own schema below, inside that user's own store, never flattened into
      one giant record.

### Partner linking — the 8-char code, now hooked to a real identity

- [ ] `eravos-pairing.js`'s existing `CODE_ALPHABET`/`CODE_LEN` (8 chars, no
      `O`/`0`/`I`/`1`/`L`) is already right and is reused as-is — it does not
      get reinvented. What changes: the code payload's `peerId` resolves to
      a real `user_id` in the new `users` index, where today it resolves to
      an anonymous device-generated peer id with nothing behind it.
- [ ] **`partners` table** (`data/partners/`, `FileRefs`-backed, same
      atomic-write-then-rename pattern already used everywhere else in this
      repo): `user_id_a`, `user_id_b`, `paired_at`, `status`. A row is
      created the moment a code is *redeemed*, not the moment it's issued —
      matching the existing two-sided "request, then confirm" acceptance
      flow in `eravos-pairing.js`; scanning a code still doesn't pair
      anyone by itself.
- [ ] **One row per couple, looked up either direction** — `user_id_a` next
      to a partner's own row never lets one side's record be edited by the
      other; the row records that the link exists, it is not where either
      person's data lives.
- [ ] Unpairing sets `status` and keeps history — same "it never deletes"
      rule `eravos-persistence.js`'s own header already states for solo/
      shared conflicts, applied here too.

### The shared co-creation database

- [ ] **Reuses `relay-persistence.js`'s own proven shape**, not a new
      pattern: `node:sqlite`'s `DatabaseSync`, already real, already zero-
      dependency, already crash-tested in this repo for paired co-creation
      events. Keyed by the new `partners` row (`couple_id`) instead of the
      current fixed two-peer-slot scheme.
- [ ] **Same server-blindness guarantee, kept, not weakened.** Today's
      relay "only ever reads `type`/`peerId`/`pub` on the wire — never
      `payload`" (`relay-server.js`'s own words). Phase 0 keeps that: the
      couple's shared store holds the same opaque, already-encrypted bytes
      it holds today. The account layer authenticates *who* may read or
      write a couple's row; it never gains the ability to read the row's
      contents.
- [ ] **Realtime stays on the existing relay**, not a new transport —
      `co-creation-relay/relay-server.js` + `nano-ws.js` already do
      trust-on-first-use identity and message routing; Phase 0 swaps the
      identity source (fixed peer slot → authenticated `user_id` pair from
      the new `partners` table) and leaves the wire protocol alone.
- [ ] **"Mutual goes to co-creation, solo stays solo" is a routing rule, not
      a UI toggle bolted on late.** Every write from a paired account
      carries a `scope: 'solo' | 'mutual'`. `mutual` writes go to both the
      writer's own store *and* the couple's shared store in the same
      `Recovery`-backed batch — same durability guarantee as everything
      else, applied to the one write path everything else in this section
      depends on. `solo` writes from a paired account still stay out of the
      couple's store entirely, by default — sharing something from solo
      mode is an explicit action, never an inferred one.

### Schemas — one per data type, inside the user's or couple's store

- [ ] **Onboarding answers** — per-question record, versioned (answers
      change; the earlier answer is kept, not overwritten, same "it never
      merges two non-empty values" rule).
- [ ] **Per-module/per-tab data** — one schema per existing
      `contracts/*.contract.json` (chat, needs, struggles, triggers,
      feelings, rupture, desires, goals, rituals, poetry, mythos, ideas,
      canvas, vault, careprofile, and the rest already listed in
      `contracts/`) — the contract each tab already declares is the schema;
      Phase 0 gives each one a real persisted record shape instead of
      (today, for most of them) browser-local storage only.
- [ ] **Chat** — messages, threads, read state; `mutual` by default (a
      conversation with no partner to read it isn't a conversation), with
      the same unretractable-send behavior from Phase J once that lands.
- [ ] **Emergence** — the existing `emergence/schemas/ledger-record.schema.json`
      shape, per user, feeding the same `event-ledger`/`associative-
      lattice`/`pattern-engine` components already in `emergence/components/`
      — Phase 0 gives them a real per-user and per-couple store to read
      from server-side, rather than only the local instance.
- [ ] **Nicknames for each other** — a small `mutual`-scope record on the
      `partners` row (`nickname_a_for_b`, `nickname_b_for_a`) — each side
      sets their own; neither can set the other's, same authorship rule as
      Phase L's care profile.
- [ ] **Shared notes/documents** — a new schema and a new
      `contracts/documents.contract.json`: title, body, edit history,
      `mutual` scope by default, realtime-synced the same way as the
      co-creation content below. This is new surface, not a repurposing of
      an existing tab.

### Communication features — the full set, one scope rule for all of them

- [ ] Messages/inbox, feelings, needs, struggles, triggers — every existing
      "send this to your partner" surface in this repo gets the same
      `scope: 'mutual'` routing above. None of these get a bespoke sync
      path; the routing rule is the feature.
- [ ] **SMTP config, a real Settings tab.** `tiny-smtp-client.js` already
      exists and is already real (STARTTLS, AUTH LOGIN/PLAIN, zero deps) —
      it has no UI yet. New subtab under `eravos/tabs/settings/subtabs/`:
      host, port, username, an app-password field stored the same
      encrypted way as everything else in that user's store (never in
      plaintext config on disk). Used first for sending the partner-invite
      code by email — the 8-char code plus a real link, sent through the
      user's own configured relay, matching the "your own credentials,
      your own relay" scope `tiny-smtp-client.js`'s own header already
      commits to.
- [ ] **Realtime co-creation for the creative tabs** — poetry, mythos,
      canvas, ideas: live sync over the existing relay once both sides'
      writes carry `scope: 'mutual'` and a real `couple_id`. Couch party
      (already specified in Phase M) rides the same relay and the same
      shared store for its side channel and its persisted log.

### Migration, so existing solo/shared data isn't stranded

- [ ] `adopt()`/`promote()` (existing, in `eravos-persistence.js`) run once
      against the new backend on first login after Phase 0 ships: local
      `solo_*`/`shared_*` keys get pushed into the new per-user store under
      the same additive, never-overwrite rule they already follow today.
      No one's existing history goes quiet because the storage moved.

**Gates:** Phase I onward — every phase below assumes a real `user_id`, a
real `couple_id`, and a real place mutual data lands. None of them need to
be re-specified; they need this underneath them.

---

## Phase I — Regulation gate *(next)*

The thing that makes Phase J possible.

- [ ] Before entering any irreversible or high-exposure mode: **how are you,
      how activated, how regulated.** Three quick reads, not a form.
- [ ] **Advise against, never block.** If someone reads as activated or
      dysregulated, say so plainly and offer the door out — and then let them
      through if they still want in. Blocking an adult from their own app
      because a slider said so is its own harm, and being told *"this might
      not be the moment"* is usually enough.
- [ ] The reading is **local, never synced**. Your partner does not get told
      you rated yourself dysregulated. Same rule as the safety layer, and for
      the same reason.
- [ ] Never used to **explain someone away**. It gates a mode; it never
      annotates a message with "he was dysregulated". That would turn a
      self-report into ammunition.
- [ ] Offered at natural moments, never nagged. Dismissed is dismissed.

**Gates:** Phase J (no-backspace), Phase K (shared typing), Sparring, and
Desires.

---

## Phase J — Unretractable send *(behind Phase I)*

- [ ] What you send is what you said. No edit, no delete, no backspace past
      the send.
- [ ] **Opt-in per person, not per pair.** You choose it for yourself. One
      person cannot impose irreversibility on the other — that is a pressure
      mechanic wearing a values costume.
- [ ] Regulation check on the way in, and again if it has been a while.
- [ ] **A way out that is not "turn it off in Settings during a fight":** a
      hold-to-send delay you set yourself, so the unretractable thing still
      has a beat before it leaves.
- [ ] Sparring inherits it. Sparring is already turn-based and time-boxed,
      which is exactly where this belongs.

**Open question for James:** default off. I would want a reason before making
irreversibility the default state of a relational app.

---

## Phase K — Shared typing *(behind Phase I)*

- [ ] See each other write, live, character by character.
- [ ] **Both sides opt in, and either can stop alone** — the presence rule.
- [ ] **A visible "I am composing privately" state.** Without it, going quiet
      to think reads as going quiet at someone. That is the difference between
      intimacy and being watched.
- [ ] Never persisted, like all presence.
- [ ] Off by default. Watching someone type is a lot.

---

## Phase L — Partner care profile

The one that pays back most per line written.

- [ ] **"When ___ happens, I need ___."** The core shape. *When I'm upset, I
      need affection.* Written by the person it is about — never inferred,
      never filled in on their behalf.
- [ ] Sections: how to hold me · what helps · what does not · boundaries ·
      dislikes · my reactions and what they mean · gratitude · things I forget
      to say
- [ ] **Their entries are theirs.** You can read them; you cannot edit them.
      A profile of someone that the other person can rewrite is not a profile,
      it is a projection.
- [ ] **Surfaced when relevant**, not stored and forgotten: their "when I'm
      upset" entry appears when a rupture is logged.
- [ ] Every entry editable and revocable by its author, with history kept.
      What someone needed two years ago is not what they need now, and both
      are worth having.
- [ ] Free text everywhere — routed through the choice primitive.

---

## Phase M — Long distance, everyday

Not events. The ordinary texture of being in someone's life.

- [ ] **Couch party** — watch together with a synced clock and a side channel.
      Pause is shared; anyone can pause.
- [ ] **Passive presence** — a light that says they are up, cooking, working.
      No detail, no location, opt-in, revocable in one tap.
- [ ] **Same-thing-together**: read the same page, cook the same recipe, walk
      at the same time. Not a competition, no streaks.
- [ ] **Dropped moments** — a photo, ten seconds of sound, a sentence. Not a
      message needing an answer. The point is being in a day, not conducting a
      conversation.
- [ ] **Slow letters** — write now, arrives tomorrow. Deliberate latency as a
      feature.
- [ ] **A shared object you both change** — a playlist, a drawing, a list. It
      accumulates without either of you performing.
- [ ] **Time-zone humane by default.** Nothing arrives at 4am unless it is
      urgent, and "urgent" is a thing you choose, not a default.

---

## Phase N — Merged dashboard *(option, off by default)*

- [ ] One view of both of you when co-creating: their pulse beside yours,
      what you are each working on.
- [ ] **Both must opt in, and it shows exactly what each side chose to
      share** — never "everything, because we merged".
- [ ] **Nothing comparative.** No side-by-side counts, no who-logged-more, no
      streak either of you can break. A dashboard that scores two people
      against each other is a machine for resentment.
- [ ] Either side can un-merge alone, instantly.

---

## Phase O — Voice and video messages ✅ DONE

- [x] Record and send. Real gap found first, not assumed from the spec's own
      claim: neither `MediaRecorder` nor a voice/video `ATTACHMENT_KINDS`
      entry actually existed anywhere in the codebase (confirmed by direct
      search) — `MediaRecorder` had only ever lived in `clarity-engine.js`,
      removed in Phase R. Only the seekable-media-serving claim held up.
      Built for real: `MediaRecorder` in `tabs/chat/chat.js`, reusing
      `sendMediaMessage()`'s own established bypass-`validateAttachment()`
      pattern (`sendRecordedChatMessage()` in the shared kernel) rather than
      inventing a second send mechanism.
- [x] **Recorded, not live.** A real review step — re-record or discard —
      always sits between stopping the recording and sending; nothing
      auto-sends.
- [x] Re-record before sending — real, wired button, discards the prior
      take and starts a fresh one.
- [x] Transcript optional, local, and **never required.** Runs live via
      `SpeechRecognition` *during* the recording (the only way it can work at
      all — Web Speech API has no way to transcribe a finished file), never
      pre-checked, disabled entirely when nothing was heard.
- [x] Size-bounded with a stated limit, said before you record — 2 min
      voice / 1 min video, in the record button's own title, with a real
      auto-stop at the limit and the existing 6MB hard cap
      (`MAX_MEDIA_BYTES`) as the backstop regardless.
- [ ] Unretractable after, if Phase J is on — not built; Phase J itself
      isn't real yet, so this is structurally deferred, not skipped.

Real bugs found and fixed during the build, not after: two separate
self-inflicted syntax breaks (an accidentally deleted function declaration,
a leftover dangling `return`/`}` from the function this was inserted
after) — both caught by a syntax check before they went further. A real,
separate, pre-existing bug in `sendMediaMessage()` found while reusing its
pattern: `_emit('message', { id })` only ever passed the id, not the full
message, silently breaking any listener expecting `msg.text` (including
the Emergence tick listener from an earlier phase) — fixed on both the
photo/video path and the new voice/video path.

Verified end-to-end, not assumed: real record → live timer → stop → review
(blob URL confirmed) → send, confirmed in a real browser with fake media
devices. Send correctly queues rather than delivers when P2P isn't yet
connected — confirmed this is identical, pre-existing behavior for a plain
text message under the exact same timing, not a bug specific to this
feature. Receiving-side Gate logic verified directly and separately: a
real `chat:media` Cause with a `voice-message` payload correctly lands in
both the thread (`mine:false`, correct transcript text) and the vault.

---

## Phase P — Modelling over time

The one I would build last and most carefully.

- [ ] **Reflects, never predicts.** "You have logged this more in winter" is a
      mirror. "You are likely to withdraw next week" is a fortune teller with
      your data, and it changes the thing it describes.
- [ ] **Never shows one person a model of the other.** Yours is yours.
- [ ] Every claim traces to the entries that produced it, and any of them can
      be deleted, which removes the claim.
- [ ] **No scores, no percentiles, no comparison to anyone.**
- [ ] Off by default, and deletable independently of the data underneath.

---

## Phase Q — Android, as a real APK

- [ ] Permission map first, before any packaging: what is asked for, when,
      what breaks without it, and what is never asked for at all.
- [ ] `RECORD_AUDIO`, `CAMERA` — Phase O only, requested at first use, never
      at install.
- [ ] `POST_NOTIFICATIONS` — presence and messages, declinable, app fully
      works without it.
- [ ] `INTERNET` — the relay.
- [ ] **Never**: contacts, SMS, call log, precise location by default,
      background location, accessibility services. Each is a line, and each
      is worth naming as a line.
- [ ] Local notification only. No FCM — a push service is a third party in
      the data path, and this app does not have one.
- [ ] Then packaging. A real APK is the *last* step, not the first.

---

## Standing constraints, unchanged

| | |
|---|---|
| **Nothing is forced** | Every prompt skippable, every share two-sided, no decline re-asked. |
| **Ephemeral means ephemeral** | Presence is never written. Not capped — never written. |
| **Two-sided by construction** | One person cannot turn a shared thing on for both. |
| **Reflects, never predicts** | The system records what someone said they meant. |
| **One write authority** | Surfaces render; engines store. |
| **Local unless explicitly shared** | Safety, regulation, and modelling never cross the relay. |
| **No pressure mechanics** | No streaks, no completion scores, no partner-waiting notices. |
| **Explicit over implied** | Ambiguity is a tax someone always pays; the app pays it, never either partner. |
| **A translator, never a fortune teller** | Anything that rephrases what was said; nothing that guesses what wasn't. |

---

# Real-time calling infrastructure — Phases R–X

Direct request: phase-map the full voice/video scope before building any of
it, isolate audio/text-voice/video-calling as real separate modules (bottom-up,
JS before the UI contract), then a Discord-like calling UI on top. Added here
rather than a competing PHASEMAP-v5 — same document, same lettered sequence,
Phase Q was the last one written.

**§3.3 done first, honestly**: the deeper read this phase-mapping pass
required turned up a real problem before any of the new scope could safely
start.

---

## Phase R — Reconcile the audio-processing duplication *(blocks everything below)* ✅ DONE

Two real, independently-built modules currently do overlapping work on the
same call: `shared/clarity-engine.js` (gate/EQ/limiter, a rewind ring buffer,
an `onTranscript` hook) and `shared/eravos-callaudio.js` (profile-based
constraints/SDP tuning, its own separate rewind buffer via
`startReplayBuffer()`/`replay()`, and its own separate live captions via
`startCaptions()`). Both are wired into real call code paths today, not
dead weight sitting unused — confirmed directly, not assumed, by grepping
every real call site in `eravos-kernel.js`.

This is exactly the failure §3.3 exists to prevent, and I built the second
one myself in an earlier turn without checking whether the first already did
the job. Naming it honestly here rather than quietly building a third thing
on top of two conflicting ones.

- [x] **Real comparison, not a coin flip.** `eravos-callaudio.js` owned the
      SDP/constraints/bitrate layer clarity-engine.js never touched — kept,
      unchanged. clarity-engine.js's real gate/EQ/makeup-gain/limiter DSP
      chain was the genuinely new capability — callaudio.js never processed
      the live signal at all before this, only tuned constraints/SDP.
- [x] **One rewind buffer.** `eravos-callaudio.js`'s own `startReplayBuffer()`/
      `replay()` kept (the real, contract-covered, test-covered
      implementation — 23 real assertions). Now buffers the DSP-processed
      stream when processing is active, not raw audio — a replay plays back
      the clearer version.
  **Real, separate bug found and fixed in the same pass**: `startReplayBuffer()`
      was never called from anywhere in `eravos-kernel.js` — confirmed by a
      direct grep returning zero real call sites. The replay-last-15-seconds
      feature, this module's own headline capability, was completely
      unwired dead code. Now wired into `attachRemoteStream()`, verified in
      a real browser with fake media devices: `replay()` returns real
      buffered audio samples, not a "no buffer running" failure.
- [x] **One captions/transcript path.** `eravos-callaudio.js`'s own
      `startCaptions()` (real, working, browser `SpeechRecognition`) kept.
      clarity-engine.js's `onTranscript` hook was never wired to a real
      endpoint — a stub, not a working second path — retired with the rest
      of that file.
- [x] Every call site in `eravos-kernel.js` updated: `attachRemoteStream()`
      now calls `eravosCallAudio.startProcessing()` +
      `eravosCallAudio.startReplayBuffer()` together; `detachStreams()` calls
      `stopProcessing()` + `stopReplayBuffer()` together. `clarity-engine.js`
      deleted; its script tag removed from `index.html`.
- [x] Full test suite green after: 400 passed, 0 failed, lints clean,
      `callaudio-expressions.test.mjs`'s 23 real assertions unaffected.
      Verified live in a real browser (fake media devices, not mocked):
      DSP processing active, replay buffer genuinely buffering, `replay()`
      returning real audio samples, `detachStreams()` correctly tearing
      down both systems.

**Gates:** everything in Phase S onward. Building new calling features on top
of two conflicting audio pipelines would mean debugging which one actually
ran, every time.

---

## Phase S — Isolate the calling modules *(behind Phase R, bottom-up)* ✅ DONE

19 of 34 real tabs, call and voice among them, currently have zero split JS —
every function still lives in the ~12,000-line `eravos-kernel.js` monolith
despite the HTML already living in `tabs/call/` and `tabs/voice/`. Rupture
was extracted first, this session, as the proof this pattern works and is
worth repeating (found and fixed a real, silent duplicate-function bug in the
process — see the rupture extraction's own commit for the full account).
Call is next, because everything in Phases T–W builds on it.

Real, current state, read directly rather than assumed: `voice.module.js` /
`voice-observer.js` / `prosody.js` / `voice.js` already exist as real, split
files (Phase F/the ALK work) — Voice does not have the "zero split JS"
problem Call does. Call does: `call.html` exists, `call.js` does not; every
real call function (`startCall`, `answerCall`, `toggleMute`,
`toggleScreenShare`, `sendCallReaction`, etc — the full real list is in
`contracts/call.contract.json`'s own `kernel_hooks_called`) still lives in
the shared kernel file.

- [x] **Audio primitives module** (`shared/eravos-callaudio.js`, post-Phase-R
      reconciliation) — already real, already isolated, already contract-
      covered. No change needed beyond what Phase R itself required.
- [x] **Text/voice-chat module** — `tabs/chat/` already split (this session's
      own bubble-redesign work). No change needed.
- [x] **Video-calling module** (`tabs/call/call.js`, new) — every function
      `contracts/call.contract.json` listed as a kernel hook, moved out.
      Same extraction discipline as Rupture: grepped every real call site
      first, moved the function, left a real pointer comment behind, full
      test suite green before commit.
- [x] **Screen-share / couch-party** — already real
      (`toggleScreenShare()`, canvas-compositing + `RTCRtpSender.
      replaceTrack()`). Moved with the rest of `call.js` in the same
      extraction, not a separate module — confirmed it shares state (the
      peer connection, the video grid) with the rest of calling rather
      than being independently ownable.
- [x] Real contract update after the move — `contracts/call.contract.json`'s
      own `status` field rewritten to describe the real, split file and the
      critical cross-tab bug found and fixed during the move.

**Gates:** Phase T (guest accounts need a stable, split `call.js` to attach
the invite-acceptance path to, not a moving target inside the monolith).

**Real outcome**: 33 functions + 20 state variables extracted to
`tabs/call/call.js`. A critical, real bug was found and fixed during the
extraction, not after: `initRTC()` runs on login regardless of which tab is
active, and every one of its PeerJS event handlers (including the very
first "peer ready" `callLog()` call) now lived in the lazily-loaded
`call.js` -- an incoming call while on any other tab would have hit
undefined functions. Fixed by making `initRTC()` async and awaiting
`eravosStampTab('call')` (idempotent) before registering any handler.
Verified directly: confirmed the functions were genuinely undefined
before, genuinely defined after, with the person's current tab left
completely undisturbed.

---

## Phase T — Guest accounts and call invite codes *(behind Phase S)*

Direct request: generate, copy, and send an invite code for a guest account
to join a call. Region set at account creation, or at the moment a guest
joins.

- [ ] **A guest account is real, not a fiction.** A minimal, real account
      record (name, region, a session-scoped identity) — not a shared
      password, not "anyone with the link is the same person." Ties into the
      real pairing/relay identity system already built this session
      (dynamic TOFU pinning, capped at real participants) rather than a
      parallel guest-auth system.
- [ ] **The code is real and single-purpose.** Generated per-call, not
      per-account — a standing "always let strangers into my calls" code is
      a real security posture nobody asked for. Expires with the call or on
      a real timer, whichever comes first, same pattern as the existing
      partner-pairing invite (`eravosPairing.inviteUrl()`, 24h expiry, single
      use) — reused, not reinvented.
- [ ] **Copy and send, both real.** A copy-to-clipboard button and a real
      share path (the existing invite-send-by-email path, reused) — not just
      a QR code, since a guest joining a call is often already mid-conversation
      elsewhere (a text thread, a different app) and needs a pasteable code,
      not a scan.
- [ ] **Region prompt, asked once, honestly framed.** Not "what's your
      country" as idle metadata — the copy explains directly why: "so live
      captions/transcription can use the right language model automatically."
      A guest who declines still joins the call; region only affects Phase U
      below, never gates entry.
- [ ] **A guest is never silently promoted to more than a guest.** No access
      to anything outside the call itself — not chat history, not the
      relational-health field, not any tab beyond the call UI. This is the
      one guarantee this phase cannot ship without: a "guest" who can browse
      the relationship's own private data isn't a guest.

---

## Phase U — Region-aware transcription pipeline *(behind Phase T)*

Direct request: dynamically change the Whisper pipeline to your region
automatically, once account/guest region is set.

- [ ] **Honest gap, named directly, not glossed over**: the call transcription
      built this session (`toggleCallTranscription()`, part of the existing
      `call.contract.json`) uses the browser's own native `SpeechRecognition`,
      not Whisper — there is no Whisper pipeline in this codebase today to
      redirect. This phase is real, new infrastructure, not a config
      flip on something that already exists.
- [ ] **Real region → locale mapping**, not a guess per call. A real, static
      table (region code → BCP-47 locale, e.g. `IN` → `en-IN` for Indian
      English, with room for a real Hindi/regional-language locale
      alongside it once asked for specifically) drives which locale
      `SpeechRecognition`'s own `lang` property is set to — the direct,
      achievable, already-supported path —*or*, if a real self-hosted Whisper
      endpoint is wired in later (the AI Bridge's own guardian-lite pattern
      is the real, established way this codebase already does "self-hosted,
      not a third-party API" for AI-adjacent work), the same region table
      selects the Whisper model variant instead. Built so the mapping table
      is the one real thing that has to change to add a region, not the
      calling code itself.
- [ ] **Two regions on one call, handled honestly.** Each device transcribes
      only its own mic (confirmed in the existing contract — this is also
      what gives free speaker attribution). Each device's own locale/region
      setting governs its own transcription independently; a call between an
      `en-IN` speaker and an `en-US` speaker runs two correctly-tuned
      recognizers, not one compromise setting for both.
- [ ] Falls back to the account's own set-at-creation region if a guest
      declined to set one in Phase T, and to `en-US` if neither is set —
      never a hard failure, matching §1.2.

---

## Phase V — Live transcript, call log, and lattice persistence *(behind Phase U)* ✅ DONE

Direct request: real-time transcription and call log, a show/hide button,
readable back at any time, recorded and persisted via the Associative
Lattice, with a real option to disable — and a consent prompt before it's
ever turned on.

- [x] **Already real and already wired**, confirmed directly: finalized
      transcript lines already emit as `call:transcript_line`, already land
      in `eravors_call_transcripts`, and `buildLatticeData()` already reads
      that store — the conversation already feeds the lattice live.
- [x] **CC button** — a real, separate show/hide toggle
      (`toggleTranscriptPanelVisible()`), independent of the on/off
      transcribe toggle. Verified directly: turning CC off hides the panel
      while the recognizer keeps running (`_recog` still real and active);
      real stop still genuinely stops it.
- [x] **Read back at any time** — real, existing `eravors_call_transcripts`
      grouped by `transcriptId` into one real entry per past call. No new
      storage. Verified with two real past calls: correctly grouped
      separately, not merged.
- [x] **Consent prompt before enabling, every time it's off and gets turned
      on** — a real modal, awaited before `startCaptions()` ever runs.
      Verified directly: clicking Transcribe shows the modal and does NOT
      start transcription; only accepting does.
- [x] **Real disable option** — `stopCallTranscription()` calls
      `eravosCallAudio.stopCaptions()`, which genuinely tears down the
      recognizer (`_recog` confirmed null after). Off means nothing new is
      captured, not that it's captured and hidden.

Two real, separate mistakes made and caught before shipping, not after: the
same accidental-dangling-code pattern as Phase O's own commit (this time a
leftover `callLog(...)` line orphaned outside any function by a str_replace
boundary — caught by a syntax check, the log line itself restored rather
than just deleted). And a real, pre-existing bug found while reading
`_appendTranscriptLine()`'s own code: transcript text was inserted
unescaped into `innerHTML` — a genuine XSS gap, relevant now that this app
is actually internet-exposed (this session's own DDNS/0.0.0.0 work).
Fixed using the real, existing `_escHtml()` helper, confirmed directly it
wasn't `esc()` (which doesn't exist globally) before using it. Also caught
and fixed before shipping: my own read-back view first reused
`chat-attach-sheet`, a class scoped to `#panel-chat` only — would have
rendered completely unstyled inside `#panel-call`. Fixed with real, direct
styling instead.

Verified end-to-end in a real browser: full consent → accept → CC on →
CC off (recognizer still running) → real stop (recognizer genuinely
stopped) sequence, and the read-back view against two real past calls
with a real XSS payload confirmed correctly escaped, not raw in the DOM.

---

## Phase W — Per-call controls *(behind Phase S, parallel with T–V)*

Direct request: CC button (Phase V, above), volume per person, mute button,
deafen button, hangup button — a real Discord-shaped control row.

- [ ] **Mute** — already real (`toggleMute()`, existing contract). No change.
- [ ] **Hangup** — already real (`endCall()`, existing contract). No change.
- [ ] **Deafen** — genuinely new. Mutes incoming audio from the remote
      stream entirely (distinct from muting your own mic) — a real
      `GainNode` set to zero on the remote stream's audio graph, not a
      fake "pretend to be deafened" UI state.
- [ ] **Per-person volume** — real only once a call can have more than two
      participants; a real, per-remote-stream `GainNode`, one per
      connected peer, each independently adjustable. Two-person calls (the
      only kind this app supports today) get one slider; this becomes
      meaningful once group/guest calls (Phase T) are real.
- [ ] Every control here reads its own real, current state on render — no
      control that can silently drift from what's actually happening to the
      audio graph (the exact class of bug Phase R exists to fix elsewhere in
      this same system).

---

## Phase X — The Discord-like calling UI *(last, behind everything above)*

**§8.5, followed literally**: the interaction contract for this UI is
written *after* Phases R–W are real, not before — because a contract written
against code that doesn't exist yet is a guess wearing a contract's clothes.

- [ ] Real interaction contract (`contracts/calling-ui.contract.json`) written
      once R–W are each individually real and tested — declaring the real
      DOM ids, the real kernel hooks each control calls, invariants, and
      failure modes, same shape as every other real contract in this repo.
- [ ] Instant messaging (already real, this session's bubble redesign),
      voice/video calling (Phase S), screen-share/couch-party (Phase S),
      guest invite (Phase T), region (Phase T), transcription (Phase
      U–V), CC/volume/mute/deafen/hangup (Phase V–W) — assembled into one
      Discord-shaped surface: message thread with a compose bar, a call
      control row, a collapsible transcript panel.
- [ ] **Every toggle in Settings, with a real summary and a real consent
      prompt before enabling** — direct, standing requirement for this whole
      scope, not just Phase V's transcription. Screen-share, guest-call
      access, region auto-detection: each gets a real Settings entry
      (matching the feature-registry pattern already used for Desires,
      Triggers, Commitments, Struggles, Meaning this session) and a real
      "here's what this does, Accept to turn it on" modal, not a silent
      default-on flip.

---

# Closeness, co-creation, and ambiguity-reduction — Phases Y–Z

Direct request: nicknames, a co-creation shared journal, hobbies/interests on
the profile, modules that learn and expand from the lattice, profile data
filled from the lattice, line-for-line story/poetry writing, and — zoomed all
the way out — every creative, romantic, loving, closeness-building thing a
real pass over long-distance-relationship research turns up as genuinely
high-leverage, for all five commonly-cited love languages, trauma- and
abandonment-aware. Then zoomed out again: all of Eravos as real
enterprise-grade — dynamic, expansive, customizable, deep — and an oracle for
reducing ambiguity, trauma-load, and neurodivergent friction.

Added here rather than a competing PHASEMAP-v5, same as R–X above: same
document, same lettered sequence, Phase X was the last one written.

## Phase Y — Closeness, co-creation, and the lattice-driven module system *(behind Phase 0, alongside L–M)*

### Shared co-creation journal

- [ ] New `contracts/journal.contract.json` — a running, mutual-by-default
      entry stream, distinct from Chat (Chat is conversation; the journal
      is a record either of you adds to when nothing needs a reply) and
      from the existing solo `poetry`/`mythos`/`ideas` tabs (those are
      creative work; this is "what today was").
- [ ] Either side writes an entry; both can attach media, reusing Phase O's
      real voice/video-message recording rather than a new capture path.
- [ ] Edit history kept, same "never overwrite, never merge two non-empty
      values" rule as Phase L's care profile and Phase 0's onboarding
      answers — a journal either side can silently rewrite isn't a record.
- [ ] Optional weekly/monthly "on this day" resurfacing, opt-in, never a
      streak and never a prompt about days skipped — the no-pressure-
      mechanics constraint applies here as directly as anywhere in this
      document.

### Profile: hobbies/interests, and filling from the lattice — carefully

- [ ] **Hobbies/interests as free-text, tagged fields** on the existing
      profile shape, same pattern as careprofile's own sections — not a
      fixed dropdown; a hobby is whatever the person calls it.
- [ ] **"Fill from the lattice" is a suggestion, never a write.** The
      `associative-lattice`/`pattern-engine` can propose a hobby or
      interest it noticed recurring across journal/chat/emergence data —
      surfaced as a real, dismissible "add this to your profile?" card,
      one at a time, never auto-populated into the profile record. Phase
      L already states, for the care profile, *"never inferred, never
      filled in on their behalf"* — this extends the same rule here rather
      than quietly relaxing it for convenience. A suggestion engine that
      writes silently the first time is a surveillance feature wearing a
      convenience feature's clothes.
- [ ] Declined suggestions are not re-asked — the existing "no decline
      re-asked" standing constraint, applied here too.

### Modules that learn and expand from the lattice

- [ ] **The lattice proposes modules; it does not install them.** When a
      real, sustained pattern shows up — recurring line-for-line poetry, a
      recurring topic with no dedicated tab — `pattern-engine` can propose
      a real, scoped feature-registry entry (same pattern already used for
      Desires/Triggers/Commitments/Struggles/Meaning) rather than a
      generic notification. Both partners confirm before it activates;
      declining is final until real new pattern data accrues, not a
      re-nag.
- [ ] Every lattice-proposed module ships under the same standing
      constraints as a hand-written one — mutual/solo scope, no scores, no
      streaks, reflects-never-predicts. The proposal mechanism is new; the
      rules a proposed module follows are not.
- [ ] **Reflects, never predicts, applies to the proposal text itself.**
      "You two have written poetry together five times this month" is a
      mirror and a legitimate module proposal. "You seem like poetry
      people" is a personality read the lattice has no standing to make.

### Line-for-line collaborative writing

- [ ] New turn-based mode on the existing `poetry`/`mythos`/`ideas` tabs:
      one line, or one stanza (either side's choice per piece), per turn,
      strict alternation, over the same realtime relay Phase 0 already
      wires for co-creation content.
- [ ] **A visible "it's your line" state**, not a silent turn queue — the
      presence rule from Phase K, applied to a slower medium.
- [ ] Full piece history kept and re-readable end to end, matching Chat's
      own unretractable-once-Phase-J-lands behavior — a collaborative poem
      is its own kind of record neither side should be able to quietly
      rewrite after the fact.
- [ ] A free-standing async mode too — no requirement that both be online;
      a line can sit unanswered for however long, the "your line" state
      simply persisting rather than expiring.

### What the research actually says is high-leverage, not just novel

A real pass over the market (existing long-distance-couple apps — love
counters, synced watch-parties, daily question decks, presence/pulse
widgets, shared diaries), the love-languages literature, and
neurodivergent/trauma-aware relationship-communication research, weighed
against what this app already refuses to do:

- [ ] **Low-pressure conversation decks, mapped to love language, not
      gamified.** The one consistently well-supported idea across the
      market pass: rotating categories of prompts/questions correlate
      with couples actually talking instead of running out of things to
      say. Built as a real `contracts/prompts.contract.json` deck, tagged
      by which of the five commonly-cited love-language categories a
      prompt leans toward — words of affirmation, quality time, acts of
      service, gifts, physical touch (a framework with real, live
      academic debate about how well it holds up empirically, named here
      as a useful *organizing lens for prompts*, not as a validated
      diagnostic to score anyone against). **No compatibility score, no
      "you two are an 87% match"** — Phase N's own "nothing comparative"
      rule applies here exactly as it does to a merged dashboard.
- [ ] **Protected, recurring ritual time** — a real, shared-calendar-backed
      recurring slot, tying into the existing `rituals` tab/contract,
      rather than an ad-hoc "let's talk later." A standing, predictable
      check-in slot is one of the most consistently cited high-leverage
      interventions in the neurodivergent-couples research — not because
      spontaneity is bad, but because a standing slot removes the
      guesswork of *when* a hard conversation is allowed to happen.
- [ ] **A real explicit-rephrasing helper for hard conversations** — this
      is the single most consistently cited idea across the
      neurodivergent/trauma-aware research (say the direct thing, remove
      the ambiguity, don't make a partner guess). Not built as a
      standalone feature here — see Phase Z's oracle below.
- [ ] **A deliberately named anti-feature, from the same market pass:**
      several real, shipping long-distance-couple apps sell continuous
      partner location tracking, "automatic check-ins," and daily
      phone-usage/sleep reports, framed as care. Eravos does not build
      this. It is exactly the shape of thing the existing "ephemeral means
      ephemeral" and "local unless explicitly shared" constraints already
      rule out — worth naming directly here so it doesn't get quietly
      re-proposed later as a "small" version of the same idea.
- [ ] **Reassurance that doesn't require a reply** — Phase M's "dropped
      moments" and "passive presence" already cover this; cross-referenced
      rather than re-built, since they're already the trauma/abandonment
      -aware version of "still thinking of you": no unanswered-message
      timer, no read-receipt pressure.
- [ ] **Nothing here ever surfaces a partner's silence as data.** No
      "they haven't opened the journal in 6 days" indicator anywhere, on
      either side — the same reasoning Phase I already applies to
      regulation checks, extended to every new surface this phase adds.

### Playful co-creation: art, games, and inner-child play

Direct request: ways to make things together, art, inner-child play, actual
fun — not just structured closeness-building. The research here points
somewhere specific and slightly counter to how these apps usually get
built.

- [ ] **Real-time collaborative drawing on the existing `canvas` tab** —
      a genuine simultaneous mode (both drawing at once, live cursors,
      shared strokes) alongside the turn-based option, not a replacement
      for it. Canvas already exists in the contract set; this is new
      modes on it, not a new tab.
- [ ] **"Draw it blind" doodle-request game** — one side sends a silly
      prompt ("draw what you think my dream last night looked like"), the
      other draws it without seeing anything else, both reveal together.
      Turn-based, async-friendly, over the same relay as the line-for-line
      writing above.
- [ ] **A "make-believe" pretend-play space on the existing `mythos`
      tab** — an ongoing shared imaginary world, characters, running bit,
      built purely for fun. Kept explicitly separate from the structured
      line-for-line collaborative writing above — that's crafted work with
      real stakes to the piece; this is deliberately silly, no "good
      writing" pressure, closer to two kids building a blanket fort than
      a co-authored short story.
- [ ] **A genuinely goofy prompt deck**, alongside the love-language deck
      already specced — "if you were a kitchen appliance, which one and
      why" territory. The inner-child-play research is specific that this
      only works if it's actually low-stakes and a little dumb on
      purpose; a game that's secretly another self-improvement exercise
      isn't inner-child play, it's homework in a costume.
- [ ] **Small cooperative real-time games over the existing relay** — a
      shared doodle-guess mode, a co-op word game — outcome is always
      cooperative, never scored or "won." The standing no-scores
      constraint applies to games exactly as it does to everything else
      here.

### A judgment-free space for the inner child, built on Sparring's engine — not its rules

Direct follow-up: Sparring already solves the hard infrastructure problem
here — a real turn-based, time-boxed relay, gated by Phase I's regulation
check before you're let in. That machinery is worth reusing directly rather
than rebuilding. Its *rules* are not — Sparring is combat-shaped on purpose,
built for real disagreement, and a judgment-free inner-child space needs the
opposite contract.

- [ ] **Same engine, opposite contract.** A new mode on Sparring's existing
      turn/time infrastructure, with its adversarial rules inverted: no
      rebuttal, no counter-argument, no "well actually." A turn here is
      offered and witnessed, never argued with.
- [ ] **A different name and a different visual language**, even while it
      shares Sparring's real machinery underneath. Calling this "Sparring"
      would undercut the entire point — sparring reads as a fight by
      design, and a space meant to hold something small, silly, or
      vulnerable needs to look nothing like one, at a glance, before a
      single word is typed.
- [ ] **Phase I's regulation gate matters more here than almost anywhere
      else in the app.** Advise, never block; local, never synced to the
      partner. Opening up something inner-child-shaped while dysregulated
      is a real risk, and the answer stays what Phase I already says: name
      it plainly, then let the person in if they still want in.
- [ ] **Unretractable send defaults off here — the opposite posture from
      Sparring.** Phase J's toggle is opt-in per person there because real
      conflict benefits from commitment, from not being able to walk a
      hard thing back mid-fight. A vulnerable or playful share benefits
      from the opposite: room to revise or soften before it's witnessed.
      Same Phase J switch, different default, because the two modes are
      solving for different risks.
- [ ] **The listening side has exactly one job: witness, not fix.** A real
      structural constraint on replies in this mode — no advice, no "have
      you tried," no counter-share until the other side is fully done.
      Phase Z's oracle can be offered here in its other direction too: not
      to make the speaker's words more explicit, but to help the
      *listener* find a reflecting-back response instead of reaching for
      a fix — the same translator, aimed at the receiving end for once.
- [ ] Same standing rule as the rest of Phase Y: opt-in, no completion
      score, and it never surfaces "you two haven't opened this together
      in 9 days."

### A second phase: working through something together, not just witnessing it

- [ ] **An explicit, mutual transition from witness to working-through —
      never automatic.** After a turn has been witnessed, either side can
      offer "want to figure this out together?" as a real, visible action.
      Nothing slides from witness-mode into problem-solving-mode on its
      own; that transition is exactly where an unwanted "well here's what
      I think you should do" would do the most damage, so it stays a
      deliberate step both people take.
- [ ] **This is not Rupture.** The existing `rupture` tab already exists
      for real repair-after-conflict work — this is for the much larger
      category of things that were never a fight: a mixed feeling, an
      undecided thing, a want that's hard to name out loud. Keeping it a
      separate mode from Rupture rather than folding one into the other,
      the same way Phase Y already keeps the crafted line-for-line writing
      separate from the deliberately-silly `mythos` pretend-play — two
      real things that would flatten into a worse version of each other
      if merged.
- [ ] Still governed by the same rules as the witness phase underneath it
      — Phase I's regulation gate, Phase J's unretractable-send default
      staying off — working-through is a gentler register than Sparring's
      conflict mode, not a return to it.

### Session requests, from the chat plus button, running inline in chat

Direct follow-up: rather than separate full-screen modes for Sparring, the
judgment-free space, and working-through, all three become **session
types** — requested from chat's existing plus-button menu (alongside voice/
video message from Phase O) and run inline in the same chat thread, instead
of a separate screen each time.

- [ ] **"Request a session" in the plus-button menu, with the type picked
      at request time** — Sparring, the judgment-free space, or
      working-through. One entry point, three real contracts underneath,
      not three separate buttons to remember.
- [ ] **Mutual consent, same as Phase K's shared typing.** A request is
      sent, the other side accepts or declines; declining needs no reason
      and is not re-asked in the same conversation, the standing "declined
      is declined" rule applying here too.
- [ ] **Phase I's regulation gate fires for both people on accept, not
      just the requester** — you're both entering it together even if only
      one of you asked. Same local-only, advise-never-block behavior, for
      each person separately.
- [ ] **The chat thread visibly changes state while a session is active** —
      the distinct, softer visual language already specced for the
      judgment-free space, or Sparring's own turn-boxed look, applied to
      the same compose surface rather than a new screen. A real "it's your
      turn" overlay, reusing the same state Phase Y already built for
      line-for-line writing.
- [ ] **A real start and end boundary in the chat history itself** — "Session
      started (Sparring)" / "Session ended," clearly marked, so scrolling
      back through chat later shows exactly which stretch of messages
      happened under which contract rather than blending into normal
      free-form chat.
- [ ] **Either side can end it alone**, same presence rule as everywhere
      else — ending returns the thread to ordinary chat immediately, no
      confirmation needed from the other side.
- [ ] **Session-scoped settings apply only inside that boundary and revert
      automatically on end** — unretractable-send default, witness-only
      reply constraints, whatever the session type calls for, never
      bleeding into normal chat once it's over.
- [ ] Real architectural upside worth naming directly: one relay, one turn
      engine, one regulation gate, three ruleset overlays — not three
      separate systems to build and keep in sync. The same feature-
      registry discipline Phase Z already asks for, applied here before
      the fact rather than as a later cleanup.



- [ ] The self-expansion research (Aron and colleagues, replicated across
      lab and daily-diary studies) is genuinely solid on one point:
      shared activities rated as *exciting*, not just pleasant, produce a
      real closeness/satisfaction boost that familiar-but-pleasant
      activities alone don't — this is the actual empirical case for
      "let's do something new together," not just a vibe.
- [ ] But a 2026 daily-diary study (Schrage et al.) found that effect
      isn't universal: for avoidantly-attached partners, novelty and
      excitement is what moves the needle; for anxiously-attached
      partners, familiar and comfortable activities are what buffer
      satisfaction, and novelty doesn't help the same way. This app has no
      standing to decide which of those describes either partner —
      exactly the same "reflects, never predicts" boundary already set
      for personality reads elsewhere in this phase.
- [ ] So: **two visibly separate, equally-weighted pools** — a "something
      new" prompt pool and a "something familiar/cozy" prompt pool —
      either partner picks per-mood, nothing pre-sorted into one pool for
      them by the lattice.

- [ ] **A gentle, occasional real-world suggestion, not everything kept
      inside the app.** Most of the self-expansion and inner-child-play
      research is actually about real activity, not screen content — a
      real, dismissible "something to actually go do together" prompt
      (long-distance-compatible or in-person, depending on the pairing)
      belongs alongside the in-app modes above rather than pretending
      every form of togetherness has to happen on a screen.
- [ ] Same standing trauma/abandonment-aware default as the rest of Phase
      Y: play is opt-in, has no completion score, and never surfaces
      "you two haven't played together in 2 weeks" — the same rule that
      already governs the journal and the rituals above applies here
      without exception.

**Gates:** needs Phase 0's realtime relay and Phase Y's turn-based
infrastructure above; reuses `canvas` and `mythos` rather than adding new
tabs for any of it.

---

## Phase Z — The oracle layer: reducing ambiguity, trauma-load, and neurodivergent friction *(cross-cutting, applies retroactively)*

Direct request, zoomed all the way out: make all of Eravos real
enterprise-grade — dynamic, expansive, customizable, deep — and an oracle
for reducing ambiguity, trauma, and neurodivergence friction. Two different
things live in that sentence, and they get named separately before either
is built.

### "Oracle" needs a real, narrow definition before anything gets built

- [ ] **A translator, never a fortune teller.** Phase P already draws this
      line for behavioral modelling — *reflects, never predicts* — and the
      oracle inherits it directly rather than becoming a loophole around
      it. It never says what someone is likely to do or feel. Its one job:
      take something either partner wrote and, on request, offer a more
      explicit, lower-ambiguity restatement — the exact intervention the
      neurodivergent-couples research names most often (turning "I wish
      you'd help more" into something request-shaped and concrete,
      surfacing an implied ask as an actual ask) — shown as a suggestion
      the author accepts, edits, or discards, never sent on their behalf.
- [ ] **Always requested, never ambient.** No live "clarity score" hovering
      over a compose box, no passive judgment of how someone phrased
      something. A visible, optional "make this explicit" action before a
      message sends — opt-in per person, same shape as Phase J's
      unretractable-send toggle, for the same reason: one partner cannot
      impose "clearer" on the other's own words.
- [ ] **Reduces ambiguity about the app, not just about each other.**
      Every non-obvious state anywhere in Eravos — a pending invite, a
      module awaiting confirmation, whether a piece of data is solo or
      mutual scope, whether transcription is on — gets a real, plain-
      language "what is currently true here" surface on request, never
      inferred from icon color alone. The same principle Phase X already
      states for every Settings toggle, generalized to the whole app
      rather than one screen.

### Neurodivergent-aware defaults, retrofit across existing surfaces, not a new tab

- [ ] **Explicit over implied, everywhere a partner writes to the other.**
      Direct, concrete language reduces real conflict for neurodivergent
      partners specifically and costs neurotypical partners nothing to
      use — consistent across independent sources in the research. The
      oracle above is the tool; this is the standing design rule the tool
      exists to serve.
- [ ] **Processing time is never punished.** No "seen" timestamp implies
      urgency to reply. Phase K's "composing privately" state already
      protects the *writing* side of this; extended here to protect the
      *reading* side too — a message can sit read-but-unanswered with
      nothing in the UI framing that as a debt owed.
- [ ] **Multi-modal by default, not bolted on.** Text, voice message
      (already real, Phase O), and the existing shared canvas for the same
      underlying content wherever it fits — forcing one channel is its own
      ambiguity tax on whichever partner doesn't think best in that
      channel.
- [ ] **A real low-stimulation display mode** — reduced motion, reduced
      color intensity, collapsed non-essential UI — a real Settings entry
      with its own accept-modal (Phase X's own standing rule for every
      toggle), not assumed from a system dark-mode flag.
- [ ] **A script/template library for hard conversations**, opt-in,
      editable, never inserted automatically — starting points for
      apology, request, boundary-setting, and repair-after-rupture
      (ties directly into the existing rupture tab). A blank compose box
      is itself a real barrier the research names directly; a template
      someone can start from and change is a scaffold, not a script
      forced onto their voice.

### "Enterprise-grade" defined honestly, not as a marketing word

- [ ] **Dynamic and expansive means the feature-registry pattern, taken
      seriously as the app's actual architecture**, not a phrase applied
      loosely — every module, existing and lattice-proposed alike (Phase
      Y), is a real registry entry: independently toggleable,
      independently exportable, independently deletable, with its own
      schema version. Nothing here should require a code change to turn
      off for one couple and on for another.
- [ ] **Customizable means per-couple, not per-install.** Ritual cadence,
      which prompt-deck categories surface, whether the oracle is on,
      low-stimulation mode, nickname display, journal resurfacing — real
      settings, per couple, never a single global default everyone
      silently inherits.
- [ ] **Deep means the schema depth Phase 0 already commits to is honored
      going forward** — every new surface in Phase Y and Z gets its own
      real contract file, its own real schema, its own place in the
      per-user or per-couple store, never a shortcut into an existing
      table because it's faster to ship.
- [ ] **"Enterprise-grade" does not mean telemetry, analytics, or
      engagement metrics** — the standing "no scores, no streaks, no
      comparison" rules apply exactly as hard to the business meaning of
      that phrase as to the relational one. Reliability, real encryption,
      real backups, real data export — the parts of "enterprise-grade"
      that actually serve the two people using this app — are the parts
      being built.

**Gates:** nothing below this blocks on Phase Z; it is a retrofit layer
that applies to Phase 0 through Phase Y as each ships, and to whatever
ships after. Phase Z is done when a real audit pass confirms every
existing surface honors it — not when a new tab called "Oracle" exists.
