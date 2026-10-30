'use strict';
/**
 * electron-main.js — the "all in one" entry point.
 *
 * WHAT THIS ACTUALLY DOES: boots the real eravos-serve.js server
 * IN-PROCESS (require + call its exported main(), not a spawned child
 * process) inside a single Electron app, opens a real window pointed
 * at it, and adds a system tray icon so closing the window doesn't
 * kill the server -- it keeps running in the background, tray-only,
 * until you actually quit.
 *
 * Everything eravos-serve.js already does in-process comes along for
 * free, because this doesn't reimplement any of it, it just calls the
 * real thing: the app itself, the co-creation relay (consolidated
 * onto the same port since v0.15.0), Emergence's space-distance
 * signal (if the sibling folder is present), and now the SMTP client/
 * dev-catcher (see server-modules/). One process, one port, one
 * window, one tray icon.
 *
 * HONEST SCOPE NOTE: this does NOT also start clear-glass-lite or the
 * AiBridge userscript pipeline BY DEFAULT. Real, documented history:
 * a prior pass through this exact codebase (see eravos-kernel.js's
 * own comment right where the AI call chain is built) tried routing
 * Oracle through a real logged-in provider tab exactly this way, and
 * removed it -- a manual token copy-paste between two processes with
 * no shared config, and real failure surface (CSP, DOM changes,
 * session state) that the current Ollama-first approach doesn't have.
 * What's below is that same real capability, wired in as a genuine,
 * OPT-IN background option (config/options.json's own aiBridge.enabled)
 * rather than silently reintroduced as the primary path -- Ollama
 * stays first, this is what runs alongside it if you turn it on.
 */

const { app, BrowserWindow, Tray, Menu, shell } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow = null;

/* ── eravos:// (v0.28.0) ──────────────────────────────────────────────────
   The deep link, carrying the SAME payload the QR already encodes:
   eravos://pair/<code>.<peer>.<fp>.<nonce>

   NOT a magnet link. A magnet URI is a BitTorrent lookup key handed to the
   public DHT — it finds "whoever has this content" and announces the search
   to a global network. You want HER DEVICE, which the peer id already names,
   with no third party in the path. Pairing.parse() reads this shape already,
   so there is nothing new to parse (§16.5).

   Windows and Linux deliver it as an argv to a SECOND instance; macOS fires
   open-url on the first. Both are handled below. The single-instance lock is
   not optional: without it a link launches a second Eravos that fights the
   first over the port and the lock file — the exact failure eravos-serve.js
   already guards against server-side. */
let pendingPair = null;

app.setAsDefaultProtocolClient('eravos');
// Windows dev: argv[1] is the script path, so the handler must name the
// executable and the script explicitly or the link opens nothing.
if (process.defaultApp && process.argv.length >= 2) {
  app.setAsDefaultProtocolClient('eravos', process.execPath, [path.resolve(process.argv[1])]);
}

function handlePairUrl(url) {
  const payload = String(url || '').replace(/^eravos:\/\/pair\//i, '').trim();
  if (!payload) return;
  if (mainWindow && mainWindow.webContents && !mainWindow.webContents.isLoading()) {
    mainWindow.webContents.send('eravos:pair', payload);
    mainWindow.show(); mainWindow.focus();
  } else {
    pendingPair = payload;
  }
}

app.on('open-url', (e, url) => { e.preventDefault(); handlePairUrl(url); });

// autoHideMenuBar only hides the strip until Alt is pressed. This removes it.
// Nothing in it was ever defined by this app — it is Electron's stock roles
// menu, and a frameless window with a File menu that opens nothing is worse
// than no menu. macOS keeps its menu: the app menu there owns Quit and the
// standard Cmd+C/V edit roles, and a mac app with no menu bar is broken.
if (process.platform !== 'darwin') Menu.setApplicationMenu(null);

// §1.2 — the preload exposes notify(); without a listener here the call is
// silently dropped, which looks wired and is not.
const { ipcMain, Notification } = require('electron');
ipcMain.on('eravos:notify', (_e, msg) => {
  if (!Notification.isSupported()) return;
  // Suppressed when you are already looking at the app — a notification for
  // something in front of you is noise.
  if (mainWindow && mainWindow.isVisible() && mainWindow.isFocused()) return;
  new Notification({ title: (msg && msg.title) || 'Eravos', body: (msg && msg.body) || '' }).show();
});

// THE LOCK. There was none — so a second launch (or any eravos:// click on
// Windows/Linux) started a whole second Eravos, which then fought the first
// over the port, the lock file and the SQLite database. Found while adding
// the protocol handler, and it was a real bug before that: double-clicking
// the icon twice did it.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', (_e, argv) => {
    const url = argv.find(a => typeof a === 'string' && a.startsWith('eravos://'));
    if (url) handlePairUrl(url);
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show(); mainWindow.focus();
    }
  });
}
let tray = null;
let serverPort = null;
let isQuitting = false;
let aiBridgeWindow = null;
let aiBridgeEnabled = false;

function getIconPath() {
  return path.join(__dirname, 'eravos', 'icons', 'icon-192.png');
}

function loadAiBridgeConfig() {
  try {
    const raw = fs.readFileSync(path.join(__dirname, 'eravos', 'config', 'options.json'), 'utf8');
    return JSON.parse(raw).aiBridge || {};
  } catch (e) {
    return {};
  }
}

/**
 * Real, additive AI Bridge boot -- guardian-lite (the actual capture/
 * query backend) plus one background window for the configured
 * provider (Claude by default), with the same real session-partition
 * + CSP-relax + userscript-injection pipeline clear-glass-lite's own
 * main.js uses for its own provider windows -- reused directly (same
 * modules, required from the sibling clear-glass-lite/ folder this
 * app now carries), not reimplemented.
 */
async function startAiBridge() {
  const cglRoot = path.join(__dirname, 'clear-glass-lite');
  const guardianLite = require(path.join(cglRoot, 'guardian-lite'));
  const userscripts = require(path.join(cglRoot, 'userscripts.js'));
  const { relaxCspForGuardianLite } = require(path.join(cglRoot, 'csp-bridge.js'));
  const { getProvider } = require(path.join(cglRoot, 'providers.js'));
  const cglConfig = require(path.join(cglRoot, 'config.js'));
  const { session } = require('electron');

  const bridgeCfg = loadAiBridgeConfig();
  const guardianPort = bridgeCfg.guardianLitePort || 7823;

  // Real gap fixed here: guardian-lite/index.js's own start() expects
  // config.guardianLiteToken to already be populated by the caller
  // (its own comment says so directly -- "main.js and cli.js both call
  // config.ensureGuardianToken() at boot before this runs"). This
  // function never did, so guardian-lite was starting with no auth at
  // all every time -- confirmed by tracing the real code path, not
  // assumed. ensureGuardianToken() is idempotent (mints once, reuses
  // after), so calling it here is always correct.
  const guardianToken = cglConfig.ensureGuardianToken();
  await guardianLite.start({ guardianLitePort: guardianPort, guardianLiteToken: guardianToken });
  console.log('[electron-main] guardian-lite (AI Bridge backend) listening on 127.0.0.1:' + guardianPort);

  // Shares the real token with the Eravos server, running in this same
  // process (see startServer() above -- require + call, not a spawned
  // child) -- eravos-serve.js reads this dynamically per-request (see
  // its own /api/ai-bridge/config route), so setting it here, after
  // the server already started, still works: same process, same
  // mutable process.env.
  process.env.AI_BRIDGE_TOKEN = guardianToken;
  process.env.AI_BRIDGE_PORT = String(guardianPort);

  // Real, one-time seed: the AI-bridge userscript lives in clear-glass-
  // lite's own userscripts-to-install/ folder as a template; it has to
  // actually be copied into the REAL, enabled scripts folder (this
  // app's own userData/userscripts, per paths.js) to ever run --
  // exactly the same "drop a .js file in the folder" mechanism the
  // README describes, just done once automatically instead of by hand.
  try {
    userscripts.ensureScriptsDir();
    const src = path.join(cglRoot, 'userscripts-to-install', 'eravos-ai-bridge.user.js');
    const dest = path.join(userscripts.SCRIPTS_DIR, 'eravos-ai-bridge.user.js');
    if (fs.existsSync(src) && !fs.existsSync(dest)) {
      fs.copyFileSync(src, dest);
      console.log('[electron-main] seeded the AI Bridge userscript into', userscripts.SCRIPTS_DIR);
    }
  } catch (e) {
    console.error('[electron-main] could not seed the AI Bridge userscript:', e.message);
  }

  const providerId = bridgeCfg.provider || 'claude';
  const provider = getProvider(providerId);
  const partitionKey = 'persist:eravos-ai-bridge-' + providerId;
  const providerSession = session.fromPartition(partitionKey);
  relaxCspForGuardianLite(providerSession, 'http://127.0.0.1:' + guardianPort, partitionKey);

  aiBridgeWindow = new BrowserWindow({
    width: 1100, height: 780,
    title: 'Eravos AI Bridge — ' + provider.name,
    show: false, // background by design -- opened via the tray menu for the one-time real login
    webPreferences: { session: providerSession, contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  aiBridgeWindow.loadURL(provider.url);
  aiBridgeWindow.on('close', (e) => {
    if (isQuitting) return;
    e.preventDefault();
    aiBridgeWindow.hide();
  });

  const guardianBridge = { origin: 'http://127.0.0.1:' + guardianPort, token: guardianToken };
  const runUserscripts = () => userscripts.injectMatching(aiBridgeWindow.webContents, aiBridgeWindow.webContents.getURL(), guardianBridge).catch(() => {});
  aiBridgeWindow.webContents.on('did-finish-load', runUserscripts);
  aiBridgeWindow.webContents.on('did-navigate-in-page', runUserscripts);

  aiBridgeEnabled = true;
}

async function startServer() {
  const serve = require('./eravos-serve.js');
  await serve.main();
  return serve.PORT;
}

function createWindow(port) {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 480,
    minHeight: 600,
    icon: getIconPath(),
    title: 'Eravos',
    backgroundColor: '#08050a',

    // ── Borderless (v0.29.3) ─────────────────────────────────────────────
    // frame:false ALONE would take the minimise/maximise/close buttons with
    // it and leave no way to move the window — a frameless Electron app
    // owes you a titlebar, it does not get one free. titleBarStyle:'hidden'
    // plus titleBarOverlay keeps the REAL OS buttons, drawn by Windows over
    // the page, so they behave like every other window (snap layouts on
    // hover included) while the chrome above them is ours.
    //
    // titleBarOverlay is Windows/Linux only. On macOS 'hidden' gives the
    // inset traffic lights instead, which is the right look there anyway —
    // hence the platform split rather than one setting for both.
    titleBarStyle: 'hidden',
    ...(process.platform === 'darwin'
      ? { trafficLightPosition: { x: 16, y: 16 } }
      : { titleBarOverlay: { color: '#08050a', symbolColor: '#ff7a3d', height: 36 } }),

    // The File/Edit/View/Window/Help strip is Electron's DEFAULT menu, not
    // one this app ever defined — every item in it was a stock role. It has
    // no place on a login screen. Removed outright rather than hidden behind
    // Alt, so it cannot reappear on a keypress (§16.5 delete before add).
    autoHideMenuBar: true,

    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // The ONLY bridge between the page and this process. It matters more
      // here than in most Electron apps: this page renders text written by
      // another person over a network, so a renderer with Node access turns
      // a message into a way to run code on your machine.
      preload: path.join(__dirname, 'electron-preload.js'),
    },
  });

  // Maximised by default. The window is 1280x860 on a 4K panel otherwise —
  // and this app is a two-column layout (invite modal beside the daily
  // check-in), so a small window is where the overlap in the screenshots
  // came from. show:false + maximize() before the first paint avoids the
  // visible snap from small-to-large that maximize() after show() gives you.
  win.maximize();

  win.loadURL('http://localhost:' + port + '/');

  // A link that arrived before the window existed. Held rather than dropped —
  // clicking an invite while the app is starting is the COMMON case (§1.2).
  win.webContents.once('did-finish-load', () => {
    if (pendingPair) { win.webContents.send('eravos:pair', pendingPair); pendingPair = null; }
  });

  win.on('close', (e) => {
    if (isQuitting) return;
    e.preventDefault();
    win.hide();
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  return win;
}

function createTray(port) {
  const t = new Tray(getIconPath());
  t.setToolTip('Eravos — running on port ' + port);
  const items = [
    {
      label: 'Open Eravos', click: () => {
        if (mainWindow) { mainWindow.show(); mainWindow.focus(); }
      },
    },
    { type: 'separator' },
    { label: 'Running on http://localhost:' + port, enabled: false },
  ];
  if (aiBridgeEnabled) {
    items.push(
      { type: 'separator' },
      {
        label: 'AI Bridge: log in / show window', click: () => {
          if (aiBridgeWindow) { aiBridgeWindow.show(); aiBridgeWindow.focus(); }
        },
      },
      { label: 'AI Bridge is running in the background', enabled: false },
    );
  }
  items.push(
    { type: 'separator' },
    {
      label: 'Quit Eravos', click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  );
  const menu = Menu.buildFromTemplate(items);
  t.setContextMenu(menu);
  t.on('click', () => {
    if (mainWindow) { mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show(); }
  });
  return t;
}

app.whenReady().then(async () => {
  // Packaged, the sibling projects live under resourcesPath rather than
  // beside this file. Without this Emergence degrades to "not attached" on
  // every install while working perfectly in dev — the classic packaged-path
  // bug, and the worst place to discover it.
  if (app.isPackaged && process.resourcesPath) {
    const em = path.join(process.resourcesPath, 'emergence');
    if (fs.existsSync(em)) process.argv.push('--emergence-path=' + em);
  }
  try {
    serverPort = await startServer();
  } catch (e) {
    console.error('[electron-main] Eravos server failed to start:', e.message);
    const { dialog } = require('electron');
    dialog.showErrorBox('Eravos could not start', e.message +
      '\n\nCheck if another instance is already running, or run eravos-serve.js --show-config to see what it would have used.');
    app.quit();
    return;
  }

  mainWindow = createWindow(serverPort);

  // A link that LAUNCHED the app on Windows/Linux arrives in argv.
  const launchUrl = process.argv.find(a => typeof a === 'string' && a.startsWith('eravos://'));
  if (launchUrl) handlePairUrl(launchUrl);

  const bridgeCfg = loadAiBridgeConfig();
  if (bridgeCfg.enabled) {
    try {
      await startAiBridge();
    } catch (e) {
      console.error('[electron-main] AI BRIDGE DID NOT START: ' + e.message);
      console.error('[electron-main] Oracle will use Ollama / the offline fallback, unaffected.');
    }
  }

  tray = createTray(serverPort);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createWindow(serverPort);
    } else {
      mainWindow.show();
    }
  });
});

app.on('window-all-closed', () => {
  // Deliberately does NOT quit -- the tray icon is the whole point:
  // the server (and relay/Emergence/SMTP riding along with it) keeps
  // running with no window open. Real quit is the tray menu's item.
});

app.on('before-quit', () => { isQuitting = true; });
