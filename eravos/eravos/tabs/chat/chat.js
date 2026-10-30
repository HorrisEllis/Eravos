/* ─────────────────────────────────────────────────────────────────────────
   chat surfaces  ·  v0.6.0  ·  HOOK eravos.chat:tab:00002
   Two views, ONE engine (§10.1). The page and the popup both render
   window.eravosChat; neither owns the thread. §5.12 — deleting either view
   removes a surface, not the capability.
   ───────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  var ATT_MENU = [
    { kind: 'feeling',     label: '◎ a feeling',        pick: pickFeeling },
    { kind: 'need',        label: '△ a need',            pick: pickNeed },
    { kind: 'sticker',     label: '✦ a sticker',         pick: null },
    { kind: 'vault',       label: '❖ from the vault',    pick: pickVault },
    { kind: 'codex',       label: '❍ from the codex',    pick: pickCodex },
    { kind: 'poem',        label: '✎ a poem',            pick: pickPoem },
    { kind: 'canvas',      label: '▨ from the canvas',   pick: pickCanvas },
    { kind: 'spar_invite', label: '⚔ invite to spar',    pick: pickSpar },
    { kind: 'grammar',     label: '⌘ a shared word',     pick: pickGrammar },
  ];

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function engine() {
    if (!window.eravosChat) throw new Error('[chat] engine not booted — shared/eravos-chat.js missing');
    return window.eravosChat;
  }
  function partnerName() {
    try {
      var users = window.DB ? DB.get('eravors_users', {}) : {};
      for (var k in users) if (users[k].role === 'partner') return users[k].name || k;
    } catch (e) {}
    return 'them';
  }
  function timeOf(ts) {
    var d = new Date(ts);
    return d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0');
  }

  /* ── attachment pickers. Each returns {id,label,preview} or null.
        §1.2 — a picker with nothing to offer SAYS so rather than
        silently attaching nothing. ─────────────────────────────────── */

  function fromList(key, labelField, human) {
    var list = window.DB ? DB.get(key, []) : [];
    if (!list || !list.length) { toast('Nothing in ' + human + ' yet'); return null; }
    var item = list[list.length - 1];
    return { id: String(item.id || item.ts || list.length - 1),
             label: String(item[labelField] || item.title || human),
             preview: String(item.text || item.body || item[labelField] || '').slice(0, 160) };
  }
  function pickFeeling() {
    var f = window.S && S.feeling;
    if (!f || !f.name) { toast('No feeling set right now'); return null; }
    return { id: 'feeling:' + f.name, label: (f.emoji || '') + ' ' + f.name, preview: f.body || null };
  }
  function pickNeed()    { return fromList('eravors_need_history', 'need', 'Needs'); }
  function pickVault()   { return fromList('eravors_vault', 'title', 'the Vault'); }
  function pickCodex()   { return fromList('eravors_codex', 'title', 'the Codex'); }
  function pickPoem()    { return fromList('eravors_journal', 'title', 'Poetry'); }
  function pickCanvas()  { return fromList('eravors_custom_primes', 'title', 'the Canvas'); }
  function pickSpar()    { return { id: 'spar:' + Date.now(), label: 'Spar session', preview: 'An invitation — accept or decline, either is fine.' }; }
  function pickGrammar() {
    var w = window.prompt && window.prompt('A word or phrase that means something specific between you:');
    if (!w || !w.trim()) return null;
    return { id: 'grammar:' + w.toLowerCase().trim().replace(/\s+/g, '_'), label: w.trim(), preview: 'shared grammar' };
  }
  function toast(m) { if (window.showToast) showToast(m); }

  /* ── rendering. Shared by both surfaces. ──────────────────────────── */

  function renderFlow(host, msgs, compact) {
    if (!host) return;
    var last = 0;
    host.innerHTML = msgs.map(function (m) {
      var gap = (m.ts - last) > 6 * 60 * 1000 ? ' gap' : '';
      last = m.ts;
      var state = m.error ? ' failed' : (m.queued && !m.delivered ? ' queued' : '');
      var meta = m.error ? 'not sent — ' + esc(m.error)
               : (m.queued && !m.delivered) ? 'waiting to send'
               : timeOf(m.ts) + (m.mine && m.read ? ' · read' : '');
      var att = m.attachment
        ? (m.attachment.kind === 'sticker'
            ? '<div class="msg-sticker" data-id="' + esc(m.attachment.id) + '">' +
              '<img src="' + ((window.EravosStickers && window.EravosStickers.url(m.attachment.id)) || '') +
              '" alt="' + esc(m.attachment.label || 'sticker') + '"></div>'
            : (m.attachment.kind === 'voice-message' || m.attachment.kind === 'video-message')
            ? '<div class="msg-media msg-recorded">' +
              (m.attachment.kind === 'video-message'
                ? '<video src="' + m.attachment.dataUrl + '" controls></video>'
                : '<audio src="' + m.attachment.dataUrl + '" controls></audio>') +
              '</div>'
            : (m.attachment.kind === 'image' || m.attachment.kind === 'video')
            ? '<div class="msg-media">' +
              (m.attachment.kind === 'video'
                ? '<video src="' + m.attachment.dataUrl + '" controls></video>'
                : '<img src="' + m.attachment.dataUrl + '" alt="photo">') +
              '</div>'
            : '<div class="msg-att" data-kind="' + esc(m.attachment.kind) + '" data-id="' + esc(m.attachment.id) + '">' +
              esc(m.attachment.label || m.attachment.kind) + '</div>')
        : '';
      // Real bubble only around text -- a sticker or photo sitting inside
      // a colored bubble reads wrong (every real chat app renders media
      // at full size/native look, not boxed inside the text-bubble
      // background). Text-less messages (sticker/media/file-only) skip
      // the bubble wrapper entirely.
      var bubble = m.text ? '<div class="msg-bubble">' + esc(m.text).replace(/\n/g, '<br>') + '</div>' : '';
      return '<div class="msg ' + (m.mine ? 'mine' : 'theirs') + gap + state + '">' +
             bubble + att +
             (compact && !m.error && !m.queued ? '' : '<div class="msg-meta">' + meta + '</div>') +
             '</div>';
    }).join('');
    host.scrollTop = host.scrollHeight;
  }

  function attachSheet(host, onPick) {
    host.innerHTML = ATT_MENU.map(function (o, i) {
      return '<div class="att-opt" data-i="' + i + '">' + esc(o.label) + '</div>';
    }).join('');
    host.querySelectorAll('.att-opt').forEach(function (el) {
      el.addEventListener('click', function () {
        var opt = ATT_MENU[+el.dataset.i];
        if (opt.kind === 'sticker') { renderStickerGrid(host, onPick); return; }
        var picked;
        try { picked = opt.pick(); } catch (e) { toast('Could not attach: ' + e.message); return; }
        if (!picked) return;
        onPick({ kind: opt.kind, id: picked.id, label: picked.label, preview: picked.preview });
      });
    });
  }

  /** Real visual picker, not a text list -- a sticker is inherently a
      visual choice, seeing the actual thumbnail is the point. */
  function renderStickerGrid(host, onPick) {
    var stickers = (window.EravosStickers && window.EravosStickers.list) || [];
    if (!stickers.length) { toast('Stickers not available'); return; }
    host.innerHTML =
      '<div class="sticker-grid">' +
      stickers.map(function (s) {
        return '<button class="sticker-opt" data-id="' + esc(s.id) + '" title="' + esc(s.label) + '">' +
               '<img src="' + window.EravosStickers.url(s.id) + '" alt="' + esc(s.label) + '"></button>';
      }).join('') +
      '<button class="sticker-back" id="sticker-back">← back</button>' +
      '</div>';
    host.querySelectorAll('.sticker-opt').forEach(function (el) {
      el.addEventListener('click', function () {
        var s = window.EravosStickers.byId(el.dataset.id);
        if (!s) return;
        onPick({ kind: 'sticker', id: s.id, label: s.label, preview: null });
      });
    });
    var back = document.getElementById('sticker-back');
    if (back) back.addEventListener('click', function () { attachSheet(host, onPick); });
  }

  /* ── full page ────────────────────────────────────────────────────── */

  function renderChatTab() {
    var flow = document.getElementById('chat-flow');
    if (!flow) return;
    var e;
    try { e = engine(); } catch (err) { flow.innerHTML = '<div class="msg theirs">' + esc(err.message) + '</div>'; return; }

    var nameEl = document.getElementById('chat-partner-name');
    if (nameEl) nameEl.textContent = partnerName();

    var q = (document.getElementById('chat-search') || {}).value || '';
    var msgs = e.thread();
    if (q.trim()) {
      var ql = q.toLowerCase();
      msgs = msgs.filter(function (m) {
        return (m.text || '').toLowerCase().indexOf(ql) !== -1 ||
               (m.attachment && (m.attachment.label || '').toLowerCase().indexOf(ql) !== -1);
      });
    }
    renderFlow(flow, msgs, false);

    var r = e.remote();
    var pres = document.getElementById('chat-presence');
    if (pres) {
      // Real, direct request: no online indicator. "is writing..." is
      // standard chat-app convention (immediate conversational context,
      // gone the moment they stop), kept. "is in [tab]" told you what
      // your partner was doing elsewhere in the app right now -- a real,
      // different kind of presence reveal, closer to surveillance than
      // a typing dot. Removed.
      pres.textContent = r.typing ? partnerName() + ' is writing…' : '';
    }

    var prefsHost = document.getElementById('chat-prefs');
    if (prefsHost && !prefsHost.dataset.wired) {
      var p = e.prefs();
      prefsHost.innerHTML =
        prefBox('shareCursor', 'share my cursor', p.shareCursor) +
        prefBox('shareTab', 'share which tab I\'m on', p.shareTab) +
        prefBox('readReceipts', 'read receipts', p.readReceipts);
      prefsHost.querySelectorAll('input[data-pref]').forEach(function (el) {
        el.addEventListener('change', function () {
          var patch = {}; patch[el.dataset.pref] = el.checked;
          e.setPrefs(patch);
          toast(el.dataset.pref + (el.checked ? ' on' : ' off'));
        });
      });
      prefsHost.dataset.wired = '1';
    }
    var hd = document.getElementById('chat-health');
    if (hd) hd.textContent = JSON.stringify(e.health(), null, 1);
  }

  function prefBox(k, label, on) {
    return '<label><input type="checkbox" data-pref="' + k + '"' + (on ? ' checked' : '') + '> ' + esc(label) + '</label>';
  }

  // ── PHASE O: RECORD AND SEND VOICE/VIDEO MESSAGES ──────────────────
  // spec/PHASEMAP-v4.md. Recorded, not live -- async is the point.
  // Real time limits, stated before recording starts (this button's
  // own title already said so): 2 min voice, 1 min video -- video is
  // far larger per second, and the existing 6MB cap (MAX_MEDIA_BYTES,
  // shared with photo/video uploads) is the real, hard backstop either
  // way, checked again after recording regardless of the time limit.
  var RECORD_LIMITS = { voice: 120, video: 60 };
  var _recorder = null, _recordChunks = [], _recordKind = null, _recordStream = null;
  var _recordTimerInterval = null, _recordSeconds = 0;
  var _recordRecognition = null, _recordTranscriptLines = [];
  var _recordedBlob = null, _recordedBlobUrl = null;

  function _fmtRecordTime(s) { return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }

  async function startMessageRecording(kind) {
    if (_recorder) return; // already recording -- real, simple guard, not a silent double-start
    var constraints = kind === 'video' ? { audio: true, video: true } : { audio: true };
    var stream;
    try { stream = await navigator.mediaDevices.getUserMedia(constraints); }
    catch (e) { toast('⚠ Could not access ' + (kind === 'video' ? 'camera/mic' : 'mic') + ': ' + e.message); return; }

    _recordStream = stream;
    _recordKind = kind;
    _recordChunks = [];
    _recordSeconds = 0;
    _recordTranscriptLines = [];

    var mimeType = kind === 'video'
      ? (MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus') ? 'video/webm;codecs=vp8,opus' : 'video/webm')
      : (MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm');
    _recorder = new MediaRecorder(stream, { mimeType: mimeType });
    _recorder.ondataavailable = function (e) { if (e.data && e.data.size > 0) _recordChunks.push(e.data); };
    _recorder.onstop = _onRecordStopped;
    _recorder.start(250);

    // Real, live, local-only transcript -- runs in parallel with the
    // real recording, on the same real mic stream, not a fabricated
    // post-hoc pass over the finished blob (Web Speech API has no way
    // to transcribe a pre-recorded file, only live input).
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SR) {
      try {
        var rec = new SR();
        rec.continuous = true; rec.interimResults = false;
        rec.lang = (navigator.language || 'en-US');
        rec.onresult = function (ev) {
          for (var i = ev.resultIndex; i < ev.results.length; i++) {
            if (ev.results[i].isFinal) _recordTranscriptLines.push(ev.results[i][0].transcript.trim());
          }
        };
        rec.onerror = function () {};
        rec.start();
        _recordRecognition = rec;
      } catch (e) { _recordRecognition = null; }
    }

    var panel = document.getElementById('chat-record-panel');
    var live = document.getElementById('chat-record-live');
    var review = document.getElementById('chat-record-review');
    if (panel) panel.hidden = false;
    if (live) live.hidden = false;
    if (review) review.hidden = true;
    var limitNote = document.getElementById('chat-record-limit-note');
    if (limitNote) limitNote.textContent = 'up to ' + _fmtRecordTime(RECORD_LIMITS[kind]);

    _recordTimerInterval = setInterval(function () {
      _recordSeconds++;
      var timerEl = document.getElementById('chat-record-timer');
      if (timerEl) timerEl.textContent = _fmtRecordTime(_recordSeconds);
      if (_recordSeconds >= RECORD_LIMITS[_recordKind]) stopMessageRecording(); // real auto-stop at the real, stated limit
    }, 1000);
  }

  function stopMessageRecording() {
    if (!_recorder) return;
    clearInterval(_recordTimerInterval);
    if (_recordRecognition) { try { _recordRecognition.stop(); } catch (e) {} _recordRecognition = null; }
    if (_recorder.state !== 'inactive') _recorder.stop();
    if (_recordStream) { _recordStream.getTracks().forEach(function (t) { t.stop(); }); _recordStream = null; }
  }

  function _onRecordStopped() {
    var mimeType = _recorder.mimeType;
    _recordedBlob = new Blob(_recordChunks, { type: mimeType });
    _recorder = null;
    if (_recordedBlobUrl) URL.revokeObjectURL(_recordedBlobUrl);
    _recordedBlobUrl = URL.createObjectURL(_recordedBlob);

    var live = document.getElementById('chat-record-live');
    var review = document.getElementById('chat-record-review');
    if (live) live.hidden = true;
    if (review) review.hidden = false;

    var videoPrev = document.getElementById('chat-record-video-preview');
    var audioPrev = document.getElementById('chat-record-audio-preview');
    if (_recordKind === 'video') {
      if (videoPrev) { videoPrev.hidden = false; videoPrev.src = _recordedBlobUrl; }
      if (audioPrev) audioPrev.hidden = true;
    } else {
      if (audioPrev) { audioPrev.hidden = false; audioPrev.src = _recordedBlobUrl; }
      if (videoPrev) videoPrev.hidden = true;
    }

    var transcriptPreview = document.getElementById('chat-record-transcript-preview');
    var transcriptCheck = document.getElementById('chat-record-transcript-check');
    var fullTranscript = _recordTranscriptLines.join(' ').trim();
    if (transcriptCheck) {
      transcriptCheck.disabled = !fullTranscript; // real, honest state -- nothing to include if nothing was heard
      transcriptCheck.checked = false; // never pre-checked -- "never required" means never defaulted on either
    }
    if (transcriptPreview) {
      transcriptPreview.hidden = !fullTranscript;
      transcriptPreview.textContent = fullTranscript ? '"' + fullTranscript.slice(0, 200) + (fullTranscript.length > 200 ? '…' : '') + '"' : '';
    }
  }

  function discardRecording() {
    if (_recordedBlobUrl) { URL.revokeObjectURL(_recordedBlobUrl); _recordedBlobUrl = null; }
    _recordedBlob = null;
    _recordTranscriptLines = [];
    var panel = document.getElementById('chat-record-panel');
    if (panel) panel.hidden = true;
  }

  async function sendRecordedMessage() {
    if (!_recordedBlob) return;
    if (_recordedBlob.size > (window.MAX_MEDIA_BYTES || 6 * 1024 * 1024)) {
      toast('⚠ Recording too large to send — try a shorter one');
      return;
    }
    var transcriptCheck = document.getElementById('chat-record-transcript-check');
    var includeTranscript = transcriptCheck && transcriptCheck.checked;
    var transcript = includeTranscript ? _recordTranscriptLines.join(' ').trim() : null;
    var kind = _recordKind;
    var blob = _recordedBlob;
    discardRecording();
    if (typeof window.sendRecordedChatMessage === 'function') {
      await window.sendRecordedChatMessage(blob, kind, transcript);
    }
  }

  function wirePage() {
    var e; try { e = engine(); } catch (err) { return; }
    var input = document.getElementById('chat-input');
    var sheet = document.getElementById('chat-attach-sheet');
    var pending = null;

    function doSend() {
      var text = input ? input.value : '';
      if (!text.trim() && !pending) return;
      try { e.send(text, pending); } catch (err) { toast(err.message); return; }
      if (input) { input.value = ''; input.style.height = 'auto'; }
      pending = null;
      if (sheet) sheet.hidden = true;
      renderChatTab();
    }

    var send = document.getElementById('chat-send');
    if (send) send.addEventListener('click', doSend);
    if (input) {
      input.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); doSend(); }
      });
      input.addEventListener('input', function () {
        input.style.height = 'auto';
        input.style.height = Math.min(input.scrollHeight, 150) + 'px';
        e.setTyping(!!input.value);
      });
    }
    var add = document.getElementById('chat-add');
    if (add && sheet) {
      add.addEventListener('click', function () {
        sheet.hidden = !sheet.hidden;
        if (!sheet.hidden) attachSheet(sheet, function (att) {
          pending = att; sheet.hidden = true;
          if (input) { input.placeholder = 'attached: ' + att.label + ' — add a word if you want'; input.focus(); }
        });
      });
    }
    // Real image/video sending -- separate from the attach-sheet above
    // (that one references content already on both sides; this one
    // sends real bytes -- see sendMediaMessage()'s own header for why
    // they're genuinely different things, not two UIs for one feature).
    var mediaBtn = document.getElementById('chat-media-btn');
    var mediaInput = document.getElementById('chat-media-input');
    if (mediaBtn && mediaInput) {
      mediaBtn.addEventListener('click', function () { mediaInput.click(); });
      mediaInput.addEventListener('change', function () {
        var file = mediaInput.files && mediaInput.files[0];
        mediaInput.value = ''; // real reset -- selecting the SAME file twice in a row must still fire 'change'
        if (!file) return;
        if (typeof window.sendMediaMessage !== 'function') { toast('Media sending not available'); return; }
        var caption = input ? input.value.trim() : '';
        window.sendMediaMessage(file, caption).then(function (sent) {
          if (sent && input) input.value = '';
        });
      });
    }

    // Phase O: record and send voice/video messages.
    var recordVoiceBtn = document.getElementById('chat-record-voice-btn');
    var recordVideoBtn = document.getElementById('chat-record-video-btn');
    if (recordVoiceBtn) recordVoiceBtn.addEventListener('click', function () { startMessageRecording('voice'); });
    if (recordVideoBtn) recordVideoBtn.addEventListener('click', function () { startMessageRecording('video'); });
    var recordStopBtn = document.getElementById('chat-record-stop');
    if (recordStopBtn) recordStopBtn.addEventListener('click', stopMessageRecording);
    var recordSendBtn = document.getElementById('chat-record-send');
    if (recordSendBtn) recordSendBtn.addEventListener('click', sendRecordedMessage);
    var recordAgainBtn = document.getElementById('chat-record-again');
    if (recordAgainBtn) recordAgainBtn.addEventListener('click', function () {
      var kind = _recordKind; discardRecording(); if (kind) startMessageRecording(kind);
    });
    var recordDiscardBtn = document.getElementById('chat-record-discard');
    if (recordDiscardBtn) recordDiscardBtn.addEventListener('click', discardRecording);

    // Real, direct request: separate phone and video-call icons, not one
    // generic button. Both use the same real setCallType()+startCall()
    // path the Call tab's own buttons use -- not a new call mechanism,
    // just a second, faster door into the same real one.
    var callAudio = document.getElementById('chat-call-audio');
    if (callAudio) callAudio.addEventListener('click', function () {
      if (typeof setCallType === 'function') setCallType('audio');
      if (typeof window.switchTab === 'function') switchTab('call');
      if (typeof startCall === 'function') startCall();
    });
    var callVideo = document.getElementById('chat-call-video');
    if (callVideo) callVideo.addEventListener('click', function () {
      if (typeof setCallType === 'function') setCallType('video');
      if (typeof window.switchTab === 'function') switchTab('call');
      if (typeof startCall === 'function') startCall();
    });
    var emojiBtn = document.getElementById('chat-emoji-btn');
    var emojiSheet = document.getElementById('chat-emoji-sheet');
    if (emojiBtn && emojiSheet) emojiBtn.addEventListener('click', function () {
      emojiSheet.hidden = !emojiSheet.hidden;
      if (!emojiSheet.hidden && typeof renderExpressionPicker === 'function') {
        renderExpressionPicker('chat-emoji-sheet', { setFeeling: false });
      }
    });
    var sbar = document.getElementById('chat-search');
    var stog = document.getElementById('chat-search-toggle');
    if (stog && sbar) {
      stog.addEventListener('click', function () { sbar.hidden = !sbar.hidden; if (!sbar.hidden) sbar.focus(); });
      sbar.addEventListener('input', renderChatTab);
    }
    e.on('message', renderChatTab);
    e.on('typing', renderChatTab);
    e.on('receipt', renderChatTab);
  }

  /* ── popup composer. Same engine, everywhere in the app. ──────────── */

  function mountPopup() {
    if (document.getElementById('chat-pop-btn')) return;
    var e; try { e = engine(); } catch (err) { return; }

    var btn = document.createElement('button');
    btn.id = 'chat-pop-btn';
    btn.className = 'chat-pop-btn';
    btn.innerHTML = '✎<span class="pop-unread" id="pop-unread" hidden></span>';
    document.body.appendChild(btn);

    var pop = null;
    btn.addEventListener('click', function () {
      if (pop) { pop.remove(); pop = null; return; }
      pop = document.createElement('div');
      pop.className = 'chat-pop';
      pop.innerHTML =
        '<div class="chat-pop-head">' +
          '<span class="cp-name">' + esc(partnerName()) + '</span>' +
          '<span class="cp-acts">' +
            '<button class="chat-icon" id="cp-open" title="Open full chat">⤢</button>' +
            '<button class="chat-icon" id="cp-call" title="Call">◍</button>' +
          '</span>' +
        '</div>' +
        '<div class="chat-pop-flow" id="cp-flow"></div>' +
        '<div class="chat-pop-sheet" id="cp-sheet" hidden></div>' +
        '<div class="chat-pop-compose">' +
          '<button class="chat-icon chat-add" id="cp-add">+</button>' +
          '<textarea id="cp-input" rows="1" placeholder="say it however it comes out"></textarea>' +
          '<button class="chat-icon chat-send" id="cp-send">→</button>' +
        '</div>';
      document.body.appendChild(pop);

      var flow = pop.querySelector('#cp-flow');
      var input = pop.querySelector('#cp-input');
      var sheet = pop.querySelector('#cp-sheet');
      var pending = null;
      renderFlow(flow, e.thread(60), true);
      e.thread().forEach(function (m) { if (!m.mine && !m.read) e.markRead(m.id); });
      refreshBadge();

      function popSend() {
        if (!input.value.trim() && !pending) return;
        try { e.send(input.value, pending); } catch (err) { toast(err.message); return; }
        input.value = ''; pending = null; sheet.hidden = true;
        renderFlow(flow, e.thread(60), true);
      }
      pop.querySelector('#cp-send').addEventListener('click', popSend);
      input.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); popSend(); }
      });
      input.addEventListener('input', function () { e.setTyping(!!input.value); });
      pop.querySelector('#cp-add').addEventListener('click', function () {
        sheet.hidden = !sheet.hidden;
        if (!sheet.hidden) attachSheet(sheet, function (att) {
          pending = att; sheet.hidden = true;
          input.placeholder = 'attached: ' + att.label; input.focus();
        });
      });
      pop.querySelector('#cp-call').addEventListener('click', function () {
        if (typeof window.switchTab === 'function') switchTab('call');
      });
      pop.querySelector('#cp-open').addEventListener('click', function () {
        if (typeof window.switchTab === 'function') switchTab('chat');
        pop.remove(); pop = null;
      });
    });

    function refreshBadge() {
      var b = document.getElementById('pop-unread');
      if (!b) return;
      var n = e.unreadCount();
      b.textContent = n > 99 ? '99+' : n;
      b.hidden = n === 0;
    }
    e.on('message', function () {
      refreshBadge();
      var f = document.getElementById('cp-flow');
      if (f) renderFlow(f, e.thread(60), true);
    });
    refreshBadge();
  }

  /* ── shared cursor. Opt-in on BOTH sides, rendered as presence. ───── */

  function mountCursorSharing() {
    var e; try { e = engine(); } catch (err) { return; }
    document.addEventListener('mousemove', function (ev) {
      if (!e.prefs().shareCursor) return;
      e.sendCursor(ev.clientX / window.innerWidth, ev.clientY / window.innerHeight,
                   window.S && S.tab ? S.tab : null);
    }, { passive: true });

    var ghost = null;
    e.on('cursor', function (c) {
      if (!c) return;
      if (!ghost) {
        ghost = document.createElement('div');
        ghost.className = 'eravos-remote-cursor';
        ghost.dataset.who = partnerName();
        document.body.appendChild(ghost);
      }
      ghost.style.transform = 'translate(' + (c.x * window.innerWidth) + 'px,' + (c.y * window.innerHeight) + 'px)';
    });
    setInterval(function () {
      if (ghost && !e.remote().cursor) { ghost.remove(); ghost = null; }   // stale, so it goes
    }, 2000);
  }

  window.renderChatTab = renderChatTab;
  window.EravosTabInitRenderers = window.EravosTabInitRenderers || {};
  window.EravosTabInitRenderers.chat = function () { renderChatTab(); wirePage(); };

  window.addEventListener('eravos:ready', function () { mountPopup(); mountCursorSharing(); });
  if (document.readyState !== 'loading') { mountPopup(); mountCursorSharing(); }
  else document.addEventListener('DOMContentLoaded', function () { mountPopup(); mountCursorSharing(); });
})();
