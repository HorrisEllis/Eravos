/**
 * @module       ledger
 * @uuid         a9b0c1d2-e3f4-4a5b-6c7d-8e9f0a1b2c3d
 * @version      1.0.0
 * @author       James Brooks
 *
 * Dual Ledger — Upgrade (truth) + Idea (cognition).
 *
 * Zero external dependencies. Works in any project: Node, browser, Electron,
 * Deno, whatever runtime you're running. Drop it in and call the API.
 *
 * Two ledgers, structurally separate:
 *
 *   UpgradeLedger — authoritative. Verified state changes: passing tests,
 *                   proven diffs, measurable results. Append-only after commit.
 *                   This is the truth. Replay from it and you reconstruct
 *                   everything (§7.6).
 *
 *   IdeaLedger    — speculative. Hypotheses, proposals, observations.
 *                   Allowed to be wrong. Mutable. Never affects runtime.
 *                   Ideas become upgrades only through an explicit validation
 *                   gate — the gate throws if you try to skip it (§7.3).
 *
 * Invariants enforced:
 *   L-1  Observational and authoritative events never mixed in the same ledger.
 *   L-2  Mixing ledger types (idea into upgrade, upgrade into idea) is a hard throw.
 *   L-3  Idea entries have no enforcement surface. Cannot affect runtime state.
 *   L-4  Cognition gate — an idea becomes an upgrade only via explicit validation.
 *
 * Observer API (optional — zero coupling):
 *   ledger.on(event, fn)   — subscribe to ledger events
 *   ledger.off(event, fn)  — unsubscribe
 *
 *   Events:
 *     'idea:recorded'    { idea }
 *     'idea:closed'      { idea, status, failureMode }
 *     'idea:promoted'    { idea, upgrade }
 *     'upgrade:committed'{ upgrade }
 *     'bottleneck'       { metrics }  — fires when pending > BOTTLENECK_THRESHOLD
 *
 *   Each project wires these to whatever bus it uses. The ledger doesn't care.
 *   NEXUS wires to kernel event bus. SENTINEL wires to its own SSE stream.
 *   ALK wires to BroadcastChannel. All valid.
 *
 * API:
 *   createLedger(opts?)          — create a paired { idea, upgrade } ledger set
 *   createUpgradeLedger(opts?)   — standalone upgrade ledger
 *   createIdeaLedger(opts?)      — standalone idea ledger
 *   promoteIdea(il, ul, id, entry) — gate: idea → upgrade
 *   validateSeparation(il, ul)   — assert L-1/L-2 integrity
 *
 * @hook a9b0c1d2-e3f4-4a5b-6c7d-8e9f0a1b2c3d  createLedger
 * @hook b0c1d2e3-f4a5-4b6c-7d8e-9f0a1b2c3d4e  createUpgradeLedger
 * @hook c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f  createIdeaLedger
 * @hook d2e3f4a5-b6c7-4d8e-9f0a-1b2c3d4e5f6a  promoteIdea
 * @hook e3f4a5b6-c7d8-4e9f-0a1b-2c3d4e5f6a7b  validateSeparation
 * @hook f4a5b6c7-d8e9-4f0a-1b2c-3d4e5f6a7b8c  LedgerError
 */

'use strict';

// ── Constants ─────────────────────────────────────────────────────────────────

export const VERSION = '1.0.0';

export const IDEA_STATUS = Object.freeze({
  UNRESOLVED: 'unresolved', // active — being worked
  PROMOTED:   'promoted',   // passed gate → became upgrade
  REJECTED:   'rejected',   // validated and failed — failure mode documented
  ABANDONED:  'abandoned',  // set aside without validation
});

export const UPGRADE_TYPE = Object.freeze({
  PASSING_TEST:      'passing_test',      // test result with proof
  PROVEN_DIFF:       'proven_diff',       // diff with measurable before/after
  MEASURABLE_RESULT: 'measurable_result', // metric change with evidence
  CONFIG_CHANGE:     'config_change',     // fluid value update
  MODULE_ADDITION:   'module_addition',   // new module added
  BUG_FIX:          'bug_fix',           // root cause addressed structurally
  PHASE_COMPLETE:   'phase_complete',    // phase exit criteria met, version bumped
  FEATURE:          'feature',           // new capability added and proven
  REFACTOR:         'refactor',          // structural improvement with tests
  SECURITY_FIX:     'security_fix',      // vulnerability closed with proof
});

const BOTTLENECK_THRESHOLD = 5; // unresolved ideas — §7.7

// ── LedgerError ───────────────────────────────────────────────────────────────

/**
 * Thrown on any invariant violation. Hard stop — never caught silently (§1.2).
 *
 * @hook f4a5b6c7-d8e9-4f0a-1b2c-3d4e5f6a7b8c  LedgerError
 */
export class LedgerError extends Error {
  constructor(invariantId, message, context = {}) {
    super(`[ledger] ${invariantId}: ${message}`);
    this.name        = 'LedgerError';
    this.invariantId = invariantId;
    this.context     = context;
    this.ts          = Date.now();
    this.uuid        = _uuid4();
  }
}

// ── Internal event emitter (zero deps) ───────────────────────────────────────

function _createEmitter() {
  const _listeners = new Map();

  return {
    on(event, fn) {
      if (!_listeners.has(event)) _listeners.set(event, new Set());
      _listeners.get(event).add(fn);
      return () => _listeners.get(event)?.delete(fn); // returns unsub fn
    },
    off(event, fn) {
      _listeners.get(event)?.delete(fn);
    },
    emit(event, data) {
      const fns = _listeners.get(event);
      if (!fns) return;
      for (const fn of fns) {
        try { fn(data); }
        catch (e) {
          // Handler errors never halt emission (§1.2 — silent failure forbidden
          // but we surface it without crashing)
          console.error(`[ledger] observer error on '${event}':`, e.message);
        }
      }
    },
  };
}

// ── createUpgradeLedger ───────────────────────────────────────────────────────

/**
 * Create an Upgrade Ledger.
 * Records are append-only after commit. Immutable once frozen.
 *
 * @hook b0c1d2e3-f4a5-4b6c-7d8e-9f0a1b2c3d4e  createUpgradeLedger
 */
export function createUpgradeLedger(opts = {}) {
  const _entries  = [];
  const _emitter  = _createEmitter();
  const _id       = opts.id || _uuid4();
  const _name     = opts.name || 'upgrade-ledger';
  const _project  = opts.project || null;

  function _commit(entry) {
    _assertNotIdea(entry, 'commit');
    _assertHasProof(entry);

    const id = _uuid4();
    const record = Object.freeze({
      id,
      ledgerType:  'upgrade',
      entryType:   entry.type       || UPGRADE_TYPE.PASSING_TEST,
      description: entry.description,
      proof:       Object.freeze({ ...entry.proof }),
      version:     entry.version    || null,
      phaseId:     entry.phaseId    || null,
      ideaId:      entry.ideaId     || null,
      domain:      entry.domain     || null,
      project:     entry.project    || _project,
      tags:        Object.freeze([...(entry.tags || [])]),
      meta:        Object.freeze({ ...(entry.meta || {}) }),
      ts:          Date.now(),
    });

    _entries.push(record);
    _emitter.emit('upgrade:committed', { upgrade: record });
    return record;
  }

  return {
    type:      'upgrade',
    id:        _id,
    name:      _name,
    project:   _project,
    createdTs: Date.now(),

    // ── Write ────────────────────────────────────────────────────────────────

    commit: _commit,

    // ── Read ─────────────────────────────────────────────────────────────────

    /** Replay all entries in commit order. §7.6 — log is the truth. */
    replay() {
      return _entries.map(e => ({ ...e }));
    },

    get length() { return _entries.length; },

    findById(id) {
      return _entries.find(e => e.id === id) || null;
    },

    findByTag(tag) {
      return _entries.filter(e => e.tags.includes(tag));
    },

    findByType(type) {
      return _entries.filter(e => e.entryType === type);
    },

    findByDomain(domain) {
      return _entries.filter(e => e.domain === domain);
    },

    findByProject(project) {
      return _entries.filter(e => e.project === project);
    },

    /** Latest N entries. */
    tail(n = 10) {
      return _entries.slice(-n).map(e => ({ ...e }));
    },

    /** All entries since a timestamp. */
    since(ts) {
      return _entries.filter(e => e.ts >= ts).map(e => ({ ...e }));
    },

    // ── Health ───────────────────────────────────────────────────────────────

    /** Version history — all PHASE_COMPLETE entries in order. */
    versionHistory() {
      return this.findByType(UPGRADE_TYPE.PHASE_COMPLETE)
        .map(e => ({ version: e.version, ts: e.ts, description: e.description }));
    },

    /** Assert no idea entries leaked in (L-1). */
    assertSeparation() {
      const mixed = _entries.filter(e => e.ledgerType !== 'upgrade');
      if (mixed.length > 0) {
        throw new LedgerError(
          'L-1',
          `UpgradeLedger contains ${mixed.length} non-upgrade entries`,
          { ids: mixed.map(e => e.id) }
        );
      }
    },

    // ── Observer API ─────────────────────────────────────────────────────────

    on:  _emitter.on.bind(_emitter),
    off: _emitter.off.bind(_emitter),

    // ── Internal (used by promoteIdea) ────────────────────────────────────────
    _commit,
  };
}

// ── createIdeaLedger ──────────────────────────────────────────────────────────

/**
 * Create an Idea Ledger.
 * Entries are speculative — mutable, allowed to be wrong, never affect runtime.
 *
 * @hook c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f  createIdeaLedger
 */
export function createIdeaLedger(opts = {}) {
  const _ideas   = new Map();
  const _emitter = _createEmitter();
  const _id      = opts.id || _uuid4();
  const _name    = opts.name || 'idea-ledger';
  const _project = opts.project || null;

  function _checkBottleneck(emit) {
    const pending = [..._ideas.values()].filter(i => i.status === IDEA_STATUS.UNRESOLVED).length;
    if (pending > BOTTLENECK_THRESHOLD) {
      emit('bottleneck', { metrics: _flowMetrics(), threshold: BOTTLENECK_THRESHOLD, pending });
    }
  }

  function _flowMetrics() {
    const all      = [..._ideas.values()];
    const total    = all.length;
    const promoted = all.filter(i => i.status === IDEA_STATUS.PROMOTED).length;
    const rejected = all.filter(i => i.status === IDEA_STATUS.REJECTED).length;
    const abandoned= all.filter(i => i.status === IDEA_STATUS.ABANDONED).length;
    const pending  = all.filter(i => i.status === IDEA_STATUS.UNRESOLVED).length;
    return {
      total,
      promoted,
      rejected,
      abandoned,
      pending,
      conversionRate:   total > 0 ? _r4(promoted / total) : 0,
      bottleneckSignal: pending > BOTTLENECK_THRESHOLD,
    };
  }

  return {
    type:      'idea',
    id:        _id,
    name:      _name,
    project:   _project,
    createdTs: Date.now(),

    // ── Write ────────────────────────────────────────────────────────────────

    /**
     * Record a new hypothesis, proposal, or observation.
     * Required: description
     */
    record(entry) {
      _assertNoRuntimeEffect(entry);

      const id = _uuid4();
      const idea = {
        id,
        ledgerType:  'idea',
        description: entry.description,
        hypothesis:  entry.hypothesis  || null,
        domain:      entry.domain      || null,
        project:     entry.project     || _project,
        parentId:    entry.parentId    || null,
        tags:        [...(entry.tags   || [])],
        meta:        { ...(entry.meta  || {}) },
        status:      IDEA_STATUS.UNRESOLVED,
        failureMode: null,
        createdTs:   Date.now(),
        updatedTs:   Date.now(),
      };

      _ideas.set(id, idea);
      _emitter.emit('idea:recorded', { idea });
      _checkBottleneck(_emitter.emit.bind(_emitter));
      return idea;
    },

    /**
     * Close an idea at REJECTED or ABANDONED (§7.5).
     * PROMOTED goes through promoteIdea() — not here.
     */
    close(id, status, failureMode = null) {
      if (status === IDEA_STATUS.PROMOTED) {
        throw new LedgerError(
          'L-4',
          'Use promoteIdea() to promote — closing directly as PROMOTED skips the gate',
          { id }
        );
      }
      if (!Object.values(IDEA_STATUS).includes(status)) {
        throw new LedgerError('L-4', `Unknown status: '${status}'`, { id, status });
      }

      const idea = _ideas.get(id);
      if (!idea) throw new LedgerError('L-4', `Idea '${id}' not found`, { id });
      if (idea.status !== IDEA_STATUS.UNRESOLVED) {
        throw new LedgerError(
          'L-4',
          `Idea '${id}' is already ${idea.status} — cannot close a closed idea`,
          { id, status: idea.status }
        );
      }

      idea.status      = status;
      idea.failureMode = failureMode;
      idea.updatedTs   = Date.now();

      _emitter.emit('idea:closed', { idea, status, failureMode });
      return idea;
    },

    // ── Read ─────────────────────────────────────────────────────────────────

    get length() { return _ideas.size; },

    get unresolved() {
      return [..._ideas.values()].filter(i => i.status === IDEA_STATUS.UNRESOLVED);
    },

    findById(id) {
      return _ideas.get(id) || null;
    },

    findByStatus(status) {
      return [..._ideas.values()].filter(i => i.status === status);
    },

    findByDomain(domain) {
      return [..._ideas.values()].filter(i => i.domain === domain);
    },

    findByTag(tag) {
      return [..._ideas.values()].filter(i => i.tags.includes(tag));
    },

    findByProject(project) {
      return [..._ideas.values()].filter(i => i.project === project);
    },

    // ── Metrics ──────────────────────────────────────────────────────────────

    /** §7.7 — sigma flow metrics. Idea-to-upgrade conversion rate + bottleneck signal. */
    flowMetrics: _flowMetrics,

    // ── Observer API ─────────────────────────────────────────────────────────

    on:  _emitter.on.bind(_emitter),
    off: _emitter.off.bind(_emitter),

    // ── Internal ─────────────────────────────────────────────────────────────

    _emitter,
    _ideas,
  };
}

// ── createLedger ──────────────────────────────────────────────────────────────

/**
 * Create a paired { idea, upgrade } ledger set with shared observer routing.
 * This is the primary entry point for most projects.
 *
 * Events from both ledgers are forwarded to the pair's observer bus,
 * so one `.on()` call sees everything.
 *
 * @hook a9b0c1d2-e3f4-4a5b-6c7d-8e9f0a1b2c3d  createLedger
 */
export function createLedger(opts = {}) {
  const project = opts.project || opts.name || null;

  const idea    = createIdeaLedger({ ...opts, project });
  const upgrade = createUpgradeLedger({ ...opts, project });
  const _emitter = _createEmitter();

  // Forward all sub-ledger events to the pair emitter
  const EVENTS = ['idea:recorded', 'idea:closed', 'idea:promoted', 'upgrade:committed', 'bottleneck'];
  for (const ev of EVENTS) {
    idea.on(ev, data => _emitter.emit(ev, data));
    upgrade.on(ev, data => _emitter.emit(ev, data));
  }

  return {
    idea,
    upgrade,
    project,
    version: VERSION,

    // ── Convenience API (delegates to sub-ledgers) ────────────────────────────

    /** Record a new idea. */
    record: (entry) => idea.record(entry),

    /** Close an idea (REJECTED or ABANDONED). */
    close: (id, status, failureMode) => idea.close(id, status, failureMode),

    /**
     * Promote an idea to an upgrade — the gate.
     * Requires proof. Throws if skipped.
     */
    promote: (ideaId, entry) => promoteIdea(idea, upgrade, ideaId, entry),

    /** Commit a direct upgrade (no idea origin). */
    commit: (entry) => upgrade.commit(entry),

    /** Replay the upgrade ledger — full truth history. */
    replay: () => upgrade.replay(),

    /** Flow metrics across both ledgers. */
    metrics: () => idea.flowMetrics(),

    // ── Observer API ─────────────────────────────────────────────────────────

    on:  _emitter.on.bind(_emitter),
    off: _emitter.off.bind(_emitter),
  };
}

// ── promoteIdea ───────────────────────────────────────────────────────────────

/**
 * The cognition gate (§7.3, L-4).
 * Promotes an idea from IdeaLedger to UpgradeLedger.
 * This is the ONLY valid path. Proof is mandatory.
 *
 * On success: idea marked PROMOTED, upgrade committed, both returned.
 * If upgrade commit fails: idea stays UNRESOLVED.
 *
 * @hook d2e3f4a5-b6c7-4d8e-9f0a-1b2c3d4e5f6a  promoteIdea
 */
export function promoteIdea(ideaLedger, upgradeLedger, ideaId, entry) {
  // L-2: type check
  if (!ideaLedger || ideaLedger.type !== 'idea') {
    throw new LedgerError('L-2', 'First argument must be an IdeaLedger', { ideaId });
  }
  if (!upgradeLedger || upgradeLedger.type !== 'upgrade') {
    throw new LedgerError('L-2', 'Second argument must be an UpgradeLedger', { ideaId });
  }

  // L-4: idea must exist and be unresolved
  const idea = ideaLedger.findById(ideaId);
  if (!idea) {
    throw new LedgerError('L-4', `Idea '${ideaId}' not found`, { ideaId });
  }
  if (idea.status !== IDEA_STATUS.UNRESOLVED) {
    throw new LedgerError(
      'L-4',
      `Idea '${ideaId}' is already '${idea.status}' — cannot promote a closed idea`,
      { ideaId, status: idea.status }
    );
  }

  // L-4: proof required
  _assertHasProof(entry);

  // Commit upgrade first — if this throws, idea stays UNRESOLVED (atomicity)
  const upgrade = upgradeLedger._commit({
    ...entry,
    ideaId,
  });

  // Mark idea promoted only after successful commit
  idea.status    = IDEA_STATUS.PROMOTED;
  idea.updatedTs = Date.now();

  // Emit from idea ledger's emitter so pair bus sees it
  ideaLedger._emitter?.emit('idea:promoted', { idea, upgrade });

  return { idea, upgrade };
}

// ── validateSeparation ────────────────────────────────────────────────────────

/**
 * Assert L-1/L-2 integrity on a ledger pair.
 *
 * @hook e3f4a5b6-c7d8-4e9f-0a1b-2c3d4e5f6a7b  validateSeparation
 */
export function validateSeparation(ideaLedger, upgradeLedger) {
  if (!ideaLedger || ideaLedger.type !== 'idea') {
    throw new LedgerError('L-2', 'Expected IdeaLedger as first argument');
  }
  if (!upgradeLedger || upgradeLedger.type !== 'upgrade') {
    throw new LedgerError('L-2', 'Expected UpgradeLedger as second argument');
  }
  if (ideaLedger.id === upgradeLedger.id) {
    throw new LedgerError('L-1', 'IdeaLedger and UpgradeLedger share the same ID — structural corruption');
  }
  upgradeLedger.assertSeparation();
  return true;
}

// ── Private helpers ───────────────────────────────────────────────────────────

function _uuid4() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

function _r4(v) {
  return Math.round((v ?? 0) * 10000) / 10000;
}

function _assertHasProof(entry) {
  if (!entry || !entry.proof) {
    throw new LedgerError(
      'L-4',
      'Upgrade entry requires a proof field',
      { entry: entry || null }
    );
  }
  const { testFile, diffLink, metric, screenshot, logFile } = entry.proof;
  if (!testFile && !diffLink && !metric && !screenshot && !logFile) {
    throw new LedgerError(
      'L-4',
      'proof must contain at least one of: testFile, diffLink, metric, screenshot, logFile',
      { proof: entry.proof }
    );
  }
}

function _assertNotIdea(entry, op) {
  if (entry && entry.ledgerType === 'idea') {
    throw new LedgerError(
      'L-1',
      `Cannot ${op} an idea entry into UpgradeLedger — use IdeaLedger.record() then promoteIdea()`,
      { ledgerType: entry.ledgerType }
    );
  }
}

function _assertNoRuntimeEffect(entry) {
  if (entry && entry.enforces === true) {
    throw new LedgerError(
      'L-3',
      'Idea entry cannot have enforces=true — ideas have no enforcement surface',
      { entry }
    );
  }
  if (entry && entry.affectsRuntime === true) {
    throw new LedgerError(
      'L-3',
      'Idea entry cannot declare affectsRuntime=true',
      { entry }
    );
  }
}
