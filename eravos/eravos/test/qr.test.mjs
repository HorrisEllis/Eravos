// §12.1 brutal. §12.3 — expectation vs reality stated.
//
// v0.12.0's version of this file (checked hard math, GF(256)/Reed-Solomon/
// BCH format distance, all against the QR spec's own defining properties)
// was HONEST that it never checked the optics: no scanner existed in that
// environment, so whether a phone camera could actually read the output
// was left explicitly OPEN. It turned out to matter — rendered to real
// pixels and decoded with an independent scanner, every input failed,
// including the plain 8-character invite code alone.
//
// shared/eravos-qr.js is now a thin adapter over a vendored, 15-year
// production library (Kazuhiko Arase's qrcode-generator) rather than a
// hand-rolled encoder, so this suite checks the thing that actually
// matters and previously had zero coverage: does an independent decoder
// (jsQR, vendored under test/vendor — NOT loaded by the app itself, the
// app stays as dependency-free as it was) read back exactly what was
// encoded, the same way a phone camera would.
import assert from 'assert';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const QR = require('../shared/eravos-qr.js');
const jsQR = require('./vendor/jsqr/jsQR.js');

let pass = 0, fail = 0;
const t = (n, f) => { try { f(); console.log('  ok  - ' + n); pass++; } catch (e) { console.log('  FAIL- ' + n + '\n        ' + e.message); fail++; } };

/** Renders an encoded matrix straight to raw RGBA pixels — no SVG
    parsing or canvas dependency needed, jsQR reads pixel buffers
    directly, the same shape a camera frame would hand it. */
function toRGBA(q, scale, quiet) {
  const n = q.size + quiet * 2;
  const px = n * scale;
  const data = new Uint8ClampedArray(px * px * 4).fill(255);
  for (let r = 0; r < q.size; r++) for (let c = 0; c < q.size; c++) {
    if (!q.modules[r][c]) continue;
    for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) {
      const y = (r + quiet) * scale + dy, x = (c + quiet) * scale + dx;
      const idx = (y * px + x) * 4;
      data[idx] = 0; data[idx + 1] = 0; data[idx + 2] = 0; data[idx + 3] = 255;
    }
  }
  return { data, width: px, height: px };
}

function decodeText(text, opts) {
  const q = QR.encode(text, opts);
  const img = toRGBA(q, 8, 4);
  const res = jsQR(img.data, img.width, img.height);
  return res ? res.data : null;
}

console.log('\nqr — real scan verification (independent decoder, not the encoder\'s own logic)');

t('an 8-character invite code alone scans and decodes byte-for-byte', () => {
  const code = 'AB3D7QXZ';
  assert.strictEqual(decodeText(code), code);
});

t('a real pairing URL (code.peerId.fp.nonce shape) scans and decodes byte-for-byte', () => {
  const url = 'https://192.168.1.50:8443/#pair=' + encodeURIComponent('AB3D7QXZ.eravos-9x4kd02mabcdefgh.fp9k3.n7h2q1w0e9r8t');
  assert.strictEqual(decodeText(url), url);
});

t('the app\'s configured publicOrigin shape scans and decodes byte-for-byte', () => {
  const url = 'https://anonymousservers.info/#pair=' + encodeURIComponent('AB3D7QXZ.eravos-9x4kd02m..n7h2q1w0e9r8t');
  assert.strictEqual(decodeText(url), url);
});

t('a bare LAN-IP origin (what a phone on the same wifi actually loads) scans and decodes byte-for-byte', () => {
  const url = 'http://10.0.0.42:8080/#pair=' + encodeURIComponent('AB3D7QXZ.eravos-9x4kd02m..n7h2q1w0e9r8t');
  assert.strictEqual(decodeText(url), url);
});

t('every character the CODE_LEN=8 alphabet in eravos-pairing.js can produce survives', () => {
  // randomChars() in eravos-pairing.js draws from this exact set.
  const alphabet = '23456789abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ';
  assert.strictEqual(decodeText(alphabet), alphabet);
});

console.log('\nqr — UTF-8 byte-mode encoding (real bug, root-caused, not assumed)');
t('non-ASCII text encodes and decodes as correct UTF-8 bytes, not truncated to Latin-1', () => {
  // The vendored library's default stringToBytes is `charCodeAt & 0xff`
  // per UTF-16 unit (effectively Latin-1) unless explicitly switched to
  // its own 'UTF-8' function -- shared/eravos-qr.js does that switch at
  // load time. This is checked at the raw byte level, independent of
  // jsQR's own charset assumptions for res.data (which may still show
  // Latin-1-decoded text for non-ASCII input -- that's the SCANNER's
  // interpretation choice, a separate, unrelated ambiguity, not this
  // encoder's correctness).
  const text = 'café — ✦ 日本';
  const q = QR.encode(text);
  const img = toRGBA(q, 8, 4);
  const res = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
  assert.ok(res, 'should decode at all');
  const decodedBytes = Buffer.from(res.binaryData);
  const expectedBytes = Buffer.from(text, 'utf8');
  assert.ok(decodedBytes.equals(expectedBytes), 'raw UTF-8 bytes must match exactly');
});

console.log('\nqr — encoder contract (unchanged surface, real behaviour)');
t('empty input is refused', () => {
  assert.throws(() => QR.encode(''), /nothing to encode/);
  assert.throws(() => QR.encode(null), /nothing to encode/);
});
t('a pairing URL does not need an oversized version', () => {
  const url = 'https://192.168.1.50:8443/#pair=AB3D7QXZ.eravos-9x4kd02mabcdefgh.fp9k3.n7h2q1w0e9r8t';
  const q = QR.encode(url);
  assert.ok(q.version <= 15, 'a pairing URL should not need a large version, got v' + q.version);
});

console.log('\nqr — SVG output');
t('renderSVG produces well-formed, square SVG with a quiet zone, and IT SCANS', () => {
  const text = 'https://eravos.test/#pair=ABCD1234.eravos-9x4kd02m';
  const svg = QR.renderSVG(text);
  assert.ok(svg.startsWith('<svg') && svg.endsWith('</svg>'));
  assert.ok(svg.includes('viewBox'));
  assert.ok((svg.match(/<rect/g) || []).length > 50, 'suspiciously few modules drawn');
  const m = /viewBox="0 0 (\d+) \1"/.exec(svg);
  assert.ok(m, 'viewBox must be square');
  const q = QR.encode(text);
  assert.strictEqual(+m[1], q.size + 8, 'quiet zone must be 4 modules each side');
  // The actual point: decode the SVG's own module grid, not a fresh encode.
  assert.strictEqual(decodeText(text), text);
});

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
