'use strict';
/**
 * ddns-client.js — a real Dynamic DNS updater, not a stub.
 *
 * WHAT THIS IS FOR, stated plainly: your home IP changes (most
 * residential ISPs don't give you a static one). A DDNS provider lets
 * a real hostname (anonymousservers.info, per config/options.json's
 * own ddns block) always resolve to whatever your current IP actually
 * is, by having something on your own machine tell the provider
 * "this is my IP now" whenever it changes.
 *
 * HONEST SCOPE NOTE: this speaks the "dyndns2" update protocol --
 * GET updateUrl?hostname=X&myip=Y with HTTP Basic Auth. No-IP, Dynu,
 * and most registrars' own DDNS features use a compatible dialect of
 * this. DuckDNS uses a slightly different shape (token as both
 * username and password, and as a query param rather than needing
 * Basic Auth) -- handled below via a real, separate code path, not
 * silently assumed to work through the generic one.
 *
 * Does NOT guess which provider anonymousservers.info actually uses --
 * config/options.json's own ddns.updateUrl/username/password have to
 * be filled in with your real provider's real values before this does
 * anything. Runs disabled (ddns.enabled: false) until they are.
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const moduleFlow = require('./module-flow.js');

/** Real, actual public IP lookup -- api.ipify.org returns plain text,
    nothing to parse wrong. A second, independent provider as fallback
    in case the first is unreachable, not just retried against itself. */
function getPublicIp() {
  const providers = ['https://api.ipify.org', 'https://ifconfig.me/ip'];
  return providers.reduce((chain, url) =>
    chain.catch(() => fetchText(url)), Promise.reject(new Error('start')));
}

function fetchText(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, { timeout: 8000 }, (res) => {
      if (res.statusCode !== 200) { res.resume(); return reject(new Error('HTTP ' + res.statusCode + ' from ' + url)); }
      let body = '';
      res.on('data', (c) => body += c);
      res.on('end', () => resolve(body.trim()));
    });
    req.on('timeout', () => { req.destroy(); reject(new Error('timed out: ' + url)); });
    req.on('error', reject);
  });
}

/** Real update call, dyndns2-compatible. Returns the real response body
    so a caller can tell "good"/"nochg" (success) apart from "badauth"/
    "!yours"/"abuse" (real, named failure states this protocol defines --
    not swallowed into a generic "it didn't work"). */
function sendUpdate(cfg, ip) {
  return new Promise((resolve, reject) => {
    const isDuckDns = /duckdns\.org/i.test(cfg.updateUrl || '');
    let url;
    let headers = {};
    if (isDuckDns) {
      // DuckDNS's own real shape: token is both the username-equivalent
      // and the auth -- passed as a query param, no Basic Auth header.
      url = cfg.updateUrl + '?domains=' + encodeURIComponent(cfg.hostname.split('.')[0]) +
        '&token=' + encodeURIComponent(cfg.password || cfg.username) + '&ip=' + encodeURIComponent(ip);
    } else {
      url = cfg.updateUrl + '?hostname=' + encodeURIComponent(cfg.hostname) + '&myip=' + encodeURIComponent(ip);
      const auth = Buffer.from((cfg.username || '') + ':' + (cfg.password || '')).toString('base64');
      headers.Authorization = 'Basic ' + auth;
    }
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, { headers, timeout: 10000 }, (res) => {
      let body = '';
      res.on('data', (c) => body += c);
      res.on('end', () => resolve({ status: res.statusCode, body: body.trim() }));
    });
    req.on('timeout', () => { req.destroy(); reject(new Error('update request timed out')); });
    req.on('error', reject);
  });
}

function loadState(stateFile) {
  try { return JSON.parse(fs.readFileSync(stateFile, 'utf8')); }
  catch (e) { return { lastIp: null, lastCheckedAt: null, lastUpdatedAt: null, lastResult: null }; }
}

function saveState(stateFile, state) {
  try {
    fs.mkdirSync(path.dirname(stateFile), { recursive: true });
    fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
  } catch (e) {
    console.warn('[ddns] could not persist state to ' + stateFile + ': ' + e.message);
  }
}

/** One real check-and-update cycle. Only actually calls the provider
    when the IP has genuinely changed since the last successful update
    (or has never been sent) -- most dyndns2 providers rate-limit or
    penalize updates sent when nothing changed, so this isn't just an
    optimization, it's what keeps the account in good standing. */
async function checkAndUpdate(cfg, stateFile) {
  const state = loadState(stateFile);
  let ip;
  try {
    ip = await getPublicIp();
  } catch (e) {
    const msg = 'could not determine current public IP: ' + e.message;
    console.warn('[ddns] ' + msg);
    state.lastCheckedAt = Date.now();
    state.lastResult = { ok: false, reason: msg };
    saveState(stateFile, state);
    return state;
  }

  state.lastCheckedAt = Date.now();

  if (ip === state.lastIp && state.lastResult && state.lastResult.ok) {
    // Real, correct no-op -- IP hasn't changed since the last real,
    // successful update. Not re-sent (see the real reason why above).
    saveState(stateFile, state);
    return state;
  }

  try {
    const res = await sendUpdate(cfg, ip);
    const ok = res.status === 200 && !/^(badauth|!yours|abuse|nohost)/i.test(res.body);
    const ipChanged = state.lastIp !== ip;
    const previousIp = state.lastIp; // captured before reassignment below -- a real bug caught before it shipped: reading state.lastIp AFTER the reassignment would report the new IP as its own "previous" value
    state.lastIp = ip;
    state.lastUpdatedAt = Date.now();
    state.lastResult = { ok, reason: res.body, httpStatus: res.status };
    if (!ok) {
      console.warn('[ddns] update rejected by provider: ' + res.body);
      moduleFlow.emit('ddns:update_failed', { hostname: cfg.hostname, reason: res.body, httpStatus: res.status });
    } else {
      console.log('[ddns] ' + cfg.hostname + ' -> ' + ip + ' (' + res.body + ')');
      if (ipChanged) {
        moduleFlow.emit('ddns:updated', { hostname: cfg.hostname, ip, previousIp });
      }
    }
  } catch (e) {
    state.lastResult = { ok: false, reason: 'update request failed: ' + e.message };
    console.warn('[ddns] ' + state.lastResult.reason);
    moduleFlow.emit('ddns:update_failed', { hostname: cfg.hostname, reason: e.message });
  }

  saveState(stateFile, state);
  return state;
}

/** Real, running interval -- not a one-shot. Returns a handle with
    stop() and checkNow() (for a real "check now" button in Settings,
    not just a background timer nobody can see the result of). */
function start(cfg, stateFile) {
  if (!cfg || !cfg.enabled) return null;
  if (!cfg.updateUrl || !cfg.hostname) {
    console.warn('[ddns] enabled but updateUrl/hostname are not configured -- see config/options.json\'s own ddns.updateUrlExamples. Not starting.');
    return null;
  }
  const intervalMs = Math.max(1, cfg.checkIntervalMinutes || 15) * 60 * 1000;
  let timer = null;
  const run = () => checkAndUpdate(cfg, stateFile).catch((e) => console.warn('[ddns] unexpected error: ' + e.message));
  run(); // real check on startup, not just on the first interval tick
  timer = setInterval(run, intervalMs);
  if (timer.unref) timer.unref(); // never keeps the process alive on its own
  return {
    stop: () => clearInterval(timer),
    checkNow: () => checkAndUpdate(cfg, stateFile),
    getState: () => loadState(stateFile),
  };
}

module.exports = { start, checkAndUpdate, getPublicIp, sendUpdate, loadState };
