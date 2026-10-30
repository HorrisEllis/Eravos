'use strict';
/**
 * Cipher.js — real AES-256-GCM encryption at rest, using only Node's
 * built-in crypto module (no dependency, matching the rest of this
 * project's zero-dependency approach).
 *
 * Two layers:
 *  - deriveKeyFromPassword(password, salt): scrypt KDF, used only to
 *    wrap/unwrap a random per-user "master key" (envelope encryption).
 *    Never used to encrypt data directly, so changing a password never
 *    requires re-encrypting the user's whole database — only the
 *    small wrapped-key blob gets re-wrapped.
 *  - encrypt/decrypt: AES-256-GCM with a random 12-byte IV per call
 *    and an authentication tag, so tampering is detected, not just
 *    unreadable.
 */

const crypto = require('crypto');

const SCRYPT_N = 16384; // scrypt cost parameter — deliberately expensive against offline guessing
const KEY_LEN = 32;     // AES-256

function deriveKeyFromPassword(password, salt) {
  return crypto.scryptSync(password, salt, KEY_LEN, { N: SCRYPT_N, r: 8, p: 1 });
}

function randomKey() {
  return crypto.randomBytes(KEY_LEN);
}

function randomSalt() {
  return crypto.randomBytes(16);
}

/** Encrypt a JS value (will be JSON-stringified) with a raw 32-byte key. */
function encrypt(key, value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const plaintext = Buffer.from(JSON.stringify(value), 'utf8');
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    data: ciphertext.toString('base64'),
  };
}

/** Decrypt the { iv, tag, data } envelope produced by encrypt(). Throws if tampered. */
function decrypt(key, envelope) {
  const iv = Buffer.from(envelope.iv, 'base64');
  const tag = Buffer.from(envelope.tag, 'base64');
  const data = Buffer.from(envelope.data, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(data), decipher.final()]);
  return JSON.parse(plaintext.toString('utf8'));
}

/** Wrap a raw key (e.g. a master key or couple key) under a KEK. Returns a storable envelope + the salt used. */
function wrapKey(kek, rawKeyToWrap) {
  return encrypt(kek, rawKeyToWrap.toString('base64'));
}

function unwrapKey(kek, wrappedEnvelope) {
  const b64 = decrypt(kek, wrappedEnvelope);
  return Buffer.from(b64, 'base64');
}

/** Password verification hash — separate from the data-encryption key entirely. */
function hashPassword(password) {
  const salt = randomSalt();
  const hash = crypto.scryptSync(password, salt, 64, { N: SCRYPT_N, r: 8, p: 1 });
  return { salt: salt.toString('base64'), hash: hash.toString('base64') };
}

function verifyPassword(password, stored) {
  const salt = Buffer.from(stored.salt, 'base64');
  const hash = crypto.scryptSync(password, salt, 64, { N: SCRYPT_N, r: 8, p: 1 });
  const candidate = Buffer.from(stored.hash, 'base64');
  return hash.length === candidate.length && crypto.timingSafeEqual(hash, candidate);
}

module.exports = {
  deriveKeyFromPassword,
  randomKey,
  randomSalt,
  encrypt,
  decrypt,
  wrapKey,
  unwrapKey,
  hashPassword,
  verifyPassword,
};
