/* tabs/relational/growth/growth.js
 * Growth tab — owns growth-log CRUD/render, growth-ideas generation, and
 * the Question Loops ("getting to know you") feature. Everything in
 * contracts/growth.contract.json's dom_ids_exposed.
 *
 * What it does NOT own: DB, S, callAI, appStream/SEvent, switchTab,
 * eravosStampTab, sendP2P, _escHtml, getPrimingPrefix. Those are
 * cross-cutting and stay in shared/eravos-kernel.js.
 *
 * Sovereignty fix while splitting this out: growthFromRupture() used to
 * live here and reach directly into Rupture's data — the same class of
 * violation already fixed for Oracle/Poetry (§5.9/§5.10). It's now a
 * growth:seed_requested gate (registered in kernel.js's CROSS-TAB
 * REQUESTS block) that Rupture emits into instead of calling into this
 * file by name. Rupture doesn't need to know Growth exists at all.
 */

function clearGrowthForm(){
  document.getElementById('grow-what').value='';
  document.getElementById('grow-feel').value='';
  document.getElementById('grow-why').value='';
  document.getElementById('grow-cat').value='emotional';
}
function saveGrowth(){
  const what=document.getElementById('grow-what').value;
  if(!what){alert('Describe the growth.');return}
  const g={id:Date.now(),what,cat:document.getElementById('grow-cat').value,feel:document.getElementById('grow-feel').value,why:document.getElementById('grow-why').value,ts:Date.now()};
  S.growthLog.unshift(g);DB.set('eravors_growth',S.growthLog);
  renderGrowth();clearGrowthForm();
  log('Growth logged','ok');appStream.emit(new SEvent('growth:save',{cat:g.cat}));
}
async function generateGrowthIdeas(){
  const card=document.getElementById('growth-ideas-card');
  if(card)card.style.display='block';
  const out=document.getElementById('growth-ideas-output');
  if(out)out.innerHTML='<em class="small">Generating ideas to grow together...</em>';
  const stage=document.getElementById('rel-stage')?.value||'established';
  const feeling=S.feeling.name?`Current feeling: ${S.feeling.emoji} ${S.feeling.name}.`:'';
  const recentGrowth=S.growthLog.slice(0,3).map(g=>g.what).join('; ');
  try{await callAI(`You are a growth-oriented relationship guide drawing on positive psychology, Gottman research, and developmental theory. ${getPrimingPrefix()}`,
    `Relationship stage: ${stage}. ${feeling} Recent growth: ${recentGrowth||'none yet'}. Generate 5 specific, creative, actionable ideas for growing together. Each should have a title, description, and why it creates growth.`,'growth-ideas-output')}
  catch(e){document.getElementById('growth-ideas-output').textContent=`Error: ${e.message}`;log(e.message,'error')}
}
function renderGrowth(){
  const el=document.getElementById('growth-list');
  const statsLine=document.getElementById('growth-stats-line');
  if(statsLine)statsLine.textContent=S.growthLog.length+' logged';
  if(!el)return;
  if(!S.growthLog.length){el.innerHTML='<div class="small italic" style="color:var(--dim)">Nothing logged yet. Small and real beats big and rare — log the first one whenever it happens.</div>';return}
  const cats={emotional:'💗',communication:'💬',intimacy:'🌸',creativity:'✨',conflict:'⚡',self:'🪞',shared:'🤝'};
  el.innerHTML=S.growthLog.map(g=>`
    <div class="growth-entry">
      <div class="growth-icon">${cats[g.cat]||'🌱'}</div>
      <div style="flex:1">
        <div style="font-weight:600;font-size:.95rem">${g.what.slice(0,100)}${g.what.length>100?'…':''}</div>
        <div class="small">${g.feel?g.feel.slice(0,80):''}</div>
        <div class="entry-date mt8">${g.cat.toUpperCase()} · ${new Date(g.ts).toLocaleDateString()}</div>
      </div>
      <button class="btn g d" onclick="deleteGrowth(${g.id})">🗑</button>
    </div>`).join('');
}
function deleteGrowth(id){S.growthLog=S.growthLog.filter(x=>x.id!==id);DB.set('eravors_growth',S.growthLog);renderGrowth()}

// ═══════════════════════════════════════════════════════════════════
// QUESTION LOOPS — "getting to know you", built as an open loop rather
// than a form. Deliberately curiosity-driven, not guilt-driven: no
// "seen", no aging/red timestamps, no penalty for taking three weeks to
// answer. Your partner's answer stays hidden from you specifically
// until you've answered too — mutual reveal, not a queue to clear.
//
// Data model is two small append-only logs (questions, answers) rather
// than one mutable record, so it reuses the existing reconnect-safe
// sync merge (SHARED_SYNC_KEYS/mergeSyncLog) verbatim instead of needing
// a new update-in-place sync mechanism.
// ═══════════════════════════════════════════════════════════════════

const QUESTION_PROMPTS = [
  "What's something I do that you didn't expect to fall for?",
  "What's a small thing I could do this week that would land as love?",
  "What's a memory of us you keep coming back to, and why that one?",
  "What did younger you need to hear that I could say to you now?",
  "What's something you're proud of that you don't think I fully know about?",
  "When do you feel most like yourself around me?",
  "What's a fear you have that you haven't quite said out loud?",
  "What's something about how I love you that took time to learn to receive?",
  "What's a pattern from your family you're consciously trying to do differently?",
  "What does rest actually look like for you, on your best day?",
  "What's something small I do that you never want me to stop doing?",
  "What's a version of the future together that excites you that we haven't talked about?",
  "What's something you needed from a partner that you never got to ask for before me?",
  "What's a way you show love that you don't think I always recognize as love?",
  "What's something you've changed your mind about since we've been together?",
];

function suggestQuestion() {
  const el = document.getElementById('qloop-input');
  if (el) el.value = QUESTION_PROMPTS[Math.floor(Math.random() * QUESTION_PROMPTS.length)];
}

function askQuestion() {
  const el = document.getElementById('qloop-input');
  const text = el?.value?.trim();
  if (!text) return;
  const loop = { id: Date.now() + '-' + Math.random().toString(36).slice(2, 8), question: text, askedBy: S.user?.name || 'someone', ts: Date.now() };
  const loops = DB.get('eravors_question_loops', []);
  loops.unshift(loop);
  DB.set('eravors_question_loops', loops);
  el.value = '';
  renderQuestionLoops();
  // Was: sendP2P({ type: 'question:new', loop }) — bypassed emitSync's
  // envelope wrapping entirely, so `loop` landed at the envelope's top
  // level instead of inside `data`. The question:new gate reads
  // ev.data.loop — confirmed this threw on delivery (loop was
  // undefined) and corrupted eravors_question_loops with an undefined
  // entry before the throw. Also lost queue-on-failure, since emitSync
  // is what wires that up.
  emitSync('question:new', { loop });
  appStream.emit(new SEvent('question:new', { loopId: loop.id }));
  showToast('❓ Sent — they\'ll see it whenever they open Eravos');
}

function answerQuestion(loopId) {
  const el = document.getElementById('qloop-answer-' + loopId);
  const text = el?.value?.trim();
  if (!text) return;
  const answer = { id: Date.now() + '-' + Math.random().toString(36).slice(2, 8), loopId, answeredBy: S.user?.name || 'someone', text, ts: Date.now() };
  const answers = DB.get('eravors_question_answers', []);
  answers.unshift(answer);
  DB.set('eravors_question_answers', answers);
  renderQuestionLoops();
  // Same fix as askQuestion() above — was raw sendP2P, bypassing
  // emitSync's data-wrapping and queue-on-failure.
  emitSync('question:answer', { answer });
  appStream.emit(new SEvent('question:answer', { loopId }));
  showToast('✓ Saved — you\'ll see theirs once they answer too');
}

function renderQuestionLoops() {
  const holder = document.getElementById('qloop-list');
  if (!holder) return;
  const loops = DB.get('eravors_question_loops', []);
  const answers = DB.get('eravors_question_answers', []);
  const me = S.user?.name;

  const statsLine = document.getElementById('qloop-stats-line');
  if (statsLine) {
    const revealed = loops.filter(loop =>
      answers.some(a => a.loopId === loop.id && a.answeredBy === me) &&
      answers.some(a => a.loopId === loop.id && a.answeredBy !== me)
    ).length;
    statsLine.textContent = loops.length + ' asked · ' + revealed + ' revealed';
  }

  if (!loops.length) {
    holder.innerHTML = '<div class="small italic text-center" style="padding:30px;color:var(--dim)">No questions yet — ask something you\'re actually curious about.</div>';
    return;
  }

  holder.innerHTML = loops.map(loop => {
    const myAnswer = answers.find(a => a.loopId === loop.id && a.answeredBy === me);
    const partnerAnswer = answers.find(a => a.loopId === loop.id && a.answeredBy !== me);
    const bothAnswered = myAnswer && partnerAnswer;

    if (bothAnswered) {
      return `<div class="qloop-card qloop-closed">
        <div class="qloop-q">✨ ${_escHtml(loop.question)}</div>
        <div class="qloop-reveal">
          <div class="qloop-answer"><span class="qloop-who">${_escHtml(me)}</span> ${_escHtml(myAnswer.text)}</div>
          <div class="qloop-answer"><span class="qloop-who">${_escHtml(partnerAnswer.answeredBy)}</span> ${_escHtml(partnerAnswer.text)}</div>
        </div>
      </div>`;
    }
    if (myAnswer && !partnerAnswer) {
      return `<div class="qloop-card qloop-waiting">
        <div class="qloop-q">${_escHtml(loop.question)}</div>
        <div class="small" style="color:var(--dim);margin-top:8px">You answered — it'll reveal both once they answer too. No rush on their end.</div>
      </div>`;
    }
    return `<div class="qloop-card qloop-open">
      <div class="qloop-q">${loop.askedBy === me ? '' : `<span class="qloop-who">${_escHtml(loop.askedBy)} asked:</span> `}${_escHtml(loop.question)}</div>
      ${loop.askedBy === me
        ? `<div class="small" style="color:var(--dim);margin-top:8px">Waiting on them to see it — no pressure, it just sits here till they open Eravos.</div>`
        : `<textarea id="qloop-answer-${loop.id}" rows="2" placeholder="Your answer (theirs stays hidden till you answer)..."></textarea>
           <button class="btn p" style="margin-top:8px;font-size:.82rem" onclick="answerQuestion('${loop.id}')">Answer →</button>`
      }
    </div>`;
  }).join('');
}
