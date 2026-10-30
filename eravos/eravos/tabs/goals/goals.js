/* goals tab · v0.14.0 · HOOK eravos.goals:tab:00002 */
(function(){'use strict';
function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));}
function E(){ if(!window.eravosGoals) throw new Error('[goals] engine not booted'); return window.eravosGoals; }

function item(g,mode){
  const steps=g.steps.map(s=>'<div class="ht-item-body" style="cursor:pointer" onclick="glStep(\''+g.id+'\',\''+s.id+'\')">'+
    (s.done?'✓ ':'· ')+esc(s.text)+'</div>').join('');
  let acts='<div class="ht-acts">';
  if(mode==='awaiting') acts+='<button class="ht-btn" onclick="glTakeUp(\''+g.id+'\')">Take it up</button>';
  if(g.state!=='done'&&g.state!=='dropped'){
    acts+='<button class="ht-btn ghost" onclick="glStepAdd(\''+g.id+'\')">Add a step</button>'+
          '<button class="ht-btn ghost" onclick="glDone(\''+g.id+'\')">Done</button>'+
          '<button class="ht-btn ghost" onclick="glDrop(\''+g.id+'\')">Not this</button>';
  }
  acts+='</div>';
  return '<div class="ht-item '+(g.owner==='ours'?'mutual':g.state==='open'||g.state==='moving'?'live':'')+'">'+
    '<div class="ht-item-title">'+esc(g.title)+'</div>'+
    (g.why?'<div class="ht-item-body">'+esc(g.why)+'</div>':'')+steps+acts+
    '<div class="ht-item-meta">'+esc(g.owner)+' · '+esc(g.state)+
      (g.dropped&&g.dropped.why?' · '+esc(g.dropped.why):'')+'</div></div>';
}

function renderGoalsTab(){
  const host=document.getElementById('gl-ours'); if(!host) return;
  let e; try{e=E();}catch(err){host.innerHTML='<div class="ht-empty">'+esc(err.message)+'</div>';return;}
  const h=e.health();
  const sub=document.getElementById('gl-sub');
  if(sub) sub.textContent=h.total+' goals · '+h.byOwner.ours+' shared'+(h.awaitingMe?' · '+h.awaitingMe+' waiting on you':'');
  const live=g=>g.state!=='done'&&g.state!=='dropped';
  const fill=(id,list,empty,mode)=>{const el=document.getElementById(id);if(!el)return;
    el.innerHTML=list.length?list.map(g=>item(g,mode)).join(''):'<div class="ht-empty">'+empty+'</div>';};
  const prop=e.list({owner:'proposed'});
  fill('gl-proposed',prop.filter(g=>g.proposedBy===e.me),'Nothing proposed.');
  fill('gl-awaiting',prop.filter(g=>g.proposedBy!==e.me),'Nothing waiting on you.','awaiting');
  fill('gl-ours',e.list({owner:'ours'}).filter(live),'Nothing shared yet.');
  fill('gl-mine',e.list({owner:'mine'}).filter(live),'Nothing of your own yet.');
  fill('gl-closed',e.list({state:'done'}).concat(e.list({state:'dropped'})),'Nothing closed.');
  const hd=document.getElementById('gl-health'); if(hd) hd.textContent=JSON.stringify(h,null,1);
}

const act=(fn)=>{try{fn();renderGoalsTab();}catch(e){if(window.showToast)showToast(e.message);}};
window.glTakeUp=id=>act(()=>E().takeUp(id));
window.glDone=id=>act(()=>E().complete(id,window.prompt('Anything to note? — optional')||null));
window.glDrop=id=>act(()=>{const w=window.prompt('Why not this? — optional. It is kept either way:');
  const r=E().drop(id,w||null); if(window.showToast)showToast(r.note);});
window.glStep=(g,s)=>act(()=>E().toggleStep(g,s));
window.glStepAdd=id=>act(()=>{const t=window.prompt('What is the next step?'); if(t&&t.trim())E().addStep(id,t);});

function wire(){
  const f=document.getElementById('gl-form'),n=document.getElementById('gl-new');
  if(n&&f) n.addEventListener('click',()=>{f.hidden=!f.hidden;if(!f.hidden)document.getElementById('gl-title')?.focus();});
  document.getElementById('gl-cancel')?.addEventListener('click',()=>{if(f)f.hidden=true;});
  document.getElementById('gl-save')?.addEventListener('click',()=>act(()=>{
    const r=E().add(document.getElementById('gl-title').value,{
      why:document.getElementById('gl-why').value.trim()||null,
      owner:document.getElementById('gl-owner').value});
    ['gl-title','gl-why'].forEach(i=>{const el=document.getElementById(i);if(el)el.value='';});
    if(f)f.hidden=true;
    if(r.note&&window.showToast) showToast(r.note);
  }));
}
window.renderGoalsTab=renderGoalsTab;
window.EravosTabInitRenderers=window.EravosTabInitRenderers||{};
window.EravosTabInitRenderers.goals=function(){renderGoalsTab();wire();};
})();
