#!/usr/bin/env node
'use strict';
/* ══════════════════════════════════════════════════════════════════════════
   ERAVOS SERVE  ·  eravos-serve.js  ·  v0.15.0
   UUID: eravos-unified-server-0001-0000-000000000001
   HOOK: eravos.serve:unified:00001
   ══════════════════════════════════════════════════════════════════════════

   ONE PORT. The app and the co-creation relay on the same listener.

   ── WHY (§16.1 — the nearest gap is the one blocking you) ───────────────

   It was two: 8080 for the PWA, 8787 for the relay WebSocket. That means two
   port-forwards, two firewall rules, two reverse-proxy blocks, two things
   that can be up while the other is down — and if the relay is the one that
   is down, the app loads perfectly and simply never connects. A failure that
   presents as "it works but she isn't there" is the worst kind (§1.2).

   `nano-ws`'s WebSocketServer already accepts an existing `server` and an
   optional `path`, and both halves already used `http.createServer()`. So
   this is consolidation, not a rewrite: same static server, same relay, one
   listener, relay scoped to `/relay`.

       http(s)://host:PORT/          the app
       ws(s)://host:PORT/relay       the relay
       http(s)://host:PORT/_health   liveness, for the proxy and for you

   ── UPnP (§1.2 — and it is honest about failing) ────────────────────────

   `--upnp` discovers an IGD over SSDP and asks it to map the port. Zero
   dependencies: raw UDP multicast for discovery, raw SOAP over HTTP for the
   mapping. Both are just strings over sockets.

   It will often fail, and when it does it SAYS SO with the reason and the
   manual step. Most consumer routers ship UPnP off, and carrier-grade NAT
   makes it impossible no matter what the router says — a mapping that
   "succeeded" behind CGNAT still is not reachable, so this VERIFIES the
   mapping is listed afterward rather than trusting the response code.

   ── REVERSE PROXY ───────────────────────────────────────────────────────

   `--proxy-config caddy|nginx` prints a config that is correct for one port,
   including the WebSocket upgrade headers — the single most common reason a
   proxied relay silently fails while the app loads fine.
   ══════════════════════════════════════════════════════════════════════════ */

const http = require('http');
const https = require('https');
const fs = require('fs');
const os = require('os');
const path = require('path');
const dgram = require('dgram');
const { URL } = require('url');

const ARGS = process.argv.slice(2);
const flag = (name, dflt) => {
  const hit = ARGS.find(a => a === '--' + name || a.startsWith('--' + name + '='));
  if (!hit) return dflt;
  const eq = hit.indexOf('=');
  return eq === -1 ? true : hit.slice(eq + 1);
};

const ROOT = path.join(__dirname, 'eravos');

/* ── config (v0.18.0) ────────────────────────────────────────────────
   One place to change the port, and a stated order of precedence so it is
   never a mystery which one won. `--show-config` prints the answer. */
function loadConfig() {
  try {
    const raw = fs.readFileSync(path.join(ROOT, 'config', 'options.json'), 'utf8');
    return JSON.parse(raw).server || {};
  } catch (e) {
    // §1.2 — a config that could not be read is NAMED. Silently falling back
    // to defaults is how someone edits a file for an hour with no effect.
    if (!/ENOENT/.test(e.message)) console.warn('[eravos] config/options.json unreadable: ' + e.message);
    return {};
  }
}
const CFG = loadConfig();

// Real, explicit bind host -- direct request ("open eravos up to...
// 0.0.0.0"). Node's own default when no host is passed to listen() is
// already 0.0.0.0 (confirmed directly: a bare http.createServer().
// listen(port) really does bind all interfaces) -- but an implicit
// default isn't the same thing as a real, documented, provenance-bearing
// configuration (AXIOMS §16.2 "systems must explain themselves," §17.5
// "every output has provenance"). This makes it explicit and overridable,
// rather than silently relying on what Node happens to default to.
const BIND_HOST = flag('bind-host', process.env.ERAVOS_BIND_HOST || CFG.bindHost || '0.0.0.0');

// Real, separate loader for smtp config -- kept apart from loadConfig()
// above on purpose, since that one's own established contract is
// "returns .server specifically," used elsewhere assuming that exact
// shape. Same file, same real read, just a different top-level key.
function loadSmtpConfig() {
  try {
    const raw = fs.readFileSync(path.join(ROOT, 'config', 'options.json'), 'utf8');
    return JSON.parse(raw).smtp || {};
  } catch (e) {
    return {};
  }
}
const SMTP_CFG = loadSmtpConfig();

// Same real, separate-loader pattern as SMTP_CFG above.
function loadDdnsConfig() {
  try {
    const raw = fs.readFileSync(path.join(ROOT, 'config', 'options.json'), 'utf8');
    return JSON.parse(raw).ddns || {};
  } catch (e) {
    return {};
  }
}
const DDNS_CFG = loadDdnsConfig();

// Same real, separate-loader pattern as SMTP_CFG/DDNS_CFG above.
function loadAcmeConfig() {
  try {
    const raw = fs.readFileSync(path.join(ROOT, 'config', 'options.json'), 'utf8');
    return JSON.parse(raw).acme || {};
  } catch (e) {
    return {};
  }
}
const ACME_CFG = loadAcmeConfig();
const ACME_CHALLENGE_DIR = path.join(__dirname, 'data', 'acme-challenges');
let devSmtpServer = null;
let lastUpnpResult = null;
let ddnsHandle = null;
let lastDdnsConfirmedIp = null;

// --port  >  ERAVOS_PORT / PORT  >  config/options.json  >  8080
const PORT_SOURCE =
  flag('port', null) ? '--port'
  : (process.env.ERAVOS_PORT || process.env.PORT) ? 'environment'
  : CFG.port ? 'config/options.json'
  : 'default';
const PORT = parseInt(
  flag('port', process.env.ERAVOS_PORT || process.env.PORT || CFG.port || '8080'), 10);

const SINGLE_INSTANCE = CFG.singleInstance !== false && !flag('allow-multiple', false);
const KILL_PREVIOUS = flag('kill-previous', CFG.killPrevious !== false);
const LOCK_FILE = path.join(__dirname, CFG.lockFile || '.eravos.lock');
const RELAY_PATH = '/relay';
const TLS_CERT = flag('cert', process.env.ERAVOS_CERT || (typeof CFG.tlsCert === 'string' ? CFG.tlsCert : null));
const TLS_KEY = flag('key', process.env.ERAVOS_KEY || (typeof CFG.tlsKey === 'string' ? CFG.tlsKey : null));
// The port the ACME challenge + redirect listener binds when this server is
// serving TLS on another port. 0 or null disables it — which also disables
// certificate renewal, so it is opt-out rather than opt-in.
const HTTP_REDIRECT_PORT = flag('http-redirect-port',
  (typeof CFG.httpRedirectPort === 'number') ? CFG.httpRedirectPort : 80);
const USE_UPNP = flag('upnp', null) !== null ? !!flag('upnp', false) : (typeof CFG.upnp === 'boolean' ? CFG.upnp : false);

// Emergence, mounted on the same listener, same reasoning as the relay
// consolidation above: a separate port for Emergence's analysis API is
// one more thing that can be up while the app is down, and space-distance
// silently degrading to "no signal" because a second process isn't
// running is exactly the "presents as fine, isn't" failure shape this
// whole file exists to eliminate. Defaults to a sibling folder (the
// normal case -- warp/, wire/, emergence/ as siblings, per emergence's
// own README on why it's a separate folder at all, not vendored here).
// Uses CFG (this file's own real config loader, see loadConfig() above)
// rather than a second, separate config-reading mechanism -- was two
// parallel systems doing the same job before this merge reconciled them.
const EMERGENCE_PATH = flag('emergence-path', process.env.EMERGENCE_PATH || CFG.emergencePath || path.join(__dirname, '..', 'emergence'));
const EMERGENCE_API_PREFIX = '/api/emergence';
let emergenceLoop = null;
let emergenceAttached = false;

// eravos-db: per-user + per-couple encrypted account storage. Same
// sibling-folder convention as EMERGENCE_PATH above (eravos-db/,
// warp/, wire/, emergence/ all live next to eravos/). Genuinely
// separate from eravos-pairing.js's existing peer-id/WebRTC pairing --
// that system pairs two *devices* with no account involved at all, and
// still works exactly as before. This adds an optional account layer
// (email/password, onboarding, module state, an 8-digit invite that
// links two accounts) alongside it, not instead of it.
const ACCOUNTS_PATH = flag('accounts-path', process.env.ACCOUNTS_PATH || CFG.accountsPath || path.join(__dirname, '..', 'eravos-db'));
const ACCOUNTS_DATA_DIR = path.join(__dirname, 'data', 'accounts');
let accountsAttached = false;
let UserStoreCls = null;
let InviteCodeCls = null;
let userStore = null;
let inviteCode = null;
// Bearer-token sessions live in process memory only, same "the server
// never persists relational data it doesn't own" posture as PENDING
// above -- a session holds the unwrapped master key, which must never
// touch disk. Restarting the process logs everyone out; that's correct,
// not a bug, for a local-first single-process app.
const SESSIONS = new Map(); // token -> { userId, db, masterKey }

function newSessionToken() {
  return require('crypto').randomBytes(32).toString('hex');
}

function requireSession(req) {
  const auth = req.headers['authorization'] || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return null;
  return SESSIONS.get(token) || null;
}

const PROXY_CONFIG = flag('proxy-config', null);
const BEHIND_PROXY = !!flag('behind-proxy', false);

// In-memory relay for the userscript. NOT a store: drained on read, capped,
// and gone when the process stops. The server never persists relational data
// — that would be a second copy outside the device.
const PENDING = [];

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
  '.webm': 'video/webm', '.mp4': 'video/mp4', '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg',
  '.wasm': 'application/wasm', '.txt': 'text/plain; charset=utf-8',
  '.spec': 'text/plain; charset=utf-8', '.md': 'text/plain; charset=utf-8',
};

/* ── UPnP: SSDP discovery + SOAP mapping, zero dependencies ─────────── */

function ssdpDiscover(timeoutMs = 3000) {
  return new Promise(resolve => {
    const sock = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    const found = [];
    const msg = Buffer.from(
      'M-SEARCH * HTTP/1.1\r\n' +
      'HOST: 239.255.255.250:1900\r\n' +
      'MAN: "ssdp:discover"\r\n' +
      'MX: 2\r\n' +
      'ST: urn:schemas-upnp-org:device:InternetGatewayDevice:1\r\n\r\n');
    sock.on('message', buf => {
      const m = /LOCATION:\s*(\S+)/i.exec(buf.toString());
      if (m && found.indexOf(m[1]) === -1) found.push(m[1]);
    });
    sock.on('error', () => { try { sock.close(); } catch (e) {} resolve([]); });
    sock.bind(() => {
      try { sock.setBroadcast(true); sock.send(msg, 1900, '239.255.255.250'); }
      catch (e) { /* reported by the empty result below */ }
    });
    setTimeout(() => { try { sock.close(); } catch (e) {} resolve(found); }, timeoutMs);
  });
}

function httpGet(url, timeoutMs = 4000) {
  return new Promise(resolve => {
    const req = http.get(url, { timeout: timeoutMs }, res => {
      let d = '';
      res.on('data', c => { d += c; });
      res.on('end', () => resolve(d));
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
  });
}

function soap(controlUrl, action, body, timeoutMs = 5000) {
  return new Promise(resolve => {
    const u = new URL(controlUrl);
    const envelope =
      '<?xml version="1.0"?>' +
      '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" ' +
      's:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/"><s:Body>' +
      '<u:' + action + ' xmlns:u="urn:schemas-upnp-org:service:WANIPConnection:1">' +
      body + '</u:' + action + '></s:Body></s:Envelope>';
    const req = http.request({
      hostname: u.hostname, port: u.port || 80, path: u.pathname + u.search, method: 'POST',
      timeout: timeoutMs,
      headers: {
        'Content-Type': 'text/xml; charset="utf-8"',
        'Content-Length': Buffer.byteLength(envelope),
        'SOAPAction': '"urn:schemas-upnp-org:service:WANIPConnection:1#' + action + '"',
      },
    }, res => {
      let d = '';
      res.on('data', c => { d += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: d }));
    });
    req.on('error', e => resolve({ status: 0, body: '', error: e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, body: '', error: 'timeout' }); });
    req.end(envelope);
  });
}

function lanIP() {
  const ifs = os.networkInterfaces();
  for (const name of Object.keys(ifs)) {
    for (const i of ifs[name]) {
      if (i.family === 'IPv4' && !i.internal) return i.address;
    }
  }
  return null;
}

async function upnpMap(internalPort, externalPort) {
  externalPort = externalPort || internalPort; // backward compatible -- same port both sides unless told otherwise
  const ip = lanIP();
  if (!ip) return { ok: false, reason: 'no non-internal IPv4 interface — nothing to map to' };

  const locations = await ssdpDiscover();
  if (!locations.length) {
    return { ok: false, reason: 'no UPnP gateway answered SSDP in 3s',
      fix: 'Most consumer routers ship UPnP OFF. Enable it, or forward TCP ' + externalPort + ' -> ' + ip + ':' + internalPort + ' by hand.' };
  }

  for (const loc of locations) {
    const desc = await httpGet(loc);
    if (!desc) continue;
    const ctrl = /<controlURL>([^<]+)<\/controlURL>/gi;
    let m, control = null;
    while ((m = ctrl.exec(desc))) {
      if (/WANIPConn|WANPPPConn/i.test(desc.slice(Math.max(0, m.index - 600), m.index))) { control = m[1]; break; }
    }
    if (!control) { const first = /<controlURL>([^<]+)<\/controlURL>/i.exec(desc); control = first && first[1]; }
    if (!control) continue;
    const base = new URL(loc);
    const controlUrl = control.startsWith('http') ? control : base.origin + (control.startsWith('/') ? '' : '/') + control;

    const add = await soap(controlUrl, 'AddPortMapping',
      '<NewRemoteHost></NewRemoteHost>' +
      '<NewExternalPort>' + externalPort + '</NewExternalPort>' +
      '<NewProtocol>TCP</NewProtocol>' +
      '<NewInternalPort>' + internalPort + '</NewInternalPort>' +
      '<NewInternalClient>' + ip + '</NewInternalClient>' +
      '<NewEnabled>1</NewEnabled>' +
      '<NewPortMappingDescription>Eravos</NewPortMappingDescription>' +
      '<NewLeaseDuration>0</NewLeaseDuration>');

    if (add.status !== 200) {
      const err = /<errorDescription>([^<]+)</i.exec(add.body);
      return { ok: false, gateway: base.origin,
        reason: 'gateway refused: ' + (err ? err[1] : (add.error || 'HTTP ' + add.status)),
        fix: 'Forward TCP ' + externalPort + ' -> ' + ip + ':' + internalPort + ' in the router admin page.' };
    }

    // §1.1 — do NOT trust a 200. Read the mapping back. A gateway can accept
    // the SOAP call and map nothing, and behind CGNAT a "successful" mapping
    // still is not reachable from outside.
    const check = await soap(controlUrl, 'GetSpecificPortMappingEntry',
      '<NewRemoteHost></NewRemoteHost><NewExternalPort>' + externalPort + '</NewExternalPort><NewProtocol>TCP</NewProtocol>');
    const mapped = check.status === 200 && new RegExp('<NewInternalClient>' + ip.replace(/\./g, '\\.') + '</').test(check.body);

    const ext = await soap(controlUrl, 'GetExternalIPAddress', '');
    const extIp = (/<NewExternalIPAddress>([^<]*)</i.exec(ext.body) || [])[1] || null;
    const cgnat = extIp ? /^(10\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/.test(extIp) : false;

    return {
      ok: mapped, gateway: base.origin, lan: ip, externalIp: extIp,
      externalPort, internalPort,
      verified: mapped,
      // The single most useful thing this can tell you, and the one most
      // tools do not: the mapping worked and it still will not reach you.
      cgnat: cgnat,
      reason: mapped ? null : 'gateway returned 200 but the mapping is not listed back',
      warning: cgnat
        ? 'Your external IP ' + extIp + ' is itself private — you are behind carrier-grade NAT. ' +
          'No port forward can reach you from outside. Use a tunnel to a host you control, or ask your ISP for a public IP.'
        : null,
    };
  }
  return { ok: false, reason: 'found a gateway but no WAN connection service to talk to' };
}

/* ── reverse proxy configs ──────────────────────────────────────────── */

function proxyConfig(kind, port) {
  if (kind === 'nginx') {
    return `# eravos — ONE upstream, both the app and the relay.
# The two proxy_set_header lines under /relay are the thing everyone misses:
# without them the app loads perfectly and the relay never connects, which
# looks like "she just isn't online".
server {
  listen 443 ssl http2;
  server_name anonymousservers.info;

  ssl_certificate     /etc/letsencrypt/live/anonymousservers.info/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/anonymousservers.info/privkey.pem;

  location /relay {
    proxy_pass http://127.0.0.1:${port};
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;      # <- required
    proxy_set_header Connection "upgrade";       # <- required
    proxy_set_header Host $host;
    proxy_read_timeout 3600s;                    # a relay holds the socket open
    proxy_send_timeout 3600s;
  }

  location / {
    proxy_pass http://127.0.0.1:${port};
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}`;
  }
  return `# eravos — Caddy. Handles TLS and the websocket upgrade on its own.
anonymousservers.info {
  reverse_proxy 127.0.0.1:${port}
}

# That is the whole file. One port means one line — which is the point of
# consolidating them.`;
}

/* ── single instance (§1.2 — two servers on one port is a silent mess) ──

   Two instances is not a hypothetical here: the old start-all launched two
   processes, and a stale one holding the port makes a fresh start fail with
   EADDRINUSE — or worse, succeed on a different port while the browser talks
   to the old one. The relay then "isn't running" from the user's side, which
   is indistinguishable from a network problem.

   The lock records the PID. On start we check whether that PID is actually
   alive (a lock file left by a crash is not a running server — treating it as
   one is how you end up unable to start at all), and either kill it or refuse
   with a clear reason.
*/

function readLock() {
  try {
    const raw = JSON.parse(fs.readFileSync(LOCK_FILE, 'utf8'));
    if (!raw || !raw.pid) return null;
    try { process.kill(raw.pid, 0); }        // signal 0 = liveness probe only
    catch (e) { return { ...raw, stale: true }; }
    return { ...raw, stale: false };
  } catch (e) { return null; }
}

function writeLock() {
  try {
    fs.writeFileSync(LOCK_FILE, JSON.stringify({
      pid: process.pid, port: PORT, started: Date.now(), cwd: __dirname,
    }, null, 2));
  } catch (e) { console.warn('[eravos] could not write lock file: ' + e.message); }
}

function releaseLock() {
  try {
    const cur = readLock();
    // Only remove OUR lock. Deleting someone else's is how two instances end
    // up both believing they are the only one.
    if (cur && cur.pid === process.pid) fs.unlinkSync(LOCK_FILE);
  } catch (e) { /* nothing useful to do while exiting */ }
}

function claimSingleInstance() {
  if (!SINGLE_INSTANCE) return { ok: true, note: 'single-instance disabled (--allow-multiple)' };
  const prev = readLock();
  if (!prev) return { ok: true };

  if (prev.stale) {
    // A crash leaves a lock behind. Refusing to start because of a dead PID
    // would be the lock protecting nothing and blocking everything.
    console.log('[eravos] clearing a stale lock from pid ' + prev.pid + ' (not running)');
    try { fs.unlinkSync(LOCK_FILE); } catch (e) {}
    return { ok: true, cleared: prev.pid };
  }

  if (!KILL_PREVIOUS) {
    return { ok: false,
      reason: 'already running as pid ' + prev.pid + ' on port ' + prev.port,
      fix: 'Stop it with ./stop-all.sh, or start with --kill-previous, or --allow-multiple.' };
  }

  console.log('[eravos] stopping the previous instance (pid ' + prev.pid + ', port ' + prev.port + ')');
  try { process.kill(prev.pid, 'SIGTERM'); } catch (e) {
    return { ok: false, reason: 'could not stop pid ' + prev.pid + ': ' + e.message };
  }
  // Wait for the port to actually free. Killing and racing straight into
  // listen() is how you get an EADDRINUSE that looks random.
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    const still = readLock();
    if (!still || still.stale) break;
    const wait = new Int32Array(new SharedArrayBuffer(4));
    Atomics.wait(wait, 0, 0, 50);           // synchronous, no busy spin
  }
  try { fs.unlinkSync(LOCK_FILE); } catch (e) {}
  return { ok: true, killed: prev.pid };
}

/* ── static ─────────────────────────────────────────────────────────── */

/* ── emergence api, mounted on this same listener ─────────────────────
   Mirrors emergence/server.js's own real route shapes exactly -- this
   isn't a new API, it's the same one, reachable through one port
   instead of two. Real graceful degradation, not a stub: if
   emergenceLoop never attached, every route here answers honestly
   with 503, not a fabricated empty success. */

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => { data += chunk; if (data.length > 1e6) req.destroy(); });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

function jsonRes(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

async function handleEmergenceApi(req, res, subPath) {
  if (!emergenceAttached) {
    return jsonRes(res, 503, { error: 'Emergence is not attached on this server -- see boot log for why. computeRelationalHealth() falls back to no space-distance signal, but this endpoint itself is honestly unavailable, not faked.' });
  }

  try {
    if (req.method === 'GET' && subPath === '/space/health') {
      return jsonRes(res, 200, emergenceLoop.space.health());
    }

    if (req.method === 'POST' && subPath === '/space/check-time') {
      const raw = await readBody(req);
      let parsed;
      try { parsed = JSON.parse(raw); } catch { return jsonRes(res, 400, { error: 'body must be valid JSON' }); }
      if (typeof parsed.timestamp !== 'number') return jsonRes(res, 400, { error: 'body must have a numeric "timestamp" key (ms epoch)' });
      return jsonRes(res, 200, emergenceLoop.space.checkProposedTime(parsed.timestamp));
    }

    if (req.method === 'POST' && subPath === '/space/contact') {
      const raw = await readBody(req);
      let parsed;
      try { parsed = JSON.parse(raw); } catch { return jsonRes(res, 400, { error: 'body must be valid JSON' }); }
      const result = await emergenceLoop.space.logContact(parsed);
      return jsonRes(res, 200, result);
    }

    if (req.method === 'POST' && subPath === '/space/locations') {
      const raw = await readBody(req);
      let parsed;
      try { parsed = JSON.parse(raw); } catch { return jsonRes(res, 400, { error: 'body must be valid JSON' }); }
      return jsonRes(res, 200, emergenceLoop.space.setLocations(parsed));
    }

    if (req.method === 'POST' && subPath === '/tick') {
      const raw = await readBody(req);
      let parsed;
      try { parsed = JSON.parse(raw); } catch { return jsonRes(res, 400, { error: 'body must be valid JSON' }); }
      if (!parsed.text) return jsonRes(res, 400, { error: 'body must have a "text" key' });
      const result = await emergenceLoop.tick(parsed.text, parsed.target || null);
      return jsonRes(res, 200, result);
    }

    return jsonRes(res, 404, { error: 'no emergence route: ' + req.method + ' ' + subPath });
  } catch (e) {
    // §1.2 -- a real error is reported, never swallowed into a 200
    console.error('[eravos] emergence api error on ' + subPath + ': ' + e.message);
    return jsonRes(res, 422, { error: e.message });
  }
}

function serveStatic(req, res) {
  let urlPath;
  try { urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname); }
  catch (e) { res.writeHead(400); return res.end('bad url'); }

  // ── ACME HTTP-01 CHALLENGE ───────────────────────────────────────────
  // Required for real, browser-trusted cert issuance (server-modules/
  // acme-client.js). Let's Encrypt's own validator connects over plain
  // HTTP specifically -- this must answer here, before any HTTPS
  // upgrade/redirect logic, on whatever this server's real port 80 is
  // (directly, or via the UPnP external-port mapping already built).
  if (urlPath.startsWith('/.well-known/acme-challenge/')) {
    const token = urlPath.slice('/.well-known/acme-challenge/'.length);
    // §1.2 real validation -- a token is a fixed-charset ACME value,
    // never a path to traverse with.
    if (!/^[A-Za-z0-9_-]+$/.test(token)) { res.writeHead(400); return res.end('bad token'); }
    const challengePath = path.join(ACME_CHALLENGE_DIR, token);
    fs.readFile(challengePath, 'utf8', (err, data) => {
      if (err) { res.writeHead(404); return res.end('not found'); }
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end(data);
    });
    return;
  }

  // ── PIPELINE INGEST (v0.22.0) ──────────────────────────────────────
  // The one door for external relational data. The userscript posts here;
  // it has no other way in. Consent is enforced by the pipeline itself, not
  // by this route — a route check could be bypassed by anything that can
  // make an HTTP request, and the whole point is that it cannot be.
  if (urlPath === '/pipeline/ingest' && req.method === 'POST') {
    let body = '';
    req.on('data', c => {
      body += c;
      if (body.length > 64 * 1024) { req.destroy(); }   // §0.4 bounded
    });
    req.on('end', () => {
      res.setHeader('Access-Control-Allow-Origin', '*');   // the userscript runs on instagram.com
      let rec;
      try { rec = JSON.parse(body); }
      catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ accepted: false, reason: 'malformed JSON' }));
      }
      // The server does not hold the pipeline — the browser does, because
      // that is where the consent state and the lattice live. So this parks
      // the record and the page collects it. A server-side store would be a
      // second copy of relational data outside the device, which is exactly
      // what this app does not do.
      PENDING.push({ ...rec, receivedAt: Date.now() });
      if (PENDING.length > 500) PENDING.shift();
      res.writeHead(202, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ accepted: null, queued: true, pending: PENDING.length,
        note: 'Queued for the browser. Consent is decided there, not here — the server never stores relational data.' }));
    });
    return;
  }
  if (urlPath === '/pipeline/pending') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    const out = PENDING.splice(0, PENDING.length);   // drained, never kept
    return res.end(JSON.stringify({ records: out }));
  }
  if (req.method === 'OPTIONS' && urlPath.indexOf('/pipeline/') === 0) {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    return res.end();
  }

  if (urlPath === '/_health') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: true, app: true, relay: true, emergence: emergenceAttached, port: PORT,
      pipelinePending: PENDING.length, uptime: process.uptime(),
      smtpConfigured: !!(SMTP_CFG.send && SMTP_CFG.send.host),
      devSmtpRunning: !!devSmtpServer,
      upnp: lastUpnpResult }));
  }

  // ── Accounts (eravos-db) ─────────────────────────────────────────────
  // Optional account layer: email/password signup+login, onboarding
  // answers, per-module state, and the 8-digit partner invite that links
  // two accounts into a shared, separately-encrypted couple database.
  // Genuinely separate from eravos-pairing.js's peer-id pairing above --
  // that pairs two devices with no account; this pairs two accounts.
  // Every route here degrades honestly to 503 if eravos-db didn't attach.
  if (urlPath.startsWith('/api/account/')) {
    if (!accountsAttached) {
      return jsonRes(res, 503, { error: 'Accounts are not attached on this server -- see boot log for why.' });
    }

    if (req.method === 'POST' && urlPath === '/api/account/signup') {
      (async () => {
        try {
          const raw = await readBody(req);
          let body;
          try { body = JSON.parse(raw); } catch { return jsonRes(res, 400, { error: 'body must be valid JSON' }); }
          const { email, username, password, displayName, onboarding } = body || {};
          if (!email || !username || !password) {
            return jsonRes(res, 400, { error: 'email, username, and password are required' });
          }
          const { userId, db, masterKey } = userStore.createUser({ email, username, password, displayName, onboarding });
          const token = newSessionToken();
          SESSIONS.set(token, { userId, db, masterKey });
          return jsonRes(res, 200, { token, userId });
        } catch (e) {
          return jsonRes(res, 400, { error: e.message });
        }
      })();
      return;
    }

    if (req.method === 'POST' && urlPath === '/api/account/login') {
      (async () => {
        try {
          const raw = await readBody(req);
          let body;
          try { body = JSON.parse(raw); } catch { return jsonRes(res, 400, { error: 'body must be valid JSON' }); }
          const { emailOrUsername, password } = body || {};
          if (!emailOrUsername || !password) {
            return jsonRes(res, 400, { error: 'emailOrUsername and password are required' });
          }
          const { userId, db, masterKey } = userStore.login(emailOrUsername, password);
          const token = newSessionToken();
          SESSIONS.set(token, { userId, db, masterKey });
          return jsonRes(res, 200, { token, userId });
        } catch (e) {
          // Deliberately the same message shape for "no such account" and
          // "wrong password" -- distinguishing them lets an attacker
          // enumerate which emails/usernames have accounts.
          return jsonRes(res, 401, { error: 'Invalid credentials.' });
        }
      })();
      return;
    }

    if (req.method === 'POST' && urlPath === '/api/account/logout') {
      const auth = req.headers['authorization'] || '';
      const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
      if (token) SESSIONS.delete(token);
      return jsonRes(res, 200, { ok: true });
    }

    if (req.method === 'GET' && urlPath === '/api/account/me') {
      const session = requireSession(req);
      if (!session) return jsonRes(res, 401, { error: 'Not logged in.' });
      const profile = session.db.table('profile').get(session.userId);
      return jsonRes(res, 200, { profile });
    }

    if (req.method === 'POST' && urlPath === '/api/account/invite/generate') {
      const session = requireSession(req);
      if (!session) return jsonRes(res, 401, { error: 'Not logged in.' });
      try {
        const code = inviteCode.generate(session.userId);
        return jsonRes(res, 200, { code });
      } catch (e) {
        return jsonRes(res, 400, { error: e.message });
      }
    }

    if (req.method === 'POST' && urlPath === '/api/account/invite/redeem') {
      (async () => {
        const session = requireSession(req);
        if (!session) return jsonRes(res, 401, { error: 'Not logged in.' });
        try {
          const raw = await readBody(req);
          let body;
          try { body = JSON.parse(raw); } catch { return jsonRes(res, 400, { error: 'body must be valid JSON' }); }
          const { code } = body || {};
          if (!code) return jsonRes(res, 400, { error: 'code is required' });

          // The inviter may not be an active session on THIS process (they
          // could be on their own device entirely) -- openInviter looks
          // them up by id from the global index and, for this single-
          // process desktop build, expects them to also have an active
          // session here. Multi-device redeem is real peer-sync work
          // (see the architecture doc's WebRTC section) and is explicitly
          // out of scope for this pass -- see eravos-db's README.
          const { coupleId } = inviteCode.redeem(code, {
            inviteeUserId: session.userId,
            inviteeMasterKey: session.masterKey,
            inviteeDb: session.db,
            openInviter: (inviterUserId) => {
              for (const s of SESSIONS.values()) {
                if (s.userId === inviterUserId) return { db: s.db, masterKey: s.masterKey };
              }
              throw new Error('The inviter must be logged in on this same server to redeem right now (single-process build -- see eravos-db README on multi-device sync).');
            },
          });
          return jsonRes(res, 200, { coupleId });
        } catch (e) {
          return jsonRes(res, 400, { error: e.message });
        }
      })();
      return;
    }

    if (req.method === 'GET' && urlPath === '/api/account/couple/chat') {
      const session = requireSession(req);
      if (!session) return jsonRes(res, 401, { error: 'Not logged in.' });
      try {
        const { coupleDb } = inviteCode.openCoupleAsMember(session.userId, session.db, session.masterKey);
        return jsonRes(res, 200, { messages: coupleDb.table('chat_messages').all() });
      } catch (e) {
        return jsonRes(res, 400, { error: e.message });
      }
    }

    if (req.method === 'POST' && urlPath === '/api/account/couple/chat') {
      (async () => {
        const session = requireSession(req);
        if (!session) return jsonRes(res, 401, { error: 'Not logged in.' });
        try {
          const raw = await readBody(req);
          let body;
          try { body = JSON.parse(raw); } catch { return jsonRes(res, 400, { error: 'body must be valid JSON' }); }
          if (!body || !body.text) return jsonRes(res, 400, { error: 'text is required' });
          const { coupleDb } = inviteCode.openCoupleAsMember(session.userId, session.db, session.masterKey);
          const id = coupleDb.table('chat_messages').insert({
            senderUserId: session.userId,
            text: body.text,
            sentAt: new Date().toISOString(),
            emergenceProcessed: false,
          });
          return jsonRes(res, 200, { id });
        } catch (e) {
          return jsonRes(res, 400, { error: e.message });
        }
      })();
      return;
    }

    return jsonRes(res, 404, { error: 'No such account route.' });
  }

  // ── Real mail sending, config-driven -- see server-modules/tiny-smtp-client.js
  // and config/options.json's own smtp.send block for the real scope
  // statement (a relay client, not a from-scratch delivery server).
  if (req.method === 'POST' && urlPath === '/api/mail/send') {
    (async () => {
      try {
        if (!SMTP_CFG.send || !SMTP_CFG.send.host) {
          return jsonRes(res, 503, { error: 'SMTP not configured -- set smtp.send.host in config/options.json (or point it at the dev SMTP server for local testing).' });
        }
        const raw = await readBody(req);
        let body;
        try { body = JSON.parse(raw); } catch { return jsonRes(res, 400, { error: 'body must be valid JSON' }); }
        if (!body.to || !body.subject || !(body.text || body.html)) {
          return jsonRes(res, 400, { error: 'to, subject, and text or html are required' });
        }
        const { sendMail } = require('./server-modules/tiny-smtp-client.js');
        const result = await sendMail(
          { host: SMTP_CFG.send.host, port: SMTP_CFG.send.port || 587, secure: !!SMTP_CFG.send.secure,
            starttls: SMTP_CFG.send.starttls !== false, user: SMTP_CFG.send.user, pass: SMTP_CFG.send.pass },
          { from: SMTP_CFG.send.from || SMTP_CFG.send.user || 'eravos@local', to: body.to, subject: body.subject, text: body.text, html: body.html }
        );
        return jsonRes(res, 200, result);
      } catch (e) {
        console.warn('[eravos] /api/mail/send failed:', e.message);
        return jsonRes(res, 502, { error: e.message });
      }
    })();
    return;
  }

  // Only real when smtp.devServer.enabled -- see main()'s own boot of this.
  if (urlPath === '/api/mail/dev-inbox') {
    if (!devSmtpServer) return jsonRes(res, 503, { error: 'dev SMTP server is not running -- set smtp.devServer.enabled in config/options.json' });
    return jsonRes(res, 200, { inbox: devSmtpServer.getInbox() });
  }

  // Real, live config for callAI()'s Clear-Glass AI Bridge integration
  // (see eravos-kernel.js). Reads process.env dynamically, not cached --
  // when running under electron-main.js, the real token gets set there
  // AFTER this server has already started (guardian-lite boots after
  // the app window), so a value cached at module-load time would always
  // be stale. Running as plain node eravos-serve.js (no Electron, no AI
  // Bridge) correctly reports unavailable -- these env vars are only
  // ever set by electron-main.js's own startAiBridge().
  if (urlPath === '/api/ai-bridge/config') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    return jsonRes(res, 200, {
      available: !!process.env.AI_BRIDGE_TOKEN,
      token: process.env.AI_BRIDGE_TOKEN || null,
      port: process.env.AI_BRIDGE_PORT ? parseInt(process.env.AI_BRIDGE_PORT, 10) : null,
    });
  }

  // Real, live DDNS status -- checkable without reading server logs,
  // same pattern already used above for the AI Bridge.
  if (urlPath === '/api/ddns/status') {
    return jsonRes(res, 200, {
      enabled: !!DDNS_CFG.enabled,
      hostname: DDNS_CFG.hostname || null,
      lastConfirmedIp: lastDdnsConfirmedIp,
      running: !!ddnsHandle,
    });
  }

  // Real gap found while wiring up the invite QR to be phone-scannable:
  // lanIP() already existed (used internally for UPnP mapping) but was
  // never exposed anywhere the Admin UI could read it. publicOrigin was
  // defaulting to a domain (anonymousservers.info) that needs DDNS+a real
  // cert actually working -- useless for "scan this on my phone on the
  // same wifi right now." This gives the Admin tab a real, live LAN
  // address to offer as a one-click quick-option instead of someone
  // having to go find their own IP (ipconfig/ifconfig) and paste it in.
  if (urlPath === '/api/config/lan-ip' && req.method === 'GET') {
    const ip = lanIP();
    return jsonRes(res, 200, {
      lanIP: ip,
      port: PORT,
      suggestion: ip ? ('http://' + ip + ':' + PORT) : null,
      note: ip ? 'Reachable from any device on the same network as this machine.'
               : 'No non-internal IPv4 interface found — is this machine on a network at all?',
    });
  }

  // Real, live-editable public origin -- direct request: a real way to
  // set/change this (a domain, a raw IP, whatever), from the Admin
  // tab, without hand-editing config/options.json. GET reports the
  // real current value (read fresh from disk, not cached at boot --
  // this file can change while the server runs, via the POST below or
  // by hand); POST writes a real, new value to the same real file.
  if (urlPath === '/api/config/public-origin' && req.method === 'GET') {
    let current = null;
    try {
      const raw = fs.readFileSync(path.join(ROOT, 'config', 'options.json'), 'utf8');
      current = JSON.parse(raw).server?.publicOrigin || null;
    } catch (e) { /* real, honest null if the file can't be read -- not a crash */ }
    return jsonRes(res, 200, { publicOrigin: current });
  }
  if (urlPath === '/api/config/public-origin' && req.method === 'POST') {
    readBody(req).then((raw) => {
      let parsed;
      try { parsed = JSON.parse(raw); } catch { return jsonRes(res, 400, { error: 'body must be valid JSON' }); }
      // §1.2 real validation -- an empty string is a real, valid "clear
      // it, fall back to auto-detect" choice; anything else must at
      // least look like a real http(s) origin, not silently accepted
      // garbage that breaks every invite link generated from then on.
      const value = typeof parsed.publicOrigin === 'string' ? parsed.publicOrigin.trim() : null;
      if (value === null) return jsonRes(res, 400, { error: 'body must have a "publicOrigin" string key (empty string clears it)' });
      if (value !== '' && !/^https?:\/\/[^\s]+$/.test(value)) {
        return jsonRes(res, 400, { error: 'publicOrigin must start with http:// or https://, or be an empty string to clear it' });
      }
      try {
        const configPath = path.join(ROOT, 'config', 'options.json');
        const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        cfg.server.publicOrigin = value === '' ? null : value.replace(/\/+$/, ''); // real, consistent no-trailing-slash form

        // Real, direct fix for a real, found bug: saving a new
        // publicOrigin used to only ever change where invite links
        // POINT, never where the relay actually ACCEPTS connections
        // FROM -- confirmed directly, a real connection from
        // http://24.21.239.115 was genuinely rejected by the relay's
        // own allowedOrigins check even after setting publicOrigin to
        // that exact address. Every real host ever set here now stays
        // a real, permanently allowed origin (never removed on a
        // later change) -- direct request: multiple real addresses
        // should all keep working at once, not just whichever one is
        // currently active.
        if (cfg.server.publicOrigin) {
          try {
            const host = new URL(cfg.server.publicOrigin).host;
            const variants = ['http://' + host, 'https://' + host];
            cfg.server.allowedOrigins = cfg.server.allowedOrigins || [];
            variants.forEach((v) => { if (!cfg.server.allowedOrigins.includes(v)) cfg.server.allowedOrigins.push(v); });
          } catch (e) { /* malformed URL already rejected by the real validation above -- this is real defense in depth, not the only guard */ }
        }

        fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2));
        console.log('[eravos] publicOrigin set to ' + (cfg.server.publicOrigin || '(cleared — auto-detect)') + ' via Admin -- allowedOrigins now: ' + JSON.stringify(cfg.server.allowedOrigins));
        return jsonRes(res, 200, { ok: true, publicOrigin: cfg.server.publicOrigin, allowedOrigins: cfg.server.allowedOrigins });
      } catch (e) {
        return jsonRes(res, 500, { error: 'could not write config: ' + e.message });
      }
    }).catch((e) => jsonRes(res, 400, { error: 'could not read request body: ' + e.message }));
    return;
  }

  if (urlPath.startsWith(EMERGENCE_API_PREFIX)) {
    return handleEmergenceApi(req, res, urlPath.slice(EMERGENCE_API_PREFIX.length));
  }

  if (urlPath === '/' || urlPath === '') urlPath = '/index.html';
  const full = path.join(ROOT, urlPath);
  // §9.2 — path traversal is refused, not normalised into something surprising
  if (!full.startsWith(ROOT)) { res.writeHead(403); return res.end('forbidden'); }

  fs.stat(full, (err, st) => {
    if (err || !st.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('not found: ' + urlPath);
    }
    const type = MIME[path.extname(full).toLowerCase()] || 'application/octet-stream';
    const headers = { 'Content-Type': type, 'Cache-Control': 'no-cache' };
    // Recorded media can be large; range support keeps a video message
    // seekable instead of forcing a full download before it plays.
    const range = req.headers.range;
    if (range && /^bytes=/.test(range)) {
      const [s, e] = range.replace('bytes=', '').split('-');
      const start = parseInt(s, 10) || 0;
      const end = e ? parseInt(e, 10) : st.size - 1;
      if (start >= st.size) { res.writeHead(416); return res.end(); }
      headers['Content-Range'] = `bytes ${start}-${end}/${st.size}`;
      headers['Accept-Ranges'] = 'bytes';
      headers['Content-Length'] = end - start + 1;
      res.writeHead(206, headers);
      return fs.createReadStream(full, { start, end }).pipe(res);
    }
    headers['Content-Length'] = st.size;
    headers['Accept-Ranges'] = 'bytes';
    res.writeHead(200, headers);
    fs.createReadStream(full).pipe(res);
  });
}

/* ── boot ───────────────────────────────────────────────────────────── */

async function main() {
  if (PROXY_CONFIG) { console.log(proxyConfig(PROXY_CONFIG, PORT)); return; }

  if (flag('show-config', false)) {
    console.log(JSON.stringify({
      port: PORT, portFrom: PORT_SOURCE,
      bindHost: BIND_HOST,
      singleInstance: SINGLE_INSTANCE, killPrevious: KILL_PREVIOUS,
      lockFile: LOCK_FILE, lock: readLock(),
      relayPath: RELAY_PATH, root: ROOT,
      emergencePath: EMERGENCE_PATH,
      precedence: '--port > ERAVOS_PORT/PORT > config/options.json > 8080',
    }, null, 2));
    return;
  }

  if (PORT < 1024 && process.platform !== 'win32' && typeof process.getuid === 'function' && process.getuid() !== 0) {
    // Stated before the attempt, so the reason is visible even if the bind
    // happens to succeed via setcap — silence here would make a later EACCES
    // look like it came from nowhere.
    console.log('[eravos] port ' + PORT + ' is privileged; binding it needs root or ' +
                'cap_net_bind_service. Attempting anyway — if it fails you will get the fixes, not a stack trace.');
  }

  const claim = claimSingleInstance();
  if (!claim.ok) {
    console.error('[eravos] ' + claim.reason);
    if (claim.fix) console.error('[eravos] ' + claim.fix);
    // Embedded, process.exit() makes the window vanish with no reason on
    // screen. Throw so the caller can show it (§1.2).
    if (require.main !== module) throw Object.assign(new Error(claim.reason), { fix: claim.fix });
    process.exit(1);
  }

  let server, scheme = 'http';
  if (TLS_CERT && TLS_KEY) {
    try {
      server = https.createServer({ cert: fs.readFileSync(TLS_CERT), key: fs.readFileSync(TLS_KEY) }, serveStatic);
      scheme = 'https';
    } catch (e) {
      // §1.2 — refuse rather than silently downgrade. A person who asked for
      // TLS and got plaintext without being told is worse off than one who
      // got an error.
      console.error('[eravos] TLS was requested and the cert/key could not be read: ' + e.message);
      console.error('[eravos] refusing to fall back to plaintext silently. Fix the paths or drop --cert/--key.');
      process.exit(1);
    }
  } else {
    server = http.createServer(serveStatic);
  }

  // The relay, same listener, scoped to /relay. relay-server.js reads
  // ALLOWED_ORIGINS from process.env at require-time -- config file
  // value is applied here, only if the env var isn't already set
  // explicitly (same real precedence as port/emergencePath/upnp).
  if (!process.env.ALLOWED_ORIGINS && Array.isArray(CFG.allowedOrigins) && CFG.allowedOrigins.length) {
    process.env.ALLOWED_ORIGINS = CFG.allowedOrigins.join(',');
  }
  let relayAttached = false;
  try {
    const { WebSocketServer } = require('./co-creation-relay/nano-ws');
    const relay = require('./co-creation-relay/relay-server');
    relay.attach(new WebSocketServer({ server, path: RELAY_PATH }));
    relayAttached = true;
  } catch (e) {
    // §1.2 — the app must not come up pretending the relay is there. If the
    // relay cannot attach, that is the failure that presents as "she just
    // isn't online", so it is stated at boot rather than discovered later.
    console.error('[eravos] RELAY DID NOT ATTACH: ' + e.message);
    console.error('[eravos] the app will serve, but co-creation will not connect.');
  }

  // Emergence, same listener, scoped to /api/emergence. Same §1.2
  // reasoning as the relay above -- stated at boot, not discovered when
  // a health score silently stops moving. Emergence is a genuinely
  // separate, standalone project (see its own README on why it isn't
  // vendored into this repo) -- this requires it from wherever
  // EMERGENCE_PATH points, and degrades cleanly if it isn't there:
  // the app serves fine, computeRelationalHealth() just gets no
  // space-distance signal, exactly as it already handles a fetch
  // failure to a not-running second process.
  try {
    const { createEmergenceLoop } = require(path.join(EMERGENCE_PATH, 'loop.js'));
    emergenceLoop = createEmergenceLoop({ dataDir: path.join(__dirname, 'data', 'emergence') });
    emergenceAttached = true;
  } catch (e) {
    console.error('[eravos] EMERGENCE DID NOT ATTACH: ' + e.message);
    console.error('[eravos] the app will serve, but relational-health will have no space-distance signal.');
    console.error('[eravos] expected emergence/loop.js at: ' + EMERGENCE_PATH + ' (override with --emergence-path or EMERGENCE_PATH)');
  }

  // eravos-db accounts, same graceful-degrade shape as Emergence above:
  // the app and existing solo/peer pairing keep working with no account
  // layer if this doesn't attach, and every /api/account/* route below
  // answers honestly with 503 rather than faking success.
  try {
    ({ UserStore: UserStoreCls, InviteCode: InviteCodeCls } = require(path.join(ACCOUNTS_PATH, 'src', 'index.js')));
    userStore = new UserStoreCls(ACCOUNTS_DATA_DIR);
    inviteCode = new InviteCodeCls(ACCOUNTS_DATA_DIR);
    accountsAttached = true;
  } catch (e) {
    console.error('[eravos] ACCOUNTS (eravos-db) DID NOT ATTACH: ' + e.message);
    console.error('[eravos] the app will serve, but /api/account/* will answer 503.');
    console.error('[eravos] expected eravos-db/src/index.js at: ' + ACCOUNTS_PATH + ' (override with --accounts-path or ACCOUNTS_PATH)');
  }

  // Real, optional dev SMTP catcher -- see server-modules/tiny-smtp-server.js
  // and config/options.json's own smtp.devServer block. Off by default;
  // same graceful-degrade pattern as the relay/Emergence above if it
  // fails to bind (e.g. the port is already taken).
  if (SMTP_CFG.devServer && SMTP_CFG.devServer.enabled) {
    try {
      const { startSmtpServer } = require('./server-modules/tiny-smtp-server.js');
      devSmtpServer = await startSmtpServer({
        port: SMTP_CFG.devServer.port || 2525,
        host: SMTP_CFG.devServer.host || '127.0.0.1',
        dataDir: path.join(__dirname, 'data', 'smtp-dev-inbox'),
      });
      console.log(`[eravos] dev SMTP catcher listening on ${devSmtpServer.host}:${devSmtpServer.port} -- see GET /api/mail/dev-inbox`);
    } catch (e) {
      console.error('[eravos] DEV SMTP SERVER DID NOT START: ' + e.message);
    }
  }

  // Real DDNS boot -- see config/options.json's own ddns block and
  // server-modules/ddns-client.js for the real implementation. Off
  // until ddns.enabled/updateUrl/username/password are actually filled
  // in with your real provider's values (honest gap named in that
  // file's own comment -- this doesn't guess at anonymousservers.info's
  // real provider).
  try {
    const ddnsCfg = DDNS_CFG;
    if (ddnsCfg.enabled) {
      const ddnsClient = require('./server-modules/ddns-client.js');
      const moduleFlow = require('./server-modules/module-flow.js');
      // Real, event-driven integration -- an observer, not ddns-client.js
      // itself knowing publicOrigin exists. Updates an in-memory value
      // only (never rewrites config/options.json on disk -- that file
      // might be hand-edited at the same time, and a background process
      // silently overwriting a config file a person is actively editing
      // is exactly the kind of thing §1.2 warns against).
      moduleFlow.on('ddns:updated', (cause) => {
        lastDdnsConfirmedIp = cause.data.ip;
        console.log('[eravos] DDNS confirmed ' + cause.data.hostname + ' -> ' + cause.data.ip);
      });
      ddnsHandle = ddnsClient.start(ddnsCfg, path.join(__dirname, 'data', 'ddns-state.json'));
      if (ddnsHandle) console.log('[eravos] DDNS updater running for ' + ddnsCfg.hostname + ' every ' + (ddnsCfg.checkIntervalMinutes || 15) + 'm');
    }
  } catch (e) {
    console.error('[eravos] DDNS CLIENT DID NOT START: ' + e.message);
  }

  // Resolves once actually bound, so an embedder (Electron) can wait for a
  // real port rather than guessing when the window may load.
  main.ready = new Promise((resolve, reject) => {
    server.once('listening', () => resolve({ server, port: server.address().port, scheme }));
    server.once('error', reject);
  });

  // ── PORT 80 COMPANION (v0.29.0) ────────────────────────────────────────
  // One process serves one port, so binding 443 for the app leaves nothing
  // on 80 — and the HTTP-01 challenge has no other way to validate. That is
  // invisible for ~80 days and then the cert quietly expires. This is the
  // second listener: the challenge directory, and a redirect for everything
  // else so a person who types the bare hostname still lands on the app.
  //
  // Only when actually serving TLS on another port. On plain http this would
  // be a second listener fighting the first for the same socket.
  let httpRedirectServer = null;
  if (scheme === 'https' && HTTP_REDIRECT_PORT && HTTP_REDIRECT_PORT !== PORT) {
    httpRedirectServer = http.createServer((req, res) => {
      const urlPath = (req.url || '/').split('?')[0];
      if (urlPath.startsWith('/.well-known/acme-challenge/')) {
        const token = urlPath.slice('/.well-known/acme-challenge/'.length);
        // Same traversal guard the main static route uses — a token is a
        // flat filename, never a path.
        if (!token || token.includes('/') || token.includes('\\') || token.includes('..')) {
          res.writeHead(400); return res.end('bad challenge token');
        }
        return fs.readFile(path.join(ACME_CHALLENGE_DIR, token), 'utf8', (err, data) => {
          if (err) { res.writeHead(404); return res.end('no such challenge'); }
          res.writeHead(200, { 'Content-Type': 'text/plain' });
          res.end(data);
        });
      }
      const host = String(req.headers.host || '').split(':')[0];
      const target = 'https://' + host + (PORT === 443 ? '' : ':' + PORT) + (req.url || '/');
      res.writeHead(301, { Location: target });
      res.end();
    });
    httpRedirectServer.on('error', (e) => {
      // §1.2 — named, and NOT fatal. The app on 443 is still fully working;
      // what is broken is renewal, and that deserves saying out loud rather
      // than discovering it when the cert dies.
      console.error('  ⚠ port ' + HTTP_REDIRECT_PORT + ' could not be bound: ' + e.message);
      console.error('    HTTPS is fine, but ACME renewal will FAIL — nothing will answer the challenge.');
      if (e.code === 'EACCES') console.error('    Ports below 1024 need root/CAP_NET_BIND_SERVICE on Linux and macOS (Windows does not).');
    });
    httpRedirectServer.listen(HTTP_REDIRECT_PORT, BIND_HOST);
  }

  server.listen(PORT, BIND_HOST, async () => {
    writeLock();
    const ip = lanIP();
    console.log('');
    console.log('  eravos — one port');
    console.log('  ────────────────────────────────────────────');
    console.log('  app     ' + scheme + '://localhost:' + PORT + '/');
    if (ip) console.log('  lan     ' + scheme + '://' + ip + ':' + PORT + '/');
    console.log('  relay   ' + (scheme === 'https' ? 'wss' : 'ws') + '://…:' + PORT + RELAY_PATH +
                (relayAttached ? '' : '   ⚠ NOT ATTACHED'));
    console.log('  emergence ' + scheme + '://localhost:' + PORT + EMERGENCE_API_PREFIX +
                (emergenceAttached ? '' : '   ⚠ NOT ATTACHED (' + EMERGENCE_PATH + ')'));
    console.log('  health  ' + scheme + '://localhost:' + PORT + '/_health');
    console.log('  port    ' + PORT + '  (from ' + PORT_SOURCE + ')');
    if (claim.killed) console.log('  note    stopped previous instance, pid ' + claim.killed);
    if (claim.cleared) console.log('  note    cleared a stale lock from pid ' + claim.cleared);
    if (BEHIND_PROXY) console.log('  (behind a proxy — it terminates TLS, this stays plaintext on loopback)');
    console.log('');

    if (USE_UPNP) {
      const externalPort = (typeof CFG.upnpExternalPort === 'number') ? CFG.upnpExternalPort : PORT;
      console.log('  upnp    discovering… (external ' + externalPort + ' → internal ' + PORT + ')');
      const r = await upnpMap(PORT, externalPort);
      lastUpnpResult = r;
      if (r.ok) {
        console.log('  upnp    mapped and VERIFIED on ' + r.gateway + ' → ' + r.lan + ':' + r.internalPort + ' (external port ' + r.externalPort + ')');
        if (r.externalIp) {
          const scheme2 = scheme;
          const shown = r.externalPort === 80 ? (scheme2 + '://' + r.externalIp) : (scheme2 + '://' + r.externalIp + ':' + r.externalPort);
          console.log('  upnp    external ip ' + r.externalIp + '  →  she can try: ' + shown);
        }
        if (r.warning) console.log('\n  ⚠ ' + r.warning + '\n');
      } else {
        console.log('  upnp    FAILED — ' + r.reason);
        if (r.fix) console.log('          ' + r.fix);
        if (r.warning) console.log('          ' + r.warning);
      }
    }

    // Real ACME (Let's Encrypt) provisioning -- server-modules/
    // acme-client.js. Only runs when explicitly enabled, when no cert
    // exists yet at the real configured path, and honestly requires
    // port 80 already reachable (the UPnP mapping above, or this
    // server genuinely bound to 80 directly) -- the HTTP-01 challenge
    // has no other way to validate.
    if (ACME_CFG.enabled && ACME_CFG.domain && !fs.existsSync(path.join(ROOT, ACME_CFG.certPath || 'data/tls/cert.pem'))) {
      const certPath = path.join(ROOT, ACME_CFG.certPath || 'data/tls/cert.pem');
      const certKeyPath = path.join(ROOT, ACME_CFG.certKeyPath || 'data/tls/key.pem');
      console.log('');
      console.log('  acme    provisioning a real certificate for ' + ACME_CFG.domain + '…');
      try {
        const { AcmeClient } = require('./server-modules/acme-client.js');
        const client = new AcmeClient({
          accountKeyPath: path.join(ROOT, 'data/tls/account.key'),
          challengeDir: ACME_CHALLENGE_DIR,
          email: ACME_CFG.email || null,
          staging: !!ACME_CFG.staging,
        });
        const result = await client.obtainCertificate(ACME_CFG.domain, certPath, certKeyPath);
        if (result.ok) {
          console.log('  acme    real certificate issued -> ' + result.certPath);
          console.log('  acme    set server.tlsCert/tlsKey to these paths in config/options.json, then restart -- HTTPS needs a fresh boot, not a hot-swap mid-run.');
        } else {
          console.log('  acme    FAILED — ' + result.reason);
        }
      } catch (e) {
        console.log('  acme    FAILED — ' + e.message);
      }
    }
  });

  ['SIGINT', 'SIGTERM'].forEach(sig => process.on(sig, () => {
    releaseLock();
    console.log('\n[eravos] stopped.');
    process.exit(0);
  }));
  process.on('exit', releaseLock);

  server.on('error', e => {
    if (e.code === 'EACCES' && PORT < 1024) {
      // A raw EACCES stack trace tells you nothing useful. This is the one
      // failure a person hits the moment they set port 80, so it names the
      // three real fixes instead of dying (§1.2).
      const ip = lanIP() || '<this machine>';
      console.error('');
      console.error('[eravos] cannot bind port ' + PORT + ' — ports below 1024 need privileges.');
      console.error('');
      console.error('  Three real ways forward, best first:');
      console.error('');
      console.error('  1. Let the ROUTER do it. Set server.port back to 8080 and leave');
      console.error('     upnpExternalPort at 80. The router maps outside-80 to inside-8080,');
      console.error('     your partner still types no port, and nothing runs as root.');
      console.error('');
      console.error('  2. Grant just this one capability, once (Linux):');
      console.error('       sudo setcap cap_net_bind_service=+ep $(which node)');
      console.error('     Narrower than running the whole app as root.');
      console.error('');
      console.error('  3. Put a reverse proxy on 80/443 and keep Eravos on 8080:');
      console.error('       node eravos-serve.js --proxy-config=caddy');
      console.error('     This is also how you get TLS, which port 80 alone does not.');
      console.error('');
      console.error('  Not recommended: running this as root. It is a server that talks to');
      console.error('  the open internet and holds two people\'s private writing.');
      console.error('');
      releaseLock();
      process.exit(1);
    }
    if (e.code === 'EADDRINUSE') {
      // The lock said nothing was running, so this is something ELSE on the
      // port — not another Eravos. Say which, rather than a generic message.
      console.error('[eravos] port ' + PORT + ' is in use by something that is not Eravos ' +
                    '(no lock file claimed it).');
      console.error('[eravos] change it with --port=NNNN, ERAVOS_PORT=NNNN, or ' +
                    'server.port in eravos/config/options.json.');
      releaseLock();
      process.exit(1);
    }
    if (e.code === 'EACCES') {
      // Real, likely failure for port 80/443 specifically -- ports below
      // 1024 need elevated privileges on most systems. Was an unhandled
      // raw stack trace before, same class of unhelpful crash the
      // EADDRINUSE branch above already avoids.
      console.error('[eravos] permission denied binding port ' + PORT + '.');
      if (PORT < 1024) {
        console.error('[eravos] ports below 1024 (including 80) need elevated privileges:');
        console.error('[eravos]   Linux/macOS: sudo node eravos-serve.js --port=' + PORT);
        console.error('[eravos]     (or: sudo setcap \'cap_net_bind_service=+ep\' $(which node)');
        console.error('[eravos]      to allow node itself to bind low ports without sudo)');
        console.error('[eravos]   Windows: run your terminal as Administrator');
        console.error('[eravos] or use a port above 1024 instead (the default, 8080, needs none of this).');
      }
      process.exit(1);
    }
    throw e;
  });
}

if (require.main === module) main();
// ── EMBEDDABLE (v0.28.0) ──────────────────────────────────────────────
// main() is exported so Electron's main process starts the SAME server —
// app, relay, Emergence, pipeline — instead of reimplementing any of it.
// A second boot path would drift from this one the first time either
// changed, and it would drift silently: the desktop build behaving
// differently from the web build is the divergence nobody notices until it
// matters (§16.5). Standalone is unchanged.
module.exports = { main, proxyConfig, upnpMap, lanIP, ssdpDiscover, MIME, RELAY_PATH,
                   loadConfig, readLock, LOCK_FILE, PORT, PORT_SOURCE, main };
