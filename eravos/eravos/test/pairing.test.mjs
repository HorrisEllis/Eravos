// §12.1 brutal. §12.2 informative failure.
import assert from 'assert';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { Pairing, PROMPT_KEY } = require('../shared/eravos-pairing.js');

function mkStore(){ const m=new Map(); return {_m:m,get:(k,d)=>(m.has(k)?m.get(k):(d!==undefined?d:null)),
  set:(k,v)=>m.set(k,v),keys:()=>[...m.keys()]}; }
let CLOCK = 1_700_000_000_000;
const rig = (o={}) => new Pairing({ store: o.store || mkStore(), now: () => CLOCK,
  rng: (() => { let s = o.seed || 42; return () => { s = (s*1103515245+12345)&0x7fffffff; return s/0x7fffffff; }; })(),
  rngStrong: true, origin: 'https://eravos.test', ...o });
// Opaque ids, because that is what the app now mints. The first draft of
// this fixture used 'peer-james'/'fp-james' and the payload test caught it —
// which turned out to be a REAL leak, not a fixture artifact: the app was
// minting `eravos-james-fixed`, so every pairing code announced who made it.
const ME  = { peerId: 'eravos-9x4kd02m', pubFingerprint: 'fp-a91c', accountKey: 'james' };
const HER = { peerId: 'eravos-7ba1qq83', name: 'Anjali', accountKey: 'anjali' };

let pass=0,fail=0;
const t=(n,f)=>{try{CLOCK=1_700_000_000_000;f();console.log('  ok  - '+n);pass++}catch(e){console.log('  FAIL- '+n+'\n        '+e.message);fail++}};

console.log('\npairing — solo is the default and a complete state');
t('a fresh install is SOLO, with no invented partner', () => {
  const p = rig();
  assert.strictEqual(p.state().state, 'solo');
  assert.strictEqual(p.state().solo, true);
  assert.strictEqual(p.state().partner, null);
});
t('the invite prompt appears once and then never again', () => {
  const store = mkStore();
  const p = rig({ store });
  assert.strictEqual(p.shouldPromptInvite(), true);
  p.dismissPrompt('riding-solo');
  assert.strictEqual(p.shouldPromptInvite(), false);
  assert.strictEqual(rig({ store }).shouldPromptInvite(), false, 'must stay dismissed across a reload');
});
t('"riding solo" and "skip" are both permanent, and which was chosen is kept', () => {
  const store = mkStore();
  rig({ store }).dismissPrompt('riding-solo');
  assert.strictEqual(store.get(PROMPT_KEY).how, 'riding-solo');
});
t('an already-paired install is never prompted', () => {
  const p = rig();
  p.createInvite(ME); p.receiveRequest({ code: p.state().invite.code, myPeerId: HER.peerId, myName: 'Anjali' });
  p.confirm({ name: 'Anjali' });
  assert.strictEqual(p.shouldPromptInvite(), false);
});

console.log('\npairing — the code');
t('a code is generated, and the URL round-trips through parse()', () => {
  const p = rig();
  const r = p.createInvite(ME);
  assert.strictEqual(r.code.length, Pairing.CODE_LEN);
  const parsed = Pairing.parse(r.url);
  assert.strictEqual(parsed.code, r.code);
  assert.strictEqual(parsed.peer, ME.peerId);
});
t('the alphabet excludes characters that are misread off a screen', () => {
  const p = rig();
  for (let i=0;i<40;i++) { p.revokeInvite(); const c = p.createInvite(ME).code;
    assert.ok(!/[O0I1L]/.test(c), 'ambiguous character in ' + c); }
});
t('the payload carries NOTHING about the person', () => {
  const p = rig();
  // The rendezvous is an address, and an address is allowed. A NAME is not —
  // that distinction is the whole point of v2, so the fixture uses a relay
  // host that would fail this test if the two were ever conflated.
  p.createInvite({ ...ME, relay: 'wss://anonymousservers.info/relay' });
  const pl = p.invitePayload();
  const json = JSON.stringify(pl).toLowerCase();
  ['james','anjali','password','lovergirl','name'].forEach(w =>
    assert.ok(!json.includes(w), 'payload leaks "' + w + '": ' + json));
  assert.deepStrictEqual(Object.keys(pl).sort(), ['code','exp','fp','n','peer','r','v']);
  assert.strictEqual(pl.v, 2, 'a payload carrying a rendezvous is v2');
  assert.strictEqual(p.health().peerIdLeaksIdentity, false);
});
t('§1.2 a peerId that DOES contain the account key is flagged, not passed silently', () => {
  const p = rig();
  p.createInvite({ peerId: 'eravos-james-fixed', accountKey: 'james' });
  assert.strictEqual(p.health().peerIdLeaksIdentity, true);
  assert.strictEqual(p.health().leakyPeerId, 'eravos-james-fixed');
});
t('a code without a peerId is refused — it would pair nobody', () => {
  assert.throws(() => rig().createInvite({}), /peerId is required/);
});
t('codes EXPIRE, and an expired one is reported as expired', () => {
  const p = rig();
  p.createInvite(ME);
  assert.strictEqual(p.state().invite.expired, false);
  CLOCK += 25 * 3600 * 1000;
  assert.strictEqual(p.state().invite.expired, true);
  assert.strictEqual(p.health().status, 'invite-expired');
});
t('scanning an expired code is refused, and says to ask for a fresh one', () => {
  const p = rig();
  const r = p.createInvite(ME);
  const payload = p.invitePayload();
  CLOCK += 25 * 3600 * 1000;
  const her = rig();
  assert.throws(() => her.scan(payload, HER), /expired.*fresh one/s);
});
t('revoking kills a code already sent, immediately', () => {
  const p = rig();
  const code = p.createInvite(ME).code;
  p.revokeInvite();
  assert.strictEqual(p.state().invite, null);
  assert.strictEqual(p.state().state, 'solo');
  assert.strictEqual(p.receiveRequest({ code, myPeerId: HER.peerId }).ok, false);
});

console.log('\npairing — acceptance is two-sided');
t('SCANNING DOES NOT PAIR — it creates a request the other side confirms', () => {
  const her = rig();
  const issuer = rig();
  issuer.createInvite(ME);
  const r = her.scan(issuer.invitePayload(), HER);
  assert.strictEqual(r.state, 'requested');
  assert.strictEqual(her.state().paired, false, 'the scanner must NOT be paired yet');
  assert.ok(/does not pair anyone/.test(r.note));
});
t('confirm() is what pairs, and only with a pending request', () => {
  const p = rig();
  p.createInvite(ME);
  assert.throws(() => p.confirm({ name: 'Anjali' }), /nothing to confirm/);
  p.receiveRequest({ code: p.state().invite.code, myPeerId: HER.peerId, myName: 'Anjali' });
  const c = p.confirm({ name: 'Anjali' });
  assert.strictEqual(c.state, 'paired');
  assert.strictEqual(p.state().partner.name, 'Anjali');
});
t('a code is SINGLE-USE — a second request on a used code is refused', () => {
  const p = rig();
  p.createInvite(ME);
  const code = p.state().invite.code;
  p.receiveRequest({ code, myPeerId: HER.peerId, myName: 'Anjali' });
  p.confirm({ name: 'Anjali' });
  const second = rig({ store: p.store });
  assert.strictEqual(second.receiveRequest({ code, myPeerId: 'peer-someone' }).ok, false);
});
t('a mismatched code is refused, naming why', () => {
  const p = rig();
  p.createInvite(ME);
  const r = p.receiveRequest({ code: 'WRONGONE', myPeerId: 'x' });
  assert.strictEqual(r.ok, false);
  assert.ok(/does not match/.test(r.reason));
});
t('declining is an answer — the code survives unless revoked', () => {
  const p = rig();
  p.createInvite(ME);
  p.receiveRequest({ code: p.state().invite.code, myPeerId: 'peer-x', myName: 'Someone' });
  const d = p.decline('not who I meant');
  assert.strictEqual(d.state, 'invited');
  assert.strictEqual(p.state().paired, false);
});
t('you cannot mint a new invite while paired', () => {
  const p = rig();
  p.createInvite(ME);
  p.receiveRequest({ code: p.state().invite.code, myPeerId: HER.peerId, myName: 'Anjali' });
  p.confirm({ name: 'Anjali' });
  assert.throws(() => p.createInvite(ME), /already paired/);
});
t('unpair is unilateral — nobody needs permission to be solo', () => {
  const p = rig();
  p.createInvite(ME);
  p.receiveRequest({ code: p.state().invite.code, myPeerId: HER.peerId, myName: 'Anjali' });
  p.confirm({ name: 'Anjali' });
  const u = p.unpair();
  assert.strictEqual(u.state, 'solo');
  assert.strictEqual(u.formerPartner, 'Anjali');
  assert.strictEqual(p.state().partner, null);
});

console.log('\npairing — email invite');
t('the email is composed locally — mailto only, no sending service', () => {
  const p = rig();
  p.createInvite(ME);
  const e = p.emailInvite('anjali@example.com', 'James');
  assert.ok(e.mailto.startsWith('mailto:'));
  assert.ok(e.body.includes(p.state().invite.code));
  assert.ok(e.body.includes('https://eravos.test/#pair='));
  assert.ok(/expires/.test(e.body), 'the email must say the link expires');
});
t('composing an email before an invite exists throws', () => {
  assert.throws(() => rig().emailInvite('a@b.c'), /create an invite first/);
});

console.log('\npairing — parsing and honesty');
t('parse handles url, bare string and json; junk returns null', () => {
  assert.strictEqual(Pairing.parse('ABCD1234.peer-x.fp.nonce').code, 'ABCD1234');
  assert.strictEqual(Pairing.parse('https://x/#pair=ABCD1234.peer-x').peer, 'peer-x');
  assert.strictEqual(Pairing.parse('{"code":"Z","peer":"p"}').peer, 'p');
  assert.strictEqual(Pairing.parse('hello'), null);
  assert.strictEqual(Pairing.parse(''), null);
});
t('§1.2 a weak randomness source is REPORTED, not assumed away', () => {
  const weak = new Pairing({ store: mkStore(), rng: Math.random, rngStrong: false });
  assert.ok(/WEAK/.test(weak.health().randomness), weak.health().randomness);
  assert.ok(/getRandomValues/.test(rig().health().randomness));
});
t('refuses to operate with no storage rather than pretending', () => {
  const orig = globalThis.DB; delete globalThis.DB;
  assert.throws(() => new Pairing(), /Refusing to operate blind/);
  if (orig) globalThis.DB = orig;
});
t('a listener that throws is named and does not break pairing', () => {
  const p = rig();
  p.on(() => { throw new Error('boom'); });
  p.createInvite(ME);
  assert.ok(p.state().invite);
});


console.log('\npairing — a link that only works on your own machine is worse than none');
t('§1.2 a LOOPBACK origin is refused, not quietly encoded into the QR', () => {
  ['http://localhost:80','http://127.0.0.1:8080','http://[::1]:8080','http://0.0.0.0:80']
    .forEach(o => {
      const p = new Pairing({ store: mkStore(), origin: o, now: () => CLOCK });
      const r = p.originIsShareable();
      assert.strictEqual(r.ok, false, o + ' must be refused');
      assert.ok(/THEIR machine|their phone/i.test(r.reason), r.reason);
      assert.ok(r.fix, 'a refusal must name the fix');
    });
});
t('a real domain passes', () => {
  const p = new Pairing({ store: mkStore(), origin: 'https://anonymousservers.info', now: () => CLOCK });
  assert.strictEqual(p.originIsShareable().ok, true);
});
t('a LAN address passes — reachable is reachable, even without a domain', () => {
  const p = new Pairing({ store: mkStore(), origin: 'http://192.168.1.40:8080', now: () => CLOCK });
  assert.strictEqual(p.originIsShareable().ok, true);
});
t('the FABRICATED fallback is refused too — it is not loopback, but it resolves to nothing', () => {
  // An empty origin falls back to the constructor's 'https://eravos.local'
  // placeholder, which sailed past the loopback check and would have produced
  // an invite that silently does nothing on her phone.
  const p = new Pairing({ store: mkStore(), origin: '', now: () => CLOCK });
  const r = p.originIsShareable();
  assert.strictEqual(r.ok, false, 'got: ' + JSON.stringify(r));
  assert.ok(/\.local/.test(r.reason), r.reason);
  const q = new Pairing({ store: mkStore(), origin: 'http://eravos.local:8080', now: () => CLOCK });
  assert.strictEqual(q.originIsShareable().ok, false);
});
t('setOrigin strips a trailing slash so the pair URL never doubles it', () => {
  const p = new Pairing({ store: mkStore(), origin: 'http://x', now: () => CLOCK });
  p.setOrigin('https://anonymousservers.info/');
  p.createInvite({ peerId: 'eravos-abc123' });
  assert.ok(p.inviteUrl().startsWith('https://anonymousservers.info/#pair='), p.inviteUrl());
});


console.log('\npairing — eravos:// deep link (not a magnet link)');
t('the deep link carries the SAME payload as the https URL', () => {
  const p = new Pairing({ store: mkStore(), origin: 'https://anonymousservers.info', now: () => CLOCK,
                          rng: () => 0.5, rngStrong: true });
  p.createInvite({ peerId: 'eravos-9x4kd02m', pubFingerprint: 'fp-a91c' });
  const web = Pairing.parse(p.inviteUrl());
  const deep = Pairing.parse(p.inviteDeepLink());
  assert.strictEqual(deep.code, web.code);
  assert.strictEqual(deep.peer, web.peer);
  assert.strictEqual(deep.n, web.n);
});
t('it is eravos://, NOT magnet: — a magnet URI is a public DHT lookup', () => {
  const p = new Pairing({ store: mkStore(), origin: 'https://x', now: () => CLOCK });
  p.createInvite({ peerId: 'eravos-abc' });
  const d = p.inviteDeepLink();
  assert.ok(d.startsWith('eravos://pair/'), d);
  assert.ok(!/magnet:|urn:btih/.test(d),
    'a magnet link announces to a global network and finds "whoever has this" — ' +
    'you want her device, with no third party in the path');
});
t('the QR still encodes the HTTPS url — nobody is stranded without the app', () => {
  const p = new Pairing({ store: mkStore(), origin: 'https://anonymousservers.info', now: () => CLOCK });
  p.createInvite({ peerId: 'eravos-abc' });
  assert.ok(p.inviteUrl().startsWith('https://'),
    'the encoded link must work on any phone with nothing installed');
});
t('a deep link with no invite returns null rather than a broken scheme', () => {
  assert.strictEqual(new Pairing({ store: mkStore(), now: () => CLOCK }).inviteDeepLink(), null);
});

console.log('\npairing — the rendezvous (v2): a code that names WHO but not WHERE');
const RELAY = 'wss://anonymousservers.info/relay';

t('the invite carries the relay, and it survives a round trip through the deep link', () => {
  const p = rig();
  p.createInvite({ ...ME, relay: RELAY });
  const parsed = Pairing.parse(p.inviteDeepLink());
  assert.strictEqual(parsed.relay, RELAY);
  assert.strictEqual(parsed.code, p.state().invite.code, 'the older fields must still land in the same slots');
  assert.strictEqual(parsed.peer, ME.peerId);
});
t('it survives the https URL too — the QR and the deep link carry one payload', () => {
  const p = rig();
  p.createInvite({ ...ME, relay: RELAY });
  assert.strictEqual(Pairing.parse(p.inviteUrl()).relay, RELAY);
  assert.strictEqual(Pairing.parse(JSON.stringify(p.invitePayload())).relay, RELAY);
});
t('the encoded relay contains no dot — a dot would split into a phantom field', () => {
  const p = rig();
  p.createInvite({ ...ME, relay: RELAY });
  const seg = p.inviteDeepLink().replace('eravos://pair/', '').split('.');
  assert.strictEqual(seg.length, 5, 'exactly five fields: ' + seg.length);
  assert.ok(!/[.+/=]/.test(seg[4]), 'base64url only, got: ' + seg[4]);
});

t('A V1 CODE STILL PARSES — every code already sent keeps working', () => {
  const v1 = 'ABCD1234.eravos-9x4kd02m.fp-a91c.n0nce';   // four fields, minted before 0.13.0
  const parsed = Pairing.parse(v1);
  assert.strictEqual(parsed.code, 'ABCD1234');
  assert.strictEqual(parsed.peer, 'eravos-9x4kd02m');
  assert.strictEqual(parsed.n, 'n0nce');
  assert.strictEqual(parsed.relay, null, 'absent, not invented');
});
t('a v1 code still SCANS, and reports honestly that it has no rendezvous', () => {
  const her = rig();
  const r = her.scan(Pairing.parse('ABCD1234.eravos-9x4kd02m.fp-a91c.n0nce'), HER);
  assert.strictEqual(r.ok, true, 'a v1 code must not be rejected outright');
  assert.strictEqual(r.relayUsable, false);
  assert.ok(/no relay address/.test(r.relayWarning), r.relayWarning);
});
t('an invite minted with no relay is byte-identical to what v1 produced', () => {
  const p = rig();
  p.createInvite(ME);
  const seg = p.inviteDeepLink().replace('eravos://pair/', '').split('.');
  assert.strictEqual(seg.length, 4, 'no empty trailing field — v1 wire form exactly');
});

t('§1.2 A LOOPBACK RELAY IS REFUSED — she would connect to her own relay and see nobody', () => {
  const r = Pairing.relayIsShareable('ws://localhost:4020/relay');
  assert.strictEqual(r.ok, false);
  assert.ok(/THEIR machine/.test(r.reason), r.reason);
  ['ws://127.0.0.1:4020/relay', 'ws://[::1]:4020/relay', 'ws://0.0.0.0:4020/relay']
    .forEach(u => assert.strictEqual(Pairing.relayIsShareable(u).ok, false, u + ' must be refused'));
});
t('a .local relay is refused — mDNS resolves on one LAN and nowhere else', () => {
  assert.strictEqual(Pairing.relayIsShareable('ws://eravos.local:4020/relay').ok, false);
});
t('a non-ws scheme is refused rather than handed to a WebSocket constructor', () => {
  const r = Pairing.relayIsShareable('https://anonymousservers.info/relay');
  assert.strictEqual(r.ok, false);
  assert.ok(/ws:\/\/ or wss:\/\//.test(r.reason), r.reason);
});
t('a real wss address passes, and so does a bare LAN ip — reachable is reachable', () => {
  assert.strictEqual(Pairing.relayIsShareable(RELAY).ok, true);
  assert.strictEqual(Pairing.relayIsShareable('ws://10.0.0.216:4020/relay').ok, true);
});
t('minting with a loopback relay WARNS at mint time, not at her end when nothing happens', () => {
  const p = rig();
  const r = p.createInvite({ ...ME, relay: 'ws://localhost:4020/relay' });
  assert.strictEqual(r.ok, true, 'still minted — the caller decides whether to show it');
  assert.strictEqual(r.relayReachable, false);
  assert.ok(/THEIR machine/.test(r.relayWarning), r.relayWarning);
  assert.ok(/publicOrigin/.test(r.relayFix), r.relayFix);
  assert.strictEqual(p.health().inviteRelayReachable, false);
});
t('scanning a loopback relay does NOT adopt it — that is the silent self-connect', () => {
  const p = rig();
  p.createInvite({ ...ME, relay: 'ws://127.0.0.1:4020/relay' });
  const her = rig();
  const r = her.scan(p.invitePayload(), HER);
  assert.strictEqual(r.relay, null, 'must not hand a loopback address back to the caller');
  assert.strictEqual(r.relayUsable, false);
  assert.strictEqual(her.state().state, 'requested', 'the request still stands — it just has no usable rendezvous');
});
t('a usable relay IS handed back, and stored on the request for later inspection', () => {
  const p = rig();
  p.createInvite({ ...ME, relay: RELAY });
  const her = rig();
  const r = her.scan(p.invitePayload(), HER);
  assert.strictEqual(r.relay, RELAY);
  assert.strictEqual(r.relayUsable, true);
  assert.strictEqual(her._raw().request.theirRelay, RELAY);
});
t('scan() has NO side effect on any relay global — it reports, the caller applies', () => {
  const before = globalThis.setRelayUrlOverride;
  let called = false;
  globalThis.setRelayUrlOverride = () => { called = true; };
  const p = rig(); p.createInvite({ ...ME, relay: RELAY });
  rig().scan(p.invitePayload(), HER);
  assert.strictEqual(called, false, 'Pairing must stay a pure state machine — the kernel owns the socket');
  if (before) globalThis.setRelayUrlOverride = before; else delete globalThis.setRelayUrlOverride;
});
t('health() reports the rendezvous, so a dead invite is visible before she is blamed for it', () => {
  const p = rig();
  p.createInvite({ ...ME, relay: RELAY });
  assert.strictEqual(p.health().inviteRelay, RELAY);
  assert.strictEqual(p.health().inviteRelayReachable, true);
  assert.strictEqual(rig().health().inviteRelayReachable, false, 'no invite at all is not reachable either');
});

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail?1:0);
