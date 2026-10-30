/**
 * gap-field.js STUB -- NOT the real file. gap-field.js does not exist
 * anywhere in any upload checked across this whole project (confirmed:
 * searched all 10 files in the "*-components.zip" batch, plus every
 * earlier upload). This is a minimal placeholder that lets
 * resonance-engine.js load, not a reimplementation of the real
 * LyricFieldAnalyzer/SequenceFieldAnalyzer.
 *
 * Verified safe to stub, not guessed: checked every call site in
 * resonance-engine.js directly.
 *   - SequenceFieldAnalyzer is constructed but NEVER called anywhere in
 *     the file -- genuinely dead code from this engine's perspective.
 *   - LyricFieldAnalyzer.analyze() is called exactly once, inside
 *     ResonanceEngine's own separate, optional analyzeLyric() method --
 *     not inside the main analyzeText() path. Emergence never calls
 *     analyzeLyric().
 *
 * Both stub methods throw loudly if actually invoked, per this
 * project's own Sec1.2 standard (nothing silently fails) -- if
 * analyzeLyric() is ever wired into Emergence later, this makes the
 * gap impossible to miss rather than returning fabricated data that
 * looks real.
 */

export class LyricFieldAnalyzer {
  analyze(input, opts = {}) {
    throw new Error('[gap-field STUB] LyricFieldAnalyzer.analyze() is not implemented -- gap-field.js was never delivered. real analyzeText() does not need this; only ResonanceEngine.analyzeLyric() does.');
  }
}

export class SequenceFieldAnalyzer {
  analyze(input, opts = {}) {
    throw new Error('[gap-field STUB] SequenceFieldAnalyzer.analyze() is not implemented -- gap-field.js was never delivered. This class is never actually called by resonance-engine.js in the checked version.');
  }
}
