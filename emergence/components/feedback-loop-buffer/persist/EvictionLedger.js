'use strict';
/**
 * EvictionLedger — append-only NDJSON record of every eviction.
 *
 * WARP's own FlowLog already records every dispatch step (drawbridge
 * claimed, axiom result) — but its entry shape is generic (§ generic
 * across all WARP consumers, by design). This ledger is the ring
 * buffer's own domain-specific record of *what value left the buffer
 * and when*, which FlowLog deliberately doesn't know about. Two
 * ledgers, two owners (§17.1): FlowLog owns dispatch history, this owns
 * eviction history.
 *
 * Wired via Flow.on('ring:evicted', ...) — an observer, not a second
 * Drawbridge, so it can never collide with the registered ring:push
 * Drawbridge (§14.3 signature collision is a hard error) and can never
 * block or mutate the pipeline (§1.2-equivalent guarantee Flow.on()
 * already gives every observer).
 */

const fs = require('fs');
const path = require('path');

class EvictionLedger {
  constructor(filePath) {
    this.filePath = path.resolve(filePath);
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
  }

  /** Attach to a live WARP Flow. Call once per flow. */
  attach(flow) {
    flow.on('ring:evicted', (cause) => {
      this.append({ value: cause.data.value, index: cause.data.index, ts: cause.ts, uuid: cause.uuid });
    });
  }

  append(entry) {
    fs.appendFileSync(this.filePath, JSON.stringify(entry) + '\n');
  }

  /** Last n eviction entries, oldest-first within the window. */
  tail(n = 50) {
    if (!fs.existsSync(this.filePath)) return [];
    const lines = fs.readFileSync(this.filePath, 'utf8').trim().split('\n').filter(Boolean);
    return lines.slice(-n).map(l => {
      try { return JSON.parse(l); } catch { return null; }
    }).filter(Boolean);
  }

  count() {
    if (!fs.existsSync(this.filePath)) return 0;
    const raw = fs.readFileSync(this.filePath, 'utf8').trim();
    return raw ? raw.split('\n').filter(Boolean).length : 0;
  }
}

module.exports = { EvictionLedger };
