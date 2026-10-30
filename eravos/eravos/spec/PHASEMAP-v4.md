# PHASEMAP v4 — everything outstanding, phased

Supersedes v3's remainder. Bottom-up per **§3.1**: no phase starts until the
one below it has a passing check. **§8.5** — this exists before the code.

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
