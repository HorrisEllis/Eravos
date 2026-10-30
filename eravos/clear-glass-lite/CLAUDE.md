# CLAUDE.md

Context for Claude (or any AI assistant) working on this repo. Read this before making changes — it exists so you don't have to rediscover decisions that were already made deliberately, and so you don't accidentally reintroduce bugs that were already found and fixed once.

## What this project actually is

A decoupled fork of a larger system called Clear Glass (part of a project called NEXUS — you don't have access to that codebase from here, and you don't need it). This fork exists specifically to be **small and standalone**: an Electron app that gives a project real login/session management for AI chat providers (Claude, ChatGPT, Gemini, Perplexity), real userscript injection, a lightweight local capture API, and a real CLI — with zero dependency on the larger NEXUS system it was extracted from.

If you find yourself wanting to add a dependency on an orchestrator, a message bus, a shared database, or anything that assumes this app isn't running standalone — stop and check with the human first. Decoupling from NEXUS was the entire point of this fork existing; re-coupling it, even partially, defeats that.

## Non-negotiable design constraints

1. **Zero requires pointing outside this directory.** Every file in this repo should be reachable and runnable with nothing but `npm install && npm start` — no sibling NEXUS directories, no environment assuming other services are running. Check this before adding any new file: does it `require()` anything outside `clear-glass-lite/`? If yes, that's a regression.

2. **`electron` is the only dependency.** Not a design preference — a deliberate constraint. Before reaching for a new npm package, check whether Node's stdlib or Electron's own APIs already cover it. `store.js`, `server.js`, `cli.js` are all zero-dependency by design, not by accident.

3. **Every file that touches disk paths must go through `paths.js`.** `main.js` runs inside Electron (`app.getPath` exists); `cli.js` runs in plain Node (it doesn't). If you add a new module that needs to know where user data lives, `require('./paths').getUserDataPath()` — don't call `app.getPath` directly, and don't hardcode a path. This is the single thing that makes the CLI work standalone; breaking it breaks the CLI silently in ways that are easy to miss in testing (it'll work fine when Electron happens to be running and mysteriously fail or write to the wrong place otherwise).

4. **"Login with X" is not OAuth, and the code/docs should never imply it is.** None of Claude, ChatGPT, or Gemini expose a public third-party OAuth flow. What this app does is open a real window to the real site in an isolated persistent session partition and let the user log in normally. If you're asked to "add real OAuth" for one of these providers, that's not currently possible against their public APIs — say so rather than building something that looks like OAuth but isn't.

5. **A broken userscript or a broken custom CLI command must degrade to "that one thing didn't run," never to "the whole app/command broke."** Every injection point and every command dispatch is wrapped in a try/catch that logs and continues. Keep it that way — this is what makes "drop a file in and it just works" safe to tell users to do.

6. **A real error (not a usage message, not user-facing CLI feedback) goes through `logger.js`'s `logError`/`logInfo`, not a bare `console.error`.** This was retrofitted once already across `main.js`, `guardian-lite/server.js`, `userscripts.js`, and `cli.js` — found via a real QA pass that server-side errors were being returned to the client but never logged anywhere. Don't reintroduce a silent one: a new error path that only prints to console and never calls `logError` is the same class of gap.

## Architecture map — what depends on what

```
paths.js  ←── used by ──  config.js, login-state.js, userscripts.js, guardian-lite/index.js, cli.js, logger.js
                            (all of these need to agree on one userData directory,
                             whether running inside Electron or from plain Node)

guardian-lite/store.js   (zero deps — copied verbatim from full Guardian's jaa-store.js)
        ↑
guardian-lite/server.js  (HTTP + SSE, wraps store.js)
        ↑
guardian-lite/index.js   (start/stop/restart lifecycle — the ONLY thing main.js and cli.js
                           should import to talk to guardian-lite; don't reach into
                           server.js directly from either of them)
        ↑                                    ↑
      main.js                             cli.js
   (boots it on app       (boots its OWN instance only if nothing
    launch, IPC bridges     answers on the configured port already —
    it to the renderer)     see ensureGuardianLite() in cli.js)

providers.js  ←── main.js (window creation), userscripts.js indirectly (URL matching),
                   renderer/app.js (rendering the button grid)

userscripts.js + gm-shim.js  ←── injected into every provider BrowserWindow by main.js,
                                   on did-finish-load and did-navigate-in-page

login-state.js  ←── main.js only — tracks account metadata (labels, timestamps),
                     NOT session data (that's Electron's session.fromPartition,
                     native, not reimplemented anywhere in this repo)

logger.js  ←── main.js, guardian-lite/server.js, userscripts.js, cli.js — every
                real error path routes through here. If you add a new module
                with a real error path (not a usage message, not user-facing
                CLI feedback — an actual failure worth persisting), route it
                through logError()/logInfo() here, not a bare console.error.
```

If you're adding a new module, ask: does it need to know the user data path? → depend on `paths.js`, not `electron` directly. Does it need to talk to the local API? → depend on `guardian-lite/index.js`'s exported `start`/`stop`/`getInstance`, or call the HTTP API like any other client (see `cli.js`'s `httpRequest` for the pattern) — don't import `server.js` directly from a new consumer.

## Known gaps — real, not hidden

- **The Electron GUI was not visually run in the environment these files were originally built in** (no display server available there) — but it HAS since been run for real, by an actual user, on Windows. That run surfaced a real bug (see "Bugs found in real use" below) within the first few commands, which is exactly why "reasoned-about-correct but unwatched" code needs to be flagged as such rather than assumed correct — this repo's history now has a concrete example of why.
- **`npm link` / global `cgl` install has not been performed** — the `bin` entry and shebang are correct by inspection, not by a completed global install test.
- **§CORS+CSP HARDENING 2026-07-24 — superseded.** This section used to say "Guardian-lite has no authentication. It binds to 127.0.0.1 only, which is the actual mitigation." That was a real, accepted gap at the time, but "binds to localhost" is not a real mitigation on a machine where other processes or web pages can also reach localhost — it was closed, not just documented around: guardian-lite now requires a real per-install token (`X-CGL-Token`, see `config.js`'s `ensureGuardianToken()` and `guardian-lite/server.js`'s `_handle()`) on every route except `GET /health`, and its CORS is a real origin allowlist (built from `providers.js`) instead of `'*'`. Separately, `csp-bridge.js` now widens each provider window's own CSP so `gm-shim.js`'s fetch-based `GM_xmlhttpRequest` can actually reach guardian-lite in the first place — before this, the provider site's own `connect-src` would likely have silently blocked the call regardless of anything guardian-lite itself sent back, and nothing in this repo's history had verified that end-to-end. See `interaction-contract.json`'s `auth`/`cors`/`csp_bridge` blocks for the real, current contract.
- **The new token is real protection against OTHER processes/pages on the machine, not against the provider page itself.** `window.__CGL_BRIDGE__` (origin + token) is injected into claude.ai/chatgpt.com/etc.'s own JS context, same trust boundary userscripts already run in — so if a provider site were compromised (XSS), it could read the token same as any userscript can already touch that page's full DOM and network. This is an honest, accepted boundary, not an oversight: this whole app already grants provider windows a fairly trusted execution context (arbitrary userscript injection), and the token's real job is closing the *much* larger hole of "any other origin on the machine, with no relationship to this app at all, could reach guardian-lite" — which it does.
- **`gm-shim.js`'s `GM_getValue`/`GM_setValue` are scoped to the calling page's own `localStorage`** — not shared across different provider windows or different accounts of the same provider (each has its own partition). This matches the original Clear Glass shim's own documented behavior, not a regression introduced here, but worth knowing if a userscript's storage seems to "disappear" — check whether it's running in the account/provider you expect.

## Bugs found in real use — fixed, and why they matter to future you

- **`require('electron')` returns a string, not the API, when not launched through the electron binary.** A real user ran `node main.js` instead of `npm start`, and hit `TypeError: Cannot read properties of undefined (reading 'handle')` at the first `ipcMain.handle(...)` call — a genuinely confusing error with no indication of the real cause (Electron's own well-known gotcha: `require('electron')` from plain Node resolves to a path string, not `{app, BrowserWindow, ipcMain, ...}`; destructuring from a string silently yields `undefined` for everything). Fixed with an explicit `typeof electron === 'string'` guard at the top of `main.js` that fails with a clear, actionable message instead of the cryptic TypeError. **If you're adding new top-level requires to `main.js`, keep this guard ABOVE them** — it needs to run before anything else assumes `electron` resolved correctly, or a future require could throw its own confusing error before this guard ever gets a chance to explain what's actually wrong.

## How this codebase likes to be worked on

This fork was built with a specific discipline, and continuing it is more valuable than any individual feature:

- **Check before you build.** Before adding something, check whether it already exists (a smaller/related version, a pattern already established elsewhere in this repo) rather than assuming it needs to be written from scratch. Several pieces of this repo are verbatim reuse of real code from the larger system it was forked from, specifically because reinventing already-correct code is wasted risk.
- **Test at the real boundary, not around it.** `guardian-lite/server.js` was tested by actually booting it and hitting it with `curl`, not by unit-testing its internal functions in isolation. `cli.js` was tested by running it as three genuinely separate OS processes, not by calling its functions directly in one process. If a change touches something process-boundary- or network-boundary-shaped, test it at that boundary.
- **When you find a bug while testing something else, fix it and say so — don't just note it and move on.** Every "found via testing" bug in this repo's history (see `userscripts.js`'s injection-success-reporting fix, for one real example) was caught because a test's *actual* output was checked against what was *expected*, not assumed to match.
- **Don't claim something works if you haven't run it.** If you can't run something (no display, no way to install a dependency, etc.), say so plainly, and say what you verified instead. This file's own "Known gaps" section above is what that looks like in practice — it's not a weakness to disclose, it's the thing that makes the rest of the claims trustworthy.

## Build order for new features

Stated directly by the project owner, applies to any new capability added to this repo: **Node.js logic first, always — verified and tested at the real boundary before anything else touches it. Then a formal interaction contract (see `interaction-contract.json`) describing what was actually built. Then the UI, built against that contract, last.** This is the order this repo's own history already followed for guardian-lite, the ledger, and the error log (backend built and tested with curl/direct calls first, THEN the IPC surface, THEN the renderer) — it's now explicit instead of just a pattern to infer from git history you don't have. Building UI against unverified backend assumptions is exactly the kind of thing that produces a working-looking button wired to nothing.

## Where to look for more detail

- `README.md` — the human-facing overview: what's here, how to run it, how to extend it (adding a provider, adding a userscript, adding a CLI command).
- `MANIFEST.json` — structured metadata: file-by-file purpose, real dependency graph, verification status per component.
- `interaction-contract.json` — the formal interaction surface (ports, HTTP routes, IPC channels, CLI commands, config keys, session model), matching the same convention `guardian/interaction-contract.json` uses in the source project. If you add a new route, IPC channel, or config key, add it here too — this file existing and being wrong is worse than it not existing at all.
- Inline comments throughout, especially anything marked `§BUILT`, `§BUG FOUND AND FIXED`, or `§KNOWN LIMITATION` — these carry the actual reasoning for non-obvious decisions, not just what the code does.
