/**
 * cfr-kernel v1.0.0
 *
 * Constraint Field Runtime — standalone, decoupled physics kernel.
 * Three modules, zero dependencies, works in browser and Node.
 *
 * Execution order (dependency DAG):
 *   physics  — world state, step loop, curl noise, attractors
 *   rewind   — snapshot ring, causal log, seek/step/scrub, .nex serialise
 *   render   — MVP matrix, project(), Canvas 2D draw helpers
 *
 * Project UUID: a1f2e3d4-b5c6-4789-8abc-def012345678
 */

export * from './physics.js';
export * from './rewind.js';
export * from './render.js';
