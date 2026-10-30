# feedback-loop-buffer

A component of **Emergence** (see `../../emergence.spec`) — implements Emerge's
`feedback` + `loop` primitives (domain "signal"): a fixed-capacity,
overwrite-oldest window that lets an output become the next input. Not a
general-purpose utility — this is specifically what closes the loop between
an observer component (rfr2: maps conditions and relations) and a creator
component (CFR: turns observation into structure). Full role declaration in
[`component.spec`](./component.spec), written in Emerge.

Built on [WARP](../../../warp) — the external foundation this entire project
is built on, not a vendored copy — via its `Event`/`Gate`/`Axiom`/`Stream`/`StreamLog`
primitives — one shared copy at the project root, not vendored per-component.

Built bottom-up per AXIOMS §3.4 (raw execution before interfaces): the core
buffer works standalone with zero WARP, zero API, zero CLI involved — each
layer above it is a thin, separately-testable wrapper, built and proven in
order: **core → WARP wiring → persistence → diagnostics → API → CLI.**

## Layout

```
core/RingBufferCore.js   pure circular buffer — no I/O, no WARP, no globals
core/wire.js             WARP Gate + 3 Axioms wrapping the core
persist/FilePersistence.js  JSON snapshot to disk, atomic write, survives restart
persist/EvictionLedger.js   append-only NDJSON record of every eviction
diagnostics/health.js    continuous health check, computed fresh every call
api/server.js            zero-dependency HTTP API
cli/ring-cli.js          CLI talking to the API over HTTP
index.js                 top-level facade — usable as a library with none of the above
test/ringbuffer.test.js  43 tests, zero-dep runner, run with `node test/ringbuffer.test.js`
```

## As a library (no API/CLI needed)

```js
const { RingBuffer } = require('./index');

const rb = new RingBuffer({ capacity: 256, dataDir: './data' });
const result = rb.push({ hello: 'world' });
// { index, wasFull, evicted, value }

rb.tail(10);       // last 10 items, oldest-first
rb.health();        // continuous diagnostic snapshot
rb.evictions(20);   // last 20 eviction records
rb.save();           // force an immediate snapshot (also autosaves every 10 pushes by default)
```

Restarting with the same `dataDir` recovers exact prior state from disk —
capacity comes from the snapshot if one exists, and requesting a conflicting
capacity throws rather than silently picking one.

## As an API

```
RING_CAPACITY=256 RING_DATA_DIR=./data PORT=7100 node api/server.js
```

| Route | Method | Body / Query | Response |
|---|---|---|---|
| `/push` | POST | `{ "value": any }` | `{ ok, index, wasFull, evicted }` |
| `/tail` | GET | `?n=10` | `{ items: [...] }` |
| `/status` | GET | — | health snapshot |
| `/evictions` | GET | `?n=20` | `{ evictions: [...] }` |
| `/save` | POST | — | forces an immediate snapshot |

No auth — this is a local/trusted-network primitive, not meant to be exposed
to the open internet as-is.

## As a CLI

```
RING_PORT=7100 node cli/ring-cli.js push '"a value"'
RING_PORT=7100 node cli/ring-cli.js tail 10
RING_PORT=7100 node cli/ring-cli.js status
RING_PORT=7100 node cli/ring-cli.js evictions
RING_PORT=7100 node cli/ring-cli.js save
```

Requires a running `api/server.js` — the CLI is a thin HTTP client, nothing more.

## Axioms

| id | severity | rule |
|---|---|---|
| `ring:no-undefined` | hard | rejects `undefined` (indistinguishable from an empty slot) |
| `ring:no-function` | hard | rejects functions (can't survive a JSON snapshot) |
| `ring:size-budget` | soft | warns past a configurable per-item byte budget (default 64KB) — never blocks |

Hard axiom violations throw and leave buffer state untouched. Every rejection
is logged in `StreamLog`, never silent.

## Testing

```
node test/ringbuffer.test.js
```

43 tests across 6 layers: core in isolation, Gate/Axiom in isolation (no
Stream involved, per WARP's own design goal for `Gate`), full WARP wiring,
persistence (including corrupt-file and wrong-shape-file handling), the
eviction ledger, and full facade integration (restart recovery, capacity
conflicts, autosave, high-volume correctness). Also verified with a live
integration run — real server process, real CLI process, real HTTP calls —
not just unit-level assertions.

## Known gaps

- HTTP only, no TCP/WS transport — add if/when a consumer actually needs it.
- No auth on the API.
- `EvictionLedger` and `FilePersistence` don't share an abstraction yet —
  acceptable until a second persistence-backed component in this codebase
  actually needs the same shape (§16.4: generalize after repetition, not
  before).

Full design rationale and decision record: [`ring-buffer.spec`](./ring-buffer.spec).
