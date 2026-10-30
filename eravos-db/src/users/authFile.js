'use strict';
/**
 * authFile.js — the one small piece of unencrypted-on-disk data a user
 * has: <userDir>/auth.json holding their password verification hash and
 * their master key wrapped under a password-derived KEK.
 *
 * This has to live outside the encrypted table store (Table.js), or you
 * get a chicken-and-egg problem: you'd need the master key to decrypt the
 * row that tells you how to derive the master key. Storing it in the
 * clear is safe here because:
 *   - passwordHash is a one-way scrypt hash (can't be reversed to the password)
 *   - wrappedMasterKey is itself an AES-256-GCM ciphertext — unwrappable
 *     only by someone who has the correct password to re-derive the KEK.
 * Nothing here is useful to an attacker without the password.
 */

const fs = require('fs');
const path = require('path');

function authFilePath(userDir) {
  return path.join(userDir, 'auth.json');
}

function writeAuthFile(userDir, { passwordHash, wrappedMasterKey, wrappedMasterKeySalt }) {
  fs.mkdirSync(userDir, { recursive: true });
  const file = authFilePath(userDir);
  const tmp = `${file}.tmp.${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify({ passwordHash, wrappedMasterKey, wrappedMasterKeySalt }, null, 2));
  fs.renameSync(tmp, file);
}

function readAuthFile(userDir) {
  const file = authFilePath(userDir);
  if (!fs.existsSync(file)) throw new Error('No account data found at this location.');
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

module.exports = { writeAuthFile, readAuthFile };
