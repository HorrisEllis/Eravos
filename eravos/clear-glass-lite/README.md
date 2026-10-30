# Clear Glass Lite

A decoupled fork of [Clear Glass](../clear-glass)'s provider-login concept, now with a lightweight local capture API and a real CLI — small enough to drop into any project.

**Also in this repo:** [`CLAUDE.md`](./CLAUDE.md) — context for AI assistants working on this code (architecture map, non-negotiable constraints, known gaps, house style). [`MANIFEST.json`](./MANIFEST.json) — structured, machine-readable metadata: every file's purpose/dependencies/verification status, the full API surface, extension points. [`interaction-contract.json`](./interaction-contract.json) — the formal interaction surface (ports, HTTP routes, IPC channels, CLI commands, config keys), matching this project's own established contract convention — every claim in it is cross-checked against the real code, not transcribed from memory.

## Contents

- [What this is](#what-this-is)
- [What this deliberately does NOT have](#what-this-deliberately-does-not-have)
- [Honest note on what "login" means here](#honest-note-on-what-login-means-here)
- [How multi-account actually works](#how-multi-account-actually-works)
- [Architecture](#architecture)
- [Files](#files)
- [Userscripts](#userscripts--real-greasemonkeytampermonkey-format-scripts-actually-run)
- [guardian-lite](#guardian-lite--the-local-capturequery-api)
- [Error log](#error-log)
- [CLI](#cli--real-and-genuinely-extensible)
- [Adding a fifth provider](#adding-a-fifth-provider)
- [Running it](#running-it)
- [Troubleshooting](#troubleshooting)
- [What's verified vs. what isn't](#whats-verified-vs-what-isnt)

## What this is

**The login hub:** buttons per provider — Claude / ChatGPT / Gemini / Perplexity. Click one, a real browser window opens to that provider's real site, you log in exactly how you normally would. The session persists — close the app, reopen it later, you're still signed in.

**Once an account is connected, the button splits.** The single "Log in with X" button becomes an account row (open / rename / sign out) plus a smaller "+ Add another account" button underneath — so you can hold multiple accounts per provider (work ChatGPT, personal ChatGPT, whatever), each fully isolated from the others and from every other provider's accounts. Signing out of one never touches any other.

**Userscripts:** real Greasemonkey/Tampermonkey-format scripts run in every provider window on every page load and SPA navigation — a GM_* shim (`GM_xmlhttpRequest`/`GM_getValue`/`GM_setValue`) injects first, then your enabled, URL-matching scripts.

**guardian-lite:** a real local HTTP+SSE server your userscripts (or anything else) can POST captures to and query back — `/ingest`, `/query`, `/artifacts/:id`, `/channel` (SSE broadcast), `/stats`. Backed by the same JaaStore engine full Guardian itself runs on, not a toy reimplementation.

**A real CLI** (`cgl` if installed globally via the `bin` entry, or `node cli.js`) — built-in commands (`status`, `ingest`, `query`, `config`, `scripts`) plus genuinely custom ones: drop a `.js` file in the commands folder, it's auto-loaded, no registration step. Works with or without the Electron app open — boots its own guardian-lite instance against the same data directory if nothing's already running, shuts it down cleanly on exit.

**Options panel** (⚙ in the hub window) — toggle guardian-lite on/off, change its port, set a retention limit (real, enforced — oldest rows trimmed automatically once a table passes the limit), toggle userscripts, show/hide individual providers, view/open/clear the error log. A real config file backs it (`config.js`), and arbitrary custom keys are allowed through untouched — your own project's settings can live there too, not just this app's.

**Ledger panel** — browse guardian-lite's actual captured history without leaving the hub window. Pick a table, see real rows (newest first), delete individual rows. Reads directly from the live store, not a stale cache.

**A real, persistent error log** — every real error path (guardian-lite, userscripts, the CLI, main process) writes to one rotating `error.log` (5MB rotation, not unbounded growth), not just the terminal. `cli.js log` to read it from the command line, or View/Open/Clear it from Options.

**16 application files, ~2600 lines total, one dependency (Electron itself)** — plus this README, `CLAUDE.md`, and `MANIFEST.json`, which aren't part of the running app.

## What this deliberately does NOT have

Everything that makes full Clear Glass a *NEXUS* browser rather than *a* browser:

| Full Clear Glass / Guardian | Clear Glass Lite |
|---|---|
| SISO bus, wire registry, orchestrator/cortex integration | none — zero requires point outside this directory |
| Guardian's NCP protocol (job dispatch, heartbeat, per-tab streaming, queue compartments) | none — see "guardian-lite" below for what real capability *is* here instead |
| Fingerprint spoofing engine (canvas/WebGL/UA noise) | none |
| Custom encrypted SQLite cookie vault, cross-agent snapshot/diff, RAID fallback routing | none — Electron's native `persist:` session partitions handle persistence; there's no second agent to fail over to here |

None of that is "the same thing, smaller." It's genuinely absent. If you need any of it, use full Clear Glass — this is for when you just want login buttons, userscripts, and a local capture API in your own app, without carrying NEXUS along for the ride.

## Honest note on what "login" means here

None of Claude, ChatGPT, or Gemini offer a public third-party OAuth flow — there's no "Login with Claude" API the way there's a "Login with Google" API. So this isn't that. What actually happens: the button opens a real window to the real site, in its own persistent session partition, and you log in the normal way (password, Google SSO, whatever that site itself offers). The app then just remembers you're signed in and can tell the hub UI so. If you were picturing an OAuth-style delegated-identity flow, that's not available from these providers to build against — this is the honest version of what's actually possible.

## How multi-account actually works

Each account gets its own Electron session partition — `persist:clear-glass-lite-<provider>-<accountId>`. That's the entire isolation mechanism; nothing here reimplements cookie storage or account switching logic. "Add another account" mints a fresh `accountId` and opens a window on a brand-new, empty partition — no existing session to carry over, so the provider's own login page shows up, letting you sign in with a different account. `getStatus()` re-verifies every recorded account actually still has cookies before showing it as connected — a session that expired or got cleared outside the app doesn't leave a stale "connected" badge behind, it quietly drops off the list.

Existing v1.0 (single-account) state files migrate automatically on first load — non-destructively, your one existing connection becomes account #1, nothing is discarded.

## Architecture

How the pieces actually connect, in the order data flows through them:

```
paths.js
  → the one place that computes "where does this app's data live." Used by
    everything else that touches disk, because main.js runs inside Electron
    (where Electron's own app.getPath exists) and cli.js runs in plain Node
    (where it doesn't) — both need to agree on the same folder.

guardian-lite/store.js  →  guardian-lite/server.js  →  guardian-lite/index.js
  (the storage engine)     (HTTP + SSE on top of it)   (start/stop/restart —
                                                          the only piece of
                                                          this that main.js
                                                          and cli.js import
                                                          directly)
        ↑                                                    ↑
      main.js  ── boots it on app launch,                 cli.js  ── boots its
                  bridges it to the renderer                        own copy only
                  over IPC                                          if nothing's
                                                                     already running
                                                                     on the
                                                                     configured port

providers.js  ── read by main.js (creates the actual browser windows),
                  userscripts.js (matches scripts to the right URLs),
                  renderer/app.js (draws the button grid)

userscripts.js + gm-shim.js  ── injected by main.js into every provider
                                 window, every page load and every in-page
                                 navigation

login-state.js  ── main.js only. Tracks account LABELS and timestamps —
                    never session data. Session data is Electron's own
                    session.fromPartition, native, not reimplemented here.

logger.js  ── used by main.js, guardian-lite/server.js, userscripts.js, and
               cli.js — every real error path writes here, one shared file,
               so "what went wrong" has one place to look regardless of
               which module hit it.
```

The short version: **`paths.js` is the seam that lets the CLI work without the GUI**, and **`guardian-lite/index.js` is the seam that lets both the GUI and the CLI share one running server without either needing to know which one actually started it.**

## Files

- `main.js` — window management, per-account session partitioning, guardian-lite lifecycle, IPC handlers
- `preload.js` — the only bridge the renderer has to Electron (contextIsolation + sandbox, no direct Node access from the page)
- `providers.js` — the provider list (reused from Clear Glass's real registry, minus NCP-specific fields)
- `login-state.js` — UI-only metadata (account labels, connected-since, last-used) — NOT where sessions live, that's Electron's own partition storage
- `userscripts.js` — loads/matches/injects userscripts from disk
- `gm-shim.js` — the GM_* API shim, reused verbatim from Clear Glass
- `config.js` — real config load/save/get/set, backs the Options panel
- `paths.js` — the one place userData path resolution lives, so Electron and the CLI agree on the same directory
- `logger.js` — one real, rotating error log, shared by every module that has a real error path
- `cli.js` — the CLI entrypoint, built-in commands, custom-command loader
- `guardian-lite/store.js` — the real JaaStore engine, copied verbatim from full Guardian
- `guardian-lite/server.js` — the HTTP+SSE server (ingest/query/channel/stats), retention-limit enforcement
- `guardian-lite/index.js` — start/stop/restart lifecycle, used by both main.js and cli.js
- `renderer/` — the actual UI: split-button/account-row rendering, scripts panel, Options panel, Ledger panel

## Userscripts — real Greasemonkey/Tampermonkey-format scripts, actually run

Every provider window runs a real userscript pipeline on every page load and every in-page navigation (these chat UIs are SPAs — did-finish-load alone would miss route changes, so both are hooked):

1. A GM_* API shim injects first (`GM_xmlhttpRequest`, `GM_getValue`, `GM_setValue`) — copied verbatim from Clear Glass's own shim, already zero-dependency (just `fetch()`/`localStorage`).
2. Every enabled script whose `@match` pattern matches the current URL injects next, wrapped in a real idempotency guard so it never double-runs on the same page.

Scripts live in a real folder on disk — click **"Open scripts folder"** in the hub window, or find it yourself at Electron's `userData` path (`~/Library/Application Support/clear-glass-lite/userscripts` on macOS, `%APPDATA%\clear-glass-lite\userscripts` on Windows, `~/.config/clear-glass-lite/userscripts` on Linux). Standard format:

```js
// ==UserScript==
// @name        My Script
// @match       https://claude.ai/*
// @enabled     true
// ==/UserScript==

// your code here
```

A real, working example (adds a "copy page text" button) gets seeded on first run, not a placeholder — delete it or edit it in place once you've got your own going.

**One honest note:** full Clear Glass's own `userscript-claude.js` / `userscript-chatgpt.js` / etc (the ones that talk to Guardian's NCP over SSE) will genuinely load and run here too — same metadata format, same injection mechanism — if you copy them into the scripts folder. But their calls back to guardian/cortex only get real responses if something is actually listening on those ports, which this fork doesn't start (that's the NEXUS half being decoupled, on purpose). The DOM-facing parts of those scripts still run regardless; the parts needing a live NEXUS backend need one actually running somewhere.

A broken userscript degrades to "that one script didn't run" (logged to the console, real error caught per-script) — never to "this window stopped working."

## guardian-lite — the local capture/query API

Boots automatically when the app starts (unless disabled in Options), on `127.0.0.1:7823` by default. Real endpoints:

```
POST   /ingest              { table?, ...fields }         → { ok, id, table }
GET    /query?table=&limit= &<field>=<value>               → { ok, table, count, rows }
DELETE /artifacts/:id?table=                                → { ok, deleted }
GET    /channel                                             → SSE stream, broadcasts every ingest live
GET    /stats                                                → real row counts per table, whatever tables you've actually used
GET    /health                                               → { ok, uptime }
```

Nothing is schema-locked beyond "give it a table name and a JSON object" — `table` defaults to `artifacts` if omitted. A userscript can call this directly with the GM_* shim already injected into every provider window:

```js
GM_xmlhttpRequest({
  method: 'POST',
  url: 'http://127.0.0.1:7823/ingest',
  data: JSON.stringify({ table: 'claude-replies', text: replyText }),
  headers: { 'Content-Type': 'application/json' },
});
```

Backed by `store.js` — copied verbatim from full Guardian's own `jaa-store.js`, not a simplified reimplementation. Same real engine, no NEXUS wrapped around it.

**Retention:** set a real row limit per table in Options (`0` = unlimited, the default). Enforced after every `/ingest` — once a table passes the limit, the oldest rows (by real timestamp, not insertion order) are trimmed automatically. Applying a new limit needs a restart (Options does this for you when you hit Save, same as a port change).

**Ledger panel** — click the ▾ under the provider list to browse guardian-lite's actual data without leaving the hub: pick a table from the dropdown, see real rows newest-first, delete individual ones. Reads live from the store on every refresh, not a cached snapshot.

## Error log

Every real error path — guardian-lite's HTTP server, userscript injection failures, CLI command failures, the main process — writes to one file: `error.log` in the app's data directory, rotated at 5MB so it never grows unbounded. Console output is unchanged (still prints exactly like before); the file is additive, not a replacement.

```
node cli.js log           # last 50 lines
node cli.js log 200       # last 200 lines
node cli.js log clear     # wipe it
```

Or from the GUI: Options → View (inline, last 100 lines) / Open file (in your OS's default text editor) / Clear.

## CLI — real, and genuinely extensible

```
node cli.js status              # guardian-lite health + table counts
node cli.js ingest '{"content":"..."}'
node cli.js query artifacts 20
node cli.js config              # show full config
node cli.js config guardianLitePort 8000
node cli.js scripts             # list loaded userscripts
node cli.js commands            # list your custom commands + where to add more
node cli.js log [n]             # last n lines of error.log (default 50)
node cli.js log clear           # wipe error.log
```

Install the `bin` entry (`npm link` or `npm install -g .`) to run it as `cgl` from anywhere. Works whether or not the Electron app is open — checks the configured port for a real `/health` response first; if nothing answers, boots its own guardian-lite instance against the same data directory for the duration of that one command, then shuts it down. A CI job or build script can use this without ever launching a window.

**Custom commands** — drop a `.js` file in the commands folder (`node cli.js commands` prints the real path) exporting:

```js
module.exports = {
  name: 'my-command',
  description: 'what it does',
  async run(args, api) {
    // api.get(path), api.post(path, body), api.del(path) — real HTTP
    // calls against guardian-lite's actual API, not a mock.
    // api.config.get(key) / api.config.set(key, value) — the same
    // config.js everything else uses.
    const result = await api.post('/ingest', { table: 'my-table', ...whatever });
    console.log('stored:', result.id);
  },
};
```

Auto-discovered, no registration step, same convention as the userscripts folder. This is the actual answer to "completely capable of whatever a project demands" — the built-in commands are a starting point, not the ceiling.

## Adding a fifth provider

Add one entry to `providers.js` — `id`, `name`, `url`, `hosts` (for the connection-check), `color`. Nothing else needs to change; the button grid, per-account session partitioning, and status checks all read from that one list.

## Running it

```
npm install
npm start
```

Wait for `npm install` to fully finish before running `npm start` — it needs to download the actual Electron binary (tens of MB), and interrupting it partway through is the single most common cause of the error below.

**Do not run `node main.js` directly.** This is an Electron app, not a plain Node script — `main.js` has to be launched *by* the Electron binary (`npm start` does this for you; it runs `electron .` under the hood). Running it with plain `node` produces a real, well-known Electron gotcha: `require('electron')` returns a *string* (the path to the electron executable) instead of the real API when not run through Electron itself, and destructuring `{ app, BrowserWindow, ... }` from a string silently gives `undefined` for everything — the first real usage then throws a confusing `TypeError: Cannot read properties of undefined`. `main.js` now detects this specific case and fails with a clear message instead — if you see that message, the fix is exactly what it says: `npm start`, not `node main.js`.

## Troubleshooting

**No `config.json` in the userData folder.** Fixed as of v2.1.1 — earlier versions never wrote a config file until Options was opened and Save clicked at least once, so a fresh install genuinely had nothing there. Now `config.ensureConfigFile()` runs at boot (both `npm start` and any `cli.js` command), writing real defaults immediately. If you're still not seeing one, confirm you're on v2.1.1+ (`node -e "console.log(require('./package.json').version)"`), and check the real path: Options → the config file lives next to `login-state.json`/`error.log` in the same userData directory (`node -e "console.log(require('./paths.js').getUserDataPath())"` prints it directly).

**`node main.js` throws `TypeError: Cannot read properties of undefined (reading 'handle')` (or similar).** You ran it with plain `node` instead of `npm start` — see "Running it" above for exactly why this happens. As of this version, `main.js` catches this specific mistake and prints a clear message instead of the cryptic TypeError; if you're on an older copy that still shows the raw TypeError, that's the same root cause.

**"Add another account" reopens the same account instead of showing a fresh login.** Check that you're actually clicking the small "+ Add another account" button, not "Open" on an existing row — "Open" is deliberately supposed to reopen the same session. If the add-another button itself is misbehaving, check `main.js`'s `openAccountWindow` — `accountId` should be `null` on that call path, which is what triggers `loginState.newAccountId()` and a fresh, cookie-less partition.

**A userscript isn't running.** Open the scripts folder (⚙ button isn't it — use the "Open scripts folder" button under the provider list) and check: does the file end in `.js`? Does its `@match` pattern actually cover the URL you're on (`https://claude.ai/*` won't match `https://claude.ai` with no trailing content in some matchers — use a real wildcard)? Check the Electron console (View → Toggle DevTools in the provider window, if you've enabled that, or the terminal you launched `npm start` from) for `[userscripts]` log lines — failures are logged with the script name and the real error, not swallowed silently.

**guardian-lite won't start / CLI says "request timed out."** Most likely another process already has the configured port. Check what's bound to it (`lsof -i :7823` on macOS/Linux, `netstat -ano | findstr :7823` on Windows), or just change the port in Options (GUI) or `node cli.js config guardianLitePort <newport>` (CLI) — both write to the same config file.

**CLI and GUI seem to have different data.** They shouldn't — both resolve the same directory via `paths.js`. If they genuinely differ, check whether something set a custom Electron `--user-data-dir` flag when launching the GUI (that would only affect the Electron-side `app.getPath` call, not the CLI's fallback) — that's the one real way these two could diverge.

**A provider stopped showing in the hub.** Check Options — it's probably toggled off there (`enabledProviders` in `config.js`), not actually broken. Provider visibility is config-driven and applies immediately without a restart.



Every file passes `node --check`. Tested directly, for real, not just read for correctness:

- `providers.js` — lookup, unknown-id rejection
- `login-state.js` — full multi-account logic (add/rename/remove, cross-provider isolation, v1.0→v2.0 migration)
- `config.js` — load/save/get/set, including arbitrary custom keys surviving a reload from disk
- `userscripts.js` — real metadata parsing, URL matching (a claude-only script correctly excluded on chatgpt.com), actual injection code generation with the idempotency guard present, and — found via testing, not assumed — a real bug where a failed script's name was reported as a success; fixed and reverified
- `guardian-lite/server.js` — booted for real, hit every endpoint with curl: `/health`, `/ingest`, `/query`, `/stats`, `/channel` (confirmed live SSE broadcast on a real ingest), `DELETE /artifacts/:id` (confirmed exactly one row removed, others untouched)
- `guardian-lite/index.js` — full start → stop → restart-on-new-port cycle, confirmed the old port actually goes dead and the new one comes up serving the same data directory
- `cli.js` — real end-to-end run across three separate process invocations (`status`, `ingest`, `query`), confirmed data persists across them; `config` get/set; a real custom command file dropped into the commands folder, auto-discovered, executed, correctly called the live API and appeared in `help`

Two things not run in this sandbox, worth a real smoke test: the actual Electron GUI (no display server here — click a button, log in, see the split happen, open Options, toggle guardian-lite) and `npm link`/global `cgl` install (the `bin` entry is correctly declared and the shebang line is present, but a real global install wasn't performed).

