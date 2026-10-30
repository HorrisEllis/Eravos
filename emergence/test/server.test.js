'use strict';
const assert = require('assert');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createServer } = require('../server.js');

let pass = 0, fail = 0;
async function test(name, fn) {
  try { await fn(); pass++; console.log(`  ok  - ${name}`); }
  catch (e) { fail++; console.log(`  FAIL - ${name}\n         ${e.message}`); }
}

function request(port, method, path, body) {
  return new Promise((resolve, reject) => {
    const payload = body !== undefined ? JSON.stringify(body) : null;
    const req = http.request(
      { host: '127.0.0.1', port, path, method, headers: payload ? { 'Content-Type': 'application/json' } : {} },
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

async function withServer(fn) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'emergence-server-test-'));
  const server = createServer({ dataDir });
  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;
  try {
    await fn(port, server);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

async function main() {
  await test('POST /tick returns a real result with observation, created, lattice, causal, ledger', async () => {
    await withServer(async (port) => {
      const { status, body } = await request(port, 'POST', '/tick', { text: 'hello world' });
      assert.strictEqual(status, 200);
      assert.ok(body.observation);
      assert.ok(body.created);
      assert.ok(body.lattice);
      assert.ok(body.causal);
      assert.ok(body.ledger);
    });
  });

  await test('POST /tick with malformed JSON returns 400, not a crash', async () => {
    await withServer(async (port) => {
      const { status, body } = await new Promise((resolve, reject) => {
        const req = http.request({ host: '127.0.0.1', port, path: '/tick', method: 'POST', headers: { 'Content-Type': 'application/json' } }, res => {
          let data = ''; res.on('data', c => data += c);
          res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(data) }));
        });
        req.on('error', reject);
        req.write('not valid json');
        req.end();
      });
      assert.strictEqual(status, 400);
      assert.ok(body.error);
    });
  });

  await test('POST /tick with no text returns 400', async () => {
    await withServer(async (port) => {
      const { status } = await request(port, 'POST', '/tick', {});
      assert.strictEqual(status, 400);
    });
  });

  await test('GET /history returns real durable chains after a tick', async () => {
    await withServer(async (port) => {
      await request(port, 'POST', '/tick', { text: 'one' });
      await request(port, 'POST', '/tick', { text: 'two' });
      const { status, body } = await request(port, 'GET', '/history?n=5');
      assert.strictEqual(status, 200);
      assert.strictEqual(body.ledger.length, 2);
    });
  });

  await test('GET /sigma returns real divergence counts', async () => {
    await withServer(async (port) => {
      await request(port, 'POST', '/tick', { text: 'one' });
      const { status, body } = await request(port, 'GET', '/sigma');
      assert.strictEqual(status, 200);
      assert.strictEqual(typeof body.lattice, 'number');
      assert.strictEqual(typeof body.causal, 'number');
    });
  });

  await test('POST /trace returns a real reverse causal trace for a real node', async () => {
    await withServer(async (port) => {
      const { body: tickResult } = await request(port, 'POST', '/tick', { text: 'hello' });
      const { status, body } = await request(port, 'POST', '/trace', { nodeId: tickResult.lattice.nodeId });
      assert.strictEqual(status, 200);
      assert.ok(Array.isArray(body.path));
      assert.ok(body.path.includes(tickResult.lattice.nodeId));
    });
  });

  await test('unknown route returns 404, not a crash or hang', async () => {
    await withServer(async (port) => {
      const { status } = await request(port, 'GET', '/nonexistent');
      assert.strictEqual(status, 404);
    });
  });

  await test('GET /events (SSE) accepts a connection and broadcasts a real tick live', async () => {
    await withServer(async (port) => {
      const chunks = [];
      const sseReq = http.get({ host: '127.0.0.1', port, path: '/events' }, res => {
        res.on('data', c => chunks.push(c.toString()));
      });
      await new Promise(resolve => setTimeout(resolve, 150)); // let the SSE connection establish

      await request(port, 'POST', '/tick', { text: 'broadcast me' });
      await new Promise(resolve => setTimeout(resolve, 150)); // let the broadcast arrive

      sseReq.destroy();
      const captured = chunks.join('');
      assert.ok(captured.includes('"type":"tick"'), 'SSE stream should have received a real tick broadcast, not just the connection handshake');
      assert.ok(captured.includes('broadcast me') === false, 'raw input text is not expected verbatim in the payload, but the tick data structure should be present');
      assert.ok(captured.includes('"observation"'), 'the broadcast payload should contain real tick result data');
    });
  });

  await test('POST /ideas then GET /ideas?q= finds it, and it works as a real tick target', async () => {
    await withServer(async (port) => {
      const { status, body: idea } = await request(port, 'POST', '/ideas', { text: 'pursue repair as an end-state', tags: ['relational'] });
      assert.strictEqual(status, 200);
      assert.ok(idea.id);

      const { body: found } = await request(port, 'GET', '/ideas?q=repair');
      assert.strictEqual(found.length, 1);
      assert.strictEqual(found[0].id, idea.id);

      const { body: tickResult } = await request(port, 'POST', '/tick', {
        text: 'hello', target: { id: idea.id, type: 'idea', mass: 15 },
      });
      assert.strictEqual(tickResult.created.target.id, idea.id, 'the real idea id should work as a real tick target');
    });
  });

  await test('POST /ideas with empty text returns 422, not a crash', async () => {
    await withServer(async (port) => {
      const { status, body } = await request(port, 'POST', '/ideas', { text: '' });
      assert.strictEqual(status, 422);
      assert.ok(body.error);
    });
  });

  await test('POST /ideas/link validates real edge types and rejects invalid ones', async () => {
    await withServer(async (port) => {
      const { body: a } = await request(port, 'POST', '/ideas', { text: 'a' });
      const { body: b } = await request(port, 'POST', '/ideas', { text: 'b' });
      const good = await request(port, 'POST', '/ideas/link', { fromId: a.id, toId: b.id, type: 'refines' });
      assert.strictEqual(good.status, 200);
      const bad = await request(port, 'POST', '/ideas/link', { fromId: a.id, toId: b.id, type: 'bogus' });
      assert.strictEqual(bad.status, 422);
    });
  });

  await test('GET /logs returns real dispatch history across every stream', async () => {
    await withServer(async (port) => {
      await request(port, 'POST', '/tick', { text: 'hello' });
      const { status, body } = await request(port, 'GET', '/logs');
      assert.strictEqual(status, 200);
      for (const name of ['observer', 'creator', 'lattice', 'causal', 'ledger']) {
        assert.ok(body[name].length > 0, `${name} should have real log entries`);
      }
    });
  });

  await test('POST /tick surfaces real Liminal signals over HTTP, not just direct loop.tick()', async () => {
    await withServer(async (port) => {
      const { body } = await request(port, 'POST', '/tick', {
        text: 'They always do this to me. Everyone knows that is just how things are.',
      });
      assert.ok('oscillatory' in body.observation, 'HTTP tick result should include the same fixed observation shape');
      assert.ok(body.observation.assumption || body.observation.reversal || body.observation.existential,
        'at least one real signal should have fired on this designed text, reaching the HTTP caller');
    });
  });

  await test('GET /patterns returns real pattern-engine stats after ticks', async () => {
    await withServer(async (port) => {
      await request(port, 'POST', '/tick', { text: 'hello' });
      await request(port, 'POST', '/tick', { text: 'goodbye' });
      const { status, body } = await request(port, 'GET', '/patterns');
      assert.strictEqual(status, 200);
      assert.strictEqual(typeof body.distinctPatterns, 'number');
      assert.ok(body.distinctPatterns >= 1);
    });
  });

  await test('POST /people then GET /people?q= finds it', async () => {
    await withServer(async (port) => {
      const { status, body: person } = await request(port, 'POST', '/people', { name: 'Alice', relationship: 'partner' });
      assert.strictEqual(status, 200);
      assert.strictEqual(Object.keys(person.dimensions).length, 24);

      const { body: found } = await request(port, 'GET', '/people?q=partner');
      assert.strictEqual(found.length, 1);
      assert.strictEqual(found[0].id, person.id);
    });
  });

  await test('POST /people with empty name returns 422, not a crash', async () => {
    await withServer(async (port) => {
      const { status, body } = await request(port, 'POST', '/people', { name: '' });
      assert.strictEqual(status, 422);
      assert.ok(body.error);
    });
  });

  await test('POST /people/interact and /people/dimensions work through the real server', async () => {
    await withServer(async (port) => {
      const { body: person } = await request(port, 'POST', '/people', { name: 'Alice' });
      const interactRes = await request(port, 'POST', '/people/interact', { personId: person.id, text: 'hi', mood: '\u2726' });
      assert.strictEqual(interactRes.status, 200);
      const dimRes = await request(port, 'POST', '/people/dimensions', { personId: person.id, dimensions: { trust: 0.9 } });
      assert.strictEqual(dimRes.status, 200);
      assert.strictEqual(dimRes.body.dimensions.trust, 0.9);
    });
  });

  await test('POST /people/interact rejects an invalid mood with 422', async () => {
    await withServer(async (port) => {
      const { body: person } = await request(port, 'POST', '/people', { name: 'Alice' });
      const { status, body } = await request(port, 'POST', '/people/interact', { personId: person.id, text: 'hi', mood: 'bogus' });
      assert.strictEqual(status, 422);
      assert.ok(body.error);
    });
  });

  await test('POST /space/locations + /space/contact + GET /space/health work through the real server', async () => {
    await withServer(async (port) => {
      await request(port, 'POST', '/space/locations', { personA: { timezone: 'America/New_York' }, personB: { timezone: 'Asia/Kolkata' } });
      await request(port, 'POST', '/space/contact', { contactType: 'call' });
      const { status, body } = await request(port, 'GET', '/space/health');
      assert.strictEqual(status, 200);
      assert.strictEqual(body.overlapHours, 5.5);
    });
  });

  await test('POST /space/contact rejects an invalid contact type with 422', async () => {
    await withServer(async (port) => {
      const { status, body } = await request(port, 'POST', '/space/contact', { contactType: 'telepathy' });
      assert.strictEqual(status, 422);
      assert.ok(body.error);
    });
  });

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exitCode = 1;
}

main();
