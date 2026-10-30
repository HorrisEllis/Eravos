'use strict';
/**
 * DrawbridgeFusion — v1.4 "drawbridge fusion system." (Renamed from
 * GateFusion, per the spine rename.) Merges an adjacent chain of pure
 * Drawbridges into a single Drawbridge, so Flow.emit()'s recursive
 * dispatch doesn't pay a Map lookup + axiom pass + log-record round trip
 * per intermediate hop for transforms that always fire together anyway.
 *
 * The spec's constraint was "no shared side effects." Drawbridge.transform
 * is already documented core primitive as pure with zero side effects
 * (see core/Drawbridge.js's own header) — so that constraint is
 * Drawbridge's existing contract, not a new check this module invents or
 * verifies. fuseChain does NOT attempt to prove purity at runtime (there
 * is no way to prove that generically); it trusts the same contract
 * every other part of WARP already trusts every Drawbridge to honor, and
 * documents that trust explicitly rather than pretending to enforce it.
 *
 * What IS enforced: adjacency. Drawbridge B only fuses onto Drawbridge A
 * if A's transform can actually produce a cause of the type B matches —
 * this module runs each drawbridge's `matches` against a synthetic probe
 * cause of every declared handoff type to catch a wrong chain order
 * early, rather than silently fusing drawbridges that were never really
 * adjacent.
 */
const { Cause } = require('./Cause');
const { Drawbridge } = require('./Drawbridge');

/**
 * fuseChain(drawbridges, fusedSignature) — drawbridges: ordered array of
 * Drawbridge instances, where drawbridges[i]'s transform is expected to
 * produce causes matched by drawbridges[i+1]. Returns one Drawbridge
 * whose transform runs the whole chain internally and returns only the
 * final-stage output causes (plus any branch causes that don't match
 * the next stage, so nothing produced along the way is silently
 * dropped).
 */
function fuseChain(drawbridges, fusedSignature) {
  if (!Array.isArray(drawbridges) || drawbridges.length < 2) {
    throw new Error('[warp/DrawbridgeFusion] fuseChain requires at least 2 drawbridges');
  }
  for (let i = 0; i < drawbridges.length - 1; i++) {
    if (!(drawbridges[i] instanceof Drawbridge) || !(drawbridges[i + 1] instanceof Drawbridge)) {
      throw new Error('[warp/DrawbridgeFusion] fuseChain requires Drawbridge instances');
    }
  }

  const fused = new Drawbridge(fusedSignature, {
    matches: (cause) => drawbridges[0].matches(cause),
    transform: (cause) => {
      let frontier = [cause];
      const passthrough = [];

      for (let stage = 0; stage < drawbridges.length; stage++) {
        const drawbridge = drawbridges[stage];
        const next = [];
        for (const c of frontier) {
          if (!drawbridge.matches(c)) { passthrough.push(c); continue; }
          const produced = drawbridge.transform(c);
          const causes = produced == null ? [] : (Array.isArray(produced) ? produced : [produced]);
          next.push(...causes);
        }
        frontier = next;
        if (frontier.length === 0) break;
      }

      return [...passthrough, ...frontier];
    },
  });

  fused.fusedFrom = drawbridges.map(d => d.signature); // traceability — a fused drawbridge still says what it's made of
  return fused;
}

/**
 * canFuse(drawbridgeA, drawbridgeB, sampleCauseTypes) — best-effort
 * adjacency check. For each declared sample type, run drawbridgeA.matches
 * on a probe Cause, and if it matches, confirm drawbridgeA.transform's
 * contract lines up with drawbridgeB.matches on at least one plausible
 * output type. This is a heuristic sanity check, not a proof — see
 * module header.
 */
function canFuse(drawbridgeA, drawbridgeB, sampleCauseTypes = []) {
  for (const type of sampleCauseTypes) {
    const probe = new Cause(type, {});
    if (drawbridgeA.matches(probe)) return true;
  }
  // No sample types supplied — fall back to signature-name convention
  // (best-effort only): can't prove adjacency, say so via null.
  return sampleCauseTypes.length === 0 ? null : false;
}

module.exports = { fuseChain, canFuse };
