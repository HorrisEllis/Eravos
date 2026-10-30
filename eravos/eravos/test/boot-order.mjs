#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════════
   BOOT ORDER LINT  ·  test/boot-order.mjs  ·  v0.20.0
   §17.10 hard check. Part of run-all.
   ══════════════════════════════════════════════════════════════════════════

   eravos-kernel.js constructs its engines AT PARSE TIME:

       const eravosChat = (typeof ChatEngine !== 'undefined') ? new ChatEngine(...) : null;

   That guard exists so the kernel degrades instead of throwing. But it also
   means a class loading AFTER the kernel produces a permanently null global
   and NO ERROR AT ALL. The tab renders, every button is there, and nothing
   happens.

   Six engines were dead exactly this way — chat, choice, grammar, pairing,
   presence, select-grammar — through several releases, with a full green
   test suite. The tests construct engines directly with `new`; they never
   went through the browser's load order, so they could not see it (§1.1:
   passing tests are not proof it runs).

   This is the check that would have caught it on day one.
   ══════════════════════════════════════════════════════════════════════════ */

import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
const kernelSrc = readFileSync(join(ROOT, 'shared', 'eravos-kernel.js'), 'utf8');

// Match nested paths too — shared/alk/unmet-needs.js is as much a script tag
// as shared/eravos-chat.js, and the first regex could not see it.
const order = [...html.matchAll(/<script src="shared\/([a-z0-9\-\/]+)\.js"><\/script>/g)].map(m => m[1]);
const kernelAt = order.indexOf('eravos-kernel');

const errors = [];
if (kernelAt === -1) errors.push('eravos-kernel.js is not loaded from index.html at all');

// every global the kernel builds at parse time, and the class it needs
const ctors = [...kernelSrc.matchAll(/^const (eravos[A-Za-z]+) = \(typeof ([A-Za-z]+) !== 'undefined'/gm)]
  .map(m => ({ global: m[1], cls: m[2] }));

// Walk SUBDIRECTORIES too. The first version only read shared/*.js and
// reported UnmetNeeds as "defined nowhere" when it was sitting in
// shared/alk/ — the same scope gap the token lint had with nested tab CSS.
// A lint that cannot see half the tree is a lint that will miss the next one.
function walkJs(dir, prefix = '') {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'vendor' || e.name === 'node_modules') continue;
    if (e.isDirectory()) out.push(...walkJs(join(dir, e.name), prefix + e.name + '/'));
    else if (e.name.endsWith('.js')) out.push(prefix + e.name);
  }
  return out;
}
const files = walkJs(join(ROOT, 'shared'));
const owners = {};
for (const f of files) {
  const src = readFileSync(join(ROOT, 'shared', f), 'utf8');
  for (const m of src.matchAll(/global\.([A-Za-z]+)\s*=/g)) owners[m[1]] = f.replace('.js', '');
}

for (const c of ctors) {
  const owner = owners[c.cls];
  if (!owner) {
    errors.push(`${c.global} needs class ${c.cls}, which no file in shared/ defines`);
    continue;
  }
  const at = order.indexOf(owner);
  if (at === -1) {
    errors.push(`${c.global} needs ${c.cls} from ${owner}.js — that file is never loaded`);
  } else if (at > kernelAt) {
    errors.push(
      `${c.global} would be PERMANENTLY NULL.\n` +
      `                ${owner}.js loads at ${at}, the kernel at ${kernelAt}.\n` +
      `                The typeof guard means this fails SILENTLY — the tab renders,\n` +
      `                nothing works, no error is thrown. Move it above the kernel.`);
  }
}

console.log(`boot-order: ${ctors.length} parse-time engines, kernel at index ${kernelAt} of ${order.length}`);
if (errors.length) {
  console.log('\nBLOCKED:\n');
  errors.forEach(e => console.log('  ✗ ' + e + '\n'));
  process.exit(1);
}
console.log('boot-order: every engine class loads before the kernel that constructs it ✓');
