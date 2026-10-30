'use strict';
/**
 * cascade.js — model cascading (cheap-first cost pattern) + retry ladder.
 * Generalizes seam-queue.js's context/shorter/forensic strategy shape
 * without any NEXUS-specific naming. Escalates only on real failure,
 * feeds the failure back as context — never a blind identical retry.
 */
async function runCascade({ providers, generate, validate, maxAttempts = 3 }) {
  if (!Array.isArray(providers) || providers.length === 0) {
    throw new Error('[warp/cascade] providers must be a non-empty array, cheapest first');
  }
  const attempts = [];
  let lastFailure = null;

  for (let i = 0; i < maxAttempts; i++) {
    const provider = providers[Math.min(i, providers.length - 1)];
    const output = await generate(provider, lastFailure); // lastFailure = context on retry
    const result = validate(output);
    attempts.push({ attempt: i + 1, provider, passed: result.ok, failures: result.failures || [] });

    if (result.ok) {
      return { ok: true, output, attempts };
    }
    lastFailure = result;
  }

  return { ok: false, output: null, attempts, exhausted: true };
}

/**
 * runTwoStage — v1.4 "two-stage generation pipeline." Distinct from
 * runCascade above, which is an N-attempt ladder across providers:
 * two-stage is exactly two phases —
 *
 *   stage 1 (skeleton): cheapest available model, asked for structure
 *     only (whatever "structural_outline_only" means for a given Drawbridge's
 *     schema — WARP doesn't interpret that, the generate function does).
 *   stage 2 (refinement): runs ONLY if stage 1 fails validation or
 *     reports low confidence. Uses a stronger model, fed stage 1's
 *     output as context — refining, not starting over.
 *
 * "low confidence" needs a concrete signal or this condition is
 * unenforceable. WARP does not invent one: the stage-1 generate function
 * must return a `confidence` number (0..1) alongside its output, or the
 * gate is opting out of confidence-gating and only fails_validation
 * triggers stage 2.
 */
async function runTwoStage({
  skeletonProvider, refinementProvider, generate, validate,
  confidenceThreshold = 0.7,
}) {
  if (!skeletonProvider || !refinementProvider) {
    throw new Error('[warp/cascade] runTwoStage requires both skeletonProvider and refinementProvider');
  }

  const stage1 = await generate(skeletonProvider, null);
  const stage1Result = validate(stage1.output ?? stage1);
  const stage1Output = stage1.output ?? stage1;
  const stage1Confidence = typeof stage1.confidence === 'number' ? stage1.confidence : null;

  const lowConfidence = stage1Confidence !== null && stage1Confidence < confidenceThreshold;
  const needsRefinement = !stage1Result.ok || lowConfidence;

  const attempts = [{
    attempt: 1, stage: 'skeleton', provider: skeletonProvider,
    passed: stage1Result.ok, confidence: stage1Confidence, failures: stage1Result.failures || [],
  }];

  if (!needsRefinement) {
    return { ok: true, output: stage1Output, attempts, refined: false };
  }

  const stage2 = await generate(refinementProvider, { previousOutput: stage1Output, reason: !stage1Result.ok ? 'fails_validation' : 'low_confidence', failures: stage1Result.failures });
  const stage2Output = stage2.output ?? stage2;
  const stage2Result = validate(stage2Output);
  attempts.push({
    attempt: 2, stage: 'refinement', provider: refinementProvider,
    passed: stage2Result.ok, failures: stage2Result.failures || [],
  });

  return { ok: stage2Result.ok, output: stage2Result.ok ? stage2Output : null, attempts, refined: true, exhausted: !stage2Result.ok };
}

module.exports = { runCascade, runTwoStage };
