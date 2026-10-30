'use strict';
/**
 * guardian-lite/index.js — the module surface main.js and cli.js both use.
 * One real running instance per app launch, config-driven (see ../config.js).
 */
const path = require('path');
const { GuardianLite } = require('./server');
const { getUserDataPath } = require('../paths');

let _instance = null;

function start(config = {}) {
  if (_instance) return Promise.resolve(_instance);
  const dataDir = config.dataDir || path.join(getUserDataPath(), 'guardian-lite-store');
  _instance = new GuardianLite({
    port: config.guardianLitePort || 7823,
    host: '127.0.0.1',
    dataDir,
    retentionLimit: config.guardianLiteRetentionLimit || 0,
    // §CORS+CSP HARDENING 2026-07-24 — real value, not a fallback: main.js
    // and cli.js both call config.ensureGuardianToken() at boot before
    // this runs, so config.guardianLiteToken is always populated by the
    // time start() is called through either entrypoint.
    token: config.guardianLiteToken || null,
    extraAllowedOrigins: config.guardianLiteExtraAllowedOrigins || [],
  });
  return _instance.start().then(() => _instance);
}

function stop() {
  if (!_instance) return Promise.resolve();
  const inst = _instance;
  _instance = null;
  return inst.stop();
}

function getInstance() {
  return _instance;
}

module.exports = { start, stop, getInstance };
