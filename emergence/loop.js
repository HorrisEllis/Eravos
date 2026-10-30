'use strict';
/**
 * loop.js — assembles the five components into the actual loop
 * emergence.spec declares:
 *
 *   rfr2-observer (Lens, observes)
 *     -> feedback-loop-buffer (Signal, holds the window)
 *       -> cfr-creator (Drawbridge, creates structure)
 *         -> associative-lattice   (Record)
 *         -> causal-graph          (Record)
 *         -> event-ledger          (Record, now durable via Jaa)
 *
 * Each arrow is a real WARP Flow.emit() call, not a metaphor. Record
 * layer runs all three in parallel — none of them feed back into the
 * loop themselves (§10.2: projections are derived, never written to
 * directly, and never re-observed as if they were new input).
 *
 * FEEDBACK, ACTUALLY WIRED NOW: feedback-loop-buffer isn't just storage
 * anymore. If tick() is called without an explicit target, the target
 * from the most recent tick is reused — the previous cycle's output
 * (what it was creating toward) becomes this cycle's input, per
 * Emerge's own `feedback = an_output_that_becomes_an_input`. Call
 * tick(text) repeatedly after one tick(text, target) call and the loop
 * keeps pursuing that target without the caller re-stating it every time.
 *
 * event-ledger is now durable across restarts (Jaa-backed FileStore +
 * FileRefs, hash-chained) — loop.history(n) walks the real persisted
 * chain, not just this session's in-memory causes.
 *
 * KNOWN GAP: observerStream.pending and creatorStream.pending (WARP's own
 * bookkeeping for causes with no matching drawbridge) grow unboundedly across
 * ticks — nothing here clears them. Fine for a session of the length this
 * was tested at; a long-running process would need a pruning strategy.
 * Not addressed here because the fix belongs at the WARP Flow level (a
 * generic concern, not specific to this loop) or needs a decision on
 * what's safe to discard — not something to silently trim without that
 * decision being made deliberately.
 * WARP lives at ../warp — a sibling of this project, the foundation
 * everything here is built ON, not a vendored copy inside it. (An
 * earlier pass had it nested as emergence/warp/, which only contained
 * core/ and silently dropped WARP's dispatch/, plugins/, and its own
 * test suite. Fixed — full package restored, correctly positioned.)
 */

const path = require('path');
const { Cause, Flow, FlowLog } = require('../warp');
const { buildObserverGate } = require('./components/rfr2-observer/index.js');
const { buildCreatorGate } = require('./components/cfr-creator/index.js');
const { buildLatticeGate } = require('./components/associative-lattice/index.js');
const { buildCausalGraphGate } = require('./components/causal-graph/index.js');
const { buildLedgerGate } = require('./components/event-ledger/index.js');
const { RingBuffer } = require('./components/feedback-loop-buffer/index.js');
const { buildIdeaStore } = require('./components/idea-store/index.js');
const { buildPatternEngine } = require('./components/pattern-engine/index.js');
const { buildPersonStore } = require('./components/person-store/index.js');
const { buildSpaceDistance } = require('./components/space-distance/index.js');

function createEmergenceLoop({ dataDir, feedbackCapacity = 20, snapshotInterval } = {}) {
  const root = dataDir || path.join(process.cwd(), 'data', 'emergence');

  // Real StreamLogs on every flow -- AXIOMS Sec2.3, all state observable
  // through the bus log. Previously only feedback-loop-buffer and
  // idea-store had one; the five core flows didn't, meaning the main
  // loop's own dispatch history (drawbridge claims, axiom results) was
  // invisible. Fixed -- see loop.logs() below.
  const observerLog = new FlowLog();
  const observerStream = new Flow({ log: observerLog });
  observerStream.register(buildObserverGate());

  const creatorLog = new FlowLog();
  const creatorStream = new Flow({ log: creatorLog });
  creatorStream.register(buildCreatorGate());

  const latticeGate = buildLatticeGate({ dataDir: path.join(root, 'lattice'), ...(snapshotInterval && { snapshotInterval }) });
  const latticeLog = new FlowLog();
  const latticeStream = new Flow({ log: latticeLog });
  latticeStream.register(latticeGate);

  const causalGate = buildCausalGraphGate({ dataDir: path.join(root, 'causal'), ...(snapshotInterval && { snapshotInterval }) });
  const causalLog = new FlowLog();
  const causalStream = new Flow({ log: causalLog });
  causalStream.register(causalGate);

  const ledgerGate = buildLedgerGate({ dataDir: path.join(root, 'ledger') });
  const ledgerLog = new FlowLog();
  const ledgerStream = new Flow({ log: ledgerLog });
  ledgerStream.register(ledgerGate);

  const feedback = new RingBuffer({
    capacity: feedbackCapacity,
    dataDir: path.join(root, 'feedback'),
  });

  const ideas = buildIdeaStore({ dataDir: path.join(root, 'ideas') });
  const patterns = buildPatternEngine({ dataDir: path.join(root, 'patterns') });
  const people = buildPersonStore({ dataDir: path.join(root, 'people') });
  const space = buildSpaceDistance({ dataDir: path.join(root, 'space-distance') });

  /**
   * tick(text, target?) -> runs one full pass through the loop.
   *
   * `target` is optional — { id, type: 'end-state'|'idea'|'person', mass? }.
   * If omitted, the last tick's target is reused (the actual feedback
   * mechanism — see header). Never inferred beyond that: this loop will
   * not invent a target you never gave it at all.
   */
  async function tick(text, target) {
    await observerStream.emit(new Cause('rfr2:observe', { text }));
    const observedEvent = [...observerStream.pending].reverse().find(e => e.type === 'rfr2:observed');
    // BUG FOUND AND FIXED: this used to be just observedEvent.data.summary,
    // silently discarding health and all 9 real Liminal gap signals that
    // rfr2-observer's Drawbridge actually computes every tick. Caught by
    // schemas/test/schemas.test.js checking real output against
    // observation.schema.json -- every component-level test for these
    // signals passed because they tested the Drawbridge directly, never through
    // tick() itself. Summary's own fields stay flattened at the top level
    // (trajectory, meaning_charge, etc.) for backward compatibility with
    // every existing r.observation.trajectory-style access; health and
    // the 9 signals are added as sibling fields, not nested away.
    const observation = {
      ...(observedEvent.data.summary || {}),
      health: observedEvent.data.health,
      oscillatory: observedEvent.data.oscillatory,
      relationalGaps: observedEvent.data.relationalGaps,
      reversal: observedEvent.data.reversal,
      negativeSpace: observedEvent.data.negativeSpace,
      shadow: observedEvent.data.shadow,
      assumption: observedEvent.data.assumption,
      structural: observedEvent.data.structural,
      existential: observedEvent.data.existential,
      contrastive: observedEvent.data.contrastive,
      affectiveField: observedEvent.data.affectiveField,
      resonanceAnalysis: observedEvent.data.resonanceAnalysis,
      conversationAnalytics: observedEvent.data.conversationAnalytics,
    };

    // the actual feedback mechanism: no explicit target this tick ->
    // reuse whatever the most recent tick was pursuing (its output
    // becomes this tick's input), not a fabricated default.
    const lastEntry = feedback.isEmpty() ? null : feedback.tail(1)[0];
    const effectiveTarget = target !== undefined ? target : (lastEntry ? lastEntry.target : undefined);

    await creatorStream.emit(new Cause('cfr:create', { target: effectiveTarget }));
    const createdEvent = [...creatorStream.pending].reverse().find(e => e.type === 'cfr:created');
    const created = createdEvent.data; // { target, cluster, tick, attractorCount }

    // hold this tick's observation AND the target actually used — this
    // is what the next tick's default reads back
    feedback.push({ text, observation, target: created.target, ts: Date.now() });

    const [latticeResult, causalResult, ledgerResult] = await Promise.all([
      (async () => {
        await latticeStream.emit(new Cause('lattice:record', { observation, created }));
        return latticeStream.pending[latticeStream.pending.length - 1].data;
      })(),
      (async () => {
        await causalStream.emit(new Cause('causal:record', { tick: created.tick }));
        return causalStream.pending[causalStream.pending.length - 1].data;
      })(),
      (async () => {
        const nodeId = `creation:${feedback.core.stats().totalPushed - 1}`;
        await ledgerStream.emit(new Cause('ledger:commit', {
          nodeId, target: created.target, cluster: created.cluster, tick: created.tick,
        }));
        return ledgerStream.pending[ledgerStream.pending.length - 1].data;
      })(),
    ]);

    // END-STATE FIRST: the moment a tick actually converges (real density
    // crossed the threshold -- created.cluster is truthy, not just "we
    // had a target"), immediately surface REVERSE CAUSAL CONDITION
    // MAPPING from that node -- what conditions causally preceded
    // reaching it, not something you have to separately go query for.
    let endStateConditions = null;
    if (created.cluster) {
      endStateConditions = await traceEndState(latticeResult.nodeId);
    }

    const tickResult = {
      observation,
      feedbackWindowSize: feedback.size(),
      created,
      lattice: latticeResult,
      causal: causalResult,
      ledger: ledgerResult,
      endStateConditions,
    };

    // pattern engine observes the FULLY assembled tick, after everything
    // else -- its signature is a function of observation+created, so it
    // needs both finished, not partial state
    tickResult.pattern = await patterns.observe(tickResult, latticeResult.nodeId);

    return tickResult;
  }

  /**
   * traceEndState(nodeId, maxDepth) -> reverse causal condition mapping.
   *
   * "End-state first": given a node (typically one that actually reached
   * convergence toward a target), work BACKWARD to find what conditions
   * causally preceded it -- the inverse of the forward dt-based causal
   * classification causal-graph normally does.
   *
   * Built on the real store's own traceToRoot(), not a new algorithm --
   * it already walks backward through only real causal/rule edges
   * (observational edges break the trace, per the store's own C-3
   * comment). Combined here with associative-lattice's invariant lookup
   * so each step in the backward path also shows what conditions
   * (trajectory, rupture, decay band, convergence state) held at that
   * point -- not just that a causal edge existed, but what was true.
   */
  async function traceEndState(nodeId, maxDepth = 50) {
    const trace = await causalGate.traceToRoot(nodeId, maxDepth);
    const conditions = trace.path.map(id => ({
      nodeId: id,
      invariants: latticeGate.getInvariants(id),
    }));
    return { ...trace, conditions };
  }

  /** Walk the real, durable chains -- survive process restarts. */
  function history(n = 20) {
    return {
      ledger: ledgerGate.history(n),
      lattice: latticeGate.history(n),
      causal: causalGate.history(n),
    };
  }

  /** How much divergence has accumulated since the last baseline snapshot, per component. */
  function sigma() {
    return {
      lattice: latticeGate.sigmaSize(),
      causal: causalGate.sigmaSize(),
    };
  }

  /** Real dispatch history per flow -- drawbridge claims, axiom results. Sec2.3 observability. */
  function logs() {
    return {
      observer: observerLog.entries(),
      creator: creatorLog.entries(),
      lattice: latticeLog.entries(),
      causal: causalLog.entries(),
      ledger: ledgerLog.entries(),
      ideas: ideas.flow.log.entries(),
    };
  }

  return { tick, history, sigma, logs, traceEndState, feedback, ideas, patterns, people, space, flows: { observerStream, creatorStream, latticeStream, causalStream, ledgerStream } };
}

module.exports = { createEmergenceLoop };
