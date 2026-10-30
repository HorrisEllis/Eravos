# Eravos — the whole system

```
eravos-system/
├── eravos/                 the PWA itself (static site)
├── co-creation-relay/      self-hosted WebSocket relay — replaces PeerJS/
│                           STUN/TURN entirely for the partner (Co-Creation)
│                           connection
├── clear-glass-lite/       standalone Electron app — AI provider login/
│                           session hub. Eravos does NOT depend on this
│                           anymore (see below) — kept here in case it's
│                           useful on its own, run separately if so.
├── serve-eravos.js         zero-dependency static server for eravos/
├── start-all.bat / .sh     starts the relay + Eravos, opens the browser
└── stop-all.bat / .sh      stops both
```

## Run it

**Windows:** double-click `start-all.bat`.
**Mac/Linux:** `./start-all.sh`

Starts two things — the relay and Eravos's own server — and opens the
browser. First run: the relay pins each identity automatically the first
time it connects (`relay-identities.json`, auto-created). Nothing to
configure before the first run.

`stop-all.bat` / `stop-all.sh` shuts both back down.

## How Eravos and the relay talk to each other

`eravos/shared/eravos-kernel.js`'s `RELAY_URL` auto-detects — when Eravos
is served from localhost (which `serve-eravos.js` does), it points at the
local relay (`ws://localhost:8787`) automatically. For a real deployment
(Eravos served from an actual domain, relay on a real box), set
`PROD_RELAY_URL` in that same file once — that's the only manual step
left.

## What's no longer part of this system

Eravos previously tried to route AI-assist requests through
`clear-glass-lite`/guardian-lite and a userscript running inside a real,
logged-in claude.ai/chatgpt.com tab — a self-hosted alternative to a
direct API call. Removed: it required a manual token copy-paste between
two processes with no shared config store (exactly the kind of setup
friction the co-creation relay deliberately avoided elsewhere), and the
round trip through a real browser tab added failure surface — CSP, page
structure changes, session/DOM state — that a local call to Ollama
doesn't have.

AI-assist now goes straight to Ollama (if running and connected — see
Eravos's own Console tab), with the existing graceful offline fallback if
it isn't. `clear-glass-lite` is left in this package as a standalone
project, unconnected to Eravos, in case it's useful for something else —
run it on its own if so; `start-all` no longer launches it.

## What's still a manual, one-time step

- `PROD_RELAY_URL` in `eravos/shared/eravos-kernel.js` — set once when
  the relay has a real, permanent home.
- TLS in front of `co-creation-relay`, if it's ever reachable over the
  open internet rather than localhost (prints a loud warning if you skip
  this).

Nothing else needs configuring by hand — token generation and identity
pinning are automatic, on purpose, after finding and closing the places
that weren't.
