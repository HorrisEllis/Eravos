/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  GapHunter — Universal Gap Taxonomy  ·  gap-taxonomy.js  ·  v2.0.0    ║
 * ║  UUID: gh-tax-0000-0000-0000-000000000001                              ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * The complete canonical gap taxonomy across every domain of human
 * knowledge, practice, and experience — past, present, and future-facing.
 *
 * Eight universal gap types apply everywhere.
 * Every domain has domain-specific subtypes that extend the base.
 * Criticality weights are calibrated per domain.
 *
 * §1.1  Nothing exists until proven — every gap is a signal, not a verdict.
 * §1.2  Nothing silently fails.
 * §9.1  Outcome contract: every gap detection returns a structured result or null.
 * §9.2  Uncertainty budget: every score carries a confidence tier.
 */

'use strict';

// ─── Universal Gap Types ─────────────────────────────────────────────────────

export const GAP_TYPE = Object.freeze({
  LOGICAL:       'logical',        // conclusion not earned by premise chain
  EVIDENTIAL:    'evidential',     // assertion without supporting source
  TEMPORAL:      'temporal',       // truth assumed across time without verification
  DEFINITIONAL:  'definitional',   // term used before/without definition; conflicting definitions
  REFERENCE:     'reference',      // citation that doesn't exist, doesn't apply, or doesn't say what claimed
  OBLIGATION:    'obligation',     // duty with no enforcement; right with no remedy
  ASSUMPTION:    'assumption',     // silent load-bearing premise — never stated
  CONTRADICTION: 'contradiction',  // two claims that cannot both be true; both present; neither resolved
});

// Universal criticality baseline (domain weights may override)
export const UNIVERSAL_CRITICALITY = Object.freeze({
  [GAP_TYPE.ASSUMPTION]:    1.00,  // the most avoided; always most load-bearing
  [GAP_TYPE.CONTRADICTION]: 0.80,
  [GAP_TYPE.TEMPORAL]:      0.75,
  [GAP_TYPE.LOGICAL]:       0.70,
  [GAP_TYPE.EVIDENTIAL]:    0.65,
  [GAP_TYPE.DEFINITIONAL]:  0.60,
  [GAP_TYPE.OBLIGATION]:    0.55,
  [GAP_TYPE.REFERENCE]:     0.50,
});

// ─── Domain Registry ─────────────────────────────────────────────────────────

export const DOMAIN = Object.freeze({
  // ── Epistemological
  EPISTEMOLOGICAL:     'epistemological',
  LOGIC:               'logic',
  PHILOSOPHY_SCIENCE:  'philosophy_science',
  METACOGNITION:       'metacognition',

  // ── Human Systems
  POLITICAL:           'political',
  LEGAL:               'legal',
  INSTITUTIONAL:       'institutional',
  GOVERNANCE:          'governance',

  // ── Scientific
  RESEARCH:            'research',
  MEDICAL:             'medical',
  STATISTICS:          'statistics',
  ENGINEERING:         'engineering',

  // ── Technology & Code
  CODE:                'code',
  SOFTWARE_ARCH:       'software_arch',
  AI_ML:               'ai_ml',
  SECURITY:            'security',
  QA:                  'qa',
  DEVOPS:              'devops',
  API_DESIGN:          'api_design',
  DATABASE:            'database',
  SYSTEM_DESIGN:       'system_design',

  // ── Coding Languages (specific)
  LANG_JS:             'lang_javascript',
  LANG_TS:             'lang_typescript',
  LANG_PYTHON:         'lang_python',
  LANG_RUST:           'lang_rust',
  LANG_GO:             'lang_go',
  LANG_JAVA:           'lang_java',
  LANG_CPP:            'lang_cpp',
  LANG_SQL:            'lang_sql',
  LANG_GENERIC:        'lang_generic',

  // ── Relational
  INTERPERSONAL:       'interpersonal',
  PSYCHOLOGICAL:       'psychological',
  COMMUNICATION:       'communication',
  ABUSE_MANIPULATION:  'abuse_manipulation',
  RELATIONAL:          'relational',

  // ── Creative
  NARRATIVE:           'narrative',
  ART_DESIGN:          'art_design',
  MUSIC:               'music',
  INNOVATION:          'innovation',
  WRITING:             'writing',

  // ── Economic
  BUSINESS:            'business',
  FINANCE:             'finance',
  STRATEGY:            'strategy',
  CONTRACTS:           'contracts',
  MARKETS:             'markets',

  // ── Existential
  IDENTITY:            'identity',
  VALUES:              'values',
  BELIEF:              'belief',
  PURPOSE:             'purpose',
  ETHICS:              'ethics',
  MORAL:               'moral',

  // ── Organisational
  ORGANISATIONAL:      'organisational',
  LEADERSHIP:          'leadership',
  TEAM:                'team',
  PROCESS:             'process',

  // ── Life Domains
  HEALTH:              'health',
  RELATIONSHIPS:       'relationships',
  PARENTING:           'parenting',
  EDUCATION:           'education',
  CAREER:              'career',
  FINANCES_PERSONAL:   'finances_personal',
  GRIEF:               'grief',
  MEANING:             'meaning',

  // ── Future-Facing
  FUTURES:             'futures',
  CLIMATE:             'climate',
  AI_GOVERNANCE:       'ai_governance',
  CIVILISATION:        'civilisation',

  // ── Recursive
  RECURSIVE:           'recursive',
  META:                'meta',
});

// ─── Domain-Specific Gap Catalogues ─────────────────────────────────────────

/**
 * Each entry: { id, type, subtype, description, signal, detection, criticality, domain, example? }
 * criticality: 0.0–1.0 (overrides universal if set)
 */

export const GAP_CATALOGUE = [

  // ════════════════════════════════════════════════════════
  // EPISTEMOLOGICAL
  // ════════════════════════════════════════════════════════
  {
    id: 'epist-circular',
    domain: DOMAIN.EPISTEMOLOGICAL,
    type: GAP_TYPE.LOGICAL,
    subtype: 'circular_reasoning',
    description: 'Conclusion used as premise for itself',
    signal: 'Conclusion node appears in its own premise chain — cycle in causal graph',
    detection: 'conclusion ∈ premise_chain(conclusion)',
    criticality: 0.90,
    example: '"The Bible is true because the Bible says it\'s true"',
  },
  {
    id: 'epist-closure',
    domain: DOMAIN.EPISTEMOLOGICAL,
    type: GAP_TYPE.ASSUMPTION,
    subtype: 'epistemic_closure',
    description: 'Belief system sealed against disconfirmation — no update path exists',
    signal: 'Counter-evidence nodes have no causal path to belief update',
    detection: 'all contradictory evidence rerouted to confirmation node',
    criticality: 0.95,
  },
  {
    id: 'epist-unfalsifiable',
    domain: DOMAIN.EPISTEMOLOGICAL,
    type: GAP_TYPE.EVIDENTIAL,
    subtype: 'unfalsifiability',
    description: 'Claim structured so no evidence could disprove it',
    signal: 'Falsifiability node absent from claim structure',
    detection: 'no defined disconfirmation condition',
    criticality: 0.85,
    example: '"God works in mysterious ways"',
  },
  {
    id: 'epist-induction',
    domain: DOMAIN.EPISTEMOLOGICAL,
    type: GAP_TYPE.TEMPORAL,
    subtype: 'induction_gap',
    description: 'Pattern from finite sample assumed to hold universally and indefinitely',
    signal: 'Universal claim with finite evidential basis',
    detection: 'universal_quantifier over finite_sample without inductive warrant',
    criticality: 0.75,
    example: '"This strategy has always worked — it will work now"',
  },
  {
    id: 'epist-authority',
    domain: DOMAIN.EPISTEMOLOGICAL,
    type: GAP_TYPE.REFERENCE,
    subtype: 'authority_gap',
    description: 'Expert consensus cited as proof without examining quality or applicability',
    signal: 'Authority reference node has no specificity',
    detection: 'consensus_claim without source_chain',
    criticality: 0.65,
    example: '"Scientists agree..." (which scientists? on what?)',
  },
  {
    id: 'epist-framing',
    domain: DOMAIN.EPISTEMOLOGICAL,
    type: GAP_TYPE.ASSUMPTION,
    subtype: 'framing_gap',
    description: 'The frame itself is never questioned — determines what answers are possible',
    signal: 'Problem statement node has no alternative framing',
    detection: 'single frame node with no alternatives registered',
    criticality: 0.85,
    example: '"How do we fix this person?" vs "What is this person responding to?"',
  },
  {
    id: 'epist-observer',
    domain: DOMAIN.EPISTEMOLOGICAL,
    type: GAP_TYPE.ASSUMPTION,
    subtype: 'observation_effect',
    description: 'Measurement assumed not to affect the thing measured',
    signal: 'Measurement methodology has no observer-effect correction',
    detection: 'observer_neutrality assumed without verification',
    criticality: 0.70,
  },

  // ════════════════════════════════════════════════════════
  // CODE — LANGUAGE-AGNOSTIC
  // ════════════════════════════════════════════════════════
  {
    id: 'code-silent-fail',
    domain: DOMAIN.CODE,
    type: GAP_TYPE.OBLIGATION,
    subtype: 'silent_failure',
    description: 'Error caught and swallowed — no logging, no propagation, no trace',
    signal: 'catch block with empty body or console.log only',
    detection: 'try/catch with no rethrow, no structured error event, no alert',
    criticality: 1.00,
    example: 'try { ... } catch(e) {} // axiom §1.2 violation',
  },
  {
    id: 'code-stub-prod',
    domain: DOMAIN.CODE,
    type: GAP_TYPE.OBLIGATION,
    subtype: 'stub_in_production',
    description: 'Placeholder or TODO shipped to production',
    signal: 'TODO/FIXME/STUB/PLACEHOLDER in code path that executes in production',
    detection: 'stub marker in non-test, non-dev file path',
    criticality: 0.95,
  },
  {
    id: 'code-undefined-contract',
    domain: DOMAIN.CODE,
    type: GAP_TYPE.DEFINITIONAL,
    subtype: 'undefined_contract',
    description: 'Function called with no documented or enforced input contract',
    signal: 'No param types, no validation, no schema — callers assume shape',
    detection: 'public function with zero input validation and no type annotation',
    criticality: 0.80,
  },
  {
    id: 'code-missing-test',
    domain: DOMAIN.QA,
    type: GAP_TYPE.EVIDENTIAL,
    subtype: 'missing_test_coverage',
    description: 'Code path exists with no corresponding test',
    signal: 'Executed branch with zero test coverage',
    detection: 'coverage < threshold on non-trivial branch',
    criticality: 0.75,
  },
  {
    id: 'code-race-condition',
    domain: DOMAIN.CODE,
    type: GAP_TYPE.TEMPORAL,
    subtype: 'race_condition',
    description: 'Shared state accessed by concurrent operations with no synchronisation',
    signal: 'Two async operations both read-then-write same resource without lock',
    detection: 'concurrent_write + shared_resource + no_mutex',
    criticality: 0.90,
  },
  {
    id: 'code-tech-debt',
    domain: DOMAIN.CODE,
    type: GAP_TYPE.TEMPORAL,
    subtype: 'technical_debt',
    description: 'Shortcut creates future obligation — obligation not recorded or planned for',
    signal: 'Fast path taken with no corresponding debt registration',
    detection: 'shortcut_pattern without ledger entry or issue ticket',
    criticality: 0.70,
  },
  {
    id: 'code-implicit-assumption',
    domain: DOMAIN.CODE,
    type: GAP_TYPE.ASSUMPTION,
    subtype: 'implicit_env_assumption',
    description: 'Code assumes environment, state, or ordering that is never verified',
    signal: 'Hardcoded path, assumed service availability, assumed call order',
    detection: 'env_reference without validation; service call without availability check',
    criticality: 0.85,
    example: 'assuming process.env.PORT is always set; assuming DB is ready on startup',
  },
  {
    id: 'code-abstraction-leak',
    domain: DOMAIN.CODE,
    type: GAP_TYPE.ASSUMPTION,
    subtype: 'abstraction_leak',
    description: 'Abstraction assumed to hide complexity completely — edge cases leak through',
    signal: 'Callers depending on internal implementation details of abstraction',
    detection: 'abstraction boundary violated; internal state accessed directly',
    criticality: 0.75,
  },
  {
    id: 'code-scale-assumption',
    domain: DOMAIN.CODE,
    type: GAP_TYPE.TEMPORAL,
    subtype: 'scale_gap',
    description: 'Behaviour at small scale assumed to hold at large scale',
    signal: 'N=10 design deployed to N=10M without load model',
    detection: 'no load test; no capacity model; linear extrapolation on non-linear system',
    criticality: 0.80,
  },
  {
    id: 'code-security-assumption',
    domain: DOMAIN.SECURITY,
    type: GAP_TYPE.ASSUMPTION,
    subtype: 'security_assumption',
    description: 'Security model assumes threat model that doesn\'t match actual threat landscape',
    signal: '"Our users won\'t try to break it"; "internal network is trusted"',
    detection: 'threat_model missing adversarial assumption; trust boundary unverified',
    criticality: 0.95,
  },
  {
    id: 'code-no-uuid',
    domain: DOMAIN.CODE,
    type: GAP_TYPE.OBLIGATION,
    subtype: 'missing_uuid_hook',
    description: 'Module/feature has no UUID or hook — cannot be tracked, audited, or wired',
    signal: 'Production module with no @uuid, no @hook, no bus registration',
    detection: 'module exported without UUID identifier',
    criticality: 0.85,
  },
  {
    id: 'code-monkey-patch',
    domain: DOMAIN.CODE,
    type: GAP_TYPE.CONTRADICTION,
    subtype: 'monkey_patch',
    description: 'Runtime mutation of objects/prototypes not owned by caller',
    signal: 'Prototype or global object modified after load',
    detection: 'Object.prototype mutation; global namespace pollution',
    criticality: 0.90,
  },
  {
    id: 'code-missing-error-boundary',
    domain: DOMAIN.CODE,
    type: GAP_TYPE.OBLIGATION,
    subtype: 'missing_error_boundary',
    description: 'Error propagates uncaught to user or crashes process with no graceful handling',
    signal: 'No try/catch on I/O, network, parse operations; unhandledRejection not handled',
    detection: 'async path without error handler; missing fallback UI on exception',
    criticality: 0.85,
  },

  // ── JavaScript specific
  {
    id: 'code-js-typeof-null',
    domain: DOMAIN.LANG_JS,
    type: GAP_TYPE.DEFINITIONAL,
    subtype: 'typeof_null_bug',
    description: 'typeof null === "object" — historical JS bug treated as truth',
    signal: 'null check via typeof without explicit === null guard',
    detection: 'typeof x === "object" without null guard in null-possible context',
    criticality: 0.70,
  },
  {
    id: 'code-js-floating-point',
    domain: DOMAIN.LANG_JS,
    type: GAP_TYPE.ASSUMPTION,
    subtype: 'floating_point_equality',
    description: '0.1 + 0.2 !== 0.3 — float equality assumed without epsilon comparison',
    signal: 'Direct === comparison of computed floats in financial or precision context',
    detection: 'float === float without epsilon tolerance',
    criticality: 0.75,
    example: 'if (total === 0.30) — fails silently',
  },
  {
    id: 'code-js-async-no-await',
    domain: DOMAIN.LANG_JS,
    type: GAP_TYPE.OBLIGATION,
    subtype: 'unawaited_promise',
    description: 'Promise returned but not awaited — errors silently swallowed',
    signal: 'async function call result discarded without await or .catch()',
    detection: 'floating promise in async context without error handling',
    criticality: 0.90,
  },
  {
    id: 'code-js-closure-loop',
    domain: DOMAIN.LANG_JS,
    type: GAP_TYPE.TEMPORAL,
    subtype: 'closure_in_loop',
    description: 'Closure captures loop variable by reference — all callbacks see final value',
    signal: 'var declared loop variable captured in async callback inside loop',
    detection: 'for (var i...) { setTimeout/async fn referencing i }',
    criticality: 0.75,
  },
  {
    id: 'code-js-this-binding',
    domain: DOMAIN.LANG_JS,
    type: GAP_TYPE.ASSUMPTION,
    subtype: 'this_binding_loss',
    description: 'this assumed bound but context is lost on method extraction or callback',
    signal: 'Method extracted from object; this is undefined or global',
    detection: 'obj.method passed as callback without .bind(obj) or arrow wrapper',
    criticality: 0.70,
  },
  {
    id: 'code-js-mutation-shared',
    domain: DOMAIN.LANG_JS,
    type: GAP_TYPE.ASSUMPTION,
    subtype: 'shared_object_mutation',
    description: 'Object passed by reference mutated — caller\'s state changes unexpectedly',
    signal: 'Array/Object parameter mutated in-place without documentation',
    detection: 'parameter.push() / parameter.property = x without defensive copy',
    criticality: 0.75,
  },

  // ── TypeScript specific
  {
    id: 'code-ts-any-escape',
    domain: DOMAIN.LANG_TS,
    type: GAP_TYPE.ASSUMPTION,
    subtype: 'any_type_escape',
    description: 'TypeScript\'s type system bypassed via any — errors deferred to runtime',
    signal: 'any type in non-boundary code',
    detection: 'as any / : any in non-interop context',
    criticality: 0.80,
  },
  {
    id: 'code-ts-non-null-assertion',
    domain: DOMAIN.LANG_TS,
    type: GAP_TYPE.ASSUMPTION,
    subtype: 'non_null_assertion',
    description: 'Null check bypassed with ! operator — runtime crash if assumption wrong',
    signal: 'value! in code that could return null/undefined',
    detection: 'x! where x could be null based on type',
    criticality: 0.80,
  },
  {
    id: 'code-ts-type-widening',
    domain: DOMAIN.LANG_TS,
    type: GAP_TYPE.DEFINITIONAL,
    subtype: 'type_widening',
    description: 'Type inferred as broader than intended — narrowing gaps allow invalid values',
    signal: 'const inferred as string instead of literal type',
    detection: 'unintended widening in inference context',
    criticality: 0.65,
  },

  // ── Python specific
  {
    id: 'code-py-mutable-default',
    domain: DOMAIN.LANG_PYTHON,
    type: GAP_TYPE.ASSUMPTION,
    subtype: 'mutable_default_arg',
    description: 'Mutable default argument shared across all calls — state accumulates',
    signal: 'def f(x=[]) or def f(x={}) — mutable default',
    detection: 'mutable object as default parameter value',
    criticality: 0.85,
    example: 'def append_to(element, to=[]): — classic Python footgun',
  },
  {
    id: 'code-py-late-binding',
    domain: DOMAIN.LANG_PYTHON,
    type: GAP_TYPE.TEMPORAL,
    subtype: 'late_binding_closure',
    description: 'Lambda/closure in loop binds variable at call time, not definition time',
    signal: 'lambda i=i pattern absent — i evaluated late',
    detection: 'lambda referencing loop variable without default capture',
    criticality: 0.75,
  },
  {
    id: 'code-py-bare-except',
    domain: DOMAIN.LANG_PYTHON,
    type: GAP_TYPE.OBLIGATION,
    subtype: 'bare_except',
    description: 'except: with no exception type catches everything including KeyboardInterrupt',
    signal: 'bare except clause in production code',
    detection: 'except: or except Exception: swallowing without logging',
    criticality: 0.90,
  },
  {
    id: 'code-py-gil-assumption',
    domain: DOMAIN.LANG_PYTHON,
    type: GAP_TYPE.ASSUMPTION,
    subtype: 'gil_assumption',
    description: 'Python GIL assumed to protect shared state — false for I/O-bound multi-threaded',
    signal: 'shared mutable state in multi-threaded Python without explicit locking',
    detection: 'threading + shared_dict without Lock',
    criticality: 0.80,
  },

  // ── SQL / Database
  {
    id: 'code-sql-injection',
    domain: DOMAIN.LANG_SQL,
    type: GAP_TYPE.ASSUMPTION,
    subtype: 'sql_injection_surface',
    description: 'User input concatenated into SQL — assumption that input is safe',
    signal: 'String interpolation / concatenation into SQL string',
    detection: 'f"SELECT ... {user_input}" or "SELECT ... " + input',
    criticality: 1.00,
  },
  {
    id: 'code-sql-n-plus-one',
    domain: DOMAIN.DATABASE,
    type: GAP_TYPE.TEMPORAL,
    subtype: 'n_plus_one_query',
    description: 'Query executed inside loop — N+1 database calls instead of 1',
    signal: 'SELECT inside for/map over result set',
    detection: 'db.query inside iteration over previous query result',
    criticality: 0.85,
  },
  {
    id: 'code-sql-missing-index',
    domain: DOMAIN.DATABASE,
    type: GAP_TYPE.EVIDENTIAL,
    subtype: 'missing_index',
    description: 'Column queried in WHERE/JOIN without index — full table scan at scale',
    signal: 'EXPLAIN shows Seq Scan on large table',
    detection: 'WHERE/JOIN on non-indexed column with no EXPLAIN analysis',
    criticality: 0.75,
  },
  {
    id: 'code-sql-missing-transaction',
    domain: DOMAIN.DATABASE,
    type: GAP_TYPE.OBLIGATION,
    subtype: 'missing_transaction',
    description: 'Multiple related writes not wrapped in transaction — partial state on failure',
    signal: 'Two writes that must succeed or fail together without BEGIN/COMMIT',
    detection: 'multi-step write without transaction boundary',
    criticality: 0.90,
  },

  // ── QA / Testing
  {
    id: 'qa-test-coverage-illusion',
    domain: DOMAIN.QA,
    type: GAP_TYPE.EVIDENTIAL,
    subtype: 'coverage_illusion',
    description: 'High coverage percentage with no meaningful assertions — tests that can\'t fail',
    signal: '90%+ line coverage with assert-free tests',
    detection: 'test functions without assertions; coverage metric divorced from correctness',
    criticality: 0.90,
  },
  {
    id: 'qa-test-time-dependency',
    domain: DOMAIN.QA,
    type: GAP_TYPE.TEMPORAL,
    subtype: 'time_dependent_test',
    description: 'Test behaviour changes based on clock — flaky at midnight, year-end, DST',
    signal: 'new Date() or Date.now() called in test without mock',
    detection: 'time-sensitive assertion without time injection',
    criticality: 0.80,
  },
  {
    id: 'qa-test-ordering',
    domain: DOMAIN.QA,
    type: GAP_TYPE.ASSUMPTION,
    subtype: 'test_order_dependency',
    description: 'Tests pass only in specific order — shared mutable state between tests',
    signal: 'Test fails when run in isolation but passes in suite',
    detection: 'shared state not reset between tests; global mutation',
    criticality: 0.85,
  },
  {
    id: 'qa-missing-edge-case',
    domain: DOMAIN.QA,
    type: GAP_TYPE.EVIDENTIAL,
    subtype: 'missing_edge_case',
    description: 'Happy path tested; edge cases (empty, null, max, min, concurrent) not tested',
    signal: 'Zero tests for boundary conditions',
    detection: 'no test for null input, empty collection, max value, concurrent access',
    criticality: 0.80,
  },
  {
    id: 'qa-mock-not-reality',
    domain: DOMAIN.QA,
    type: GAP_TYPE.ASSUMPTION,
    subtype: 'mock_divergence',
    description: 'Mock no longer matches the real dependency — tests pass, production fails',
    signal: 'Mocked interface out of sync with actual interface',
    detection: 'mock not updated when dependency interface changed',
    criticality: 0.90,
  },
  {
    id: 'qa-no-load-test',
    domain: DOMAIN.QA,
    type: GAP_TYPE.TEMPORAL,
    subtype: 'no_load_test',
    description: 'System ships without ever being tested under production-representative load',
    signal: 'Zero load tests in CI/CD pipeline before production deployment',
    detection: 'no k6/locust/jmeter in pipeline; no capacity model',
    criticality: 0.80,
  },
  {
    id: 'qa-integration-gap',
    domain: DOMAIN.QA,
    type: GAP_TYPE.EVIDENTIAL,
    subtype: 'integration_gap',
    description: 'Units tested in isolation; integration between them never tested',
    signal: 'All unit tests passing; system fails at module boundaries',
    detection: 'no integration tests; 100% unit, 0% integration coverage',
    criticality: 0.85,
  },

  // ── API Design
  {
    id: 'api-breaking-change',
    domain: DOMAIN.API_DESIGN,
    type: GAP_TYPE.OBLIGATION,
    subtype: 'breaking_change',
    description: 'API contract changed without versioning — callers silently break',
    signal: 'Response shape changed; field removed; required field added',
    detection: 'schema diff without version bump; no deprecation notice',
    criticality: 0.95,
  },
  {
    id: 'api-no-rate-limit',
    domain: DOMAIN.API_DESIGN,
    type: GAP_TYPE.OBLIGATION,
    subtype: 'no_rate_limit',
    description: 'Public API endpoint with no rate limiting — DoS surface',
    signal: 'No rate limit header; no throttle middleware on public endpoint',
    detection: 'public route without rate limiter',
    criticality: 0.85,
  },
  {
    id: 'api-no-auth',
    domain: DOMAIN.API_DESIGN,
    type: GAP_TYPE.ASSUMPTION,
    subtype: 'missing_auth',
    description: 'Endpoint assumes caller is authenticated without verifying',
    signal: 'Route handler with no auth middleware',
    detection: 'handler before auth middleware in chain; no token validation',
    criticality: 1.00,
  },

  // ── Software Architecture
  {
    id: 'arch-single-point-failure',
    domain: DOMAIN.SOFTWARE_ARCH,
    type: GAP_TYPE.ASSUMPTION,
    subtype: 'single_point_of_failure',
    description: 'Critical system component with no fallback — one failure = total outage',
    signal: 'Single DB, single queue, single service with no replica or fallback',
    detection: 'SPOF in architecture diagram without documented mitigation',
    criticality: 0.95,
  },
  {
    id: 'arch-missing-idempotency',
    domain: DOMAIN.SOFTWARE_ARCH,
    type: GAP_TYPE.ASSUMPTION,
    subtype: 'missing_idempotency',
    description: 'Operation assumed to execute once — network retry causes duplicate execution',
    signal: 'No idempotency key on mutation endpoints; no deduplication',
    detection: 'POST/PUT handler without idempotency check in retry-possible context',
    criticality: 0.85,
  },
  {
    id: 'arch-coupling',
    domain: DOMAIN.SOFTWARE_ARCH,
    type: GAP_TYPE.OBLIGATION,
    subtype: 'tight_coupling',
    description: 'Modules directly call each other — change in one silently breaks other',
    signal: 'Direct import/call across module boundaries without bus or interface',
    detection: 'cross-module direct invocation without event bus (§5.7 violation)',
    criticality: 0.80,
  },

  // ── AI/ML
  {
    id: 'ai-spec-gap',
    domain: DOMAIN.AI_ML,
    type: GAP_TYPE.DEFINITIONAL,
    subtype: 'specification_gap',
    description: 'System optimises for specified metric while violating unstated constraints',
    signal: 'Goodhart\'s Law — metric becomes target, ceases to measure what matters',
    detection: 'optimisation target without constraint nodes for unstated values',
    criticality: 0.90,
  },
  {
    id: 'ai-distribution-shift',
    domain: DOMAIN.AI_ML,
    type: GAP_TYPE.TEMPORAL,
    subtype: 'distribution_shift',
    description: 'Model trained on past distribution deployed on shifted real-world distribution',
    signal: 'Training data does not represent deployment environment',
    detection: 'no distribution monitoring; training vs deployment gap uncharted',
    criticality: 0.90,
  },
  {
    id: 'ai-hallucination',
    domain: DOMAIN.AI_ML,
    type: GAP_TYPE.EVIDENTIAL,
    subtype: 'hallucination',
    description: 'Model generates confident output not grounded in training or reality',
    signal: 'High-confidence output with no source; fabricated citations',
    detection: 'output not verifiable against grounding source',
    criticality: 0.95,
  },
  {
    id: 'ai-alignment',
    domain: DOMAIN.AI_ML,
    type: GAP_TYPE.OBLIGATION,
    subtype: 'alignment_gap',
    description: 'AI optimises stated objective while violating unstated but important values',
    signal: 'Maximize engagement → maximize outrage; proxy captures target imperfectly',
    detection: 'optimisation metric diverges from actual human value over time',
    criticality: 1.00,
  },

  // ════════════════════════════════════════════════════════
  // SCIENTIFIC / RESEARCH
  // ════════════════════════════════════════════════════════
  {
    id: 'sci-replication',
    domain: DOMAIN.RESEARCH,
    type: GAP_TYPE.EVIDENTIAL,
    subtype: 'replication_gap',
    description: 'Single finding treated as established fact before replication',
    detection: 'single_study presented as consensus; replication_count = 1',
    criticality: 0.85,
  },
  {
    id: 'sci-publication-bias',
    domain: DOMAIN.RESEARCH,
    type: GAP_TYPE.REFERENCE,
    subtype: 'publication_bias',
    description: 'Literature misrepresents reality — null results not published',
    detection: 'literature review with no null-result correction',
    criticality: 0.80,
  },
  {
    id: 'sci-correlation-causation',
    domain: DOMAIN.RESEARCH,
    type: GAP_TYPE.LOGICAL,
    subtype: 'correlation_causation',
    description: 'Co-occurrence treated as causal without mechanism',
    detection: 'correlation_claim with causal_edge without mechanism_node',
    criticality: 0.80,
  },
  {
    id: 'sci-p-hacking',
    domain: DOMAIN.STATISTICS,
    type: GAP_TYPE.EVIDENTIAL,
    subtype: 'p_hacking',
    description: 'Multiple tests run until significance found; single result reported',
    detection: 'significant_result without multiple-comparison correction',
    criticality: 0.85,
  },
  {
    id: 'sci-sample-bias',
    domain: DOMAIN.RESEARCH,
    type: GAP_TYPE.ASSUMPTION,
    subtype: 'sample_bias',
    description: 'Finding from non-representative sample generalised to broader population',
    detection: 'population_claim with unrepresentative sample_node',
    criticality: 0.80,
    example: 'WEIRD bias — Western, Educated, Industrialised, Rich, Democratic sample → humanity',
  },
  {
    id: 'sci-operationalisation',
    domain: DOMAIN.RESEARCH,
    type: GAP_TYPE.DEFINITIONAL,
    subtype: 'operationalisation_gap',
    description: 'Abstract concept measured in a way that may not capture the concept',
    detection: 'measurement_definition ≠ concept_definition',
    criticality: 0.75,
    example: '"Intelligence" measured by IQ; "productivity" measured by hours',
  },
  {
    id: 'sci-funding-bias',
    domain: DOMAIN.RESEARCH,
    type: GAP_TYPE.ASSUMPTION,
    subtype: 'funding_bias',
    description: 'Research conclusions skewed toward funder\'s interests — assumed neutral',
    detection: 'source_node has undisclosed interest in outcome',
    criticality: 0.80,
  },

  // ════════════════════════════════════════════════════════
  // POLITICAL / LEGAL / GOVERNANCE
  // ════════════════════════════════════════════════════════
  {
    id: 'pol-enforcement',
    domain: DOMAIN.POLITICAL,
    type: GAP_TYPE.OBLIGATION,
    subtype: 'enforcement_gap',
    description: 'Law or regulation with no enforcement mechanism — or mechanism that fails',
    detection: 'obligation_node without enforcement_path',
    criticality: 0.85,
  },
  {
    id: 'pol-accountability',
    domain: DOMAIN.POLITICAL,
    type: GAP_TYPE.OBLIGATION,
    subtype: 'accountability_gap',
    description: 'Power exercised without corresponding accountability',
    detection: 'power_node without accountability_edge; or accountability routes to same actor',
    criticality: 0.90,
  },
  {
    id: 'pol-policy-mechanism',
    domain: DOMAIN.POLITICAL,
    type: GAP_TYPE.LOGICAL,
    subtype: 'policy_mechanism_gap',
    description: 'Policy assumed to produce intended effect — mechanism never established',
    detection: 'policy_node → outcome_node without mechanism_node',
    criticality: 0.80,
  },
  {
    id: 'pol-mandate',
    domain: DOMAIN.POLITICAL,
    type: GAP_TYPE.REFERENCE,
    subtype: 'mandate_gap',
    description: 'Action claimed to have mandate that was never explicitly given',
    detection: 'authority_claim without direct consent_chain to specific action',
    criticality: 0.75,
  },
  {
    id: 'pol-representation',
    domain: DOMAIN.POLITICAL,
    type: GAP_TYPE.EVIDENTIAL,
    subtype: 'representation_gap',
    description: 'Decision-makers claimed to represent a group whose preferences differ',
    detection: 'representative_claim contradicts documented preference data',
    criticality: 0.80,
  },
  {
    id: 'pol-incrementalism',
    domain: DOMAIN.POLITICAL,
    type: GAP_TYPE.TEMPORAL,
    subtype: 'incrementalism_gap',
    description: 'Small changes assumed to produce linear outcomes — ignores threshold effects',
    detection: 'linear_assumption on non-linear_system; threshold_effects not modeled',
    criticality: 0.75,
    example: '"We just need a few more reforms" (when system needs structural change)',
  },

  // ════════════════════════════════════════════════════════
  // ECONOMIC / FINANCIAL
  // ════════════════════════════════════════════════════════
  {
    id: 'econ-externality',
    domain: DOMAIN.FINANCE,
    type: GAP_TYPE.ASSUMPTION,
    subtype: 'externality_gap',
    description: 'Cost shifted to parties not in the transaction — treated as if it doesn\'t exist',
    detection: 'transaction_model without third_party_cost node',
    criticality: 0.85,
  },
  {
    id: 'econ-risk-assumption',
    domain: DOMAIN.FINANCE,
    type: GAP_TYPE.ASSUMPTION,
    subtype: 'risk_assumption',
    description: 'Risk assumed away rather than priced or managed',
    detection: 'risk_node absent from decision_model; tail_risk excluded',
    criticality: 0.90,
    example: '"This time is different"; "Real estate always goes up"',
  },
  {
    id: 'econ-incentive-misalign',
    domain: DOMAIN.BUSINESS,
    type: GAP_TYPE.LOGICAL,
    subtype: 'incentive_misalignment',
    description: 'System rewards behaviour it doesn\'t actually want',
    detection: 'reward_node → behaviour_node ≠ stated_goal_node',
    criticality: 0.85,
    example: 'Banks paid on loan volume, not quality; doctors paid per procedure, not outcome',
  },
  {
    id: 'econ-sunk-cost',
    domain: DOMAIN.FINANCE,
    type: GAP_TYPE.LOGICAL,
    subtype: 'sunk_cost_fallacy',
    description: 'Past cost treated as forward-relevant decision input',
    detection: 'historical_cost_node has causal_edge to future_decision_node',
    criticality: 0.75,
  },
  {
    id: 'econ-moral-hazard',
    domain: DOMAIN.FINANCE,
    type: GAP_TYPE.OBLIGATION,
    subtype: 'moral_hazard',
    description: 'Risk-taking increased when consequences transferred to another party',
    detection: 'risk_node with consequence_edge pointing to third_party',
    criticality: 0.85,
  },
  {
    id: 'econ-market-structure',
    domain: DOMAIN.MARKETS,
    type: GAP_TYPE.ASSUMPTION,
    subtype: 'market_structure_gap',
    description: 'Market competition assumed without establishing competitive conditions exist',
    detection: 'market_efficiency_assumption without competitive_condition_verification',
    criticality: 0.80,
    example: '"The market will solve this" (in monopoly / regulatory capture context)',
  },

  // ════════════════════════════════════════════════════════
  // RELATIONAL / PSYCHOLOGICAL
  // ════════════════════════════════════════════════════════
  {
    id: 'rel-intent-impact',
    domain: DOMAIN.RELATIONAL,
    type: GAP_TYPE.LOGICAL,
    subtype: 'intent_impact_gap',
    description: 'Good intent claimed as proof that harm did not occur',
    detection: 'intent_claim positioned as negation of impact_claim',
    criticality: 0.85,
    example: '"I didn\'t mean it that way so you shouldn\'t feel hurt"',
  },
  {
    id: 'rel-gaslighting',
    domain: DOMAIN.ABUSE_MANIPULATION,
    type: GAP_TYPE.EVIDENTIAL,
    subtype: 'gaslighting',
    description: 'Systematic injection of false premises into target\'s claim graph',
    detection: 'denial_pattern + memory_attack + pathologising + isolation across sustained sequence',
    criticality: 0.95,
  },
  {
    id: 'rel-future-faking',
    domain: DOMAIN.ABUSE_MANIPULATION,
    type: GAP_TYPE.OBLIGATION,
    subtype: 'future_faking',
    description: 'Promises about future made to secure present compliance — not intended to be kept',
    detection: 'obligation_node(future) without enforcement_path + prior identical unresolved obligations',
    criticality: 0.90,
  },
  {
    id: 'rel-assumption-expectation',
    domain: DOMAIN.COMMUNICATION,
    type: GAP_TYPE.ASSUMPTION,
    subtype: 'unexpressed_expectation',
    description: 'Expectation held without being communicated — other party cannot know',
    detection: 'expectation_node without communication_event',
    criticality: 0.85,
    example: 'Assuming partner knows what you need without saying it',
  },
  {
    id: 'rel-alignment-skip',
    domain: DOMAIN.COMMUNICATION,
    type: GAP_TYPE.LOGICAL,
    subtype: 'alignment_layer_skip',
    description: 'Trying to resolve Layer 5 (what happens next) when gap is at Layer 1 (what happened)',
    detection: 'solution_node before acknowledgment_node; factual_gap unresolved',
    criticality: 0.80,
  },

  // ════════════════════════════════════════════════════════
  // IDENTITY / EXISTENTIAL
  // ════════════════════════════════════════════════════════
  {
    id: 'exist-identity-assumption',
    domain: DOMAIN.IDENTITY,
    type: GAP_TYPE.ASSUMPTION,
    subtype: 'identity_assumption',
    description: 'Core belief about self treated as fact — never examined as a belief',
    detection: 'identity_claim without evidential basis; or evidence outdated (temporal gap)',
    criticality: 0.90,
    example: '"I\'m not creative"; "I\'m bad with money"; "This is just who I am"',
  },
  {
    id: 'exist-values-gap',
    domain: DOMAIN.VALUES,
    type: GAP_TYPE.CONTRADICTION,
    subtype: 'values_behaviour_gap',
    description: 'Stated values contradict revealed preferences',
    detection: 'stated_value_node contradicts behavioural_evidence_node',
    criticality: 0.85,
    example: '"Family is my priority" + 80-hour work weeks',
  },
  {
    id: 'exist-meaning-spof',
    domain: DOMAIN.PURPOSE,
    type: GAP_TYPE.ASSUMPTION,
    subtype: 'meaning_single_point_failure',
    description: 'Source of meaning assumed stable — no contingency if it disappears',
    detection: 'meaning_source_node without fallback; single-point-of-failure in meaning structure',
    criticality: 0.85,
  },
  {
    id: 'exist-purpose-gap',
    domain: DOMAIN.PURPOSE,
    type: GAP_TYPE.LOGICAL,
    subtype: 'purpose_gap',
    description: 'Actions not connected to any stated purpose — means/ends chain broken',
    detection: 'action_nodes without causal_path to purpose_node',
    criticality: 0.80,
  },
  {
    id: 'exist-temporal-self',
    domain: DOMAIN.IDENTITY,
    type: GAP_TYPE.TEMPORAL,
    subtype: 'temporal_self_concept',
    description: 'Self-concept based on past version of self — doesn\'t reflect current capability',
    detection: 'self_concept_node without recent evidence update',
    criticality: 0.80,
    example: 'Operating from shame about who you were at 15',
  },
  {
    id: 'exist-existential-avoidance',
    domain: DOMAIN.MEANING,
    type: GAP_TYPE.ASSUMPTION,
    subtype: 'existential_avoidance',
    description: 'Questions about mortality, meaning, freedom systematically avoided — silently driving decisions',
    detection: 'major_decision_node without examined existential premise',
    criticality: 0.85,
  },

  // ════════════════════════════════════════════════════════
  // ETHICS / MORAL
  // ════════════════════════════════════════════════════════
  {
    id: 'eth-is-ought',
    domain: DOMAIN.ETHICS,
    type: GAP_TYPE.LOGICAL,
    subtype: 'is_ought_gap',
    description: '"What is" used to derive "what ought to be" without acknowledging the jump',
    detection: 'descriptive_claim has direct causal_edge to normative_claim',
    criticality: 0.85,
    example: '"Evolution is competitive, therefore competition is natural and good"',
  },
  {
    id: 'eth-framework-assumption',
    domain: DOMAIN.ETHICS,
    type: GAP_TYPE.ASSUMPTION,
    subtype: 'moral_framework_assumption',
    description: 'Ethical framework applied without acknowledging it is one of several possible',
    detection: 'moral_claim without framework_declaration',
    criticality: 0.80,
  },
  {
    id: 'eth-scope-insensitivity',
    domain: DOMAIN.ETHICS,
    type: GAP_TYPE.LOGICAL,
    subtype: 'scope_insensitivity',
    description: 'Moral response doesn\'t scale with magnitude of harm',
    detection: 'moral_weight_node does not scale with harm_magnitude_node',
    criticality: 0.80,
    example: '"One death is a tragedy, a million is a statistic" (Stalin)',
  },
  {
    id: 'eth-motivated',
    domain: DOMAIN.ETHICS,
    type: GAP_TYPE.LOGICAL,
    subtype: 'motivated_ethics',
    description: 'Ethical reasoning consistently produces conclusions convenient for reasoner',
    detection: 'ethical_conclusions cluster toward speaker_interest; consistency test fails',
    criticality: 0.85,
  },

  // ════════════════════════════════════════════════════════
  // ORGANISATIONAL / INSTITUTIONAL
  // ════════════════════════════════════════════════════════
  {
    id: 'org-mission-drift',
    domain: DOMAIN.ORGANISATIONAL,
    type: GAP_TYPE.TEMPORAL,
    subtype: 'mission_drift',
    description: 'Organisation\'s behaviour diverges from stated mission over time',
    detection: 'behavioural_evidence contradicts mission_statement over time',
    criticality: 0.80,
    example: 'Non-profit optimising for fundraising; hospital for billing',
  },
  {
    id: 'org-proxy-metric',
    domain: DOMAIN.PROCESS,
    type: GAP_TYPE.DEFINITIONAL,
    subtype: 'proxy_metric_gap',
    description: 'Metric chosen diverges from actual success — Goodhart\'s Law',
    detection: 'metric_definition ≠ success_definition',
    criticality: 0.85,
  },
  {
    id: 'org-info-hierarchy',
    domain: DOMAIN.ORGANISATIONAL,
    type: GAP_TYPE.EVIDENTIAL,
    subtype: 'hierarchy_information_gap',
    description: 'Information required for good decisions doesn\'t reach decision-makers',
    detection: 'information_node at source without causal_path to decision_node',
    criticality: 0.80,
    example: '"Why didn\'t anyone tell me?" — someone always did',
  },
  {
    id: 'org-bystander',
    domain: DOMAIN.ORGANISATIONAL,
    type: GAP_TYPE.OBLIGATION,
    subtype: 'bystander_gap',
    description: 'Collective responsibility diffused until no individual acts',
    detection: 'obligation_node with multiple potential actors; none with direct accountability_edge',
    criticality: 0.75,
  },
  {
    id: 'org-normalisation',
    domain: DOMAIN.ORGANISATIONAL,
    type: GAP_TYPE.TEMPORAL,
    subtype: 'normalisation_gap',
    description: 'Gradually escalating harm normalised — total deviation from origin never examined',
    detection: 'current_state vs origin_state; accumulated deviation without acknowledgment',
    criticality: 0.90,
    example: 'Boiling frog pattern; scope creep; standards erosion',
  },

  // ════════════════════════════════════════════════════════
  // LIFE DOMAINS
  // ════════════════════════════════════════════════════════
  {
    id: 'life-grief-bypassed',
    domain: DOMAIN.GRIEF,
    type: GAP_TYPE.TEMPORAL,
    subtype: 'grief_bypass',
    description: 'Loss not processed — emotion suppressed, timeline imposed, resolution declared without integration',
    detection: 'grief_stage skipped; healing_declaration without processing_evidence',
    criticality: 0.85,
  },
  {
    id: 'life-career-identity',
    domain: DOMAIN.CAREER,
    type: GAP_TYPE.ASSUMPTION,
    subtype: 'career_identity_conflation',
    description: 'Identity entirely invested in career role — no separate self if role disappears',
    detection: 'identity_node without career-independent self_node',
    criticality: 0.80,
  },
  {
    id: 'life-health-assumption',
    domain: DOMAIN.HEALTH,
    type: GAP_TYPE.TEMPORAL,
    subtype: 'health_assumption',
    description: 'Health assumed stable until crisis — no longitudinal monitoring',
    detection: 'health_model static; no trend analysis; crisis-only engagement',
    criticality: 0.80,
  },
  {
    id: 'life-parenting-blueprint',
    domain: DOMAIN.PARENTING,
    type: GAP_TYPE.ASSUMPTION,
    subtype: 'parenting_blueprint_assumption',
    description: 'Parenting model inherited from childhood assumed correct without examination',
    detection: 'parenting_strategy without origin examination; blueprint assumed neutral',
    criticality: 0.80,
  },
  {
    id: 'life-education-outcome',
    domain: DOMAIN.EDUCATION,
    type: GAP_TYPE.DEFINITIONAL,
    subtype: 'education_outcome_gap',
    description: 'Grade/credential conflated with learning; measurement replaces the thing measured',
    detection: 'success_metric = credential, not demonstrated_capability',
    criticality: 0.75,
  },
  {
    id: 'life-finance-future-gap',
    domain: DOMAIN.FINANCES_PERSONAL,
    type: GAP_TYPE.TEMPORAL,
    subtype: 'financial_future_blindness',
    description: 'Present spending optimised without model of future self\'s needs and constraints',
    detection: 'financial_decision without long_term_projection; compounding not modeled',
    criticality: 0.80,
  },

  // ════════════════════════════════════════════════════════
  // FUTURE-FACING
  // ════════════════════════════════════════════════════════
  {
    id: 'fut-climate-externality',
    domain: DOMAIN.CLIMATE,
    type: GAP_TYPE.ASSUMPTION,
    subtype: 'climate_externality',
    description: 'Climate cost not priced into economic decisions — future generations absorb it',
    detection: 'transaction without carbon_cost node; future_generation_cost externalised',
    criticality: 0.95,
  },
  {
    id: 'fut-ai-governance',
    domain: DOMAIN.AI_GOVERNANCE,
    type: GAP_TYPE.OBLIGATION,
    subtype: 'ai_governance_gap',
    description: 'AI capability advancing faster than governance — enforcement mechanism absent',
    detection: 'capability_deployment without governance_mechanism',
    criticality: 0.95,
  },
  {
    id: 'fut-civilisation-assumption',
    domain: DOMAIN.CIVILISATION,
    type: GAP_TYPE.ASSUMPTION,
    subtype: 'civilisation_continuity_assumption',
    description: 'Current civilisational structure assumed stable — fragility unexamined',
    detection: 'long_range_plan built on fragile_assumption without stress_test',
    criticality: 0.90,
  },
  {
    id: 'fut-technical-debt-civilisation',
    domain: DOMAIN.FUTURES,
    type: GAP_TYPE.TEMPORAL,
    subtype: 'civilisational_technical_debt',
    description: 'Decisions optimised for short-term that create irreversible long-term constraints',
    detection: 'decision with positive_short_term + unexamined_long_term_lock-in',
    criticality: 0.90,
    example: 'Infrastructure lock-in; institutional path dependency; ecological tipping points',
  },

  // ════════════════════════════════════════════════════════
  // RECURSIVE — GapHunter on itself
  // ════════════════════════════════════════════════════════
  {
    id: 'meta-taxonomy-completeness',
    domain: DOMAIN.RECURSIVE,
    type: GAP_TYPE.ASSUMPTION,
    subtype: 'taxonomy_completeness_trap',
    description: 'This taxonomy claims to cover all gaps. It cannot. The claim is false.',
    detection: 'Run GapHunter on this document. Every missing domain is an evidential gap.',
    criticality: 1.00,
  },
  {
    id: 'meta-observer-gap',
    domain: DOMAIN.RECURSIVE,
    type: GAP_TYPE.ASSUMPTION,
    subtype: 'observer_gap',
    description: 'The analyzer is not neutral. Gaps found are shaped by gaps the analyzer has.',
    detection: 'Cannot be detected from inside. Requires external perspective.',
    criticality: 1.00,
  },
  {
    id: 'meta-framework-assumption',
    domain: DOMAIN.META,
    type: GAP_TYPE.ASSUMPTION,
    subtype: 'framework_assumption',
    description: 'GapHunter assumes gaps are findable. There are gaps that cannot be found from inside.',
    detection: 'External perspective required. Framework cannot fully audit itself.',
    criticality: 1.00,
  },
];

// ─── Domain groupings ────────────────────────────────────────────────────────

export const DOMAIN_GROUPS = Object.freeze({
  epistemological: [DOMAIN.EPISTEMOLOGICAL, DOMAIN.LOGIC, DOMAIN.PHILOSOPHY_SCIENCE, DOMAIN.METACOGNITION],
  technology:      [DOMAIN.CODE, DOMAIN.SOFTWARE_ARCH, DOMAIN.AI_ML, DOMAIN.SECURITY, DOMAIN.QA, DOMAIN.DEVOPS, DOMAIN.API_DESIGN, DOMAIN.DATABASE, DOMAIN.SYSTEM_DESIGN],
  language:        [DOMAIN.LANG_JS, DOMAIN.LANG_TS, DOMAIN.LANG_PYTHON, DOMAIN.LANG_RUST, DOMAIN.LANG_GO, DOMAIN.LANG_JAVA, DOMAIN.LANG_CPP, DOMAIN.LANG_SQL, DOMAIN.LANG_GENERIC],
  scientific:      [DOMAIN.RESEARCH, DOMAIN.MEDICAL, DOMAIN.STATISTICS, DOMAIN.ENGINEERING],
  political:       [DOMAIN.POLITICAL, DOMAIN.LEGAL, DOMAIN.INSTITUTIONAL, DOMAIN.GOVERNANCE],
  economic:        [DOMAIN.BUSINESS, DOMAIN.FINANCE, DOMAIN.STRATEGY, DOMAIN.CONTRACTS, DOMAIN.MARKETS],
  relational:      [DOMAIN.INTERPERSONAL, DOMAIN.PSYCHOLOGICAL, DOMAIN.COMMUNICATION, DOMAIN.ABUSE_MANIPULATION, DOMAIN.RELATIONAL],
  existential:     [DOMAIN.IDENTITY, DOMAIN.VALUES, DOMAIN.BELIEF, DOMAIN.PURPOSE, DOMAIN.ETHICS, DOMAIN.MORAL, DOMAIN.MEANING],
  organisational:  [DOMAIN.ORGANISATIONAL, DOMAIN.LEADERSHIP, DOMAIN.TEAM, DOMAIN.PROCESS],
  life:            [DOMAIN.HEALTH, DOMAIN.RELATIONSHIPS, DOMAIN.PARENTING, DOMAIN.EDUCATION, DOMAIN.CAREER, DOMAIN.FINANCES_PERSONAL, DOMAIN.GRIEF, DOMAIN.MEANING],
  futures:         [DOMAIN.FUTURES, DOMAIN.CLIMATE, DOMAIN.AI_GOVERNANCE, DOMAIN.CIVILISATION],
  recursive:       [DOMAIN.RECURSIVE, DOMAIN.META],
});

// ─── Cross-domain invariants ─────────────────────────────────────────────────

export const INVARIANTS = Object.freeze([
  'The most critical gap is the one most avoided',
  'Assumption gaps are always more load-bearing than they appear',
  'Temporal gaps compound — small errors grow with time',
  'Contradiction gaps generate energy — the oscillation is fuel if redirected before collapse',
  'The observer always has blind spots that cannot be seen from inside the observation',
  'Normalisation hides accumulation — point-in-time analysis misses what longitudinal reveals',
  'Every system is optimised for what it actually rewards, not for what it says it values',
  'The frame determines what can be found — the most important gaps are often outside the frame',
  'Completeness is an illusion that causes premature closure',
  'The gap in the gap detector is the most dangerous gap',
]);

// ─── Catalogue helpers ───────────────────────────────────────────────────────

export function getByDomain(domain) {
  return GAP_CATALOGUE.filter(g => g.domain === domain);
}

export function getByDomainGroup(groupName) {
  const domains = DOMAIN_GROUPS[groupName] ?? [];
  return GAP_CATALOGUE.filter(g => domains.includes(g.domain));
}

export function getByType(type) {
  return GAP_CATALOGUE.filter(g => g.type === type);
}

export function getByMinCriticality(min) {
  return GAP_CATALOGUE.filter(g => (g.criticality ?? UNIVERSAL_CRITICALITY[g.type] ?? 0) >= min);
}

export function getById(id) {
  return GAP_CATALOGUE.find(g => g.id === id) ?? null;
}

export function allDomains() {
  return [...new Set(GAP_CATALOGUE.map(g => g.domain))].sort();
}

export function catalogueSummary() {
  const byDomain = {};
  const byType   = {};
  for (const g of GAP_CATALOGUE) {
    byDomain[g.domain] = (byDomain[g.domain] ?? 0) + 1;
    byType[g.type]     = (byType[g.type]     ?? 0) + 1;
  }
  return {
    total:    GAP_CATALOGUE.length,
    domains:  Object.keys(byDomain).length,
    byDomain,
    byType,
    highestCriticality: GAP_CATALOGUE
      .slice()
      .sort((a, b) => (b.criticality ?? 0) - (a.criticality ?? 0))
      .slice(0, 10)
      .map(g => ({ id: g.id, subtype: g.subtype, criticality: g.criticality })),
  };
}

/**
 * ADDED, not from the original author: resonance-engine.js (a real,
 * separate file in this same upload batch, version 5.1.0) imports
 * GAP_REASON and AS_ABOVE_SO_BELOW from this file -- a genuine version
 * mismatch between the two delivered files, confirmed by checking this
 * file's real exports directly (neither exists here). Not guessed at:
 * traced resonance-engine.js's exact usage before adding anything.
 *
 * GAP_REASON is used in ResonanceTensionMeter.measureGapTension() (a
 * real method analyzeText() calls) as simple string flags checked via
 * .includes() against a gap result's `reason` array -- so these just
 * need to be stable, distinct string identifiers, not a rich taxonomy.
 * Whether any real gap result actually populates `reason` with these
 * exact strings depends on gap-hunter-core.js's detector output, which
 * wasn't verified in detail -- worst case, these bonuses evaluate to 0
 * (harmless), not broken.
 *
 * AS_ABOVE_SO_BELOW is only used in a standalone getter
 * (asAboveSoBelow()) that analyzeText() never calls -- left as an
 * honestly empty array rather than invented content.
 */
export const GAP_REASON = Object.freeze({
  AVOIDANCE: 'avoidance',
  EMOTIONAL_OCCLUSION: 'emotional_occlusion',
  IDENTITY_REFLECTION: 'identity_reflection',
});

export const AS_ABOVE_SO_BELOW = Object.freeze([]);
