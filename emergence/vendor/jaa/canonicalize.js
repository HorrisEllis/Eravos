'use strict';
/**
 * canonicalize.js — ported from Jaa/src/Persistence/Canonicalize.php.
 * Not a reimplementation from scratch: same algorithm, translated line
 * for line. Deterministic JSON serialization — same content always
 * produces the same string, object keys sorted recursively, arrays
 * preserve order. This determinism is what makes SHA-256(canonical(x))
 * a stable content address.
 */

function canonicalize(value) {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') {
    if (Number.isInteger(value)) return String(value);
    return JSON.stringify(value);
  }
  if (typeof value === 'string') return JSON.stringify(value);

  if (Array.isArray(value)) {
    const items = value.map(v => canonicalize(v));
    return '[' + items.join(',') + ']';
  }

  if (typeof value === 'object') {
    const keys = Object.keys(value).sort();
    const pairs = [];
    for (const k of keys) {
      if (value[k] === undefined) continue; // PHP's array_key_exists check translates to: skip genuinely-absent keys
      pairs.push(JSON.stringify(k) + ':' + canonicalize(value[k]));
    }
    return '{' + pairs.join(',') + '}';
  }

  throw new Error(`Cannot canonicalize type: ${typeof value}`);
}

module.exports = { canonicalize };
