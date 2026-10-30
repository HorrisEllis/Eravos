'use strict';
/**
 * serve-eravos.js — zero-dependency static file server for the Eravos PWA.
 *
 * Serves ./eravos on port 8080 by default. That port isn't arbitrary: it's
 * the exact origin clear-glass-lite/config.js already has pre-allowlisted
 * (http://localhost:8080) as the no-token fallback in guardian-lite's CORS
 * check — so running Eravos here means the whole chain works out of the
 * box with zero config, on top of the dynamic-origin fix (§DYNAMIC ORIGIN
 * 2026-07-25) that no longer strictly needs it, but matches anyway.
 *
 * Deliberately NOT `npx http-server` or any other package — this whole
 * system's pattern has been "own the primitives, zero runtime deps"
 * (nano-ws.js instead of `ws`, this instead of express/serve-static).
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = parseInt(process.env.PORT || '8080', 10);
const ROOT = path.join(__dirname, 'eravos');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
};

function safeJoin(root, urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0]);
  const resolved = path.normalize(path.join(root, decoded));
  // Reject any path that escapes ROOT via ../ traversal — a static file
  // server that trusts the URL path unconditionally is a real, common bug.
  if (!resolved.startsWith(root)) return null;
  return resolved;
}

const server = http.createServer((req, res) => {
  let filePath = safeJoin(ROOT, req.url === '/' ? '/index.html' : req.url);
  if (!filePath) { res.writeHead(400); res.end('Bad request'); return; }

  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      // SPA-style fallback isn't needed here — Eravos's tabs are lazy-
      // fetched fragments (eravosStampTab), not client-side routes — a
      // real 404 is the honest answer for anything not on disk.
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found: ' + req.url);
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[eravos] serving ${ROOT} at http://localhost:${PORT}`);
});
