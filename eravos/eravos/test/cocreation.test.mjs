// §12.1 brutal. The mine/ours distinction is the whole safety model here,
// so it is asserted structurally rather than trusted.
import assert from 'assert';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { CoCreation, SETTINGS, ASKED_KEY } = require('../shared/eravos-cocreation.js');
const { PlannerShare, SCOPES } = require('../shared/eravos-planner-share.js');

function mkStore(){ const m=new Map(); return {_m:m,get:(k,d)=>(m.has(k)?m.get(k):(d!==undefined?d:null)),
  set:(k,v)=>m.set(k,v),keys:()=>[...m.keys()]}; }
let CLOCK = 1_700_000_000_000;
const pair = () => { const s=mkStore();
  return { s, me:new CoCreation({store:s,me:'self',send:()=>true,now:()=>CLOCK}),
              her:new CoCreation({store:s,me:'partner',send:()=>true,now:()=>CLOCK}) }; };
const plan = (enabled=true) => { const s=mkStore();
  return { s, me:new PlannerShare({store:s,me:'self',send:()=>true,now:()=>CLOCK,sharedEnabled:()=>enabled}),
              her:new PlannerShare({store:s,me:'partner',send:()=>true,now:()=>CLOCK,sharedEnabled:()=>enabled}) }; };

let pass=0,fail=0;
const t=(n,f)=>{try{CLOCK=1_700_000_000_000;f();console.log('  ok  - '+n);pass++}catch(e){console.log('  FAIL- '+n+'\n        '+e.message);fail++}};

console.log('\nco-creation — mine vs ours');
t('a MINE setting takes effect on my say-so alone', () => {
  const { me } = pair();
  assert.strictEqual(me.get('shareCursor').on, true, 'presence is on by default now');
  me.set('shareCursor', false);
  assert.strictEqual(me.get('shareCursor').on, false);
});
t('an OURS setting needs BOTH — one side is not enough', () => {
  const { me } = pair();
  const r = me.set('sharedPlanner', true);
  assert.strictEqual(r.on, false, 'my yes alone must not turn it on');
  assert.strictEqual(me.get('sharedPlanner').waitingOn, 'them');
  assert.ok(/one person cannot turn on something you both live in/.test(r.note));
});
t('it comes on when they agree', () => {
  const { me, her } = pair();
  me.set('sharedPlanner', true);
  her.set('sharedPlanner', true);
  assert.strictEqual(me.get('sharedPlanner').on, true);
});
t('an unanswered partner is NOT a yes', () => {
  const { me } = pair();
  me.set('sharedLattice', true);
  const s = me.get('sharedLattice');
  assert.strictEqual(s.theirs, null);
  assert.strictEqual(s.on, false, 'not answering is not an answer');
});
t('either side ends a shared setting ALONE', () => {
  const { me, her } = pair();
  me.set('sharedPlanner', true); her.set('sharedPlanner', true);
  her.set('sharedPlanner', false);
  assert.strictEqual(me.get('sharedPlanner').on, false);
  assert.ok(/Either of you can end a shared setting alone/.test(her.set('sharedLattice', false).note));
});
t('set() has NO parameter for the other person — one person cannot configure a pair', () => {
  const { me } = pair();
  me.set('sharedPlanner', true, 'partner');   // extra arg is ignored, not honoured
  assert.strictEqual(me.get('sharedPlanner').theirs, null);
  assert.strictEqual(me.health().oneSidedOursSettings, 0);
});
t('read receipts stay OFF by default while presence is on', () => {
  const { me } = pair();
  assert.strictEqual(me.get('readReceipts').on, false);
  assert.strictEqual(me.get('shareTab').on, true);
  assert.strictEqual(me.get('presenceInShell').mine, true);
});
t('the merged dashboard is OFF by default', () => {
  assert.strictEqual(pair().me.get('mergedDashboard').mine, false);
});
t('every setting declares scope, default, label and WHY', () => {
  SETTINGS.forEach(s => {
    assert.ok(['mine','ours'].includes(s.scope), s.id + ' scope');
    assert.strictEqual(typeof s.def, 'boolean', s.id + ' default');
    assert.ok(s.label && s.why, s.id + ' must say what it costs');
  });
});
t('an unknown setting is refused, listing the real ones', () => {
  assert.throws(() => pair().me.get('vibes'), /Known: shareCursor/);
});

console.log('\nco-creation — the one-time ask');
t('it asks once and never again', () => {
  const { s, me } = pair();
  assert.strictEqual(me.shouldAsk(), true);
  me.complete({ shareCursor: true });
  assert.strictEqual(me.shouldAsk(), false);
  assert.strictEqual(new CoCreation({ store: s, me: 'self', now: () => CLOCK }).shouldAsk(), false);
});
t('skipping is a real outcome — defaults stand and it stops asking', () => {
  const { s, me } = pair();
  me.skip();
  assert.strictEqual(me.shouldAsk(), false);
  assert.strictEqual(s.get(ASKED_KEY).how, 'skipped');
  assert.strictEqual(me.get('shareCursor').on, true, 'the default must survive a skip');
});
t('complete() applies every setting, not only the ones answered', () => {
  const { me } = pair();
  const r = me.complete({ mergedDashboard: true });
  assert.strictEqual(r.applied.length, SETTINGS.length);
  assert.strictEqual(me.get('mergedDashboard').mine, true);
  assert.strictEqual(me.get('shareCursor').on, true, 'unanswered ones fall to their default');
});

console.log('\nplanner — solo is not a lesser mode');
t('every event starts MINE — being paired is not consent to publish a diary', () => {
  const { me } = plan();
  const r = me.add({ title: 'dinner thursday', when: CLOCK + 86400000 });
  assert.strictEqual(r.scope, 'mine');
  assert.ok(/no share-everything switch/.test(r.note));
});
t('share() produces PROPOSED, never shared', () => {
  const { me } = plan();
  const id = me.add({ title: 'x', when: CLOCK }).id;
  assert.strictEqual(me.share(id).scope, 'proposed');
  assert.strictEqual(me.sharedCalendar().length, 0);
});
t('THE RULE — you cannot accept your own proposal', () => {
  const { me } = plan();
  const id = me.add({ title: 'x', when: CLOCK }).id;
  me.share(id);
  assert.throws(() => me.accept(id), /THEY accept.*a plan rather than an instruction/s);
});
t('their accept is the only path to shared', () => {
  const { me, her } = plan();
  const id = me.add({ title: 'x', when: CLOCK }).id;
  me.share(id);
  assert.strictEqual(her.accept(id).scope, 'shared');
  assert.strictEqual(me.sharedCalendar().length, 1);
  assert.strictEqual(me.health().autoSharedWithoutConsent, 0);
});
t('declining is an answer, and the event stays in their own week', () => {
  const { me, her } = plan();
  const id = me.add({ title: 'x', when: CLOCK }).id;
  me.share(id);
  const r = her.decline(id, 'working late');
  assert.strictEqual(r.scope, 'declined');
  assert.ok(/still have the thing in their week/.test(r.note));
  assert.strictEqual(me.myCalendar().length, 1, 'it must not vanish from the proposer');
});
t('either side unshares ALONE', () => {
  const { me, her } = plan();
  const id = me.add({ title: 'x', when: CLOCK }).id;
  me.share(id); her.accept(id);
  assert.strictEqual(her.unshare(id).scope, 'mine');
  assert.strictEqual(me.sharedCalendar().length, 0);
});
t('§1.2 sharing with no shared calendar is REFUSED loudly, not queued into nothing', () => {
  const { me } = plan(false);
  const id = me.add({ title: 'x', when: CLOCK }).id;
  assert.throws(() => me.share(id), /no shared calendar yet.*co-creation settings/s);
});
t('you cannot share an event that is theirs', () => {
  const { me, her } = plan();
  const id = her.add({ title: 'hers', when: CLOCK }).id;
  assert.throws(() => me.share(id), /theirs to share, not yours/);
});
t('SOLO works fully — add, list, keep, with no partner anywhere', () => {
  const { me } = plan(false);
  me.add({ title: 'gym', when: CLOCK });
  me.add({ title: 'call mum', when: CLOCK + 3600000 });
  assert.strictEqual(me.myCalendar().length, 2);
  assert.strictEqual(me.list('mine').length, 2);
});
t('an event with no time is refused — that is a note, not an event', () => {
  const { me } = plan();
  assert.throws(() => me.add({ title: 'someday' }), /a time is required/);
  assert.throws(() => me.add({ when: CLOCK }), /title is required/);
});
t('a remote proposal is stored as THEIRS — authorship is not trusted from the wire', () => {
  const { me } = plan();
  me.applyRemote('proposed', { id: 'ev-x', title: 'theirs', when: CLOCK, owner: 'self' });
  assert.strictEqual(me.list('proposed')[0].owner, 'partner');
});
t('pending splits by who is waiting on whom', () => {
  const { me, her } = plan();
  const a = me.add({ title: 'mine', when: CLOCK }).id; me.share(a);
  const b = her.add({ title: 'theirs', when: CLOCK }).id; her.share(b);
  assert.deepStrictEqual(me.pending().awaitingThem.map(e => e.title), ['mine']);
  assert.deepStrictEqual(me.pending().awaitingMe.map(e => e.title), ['theirs']);
});
t('unknown scope on list() throws, listing the real ones', () => {
  assert.throws(() => plan().me.list('maybe'), /Known: mine, proposed, shared, declined/);
});
t('both refuse to operate with no storage', () => {
  const orig = globalThis.DB; delete globalThis.DB;
  [CoCreation, PlannerShare].forEach(C =>
    assert.throws(() => new C(), /Refusing to operate blind/, C.name));
  if (orig) globalThis.DB = orig;
});

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail?1:0);
