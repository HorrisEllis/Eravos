// §12.1 brutal. §12.2 every test must be able to fail informatively.
import assert from 'assert';
import { ProsodyWindow, pitchEngine, oscillationEngine } from '../tabs/voice/prosody.js';
import { VoiceObserver, mapProsodyToObservations } from '../tabs/voice/voice-observer.js';
import { VoiceModule, VOICE_MODULE_MANIFEST } from '../tabs/voice/voice.module.js';
import { AlkBus } from '../shared/alk/alk-bus.js';
import { LatentModel } from '../shared/alk/latent-model.js';

let pass=0, fail=0;
const t=(n,f)=>{try{f();console.log('  ok  - '+n);pass++}catch(e){console.log('  FAIL- '+n+'\n        '+e.message);fail++}};
const gen=({f0=140,j=0.01,sh=0.02,amp=0.2,n=60,seed=7})=>{let s=seed;const r=()=>{s=(s*1103515245+12345)&0x7fffffff;return (s/0x7fffffff)*2-1};
  return Array.from({length:n},()=>({pitch:Math.max(0,f0*(1+r()*j)),amplitude:Math.max(0,amp*(1+r()*sh)),zcr:0.08,spectralCentroid:1800}))};
const mk=()=>{const bus=new AlkBus();const latent=new LatentModel({bus});return{bus,latent}};

console.log('\nprosody — pure');
t('pitchEngine abstains below 4 frames instead of guessing', () => {
  const r = pitchEngine([140,141,140],[0.2,0.2,0.2]);
  assert.strictEqual(r.prosodyTag,'insufficient');
  assert.strictEqual(r.voiced,false);
});
t('zero perturbation reads as clear, high HNR', () => {
  const r = pitchEngine(Array(40).fill(140), Array(40).fill(0.2));
  assert.strictEqual(r.jitter,0); assert.strictEqual(r.shimmer,0);
  assert.ok(r.hnr>0.9); assert.strictEqual(r.prosodyTag,'clear');
});
t('jitter is a REAL ratio: 10% F0 swing yields jitter near 0.1', () => {
  const p=[],a=[]; for(let i=0;i<40;i++){p.push(i%2?140*1.1:140*0.9);a.push(0.2)}
  const r=pitchEngine(p,a);
  assert.ok(r.jitter>0.15&&r.jitter<0.25, `alternating +-10% gives 2x swing per cycle, got ${r.jitter}`);
});
t('all-unvoiced input is tagged unvoiced, never scored as stable', () => {
  const r = pitchEngine(Array(40).fill(0), Array(40).fill(0.0001));
  assert.strictEqual(r.prosodyTag,'unvoiced');
});
t('§1.2 REGRESSION: silence must ABSTAIN (this was a real bug, caught by benchmark)', () => {
  const w=new ProsodyWindow();
  for(let i=0;i<60;i++) w.push({pitch:0,amplitude:0.0001,zcr:0.001,spectralCentroid:0});
  const r=w.read();
  assert.strictEqual(r.prosodyTag,'unvoiced');
  assert.strictEqual(r.sufficient,false,'unvoiced was reported sufficient=true before the fix');
});
t('empty / null / NaN frames do not throw and do not fabricate', () => {
  const w=new ProsodyWindow();
  w.push(null); w.push(undefined); w.push({});
  const r=w.read();
  assert.ok(Number.isFinite(r.jitter)&&Number.isFinite(r.hnr));
  assert.strictEqual(r.sufficient,false);
});
t('window is bounded — 10k frames do not grow it past max', () => {
  const w=new ProsodyWindow({maxFrames:50});
  for(let i=0;i<10000;i++) w.push({pitch:140,amplitude:0.2,zcr:0.08,spectralCentroid:1800});
  assert.strictEqual(w.frameCount,50);
});
t('oscillationEngine abstains under 5 samples', () => {
  assert.strictEqual(oscillationEngine([1,2,3]).phase,'unknown');
});

console.log('\nvoice-observer — mapping');
t('stressed voice maps to sig.STRESS_ACUTE', () => {
  const w=new ProsodyWindow(); gen({j:0.14,sh:0.30}).forEach(f=>w.push(f));
  const r=w.read(); assert.strictEqual(r.prosodyTag,'stressed');
  const m=mapProsodyToObservations(r,null);
  assert.ok(m.observations.some(o=>o.key==='sig.STRESS_ACUTE'), JSON.stringify(m.observations));
});
t('clear voice maps to sig.GENUINE_ENGAGEMENT — the key that reaches 4 dimensions', () => {
  const w=new ProsodyWindow(); gen({j:0.005,sh:0.01}).forEach(f=>w.push(f));
  const m=mapProsodyToObservations(w.read(),null);
  assert.ok(m.observations.some(o=>o.key==='sig.GENUINE_ENGAGEMENT'));
});
t('insufficient reading abstains, emits NO observations', () => {
  const m=mapProsodyToObservations({sufficient:false,frames:2},null);
  assert.strictEqual(m.abstained,true);
  assert.strictEqual(m.observations.length,0);
});
t('§1.1 no anomaly is claimed before the speaker baseline is warm', () => {
  const {bus,latent}=mk(); const vo=new VoiceObserver({bus,latent});
  const w=new ProsodyWindow(); gen({amp:9.0}).forEach(f=>w.push(f));
  const m=vo.observe(w.read());
  assert.strictEqual(m.audioFrame.energyAnomaly,false,'first reading has no baseline to be anomalous against');
  assert.strictEqual(m.baselineWarm,false);
});
t('every observation carries its own reason string (§16.2)', () => {
  const w=new ProsodyWindow(); gen({j:0.14,sh:0.30}).forEach(f=>w.push(f));
  const m=mapProsodyToObservations(w.read(),null);
  m.observations.forEach(o=>assert.ok(o.why&&o.why.length>3,'missing why on '+o.key));
});

console.log('\nvoice.module — contract');
t('mount() rejects a missing bus, loudly and by name', () => {
  assert.throws(()=>new VoiceModule().mount({latent:{observe(){}}}), /voice\.module.*bus/);
});
t('mount() rejects a latent without observe() — wrong vendor version', () => {
  const {bus}=mk();
  assert.throws(()=>new VoiceModule().mount({bus,latent:{}}), /observe\(\)/);
});
t('mount() rejects an audioEngine without snapshot()', () => {
  const {bus,latent}=mk();
  assert.throws(()=>new VoiceModule().mount({bus,latent,audioEngine:{}}), /snapshot\(\)/);
});
t('mount() is idempotent, per its declared contract', () => {
  const {bus,latent}=mk(); const m=new VoiceModule();
  assert.strictEqual(m.mount({bus,latent}), m.mount({bus,latent}));
});
t('runs headless — no audioEngine, frames pushed directly (§3.4)', () => {
  const {bus,latent}=mk(); const m=new VoiceModule().mount({bus,latent});
  gen({j:0.005,sh:0.01}).forEach(f=>m.pushFrame(f));
  const r=m.closeUtterance();
  assert.ok(r&&r.sufficient); assert.strictEqual(m.health().utterancesRead,1);
});
t('SUPPRESSION: text leaves it at 0.500, ONE voiced utterance measures it', () => {
  // §12.3 — expectation vs reality documented. The first draft of this test
  // asserted <0.1 and FAILED at 0.1157. The code was right; the assertion was
  // wrong. One Kalman update against R=0.15 cannot reach 0.04 from a 0.5
  // prior. Corrected to the measured value, with the convergence property
  // asserted separately below — that is the real invariant (§12.4).
  const {bus,latent}=mk();
  assert.strictEqual(latent.state.uncertainty[2],0.5,'SUPPRESSION starts untouched');
  const m=new VoiceModule().mount({bus,latent});
  gen({j:0.14,sh:0.30}).forEach(f=>m.pushFrame(f));
  m.closeUtterance();
  for(let i=0;i<16;i++) latent.tick();
  const after=latent.state.uncertainty[2];
  assert.ok(after<0.2 && after>0.05, `one observation should land ~0.116, got ${after}`);
});
t('SUPPRESSION keeps converging across utterances (§12.4 — the real invariant)', () => {
  const {bus,latent}=mk();
  const m=new VoiceModule().mount({bus,latent});
  const seen=[];
  for(let u=0;u<4;u++){
    gen({j:0.14,sh:0.30,seed:7+u}).forEach(f=>m.pushFrame(f));
    m.closeUtterance();
    for(let i=0;i<16;i++) latent.tick();
    seen.push(latent.state.uncertainty[2]);
  }
  assert.ok(seen[3]<seen[0], `uncertainty must fall with evidence: ${seen.join(' -> ')}`);
  assert.ok(seen[3]<0.06, `four utterances should reach ~0.04, got ${seen[3]}`);
});
t('unmount() is clean and idempotent, health reports unmounted', () => {
  const {bus,latent}=mk(); const m=new VoiceModule().mount({bus,latent});
  m.unmount(); m.unmount();
  assert.strictEqual(m.health().status,'unmounted');
});
t('manifest declares owner, lifecycle, spec, parent (§17.1/§17.2/§6.3)', () => {
  for(const k of ['uuid','version','owner','lifecycle','spec','parent','emits','consumes'])
    assert.ok(VOICE_MODULE_MANIFEST[k],'manifest missing '+k);
});
t('render() is optional — module runs with no DOM at all (§5.12)', () => {
  const {bus,latent}=mk(); const m=new VoiceModule().mount({bus,latent});
  m.render(null); gen({}).forEach(f=>m.pushFrame(f)); m.closeUtterance();
  assert.strictEqual(m.health().utterancesRead,1);
});

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail?1:0);
