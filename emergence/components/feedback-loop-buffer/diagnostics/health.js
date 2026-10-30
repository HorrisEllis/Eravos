'use strict';
/**
 * health.js — §12.6: "a diagnostic engine answers 'is this healthy right
 * now' continuously, in production." A passing test suite proves this
 * once, at commit time; this answers it live, on every call, from actual
 * current state — never from a cached or assumed value.
 */

function computeHealth({ core, flow, evictionLedger }) {
  const stats = core.stats();
  const rejected = flow.rejected;
  const hardRejections = rejected.filter(r => r.failures.some(f => f.severity === 'hard')).length;
  const softViolations = flow.log.entries()
    .filter(e => e.axiomResult && e.axiomResult.failures.some(f => f.severity === 'soft')).length;

  // health score: starts at 1.0, degrades with hard rejections (system-level
  // integrity failures) more than soft ones (advisory-only). Never goes below 0.
  const penalty = Math.min(1, hardRejections * 0.1 + softViolations * 0.02);
  const score = +(1 - penalty).toFixed(4);

  return {
    status: score >= 0.7 ? 'healthy' : score >= 0.4 ? 'degraded' : 'unhealthy',
    score,
    buffer: stats,
    dispatch: {
      totalCauses: flow.causeCount,
      pending: flow.pending.length,
      hardRejections,
      softViolations,
    },
    evictionLedger: {
      totalRecorded: evictionLedger ? evictionLedger.count() : null,
    },
    checkedAt: Date.now(),
  };
}

module.exports = { computeHealth };
