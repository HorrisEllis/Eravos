#!/usr/bin/env node
'use strict';
/**
 * cli.js — the missing way in. Until now the only way to run text
 * through the loop was `require('./loop.js')` from another script.
 *
 * Two modes:
 *
 *   Interactive (no args):
 *     node cli.js
 *     node cli.js --target-id=end-state:repair-complete --target-type=end-state --target-mass=15
 *
 *   Single-shot (for scripting / piping):
 *     node cli.js --text="some text to observe"
 *     echo "some text" | node cli.js
 *
 * Env: EMERGENCE_DATA_DIR (default ./data) — persists across runs,
 * same folder = same continuing history.
 */

const readline = require('readline');
const path = require('path');
const { createEmergenceLoop } = require('./loop.js');

function parseArgs(argv) {
  const out = {};
  for (const arg of argv) {
    const m = arg.match(/^--([^=]+)=(.*)$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

function buildTarget(args) {
  if (!args['target-id']) return undefined;
  return {
    id: args['target-id'],
    type: args['target-type'] || 'end-state',
    mass: args['target-mass'] ? Number(args['target-mass']) : 15,
  };
}

function formatResult(r) {
  const lines = [];
  lines.push(`  trajectory: ${r.observation.trajectory}  meaning: ${r.observation.meaning_charge}  decay: ${r.observation.decay_score}  rupture: ${r.observation.rupture_active}`);

  // BUG FIX: this function used to stop here -- loop.js itself used to
  // drop all 9 real Liminal gap signals before they ever reached the
  // CLI (see schemas/test/schemas.test.js and loop.test.js's regression
  // test for the full story). Now that loop.js surfaces them, display
  // any that actually fired -- silently ignoring them here would be the
  // same bug one layer up the stack.
  const GAP_SIGNALS = ['oscillatory', 'relationalGaps', 'reversal', 'negativeSpace', 'shadow', 'assumption', 'structural', 'existential', 'contrastive'];
  const fired = GAP_SIGNALS.filter(key => r.observation[key]);
  if (fired.length) {
    lines.push(`  signals: ${fired.map(key => {
      const sig = r.observation[key];
      const note = key === 'assumption' ? ' (low-confidence -- fires on ordinary statements too)' : '';
      return `${key}${sig.subtype ? `/${sig.subtype}` : ''}${note}`;
    }).join(', ')}`);
  }
  // affectiveField and resonanceAnalysis are both real, never-null signals
  // (see rfr2-observer/index.js's calibration notes) -- shown compactly,
  // not silently dropped, same lesson as GAP_SIGNALS above.
  const ra = r.observation.resonanceAnalysis;
  if (ra) {
    const gapNote = ra.gaps?.detectors?.length ? ` | logical gaps: ${ra.gaps.detectors.map(d => d.type).join(', ')}` : '';
    lines.push(`  resonance: ${ra.emotion.primary.emotion} (${(ra.emotion.primary.confidence * 100).toFixed(0)}%), gap_score ${ra.gap_score}, ${ra.friction.zone}${gapNote}`);
  }

  if (r.created.target) {
    lines.push(`  target: ${r.created.target.id} (${r.created.target.type})` +
      (r.created.cluster ? `  -> CONVERGED (density ${r.created.cluster.density}, ${r.created.cluster.sig})` : '  -> not yet converged'));
  } else {
    lines.push(`  no target set -- field running untargeted`);
  }
  lines.push(`  lattice: node ${r.lattice.nodeId}${r.lattice.edge ? `, resonance ${r.lattice.edge.weight} with prior` : ''}`);
  lines.push(`  causal: ${r.causal.edgeType || '(first creation)'}${r.causal.dt !== null ? ` (dt=${r.causal.dt})` : ''}`);
  lines.push(`  ledger: committed ${r.ledger.id.slice(0, 8)}...`);
  if (r.endStateConditions) {
    lines.push(`  >>> END-STATE REACHED -- reverse causal trace (${r.endStateConditions.path.length} steps back):`);
    for (const c of r.endStateConditions.conditions) {
      lines.push(`      ${c.nodeId}: ${(c.invariants || []).join(', ')}`);
    }
  }
  if (r.pattern.recall.seenBefore) {
    lines.push(`  pattern: seen ${r.pattern.recall.count}x before (first: ${r.pattern.recall.priorNodeIds[0]})`);
  }
  if (r.pattern.prediction) {
    lines.push(`  predicted next: ${(r.pattern.prediction.confidence * 100).toFixed(0)}% confidence based on ${r.pattern.prediction.candidateCount} real prior transition(s)`);
  }
  return lines.join('\n');
}

async function singleShot(text, target, dataDir) {
  const loop = createEmergenceLoop({ dataDir });
  const r = await loop.tick(text, target);
  console.log(formatResult(r));
}

async function interactive(target, dataDir) {
  const loop = createEmergenceLoop({ dataDir });
  console.log('Emergence -- type text and press enter. Ctrl+C to exit.');
  console.log(target ? `Pursuing target: ${target.type}:${target.id} (mass ${target.mass})` : 'No target set -- pass --target-id=... to pursue one, or type ":target <id> <type> <mass>"');
  console.log(`Data dir: ${dataDir}`);
  console.log('');

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: '> ' });
  let currentTarget = target;
  rl.prompt();

  rl.on('line', async (line) => {
    const text = line.trim();
    if (!text) { rl.prompt(); return; }

    if (text.startsWith(':target')) {
      const parts = text.split(/\s+/);
      currentTarget = { id: parts[1], type: parts[2] || 'end-state', mass: parts[3] ? Number(parts[3]) : 15 };
      console.log(`target set: ${currentTarget.type}:${currentTarget.id} (mass ${currentTarget.mass})`);
      rl.prompt();
      return;
    }
    if (text === ':history') {
      const h = loop.history(5);
      console.log(JSON.stringify(h, null, 2));
      rl.prompt();
      return;
    }
    if (text === ':sigma') {
      console.log(JSON.stringify(loop.sigma()));
      rl.prompt();
      return;
    }

    try {
      const r = await loop.tick(text, currentTarget);
      currentTarget = r.created.target || currentTarget; // stay in sync with the real feedback mechanism
      console.log(formatResult(r));
    } catch (e) {
      console.error('error:', e.message);
    }
    console.log('');
    rl.prompt();
  });

  rl.on('close', () => {
    console.log('\ndone.');
    process.exit(0);
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const dataDir = process.env.EMERGENCE_DATA_DIR || path.join(process.cwd(), 'data');
  const target = buildTarget(args);

  if (args.text) {
    await singleShot(args.text, target, dataDir);
    return;
  }

  if (!process.stdin.isTTY) {
    // piped input: read all of stdin, treat as one tick (or one per line if multiline)
    let input = '';
    process.stdin.setEncoding('utf8');
    for await (const chunk of process.stdin) input += chunk;
    const lines = input.split('\n').map(l => l.trim()).filter(Boolean);
    const loop = createEmergenceLoop({ dataDir });
    let currentTarget = target;
    for (const line of lines) {
      const r = await loop.tick(line, currentTarget);
      currentTarget = r.created.target || currentTarget;
      console.log(`--- ${line.slice(0, 50)}`);
      console.log(formatResult(r));
      console.log('');
    }
    return;
  }

  await interactive(target, dataDir);
}

main().catch(e => { console.error('FAILED:', e.stack); process.exit(1); });
