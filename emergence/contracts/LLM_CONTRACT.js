/**
 * SEAM: LLM_CONTRACT
 * version: 1.0.0
 * status: draft
 * between: ['emergence-component', 'llm-bridge']
 * description: The contract any Emergence component uses to request LLM
 *   completions, and what any LLM bridge (Ollama, or otherwise) must honor.
 *
 * NEW CONTENT, not a port. Checked first: capture/rheon-engines/ollama.js
 * imports `KernelEvents` from `../schema/kernel.schema.js` — that file
 * does not exist anywhere in any upload. rheon-idea-os's own seams/
 * (CLI_CONTRACT, UI_CONTRACT, LATTICE_CONTRACT, STORAGE_CONTRACT) has
 * no LLM contract either. This fills a real, referenced-but-missing gap
 * — not invented from nothing, though: the shape below follows
 * rheon-idea-os's own real seam-contract format exactly (commands with
 * payload/returns/errors/idempotent/timeout_ms, events, isolation,
 * metrics, traceability, acceptance), and the two isolation rules
 * marked "carried from ollama.js" are ollama.js's own stated §LAW
 * comments, not new policy.
 *
 * No component in Emergence calls an LLM yet. This is the contract
 * for if/when one does — cfr-creator choosing between ambiguous
 * targets, rfr2-observer getting help interpreting ambiguous text, etc.
 * Declaring the seam before the implementation exists is deliberate —
 * AXIOMS Sec3.3, map before build.
 */

export const LLM_CONTRACT = {
  name:        'LLM_CONTRACT',
  version:     '1.0.0',
  status:      'draft', // no implementation calls this yet -- see header
  between:     ['emergence-component', 'llm-bridge'],
  description: 'Requests from any Emergence component to any LLM bridge, and what that bridge must guarantee back',

  contract: {
    commands: {

      'llm.complete': {
        payload: {
          prompt:      'string',
          system:      'string?',
          maxTokens:   'number?',
          temperature: 'number?',
          // provenance -- which component asked, and why. Required, not
          // optional: an LLM call with no traceable origin is exactly
          // the kind of untraceable side-effect AXIOMS Sec17 rules out.
          requestedBy: 'string',   // component name, e.g. 'cfr-creator'
          reason:      'string',  // why this call is being made, human-readable
        },
        returns: '{ text: string, model: string, tokensUsed: number, durationMs: number }',
        errors: [
          { code: 'LLM_UNAVAILABLE',    message: 'No LLM bridge is reachable -- offline mirror should run instead, per ollama.js Sec LAW' },
          { code: 'TIMEOUT',            message: 'Completion exceeded timeout_ms' },
          { code: 'CONTEXT_TOO_LARGE',  message: 'Prompt exceeds the model\'s context window -- must be trimmed by the caller, never silently truncated by the bridge' },
          { code: 'EMPTY_PROMPT',       message: 'prompt is required and cannot be empty' },
        ],
        idempotent: false, // LLM output is not guaranteed deterministic across calls
        timeout_ms: 30000, // matches ollama.js's real TIMEOUT_MS constant
      },

      'llm.stream': {
        payload: {
          prompt:      'string',
          system:      'string?',
          requestedBy: 'string',
          reason:      'string',
        },
        returns: '{ streamId: string }', // caller subscribes to llm.chunk / llm.done events with this id
        errors: [
          { code: 'LLM_UNAVAILABLE', message: 'No LLM bridge is reachable' },
          { code: 'EMPTY_PROMPT',    message: 'prompt is required and cannot be empty' },
        ],
        idempotent: false,
        timeout_ms: 30000,
      },

      'llm.available': {
        payload: {},
        returns: '{ available: boolean, model: string|null }',
        errors: [],
        idempotent: true,
        timeout_ms: 3000, // matches ollama.js's real availability-check timeout
      },
    },

    events: {
      'llm.chunk':       { payload: { streamId: 'string', token: 'string' }, ordering: 'guaranteed' },
      'llm.done':         { payload: { streamId: 'string', tokensUsed: 'number', durationMs: 'number' }, ordering: 'guaranteed' },
      'llm.unavailable':  { payload: { error: 'string' }, ordering: 'best-effort' },
      'llm.ready':        { payload: { model: 'string' }, ordering: 'best-effort' },
    },
  },

  isolation: {
    rules: [
      // carried from ollama.js's own stated Sec LAW comments, not new policy:
      'Local first. Cloud is never the default path.',
      'If the LLM bridge is unavailable, an offline mirror runs. Nothing silently fails.',
      // new, specific to this contract:
      'Every llm.complete/llm.stream call requires requestedBy and reason -- no untraceable LLM calls.',
      'A component may not retry a failed LLM call silently more than once -- repeated failure surfaces to the caller, not swallowed.',
      'Prompt construction is the caller\'s responsibility -- the bridge never injects, reorders, or silently truncates prompt content.',
    ],
    verified_by: 'test (see contracts/test/llm-contract.test.js -- shape validation only; no live LLM bridge exists yet to test behavior against)',
  },

  metrics: {
    latency_p95_ms:     5000,  // real completions are slow; this is not STORAGE_CONTRACT's 200ms
    latency_p99_ms:     15000,
    throughput_per_sec: 1,      // local LLM bridges are not high-throughput
    error_rate_pct:     5.0,   // higher tolerance than storage -- LLM unavailability is a normal, handled case
    availability_pct:   90.0,  // local-only, no cloud fallback -- deliberately lower than a hosted service's SLA
  },

  traceability: {
    trace_id:     true,
    causal_chain: true, // an LLM call triggered by a tick should be traceable back to it, same as any other creation
    ledger:       false, // NOT committed to event-ledger by default -- an LLM call is not itself a verified structural event; if its OUTPUT leads to a real creation, THAT gets ledgered, not the call itself
  },

  acceptance: {
    contract_tests:     false, // shape-only test exists; no bridge implementation to test against yet
    isolation_verified: false,
    mock_generated:     false,
    metrics_verified:   false,
  },
};
