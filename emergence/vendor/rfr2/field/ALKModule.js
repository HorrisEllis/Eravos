export class ALKModule {
  constructor({ kernel, uuid, version = '0.0.0', ns }) {
    if (!kernel) throw new Error('[ALKModule] kernel is required');
    if (!uuid)   throw new Error('[ALKModule] uuid is required');
    if (!ns)     throw new Error('[ALKModule] ns (namespace) is required');

    this._kernel  = kernel;
    this._uuid    = uuid;
    this._version = version;
    this._ns      = ns;

    this._unsubs  = [];
    this._metrics = { emitted: 0, received: 0, errors: 0, lastTs: null };
  }

  // ── Protected helpers ─────────────────────────────────────────────────────

  _emit(type, payload, meta = {}) {
    this._metrics.emitted++;
    this._metrics.lastTs = Date.now();
    return this._kernel.emit(type, payload, {
      ...meta,
      sourceUUID: this._uuid,
    });
  }

  _emitError(code, message, context = {}) {
    this._metrics.errors++;
    return this._emit(`${this._ns}.error`, {
      code, message, context,
      moduleUUID: this._uuid,
    });
  }

  _sub(pattern, handler) {
    const unsub = this._kernel.subscribe(pattern, (ev) => {
      this._metrics.received++;
      handler(ev);
    }, { moduleUUID: this._uuid });
    this._unsubs.push(unsub);
    return unsub;
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  destroy() {
    for (const u of this._unsubs) u();
    this._unsubs = [];
  }

  // ── Observability ─────────────────────────────────────────────────────────

  health() {
    return {
      uuid:     this._uuid,
      version:  this._version,
      ns:       this._ns,
      metrics:  { ...this._metrics },
      subs:     this._unsubs.length,
    };
  }
}
