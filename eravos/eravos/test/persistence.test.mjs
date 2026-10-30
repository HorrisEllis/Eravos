// §12.1 brutal. Both failure modes were REPRODUCED before this was written;
// these are the regressions that keep them from coming back.
import assert from 'assert';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { Persistence, LOG_KEY } = require('../shared/eravos-persistence.js');

function mkDb(seed={}){ const m=new Map(Object.entries(seed));
  return {_m:m,get:(k,d)=>(m.has(k)?m.get(k):(d!==undefined?d:null)),set:(k,v)=>m.set(k,v),keys:()=>[...m.keys()]}; }
let pass=0,fail=0;
const t=(n,f)=>{try{f();console.log('  ok  - '+n);pass++}catch(e){console.log('  FAIL- '+n+'\n        '+e.message);fail++}};

console.log('\npersistence — the orphan namespace');
t('THE REPRODUCED BUG — data written before login is adopted, not lost', () => {
  const db = mkDb({ solo_feeling: { name: 'Grief' }, solo_vault: ['before login'] });
  const r = new Persistence({ db }).adopt('james');
  assert.strictEqual(r.moved, 2);
  assert.deepStrictEqual(db.get('james_feeling'), { name: 'Grief' });
  assert.deepStrictEqual(db.get('james_vault'), ['before login']);
});
t('§1.2 a CONFLICT is never resolved by picking — both are kept', () => {
  const db = mkDb({ solo_vault: ['before'], james_vault: ['after'] });
  const r = new Persistence({ db }).adopt('james');
  assert.deepStrictEqual(r.conflicts, ['vault']);
  assert.deepStrictEqual(db.get('james_vault'), ['after'], 'the live one must not be overwritten');
  assert.deepStrictEqual(db.get('james__orphaned_vault'), ['before'], 'and the earlier one must survive');
  assert.ok(/Neither was overwritten/.test(r.note));
});
t('identical values on both sides are not a conflict', () => {
  const db = mkDb({ solo_x: [1,2], james_x: [1,2] });
  const r = new Persistence({ db }).adopt('james');
  assert.deepStrictEqual(r.conflicts, []);
  assert.strictEqual(r.alreadyIdentical, 1);
});
t('it is IDEMPOTENT — safe on every login', () => {
  const db = mkDb({ solo_feeling: { name: 'Grief' } });
  const p = new Persistence({ db });
  p.adopt('james');
  const second = p.adopt('james');
  assert.strictEqual(second.moved, 0);
  assert.deepStrictEqual(second.conflicts, []);
});
t('SYSTEM namespaces are never moved', () => {
  const db = mkDb({ eravors_users: { a: 1 }, eros_kv: 1, shared_vault: ['joint'], solo_feeling: 'x' });
  new Persistence({ db }).adopt('james');
  assert.deepStrictEqual(db.get('eravors_users'), { a: 1 }, 'account records must stay put');
  assert.strictEqual(db.get('james_users'), null);
  assert.deepStrictEqual(db.get('shared_vault'), ['joint']);
});
t('it NEVER deletes — the source key survives adoption', () => {
  const db = mkDb({ solo_feeling: { name: 'Grief' } });
  const p = new Persistence({ db });
  p.adopt('james');
  assert.deepStrictEqual(db.get('solo_feeling'), { name: 'Grief' }, 'a move that deletes is not recoverable');
  assert.strictEqual(p.health().deletesPerformed, 0);
});
t('adopting into the same namespace is a no-op, not a self-copy', () => {
  const db = mkDb({ solo_x: 1 });
  assert.strictEqual(new Persistence({ db }).adopt('solo').moved, 0);
});

console.log('\npersistence — solo history at the moment of pairing');
t('THE REPRODUCED BUG — shared_* is seeded so the history does not start today', () => {
  const db = mkDb({ james_vault: ['a year of writing'], james_codex: ['and this'] });
  const r = new Persistence({ db }).promote('james');
  assert.strictEqual(r.seeded, 2);
  assert.deepStrictEqual(db.get('shared_vault'), ['a year of writing']);
});
t('ADDITIVE ONLY — joint state is never replaced by one person\'s solo history', () => {
  const db = mkDb({ james_vault: ['mine alone'], shared_vault: ['ours already'] });
  const r = new Persistence({ db }).promote('james');
  assert.strictEqual(r.leftAlone, 1);
  assert.deepStrictEqual(db.get('shared_vault'), ['ours already'], 'this is the one that must not move');
  assert.ok(/must not silently replace joint state/.test(r.note));
});
t('archived conflict keys are not promoted into shared', () => {
  const db = mkDb({ 'james__orphaned_vault': ['old'], james_vault: ['current'] });
  new Persistence({ db }).promote('james');
  assert.strictEqual(db.get('shared__orphaned_vault'), null, 'an archive must not become joint state');
  assert.deepStrictEqual(db.get('shared_vault'), ['current']);
});
t('promote without a prefix throws rather than guessing', () => {
  assert.throws(() => new Persistence({ db: mkDb() }).promote(''), /prefix is required/);
});

console.log('\npersistence — visibility');
t('inspect() shows what WOULD move, without moving it', () => {
  const db = mkDb({ solo_feeling: 1, james_vault: 2, shared_vault: 3 });
  const p = new Persistence({ db });
  const i = p.inspect('james');
  assert.deepStrictEqual(i.orphaned, ['feeling']);
  assert.deepStrictEqual(i.wouldAdopt, ['feeling']);
  assert.strictEqual(db.get('james_feeling'), null, 'inspect must not mutate');
});
t('§12.5 soloOnlyNotShared names how much would look like it started today', () => {
  const db = mkDb({ james_vault: 1, james_codex: 2, shared_vault: 1 });
  const h = new Persistence({ db }).health('james');
  assert.strictEqual(h.soloOnlyNotShared, 1);
});
t('every move is logged, bounded', () => {
  const db = mkDb({ solo_a: 1 });
  const p = new Persistence({ db });
  p.adopt('james');
  const log = db.get(LOG_KEY, []);
  assert.strictEqual(log.length, 1);
  assert.strictEqual(log[0].action, 'adopt');
});
t('refuses to operate with no storage', () => {
  const orig = globalThis.DB; delete globalThis.DB;
  assert.throws(() => new Persistence(), /Refusing to operate blind/);
  if (orig) globalThis.DB = orig;
});

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail?1:0);
