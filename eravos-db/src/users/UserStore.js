'use strict';
/**
 * UserStore.js — create_user, login, and access to a logged-in user's
 * own encrypted Database. This is the "create user, creates database"
 * piece: every user gets their own directory, their own FileStore/
 * FileRefs, their own encryption key — nobody else's login can decrypt
 * it, including whoever operates the machine, without the password.
 */

const path = require('path');
const crypto = require('crypto');
const { Database } = require('../core/Database.js');
const { GlobalIndex } = require('../index/GlobalIndex.js');
const { writeAuthFile, readAuthFile } = require('./authFile.js');
const cipher = require('../crypto/Cipher.js');
const userSchema = require('./schema.js');

class UserStore {
  /** @param {string} dataRoot - root directory for all app data */
  constructor(dataRoot) {
    this.dataRoot = dataRoot;
    this.index = new GlobalIndex(dataRoot);
  }

  _userDir(userId) {
    return path.join(this.dataRoot, 'users', userId);
  }

  /**
   * Create a new user + their own encrypted database in one step.
   * Returns { userId, db } — already "logged in" since we hold the
   * master key from having just generated it.
   */
  createUser({ email, username, password, displayName = '', onboarding = [] }) {
    if (!email || !username || !password) {
      throw new Error('email, username, and password are required.');
    }
    if (password.length < 8) {
      throw new Error('Password must be at least 8 characters.');
    }

    const userId = crypto.randomUUID();
    const dir = this._userDir(userId);

    // Envelope encryption: a random master key encrypts all of this user's
    // data; the master key itself is wrapped under a key derived from
    // their password, so changing the password only re-wraps this one
    // small blob, never the whole database.
    const masterKey = cipher.randomKey();
    const kekSalt = cipher.randomSalt();
    const kek = cipher.deriveKeyFromPassword(password, kekSalt);
    const wrappedMasterKey = cipher.wrapKey(kek, masterKey);
    const passwordHash = cipher.hashPassword(password);

    // Register in the global (non-sensitive) index FIRST so email/username
    // collisions are caught before any data is written to disk.
    this.index.registerUser(userId, { email, username, dir });

    writeAuthFile(dir, {
      passwordHash,
      wrappedMasterKey,
      wrappedMasterKeySalt: kekSalt.toString('base64'),
    });

    const db = new Database(dir, masterKey);
    db.defineSchema(userSchema);

    db.table('profile').insert(
      {
        email,
        username,
        displayName: displayName || username,
        coupleId: null,
        createdAt: new Date().toISOString(),
      },
      { id: userId }
    );

    for (const answer of onboarding) {
      db.table('onboarding_answers').insert({
        questionKey: answer.questionKey,
        answer: answer.answer,
        answeredAt: new Date().toISOString(),
      });
    }

    return { userId, db, masterKey };
  }

  /**
   * Log in with email-or-username + password. Throws on any mismatch.
   * On success, derives the master key and returns an open Database
   * handle — this whole step is what "authentication" means here: without
   * the right password there's no way to derive the KEK that unwraps the
   * master key, so the data stays unreadable.
   */
  login(emailOrUsername, password) {
    const userId =
      this.index.findUserIdByEmail(emailOrUsername) ||
      this.index.findUserIdByUsername(emailOrUsername);
    if (!userId) throw new Error('No account found.');

    const dir = this.index.getUserDir(userId);
    const { passwordHash, wrappedMasterKey, wrappedMasterKeySalt } = readAuthFile(dir);

    if (!cipher.verifyPassword(password, passwordHash)) {
      throw new Error('Incorrect password.');
    }

    const kek = cipher.deriveKeyFromPassword(password, Buffer.from(wrappedMasterKeySalt, 'base64'));
    const masterKey = cipher.unwrapKey(kek, wrappedMasterKey);

    const db = new Database(dir, masterKey);
    return { userId, db, masterKey };
  }

  getUserDirById(userId) {
    return this.index.getUserDir(userId);
  }
}

module.exports = { UserStore };
