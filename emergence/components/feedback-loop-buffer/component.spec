// feedback-loop-buffer — component spec, in Emerge.
// Supersedes the earlier ring-buffer.spec, which described this same
// implementation in warp.spec's YAML style instead of Emerge — the
// implementation didn't change, the description language did.

version 0.1.0

domain "signal"

// ─────────────────────────────────────────────────────────────────────────
// WHAT THIS COMPONENT IS, IN EMERGE'S OWN VOCABULARY
// ─────────────────────────────────────────────────────────────────────────
// feedback = an_output_that_becomes_an_input      (domain "signal")
// loop     = a_component_that_repeats             (domain "signal")
// window   = the_bounded_view_this_loop_holds       (local — see below)
//
// A feedback loop needs a bounded memory of recent outputs to feed back
// as input — unbounded memory isn't a loop, it's an archive (that's
// Record's job, domain "record", not Signal's). Fixed capacity,
// overwrite-oldest, is what makes this specifically a *loop* primitive
// and not a ledger: old signal ages out because feedback cares about the
// recent window, not the full history.

component RingBuffer {
  root       : Signal
  implements : [feedback, loop]

  // ── STRUCTURE (built with warp: Event -> Gate -> Axiom -> Stream) ──────
  compartment core {
    seam RingBufferCore { pure_data_structure }   // no I/O, no warp, no globals
    seam wire            { from: warp.Event, to: warp.Stream, via: warp.Gate }
  }

  compartment persist {
    seam FilePersistence  { record: snapshot, source_of_truth: disk }
    seam EvictionLedger   { record: eviction,  append_only: true }
  }

  compartment diagnostics {
    lens health { observes: [buffer_state, dispatch_state, eviction_count] }
  }

  compartment interface {
    seam api { protocol: http,  exposes: [push, tail, status, evictions, save] }
    seam cli { protocol: stdio, wraps: api }
  }

  // ── GATE — the one mutation point ───────────────────────────────────────
  gate ring_push {
    condition : value_is_not_undefined_and_not_a_function   // axiom-enforced, hard
    result    : { index, wasFull, evicted, value }
    emits     : [ring:pushed, ring:evicted]                  // ring:evicted only when wasFull
  }

  // ── AXIOMS ────────────────────────────────────────────────────────────
  axiom ring_no_undefined  { severity: hard, rule: value_defined }
  axiom ring_no_function   { severity: hard, rule: value_not_callable }
  axiom ring_size_budget   { severity: soft, rule: value_under_byte_budget }

  // ── RECORD — what persists, and what Record means here vs Signal ───────
  // The buffer's live window is Signal (this component's whole point).
  // The eviction ledger is Record (domain "record": an_authoritative_
  // append_only_sequence) — a genuine second root type living inside a
  // Signal-rooted component, which is fine: seams cross domains, roots
  // don't have to be pure per-component.
  record eviction { field: value, field: index, field: ts, field: uuid }

  status: implemented
  verified_by: "43 tests across 6 layers + live server/CLI integration run"
  impl: "./core, ./persist, ./diagnostics, ./api, ./cli, ./index.js"
}
