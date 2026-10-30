/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  MULTIDIMENSIONAL LATTICE  ·  multi-lattice.js  ·  v0.4.0               ║
 * ║  UUID: eravos-lattice-core-0001-0000-000000000002                       ║
 * ║  HOOK: eravos.lattice:core:00002                                        ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * N graphs over ONE node set. Every utterance is compared against every prior
 * utterance on every dimension independently. An edge exists per dimension.
 *
 * ── WHAT THIS REPLACES ─────────────────────────────────────────────────────
 *
 * buildLatticeData() — a top-60 word-frequency list with two booleans. One
 * axis, no edges, no relations. Its own tab copy promised "defensive word
 * clusters"; its contract said "hooks not yet scoped." §6.1 violation in
 * shipped code.
 *
 * ── THE INTERDEPENDENCE LAYER (§0.5 — complexity earning its existence) ────
 *
 * Six independent graphs would be six lattices in a trenchcoat. The value is
 * in where they DISAGREE:
 *
 *   needs link + lexical does NOT   -> the same unmet need in new language.
 *                                      Circling. Invisible to any word cloud.
 *   lexical link + affect does NOT  -> the phrase survived, what's under it moved.
 *   intent link + needs do NOT      -> strategy outliving its cause.
 *   lexical ONLY                    -> coincidence. This is the noise.
 *   lexical + needs + affect        -> a genuine repeat.
 *
 * §13.3 — every class named before it occurs.
 *
 * ── SIGNAL / NOISE ─────────────────────────────────────────────────────────
 *
 * Not a component. It falls out of the structure: no dimension links, no
 * edge; lexical alone, recorded but not surfaced; two or more, signal.
 */

'use strict';

import { DIMENSIONS, DIMENSION_IDS } from './dimensions.js';

export const LATTICE_VERSION = '0.13.0';
export const LATTICE_UUID    = 'eravos-lattice-core-0001-0000-000000000002';

/** §13.3 — resonance classes, declared before they can occur. */
export const RESONANCE_CLASSES = Object.freeze({
  FULL_RESONANCE: {
    label: 'Same thing, same way, same feeling',
    test: d => d.has('lexical') && d.has('needs') && d.has('affect'),
    signal: true,
    weight: 5,
  },
  SAME_NEED_DIFFERENT_WORDS: {
    label: 'The same need, in new language',
    test: d => d.has('needs') && !d.has('lexical'),
    signal: true,
    weight: 6,   // highest — the thing no word lattice can see
  },
  SAME_WORDS_DIFFERENT_FEELING: {
    label: 'The same words, carrying something else now',
    test: d => d.has('lexical') && !d.has('affect') && d.size > 1,
    signal: true,
    weight: 4,
  },
  SAME_INTENT_DIFFERENT_NEED: {
    label: 'The same move, a different reason',
    test: d => d.has('intent') && !d.has('needs') && d.size > 1,
    signal: true,
    weight: 3,
  },
  SAME_VOICE: {
    label: 'The voice carried it the same way',
    test: d => d.has('prosody') && d.size > 1,
    signal: true,
    weight: 3,
  },
  SAME_FIELD_DIFFERENT_EVERYTHING: {
    label: 'Nothing in common but the state you were both in',
    // The one only the field dimension can see: two moments that share no
    // words, no need, no intent and no feeling-movement, and belong together
    // anyway because the relationship was in the same place both times.
    test: d => d.has('field') && d.size === 1,
    signal: true,
    weight: 5,
  },
  SHARED_LANGUAGE: {
    label: 'Your own word, both times',
    // A shared word linking two moments is stronger evidence than an
    // ordinary word doing the same, because the vocabulary was built
    // deliberately by both of you rather than inherited from a dictionary.
    test: d => d.has('grammar'),
    signal: true,
    weight: 7,
  },
  SURFACE_ONLY: {
    label: 'Words only — coincidence',
    test: d => d.size === 1 && d.has('lexical'),
    signal: false,     // THIS IS THE NOISE
    weight: 0,
  },
  INTENT_ONLY: {
    label: 'Same move, nothing else in common',
    test: d => d.size === 1 && d.has('intent'),
    signal: false,     // intent is a ~10-value categorical; alone it is weak
    weight: 0,
  },
  AFFECT_ONLY: {
    label: 'Moved the field similarly, nothing else in common',
    test: d => d.size === 1 && d.has('affect'),
    signal: false,
    weight: 0,
  },
});

export const RESONANCE_CLASS_IDS = Object.freeze(Object.keys(RESONANCE_CLASSES));

let _seq = 0;

/**
 * ADAPTIVE THRESHOLDS (v0.13.0) — what makes the lattice dynamic rather than
 * a set of constants someone guessed once.
 *
 * A fixed threshold on a corpus-dependent metric is the same §0.1 error as a
 * fixed jitter threshold across different voices: it asserts a constant that
 * is really a variable. Concretely — lexical Jaccard at 0.15 links almost
 * nothing across short utterances and almost everything across long ones, so
 * the same number means "unusually similar" for one pair and "wrote a
 * sentence" for another.
 *
 * Each dimension now learns the distribution of scores IT actually produces
 * for THIS pair, and links at a high percentile of that distribution. The
 * question becomes "is this pair unusually alike for us" rather than "does it
 * clear a number a stranger picked".
 *
 * §1.1 — it does NOT guess while cold. Below WARMUP it uses the declared
 * static threshold and says so in health(). And the adaptive value is clamped
 * to a floor, because a corpus where everything is dissimilar must not slide
 * its threshold down until noise starts qualifying.
 */
const ADAPT_WARMUP = 40;      // scores observed before adapting
const ADAPT_WINDOW = 600;     // rolling, so it tracks a drifting conversation
const ADAPT_PERCENTILE = 0.85;

class AdaptiveThreshold {
  constructor(staticValue, opts = {}) {
    this.static = staticValue;
    this.floor = opts.floor != null ? opts.floor : staticValue * 0.6;
    this.ceil = opts.ceil != null ? opts.ceil : Math.min(1, staticValue * 2.5);
    this.percentile = opts.percentile || ADAPT_PERCENTILE;
    this._scores = [];
  }
  observe(score) {
    if (!Number.isFinite(score)) return;
    this._scores.push(score);
    if (this._scores.length > ADAPT_WINDOW) this._scores.shift();
  }
  get warm() { return this._scores.length >= ADAPT_WARMUP; }
  value() {
    if (!this.warm) return this.static;
    const sorted = this._scores.slice().sort((a, b) => a - b);
    const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * this.percentile));
    return Math.max(this.floor, Math.min(this.ceil, sorted[idx]));
  }
  report() {
    return {
      inUse: +this.value().toFixed(4),
      declared: this.static,
      adaptive: this.warm,
      samples: this._scores.length,
      // §12.5 -- a threshold pinned at its floor or ceiling is information:
      // it means the adaptive value wanted to go further and was stopped.
      // `this.warm && ...` returned the boolean false when cold, which reads
      // as "checked, not clamped" rather than "not checked yet". Small, but
      // it is a diagnostic field and a diagnostic that misreports is worse
      // than one that is absent (§1.2).
      clamped: !this.warm ? null
             : this.value() === this.floor ? 'floor'
             : this.value() === this.ceil ? 'ceil' : null,
    };
  }
}

export class MultiLattice {
  static UUID    = LATTICE_UUID;
  static VERSION = LATTICE_VERSION;

  /**
   * @param {object} opts
   * @param {string[]} [opts.dimensions]  subset of DIMENSION_IDS
   * @param {number}   [opts.maxNodes]    bounded — §0.4, cost must stay stated
   * @param {object}   [opts.bus]         AlkBus; edges are published if present
   * @param {boolean}  [opts.adaptive]    learn thresholds from this pair's own
   *                                      score distribution (default true)
   */
  constructor({ dimensions = DIMENSION_IDS, maxNodes = 500, bus = null, adaptive = true } = {}) {
    const unknown = dimensions.filter(d => !DIMENSIONS[d]);
    if (unknown.length) {
      // §1.2 — loud, specific, names what was asked for and what exists
      throw new Error(`[multi-lattice] unknown dimension(s): ${unknown.join(', ')}. Known: ${DIMENSION_IDS.join(', ')}`);
    }
    this._dimIds = dimensions;
    this._maxNodes = maxNodes;
    this._adaptive = adaptive !== false;
    this._thresholds = {};
    for (const d of dimensions) {
      // intent is categorical (0 or 1) -- adapting a threshold on a two-valued
      // metric is meaningless, so it keeps its declared value. Naming the
      // exception beats letting it produce nonsense quietly.
      this._thresholds[d] = (d === 'intent')
        ? { value: () => DIMENSIONS[d].threshold, observe: () => {}, warm: false,
            report: () => ({ inUse: DIMENSIONS[d].threshold, declared: DIMENSIONS[d].threshold,
                             adaptive: false, samples: 0, clamped: null,
                             note: 'categorical — adapting a two-valued metric is meaningless' }) }
        : new AdaptiveThreshold(DIMENSIONS[d].threshold);
    }
    this._bus = bus;
    this._nodes = [];                    // ordered, oldest first
    this._byId = new Map();
    this._edges = new Map();             // dimId -> [edge]
    this._pairs = new Map();             // "a|b" -> pair record (interdependence)
    for (const d of this._dimIds) this._edges.set(d, []);
    this._stats = { added: 0, evicted: 0, edgesByDim: new Map(), classCounts: new Map(), noise: 0, signal: 0 };
  }

  /**
   * Add one utterance. Compares against EVERY prior node on EVERY dimension.
   *
   * @param {object} u  { id?, text, ts?, speaker?, dims:{ signalVector, need, latent, prosody } }
   * @returns {{node:object, edges:object, pairs:Array}}
   */
  add(u) {
    if (!u || typeof u.text !== 'string') {
      throw new Error('[multi-lattice] add(): utterance requires a string `text`');
    }
    const node = {
      id: u.id || `u:${_seq++}`,
      text: u.text,
      ts: u.ts || Date.now(),
      speaker: u.speaker || 'self',
      dims: u.dims || {},
      extracted: {},
    };
    for (const d of this._dimIds) node.extracted[d] = DIMENSIONS[d].extract(node);

    const newEdges = {};
    const newPairs = [];
    for (const d of this._dimIds) newEdges[d] = [];

    for (const prior of this._nodes) {
      const linked = new Set();
      const perDim = {};

      for (const d of this._dimIds) {
        const dim = DIMENSIONS[d];
        const a = node.extracted[d], b = prior.extracted[d];
        if (a == null || b == null) { perDim[d] = null; continue; }   // abstained
        const score = dim.similarity(a, b);
        perDim[d] = Math.round(score * 1000) / 1000;
        // Observe BEFORE testing, so the distribution includes the scores
        // that did not link. A threshold learned only from links would ratchet
        // upward forever — it would only ever see its own successes.
        if (this._adaptive) this._thresholds[d].observe(score);
        const thr = this._adaptive ? this._thresholds[d].value() : dim.threshold;
        if (score >= thr) {
          linked.add(d);
          const edge = {
            a: node.id, b: prior.id,
            dim: d,
            score: perDim[d],
            shared: dim.describe ? dim.describe(a, b) : [],
          };
          this._edges.get(d).push(edge);
          newEdges[d].push(edge);
          this._stats.edgesByDim.set(d, (this._stats.edgesByDim.get(d) ?? 0) + 1);
        }
      }

      if (linked.size === 0) continue;   // no relation at all -> no pair

      // §5.3 — temporal is CONTEXT, not evidence. Within a single session
      // nearly every pair is temporally adjacent, so counting it toward
      // breadth made noise indistinguishable from signal. It still forms an
      // edge and is still reported; it no longer votes on classification.
      const evidential = new Set([...linked].filter(d => d !== 'temporal'));
      if (evidential.size === 0) continue;

      const pair = this._classify(node, prior, evidential, perDim, linked);
      this._pairs.set(`${node.id}|${prior.id}`, pair);
      newPairs.push(pair);
      for (const c of pair.classes) this._stats.classCounts.set(c, (this._stats.classCounts.get(c) ?? 0) + 1);
      if (pair.signal) this._stats.signal++; else this._stats.noise++;
    }

    this._nodes.push(node);
    this._byId.set(node.id, node);
    this._stats.added++;
    this._evictIfNeeded();

    if (this._bus) {
      this._bus.emit('alk.lattice.node', {
        node: { id: node.id, text: node.text, ts: node.ts, speaker: node.speaker },
        pairs: newPairs,
        nodeCount: this._nodes.length,
      });
      for (const p of newPairs.filter(p => p.signal)) this._bus.emit('alk.lattice.resonance', p);
    }

    return { node, edges: newEdges, pairs: newPairs };
  }

  /** §16.2 — every classification traces backward to the evidence that caused it. */
  _classify(node, prior, linked, perDim, allLinked = linked) {
    const self = this;
    const classes = [];
    let weight = 0, signal = false;
    for (const [id, def] of Object.entries(RESONANCE_CLASSES)) {
      if (def.test(linked)) {
        classes.push(id);
        weight = Math.max(weight, def.weight);
        if (def.signal) signal = true;
      }
    }
    return {
      a: node.id, b: prior.id,
      aText: node.text, bText: prior.text,
      dtMs: Math.abs(node.ts - prior.ts),
      dimensions: [...allLinked],
      evidential: [...linked],
      breadth: linked.size,   // EVIDENTIAL breadth; temporal excluded
      scores: perDim,
      classes,
      labels: classes.map(c => RESONANCE_CLASSES[c].label),
      weight, signal,
      evidence: [...linked].map(d => {
        const t = this._thresholds && this._thresholds[d];
        const used = t ? +t.value().toFixed(3) : DIMENSIONS[d].threshold;
        return `${d}=${perDim[d]}>=${used}${t && t.warm ? '~' : ''}`;   // ~ = learned, not declared
      }),
    };
  }

  /** §0.4 — bounded by construction. Eviction is announced, never silent. */
  _evictIfNeeded() {
    while (this._nodes.length > this._maxNodes) {
      const gone = this._nodes.shift();
      this._byId.delete(gone.id);
      for (const d of this._dimIds) {
        this._edges.set(d, this._edges.get(d).filter(e => e.a !== gone.id && e.b !== gone.id));
      }
      for (const k of [...this._pairs.keys()]) {
        if (k.startsWith(gone.id + '|') || k.endsWith('|' + gone.id)) this._pairs.delete(k);
      }
      this._stats.evicted++;
      if (this._bus) this._bus.emit('alk.lattice.evicted', { id: gone.id, ts: gone.ts });
    }
  }

  /** Signal pairs only, strongest first. This is what the UI renders. */
  resonances({ limit = 40, minBreadth = 2 } = {}) {
    return [...this._pairs.values()]
      .filter(p => p.signal && p.breadth >= minBreadth)
      .sort((x, y) => (y.weight - x.weight) || (y.breadth - x.breadth))
      .slice(0, limit);
  }

  /** Everything linked to one node, per dimension. */
  neighbours(id, { limit = 12 } = {}) {
    const out = [];
    for (const p of this._pairs.values()) {
      if (p.a === id || p.b === id) out.push({ ...p, other: p.a === id ? p.b : p.a });
    }
    return out.sort((x, y) => y.weight - x.weight).slice(0, limit);
  }

  get nodes() { return this._nodes; }
  get nodeCount() { return this._nodes.length; }
  edges(dim) { return dim ? (this._edges.get(dim) || []) : Object.fromEntries([...this._edges]); }
  get edgeCount() { let n = 0; for (const a of this._edges.values()) n += a.length; return n; }
  node(id) { return this._byId.get(id) || null; }

  /** §12.6 — diagnostic engine, queryable live. */
  health() {
    const total = this._stats.signal + this._stats.noise;
    return {
      version: LATTICE_VERSION,
      dimensions: this._dimIds,
      nodes: this._nodes.length,
      maxNodes: this._maxNodes,
      evicted: this._stats.evicted,
      edges: this.edgeCount,
      edgesByDim: Object.fromEntries(this._stats.edgesByDim),
      pairs: this._pairs.size,
      signal: this._stats.signal,
      noise: this._stats.noise,
      signalRatio: total ? +(this._stats.signal / total).toFixed(3) : 0,
      classCounts: Object.fromEntries(this._stats.classCounts),
      // dimensions that have produced no edge at all -- a dead dimension is
      // information, not something to hide (§12.5)
      silentDimensions: this._dimIds.filter(d => !this._stats.edgesByDim.get(d)),
      // §2.3 — what each dimension is ACTUALLY using right now, and whether
      // it is still on the declared constant or has learned its own.
      thresholds: Object.fromEntries(this._dimIds.map(d => [d, this._thresholds[d].report()])),
      adaptive: this._adaptive,
      status: this._nodes.length === 0 ? 'empty'
            : this._stats.signal === 0 ? 'no-resonance-yet'
            : 'healthy',
    };
  }

  reset() {
    this._nodes = []; this._byId.clear(); this._pairs.clear();
    for (const d of this._dimIds) this._edges.set(d, []);
    this._stats = { added: 0, evicted: 0, edgesByDim: new Map(), classCounts: new Map(), noise: 0, signal: 0 };
  }

  /** §9.4 — export is a first-class operation, not an afterthought. */
  export() {
    return {
      version: LATTICE_VERSION,
      exportedAt: new Date().toISOString(),
      dimensions: this._dimIds,
      nodes: this._nodes.map(n => ({ id: n.id, text: n.text, ts: n.ts, speaker: n.speaker, dims: n.dims })),
      pairs: [...this._pairs.values()],
      health: this.health(),
    };
  }
}
