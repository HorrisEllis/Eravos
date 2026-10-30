'use strict';
/**
 * Consumer — a real, named caller. Not just documentation: calling
 * through a Consumer auto-tags every hook call with its name, so
 * Component.usage()/consumers() reflect who actually called what,
 * without every call site having to remember to pass { consumer: '...' }
 * by hand (easy to forget, easy to get wrong -- this makes it
 * structural instead of a convention someone has to remember).
 */
class Consumer {
  constructor(name) {
    if (!name || typeof name !== 'string') {
      throw new Error('[wire/Consumer] name must be a non-empty string');
    }
    this.name = name;
  }

  /** call(component, hookName, input) — auto-tagged with this Consumer's name. */
  async call(component, hookName, input) {
    if (!component || typeof component.call !== 'function') {
      throw new Error(`[wire/Consumer:${this.name}] target must be a real Component instance`);
    }
    return component.call(hookName, input, { consumer: this.name });
  }
}

module.exports = { Consumer };
