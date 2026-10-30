'use strict';
/**
 * cfr-creator — REBUILT. The first version injected stress using a made-up
 * formula (rupture*2000 + decay*800) and called that "creation" — it
 * wasn't. This version uses physics.js's actual attractor/cluster
 * mechanism, which is the real primitive for "creating toward something":
 *
 *   world.attractors — gravitational pull points (id, x, y, z, mass).
 *   world.clusters   — computed by the real _detectClusters(): density of
 *                       particles converged near an attractor, their
 *                       avgSpeed, and a sig classification ('causal' =
 *                       settled/low-speed, 'laminar' = mid, 'turb' =
 *                       still chaotic).
 *
 * CFR creates TOWARD something — an end-state, an idea, or a person —
 * per your answer. That target is never guessed here: the caller passes
 * it explicitly as `target: { id, type: 'end-state'|'idea'|'person' }`.
 * No target, no attractor, no directed creation — the field still runs
 * (curl noise, entropy) but nothing is claimed to converge toward
 * anything, which is the honest state when there's nothing to converge
 * toward.
 *
 * STATED ASSUMPTION (not hidden): an attractor's (x,y,z) position is a
 * deterministic hash of its id — there's no semantic embedding model
 * available here, so "distance to attractor" is not semantic similarity.
 * What density/convergence measures is real: whether repeated pulls
 * toward the same target actually cause the field to settle there over
 * time. That's a genuine physical signal, just not a semantic one.
 */

const { Cause, Drawbridge } = require('../../../warp');
const path = require('path');

const PHYSICS_URL = 'file://' + path.resolve(__dirname, '../../vendor/rfr2/cfr-kernel/physics.js');

/** Deterministic id -> position, stated and stable (not a semantic embedding). */
function hashPosition(id, bound = 6) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  const a = (h % 1000) / 1000, b = ((h >>> 10) % 1000) / 1000;
  return {
    x: (a - 0.5) * 2 * bound,
    y: (b - 0.5) * 2 * bound,
    z: 0,
  };
}

function buildCreatorGate({ particleCount = 100, stepsPerCreate = 8 } = {}) {
  let world = null;
  let physics = null;
  const knownAttractors = new Set();

  async function ensureWorld() {
    if (world) return world;
    physics = await import(PHYSICS_URL);
    world = physics.createWorld({ n: particleCount });
    return world;
  }

  return new Drawbridge('cfr:create', {
    schema: { requiredKeys: ['cluster', 'tick'] },
    async transform(cause) {
      const { target } = cause.data; // { id, type: 'end-state'|'idea'|'person', mass? } | undefined
      const w = await ensureWorld();

      if (target && target.id) {
        const pos = hashPosition(target.id);
        const mass = target.mass ?? 1;
        physics.upsertAttractor(w, { id: target.id, x: pos.x, y: pos.y, z: pos.z, mass });
        knownAttractors.add(target.id);
      }

      for (let i = 0; i < stepsPerCreate; i++) physics.stepWorld(w, 1 / 60);

      // real cluster output — null if this target hasn't drawn enough
      // density to register (the real 0.012 threshold in _detectClusters),
      // which is an honest "hasn't converged yet" rather than a fabricated number
      const cluster = target ? (w.clusters.find(c => c.id === target.id) ?? null) : null;

      return [
        new Cause('cfr:created', {
          target: target ?? null,
          cluster, // { id, density, avgSpeed, sig } | null
          tick: w._t,
          attractorCount: w.attractors.length,
        }),
      ];
    },
  });
}

module.exports = { buildCreatorGate };

