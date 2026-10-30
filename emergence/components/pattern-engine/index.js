'use strict';
/**
 * pattern-engine -- NEW component, not a port, built in response to a
 * direct request for "a pattern engine, with pattern memory." Checked
 * real code first rather than inventing from nothing: found
 * `PredictiveEngine` in scanners/crystalball-test-suite.html (a real,
 * small Markov transition-frequency tracker -- given what just
 * happened, what usually follows, based on real observed counts). That
 * primitive is genuinely missing from Emergence and is the real basis
 * for this component's prediction half. Its `AssociationEngine`
 * sibling in the same file was NOT used -- it overlaps with what
 * associative-lattice already does (Jaccard similarity of extracted
 * content), and the file's GPGPU audio/video processors are out of
 * scope entirely (text-only pipeline).
 *
 * Two things a "pattern engine with memory" could mean were explicitly
 * separated: prediction and recall are built here. Rule generation
 * (patterns compiling into new detection code that runs itself) is
 * `forge`'s territory -- flagged earlier as a different risk category,
 * not touched without explicit sign-off, which hasn't been given.
 *
 * WHAT THIS DOES:
 *   signature(tickResult) -> a real, stated fingerprint of a tick:
 *     trajectory, rupture (bool), decay band, convergence state, and
 *     WHICH of the 10 observer signals fired (by key, not value) --
 *     richer than associative-lattice's own invariant set (which
 *     doesn't track which gap signals fired), built for pattern
 *     recognition specifically rather than resonance weighting.
 *
 *   recall: has this EXACT signature occurred before? Real match, not
 *     fuzzy similarity (Jaccard-style fuzzy matching is
 *     associative-lattice's job, not duplicated here). Returns the real
 *     occurrence count and which prior nodeIds it matched.
 *
 *   prediction: given the current signature, what signature has
 *     historically followed it, and how often -- real transition
 *     counts, not a guess.
 *
 * Persisted differently than the append-only chains elsewhere in this
 * project (ledger/lattice/causal-graph): pattern memory is AGGREGATE
 * mutable state (counts, not an immutable sequence of records), so it's
 * stored as one current-state blob via Jaa's FileStore + FileRefs
 * (content-addressed, but write-through on every observation rather
 * than hash-chained) -- a different, still-real use of the same
 * persistence primitives, not a new storage style invented from scratch.
 */

const { Cause, Drawbridge, Flow, FlowLog } = require('../../../warp');
const path = require('path');
const { FileStore } = require('../../vendor/jaa/FileStore.js');
const { FileRefs } = require('../../vendor/jaa/FileRefs.js');

const STATE_REF = 'emergence/patterns/state';

function decayBand(decay_score) {
  if (decay_score === undefined || decay_score === null) return 'unknown';
  return decay_score >= 0.6 ? 'high' : decay_score >= 0.3 ? 'mid' : 'low';
}

/**
 * signature(tickResult) -> a stable, comparable string fingerprint.
 * Exported standalone so it can be tested and reasoned about in
 * isolation from persistence/WARP wiring, same discipline as every
 * other core-logic function in this project.
 */
function signature(tickResult) {
  const obs = tickResult.observation || {};
  const firedSignals = ['oscillatory', 'relationalGaps', 'reversal', 'negativeSpace', 'shadow', 'assumption', 'structural', 'existential', 'contrastive']
    .filter(key => obs[key])
    .sort();
  const convergence = (tickResult.created && tickResult.created.cluster && tickResult.created.cluster.sig) || 'none';

  return JSON.stringify({
    trajectory: obs.trajectory || 'unknown',
    rupture: !!obs.rupture_active,
    decay: decayBand(obs.decay_score),
    convergence,
    fired: firedSignals,
  });
}

function buildPatternEngine({ dataDir } = {}) {
  const dir = dataDir || path.join(process.cwd(), 'data', 'emergence-patterns');
  const store = new FileStore(dir);
  const refs = new FileRefs(dir);

  // rehydrate real aggregate state from disk, synchronously, at construction
  const stateHash = refs.get(STATE_REF);
  const persisted = stateHash ? store.get(stateHash) : null;
  const occurrences = new Map(persisted ? persisted.occurrences : []); // signature -> { count, nodeIds: [...], firstSeen, lastSeen }
  const transitions = new Map(persisted ? persisted.transitions : []); // "prevSig->currSig" -> count
  let lastSignature = persisted ? persisted.lastSignature : null;

  function persist() {
    const snapshot = {
      occurrences: [...occurrences.entries()],
      transitions: [...transitions.entries()],
      lastSignature,
      ts: Date.now(),
    };
    const hash = store.put(snapshot);
    refs.set(STATE_REF, hash);
    return hash;
  }

  const log = new FlowLog();
  const flow = new Flow({ log });
  const drawbridge = new Drawbridge('pattern:observe', {
    schema: { requiredKeys: ['signature', 'recall', 'prediction'] },
    transform(cause) {
      const { tickResult, nodeId } = cause.data;
      const sig = signature(tickResult);

      // RECALL: real exact-match lookup, not fuzzy
      const prior = occurrences.get(sig);
      const recall = prior
        ? { seenBefore: true, count: prior.count, priorNodeIds: [...prior.nodeIds], firstSeen: prior.firstSeen }
        : { seenBefore: false, count: 0, priorNodeIds: [], firstSeen: null };

      // PREDICTION: what has historically followed the signature we're
      // now leaving -- computed BEFORE recording this tick's own
      // transition, so it reflects real prior history, not this tick
      let prediction = null;
      if (lastSignature) {
        const candidates = [];
        let total = 0;
        for (const [key, count] of transitions) {
          if (key.startsWith(lastSignature + '->')) {
            candidates.push({ signature: key.slice(lastSignature.length + 2), count });
            total += count;
          }
        }
        if (candidates.length) {
          candidates.sort((a, b) => b.count - a.count);
          prediction = {
            mostLikely: candidates[0].signature,
            confidence: +(candidates[0].count / total).toFixed(4),
            candidateCount: candidates.length,
          };
        }
      }

      // record this occurrence for real, after computing recall/prediction
      if (prior) {
        prior.count++;
        prior.nodeIds.push(nodeId);
        prior.lastSeen = Date.now();
      } else {
        occurrences.set(sig, { count: 1, nodeIds: [nodeId], firstSeen: Date.now(), lastSeen: Date.now() });
      }
      if (lastSignature) {
        const key = `${lastSignature}->${sig}`;
        transitions.set(key, (transitions.get(key) || 0) + 1);
      }
      lastSignature = sig;
      persist();

      return [new Cause('pattern:observed', { signature: sig, recall, prediction })];
    },
  });
  flow.register(drawbridge);

  async function observe(tickResult, nodeId) {
    await flow.emit(new Cause('pattern:observe', { tickResult, nodeId }));
    const observed = [...flow.pending].reverse().find(e => e.type === 'pattern:observed');
    return observed.data;
  }

  function stats() {
    return {
      distinctPatterns: occurrences.size,
      distinctTransitions: transitions.size,
      mostCommon: [...occurrences.entries()]
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 5)
        .map(([sig, data]) => ({ signature: JSON.parse(sig), count: data.count })),
    };
  }

  return { observe, stats, signature, flow, log };
}

module.exports = { buildPatternEngine, signature };
