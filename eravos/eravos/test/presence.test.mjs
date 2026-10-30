// §12.1 brutal. §12.2 informative failure.
import assert from 'assert';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { PresenceShell, STALE_MS, FOLLOW_RETRY_MS } = require('../shared/eravos-presence.js');
const { ChatEngine } = require('../shared/eravos-chat.js');

function mkStore(){ const m=new Map(); return {get:(k,d)=>(m.has(k)?m.get(k):(d!==undefined?d:null)),
  set:(k,v)=>m.set(k,v),remove:k=>m.delete(k),keys:()=>[...m.keys()]}; }

function rig({ shareTab = true, typing = false } = {}) {
  const sent = [];
  const store = mkStore();
  const chat = new ChatEngine({ store, me: 'James', send: (t, d) => { sent.push({ t, d }); return true; } });
  chat.setPrefs({ shareTab });
  const switched = [];
  globalThis.document = { activeElement: typing
    ? { tagName: 'TEXTAREA', value: 'half a sentence' }
    : { tagName: 'BODY', value: '' } };
  const p = new PresenceShell({
    chat, send: (t, d) => { sent.push({ t, d }); return true; },
    switchTab: id => switched.push(id),
    tabLabel: id => id.charAt(0).toUpperCase() + id.slice(1),
    partnerName: () => 'Anjali',
  });
  return { p, chat, sent, switched, store };
}

let pass=0,fail=0;
const t=(n,f)=>{try{f();console.log('  ok  - '+n);pass++}catch(e){console.log('  FAIL- '+n+'\n        '+e.message);fail++}};

console.log('\npresence — the shell line');
t('"Anjali is in the Vault" — the whole point of this phase', () => {
  const { p } = rig();
  p.theyEnteredTab('vault');
  assert.strictEqual(p.state().line, 'Anjali is in Vault');
  assert.strictEqual(p.state().theirTab, 'vault');
});
t('presence goes stale rather than hanging forever', () => {
  const { p } = rig();
  p.theyEnteredTab('vault');
  p._theirTabAt = Date.now() - (STALE_MS + 1000);
  assert.strictEqual(p.state().line, null);
  assert.strictEqual(p.state().theirTab, null);
});
t('my own tab broadcasts only when I am sharing (§ nothing is forced)', () => {
  const off = rig({ shareTab: false });
  assert.strictEqual(off.p.enteredTab('codex').sent, false);
  assert.strictEqual(off.sent.filter(s => s.t === 'presence:tab').length, 0);
  const on = rig({ shareTab: true });
  assert.strictEqual(on.p.enteredTab('codex').sent, true);
});

console.log('\npresence — follow');
t('you cannot follow someone who is not sharing their tab', () => {
  const { p } = rig();
  const r = p.follow();
  assert.strictEqual(r.ok, false);
  assert.ok(/isn't sharing/.test(r.reason), r.reason);
  assert.strictEqual(p.state().following, false);
});
t('following goes to their tab', () => {
  const { p, chat, switched } = rig();
  chat.receiveTab({ tab: 'vault' });
  p.theyEnteredTab('vault');
  const r = p.follow();
  assert.strictEqual(r.ok, true);
  assert.deepStrictEqual(switched, ['vault']);
});
t('THE DESIGN DECISION — following BROADCASTS, so it cannot be hidden', () => {
  const { p, chat, sent } = rig();
  chat.receiveTab({ tab: 'vault' });
  p.theyEnteredTab('vault');
  p.follow();
  const f = sent.filter(s => s.t === 'presence:follow');
  assert.strictEqual(f.length, 1);
  assert.strictEqual(f[0].d.on, true);
  // §12.2 — the first draft of this line was a tautology that could not fail.
  // Assert the actual contract: the return says the other side is told.
  const r = p.follow();
  assert.ok(/is told you are following/.test(r.note || ''), 'the note must state that they are told: ' + r.note)
});
t('unfollowing broadcasts too — they learn it stopped', () => {
  const { p, chat, sent } = rig();
  chat.receiveTab({ tab: 'vault' });
  p.theyEnteredTab('vault');
  p.follow();
  p.unfollow();
  const f = sent.filter(s => s.t === 'presence:follow');
  assert.strictEqual(f.length, 2);
  assert.strictEqual(f[1].d.on, false);
  assert.strictEqual(p.state().following, false);
});
t('being followed is REPORTED, not asked for — a hidden pending follow is worse', () => {
  const { p } = rig();
  assert.strictEqual(p.state().followedByThem, false);
  p.theyFollow(true);
  assert.strictEqual(p.state().followedByThem, true);
  p.theyFollow(false);
  assert.strictEqual(p.state().followedByThem, false);
});
t('while following, their next tab move carries me with them', () => {
  const { p, chat, switched } = rig();
  chat.receiveTab({ tab: 'vault' });
  p.theyEnteredTab('vault');
  p.follow();
  p.theyEnteredTab('codex');
  assert.deepStrictEqual(switched, ['vault', 'codex']);
});
t('after unfollowing, their moves no longer move me', () => {
  const { p, chat, switched } = rig();
  chat.receiveTab({ tab: 'vault' });
  p.theyEnteredTab('vault');
  p.follow(); p.unfollow();
  p.theyEnteredTab('codex');
  assert.deepStrictEqual(switched, ['vault']);
});

console.log('\npresence — never steal focus mid-sentence (§1.2)');
t('a follow while I am typing DEFERS instead of yanking me away', () => {
  const { p, chat, switched } = rig({ typing: true });
  chat.receiveTab({ tab: 'vault' });
  p.theyEnteredTab('vault');
  p.follow();
  assert.deepStrictEqual(switched, [], 'must not switch out of a half-written sentence');
  assert.strictEqual(p.health().deferred, 1);
});
t('an empty text field is not "typing" — nothing to lose, so go', () => {
  const sent = [];
  const store = mkStore();
  const chat = new ChatEngine({ store, me: 'J', send: () => true });
  chat.setPrefs({ shareTab: true });
  globalThis.document = { activeElement: { tagName: 'TEXTAREA', value: '' } };
  const switched = [];
  const p = new PresenceShell({ chat, send: () => true, switchTab: id => switched.push(id),
                                tabLabel: id => id, partnerName: () => 'A' });
  chat.receiveTab({ tab: 'vault' });
  p.theyEnteredTab('vault');
  p.follow();
  assert.deepStrictEqual(switched, ['vault']);
});
t('a checkbox or button focus is not typing', () => {
  globalThis.document = { activeElement: { tagName: 'INPUT', type: 'checkbox', value: 'on' } };
  const { p, chat, switched } = rig();
  globalThis.document = { activeElement: { tagName: 'INPUT', type: 'checkbox', value: 'on' } };
  chat.receiveTab({ tab: 'vault' });
  p.theyEnteredTab('vault');
  p.follow();
  assert.deepStrictEqual(switched, ['vault']);
});
t('a deferred follow is retried, and lands once typing stops', async () => {
  const { p, chat, switched } = rig({ typing: true });
  chat.receiveTab({ tab: 'vault' });
  p.theyEnteredTab('vault');
  p.follow();
  assert.deepStrictEqual(switched, []);
  globalThis.document = { activeElement: { tagName: 'BODY', value: '' } };
  await new Promise(r => setTimeout(r, FOLLOW_RETRY_MS + 120));
  assert.deepStrictEqual(switched, ['vault'], 'the deferred follow must eventually land');
});
t('unfollowing cancels a pending deferred follow', async () => {
  const { p, chat, switched } = rig({ typing: true });
  chat.receiveTab({ tab: 'vault' });
  p.theyEnteredTab('vault');
  p.follow();
  p.unfollow();
  globalThis.document = { activeElement: { tagName: 'BODY', value: '' } };
  await new Promise(r => setTimeout(r, FOLLOW_RETRY_MS + 120));
  assert.deepStrictEqual(switched, [], 'a cancelled follow must not fire later');
});

console.log('\npresence — ephemeral and bounded');
t('NOTHING is persisted — the store stays empty through a full session', () => {
  const { p, chat, store } = rig();
  for (let i = 0; i < 200; i++) { p.enteredTab('t' + i); p.theyEnteredTab('u' + i); }
  p.follow(); p.unfollow(); p.theyFollow(true);
  const keys = store.keys().filter(k => k !== 'eravors_chat_prefs');
  assert.deepStrictEqual(keys, [], 'movement through the app must not be recorded: ' + keys.join(','));
  assert.strictEqual(p.health().persisted, 0);
});
t('a listener that throws is named and does not break presence', () => {
  const { p } = rig();
  p.on(() => { throw new Error('boom'); });
  p.theyEnteredTab('vault');
  assert.strictEqual(p.state().theirTab, 'vault');
});
t('degrades honestly with no chat engine rather than pretending', () => {
  const p = new PresenceShell({ chat: null, send: () => true });
  assert.strictEqual(p.enteredTab('x').sent, false);
  assert.strictEqual(p.canFollow().ok, false);
  assert.strictEqual(p.health().status, 'no-chat-engine');
});

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail?1:0);
