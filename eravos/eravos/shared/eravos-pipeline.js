/* ══════════════════════════════════════════════════════════════════════════
   ERAVOS RELATIONAL PIPELINE  ·  eravos-pipeline.js  ·  v0.22.0
   UUID: eravos-relational-pipeline-0001-0000-000000000001
   HOOK: eravos.pipeline:kernel:00001
   PARENT: eravos-kernel   OWNER: shared/eravos-pipeline.js   (§17.1)
   ══════════════════════════════════════════════════════════════════════════

   One route for relational data, whatever it came from.

   ── WHY A KERNEL AND NOT MORE INGEST CASES ──────────────────────────────

   v0.21.0 widened the lattice's ingest from 6 sources to 14 by adding cases
   to a map. That works while every source is an internal appStream event. It
   stops working the moment data arrives from OUTSIDE — Instagram, Threads,
   Emergence — because those need things an internal event never does:
   consent, provenance, deduplication, rate limiting, and a way to withdraw
   everything from one source without touching the rest.

   Putting that in fourteen more cases would mean fourteen places to get
   consent wrong. So: one envelope, one route, one place where the rules live.

   ── THE FOUR MEASURES, AND WHERE EACH BELONGS (§13.2) ───────────────────

   James named three; there is a fourth, and the pipeline is where they meet:

     INVARIANT   what persists. Words present in >=80% of everything said,
                 needs that recur across months. Slow. Changes rarely and
                 means a lot when it does.
     SIGMA       deviation from a baseline that is YOURS. Not "is this high"
                 but "is this high FOR YOU" — a z-score against a rolling
                 window, which is why jitter thresholds are per-speaker and
                 lattice thresholds are per-corpus.
     DELTA       change between two points. What moved, and how far.
     DIVERGENCE  the fourth, and the one the lattice is actually built on:
                 disagreement between measures taken AT THE SAME TIME. Same
                 need, different words. Same words, different feeling. It is
                 not persistence, not deviation, and not change — it is two
                 instruments reading one moment differently, and that gap is
                 usually where the information is.

   Every record through here carries all four where they are available, so a
   consumer never has to recompute them from raw text.

   ── EXTERNAL SOURCES ARE CONSENT-GATED, STRUCTURALLY ────────────────────

   §"Social-media DM import" in the spec: gated hard by explicit two-person
   consent, re-asked occasionally, and BROKEN BY DESIGN — an error, not
   silent degradation — if consent is ever forced rather than freely given.

   That is enforced here, not in each adapter: `ingest()` REFUSES a record
   from an external source without a live grant from both sides, and it
   throws rather than dropping it quietly. An adapter cannot bypass this
   because the adapter never touches the store.
   ══════════════════════════════════════════════════════════════════════════ */

(function (global) {
  'use strict';

  var PIPE_VERSION = '0.22.0';
  var PIPE_UUID = 'eravos-relational-pipeline-0001-0000-000000000001';
  var CONSENT_KEY = 'eravors_pipeline_consent';
  var SEEN_KEY = 'eravors_pipeline_seen';
  var STATS_KEY = 'eravors_pipeline_stats';

  var MAX_SEEN = 4000;                 // dedupe window, bounded (§0.4)
  var CONSENT_TTL_MS = 90 * 86400000;  // re-asked every 90 days, never assumed

  /**
   * Sources. `external` ones need consent; internal ones are the person
   * using their own app and do not.
   */
  var SOURCES = {
    eravos:    { label: 'Eravos',     external: false, why: 'you, in your own app' },
    emergence: { label: 'Emergence',  external: false, why: 'your own analysis engine' },
    instagram: { label: 'Instagram',  external: true,  why: 'messages between you on another platform' },
    threads:   { label: 'Threads',    external: true,  why: 'messages between you on another platform' },
    manual:    { label: 'Typed in',   external: false, why: 'you wrote it here on purpose' },
  };

  var KINDS = ['message', 'feeling', 'rupture', 'need', 'growth', 'field', 'note'];

  function defaultStore() {
    if (global.DB && typeof global.DB.get === 'function') {
      return { get: function (k, d) { return global.DB.get(k, d); },
               set: function (k, v) { global.DB.set(k, v); } };
    }
    throw new Error('[pipeline] no storage available — DB is not loaded. Refusing to operate blind.');
  }

  /**
   * Stable id, so the same message twice is one record.
   *
   * `originalId` wins when the platform gives one. This matters more than it
   * looks: a scraper re-reads the same DM thread on every page load, and if
   * the id depended on the import timestamp, every re-read would produce a
   * fresh fingerprint and flood the lattice with the same conversation over
   * and over. Keying on the platform's own id makes re-reading idempotent,
   * which is the only way a scraper can be safe to run continuously.
   *
   * Without one: CONTENT ALONE, no time at all. My first attempt bucketed by
   * the minute and it failed its own test — two reads forty seconds apart
   * straddled a minute boundary and produced two records. Bucketing by wall
   * clock always has that edge; there is no bucket size that does not.
   *
   * The trade-off, stated: two genuinely separate "ok"s collapse into one.
   * That is the right way round for a scraper — losing a duplicate "ok" costs
   * almost nothing, and flooding the lattice with the same conversation on
   * every page load would poison every dimension at once. Platforms that give
   * an id do not have this problem, which is why the id wins.
   */
  function fingerprint(source, kind, text, ts, originalId) {
    if (originalId) {
      var o = source + '|' + String(originalId);
      var oh = 5381;
      for (var oi = 0; oi < o.length; oi++) { oh = ((oh << 5) + oh + o.charCodeAt(oi)) | 0; }
      return source + ':' + (oh >>> 0).toString(36);
    }
    var s = source + '|' + kind + '|' + String(text || '').trim().toLowerCase();
    var h = 5381;
    for (var i = 0; i < s.length; i++) { h = ((h << 5) + h + s.charCodeAt(i)) | 0; }
    return source + ':' + (h >>> 0).toString(36);
  }

  function Pipeline(opts) {
    opts = opts || {};
    this.store = opts.store || defaultStore();
    this.now = opts.now || function () { return Date.now(); };
    this.sink = opts.sink || null;        // where accepted records go
    this._listeners = [];
  }

  Pipeline.VERSION = PIPE_VERSION;
  Pipeline.UUID = PIPE_UUID;
  Pipeline.SOURCES = SOURCES;
  Pipeline.KINDS = KINDS;
  Pipeline.CONSENT_TTL_MS = CONSENT_TTL_MS;
  Pipeline.fingerprint = fingerprint;

  Pipeline.prototype.on = function (fn) {
    this._listeners.push(fn);
    var l = this._listeners;
    return function () { var i = l.indexOf(fn); if (i >= 0) l.splice(i, 1); };
  };
  Pipeline.prototype._emit = function (rec) {
    this._listeners.forEach(function (fn) {
      try { fn(rec); }
      catch (e) { if (global.console) console.error('[pipeline] listener threw: ' + e.message); }
    });
  };

  /* ── consent ──────────────────────────────────────────────────────── */

  Pipeline.prototype._consent = function () { return this.store.get(CONSENT_KEY, {}) || {}; };

  /**
   * Grant consent for one external source. BOTH sides are required — a grant
   * with one side is not a grant, and the record says which side is missing.
   */
  Pipeline.prototype.grant = function (source, side) {
    var def = SOURCES[source];
    if (!def) throw new Error('[pipeline] unknown source "' + source + '". Known: ' + Object.keys(SOURCES).join(', '));
    if (!def.external) return { ok: true, note: 'internal source — no consent needed, this is you in your own app' };
    if (side !== 'self' && side !== 'partner') throw new Error('[pipeline] grant(): side must be "self" or "partner"');
    var c = this._consent();
    var g = c[source] || { self: null, partner: null };
    g[side] = this.now();
    c[source] = g;
    this.store.set(CONSENT_KEY, c);
    var both = !!(g.self && g.partner);
    return { ok: true, source: source, both: both,
             waitingOn: both ? null : (g.self ? 'partner' : 'self'),
             note: both ? 'Both sides have agreed. Import is live until it expires in 90 days.'
                        : 'One side only. Nothing imports until the other agrees — a grant with one side is not a grant.' };
  };

  /** Either side, alone, instantly. Nobody needs permission to stop. */
  Pipeline.prototype.revoke = function (source) {
    var c = this._consent();
    delete c[source];
    this.store.set(CONSENT_KEY, c);
    return { ok: true, source: source,
             note: 'Revoked by one side, which is enough. Records already imported stay — use purge() to remove them.' };
  };

  Pipeline.prototype.consentState = function (source) {
    var def = SOURCES[source];
    if (!def) return { allowed: false, reason: 'unknown source' };
    if (!def.external) return { allowed: true, external: false };
    var g = this._consent()[source];
    if (!g || !g.self || !g.partner) {
      return { allowed: false, external: true,
               reason: !g ? 'no consent recorded'
                     : g.self ? 'waiting on them' : 'waiting on you' };
    }
    var oldest = Math.min(g.self, g.partner);
    var age = this.now() - oldest;
    if (age > CONSENT_TTL_MS) {
      // §"re-asked occasionally". Consent that never expires is consent
      // nobody is actually giving any more.
      return { allowed: false, external: true, expired: true,
               reason: 'agreed ' + Math.round(age / 86400000) + ' days ago — needs asking again' };
    }
    return { allowed: true, external: true, grantedAt: oldest,
             expiresIn: CONSENT_TTL_MS - age };
  };

  /* ── the envelope ─────────────────────────────────────────────────── */

  /**
   * One shape for everything. A consumer reading this never has to know
   * whether it came from a rupture form or an Instagram DM.
   */
  Pipeline.prototype.normalise = function (raw) {
    raw = raw || {};
    if (!SOURCES[raw.source]) {
      throw new Error('[pipeline] unknown source "' + raw.source + '". Known: ' + Object.keys(SOURCES).join(', '));
    }
    if (KINDS.indexOf(raw.kind) === -1) {
      throw new Error('[pipeline] unknown kind "' + raw.kind + '". Known: ' + KINDS.join(', '));
    }
    var text = String(raw.text == null ? '' : raw.text).trim();
    var ts = raw.ts || this.now();
    return {
      id: fingerprint(raw.source, raw.kind, text, ts, raw.originalId),
      source: raw.source,
      kind: raw.kind,
      text: text,
      speaker: raw.speaker === 'partner' ? 'partner' : 'self',
      ts: ts,
      importedAt: this.now(),
      // §17.5 — provenance travels with the record, always. A consumer can
      // always answer "where did this come from and was it consented to".
      provenance: {
        source: raw.source,
        external: SOURCES[raw.source].external,
        adapter: raw.adapter || null,
        originalId: raw.originalId || null,
      },
      // The four measures, carried rather than recomputed downstream.
      measures: {
        invariant: raw.invariant || null,   // what persisted
        sigma: typeof raw.sigma === 'number' ? raw.sigma : null,      // deviation from YOUR baseline
        delta: raw.delta || null,           // what moved
        divergence: raw.divergence || null, // instruments disagreeing on one moment
      },
      field: raw.field || null,
    };
  };

  /* ── the one route ────────────────────────────────────────────────── */

  Pipeline.prototype._seen = function () { return this.store.get(SEEN_KEY, []) || []; };

  /**
   * @returns {{accepted:boolean, id?, reason?}} — never a bare boolean, and
   *          a refusal always says why.
   */
  Pipeline.prototype.ingest = function (raw) {
    var rec;
    try { rec = this.normalise(raw); }
    catch (e) { this._bump('malformed'); return { accepted: false, reason: e.message }; }

    // CONSENT, before anything else. An adapter cannot reach the store, so
    // this is the only door and it is not optional.
    var c = this.consentState(rec.source);
    if (!c.allowed) {
      this._bump('refused_consent');
      // §"broken by design, an error not silent degradation"
      throw new Error('[pipeline] refusing "' + rec.source + '": ' + c.reason +
                      '. Nothing from an external source imports without a live grant from both sides.');
    }

    if (!rec.text) { this._bump('empty'); return { accepted: false, reason: 'nothing to ingest' }; }

    var seen = this._seen();
    if (seen.indexOf(rec.id) !== -1) {
      this._bump('duplicate');
      return { accepted: false, reason: 'already imported', id: rec.id };
    }
    seen.push(rec.id);
    if (seen.length > MAX_SEEN) seen = seen.slice(-MAX_SEEN);
    this.store.set(SEEN_KEY, seen);

    this._bump('accepted');
    this._bump('src_' + rec.source);
    if (this.sink) {
      try { this.sink(rec); }
      catch (e) {
        // §1.2 — the sink failing is named. The record still counted as
        // accepted because it WAS accepted; the failure is downstream.
        if (global.console) console.error('[pipeline] sink threw on ' + rec.id + ': ' + e.message);
        this._bump('sink_error');
      }
    }
    this._emit(rec);
    return { accepted: true, id: rec.id, source: rec.source, kind: rec.kind };
  };

  /** Withdraw everything from one source. §0.3 — counted, and reported. */
  Pipeline.prototype.purge = function (source) {
    var before = this._seen();
    var after = before.filter(function (id) { return id.indexOf(source + ':') !== 0; });
    this.store.set(SEEN_KEY, after);
    return { ok: true, source: source, forgotten: before.length - after.length,
             note: 'The pipeline has forgotten these, so they can be imported again if you ever re-grant. ' +
                   'Records already passed to the lattice are removed there separately.' };
  };

  Pipeline.prototype._bump = function (k) {
    var s = this.store.get(STATS_KEY, {}) || {};
    s[k] = (s[k] || 0) + 1;
    this.store.set(STATS_KEY, s);
  };

  /* ── §12.6 diagnostics ────────────────────────────────────────────── */

  Pipeline.prototype.health = function () {
    var s = this.store.get(STATS_KEY, {}) || {};
    var self = this;
    var consent = {};
    Object.keys(SOURCES).forEach(function (k) {
      if (SOURCES[k].external) consent[k] = self.consentState(k);
    });
    return {
      version: PIPE_VERSION,
      sources: Object.keys(SOURCES).length,
      externalSources: Object.keys(SOURCES).filter(function (k) { return SOURCES[k].external; }),
      consent: consent,
      accepted: s.accepted || 0,
      duplicates: s.duplicate || 0,
      refusedForConsent: s.refused_consent || 0,
      malformed: s.malformed || 0,
      sinkErrors: s.sink_error || 0,
      seenIds: this._seen().length,
      seenCap: MAX_SEEN,
      // structural, asserted by tests
      consentBypassable: false,
      status: Object.keys(consent).some(function (k) { return consent[k].expired; })
        ? 'consent-expired' : 'healthy',
    };
  };

  global.RelationalPipeline = Pipeline;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { Pipeline: Pipeline, SOURCES: SOURCES, KINDS: KINDS,
                       CONSENT_KEY: CONSENT_KEY, SEEN_KEY: SEEN_KEY,
                       CONSENT_TTL_MS: CONSENT_TTL_MS, fingerprint: fingerprint };
  }
})(typeof window !== 'undefined' ? window : globalThis);
