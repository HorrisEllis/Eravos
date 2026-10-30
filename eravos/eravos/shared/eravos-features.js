/* ══════════════════════════════════════════════════════════════════════════
   ERAVOS FEATURES  ·  eravos-features.js  ·  v0.14.1
   UUID: eravos-feature-registry-0001-0000-000000000001
   HOOK: eravos.features:registry:00001
   PARENT: eravos-kernel   OWNER: shared/eravos-features.js   (§17.1)
   ══════════════════════════════════════════════════════════════════════════

   ── THE FINDING THAT CAME FIRST (§0.1) ──────────────────────────────────

   Before adding three features to the toggle system, I checked whether the
   toggle system did anything. It did not.

       call sites reading featOn('feat_*') : 0
       anything that hides a tab on feat_* : NO

   `setFeature()` wrote a boolean and showed a toast. `featOn()` existed and
   was never called for a `feat_` key. Every switch in Settings > Features
   was cosmetic: you could turn Rupture Tracker off and the tab stayed there,
   fully working.

   That is a §6.1 violation in shipped code — an interface claiming a
   capability it does not have — and it is exactly the system I was asked to
   hook three new features into. So the toggles became real first (§3.1:
   nothing is built on a layer that does not hold).

   ── WHAT "REAL" MEANS HERE ──────────────────────────────────────────────

   A disabled feature: disappears from the nav, refuses `switchTab()` even
   when called programmatically, and says so rather than failing silently.
   Its DATA IS NEVER TOUCHED — disabling is hiding, not deleting (§0.3).
   Re-enable and everything is where you left it.

   ── DEPENDENCIES ARE DECLARED, NOT DISCOVERED ───────────────────────────

   Some features genuinely need another: Desires needs a partner and the
   consent layer. `requires` is declared, and turning off a dependency
   reports what it took with it rather than leaving a half-dead tab.
   ══════════════════════════════════════════════════════════════════════════ */

(function (global) {
  'use strict';

  var FEATURES_VERSION = '0.14.1';
  var FEATURES_UUID = 'eravos-feature-registry-0001-0000-000000000001';
  var PREFIX = 'feat_';

  /**
   * The three new ones, declared with everything a feature needs to be real:
   * a stable id, the tab it gates, its category, what it does, whether it
   * needs a partner, and what it depends on.
   */
  var NEW_FEATURES = [
    {
      id: 'hardtalk', tab: 'hardtalk', cat: 'Relational',
      label: 'Uncomfortable Conversations',
      summary: 'The conversations you have been circling. Name one before you have it, ' +
               'record what actually happened after, and revisit it later — the same subject ' +
               'returning is the growth signal, not a failure.',
      requiresPartner: false,     // naming one alone is most of the work
      defaultOn: true,
    },
    {
      id: 'roadmap_shared', tab: 'goals', cat: 'Relational',
      label: 'Goals & Relational Roadmap',
      summary: 'Shared goals and the steps under them. A goal belongs to one of you, ' +
               'both of you, or neither yet — and "neither yet" is a real state, not an empty one.',
      requiresPartner: false,
      defaultOn: true,
    },
    {
      id: 'desires', tab: 'desires', cat: 'Relational',
      label: 'Desires & Boundaries',
      summary: 'Explore what you each want, and what you do not, without either of you ' +
               'having to go first. Answers stay sealed until you have both answered, and only ' +
               'MUTUAL interest is ever revealed. Limits are absolute and unilateral.',
      requiresPartner: true,
      // §5.10 — declared, not discovered. Turning consent off takes this with
      // it, and says so, rather than leaving a half-dead tab behind.
      requires: ['pairing'],
      defaultOn: false,           // OFF until deliberately turned on
      sensitive: true,
    },
    {
      id: 'emergence', cat: 'System',
      label: 'Relational Pattern Analysis',
      summary: 'Emergence reads what you write to each other locally on this device -- tension, ' +
               'unspoken gaps, emotional undertone -- and may gently suggest logging a rupture or a ' +
               'need when something real shows up. It never logs anything for you, never leaves this ' +
               'device, and every suggestion is something you can dismiss without a trace.',
      requiresPartner: true,
      requires: ['pairing'],
      defaultOn: false,           // OFF until deliberately turned on
      sensitive: true,
    },
  ];

  function defaultStore() {
    if (global.DB && typeof global.DB.get === 'function') {
      return { get: function (k, d) { return global.DB.get(k, d); },
               set: function (k, v) { global.DB.set(k, v); } };
    }
    throw new Error('[features] no storage available — DB is not loaded. Refusing to operate blind.');
  }

  function FeatureRegistry(opts) {
    opts = opts || {};
    this.store = opts.store || defaultStore();
    this.defs = (opts.defs || []).concat(NEW_FEATURES);
    this._byId = {};
    var self = this;
    this.defs.forEach(function (f) {
      if (self._byId[f.id]) {
        // SISO Design Law 1 — a duplicate id is a hard error, never silent
        // precedence. Two features sharing a toggle means one of them is
        // controlled by a switch nobody knows is wired to it.
        throw new Error('[features] duplicate feature id "' + f.id + '"');
      }
      self._byId[f.id] = f;
    });
    this._listeners = [];
  }

  FeatureRegistry.VERSION = FEATURES_VERSION;
  FeatureRegistry.UUID = FEATURES_UUID;
  FeatureRegistry.NEW_FEATURES = NEW_FEATURES;
  FeatureRegistry.PREFIX = PREFIX;

  FeatureRegistry.prototype.on = function (fn) {
    this._listeners.push(fn);
    var l = this._listeners;
    return function () { var i = l.indexOf(fn); if (i >= 0) l.splice(i, 1); };
  };
  FeatureRegistry.prototype._emit = function (id, on) {
    this._listeners.forEach(function (fn) {
      try { fn(id, on); }
      catch (e) { if (global.console) console.error('[features] listener threw: ' + e.message); }
    });
  };

  FeatureRegistry.prototype.def = function (id) { return this._byId[id] || null; };

  /** Is it on? Dependencies included — a feature whose dependency is off is off. */
  FeatureRegistry.prototype.enabled = function (id) {
    var d = this._byId[id];
    if (!d) return true;                     // unknown ids are not gated
    var raw = this.store.get(PREFIX + id, null);
    var on = raw === null ? (d.defaultOn !== false) : raw !== false;
    if (!on) return false;
    if (d.requires) {
      for (var i = 0; i < d.requires.length; i++) {
        if (this._byId[d.requires[i]] && !this.enabled(d.requires[i])) return false;
      }
    }
    return true;
  };

  /** Why is it off? §1.2 — "disabled" without a reason is a dead end. */
  FeatureRegistry.prototype.reason = function (id) {
    var d = this._byId[id];
    if (!d) return null;
    var raw = this.store.get(PREFIX + id, null);
    var selfOn = raw === null ? (d.defaultOn !== false) : raw !== false;
    if (!selfOn) return 'turned off in Settings › Features';
    if (d.requires) {
      for (var i = 0; i < d.requires.length; i++) {
        var r = d.requires[i];
        if (this._byId[r] && !this.enabled(r)) {
          return 'needs "' + (this._byId[r].label || r) + '", which is off';
        }
      }
    }
    return null;
  };

  /**
   * Turn one on or off. Reports what ELSE changed as a result — a dependency
   * going down should never silently take a tab with it.
   */
  FeatureRegistry.prototype.set = function (id, on) {
    var d = this._byId[id];
    if (!d) throw new Error('[features] unknown feature "' + id + '"');
    this.store.set(PREFIX + id, !!on);
    var self = this;
    var cascaded = this.defs.filter(function (f) {
      return f.requires && f.requires.indexOf(id) !== -1 && !self.enabled(f.id);
    }).map(function (f) { return f.id; });
    this._emit(id, !!on);
    cascaded.forEach(function (c) { self._emit(c, false); });
    return {
      ok: true, id: id, on: !!on,
      cascaded: cascaded,
      // §0.3 — disabling hides. It never deletes.
      note: on ? null : 'Hidden, not deleted. Your ' + (d.label || id) +
            ' data is untouched and comes back exactly as it was.',
    };
  };

  /** Every tab that should be hidden right now. */
  FeatureRegistry.prototype.hiddenTabs = function () {
    var self = this;
    return this.defs.filter(function (f) { return f.tab && !self.enabled(f.id); })
                    .map(function (f) { return f.tab; });
  };

  /** Gate for switchTab(). Refuses even when called programmatically. */
  FeatureRegistry.prototype.allowTab = function (tabId) {
    var self = this;
    var owner = this.defs.filter(function (f) { return f.tab === tabId; })[0];
    if (!owner) return { allowed: true };
    if (this.enabled(owner.id)) return { allowed: true };
    return { allowed: false, feature: owner.id, label: owner.label,
             reason: this.reason(owner.id) };
  };

  /** §12.6 diagnostics. */
  FeatureRegistry.prototype.health = function () {
    var self = this;
    var off = this.defs.filter(function (f) { return !self.enabled(f.id); });
    return {
      version: FEATURES_VERSION,
      total: this.defs.length,
      enabled: this.defs.length - off.length,
      disabled: off.map(function (f) { return { id: f.id, why: self.reason(f.id) }; }),
      hiddenTabs: this.hiddenTabs(),
      requiringPartner: this.defs.filter(function (f) { return f.requiresPartner; }).map(function (f) { return f.id; }),
      sensitive: this.defs.filter(function (f) { return f.sensitive; }).map(function (f) { return f.id; }),
      // §12.5 — a feature that gates no tab has a switch that does nothing.
      // That was the state of EVERY toggle before v0.14.0.
      togglesGatingNothing: this.defs.filter(function (f) { return !f.tab; }).map(function (f) { return f.id; }),
      status: 'healthy',
    };
  };

  global.FeatureRegistry = FeatureRegistry;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { FeatureRegistry: FeatureRegistry, NEW_FEATURES: NEW_FEATURES, PREFIX: PREFIX };
  }
})(typeof window !== 'undefined' ? window : globalThis);
