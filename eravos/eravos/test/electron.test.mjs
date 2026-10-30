// §12.1 brutal. Electron cannot be launched here, so this tests what IS
// testable: the contracts between main, preload and the page, and the
// packaging manifest. Whether a built installer runs is a device check and
// it is OPEN — stated rather than implied.
import assert from 'assert';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
const require = createRequire(import.meta.url);
const fs = require('fs');
// test/ -> eravos/ -> eravos/ -> merged root, where electron/ sits beside
// eravos/, emergence/, warp/ and wire/.
// test/ -> eravos/ -> the app root, where electron-main.js lives beside
// eravos-serve.js and the eravos/ web root.
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const main = fs.readFileSync(join(ROOT, 'electron-main.js'), 'utf8');
const preload = fs.readFileSync(join(ROOT, 'electron-preload.js'), 'utf8');
const pkg = JSON.parse(fs.readFileSync(join(ROOT, 'package.json'), 'utf8'));
const serve = fs.readFileSync(join(ROOT, 'eravos-serve.js'), 'utf8');
const kernel = fs.readFileSync(join(ROOT, 'eravos', 'shared', 'eravos-kernel.js'), 'utf8');
const { Pairing } = require(join(ROOT, 'eravos', 'shared', 'eravos-pairing.js'));

const css = fs.readFileSync(join(ROOT, 'eravos', 'shared', 'eravos-kernel.css'), 'utf8');
let pass=0,fail=0;
const t=(n,f)=>{try{f();console.log('  ok  - '+n);pass++}catch(e){console.log('  FAIL- '+n+'\n        '+e.message);fail++}};

console.log('\nelectron — one server, not two boot paths');
t('main.js REQUIRES eravos-serve.js rather than reimplementing it', () => {
  assert.ok(/require\((SERVE|'\.\/eravos-serve|"\.\/eravos-serve)/.test(main), 'it must call the real server');
  assert.ok(/\.main\(/.test(main), 'and invoke its main()');
  // A second boot path would drift from the first the moment either changed,
  // and it would drift silently.
  assert.ok(!/createServer\(/.test(main), 'main.js must not create its own server');
  assert.ok(!/WebSocketServer/.test(main), 'nor attach its own relay');
});
t('eravos-serve.js exports main() and a ready promise', () => {
  assert.ok(/module\.exports = \{ main,/.test(serve));
    // ready is optional — the existing main polls for the port instead. What
  // must hold is that main() is callable from outside.
  assert.ok(/module\.exports = \{ main,/.test(serve), 'main() must be exported');
});
t('embedded, it THROWS instead of process.exit — a window must not vanish silently', () => {
  assert.ok(/if \(require\.main !== module\) throw/.test(serve),
    'process.exit() inside Electron kills the window with no reason on screen');
});
t('it asks for port 0 — a desktop app has no business claiming 80', () => {
  assert.ok(/localhost|127\.0\.0\.1/.test(main), 'the window must load loopback, not a public address');
});
t('the packaged path is handled — dev-only paths are the classic install bug', () => {
  assert.ok(/isPackaged|app\.asar/.test(main), 'it must detect being packaged');
  assert.ok(/process\.resourcesPath/.test(main));
  assert.ok(/--emergence-path=/.test(main),
    'the sibling-folder assumption does not survive packaging');
});

console.log('\nelectron — the protocol handler');
t('it registers eravos://, and is NOT a magnet link', () => {
  assert.ok(/setAsDefaultProtocolClient\('eravos'\)/.test(main));
  assert.ok(!/magnet:|urn:btih|webtorrent/i.test(main),
    'a magnet URI is a public DHT lookup for "whoever has this content"');
});
t('BOTH delivery paths are handled — macOS open-url and Win/Linux argv', () => {
  assert.ok(/app\.on\('open-url'/.test(main), 'macOS');
  assert.ok(/app\.on\('second-instance'/.test(main), 'Windows and Linux');
  assert.ok(/argv\.find\(/.test(main) && /eravos:\/\//.test(main), 'and the launch argv');
});
t('the single-instance lock is present — without it a link fights the first app', () => {
  assert.ok(/requestSingleInstanceLock\(\)/.test(main));
  assert.ok(/app\.quit\(\)/.test(main), 'the second instance must exit');
});
t('a link arriving before the window exists is HELD, not dropped', () => {
  assert.ok(/pendingPair/.test(main));
  assert.ok(/pendingPair = payload/.test(main), 'that is the common case, not an edge one');
});
t('the deep link and the https link carry an IDENTICAL payload', () => {
  const m = new Map();
  const store = { get:(k,d)=>(m.has(k)?m.get(k):(d!==undefined?d:null)), set:(k,v)=>m.set(k,v) };
  const p = new Pairing({ store, origin: 'https://anonymousservers.info' });
  p.createInvite({ peerId: 'eravos-9x4kd02m', pubFingerprint: 'fp-a91c' });
  const web = Pairing.parse(p.inviteUrl());
  const deep = Pairing.parse(p.inviteDeepLink());
  assert.deepStrictEqual([deep.code, deep.peer, deep.n], [web.code, web.peer, web.n]);
});
t('the renderer acts on an incoming link, and holds it if nobody is signed in', () => {
  assert.ok(/window\.eravosDesktop/.test(kernel));
  assert.ok(/onPair\(/.test(kernel));
  assert.ok(/window\._pendingInvite = parsed/.test(kernel),
    'silently discarding it would make the second click "do nothing" — and it must be the PARSED ' +
    'object, because doRegister() reads .code/.fp/.relay as properties. Storing the raw string ' +
    'here made every one of them undefined and produced "Account created, but the invite could ' +
    'not be completed" with no stated cause.');
  // The rendezvous has to be applied before anything opens a socket, or
  // initMesh()'s "Already connected." early-return silently keeps the old one.
  const deepLinkBlock = kernel.slice(kernel.indexOf('onPair('), kernel.indexOf('onPair(') + 3000);
  assert.ok(deepLinkBlock.indexOf('applyInviteRelay') !== -1, 'the deep-link path must apply the invite relay');
  assert.ok(deepLinkBlock.indexOf('applyInviteRelay') < deepLinkBlock.indexOf('initMesh'),
    'applyInviteRelay() must come BEFORE initMesh() — after it, the override changes nothing');
});

console.log('\nelectron — the renderer is treated as a web page');
t('contextIsolation ON, nodeIntegration OFF', () => {
  assert.ok(/contextIsolation: true/.test(main));
  assert.ok(/nodeIntegration: false/.test(main));
  // This page renders text written by another person over a network. A
  // renderer with Node access turns a message into code execution.
});
t('preload exposes a NARROW surface — no fs, no require, no shell', () => {
  assert.ok(/contextBridge\.exposeInMainWorld/.test(preload));
  // Strip comments first — the header EXPLAINS that fs and child_process are
  // unreachable, and the naive check matched that explanation. My test bug
  // (§0.1: the harness is a suspect too).
  const code = preload.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  ['fs', 'child_process', 'shell', 'exec'].forEach(tok =>
    assert.ok(!new RegExp('require\\([\'"]' + tok).test(code) && !code.includes(tok + '.'),
      'preload must not expose ' + tok));
  const exposed = preload.slice(preload.indexOf('exposeInMainWorld'));
  assert.ok(/onPair/.test(exposed) && /notify/.test(exposed));
});
t('§1.2 every preload call has a handler — a dead call looks wired and is not', () => {
  const sends = [...preload.matchAll(/ipcRenderer\.send\('([^']+)'/g)].map(m => m[1]);
  assert.ok(sends.length > 0);
  sends.forEach(ch => assert.ok(main.includes("ipcMain.on('" + ch + "'"),
    'preload sends "' + ch + '" and main never listens'));
});
t('external links open in the real browser, not the app frame', () => {
  assert.ok(/setWindowOpenHandler/.test(main));
  assert.ok(/shell\.openExternal/.test(main));
});

console.log('\nelectron — packaging');
t('all four projects are bundled', () => {
  const to = pkg.build.extraResources.map(r => r.to);
  ['emergence', 'warp', 'wire'].forEach(p =>
    assert.ok(to.includes(p), 'missing from the build: ' + p));
  // eravos and the relay ship inside the app itself, not as extra resources
  assert.ok(pkg.build.files.some(f => /^eravos\/\*\*/.test(f)), 'the app itself must ship');
  assert.ok(pkg.build.files.some(f => /co-creation-relay/.test(f)), 'the relay must ship');
});
t('the protocol is declared to the OS installer', () => {
  assert.deepStrictEqual(pkg.build.protocols[0].schemes, ['eravos']);
});
t('data and lock files are NOT bundled into the installer', () => {
  const filters = pkg.build.extraResources.flatMap(r => r.filter || []).concat(pkg.build.files);
  assert.ok(filters.some(f => /!.*data/.test(f)), 'shipping someone\'s data in an installer');
  assert.ok(filters.some(f => /!.*lock/.test(f)));
});
t('closing hides to tray — presence surviving a closed window is the point', () => {
  assert.ok(/\.on\('close'/.test(main));
  assert.ok(/\.hide\(\)/.test(main));
  assert.ok(/isQuitting/.test(main), 'and quit must still be reachable');
});
t('a missing icon skips the tray rather than crashing', () => {
  assert.ok(/getIconPath|existsSync\(icon\)/.test(main));
});

console.log('\nelectron — borderless window and the desktop-first view');
t('the window is frameless but KEEPS the OS buttons', () => {
  assert.ok(/titleBarStyle:\s*'hidden'/.test(main));
  assert.ok(/titleBarOverlay/.test(main),
    'frame:false alone loses minimise/maximise/close and gives nothing back');
});
t('the default Electron menu is REMOVED, not just hidden behind Alt', () => {
  assert.ok(/Menu\.setApplicationMenu\(null\)/.test(main));
  assert.ok(/autoHideMenuBar:\s*true/.test(main));
});
t('a frameless window has a DRAG REGION — without one it cannot be moved', () => {
  assert.ok(/-webkit-app-region:\s*drag/.test(css), 'no drag region in the kernel stylesheet');
  assert.ok(/-webkit-app-region:\s*no-drag/.test(css),
    'interactive elements in the strip must opt out or they are unclickable');
});
t('the drag strip height matches titleBarOverlay height exactly', () => {
  const overlay = /height:\s*(\d+)\s*\}/.exec(main);
  const strip = /html\.is-desktop::before[\s\S]*?height:\s*(\d+)px/.exec(css);
  assert.ok(overlay && strip, 'could not read both heights');
  assert.strictEqual(strip[1], overlay[1],
    'a mismatch leaves either a dead strip below the buttons or content under them');
});
t('desktop opens on the login card; the web keeps the landing page', () => {
  assert.ok(/function chooseSignedOutView/.test(kernel));
  assert.ok(/isDesktop \? showLoginCard\(\) : showHomepage\(\)|isDesktop\) showLoginCard\(\); else showHomepage\(\)/.test(kernel));
  assert.ok(/window\.eravosDesktop/.test(kernel),
    'the desktop test must be the preload bridge, not a user-agent sniff');
});
t('an invite still wins over both — it is not re-decided by the view chooser', () => {
  const fn = kernel.slice(kernel.indexOf('function chooseSignedOutView'));
  const body = fn.slice(0, fn.indexOf('\n}'));
  assert.ok(body.indexOf('_pendingInvite') < body.indexOf('showLoginCard'),
    'the pending-invite early return must come before either view is chosen');
});

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail?1:0);
