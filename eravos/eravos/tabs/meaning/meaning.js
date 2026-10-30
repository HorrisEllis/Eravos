// eravos tab: meaning · category: space
// DB, S, emitSync, showToast remain shared kernel globals — this file
// is a consumer of them, not a copy (§5.14). _meaningArchive/
// _meaningArchiveSet, the meaning:added sync gate, and the auto-surface
// prompt (openMeaningAddPrompt/confirmAddToMeaning/submitMeaningDecline)
// live in shared/eravos-kernel.js, cross-cutting — the prompt has to be
// answerable regardless of which tab is open when a message arrives.
// This file owns only what's reachable solely from this tab's own UI:
// the grid render, filtering, gratitude editing, and the upload flow.

let _meaningFilter = 'all';

function setMeaningFilter(type) {
  _meaningFilter = type;
  document.querySelectorAll('.meaning-filter-btn').forEach(b => b.classList.toggle('active', b.dataset.type === type));
  renderMeaningArchive();
}

function renderMeaningArchive() {
  const el = document.getElementById('meaning-grid');
  if (!el) return;
  const all = _meaningArchive();
  // Declined offers are kept as an honest record (never overwritable)
  // but don't show in the main grid — this is a curated collection of
  // what was actually kept, not a log of everything ever offered.
  const kept = all.filter(e => !e.received_response || e.received_response.added !== false);
  const list = _meaningFilter === 'all' ? kept : kept.filter(e => e.type === _meaningFilter);

  if (!list.length) {
    el.innerHTML = '<div class="small italic text-center" style="padding:40px;color:var(--dim)">Nothing archived yet.</div>';
    return;
  }

  const typeIcon = { photo:'📷', video:'🎥', art:'🎨', journal:'📔', love_note:'💌', message:'✉', poem:'📜' };
  const textTypes = ['journal', 'message', 'love_note', 'poem']; // types with no image/video to show — the archive's whole point is preserving the content, so these need their actual text visible, not just an icon
  // content_ref means different things depending on source, per the
  // schema's own "reference, don't duplicate" rule: for 'upload' it's
  // direct content (a data URL, or typed journal text); for anything
  // pulled from elsewhere (sent_message/sent_love_note) it's a foreign
  // key into eravors_inbox, and the actual text has to be looked up at
  // render time, not stored twice.
  function _resolveMeaningText(e) {
    if (e.source === 'upload') return e.content_ref;
    if (e.source === 'sent_message' || e.source === 'sent_love_note') {
      const msg = DB.get('eravors_inbox', []).find(m => m.id === e.content_ref);
      return msg ? msg.text : '(original message no longer in inbox)';
    }
    return e.content_ref;
  }
  el.innerHTML = list.map(e => `
    <div class="meaning-card">
      ${e.type === 'photo' && e.content_ref?.startsWith('data:image') ? `<img src="${e.content_ref}" class="meaning-card-img">` :
        e.type === 'video' && e.content_ref?.startsWith('data:video') ? `<video src="${e.content_ref}" class="meaning-card-img" controls></video>` :
        `<div class="meaning-card-icon">${typeIcon[e.type] || '✦'}</div>`}
      <div class="meaning-card-body">
        <div class="small" style="color:var(--dim);font-family:var(--fm);font-size:.6rem;letter-spacing:.1em">${e.type.toUpperCase().replace('_',' ')} · ${e.added_by} · ${new Date(e.ts).toLocaleDateString()}</div>
        ${textTypes.includes(e.type) ? `<div style="font-size:.88rem;margin-top:6px;line-height:1.5">${String(_resolveMeaningText(e) || '').slice(0, 200)}${String(_resolveMeaningText(e) || '').length > 200 ? '…' : ''}</div>` : ''}
        ${e.caption ? `<div style="font-size:.88rem;margin-top:6px">${e.caption}</div>` : ''}
        ${e.gratitude_note ? `<div class="small" style="color:var(--amber);margin-top:6px;font-style:italic">🙏 ${e.gratitude_note}</div>` : ''}
        <div class="flex gap8 mt8">
          <button class="btn g" style="font-size:.68rem;padding:3px 8px" onclick="editMeaningGratitude('${e.id}')">🙏 Gratitude</button>
          <button class="btn g" style="font-size:.68rem;padding:3px 8px;color:var(--rose)" onclick="deleteMeaningEntry('${e.id}')">✕</button>
        </div>
      </div>
    </div>`).join('');
}

function editMeaningGratitude(id) {
  const list = _meaningArchive();
  const entry = list.find(e => e.id === id);
  if (!entry) return;
  const note = prompt('What are you grateful for here?', entry.gratitude_note || '');
  if (note === null) return;
  entry.gratitude_note = note.trim() || null;
  _meaningArchiveSet(list);
  renderMeaningArchive();
}

function deleteMeaningEntry(id) {
  const list = _meaningArchive().filter(e => e.id !== id);
  _meaningArchiveSet(list);
  renderMeaningArchive();
}

// ── Upload (photo/video/art/journal) ────────────────────────────────
// Stored as data URLs in local storage — real size limits apply (this
// is a static, no-backend app, per the architecture's own shape); no
// hard cap enforced here, named as a known constraint rather than
// silently assumed unlimited.
function handleMeaningFileSelect(files) {
  [...files].forEach(file => {
    const reader = new FileReader();
    reader.onload = () => {
      const type = file.type.startsWith('image') ? 'photo' : file.type.startsWith('video') ? 'video' : 'art';
      const entry = {
        id: 'meaning_' + Date.now() + '_' + Math.random().toString(36).slice(2,7),
        added_by: S.user?.name || 'me',
        ts: Date.now(),
        type,
        source: 'upload',
        content_ref: reader.result,
        caption: null,
        gratitude_note: null,
        received_response: { added: true, decline_reason: null, rating: null },
      };
      const list = _meaningArchive();
      list.unshift(entry);
      _meaningArchiveSet(list);
      emitSync('meaning:added', { entry });
      renderMeaningArchive();
      showToast('💗 Added to archive');
    };
    reader.readAsDataURL(file);
  });
}

function addMeaningJournalEntry() {
  const text = document.getElementById('meaning-journal-text')?.value.trim();
  if (!text) { showToast('⚠ Write something first'); return; }
  const entry = {
    id: 'meaning_' + Date.now(),
    added_by: S.user?.name || 'me',
    ts: Date.now(),
    type: 'journal',
    source: 'upload',
    content_ref: text,
    caption: null,
    gratitude_note: null,
    received_response: { added: true, decline_reason: null, rating: null },
  };
  const list = _meaningArchive();
  list.unshift(entry);
  _meaningArchiveSet(list);
  emitSync('meaning:added', { entry });
  document.getElementById('meaning-journal-text').value = '';
  renderMeaningArchive();
  showToast('💗 Added to archive');
}

function _meaningDragOver(e) { e.preventDefault(); e.currentTarget.classList.add('drag-over'); }
function _meaningDragLeave(e) { e.currentTarget.classList.remove('drag-over'); }
function _meaningDrop(e) {
  e.preventDefault();
  e.currentTarget.classList.remove('drag-over');
  if (e.dataTransfer?.files?.length) handleMeaningFileSelect(e.dataTransfer.files);
}
