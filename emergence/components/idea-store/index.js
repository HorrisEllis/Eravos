'use strict';
/**
 * idea-store -- refactored, not vendored, from
 * build-tools/rheon-idea-os/storage/IdeaStore.js.
 *
 * REBUILT AGAIN (v0.2): the first version was plain function calls --
 * add()/link()/list()/etc -- with zero WARP involvement, the one real
 * component in this project that didn't go through Cause -> Drawbridge ->
 * Flow -> FlowLog. Every other component (rfr2-observer,
 * cfr-creator, associative-lattice, causal-graph, event-ledger) is a
 * real WARP Drawbridge. This wasn't -- inconsistent with the rest of the
 * project's actual architecture, not just its description.
 *
 * Now: mutations (add, link) are real WARP Gates with real Axioms
 * (hard severity -- checked via warp/core/Axiom.js's real signature,
 * check(cause, drawbridge, streamState)). Reads (list, search, findById,
 * graph, edgesFor, neighbours) stay as direct methods on the returned
 * object -- same read/write split every other Jaa-backed component
 * uses (associative-lattice/causal-graph expose .history() directly,
 * not as a Drawbridge-dispatched cause; only mutation goes through the Drawbridge).
 *
 * Same real logic as before: EDGE_TYPES vocabulary
 * (related|refines|contradicts|implements|spawns), same validation
 * rules, same Jaa content-addressed + hash-chained persistence.
 */

const crypto = require('crypto');
const path = require('path');
const { Cause, Drawbridge, Axiom, Flow, FlowLog } = require('../../../warp');
const { FileStore } = require('../../vendor/jaa/FileStore.js');
const { FileRefs } = require('../../vendor/jaa/FileRefs.js');

const EDGE_TYPES = ['related', 'refines', 'contradicts', 'implements', 'spawns'];
const IDEAS_HEAD_REF = 'emergence/ideas/head';
const LATTICE_HEAD_REF = 'emergence/ideas/lattice-head';

function shortid() {
  return crypto.randomBytes(4).toString('hex');
}

function walkChain(store, refs, headRef) {
  const out = [];
  let hash = refs.get(headRef);
  while (hash) {
    const record = store.get(hash);
    out.push({ ...record, hash });
    hash = record.prev;
  }
  return out; // newest-first
}

function stripInternal({ prev, hash, ...rest }) {
  return rest;
}

function buildIdeaStore({ dataDir } = {}) {
  const dir = dataDir || path.join(process.cwd(), 'data', 'emergence-ideas');
  const store = new FileStore(dir);
  const refs = new FileRefs(dir);

  function findById(id) {
    const found = walkChain(store, refs, IDEAS_HEAD_REF).find(i => i.id === id);
    return found ? stripInternal(found) : null;
  }

  // ── Axioms (real, WARP-native validation) ─────────────────────────
  const textRequired = new Axiom('idea:text-required', {
    severity: 'hard',
    check: (cause) => {
      if (cause.type !== 'idea:add') return true; // not this axiom's cause type -- pass
      return !!(cause.data.text && cause.data.text.trim());
    },
  });

  const validEdgeType = new Axiom('idea:valid-edge-type', {
    severity: 'hard',
    check: (cause) => {
      if (cause.type !== 'idea:link') return true;
      return EDGE_TYPES.includes(cause.data.type);
    },
  });

  const fromExists = new Axiom('idea:from-exists', {
    severity: 'hard',
    check: (cause) => {
      if (cause.type !== 'idea:link') return true;
      return !!findById(cause.data.fromId);
    },
  });

  const toExists = new Axiom('idea:to-exists', {
    severity: 'hard',
    check: (cause) => {
      if (cause.type !== 'idea:link') return true;
      return !!findById(cause.data.toId);
    },
  });

  const addGate = new Drawbridge('idea:add', {
    schema: { requiredKeys: ['id'] },
    transform(cause) {
      const { text, projectId = null, tags = [], source = 'api' } = cause.data;
      const idea = { id: shortid(), ts: Date.now(), text: text.trim(), projectId, tags, source };
      const prevHash = refs.get(IDEAS_HEAD_REF);
      const hash = store.put({ ...idea, prev: prevHash });
      refs.set(IDEAS_HEAD_REF, hash);
      return [new Cause('idea:added', idea)];
    },
  });

  const linkGate = new Drawbridge('idea:link', {
    schema: { requiredKeys: ['id'] },
    transform(cause) {
      const { fromId, toId, type, source = 'api' } = cause.data;
      const edge = { id: shortid(), ts: Date.now(), fromId, toId, type, source };
      const prevHash = refs.get(LATTICE_HEAD_REF);
      const hash = store.put({ ...edge, prev: prevHash });
      refs.set(LATTICE_HEAD_REF, hash);
      return [new Cause('idea:linked', edge)];
    },
  });

  const log = new FlowLog();
  const flow = new Flow({ log, axioms: [textRequired, validEdgeType, fromExists, toExists] });
  flow.register(addGate);
  flow.register(linkGate);

  // ── real WARP-dispatched mutations ──────────────────────────────
  async function add(params) {
    const before = flow.rejected.length;
    await flow.emit(new Cause('idea:add', params));
    if (flow.rejected.length > before) {
      throw new Error('[idea-store] idea text is required');
    }
    const added = [...flow.pending].reverse().find(e => e.type === 'idea:added');
    return added.data;
  }

  async function link(params) {
    const before = flow.rejected.length;
    await flow.emit(new Cause('idea:link', params));
    if (flow.rejected.length > before) {
      const rejection = flow.rejected[flow.rejected.length - 1];
      const failedIds = rejection.failures.map(f => f.axiomId);
      if (failedIds.includes('idea:valid-edge-type')) {
        throw new Error(`[idea-store] invalid edge type '${params.type}'. Valid: ${EDGE_TYPES.join(', ')}`);
      }
      if (failedIds.includes('idea:from-exists')) {
        throw new Error(`[idea-store] fromId '${params.fromId}' not found`);
      }
      if (failedIds.includes('idea:to-exists')) {
        throw new Error(`[idea-store] toId '${params.toId}' not found`);
      }
      throw new Error('[idea-store] link rejected');
    }
    const linked = [...flow.pending].reverse().find(e => e.type === 'idea:linked');
    return linked.data;
  }

  // ── real reads, direct methods (same split as associative-lattice/causal-graph) ──
  function list({ projectId, tags, limit } = {}) {
    let ideas = walkChain(store, refs, IDEAS_HEAD_REF);
    if (projectId) ideas = ideas.filter(i => i.projectId === projectId);
    if (tags && tags.length) ideas = ideas.filter(i => tags.every(t => i.tags.includes(t)));
    if (limit) ideas = ideas.slice(0, limit);
    return ideas.map(stripInternal);
  }

  function search(query, projectId) {
    const q = query.toLowerCase();
    let ideas = walkChain(store, refs, IDEAS_HEAD_REF);
    if (projectId) ideas = ideas.filter(i => i.projectId === projectId);
    return ideas
      .filter(i => i.text.toLowerCase().includes(q) || i.tags.some(t => t.toLowerCase().includes(q)))
      .map(stripInternal);
  }

  function graph(projectId) {
    let nodes = walkChain(store, refs, IDEAS_HEAD_REF).map(stripInternal);
    const edges = walkChain(store, refs, LATTICE_HEAD_REF).map(stripInternal);
    if (projectId) {
      nodes = nodes.filter(n => n.projectId === projectId);
      const nodeIds = new Set(nodes.map(n => n.id));
      return { nodes, edges: edges.filter(e => nodeIds.has(e.fromId) && nodeIds.has(e.toId)) };
    }
    return { nodes, edges };
  }

  function edgesFor(ideaId) {
    return walkChain(store, refs, LATTICE_HEAD_REF)
      .map(stripInternal)
      .filter(e => e.fromId === ideaId || e.toId === ideaId);
  }

  function neighbours(ideaId) {
    const edges = edgesFor(ideaId);
    const neighbourIds = new Set(edges.flatMap(e => [e.fromId, e.toId]).filter(id => id !== ideaId));
    return walkChain(store, refs, IDEAS_HEAD_REF).map(stripInternal).filter(i => neighbourIds.has(i.id));
  }

  return { add, list, findById, search, link, graph, edgesFor, neighbours, EDGE_TYPES, flow };
}

module.exports = { buildIdeaStore, EDGE_TYPES };
