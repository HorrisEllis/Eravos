'use strict';
/**
 * config.js — the one place app-wide settings live, and the backing store
 * for the Options panel in the renderer.
 *
 * §BUILT 2026-07-19 — "config to bake into the options." Real schema below
 * isn't exhaustive on purpose — "completely capable of whatever a project
 * demands" means arbitrary custom keys are allowed through untouched
 * (see set()) rather than rejected for not being in DEFAULTS. The DEFAULTS
 * object documents what THIS app reads; it doesn't gate what you can store.
 */
const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');
const { getUserDataPath } = require('./paths');

const CONFIG_FILE = path.join(getUserDataPath(), 'config.json');

const DEFAULTS = {
  guardianLiteEnabled: true,
  guardianLitePort: 7823,
  // §GUARDIAN OPTIONS 2026-07-19 — "some configs and options for
  // guardian." 0 = unlimited, matches the original unbounded behavior —
  // a real number caps each table's row count, oldest rows trimmed first,
  // enforced in guardian-lite/server.js after every insert.
  guardianLiteRetentionLimit: 0,
  // §CORS+CSP HARDENING 2026-07-24 — guardian-lite's wildcard CORS
  // ('Access-Control-Allow-Origin: *') plus zero auth meant ANY page in
  // ANY browser tab (not just the provider windows this app opens) could
  // read/write/delete the local ledger just by knowing it listens on
  // 127.0.0.1:7823 — a real, exploitable gap (the classic "localhost dev
  // server + open CORS" CSRF-from-the-web pattern), not theoretical. This
  // token is the real server-side control; CORS origin-locking (see
  // server.js) is a second, browser-side layer on top of it, not a
  // replacement — curl doesn't respect CORS. `null` here means "not
  // generated yet"; ensureGuardianToken() (below) mints a real one on
  // first boot and persists it, same pattern as ensureConfigFile().
  guardianLiteToken: null,
  // §CORS+CSP HARDENING 2026-07-24 (Eravos gap), superseded in part by
  // §DYNAMIC ORIGIN 2026-07-25 — this list is now only the FALLBACK used
  // when guardianLiteToken is unset (a degraded, non-default state).
  // With a real token — every fresh install has one, minted by
  // ensureGuardianToken() at boot — guardian-lite/server.js allows any
  // origin through and lets the token be the actual decision, so Eravos
  // can be hosted anywhere (a dev server, rheon.world/Eravos,
  // anonymousservers.info, or a future domain not listed here) without
  // ever needing this list updated again. Kept anyway as defense-in-depth
  // for the no-token case, listing every origin actually in use as of
  // this writing.
  guardianLiteExtraAllowedOrigins: [
    'http://localhost:8080', 'http://127.0.0.1:8080',
    'https://rheon.world', 'https://anonymousservers.info',
  ],
  userscriptsEnabled: true,
  // Per-provider on/off — a project that only cares about Claude and
  // ChatGPT shouldn't have to see Gemini/Perplexity rows in the hub.
  enabledProviders: { claude: true, chatgpt: true, gemini: true, perplexity: true },
};

function load() {
  let saved = {};
  try { saved = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')); }
  catch (_) { /* first run, or unreadable — defaults only, not an error */ }
  return { ...DEFAULTS, ...saved };
}

function save(config) {
  try {
    fs.mkdirSync(path.dirname(CONFIG_FILE), { recursive: true });
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8');
    return true;
  } catch (e) {
    console.error('[config] save failed:', e.message);
    return false;
  }
}

function get(key) {
  const config = load();
  return key ? config[key] : config;
}

/**
 * ensureConfigFile() — writes real defaults to disk if no config.json
 * exists yet. §BUG FOUND 2026-07-19 — load() never had a side effect (by
 * design, kept below), which meant NO config.json ever existed until a
 * user opened Options and clicked Save at least once — a real user
 * looking for their config file before ever touching Options would
 * genuinely find nothing there. Called once at boot (main.js and cli.js
 * both call this, not just main.js — a CLI-only user should get the same
 * real file). Idempotent and safe to call every boot: does nothing if a
 * file already exists, never overwrites real saved settings.
 */
function ensureConfigFile() {
  try {
    fs.readFileSync(CONFIG_FILE, 'utf8');
    return false; // already exists — untouched
  } catch (_) {
    save({ ...DEFAULTS });
    return true; // just created it
  }
}

/**
 * ensureGuardianToken() — mints and persists a real random bridge token if
 * one doesn't exist yet (fresh install, or an existing config.json from
 * before this token existed). Idempotent: does nothing once a token is
 * already saved, never rotates one silently out from under a working
 * setup. Kept separate from ensureConfigFile() (which only writes when
 * NO file exists at all) so a pre-existing config.json missing just this
 * one key still gets migrated forward, same reasoning as the account
 * migration in login-state.js.
 */
function ensureGuardianToken() {
  const current = get('guardianLiteToken');
  if (current) return current;
  const token = crypto.randomBytes(24).toString('hex'); // 192 bits — plenty for a local shared secret, not a password a human ever types
  set('guardianLiteToken', token);
  return token;
}

/**
 * set(key, value) — merges one key into the saved config and persists.
 * Deliberately doesn't validate `key` against DEFAULTS — a userscript or
 * a custom CLI command may legitimately want to stash its own config
 * under a namespaced key (e.g. "myProject.apiKey") without this file
 * needing to know about every possible project in advance.
 */
function set(key, value) {
  const config = load();
  config[key] = value;
  save(config);
  return config;
}

function reset() {
  save({ ...DEFAULTS });
  return { ...DEFAULTS };
}

module.exports = { DEFAULTS, load, save, get, set, reset, ensureConfigFile, ensureGuardianToken, CONFIG_FILE };
