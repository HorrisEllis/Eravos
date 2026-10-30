/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  GapHunter — SISO Bus + Ledger Integration  ·  gap-bus.js  ·  v2.0.0  ║
 * ║  UUID: gh-bus-0000-0000-0000-000000000003                              ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * Wires GapHunter to the SISO event bus and the Ledger.
 *
 * Architecture:
 *   gap detected → SISO Stream event → GapLedgerGate → Ledger.record(idea)
 *   gap resolved → Ledger.promote(id) → upgrade entry
 *   longitudinal  → session closes → pattern analysis → summary event
 *
 * Event signatures:
 *   gap.detect        — new gap detected (→ Ledger Idea)
 *   gap.resolve       — gap resolved with proof (→ Ledger Upgrade)
 *   gap.close         — gap closed without resolution (rejected/abandoned)
 *   gap.session.end   — session summary with longitudinal patterns
 *   gap.query         — query open gaps by domain/type/criticality
 *   gap.query.result  — response to gap.query
 *
 * §5.1  UUID + hook on every registered component.
 * §5.2  Everything implements the bridge (SISO bus).
 * §5.7  Zero direct module calls — all I/O via stream events.
 * §8.1  Session context before build.
 * §8.3  SISO is a load-order prerequisite.
 */

'use strict';

import { Stream }    from '../lib/siso-stream.js';
import { Event }     from '../lib/siso-event.js';
import { Gate }      from '../lib/siso-gate.js';
import { StreamLog } from '../lib/siso-streamlog.js';
import { createLedger, IDEA_STATUS, UPGRADE_TYPE } from '../lib/ledger.js';

// ─── Utilities ────────────────────────────────────────────────────────────────

function uuid4() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : r & 0x3 | 0x8).toString(16);
  });
}

// ─── Gate: Gap → Ledger Idea ─────────────────────────────────────────────────

class GapDetectGate extends Gate {
  constructor(ledger, sessionStore) {
    super('gap.detect');
    this._ledger  = ledger;
    this._session = sessionStore;
  }

  transform(event, stream) {
    const p = event.data ?? {};
    if (!p.domain || !p.type) {
      stream.emit(new Event('gap.error', {
        code: 'INVALID_GAP_EVENT',
        message: 'gap.detect requires domain and type',
        received: p,
      }));
      return;
    }

    // Record in Ledger as an Idea — open, unresolved
    const idea = this._ledger.idea.record({
      description: p.description ?? p.subtype ?? 'Gap detected',
      hypothesis:  p.signal_note ?? 'Gap detected — hold open until something real closes it',
      domain:      p.domain,
      tags:        [p.type, p.subtype, p.domain].filter(Boolean),
      meta: {
        gap_type:    p.type,
        gap_subtype: p.subtype,
        gap_id:      p.id ?? uuid4(),
        score:       p.score,
        confidence:  p.confidence,
        domain:      p.domain,
        detector:    p.detector ?? 'text',
        evidence:    p.evidence ?? [],
        text_excerpt:p.text_excerpt ?? '',
        axes:        p.axes ?? [],
        source_session: this._session.id,
      },
    });

    // Track in session
    this._session.gaps.push({
      ledgerId: idea.id,
      gapId:    p.id ?? idea.id,
      domain:   p.domain,
      type:     p.type,
      subtype:  p.subtype,
      score:    p.score,
      ts:       Date.now(),
      resolved: false,
    });

    stream.emit(new Event('gap.recorded', {
      ledgerId: idea.id,
      idea,
      original: p,
    }));
  }
}

// ─── Gate: Gap Resolve → Ledger Upgrade ──────────────────────────────────────

class GapResolveGate extends Gate {
  constructor(ledger, sessionStore) {
    super('gap.resolve');
    this._ledger  = ledger;
    this._session = sessionStore;
  }

  transform(event, stream) {
    const p = event.data ?? {};
    if (!p.ledger_id) {
      stream.emit(new Event('gap.error', {
        code: 'MISSING_LEDGER_ID',
        message: 'gap.resolve requires ledger_id',
      }));
      return;
    }
    if (!p.proof) {
      stream.emit(new Event('gap.error', {
        code: 'MISSING_PROOF',
        message: 'gap.resolve requires proof (§1.3 — no stubs in production)',
      }));
      return;
    }

    try {
      const { idea, upgrade } = this._ledger.promote(p.ledger_id, {
        type:        UPGRADE_TYPE.BUG_FIX,
        description: p.resolution ?? 'Gap resolved',
        proof:       p.proof,
        version:     p.version ?? null,
        domain:      p.domain ?? null,
        tags:        ['gap_resolved', p.gap_type ?? 'unknown'].filter(Boolean),
        meta: {
          gap_id:         p.gap_id,
          resolution_note:p.resolution,
          resolution_type:p.resolution_type ?? 'direct',
        },
      });

      // Mark resolved in session
      const sessionGap = this._session.gaps.find(g => g.ledgerId === p.ledger_id);
      if (sessionGap) sessionGap.resolved = true;

      stream.emit(new Event('gap.promoted', { idea, upgrade }));
    } catch (err) {
      stream.emit(new Event('gap.error', {
        code:    'PROMOTION_FAILED',
        message: err.message,
        ledger_id: p.ledger_id,
      }));
    }
  }
}

// ─── Gate: Gap Close (rejected/abandoned) ────────────────────────────────────

class GapCloseGate extends Gate {
  constructor(ledger, sessionStore) {
    super('gap.close');
    this._ledger  = ledger;
    this._session = sessionStore;
  }

  transform(event, stream) {
    const p = event.data ?? {};
    if (!p.ledger_id) {
      stream.emit(new Event('gap.error', { code: 'MISSING_LEDGER_ID' }));
      return;
    }

    const status = p.status === 'abandoned' ? IDEA_STATUS.ABANDONED : IDEA_STATUS.REJECTED;
    const closed = this._ledger.idea.close(p.ledger_id, status, p.reason ?? 'Closed without note');

    const sessionGap = this._session.gaps.find(g => g.ledgerId === p.ledger_id);
    if (sessionGap) { sessionGap.resolved = true; sessionGap.closed_status = status; }

    stream.emit(new Event('gap.closed', { idea: closed, status, reason: p.reason }));
  }
}

// ─── Gate: Query Open Gaps ───────────────────────────────────────────────────

class GapQueryGate extends Gate {
  constructor(ledger, sessionStore) {
    super('gap.query');
    this._ledger  = ledger;
    this._session = sessionStore;
  }

  transform(event, stream) {
    const p = event.data ?? {};

    let gaps = this._session.gaps.filter(g => !g.resolved);

    if (p.domain)          gaps = gaps.filter(g => g.domain   === p.domain);
    if (p.type)            gaps = gaps.filter(g => g.type     === p.type);
    if (p.min_score != null) gaps = gaps.filter(g => (g.score ?? 0) >= p.min_score);

    // Sort by score descending
    gaps = gaps.slice().sort((a,b) => (b.score??0) - (a.score??0));

    stream.emit(new Event('gap.query.result', {
      query:   p,
      results: gaps,
      count:   gaps.length,
      session: this._session.id,
    }));
  }
}

// ─── Gate: Session End → Summary ─────────────────────────────────────────────

class GapSessionEndGate extends Gate {
  constructor(ledger, sessionStore) {
    super('gap.session.end');
    this._ledger  = ledger;
    this._session = sessionStore;
  }

  transform(event, stream) {
    const all      = this._session.gaps;
    const open     = all.filter(g => !g.resolved);
    const resolved = all.filter(g => g.resolved);

    // Domain frequency
    const byDomain = {};
    const byType   = {};
    for (const g of all) {
      byDomain[g.domain] = (byDomain[g.domain] ?? 0) + 1;
      byType[g.type]     = (byType[g.type]     ?? 0) + 1;
    }

    // Longitudinal pattern detection
    const patterns = this._detectLongitudinalPatterns(all);

    // Bottleneck — domain with most open unresolved high-score gaps
    const bottleneck = open
      .reduce((acc, g) => {
        const key = g.domain;
        if (!acc[key]) acc[key] = { domain: key, count: 0, totalScore: 0 };
        acc[key].count++;
        acc[key].totalScore += g.score ?? 0;
        return acc;
      }, {});

    const bottleneckDomain = Object.values(bottleneck)
      .sort((a,b) => b.totalScore - a.totalScore)[0]?.domain ?? null;

    // Ledger metrics
    const metrics = this._ledger.metrics();

    stream.emit(new Event('gap.session.summary', {
      session:          this._session.id,
      duration_ms:      Date.now() - this._session.startTs,
      total_gaps:       all.length,
      open_gaps:        open.length,
      resolved_gaps:    resolved.length,
      resolution_rate:  all.length ? Math.round(resolved.length / all.length * 100) : 0,
      by_domain:        byDomain,
      by_type:          byType,
      bottleneck_domain:bottleneckDomain,
      longitudinal:     patterns,
      ledger_metrics:   metrics,
      critical_open:    open
        .filter(g => (g.score ?? 0) >= 0.85)
        .sort((a,b) => (b.score??0) - (a.score??0))
        .slice(0, 5),
      note: 'Nothing is closed for comfort. Every open gap stays open until something real closes it.',
    }));
  }

  _detectLongitudinalPatterns(gaps) {
    const patterns = [];

    // Repeat domain — same domain appearing 3+ times
    const domainFreq = {};
    for (const g of gaps) domainFreq[g.domain] = (domainFreq[g.domain] ?? 0) + 1;
    const repeatDomains = Object.entries(domainFreq).filter(([,v]) => v >= 3);
    if (repeatDomains.length) {
      patterns.push({
        pattern: 'DOMAIN_CONCENTRATION',
        description: `Gaps concentrated in: ${repeatDomains.map(([d,n]) => `${d}(${n})`).join(', ')}`,
        criticality: 0.80,
      });
    }

    // Assumption density — if >40% of gaps are assumption type
    const assumptionCount = gaps.filter(g => g.type === 'assumption').length;
    if (gaps.length > 2 && assumptionCount / gaps.length > 0.40) {
      patterns.push({
        pattern: 'ASSUMPTION_DOMINANCE',
        description: `${Math.round(assumptionCount/gaps.length*100)}% of gaps are assumption type — the most load-bearing type`,
        criticality: 1.00,
      });
    }

    // Temporal clustering — gaps appearing in bursts
    if (gaps.length >= 5) {
      const times   = gaps.map(g => g.ts).sort((a,b)=>a-b);
      const windows = [];
      for (let i = 1; i < times.length; i++) windows.push(times[i] - times[i-1]);
      const avgGap  = windows.reduce((a,b)=>a+b,0) / windows.length;
      const burstWindows = windows.filter(w => w < avgGap * 0.3);
      if (burstWindows.length >= 2) {
        patterns.push({
          pattern: 'BURST_DETECTION',
          description: 'Gaps appearing in temporal clusters — may indicate systemic context rather than isolated events',
          criticality: 0.75,
        });
      }
    }

    // Normalisation risk — low-score gaps persisting (never quite triggering threshold)
    const persistentLow = gaps.filter(g => (g.score ?? 0) < 0.4 && !g.resolved);
    if (persistentLow.length >= 3) {
      patterns.push({
        pattern: 'NORMALISATION_RISK',
        description: `${persistentLow.length} low-score gaps persisting — normalisation hides accumulation`,
        criticality: 0.90,
      });
    }

    return patterns;
  }
}

// ─── GapHunterBus — primary session object ────────────────────────────────────

export class GapHunterBus {
  static UUID = 'gh-bus-0000-0000-0000-000000000003';

  constructor(opts = {}) {
    this._log     = new StreamLog(opts.logLevel ?? 'EVENTS');
    this._stream  = new Stream({ log: this._log });
    this._ledger  = createLedger({ project: opts.project ?? 'GapHunter' });

    this._session = {
      id:      uuid4(),
      startTs: Date.now(),
      project: opts.project ?? 'GapHunter',
      gaps:    [],
    };

    // Register all gates
    this._stream.register(new GapDetectGate(this._ledger, this._session));
    this._stream.register(new GapResolveGate(this._ledger, this._session));
    this._stream.register(new GapCloseGate(this._ledger, this._session));
    this._stream.register(new GapQueryGate(this._ledger, this._session));
    this._stream.register(new GapSessionEndGate(this._ledger, this._session));

    // External observer hooks
    this._observers = new Map();
  }

  // ── Emit helpers ─────────────────────────────────────────────────────────

  detect(gap) {
    this._stream.emit(new Event('gap.detect', gap));
    return this._popResult('gap.recorded');
  }

  resolve(ledgerId, proof, opts = {}) {
    this._stream.emit(new Event('gap.resolve', {
      ledger_id:       ledgerId,
      proof,
      resolution:      opts.resolution,
      resolution_type: opts.resolutionType ?? 'direct',
      version:         opts.version,
      gap_type:        opts.gapType,
      domain:          opts.domain,
    }));
    return this._popResult('gap.promoted');
  }

  close(ledgerId, status = 'rejected', reason = '') {
    this._stream.emit(new Event('gap.close', { ledger_id: ledgerId, status, reason }));
    return this._popResult('gap.closed');
  }

  query(filters = {}) {
    this._stream.emit(new Event('gap.query', filters));
    return this._popResult('gap.query.result');
  }

  endSession() {
    this._stream.emit(new Event('gap.session.end', {}));
    return this._popResult('gap.session.summary');
  }

  // ── Observer API ─────────────────────────────────────────────────────────

  on(eventType, fn) {
    if (!this._observers.has(eventType)) this._observers.set(eventType, new Set());
    this._observers.get(eventType).add(fn);
    return () => this._observers.get(eventType)?.delete(fn);
  }

  // ── Internal ─────────────────────────────────────────────────────────────

  _popResult(expectedType) {
    const sample  = this._stream.sampleHere();
    const pending = sample.pending.filter(e => e.type === expectedType || e.type === 'gap.error');
    // Clear matched pending by replacing stream pending
    for (const p of pending) {
      const idx = this._stream.pending.indexOf(p);
      if (idx !== -1) this._stream.pending.splice(idx, 1);
    }

    // Fire observers
    for (const p of pending) {
      const fns = this._observers.get(p.type);
      if (fns) for (const fn of fns) { try { fn(p.data); } catch {} }
    }

    const result = pending.find(e => e.type === expectedType);
    const error  = pending.find(e => e.type === 'gap.error');

    if (error && !result) throw new Error(`[GapHunterBus] ${error.data?.code}: ${error.data?.message}`);
    return result?.data ?? null;
  }

  get sessionId()     { return this._session.id; }
  get sessionGaps()   { return [...this._session.gaps]; }
  get ledger()        { return this._ledger; }
  get log()           { return this._log.sample(); }
  get openGaps()      { return this._session.gaps.filter(g => !g.resolved); }
  get resolvedGaps()  { return this._session.gaps.filter(g => g.resolved); }
}

export { IDEA_STATUS, UPGRADE_TYPE };
