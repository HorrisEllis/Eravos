'use strict';
/** Minimal smoke test — run with: node test/smoke.test.js */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { UserStore } = require('../src/users/UserStore.js');
const { InviteCode } = require('../src/partners/InviteCode.js');

function test(name, fn) {
  try {
    fn();
    console.log('  ok -', name);
  } catch (e) {
    console.error('  FAIL -', name, '\n     ', e.message);
    process.exitCode = 1;
  }
}

const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'eravos-db-smoke-'));
const users = new UserStore(dataRoot);
const invites = new InviteCode(dataRoot);

test('create user and read back a field', () => {
  const u = users.createUser({ email: 'a@x.com', username: 'a', password: 'password123' });
  const profile = u.db.table('profile').get(u.userId);
  assert.strictEqual(profile.email, 'a@x.com');
});

test('duplicate email is rejected', () => {
  assert.throws(() => {
    users.createUser({ email: 'a@x.com', username: 'different', password: 'password123' });
  }, /already exists/);
});

test('wrong password is rejected on login', () => {
  users.createUser({ email: 'b@x.com', username: 'b', password: 'correctpassword' });
  assert.throws(() => users.login('b', 'wrongpassword'), /Incorrect password/);
});

test('correct password logs in and decrypts data', () => {
  const session = users.login('b', 'correctpassword');
  const profile = session.db.table('profile').get(session.userId);
  assert.strictEqual(profile.username, 'b');
});

test('on-disk row content is not plaintext-searchable', () => {
  const u = users.createUser({ email: 'secret@x.com', username: 'secretuser', password: 'password123' });
  u.db.table('onboarding_answers').insert({ questionKey: 'q', answer: 'A VERY PRIVATE ANSWER', answeredAt: new Date().toISOString() });
  const storeDir = path.join(users.getUserDirById(u.userId), 'store');
  const files = fs.readdirSync(storeDir, { recursive: true }).filter((f) => !fs.statSync(path.join(storeDir, f)).isDirectory());
  const anyPlaintext = files.some((f) => fs.readFileSync(path.join(storeDir, f), 'utf8').includes('A VERY PRIVATE ANSWER'));
  assert.strictEqual(anyPlaintext, false, 'found plaintext secret in store!');
});

test('invite + redeem creates a couple both members can open', () => {
  const alice = users.createUser({ email: 'alice@x.com', username: 'alice', password: 'alicepassword' });
  const bob = users.createUser({ email: 'bob@x.com', username: 'bob', password: 'bobpassword' });
  const code = invites.generate(alice.userId);
  const { coupleDb } = invites.redeem(code, {
    inviteeUserId: bob.userId,
    inviteeMasterKey: bob.masterKey,
    inviteeDb: bob.db,
    openInviter: () => ({ db: alice.db, masterKey: alice.masterKey }),
  });
  coupleDb.table('chat_messages').insert({ senderUserId: alice.userId, text: 'hi', sentAt: new Date().toISOString(), emergenceProcessed: false });

  const bobSession = users.login('bob', 'bobpassword');
  const reopened = invites.openCoupleAsMember(bobSession.userId, bobSession.db, bobSession.masterKey);
  assert.strictEqual(reopened.coupleDb.table('chat_messages').all().length, 1);
});

test('reused invite code is rejected', () => {
  const carol = users.createUser({ email: 'carol@x.com', username: 'carol', password: 'carolpassword' });
  const dave = users.createUser({ email: 'dave@x.com', username: 'dave', password: 'davepassword' });
  const eve = users.createUser({ email: 'eve@x.com', username: 'eve', password: 'evepassword' });
  const code = invites.generate(carol.userId);
  invites.redeem(code, { inviteeUserId: dave.userId, inviteeMasterKey: dave.masterKey, inviteeDb: dave.db, openInviter: () => ({ db: carol.db, masterKey: carol.masterKey }) });
  assert.throws(() => {
    invites.redeem(code, { inviteeUserId: eve.userId, inviteeMasterKey: eve.masterKey, inviteeDb: eve.db, openInviter: () => ({ db: carol.db, masterKey: carol.masterKey }) });
  }, /already been used/);
});

console.log('\nDone.');
