/* tabs/relational/feelings/feelings.js
 * Feelings tab — pilot for the folder-per-tab split.
 *
 * What this file owns: rendering feeling history, the somatic
 * check-in, and the NVC needs-finder — everything in
 * contracts/feelings.contract.json's dom_ids_exposed.
 *
 * What it does NOT own: DB, S, callAI, appStream/SEvent, switchTab,
 * eravosStampTab, openFeelingModal, openPipelineModal. Those are
 * cross-cutting and stay in shared/eravos-kernel.js — this file uses
 * them the same way any other script sharing the page does, without
 * duplicating them (§16.5 — delete before add; duplicating them here
 * would just be a second copy waiting to drift from the first).
 *
 * The one thing this file used to do that it doesn't anymore: reach
 * into Oracle's and Poetry's internals directly (calling
 * consultOracle()/generatePoem() by name, after manually flipping
 * tabs). That's a sovereignty violation — Feelings doesn't get to know
 * how Oracle or Poetry work internally (§5.9/§5.10). Instead it emits
 * an event and lets whichever gate owns that response react. See the
 * oracle:seed_requested / poetry:seed_requested gates registered in
 * shared/eravos-kernel.js.
 */

function renderFeelingHistory() {
  const el = document.getElementById('feeling-history-list');
  if (!el) return;
  if (!S.feelingHistory.length) {
    el.innerHTML = '<div class="small italic" style="text-align:center;padding:20px;color:var(--dim)">No feelings logged yet.</div>';
    return;
  }

  const query = (document.getElementById('feeling-history-search')?.value || '').trim().toLowerCase();
  const filtered = query
    ? S.feelingHistory.filter(f =>
        (f.name || '').toLowerCase().includes(query) ||
        (f.note || '').toLowerCase().includes(query))
    : S.feelingHistory;

  if (!filtered.length) {
    el.innerHTML = `<div class="small italic" style="text-align:center;padding:20px;color:var(--dim)">No feelings match "${query}".</div>`;
    return;
  }

  el.innerHTML = filtered.slice(0, 30).map(f => `
    <div class="flex ac gap12" style="padding:10px;border:1px solid rgba(255,106,0,0.12);border-radius:9px">
      <span style="font-size:1.3rem">${f.emoji || '•'}</span>
      <div style="flex:1"><div style="font-size:.92rem;color:${f.color || 'var(--text)'}">${f.name}</div>
        <div class="small">${f.note ? f.note.slice(0, 60) : ''}</div></div>
      <div class="small">${f.intensity || ''}/10</div>
      <div class="small" style="flex-shrink:0">${f.ts ? new Date(f.ts).toLocaleDateString() : ''}</div>
    </div>`).join('');
}

// feelingToOracle() and generateFeelingPoem() moved to
// shared/eravos-kernel.js — found while investigating a different
// screenshot request (the Express modal) that feelingToOracle() is
// called from index.html's persistent header (.feeling-send-row,
// always present regardless of tab) and generateFeelingPoem() is
// called from tabs/poetry/poetry.html's own button. Both are
// cross-cutting — a ReferenceError waiting to happen for anyone who
// clicked the header's 🔮 Oracle button, or Poetry's 💗 From Feeling
// button, without having visited the Feelings tab first this session.
// Same class of bug as sendPoke/receivePoke (see poke.contract.json).

async function generateSomaticGuidance() {
  const loc = document.getElementById('somatic-location').value;
  const qual = document.getElementById('somatic-quality').value;
  const feeling = S.feeling.name ? `Feeling: ${S.feeling.emoji} ${S.feeling.name}.` : '';
  try {
    await callAI(
      `You are a somatic therapist and body-centered guide. Speak from body intelligence, nervous system awareness, Polyvagal theory, and somatic experiencing. ${getPrimingPrefix()}`,
      `${feeling} Body location: ${loc}. Sensation quality: ${qual}. Give specific somatic guidance and practices for metabolizing this.`,
      'somatic-output'
    );
  } catch (e) {
    document.getElementById('somatic-output').textContent = `Error: ${e.message}`;
    log(e.message, 'error');
  }
}

async function findNeeds() {
  const feel = document.getElementById('needs-feeling-input').value;
  if (!feel) { alert('Enter a feeling first.'); return; }
  try {
    await callAI(
      `You use Nonviolent Communication to help people identify the needs underlying their feelings. ${getPrimingPrefix()}`,
      `Feeling: "${feel}". Identify: 1) The specific needs underneath this 2) What request might meet these needs 3) How to express this to another using NVC format`,
      'needs-output'
    );
  } catch (e) {
    document.getElementById('needs-output').textContent = `Error: ${e.message}`;
    log(e.message, 'error');
  }
}
