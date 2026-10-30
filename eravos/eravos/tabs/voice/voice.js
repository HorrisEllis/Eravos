/* ─────────────────────────────────────────────────────────────────────────
   voice tab glue  ·  v0.4.0  ·  HOOK eravos.voice:tab:00004
   Classic script. Owns the mic; the module owns the measurement.
   §5.7 — ONE getUserMedia per session, released on stop.
   §1.2 — permission denial is reported, never silent.
   ───────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  var ctx = null, analyser = null, srcNode = null, stream = null;
  var timeBuf = null, freqBuf = null, sampler = null;

  function snapshot() {
    if (!analyser || !timeBuf) return { pitch: 0, amplitude: 0, zcr: 0, spectralCentroid: 0 };
    analyser.getFloatTimeDomainData(timeBuf);
    var i, sum = 0;
    for (i = 0; i < timeBuf.length; i++) sum += timeBuf[i] * timeBuf[i];
    var rms = Math.sqrt(sum / timeBuf.length);

    var zc = 0;
    for (i = 1; i < timeBuf.length; i++) if ((timeBuf[i] >= 0) !== (timeBuf[i - 1] >= 0)) zc++;

    // autocorrelation F0 — port of rheon-voice v7 audio-engine.js _computePitch
    var pitch = 0;
    if (rms >= 0.01) {
      var SIZE = timeBuf.length, half = SIZE >> 1, corr = new Float32Array(half), lag, j, s;
      for (lag = 0; lag < half; lag++) {
        s = 0;
        for (j = 0; j < SIZE - lag; j++) s += timeBuf[j] * timeBuf[j + lag];
        corr[lag] = s;
      }
      var peak = -1, peakVal = -1, dropped = false;
      for (var k = 1; k < half; k++) {
        if (!dropped && corr[k] < corr[k - 1]) dropped = true;
        if (dropped && corr[k] > peakVal) { peakVal = corr[k]; peak = k; }
        if (dropped && corr[k] < peakVal * 0.5) break;
      }
      if (peak >= 1 && peakVal >= corr[0] * 0.2) {
        var f = Math.round((ctx ? ctx.sampleRate : 44100) / peak);
        if (f >= 60 && f <= 1200) pitch = f;
      }
    }

    var centroid = 0;
    if (freqBuf) {
      analyser.getFloatFrequencyData(freqBuf);
      var num = 0, den = 0, nyq = (ctx ? ctx.sampleRate : 44100) / 2;
      for (i = 0; i < freqBuf.length; i++) {
        var mag = Math.pow(10, freqBuf[i] / 20);
        num += (i / freqBuf.length) * nyq * mag; den += mag;
      }
      centroid = den > 0 ? num / den : 0;
    }
    return { pitch: pitch, amplitude: rms, zcr: zc / timeBuf.length, spectralCentroid: centroid };
  }

  function setState(txt, cls) {
    var el = document.getElementById('voice-state');
    var dot = document.getElementById('voice-health');
    if (el) el.textContent = txt;
    if (dot) dot.className = 'vc-dot ' + (cls || '');
  }

  async function start() {
    if (!window.ALK || !window.ALK.stack || !window.ALK.stack.voice) {
      setState('ALK stack not loaded', 'bad');
      return;
    }
    if (stream) return;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
      });
    } catch (e) {
      // §1.2 — named, specific, visible. Not a console-only failure.
      setState('mic denied: ' + e.name, 'bad');
      var ro = document.getElementById('voice-prosody-readout');
      if (ro) ro.textContent = 'Microphone permission was refused (' + e.name + '). Nothing can be measured.';
      return;
    }
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    srcNode = ctx.createMediaStreamSource(stream);
    analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    srcNode.connect(analyser);
    timeBuf = new Float32Array(analyser.fftSize);
    freqBuf = new Float32Array(analyser.frequencyBinCount);

    sampler = setInterval(function () {
      try { window.ALK.stack.voice.pushFrame(snapshot()); } catch (e) { /* module reports its own faults */ }
    }, 33);

    document.getElementById('voice-start').disabled = true;
    document.getElementById('voice-stop').disabled = false;
    setState('listening', 'ok');
    render();
  }

  function stop() {
    if (sampler) { clearInterval(sampler); sampler = null; }
    if (window.ALK && window.ALK.stack && window.ALK.stack.voice) window.ALK.stack.voice.closeUtterance();
    if (stream) { stream.getTracks().forEach(function (t) { t.stop(); }); stream = null; }
    if (ctx) { try { ctx.close(); } catch (e) {} ctx = null; }
    analyser = null; srcNode = null; timeBuf = null; freqBuf = null;
    var b1 = document.getElementById('voice-start'), b2 = document.getElementById('voice-stop');
    if (b1) b1.disabled = false;
    if (b2) b2.disabled = true;
    setState('idle', '');
    render();
  }

  function render() {
    if (!window.ALK || !window.ALK.stack || !window.ALK.stack.voice) return;
    var vm = window.ALK.stack.voice;
    vm.render(document.getElementById('voice-prosody-readout'));
    var h = vm.health();
    var last = h.observer && window.ALK.stack.voice._observer ? window.ALK.stack.voice._observer.last : null;
    var r = last && last.reading;
    var grid = document.getElementById('voice-metrics');
    if (grid) {
      var cells = [
        ['jitter',  r && r.sufficient ? r.jitter  : '—', 'F0 perturbation'],
        ['shimmer', r && r.sufficient ? r.shimmer : '—', 'amplitude perturbation'],
        ['HNR',     r && r.sufficient ? r.hnr     : '—', 'harmonic / noise'],
        ['F0',      r && r.sufficient ? r.meanF0 + 'Hz' : '—', 'mean pitch'],
        ['voiced',  r ? Math.round((r.voicedRatio || 0) * 100) + '%' : '—', 'frames with phonation'],
        ['read',    h.utterancesRead, 'utterances measured']
      ];
      grid.innerHTML = cells.map(function (c) {
        return '<div class="vc-cell"><b>' + c[1] + '</b><span>' + c[0] + ' · ' + c[2] + '</span></div>';
      }).join('');
    }
    var d = document.getElementById('voice-diag-out');
    if (d) d.textContent = JSON.stringify(h, null, 1);
  }

  function initVoiceTab() {
    var b1 = document.getElementById('voice-start'), b2 = document.getElementById('voice-stop');
    if (b1) b1.addEventListener('click', start);
    if (b2) b2.addEventListener('click', stop);
    if (!window.ALK || !window.ALK.stack || !window.ALK.stack.voice) setState('ALK stack not loaded', 'bad');
    render();
    setInterval(function () { if (stream) render(); }, 1000);
  }

  window.EravosTabInitRenderers = window.EravosTabInitRenderers || {};
  window.EravosTabInitRenderers.voice = initVoiceTab;
  window.addEventListener('alk:ready', function () { if (document.getElementById('panel-voice')) render(); });
})();
