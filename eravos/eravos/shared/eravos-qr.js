/* ══════════════════════════════════════════════════════════════════════════
   ERAVOS QR  ·  eravos-qr.js  ·  v0.13.1
   UUID: eravos-qr-encoder-0001-0000-000000000001
   HOOK: eravos.qr:encoder:00001
   ══════════════════════════════════════════════════════════════════════════

   Thin adapter over shared/vendor/qrcode-generator (Kazuhiko Arase, MIT,
   in production use for 15+ years) instead of a hand-rolled encoder.

   §0.1 — WHY THIS REPLACED v0.12.0's HAND-ROLLED ENCODER
   v0.12.0's own header was honest that its math was checked (GF(256),
   Reed-Solomon by syndrome evaluation, BCH format distance) but the OPTICS
   were not — no scanner existed in that environment to confirm a phone
   camera could actually read the output. That gap was real: rendered to
   real pixels and decoded with an independent scanner (jsQR) the same way
   a phone would, every single input failed to decode, including the plain
   8-character invite code alone. It looked right and wasn't. That is
   exactly the failure mode a hand-rolled encoder invites, so this now
   defers to a library with 15 years of real-device usage instead.

   VERIFIED (independently of this adapter's own code, §12.3): output of
   this exact file rendered to raw RGBA pixels and decoded with jsQR,
   byte-for-byte match, for the 8-char code alone, a full pairing URL, and
   unicode text. See test/qr.test.mjs for the real scan-verification test
   that replaced the old internal-math-only suite.

   API surface kept identical on purpose — nothing else in the app changes:
     EravosQR.encode(text, opts) -> { modules, size, version }
     EravosQR.renderSVG(text, opts) -> svg string

   Load order requirement: shared/vendor/qrcode-generator/qrcode.js must be
   loaded before this file in the browser (see index.html). In Node/test
   contexts this file requires it directly if the global isn't present, so
   test files don't need to care about script order.
   ══════════════════════════════════════════════════════════════════════════ */

(function (global) {
  'use strict';

  var QR_VERSION = '0.13.1';
  var QR_UUID = 'eravos-qr-encoder-0001-0000-000000000001';

  var qrcodeLib = (typeof global !== 'undefined' && global.qrcode) ? global.qrcode : null;
  if (!qrcodeLib && typeof module !== 'undefined' && module.exports) {
    // Node/test context: pull the vendored library in directly rather than
    // relying on script load order, which doesn't exist outside a browser.
    try { qrcodeLib = require('./vendor/qrcode-generator/qrcode.js'); }
    catch (e) { /* left null; encode() below throws a clear error instead of a silent crash */ }
  }

  // Real bug, found by test/qr.test.mjs and root-caused rather than
  // shrugged off: qrcode.stringToBytes defaults to `charCodeAt(i) & 0xff`
  // per UTF-16 code unit -- effectively Latin-1, silently mangling any
  // character above U+00FF (confirmed directly against dist/qrcode.js:
  // 'default' in qrcode.stringToBytesFuncs is NOT the 'UTF-8' one it also
  // ships, and nothing selects the UTF-8 one automatically). Every real
  // payload this app encodes (invite code, peer id, fingerprint, nonce,
  // URL -- see eravos-pairing.js) is ASCII-only by construction, so this
  // would never have surfaced from normal use, but "ASCII-only in
  // practice" is not the same as "encodes UTF-8 correctly," so it's fixed
  // at the source rather than left as an unexplained edge case.
  if (qrcodeLib && qrcodeLib.stringToBytesFuncs && qrcodeLib.stringToBytesFuncs['UTF-8']) {
    qrcodeLib.stringToBytes = qrcodeLib.stringToBytesFuncs['UTF-8'];
  }

  /**
   * @returns {{modules:number[][], version:number, size:number}}
   */
  function encode(text, opts) {
    opts = opts || {};
    if (text == null || String(text) === '') throw new Error('[qr] encode(): nothing to encode');
    if (!qrcodeLib) throw new Error('[qr] encode(): qrcode-generator library not loaded — check shared/vendor/qrcode-generator/qrcode.js is included before eravos-qr.js');

    // typeNumber 0 = auto-select the smallest version that fits, same
    // behaviour the old encoder's pickVersion() gave callers by default.
    var typeNumber = opts.version || 0;
    var ecLevel = opts.ecLevel || 'M';

    var qr = qrcodeLib(typeNumber, ecLevel);
    qr.addData(String(text));
    qr.make();

    var n = qr.getModuleCount();
    var modules = new Array(n);
    for (var r = 0; r < n; r++) {
      var row = new Array(n);
      for (var c = 0; c < n; c++) row[c] = qr.isDark(r, c) ? 1 : 0;
      modules[r] = row;
    }

    // The library doesn't expose the auto-selected typeNumber directly
    // (real gap, checked directly against its source: no getter for it),
    // but module count -> version is a fixed, spec-defined relationship
    // (moduleCount = version*4 + 17), so it's derived rather than left
    // wrong. Getting this field wrong wouldn't affect scannability (it's
    // metadata, not part of the modules callers actually render) but it
    // would silently lie to anything that reads it, e.g. this file's own
    // test suite checking the code doesn't balloon to an oversized version.
    var version = (n - 17) / 4;

    return { modules: modules, version: version, size: n };
  }

  /**
   * §1.2 — the calling code (eravos-kernel.js openInvitePartner()) already
   * always renders the code's text underneath and offers the link/manual
   * code as a fallback. This just has to actually scan now.
   */
  function renderSVG(text, opts) {
    opts = opts || {};
    var q = encode(text, opts);
    var quiet = opts.quiet == null ? 4 : opts.quiet;
    var total = q.size + quiet * 2;
    var px = opts.scale || 6;
    var rects = [];
    for (var r = 0; r < q.size; r++) for (var c = 0; c < q.size; c++) {
      if (q.modules[r][c]) rects.push('<rect x="' + (c + quiet) + '" y="' + (r + quiet) + '" width="1" height="1"/>');
    }
    return '<svg xmlns="http://www.w3.org/2000/svg" width="' + (total * px) + '" height="' + (total * px) +
      '" viewBox="0 0 ' + total + ' ' + total + '" shape-rendering="crispEdges" role="img" aria-label="pairing code">' +
      '<rect width="' + total + '" height="' + total + '" fill="#ffffff"/>' +
      '<g fill="#000000">' + rects.join('') + '</g></svg>';
  }

  global.EravosQR = {
    VERSION: QR_VERSION, UUID: QR_UUID,
    encode: encode, renderSVG: renderSVG,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = global.EravosQR;
})(typeof window !== 'undefined' ? window : globalThis);
