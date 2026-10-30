// ═══════════════════════════════════════════════════════════════════
// RHEON VOICE v7 — analysis-engine.js
// Signal processing: SlopeEngine, StabilityEngine, OscillationEngine,
// PitchEngine, ConfidencePropagator, ResonanceEngine, DriftEngine,
// ReceiverGrammarDetector, FlowStateScorer.
// Also: text analytics helpers (tok, sigTok, dysfluency, coherence,
// frameworks, contradictions, wordBank).
//
// NO DOM access. Pure transforms. Reads/writes shared state via
// the _state object passed in from app.js.
// ═══════════════════════════════════════════════════════════════════

// ── TEXT HELPERS ──────────────────────────────────────────────────
var SW = {the:1,a:1,an:1,and:1,or:1,but:1,in:1,on:1,at:1,to:1,for:1,of:1,is:1,it:1,its:1,was:1,are:1,be:1,been:1,have:1,has:1,had:1,do:1,does:1,did:1,will:1,would:1,could:1,should:1,may:1,might:1,can:1,this:1,that:1,these:1,those:1,i:1,me:1,my:1,we:1,you:1,he:1,she:1,they:1,them:1,their:1,his:1,her:1,so:1,if:1,as:1,by:1,from:1,with:1,about:1,just:1,like:1,more:1,also:1,then:1,than:1,when:1,what:1,which:1,who:1,how:1,not:1,no:1,yes:1,up:1,out:1,into:1,over:1,after:1,before:1,because:1,all:1,some:1,any:1,there:1,here:1,very:1,really:1,right:1,okay:1,mean:1,means:1,kind:1,sort:1,know:1,think:1,feel:1,want:1,need:1,get:1,got:1,go:1,going:1,back:1,one:1,way:1,now:1,still:1,even:1,much:1,lot:1,thing:1,things:1,said:1,say:1,says:1,saying:1,yeah:1,well:1,um:1,uh:1,hmm:1};

var FILLERS = ['um','uh','like','you know','i mean','sort of','kind of','basically','literally','actually','essentially'];

function tok(t)    { return t.toLowerCase().replace(/[^a-z\s]/g,' ').split(/\s+/).filter(function(w){ return w.length > 2; }); }
function sigTok(t) { return tok(t).filter(function(w){ return w.length > 3 && !SW[w]; }); }

// Lexical-only dysfluency (text-pattern + raw ZCR). Kept as the fallback
// path for scoreDysfluencyFused() when no acoustic snapshot is available.
function scoreDysfluency(text, zcr) {
  var words = tok(text), score = 0;
  for (var i = 1; i < words.length; i++) {
    if (words[i] === words[i-1]) score += 0.3;
    if (i > 1 && words[i] === words[i-2]) score += 0.15;
  }
  for (var j = 2; j < words.length; j++) {
    if (words[j] === words[j-2] && words[j-1] === words[j-3]) score += 0.25;
  }
  var start = words.slice(0, 3);
  for (var k = 0; k < FILLERS.length; k++) { if (start.indexOf(FILLERS[k]) > -1) score += 0.1; }
  if (zcr && zcr > 0.3) score += 0.2;
  return Math.min(1, score);
}

// ── DYSFLUENCY FUSION — acoustic + lexical (MERGED from v4.2, GAPS.md #1) ──
// acousticScore comes from AudioEngine.snapshot().acousticDysfluency — a
// real-time signal (ZCR spike, pitch discontinuity, mid-utterance silence).
// Lexical is post-hoc text analysis. Fused 60/40 acoustic/lexical, since
// the acoustic signal is available before the utterance finishes.
function scoreDysfluencyFused(text, acousticScore) {
  var words = tok(text);
  var lexical = 0;

  for (var i = 1; i < words.length; i++) {
    if (words[i] === words[i-1]) lexical += 0.3;
    if (i > 1 && words[i] === words[i-2]) lexical += 0.15;
  }
  for (var j = 2; j < words.length; j++) {
    if (words[j] === words[j-2] && j > 1 && words[j-1] === words[j-3]) lexical += 0.25;
  }
  var FILLER_FULL = ['um','uh','like','you know','i mean','sort of','kind of',
    'basically','literally','actually','essentially','right','okay so',
    'and um','so um','i guess','kind of like','sort of like','you know what'];
  var lower = text.toLowerCase();
  FILLER_FULL.forEach(function(f) { if (lower.indexOf(f) > -1) lexical += 0.1; });

  if (/^(i i|the the|and and|so so|it it|that that)\b/i.test(text)) lexical += 0.4;

  lexical = Math.min(1, lexical);

  return Math.min(1, (acousticScore || 0) * 0.6 + lexical * 0.4);
}

// Plain word-overlap coherence (IoU). Kept only for reference/tests —
// scoreCoherence() below is the TF-IDF version now used at the call site.
function scoreCoherencePlain(text, nodes) {
  if (!nodes || nodes.length < 2) return 0.5;
  var recent = nodes.slice(-4).map(function(n){ return n.text; }).join(' ');
  var curSet = {}, recSet = {};
  var curWords = sigTok(text), recWords = sigTok(recent);
  for (var i = 0; i < curWords.length; i++) curSet[curWords[i]] = 1;
  for (var j = 0; j < recWords.length; j++) recSet[recWords[j]] = 1;
  var curN = Object.keys(curSet).length, recN = Object.keys(recSet).length;
  if (curN === 0 || recN === 0) return 0.5;
  var shared = 0;
  for (var w in curSet) { if (recSet[w]) shared++; }
  var iou = shared / (curN + recN - shared);
  return Math.round(iou * 100) / 100;
}

// ── COHERENCE — TF-IDF weighted cosine + recency decay (MERGED from
// v4.2.2, GAPS.md #1) ───────────────────────────────────────────────
// Rare words that recur across utterances score much higher than common
// ones (IDF weighting). Nodes decay in influence 0.80^distance — recent
// context matters more than the start of the session. Pure function: IDF
// is rebuilt from the passed-in `nodes` each call rather than cached as
// module state, per this file's no-side-effects contract.
function scoreCoherence(text, nodes) {
  if (!nodes || nodes.length < 2) return 0.5;
  var curWords = sigTok(text);
  if (curWords.length === 0) return 0.5;

  var df = {};
  var corpus = nodes.map(function(n){ return n.text; }).concat([text]);
  corpus.forEach(function(t) {
    var seen = {};
    sigTok(t).forEach(function(w) { if (!seen[w]) { df[w] = (df[w]||0)+1; seen[w]=1; } });
  });
  var N = corpus.length;
  var idf = {};
  Object.keys(df).forEach(function(w) { idf[w] = Math.log((N+1)/(df[w]+1)) + 1; });

  var curTF = {};
  curWords.forEach(function(w) { curTF[w] = (curTF[w]||0)+1; });

  var recent = nodes.slice(-6);
  var totalSim = 0, totalWeight = 0;

  recent.forEach(function(node, idx) {
    var decay = Math.pow(0.80, recent.length - 1 - idx); // most recent = weight 1
    var nodeTF = {};
    sigTok(node.text).forEach(function(w) { nodeTF[w] = (nodeTF[w]||0)+1; });

    var dot = 0, normA = 0, normB = 0;
    var allWords = {};
    Object.keys(curTF).forEach(function(w) { allWords[w] = 1; });
    Object.keys(nodeTF).forEach(function(w) { allWords[w] = 1; });
    Object.keys(allWords).forEach(function(w) {
      var idfW = idf[w] || 1;
      var a = (curTF[w]||0) * idfW;
      var b = (nodeTF[w]||0) * idfW;
      dot += a*b; normA += a*a; normB += b*b;
    });
    var sim = (normA > 0 && normB > 0) ? dot / (Math.sqrt(normA) * Math.sqrt(normB)) : 0;
    totalSim += sim * decay;
    totalWeight += decay;
  });

  return totalWeight > 0 ? Math.round(Math.min(1, totalSim/totalWeight) * 100) / 100 : 0.5;
}

var FRAMEWORK_PATTERNS = [
  {name:'CAUSAL',          re:/\b(because|therefore|leads to|causes|that'?s why|results in|due to|hence)\b/i},
  {name:'CONDITIONAL',     re:/\b(if.{1,30}then|depends on|only when|unless|provided that|assuming)\b/i},
  {name:'COMPARATIVE',     re:/\b(compared to|unlike|whereas|the difference|on the other hand|in contrast|more than|less than)\b/i},
  {name:'NEGATION-REFRAME',re:/\b(not.{1,20}but|it'?s not that.{1,30}it'?s|rather than)\b/i},
  {name:'DIALECTICAL',     re:/\b(on one hand.{1,40}on the other|both.{1,30}and|tension between|simultaneously|paradox)\b/i},
  {name:'SYSTEMS',         re:/\b(feedback|loop|cycle|emergent|self.reinforcing|recursive|pattern|dynamic|equilibrium)\b/i},
  {name:'META',            re:/\b(i'?m noticing|what i mean|the pattern here|what this tells me|i realize|i see that|i'?m aware)\b/i},
  {name:'SUPPRESSION',     re:/\b(whatever|never mind|doesn'?t matter|forget it|i'?m fine|it'?s fine|drop it)\b/i},
  {name:'OSCILLATORY',     re:/\b(but then again|on the other hand|although|however|yet also|but also)\b/i}
];

function detectFrameworks(text, frames) {
  var found = [];
  for (var i = 0; i < FRAMEWORK_PATTERNS.length; i++) {
    var p = FRAMEWORK_PATTERNS[i], m = text.match(p.re);
    if (m) {
      found.push({name: p.name, example: m[0].trim()});
      if (!frames[p.name]) frames[p.name] = {count:0, examples:[]};
      frames[p.name].count++;
      if (frames[p.name].examples.length < 3) frames[p.name].examples.push(text.slice(0, 60));
    }
  }
  return found;
}

var CONTRA_PAIRS = [
  ['always','never'],['everything','nothing'],['true','false'],['agree','disagree'],
  ['can','cannot'],['will','wont'],['do','dont'],['have','havent'],['trust','distrust'],
  ['want','dont want'],['need','dont need'],['like','hate'],['good','bad'],['right','wrong'],
  ['open','closed'],['clear','confused'],['calm','upset'],['okay','not okay'],
  ['possible','impossible'],['certain','uncertain'],['simple','complex'],['easy','hard'],
  ['start','stop'],['grow','shrink'],['connect','disconnect'],['remember','forget'],
  ['love','hate'],['safe','unsafe'],['free','trapped'],['together','alone'],
  ['full','empty'],['strong','weak']
];

function detectContradictions(text, nodes) {
  var curToks = tok(text), recent = nodes ? nodes.slice(-12) : [], found = [];
  for (var p = 0; p < CONTRA_PAIRS.length; p++) {
    var wA = CONTRA_PAIRS[p][0], wB = CONTRA_PAIRS[p][1];
    var curA = curToks.indexOf(wA) > -1, curB = curToks.indexOf(wB) > -1;
    for (var j = 0; j < recent.length; j++) {
      var prev = tok(recent[j].text), prevA = prev.indexOf(wA) > -1, prevB = prev.indexOf(wB) > -1;
      if (curA && prevB) { found.push({wA:wA,wB:wB,prevId:recent[j].id,prevText:recent[j].text.slice(0,60)}); break; }
      if (curB && prevA) { found.push({wA:wB,wB:wA,prevId:recent[j].id,prevText:recent[j].text.slice(0,60)}); break; }
    }
  }
  return found;
}

function updateWordBank(text, wordBank) {
  var words = sigTok(text), ts = Date.now();
  for (var i = 0; i < words.length; i++) {
    var w = words[i];
    if (!wordBank[w]) wordBank[w] = {count:0, coOccurs:{}, firstTs:ts, lastTs:ts};
    wordBank[w].count++; wordBank[w].lastTs = ts;
    var ws = Math.max(0, i-4), we = Math.min(words.length-1, i+4);
    for (var j = ws; j <= we; j++) {
      if (j === i) continue;
      var n = words[j];
      if (n.length > 3 && !SW[n]) wordBank[w].coOccurs[n] = (wordBank[w].coOccurs[n] || 0) + 1;
    }
  }
}

function extractTags(text, wordBank) {
  return sigTok(text)
    .filter(function(w){ return w.length > 4; })
    .sort(function(a,b){ return (wordBank[b]?wordBank[b].count:0) - (wordBank[a]?wordBank[a].count:0); })
    .slice(0, 5);
}

function findConnectedNodes(text, nodes) {
  var curSig = {}, connected = [];
  var curWords = sigTok(text);
  for (var i = 0; i < curWords.length; i++) curSig[curWords[i]] = 1;
  for (var j = nodes.length-1; j >= Math.max(0, nodes.length-8); j--) {
    var shared = sigTok(nodes[j].text).filter(function(w){ return curSig[w]; });
    if (shared.length >= 2) connected.push(nodes[j].id);
  }
  return connected;
}

// ── SLOPE ENGINE — OLS regression ─────────────────────────────────
function slopeEngine(values) {
  var n = values.length;
  if (n < 3) return {slope:0, direction:'flat', momentum:0};
  var sX=0,sY=0,sXY=0,sX2=0;
  for (var i=0;i<n;i++){sX+=i;sY+=values[i];sXY+=i*values[i];sX2+=i*i;}
  var slope = (n*sXY - sX*sY) / (n*sX2 - sX*sX);
  return {
    slope:     slope,
    direction: slope >  0.01 ? 'rising' : slope < -0.01 ? 'falling' : 'flat',
    momentum:  Math.min(1, Math.abs(slope) * 20)
  };
}

// ── STABILITY ENGINE ───────────────────────────────────────────────
var SIGMA_REGIMES = ['INSUFFICIENT_DATA','STABLE','ACTIVATING','UNGROUNDED','DYSREGULATED','OSCILLATORY','COLLAPSING','OFFLINE'];
var REGIME_COLORS = {
  INSUFFICIENT_DATA: 'var(--text3)',
  STABLE:      'var(--reg-stable)',
  ACTIVATING:  'var(--reg-activating)',
  UNGROUNDED:  'var(--reg-ungrounded)',
  DYSREGULATED:'var(--reg-dysreg)',
  OSCILLATORY: 'var(--reg-osc)',
  COLLAPSING:  'var(--reg-collapse)',
  OFFLINE:     'var(--reg-offline)'
};

function stabilityEngine(values) {
  var n = values.length;
  if (n < 4) return {regime:'INSUFFICIENT_DATA', cov:0, slopeFlips:0};
  var mean = values.reduce(function(a,b){return a+b;},0)/n;
  var std  = Math.sqrt(values.reduce(function(s,v){return s+(v-mean)*(v-mean);},0)/n);
  var cov  = mean > 0.001 ? std/mean : 0;
  var flips = 0;
  for (var i=2;i<n;i++){
    var d1=values[i-1]-values[i-2], d2=values[i]-values[i-1];
    if((d1>0&&d2<0)||(d1<0&&d2>0)) flips++;
  }
  var slope = slopeEngine(values), regime;
  if      (mean > 0.92)                                       regime = 'OFFLINE';
  else if (slope.momentum > 0.72 && slope.direction==='rising') regime = 'COLLAPSING';
  else if (flips >= 3)                                          regime = 'OSCILLATORY';
  else if (cov > 0.45)                                          regime = 'DYSREGULATED';
  else if (cov > 0.28)                                          regime = 'UNGROUNDED';
  else if (slope.momentum > 0.18 && slope.direction==='rising') regime = 'ACTIVATING';
  else                                                          regime = 'STABLE';
  return {regime:regime, cov:cov, slopeFlips:flips, slope:slope};
}

// ── OSCILLATION ENGINE ─────────────────────────────────────────────
function oscillationEngine(values) {
  var n = values.length;
  if (n < 5) return {period:0, amplitude:0, regularity:0, phase:'unknown'};
  var peaks = [], troughs = [];
  for (var i=1;i<n-1;i++){
    if (values[i]>values[i-1]&&values[i]>values[i+1]) peaks.push(i);
    else if (values[i]<values[i-1]&&values[i]<values[i+1]) troughs.push(i);
  }
  var period = 0;
  if (peaks.length >= 2) {
    var diffs = [];
    for (var j=1;j<peaks.length;j++) diffs.push(peaks[j]-peaks[j-1]);
    period = diffs.reduce(function(a,b){return a+b;},0)/diffs.length;
  }
  var amp = 0;
  if (peaks.length>0&&troughs.length>0) {
    var pM = peaks.map(function(i){return values[i];}).reduce(function(a,b){return a+b;},0)/peaks.length;
    var tM = troughs.map(function(i){return values[i];}).reduce(function(a,b){return a+b;},0)/troughs.length;
    amp = Math.max(0, pM-tM);
  }
  var regularity = 0;
  if (peaks.length >= 3) {
    var d2 = [];
    for (var k=1;k<peaks.length;k++) d2.push(peaks[k]-peaks[k-1]);
    var dM = d2.reduce(function(a,b){return a+b;},0)/d2.length;
    var dS = Math.sqrt(d2.reduce(function(s,v){return s+(v-dM)*(v-dM);},0)/d2.length);
    regularity = Math.max(0, 1 - dS/(dM+0.001));
  }
  return {
    period:     Math.round(period*10)/10,
    amplitude:  Math.round(amp*100)/100,
    regularity: Math.round(regularity*100)/100,
    phase:      values[n-1] > values[n-2] ? 'rising' : 'falling'
  };
}

// ── PITCH ENGINE — jitter, shimmer, HNR ───────────────────────────
function pitchEngine(pitchVals, ampVals) {
  var n = Math.min(pitchVals.length, ampVals.length);
  if (n < 4) return {jitter:0, shimmer:0, hnr:0, prosodyTag:'insufficient', voiced:false};
  var jSum=0,jN=0,meanF0=0,voicedN=0;
  for (var i=0;i<n;i++){if(pitchVals[i]>0){meanF0+=pitchVals[i];voicedN++;}}
  meanF0 = voicedN > 0 ? meanF0/voicedN : 0;
  for (var j=1;j<n;j++){if(pitchVals[j]>0&&pitchVals[j-1]>0){jSum+=Math.abs(pitchVals[j]-pitchVals[j-1]);jN++;}}
  var jitter = (jN>0&&meanF0>0) ? jSum/jN/meanF0 : 0;
  var shSum=0,shN=0,meanAmp=ampVals.reduce(function(a,b){return a+b;},0)/n;
  for (var k=1;k<n;k++){shSum+=Math.abs(ampVals[k]-ampVals[k-1]);shN++;}
  var shimmer = (shN>0&&meanAmp>0) ? shSum/shN/(meanAmp+0.0001) : 0;
  var variance = ampVals.reduce(function(s,v){return s+Math.pow(v-meanAmp,2);},0)/ampVals.length;
  var hnr = meanAmp > 0.001 ? Math.max(0, 1 - Math.sqrt(variance)/(meanAmp+0.0001)) : 0;
  var prosodyTag;
  if      (meanF0===0||voicedN/n<0.4)      prosodyTag = 'unvoiced';
  else if (jitter>0.08&&shimmer>0.15)       prosodyTag = 'stressed';
  else if (jitter>0.05)                     prosodyTag = 'tense';
  else if (hnr>0.7&&jitter<0.03)            prosodyTag = 'clear';
  else                                      prosodyTag = 'normal';
  return {
    jitter:     Math.round(jitter*1000)/1000,
    shimmer:    Math.round(shimmer*1000)/1000,
    hnr:        Math.round(hnr*100)/100,
    prosodyTag: prosodyTag,
    voiced:     voicedN/n > 0.4
  };
}

// ── CONFIDENCE PROPAGATOR ──────────────────────────────────────────
function confidencePropagator(signals) {
  var result = signals.slice();
  for (var i=0;i<result.length;i++){
    if (result[i].confidence > 0.7) {
      for (var j=0;j<result.length;j++){
        if (i!==j&&result[j].confidence<0.5) {
          result[j].score = Math.min(1, result[j].score * (1 + result[i].confidence * 0.4));
        }
      }
    }
  }
  return result;
}

// ── RESONANCE ENGINE ───────────────────────────────────────────────
function computeResonance(curNode, prevNodes) {
  if (!prevNodes || prevNodes.length < 2) return null;
  var recent = prevNodes.slice(-4);
  function nodeVec(node) {
    return {
      coherence:   node.coherenceScore  || 0.5,
      dysfluency:  node.dysfluencyScore || 0,
      wpm:         Math.min(1, (node.wpm  || 80)  / 200),
      pitch:       Math.min(1, (node.pitch|| 150)  / 400),
      amplitude:   Math.min(1, (node.amplitude||0.05)*10),
      wordCount:   Math.min(1, (node.wordCount||10)/40)
    };
  }
  function cosSim(a, b) {
    var keys = Object.keys(a), dot=0, mA=0, mB=0;
    for (var k=0;k<keys.length;k++){dot+=(a[keys[k]]||0)*(b[keys[k]]||0);mA+=(a[keys[k]]||0)*(a[keys[k]]||0);mB+=(b[keys[k]]||0)*(b[keys[k]]||0);}
    return (mA===0||mB===0) ? 0 : dot/(Math.sqrt(mA)*Math.sqrt(mB));
  }
  var curVec  = nodeVec(curNode);
  var sims    = recent.map(function(v){return cosSim(curVec, nodeVec(v));});
  var temporal= sims.reduce(function(a,b){return a+b;},0)/sims.length;
  var cohVals = recent.map(function(n){return n.coherenceScore||0.5;});
  var cohMean = cohVals.reduce(function(a,b){return a+b;},0)/cohVals.length;
  var structural = 1 - Math.abs((curNode.coherenceScore||0.5) - cohMean);
  var dysVals = recent.map(function(n){return n.dysfluencyScore||0;});
  var dysMean = dysVals.reduce(function(a,b){return a+b;},0)/dysVals.length;
  var permeability = 1 - Math.abs((curNode.dysfluencyScore||0) - dysMean);
  var wpmVals = recent.map(function(n){return n.wpm||80;});
  var wpmMean = wpmVals.reduce(function(a,b){return a+b;},0)/wpmVals.length;
  var rhythm  = 1 - Math.min(1, Math.abs((curNode.wpm||80) - wpmMean)/100);
  var score   = Math.max(0, Math.min(1, 0.35*structural + 0.25*temporal + 0.2*permeability + 0.2*rhythm));
  var cls;
  if      (score > 0.78)      cls = 'HARMONIC_STABILITY';
  else if (score > 0.60)      cls = 'GROWTH_FRICTION';
  else if (temporal < 0.4)    cls = 'ASYNCHRONOUS_DRIFT';
  else if (permeability<0.35) cls = 'VOLATILE_COUPLING';
  else                        cls = 'LOW_INTERACTION_FIELD';
  return {
    score:          Math.round(score*100)/100,
    classification: cls,
    axes: {
      structural:   Math.round(structural*100)/100,
      temporal:     Math.round(temporal*100)/100,
      permeability: Math.round(permeability*100)/100,
      rhythm:       Math.round(rhythm*100)/100
    }
  };
}

// ── DRIFT ENGINE ───────────────────────────────────────────────────
function driftEngine(nodes, energyHistory, contras) {
  if (nodes.length < 5) return {signals:[], clusterCount:0};
  var recent   = nodes.slice(-6);
  var baseline = nodes.slice(0, Math.min(8, nodes.length-3));
  var signals  = [];

  var baseWpm = baseline.map(function(n){return n.wpm||80;}).reduce(function(a,b){return a+b;},0)/baseline.length;
  var lastWpm = recent[recent.length-1].wpm || 80;
  if (Math.abs(lastWpm-baseWpm) > baseWpm*0.5)
    signals.push({type:'PACING_SHIFT', score:Math.min(1,Math.abs(lastWpm-baseWpm)/baseWpm), confidence:0.7});

  var deltas = recent.filter(function(n){return n.silenceDelta>0;}).map(function(n){return n.silenceDelta;});
  if (deltas.length >= 2) {
    var dM = deltas.slice(0,-1).reduce(function(a,b){return a+b;},0)/(deltas.length-1);
    var lD = deltas[deltas.length-1];
    if (lD > dM*2.5) signals.push({type:'MICRO_HESITATION', score:Math.min(1,lD/dM/4), confidence:0.65});
  }

  var cohSlope = slopeEngine(recent.map(function(n){return n.coherenceScore||0.5;}));
  if (cohSlope.direction==='falling'&&cohSlope.momentum>0.2)
    signals.push({type:'BEHAVIORAL_DRIFT', score:cohSlope.momentum, confidence:0.75});

  if (energyHistory && energyHistory.length >= 4) {
    var ampSlope = slopeEngine(energyHistory.slice(-6));
    if (ampSlope.momentum > 0.4) signals.push({type:'ENERGY_CHANGE', score:ampSlope.momentum, confidence:0.6});
  }

  var wpmH = nodes.slice(-10).map(function(n){return n.wpm||80;});
  if (wpmH.length >= 4) {
    var wM = wpmH.reduce(function(a,b){return a+b;},0)/wpmH.length;
    var wV = Math.sqrt(wpmH.reduce(function(s,v){return s+(v-wM)*(v-wM);},0)/wpmH.length);
    if (wV/wM > 0.45) signals.push({type:'RHYTHM_DISRUPTION', score:Math.min(1,wV/wM), confidence:0.65});
  }

  var lastNode = recent[recent.length-1];
  if (lastNode.coherenceScore>0.5&&lastNode.dysfluencyScore>0.4)
    signals.push({type:'PREDICTIVE_MISMATCH', score:lastNode.dysfluencyScore*lastNode.coherenceScore, confidence:0.6});

  if (contras && contras.length > 0) {
    var rC = contras.filter(function(c){return c.ts>Date.now()-60000;});
    if (rC.length>0&&lastNode.coherenceScore>0.4)
      signals.push({type:'EMOTIONAL_INCONGRUENCE', score:Math.min(1,rC.length*0.4), confidence:0.55});
  }

  var propagated = confidencePropagator(signals);
  return {signals:propagated, clusterCount:propagated.length};
}

// ── RECEIVER GRAMMAR ───────────────────────────────────────────────
function detectReceiverGrammar(nodes) {
  if (nodes.length < 4) return null;
  var recent = nodes.slice(-10), th=0, fe=0, so=0;
  var THINK = /\b(because|therefore|logically|reason|evidence|conclude|analysis|system|pattern|structure|framework|model)\b/i;
  var FEEL  = /\b(feel|felt|feeling|emotion|heart|sense|intuit|vibe|connection|trust|love|hurt|sad|happy|angry)\b/i;
  var SOMAT = /\b(body|breath|chest|stomach|tense|tight|heavy|light|physical|energy|space|ground|present|moment)\b/i;
  for (var i=0;i<recent.length;i++){var t=recent[i].text;if(THINK.test(t))th++;if(FEEL.test(t))fe++;if(SOMAT.test(t))so++;}
  if (th+fe+so < 2) return null;
  var mode, desc;
  if (th>=fe&&th>=so){mode='THINK_FIRST';desc='Analytical processing dominant. Causal reasoning, structural framing.';}
  else if (fe>=so)  {mode='FEEL_FIRST'; desc='Emotional processing dominant. Affect-oriented, relational language.';}
  else              {mode='SOMATIC_FIRST';desc='Somatic processing dominant. Body-anchored, presence orientation.';}
  return {mode:mode, scores:{think:th,feel:fe,somatic:so}, desc:desc};
}

// ── FLOW STATE SCORER ──────────────────────────────────────────────
var _flowSamples = [];

function computeFlowScore(nodes, wpmHistory, contras) {
  if (nodes.length < 3) return 0;
  var cohVals = nodes.slice(-5).map(function(n){return n.coherenceScore||0.5;});
  var cohAvg  = cohVals.reduce(function(a,b){return a+b;},0)/cohVals.length;
  var cohStab = 1 - (Math.max.apply(null,cohVals) - Math.min.apply(null,cohVals));
  var cohScore= cohAvg*0.6 + cohStab*0.4;
  var dysVals = nodes.slice(-5).map(function(n){return n.dysfluencyScore||0;});
  var dysAvg  = dysVals.reduce(function(a,b){return a+b;},0)/dysVals.length;
  var dysScore= Math.max(0, 1-dysAvg*2);
  var wpmScore= 0.3;
  if (wpmHistory && wpmHistory.length >= 3) {
    var rw = wpmHistory.slice(-5);
    var wA = rw.reduce(function(a,b){return a+b;},0)/rw.length;
    var wV = rw.reduce(function(a,b){return a+Math.abs(b-wA);},0)/rw.length;
    wpmScore = ((wA>=80&&wA<=220?1:0.4)*0.5) + (Math.max(0,1-wV/80)*0.5);
  }
  var rC = contras ? contras.filter(function(c){return c.ts>Date.now()-60000;}).length : 0;
  var raw = (cohScore*0.35 + dysScore*0.35 + wpmScore*0.2 + Math.max(0,1-rC*0.3)*0.1) * 100;
  _flowSamples.push(raw);
  if (_flowSamples.length > 8) _flowSamples.shift();
  return Math.round(Math.min(100, Math.max(0, _flowSamples.reduce(function(a,b){return a+b;},0)/_flowSamples.length)));
}

function resetFlowSamples() { _flowSamples = []; }

// ── OFFLINE MIRROR ─────────────────────────────────────────────────
var FILLER_RE = /\b(um|uh|like|you know|i mean|sort of|kind of|basically|literally|actually|essentially|right\?|okay so)\b/gi;
var HEDGE_RE  = /\b(maybe|perhaps|i think|i guess|i feel like|it seems|it feels|something like)\b/gi;

function offlineMirror(text) {
  var s = text.replace(FILLER_RE,'').replace(HEDGE_RE,'').replace(/\s{2,}/g,' ').trim();
  s = s.replace(/\b(\w+)\s+\1\b/gi, '$1');
  if (s.length > 0) s = s[0].toUpperCase() + s.slice(1);
  if (!/[.?!]$/.test(s)) s += '.';
  return s.length < 6 ? text : s;
}

// ADDED, not from the original author: this file was written as a
// browser global script (function declarations loaded via <script>,
// no module system) -- module.exports added so it can be required()
// here. No function bodies touched.
module.exports = {
  scoreDysfluencyFused, scoreCoherence, detectContradictions, detectFrameworks,
  tok, sigTok,
};
