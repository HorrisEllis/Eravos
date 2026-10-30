'use strict';
/**
 * relay-persistence.js — real, durable, server-side persistence for
 * co-creation (paired) events. Direct request: co-creation data
 * shouldn't be lost if both devices go offline or get reset; device
 * storage (IndexedDB) stays the real store for solo mode, unchanged.
 *
 * Uses node:sqlite -- real, built into Node 22+, no external npm
 * dependency (matches "what doesn't exist must be built" and this
 * whole project's "always self-hosted" principle). Node's own label
 * is "experimental" -- stated honestly here, not hidden; the API used
 * below (DatabaseSync, prepare/run/all) has been stable across the
 * versions this was built and tested against.
 *
 * CRITICAL, load-bearing design constraint: relay-server.js's own
 * documented guarantee is "the relay only ever reads type/peerId/pub
 * on the wire — never payload... it doesn't need to decrypt anything
 * to do its job." This module exists to add real persistence WITHOUT
 * breaking that guarantee — every payload stored here is the exact
 * same opaque, already-encrypted bytes the relay was already
 * forwarding, never parsed, never inspected, never decrypted
 * server-side. If both devices lose their keys, this data is
 * unrecoverable — that's correct, not a bug; it means the guarantee
 * held.
 */

const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');

let db = null;

function init(dbPath) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  db = new DatabaseSync(dbPath);
  // pairKey is a real, stable, order-independent identifier for the
  // two-person relay pair (sorted peerId pair, joined) -- so both
  // directions of a conversation land in the same real row set,
  // queryable together regardless of who sent which message.
  db.exec(`
    CREATE TABLE IF NOT EXISTS relay_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pairKey TEXT NOT NULL,
      fromPeerId TEXT NOT NULL,
      payload TEXT NOT NULL,
      ts INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_relay_events_pair_ts ON relay_events(pairKey, ts);
  `);
  console.log('[relay] real, durable co-creation persistence live at ' + dbPath);
  return db;
}

function pairKey(peerIdA, peerIdB) {
  return [peerIdA, peerIdB].sort().join('::');
}

/** persist(fromPeerId, otherPeerId, opaquePayload) -- stores the exact
    opaque payload the relay already has in hand, never parsed. §1.2:
    a persistence failure is logged, never thrown up into the relay's
    own real-time forwarding path -- a slow or failed disk write must
    never delay or break message delivery. */
function persist(fromPeerId, otherPeerId, opaquePayload) {
  if (!db) return { ok: false, reason: 'persistence not initialized' };
  try {
    const stmt = db.prepare('INSERT INTO relay_events (pairKey, fromPeerId, payload, ts) VALUES (?, ?, ?, ?)');
    stmt.run(pairKey(fromPeerId, otherPeerId), fromPeerId, String(opaquePayload), Date.now());
    return { ok: true };
  } catch (e) {
    console.warn('[relay] persistence write failed (message still delivered live): ' + e.message);
    return { ok: false, reason: e.message };
  }
}

/** eventsSince(peerIdA, peerIdB, sinceTs, limit) -- real catch-up
    query for a reconnecting device. Returns the real, stored opaque
    payloads in order; the caller (relay-server.js) forwards them
    exactly the same way a live relay message would be, so the
    client's own existing decrypt/handle path needs no special case
    for "this came from the database instead of live." */
function eventsSince(peerIdA, peerIdB, sinceTs, limit) {
  if (!db) return [];
  try {
    const stmt = db.prepare(
      'SELECT fromPeerId, payload, ts FROM relay_events WHERE pairKey = ? AND ts > ? ORDER BY ts ASC LIMIT ?'
    );
    return stmt.all(pairKey(peerIdA, peerIdB), sinceTs || 0, Math.min(limit || 500, 2000));
  } catch (e) {
    console.warn('[relay] persistence read failed: ' + e.message);
    return [];
  }
}

function close() {
  if (db) { try { db.close(); } catch (e) {} db = null; }
}

module.exports = { init, persist, eventsSince, close, pairKey };
