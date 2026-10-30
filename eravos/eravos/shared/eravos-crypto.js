// ═══════════════════════════════════════════════════════════════════
// ERAVOS CRYPTO — X25519 key agreement + AES-256-GCM session encryption
// Phase 1 (§4, "gap" item in 01-ARCHITECTURE.md, now real).
//
// Honest scope statement (read before assuming more than this does):
//  - Each role (james/partner) has ONE static X25519 identity keypair,
//    generated once and persisted locally. It is exchanged in the
//    `hello` handshake and used to derive a shared AES-256-GCM key.
//  - This is static-key ECDH, not a ratcheted/ephemeral scheme — the
//    derived key is the same across every connection until a device's
//    identity keypair is reset in Settings. That means no per-session
//    forward secrecy: if a private scalar is ever exfiltrated from one
//    device, every past captured ciphertext becomes decryptable. This
//    is a real, named limitation (§1.2 "gap" honesty rule), not solved
//    by this file. What it DOES solve: the P2P channel and anything
//    relayed through a signaling/TURN server is no longer plaintext to
//    that relay — the previous state, where "encrypted" was claimed in
//    UI copy and false in code, is gone.
//  - No SubtleCrypto in an insecure context (plain http://, not
//    localhost) → this module refuses to silently claim encryption.
//    `EravosCrypto.available` is false and callers must show that.
//
// Nothing here touches the DOM. Pure key material + encrypt/decrypt.
// ═══════════════════════════════════════════════════════════════════
(function (global) {
  'use strict';

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

  // RFC 7748 Montgomery ladder. Cross-validated against @noble/curves
  // x25519 across 20 random keypairs (pubkey + shared-secret agreement)
  // during development — see 04-PHASEMAP.md Phase 1 notes.
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

  function toB64(bytes) {
    let s = ''; for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s);
  }
  function fromB64(str) {
    const s = atob(str); const out = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
  }

  const SUBTLE_OK = !!(global.crypto && global.crypto.subtle);

  // ── Identity keypair (static per role, persisted) ──────────────────
  function getOrCreateIdentity(role, dbGet, dbSet) {
    const dbKey = role + '_x25519_identity';
    let id = dbGet(dbKey, null);
    if (id && id.priv && id.pub) return id;
    const priv = new Uint8Array(32);
    global.crypto.getRandomValues(priv);
    const pub = x25519Base(priv);
    id = { priv: toB64(priv), pub: toB64(pub), createdAt: Date.now() };
    dbSet(dbKey, id);
    return id;
  }

  function resetIdentity(role, dbSet) {
    dbSet(role + '_x25519_identity', null);
  }

  // ── Shared AES-256-GCM key derivation ───────────────────────────────
  async function deriveSharedKey(myPrivB64, theirPubB64) {
    if (!SUBTLE_OK) return null;
    const shared = x25519(fromB64(myPrivB64), fromB64(theirPubB64));
    const digest = await global.crypto.subtle.digest('SHA-256', shared);
    return global.crypto.subtle.importKey('raw', digest, 'AES-GCM', false, ['encrypt', 'decrypt']);
  }

  async function encrypt(aesKey, plaintextObj) {
    const iv = global.crypto.getRandomValues(new Uint8Array(12));
    const data = new TextEncoder().encode(JSON.stringify(plaintextObj));
    const ct = await global.crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aesKey, data);
    return { _enc: 1, iv: toB64(iv), ct: toB64(new Uint8Array(ct)) };
  }

  async function decrypt(aesKey, envelope) {
    const iv = fromB64(envelope.iv);
    const ct = fromB64(envelope.ct);
    const pt = await global.crypto.subtle.decrypt({ name: 'AES-GCM', iv }, aesKey, ct);
    return JSON.parse(new TextDecoder().decode(pt));
  }

  // ── Relay auth (token-free): HKDF over a raw ECDH shared secret ────
  // Used by initMesh()'s challenge-response with the self-hosted relay.
  // Proves possession of the private key matching an already-known
  // public key — nothing secret is generated for this or sent anywhere.
  async function hkdf(sharedSecretBytes, saltBytes, infoStr, lengthBytes) {
    if (!SUBTLE_OK) return null;
    const keyMaterial = await global.crypto.subtle.importKey('raw', sharedSecretBytes, 'HKDF', false, ['deriveBits']);
    const info = new TextEncoder().encode(infoStr);
    const bits = await global.crypto.subtle.deriveBits(
      { name: 'HKDF', hash: 'SHA-256', salt: saltBytes, info },
      keyMaterial,
      lengthBytes * 8
    );
    return new Uint8Array(bits);
  }

  async function aesKeyFromRawBytes(rawKeyBytes) {
    return global.crypto.subtle.importKey('raw', rawKeyBytes, 'AES-GCM', false, ['encrypt', 'decrypt']);
  }

  // Raw-bytes variants of encrypt/decrypt (challenge envelopes carry a
  // short random check value, not a JS object — no JSON wrapping).
  async function decryptRaw(aesKey, ivB64, ctB64) {
    const iv = fromB64(ivB64);
    const ct = fromB64(ctB64);
    const pt = await global.crypto.subtle.decrypt({ name: 'AES-GCM', iv }, aesKey, ct);
    return new Uint8Array(pt);
  }

  global.EravosCrypto = {
    available: SUBTLE_OK,
    x25519, x25519Base,
    getOrCreateIdentity, resetIdentity,
    deriveSharedKey, encrypt, decrypt,
    hkdf, aesKeyFromRawBytes, decryptRaw,
    toB64, fromB64,
    _internal: { toB64, fromB64 }, // kept for back-compat with any existing test references
  };
})(typeof window !== 'undefined' ? window : globalThis);
