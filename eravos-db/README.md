# eravos-db

An encrypted, per-user + per-couple database for Eravos, built on the
**real** Jaa persistence primitives that already exist in your codebase
(`emergence/vendor/jaa/`: `FileStore`, `FileRefs`, `canonicalize`, `Recovery`)
— not the aspirational SQL/gate/Bayesian engine described in the
architecture doc, which doesn't exist in code yet.

## What this honestly is vs. isn't

**Real, working, tested:**
- Every user gets their own directory + their own AES-256-GCM encryption
  key (envelope-encrypted under their password via scrypt). Verified on
  disk — see `test/smoke.test.js`, "on-disk row content is not
  plaintext-searchable".
- 8-digit partner invite codes: generate → redeem → creates a shared
  couple database, key-wrapped separately for each partner.
- Content-addressed storage means every `update()` keeps prior versions
  recoverable (`table.history(id)`) — a real, small version of the
  "time travel" the architecture doc describes, not a large claim.
- A small global lookup index that holds **no plaintext** email/username
  — only SHA-256 hashes for login lookup, plus ids and file paths.

**Not built here** (would be separate, larger projects if you want them):
WebRTC peer sync between two devices, the SQL parser/query planner, the
Bayesian weight updates, the "red team" adversarial gating, the
association bank. Those are described in `SISO_JAA_Architecture.docx`
but aren't implemented anywhere in the uploaded code, so I didn't pretend
to wire into something that isn't there.

## Layout

```
src/
  persistence/     — the real Jaa primitives, copied unmodified from emergence/vendor/jaa/
  crypto/Cipher.js  — AES-256-GCM + scrypt, the encryption layer that was missing
  core/
    Table.js        — create/insert/get/update/delete/history on top of FileStore+FileRefs
    Database.js      — one encrypted DB = one directory + one key
  index/GlobalIndex.js — the one non-sensitive lookup file (hashed email/username -> userId)
  users/
    schema.js         — profile, onboarding_answers, module_state, granted_keys
    authFile.js         — password hash + wrapped master key (lives outside the encrypted tables, see below)
    UserStore.js          — createUser(), login()
  partners/
    schema.js         — couple, chat_messages, cocreation_notes
    InviteCode.js       — generate(), redeem(), openCoupleAsMember()
  emergence/schema.js — emergence_links: ties a couple to emergence's person-store ids
examples/demo.js   — runs the whole flow end to end
test/smoke.test.js  — 7 checks, including a literal disk-content check
```

## Why auth data lives in `auth.json`, unencrypted, next to the encrypted store

This is the one deliberate exception, and it's necessary, not sloppy: the
password hash and the wrapped master key are what you need *before* you
can decrypt anything else. If they lived inside the encrypted table
store, you'd need the master key to read the data that tells you how to
derive the master key. Storing them in the clear is safe because:
- the password hash is one-way (scrypt, can't be reversed to the password)
- the wrapped master key is itself AES-256-GCM ciphertext, unwrappable
  only by someone who can re-derive the KEK from the correct password

Everything else — email, username (display copy), onboarding answers,
module state, chat, notes — is encrypted at rest.

## Run it

```bash
npm run demo   # full walkthrough: create 2 users, invite, redeem, chat, re-login, history
npm test       # smoke tests
```

## Wiring into the real Eravos app

Three integration points, in order of how I'd tackle them next:

1. **Replace `eravos-persistence.js` / localStorage calls** with
   `UserStore.login()` / `db.table(...)` calls — this is a rewrite of
   the storage layer, not the UI.
2. **Wire the invite UI** (the existing 8-digit copy-invite flow) to call
   `InviteCode.generate()` / `.redeem()` instead of whatever it does now.
3. **Emergence hookup**: `emergence_links` gives you a place to store
   which emergence space/person-ids belong to a couple; the actual calls
   into `person-store`/`idea-store`/`event-ledger` still need their own
   adapter, since I didn't have those modules' internals in front of me
   here — happy to build that next if you want to point me at them.

## One honest flag on the architecture doc

Worth naming plainly: `SISO_JAA_Architecture.docx` describes a system
with "no theoretical ceiling," self-improving indefinitely, adversarial
red-team agents attacking its own noise, planetary-scale collective
intelligence, etc. None of that exists in code, and it's not something I
built here — it's marketing/vision language, not a spec. What I built
instead is a normal, working, testable encrypted database. If the plan
is to actually build toward the bigger vision, my suggestion is to keep
scoping it the way we just did this piece: one concrete, testable layer
at a time.
