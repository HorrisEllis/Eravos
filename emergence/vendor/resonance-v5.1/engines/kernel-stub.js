/**
 * Minimal ALKModule stub — satisfies gap-hunter-core.js import
 * The detector classes (WeakAssumptionHunter etc) don't use ALKModule at all.
 * Only GapHunterModule does, and we use it standalone via gap-text.js.
 */
export class ALKModule {
  constructor({ kernel, uuid, version, ns } = {}) {
    this._kernel  = kernel  ?? null;
    this._uuid    = uuid    ?? 'stub';
    this._version = version ?? '0.0.0';
    this._ns      = ns      ?? 'alk';
    this._subs    = [];
  }
  _sub(event, fn)              { this._subs.push({ event, fn }); }
  _emit(event, payload, meta)  { /* no-op in standalone mode */ }
  _emitError(code, msg, ctx)   { console.error(`[ALKModule] ${code}: ${msg}`, ctx); }
  start()                      { /* override in subclass */ }
  health()                     { return { uuid: this._uuid, version: this._version, healthy: true }; }
}
