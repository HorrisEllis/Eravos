# Accounts integration (eravos-db)

What changed in `eravos-serve.js`, in the app's own terms.

## New sibling package

`eravos-db/` sits next to `warp/`, `emergence/`, `wire/` — same convention,
added to `eravos/package.json`'s `build.extraResources` so it ships in the
Electron build the same way those do.

## Boot sequence

Right after Emergence attaches (or fails to, gracefully), the server now
also tries to attach accounts:

```
[eravos] ACCOUNTS (eravos-db) DID NOT ATTACH: <reason>
```

If that line is absent, accounts attached fine. If present, `/api/account/*`
answers `503` with the reason — same honest-degradation posture as every
other optional subsystem in this file. Override the path with
`--accounts-path`, `ACCOUNTS_PATH` env var, or `accountsPath` in
`config/options.json`, same pattern as `--emergence-path`.

Data lives at `eravos/data/accounts/` — same directory family as
`data/emergence/`, `data/co-creation.db`, etc.

## New routes, all under `/api/account/`

| Route | Method | Auth | Does |
|---|---|---|---|
| `/api/account/signup` | POST | — | `{email, username, password, displayName?, onboarding?}` → `{token, userId}` |
| `/api/account/login` | POST | — | `{emailOrUsername, password}` → `{token, userId}` |
| `/api/account/logout` | POST | Bearer | drops the session |
| `/api/account/me` | GET | Bearer | current user's profile |
| `/api/account/invite/generate` | POST | Bearer | → `{code}` — 8 digits, 24h expiry, single-use |
| `/api/account/invite/redeem` | POST | Bearer | `{code}` → `{coupleId}`, provisions the shared couple db |
| `/api/account/couple/chat` | GET | Bearer | this user's couple's messages |
| `/api/account/couple/chat` | POST | Bearer | `{text}` → `{id}` |

Session tokens are `Authorization: Bearer <token>`, held **only in server
process memory** (`SESSIONS` map) — never written to disk, because a
session holds the unwrapped data-encryption key. Restarting the process
logs everyone out. That's intentional for a local-first single-process
app, not an oversight.

## The one real architectural note

`eravos-pairing.js` (existing, untouched) pairs two **devices** by peer id
— no account, no server round-trip, works exactly as it did before this
change. `eravos-db`'s invite system pairs two **accounts**. They're
independent systems that happen to both use an 8-digit-ish code. Nothing
here removes or reroutes the existing pairing flow — this is additive.

Whether/how those two should eventually merge (e.g. pairing a device also
pairs the account behind it) is a product decision, not something I
decided for you here.

## What's still a stub, on purpose

`invite/redeem` currently requires the inviter to have an **active session
on this same server process** (`openInviter` scans `SESSIONS`). That's
correct for one desktop instance testing with itself, and wrong for two
different people on two different machines — real multi-device redeem
needs the WebRTC peer-sync layer the architecture doc describes, which
isn't built. Flagging this loudly rather than papering over it with a
fake success path.

## Tested

`test/curl-flow.sh`-equivalent commands were run against the real,
running `eravos-serve.js` (not a mock): signup × 2 → invite generate →
redeem → couple db created → chat written by one side → read by the
other. All round-tripped correctly. `eravos-db`'s own `npm test` (7
checks) still passes standalone.
