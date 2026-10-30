'use strict';
/**
 * associative-lattice -- REBUILT (v0.2), PERSISTED (v0.3), FULLY
 * REHYDRATED (v0.4), SIGMA-SNAPSHOTTED (v0.5).
 *
 * v0.2: resonance = shared INVARIANTS (Jaccard). v0.3: Jaa-backed
 * durability, last-node-only rehydration. v0.4: full-chain replay on
 * restart -- correct, but replays the ENTIRE history from genesis every
 * time, which was stated as a real cost for a long-running project.
 *
 * v0.5: closes that, using this project's own real vocabulary rather
 * than inventing a generic checkpoint scheme. Emerge's canonical
 * definition (emerge-language.spec): sigma = divergence_from_baseline,
 * observation = the_result_of_applying_sigma_to_a_baseline.
 *
 * Applied literally: every `snapshotInterval` commits, write a BASELINE
 * -- a full serialized graph state -- to emergence/lattice/baseline.
 * On restart: load the baseline directly (one read, no replay), then
 * walk the chain from head back ONLY to the baseline's point (not to
 * genesis) and replay just that segment -- the real sigma, the actual
 * divergence accumulated since the last baseline, nothing more.
 */

const { Cause, Drawbridge } = require('../../../warp');
const path = require('path');
const { FileStore } = require('../../vendor/jaa/FileStore.js');
const { FileRefs } = require('../../vendor/jaa/FileRefs.js');

const LATTICE_URL = 'file://' + path.resolve(__dirname, '../../vendor/rfr2/lattice/lattice.js');
const HEAD_REF = 'emergence/lattice/head';
const BASELINE_REF = 'emergence/lattice/baseline';
const DEFAULT_SNAPSHOT_INTERVAL = 25; // stated, tunable default -- not a discovered constant

function extractInvariants({ observation, created }) {
  const inv = new Set();
  if (observation) {
    inv.add(`trajectory:${observation.trajectory}`);
    inv.add(`rupture:${observation.rupture_active}`);
    const band = observation.decay_score >= 0.6 ? 'high' : observation.decay_score >= 0.3 ? 'mid' : 'low';
    inv.add(`decay:${band}`);
  }
  if (created && created.target) inv.add(`target-type:${created.target.type}`);
  inv.add(`convergence:${(created && created.cluster && created.cluster.sig) || 'none'}`);
  return inv;
}

function jaccard(a, b) {
  const union = new Set([...a, ...b]);
  if (union.size === 0) return 0;
  let shared = 0;
  for (const x of a) if (b.has(x)) shared++;
  return +(shared / union.size).toFixed(4);
}

function buildLatticeGate({ dataDir, snapshotInterval = DEFAULT_SNAPSHOT_INTERVAL } = {}) {
  const dir = dataDir || path.join(process.cwd(), 'data', 'emergence-lattice');
  const store = new FileStore(dir);
  const refs = new FileRefs(dir);

  /** Walk the chain from `fromHash` backward, STOPPING at (not including) `stopAtHash`. This IS the sigma -- the divergence since that point. */
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

  // sigma: only the segment between head and the last baseline (or, if
  // no baseline exists yet, the entire chain -- an empty baseline is a
  // legitimate baseline, this is that case, not a special one)
  const sigmaNewestFirst = walkSigmaSince(headHash, baseline ? baseline.atHash : null);
  const sigmaOldestFirst = [...sigmaNewestFirst].reverse();

  let lastNode = sigmaNewestFirst.length
    ? { id: sigmaNewestFirst[0].nodeId, invariants: new Set(sigmaNewestFirst[0].invariants) }
    : (baseline && baseline.nodes.length ? { id: baseline.nodes[baseline.nodes.length - 1].id, invariants: new Set(baseline.nodes[baseline.nodes.length - 1].tags) } : null);
  let counter = sigmaNewestFirst.length
    ? sigmaNewestFirst[0].nodeIndex + 1
    : (baseline ? baseline.nextIndex : 0);
  let commitsSinceBaseline = sigmaNewestFirst.length;

  // fast per-node invariant lookup, maintained across baseline + sigma +
  // live commits -- needed to combine causal-graph's backward trace with
  // "what conditions held at each step" (reverse causal condition mapping)
  const nodeInvariants = new Map();
  if (baseline) for (const n of baseline.nodes) nodeInvariants.set(n.id, n.tags);
  for (const record of sigmaOldestFirst) nodeInvariants.set(record.nodeId, record.invariants);

  let engine = null;
  async function ensureEngine() {
    if (engine) return engine;
    const { LatticeGraph, LatticeEngine } = await import(LATTICE_URL);
    engine = new LatticeEngine({ graph: new LatticeGraph() });

    // load the baseline directly -- one read, no replay needed for this part
    if (baseline) {
      for (const n of baseline.nodes) engine.addNode({ id: n.id, label: n.id, tags: n.tags, meta: {} });
      for (const e of baseline.edges) engine.connect(e.from, e.to, { weight: e.weight, type: 'invariant-resonance' });
    }

    // replay ONLY the real sigma -- the divergence since the baseline,
    // not the entire history from genesis
    for (const record of sigmaOldestFirst) {
      engine.addNode({ id: record.nodeId, label: record.nodeId, tags: record.invariants, meta: {} });
      if (record.edge) {
        engine.connect(record.edge.from, record.edge.to, { weight: record.edge.weight, type: 'invariant-resonance' });
      }
    }
    return engine;
  }

  function writeBaseline(eng, atHash, nextIndex) {
    const g = eng.graph();
    const snapshot = {
      atHash, nextIndex,
      nodes: g.nodes.map(n => ({ id: n.id, tags: n.tags })),
      edges: g.edges.map(e => ({ from: e.a, to: e.b, weight: e.weight })),
      ts: Date.now(),
    };
    const hash = store.put(snapshot);
    refs.set(BASELINE_REF, hash);
    return hash;
  }

  const drawbridge = new Drawbridge('lattice:record', {
    schema: { requiredKeys: ['nodeId', 'nodeCount'] },
    async transform(cause) {
      const { observation, created } = cause.data;
      const eng = await ensureEngine();
      const invariants = extractInvariants({ observation, created });

      const nodeIndex = counter++;
      const nodeId = `creation:${nodeIndex}`;
      eng.addNode({
        id: nodeId,
        label: nodeId,
        tags: [...invariants],
        meta: { invariantCount: invariants.size },
      });

      let edge = null;
      if (lastNode) {
        const weight = jaccard(invariants, lastNode.invariants);
        eng.connect(lastNode.id, nodeId, { weight, type: 'invariant-resonance' });
        edge = {
          from: lastNode.id, to: nodeId, weight,
          sharedInvariants: [...invariants].filter(i => lastNode.invariants.has(i)),
        };
      }
      lastNode = { id: nodeId, invariants };
      nodeInvariants.set(nodeId, [...invariants]);

      // persist: content-addressed, hash-chained to the prior head
      const prevHash = refs.get(HEAD_REF);
      const record = { nodeId, nodeIndex, invariants: [...invariants], edge, prev: prevHash, ts: Date.now() };
      const hash = store.put(record);
      refs.set(HEAD_REF, hash);
      commitsSinceBaseline++;

      // sigma has grown enough -- fold it into a new baseline, so the
      // NEXT restart's replay segment shrinks back down instead of
      // growing without bound
      let snapshotted = false;
      if (commitsSinceBaseline >= snapshotInterval) {
        writeBaseline(eng, hash, counter);
        commitsSinceBaseline = 0;
        snapshotted = true;
      }

      const g = eng.graph();
      return [
        new Cause('lattice:recorded', {
          nodeId,
          invariants: [...invariants],
          nodeCount: g.nodes.length,
          edgeCount: g.edges.length,
          edge,
          hash,
          snapshotted,
        }),
      ];
    },
  });

  /** Walk the real persisted chain (sigma since baseline + the baseline itself, if you want full history use a larger n). */
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

  /** How large is the current sigma (divergence since last baseline)? Real number, for inspection. */
  drawbridge.sigmaSize = function sigmaSize() {
    return commitsSinceBaseline;
  };

  /** What invariants (conditions) held at a given node? Used to combine with causal-graph's backward trace. */
  drawbridge.getInvariants = function getInvariants(nodeId) {
    return nodeInvariants.get(nodeId) || null;
  };

  return drawbridge;
}

module.exports = { buildLatticeGate, extractInvariants, jaccard };
