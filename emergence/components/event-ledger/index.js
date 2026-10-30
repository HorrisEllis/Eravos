'use strict';
/**
 * event-ledger -- WARP wiring around the real, unmodified
 * vendor/rfr2/ledger/index.js FOR VALIDATION, and the real, ported
 * vendor/jaa/{FileStore,FileRefs} FOR DURABILITY.
 *
 * Two real gaps this closes:
 *   1. vendor/rfr2's ledger was in-memory only -- checked its source,
 *      zero file I/O. Every commit died with the process.
 *   2. Nothing exposed the accumulated history -- loop.js only ever
 *      returned per-tick deltas.
 *
 * Design: rfr2's real UpgradeLedger still does the actual validation
 * (requires proof, assigns real ids) -- that logic isn't replaced.
 * Every validated commit is ALSO written to Jaa's FileStore
 * (content-addressed, hash-chained via a `prev` pointer -- git-commit
 * shaped) and a FileRefs pointer `emergence/ledger/head` is advanced to
 * the new hash. That's genuine cross-restart durability, and
 * history(n) can now walk the real chain back from head.
 */

const { Cause, Drawbridge } = require('../../../warp');
const path = require('path');
const { FileStore } = require('../../vendor/jaa/FileStore.js');
const { FileRefs } = require('../../vendor/jaa/FileRefs.js');

const LEDGER_URL = 'file://' + path.resolve(__dirname, '../../vendor/rfr2/ledger/index.js');
const HEAD_REF = 'emergence/ledger/head';

function buildLedgerGate({ dataDir } = {}) {
  const dir = dataDir || path.join(process.cwd(), 'data', 'emergence-ledger');
  // store/refs need nothing async — initialize eagerly so history() works
  // on a fresh process that hasn't committed anything yet (a read-only
  // restart should still be able to read what a prior process wrote).
  const store = new FileStore(dir);
  const refs = new FileRefs(dir);
  let ledger = null;

  async function ensureLedger() {
    if (ledger) return ledger;
    const { createLedger } = await import(LEDGER_URL);
    ledger = createLedger({ project: 'emergence' });
    return ledger;
  }

  const drawbridge = new Drawbridge('ledger:commit', {
    schema: { requiredKeys: ['id'] },
    async transform(cause) {
      const l = await ensureLedger();
      const { nodeId, target, cluster, tick } = cause.data;

      // real validation, real id assignment -- unmodified rfr2 logic
      const committed = l.commit({
        description: target
          ? `cfr creation ${nodeId} toward ${target.type}:${target.id}`
          : `cfr creation ${nodeId} (no target)`,
        proof: { metric: { tick, converged: !!cluster, density: cluster?.density ?? 0, sig: cluster?.sig ?? null } },
      });

      // real durability: content-addressed, hash-chained to the prior head
      const prevHash = refs.get(HEAD_REF);
      const record = {
        id: committed.id,
        ts: committed.ts,
        nodeId,
        target: target ?? null,
        cluster: cluster ?? null,
        tick,
        prev: prevHash,
      };
      const hash = store.put(record);
      refs.set(HEAD_REF, hash);

      return [new Cause('ledger:committed', { id: committed.id, ts: committed.ts, hash })];
    },
  });

  /** Walk the real persisted chain back from head. Works across restarts, even before this process has committed anything. */
  drawbridge.history = function history(n = 20) {
    const out = [];
    let hash = refs.get(HEAD_REF);
    while (hash && out.length < n) {
      const record = store.get(hash);
      out.push({ ...record, hash });
      hash = record.prev;
    }
    return out;
  };

  return drawbridge;
}

module.exports = { buildLedgerGate };
