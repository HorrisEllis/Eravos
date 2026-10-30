# Building the Eravos installer

## Run this on the Windows box

```
npm install
npm run dist
```

Output: `dist\Eravos-Setup-0.29.4.exe`

I did not cross-build it here. electron-builder producing a Windows NSIS
installer from Linux needs wine plus downloaded Electron and NSIS binaries,
and an installer built that way that fails on her machine is worse than no
installer — you would find out from her, not from a build log.

## Before you send it to her

Two things that are not optional, in this order.

**1. The relay address is baked into every code you mint.**
Check before sending an invite:
```js
eravosPairing.health().inviteRelayReachable   // must be true
```
False means the code is dead on arrival. The invite modal says so in the
warning panel too.

**2. She will see "Windows protected your PC".**
The build is unsigned, so SmartScreen blocks it: More info → Run anyway.
Tell her that BEFORE you send it. An unexplained security warning from a
partner is the thing that makes someone not install it.

Signing needs an Authenticode certificate (~$200-400/yr, OV or EV). Worth it
if this goes past one person; not for one install.

## What is bundled, and what is not

Bundled — the app is zero-dependency at runtime:
- the app, `eravos-serve.js`, the co-creation relay (`nano-ws.js`, own X25519)
- `server-modules/` (ACME, DDNS, SMTP)
- `emergence` and `warp` as extraResources

NOT bundled, and nothing needs to be:
- No STUN, TURN, or PeerJS. The relay replaced all three.
- No `ws`. `nano-ws.js` is the WebSocket server.
- No database server. `node:sqlite` is built into Node, which Electron ships.
- Node itself ships inside Electron — she does not install it.

The one thing that is NOT in the installer is **your relay**. Her copy talks
to your box. That is the whole architecture, and it is why the tunnel or the
port forward has to be working before the installer is worth sending.

## After she installs

She opens it and lands on the login card (desktop skips the landing page).
Two ways in, both tested end to end in `eravos/test/pairing-e2e.test.mjs`:

- **QR** — she scans it with her phone camera, which opens the https link,
  which offers the app.
- **Paste** — Create Account, then the "Have an invite link or code?" field
  above the form. It takes the full link OR the full dot-joined code.
  The bare 8 characters will NOT work and says so: that string names no
  device and carries no relay, by design, so a photographed code reveals
  nothing about who made it.

Scanning does not pair anyone. It sends a request you confirm on your side.
