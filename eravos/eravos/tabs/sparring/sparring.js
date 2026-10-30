// eravos tab: sparring · category: relational
// DB, S, emitSync, showToast, _sparMatch/_sparMatchSet, and the match
// state machine (gates, watchdog, respondToSparInvite,
// startSparMatchClock, updateSparSetup, archival) all live in
// shared/eravos-kernel.js — cross-cutting, since an invite or an
// incoming turn has to be answerable/land even if this tab isn't
// mounted. This file owns only what's reachable solely from this tab's
// own UI: proposing a match, sending a turn, proposing a rule, editing
// setup fields, and rendering whatever _sparMatch() currently holds.
//
// Rebuilt to be just the chat window — no solo free-write mode, no
// Oracle integration — per direct request. The floating "Invite to
// Spar" button (persistent shell, index.html) is the entry point now;
// this tab is where the conversation actually happens once a match is
// accepted.

function proposeDuoSparMatch() {
  const turnSeconds = parseInt(document.getElementById('spar-duo-turn-secs')?.value) || 10;
  const matchSeconds = parseInt(document.getElementById('spar-duo-match-secs')?.value) || 300;
  const matchId = 'sparmatch_' + Date.now();
  const sent = emitSync('spar:match_invite', { matchId, turnSeconds, matchSeconds }, { queueOnFail: false });
  if (!sent) { showToast('⚠ Partner not connected'); return; }
  _sparMatchSet({ id: matchId, status: 'inviting', turnSeconds, matchSeconds, proposedBy: S.user?.name });
  renderSparMatch();
  showToast('⚔ Match proposed — waiting for accept');
}

function sendSparTurn(auto) {
  const match = _sparMatch();
  if (!match || match.status !== 'active') return;
  if (match.currentTurnBy !== S.user?.name) { if (!auto) showToast('⚠ Not your turn'); return; }
  const el = document.getElementById('spar-turn-input');
  const text = (el?.value || '').trim();
  emitSync('spar:turn', { matchId: match.id, turnNum: match.currentTurnNum, text, autoSent: !!auto }, { queueOnFail: false });
  _sparApplyTurn(match, { turnNum: match.currentTurnNum, from: S.user?.name, text, ts: Date.now(), autoSent: !!auto });
  if (el) el.value = '';
  renderSparMatch();
}

function proposeSparRule(text) {
  const el = document.getElementById('spar-rule-input');
  text = (text !== undefined ? text : el?.value || '').trim();
  if (!text) return;
  const match = _sparMatch();
  if (!match || (match.status !== 'active' && match.status !== 'setup')) { showToast('⚠ No match in progress'); return; }
  const norm = text.toLowerCase();
  if ((match.proposedRuleTextsEver || []).includes(norm)) {
    showToast('⚠ Already proposed this rule this match — no re-asking');
    return;
  }
  const ruleId = 'rule_' + Date.now();
  const expiresAt = Date.now() + 30000;
  match.pendingProposals = (match.pendingProposals || []).concat([{ id: ruleId, text, proposedBy: S.user?.name, expiresAt }]);
  match.proposedRuleTextsEver = (match.proposedRuleTextsEver || []).concat([norm]);
  _sparMatchSet(match);
  emitSync('spar:rule_propose', { matchId: match.id, ruleId, text, expiresAt }, { queueOnFail: false });
  if (el) el.value = '';
  renderSparMatch();
  showToast('📜 Rule proposed — waiting for accept');
}

function saveSparSetupFields() {
  const reason = document.getElementById('spar-setup-reason')?.value.trim() || null;
  const boundaries = document.getElementById('spar-setup-boundaries')?.value.trim() || null;
  updateSparSetup(reason, boundaries);
}

function cancelDuoSparMatch() {
  const match = _sparMatch();
  if (match) emitSync('spar:match_decline', { matchId: match.id }, { queueOnFail: false });
  _sparMatchSet(null);
  renderSparMatch();
}

function renderSparMatch() {
  const el = document.getElementById('spar-duo-match-body');
  if (!el) return; // tab not mounted — nothing to draw
  const match = _sparMatch();

  // Connection hint — only shown when it's actually relevant (about to
  // propose a match), not as a permanent status card. Same channel-open
  // check sendP2P() itself uses, so this can't say "connected" when a
  // send would actually fail.
  const hint = document.getElementById('spar-duo-connection-hint');
  if (hint) {
    const channelOpen = !!((window.MESH?.connected && window.meshSend) || (typeof peerConn !== 'undefined' && peerConn && peerConn.open));
    const showHint = !channelOpen && (!match || match.status === 'ended');
    hint.style.display = showHint ? 'block' : 'none';
  }

  if (!match || match.status === 'ended') {
    el.innerHTML = `
      ${match && match.status === 'ended' ? `
        <div class="small" style="color:var(--dim);margin-bottom:14px;padding:10px;border:1px solid var(--border2);border-radius:10px">
          Last match: ${match.turns?.length || 0} turns exchanged${match.rules?.length ? `, ${match.rules.length} rule(s) in play` : ''}.
        </div>` : ''}
      <label class="fl">Per-turn time (seconds)</label>
      <input type="number" id="spar-duo-turn-secs" value="10" min="3" max="120" style="margin-bottom:10px;max-width:100px">
      <label class="fl">Match length (seconds)</label>
      <input type="number" id="spar-duo-match-secs" value="300" min="30" max="3600" style="margin-bottom:12px;max-width:100px">
      <button class="btn p fw" onclick="proposeDuoSparMatch()">⚔ Propose Duo Match</button>`;
    return;
  }

  if (match.status === 'inviting') {
    el.innerHTML = `
      <p class="small italic" style="color:var(--dim);margin-bottom:12px">
        ${match.proposedBy === S.user?.name ? 'Waiting for partner to accept…' : 'Match invite pending — check the popup.'}
      </p>
      <button class="btn g" onclick="cancelDuoSparMatch()">✕ Cancel</button>`;
    return;
  }

  if (match.status === 'setup') {
    const rulesHtml = (match.rules || []).length
      ? (match.rules || []).map(r => `<span class="spar-rule-chip">📜 ${r.text}</span>`).join('')
      : '<span class="small italic" style="color:var(--dim)">No rules yet.</span>';
    el.innerHTML = `
      <div class="small" style="color:var(--teal);margin-bottom:12px">⚔ Set it up together, then start whenever you're both ready.</div>
      <label class="fl">What's this session about? (optional)</label>
      <textarea id="spar-setup-reason" rows="2" placeholder="A reason, a topic, or leave it open..." onblur="saveSparSetupFields()">${match.reason || ''}</textarea>
      <label class="fl mt10">Any boundaries? (optional)</label>
      <textarea id="spar-setup-boundaries" rows="2" placeholder="Anything to keep in mind or off the table..." onblur="saveSparSetupFields()">${match.boundaries || ''}</textarea>
      <div style="border-top:1px solid var(--border2);padding-top:10px;margin-top:12px">
        <div class="card-title" style="font-size:.68rem;margin-bottom:8px">📜 RULES</div>
        <div class="flex gap6 wrap" style="margin-bottom:10px">${rulesHtml}</div>
        <div class="flex gap8">
          <input type="text" id="spar-rule-input" placeholder="Propose a rule...">
          <button class="btn g" onclick="proposeSparRule()">Propose</button>
        </div>
      </div>
      <button class="btn p fw mt14" onclick="startSparMatchClock()">▶ Start Sparring</button>
      <button class="btn g fw mt8" onclick="cancelDuoSparMatch()">✕ Cancel</button>`;
    return;
  }

  // Active match: turn feed + whose-turn/compose + rules + setup recap
  const myTurn = match.currentTurnBy === S.user?.name;
  const secsLeft = Math.max(0, Math.ceil((match.currentTurnDeadline - Date.now()) / 1000));
  const matchSecsLeft = Math.max(0, Math.ceil((match.endsAt - Date.now()) / 1000));

  const feed = (match.turns || []).map(t => `
    <div class="spar-turn-bubble ${t.from === S.user?.name ? 'mine' : 'theirs'}">
      <div class="spar-turn-meta">${t.from}${t.autoSent ? ' · auto-passed' : ''}</div>
      <div class="spar-turn-text">${t.text ? t.text : '<em style="color:var(--dim)">(no response)</em>'}</div>
    </div>`).join('') || '<div class="small italic" style="color:var(--dim)">No turns yet — first move is coming.</div>';

  const rulesHtml = (match.rules || []).length
    ? (match.rules || []).map(r => `<span class="spar-rule-chip">📜 ${r.text}</span>`).join('')
    : '<span class="small italic" style="color:var(--dim)">No rules yet.</span>';

  el.innerHTML = `
    ${(match.reason || match.boundaries) ? `
      <div class="small" style="color:var(--dim);margin-bottom:10px;padding:8px 10px;border:1px solid var(--border2);border-radius:8px">
        ${match.reason ? `<div>💬 ${match.reason}</div>` : ''}
        ${match.boundaries ? `<div style="margin-top:4px">🛡 ${match.boundaries}</div>` : ''}
      </div>` : ''}
    <div class="flex jb ac" style="margin-bottom:10px">
      <span class="small" style="color:var(--dim)">Match time left</span>
      <span class="small" style="font-family:var(--fm);color:var(--amber)">${Math.floor(matchSecsLeft/60)}:${(matchSecsLeft%60).toString().padStart(2,'0')}</span>
    </div>
    <div id="spar-turn-feed" class="fc gap8" style="max-height:280px;overflow-y:auto;margin-bottom:14px">${feed}</div>
    ${myTurn ? `
      <div style="border:1px solid var(--fire);border-radius:10px;padding:10px;margin-bottom:12px">
        <div class="flex jb ac" style="margin-bottom:8px">
          <span class="small" style="color:var(--fire)">⚔ Your turn</span>
          <span class="small" style="font-family:var(--fm);color:${secsLeft<=3?'var(--rose)':'var(--amber)'}">${secsLeft}s</span>
        </div>
        <textarea id="spar-turn-input" rows="2" placeholder="Throw your words — hit send before time's up..."></textarea>
        <button class="btn p fw" onclick="sendSparTurn(false)">➤ Send</button>
      </div>` : `
      <div class="small italic" style="color:var(--dim);text-align:center;padding:10px;margin-bottom:12px">Waiting for ${match.currentTurnBy}…</div>`}
    <div style="border-top:1px solid var(--border2);padding-top:10px">
      <div class="card-title" style="font-size:.68rem;margin-bottom:8px">📜 RULES</div>
      <div class="flex gap6 wrap" style="margin-bottom:10px">${rulesHtml}</div>
      <div class="flex gap8">
        <input type="text" id="spar-rule-input" placeholder="Propose a rule...">
        <button class="btn g" onclick="proposeSparRule()">Propose</button>
      </div>
    </div>`;
}

function renderSparHistory() {
  const list = document.getElementById('spar-history-list');
  if (!list) return;
  const history = DB.get('eravors_spar_history', []);
  if (!history.length) {
    list.innerHTML = '<div class="small italic text-center" style="padding:30px;color:var(--dim)">No spar sessions yet.</div>';
    return;
  }
  list.innerHTML = history.slice(0,20).map(m => `
    <div style="padding:14px;border:1px solid var(--border2);border-radius:10px;background:var(--glass)">
      <div style="display:flex;justify-content:space-between;margin-bottom:6px">
        <span style="font-family:var(--fm);font-size:.65rem;color:var(--fire);letter-spacing:.1em">${(m.players||[]).join(' & ')}</span>
        <span style="font-family:var(--fm);font-size:.6rem;color:var(--dim)">${new Date(m.endedAt).toLocaleDateString()}</span>
      </div>
      ${m.reason ? `<div style="font-style:italic;color:var(--dim);font-size:.82rem;margin-bottom:6px">"${m.reason}"</div>` : ''}
      <div class="small" style="color:var(--dim)">${m.turnCount} turns exchanged${m.rules?.length ? ` · ${m.rules.length} rule(s)` : ''}</div>
    </div>`).join('');
}

// Live-refresh the match view every second while active (countdown),
// independent of the cross-cutting watchdog in the kernel (which drives
// state; this just keeps the seconds-remaining display current while
// this tab happens to be open).
//
// renderSparMatch() rebuilds the whole panel via innerHTML, which means
// a fresh, empty <textarea id="spar-turn-input"> every single call —
// including this one, firing every second while someone's mid-turn.
// Real bug this caused: whatever you'd typed got wiped before you
// could send it, and since sendSparTurn() reads the textarea's live
// value at send time, an emptied box meant an effectively-empty turn
// went out even though the code correctly sent "whatever's in the
// textarea" — the textarea just wasn't holding what you'd actually
// typed anymore by the time you clicked Send. Fixed by carrying the
// value/cursor/focus across this specific re-render, not by touching
// sendSparTurn() at all, since that part was already correct.
// ── THE INPUT-CLEARING BUG, FIXED AT THE ROOT (§5.3) ─────────────────────
//
// Reproduced in isolation before touching anything (§1.1). Two defects, and
// the save/restore dance below was papering over the bigger one:
//
//   1. `if (savedValue)` — an EMPTY STRING IS FALSY. So whenever the field
//      was empty and focused, the restore block was skipped entirely and
//      focus was dropped. Once a second. On a phone that closes the keyboard
//      mid-sentence, which is exactly what "it clears the input" feels like.
//      Proven: tick('', true) -> { value:'', focused:FALSE }.
//
//   2. The real cause: it re-rendered a DOM subtree containing a FOCUSED
//      INPUT once per second, forever, whether or not anything had changed.
//      No amount of save/restore makes that safe — it drops in-flight IME
//      composition, resets scroll, and fights the on-screen keyboard.
//
// The fix is not a better restore. It is not re-rendering when nothing
// changed. A cheap signature of the match state is compared first, so the
// common case — a live match where nothing has happened this second — does
// no DOM work at all. The restore stays for the rare real re-render, with
// the falsy guard corrected.
//
// The handle lives on `window` rather than a module-scoped `let`: if this
// file is ever evaluated twice, a fresh `let` cannot clear the previous
// timer and you get two loops fighting over one input.
function _sparMatchSignature(match) {
  if (!match) return 'none';
  // Everything the rendered body actually depends on. If none of it moved,
  // the DOM cannot need rewriting.
  return [
    match.id, match.status, match.currentTurnNum, match.currentTurnBy,
    (match.turns || []).length,
    (match.pendingProposals || []).length,
    (match.rules || []).length,
    // the clock is the one thing that legitimately changes every tick
    Math.floor((match.turnDeadline || 0) / 1000),
  ].join('|');
}

if (typeof window !== 'undefined') {
  if (window._sparRenderTick) clearInterval(window._sparRenderTick);
  window._sparRenderTick = setInterval(() => {
    const el = document.getElementById('spar-duo-match-body');
    if (!el) return;
    const match = typeof _sparMatch === 'function' ? _sparMatch() : null;
    if (!match || match.status !== 'active') return;

    const sig = _sparMatchSignature(match);
    if (sig === window._sparLastSig) {
      // Nothing changed. Touch nothing. This is the case ~59 seconds out of
      // 60 during a real turn, and it was previously a full re-render.
      if (typeof _sparTickClockOnly === 'function') _sparTickClockOnly(match);
      return;
    }
    window._sparLastSig = sig;

    const input = document.getElementById('spar-turn-input');
    const hadFocus = !!(input && document.activeElement === input);
    const savedValue = input ? input.value : null;
    const savedStart = input ? input.selectionStart : null;
    const savedEnd = input ? input.selectionEnd : null;

    renderSparMatch();

    // `!== null`, not truthiness — an empty focused field must keep its focus.
    if (savedValue !== null) {
      const newInput = document.getElementById('spar-turn-input');
      if (newInput) {
        newInput.value = savedValue;
        if (hadFocus) {
          newInput.focus();
          if (savedStart != null) newInput.setSelectionRange(savedStart, savedEnd);
        }
      }
    }
  }, 1000);
}

/** Update only the clock text, without rewriting anything around the input. */
function _sparTickClockOnly(match) {
  const c = document.getElementById('spar-clock');
  if (!c || !match || !match.turnDeadline) return;
  const left = Math.max(0, Math.round((match.turnDeadline - Date.now()) / 1000));
  c.textContent = left + 's';
}
