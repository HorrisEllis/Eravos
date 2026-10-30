#!/usr/bin/env node
'use strict';
/**
 * cli.js — Clear Glass Lite's command line
 *
 * §BUILT 2026-07-19 — "customizable CLI commands... completely capable
 * of whatever a project demands."
 *
 * Works whether or not the Electron app is currently open: tries the
 * configured guardian-lite port first (real /health check, not just
 * "assume it's running"); if nothing answers, boots a real in-process
 * guardian-lite instance pointed at the SAME data directory for the
 * duration of this one command, then shuts it down cleanly on exit. A
 * CI script or build step can use this CLI without ever launching a
 * window.
 *
 * Custom commands: drop a .js file in the commands/ folder (real path
 * printed by `cli.js commands`, same convention as the userscripts
 * folder — auto-loaded, no registration step). Each file exports:
 *   module.exports = {
 *     name: 'mycommand',
 *     description: 'what it does',
 *     async run(args, api) { ... }
 *   }
 * `api` gives the handler real primitives — see buildApi() below — rather
 * than making every custom command reimplement HTTP calls and config
 * access from scratch.
 */

const http = require('http');
const path = require('path');
const fs   = require('fs');
const { getUserDataPath } = require('./paths');
const config = require('./config');
const { logError } = require('./logger');

const COMMANDS_DIR = path.join(getUserDataPath(), 'commands');

function ensureCommandsDir() {
  if (!fs.existsSync(COMMANDS_DIR)) fs.mkdirSync(COMMANDS_DIR, { recursive: true });
  return COMMANDS_DIR;
}

function loadCustomCommands() {
  ensureCommandsDir();
  const commands = new Map();
  let files = [];
  try { files = fs.readdirSync(COMMANDS_DIR).filter(f => f.endsWith('.js')); }
  catch (_) { return commands; }
  for (const file of files) {
    try {
      delete require.cache[require.resolve(path.join(COMMANDS_DIR, file))];
      const cmd = require(path.join(COMMANDS_DIR, file));
      if (!cmd.name || typeof cmd.run !== 'function') {
        console.error(`[cli] ${file} skipped — needs a 'name' string and a 'run' function`);
        continue;
      }
      commands.set(cmd.name, cmd);
    } catch (e) {
      logError('cli', `${file} failed to load: ${e.message}`);
    }
  }
  return commands;
}

// ── HTTP helpers against guardian-lite's real API ─────────────────────────
function httpRequest(method, urlPath, port, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    // §CORS+CSP HARDENING 2026-07-24 — server-to-server, so CORS never
    // applied here in the first place; the token IS the real check this
    // call is now subject to (see guardian-lite/server.js's _handle).
    // Read fresh off config each call rather than cached at module load,
    // in case something (a custom command, another process) rotated it.
    const token = config.get('guardianLiteToken');
    const headers = payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {};
    if (token) headers['X-CGL-Token'] = token;
    const req = http.request({
      hostname: '127.0.0.1', port, path: urlPath, method,
      headers,
      timeout: 5000,
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString())); }
        catch (e) { reject(new Error('invalid response from guardian-lite')); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('request timed out')); });
    if (payload) req.write(payload);
    req.end();
  });
}

async function ensureGuardianLite() {
  const port = config.get('guardianLitePort');
  try {
    await httpRequest('GET', '/health', port);
    return { port, ownedByThisProcess: false };
  } catch (_) {
    // Nothing answered — boot our own for the life of this command.
    const { GuardianLite } = require('./guardian-lite/server');
    const dataDir = path.join(getUserDataPath(), 'guardian-lite-store');
    const instance = new GuardianLite({ port, host: '127.0.0.1', dataDir, token: config.get('guardianLiteToken') || null, extraAllowedOrigins: config.get('guardianLiteExtraAllowedOrigins') || [] });
    await instance.start();
    return { port, ownedByThisProcess: true, instance };
  }
}

function buildApi(port) {
  return {
    get:    (urlPath) => httpRequest('GET', urlPath, port),
    post:   (urlPath, body) => httpRequest('POST', urlPath, port, body),
    del:    (urlPath) => httpRequest('DELETE', urlPath, port),
    config: { get: config.get, set: config.set },
  };
}

// ── Built-in commands ──────────────────────────────────────────────────
const BUILTIN = {
  status: {
    description: 'Show guardian-lite status and table counts',
    async run(_args, api) {
      const health = await api.get('/health');
      const stats = await api.get('/stats');
      console.log('guardian-lite:', health.ok ? 'running' : 'unreachable', `(uptime ${Math.round(health.uptime)}s)`);
      console.log('tables:', JSON.stringify(stats.tables, null, 2));
    },
  },
  ingest: {
    description: 'Ingest a JSON object: cli.js ingest \'{"table":"artifacts","content":"..."}\'',
    async run(args, api) {
      if (!args[0]) { console.error('usage: cli.js ingest \'{"content":"..."}\''); return; }
      const body = JSON.parse(args[0]);
      const result = await api.post('/ingest', body);
      console.log(result.ok ? `ingested: ${result.id}` : `failed: ${result.error}`);
    },
  },
  query: {
    description: 'Query a table: cli.js query [table] [limit]',
    async run(args, api) {
      const table = args[0] || 'artifacts';
      const limit = args[1] || '20';
      const result = await api.get(`/query?table=${encodeURIComponent(table)}&limit=${limit}`);
      console.log(JSON.stringify(result.rows, null, 2));
    },
  },
  config: {
    description: 'Get/set config: cli.js config [key] [value]',
    async run(args) {
      if (args.length === 0) { console.log(JSON.stringify(config.load(), null, 2)); return; }
      if (args.length === 1) { console.log(JSON.stringify(config.get(args[0]))); return; }
      let value = args[1];
      try { value = JSON.parse(value); } catch (_) { /* plain string, that's fine */ }
      config.set(args[0], value);
      console.log(`set ${args[0]} = ${JSON.stringify(value)}`);
    },
  },
  scripts: {
    description: 'List loaded userscripts',
    async run() {
      const userscripts = require('./userscripts');
      const scripts = userscripts.loadScripts();
      for (const s of scripts) console.log(`${s.enabled ? '✓' : '✗'} ${s.name} — ${s.matches.join(', ')}`);
      console.log(`\n${scripts.length} scripts — folder: ${userscripts.SCRIPTS_DIR}`);
    },
  },
  commands: {
    description: 'List custom command files and where to add them',
    async run() {
      const dir = ensureCommandsDir();
      const custom = loadCustomCommands();
      console.log(`custom commands folder: ${dir}`);
      console.log(custom.size === 0 ? '(none yet)' : [...custom.values()].map(c => `  ${c.name} — ${c.description || ''}`).join('\n'));
    },
  },
  log: {
    description: 'Show recent error.log entries: cli.js log [n] | cli.js log clear',
    async run(args) {
      const { readLog, clearLog, LOG_FILE } = require('./logger');
      if (args[0] === 'clear') {
        console.log(clearLog() ? `cleared ${LOG_FILE}` : 'clear failed — see above');
        return;
      }
      const n = parseInt(args[0], 10) || 50;
      const lines = readLog(n);
      console.log(`${LOG_FILE}\n`);
      console.log(lines.length ? lines.join('\n') : '(empty)');
    },
  },
};

async function main() {
  // Same fix as main.js — a CLI-only user (never opened the GUI) should
  // still get a real config.json on first run, not just in-memory defaults.
  config.ensureConfigFile();
  // §CORS+CSP HARDENING 2026-07-24 — same reasoning as main.js: a
  // CLI-only user needs a real token too, and needs it to be the SAME
  // token the Electron app would generate/use, since both read/write the
  // one config.json at paths.js's userData path.
  config.ensureGuardianToken();

  const [, , commandName, ...args] = process.argv;
  const custom = loadCustomCommands();
  // §BUG FOUND AND FIXED 2026-07-19 — a custom command with the same name
  // as a built-in silently won (object spread order), no indication to
  // the user that their built-in `status`/`config`/etc had been shadowed.
  // Found via QA testing: added a custom 'status' command, ran `cli.js
  // status`, got the custom one with zero warning. Shadowing itself is
  // kept — a project legitimately overriding built-in behavior is a real
  // use case — but it's now visible, not silent.
  for (const name of custom.keys()) {
    if (BUILTIN[name]) console.error(`[cli] note: custom command "${name}" overrides the built-in command of the same name`);
  }
  const all = { ...BUILTIN, ...Object.fromEntries([...custom].map(([k, v]) => [k, v])) };

  if (!commandName || commandName === 'help' || !all[commandName]) {
    if (commandName && commandName !== 'help') console.error(`Unknown command: ${commandName}\n`);
    console.log('Clear Glass Lite CLI\n');
    console.log('Built-in commands:');
    for (const [name, cmd] of Object.entries(BUILTIN)) console.log(`  ${name.padEnd(12)} ${cmd.description}`);
    if (custom.size) {
      console.log('\nCustom commands:');
      for (const cmd of custom.values()) console.log(`  ${cmd.name.padEnd(12)} ${cmd.description || ''}`);
    }
    console.log(`\nAdd your own: drop a .js file in ${ensureCommandsDir()}`);
    process.exitCode = commandName && commandName !== 'help' ? 1 : 0;
    return;
  }

  const { port, ownedByThisProcess, instance } = await ensureGuardianLite();
  const api = buildApi(port);
  try {
    await all[commandName].run(args, api);
  } catch (e) {
    logError('cli', `${commandName} failed: ${e.message}`);
    process.exitCode = 1;
  } finally {
    if (ownedByThisProcess && instance) await instance.stop();
  }
}

main();
