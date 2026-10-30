# Making Eravos reachable

One port. One process. One thing to forward.

```bash
./start-all.sh                    # localhost:8080, app + relay
node eravos-serve.js --port=8443 --cert=fullchain.pem --key=privkey.pem
```

```
http(s)://host:PORT/          the app
ws(s)://host:PORT/relay       the relay
http(s)://host:PORT/_health   liveness — reports app AND relay
```

## What changed and why

It used to be two: **8080** for the PWA, **8787** for the relay WebSocket.
Two port-forwards, two firewall rules, two reverse-proxy blocks — and two
things that can be up independently.

That last one is the real cost. If the relay is the one that's down, the app
loads perfectly and simply never connects. It looks exactly like *"she isn't
online"* and tells you nothing. Now `/_health` reports both, and if the relay
fails to attach the server says so **at boot** rather than letting you find
out later.

Nothing about the relay's logic changed — it exports `attach()` now, and
running `relay-server.js` directly still works exactly as before.

## Getting it to her — pick one

### A box you control (recommended)

```bash
node eravos-serve.js --proxy-config=caddy    # or nginx
```

Caddy is two lines and handles TLS and the WebSocket upgrade itself. The
nginx config includes the `Upgrade`/`Connection` headers and a long
`proxy_read_timeout` — **the most common reason a proxied relay silently
fails while the app loads fine.** A test asserts all three are present.

Run Eravos with `--behind-proxy` so it stays plaintext on loopback and lets
the proxy terminate TLS.

### UPnP — worth trying, often won't work

```bash
node eravos-serve.js --upnp
```

Discovers a gateway over SSDP and asks it to map the port. Zero dependencies.

It's honest about failing, which most tools aren't:

- **It verifies.** A gateway can return `200` and map nothing, so the mapping
  is read back with `GetSpecificPortMappingEntry` before it's called success.
- **It detects CGNAT.** If your external IP is itself private (`100.64/10`,
  `10/8`, etc.), you're behind carrier-grade NAT and **no port forward can
  reach you** regardless of what the router says. It tells you that instead
  of reporting a green success you'd spend an evening trusting.
- **It gives the manual step** with your actual LAN IP when it can't.

Most consumer routers ship UPnP off. If it fails, that's usually why.

### Neither

If you're behind CGNAT and have no box, you need a tunnel to a host you own.
Spec v2 settled that as **always self-hosted** and explicitly rejected
Tailscale, so that's a relay you run — not a service you sign up to.

## Before it faces the internet

```bash
ALLOWED_ORIGINS=https://your-host node eravos-serve.js --behind-proxy
```

The relay warns at boot when this is unset. The identity handshake — pin plus
proof of possession — is still the real gate either way; this is depth, not
the only thing between the relay and a stranger.

`--cert`/`--key` **refuses to start** if the files can't be read rather than
falling back to plaintext. Someone who asked for TLS and silently got none is
worse off than someone who got an error.
