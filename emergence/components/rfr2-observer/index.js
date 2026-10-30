'use strict';
/**
 * rfr2-observer -- WARP wiring around the real, unmodified
 * vendor/rfr2/field/relational.js. Lens-rooted (Emerge): observes,
 * annotates, never drawbridges, never mutates flow.
 *
 * UPDATE: alk.verbal.analysis.sentiment is now wired via
 * sentiment-scorer.js (NEW code, not vendored -- nothing in rfr2 actually
 * produces this cause, only consumes it; see that file's header).
 *
 * STILL A GAP: alk.latent.update is not wired. Its real producer
 * (LatentModel) needs multimodal input (face/body/voice/speech) -- not
 * text-fakeable, so rupture_severity stays pinned.
 *
 * NINE Liminal signals now wired, all real, all unmodified, all on the
 * same shared Liminal bus (createBus() -- a complete real pub/sub
 * implementation, no adapter needed):
 *   oscillatory     -- pendulum math + intermittent-reinforcement
 *   relationalGaps  -- gaslighting/manipulation/control (aliased import,
 *                      genuine class-name collision with field/relational.js)
 *   reversal        -- meaning inversion ("fine" meaning not fine)
 *   negativeSpace   -- systematic avoidance across a rolling window
 *   shadow          -- unspoken emotional/cognitive material
 *   assumption      -- load-bearing assumptions treated as fact
 *   structural       -- the conversation's own implicit power geometry
 *   existential      -- identity/meaning concentrated in a single source
 *   contrastive      -- stated position vs. what the text is actually doing
 *
 * HONEST CALIBRATION NOTE, checked directly, not assumed: `assumption`'s
 * real threshold (composite < 0.18 -> null, hardcoded, not configurable
 * -- checked its constructor) fires on ordinary unhedged declarative
 * sentences. "the meeting is at 3pm tomorrow" scores 0.25 and produces a
 * real, non-null signal -- verified directly, this is the module's
 * actual designed behavior, not a bug in this wiring. The other eight
 * signals were each individually verified to stay honestly null on that
 * same neutral sentence. Treat `assumption` firing as a much weaker
 * signal than the other eight -- it is calibrated for analytical/
 * argumentative text, not casual conversation.
 * TENTH SIGNAL, `affectiveField` -- vendor/resonance-v5.1/relational-physics.js
 * (RelationalFieldAnalyzer). Different lineage than everything else here
 * -- not from rfr2 at all, from the separate resonance-v5.1-patches
 * upload. Self-contained, zero imports. Computes an emotional field
 * (Theta: entropy/intensity/certainty/intimacy/compassion/empathy) from
 * text, then the closest emotion-basin match against 16 named emotions
 * plus dual-pole field signatures (e.g. "grief+guilt" = self_loss_field).
 *
 * TWO REAL BUGS FOUND AND FIXED IN THE SOURCE, not design changes: (1) a
 * missing `/**` comment opener before the EmotionEngine class, and (2)
 * an unclosed `/**` comment block that silently swallowed two constant
 * declarations, causing "Export '_CLUSTER_THRESHOLD' is not defined" at
 * load time. This file had never actually been executed by anyone
 * before this integration -- both were genuine syntax errors, not
 * something a design review would have caught, only running it would.
 *
 * CRITICAL CALIBRATION DIFFERENCE, verified directly: unlike the other
 * 9 signals, this one NEVER returns null. It always computes a closest
 * emotional basin, even for "the meeting is at 3pm tomorrow" (returned
 * "shame", confidence 0.66). There is no abstention mechanism in the
 * source -- thetaFromText() always produces some Theta from defaults,
 * and analyzePoint() always finds the nearest basin to whatever Theta
 * that is. Read this signal as "the closest emotional shape to this
 * text's entropy/certainty/intimacy profile," not "an emotion was
 * detected here" -- the latter framing would be a claim the module
 * itself doesn't make and can't support.
 *
 * SECOND CALIBRATION LIMITATION, also found while testing, not assumed:
 * thetaFromText() only responds to a narrow set of meta-linguistic
 * marker words (certainty/hedge/causal/intimacy/empathy/intensity --
 * six fixed regex lists in the source), NOT common emotion words.
 * "happy", "grateful", "furious", "broken" hit none of the six lists --
 * two clearly opposite-valence sentences using only those words produce
 * the IDENTICAL default Theta. Verified directly (see
 * test/affective-field.test.js's "KNOWN BLIND SPOT" test). The
 * mechanism genuinely works when real trigger vocabulary is present
 * (certainty vs. hedge words measurably shift C) -- it just doesn't
 * cover ordinary emotion vocabulary the way you might expect from
 * something computing an "emotional field."
 */

const { Cause, Drawbridge } = require('../../../warp');
const path = require('path');
const { createSentimentScorer } = require('./sentiment-scorer.js');

const RELATIONAL_MODULE_URL = 'file://' + path.resolve(__dirname, '../../vendor/rfr2/field/relational.js');
const KERNEL_ADAPTER_URL = 'file://' + path.resolve(__dirname, './kernel-adapter.mjs');
const LIMINAL_BUS_URL = 'file://' + path.resolve(__dirname, '../../vendor/rfr2/liminal/bus.js');
const OSCILLATORY_URL = 'file://' + path.resolve(__dirname, '../../vendor/rfr2/liminal/oscillatory.js');
const RELATIONAL_GAPS_URL = 'file://' + path.resolve(__dirname, '../../vendor/rfr2/liminal/relational-gaps.js');
const REVERSAL_URL = 'file://' + path.resolve(__dirname, '../../vendor/rfr2/liminal/reversal.js');
const NEGATIVE_SPACE_URL = 'file://' + path.resolve(__dirname, '../../vendor/rfr2/liminal/negative-space.js');
const SHADOW_URL = 'file://' + path.resolve(__dirname, '../../vendor/rfr2/liminal/shadow.js');
const ASSUMPTION_URL = 'file://' + path.resolve(__dirname, '../../vendor/rfr2/liminal/assumption.js');
const STRUCTURAL_URL = 'file://' + path.resolve(__dirname, '../../vendor/rfr2/liminal/structural.js');
const EXISTENTIAL_URL = 'file://' + path.resolve(__dirname, '../../vendor/rfr2/liminal/existential.js');
const CONTRASTIVE_URL = 'file://' + path.resolve(__dirname, '../../vendor/rfr2/liminal/contrastive.js');
const RELATIONAL_PHYSICS_URL = 'file://' + path.resolve(__dirname, '../../vendor/resonance-v5.1/relational-physics.js');
const RESONANCE_ENGINE_URL = 'file://' + path.resolve(__dirname, '../../vendor/resonance-v5.1/engines/resonance-engine.js');
const { scoreDysfluencyFused, scoreCoherence, detectContradictions, detectFrameworks } = require('../../vendor/rheon-voice/analysis-engine.js');

function buildObserverGate() {
  let session = null;

  async function ensureSession() {
    if (session) return session;
    const [
      { RelationalModule }, { createMinimalKernel }, { createBus, LIM },
      { OscillatoryModule }, { RelationalModule: LiminalRelationalModule },
      { ReversalModule }, { NegativeSpaceModule }, { ShadowFieldModule },
      { AssumptionModule }, { StructuralAssumptionModule }, { ExistentialModule },
      { ContrastiveModule }, { RelationalFieldAnalyzer }, { ResonanceEngine },
    ] = await Promise.all([
      import(RELATIONAL_MODULE_URL),
      import(KERNEL_ADAPTER_URL),
      import(LIMINAL_BUS_URL),
      import(OSCILLATORY_URL),
      import(RELATIONAL_GAPS_URL),
      import(REVERSAL_URL),
      import(NEGATIVE_SPACE_URL),
      import(SHADOW_URL),
      import(ASSUMPTION_URL),
      import(STRUCTURAL_URL),
      import(EXISTENTIAL_URL),
      import(CONTRASTIVE_URL),
      import(RELATIONAL_PHYSICS_URL),
      import(RESONANCE_ENGINE_URL),
    ]);
    const kernel = createMinimalKernel();
    const mod = new RelationalModule({ kernel });
    mod.start();
    kernel.emit('alk.session.capture.start', { sessionId: 'emergence-session' });

    const liminalBus = createBus();
    new OscillatoryModule({ bus: liminalBus, windowSize: 40 }).attach();
    new LiminalRelationalModule({ bus: liminalBus }).attach();
    new ReversalModule({ bus: liminalBus }).attach();
    new NegativeSpaceModule({ bus: liminalBus, windowSize: 40 }).attach();
    new ShadowFieldModule({ bus: liminalBus }).attach();
    new AssumptionModule({ bus: liminalBus }).attach();
    new StructuralAssumptionModule({ bus: liminalBus }).attach();
    new ExistentialModule({ bus: liminalBus }).attach();
    new ContrastiveModule({ bus: liminalBus }).attach();
    const fieldAnalyzer = new RelationalFieldAnalyzer();
    const resonanceEngine = new ResonanceEngine({ project: 'emergence' });
    const conversationNodes = []; // rolling text history for coherence/contradiction detection -- {id, text}
    const frameworkTally = {}; // real accumulating counts, per detectFrameworks' own contract

    session = { kernel, module: mod, sentiment: createSentimentScorer(), liminalBus, LIM, fieldAnalyzer, resonanceEngine, conversationNodes, frameworkTally };
    return session;
  }

  return new Drawbridge('rfr2:observe', {
    schema: { requiredKeys: ['summary', 'health'] },
    async transform(cause) {
      const { text } = cause.data;
      const { kernel, module: mod, sentiment, liminalBus, LIM, fieldAnalyzer, resonanceEngine, conversationNodes, frameworkTally } = await ensureSession();

      const { score, polarity, rollingAvg } = sentiment.score(text);
      kernel.emit('alk.verbal.analysis.sentiment', { score, polarity, rollingAvg });
      kernel.emit('alk.verbal.chunk.transcribed', { text });
      kernel.emit('alk.session.capture.stop', {});
      kernel.emit('alk.session.capture.start', { sessionId: 'emergence-session' });

      const summaryEvent = [...kernel.captured].reverse().find(e => e.type === 'alk.rel.summary');

      const captured = {};
      const subs = [
        ['oscillatory', LIM.GAP_OSCILLATORY],
        ['relationalGaps', LIM.GAP_RELATIONAL],
        ['reversal', LIM.GAP_REVERSAL],
        ['negativeSpace', LIM.GAP_NEGATIVE_SPACE],
        ['shadow', LIM.GAP_SHADOW],
        ['assumption', LIM.GAP_ASSUMPTION],
        ['structural', LIM.GAP_STRUCTURAL],
        ['existential', LIM.GAP_EXISTENTIAL],
        ['contrastive', LIM.GAP_CONTRASTIVE],
      ];
      const unsubs = subs.map(([key, evType]) =>
        liminalBus.on(evType, (payload) => { captured[key] = payload; })
      );
      liminalBus.emit(LIM.INGEST_TRANSLATED, { text });
      unsubs.forEach(u => u());

      // real, self-contained, different lineage -- never null, see header
      // for the calibration note on why that's stated plainly, not hidden
      const theta = fieldAnalyzer.thetaFromText(text);
      const affectiveField = fieldAnalyzer.analyzePoint(theta);

      // ELEVENTH SIGNAL, resonanceAnalysis -- the real, orchestrating
      // ResonanceEngine.analyzeText(), see header. Also never null, same
      // calibration note as affectiveField applies.
      const resonanceAnalysis = resonanceEngine.analyzeText(text);

      // TWELFTH SIGNAL, conversationAnalytics -- real, self-contained
      // functions from vendor/rheon-voice/analysis-engine.js. Checked
      // directly: dysfluency and coherence genuinely work text-only
      // (acousticScore defaults to 0; coherence needs no audio at all).
      // contradiction/framework detection compare against a real rolling
      // window of this session's own prior text, maintained here.
      const dysfluency = scoreDysfluencyFused(text, 0);
      const coherence = scoreCoherence(text, conversationNodes);
      const contradictions = detectContradictions(text, conversationNodes);
      const frameworks = detectFrameworks(text, frameworkTally);
      const conversationAnalytics = { dysfluency, coherence, contradictions, frameworks };

      // update rolling history AFTER computing this tick's signals --
      // coherence/contradictions compare against everything BEFORE this
      // message, not including it
      conversationNodes.push({ id: `node-${conversationNodes.length}`, text });
      if (conversationNodes.length > 40) conversationNodes.shift(); // bounded, same window size as oscillatory/negativeSpace

      return [
        new Cause('rfr2:observed', {
          summary: summaryEvent ? summaryEvent.payload : null,
          health: mod.health(),
          oscillatory: captured.oscillatory ?? null,
          relationalGaps: captured.relationalGaps ?? null,
          reversal: captured.reversal ?? null,
          negativeSpace: captured.negativeSpace ?? null,
          shadow: captured.shadow ?? null,
          assumption: captured.assumption ?? null,
          structural: captured.structural ?? null,
          existential: captured.existential ?? null,
          contrastive: captured.contrastive ?? null,
          affectiveField,
          resonanceAnalysis,
          conversationAnalytics,
        }),
      ];
    },
  });
}

module.exports = { buildObserverGate };
