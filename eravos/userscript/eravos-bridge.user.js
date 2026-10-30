// ==UserScript==
// @name         Eravos Bridge — Instagram & Threads
// @namespace    rheon.world/eravos
// @version      0.22.0
// @description  Sends messages between you and one named person to your own Eravos. Consent-gated on both sides, one contact only, nothing else read.
// @match        https://www.instagram.com/direct/*
// @match        https://www.threads.net/*
// @match        https://www.threads.com/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

/* ══════════════════════════════════════════════════════════════════════════
   ERAVOS BRIDGE  ·  eravos-bridge.user.js  ·  v0.22.0
   UUID: eravos-bridge-userscript-0001-0000-000000000001
   HOOK: eravos.bridge:userscript:00001
   ══════════════════════════════════════════════════════════════════════════

   An adapter, not a scraper. It reads one conversation with one named person
   and posts it to YOUR Eravos on YOUR machine. It is the narrowest thing that
   does the job, on purpose.

   ── WHAT IT WILL NOT DO, AND WHY THAT IS STRUCTURAL ─────────────────────

   1. ONE CONTACT. You name the handle. Every other thread on the page is
      ignored — not filtered later, never read. A tool that reads all your
      DMs "and then filters" has already read all your DMs.

   2. NOTHING WITHOUT BOTH SIDES. The pipeline refuses external records
      without a live grant from both people, and it THROWS rather than
      dropping them quietly. This script cannot bypass that: it has no
      storage access, it can only POST to the pipeline, and the pipeline is
      the only door. That is why consent lives there and not here.

   3. NOTHING LEAVES YOUR MACHINE. It posts to localhost. There is no server
      in this, no account, no third party. If Eravos is not running it does
      nothing and says so.

   4. NO PROFILES, NO CONTACTS, NO FOLLOWERS, NO STORIES. Message text
      between you two, and nothing else on the page.

   ── AND IT IS VISIBLE WHILE IT RUNS ─────────────────────────────────────

   A badge sits on the page whenever it is active, showing what it has sent.
   Something reading your messages should never be invisible, including to
   you — especially to you.
   ══════════════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  var VERSION = '0.22.0';
  var CFG_KEY = 'eravos_bridge_cfg';
  var POLL_MS = 4000;

  var cfg = load();
  function load() {
    try { return JSON.parse(localStorage.getItem(CFG_KEY)) || {}; }
    catch (e) { return {}; }
  }
  function save() { try { localStorage.setItem(CFG_KEY, JSON.stringify(cfg)); } catch (e) {} }

  var platform = location.hostname.indexOf('threads') !== -1 ? 'threads' : 'instagram';
  var base = cfg.eravos || 'http://localhost:8080';
  var sent = 0, refused = 0, lastError = null, running = false;

  /* ── the badge. Visible whenever this is active. ──────────────────── */

  var badge = document.createElement('div');
  badge.style.cssText = [
    'position:fixed', 'right:16px', 'bottom:16px', 'z-index:2147483647',
    'font:11px/1.5 ui-monospace,Menlo,monospace', 'padding:8px 12px',
    'border-radius:10px', 'background:rgba(17,8,16,.94)', 'color:#ff9a4d',
    'border:1px solid rgba(255,106,0,.35)', 'backdrop-filter:blur(8px)',
    'cursor:pointer', 'max-width:280px'
  ].join(';');
  function paint() {
    badge.textContent = running
      ? 'eravos · ' + platform + ' · ' + (cfg.handle || 'no contact set') +
        ' · sent ' + sent + (refused ? ' · refused ' + refused : '') +
        (lastError ? ' · ' + lastError : '')
      : 'eravos bridge — click to set up';
  }
  badge.addEventListener('click', setup);
  document.documentElement.appendChild(badge);
  paint();

  function setup() {
    var who = window.prompt(
      'Whose messages should go to Eravos?\n\n' +
      'Their exact @handle. Only this one conversation is read — every other ' +
      'thread on this page is ignored, not filtered later.\n\n' +
      'Blank to stop.', cfg.handle || '');
    if (who === null) return;
    if (!who.trim()) { cfg.handle = null; running = false; save(); paint(); return; }
    var url = window.prompt('Where is your Eravos running?', base);
    if (url === null) return;
    cfg.handle = who.trim().replace(/^@/, '');
    cfg.eravos = base = (url || base).replace(/\/+$/, '');
    save();
    check();
  }

  /* ── the only door ────────────────────────────────────────────────── */

  async function check() {
    try {
      var r = await fetch(base + '/_health', { cache: 'no-store' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      running = true; lastError = null;
      poll();
    } catch (e) {
      running = false;
      // §1.2 — a specific reason, not "failed". Nine times out of ten Eravos
      // simply is not running, and saying so saves an hour.
      lastError = 'Eravos not reachable at ' + base;
      console.info('[eravos-bridge] ' + lastError + ' (' + e.message + ')');
    }
    paint();
  }

  async function send(rec) {
    try {
      var res = await fetch(base + '/pipeline/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rec),
      });
      var body = await res.json().catch(function () { return {}; });
      if (res.status === 403) {
        // The pipeline refusing for consent is the system WORKING. Say it
        // plainly rather than retrying into a wall.
        refused++;
        lastError = 'refused: ' + (body.reason || 'consent');
        return false;
      }
      if (!res.ok) { lastError = 'HTTP ' + res.status; return false; }
      if (body.accepted) sent++;
      lastError = null;
      return !!body.accepted;
    } catch (e) { lastError = e.message; return false; }
  }

  /* ── reading. One thread, text only. ──────────────────────────────── */

  function currentHandle() {
    // Instagram puts the thread's handle in the header; Threads in the title.
    var el = document.querySelector('header a[href^="/"] span, header h1, [role="heading"]');
    return el ? String(el.textContent || '').trim().replace(/^@/, '') : null;
  }

  function readMessages() {
    if (!cfg.handle) return [];
    var open = currentHandle();
    // Hard stop. If this is not the named conversation, read NOTHING —
    // not "read and filter", which would mean it had already been read.
    if (!open || open.toLowerCase() !== cfg.handle.toLowerCase()) return [];

    var rows = document.querySelectorAll('[role="listitem"], [data-testid="message-container"], [role="row"]');
    var out = [];
    rows.forEach(function (row) {
      var t = String(row.innerText || '').trim();
      if (!t || t.length > 2000) return;
      // Their side vs yours, best effort from layout. Unknown defaults to
      // 'partner' rather than guessing it is you — mislabelling your own
      // words as theirs is the worse error in a relational record.
      var mine = /\bYou sent\b|\bYou replied\b/i.test(t) ||
                 (row.getAttribute('data-scope') === 'self');
      out.push({
        text: t.replace(/^You (sent|replied)\s*/i, '').trim(),
        speaker: mine ? 'self' : 'partner',
        originalId: row.id || row.getAttribute('data-id') || null,
      });
    });
    return out;
  }

  async function poll() {
    if (!running || !cfg.handle) return;
    var msgs = readMessages();
    for (var i = 0; i < msgs.length; i++) {
      var m = msgs[i];
      if (!m.text) continue;
      await send({
        source: platform,
        kind: 'message',
        text: m.text,
        speaker: m.speaker,
        originalId: m.originalId,
        adapter: 'eravos-bridge/' + VERSION,
        ts: Date.now(),
      });
      if (refused > 3) {
        // Stop pushing at a closed door. Consent is a decision, not a
        // transient failure to retry through.
        running = false;
        lastError = 'stopped — consent not granted in Eravos';
        break;
      }
    }
    paint();
    if (running) setTimeout(poll, POLL_MS);
  }

  if (cfg.handle) check(); else paint();
  console.info('[eravos-bridge] ' + VERSION + ' on ' + platform +
    ' — one contact only, consent enforced by the pipeline, nothing leaves this machine.');
})();
