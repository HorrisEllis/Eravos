'use strict';
/**
 * logger.js — one real, persistent error log, shared everywhere.
 *
 * §BUILT 2026-07-19 — "error.log." Before this, errors went to
 * console.error scattered across main.js, guardian-lite/server.js,
 * userscripts.js, and cli.js — real, but only visible if you happened to
 * be watching the terminal (or DevTools) at the moment something failed.
 * Anything that happened while the window was just sitting open, unwatched,
 * left no trace. This writes every real error to a real file too, so
 * "what went wrong overnight" has an actual answer.
 *
 * Console output is KEPT, not replaced — logError still prints to
 * console.error exactly like the call sites already did, so live
 * debugging during development doesn't lose anything. The file is
 * additive.
 */
const fs   = require('fs');
const path = require('path');
const { getUserDataPath } = require('./paths');

const LOG_FILE = path.join(getUserDataPath(), 'error.log');
const MAX_LOG_BYTES = 5 * 1024 * 1024; // 5MB — real rotation, not unbounded growth

function _rotateIfNeeded() {
  try {
    const stat = fs.statSync(LOG_FILE);
    if (stat.size > MAX_LOG_BYTES) {
      const rotated = LOG_FILE.replace(/\.log$/, `.${Date.now()}.log`);
      fs.renameSync(LOG_FILE, rotated);
    }
  } catch (_) { /* file doesn't exist yet — nothing to rotate */ }
}

/**
 * logError(context, error) — the one function every real error path in
 * this app should call. `context` is a short string identifying where
 * this came from ('main', 'guardian-lite', 'userscripts:claude.ai', etc)
 * — real grep-able labels, not free text, so `grep '\\[guardian-lite\\]'
 * error.log` actually works.
 */
function logError(context, error) {
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : null;
  console.error(`[${context}]`, message);

  try {
    _rotateIfNeeded();
    fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
    const line = `${new Date().toISOString()} [${context}] ${message}${stack ? '\n' + stack : ''}\n`;
    fs.appendFileSync(LOG_FILE, line, 'utf8');
  } catch (writeErr) {
    // The one place this file allows a silent-ish failure — logging the
    // failure of logging itself to console only avoids a real risk of
    // infinite recursion (logError calling logError calling logError if
    // disk is genuinely unwritable), while still not hiding it entirely.
    console.error('[logger] could not write to error.log:', writeErr.message);
  }
}

/**
 * logInfo(context, message) — same file, same format, no stack — for real
 * operational events worth having in the same timeline as errors (server
 * started, config changed) without pretending they're failures.
 */
function logInfo(context, message) {
  try {
    _rotateIfNeeded();
    fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
    fs.appendFileSync(LOG_FILE, `${new Date().toISOString()} [${context}] ${message}\n`, 'utf8');
  } catch (_) { /* same reasoning as logError's catch — don't recurse on a logging failure */ }
}

function readLog(maxLines = 200) {
  try {
    const content = fs.readFileSync(LOG_FILE, 'utf8');
    const lines = content.split('\n').filter(Boolean);
    return lines.slice(-maxLines);
  } catch (_) {
    return [];
  }
}

function clearLog() {
  try { fs.writeFileSync(LOG_FILE, '', 'utf8'); return true; }
  catch (e) { console.error('[logger] could not clear error.log:', e.message); return false; }
}

module.exports = { logError, logInfo, readLog, clearLog, LOG_FILE };
