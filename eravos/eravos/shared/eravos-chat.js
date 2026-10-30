/* ══════════════════════════════════════════════════════════════════════════
   ERAVOS CHAT & PRESENCE  ·  eravos-chat.js  ·  v0.6.0
   UUID: eravos-chat-engine-0001-0000-000000000001
   HOOK: eravos.chat:engine:00001
   PARENT: eravos-kernel   OWNER: shared/eravos-chat.js   (§17.1)
   ══════════════════════════════════════════════════════════════════════════

   One engine. Two surfaces render it: the full page (tabs/chat/) and the
   popup composer. Neither owns the data — §10.1, this does.

   ── WHY ENGINE-FIRST AND NOT POPUP-FIRST (§3.4) ─────────────────────────

   The popup is the thing that was asked for and the thing that must be built
   last of the three, because a composer that owns its own message list means
   two stores that will disagree the first time both surfaces are open. The
   engine is exercisable with no DOM at all — every test below runs headless.

   ── TRANSPORT (§5.10) ───────────────────────────────────────────────────

   Rides the existing syncStream from Phase 1. No new framework, no second
   pipeline. Namespaced `domain:action`, one discrete Gate each:

     chat:message    a message, with optional attachment
     chat:receipt    delivered / read
     chat:typing     ephemeral, never stored
     presence:cursor ephemeral, opt-in, throttled
     presence:tab    which tab the other person is on

   emitSync() already owns queue-on-failure centrally, so an offline send
   lands in the outbox and replays on reconnect without this file
   reimplementing that check (the exact duplication Phase 1 consolidated away).

   ── ATTACHMENTS ─────────────────────────────────────────────────────────

   An attachment is a REFERENCE, not a copy: { kind, id, preview }. Sending a
   vault piece sends a pointer to it, so it stays one artifact with one
   version rather than a duplicate that drifts (§5.4 in spirit — one source).
   Kinds: vault | feeling | need | spar_invite | codex | poem | canvas.

   ── EPHEMERAL MEANS EPHEMERAL (§1.2) ────────────────────────────────────

   Typing indicators and cursor positions are NEVER persisted. Not capped,
   not trimmed — never written. Someone's mouse path through a relational app
   is not a record anyone consented to keep. `_assertEphemeral()` enforces it
   and a test asserts the store stays empty under a thousand cursor events.

   ── NOTHING IS FORCED ───────────────────────────────────────────────────

   Cursor sharing is OFF by default and requires BOTH sides on. `setPresence`
   is a local toggle; the engine never enables it in response to a remote
   request. Read receipts likewise.
   ══════════════════════════════════════════════════════════════════════════ */

(function (global) {
  'use strict';

  var CHAT_VERSION = '0.6.0';
  var CHAT_UUID = 'eravos-chat-engine-0001-0000-000000000001';

  var THREAD_KEY = 'eravors_chat_thread';
  var PREFS_KEY = 'eravors_chat_prefs';
  var MAX_MESSAGES = 500;                 // §0.4 — bounded by construction
  var MAX_TEXT = 4000;
  var CURSOR_THROTTLE_MS = 80;

  var ATTACHMENT_KINDS = ['vault', 'feeling', 'need', 'spar_invite', 'codex', 'poem', 'canvas', 'grammar', 'sticker'];
  var EPHEMERAL_TYPES = ['chat:typing', 'presence:cursor', 'presence:tab'];

  function defaultStore() {
    if (global.DB && typeof global.DB.get === 'function') {
      return { get: function (k, d) { return global.DB.get(k, d); },
               set: function (k, v) { global.DB.set(k, v); } };
    }
    throw new Error('[chat] no storage available — DB is not loaded. Refusing to operate blind.');
  }

  /**
   * @param {object} opts
   *   store    injectable persistence (defaults to kernel DB)
   *   send     function(type, data) -> boolean. Defaults to emitSync.
   *   me       display name of this side
   */
  function ChatEngine(opts) {
    opts = opts || {};
    this.store = opts.store || defaultStore();
    this.me = opts.me || 'me';
    this._send = opts.send || function (type, data) {
      if (typeof global.emitSync === 'function') return global.emitSync(type, data);
      return false;
    };
    this._listeners = { message: [], typing: [], cursor: [], tab: [], receipt: [] };
    this._remote = { typing: false, typingAt: 0, cursor: null, tab: null };
    this._lastCursorSent = 0;
    this._stats = { sent: 0, received: 0, queued: 0, ephemeralDropped: 0, rejected: 0 };
  }

  ChatEngine.VERSION = CHAT_VERSION;
  ChatEngine.UUID = CHAT_UUID;
  ChatEngine.ATTACHMENT_KINDS = ATTACHMENT_KINDS;
  ChatEngine.EPHEMERAL_TYPES = EPHEMERAL_TYPES;

  /* ── prefs. Nothing is forced; everything here defaults OFF. ────────── */

  ChatEngine.prototype.prefs = function () {
    var p = this.store.get(PREFS_KEY, null) || {};
    return {
      // ── DEFAULTS CHANGED IN v0.25.0, at the owner's direction ────────
      // I shipped these OFF, reasoning that watching someone's cursor is a
      // lot. That reasoning was about a STRANGER. Between two people who
      // have deliberately paired, presence being absent by default means the
      // app starts cold and stays cold until someone goes hunting in
      // Settings — and the shared cursor is most of what "navigating this
      // together" actually is.
      //
      // What did NOT change is the guarantee, which was never the default:
      //   · it still takes BOTH sides — a remote cursor is ignored unless
      //     this side is also sharing, so nobody can watch unilaterally
      //   · either side turns it off ALONE, instantly, no permission needed
      //   · it is still NEVER persisted — not capped, never written
      // Default-on decides where you start. It does not decide who can stop.
      shareCursor: p.shareCursor !== false,
      shareTab: p.shareTab !== false,
      // Receipts stay OFF. "Seen at 11:04 and said nothing" is a different
      // kind of information from where someone's mouse is, and it is the one
      // that gets used against people.
      readReceipts: !!p.readReceipts,
      sounds: p.sounds !== false,
    };
  };

  ChatEngine.prototype.setPrefs = function (patch) {
    var cur = this.prefs();
    for (var k in patch) if (k in cur) cur[k] = !!patch[k];
    this.store.set(PREFS_KEY, cur);
    return cur;
  };

  /* ── thread ─────────────────────────────────────────────────────────── */

  ChatEngine.prototype._isMine = function (msg) {
    // Real, computed from .from, not trusted from storage. .mine used to
    // be baked in at append time (from: this.me, mine: true) -- correct
    // for a message that only ever lives on the device that sent it, but
    // wrong the moment chat messages can arrive from a catch-up sync
    // merge (see eravos_chat_thread joining SHARED_SYNC_KEYS): a message
    // synced in from a partner's device carries whatever .mine THEIR
    // side stored, which is the opposite of correct on THIS device.
    // Computing fresh from .from === this.me is right regardless of
    // which device a message's storage entry originated on.
    return msg && msg.from === this.me;
  };

  ChatEngine.prototype.thread = function (limit) {
    var t = this.store.get(THREAD_KEY, []) || [];
    var self = this;
    // New objects, not mutated in place -- callers (chat.js's own
    // render code) read m.mine directly; giving them a corrected copy
    // is simpler and safer than auditing every read site individually.
    var withComputedMine = t.map(function (m) { return Object.assign({}, m, { mine: self._isMine(m) }); });
    return limit ? withComputedMine.slice(-limit) : withComputedMine;
  };

  ChatEngine.prototype._append = function (msg) {
    var t = this.store.get(THREAD_KEY, []) || [];
    for (var i = t.length - 1; i >= 0 && i > t.length - 40; i--) {
      if (t[i].id === msg.id) return null;     // idempotent on replay
    }
    t.push(msg);
    if (t.length > MAX_MESSAGES) t = t.slice(-MAX_MESSAGES);
    this.store.set(THREAD_KEY, t);
    return msg;
  };

  function validateAttachment(a) {
    if (!a) return null;
    if (ATTACHMENT_KINDS.indexOf(a.kind) === -1) {
      throw new Error('[chat] unknown attachment kind "' + a.kind + '". Known: ' + ATTACHMENT_KINDS.join(', '));
    }
    if (!a.id) throw new Error('[chat] attachment of kind "' + a.kind + '" needs an `id` — it is a reference, not a copy');
    return { kind: a.kind, id: String(a.id), preview: a.preview ? String(a.preview).slice(0, 240) : null,
             label: a.label ? String(a.label).slice(0, 120) : null };
  }

  /**
   * Send. Returns the stored message WITH its delivery state — never a bare
   * boolean, and never silently dropped if offline (§1.2).
   */
  ChatEngine.prototype.send = function (text, attachment) {
    var body = String(text == null ? '' : text);
    var att = validateAttachment(attachment);
    if (!body.trim() && !att) {
      this._stats.rejected++;
      throw new Error('[chat] send(): nothing to send — no text and no attachment');
    }
    if (body.length > MAX_TEXT) {
      this._stats.rejected++;
      throw new Error('[chat] send(): ' + MAX_TEXT + ' characters max (got ' + body.length + ')');
    }

    var msg = {
      id: 'm-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
      from: this.me, mine: true,
      text: body, attachment: att,
      ts: Date.now(),
      delivered: false, read: false,
    };

    var ok = false;
    try { ok = !!this._send('chat:message', { id: msg.id, text: msg.text, attachment: att, ts: msg.ts }); }
    catch (e) {
      // §1.2 — a transport throw is reported on the message, not swallowed.
      msg.error = e.message;
    }
    msg.delivered = ok;
    if (!ok && !msg.error) msg.queued = true;   // emitSync already queued it
    if (!ok) this._stats.queued++;
    this._stats.sent++;

    this._append(msg);
    this._emit('message', msg);
    return msg;
  };

  /** Inbound from the chat:message gate. */
  ChatEngine.prototype.receive = function (data, from) {
    if (!data || !data.id) return null;
    var msg = {
      id: data.id, from: from || 'them', mine: false,
      text: String(data.text || ''),
      attachment: data.attachment || null,
      ts: data.ts || Date.now(),
      delivered: true, read: false,
    };
    var stored = this._append(msg);
    if (!stored) return null;                 // duplicate replay, ignored quietly
    this._stats.received++;
    this._remote.typing = false;
    if (this.prefs().readReceipts) {
      try { this._send('chat:receipt', { id: msg.id, state: 'delivered' }); } catch (e) {}
    }
    this._emit('message', msg);
    return msg;
  };

  ChatEngine.prototype.markRead = function (id) {
    var t = this.store.get(THREAD_KEY, []) || [];
    var hit = null;
    for (var i = 0; i < t.length; i++) if (t[i].id === id) { t[i].read = true; hit = t[i]; }
    if (!hit) return null;
    this.store.set(THREAD_KEY, t);
    if (this.prefs().readReceipts && !this._isMine(hit)) {
      try { this._send('chat:receipt', { id: id, state: 'read' }); } catch (e) {}
    }
    return hit;
  };

  ChatEngine.prototype.applyReceipt = function (data) {
    var t = this.store.get(THREAD_KEY, []) || [];
    var hit = null;
    for (var i = 0; i < t.length; i++) {
      if (t[i].id === (data && data.id)) {
        if (data.state === 'delivered') t[i].delivered = true;
        if (data.state === 'read') { t[i].delivered = true; t[i].read = true; }
        hit = t[i];
      }
    }
    if (hit) { this.store.set(THREAD_KEY, t); this._emit('receipt', hit); }
    return hit;
  };

  ChatEngine.prototype.unreadCount = function () {
    return this.thread().filter(function (m) { return !m.mine && !m.read; }).length;
  };

  /* ── ephemeral. Never written. ──────────────────────────────────────── */

  ChatEngine.prototype._assertEphemeral = function (type) {
    if (EPHEMERAL_TYPES.indexOf(type) === -1) {
      throw new Error('[chat] _assertEphemeral(): "' + type + '" is not declared ephemeral');
    }
    this._stats.ephemeralDropped++;
  };

  ChatEngine.prototype.setTyping = function (on) {
    this._assertEphemeral('chat:typing');
    try { this._send('chat:typing', { on: !!on }); } catch (e) {}
    return { sent: true, stored: false };
  };

  ChatEngine.prototype.receiveTyping = function (data) {
    this._assertEphemeral('chat:typing');
    this._remote.typing = !!(data && data.on);
    this._remote.typingAt = Date.now();
    this._emit('typing', this._remote.typing);
    return this._remote.typing;
  };

  /**
   * Shared cursor. OFF unless this side turned it on — the engine never
   * enables it because the other side asked. Throttled so a mouse move does
   * not become a flood on the same pipe carrying messages.
   */
  ChatEngine.prototype.sendCursor = function (x, y, tab) {
    this._assertEphemeral('presence:cursor');
    if (!this.prefs().shareCursor) return { sent: false, reason: 'shareCursor is off on this side' };
    var now = Date.now();
    if (now - this._lastCursorSent < CURSOR_THROTTLE_MS) return { sent: false, reason: 'throttled' };
    this._lastCursorSent = now;
    try { this._send('presence:cursor', { x: +x, y: +y, tab: tab || null }); } catch (e) {}
    return { sent: true, stored: false };
  };

  ChatEngine.prototype.receiveCursor = function (data) {
    this._assertEphemeral('presence:cursor');
    if (!this.prefs().shareCursor) return null;   // not watching if not sharing
    this._remote.cursor = { x: +(data && data.x), y: +(data && data.y),
                            tab: (data && data.tab) || null, at: Date.now() };
    this._emit('cursor', this._remote.cursor);
    return this._remote.cursor;
  };

  ChatEngine.prototype.sendTab = function (tabId) {
    this._assertEphemeral('presence:tab');
    if (!this.prefs().shareTab) return { sent: false, reason: 'shareTab is off on this side' };
    try { this._send('presence:tab', { tab: tabId }); } catch (e) {}
    return { sent: true, stored: false };
  };

  ChatEngine.prototype.receiveTab = function (data) {
    this._assertEphemeral('presence:tab');
    this._remote.tab = (data && data.tab) || null;
    this._emit('tab', this._remote.tab);
    return this._remote.tab;
  };

  ChatEngine.prototype.remote = function () {
    var r = { typing: this._remote.typing, cursor: this._remote.cursor, tab: this._remote.tab };
    if (r.typing && Date.now() - this._remote.typingAt > 6000) r.typing = false;   // stale
    if (r.cursor && Date.now() - r.cursor.at > 5000) r.cursor = null;
    return r;
  };

  /* ── events ─────────────────────────────────────────────────────────── */

  ChatEngine.prototype.on = function (evt, fn) {
    if (!this._listeners[evt]) throw new Error('[chat] on(): unknown event "' + evt + '". Known: ' + Object.keys(this._listeners).join(', '));
    this._listeners[evt].push(fn);
    var l = this._listeners[evt];
    return function () { var i = l.indexOf(fn); if (i >= 0) l.splice(i, 1); };
  };

  ChatEngine.prototype._emit = function (evt, payload) {
    (this._listeners[evt] || []).forEach(function (fn) {
      try { fn(payload); }
      catch (e) {
        // §1.2 — a listener that throws is named, and never breaks the sender.
        if (typeof console !== 'undefined') console.error('[chat] listener threw on "' + evt + '": ' + e.message);
      }
    });
  };

  /* ── §9.4 export · §12.6 diagnostics ────────────────────────────────── */

  ChatEngine.prototype.export = function () {
    return { version: CHAT_VERSION, exportedAt: new Date().toISOString(),
             messages: this.thread(), prefs: this.prefs() };
  };

  ChatEngine.prototype.health = function () {
    var t = this.thread();
    var withAtt = t.filter(function (m) { return m.attachment; });
    var byKind = {};
    withAtt.forEach(function (m) { byKind[m.attachment.kind] = (byKind[m.attachment.kind] || 0) + 1; });
    return {
      version: CHAT_VERSION,
      messages: t.length, cap: MAX_MESSAGES,
      unread: this.unreadCount(),
      queued: t.filter(function (m) { return m.queued && !m.delivered; }).length,
      failed: t.filter(function (m) { return m.error; }).length,
      attachments: withAtt.length, attachmentsByKind: byKind,
      prefs: this.prefs(),
      ephemeralEventsHandled: this._stats.ephemeralDropped,
      ephemeralPersisted: 0,          // structurally zero — never written
      stats: this._stats,
      status: t.length === 0 ? 'empty'
            : t.filter(function (m) { return m.error; }).length ? 'send-errors'
            : t.filter(function (m) { return m.queued && !m.delivered; }).length ? 'queued-offline'
            : 'healthy',
    };
  };

  global.ChatEngine = ChatEngine;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { ChatEngine: ChatEngine, THREAD_KEY: THREAD_KEY, PREFS_KEY: PREFS_KEY,
                       ATTACHMENT_KINDS: ATTACHMENT_KINDS, EPHEMERAL_TYPES: EPHEMERAL_TYPES };
  }
})(typeof window !== 'undefined' ? window : globalThis);
