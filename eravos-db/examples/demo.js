'use strict';
/**
 * demo.js — runs the whole flow end to end against a real temp directory:
 *   1. Create two users (you + her), each gets their own encrypted db.
 *   2. One generates an 8-digit invite code, the other redeems it.
 *   3. A shared couple database gets provisioned, key-wrapped for both.
 *   4. Write a chat message into the couple db, an onboarding answer and
 *      a module-state row into a private db.
 *   5. Log out and log back in as one user, prove data survives and is
 *      only readable with the right password.
 *   6. Show that update() preserves history (the content-addressed
 *      "time travel" you get for free).
 *
 * Run: node examples/demo.js
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { UserStore } = require('../src/users/UserStore.js');
const { InviteCode } = require('../src/partners/InviteCode.js');
const { Database } = require('../src/core/Database.js');
const emergenceSchema = require('../src/emergence/schema.js');

function line(title) {
  console.log('\n=== ' + title + ' ===');
}

function main() {
  const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'eravos-db-demo-'));
  console.log('Data root:', dataRoot);

  const users = new UserStore(dataRoot);
  const invites = new InviteCode(dataRoot);

  line('1. Create two users');
  const you = users.createUser({
    email: 'you@example.com',
    username: 'you',
    password: 'correct horse battery staple',
    onboarding: [{ questionKey: 'attachment_style', answer: 'anxious-leaning' }],
  });
  const her = users.createUser({
    email: 'her@example.com',
    username: 'partner',
    password: 'another very good password',
    onboarding: [{ questionKey: 'attachment_style', answer: 'secure' }],
  });
  console.log('you:', you.userId);
  console.log('her:', her.userId);

  line('2. Generate + redeem 8-digit invite code');
  const code = invites.generate(you.userId);
  console.log('Invite code:', code);

  const { coupleId, coupleDb } = invites.redeem(code, {
    inviteeUserId: her.userId,
    inviteeMasterKey: her.masterKey,
    inviteeDb: her.db,
    openInviter: (userId) => {
      // In the real app this would come from "you"'s active session.
      // Here we already have it since we just created the account.
      if (userId === you.userId) return { db: you.db, masterKey: you.masterKey };
      throw new Error('unknown inviter');
    },
  });
  console.log('Couple created:', coupleId);

  line('3. Write into the shared couple database');
  coupleDb.table('chat_messages').insert({
    senderUserId: you.userId,
    text: 'hey :) invite worked',
    sentAt: new Date().toISOString(),
    emergenceProcessed: false,
  });
  coupleDb.table('chat_messages').insert({
    senderUserId: her.userId,
    text: 'omg it did!!',
    sentAt: new Date().toISOString(),
    emergenceProcessed: false,
  });
  console.log('Chat messages:', coupleDb.table('chat_messages').all().map((m) => `${m.senderUserId.slice(0, 8)}: ${m.text}`));

  coupleDb.defineSchema(emergenceSchema);
  coupleDb.table('emergence_links').insert({
    coupleId,
    emergenceSpaceId: 'space-demo-1',
    userIdToPersonId: { [you.userId]: 'person-a', [her.userId]: 'person-b' },
    linkedAt: new Date().toISOString(),
  });

  line('4. Write module state into a private database');
  you.db.table('module_state').insert({
    module: 'feelings-checkin',
    key: '2026-08-27',
    value: { mood: 'content', note: 'good day' },
    updatedAt: new Date().toISOString(),
  });

  line('5. Log out, log back in — prove persistence + password-gating');
  let loggedIn = users.login('you', 'correct horse battery staple');
  console.log('Login OK. Onboarding answers:', loggedIn.db.table('onboarding_answers').all().map((a) => a.answer));

  try {
    users.login('you', 'wrong password');
    console.log('!! SHOULD NOT REACH HERE — wrong password was accepted');
  } catch (e) {
    console.log('Correctly rejected wrong password:', e.message);
  }

  line('6. Re-open the couple db as "her" after logging in fresh');
  const herSession = users.login('partner', 'another very good password');
  const reopened = invites.openCoupleAsMember(herSession.userId, herSession.db, herSession.masterKey);
  console.log('Re-opened couple chat as her:', reopened.coupleDb.table('chat_messages').all().length, 'messages');

  line('7. Update + history (content-addressed time travel)');
  const moodRowId = you.db.table('module_state').findOne((r) => r.module === 'feelings-checkin').id;
  you.db.table('module_state').update(moodRowId, { value: { mood: 'great', note: 'even better now' } });
  const hist = you.db.table('module_state').history(moodRowId);
  console.log('History entries for that row:', hist.map((h) => h.value.value));

  line('Done');
  console.log('(temp data left at', dataRoot, 'for inspection)');
}

main();
