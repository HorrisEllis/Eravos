'use strict';
/**
 * causal-graph -- REBUILT (v0.2), PERSISTED (v0.3), FULLY REHYDRATED
 * (v0.4), SIGMA-SNAPSHOTTED (v0.5).
 *
 * v0.5: same real fix as associative-lattice -- see that file's header
 * for the full rationale (Emerge's canonical sigma = divergence_from_
 * baseline). Every `snapshotInterval` commits, write a BASELINE (the
 * full set of causal edges) to emergence/causal/baseline. On restart,
 * load the baseline directly and replay only the real sigma -- edges
 * added since -- not genesis-to-head every time.
 *
 * The real rfr2 causal store (vendor/rfr2/causality/index.js) doesn't
 * expose a public edge-list getter -- checked its source, edgeMap is a
 * private closure variable. So edges are tracked in a plain array here,
 * appended to exactly once per successfully-added edge, never
 * reconstructed after the fact from index arithmetic (an earlier draft
 * of this file tried that and it was a real bug risk -- caught before
 * it shipped, rewritten to track directly instead).
 */

const { Cause, Drawbridge } = require('../../../warp');
const path = require('path');
const { FileStore } = require('../../vendor/jaa/FileStore.js');
const { FileRefs } = require('../../vendor/jaa/FileRefs.js');

const CAUSALITY_URL = 'file://' + path.resolve(__dirname, '../../vendor/rfr2/causality/index.js');
const HEAD_REF = 'emergence/causal/head';
const BASELINE_REF = 'emergence/causal/baseline';
const DEFAULT_SNAPSHOT_INTERVAL = 25;

function buildCausalGraphGate({ causalWindowTicks = 0.5, dataDir, snapshotInterval = DEFAULT_SNAPSHOT_INTERVAL } = {}) {
  const dir = dataDir || path.join(process.cwd(), 'data', 'emergence-causal');
  const store = new FileStore(dir);
  const refs = new FileRefs(dir);

  function walkSigmaSince(fromHash, stopAtHash) {
    const out = [];
    let hash = fromHash;
    while (hash && hash !== stopAtHash) {
      const record = store.get(hash);
      out.push({ ...record, hash });
      hash = record.prev;
    }
    return out;
  }

  const headHash = refs.get(HEAD_REF);
  const baselineHash = refs.get(BASELINE_REF);
  const baseline = baselineHash ? store.get(baselineHash) : null;

  const sigmaNewestFirst = walkSigmaSince(headHash, baseline ? baseline.atHash : null);
  const sigmaOldestFirst = [...sigmaNewestFirst].reverse();

  let last = sigmaNewestFirst.length
    ? { id: sigmaNewestFirst[0].nodeId, tick: sigmaNewestFirst[0].tick }
    : (baseline && baseline.lastNodeId !== null ? { id: baseline.lastNodeId, tick: baseline.lastTick } : null);
  let counter = sigmaNewestFirst.length
    ? sigmaNewestFirst[0].nodeIndex + 1
    : (baseline ? baseline.nextIndex : 0);
  let commitsSinceBaseline = sigmaNewestFirst.length;

  // running list of every edge this store has ever held -- seeded from
  // the baseline, then appended to directly as edges are added, never
  // reconstructed after the fact.
  const edgesTracked = baseline ? [...baseline.edges] : [];

  let causalStore = null;
  let createEdgeFn = null;
  let EDGE_CAUSAL_RULE = null;
  let EDGE_OBSERVATIONAL = null;

  async function ensureStore() {
    if (causalStore) return causalStore;
    const mod = await import(CAUSALITY_URL);
    causalStore = mod.createCausalStore();
    createEdgeFn = mod.createEdge;
    EDGE_CAUSAL_RULE = mod.EDGE_CAUSAL_RULE;
    EDGE_OBSERVATIONAL = mod.EDGE_OBSERVATIONAL;

    // load the baseline's edges directly -- one read, no replay needed
    if (baseline) {
      for (const e of baseline.edges) {
        const edge = createEdgeFn(e.from, e.to, e.edgeType, 'cfr:create-dt', e.dt, e.edgeType === EDGE_CAUSAL_RULE ? 1.0 : 0.0);
        try { causalStore.addEdge(edge); } catch { /* replaying real prior baseline state */ }
      }
    }

    // replay ONLY the real sigma -- edges added since the baseline
    let prevInSigma = baseline ? baseline.lastNodeId : null;
    for (const record of sigmaOldestFirst) {
      if (record.edgeType && prevInSigma) {
        const edge = createEdgeFn(prevInSigma, record.nodeId, record.edgeType, 'cfr:create-dt', record.dt, record.edgeType === EDGE_CAUSAL_RULE ? 1.0 : 0.0);
        try { causalStore.addEdge(edge); } catch { /* real replayed history */ }
      }
      prevInSigma = record.nodeId;
    }
    return causalStore;
  }

  function writeBaseline(atHash, nextIndex, lastNodeId, lastTick) {
    const snapshot = { atHash, nextIndex, lastNodeId, lastTick, edges: edgesTracked, ts: Date.now() };
    const hash = store.put(snapshot);
    refs.set(BASELINE_REF, hash);
    return hash;
  }

  const drawbridge = new Drawbridge('causal:record', {
    schema: { requiredKeys: ['nodeId', 'edgeType'] },
    async transform(cause) {
      const s = await ensureStore();
      const { tick } = cause.data;
      const nodeIndex = counter++;
      const nodeId = `creation:${nodeIndex}`;
      let edgeType = null;
      let dt = null;
      let rejected = false;

      if (last) {
        dt = +(tick - last.tick).toFixed(6);
        edgeType = dt <= causalWindowTicks ? EDGE_CAUSAL_RULE : EDGE_OBSERVATIONAL;
        const edge = createEdgeFn(last.id, nodeId, edgeType, 'cfr:create-dt', dt, edgeType === EDGE_CAUSAL_RULE ? 1.0 : 0.0);
        try {
          s.addEdge(edge);
          edgesTracked.push({ from: last.id, to: nodeId, edgeType, dt }); // tracked directly, once, here -- not reconstructed later
        } catch (e) {
          rejected = true;
        }
      }
      last = { id: nodeId, tick };

      const prevHash = refs.get(HEAD_REF);
      const record = { nodeId, nodeIndex, tick, dt, edgeType, prev: prevHash, ts: Date.now() };
      const hash = store.put(record);
      refs.set(HEAD_REF, hash);
      commitsSinceBaseline++;

      let snapshotted = false;
      if (commitsSinceBaseline >= snapshotInterval) {
        writeBaseline(hash, counter, nodeId, tick);
        commitsSinceBaseline = 0;
        snapshotted = true;
      }

      return [new Cause('causal:recorded', { nodeId, dt, edgeType, rejected, hash, snapshotted })];
    },
  });

  drawbridge.history = function history(n = 20) {
    const out = [];
    let hash = refs.get(HEAD_REF);
    const stopAt = baseline ? baseline.atHash : null;
    while (hash && hash !== stopAt && out.length < n) {
      const record = store.get(hash);
      out.push({ ...record, hash });
      hash = record.prev;
    }
    return out;
  };

  drawbridge.sigmaSize = function sigmaSize() {
    return commitsSinceBaseline;
  };

  /**
   * traceToRoot(nodeId, maxDepth) -> { path, depth, truncated }
   * REVERSE CAUSAL CONDITION MAPPING: walks backward from nodeId through
   * only real causal/rule edges (not observational ones -- the real
   * store's own traceToRoot breaks the trace at the first non-causal
   * edge, per its own C-3 comment: "Observational edges are sideband
   * annotations, never traversed"). This is not a new algorithm -- it's
   * the store's own unexposed method, wired through.
   */
  drawbridge.traceToRoot = async function traceToRoot(nodeId, maxDepth = 50) {
    const s = await ensureStore();
    return s.traceToRoot(nodeId, maxDepth);
  };

  return drawbridge;
}

module.exports = { buildCausalGraphGate };
