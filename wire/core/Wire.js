'use strict';
/**
 * Wire — a formal, named object that connects two components. Replaces
 * what's currently inline, unnamed code inside emergence's loop.js
 * (e.g. "cfr-creator's output feeds associative-lattice's input" is
 * just a few lines buried in a big function, not its own testable
 * thing). A Wire is itself a Consumer of `from` and effectively a
 * Consumer of `to` — every carry() is real, traced usage on both ends.
 */
const { Consumer } = require('./Consumer.js');

class Wire {
  /**
   * @param {string} name
   * @param {object} opts
   * @param {object} opts.to - target Component
   * @param {string} opts.toHook - hook name on the target
   * @param {(sourceResult: any) => any} [opts.transform] - shapes the
   *   source result into the target hook's expected input. Defaults to
   *   identity — most wires need this, since a source hook's output
   *   shape rarely matches a target hook's input shape exactly.
   */
  constructor(name, { to, toHook, transform = (x) => x } = {}) {
    if (!name || typeof name !== 'string') {
      throw new Error('[wire/Wire] name must be a non-empty string');
    }
    if (!to || typeof to.call !== 'function') {
      throw new Error(`[wire/Wire:${name}] 'to' must be a real Component instance`);
    }
    if (!toHook || typeof toHook !== 'string') {
      throw new Error(`[wire/Wire:${name}] 'toHook' must be a non-empty string`);
    }
    this.name = name;
    this.to = to;
    this.toHook = toHook;
    this.transform = transform;
    this._consumer = new Consumer(`wire:${name}`); // every carry() is traced usage on the target, tagged with this wire's own name
    this._carryCount = 0;
  }

  /**
   * carry(sourceResult) — transform the source result and deliver it to
   * the target hook. Returns whatever the target hook returns.
   */
  async carry(sourceResult) {
    this._carryCount++;
    const transformed = this.transform(sourceResult);
    return this._consumer.call(this.to, this.toHook, transformed);
  }

  carryCount() {
    return this._carryCount;
  }
}

module.exports = { Wire };
