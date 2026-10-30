'use strict';
/**
 * wire.js — connects RingBufferCore to WARP's Cause/Drawbridge/Axiom/Flow.
 *
 * Signal shape:
 *   Cause('ring:push', { value })              -> in
 *   Cause('ring:pushed', { index, evicted, value }) -> out, always
 *   Cause('ring:evicted', { value, index })     -> out, only when a push evicted something
 *
 * Two hard axioms (never skipped, per §17.10):
 *   ring:no-undefined   — reject a push whose value is undefined
 *   ring:no-function     — reject a push whose value is a function (can't
 *                          serialize it, so it can never survive a restart —
 *                          §2.1 persistence is the golden rule, and a value
 *                          that structurally cannot be persisted doesn't
 *                          belong in a buffer whose whole job is persistence)
 *
 * One soft axiom (may be skipped once verified, never silently — §17.10):
 *   ring:size-budget    — warns (does not block) when a single pushed value
 *                          serializes past a configurable byte budget
 */

const { RingBufferCore } = require('./RingBufferCore');
const { Cause, Drawbridge, Axiom, Flow, FlowLog } = require('../../../../warp');

const DEFAULT_SIZE_BUDGET_BYTES = 65536; // 64KB per item, soft warning only

function buildRingAxioms({ sizeBudgetBytes = DEFAULT_SIZE_BUDGET_BYTES } = {}) {
  const noUndefined = new Axiom('ring:no-undefined', {
    severity: 'hard',
    version: '1.0.0',
    check: (cause) => cause.data.value !== undefined,
  });

  const noFunction = new Axiom('ring:no-function', {
    severity: 'hard',
    version: '1.0.0',
    check: (cause) => typeof cause.data.value !== 'function',
  });

  const sizeBudget = new Axiom('ring:size-budget', {
    severity: 'soft',
    version: '1.0.0',
    check: (cause) => {
      try {
        const bytes = Buffer.byteLength(JSON.stringify(cause.data.value) ?? '', 'utf8');
        return bytes <= sizeBudgetBytes;
      } catch {
        return false; // unserializable (e.g. circular structure) is a soft-axiom fail, not a crash
      }
    },
  });

  return [noUndefined, noFunction, sizeBudget];
}

/**
 * buildRingGate(core) — the one Drawbridge this project needs. Matches
 * 'ring:push', mutates the core buffer (the one place in this whole
 * project where a side effect is allowed to live, by design — Drawbridge.js's
 * own contract says transform is pure w.r.t. the Flow, not that the
 * whole system may never touch memory), and returns the causes it
 * produced rather than emitting them as a side effect.
 */
function buildRingGate(core) {
  return new Drawbridge('ring:push', {
    schema: {
      requiredKeys: ['index', 'wasFull'],
      types: { index: 'number', wasFull: 'boolean' },
    },
    transform(cause) {
      const { value } = cause.data;
      const { evicted, index, wasFull } = core.push(value);

      const produced = [
        new Cause('ring:pushed', { index, wasFull, evicted, value }),
      ];
      if (wasFull) {
        produced.push(new Cause('ring:evicted', { value: evicted, index }));
      }
      return produced;
    },
  });
}

/**
 * createRingStream(capacity, opts) -> { core, flow, log, push }
 * The one assembly point. Everything above this is pure and testable
 * alone; this is where they're wired into a running WARP Flow.
 */
function createRingStream(capacityOrCore, opts = {}) {
  const core = capacityOrCore instanceof RingBufferCore
    ? capacityOrCore
    : new RingBufferCore(capacityOrCore);
  const log = new FlowLog();
  const axioms = buildRingAxioms(opts);
  const flow = new Flow({ log, axioms });
  flow.register(buildRingGate(core));

  /** push(value) -> { index, wasFull, evicted, value }, or throws on hard-axiom rejection */
  function push(value) {
    const before = flow.rejected.length;
    let captured = null;
    const unsubscribe = flow.on('ring:pushed', (cause) => { captured = cause.data; });
    flow.emit(new Cause('ring:push', { value }));
    unsubscribe();

    if (flow.rejected.length > before) {
      const rejection = flow.rejected[flow.rejected.length - 1];
      const err = new Error(
        `[ring] push rejected by hard axiom(s): ${rejection.failures.filter(f => f.severity === 'hard').map(f => f.axiomId).join(', ')}`
      );
      err.rejection = rejection;
      throw err;
    }
    return captured;
  }

  return { core, flow, log, push };
}

module.exports = { buildRingAxioms, buildRingGate, createRingStream, DEFAULT_SIZE_BUDGET_BYTES };
