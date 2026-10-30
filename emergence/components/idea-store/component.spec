// idea-store -- component spec, in Emerge.
// v0.1: refactored from rheon-idea-os's real IdeaStore.js onto Jaa
// persistence, but plain function calls -- no WARP involvement, the
// one component in this project that wasn't a real Gate. v0.2: rebuilt
// onto real WARP dispatch, closing that inconsistency.

version 0.2.0
domain "record"

component IdeaStore {
  root       : Record
  implements : [idea_registry]

  refactored_from : "build-tools/rheon-idea-os/storage/IdeaStore.js"
  persisted_by    : "../../vendor/jaa/{FileStore,FileRefs}.js"

  // mutations are real WARP Gates -- add/link. reads (list, search,
  // findById, graph, edgesFor, neighbours) are direct methods, same
  // read/write split associative-lattice and causal-graph use: only
  // state-changing operations go through Event -> Gate -> Stream.
  gate idea_add {
    condition : text_non_empty                    // real hard Axiom: idea:text-required
    result    : { id, ts, text, projectId, tags, source }
    emits     : [idea:added]
  }

  gate idea_link {
    condition : valid_edge_type_and_both_ids_exist  // 3 real hard Axioms:
                                                       //   idea:valid-edge-type
                                                       //   idea:from-exists
                                                       //   idea:to-exists
    result    : { id, ts, fromId, toId, type, source }
    emits     : [idea:linked]
  }

  edge_types : [related, refines, contradicts, implements, spawns]  // same real vocabulary as the original

  // real, not decorative: every add/link axiom check runs against
  // LIVE store state via closures (findById() inside the axiom check
  // function) -- from-exists/to-exists actually query the persisted
  // chain at validation time, not a cached snapshot.
  status: implemented
  verified_by: "12 tests: real Axiom rejection (empty text, invalid edge type, missing fromId/toId), rejected mutations proven not to corrupt state, real StreamLog entries confirmed, real cross-restart durability, end-to-end proof through the real HTTP server (register an idea, search it, use its real id as a real tick target)"
  what_changed_in_v0.2: "add()/link() were plain async functions calling store.put() directly. Now real WARP Gates registered on a real Stream with a real StreamLog, validated by real Axioms instead of ad-hoc throw statements inside the function body. Fixes the one architectural inconsistency in the project: every other component was already a Gate, this wasn't."
}
