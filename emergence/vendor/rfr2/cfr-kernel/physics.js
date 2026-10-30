/**
 * @module       cfr/physics
 * @uuid         a1f2e3d4-b5c6-4789-8abc-def012345678
 * @version      1.0.0
 *
 * Constraint Field Runtime — Physics Core
 * Curl noise + attractor gravity + entropy injection + soft-wall boundary.
 * Float32Array SoA layout. Zero DOM dependencies. Zero external dependencies.
 *
 * Usage:
 *   import { createWorld, stepWorld } from 'cfr-kernel/physics';
 *   const world = createWorld({ n: 10000 });
 *   // each frame:
 *   stepWorld(world, dt);  // dt in seconds
 */

'use strict';

// ── Defaults ──────────────────────────────────────────────────────────────────

export const DEFAULT_CONFIG = {
  n:       10000,   // particle count
  bound:   9.0,     // XY boundary radius
  boundZ:  5.0,     // Z boundary base
  depth:   3.0,     // Z depth multiplier
  wallK:   0.11,    // soft wall spring constant
  wallZ:   1.4,     // soft wall activation zone
  vmax:    0.17,    // max velocity
};

// ── Curl noise (deterministic, no dependencies) ───────────────────────────────

function h21(x, y) {
  const v = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return v - Math.floor(v);
}

function sn(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix,         fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const a = h21(ix, iy), b = h21(ix + 1, iy);
  const c = h21(ix, iy + 1), d = h21(ix + 1, iy + 1);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

function curlNoise(x, y, z, t) {
  const e = 0.08;
  return {
    cx:  (sn(x + z * 0.2 + t * 0.05, y + e) - sn(x + z * 0.2 + t * 0.05, y - e)) / (2 * e),
    cy: -(sn(x + e, y + z * 0.3 + t * 0.07) - sn(x - e, y + z * 0.3 + t * 0.07)) / (2 * e),
    cz:  (sn(y + e, z + x * 0.15 + t * 0.04) - sn(y - e, z + x * 0.15 + t * 0.04)) / (2 * e) * 0.4,
  };
}

// ── World factory ─────────────────────────────────────────────────────────────

/**
 * Create a CFR world.
 * @param {object} opts - merged with DEFAULT_CONFIG
 * @returns {World}
 */
export function createWorld(opts = {}) {
  const cfg = { ...DEFAULT_CONFIG, ...opts };
  const N   = Math.max(100, Math.min(500_000, cfg.n));

  const posX = new Float32Array(N); const posY = new Float32Array(N); const posZ = new Float32Array(N);
  const velX = new Float32Array(N); const velY = new Float32Array(N); const velZ = new Float32Array(N);
  const pSpeed = new Float32Array(N);

  const BXY = cfg.bound * 0.9, BZ = cfg.boundZ * cfg.depth * 0.9;
  for (let i = 0; i < N; i++) {
    posX[i] = (Math.random() - 0.5) * 2 * BXY;
    posY[i] = (Math.random() - 0.5) * 2 * BXY;
    posZ[i] = (Math.random() - 0.5) * 2 * BZ;
    velX[i] = (Math.random() - 0.5) * 0.025;
    velY[i] = (Math.random() - 0.5) * 0.025;
    velZ[i] = (Math.random() - 0.5) * 0.012;
    pSpeed[i] = 0.15 + Math.random() * 0.15;
  }

  return {
    cfg,
    N,
    posX, posY, posZ,
    velX, velY, velZ,
    pSpeed,
    // Field parameters (mutate freely)
    field: {
      structure: 0.5,
      entropy:   0.2,
      attention: 0.5,
      damping:   0.12,
      curl:      0.6,
      speed:     1.0,
    },
    attractors: [],   // [{ id, x, y, z, mass }]
    stresses:   [],   // [{ x, y, z, strength, radius, life }]
    clusters:   [],   // populated by stepWorld
    regime:    'stable',
    _t:        0,     // internal curl time accumulator
  };
}

// ── Step ──────────────────────────────────────────────────────────────────────

/**
 * Advance the world by dt seconds.
 * @param {World} w
 * @param {number} dt - seconds (clamped to 33ms internally)
 */
export function stepWorld(w, dt) {
  const { N, posX, posY, posZ, velX, velY, velZ, pSpeed, field, cfg } = w;
  const dtF = Math.min(dt, 0.033) * 60 * field.speed;
  const t   = w._t; w._t += dt * 0.1;

  const VMAX = cfg.vmax, BXY = cfg.bound, BZ = cfg.boundZ * cfg.depth;
  const WK = cfg.wallK, WZ = cfg.wallZ;
  const HB = BXY + 0.4, HBZ = BZ + 0.4;

  for (let i = 0; i < N; i++) {
    let px = posX[i], py = posY[i], pz = posZ[i];
    let vx = velX[i], vy = velY[i], vz = velZ[i];

    if (!isFinite(px)) { posX[i]=posY[i]=posZ[i]=velX[i]=velY[i]=velZ[i]=0; continue; }

    // Curl noise
    if (field.curl > 0.001) {
      const { cx, cy, cz } = curlNoise(px * 0.32, py * 0.32, pz * 0.18, t);
      vx += cx * field.curl * 0.011 * dtF;
      vy += cy * field.curl * 0.011 * dtF;
      vz += cz * field.curl * 0.005 * dtF;
    }

    // Attractors
    for (const at of w.attractors) {
      const dx = at.x - px, dy = at.y - py, dz = at.z - pz;
      const d2 = dx*dx + dy*dy + dz*dz + 0.4;
      const d  = Math.sqrt(d2);
      const f  = at.mass * field.structure * field.attention * 0.016 / d2;
      vx += dx / d * f * dtF; vy += dy / d * f * dtF; vz += dz / d * f * dtF * 0.35;
    }

    // Entropy injection
    vx += (Math.random() - 0.5) * field.entropy * 0.016 * dtF;
    vy += (Math.random() - 0.5) * field.entropy * 0.016 * dtF;
    vz += (Math.random() - 0.5) * field.entropy * 0.005 * dtF;

    // Stress events
    for (const st of w.stresses) {
      const dx = px - st.x, dy = py - st.y, dz = pz - st.z;
      const d2 = dx*dx + dy*dy + dz*dz + 0.01;
      const d  = Math.sqrt(d2);
      if (d < st.radius * 3) {
        const f = st.strength * st.life / (d2 * 14);
        vx += dx / d * f * dtF; vy += dy / d * f * dtF; vz += dz / d * f * dtF * 0.25;
      }
    }

    // Soft walls
    const dxw = BXY - Math.abs(px), dyw = BXY - Math.abs(py), dzw = BZ - Math.abs(pz);
    if (dxw < WZ) vx += Math.sign(-px) * WK * (WZ - dxw) * dtF;
    if (dyw < WZ) vy += Math.sign(-py) * WK * (WZ - dyw) * dtF;
    if (dzw < WZ) vz += Math.sign(-pz) * WK * (WZ - dzw) * dtF;

    // Damping + velocity cap
    const dk = 1 - field.damping * 0.8;
    vx *= dk; vy *= dk; vz *= dk;
    const vm = Math.sqrt(vx*vx + vy*vy + vz*vz);
    if (vm > VMAX) { const sc = VMAX / vm; vx *= sc; vy *= sc; vz *= sc; }

    px += vx * dtF; py += vy * dtF; pz += vz * dtF;

    // Hard boundary bounce
    if (px >  HB)  { px =  HB;  vx *= -0.3; }
    if (px < -HB)  { px = -HB;  vx *= -0.3; }
    if (py >  HB)  { py =  HB;  vy *= -0.3; }
    if (py < -HB)  { py = -HB;  vy *= -0.3; }
    if (pz >  HBZ) { pz =  HBZ; vz *= -0.3; }
    if (pz < -HBZ) { pz = -HBZ; vz *= -0.3; }

    posX[i]=px; posY[i]=py; posZ[i]=pz;
    velX[i]=vx; velY[i]=vy; velZ[i]=vz;
    pSpeed[i] = Math.min(1, vm * 5.5);
  }

  // Decay stresses
  for (const st of w.stresses) st.life *= 0.91;
  w.stresses = w.stresses.filter(s => s.life > 0.015);

  _detectClusters(w);
}

// ── Cluster detection ─────────────────────────────────────────────────────────

function _detectClusters(w) {
  if (!w.attractors.length) { w.clusters = []; return; }
  const { N, posX, posY, posZ, pSpeed } = w;
  const R2 = 2.8 * 2.8;
  const clusters = [];
  for (const at of w.attractors) {
    let cnt = 0, avgS = 0;
    for (let i = 0; i < N; i += 4) {
      const dx = posX[i]-at.x, dy = posY[i]-at.y, dz = posZ[i]-at.z;
      if (dx*dx + dy*dy + dz*dz < R2) { cnt++; avgS += pSpeed[i]; }
    }
    avgS = cnt > 0 ? avgS / cnt : 1;
    const density = cnt / (N / 4);
    if (density > 0.012) {
      const sig = avgS < 0.12 ? 'causal' : avgS < 0.35 ? 'laminar' : 'turb';
      clusters.push({ id: at.id, density, avgSpeed: avgS, sig });
    }
  }
  w.clusters = clusters;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Inject a stress event (repulsion burst) at a world position.
 */
export function injectStress(world, x, y, z, strength = 500, radius = 4) {
  world.stresses.push({
    x: x ?? (Math.random() - 0.5) * world.cfg.bound * 1.4,
    y: y ?? (Math.random() - 0.5) * world.cfg.bound * 1.4,
    z: z ?? 0,
    strength, radius, life: 1,
  });
}

/**
 * Add or update an attractor. Idempotent by id.
 */
export function upsertAttractor(world, { id, x, y, z, mass = 1 }) {
  const existing = world.attractors.findIndex(a => a.id === id);
  if (existing >= 0) world.attractors[existing] = { id, x, y, z, mass };
  else world.attractors.push({ id, x, y, z, mass });
}

/**
 * Remove an attractor by id.
 */
export function removeAttractor(world, id) {
  world.attractors = world.attractors.filter(a => a.id !== id);
}
