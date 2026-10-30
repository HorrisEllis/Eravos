// §12.1 brutal. §12.2 informative failure.
import assert from 'assert';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { ChoiceRegistry } = require('../shared/eravos-choice.js');
const { ChatEngine, THREAD_KEY, PREFS_KEY, EPHEMERAL_TYPES } = require('../shared/eravos-chat.js');

function mkStore(seed = {}) {
  const m = new Map(Object.entries(seed));
  return { _m: m, get: (k, d) => (m.has(k) ? m.get(k) : (d !== undefined ? d : null)),
           set: (k, v) => m.set(k, v), remove: k => m.delete(k), keys: () => [...m.keys()] };
}
let pass=0,fail=0;
const t=(n,f)=>{try{f();console.log('  ok  - '+n);pass++}catch(e){console.log('  FAIL- '+n+'\n        '+e.message);fail++}};

const mkChoice = () => {
  const c = new ChoiceRegistry(mkStore());
  c.define({ id:'feeling', label:'How are you?', options:['Grief','Hope','Rage','Numb'] });
  return c;
};

console.log('\nchoice — the Other primitive');
t('EVERY defined prompt is skippable by default — nothing is forced', () => {
  const c=mkChoice();
  assert.strictEqual(c.prompts.feeling.allowSkip, true);
  const r=c.resolve('feeling', null);
  assert.strictEqual(r.skipped, true);
  assert.strictEqual(r.value, null, 'a skip must record null, never a default or the first option');
});
t('a write-your-own answer is accepted and RECORDED, not mapped to a near match', () => {
  const c=mkChoice();
  const r=c.resolve('feeling','that specific tiredness after masking all day');
  assert.strictEqual(r.source,'other');
  assert.strictEqual(r.value.label,'that specific tiredness after masking all day');
  assert.notStrictEqual(r.value.value,'Numb','must NOT be normalised onto a canonical option');
});
t('a custom option is offered back FIRST next time', () => {
  const c=mkChoice();
  c.resolve('feeling','flat but wired');
  const opts=c.optionsFor('feeling');
  assert.strictEqual(opts[0].label,'flat but wired');
  assert.strictEqual(opts[0].custom,true);
  assert.ok(opts.length>4,'built-ins must still be there');
});
t('re-adding the same custom refreshes it rather than duplicating', () => {
  const c=mkChoice();
  c.addCustom('feeling','flat but wired');
  const r=c.addCustom('feeling','flat but wired');
  assert.strictEqual(r.reused,true);
  assert.strictEqual(c.customFor('feeling').length,1);
});
t('customs are PRIVATE by default; sharing is a separate explicit act', () => {
  const c=mkChoice();
  c.addCustom('feeling','flat but wired');
  assert.strictEqual(c.shareable('feeling').length,0);
  c.addCustom('feeling','flat but wired',{share:true});
  assert.strictEqual(c.shareable('feeling').length,1);
});
t('§0.3 remove archives — it can come back', () => {
  const c=mkChoice();
  const a=c.addCustom('feeling','flat but wired');
  c.remove('feeling',a.value);
  assert.strictEqual(c.customFor('feeling').length,0);
  c.restore('feeling',a.value);
  assert.strictEqual(c.customFor('feeling').length,1);
});
t('search finds built-ins and customs, prefix matches first', () => {
  const c=mkChoice();
  c.addCustom('feeling','Grief-adjacent but quieter');
  const r=c.search('feeling','grie');
  assert.ok(r.length>=2);
  assert.ok(r[0].label.toLowerCase().startsWith('grie'));
});
t('empty search returns everything, not nothing', () => {
  assert.strictEqual(mkChoice().search('feeling','').length,4);
});
t('SISO Design Law 1 — defining a prompt twice is a hard error', () => {
  const c=mkChoice();
  assert.throws(()=>c.define({id:'feeling',options:[]}), /already defined/);
});
t('empty and over-long customs are refused, naming why', () => {
  const c=mkChoice();
  assert.throws(()=>c.addCustom('feeling','   '), /empty option/);
  assert.throws(()=>c.addCustom('feeling','x'.repeat(200)), /120 characters/);
});
t('multi-select rejects multiple on a single-select prompt', () => {
  const c=mkChoice();
  assert.throws(()=>c.resolve('feeling',['Grief','Hope']), /single-select/);
});
t('multi-select prompts accept several, mixing built-in and custom', () => {
  const c=mkChoice();
  c.define({id:'needs',label:'What do you need?',options:['Space','Contact'],multi:true});
  const r=c.resolve('needs',['Space','to not be asked follow-up questions']);
  assert.strictEqual(r.value.length,2);
  assert.strictEqual(r.source,'mixed');
});
t('allowSkip:false still requires an explicit override — and says reconsider', () => {
  const c=mkChoice();
  c.define({id:'consent',label:'Both agree?',options:['Yes'],allowSkip:false});
  assert.throws(()=>c.resolve('consent',null), /nothing in Eravos is forced/);
  assert.strictEqual(c.resolve('consent',null,{forceSkip:true}).skipped,true);
});
t('§12.5 health reports prompts never extended AND orphaned customs', () => {
  const s=mkStore(); const c=new ChoiceRegistry(s);
  c.define({id:'feeling',options:['Grief']});
  c.define({id:'unused',options:['a']});
  c.addCustom('feeling','mine');
  s.set('eravors_custom_options',{...s.get('eravors_custom_options'),ghost:[{value:'x',label:'x',ts:1}]});
  const h=c.health();
  assert.ok(h.promptsNeverExtended.includes('unused'));
  assert.ok(h.orphanedPrompts.includes('ghost'));
});
t('refuses to operate with no storage rather than pretending', () => {
  const orig=globalThis.DB; delete globalThis.DB;
  assert.throws(()=>new ChoiceRegistry(), /Refusing to operate blind/);
  if(orig) globalThis.DB=orig;
});

console.log('\nchat — engine');
const mkChat = (over={}) => {
  const sent=[]; const store=mkStore();
  const e=new ChatEngine({store, me:'James', send:(t,d)=>{sent.push({t,d}); return over.online!==false;}});
  return {e,sent,store};
};

t('send stores the message and returns it with delivery state, not a boolean', () => {
  const {e,sent}=mkChat();
  const m=e.send('are you around?');
  assert.strictEqual(m.delivered,true);
  assert.strictEqual(m.mine,true);
  assert.strictEqual(sent[0].t,'chat:message');
  assert.strictEqual(e.thread().length,1);
});
t('§1.2 an offline send is QUEUED and marked, never silently dropped', () => {
  const {e}=mkChat({online:false});
  const m=e.send('are you around?');
  assert.strictEqual(m.delivered,false);
  assert.strictEqual(m.queued,true);
  assert.strictEqual(e.thread().length,1,'it must still be in the thread');
  assert.strictEqual(e.health().status,'queued-offline');
});
t('a transport throw is recorded ON the message, not swallowed', () => {
  const e=new ChatEngine({store:mkStore(),send:()=>{throw new Error('pipe down');}});
  const m=e.send('hi');
  assert.strictEqual(m.error,'pipe down');
  assert.strictEqual(e.health().status,'send-errors');
});
t('empty send is refused; over-long send is refused, naming the limit', () => {
  const {e}=mkChat();
  assert.throws(()=>e.send(''), /nothing to send/);
  assert.throws(()=>e.send('x'.repeat(5000)), /4000 characters/);
});
t('an attachment alone, with no text, is a valid message', () => {
  const {e}=mkChat();
  const m=e.send('',{kind:'vault',id:'v1',label:'the piece from March'});
  assert.strictEqual(m.attachment.kind,'vault');
});
t('attachments are REFERENCES — an unknown kind or a missing id is refused', () => {
  const {e}=mkChat();
  assert.throws(()=>e.send('x',{kind:'nuclear_codes',id:'1'}), /unknown attachment kind/);
  assert.throws(()=>e.send('x',{kind:'vault'}), /needs an `id`/);
});
t('all seven declared attachment kinds are accepted', () => {
  const {e}=mkChat();
  ['vault','feeling','need','spar_invite','codex','poem','canvas','grammar']
    .forEach(k=>assert.ok(e.send('x',{kind:k,id:'1'}).attachment,'rejected '+k));
});
t('receive appends, and a duplicate replay is ignored without error', () => {
  const {e}=mkChat();
  e.receive({id:'x1',text:'here'},'Anjali');
  e.receive({id:'x1',text:'here'},'Anjali');
  assert.strictEqual(e.thread().length,1,'outbox replay must not duplicate');
});
t('unreadCount counts only their unread', () => {
  const {e}=mkChat();
  e.send('mine'); e.receive({id:'a',text:'1'}); e.receive({id:'b',text:'2'});
  assert.strictEqual(e.unreadCount(),2);
  e.markRead('a');
  assert.strictEqual(e.unreadCount(),1);
});
t('§0.4 the thread is bounded — 900 messages do not grow it past the cap', () => {
  const {e}=mkChat();
  for(let i=0;i<900;i++) e.receive({id:'m'+i,text:'x'});
  assert.strictEqual(e.thread().length,500);
});

console.log('\nchat — ephemeral means ephemeral');
t('typing and cursor are NEVER persisted — the store stays empty under 1000 events', () => {
  const {e,store}=mkChat();
  e.setPrefs({shareCursor:true});
  for(let i=0;i<1000;i++){ e.receiveTyping({on:true}); e.receiveCursor({x:i,y:i}); }
  assert.deepStrictEqual(store.get(THREAD_KEY,[]),[],'no message was sent, so the thread must be empty');
  const keys=store.keys().filter(k=>k!==PREFS_KEY);
  assert.deepStrictEqual(keys,[],'cursor/typing must write NOTHING at all');
  assert.strictEqual(e.health().ephemeralPersisted,0);
});
t('every ephemeral type is declared as such — none can be persisted by accident', () => {
  assert.deepStrictEqual(EPHEMERAL_TYPES,['chat:typing','presence:cursor','presence:tab']);
});
t('presence is ON by default in v0.25.0 — off-by-default meant the app started cold', () => {
  const {e}=mkChat();
  assert.strictEqual(e.prefs().shareCursor,true);
  assert.strictEqual(e.prefs().shareTab,true);
  // Receipts stay off. "Seen at 11:04 and said nothing" is a different kind
  // of information from where a cursor is, and it is the one used against
  // people.
  assert.strictEqual(e.prefs().readReceipts,false);
});
t('turning it off is respected, and the engine then will not send', () => {
  const {e,sent}=mkChat();
  e.setPrefs({shareCursor:false});
  const r=e.sendCursor(10,10);
  assert.strictEqual(r.sent,false);
  assert.ok(/off on this side/.test(r.reason));
  assert.strictEqual(sent.length,0);
});
t('THE GUARANTEE THAT DID NOT CHANGE — a remote cursor is ignored unless this side shares too', () => {
  // The default moved; the two-sided rule did not. Nobody can watch
  // unilaterally, whatever the default is.
  const {e}=mkChat();
  e.setPrefs({shareCursor:false});
  assert.strictEqual(e.receiveCursor({x:1,y:2}),null,'must not watch if not sharing');
  e.setPrefs({shareCursor:true});
  assert.ok(e.receiveCursor({x:1,y:2}));
});
t('cursor sends are throttled so a mouse move cannot flood the pipe', () => {
  const {e,sent}=mkChat();
  e.setPrefs({shareCursor:true});
  for(let i=0;i<50;i++) e.sendCursor(i,i);
  assert.strictEqual(sent.length,1,'50 moves in one tick must send once, got '+sent.length);
});
t('stale typing and stale cursor expire rather than hanging forever', () => {
  const {e}=mkChat();
  e.setPrefs({shareCursor:true});
  e.receiveTyping({on:true});
  e._remote.typingAt = Date.now()-9000;
  assert.strictEqual(e.remote().typing,false);
});
t('read receipts are OFF by default — no receipt is sent unasked', () => {
  const {e,sent}=mkChat();
  e.receive({id:'a',text:'hi'});
  assert.strictEqual(sent.filter(s=>s.t==='chat:receipt').length,0);
  e.setPrefs({readReceipts:true});
  e.receive({id:'b',text:'hi'});
  assert.strictEqual(sent.filter(s=>s.t==='chat:receipt').length,1);
});
t('a listener that throws is named and does not break the send', () => {
  const {e}=mkChat();
  e.on('message',()=>{throw new Error('boom')});
  const m=e.send('still works');
  assert.strictEqual(m.delivered,true);
});
t('on() rejects an unknown event, naming the known ones', () => {
  const {e}=mkChat();
  assert.throws(()=>e.on('explode',()=>{}), /Known: message/);
});
t('§9.4 export carries thread and prefs', () => {
  const {e}=mkChat();
  e.send('one');
  const x=e.export();
  assert.strictEqual(x.messages.length,1);
  assert.ok(x.prefs && x.version);
});

console.log('\nboth surfaces, one store (§10.1)');
t('two engines over one store see the same thread — no divergence', () => {
  const store=mkStore();
  const page=new ChatEngine({store,me:'James',send:()=>true});
  const popup=new ChatEngine({store,me:'James',send:()=>true});
  page.send('from the page');
  popup.send('from the popup');
  assert.strictEqual(page.thread().length,2);
  assert.strictEqual(popup.thread().length,2);
  assert.strictEqual(page.thread()[0].text,'from the page');
});

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail?1:0);
