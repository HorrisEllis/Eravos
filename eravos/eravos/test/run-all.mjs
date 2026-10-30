// §12.1 — one command, whole suite. §17.10 verify before promote.
import { spawnSync } from 'child_process';
import { readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
const here = dirname(fileURLToPath(import.meta.url));
const files = readdirSync(here).filter(f => f.endsWith('.test.mjs')).sort();

// §17.10 — the lint is a HARD CHECK, not an optional extra, so it runs as
// part of the suite rather than as something someone has to remember. It
// fails the build on any <select> that is unclassified, or classified
// self-description and not routed through the choice primitive.
let lintFailed = 0;
for (const name of ['choice-lint', 'token-lint', 'boot-order']) {
  const r = spawnSync(process.execPath, [join(here, name + '.mjs')], { encoding: 'utf8' });
  process.stdout.write('\n══ ' + name + ' ' + '═'.repeat(Math.max(0, 58 - name.length)) + '\n' +
                       (r.stdout || '') + (r.stderr || ''));
  if (r.status !== 0) lintFailed++;
}
let total = 0, failed = 0;
for (const f of files) {
  console.log('\n══ ' + f + ' ' + '═'.repeat(Math.max(0, 60 - f.length)));
  const r = spawnSync(process.execPath, [join(here, f)], { encoding: 'utf8' });
  const out = (r.stdout || '') + (r.stderr || '');
  process.stdout.write(out.split('\n').filter(l => !/MODULE_TYPELESS|Reparsing|trace-warnings|"type": "module"/.test(l)).join('\n'));
  const m = out.match(/(\d+) passed, (\d+) failed/);
  if (m) { total += +m[1]; failed += +m[2]; }
  if (r.status !== 0 && !m) failed++;
}
console.log('\n' + '═'.repeat(64));
console.log(`TOTAL: ${total} passed, ${failed} failed across ${files.length} files` +
            (lintFailed ? `   +  ${lintFailed} lint(s) BLOCKED` : '   +  lints ✓'));
process.exit(failed || lintFailed ? 1 : 0);
