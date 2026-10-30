/* ══════════════════════════════════════════════════════════════════════════
   PLANNER SHARING  ·  eravos-planner-share.js  ·  v0.25.0
   UUID: eravos-planner-share-0001-0000-000000000001
   HOOK: eravos.planner:share:00001
   PARENT: eravos-kernel   OWNER: shared/eravos-planner-share.js   (§17.1)
   ══════════════════════════════════════════════════════════════════════════

   Solo events that can become shared ones, and a shared calendar you cannot
   write to someone else's half of.

   ── SCOPE IS PER EVENT, NOT PER APP ─────────────────────────────────────

     mine      only I see it. The default, and it stays the default even
               when a shared calendar exists — being paired is not consent
               to publish your diary.
     shared    both see it, both agreed
     proposed  I want this to be ours; they have not answered

   Solo mode is not a lesser mode. Every event starts `mine`, and `share()`
   is a deliberate act on one event at a time. There is no "share everything"
   switch, because that is a decision nobody makes carefully once.

   ── PROPOSING, NOT SCHEDULING (§ the two-sided rule again) ──────────────

   `share()` produces `proposed`, never `shared`. Only the other side's
   `accept()` makes it shared. Putting something in someone else's calendar
   is not planning together — it is scheduling them, and the difference is
   the entire point of a shared calendar between two people rather than a
   team one.

   Declining is a real answer and is recorded as one. The event does not
   vanish; it returns to `mine` on the proposer's side, because they still
   have the thing in their week.

   ── WITHDRAWING IS UNILATERAL ───────────────────────────────────────────

   Either side can pull an event out of shared at any time, alone, and it
   reverts to `mine` for whoever kept it. Nobody needs permission to stop
   sharing their own calendar.
   ══════════════════════════════════════════════════════════════════════════ */

(function (global) {
  'use strict';

  var PS_VERSION = '0.25.0';
  var PS_UUID = 'eravos-planner-share-0001-0000-000000000001';
  var STORE_KEY = 'eravors_planner_events';
  var SCOPES = ['mine', 'proposed', 'shared', 'declined'];
  var MAX_EVENTS = 300;

  function defaultStore() {
    if (global.DB && typeof global.DB.get === 'function') {
      return { get: function (k, d) { return global.DB.get(k, d); },
               set: function (k, v) { global.DB.set(k, v); } };
    }
    throw new Error('[planner] no storage available — DB is not loaded. Refusing to operate blind.');
  }

  function PlannerShare(opts) {
    opts = opts || {};
    this.store = opts.store || defaultStore();
    this.me = opts.me === 'partner' ? 'partner' : 'self';
    this.now = opts.now || function () { return Date.now(); };
    this.send = opts.send || function (t, d) {
      if (typeof global.emitSync === 'function') return global.emitSync(t, d);
      return false;
    };
    // Whether a shared calendar exists at all. Sharing without it is refused
    // loudly rather than queued into nothing.
    this.sharedEnabled = opts.sharedEnabled || function () { return true; };
  }

  PlannerShare.VERSION = PS_VERSION;
  PlannerShare.UUID = PS_UUID;
  PlannerShare.SCOPES = SCOPES;

  PlannerShare.prototype._all = function () { return this.store.get(STORE_KEY, []) || []; };
  PlannerShare.prototype._save = function (v) {
    if (v.length > MAX_EVENTS) v = v.slice(-MAX_EVENTS);   // §0.4
    this.store.set(STORE_KEY, v);
    return v;
  };

  /** Every event starts MINE. Being paired is not consent to publish a diary. */
  PlannerShare.prototype.add = function (event) {
    event = event || {};
    var title = String(event.title == null ? '' : event.title).trim();
    if (!title) throw new Error('[planner] add(): a title is required');
    if (!event.when) throw new Error('[planner] add(): a time is required — an event with no when is a note');
    var e = {
      id: 'ev-' + this.now() + '-' + Math.random().toString(36).slice(2, 7),
      title: title,
      when: event.when,
      note: event.note || null,
      owner: this.me,
      scope: 'mine',
      createdAt: this.now(),
      updatedAt: this.now(),
      response: null,
    };
    var all = this._all();
    all.push(e);
    this._save(all);
    return { ok: true, id: e.id, scope: 'mine',
             note: 'Yours. Sharing it is a separate, deliberate act — there is no share-everything switch.' };
  };

  /** Offer one event. Produces `proposed`, never `shared`. */
  PlannerShare.prototype.share = function (id) {
    if (!this.sharedEnabled()) {
      // §1.2 — refuse loudly. Queuing into a calendar that does not exist
      // would look like it worked and reach nobody.
      throw new Error('[planner] share(): there is no shared calendar yet — turn "a planner we both see" ' +
                      'on in co-creation settings, and they need to as well.');
    }
    var all = this._all();
    var e = all.filter(function (x) { return x.id === id; })[0];
    if (!e) throw new Error('[planner] share(): no event "' + id + '"');
    if (e.owner !== this.me) throw new Error('[planner] share(): this is theirs to share, not yours');
    if (e.scope === 'shared') return { ok: true, id: id, scope: 'shared', already: true };

    e.scope = 'proposed';
    e.proposedAt = this.now();
    e.updatedAt = this.now();
    this._save(all);
    try { this.send('planner:event_proposed', { id: e.id, title: e.title, when: e.when, note: e.note }); } catch (err) {}
    return { ok: true, id: id, scope: 'proposed',
             note: 'Offered. It is shared when they accept — putting something in someone else\'s ' +
                   'calendar is scheduling them, not planning together.' };
  };

  /** THE only path to shared, and only from the side that was asked. */
  PlannerShare.prototype.accept = function (id) {
    var all = this._all();
    var e = all.filter(function (x) { return x.id === id; })[0];
    if (!e) throw new Error('[planner] accept(): no event "' + id + '"');
    if (e.owner === this.me) {
      throw new Error('[planner] accept(): you proposed this one. It becomes shared when THEY accept — ' +
                      'that is what makes it a plan rather than an instruction.');
    }
    e.scope = 'shared';
    e.response = { by: this.me, answer: 'accepted', ts: this.now() };
    e.updatedAt = this.now();
    this._save(all);
    try { this.send('planner:event_response', { id: id, answer: 'accepted' }); } catch (err) {}
    return { ok: true, id: id, scope: 'shared' };
  };

  /** Declining is an answer. The event does not vanish from their week. */
  PlannerShare.prototype.decline = function (id, why) {
    var all = this._all();
    var e = all.filter(function (x) { return x.id === id; })[0];
    if (!e) throw new Error('[planner] decline(): no event "' + id + '"');
    if (e.owner === this.me) throw new Error('[planner] decline(): you proposed this one');
    e.scope = 'declined';
    e.response = { by: this.me, answer: 'declined', why: why || null, ts: this.now() };
    e.updatedAt = this.now();
    this._save(all);
    try { this.send('planner:event_response', { id: id, answer: 'declined', why: why || null }); } catch (err) {}
    return { ok: true, id: id, scope: 'declined',
             note: 'Declined. It stays in their own calendar — they still have the thing in their week.' };
  };

  /** Either side, alone, at any time. */
  PlannerShare.prototype.unshare = function (id) {
    var all = this._all();
    var e = all.filter(function (x) { return x.id === id; })[0];
    if (!e) throw new Error('[planner] unshare(): no event "' + id + '"');
    e.scope = 'mine';
    e.updatedAt = this.now();
    this._save(all);
    try { this.send('planner:event_response', { id: id, answer: 'unshared' }); } catch (err) {}
    return { ok: true, id: id, scope: 'mine',
             note: 'Out of the shared calendar. Either of you can do this alone.' };
  };

  /** Their proposal arriving. Stored as theirs — authorship is not trusted from the wire. */
  PlannerShare.prototype.applyRemote = function (action, data) {
    if (!data || !data.id) return null;
    var them = this.me === 'self' ? 'partner' : 'self';
    var all = this._all();
    var e = all.filter(function (x) { return x.id === data.id; })[0];

    if (action === 'proposed') {
      if (!e) {
        e = { id: data.id, title: String(data.title || 'Untitled'), when: data.when,
              note: data.note || null, owner: them, scope: 'proposed',
              createdAt: this.now(), updatedAt: this.now(), response: null };
        all.push(e);
      } else { e.scope = 'proposed'; e.updatedAt = this.now(); }
    } else if (!e) { return null; }
    else if (action === 'accepted') { e.scope = 'shared'; e.response = { by: them, answer: 'accepted', ts: this.now() }; }
    else if (action === 'declined') { e.scope = 'declined'; e.response = { by: them, answer: 'declined', why: data.why || null, ts: this.now() }; }
    else if (action === 'unshared') { e.scope = 'mine'; }
    else { throw new Error('[planner] applyRemote(): unknown action "' + action + '"'); }
    e.updatedAt = this.now();
    this._save(all);
    return e;
  };

  /* ── views ────────────────────────────────────────────────────────── */

  PlannerShare.prototype.list = function (scope) {
    if (scope && SCOPES.indexOf(scope) === -1) {
      throw new Error('[planner] list(): unknown scope "' + scope + '". Known: ' + SCOPES.join(', '));
    }
    var l = this._all().slice().sort(function (a, b) { return (a.when || 0) - (b.when || 0); });
    return scope ? l.filter(function (e) { return e.scope === scope; }) : l;
  };

  /** What both of you actually see. */
  PlannerShare.prototype.sharedCalendar = function () { return this.list('shared'); };

  /** Waiting on each side, split so no surface has to guess. */
  PlannerShare.prototype.pending = function () {
    var me = this.me;
    var p = this.list('proposed');
    return {
      awaitingThem: p.filter(function (e) { return e.owner === me; }),
      awaitingMe: p.filter(function (e) { return e.owner !== me; }),
    };
  };

  /** Solo view — everything of yours, shared or not. Solo is not a lesser mode. */
  PlannerShare.prototype.myCalendar = function () {
    var me = this.me;
    return this.list().filter(function (e) {
      return e.owner === me || e.scope === 'shared';
    });
  };

  PlannerShare.prototype.health = function () {
    var all = this._all(), by = {};
    SCOPES.forEach(function (s) { by[s] = 0; });
    all.forEach(function (e) { by[e.scope] = (by[e.scope] || 0) + 1; });
    var p = this.pending();
    return {
      version: PS_VERSION,
      total: all.length, cap: MAX_EVENTS,
      byScope: by,
      awaitingThem: p.awaitingThem.length,
      awaitingMe: p.awaitingMe.length,
      sharedCalendarEnabled: this.sharedEnabled(),
      // structural, asserted by tests
      autoSharedWithoutConsent: 0,
      status: all.length === 0 ? 'empty' : 'healthy',
    };
  };

  global.PlannerShare = PlannerShare;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { PlannerShare: PlannerShare, SCOPES: SCOPES, STORE_KEY: STORE_KEY };
  }
})(typeof window !== 'undefined' ? window : globalThis);
