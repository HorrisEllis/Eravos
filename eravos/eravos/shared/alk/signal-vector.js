'use strict';
/**
 * signal-vector.js  (ESM build for ERAVOS) — line-for-line CommonJS port of
 * `Associative_Lattice/Resonance/src/extraction/heuristics.ts`.
 *
 * PORT, NOT REDESIGN. Every lexicon, every regex, every coefficient is
 * carried across unchanged. The only changes are mechanical:
 *   - TypeScript types stripped (they were compile-time only)
 *   - `export function` -> `module.exports`
 *   - nothing else
 *
 * Produces a 15-dimension SignalVector from raw text. Zero dependencies,
 * no network, no model. Same discipline as the rest of Emergence.
 *
 * WHAT THIS IS FOR: Emergence's associative-lattice currently describes a
 * tick with 5 categorical strings (trajectory, rupture, decay band,
 * target type, convergence). That gives a Jaccard weight that can only
 * take 6 discrete values. This produces 15 continuous axes from the same
 * text, which is what "multidimensional" actually needs underneath it.
 *
 * HONEST SCOPE: these are lexicon-and-regex approximations, exactly as
 * the original file states in its own header ("Scores are approximations
 * — LLM layer refines them"). They are real measurements of real surface
 * features of text. They are not psychological readings.
 */

// ─── Lexicon Banks (verbatim from heuristics.ts) ─────────────────────

const ABSTRACT_WORDS = new Set([
  'meaning', 'essence', 'truth', 'consciousness', 'structure', 'pattern',
  'system', 'theory', 'concept', 'abstraction', 'principle', 'framework',
  'paradigm', 'ideology', 'philosophy', 'metaphysics', 'ontology', 'being',
  'existence', 'emergence', 'complexity', 'entropy', 'coherence', 'resonance',
  'signal', 'dynamic', 'recursive', 'infinite', 'temporal', 'fundamental',
]);

const CONCRETE_WORDS = new Set([
  'table', 'chair', 'walk', 'eat', 'drive', 'house', 'door', 'hand',
  'money', 'work', 'job', 'car', 'food', 'body', 'room', 'street',
  'today', 'yesterday', 'now', 'here', 'store', 'phone', 'coffee',
]);

const SOMATIC_WORDS = new Set([
  'chest', 'breath', 'body', 'stomach', 'skin', 'hands', 'spine', 'gut',
  'heart', 'throat', 'eyes', 'shoulder', 'weight', 'tired', 'heavy',
  'ache', 'warm', 'cold', 'tight', 'release', 'tension', 'shake', 'pulse',
  'numb', 'hollow', 'burning', 'neck', 'jaw', 'floor', 'ground',
]);

const METAPHOR_MARKERS = [
  /\blike\s+a\b/gi, /\bas\s+if\b/gi, /\bas\s+a\b/gi,
  /\bwaves?\b/gi, /\becho(es)?\b/gi, /\bbridge\b/gi,
  /\broot(s|ed)?\b/gi, /\bseed(s)?\b/gi, /\bthread(s)?\b/gi,
  /\borganism\b/gi, /\borbit(s|ing)?\b/gi, /\bgravit(y|ates?)\b/gi,
  /\bfractal\b/gi, /\bmirror(s|ed|ing)?\b/gi, /\bprism\b/gi,
  /\blayer(s)?\b/gi, /\bweav(e|ing|es)\b/gi, /\barchitecture\b/gi,
];

const CAUSAL_MARKERS = [
  /\bbecause\b/gi, /\btherefore\b/gi, /\bwhich\s+means\b/gi,
  /\bwhich\s+causes?\b/gi, /\bleads?\s+to\b/gi, /\bimplies?\b/gi,
  /\bresult(s|ing)?\s+(in|from)\b/gi, /\bconsequently\b/gi,
  /\bthus\b/gi, /\bhence\b/gi, /\bso\s+that\b/gi, /\bif\s+.{1,40}\s+then\b/gi,
];

const SELF_REF_MARKERS = [
  /\bI\s+(think|feel|notice|realize|wonder|mean|find|believe)\b/gi,
  /\bmy\s+(sense|feeling|thought|pattern|way|tendency|mind)\b/gi,
  /\bwithin\s+me\b/gi, /\bpart\s+of\s+me\b/gi,
  /\bI\s+am\s+(always|often|still|just|not)\b/gi,
  /\bwatching\s+(myself|this)\b/gi,
];

const URGENCY_WORDS = new Set([
  'now', 'immediately', 'urgent', 'crisis', 'need', 'must', 'have to',
  'right now', 'running out', 'deadline', 'before', 'quickly', 'fast',
  'panic', 'desperate', 'breaking', 'collapsing', 'failing', 'lost',
]);

const NEGATIVE_WORDS = new Set([
  'broken', 'lost', 'fail', 'wrong', 'bad', 'hurt', 'pain', 'suffering',
  'alone', 'empty', 'hollow', 'dark', 'dead', 'collapse', 'ruin', 'grief',
  'fear', 'dread', 'shame', 'guilt', 'rage', 'despair', 'nothing', 'never',
]);

const POSITIVE_WORDS = new Set([
  'good', 'clear', 'true', 'love', 'joy', 'alive', 'light', 'hope',
  'build', 'grow', 'create', 'connect', 'understand', 'free', 'open',
  'real', 'whole', 'full', 'solid', 'strong', 'beautiful', 'meaningful',
]);

const SYMBOLIC_WORDS = new Set([
  'god', 'soul', 'shadow', 'fire', 'death', 'birth', 'void', 'cosmos',
  'sacred', 'myth', 'archetype', 'ritual', 'fate', 'destiny', 'eternal',
  'infinite', 'dark', 'light', 'threshold', 'vessel', 'wound', 'gift',
]);

const POETIC_MARKERS = [/—/g, /\.\.\./g, /\n\s*\n/g];

// ─── Helpers ─────────────────────────────────────────────────────────

function words(text) {
  return String(text).toLowerCase().match(/\b[a-z']+\b/g) || [];
}

function sentences(text) {
  return String(text).split(/[.!?]+/).map(s => s.trim()).filter(Boolean);
}

function clamp(n) {
  return Math.max(0, Math.min(1, n));
}

function countMatches(text, patterns) {
  return patterns.reduce((sum, p) => {
    const m = String(text).match(new RegExp(p.source, p.flags));
    return sum + (m ? m.length : 0);
  }, 0);
}

function lexiconRatio(wordList, set) {
  if (wordList.length === 0) return 0;
  const hits = wordList.filter(w => set.has(w)).length;
  return hits / wordList.length;
}

// ─── Feature extractors ──────────────────────────────────────────────

function extractCognition(text, wordList, sents) {
  const abstractScore = lexiconRatio(wordList, ABSTRACT_WORDS);
  const concreteScore = lexiconRatio(wordList, CONCRETE_WORDS);
  const abstractionLevel = clamp(abstractScore * 4 - concreteScore * 2 + 0.4);

  const causalCount = countMatches(text, CAUSAL_MARKERS);
  const systemThinking = clamp(causalCount / Math.max(sents.length, 1) * 1.5);

  const selfRefCount = countMatches(text, SELF_REF_MARKERS);
  const recursionDepth = clamp(selfRefCount / Math.max(sents.length, 1) * 2);

  const hasNumberedList = /^\s*\d+[.)]/m.test(text);
  const hasBullets = /^\s*[-•*]/m.test(text);
  const avgSentLen = wordList.length / Math.max(sents.length, 1);
  const linearity = clamp(
    (hasNumberedList ? 0.3 : 0) +
    (hasBullets ? 0.2 : 0) +
    clamp(avgSentLen / 25) * 0.5
  );

  const uniqueAbstract = new Set(wordList.filter(w => ABSTRACT_WORDS.has(w))).size;
  const compression = clamp(uniqueAbstract / Math.max(sents.length, 1) * 0.4);

  return { abstractionLevel, linearity, recursionDepth, systemThinking, compression };
}

function extractAffect(text, wordList, sents) {
  const negScore = lexiconRatio(wordList, NEGATIVE_WORDS);
  const posScore = lexiconRatio(wordList, POSITIVE_WORDS);
  const valence = clamp(0.5 + (posScore - negScore) * 5);

  const urgencyScore = lexiconRatio(wordList, URGENCY_WORDS);
  const urgency = clamp(urgencyScore * 8);

  const exclamations = (String(text).match(/!/g) || []).length;
  const questions = (String(text).match(/\?/g) || []).length;
  const volatility = clamp((exclamations + questions) / Math.max(sents.length, 1) * 0.8 + urgencyScore * 2);

  const relationalWords = (String(text).match(/\b(you|we|us|they|relationship|together|connection|bond|other)\b/gi) || []).length;
  const attachmentLoad = clamp(relationalWords / Math.max(wordList.length, 1) * 10);

  const somaticScore = lexiconRatio(wordList, SOMATIC_WORDS);
  const somaticDensity = clamp(somaticScore * 12);

  return { valence, volatility, attachmentLoad, urgency, somaticDensity };
}

function extractLanguage(text, wordList, sents) {
  const metaphorCount = countMatches(text, METAPHOR_MARKERS);
  const metaphorDensity = clamp(metaphorCount / Math.max(sents.length, 1) * 0.6);

  const symbolicScore = lexiconRatio(wordList, SYMBOLIC_WORDS);
  const symbolicUsage = clamp(symbolicScore * 15);

  const poeticMarkerCount = countMatches(text, POETIC_MARKERS);
  const shortLineCount = String(text).split('\n')
    .filter(l => l.trim().length > 0 && l.trim().split(' ').length < 6).length;
  const poeticness = clamp((poeticMarkerCount * 0.15) + (shortLineCount * 0.1));

  const analyticalMarkers = [
    /\bhowever\b/gi, /\btherefore\b/gi, /\balthough\b/gi, /\bwhereas\b/gi,
    /\bin\s+contrast\b/gi, /\bspecifically\b/gi, /\bin\s+other\s+words\b/gi,
    /\bfor\s+example\b/gi, /\bthat\s+is\b/gi, /\bto\s+clarify\b/gi,
  ];
  const analyticalCount = countMatches(text, analyticalMarkers);
  const analyticalness = clamp(analyticalCount / Math.max(sents.length, 1) * 1.2);

  const narrativeMarkers = [
    /\bthen\b/gi, /\bafter\b/gi, /\bbefore\b/gi, /\bfinally\b/gi,
    /\bsuddenly\b/gi, /\bonce\b/gi, /\buntil\b/gi, /\bwhen\b/gi,
  ];
  const narrativeCount = countMatches(text, narrativeMarkers);
  const narrativeStructure = clamp(narrativeCount / Math.max(sents.length, 1) * 0.8);

  return { metaphorDensity, symbolicUsage, poeticness, analyticalness, narrativeStructure };
}

function extractEntropy(text, wordList) {
  const unique = new Set(wordList).size;
  const ttr = wordList.length > 0 ? unique / wordList.length : 0;
  return clamp(ttr * 1.4 - 0.2);
}

function extractIntensity(text, affect) {
  return clamp(
    affect.volatility * 0.3 +
    affect.urgency * 0.3 +
    affect.somaticDensity * 0.2 +
    Math.abs(affect.valence - 0.5) * 2 * 0.2
  );
}

// ─── Main ────────────────────────────────────────────────────────────

/** extractHeuristic(userId, text) -> SignalVector (minus extractionMethod/confidence) */
function extractHeuristic(userId, text) {
  const wordList = words(text);
  const sents = sentences(text);

  const cognition = extractCognition(text, wordList, sents);
  const affect = extractAffect(text, wordList, sents);
  const language = extractLanguage(text, wordList, sents);
  const entropy = extractEntropy(text, wordList);
  const intensity = extractIntensity(text, affect);

  return { userId, timestamp: Date.now(), text, cognition, affect, language, entropy, intensity };
}

/** The 15 axis names, flattened. Stated once here so nothing downstream guesses. */
const AXES = [
  'cognition.abstractionLevel', 'cognition.linearity', 'cognition.recursionDepth',
  'cognition.systemThinking', 'cognition.compression',
  'affect.valence', 'affect.volatility', 'affect.attachmentLoad',
  'affect.urgency', 'affect.somaticDensity',
  'language.metaphorDensity', 'language.symbolicUsage', 'language.poeticness',
  'language.analyticalness', 'language.narrativeStructure',
];

/** Flatten a SignalVector to a 15-number array in AXES order. */
function toVector(sv) {
  return AXES.map(path => {
    const [group, key] = path.split('.');
    return sv[group][key];
  });
}

export { extractHeuristic, toVector, AXES };
export const SIGNAL_VECTOR_VERSION = '0.4.0';
