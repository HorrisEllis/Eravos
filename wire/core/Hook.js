'use strict';
/**
 * Hook — a formal, typed point of interaction. Built on WARP's real
 * Cause/Drawbridge/Flow (this package IS warp, decoupled -- not a
 * reimplementation, an extension).
 *
 * THE ACTUAL PROBLEM THIS FIXES: checked emergence's loop.js directly.
 * 5 of 8 components exposed no facade at all -- the orchestrator had to
 * call `flow.emit(cause)` itself, then reach into `flow.pending` (WARP's
 * own internal bookkeeping array, growing unboundedly, never meant to
 * be a component's public API) and manually `.reverse().find(...)` the
 * result out. The other 3 components (built later) had real facade
 * methods instead. Two conventions coexisting by accident of build
 * order, not by design.
 *
 * Hook.call() does the emit-and-extract dance ONCE, correctly, so no
 * component ever hand-rolls it again. It uses Flow's real `.on(type,
 * handler)` observer -- register before emit, capture, unsubscribe --
 * which was ALREADY the correct pattern (rfr2-observer used it
 * correctly for the Liminal signals) but wasn't used consistently. This
 * never touches `.pending` at all -- the result comes from the
 * observer, not a growing array.
 */
const { Cause } = require('../../warp/core/Cause.js');

class Hook {
  /**
   * @param {string} name
   * @param {object} opts
   * @param {object} opts.flow - a real warp Flow instance
   * @param {string} opts.causeType - the Cause type this hook emits
   * @param {string} opts.resultType - the Cause type produced in response
   * @param {(input: any) => any} [opts.buildCauseData] - input -> Cause.data, defaults to identity
   */
  constructor(name, { flow, causeType, resultType, buildCauseData = (x) => x }) {
    if (!name || typeof name !== 'string') {
      throw new Error('[wire/Hook] name must be a non-empty string');
    }
    if (!flow || typeof flow.emit !== 'function' || typeof flow.on !== 'function') {
      throw new Error(`[wire/Hook:${name}] flow must be a real WARP Flow instance`);
    }
    if (!causeType || !resultType) {
      throw new Error(`[wire/Hook:${name}] causeType and resultType are both required`);
    }
    this.name = name;
    this.flow = flow;
    this.causeType = causeType;
    this.resultType = resultType;
    this.buildCauseData = buildCauseData;
    this._callCount = 0;
  }

  /**
   * call(input) -> the real resultType Cause's data, captured via a
   * one-shot observer, never via .pending. Throws if the flow's own
   * axioms hard-reject the dispatch (checked via flow.rejected, same
   * real mechanism every component in emergence already used).
   */
  async call(input) {
    this._callCount++;

    let captured = null;
    const unsubscribe = this.flow.on(this.resultType, (cause) => { captured = cause; });

    const rejectedBefore = this.flow.rejected.length;
    const cause = new Cause(this.causeType, this.buildCauseData(input));
    await this.flow.emit(cause);
    unsubscribe();

    if (this.flow.rejected.length > rejectedBefore) {
      const rejection = this.flow.rejected[this.flow.rejected.length - 1];
      const hardFailures = rejection.failures.filter(f => f.severity === 'hard').map(f => f.axiomId);
      const err = new Error(`[wire/Hook:${this.name}] rejected by hard axiom(s): ${hardFailures.join(', ')}`);
      err.rejection = rejection;
      throw err;
    }

    if (captured === null) {
      throw new Error(`[wire/Hook:${this.name}] no drawbridge on this flow produced a '${this.resultType}' cause in response to '${this.causeType}' -- check the drawbridge is registered and its signature matches`);
    }

    return captured.data;
  }

  callCount() {
    return this._callCount;
  }
}

module.exports = { Hook };
