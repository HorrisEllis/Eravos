'use strict';
/**
 * userscripts.js — loads and injects Greasemonkey/Tampermonkey-style
 * userscripts into the AI provider windows.
 *
 * §BUILT 2026-07-19 — "add this to my projects to run the userscripts,
 * for ai-assistance." Rebuilt from clear-glass/src/userscripts/manager.js
 * (UserscriptManager), not copied wholesale — that class's real injection
 * path goes through `this.driver.exec(...)` (a multi-agent automation
 * abstraction this fork has no use for — there's one BrowserWindow per
 * account here, not a fleet a driver routes between) and reports through
 * `this.sse` (NEXUS's event bus). Neither exists here. What DOES transfer
 * directly, unchanged: the metadata parsing (`// ==UserScript== / @match /
 * ==/UserScript==`, real Greasemonkey format, so scripts are portable
 * between the real extension ecosystem, full Clear Glass, and this fork)
 * and the URL-matching glob logic. Injection itself uses the same
 * mechanism full Clear Glass's own BrowserWindow already uses for its
 * spoof-script injection (webContents.executeJavaScript on
 * did-finish-load/did-navigate-in-page) — simpler than driver.exec(),
 * equally real.
 *
 * §GUARDIAN SCRIPTS — full Clear Glass's userscript-claude.js etc (the
 * ones that talk to Guardian's NCP over SSE at 127.0.0.1:7820) will LOAD
 * and RUN here if you copy them into the scripts folder — the metadata
 * format and injection mechanism are the same. But their GM_xmlhttpRequest
 * calls to guardian/cortex will only get real responses if something is
 * actually listening on those ports — this fork doesn't start guardian or
 * cortex, on purpose (that's the NEXUS half being decoupled). The DOM-
 * facing parts of those scripts still run either way; the parts that need
 * a live NEXUS backend need one actually running somewhere.
 */

const fs   = require('fs');
const path = require('path');
const { getUserDataPath } = require('./paths');
const { logError } = require('./logger');

const SCRIPTS_DIR = path.join(getUserDataPath(), 'userscripts');

const STARTER_SCRIPT = `// ==UserScript==
// @name        Example — Copy Reply as Markdown
// @match       *
// @enabled     true
// ==/UserScript==

// A real, working example — adds a small floating button that copies the
// page's visible text as-is to the clipboard. Delete this file, or edit it
// in place, once you've got your own scripts going; it's just here so
// there's one real thing to point at on first run, not a placeholder.
(function () {
  const btn = document.createElement('button');
  btn.textContent = '📋 Copy page text';
  btn.style.cssText = 'position:fixed;bottom:16px;right:16px;z-index:999999;' +
    'padding:8px 12px;border-radius:8px;border:none;background:#5eead4;' +
    'color:#0a0a0f;font-weight:600;font-size:12px;cursor:pointer;opacity:0.85;';
  btn.onmouseenter = () => btn.style.opacity = '1';
  btn.onmouseleave = () => btn.style.opacity = '0.85';
  btn.onclick = () => {
    navigator.clipboard.writeText(document.body.innerText).catch(() => {});
    btn.textContent = '✓ Copied';
    setTimeout(() => { btn.textContent = '📋 Copy page text'; }, 1200);
  };
  document.body.appendChild(btn);
})();
`;

function ensureScriptsDir() {
  if (!fs.existsSync(SCRIPTS_DIR)) {
    fs.mkdirSync(SCRIPTS_DIR, { recursive: true });
    // Seed one real, working example on first run — not a stub, an
    // actual script that does something when you click it.
    fs.writeFileSync(path.join(SCRIPTS_DIR, 'example-copy-as-markdown.js'), STARTER_SCRIPT, 'utf8');
  }
  return SCRIPTS_DIR;
}

function _parseMeta(source) {
  const meta = {};
  const block = source.match(/\/\/ ==UserScript==([\s\S]*?)\/\/ ==\/UserScript==/);
  if (!block) return meta;
  for (const line of block[1].split('\n')) {
    const m = line.match(/\/\/\s+@(\w+)\s+(.+)/);
    if (m) meta[m[1]] = m[2].trim();
  }
  return meta;
}

function loadScripts() {
  ensureScriptsDir();
  const scripts = [];
  let files = [];
  try { files = fs.readdirSync(SCRIPTS_DIR).filter(f => f.endsWith('.js')); }
  catch (e) { logError('userscripts', e); return scripts; }

  for (const file of files) {
    try {
      const source = fs.readFileSync(path.join(SCRIPTS_DIR, file), 'utf8');
      const meta = _parseMeta(source);
      scripts.push({
        id: file.replace(/\.js$/, ''),
        name: meta.name || file,
        source,
        enabled: meta.enabled !== 'false',
        matches: meta.match ? [meta.match] : (meta.matches ? meta.matches.split(',').map(s => s.trim()) : ['*']),
      });
    } catch (e) {
      logError('userscripts', `failed to load ${file}: ${e.message}`);
    }
  }
  return scripts;
}

function _matchesUrl(patterns, url) {
  if (!url) return false;
  return patterns.some(p => {
    if (p === '*') return true;
    const re = new RegExp('^' + p.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
    return re.test(url);
  });
}

function _buildInjectable(script) {
  const safeId = script.id.replace(/[^a-zA-Z0-9_]/g, '_');
  return `(function(){
  if (window.__cglScript_${safeId}) return; // idempotency guard — never runs twice in one page session
  window.__cglScript_${safeId} = Date.now();
  ${script.source}
})();`;
}

/**
 * injectMatching(webContents, url) — runs the GM shim, then every
 * enabled, URL-matching userscript, against a real webContents. Errors
 * from one script don't block the others — a broken userscript degrades
 * to "that one script didn't run," not "nothing on this page works."
 */
async function injectMatching(webContents, url, guardianBridge) {
  const { buildGmShim } = require('./gm-shim');

  // §CORS+CSP HARDENING 2026-07-24 — injected BEFORE the GM shim so any
  // userscript's top-level code can read window.__CGL_BRIDGE__
  // immediately, same load order as the shim itself. Carries the real
  // guardian-lite origin and auth token so scripts (eravos-ai-bridge.
  // user.js included) don't have to hardcode 'http://127.0.0.1:7823' with
  // no token, which is exactly the un-auth'd, wrong-port-if-changed state
  // this fix moves away from. Omitted entirely (not set to null/undefined
  // — just never injected) when guardian-lite isn't running, so a
  // userscript checking `if (window.__CGL_BRIDGE__)` gets a real signal
  // rather than a half-populated object.
  if (guardianBridge && guardianBridge.origin) {
    try {
      await webContents.executeJavaScript(
        `window.__CGL_BRIDGE__ = ${JSON.stringify({ origin: guardianBridge.origin, token: guardianBridge.token || null })};`
      );
    } catch (e) {
      logError('userscripts', `guardian-lite bridge config injection failed: ${e.message}`);
      // Not fatal — scripts hardcoding the old bare localhost URL still
      // run, they just won't have a token to send (see server.js: a
      // request with no token is only accepted if guardian-lite itself
      // has none configured).
    }
  }

  try {
    await webContents.executeJavaScript(buildGmShim());
  } catch (e) {
    logError('userscripts', `GM shim injection failed: ${e.message}`);
    return; // if the shim itself fails, scripts calling GM_* would fail anyway — don't inject them into a broken page state
  }

  const scripts = loadScripts().filter(s => s.enabled && _matchesUrl(s.matches, url));
  const succeeded = [];
  for (const script of scripts) {
    try {
      await webContents.executeJavaScript(_buildInjectable(script));
      succeeded.push(script.name);
    } catch (e) {
      logError('userscripts', `"${script.name}" failed to inject: ${e.message}`);
    }
  }
  return succeeded;
}

module.exports = { loadScripts, injectMatching, ensureScriptsDir, SCRIPTS_DIR };
