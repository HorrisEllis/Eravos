// §12.1 brutal. §12.2 every test can fail informatively.
import assert from 'assert';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { AdminEngine, COCREATION_KEYS } = require('../shared/eravos-admin.js');

// A real in-memory store satisfying the same contract localStorage does.
// §1.2 -- not a mock that pretends; it actually stores and actually deletes.
function mkStore(seed = {}) {
  const m = new Map(Object.entries(seed));
  return {
    _m: m,
    get: (k, d) => (m.has(k) ? m.get(k) : (d !== undefined ? d : null)),
    set: (k, v) => m.set(k, v),
    remove: k => m.delete(k),
    keys: () => [...m.keys()],
  };
}
const seeded = () => mkStore({
  eravors_users: {
    james:  { name:'James',  email:'james',  password:'jh', role:'admin',   isAdmin:true,  dbPrefix:'james',  peerId:'p-james',  partnerId:'p-raven', mode:'duo' },
    raven:  { name:'Raven',  email:'raven',  password:'rh', role:'partner', isAdmin:false, dbPrefix:'raven',  peerId:'p-raven',  partnerId:'p-james', mode:'duo' },
  },
  eravors_active_user_key: 'raven',
  raven_feeling: { name:'Grief' },
  raven_vault: ['a','b'],
  raven_ruptures: [{ what:'x' }],
  raven_avatar_img: 'data:img',
  eravors_raven_theme: 'raven-theme',
  james_feeling: { name:'Hope' },
  james_vault: ['j'],
  eravors_partner_feeling_latest: { n:1 },
  eravors_pipeline_code: 'abc',
  shared_feeling: { n:2 },
  eravors_identity_priv: 'secret',
  eravors_outbox_james: [1,2],
});

let pass=0,fail=0;
const t=(n,f)=>{try{f();console.log('  ok  - '+n);pass++}catch(e){console.log('  FAIL- '+n+'\n        '+e.message);fail++}};

console.log('\nread + export');
t('users() lists both accounts with their real data-key counts (§2.3)', () => {
  const e=new AdminEngine(seeded());
  const u=e.users();
  assert.strictEqual(u.length,2);
  const r=u.find(x=>x.key==='raven');
  assert.strictEqual(r.dataKeys,5,'raven_feeling/vault/ruptures/avatar + eravors_raven_theme');
});
t('§9.4 exportUser captures every namespaced key', () => {
  const e=new AdminEngine(seeded());
  const x=e.exportUser('raven');
  assert.strictEqual(x.keyCount,5);
  assert.deepStrictEqual(x.data.raven_vault,['a','b']);
});
t('exporting an unknown user throws, naming it (§1.2)', () => {
  assert.throws(()=>new AdminEngine(seeded()).exportUser('nobody'), /no user "nobody"/);
});

console.log('\nedit');
t('editUser changes only whitelisted fields and reports each change', () => {
  const s=seeded(), e=new AdminEngine(s);
  const r=e.editUser('raven',{name:'Rae', password:'hacked', dbPrefix:'evil'});
  assert.deepStrictEqual(Object.keys(r.changed),['name']);
  assert.strictEqual(s.get('eravors_users').raven.password,'rh','password must not be editable here');
  assert.strictEqual(s.get('eravors_users').raven.dbPrefix,'raven','dbPrefix is rename()\'s job, not edit\'s');
});
t('role and isAdmin can never disagree (two fields, one fact)', () => {
  const s=seeded(), e=new AdminEngine(s);
  e.editUser('raven',{role:'admin'});
  assert.strictEqual(s.get('eravors_users').raven.isAdmin,true);
});

console.log('\nrename — SAME person, data follows');
t('every data key moves with them', () => {
  const s=seeded(), e=new AdminEngine(s);
  const r=e.renameUser('raven','anjali','Anjali');
  assert.strictEqual(r.keysMoved.length,5);
  assert.deepStrictEqual(s.get('anjali_vault'),['a','b']);
  assert.strictEqual(s.get('raven_vault',null),null,'old key must be gone, not duplicated');
  assert.strictEqual(s.get('eravors_users').anjali.name,'Anjali');
  assert.strictEqual(s.get('eravors_users').raven,undefined);
});
t('peer identity and crypto keys are PRESERVED — same party to the connection', () => {
  const s=seeded(), e=new AdminEngine(s);
  const r=e.renameUser('raven','anjali','Anjali');
  assert.strictEqual(r.peerIdPreserved,'p-raven');
  assert.strictEqual(r.cryptoIdentityPreserved,true);
  assert.strictEqual(s.get('eravors_identity_priv'),'secret');
});
t('active user pointer follows the rename', () => {
  const s=seeded(); new AdminEngine(s).renameUser('raven','anjali','Anjali');
  assert.strictEqual(s.get('eravors_active_user_key'),'anjali');
});
t('§0.3 a snapshot is returned whether or not it was asked for', () => {
  const r=new AdminEngine(seeded()).renameUser('raven','anjali','Anjali');
  assert.ok(r.snapshot && r.snapshot.keyCount===5);
});
t('rejects a malformed key and an existing key, naming why', () => {
  assert.throws(()=>new AdminEngine(seeded()).renameUser('raven','An Jali!'), /2-32 chars/);
  assert.throws(()=>new AdminEngine(seeded()).renameUser('raven','james'), /already exists/);
});
t('the other person is untouched', () => {
  const s=seeded(); new AdminEngine(s).renameUser('raven','anjali','Anjali');
  assert.deepStrictEqual(s.get('james_vault'),['j']);
});

console.log('\nreplace — DIFFERENT person, data does NOT follow');
t('§1.2 disposition has NO default — it must be chosen explicitly', () => {
  assert.throws(()=>new AdminEngine(seeded()).replacePartner('raven',{key:'anjali'},{}), /no default/i);
  assert.throws(()=>new AdminEngine(seeded()).replacePartner('raven',{key:'anjali'},{disposition:'maybe'}), /archive.*purge/);
});
t('the outgoing person\'s data does NOT transfer to the new namespace', () => {
  const s=seeded(), e=new AdminEngine(s);
  e.replacePartner('raven',{key:'anjali',name:'Anjali',password:'x'},{disposition:'archive'});
  assert.strictEqual(s.get('anjali_vault',null),null,'a new person must NOT inherit logged feelings');
  assert.strictEqual(s.get('raven_vault',null),null,'and the old key is vacated');
});
t('archive keeps it recoverable; purge does not', () => {
  const s1=seeded();
  new AdminEngine(s1).replacePartner('raven',{key:'anjali',password:'x'},{disposition:'archive'});
  assert.ok(s1.keys().some(k=>k.includes('archive_raven')&&k.endsWith('raven_vault')));
  const s2=seeded();
  new AdminEngine(s2).replacePartner('raven',{key:'anjali',password:'x'},{disposition:'purge'});
  assert.ok(!s2.keys().some(k=>k.includes('archive_raven')));
  assert.ok(!s2.keys().some(k=>k.startsWith('raven_')));
});
t('§17.5 a new peer identity is ISSUED, never inherited', () => {
  const s=seeded(), e=new AdminEngine(s);
  const r=e.replacePartner('raven',{key:'anjali',password:'x'},{disposition:'purge'});
  assert.notStrictEqual(r.incoming.peerId,'p-raven');
  assert.strictEqual(r.cryptoIdentityRegenerated,true);
  assert.strictEqual(s.get('eravors_identity_priv',null),null,'old crypto identity must be gone');
});
t('the admin counterpart is repointed at the new peer', () => {
  const s=seeded(), e=new AdminEngine(s);
  const r=e.replacePartner('raven',{key:'anjali',password:'x'},{disposition:'purge'});
  assert.strictEqual(s.get('eravors_users').james.partnerId,r.incoming.peerId);
});
t('the pair is torn down as part of the replacement', () => {
  const s=seeded(); new AdminEngine(s).replacePartner('raven',{key:'anjali',password:'x'},{disposition:'purge'});
  assert.strictEqual(s.get('eravors_partner_feeling_latest',null),null);
  assert.strictEqual(s.get('eravors_pipeline_code',null),null);
});
t('refuses to replace the admin account', () => {
  assert.throws(()=>new AdminEngine(seeded()).replacePartner('james',{key:'someone',password:'p'},{disposition:'purge'}), /refusing to replace the admin/);
});
t('james keeps his own data through a replacement', () => {
  const s=seeded(); new AdminEngine(s).replacePartner('raven',{key:'anjali',password:'x'},{disposition:'purge'});
  assert.deepStrictEqual(s.get('james_vault'),['j']);
});

console.log('\nremove');
t('refuses to remove the last admin — the app would be unadministrable', () => {
  const s=mkStore({eravors_users:{james:{name:'James',role:'admin',isAdmin:true,dbPrefix:'james'}}});
  assert.throws(()=>new AdminEngine(s).removeUser('james',{disposition:'purge'}), /last admin/);
});
t('removing unlinks whoever pointed at them', () => {
  const s=seeded(), e=new AdminEngine(s);
  const r=e.removeUser('raven',{disposition:'purge'});
  assert.deepStrictEqual(r.partnersUnlinked,['james']);
  assert.strictEqual(s.get('eravors_users').james.partnerId,null);
});

console.log('\nco-creation teardown');
t('clears pair state and unlinks both, but touches NEITHER private journal', () => {
  const s=seeded(), e=new AdminEngine(s);
  const r=e.clearCoCreation();
  COCREATION_KEYS.forEach(k=>assert.strictEqual(s.get(k,null),null,k+' should be cleared'));
  assert.strictEqual(s.get('shared_feeling',null),null);
  assert.strictEqual(s.get('eravors_outbox_james',null),null);
  assert.strictEqual(s.get('eravors_identity_priv',null),null);
  assert.deepStrictEqual(s.get('raven_vault'),['a','b'],'personal vault must survive');
  assert.deepStrictEqual(s.get('james_vault'),['j'],'personal vault must survive');
  assert.deepStrictEqual(r.partnersUnlinked.sort(),['james','raven']);
});
t('is idempotent — running twice reports nothing left to clear', () => {
  const s=seeded(), e=new AdminEngine(s);
  e.clearCoCreation();
  assert.strictEqual(e.clearCoCreation().keysCleared.length,0);
});

console.log('\nthemes');
t('§16.5 purgeThemes strips retired classes and resets user records', () => {
  const s=seeded(), e=new AdminEngine(s);
  const r=e.purgeThemes();
  assert.ok(r.keysCleared.includes('eravors_raven_theme'));
  assert.strictEqual(s.get('eravors_raven_theme',null),null);
  assert.deepStrictEqual(r.remaining,['(default) 🔥 Original Fire']);
});

console.log('\ndiagnostics');
t('§12.5 orphaned data prefixes are REPORTED, not hidden', () => {
  const s=seeded(); s.set('ghost_vault',['x']);
  assert.ok(new AdminEngine(s).health().orphanedDataPrefixes.includes('ghost'));
});
t('health() reports co-creation live before, and not after, teardown', () => {
  const s=seeded(), e=new AdminEngine(s);
  assert.strictEqual(e.health().coCreationActive,true);
  e.clearCoCreation();
  assert.strictEqual(e.health().coCreationActive,false);
});
t('refuses to operate with no storage at all rather than pretending', () => {
  const orig=globalThis.DB; delete globalThis.DB;
  assert.throws(()=>new AdminEngine(), /Refusing to operate blind/);
  if (orig) globalThis.DB=orig;
});

console.log('\nTHE ACTUAL JOB — replace Raven with Anjali, end to end');
t('full sequence leaves exactly one partner named Anjali, with no Raven residue', () => {
  const s=seeded(), e=new AdminEngine(s);
  e.purgeThemes();
  const r=e.replacePartner('raven',{key:'anjali',name:'Anjali',password:'newpass'},{disposition:'archive'});
  const users=e.users();
  assert.strictEqual(users.length,2);
  assert.ok(users.some(u=>u.key==='anjali'&&u.name==='Anjali'&&u.role==='partner'));
  assert.ok(!users.some(u=>u.key==='raven'));
  assert.strictEqual(s.get('anjali_vault',null),null,'Anjali starts with her own empty namespace');
  assert.ok(r.snapshot.keyCount>0,'Raven\'s data was exported before anything moved');
  assert.strictEqual(e.health().status,'healthy');
});

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail?1:0);
