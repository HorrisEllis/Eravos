'use strict';
/**
 * gm-shim.js — Tampermonkey GM_* API shim
 *
 * §REUSED VERBATIM 2026-07-19 — copied from clear-glass/src/providers/
 * gm-shim.js, unchanged. Already had zero NEXUS dependencies (just
 * fetch() and localStorage) — nothing to decouple, it was already
 * portable. See the original file's own header for the real caveat worth
 * repeating here: GM_getValue/GM_setValue are backed by localStorage,
 * scoped to the webview's own session partition — not shared across tabs
 * the way real Tampermonkey storage is. For one-window-per-account (which
 * is what this fork does — see main.js's partitionFor()) that distinction
 * doesn't matter, same reasoning as the original.
 *
 * Most real-world Tampermonkey/Greasemonkey userscripts you'd drop into
 * userscripts/ only need these three calls to run — this shim exists so
 * scripts written for the real extension ecosystem work here too, not
 * just scripts custom-written for this app.
 */

function buildGmShim() {
  return `
(function() {
  if (window.GM_xmlhttpRequest) return; // already shimmed (re-injection guard)

  window.GM_xmlhttpRequest = function(opts) {
    const controller = new AbortController();
    let timedOut = false;
    const t = opts.timeout ? setTimeout(() => { timedOut = true; controller.abort(); }, opts.timeout) : null;

    fetch(opts.url, {
      method:  opts.method || 'GET',
      headers: opts.headers || {},
      body:    opts.data,
      signal:  controller.signal,
    }).then(async (res) => {
      if (t) clearTimeout(t);
      const responseText = await res.text();
      opts.onload && opts.onload({
        status: res.status,
        statusText: res.statusText,
        responseText,
        response: responseText,
        finalUrl: res.url,
      });
    }).catch((err) => {
      if (t) clearTimeout(t);
      if (timedOut) { opts.ontimeout && opts.ontimeout(); return; }
      opts.onerror && opts.onerror(err);
    });

    return { abort: () => controller.abort() };
  };

  window.GM_getValue = function(key, defaultValue) {
    try {
      const raw = localStorage.getItem('__gm_' + key);
      if (raw === null) return defaultValue;
      return JSON.parse(raw);
    } catch (e) { return defaultValue; }
  };

  window.GM_setValue = function(key, value) {
    try { localStorage.setItem('__gm_' + key, JSON.stringify(value)); }
    catch (e) {}
  };
})();
`;
}

module.exports = { buildGmShim };
