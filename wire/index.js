'use strict';
/**
 * wire — Component/Hook/Wire/Consumer, built on WARP's real
 * Cause/Drawbridge/Flow/Axiom. Decoupled as its own package, sibling to
 * warp/ and emergence/ — not NEXUS's loom, not emergence-specific.
 *
 * Fixes a real, found problem: 5 of emergence's 8 components exposed no
 * facade, forcing the orchestrator to reach into WARP's own internal
 * `flow.pending` array to extract results by hand. Hook.call() does
 * that extraction once, correctly (via Flow's real .on() observer, not
 * .pending), so no component has to hand-roll it again. Component
 * requires every operation to go through a named Hook. Wire replaces
 * inline, unnamed connection code with a real, independently-testable
 * object. Consumer makes "who called this" structural, not a
 * convention someone has to remember to pass by hand.
 */
const { Component } = require('./core/Component.js');
const { Hook } = require('./core/Hook.js');
const { Wire } = require('./core/Wire.js');
const { Consumer } = require('./core/Consumer.js');

module.exports = { Component, Hook, Wire, Consumer };
