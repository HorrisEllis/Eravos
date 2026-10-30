'use strict';
/**
 * api/server.js — thin HTTP wrapper over the RingBuffer facade.
 * §3.4: raw execution before interfaces — this exists because index.js
 * already works standalone, proven by the test suite passing before this
 * file was written. Zero dependencies (http/url stdlib only), per §5.5.
 *
 * Routes:
 *   POST /push        { value: any }        -> { ok, index, wasFull, evicted }
 *   GET  /tail?n=10                          -> { items: [...] }
 *   GET  /status                             -> health() snapshot
 *   GET  /evictions?n=20                     -> eviction ledger tail
 *   POST /save                               -> forces an immediate snapshot
 */

const http = require('http');
const { URL } = require('url');
const { RingBuffer } = require('../index');

function readBody(req) {
  return new Promise((resolve, reject) => {
    let chunks = '';
    req.on('data', c => { chunks += c; if (chunks.length > 10 * 1024 * 1024) req.destroy(); });
    req.on('end', () => resolve(chunks));
    req.on('error', reject);
  });
}

function json(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) });
  res.end(payload);
}

function createServer(opts = {}) {
  const rb = new RingBuffer(opts);

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

    try {
      if (req.method === 'POST' && url.pathname === '/push') {
        const raw = await readBody(req);
        let parsed;
        try { parsed = JSON.parse(raw); } catch { return json(res, 400, { error: 'body must be valid JSON' }); }
        if (!('value' in parsed)) return json(res, 400, { error: 'body must have a "value" key' });
        try {
          const result = rb.push(parsed.value);
          return json(res, 200, { ok: true, ...result });
        } catch (e) {
          return json(res, 422, { ok: false, error: e.message });
        }
      }

      if (req.method === 'GET' && url.pathname === '/tail') {
        const n = url.searchParams.has('n') ? +url.searchParams.get('n') : undefined;
        return json(res, 200, { items: rb.tail(n) });
      }

      if (req.method === 'GET' && url.pathname === '/status') {
        return json(res, 200, rb.health());
      }

      if (req.method === 'GET' && url.pathname === '/evictions') {
        const n = url.searchParams.has('n') ? +url.searchParams.get('n') : 50;
        return json(res, 200, { evictions: rb.evictions(n) });
      }

      if (req.method === 'POST' && url.pathname === '/save') {
        const snap = rb.save();
        return json(res, 200, { ok: true, savedAt: snap.savedAt, size: snap.items.length });
      }

      return json(res, 404, { error: `no route for ${req.method} ${url.pathname}` });
    } catch (e) {
      // §1.2: nothing silently fails — an unexpected error is a loud 500, not a hang or a swallow.
      return json(res, 500, { error: e.message });
    }
  });

  server.ringBuffer = rb; // exposed for tests / CLI-in-process use
  return server;
}

if (require.main === module) {
  const port = +(process.env.PORT || 7100);
  const capacity = +(process.env.RING_CAPACITY || 256);
  const dataDir = process.env.RING_DATA_DIR || undefined;
  const server = createServer({ capacity, dataDir });
  server.listen(port, () => {
    console.log(`[ring-buffer] listening on :${port} (capacity ${capacity})`);
  });
}

module.exports = { createServer };
