/**
 * kernel-adapter.mjs — the minimal kernel RelationalModule (via ALKModule)
 * actually requires: emit(type, payload, meta) and subscribe(pattern,
 * handler, meta) -> unsub. Exact-match pattern routing only — everything
 * RelationalModule subscribes to is a literal event name, no wildcards
 * used, so this doesn't need to be more than that.
 *
 * This is NOT a reimplementation of the real ALK kernel (kernel.js) —
 * that's a much larger sovereign system with its own pattern-matching,
 * clock, and lifecycle. This is the smallest object that satisfies the
 * one contract RelationalModule actually calls, so the real, unmodified
 * relational.js can run without pulling in a kernel it doesn't need for
 * this integration.
 */

function uid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

export function createMinimalKernel() {
  const handlers = new Map(); // pattern -> Set<fn>
  const captured = [];         // every emitted event, for the Gate to read back

  return {
    emit(type, payload, meta = {}) {
      const event = { id: uid(), type, payload, ts: Date.now(), ...meta };
      captured.push(event);
      const set = handlers.get(type);
      if (set) for (const fn of set) fn(event);
      return event;
    },
    subscribe(pattern, handler) {
      if (!handlers.has(pattern)) handlers.set(pattern, new Set());
      handlers.get(pattern).add(handler);
      return () => handlers.get(pattern)?.delete(handler);
    },
    captured, // exposed so the Gate can read what RelationalModule emitted
  };
}
