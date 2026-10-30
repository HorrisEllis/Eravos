// §12.1 brutal. §12.4 the real invariant, not the happy path.
//
// The two ways in, end to end, as two SEPARATE Pairing instances with
// separate stores — the way the two devices actually are. Every earlier
// pairing test exercised one side; this one asserts the handshake completes
// across both, and that what crosses between them is reachable.
import assert from 'assert';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { Pairing } = require('../shared/eravos-pairing.js');

function mkStore(){ const m=new Map(); return {get:(k,d)=>(m.has(k)?m.get(k):(d!==undefined?d:null)),set:(k,v)=>m.set(k,v)}; }
let CLOCK = 1_700_000_000_000;
const dev = (origin) => new Pairing({ store: mkStore(), now: () => CLOCK,
  rng: (() => { let s = Date.now()&0x7fffffff; return () => { s = (s*1103515245+12345)&0x7fffffff; return s/0x7fffffff; }; })(),
  rngStrong: true, origin });

const ORIGIN = 'https://eravos.anonymousservers.info';
const RELAY  = 'wss://eravos.anonymousservers.info/relay';
const JAMES  = { peerId: 'eravos-9x4kd02m', pubFingerprint: 'fp-a91c', relay: RELAY };
const ANJALI = { peerId: 'eravos-7ba1qq83', name: 'Anjali' };

let pass=0,fail=0;
const t=(n,f)=>{try{CLOCK=1_700_000_000_000;f();console.log('  ok  - '+n);pass++}catch(e){console.log('  FAIL- '+n+'\n        '+e.message);fail++}};

console.log('\npairing e2e — she scans the QR');
t('QR -> parse -> scan -> receive -> confirm, both sides land PAIRED', () => {
  const james = dev(ORIGIN), anjali = dev(ORIGIN);
  const minted = james.createInvite(JAMES);
  assert.strictEqual(minted.relayReachable, true, 'refusing to test a code the app itself would warn about');

  // What the QR actually encodes.
  const scanned = Pairing.parse(minted.url);
  assert.strictEqual(scanned.relay, RELAY, 'the QR must carry the rendezvous');

  // Her device.
  const req = anjali.scan(scanned, ANJALI);
  assert.strictEqual(req.relayUsable, true);
  assert.strictEqual(anjali.state().state, 'requested');
  assert.strictEqual(anjali.state().paired, false, 'scanning must not pair');

  // Across the relay, to his device.
  const recv = james.receiveRequest({ code: scanned.code, myPeerId: ANJALI.peerId, myName: ANJALI.name });
  assert.strictEqual(recv.ok, true, recv.reason);
  const done = james.confirm({ name: ANJALI.name });
  assert.strictEqual(done.state, 'paired');
  assert.strictEqual(james.state().partner.peerId, ANJALI.peerId);
});

console.log('\npairing e2e — she types the code during sign-up');
t('the DEEP LINK form carries the rendezvous too', () => {
  const james = dev(ORIGIN);
  james.createInvite(JAMES);
  const parsed = Pairing.parse(james.inviteDeepLink());
  assert.strictEqual(parsed.relay, RELAY);
  assert.strictEqual(dev(ORIGIN).scan(parsed, ANJALI).relayUsable, true);
});
t('the pasted DOT-JOINED code is the same payload, and still pairs', () => {
  const james = dev(ORIGIN);
  const minted = james.createInvite(JAMES);
  // Exactly what the sign-up field accepts: the body of the link, pasted.
  const pasted = minted.url.split('#pair=')[1];
  const parsed = Pairing.parse(decodeURIComponent(pasted));
  assert.strictEqual(parsed.relay, RELAY);

  const anjali = dev(ORIGIN);
  anjali.scan(parsed, ANJALI);
  assert.strictEqual(james.receiveRequest({ code: parsed.code, myPeerId: ANJALI.peerId, myName: 'Anjali' }).ok, true);
  assert.strictEqual(james.confirm({ name: 'Anjali' }).state, 'paired');
});
t('THE BARE 8-CHAR CODE IS REFUSED — it names nobody and reaches nothing', () => {
  const james = dev(ORIGIN);
  const code = james.createInvite(JAMES).code;
  assert.strictEqual(code.length, 8);
  assert.strictEqual(Pairing.parse(code), null,
    'a bare code must not parse — it carries no peer id and no relay, so it cannot pair');
});

console.log('\npairing e2e — the failure that used to be silent');
t('a code minted from a LOCALHOST origin is caught before it is sent', () => {
  // Exactly the state seen on screen: link right, relay wrong.
  const james = dev(ORIGIN);
  const minted = james.createInvite({ ...JAMES, relay: 'ws://localhost/relay' });
  assert.ok(minted.url.startsWith(ORIGIN), 'the LINK is fine — that is what made this invisible');
  assert.strictEqual(minted.relayReachable, false, 'the RELAY is not, and that must be said');
  assert.ok(/THEIR machine/.test(minted.relayWarning));
  assert.strictEqual(james.health().inviteRelayReachable, false);

  // And her side refuses to adopt it rather than connecting to herself.
  const anjali = dev(ORIGIN);
  assert.strictEqual(anjali.scan(Pairing.parse(minted.url), ANJALI).relay, null);
});
t('both sides agree on ONE relay — that is the whole point of the field', () => {
  const james = dev(ORIGIN);
  james.createInvite(JAMES);
  const anjali = dev('http://localhost:4020');       // her desktop build, her own origin
  const r = anjali.scan(Pairing.parse(james.inviteUrl()), ANJALI);
  assert.strictEqual(r.relay, RELAY,
    'she must adopt HIS relay — deriving her own is the bug this exists to close');
});

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail?1:0);
