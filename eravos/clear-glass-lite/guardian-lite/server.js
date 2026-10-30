'use strict';
/**
 * guardian-lite/server.js — local persistent capture + query API
 *
 * §BUILT 2026-07-19 — "integrate a lightweight version of guardian with
 * clear-glass. completely capable of whatever a project demands."
 *
 * What this is: a local HTTP server your userscripts (via the GM_*
 * shim already wired into every provider window) can POST artifacts and
 * events to, and query back later — plus an SSE broadcast channel for
 * real-time updates to anything listening (the hub UI, a CLI command,
 * your own tooling). Backed by store.js, the real JaaStore engine, not a
 * toy in-memory map that forgets everything on restart.
 *
 * What this deliberately is NOT: full Guardian's NCP protocol (job
 * dispatch, heartbeat, streaming responses back into a specific browser
 * tab, queue compartments). That machinery exists in full Guardian to
 * solve NEXUS's own AI-orchestration problem — routing work to whichever
 * agent tab is free, waiting for it to answer, retrying on timeout. A
 * project just wanting "capture what happens, query it later, get
 * notified live" has no use for that job-queue complexity. If you need
 * it, that's a real, different, larger thing to build — not something to
 * fake a subset of here.
 *
 * Tables: `artifacts` (generic capture — anything a userscript POSTs),
 * `events` (lighter-weight, high-frequency signal — the same JaaStore
 * instance, a different table, callers choose which fits their data).
 * Nothing else is predefined — "completely capable of whatever a project
 * demands" means the schema isn't fixed beyond "give it a table name and
 * a JSON object," on purpose.
 */

const http = require('http');
const { randomUUID } = require('crypto');
const { JaaStore } = require('./store');
const { logError, logInfo } = require('../logger');
const { listProviders } = require('../providers');

// §CORS+CSP HARDENING 2026-07-24 — real allowlist built from the same
// provider registry main.js/userscripts.js already use, not a separate
// hand-maintained list that can drift out of sync with providers.js.
// https-only, on purpose: every provider in providers.js is https, and a
// plain-http match here would just widen the hole this is closing.
function _defaultAllowedOrigins() {
  const origins = new Set();
  for (const provider of listProviders()) {
    for (const host of provider.hosts) origins.add(`https://${host}`);
  }
  return origins;
}

class GuardianLite {
  constructor({ port = 7823, host = '127.0.0.1', dataDir, retentionLimit = 0, token = null, extraAllowedOrigins = [] }) {
    this.port = port;
    this.host = host;
    this.store = new JaaStore(dataDir);
    this.sseClients = new Set();
    this.server = null;
    // §GUARDIAN OPTIONS 2026-07-19 — "some configs and options for
    // guardian." 0 = unlimited (the original, unbounded behavior — kept
    // as the default so existing setups don't suddenly start losing data
    // they didn't ask to bound). A real positive number enforces a real
    // cap, checked after every insert — see _enforceRetention below.
    this.retentionLimit = retentionLimit;
    // §CORS+CSP HARDENING 2026-07-24, superseded in part by §DYNAMIC
    // ORIGIN 2026-07-25 (see _handle() below): allowedOrigins is now only
    // the FALLBACK allowlist, used when no token is configured. With a
    // real token (the expected state — ensureGuardianToken() mints one at
    // every boot), any origin is allowed through and the token is what
    // actually decides — Eravos no longer needs its serving origin known
    // or configured in advance at all. Built additively: the provider
    // origins from providers.js (claude.ai etc) PLUS any
    // extraAllowedOrigins the embedder passes in, kept as defense-in-depth
    // for the no-token state, not because either is load-bearing once a
    // token exists.
    this.token = token || null;
    this.allowedOrigins = _defaultAllowedOrigins();
    for (const origin of (extraAllowedOrigins || [])) this.allowedOrigins.add(origin);
    if (!this.token) {
      logInfo('guardian-lite', 'WARNING: no auth token configured — /ingest, /query, /artifacts, /channel, and /stats are reachable by ANY process on this machine that knows the port, AND origin-checking has fallen back to the static allowlist (dynamic-origin mode requires a token). Pass a token (see config.js ensureGuardianToken()) to close this properly.');
    }
  }

  start() {
    if (this.server) return Promise.resolve(this.port);
    this.server = http.createServer((req, res) => this._handle(req, res));
    return new Promise((resolve, reject) => {
      this.server.once('error', reject);
      this.server.listen(this.port, this.host, () => resolve(this.port));
    });
  }

  stop() {
    return new Promise((resolve) => {
      for (const client of this.sseClients) { try { client.end(); } catch (_) {} }
      this.sseClients.clear();
      if (this.server) this.server.close(() => { this.server = null; resolve(); });
      else resolve();
    });
  }

  broadcast(event) {
    const payload = `data: ${JSON.stringify(event)}\n\n`;
    for (const client of this.sseClients) {
      try { client.write(payload); } catch (_) { this.sseClients.delete(client); }
    }
  }

  async _handle(req, res) {
    // §CORS+CSP HARDENING 2026-07-24 — was 'Access-Control-Allow-Origin: *',
    // which let ANY origin (any tab in any browser, not just the four
    // provider windows this app opens) read/write/delete the local
    // ledger — real CSRF-from-the-web exposure on a server with no other
    // access control. Now: echo back the request's own Origin ONLY if it's
    // on the real allowlist (built from providers.js, see
    // _defaultAllowedOrigins above); otherwise omit the header entirely so
    // the browser's own same-origin policy blocks the response from being
    // read. 'Vary: Origin' so any caching layer in front of this (there
    // isn't one today, but this is the correct header regardless) doesn't
    // serve one origin's allowed response to a different, disallowed one.
    // §DYNAMIC ORIGIN 2026-07-25 — was a static allowlist requiring every
    // caller's real origin to be known and configured in advance
    // (providers.js hosts + guardianLiteExtraAllowedOrigins). That's fine
    // for the provider windows (claude.ai etc — a fixed, known set) but
    // wrong for Eravos specifically: it can be hosted anywhere, on any
    // domain, and change hosts later — a static guess just recreates the
    // "silently wrong for a deployment nobody thought to name" problem
    // this whole hardening pass exists to close.
    //
    // The token is already the REAL access control here (see the check
    // below, and every comment already saying so) — CORS origin-locking
    // was always a browser-side courtesy on top of it, not a replacement.
    // So: once a real token exists (ensureGuardianToken() mints one at
    // every boot — this is the expected, not exceptional, state), origin
    // no longer needs to be pre-known at all; ANY origin may ask, and the
    // token check further down is what actually decides. The static
    // allowlist only still matters as the fallback for the one state
    // that's genuinely unsafe to make dynamic: no token configured at
    // all, where origin-locking is the ONLY thing preventing an arbitrary
    // page from reading the ledger.
    const origin = req.headers.origin;
    const originAllowed = this.token
      ? !!origin
      : (!!origin && this.allowedOrigins.has(origin));
    if (originAllowed) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-CGL-Token');
    // §PRIVATE NETWORK ACCESS 2026-07-24 — Chromium's PNA policy requires
    // this on the preflight response before it'll let a page fetch a
    // "private"/"local" address (127.0.0.1 counts) even when CORS and CSP
    // both already allow it. Without this header the actual request never
    // leaves the preflight stage — a real, separate reason
    // GM_xmlhttpRequest calls from a provider window could fail even with
    // everything else fixed. Echoing it back whenever the browser asks is
    // correct here: PNA is itself the access control for the private-
    // network hop, origin allowlisting above is what decides who gets to
    // ask in the first place.
    if (req.headers['access-control-request-private-network'] === 'true') {
      res.setHeader('Access-Control-Allow-Private-Network', 'true');
    }
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

    const url = new URL(req.url, `http://${req.headers.host}`);

    try {
      if (req.method === 'GET' && url.pathname === '/health') {
        // Deliberately left out of the token check below — a liveness
        // probe (main.js's status badge, cli.js's ensureGuardianLite())
        // shouldn't need the secret just to ask "is anything listening,"
        // and it returns nothing sensitive.
        return this._json(res, 200, { ok: true, uptime: process.uptime() });
      }

      // §CORS+CSP HARDENING 2026-07-24 — the real access control. CORS
      // above is a browser-side courtesy — a non-browser client (curl,
      // another local process) never sends a preflight and never respects
      // Access-Control-Allow-Origin, so it was never actually stopped by
      // the old wildcard change alone. This is the check that matters:
      // every route past this point requires the shared token, checked
      // server-side, not the browser's word for it. Skipped entirely if
      // no token is configured (see the constructor's warning) so this
      // stays backward-compatible with an embedder that hasn't adopted
      // config.js's ensureGuardianToken() yet — that's a real, logged
      // tradeoff, not a silent one.
      //
      // Accepted two ways: the X-CGL-Token header (every real caller that
      // can set one — fetch/GM_xmlhttpRequest/http.request all can), OR
      // a ?token= query param, ONLY because the browser-native
      // EventSource API (used for GET /channel) has no way to set custom
      // request headers at all — this is EventSource's own limitation,
      // not a design choice made here. A token in a URL is weaker
      // (ends up in server logs, browser history) than a header, which is
      // why this is the query-param path's ONLY justification, not a
      // general alternative offered on every route.
      const suppliedToken = req.headers['x-cgl-token'] || url.searchParams.get('token');
      if (this.token && suppliedToken !== this.token) {
        return this._json(res, 401, { ok: false, error: 'missing or invalid X-CGL-Token' });
      }

      if (req.method === 'GET' && url.pathname === '/channel') {
        return this._openChannel(res);
      }

      // POST /ingest — the one write path. Body: { table, ...fields }.
      // table defaults to 'artifacts' so a minimal caller can just POST
      // { content: '...' } and get something real stored.
      if (req.method === 'POST' && url.pathname === '/ingest') {
        const body = await this._readBody(req);
        const table = body.table || 'artifacts';
        delete body.table;
        const row = this.store.insert(table, { uuid: randomUUID(), ts: Date.now(), ...body });
        this._enforceRetention(table);
        this.broadcast({ type: 'ingest', table, row });
        return this._json(res, 200, { ok: true, id: row.id, table });
      }

      // GET /query?table=artifacts&limit=50&<field>=<value> — real
      // filtering, not just "return everything." Any query param other
      // than table/limit is treated as an exact-match filter field.
      if (req.method === 'GET' && url.pathname === '/query') {
        const table = url.searchParams.get('table') || 'artifacts';
        const limit = parseInt(url.searchParams.get('limit') || '50', 10);
        const where = {};
        for (const [k, v] of url.searchParams) {
          if (k !== 'table' && k !== 'limit') where[k] = v;
        }
        const rows = this.store.all(table, where).slice(-limit);
        return this._json(res, 200, { ok: true, table, count: rows.length, rows });
      }

      // DELETE /artifacts/:id?table=artifacts — real deletion, not a
      // dead endpoint. Defaults to the artifacts table since that's the
      // common case; pass ?table= for anything else.
      if (req.method === 'DELETE' && url.pathname.startsWith('/artifacts/')) {
        const id = url.pathname.split('/')[2];
        const table = url.searchParams.get('table') || 'artifacts';
        const count = this.store.delete(table, { id });
        return this._json(res, count > 0 ? 200 : 404, { ok: count > 0, deleted: count });
      }

      if (req.method === 'GET' && url.pathname === '/stats') {
        return this._json(res, 200, { ok: true, tables: this._tableStats() });
      }

      this._json(res, 404, { ok: false, error: `${req.method} ${url.pathname} not found` });
    } catch (e) {
      // §BUG FOUND 2026-07-19 — this returned the error to the client but
      // never logged it anywhere for the operator to see later. A request
      // that 500'd at 3am left no trace once the response was sent.
      logError('guardian-lite', e);
      this._json(res, 500, { ok: false, error: e.message });
    }
  }

  _openChannel(res) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });
    res.write(': connected\n\n');
    this.sseClients.add(res);
    res.on('close', () => this.sseClients.delete(res));
  }

  _enforceRetention(table) {
    if (!this.retentionLimit || this.retentionLimit <= 0) return; // 0 = unlimited, the default
    const rows = this.store.all(table);
    if (rows.length <= this.retentionLimit) return;
    // Oldest first by ts (every ingested row has one — set at insert time
    // above, not something a caller can omit), trim the excess from the
    // front. Sorted defensively (Map iteration order isn't a documented
    // guarantee to rely on for correctness, even though it happens to
    // match insertion order in practice) rather than assume order.
    const sorted = rows.slice().sort((a, b) => (a.ts || 0) - (b.ts || 0));
    const toRemove = sorted.slice(0, rows.length - this.retentionLimit);
    for (const row of toRemove) this.store.delete(table, { id: row.id });
  }

  _tableStats() {
    const out = {};
    // JaaStore doesn't expose a table-name list directly — read the
    // in-memory Maps it's already holding rather than guess a fixed list,
    // so this stays accurate for whatever tables callers have actually
    // used, not a predefined set.
    for (const [table, rows] of this.store._tables) out[table] = rows.size;
    return out;
  }

  _readBody(req) {
    return new Promise((resolve, reject) => {
      const chunks = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {}); }
        catch (e) { reject(new Error('invalid JSON body')); }
      });
      req.on('error', reject);
    });
  }

  _json(res, status, data) {
    const body = JSON.stringify(data);
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(body);
  }
}

module.exports = { GuardianLite };
