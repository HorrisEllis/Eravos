#!/usr/bin/env node
'use strict';
/**
 * ring-cli — talks to a running api/server.js instance over HTTP.
 * §3.4: the last layer built, on top of an already-proven API.
 *
 * Usage:
 *   node cli/ring-cli.js push <value>       (value parsed as JSON if possible, else raw string)
 *   node cli/ring-cli.js tail [n]
 *   node cli/ring-cli.js status
 *   node cli/ring-cli.js evictions [n]
 *   node cli/ring-cli.js save
 *
 * Env: RING_HOST (default 127.0.0.1), RING_PORT (default 7100)
 */

const http = require('http');

const HOST = process.env.RING_HOST || '127.0.0.1';
const PORT = process.env.RING_PORT || 7100;

function request(method, path, body) {
  return new Promise((resolve, reject) => {
    const payload = body !== undefined ? JSON.stringify(body) : null;
    const req = http.request(
      { host: HOST, port: PORT, path, method, headers: payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {} },
      res => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => {
          try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
          catch { resolve({ status: res.statusCode, body: data }); }
        });
      }
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function parseValue(raw) {
  if (raw === undefined) return undefined;
  try { return JSON.parse(raw); } catch { return raw; } // fall back to raw string if not valid JSON
}

async function main() {
  const [, , cmd, ...args] = process.argv;

  try {
    if (cmd === 'push') {
      const value = parseValue(args.join(' '));
      if (value === undefined) { console.error('usage: ring-cli push <value>'); process.exitCode = 1; return; }
      const { status, body } = await request('POST', '/push', { value });
      console.log(status, JSON.stringify(body));
      if (status >= 400) process.exitCode = 1;
      return;
    }

    if (cmd === 'tail') {
      const n = args[0] ? `?n=${encodeURIComponent(args[0])}` : '';
      const { body } = await request('GET', `/tail${n}`);
      console.log(JSON.stringify(body, null, 2));
      return;
    }

    if (cmd === 'status') {
      const { body } = await request('GET', '/status');
      console.log(JSON.stringify(body, null, 2));
      return;
    }

    if (cmd === 'evictions') {
      const n = args[0] ? `?n=${encodeURIComponent(args[0])}` : '';
      const { body } = await request('GET', `/evictions${n}`);
      console.log(JSON.stringify(body, null, 2));
      return;
    }

    if (cmd === 'save') {
      const { body } = await request('POST', '/save');
      console.log(JSON.stringify(body));
      return;
    }

    console.error(`unknown command: ${cmd || '(none)'}\n\nusage: ring-cli <push|tail|status|evictions|save> [args]`);
    process.exitCode = 1;
  } catch (e) {
    console.error(`[ring-cli] request failed — is the server running on ${HOST}:${PORT}? (${e.message})`);
    process.exitCode = 1;
  }
}

main();
