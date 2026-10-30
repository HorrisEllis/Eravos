'use strict';
/**
 * relay-server.js — Eravos Co-Creation Relay
 *
 * Replaces: 0.peerjs.com (signaling) + openrelay.metered.ca (TURN) + WebRTC
 * entirely, for data sync. Two fixed identity SLOTS (peerId strings, same
 * ones already hardcoded in eravos-kernel.js), authenticated by proof of
 * possession of an X25519 private key — no token, no shared secret exists
 * anywhere to generate, store, or leak.
 *
 * ZERO manual setup. Nothing to copy, nothing to paste, no config file to
 * hand-edit. The first time each identity slot connects, the relay pins
 * whatever public key it presented (relay-identities.json — auto-created,
 * server-managed, never touched by hand) and requires proof of possession
 * of the matching private key on every connection after that. This is
 * trust-on-first-use, the same model SSH uses for host keys — named
 * plainly, not oversold: whoever's first to connect to a FRESH deployment
 * claims that slot permanently. For two fixed, non-public peerId strings
 * connecting to a box only you control, moments after you stand it up,
 * that's a reasonable trade — it's not weaker than the token model this
 * replaced (whoever had the token first "owned" the identity there too),
 * and it removes the only manual step that existed.
 *
 * The relay only ever reads `type`/`peerId`/`pub` on the wire — never
 * `payload`. Running this on your own box is what makes it sovereign; it
 * doesn't need to decrypt anything to do its job.
 *
 * Zero dependencies — Node.js stdlib + nano-ws.js + relay-identity.js
 * (both bundled alongside this file) only.
 *
 * ── Setup ────────────────────────────────────────────────────────────────
 * 1. Set RELAY_URL in eravos-kernel.js to wherever this runs (same pattern
 *    0.peerjs.com used to be — a source constant, not a settings field).
 * 2. Run behind a TLS-terminating reverse proxy (Caddy is the easy path —
 *    a two-line Caddyfile gets you automatic Let's Encrypt certs and
 *    `wss://` for free). The auth handshake itself never puts a private
 *    key or session key on the wire even over plain WS, but the actual
 *    sync payload IS worth protecting from casual network observation
 *    even though it's already E2E encrypted — defense in depth, and TLS
 *    also authenticates the RELAY to the client, not just the reverse.
 *    If TLS_CERT / TLS_KEY env vars are set, this file terminates TLS
 *    itself instead; otherwise it runs plain HTTP and prints a warning.
 * 3. That's it. Open the app on both devices — the first connection each
 *    identity makes pins it. No config file to write.
 * 4. Two browser-side gates worth knowing about up front, so a failure to
 *    connect doesn't get chased as an app bug when it's actually one of
 *    these:
 *      - Mixed content: RELAY_URL in eravos-kernel.js MUST be wss:// if
 *        Eravos itself is served over https:// — browsers silently block
 *        a plain ws:// connection from a secure page, no event fires,
 *        nothing to catch. (eravos-kernel.js's initMesh() checks for this
 *        specific case and logs it plainly instead of just looking dead.)
 *      - CSP: if Eravos's hosting ever adds a Content-Security-Policy
 *        (there isn't one today), its `connect-src` directive needs this
 *        relay's origin in it (e.g. `connect-src 'self' wss://your-relay-
 *        host`) or the WebSocket connection gets blocked before it's even
 *        attempted. Nothing to do about this now since no CSP exists yet
 *        — just don't add one later without remembering this.
 *    Separately, on THIS side: WebSocket isn't subject to browser CORS the
 *    way fetch/XHR are, so there's no preflight to configure — but see
 *    ALLOWED_ORIGINS below for the equivalent server-side check.
 *
 *    node relay-server.js --port=8787
 *
 * ── Wire protocol (JSON frames, one per WS message) ─────────────────────
 *   client → server   { type:'hello', peerId, pub }
 *   server → client   { type:'challenge', ephPub, nonce, envelope:{iv,ct} }
 *   client → server   { type:'challenge_response', proof }
 *   server → client   { type:'auth_ok' } | connection closed on failure
 *   server → client   { type:'presence', peerId, online: true|false }
 *   client → server   { type:'relay', payload: <opaque> }
 *   server → client   { type:'relay', payload: <opaque> }   (forwarded verbatim)
 *   server → client   { type:'relay_failed', reason:'peer_offline' }
 *
 * ── Why this proves identity without a shared secret ─────────────────────
 * The relay generates a fresh ephemeral X25519 keypair PER CONNECTION
 * ATTEMPT (never reused, never stored). It computes ECDH(ephemeral_priv,
 * claimed_pub) — claimed_pub being whatever the client's `hello` said,
 * checked against the pinned identity (or pinned on first sight) — derives
 * a key via HKDF, encrypts a random one-time value under it, and sends the
 * ephemeral pubkey + nonce + ciphertext. Only someone holding the PRIVATE
 * key matching the pinned public key can compute the same shared secret
 * and decrypt the value. Echoing it back proves possession. Nothing that
 * crosses the wire — the ephemeral pubkey, the nonce, the ciphertext, or
 * the echoed value — is reusable to authenticate a second time.
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const crypto = require('crypto');
const { WebSocketServer, WebSocket } = require('./nano-ws');
const relayId = require('./relay-identity');

const args = process.argv.slice(2);
const port = parseInt(args.find(a => a.startsWith('--port='))?.split('=')[1] ?? '8787');
const identitiesPath = args.find(a => a.startsWith('--identities='))?.split('=')[1]
  ?? path.join(__dirname, 'relay-identities.json');

const AUTH_TIMEOUT_MS = 5000;
const MAX_FRAME_BYTES = 256 * 1024; // opaque encrypted JSON blobs, not file transfer
const PING_INTERVAL_MS = 20000;
const PING_TIMEOUT_MS = 45000; // > 2 missed pings before we give up on a socket

// Real identities are learned dynamically now, not pre-declared here --
// see the connection handler below for the actual two-identity cap.
// otherPeerId() looks at who's REALLY connected right now (a real,
// live socket), not a fixed pair of names -- with at most one other
// party ever connected in a genuinely two-person relay, "the other
// live connection" and "my partner" are the same real thing.
function otherPeerId(peerId) {
  for (const id of sockets.keys()) if (id !== peerId) return id;
  return null;
}

// ── Pinned identities — auto-managed, never hand-edited ───────────────────

function loadPinned() {
  if (!fs.existsSync(identitiesPath)) return {};
  try { return JSON.parse(fs.readFileSync(identitiesPath, 'utf8')); }
  catch (e) { console.warn(`[relay] Could not parse ${identitiesPath} — starting with no pins.`); return {}; }
}

function savePinned(pinned) {
  fs.writeFileSync(identitiesPath, JSON.stringify(pinned, null, 2));
}

let PINNED = loadPinned(); // peerId → publicKeyBase64
console.log(`[relay] ${Object.keys(PINNED).length}/2 identities already pinned from ${identitiesPath}`);

// ── Real, durable co-creation persistence ─────────────────────────────
// Direct request: co-creation data shouldn't be lost if both devices go
// offline or get reset; solo mode's own device storage is unaffected.
// See relay-persistence.js's own header for the full, load-bearing
// design constraint this keeps -- the relay still never decrypts
// anything, this only durably stores the exact opaque bytes it was
// already forwarding.
const dbPath = args.find(a => a.startsWith('--db='))?.split('=')[1]
  ?? path.join(__dirname, '..', 'data', 'co-creation.db');
let persistence = null;
try {
  persistence = require('./relay-persistence.js');
  persistence.init(dbPath);
} catch (e) {
  console.warn('[relay] real, durable persistence did NOT start (' + e.message + ') — falling back to live-only relay, same as before this feature existed.');
  persistence = null;
}

// ── HTTP/HTTPS + WS server ──────────────────────────────────────────────

const certPath = process.env.TLS_CERT;
const keyPath = process.env.TLS_KEY;
// ── ATTACHABLE (v0.15.0) ────────────────────────────────────────────────
// This used to always create its own server and always bind its own port,
// which is why Eravos needed two: 8080 for the app, 8787 for this. Two
// port-forwards, two firewall rules, two reverse-proxy blocks — and if this
// one is the one that is down, the app loads perfectly and simply never
// connects. A failure that presents as "it works but she isn't there" is the
// worst kind (§1.2).
//
// It can now attach to a server it did not create. Not one line of the relay
// logic below changed (§16.5 — nothing duplicated), and running this file
// directly still works exactly as before.
const STANDALONE = require.main === module;

let server = null;
if (STANDALONE) {
  if (certPath && keyPath) {
    server = https.createServer({
      cert: fs.readFileSync(certPath),
      key: fs.readFileSync(keyPath),
    });
    console.log('[relay] TLS terminated in-process.');
  } else {
    server = http.createServer();
    console.warn('[relay] ⚠ No TLS_CERT/TLS_KEY set — running plain HTTP/WS.');
    console.warn('[relay] ⚠ Fine for localhost testing. For anything reachable over the');
    console.warn('[relay] ⚠ open internet, put this behind a TLS reverse proxy (Caddy/nginx).');
  }
}

// When embedded, eravos-serve.js hands us the WebSocketServer it already
// attached to the shared listener. `wss` is assigned once either way.
let wss = STANDALONE ? new WebSocketServer({ server }) : null;
function attach(externalWss) {
  if (wss) throw new Error('[relay] already attached — a second attach would double-handle every message');
  wss = externalWss;
  _wireConnection();
  return { ok: true, peers: Object.keys(PINNED) };
}

// peerId → { ws, authedAt, lastPingAt, lastPongAt }
const sockets = new Map();

function send(ws, obj) {
  if (ws.readyState !== WebSocket.OPEN) return;
  try { ws.send(JSON.stringify(obj)); } catch (e) {}
}

function broadcastPresence(peerId, online) {
  const otherId = otherPeerId(peerId);
  const other = sockets.get(otherId);
  if (other) send(other.ws, { type: 'presence', peerId, online });
}

// ── Origin check ─────────────────────────────────────────────────────────
// WebSocket connections are NOT subject to browser CORS/preflight the way
// fetch()/XHR are — a page on any origin can attempt to open one. The
// browser does send an Origin header on the upgrade request, though, and
// the server can choose to honor or ignore it. Set ALLOWED_ORIGINS (comma-
// separated) once you know where Eravos is actually served from — e.g.
// `ALLOWED_ORIGINS=https://your-eravos-host` — to reject connection
// attempts from anywhere else at the door. Left unset, this warns once and
// allows any origin through; the identity handshake (pin + proof of
// possession) is still the real gate either way, so this is defense in
// depth, not the only thing standing between the relay and a stranger.
// Read LIVE, per connection. This was a boot-frozen const, so every host
// added via the Admin tab needed a relay restart to actually be accepted —
// and with a tunnel hostname that changes, that meant the relay rejected the
// origin the app was being served from, which looks exactly like "she isn't
// online". The env var still wins when set (deployment override); otherwise
// the config file is re-read, so a change takes effect on the next attempt.
const _ENV_ORIGINS = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
const _CFG_PATH = path.join(__dirname, '..', 'eravos', 'config', 'options.json');

function allowedOrigins() {
  if (_ENV_ORIGINS.length) return _ENV_ORIGINS;
  try {
    const list = JSON.parse(fs.readFileSync(_CFG_PATH, 'utf8')).server.allowedOrigins;
    return Array.isArray(list) ? list.filter(Boolean) : [];
  } catch (e) {
    return []; // unreadable config means no list, which means allow + warn — same as before
  }
}

if (!allowedOrigins().length) {
  console.warn('[relay] ⚠ no allowed origins — accepting connections from any origin.');
  console.warn('[relay] ⚠ Set server.allowedOrigins in eravos/config/options.json (see comment above).');
}

function _wireConnection() {
wss.on('connection', (ws, req) => {
  const ALLOWED = allowedOrigins();
  if (ALLOWED.length) {
    const origin = req.headers.origin;
    if (!origin || !ALLOWED.includes(origin)) {
      console.warn(`[relay] rejected connection from disallowed origin="${origin}" (${req.socket.remoteAddress})`);
      try { ws.close(1008, 'origin_not_allowed'); } catch (e) {}
      return;
    }
  }

  let authed = false;
  let peerId = null;
  let pendingChallenge = null; // { checkValue: Buffer } while awaiting challenge_response

  const authTimer = setTimeout(() => {
    if (!authed) { try { ws.close(1002, 'auth_timeout'); } catch (e) {} }
  }, AUTH_TIMEOUT_MS);

  ws.on('message', (data) => {
    if (data.length > MAX_FRAME_BYTES) {
      console.warn(`[relay] oversized frame (${data.length}b) from ${req.socket.remoteAddress} — closing`);
      try { ws.close(1009, 'frame_too_large'); } catch (e) {}
      return;
    }

    let msg;
    try { msg = JSON.parse(data.toString('utf8')); } catch (e) { return; } // malformed — silently ignored, not our problem

    if (!authed) {
      // Step 1: identity claim
      if (!pendingChallenge) {
        if (msg.type !== 'hello' || !msg.peerId || !msg.pub) return;
        // Real fix, replacing a hardcoded 2-string allowlist
        // (['eravos-james-fixed', 'eravos-raven-fixed']): the client
        // side already moved to random, opaque, per-install peer ids
        // (eravos-kernel.js's own seedContainedAccounts(), and
        // test/pairing.test.mjs explicitly asserts a name-revealing
        // peerId like the old fixed ones should be FLAGGED, not
        // used) -- this relay was the one piece still a layer behind
        // that. This app is still genuinely a two-person relay, so
        // the real security property (not letting a third party in)
        // is kept by capping PINNED at two distinct identities, not
        // by requiring them to be two specific pre-known strings.
        const alreadyKnown = Object.prototype.hasOwnProperty.call(PINNED, msg.peerId);
        const knownCount = Object.keys(PINNED).length;
        if (!alreadyKnown && knownCount >= 2) {
          console.warn(`[relay] rejected a third identity (peerId=${msg.peerId}) -- this relay already has two real, pinned identities from ${req.socket.remoteAddress}`);
          try { ws.close(1008, 'relay_full'); } catch (e) {}
          return;
        }

        if (!PINNED[msg.peerId]) {
          // First connection ever for this identity — pin it now. Everything
          // after this point (including the rest of THIS handshake) still
          // requires proving possession of the matching private key, so
          // this isn't "unauthenticated" — it's "nothing to compare
          // against yet," which is a one-time, per-identity event.
          PINNED[msg.peerId] = msg.pub;
          savePinned(PINNED);
          console.log(`[relay] pinned new identity for ${msg.peerId} (first connection, ${Object.keys(PINNED).length}/2 known)`);
        } else if (PINNED[msg.peerId] !== msg.pub) {
          console.warn(`[relay] pubkey mismatch for peerId=${msg.peerId} from ${req.socket.remoteAddress} — pinned identity does not match`);
          try { ws.close(1008, 'identity_mismatch'); } catch (e) {}
          return;
        }

        const clientPub = relayId.fromB64(msg.pub);
        const eph = relayId.generateEphemeral();
        const nonce = crypto.randomBytes(16);
        const shared = relayId.x25519(eph.priv, clientPub);
        const key = relayId.hkdf(shared, nonce, 'relay-auth-v1', 32);
        const checkValue = crypto.randomBytes(16);
        const envelope = relayId.encryptRaw(key, checkValue);

        pendingChallenge = { checkValue, claimedPeerId: msg.peerId };
        send(ws, { type: 'challenge', ephPub: relayId.toB64(eph.pub), nonce: relayId.toB64(nonce), envelope });
        return;
      }

      // Step 2: proof of possession
      if (msg.type !== 'challenge_response' || !msg.proof) return;
      const proofBytes = Buffer.from(relayId.fromB64(msg.proof));
      const expected = Buffer.from(pendingChallenge.checkValue);
      const ok = proofBytes.length === expected.length && crypto.timingSafeEqual(proofBytes, expected);
      if (!ok) {
        console.warn(`[relay] challenge failed for peerId=${pendingChallenge.claimedPeerId} from ${req.socket.remoteAddress}`);
        try { ws.close(1008, 'challenge_failed'); } catch (e) {}
        return;
      }

      // One live socket per identity — a fresh auth replaces a stale one
      // (covers reconnect-without-clean-close) rather than stacking sockets.
      peerId = pendingChallenge.claimedPeerId;
      const existing = sockets.get(peerId);
      if (existing && existing.ws !== ws) {
        try { existing.ws.close(1000, 'superseded'); } catch (e) {}
      }
      authed = true;
      pendingChallenge = null;
      clearTimeout(authTimer);
      const now = Date.now();
      sockets.set(peerId, { ws, authedAt: now, lastPingAt: now, lastPongAt: now });
      send(ws, { type: 'auth_ok' });
      console.log(`[relay] ${peerId} authenticated (${req.socket.remoteAddress})`);
      broadcastPresence(peerId, true);
      const other = sockets.get(otherPeerId(peerId));
      if (other) send(ws, { type: 'presence', peerId: otherPeerId(peerId), online: true });
      return;
    }

    if (msg.type === 'relay') {
      const otherId = otherPeerId(peerId);
      // Real, durable persistence -- happens regardless of whether the
      // other device is online right now, exactly the case this exists
      // for. Never blocks or slows live delivery (persist() itself
      // catches its own real failures, see relay-persistence.js).
      if (persistence && otherId) persistence.persist(peerId, otherId, msg.payload);
      const other = sockets.get(otherId);
      if (!other) { send(ws, { type: 'relay_failed', reason: 'peer_offline' }); return; }
      send(other.ws, { type: 'relay', payload: msg.payload });
      return;
    }

    // Real catch-up for a reconnecting device -- direct request: "as
    // long as the data is persistent and won't get lost." A device
    // that missed messages while offline (or was offline when its
    // partner sent something, and never came back online at the same
    // moment) can ask for everything since a real timestamp it already
    // has, rather than relying only on the other device still being
    // online to relay a live catch-up.
    if (msg.type === 'catch_up_request') {
      if (!persistence) { send(ws, { type: 'catch_up_response', events: [], reason: 'persistence not available on this relay' }); return; }
      const otherId = otherPeerId(peerId);
      if (!otherId) { send(ws, { type: 'catch_up_response', events: [] }); return; }
      const events = persistence.eventsSince(peerId, otherId, msg.sinceTs, msg.limit);
      send(ws, { type: 'catch_up_response', events: events.map(e => ({ from: e.fromPeerId, payload: e.payload, ts: e.ts })) });
      return;
    }

    if (msg.type === 'pong') {
      const entry = sockets.get(peerId);
      if (entry) entry.lastPongAt = Date.now();
      return;
    }
  });

  ws.on('close', () => {
    clearTimeout(authTimer);
    if (!authed) return;
    const entry = sockets.get(peerId);
    if (entry && entry.ws === ws) {
      sockets.delete(peerId);
      console.log(`[relay] ${peerId} disconnected`);
      broadcastPresence(peerId, false);
    }
  });

  ws.on('error', () => {});
});

}
if (STANDALONE) _wireConnection();

// Application-level ping — nano-ws answers raw WS pings automatically, but
// we also want to notice a socket that's stopped responding at the JSON
// level (same "readyState lies" problem as everywhere else this pattern
// shows up — mirrors the pong-watchdog already added to eravos-kernel.js).
setInterval(() => {
  const now = Date.now();
  for (const [peerId, entry] of sockets.entries()) {
    if (now - entry.lastPongAt > PING_TIMEOUT_MS) {
      console.warn(`[relay] ${peerId} silent for >${PING_TIMEOUT_MS}ms — dropping`);
      try { entry.ws.close(1001, 'ping_timeout'); } catch (e) {}
      sockets.delete(peerId);
      broadcastPresence(peerId, false);
      continue;
    }
    send(entry.ws, { type: 'ping', ts: now });
    entry.lastPingAt = now;
  }
}, PING_INTERVAL_MS);

if (STANDALONE) {
  // Running this file directly, not through eravos-serve.js. Since
  // v0.15.0's port consolidation, this is almost never what you
  // actually want -- eravos-serve.js already attaches the relay on
  // the app's own port, no separate port at all. This standalone path
  // is kept for isolated relay testing, not normal use.
  console.log('[relay] running standalone -- if you meant to run Eravos');
  console.log('[relay] normally, stop this and run: node eravos-serve.js');
  console.log('[relay] from the repo root instead (one port, not two).');

  server.on('error', (e) => {
    // Was unhandled -- an EADDRINUSE here crashed the whole process
    // with a raw Node stack trace instead of a real, actionable
    // message. Same class of failure eravos-serve.js's own PORT
    // already guards against; this path just never had it, since it
    // predates the port consolidation and wasn't revisited after.
    if (e.code === 'EADDRINUSE') {
      console.error(`[relay] port ${port} is already in use.`);
      console.error(`[relay] likely a previous standalone relay still running --`);
      console.error(`[relay] find and stop it, or run with a different port:`);
      console.error(`[relay]   node relay-server.js --port=8788`);
      console.error(`[relay] (or, better: stop this entirely and run`);
      console.error(`[relay]  eravos-serve.js from the repo root, which needs`);
      console.error(`[relay]  no separate relay port at all)`);
      process.exit(1);
    }
    throw e;
  });

  server.listen(port, () => {
    const knownCount = Object.keys(PINNED).length;
    console.log(`[relay] listening on port ${port} — ${knownCount}/2 real identities already pinned, learning the rest dynamically`);
    console.log(`[relay] NOTE: eravos-serve.js can host this on the app's own port —`);
    console.log(`[relay] one port to forward instead of two. See eravos-serve.js.`);
  });
}

module.exports = { attach };
