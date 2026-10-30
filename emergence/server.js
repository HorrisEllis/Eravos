'use strict';
/**
 * server.js — HTTP + SSE interface to the main Emergence loop.
 *
 * Genuinely additive, not a port: the loop had a CLI (cli.js) but no
 * HTTP interface, unlike feedback-loop-buffer which has both. Modeled
 * on a real architecture found in build-tools/rheon-idea-os/server/
 * index.js — HTTP route -> gate/tick -> broadcast to live clients ->
 * ledger — but REBUILT, not vendored: that server uses `express` as an
 * external dependency, which would break the zero-runtime-deps
 * discipline every other part of this project holds (WARP, Jaa,
 * feedback-loop-buffer's own API). This uses Node's built-in `http`
 * only, same as feedback-loop-buffer/api/server.js.
 *
 * SSE (Server-Sent Events) is plain HTTP with
 * Content-Type: text/event-stream — no library needed either.
 *
 * Routes:
 *   POST /tick     { text, target? }  -> full tick() result
 *   GET  /history  ?n=20               -> real durable chains
 *   GET  /sigma                        -> divergence-since-baseline per component
 *   POST /trace    { nodeId }          -> reverse causal condition mapping
 *   GET  /events                       -> SSE stream, broadcasts every tick live
 */

const http = require('http');
const { URL } = require('url');
const { createEmergenceLoop } = require('./loop.js');

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
  const loop = createEmergenceLoop(opts);
  const sseClients = new Set();

  /** broadcast — fan-out to every live SSE client, same shape as rheon-idea-os's real broadcast() */
  function broadcast(type, payload) {
    const data = JSON.stringify({ type, payload, ts: Date.now() });
    for (const res of sseClients) {
      try { res.write(`data: ${data}\n\n`); }
      catch { sseClients.delete(res); }
    }
  }

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

    try {
      if (req.method === 'GET' && url.pathname === '/events') {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        });
        res.write(': connected\n\n');
        sseClients.add(res);
        req.on('close', () => sseClients.delete(res));
        return;
      }

      if (req.method === 'POST' && url.pathname === '/tick') {
        const raw = await readBody(req);
        let parsed;
        try { parsed = JSON.parse(raw); } catch { return json(res, 400, { error: 'body must be valid JSON' }); }
        if (!parsed.text) return json(res, 400, { error: 'body must have a "text" key' });

        try {
          const result = await loop.tick(parsed.text, parsed.target);
          broadcast('tick', result); // live observability -- every tick fans out to connected SSE clients
          return json(res, 200, result);
        } catch (e) {
          return json(res, 422, { error: e.message });
        }
      }

      if (req.method === 'GET' && url.pathname === '/history') {
        const n = url.searchParams.has('n') ? +url.searchParams.get('n') : 20;
        return json(res, 200, loop.history(n));
      }

      if (req.method === 'GET' && url.pathname === '/sigma') {
        return json(res, 200, loop.sigma());
      }

      if (req.method === 'GET' && url.pathname === '/logs') {
        return json(res, 200, loop.logs());
      }

      if (req.method === 'GET' && url.pathname === '/patterns') {
        return json(res, 200, loop.patterns.stats());
      }

      if (req.method === 'POST' && url.pathname === '/people') {
        const raw = await readBody(req);
        let parsed;
        try { parsed = JSON.parse(raw); } catch { return json(res, 400, { error: 'body must be valid JSON' }); }
        try {
          const person = await loop.people.add(parsed);
          return json(res, 200, person);
        } catch (e) {
          return json(res, 422, { error: e.message });
        }
      }

      if (req.method === 'GET' && url.pathname === '/people') {
        const q = url.searchParams.get('q');
        if (q) return json(res, 200, loop.people.search(q));
        return json(res, 200, loop.people.list());
      }

      if (req.method === 'POST' && url.pathname === '/people/interact') {
        const raw = await readBody(req);
        let parsed;
        try { parsed = JSON.parse(raw); } catch { return json(res, 400, { error: 'body must be valid JSON' }); }
        try {
          const result = await loop.people.interact(parsed.personId, { text: parsed.text, mood: parsed.mood });
          return json(res, 200, result);
        } catch (e) {
          return json(res, 422, { error: e.message });
        }
      }

      if (req.method === 'POST' && url.pathname === '/people/dimensions') {
        const raw = await readBody(req);
        let parsed;
        try { parsed = JSON.parse(raw); } catch { return json(res, 400, { error: 'body must be valid JSON' }); }
        try {
          const result = await loop.people.setDimensions(parsed.personId, parsed.dimensions);
          return json(res, 200, result);
        } catch (e) {
          return json(res, 422, { error: e.message });
        }
      }

      if (req.method === 'POST' && url.pathname === '/space/contact') {
        const raw = await readBody(req);
        let parsed;
        try { parsed = JSON.parse(raw); } catch { return json(res, 400, { error: 'body must be valid JSON' }); }
        try {
          const result = await loop.space.logContact(parsed);
          return json(res, 200, result);
        } catch (e) {
          return json(res, 422, { error: e.message });
        }
      }

      if (req.method === 'POST' && url.pathname === '/space/locations') {
        const raw = await readBody(req);
        let parsed;
        try { parsed = JSON.parse(raw); } catch { return json(res, 400, { error: 'body must be valid JSON' }); }
        return json(res, 200, loop.space.setLocations(parsed));
      }

      if (req.method === 'GET' && url.pathname === '/space/health') {
        return json(res, 200, loop.space.health());
      }

      if (req.method === 'POST' && url.pathname === '/space/check-time') {
        const raw = await readBody(req);
        let parsed;
        try { parsed = JSON.parse(raw); } catch { return json(res, 400, { error: 'body must be valid JSON' }); }
        if (typeof parsed.timestamp !== 'number') return json(res, 400, { error: 'body must have a numeric "timestamp" key (ms epoch)' });
        return json(res, 200, loop.space.checkProposedTime(parsed.timestamp));
      }

      if (req.method === 'POST' && url.pathname === '/trace') {
        const raw = await readBody(req);
        let parsed;
        try { parsed = JSON.parse(raw); } catch { return json(res, 400, { error: 'body must be valid JSON' }); }
        if (!parsed.nodeId) return json(res, 400, { error: 'body must have a "nodeId" key' });
        const trace = await loop.traceEndState(parsed.nodeId, parsed.maxDepth);
        return json(res, 200, trace);
      }

      if (req.method === 'POST' && url.pathname === '/ideas') {
        const raw = await readBody(req);
        let parsed;
        try { parsed = JSON.parse(raw); } catch { return json(res, 400, { error: 'body must be valid JSON' }); }
        try {
          const idea = await loop.ideas.add(parsed);
          return json(res, 200, idea);
        } catch (e) {
          return json(res, 422, { error: e.message });
        }
      }

      if (req.method === 'GET' && url.pathname === '/ideas') {
        const q = url.searchParams.get('q');
        if (q) return json(res, 200, loop.ideas.search(q, url.searchParams.get('projectId') || undefined));
        return json(res, 200, loop.ideas.list({
          projectId: url.searchParams.get('projectId') || undefined,
          limit: url.searchParams.has('limit') ? +url.searchParams.get('limit') : undefined,
        }));
      }

      if (req.method === 'POST' && url.pathname === '/ideas/link') {
        const raw = await readBody(req);
        let parsed;
        try { parsed = JSON.parse(raw); } catch { return json(res, 400, { error: 'body must be valid JSON' }); }
        try {
          const edge = await loop.ideas.link(parsed);
          return json(res, 200, edge);
        } catch (e) {
          return json(res, 422, { error: e.message });
        }
      }

      if (req.method === 'GET' && url.pathname === '/ideas/graph') {
        return json(res, 200, loop.ideas.graph(url.searchParams.get('projectId') || undefined));
      }

      return json(res, 404, { error: `no route for ${req.method} ${url.pathname}` });
    } catch (e) {
      // §1.2: nothing silently fails -- unexpected errors are a loud 500
      return json(res, 500, { error: e.message });
    }
  });

  server.loop = loop; // exposed for tests / in-process use
  return server;
}

if (require.main === module) {
  const port = +(process.env.PORT || 7200);
  const dataDir = process.env.EMERGENCE_DATA_DIR || undefined;
  const server = createServer({ dataDir });
  server.listen(port, () => {
    console.log(`[emergence] listening on :${port}`);
  });
}

module.exports = { createServer };
