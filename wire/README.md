# wire

`Component` / `Hook` / `Wire` / `Consumer` — a composition layer built on
[WARP](../warp)'s real `Cause`/`Drawbridge`/`Flow`/`Axiom`. Decoupled as
its own package, sibling to `warp/` and `emergence/` — not a NEXUS
subsystem, not emergence-specific.

## The real problem this exists to fix

Checked `emergence/loop.js` directly: 5 of its 8 components exposed no
facade at all. The orchestrator had to call `flow.emit(cause)` itself,
then reach into `flow.pending` — WARP's own internal bookkeeping array,
growing unboundedly, never meant to be a public API — and manually
`[...pending].reverse().find(...)` the result out. The other 3
components (built later) had real facade methods instead. Two
conventions coexisting by accident of build order, not by design.

## The four types

**`Hook`** — does the emit-and-extract dance once, correctly, so no
component ever hand-rolls it again. Uses `Flow`'s real `.on(type,
handler)` observer (register before emit, capture, unsubscribe) — this
was already the *correct* pattern in one place in `emergence`, just not
used consistently. Never touches `.pending`.

```js
const hook = new Hook('double', {
  flow, causeType: 'double.request', resultType: 'double.result',
  buildCauseData: (n) => ({ n }),
});
await hook.call(21); // -> { value: 42 }
```

**`Component`** — requires every operation to go through a named Hook.
No raw `Flow`/`Drawbridge` access leaks out. Tracks real usage per hook
(who called what, when) — not just a count.

```js
const doubler = new Component('doubler');
doubler.defineHook(hook);
await doubler.call('double', 21, { consumer: 'my-app' });
```

**`Wire`** — a formal, named, independently-testable connection between
two components. Replaces inline, unnamed connection code (currently
buried inside `emergence/loop.js`'s one big function) with a real object
you can test on its own.

```js
const wire = new Wire('double-then-increment', {
  to: incrementer, toHook: 'increment',
  transform: (doublerResult) => doublerResult.value,
});
await wire.carry(doubledResult);
```

**`Consumer`** — a real, named caller. Auto-tags every hook call with
its own name, so `component.consumers()` reflects who actually called
what without every call site remembering to pass `{ consumer: '...' }`
by hand.

```js
const app = new Consumer('app');
await app.call(doubler, 'double', 100);
```

## Status

Built, tested (9 tests including a full real end-to-end network:
`Consumer -> Component -> Wire -> Component`, traced on both ends), not
yet applied. `emergence/`'s 8 components still expose their old, mixed
conventions — 5 with no facade, 3 with ad-hoc facade methods that
predate this package. Retrofitting them onto `wire` (and rebuilding
`loop.js`'s inline connections as real `Wire` objects) is the next
phase, not done here.
