# Privacy

Last updated: 1 August 2026 · Eravos v0.16.0

## The short version

Everything stays on your device. There is no server holding your writing, no
analytics, no telemetry, no third party, and no account. When you connect with
someone, messages pass through a relay **you** host and are encrypted between
your two devices.

The rest of this exists so you can check that, not so it can be waved at you.

## What is collected

**By us: nothing.** There is no us in the data path. No account, no email, no
identifier, no crash reports, no usage statistics, no cookies set by anyone but
the page itself.

**By your device:** everything you write. Feelings, ruptures, goals, the codex,
the vault, the lattice, chat history, shared grammar, desires. In your
browser's local storage, on your machine.

## What crosses the network

Only when you have paired with someone, and only these:

| | |
|---|---|
| chat messages | encrypted end-to-end |
| attachment references | a pointer, not the file |
| shared grammar proposals | encrypted |
| desire answers | encrypted, and sealed until you have both answered |
| presence — typing, cursor, which tab | **never stored, on either device** |

Your journal, vault, codex, feeling history and rupture log **do not sync**.
They are yours, on your device, and they never leave it.

### Encryption, stated accurately

X25519 key exchange, AES-256-GCM. Static-key ECDH — **not** ratcheted, so
there is no per-session forward secrecy. If your long-term key were
compromised, past traffic could be decrypted. That is a real limitation and it
is written here rather than under a padlock icon.

Whoever hosts the relay can see that two peers connected and when. They cannot
read anything. If that matters to you, host it yourself — which is the default.

## What is never collected, and cannot be

- **Message content is never analysed.** Nothing reads your conversations for
  sentiment, risk, or "abusive language". A classifier over private messages
  between two people is surveillance with a kind face.
- **Presence is never written down.** Cursor position, typing state, which tab
  you are on — sent live, held in memory, never persisted. A record of one
  person's movement through a relational app over months is not something
  anyone consented to keep, and that it would be *useful* is exactly why it is
  not kept.
- **Pattern notices never leave your device.** If Eravos surfaces something,
  your partner is not told, cannot be told, and there is no code path that
  could tell them. That module has no network access at all, and a test
  asserts it.

## What your partner can see

Only what you sent them, and only what you chose to share.

- Your **custom options** — your own words for a feeling, a need — are private
  until you explicitly mark one shared.
- Your **desire answers** are sealed until you have both answered that item,
  and only *mutual* interest is ever revealed. If one of you says no, the other
  learns it is not a match and nothing else.
- Your **limits** are yours. They are never transmitted.
- **Withdrawing** is instant, needs no reason, and they are never told what it
  was.
- Your **answer history** — the fact you changed your mind — is never shown to
  them.

## Third parties

None, by design. No fonts from a CDN, no analytics, no error reporting, no
maps tile server unless you turn location on, no AI provider unless you connect
one yourself and point it where you choose.

Runtime config still lists a public PeerJS and TURN server as a bootstrap
default. **That is not the intended state**, it predates the self-hosted
decision, and it is tracked as open. Those servers would see connection
metadata — not content. Replace them with your own when you deploy.

## Retention

Until you delete it. There is no retention policy because there is nobody
retaining anything.

## Your rights

Access, portability, correction and erasure are not requests you make to
anyone — they are buttons.

- **Export** — Settings, any time, whole database as JSON.
- **Correct** — edit anything, any time.
- **Erase** — Settings › Admin › Delete my account. Everything on the device.
  It exports first, and if the export fails the delete does not run.

## Children

Not for under-16s. There is no age verification, because there is no server to
verify against — this is a statement of intent, and it is your responsibility.

## If you are not safe

If someone else has access to your device, they can read all of it. Nothing
here can prevent that.

Settings › Admin deletes everything and exports first. Your browser also keeps
history of its own that Eravos cannot reach. Support services are listed in
Settings and are always available, whether or not the app has noticed anything.

## Changes

The date at the top is the version you agreed to. Material changes are shown
to you again. A changed document you were never shown is not consent.
