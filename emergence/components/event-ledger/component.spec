// event-ledger -- component spec, in Emerge. REBUILT.
// Previous version: rfr2's real ledger validated commits but was
// in-memory only (checked its source -- zero file I/O). Every commit
// died with the process, and nothing exposed the accumulated history.

version 0.2.0
domain "record"

component EventLedger {
  root       : Record
  implements : [authoritative_history]

  wraps      : "../../vendor/rfr2/ledger/index.js"       // real validation logic, unmodified
  persisted_by : "../../vendor/jaa/{FileStore,FileRefs}.js"  // ported from Jaa/src/Persistence/*.php, not reimplemented

  // rfr2's UpgradeLedger still does real validation (requires proof,
  // assigns real ids) -- not replaced. Every validated commit is ALSO
  // written to Jaa's content-addressed FileStore, hash-chained via a
  // `prev` pointer (git-commit shaped), with a FileRefs pointer
  // `emergence/ledger/head` advanced to the new hash.
  gate ledger_commit {
    condition : creation_occurred
    mechanism : "real rfr2 validation -> content-addressed write (SHA-256 of canonical JSON) -> hash-chain to prev head -> ref update"
    result    : { id, ts, hash }
    emits     : [ledger:committed]
  }

  gate ledger_history {
    mechanism : "walk the real persisted chain back from emergence/ledger/head -- works on a fresh process with zero commits of its own, not just this session's in-memory events"
    result    : "[{ id, ts, nodeId, target, cluster, tick, prev, hash }, ...]"
  }

  status: implemented
  verified_by: "17-test suite on the ported persistence layer itself (vendor/jaa/test/) + direct ledger test proving cross-process durability + full loop integration test"
  bug_caught: "history() initially returned empty on a fresh process because store/refs were only initialized lazily inside the first commit's async path -- a read-only restart never triggers a commit. Fixed by initializing the (synchronous) persistence layer eagerly, separate from the (async ESM) validation logic."
}
