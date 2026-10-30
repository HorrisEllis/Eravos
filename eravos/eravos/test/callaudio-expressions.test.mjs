// §12.1 brutal. Scope: the pure parts — SDP tuning, profiles, prefs, and the
// whole expression set. The replay buffer and captions need real Web Audio and
// a real mic; those are a device pass and are stated as open.
import assert from 'assert';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { CallAudio, PROFILES, REPLAY_SECONDS } = require('../shared/eravos-callaudio.js');
const E = require('../shared/eravos-expressions.js');
const fs = require('fs');

function mkStore(){ const m=new Map(); return {get:(k,d)=>(m.has(k)?m.get(k):(d!==undefined?d:null)),set:(k,v)=>m.set(k,v)}; }
const ca = () => new CallAudio({ store: mkStore() });
const SDP = ['v=0','m=audio 9 UDP/TLS/RTP/SAVPF 111 103','a=rtpmap:111 opus/48000/2',
             'a=fmtp:111 minptime=10;useinbandfec=1','a=rtpmap:103 ISAC/16000'].join('\r\n');

let pass=0,fail=0;
const t=(n,f)=>{try{f();console.log('  ok  - '+n);pass++}catch(e){console.log('  FAIL- '+n+'\n        '+e.message);fail++}};

console.log('\ncall audio — profiles');
t('the DEFAULT is what a meeting app would never pick', () => {
  const c = ca();
  assert.strictEqual(c.prefs().profile, 'intimate');
  const k = c.constraints().audio;
  assert.strictEqual(k.noiseSuppression, false, 'noise suppression eats breath and room tone');
  assert.strictEqual(k.autoGainControl, false, 'AGC flattens someone speaking softly');
  assert.strictEqual(k.echoCancellation, false);
});
t('every profile says what it costs, and whether it needs headphones', () => {
  Object.keys(PROFILES).forEach(id => {
    const p = PROFILES[id];
    assert.ok(p.label && p.why, id + ' must state what it trades');
    assert.strictEqual(typeof p.needsHeadphones, 'boolean');
    assert.ok(p.bitrate > 0);
  });
  assert.strictEqual(PROFILES.intimate.needsHeadphones, true, 'no echo cancellation means headphones');
});
t('the noisy profile turns everything ON — it is a real trade, not a worse option', () => {
  const k = PROFILES.noisy.constraints;
  assert.ok(k.echoCancellation && k.noiseSuppression && k.autoGainControl);
  assert.ok(PROFILES.noisy.bitrate < PROFILES.intimate.bitrate);
});
t('an unknown profile is refused, listing the real ones', () => {
  assert.throws(() => ca().setPrefs({ profile: 'cinema' }), /Known: intimate, balanced, noisy/);
});

console.log('\ncall audio — SDP tuning');
t('opus bitrate and in-band FEC are applied to the existing fmtp line', () => {
  const r = ca().tuneSdp(SDP);
  assert.strictEqual(r.applied, true);
  assert.ok(r.sdp.includes('maxaveragebitrate=64000'), r.sdp);
  assert.ok(r.sdp.includes('useinbandfec=1'));
  assert.strictEqual(r.payloadType, '111');
});
t('usedtx is OFF on purpose — DTX cuts the quiet, and quiet is the point', () => {
  const r = ca().tuneSdp(SDP);
  assert.ok(r.sdp.includes('usedtx=0'));
  assert.ok(/quiet is where most of this conversation lives/.test(r.note));
});
t('mono is forced — stereo halves the bits per channel for no gain on a voice', () => {
  const r = ca().tuneSdp(SDP);
  assert.ok(r.sdp.includes('stereo=0'));
});
t('§1.2 SDP with no Opus is returned UNCHANGED, with the reason', () => {
  const noOpus = 'v=0\r\nm=audio 9 RTP/AVP 8\r\na=rtpmap:8 PCMA/8000';
  const r = ca().tuneSdp(noOpus);
  assert.strictEqual(r.applied, false);
  assert.strictEqual(r.sdp, noOpus, 'mangling the offer would break the call outright');
  assert.ok(/no Opus/.test(r.reason));
});
t('an fmtp line is INSERTED when opus has none', () => {
  const bare = 'v=0\r\nm=audio 9 RTP/AVP 111\r\na=rtpmap:111 opus/48000/2';
  const r = ca().tuneSdp(bare);
  assert.strictEqual(r.applied, true);
  assert.ok(r.sdp.includes('a=fmtp:111 '));
});
t('a custom bitrate overrides the profile', () => {
  const c = ca(); c.setPrefs({ bitrate: 96000 });
  assert.ok(c.tuneSdp(SDP).sdp.includes('maxaveragebitrate=96000'));
});

console.log('\ncall audio — replay buffer contract');
t('fifteen seconds, and it degrades honestly with no Web Audio', () => {
  assert.strictEqual(REPLAY_SECONDS, 15);
  const c = ca();
  const r = c.startReplayBuffer({});
  assert.strictEqual(r.ok, false);
  assert.ok(/Web Audio|remote stream/.test(r.reason), r.reason);
});
t('replay with no buffer says so rather than playing silence', () => {
  const r = ca().replay();
  assert.strictEqual(r.ok, false);
  assert.ok(/no buffer running/.test(r.reason));
});
t('turning replay off is respected', () => {
  const c = ca(); c.setPrefs({ replayEnabled: false });
  assert.ok(/off in settings/.test(c.startReplayBuffer({}).reason));
});
t('§1.2 nothing is ever written to disk, and health says so', () => {
  const h = ca().health();
  assert.strictEqual(h.recordedToDisk, 0);
  assert.strictEqual(h.captionsSynced, 0);
  const src = fs.readFileSync(new URL('../shared/eravos-callaudio.js', import.meta.url), 'utf8');
  const body = src.replace(/\/\*[\s\S]*?\*\//g,'').replace(/^\s*\/\/.*$/gm,'');
  ['emitSync','MediaRecorder','writeFile','localStorage.setItem','Blob(']
    .forEach(tok => assert.ok(!body.includes(tok), 'found "' + tok + '" — the buffer must not persist'));
});

console.log('\ncall audio — captions');
t('captions are OFF by default — a caption is a guess', () => {
  assert.strictEqual(ca().prefs().captionsEnabled, false);
});
t('no speech recognition reports the real platform constraint', () => {
  const c = ca(); c.setPrefs({ captionsEnabled: true });
  const r = c.startCaptions();
  assert.strictEqual(r.ok, false);
  assert.ok(/iOS Safari has none/.test(r.reason), r.reason);
});

console.log('\nexpressions');
t('there are a lot of them, grouped by what you are trying to say', () => {
  assert.ok(E.count() >= 140, 'got ' + E.count());
  assert.ok(E.GROUPS.length >= 10);
  E.GROUPS.forEach(g => { assert.ok(g.label, g.id + ' has no label'); assert.ok(g.items.length); });
});
t('EVERY entry has words — that is the alt text and the search index', () => {
  const h = E.health();
  assert.strictEqual(h.missingSays, 0);
  assert.strictEqual(h.missingFeelings, 0, 'an expression with no feeling cannot link to the tracker');
});
t('§12.2 reuse is distinguished from duplication — and there are no real dupes', () => {
  const h = E.health();
  assert.deepStrictEqual(h.duplicateMeanings, [],
    'the same emoji meaning the same thing twice is a mistake');
  assert.ok(h.reusedAcrossMeanings.length > 0,
    'one gesture carrying two meanings is deliberate — 🫂 is both "holding you" and "I need to be held"');
  assert.strictEqual(h.status, 'healthy');
});
t('search matches MEANING, not the Unicode name', () => {
  assert.ok(E.search('held').length > 0);
  assert.ok(E.search('miss you').length > 0);
  assert.ok(E.search('need space').length > 0);
  assert.strictEqual(E.search('U+1F917').length, 0, 'nobody searches by codepoint');
});
t('every expression links back to the feelings tracker', () => {
  assert.ok(E.forFeeling('Longing').length > 5);
  assert.ok(E.feelingsFor('❤️').includes('Love'));
  assert.deepStrictEqual(E.feelingsFor('🚀'), [], 'unknown emoji returns empty, not a guess');
});
t('solo mode hides the wanting group — nothing is sent to nobody', () => {
  const solo = E.visible({ paired: false });
  const paired = E.visible({ paired: true });
  assert.ok(solo.length < paired.length);
  assert.strictEqual(solo.filter(x => x.partnerOnly).length, 0);
});
t('the hard and need groups exist — this is not only a romance set', () => {
  ['hard','friction','need','everyday'].forEach(g =>
    assert.ok(E.GROUPS.some(x => x.id === g), 'missing group: ' + g));
  assert.ok(E.search('space').some(x => /space/.test(x.says)));
});


console.log('\nexpressions — hands, closeness, and your own');
t('there are hand-holding and closeness groups, specific rather than generic', () => {
  ['hands','closeness'].forEach(g =>
    assert.ok(E.GROUPS.some(x => x.id === g), 'missing group: ' + g));
  const hands = E.GROUPS.find(g => g.id === 'hands');
  assert.ok(hands.items.length >= 12, 'got ' + hands.items.length);
  // The point is specificity — "holding your hand" is a different act from
  // "fingers laced" and both are different from "squeezing once".
  // Holding hands IS fingers interlaced — one act, not two. The real
  // distinctions are how committed the hold is (§0.1, corrected after
  // shipping it wrong).
  assert.ok(hands.items.some(i => /fingers laced/.test(i.s)));
  assert.strictEqual(hands.items.filter(i => /^holding your hand/.test(i.s)).length, 1,
    'holding hands and lacing fingers must not be separate entries');
  ['your hand cupped in both of mine','hand rested on top of yours','squeezing once — I am here']
    .forEach(said => assert.ok(hands.items.some(i => i.s === said), 'missing: ' + said));
});
t('§12.2 no emoji means the same thing twice — reuse across MEANINGS is fine', () => {
  const h = E.health();
  assert.deepStrictEqual(h.duplicateMeanings, []);
  assert.ok(h.reusedAcrossMeanings.length > 0, 'one gesture carrying two meanings is deliberate');
  assert.strictEqual(h.status, 'healthy');
});
t('the set grew past 175 and every entry still carries words', () => {
  assert.ok(E.count() >= 175, 'got ' + E.count());
  assert.strictEqual(E.health().missingSays, 0);
  assert.strictEqual(E.health().missingFeelings, 0);
});

console.log('\nexpressions — yours');
t('a custom expression is stored, sendable, and comes FIRST', () => {
  globalThis.DB = { _m: new Map(),
    get(k,d){ return this._m.has(k)?this._m.get(k):(d!==undefined?d:null); },
    set(k,v){ this._m.set(k,v); } };
  E.addCustom('🪷', 'the thing from the bridge', { feelings: ['Love'] });
  assert.strictEqual(E.all()[0].emoji, '🪷', 'yours are the ones you actually reach for');
  assert.strictEqual(E.all()[0].custom, true);
});
t('it is searchable by MEANING like any built-in', () => {
  assert.ok(E.search('bridge').some(x => x.emoji === '🪷'));
});
t('it links to the feelings tracker like any built-in', () => {
  assert.deepStrictEqual(E.feelingsFor('🪷'), ['Love']);
});
t('an emoji with no words is REFUSED — that is a guess at both ends', () => {
  assert.throws(() => E.addCustom('🎈', '   '), /guess at both ends/);
  assert.throws(() => E.addCustom('', 'something'), /emoji is required/);
});
t('§0.3 removing archives — adding it again brings it straight back', () => {
  E.addCustom('🥄', 'little spoon');
  E.removeCustom('🥄', 'little spoon');
  assert.ok(!E.customs().some(c => c.emoji === '🥄'));
  const r = E.addCustom('🥄', 'little spoon');
  assert.strictEqual(r.reused, true);
  assert.ok(E.customs().some(c => c.emoji === '🥄'));
});
t('customs are PRIVATE by default — telling them what it means is separate', () => {
  const r = E.addCustom('🕊️', 'the quiet one');
  assert.ok(/Yours alone/.test(r.note), r.note);
  assert.strictEqual(E.customs().find(c => c.emoji === '🕊️').shared, false);
});

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail?1:0);
