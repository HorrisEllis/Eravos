'use strict';
/**
 * FlowLog — append-only audit trail. Observes, never consumes.
 * Axiom-check entries land here alongside dispatch steps, one shared log.
 * (Renamed from StreamLog, per the spine rename.)
 */
class FlowLog {
  constructor() {
    this._entries = [];
    this._nextId = 0;
  }

  nextFlowId() {
    return ++this._nextId;
  }

  record(entry) {
    this._entries.push({ ...entry, loggedAt: Date.now() });
  }

  entries() {
    return [...this._entries];
  }
}

module.exports = { FlowLog };
