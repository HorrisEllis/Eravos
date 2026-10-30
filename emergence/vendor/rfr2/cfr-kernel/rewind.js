/**
 * @module       cfr/rewind
 * @uuid         b2e3f4a5-c6d7-4890-9bcd-ef0123456789
 * @version      1.0.0
 *
 * Constraint Field Runtime — Rewind / Timeline System
 * Ring-buffered snapshots. Seek, step, scrub. Immutable causal log.
 * Zero DOM dependencies. Works with any world from cfr/physics.
 *
 * Usage:
 *   import { createTimeline, takeSnapshot, applySnapshot } from 'cfr-kernel/rewind';
 *   const tl = createTimeline(world, { snapMax: 200 });
 *   // every ~2s:
 *   takeSnapshot(tl);
 *   // seek:
 *   seekTo(tl, 42);
 *   // step:
 *   step(tl, -1);  // back one
 *   step(tl, +1);  // forward one
 *   // return to live:
 *   goLive(tl);
 */

'use strict';

// ── Factory ───────────────────────────────────────────────────────────────────

/**
 * @param {World} world      - a world from cfr/physics
 * @param {object} opts
 * @param {number} opts.snapMax   - max snapshots in ring (default 200)
 * @param {number} opts.logMax    - max causal log entries (default 2000)
 * @returns {Timeline}
 */
export function createTimeline(world, opts = {}) {
  return {
    world,
    snapMax:   opts.snapMax  ?? 200,
    logMax:    opts.logMax   ?? 2000,
    snapshots: [],     // [{ ts, px, py, pz }]
    causalLog: [],     // [{ ts, cls, data }]
    idx:       -1,     // -1 = live
    paused:    false,
  };
}

// ── Snapshot ──────────────────────────────────────────────────────────────────

/**
 * Capture current particle positions into the timeline ring buffer.
 * Safe to call every frame — only actually stores up to snapMax.
 */
export function takeSnapshot(tl) {
  const { posX, posY, posZ } = tl.world;
  if (tl.snapshots.length >= tl.snapMax) tl.snapshots.shift();
  tl.snapshots.push({ ts: Date.now(), px: posX.slice(), py: posY.slice(), pz: posZ.slice() });
  if (tl.idx === -1) tl._notifyIdx(tl.snapshots.length - 1);
}

/**
 * Restore world particle positions from snapshot at index.
 */
export function applySnapshot(tl, idx) {
  const snap = tl.snapshots[idx];
  if (!snap) return;
  tl.world.posX.set(snap.px);
  tl.world.posY.set(snap.py);
  tl.world.posZ.set(snap.pz);
  tl.idx = idx;
  tl.paused = true;
  tl._onChange?.({ idx, ts: snap.ts, paused: true });
}

// ── Navigation ────────────────────────────────────────────────────────────────

/** Seek to specific snapshot index. */
export function seekTo(tl, idx) {
  const clamped = Math.max(0, Math.min(tl.snapshots.length - 1, idx));
  applySnapshot(tl, clamped);
}

/** Step forward (+1) or backward (-1) one snapshot. */
export function step(tl, dir) {
  if (!tl.snapshots.length) return;
  const cur = tl.idx === -1 ? tl.snapshots.length - 1 : tl.idx;
  seekTo(tl, cur + dir);
}

/** Jump to oldest snapshot. */
export function goStart(tl) { seekTo(tl, 0); }

/** Return to live — resume physics, clear seek position. */
export function goLive(tl) {
  tl.idx    = -1;
  tl.paused = false;
  tl._onChange?.({ idx: -1, ts: null, paused: false, live: true });
}

/** Toggle pause/live. */
export function togglePause(tl) {
  if (tl.paused) goLive(tl);
  else {
    tl.paused = true;
    tl._onChange?.({ idx: tl.idx, paused: true });
  }
}

// ── Causal log ────────────────────────────────────────────────────────────────

/**
 * Append an event to the immutable causal log.
 * cls: 'ok' | 'err' | 'warn' | 'cfr'
 */
export function logEvent(tl, cls, data = null) {
  tl.causalLog.push({ ts: Date.now(), cls, data });
  if (tl.causalLog.length > tl.logMax) tl.causalLog.shift();
}

/** Clear snapshots and causal log, reset to live. */
export function clearTimeline(tl) {
  tl.snapshots.length = 0;
  tl.causalLog.length = 0;
  goLive(tl);
}

// ── Serialise / restore (.nex) ────────────────────────────────────────────────

/** Serialise timeline + world field state to a plain object (.nex payload). */
export function serialise(tl) {
  const { world } = tl;
  return {
    _cfr: '1.0',
    ts:   Date.now(),
    field:    { ...world.field },
    attractors: world.attractors.map(a => ({ ...a })),
    causalLog:  tl.causalLog.slice(-200),
    snapshotCount: tl.snapshots.length,
    regime:     world.regime,
    n:          world.N,
  };
}

/**
 * Restore field + attractors from a serialised .nex payload.
 * Does NOT restore particle positions (those would be too large to serialise cleanly).
 */
export function deserialise(tl, pkg) {
  if (!pkg._cfr) throw new Error('Not a CFR .nex payload');
  const { world } = tl;
  if (pkg.field)      Object.assign(world.field, pkg.field);
  if (pkg.attractors) world.attractors = pkg.attractors.map(a => ({ ...a }));
  if (pkg.causalLog)  tl.causalLog.push(...pkg.causalLog);
  tl._onChange?.({ restored: true });
}

// ── onChange hook (optional) ──────────────────────────────────────────────────

/**
 * Register a callback fired on any seek/pause/live/restore change.
 * callback({ idx, ts, paused, live, restored })
 */
export function onTimelineChange(tl, callback) {
  tl._onChange  = callback;
  tl._notifyIdx = (idx) => callback({ idx, ts: tl.snapshots[idx]?.ts ?? null, paused: false });
}
