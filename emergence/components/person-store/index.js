'use strict';
/**
 * person-store -- refactored from people-module-1's real schemas
 * (schemas/person.schema.json, dimension-score.schema.json,
 * interaction.schema.json), NOT from the HTML app's own storage code
 * (which uses browser localStorage under key 'form_people_v5' -- not
 * portable here). The schemas ARE the real, checked contract; this
 * builds a genuine implementation of that contract onto Jaa
 * persistence and real WARP dispatch, matching idea-store's exact
 * architecture rather than inventing a new pattern.
 *
 * SCOPED, not the full schema: `photos` and `lexicon` sub-schemas are
 * both explicitly documented in person.schema.json as "optional --
 * created lazily on first upload" / "empty/absent by default; no
 * bundled data ships with any component" -- skipped here to stay
 * achievable, not silently dropped without reason.
 *
 * The 24-dimension config (valence, arousal, empathy, ... care) with
 * real weights and defaults is copied faithfully from
 * dimension-score.schema.json's own embedded config -- not
 * approximated, the exact w/def values from the real schema.
 *
 * Mutations are real WARP Gates (add, interact, setDimensions) guarded
 * by real hard Axioms, same discipline as idea-store. Persisted as one
 * evolving blob per person via Jaa (aggregate mutable state -- a
 * person's dimensions and interaction log genuinely change over time,
 * unlike ideas' immutable-once-created shape) -- same real pattern
 * pattern-engine uses for its own aggregate state, a different, still
 * real use of the same Jaa primitives, not a new storage style.
 */

const crypto = require('crypto');
const path = require('path');
const { Cause, Drawbridge, Axiom, Flow, FlowLog } = require('../../../warp');
const { FileStore } = require('../../vendor/jaa/FileStore.js');
const { FileRefs } = require('../../vendor/jaa/FileRefs.js');

const STATE_REF = 'emergence/people/state';

// Faithful copy of dimension-score.schema.json's real embedded config --
// not approximated. { cat, w (weight), def (default) } per dimension.
const DIMENSION_CONFIG = Object.freeze({
  valence:     { cat: 'emotional',  w: 1.0, def: 0.0 },
  arousal:     { cat: 'emotional',  w: 0.7, def: 0.3 },
  empathy:     { cat: 'emotional',  w: 1.2, def: 0.6 },
  affect_reg:  { cat: 'emotional',  w: 0.8, def: 0.5 },
  openness:    { cat: 'cognitive',  w: 1.1, def: 0.6 },
  complexity:  { cat: 'cognitive',  w: 0.9, def: 0.5 },
  curiosity:   { cat: 'cognitive',  w: 1.0, def: 0.7 },
  intuition:   { cat: 'cognitive',  w: 0.7, def: 0.5 },
  coherence:   { cat: 'nervous',    w: 1.3, def: 0.6 },
  suppression: { cat: 'nervous',    w: 1.0, def: 0.1 },
  activation:  { cat: 'nervous',    w: 0.7, def: 0.4 },
  regulation:  { cat: 'nervous',    w: 0.9, def: 0.6 },
  attachment:  { cat: 'relational', w: 1.2, def: 0.6 },
  trust:       { cat: 'relational', w: 1.3, def: 0.6 },
  reciprocity: { cat: 'relational', w: 1.1, def: 0.5 },
  repair:      { cat: 'relational', w: 1.0, def: 0.5 },
  integrity:   { cat: 'values',     w: 1.4, def: 0.7 },
  justice:     { cat: 'values',     w: 1.2, def: 0.6 },
  meaning:     { cat: 'values',     w: 1.3, def: 0.6 },
  autonomy:    { cat: 'values',     w: 0.9, def: 0.6 },
  love_lang:   { cat: 'love',       w: 1.1, def: 0.5 },
  intimacy:    { cat: 'love',       w: 1.2, def: 0.5 },
  presence:    { cat: 'love',       w: 1.3, def: 0.6 },
  care:        { cat: 'love',       w: 1.4, def: 0.7 },
});

const MOOD_VALUES = Object.freeze(['\u2726', '\u2601', '\u2295', '\u2736', '\u2053', '\u25B3']); // real enum from interaction.schema.json

function defaultDims() {
  const out = {};
  for (const [key, cfg] of Object.entries(DIMENSION_CONFIG)) out[key] = cfg.def;
  return out;
}

function shortid(prefix) {
  return `${prefix}_${crypto.randomBytes(4).toString('hex')}`;
}

function buildPersonStore({ dataDir } = {}) {
  const dir = dataDir || path.join(process.cwd(), 'data', 'emergence-people');
  const store = new FileStore(dir);
  const refs = new FileRefs(dir);

  const persisted = (() => {
    const hash = refs.get(STATE_REF);
    return hash ? store.get(hash) : null;
  })();
  const people = new Map(persisted ? persisted.people : []); // id -> full person record

  function persist() {
    const hash = store.put({ people: [...people.entries()], ts: Date.now() });
    refs.set(STATE_REF, hash);
  }

  function findById(id) {
    return people.has(id) ? { ...people.get(id) } : null;
  }

  const nameRequired = new Axiom('person:name-required', {
    severity: 'hard',
    check: (cause) => cause.type !== 'person:add' || !!(cause.data.name && cause.data.name.trim()),
  });
  const personExists = new Axiom('person:exists', {
    severity: 'hard',
    check: (cause) => {
      if (cause.type !== 'person:interact' && cause.type !== 'person:set-dimensions') return true;
      return !!findById(cause.data.personId);
    },
  });
  const validMood = new Axiom('person:valid-mood', {
    severity: 'hard',
    check: (cause) => cause.type !== 'person:interact' || MOOD_VALUES.includes(cause.data.mood),
  });

  const addGate = new Drawbridge('person:add', {
    schema: { requiredKeys: ['id'] },
    transform(cause) {
      const { name, nickname = '', relationship = '', closeness = 3, profile = {} } = cause.data;
      const person = {
        id: shortid('per'), name: name.trim(), nickname, relationship,
        closeness: Math.min(5, Math.max(1, closeness)),
        profile: { ...profile },
        dimensions: defaultDims(),
        interactions: [],
        created_at: Date.now(),
      };
      people.set(person.id, person);
      persist();
      return [new Cause('person:added', person)];
    },
  });

  const interactGate = new Drawbridge('person:interact', {
    schema: { requiredKeys: ['id'] },
    transform(cause) {
      const { personId, text, mood } = cause.data;
      const interaction = { id: shortid('int'), text, mood, timestamp: Date.now(), source: 'manual' };
      const person = people.get(personId);
      person.interactions.push(interaction);
      persist();
      return [new Cause('person:interacted', { personId, interaction })];
    },
  });

  const setDimensionsGate = new Drawbridge('person:set-dimensions', {
    schema: { requiredKeys: ['id'] },
    transform(cause) {
      const { personId, dimensions } = cause.data;
      const person = people.get(personId);
      const validKeys = Object.keys(DIMENSION_CONFIG);
      for (const key of Object.keys(dimensions)) {
        if (!validKeys.includes(key)) continue; // unknown dims silently ignored, not errored -- matches schema's "fixed 24-axis" framing
        person.dimensions[key] = Math.min(1, Math.max(key === 'valence' ? -1 : 0, dimensions[key]));
      }
      persist();
      return [new Cause('person:dimensions-set', { personId, dimensions: { ...person.dimensions } })];
    },
  });

  const log = new FlowLog();
  const flow = new Flow({ log, axioms: [nameRequired, personExists, validMood] });
  flow.register(addGate);
  flow.register(interactGate);
  flow.register(setDimensionsGate);

  async function add(params) {
    const before = flow.rejected.length;
    await flow.emit(new Cause('person:add', params));
    if (flow.rejected.length > before) throw new Error('[person-store] name is required');
    const added = [...flow.pending].reverse().find(e => e.type === 'person:added');
    return added.data;
  }

  async function interact(personId, { text, mood }) {
    const before = flow.rejected.length;
    await flow.emit(new Cause('person:interact', { personId, text, mood }));
    if (flow.rejected.length > before) {
      const rejection = flow.rejected[flow.rejected.length - 1];
      const failedIds = rejection.failures.map(f => f.axiomId);
      if (failedIds.includes('person:exists')) throw new Error(`[person-store] person '${personId}' not found`);
      if (failedIds.includes('person:valid-mood')) throw new Error(`[person-store] invalid mood '${mood}'. Valid: ${MOOD_VALUES.join(' ')}`);
      throw new Error('[person-store] interact rejected');
    }
    const interacted = [...flow.pending].reverse().find(e => e.type === 'person:interacted');
    return interacted.data;
  }

  async function setDimensions(personId, dimensions) {
    const before = flow.rejected.length;
    await flow.emit(new Cause('person:set-dimensions', { personId, dimensions }));
    if (flow.rejected.length > before) throw new Error(`[person-store] person '${personId}' not found`);
    const set = [...flow.pending].reverse().find(e => e.type === 'person:dimensions-set');
    return set.data;
  }

  function list() {
    return [...people.values()].map(p => ({ ...p }));
  }

  function search(query) {
    const q = query.toLowerCase();
    return list().filter(p =>
      p.name.toLowerCase().includes(q) ||
      p.nickname.toLowerCase().includes(q) ||
      p.relationship.toLowerCase().includes(q)
    );
  }

  /**
   * similarity(personIdA, personIdB) -> weighted cosine-ish alignment
   * score across all 24 dimensions, using the real per-dimension
   * weights from DIMENSION_CONFIG. Faithful to dimension-score.schema.json's
   * own documented consumer ("NEG negotiation engine... similarity()").
   */
  function similarity(personIdA, personIdB) {
    const a = findById(personIdA), b = findById(personIdB);
    if (!a || !b) throw new Error('[person-store] both people must exist to compute similarity');
    let weightedDot = 0, weightA = 0, weightB = 0;
    for (const [key, cfg] of Object.entries(DIMENSION_CONFIG)) {
      const va = a.dimensions[key] ?? cfg.def, vb = b.dimensions[key] ?? cfg.def;
      weightedDot += cfg.w * va * vb;
      weightA += cfg.w * va * va;
      weightB += cfg.w * vb * vb;
    }
    if (weightA === 0 || weightB === 0) return 0;
    return +(weightedDot / Math.sqrt(weightA * weightB)).toFixed(4);
  }

  return { add, interact, setDimensions, findById, list, search, similarity, DIMENSION_CONFIG, flow };
}

module.exports = { buildPersonStore, DIMENSION_CONFIG, defaultDims };
