'use strict';
/**
 * main.js — Clear Glass Lite
 *
 * §DECOUPLED FORK 2026-07-19 — see README.md for the full account of what
 * this deliberately doesn't carry over from full Clear Glass, and the
 * honest note on what "login with X" means here (no OAuth exists for
 * these providers — this opens a real window to the real site and
 * persists the session via Electron's own partition storage).
 *
 * §MULTI-ACCOUNT 2026-07-19 — "once it has cookies stored, then it splits
 * the button with an add another." One provider can now hold multiple
 * connected accounts. Each account gets its OWN partition
 * (persist:clear-glass-lite-<provider>-<accountId>) — that's the entire
 * mechanism that makes two ChatGPT logins not collide with each other;
 * Electron isolates cookies/localStorage/etc per partition natively, so
 * this file never touches cookie data directly except to CHECK whether
 * any exist yet (see _accountHasCookies), never to store or move them.
 */

const electron = require('electron');

// §BUG FOUND 2026-07-19 — a real user hit this: running `node main.js`
// directly instead of `npm start` (which runs `electron .`). When the
// `electron` npm package is required from PLAIN node — not launched
// through the actual electron binary — require('electron') returns a
// STRING (the path to the platform's electron executable), not the real
// {app, BrowserWindow, ipcMain, ...} API object. Destructuring from that
// string silently gives `undefined` for every property, and the first
// real usage (ipcMain.handle a few dozen lines down) throws a genuinely
// confusing "Cannot read properties of undefined (reading 'handle')" with
// no indication of what actually went wrong. This is Electron's own
// well-known behavior, not something clear-glass-lite can change — but
// clear-glass-lite CAN fail with an honest, actionable message instead of
// that cryptic TypeError, which is what this check does.
if (typeof electron === 'string') {
  console.error(
    '\n[clear-glass-lite] This is an Electron app — it needs to be launched by the\n' +
    'electron binary, not run as a plain Node script.\n\n' +
    '  Wrong:  node main.js\n' +
    '  Right:  npm start          (runs "electron ." — see package.json)\n' +
    '     or:  npx electron .\n\n' +
    'If you just cloned this and haven\'t run `npm install` yet, do that first —\n' +
    'it needs to finish downloading the real electron binary before either of the\n' +
    'above will work.\n'
  );
  process.exit(1);
}

const { app, BrowserWindow, ipcMain, session, shell } = electron;
const path = require('path');
const { listProviders, getProvider } = require('./providers');
const loginState = require('./login-state');
const userscripts = require('./userscripts');
const config = require('./config');
const guardianLite = require('./guardian-lite');
const { relaxCspForGuardianLite } = require('./csp-bridge');
const { logError, logInfo } = require('./logger');

let hubWindow = null;
const openWindows = new Map(); // `${providerId}:${accountId}` -> BrowserWindow

function windowKey(providerId, accountId) {
  return `${providerId}:${accountId}`;
}

// §CORS+CSP HARDENING 2026-07-24 — the one place that computes guardian-
// lite's real origin, so csp-bridge.js and userscripts.js's injected
// bridge config always agree with whatever port is actually configured
// (a user changing guardianLitePort in Options and restarting shouldn't
// leave either of those pointed at the old one).
function guardianOrigin() {
  return `http://127.0.0.1:${config.get('guardianLitePort') || 7823}`;
}

function partitionFor(providerId, accountId) {
  // 'persist:' is what makes Electron write this session to disk and
  // reload it on next launch. One partition per (provider, account) pair
  // is the entire multi-account mechanism — nothing else in this file
  // implements account isolation, Electron already does it correctly.
  return `persist:clear-glass-lite-${providerId}-${accountId}`;
}

function createHubWindow() {
  hubWindow = new BrowserWindow({
    width: 480, height: 680,
    minWidth: 380, minHeight: 480,
    title: 'Clear Glass Lite',
    backgroundColor: '#0a0a0f',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  hubWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  hubWindow.on('closed', () => { hubWindow = null; });
}

/**
 * openAccountWindow — opens (or focuses, if already open) the browser
 * window for one specific account of one provider.
 *
 * accountId === null means "start a brand new account" — this is the
 * "add another" action: mint a fresh id, which means a fresh partition,
 * which means a login page with no existing session — exactly what
 * "add another account" needs to actually offer a different login,
 * rather than reopening whichever account happens to already be signed
 * into that partition.
 */
async function openAccountWindow(providerId, accountId) {
  const provider = getProvider(providerId); // throws on unknown id — real validation
  const isNewAccount = !accountId;
  if (isNewAccount) accountId = loginState.newAccountId();

  const key = windowKey(providerId, accountId);
  const existing = openWindows.get(key);
  if (existing && !existing.isDestroyed()) {
    existing.show();
    existing.focus();
    return { accountId };
  }

  const partitionKey = partitionFor(providerId, accountId);
  const providerSession = session.fromPartition(partitionKey);

  // §CORS+CSP HARDENING 2026-07-24 — widen this session's CSP just enough
  // to let it reach guardian-lite (see csp-bridge.js for why this is
  // necessary at all — the page's OWN Content-Security-Policy, not
  // guardian-lite's CORS headers, is what blocks the GM_xmlhttpRequest
  // fetch otherwise). Only applied when guardian-lite is actually running
  // — no point loosening a CSP for an origin nothing is listening on.
  if (config.get('guardianLiteEnabled') !== false) {
    relaxCspForGuardianLite(providerSession, guardianOrigin(), partitionKey);
  }

  const win = new BrowserWindow({
    width: 1280, height: 860,
    title: provider.name,
    backgroundColor: '#0a0a0f',
    webPreferences: {
      session: providerSession,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.loadURL(provider.url);
  openWindows.set(key, win);
  win.on('closed', () => openWindows.delete(key));

  // Real signal, not an assumption: only record this account as
  // "connected" once its partition actually has a cookie for one of the
  // provider's real hosts. Checked on navigation and on load — a fresh
  // "add another" window has none of these yet, by design, until the
  // user actually logs in with the different account.
  const checkAndRecord = async () => {
    if (await _accountHasCookies(providerId, accountId)) {
      loginState.addAccount(providerId, accountId);
      hubWindow?.webContents.send('status-changed', await getStatus());
    }
  };
  win.webContents.on('did-navigate', checkAndRecord);
  win.webContents.on('did-finish-load', checkAndRecord);

  // §USERSCRIPTS 2026-07-19 — same hook points as the account-check above
  // (did-finish-load covers the initial load, did-navigate-in-page covers
  // SPA route changes within the same page, which these chat UIs do
  // constantly and did-finish-load alone would miss). injectMatching()
  // itself never throws past this call — a broken userscript degrades to
  // "that script didn't run," never to "this window stopped working."
  if (config.get('userscriptsEnabled') !== false) {
    // §CORS+CSP HARDENING 2026-07-24 — real token, not undefined: only
    // handed to scripts when guardian-lite is actually up, matching the
    // CSP relaxation above. A script checking `window.__CGL_BRIDGE__`
    // gets an honest "not running" (property absent) rather than an
    // origin that will just 401 or refuse to connect.
    const guardianBridge = config.get('guardianLiteEnabled') !== false
      ? { origin: guardianOrigin(), token: config.get('guardianLiteToken') || null }
      : null;
    const runUserscripts = () => userscripts.injectMatching(win.webContents, win.webContents.getURL(), guardianBridge).catch(() => {});
    win.webContents.on('did-finish-load', runUserscripts);
    win.webContents.on('did-navigate-in-page', runUserscripts);
  }

  return { accountId };
}

async function _accountHasCookies(providerId, accountId) {
  const provider = getProvider(providerId);
  const ses = session.fromPartition(partitionFor(providerId, accountId));
  for (const host of provider.hosts) {
    const cookies = await ses.cookies.get({ domain: host });
    if (cookies.length > 0) return true;
  }
  return false;
}

async function getStatus() {
  const enabled = config.get('enabledProviders') || {};
  const results = [];
  for (const provider of listProviders()) {
    if (enabled[provider.id] === false) continue; // hidden by config, not deleted — just not shown
    const accounts = loginState.getAccounts(provider.id);
    // Re-verify each recorded account still actually has cookies (a user
    // clearing browser data outside this app, or a session expiring,
    // shouldn't leave a "connected" badge lying about a dead session).
    const verified = [];
    for (const account of accounts) {
      const hasCookies = await _accountHasCookies(provider.id, account.id);
      if (hasCookies) verified.push(account);
      else loginState.removeAccount(provider.id, account.id); // stale — real cleanup, not a leftover ghost entry
    }
    results.push({ ...provider, accounts: verified });
  }
  return results;
}

async function logoutAccount(providerId, accountId) {
  getProvider(providerId); // validate, throws on unknown id
  const key = windowKey(providerId, accountId);
  const existing = openWindows.get(key);
  if (existing && !existing.isDestroyed()) existing.close();

  const ses = session.fromPartition(partitionFor(providerId, accountId));
  await ses.clearStorageData(); // real logout — clears this ONE account's partition only, every other account (same or different provider) is untouched
  loginState.removeAccount(providerId, accountId);
  hubWindow?.webContents.send('status-changed', await getStatus());
}

async function renameAccount(providerId, accountId, label) {
  loginState.renameAccount(providerId, accountId, label);
  hubWindow?.webContents.send('status-changed', await getStatus());
}

// ── IPC — the only surface the renderer can reach, all through preload.js's
//    contextBridge, never direct Node/Electron access from the page ────────
ipcMain.handle('cgl:get-status', () => getStatus());
ipcMain.handle('cgl:open-account', (_evt, providerId, accountId) => openAccountWindow(providerId, accountId));
ipcMain.handle('cgl:logout', (_evt, providerId, accountId) => logoutAccount(providerId, accountId));
ipcMain.handle('cgl:rename', (_evt, providerId, accountId, label) => renameAccount(providerId, accountId, label));
ipcMain.handle('cgl:open-external', (_evt, url) => shell.openExternal(url));
ipcMain.handle('cgl:open-scripts-folder', () => shell.openPath(userscripts.ensureScriptsDir()));
ipcMain.handle('cgl:open-log', () => shell.openPath(require('./logger').LOG_FILE));
ipcMain.handle('cgl:get-log', (_evt, n) => require('./logger').readLog(n || 100));
ipcMain.handle('cgl:clear-log', () => require('./logger').clearLog());
ipcMain.handle('cgl:list-scripts', () => userscripts.loadScripts().map(s => ({ id: s.id, name: s.name, enabled: s.enabled, matches: s.matches })));

// ── Options — real config, backing the Options panel in the renderer ────────
ipcMain.handle('cgl:get-config', () => config.load());
ipcMain.handle('cgl:set-config', (_evt, key, value) => config.set(key, value));
ipcMain.handle('cgl:reset-config', () => config.reset());
ipcMain.handle('cgl:guardian-status', async () => {
  const inst = guardianLite.getInstance();
  return { running: !!inst, port: config.get('guardianLitePort') };
});

// ── Ledger — real read access to guardian-lite's store for the UI ──────────
// Goes straight to the live store instance rather than round-tripping
// through guardian-lite's own HTTP API — main.js already holds the real
// reference (guardianLite.getInstance()), and there's no reason to make
// the renderer's own request leave the process just to come back to the
// same data. The HTTP API stays the one true interface for anything
// OUTSIDE this process (userscripts, the CLI, another tool) — this is
// purely an internal shortcut, not a second source of truth.
ipcMain.handle('cgl:ledger-query', (_evt, table, limit) => {
  const inst = guardianLite.getInstance();
  if (!inst) return { ok: false, error: 'guardian-lite is not running' };
  try {
    const rows = inst.store.all(table || 'artifacts').slice(-(limit || 100)).reverse(); // newest first — a ledger reads back-to-front
    return { ok: true, table: table || 'artifacts', rows };
  } catch (e) {
    logError('main', e);
    return { ok: false, error: e.message };
  }
});
ipcMain.handle('cgl:ledger-tables', () => {
  const inst = guardianLite.getInstance();
  if (!inst) return [];
  return [...inst.store._tables.keys()].filter(t => t !== 'settings'); // settings isn't ledger content, it's the store's own bootstrap table
});
ipcMain.handle('cgl:ledger-delete', (_evt, table, id) => {
  const inst = guardianLite.getInstance();
  if (!inst) return { ok: false, error: 'guardian-lite is not running' };
  const count = inst.store.delete(table, { id });
  return { ok: count > 0, deleted: count };
});

ipcMain.handle('cgl:restart-guardian', async () => {
  await guardianLite.stop();
  if (config.get('guardianLiteEnabled') === false) return { running: false };
  try {
    await guardianLite.start(config.load());
    return { running: true, port: config.get('guardianLitePort') };
  } catch (e) {
    logError('guardian-lite', e);
    return { running: false, error: e.message };
  }
});

app.whenReady().then(async () => {
  // §BUG FOUND AND FIXED 2026-07-19 — config.load()/get() never had a
  // side effect, so no config.json ever existed until a user opened
  // Options and clicked Save at least once. Real user report: "i dont
  // see any configs." Fixed at the source (config.js's ensureConfigFile),
  // called here first, before anything else touches config.
  const createdConfig = config.ensureConfigFile();
  if (createdConfig) logInfo('main', `created default config.json at ${config.CONFIG_FILE}`);

  // §CORS+CSP HARDENING 2026-07-24 — mint the real auth token before
  // guardian-lite ever starts listening, so its very first boot is
  // already the hardened state, not "unauth'd until the next restart."
  const mintedToken = !config.get('guardianLiteToken');
  config.ensureGuardianToken();
  if (mintedToken) logInfo('main', 'generated a new guardian-lite auth token');

  if (config.get('guardianLiteEnabled') !== false) {
    try {
      await guardianLite.start(config.load());
      logInfo('guardian-lite', `running on port ${config.get('guardianLitePort')}`);
    } catch (e) {
      // Real, visible failure — not swallowed. Most likely cause: the
      // configured port is already taken (another instance, or something
      // else on this machine). The app still opens either way; only the
      // local capture/query API is unavailable until the port frees up
      // or the user changes it in Options.
      logError('guardian-lite', e);
    }
  }
  createHubWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createHubWindow(); });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', async () => {
  await guardianLite.stop();
});
