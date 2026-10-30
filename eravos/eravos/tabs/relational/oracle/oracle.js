/* tabs/relational/oracle/oracle.js
 * Oracle tab — the AI consultation/guidance system for love, co-creation,
 * intimacy, and interdependence. Owns everything in
 * contracts/oracle.contract.json's dom_ids_exposed.
 *
 * ORACLE_SYS is deliberately global (not scoped to this file only) —
 * the Relational Tracker tab (still in kernel.js, not yet split) reuses
 * the same system prompt for its own callAI() calls. That's an existing,
 * intentional cross-tab reuse of a constant, not a sovereignty
 * violation — sharing a prompt string isn't the same as one tab reaching
 * into another's DOM or calling its functions by name.
 *
 * What this file does NOT own: DB, S, callAI, appStream/SEvent, log.
 * Those are cross-cutting and stay in shared/eravos-kernel.js.
 *
 * Oracle is reached by other tabs exclusively through the
 * oracle:seed_requested bus event (see the CROSS-TAB REQUESTS gate in
 * kernel.js) — this file doesn't need to know who's asking.
 */

const ORACLE_SYS=`You are the Eravos Oracle — wise, poetic, deeply intuitive guide for love, co-creation, intimacy, and interdependence. You blend Gottman Method, Attachment Theory, Jungian psychology, Polyvagal theory, somatic practice, NVC, Esther Perel's work on desire, Brené Brown's vulnerability research, and emergent creativity. Speak with warmth, depth, and mysticism. Be specific, actionable, beautiful. Never give generic advice. Honor love in all forms.`;
async function consultOracle(){
  const input=document.getElementById('oracle-input').value;
  const mode=document.getElementById('oracle-mode').value;
  if(!input.trim()){alert('Share your intention.');return}
  const feelingCtx=S.feeling.name?`\nCurrent feeling: ${S.feeling.emoji} ${S.feeling.name} (${S.feeling.intensity}/10)`:'';
  appStream.emit(new SEvent('oracle:consult',{mode}));
  try{await callAI(ORACLE_SYS,`Mode: ${mode}${feelingCtx}\n${input}`,'oracle-output',{context:'oracle'})}
  catch(e){document.getElementById('oracle-output').innerHTML=`<span style="color:var(--rose)">Oracle unreachable: ${e.message}</span>`;log(e.message,'error')}
}
async function randomOracle(){
  const p=['What wants to emerge between us right now?','How can I love more freely today?','What creative project is waiting to be born?','What does my heart need?','Show me a ritual for this evening.'];
  document.getElementById('oracle-input').value=p[Math.floor(Math.random()*p.length)];
  await consultOracle();
}
async function spark(type){
  const m={
    'date idea':'Generate one magical, specific, creative date idea with sensory details and emotional arc.',
    'love letter':'Write a template love letter, poetic and specific, with 3 blanks [] for personalization.',
    'intimacy exercise':'Describe one intimacy exercise with step-by-step instructions and somatic intention.',
    'creative ritual':'Design one creative ritual for love with materials, steps, and transformation.',
    'affirmation':'Write 5 deep, specific affirmations for love, creativity, and interdependence.',
    'question depth':'Give 3 deep conversation questions that open rather than close.'
  };
  document.getElementById('oracle-input').value=m[type];
  await consultOracle();
}
