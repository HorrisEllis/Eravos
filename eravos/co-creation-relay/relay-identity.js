'use strict';
/**
 * relay-identity.js — X25519 for the relay, Node side.
 *
 * The curve math below is copied verbatim from shared/eravos-crypto.js
 * (the browser module Eravos already uses for partner E2E encryption) —
 * same RFC 7748 Montgomery ladder, same raw 32-byte scalar/point format,
 * same base64 wire encoding. Client and server are the same math, not
 * two independent implementations that happen to agree — that's the
 * point: one curve implementation, reused, not reinvented per side.
 *
 * Everything below this comment that ISN'T curve math (HKDF, AES-GCM,
 * base64, randomness) uses Node's built-in `crypto` module instead of
 * SubtleCrypto, since this runs server-side.
 */

const crypto = require('crypto');

const P = (1n << 255n) - 19n;
const A24 = 121665n;

function mod(a, m) { const r = a % m; return r >= 0n ? r : r + m; }
function modpow(b, e, m) {
  b = mod(b, m); let r = 1n;
  while (e > 0n) {
    if (e & 1n) r = mod(r * b, m);
    e >>= 1n;
    b = mod(b * b, m);
  }
  return r;
}
function finv(x) { return modpow(x, P - 2n, P); }

function decodeLE(bytes) {
  let n = 0n;
  for (let i = bytes.length - 1; i >= 0; i--) n = (n << 8n) | BigInt(bytes[i]);
  return n;
}
function encodeLE(n, len) {
  const out = new Uint8Array(len);
  for (let i = 0; i < len; i++) { out[i] = Number(n & 0xffn); n >>= 8n; }
  return out;
}
function clampScalar(k) {
  k = new Uint8Array(k);
  k[0] &= 248; k[31] &= 127; k[31] |= 64;
  return decodeLE(k);
}
function decodeUCoord(u) {
  u = new Uint8Array(u);
  u[31] &= 127;
  return mod(decodeLE(u), P);
}
function cswap(swap, a, b) { return swap ? [b, a] : [a, b]; }

function x25519(scalarBytes, uBytes) {
  const k = clampScalar(scalarBytes);
  const u = decodeUCoord(uBytes);
  let x1 = u, x2 = 1n, z2 = 0n, x3 = u, z3 = 1n, swap = 0n;
  for (let t = 254; t >= 0; t--) {
    const kt = (k >> BigInt(t)) & 1n;
    swap ^= kt;
    [x2, x3] = cswap(swap, x2, x3);
    [z2, z3] = cswap(swap, z2, z3);
    swap = kt;
    const A = mod(x2 + z2, P), AA = mod(A * A, P);
    const B = mod(x2 - z2, P), BB = mod(B * B, P);
    const E = mod(AA - BB, P);
    const C = mod(x3 + z3, P), D = mod(x3 - z3, P);
    const DA = mod(D * A, P), CB = mod(C * B, P);
    x3 = mod((DA + CB) * (DA + CB), P);
    z3 = mod(x1 * mod((DA - CB) * (DA - CB), P), P);
    x2 = mod(AA * BB, P);
    z2 = mod(E * (AA + mod(A24 * E, P)), P);
  }
  [x2, x3] = cswap(swap, x2, x3);
  [z2, z3] = cswap(swap, z2, z3);
  return encodeLE(mod(x2 * finv(z2), P), 32);
}
function x25519Base(scalarBytes) {
  const base = new Uint8Array(32); base[0] = 9;
  return x25519(scalarBytes, base);
}

function toB64(bytes) { return Buffer.from(bytes).toString('base64'); }
function fromB64(str) { return new Uint8Array(Buffer.from(str, 'base64')); }

function generateEphemeral() {
  const priv = crypto.randomBytes(32);
  const pub = x25519Base(priv);
  return { priv, pub };
}

// HKDF-SHA256 — same construction as the browser side's EravosCrypto.hkdf.
function hkdf(sharedSecretBytes, saltBytes, infoStr, lengthBytes) {
  return Buffer.from(crypto.hkdfSync('sha256', sharedSecretBytes, saltBytes, infoStr, lengthBytes));
}

function encryptRaw(key, plaintextBytes) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(Buffer.from(plaintextBytes)), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Match browser AES-GCM framing: SubtleCrypto appends the tag to the
  // ciphertext automatically, so the wire format here is iv (separate) +
  // ct-with-tag-appended, same as what decryptRaw on the browser side expects.
  return { iv: toB64(iv), ct: toB64(Buffer.concat([enc, tag])) };
}

module.exports = {
  x25519, x25519Base, generateEphemeral, hkdf, encryptRaw, toB64, fromB64,
};
