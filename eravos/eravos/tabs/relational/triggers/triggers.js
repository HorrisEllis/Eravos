// eravos tab: triggers · category: relational
// DB, S, emitSync, showToast, _userKey, _triggerMap/_triggerMapSet/
// _partnerTriggerMap, showTriggeredOverlay remain shared kernel
// globals/functions — this file is a consumer of them, not a copy
// (§5.14). The receiving side (showTriggeredOverlay, the sync gates)
// lives in shared/eravos-kernel.js — cross-cutting, since a
// TriggeredSignal has to land regardless of whether this tab is open,
// same reasoning as Urgent poke. Everything here is only reachable
// from this tab's own UI: the map editor and the hold-button itself.

// ── Trigger Map (personal) ──────────────────────────────────────────
function renderTriggerMap() {
  const el = document.getElementById('trigger-map-list');
  if (!el) return;
  const list = _triggerMap();
  if (!list.length) {
    el.innerHTML = '<p class="small italic" style="color:var(--dim)">No entries yet. Add one below — your own words, in your own time.</p>';
    return;
  }
  el.innerHTML = list.map(e => `
    <div class="trigger-entry-card">
      <div class="flex jb ac" style="margin-bottom:8px">
        <div style="font-weight:600;font-size:.95rem">${e.label}</div>
        <label class="small" style="display:flex;align-items:center;gap:6px;cursor:pointer">
          <input type="checkbox" ${e.shared ? 'checked' : ''} onchange="toggleShareTriggerEntry('${e.id}', this.checked)">
          Share with partner
        </label>
      </div>
      ${e.body_signs && e.body_signs.length ? `<div class="small" style="color:var(--dim);margin-bottom:6px">Body signs: ${e.body_signs.join(', ')}</div>` : ''}
      ${e.how_to_hold_me ? `<div style="font-size:.88rem;line-height:1.6;margin-bottom:6px"><span style="color:var(--teal)">How to hold me:</span> ${e.how_to_hold_me}</div>` : ''}
      ${e.what_not_to_do ? `<div class="small" style="color:var(--rose);margin-bottom:6px">Avoid: ${e.what_not_to_do}</div>` : ''}
      ${e.self_soothing_steps && e.self_soothing_steps.length ? `<div class="small" style="color:var(--dim)">For myself: ${e.self_soothing_steps.join(', ')}</div>` : ''}
      <div class="flex gap8 mt10">
        <button class="btn g" style="font-size:.72rem;padding:3px 9px" onclick="editTriggerEntry('${e.id}')">✎ Edit</button>
        <button class="btn g" style="font-size:.72rem;padding:3px 9px;color:var(--rose)" onclick="deleteTriggerEntry('${e.id}')">✕ Delete</button>
      </div>
    </div>`).join('');
}

function _clearTriggerForm() {
  ['trigger-label','trigger-body-signs','trigger-how-to-hold','trigger-what-not','trigger-self-soothing'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const editingId = document.getElementById('trigger-form');
  if (editingId) editingId.removeAttribute('data-editing-id');
}

function editTriggerEntry(id) {
  const e = _triggerMap().find(x => x.id === id);
  if (!e) return;
  document.getElementById('trigger-label').value = e.label || '';
  document.getElementById('trigger-body-signs').value = (e.body_signs || []).join(', ');
  document.getElementById('trigger-how-to-hold').value = e.how_to_hold_me || '';
  document.getElementById('trigger-what-not').value = e.what_not_to_do || '';
  document.getElementById('trigger-self-soothing').value = (e.self_soothing_steps || []).join(', ');
  document.getElementById('trigger-form').setAttribute('data-editing-id', id);
}

function saveTriggerEntry() {
  const label = document.getElementById('trigger-label')?.value.trim();
  if (!label) { showToast('⚠ Give it a name first'); return; }
  const editingId = document.getElementById('trigger-form')?.getAttribute('data-editing-id');
  const list = _triggerMap();
  const existing = editingId ? list.find(e => e.id === editingId) : null;

  const entry = {
    id: existing ? existing.id : 'trig_' + Date.now(),
    user_id: S.user?.name || 'me',
    label,
    body_signs: (document.getElementById('trigger-body-signs')?.value || '').split(',').map(s => s.trim()).filter(Boolean),
    how_to_hold_me: document.getElementById('trigger-how-to-hold')?.value.trim() || '',
    what_not_to_do: document.getElementById('trigger-what-not')?.value.trim() || null,
    self_soothing_steps: (document.getElementById('trigger-self-soothing')?.value || '').split(',').map(s => s.trim()).filter(Boolean),
    shared: existing ? existing.shared : false,
    created_ts: existing ? existing.created_ts : Date.now(),
    updated_ts: Date.now(),
  };

  const newList = existing ? list.map(e => e.id === entry.id ? entry : e) : list.concat([entry]);
  _triggerMapSet(newList);

  // If this entry is already shared, push the update so the partner's
  // cached view doesn't go stale.
  if (entry.shared) emitSync('trigger:shared_entry', { entry }, { queueOnFail: false });

  _clearTriggerForm();
  renderTriggerMap();
  populateTriggerQuickSelect();
  showToast('✓ Saved');
  if (typeof _latticeRefreshIfVisible === 'function') _latticeRefreshIfVisible();
}

function deleteTriggerEntry(id) {
  const list = _triggerMap();
  const entry = list.find(e => e.id === id);
  _triggerMapSet(list.filter(e => e.id !== id));
  if (entry && entry.shared) emitSync('trigger:unshare', { id }, { queueOnFail: false });
  renderTriggerMap();
  populateTriggerQuickSelect();
  showToast('Deleted');
}

function toggleShareTriggerEntry(id, shared) {
  const list = _triggerMap();
  const entry = list.find(e => e.id === id);
  if (!entry) return;
  entry.shared = shared;
  entry.updated_ts = Date.now();
  _triggerMapSet(list);
  if (shared) {
    emitSync('trigger:shared_entry', { entry }, { queueOnFail: false });
    showToast('💗 Shared — visible to your partner now');
  } else {
    emitSync('trigger:unshare', { id }, { queueOnFail: false });
    showToast('Unshared');
  }
}

// ── Partner's shared trigger map (read-only) ────────────────────────
function renderPartnerTriggerMap() {
  const el = document.getElementById('partner-trigger-map-list');
  if (!el) return;
  const list = _partnerTriggerMap();
  if (!list.length) {
    el.innerHTML = '<p class="small italic" style="color:var(--dim)">Nothing shared yet — this fills in as your partner marks entries to share.</p>';
    return;
  }
  el.innerHTML = list.map(e => `
    <div class="trigger-entry-card partner">
      <div style="font-weight:600;font-size:.95rem;margin-bottom:6px">${e.label}</div>
      ${e.body_signs && e.body_signs.length ? `<div class="small" style="color:var(--dim);margin-bottom:6px">Body signs: ${e.body_signs.join(', ')}</div>` : ''}
      ${e.how_to_hold_me ? `<div style="font-size:.88rem;line-height:1.6;margin-bottom:6px"><span style="color:var(--teal)">How to hold them:</span> ${e.how_to_hold_me}</div>` : ''}
      ${e.what_not_to_do ? `<div class="small" style="color:var(--rose)">Avoid: ${e.what_not_to_do}</div>` : ''}
    </div>`).join('');
}

// ── Triggered hold-button ────────────────────────────────────────────
// Hold ~1.2s to activate (anti-accidental-fire, same principle as
// Urgent poke's 10s dismiss-lock, inverted: hold-to-send instead of
// hold-to-acknowledge). Release early cancels cleanly.
const TRIGGER_HOLD_MS = 1200;
let _triggerHoldTimer = null;
let _triggerHoldStart = 0;

function triggerHoldStart(e) {
  if (e && e.type === 'touchstart') e.preventDefault();
  const btn = document.getElementById('triggered-hold-btn');
  const fill = document.getElementById('triggered-hold-fill');
  _triggerHoldStart = Date.now();
  if (btn) btn.classList.add('holding');
  if (fill) fill.style.transition = `width ${TRIGGER_HOLD_MS}ms linear`, fill.style.width = '100%';
  _triggerHoldTimer = setTimeout(() => {
    triggerHoldComplete();
  }, TRIGGER_HOLD_MS);
}

function triggerHoldCancel() {
  const btn = document.getElementById('triggered-hold-btn');
  const fill = document.getElementById('triggered-hold-fill');
  if (_triggerHoldTimer) { clearTimeout(_triggerHoldTimer); _triggerHoldTimer = null; }
  if (btn) btn.classList.remove('holding');
  if (fill) { fill.style.transition = 'width .15s ease'; fill.style.width = '0%'; }
}

function triggerHoldComplete() {
  const holdMs = Date.now() - _triggerHoldStart;
  triggerHoldCancel();
  openTriggerQuickSelect(holdMs);
}

function populateTriggerQuickSelect() {
  const el = document.getElementById('trigger-quick-select-list');
  if (!el) return;
  const list = _triggerMap();
  el.innerHTML = list.map(e => `<button class="btn g fw" style="text-align:left;margin-bottom:6px" onclick="sendTriggeredSignal(window._pendingHoldMs, '${e.id}')">${e.label}</button>`).join('');
}

function openTriggerQuickSelect(holdMs) {
  window._pendingHoldMs = holdMs;
  populateTriggerQuickSelect();
  const modal = document.getElementById('trigger-quick-select-modal');
  if (modal) modal.classList.add('open');
}

function closeTriggerQuickSelect() {
  const modal = document.getElementById('trigger-quick-select-modal');
  if (modal) modal.classList.remove('open');
}

// Skipping the quick-select is valid — sending blank is fine per spec.
function sendTriggeredSignalBlank() {
  sendTriggeredSignal(window._pendingHoldMs || TRIGGER_HOLD_MS, null);
}

function sendTriggeredSignal(holdMs, linkedId) {
  closeTriggerQuickSelect();
  const sent = emitSync('triggered:signal', { hold_duration_ms: holdMs, linked_map_entry_id: linkedId || null }, { queueOnFail: false });
  showToast(sent ? '🌊 Signal sent' : '⚠ Partner not connected');
  window._lastTriggeredSignal = { ts: Date.now(), linkedId, holdMs };
  const logCard = document.getElementById('trigger-log-prompt');
  if (logCard) logCard.style.display = 'block';
}

function logLastTriggeredMoment(note) {
  const sig = window._lastTriggeredSignal;
  if (!sig) return;
  const log = DB.get(_userKey('trigger_log'), []);
  log.unshift({ ...sig, note: note || '', loggedAt: Date.now() });
  DB.set(_userKey('trigger_log'), log.slice(0, 100));
  const logCard = document.getElementById('trigger-log-prompt');
  if (logCard) logCard.style.display = 'none';
  showToast('✓ Logged');
}
