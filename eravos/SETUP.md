# Setup — direct on 80/443, in this order

Router forwards 80 + 443 -> 10.0.0.216. No tunnel in the path.

## 0. VERIFY INBOUND 80 BEFORE ANYTHING ELSE
Everything below depends on it, and the last recorded test contradicts it:
2026-08-12, port 80 did not answer from cellular and Let's Encrypt's own
validator timed out. A router forward does not override an ISP inbound block.

On the box:  `node -e "require('http').createServer((q,r)=>r.end('OK')).listen(80,'0.0.0.0')"`
From PHONE ON CELLULAR (wifi off): open `http://24.21.239.115`

- "OK"  -> forwarding works. Continue.
- times out -> the ISP blocks inbound 80. Stop; the cert cannot be issued
  this way. Go back to the named tunnel (nexus-engines-tunnel.js).

Give 10.0.0.216 a DHCP reservation. A new lease moves the forward target.

## 1. Rotate the GoDaddy PAT
`gd_pat_TwoEX...` shipped in the zip in cleartext. Revoke at
developer.godaddy.com, put the new one in `ddns.godaddyToken` (currently null).
DDNS is required now — nothing resolves to this box without it.

## 2. First boot: cert issuance on port 80
`server.port` must be **80** and `tlsCert`/`tlsKey` **null** for this run only.
ACME is on, domain `eravos.anonymousservers.info`, `staging: true`.

`node eravos-serve.js`  -> look for `acme  real certificate issued`.
Then set `staging: false`, delete `data/tls/*.pem`, run again for a trusted cert.

## 3. Second boot: 443
Set `port: 443`, `tlsCert: data/tls/cert.pem`, `tlsKey: data/tls/key.pem`.
`httpRedirectPort: 80` is already set — it serves the ACME challenge and
redirects. Without it renewal fails silently in ~80 days.

Verify:
```
curl https://eravos.anonymousservers.info/_health
curl -I http://eravos.anonymousservers.info      # expect 301
```
Console on that origin: `relayUrl()` -> `wss://eravos.anonymousservers.info/relay`

## 4. Only then mint an invite
Payload v2 bakes the relay address into every code.
Check first: `eravosPairing.health().inviteRelayReachable === true`

## Why 443 matters beyond the padlock
`eravos-crypto.js:107` needs `crypto.subtle`, which only exists in a secure
context. On plain http to a hostname it is undefined and lines 128/153 return
null — E2E encryption silently produces nothing. Plain http here is not a
downgrade in polish, it is no encryption.
