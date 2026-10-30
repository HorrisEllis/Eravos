'use strict';
/**
 * acme-client.js — a real, working Let's Encrypt client (RFC 8555,
 * HTTP-01 challenge), not a stub. Built on Node's own crypto/https
 * only -- no external npm dependency, matching "what doesn't exist
 * must be built" and this whole project's own "always self-hosted"
 * principle. Let's Encrypt itself is the one legitimate exception to
 * that principle this app takes anywhere: it's the standard, free,
 * widely-trusted way to get a real browser-trusted certificate
 * without paying a commercial CA -- not a runtime dependency this app
 * calls on every request, a one-time (well, once-every-~80-days)
 * provisioning step.
 *
 * HONEST LIMITATION, stated directly: this was written and syntax-
 * verified in a sandboxed environment with no network path to Let's
 * Encrypt's real servers (confirmed directly -- this same sandbox's
 * egress allowlist doesn't include acme-v02.api.letsencrypt.org, the
 * same restriction that blocked the DDNS IP-lookup providers earlier
 * this session). Every individual real primitive it depends on (JWK
 * export, ES256 JWS signing in raw P1363 format, CSR generation via
 * openssl) was verified directly and works. The full, live protocol
 * exchange against Let's Encrypt's real servers has not been. This
 * needs a real test run on a machine that can actually reach Let's
 * Encrypt and has anonymousservers.info actually resolving to it --
 * i.e., the real deployment this is built for, not this sandbox.
 *
 * Requires: this server's own port 80 (or the externally-mapped one,
 * see config/options.json's own upnpExternalPort) genuinely reachable
 * from the internet for the HTTP-01 challenge to validate -- the same
 * DDNS + UPnP setup already built earlier this session.
 */

const crypto = require('crypto');
const https = require('https');
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const LETSENCRYPT_DIRECTORY = 'https://acme-v02.api.letsencrypt.org/directory';
const LETSENCRYPT_STAGING_DIRECTORY = 'https://acme-staging-v02.api.letsencrypt.org/directory';

function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function httpsJson(method, url, body, headers) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const payload = body ? Buffer.from(JSON.stringify(body)) : null;
    const req = https.request({
      method, hostname: u.hostname, path: u.pathname + u.search,
      headers: Object.assign({}, headers, payload ? { 'Content-Type': 'application/jose+json', 'Content-Length': payload.length } : {}),
    }, (res) => {
      let raw = '';
      res.on('data', (c) => raw += c);
      res.on('end', () => {
        let parsed = null;
        try { parsed = raw ? JSON.parse(raw) : null; } catch (e) { /* some ACME responses are legitimately non-JSON (e.g. the cert itself, PEM) */ }
        resolve({ status: res.statusCode, headers: res.headers, body: parsed, raw });
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

/** Real JWS signing, RFC 7515, ES256 -- matches the raw P1363 (r||s)
    encoding confirmed directly against Node's own crypto.sign() with
    dsaEncoding:'ieee-p1363', not the DER encoding crypto.sign()
    returns by default (which would produce an invalid ACME signature
    silently accepted by Node but rejected by Let's Encrypt's own
    validator -- confirmed which encoding is real and correct before
    using it, not assumed). */
function signJws(accountKey, protectedHeader, payload) {
  const protectedB64 = b64url(JSON.stringify(protectedHeader));
  const payloadB64 = payload === '' ? '' : b64url(JSON.stringify(payload));
  const signingInput = protectedB64 + '.' + payloadB64;
  const sign = crypto.createSign('SHA256');
  sign.update(signingInput);
  sign.end();
  const signature = sign.sign({ key: accountKey, dsaEncoding: 'ieee-p1363' });
  return { protected: protectedB64, payload: payloadB64, signature: b64url(signature) };
}

let _opensslPath = null; // resolved once, cached — not re-probed on every CSR

/** Finds a real, working openssl binary instead of assuming bare `openssl`
 * resolves on PATH. execFileSync('openssl', ...) throwing ENOENT doesn't
 * mean openssl isn't installed — on Windows specifically, Git for Windows
 * bundles a real one (usr/bin/openssl.exe) that most installs never add
 * to PATH, since Git itself doesn't need it there. Checked directly
 * rather than assumed: each candidate is actually run with `version`
 * and only kept if that succeeds, so a stale/broken path doesn't get
 * silently trusted either.
 */
function _findOpenssl() {
  if (_opensslPath) return _opensslPath;
  const candidates = [
    'openssl', // bare — works if it's genuinely on PATH already
    'C:\\Program Files\\Git\\usr\\bin\\openssl.exe',
    'C:\\Program Files\\Git\\mingw64\\bin\\openssl.exe',
    'C:\\Program Files (x86)\\Git\\usr\\bin\\openssl.exe',
    '/usr/bin/openssl',
    '/usr/local/bin/openssl',
    '/opt/homebrew/bin/openssl', // Apple Silicon Homebrew — different prefix than Intel
  ];
  for (const candidate of candidates) {
    try {
      execFileSync(candidate, ['version'], { stdio: 'pipe' });
      _opensslPath = candidate;
      return candidate;
    } catch (e) { /* this candidate doesn't exist or doesn't run — try the next */ }
  }
  throw new Error(
    "openssl not found on PATH or in any common install location. If this is Windows and Git is installed, " +
    "it's almost certainly at C:\\Program Files\\Git\\usr\\bin\\openssl.exe — add that folder to PATH, or " +
    "install it directly from https://slproweb.com/products/Win32OpenSSL.html and restart the server."
  );
}

class AcmeClient {
  constructor(opts) {
    this.directoryUrl = opts.staging ? LETSENCRYPT_STAGING_DIRECTORY : LETSENCRYPT_DIRECTORY;
    this.accountKeyPath = opts.accountKeyPath;
    this.email = opts.email || null;
    this.challengeDir = opts.challengeDir; // real dir this server serves /.well-known/acme-challenge/* from
    this.directory = null;
    this.nonce = null;
    this.accountKey = null;
    this.kid = null; // real ACME account URL, set after registration
  }

  _log(msg) { console.log('[acme] ' + msg); }

  async _fetchDirectory() {
    const res = await httpsJson('GET', this.directoryUrl);
    if (res.status !== 200) throw new Error('could not fetch ACME directory: HTTP ' + res.status);
    this.directory = res.body;
  }

  async _freshNonce() {
    const res = await httpsJson('HEAD', this.directory.newNonce);
    const n = res.headers['replay-nonce'];
    if (!n) throw new Error('ACME server did not return a nonce');
    return n;
  }

  _ensureAccountKey() {
    if (fs.existsSync(this.accountKeyPath)) {
      this.accountKey = crypto.createPrivateKey(fs.readFileSync(this.accountKeyPath));
      this._log('reusing existing account key at ' + this.accountKeyPath);
      return;
    }
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
    fs.mkdirSync(path.dirname(this.accountKeyPath), { recursive: true });
    fs.writeFileSync(this.accountKeyPath, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
    this.accountKey = privateKey;
    this._log('generated a real, new ACME account key at ' + this.accountKeyPath);
  }

  _jwk() {
    const pub = crypto.createPublicKey(this.accountKey).export({ format: 'jwk' });
    // RFC 7638 requires lexicographic key order for the thumbprint,
    // and ACME's own protected-header jwk expects the same shape.
    return { crv: pub.crv, kty: pub.kty, x: pub.x, y: pub.y };
  }

  async _signedRequest(url, payload, useJwk) {
    const nonce = this.nonce || await this._freshNonce();
    const protectedHeader = { alg: 'ES256', nonce, url };
    if (useJwk) protectedHeader.jwk = this._jwk();
    else protectedHeader.kid = this.kid;
    const body = signJws(this.accountKey, protectedHeader, payload);
    const res = await httpsJson('POST', url, body, {});
    this.nonce = res.headers['replay-nonce'] || null;
    return res;
  }

  async _registerAccount() {
    const payload = { termsOfServiceAgreed: true };
    if (this.email) payload.contact = ['mailto:' + this.email];
    const res = await this._signedRequest(this.directory.newAccount, payload, true);
    if (res.status !== 200 && res.status !== 201) {
      throw new Error('ACME account registration failed: HTTP ' + res.status + ' ' + res.raw);
    }
    this.kid = res.headers.location;
    this._log('real ACME account ' + (res.status === 201 ? 'created' : 'confirmed') + ': ' + this.kid);
  }

  async _createOrder(domain) {
    const res = await this._signedRequest(this.directory.newOrder, { identifiers: [{ type: 'dns', value: domain }] }, false);
    if (res.status !== 201) throw new Error('ACME order creation failed: HTTP ' + res.status + ' ' + res.raw);
    return { order: res.body, orderUrl: res.headers.location };
  }

  async _completeHttp01Challenge(authzUrl) {
    const authzRes = await this._signedRequest(authzUrl, '', false);
    const authz = authzRes.body;
    const challenge = (authz.challenges || []).find((c) => c.type === 'http-01');
    if (!challenge) throw new Error('server offered no http-01 challenge for ' + authz.identifier.value);

    const thumbprint = b64url(crypto.createHash('sha256').update(JSON.stringify(this._jwk())).digest());
    const keyAuth = challenge.token + '.' + thumbprint;

    // Real file served at the real, required path -- eravos-serve.js's
    // own real static route for /.well-known/acme-challenge/ reads
    // from this exact directory.
    fs.mkdirSync(this.challengeDir, { recursive: true });
    fs.writeFileSync(path.join(this.challengeDir, challenge.token), keyAuth);
    this._log('serving real HTTP-01 challenge response at /.well-known/acme-challenge/' + challenge.token);

    // Tell the server the challenge is ready to be validated.
    await this._signedRequest(challenge.url, {}, false);

    // Real poll, not a fixed sleep -- waits for the server's own real answer.
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 3000));
      const check = await this._signedRequest(authzUrl, '', false);
      if (check.body.status === 'valid') { this._log('challenge validated for ' + authz.identifier.value); return; }
      if (check.body.status === 'invalid') {
        throw new Error('challenge validation failed: ' + JSON.stringify(check.body.challenges?.find((c) => c.type === 'http-01')?.error));
      }
    }
    throw new Error('challenge validation timed out after 60s -- is port 80 actually reachable from the internet? (see this server\'s own UPnP status)');
  }

  _generateCsr(domain, certKeyPath) {
    // openssl for CSR generation specifically -- real, correct PKCS#10
    // DER encoding without hand-rolling ASN.1 (the class of code where
    // a subtle bug is easy to introduce and hard to catch, avoided
    // deliberately rather than risked). Honest fallback: if openssl
    // isn't on this machine (a real possibility on Windows, checked
    // directly rather than assumed present), this throws a clear,
    // specific error instead of a cryptic one.
    const openssl = _findOpenssl();
    fs.mkdirSync(path.dirname(certKeyPath), { recursive: true });
    if (!fs.existsSync(certKeyPath)) {
      execFileSync(openssl, ['ecparam', '-genkey', '-name', 'prime256v1', '-noout', '-out', certKeyPath]);
      this._log('generated a real, new certificate private key at ' + certKeyPath);
    }
    const csrDer = execFileSync(openssl, [
      'req', '-new', '-key', certKeyPath, '-subj', '/CN=' + domain, '-outform', 'DER',
    ]);
    return b64url(csrDer);
  }

  async _finalizeOrder(order, orderUrl, csrB64) {
    await this._signedRequest(order.finalize, { csr: csrB64 }, false);
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 3000));
      const check = await this._signedRequest(orderUrl, '', false);
      if (check.body.status === 'valid') return check.body;
      if (check.body.status === 'invalid') throw new Error('order finalization failed: ' + JSON.stringify(check.body));
    }
    throw new Error('order finalization timed out after 60s');
  }

  async _downloadCertificate(certUrl) {
    const nonce = this.nonce || await this._freshNonce();
    const protectedHeader = { alg: 'ES256', nonce, url: certUrl, kid: this.kid };
    const body = signJws(this.accountKey, protectedHeader, '');
    const res = await httpsJson('POST', certUrl, body, { Accept: 'application/pem-certificate-chain' });
    this.nonce = res.headers['replay-nonce'] || null;
    if (res.status !== 200) throw new Error('certificate download failed: HTTP ' + res.status);
    return res.raw; // real PEM chain, leaf cert first
  }

  /** obtainCertificate(domain, certPath, certKeyPath) -- the one real,
      complete entry point. Returns { ok, certPath, keyPath } or
      { ok:false, reason }, never throws up past this boundary (§1.2 --
      a failed cert provisioning attempt is a loud, specific, caught
      failure, not a crashed server). */
  async obtainCertificate(domain, certPath, certKeyPath) {
    try {
      this._ensureAccountKey();
      await this._fetchDirectory();
      await this._registerAccount();
      const { order, orderUrl } = await this._createOrder(domain);
      for (const authzUrl of order.authorizations) {
        await this._completeHttp01Challenge(authzUrl);
      }
      const csrB64 = this._generateCsr(domain, certKeyPath);
      const finalized = await this._finalizeOrder(order, orderUrl, csrB64);
      const pemChain = await this._downloadCertificate(finalized.certificate);
      fs.mkdirSync(path.dirname(certPath), { recursive: true });
      fs.writeFileSync(certPath, pemChain);
      this._log('real, live, browser-trusted certificate issued for ' + domain + ' -> ' + certPath);
      return { ok: true, certPath, keyPath: certKeyPath };
    } catch (e) {
      this._log('certificate provisioning failed: ' + e.message);
      return { ok: false, reason: e.message };
    }
  }
}

module.exports = { AcmeClient, LETSENCRYPT_DIRECTORY, LETSENCRYPT_STAGING_DIRECTORY };
