// Thin re-export -- the real SISO Event lives in ./siso.js (found in a
// later upload, ALK-components). Replaces the earlier honest-but-limited
// stub that only satisfied gap-bus.js's imports without real logic.
export { Event } from './siso.js';
