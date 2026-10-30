'use strict';
/**
 * Flow — the dispatch loop. O(1) signature-lookup discipline.
 * (Renamed from Stream, per the spine rename.)
 * Every transform runs through registered Axioms first. A hard-axiom
 * failure rejects the transform — logged, cause routed to `rejected`,
 * never silently completed and never silently dropped (both are failure
 * modes; this distinguishes them).
 *
 * hook(kind, plugin) is the one extension point — scorer/crystallizer/
 * cascader all attach here, all pure-function-shaped like Drawbridge, no
 * special-casing per kind.
 */
class Flow {
  constructor({ log = null, parentFlowId = null, axioms = [] } = {}) {
    this.drawbridges = new Map();
    this.axioms = [...axioms];
    this.pending = [];
    this.rejected = []; // axiom failures land here, not pending
    this.causeCount = 0;
    this.log = log;
    this.flowId = log ? log.nextFlowId() : null;
    this.parentFlowId = parentFlowId;
    this._hooks = { scorer: [], crystallizer: [], cascader: [] };
    this._observers = new Map(); // cause type -> [handler] — pub/sub, separate from drawbridge routing
  }

  register(drawbridge) {
    if (this.drawbridges.has(drawbridge.signature)) {
      throw new Error(`[warp/Flow] Signature collision: '${drawbridge.signature}'`);
    }
    this.drawbridges.set(drawbridge.signature, drawbridge);
  }

  /**
   * on(type, handler) — observe every cause of a given type as it passes
   * through emit(), without owning a drawbridge for it. A caller that
   * wants a live feed (a UI, a logger) registers here instead of
   * registering a competing Drawbridge for the same signature, which
   * would throw on collision. An observer's own error is caught and
   * swallowed — same §1.2-shaped guarantee as axiom-check failures:
   * something watching must never be able to break something running.
   */
  on(type, handler) {
    if (!this._observers.has(type)) this._observers.set(type, []);
    this._observers.get(type).push(handler);
    return () => {
      const arr = this._observers.get(type) || [];
      const i = arr.indexOf(handler);
      if (i >= 0) arr.splice(i, 1);
    };
  }

  registerAxiom(axiom) {
    this.axioms.push(axiom);
  }

  hook(kind, plugin) {
    if (!this._hooks[kind]) {
      throw new Error(`[warp/Flow] unknown hook kind: '${kind}'`);
    }
    if (typeof plugin !== 'function') {
      throw new Error(`[warp/Flow] hook '${kind}' plugin must be a function`);
    }
    this._hooks[kind].push(plugin);
  }

  hooks(kind) {
    return this._hooks[kind] ? [...this._hooks[kind]] : [];
  }

  /**
   * Run all hard axioms against a drawbridge about to fire on a cause.
   * Returns { ok: bool, failures: [{ axiomId, severity }] }.
   * Soft-axiom failures are recorded but never block.
   */
  _checkAxioms(cause, drawbridge) {
    const failures = [];
    for (const axiom of this.axioms) {
      let passed;
      try {
        passed = !!axiom.check(cause, drawbridge, this.sampleHere());
      } catch (e) {
        // §1.2-equivalent: an axiom that throws is a failure, not a pass.
        passed = false;
      }
      if (!passed) failures.push({ axiomId: axiom.id, severity: axiom.severity });
    }
    const hardFail = failures.some(f => f.severity === 'hard');
    return { ok: !hardFail, failures };
  }

  /**
   * emit(cause) — synchronous when every drawbridge.transform() on the
   * path is synchronous (byte-identical to the pre-2026-07-06 behavior:
   * void return, throws propagate synchronously). Returns a Promise only
   * when a transform on the path actually returned one — an async
   * drawbridge's caller can `await flow.emit(cause)` to know when it's
   * really done; a sync caller that never awaits anything sees no
   * behavior change at all, because until an async drawbridge exists on
   * the path, nothing here ever returns a thenable.
   */
  emit(cause) {
    this.causeCount++;
    for (const handler of this._observers.get(cause.type) || []) {
      try { handler(cause); } catch (_) { /* an observer's error never breaks the flow */ }
    }
    const drawbridge = this.drawbridges.get(cause.type);

    if (!drawbridge) {
      if (this.log) {
        this.log.record({
          flowId: this.flowId, parentFlowId: this.parentFlowId,
          causeType: cause.type, drawbridgeClaimed: null, axiomResult: null,
        });
      }
      this.pending.push(cause);
      return;
    }

    const axiomResult = this._checkAxioms(cause, drawbridge);

    if (this.log) {
      this.log.record({
        flowId: this.flowId, parentFlowId: this.parentFlowId,
        causeType: cause.type, drawbridgeClaimed: drawbridge.signature,
        axiomResult,
      });
    }

    if (!axiomResult.ok) {
      this.rejected.push({ cause, drawbridge: drawbridge.signature, failures: axiomResult.failures });
      return;
    }

    const produced = drawbridge.transform(cause);

    // Thenable check, not `produced instanceof Promise` — a caller could
    // hand back any promise-shaped object (e.g. from a different realm/
    // library), duck-typing is the correct check here, same reasoning
    // Node's own util.types.isPromise-adjacent code uses.
    if (produced && typeof produced.then === 'function') {
      return produced.then(resolved => this._emitProduced(resolved));
    }
    return this._emitProduced(produced);
  }

  /**
   * _emitProduced — normalize void/single-Cause/Cause[] into an array
   * and recurse. Split out from emit() so both the sync and async
   * branches above share one implementation instead of two copies that
   * could drift. Recursion itself follows the same sync-unless-thenable
   * rule: if any downstream emit() call in the chain returns a Promise
   * (because something further down the graph is async), this correctly
   * awaits it before continuing — Promise.all over the recursive calls,
   * so sibling causes at the same depth still process depth-first
   * per-branch, same ordering guarantee as the fully-synchronous version.
   */
  _emitProduced(produced) {
    const causes = produced == null ? [] : (Array.isArray(produced) ? produced : [produced]);
    const results = causes.map(next => this.emit(next));
    if (results.some(r => r && typeof r.then === 'function')) {
      return Promise.all(results);
    }
    // Every recursive call was synchronous — return nothing, exactly
    // like the original void contract.
  }

  sampleHere() {
    return {
      pending: [...this.pending],
      rejected: [...this.rejected],
      causeCount: this.causeCount,
      drawbridgeCount: this.drawbridges.size,
      axiomCount: this.axioms.length,
    };
  }
}

module.exports = { Flow };
