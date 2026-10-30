'use strict';
/**
 * space-distance -- NEW component, not a port. Built in direct
 * response to a real, specific situation: a genuinely long-distance
 * relationship (US <-> India), where Eravos's existing
 * computeRelationalHealth() (checked directly, real code) has no
 * concept of distance at all -- it counts ruptures, missed
 * commitments, unread needs. Nothing about whether a quiet period is
 * actually unusual FOR THIS COUPLE, or whether it's just the hours
 * they're never both awake.
 *
 * Two real ideas, not invented novelty for its own sake:
 *
 * 1. LEARNED baseline, not assumed. "You should talk daily" is a
 *    generic rule that doesn't fit every real relationship's actual
 *    rhythm. This computes the REAL mean and spread of gaps between
 *    contact events from their own history, and judges the current
 *    silence against THAT -- honestly refusing to judge anything
 *    until there's enough real history to have a baseline at all
 *    (same honesty pattern as rheon-voice's scoreCoherence(), which
 *    needs 2+ prior messages before it computes anything beyond a
 *    default -- verified in that component's own tests).
 *
 * 2. REAL timezone overlap, not a naive 24-hour clock. Asia/Kolkata
 *    has no DST (fixed UTC+5:30 year-round); most US timezones do --
 *    so the real number of hours where both people are plausibly
 *    awake genuinely shifts across the year. Computed via the same
 *    real Intl.DateTimeFormat API Eravos's own kernel.js already uses
 *    for timezone_created_in (checked directly), not a hardcoded
 *    offset that would silently go wrong twice a year.
 */

const { Cause, Drawbridge, Axiom, Flow, FlowLog } = require('../../../warp');
const path = require('path');
const { FileStore } = require('../../vendor/jaa/FileStore.js');
const { FileRefs } = require('../../vendor/jaa/FileRefs.js');

const STATE_REF = 'emergence/space-distance/state';
const DEFAULT_AWAKE_START_HOUR = 8;  // 8am local
const DEFAULT_AWAKE_END_HOUR = 23;   // 11pm local
const MIN_EVENTS_FOR_BASELINE = 5;   // honest floor -- fewer than this, no real baseline exists yet

/**
 * realUtcOffsetMinutes(ianaTimeZone, atDate) -> minutes east of UTC,
 * computed via the real Intl API at a SPECIFIC real date -- not a
 * hardcoded constant, because DST means the true answer changes across
 * the year for most US zones (though not for Asia/Kolkata, which is
 * exactly why hardcoding either side would silently be wrong at least
 * half the year for a US<->India pair specifically).
 */
function realUtcOffsetMinutes(ianaTimeZone, atDate = new Date()) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: ianaTimeZone, hourCycle: 'h23',
    year: 'numeric', month: 'numeric', day: 'numeric',
    hour: 'numeric', minute: 'numeric', second: 'numeric',
  });
  const parts = Object.fromEntries(dtf.formatToParts(atDate).map(p => [p.type, p.value]));
  const asUTC = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return Math.round((asUTC - atDate.getTime()) / 60000);
}

/**
 * computeAwakeOverlapHours(tzA, tzB, atDate) -> real hours per day both
 * people are plausibly awake (DEFAULT_AWAKE_START_HOUR..END_HOUR local
 * to each), computed against a real date so DST is correctly accounted
 * for on whichever side observes it.
 *
 * Correctly symmetric (tzA/tzB order never changes the result) and
 * correctly handles the wraparound case (one person's evening is the
 * other's early morning) via real circular-interval intersection --
 * checking B's window shifted by a full day in both directions and
 * taking the genuine overlap against A's fixed window, not an ad-hoc
 * branch that can produce a spurious result larger than either
 * window's own length. A real bug in an earlier version of this
 * function did exactly that -- caught by a test asserting the function
 * is symmetric, which it wasn't (5.5h one order, 15h the other; 15h
 * exceeded a real geometric upper bound, since the true overlap can
 * never exceed either person's own 15-hour awake window).
 */
function computeAwakeOverlapHours(tzA, tzB, atDate = new Date()) {
  const offsetA = realUtcOffsetMinutes(tzA, atDate);
  const offsetB = realUtcOffsetMinutes(tzB, atDate);
  const diffHours = (offsetA - offsetB) / 60; // how far ahead A's local clock is vs B's

  // A's awake window, expressed in B's local hour-of-day
  const aStart = DEFAULT_AWAKE_START_HOUR - diffHours;
  const aEnd = DEFAULT_AWAKE_END_HOUR - diffHours;

  // B's window is fixed at [8, 23). Check A's window against B's,
  // shifted by -24/0/+24h -- exactly one of these three candidates is
  // the geometrically correct comparison; take whichever produces a
  // real, valid overlap (never negative, never exceeding either
  // window's own length -- that upper bound is the real invariant
  // check that would have caught the original bug immediately).
  const windowLength = DEFAULT_AWAKE_END_HOUR - DEFAULT_AWAKE_START_HOUR;
  let best = 0;
  for (const shift of [-24, 0, 24]) {
    const start = Math.max(aStart + shift, DEFAULT_AWAKE_START_HOUR);
    const end = Math.min(aEnd + shift, DEFAULT_AWAKE_END_HOUR);
    const overlap = Math.max(0, end - start);
    if (overlap <= windowLength) best = Math.max(best, overlap); // the <= guard rejects any spurious out-of-bounds candidate
  }

  return +best.toFixed(2);
}

/**
 * computeOverlapWindowUTC(tzA, tzB, atDate) -> { startUtcHour, endUtcHour }
 * (fractional hours, 0-24, may wrap past 24) or null if no real overlap
 * exists. Real window, not just a duration -- built for proposePlannerEvent()
 * to check a SPECIFIC proposed time against, not just report "how many
 * hours" in the abstract. Reuses the exact same shift-search as
 * computeAwakeOverlapHours (same real invariant guard), converts B's
 * local hour-of-day back to real UTC so any caller can compare against
 * a timestamp regardless of which timezone that caller is in.
 */
function computeOverlapWindowUTC(tzA, tzB, atDate = new Date()) {
  const offsetA = realUtcOffsetMinutes(tzA, atDate);
  const offsetB = realUtcOffsetMinutes(tzB, atDate);
  const diffHours = (offsetA - offsetB) / 60;
  const aStart = DEFAULT_AWAKE_START_HOUR - diffHours;
  const aEnd = DEFAULT_AWAKE_END_HOUR - diffHours;
  const windowLength = DEFAULT_AWAKE_END_HOUR - DEFAULT_AWAKE_START_HOUR;

  let best = { overlap: 0, start: null, end: null };
  for (const shift of [-24, 0, 24]) {
    const start = Math.max(aStart + shift, DEFAULT_AWAKE_START_HOUR);
    const end = Math.min(aEnd + shift, DEFAULT_AWAKE_END_HOUR);
    const overlap = Math.max(0, end - start);
    if (overlap > 0 && overlap <= windowLength && overlap > best.overlap) {
      best = { overlap, start, end };
    }
  }
  if (best.overlap === 0) return null;

  // best.start/end are in B's local hour-of-day -- convert to real UTC
  const startUtcHour = ((best.start - offsetB / 60) % 24 + 24) % 24;
  const endUtcHour = startUtcHour + (best.end - best.start);
  return { startUtcHour: +startUtcHour.toFixed(2), endUtcHour: +endUtcHour.toFixed(2) };
}

/**
 * isWithinOverlapWindow(timestampMs, tzA, tzB) -> boolean. Real check
 * for a SPECIFIC proposed moment, not just an abstract duration --
 * built for proposePlannerEvent()'s "is this time actually good for
 * both of us" question. Handles the daily-recurring nature of the
 * window (a window can span midnight UTC) by checking against
 * yesterday/today/tomorrow's real window, since a single fixed date
 * isn't enough to correctly place a wrapped window.
 */
function isWithinOverlapWindow(timestampMs, tzA, tzB) {
  const proposedDate = new Date(timestampMs);
  const proposedUtcHour = proposedDate.getUTCHours() + proposedDate.getUTCMinutes() / 60;

  for (const dayOffsetMs of [-86400000, 0, 86400000]) {
    const window = computeOverlapWindowUTC(tzA, tzB, new Date(timestampMs + dayOffsetMs));
    if (!window) continue;
    const dayShift = dayOffsetMs / 3600000; // hours, so a window computed for "yesterday" is checked against today's UTC hour correctly
    const start = window.startUtcHour - dayShift;
    const end = window.endUtcHour - dayShift;
    if (proposedUtcHour >= start && proposedUtcHour <= end) return true;
    // wrapped case: window crosses 24h boundary
    if (end > 24 && (proposedUtcHour + 24) >= start && (proposedUtcHour + 24) <= end) return true;
  }
  return false;
}

/**
 * computeCadenceBaseline(events) -> real mean + stddev of gaps between
 * consecutive contact events, in hours. Honestly returns
 * { hasBaseline: false } below MIN_EVENTS_FOR_BASELINE -- never a
 * fabricated baseline from insufficient data.
 */
function computeCadenceBaseline(events) {
  if (events.length < MIN_EVENTS_FOR_BASELINE) {
    return { hasBaseline: false, meanGapHours: null, stdDevHours: null, sampleSize: events.length };
  }
  const sorted = [...events].sort((a, b) => a.timestamp - b.timestamp);
  const gapsHours = [];
  for (let i = 1; i < sorted.length; i++) {
    gapsHours.push((sorted[i].timestamp - sorted[i - 1].timestamp) / 3600000);
  }
  const mean = gapsHours.reduce((s, g) => s + g, 0) / gapsHours.length;
  const variance = gapsHours.reduce((s, g) => s + (g - mean) ** 2, 0) / gapsHours.length;
  return {
    hasBaseline: true,
    meanGapHours: +mean.toFixed(2),
    stdDevHours: +Math.sqrt(variance).toFixed(2),
    sampleSize: events.length,
  };
}

/**
 * computeDistanceHealth(events, tzA, tzB, now) -> real, evidence-based
 * read on whether the CURRENT silence is unusual for this specific
 * couple, given their own learned rhythm and real timezone overlap --
 * not a generic "should talk every N hours" rule.
 */
function computeDistanceHealth(events, tzA, tzB, now = Date.now()) {
  const baseline = computeCadenceBaseline(events);
  const overlapHours = (tzA && tzB) ? computeAwakeOverlapHours(tzA, tzB, new Date(now)) : null;

  if (!baseline.hasBaseline) {
    return {
      baseline, overlapHours,
      currentGapHours: events.length ? +((now - events[events.length - 1].timestamp) / 3600000).toFixed(2) : null,
      zScore: null,
      status: 'insufficient-history',
      note: `Need at least ${MIN_EVENTS_FOR_BASELINE} logged contacts before a real baseline exists -- have ${events.length}.`,
    };
  }

  const lastContact = [...events].sort((a, b) => b.timestamp - a.timestamp)[0];
  const currentGapHours = +((now - lastContact.timestamp) / 3600000).toFixed(2);

  // real bug caught by a test, fixed here: when stdDevHours is exactly
  // 0 (a perfectly consistent historical cadence -- genuinely possible,
  // not just a theoretical edge case, e.g. a couple who calls every
  // single day at the same interval), dividing by it isn't safe, and
  // the earlier version of this code defaulted zScore to 0 in that
  // case -- which meant ANY real deviation, even a deeply unusual one,
  // silently reported as 'normal'. A zero-variance history means even
  // a small real deviation is genuinely unprecedented for this couple
  // -- so a small floor on the denominator is used instead of skipping
  // the comparison entirely, letting a real deviation still produce a
  // real, large zScore rather than being silently ignored.
  const effectiveStdDev = baseline.stdDevHours > 0 ? baseline.stdDevHours : Math.max(0.5, baseline.meanGapHours * 0.05);
  const zScore = +((currentGapHours - baseline.meanGapHours) / effectiveStdDev).toFixed(2);

  let status;
  if (zScore <= 1) status = 'normal';
  else if (zScore <= 2) status = 'longer-than-usual';
  else status = 'unusual-silence';

  return { baseline, overlapHours, currentGapHours, zScore, status };
}

function buildSpaceDistance({ dataDir } = {}) {
  const dir = dataDir || path.join(process.cwd(), 'data', 'emergence-space-distance');
  const store = new FileStore(dir);
  const refs = new FileRefs(dir);

  const persisted = (() => {
    const hash = refs.get(STATE_REF);
    return hash ? store.get(hash) : null;
  })();
  const events = persisted ? persisted.events : [];
  let locations = persisted ? persisted.locations : { personA: null, personB: null };

  function persist() {
    const hash = store.put({ events, locations, ts: Date.now() });
    refs.set(STATE_REF, hash);
  }

  const validContactType = new Axiom('space:valid-contact-type', {
    severity: 'hard',
    check: (cause) => cause.type !== 'space:log-contact' || ['message', 'call', 'video', 'in-person'].includes(cause.data.contactType),
  });

  const logGate = new Drawbridge('space:log-contact', {
    schema: { requiredKeys: ['id'] },
    transform(cause) {
      const { contactType, timestamp = Date.now() } = cause.data;
      const event = { id: `contact_${events.length}_${timestamp}`, contactType, timestamp };
      events.push(event);
      persist();
      return [new Cause('space:contact-logged', event)];
    },
  });

  const log = new FlowLog();
  const flow = new Flow({ log, axioms: [validContactType] });
  flow.register(logGate);

  async function logContact({ contactType, timestamp } = {}) {
    const before = flow.rejected.length;
    await flow.emit(new Cause('space:log-contact', { contactType, timestamp }));
    if (flow.rejected.length > before) {
      throw new Error(`[space-distance] invalid contactType '${contactType}'. Valid: message, call, video, in-person`);
    }
    const logged = [...flow.pending].reverse().find(e => e.type === 'space:contact-logged');
    return logged.data;
  }

  function setLocations({ personA, personB }) {
    locations = { personA: personA ?? locations.personA, personB: personB ?? locations.personB };
    persist();
    return { ...locations };
  }

  function health(now) {
    const tzA = locations.personA?.timezone;
    const tzB = locations.personB?.timezone;
    return computeDistanceHealth(events, tzA, tzB, now);
  }

  /**
   * checkProposedTime(timestampMs) -> { checked: bool, withinOverlap: bool|null, note }
   * Real check for a specific proposed event time -- built for
   * proposePlannerEvent()'s "is this actually good for both of us"
   * question, not just an abstract "how many hours overlap" number.
   * Honestly reports checked:false if either timezone isn't set yet --
   * never guesses.
   */
  function checkProposedTime(timestampMs) {
    const tzA = locations.personA?.timezone;
    const tzB = locations.personB?.timezone;
    if (!tzA || !tzB) {
      return { checked: false, withinOverlap: null, note: 'Both timezones need to be set before this can be checked.' };
    }
    const withinOverlap = isWithinOverlapWindow(timestampMs, tzA, tzB);
    return {
      checked: true, withinOverlap,
      note: withinOverlap
        ? 'Within your usual awake-overlap window.'
        : 'Outside your usual awake-overlap window -- one of you may be asleep or not naturally awake at this time.',
    };
  }

  function contactEvents() {
    return [...events];
  }

  return { logContact, setLocations, health, checkProposedTime, contactEvents, flow };
}

module.exports = {
  buildSpaceDistance,
  computeCadenceBaseline,
  computeAwakeOverlapHours,
  computeOverlapWindowUTC,
  isWithinOverlapWindow,
  computeDistanceHealth,
  realUtcOffsetMinutes,
};
