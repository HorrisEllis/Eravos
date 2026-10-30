'use strict';
/**
 * GlobalIndex.js — the ONE piece of this system that is not
 * per-user-encrypted, because it has to be readable before anyone has
 * logged in (you need it to find a user by email in the first place).
 *
 * It deliberately holds almost nothing sensitive:
 *   - SHA-256(lowercased email)  -> userId      (not the email itself)
 *   - SHA-256(lowercased username) -> userId    (not the username itself)
 *   - userId -> { dir }                          (where that user's encrypted db lives)
 *   - inviteCode -> { inviterUserId, expiresAt, used }
 *   - coupleId -> { members: [userIdA, userIdB], dir }
 *
 * Actual emails/usernames/passwords/onboarding answers/chat/etc. all live
 * inside each user's own encrypted Database, never here.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function hashLookup(value) {
  return crypto.createHash('sha256').update(String(value).trim().toLowerCase()).digest('hex');
}

class GlobalIndex {
  constructor(dir) {
    this.dir = dir;
    this.file = path.join(dir, 'global-index.json');
    fs.mkdirSync(dir, { recursive: true });
    if (!fs.existsSync(this.file)) {
      this._write({ emailToUser: {}, usernameToUser: {}, users: {}, invites: {}, couples: {} });
    }
  }

  _read() {
    return JSON.parse(fs.readFileSync(this.file, 'utf8'));
  }

  _write(data) {
    const tmp = `${this.file}.tmp.${process.pid}`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
    fs.renameSync(tmp, this.file);
  }

  registerUser(userId, { email, username, dir }) {
    const data = this._read();
    const emailKey = hashLookup(email);
    const usernameKey = hashLookup(username);
    if (data.emailToUser[emailKey]) throw new Error('An account with that email already exists.');
    if (data.usernameToUser[usernameKey]) throw new Error('That username is taken.');
    data.emailToUser[emailKey] = userId;
    data.usernameToUser[usernameKey] = userId;
    data.users[userId] = { dir, createdAt: new Date().toISOString() };
    this._write(data);
  }

  findUserIdByEmail(email) {
    const data = this._read();
    return data.emailToUser[hashLookup(email)] || null;
  }

  findUserIdByUsername(username) {
    const data = this._read();
    return data.usernameToUser[hashLookup(username)] || null;
  }

  getUserDir(userId) {
    const data = this._read();
    const rec = data.users[userId];
    return rec ? rec.dir : null;
  }

  createInvite(code, inviterUserId, ttlMs = 24 * 60 * 60 * 1000) {
    const data = this._read();
    data.invites[code] = {
      inviterUserId,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + ttlMs).toISOString(),
      used: false,
    };
    this._write(data);
  }

  getInvite(code) {
    const data = this._read();
    return data.invites[code] || null;
  }

  markInviteUsed(code) {
    const data = this._read();
    if (data.invites[code]) {
      data.invites[code].used = true;
      this._write(data);
    }
  }

  codeExists(code) {
    const data = this._read();
    return Boolean(data.invites[code]);
  }

  registerCouple(coupleId, { members, dir }) {
    const data = this._read();
    data.couples[coupleId] = { members, dir, createdAt: new Date().toISOString() };
    this._write(data);
  }

  getCouple(coupleId) {
    const data = this._read();
    return data.couples[coupleId] || null;
  }

  /** Find an existing couple containing both of these user ids, if any. */
  findCoupleByMembers(userIdA, userIdB) {
    const data = this._read();
    for (const [coupleId, rec] of Object.entries(data.couples)) {
      if (rec.members.includes(userIdA) && rec.members.includes(userIdB)) {
        return { coupleId, ...rec };
      }
    }
    return null;
  }
}

module.exports = { GlobalIndex, hashLookup };
