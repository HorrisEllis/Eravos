#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════════
   CHOICE LINT  ·  test/choice-lint.mjs  ·  v0.8.0
   §17.10 — a hard check. Skipping it is not permitted.
   ══════════════════════════════════════════════════════════════════════════

   Every <select> in the app is one of two things, and it must be classified:

     SELF-DESCRIPTION — the person is telling the app something about
       themselves. A closed list here is a claim about what they are allowed
       to be, and the common response to "none of these fit" is to pick the
       nearest wrong one, which then corrupts every derivation reading it
       (§1.2). These MUST be routed through eravosChoiceField.

     SYSTEM — a property of the software: a filter, a config, a model picker.
       A closed list is CORRECT. Bolting "Something else" onto a particle
       density picker would be noise, and noise makes the real rule easier to
       ignore (§0.5).

   The point of the lint is not the two lists. It is that an UNCLASSIFIED
   select FAILS. A new one cannot land without someone deciding which it is,
   which is the decision that would otherwise get skipped.
   ══════════════════════════════════════════════════════════════════════════ */

import { readdirSync, readFileSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/* ── SYSTEM selects: exempt, each with a stated reason (§17.3) ────────── */
const SYSTEM = {
  'r-mode':                  'solo vs duo — an app mode, not a self-description',
  'vault-filter':            'a filter over existing types; "other" would filter nothing',
  'palette-source':          'which palette to read from — a source picker',
  'card-deck':               'which deck to draw from — a source picker',
  'ollama-model-select':     'models the local server actually reports; inventing one would 404',
  'particle-density':        'a render setting',
  'commitment-linked-event': 'populated from real events; an invented event does not exist',
  'planner-location-precision': 'precision levels are a technical property of the geolocation API',
  'cocreate-framework':      'which framework file to load — a source picker',
  'oracle-mode':             'which prompt mode the oracle runs in — software behaviour',
  'gff-somatic-location':    'mounted by the choice field at runtime (see SELF list)',

  // THE BORDERLINE ONE, called out rather than quietly filed (§0.1).
  // `rup-status` is a state machine that relational-health derivations read.
  // A free-text status would break every consumer, so a closed list is
  // correct HERE — but the limitation is real: "still there, we just don't
  // talk about it" fits none of open/healing/resolved. Fix is a free-text
  // "in your words" field ALONGSIDE the status, not replacing it. Tracked in
  // spec/PHASEMAP-v3.md Phase G. Not silently accepted as fine.
  'gl-owner':                'ownership feeds the goals state machine — takeUp() promotes proposed->ours, and a free-text owner would break it. Unlike rup-status this needs no companion field: "mine" and "propose as ours" are genuinely exhaustive, and "theirs" is set by THEM, not chosen here.',
  'rup-status':              'a state machine read by relational-health derivations. DEBT PAID in v0.9.0: #rup-status-note carries the person\'s own words alongside it, so nobody has to pick the nearest wrong one.',
};

/* ── SELF-DESCRIPTION: must be routed. Missing routing FAILS. ─────────── */
const SELF = [
  'somatic-location', 'somatic-quality',   // where and how it sits in the body
  'grow-cat',                              // what kind of growth this was
  'commitment-level',                      // how binding this is to them
  'mythos-type', 'mythos-tone',            // their own myth, their own register
  'codex-type',                            // what kind of thing they wrote
  'planner-type',                          // what kind of event this is to them
  'mutator-style',                         // their aesthetic
  'music-vibe',                            // their mood
  'canvas-mode',                           // what kind of writing this is to them
  'idea-category',                         // their own categories
  'poem-form',                             // people invent forms
  'rel-stage',                             // where their relationship is — the
                                           //   closed list most likely to fit nobody
  'rel-domain',                            // which part of it they mean
  'ritual-mode',                           // solo/couple/group is not everyone's shape
  'ritual-duration',                       // "however long it takes" is an answer
];

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    if (e === 'node_modules' || e === '.git' || e === 'data') continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.html')) out.push(p);
  }
  return out;
}

const files = walk(ROOT);
const found = new Map();               // id -> file
for (const f of files) {
  const html = readFileSync(f, 'utf8');
  for (const m of html.matchAll(/<select[^>]*\bid=["']([^"']+)["']/g)) {
    found.set(m[1], f.replace(ROOT + '/', ''));
  }
  for (const m of html.matchAll(/<select(?![^>]*\bid=)/g)) {
    found.set('(anonymous) in ' + f.replace(ROOT + '/', ''), f.replace(ROOT + '/', ''));
  }
}

// Routing is asserted against the real boot call, not against a comment.
const boot = readFileSync(join(ROOT, 'shared/eravos-kernel.js'), 'utf8');
const routed = new Set(
  [...boot.matchAll(/^\s*'([a-z0-9_-]+)'\s*:/gmi)].map(m => m[1])
    .filter(id => SELF.includes(id))
);

const errors = [];
for (const [id, file] of found) {
  if (id.startsWith('(anonymous)')) {
    errors.push(`UNCLASSIFIABLE  ${id} — a <select> with no id cannot be classified or routed`);
    continue;
  }
  const isSelf = SELF.includes(id);
  const isSys = Object.prototype.hasOwnProperty.call(SYSTEM, id);
  if (!isSelf && !isSys) {
    errors.push(
      `UNCLASSIFIED    #${id}  (${file})\n` +
      `                Decide which it is and add it to SELF or SYSTEM in this file.\n` +
      `                SELF = the person describes themselves -> must offer "Something else".\n` +
      `                SYSTEM = a property of the software -> a closed list is correct.`);
    continue;
  }
  if (isSelf && isSys) errors.push(`AMBIGUOUS       #${id} is in BOTH lists`);
  if (isSelf && !routed.has(id)) {
    errors.push(
      `NOT ROUTED      #${id}  (${file})\n` +
      `                Classified SELF but not passed to eravosChoiceField.mountAll()\n` +
      `                in shared/eravos-kernel.js. A closed list here is a claim about\n` +
      `                what this person is allowed to be.`);
  }
}
for (const id of SELF) {
  if (!found.has(id)) errors.push(`STALE           #${id} is in SELF but no <select> with that id exists`);
}

const selfCount = SELF.filter(id => found.has(id)).length;
console.log(`choice-lint: ${found.size} selects — ${selfCount} self-description, ${found.size - selfCount} system`);
if (errors.length) {
  console.log('\nBLOCKED:\n');
  errors.forEach(e => console.log('  ✗ ' + e + '\n'));
  process.exit(1);
}
console.log('choice-lint: every select is classified, and every self-description one is routed ✓');
