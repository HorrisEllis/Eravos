# Emergence

A tool that reads text -- conversations, messages, journal entries -- and
tells you things about it: the emotional tone, whether it's trending
better or worse, and whether it's showing patterns like gaslighting,
mixed signals, or things being avoided.

You can also give it a goal ("repair this relationship," "reach this
idea") and it will track how close the conversation is getting to that
goal over time, and show you what led there.

Everything it finds is saved, so you can look back at the full history
later, even after closing and reopening it.

---

## What you need

Just [Node.js](https://nodejs.org) installed -- version 14 or newer.
Nothing else to install. No internet connection needed once you have it.

## Getting started

1. Unzip the folder you were given. You'll see two folders side by side:
   `warp` and `emergence`. Leave them side by side -- `emergence` depends
   on `warp` being right next to it.

2. Open a terminal (Command Prompt or PowerShell on Windows, Terminal on
   Mac) and go into the `emergence` folder:

   ```
   cd path/to/emergence
   ```

3. Check that everything works on your computer:

   ```
   node test/loop.test.js
   ```

   You should see a list of lines ending in `ok`, and a final line like
   `17 passed, 0 failed`. If you see any `FAIL` lines, something's wrong
   -- see "If something doesn't work" near the bottom.

## Using it

The simplest way to try it out:

```
node cli.js
```

This starts an interactive session. Type a sentence and press enter --
it'll analyze it and show you what it found. Type another sentence, and
it keeps going, building up a history as you go. Press `Ctrl+C` to stop.

Example:

```
> I feel like we keep circling the same thing.
  trajectory: FLATTENING  meaning: 0.4861  decay: 0.765  rupture: false
  no target set -- field running untargeted
  lattice: node creation:0
  causal: (first creation)
  ledger: committed af293507...
```

- **trajectory** -- is the tone holding steady, improving, or slipping?
- **meaning** -- how much genuine content vs. filler is in the text
- **decay** -- how worn-down or strained things sound
- **rupture** -- is there an active conflict or break happening

If it notices something more specific -- gaslighting language, mixed
signals, an assumption stated as fact -- it'll add a line like:

```
  signals: relationalGaps/event_denial, reversal/reversal
```

### Giving it something to work toward

If you want it to track progress toward a goal, tell it what to pursue:

```
> :target repair-complete end-state 15
```

That's a name for the goal, what kind of thing it is (`end-state`, `idea`,
or `person` -- just a label, doesn't change how it works), and how
strongly to pursue it (higher = converges faster, 15 is a good default).

Keep typing after that, and it will keep tracking progress toward that
goal automatically -- you don't need to repeat it every time. When it
detects real progress toward the goal, it will show you what led there.

You can also set the goal from the start:

```
node cli.js --target-id=repair-complete --target-type=end-state --target-mass=15
```

### Looking at what it's collected

Inside a running session, type:

```
:history
```

to see everything recorded so far, or:

```
:sigma
```

to see how much new activity has happened since the last checkpoint.

## Using it as a web service

If you want other programs (or a website) to talk to this instead of
using it by hand:

```
node server.js
```

This starts a small local web server (on port 7200 by default). You can
then send it text and get results back over the network -- useful if
you're building something on top of this rather than using it directly.
Full details on the available web addresses are in `ARCHITECTURE.md`.

## Where your information is saved

Everything you type and everything it figures out gets saved in a folder
called `data`, inside the `emergence` folder, automatically. You don't
need to do anything -- it just remembers, even if you close the program
and open it again later.

If you want to keep separate, unrelated histories (for example, tracking
two different conversations separately), tell it to use a different
folder each time:

```
EMERGENCE_DATA_DIR=./conversation-1 node cli.js
```

and

```
EMERGENCE_DATA_DIR=./conversation-2 node cli.js
```

## Saving and organizing ideas

You can also register standalone ideas -- not tied to a specific message
-- and search them later, or use one as a goal to pursue:

```
curl -X POST http://localhost:7200/ideas -H "Content-Type: application/json" -d "{\"text\":\"repair takes consistency, not intensity\",\"tags\":[\"insight\"]}"
```

(This requires `node server.js` to be running first, in another window.)

## What it's good at right now, and what it isn't

**Good at:** picking up on emotional tone, wording patterns, gaslighting
and manipulation language, mixed signals, and hot-and-cold cycling --
these all genuinely respond to what you type. It also remembers whether
the situation it's looking at has come up before -- if the same kind of
moment happens again, it'll tell you, and after it's seen a repeat
happen more than once, it can start telling you what tends to follow.

**Not there yet:** it can't currently pick up on stress or tension the
way a person would from someone's *voice or face* -- that would need
audio or video input, which this doesn't take. One of the nine detectors
(`assumption`) is also more sensitive than the others -- it'll sometimes
flag totally ordinary sentences, so don't take that one signal as
strongly as the rest.

The "goal tracking" part uses a physics simulation under the hood, so
how quickly it reaches a goal varies a little each time you run it --
that's expected, not a bug.

## If something doesn't work

- **"command not found: node"** -- Node.js isn't installed, or isn't on
  your system's PATH. Reinstall from [nodejs.org](https://nodejs.org) and
  restart your terminal.
- **A test fails with something about physics or "convergence"** -- this
  one test occasionally fails by chance (see "goal tracking" note above).
  Just run the tests again.
- **"Cannot find module '../warp'"** -- the `warp` folder isn't sitting
  next to the `emergence` folder anymore. Put them back side by side.
- **Anything else** -- full technical detail, including exactly what's
  been tested and what hasn't, is in `ARCHITECTURE.md`.

## Want to know how it actually works?

This README is deliberately just "how do I use it." For the real
architecture -- what's built on what, what's been verified and how, and
a full history of what changed and why -- read
[`ARCHITECTURE.md`](./ARCHITECTURE.md).
