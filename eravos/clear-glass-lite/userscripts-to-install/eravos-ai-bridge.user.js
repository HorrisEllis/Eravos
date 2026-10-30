// ==UserScript==
// @name        Eravos AI Bridge
// @matches     https://claude.ai/*,https://chatgpt.com/*,https://chat.openai.com/*,https://gemini.google.com/*,https://www.perplexity.ai/*,https://perplexity.ai/*
// @enabled     true
// ==/UserScript==

// ═══════════════════════════════════════════════════════════════════
// ERAVOS AI BRIDGE — response-producing half of contracts/ai-bridge
// .contract.json (in the Eravos repo). Polls guardian-lite for pending
// requests, drives WHICHEVER real, signed-in provider tab is open in
// clear-glass-lite to answer them, relays the answer back.
//
// §MULTI-PROVIDER 2026-07-24 — was @match'd to https://claude.ai/* only,
// which meant this silently never ran (and every AiBridge.request()
// timed out at 90s with no useful error) for anyone whose
// enabledProviders in clear-glass-lite's config.json didn't include
// claude — real user hit this: config had chatgpt:true, claude:false, so
// no claude.ai window ever existed for this script to run in at all.
// Broadened to every provider in clear-glass-lite's own providers.js, so
// it runs regardless of which one is actually connected. NOTE this
// loader's own userscripts.js parser only keeps the LAST @match line if
// you write several (real, confirmed behavior — see _parseMeta in
// userscripts.js) — @matches (plural), one line, comma-separated is the
// only way this specific loader supports multiple patterns. Don't
// "fix" this back to multiple @match lines; it'll silently regress to
// matching only the last provider listed.
//
// HONEST GAP, READ THIS FIRST: the DOM selectors below were written
// from general knowledge of claude.ai's UI structure specifically, not
// verified against the live, current site, and CERTAINLY not verified
// against ChatGPT/Gemini/Perplexity's own DOM. The fallback candidates
// (generic `div[contenteditable="true"]`, `textarea`, `button[aria-
// label*="Send" i]`) are common enough patterns that they may well work
// on the other providers too, but that's an educated guess, not a
// verified claim — if requests time out specifically on a non-Claude
// provider, open DevTools on that real provider tab first and check
// whether findComposer()/findSendButton() below are actually finding the
// right elements before assuming something else is wrong. Every selector
// attempt below is wrapped so one wrong guess logs clearly instead of
// failing silently (§1.2, carried over from Eravos's own house rules
// since this script exists to serve that project).
// ═══════════════════════════════════════════════════════════════════

(function () {
  'use strict';

  // §CORS+CSP HARDENING 2026-07-24 — used to be a hardcoded
  // 'http://127.0.0.1:7823' with no auth token, which only ever worked
  // by accident: (1) it silently broke if guardianLitePort was ever
  // changed in Options, and (2) guardian-lite's old wildcard CORS meant
  // this script's calls were indistinguishable, server-side, from any
  // other page on the machine's calls — no real proof they came from a
  // trusted provider window. window.__CGL_BRIDGE__ is injected by
  // userscripts.js (clear-glass-lite's own code, not this script) right
  // before the GM shim, on every page load — it carries the CURRENT
  // guardian-lite origin and the real per-install auth token, so this
  // always talks to the actual running instance and gets past the token
  // check in guardian-lite/server.js's _handle(). If it's absent,
  // guardian-lite isn't running (or userscripts.js failed to inject it —
  // logged clear-glass-lite-side either way) — fail loudly once, not by
  // silently hammering a dead/unauthenticated endpoint every 3s.
  const bridge = window.__CGL_BRIDGE__;
  if (!bridge || !bridge.origin) {
    console.error('[eravos-ai-bridge] window.__CGL_BRIDGE__ is missing — guardian-lite is likely not running, or this script was injected by an older clear-glass-lite build that doesn\'t set it. Not starting the poll loop.');
    return;
  }
  const GUARDIAN_BASE = bridge.origin;
  const GUARDIAN_TOKEN = bridge.token || null;
  const REQUEST_TABLE = 'eravos-ai-requests';
  const RESPONSE_TABLE = 'eravos-ai-responses';
  const POLL_MS = 3000;
  const SETTLE_CHECKS = 3;       // consecutive unchanged reads before we consider a reply "done streaming"
  const SETTLE_INTERVAL_MS = 1000;
  const MAX_WAIT_MS = 75000;     // give up watching a single reply after this long (Eravos's own timeout is 90s)

  const PROCESSED_KEY = 'eravos_ai_bridge_processed_ids';
  const processedIds = new Set(JSON.parse(GM_getValue(PROCESSED_KEY, '[]')));

  function markProcessed(id) {
    processedIds.add(id);
    // Cap so this doesn't grow forever across a long-running session.
    const arr = Array.from(processedIds).slice(-500);
    GM_setValue(PROCESSED_KEY, JSON.stringify(arr));
  }

  let busy = false; // one request at a time — simplest correct thing; the request table is a queue either way

  async function pollLoop() {
    if (busy) return;
    try {
      const res = await gmFetch('GET', GUARDIAN_BASE + '/query?table=' + REQUEST_TABLE + '&limit=5');
      const rows = (res && res.rows) || [];
      const next = rows.find(r => r.requestId && !processedIds.has(r.requestId));
      if (next) {
        busy = true;
        await handleRequest(next);
        busy = false;
      }
    } catch (e) {
      console.warn('[eravos-ai-bridge] poll failed:', e.message);
    }
  }

  async function handleRequest(row) {
    console.log('[eravos-ai-bridge] handling request', row.requestId);
    try {
      const composer = findComposer();
      if (!composer) {
        console.error('[eravos-ai-bridge] could not find the message composer — selector likely stale, see the header comment');
        return; // leave the request in the queue; a future poll (after a page reload / selector fix) can still pick it up
      }

      const beforeCount = countMessages();
      typeIntoComposer(composer, row.sys ? (row.sys + '\n\n' + row.user) : row.user);
      const sendBtn = findSendButton();
      if (!sendBtn) {
        console.error('[eravos-ai-bridge] could not find the send button — selector likely stale');
        return;
      }
      sendBtn.click();

      const reply = await waitForReply(beforeCount);
      if (reply == null) {
        console.warn('[eravos-ai-bridge] gave up waiting for a reply to', row.requestId);
        return; // stays in queue, will retry next poll — not marked processed
      }

      await gmFetch('POST', GUARDIAN_BASE + '/ingest', {
        table: RESPONSE_TABLE,
        requestId: row.requestId,
        text: reply,
      });
      // Only delete the request (and mark processed) once the response
      // actually made it to guardian-lite — if the ingest above threw,
      // execution never reaches here, and the request stays queued for
      // a real retry next poll instead of silently vanishing (§1.2).
      await gmFetch('DELETE', GUARDIAN_BASE + '/artifacts/' + encodeURIComponent(row.id || row.requestId) + '?table=' + REQUEST_TABLE);
      markProcessed(row.requestId);
      console.log('[eravos-ai-bridge] relayed response for', row.requestId);
    } catch (e) {
      console.error('[eravos-ai-bridge] handleRequest error:', e.message);
    }
  }

  // ── DOM interaction — the fragile part, see header comment ─────────
  function findComposer() {
    // Claude.ai's composer has historically been a contenteditable div,
    // not a <textarea>. Try the most likely selectors in order, log
    // which one (if any) actually hit.
    const candidates = [
      'div[contenteditable="true"][data-testid*="composer" i]',
      'div[contenteditable="true"][enterkeyhint="enter"]',
      'div.ProseMirror[contenteditable="true"]',
      'div[contenteditable="true"]',
      'textarea',
    ];
    for (const sel of candidates) {
      const el = document.querySelector(sel);
      if (el) return el;
    }
    return null;
  }

  function typeIntoComposer(el, text) {
    el.focus();
    if (el.tagName === 'TEXTAREA') {
      el.value = text;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      return;
    }
    // contenteditable — execCommand is deprecated but still the most
    // reliable way to get a framework-bound editor (ProseMirror etc.)
    // to recognize the change as real user input rather than a DOM
    // mutation it ignores.
    document.execCommand('selectAll', false, null);
    document.execCommand('insertText', false, text);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function findSendButton() {
    const candidates = [
      'button[aria-label*="Send" i]',
      'button[data-testid*="send" i]',
      'button[type="submit"]',
    ];
    for (const sel of candidates) {
      const el = document.querySelector(sel);
      if (el && !el.disabled) return el;
    }
    return null;
  }

  function countMessages() {
    // Best-effort: count elements that look like chat turns. Used only
    // to detect "a new message appeared", not to parse content.
    return document.querySelectorAll('[data-testid*="message" i], [class*="message" i]').length;
  }

  function latestReplyText() {
    const nodes = document.querySelectorAll('[data-testid*="message" i], [class*="message" i]');
    if (!nodes.length) return null;
    return nodes[nodes.length - 1].innerText || null;
  }

  function waitForReply(beforeCount) {
    return new Promise((resolve) => {
      const start = Date.now();
      let lastText = null;
      let stableCount = 0;
      const interval = setInterval(() => {
        if (Date.now() - start > MAX_WAIT_MS) {
          clearInterval(interval);
          resolve(null);
          return;
        }
        if (countMessages() <= beforeCount) return; // reply hasn't started appearing yet
        const text = latestReplyText();
        if (text && text === lastText) {
          stableCount++;
          if (stableCount >= SETTLE_CHECKS) {
            clearInterval(interval);
            resolve(text);
          }
        } else {
          stableCount = 0;
          lastText = text;
        }
      }, SETTLE_INTERVAL_MS);
    });
  }

  // ── guardian-lite HTTP via the GM_* shim (cross-origin from a
  // claude.ai page to a localhost server — this is exactly what
  // GM_xmlhttpRequest exists for) ───────────────────────────────────
  function gmFetch(method, url, body) {
    return new Promise((resolve, reject) => {
      // §CORS+CSP HARDENING 2026-07-24 — the token header is attached
      // here, once, rather than at each of the three call sites above —
      // one place to get right, and no call site can forget it. Built on
      // top of whatever headers the request already needed (body ?
      // Content-Type : none) rather than replacing them.
      const headers = body ? { 'Content-Type': 'application/json' } : {};
      if (GUARDIAN_TOKEN) headers['X-CGL-Token'] = GUARDIAN_TOKEN;
      GM_xmlhttpRequest({
        method,
        url,
        data: body ? JSON.stringify(body) : undefined,
        headers,
        onload: (res) => {
          if (res.status === 401) {
            // Real, distinct signal from "some other HTTP error" — a 401
            // here means either the token is stale (guardian-lite was
            // restarted with a fresh one — shouldn't happen, tokens
            // persist in config.json, but a manual edit could do it) or
            // this page loaded before userscripts.js finished injecting
            // window.__CGL_BRIDGE__. Either way, retrying with the same
            // stale token every 3s forever isn't useful — surface it
            // clearly instead.
            reject(new Error('HTTP 401 — guardian-lite rejected the auth token (see console for likely causes)'));
            return;
          }
          if (res.status < 200 || res.status >= 300) {
            reject(new Error('HTTP ' + res.status));
            return;
          }
          try { resolve(JSON.parse(res.responseText)); }
          catch (e) { resolve(res.responseText); }
        },
        onerror: (e) => reject(new Error('network error')),
      });
    });
  }

  setInterval(pollLoop, POLL_MS);
  console.log('[eravos-ai-bridge] loaded, polling', GUARDIAN_BASE + '/query?table=' + REQUEST_TABLE, 'every', POLL_MS + 'ms');
})();
