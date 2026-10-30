/* tabs/rupture/rupture.js
 * Rupture & Repair tab — owns rupture-log CRUD/render, the guided
 * repair-step flow, and the AI guidance calls specific to this tab.
 * Extracted from shared/eravos-kernel.js (part of "the kernel is a
 * monolith" — 19 of 34 tabs had split HTML but zero split JS, this is
 * one of them). Everything in contracts/rupture.contract.json's
 * dom_ids_exposed.
 *
 * What it does NOT own: DB, S, callAI, appStream/SEvent, switchTab,
 * eravosStampTab, showToast, log, getPrimingPrefix. Those are
 * cross-cutting and stay in shared/eravos-kernel.js, same boundary
 * already established for Growth/Grammar/Hard Talk/etc.
 *
 * REAL BUG FOUND AND FIXED DURING THIS EXTRACTION, not before: two
 * separate definitions of renderRuptures existed ~5600 lines apart in
 * the monolith. `window.renderRuptures = function() {...}` (added
 * later, to show a real "Repair Flow" button) silently overwrote the
 * original — JS keeps the last function declaration/assignment,
 * no error, no warning. The original's own real feature (a "🌱 Log the
 * growth from this" button on resolved ruptures, wired to
 * growthFromRupture()) was lost the moment the second definition
 * shipped. growthFromRupture() itself stayed fully defined and correct
 * the whole time — it just had nothing left calling it, dead code by
 * silent omission rather than by intent. This is exactly the shape of
 * bug a real module boundary (this file, one renderRuptures, impossible
 * to shadow) prevents and a 12,000-line shared file makes easy to miss.
 * Merged correctly below: both features kept, neither silently dropped.
 *
 * ALSO FIXED: the log form was hidden behind a "+ Log Rupture" toggle
 * button (openRuptureForm()/rupture-form, display:none by default) —
 * the same "reads as an empty box" pattern already found and fixed for
 * Growth this session (direct comparison against Grammar/Hard Talk,
 * which show their input fields immediately). Same fix here: the form
 * is inline and always visible now, openRuptureForm() and the toggle
 * button removed.
 */

function getRuptureGuidance(){
  const what=document.getElementById('rup-what').value;
  const feeling=document.getElementById('rup-feeling').value;
  const part=document.getElementById('rup-part').value;
  const need=document.getElementById('rup-need').value;
  if(!what){alert('Describe the rupture first.');return}
  const out=document.getElementById('rupture-guidance');
  out.style.display='block';
  callAI(`You are a compassionate relationship guide specializing in rupture and repair. Use Gottman repair strategies, EFT cycles, and attachment theory. ${getPrimingPrefix()}`,
    `Rupture: ${what}. My feeling: ${feeling}. My part: ${part}. What I need: ${need}. Give specific repair guidance.`,out)
    .catch(e=>{out.textContent=`Error: ${e.message}`;log(e.message,'error')});
}

function clearRuptureForm(){
  document.getElementById('rup-what').value='';
  document.getElementById('rup-feeling').value='';
  document.getElementById('rup-part').value='';
  document.getElementById('rup-need').value='';
  document.getElementById('rup-severity').value='5';
  const sevLabel = document.getElementById('rup-sev-val');
  if (sevLabel) sevLabel.textContent = '5';
  document.getElementById('rup-status').value='open';
  const noteEl = document.getElementById('rup-status-note');
  if (noteEl) noteEl.value = '';
  const guidance = document.getElementById('rupture-guidance');
  if (guidance) guidance.style.display = 'none';
}

function saveRupture(){
  const what=document.getElementById('rup-what').value;
  if(!what){alert('Describe the rupture.');return}
  const status=document.getElementById('rup-status').value;
  // statusNote is the person's own words alongside the state machine, not
  // instead of it (Phase G debt). Derivations keep reading `status`; nothing
  // downstream has to change, and nobody has to pick the nearest wrong one.
  const statusNoteEl=document.getElementById('rup-status-note');
  const statusNote=statusNoteEl?statusNoteEl.value.trim():'';
  const r={id:Date.now(),what,feeling:document.getElementById('rup-feeling').value,part:document.getElementById('rup-part').value,need:document.getElementById('rup-need').value,severity:parseInt(document.getElementById('rup-severity').value),status,statusNote:statusNote||null,status_history:[{status,note:statusNote||null,ts:Date.now()}],ts:Date.now()};
  S.ruptures.unshift(r);DB.set('eravors_ruptures',S.ruptures);
  renderRuptures();clearRuptureForm();
  log('Rupture logged','ok');appStream.emit(new SEvent('rupture:save',{severity:r.severity}));
  if (typeof renderRelationalHealthField === 'function') renderRelationalHealthField();
}

/** The one, real, merged renderRuptures — both real features kept:
    the Repair Flow button (for open/healing ruptures) and the "log the
    growth from this" button (for resolved ones), which a prior silent
    duplicate had dropped entirely. */
function renderRuptures(){
  const el=document.getElementById('ruptures-list');
  const statsLine=document.getElementById('rupture-stats-line');
  if(statsLine){
    const open=(S.ruptures||[]).filter(r=>r.status!=='resolved').length;
    statsLine.textContent=(S.ruptures||[]).length+' logged'+(open?' · '+open+' open':'');
  }
  if(!el)return;
  if(!S.ruptures?.length){el.innerHTML='<div class="small italic text-center" style="padding:40px;color:var(--dim)">No ruptures logged. Conflicts are opportunities for deeper connection.</div>';return}
  const cols={'open':'status-open','healing':'status-healing','resolved':'status-resolved'};
  el.innerHTML=S.ruptures.map(r=>`
    <div class="rupture-item">
      <div class="flex jb ac">
        <div style="font-weight:600;font-size:.95rem">${r.what.slice(0,80)}${r.what.length>80?'…':''}</div>
        <div class="flex ac gap8">
          <span class="status-chip ${cols[r.status]||''}">${r.status.toUpperCase()}</span>${r.statusNote?`<span class="status-note">${r.statusNote.replace(/</g,'&lt;')}</span>`:''}
          <button class="btn g" onclick="cycleRuptureStatus(${r.id})">→</button>
          <button class="btn g d" onclick="deleteRupture(${r.id})">🗑</button>
        </div>
      </div>
      <div class="severity-bar"><div class="severity-fill" style="width:${r.severity*10}%;background:linear-gradient(90deg,${r.severity<4?'var(--teal)':r.severity<7?'var(--gold)':'var(--rose)'},transparent)"></div></div>
      <div class="small flex gap12 wrap">
        ${r.feeling?`<span>💗 ${r.feeling}</span>`:''}
        ${r.need?`<span>🫀 ${r.need.slice(0,50)}</span>`:''}
        <span style="margin-left:auto">${new Date(r.ts).toLocaleDateString()}</span>
      </div>
      ${r.status==='resolved'
        ? `<div class="flex" style="margin-top:8px"><button class="btn g" style="font-size:.78rem" onclick="growthFromRupture(${r.id})">🌱 Log the growth from this →</button></div>`
        : `<div class="flex gap8 mt8"><button class="btn p" style="font-size:.72rem" onclick="openRepairFlow(${r.id})">🔧 Repair Flow</button></div>`}
    </div>`).join('');
}

// Rupture and Growth used to be two disconnected lists — resolving a
// rupture never led anywhere. This carries the actual context across:
// jumps to Growth, opens the form, and pre-fills it so the connection
// between "we repaired this" and "here's what we learned" is a single
// click instead of retyping everything from memory in a different tab.
function growthFromRupture(id){
  const r=S.ruptures.find(x=>x.id===id);if(!r)return;
  appStream.emit(new SEvent('growth:seed_requested', {
    what: `Repaired: ${r.what.slice(0,100)}`,
    why: `Grew out of a resolved rupture${r.feeling?` (felt ${r.feeling} at the time)`:''}${r.need?`, rooted in a need for ${r.need.slice(0,60)}`:''}.`
  }));
}

function cycleRuptureStatus(id){
  const r=S.ruptures.find(x=>x.id===id);if(!r)return;
  const cycle=['open','healing','resolved'];
  const prevStatus = r.status;
  r.status=cycle[(cycle.indexOf(r.status)+1)%cycle.length];
  r.status_history = r.status_history || [];
  r.status_history.push({status: r.status, ts: Date.now()});
  DB.set('eravors_ruptures',S.ruptures);renderRuptures();
  if (typeof renderRelationalHealthField === 'function') renderRelationalHealthField();
  if (r.status === 'resolved' && prevStatus !== 'resolved' && typeof openRelationalMirrorPrompt === 'function') {
    openRelationalMirrorPrompt('rupture', String(r.id));
  }
}

function deleteRupture(id){S.ruptures=S.ruptures.filter(x=>x.id!==id);DB.set('eravors_ruptures',S.ruptures);renderRuptures()}

function renderRuptureList() { if (typeof renderRuptures === 'function') renderRuptures(); }

// ── REPAIR FLOW — the guided, step-by-step path from a logged rupture
// to an actual repair. Opened from renderRuptures()'s own real button.
function openRepairFlow(id) {
  const r = S.ruptures.find(x => x.id === id);
  if (!r) return;

  const flow = document.getElementById('repair-flow');
  const ctx  = document.getElementById('repair-rupture-context');
  const steps = document.getElementById('repair-steps-list');
  const actions = document.getElementById('repair-actions');

  if (ctx) ctx.innerHTML = `<strong style="color:var(--amber)">${r.what.slice(0,80)}</strong><br>Severity: ${r.severity}/10 · Status: ${r.status}`;

  const REPAIR_STEPS = [
    { id:'breathe',    label:'⏸ Take a breath',       desc:'Before anything else — 3 slow breaths. The nervous system needs to settle before repair is possible.',   done: r.repair_breathe },
    { id:'acknowledge',label:'💗 Acknowledge impact',  desc:'Tell your partner what happened for you, without blame. "When X happened, I felt Y." Not "you made me."',  done: r.repair_acknowledge },
    { id:'listen',     label:'👂 Listen to their side', desc:'Ask your partner what it was like for them. Listen without defending. Their experience is also true.',      done: r.repair_listen },
    { id:'take_part',  label:'🙏 Take your part',      desc:'Identify and own your contribution — even if it was small. This is courage, not weakness.',               done: r.repair_take_part },
    { id:'need',       label:'🫀 Name the need',       desc:'What do you each need to feel safe again? State it as a need, not a demand.',                              done: r.repair_need },
    { id:'reconnect',  label:'🔥 Reconnect',           desc:'A small gesture of reconnection — a touch, a shared joke, a moment of kindness. Repair does not require resolution.', done: r.repair_reconnect },
  ];

  if (steps) {
    steps.innerHTML = REPAIR_STEPS.map(s => `
      <div class="flex ac gap12" style="padding:10px 0;border-bottom:1px solid var(--border2)">
        <button class="btn ${s.done?'p':'g'}" style="font-size:.7rem;padding:4px 10px;flex-shrink:0" onclick="markRepairStep('${id}','${s.id}',this)">
          ${s.done ? '✓' : '○'}
        </button>
        <div>
          <div style="font-family:var(--fb);font-size:.85rem;color:${s.done?'var(--teal)':'var(--amber)'};margin-bottom:3px">${s.label}</div>
          <div class="small" style="color:var(--dim);line-height:1.6">${s.desc}</div>
        </div>
      </div>`).join('');
  }

  if (actions) {
    actions.innerHTML = `
      <button class="btn p" onclick="getRepairGuidance('${id}')">🔮 Oracle guidance for this repair</button>
      <button class="btn g" onclick="markRuptureResolved('${id}')">✓ Mark resolved</button>`;
  }

  if (flow) flow.style.display = 'block';
  flow?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function markRepairStep(ruptureId, stepId, btn) {
  const r = S.ruptures.find(x => x.id === parseInt(ruptureId) || x.id === ruptureId);
  if (!r) return;
  r['repair_' + stepId] = !r['repair_' + stepId];
  DB.set('eravors_ruptures', S.ruptures);
  btn.textContent = r['repair_' + stepId] ? '✓' : '○';
  btn.className = r['repair_' + stepId] ? 'btn p' : 'btn g';
  btn.style.fontSize = '.7rem'; btn.style.padding = '4px 10px';
  const label = btn.nextElementSibling?.querySelector('div');
  if (label) label.style.color = r['repair_' + stepId] ? 'var(--teal)' : 'var(--amber)';
}

async function getRepairGuidance(id) {
  const r = S.ruptures.find(x => x.id === parseInt(id) || x.id === id);
  if (!r) return;
  const out = document.getElementById('repair-ai-output');
  if (out) { out.style.display = 'block'; out.innerHTML = '<em class="small">Oracle thinking...</em>'; }
  await callAI(
    'You are a compassionate relationship guide specializing in rupture and repair. Use Gottman repair strategies, EFT, and attachment theory. Be specific and gentle.',
    `Rupture: ${r.what}. My feeling: ${r.feeling||'not specified'}. My part: ${r.part||'not yet named'}. What I need: ${r.need||'not yet named'}. Severity: ${r.severity}/10. Give a specific, actionable repair path for right now.`,
    'repair-ai-output', { context: 'rupture' }
  );
}

function markRuptureResolved(id) {
  const r = S.ruptures.find(x => x.id === parseInt(id) || x.id === id);
  if (!r) return;
  const wasResolved = r.status === 'resolved';
  r.status = 'resolved';
  r.resolvedAt = Date.now();
  r.status_history = r.status_history || [];
  r.status_history.push({ status: 'resolved', ts: Date.now() });
  DB.set('eravors_ruptures', S.ruptures);
  const repairFlowEl = document.getElementById('repair-flow');
  if (repairFlowEl) repairFlowEl.style.display = 'none';
  renderRuptures();
  showToast('✦ Rupture marked as resolved');
  // Log to growth
  const g = { id: Date.now(), what: 'Repaired: ' + r.what.slice(0,60), cat: 'conflict', feel: 'grateful', why: 'We moved through it together.', ts: Date.now() };
  S.growthLog.unshift(g);
  DB.set('eravors_growth', S.growthLog.slice(0, 100));
  if (typeof renderGrowth === 'function') renderGrowth();
  if (typeof renderRelationalHealthField === 'function') renderRelationalHealthField();
  if (!wasResolved && typeof openRelationalMirrorPrompt === 'function') {
    openRelationalMirrorPrompt('rupture', String(r.id));
  }
}

// This tab's initial-render-on-mount hook (renderRuptures()) is
// registered centrally in shared/eravos-kernel.js's own
// window.EravosTabInitRenderers dispatch table, same as every other
// split tab -- not duplicated here.
