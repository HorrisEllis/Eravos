'use strict';
/**
 * Component — a formal wrapper for a WARP-based unit. Requires explicit
 * Hooks for every operation it exposes -- the whole point is that no
 * caller ever needs to know a Flow or a Drawbridge is underneath.
 *
 * Also tracks real Consumer usage per hook, which is what makes
 * Consumer more than documentation: every call records who called it,
 * queryable later (matching FlowLog's own traceability discipline --
 * §2.3, all state observable, applied one level up).
 */
class Component {
  constructor(name) {
    if (!name || typeof name !== 'string') {
      throw new Error('[wire/Component] name must be a non-empty string');
    }
    this.name = name;
    this._hooks = new Map();
    this._usage = []; // { hookName, consumer, ts } -- real call history, not just a count
  }

  /** defineHook(hook) — hook must be a real wire/Hook instance. */
  defineHook(hook) {
    if (!hook || typeof hook.call !== 'function' || !hook.name) {
      throw new Error(`[wire/Component:${this.name}] defineHook requires a real Hook instance`);
    }
    if (this._hooks.has(hook.name)) {
      throw new Error(`[wire/Component:${this.name}] hook '${hook.name}' is already defined`);
    }
    this._hooks.set(hook.name, hook);
  }

  hookNames() {
    return [...this._hooks.keys()];
  }

  hasHook(name) {
    return this._hooks.has(name);
  }

  /**
   * call(hookName, input, { consumer }) — the ONE way anything outside
   * this component reaches in. consumer is optional but should be the
   * calling Consumer's name for real traceability.
   */
  async call(hookName, input, { consumer = 'unknown' } = {}) {
    const hook = this._hooks.get(hookName);
    if (!hook) {
      throw new Error(`[wire/Component:${this.name}] no such hook: '${hookName}'. Defined hooks: ${this.hookNames().join(', ') || '(none)'}`);
    }
    this._usage.push({ hookName, consumer, ts: Date.now() });
    return hook.call(input);
  }

  /** usage(hookName?) — real call history, optionally filtered to one hook. */
  usage(hookName) {
    return hookName ? this._usage.filter(u => u.hookName === hookName) : [...this._usage];
  }

  /** consumers(hookName?) — distinct real consumer names that have called a hook (or any hook). */
  consumers(hookName) {
    return [...new Set(this.usage(hookName).map(u => u.consumer))];
  }
}

module.exports = { Component };
