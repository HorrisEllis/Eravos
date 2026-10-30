'use strict';
/**
 * paths.js — the one place that computes where this app's data lives,
 * so main.js (inside Electron, where app.getPath exists) and cli.js
 * (plain Node, where it doesn't) agree on the same directory without
 * duplicating the platform-specific logic twice and risking drift.
 *
 * Electron's own app.getPath('userData') convention, replicated exactly:
 *   macOS:   ~/Library/Application Support/<name>
 *   Windows: %APPDATA%\<name>
 *   Linux:   ~/.config/<name>
 * (Electron itself computes this the same way under the hood — this
 * isn't a guess, it's the documented convention.)
 */
const path = require('path');
const os   = require('os');

const APP_NAME = 'clear-glass-lite';

function getUserDataPath() {
  // Inside Electron, always prefer the real app.getPath — it's the actual
  // source of truth and respects any --user-data-dir override the user
  // launched with, which this fallback can't know about.
  try {
    const { app } = require('electron');
    if (app && app.getPath) return app.getPath('userData');
  } catch (_) { /* not running inside Electron — fall through to CLI path */ }

  const home = os.homedir();
  if (process.platform === 'darwin') return path.join(home, 'Library', 'Application Support', APP_NAME);
  if (process.platform === 'win32') return path.join(process.env.APPDATA || path.join(home, 'AppData', 'Roaming'), APP_NAME);
  return path.join(process.env.XDG_CONFIG_HOME || path.join(home, '.config'), APP_NAME);
}

module.exports = { getUserDataPath, APP_NAME };
