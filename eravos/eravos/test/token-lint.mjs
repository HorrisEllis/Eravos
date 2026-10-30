#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════════
   TOKEN LINT  ·  test/token-lint.mjs  ·  v0.9.0
   §17.10 hard check · 01-ARCHITECTURE.md §2 — no tab defines its own palette.
   ══════════════════════════════════════════════════════════════════════════

   The hex check in the promote gate only ever looked at tab STYLESHEETS.
   It never looked at inline `style="..."` attributes in HTML, which is where
   the violations actually were: rgba(0,229,204,.12) — `--teal` at 12% —
   appeared 24 times, written by hand. A literal does not follow the palette,
   so it is drift by construction.

   This closes that hole. It checks:
     1. no colour literal in any inline style attribute
     2. no colour literal in any tab stylesheet
     3. no `var(--x, #fallback)` anywhere — a fallback is a literal in a
        var() costume, and it silently bypasses the theme when the token is
        absent. If a token is missing, DECLARE it.
     4. every var(--token) referenced actually exists in the kernel :root

   (4) is the one that catches the next failure rather than this one: a
   typo'd token name currently renders as nothing at all, silently.
   ══════════════════════════════════════════════════════════════════════════ */

import { readdirSync, readFileSync, statSync } from 'fs';
import { join, dirname, relative } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LITERAL = /#[0-9a-fA-F]{3,8}\b|rgba?\(\s*\d/;
// Only COLOUR fallbacks are the problem. var(--drift, 30px) is a length
// default for a JS-driven animation and is legitimate — the first draft of
// this lint forbade all fallbacks and flagged it, which is the cry-wolf
// failure again (§0.5).
const FALLBACK = /var\(\s*--[a-z0-9-]+\s*,\s*(#[0-9a-fA-F]{3,8}|rgba?\()/;

// The kernel stylesheet declares the palette; it is allowed literals.
const DECLARES_PALETTE = 'shared/eravos-kernel.css';

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    if (['node_modules', '.git', 'data', 'vendor'].includes(e)) continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(html|css)$/.test(p)) out.push(p);
  }
  return out;
}

const kernelCss = readFileSync(join(ROOT, DECLARES_PALETTE), 'utf8');
// The :root block declares several tokens per line, so an anchored regex
// misses most of them — the first draft of this lint reported --amber as
// undeclared. A lint that cries wolf gets ignored, which is worse than no
// lint (§0.5). Match declarations anywhere, not just at line start.
const declared = new Set([...kernelCss.matchAll(/(--[a-z0-9-]+)\s*:/g)].map(m => m[1]));

const errors = [];
let inlineChecked = 0, cssChecked = 0;

for (const file of walk(ROOT)) {
  const rel = relative(ROOT, file);
  const src = readFileSync(file, 'utf8');

  if (rel === DECLARES_PALETTE) {
    // still forbidden a fallback, even here
    if (FALLBACK.test(src)) errors.push(`${rel}: var() fallback in the palette file itself`);
  } else if (file.endsWith('.css')) {
    cssChecked++;
    const hits = src.match(new RegExp(LITERAL.source, 'g')) || [];
    if (hits.length) errors.push(`${rel}: colour literal in stylesheet — ${[...new Set(hits)].slice(0, 4).join(', ')}`);
    if (FALLBACK.test(src)) errors.push(`${rel}: var(--x, fallback) — a literal in a var() costume. Declare the token instead.`);
  } else {
    for (const m of src.matchAll(/style="([^"]*)"/g)) {
      inlineChecked++;
      const hits = m[1].match(new RegExp(LITERAL.source, 'g')) || [];
      if (hits.length) {
        errors.push(`${rel}: colour literal in an inline style — ${[...new Set(hits)].join(', ')}\n` +
                    `        A literal does not follow the palette. Declare a token in ${DECLARES_PALETTE}.`);
      }
      if (FALLBACK.test(m[1])) errors.push(`${rel}: var() fallback in an inline style`);
    }
  }

  // (4) every referenced token must exist -- in the palette OR declared
  // locally in the same file. A locally-scoped custom property is legitimate
  // (eravos-fluid.css scopes --fl-rule to three panels); the first draft of
  // this lint flagged it, which is the cry-wolf failure again.
  const local = new Set([...src.matchAll(/(--[a-z0-9-]+)\s*:/g)].map(m => m[1]));
  for (const m of src.matchAll(/var\(\s*(--[a-z0-9-]+)\s*\)/g)) {
    if (!declared.has(m[1]) && !local.has(m[1]) && m[1] !== '--feeling-color') {
      errors.push(`${rel}: var(${m[1]}) is not declared in ${DECLARES_PALETTE} — it renders as nothing, silently`);
    }
  }
}

// §16.5 — a retired theme cannot come back by accident. Added after the
// theme picker card was found STILL SHIPPING in v0.11.0, calling a no-op
// shim: an interface that pretends to offer a choice it cannot make.
const RETIRED_THEMES = ['raven-theme', 'golden-theme', 'romeo-theme'];
for (const file of walk(ROOT)) {
  const rel = relative(ROOT, file);
  if (rel.startsWith('test/') || rel === 'ALK-CHANGELOG.md') continue;
  const src = readFileSync(file, 'utf8');
  for (const th of RETIRED_THEMES) {
    // the admin tab NAMES them in copy explaining they are retired; that is
    // documentation, not a live reference
    if (src.includes(th) && !rel.startsWith('tabs/admin/')) {
      errors.push(`${rel}: references retired theme "${th}" — it was removed in v0.5.0`);
    }
  }
}

console.log(`token-lint: ${cssChecked} stylesheets, ${inlineChecked} inline styles, ${declared.size} tokens declared`);
if (errors.length) {
  console.log('\nBLOCKED:\n');
  [...new Set(errors)].forEach(e => console.log('  ✗ ' + e));
  process.exit(1);
}
console.log('token-lint: no colour literals, no var() fallbacks, every token declared ✓');
