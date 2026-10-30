// eravos tab: commitments · category: relational
// DB, S, emitSync, showToast remain shared kernel globals — this file
// is a consumer of them, not a copy (§5.14). _commitments/_commitmentsSet
// and the commitment:created/commitment:status_changed sync gates live
// in shared/eravos-kernel.js, cross-cutting — the storage has to stay
// correct regardless of whether this tab is mounted, since the future
// Relational Health view will read the same shared_commitments data
// from wherever it lives. This file owns only what's reachable solely
// from this tab's own UI: the create form and the status-change flow.

function createCommitment() {
  const text  = document.getElementById('commitment-text')?.value.trim();
  const level = document.getElementById('commitment-level')?.value || 'promise';
  const dueEl = document.getElementById('commitment-due');
  const due   = dueEl?.value ? new Date(dueEl.value).getTime() : null;
  const linkedEventId = document.getElementById('commitment-linked-event')?.value || null;

  if (!text) { showToast('⚠ Say what the commitment is first'); return; }

  const now = Date.now();
  const c = {
    id: 'commit_' + now,
    created_by: S.user?.name || 'me',
    created_ts: now,
    text,
    level,
    due,
    linked_planner_event_id: linkedEventId || null,
    status: 'active',
    status_history: [{ status: 'active', ts: now, note: null }],
    reflection: null,
  };

  const list = _commitments();
  list.unshift(c);
  _commitmentsSet(list);
  emitSync('commitment:created', { commitment: c });

  // Clear form
  ['commitment-text'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  if (dueEl) dueEl.value = '';

  renderCommitments();
  showToast('🤝 Commitment logged');
  if (typeof _latticeRefreshIfVisible === 'function') _latticeRefreshIfVisible();
}

// Status change requires a note (reflection) when moving to missed or
// renegotiated — not punitive, just honest: what got in the way, what
// changed. Kept status stays note-optional (nothing to explain about
// a promise that just... happened).
function changeCommitmentStatus(id, newStatus) {
  if (newStatus === 'missed' || newStatus === 'renegotiated') {
    openCommitmentReflectionForm(id, newStatus);
    return;
  }
  _applyCommitmentStatus(id, newStatus, null);
}

function openCommitmentReflectionForm(id, newStatus) {
  const el = document.getElementById('commitment-reflection-form-' + id);
  if (!el) return;
  el.style.display = 'block';
  el.innerHTML = `
    <label class="fl">${newStatus === 'missed' ? 'What got in the way?' : 'What changed?'}</label>
    <textarea id="commitment-reflection-${id}" rows="2" placeholder="Honest, not punitive — what happened, framed as us-vs-the-problem..."></textarea>
    <div class="flex gap8 mt8">
      <button class="btn p" style="font-size:.72rem" onclick="_applyCommitmentStatus('${id}', '${newStatus}', document.getElementById('commitment-reflection-${id}').value.trim())">Save</button>
      <button class="btn g" style="font-size:.72rem" onclick="document.getElementById('commitment-reflection-form-${id}').style.display='none'">Cancel</button>
    </div>`;
}

function _applyCommitmentStatus(id, newStatus, note) {
  const list = _commitments();
  const c = list.find(x => x.id === id);
  if (!c) return;
  c.status = newStatus;
  c.status_history = (c.status_history || []).concat([{ status: newStatus, ts: Date.now(), note: note || null }]);
  if (note) c.reflection = note;
  _commitmentsSet(list);
  emitSync('commitment:status_changed', { id, status: newStatus, status_history: c.status_history, reflection: c.reflection });
  renderCommitments();
  if (typeof renderRelationalHealthField === 'function') renderRelationalHealthField();
  showToast('✓ Updated');
}

function renderCommitments() {
  const el = document.getElementById('commitments-list');
  if (!el) return;
  const list = _commitments();
  if (!list.length) {
    el.innerHTML = '<p class="small italic" style="color:var(--dim)">No commitments logged yet.</p>';
    return;
  }

  const levelLabel = { pinky_promise: '🤙 Pinky promise', promise: '🤝 Promise', word: '📜 My word' };
  const statusOrder = ['active', 'kept', 'missed', 'renegotiated'];
  const statusColor = { active: 'var(--amber)', kept: 'var(--teal)', missed: 'var(--rose)', renegotiated: 'var(--violet)' };
  const grouped = statusOrder.map(s => ({ status: s, items: list.filter(c => c.status === s) })).filter(g => g.items.length);

  el.innerHTML = grouped.map(g => `
    <div class="commitment-group">
      <div class="commitment-group-title" style="color:${statusColor[g.status]}">${g.status.toUpperCase()} (${g.items.length})</div>
      ${g.items.map(c => `
        <div class="commitment-card">
          <div class="flex jb ac" style="margin-bottom:6px">
            <span class="small" style="color:var(--dim)">${levelLabel[c.level] || c.level}</span>
            <span class="small" style="color:var(--dim)">by ${c.created_by}</span>
          </div>
          <div style="font-size:.95rem;line-height:1.6;margin-bottom:8px">${c.text}</div>
          ${c.due ? `<div class="small" style="color:var(--dim);margin-bottom:6px">Due: ${new Date(c.due).toLocaleDateString()}</div>` : ''}
          ${c.reflection ? `<div class="small" style="color:var(--dim);font-style:italic;margin-bottom:8px">"${c.reflection}"</div>` : ''}
          <div class="commitment-history">
            ${(c.status_history || []).map(h => `<span class="commitment-history-entry">${h.status}${h.note ? ': ' + h.note.slice(0,30) : ''} · ${new Date(h.ts).toLocaleDateString()}</span>`).join('')}
          </div>
          ${c.status === 'active' ? `
            <div class="flex gap8 mt8 wrap">
              <button class="btn g" style="font-size:.72rem" onclick="changeCommitmentStatus('${c.id}', 'kept')">✓ Kept</button>
              <button class="btn g" style="font-size:.72rem" onclick="changeCommitmentStatus('${c.id}', 'missed')">Missed</button>
              <button class="btn g" style="font-size:.72rem" onclick="changeCommitmentStatus('${c.id}', 'renegotiated')">Renegotiate</button>
            </div>
            <div id="commitment-reflection-form-${c.id}" style="display:none;margin-top:10px"></div>` : ''}
        </div>`).join('')}
    </div>`).join('');
}

function populateCommitmentEventLink() {
  const el = document.getElementById('commitment-linked-event');
  if (!el) return;
  const events = DB.get('eravors_planner_events', []);
  el.innerHTML = '<option value="">No linked event</option>' +
    events.map(e => `<option value="${e.id}">${e.title}</option>`).join('');
}
