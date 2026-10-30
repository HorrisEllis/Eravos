/**
 * @module       cfr/render
 * @uuid         c3f4a5b6-d7e8-4901-abcd-f01234567890
 * @version      1.0.0
 *
 * Constraint Field Runtime — Projection + Canvas Renderer
 * Perspective projection, MVP matrix, Canvas 2D particle draw.
 * Bring your own canvas element — no document.getElementById inside the core.
 *
 * Usage (browser):
 *   import { createCamera, buildMVP, project, drawParticles2D } from 'cfr-kernel/render';
 *   const cam = createCamera();
 *   const mvp = buildMVP(cam, canvas.width, canvas.height);
 *   drawParticles2D(ctx, world, mvp, canvas.width, canvas.height);
 */

'use strict';

// ── Matrix math ───────────────────────────────────────────────────────────────

function mat4id() { return new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]); }

function persp(fov, asp, n, f) {
  const t = 1 / Math.tan(fov / 2), nf = 1 / (n - f), m = new Float32Array(16);
  m[0]=t/asp; m[5]=t; m[10]=(f+n)*nf; m[11]=-1; m[14]=2*f*n*nf; return m;
}

function rotX(r) {
  const c=Math.cos(r), s=Math.sin(r), m=mat4id();
  m[5]=c; m[9]=-s; m[6]=s; m[10]=c; return m;
}

function rotY(r) {
  const c=Math.cos(r), s=Math.sin(r), m=mat4id();
  m[0]=c; m[8]=s; m[2]=-s; m[10]=c; return m;
}

function mul(a, b) {
  const o = new Float32Array(16);
  for (let c=0; c<4; c++) for (let r=0; r<4; r++) {
    let s=0; for (let k=0; k<4; k++) s+=a[k*4+r]*b[c*4+k];
    o[c*4+r]=s;
  }
  return o;
}

function trans(m, x, y, z) {
  const o = new Float32Array(m);
  o[12]=m[0]*x+m[4]*y+m[8]*z+m[12];
  o[13]=m[1]*x+m[5]*y+m[9]*z+m[13];
  o[14]=m[2]*x+m[6]*y+m[10]*z+m[14];
  o[15]=m[3]*x+m[7]*y+m[11]*z+m[15];
  return o;
}

// ── Camera ────────────────────────────────────────────────────────────────────

/**
 * Create a camera descriptor.
 * @param {object} opts
 * @param {number} opts.rotX  - X rotation degrees (default -25)
 * @param {number} opts.rotY  - Y rotation degrees (default 0)
 * @param {number} opts.fov   - field of view radians (default 0.72)
 * @param {number} opts.dist  - camera distance (default 18)
 */
export function createCamera(opts = {}) {
  return {
    rotX: opts.rotX ?? -25,
    rotY: opts.rotY ?? 0,
    fov:  opts.fov  ?? 0.72,
    dist: opts.dist ?? 18,
  };
}

/**
 * Build the MVP matrix from camera + viewport dimensions.
 */
export function buildMVP(cam, W, H) {
  const rx = cam.rotX * Math.PI / 180;
  const ry = cam.rotY * Math.PI / 180;
  return mul(
    persp(cam.fov, (W || 1) / (H || 1), 0.5, 150),
    trans(mul(rotX(rx), rotY(ry)), 0, 0, -cam.dist),
  );
}

/**
 * Project a 3D world position to 2D canvas coordinates.
 * Returns null if behind camera.
 */
export function project(px, py, pz, mvp, W, H) {
  const cx = mvp[0]*px + mvp[4]*py + mvp[8]*pz  + mvp[12];
  const cy = mvp[1]*px + mvp[5]*py + mvp[9]*pz  + mvp[13];
  const cw = mvp[3]*px + mvp[7]*py + mvp[11]*pz + mvp[15];
  if (cw <= 0.001) return null;
  return { x: (cx/cw * 0.5 + 0.5) * W, y: (-cy/cw * 0.5 + 0.5) * H };
}

// ── Canvas 2D renderer ────────────────────────────────────────────────────────

/**
 * Draw all particles to a Canvas 2D context.
 * @param {CanvasRenderingContext2D} ctx
 * @param {World} world
 * @param {Float32Array} mvp
 * @param {number} W
 * @param {number} H
 * @param {object} opts
 * @param {string}   opts.colorFn    - (speed: 0-1) => css color string (optional)
 * @param {number}   opts.pointSize  - base point radius (default 1.2)
 */
export function drawParticles2D(ctx, world, mvp, W, H, opts = {}) {
  const { posX, posY, posZ, pSpeed, N } = world;
  const { pointSize = 1.2, colorFn } = opts;
  const defaultColor = colorFn ?? ((s) => `rgba(0,${Math.round(180+s*75)},${Math.round(100+s*155)},${0.55+s*0.45})`);

  const step = N > 20000 ? 5 : N > 10000 ? 3 : N > 5000 ? 2 : 1;

  ctx.save();
  for (let i = 0; i < N; i += step) {
    const s = project(posX[i], posY[i], posZ[i], mvp, W, H);
    if (!s) continue;
    const sp = pSpeed[i];
    ctx.beginPath();
    ctx.arc(s.x, s.y, pointSize + sp * 0.8, 0, Math.PI * 2);
    ctx.fillStyle = defaultColor(sp);
    ctx.fill();
  }
  ctx.restore();
}

/**
 * Draw attractor nodes as labelled circles on an overlay context.
 * @param {CanvasRenderingContext2D} ctx
 * @param {World} world
 * @param {Float32Array} mvp
 * @param {number} W
 * @param {number} H
 * @param {object} opts
 * @param {Function} opts.colorFn  - (type: string) => css color
 */
export function drawAttractors2D(ctx, world, mvp, W, H, opts = {}) {
  const { colorFn } = opts;
  const defaultColor = colorFn ?? (() => '#00cfff');

  ctx.save();
  ctx.font = '11px monospace';
  for (const at of world.attractors) {
    const s = project(at.x, at.y, at.z, mvp, W, H);
    if (!s) continue;
    const col = defaultColor(at.type ?? 'default');
    ctx.beginPath();
    ctx.arc(s.x, s.y, 14, 0, Math.PI * 2);
    ctx.strokeStyle = col;
    ctx.lineWidth   = 1.5;
    ctx.stroke();
    ctx.fillStyle = col;
    ctx.fillText(at.label ?? at.id, s.x + 18, s.y + 4);
  }
  ctx.restore();
}
