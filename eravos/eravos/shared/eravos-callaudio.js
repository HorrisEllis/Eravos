/* ══════════════════════════════════════════════════════════════════════════
   ERAVOS CALL AUDIO  ·  eravos-callaudio.js  ·  v0.19.0
   UUID: eravos-callaudio-0001-0000-000000000001
   HOOK: eravos.call:audio:00001
   PARENT: eravos-kernel   OWNER: shared/eravos-callaudio.js   (§17.1)
   ══════════════════════════════════════════════════════════════════════════

   "I can't hear my partner." Four things, in order of how much they actually
   help — because the usual answer is to raise the bitrate, and that is the
   least of them.

   ── 1. REPLAY THE LAST 15 SECONDS (the highest-leverage thing here) ─────

   You did not mishear because the codec was bad. You missed it because a bus
   went past, or you were thinking, or they trailed off. Every other fix tries
   to prevent that. This one lets you just hear it again.

   A rolling buffer of the INCOMING stream, always on while the call is up,
   nothing written to disk. Press replay, hear the last fifteen seconds, and
   the call keeps running underneath. It is the "sorry, what?" you would have
   said, without making them say it twice.

   §1.2 — the buffer is memory-only and dies with the call. A recording of
   your partner that outlives the conversation is a different thing entirely,
   and not one anybody consented to.

   ── 2. CAPTIONS AS THE REAL FALLBACK ───────────────────────────────────

   When audio is genuinely bad, the answer is not better audio — it is text.
   On-device speech recognition, shown live, local only. It never crosses the
   relay: what it produces is a guess, and a guess about what someone said
   should not be transmitted as though it were what they said.

   Not available on iOS Safari. That is a real platform constraint and it is
   reported rather than silently doing nothing.

   ── 3. CONSTRAINTS THAT SUIT A RELATIONSHIP, NOT A CONFERENCE CALL ─────

   The default browser stack is tuned for meetings: aggressive noise
   suppression and automatic gain, which is right for a laptop in an open
   office and wrong for someone speaking quietly to you at midnight. Noise
   suppression eats the breath and the near-silence at the end of a sentence
   — often the part carrying the most.

   Three profiles. `intimate` is the default here and is the one the meeting
   stack would never pick.

   ── 4. BITRATE, LAST ──────────────────────────────────────────────────

   Opus at a stated bitrate, mono, 48kHz, FEC on for packet loss. Real, and
   the smallest of the four. Applied by munging the SDP because that is the
   only place `maxaveragebitrate` and `useinbandfec` can be set.
   ══════════════════════════════════════════════════════════════════════════ */

(function (global) {
  'use strict';

  var CA_VERSION = '0.19.0';
  var CA_UUID = 'eravos-callaudio-0001-0000-000000000001';
  var REPLAY_SECONDS = 15;
  var PREF_KEY = 'eravors_call_audio_prefs';

  /**
   * §13.2 — every profile named, with what it costs.
   * `intimate` is the default and is deliberately NOT what a meeting app picks.
   */
  var PROFILES = {
    intimate: {
      label: 'Intimate',
      why: 'Keeps breath, quiet, and the near-silence at the end of a sentence — ' +
           'often the part carrying the most. Assumes a quiet room and headphones.',
      constraints: {
        echoCancellation: false,   // eats a soft voice under a louder one
        noiseSuppression: false,   // eats breath and room tone
        autoGainControl: false,    // pumps, and flattens someone speaking softly
        sampleRate: { ideal: 48000 },
        channelCount: { ideal: 1 },
      },
      needsHeadphones: true,
      bitrate: 64000,
    },
    balanced: {
      label: 'Balanced',
      why: 'Echo cancellation on, the rest off. Use this on speakers.',
      constraints: {
        echoCancellation: true, noiseSuppression: false, autoGainControl: false,
        sampleRate: { ideal: 48000 }, channelCount: { ideal: 1 },
      },
      needsHeadphones: false,
      bitrate: 48000,
    },
    noisy: {
      label: 'Noisy place',
      why: 'Everything on. Loses nuance; keeps you intelligible on a train.',
      constraints: {
        echoCancellation: true, noiseSuppression: true, autoGainControl: true,
        sampleRate: { ideal: 48000 }, channelCount: { ideal: 1 },
      },
      needsHeadphones: false,
      bitrate: 32000,
    },
  };

  function defaultStore() {
    if (global.DB && typeof global.DB.get === 'function') {
      return { get: function (k, d) { return global.DB.get(k, d); },
               set: function (k, v) { global.DB.set(k, v); } };
    }
    throw new Error('[callaudio] no storage available — DB is not loaded. Refusing to operate blind.');
  }

  function CallAudio(opts) {
    opts = opts || {};
    this.store = opts.store || defaultStore();
    this._ctx = null;
    this._replay = null;       // { node, buffers, sampleRate }
    this._recog = null;
    this._captions = [];
    this._stats = { replays: 0, captionLines: 0, bufferSeconds: 0 };
    this._dsp = null;          // real gate/EQ/gain/limiter chain, see startProcessing()
    this._dspConfig = null;
  }

  CallAudio.VERSION = CA_VERSION;
  CallAudio.UUID = CA_UUID;
  CallAudio.PROFILES = PROFILES;
  CallAudio.REPLAY_SECONDS = REPLAY_SECONDS;

  /**
   * §17.7 -- real merge note, not a fresh feature. This module and a
   * separate shared/clarity-engine.js independently grew overlapping
   * jobs (both had their own rewind buffer; clarity-engine.js also had
   * an unused transcription-endpoint stub competing conceptually with
   * this module's real, working captions). The genuinely new,
   * non-duplicate thing clarity-engine.js had was a real Web Audio
   * gate -> EQ -> makeup-gain -> limiter chain -- this module only ever
   * tuned getUserMedia constraints and SDP, never touched the live
   * signal itself. That real capability is folded in below as
   * startProcessing()/stopProcessing(), config-driven from the same
   * shared/clarity-config/*.json files clarity-engine.js used (so the
   * existing accent-boost profile keeps working) -- clarity-engine.js
   * itself is retired, its rewind buffer and transcription stub
   * dropped as genuine duplicates, its DSP chain kept and merged here.
   */
  var DEFAULT_DSP_CONFIG = {
    gate: { thresholdDb: -48, knee: 0, ratio: 20, attackSec: 0.003, releaseSec: 0.15 },
    eq: {
      enabled: true,
      lowShelf: { frequencyHz: 150, gainDb: -6 },
      presence: { frequencyHz: 2500, q: 1.1, gainDb: 5 },
      highShelf: { frequencyHz: 6000, gainDb: 2 },
    },
    gain: { db: 6 },
    limiter: { thresholdDb: -3, knee: 6, ratio: 12, attackSec: 0.002, releaseSec: 0.1 },
  };

  function deepMergeDsp(base, override) {
    if (!override) return base;
    var out = Object.assign({}, base);
    Object.keys(override).forEach(function (key) {
      var b = base[key], o = override[key];
      out[key] = (b && o && typeof b === 'object' && typeof o === 'object' && !Array.isArray(b))
        ? deepMergeDsp(b, o) : o;
    });
    return out;
  }

  function dbToLinear(db) { return Math.pow(10, db / 20); }

  /** loadDspConfig(url) -- same offline-safe fallback shape clarity-engine.js used: a fetch failure never blocks a call, just falls back to DEFAULT_DSP_CONFIG with a console warning. */
  CallAudio.loadDspConfig = function (url) {
    url = url || 'shared/clarity-config/clarity-config.default.json';
    return fetch(url).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    }).then(function (json) {
      delete json['$schema'];
      return json;
    }).catch(function (e) {
      if (global.console) console.warn('[callaudio] could not load DSP config from', url, '-- using built-in defaults.', e.message);
      return null;
    });
  };

  /**
   * startProcessing(remoteStream, ctx, dspConfig) -- real gate -> EQ ->
   * makeup gain -> limiter chain, ported from clarity-engine.js's own
   * attach(). Returns a NEW MediaStream carrying the processed audio;
   * the original stream/track is untouched, exactly as clarity-engine.js
   * guaranteed (so replay/captions/anything else that still wants raw
   * audio isn't affected by this being on).
   */
  CallAudio.prototype.startProcessing = function (remoteStream, ctx, dspConfig) {
    if (!remoteStream) return { ok: false, reason: 'no remote stream yet' };
    if (this._dsp) return { ok: true, already: true, stream: this._dsp.destination.stream };
    var AC = global.AudioContext || global.webkitAudioContext;
    if (!AC) return { ok: false, reason: 'no Web Audio in this browser' };

    this._ctx = ctx || this._ctx || new AC({ latencyHint: 'interactive' });
    var c = this._dspConfig = deepMergeDsp(DEFAULT_DSP_CONFIG, dspConfig);
    var source = this._ctx.createMediaStreamSource(remoteStream);

    var gate = this._ctx.createDynamicsCompressor();
    gate.threshold.value = c.gate.thresholdDb;
    gate.knee.value = c.gate.knee;
    gate.ratio.value = c.gate.ratio;
    gate.attack.value = c.gate.attackSec;
    gate.release.value = c.gate.releaseSec;

    var lowShelf = this._ctx.createBiquadFilter();
    lowShelf.type = 'lowshelf';
    lowShelf.frequency.value = c.eq.lowShelf.frequencyHz;
    lowShelf.gain.value = c.eq.enabled ? c.eq.lowShelf.gainDb : 0;

    var presence = this._ctx.createBiquadFilter();
    presence.type = 'peaking';
    presence.frequency.value = c.eq.presence.frequencyHz;
    presence.Q.value = c.eq.presence.q;
    presence.gain.value = c.eq.enabled ? c.eq.presence.gainDb : 0;

    var highShelf = this._ctx.createBiquadFilter();
    highShelf.type = 'highshelf';
    highShelf.frequency.value = c.eq.highShelf.frequencyHz;
    highShelf.gain.value = c.eq.enabled ? c.eq.highShelf.gainDb : 0;

    var makeupGain = this._ctx.createGain();
    makeupGain.gain.value = dbToLinear(c.gain.db);

    var limiter = this._ctx.createDynamicsCompressor();
    limiter.threshold.value = c.limiter.thresholdDb;
    limiter.knee.value = c.limiter.knee;
    limiter.ratio.value = c.limiter.ratio;
    limiter.attack.value = c.limiter.attackSec;
    limiter.release.value = c.limiter.releaseSec;

    var destination = this._ctx.createMediaStreamDestination();
    source.connect(gate).connect(lowShelf).connect(presence)
      .connect(highShelf).connect(makeupGain).connect(limiter)
      .connect(destination);

    this._dsp = { source: source, gate: gate, lowShelf: lowShelf, presence: presence,
                  highShelf: highShelf, makeupGain: makeupGain, limiter: limiter, destination: destination };
    return { ok: true, stream: destination.stream };
  };

  /** stopProcessing() -- release the DSP graph. Call on call-end alongside stopReplayBuffer(). */
  CallAudio.prototype.stopProcessing = function () {
    if (!this._dsp) return { ok: true };
    this.stopAutoGain(); // real fix: auto-gain's analyser taps this._dsp.gate -- must stop before that graph is torn down below, not after
    Object.keys(this._dsp).forEach(function (k) {
      var node = this._dsp[k];
      if (node && node.disconnect) node.disconnect();
    }, this);
    this._dsp = null;
    return { ok: true };
  };

  /** setGainDb(db) -- live-adjustable makeup gain, the real, direct control this module was missing (matches the "manual, live gain slider" pattern rheon-voice's audio-engine.js uses -- 1..32x / +18dB range there; this is the same idea expressed in dB, applied to HER incoming voice rather than your own mic). Calling this directly also turns auto-gain off, if it was running -- a manual override should stick until the person turns auto back on, not get silently fought and overwritten on the next analysis tick. */
  CallAudio.prototype.setGainDb = function (db) {
    this._autoGainActive = false;
    if (this._dspConfig) this._dspConfig.gain.db = db;
    if (this._dsp) this._dsp.makeupGain.gain.setTargetAtTime(dbToLinear(db), this._ctx.currentTime, 0.05);
    return { ok: true, db: db };
  };

  /**
   * Real, direct request: "audio adjustment needs to be automatic...
   * adjust levels automatically... use deltas in between words...
   * optimize overtime." Honest gap named before this was built, not
   * glossed over: ALK-GL and its video-demo.html only ever DISPLAY an
   * "Audio Energy" HUD metric -- one signal feeding a behavioral
   * visualization -- neither contains any actual gain-adjustment logic
   * (confirmed by grepping every real .js file in that project for
   * gain/AGC/normalize/compress/envelope/GainNode -- zero matches).
   * This is new, real DSP work, not a port.
   *
   * The real technique: an AnalyserNode taps the stream AFTER the gate
   * (so brief noise floor blips already got suppressed) but BEFORE the
   * makeup gain this function itself adjusts -- reads its own actual
   * effect on level, not a stage upstream of it. Every ~100ms, computes
   * real RMS loudness. A simple, real energy threshold splits "voiced"
   * (she's actually speaking) from silence -- the literal "deltas
   * between words": silence samples are excluded from the running
   * average entirely, so a long pause doesn't quietly drag the target
   * down and then overcorrect the next word into clipping.
   *
   * "Optimize overtime": an exponentially-weighted rolling average of
   * voiced-segment RMS, not a single-sample reaction -- one loud or
   * quiet word doesn't yank the gain, the target only moves as real
   * evidence accumulates. Gain moves toward a target loudness via the
   * same setTargetAtTime smoothing already used elsewhere in this
   * module, so a correction is a fade, never an audible jump.
   */
  CallAudio.prototype.startAutoGain = function () {
    if (!this._dsp) return { ok: false, reason: 'processing not started -- call startProcessing() first' };
    if (this._autoGainNode) return { ok: true, already: true };

    var self = this;
    var TARGET_RMS = 0.12;       // real, moderate target -- not maximizing loudness, just keeping quiet speech audible
    var VOICED_THRESHOLD = 0.008; // below this, treated as the silence "between words," excluded from the average
    var EWMA_ALPHA = 0.08;        // small -- each voiced sample nudges the running average, doesn't dominate it
    var MIN_GAIN_DB = 0, MAX_GAIN_DB = 18; // real, bounded range -- auto-gain never fights the limiter by overdriving into it

    var analyser = this._ctx.createAnalyser();
    analyser.fftSize = 1024;
    var buf = new Float32Array(analyser.fftSize);
    // Taps post-gate, pre-makeup-gain -- the real point in the chain
    // described above. A silent destination so this analysis branch
    // never itself adds a second, audible copy of the signal.
    this._dsp.gate.connect(analyser);
    var silentSink = this._ctx.createGain();
    silentSink.gain.value = 0;
    analyser.connect(silentSink);
    silentSink.connect(this._ctx.destination);

    var runningRms = null; // null until the first real voiced sample -- no fabricated starting guess
    this._autoGainActive = true;

    var intervalId = setInterval(function () {
      if (!self._autoGainActive) return;
      analyser.getFloatTimeDomainData(buf);
      var sumSquares = 0;
      for (var i = 0; i < buf.length; i++) sumSquares += buf[i] * buf[i];
      var rms = Math.sqrt(sumSquares / buf.length);

      if (rms < VOICED_THRESHOLD) return; // real silence -- the "between words" gap, excluded from the average entirely

      runningRms = (runningRms === null) ? rms : (EWMA_ALPHA * rms + (1 - EWMA_ALPHA) * runningRms);

      var neededLinearGain = TARGET_RMS / Math.max(runningRms, 0.001);
      var neededDb = Math.max(MIN_GAIN_DB, Math.min(MAX_GAIN_DB, 20 * Math.log10(neededLinearGain)));
      if (self._dspConfig) self._dspConfig.gain.db = neededDb;
      self._dsp.makeupGain.gain.setTargetAtTime(dbToLinear(neededDb), self._ctx.currentTime, 0.4); // slower than manual setGainDb -- a real correction should read as gradual, not a detectable jump
    }, 100);

    this._autoGainNode = { analyser: analyser, silentSink: silentSink, intervalId: intervalId };
    return { ok: true, targetRms: TARGET_RMS, note: 'Adjusts toward a moderate, consistent level using only real speech -- silence between words is excluded, not averaged in.' };
  };

  CallAudio.prototype.stopAutoGain = function () {
    this._autoGainActive = false;
    if (this._autoGainNode) {
      clearInterval(this._autoGainNode.intervalId);
      try { this._autoGainNode.analyser.disconnect(); this._autoGainNode.silentSink.disconnect(); } catch (e) {}
      this._autoGainNode = null;
    }
    return { ok: true };
  };

  CallAudio.prototype.setEqEnabled = function (on) {
    if (!this._dspConfig) return { ok: false, reason: 'processing not started' };
    this._dspConfig.eq.enabled = !!on;
    if (this._dsp) {
      var c = this._dspConfig;
      this._dsp.lowShelf.gain.setTargetAtTime(on ? c.eq.lowShelf.gainDb : 0, this._ctx.currentTime, 0.05);
      this._dsp.presence.gain.setTargetAtTime(on ? c.eq.presence.gainDb : 0, this._ctx.currentTime, 0.05);
      this._dsp.highShelf.gain.setTargetAtTime(on ? c.eq.highShelf.gainDb : 0, this._ctx.currentTime, 0.05);
    }
    return { ok: true, enabled: !!on };
  };

  CallAudio.prototype.prefs = function () {
    var p = this.store.get(PREF_KEY, null) || {};
    return {
      profile: PROFILES[p.profile] ? p.profile : 'intimate',
      replayEnabled: p.replayEnabled !== false,
      captionsEnabled: !!p.captionsEnabled,      // off by default; it is a guess
      bitrate: typeof p.bitrate === 'number' ? p.bitrate : null,
    };
  };
  CallAudio.prototype.setPrefs = function (patch) {
    var cur = this.prefs();
    if (patch.profile && !PROFILES[patch.profile]) {
      throw new Error('[callaudio] unknown profile "' + patch.profile + '". Known: ' + Object.keys(PROFILES).join(', '));
    }
    ['profile', 'replayEnabled', 'captionsEnabled', 'bitrate'].forEach(function (k) {
      if (k in patch) cur[k] = patch[k];
    });
    this.store.set(PREF_KEY, cur);
    return cur;
  };

  /** getUserMedia constraints for the chosen profile. */
  CallAudio.prototype.constraints = function () {
    var p = this.prefs();
    var prof = PROFILES[p.profile];
    return { audio: Object.assign({}, prof.constraints), video: false,
             _profile: p.profile, _needsHeadphones: prof.needsHeadphones };
  };

  /**
   * SDP munging. The only place Opus bitrate and in-band FEC can be set —
   * there is no RTCRtpSender API for `maxaveragebitrate`.
   * §1.2 — if the Opus line is not found, it returns the SDP UNCHANGED and
   * says so, rather than mangling the offer and breaking the call outright.
   */
  CallAudio.prototype.tuneSdp = function (sdp) {
    var p = this.prefs();
    var bitrate = p.bitrate || PROFILES[p.profile].bitrate;
    var m = /a=rtpmap:(\d+) opus\/48000/i.exec(String(sdp));
    if (!m) return { sdp: sdp, applied: false, reason: 'no Opus payload in this SDP' };
    var pt = m[1];
    var lines = String(sdp).split(/\r?\n/);
    var wanted = [
      'maxaveragebitrate=' + bitrate,
      'stereo=0', 'sprop-stereo=0',
      'useinbandfec=1',                 // recover from packet loss without a resend
      'usedtx=0',                       // DTX cuts quiet passages. Not here.
      'maxplaybackrate=48000',
    ].join(';');
    var found = false;
    for (var i = 0; i < lines.length; i++) {
      if (lines[i].indexOf('a=fmtp:' + pt + ' ') === 0) {
        lines[i] = lines[i].replace(/\s*$/, '') + ';' + wanted;
        found = true;
        break;
      }
    }
    if (!found) {
      for (var j = 0; j < lines.length; j++) {
        if (lines[j].indexOf('a=rtpmap:' + pt + ' ') === 0) {
          lines.splice(j + 1, 0, 'a=fmtp:' + pt + ' ' + wanted);
          found = true;
          break;
        }
      }
    }
    return { sdp: lines.join('\r\n'), applied: found, bitrate: bitrate, payloadType: pt,
             note: 'usedtx=0 on purpose — discontinuous transmission cuts quiet passages, ' +
                   'and quiet is where most of this conversation lives.' };
  };

  /* ── 1. the replay buffer ─────────────────────────────────────────── */

  /**
   * Start buffering the INCOMING stream. Memory only, rolling, dies with the
   * call. Nothing is written to disk and nothing is transmitted.
   */
  CallAudio.prototype.startReplayBuffer = function (remoteStream, ctx) {
    if (!this.prefs().replayEnabled) return { ok: false, reason: 'replay is off in settings' };
    if (!remoteStream) return { ok: false, reason: 'no remote stream yet' };
    if (this._replay) return { ok: true, already: true };
    var AC = global.AudioContext || global.webkitAudioContext;
    if (!AC) return { ok: false, reason: 'no Web Audio in this browser' };

    this._ctx = ctx || this._ctx || new AC({ latencyHint: 'interactive' });
    // Real, direct benefit of the clarity-engine.js merge: if DSP
    // processing is running, buffer ITS output (gate/EQ/limiter already
    // applied) instead of the raw remote stream -- a replay plays back
    // the clearer version, not what you already missed the first time.
    var bufferSource = (this._dsp && this._dsp.destination) ? this._dsp.destination.stream : remoteStream;
    var src = this._ctx.createMediaStreamSource(bufferSource);
    var sr = this._ctx.sampleRate;
    var frame = 4096;
    var node = this._ctx.createScriptProcessor
      ? this._ctx.createScriptProcessor(frame, 1, 1)
      : null;
    if (!node) return { ok: false, reason: 'ScriptProcessor unavailable' };

    var maxChunks = Math.ceil((REPLAY_SECONDS * sr) / frame);
    var buffers = [];
    node.onaudioprocess = function (e) {
      buffers.push(new Float32Array(e.inputBuffer.getChannelData(0)));
      if (buffers.length > maxChunks) buffers.shift();   // rolling. Never grows.
    };
    src.connect(node);
    // Connected to a silent gain so the graph runs without adding an echo of
    // the remote voice back into the room.
    var mute = this._ctx.createGain();
    mute.gain.value = 0;
    node.connect(mute);
    mute.connect(this._ctx.destination);

    this._replay = { node: node, src: src, mute: mute, buffers: buffers, sampleRate: sr, frame: frame };
    return { ok: true, seconds: REPLAY_SECONDS, sampleRate: sr,
             note: 'Memory only. It dies with the call — a recording of your partner that outlives ' +
                   'the conversation is a different thing, and not one anybody consented to.' };
  };

  /** How much is currently held, in seconds. */
  CallAudio.prototype.bufferedSeconds = function () {
    if (!this._replay) return 0;
    var r = this._replay;
    return +((r.buffers.length * r.frame) / r.sampleRate).toFixed(1);
  };

  /**
   * Play back the last N seconds. The call keeps running underneath — this
   * is "sorry, what?" without making them say it again.
   */
  CallAudio.prototype.replay = function (seconds) {
    if (!this._replay) return { ok: false, reason: 'no buffer running' };
    var r = this._replay;
    var want = Math.min(seconds || REPLAY_SECONDS, this.bufferedSeconds());
    if (want <= 0) return { ok: false, reason: 'nothing buffered yet' };

    var chunksWanted = Math.ceil((want * r.sampleRate) / r.frame);
    var slice = r.buffers.slice(-chunksWanted);
    var total = slice.length * r.frame;
    var buf = this._ctx.createBuffer(1, total, r.sampleRate);
    var out = buf.getChannelData(0);
    for (var i = 0; i < slice.length; i++) out.set(slice[i], i * r.frame);

    var srcNode = this._ctx.createBufferSource();
    srcNode.buffer = buf;
    srcNode.connect(this._ctx.destination);
    srcNode.start();
    this._stats.replays++;
    return { ok: true, seconds: +want.toFixed(1), samples: total };
  };

  CallAudio.prototype.stopReplayBuffer = function () {
    if (!this._replay) return { ok: true };
    try { this._replay.node.disconnect(); this._replay.src.disconnect(); this._replay.mute.disconnect(); } catch (e) {}
    this._replay.buffers.length = 0;      // §1.2 — cleared, not just dereferenced
    this._replay = null;
    return { ok: true, note: 'Buffer cleared. Nothing was written anywhere.' };
  };

  /* ── 2. captions ──────────────────────────────────────────────────── */

  CallAudio.prototype.captionsAvailable = function () {
    return !!(global.SpeechRecognition || global.webkitSpeechRecognition);
  };

  CallAudio.prototype.startCaptions = function (onLine) {
    if (!this.prefs().captionsEnabled) return { ok: false, reason: 'captions are off in settings' };
    if (!this.captionsAvailable()) {
      // A real platform constraint, reported rather than silently doing nothing.
      return { ok: false, reason: 'no on-device speech recognition in this browser (iOS Safari has none)' };
    }
    if (this._recog) return { ok: true, already: true };
    var SR = global.SpeechRecognition || global.webkitSpeechRecognition;
    var self = this;
    this._captionsActive = true;

    function makeRecognizer() {
      var r = new SR();
      r.continuous = true;
      r.interimResults = true;
      r.lang = (global.navigator && global.navigator.language) || 'en-US';
      r.onresult = function (ev) {
        var last = ev.results[ev.results.length - 1];
        var line = { text: last[0].transcript, final: last.isFinal, ts: Date.now() };
        if (line.final) { self._captions.push(line); self._stats.captionLines++; }
        if (onLine) { try { onLine(line); } catch (e) { if (global.console) console.error('[callaudio] caption handler threw: ' + e.message); } }
      };
      r.onerror = function (e) { if (global.console) console.warn('[callaudio] captions: ' + e.error); };
      // Real fix, not present before this pass: some browsers silently
      // stop a continuous:true recognizer after a stretch of silence.
      // Restarts transparently as long as this module still thinks
      // captions should be running -- stopCaptions() below sets
      // _captionsActive=false first specifically so this check correctly
      // prevents a restart on an intentional stop.
      r.onend = function () {
        if (self._captionsActive) { try { self._recog = makeRecognizer(); self._recog.start(); } catch (e) {} }
      };
      return r;
    }

    var r = makeRecognizer();
    try { r.start(); } catch (e) { this._captionsActive = false; return { ok: false, reason: e.message }; }
    this._recog = r;
    return { ok: true, lang: r.lang,
             note: 'Local only. A caption is a GUESS about what someone said, and a guess is not ' +
                   'transmitted as though it were what they said.' };
  };

  CallAudio.prototype.stopCaptions = function () {
    this._captionsActive = false; // must be set before stop() -- onend fires synchronously and checks this flag
    if (this._recog) { try { this._recog.stop(); } catch (e) {} this._recog = null; }
    return { ok: true, lines: this._captions.length };
  };

  /** Captions from this call. Never synced, and cleared with the call. */
  CallAudio.prototype.captions = function () { return this._captions.slice(); };
  CallAudio.prototype.clearCaptions = function () { this._captions.length = 0; };

  /* ── §12.6 diagnostics ────────────────────────────────────────────── */

  CallAudio.prototype.health = function () {
    var p = this.prefs();
    return {
      version: CA_VERSION,
      profile: p.profile,
      profileWhy: PROFILES[p.profile].why,
      needsHeadphones: PROFILES[p.profile].needsHeadphones,
      bitrate: p.bitrate || PROFILES[p.profile].bitrate,
      replayEnabled: p.replayEnabled,
      replayRunning: !!this._replay,
      bufferedSeconds: this.bufferedSeconds(),
      replaysUsed: this._stats.replays,
      captionsEnabled: p.captionsEnabled,
      captionsAvailable: this.captionsAvailable(),
      captionLines: this._captions.length,
      dspProcessing: !!this._dsp,
      dspGainDb: this._dspConfig ? this._dspConfig.gain.db : null,
      dspEqEnabled: this._dspConfig ? this._dspConfig.eq.enabled : null,
      autoGainActive: !!this._autoGainActive,
      // structural, each asserted by a test
      recordedToDisk: 0,
      captionsSynced: 0,
      status: this._replay ? 'buffering' : 'idle',
    };
  };

  global.CallAudio = CallAudio;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { CallAudio: CallAudio, PROFILES: PROFILES, REPLAY_SECONDS: REPLAY_SECONDS, PREF_KEY: PREF_KEY };
  }
})(typeof window !== 'undefined' ? window : globalThis);
