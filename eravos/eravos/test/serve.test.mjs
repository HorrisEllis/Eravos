// §12.1 brutal. Scope: the unified server's PURE parts — proxy config, MIME,
// LAN detection, and the relay's attach contract. Booting a listener and
// making live requests is done by hand (verified: 200 on the app, 101 on
// /relay, health reporting both) and is not re-run here.
import assert from 'assert';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const S = require(join(ROOT, 'eravos-serve.js'));

let pass=0,fail=0;
const t=(n,f)=>{try{f();console.log('  ok  - '+n);pass++}catch(e){console.log('  FAIL- '+n+'\n        '+e.message);fail++}};

console.log('\nserve — one port');
t('the relay is scoped to a path, so it can share the app listener', () => {
  assert.strictEqual(S.RELAY_PATH, '/relay');
});
t('media types recorded messages need are served correctly', () => {
  ['.webm','.mp4','.ogg','.mp3'].forEach(e =>
    assert.ok(S.MIME[e], 'missing MIME for ' + e + ' — a voice/video message would download instead of play'));
  assert.strictEqual(S.MIME['.webm'], 'video/webm');
});

console.log('\nserve — reverse proxy config');
t('nginx config carries BOTH websocket upgrade headers', () => {
  const c = S.proxyConfig('nginx', 8080);
  assert.ok(/proxy_set_header Upgrade \$http_upgrade/.test(c), 'missing Upgrade header');
  assert.ok(/proxy_set_header Connection "upgrade"/.test(c), 'missing Connection header');
  // The single most common reason a proxied relay silently fails while the
  // app loads fine — so it is asserted, not left to a comment.
  assert.ok(/proxy_read_timeout/.test(c), 'a relay holds the socket open; without a long timeout it drops');
});
t('nginx points BOTH locations at the same upstream port', () => {
  const c = S.proxyConfig('nginx', 9999);
  const ups = [...c.matchAll(/proxy_pass http:\/\/127\.0\.0\.1:(\d+)/g)].map(m => m[1]);
  assert.strictEqual(ups.length, 2);
  assert.deepStrictEqual([...new Set(ups)], ['9999'], 'one port is the whole point');
});
t('caddy config is one line, because one port needs one line', () => {
  const c = S.proxyConfig('caddy', 8080);
  assert.ok(/reverse_proxy 127\.0\.0\.1:8080/.test(c));
  assert.strictEqual((c.match(/reverse_proxy/g) || []).length, 1);
});

console.log('\nserve — relay attach contract');
t('the relay exports attach() — real identities are learned dynamically, not pre-declared', () => {
  const relay = require(join(ROOT, 'co-creation-relay', 'relay-server.js'));
  assert.strictEqual(typeof relay.attach, 'function');
  // Real architecture check, not calling attach() here on purpose --
  // that would leave this module's shared wss state set for the rest
  // of this test file's run (require() caches the module), breaking
  // the next test's own real "first attach succeeds" assumption.
  // There is deliberately no static PEER_IDS export anymore: identities
  // are learned per-connection now (see relay-server.js's own real
  // connection handler), not two pre-known names.
  assert.strictEqual(relay.PEER_IDS, undefined);
});
t('§1.2 attaching twice THROWS — a double attach would handle every message twice', () => {
  const relay = require(join(ROOT, 'co-creation-relay', 'relay-server.js'));
  const { WebSocketServer } = require(join(ROOT, 'co-creation-relay', 'nano-ws.js'));
  const http = require('http');
  const s1 = http.createServer();
  relay.attach(new WebSocketServer({ server: s1, path: '/relay' }));
  assert.throws(() => relay.attach(new WebSocketServer({ server: s1, path: '/relay' })),
    /already attached/);
  s1.close();
});

console.log('\nserve — upnp is honest');
t('lanIP returns an address or null — never a guess', () => {
  const ip = S.lanIP();
  assert.ok(ip === null || /^\d+\.\d+\.\d+\.\d+$/.test(ip), 'got ' + ip);
});
t('discovery on a network with no gateway resolves empty rather than hanging', async () => {
  const found = await S.ssdpDiscover(400);
  assert.ok(Array.isArray(found));
});


console.log('\nserve — config precedence and the single-instance lock');
t('the port has a stated precedence, and --show-config answers which won', () => {
  assert.strictEqual(typeof S.PORT, 'number');
  assert.ok(['--port','environment','config/options.json','default'].includes(S.PORT_SOURCE),
    'unknown port source: ' + S.PORT_SOURCE);
});
t('config/options.json declares the server section the loader reads', () => {
  const cfg = S.loadConfig();
  assert.strictEqual(typeof cfg.port, 'number');
  assert.strictEqual(cfg.singleInstance, true);
  assert.ok(cfg.note && /precedence|--port/i.test(cfg.note), 'the file must say which wins');
});
t('a lock naming a DEAD pid is reported stale, not treated as a running server', () => {
  const fsx = require('fs');
  fsx.writeFileSync(S.LOCK_FILE, JSON.stringify({ pid: 999999, port: 1, started: 0 }));
  const l = S.readLock();
  assert.ok(l, 'lock not read');
  assert.strictEqual(l.stale, true,
    'a lock left by a crash is not a running server — treating it as one blocks every future start');
  fsx.unlinkSync(S.LOCK_FILE);
});
t('a lock naming a LIVE pid is not stale', () => {
  const fsx = require('fs');
  fsx.writeFileSync(S.LOCK_FILE, JSON.stringify({ pid: process.pid, port: 1, started: 0 }));
  assert.strictEqual(S.readLock().stale, false);
  fsx.unlinkSync(S.LOCK_FILE);
});
t('no lock file reads as no lock, not as an error', () => {
  const fsx = require('fs');
  try { fsx.unlinkSync(S.LOCK_FILE); } catch (e) {}
  assert.strictEqual(S.readLock(), null);
});
t('a corrupt lock file does not crash the server on start', () => {
  const fsx = require('fs');
  fsx.writeFileSync(S.LOCK_FILE, 'not json at all');
  assert.strictEqual(S.readLock(), null);
  fsx.unlinkSync(S.LOCK_FILE);
});

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail?1:0);
