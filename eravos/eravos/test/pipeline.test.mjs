// §12.1 brutal. The consent rules here decide whether one person can import
// another person's messages, so they are asserted structurally.
import assert from 'assert';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { Pipeline, SOURCES, KINDS, CONSENT_TTL_MS, fingerprint } = require('../shared/eravos-pipeline.js');
const fs = require('fs');

function mkStore(){ const m=new Map(); return {_m:m,get:(k,d)=>(m.has(k)?m.get(k):(d!==undefined?d:null)),
  set:(k,v)=>m.set(k,v),keys:()=>[...m.keys()]}; }
let CLOCK = 1_700_000_000_000;
const rig = () => { const s=mkStore(), got=[];
  return { s, got, p: new Pipeline({ store:s, now:()=>CLOCK, sink:r=>got.push(r) }) }; };
const granted = () => { const r = rig(); r.p.grant('instagram','self'); r.p.grant('instagram','partner'); return r; };

let pass=0,fail=0;
const t=(n,f)=>{try{CLOCK=1_700_000_000_000;f();console.log('  ok  - '+n);pass++}catch(e){console.log('  FAIL- '+n+'\n        '+e.message);fail++}};

console.log('\npipeline — consent is the only door');
t('an external source WITHOUT consent THROWS — it does not drop quietly', () => {
  const { p } = rig();
  assert.throws(() => p.ingest({ source:'instagram', kind:'message', text:'hey' }),
    /refusing "instagram".*both sides/s);
});
t('ONE side is not consent, and it names who is missing', () => {
  const { p } = rig();
  const g = p.grant('instagram','self');
  assert.strictEqual(g.both, false);
  assert.strictEqual(g.waitingOn, 'partner');
  assert.throws(() => p.ingest({ source:'instagram', kind:'message', text:'hey' }), /waiting on them/);
});
t('both sides opens it', () => {
  const { p, got } = granted();
  assert.strictEqual(p.ingest({ source:'instagram', kind:'message', text:'hey' }).accepted, true);
  assert.strictEqual(got.length, 1);
});
t('an INTERNAL source needs no consent — that is you in your own app', () => {
  const { p } = rig();
  assert.strictEqual(p.ingest({ source:'eravos', kind:'rupture', text:'we circled again' }).accepted, true);
  assert.strictEqual(p.grant('eravos','self').note.includes('no consent needed'), true);
});
t('§"re-asked occasionally" — consent EXPIRES rather than lasting forever', () => {
  const { p } = granted();
  assert.strictEqual(p.consentState('instagram').allowed, true);
  CLOCK += CONSENT_TTL_MS + 86400000;
  const c = p.consentState('instagram');
  assert.strictEqual(c.allowed, false);
  assert.strictEqual(c.expired, true);
  assert.ok(/needs asking again/.test(c.reason));
});
t('either side revokes ALONE, instantly', () => {
  const { p } = granted();
  p.revoke('instagram');
  assert.strictEqual(p.consentState('instagram').allowed, false);
  assert.throws(() => p.ingest({ source:'instagram', kind:'message', text:'x' }), /refusing/);
});
t('an adapter cannot bypass it — the sink is never reached on refusal', () => {
  const { p, got } = rig();
  try { p.ingest({ source:'threads', kind:'message', text:'x' }); } catch (e) {}
  assert.strictEqual(got.length, 0, 'nothing may reach the sink without consent');
  assert.strictEqual(p.health().consentBypassable, false);
});

console.log('\npipeline — the scraper problem');
t('re-reading the SAME message is idempotent when the platform gives an id', () => {
  const { p } = granted();
  const m = { source:'instagram', kind:'message', text:'are you around?', originalId:'ig_9931' };
  assert.strictEqual(p.ingest({ ...m, ts: 1 }).accepted, true);
  assert.strictEqual(p.ingest({ ...m, ts: 999999 }).accepted, false, 'a re-read must not create a second record');
});
t('§0.1 without an id, time is IGNORED — my minute-bucket version failed this', () => {
  // Two reads forty seconds apart straddled a minute boundary and produced
  // two records. There is no bucket size that does not have that edge.
  assert.strictEqual(
    fingerprint('threads','message','same words',1700000000000,null),
    fingerprint('threads','message','same words',1700000040000,null),
    'a continuous scraper would flood the lattice with the same conversation');
});
t('different text still produces different records', () => {
  assert.notStrictEqual(
    fingerprint('threads','message','one thing',0,null),
    fingerprint('threads','message','another thing',0,null));
});
t('§0.4 the dedupe list is bounded', () => {
  const { p, s } = granted();
  for (let i=0;i<5000;i++) p.ingest({ source:'instagram', kind:'message', text:'m'+i });
  assert.ok(s.get('eravors_pipeline_seen').length <= 4000);
});

console.log('\npipeline — the envelope');
t('every record carries provenance — where it came from and whether it was external', () => {
  const { got } = (() => { const r = granted();
    r.p.ingest({ source:'instagram', kind:'message', text:'hey', adapter:'bridge/1' }); return r; })();
  const rec = got[0];
  assert.strictEqual(rec.provenance.source, 'instagram');
  assert.strictEqual(rec.provenance.external, true);
  assert.strictEqual(rec.provenance.adapter, 'bridge/1');
});
t('the FOUR measures are carried, not recomputed downstream', () => {
  const { p, got } = granted();
  p.ingest({ source:'instagram', kind:'message', text:'x',
             invariant:['circling'], sigma:2.4, delta:{valence:-0.3}, divergence:['needs vs lexical'] });
  const m = got[0].measures;
  assert.deepStrictEqual(m.invariant, ['circling'], 'what persists');
  assert.strictEqual(m.sigma, 2.4, 'deviation from YOUR baseline');
  assert.deepStrictEqual(m.delta, {valence:-0.3}, 'what moved');
  assert.deepStrictEqual(m.divergence, ['needs vs lexical'], 'instruments disagreeing on one moment');
});
t('unknown source or kind is refused, listing the real ones', () => {
  const { p } = rig();
  assert.ok(/Known: eravos, emergence/.test(p.ingest({source:'tiktok',kind:'message',text:'x'}).reason));
  assert.ok(/Known: message, feeling/.test(p.ingest({source:'eravos',kind:'vibes',text:'x'}).reason));
});
t('empty text is refused without throwing', () => {
  const { p } = rig();
  assert.strictEqual(p.ingest({source:'eravos',kind:'note',text:'   '}).accepted, false);
});
t('speaker defaults to partner, not self — mislabelling your words as theirs is the worse error', () => {
  const { p, got } = rig();
  p.ingest({ source:'eravos', kind:'note', text:'x' });
  assert.strictEqual(got[0].speaker, 'self', 'explicit default for internal');
  p.ingest({ source:'eravos', kind:'note', text:'y', speaker:'partner' });
  assert.strictEqual(got[1].speaker, 'partner');
});
t('a sink that throws is named and does not lose the acceptance', () => {
  const s = mkStore();
  const p = new Pipeline({ store:s, now:()=>CLOCK, sink:()=>{ throw new Error('boom'); } });
  assert.strictEqual(p.ingest({source:'eravos',kind:'note',text:'x'}).accepted, true);
  assert.strictEqual(p.health().sinkErrors, 1);
});

console.log('\npipeline — withdrawal');
t('purge forgets one source and leaves the others', () => {
  const { p } = granted();
  p.ingest({ source:'instagram', kind:'message', text:'a' });
  p.ingest({ source:'eravos', kind:'note', text:'b' });
  const r = p.purge('instagram');
  assert.strictEqual(r.forgotten, 1);
  assert.strictEqual(p.health().seenIds, 1);
});
t('refuses to operate with no storage', () => {
  const orig = globalThis.DB; delete globalThis.DB;
  assert.throws(() => new Pipeline(), /Refusing to operate blind/);
  if (orig) globalThis.DB = orig;
});

console.log('\nuserscript — the narrow contract');
t('it matches ONLY direct-message pages, never a profile or feed', () => {
  const src = fs.readFileSync(new URL('../../userscript/eravos-bridge.user.js', import.meta.url), 'utf8');
  const matches = [...src.matchAll(/^\/\/ @match\s+(\S+)/gm)].map(m => m[1]);
  assert.ok(matches.length > 0);
  assert.ok(matches.some(m => m.includes('/direct/')), 'instagram match must be scoped to DMs');
  assert.ok(!matches.some(m => /\*\.\*|<all_urls>/.test(m)), 'no wildcard host match');
});
t('it has no storage, no third party, and posts only to the configured Eravos', () => {
  const src = fs.readFileSync(new URL('../../userscript/eravos-bridge.user.js', import.meta.url), 'utf8');
  const body = src.replace(/\/\*[\s\S]*?\*\//g,'').replace(/^\s*\/\/.*$/gm,'');
  ['GM_setValue','GM_xmlhttpRequest','analytics','googleapis','sentry']
    .forEach(tok => assert.ok(!body.includes(tok), 'found "' + tok + '"'));
  assert.ok(/@grant\s+none/.test(src), 'it must request no privileged APIs');
});
t('it reads NOTHING when the open thread is not the named contact', () => {
  const src = fs.readFileSync(new URL('../../userscript/eravos-bridge.user.js', import.meta.url), 'utf8');
  assert.ok(/if \(!open \|\| open\.toLowerCase\(\) !== cfg\.handle\.toLowerCase\(\)\) return \[\];/.test(src),
    'it must return before reading, not read and filter');
});

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail?1:0);
