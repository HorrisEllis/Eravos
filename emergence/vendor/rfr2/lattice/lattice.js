/**
 * @spatial/lattice — lattice.js
 * Associative memory. Resonance-weighted graph.
 * §5.5 Zero runtime dependencies. §K6 All I/O via bus.
 * §K7 All errors as events, never throws.
 *
 * LatticeGraph  — pure data structure: nodes + edges
 * LatticeEngine — query, connect, cluster, threshold interface
 *                 consumed by LatticeCLI and bus adapter
 */

'use strict';

export const LATTICE_VERSION   = '1.0.0';
export const DEFAULT_THRESHOLD = 0.35;

// ── Node ─────────────────────────────────────────────────────────────────────

function makeNode({ id, label, tags = [], species = 'human', sessionId = null, confidence = 1.0, meta = {} }) {
  if (!id)    throw new Error('[LatticeGraph] node.id required');
  if (!label) throw new Error('[LatticeGraph] node.label required');
  return Object.freeze({ id, label, tags: [...tags], species, sessionId, confidence, meta: { ...meta } });
}

// ── Edge ─────────────────────────────────────────────────────────────────────

function makeEdge({ a, b, weight = 0.5, type = 'resonance', ts = Date.now() }) {
  if (!a || !b) throw new Error('[LatticeGraph] edge requires a and b');
  return Object.freeze({ a, b, weight: Math.max(0, Math.min(1, weight)), type, ts });
}

// ── LatticeGraph — pure data structure ───────────────────────────────────────

export class LatticeGraph {
  constructor() {
    this._nodes = new Map();  // id → node
    this._edges = new Map();  // `${a}:${b}` → edge (canonical: a < b)
    this._adj   = new Map();  // id → Set<id>
  }

  _key(a, b) { return a < b ? `${a}:${b}` : `${b}:${a}`; }

  addNode(spec) {
    const node = makeNode(spec);
    this._nodes.set(node.id, node);
    if (!this._adj.has(node.id)) this._adj.set(node.id, new Set());
    return node;
  }

  addEdge(spec) {
    const { a, b } = spec;
    if (!this._nodes.has(a)) throw new Error(`[LatticeGraph] node '${a}' not found`);
    if (!this._nodes.has(b)) throw new Error(`[LatticeGraph] node '${b}' not found`);
    const edge = makeEdge(spec);
    this._edges.set(this._key(a, b), edge);
    this._adj.get(a).add(b);
    this._adj.get(b).add(a);
    return edge;
  }

  getNode(id)          { return this._nodes.get(id) ?? null; }
  getEdge(a, b)        { return this._edges.get(this._key(a, b)) ?? null; }
  neighbors(id)        { return [...(this._adj.get(id) ?? [])]; }
  get nodes()          { return [...this._nodes.values()]; }
  get edges()          { return [...this._edges.values()]; }
  get nodeCount()      { return this._nodes.size; }
  get edgeCount()      { return this._edges.size; }

  removeNode(id) {
    const adj = this._adj.get(id) ?? new Set();
    for (const nbr of adj) {
      this._edges.delete(this._key(id, nbr));
      this._adj.get(nbr)?.delete(id);
    }
    this._nodes.delete(id);
    this._adj.delete(id);
  }
}

// ── Token similarity — simple trigram Jaccard ────────────────────────────────

function trigrams(s) {
  const t = new Set();
  const p = ` ${s.toLowerCase()} `;
  for (let i = 0; i < p.length - 2; i++) t.add(p.slice(i, i + 3));
  return t;
}

function similarity(a, b) {
  const ta = trigrams(a), tb = trigrams(b);
  let inter = 0;
  for (const g of ta) if (tb.has(g)) inter++;
  const union = ta.size + tb.size - inter;
  return union === 0 ? 0 : inter / union;
}

// ── LatticeEngine — query + mutation interface ────────────────────────────────

export class LatticeEngine {
  constructor({ bus, graph } = {}) {
    this._bus       = bus ?? null;
    this._graph     = graph ?? new LatticeGraph();
    this._threshold = DEFAULT_THRESHOLD;

    if (bus) this._attachBus(bus);
  }

  _attachBus(bus) {
    // Listen for kernel landscape events → auto-add attractor nodes
    bus.on('spatial.kernel.landscape.updated', ({ personId, landscape }) => {
      if (!personId || !landscape?.attractors) return;
      for (const attr of landscape.attractors) {
        const nodeId = `${personId}:${attr.label ?? attr.id ?? 'unnamed'}`;
        if (!this._graph.getNode(nodeId)) {
          try {
            this._graph.addNode({
              id:         nodeId,
              label:      attr.label ?? nodeId,
              tags:       ['attractor', personId],
              sessionId:  null,
              confidence: attr.depth ?? 0.5,
              meta:       { depth: attr.depth, visits: attr.visits, center: attr.center },
            });
          } catch (_) {}
        }
      }
    });

    // Listen for resonance scores → auto-add edges
    bus.on('spatial.resonance.scored', ({ a, b, overall }) => {
      if (!a || !b || overall == null) return;
      try {
        this._graph.addEdge({ a, b, weight: overall, type: 'resonance' });
        this._emitGraphReady();
      } catch (_) {}
    });
  }

  // ── Mutation ────────────────────────────────────────────────────────────────

  addNode(spec)  {
    const node = this._graph.addNode(spec);
    this._bus?.emit('spatial.lattice.node.added', { node, ts: Date.now() });
    return node;
  }

  connect(idA, idB, { weight, type } = {}) {
    const a = this._graph.getNode(idA);
    const b = this._graph.getNode(idB);
    if (!a || !b) return null;
    const w = weight ?? this._computeResonance(a, b);
    try {
      const edge = this._graph.addEdge({ a: idA, b: idB, weight: w, type: type ?? 'resonance' });
      this._bus?.emit('spatial.lattice.edge.connected', { edge, ts: Date.now() });
      return edge;
    } catch (_) { return null; }
  }

  _computeResonance(a, b) {
    // Similarity based on label trigrams + shared tags
    const labelSim = similarity(a.label, b.label);
    const sharedTags = a.tags.filter(t => b.tags.includes(t)).length;
    const tagSim = sharedTags / Math.max(1, Math.max(a.tags.length, b.tags.length));
    return Math.round(((labelSim * 0.6 + tagSim * 0.4)) * 10000) / 10000;
  }

  // ── Query ───────────────────────────────────────────────────────────────────

  find(query, { limit = 10, threshold } = {}) {
    const t = threshold ?? this._threshold;
    return this._graph.nodes
      .map(node => ({ node, score: similarity(query, node.label + ' ' + node.tags.join(' ')) }))
      .filter(r => r.score >= t)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  inspect(nodeId) {
    const node = this._graph.getNode(nodeId);
    if (!node) return null;
    const edges = this._graph.edges.filter(e => e.a === nodeId || e.b === nodeId);
    return { ...node, edges };
  }

  cluster() {
    // Simple connected-components clustering above threshold
    const visited = new Set();
    const clusters = [];
    for (const node of this._graph.nodes) {
      if (visited.has(node.id)) continue;
      const members = [];
      const queue = [node.id];
      while (queue.length) {
        const id = queue.shift();
        if (visited.has(id)) continue;
        visited.add(id);
        members.push(id);
        for (const nbr of this._graph.neighbors(id)) {
          const edge = this._graph.getEdge(id, nbr);
          if (edge && edge.weight >= this._threshold && !visited.has(nbr)) queue.push(nbr);
        }
      }
      if (members.length > 1) {
        const nodes = members.map(id => this._graph.getNode(id));
        const edges = this._graph.edges.filter(e => members.includes(e.a) && members.includes(e.b));
        const avgRes = edges.length
          ? Math.round(edges.reduce((s, e) => s + e.weight, 0) / edges.length * 10000) / 10000
          : 0;
        const tagFreq = {};
        nodes.forEach(n => n.tags.forEach(t => { tagFreq[t] = (tagFreq[t] ?? 0) + 1; }));
        const dominantTag = Object.entries(tagFreq).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
        clusters.push({ id: `c${clusters.length}`, size: members.length, members, avgResonance: avgRes, dominantTag });
      }
    }
    if (clusters.length) this._bus?.emit('spatial.lattice.cluster.updated', { clusters, ts: Date.now() });
    return clusters;
  }

  graph() {
    return { nodes: this._graph.nodes, edges: this._graph.edges };
  }

  setThreshold(t) {
    this._threshold = Math.max(0, Math.min(1, t));
  }

  // ── Bus emit ────────────────────────────────────────────────────────────────

  _emitGraphReady() {
    this._bus?.emit('spatial.lattice.graph.ready', this.graph());
  }
}
