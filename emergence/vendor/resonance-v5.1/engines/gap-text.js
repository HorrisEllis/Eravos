/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  GapHunter — Text Analysis Engine  ·  gap-text.js  ·  v2.0.0          ║
 * ║  UUID: gh-text-0000-0000-0000-000000000002                             ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * Runs the six original ALK detectors (WeakAssumption, ShadowField,
 * Contrastive, NegativeSpace, StructuralAssumption, Reversal) plus
 * new domain-specific detectors for code, QA, science, ethics,
 * and life domains — all from plain text input.
 *
 * No kernel dependency. Standalone. Composable.
 * Import the classes you need; wire them yourself.
 *
 * All six original detectors preserved verbatim from gap-hunter-core.js.
 * Extended with domain-aware routing and the universal taxonomy.
 */

'use strict';

import {
  WeakAssumptionHunter,
  ShadowFieldDetector,
  ContrastiveGapDetector,
  NegativeSpaceDetector,
  StructuralAssumptionAuditor,
  ReversalDetector,
} from './gap-hunter-core.js';

import {
  GAP_TYPE,
  GAP_CATALOGUE,
  UNIVERSAL_CRITICALITY,
  DOMAIN,
  getByDomain,
  getByDomainGroup,
} from './gap-taxonomy.js';

// ─── Utilities ────────────────────────────────────────────────────────────────

function r4(n)            { return Math.round((n ?? 0) * 10000) / 10000; }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function mean(arr)        { return arr.length ? arr.reduce((s,v)=>s+v,0)/arr.length : 0; }
function uuid4()          { return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{const r=Math.random()*16|0;return(c==='x'?r:r&0x3|0x8).toString(16);}); }

function tokenize(text) {
  return (text ?? '').toLowerCase().replace(/[^a-z0-9'\s]/g,'').split(/\s+/).filter(Boolean);
}

function matchCount(text, re) {
  const m = text.match(re);
  return m ? m.length : 0;
}

const CONF = { HIGH: 'HIGH', MEDIUM: 'MEDIUM', LOW: 'LOW' };
function conf(v) { return v >= 0.65 ? CONF.HIGH : v >= 0.35 ? CONF.MEDIUM : CONF.LOW; }

// ─── Code-Specific Text Detector ─────────────────────────────────────────────

/**
 * Detects code-quality and language-specific gaps from source text.
 * Works on any code snippet or project description.
 */
export class CodeGapDetector {
  static UUID = 'gh-code-0000-0000-0000-000000000010';

  constructor() { this._finds = 0; }

  analyze(text, language = 'generic') {
    const words  = tokenize(text);
    if (words.length < 3) return null;
    const wc     = words.length;
    const found  = [];

    // Silent failure
    const silentCatch = /catch\s*\([^)]*\)\s*\{[\s]*\}/;
    const emptyCatch  = /catch\s*\([^)]*\)\s*\{\s*(\/\/[^\n]*)?\s*\}/;
    if (silentCatch.test(text) || emptyCatch.test(text)) {
      found.push({ id: 'code-silent-fail', score: 0.95, evidence: 'empty catch block detected' });
    }

    // TODO/FIXME/STUB in production-looking code
    const stubs = matchCount(text, /\b(TODO|FIXME|STUB|PLACEHOLDER|HACK|XXX)\b/g);
    if (stubs > 0) {
      found.push({ id: 'code-stub-prod', score: clamp(stubs * 0.3, 0.3, 0.9), evidence: `${stubs} stub markers found` });
    }

    // Unawaited promise (JS/TS)
    if (['js','ts','javascript','typescript','generic'].includes(language)) {
      const awaitless = /(?<!\bawait\b\s+)\b(fetch|axios\.|db\.|prisma\.|supabase\.)[a-zA-Z]+\(/.test(text);
      if (awaitless) {
        found.push({ id: 'code-js-async-no-await', score: 0.80, evidence: 'async call without visible await' });
      }

      // var in loop with closure
      if (/for\s*\(\s*var\s/.test(text) && /setTimeout|setInterval|\.then|async/.test(text)) {
        found.push({ id: 'code-js-closure-loop', score: 0.75, evidence: 'var loop variable + async closure' });
      }

      // Float equality
      if (/===\s*0\.\d+|0\.\d+\s*===/.test(text)) {
        found.push({ id: 'code-js-floating-point', score: 0.75, evidence: 'float === comparison detected' });
      }
    }

    // Python specific
    if (['python','py'].includes(language)) {
      if (/def\s+\w+\([^)]*=\s*[\[\{]/.test(text)) {
        found.push({ id: 'code-py-mutable-default', score: 0.85, evidence: 'mutable default argument' });
      }
      if (/except\s*:/.test(text) || /except\s+Exception\s*:/.test(text)) {
        found.push({ id: 'code-py-bare-except', score: 0.80, evidence: 'bare except clause' });
      }
    }

    // SQL injection surface — f-strings, concatenation, JS template literals
    {
      const hasSql   = /SELECT|INSERT|UPDATE|DELETE/i.test(text);
      const hasInterp = (
        /f["'][^"']*(?:SELECT|INSERT|UPDATE|DELETE)/i.test(text) ||
        (/["']\s*\+\s*\w/.test(text) && hasSql) ||
        (/`[^`]*\${/.test(text) && hasSql)
      );
      if (hasInterp && hasSql) {
        found.push({ id: 'code-sql-injection', score: 0.95, evidence: 'string interpolation into SQL' });
      }
    }

    // N+1 query pattern
    if (/for\s*\(|\.forEach|\.map/.test(text) && /SELECT|\.query|\.find|\.get/i.test(text)) {
      found.push({ id: 'code-sql-n-plus-one', score: 0.70, evidence: 'query inside loop pattern' });
    }

    // Missing auth on route
    if (/app\.(get|post|put|delete|patch)\s*\(/.test(text) &&
        !/auth|authenticate|protect|middleware|guard|requireLogin/i.test(text)) {
      found.push({ id: 'api-no-auth', score: 0.70, evidence: 'route handler without apparent auth middleware' });
    }

    // Missing transaction on multi-write
    const writes = matchCount(text, /\.(insert|update|delete|save|create|remove)\s*\(/gi);
    if (writes >= 2 && !/BEGIN|TRANSACTION|transaction|session\.start/i.test(text)) {
      found.push({ id: 'code-sql-missing-transaction', score: clamp(writes * 0.15, 0.3, 0.85), evidence: `${writes} writes without transaction` });
    }

    // Implicit environment assumption
    if (/process\.env\.\w+(?!\s*\?\?|\s*\|\||\s*!==\s*undefined)/.test(text)) {
      found.push({ id: 'code-implicit-assumption', score: 0.65, evidence: 'process.env used without fallback or check' });
    }

    // No UUID on module
    if (/export\s+(class|function|const)\s+\w+/.test(text) &&
        !/@uuid|UUID\s*=|uuid:/i.test(text)) {
      found.push({ id: 'code-no-uuid', score: 0.50, evidence: 'exported module without UUID annotation' });
    }

    if (!found.length) return null;
    this._finds += found.length;

    const topScore = Math.max(...found.map(f => f.score));
    return {
      type:       'code_gap',
      domain:     DOMAIN.CODE,
      score:      r4(topScore),
      confidence: conf(topScore),
      finds:      found.map(f => ({
        ...f,
        definition: GAP_CATALOGUE.find(g => g.id === f.id) ?? null,
      })),
      signal_note: 'Code gap detection surfaces structural issues, not style preferences.',
    };
  }

  get totalFinds() { return this._finds; }
}

// ─── QA Gap Detector ─────────────────────────────────────────────────────────

export class QAGapDetector {
  static UUID = 'gh-qa-0000-0000-0000-000000000011';

  constructor() { this._finds = 0; }

  analyze(text) {
    const found = [];

    // Tests without assertions
    const testBlocks = matchCount(text, /\b(it|test|describe)\s*\(/gi);
    const assertions  = matchCount(text, /\b(expect|assert|should\.|toBe|toEqual|assertEqual)/gi);
    if (testBlocks > 0 && assertions === 0) {
      found.push({ id: 'qa-test-coverage-illusion', score: 0.90, evidence: 'test blocks without assertions' });
    }

    // Time dependency
    if (/new Date\(\)|Date\.now\(\)/.test(text) && !/mock|fake|stub|jest\.spyOn/i.test(text)) {
      found.push({ id: 'qa-test-time-dependency', score: 0.75, evidence: 'real Date in test without mock' });
    }

    // Global state mutation between tests
    if (/beforeAll|afterAll/.test(text) && /global\.|process\.|module\./.test(text)) {
      found.push({ id: 'qa-test-ordering', score: 0.70, evidence: 'global state mutation in test lifecycle' });
    }

    // No edge case testing
    if (/null|undefined|empty|boundary|edge/.test(text.toLowerCase()) === false &&
        testBlocks > 0) {
      found.push({ id: 'qa-missing-edge-case', score: 0.60, evidence: 'no visible edge case tests' });
    }

    if (!found.length) return null;
    this._finds += found.length;

    return {
      type:       'qa_gap',
      domain:     DOMAIN.QA,
      score:      r4(Math.max(...found.map(f => f.score))),
      confidence: conf(Math.max(...found.map(f => f.score))),
      finds:      found,
      signal_note: 'QA gaps indicate test structure issues — not test failure.',
    };
  }

  get totalFinds() { return this._finds; }
}

// ─── Universal Text Classifier ────────────────────────────────────────────────

/**
 * Routes text to the right detectors based on domain hints and lexical signals.
 * The main entry point for text-based gap detection.
 */
export class UniversalTextAnalyzer {
  static UUID = 'gh-universal-0000-0000-0000-000000000020';

  constructor() {
    // Verbal / psychological detectors (from original ALK gap-hunter)
    this._weakAssumption = new WeakAssumptionHunter();
    this._shadowField    = new ShadowFieldDetector();
    this._contrastive    = new ContrastiveGapDetector();
    this._negativeSpace  = new NegativeSpaceDetector();
    this._structural     = new StructuralAssumptionAuditor();
    this._reversal       = new ReversalDetector();

    // Domain-specific detectors
    this._code = new CodeGapDetector();
    this._qa   = new QAGapDetector();

    this._history  = [];
    this._totalRuns = 0;
  }

  /**
   * Analyze text in a given domain context.
   * @param {string} text
   * @param {object} opts
   * @param {string} opts.domain   - DOMAIN.* hint (optional — auto-detected if absent)
   * @param {string} opts.language - 'js'|'python'|'sql'|etc (for code domain)
   * @param {number} opts.arousal  - 0–1 (for relational domain; optional)
   */
  analyze(text, opts = {}) {
    if (!text || text.trim().length < 5) return null;
    this._totalRuns++;

    const domain   = opts.domain ?? this._detectDomain(text);
    const language = opts.language ?? 'generic';
    const arousal  = opts.arousal ?? 0;

    this._history.push(text);
    if (this._history.length > 20) this._history.shift();

    const results = [];

    // ── Domain-specific detectors ──────────────────────────────────────────
    if ([DOMAIN.CODE, DOMAIN.QA, DOMAIN.SOFTWARE_ARCH, DOMAIN.AI_ML,
         DOMAIN.API_DESIGN, DOMAIN.DATABASE, DOMAIN.SECURITY,
         ...Object.values(DOMAIN).filter(d => d.startsWith('lang_'))].includes(domain)) {

      const codeResult = this._code.analyze(text, language);
      if (codeResult) results.push(codeResult);

      const qaResult = this._qa.analyze(text);
      if (qaResult) results.push(qaResult);
    }

    // ── Universal psychological/verbal detectors ───────────────────────────
    // Always run — these apply to any domain of text
    const wa = this._weakAssumption.analyze(text, this._history.slice(-4));
    if (wa) results.push({ ...wa, domain });

    const sf = this._shadowField.analyze(text, arousal);
    if (sf) results.push({ ...sf, domain });

    const ct = this._contrastive.analyze(text);
    if (ct) results.push({ ...ct, domain });

    const ns = this._negativeSpace.analyze(text);
    if (ns) results.push({ ...ns, domain });

    const sa = this._structural.analyze(text);
    if (sa) results.push({ ...sa, domain });

    const rv = this._reversal.analyze(text, null, null);
    if (rv) results.push({ ...rv, domain });

    // ── Taxonomy pattern matching ─────────────────────────────────────────
    const taxGaps = this._matchTaxonomy(text, domain);
    if (taxGaps.length) results.push({
      type:       'taxonomy_match',
      domain,
      score:      r4(Math.max(...taxGaps.map(g => g.criticality ?? 0))),
      confidence: CONF.MEDIUM,
      finds:      taxGaps,
      signal_note: 'Pattern matched against universal gap taxonomy.',
    });

    if (!results.length) return null;

    const composite = Math.min(1, mean(results.map(r => r.score ?? 0)) * 1.2);

    return {
      id:        uuid4(),
      ts:        Date.now(),
      domain,
      text_excerpt: text.slice(0, 120),
      score:     r4(composite),
      confidence: conf(composite),
      detectors: results,
      dominant:  results.sort((a,b)=>(b.score??0)-(a.score??0))[0]?.type ?? null,
      signal_note: '§1.1 — All outputs are signals, not diagnoses.',
    };
  }

  _detectDomain(text) {
    const t = text.toLowerCase();

    // Code signals
    if (/function\s*\(|=>\s*\{|class\s+\w+|import\s+|export\s+|const\s+\w+\s*=|async\s+|await\s+/.test(text)) return DOMAIN.CODE;
    if (/def\s+\w+|import\s+\w+|from\s+\w+\s+import/.test(text)) return DOMAIN.LANG_PYTHON;
    if (/SELECT|INSERT|UPDATE|DELETE|CREATE TABLE/i.test(text)) return DOMAIN.LANG_SQL;
    if (/describe\s*\(|it\s*\(|test\s*\(|expect\s*\(|assert/i.test(text)) return DOMAIN.QA;

    // Science signals
    if (/\bp[\s\-]?value\b|statistical|hypothesis|sample\s+size|control\s+group|regression|variance/.test(t)) return DOMAIN.STATISTICS;
    if (/study|research|findings|participants|methodology/.test(t)) return DOMAIN.RESEARCH;

    // Economic signals
    if (/revenue|profit|market|investor|ROI|growth|quarterly|capital/.test(t)) return DOMAIN.BUSINESS;

    // Political signals
    if (/policy|government|legislation|vote|democratic|mandate|regulation/.test(t)) return DOMAIN.POLITICAL;

    // Relational signals
    if (/relationship|partner|feel|emotion|hurt|together|communication/.test(t)) return DOMAIN.RELATIONAL;

    // Identity/existential
    if (/\bi\s+am\b|\bwho\s+i\b|identity|purpose|meaning|belief|values/.test(t)) return DOMAIN.IDENTITY;

    return DOMAIN.EPISTEMOLOGICAL; // default
  }

  _matchTaxonomy(text, domain) {
    const t   = text.toLowerCase();
    const wc  = tokenize(text).length;
    const matched = [];

    for (const gap of GAP_CATALOGUE) {
      // Domain match (broad — include universal patterns always)
      const domainMatch = gap.domain === domain ||
                          gap.domain === DOMAIN.EPISTEMOLOGICAL ||
                          gap.domain === DOMAIN.RECURSIVE;
      if (!domainMatch) continue;

      // Signal pattern matching
      const sig = (gap.signal ?? '').toLowerCase();
      const desc = (gap.description ?? '').toLowerCase();

      // Extract key signal terms (2–4 word phrases)
      const terms = [...sig.split(/[—·,]+/), ...desc.split(/[—·,]+/)]
        .map(s => s.trim())
        .filter(s => s.length > 8 && s.length < 60);

      let hits = 0;
      for (const term of terms.slice(0, 3)) {
        const words = term.split(/\s+/).filter(w => w.length > 4);
        if (words.length < 2) continue;
        // Check if at least 2 key words from the signal are in the text
        const wordHits = words.filter(w => t.includes(w)).length;
        if (wordHits >= 2) hits++;
      }

      if (hits > 0) {
        matched.push({
          ...gap,
          match_strength: r4(hits / 3),
        });
      }
    }

    return matched.slice(0, 5); // top 5 to avoid noise
  }

  get stats() {
    return {
      totalRuns:      this._totalRuns,
      weakAssumption: this._weakAssumption.sessionFinds,
      shadowField:    this._shadowField.sessionFinds,
      contrastive:    this._contrastive.sessionFinds,
      negativeSpace:  this._negativeSpace.sessionFinds,
      structural:     this._structural.sessionFinds,
      reversal:       this._reversal.sessionFinds,
      code:           this._code.totalFinds,
      qa:             this._qa.totalFinds,
    };
  }
}

export { WeakAssumptionHunter, ShadowFieldDetector, ContrastiveGapDetector,
         NegativeSpaceDetector, StructuralAssumptionAuditor, ReversalDetector };
