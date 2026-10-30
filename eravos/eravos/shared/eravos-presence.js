/* ══════════════════════════════════════════════════════════════════════════
   ERAVOS PRESENCE  ·  eravos-presence.js  ·  v0.10.0
   UUID: eravos-presence-shell-0001-0000-000000000001
   HOOK: eravos.presence:shell:00001
   PARENT: eravos-chat-engine-0001-0000-000000000001   (§17.1)
   ══════════════════════════════════════════════════════════════════════════

   Phase D's remainder: knowing where the other person is in Eravos, and
   being able to go there with them.

   ── NOT A SECOND ENGINE (§0.5) ──────────────────────────────────────────

   ChatEngine already owns `presence:tab` and `presence:cursor` — transport,
   throttling, opt-in gating, staleness. This is a SURFACE on top of that
   declared API. It stores nothing of its own except the local follow toggle,
   which is ephemeral and never written (§10.1: one write authority, and it
   is not this file).

   ── THE DESIGN DECISION THAT MATTERS (§17.3) ────────────────────────────

   Following someone through an app is one step from watching them. So the
   asymmetry is closed deliberately:

     1. You can only follow someone who is ALREADY sharing their tab. That
        was already opt-in and already two-sided.
     2. When you follow, THEY ARE TOLD. `presence:follow` is broadcast, and
        their shell says "James is following you". A follow that the other
        person cannot see is surveillance, not co-navigation.
     3. Either side can end it in one tap — the follower by unfollowing, the
        followed by turning tab sharing off. Neither needs the other's
        permission to stop.
     4. Following never STEALS focus mid-action. If you are typing, the
        follow queues until the field is idle. Being yanked out of a sentence
        you were writing to your partner is not togetherness.

   ── EPHEMERAL, LIKE EVERYTHING ELSE IN PRESENCE (§1.2) ──────────────────

   Nothing here is persisted. Not the follow state, not who was where, not
   for how long. A record of one person's movement through a relational app
   over months is not something anyone consented to keep, and the fact that
   it would be *useful* is exactly why it is not kept.
   ══════════════════════════════════════════════════════════════════════════ */

(function (global) {
  'use strict';

  var PRESENCE_VERSION = '0.10.0';
  var PRESENCE_UUID = 'eravos-presence-shell-0001-0000-000000000001';

  var STALE_MS = 12000;          // longer than cursor: a tab is held, not moved
  var FOLLOW_RETRY_MS = 600;     // how often to retry a follow blocked by typing

  function PresenceShell(opts) {
    opts = opts || {};
    this.chat = opts.chat || global.eravosChat || null;
    this.switchTab = opts.switchTab || (typeof global.switchTab === 'function' ? global.switchTab : null);
    this.send = opts.send || function (t, d) {
      if (typeof global.emitSync === 'function') return global.emitSync(t, d);
      return false;
    };
    this.tabLabel = opts.tabLabel || function (id) { return id; };
    this.partnerName = opts.partnerName || function () { return 'them'; };

    // All ephemeral. None of it is written anywhere.
    this._following = false;
    this._followedByThem = false;
    this._theirTab = null;
    this._theirTabAt = 0;
    this._myTab = null;
    this._pendingFollow = null;
    this._listeners = [];
    this._stats = { broadcasts: 0, follows: 0, deferred: 0, blockedNotSharing: 0 };
  }

  PresenceShell.VERSION = PRESENCE_VERSION;
  PresenceShell.UUID = PRESENCE_UUID;

  PresenceShell.prototype.on = function (fn) {
    this._listeners.push(fn);
    var l = this._listeners;
    return function () { var i = l.indexOf(fn); if (i >= 0) l.splice(i, 1); };
  };
  PresenceShell.prototype._emit = function () {
    var s = this.state(), self = this;
    this._listeners.forEach(function (fn) {
      try { fn(s); }
      catch (e) { if (global.console) console.error('[presence] listener threw: ' + e.message); }
    });
  };

  /* ── outbound ────────────────────────────────────────────────────── */

  /** Called on every tab switch. Gated by ChatEngine's own shareTab pref. */
  PresenceShell.prototype.enteredTab = function (tabId) {
    this._myTab = tabId;
    if (!this.chat) return { sent: false, reason: 'chat engine not booted' };
    var r = this.chat.sendTab(tabId);
    if (r.sent) this._stats.broadcasts++;
    this._emit();
    return r;
  };

  /* ── inbound ─────────────────────────────────────────────────────── */

  PresenceShell.prototype.theyEnteredTab = function (tabId) {
    this._theirTab = tabId || null;
    this._theirTabAt = Date.now();
    if (this._following && tabId) this._go(tabId);
    this._emit();
    return this._theirTab;
  };

  /** They started or stopped following us. We are told; we do not consent. */
  PresenceShell.prototype.theyFollow = function (on) {
    // Deliberately NOT a permission gate. The person being followed already
    // consented by turning tab sharing on, and can revoke by turning it off.
    // Adding a second approval here would mean a follow could be *hidden*
    // while pending — worse than telling them plainly.
    this._followedByThem = !!on;
    this._emit();
    return this._followedByThem;
  };

  /* ── follow ──────────────────────────────────────────────────────── */

  PresenceShell.prototype.canFollow = function () {
    if (!this.chat) return { ok: false, reason: 'chat engine not booted' };
    var them = this.chat.remote();
    if (!this._fresh()) {
      this._stats.blockedNotSharing++;
      return { ok: false, reason: this.partnerName() + " isn't sharing which tab they're on" };
    }
    if (!them.tab) return { ok: false, reason: 'no tab to follow yet' };
    return { ok: true };
  };

  PresenceShell.prototype.follow = function () {
    var c = this.canFollow();
    if (!c.ok) return { ok: false, following: false, reason: c.reason };
    this._following = true;
    this._stats.follows++;
    try { this.send('presence:follow', { on: true }); } catch (e) {}
    var tab = this.chat.remote().tab;
    if (tab) this._go(tab);
    this._emit();
    return { ok: true, following: true, tab: tab,
             note: this.partnerName() + ' is told you are following — a follow they cannot see would be surveillance.' };
  };

  PresenceShell.prototype.unfollow = function () {
    this._following = false;
    if (this._pendingFollow) { clearTimeout(this._pendingFollow); this._pendingFollow = null; }
    try { this.send('presence:follow', { on: false }); } catch (e) {}
    this._emit();
    return { ok: true, following: false };
  };

  /** §1.2 — never steal focus mid-sentence. Defer, then go when idle. */
  PresenceShell.prototype._go = function (tabId) {
    if (!tabId || tabId === this._myTab) return;
    var self = this;
    if (this._isTyping()) {
      this._stats.deferred++;
      if (this._pendingFollow) clearTimeout(this._pendingFollow);
      this._pendingFollow = setTimeout(function () {
        self._pendingFollow = null;
        if (self._following) self._go(self._theirTab || tabId);
      }, FOLLOW_RETRY_MS);
      return;
    }
    if (typeof this.switchTab === 'function') this.switchTab(tabId);
    this._myTab = tabId;
  };

  PresenceShell.prototype._isTyping = function () {
    if (typeof document === 'undefined') return false;
    var a = document.activeElement;
    if (!a) return false;
    var tag = (a.tagName || '').toLowerCase();
    if (tag === 'textarea') return !!a.value;
    if (tag === 'input') {
      var t = (a.type || 'text').toLowerCase();
      return ['text', 'search', 'email', 'password', 'url', 'tel'].indexOf(t) !== -1 && !!a.value;
    }
    return a.isContentEditable === true;
  };

  PresenceShell.prototype._fresh = function () {
    return !!this._theirTab && (Date.now() - this._theirTabAt) < STALE_MS;
  };

  /* ── state for the shell ─────────────────────────────────────────── */

  PresenceShell.prototype.state = function () {
    var fresh = this._fresh();
    var prefs = this.chat ? this.chat.prefs() : { shareTab: false };
    return {
      theirTab: fresh ? this._theirTab : null,
      theirTabLabel: fresh && this._theirTab ? this.tabLabel(this._theirTab) : null,
      // "she's in the Vault" — the whole point of this phase
      line: fresh && this._theirTab
        ? this.partnerName() + ' is in ' + this.tabLabel(this._theirTab)
        : null,
      following: this._following,
      followedByThem: this._followedByThem,
      canFollow: this.canFollow().ok,
      sharingMyTab: !!prefs.shareTab,
      myTab: this._myTab,
    };
  };

  /** §12.6 diagnostics. */
  PresenceShell.prototype.health = function () {
    return {
      version: PRESENCE_VERSION,
      ...this._stats,
      persisted: 0,          // structurally zero — nothing here is written
      theirTabFresh: this._fresh(),
      following: this._following,
      followedByThem: this._followedByThem,
      status: !this.chat ? 'no-chat-engine'
            : !this.chat.prefs().shareTab ? 'not-sharing'
            : this._fresh() ? 'live' : 'idle',
    };
  };

  global.PresenceShell = PresenceShell;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { PresenceShell: PresenceShell, STALE_MS: STALE_MS, FOLLOW_RETRY_MS: FOLLOW_RETRY_MS };
  }
})(typeof window !== 'undefined' ? window : globalThis);
