'use strict';
/**
 * warp — pure functional cause-driven devkit, decoupled.
 * Cause -> Drawbridge -> Flow -> FlowLog, Axiom as an enforced primitive,
 * and unifiedDispatch (exact-cache / pre-generation-filter / population /
 * cascade / axiom-gate / score-retain / escalate).
 *
 * Renamed from the original primitive names (Event -> Cause,
 * Gate -> Drawbridge, Stream -> Flow, StreamLog -> FlowLog,
 * GateFusion -> DrawbridgeFusion) -- same architecture, same tests,
 * new vocabulary throughout.
 *
 * Zero dependencies. Nothing in core/ or dispatch/ imports anything
 * outside this folder — see MANIFEST.json's decoupling_rule and
 * warp.spec for the full contract. This file is the one addition: there
 * was no single top-level entry point before (only core/index.js and
 * dispatch/index.js separately) — this just re-exports both plus
 * plugins, so `require('warp')` works instead of reaching into subpaths.
 */
const core = require('./core');
const dispatch = require('./dispatch');
const population = require('./dispatch/population');
const { FlatFileCrystallizer } = require('./plugins/crystallizer-flatfile');
const { scoreDefault, estimateTokens } = require('./plugins/scorer-default');

module.exports = {
  // core primitives
  Cause: core.Cause,
  Drawbridge: core.Drawbridge,
  Axiom: core.Axiom,
  Flow: core.Flow,
  FlowLog: core.FlowLog,
  fuseChain: core.fuseChain,
  canFuse: core.canFuse,

  // dispatch
  unifiedDispatch: dispatch.unifiedDispatch,

  // population + promotion policies
  PopulationStore: population.PopulationStore,
  defaultPromotionPolicy: population.defaultPromotionPolicy,
  reuseCountPromotionPolicy: population.reuseCountPromotionPolicy,
  firstSuccessPromotionPolicy: population.firstSuccessPromotionPolicy,
  DEFAULT_PROMOTE_THRESHOLD: population.DEFAULT_PROMOTE_THRESHOLD,
  DEFAULT_FITNESS_MIN: population.DEFAULT_FITNESS_MIN,

  // plugins (reference implementations — swap for your own via Flow.hook())
  FlatFileCrystallizer,
  scoreDefault,
  estimateTokens,
};
