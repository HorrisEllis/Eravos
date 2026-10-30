# `eravos://` — the deep link, and why not a magnet link

## The instinct is right. The primitive isn't.

You want: **scan a code, the app opens, the two instances connect.** That's
exactly what a custom protocol handler is for, and Electron registers one in
about four lines.

But a magnet link is the wrong mechanism, and it's worth being specific about
why rather than just substituting.

A `magnet:` URI is a **BitTorrent** address. Its shape is
`xt=urn:btih:<infohash>` — a content hash you hand to the **DHT**, a global
distributed hash table, which returns peers who have that content. Three
things follow:

1. **It's a lookup key, not an address.** It says *"find whoever has this
   file"*. You don't want whoever has something — you want **her specific
   device**, which the pairing code already names via its peer id.

2. **The DHT is public.** Announcing an infohash publishes to a global network
   that someone is looking for it. For a torrent that's the point. For an
   invite between two people, that's the opposite of what this whole app is —
   Eravos runs between two devices with no third party in the path, and the
   DHT is a very large third party.

3. **It needs a BitTorrent stack.** WebTorrent is ~500KB and brings trackers
   and peer discovery you'd be fighting rather than using.

## What actually does the job

```
eravos://pair/YHUF658Y.eravos-9x4kd02m.fp-a91c.n0nce
```

Same payload the QR already carries — code, peer id, key fingerprint, nonce.
It doesn't need inventing, because it already exists:
`Pairing.inviteUrl()` produces it and `Pairing.parse()` reads it.

The change is which **scheme** the QR encodes, and that's a one-line switch
with a real trade-off:

| | scans to | works when |
|---|---|---|
| `https://anonymousservers.info/#pair=…` | the browser | always — any phone, no install |
| `eravos://pair/…` | the desktop app | only where Eravos is installed |

**So it encodes both.** The QR keeps the https link, and the page it lands on
attempts `eravos://` first — the app takes over if it's there, and the web
version handles it if it isn't. Nobody is stranded by not having installed
something, which is the same reasoning that keeps the manual code next to the
QR.

## Registering it

```js
// main.js
app.setAsDefaultProtocolClient('eravos');

// macOS
app.on('open-url', (e, url) => { e.preventDefault(); handlePair(url); });

// Windows / Linux — arrives as an argv on the SECOND instance
const lock = app.requestSingleInstanceLock();
if (!lock) app.quit();
app.on('second-instance', (e, argv) => {
  const url = argv.find(a => a.startsWith('eravos://'));
  if (url) handlePair(url);
  win.show(); win.focus();
});

function handlePair(url) {
  // Pairing.parse() already accepts this shape — nothing new to write.
  win.webContents.send('eravos:pair', url.replace('eravos://pair/', ''));
}
```

`requestSingleInstanceLock()` is not optional here. Without it, clicking a
link launches a **second** Eravos, which fights the first over the port and
the lock file — the exact failure `eravos-serve.js` already guards against on
the server side.

## What Electron actually buys you, honestly

**Real:** the protocol handler, so a link opens the app rather than a browser
tab. A tray icon, so presence survives the window being closed. No tunnel
needed on the same LAN. Notifications that work when the window isn't focused.

**Not real:** it does not make the connection more direct. Two Electron
instances on different networks still need a relay or a hole punch, exactly as
two browsers do. Electron is a window around the same code — it changes how
you *launch*, not how you *connect*.

**The honest cost:** ~150MB per install, an update mechanism you now own, and
code signing on both platforms or the OS will warn her that it's untrusted.

## What I'd actually do, in order

1. **`eravos://` handler in the existing PWA path first.** Browsers can
   register protocol handlers too, and it costs nothing to try before adding
   150MB.
2. **Electron only if you want the tray**, which is the one thing the web
   genuinely can't do — presence while the window is shut.
3. **Never make the app the only way in.** The https link and the manual code
   stay first-class, for the same reason the code sits under the QR: the QR's
   optics are unverified, and a path nobody can take is worse than no path.
