/* ══════════════════════════════════════════════════════════════════════════
   ERAVOS PAIRING  ·  eravos-pairing.js  ·  v0.12.0
   UUID: eravos-pairing-engine-0001-0000-000000000001
   HOOK: eravos.pairing:engine:00001
   PARENT: eravos-kernel   OWNER: shared/eravos-pairing.js   (§17.1)
   ══════════════════════════════════════════════════════════════════════════

   Solo until someone accepts. A code to scan, a link to send, and an honest
   state machine in between.

   ── THE DEFAULT IS SOLO, AND THAT IS NOT A DEGRADED STATE ───────────────

   Before this, the app seeded a partner account whether or not one existed,
   so every install pretended to be a pair. That is a §1.2 falsehood in the
   data: relational derivations ran against a person who was not there.

   Now: no partner until one is really there. Solo is a complete mode, not a
   waiting room — the invite prompt appears ONCE, has "I'm riding solo" next
   to "skip", and never returns on its own. Being asked repeatedly whether
   you have a partner yet is its own small cruelty.

   ── THE CODE ────────────────────────────────────────────────────────────

   A pairing code carries: this side's peer id, a public key fingerprint, an
   expiry, and a random nonce. It does NOT carry a password, a display name,
   or anything about the person — a code photographed off a screen should
   reveal nothing about who made it (§9.2 in spirit).

   Codes EXPIRE. A pairing link that works forever is a permanent open door
   on whatever chat log or camera roll it passed through. Default 24h,
   single-use, and revocable before then.

   ── ACCEPTANCE IS STILL TWO-SIDED ───────────────────────────────────────

   Scanning a code does not pair anyone. It creates a REQUEST that the
   issuing side confirms. Same shape as the grammar store: one person offers,
   the other takes it up, and nothing is mutual because one party said so.

   ── THE RENDEZVOUS (v0.13.0) ────────────────────────────────────────────

   A code named WHO to connect to and never WHERE. That gap was invisible
   while both people loaded the app from the same origin — relayUrl() derives
   from location, so they landed on one relay by accident of deployment. The
   moment the other side installs the desktop build, her page origin is her
   own 127.0.0.1 and she derives her OWN relay, in her own process. Her
   request reaches a relay with one socket on it (hers), otherPeerId() returns
   nothing, and the UI says "Request sent." Fluent, on-topic, and false.

   So the invite now carries the inviter's relay address. Wire shape:

       <code>.<peerId>.<fp>.<nonce>.<base64url(relayUrl)>

   APPENDED, never prefixed. parse() reads positionally, so a version marker
   at the front would break every v1 client and every code already sent. A v1
   parser ignores parts[4]; a v2 parser reading a v1 code gets undefined and
   reports relay:null. Both directions work with no flag day.

   HONEST TRADE, named rather than buried: a relay address is a hostname, and
   a hostname is more identifying than the opaque peer id beside it. A code
   photographed off a screen now reveals which box the inviter runs. That is
   the price of a rendezvous that can actually be reached — an address nobody
   can resolve is not privacy, it is a broken invite. What the payload still
   carries nothing of is the PERSON: no name, no email, no account key.
   ══════════════════════════════════════════════════════════════════════════ */

(function (global) {
  'use strict';

  var PAIRING_VERSION = '0.13.0';
  var PAIRING_UUID = 'eravos-pairing-engine-0001-0000-000000000001';

  var STATE_KEY = 'eravors_pairing';
  var PROMPT_KEY = 'eravors_invite_prompt_seen';
  var DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;
  var CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';   // no O/0/I/1/L — read off a screen
  var CODE_LEN = 8;

  // proposed -> the states a pairing can be in. §13.3, named before they occur.
  var STATES = ['solo', 'invited', 'requested', 'paired'];

  function defaultStore() {
    if (global.DB && typeof global.DB.get === 'function') {
      return { get: function (k, d) { return global.DB.get(k, d); },
               set: function (k, v) { global.DB.set(k, v); } };
    }
    throw new Error('[pairing] no storage available — DB is not loaded. Refusing to operate blind.');
  }

  function randomChars(n, rng) {
    var out = '';
    for (var i = 0; i < n; i++) out += CODE_ALPHABET[Math.floor(rng() * CODE_ALPHABET.length)];
    return out;
  }

  /* ── rendezvous encoding ──────────────────────────────────────────
     A relay URL contains dots (wss://eravos.example.info/relay), and dot
     is the field delimiter, so it cannot travel raw. base64url because
     its alphabet (A-Za-z0-9-_) contains no dot and needs no padding —
     standard base64's "+/=" would collide with URL and query syntax on
     the https form of the same link. */

  function b64urlEncode(str) {
    if (typeof btoa !== 'function') {
      throw new Error('[pairing] no base64 encoder in this runtime — cannot encode the relay address');
    }
    return btoa(String(str)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function b64urlDecode(seg) {
    if (!seg || typeof atob !== 'function') return null;
    var s = String(seg).replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    try { return atob(s); } catch (e) { return null; }
  }

  /**
   * The same class of check originIsShareable() already makes, for the same
   * reason. A loopback relay in an invite is WORSE than no relay: it encodes
   * cleanly, scans cleanly, and on her device resolves to HER OWN relay
   * process, which she then connects to successfully and alone.
   *
   * Static so both sides can use it — the inviter before minting, the
   * scanner before trusting an address handed to it by a stranger.
   */
  function relayIsShareable(url) {
    var u = String(url || '').trim();
    if (!u) {
      return { ok: false, relay: null,
               reason: 'no relay address was included in this invite',
               fix: 'The device that minted it is on a build older than 0.13.0, or had no relay URL resolved yet.' };
    }
    if (!/^wss?:\/\//i.test(u)) {
      return { ok: false, relay: u,
               reason: 'a relay address must start with ws:// or wss:// — got "' + u + '"',
               fix: 'Check server.publicOrigin and relay.url in eravos/config/options.json.' };
    }
    if (/^wss?:\/\/(localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0)(:|\/|$)/i.test(u)) {
      return { ok: false, relay: u,
               reason: 'this relay address points at ' + u + ', which on their device means THEIR machine, not yours',
               fix: 'Set server.publicOrigin in eravos/config/options.json to an address they can actually reach, then mint a fresh code.' };
    }
    if (/^wss?:\/\/[^/]*\.local(:|\/|$)/i.test(u)) {
      return { ok: false, relay: u,
               reason: u + ' is a .local name — it resolves on one network and not at all over the internet',
               fix: 'Set server.publicOrigin in eravos/config/options.json to an address they can actually reach, then mint a fresh code.' };
    }
    return { ok: true, relay: u };
  }

  /** Crypto-grade where available; the fallback is NAMED, never silent. */
  function makeRng() {
    if (global.crypto && global.crypto.getRandomValues) {
      return { fn: function () {
        var a = new Uint32Array(1); global.crypto.getRandomValues(a);
        return a[0] / 4294967296;
      }, strong: true };
    }
    // §1.2 — a weak source must be visible in health(), not assumed away.
    return { fn: Math.random, strong: false };
  }

  function Pairing(opts) {
    opts = opts || {};
    this.store = opts.store || defaultStore();
    this.rng = opts.rng ? { fn: opts.rng, strong: !!opts.rngStrong } : makeRng();
    this.now = opts.now || function () { return Date.now(); };
    this.ttl = opts.ttl || DEFAULT_TTL_MS;
    this.origin = opts.origin || (global.location ? global.location.origin : 'https://eravos.local');
    this._listeners = [];
  }

  Pairing.VERSION = PAIRING_VERSION;
  Pairing.UUID = PAIRING_UUID;
  Pairing.STATES = STATES;
  Pairing.CODE_LEN = CODE_LEN;

  Pairing.prototype.on = function (fn) {
    this._listeners.push(fn);
    var l = this._listeners;
    return function () { var i = l.indexOf(fn); if (i >= 0) l.splice(i, 1); };
  };
  Pairing.prototype._emit = function () {
    var s = this.state();
    this._listeners.forEach(function (fn) {
      try { fn(s); }
      catch (e) { if (global.console) console.error('[pairing] listener threw: ' + e.message); }
    });
  };

  Pairing.prototype._raw = function () {
    return this.store.get(STATE_KEY, null) || { state: 'solo', invite: null, request: null, partner: null };
  };
  Pairing.prototype._save = function (v) { this.store.set(STATE_KEY, v); this._emit(); return v; };

  /* ── state ───────────────────────────────────────────────────────── */

  Pairing.prototype.state = function () {
    var r = this._raw();
    var expired = !!(r.invite && r.invite.expiresAt <= this.now());
    return {
      state: r.state,
      solo: r.state === 'solo',
      paired: r.state === 'paired',
      partner: r.partner || null,
      invite: r.invite ? {
        code: r.invite.code,
        expiresAt: r.invite.expiresAt,
        // §1.2 — an expired invite REPORTS expired. It does not quietly keep
        // rendering a QR that will be refused when someone finally scans it.
        expired: expired,
        msRemaining: Math.max(0, r.invite.expiresAt - this.now()),
      } : null,
      // a scan they made, waiting on us to confirm
      pendingRequest: r.request || null,
      canPair: !!(r.request && !r.request.resolved),
    };
  };

  /* ── invite ──────────────────────────────────────────────────────── */

  /**
   * Mint a pairing code. Single-use, expiring, revocable.
   * @param {object} me  { peerId, pubFingerprint }
   */
  Pairing.prototype.createInvite = function (me, opts) {
    opts = opts || {};
    me = me || {};
    if (!me.peerId) throw new Error('[pairing] createInvite(): a peerId is required — a code that identifies nobody pairs nobody');
    // REAL LEAK, found by test/pairing.test.mjs asserting the payload carries
    // nothing about the person. It did: peer ids in this app are minted as
    // `eravos-<account key>-...`, so a code photographed off a screen — or
    // forwarded in a chat — announces WHO made it. The scanner does need a
    // reachable id, so the fix is at the source (opaque ids), and this is the
    // detector that says when the source is still leaking (§1.2: name it,
    // do not let it pass silently).
    if (me.accountKey && String(me.peerId).toLowerCase().indexOf(String(me.accountKey).toLowerCase()) !== -1) {
      this._leakyPeerId = me.peerId;
      if (global.console) {
        console.warn('[pairing] peerId "' + me.peerId + '" contains the account key "' + me.accountKey +
          '" — anyone who sees this code learns who made it. Mint an opaque peerId.');
      }
    } else { this._leakyPeerId = null; }
    var r = this._raw();
    if (r.state === 'paired') throw new Error('[pairing] createInvite(): already paired with ' + (r.partner && r.partner.name || 'someone') + '. Unpair first.');

    var code = randomChars(CODE_LEN, this.rng.fn);
    var invite = {
      code: code,
      peerId: me.peerId,
      // A fingerprint, not the key: enough to detect a swapped key on the
      // other side, not enough to be useful to whoever photographs the screen.
      fp: me.pubFingerprint || null,
      nonce: randomChars(16, this.rng.fn),
      // WHERE, not just who. See the header: without this the scanner
      // derives her own relay and talks to herself.
      relay: me.relay ? String(me.relay).trim() : null,
      createdAt: this.now(),
      expiresAt: this.now() + (opts.ttl || this.ttl),
      singleUse: true,
      used: false,
    };
    r.invite = invite;
    r.state = 'invited';
    this._save(r);

    // §1.2 — an unreachable rendezvous is REPORTED here, at mint time, not
    // discovered by her when nothing happens. Minting is still allowed: two
    // devices on one origin genuinely do not need this field, and refusing
    // outright would break same-origin web pairing that works today. The
    // caller decides whether a code this weak is fit to show.
    var reach = relayIsShareable(invite.relay);
    return { ok: true, code: code, expiresAt: invite.expiresAt, url: this.inviteUrl(invite),
             relay: invite.relay, relayReachable: reach.ok,
             relayWarning: reach.ok ? null : reach.reason, relayFix: reach.ok ? null : reach.fix,
             note: 'Single-use and expires. A pairing link that works forever is a permanent open door on whatever it passed through.' };
  };

  /** setOrigin(newOrigin) -- real, direct fix for a real, found gap:
      the constructor always ran with an empty options object
      (confirmed directly in eravos-kernel.js), so this.origin was
      always just window.location.origin, regardless of what
      config.publicOrigin said. The constructor has to run
      synchronously (before any async fetch could resolve), so this
      lets the real configured value be applied once it's actually
      fetched -- see eravos-kernel.js's own real wiring right after
      construction. */
  Pairing.prototype.setOrigin = function (newOrigin) {
    if (typeof newOrigin === 'string' && newOrigin) this.origin = newOrigin.replace(/\/+$/, '');
  };

  /**
   * §1.2 — a loopback origin in an invite is WORSE than no invite. It encodes
   * cleanly, scans cleanly, and resolves to the scanner's own machine, so it
   * fails silently on her phone with nothing to diagnose.
   *
   * The boot-time publicOrigin fetch is fire-and-forget, so a modal opened
   * inside that window would mint exactly that. This refuses instead.
   */
  Pairing.prototype.originIsShareable = function () {
    var o = String(this.origin || '');
    if (/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0)(:|\/|$)/i.test(o)) {
      return { ok: false, origin: o,
               reason: 'this link points at ' + o + ', which on their phone means THEIR machine, not yours',
               fix: 'Set server.publicOrigin in eravos/config/options.json to the address they can actually reach.' };
    }
    if (!o) return { ok: false, origin: o, reason: 'no origin resolved yet' };
    // The constructor's own fallback is 'https://eravos.local' — a FABRICATED
    // placeholder, not a real host. It is not loopback so the check above
    // waves it through, and it produces an invite that resolves to nothing on
    // her phone. Found by a test asserting an unresolved origin is refused;
    // the empty string fell back to the placeholder and passed (§0.1).
    // Any .local name is mDNS: fine on one LAN, meaningless over the internet.
    if (/^https?:\/\/[^/]*\.local(:|\/|$)/i.test(o)) {
      return { ok: false, origin: o,
               reason: o + ' is a .local name — it only resolves on the same network, and not at all over the internet',
               fix: 'Set server.publicOrigin in eravos/config/options.json to the address they can actually reach.' };
    }
    return { ok: true, origin: o };
  };

  /**
   * The dot-separated body both wire forms share. Field 5 is the rendezvous
   * and is APPENDED — a v1 reader stops at parts[3] and is unaffected, a v2
   * reader of a v1 code gets undefined and reports relay:null. Omitted
   * entirely when there is no relay, so v1 codes are byte-identical to what
   * this function produced before (§16.5: no second format to maintain).
   */
  Pairing.prototype._wireBody = function (invite) {
    var parts = [invite.code, invite.peerId, invite.fp || '', invite.nonce];
    if (invite.relay) parts.push(b64urlEncode(invite.relay));
    return parts.join('.');
  };

  Pairing.prototype.inviteUrl = function (invite) {
    invite = invite || (this._raw().invite);
    if (!invite) return null;
    return this.origin + '/#pair=' + encodeURIComponent(this._wireBody(invite));
  };

  /** What a scanner reads. Deliberately contains nothing about the person. */
  /**
   * The same invite as an `eravos://` deep link (v0.27.0).
   *
   * NOT a magnet link. A magnet URI is a BitTorrent lookup key handed to the
   * public DHT — it finds "whoever has this content", announces the search
   * to a global network, and needs a BitTorrent stack. You want HER DEVICE,
   * which the peer id already names, with no third party in the path.
   *
   * Same payload the QR already carries. The https URL stays the one that is
   * ENCODED, because it works on any phone with nothing installed; the page
   * it lands on can attempt this scheme first and fall through to the web.
   * Nobody is stranded by not having installed something.
   */
  Pairing.prototype.inviteDeepLink = function (invite) {
    invite = invite || this._raw().invite;
    if (!invite) return null;
    return 'eravos://pair/' + this._wireBody(invite);
  };

  /** v:2 adds `r`, the rendezvous. JSON form carries it unencoded — there is
      no delimiter to collide with here, and base64 in a JSON field would be
      obfuscation rather than encoding. */
  Pairing.prototype.invitePayload = function () {
    var i = this._raw().invite;
    if (!i) return null;
    return { v: 2, code: i.code, peer: i.peerId, fp: i.fp || null, n: i.nonce,
             exp: i.expiresAt, r: i.relay || null };
  };

  Pairing.prototype.revokeInvite = function () {
    var r = this._raw();
    if (!r.invite) return { ok: true, note: 'nothing to revoke' };
    r.invite = null;
    if (r.state === 'invited') r.state = 'solo';
    this._save(r);
    return { ok: true, note: 'Revoked. Any code already sent stops working immediately.' };
  };

  /** An email a person actually sends themselves — no server, no tracking. */
  Pairing.prototype.emailInvite = function (toAddress, fromName) {
    var r = this._raw();
    if (!r.invite) throw new Error('[pairing] emailInvite(): create an invite first');
    var who = fromName || 'Someone';
    var hours = Math.round((r.invite.expiresAt - this.now()) / 3600000);
    var subject = who + ' invited you to Eravos';
    var body =
      who + ' set up a shared space on Eravos and invited you into it.\n\n' +
      'Open this link on your phone:\n' + this.inviteUrl() + '\n\n' +
      'Or enter this code in the app:\n    ' + r.invite.code + '\n\n' +
      'The link works once and expires in about ' + hours + ' hours.\n\n' +
      'Eravos is private — it runs between your two devices. Nothing you write\n' +
      'there goes to a company, and there is no account to sign up for.\n';
    return {
      to: toAddress || '',
      subject: subject,
      body: body,
      // mailto: opens their own mail client. §"always self-hosted" — no
      // third-party sending service ever sees the address or the code.
      mailto: 'mailto:' + encodeURIComponent(toAddress || '') +
              '?subject=' + encodeURIComponent(subject) +
              '&body=' + encodeURIComponent(body),
    };
  };

  /* ── scanning / accepting ────────────────────────────────────────── */

  /**
   * The scanning side calls this. It does NOT pair — it creates a request
   * the issuing side confirms. Same shape as the grammar store: one offers,
   * the other takes it up.
   */
  Pairing.prototype.scan = function (payload, me) {
    me = me || {};
    var p = typeof payload === 'string' ? Pairing.parse(payload) : payload;
    if (!p || !p.code || !p.peer) throw new Error('[pairing] scan(): not a pairing code');
    // scan() takes EITHER a parsed object (relay) or a raw invitePayload()
    // (r, the compact JSON key). Found by a test asserting a usable relay
    // comes back, which it did not: the object path read `relay` off a
    // payload that only ever had `r`, so every in-process scan silently
    // dropped the rendezvous while the string path worked. One reader for
    // both shapes rather than two call paths that disagree.
    var scannedRelay = p.relay || p.r || null;
    if (p.exp && p.exp <= this.now()) throw new Error('[pairing] scan(): this code has expired. Ask them for a fresh one.');
    if (!me.peerId) throw new Error('[pairing] scan(): your own peerId is required');
    var r = this._raw();
    if (r.state === 'paired') throw new Error('[pairing] scan(): already paired. Unpair first.');

    // The rendezvous, validated before it is handed back. This module does
    // NOT apply it — setRelayUrlOverride() is a kernel-level browser global,
    // and reaching for it here would make Pairing untestable in node and
    // give a pure state machine a side effect. scan() reports; the caller
    // applies. Same seam confirm()/decline() already sit on.
    //
    // SECURITY, stated rather than assumed: this address comes from a code
    // someone else made, so it can point anywhere. That is bounded, not
    // ignored — the relay never holds a key and never sees plaintext (X25519
    // + AES-GCM in eravos-crypto.js, end to end), and pairing still requires
    // an explicit confirm on the inviting side. What IS refused here is the
    // shape that fails silently: a loopback address would connect her
    // successfully to her own relay and look like nobody was ever home.
    var reach = scannedRelay ? relayIsShareable(scannedRelay)
                             : { ok: false, relay: null, reason: 'this code carries no relay address' };

    r.request = {
      direction: 'outgoing',
      code: p.code, theirPeerId: p.peer, theirFp: p.fp || null,
      theirRelay: reach.ok ? reach.relay : null,
      myPeerId: me.peerId, myName: me.name || null,
      ts: this.now(), resolved: false,
    };
    r.state = 'requested';
    this._save(r);
    return { ok: true, state: 'requested',
             relay: reach.ok ? reach.relay : null,
             relayUsable: reach.ok,
             relayWarning: reach.ok ? null : reach.reason,
             note: 'Sent. Scanning a code does not pair anyone — they confirm on their side.' };
  };

  /** The issuing side receives the scanner's request. */
  Pairing.prototype.receiveRequest = function (req) {
    var r = this._raw();
    if (!r.invite) return { ok: false, reason: 'no invite outstanding' };
    if (r.invite.used) return { ok: false, reason: 'that code was already used' };
    if (r.invite.expiresAt <= this.now()) return { ok: false, reason: 'that code has expired' };
    if (!req || req.code !== r.invite.code) return { ok: false, reason: 'code does not match' };
    r.request = {
      direction: 'incoming',
      code: req.code, theirPeerId: req.myPeerId, theirName: req.myName || null,
      theirFp: req.fp || null, ts: this.now(), resolved: false,
    };
    r.state = 'requested';
    this._save(r);
    return { ok: true, state: 'requested', from: req.myName || 'someone' };
  };

  /** Confirm. THIS is what pairs — and only from the side that was asked. */
  Pairing.prototype.confirm = function (partner) {
    var r = this._raw();
    if (!r.request || r.request.resolved) throw new Error('[pairing] confirm(): nothing to confirm');
    partner = partner || {};
    r.partner = {
      name: partner.name || r.request.theirName || 'Partner',
      key: partner.key || null,
      peerId: r.request.theirPeerId,
      fp: r.request.theirFp || null,
      pairedAt: this.now(),
    };
    r.request.resolved = true;
    if (r.invite) r.invite.used = true;
    r.state = 'paired';
    this._save(r);
    return { ok: true, state: 'paired', partner: r.partner };
  };

  Pairing.prototype.decline = function (why) {
    var r = this._raw();
    if (!r.request) return { ok: true, note: 'nothing pending' };
    r.request.resolved = true;
    r.request.declined = { why: why || null, ts: this.now() };
    r.state = r.invite && !r.invite.used ? 'invited' : 'solo';
    this._save(r);
    return { ok: true, state: r.state, note: 'Declined. The code stays valid until it expires, unless you revoke it.' };
  };

  /** Either side, alone, at any time. Nobody needs permission to be solo. */
  Pairing.prototype.unpair = function () {
    var r = this._raw();
    var was = r.partner;
    this._save({ state: 'solo', invite: null, request: null, partner: null });
    return { ok: true, state: 'solo', formerPartner: was ? was.name : null,
             note: 'Solo. Either side can do this alone — nobody needs permission to stop.' };
  };

  /* ── the one-time prompt ─────────────────────────────────────────── */

  Pairing.prototype.shouldPromptInvite = function () {
    if (this._raw().state !== 'solo') return false;
    return !this.store.get(PROMPT_KEY, false);
  };

  /**
   * Dismissing is permanent by design. "I'm riding solo" and "skip" both
   * silence it forever — being asked repeatedly whether you have a partner
   * yet is its own small cruelty. Pairing stays available in Settings.
   */
  Pairing.prototype.dismissPrompt = function (how) {
    this.store.set(PROMPT_KEY, { seen: true, how: how || 'skip', ts: this.now() });
    this._emit();
    return { ok: true, note: 'It will not ask again. You can pair any time from Settings.' };
  };

  /* ── parsing ─────────────────────────────────────────────────────── */

  Pairing.parse = function (input) {
    if (!input) return null;
    var s = String(input).trim();
    // eravos://pair/<code>.<peer>.<fp>.<nonce>
    var deep = /^eravos:\/\/pair\/(.+)$/i.exec(s);
    if (deep) s = decodeURIComponent(deep[1]);
    var m = /[#?&]pair=([^&\s]+)/.exec(s);
    if (m) s = decodeURIComponent(m[1]);
    if (s.charAt(0) === '{') {
      try {
        var j = JSON.parse(s);
        return { code: j.code, peer: j.peer, fp: j.fp, n: j.n, exp: j.exp, relay: j.r || null };
      } catch (e) { return null; }
    }
    var parts = s.split('.');
    if (parts.length < 2) return null;
    // parts[4] is absent on every v1 code ever minted. undefined -> null,
    // and the scanner falls back to its own derived relay exactly as before.
    return { code: parts[0], peer: parts[1], fp: parts[2] || null, n: parts[3] || null,
             exp: null, relay: parts.length > 4 ? b64urlDecode(parts[4]) : null };
  };

  /* ── §12.6 diagnostics ───────────────────────────────────────────── */

  Pairing.prototype.health = function () {
    var s = this.state();
    return {
      version: PAIRING_VERSION,
      state: s.state,
      hasInvite: !!s.invite,
      inviteExpired: !!(s.invite && s.invite.expired),
      pendingRequest: !!s.pendingRequest,
      partner: s.partner ? s.partner.name : null,
      promptDismissed: !!this.store.get(PROMPT_KEY, false),
      // §1.2 — a weak randomness source is REPORTED, never assumed away
      randomness: this.rng.strong ? 'crypto.getRandomValues' : 'Math.random (WEAK — no WebCrypto here)',
      // §12.5 — a leak is information, and it belongs where someone will see it
      peerIdLeaksIdentity: !!this._leakyPeerId,
      leakyPeerId: this._leakyPeerId || null,
      // §1.2 — an invite with no reachable rendezvous is the failure that
      // looks exactly like "she just hasn't scanned it yet". Say so.
      inviteRelay: (this._raw().invite && this._raw().invite.relay) || null,
      inviteRelayReachable: relayIsShareable((this._raw().invite && this._raw().invite.relay) || null).ok,
      status: s.paired ? 'paired'
            : s.pendingRequest ? 'awaiting-confirmation'
            : s.invite && s.invite.expired ? 'invite-expired'
            : s.invite ? 'invited'
            : 'solo',
    };
  };

  // One implementation of "can this address actually be reached", shared by
  // the minting guard, the scan guard, health(), and the kernel's UI check.
  // §16.5 — not four copies drifting apart.
  Pairing.relayIsShareable = relayIsShareable;

  global.Pairing = Pairing;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { Pairing: Pairing, STATE_KEY: STATE_KEY, PROMPT_KEY: PROMPT_KEY,
                       STATES: STATES, relayIsShareable: relayIsShareable };
  }
})(typeof window !== 'undefined' ? window : globalThis);
