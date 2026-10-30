/* desires tab · v0.14.0 · HOOK eravos.desires:tab:00002
   The seal lives in the ENGINE (reveal()). This file must never read a raw
   partner answer — it only renders what reveal() returns. */
(function(){'use strict';
function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));}
function E(){ if(!window.eravosDesires) throw new Error('[desires] engine not booted'); return window.eravosDesires; }
const SCALE=[['yes','I want this'],['curious',"I'd explore it"],['maybe','Under conditions'],
             ['no','Not for me'],['limit','Hard limit']];
function items(){ try{ return DB.get('eravors_desire_items',[])||[]; }catch(e){ return []; } }
function saveItems(l){ DB.set('eravors_desire_items',l); }

// Real, curated starting menu -- direct request: "add as much as you
// can to desires as a safe way to explore them together." Organized
// into broad, non-graphic categories rather than one long list, so
// browsing doesn't feel like a checklist. Adding one of these goes
// through addItem() below -- the exact same path as typing a custom
// one in by hand. Nothing here is a suggestion of what anyone SHOULD
// want; it's a neutral menu either partner can ignore entirely.
const PRESET_CATEGORIES=[
  {cat:'Touch & sensation',items:[
    'Slow, unhurried touch with no destination in mind',
    'Massage — giving',
    'Massage — receiving',
    'Being touched somewhere unexpected, not the obvious places',
    'Temperature play (warm, cool, contrast)',
    'Different textures against skin',
    'Feather-light touch',
    'Firmer pressure, more grounding than gentle',
    'Being held tightly, full-body',
    'Hair — having it played with or pulled, gently',
  ]},
  {cat:'Setting the mood',items:[
    'Planning it in advance, building anticipation',
    'Fully spontaneous, no warning',
    'Candles, music, an actual atmosphere',
    'Somewhere other than the bedroom',
    'A change of scenery — a trip, a hotel, somewhere new',
    'Daytime, not just at night',
    'Taking a long time, no clock',
    'Quick and spontaneous in the middle of a normal day',
  ]},
  {cat:'Roleplay & fantasy',items:[
    'Playing out a fantasy together, planned in advance',
    'Strangers-for-a-night dynamic',
    'A specific character or scenario (open to discussing which)',
    'Reading or writing something together as a starting point',
    'Acting out something from a shared memory',
  ]},
  {cat:'Power & control',items:[
    'Taking the lead',
    'Following their lead completely',
    'Trading who leads, deciding together',
    'Light restraint (hands, a scarf, nothing elaborate)',
    'Being told clearly what to do',
    'Giving clear direction',
    'A structure or "rules" for a scene, agreed beforehand',
  ]},
  {cat:'Words & communication',items:[
    'Being told what they like, out loud, in the moment',
    'Praise and encouragement during',
    'Comfortable silence, no narration needed',
    'Checking in verbally throughout, not just before',
    'A private word or phrase that means "keep going"',
    'A private word or phrase that means "pause"',
  ]},
  {cat:'Novelty & exploration',items:[
    'Trying a toy neither of you has used before',
    'Recreating something from early in the relationship',
    'Something neither of you has ever tried',
    'A slow, exploratory session with no goal beyond curiosity',
  ]},
  {cat:'Emotional intimacy',items:[
    'Eye contact throughout',
    'Talking softly to each other during',
    'Real aftercare — staying close, checking in, not rushing apart',
    'Being fully present with no phones, no distractions, real time set aside',
    'Vulnerability — saying something true mid-moment, not just physical',
  ]},
];

function addItem(label){
  label=(label||'').trim(); if(!label) return null;
  const l=items();
  if(l.some(i=>i.label.toLowerCase()===label.toLowerCase())) return null; // already on the list, don't duplicate
  const it={id:'d-'+Date.now()+'-'+Math.random().toString(36).slice(2,6),label:label,ts:Date.now()};
  l.push(it); saveItems(l); return it;
}

function renderBrowsePanel(){
  const panel=document.getElementById('ds-browse-panel'); if(!panel) return;
  const existingLabels=new Set(items().map(i=>i.label.toLowerCase()));
  panel.innerHTML=PRESET_CATEGORIES.map(group=>{
    const rows=group.items.map(label=>{
      const already=existingLabels.has(label.toLowerCase());
      return '<div class="ds-preset-item'+(already?' added':'')+'" '+
        (already?'':'onclick="dsAddPreset(\''+esc(label).replace(/'/g,"&#39;")+'\')"')+'>'+
        '<span>'+esc(label)+'</span>'+(already?'<span class="small" style="color:var(--dim)">on your list</span>':'<span class="ds-preset-add">+ add</span>')+
      '</div>';
    }).join('');
    return '<details class="ds-preset-group"><summary>'+esc(group.cat)+'</summary><div class="ds-preset-list">'+rows+'</div></details>';
  }).join('');
}

window.dsAddPreset=function(label){
  const it=addItem(label);
  if(it&&window.showToast) showToast('Added — sealed until you\'ve both weighed in');
  renderBrowsePanel();
  renderDesiresTab();
};

function row(it){
  const e=E(); const mine=e.myAnswer(it.id); const r=e.reveal(it.id);
  const scale=SCALE.map(([v,l])=>'<span class="ds-opt'+(mine&&mine.value===v?' sel':'')+(v==='limit'?' limit':'')+
    '" onclick="dsAnswer(\''+it.id+'\',\''+v+'\')">'+esc(l)+'</span>').join('');
  let reveal='';
  if(r.state==='mutual') reveal='<div class="ht-item-body" style="color:var(--teal);margin-top:8px">Both of you — '+
    esc(r.together)+(r.theirAnswer.conditions?' · their conditions: '+esc(r.theirAnswer.conditions):'')+'</div>';
  else if(r.state==='sealed') reveal='<div class="ht-item-meta">'+esc(r.note)+'</div>';
  else if(r.state==='not-a-match') reveal='<div class="ht-item-meta">Not a match — nothing more is shown, either way.</div>';
  return '<div class="ht-item '+(r.state==='mutual'?'mutual':mine?'live':'')+'">'+
    '<div class="ht-item-title">'+esc(it.label)+'</div>'+
    '<div class="ds-scale">'+scale+'</div>'+reveal+
    (mine?'<div class="ht-acts"><button class="ht-btn ghost" onclick="dsWithdraw(\''+it.id+'\')">Take it off the table</button></div>':'')+
  '</div>';
}

function renderDesiresTab(){
  const host=document.getElementById('ds-todo'); if(!host) return;
  let e; try{e=E();}catch(err){host.innerHTML='<div class="ht-empty">'+esc(err.message)+'</div>';return;}
  const all=items();
  const sub=document.getElementById('ds-sub'); const h=e.health();
  if(sub) sub.textContent=h.answeredByMe+' answered · '+h.mutual+' mutual · '+h.myLimits+' limits';
  const bucket=s=>all.filter(i=>{const r=e.reveal(i.id);
    return s==='todo'?r.state==='unanswered':s==='sealed'?r.state==='sealed':r.state==='mutual';});
  const fill=(id,list,empty)=>{const el=document.getElementById(id);if(!el)return;
    el.innerHTML=list.length?list.map(row).join(''):'<div class="ht-empty">'+empty+'</div>';};
  fill('ds-todo',bucket('todo'),'Nothing waiting on you.');
  fill('ds-sealed',bucket('sealed'),'Nothing sealed.');
  fill('ds-mutual',bucket('mutual'),'Nothing mutual yet — and that is not a score.');
  const lim=document.getElementById('ds-limits');
  if(lim){const L=e.myLimits();
    lim.innerHTML=L.length?L.map(x=>{const it=all.find(i=>i.id===x.itemId);
      return '<div class="ht-item"><div class="ht-item-title">'+esc(it?it.label:x.itemId)+'</div>'+
      (x.note?'<div class="ht-item-body">'+esc(x.note)+'</div>':'')+'</div>';}).join('')
      :'<div class="ht-empty">None set. They are yours alone and never sent anywhere.</div>';}
  const hd=document.getElementById('ds-health'); if(hd) hd.textContent=JSON.stringify(h,null,1);
}

window.dsAnswer=function(id,v){try{
  let opts={};
  if(v==='maybe') opts.conditions=window.prompt('Under what conditions? — this travels with the answer if you match')||null;
  if(v==='limit') opts.note=window.prompt('Anything to note for yourself? — optional, never sent')||null;
  const r=E().answer(id,v,opts);
  if(r.note&&window.showToast) showToast(r.note);
  renderDesiresTab();
}catch(e){if(window.showToast)showToast(e.message);}};
window.dsWithdraw=function(id){try{
  const r=E().withdraw(id); if(window.showToast)showToast(r.note); renderDesiresTab();
}catch(e){if(window.showToast)showToast(e.message);}};

function wire(){
  const f=document.getElementById('ds-form'),n=document.getElementById('ds-new');
  if(n&&f) n.addEventListener('click',()=>{f.hidden=!f.hidden;if(!f.hidden)document.getElementById('ds-item')?.focus();});
  document.getElementById('ds-cancel')?.addEventListener('click',()=>{if(f)f.hidden=true;});
  document.getElementById('ds-add')?.addEventListener('click',()=>{
    const el=document.getElementById('ds-item'); const label=(el.value||'').trim();
    if(!label) return;
    const it=addItem(label);
    if(!it&&window.showToast) showToast('Already on your list');
    el.value=''; if(f)f.hidden=true; renderDesiresTab(); renderBrowsePanel();
  });
  const bt=document.getElementById('ds-browse-toggle'), bp=document.getElementById('ds-browse-panel');
  if(bt&&bp) bt.addEventListener('click',()=>{
    bp.hidden=!bp.hidden;
    if(!bp.hidden) renderBrowsePanel();
  });
}
window.renderDesiresTab=renderDesiresTab;
window.EravosTabInitRenderers=window.EravosTabInitRenderers||{};
window.EravosTabInitRenderers.desires=function(){renderDesiresTab();wire();};
})();
