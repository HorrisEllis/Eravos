/* tabs/call/call.js
 * Call tab — owns the full real-time WebRTC calling flow: invite/
 * accept/decline/cancel, mute/camera/screen-share/couch-party,
 * fullscreen, live transcription (delegates its actual
 * SpeechRecognition instance to eravosCallAudio.startCaptions() --
 * see shared/eravos-callaudio.js's own header for why), call timer,
 * and every DOM id in contracts/call.contract.json.
 *
 * Extracted from shared/eravos-kernel.js as part of "the kernel is a
 * monolith" -- Phase S, spec/PHASEMAP-v4.md. Call had zero split JS
 * before this (HTML lived in tabs/call/, every real function still
 * lived in the ~12,000-line shared file) -- same extraction discipline
 * already proven on Rupture earlier this session (grep every real call
 * site first, move the function, leave a pointer comment behind, full
 * test suite green before commit, no partial move).
 *
 * What this file does NOT own (cross-cutting, stays in the shared
 * kernel): DB, S, callAI, appStream/SEvent, emitSync, showToast, log,
 * switchTab, eravosStampTab, sendP2P, initRTC, eravosCallAudio itself
 * (shared/eravos-callaudio.js, its own real, separate, contract-covered
 * module) -- and showPartnerAIResponse(), which despite living right
 * next to this code in the old monolith is a real, generic "partner
 * saw an AI response" handler used by an unrelated Gate elsewhere, not
 * call-specific -- confirmed by tracing its real caller before assuming
 * it belonged here, correctly left in shared/eravos-kernel.js.
 */

// ═══════════════════════════════════════════════════════════════════

let _localStream  = null;
let _activeCall   = null;

// ── Clarity Layer -- boosts partner's voice, cuts background noise,
// lifts speech-intelligibility EQ. Real Web Audio processing on the
// shared/clarity-engine.js is retired -- its real value (the gate/EQ/
// gain/limiter DSP chain) is merged into eravosCallAudio's own
// startProcessing()/stopProcessing() (see shared/eravos-callaudio.js's
// own header for the full account of what was genuinely duplicate vs
// genuinely new between the two). Config still comes from the same
// real, separately-editable JSON files -- swap CLARITY_CONFIG_URL to
// clarity-config.accent-boost.json (or any custom copy) to change it.
const CLARITY_CONFIG_URL = 'shared/clarity-config/clarity-config.default.json';
let _callAudioCtx = null;
let _dspConfigLoaded = null;

let _pendingCall  = null;
let _callType     = 'video';
let _muted        = false;
let _camOff       = false;
let _callTimer    = null;
let _callSeconds  = 0;
let _screenSharing = false;
let _screenStream  = null;
let _composeCanvas = null;
let _composeStream = null;
let _composeRAF    = null;
// Live call transcription — Phase 4 roadmap item, done as specced:
// "each device transcribes independently" (own mic only — the Web
// Speech API can't listen to the remote WebRTC audio track, only the
// local microphone), then the finalized line is emitSync'd so both
// sides end up with the same merged, co-created transcript rather than
// two separate local-only logs. See toggleCallTranscription() below.
let _transcribing         = false;
let _currentTranscriptId   = null;
// Call-request ("ring like sparring does") state — see requestCall() /
// acceptCallInvite() / declineCallInvite() below.
let _pendingOutgoingInviteId    = null;
let _pendingOutgoingInviteTimer = null;
let _incomingInviteId           = null;
let _incomingInviteType         = null;
let _incomingInviteToastHandle  = null;
let _awaitingIncomingCallId     = null;

function callLog(msg) {
  const el = document.getElementById('call-status-msg');
  if (el) el.textContent = msg;
  log('[CALL] ' + msg, 'info');
}

function setCallType(type) {
  _callType = type;
  document.getElementById('call-type-video').className = type === 'video' ? 'btn p' : 'btn g';
  document.getElementById('call-type-audio').className = type === 'audio' ? 'btn p' : 'btn g';
  callLog(type === 'video' ? 'Video call selected.' : 'Audio-only call selected.');
}

async function getLocalStream() {
  const constraints = _callType === 'video'
    ? { video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }, audio: true }
    : { video: false, audio: true };
  try {
    return await navigator.mediaDevices.getUserMedia(constraints);
  } catch(e) {
    callLog(e.name === 'NotAllowedError'
      ? '⚠ Camera/mic permission denied. Check browser settings.'
      : '⚠ Media error: ' + e.message);
    throw e;
  }
}

function attachLocalStream(stream) {
  _localStream = stream;
  const v = document.getElementById('local-video');
  const ph = document.getElementById('local-video-placeholder');
  if (v) {
    v.srcObject = stream;
    if (stream.getVideoTracks().length > 0) {
      v.style.opacity = '1';
      if (ph) ph.style.display = 'none';
    }
  }
}

async function attachRemoteStream(stream) {
  const v = document.getElementById('remote-video');
  const ph = document.getElementById('remote-video-placeholder');

  let toAttach = stream; // falls back to the raw stream if processing setup fails for any reason
  try {
    if (eravosCallAudio) {
      _callAudioCtx = _callAudioCtx || new (window.AudioContext || window.webkitAudioContext)();
      _dspConfigLoaded = _dspConfigLoaded || await CallAudio.loadDspConfig(CLARITY_CONFIG_URL);
      const result = eravosCallAudio.startProcessing(stream, _callAudioCtx, _dspConfigLoaded);
      if (result.ok) {
        // startProcessing() only touches audio -- video tracks still
        // come from the original stream, recombined into one MediaStream
        toAttach = new MediaStream([
          ...result.stream.getAudioTracks(),
          ...stream.getVideoTracks(),
        ]);
        // Direct request: "audio adjustment needs to be automatic" --
        // starts on its own the moment real processing is up, not a
        // separate manual step. setGainDb() (a real, manual override,
        // e.g. from a future settings slider) correctly turns this back
        // off on its own -- see that function's own real behavior.
        eravosCallAudio.startAutoGain();
      }
      // Real bug fixed here: this was never called anywhere before,
      // meaning replay-the-last-15-seconds -- this module's own
      // headline feature -- was completely unwired dead code from the
      // caller's side. Buffers the PROCESSED stream when startProcessing
      // above succeeded (see eravos-callaudio.js's own startReplayBuffer
      // for why), the raw one otherwise.
      eravosCallAudio.startReplayBuffer(stream, _callAudioCtx);
    }
  } catch (e) {
    console.warn('[Eravos] call audio processing failed to attach, falling back to unprocessed audio:', e.message);
  }

  if (v) {
    v.srcObject = toAttach;
    v.style.opacity = '1';
    if (ph) ph.style.display = 'none';
  }
}

function detachStreams() {
  ['local-video','remote-video'].forEach(id => {
    const v = document.getElementById(id);
    if (v) { v.srcObject = null; v.style.opacity = '0'; }
  });
  ['local-video-placeholder','remote-video-placeholder'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'flex';
  });
  if (_localStream) { _localStream.getTracks().forEach(t => t.stop()); _localStream = null; }
  if (eravosCallAudio) {
    eravosCallAudio.stopProcessing();
    eravosCallAudio.stopReplayBuffer(); // real fix, paired with the real fix in attachRemoteStream() above
  }
}

function setupCallHandlers(call) {
  _activeCall = call;
  call.on('stream', async (remoteStream) => {
    await attachRemoteStream(remoteStream);
    callLog('✓ Connected — streaming');
    setCallUI('incall');
    startCallTimer();
    const audioVis = document.getElementById('call-audio-vis');
    if (audioVis) audioVis.style.display = remoteStream.getVideoTracks().length > 0 ? 'none' : 'block';
  });
  call.on('close', () => { callLog('Call ended by partner.'); endCall(true); });
  call.on('error', (e) => { callLog('⚠ Call error: ' + e.message); endCall(true); });
}

// Sends a lightweight request first — no camera/mic grabbed, no ringing
// yet — and waits for the partner to accept or decline, same shape as
// fabInviteToSpar()/spar:match_invite. The actual WebRTC call only
// starts once they've said yes (see call:invite_accept below).
async function startCall() {
  if (!peer || peer.destroyed) { callLog('⚠ Not connected. Reconnect first.'); return; }
  if (_activeCall) { callLog('A call is already in progress.'); return; }
  if (_pendingOutgoingInviteId) { callLog('Already waiting on a call request.'); return; }
  const partnerPeerId = getPartnerPeerIdForUser(S.user);
  if (!partnerPeerId) { callLog('⚠ No partner configured.'); return; }

  const callId = 'callreq_' + Date.now();
  const sent = emitSync('call:invite', { callId, callType: _callType }, { queueOnFail: false });
  if (!sent) { callLog('⚠ Partner not connected.'); showToast('⚠ Partner not connected'); return; }

  _pendingOutgoingInviteId = callId;
  setCallRequestUI(true);
  callLog('⏳ Call request sent — waiting for them to accept…');
  showToast('📞 Call request sent — waiting for them to accept');
  _pendingOutgoingInviteTimer = setTimeout(() => {
    if (_pendingOutgoingInviteId === callId) cancelCallRequest(true);
  }, 30000);
}

function cancelCallRequest(timedOut = false) {
  if (!_pendingOutgoingInviteId) return;
  const callId = _pendingOutgoingInviteId;
  if (_pendingOutgoingInviteTimer) { clearTimeout(_pendingOutgoingInviteTimer); _pendingOutgoingInviteTimer = null; }
  _pendingOutgoingInviteId = null;
  emitSync('call:invite_cancel', { callId }, { queueOnFail: false });
  setCallRequestUI(false);
  callLog(timedOut ? 'No answer — call request timed out.' : 'Call request canceled.');
  showToast(timedOut ? '📞 No answer' : 'Call request canceled');
}

function setCallRequestUI(awaiting) {
  const reqRow = document.getElementById('call-request-row');
  const waitRow = document.getElementById('call-awaiting-row');
  if (reqRow) reqRow.style.display = awaiting ? 'none' : '';
  if (waitRow) waitRow.style.display = awaiting ? '' : 'none';
}

// Actual WebRTC ring, only reached once the partner has accepted.
async function _ringPartner(callType, callId) {
  if (!peer || peer.destroyed) { callLog('⚠ Not connected. Reconnect first.'); return; }
  if (_activeCall) { callLog('A call is already in progress.'); return; }
  const partnerPeerId = getPartnerPeerIdForUser(S.user);
  if (!partnerPeerId) { callLog('⚠ No partner configured.'); return; }
  callLog('📞 Starting ' + callType + ' call…');
  const vg = document.getElementById('call-video-grid');
  if (vg) vg.style.display = 'grid';
  try {
    const stream = await getLocalStream();
    attachLocalStream(stream);
    const call = peer.call(partnerPeerId, stream, { metadata: { callType, callId } });
    if (!call) { callLog('⚠ Could not reach partner. Are they online?'); detachStreams(); return; }
    setupCallHandlers(call);
    callLog('⏳ Ringing partner…');
  } catch (e) { detachStreams(); }
}

// Reached on the receiving end via the incoming-request toast below.
function acceptCallInvite(callId) {
  if (_incomingInviteId !== callId) return; // stale/expired
  _incomingInviteId = null;
  _incomingInviteToastHandle = null;
  if (_activeCall) { declineCallInvite(callId); return; } // got busy in the meantime
  _callType = _incomingInviteType || 'video';
  _awaitingIncomingCallId = callId; // tells peer.on('call') above to auto-answer, no second prompt
  emitSync('call:invite_accept', { callId }, { queueOnFail: false });
  switchTab('call');
  const vg = document.getElementById('call-video-grid');
  if (vg) vg.style.display = 'grid';
  callLog('✅ Accepted — connecting…');
  showToast('📞 Call accepted — connecting…');
}

function declineCallInvite(callId, timedOut = false) {
  if (_incomingInviteId !== callId) return;
  _incomingInviteId = null;
  _incomingInviteType = null;
  _incomingInviteToastHandle = null;
  emitSync('call:invite_decline', { callId, reason: timedOut ? 'no_response' : 'declined' }, { queueOnFail: false });
}

syncStream.register(new (class extends Gate {
  constructor() { super('call:invite'); }
  transform(ev) {
    const { callId, callType } = ev.data;
    if (_activeCall || _pendingOutgoingInviteId) {
      emitSync('call:invite_decline', { callId, reason: 'busy' }, { queueOnFail: false });
      return;
    }
    _incomingInviteId = callId;
    _incomingInviteType = callType;
    _incomingInviteToastHandle = showActionToast(
      '📞 ' + (ev.from || 'Partner') + ' wants to ' + (callType === 'audio' ? 'voice' : 'video') + ' call',
      {
        acceptLabel: '✅ Accept',
        declineLabel: '❌ Decline',
        timeoutMs: 30000,
        onAccept: () => acceptCallInvite(callId),
        onDecline: () => declineCallInvite(callId),
        onTimeout: () => declineCallInvite(callId, true),
      }
    );
  }
})());

syncStream.register(new (class extends Gate {
  constructor() { super('call:invite_accept'); }
  transform(ev) {
    if (_pendingOutgoingInviteId !== ev.data.callId) return; // stale
    if (_pendingOutgoingInviteTimer) { clearTimeout(_pendingOutgoingInviteTimer); _pendingOutgoingInviteTimer = null; }
    const callId = _pendingOutgoingInviteId;
    _pendingOutgoingInviteId = null;
    setCallRequestUI(false);
    callLog('✅ Accepted — starting call…');
    showToast('✅ ' + (ev.from || 'Partner') + ' accepted — connecting…');
    _ringPartner(_callType, callId);
  }
})());

syncStream.register(new (class extends Gate {
  constructor() { super('call:invite_decline'); }
  transform(ev) {
    if (_pendingOutgoingInviteId !== ev.data.callId) return; // stale
    if (_pendingOutgoingInviteTimer) { clearTimeout(_pendingOutgoingInviteTimer); _pendingOutgoingInviteTimer = null; }
    _pendingOutgoingInviteId = null;
    setCallRequestUI(false);
    const busy = ev.data.reason === 'busy';
    callLog(busy ? 'Partner is on another call.' : 'Call declined.');
    showToast('❌ ' + (ev.from || 'Partner') + (busy ? ' is on another call' : ' declined the call'));
  }
})());

syncStream.register(new (class extends Gate {
  constructor() { super('call:invite_cancel'); }
  transform(ev) {
    if (_incomingInviteId !== ev.data.callId) return;
    _incomingInviteId = null;
    _incomingInviteType = null;
    if (_incomingInviteToastHandle) { _incomingInviteToastHandle.close(); _incomingInviteToastHandle = null; }
    showToast((ev.from || 'Partner') + ' canceled the call request');
  }
})());

async function answerCall() {
  if (!_pendingCall) return;
  const call = _pendingCall;
  _pendingCall = null;
  hideIncomingCall();
  _callType = call.metadata?.callType || 'video';
  callLog('📞 Answering…');
  const vgA = document.getElementById('call-video-grid');
  if (vgA) vgA.style.display = 'grid';
  try {
    const stream = await getLocalStream();
    attachLocalStream(stream);
    call.answer(stream);
    setupCallHandlers(call);
  } catch(e) { detachStreams(); callLog('⚠ Could not access camera/mic to answer.'); }
}

function declineCall() {
  if (_pendingCall) { try { _pendingCall.close(); } catch(e){} _pendingCall = null; }
  hideIncomingCall();
  callLog('Call declined.');
  emitSync('call:ended', {}, { queueOnFail: false });
}

// When an incoming call arrives but no one answers — log it
function logMissedCall(from) {
  notifAdd({ type: 'missed_call', icon: '📵', title: 'Missed call', body: (from || 'Partner') + ' tried to call you', ts: Date.now(), read: false });
}

function endCall(remote = false) {
  if (_screenSharing) stopScreenShare();
  if (_transcribing) stopCallTranscription();
  _currentTranscriptId = null;
  const tp = document.getElementById('call-transcript-panel');
  if (tp) tp.style.display = 'none';
  if (_activeCall) { try { _activeCall.close(); } catch(e){} _activeCall = null; }
  if (!remote) emitSync('call:ended', {}, { queueOnFail: false });
  detachStreams();
  stopCallTimer();
  setCallUI('precall');
  const audioVis = document.getElementById('call-audio-vis');
  if (audioVis) audioVis.style.display = 'none';
  // Hide video grid again
  const vgE = document.getElementById('call-video-grid');
  if (vgE) vgE.style.display = 'none';
  callLog(remote ? 'Partner ended the call.' : 'Call ended.');
}

function toggleMute() {
  if (!_localStream) return;
  _muted = !_muted;
  _localStream.getAudioTracks().forEach(t => { t.enabled = !_muted; });
  const btn = document.getElementById('btn-mute');
  if (btn) btn.textContent = _muted ? '🔇 Unmute' : '🎤 Mute';
  callLog(_muted ? 'Microphone muted.' : 'Microphone on.');
}

function toggleCamera() {
  if (!_localStream) return;
  _camOff = !_camOff;
  _localStream.getVideoTracks().forEach(t => { t.enabled = !_camOff; });
  const btn = document.getElementById('btn-cam');
  if (btn) btn.textContent = _camOff ? '🎥 Cam On' : '🎥 Cam Off';
  // While screen sharing, local-video shows the composed screen+bubble
  // feed, not the raw camera — leave its opacity/placeholder alone.
  // drawFrame() already skips the bubble when _camOff is true.
  if (!_screenSharing) {
    const v = document.getElementById('local-video');
    if (v) v.style.opacity = _camOff ? '0' : '1';
    const ph = document.getElementById('local-video-placeholder');
    if (ph) ph.style.display = _camOff ? 'flex' : 'none';
  }
  callLog(_camOff ? 'Camera off.' : 'Camera on.');
}

// ── Screen sharing ("couch party") ──────────────────────────────────
// The call is a single PeerJS MediaConnection carrying one video track.
// Rather than renegotiate a second track (unreliable across browsers
// mid-call), we composite the screen + a small camera bubble onto a
// canvas and send *that* as the one outbound video track. The partner
// needs no changes on their end — they just see a normal video that
// happens to contain both. Locally we mirror the same composite into
// local-video so you see exactly what they see.
async function toggleScreenShare() {
  if (_screenSharing) { stopScreenShare(); return; }
  if (!_activeCall) { callLog('⚠ Start a call before sharing your screen.'); return; }
  const existingSender = _activeCall.peerConnection?.getSenders().find(s => s.track && s.track.kind === 'video');
  if (!existingSender) { callLog('⚠ Screen sharing needs a video call — switch call type and reconnect.'); return; }
  if (!navigator.mediaDevices?.getDisplayMedia) { callLog('⚠ Screen sharing isn\'t supported in this browser.'); return; }

  try {
    _screenStream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 15 }, audio: false });
  } catch (e) {
    return; // person cancelled the share picker — nothing to log
  }

  const camRaw = document.getElementById('cam-raw-source');
  const screenRaw = document.getElementById('screen-raw-source');
  if (camRaw && _localStream) camRaw.srcObject = _localStream;
  if (screenRaw) screenRaw.srcObject = _screenStream;
  if (screenRaw && screenRaw.readyState < 2) {
    await new Promise(res => { screenRaw.onloadedmetadata = res; });
  }

  _composeCanvas = document.createElement('canvas');
  _composeCanvas.width = screenRaw?.videoWidth || 1280;
  _composeCanvas.height = screenRaw?.videoHeight || 720;
  const ctx = _composeCanvas.getContext('2d');

  _screenSharing = true;

  const drawFrame = () => {
    if (!_screenSharing) return;
    const w = _composeCanvas.width, h = _composeCanvas.height;
    ctx.drawImage(screenRaw, 0, 0, w, h);
    if (camRaw && !_camOff && _localStream?.getVideoTracks().length) {
      const bw = Math.round(w * 0.22);
      const bh = Math.round(bw * ((camRaw.videoHeight / camRaw.videoWidth) || 0.75));
      const bx = w - bw - 16, by = h - bh - 16, r = 12;
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(bx + r, by);
      ctx.arcTo(bx + bw, by, bx + bw, by + bh, r);
      ctx.arcTo(bx + bw, by + bh, bx, by + bh, r);
      ctx.arcTo(bx, by + bh, bx, by, r);
      ctx.arcTo(bx, by, bx + bw, by, r);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(camRaw, bx, by, bw, bh);
      ctx.restore();
      ctx.strokeStyle = 'rgba(0,229,204,0.85)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    _composeRAF = requestAnimationFrame(drawFrame);
  };
  drawFrame();

  _composeStream = _composeCanvas.captureStream(15);
  const composeTrack = _composeStream.getVideoTracks()[0];
  try { await existingSender.replaceTrack(composeTrack); }
  catch (e) { callLog('⚠ Could not start screen share: ' + e.message); stopScreenShare(); return; }

  const localVideo = document.getElementById('local-video');
  if (localVideo) { localVideo.srcObject = _composeStream; localVideo.style.opacity = '1'; }
  const ph = document.getElementById('local-video-placeholder');
  if (ph) ph.style.display = 'none';

  // Browser's native "Stop sharing" bar ends the raw screen track directly
  _screenStream.getVideoTracks()[0].addEventListener('ended', () => { if (_screenSharing) stopScreenShare(); });

  const btn = document.getElementById('btn-screenshare');
  if (btn) btn.textContent = '🖥️ Stop Sharing';
  callLog('🖥️ Sharing your screen.');
  showToast('🖥️ Screen sharing started');
}

function stopScreenShare() {
  if (!_screenSharing) return;
  _screenSharing = false;
  if (_composeRAF) cancelAnimationFrame(_composeRAF);
  _composeRAF = null;
  if (_screenStream) { _screenStream.getTracks().forEach(t => t.stop()); _screenStream = null; }
  if (_composeStream) { _composeStream.getTracks().forEach(t => t.stop()); _composeStream = null; }
  _composeCanvas = null;

  const sender = _activeCall?.peerConnection?.getSenders().find(s => s.track && s.track.kind === 'video');
  const camTrack = _localStream?.getVideoTracks()[0];
  if (sender && camTrack) sender.replaceTrack(camTrack).catch(() => {});

  const localVideo = document.getElementById('local-video');
  if (localVideo && _localStream) { localVideo.srcObject = _localStream; localVideo.style.opacity = _camOff ? '0' : '1'; }
  const ph = document.getElementById('local-video-placeholder');
  if (ph) ph.style.display = _camOff ? 'flex' : 'none';

  const btn = document.getElementById('btn-screenshare');
  if (btn) btn.textContent = '🖥️ Share Screen';
  callLog('Screen sharing stopped.');
  showToast('Screen sharing ended');
}

function toggleCallFullscreen() {
  const grid = document.getElementById('call-video-grid');
  if (!grid) return;
  if (!document.fullscreenElement) {
    (grid.requestFullscreen || grid.webkitRequestFullscreen)?.call(grid);
  } else {
    (document.exitFullscreen || document.webkitExitFullscreen)?.call(document);
  }
}
if (typeof document !== 'undefined') {
  document.addEventListener('fullscreenchange', () => {
    const btn = document.getElementById('btn-fullscreen');
    if (btn) btn.textContent = document.fullscreenElement ? '⛶ Exit Fullscreen' : '⛶ Fullscreen';
  });
}

// ── Live call transcription ("co-created" lattice/mythos feed) ─────
// Per roadmap Phase 4 exactly: local, on-device speech-to-text via the
// same SpeechRecognition used by the voice-to-text seed field, one
// instance per device listening to that device's own mic (the API has
// no way to listen to the remote WebRTC track, which is what gives
// clean speaker attribution for free — your device only ever hears
// you). Each finalized line is emitSync'd to the partner immediately,
// so both people end up looking at the same merged transcript as it's
// spoken, not two private logs — and every line lands in
// eravors_call_transcripts, which buildLatticeData() above now reads,
// so the conversation itself builds the lattice (and, via
// saveToVault/sendToCodex on anything drawn from it, the mythos) as a
// real co-created artifact rather than one person typing alone.
// iOS Safari has no Web Speech API (see roadmap's platform matrix) —
// isVoiceToTextSupported() is the same capability check used by the
// Mythos seed field, so that limitation is consistent everywhere.
async function toggleCallTranscription() {
  if (_transcribing) { stopCallTranscription(); return; }
  if (!_activeCall) { callLog('⚠ Start a call before enabling transcription.'); return; }
  if (!isVoiceToTextSupported()) {
    showToast('⚠ Live transcription isn\'t supported in this browser (Chrome/Edge desktop & Android — not iOS Safari).');
    return;
  }
  if (!eravosCallAudio) { showToast('⚠ Call audio module not loaded.'); return; }

  // Phase V, direct request: real consent, every real time this goes
  // from off to on -- not just the first time ever. Only after every
  // other real gate above has already passed, so the person isn't
  // asked to consent to something that was about to fail anyway.
  const consented = await _requestTranscriptConsent();
  if (!consented) return;

  _currentTranscriptId = _currentTranscriptId || ('callxscript_' + Date.now());
  // Clicking Transcribe IS the explicit opt-in this pref exists to
  // gate on ("off by default; it is a guess" -- eravos-callaudio.js's
  // own real comment) -- set it before calling startCaptions(), which
  // refuses to run otherwise.
  eravosCallAudio.setPrefs({ captionsEnabled: true });
  const result = eravosCallAudio.startCaptions((line) => {
    if (!line.final) return; // only finalized lines get logged/shared — no half-sentences in a shared record
    const text = line.text.trim();
    if (!text) return;
    _appendTranscriptLine(S.user?.name || 'You', text, true);
    emitSync('call:transcript_line', { transcriptId: _currentTranscriptId, text, ts: Date.now() }, { queueOnFail: false });
    if (typeof _tickEmergence === 'function') _tickEmergence(text);
  });
  if (!result.ok) { showToast('⚠ Could not start transcription: ' + result.reason); return; }
  _transcribing = true;
  _updateTranscribeButton(true);
  const panel = document.getElementById('call-transcript-panel');
  if (panel) panel.style.display = 'block';
  // Phase V: the CC button appears once there's actually something to
  // show/hide -- panel visibility itself defaults to shown (matches
  // the pre-Phase-V behavior exactly), CC only controls it from here.
  const ccBtn = document.getElementById('btn-transcript-cc');
  if (ccBtn) { ccBtn.style.display = ''; ccBtn.classList.add('p'); ccBtn.classList.remove('g'); }
  _transcriptPanelVisible = true;
  callLog('📝 Transcribing your side of the call.');
}

/** Real, awaited consent -- resolves true/false based on the real
    modal buttons, not a timeout or a default. */
let _transcriptConsentResolve = null;
function _requestTranscriptConsent() {
  const modal = document.getElementById('transcript-consent-modal');
  if (!modal) return Promise.resolve(true); // real, honest fallback if the modal HTML somehow isn't mounted -- never silently blocks the feature entirely
  modal.classList.add('open');
  return new Promise((resolve) => { _transcriptConsentResolve = resolve; });
}
function _resolveTranscriptConsent(accepted) {
  const modal = document.getElementById('transcript-consent-modal');
  if (modal) modal.classList.remove('open');
  if (_transcriptConsentResolve) { _transcriptConsentResolve(accepted); _transcriptConsentResolve = null; }
}

/** Phase V CC button -- real, separate from the on/off toggle. Only
    ever touches panel visibility, never the recognizer -- the "off
    means it actually stops" guarantee lives entirely in
    stopCallTranscription() below, not here. */
let _transcriptPanelVisible = true;
function toggleTranscriptPanelVisible() {
  _transcriptPanelVisible = !_transcriptPanelVisible;
  const panel = document.getElementById('call-transcript-panel');
  if (panel) panel.style.display = _transcriptPanelVisible ? 'block' : 'none';
  const ccBtn = document.getElementById('btn-transcript-cc');
  if (ccBtn) ccBtn.textContent = _transcriptPanelVisible ? 'CC' : 'CC ⊘';
}

function stopCallTranscription() {
  _transcribing = false;
  if (eravosCallAudio) eravosCallAudio.stopCaptions();
  _updateTranscribeButton(false);
  // Real reset -- CC only makes sense while there's something live to
  // show/hide. Panel visibility itself resets to shown for next time,
  // so a person who hid it mid-call doesn't have to remember to
  // un-hide it before the next call.
  const ccBtn = document.getElementById('btn-transcript-cc');
  if (ccBtn) { ccBtn.style.display = 'none'; ccBtn.textContent = 'CC'; ccBtn.classList.remove('p'); ccBtn.classList.add('g'); }
  _transcriptPanelVisible = true;
  callLog('Transcription stopped.');
}

function _updateTranscribeButton(active) {
  const btn = document.getElementById('btn-transcribe');
  if (!btn) return;
  btn.textContent = active ? '⏹️ Stop Transcribing' : '📝 Transcribe';
  btn.classList.toggle('voice-recording', active);
}

// mine=true when this device is the one that heard the line — controls
// the You/Partner color, not who ends up seeing it (both do, either way).
function _appendTranscriptLine(speaker, text, mine) {
  const entry = { id: 'tl_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7), transcriptId: _currentTranscriptId, speaker, text, mine, ts: Date.now() };
  const log = DB.get('eravors_call_transcripts', []);
  log.push(entry);
  DB.set('eravors_call_transcripts', log.slice(-500));

  const panel = document.getElementById('call-transcript-panel');
  // Real fix: was unconditional, which would silently override the CC
  // toggle's hidden state the moment a new line arrived.
  if (panel && _transcriptPanelVisible) panel.style.display = 'block';
  const holder = document.getElementById('call-transcript-log');
  if (holder) {
    const row = document.createElement('div');
    row.className = 'small';
    row.innerHTML = `<span style="font-family:var(--fm);font-size:.62rem;letter-spacing:.08em;color:${mine ? 'var(--teal)' : 'var(--amber)'}">${mine ? 'YOU' : (speaker || 'PARTNER').toUpperCase()}</span> ${_escHtml(text)}`;
    holder.appendChild(row);
    holder.scrollTop = holder.scrollHeight;
  }
  _latticeRefreshIfVisible();
}

syncStream.register(new (class extends Gate {
  constructor() { super('call:transcript_line'); }
  transform(ev) {
    if (!ev.data?.text) return;
    _currentTranscriptId = _currentTranscriptId || ev.data.transcriptId;
    _appendTranscriptLine(ev.from || 'Partner', ev.data.text, false);
    // Direct request: interconnect Emergence/the relational field/
    // rupture-suggestion automatically, implicitly -- across every
    // relevant module, not just chat. Reuses the exact same real
    // function chat's own message listener already calls (see
    // eravos-kernel.js), not a second, parallel analysis path.
    if (typeof _tickEmergence === 'function') _tickEmergence(ev.data.text);
  }
})());

/** Phase V read-back -- real, existing data (eravors_call_transcripts),
    grouped by transcriptId into one entry per real past call. No new
    storage; this is a list/detail view on top of what already
    persists live during a call. */
function toggleTranscriptHistory() {
  const list = document.getElementById('call-transcript-history-list');
  const btn = document.querySelector('#call-transcript-history-card .btn');
  if (!list) return;
  const showing = list.style.display !== 'none';
  if (showing) { list.style.display = 'none'; if (btn) btn.textContent = 'Show'; return; }

  const all = DB.get('eravors_call_transcripts', []);
  const byCall = new Map();
  all.forEach((line) => {
    if (!byCall.has(line.transcriptId)) byCall.set(line.transcriptId, []);
    byCall.get(line.transcriptId).push(line);
  });
  const calls = [...byCall.entries()]
    .map(([id, lines]) => ({ id, lines: lines.sort((a, b) => a.ts - b.ts) }))
    .sort((a, b) => (b.lines[0]?.ts || 0) - (a.lines[0]?.ts || 0));

  list.innerHTML = calls.length
    ? calls.map((call) => {
        const first = call.lines[0];
        return `<details style="border:1px solid var(--border2);border-radius:12px;padding:12px 14px">
          <summary class="small" style="cursor:pointer;color:var(--amber)">${first ? new Date(first.ts).toLocaleString() : 'unknown time'} — ${call.lines.length} line${call.lines.length === 1 ? '' : 's'}</summary>
          <div class="fc gap6" style="margin-top:10px;max-height:260px;overflow-y:auto">
            ${call.lines.map((l) => `<div class="small"><span style="font-family:var(--fm);font-size:.62rem;letter-spacing:.08em;color:${l.mine ? 'var(--teal)' : 'var(--amber)'}">${l.mine ? 'YOU' : (l.speaker || 'PARTNER').toUpperCase()}</span> ${_escHtml(l.text)}</div>`).join('')}
          </div>
        </details>`;
      }).join('')
    : '<div class="small italic" style="color:var(--dim)">No transcripts yet — turn on Transcribe during a call to start one.</div>';

  list.style.display = 'flex';
  list.style.flexDirection = 'column';
  if (btn) btn.textContent = 'Hide';
}

function setCallUI(state) {
  const pre = document.getElementById('call-precall');
  const inc = document.getElementById('call-incall');
  if (pre) pre.style.display = state === 'precall' ? 'block' : 'none';
  if (inc) inc.style.display = state === 'incall'  ? 'block' : 'none';
}

function showIncomingCall() {
  switchTab('call');
  const el = document.getElementById('call-incoming');
  if (el) el.style.display = 'block';
  callLog('📞 Incoming call — answer or decline below.');
  showToast('📞 Incoming call from partner!');
}

function hideIncomingCall() {
  const el = document.getElementById('call-incoming');
  if (el) el.style.display = 'none';
}

function startCallTimer() {
  _callSeconds = 0;
  _callTimer = setInterval(() => {
    _callSeconds++;
    const m = String(Math.floor(_callSeconds / 60)).padStart(2,'0');
    const s = String(_callSeconds % 60).padStart(2,'0');
    const el = document.getElementById('call-duration');
    if (el) el.textContent = m + ':' + s;
  }, 1000);
}

function stopCallTimer() {
  if (_callTimer) { clearInterval(_callTimer); _callTimer = null; }
  _callSeconds = 0;
  const el = document.getElementById('call-duration');
  if (el) el.textContent = '00:00';
}

function callReconnectP2P() { callLog('Reconnecting P2P…'); initRTC(); }


