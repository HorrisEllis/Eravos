// §12.1 brutal. Three separate breaks made the create-account path INVISIBLE
// rather than broken-looking, which is why it survived. These are the
// regressions that keep each one fixed.
import assert from 'assert';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
const require = createRequire(import.meta.url);
const fs = require('fs');
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { Pairing } = require(join(ROOT, 'shared', 'eravos-pairing.js'));

const html = fs.readFileSync(join(ROOT, 'index.html'), 'utf8');
const kernel = fs.readFileSync(join(ROOT, 'shared', 'eravos-kernel.js'), 'utf8');
const adminPane = fs.readFileSync(join(ROOT, 'tabs', 'settings', 'subtabs', 'admin.html'), 'utf8');
const mk = () => { const m=new Map(); return {get:(k,d)=>(m.has(k)?m.get(k):(d!==undefined?d:null)),set:(k,v)=>m.set(k,v)}; };

let pass=0,fail=0;
const t=(n,f)=>{try{f();console.log('  ok  - '+n);pass++}catch(e){console.log('  FAIL- '+n+'\n        '+e.message);fail++}};

console.log('\nregistration — every handler the markup calls must EXIST');
t('BREAK 1 — the admin toggle called setRegistrationEnabled(), which was never defined', () => {
  assert.ok(/onchange="setRegistrationEnabled/.test(adminPane), 'the toggle must still call it');
  assert.ok(/function setRegistrationEnabled/.test(kernel),
    'and it must exist — onchange threw a ReferenceError while the checkbox flipped visually');
});
t('BREAK 2 — applyRegState() looked for #register-tab-btn, which did not exist', () => {
  assert.ok(/getElementById\('register-tab-btn'\)/.test(kernel));
  assert.ok(/id="register-tab-btn"/.test(html), 'the button it toggles must be in the markup');
});
t('BREAK 3 — nothing ever showed the register form', () => {
  assert.ok(/function showRegisterForm/.test(kernel));
  assert.ok(/onclick="showRegisterForm\(\)"/.test(html), 'something must call it');
  assert.ok(/function showLoginForm/.test(kernel), 'and there must be a way back');
});
t('EVERY handler referenced on the login screen is defined', () => {
  const loginScreen = html.slice(html.indexOf('<div id="login-screen">'), html.indexOf('end login-screen'));
  // `if` is a keyword, not a handler — onkeydown="if(event.key==='Enter')…"
  // matched the naive regex. My test bug, not a code one (§0.1: the harness
  // is a suspect too).
  const KEYWORDS = ['if','for','while','return','switch','typeof','void','delete'];
  const handlers = [...loginScreen.matchAll(/on(?:click|change|keydown)="\s*([a-zA-Z_$][\w$]*)\s*\(/g)]
    .map(m => m[1]).filter(fn => !KEYWORDS.includes(fn));
  assert.ok(handlers.length > 3, 'expected several handlers, got ' + handlers.length);
  const missing = [...new Set(handlers)].filter(fn =>
    !new RegExp('function\\s+' + fn + '\\b|' + fn + '\\s*[:=]\\s*(async\\s*)?function|\\b' + fn + '\\s*[,}]').test(kernel + html));
  assert.deepStrictEqual(missing, [], 'handlers called but never defined: ' + missing.join(', '));
});
t('applyRegState is callable, not a one-shot IIFE', () => {
  assert.ok(/function applyRegState/.test(kernel));
  assert.ok(/window\.applyRegState = applyRegState/.test(kernel),
    'setRegistrationEnabled must be able to re-run it');
});
t('the register form already had everything it needed', () => {
  ['r-name','r-email','r-pass','r-mode','r-invite-input','reg-invite-banner','reg-error']
    .forEach(id => assert.ok(html.includes('id="' + id + '"'), 'missing field: ' + id));
  assert.ok(/onclick="doRegister\(\)"/.test(html));
  assert.ok(/async function doRegister/.test(kernel));
});
t('registration defaults to CLOSED — an open door on a public tunnel is not a default', () => {
  assert.ok(/DB\.get\('eravors_reg_enabled', false\)/.test(kernel),
    'the default must be false, not true');
});

console.log('\nregistration — the invite actually links the two accounts');
t('the FULL LINK carries the peer id; the bare 8-char code cannot', () => {
  const james = new Pairing({ store: mk(), origin: 'https://anonymousservers.info' });
  const inv = james.createInvite({ peerId: 'eravos-9x4kd02m' });
  const parsed = Pairing.parse(inv.url);
  assert.strictEqual(parsed.peer, 'eravos-9x4kd02m');
  // A code with no peer id cannot pair — which is why the paste field asks
  // for the link, not the eight characters.
  assert.strictEqual(Pairing.parse(inv.code), null, 'a bare code must not look pairable');
});
t('registering with an invite creates a REQUEST, not a pairing', () => {
  const james = new Pairing({ store: mk(), origin: 'https://anonymousservers.info' });
  const inv = james.createInvite({ peerId: 'eravos-9x4kd02m' });
  const her = new Pairing({ store: mk(), origin: 'https://anonymousservers.info' });
  const r = her.scan(Pairing.parse(inv.url), { peerId: 'eravos-7ba1qq83', name: 'Anjali' });
  assert.strictEqual(r.state, 'requested');
  assert.strictEqual(her.state().paired, false, 'creating an account must not pair her unilaterally');
});
t('his confirm is what pairs, and the code is then spent', () => {
  const james = new Pairing({ store: mk(), origin: 'https://anonymousservers.info' });
  const inv = james.createInvite({ peerId: 'eravos-9x4kd02m' });
  assert.strictEqual(james.receiveRequest({ code: inv.code, myPeerId: 'eravos-7ba1qq83', myName: 'Anjali' }).ok, true);
  assert.strictEqual(james.confirm({ name: 'Anjali' }).state, 'paired');
  assert.strictEqual(james.receiveRequest({ code: inv.code, myPeerId: 'x' }).ok, false, 'single use');
});
t('doRegister sets role=partner when there is a pending invite', () => {
  // Without the role the pairing state machine is correct and the ACCOUNT is
  // not — role==='partner' is what routes it into the partner path at all.
  assert.ok(/window\._pendingInvite \? 'partner' : undefined/.test(kernel));
});
t('doRegister actually calls scan() and emits the request', () => {
  assert.ok(/eravosPairing\.scan\(window\._pendingInvite/.test(kernel),
    'without this the invite is detected and never acted on');
  assert.ok(/emitSync\(\s*'pairing:request'/.test(kernel),
    'scan() is local only — something must put it on the wire');
});

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail?1:0);
