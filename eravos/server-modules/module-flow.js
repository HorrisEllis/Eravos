'use strict';
/**
 * module-flow.js — the real, shared event bus every server-module
 * (ddns-client.js, tiny-smtp-client.js/-server.js, and whatever
 * voice/video modules follow) talks through, instead of eravos-serve.js
 * calling each one directly and modules never being able to react to
 * each other.
 *
 * Built directly on real WARP primitives (../warp, a real sibling
 * project already in this repo) rather than a new event-bus
 * implementation -- direct instruction: "use warp for any new files."
 * Cause = an event. Drawbridge = a pure handler (matches/transform,
 * no side effects, returns the Causes it produces). Flow = the actual
 * dispatch loop a Drawbridge registers into. FlowLog = WARP's own
 * real, in-memory-only audit trail (confirmed directly -- zero disk
 * I/O, by design, since WARP itself has zero external dependencies).
 * Real, cross-restart persistence is this file's own addition, layered
 * on top rather than reaching into FlowLog (see emit()/readHistory()
 * below).
 *
 * One shared Flow instance, module-scoped singleton (not a class other
 * files instantiate their own copy of) -- so a Drawbridge registered by
 * ddns-client.js and one registered by eravos-serve.js are genuinely
 * on the same bus, not two separate ones that happen to share a name.
 *
 * §5.1 (everything has a UUID, hook, and event bus registration),
 * §14.1 (every cross-system feature is a SISO pipeline: Cause ->
 * Drawbridge -> Cause), §14.3 (signature collision is a hard error --
 * Flow.register() already throws on this, inherited for free, not
 * reimplemented).
 */

const path = require('path');
const fs = require('fs');
const { Cause, Drawbridge, Flow, FlowLog } = require(path.join(__dirname, '..', '..', 'warp'));

// Real, persisted event history -- every Cause emitted through this
// Flow is appended here, not just held in memory. FlowLog itself is
// correctly, intentionally in-memory-only (confirmed directly by
// reading warp/core/FlowLog.js -- constructor() takes no arguments;
// WARP's own real constraint is zero dependencies, so disk I/O
// deliberately doesn't live inside warp/core/). This layers real,
// separate persistence on top instead: matches §0.3 (information must
// never be lost) and §2.1 (persistence is the golden rule) without
// changing WARP itself.
const LOG_DIR = path.join(__dirname, '..', 'data', 'module-flow');
const LOG_FILE = path.join(LOG_DIR, 'events.jsonl');
const log = new FlowLog();
const flow = new Flow({ log });

function _persistEntry(entry) {
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    fs.appendFileSync(LOG_FILE, JSON.stringify(entry) + '\n');
  } catch (e) {
    console.warn('[module-flow] could not persist event to ' + LOG_FILE + ': ' + e.message);
  }
}

/** readHistory() — the real, persisted event log, for a settings UI or
    diagnostic to actually read back later, not just an in-memory trail
    that dies with the process. */
function readHistory(limit) {
  try {
    const lines = fs.readFileSync(LOG_FILE, 'utf8').trim().split('\n').filter(Boolean);
    const entries = lines.map((l) => { try { return JSON.parse(l); } catch (e) { return null; } }).filter(Boolean);
    return limit ? entries.slice(-limit) : entries;
  } catch (e) {
    return [];
  }
}

/** emit(type, data) — the one real way a server-module tells the bus
    something happened. Wraps Cause construction so callers never build
    one by hand (keeps the uuid/ts/freeze discipline in one place).
    Persists the real Cause itself (type/data/uuid/ts) here, in code
    this file actually owns -- not by reaching into FlowLog's own
    internals, which would repeat the exact monkey-patch mistake this
    file's own history already caught and reverted once (§5.3, §5.9). */
function emit(type, data) {
  const cause = new Cause(type, data);
  _persistEntry({ type: cause.type, data: cause.data, uuid: cause.uuid, ts: cause.ts });
  return flow.emit(cause);
}

/** register(signature, handler) — a real module's own way to own a
    Cause type. handler(cause) -> Cause[] | void, matching Drawbridge's
    own real transform contract (pure, returns what it produces rather
    than emitting as a side effect). Throws on signature collision --
    inherited from Flow.register() itself, not re-checked here. */
function register(signature, handler, opts = {}) {
  const db = new Drawbridge(signature, {
    matches: opts.matches,
    transform: handler,
    schema: opts.schema || null,
  });
  flow.register(db);
  return db;
}

/** on(type, observerFn) — a real, non-owning subscriber. Multiple
    things can observe the same Cause type (register() is exclusive,
    on() is not) -- the real mechanism for "when DDNS updates the IP,
    also update publicOrigin" without DDNS's own module needing to know
    that consumer exists. */
function on(type, observerFn) {
  return flow.on(type, observerFn);
}

module.exports = { flow, log, emit, register, on, readHistory, Cause, Drawbridge };
