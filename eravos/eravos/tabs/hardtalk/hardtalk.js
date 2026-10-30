/* hardtalk tab · v0.14.0 · HOOK eravos.hardtalk:tab:00002 */
(function(){'use strict';
function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));}
function E(){ if(!window.eravosHardTalk) throw new Error('[hardtalk] engine not booted'); return window.eravosHardTalk; }
function ago(ts){const d=Math.floor((Date.now()-ts)/86400000);
  return d<1?'today':d===1?'yesterday':d<30?d+' days':d<365?Math.round(d/30)+' months':Math.round(d/365)+' years';}

function item(e){
  const arc=E().arc(e.id);
  const attempts=e.attempts.length;
  return '<div class="ht-item '+(e.state==='circling'?'live':'')+'">'+
    '<div class="ht-item-title">'+esc(e.subject)+'</div>'+
    (e.why?'<div class="ht-item-body">'+esc(e.why)+'</div>':'')+
    (attempts?'<div class="ht-item-body" style="margin-top:6px">'+
      e.attempts.map((a,i)=>'· attempt '+(i+1)+(a.went?' — '+esc(a.went):'')+
        (a.whatChanged?'<br><span style="opacity:.8">changed: '+esc(a.whatChanged)+'</span>':'')).join('<br>')+'</div>':'')+
    '<div class="ht-acts">'+
      (e.state!=='had'?'<button class="ht-btn" onclick="htRecord(\''+e.id+'\')">We had it</button>':
                       '<button class="ht-btn ghost" onclick="htRecord(\''+e.id+'\')">Had it again</button>')+
      (e.state==='shelved'?'<button class="ht-btn ghost" onclick="htRevisit(\''+e.id+'\')">Bring it back</button>':
                           '<button class="ht-btn ghost" onclick="htShelve(\''+e.id+'\')">Set it down</button>')+
    '</div>'+
    '<div class="ht-item-meta">named '+ago(e.createdAt)+' ago'+
      (attempts?' · '+attempts+' attempt'+(attempts===1?'':'s'):' · not had yet')+
      (arc.saidEasier?' · '+arc.saidEasier+' felt easier':'')+'</div>'+
  '</div>';
}

function renderHardTalkTab(){
  const host=document.getElementById('ht-circling'); if(!host) return;
  let e; try{e=E();}catch(err){host.innerHTML='<div class="ht-empty">'+esc(err.message)+'</div>';return;}
  const h=e.health();
  const sub=document.getElementById('ht-sub');
  if(sub) sub.textContent=h.total+' named · '+h.subjectsReturnedTo+' returned to';
  const fill=(id,list,empty)=>{const el=document.getElementById(id); if(!el)return;
    el.innerHTML=list.length?list.map(item).join(''):'<div class="ht-empty">'+empty+'</div>';};
  fill('ht-circling',e.list('circling').concat(e.list('named')),
    'Nothing named yet. Naming one is most of the work — nothing here will chase you to have it.');
  fill('ht-had',e.list('had'),'None had yet.');
  fill('ht-shelved',e.list('shelved'),'Nothing set down.');
  const hd=document.getElementById('ht-health'); if(hd) hd.textContent=JSON.stringify(h,null,1);
}

window.htRecord=function(id){try{
  const went=window.prompt('How did it go? (in your words)');
  if(went===null) return;
  const changed=window.prompt('Did anything change? — optional');
  const easier=window.confirm('Was it easier than last time? OK = yes, Cancel = no / first time');
  const r=E().record(id,{went:went||null,whatChanged:changed||null,easierThanLast:easier});
  if(r.note&&window.showToast) showToast(r.note);
  renderHardTalkTab();
}catch(e){if(window.showToast)showToast(e.message);}};
window.htShelve=function(id){try{
  const why=window.prompt('Anything to note? — optional. It stays here either way:');
  const r=E().shelve(id,why||null); if(window.showToast)showToast(r.note); renderHardTalkTab();
}catch(e){if(window.showToast)showToast(e.message);}};
window.htRevisit=function(id){try{E().revisit(id);renderHardTalkTab();}catch(e){if(window.showToast)showToast(e.message);}};

function wire(){
  const f=document.getElementById('ht-form'),n=document.getElementById('ht-new');
  if(n&&f) n.addEventListener('click',()=>{f.hidden=!f.hidden;if(!f.hidden)document.getElementById('ht-subject')?.focus();});
  document.getElementById('ht-cancel')?.addEventListener('click',()=>{if(f)f.hidden=true;});
  document.getElementById('ht-save')?.addEventListener('click',()=>{
    try{
      const r=E().add(document.getElementById('ht-subject').value,{
        why:document.getElementById('ht-why').value.trim()||null,
        wanted:document.getElementById('ht-wanted').value.trim()||null,
        afraidOf:document.getElementById('ht-afraid').value.trim()||null});
      ['ht-subject','ht-why','ht-wanted','ht-afraid'].forEach(i=>{const el=document.getElementById(i);if(el)el.value='';});
      if(f)f.hidden=true;
      if(r.note&&window.showToast) showToast(r.note);
      renderHardTalkTab();
    }catch(e){if(window.showToast)showToast(e.message);}
  });
}
window.renderHardTalkTab=renderHardTalkTab;
window.EravosTabInitRenderers=window.EravosTabInitRenderers||{};
window.EravosTabInitRenderers.hardtalk=function(){renderHardTalkTab();wire();};
})();
