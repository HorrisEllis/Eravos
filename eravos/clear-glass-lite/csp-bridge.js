'use strict';
/**
 * csp-bridge.js — the real fix for provider windows' own Content-Security-
 * Policy blocking calls to guardian-lite.
 *
 * §CORS+CSP HARDENING 2026-07-24 — "cors and security policy in clear-
 * glass. account for that with the userscript for eravos and clearglass."
 *
 * THE ACTUAL BUG THIS CLOSES: gm-shim.js's GM_xmlhttpRequest is a plain
 * `fetch()` running INSIDE the provider page's own JS context
 * (userscripts.js injects it via webContents.executeJavaScript — main
 * world, not an isolated one). That means it's bound by whatever
 * Content-Security-Policy header claude.ai / chatgpt.com / gemini.
 * google.com / perplexity.ai themselves send back. If that page's CSP has
 * a `connect-src` directive (most production chat UIs do, scoped to their
 * own API domains), a fetch to http://127.0.0.1:<guardian port> is a CSP
 * violation the BROWSER blocks before guardian-lite's own CORS headers
 * ever come into play — no error surfaces in guardian-lite's log, because
 * the request never left the renderer. Fixing guardian-lite's CORS
 * headers alone (see guardian-lite/server.js) does nothing for this half
 * of the problem; this file is the other half.
 *
 * THE FIX: intercept each provider session's response headers
 * (session.webRequest.onHeadersReceived) and widen ONLY the connect-src
 * directive to also allow the guardian-lite origin — not strip CSP
 * entirely, which would throw away real protection these sites have
 * against XSS/injection on their own pages. If a response has no explicit
 * connect-src, CSP's own fallback rule means connect requests are
 * governed by default-src instead — so a naive "just add a bare
 * connect-src http://127.0.0.1:PORT" would actually make things stricter
 * (introducing a connect-src directive that shadows default-src and only
 * allows guardian-lite), breaking the site's own real API calls. So: copy
 * default-src's sources forward explicitly, then append the guardian
 * origin, only when no connect-src already exists.
 *
 * Scope: applied per-session, only to the sessions main.js actually opens
 * for provider windows (each provider+account's own partition) — never to
 * the hub window's session, which doesn't need it and doesn't call
 * guardian-lite via fetch (it goes through IPC — see main.js's
 * cgl:ledger-* handlers).
 */

const { logError } = require('./logger');

// Sessions we've already hooked, keyed by partition name — Electron only
// keeps ONE onHeadersReceived listener per session (a second call replaces
// the first, it doesn't stack), so this Set exists purely to skip
// redundant work when the same account's window is reopened, not to avoid
// a real bug from double-registration.
const _hookedPartitions = new Set();

function _splitDirectives(cspValue) {
  return cspValue.split(';').map((d) => d.trim()).filter(Boolean);
}

function _addConnectSrc(cspValue, guardianOrigin) {
  const directives = _splitDirectives(cspValue);
  let sawConnectSrc = false;

  const updated = directives.map((directive) => {
    const parts = directive.split(/\s+/);
    const name = parts[0].toLowerCase();
    if (name !== 'connect-src') return directive;
    sawConnectSrc = true;
    if (parts.includes(guardianOrigin)) return directive; // already present, e.g. re-applied on a later response
    return `${parts[0]} ${parts.slice(1).join(' ')} ${guardianOrigin}`.trim();
  });

  if (!sawConnectSrc) {
    // No explicit connect-src — carry default-src's sources forward
    // explicitly instead of leaving them implicit, so adding this
    // directive can't accidentally narrow what the page could already do.
    const defaultSrc = directives.find((d) => d.toLowerCase().startsWith('default-src'));
    const base = defaultSrc ? defaultSrc.split(/\s+/).slice(1) : [`'self'`];
    updated.push(`connect-src ${base.join(' ')} ${guardianOrigin}`);
  }

  return updated.join('; ');
}

function _patchResponseHeaders(responseHeaders, guardianOrigin) {
  const out = {};
  for (const [key, values] of Object.entries(responseHeaders || {})) {
    if (/^content-security-policy(-report-only)?$/i.test(key)) {
      out[key] = (Array.isArray(values) ? values : [values]).map((v) => _addConnectSrc(v, guardianOrigin));
    } else {
      out[key] = values;
    }
  }
  return out;
}

/**
 * relaxCspForGuardianLite(ses, guardianOrigin) — call once per provider
 * session (see main.js's openAccountWindow), before or right after the
 * window's first loadURL. No-op, safely, if called again for a session
 * that's already hooked with the same origin — a fresh call with a
 * DIFFERENT origin (e.g. the user changed guardianLitePort in Options and
 * restarted) still needs to run again, since the port is baked into the
 * closure; main.js is responsible for calling this again after a
 * guardian-lite restart if the port actually changed.
 */
function relaxCspForGuardianLite(ses, guardianOrigin, partitionKey) {
  if (partitionKey && _hookedPartitions.has(`${partitionKey}::${guardianOrigin}`)) return;

  ses.webRequest.onHeadersReceived((details, callback) => {
    try {
      callback({ responseHeaders: _patchResponseHeaders(details.responseHeaders, guardianOrigin) });
    } catch (e) {
      // Fail OPEN to "unmodified headers," not "response never resolves."
      // A broken patch here should degrade to "guardian-lite calls from
      // this page still get CSP-blocked, same as before this fix existed,"
      // never to "this provider window stops loading."
      logError('csp-bridge', e);
      callback({ responseHeaders: details.responseHeaders });
    }
  });

  if (partitionKey) _hookedPartitions.add(`${partitionKey}::${guardianOrigin}`);
}

module.exports = { relaxCspForGuardianLite, _addConnectSrc };
