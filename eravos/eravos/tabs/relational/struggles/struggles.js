// eravos tab: struggles · category: relational
// DB, S, emitSync, showToast, _userKey, STRUGGLES_CHECKIN_MOODS remain
// shared kernel globals/functions — this file is a consumer of them,
// not a copy (§5.14). _struggles/_strugglesSet/_partnerStrugglesChecklist/
// _partnerStrugglesStory and the four sync gates live in
// shared/eravos-kernel.js, cross-cutting — the receiving side has to
// update regardless of which tab is open, same reasoning as Triggers.
//
// Never use the word "issues" anywhere in this file's copy — checked
// against every string before writing it.

const STRUGGLES_CHECKLIST_ITEMS = [
  { id: 'shutdown',    label: 'I shut down or go quiet when things feel like too much' },
  { id: 'ask_needs',   label: 'I find it hard to ask for what I need' },
  { id: 'defensive',   label: 'I can get defensive when I feel criticized' },
  { id: 'people_please', label: 'I sometimes go along with things instead of saying how I really feel' },
  { id: 'trust',       label: "I have a hard time trusting that people will stay" },
  { id: 'reassurance', label: "I get anxious when I don't hear back quickly" },
  { id: 'avoidant',    label: 'I can be avoidant when conflict comes up' },
  { id: 'overwhelm',   label: 'Big emotions can feel like too much to handle in the moment' },
  { id: 'numb',        label: 'I sometimes numb out or disconnect from my own feelings' },
  { id: 'self_critical', label: 'I can be hard on myself in ways that spill onto us' },
];

// Clusters — an optional, different lens for how some of these sometimes
// show up together. Explicitly not a diagnosis; framed as a grouping,
// not a label. Deliberately NOT a partition: real patterns overlap (e.g.
// overwhelm shows up both when someone's on edge watching for trouble
// AND when they've shut down from too much at once), so an item can
// belong to more than one cluster. That overlap is always shown inline
// on every item (see _clustersFor below) — no separate mode to switch
// into, it's just how the list looks.
const STRUGGLES_CLUSTERS = [
  { id: 'hypervigilance', label: 'Watching for signs something is wrong', items: ['trust', 'reassurance', 'overwhelm', 'defensive'] },
  { id: 'shutdown_cluster', label: 'Going quiet or disconnecting', items: ['shutdown', 'avoidant', 'numb', 'overwhelm'] },
  { id: 'self_critical_cluster', label: 'Turning it inward', items: ['self_critical', 'ask_needs', 'people_please'] },
  { id: 'connection_seeking', label: 'Reaching for reassurance the hard way', items: ['reassurance', 'people_please', 'ask_needs'] },
];

// Every cluster a given item belongs to — the actual interlacing. An
// item with no cluster returns []; most items return 1-2.
function _clustersFor(itemId) {
  return STRUGGLES_CLUSTERS.filter(c => c.items.includes(itemId));
}

function renderStruggles() {
  const state = _struggles();
  const gateEl = document.getElementById('struggles-trust-gate');
  const bodyEl = document.getElementById('struggles-body');
  const hasAnswered = DB.get(_userKey('struggles_trust_answered'), false);

  if (!hasAnswered) {
    if (gateEl) gateEl.style.display = 'block';
    if (bodyEl) bodyEl.style.display = 'none';
    return;
  }
  if (gateEl) gateEl.style.display = 'none';
  if (bodyEl) bodyEl.style.display = 'block';

  // Checklist — always the flat list; overlap is shown inline via each
  // item's cluster tags (_clustersFor), not via a separate view to
  // switch into.
  const listEl = document.getElementById('struggles-checklist');
  if (listEl) listEl.innerHTML = STRUGGLES_CHECKLIST_ITEMS.map(i => _renderChecklistItem(i, state)).join('');

  const shareToggle = document.getElementById('struggles-share-checklist');
  if (shareToggle) shareToggle.checked = state.checklist_shared;

  // Story
  const storyEl = document.getElementById('struggles-story');
  if (storyEl && document.activeElement !== storyEl) storyEl.value = state.story || '';
  const storyShareStatus = document.getElementById('struggles-story-share-status');
  if (storyShareStatus) storyShareStatus.textContent = state.story_shared ? '💗 Shared with your partner' : '🔒 Private';

  // Partner's shared content
  const partnerChecklist = _partnerStrugglesChecklist();
  const partnerEl = document.getElementById('partner-struggles-checklist');
  if (partnerEl) {
    partnerEl.innerHTML = partnerChecklist.length
      ? partnerChecklist.map(id => {
          const item = STRUGGLES_CHECKLIST_ITEMS.find(i => i.id === id);
          return item ? `<div class="struggles-checklist-item read-only">${item.label}</div>` : '';
        }).join('')
      : '<p class="small italic" style="color:var(--dim)">Nothing shared yet.</p>';
  }
  const partnerStory = _partnerStrugglesStory();
  const partnerStoryEl = document.getElementById('partner-struggles-story');
  if (partnerStoryEl) partnerStoryEl.textContent = partnerStory || 'Nothing shared yet.';
}

function _renderChecklistItem(item, state) {
  if (!item) return '';
  const checked = state.selected.includes(item.id);
  const clusters = _clustersFor(item.id);
  const tags = clusters.length
    ? `<div class="struggles-tags">${clusters.map(c => `<span class="struggles-tag" title="Also connects to: ${c.items.filter(i => i !== item.id).map(id => STRUGGLES_CHECKLIST_ITEMS.find(x => x.id === id)?.label).filter(Boolean).join(' · ')}">${c.label}</span>`).join('')}</div>`
    : '';
  return `<label class="struggles-checklist-item">
    <input type="checkbox" ${checked ? 'checked' : ''} onchange="toggleStruggleItem('${item.id}', this.checked)">
    <span class="struggles-checklist-item-body"><span>${item.label}</span>${tags}</span>
  </label>`;
}

function answerStrugglesTrustGate(trust) {
  DB.set(_userKey('struggles_trust_answered'), true);
  DB.set(_userKey('struggles_trust_given'), trust);
  renderStruggles();
}

function toggleStruggleItem(id, checked) {
  const state = _struggles();
  state.selected = checked ? [...new Set([...state.selected, id])] : state.selected.filter(x => x !== id);
  _strugglesSet(state);
  if (state.checklist_shared) emitSync('struggles:checklist_shared', { selected: state.selected }, { queueOnFail: false });
  renderStruggles();
  // Struggles language joins the same living word-lattice everything
  // else feeds (§ interlace, not a parallel graph) — local change, so
  // this tab has to trigger the refresh itself; a partner's shared
  // update triggers it from the sync gate side instead (kernel.js).
  if (typeof _latticeRefreshIfVisible === 'function') _latticeRefreshIfVisible();
}

function toggleStrugglesChecklistShare(shared) {
  const state = _struggles();
  state.checklist_shared = shared;
  _strugglesSet(state);
  if (shared) {
    emitSync('struggles:checklist_shared', { selected: state.selected }, { queueOnFail: false });
    showToast('💗 Shared — visible to your partner now');
  } else {
    emitSync('struggles:checklist_unshared', {}, { queueOnFail: false });
    showToast('Unshared');
  }
}

function saveStrugglesStory() {
  const state = _struggles();
  state.story = document.getElementById('struggles-story')?.value.trim() || null;
  _strugglesSet(state);
  showToast('✓ Saved privately');
  if (typeof _latticeRefreshIfVisible === 'function') _latticeRefreshIfVisible();
}

function shareStrugglesStory() {
  const state = _struggles();
  state.story = document.getElementById('struggles-story')?.value.trim() || null;
  state.story_shared = true;
  _strugglesSet(state);
  emitSync('struggles:story_shared', { story: state.story });
  renderStruggles();
  showToast('💗 Shared with your partner');
  if (typeof _latticeRefreshIfVisible === 'function') _latticeRefreshIfVisible();
}

function unshareStrugglesStory() {
  const state = _struggles();
  state.story_shared = false;
  _strugglesSet(state);
  emitSync('struggles:story_unshared', {}, { queueOnFail: false });
  renderStruggles();
  showToast('Unshared — they no longer see this');
  if (typeof _latticeRefreshIfVisible === 'function') _latticeRefreshIfVisible();
}

// The daily soft check-in used to live here as a card that only ever
// showed up if you happened to open Struggles that day — which made
// "just once a day" meaningless in practice. It's now
// _checkDailyFeelingsCheckin() in shared/eravos-kernel.js: a real
// global popup, fired once on boot per calendar day, regardless of
// which tab is open. Struggles no longer owns a second, parallel
// version of the same prompt.
