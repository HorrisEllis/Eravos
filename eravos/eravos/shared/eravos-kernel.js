/*
 * eravos-kernel.js — mechanically extracted from index.html's inline
 * <script> blocks, concatenated in original document order.
 * Config constants (ticker phrases, onboarding options, AI provider
 * defaults) now read from window.EravosConfig, populated by the shell's
 * GET /api/config call before this script's boot code runs — falling
 * back to the original embedded literal if the API never answers.
 *
 * HONEST STATUS: still one global scope. Contracts in contracts/*.json
 * show which functions each tab/subtab actually calls; scoping them
 * apart into true per-tab modules is real refactoring against a shared
 * scope, not something this CLI does mechanically.
 */

// Hoisted here from its original position further down (near
// showToast()) -- found by real stress testing: showToast() is called
// from very early code paths (onboarding, first-tab mount), and a
// const declared where this file's mechanical concatenation originally
// placed it left `_activeToasts` in its temporal dead zone for any
// caller that ran before that point in the file. Zero dependencies
// (just an empty array), so relocating this one line is safe --
// unlike reordering a whole function block in a 10k-line file.
const _activeToasts = []; // [{ el, msg, dismissTimer }], oldest first

(function inlineManifest() {
  const manifest = {
    name: "Eravos",
    short_name: "Eravos",
    description: "Eravos – love OS for two",
    start_url: "/",
    display: "standalone",
    background_color: "#08050a",
    theme_color: "#ff6a00",
    orientation: "portrait-primary",
    icons: [
      { src: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 192 192'%3E%3Crect width='192' height='192' fill='%2308050a'/%3E%3Ctext x='50%25' y='55%25' dominant-baseline='middle' text-anchor='middle' font-size='120'%3E%F0%9F%94%A5%3C/text%3E%3C/svg%3E", sizes: "192x192", type: "image/svg+xml" },
      { src: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 512 512'%3E%3Crect width='512' height='512' fill='%2308050a'/%3E%3Ctext x='50%25' y='55%25' dominant-baseline='middle' text-anchor='middle' font-size='320'%3E%F0%9F%94%A5%3C/text%3E%3C/svg%3E", sizes: "512x512", type: "image/svg+xml" }
    ]
  };
  const blob = new Blob([JSON.stringify(manifest)], {type:'application/manifest+json'});
  const url  = URL.createObjectURL(blob);
  const link = document.createElement('link');
  link.rel   = 'manifest';
  link.href  = url;
  document.head.appendChild(link);
})();


/* ==== next inline <script> block ==== */


// PeerJS loader with graceful offline fallback
(function loadPeerJS() {
  // Install no-op stub that satisfies all new Peer() calls
  function _stubPeer() {
    window.Peer = function() {
      var _handlers = {};
      return {
        on: function(ev,fn){ (_handlers[ev]||(_handlers[ev]=[])).push(fn); return this; },
        connect: function(){ return { on:function(){return this;}, send:function(){}, close:function(){} }; },
        disconnect: function(){}, destroy: function(){}, destroyed: true,
        id: null,
      };
    };
  }
  // file:// — CDN blocked entirely
  if (location.protocol === 'file:') {
    _stubPeer();
    console.log('[Eravos] Offline mode — bridge channel active');
    return;
  }
  const script = document.createElement('script');
  script.src   = 'https://unpkg.com/peerjs@1.5.2/dist/peerjs.min.js';
  script.async = false;
  script.onerror = () => {
    // CDN unreachable — install stub silently, bridge channel is the primary transport
    _stubPeer();
    window._peerJSFailed = true;
    console.log('[Eravos] PeerJS CDN offline — bridge channel active');
  };
  document.head.appendChild(script);
})();


/* ==== next inline <script> block ==== */


(function registerInlineSW() {
  if (!('serviceWorker' in navigator)) return;

  /* ─── Service Worker source ─────────────────────────────────── */
  const SW_SRC = `
const CACHE_VERSION = 'eravos-v2.5';
const CACHE_NAME    = 'eravos-shell-' + CACHE_VERSION;

/* Resources to pre-cache on install */
const PRECACHE = [
  '/',
  '/index.html',
  'https://fonts.googleapis.com/css2?family=Cinzel+Decorative:wght@400;700;900&family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;1,300;1,400&family=Share+Tech+Mono&display=swap',
  'https://fonts.gstatic.com/s/cinzeldecorative/v16/daaHSScvJGqLYhG8nNt8KPPswUAPniZoaelDQzCLlQXE.woff2',
  'https://unpkg.com/peerjs@1.5.2/dist/peerjs.min.js',
];

/* API routes that are LIVE — always network first */
const NETWORK_FIRST_PATTERNS = [
  /\\/api\\/data\\//,
  /\\/api\\/pipeline\\//,
  /\\/api\\/rtc-config/,
  /\\/api\\/setup-complete/,
  /\\/api\\/set-data-dir/,
];

/* API routes that are NEAR-STATIC — cache then background-refresh */
const CACHE_THEN_NET_PATTERNS = [
  /\\/api\\/server-info/,
  /\\/api\\/health/,
  /\\/api\\/default-data-dir/,
];

/* ── INSTALL — pre-cache the shell ─────────────────────────── */
self.addEventListener('install', evt => {
  self.skipWaiting();
  evt.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      const safe = PRECACHE.map(url =>
        cache.add(url).catch(e =>
          console.warn('[SW] Pre-cache skip:', url, e.message)
        )
      );
      return Promise.all(safe);
    })
  );
});

/* ── ACTIVATE — purge old caches ───────────────────────────── */
self.addEventListener('activate', evt => {
  evt.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k.startsWith('eravos-shell-') && k !== CACHE_NAME)
          .map(k => { console.log('[SW] Deleting old cache:', k); return caches.delete(k); })
      )
    ).then(() => self.clients.claim())
  );
});

/* ── FETCH ─────────────────────────────────────────────────── */
self.addEventListener('fetch', evt => {
  const { request } = evt;
  const url = new URL(request.url);

  /* Skip non-GET, non-http, and auth'd requests */
  if (request.method !== 'GET') return;
  if (!url.protocol.startsWith('http')) return;
  if (request.headers.get('Authorization')) return;

  /* WebSocket upgrades — never intercept */
  if (request.headers.get('Upgrade') === 'websocket') return;

  /* Never-cache: admin routes */
  if (url.pathname.startsWith('/api/admin/')) return;

  /* NETWORK FIRST — live API */
  if (NETWORK_FIRST_PATTERNS.some(p => p.test(url.pathname))) {
    evt.respondWith(
      fetch(request)
        .then(resp => {
          if (resp.ok) {
            const clone = resp.clone();
            caches.open(CACHE_NAME).then(c => c.put(request, clone));
          }
          return resp;
        })
        .catch(() => caches.match(request))   // offline fallback
    );
    return;
  }

  /* CACHE THEN NET — near-static API */
  if (CACHE_THEN_NET_PATTERNS.some(p => p.test(url.pathname))) {
    evt.respondWith(
      caches.open(CACHE_NAME).then(cache =>
        cache.match(request).then(cached => {
          const netFetch = fetch(request).then(resp => {
            if (resp.ok) cache.put(request, resp.clone());
            return resp;
          });
          return cached || netFetch;
        })
      )
    );
    return;
  }

  /* CACHE FIRST — shell, fonts, CDN assets */
  evt.respondWith(
    caches.open(CACHE_NAME).then(cache =>
      cache.match(request).then(cached => {
        if (cached) return cached;
        return fetch(request).then(resp => {
          /* Cache successful cross-origin + same-origin GET responses */
          if (resp.ok || resp.type === 'opaque') {
            cache.put(request, resp.clone());
          }
          return resp;
        }).catch(() => {
          /* Full offline: return cached shell for navigation requests */
          if (request.mode === 'navigate') {
            return cache.match('/') || cache.match('/index.html');
          }
          return new Response('Offline', { status: 503 });
        });
      })
    )
  );
});

/* ── MESSAGE: force cache clear ────────────────────────────── */
self.addEventListener('message', evt => {
  if (evt.data === 'SKIP_WAITING') self.skipWaiting();
  if (evt.data === 'CLEAR_CACHE') {
    caches.delete(CACHE_NAME).then(() =>
      evt.source?.postMessage({ type: 'CACHE_CLEARED' })
    );
  }
});
`;

  /* Blob URL for the SW — no sw.js file needed on disk */
  const blob = new Blob([SW_SRC], { type: 'application/javascript' });
  const swURL = URL.createObjectURL(blob);

  window.addEventListener('load', () => {
    if (location.protocol === 'file:') { URL.revokeObjectURL(swURL); return; }

    function _registerSW(url) {
      return navigator.serviceWorker.register(url, { scope: '/' });
    }

    // Try blob URL first — skip entirely if browser rejects both blob and data: URLs
    _registerSW(swURL).catch(() => {
      URL.revokeObjectURL(swURL);
      // Some environments reject blob: — skip SW silently, app works offline via localStorage
      return null;
    }).then(reg => {
        if (!reg) return;
        console.log('[SW] Registered, scope:', reg.scope);

        reg.addEventListener('updatefound', () => {
          const nw = reg.installing;
          nw.addEventListener('statechange', () => {
            if (nw.state === 'installed' && navigator.serviceWorker.controller) {
              console.log('[SW] New version ready — applying on next reload');
              nw.postMessage('SKIP_WAITING');
            }
          });
        });

        /* Notify app when SW takes control */
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          console.log('[SW] Controller changed — cache active');
        });
      })
      .catch(e => {
        console.warn('[SW] Registration failed (blob URL may need HTTPS or localhost):', e.message);
        /* Fallback: try registering a tiny inline data: URI SW */
        const minimal = `data:application/javascript,self.addEventListener('fetch',()=>{})`;
        navigator.serviceWorker.register(minimal, { scope: '/' }).catch(() => {});
      });
  });

  /* Expose cache-clear helper for settings panel */
  window.erosClearCache = function () {
    if (navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage('CLEAR_CACHE');
      console.log('[SW] Cache clear requested');
    }
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k.startsWith('eravos-')).map(k => caches.delete(k)))
    ).then(() => console.log('[SW] All Eravos caches cleared'));
  };
})();


/* ==== next inline <script> block ==== */


(function(global) {
'use strict';

const OLLAMA_CFG_KEY = 'eravos_ollama_bridge_cfg';
const ICE = { iceServers:[
  {urls:'stun:stun.l.google.com:19302'},{urls:'stun:stun1.l.google.com:19302'},
  {urls:'turn:openrelay.metered.ca:80',username:'openrelayproject',credential:'openrelayproject'},
  {urls:'turn:openrelay.metered.ca:443',username:'openrelayproject',credential:'openrelayproject'},
]};

let _peer=null,_conn=null,_models=[],_activeModel='',_reqId=0;
let _pending=new Map(),_listeners={},_streamBuf='';
let _panelEl=null,_pingTime=0;
const _panelStatus={};
const _cfg={endpointId:''};

function on(evt,fn){(_listeners[evt]=_listeners[evt]||[]).push(fn);}
function off(evt,fn){_listeners[evt]=(_listeners[evt]||[]).filter(f=>f!==fn);}
function emit(evt,data){(_listeners[evt]||[]).forEach(f=>f(data));}

function loadCfg(){
  try{
    const c=JSON.parse(localStorage.getItem(OLLAMA_CFG_KEY)||'{}');
    if(c.endpointId)_cfg.endpointId=c.endpointId;
    if(c.model)_activeModel=c.model;
  }catch(e){}
}
function saveCfg(){
  localStorage.setItem(OLLAMA_CFG_KEY,JSON.stringify({endpointId:_cfg.endpointId,model:_activeModel}));
}

function initPeer(cb){
  if(typeof Peer==='undefined'){emit('ob_error',{msg:'PeerJS not loaded'});return;}
  if(_peer&&!_peer.destroyed){if(cb)cb();return;}
  const myId='ERAVOS-BRIDGE-'+Date.now().toString(36).toUpperCase().slice(-6);
  _peer=new Peer(myId,{host:'0.peerjs.com',port:443,secure:true,path:'/',debug:0,config:ICE});
  _peer.on('open',id=>{emit('ob_peer_ready',{id});_updateStatus({peer:'Online'});if(cb)cb();});
  _peer.on('error',e=>{emit('ob_error',{msg:'Peer: '+e.type});_updateStatus({peer:'Error: '+e.type});});
  _peer.on('disconnected',()=>{_updateStatus({peer:'Reconnecting…'});if(_peer&&!_peer.destroyed)setTimeout(()=>_peer.reconnect(),2000);});
}

function connect(endpointId){
  endpointId=(endpointId||_cfg.endpointId).trim().toUpperCase();
  if(!endpointId){emit('ob_error',{msg:'No endpoint ID'});return Promise.reject(new Error('No endpoint ID'));}
  _cfg.endpointId=endpointId;saveCfg();
  return new Promise((resolve,reject)=>{
    initPeer(()=>{
      if(_conn&&_conn.open){resolve(_conn);return;}
      _updateStatus({endpoint:'Connecting…'});
      emit('ob_connecting',{to:endpointId});
      _conn=_peer.connect(endpointId,{reliable:true,serialization:'json'});
      _conn.on('open',()=>{
        _updateStatus({endpoint:'Connected'});
        emit('ob_connected',{to:endpointId});
        _conn.send({cmd:'ep_list_models'});
        resolve(_conn);
        _updateOllamaEngineUI(true);
      });
      _conn.on('data',_handleData);
      _conn.on('close',()=>{_conn=null;_updateStatus({endpoint:'Disconnected'});emit('ob_disconnected',{});_updateOllamaEngineUI(false);});
      _conn.on('error',e=>{_conn=null;_updateStatus({endpoint:'Error'});emit('ob_error',{msg:'Conn: '+e.message});reject(e);});
    });
  });
}

function disconnect(){
  if(_conn){try{_conn.close();}catch(e){}_conn=null;}
  _updateStatus({endpoint:'Disconnected'});
  emit('ob_disconnected',{});
  _updateOllamaEngineUI(false);
}

function _handleData(msg){
  if(!msg?.cmd)return;
  if(msg.cmd==='ep_hello'||msg.cmd==='ep_models'){
    const models=msg.models||[];
    _models=models.map(n=>typeof n==='string'?{name:n}:n);
    if(msg.defaultModel&&!_activeModel){_activeModel=msg.defaultModel;saveCfg();}
    emit('ob_models',{models:_models,default:msg.defaultModel});
    _updateStatus({ollama:'Online',model:_activeModel||msg.defaultModel||''});
    _refreshPanelModels();
    _refreshOllamaModelSelect();
  }
  if(msg.cmd==='ep_pong'){
    const lat=Date.now()-_pingTime;
    emit('ob_pong',{ollamaOk:msg.ollamaOk,ts:msg.ts,lat});
    _updateStatus({ollama:msg.ollamaOk?'Online':'Offline',latency:lat+'ms'});
  }
  if(msg.cmd==='ollama_response'){
    const req=_pending.get(msg.reqId);
    if(req){_pending.delete(msg.reqId);req.resolve(msg.data);}
  }
  if(msg.cmd==='ollama_stream_chunk'){
    const req=_pending.get(msg.reqId);
    if(req?.streaming){
      msg.chunk.split('\n').filter(Boolean).forEach(line=>{
        try{
          const p=JSON.parse(line);
          const tok=p.response??p.message?.content??'';
          if(tok){_streamBuf+=tok;if(req.onChunk)req.onChunk(tok,_streamBuf);}
        }catch(e){}
      });
    }
  }
  if(msg.cmd==='ollama_stream_done'){
    const req=_pending.get(msg.reqId);
    if(req){_pending.delete(msg.reqId);req.resolve(_streamBuf);_streamBuf='';}
  }
  if(msg.cmd==='ollama_error'){
    const req=_pending.get(msg.reqId);
    if(req){_pending.delete(msg.reqId);req.reject(new Error(msg.error));_streamBuf='';}
  }
}

function _send(method,path,body,stream,onChunk){
  return new Promise((resolve,reject)=>{
    if(!_conn?.open){reject(new Error('Ollama not connected'));return;}
    const reqId=++_reqId;
    _pending.set(reqId,{resolve,reject,streaming:stream,onChunk});
    _conn.send({cmd:'ollama_request',reqId,method,path,body,stream,model:body?.model||_activeModel});
    setTimeout(()=>{
      if(_pending.has(reqId)){_pending.delete(reqId);_streamBuf='';reject(new Error('Ollama timeout'));}
    },120000);
  });
}

async function generate(opts={}){
  const{model,prompt,stream=false,onChunk,...rest}=opts;
  const m=model||_activeModel;
  if(!m)throw new Error('No Ollama model selected');
  const body={model:m,prompt,stream,...rest};
  const data=await _send('POST','/api/generate',body,stream,onChunk);
  if(stream)return data;
  return data?.response??data;
}

async function chat(opts={}){
  const{model,messages,stream=false,onChunk,...rest}=opts;
  const m=model||_activeModel;
  if(!m)throw new Error('No Ollama model selected');
  const body={model:m,messages,stream,...rest};
  const data=await _send('POST','/api/chat',body,stream,onChunk);
  if(stream)return data;
  return data?.message?.content??data?.response??data;
}

async function request(method,path,body){
  return _send(method,path,body,false,null);
}

async function listModels(){
  if(!_conn?.open)throw new Error('Ollama not connected');
  return new Promise(resolve=>{
    const handler=({models})=>{off('ob_models',handler);resolve(models);};
    on('ob_models',handler);
    _conn.send({cmd:'ep_list_models'});
    setTimeout(()=>{off('ob_models',handler);resolve(_models);},5000);
  });
}

function setModel(name){_activeModel=name;emit('ob_model_changed',{model:name});_updateStatus({model:name});saveCfg();}
function getModel(){return _activeModel;}
function getModels(){return _models;}
function isConnected(){return!!(_conn?.open);}

// ── Update AI engine UI when Ollama connects/disconnects ──────
function _updateOllamaEngineUI(connected){
  const badge=document.getElementById('ai-engine-ollama-badge');
  const indicator=document.getElementById('ollama-active-indicator');
  if(badge){badge.style.display=connected?'inline-flex':'none';badge.textContent='⚡ Ollama: '+(_activeModel||'connected');}
  if(indicator)indicator.style.display=connected?'block':'none';
  // Update engine select
  const sel=document.getElementById('ai-engine-select');
  if(sel&&connected){
    // Make sure ollama option exists
    if(!sel.querySelector('[value="ollama"]')){
      const opt=document.createElement('option');
      opt.value='ollama';opt.textContent='⚡ Ollama (local VM)';
      sel.appendChild(opt);
    }
  }
}

function _refreshOllamaModelSelect(){
  // Refresh the dedicated ollama model selector in settings
  const sel=document.getElementById('ollama-model-select');
  if(!sel)return;
  const prev=sel.value||_activeModel;
  sel.innerHTML='<option value="">— Select model —</option>'+
    _models.map(m=>`<option value="${m.name||m}"${(m.name||m)===prev?' selected':''}>${m.name||m}</option>`).join('');
  if(_activeModel)sel.value=_activeModel;
  // Also update engine select active model label
  const badge=document.getElementById('ai-engine-ollama-badge');
  if(badge&&_activeModel)badge.textContent='⚡ Ollama: '+_activeModel;
}

// ── Panel render ──────────────────────────────────────────────
function _refreshPanelModels(){
  const sel=document.getElementById('ob-model-sel');
  if(!sel)return;
  const prev=sel.value||_activeModel;
  sel.innerHTML='<option value="">— Select model —</option>'+
    _models.map(m=>`<option value="${m.name||m}"${(m.name||m)===prev?' selected':''}>${m.name||m}</option>`).join('');
  if(_activeModel)sel.value=_activeModel;
}

function _setPanelConn(on_){
  const dot=document.getElementById('ob-conn-dot');
  const lbl=document.getElementById('ob-conn-label');
  const btnC=document.getElementById('ob-btn-connect');
  const btnD=document.getElementById('ob-btn-disc');
  if(dot)dot.className='ob-dot '+(on_?'ok':'');
  if(lbl){lbl.textContent=on_?'Connected':'Disconnected';lbl.style.color=on_?'#00ff88':'rgba(255,238,221,.2)';}
  if(btnC)btnC.style.display=on_?'none':'';
  if(btnD)btnD.style.display=on_?'':'none';
}

function _updateStatus(updates){
  Object.assign(_panelStatus,updates);
  const map={peer:'ob-st-peer',endpoint:'ob-st-ep',ollama:'ob-st-ollama',model:'ob-st-model',latency:'ob-st-lat'};
  Object.entries(updates).forEach(([k,v])=>{
    const el=document.getElementById(map[k]);if(el)el.textContent=v||'—';
  });
}

function _panelConnect(){
  const inp=document.getElementById('ob-ep-id');
  const id=inp?inp.value.trim().toUpperCase():'';
  if(!id){return;}
  connect(id).then(()=>{_setPanelConn(true);}).catch(e=>console.warn('[OllamaBridge]',e.message));
}

function _panelPing(){
  if(!_conn?.open)return;
  _pingTime=Date.now();
  _conn.send({cmd:'ep_ping'});
  const unsub=(data)=>{
    const el=document.getElementById('ob-st-lat');
    if(el)el.textContent=data.lat+'ms';
    off('ob_pong',unsub);
  };
  on('ob_pong',unsub);
}

// Wire events for panel
on('ob_peer_ready',()=>{const el=document.getElementById('ob-st-peer');if(el){el.textContent='Online';el.style.color='var(--teal)';}});
on('ob_connected',()=>{_setPanelConn(true);const el=document.getElementById('ob-st-ep');if(el){el.textContent='Connected';el.style.color='var(--teal)';}});
on('ob_disconnected',()=>{_setPanelConn(false);const el=document.getElementById('ob-st-ep');if(el){el.textContent='Disconnected';el.style.color='var(--dim)';}});
on('ob_pong',({ollamaOk})=>{const el=document.getElementById('ob-st-ollama');if(el){el.textContent=ollamaOk?'Online':'Offline';el.style.color=ollamaOk?'var(--teal)':'var(--rose)';}});
on('ob_model_changed',({model})=>{const el=document.getElementById('ob-st-model');if(el)el.textContent=model||'—';const sel=document.getElementById('ob-model-sel');if(sel&&model)sel.value=model;_refreshOllamaModelSelect();});

// Auto-init on load
loadCfg();

global.OllamaBridge={connect,disconnect,on,off,initPeer,setModel,getModel,getModels,isConnected,_panelConnect,_panelPing,_refreshPanelModels,_updateStatus,loadCfg,saveCfg,get connected(){return!!_conn?.open;},get models(){return _models;}};
global.OllamaClient={generate,chat,request,listModels,setModel,getModel,isConnected};

})(window);


/* ==== next inline <script> block ==== */


// ═══════════════════════════════════════════════════════════════════
// SISO CORE
// ═══════════════════════════════════════════════════════════════════
class SEvent { constructor(type,data={}){this.type=type;this.data=data;this.id=Math.random().toString(36).slice(2);this.ts=Date.now()} }
class Gate { constructor(sig){this.signature=sig} transform(ev,s){} }
class Stream {
  constructor(){this.gates=new Map();this.pending=[];this.eventCount=0;this.listeners=[]}
  register(g){if(this.gates.has(g.signature))throw new Error(`Collision: ${g.signature}`);this.gates.set(g.signature,g)}
  emit(ev){this.eventCount++;const g=this.gates.get(ev.type);this.listeners.forEach(l=>l(ev,!!g));if(g)g.transform(ev,this);else this.pending.push(ev)}
  onEmit(fn){this.listeners.push(fn)}
}
const appStream = new Stream();

// ═══════════════════════════════════════════════════════════════════
// CONNECTION LAYER — event-driven, not always-on. initRTC() used to
// fire unconditionally 800ms after every login, solo or duo. Now it
// only runs in response to two real events: logging in while already
// in duo mode, or switching into duo mode. Leaving duo mode tears the
// connection down instead of leaving it dangling. This is the exact
// trigger shape a kern-based mesh node would sit behind later — same
// two events, kern's node.start()/stop() in place of initRTC/
// disconnectPartner (§5.14 — every layer is replaceable).
// ═══════════════════════════════════════════════════════════════════
appStream.register(new (class extends Gate {
  constructor() { super('auth:login'); }
  transform(ev, stream) {
    // Was: only connected on login if already in duo mode — meaning the
    // "quiet ask on login" scenario (partner happens to be reachable
    // while you're in solo mode) could never fire; nothing detected
    // presence to ask about. Now attempts a background connection
    // regardless of mode. This never switches mode itself — only
    // _onPartnerOnline's dismissible popup (§ below) can lead to duo,
    // and only if the person taps "Start Session."
    //
    // initRTC() used to be this whole trigger. It's calling-only now;
    // initMesh() is the actual data-sync connection (Co-Creation) — both
    // need to fire here, or the mesh never starts at all. Found by
    // tracing why nothing connected: this gate still only called the
    // slimmed-down initRTC(), so the wire that used to start data sync
    // silently stopped starting anything.
    setTimeout(() => { initRTC(); initMesh(); }, 800);
  }
})());

appStream.register(new (class extends Gate {
  constructor() { super('mode:toggle'); }
  transform(ev, stream) {
    const { mode, prev } = ev.data;
    if (mode === 'duo' && prev !== 'duo') {
      initRTC();
      initMesh();
    } else if (mode !== 'duo' && prev === 'duo') {
      disconnectPartner();
    }
  }
})());

// ═══════════════════════════════════════════════════════════════════
// CROSS-TAB REQUESTS — sovereign tabs ask for another tab's service
// through an event, not by calling its functions directly (§5.9/§5.10 —
// every system is sovereign, interaction through contracts only). A
// tab that wants Oracle or Poetry to run on its behalf emits one of
// these instead of importing/calling consultOracle()/generatePoem()
// by name. This also fixes a real bug the old direct-call pattern had:
// generatePoem() throws if Poetry was never mounted this session —
// these gates mount the target tab first.
// ═══════════════════════════════════════════════════════════════════
appStream.register(new (class extends Gate {
  constructor() { super('oracle:seed_requested'); }
  transform(ev, stream) {
    const { seed } = ev.data;
    (async () => {
      await eravosStampTab('oracle');
      switchTab('oracle');
      const el = document.getElementById('oracle-input');
      if (el) el.value = seed;
      if (typeof consultOracle === 'function') await consultOracle();
    })();
  }
})());

appStream.register(new (class extends Gate {
  constructor() { super('poetry:seed_requested'); }
  transform(ev, stream) {
    const { seed } = ev.data;
    (async () => {
      await eravosStampTab('poetry');
      switchTab('poetry');
      const el = document.getElementById('poem-theme');
      if (el) el.value = seed;
      if (typeof generatePoem === 'function') await generatePoem();
    })();
  }
})());

appStream.register(new (class extends Gate {
  constructor() { super('growth:seed_requested'); }
  transform(ev, stream) {
    const { what, why, cat } = ev.data;
    (async () => {
      await eravosStampTab('growth');
      switchTab('growth');
      setTimeout(() => {
        // openGrowthForm() removed -- the real form is always visible
        // now (see growth.html's own real rebuild), no toggle to open.
        const whatEl = document.getElementById('grow-what');
        const whyEl = document.getElementById('grow-why');
        const catEl = document.getElementById('grow-cat');
        if (whatEl && !whatEl.value) whatEl.value = what;
        if (whyEl && !whyEl.value) whyEl.value = why;
        if (catEl && cat && !catEl.value) catEl.value = cat;
        whatEl?.focus();
      }, 50);
    })();
  }
})());

// ═══════════════════════════════════════════════════════════════════
// TABS
// ═══════════════════════════════════════════════════════════════════
const TAB_NAMES=['oracle','feelings','relational','rupture','growth','triggers','commitments','struggles','ideas','poetry','rituals','cocreate','codex','mythos','mutator','music','canvas','vault','settings','sparring','call','console','needs','planner','lattice','meaning','roadmap','sc-space','sc-projects','sc-ideas','sc-vault','sc-threads','sc-people','sc-nodes'];

const TAB_CATEGORY = {
  oracle:'relational', feelings:'relational', relational:'relational',
  rupture:'relational', sparring:'relational', growth:'relational', triggers:'relational', commitments:'relational', struggles:'relational',
  call:'communication', chat:'communication', voice:'communication',
  needs:'communication', planner:'communication',
  poetry:'creating', canvas:'creating', mutator:'creating', meaning:'creating',
  mythos:'creating', rituals:'creating', music:'creating',
  cocreate:'creating', ideas:'creating',
  codex:'space', vault:'space', lattice:'space',
  settings:'system', roadmap:'system', console:'system',
};

const CATEGORY_DEFAULT = {
  relational:'oracle', communication:'call',
  creating:'poetry', space:'codex', system:'settings', community:'sc-space'
};

function switchCategory(cat) {
  document.querySelectorAll('.cat-btn').forEach(b=>b.classList.remove('active'));
  const catBtn = document.getElementById('cat-'+cat);
  if(catBtn) catBtn.classList.add('active');
  document.querySelectorAll('.subtab-row').forEach(r=>r.style.display='none');
  const row = document.getElementById('subtabs-'+cat);
  if(row) row.style.display='flex';
  switchTab(CATEGORY_DEFAULT[cat] || 'oracle');
}

function switchTab(name){
  // Real guard, not just button hiding. Button visibility alone is cosmetic
  // and bypassable by calling this directly — the same reasoning the settings
  // admin gate already used.
  if (typeof eravosFeatures !== 'undefined' && eravosFeatures) {
    const g = eravosFeatures.allowTab(name);
    if (!g.allowed) {
      if (typeof showToast === 'function') showToast(g.label + ' is off — ' + g.reason);
      return;
    }
  }
  if (name === 'console') {
    const isAdmin = S.user?.role === 'admin' || S.user?.isAdmin;
    if (!isAdmin) {
      if (typeof showToast === 'function') showToast('🔐 Admin only');
      name = 'roadmap';
    }
  }
  document.querySelectorAll('.tab').forEach((t,i)=>t.classList.toggle('active',TAB_NAMES[i]===name));
  document.querySelectorAll('.subtab').forEach(st=>{
    const fn = st.getAttribute('onclick')||'';
    st.classList.toggle('active', fn.includes("'"+name+"'"));
  });
  const cat = TAB_CATEGORY[name];
  if(cat) {
    document.querySelectorAll('.cat-btn').forEach(b=>b.classList.remove('active'));
    const catBtn = document.getElementById('cat-'+cat);
    if(catBtn) catBtn.classList.add('active');
    document.querySelectorAll('.subtab-row').forEach(r=>r.style.display='none');
    const row = document.getElementById('subtabs-'+cat);
    if(row) row.style.display='flex';
  }
  document.querySelectorAll('.panel').forEach(p=>p.classList.remove('active'));
  const panel=document.getElementById('panel-'+name);
  if(panel)panel.classList.add('active');
  // Was: no scroll reset at all here. The page scrolls at the
  // window/document level (no overflow container on #app or body), so
  // switching from a long-scrolled tab to a shorter one left the new
  // tab rendered starting mid-scroll or even past its own bottom —
  // "pages sometimes stick to the bottom of pages they shouldn't."
  // Confirmed by inspection (no reset existed anywhere in this
  // function) before fixing, not assumed.
  window.scrollTo(0, 0);
  appStream.emit(new SEvent('tab:switch',{tab:name}));
}

// ═══════════════════════════════════════════════════════════════════
// LOG
// ═══════════════════════════════════════════════════════════════════
const logEntries=[];
function log(msg,level='info'){
  const ts=new Date().toLocaleTimeString();logEntries.push({ts,msg,level});
  const box=document.getElementById('console-log');
  if(box){const sp=document.createElement('span');sp.className=`log-${level}`;sp.textContent=`[${ts}] ${msg}`;box.appendChild(sp);box.appendChild(document.createElement('br'));box.scrollTop=box.scrollHeight}
}
function logToStream(msg){const box=document.getElementById('stream-events');if(!box)return;const sp=document.createElement('span');sp.style.color='var(--dim)';sp.textContent=msg;box.appendChild(sp);box.appendChild(document.createElement('br'));box.scrollTop=box.scrollHeight;if(box.children.length>100)box.removeChild(box.firstChild)}
function clearLog(){document.getElementById('console-log').innerHTML='';logEntries.length=0}
function exportLog(){const blob=new Blob([logEntries.map(e=>`[${e.ts}][${e.level.toUpperCase()}] ${e.msg}`).join('\n')],{type:'text/plain'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`log-${Date.now()}.txt`;a.click()}

appStream.onEmit((ev,claimed)=>logToStream(`[${new Date(ev.ts).toLocaleTimeString()}] ${ev.type} ${claimed?'✓':'→ pending'}`));

// ═══════════════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════════
// DB — IndexedDB primary store, localStorage sync mirror
// DB.get / DB.set remain synchronous (uses LS mirror) so all
// existing app code works unchanged.
// DB.idbGet / DB.idbSet are async for large blobs / history.
// DB.onChange(fn) — subscribe to any write (used for auto-cloud-sync)
// ═══════════════════════════════════════════════════════════════════
const DB = (() => {
  const STORE = 'eros_kv';
  const DB_NAME = 'Eravos';
  const DB_VER  = 1;
  let _idb = null;
  let _listeners = [];
  let _ready = false;
  let _queue = [];

  // Open IndexedDB
  function openIDB() {
    return new Promise((res, rej) => {
      const req = indexedDB.open(DB_NAME, DB_VER);
      req.onupgradeneeded = e => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE);
        }
      };
      req.onsuccess  = e => res(e.target.result);
      req.onerror    = e => rej(e.target.error);
    });
  }

  openIDB().then(db => {
    _idb = db;
    _ready = true;
    // Drain pending idb writes
    _queue.forEach(fn => fn());
    _queue = [];
    // Mirror all localStorage keys into IDB on first open
    _mirrorLS();
  }).catch(e => console.warn('[DB] IndexedDB unavailable, using localStorage only:', e));

  function _mirrorLS() {
    if (!_idb) return;
    const tx = _idb.transaction(STORE, 'readwrite');
    const st = tx.objectStore(STORE);
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('eravors_') || k === 'claude_key' || k === 'claude_model') {
        try {
          const v = localStorage.getItem(k);
          if (v !== null) st.put(v, k);
        } catch(e) {}
      }
    }
  }

  function _notify(k, v) {
    _listeners.forEach(fn => { try { fn(k, v); } catch(e) {} });
  }

  return {
    // ── Synchronous (localStorage mirror) ────────────────────────
    get(k, def = null) {
      try {
        const v = localStorage.getItem(k);
        return v != null ? JSON.parse(v) : def;
      } catch { return def; }
    },

    set(k, v) {
      try {
        const str = JSON.stringify(v);
        localStorage.setItem(k, str);
        // Mirror to IDB async
        if (_idb) {
          try {
            const tx = _idb.transaction(STORE, 'readwrite');
            tx.objectStore(STORE).put(str, k);
          } catch(e) {}
        } else {
          _queue.push(() => {
            try {
              const tx = _idb.transaction(STORE, 'readwrite');
              tx.objectStore(STORE).put(str, k);
            } catch(e) {}
          });
        }
        _notify(k, v);
        return true;
      } catch(e) {
        // Was a bare catch(e){} — every write failure (quota exceeded
        // being the realistic one here; localStorage is usually 5-10MB
        // per origin, and this app now persists a lot: full spar
        // transcripts, codex, vault, trigger maps, growth/rupture logs,
        // all uncapped or capped only at 100 entries each) vanished
        // silently. The caller got no signal, so "Feeling logged"
        // showed whether or not anything actually reached disk — the
        // literal shape of "the disk isn't saving feelings." §1.2:
        // nothing pretends to work. Loud now; callers that care about
        // the result can check the return value.
        const isQuota = e && (e.name === 'QuotaExceededError' || e.code === 22);
        log(`[DB] write to "${k}" failed${isQuota ? ' — storage quota exceeded' : ''}: ${e.message}`, 'error');
        console.error('[DB] set() failed for key', k, e);
        return false;
      }
    },

    del(k) {
      try {
        localStorage.removeItem(k);
        if (_idb) {
          try {
            const tx = _idb.transaction(STORE, 'readwrite');
            tx.objectStore(STORE).delete(k);
          } catch(e) {}
        }
        _notify(k, undefined);
      } catch(e) {}
    },

    // ── Async IDB (for large data, returns Promise) ───────────────
    async idbGet(k, def = null) {
      if (!_idb) return this.get(k, def);
      return new Promise((res) => {
        try {
          const tx = _idb.transaction(STORE, 'readonly');
          const req = tx.objectStore(STORE).get(k);
          req.onsuccess = () => {
            try { res(req.result != null ? JSON.parse(req.result) : def); }
            catch { res(def); }
          };
          req.onerror = () => res(def);
        } catch { res(def); }
      });
    },

    async idbSet(k, v) {
      const str = JSON.stringify(v);
      localStorage.setItem(k, str);
      if (!_idb) return;
      return new Promise((res) => {
        try {
          const tx = _idb.transaction(STORE, 'readwrite');
          tx.objectStore(STORE).put(str, k);
          tx.oncomplete = () => res();
          tx.onerror    = () => res();
        } catch { res(); }
      });
    },

    // ── Export ALL keys from IDB (complete snapshot) ─────────────
    async snapshot() {
      const out = {};
      if (!_idb) {
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          try { out[k] = JSON.parse(localStorage.getItem(k)); } catch {}
        }
        return out;
      }
      return new Promise((res) => {
        const tx = _idb.transaction(STORE, 'readonly');
        const req = tx.objectStore(STORE).openCursor();
        req.onsuccess = e => {
          const cursor = e.target.result;
          if (cursor) {
            try { out[cursor.key] = JSON.parse(cursor.value); } catch {}
            cursor.continue();
          } else {
            res(out);
          }
        };
        req.onerror = () => res(out);
      });
    },

    // ── Restore from a snapshot object ───────────────────────────
    async restore(snap) {
      if (!snap || typeof snap !== 'object') return 0;
      let count = 0;
      for (const [k, v] of Object.entries(snap)) {
        if (k.startsWith('_')) continue;
        await this.idbSet(k, v);
        count++;
      }
      return count;
    },

    // ── Subscribe to writes ───────────────────────────────────────
    onChange(fn) { _listeners.push(fn); },

    // ── Storage usage estimate ────────────────────────────────────
    async usage() {
      if (navigator.storage && navigator.storage.estimate) {
        const e = await navigator.storage.estimate();
        return { used: e.usage, quota: e.quota,
                 pct: Math.round((e.usage / e.quota) * 100) };
      }
      return null;
    },

    // ── Persist storage (request durable storage) ─────────────────
    async persist() {
      if (navigator.storage && navigator.storage.persist) {
        const granted = await navigator.storage.persist();
        return granted;
      }
      return false;
    },

    isReady() { return _ready; },

    /** Real, needed for deleteMyAccount()'s full reset: indexedDB.deleteDatabase()
        cannot complete while any connection to it stays open, including this
        page's own -- found directly, not assumed, when a real reset test left
        the database still present afterward. */
    close() {
      if (_idb) { try { _idb.close(); } catch (e) {} _idb = null; _ready = false; }
    }
  };
})();
// DB was never exposed on window -- found by tracing why new Safety({...})
// (further down, ~line 5037) threw "no storage available" even though DB
// genuinely works: eravos-safety.js checks global.DB (global === window,
// via its own UMD wrapper), which was always undefined since only the
// bare `DB` identifier existed, script-scoped to this file. That throw,
// originating from code THIS script calls, halted every top-level
// statement after it -- eravosChoice's construction, OB_DATA, _activeToasts
// (before it was hoisted above this point), eravosPairing, all downstream
// of a single missing line.
if (typeof window !== 'undefined') window.DB = DB;

// Request persistent storage on load so browser won't evict data
DB.persist().then(ok => { if (ok) /* storage granted — silent */; });

// ── Backup & Restore ──────────────────────────────────────────────
// DB.snapshot()/DB.restore() already existed — nothing called them.
// "Data keeps getting lost" is almost always a storage-origin change
// (different port, different host) rather than real loss: IndexedDB
// and localStorage are both scoped to the exact origin, so serving the
// same folder from a different port is, to the browser, a completely
// different storage bucket. This is the real mitigation — export
// before switching how you host it, import after.
async function exportFullBackup() {
  const status = document.getElementById('backup-status');
  try {
    const snap = await DB.snapshot();
    const payload = {
      exportedAt: new Date().toISOString(),
      exportedBy: S.dbPrefix || 'solo',
      origin: location.origin,
      data: snap
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `eravos-backup-${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    if (status) { status.textContent = '✓ Backup downloaded'; setTimeout(() => status.textContent = '', 3500); }
    log('Backup exported', 'ok');
  } catch (e) {
    if (status) status.textContent = '⚠ Export failed: ' + e.message;
    log('Backup export failed: ' + e.message, 'error');
  }
}

async function importFullBackup(input) {
  const file = input.files[0];
  if (!file) return;
  const status = document.getElementById('backup-status');
  try {
    const text = await file.text();
    const parsed = JSON.parse(text);
    const snap = parsed && parsed.data ? parsed.data : parsed; // accept a raw snapshot too
    const count = await DB.restore(snap);
    if (status) status.textContent = `✓ Restored ${count} item(s) — reloading...`;
    log(`Backup restored: ${count} items`, 'ok');
    setTimeout(() => location.reload(), 1200);
  } catch (e) {
    if (status) status.textContent = '⚠ Import failed: ' + e.message;
    log('Backup import failed: ' + e.message, 'error');
  }
  input.value = '';
}


// ═══════════════════════════════════════════════════════════════════
// CONTAINED ACCOUNTS — pre-seeded, self-contained, no registration needed
// ═══════════════════════════════════════════════════════════════════
// ── CONTAINED ACCOUNTS — SHA-256 hashed, force-seeded on first load ──
// Account hashes pre-computed — credentials never in plaintext
(function seedContainedAccounts(){
  const jHash = '1d57231c3c07a972dedf1a073b4eaeca80c1043280243f3979aab4fa36e4df9c';
  const rHash = '7f942b6702ad4e583ef3c1a793d9c8e8bcb9acadd51fbcc45468f3247f418145';
  const existing = DB.get('eravors_users', {});
  // Migrate legacy djb2 hashes if present
  // Legacy djb2 -> SHA-256 migration. Keyed by the OLD HASH VALUE, not by a
  // person's name: naming an account here is what made the partner slot
  // un-renameable in the first place. A renamed account still migrates.
  var LEGACY_HASHES = { '792847702': jHash, '1764240011': rHash };
  for (var _lk in existing) {
    var _lp = existing[_lk] && existing[_lk].password;
    if (_lp && LEGACY_HASHES[_lp]) existing[_lk].password = LEGACY_HASHES[_lp];
  }
  // Force-seed both accounts (preserve extra fields like avatar, theme overrides)
  existing['james'] = Object.assign({}, existing['james']||{}, {
    name:'James', email:'james', password:jHash,
    mode:'solo', theme:'', role:'admin',
    // Opaque by construction. `eravos-james-fixed` announced who made every
    // pairing code that carried it (found by test/pairing.test.mjs). Existing
    // installs keep whatever they have — migrating a peer id would break a
    // live pairing — but nothing new is minted with a name in it.
    peerId: DB.get('eravors_my_peer_id', null) || (() => {
      const id = 'eravos-' + Math.random().toString(36).slice(2,10) + Math.random().toString(36).slice(2,10);
      DB.set('eravors_my_peer_id', id);
      return id;
    })(), partnerId:null, created:1700000000000,
    dbPrefix:'james', isAdmin:true
  });
  // §5.3 ROOT CAUSE FIX. This block previously force-seeded the partner
  // account unconditionally on every page load:
  //     existing[<partner>] = Object.assign({}, existing[<partner>]||{}, {...});
  // which meant ANY rename made through the UI was silently reverted on the
  // next reload. The edit appeared to work and then quietly undid itself --
  // §1.2, a silent failure that corrupts state instead of crashing.
  //
  // The partner slot is now DATA, not a constant. It is seeded once, if and
  // only if no partner account exists at all. After that, shared/eravos-admin.js
  // is the single write authority for it (§10.1) and the seeder defers.
  // SOLO IS THE DEFAULT (v0.12.0). This block used to seed a partner account
  // whether or not one existed, so every install pretended to be a pair --
  // relational derivations ran against a person who was not there (§1.2, a
  // falsehood in the data, not just the UI).
  //
  // Nothing is seeded now. A partner account is created only when a real
  // person accepts an invite or scans a code (shared/eravos-pairing.js).
  DB.set('eravors_users', existing);
})();

// ── PARTNER SLOT — seeded ONCE, same "only if none exists" rule as above ──
// A real second account, requested directly (name: Anjali) rather than
// created through the register form, so it exists to log into right away.
// Hash pre-computed (SHA-256 of the real password), same convention as the
// james/raven seed above — the plaintext never sits in this file. This
// creates the ACCOUNT only. It deliberately does NOT fabricate a "paired"
// entry in eravos-pairing.js's own state — that would be exactly the
// falsified-connection anti-pattern this file's own history (see comment
// above) already found and removed once. Two accounts existing is not the
// same claim as two accounts having actually completed the QR handshake;
// that still happens for real, from the login screen or Settings ▸ Invite
// Partner, the same as it would for anyone else.
(function seedPartnerSlotOnce(){
  const existing = DB.get('eravors_users', {});
  const hasPartner = Object.values(existing).some(u => u && u.role === 'partner');
  if (hasPartner) return;
  // Real password's SHA-256 -- the plaintext does NOT belong in source, even
  // in a comment. A hash in a committed file is already a soft exposure (offline
  // brute-force is possible if this repo ever leaks); a comment naming the
  // plaintext right next to it defeats the hash entirely. If this needs
  // changing later, reset it from Settings > Admin > Account Access instead
  // of editing this file.
  const anjaliHash = '171abc3671eb8c7c7850fed2b91a38b385d17c32a4aaa129be12fbd14c728119';
  const peerId = 'eravos-' + Math.random().toString(36).slice(2,10) + Math.random().toString(36).slice(2,10);
  existing['anjali'] = {
    name: 'Anjali', email: 'anjali', password: anjaliHash,
    mode: 'duo', role: 'partner', peerId, partnerId: null,
    created: Date.now(), dbPrefix: 'anjali'
  };
  DB.set('eravors_users', existing);
  // Registration itself still defaults to CLOSED (see applyRegState) — that
  // default is deliberate and tested (test/registration.test.mjs), not a
  // bug. Turning it on here is the one-time equivalent of an admin flipping
  // the Settings ▸ Admin toggle, done once because an account was just
  // requested directly. It can be switched off again from that same panel.
  if (DB.get('eravors_reg_enabled', null) === null) DB.set('eravors_reg_enabled', true);
})();



// ═══════════════════════════════════════════════════════════════════
// FEELINGS SYSTEM
// ═══════════════════════════════════════════════════════════════════
const FEELINGS = [
  {emoji:'😍',name:'Adoration',body:'chest,warmth,expansion',color:'#ff69b4'},
  {emoji:'💝',name:'Love',body:'chest,heart,fullness',color:'#ff1493'},
  {emoji:'🔥',name:'Passion',body:'whole body,fire,aliveness',color:'#ff6a00'},
  {emoji:'😌',name:'Peace',body:'belly,stillness,ease',color:'#00e5cc'},
  {emoji:'🌊',name:'Longing',body:'chest,throat,ache',color:'#6495ed'},
  {emoji:'😢',name:'Grief',body:'chest,throat,heaviness',color:'#9370db'},
  {emoji:'😤',name:'Anger',body:'chest,shoulders,heat',color:'#ee0979'},
  {emoji:'😰',name:'Anxiety',body:'chest,belly,tightness',color:'#ffa500'},
  {emoji:'🤩',name:'Excitement',body:'whole body,electric,buzz',color:'#aaff00'},
  {emoji:'😔',name:'Sadness',body:'chest,shoulders,weight',color:'#7b8cb0'},
  {emoji:'💭',name:'Confusion',body:'head,fog,swirl',color:'#c9b1ff'},
  {emoji:'🌸',name:'Tenderness',body:'chest,hands,softness',color:'#ffb6c1'},
  {emoji:'⚡',name:'Electric',body:'whole body,spine,tingle',color:'#00f5ff'},
  {emoji:'🌑',name:'Numbness',body:'whole body,hollow,flat',color:'#666'},
  {emoji:'🦋',name:'Nervous Joy',body:'belly,flutters,fizz',color:'#f0e68c'},
  {emoji:'🌿',name:'Grounded',body:'legs,belly,roots',color:'#90ee90'},
  {emoji:'✨',name:'Inspired',body:'head,chest,expansive',color:'#ffd700'},
  {emoji:'🔮',name:'Mystical',body:'whole body,otherworldly',color:'#bf5fff'},

  // ── Expanded range (ERAVOS-SPEC-v1 02-DATA-SCHEMAS.md) ──────────────
  // Hard / heavy — the ones that are hardest to reach for, on purpose
  // named explicitly rather than left to "other."
  {emoji:'🍂',name:'Neglected',body:'chest,hollow,ache',color:'#8a7968'},
  {emoji:'💔',name:'Betrayed',body:'chest,gut,sharp',color:'#a3123a'},
  {emoji:'🔍',name:'Small',body:'whole body,shrinking,quiet',color:'#7a7a8c'},
  {emoji:'😳',name:'Ashamed',body:'face,chest,hot',color:'#8b3a5e'},
  {emoji:'🙈',name:'Humiliated',body:'face,whole body,burning',color:'#7a1f3d'},
  {emoji:'😒',name:'Resentful',body:'jaw,chest,tight',color:'#5c3a6e'},
  {emoji:'🏝',name:'Lonely',body:'chest,whole body,empty',color:'#4a6c8c'},
  {emoji:'🌊',name:'Overwhelmed',body:'head,chest,flooded',color:'#3a5a99'},
  {emoji:'😞',name:'Disappointed',body:'chest,shoulders,deflated',color:'#6b7a99'},
  {emoji:'❓',name:'Misunderstood',body:'chest,throat,stuck',color:'#8c7aa8'},
  {emoji:'🚫',name:'Dismissed',body:'chest,face,flat',color:'#6e6e7a'},
  {emoji:'👻',name:'Invisible',body:'whole body,thin,unseen',color:'#5e5e6e'},
  {emoji:'🔇',name:'Unheard',body:'throat,chest,pressure',color:'#54607a'},
  {emoji:'😣',name:'Guilty',body:'stomach,chest,knot',color:'#7a5c3a'},
  {emoji:'💚',name:'Jealous',body:'chest,gut,hot',color:'#3a7a4a'},
  {emoji:'🫣',name:'Insecure',body:'stomach,chest,shaky',color:'#8c6e8c'},
  {emoji:'🕳',name:'Abandoned',body:'chest,whole body,dropped',color:'#3a3a4e'},
  {emoji:'🚪',name:'Rejected',body:'chest,face,cold',color:'#5c2e4a'},
  {emoji:'⛓',name:'Powerless',body:'whole body,heavy,stuck',color:'#4a4a5c'},
  {emoji:'🙇',name:'Helpless',body:'chest,arms,limp',color:'#5a5a6c'},
  {emoji:'😑',name:'Contempt',body:'face,jaw,cold',color:'#4a5c4a'},
  {emoji:'🫠',name:'Embarrassed',body:'face,whole body,hot',color:'#c9789a'},
  {emoji:'🛡',name:'Defensive',body:'chest,shoulders,braced',color:'#6e5c4a'},
  {emoji:'🧵',name:'Torn',body:'chest,gut,pulled',color:'#7a6e8c'},
  {emoji:'🍋',name:'Envious',body:'chest,gut,sour',color:'#8c9a3a'},

  // ── Softer / underrepresented positive ───────────────────────────────
  {emoji:'🙏',name:'Gratitude',body:'chest,warmth,open',color:'#e8a94a'},
  {emoji:'😮‍💨',name:'Relief',body:'chest,shoulders,release',color:'#7ac9c0'},
  {emoji:'🍵',name:'Contentment',body:'belly,chest,settled',color:'#a8c98c'},
  {emoji:'🔎',name:'Curiosity',body:'head,chest,leaning-in',color:'#5fc9e8'},
  {emoji:'🌅',name:'Hope',body:'chest,eyes,lifting',color:'#f0a860'},
  {emoji:'🦁',name:'Pride',body:'chest,spine,tall',color:'#e88a3a'},
  {emoji:'🤝',name:'Trust',body:'chest,belly,settled',color:'#5ca8c9'},
  {emoji:'🛟',name:'Safe',body:'whole body,settled,warm',color:'#6ec98c'},
  {emoji:'🤲',name:'Held',body:'chest,whole body,supported',color:'#e8a0c9'},
  {emoji:'💎',name:'Cherished',body:'chest,warmth,glow',color:'#f0c0e0'},
  {emoji:'🎈',name:'Playful',body:'whole body,light,bouncy',color:'#f0e05a'},
  {emoji:'🕰',name:'Nostalgic',body:'chest,throat,bittersweet',color:'#b09a7a'},
  {emoji:'🌌',name:'Awe',body:'chest,whole body,expansive',color:'#7a5cc9'},

  // ── Neutral / liminal — often the hardest to name because they aren't
  // clearly positive or negative, just unsettled.
  {emoji:'⚖️',name:'Ambivalent',body:'chest,head,pulled two ways',color:'#8a8a9a'},
  {emoji:'🐾',name:'Restless',body:'legs,whole body,twitchy',color:'#c9a05a'},
  {emoji:'📴',name:'Apathetic',body:'whole body,flat,far away',color:'#7a7a7a'},
  {emoji:'🥱',name:'Bored',body:'head,whole body,slack',color:'#9a9a8a'},
  {emoji:'🍁',name:'Wistful',body:'chest,eyes,soft ache',color:'#c98a6e'},
  {emoji:'🌗',name:'Conflicted',body:'chest,head,split',color:'#8a7ac9'},
];

// ══════════════════════════════════════════════════════════════════
// PER-USER DB NAMESPACING
// Keys:  james_*   partner_*   shared_*
// S.dbPrefix = 'james' | <partner's key> | 'shared' (couple mode)
// ══════════════════════════════════════════════════════════════════
function _userKey(key) {
  const prefix = (S.dbPrefix || 'solo') + '_';
  return prefix + key;
}
function _sharedKey(key) { return 'shared_' + key; }

// Read: try user key first, fall back to legacy unprefixed (migration)
function dbGet(key, def) {
  const prefixed = DB.get(_userKey(key), null);
  if (prefixed !== null) return prefixed;
  const legacy = DB.get('eravors_' + key, null);
  return legacy !== null ? legacy : (def !== undefined ? def : null);
}
// Write: always write to prefixed key; in duo mode also write shared key
function dbSet(key, val) {
  DB.set(_userKey(key), val);
  if (S.mode === 'duo') DB.set(_sharedKey(key), val);
}
// Write to shared key only (couple data)
function dbSetShared(key, val) { DB.set(_sharedKey(key), val); }
function dbGetShared(key, def) { return DB.get(_sharedKey(key), def !== undefined ? def : null); }

// Save a single field to the current user's stored object
function _dbUser(field, val) {
  if (!S.user) return;
  S.user[field] = val;
  DB.set(_userKey('user'), S.user);
}

// Migrate solo data into shared DB when entering duo mode
function _migrateToSharedDB() {
  const keys = ['feeling','feeling_history','priming','vault','codex','ruptures','growth','pulse','feeling_history'];
  keys.forEach(k => {
    const solo = DB.get(_userKey(k), null);
    if (solo !== null) DB.set(_sharedKey(k), solo);
  });
  log('[DB] Solo data mirrored to shared namespace', 'info');
}

// Resolve which DB to read from based on mode and key type
function dbGetActive(key, def) {
  if (S.mode === 'duo') {
    // In duo mode, check shared first, fall back to personal
    const shared = DB.get(_sharedKey(key), null);
    if (shared !== null) return shared;
  }
  return dbGet(key, def);
}

const S = {
  user: DB.get('eravors_user',null),
  users: DB.get('eravors_users',{}),
  mode: 'solo',
  dbPrefix: 'solo',
  priming: DB.get('eravors_priming',null),
  customPrimes: DB.get('eravors_custom_primes',[]),
  feeling: DB.get('eravors_feeling',{name:'',emoji:'',intensity:5,note:'',ts:null}),
  feelingHistory: DB.get('eravors_feeling_history',[]),
  vault: DB.get('eravors_vault',[]),
  ruptures: DB.get('eravors_ruptures',[]),
  growthLog: DB.get('eravors_growth',[]),
  codex: DB.get('eravors_codex',[]),
  pulseHistory: DB.get('eravors_pulse',[]),
  lastMutatorSource: '',
  lastGeneratedPrompts: [],
  toneCtx: null, oscL: null, oscR: null, gainNode: null,
  timerInterval: null, timerSecs: 0, timerRunning: false,
};

// ═══════════════════════════════════════════════════════════════════
// AUTH
// ═══════════════════════════════════════════════════════════════════
/** Real, direct request: a homepage for signed-out visitors, shown
    before the login card rather than instead of it. Swaps visibility
    between the two -- both live inside #login-screen, so the existing
    show/hide logic for actually-logged-in users (loginSuccess() hides
    #login-screen entirely) still works unchanged for either state. */
function showLoginCard(){
  const home = document.getElementById('homepage');
  const box  = document.getElementById('login-box');
  if (home) home.style.display = 'none';
  if (box)  box.style.display  = '';
}
function showHomepage(){
  const home = document.getElementById('homepage');
  const box  = document.getElementById('login-box');
  if (home) home.style.display = '';
  if (box)  box.style.display  = 'none';
}

/**
 * WHICH ONE OPENS FIRST (v0.29.3).
 *
 * The marketing page answers "what is this and why would I install it" — a
 * question already answered by the time someone is looking at an installed
 * desktop app. Making them scroll past the pitch and click "Enter the Space"
 * every launch is friction with nothing on the other side of it.
 *
 * So: the DESKTOP app opens on the login card. The WEB page keeps the
 * landing, because that is where the pitch is actually load-bearing — it is
 * the page Anjali lands on from a QR code, and the page she downloads from.
 * "← Back" still reaches the landing in both, so nothing is unreachable.
 *
 * window.eravosDesktop exists only when electron-preload.js ran, which makes
 * it the honest test for "am I in the app" — no user agent sniffing, no
 * build-time flag that can drift from reality.
 */
function chooseSignedOutView(){
  const isDesktop = typeof window !== 'undefined' && !!window.eravosDesktop;
  // Scopes the frameless-window chrome in eravos-kernel.css. Set here rather
  // than in the preload so there is ONE test for "am I in the app" and the
  // CSS cannot disagree with the view choice below it.
  if (isDesktop) document.documentElement.classList.add('is-desktop');
  // An invite in the address bar overrides both: someone arriving to redeem
  // one has already decided, and detectPendingInvite() sends them straight to
  // the register form (index.html). Not re-decided here.
  if (window._pendingInvite) return;
  if (isDesktop) showLoginCard(); else showHomepage();
}
if (typeof window !== 'undefined') Object.assign(window, { showLoginCard, showHomepage, chooseSignedOutView });

function setLoginTab(t){
  document.querySelectorAll('.login-tab').forEach((el,i)=>el.classList.toggle('active',(t==='login'&&i===0)||(t==='register'&&i===1)));
  document.getElementById('login-form').style.display=t==='login'?'block':'none';
  document.getElementById('register-form').style.display=t==='register'?'block':'none';
}
function doLogin(){
  const u=document.getElementById('l-user').value.trim();
  const p=document.getElementById('l-pass').value;
  const err=document.getElementById('login-error');
  if(!u||!p){showLoginError(err,'Fill in all fields.');return}
  const uLower=u.toLowerCase();
  const freshUsers = DB.get('eravors_users', {});
  S.users = freshUsers;
  let userData=freshUsers[uLower];
  if(!userData){userData=Object.values(freshUsers).find(x=>(x.name||'').toLowerCase()===uLower||(x.email||'').toLowerCase()===uLower)}
  if(!userData){showLoginError(err,'Account not found.');return}
  // Show spinner
  const btn = document.querySelector('.btn-login');
  if(btn){btn._orig=btn.textContent;btn.textContent='✦ Checking...';btn.disabled=true;}
  hashPw(p).then(async hash => {
    let match = userData.password === hash;
    // Legacy migration: if stored hash looks like old djb2 format (short number), migrate it
    if(!match && /^-?\d+$/.test(userData.password) && userData.password === hashPwLegacy(p)){
      userData.password = hash;
      freshUsers[uLower] = userData;
      DB.set('eravors_users', freshUsers);
      match = true;
      log('Password migrated to SHA-256','ok');
    }
    if(btn){btn.textContent=btn._orig;btn.disabled=false;}
    if(!match){showLoginError(err,'Incorrect password.');return}
    loginSuccess(userData);
    // Same real-account call as doRegister() — a login must reach the
    // server too, not just re-prove the local password match, or the
    // server-side session (and the "stay logged in" persistence riding on
    // it) would only ever exist for people who registered AFTER this was
    // added, never for anyone logging back in.
    try {
      const loginRes = await fetch('/api/account/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emailOrUsername: userData.email || u, password: p }),
      });
      const loginBody = await loginRes.json().catch(() => ({}));
      if (loginRes.ok && loginBody.token) {
        DB.set('eravos_api_token', loginBody.token);
        DB.set('eravos_api_userid', loginBody.userId);
      } else {
        console.warn('[eravos] server-side login did not complete: ' +
          (loginBody.error || ('HTTP ' + loginRes.status)) + ' — continuing in local-only mode.');
      }
    } catch (e) {
      console.warn('[eravos] server-side login unreachable: ' + e.message + ' — continuing in local-only mode.');
    }
  }).catch(e => {
    if(btn){btn.textContent=btn._orig;btn.disabled=false;}
    showLoginError(err,'Hash error: '+e.message);
  });
}
async function doRegister(){
  const name=document.getElementById('r-name').value.trim();
  const email=document.getElementById('r-email').value.trim().toLowerCase();
  const pass=document.getElementById('r-pass').value;
  const mode=document.getElementById('r-mode').value;
  const err=document.getElementById('reg-error');
  if(!name||!email||!pass){showLoginError(err,'All fields required.');return}
  if(pass.length<6){showLoginError(err,'Password must be 6+ characters.');return}
  if(S.users[email]){showLoginError(err,'Account exists. Please sign in.');return}
  const hash = await hashPw(pass);
  // Real, critical for the actual network connection to work, not just
  // the local Pairing state machine: getPartnerPeerIdForUser() (used by
  // initMesh() to know who to actually connect to) reads the real
  // confirmed peer id from Pairing's own state now, but that state only
  // exists once paired -- role==='partner' is what routes an account
  // into that path at all. Registering via an invite with no role set
  // would leave the pairing state machine correct but the underlying
  // mesh connection with nowhere real to route to.
  const role = window._pendingInvite ? 'partner' : undefined;
  const recoveryEl = document.getElementById('r-recovery');
  const recoveryViaPartner = !!(recoveryEl && recoveryEl.checked);
  const user={name,email,mode,password:hash,created:Date.now(),recoveryViaPartner,...(role ? {role} : {})};
  S.users[email]=user;
  DB.set('eravors_users',S.users);
  loginSuccess(user);
  // §GAP found 2026-08-25 (direct request, 'until the word client side is
  // out of your mouth'): eravos-db (sibling package) already has a real,
  // tested, server-side account layer — /api/account/signup, /login,
  // /invite/generate, /invite/redeem — wired into eravos-serve.js and
  // confirmed working (its own test suite, 7/7). Nothing in this file, or
  // anywhere in the client, ever called it. The local S.users/DB write
  // above is what "shared" has actually meant this whole time — one
  // device's local storage, a second key prefix, never sent anywhere.
  // This call is additive, not a replacement — eravos-db's own README
  // states the peer/relay pairing below (initMesh, createInvite) stays
  // exactly as it is, device-to-device, real-time. This is the OTHER
  // half: durable, server-side, cross-device account data. A failure
  // here degrades to local-only, same as before this existed — it does
  // not block registration, since local-only was already a complete mode
  // and staying one is more honest than a hard failure over a feature
  // nobody asked to be required.
  try {
    const signupRes = await fetch('/api/account/signup', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, username: name, password: pass }),
    });
    const signupBody = await signupRes.json().catch(() => ({}));
    if (signupRes.ok && signupBody.token) {
      DB.set('eravos_api_token', signupBody.token);
      DB.set('eravos_api_userid', signupBody.userId);
      log('Real account created on the server — data now persists across devices, not just this one.', 'ok');

      // §GAP found 2026-08-25, from a real screenshot of applyPastedInvite()
      // rejecting a bare relay code correctly, which led to finding this:
      // an eravos-db account code recognized at signup time (see
      // applyPastedInvite() in index.html) was stored but never actually
      // redeemed — nothing here ever called /api/account/invite/redeem.
      // The end-state this exists for: she pastes the code, creates her
      // account, and IS her partner's partner the moment signup succeeds —
      // not "created an account that still needs a second manual step."
      if (window._pendingAccountInviteCode) {
        try {
          const redeemRes = await fetch('/api/account/invite/redeem', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + signupBody.token },
            body: JSON.stringify({ code: window._pendingAccountInviteCode }),
          });
          const redeemBody = await redeemRes.json().catch(() => ({}));
          if (redeemRes.ok && redeemBody.coupleId) {
            log('Connected — your account is linked with theirs.', 'ok');
            if (typeof showToast === 'function') showToast('✦ Connected — your accounts are linked.');
          } else {
            console.warn('[eravos] account invite code did not redeem: ' + (redeemBody.error || ('HTTP ' + redeemRes.status)));
            if (typeof showToast === 'function') showToast('Account created, but the invite code could not be redeemed: ' + (redeemBody.error || 'unknown error'));
          }
        } catch (e) {
          console.warn('[eravos] account invite redeem unreachable: ' + e.message);
        }
        window._pendingAccountInviteCode = null;
      }
    } else {
      console.warn('[eravos] server-side account signup did not complete: ' +
        (signupBody.error || ('HTTP ' + signupRes.status)) +
        ' — continuing in local-only mode, same as before this existed.');
    }
  } catch (e) {
    console.warn('[eravos] server-side account signup unreachable: ' + e.message +
      ' — continuing in local-only mode.');
  }
  // Real completion of the invite flow -- was detected on boot
  // (window._pendingInvite, see index.html's own detectPendingInvite())
  // but nothing ever actually acted on it until now. scan() only
  // writes LOCAL state (this._save(r) -- checked directly in
  // eravos-pairing.js, no network call in it at all), so the real,
  // separate step is emitting it over the actual sync transport so the
  // inviter's device receives it -- see the pairing:request Gate,
  // registered further down in this file, for the receiving side.
  if (window._pendingInvite && eravosPairing) {
    try {
      // getPeerIdForUser() is myPeerId() for every real account now --
      // random, opaque, persistent (see that function's own comment for
      // why the relay no longer uses fixed, name-revealing slot ids).
      // Kept as its own call here rather than myPeerId() directly for
      // the same reason it exists at all: one real function real code
      // agrees on, not two names for the same concept.
      // THE RENDEZVOUS, before anything opens a socket (v0.13.0). This is
      // the exact case the field was added for: she installs the desktop
      // build, so relayUrl() derives from HER 127.0.0.1 and the request she
      // is about to emit would land on her own relay, alone. The invite
      // names his. Applied first; initMesh() called explicitly rather than
      // left to the mode:toggle Gate's 800ms timer, so the socket is
      // opening against the right address by the time emitSync queues.
      const relayResult = applyInviteRelay(window._pendingInvite.relay);
      if (!relayResult.ok) {
        console.warn('[eravos] invite carried no usable relay (' + relayResult.reason +
                     ') — falling back to ' + relayUrl());
      }
      if (typeof initMesh === 'function') initMesh();

      const myRealPeerId = getPeerIdForUser(user);
      const result = eravosPairing.scan(window._pendingInvite, { peerId: myRealPeerId, name: user.name });
      if (result && result.ok) {
        emitSync('pairing:request', {
          code: window._pendingInvite.code,
          myPeerId: myRealPeerId, myName: user.name,
          fp: window._pendingInvite.fp || null,
        }, { queueOnFail: true });
        showToast('✦ Request sent — you\'ll be connected once they confirm');
      }
    } catch (e) {
      // Real, honest failure -- an expired or already-used code, or
      // already paired. Named, not silently swallowed (§1.2): the
      // account is created either way, this just didn't also connect.
      console.warn('[eravos] could not complete the invite:', e.message);
      showToast('⚠ Account created, but the invite could not be completed: ' + e.message);
    }
    window._pendingInvite = null;
  } else if (mode === 'solo') {
    // Real fix, same "well-designed, never wired up" pattern found
    // repeatedly this session: maybePromptInvite() (further down in
    // this file) existed, its own gating logic (shouldPromptInvite())
    // was correct, but nothing anywhere ever called it. This is the
    // exact real flow it was built for -- a fresh, non-invite solo
    // signup -- not shown for someone who just arrived via a real
    // partner's invite link (they're already mid-connecting, a
    // separate "want to invite someone?" prompt right after would be
    // real friction, not help).
    maybePromptInvite();
  }
}
// ── SHA-256 — pure JS, no crypto.subtle required ──────────────────
// Works in file://, HTTP, any context. Public domain FIPS 180-4 impl.
function _sha256(str) {
  function rr(v,n){return(v>>>n)|(v<<(32-n));}
  const K=[0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
           0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
           0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
           0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
           0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
           0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
           0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
           0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
  let H=[0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
  const bytes=[];
  for(let i=0;i<str.length;i++){const c=str.charCodeAt(i);if(c<0x80)bytes.push(c);else if(c<0x800){bytes.push(0xc0|(c>>6),0x80|(c&63));}else{bytes.push(0xe0|(c>>12),0x80|((c>>6)&63),0x80|(c&63));}}
  const L=bytes.length; bytes.push(0x80);
  while(bytes.length%64!==56) bytes.push(0);
  const bits=L*8; bytes.push(0,0,0,0,(bits>>>24)&0xff,(bits>>>16)&0xff,(bits>>>8)&0xff,bits&0xff);
  for(let i=0;i<bytes.length;i+=64){
    const w=new Array(64);
    for(let j=0;j<16;j++) w[j]=(bytes[i+j*4]<<24)|(bytes[i+j*4+1]<<16)|(bytes[i+j*4+2]<<8)|bytes[i+j*4+3];
    for(let j=16;j<64;j++){const s0=rr(w[j-15],7)^rr(w[j-15],18)^(w[j-15]>>>3);const s1=rr(w[j-2],17)^rr(w[j-2],19)^(w[j-2]>>>10);w[j]=(w[j-16]+s0+w[j-7]+s1)>>>0;}
    let[a,b,c,d,e,f,g,h]=H;
    for(let j=0;j<64;j++){const S1=rr(e,6)^rr(e,11)^rr(e,25);const ch=(e&f)^(~e&g);const t1=(h+S1+ch+K[j]+w[j])>>>0;const S0=rr(a,2)^rr(a,13)^rr(a,22);const maj=(a&b)^(a&c)^(b&c);const t2=(S0+maj)>>>0;h=g;g=f;f=e;e=(d+t1)>>>0;d=c;c=b;b=a;a=(t1+t2)>>>0;}
    H=[H[0]+a,H[1]+b,H[2]+c,H[3]+d,H[4]+e,H[5]+f,H[6]+g,H[7]+h].map(v=>v>>>0);
  }
  return H.map(v=>('00000000'+v.toString(16)).slice(-8)).join('');
}
// Async wrapper — same interface, no crypto.subtle
async function hashPw(p) { return _sha256(String(p)); }
// Legacy djb2 hash — only used to detect and migrate old-format passwords
function hashPwLegacy(p){let h=0;for(let i=0;i<p.length;i++){h=((h<<5)-h)+p.charCodeAt(i);h|=0}return String(h)}
function loginSuccess(user){
  S.user=user; DB.set('eravors_user',user);
  S.dbPrefix = user.dbPrefix || (user.name||'').toLowerCase() || 'solo';

  // ADOPT ORPHANS (v0.24.0). Anything written before an account existed
  // landed under solo_*, and every read after login looks at <prefix>_* —
  // so it was on disk and unreachable, which is the worst failure shape
  // available: the person is told they never wrote it. Reproduced before
  // fixing. Idempotent, never overwrites, never deletes (§0.3).
  if (typeof Persistence !== 'undefined') {
    try {
      const r = new Persistence({}).adopt(S.dbPrefix);
      if (r.moved) console.info('[eravos] adopted ' + r.moved + ' orphaned key(s) into ' + S.dbPrefix);
      if (r.conflicts.length && typeof showToast === 'function') {
        showToast(r.conflicts.length + ' earlier version(s) kept alongside — nothing was overwritten');
      }
    } catch (e) { console.error('[eravos] adopt failed:', e.message); }
  }
  S.mode=user.mode||'solo';
  document.getElementById('login-screen').classList.add('hidden');
  const initial = user.name.charAt(0).toUpperCase();
  document.getElementById('user-avatar').textContent=initial;
  document.getElementById('user-name-display').textContent=user.name;
  // Set mode pills
  const _savedMode = user.mode || 'solo';
  S.mode = _savedMode;
  ['solo','duo'].forEach(m => {
    const btn = document.getElementById('mode-pill-' + m);
    if (btn) btn.classList.toggle('active', m === _savedMode);
  });
  // Real gate, not just the mode toggle: duo-mode UI (Communication nav,
  // partner box, the partner menu) only shows once a real partner is
  // actually paired -- eravosPairing.state().paired, not just
  // user.mode === 'duo'. Someone can flip the mode pill without ever
  // sending or accepting a real invite; showing partner UI before that
  // is exactly the confusing half-state a screenshot flagged (a
  // "Partner" box with data, no real partner behind it). Solo/duo
  // still controls which NAV CATEGORY is active; genuine pairing
  // additionally controls whether co-creation surfaces exist at all.
  const _reallyPaired = !!(window.eravosPairing && eravosPairing.state().paired);
  const _showDuoUI = _savedMode === 'duo' && _reallyPaired;
  // Direct request: Communication stays visible in solo mode too, not
  // hidden. Previously hidden entirely (call/poke/messages/needs/
  // planner are partner-facing, so the reasoning wasn't baseless), but
  // that made the category impossible to discover before pairing --
  // someone solo had no way to even see what these tools were, let
  // alone be prompted to invite a partner to use them. Individual
  // features within it are the right place to handle "no partner yet"
  // (a prompt to invite, not a blank/broken panel), not the nav itself.
  const _commCatBtn = document.getElementById('cat-communication');
  if (_commCatBtn) _commCatBtn.style.display = '';
  const _pfr = document.getElementById('partner-feeling-row');
  if (_pfr) _pfr.style.display = _showDuoUI ? 'flex' : 'none';
  if (_showDuoUI && typeof renderPartnerBox === 'function') renderPartnerBox();
  const _sparFab = document.getElementById('partner-fab-wrap');
  if (_sparFab) _sparFab.style.display = 'block';
  if (typeof _renderDNDButton === 'function') _renderDNDButton(_isDND());
  // Sync dropdown
  const umeAvatar = document.getElementById('ume-avatar-inner');
  const umeToggle = document.getElementById('ume-toggle-label');
  if(umeAvatar) umeAvatar.textContent = initial;
  if(umeToggle) umeToggle.textContent = S.mode==='duo' ? 'Switch to Solo' : 'Switch to Co-Creation';
  log(`Welcome back, ${user.name}!`,'ok');
  appStream.emit(new SEvent('auth:login',{user:user.email}));
  postLoginHook(user);
}

function postLoginHook(user) {
  // Role-based identity — no plaintext name checks in logic
  const isAdmin  = user.role === 'admin';
  const isPartnerRole = user.role === 'partner';
  const isJames  = isAdmin;  // admin == James for this deployment

  // Load all persistent data
  S.feeling = DB.get('eravors_feeling', {name:'',emoji:'',color:'',intensity:5,note:'',ts:0});
  S.feelingHistory = DB.get('eravors_feeling_history', []);
  S.priming = DB.get('eravors_priming', {name:'Present',desc:'',emoji:'🌀'});
  updateFeelingBar();
  updatePrimingIndicator();
  loadProfileForm();
  // Deferred render — called after all scripts load to avoid cross-block reference errors
  setTimeout(function(){
    typeof renderSparHistory === 'function' && renderSparHistory();
    typeof renderFeelingHistory === 'function' && renderFeelingHistory();
    typeof renderVault === 'function' && renderVault();
    typeof renderCodexList === 'function' && renderCodexList();
    typeof renderRuptureList === 'function' && renderRuptureList();
    typeof renderGrowthList === 'function' && renderGrowthList();
    typeof renderPulseHistory === 'function' && renderPulseHistory();
    typeof renderMythosGallery === 'function' && renderMythosGallery();
    typeof renderPlannerEvents === 'function' && renderPlannerEvents();
    typeof _initSession === 'function' && _initSession();
    typeof _initMeshChannel === 'function' && _initMeshChannel();
    typeof checkOnboarding === 'function' && checkOnboarding();
  }, 0);

  // Apply user role
  if (isPartnerRole) {
    applyPartnerView();
  } else {
    applyJamesView();
  }

  // Themes retired -- one default. applyTheme('') strips any retired class
  // left on <body> by an earlier build and re-runs the particle system.
  applyTheme('');

  // P2P init is now event-driven — see the auth:login gate below,
  // which only starts it when the saved mode is already 'duo'.

  // Init love inbox for the partner role
  if (isPartnerRole) renderLoveInbox();

  // Mobile nav sync
  if (typeof mnavSelect === 'function') mnavSelect('oracle');

  switchTab('oracle');
  typeof _syncAdminTab === 'function' && _syncAdminTab();
}
function showLoginError(el,msg){el.textContent=msg;el.style.display='block';setTimeout(()=>el.style.display='none',3500)}
function showUserMenu(){
  const menu = document.getElementById('user-menu-dropdown');
  if (!menu) return;
  // Populate
  const nameEl = menu.querySelector('.ume-name');
  const modeEl = menu.querySelector('.ume-mode');
  if (nameEl) nameEl.textContent = S.user?.name || 'You';
  if (modeEl) modeEl.textContent = (S.mode || 'solo').toUpperCase() + ' MODE';
  if (typeof _renderDNDButton === 'function') _renderDNDButton(_isDND());
  // Toggle
  const isOpen = menu.classList.contains('open');
  closeUserMenu();
  if (!isOpen) {
    menu.classList.add('open');
    // Position below avatar
    const avatar = document.getElementById('user-avatar');
    if (avatar) {
      const rect = avatar.getBoundingClientRect();
      menu.style.top  = (rect.bottom + 6) + 'px';
      menu.style.right = (window.innerWidth - rect.right) + 'px';
    }
    setTimeout(() => document.addEventListener('click', _userMenuOutside, { once: true }), 50);
  }
}
function closeUserMenu() {
  const menu = document.getElementById('user-menu-dropdown');
  if (menu) menu.classList.remove('open');
  document.removeEventListener('click', _userMenuOutside);
}
function _userMenuOutside(e) {
  const menu = document.getElementById('user-menu-dropdown');
  const avatar = document.getElementById('user-avatar');
  if (menu && !menu.contains(e.target) && e.target !== avatar) closeUserMenu();
}

// ── Notification (bell) dropdown ─────────────────────────────────────
// Same open/position/outside-click pattern as showUserMenu() above —
// deliberately, so there's one dropdown convention in the app, not two.
function showNotifDropdown() {
  const menu = document.getElementById('notif-dropdown');
  if (!menu) return;
  const isOpen = menu.classList.contains('open');
  closeNotifDropdown();
  if (isOpen) return; // was open — this click just closes it

  _renderNotifDropdownList();
  menu.classList.add('open');
  const trigger = document.getElementById('notif-bell-trigger');
  if (trigger) {
    const rect = trigger.getBoundingClientRect();
    menu.style.top = (rect.bottom + 6) + 'px';
    menu.style.right = (window.innerWidth - rect.right) + 'px';
  }
  setTimeout(() => document.addEventListener('click', _notifDropdownOutside, { once: true }), 50);
}

function closeNotifDropdown() {
  const menu = document.getElementById('notif-dropdown');
  if (menu) menu.classList.remove('open');
  document.removeEventListener('click', _notifDropdownOutside);
}

function _notifDropdownOutside(e) {
  const menu = document.getElementById('notif-dropdown');
  const trigger = document.getElementById('notif-bell-trigger');
  if (menu && !menu.contains(e.target) && e.target !== trigger && !trigger?.contains(e.target)) closeNotifDropdown();
}

function _renderNotifDropdownList() {
  const el = document.getElementById('notif-dropdown-list');
  if (!el) return;
  const inbox = DB.get('eravors_inbox', []); // same source of truth updateInboxBadge() uses
  if (!inbox.length) {
    el.innerHTML = '<div class="small italic" style="color:var(--dim);text-align:center;padding:16px 8px">No messages yet.</div>';
    return;
  }
  const typeIcons = { text: '✍', love: '💌', feeling: '💗', need: '🫀', poem: '📜', soft: '💛', attention: '💌', urgent: '🔴', partner_invite: '🔗' };
  el.innerHTML = inbox.slice(0, 5).map(m => {
    const sub = m.subtype || m.type || 'message';
    const icon = typeIcons[sub] || '•';
    return `<div class="notif-preview-item${!m.read ? ' unread' : ''}" onclick="closeNotifDropdown();openMessagesModal()">
      <div class="notif-preview-type">${icon} ${(m.from || 'Partner')}</div>
      <div class="notif-preview-text">${(m.text || sub).slice(0, 90)}${(m.text || '').length > 90 ? '…' : ''}</div>
      <div class="notif-preview-meta">${m.ts ? new Date(m.ts).toLocaleString() : ''}</div>
    </div>`;
  }).join('');
}
function doSignOut() {
  closeUserMenu();
  // Show a clean confirmation overlay instead of window.confirm
  const overlay = document.getElementById('signout-overlay');
  if (overlay) overlay.classList.add('open');
}
function confirmSignOut() {
  disconnectPartner();
  S.user = null;
  DB.set('eravors_user', null);
  // Fade out and reload
  const overlay = document.getElementById('signout-overlay');
  if (overlay) {
    const box = overlay.querySelector('.signout-box');
    if (box) box.style.transform = 'scale(.96)';
    overlay.style.background = 'rgba(0,0,0,.96)';
  }
  setTimeout(() => location.reload(), 420);
}
function cancelSignOut() {
  const overlay = document.getElementById('signout-overlay');
  if (overlay) overlay.classList.remove('open');
}

// Auto-login if session exists.
//
// REAL, SEVERE BUG FOUND AND FIXED HERE: this used to run synchronously,
// immediately, at this exact point in the script's own top-to-bottom
// execution -- but loginSuccess()'s own call chain (postLoginHook ->
// setJamesTheme/applyJamesView/_initSession/initRTC/requestModeSwitch)
// references RETIRED_THEMES, SESSION, _emergenceSignalCache, peer,
// MODE_META, and others -- every one of them declared with let/const
// FAR LATER in this same file. For any RETURNING user (S.user already
// has real, persisted data -- exactly the common case, not an edge
// case), this call fired before any of those declarations had executed,
// throwing "can't access lexical declaration X before initialization"
// on all of them and halting the rest of this script's own execution
// at whichever one it hit first. A real user hit this directly, not a
// hypothetical: multiple stacked ReferenceErrors, "Not connecting" on
// screen, the whole app effectively dead on load for anyone already
// logged in. DOMContentLoaded fires only after every blocking <script
// src> tag (including this one, in full) has finished -- by then every
// declaration this call chain needs genuinely exists.
window.addEventListener('DOMContentLoaded', () => {
  if(S.user){loginSuccess(S.user)}

  // Auto-login via URL param ?user=name (for APK build) -- same real
  // bug, same fix: was its own separate IIFE, called immediately,
  // right after the block above. Moved inside the same deferred
  // handler rather than left as a second, separately-broken copy.
  if (!S.user) {
    const params = new URLSearchParams(window.location.search);
    const autoUser = params.get('user');
    if (autoUser) {
      const uLower = autoUser.toLowerCase();
      const users = DB.get('eravors_users', {});
      const userData = users[uLower] || Object.values(users).find(x => (x.name||'').toLowerCase() === uLower);
      if (userData) loginSuccess(userData);
    }
  }
});

// FEELINGS array moved above — see STATE section

// The vocabulary went 18 -> 62 in Phase 1, which made an unsearchable grid
// a real problem: 62 tiles is more scanning than someone in distress should
// have to do to say how they are. Search filters as you type, and the LAST
// tile is always "Something else" -- routed through eravosChoice, so a word
// written here is remembered and offered first next time (§ the Other
// primitive). A closed list is a claim about what a person is allowed to
// feel; this removes the claim without removing the vocabulary.
function renderFeelingSectors(){
  const grid=document.getElementById('feeling-sectors');
  if(!grid)return;
  const q=(document.getElementById('feeling-search')?.value||'').toLowerCase().trim();

  let customs=[];
  try { customs = (window.eravosChoice ? eravosChoice.customFor('feeling') : []); } catch(e){}

  const builtins=FEELINGS.map(f=>({name:f.name,emoji:f.emoji,body:f.body,custom:false}));
  const mine=customs.map(c=>({name:c.label,emoji:'\u25cb',body:'yours',custom:true}));
  let all=mine.concat(builtins);
  if(q) all=all.filter(f=>f.name.toLowerCase().includes(q)||String(f.body).toLowerCase().includes(q));

  const tiles=all.map(f=>`
    <div class="fsector${S.feeling.name===f.name?' sel':''}${f.custom?' fcustom':''}" onclick="selectFeeling(${JSON.stringify(f.name).replace(/"/g,'&quot;')})">
      <div class="fe">${f.emoji}</div>
      <div class="fn">${f.name}</div>
      <div class="fb">${String(f.body).split(',')[0]}</div>
    </div>`).join('');

  // §1.2 -- an empty search says so instead of rendering a blank wall.
  const empty = (q && !all.length)
    ? `<div class="fsector-empty">Nothing here matches \u201c${q.replace(/</g,'&lt;')}\u201d \u2014 which is fine. Write it in your own words below.</div>`
    : '';

  grid.innerHTML = tiles + empty + `
    <div class="fsector fother" onclick="addOwnFeeling()">
      <div class="fe">\u002b</div>
      <div class="fn">Something else</div>
      <div class="fb">in your words</div>
    </div>`;
}

// "Other" is never a dead end -- it writes, remembers, and selects in one go.
function addOwnFeeling(){
  const text = window.prompt && window.prompt('In your words \u2014 how are you?');
  if(!text || !text.trim()) return;               // a skip records nothing
  try {
    if(window.eravosChoice) eravosChoice.addCustom('feeling', text.trim());
  } catch(e){
    if(typeof showToast==='function') showToast(e.message);   // §1.2 named, visible
    return;
  }
  S.feeling.name=text.trim(); S.feeling.emoji='\u25cb'; S.feeling.color='var(--amber)';
  if(typeof dbSet==='function') dbSet('feeling',S.feeling);
  if(typeof emitSync==='function') emitSync('feeling:set',S.feeling);
  renderFeelingSectors();
  if(typeof drawMiniWheel==='function') drawMiniWheel();
  if(typeof showToast==='function') showToast('Saved \u2014 it will be offered first next time');
}

function filterFeelingSectors(){ renderFeelingSectors(); }

function selectFeeling(name){
  let f=FEELINGS.find(x=>x.name===name);
  // A custom feeling is a real feeling. Previously this returned early on
  // anything not in the built-in list, which would have made every "Other"
  // tile silently do nothing (§1.2).
  if(!f) f={name:name,emoji:'\u25cb',color:'var(--amber)',body:'yours'};
  S.feeling.name=name; S.feeling.emoji=f.emoji; S.feeling.color=f.color;
  document.querySelectorAll('.fsector').forEach(el=>el.classList.toggle('sel',el.querySelector('.fn')?.textContent===name));
  document.documentElement.style.setProperty('--feeling-color',f.color);
}

function openFeelingModal(){renderFeelingSectors();document.getElementById('feeling-modal').classList.add('open')}
function closeFeelingModal(){document.getElementById('feeling-modal').classList.remove('open')}

// Guard: define syncFeelingToPartner early so it's never undefined
function syncFeelingToPartner(){
  if(!S.feeling||!S.feeling.name)return;
  const feeling = {
    name:S.feeling.name,emoji:S.feeling.emoji,
    intensity:S.feeling.intensity,color:S.feeling.color,
    note:S.feeling.note,ts:S.feeling.ts
  };
  try{
    if(typeof emitSync==='function'){
      // Was: sendP2P({type:'feeling_update',...}) — a type no gate, flat
      // or namespaced, ever listened for. Converged onto the same
      // 'feeling:set' gate the Guided Feeling Flow path uses, so both
      // ways of setting a feeling actually reach the partner now. See
      // the SYNC STREAM block's shadowing note for the full finding.
      emitSync('feeling:set', feeling);
    }
  }catch(e){log('[feeling sync] '+e.message,'warn');}
}

function saveFeelingState(){
  if(!S.feeling.name){
    // If no feeling selected from wheel, still allow saving with current state or prompt
    showToast('💗 Select a feeling from the wheel first');
    return;
  }
  const intensityEl=document.getElementById('feeling-intensity');
  const noteEl=document.getElementById('feeling-note');
  const intensity=intensityEl?parseInt(intensityEl.value)||5:5;
  const note=noteEl?noteEl.value:'';
  S.feeling.intensity=intensity;
  S.feeling.note=note;
  S.feeling.ts=Date.now();
  // Ensure color is always set
  if(!S.feeling.color){
    const fc=FEELINGS.find(x=>x.name===S.feeling.name);
    if(fc)S.feeling.color=fc.color;
  }
  const savedCurrent = DB.set('eravors_feeling',S.feeling);
  // Push to history — deduplicate same feeling within 2 minutes
  const lastH=S.feelingHistory[0];
  const isRecent=lastH&&lastH.name===S.feeling.name&&(Date.now()-lastH.ts)<120000;
  let savedHistory = true;
  if(!isRecent){
    S.feelingHistory.unshift({...S.feeling,ts:Date.now()});
    if(S.feelingHistory.length>100)S.feelingHistory=S.feelingHistory.slice(0,100);
    savedHistory = DB.set('eravors_feeling_history',S.feelingHistory);
    if (!savedHistory) S.feelingHistory.shift(); // roll back the in-memory add — don't show something as logged that isn't on disk
  }
  updateFeelingBar();
  // was an unguarded call -- renderFeelingHistory() only exists once
  // tabs/relational/feelings/feelings.js has loaded (tab-per-folder
  // architecture), which isn't guaranteed if a feeling is saved before
  // that tab has ever been visited. Every OTHER call site to this same
  // function already guards with this exact typeof check (lines 1371,
  // 3195, 6101, 6380) -- this was the one inconsistent copy.
  if (typeof renderFeelingHistory === 'function') renderFeelingHistory();
  closeFeelingModal();
  if (!savedCurrent || !savedHistory) {
    showToast('⚠ Feeling not saved — storage may be full. Check Settings → System.');
    log('Feeling save failed (current=' + savedCurrent + ', history=' + savedHistory + ')', 'error');
    return;
  }
  syncFeelingToPartner();
  updateMsgFeelingPreview&&updateMsgFeelingPreview();
  appStream&&appStream.emit&&appStream.emit(new SEvent('feeling:set',{name:S.feeling.name,intensity}));
  log(`Feeling set: ${S.feeling.emoji} ${S.feeling.name} (${intensity}/10)`,'ok');
  showToast(`💗 Feeling logged: ${S.feeling.emoji} ${S.feeling.name}`);
}

function updateFeelingBar(){
  const f=S.feeling;
  const nameEl=document.getElementById('feeling-display-name');
  if(nameEl)nameEl.textContent=f.emoji?`${f.emoji} ${f.name}`:'Tap to set...';
  if(f.color)document.documentElement.style.setProperty('--feeling-color',f.color);
  const dotsEl=document.getElementById('feeling-dots-display');
  if(dotsEl){
    dotsEl.innerHTML='';
    for(let i=1;i<=10;i++){
      const d=document.createElement('div');
      d.className='feeling-dot'+(i<=f.intensity?' active':'');
      d.onclick=()=>{S.feeling.intensity=i;DB.set('eravors_feeling',S.feeling);updateFeelingBar()};
      dotsEl.appendChild(d);
    }
  }
  const bodyEl=document.getElementById('feeling-body-text');
  if(bodyEl&&f.name){const fc=FEELINGS.find(x=>x.name===f.name);if(fc)bodyEl.textContent=fc.body.replace(/,/g,' · ')}
  drawMiniWheel();
}

// ═══════════════════════════════════════════════════════════════════
// PARTNER BOX — persistent, always-visible-in-duo-mode display of the
// partner's current feeling, connection status, most recent need card,
// and presence signal, all in one place. Requested directly ("really
// cant even see your partner") — before this, feeling had a one-line
// display easy to miss, and signal had NO display at all: the
// presence:need_signal gate targeted #partner-need-signal-display,
// an element that was never actually defined anywhere in any markup
// (found while building this). Cross-cutting/kernel-resident since it
// updates from gates that fire regardless of which tab is open, same
// reasoning as the poke pipeline.
function renderPartnerBox() {
  const row = document.getElementById('partner-feeling-row');
  if (!row || row.style.display === 'none') return; // solo mode — nothing to show

  const feelEl = document.getElementById('partner-box-feeling');
  if (feelEl) {
    const f = DB.get('eravors_partner_feeling_latest', null);
    feelEl.textContent = f && f.name ? `${f.emoji || ''} ${f.name}${f.intensity ? ' (' + f.intensity + '/10)' : ''}` : '–';
  }

  const needEl = document.getElementById('partner-box-need');
  if (needEl) {
    const need = DB.get('eravors_inbox', []).find(m => m.subtype === 'need');
    needEl.textContent = need ? need.text.slice(0, 60) + (need.text.length > 60 ? '…' : '') : '–';
  }

  const sigEl = document.getElementById('partner-box-signal');
  if (sigEl) {
    const sig = DB.get('eravors_partner_signal_latest', null);
    sigEl.textContent = sig && sig.signal ? `"${sig.signal}"` : '–';
  }

  // Status row is driven by updateRTCStatus() (below) so it shares the
  // exact same source of truth as the header pill, not a second guess
  // at connection state computed independently here.

  if (typeof renderRelationalHealthField === 'function') renderRelationalHealthField();
}

// ═══════════════════════════════════════════════════════════════════
// RELATIONAL HEALTH — Phase 3 (03-FEATURE-SPECS.md §Commitments item 4,
// 02-DATA-SCHEMAS.md's Commitment comment). A derived, read-only view —
// no new storage, no new sync type, purely computed from data that's
// already synced (shared_commitments, eravors_ruptures, eravors_inbox).
// Placed after Commitments existed since it's the last of the three
// source logs, a real bottom-up dependency.
//
// Honest scope note: the spec names "unmet-NeedCard count" as a source,
// but NeedCard was never given its own status field anywhere in this
// spec (checked — 02-DATA-SCHEMAS.md never defines a NeedCard schema
// block at all, only prose references to `NeedCard.status`). Building
// a full acknowledge/met/unmet status system for need messages is a
// separate, larger undertaking than this view itself. Used the closest
// honest existing proxy instead: an unread need-type inbox message —
// genuinely nobody has acknowledged it yet, which is what "unmet" is
// getting at — rather than inventing new schema to make the numbers
// look more precise than what's actually tracked.
// ═══════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════
// STRUGGLES — Phase 3 (03-FEATURE-SPECS.md §Struggles). Compassionate
// self/partner-support tool, never using the word "issues" anywhere in
// its own copy. Ownership (a) private-by-default, explicitly shareable
// per-piece: the checklist and the free-form story each have their own
// independent share/unshare toggle — sharing one doesn't share the
// other. Storage/sync helpers live here (cross-cutting) since the
// receiving side has to update regardless of which tab is open, same
// reasoning as Triggers' partner-shared cache.
// ═══════════════════════════════════════════════════════════════════

function _struggles() {
  return DB.get(_userKey('struggles'), { selected: [], story: null, checklist_shared: false, story_shared: false });
}
function _strugglesSet(state) { DB.set(_userKey('struggles'), state); }
function _partnerStrugglesChecklist() { return DB.get('eravors_partner_struggles_checklist', []); }
function _partnerStrugglesStory() { return DB.get('eravors_partner_struggles_story', null); }

// Daily soft check-in — reuses FeelingEvent's own shape and storage
// (S.feelingHistory / eravors_feeling_history), "entered through a
// different door," not a parallel schema for the same kind of data.
const STRUGGLES_CHECKIN_MOODS = {
  fantastic: { name: 'fantastic', emoji: '✨', intensity: 9 },
  good:      { name: 'good',      emoji: '🙂', intensity: 7 },
  meh:       { name: 'meh',       emoji: '😐', intensity: 5 },
  not_good:  { name: 'not good',  emoji: '😔', intensity: 3 },
  horrible:  { name: 'horrible',  emoji: '😞', intensity: 1 },
};

// ── Emergence hook -- real signal, cached, refreshed in the background ──
// computeRelationalHealth() below is called synchronously from a render
// path (renderRelationalHealthField()) -- it can't itself await a
// network call without converting that whole chain to async. Same
// resilient shape as PeerJS's own offline fallback already in this
// file: a background refresh keeps a cache warm, the synchronous path
// reads the cache (or applies zero penalty if it's empty/stale/
// unreachable), never blocks, never throws into the render path.
const EMERGENCE_API_PREFIX = '/api/emergence'; // consolidated onto this same server/port -- see eravos-serve.js. Same reasoning as the relay's own port consolidation: a separate port for this was one more thing that could be up while the app was down.
const EMERGENCE_CACHE_MAX_AGE_MS = 5 * 60 * 1000; // 5 min -- stale beyond this counts as no signal, not a wrong one
let _emergenceSignalCache = null; // { spaceHealth, fetchedAt }

async function refreshEmergenceSignal() {
  try {
    const res = await fetch(EMERGENCE_API_PREFIX + '/space/health');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const spaceHealth = await res.json();
    _emergenceSignalCache = { spaceHealth, fetchedAt: Date.now() };
  } catch (e) {
    // real, honest failure -- logged, not swallowed, but never thrown
    // into a caller that isn't expecting a rejected promise (this is
    // fired off in the background, nothing awaits it)
    console.warn('[Eravos] Emergence signal refresh failed (server not running locally?):', e.message);
  }
}

/** getEmergenceSpaceHealth() -> the cached space-distance health, or null if stale/never fetched/unreachable. Never throws. */
function getEmergenceSpaceHealth() {
  if (!_emergenceSignalCache) return null;
  if (Date.now() - _emergenceSignalCache.fetchedAt > EMERGENCE_CACHE_MAX_AGE_MS) return null;
  return _emergenceSignalCache.spaceHealth;
}

function computeRelationalHealth() {
  let score = 100;
  const detail = [];

  const commitments = DB.get('shared_commitments', []);
  const missedCount = commitments.filter(c => c.status === 'missed').length;
  const now = Date.now();
  const overdueActive = commitments.filter(c => c.status === 'active' && c.due && c.due < now).length;
  score -= Math.min(30, missedCount * 10);
  score -= Math.min(15, overdueActive * 5);
  if (missedCount) detail.push(missedCount + ' missed commitment' + (missedCount === 1 ? '' : 's'));
  if (overdueActive) detail.push(overdueActive + ' overdue, still open');

  const ruptures = DB.get('eravors_ruptures', []);
  const openRuptures = ruptures.filter(r => r.status === 'open').length;
  score -= Math.min(30, openRuptures * 15);
  if (openRuptures) detail.push(openRuptures + ' unresolved rupture' + (openRuptures === 1 ? '' : 's'));

  const inbox = DB.get('eravors_inbox', []);
  const unmetNeeds = inbox.filter(m => m.subtype === 'need' && !m.read).length;
  score -= Math.min(20, unmetNeeds * 5);
  if (unmetNeeds) detail.push(unmetNeeds + ' unread need' + (unmetNeeds === 1 ? '' : 's'));

  // Real, direct gap fix: unmet needs and resentment were never actually
  // weighted here as their own signal -- "unread need" only caught a need
  // that hadn't even been SEEN yet, saying nothing about the far more
  // corrosive pattern of a need that WAS seen, WAS acknowledged, and
  // never actually changed anything. Resentment isn't a single data
  // point, it's recurrence -- the same thing kept needing to be said, or
  // kept happening again. Honest about the limitation: this is
  // frequency-based, not topic-matched (no real NLP here to tell "I need
  // more affection" apart from "I need more space" as distinct recurring
  // threads) -- but frequency within a real time window is still a real,
  // defensible signal, not a guessed one.
  const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
  const recentNeeds = inbox.filter(m => m.subtype === 'need' && (now - (m.ts || 0)) < THIRTY_DAYS).length;
  const recentRuptures = ruptures.filter(r => (now - (r.ts || 0)) < THIRTY_DAYS).length;
  let resentmentRisk = 0;
  if (recentNeeds >= 3) resentmentRisk += Math.min(15, (recentNeeds - 2) * 5);
  if (recentRuptures >= 3) resentmentRisk += Math.min(15, (recentRuptures - 2) * 5);
  if (resentmentRisk) {
    score -= resentmentRisk;
    detail.push('a pattern building — ' + recentNeeds + ' need' + (recentNeeds === 1 ? '' : 's') +
      ' and ' + recentRuptures + ' rupture' + (recentRuptures === 1 ? '' : 's') + ' in the last 30 days');
  }

  // Emergence's space-distance signal -- real, evidence-based read on
  // whether the current silence is unusual for THIS couple's own
  // learned contact rhythm (not a generic "should talk daily" rule),
  // timezone-aware. null if Emergence isn't running locally or hasn't
  // built a real baseline yet -- honestly zero penalty in that case,
  // not a guessed one.
  const spaceHealth = getEmergenceSpaceHealth();
  if (spaceHealth && spaceHealth.status === 'unusual-silence') {
    score -= 15;
    detail.push('quieter than usual for you two');
  } else if (spaceHealth && spaceHealth.status === 'longer-than-usual') {
    score -= 5;
    detail.push('a bit quieter than your normal rhythm');
  }

  // Emergence's real relational-analysis signal -- direct request:
  // "wire it to eravos and the relational field." Only the MOST
  // RECENT tick, not accumulated across a conversation -- a single
  // tense exchange shouldn't permanently drag the score down once the
  // conversation has moved past it. Recency-gated to the last 30
  // minutes so a tick from hours ago (or a stale one from before a
  // page reload) never silently keeps penalizing. Honestly zero if the
  // 'emergence' feature is off or no tick has run yet -- not guessed.
  if (window.eravosFeatures && eravosFeatures.enabled('emergence') &&
      _lastEmergenceTick && (Date.now() - _lastEmergenceTick.ts) < 30 * 60 * 1000) {
    const obs = _lastEmergenceTick.observation || {};
    const severity = obs.rupture_severity || 0;
    if (severity > 0.3) {
      const penalty = Math.min(15, Math.round((severity - 0.3) / 0.7 * 15));
      if (penalty > 0) {
        score -= penalty;
        detail.push('a real pattern noticed in recent conversation');
      }
    }
  }

  // Floor at 20 (deliberately above the algebraic worst case). Max
  // possible penalty is missed(30) + overdue(15) + ruptures(30) +
  // needs(20) + space-distance(15) + resentment-risk(30) +
  // emergence-tension(15, added when the real relational-analysis
  // signal above was hooked in) = 155, so the unclamped minimum is -55
  // -- this floor is a real, reachable safety net in the true worst
  // case, not unreachable dead code (an earlier version of this
  // comment miscalculated the max penalty by missing the overdue-active
  // term and wrongly concluded the floor could never trigger — caught
  // by a test actually hitting a number that didn't match either
  // claim).
  score = Math.max(20, Math.min(100, score));
  return { score, detail };
}

function renderRelationalHealthField() {
  const el = document.getElementById('relational-health-field');
  if (!el) return; // not on this page / solo mode row hidden
  const { score, detail } = computeRelationalHealth();
  const scale = 0.4 + (score / 100) * 0.6; // 0.4x–1.0x visual size, never disappears entirely
  const glow = document.getElementById('relational-health-glow');
  if (glow) {
    glow.style.transform = `scale(${scale})`;
    glow.style.opacity = String(0.35 + (score / 100) * 0.65);
  }
  const labelEl = document.getElementById('relational-health-label');
  if (labelEl) labelEl.textContent = detail.length ? detail.join(' · ') : 'Nothing weighing on it right now';
  const scoreEl = document.getElementById('relational-health-score');
  if (scoreEl) scoreEl.textContent = Math.round(score) + '%';
  // fire-and-forget -- refreshes the cache for the NEXT render, never
  // blocks this one. computeRelationalHealth() above already used
  // whatever was cached from the previous refresh.
  refreshEmergenceSignal();
}

// ═══════════════════════════════════════════════════════════════════
// MEANING ARCHIVE — Phase 3 (03-FEATURE-SPECS.md §Meaning,
// 02-DATA-SCHEMAS.md `MeaningEntry`). Ownership (c) joint-log, same
// shape as Vault/Codex — one shared collection. Cross-cutting/kernel-
// resident: the auto-surface prompt has to be answerable regardless of
// which tab is open when a love note/poem/feeling-share arrives, same
// reasoning as the incoming-message overlay it sits alongside.
//
// Reads "when a love note / poem / feeling-share message is sent" as
// firing for the RECEIVING side, not the sender — the compassionate
// decline copy ("it's okay if it's not your cup of tea... grateful for
// effort put into it") and the "how loved did this make you feel"
// rating only make sense from the person who received something,
// deciding whether to keep it in the shared archive.
//
// Distinct from Vault, which already auto-saves love letters/poems as
// a technical backup (saveToVault(), in receiveMessage()) — that's
// unchanged. Meaning Archive is a separate, deliberately curated
// collection with its own accept/decline ritual, referencing the same
// content by id rather than duplicating it (content_ref, matching
// §16.5's "reference, don't duplicate").
//
// Honest scope note: only wired to the message-receipt path
// (love/poem/feeling subtypes). Cocreate-output generation is also
// named in the spec as a trigger, but this pass didn't find a clean,
// already-existing hook point for it — not wired, not silently
// claimed done.
// ═══════════════════════════════════════════════════════════════════

function _meaningArchive() { return DB.get('eravors_meaning_archive', []); }
function _meaningArchiveSet(list) { DB.set('eravors_meaning_archive', list); }

function openMeaningAddPrompt(type, source, contentRef, previewText) {
  window._pendingMeaningOffer = { type, source, contentRef, previewText };
  const previewEl = document.getElementById('meaning-add-preview');
  if (previewEl) previewEl.textContent = (previewText || '').slice(0, 140);
  const modal = document.getElementById('meaning-add-modal');
  if (modal) modal.classList.add('open');
}

function closeMeaningAddPrompt() {
  const modal = document.getElementById('meaning-add-modal');
  if (modal) modal.classList.remove('open');
  window._pendingMeaningOffer = null;
}

function confirmAddToMeaning() {
  const offer = window._pendingMeaningOffer;
  if (!offer) return;
  const gratitude = document.getElementById('meaning-add-gratitude')?.value.trim() || null;
  const entry = {
    id: 'meaning_' + Date.now(),
    added_by: S.user?.name || 'me',
    ts: Date.now(),
    type: offer.type,
    source: offer.source,
    content_ref: offer.contentRef,
    caption: null,
    gratitude_note: gratitude,
    received_response: { added: true, decline_reason: null, rating: null },
  };
  const list = _meaningArchive();
  list.unshift(entry);
  _meaningArchiveSet(list);
  emitSync('meaning:added', { entry });
  closeMeaningAddPrompt();
  if (typeof renderMeaningArchive === 'function') renderMeaningArchive();
  showToast('💗 Added to your meaning archive');
}

function openMeaningDeclineForm() {
  const el = document.getElementById('meaning-decline-form');
  if (el) el.style.display = 'block';
}

function submitMeaningDecline() {
  const offer = window._pendingMeaningOffer;
  if (!offer) return;
  const reason = document.getElementById('meaning-decline-reason')?.value.trim() || null;
  const ratingEl = document.getElementById('meaning-decline-rating');
  const rating = ratingEl && ratingEl.value ? parseInt(ratingEl.value) : null;
  // Kept locally as an honest record (never overwritable, matching
  // §0.3), not synced back to the sender — the spec doesn't call for
  // real-time decline-reason visibility to the other person, and
  // surfacing "here's why I didn't archive your love note" live could
  // land harshly without more explicit design for how to soften that;
  // left as a local-only record rather than guessing.
  const entry = {
    id: 'meaning_' + Date.now(),
    added_by: S.user?.name || 'me',
    ts: Date.now(),
    type: offer.type,
    source: offer.source,
    content_ref: offer.contentRef,
    caption: null,
    gratitude_note: null,
    received_response: { added: false, decline_reason: reason, rating },
  };
  const list = _meaningArchive();
  list.unshift(entry);
  _meaningArchiveSet(list);
  closeMeaningAddPrompt();
  showToast('Okay — noted, not added');
}

// meaning:added gate registered further down, after syncStream is
// actually declared (const syncStream = new Stream()) — found via
// exactly the kind of test this codebase relies on: registering it
// here threw "Cannot access 'syncStream' before initialization" the
// moment this script ran, since const bindings aren't accessible
// before their declaration point the way function declarations are.

function drawMiniWheel(){
  const c=document.getElementById('feeling-mini-canvas');
  if(!c)return;
  const ctx=c.getContext('2d');
  if(!ctx)return; // no 2D context available (e.g. headless/test environments without canvas support)
  const w=c.width,h=c.height,cx=w/2,cy=h/2,r=cx-4;
  ctx.clearRect(0,0,w,h);
  // Draw dark background circle
  ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);
  ctx.fillStyle='rgba(8,5,10,0.8)';ctx.fill();
  const n=FEELINGS.length;
  FEELINGS.forEach((f,i)=>{
    const a1=(i/n)*Math.PI*2-Math.PI/2;
    const a2=((i+1)/n)*Math.PI*2-Math.PI/2;
    ctx.beginPath();ctx.moveTo(cx,cy);ctx.arc(cx,cy,r,a1,a2);ctx.closePath();
    ctx.fillStyle=f.color+(f.name===S.feeling.name?'ff':'55');
    ctx.fill();
    if(f.name===S.feeling.name){ctx.strokeStyle=f.color;ctx.lineWidth=2;ctx.stroke()}
  });
  ctx.beginPath();ctx.arc(cx,cy,r*0.38,0,Math.PI*2);
  ctx.fillStyle='rgba(8,5,10,.9)';ctx.fill();
  if(S.feeling.emoji){ctx.font=`${r*.45}px serif`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(S.feeling.emoji,cx,cy)}
}

// renderFeelingHistory, feelingToOracle, generateFeelingPoem now live in
// tabs/relational/feelings/feelings.js — first tab split into its own
// folder (§5.9/§5.12 — sovereign, disposable UI). Oracle/Poetry requests
// go through the oracle:seed_requested / poetry:seed_requested gates
// above instead of Feelings calling consultOracle()/generatePoem() by
// name directly.

// ═══════════════════════════════════════════════════════════════════
// PRIMING SYSTEM
// ═══════════════════════════════════════════════════════════════════
const DEFAULT_PRIMES = [
  {emoji:'🔥',name:'Passionate',desc:'Speak with fire, urgency, embodied desire, and raw creative force.'},
  {emoji:'🌊',name:'Tender',desc:'Speak with softness, deep listening, gentle presence, and oceanic care.'},
  {emoji:'⚡',name:'Electric',desc:'Speak with sharp insight, crackling energy, unexpected connections.'},
  {emoji:'🌿',name:'Grounded',desc:'Speak from earth, roots, slow wisdom, embodied simplicity.'},
  {emoji:'🌙',name:'Mystical',desc:'Speak from shadow and starlight, mystery, the unconscious, the liminal.'},
  {emoji:'🎭',name:'Playful',desc:'Speak with joy, humor, lightness, creative mischief, and delight.'},
  {emoji:'💎',name:'Precise',desc:'Speak with crystalline clarity, specificity, and exact emotional truth.'},
  {emoji:'🌀',name:'Emergent',desc:'Let form find itself. Speak from not-knowing, emergence, surprise.'},
  {emoji:'🦋',name:'Transforming',desc:'Speak from threshold, metamorphosis, becoming, the chrysalis state.'},
  {emoji:'❄️',name:'Still',desc:'Speak from deep stillness, contemplation, spacious quiet, winter wisdom.'},
  {emoji:'🌹',name:'Erotic',desc:'Speak from eros as life force — desire, beauty, creation-drive, aliveness.'},
  {emoji:'🏛',name:'Archetypal',desc:'Speak from myth, symbol, universal pattern, and Jungian depth.'},
];

function renderPrimeGrid(){
  const allPrimes=[...DEFAULT_PRIMES,...S.customPrimes];
  document.getElementById('prime-grid').innerHTML=allPrimes.map((p,i)=>`
    <div class="prime-card${S.priming?.name===p.name?' active':''}" onclick="selectPrime(${i})">
      <div class="prime-emoji">${p.emoji}</div>
      <div class="prime-name">${p.name}</div>
      <div class="prime-desc">${p.desc.slice(0,55)}...</div>
    </div>`).join('');
}

let selectedPrimeIdx = null;
function selectPrime(idx){
  selectedPrimeIdx=idx;
  document.querySelectorAll('.prime-card').forEach((el,i)=>el.classList.toggle('active',i===idx));
}
function applyPriming(){
  if(selectedPrimeIdx===null){alert('Select a priming state.');return}
  const all=[...DEFAULT_PRIMES,...S.customPrimes];
  S.priming=all[selectedPrimeIdx];
  DB.set('eravors_priming',S.priming);
  updatePrimingIndicator();
  closePriming();
  log(`Priming set: ${S.priming.emoji} ${S.priming.name}`,'ok');
  appStream.emit(new SEvent('priming:set',{name:S.priming.name}));
}
function clearPriming(){S.priming=null;DB.set('eravors_priming',null);selectedPrimeIdx=null;updatePrimingIndicator();closePriming()}
function updatePrimingIndicator(){
  const p=S.priming;
  document.getElementById('prime-active-emoji').textContent=p?p.emoji:'✦';
  document.getElementById('prime-active-name').textContent=p?p.name:'None';
  document.getElementById('prime-active-desc').textContent=p?p.desc.slice(0,70):'Click to set priming state';
}
function openPriming(){renderPrimeGrid();document.getElementById('priming-modal').classList.add('open')}
function closePriming(){document.getElementById('priming-modal').classList.remove('open')}
function addCustomPrime(){
  const emoji=document.getElementById('cp-emoji').value||'🌟';
  const name=document.getElementById('cp-name').value;
  const desc=document.getElementById('cp-desc').value;
  if(!name||!desc){alert('Fill in name and description.');return}
  S.customPrimes.push({emoji,name,desc,custom:true});
  DB.set('eravors_custom_primes',S.customPrimes);
  renderPrimeGrid();
  document.getElementById('cp-emoji').value='';
  document.getElementById('cp-name').value='';
  document.getElementById('cp-desc').value='';
}
function getPrimingPrefix(){
  if(!S.priming)return'';
  return`PRIMING STATE: ${S.priming.emoji} ${S.priming.name} — ${S.priming.desc} `;
}

// ═══════════════════════════════════════════════════════════════════
// EXPRESSION PIPELINE
// ═══════════════════════════════════════════════════════════════════
// feelingToOracle/generateFeelingPoem live here, not in
// tabs/relational/feelings/feelings.js, despite being about "the
// current feeling" — checked before assumed: feelingToOracle() is
// called from index.html's persistent header (.feeling-send-row,
// present regardless of which tab is active), and
// generateFeelingPoem() is called from tabs/poetry/poetry.html's own
// button. Both are cross-cutting, same reasoning as sendPoke staying
// in the kernel (poke.contract.json documents that one).
function feelingToOracle() {
  if (!S.feeling.name) { alert('Set your feeling first.'); return; }
  const seed = `I am feeling ${S.feeling.emoji} ${S.feeling.name} (intensity: ${S.feeling.intensity}/10). ${S.feeling.note || ''}`;
  appStream.emit(new SEvent('oracle:seed_requested', { seed, from: 'feelings' }));
}

function generateFeelingPoem() {
  if (!S.feeling.name) { alert('Set your feeling first.'); return; }
  const seed = `${S.feeling.name} — ${S.feeling.emoji} — intensity ${S.feeling.intensity}/10`;
  appStream.emit(new SEvent('poetry:seed_requested', { seed, from: 'feelings' }));
}

// Consolidated from 8 options to 5 — removed "As Poetry", "As Letter",
// and "Oracle Framing". Each duplicated a dedicated flow that already
// exists elsewhere: Poetry and Letter coaching already live in
// Messages' compose flow (generateLovePoem/generateLoveLetter), and
// Oracle framing already lives one button over (🔮 Oracle, right next
// to Express in the feeling-send-row) and in the Oracle tab itself.
// Keeping both was two paths to the same output with no real
// difference between them.
const PIPELINE_STEPS = [
  {emoji:'💬',name:'Direct Expression',desc:'Say it plainly and honestly, in your own words.'},
  {emoji:'🗣',name:'As Spoken Word',desc:'A script for saying it out loud.'},
  {emoji:'🎵',name:'As Music Suggestion',desc:'Suggest music that expresses this.'},
  {emoji:'🪞',name:'NVC Format',desc:'Express via Nonviolent Communication format.'},
  {emoji:'🌀',name:'Somatic Invitation',desc:'Invite the body into the expression.'},
];

function openPipelineModal(){
  const el=document.getElementById('pipeline-steps');
  // Same visual language as the feeling modal's own path-choice step
  // (gff-pane-3): plain stacked full-width buttons, no numbered cards,
  // no arrows — one button style for "pick one of these paths"
  // throughout the app instead of two.
  el.innerHTML=PIPELINE_STEPS.map((s,i)=>`
    <button class="btn fw pipeline-step" onclick="activatePipelineStep(${i})" style="text-align:left;justify-content:flex-start;gap:10px">
      <span>${s.emoji} ${s.name}</span>
      <span class="small" style="color:var(--dim);font-weight:400">— ${s.desc}</span>
    </button>`).join('');
  document.getElementById('pipeline-output').style.display='none';
  // FIX: clear pipeline-actions properly
  const actEl=document.getElementById('pipeline-actions');
  actEl.style.display='none';
  actEl.innerHTML='';
  document.getElementById('pipeline-modal').classList.add('open');
}
function closePipelineModal(){document.getElementById('pipeline-modal').classList.remove('open')}
async function activatePipelineStep(idx){
  document.querySelectorAll('.pipeline-step').forEach((el,i)=>el.classList.toggle('active-step',i===idx));
  const step=PIPELINE_STEPS[idx];
  const feeling=S.feeling.name?`${S.feeling.emoji} ${S.feeling.name} (intensity ${S.feeling.intensity}/10)${S.feeling.note?': '+S.feeling.note:''}`:'unnamed feeling';
  const out=document.getElementById('pipeline-output');
  out.style.display='block';
  const actEl=document.getElementById('pipeline-actions');
  actEl.style.display='none';
  actEl.innerHTML='';
  const PIPE_SYSTEM=`You are a compassionate guide helping someone express their authentic emotional state. ${getPrimingPrefix()}`;
  const prompts={
    0:`Express this feeling directly and honestly: "${feeling}". Help them find authentic words — not too polished, genuinely real.`,
    1:`Write a script for saying this feeling out loud to someone: "${feeling}". Natural spoken language.`,
    2:`Suggest 5 specific songs that express this feeling: "${feeling}". Be specific with artist and title.`,
    3:`Express this feeling in NVC format (Observation, Feeling, Need, Request): "${feeling}"`,
    4:`Create a somatic invitation — body-based practices for this feeling: "${feeling}". Specific, embodied, gentle.`,
  };
  appStream.emit(new SEvent('pipeline:activate',{step:step.name}));
  try{
    await callAI(PIPE_SYSTEM,prompts[idx],out);
    actEl.style.display='flex';
    actEl.innerHTML=`
      <button class="btn g" onclick="saveToVault('oracle',getEl('pipeline-output'))">💾 Save</button>
      <button class="btn g" onclick="copyEl('pipeline-output')">📋 Copy</button>
      <button class="btn g" onclick="speakEl('pipeline-output')">🔊 Speak</button>`;
  }catch(e){out.textContent=`Error: ${e.message}`;log(e.message,'error')}
}

async function expressToPartner(){
  if(!S.feeling.name){alert('Set your feeling first.');return}
  syncFeelingToPartner();
  await activatePipelineStep(2);
}

// ═══════════════════════════════════════════════════════════════════
// AI BACKEND
// ═══════════════════════════════════════════════════════════════════
function getEl(id){const el=document.getElementById(id);return el?el.innerText||el.value||'':''}
// getSettings() removed — returned claudeKey/claudeModel, read from the
// now-removed claude-key-ai/claude-model-ai fields, and was never
// actually called from anywhere.

// ═══════════════════════════════════════════════════════════════════
// AI ENGINE — provider hierarchy, no hard dependencies
//
// Priority order (first configured wins):
//   1. Ollama (local, self-hosted, free, private) — if bridge connected
//   2. Graceful offline — static guidance, never a broken state
//
// Used to also list OpenAI/ChatGPT, Claude (Anthropic direct API), and
// a Guardian Mode browser-session bridge here — all removed. Every one
// was a direct call to (or bridge into) a third-party-hosted AI
// service, never actually consistent with "always self-hosted"
// (01-ARCHITECTURE.md §0) even though nothing named the conflict until
// now.
//
// Every feature works without AI. AI makes it richer, not required.
// ═══════════════════════════════════════════════════════════════════

// ── Provider config ────────────────────────────────────────────────
// AI_PROVIDERS used to list OpenAI and Claude direct-API entries here —
// removed. Both are direct third-party API calls from the browser,
// which was never actually consistent with "always self-hosted"
// (01-ARCHITECTURE.md §0) even though nothing named the conflict until
// now. Ollama (OllamaBridge/OllamaClient, below) is the one real AI
// path — genuinely self-hostable, running on infrastructure the person
// controls, same principle as the signaling/TURN decision in Phase 1.

// ── Graceful offline responses per context ─────────────────────────
// When no AI is available, return something genuinely useful — not an error.
const AI_FALLBACKS = {
  oracle: [
    'The space between action and response is where wisdom lives. What would it mean to pause here?',
    'Your feelings are data, not verdicts. What is this one asking you to notice?',
    'Co-creation requires two people willing to be changed by the encounter. What are you willing to let shift?',
    'Depth is built in ordinary moments, not just extraordinary ones. What small thing matters right now?',
    'The wound and the gift often arrive together. What is this difficulty also opening?',
  ],
  poetry: [
    'Love is the architecture\nof ordinary mornings —\nthe way you reach for something\nand find me there.',
    'What we don\'t say\nlives between the words,\nthe negative space\nwhere we learn each other.',
    'Presence is not agreement.\nIt is the willingness\nto be in the same room\nwith the full truth of you.',
  ],
  needs: [
    'Beneath frustration: a need for understanding.\nBeneath silence: a need for safety.\nBeneath distance: a need for connection.',
    'Your needs are not demands. They are the architecture of what makes you feel loved.',
    'What you want to say and what you need to say are often different things. Trust the deeper one.',
  ],
  rupture: [
    'Repair is not going back to before. It is building something new from the break.',
    'The question is not who was right. The question is: what do we want to build from here?',
    'Every rupture is also a map — it shows where more safety is needed.',
  ],
  growth: [
    'Growth happens in the moments you stayed when every instinct said leave.',
    'The relationship is not a destination. It is a living system that changes as you change.',
    'Every difficult conversation you navigated is evidence of your capacity.',
  ],
  grounding: [
    'Feel your feet on the floor.\nBreathe in for 4 counts, hold for 4, out for 6.\nYou are here. That is enough.',
    'Name 5 things you can see right now.\nThis is not avoidance. This is returning to the present.',
    'Your nervous system is trying to protect you. Thank it, then gently let it know you\'re safe.',
  ],
  default: [
    'The most important thing right now may be to simply notice what\'s here.',
    'You don\'t need to resolve this right now. Sometimes witnessing is enough.',
    'What would you tell a friend in this situation? Start there.',
  ],
};

function _getOfflineFallback(context) {
  const pool = AI_FALLBACKS[context] || AI_FALLBACKS.default;
  return pool[Math.floor(Math.random() * pool.length)];
}

// ── Core callAI function ───────────────────────────────────────────
/** Real request/response bridge to guardian-lite, matching the exact
    contract the real userscript (clear-glass-lite/userscripts-to-
    install/eravos-ai-bridge.user.js) implements on the other end --
    traced directly from its own code, not guessed: it polls
    GET /query?table=eravos-ai-requests for {requestId, sys, user} rows
    it hasn't processed yet, drives whichever real provider tab is open
    to answer, then POSTs the reply to /ingest as
    {table:'eravos-ai-responses', requestId, text}. This ingests the
    request and polls for that same requestId's response, 90s ceiling
    (documented in the userscript's own header as what it expects on
    this side; its own internal give-up is 75s, so this always waits at
    least a little longer than it ever will). Returns the reply text,
    or null on timeout/failure -- callAI() falls through to the offline
    guidance either way, never throws up to the caller. */
async function _callViaAiBridge(bridgeCfg, sys, user, el) {
  const base = 'http://127.0.0.1:' + bridgeCfg.port;
  const headers = { 'Content-Type': 'application/json', 'x-cgl-token': bridgeCfg.token };
  const requestId = 'eravos-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);

  const ingestRes = await fetch(base + '/ingest', {
    method: 'POST', headers,
    body: JSON.stringify({ table: 'eravos-ai-requests', requestId, sys, user }),
  });
  if (!ingestRes.ok) throw new Error('guardian-lite refused the request (HTTP ' + ingestRes.status + ')');

  const deadline = Date.now() + 90000;
  const POLL_MS = 2500;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, POLL_MS));
    const q = await fetch(base + '/query?table=eravos-ai-responses&limit=20', { headers }).then(r => r.ok ? r.json() : null).catch(() => null);
    const rows = (q && q.rows) || [];
    const hit = rows.find(r => r.requestId === requestId);
    if (hit && typeof hit.text === 'string') {
      if (el) el.textContent = hit.text;
      return hit.text;
    }
  }
  return null; // timed out -- request stays in guardian-lite's own store, this call just gives up waiting
}

/** Real settings-UI status check, not a guess. Confirms two different
    things honestly, not conflated: (1) whether electron-main.js's own
    AI Bridge feature is even turned on and has shared a real token
    (via the same /api/ai-bridge/config this file's own callAI() uses),
    and (2) whether guardian-lite itself is actually answering, checked
    directly against its real /health endpoint rather than assumed from
    (1) alone. What this can't verify without sending a real test
    request: whether the provider tab is actually logged in — stated
    honestly in the UI copy rather than implied. */
async function checkAiBridgeStatus() {
  const el = document.getElementById('ai-bridge-status');
  if (el) el.textContent = 'Checking…';
  try {
    const cfg = await fetch('/api/ai-bridge/config').then(r => r.json());
    if (!cfg.available) {
      if (el) { el.textContent = '○ Not running'; el.style.color = 'var(--dim)'; }
      return;
    }
    const health = await fetch('http://127.0.0.1:' + cfg.port + '/health', {
      headers: { 'x-cgl-token': cfg.token },
    }).then(r => r.ok ? r.json() : null).catch(() => null);
    if (health && health.ok) {
      if (el) { el.textContent = '● Backend running — real login still required once via the tray menu if you haven\'t yet'; el.style.color = 'var(--teal)'; }
    } else {
      if (el) { el.textContent = '⚠ Token shared but guardian-lite isn\'t answering — try restarting the desktop app'; el.style.color = 'var(--rose)'; }
    }
  } catch (e) {
    if (el) { el.textContent = '⚠ ' + e.message; el.style.color = 'var(--rose)'; }
  }
}

async function callAI(sys, user, outputEl, opts) {
  opts = opts || {};
  const context = opts.context || 'default';
  const silent  = opts.silent  || false;  // don't show typing indicator

  const el = typeof outputEl === 'string' ? document.getElementById(outputEl) : outputEl;
  if (el && !silent) el.innerHTML = '<span class="typing-cursor"></span>';

  // Check master AI toggle — if off, go straight to fallback
  if (!featOn('ai_assist')) {
    const fb = _getOfflineFallback(context);
    if (el) el.textContent = fb;
    return fb;
  }

  const TEACHING_MODE = `You are a teacher and guide, never a ghostwriter, and your only job here is helping two people communicate with and understand each other better — not general-purpose assistance, not deciding things for them. Concretely:
- If asked to write something the person would send/say to their partner in their own voice (a letter, a message, an apology, vows, a text) — do NOT write it for them. Instead teach the structure and technique: what makes this kind of writing land, 2-3 concrete moves they can make, and at most one short *labeled example fragment* (never a complete, ready-to-send piece) they must still adapt in their own words.
- If asked to generate something that is honestly AI-authored content for them to read/experience (a poem in a poetry space, a ritual idea, a myth, a color palette, a music suggestion) — that's fine to produce directly, since it's clearly attributed as AI output, not impersonating them. Even here, prefer briefly naming the technique or pattern you used so they're learning something transferable, not just consuming a result.
- Prefer questions, frameworks, and "try this and notice what happens" over doing the analysis/reflection for them. Where you'd be tempted to conclude something FOR them about their relationship, instead offer the lens and let them draw the conclusion.
- Stay inside this scope: helping them express themselves to each other, and helping them understand each other better. Not financial advice, not medical advice, not general trivia, not a life-decision-maker — redirect gently back to the relationship if asked for something outside that.`;

  const fullSys = TEACHING_MODE + '\n\n' + getPrimingPrefix() + '\n' + (sys || '');
  const messages = [{ role: 'system', content: fullSys }, { role: 'user', content: user }];

  // Was a five-step chain here: Guardian Mode (browser-session bridge to
  // chatgpt.com/claude.ai), Ollama, OpenAI direct API, Claude direct API,
  // then a second Guardian/NEXUS bridge attempt. Guardian Mode and the
  // two direct-API providers are all third-party-hosted — never actually
  // consistent with "always self-hosted" (01-ARCHITECTURE.md §0) even
  // though nothing named the conflict until now.
  //
  // Direct, explicit request: replaced with the real Clear-Glass AI
  // Bridge (clear-glass-lite + guardian-lite, bundled in this repo's own
  // clear-glass-lite/ folder), routing through a real, logged-in
  // provider session instead of a self-hosted local model. A prior pass
  // through this exact codebase tried and removed this once already —
  // "required a manual token copy-paste between two processes with no
  // shared config store" — but that specific problem is actually solved
  // now: electron-main.js's own startAiBridge() mints a real token
  // (ensureGuardianToken()) and shares it with this server via
  // process.env, read live by /api/ai-bridge/config below. No manual
  // step. The other real, still-true limitation (a round trip through a
  // real browser tab and DOM adds failure surface Ollama never had) is a
  // known, accepted tradeoff, not an oversight.
  try {
    const bridgeCfg = await fetch('/api/ai-bridge/config').then(r => r.json()).catch(() => null);
    if (bridgeCfg && bridgeCfg.available) {
      log('AI → Clear-Glass Bridge', 'info');
      const result = await _callViaAiBridge(bridgeCfg, fullSys, user, el);
      if (result != null) {
        emitSync('ai:response', { text: result });
        return result;
      }
      log('Clear-Glass Bridge: no reply in time — using offline fallback', 'warn');
    }
  } catch (e) {
    log('Clear-Glass Bridge error: ' + e.message + ' — using offline fallback', 'warn');
  }
  if (el) el.innerHTML = '<span class="typing-cursor"></span>';

  // ── Graceful offline fallback ──────────────────────────────────
  // Never a broken state. Always something useful.
  log('AI → offline fallback (' + context + ')', 'info');
  const fallback = _getOfflineFallback(context);
  if (el) {
    el.innerHTML = fallback.replace(/\n/g, '<br>') +
      '<div style="margin-top:10px;font-family:var(--fm);font-size:.6rem;color:var(--dim);letter-spacing:.1em">✦ OFFLINE GUIDANCE — configure an AI provider in Settings → 🤖 AI for personalized responses</div>';
  }
  return fallback;
}

// testAIProvider() removed — tested via ai-test-result-{provider}
// elements that no longer exist since the OpenAI/Claude Test buttons
// were removed with those cards. (Correction to an earlier note near
// here: this function did actually exist — an earlier search for it
// missed the `async` prefix and wrongly concluded it was undefined.
// Confirmed no real callers before removing it now.)

// ── Guardian provider preference ──────────────────────────────────
// setGuardianProvider(), saveOpenAIKey(), saveClaudeKeyFromAI() removed —
// tied to the Guardian Mode / OpenAI / Claude direct-API cards, stripped
// per "always self-hosted" + "AI only helps communicate/understand each
// other" (01-ARCHITECTURE.md §0/§3). Found a genuine duplicate
// saveClaudeKeyFromAI() while removing this (a second, differently-
// broken copy further down the file) and testAIProvider() called from
// the (now-removed) Test buttons but never defined anywhere — moot now,
// but named rather than silently dropped.

// ORACLE — moved to tabs/relational/oracle/oracle.js as part of the
// folder-per-tab split (ORACLE_SYS, consultOracle, randomOracle, spark).

// ═══════════════════════════════════════════════════════════════════
// RELATIONAL TRACKER
// ═══════════════════════════════════════════════════════════════════
async function generateRelationalInsight(){
  const stage=document.getElementById('rel-stage').value;
  const domain=document.getElementById('rel-domain').value;
  const feeling=S.feeling.name?`Current feeling: ${S.feeling.emoji} ${S.feeling.name}.`:'';
  try{await callAI(ORACLE_SYS,`Relationship stage: ${stage}. Domain: ${domain}. ${feeling} Give specific relational insight, practices, and awareness.`,'relational-output')}
  catch(e){document.getElementById('relational-output').textContent=`Error: ${e.message}`;log(e.message,'error')}
}
function updatePulse(){
  ['conn','safe','desire','growth'].forEach(k=>{
    document.getElementById(`pulse-${k}-val`).textContent=document.getElementById(`pulse-${k}`).value;
  });
}
function saveRelationalPulse(){
  const pulse={
    conn:parseInt(document.getElementById('pulse-conn').value),
    safe:parseInt(document.getElementById('pulse-safe').value),
    desire:parseInt(document.getElementById('pulse-desire').value),
    growth:parseInt(document.getElementById('pulse-growth').value),
    ts:Date.now()
  };
  S.pulseHistory.unshift(pulse);
  DB.set('eravors_pulse',S.pulseHistory);
  renderPulseHistory();
  log('Pulse saved','ok');
  appStream.emit(new SEvent('pulse:save',pulse));
}
async function generatePulseInsight(){
  const out=document.getElementById('pulse-output');
  out.style.display='block';
  const c=document.getElementById('pulse-conn').value,s=document.getElementById('pulse-safe').value,d=document.getElementById('pulse-desire').value,g=document.getElementById('pulse-growth').value;
  try{await callAI(ORACLE_SYS,`Relationship pulse reading: Connection ${c}/10, Safety ${s}/10, Desire/Aliveness ${d}/10, Growth ${g}/10. Interpret this pattern and offer specific guidance.`,out)}
  catch(e){out.textContent=`Error: ${e.message}`;log(e.message,'error')}
}
function renderPulseHistory(){
  const el=document.getElementById('pulse-history');
  if(!el)return;
  if(!S.pulseHistory.length){el.innerHTML='<div class="small italic" style="padding:20px;text-align:center;grid-column:1/-1;color:var(--dim)">No readings yet.</div>';return}
  el.innerHTML=S.pulseHistory.slice(0,12).map(p=>`
    <div class="card" style="padding:14px">
      <div class="small" style="margin-bottom:8px">${new Date(p.ts).toLocaleDateString()}</div>
      <div class="small">❤ ${p.conn}/10 &nbsp; 🛡 ${p.safe}/10 &nbsp; 🔥 ${p.desire}/10 &nbsp; 🌱 ${p.growth}/10</div>
      <div class="int-bar mt8"><div class="int-fill" style="width:${(p.conn+p.safe+p.desire+p.growth)/40*100}%;background:linear-gradient(90deg,var(--fire),var(--teal))"></div></div>
    </div>`).join('');
}

// ═══════════════════════════════════════════════════════════════════
// RUPTURE TRACKER — moved to tabs/rupture/rupture.js as part of the
// folder-per-tab split (openRuptureForm/getRuptureGuidance/saveRupture/
// renderRuptures/growthFromRupture/cycleRuptureStatus/deleteRupture/
// renderRuptureList/openRepairFlow/markRepairStep/getRepairGuidance/
// markRuptureResolved). A real duplicate renderRuptures() definition
// found further down in this same file during that extraction --
// merged correctly there, not left as two competing copies.


// GROWTH TRACKER + QUESTION LOOPS — moved to tabs/relational/growth/growth.js
// as part of the folder-per-tab split (renderGrowth/saveGrowth/deleteGrowth/
// generateGrowthIdeas/suggestQuestion/askQuestion/answerQuestion/renderQuestionLoops).



// ═══════════════════════════════════════════════════════════════════
// IDEAS
// ═══════════════════════════════════════════════════════════════════
const IDEA_META={romance:'romantic gestures, erotic connection, sensual experiences',creativity:'art projects, collaborative art, visual expression',adventure:'spontaneous adventures, outdoor experiences, boundary-pushing',growth:'healing, therapy exercises, shadow work',ritual:'ceremonies, seasonal rituals, daily practices',writing:'poetry forms, journaling, collaborative writing',music:'music creation, listening rituals, sound healing',selfcare:'self-love, body appreciation, nourishment',cocreation:'joint projects, collaborative art, shared visions',wild:'completely unexpected, boundary-dissolving, emergent'};
async function generateIdeas(){
  const seed=document.getElementById('idea-seed').value;
  const cat=document.getElementById('idea-category').value;
  const count=document.getElementById('idea-count').value;
  document.getElementById('ideas-grid').innerHTML='';
  document.getElementById('ideas-load').style.display='block';
  const feeling=S.feeling.name?`Current feeling state: ${S.feeling.emoji} ${S.feeling.name}.`:'';
  try{
    const proxy=document.createElement('div');proxy.style.display='none';document.body.appendChild(proxy);
    const text=await callAI(`You generate vivid, specific, actionable creative ideas. Draw from Esther Perel, Gottman, Joseph Campbell, somatic therapy, design thinking. ${getPrimingPrefix()}`,
      `Generate exactly ${count} ideas: category "${cat}" (${IDEA_META[cat]}). ${seed?`Seed: "${seed}".`:''} ${feeling}
Output ONLY valid JSON array: [{"title":"...","description":"...","tags":["..."],"intensity":"low|medium|high|wild"}]`,proxy);
    document.body.removeChild(proxy);
    document.getElementById('ideas-load').style.display='none';
    let ideas;try{const c=text.replace(/```json|```/g,'').trim();ideas=JSON.parse(c)}catch{const m=text.match(/\[[\s\S]*\]/);if(m)ideas=JSON.parse(m[0]);else throw new Error('JSON parse failed')}
    const grid=document.getElementById('ideas-grid');
    grid.innerHTML='';
    ideas.forEach(idea=>{
      const card=document.createElement('div');
      // FIX: use .idea-card class which is now properly defined
      card.className='idea-card';
      const pct={low:25,medium:55,high:80,wild:100}[idea.intensity]||50;
      const tags=(idea.tags||[]).map(t=>`<span class="tag">${t}</span>`).join('');
      card.innerHTML=`<div style="font-family:var(--fm);font-size:.6rem;letter-spacing:.18em;color:var(--cyan);margin-bottom:5px">${cat.toUpperCase()}</div>
        <div style="font-weight:600;font-size:.98rem;margin-bottom:4px">${idea.title}</div>
        <div class="small">${idea.description}</div>
        <div class="int-bar"><div class="int-fill" style="width:${pct}%"></div></div>
        <div class="flex ac gap8 mt8">${tags}<button class="btn g" style="margin-left:auto;padding:3px 9px;font-size:.68rem" onclick="saveToVault('idea','${(idea.title+': '+idea.description).replace(/'/g,"\\'")}')">💾</button>
        <button class="btn g" style="padding:3px 9px;font-size:.68rem" onclick="sendToMutatorText('${(idea.title+': '+idea.description).replace(/'/g,"\\'")}')">🎨</button></div>`;
      grid.appendChild(card);
    });
    log(`Generated ${ideas.length} ideas`,'ok');
  }catch(e){document.getElementById('ideas-load').style.display='none';document.getElementById('ideas-grid').innerHTML=`<div class="card" style="color:var(--rose)">Error: ${e.message}</div>`;log(e.message,'error')}
}

// ═══════════════════════════════════════════════════════════════════
// POETRY
// ═══════════════════════════════════════════════════════════════════
const POETRY_SYS=`You are a master poet channeling eros, longing, and the sacred. Your tradition: Neruda, Rumi, Mary Oliver, Sappho, spoken word. Poems are specific, embodied, surprising, emotionally true. No clichés. Unexpected imagery. You honor feelings and priming state.`;
async function generatePoem(){
  const theme=document.getElementById('poem-theme').value||'the ache of love';
  const form=document.getElementById('poem-form').value;
  const forms={free:'free verse 12-20 lines',haiku:'sequence of 5 haiku',sonnet:'Shakespearean sonnet',ghazal:'ghazal 7 couplets',prose:'prose poem 1-2 paragraphs',ode:'ode 3 stanzas',love_letter:'poetic love letter 15-20 lines',erasure:'erasure poem'};
  appStream.emit(new SEvent('poetry:generate',{theme,form}));
  try{await callAI(POETRY_SYS,`Write ${forms[form]} about: "${theme}". Just the poem.`,'poem-output',{context:'poetry'})}
  catch(e){document.getElementById('poem-output').textContent=`Error: ${e.message}`;log(e.message,'error')}
}
async function randomPoem(){
  const themes=['the color of missing you','hands that built and held','desire returning in autumn','the first morning you stayed','the body as home'];
  document.getElementById('poem-theme').value=themes[Math.floor(Math.random()*themes.length)];
  const forms=['free','haiku','prose','ode','love_letter'];
  document.getElementById('poem-form').value=forms[Math.floor(Math.random()*forms.length)];
  await generatePoem();
}
async function writingPrompt(){
  try{await callAI('Generate one specific, evocative writing prompt for exploring love or inner life. Open a door, not close one.','One writing prompt. Just the prompt.','writing-prompt-out')}
  catch(e){document.getElementById('writing-prompt-out').textContent=`Error: ${e.message}`;log(e.message,'error')}
}

// ═══════════════════════════════════════════════════════════════════
// RITUALS + TIMER
// ═══════════════════════════════════════════════════════════════════
async function generateRitual(){
  const intention=document.getElementById('ritual-intention').value||'new beginning';
  const mode=document.getElementById('ritual-mode').value;
  const duration=document.getElementById('ritual-duration').value;
  appStream.emit(new SEvent('ritual:generate',{intention}));
  try{await callAI(`You design sacred ceremonies. Somatic awareness, Jungian symbolism, attachment theory. Rituals have opening, body, closing. Specific, beautiful, transformative. ${getPrimingPrefix()}`,
    `Design a ${duration}-minute ${mode} ritual for: "${intention}". Include materials, setting, opening, main practice, closing, integration.`,'ritual-output')}
  catch(e){document.getElementById('ritual-output').textContent=`Error: ${e.message}`;log(e.message,'error')}
}
let timerInterval=null,timerSecs=0,timerRunning=false;
function startTimer(){if(timerRunning)return;if(timerSecs===0)timerSecs=parseInt(document.getElementById('timer-set').value)*60;timerRunning=true;timerInterval=setInterval(()=>{timerSecs--;if(timerSecs<=0){clearInterval(timerInterval);timerRunning=false;timerSecs=0;document.getElementById('ritual-timer-display').textContent='✦'}updateTimerDisplay()},1000)}
function pauseTimer(){clearInterval(timerInterval);timerRunning=false}
function resetTimer(){clearInterval(timerInterval);timerRunning=false;timerSecs=0;updateTimerDisplay()}
function updateTimerDisplay(){const m=String(Math.floor(timerSecs/60)).padStart(2,'0'),s=String(timerSecs%60).padStart(2,'0');document.getElementById('ritual-timer-display').textContent=`${m}:${s}`}

// ═══════════════════════════════════════════════════════════════════
// CO-CREATE + CARDS
// ═══════════════════════════════════════════════════════════════════
async function generateCoCreate(){
  const p1=document.getElementById('person1').value||'You',p2=document.getElementById('person2').value||'Your partner';
  const seed=document.getElementById('cocreate-seed').value||'something beautiful';
  const fw=document.getElementById('cocreate-framework').value;
  appStream.emit(new SEvent('cocreate:generate',{fw}));
  try{await callAI(`Expert in collaborative creativity and relationship psychology. Synthesizes Gottman, EFT, Imago, Polyvagal, Design Thinking, Emergent Strategy. ${getPrimingPrefix()}`,
    `${p1} and ${p2} want to: "${seed}". Framework: ${fw}. Provide: 1) Emergence map 2) Three first steps 3) How this deepens connection 4) Creative friction points and how to use them generatively`,'cocreate-output')}
  catch(e){document.getElementById('cocreate-output').textContent=`Error: ${e.message}`;log(e.message,'error')}
}
async function drawCard(){
  const deck=document.getElementById('card-deck').value;
  appStream.emit(new SEvent('card:draw',{deck}));
  try{await callAI(`You create profound conversation questions for couples and creative partners. ${getPrimingPrefix()}`,
    `ONE conversation card question for "${deck}" deck. Specific, opening, reveals something true. Just the question.`,'card-output')}
  catch(e){document.getElementById('card-output').textContent=`Error: ${e.message}`;log(e.message,'error')}
}

// ═══════════════════════════════════════════════════════════════════
// SOMATIC / NEEDS
// ═══════════════════════════════════════════════════════════════════
// generateSomaticGuidance, findNeeds now live in
// tabs/relational/feelings/feelings.js

// ═══════════════════════════════════════════════════════════════════
// CODEX
// ═══════════════════════════════════════════════════════════════════
function openCodexForm(){document.getElementById('codex-form').style.display='block'}
function saveCodexEntry(){
  const title=document.getElementById('codex-title').value;
  const content=document.getElementById('codex-content').value;
  if(!title||!content){alert('Fill in title and content.');return}
  const entry={id:Date.now(),title,type:document.getElementById('codex-type').value,tags:document.getElementById('codex-tags').value.split(',').map(t=>t.trim()).filter(Boolean),content,ts:Date.now()};
  S.codex.unshift(entry);DB.set('eravors_codex',S.codex);renderCodex();
  document.getElementById('codex-form').style.display='none';
  log(`Codex entry saved: ${title}`,'ok');
  appStream.emit(new SEvent('codex:save',{type:entry.type}));
}
function sendToCodex(sourceId,defaultTitle){
  const text=getEl(sourceId);if(!text||text.includes('await'))return;
  const entry={id:Date.now(),title:defaultTitle+' — '+new Date().toLocaleDateString(),type:'creation',tags:[],content:text,ts:Date.now()};
  S.codex.unshift(entry);DB.set('eravors_codex',S.codex);
  log(`Sent to codex: ${defaultTitle}`,'ok');
}
async function generateCodexSummary(){
  const titles=S.codex.slice(0,20).map(e=>`${e.type}: ${e.title}`).join('\n');
  if(!titles){alert('Add some codex entries first.');return}
  const out=document.getElementById('codex-summary-out');out.style.display='block';
  try{await callAI(`You synthesize and find meaning in a collection of sacred records, insights, and creative works. ${getPrimingPrefix()}`,
    `Review these codex entries and generate a synthesis — patterns, themes, what wants to emerge, and what this person/couple is becoming:\n${titles}`,out)}
  catch(e){out.textContent=`Error: ${e.message}`;log(e.message,'error')}
}
function renderCodex(){
  const el=document.getElementById('codex-list');if(!el)return;
  if(!S.codex.length){el.innerHTML='<div class="small italic text-center" style="padding:40px;grid-column:1/-1;color:var(--dim)">Codex is empty.</div>';return}
  const icons={insight:'💡',memory:'🏛',vow:'🤝',symbol:'🔮',pattern:'🌀',dream:'🌙',creation:'✨'};
  el.innerHTML=S.codex.map(e=>`
    <div class="codex-entry">
      <div class="codex-type">${icons[e.type]||'•'} ${e.type.toUpperCase()}</div>
      <div class="codex-title">${e.title}</div>
      <div class="small" style="margin:4px 0;max-height:60px;overflow:hidden">${e.content.slice(0,150)}${e.content.length>150?'…':''}</div>
      <div class="flex gap8 mt8 wrap">${e.tags.map(t=>`<span class="tag">${t}</span>`).join('')}
        <button class="btn g" style="margin-left:auto;padding:3px 8px;font-size:.65rem" onclick="deleteCodex(${e.id})">🗑</button>
        <button class="btn g" style="padding:3px 8px;font-size:.65rem" onclick="sendToMutatorText('${e.content.replace(/'/g,"\\'").slice(0,300)}')">🎨 Mutate</button>
      </div>
    </div>`).join('');
}
function deleteCodex(id){S.codex=S.codex.filter(x=>x.id!==id);DB.set('eravors_codex',S.codex);renderCodex()}
function exportCodex(){
  const blob=new Blob([JSON.stringify(S.codex,null,2)],{type:'application/json'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`codex-${Date.now()}.json`;a.click();
}

// ═══════════════════════════════════════════════════════════════════
// MYTHOS
// ═══════════════════════════════════════════════════════════════════
const ARCHETYPES=[
  {name:'The Lovers',emoji:'💑',desc:'Sacred union, polarity, choice'},
  {name:'The Hero',emoji:'⚔',desc:'Journey, courage, transformation'},
  {name:'The Shadow',emoji:'🌑',desc:'Hidden self, projection, gold in darkness'},
  {name:'The Great Mother',emoji:'🌸',desc:'Nourishment, creation, cycles'},
  {name:'The Wise One',emoji:'🦉',desc:'Depth, guidance, inner knowing'},
  {name:'The Trickster',emoji:'🦊',desc:'Chaos, creativity, rule-breaking'},
  {name:'The Child',emoji:'🌟',desc:'Wonder, potential, innocence'},
  {name:'The Destroyer',emoji:'🔥',desc:'Endings, pruning, fierce love'},
];
function renderArchetypes(){
  const el=document.getElementById('archetype-grid');if(!el)return;
  el.innerHTML=ARCHETYPES.map(a=>`
    <div class="mythos-card" onclick="selectArchetype('${a.name}')">
      <div class="mythos-archetype">${a.emoji} ${a.name}</div>
      <div class="small">${a.desc}</div>
    </div>`).join('');
}
function selectArchetype(name){
  document.getElementById('mythos-seed').value=name;
  document.getElementById('mythos-type').value='archetype';
}
async function generateMythos(){
  const type=document.getElementById('mythos-type').value;
  const seed=document.getElementById('mythos-seed').value||'our story';
  const tone=document.getElementById('mythos-tone').value;
  const feeling=S.feeling.name?`Current feeling: ${S.feeling.emoji} ${S.feeling.name}.`:'';
  appStream.emit(new SEvent('mythos:generate',{type}));
  try{await callAI(`You are a mythmaker weaving archetypes, symbols, and sacred narrative. Draw from Jungian depth, Campbell's Hero Journey, world mythology, and erotic spiritual traditions. Your myths feel ancient and immediate. ${getPrimingPrefix()}`,
    `Create a ${type} with ${tone} tone, about/for: "${seed}". ${feeling} Make it vivid, symbolic, emotionally true, and numinous.`,'mythos-output')}
  catch(e){document.getElementById('mythos-output').textContent=`Error: ${e.message}`;log(e.message,'error')}
}

// ═══════════════════════════════════════════════════════════════════
// VOICE-TO-TEXT — opt-in dictation for text fields. Built generic so
// it isn't a one-off wired only to mythos-seed: any input/textarea with
// a "<id>-mic-btn" button and an "<id>-voice-toggle" checkbox next to
// it gets the same behavior. Currently wired to mythos-seed (the field
// that actually feeds generateMythos()); the lattice itself has no
// text entry of its own (buildLatticeData() only ever *reads* — from
// Codex, Vault, Ruptures, etc.), so speaking builds the lattice
// indirectly: whatever gets said into the seed becomes the myth, and
// saveToVault()/sendToCodex() on that myth is what buildLatticeData()
// tokenizes into the constellation. Same pattern would extend cleanly
// to the Vault entry field or Codex if that's wanted too.
//
// Uses the browser's own SpeechRecognition — no server, no API key,
// nothing leaves the device. Chrome/Edge/Safari support it; Firefox
// currently doesn't, so unsupported browsers get a plain explanation
// instead of a silently broken toggle.
let _voiceRecognition   = null;
let _voiceActiveField   = null;
let _voiceSessionFinal  = '';
let _voiceBaseValue     = '';

function _speechRecognitionCtor() {
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

function isVoiceToTextSupported() {
  return !!_speechRecognitionCtor();
}

// Checkbox next to the field — persists per-field so the mic button
// only appears once someone's explicitly opted in (mic-permission UI
// is intrusive enough that it shouldn't just appear unasked).
function toggleVoiceToText(fieldId, enabled) {
  const checkbox = document.getElementById(fieldId + '-voice-toggle');
  if (enabled && !isVoiceToTextSupported()) {
    if (checkbox) checkbox.checked = false;
    showToast('⚠ Voice input isn\'t supported in this browser — try Chrome, Edge, or Safari.');
    return;
  }
  DB.set('voice_to_text_' + fieldId, enabled);
  const btn = document.getElementById(fieldId + '-mic-btn');
  if (btn) btn.style.display = enabled ? '' : 'none';
  if (!enabled && _voiceActiveField === fieldId) stopVoiceDictation();
}

// Called from each tab's init renderer to restore whether the mic
// button should be visible, since the checkbox preference persists
// across sessions but the DOM is rebuilt on every tab (re)load.
function initVoiceToggleUI(fieldId) {
  const on = DB.get('voice_to_text_' + fieldId, false) === true && isVoiceToTextSupported();
  const checkbox = document.getElementById(fieldId + '-voice-toggle');
  const btn = document.getElementById(fieldId + '-mic-btn');
  if (checkbox) checkbox.checked = on;
  if (btn) btn.style.display = on ? '' : 'none';
}

function startVoiceDictation(fieldId) {
  if (_voiceActiveField === fieldId) { stopVoiceDictation(); return; }
  if (_voiceActiveField) stopVoiceDictation(); // only one field dictates at a time
  const Ctor = _speechRecognitionCtor();
  if (!Ctor) { showToast('⚠ Voice input isn\'t supported in this browser.'); return; }
  const input = document.getElementById(fieldId);
  if (!input) return;

  _voiceBaseValue = input.value || '';
  _voiceSessionFinal = '';
  _voiceActiveField = fieldId;

  const rec = new Ctor();
  rec.lang = (navigator.language || 'en-US');
  rec.continuous = true;
  rec.interimResults = true;

  rec.onresult = (event) => {
    let interim = '', final = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const t = event.results[i][0].transcript;
      if (event.results[i].isFinal) final += t; else interim += t;
    }
    if (final) _voiceSessionFinal += final;
    const joiner = _voiceBaseValue && !/\s$/.test(_voiceBaseValue) ? ' ' : '';
    input.value = _voiceBaseValue + joiner + _voiceSessionFinal + interim;
  };
  rec.onerror = (event) => {
    if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
      showToast('⚠ Microphone access was blocked — check your browser permissions.');
    } else if (event.error !== 'no-speech' && event.error !== 'aborted') {
      showToast('⚠ Voice input error: ' + event.error);
    }
  };
  rec.onend = () => {
    if (_voiceActiveField === fieldId) { _voiceActiveField = null; _setMicButtonState(fieldId, false); }
  };

  try { rec.start(); }
  catch (e) { _voiceActiveField = null; showToast('⚠ Could not start voice input: ' + e.message); return; }
  _voiceRecognition = rec;
  _setMicButtonState(fieldId, true);
}

function stopVoiceDictation() {
  if (_voiceRecognition) { try { _voiceRecognition.stop(); } catch (e) {} }
  const fieldId = _voiceActiveField;
  _voiceRecognition = null;
  _voiceActiveField = null;
  if (fieldId) _setMicButtonState(fieldId, false);
}

function _setMicButtonState(fieldId, recording) {
  const btn = document.getElementById(fieldId + '-mic-btn');
  if (!btn) return;
  btn.textContent = recording ? '⏹️' : '🎙️';
  btn.title = recording ? 'Stop dictating' : 'Click and speak';
  btn.classList.toggle('voice-recording', recording);
}
function sendToMutator(sourceId){const text=getEl(sourceId);if(text){switchTab('mutator');document.getElementById('mutator-source').value=text}}
function sendToMutatorText(text){switchTab('mutator');document.getElementById('mutator-source').value=text}

// ═══════════════════════════════════════════════════════════════════
// IMAGE MUTATOR
// ═══════════════════════════════════════════════════════════════════
async function generateImagePrompts(){
  const source=document.getElementById('mutator-source').value;
  if(!source.trim()){alert('Paste source text first.');return}
  const style=document.getElementById('mutator-style').value;
  const strength=document.getElementById('mutation-strength').value;
  const strengthDesc=['faithful to source','slightly interpreted','moderately transformed','strongly mutated','radically reimagined'];
  S.lastMutatorSource=source;
  appStream.emit(new SEvent('mutator:generate',{style}));
  try{
    const proxy=document.createElement('div');proxy.style.display='none';document.body.appendChild(proxy);
    const text=await callAI(`You generate vivid, specific image generation prompts for AI art systems like Midjourney, DALL-E, and Stable Diffusion. You understand composition, lighting, mood, and visual storytelling.`,
      `Source text: "${source.slice(0,400)}"
Visual style: ${style}. Mutation strength: ${strength}/5 (${strengthDesc[strength-1]}).
Generate 4 distinct image prompts. Each should be 2-4 sentences, visually specific, emotionally evocative.
Output ONLY valid JSON: [{"prompt":"...","aspect":"square|wide|portrait","mood":"..."}]`,proxy);
    document.body.removeChild(proxy);
    let prompts;try{const c=text.replace(/```json|```/g,'').trim();prompts=JSON.parse(c)}catch{const m=text.match(/\[[\s\S]*\]/);if(m)prompts=JSON.parse(m[0]);else throw new Error('JSON parse failed')}
    S.lastGeneratedPrompts=prompts;
    renderMutatorPrompts(prompts);
    log(`Generated ${prompts.length} image prompts`,'ok');
  }catch(e){document.getElementById('mutator-prompts').innerHTML=`<div style="color:var(--rose)">Error: ${e.message}</div>`;log(e.message,'error')}
}
async function mutatePrompts(){
  if(!S.lastMutatorSource&&!S.lastGeneratedPrompts.length){alert('Generate prompts first.');return}
  const newSource=S.lastGeneratedPrompts.length?S.lastGeneratedPrompts.map(p=>p.prompt).join(' | '):S.lastMutatorSource;
  document.getElementById('mutator-source').value=newSource.slice(0,500);
  const str=Math.min(5,parseInt(document.getElementById('mutation-strength').value)+1);
  document.getElementById('mutation-strength').value=str;
  await generateImagePrompts();
}
function renderMutatorPrompts(prompts){
  const el=document.getElementById('mutator-prompts');
  el.innerHTML=prompts.map((p,i)=>`
    <div class="card" style="padding:14px">
      <div class="flex jb ac" style="margin-bottom:8px">
        <span style="font-family:var(--fm);font-size:.65rem;color:var(--cyan)">PROMPT ${i+1} · ${(p.aspect||'square').toUpperCase()}</span>
        <span class="small">${p.mood||''}</span>
      </div>
      <div style="font-size:.9rem;line-height:1.65;font-style:italic">${p.prompt}</div>
      <div class="flex gap8 mt10">
        <button class="btn g" onclick="navigator.clipboard.writeText('${p.prompt.replace(/'/g,"\\'").replace(/\n/g,' ')}').then(()=>log('Copied prompt','ok'))">📋 Copy</button>
        <button class="btn g" onclick="saveToVault('note','Image Prompt: ${p.prompt.replace(/'/g,"\\'").replace(/\n/g,' ')}')">💾 Save</button>
        <button class="btn g" onclick="sendToCodex_direct('Image Prompt ${i+1}','${p.prompt.replace(/'/g,"\\'").replace(/\n/g,' ')}')">📖 Codex</button>
      </div>
    </div>`).join('');
}
function sendToCodex_direct(title,content){
  S.codex.unshift({id:Date.now(),title,type:'creation',tags:['image-prompt'],content,ts:Date.now()});
  DB.set('eravors_codex',S.codex);log(`Saved to codex: ${title}`,'ok');
}
async function generatePalette(){
  const source=document.getElementById('palette-source').value;
  let sourceText='';
  if(source==='oracle')sourceText=getEl('oracle-output');
  else if(source==='poem')sourceText=getEl('poem-output');
  else if(source==='mythos')sourceText=getEl('mythos-output');
  else if(source==='feeling')sourceText=S.feeling.name?`${S.feeling.emoji} ${S.feeling.name} — ${S.feeling.body||''}`:'' ;
  else if(source==='vault'&&S.vault.length)sourceText=S.vault[0].text;
  if(!sourceText||sourceText.includes('await')){alert('Generate content in the source tab first.');return}
  try{
    const proxy=document.createElement('div');proxy.style.display='none';document.body.appendChild(proxy);
    const text=await callAI('You are a visual artist and color theorist. You translate emotional and textual content into specific, evocative visual palettes.',
      `Source: "${sourceText.slice(0,300)}". Generate a visual palette concept with: 1) 5 specific hex colors with names 2) The visual mood/atmosphere 3) Typography suggestions 4) Texture/material references. Output JSON: {"colors":[{"hex":"#...","name":"..."}],"mood":"...","typography":"...","textures":"..."}`,proxy);
    document.body.removeChild(proxy);
    let palette;try{const c=text.replace(/```json|```/g,'').trim();palette=JSON.parse(c)}catch{const m=text.match(/\{[\s\S]*\}/);if(m)palette=JSON.parse(m[0]);else throw new Error('JSON parse failed')}
    document.getElementById('palette-output').textContent=`${palette.mood}\n\nTypography: ${palette.typography}\nTextures: ${palette.textures}`;
    const swEl=document.getElementById('palette-swatches');
    swEl.innerHTML=(palette.colors||[]).map(c=>`
      <div title="${c.name}" onclick="navigator.clipboard.writeText('${c.hex}')" style="cursor:pointer;width:52px;height:52px;border-radius:10px;background:${c.hex};border:1px solid rgba(255,255,255,.1);display:flex;align-items:flex-end;justify-content:center;padding:4px">
        <span style="font-family:var(--fm);font-size:.55rem;color:#fff;text-shadow:0 1px 3px rgba(0,0,0,.8)">${c.hex}</span>
      </div>`).join('');
    log('Palette generated','ok');
  }catch(e){document.getElementById('palette-output').textContent=`Error: ${e.message}`;log(e.message,'error')}
}

// ═══════════════════════════════════════════════════════════════════
// MUSIC + BINAURAL
// ═══════════════════════════════════════════════════════════════════
async function generateMusicRec(){
  const mood=document.getElementById('music-mood-input').value||'present and open';
  const vibe=document.getElementById('music-vibe').value;
  const feeling=S.feeling.name?`Current feeling: ${S.feeling.emoji} ${S.feeling.name}.`:'';
  try{await callAI(`Master music curator for emotional and relational states. Understand music across all genres. Know how music affects nervous system and attachment. ${getPrimingPrefix()}`,
    `${feeling} Mood: "${mood}". Atmosphere: ${vibe}. Create playlist: 5-7 specific songs (artist + title), arc description, optimal setting, why this music serves this state. Be specific.`,'music-output')}
  catch(e){document.getElementById('music-output').textContent=`Error: ${e.message}`;log(e.message,'error')}
}
let audioCtx=null,oscL=null,oscR=null,gainNode=null;
function startTone(){stopTone();audioCtx=new(window.AudioContext||window.webkitAudioContext)();const merger=audioCtx.createChannelMerger(2);gainNode=audioCtx.createGain();gainNode.gain.value=parseInt(document.getElementById('vol-range').value)/100*.3;oscL=audioCtx.createOscillator();oscR=audioCtx.createOscillator();oscL.type='sine';oscR.type='sine';const gL=audioCtx.createGain();const gR=audioCtx.createGain();gL.gain.value=1;gR.gain.value=1;oscL.connect(gL);gL.connect(merger,0,0);oscR.connect(gR);gR.connect(merger,0,1);merger.connect(gainNode);gainNode.connect(audioCtx.destination);updateTone();oscL.start();oscR.start();log('Binaural tone started','ok')}
function stopTone(){try{oscL?.stop();oscR?.stop();audioCtx?.close()}catch{}audioCtx=oscL=oscR=gainNode=null}
function updateTone(){const l=parseInt(document.getElementById('hz-left').value),r=parseInt(document.getElementById('hz-right').value);document.getElementById('beat-freq').textContent=Math.abs(r-l);if(oscL)oscL.frequency.value=l;if(oscR)oscR.frequency.value=r;if(gainNode)gainNode.gain.value=parseInt(document.getElementById('vol-range').value)/100*.3}
function setPreset(l,r){document.getElementById('hz-left').value=l;document.getElementById('hz-right').value=r;document.getElementById('hz-left-val').textContent=l;document.getElementById('hz-right-val').textContent=r;updateTone()}

// ═══════════════════════════════════════════════════════════════════
// CANVAS
// ═══════════════════════════════════════════════════════════════════
async function enhanceCanvas(){
  const text=document.getElementById('canvas-text').value;
  const mode=document.getElementById('canvas-mode').value;
  if(!text.trim()){alert('Write something first.');return}
  const m={free:'Enhance this free writing. Deepen emotional truth.',intention:'Make these intentions specific, embodied, alive.',gratitude:'Transform into a beautiful gratitude meditation.',vision:'Make this vision vivid, specific, sensory.',shadow:'Engage this shadow material with wisdom and compassion.',letter:'Refine to be more emotionally honest and beautiful.',stream:'Find the thread running through this. What wants to be said?'};
  appStream.emit(new SEvent('canvas:enhance',{mode}));
  try{await callAI(`Creative partner and wise mirror. ${m[mode]} ${getPrimingPrefix()}`,text,'canvas-enhance-output')}
  catch(e){document.getElementById('canvas-enhance-output').textContent=`Error: ${e.message}`;log(e.message,'error')}
}
function handleDragOver(e){e.preventDefault();document.getElementById('upload-zone').classList.add('drag')}
function handleDrop(e){e.preventDefault();document.getElementById('upload-zone').classList.remove('drag');handleFiles(e.dataTransfer.files)}
function handleFileUpload(e){handleFiles(e.target.files)}
function handleFiles(files){
  Array.from(files).forEach(file=>{
    const div=document.createElement('div');
    div.className='flex ac gap12';div.style.cssText='padding:10px;border:1px solid var(--border2);border-radius:8px';
    div.innerHTML=`<span>${file.type.startsWith('image')?'🖼':file.name.endsWith('.json')?'📋':'📄'}</span>
      <div style="flex:1"><div style="font-size:.88rem">${file.name}</div><div class="small">${(file.size/1024).toFixed(1)} KB</div></div>
      <button class="btn g" style="font-size:.7rem">→ Canvas</button>`;
    div._file=file;
    div.querySelector('button').onclick=()=>{const r=new FileReader();r.onload=e=>{ document.getElementById('canvas-text').value=e.target.result};r.readAsText(file)};
    document.getElementById('file-list').appendChild(div);
    if(file.name.endsWith('.json')){const r=new FileReader();r.onload=e=>{try{const d=JSON.parse(e.target.result);if(Array.isArray(d)&&d[0]?.type){importVault(d);log(`Imported vault from ${file.name}`,'ok')}}catch{log('Invalid JSON','warn')}};r.readAsText(file)}
    appStream.emit(new SEvent('file:upload',{name:file.name}));log(`File: ${file.name}`,'ok');
  });
}

// ═══════════════════════════════════════════════════════════════════
// VAULT
// ═══════════════════════════════════════════════════════════════════
function saveToVault(type,text){
  if(!text||!text.trim()||text.includes('awaiting')||text.includes('Awaiting'))return;
  S.vault.unshift({id:Date.now(),type,text:text.trim(),created:new Date().toISOString()});
  if(S.vault.length>500)S.vault=S.vault.slice(0,500);
  DB.set('eravors_vault',S.vault);renderVault();
  log(`Vault: ${type}`,'ok');appStream.emit(new SEvent('vault:save',{type}));
}
/**
 * saveMediaToVault(mediaType, dataUrl, caption, ts) -- the real path for
 * chat image/video messages, separate from saveToVault() above since
 * that one requires non-empty text and has no concept of a media
 * payload at all. `ts` is the real message send time (not save time --
 * "with the date" per the original request means the moment it was
 * actually sent/shared, which is more meaningful than whenever this
 * device happened to receive/process it).
 */
function saveMediaToVault(mediaType, dataUrl, caption, ts){
  if(!dataUrl) return null;
  const item = { id: Date.now(), type: 'media', mediaType, mediaUrl: dataUrl,
                 text: caption || '', created: new Date(ts || Date.now()).toISOString() };
  S.vault.unshift(item);
  if(S.vault.length>500)S.vault=S.vault.slice(0,500);
  DB.set('eravors_vault',S.vault);
  if (typeof renderVault === 'function') renderVault();
  log(`Vault: media (${mediaType})`,'ok');
  appStream.emit(new SEvent('vault:save',{type:'media'}));
  return item;
}
function importVault(items){S.vault=[...items,...S.vault];DB.set('eravors_vault',S.vault);renderVault()}
function renderVault(){
  const filter=document.getElementById('vault-filter')?.value||'all';
  const el=document.getElementById('vault-grid');if(!el)return;
  const items=filter==='all'?S.vault:S.vault.filter(i=>i.type===filter);
  if(!items.length){el.innerHTML='<div class="small italic text-center" style="padding:40px;color:var(--dim)">Vault is empty.</div>';return}
  const icons={oracle:'🔮',poem:'📜',ritual:'🕯',cocreation:'🤝',idea:'💡',note:'📝',mythos:'✨',media:'📷'};
  el.innerHTML=items.map(item=>{
    // Real media item: a real thumbnail/video player, not truncated
    // text -- the vault's existing text-preview path never applies to
    // these, they never had text worth showing that way.
    if (item.type === 'media') {
      const mediaEl = item.mediaType === 'video'
        ? `<video src="${item.mediaUrl}" controls style="width:100%;border-radius:8px;max-height:220px;object-fit:cover"></video>`
        : `<img src="${item.mediaUrl}" style="width:100%;border-radius:8px;max-height:220px;object-fit:cover" loading="lazy">`;
      return `
    <div style="padding:14px;border:1px solid var(--border2);border-radius:11px;background:rgba(0,0,0,.3)">
      <div class="flex ac gap10" style="margin-bottom:8px">
        <span>📷</span>
        <span style="font-family:var(--fm);font-size:.65rem;color:var(--cyan)">${(item.mediaType||'MEDIA').toUpperCase()}</span>
        <span class="small" style="margin-left:auto">${new Date(item.created).toLocaleDateString()}</span>
      </div>
      ${mediaEl}
      ${item.text ? `<div class="small" style="margin-top:8px;font-style:italic">${item.text.slice(0,200)}</div>` : ''}
      <div class="flex gap8 mt10">
        <button class="btn g" style="font-size:.68rem;padding:3px 9px" onclick="const a=document.createElement('a');a.href='${item.mediaUrl}';a.download='eravos-${item.id}.${item.mediaType==='video'?'mp4':'jpg'}';a.click()">⬇</button>
        <button class="btn g d" style="font-size:.68rem;padding:3px 9px" onclick="deleteVaultItem(${item.id})">🗑</button>
      </div>
    </div>`;
    }
    return `
    <div style="padding:14px;border:1px solid var(--border2);border-radius:11px;background:rgba(0,0,0,.3)">
      <div class="flex ac gap10" style="margin-bottom:8px">
        <span>${icons[item.type]||'•'}</span>
        <span style="font-family:var(--fm);font-size:.65rem;color:var(--cyan)">${item.type.toUpperCase()}</span>
        <span class="small" style="margin-left:auto">${new Date(item.created).toLocaleDateString()}</span>
      </div>
      <div class="small" style="max-height:60px;overflow:hidden;font-style:italic">${item.text.slice(0,200)}${item.text.length>200?'…':''}</div>
      <div class="flex gap8 mt10">
        <button class="btn g" style="font-size:.68rem;padding:3px 9px" onclick="navigator.clipboard.writeText('${item.text.replace(/'/g,"\\'").replace(/\n/g,' ').slice(0,1000)}')">📋</button>
        <button class="btn g" style="font-size:.68rem;padding:3px 9px" onclick="speechSynthesis.speak(Object.assign(new SpeechSynthesisUtterance('${item.text.replace(/'/g,"\\'").replace(/\n/g,' ').slice(0,500)}'),{rate:.88}))">🔊</button>
        <button class="btn g d" style="font-size:.68rem;padding:3px 9px" onclick="deleteVaultItem(${item.id})">🗑</button>
      </div>
    </div>`;
  }).join('');
}
function deleteVaultItem(id){S.vault=S.vault.filter(i=>i.id!==id);DB.set('eravors_vault',S.vault);renderVault()}
function clearVault(){if(!confirm('Clear all vault items?'))return;S.vault=[];DB.set('eravors_vault',[]);renderVault()}
function exportVault(){const blob=new Blob([JSON.stringify(S.vault,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`vault-${Date.now()}.json`;a.click()}
function exportAll(){exportVault()}

// ═══════════════════════════════════════════════════════════════════
// CONNECTIONS
// ═══════════════════════════════════════════════════════════════════
function saveLMSettings(){} // legacy stub
async function testLM(){log('LM Studio removed — using shared Claude AI','info')}
async function testPG(){log('Postgres not used in this version','info')}
// saveClaudeSettings()/testClaude() removed — direct calls to
// api.anthropic.com, same category as the OpenAI/Guardian providers
// already stripped from callAI(). testClaude(true) was also being
// called silently on every app boot (see the comment near
// loadEravosVersion() above) regardless of whether AI was even on.
function setDots(name,status){
  [`${name}-dot`,`${name}-dot2`].forEach(id=>{const el=document.getElementById(id);if(el)el.className='conn-dot '+status});
  if(name==='p2p'){const lbl=document.getElementById('p2p-status-label');if(lbl)lbl.textContent='Partner: '+(status==='ok'?'✓ Online':status==='error'?'✗ Offline':'–');const d2=document.getElementById('p2p-dot2');if(d2)d2.className='conn-dot '+status}
}

// ═══════════════════════════════════════════════════════════════════
// UTILS
// ═══════════════════════════════════════════════════════════════════
function copyEl(id){const el=document.getElementById(id);navigator.clipboard.writeText(el.innerText||el.value||'').then(()=>log('Copied','ok'))}
function speakEl(id){const text=document.getElementById(id).innerText;window.speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(text);u.rate=.88;u.pitch=1.05;window.speechSynthesis.speak(u);log('Speaking','info')}
function exportText(id,name){const blob=new Blob([document.getElementById(id).innerText],{type:'text/plain'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`${name}-${Date.now()}.txt`;a.click()}
function setAccent(c){document.documentElement.style.setProperty('--fire',c)}
function resetDefaults(){location.reload()}
// ── Mode switching ──────────────────────────────────────────────────────────
var _pendingMode = null;

const MODE_META = {
  solo:      { icon:'🌙', label:'Solo Mode',      body:'Your personal space. Data stays private to you. Partner tools hidden.',        confirm:'Enter Solo' },
  duo:       { icon:'💫', label:'Co-Creation',     body:'Your co-created space with your partner. A private emotional oasis, built by just the two of you. Data syncs through your own self-hosted relay — no third-party server ever holds it. Not yet encrypted at rest on-device; that\'s planned, not built yet.',       confirm:'Enter Co-Creation' }
};

function requestModeSwitch(mode) {
  if (mode === S.mode) return; // already there
  // Real branch, found by direct request: clicking CO-CREATE used to
  // always open the "switch to duo?" modal and, on confirm, call
  // requestMutualDuoMode() -- which sends a real request to a real
  // paired partner. With no partner actually paired yet, that request
  // has no one to reach; the right thing to show instead is the real
  // invite flow (same modal + QR code openInvitePartner() already
  // builds), not a mode-switch confirmation for a partner that doesn't
  // exist yet.
  if (mode === 'duo' && (!window.eravosPairing || !eravosPairing.state().paired)) {
    if (typeof openInvitePartner === 'function') openInvitePartner();
    return;
  }
  _pendingMode = mode;
  const meta = MODE_META[mode] || {};
  const el = id => document.getElementById(id);
  if (el('msm-icon'))  el('msm-icon').textContent  = meta.icon  || '⇄';
  if (el('msm-title')) el('msm-title').textContent  = meta.label || 'Switch mode?';
  if (el('msm-body'))  el('msm-body').textContent   = meta.body  || '';
  if (el('msm-confirm-btn')) el('msm-confirm-btn').textContent = meta.confirm || 'Switch';
  const modal = document.getElementById('mode-switch-modal');
  if (modal) modal.classList.add('open');
}

function cancelModeSwitch() {
  _pendingMode = null;
  const modal = document.getElementById('mode-switch-modal');
  if (modal) modal.classList.remove('open');
}

function confirmModeSwitch() {
  const mode = _pendingMode;
  if (!mode) return;
  cancelModeSwitch();   // clears _pendingMode and closes modal
  if (mode === 'duo') {
    // Entering shared space is a mutual decision, not a unilateral one
    // — was applied immediately on self-confirm alone, with no
    // involvement from the partner at all, even though duo mode
    // switches both people into a shared DB namespace. Leaving duo
    // (going solo) stays unilateral and immediate below — retreating
    // to your own private space shouldn't need anyone's permission,
    // only entering someone else's shared one should.
    requestMutualDuoMode();
    return;
  }
  applyMode(mode);
}

// Mutual consent for entering duo mode. Sent as a request; the
// partner has to accept before either side actually applies it.
// Timeout (not an active decline) just quietly lapses — no partner
// online, or no response yet, isn't the same as being told no.
//
// Real bug found and fixed here: the OLD flow (self-confirm ->
// applyMode('duo') immediately) triggered a fresh initRTC() via the
// mode:toggle gate at the exact moment of confirming — that's what
// actually established the connection in the first place for anyone
// starting cold. This mutual-consent flow delays applyMode('duo')
// until after the partner accepts, but sending the INITIAL request
// still needs a working connection right now — and nothing here
// attempted to establish one, unlike the old path. Reported directly
// ("it's not connecting anymore, thinking its mutual duo mode") and
// confirmed by tracing the actual trigger chain before fixing, not
// guessed at.
function requestMutualDuoMode() {
  const attempt = () => emitSync('mode:duo_requested', {}, { queueOnFail: false });
  if (attempt()) {
    showToast('💫 Asked your partner to switch to Co-Creation together');
    return;
  }
  // Not connected yet — actively try, the same way the old immediate-
  // apply flow did, instead of just failing on the first check.
  showToast('💫 Reaching out to your partner...');
  if (typeof initMesh === 'function') initMesh();
  let tries = 0;
  const poll = setInterval(() => {
    tries++;
    if (attempt()) {
      clearInterval(poll);
      showToast('💫 Asked your partner to switch to duo mode together');
    } else if (tries >= 6) { // ~12s given the 2s interval below
      clearInterval(poll);
      showToast('⚠ Couldn\'t reach your partner — try again once you\'re both online');
    }
  }, 2000);
}
// mode:duo_requested/_accepted/_declined gates registered further down,
// after syncStream is actually declared (const syncStream = new
// Stream()) — caught myself repeating the exact mistake Meaning
// Archive's build made earlier: registering a gate before the const
// it's called on exists yet throws "Cannot access before
// initialization" the moment this script runs, and node --check alone
// doesn't catch it (that's a syntax check, this is a runtime error) —
// only actually executing the script does.

function applyMode(mode) {
  const prev = S.mode;
  S.mode = mode;

  // Persist to per-user DB key
  _dbUser('mode', mode);

  // Update pills
  ['solo','duo'].forEach(m => {
    const btn = document.getElementById('mode-pill-' + m);
    if (btn) btn.classList.toggle('active', m === mode);
  });

  // Update dropdown label
  const umeToggle = document.getElementById('ume-toggle-label');
  if (umeToggle) {
    umeToggle.textContent = mode === 'solo' ? 'Switch to Co-Creation'
      : mode === 'duo'  ? 'Switch to Solo'
      : 'Back to Solo';
  }

  // Partner feeling row
  const pfr = document.getElementById('partner-feeling-row');
  if (pfr) pfr.style.display = mode === 'duo' ? 'flex' : 'none';
  if (mode === 'duo' && typeof renderPartnerBox === 'function') renderPartnerBox();
  const sparFab = document.getElementById('partner-fab-wrap');
  if (sparFab) sparFab.style.display = 'block';

  // Duo mode → switch to shared DB namespace
  if (mode === 'duo' && prev !== 'duo') {
    _migrateToSharedDB();
    showToast('💫 Co-Creation — shared space active');
  } else if (mode === 'solo' && prev === 'duo') {
    showToast('🌙 Solo mode — your private space');
  }

  // Solo mode hides the Communication category (call/poke/messages/needs/
  // planner) — those are unambiguously partner-facing. The Relational
  // category (feelings/oracle/growth/rupture/sparring) stays visible in
  // solo mode: journaling a feeling, using the oracle, or tracking growth
  // are real solo uses, not partner-dependent ones. This was previously
  // just claimed in the mode-switch copy ("Partner tools hidden") without
  // actually being implemented — nav visibility now matches what the copy
  // already told people to expect.
  // Direct request: Communication stays visible in solo mode -- see
  // the matching comment near line 1443 for the full reasoning. No
  // longer hidden or force-switched away from here either.
  const commCatBtn = document.getElementById('cat-communication');
  if (commCatBtn) commCatBtn.style.display = '';

  appStream.emit(new SEvent('mode:toggle', {mode, prev}));
  log('Mode: ' + mode, 'info');
}

// Legacy: keep toggleMode alias for any remaining calls
function toggleMode() { requestModeSwitch(S.mode === 'solo' ? 'duo' : 'solo'); }

// ═══════════════════════════════════════════════════════════════════
// PARTICLES
// ═══════════════════════════════════════════════════════════════════
function createParticles(){
  const c=document.getElementById('particles');const d=document.getElementById('particle-density')?.value||'medium';
  if(d==='off'){c.innerHTML='';return}
  const n={low:10,medium:22,high:45}[d]||22;c.innerHTML='';
  for(let i=0;i<n;i++){const s=document.createElement('div');s.className='spark';const sz=Math.random()*4+2;const colors=['#ff6a00','#ee0979','#ffb347','#ff4500','#ffd700'];s.style.cssText=`width:${sz}px;height:${sz}px;left:${Math.random()*100}%;bottom:${Math.random()*15}%;background:${colors[Math.floor(Math.random()*colors.length)]};--drift:${(Math.random()-.5)*80}px;animation-duration:${3+Math.random()*5}s;animation-delay:${Math.random()*6}s;box-shadow:0 0 ${sz*2}px currentColor`;c.appendChild(s)}}
document.getElementById('particle-density')?.addEventListener('change',createParticles);

// ═══════════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════════
// CLOCK + TICKER
// ═══════════════════════════════════════════════════════════════════
setInterval(()=>{const cl=document.getElementById('session-clock');if(cl)cl.textContent=new Date().toLocaleString()},1000);

const TICKER_DEFAULT = (window.EravosConfig?.ticker?.defaultPhrases) || ["✦ You are worthy of deep love","✦ Co-creation is alchemy","✦ Interdependence is strength","✦ Eros is the force that creates worlds","✦ Presence is the deepest gift","✦ Vulnerability is power","✦ Emergence happens in safety","✦ Your body knows the way","✦ Desire is information","✦ What you make together transforms you both","✦ Rest is revolutionary","✦ Love is a creative act","✦ The wound is where the light enters","✦ Play is sacred","✦ You belong here"];

function renderTicker() {
  const el = document.getElementById('ticker-inner');
  if (!el) return;
  const saved = DB.get('eravors_ticker_phrases', null);
  const phrases = (saved && saved.length) ? saved : TICKER_DEFAULT;
  el.textContent = [...phrases, ...phrases].join('   ');
}
renderTicker();

// ═══════════════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════════════
createParticles();
// Feeling bar + priming indicator live in the persistent shell (always in
// the DOM regardless of which tab is lazy-loaded) — safe to run now.
if (S.user) {
  updateFeelingBar();
  updatePrimingIndicator();
}

// Per-tab boot renders — deferred to first-visit (see the shell's
// eravosStampTab), since with lazy loading these elements don't exist
// at global boot time.
window.EravosTabInitRenderers = {
  vault:      () => typeof renderVault === 'function' && renderVault(),
  rupture:    () => typeof renderRuptures === 'function' && renderRuptures(),
  growth:     () => { typeof renderGrowth === 'function' && renderGrowth(); typeof renderQuestionLoops === 'function' && renderQuestionLoops(); },
  codex:      () => typeof renderCodex === 'function' && renderCodex(),
  relational: () => typeof renderPulseHistory === 'function' && renderPulseHistory(),
  mythos:     () => { typeof renderArchetypes === 'function' && renderArchetypes(); typeof initVoiceToggleUI === 'function' && initVoiceToggleUI('mythos-seed'); },
  feelings:   () => typeof renderFeelingHistory === 'function' && renderFeelingHistory(),
  lattice:    () => typeof renderLattice === 'function' && renderLattice(),
  sparring:   () => { typeof renderSparHistory === 'function' && renderSparHistory(); typeof renderSparMatch === 'function' && renderSparMatch(); },
  triggers:   () => { typeof renderTriggerMap === 'function' && renderTriggerMap(); typeof renderPartnerTriggerMap === 'function' && renderPartnerTriggerMap(); typeof populateTriggerQuickSelect === 'function' && populateTriggerQuickSelect(); },
  commitments: () => { typeof renderCommitments === 'function' && renderCommitments(); typeof populateCommitmentEventLink === 'function' && populateCommitmentEventLink(); },
  meaning: () => { typeof renderMeaningArchive === 'function' && renderMeaningArchive(); },
  struggles: () => { typeof renderStruggles === 'function' && renderStruggles(); },
};

// ═══════════════════════════════════════════════════════════════════
// LATTICE — word-association map built from real session data.
// This tab used to be a "Phase 4" placeholder claiming it was "already
// collecting data" while doing nothing at all. It now actually is: every
// rupture, growth entry, feeling, vault item, codex entry, question, and
// (as of this pass) struggles checklist selection + story gets
// tokenized, counted, and laid out as a living constellation — no
// external physics/viz library, just a small deterministic spiral
// layout, which is plenty for a few hundred words and keeps this
// dependency-free like the rest of the app. Struggles was the one
// source left siloed from the rest of the app's language — this closes
// that gap rather than leaving it as a second, disconnected system.
// ═══════════════════════════════════════════════════════════════════

const LATTICE_STOPWORDS = new Set(['the','and','that','this','with','from','have','has','had','was','were','they','them','into','about','just','like','when','what','then','than','been','being','will','would','could','should','there','their','these','those','some','more','very','only','also','over','such','once','your','you','are','for','not','but','can','get','got','out','all','who','how','our','it\'s','i\'m','i\'ve','didn\'t','don\'t','doesn\'t','isn\'t','a','i','to','of','in','on','is','it','my','me','we','us','so','if','be','as','at']);

// The UI's own copy promised this exact detection ("defensive word
// clusters") — this is what makes it real instead of aspirational.
const LATTICE_FRICTION_WORDS = new Set(['always','never','fine','whatever','nothing','should','shouldn\'t','supposed','again','still','ignored','ignoring','defensive','shut','shutdown','withdrew','withdrawn','silent','silence','stonewalling','blame','blamed','fault','unheard','dismissed']);
// §5.5 / §16.5 — published so shared/alk/text-affect-bridge.js reuses THIS
// list instead of duplicating it. It is already a Four-Horsemen lexicon
// (stonewalling / blame / dismissed / defensive) under another name.
if (typeof window !== 'undefined') window.LATTICE_FRICTION_WORDS = LATTICE_FRICTION_WORDS;

function _latticeTokenize(text) {
  if (!text) return [];
  return String(text).toLowerCase().match(/[a-z']{3,}/g)?.filter(w => !LATTICE_STOPWORDS.has(w)) || [];
}

function buildLatticeData() {
  const freq = new Map();       // word -> count
  const fromMythos = new Set(); // words that also appear in Codex (shared mythic vocabulary)

  const add = (text, isMythos) => {
    for (const w of _latticeTokenize(text)) {
      freq.set(w, (freq.get(w) || 0) + 1);
      if (isMythos) fromMythos.add(w);
    }
  };

  (S.ruptures || []).forEach(r => add([r.what, r.feeling, r.need].join(' ')));
  (S.growthLog || []).forEach(g => add([g.what, g.why, g.cat, g.feel].join(' ')));
  (S.feelingHistory || []).forEach(f => add(f.name));
  (S.vault || []).forEach(v => add(v.text));
  (S.codex || []).forEach(c => add([c.title, c.content, (c.tags||[]).join(' ')].join(' '), true));
  DB.get('eravors_question_loops', []).forEach(l => add(l.question));
  DB.get('eravors_question_answers', []).forEach(a => add(a.text));

  // Struggles — was the one tab feeding nothing into the lattice, which
  // is what made it read as flat and siloed from everything else. Its
  // language belongs in the same living map, not a separate graph.
  // Guarded because STRUGGLES_CHECKLIST_ITEMS lives in the tab's own JS
  // (§5.14 — this kernel function is a consumer, not a copy) and may not
  // be loaded if that tab has never been opened this session.
  if (typeof STRUGGLES_CHECKLIST_ITEMS !== 'undefined') {
    const labelFor = id => STRUGGLES_CHECKLIST_ITEMS.find(i => i.id === id)?.label || '';
    const own = DB.get(_userKey('struggles'), null);
    if (own) add([(own.selected || []).map(labelFor).join(' '), own.story].join(' '));
    add((_partnerStrugglesChecklist() || []).map(labelFor).join(' '));
    add(_partnerStrugglesStory() || '');
  }

  // Triggers — own map (personal by default) + whatever the partner's
  // shared. how_to_hold_me is usually the richest text here.
  (_triggerMap() || []).forEach(e => add([e.label, e.how_to_hold_me, e.what_not_to_do, (e.body_signs||[]).join(' '), (e.self_soothing_steps||[]).join(' ')].join(' ')));
  (_partnerTriggerMap() || []).forEach(e => add([e.label, e.how_to_hold_me, e.what_not_to_do].join(' ')));

  // Commitments — joint log, always visible to both, so no ownership
  // split needed the way Struggles/Triggers have.
  (_commitments() || []).forEach(c => add(c.text));

  // Spar history — was invisible to the lattice entirely until
  // _archiveSparMatch started keeping turn text (see that function's
  // comment). Real conversation, so it belongs in the same map as
  // everything else, not treated as disposable once the match ends.
  DB.get('eravors_spar_history', []).forEach(m => (m.turns || []).forEach(t => add(t.text)));

  // Call transcripts — Phase 4 roadmap: "Every ... transcribed sentence
  // feeds the lattice." toggleCallTranscription() in the call engine is
  // what populates eravors_call_transcripts, live, during a call.
  DB.get('eravors_call_transcripts', []).forEach(t => add(t.text));

  // Bond/Pulse deliberately excluded — eravors_pulse entries are just
  // four numeric sliders (conn/safe/desire/growth), no words to feed.

  const words = [...freq.entries()]
    .map(([word, count]) => ({
      word, count,
      friction: LATTICE_FRICTION_WORDS.has(word),
      shared: fromMythos.has(word),
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 60); // keep it readable, not a wall of text

  return words;
}

// Deterministic per-word hash so layout jitter is stable across
// re-renders (same word always lands in roughly the same spot, so the
// map feels like a stable place you're building, not noise).
function _latticeHash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function renderLattice() {
  // §16.5 — delete before add. The flat top-60 word-frequency renderer is
  // RETIRED. It had one axis, no edges, and its tab copy promised "defensive
  // word clusters" it never computed (§6.1 violation in shipped code).
  //
  // The multidimensional lattice lives in tabs/lattice/lattice.js and reads
  // window.ALK. This function now only delegates, so every existing caller --
  // LATTICE_REFRESH_EVENTS, tab mount, manual refresh -- keeps working
  // without any of them knowing the implementation changed (§5.14).
  if (typeof window !== 'undefined' && typeof window.renderLatticeTab === 'function') {
    try { window.renderLatticeTab(); } catch (e) {
      console.error('[eravos] lattice render failed:', e);   // §1.2 loud
    }
    return;
  }
  // Tab not mounted yet, or ALK failed to boot. Say which -- never blank.
  const holderEl = document.getElementById('lat-resonances') || document.getElementById('lattice-placeholder');
  if (holderEl && typeof window !== 'undefined' && !window.ALK) {
    holderEl.innerHTML = '<p class="small">Lattice unavailable: the ALK layer did not load. '
      + 'See console for the named failing stage.</p>';
  }
}

// §17.3 — the previous implementation, kept addressable rather than deleted
// silently, so the change is a recorded decision and not an unexplained gap.
function renderLatticeFlat_RETIRED_v0_3_17() {
  const holder = document.getElementById('lattice-placeholder');
  if (!holder) return;
  const words = buildLatticeData();

  if (!words.length) {
    holder.innerHTML = `
      <div style="font-size:3rem;margin-bottom:12px;opacity:.4">🕸</div>
      <div style="font-family:var(--fd);font-size:.9rem;color:var(--amber);margin-bottom:8px">The lattice is empty — for now</div>
      <p class="small" style="max-width:440px;margin:0 auto;line-height:1.7">Log a feeling, a rupture, a growth moment, or save something to the Vault — the words you actually use together start forming the map from the very next entry.</p>`;
    return;
  }

  const maxCount = words[0].count;
  const W = 640, H = 420, cx = W / 2, cy = H / 2;
  const goldenAngle = 137.5 * Math.PI / 180;

  const nodes = words.map((w, i) => {
    // Golden-angle spiral placement (frequent words land nearer center),
    // plus small deterministic jitter per word so it reads as organic
    // rather than a mechanical spiral once you look closely.
    const r = 16 * Math.sqrt(i + 1);
    const theta = i * goldenAngle;
    const jitter = (_latticeHash(w.word) % 20) - 10;
    const x = cx + (r + jitter) * Math.cos(theta);
    const y = cy + (r + jitter) * Math.sin(theta) * 0.72; // slightly flattened, fits a wide panel better
    const size = 11 + (w.count / maxCount) * 22;
    return { ...w, x, y, size };
  });

  const svg = `
    <svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;max-height:480px;overflow:visible">
      ${nodes.map(n => {
        const color = n.friction ? 'var(--rose)' : n.shared ? 'var(--gold)' : 'var(--amber)';
        const cls = n.friction ? 'lattice-word lattice-friction' : n.shared ? 'lattice-word lattice-shared' : 'lattice-word';
        return `<text class="${cls}" x="${n.x.toFixed(1)}" y="${n.y.toFixed(1)}"
          text-anchor="middle" dominant-baseline="middle"
          style="font-size:${n.size.toFixed(1)}px;fill:${color};cursor:default"
          title="${n.word} — appears ${n.count} time${n.count===1?'':'s'}${n.friction?' · friction word':''}${n.shared?' · shared mythos word':''}">${n.word}</text>`;
      }).join('')}
    </svg>`;

  holder.innerHTML = svg;
  holder.style.border = 'none';
  holder.style.padding = '12px';
}
window.EravosSettingsSubtabInitRenderers = {
  ai: () => {
    // Real, fires on this subtab's own mount -- the correct hook point
    // (ai-bridge-status doesn't exist until this HTML is actually
    // loaded, so a page-load-time check would never find it). Was:
    // restoring the Ollama connection card's state -- that whole card
    // is gone now (ollama-code-input/-active-info/-code-status all
    // confirmed removed from ai.html), replaced with the real
    // Clear-Glass AI Bridge status check.
    if (typeof checkAiBridgeStatus === 'function') checkAiBridgeStatus();
  },
  admin: () => {
    const regEnabled = DB.get('eravors_reg_enabled', false);
    const regBtn = document.getElementById('register-tab-btn'); // pre-existing dead id, harmless no-op
    if (regBtn) regBtn.style.display = regEnabled ? '' : 'none';
  },
  system: () => {
    if (typeof loadEravosVersion === 'function') loadEravosVersion();
    // Account & Partner card mounted here now (§16.1) -- needs its own
    // fill on first mount, same as it always got inside the admin pane.
    if (typeof renderAccountPartnerRow === 'function') renderAccountPartnerRow();
  },
};

// Single source of truth for the version string: the VERSION file at
// the repo root. Was: a hardcoded 'Eravos v2.0 initialized' log line
// here that nothing ever updated (stale the moment it was written —
// unrelated to the actual "v2.0" of anything), plus separately-drifting
// zip-filename counters ("static-v17"/"spec-v2") that were never the
// same number. All three replaced with one real version, read from one
// file, shown in Settings → System.
let _eravosVersion = null;
async function loadEravosVersion() {
  const el = document.getElementById('eravos-version-display');
  const headerEl = document.getElementById('header-version-display');
  if (_eravosVersion) {
    if (el) el.textContent = _eravosVersion;
    if (headerEl) headerEl.textContent = 'v' + _eravosVersion;
    return _eravosVersion;
  }
  try {
    const r = await fetch('VERSION');
    if (r.ok) _eravosVersion = (await r.text()).trim();
  } catch (e) { /* non-fatal — VERSION file may not be served in every hosting setup */ }
  if (!_eravosVersion) _eravosVersion = '(unknown)';
  if (el) el.textContent = _eravosVersion;
  if (headerEl) headerEl.textContent = 'v' + _eravosVersion;
  return _eravosVersion;
}
loadEravosVersion().then(v => log('Eravos v' + v + ' initialized', 'ok'));

// Was: setTimeout(() => testClaude(true), 3000) here — a silent, direct
// call to https://api.anthropic.com/v1/messages on every single app
// boot, regardless of whether AI is even enabled. Removed along with
// testClaude()/saveClaudeSettings() themselves (direct Claude API
// calls, same category as the OpenAI/Guardian cards already stripped).
// It would always fail now anyway (no key field exists to set one from
// since the Claude settings card is gone), silently logging an error on
// every boot for no reason.

// ═══════════════════════════════════════════════════════════════════
// THEME SYSTEM — per-user themes
// ═══════════════════════════════════════════════════════════════════
// ── THEME REGISTRY ──
// §16.5 -- delete before add. raven-theme / golden-theme / romeo-theme are
// RETIRED. One theme remains: the unnamed default, "🔥 Original Fire".
//
// This cost nothing to remove because 01-ARCHITECTURE.md §2's own rule was
// already being followed everywhere -- no tab defines its own palette, every
// colour is a kernel CSS custom property. Removing the alternates changed
// zero tab stylesheets.
//
// RETIRED_THEMES is kept so purgeThemes() in shared/eravos-admin.js can strip
// stale classes and stored values from devices that ran an earlier build
// (§0.3 -- the migration path is information, not clutter).
const RETIRED_THEMES = ['raven-theme', 'golden-theme', 'romeo-theme'];
const THEMES = [''];
const THEME_LABELS = { '': '🔥 Original Fire' };

function applyUserTheme(username) {
  // One theme now. Strip any retired class left over from an earlier build,
  // then apply the default. Avatar restore stays -- it is per-user data, not
  // a theme concern, and is looked up by the CURRENT dbPrefix rather than a
  // hardcoded name (that hardcoding is what made renames impossible).
  RETIRED_THEMES.forEach(t => document.body.classList.remove(t));
  const uname = (username || '').toLowerCase().trim();
  createParticles();
  DB.set('eravors_active_theme', '');
  DB.set('eravors_active_user_key', uname);

  const prefix = (S.user && S.user.dbPrefix) || uname;
  const saved = prefix ? DB.get(prefix + '_avatar_img', null) : null;
  const avatar = document.getElementById('user-avatar');
  if (avatar && saved) {
    avatar.innerHTML = '';
    const img = document.createElement('img');
    img.src = saved;
    img.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:50%';
    avatar.appendChild(img);
  }
}

// The theme picker card is GONE as of v0.12.0, so nothing in the app calls
// these. They stay as no-op shims for one reason only: a device running
// cached HTML from before 0.12.0 still has onclick="setJamesTheme(...)"
// bound, and a silent ReferenceError there is the worse failure (§1.2).
// They can be deleted once no cached shell predates 0.12.0.
function setJamesTheme(theme, silent) {
  RETIRED_THEMES.forEach(t => document.body.classList.remove(t));
  createParticles();
  updateTickerForTheme('');
  if (!silent && typeof showToast === 'function') showToast('Themes were retired — only the default remains');
}
// setRavenTheme() removed -- confirmed dead, never called anywhere.

function refreshThemeBtns() { /* themes retired -- no selector to refresh */ }


function setRegistrationEnabled(val) {
  DB.set('eravors_reg_enabled', val);
  const btn = document.getElementById('register-tab-btn');
  if (btn) btn.style.display = val ? '' : 'none';
  const el = document.getElementById('admin-msg-tab');
  if (el) { el.textContent = val ? '✓ Registration enabled' : '✓ Registration disabled'; setTimeout(() => el.textContent = '', 2500); }
}

/**
 * Real password reset: prompts for a genuine new password and hashes it.
 * Replaces a real security issue that lived here before -- a function
 * with actual, plaintext passwords for specific named accounts hardcoded
 * directly in this client-side file. `which` is 'admin' or 'partner'
 * (a role, matching the real onclick args already in the Settings UI --
 * checked directly, those buttons never actually matched the old
 * function's own hardcoded lookup keys, so this replaces something that
 * was already silently non-functional, not something that worked).
 */
async function resetAccountPassword(which) {
  const users = DB.get('eravors_users', {});
  const targetRole = which === 'admin' ? 'admin' : 'partner';
  const key = Object.keys(users).find(k => users[k].role === targetRole || (targetRole === 'admin' && users[k].isAdmin));
  const el = document.getElementById('admin-msg-tab');
  if (!key) {
    if (el) { el.textContent = `⚠ No ${targetRole} account found`; setTimeout(() => el.textContent = '', 3000); }
    return;
  }
  const newPass = prompt(`New password for ${users[key].name || targetRole} (8+ characters):`);
  if (!newPass) return;
  if (newPass.length < 8) {
    if (el) { el.textContent = '⚠ Password must be 8+ characters'; setTimeout(() => el.textContent = '', 3000); }
    return;
  }
  const hash = await hashPw(newPass);
  users[key].password = hash;
  DB.set('eravors_users', users);
  if (el) { el.textContent = `✓ Password updated for ${users[key].name || targetRole}`; setTimeout(() => el.textContent = '', 3000); }
}

/**
 * The admin toggle has called this since the pane was written. IT DID NOT
 * EXIST — onchange threw a ReferenceError into the console and the checkbox
 * flipped visually while nothing was stored. So registration could never be
 * turned on, and the create-account path could never appear (§1.2: a control
 * that looks like it worked is worse than one that visibly fails).
 */
function setRegistrationEnabled(on) {
  DB.set('eravors_reg_enabled', !!on);
  applyRegState();
  if (typeof showToast === 'function') {
    showToast(on
      ? 'Anyone with the address can create an account. Turn this off once she has.'
      : 'Registration closed. Existing accounts still sign in.');
  }
  return { ok: true, enabled: !!on };
}

/** Show the register form. Carries any pending invite across with it. */
function showRegisterForm() {
  const lf = document.getElementById('login-form');
  const rf = document.getElementById('register-form');
  if (lf) lf.style.display = 'none';
  if (rf) rf.style.display = '';
  // If they arrived on an invite link, the banner and the pending pair state
  // are already set — surface it here rather than making them paste it again.
  if (typeof detectPendingInvite === 'function') { try { detectPendingInvite(); } catch (e) {} }
  const n = document.getElementById('r-name');
  if (n) n.focus();
}
function showLoginForm() {
  const lf = document.getElementById('login-form');
  const rf = document.getElementById('register-form');
  const ff = document.getElementById('forgot-form');
  if (rf) rf.style.display = 'none';
  if (ff) ff.style.display = 'none';
  if (lf) lf.style.display = '';
}

/* ── FORGOT PASSWORD — recover via partner ──────────────────────────────
   Real gap this closes: the only reset path that existed was Settings >
   Admin > Account Access, which requires already being signed in as
   admin. That works fine when the PARTNER forgets their password (the
   admin resets it for them) but has no answer when the ADMIN forgets
   theirs — nobody else has admin access to open that panel. This is the
   symmetric path: opt-in per account (recoveryViaPartner, checked at
   registration or later from Settings > Admin > Edit), and the OTHER
   account has to prove it's really them with their own real password
   before anything about the locked account changes — not a bare
   "type your name to confirm." */
let _fpTargetKey = null;

function showForgotPassword() {
  const lf = document.getElementById('login-form');
  const ff = document.getElementById('forgot-form');
  if (lf) lf.style.display = 'none';
  if (ff) ff.style.display = '';
  const panel = document.getElementById('fp-recover-panel');
  if (panel) panel.style.display = 'none';
  _fpTargetKey = null;
  const u = document.getElementById('fp-user');
  if (u) { u.value = ''; u.focus(); }
}

function startPartnerRecovery() {
  const uInput = document.getElementById('fp-user');
  const err = document.getElementById('fp-error');
  const panel = document.getElementById('fp-recover-panel');
  if (err) err.style.display = 'none';
  if (panel) panel.style.display = 'none';
  const uVal = uInput ? uInput.value.trim().toLowerCase() : '';
  if (!uVal) { showLoginError(err, 'Enter your username or email.'); return; }

  const users = DB.get('eravors_users', {});
  let targetKey = Object.prototype.hasOwnProperty.call(users, uVal) ? uVal : null;
  if (!targetKey) {
    targetKey = Object.keys(users).find(k =>
      (users[k].name || '').toLowerCase() === uVal || (users[k].email || '').toLowerCase() === uVal);
  }
  const target = targetKey ? users[targetKey] : null;
  if (!target) { showLoginError(err, 'Account not found.'); return; }

  if (!target.recoveryViaPartner) {
    showLoginError(err, 'Partner recovery isn\'t turned on for this account — it\'s an opt-in choice, set at registration or from Settings > Admin > Edit.');
    return;
  }
  const partnerKey = Object.keys(users).find(k => k !== targetKey);
  const partner = partnerKey ? users[partnerKey] : null;
  if (!partner) { showLoginError(err, 'No other account exists on this device to recover through.'); return; }

  _fpTargetKey = targetKey;
  const intro = document.getElementById('fp-recover-intro');
  if (intro) intro.textContent = (target.name || target.email) + ' allowed ' + (partner.name || partner.email) +
    ' to reset their password. ' + (partner.name || partner.email) + ', enter your own password below to continue.';
  const label = document.getElementById('fp-partner-label');
  if (label) label.textContent = (partner.name || partner.email) + "'s password";
  if (panel) panel.style.display = '';
  const pp = document.getElementById('fp-partner-pass');
  if (pp) { pp.value = ''; pp.focus(); }
  const np = document.getElementById('fp-new-pass');
  if (np) np.value = '';
}

async function completePartnerRecovery() {
  const err = document.getElementById('fp-recover-error');
  if (err) err.style.display = 'none';
  if (!_fpTargetKey) { showLoginError(err, 'Start over — enter the locked account first.'); return; }

  const users = DB.get('eravors_users', {});
  const target = users[_fpTargetKey];
  if (!target || !target.recoveryViaPartner) { showLoginError(err, 'That account no longer allows partner recovery.'); return; }
  const partnerKey = Object.keys(users).find(k => k !== _fpTargetKey);
  const partner = partnerKey ? users[partnerKey] : null;
  if (!partner) { showLoginError(err, 'No other account exists on this device to recover through.'); return; }

  const partnerPassInput = document.getElementById('fp-partner-pass');
  const newPassInput = document.getElementById('fp-new-pass');
  const partnerPass = partnerPassInput ? partnerPassInput.value : '';
  const newPass = newPassInput ? newPassInput.value : '';
  if (!partnerPass) { showLoginError(err, (partner.name || 'Your partner') + "'s password is required."); return; }
  if (!newPass || newPass.length < 8) { showLoginError(err, 'New password must be 8+ characters.'); return; }

  const hash = await hashPw(partnerPass);
  let match = partner.password === hash;
  // Same legacy-hash migration path doLogin() uses.
  if (!match && /^-?\d+$/.test(partner.password) && partner.password === hashPwLegacy(partnerPass)) {
    partner.password = hash;
    match = true;
  }
  if (!match) { showLoginError(err, 'That password didn\'t match ' + (partner.name || 'the partner account') + '.'); return; }

  target.password = await hashPw(newPass);
  users[_fpTargetKey] = target;
  users[partnerKey] = partner;
  DB.set('eravors_users', users);

  const ff = document.getElementById('forgot-form');
  const lf = document.getElementById('login-form');
  if (ff) ff.style.display = 'none';
  if (lf) lf.style.display = '';
  const targetName = target.name || target.email;
  _fpTargetKey = null;
  if (typeof showToast === 'function') showToast('Password reset for ' + targetName + ' — sign in with the new one.');
  const lu = document.getElementById('l-user');
  if (lu) lu.value = target.email || target.name || '';
  const lp = document.getElementById('l-pass');
  if (lp) { lp.value = ''; lp.focus(); }
}

if (typeof window !== 'undefined') {
  Object.assign(window, {
    setRegistrationEnabled, showRegisterForm, showLoginForm,
    showForgotPassword, startPartnerRecovery, completePartnerRecovery
  });
}

// Check reg enabled on page load
function applyRegState() {
  const enabled = DB.get('eravors_reg_enabled', false);
  const btn = document.getElementById('register-tab-btn');
  if (btn) btn.style.display = enabled ? '' : 'none';
  const toggle = document.getElementById('reg-enabled-toggle-admin');
  if (toggle) toggle.checked = enabled;
  // If registration was turned off while someone had the form open, put them
  // back rather than leaving a form that will refuse on submit.
  if (!enabled) {
    const rf = document.getElementById('register-form');
    if (rf && rf.style.display !== 'none') showLoginForm();
  }
  return enabled;
}
if (typeof window !== 'undefined') window.applyRegState = applyRegState;
applyRegState();

// Aliases for render functions used in postLoginHook
function renderCodexList() { if (typeof renderCodex === 'function') renderCodex(); }
// renderRuptureList() moved to tabs/rupture/rupture.js
function renderGrowthList() { if (typeof renderGrowth === 'function') renderGrowth(); }
function renderMythosGallery() { /* stubbed — mythos renders on demand */ }


// The ticker was theme-driven and only ever had content for romeo-theme,
// which is retired. Kept as a named no-op rather than deleted: cached HTML
// may still call it, and a silent ReferenceError is the worse failure (§1.2).
// The ticker itself is now driven by eravors_ticker_phrases alone.
function updateTickerForTheme() { /* themes retired */ }

// On every load, re-apply saved theme
// Migration for devices that ran an earlier build: strip any retired theme
// class still sitting on <body>. Runs once per load, costs nothing after.
(function stripRetiredThemesOnLoad() {
  RETIRED_THEMES.forEach(t => document.body.classList.remove(t));
})();

// startRavenParticles() removed entirely -- confirmed never called from
// anywhere, and its CSS (.raven-ash, @keyframes ashFall) already removed
// above for the same reason as the rest of the Raven-specific theme.

// ═══════════════════════════════════════════════════════════════════
// PROFILE MANAGEMENT
// ═══════════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════════
// UNIFIED PROFILE SYSTEM
// ═══════════════════════════════════════════════════════════════════
function loadProfileForm() {
  if (!S.user) return;
  const u = S.user;

  // Avatar ring
  const initEl = document.getElementById('profile-avatar-initials');
  const imgEl  = document.getElementById('profile-avatar-img');
  const nameShown = document.getElementById('profile-display-name-shown');
  const roleBadge = document.getElementById('profile-role-badge');
  const memberSince = document.getElementById('profile-member-since');

  const initials = (u.name || u.email || '?').charAt(0).toUpperCase();
  if (initEl) initEl.textContent = initials;
  if (nameShown) nameShown.textContent = u.name || u.email || '—';
  if (roleBadge) roleBadge.textContent = (u.role === 'admin' ? '🔥 ADMIN' : u.role === 'partner' ? '🖤 PARTNER' : '✦ MEMBER');
  if (memberSince && u.created) {
    const d = new Date(u.created);
    memberSince.textContent = 'Member since ' + d.toLocaleDateString('en-US', {month:'long', year:'numeric'});
  }

  // Load saved avatar
  const savedAvatar = DB.get((S.dbPrefix||'solo') + '_avatar_img', null);
  if (savedAvatar && imgEl && initEl) {
    imgEl.src = savedAvatar; imgEl.style.display = 'block'; initEl.style.display = 'none';
    const ring = document.getElementById('profile-avatar-ring');
    if (ring) ring.style.borderColor = 'rgba(255,106,0,.6)';
  }

  // Avatar hover overlay
  const ring = document.getElementById('profile-avatar-ring');
  const overlay = ring && ring.querySelector('.profile-avatar-overlay');
  if (ring && overlay) {
    ring.addEventListener('mouseenter', () => overlay.style.opacity = '1');
    ring.addEventListener('mouseleave', () => overlay.style.opacity = '0');
  }

  // Name + bio fields
  const nameEl = document.getElementById('profile-name');
  const bioEl  = document.getElementById('profile-bio');
  const userEl = document.getElementById('profile-username');
  if (nameEl) nameEl.value = u.name || '';
  if (bioEl)  bioEl.value  = u.bio  || '';
  if (userEl) userEl.value = u.email || '';

  // Theme selectors retired -- hidden if any cached markup still carries them.
  ['theme-btns'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });

  // Render onboarding answers
  renderOnboardingAnswers();
}

function handleProfilePicUpload(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    const data = e.target.result;
    DB.set((S.dbPrefix||'solo') + '_avatar_img', data);
    // Update ring
    const imgEl  = document.getElementById('profile-avatar-img');
    const initEl = document.getElementById('profile-avatar-initials');
    if (imgEl)  { imgEl.src = data; imgEl.style.display = 'block'; }
    if (initEl) initEl.style.display = 'none';
    // Update header avatar
    const headerAvatar = document.getElementById('user-avatar');
    if (headerAvatar) headerAvatar.style.background = 'none';
    showToast('📷 Photo updated');
  };
  reader.readAsDataURL(file);
}

async function saveProfile() {
  if (!S.user) return;
  const name    = (document.getElementById('profile-name')?.value || '').trim();
  const bio     = (document.getElementById('profile-bio')?.value  || '').trim();
  const current = document.getElementById('profile-pass-current')?.value || '';
  const pass    = document.getElementById('profile-pass')?.value  || '';
  const pass2   = document.getElementById('profile-pass2')?.value || '';

  if (!name) { showProfileMsg('Name cannot be empty.', 'var(--rose)'); return; }

  // Password change validation
  if (pass) {
    if (!current) { showProfileMsg('Enter your current password to change it.', 'var(--rose)'); return; }
    const currentHash = await hashPw(current);
    if (currentHash !== S.user.password) { showProfileMsg('Current password is incorrect.', 'var(--rose)'); return; }
    if (pass !== pass2) { showProfileMsg('New passwords do not match.', 'var(--rose)'); return; }
    if (pass.length < 6) { showProfileMsg('New password must be 6+ characters.', 'var(--rose)'); return; }
    S.user.password = await hashPw(pass);
    // Update in users store
    const users = DB.get('eravors_users', {});
    const key = Object.keys(users).find(k => users[k].email === S.user.email || k === S.user.email);
    if (key) { users[key].password = S.user.password; DB.set('eravors_users', users); }
  }

  S.user.name = name;
  S.user.bio  = bio;
  DB.set('eravors_user', S.user);

  // Update display
  const nameShown = document.getElementById('profile-display-name-shown');
  if (nameShown) nameShown.textContent = name;
  const headerName = document.getElementById('user-name-display');
  if (headerName) headerName.textContent = name;
  const headerAvatar = document.getElementById('user-avatar');
  if (headerAvatar && !headerAvatar.querySelector('img')) headerAvatar.textContent = name.charAt(0).toUpperCase();
  const initEl = document.getElementById('profile-avatar-initials');
  if (initEl) initEl.textContent = name.charAt(0).toUpperCase();

  // Clear password fields
  ['profile-pass-current','profile-pass','profile-pass2'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });

  showProfileMsg('✓ Profile saved', 'var(--teal)');
  showToast('✓ Profile updated');
  log('Profile updated', 'ok');
}

function showProfileMsg(msg, color) {
  const el = document.getElementById('profile-msg');
  if (!el) return;
  el.textContent = msg; el.style.color = color;
  setTimeout(() => el.textContent = '', 3500);
}

// ── Onboarding answers display ─────────────────────────────────────
const OB_LABELS = {
  love_meaning:    { q:'What does love mean to you?',              type:'text' },
  commitment:      { q:'What does commitment look like to you?',   type:'text' },
  love_lang:       { q:'What makes you feel most loved?',          type:'list' },
  love_lang_other: { q:'Love language — other',                    type:'text' },
  love_intensity:  { q:'Level of love expression',                 type:'map',  map:{ small:'Small acts, consistently', medium:'A mix', grand:'Grand gestures', deep:'Depth over performance', all:'All of it', other:'Custom' } },
  time_together:   { q:'Time with partner',                        type:'map',  map:{ independent:'Independent lives', balanced:'Balanced', lots:'A lot', merged:'As much as possible', soulmerge:'Soul-merging level', other:'Custom' } },
  comm_style:      { q:'How you communicate best',                 type:'map',  map:{ talk:'Talk it through', write:'Write first', space:'Need space first', physical:'Touch and presence', mixed:'Depends', other:'Custom' } },
  empathy_style:   { q:'When someone you love is hurting',         type:'map',  map:{ emotional:'Feel it first', cognitive:'Understand first', both:'Depends', other:'Custom' } },
  non_negotiable:  { q:'Non-negotiable in a relationship',         type:'text' },
  romance_style:   { q:'Romance style',                            type:'list' },
};

const ROMANCE_LABELS = { goth:'Dark Romance', old_school:'Old-School', poetic:'Poetic', wild:'Wild & Alive', tender:'Tender', mystical:'Mystical' };
const LOVE_LANG_LABELS = { words:'Words of affirmation', touch:'Physical touch', time:'Quality time', acts:'Acts of service', gifts:'Thoughtful gestures', music:'Music', thoughtfulness:'Thoughtfulness', understanding:'Understanding' };

function renderOnboardingAnswers() {
  const el = document.getElementById('ob-answers-display');
  if (!el) return;
  const ob = DB.get('eravors_onboarding', null);
  if (!ob) {
    el.innerHTML = '<div class="small italic" style="color:var(--dim)">No onboarding answers yet. <button class="btn g" style="font-size:.7rem;margin-left:8px" onclick="openOnboardingEdit()">✦ Begin</button></div>';
    return;
  }
  let html = '';
  Object.entries(OB_LABELS).forEach(([key, def]) => {
    const val = ob[key];
    if (!val || (Array.isArray(val) && !val.length)) return;
    let display = '';
    if (def.type === 'text') {
      display = `<div class="ob-answer-text">${_escHtml(val)}</div>`;
    } else if (def.type === 'map') {
      const keyStr = def.map[val] || val;
      const otherText = ob[key + '_other_text'];
      display = `<div class="ob-answer-pill">${_escHtml(keyStr)}${otherText ? ' — ' + _escHtml(otherText) : ''}</div>`;
    } else if (def.type === 'list') {
      const labels = key === 'romance_style' ? ROMANCE_LABELS : LOVE_LANG_LABELS;
      const items = val.filter(v => !v.startsWith('other:')).map(v => labels[v] || v);
      const otherItem = val.find(v => v.startsWith('other:'));
      if (otherItem) items.push(otherItem.replace('other: ',''));
      display = `<div class="flex gap6 wrap">${items.map(i => `<span class="ob-answer-pill">${_escHtml(i)}</span>`).join('')}</div>`;
    }
    if (display) html += `<div class="ob-answer-row"><div class="ob-answer-q">${def.q}</div>${display}</div>`;
  });
  el.innerHTML = html || '<div class="small italic" style="color:var(--dim)">Answers incomplete — <button class="btn g" style="font-size:.7rem;margin-left:6px" onclick="openOnboardingEdit()">✦ Fill them in</button></div>';
}

function _escHtml(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function openOnboardingEdit() {
  // Clear draft so user starts fresh, then show modal
  localStorage.removeItem('eravors_onboarding_draft');
  let OB_DATA_local = {};
  const existing = DB.get('eravors_onboarding', null);
  if (existing) Object.assign(OB_DATA_local, existing);
  // Set OB_DATA to existing answers so edit is pre-filled
  if (typeof OB_DATA !== 'undefined') Object.assign(OB_DATA, existing || {});
  const modal = document.getElementById('onboarding-modal');
  if (modal) { modal.classList.add('show'); obNext && obNext(0); }
}

// ═══════════════════════════════════════════════════════════════════
// ROLE VIEWS — James (admin/full) vs partner (user/minimal)
// ═══════════════════════════════════════════════════════════════════

function applyTheme(cls) {
  document.body.className = document.body.className
    .replace(new RegExp('\\b(' + RETIRED_THEMES.join('|') + ')\\b','g'),'').trim();
  if (cls) document.body.classList.add(cls);
}

function applyJamesView() {
  // Admin tab visible for James
  const adminBtn=document.getElementById('stab-admin');
  if(adminBtn)adminBtn.style.display='';
  // AI provider config visible for James (admin backend — API keys, Guardian bridge)
  const aiBtn=document.getElementById('stab-ai');
  if(aiBtn)aiBtn.style.display='';
  // System Console is admin-only — visible for James
  const consoleBtn = document.querySelector('#subtabs-system [data-tab="console"]');
  if (consoleBtn) consoleBtn.style.display = '';
  // Show priming
  const prime = document.getElementById('priming-indicator');
  if (prime) prime.style.display = '';
  // Show status bar
  const sb = document.getElementById('status-bar');
  if (sb) sb.style.display = '';
  // Settings: show James cards, hide partner-only
  show('couples-toggle-card');
  show('send-love-card');
  show('theme-picker-card');
  hide('love-inbox-card');
  // Show full settings g2
  const sg = document.querySelector('#panel-settings .g2');
  if (sg) sg.style.display = '';
  // Highlight current theme btn
  refreshThemeBtns(false);
  // Load James theme choices
  const saved = DB.get('eravors_james_theme','');
  setJamesTheme(saved, true);
}

function applyPartnerView() {
  // Admin tab hidden for partner
  const adminBtn=document.getElementById('stab-admin');
  if(adminBtn)adminBtn.style.display='none';
  // AI provider config hidden for partner (API keys, Guardian bridge — James's backend, not hers)
  const aiBtn=document.getElementById('stab-ai');
  if(aiBtn)aiBtn.style.display='none';
  // System Console is admin-only — hidden for partner. The nav button
  // is the soft gate; switchTab() itself is the hard one (§16.3 —
  // invariants enforced structurally, not just by hiding a button).
  const consoleBtn = document.querySelector('#subtabs-system [data-tab="console"]');
  if (consoleBtn) consoleBtn.style.display = 'none';
  // Hide priming
  const prime = document.getElementById('priming-indicator');
  if (prime) prime.style.display = 'none';
  // Hide status bar
  const sb = document.getElementById('status-bar');
  if (sb) sb.style.display = 'none';
  // Settings: show only love inbox
  hide('couples-toggle-card');
  hide('send-love-card');
  hide('theme-picker-card');
  hide('love-inbox-card'); // handled by renderLoveInbox
  // Hide the full g2 settings block (AI, display etc)
  const sg = document.querySelector('#panel-settings .g2');
  if (sg) sg.style.display = 'none';
  // Love inbox
  setTimeout(() => {
    const li = document.getElementById('love-inbox-card');
    if (li) li.style.display = '';
    renderLoveInbox();
  }, 100);
  // Mobile nav — only show Heart, Spar, You
  const PARTNER_MNAV = ['heart','you'];
  document.querySelectorAll('.mnav-btn').forEach(btn => {
    const oc = btn.getAttribute('onclick') || '';
    const m = oc.match(/mnavSelect\('(\w+)'\)/);
    if (m && !PARTNER_MNAV.includes(m[1]) && m[1] !== 'spar') btn.style.display = 'none';
  });
  switchTab('feelings');
}

function show(id) { const e = document.getElementById(id); if (e) e.style.display = ''; }
function hide(id) { const e = document.getElementById(id); if (e) e.style.display = 'none'; }

// removeRavenRestrictions() and applyRavenRestrictions() (a "legacy
// alias" for applyPartnerView, per its own comment) removed entirely --
// confirmed neither was called from anywhere.



// ═══════════════════════════════════════════════════════════════════
// PEERJS P2P — Real internet connection, fixed peer IDs
// ═══════════════════════════════════════════════════════════════════
let peer = null, peerConn = null;

// ── CONNECTION LIVENESS + HEALTH HISTORY ─────────────────────────────
// Real gap this originally filled: PeerJS's conn.on('close')/('error')
// were the only signals of "the connection died," but a channel could go
// silently dead without either firing. Now that the transport is a plain
// WebSocket to the self-hosted co-creation relay (see initMesh, below —
// PeerJS/WebRTC/STUN/TURN no longer carry any sync data), the same
// liveness gap exists at a different layer: ws.close()/('error') mostly
// cover it, but a socket can still look open while silently dead on some
// networks. The presence:ping/presence:pong round trip — already
// flowing over this transport like every other sync message — is the
// liveness signal; presence:pong already writes DB 'eravors_last_pong'
// on every reply. This watchdog is the only piece that reads it.
// Session outcomes are logged to a small rolling history (DB-backed,
// same IndexedDB/localStorage helper everything else in this file
// already uses — no new persistence layer) so "did the stability work
// actually help" is answerable from data, not impression.
const PRESENCE_STALE_MS = 75000;      // > 2 missed 30s pulses before treating as dead
const CONNECTION_HISTORY_KEY = 'eravors_connection_history';
const CONNECTION_HISTORY_CAP = 40;

let _livenessWatchdog = null;
let _sessionStartedAt = 0;

function _clearLivenessTimers() {
  if (_livenessWatchdog) { clearInterval(_livenessWatchdog); _livenessWatchdog = null; }
}

// Append one outcome to the rolling connection history.
function _recordConnectionEvent(reason) {
  const startedAt = _sessionStartedAt || Date.now();
  const endedAt = Date.now();
  const entry = { startedAt, endedAt, durationMs: Math.max(0, endedAt - startedAt), reason };
  const hist = DB.get(CONNECTION_HISTORY_KEY, []);
  hist.push(entry);
  while (hist.length > CONNECTION_HISTORY_CAP) hist.shift();
  DB.set(CONNECTION_HISTORY_KEY, hist);
  _sessionStartedAt = 0;
}

// Simple stats over recorded sessions — surfaced in console/settings, not decision logic.
function getConnectionHealth() {
  const hist = DB.get(CONNECTION_HISTORY_KEY, []);
  if (!hist.length) return { sessions: 0, avgDurationMs: 0, byReason: {} };
  const byReason = {};
  let totalDuration = 0;
  for (const e of hist) {
    byReason[e.reason] = (byReason[e.reason] || 0) + 1;
    totalDuration += e.durationMs;
  }
  return {
    sessions: hist.length,
    avgDurationMs: Math.round(totalDuration / hist.length),
    byReason,
    recent: hist.slice(-10),
  };
}

function _startLivenessWatchdog() {
  _clearLivenessTimers();
  _sessionStartedAt = Date.now();
  DB.set('eravors_last_pong', _sessionStartedAt); // seed so the check below doesn't fire before the first real pulse
  _livenessWatchdog = setInterval(() => {
    if (!window.MESH?.connected) return;
    const lastPong = DB.get('eravors_last_pong', _sessionStartedAt);
    if (Date.now() - lastPong > PRESENCE_STALE_MS) _handleConnectionDeath('presence_stale');
  }, 15000);
}

// Treat the current mesh connection as dead: tear down, log why, reconnect.
let _meshEverConnected = false;

// Reasons the relay sends back that mean "retrying will fail exactly the
// same way every time, forever" — found by simulating a second client
// claiming an already-pinned identity slot and watching it loop on
// identity_mismatch indefinitely, ~1s apart, exactly matching what was
// actually being observed. Retrying blindly against one of these isn't
// resilience, it's spinning uselessly while spamming the same toast.
const PERMANENT_REJECTION_REASONS = ['identity_mismatch', 'unknown_identity'];

function _isPermanentRejection(reason) {
  return PERMANENT_REJECTION_REASONS.some(r => reason.includes(r));
}

function _handleConnectionDeath(reason) {
  _clearLivenessTimers();

  if (_isPermanentRejection(reason)) {
    rtcLog('Relay rejected this device (' + reason + ') — will NOT keep retrying with the same identity, since every attempt would fail identically. See Settings → System → Co-Creation.');
    updateRTCStatus('error');
    _recordConnectionEvent(reason);
    if (_mesh) { try { _mesh.close(); } catch(e) {} }
    _mesh = null;
    window.MESH = { connected: false };
    _partnerOnline = false;
    showToast('⚠ Relay rejected this device — see System Console');
    updateConnectionAmbient();
    return; // deliberately no _scheduleReconnect() — see reason above
  }

  rtcLog('Connection lost (' + reason + '). Reconnecting...');
  updateRTCStatus('disconnected');
  _recordConnectionEvent(reason);
  if (_mesh) { try { _mesh.close(); } catch(e) {} }
  _mesh = null;
  window.MESH = { connected: false };
  _partnerOnline = false;
  showToast('🌙 Solo · Offline');
  DB.set('eravors_last_connected', Date.now());
  updateConnectionAmbient();
  _scheduleReconnect();
}

// getPeerIdForUser()/getPartnerPeerIdForUser() used to hardcode fixed
// IDs for two specific named people (james/raven) and fall back to a
// SEPARATE, DETERMINISTIC id scheme for anyone else -- genuinely
// different from myPeerId()'s own real scheme (a random id, generated
// once, persisted in DB). Two different identity systems for the same
// concept is a real bug, not a style choice: initMesh() used this
// function for ITS OWN connection identity while the real pairing flow
// (scan()/receiveRequest(), added this session) tells the other side
// "my peer id is X" using myPeerId()'s value -- if those two never
// agreed, the mesh had no way to ever actually find either side,
// regardless of how correct the pairing STATE MACHINE was. Found while
// removing the hardcoded james/raven routing (a real, separate ask),
// not initially what this was.
//
// One real identity now: myPeerId() everywhere, no parallel scheme.
// CORRECTED again, after finding the real, more recent seeding code
// (seedContainedAccounts(), near the top of this file): James's own
// account already moved to a random, persistent, opaque peer id
// (generated once, stored in eravors_my_peer_id) specifically BECAUSE
// the old fixed constant 'eravos-james-fixed' announced who made every
// pairing code (that seeding code's own comment, found by
// test/pairing.test.mjs). The partner account is deliberately never
// pre-seeded either -- created only through a real invite/scan. A
// fixed-slot model was never the current, correct architecture; it was
// what the relay's own code still assumed, one layer behind the client.
// The real fix belongs in the relay (see relay-server.js), not here.
function getPeerIdForUser(user) {
  return myPeerId();
}

// Partner's peer id comes from real, confirmed Pairing state -- learned
// during the actual scan()/receiveRequest()/confirm() handshake, never
// guessed or fixed in advance. Honestly null if not yet paired.
function getPartnerPeerIdForUser(user) {
  if (!window.eravosPairing) return null;
  const s = eravosPairing.state();
  return (s && s.paired && s.partner && s.partner.peerId) || null;
}

// ═══════════════════════════════════════════════════════════════════
// E2E ENCRYPTION — X25519 + AES-256-GCM (Phase 1, formerly a "gap").
// See shared/eravos-crypto.js for the honest scope statement (static
// identity keys, no forward secrecy, no-op if SubtleCrypto is
// unavailable). This block only wires that module into the P2P
// connection lifecycle: identity load/create → exchange in `hello` →
// derive shared key → encrypt every outgoing envelope, decrypt every
// incoming one.
// ═══════════════════════════════════════════════════════════════════
const _cryptoSession = { aesKey: null, myIdentity: null, ready: false };

function _myRole() {
  const uname = (S.user?.email || S.user?.name || '').toLowerCase().trim();
  if (S.user?.role === 'admin' || uname === 'james') return 'james';
  if (S.user?.role === 'partner') return 'partner';
  return uname || 'solo';
}

/** Real partner display name, read from actual confirmed Pairing state --
    not a hardcoded name. Used anywhere the UI used to say "Raven"/"James"
    as if those were the only two people this app could ever be used by. */
function getPartnerDisplayName() {
  if (window.eravosPairing) {
    const s = eravosPairing.state();
    if (s && s.partner && s.partner.name) return s.partner.name;
  }
  return S.user?.role === 'admin' ? 'your partner' : 'James';
}

function _ensureCryptoIdentity() {
  if (!window.EravosCrypto || !window.EravosCrypto.available) {
    log('[crypto] SubtleCrypto unavailable (insecure context?) — P2P traffic will NOT be encrypted this session', 'warn');
    return null;
  }
  if (!_cryptoSession.myIdentity) {
    _cryptoSession.myIdentity = window.EravosCrypto.getOrCreateIdentity(
      _myRole(),
      (k, d) => DB.get(k, d),
      (k, v) => DB.set(k, v)
    );
  }
  return _cryptoSession.myIdentity;
}

// Called from the presence:hello gate when the partner's pubkey arrives.
async function _onPartnerHelloPubkey(theirPubB64) {
  const mine = _ensureCryptoIdentity();
  if (!mine || !theirPubB64) return;
  try {
    _cryptoSession.aesKey = await window.EravosCrypto.deriveSharedKey(mine.priv, theirPubB64);
    _cryptoSession.ready = !!_cryptoSession.aesKey;
    if (_cryptoSession.ready) log('[crypto] Session key derived — P2P traffic now encrypted', 'ok');
  } catch (e) {
    log('[crypto] Key derivation failed: ' + e.message, 'warn');
    _cryptoSession.ready = false;
  }
}

// ═══════════════════════════════════════════════════════════════════
// initRTC — CALLING ONLY. Renamed in scope, not in name, to avoid
// touching every call site: this used to also drive data sync/presence
// (the "duo connection," now "Co-Creation"), which has moved entirely
// to initMesh() below, over the self-hosted relay. What's left here is
// solely the PeerJS peer that startCall()/answerCall() use for
// voice/video. Real-time audio/video needs actual WebRTC media
// transport — a small JSON relay can't carry that — so calling keeps
// its own signaling path (0.peerjs.com + STUN/TURN) rather than being
// silently broken by the sovereignty move. This is a real, separate
// feature from the sync connection, not an oversight.
// ═══════════════════════════════════════════════════════════════════
let _callRetryAttempt = 0;
function _nextCallRetryDelay() {
  _callRetryAttempt++;
  return Math.min(60000, 5000 * Math.pow(2, _callRetryAttempt - 1)); // 5s,10s,20s,40s,60s cap
}
// Real, found bug: retries had a delay cap (60s) but no COUNT cap --
// an unreachable external service (0.peerjs.com, confirmed unreachable
// in a real user's actual console log: dozens of failed attempts, each
// with a fresh token) retried forever, every 60s, for as long as the
// page stayed open. Six attempts (5s+10s+20s+40s+60s+60s ≈ 3.5 minutes
// of real trying) is enough to ride out a genuine blip; past that it's
// not transient, it's unreachable, and needs a clear stop, not silent
// infinite spam.
const MAX_CALL_RETRY_ATTEMPTS = 6;

async function initRTC() {
  if (!S.user) return;
  // Real fix, found while extracting call.js out of the kernel (Phase
  // S): every real caller of initRTC() is fire-and-forget (setTimeout,
  // non-awaited calls on login) -- none of them wait for this to
  // finish, so making this async and awaiting here doesn't change any
  // existing caller's behavior. Needed because callLog() (the very
  // next line) and every PeerJS event handler below now live in
  // call.js, which may not have loaded yet if the person hasn't
  // visited Call -- initRTC() itself runs on login regardless of
  // which tab is active. Idempotent no-op if already loaded.
  await eravosStampTab('call');
  const myPeerId = getPeerIdForUser(S.user);

  // Destroy old peer if exists
  if (peer) { try { peer.destroy(); } catch(e){} }

  callLog('Connecting call service...');

  try {
    peer = new Peer(myPeerId, {
      host: '0.peerjs.com',
      port: 443,
      secure: true,
      path: '/',
      debug: 0,
      config: { iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
        { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
        { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
      ]}
    });

    peer.on('open', () => {
      _callRetryAttempt = 0;
      callLog('Call service ready.');
    });

    peer.on('call', async (incomingCall) => {
      // Real fix, found while extracting call.js out of the kernel
      // (Phase S): this handler fires regardless of which tab is
      // currently active -- an incoming call must work even if the
      // person never visited Call and its split JS was never loaded.
      // Idempotent no-op if it's already loaded (same real mechanism
      // Rupture's growth:seed_requested Gate already uses for the same
      // reason).
      await eravosStampTab('call');
      const callId = incomingCall.metadata?.callId;
      // If we already accepted this exact invite (via the toast request
      // flow below), don't show a second prompt — just answer.
      if (callId && callId === _awaitingIncomingCallId) {
        _awaitingIncomingCallId = null;
        callLog('📞 Connecting…');
        _callType = incomingCall.metadata?.callType || _callType;
        (async () => {
          try {
            const stream = await getLocalStream();
            attachLocalStream(stream);
            incomingCall.answer(stream);
            setupCallHandlers(incomingCall);
          } catch (e) { detachStreams(); callLog('⚠ Could not access camera/mic to answer.'); }
        })();
        return;
      }
      callLog('📞 Incoming call from partner');
      _pendingCall = incomingCall;
      showIncomingCall();
    });

    peer.on('error', (err) => {
      if (err.type === 'unavailable-id') {
        setTimeout(() => reconnectPeer(), 3000);
      } else if (_callRetryAttempt >= MAX_CALL_RETRY_ATTEMPTS) {
        callLog('⚠ Call service unreachable after ' + MAX_CALL_RETRY_ATTEMPTS + ' attempts. Try again from the Call tab when you actually want to call.');
      } else {
        const delayMs = _nextCallRetryDelay();
        callLog('Call service error: ' + err.type + '. Retrying in ' + Math.round(delayMs / 1000) + 's...');
        setTimeout(() => initRTC(), delayMs);
      }
    });

    peer.on('disconnected', () => {
      if (_callRetryAttempt >= MAX_CALL_RETRY_ATTEMPTS) {
        callLog('⚠ Call service unreachable. Try again from the Call tab when you actually want to call.');
        return;
      }
      try { peer.reconnect(); } catch(e) { setTimeout(() => initRTC(), _nextCallRetryDelay()); }
    });

  } catch(e) {
    callLog('Call service init error: ' + e.message);
  }
}

function reconnectPeer() {
  if (peer && !peer.destroyed) {
    try { peer.reconnect(); return; } catch(e) {}
  }
  initRTC();
}

// ═══════════════════════════════════════════════════════════════════
// CO-CREATION RELAY — initMesh()
//
// Replaces PeerJS signaling (0.peerjs.com) + STUN + TURN entirely for
// data sync. No third party ever sees connection metadata now — only
// your own relay does, and it only ever reads `type`/`peerId`/`token`
// on the wire, never `payload`: every payload it moves is exactly what
// EravosCrypto already produces (X25519 + AES-256-GCM), unchanged from
// before. The relay is a dumb, blind forwarder between two fixed
// identities — see relay-server.js.
//
// This implements the window.MESH / window.meshSend interface that
// _rawSend() below already expected (it was written anticipating this,
// with the old PeerJS path kept only "during transition" — that
// transition is this).
// ═══════════════════════════════════════════════════════════════════
let _mesh = null;          // the WebSocket instance
let _partnerOnline = false;
window.MESH = { connected: false };

// Same pattern PeerJS's host used to be: a hardcoded constant, not a
// Settings field. Set this once, in source, when the relay box exists —
// not something either person configures per device.
// Same pattern PeerJS's host used to be: a hardcoded constant, not a
// Settings field. PROD_RELAY_URL is set once, in source, when the real
// box exists — not something either person configures per device.
// Auto-detected local override: when Eravos itself is being served from
// localhost/127.0.0.1 (the all-in-one system's serve-eravos.js, or any
// local dev server), this points at the relay's own local default port
// instead — so the whole system works together with zero config for
// local testing, without that ever silently being the thing that's live
// in a real deployment (only fires when the PAGE's own origin is local).
// ── RELAY URL (v0.18.0) ──────────────────────────────────────────────────
//
// MY BUG, and exactly the failure I keep warning about. v0.15.0 moved the
// relay onto the app's own port at /relay — and did not move the CLIENT.
// This still pointed at ws://localhost:8787, where nothing has listened
// since. The app loaded perfectly and never connected, which looks like
// "she just isn't online" and tells you nothing (§1.2).
//
// The fix is the thing that made consolidating worth doing: DERIVE the relay
// URL from the page you are already on. Same host, same port, /relay, and
// the scheme matched to the page — wss:// from https://, ws:// from http://.
// There is now nothing to keep in sync, so this cannot drift again.
//
// Order of precedence, most specific first:
//   1. an explicit override in Settings (per device, for odd setups)
//   2. relay.url in config/options.json (per deployment)
//   3. derived from location — the default, and correct for one-port serving
const RELAY_PATH = '/relay';

function _derivedRelayUrl() {
  if (typeof location === 'undefined') return null;
  const scheme = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return scheme + '//' + location.host + RELAY_PATH;   // host includes the port
}

function relayUrl() {
  const override = (typeof DB !== 'undefined') ? DB.get('eravors_relay_url_override', null) : null;
  if (override) return String(override);
  const cfg = (typeof window !== 'undefined' && window.EravosConfig &&
               window.EravosConfig.relay && window.EravosConfig.relay.url) || null;
  if (cfg) return String(cfg);
  return _derivedRelayUrl();
}

/** §1.2 — a wrong relay URL is the silent failure. Make it inspectable. */
function relayUrlSource() {
  if (typeof DB !== 'undefined' && DB.get('eravors_relay_url_override', null)) return 'settings override';
  if (typeof window !== 'undefined' && window.EravosConfig &&
      window.EravosConfig.relay && window.EravosConfig.relay.url) return 'config/options.json';
  return 'derived from this page (one-port serving)';
}

function setRelayUrlOverride(url) {
  if (!url) { DB.set('eravors_relay_url_override', null); return { ok: true, using: relayUrl(), source: relayUrlSource() }; }
  const u = String(url).trim();
  if (!/^wss?:\/\//.test(u)) throw new Error('[relay] a relay URL must start with ws:// or wss:// — got "' + u + '"');
  DB.set('eravors_relay_url_override', u);
  return { ok: true, using: u, source: 'settings override' };
}

/**
 * inviteRelayUrl() — the relay address to put IN AN INVITE (v0.29.4).
 *
 * relayUrl() answers "where does THIS device connect", and derives from
 * location — correct for the live socket, and wrong for a code. Serving the
 * app from localhost:80 makes relayUrl() ws://localhost/relay, which is a
 * perfect address for this machine and a dead one for hers: on her device it
 * means HER machine. Confirmed on screen — the invite link correctly read
 * https://eravos.anonymousservers.info/... while the relay inside it read
 * ws://localhost/relay, and relayIsShareable() refused it. The guard was
 * right; the source was wrong.
 *
 * An invite must carry the address SHE will use, which is publicOrigin — the
 * same value the link itself is built from. One origin, both halves of the
 * code, so they cannot disagree again.
 *
 * Falls back to relayUrl() when no publicOrigin is configured: on one LAN,
 * or served from a real hostname already, the derived value IS correct.
 */
function inviteRelayUrl() {
  const origin = (typeof eravosPairing !== 'undefined' && eravosPairing && eravosPairing.origin) || null;
  if (origin) {
    try {
      const u = new URL(origin);
      // http -> ws, https -> wss. Anything else is not an origin we can
      // build a socket address from, so fall through rather than guess.
      if (u.protocol === 'https:' || u.protocol === 'http:') {
        return (u.protocol === 'https:' ? 'wss://' : 'ws://') + u.host + RELAY_PATH;
      }
    } catch (e) { /* malformed publicOrigin — fall through to the derived value */ }
  }
  return relayUrl();
}

function meshConfig() {
  const url = relayUrl();
  if (!url) {
    // Refuse rather than hand a null to the socket and let it fail obscurely.
    throw new Error('[relay] no relay URL could be determined — no location, no config, no override');
  }
  return { url: url, source: relayUrlSource() };
}

/**
 * applyInviteRelay(relay) — the caller-side half of the seam scan() leaves
 * open (v0.13.0). Pairing validates the rendezvous and hands it back; this
 * is what actually points the socket at it.
 *
 * THE ORDERING IS LOAD-BEARING, and it is the bug this whole path exists to
 * close. initMesh() returns early on `_mesh.readyState === OPEN` ("Already
 * connected."), so applying an override AFTER a connection is up changes
 * nothing at all — the socket stays on the old relay and the pairing request
 * goes to a room with one person in it. Every caller must apply the relay
 * BEFORE initMesh(), and this function tears down an existing socket itself
 * so a redeem mid-session cannot leave a stale connection behind.
 *
 * Returns a real result rather than a boolean: whether a switch happened is
 * something the console and the toast both need to be able to say.
 */
function applyInviteRelay(relay) {
  if (!relay) return { ok: false, switched: false, reason: 'no relay address in this invite' };

  // One implementation of "is this reachable", shared with the pairing
  // module — not a second copy of the same regexes drifting out of sync.
  const check = (typeof Pairing !== 'undefined' && Pairing.relayIsShareable)
    ? Pairing.relayIsShareable(relay)
    : { ok: /^wss?:\/\//i.test(relay), relay: relay, reason: 'relay validation unavailable' };
  if (!check.ok) return { ok: false, switched: false, reason: check.reason, fix: check.fix || null };

  const current = relayUrl();
  if (current === check.relay) return { ok: true, switched: false, using: check.relay, note: 'already on their relay' };

  // Mixed content, refused here rather than at the socket: a page on https
  // cannot open ws://, and browsers block it before any event this code
  // could observe. Same guard initMesh() already makes — made earlier so the
  // failure names the INVITE rather than looking like a dead connection.
  if (typeof location !== 'undefined' && location.protocol === 'https:' && /^ws:\/\//i.test(check.relay)) {
    return { ok: false, switched: false,
             reason: 'this invite points at ' + check.relay + ', and this page is HTTPS — browsers block insecure ws:// from it',
             fix: 'Ask them for a code minted from an https origin, so the relay address is wss://.' };
  }

  setRelayUrlOverride(check.relay);
  // Down before up. Anything already open is on the WRONG relay by
  // definition — we only get here because the address changed.
  if (typeof _mesh !== 'undefined' && _mesh) { try { _mesh.close(); } catch (e) {} _mesh = null; }
  window.MESH = { connected: false };
  _partnerOnline = false;   // presence belonged to the old relay — it says nothing about this one
  if (typeof rtcLog === 'function') rtcLog('Relay switched to ' + check.relay + ' (from an invite).');
  return { ok: true, switched: true, using: check.relay, from: current };
}

if (typeof window !== 'undefined') Object.assign(window, { relayUrl, relayUrlSource, setRelayUrlOverride, applyInviteRelay, inviteRelayUrl });

function renderRelaySettings() {
  const el = document.getElementById('relay-current');
  if (!el) return;
  let url, src;
  try { url = relayUrl(); src = relayUrlSource(); }
  catch (e) { el.textContent = e.message; return; }
  el.textContent = url + '   (' + src + ')';
  const inp = document.getElementById('relay-url-override');
  if (inp && !inp.value) {
    const ov = DB.get('eravors_relay_url_override', null);
    if (ov) inp.value = ov;
  }
}
function saveRelayOverride() {
  const inp = document.getElementById('relay-url-override');
  try {
    const r = setRelayUrlOverride(inp ? inp.value.trim() : '');
    showToast('Relay: ' + r.using + ' (' + r.source + '). Reconnect to use it.');
  } catch (e) { showToast(e.message); }
  renderRelaySettings();
}
function clearRelayOverride() {
  const inp = document.getElementById('relay-url-override');
  if (inp) inp.value = '';
  setRelayUrlOverride(null);
  showToast('Back to deriving it from this page.');
  renderRelaySettings();
}
if (typeof window !== 'undefined') Object.assign(window, { renderRelaySettings, saveRelayOverride, clearRelayOverride });

function handleIncomingMeshData(payload) {
  try {
    if (payload && payload._enc && _cryptoSession.ready) {
      window.EravosCrypto.decrypt(_cryptoSession.aesKey, payload)
        .then(envelope => dispatchSync(envelope))
        .catch(e => log('[crypto] Decrypt failed, dropping message: ' + e.message, 'warn'));
      return;
    }
    if (payload && payload._enc && !_cryptoSession.ready) {
      log('[crypto] Received encrypted message before session key was ready — dropped, not guessed', 'warn');
      return;
    }
    dispatchSync(payload);
  } catch(e) { log('Mesh parse error', 'warn'); }
}

window.meshSend = function(wireData) {
  if (!_mesh || _mesh.readyState !== WebSocket.OPEN) return false;
  try {
    _mesh.send(JSON.stringify({ type: 'relay', payload: wireData }));
    return true;
  } catch (e) {
    return false;
  }
};

function initMesh() {
  if (_reconnectTimer) { clearTimeout(_reconnectTimer); _reconnectTimer = null; } // manual/scheduled call — don't wait behind a stale backoff timer too
  if (!S.user) return;
  const { url } = meshConfig();
  const myPeerId = getPeerIdForUser(S.user);
  const partnerPeerId = getPartnerPeerIdForUser(S.user);
  const myId = _ensureCryptoIdentity(); // same X25519 identity already used for sync payload encryption — also the relay auth identity now, automatically, nothing to copy anywhere

  // Legacy-compat display stubs — kept from the PeerJS era, still read
  // by a couple of UI elements that show "My ID" / "Partner ID".
  const codeEl = document.getElementById('my-room-code');
  const sparEl = document.getElementById('my-room-code-spar');
  if (codeEl) codeEl.value = myPeerId;
  if (sparEl) sparEl.value = myPeerId;
  const partnerEl = document.getElementById('partner-room-code');
  if (partnerEl && partnerPeerId) partnerEl.value = partnerPeerId;

  if (!url || url.includes('YOUR-RELAY-HOST-HERE')) {
    rtcLog('Relay host not set in source yet.');
    updateRTCStatus('disconnected');
    return;
  }
  // Mixed content: a page served over https:// cannot open a plain ws://
  // connection — browsers block it before any network attempt, with no
  // event this code would ever see. This would otherwise look exactly
  // like "just not connecting" for a completely different reason than
  // anything _handleConnectionDeath/backoff can detect or fix by retrying.
  if (location.protocol === 'https:' && url.startsWith('ws://')) {
    rtcLog('Relay URL must be wss:// — this page is HTTPS and browsers block insecure ws:// from it.');
    updateRTCStatus('error');
    return;
  }
  if (!myId) {
    rtcLog('No identity available — SubtleCrypto unavailable in this context.');
    updateRTCStatus('error');
    return;
  }
  if (_mesh && _mesh.readyState === WebSocket.OPEN) { rtcLog('Already connected.'); return; }

  rtcLog('Connecting to relay...');
  updateRTCStatus('connecting');

  let ws;
  try {
    ws = new WebSocket(url);
  } catch (e) {
    rtcLog('Relay connect error: ' + e.message);
    updateRTCStatus('error');
    _scheduleReconnect();
    return;
  }

  ws.onopen = () => {
    try { ws.send(JSON.stringify({ type: 'hello', peerId: myPeerId, pub: myId.pub })); }
    catch (e) { rtcLog('Hello send failed: ' + e.message); }
  };

  ws.onmessage = async (ev) => {
    let msg;
    try { msg = JSON.parse(ev.data); } catch (e) { return; }

    // Token-free auth: prove possession of the private key matching the
    // pubkey we just claimed in `hello`. See relay-server.js for the
    // server side of this — same X25519 math, no shared secret involved.
    if (msg.type === 'challenge') {
      try {
        const priv = window.EravosCrypto.fromB64(myId.priv);
        const ephPub = window.EravosCrypto.fromB64(msg.ephPub);
        const nonce = window.EravosCrypto.fromB64(msg.nonce);
        const shared = window.EravosCrypto.x25519(priv, ephPub);
        const keyBytes = await window.EravosCrypto.hkdf(shared, nonce, 'relay-auth-v1', 32);
        const aesKey = await window.EravosCrypto.aesKeyFromRawBytes(keyBytes);
        const checkValue = await window.EravosCrypto.decryptRaw(aesKey, msg.envelope.iv, msg.envelope.ct);
        ws.send(JSON.stringify({ type: 'challenge_response', proof: window.EravosCrypto.toB64(checkValue) }));
      } catch (e) {
        rtcLog('Relay challenge failed: ' + e.message);
      }
      return;
    }

    if (msg.type === 'auth_ok') {
      _mesh = ws;
      window.MESH = { connected: true };
      rtcLog('✓ Relay connected.');
      updateRTCStatus(_partnerOnline ? 'connected' : 'ready');
      _meshEverConnected = true;
      _resetReconnectBackoff();
      _startLivenessWatchdog();
      if (typeof _startHeartbeat === 'function') _startHeartbeat(); // presence:ping pulse — see the note near its definition
      emitSync('presence:hello', myId ? { pub: myId.pub } : {}, { queueOnFail: false });
      emitSync('sync:manifest', { manifest: buildSyncManifest() }, { queueOnFail: false });
      if (typeof ErosPipeline !== 'undefined' && ErosPipeline) ErosPipeline.replay();
      // Real, direct request: co-creation data shouldn't be lost if
      // both devices were offline at once (the existing sync:manifest
      // exchange above only helps if the OTHER device is online right
      // now to answer it). Reads the real, existing last-connected
      // timestamp BEFORE it gets overwritten just below by this same
      // connection event -- that's the real "since" boundary for what
      // this device could have missed.
      const sinceTs = DB.get('eravors_last_connected', 0);
      ws.send(JSON.stringify({ type: 'catch_up_request', sinceTs, limit: 500 }));
      DB.set('eravors_last_connected', Date.now());
      updateConnectionAmbient();
      return;
    }

    if (msg.type === 'presence') {
      // Real fix, found by testing the actual pairing flow end-to-end:
      // this used to only react when msg.peerId matched a pre-known
      // partnerPeerId -- correct once paired, but during active
      // pairing itself (someone scanning a fresh invite) there IS no
      // known partner yet, partnerPeerId is genuinely null, and this
      // whole block silently never ran. That meant the inviter's own
      // presence:hello (containing their pubkey) never got RE-sent once
      // the scanning side actually came online, since it only sends
      // once, on this device's own auth_ok -- which fires before the
      // other side exists yet. Re-announcing on ANY new peer connecting
      // is safe: this relay caps at two real, TOFU-pinned identities by
      // design (see relay-server.js), so "someone new connected" and
      // "my one possible partner connected" are the same real event.
      if (msg.online && myId) {
        emitSync('presence:hello', { pub: myId.pub }, { queueOnFail: false });
      }
      if (msg.peerId === partnerPeerId) {
        _partnerOnline = !!msg.online;
        if (_partnerOnline) {
          rtcLog('✓ Partner online.');
          updateRTCStatus('connected');
          showToast('💫 Co-Creation · Synced');
        } else {
          rtcLog('Partner offline. Will sync when they reconnect.');
          updateRTCStatus('ready');
          showToast('🌙 Solo · Partner offline');
        }
        updateConnectionAmbient();
      }
      return;
    }

    if (msg.type === 'ping') {
      try { ws.send(JSON.stringify({ type: 'pong' })); } catch (e) {}
      return;
    }

    if (msg.type === 'relay') {
      handleIncomingMeshData(msg.payload);
      return;
    }

    if (msg.type === 'catch_up_response') {
      const events = msg.events || [];
      if (events.length) rtcLog('Catching up on ' + events.length + ' real, persisted event' + (events.length === 1 ? '' : 's') + ' from while you were offline.');
      // Real, existing timestamp ordering -- oldest first, same order
      // the relay's own query already returns them in, so anything
      // depending on receive order (e.g. a rupture logged before its
      // own repair note) reconstructs correctly.
      events.forEach((ev) => { try { handleIncomingMeshData(ev.payload); } catch (e) { console.warn('[eravos] catch-up event failed to process: ' + e.message); } });
      return;
    }

    if (msg.type === 'relay_failed') {
      log('Relay: message not delivered (' + msg.reason + ') — will resync when partner reconnects', 'warn');
      return;
    }
  };

  ws.onclose = (ev) => {
    if (_mesh !== ws && _mesh !== null) return; // superseded by a newer socket — ignore the old one's close
    _handleConnectionDeath('relay_closed:' + (ev.reason || ev.code || 'unknown'));
  };

  ws.onerror = () => {
    // onclose follows immediately in browsers on a failed connection —
    // let that drive teardown/reconnect instead of double-handling here.
  };
}

// ═══════════════════════════════════════════════════════════════════
// RECONNECT BACKOFF — was three separate, uncoordinated fixed-delay
// setTimeout(connectToPartner, 6000-8000) calls scattered across
// connectToPartner()'s own catch block and conn.on('close')/('error') —
// each retrying at a flat rate forever, with no shared counter, no
// backoff, and no visible signal to the person that it's still trying
// versus stuck. One real system instead: exponential backoff (3s → 6s
// → 12s → 24s → capped at 60s), reset to the first step on any
// successful (re)connection, with the status label naming the attempt
// count once it's past the first try so "Reconnecting..." doesn't look
// frozen if it's actually still working through backoff.
// ═══════════════════════════════════════════════════════════════════
let _reconnectAttempt = 0;
let _reconnectTimer = null;

function _scheduleReconnect() {
  if (_reconnectTimer) return; // already scheduled — don't stack duplicate timers
  _reconnectAttempt++;
  const delayMs = Math.min(60000, 3000 * Math.pow(2, _reconnectAttempt - 1)); // 3s,6s,12s,24s,48s,60s cap
  const label = _reconnectAttempt > 1 ? `Reconnecting (attempt ${_reconnectAttempt})…` : 'Reconnecting…';
  rtcLog(label + ' next try in ' + Math.round(delayMs / 1000) + 's');
  updateRTCStatus('disconnected');
  _reconnectTimer = setTimeout(() => {
    _reconnectTimer = null;
    initMesh();
  }, delayMs);
}

function _resetReconnectBackoff() {
  _reconnectAttempt = 0;
  if (_reconnectTimer) { clearTimeout(_reconnectTimer); _reconnectTimer = null; }
}

// ═══════════════════════════════════════════════════════════════════
// CONNECTION AMBIENT — glanceable "when did we last connect", so the
// question doesn't depend on either of you remembering to wonder about
// it. Refreshes on its own; nothing to check, nothing to remember.
// ═══════════════════════════════════════════════════════════════════
function _formatAgo(ms) {
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 14) return `${d}d ago`;
  return `${Math.floor(d / 7)}w ago`;
}

function updateConnectionAmbient() {
  const icon = document.getElementById('conn-ambient-icon');
  const text = document.getElementById('conn-ambient-text');
  if (!icon || !text) return;

  if (window.MESH?.connected && _partnerOnline) {
    icon.textContent = '💫';
    text.textContent = 'Together now';
    text.style.color = 'var(--gold)';
    DB.set('eravors_last_connected', Date.now()); // keep-alive while connected
    return;
  }

  const last = DB.get('eravors_last_connected', null);
  icon.textContent = '🌙';
  text.style.color = 'var(--dim)';
  text.textContent = last ? `Last together: ${_formatAgo(last)}` : 'Not yet connected — tap to link up';
}

setInterval(updateConnectionAmbient, 30000);
setTimeout(updateConnectionAmbient, 500); // after boot, once DB/DOM are ready

// "Tap to link up" used to just switchTab('sparring') regardless of
// whether anyone was actually reachable — a click that did nothing
// honest when she's offline. This does three real things instead:
// checks actual connection state, persists an observable pending
// invite (§2.1/§2.3 — nothing that matters lives only in memory), and
// asks this device for Notification permission as the first real step
// toward waking her Android — NOT a claim that a push was sent to her
// device (still true: presence tells you she's *reachable*, not that
// she's been *notified* — the relay has no push capability, only
// "online right now or not"). The signaling endpoint this comment used
// to say the build didn't have yet — relay-server.js — now exists.
function requestConnectionLinkUp() {
  const online = !!(window.MESH?.connected && _partnerOnline);
  if (online) { switchTab('sparring'); return; }

  const invite = { from: S.user?.name || S.dbPrefix || 'someone', ts: Date.now() };
  DB.set('eravors_pending_invite', invite);
  appStream.emit(new SEvent('connection:invite_requested', invite));

  if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
    Notification.requestPermission();
  }

  showToast("💫 Not online yet — Eravos will connect the moment she opens the app");
  switchTab('sparring');
}

// ═══════════════════════════════════════════════════════════════════
// QUICK CAPTURE — reuses the Vault (already the generic "anything"
// store) rather than inventing a parallel storage system. The type tag
// is just metadata for later filtering; nothing blocks on picking one.
// ═══════════════════════════════════════════════════════════════════
function openQuickCapture() {
  const modal = document.getElementById('quick-capture-modal');
  if (modal) modal.classList.add('open');
  setTimeout(() => document.getElementById('qc-text')?.focus(), 50);
}
function closeQuickCapture() {
  const modal = document.getElementById('quick-capture-modal');
  if (modal) modal.classList.remove('open');
  const ta = document.getElementById('qc-text');
  if (ta) ta.value = '';
}
function saveQuickCapture(type) {
  const ta = document.getElementById('qc-text');
  const text = ta?.value?.trim();
  if (!text) { closeQuickCapture(); return; }
  saveToVault('quick:' + type, text);
  showToast('✓ Caught it');
  closeQuickCapture();
}
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && document.getElementById('quick-capture-modal')?.classList.contains('open')) {
    closeQuickCapture();
  }
});

// setupPeerConn (PeerJS DataConnection wiring) removed — data sync now
// goes entirely through initMesh() above. See the CO-CREATION RELAY
// block for the equivalent open/data/close/error handling on the new
// transport.

// ═══════════════════════════════════════════════════════════════════
// SOLO/DUO RECONNECT SYNC — reconcile local changes made while apart
// ═══════════════════════════════════════════════════════════════════
// Real gap this fills: handleP2PMessage below only ever relayed live
// push events while both sides were simultaneously connected. Nothing
// reconciled state after either side had been solo/offline — go solo,
// log a rupture, come back online, and your partner never saw it
// unless you happened to be connected at the exact moment you saved it.
//
// On reconnect, both sides exchange a manifest (count + latest
// timestamp per shared key). Each side asks for whatever the other has
// that it's missing, then merges by union of entries — never drops one
// side's data — sorted newest-first, capped the same way each list was
// already capped. "Prioritize newest or most complete": count-ahead OR
// timestamp-ahead both trigger a sync, and merge always keeps every
// entry either side had, so nothing is silently lost to a naive
// last-write-wins overwrite.
//
// Scope: only genuinely couple-shared logs sync automatically. Private-
// by-default data (feeling_history has its own share_state flag,
// journal, onboarding answers, drafts, secrets, device theme/config)
// is deliberately excluded — matches the app's own stated privacy
// model, not an arbitrary technical line.
const SHARED_SYNC_KEYS = {
  eravors_ruptures:        { cap: null },
  eravors_growth:          { cap: null },
  shared_commitments:      { cap: null },
  eravors_meaning_archive: { cap: null },
  eravors_codex:           { cap: null },
  eravors_vault:           { cap: null },
  eravors_planner_events:  { cap: 100 },
  eravors_poke_history:    { cap: 50 },
  eravors_love_inbox:      { cap: 20 },
  eravors_love_sent:       { cap: 20 },
  eravors_inbox:           { cap: 100 },
  eravors_safety_requests: { cap: 200 },
  eravors_need_history:    { cap: 50 },
  eravors_spar_history:    { cap: 200 },
  eravors_question_loops:  { cap: 300 },
  eravors_question_answers:{ cap: 600 },
  // Real, direct request: chat was previously real-time-only -- a
  // message sent while a partner's device was fully offline (not just
  // disconnected mid-session, actually closed/asleep) had nothing to
  // catch it up on reconnect, only the SENDING side's own queued-send
  // retry. Safe to add now specifically because ChatEngine.thread()
  // computes .mine fresh from .from === this.me rather than trusting
  // whatever was stored (see eravos-chat.js's own _isMine()) -- a
  // synced-in message from a partner's device used to carry THEIR
  // .mine value, which is backwards on this device.
  eravors_chat_thread:     { cap: 500 },
};

function _syncDedupKey(item) {
  // Not every log entry has an id (found by checking actual entry shapes —
  // love_inbox/love_sent push {message,from,ts} with no id). Fall back to
  // ts as a weak dedup key rather than assume a field that isn't always
  // there — a rare false-dedup on exact-ts collision is far cheaper than
  // crashing or silently treating every entry as unique forever.
  return item && item.id != null ? 'id:' + item.id : 'ts:' + (item && item.ts);
}

function _syncFreshness(item) {
  // For mutable entries (Rupture/Commitment — same id, status changed in
  // place), the append-only status_history's last timestamp is the real
  // "last modified" signal. Falls back to the entry's own .ts for
  // genuinely append-only entries (poke history, love inbox, etc.) where
  // there's nothing to compare beyond when the entry was created.
  if (item && Array.isArray(item.status_history) && item.status_history.length) {
    return item.status_history[item.status_history.length - 1].ts || 0;
  }
  return (item && item.ts) || 0;
}

function mergeSyncLog(localArr, remoteArr, cap) {
  const byKey = new Map();
  for (const item of (localArr || [])) byKey.set(_syncDedupKey(item), item);
  for (const item of (remoteArr || [])) {
    const k = _syncDedupKey(item);
    const existing = byKey.get(k);
    // Was: `if (!byKey.has(k))` — for a purely-new id this is right (union,
    // never drop an entry either side has), but for an id BOTH sides
    // already have, local unconditionally won every time regardless of
    // which side was actually more recently updated. Confirmed with a
    // test: a stale local 'open' rupture beat a remote 'resolved' update
    // to the SAME entry. Now compares freshness instead of just presence.
    if (!existing || _syncFreshness(item) > _syncFreshness(existing)) {
      byKey.set(k, item);
    }
  }
  const merged = [...byKey.values()].sort((a, b) => (b.ts || 0) - (a.ts || 0));
  return cap ? merged.slice(0, cap) : merged;
}

function buildSyncManifest() {
  const manifest = {};
  for (const key of Object.keys(SHARED_SYNC_KEYS)) {
    const arr = DB.get(key, []);
    manifest[key] = {
      count: Array.isArray(arr) ? arr.length : 0,
      latestTs: Array.isArray(arr) ? arr.reduce((m, i) => Math.max(m, (i && i.ts) || 0), 0) : 0,
    };
  }
  return manifest;
}

function handleSyncManifest(remoteManifest) {
  if (!remoteManifest) return;
  const local = buildSyncManifest();
  const needed = Object.keys(SHARED_SYNC_KEYS).filter(key => {
    const r = remoteManifest[key] || { count: 0, latestTs: 0 };
    const l = local[key] || { count: 0, latestTs: 0 };
    return r.count > l.count || r.latestTs > l.latestTs;
  });
  if (needed.length) emitSync('sync:request', { keys: needed }, { queueOnFail: false });
}

function handleSyncRequest(keys) {
  if (!Array.isArray(keys)) return;
  for (const key of keys) {
    if (!SHARED_SYNC_KEYS[key]) continue; // never serve a key outside the explicit allowlist
    emitSync('sync:value', { key, value: DB.get(key, []) }, { queueOnFail: false });
  }
}

function handleSyncValue(key, remoteValue) {
  const cfg = SHARED_SYNC_KEYS[key];
  if (!cfg) return; // reject anything not on the explicit shared-sync allowlist
  const local = DB.get(key, []);
  const merged = mergeSyncLog(local, remoteValue, cfg.cap);
  if (merged.length === local.length && merged.every((v, i) => v === local[i])) return; // no change
  DB.set(key, merged);
  log('Synced ' + key.replace('eravors_', '') + ' (' + merged.length + ' entries)', 'ok');
  appStream.emit(new SEvent('sync:merged', { key, count: merged.length }));
  const RENDERERS = {
    eravors_ruptures: () => { typeof renderRuptures === 'function' && renderRuptures(); typeof renderRelationalHealthField === 'function' && renderRelationalHealthField(); },
    eravors_growth: () => typeof renderGrowth === 'function' && renderGrowth(),
    shared_commitments: () => { typeof renderCommitments === 'function' && renderCommitments(); typeof renderRelationalHealthField === 'function' && renderRelationalHealthField(); },
    eravors_meaning_archive: () => typeof renderMeaningArchive === 'function' && renderMeaningArchive(),
    eravors_codex: () => typeof renderCodex === 'function' && renderCodex(),
    eravors_vault: () => typeof renderVault === 'function' && renderVault(),
    eravors_love_inbox: () => typeof renderLoveInbox === 'function' && renderLoveInbox(),
    eravors_question_loops: () => typeof renderQuestionLoops === 'function' && renderQuestionLoops(),
    eravors_question_answers: () => typeof renderQuestionLoops === 'function' && renderQuestionLoops(),
  };
  if (RENDERERS[key]) { try { RENDERERS[key](); } catch (e) { log('Sync render error: ' + e.message, 'warn'); } }
  _latticeRefreshIfVisible();
}

// Lattice pulls from nine different sources now (rupture, growth,
// feeling, vault, codex, questions, struggles, triggers, commitments —
// plus spar history, which only became readable once _archiveSparMatch
// stopped discarding turn text). Struggles/triggers/commitments/spar
// don't route through appStream for their local saves, so those call
// _latticeRefreshIfVisible() directly at their own save points instead
// of threading a render call through every single save function —
// this listener only covers the ones that do emit on appStream.
function _latticeRefreshIfVisible() {
  const panel = document.getElementById('panel-lattice');
  if (panel && panel.classList.contains('active') && typeof renderLattice === 'function') renderLattice();
}
const LATTICE_REFRESH_EVENTS = new Set(['rupture:save','growth:save','codex:save','vault:save','feeling:set','question:new','question:answer']);

// ── ALK INGEST ────────────────────────────────────────────────────
// The one wire. Anything carrying human language goes into the
// multidimensional lattice exactly once, here, at the source.
// §10.1 — one write authority. No tab calls ALK.ingest() itself.
// The app emits 45 event types. Six of them reached the lattice, and the two
// most-used were not among them: every CHAT MESSAGE and every FEELING you set
// were invisible to it. A relational lattice that cannot see what you say to
// each other, or how you said you were, is reading the margins (§0.1 — found
// by listing what emitSync actually fires against what this map contains).
//
// THE RULE for what belongs here, so the next addition is not a judgment call:
// an event is ingested if it carries HUMAN LANGUAGE OR A STATED INNER STATE.
// Transport is not — presence pings, sync frames, acks, call invites and
// availability say nothing about the relationship, and feeding them in would
// dilute every dimension with noise that always co-occurs.
const ALK_INGEST_EVENTS = {
  // language between you
  'chat:message':         ev => ({ text: ev.data && ev.data.text, speaker: ev.data && ev.data.from }),
  'call:transcript_line': ev => ({ text: ev.data && ev.data.text, speaker: ev.data && ev.data.speaker }),
  'spar:turn':            ev => ({ text: ev.data && ev.data.text, speaker: ev.data && ev.data.speaker }),
  'mirror:shared':        ev => ({ text: ev.data && (ev.data.text || ev.data.reflection) }),
  'love:sent':            ev => ({ text: ev.data && (ev.data.message || ev.data.text) }),

  // stated inner state — a feeling arrives with its body words attached, which
  // is more than most text carries
  'feeling:set':          ev => ({ text: [ev.data && ev.data.name, ev.data && ev.data.body].filter(Boolean).join(' — ') }),
  'feeling:expressed':    ev => ({ text: [ev.data && ev.data.name, ev.data && ev.data.note].filter(Boolean).join(' — ') }),
  'safety:requested':     ev => ({ text: ev.data && (ev.data.what || ev.data.need) }),

  // the relational record
  'rupture:save':         ev => ({ text: [ev.data && ev.data.what, ev.data && ev.data.feeling, ev.data && ev.data.need].filter(Boolean).join('. ') }),
  'growth:save':          ev => ({ text: ev.data && (ev.data.text || ev.data.note) }),
  'meaning:added':        ev => ({ text: ev.data && (ev.data.text || ev.data.title) }),
  'planner:event_outcome':ev => ({ text: ev.data && (ev.data.outcome || ev.data.note) }),

  // what you wrote and kept
  'codex:save':           ev => ({ text: ev.data && (ev.data.text || ev.data.body) }),
  'vault:save':           ev => ({ text: ev.data && (ev.data.text || ev.data.body) }),
};

// Local engines that never cross the relay but ARE human language. Ingested
// from their own stores rather than the sync bus, because they are yours.
const ALK_LOCAL_INGEST = [
  { store: 'eravors_hardtalk', pick: e => [e.subject, e.why].filter(Boolean).join('. ') },
  { store: 'eravors_goals',    pick: g => [g.title, g.why].filter(Boolean).join('. ') },
];

// A `grammar` attachment sent through chat PROPOSES the word. It does not
// make it shared -- that still requires the other side to take it up in the
// Grammar tab. Sending a word is offering it, not declaring it (§ Phase E).
appStream.onEmit(ev => {
  if (ev.type !== 'chat:attachment' || !ev.data || ev.data.kind !== 'grammar') return;
  if (!eravosGrammar || !ev.data.label) return;
  try {
    eravosGrammar.propose(ev.data.label, '', { origin: 'chat', originRef: ev.data.id });
  } catch (e) {
    // Already exists is the common case and is not an error worth shouting about,
    // but it is still named rather than hidden.
    console.info('[eravos] grammar propose from chat: ' + e.message);
  }
});
appStream.onEmit(ev => {
  const map = ALK_INGEST_EVENTS[ev.type];
  if (!map || typeof window === 'undefined' || !window.ALK) return;
  let payload;
  try { payload = map(ev); } catch (e) { console.error('[eravos] ALK ingest map failed for ' + ev.type + ':', e); return; }
  if (!payload || !payload.text || !String(payload.text).trim()) return;
  try {
    window.ALK.ingest(String(payload.text), { ts: ev.ts || Date.now(), speaker: payload.speaker || 'self' });
    window.dispatchEvent(new CustomEvent('alk:lattice-changed'));
  } catch (e) {
    console.error('[eravos] ALK.ingest failed on ' + ev.type + ':', e);   // §1.2 loud, named
  }
});
appStream.onEmit(ev => { if (LATTICE_REFRESH_EVENTS.has(ev.type)) _latticeRefreshIfVisible(); });

// ═══════════════════════════════════════════════════════════════════
// .erav — portable async shared-database file
// ═══════════════════════════════════════════════════════════════════
// Same problem the P2P reconnect-sync module solves, but for when
// there's no live connection at all — export a file, send it any way
// you like (email, USB, the Spacial server), the other side imports it
// whenever they get to it. Deliberately reuses SHARED_SYNC_KEYS and
// mergeSyncLog/handleSyncValue verbatim — a file import and a live P2P
// sync are the same merge, just triggered differently. No forked logic.
//
// sigma / delta, defined the way kern uses them (divergence / rate of
// change), not arbitrary numbers:
//   sigma_key = fraction of this key's entries that are new since the
//               last .erav export baseline (0 = nothing changed,
//               1 = fully novel / no baseline yet — kern treats "no
//               signal yet" as maximum uncertainty, same idea here)
//   delta_key = new entries per hour since that baseline — the rate
//               the two sides are diverging at, not just how far apart
//
// "Prioritize newest or most complete, whoever is forward": every key
// present in an imported file gets merged (never selectively skipped),
// and the merge itself already keeps the union of both sides — so
// "forward" only matters for which side's export to reach for first
// when you're deciding what to send, not for whether data survives the
// merge. Reported per-key in the manifest so the UI can show it.
const ERAV_FORMAT_VERSION = 1;

function _eravBaseline() {
  return DB.get('eravors_erav_baseline', {});
}

function buildEravManifest() {
  const baseline = _eravBaseline();
  const manifest = {};
  for (const key of Object.keys(SHARED_SYNC_KEYS)) {
    const arr = DB.get(key, []);
    const count = Array.isArray(arr) ? arr.length : 0;
    const latestTs = Array.isArray(arr) ? arr.reduce((m, i) => Math.max(m, (i && i.ts) || 0), 0) : 0;
    const b = baseline[key] || { count: 0, ts: 0 };
    const newCount = Math.max(0, count - b.count);
    const sigma = count > 0 ? Math.min(1, newCount / count) : 0;
    const hoursSince = b.ts ? Math.max((Date.now() - b.ts) / 3600000, 1 / 60) : null;
    const delta = hoursSince ? +(newCount / hoursSince).toFixed(3) : 0;
    manifest[key] = { count, latestTs, sigma: +sigma.toFixed(3), delta };
  }
  return manifest;
}

function exportErav() {
  const manifest = buildEravManifest();
  const data = {};
  for (const key of Object.keys(SHARED_SYNC_KEYS)) data[key] = DB.get(key, []);

  const sigmaVals = Object.values(manifest).map(m => m.sigma);
  const deltaVals = Object.values(manifest).map(m => m.delta);
  const overallSigma = sigmaVals.length ? +(sigmaVals.reduce((a, b) => a + b, 0) / sigmaVals.length).toFixed(3) : 0;
  const overallDelta = deltaVals.length ? +(deltaVals.reduce((a, b) => a + b, 0) / deltaVals.length).toFixed(3) : 0;

  const erav = {
    format: 'erav',
    version: ERAV_FORMAT_VERSION,
    exportedBy: S.dbPrefix || 'solo',
    exportedAt: Date.now(),
    sigma: overallSigma,
    delta: overallDelta,
    manifest,
    data,
  };

  // Update the baseline so the *next* export's sigma/delta measures
  // change since this one, not since the beginning of time.
  const newBaseline = {};
  for (const key of Object.keys(SHARED_SYNC_KEYS)) {
    newBaseline[key] = { count: manifest[key].count, ts: erav.exportedAt };
  }
  DB.set('eravors_erav_baseline', newBaseline);

  return erav;
}

function downloadErav() {
  const erav = exportErav();
  const blob = new Blob([JSON.stringify(erav, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  const ts = new Date(erav.exportedAt).toISOString().slice(0, 10);
  a.download = `${erav.exportedBy}-${ts}.erav`;
  a.click();
  log(`Exported .erav — σ:${erav.sigma} δ:${erav.delta}`, 'ok');
  showToast('⬇ .erav exported');
  return erav;
}

function importErav(erav) {
  // Fail loud on a malformed or incompatible file — §1.2, no silent
  // partial-import that leaves the DB in an ambiguous state.
  if (!erav || erav.format !== 'erav') {
    throw new Error('Not a valid .erav file (missing/wrong format field)');
  }
  if (erav.version !== ERAV_FORMAT_VERSION) {
    throw new Error(`.erav version ${erav.version} not supported (expected ${ERAV_FORMAT_VERSION})`);
  }
  if (!erav.data || typeof erav.data !== 'object') {
    throw new Error('.erav file has no data payload');
  }

  const localManifest = buildEravManifest();
  const results = {};
  for (const key of Object.keys(SHARED_SYNC_KEYS)) {
    if (!(key in erav.data)) continue;
    const remote = erav.manifest?.[key] || { count: 0, latestTs: 0 };
    const local = localManifest[key] || { count: 0, latestTs: 0 };
    const forward = remote.count > local.count || remote.latestTs > local.latestTs ? 'file' : 'local';
    const before = (DB.get(key, []) || []).length;
    handleSyncValue(key, erav.data[key]); // exact same merge path as live P2P sync
    const after = (DB.get(key, []) || []).length;
    results[key] = { forward, before, after, added: after - before };
  }

  log(`Imported .erav from ${erav.exportedBy} (σ:${erav.sigma} δ:${erav.delta})`, 'ok');
  showToast('⬆ .erav imported — ' + Object.values(results).reduce((s, r) => s + r.added, 0) + ' new entries');
  return results;
}

function importEravFromFile(fileInput) {
  const file = fileInput?.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const erav = JSON.parse(reader.result);
      const results = importErav(erav);
      const statusEl = document.getElementById('erav-import-status');
      if (statusEl) {
        statusEl.textContent = Object.entries(results)
          .filter(([, r]) => r.added > 0)
          .map(([k, r]) => `${k.replace('eravors_', '')}: +${r.added} (${r.forward} was forward)`)
          .join(', ') || 'No new entries — already in sync.';
      }
    } catch (e) {
      log('.erav import failed: ' + e.message, 'error');
      const statusEl = document.getElementById('erav-import-status');
      if (statusEl) statusEl.textContent = 'Import failed: ' + e.message;
    }
  };
  reader.readAsText(file);
}

function exportSharedDB() { downloadErav(); }
function inspectSharedDB() {
  const pre = document.getElementById('shared-db-inspect');
  if (!pre) return;
  const manifest = buildEravManifest();
  pre.textContent = JSON.stringify(manifest, null, 2);
  pre.style.display = pre.style.display === 'none' ? 'block' : 'none';
}

// ═══════════════════════════════════════════════════════════════════
// SYNC STREAM — Phase 1, §4.3/§1.4 (binding decision record).
//
// Replaces: the handleP2PMessage if/else chain below (now gone) AND
// the three sequential `window.handleP2PMessage = function(msg){...}`
// monkey-patches that used to sit later in this file (also gone —
// search 04-PHASEMAP.md if you're looking for where they went).
//
// Found during migration, not assumed: those three wrappers had
// exactly the "silent precedence, not hard error" shape Design Law 1
// forbids. The last-defined wrapper intercepted `'love'`, `'feeling'`,
// and `'need'`-shaped types via `type.startsWith('msg_') ||
// ['text','love','feeling','need','poem'].includes(type)` and returned
// before falling through — so the ORIGINAL handling of raw `'love'`
// (love-inbox toast) and raw `'feeling'` (partner-feeling-display
// update) in this function could never run for those types once the
// third wrapper was wired. Two confirmed victims of this shadowing:
//   1. `syncFeelingToPartner()` (the feeling-wheel save path) sent
//      `feeling_update` — a type NO gate anywhere ever listened for,
//      flat or namespaced. `01-ARCHITECTURE.md` §4.1 claims this class
//      of bug was "already fixed"; it was fixed for the Guided Feeling
//      Flow's save path (`_gffSave`, sends `'feeling'`) but not for the
//      plain feeling-wheel path. Both now converge on one gate below:
//      `feeling:set`.
//   2. `sendLove()` (Settings → System → "💌 Send Love" / "✨
//      Surprise") never used `sendP2P()` at all — it checked
//      `window._dc` / `window._bc`, two globals nothing in this
//      codebase ever assigns. The button has always shown "Connect to
//      Raven first" regardless of actual connection state. Rewired
//      below onto the real pipeline as `love:sent`.
//
// One Map, one lookup, per SISO Design Law 1 — a second gate
// registered under a type already taken throws immediately instead of
// silently winning or losing.
// ═══════════════════════════════════════════════════════════════════
const syncStream = new Stream();

function emitSync(type, data, opts) {
  data = data || {};
  const envelope = {
    type,
    schemaVersion: 1,
    data,
    from: S.user?.name || null,
    uuid: data.id || data.uuid || ('sync-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8)),
    ts: Date.now(),
  };
  const sent = sendP2P(envelope);
  const queueOnFail = !opts || opts.queueOnFail !== false;
  if (!sent && queueOnFail && typeof ErosPipeline !== 'undefined' && ErosPipeline) {
    ErosPipeline.push(envelope);
  }
  return sent;
}

function dispatchSync(envelope) {
  if (!envelope || !envelope.type) return;
  if (envelope.schemaVersion !== undefined && envelope.schemaVersion !== 1) {
    log('P2P: unknown schemaVersion ' + envelope.schemaVersion + ' for ' + envelope.type + ' — dropped, not guessed', 'warn');
    return;
  }
  log('P2P: ' + envelope.type, 'info');
  const ev = new SEvent(envelope.type, envelope.data || {});
  ev.from = envelope.from;
  ev.uuid = envelope.uuid;
  ev.ts = envelope.ts || ev.ts;
  syncStream.emit(ev); // unclaimed types land in syncStream.pending — residue, not an error (Design Law 3)
}

// Back-compat alias — nothing outside this file should need it going
// forward, but keeping the name avoids a silent breakage if something
// still calls it directly.
function handleP2PMessage(msg) { dispatchSync(msg); }

// ── CHAT & SHARED PRESENCE ────────────────────────────────────────
// One engine (shared/eravos-chat.js) owns the thread; these gates are pure
// transport. §10.1 -- no gate writes the thread directly.
//
// chat:typing / presence:cursor / presence:tab are EPHEMERAL by declaration.
// The engine's _assertEphemeral() refuses to persist them and a test asserts
// the store stays empty under a thousand cursor events. Someone's mouse path
// through a relational app is not a record anyone consented to keep.
//
// was `const` -- same real bug class as eravosPairing/eravosChoice
// before it: eravos-chat.js (defines ChatEngine) loads AFTER this
// script in index.html's script order, so this construction
// permanently failed and eravosChat stayed null forever. Found by
// sendMediaMessage() throwing "Cannot read properties of null" when
// actually tested, not assumed. Same let + one DOMContentLoaded retry
// fix as eravosPairing -- closures over eravosChat (sendMediaMessage,
// the chat:media Gate, chat.js's own engine() getter) see the
// reassignment correctly since they read the variable binding, not a
// snapshotted value.
let eravosChat = (typeof ChatEngine !== 'undefined')
  ? new ChatEngine({ me: (S.user && S.user.name) || 'me' })
  : null;
if (typeof window !== 'undefined') window.eravosChat = eravosChat;
if (typeof window !== 'undefined' && !eravosChat) {
  window.addEventListener('DOMContentLoaded', () => {
    if (!eravosChat && typeof ChatEngine !== 'undefined') {
      eravosChat = new ChatEngine({ me: (S.user && S.user.name) || 'me' });
      window.eravosChat = eravosChat;
    }
  });
}

syncStream.register(new (class extends Gate {
  constructor() { super('chat:message'); }
  transform(ev) {
    if (!eravosChat) return;
    const m = eravosChat.receive(ev.data, ev.from);
    if (m) {
      updateInboxBadge && updateInboxBadge();
      if (typeof renderChatTab === 'function') renderChatTab();
      // was the one real gap -- planner/commitments/pokes all already
      // toast on real incoming events (checked directly), chat messages
      // didn't. Same real de-dupe/DND-aware showToast() everything
      // else already uses, not a separate notification path.
      if (!_isDND()) {
        const preview = (m.text || '').slice(0, 60) + ((m.text || '').length > 60 ? '…' : '');
        showToast('💬 ' + (ev.from || 'Partner') + ': ' + preview);
      }
    }
  }
})());

// ── MEDIA MESSAGES — real image/video, not a reference. Separate from
// chat:message's ATTACHMENT_KINDS on purpose: those are references to
// content ALREADY on both sides (a vault item, a feeling) -- an
// attachment's own validateAttachment() caps `preview` at 240 chars,
// nowhere near enough for real image/video bytes, and the vault itself
// is local-only (saveToVault -> a local-only appStream.emit, never
// emitSync), so a reference to "vault item #123" would mean nothing on
// the partner's device. The actual bytes have to travel through the
// real sync transport, so this is its own Gate.
//
// Real, stated size limit -- MAX_MEDIA_BYTES, same discipline as
// MAX_TEXT in eravos-chat.js. No chunked-transfer infrastructure exists
// for the P2P relay, so one message carries one full payload; this cap
// keeps that honest (a real photo or a several-second clip at modest
// quality, not "any video file").
const MAX_MEDIA_BYTES = 6 * 1024 * 1024; // 6MB, base64-encoded size

async function sendMediaMessage(file, caption) {
  if (!file) return null;
  if (file.size > MAX_MEDIA_BYTES) {
    showToast('📷 Too large — 6MB max (this file is ' + (file.size / 1024 / 1024).toFixed(1) + 'MB)');
    return null;
  }
  const mediaType = file.type.startsWith('video/') ? 'video' : 'image';
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
  // real check AFTER base64 encoding too -- the encoded string can
  // still exceed the cap even when the raw file didn't, base64 inflates
  // size by roughly a third
  if (dataUrl.length > MAX_MEDIA_BYTES * 1.4) {
    showToast('📷 Too large once encoded for sending — try a smaller file');
    return null;
  }

  const id = 'media-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
  const ts = Date.now();
  const payload = { id, mediaType, dataUrl, caption: caption || '', ts };

  const sent = emitSync('chat:media', payload, { queueOnFail: true });
  // Save to the SENDER's own vault immediately too -- with the real
  // send date, not deferred until some later sync confirmation.
  saveMediaToVault(mediaType, dataUrl, caption, ts);
  // Real message in the actual thread too -- was missing before:
  // emitSync('chat:media', ...) alone never touched eravosChat's own
  // thread at all, so a sent photo landed in the vault with a toast
  // but never appeared as an actual message in the conversation.
  // Bypasses ChatEngine.send()'s validateAttachment() on purpose (its
  // 240-char preview cap is for reference-kind attachments, not real
  // image/video bytes) -- constructs the same real message shape
  // _append() expects directly instead.
  const msgObj = {
    id, from: eravosChat ? eravosChat.me : null, mine: true,
    text: caption || '', attachment: { kind: mediaType, id, dataUrl, label: mediaType },
    ts, delivered: !!sent, read: false, queued: !sent,
  };
  if (eravosChat) {
    eravosChat._append(msgObj);
    // Real fix: was eravosChat._emit('message', { id }) -- only the id,
    // not the full message, which would silently break any listener
    // expecting msg.text (found while wiring Phase O's own send path,
    // which shares this exact pattern).
    eravosChat._emit('message', msgObj);
  }
  showToast(sent ? '📷 Sent' : '📤 Queued — will send when partner connects');
  if (typeof renderChatTab === 'function') renderChatTab();
  return payload;
}

/** sendRecordedChatMessage(blob, kind, transcript) -- Phase O, spec/
    PHASEMAP-v4.md. Real voice/video message send, reusing
    sendMediaMessage()'s own established pattern (same real bypass of
    ChatEngine.send()'s validateAttachment(), same chat:media gate,
    same vault save) rather than inventing a second one. mediaType is
    kept distinct ('voice-message'/'video-message', never 'image'/
    'video') so playback rendering can tell a recorded message apart
    from an uploaded photo/video. */
async function sendRecordedChatMessage(blob, kind, transcript) {
  if (!blob) return null;
  if (blob.size > MAX_MEDIA_BYTES) {
    showToast('🎙️ Too large to send — ' + (blob.size / 1024 / 1024).toFixed(1) + 'MB, 6MB max');
    return null;
  }
  const mediaType = kind === 'video' ? 'video-message' : 'voice-message';
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
  if (dataUrl.length > MAX_MEDIA_BYTES * 1.4) {
    showToast('🎙️ Too large once encoded for sending — try a shorter recording');
    return null;
  }

  const id = 'media-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
  const ts = Date.now();
  // transcript stays local-only (§ Phase O: "local, and never
  // required") -- included in the real message payload so it syncs
  // WITH the recording if the person chose to include it, never
  // computed or required on the receiving side.
  const payload = { id, mediaType, dataUrl, transcript: transcript || null, ts };

  const sent = emitSync('chat:media', payload, { queueOnFail: true });
  saveMediaToVault(mediaType, dataUrl, transcript || '', ts);

  const msgObj = {
    id, from: eravosChat ? eravosChat.me : null, mine: true,
    text: transcript || '', attachment: { kind: mediaType, id, dataUrl, label: kind === 'video' ? 'video message' : 'voice message' },
    ts, delivered: !!sent, read: false, queued: !sent,
  };
  if (eravosChat) {
    eravosChat._append(msgObj);
    eravosChat._emit('message', msgObj);
  }
  showToast(sent ? (kind === 'video' ? '📹 Sent' : '🎙️ Sent') : '📤 Queued — will send when partner connects');
  if (typeof renderChatTab === 'function') renderChatTab();
  return payload;
}
window.sendRecordedChatMessage = sendRecordedChatMessage;

syncStream.register(new (class extends Gate {
  constructor() { super('chat:media'); }
  transform(ev) {
    const { mediaType, dataUrl, caption, transcript, ts } = ev.data || {};
    if (!dataUrl) return;
    // Real, confirmed contact evidence for space-distance too -- a real
    // photo/video shared between two people is at least as meaningful
    // a contact signal as a planner event outcome (already wired,
    // see setEventOutcome()). Same non-fatal, fire-and-forget pattern.
    fetch('/api/emergence/space/contact', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contactType: 'message', timestamp: ts || Date.now() }),
    }).catch(() => {});

    // Phase O real messages carry transcript, not caption (an
    // auto-transcribed text isn't something the sender typed as a
    // caption) -- vault/thread text falls back correctly either way.
    const displayText = mediaType === 'voice-message' || mediaType === 'video-message' ? (transcript || '') : (caption || '');
    saveMediaToVault(mediaType, dataUrl, displayText, ts);
    const msgObj = {
      id: ev.data.id, from: ev.from || 'them', mine: false,
      text: displayText, attachment: { kind: mediaType, id: ev.data.id, dataUrl, label: mediaType },
      ts, delivered: true, read: false,
    };
    if (eravosChat) {
      eravosChat._append(msgObj);
      // Real fix, same one made on the sending side: was only {id},
      // not the full message.
      eravosChat._emit('message', msgObj);
    }
    if (!_isDND()) {
      const label = mediaType === 'video-message' ? 'a video message' : mediaType === 'voice-message' ? 'a voice message'
        : mediaType === 'video' ? 'a video' : 'a photo';
      showToast('📷 ' + (ev.from || 'Partner') + ' shared ' + label);
    }
    if (typeof renderChatTab === 'function') renderChatTab();
  }
})());

syncStream.register(new (class extends Gate {
  constructor() { super('chat:receipt'); }
  transform(ev) { eravosChat && eravosChat.applyReceipt(ev.data); }
})());

syncStream.register(new (class extends Gate {
  constructor() { super('chat:typing'); }
  transform(ev) { eravosChat && eravosChat.receiveTyping(ev.data); }
})());

syncStream.register(new (class extends Gate {
  constructor() { super('presence:cursor'); }
  transform(ev) { eravosChat && eravosChat.receiveCursor(ev.data); }
})());

syncStream.register(new (class extends Gate {
  constructor() { super('presence:tab'); }
  transform(ev) { eravosChat && eravosChat.receiveTab(ev.data); }
})());

// ── SHARED GRAMMAR ────────────────────────────────────────────────
// Moved here (was further down in this file) -- eravosSelectGrammar,
// right below, needs eravosGrammar at ITS OWN construction time
// (typeof eravosGrammar !== 'undefined' && eravosGrammar). A real,
// within-file ordering bug found by testing, not the cross-file kind
// test/boot-order.mjs checks for -- that test verifies script LOAD
// order, not the order variables are DECLARED within this one file,
// so it couldn't have caught this. Confirmed directly: a real headless
// browser run threw "Cannot access 'eravosGrammar' before
// initialization" from eravosSelectGrammar's own construction line.
//
// Phase E. Two-sided by construction: the ONLY path from `proposed` to
// `shared` is the other side calling takeUp(), and the guarantee holds over
// the wire too -- applyRemote('takeup') refuses when the sender was also the
// proposer. Nothing here infers grammar (§1.1).
//
// `me` is the stable SIDE ('self' | 'partner'), never a display name: a
// rename must not orphan authorship. That is the same failure the admin
// engine's root-cause fix was about.
let eravosGrammar = (typeof GrammarStore !== 'undefined')
  ? new GrammarStore({ me: (S.user && (S.user.role === 'partner')) ? 'partner' : 'self' })
  : null;
if (typeof window !== 'undefined') window.eravosGrammar = eravosGrammar;
if (typeof window !== 'undefined' && !eravosGrammar) {
  window.addEventListener('DOMContentLoaded', () => {
    if (!eravosGrammar && typeof GrammarStore !== 'undefined') {
      eravosGrammar = new GrammarStore({ me: (S.user && (S.user.role === 'partner')) ? 'partner' : 'self' });
      window.eravosGrammar = eravosGrammar;
    }
  });
}

// ── SELECT → GRAMMAR (Phase E, last item) ─────────────────────────
// A faster manual path, not inference. The system never decides a phrase is
// meaningful — a person selects it and presses a button, and it still lands
// in `proposed` (§1.1).
const eravosSelectGrammar = (typeof SelectGrammar !== 'undefined' && typeof eravosGrammar !== 'undefined' && eravosGrammar)
  ? new SelectGrammar({
      store: eravosGrammar,
      onPropose: () => { if (typeof renderGrammarTab === 'function') renderGrammarTab(); },
    })
  : null;
if (typeof window !== 'undefined') {
  window.eravosSelectGrammar = eravosSelectGrammar;
  if (eravosSelectGrammar) eravosSelectGrammar.attach(document);
}


// ═══════════════════════════════════════════════════════════════════
// v0.12.0 MIGRATION — runs once, idempotent, and uses the ADMIN ENGINE
// rather than hand-editing storage. If the migration is right, the engine
// is right; if the engine is wrong, the migration surfaces it (§1.1).
//
// What it does, and only if there is something to do:
//   1. purge retired theme state left on this device
//   2. move the seeded partner OUT and archive their data -- their feelings
//      and ruptures are theirs, and they do not transfer to anyone (§17.3,
//      the rename/replace distinction)
//   3. tear down the pair -- crypto identity included, so the next
//      connection handshakes fresh
//   4. drop to SOLO. A partner account exists again only when a real person
//      accepts an invite.
// ═══════════════════════════════════════════════════════════════════
(function migrateToSolo() {
  if (typeof AdminEngine === 'undefined' || typeof DB === 'undefined') return;
  if (DB.get('eravors_migration_v012', false)) return;
  try {
    const admin = new AdminEngine();
    const report = { themes: null, removed: [], pair: null };
    report.themes = admin.purgeThemes();
    admin.users().filter(u => u.role === 'partner').forEach(u => {
      // archive, never purge: this is somebody's logged history (§0.3)
      report.removed.push(admin.removeUser(u.key, { disposition: 'archive' }));
    });
    if (report.removed.length) report.pair = admin.clearCoCreation();
    DB.set('eravors_migration_v012', { ts: Date.now(), removed: report.removed.map(r => r.userKey),
                                       archivedKeys: report.removed.reduce((n, r) => n + r.archived.length, 0) });
    if (report.removed.length) {
      console.info('[eravos] migrated to solo — archived ' +
        report.removed.reduce((n, r) => n + r.archived.length, 0) + ' keys from ' +
        report.removed.map(r => r.userKey).join(', '));
    }
  } catch (e) {
    // §1.2 -- a failed migration is NAMED and not retried blindly, so a
    // half-migrated device is visible instead of silently looping.
    console.error('[eravos] v0.12.0 migration failed:', e.message);
    DB.set('eravors_migration_v012', { ts: Date.now(), failed: e.message });
  }
})();

// ── CALL AUDIO + EXPRESSIONS (v0.19.0) ────────────────────────────
const eravosCallAudio = (typeof CallAudio !== 'undefined') ? new CallAudio({}) : null;
if (typeof window !== 'undefined') window.eravosCallAudio = eravosCallAudio;

/**
 * Replay the last 15 seconds of THEM. The highest-leverage thing in the call
 * stack: you did not mishear because the codec was bad, you missed it because
 * a bus went past. Memory only, dies with the call.
 */
function replayLast(seconds) {
  if (!eravosCallAudio) return;
  const r = eravosCallAudio.replay(seconds || 15);
  if (!r.ok) { showToast(r.reason); return; }
  showToast('Replaying the last ' + r.seconds + 's');
}

/** Sending an expression can SET your feeling — they are the same act. */
function sendExpression(emoji, alsoSetFeeling) {
  if (typeof EravosExpressions === 'undefined') return;
  const feelings = EravosExpressions.feelingsFor(emoji);
  const says = (EravosExpressions.all().filter(x => x.emoji === emoji)[0] || {}).says || '';
  try {
    if (typeof eravosChat !== 'undefined' && eravosChat) eravosChat.send(emoji);
    else emitSync('chat:message', { text: emoji, ts: Date.now() });
  } catch (e) { showToast(e.message); return; }

  // Only when asked. Sending a heart is not always a declaration about your
  // internal state, and overwriting someone's logged feeling because they
  // sent an emoji would be the app deciding how they are (§1.1).
  if (alsoSetFeeling && feelings.length && typeof selectFeeling === 'function') {
    selectFeeling(feelings[0]);
  }
  if (says) showToast('Sent: ' + says);
}

/** The picker. Grouped by intent, searchable by meaning, "Other" always last. */
function renderExpressionPicker(hostId, opts) {
  const host = document.getElementById(hostId || 'expr-picker');
  if (!host || typeof EravosExpressions === 'undefined') return;
  opts = opts || {};
  const paired = !!(typeof eravosPairing !== 'undefined' && eravosPairing && eravosPairing.state().paired);
  const q = (document.getElementById('expr-search') || {}).value || '';
  let items = q.trim() ? EravosExpressions.search(q) : EravosExpressions.visible({ paired });
  if (!paired) items = items.filter(x => !x.partnerOnly);

  const byGroup = {};
  items.forEach(x => { (byGroup[x.groupLabel] = byGroup[x.groupLabel] || []).push(x); });

  host.innerHTML = Object.keys(byGroup).map(g =>
    '<div class="xp-group"><div class="xp-label">' + g + '</div><div class="xp-row">' +
    byGroup[g].map(x =>
      '<button class="xp-item" title="' + x.says.replace(/"/g, '&quot;') + '" ' +
      'aria-label="' + x.says.replace(/"/g, '&quot;') + '" ' +
      'onclick="sendExpression(\'' + x.emoji + '\', ' + (opts.setFeeling ? 'true' : 'false') + ')">' +
      '<span class="xp-e">' + x.emoji + '</span><span class="xp-s">' + x.says + '</span></button>').join('') +
    '</div></div>').join('') +
    // §Other primitive — the private one that means something only between
    // two people. No fixed set can contain that.
    '<div class="xp-group"><div class="xp-label">Yours</div><div class="xp-row">' +
    '<button class="xp-item xp-other" onclick="addOwnExpression()">' +
    '<span class="xp-e">+</span><span class="xp-s">something else</span></button></div></div>';
}

/**
 * Yours. Stored in the expression set itself (v0.27.0) rather than parked in
 * the choice registry as a text label — the old version recorded the words
 * and produced nothing sendable, searchable, or linked to a feeling.
 */
function addOwnExpression() {
  const emoji = window.prompt('Paste or type the emoji:');
  if (!emoji || !emoji.trim()) return;
  const says = window.prompt('What does it mean when YOU send it?\n\n' +
    'This is the alt text, what search matches on, and what makes it usable ' +
    'by someone who reads emoji differently than you do.');
  if (!says || !says.trim()) return;
  const feel = window.prompt('Any feelings it maps to? Comma-separated, or leave blank.\n' +
    'e.g. Love, Tender');
  try {
    const feelings = (feel || '').split(',').map(f => f.trim()).filter(Boolean);
    const r = EravosExpressions.addCustom(emoji, says, { feelings });
    showToast(r.reused ? 'Already yours — brought back to the front' : (r.note || 'Yours now'));
    renderExpressionPicker('expr-picker',
      { setFeeling: !!(document.getElementById('expr-set-feeling') || {}).checked });
  } catch (e) { showToast(e.message); }
}

function openExpressionPicker() {
  const m = document.getElementById('expression-modal');
  if (m) m.classList.add('open');
  renderExpressionPicker('expr-picker', { setFeeling: !!(document.getElementById('expr-set-feeling') || {}).checked });
  const cb = document.getElementById('expr-set-feeling');
  if (cb && !cb.dataset.wired) {
    cb.dataset.wired = '1';
    cb.addEventListener('change', () => renderExpressionPicker('expr-picker', { setFeeling: cb.checked }));
  }
}
function closeExpressionPicker() {
  const m = document.getElementById('expression-modal');
  if (m) m.classList.remove('open');
}

if (typeof window !== 'undefined') {
  Object.assign(window, { replayLast, sendExpression, renderExpressionPicker, addOwnExpression,
                          openExpressionPicker, closeExpressionPicker });
}

// ── REGULATION GATE + CARE PROFILE (v0.17.0) ──────────────────────
// Both local. Neither has a transport, and the regulation reading is never
// attached to anything anyone wrote — a self-report that can be quoted back
// at you is not a self-report, it is ammunition.
const eravosRegulation = (typeof Regulation !== 'undefined') ? new Regulation({}) : null;
const eravosCare = (typeof CareProfile !== 'undefined')
  ? new CareProfile({ me: (S.user && S.user.role === 'partner') ? 'partner' : 'self' }) : null;
if (typeof window !== 'undefined') Object.assign(window, { eravosRegulation, eravosCare });

/**
 * Ask before an irreversible mode — and let them through either way.
 * @returns {Promise<boolean>} did they proceed
 */
async function regulationCheck(mode) {
  if (!eravosRegulation) return true;
  if (!eravosRegulation.shouldAsk(mode)) {
    // a fresh reading already exists; advise on it without re-asking
    const a = eravosRegulation.advise();
    if (!a.advise) return true;
    const go = confirm(a.says + '\n\n' + a.question + '\n\nOK = go ahead anyway, Cancel = come back to it');
    eravosRegulation.proceeded(go);
    return go;
  }
  const feeling = prompt('Before you start — how are you? (in your words, or leave blank)');
  if (feeling === null) return false;            // cancelling the check is a no
  const act = parseInt(prompt('How activated? 0-10 — how much charge is in your body right now', '5'), 10);
  const reg = parseInt(prompt('How regulated? 0-10 — how much access do you have to yourself right now', '5'), 10);
  let res;
  try { res = eravosRegulation.record({ feeling: feeling || null, activation: act, regulation: reg, mode }); }
  catch (e) { showToast(e.message); return true; }   // a bad rating never blocks
  if (!res.advice.advise) return true;
  const go = confirm(res.advice.says + '\n\n' + res.advice.question +
                     '\n\nOK = go ahead anyway, Cancel = come back to it');
  eravosRegulation.proceeded(go);
  if (!go) showToast('Come back to it whenever. Nothing is recorded as a judgment.');
  return go;
}

/** Surface THEIR care entries at the moment they are useful, not in a tab. */
function surfaceCareFor(moment) {
  if (!eravosCare) return;
  let entries = [];
  try { entries = eravosCare.forMoment(moment); } catch (e) { return; }
  if (!entries.length) return;
  const e = entries[0];
  const line = e.trigger ? e.trigger + ' — ' + e.text : e.text;
  showToast('They wrote: ' + line, 12000);
}
if (typeof window !== 'undefined') Object.assign(window, { regulationCheck, surfaceCareFor });

// A rupture is exactly when their "when I'm upset" should appear.
appStream.onEmit(ev => {
  if (ev.type === 'rupture:save') surfaceCareFor('rupture');
});

// ── SAFETY (v0.16.0) ──────────────────────────────────────────────
// Local only. This engine is given a COUNTING function, never message text,
// and it has no transport of any kind — no bus, no emitSync, nothing that
// could put a pattern on the wire. If a partner could learn the app had
// flagged something, the person it flagged is in more danger than before.
const eravosSafety = (typeof Safety !== 'undefined') ? new Safety({
  read() {
    const now = Date.now(), day = 86400000;
    const since = d => now - d * day;
    const ruptures = DB.get('eravors_ruptures', []) || [];
    const ht = DB.get('eravors_hardtalk', []) || [];
    const goals = DB.get('eravors_goals', []) || [];
    const feelings = DB.get('eravors_feeling_history', []) || [];
    const desires = DB.get('eravors_desires', {}) || {};

    const couldNotSay = ht.reduce((n, e) => n + (e.attempts || [])
      .filter(a => a.ts > since(90) && /could not say|couldn't say/i.test(a.went || '')).length, 0);
    const withdrawn = Object.keys(desires).filter(id => {
      const m = desires[id] && desires[id].self;
      return m && m.withdrawn && m.ts > since(90);
    }).length;
    const recentFeelings = feelings.filter(f => (f.ts || 0) > since(45));
    const dominant = recentFeelings.length
      ? Math.max(...Object.values(recentFeelings.reduce((a, f) => {
          a[f.name] = (a[f.name] || 0) + 1; return a; }, {})))
      : 0;

    return {
      ruptures_without_repair: ruptures.filter(r =>
        r.ts > since(60) && (!r.attempts || !r.attempts.length) && r.status !== 'resolved').length,
      could_not_say_it: couldNotSay,
      withdrawn_after_match: withdrawn,
      one_sided_proposals: goals.filter(g =>
        g.owner === 'proposed' && g.createdAt > since(120)).length,
      // only counts as flat if there is enough of it to mean anything
      feelings_flattening: recentFeelings.length >= 30 && dominant / recentFeelings.length > 0.9
        ? recentFeelings.length : 0,
    };
  },
}) : null;
if (typeof window !== 'undefined') window.eravosSafety = eravosSafety;

/**
 * The toast. Offers a door; never announces a conclusion at someone.
 * Runs at most once per session, and only when something is genuinely over
 * threshold — the numbers are set so a bad week trips nothing.
 */
function checkSafetyPatterns() {
  if (!eravosSafety || typeof showToast !== 'function') return;
  if (window._safetyCheckedThisSession) return;
  window._safetyCheckedThisSession = true;
  const found = eravosSafety.check();
  if (!found.length) return;
  const p = found[0];   // one at a time. Never a list of what is wrong with you.
  showToast(p.says + ' — ' + p.question + '  (Settings › Support)', 14000);
}
function openSupportResources() {
  if (!eravosSafety) return;
  const r = eravosSafety.resources();
  const host = document.getElementById('support-resources');
  if (!host) return;
  host.innerHTML = r.items.map(i =>
    '<div class="sup-item"><div class="sup-label">' + i.label + '</div>' +
    '<div class="sup-detail">' + i.detail + '</div></div>').join('') +
    '<p class="small" style="color:var(--dim);margin-top:10px">' + r.note + '</p>';
}
if (typeof window !== 'undefined') Object.assign(window, { checkSafetyPatterns, openSupportResources });

// ── NEW FEATURE ENGINES (v0.14.0) ─────────────────────────────────
const eravosHardTalk = (typeof HardTalk !== 'undefined') ? new HardTalk({}) : null;
const eravosGoals    = (typeof Goals !== 'undefined')    ? new Goals({ me: (S.user && S.user.role === 'partner') ? 'partner' : 'self' }) : null;
const eravosDesires  = (typeof Desires !== 'undefined')  ? new Desires({ me: (S.user && S.user.role === 'partner') ? 'partner' : 'self' }) : null;
if (typeof window !== 'undefined') Object.assign(window, { eravosHardTalk, eravosGoals, eravosDesires });

// ── ACCOUNT & PARTNER ACTIONS (v0.13.0) ───────────────────────────
// Surfaced in Settings > Admin, which is reachable, rather than only in the
// top-level Admin tab under System. A destructive action nobody can find is
// not a safety feature, it is a dead end.
//
// Every one of these takes a full export FIRST and downloads it, whatever the
// person chooses next (§0.3, §9.4). None of them is a bare confirm().

function _acctMsg(text, isError) {
  // Two possible hosts now -- the admin-only card (Settings > Admin,
  // "Remove partner account" only) and the personal card (Settings >
  // System > Account & Partner). Whichever is actually in the DOM (or
  // both) gets the message; a missing element is a silent no-op, same
  // as everywhere else in this file.
  ['acct-danger-msg', 'acct-danger-msg-sys'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.textContent = text; el.style.color = isError ? 'var(--rose)' : 'var(--teal)'; }
  });
  if (typeof showToast === 'function') showToast(text);
}
function _download(obj, name) {
  try {
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    return true;
  } catch (e) {
    // §1.2 -- if the export failed, SAY SO and stop. Proceeding to delete
    // after a failed backup is the worst possible order of events.
    _acctMsg('Export failed — nothing was deleted: ' + e.message, true);
    return false;
  }
}
function _admin() {
  if (typeof AdminEngine === 'undefined') throw new Error('admin engine not loaded');
  return new AdminEngine();
}

function renderAccountPartnerRow() {
  // Same two-host situation as _acctMsg above: the admin-only card still
  // shows who the partner is next to "Remove partner account", and the
  // personal card (Settings > System) shows it too, next to Invite/
  // Redeem/Decouple. Populate whichever hosts exist.
  const hosts = ['acct-partner-row', 'acct-partner-row-sys']
    .map(id => document.getElementById(id))
    .filter(Boolean);
  if (!hosts.length) return;
  let users = [];
  try { users = _admin().users(); } catch (e) { hosts.forEach(h => h.textContent = e.message); return; }
  const partner = users.filter(u => u.role === 'partner')[0];
  const paired = typeof eravosPairing !== 'undefined' && eravosPairing && eravosPairing.state().paired;
  const html = partner
    ? '<div class="small" style="color:var(--dim)">Partner: <strong style="color:var(--amber)">' +
      partner.name + '</strong> — ' + partner.dataKeys + ' data keys' +
      (paired ? ' · paired' : ' · not paired') + '</div>'
    : '<div class="small" style="color:var(--dim)">No partner account on this device. You are solo.</div>';
  hosts.forEach(h => h.innerHTML = html);
}

/** Thin DOM shim over redeemInviteCode() for the Settings > System >
    Account & Partner surface -- same pattern as redeemInviteFromModal(),
    so redeemInviteCode() itself stays free of any one screen's element
    ids. Was toggleAdminRedeemInvite()/applyAdminRedeemInvite() when this
    lived behind the admin gate (§16.1) -- renamed since it's no longer
    admin-only, ids repointed at the '-sys' elements in system.html. */
function toggleRedeemInvite() {
  const row = document.getElementById('redeem-row-sys');
  if (row) row.style.display = row.style.display === 'none' ? 'block' : 'none';
}
function applyRedeemInvite() {
  const input = document.getElementById('redeem-input-sys');
  const errEl = document.getElementById('redeem-error-sys');
  if (errEl) errEl.style.display = 'none';
  try {
    const result = redeemInviteCode(input ? input.value : '');
    if (result && result.ok) {
      if (input) input.value = '';
      const row = document.getElementById('redeem-row-sys');
      if (row) row.style.display = 'none';
      renderAccountPartnerRow();
    }
  } catch (e) {
    if (errEl) { errEl.textContent = e.message; errEl.style.display = 'block'; }
  }
}

/** Clears the PAIR. Nobody's journal is touched. */
function decoupleFromPartner() {
  let e; try { e = _admin(); } catch (err) { return _acctMsg(err.message, true); }
  const r = e.clearCoCreation();
  if (!_download(r.snapshot, 'eravos-before-decouple.json')) return;
  if (typeof eravosPairing !== 'undefined' && eravosPairing) eravosPairing.unpair();
  _acctMsg('Decoupled — ' + r.keysCleared.length + ' pair keys cleared. Both journals untouched.');
  renderAccountPartnerRow();
}

/** Deletes the partner ACCOUNT and their data from this device. */
function removePartnerAccount() {
  let e; try { e = _admin(); } catch (err) { return _acctMsg(err.message, true); }
  const partner = e.users().filter(u => u.role === 'partner')[0];
  if (!partner) return _acctMsg('No partner account to remove — you are already solo.');
  const typed = window.prompt(
    'This deletes ' + partner.name + "'s account and their " + partner.dataKeys +
    ' data keys from this device.\n\nAn export downloads first.\n\nType ' +
    partner.key + ' to confirm:');
  if (typed !== partner.key) return _acctMsg('Not removed — the confirmation did not match.');
  let r;
  try { r = e.removeUser(partner.key, { disposition: 'purge' }); }
  catch (err) { return _acctMsg(err.message, true); }
  if (!_download(r.snapshot, 'eravos-' + partner.key + '-final-export.json')) return;
  e.clearCoCreation();
  if (typeof eravosPairing !== 'undefined' && eravosPairing) eravosPairing.unpair();
  _acctMsg('Removed. ' + r.purged.length + ' keys deleted. You are solo.');
  renderAccountPartnerRow();
}

/** Deletes EVERYTHING on this device. Export first, always. */
async function deleteMyAccount() {
  let e; try { e = _admin(); } catch (err) { return _acctMsg(err.message, true); }
  const me = (S.user && S.user.email) || DB.get('eravors_active_user_key', null);
  if (!me) return _acctMsg('Cannot tell which account is active — refusing to delete anything.', true);
  const typed = window.prompt(
    'This deletes EVERYTHING on this device — vault, codex, feelings, ruptures, ' +
    'the lattice, all of it.\n\nA full export downloads first.\n\nType ' + me + ' to confirm:');
  if (typed !== me) return _acctMsg('Not deleted — the confirmation did not match.');

  const snapshot = e.exportAll();
  if (!_download(snapshot, 'eravos-full-export-before-delete.json')) return;
  try {
    // §0.3 — the export is already in their downloads before this line runs.
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) keys.push(localStorage.key(i));
    keys.forEach(k => { if (k.indexOf('eravors_') === 0 || k.indexOf(me + '_') === 0 ||
                            k.indexOf('shared_') === 0 || k.indexOf('eravos') === 0) localStorage.removeItem(k); });
    // Real, significant gap fixed here: this only ever cleared
    // localStorage. DB's actual primary store is IndexedDB (checked
    // directly -- indexedDB.open('Eravos', ...) in this same file);
    // localStorage is DB's own fallback/migration source, not where
    // real data actually lives once IndexedDB is available. A "delete
    // everything" that leaves the real database behind isn't a reset,
    // it just looks like one until the next reload repopulates from
    // IndexedDB. Deleting the whole database is safe here specifically
    // because the real export already downloaded above, before this
    // block runs at all.
    if (typeof indexedDB !== 'undefined' && indexedDB.deleteDatabase) {
      if (typeof DB.close === 'function') DB.close();
      await new Promise(r => setTimeout(r, 50)); // close() isn't necessarily synchronous -- MDN: waits for pending transactions
      await new Promise((resolve) => {
        const req = indexedDB.deleteDatabase('Eravos');
        req.onsuccess = () => resolve();
        req.onerror = () => { console.warn('[eravos] deleteDatabase error:', req.error); resolve(); };
        req.onblocked = () => { console.warn('[eravos] deleteDatabase BLOCKED -- a connection is still open somewhere'); resolve(); };
      });
    }
  } catch (err) { return _acctMsg('Delete failed mid-way — your export is safe: ' + err.message, true); }
  _acctMsg('Deleted. Reloading into a fresh install.');
  setTimeout(() => location.reload(), 1200);
}

if (typeof window !== 'undefined') {
  Object.assign(window, { decoupleFromPartner, removePartnerAccount, deleteMyAccount, renderAccountPartnerRow });
}

// ── PAIRING (v0.12.0) ─────────────────────────────────────────────
// was `const` -- eravos-pairing.js (which defines Pairing) loads
// AFTER this script in index.html's script order, so this construction
// permanently failed (Pairing genuinely undefined at this exact
// moment) and eravosPairing stayed null forever, even once
// eravos-pairing.js finished loading moments later. Every guarded call
// site (18 of them) correctly checked `!eravosPairing` and bailed --
// openInvitePartner()'s very first line does exactly that, which is
// why the real invite modal rendered but the QR/code inside it never
// populated. `let` + one retry below, instead of touching all 18 call
// sites.
let eravosPairing = (typeof Pairing !== 'undefined') ? new Pairing({}) : null;
if (typeof window !== 'undefined') window.eravosPairing = eravosPairing;

// Real fix for a real, found gap: config.publicOrigin was never
// actually reaching this.origin at all (the constructor above always
// runs with an empty options object). Fetches the real, currently
// configured value and applies it via the new setOrigin() -- fire-
// and-forget, since the constructor itself can't wait on this; the
// invite flow correctly falls back to window.location.origin until
// this resolves, which for a same-origin fetch is normally immediate.
if (typeof window !== 'undefined' && typeof fetch === 'function') {
  fetch('/api/config/public-origin').then(r => r.json()).then(cfg => {
    if (cfg && cfg.publicOrigin && eravosPairing) eravosPairing.setOrigin(cfg.publicOrigin);
  }).catch(() => { /* real, honest no-op -- falls back to window.location.origin, already correct behavior */ });
}

if (typeof window !== 'undefined' && !eravosPairing) {
  // DOMContentLoaded fires after every blocking <script src> tag --
  // including eravos-pairing.js, later in the load order -- has
  // already finished executing. By the time any real user interaction
  // is possible, this retry has already run. One retry, not a poll.
  window.addEventListener('DOMContentLoaded', () => {
    if (!eravosPairing && typeof Pairing !== 'undefined') {
      eravosPairing = new Pairing({});
      window.eravosPairing = eravosPairing;
      fetch('/api/config/public-origin').then(r => r.json()).then(cfg => {
        if (cfg && cfg.publicOrigin && eravosPairing) eravosPairing.setOrigin(cfg.publicOrigin);
      }).catch(() => {});
    }
  });
}

// ── PAIRING PIPELINE — the real network wiring Pairing itself never had.
// Pairing's own scan()/receiveRequest()/confirm()/decline() state machine
// was real and correct, but every one of them only ever wrote LOCAL
// state (this._save(r), checked directly -- no network call anywhere in
// eravos-pairing.js). Three real sync Gates close that gap: the
// scanning side's request actually reaches the inviter, the inviter's
// decision actually reaches back.

syncStream.register(new (class extends Gate {
  constructor() { super('pairing:request'); }
  transform(ev) {
    if (!eravosPairing) return;
    let result;
    try {
      result = eravosPairing.receiveRequest({
        code: ev.data.code, myPeerId: ev.data.myPeerId,
        myName: ev.data.myName, fp: ev.data.fp,
      });
    } catch (e) {
      console.warn('[eravos] pairing request could not be processed:', e.message);
      return;
    }
    if (!result || !result.ok) {
      console.warn('[eravos] pairing request rejected:', result && result.reason);
      return;
    }
    // AUTO-PAIR, by direct request -- no separate confirm step anymore.
    // The code itself is treated as sufficient: single-use, time-bound,
    // minted by THIS device, handed to them out of band. Requiring a
    // second explicit confirm here was inconsistent with unpair() right
    // below, which already requires no permission from either side --
    // if leaving needs no confirmation, entering shouldn't either. The
    // person is still told, just after the fact rather than as a
    // decision they have to make in the moment.
    let confirmResult;
    try {
      confirmResult = eravosPairing.confirm({ name: ev.data.myName });
    } catch (e) {
      console.warn('[eravos] auto-confirm failed:', e.message);
      return;
    }
    if (!confirmResult || !confirmResult.ok) return;
    emitSync('pairing:confirmed', { name: (S.user && S.user.name) || 'Partner', peerId: getPeerIdForUser(S.user), fp: null }, { queueOnFail: true });
    showToast('✦ Connected with ' + (ev.data.myName || 'them'));
    if (navigator.vibrate) navigator.vibrate([150, 80, 150]);
    if (typeof applyMode === 'function') applyMode('duo');
    // Durable record in the real inbox/bell -- posted already-resolved,
    // since pairing already happened by the time this runs. Reads as a
    // notice, not a request, and points straight at Decouple (the real,
    // one-click undo) in case it wasn't who they meant.
    postPartnerConnectedNotice(ev.data);
  }
})());

/** A notice, not a request -- pushed already-resolved into eravors_inbox
    (same store the bell badge, dropdown, and Messages modal all read
    from), since pairing already happened by the time this posts. Deduped
    by the invite's own code so a retried/replayed wire delivery doesn't
    spam a second notice for the same real connection. */
function postPartnerConnectedNotice(data) {
  if (!data) return;
  const refId = data.code || data.myPeerId;
  if (!refId) return;
  const id = 'partner_invite_' + refId;
  const inbox = DB.get('eravors_inbox', []);
  if (inbox.some(m => m.id === id)) return;
  inbox.unshift({
    id, subtype: 'partner_invite', type: 'partner_invite',
    from: data.myName || 'Someone',
    text: (data.myName || 'Someone') + ' connected with you as your partner, using your invite code. Not who you meant? Decouple anytime in Settings.',
    peerId: data.myPeerId || null, code: data.code || null, fp: data.fp || null,
    resolved: 'accepted',    // always -- nothing left to decide by the time this posts
    ts: Date.now(), read: false,
  });
  DB.set('eravors_inbox', inbox.slice(0, 100));
  if (typeof renderInbox === 'function') renderInbox();
  if (typeof updateInboxBadge === 'function') updateInboxBadge();
}

syncStream.register(new (class extends Gate {
  constructor() { super('pairing:confirmed'); }
  transform(ev) {
    // The requester's own side. The inviter confirmed -- their local
    // Pairing state needs to reflect 'paired' too, not just the
    // inviter's. Pairing itself has no "apply a remote confirm" method
    // (confirm() asserts a real local r.request exists, which is
    // correct for the inviter's own side but not for the requester,
    // who never had one to confirm -- theirs was already 'requested').
    // Applied directly here since there's no real ambiguity about what
    // "requested" -> hearing back "yes" means for the side that asked.
    if (!eravosPairing) return;
    const raw = eravosPairing._raw ? eravosPairing._raw() : null;
    if (raw && raw.request && !raw.request.resolved) {
      raw.partner = { name: ev.data.name || 'Partner', key: null, peerId: ev.data.peerId || null, fp: ev.data.fp || null, pairedAt: Date.now() };
      raw.request.resolved = true;
      raw.state = 'paired';
      if (eravosPairing._save) eravosPairing._save(raw); // _save() already calls _emit() internally
    }
    showToast('✦ Connected — you\'re paired now');
    if (typeof applyMode === 'function') applyMode('duo');
  }
})());

// pairing:declined stays registered (harmless, unreachable from this
// client now that redemption always auto-pairs) -- kept rather than
// removed so a request from an OLDER Eravos build on the other device
// (one that still has the decline button) doesn't silently do nothing
// on this end.
syncStream.register(new (class extends Gate {
  constructor() { super('pairing:declined'); }
  transform(ev) {
    if (!eravosPairing) return;
    const raw = eravosPairing._raw ? eravosPairing._raw() : null;
    if (raw && raw.request && !raw.request.resolved) {
      raw.request.resolved = true;
      raw.request.declined = { why: ev.data.why || null, ts: Date.now() };
      raw.state = 'solo';
      if (eravosPairing._save) eravosPairing._save(raw); // _save() already calls _emit() internally
    }
    showToast('The invite wasn\'t confirmed on their end.');
  }
})());

function myPeerId() {
  let id = DB.get('eravors_my_peer_id', null);
  if (!id) {
    id = 'eravos-' + Math.random().toString(36).slice(2,10) + Math.random().toString(36).slice(2,10);
    DB.set('eravors_my_peer_id', id);
  }
  return id;
}

/** Mint a code and render it. Text is ALWAYS shown under the QR (§1.2 --
    the optics of the encoder are unverified; nobody gets stranded). */
async function openInvitePartner() {
  if (!eravosPairing) return;
  // Real, necessary fix, not cosmetic: generating an invite while
  // staying in solo mode meant this device never connected to the
  // relay at all (initMesh() only ever fires on an explicit duo-mode
  // event) -- so even a real, correctly-delivered pairing:request from
  // the scanning side had no live socket here to arrive on. An
  // outstanding invite is a real reason to be reachable regardless of
  // the account's own solo/duo preference.
  //
  // initRTC() removed from here -- a real bug in this same fix, caught
  // later: initRTC() connects to PeerJS's external call-signaling
  // service (0.peerjs.com), which pairing has nothing to do with.
  // Only initMesh() (the self-hosted relay pairing:request/confirmed
  // actually travel over) was ever needed here.
  if (typeof initMesh === 'function') initMesh();
  // One dialog at a time. The prompt closes as this opens.
  const prompt = document.getElementById('invite-prompt');
  if (prompt) prompt.classList.remove('open');
  const modal = document.getElementById('invite-modal');
  if (modal) modal.classList.add('open');
  // ORDER (v0.29.4). This comment used to sit BELOW the mint, promising
  // something the code did not do: the fetch ran after createInvite(), so the
  // invite was minted against whatever origin happened to be set — localhost,
  // on a fresh boot. The link came out right because inviteUrl() is built
  // later, from the updated origin; the RELAY came out as ws://localhost/relay
  // because it is baked in at mint time. That is the exact split seen on
  // screen. The fetch now genuinely precedes the mint.
  try {
    const cfg = await fetch('/api/config/public-origin').then(r => r.json());
    if (cfg && cfg.publicOrigin) eravosPairing.setOrigin(cfg.publicOrigin);
  } catch (e) { /* falls through to originIsShareable(), which is the real guard */ }

  let st = eravosPairing.state();
  if (!st.invite || st.invite.expired) {
    try {
      // getPeerIdForUser() -- one real function for "my real relay
      // identity," used consistently everywhere that concept is needed.
      // inviteRelayUrl() is WHERE, alongside the peerId's WHO. It reads
      // publicOrigin, not location, because the address in a code has to be
      // the one SHE can reach, not the one this machine happens to use.
      eravosPairing.createInvite({ peerId: getPeerIdForUser(S.user), accountKey: (S.user && S.user.email) || null,
                                   pubFingerprint: (window.MESH && MESH.fingerprint) || null,
                                   relay: inviteRelayUrl() });
    } catch (e) { if (typeof showToast === 'function') showToast(e.message); return; }
    st = eravosPairing.state();
  }

  const share = eravosPairing.originIsShareable();
  const url = eravosPairing.inviteUrl();
  const qrHost = document.getElementById('invite-qr');
  if (qrHost) {
    if (typeof EravosQR !== 'undefined') {
      try { qrHost.innerHTML = EravosQR.renderSVG(url, { scale: 5 }); }
      catch (e) { qrHost.textContent = 'Could not draw the code — the link and code below still work.'; }
    } else { qrHost.textContent = 'QR unavailable — use the code below.'; }
  }
  const codeEl = document.getElementById('invite-code');
  if (codeEl) codeEl.textContent = st.invite.code;
  const linkEl = document.getElementById('invite-link');
  if (linkEl) linkEl.value = url;
  // Say it plainly, on the modal, next to the code that will not work.
  //
  // Two ways this code can be dead on arrival, and they fail differently:
  // an unreachable ORIGIN means the page never loads for her; an unreachable
  // RENDEZVOUS means the page loads perfectly, she signs up, and her request
  // goes to her own relay. The second is the more dangerous one precisely
  // because everything visible appears to work, so it gets said here too
  // rather than left to be discovered as "she never scanned it".
  const relayShare = eravosPairing.health();
  const warnEl = document.getElementById('invite-origin-warning');
  if (warnEl) {
    const problems = [];
    if (!share.ok) problems.push(share.reason + '. ' + (share.fix || ''));
    if (!relayShare.inviteRelayReachable) {
      const rc = (typeof Pairing !== 'undefined' && Pairing.relayIsShareable)
        ? Pairing.relayIsShareable(relayShare.inviteRelay) : null;
      problems.push('this code carries no reachable relay address' +
        (rc && rc.reason ? ' — ' + rc.reason : '') + '. ' + ((rc && rc.fix) || '') +
        ' They will be able to open the link and create an account, but the connection request will not reach you.');
    }
    warnEl.hidden = problems.length === 0;
    if (problems.length) warnEl.textContent = 'This link will not work for them — ' + problems.join(' Also: ');
  }

  const expEl = document.getElementById('invite-expiry');
  if (expEl) expEl.textContent = 'Expires in about ' + Math.round(st.invite.msRemaining / 3600000) + ' hours. Single use.';

  // §GAP found 2026-08-25 — same account-layer gap as doRegister()/doLogin(),
  // here for the OTHER half of it: the relay code above connects two DEVICES
  // in real time. It does not create the durable, server-side couple record
  // that makes shared data survive either device being offline or reset.
  // eravos-db's InviteCode.generate() is a SEPARATE, real, 8-digit numeric
  // code for exactly that — shown alongside the relay code, not instead of
  // it, because they do different jobs. Requires a real server session
  // (DB.get('eravos_api_token')) — if signup/login never reached the
  // server (offline, or the account layer isn't attached), this section
  // stays hidden rather than showing a code that cannot possibly redeem.
  const acctSection = document.getElementById('invite-account-section');
  const acctCodeEl = document.getElementById('invite-account-code');
  const token = DB.get('eravos_api_token', null);
  if (acctSection) {
    if (!token) {
      acctSection.hidden = true;
    } else {
      try {
        const genRes = await fetch('/api/account/invite/generate', {
          method: 'POST', headers: { 'Authorization': 'Bearer ' + token },
        });
        const genBody = await genRes.json().catch(() => ({}));
        if (genRes.ok && genBody.code) {
          acctSection.hidden = false;
          if (acctCodeEl) acctCodeEl.textContent = genBody.code;
        } else {
          acctSection.hidden = true;
          console.warn('[eravos] account invite code not generated: ' + (genBody.error || ('HTTP ' + genRes.status)));
        }
      } catch (e) {
        acctSection.hidden = true;
        console.warn('[eravos] account invite generate unreachable: ' + e.message);
      }
    }
  }
}
function closeInvitePartner() {
  const m = document.getElementById('invite-modal');
  if (m) m.classList.remove('open');
}
/** Wires the invite-modal's reciprocal "already have a code" field to
    redeemInviteCode() -- kept a thin DOM shim so redeemInviteCode()
    itself has no HTML-element knowledge and stays reusable from the
    other two surfaces (Settings > Admin, and the register screen). */
function redeemInviteFromModal() {
  const input = document.getElementById('invite-redeem-input');
  const errEl = document.getElementById('invite-redeem-error');
  if (errEl) errEl.style.display = 'none';
  const raw = (input ? input.value : '').trim();

  // §GAP found 2026-08-25 — two real, separate invite systems (see
  // showInvitePartner()'s comment for why they're not merged): the relay
  // code is dot-separated (code.peerId.fp.nonce[.relay]); eravos-db's
  // account-link code is a bare 8-digit number. Distinguishing them here
  // so pasting either one does the right real thing, instead of the
  // relay parser's generic "couldn't read that" for a code it was never
  // going to understand in the first place.
  const isAccountCode = /^\d{8}$/.test(raw);
  if (isAccountCode) {
    const token = DB.get('eravos_api_token', null);
    if (!token) {
      if (errEl) { errEl.textContent = 'You need to be logged in with a real account to redeem an account link code.'; errEl.style.display = 'block'; }
      return;
    }
    fetch('/api/account/invite/redeem', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ code: raw }),
    }).then(async r => {
      const body = await r.json().catch(() => ({}));
      if (r.ok && body.coupleId) {
        if (input) input.value = '';
        if (typeof showToast === 'function') showToast('✦ Connected — your accounts are linked.');
        closeInvitePartner();
      } else if (errEl) {
        errEl.textContent = body.error || ('HTTP ' + r.status);
        errEl.style.display = 'block';
      }
    }).catch(e => {
      if (errEl) { errEl.textContent = 'Could not reach the server: ' + e.message; errEl.style.display = 'block'; }
    });
    return;
  }

  try {
    const result = redeemInviteCode(raw);
    if (result && result.ok) {
      if (input) input.value = '';
      closeInvitePartner();
    }
  } catch (e) {
    if (errEl) { errEl.textContent = e.message; errEl.style.display = 'block'; }
  }
}
/** Real, reliable path -- unlike "Send by email" below, this has no
    dependency on a configured mail client. Copies straight to the
    clipboard so it can go out through whatever channel the two people
    already use (text, WhatsApp, anything), same convention as copyEl()
    elsewhere in the app. */
// No longer wired to the invite modal (see index.html) — "Copy code"
// was removed as a standalone action since the code alone can never
// redeem successfully (redeemInviteCode() needs the peer id + relay it
// doesn't carry). Left defined, not deleted, in case something else
// ever needs just the code string; currently has no callers.
function copyInviteCode() {
  const el = document.getElementById('invite-code');
  const text = (el && el.textContent || '').trim();
  if (!text || text === '…') { if (typeof showToast === 'function') showToast('No code yet — open Invite first'); return; }
  navigator.clipboard.writeText(text)
    .then(() => { if (typeof showToast === 'function') showToast('📋 Code copied'); })
    .catch(() => { if (typeof showToast === 'function') showToast('Could not copy — select the code and copy manually'); });
}
function copyInviteLink() {
  const el = document.getElementById('invite-link');
  const text = (el && el.value || '').trim();
  if (!text) { if (typeof showToast === 'function') showToast('No link yet — open Invite first'); return; }
  navigator.clipboard.writeText(text)
    .then(() => { if (typeof showToast === 'function') showToast('📋 Link copied'); })
    .catch(() => { if (typeof showToast === 'function') showToast('Could not copy — tap the link field and copy manually'); });
}
/** §GAP found 2026-08-25 — the sibling of copyInviteCode() above, but for
    the code that's actually safe to copy alone: eravos-db's account-link
    code IS complete on its own, unlike the relay confirmation code (see
    that function's own comment for why IT stays unwired). This is the
    one real "copy code" button this modal should have had all along. */
function copyAccountInviteCode() {
  const el = document.getElementById('invite-account-code');
  const text = (el && el.textContent || '').trim();
  if (!text || text === '…') { if (typeof showToast === 'function') showToast('No code yet — open Invite first'); return; }
  navigator.clipboard.writeText(text)
    .then(() => { if (typeof showToast === 'function') showToast('📋 Code copied — this one works pasted alone'); })
    .catch(() => { if (typeof showToast === 'function') showToast('Could not copy — select the code and copy manually'); });
}
/** "Send by email" opens the SENDER's own mail app via a bare mailto:
    link (eravosPairing.emailInvite() below) -- deliberately no server
    in between (§ always self-hosted). Real limitation, not a bug:
    mailto: depends on the device having a mail client registered to
    handle it, which a lot of phones and PWAs don't have wired up --
    when that's the case this silently does nothing, which is exactly
    why copyInviteCode()/copyInviteLink() above exist as the path that
    doesn't depend on it. */
function emailInvitePartner() {
  if (!eravosPairing) return;
  const to = (document.getElementById('invite-email') || {}).value || '';
  try {
    const e = eravosPairing.emailInvite(to, (S.user && S.user.name) || 'Someone');
    window.location.href = e.mailto;      // their own mail client, no service
  } catch (err) { if (typeof showToast === 'function') showToast(err.message); }
}
function revokeInvitePartner() {
  if (!eravosPairing) return;
  eravosPairing.revokeInvite();
  if (typeof showToast === 'function') showToast('Revoked — any code you already sent stops working now');
  closeInvitePartner();
}

/**
 * Called when a scan/invite is confirmed. THIS is where a partner account
 * comes into existence — not at seed time. Seeding a person who has not
 * arrived is the falsehood v0.12.0 removed.
 */
function acceptPartner(name, passwordHash) {
  if (!eravosPairing) return null;
  let r;
  try { r = eravosPairing.confirm({ name: name }); }
  catch (e) { if (typeof showToast === 'function') showToast(e.message); return null; }

  const key = String(name || 'partner').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 32) || 'partner';
  const users = DB.get('eravors_users', {});
  users[key] = {
    name: name, email: key,
    password: passwordHash || DB.get('eravors_pending_partner_pw', null),
    mode: 'duo', theme: '', role: 'partner',
    peerId: r.partner.peerId, partnerId: myPeerId(),
    created: Date.now(), dbPrefix: key, isAdmin: false,
  };
  for (const k2 in users) if (users[k2].role === 'admin') users[k2].partnerId = r.partner.peerId;
  DB.set('eravors_users', users);

  // PROMOTE SOLO HISTORY (v0.24.0). Additive only; never overwrites shared.
  if (typeof Persistence !== 'undefined' && S.dbPrefix) {
    try {
      const p = new Persistence({}).promote(S.dbPrefix);
      if (p.seeded && typeof showToast === 'function') {
        showToast('Brought ' + p.seeded + ' thing(s) from before into your shared view');
      }
    } catch (e) { console.error('[eravos] promote failed:', e.message); }
  }
  DB.remove && DB.remove('eravors_pending_partner_pw');
  if (typeof showToast === 'function') showToast(name + ' is in. Everything shared starts from here.');
  // The only moment these questions are live.
  setTimeout(() => { if (typeof maybeAskCoCreation === 'function') maybeAskCoCreation(); }, 900);
  return { ok: true, key: key, partner: r.partner };
}

/** Real, previously-missing counterpart to createInvite()/openInvitePartner():
    redeeming a code for an account that ALREADY EXISTS and is ALREADY
    LOGGED IN -- not just at registration time. The homepage's own
    invite-prompt copy ("If you're both already using Eravos on your own,
    connecting doesn't erase either of your histories") promised exactly
    this and nothing ever implemented it: the only redemption path was
    doRegister(), which requires creating a brand-new account, so anyone
    who'd already been using the app solo had no way to accept an invite
    without abandoning their own history. This is the real fix -- same
    scan()/emitSync('pairing:request') the registration path already
    uses, just callable from an existing session.

    "As long as they're single" (guard, not optional): eravosPairing.scan()
    itself already throws if this account's local pairing state is
    'paired' (see eravos-pairing.js) -- checked here too, first, so the
    caller gets one clear message instead of a raw thrown error. */
function redeemInviteCode(text) {
  if (!S.user) throw new Error('[eravos] not logged in');
  if (!eravosPairing) throw new Error('[eravos] pairing engine unavailable');
  const raw = String(text || '').trim();
  if (!raw) throw new Error('Paste the invite link or code first.');
  if (typeof Pairing === 'undefined' || typeof Pairing.parse !== 'function') {
    throw new Error('Invite parsing is not available right now.');
  }
  const parsed = Pairing.parse(raw);
  if (!parsed || !parsed.code || !parsed.peer) {
    if (raw.length <= 8 && raw.indexOf('.') === -1) {
      throw new Error("That's just the 8-character code — paste the full invite link (or the full dot-separated code) they sent you, so this device knows which device to connect to.");
    }
    throw new Error("Couldn't read that as an invite. Paste the full link or code exactly as it was sent.");
  }
  const st = eravosPairing.state();
  if (st && st.paired) throw new Error('Already paired with ' + (st.partner && st.partner.name || 'someone') + '. Unpair first if you meant to switch.');

  // ORDER IS THE FIX (v0.13.0). This used to call initMesh() first, which
  // connects to whatever relay THIS page derives — her own machine, once she
  // is running the desktop build. initMesh() then returns early on an open
  // socket, so applying the invite's relay afterwards changed nothing and
  // the request went to a relay with one person on it. Rendezvous first,
  // socket second.
  const relayResult = applyInviteRelay(parsed.relay);
  if (!relayResult.ok) {
    // Not fatal — a v1 code, or two devices on one origin, are both real and
    // both still work off the derived relay. Named rather than swallowed,
    // because when it IS the problem it is otherwise invisible.
    console.warn('[eravos] invite carried no usable relay (' + relayResult.reason + ') — falling back to ' + relayUrl());
  }

  // Same real fix as openInvitePartner(): an outstanding request needs a
  // live socket to actually arrive on, regardless of this account's own
  // solo/duo mode preference.
  if (typeof initMesh === 'function') initMesh();

  const myRealPeerId = getPeerIdForUser(S.user);
  const result = eravosPairing.scan(parsed, { peerId: myRealPeerId, name: S.user.name });
  if (result && result.ok) {
    emitSync('pairing:request', {
      code: parsed.code, myPeerId: myRealPeerId, myName: S.user.name,
      fp: parsed.fp || null,
    }, { queueOnFail: true });
    // The person who GENERATES an invite stays 'admin'/self; whoever
    // REDEEMS one becomes 'partner' in this couple's local data model
    // (see _myRole()/the {me:'self'|'partner'} split used throughout the
    // relational engines) -- same convention doRegister() already
    // applies for brand-new accounts, just not overwriting an existing
    // admin identity if they redeem their own or a stray code.
    if (S.user.role !== 'admin') {
      S.user.role = 'partner';
      const email = S.user.email;
      if (S.users[email]) { S.users[email].role = 'partner'; DB.set('eravors_users', S.users); }
      const roleBadge = document.getElementById('role-badge');
      if (roleBadge) roleBadge.textContent = '🖤 PARTNER';
    }
    showToast('✦ Request sent — you\'ll be connected once they confirm');
  }
  return result;
}
if (typeof window !== 'undefined') Object.assign(window, { redeemInviteCode });

async function setPendingPartnerPassword(plain) {
  if (!plain) throw new Error('[eravos] a password is required');
  const h = typeof hashPw === 'function' ? await hashPw(plain) : plain;
  DB.set('eravors_pending_partner_pw', h);
  return { ok: true, note: 'Stored as a hash. It is used the moment they accept.' };
}
if (typeof window !== 'undefined') Object.assign(window, { acceptPartner, setPendingPartnerPassword });

/** The one-time prompt. Both buttons silence it FOREVER. */
function maybePromptInvite() {
  if (!eravosPairing || !eravosPairing.shouldPromptInvite()) return;
  // §1.2 — never two dialogs at once. Onboarding owns the screen first; this
  // waits rather than stacking underneath it, which is what the first real
  // browser run showed.
  const ob = document.getElementById('onboarding-modal');
  if (ob && ob.style.display !== 'none' && ob.style.display !== '') {
    return setTimeout(maybePromptInvite, 1500);
  }
  const m = document.getElementById('invite-prompt');
  if (m) m.classList.add('open');
}
function dismissInvitePrompt(how) {
  if (eravosPairing) eravosPairing.dismissPrompt(how);
  const m = document.getElementById('invite-prompt');
  if (m) m.classList.remove('open');
  if (how === 'riding-solo' && typeof showToast === 'function') {
    showToast('Solo it is. Everything here works on your own.');
  }
}
// First run. Deferred so the shell, the config and the tabs are up first —
// a dialog that appears before the page behind it has rendered reads as a
// crash rather than a question.
if (typeof window !== 'undefined') {
  window.addEventListener('load', () => setTimeout(maybePromptInvite, 1200));
}
if (typeof window !== 'undefined') {
  Object.assign(window, { openInvitePartner, closeInvitePartner, emailInvitePartner,
                          revokeInvitePartner, maybePromptInvite, dismissInvitePrompt, myPeerId });
}

// ── PRESENCE SHELL (Phase D) ──────────────────────────────────────
// Surface on top of ChatEngine's presence transport, not a second engine
// (§0.5). Stores nothing: not the follow state, not who was where, not for
// how long. A record of one person's movement through a relational app over
// months is not something anyone consented to keep, and that it would be
// USEFUL is exactly why it is not kept.
// was `const` -- same real bug class as eravosChoice/eravosPairing/
// eravosChat: eravos-presence.js (defines PresenceShell) loads AFTER
// this script. Wrapped in a real function (not just let+reassign)
// because this constructor also takes `chat: eravosChat` as an
// argument -- if eravosChat was still null on the first attempt (the
// same real bug, fixed separately above), a bare retry would capture
// that stale null forever; calling this function fresh reads
// eravosChat's CURRENT value at retry time, live binding not a
// snapshot.
function _buildEravosPresence() {
  return (typeof PresenceShell !== 'undefined')
    ? new PresenceShell({
        chat: eravosChat,
        switchTab: (id) => { if (typeof switchTab === 'function') switchTab(id); },
        tabLabel: (id) => (typeof TAB_LABELS !== 'undefined' && TAB_LABELS[id]) || (id.charAt(0).toUpperCase() + id.slice(1)),
        partnerName: () => {
          const u = DB.get('eravors_users', {}) || {};
          for (const k in u) if (u[k].role === 'partner') return u[k].name || 'them';
          return 'them';
        },
      })
    : null;
}
let eravosPresence = _buildEravosPresence();
if (typeof window !== 'undefined') window.eravosPresence = eravosPresence;
if (typeof window !== 'undefined' && !eravosPresence) {
  window.addEventListener('DOMContentLoaded', () => {
    if (!eravosPresence) {
      eravosPresence = _buildEravosPresence();
      window.eravosPresence = eravosPresence;
    }
  });
}

syncStream.register(new (class extends Gate {
  constructor() { super('presence:follow'); }
  transform(ev) { eravosPresence && eravosPresence.theyFollow(ev.data && ev.data.on); }
})());

// The tab gate already reaches ChatEngine; presence needs the same event.
// Registering a SECOND gate on 'presence:tab' would collide (SISO Design Law
// 1 -- Stream.register throws on duplicate signature), so the shell is fed
// from ChatEngine's own listener instead of a parallel wire (§10.1).
if (eravosChat && eravosPresence) {
  eravosChat.on('tab', (tabId) => eravosPresence.theyEnteredTab(tabId));
}

function renderPresenceLine() {
  if (typeof document === 'undefined' || !eravosPresence) return;
  const el = document.getElementById('presence-line');
  if (!el) return;
  const s = eravosPresence.state();
  const parts = [];
  if (s.line) parts.push(s.line);
  if (s.followedByThem) parts.push(s.line ? '· following you' : eravosPresence.partnerName ? 'following you' : 'following you');
  el.textContent = parts.join(' ');
  el.hidden = parts.length === 0;
  const btn = document.getElementById('presence-follow');
  if (btn) {
    btn.hidden = !s.canFollow && !s.following;
    btn.textContent = s.following ? 'stop following' : 'go with them';
    btn.classList.toggle('is-following', s.following);
  }
}
if (typeof window !== 'undefined') {
  window.renderPresenceLine = renderPresenceLine;
  window.togglePresenceFollow = function () {
    if (!eravosPresence) return;
    const s = eravosPresence.state();
    const r = s.following ? eravosPresence.unfollow() : eravosPresence.follow();
    if (!r.ok && r.reason && typeof showToast === 'function') showToast(r.reason);
    else if (r.note && typeof showToast === 'function') showToast(r.note);
    renderPresenceLine();
  };
}
if (eravosPresence) eravosPresence.on(renderPresenceLine);

// ── DESKTOP BRIDGE (v0.28.0) ──────────────────────────────────────
// A `eravos://pair/…` link clicked anywhere on the machine arrives here.
// Same payload the QR carries, so Pairing.parse() already reads it — there is
// nothing new to parse (§16.5).
//
// Present only under Electron. In a browser window.eravosDesktop is
// undefined and this does nothing, which is the honest degradation: the web
// build still takes the https link.
if (typeof window !== 'undefined' && window.eravosDesktop) {
  window.eravosDesktop.onPair((payload) => {
    if (!eravosPairing) return;
    let parsed;
    try { parsed = Pairing.parse(payload); }
    catch (e) { parsed = null; }
    if (!parsed || !parsed.code || !parsed.peer) {
      // §1.2 — a malformed link says so rather than doing nothing visible.
      if (typeof showToast === 'function') showToast('That invite link could not be read.');
      return;
    }
    // Held rather than acted on. Someone who is not signed in cannot pair,
    // and silently discarding the link would mean the second click "does
    // nothing" — so it waits for registration, which is where doRegister()
    // already picks it up.
    // PARSED, not the raw string. Real bug found while wiring the rendezvous
    // through every reader: doRegister() reads _pendingInvite.code/.fp/.relay
    // as PROPERTIES (index.html's own detectPendingInvite() and
    // applyPastedInvite() both store a parsed object), so an eravos:// link
    // clicked before signing in stored a string here, every property came
    // back undefined, scan() threw "not a pairing code", and the person got
    // "Account created, but the invite could not be completed" with nothing
    // saying why. One shape for one variable.
    window._pendingInvite = parsed;
    if (!S.user) {
      if (typeof showToast === 'function') {
        showToast('Invite received. Create your account and you will be connected.');
      }
      if (typeof showRegisterForm === 'function') showRegisterForm();
      return;
    }
    try {
      // Rendezvous before socket — same ordering as redeemInviteCode() and
      // doRegister(). A deep link clicked in an already-open session is the
      // one path where a socket is guaranteed to be up already, so
      // applyInviteRelay() tearing the old one down is what makes it work.
      const relayResult = applyInviteRelay(parsed.relay);
      if (!relayResult.ok) {
        console.warn('[eravos] invite carried no usable relay (' + relayResult.reason +
                     ') — falling back to ' + relayUrl());
      }
      if (typeof initMesh === 'function') initMesh();

      const r = eravosPairing.scan(parsed, { peerId: myPeerId(), name: S.user.name });
      emitSync('pairing:request', { code: parsed.code, myPeerId: myPeerId(), myName: S.user.name,
                                    fp: parsed.fp || null }, { queueOnFail: true });
      if (typeof showToast === 'function') showToast(r.note);
    } catch (e) {
      if (typeof showToast === 'function') showToast(e.message);
    }
  });

  // Native notification when the window is not in front. The main process
  // suppresses it if you are already looking at the app.
  if (typeof eravosChat !== 'undefined' && eravosChat) {
    eravosChat.on('message', (m) => {
      if (m && !m.mine) window.eravosDesktop.notify('Eravos', m.text ? m.text.slice(0, 120) : 'A message');
    });
  }
}

// ── CO-CREATION SETTINGS + PLANNER SHARING (v0.25.0) ──────────────
const eravosCoCreation = (typeof CoCreation !== 'undefined')
  ? new CoCreation({ me: (S.user && S.user.role === 'partner') ? 'partner' : 'self' }) : null;
const eravosPlannerShare = (typeof PlannerShare !== 'undefined')
  ? new PlannerShare({
      me: (S.user && S.user.role === 'partner') ? 'partner' : 'self',
      // Sharing is refused loudly when the shared calendar is not agreed by
      // BOTH — queuing into a calendar that does not exist would look like it
      // worked and reach nobody (§1.2).
      sharedEnabled: () => !!(eravosCoCreation && eravosCoCreation.get('sharedPlanner').on),
    }) : null;
if (typeof window !== 'undefined') Object.assign(window, { eravosCoCreation, eravosPlannerShare });

// Their side of a shared setting, and their planner decisions.
if (typeof syncStream !== 'undefined') {
  syncStream.register(new (class extends Gate {
    constructor() { super('cocreation:setting'); }
    transform(ev) {
      if (!eravosCoCreation || !ev.data) return;
      const s = eravosCoCreation.applyRemote(ev.data.id, ev.data.on);
      if (s && typeof renderCoCreationSettings === 'function') renderCoCreationSettings();
      if (s && s.on && typeof showToast === 'function') {
        const d = eravosCoCreation.def(ev.data.id);
        if (d && d.scope === 'ours') showToast('You both have "' + d.label + '" on now');
      }
    }
  })());
}

/**
 * THE ONE-TIME ASK. Every shared setting in one place, at the only moment
 * these questions are live — when you pair. After that it is Settings, and
 * it does not ask again.
 */
function maybeAskCoCreation() {
  if (!eravosCoCreation || !eravosCoCreation.shouldAsk()) return;
  // Never stack dialogs. Onboarding and the invite prompt own the screen
  // first; this waits rather than appearing underneath them.
  const busy = ['onboarding-modal', 'invite-prompt', 'invite-modal']
    .some(id => { const m = document.getElementById(id);
                  return m && (m.classList.contains('open') ||
                               (m.style.display && m.style.display !== 'none')); });
  if (busy) return setTimeout(maybeAskCoCreation, 2000);
  renderCoCreationAsk();
  const m = document.getElementById('cocreation-modal');
  if (m) m.classList.add('open');
}

function renderCoCreationAsk() {
  const host = document.getElementById('cocreation-questions');
  if (!host || !eravosCoCreation) return;
  const q = eravosCoCreation.questions();
  const row = (s) =>
    '<label class="cc-row"><input type="checkbox" data-cc="' + s.id + '"' + (s.current ? ' checked' : '') + '>' +
    '<span class="cc-text"><span class="cc-label">' + s.label + '</span>' +
    '<span class="cc-why">' + s.why + '</span></span></label>';
  host.innerHTML =
    '<div class="cc-group"><div class="cc-scope">What I share</div>' +
    '<p class="cc-note">You decide these alone, and you can stop any of them alone.</p>' +
    q.mine.map(row).join('') + '</div>' +
    '<div class="cc-group"><div class="cc-scope">What we share</div>' +
    '<p class="cc-note">These need both of you. Turning one on here asks them; either of you can end it alone.</p>' +
    q.ours.map(row).join('') + '</div>';
}

function saveCoCreationAsk() {
  if (!eravosCoCreation) return;
  const answers = {};
  document.querySelectorAll('#cocreation-questions input[data-cc]')
    .forEach(el => { answers[el.dataset.cc] = el.checked; });
  const r = eravosCoCreation.complete(answers, 'answered');
  const m = document.getElementById('cocreation-modal');
  if (m) m.classList.remove('open');
  if (typeof showToast === 'function') showToast(r.note);
}
function skipCoCreationAsk() {
  if (!eravosCoCreation) return;
  const r = eravosCoCreation.skip();
  const m = document.getElementById('cocreation-modal');
  if (m) m.classList.remove('open');
  if (typeof showToast === 'function') showToast(r.note);
}
function renderCoCreationSettings() { renderCoCreationAsk(); }

if (typeof window !== 'undefined') {
  Object.assign(window, { maybeAskCoCreation, renderCoCreationAsk, saveCoCreationAsk,
                          skipCoCreationAsk, renderCoCreationSettings });
  // Asked when pairing completes — the only moment these questions are live.
  window.addEventListener('load', () => setTimeout(() => {
    if (eravosPairing && eravosPairing.state().paired) maybeAskCoCreation();
  }, 3000));
}

// ── UNMET NEEDS (v0.23.0) ─────────────────────────────────────────
// A need named once is information. A need that keeps arriving while nothing
// addresses it is accumulation — and accumulation nobody names is what
// resentment is made of. That is the signal, not the absence of one.
const eravosUnmet = (typeof UnmetNeeds !== 'undefined') ? new UnmetNeeds({}) : null;
if (typeof window !== 'undefined') window.eravosUnmet = eravosUnmet;

// Record every unmet need as it arrives, from anything carrying language.
if (typeof appStream !== 'undefined' && eravosUnmet) {
  appStream.onEmit(ev => {
    const pick = ALK_INGEST_EVENTS[ev.type];
    if (!pick) return;
    let text;
    try { text = (pick(ev) || {}).text; } catch (e) { return; }
    if (!text) return;
    const r = eravosUnmet.read(text);
    r.unmet.forEach(need => {
      try { eravosUnmet.record(need, { evidence: r.evidence[need], text, source: 'text' }); }
      catch (e) { console.error('[eravos] unmet record failed:', e.message); }
    });
  });

  // ADDRESSED is only ever recorded from an ACT. A reply is not an act, and
  // sentiment is definitely not — that is the point where guessing would be
  // easiest and would quietly erase the very signal this exists to keep.
  appStream.onEmit(ev => {
    if (ev.type === 'rupture:save' && ev.data && ev.data.need && ev.data.attempts) {
      const r = eravosUnmet.read(ev.data.need);
      r.unmet.concat(r.active).forEach(need => {
        try { eravosUnmet.addressed(need, 'repair', ev.data.id); } catch (e) {}
      });
    }
  });
}

/** What is standing. Describes what was counted; never accuses anyone. */
function renderStandingNeeds(hostId) {
  const host = document.getElementById(hostId || 'standing-needs');
  if (!host || !eravosUnmet) return;
  const s = eravosUnmet.surfacing();
  if (!s.length) {
    host.innerHTML = '<div class="ht-empty">Nothing standing. That is not a score — ' +
      'it means nothing has come up enough times, for long enough, without being addressed.</div>';
    return;
  }
  host.innerHTML = s.map(x =>
    '<div class="ht-item live"><div class="ht-item-title">' + x.says + '</div>' +
    '<div class="ht-item-body">' + x.question + '</div>' +
    (x.evidence.length ? '<div class="ht-item-body" style="opacity:.75;margin-top:6px">' +
      x.evidence.map(e => '· ' + String(e).replace(/</g,'&lt;')).join('<br>') + '</div>' : '') +
    '<div class="ht-acts">' +
      '<button class="ht-btn" onclick="markNeedAddressed(\'' + x.need + '\')">This got talked about</button>' +
      '<button class="ht-btn ghost" onclick="openHardTalkFor(\'' + x.need + '\')">Name it as a conversation</button>' +
    '</div>' +
    '<div class="ht-item-meta">' + x.count + ' since ' +
      (x.everAddressed ? 'it was last addressed' : 'it first came up') + '</div></div>').join('');
}
function markNeedAddressed(need) {
  if (!eravosUnmet) return;
  try {
    const r = eravosUnmet.addressed(need, 'conversation', null);
    if (typeof showToast === 'function') showToast(r.note);
    renderStandingNeeds();
  } catch (e) { if (typeof showToast === 'function') showToast(e.message); }
}
function openHardTalkFor(need) {
  if (typeof eravosHardTalk === 'undefined' || !eravosHardTalk) return;
  const label = need.toLowerCase().replace(/_/g, ' ');
  try {
    eravosHardTalk.add('The ' + label + ' thing', { why: 'It keeps coming up and has not been addressed.' });
    if (typeof showToast === 'function') showToast('Named it. Nothing will chase you to have it.');
    if (typeof eravosUnmet !== 'undefined') eravosUnmet.addressed(need, 'conversation', null);
    renderStandingNeeds();
  } catch (e) { if (typeof showToast === 'function') showToast(e.message); }
}
if (typeof window !== 'undefined') {
  Object.assign(window, { renderStandingNeeds, markNeedAddressed, openHardTalkFor });
}

// ── RELATIONAL PIPELINE (v0.22.0) ─────────────────────────────────
// One route for relational data whatever it came from. Consent for external
// sources is enforced HERE, in the browser, because this is where the
// consent state and the lattice live — the server only parks records and
// never stores them.
const eravosPipeline = (typeof RelationalPipeline !== 'undefined')
  ? new RelationalPipeline({
      sink(rec) {
        if (!window.ALK) return;
        window.ALK.ingest(rec.text, {
          ts: rec.ts,
          speaker: rec.speaker,
          field: rec.field || null,
        });
        window.dispatchEvent(new CustomEvent('alk:lattice-changed'));
      },
    })
  : null;
if (typeof window !== 'undefined') window.eravosPipeline = eravosPipeline;

/** Collect anything the userscript parked on the server. */
async function drainPipeline() {
  if (!eravosPipeline) return;
  let records;
  try {
    const res = await fetch('/pipeline/pending', { cache: 'no-store' });
    if (!res.ok) return;
    records = (await res.json()).records || [];
  } catch (e) { return; }
  let ok = 0, refused = 0;
  for (const r of records) {
    try { if (eravosPipeline.ingest(r).accepted) ok++; }
    catch (e) {
      // Consent refusal throws by design. Count it and tell the person ONCE
      // per drain — a per-record toast during a bulk import would be a wall.
      refused++;
    }
  }
  if (refused && typeof showToast === 'function') {
    showToast(refused + ' message' + (refused === 1 ? '' : 's') +
      ' held back — both of you need to agree in Settings before anything imports.');
  }
  if (ok && typeof showToast === 'function') showToast(ok + ' brought in');
}
if (typeof window !== 'undefined') {
  window.drainPipeline = drainPipeline;
  window.addEventListener('load', () => { setTimeout(drainPipeline, 4000); setInterval(drainPipeline, 30000); });
}

// ── EMERGENCE FIELD BRIDGE (v0.21.0) ──────────────────────────────
// Emergence is a SEPARATE PROJECT, attached rather than vendored — the same
// relationship WARP has. This polls its relational field and publishes it on
// the ALK bus so the lattice's `field` dimension can read it.
//
// §1.2 — if Emergence is not there, this does nothing and says so once. It
// does not retry forever, and it never fabricates a field. Eravos runs
// completely without it; the dimension reports silent and that is honest
// rather than broken.
const EMERGENCE_BASE = (window.EravosConfig && window.EravosConfig.emergence &&
                        window.EravosConfig.emergence.base) || '/emergence';
let _emergenceState = 'unknown';   // unknown | attached | absent

async function refreshEmergenceField() {
  if (_emergenceState === 'absent') return null;
  try {
    const res = await fetch(EMERGENCE_BASE + '/field', { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const field = await res.json();
    if (_emergenceState !== 'attached') {
      _emergenceState = 'attached';
      console.info('[eravos] Emergence attached — the field dimension is live');
    }
    if (window.ALK && window.ALK.stack && window.ALK.stack.bus) {
      window.ALK.stack.bus.emit('alk.field.state', field);
    }
    return field;
  } catch (e) {
    if (_emergenceState === 'unknown') {
      _emergenceState = 'absent';
      // Said ONCE. Not an error — a stated absence.
      console.info('[eravos] Emergence not attached (' + e.message + '). ' +
        'The field dimension abstains; everything else is unaffected.');
    }
    return null;
  }
}
function emergenceStatus() { return _emergenceState; }
if (typeof window !== 'undefined') {
  Object.assign(window, { refreshEmergenceField, emergenceStatus, EMERGENCE_BASE });
  // Once at boot, then on the events that would actually move a field.
  window.addEventListener('load', () => setTimeout(refreshEmergenceField, 2500));
  appStream.onEmit(ev => {
    if (['rupture:save', 'feeling:set', 'growth:save'].indexOf(ev.type) !== -1) {
      refreshEmergenceField();
    }
  });
}

// ── SHARED GRAMMAR ────────────────────────────────────────────────
// Phase E. Two-sided by construction: the ONLY path from `proposed` to
// `shared` is the other side calling takeUp(), and the guarantee holds over
// the wire too -- applyRemote('takeup') refuses when the sender was also the
// proposer. Nothing here infers grammar (§1.1).
//
// `me` is the stable SIDE ('self' | 'partner'), never a display name: a
// rename must not orphan authorship. That is the same failure the admin
// engine's root-cause fix was about.
// (eravosGrammar itself is declared earlier in this file now -- moved
// there because eravosSelectGrammar, below, needs it at ITS OWN
// construction time. See that block's own comment for why.)

['propose', 'takeup', 'meaning', 'retire', 'decline'].forEach(action => {
  syncStream.register(new (class extends Gate {
    constructor() { super('grammar:' + action); }
    transform(ev) {
      if (!eravosGrammar) return;
      try {
        const e = eravosGrammar.applyRemote(action, ev.data);
        if (e && typeof renderGrammarTab === 'function') renderGrammarTab();
      } catch (err) {
        // §1.2 -- an unknown or malformed grammar action is named, not swallowed.
        console.error('[eravos] grammar:' + action + ' failed:', err.message);
      }
    }
  })());
});

// ── CHOICE REGISTRY ───────────────────────────────────────────────
// Phase A foundation. Every option prompt in Eravos is declared here so that
// "Other -> in your words" is a property of the primitive, not something each
// tab has to remember to add. A closed list is a claim about what a person is
// allowed to feel; this removes that claim everywhere at once.
// was `const` -- same real bug class as the others above:
// eravos-choice.js (defines ChoiceRegistry) loads AFTER this script.
// The circular-dependency concern flagged earlier this session
// (ChoiceRegistry's own store needs global.DB, which wasn't exposed on
// window at the time) is resolved now that window.DB = DB happens
// early in this same file -- by DOMContentLoaded, both ChoiceRegistry
// (from the later script) AND window.DB (set early in this one) are
// genuinely available, so this retry can now actually succeed where
// an earlier version of this exact circular dependency could not have.
function _buildEravosChoice() {
  const choice = (typeof ChoiceRegistry !== 'undefined') ? new ChoiceRegistry() : null;
  if (choice) {
    try {
      choice.define({
        id: 'feeling', label: 'How are you?',
        options: (typeof FEELINGS !== 'undefined' ? FEELINGS : []).map(f => ({
          value: f.name, label: f.name, emoji: f.emoji, color: f.color
        })),
        otherLabel: 'Something else', otherPrompt: 'In your words',
      });
      choice.define({
        id: 'need', label: 'What do you need?', multi: true,
        options: ['Space', 'Contact', 'Reassurance', 'To be heard', 'Practical help',
                  'Quiet company', 'Time', 'To not be asked follow-up questions'],
      });
      choice.define({
        id: 'trigger.body', label: 'Where do you feel it?', multi: true,
        options: ['Chest', 'Throat', 'Stomach', 'Jaw', 'Hands', 'Shoulders', 'Nowhere I can locate'],
      });
      choice.define({
        id: 'trigger.hold', label: 'How do you want to be held through it?', multi: true,
        options: ['Stay close', 'Give me room', 'Say it out loud', 'Don\'t explain', 'Just be near'],
      });
      choice.define({
        id: 'repair', label: 'What would help repair this?', multi: true,
        options: ['Acknowledgement', 'Time apart first', 'Talk it through now', 'Physical closeness', 'A plan for next time'],
      });
    } catch (e) {
      console.error('[eravos] choice prompt definition failed:', e.message);
    }
  }
  return choice;
}
let eravosChoice = _buildEravosChoice();
if (typeof window !== 'undefined') window.eravosChoice = eravosChoice;
if (typeof window !== 'undefined' && !eravosChoice) {
  window.addEventListener('DOMContentLoaded', () => {
    if (!eravosChoice) {
      eravosChoice = _buildEravosChoice();
      window.eravosChoice = eravosChoice;
      if (eravosChoice && typeof mountChoiceFields === 'function') mountChoiceFields();
    }
  });
}
// ── PHASE G: route every self-description select through the primitive ──
// The list below is the LINT'S list (test/choice-lint.mjs SELF). A select
// classified self-description and not present here fails the build — so a
// closed list cannot quietly return to a prompt where someone is describing
// themselves. Vocabularies are seeded from the markup already in the tab, so
// nothing is restated (§16.5).
const CHOICE_SELECTS = {
  'somatic-location':  'Where do you feel it?',
  'somatic-quality':   'How does it sit?',
  'grow-cat':          'What kind of growth was this?',
  'commitment-level':  'How binding is this to you?',
  'mythos-type':       'What kind of myth?',
  'mythos-tone':       'In what register?',
  'codex-type':        'What kind of entry?',
  'planner-type':      'What kind of thing is this?',
  'mutator-style':     'In what style?',
  'music-vibe':        'What vibe?',
  'canvas-mode':       'What kind of writing is this?',
  'idea-category':     'What kind of idea?',
  'poem-form':         'What form?',
  'rel-stage':         'Where is your relationship?',
  'rel-domain':        'Which part of it?',
  'ritual-mode':       'Who is this for?',
  'ritual-duration':   'How long?',
};

// Mounted on tab render, because split tabs are injected after boot. mount()
// is idempotent, so re-running on every render costs nothing and guarantees a
// freshly-injected tab is covered.
function mountChoiceFields() {
  // was `!eravosChoice` (bare identifier) -- unsafe if this is ever
  // called before the `const eravosChoice = ...` line below has
  // executed: a let/const in its temporal dead zone throws on typeof
  // too, not just on direct reference, so there was no safe way to
  // guard the bare name early. window.eravosChoice is a plain property
  // read -- never touches the TDZ, correctly reads as undefined until
  // the real assignment at window.eravosChoice = eravosChoice below
  // has actually run, which is exactly the right readiness check.
  if (typeof window === 'undefined' || !window.eravosChoiceField || !window.eravosChoice) return null;
  const r = window.eravosChoiceField.mountAll(CHOICE_SELECTS);
  // §1.2 — a failure to mount is named, never swallowed into a closed list
  // that silently keeps working and looks fine.
  if (r.failed.length) console.error('[eravos] choice-field mount failed:', r.failed);
  return r;
}
if (typeof window !== 'undefined') {
  window.mountChoiceFields = mountChoiceFields;
  window.CHOICE_SELECTS = CHOICE_SELECTS;
}


syncStream.register(new (class extends Gate {
  constructor() { super('sync:manifest'); }
  transform(ev) { handleSyncManifest(ev.data.manifest); }
})());

syncStream.register(new (class extends Gate {
  constructor() { super('sync:request'); }
  transform(ev) { handleSyncRequest(ev.data.keys); }
})());

syncStream.register(new (class extends Gate {
  constructor() { super('sync:value'); }
  transform(ev) { handleSyncValue(ev.data.key, ev.data.value); }
})());

syncStream.register(new (class extends Gate {
  constructor() { super('love:sent'); }
  transform(ev) {
    const inbox = DB.get('eravors_love_inbox', []);
    inbox.unshift({ message: ev.data.message, from: ev.from, ts: ev.ts });
    DB.set('eravors_love_inbox', inbox.slice(0, 20));
    if (typeof renderLoveInbox === 'function') renderLoveInbox();
    if (typeof showLoveBloom === 'function') showLoveBloom(ev.data.message, ev.from);
    rtcLog('💌 Love received from ' + ev.from);
    showToast('💌 ' + (ev.from || 'Partner') + ' sent you love');
  }
})());

syncStream.register(new (class extends Gate {
  constructor() { super('ai:response'); }
  transform(ev) { showPartnerAIResponse(ev.data.text, ev.from); }
})());

syncStream.register(new (class extends Gate {
  constructor() { super('spar:shared'); }
  transform(ev) {
    showToast('⚔ ' + (ev.from || 'Partner') + ' shared their spar');
    const el = document.getElementById('partner-spar-display');
    if (el) {
      el.style.display = 'block';
      el.innerHTML = `<div class="card-title" style="font-size:.75rem">⚔ ${ev.from || 'Partner'}</div><div style="font-style:italic;line-height:1.7">${ev.data.response}</div>`;
    }
  }
})());

// feeling:set — the single convergence point for BOTH feeling-save
// paths (feeling wheel + Guided Feeling Flow). See the shadowing note
// above: this is the fix for the still-live feeling_update bug.
syncStream.register(new (class extends Gate {
  constructor() { super('feeling:set'); }
  transform(ev) {
    DB.set('eravors_partner_feeling_latest', { name: ev.data.name, emoji: ev.data.emoji, intensity: ev.data.intensity, from: ev.from, ts: ev.ts });
    if (typeof renderPartnerBox === 'function') renderPartnerBox();
    appStream.emit(new SEvent('partner:feeling_synced', { name: ev.data.name }));
  }
})());

syncStream.register(new (class extends Gate {
  constructor() { super('presence:ping'); }
  transform() { emitSync('presence:pong', {}, { queueOnFail: false }); }
})());

syncStream.register(new (class extends Gate {
  constructor() { super('presence:pong'); }
  transform(ev) { DB.set('eravors_last_pong', ev.ts); } // liveness only — was sent, never once received, before this
})());

syncStream.register(new (class extends Gate {
  constructor() { super('presence:hello'); }
  transform(ev) {
    rtcLog('✓ ' + (ev.from || 'Partner') + ' is here');
    if (ev.data && ev.data.pub) _onPartnerHelloPubkey(ev.data.pub);
    _onPartnerOnline(ev.from || 'Partner');
  }
})());

syncStream.register(new (class extends Gate {
  constructor() { super('session:start'); }
  transform(ev) { _onSessionStart({ from: ev.from }); }
})());

syncStream.register(new (class extends Gate {
  constructor() { super('session:end'); }
  transform(ev) { _onSessionEnd({ from: ev.from }); }
})());

syncStream.register(new (class extends Gate {
  constructor() { super('call:ended'); }
  transform() { if (_activeCall) endCall(true); }
})());

syncStream.register(new (class extends Gate {
  constructor() { super('call:reaction'); }
  transform(ev) { _showReactionOverlay(ev.data.emoji); }
})());

syncStream.register(new (class extends Gate {
  constructor() { super('question:new'); }
  transform(ev) {
    const loop = ev.data.loop;
    const loops = DB.get('eravors_question_loops', []);
    if (!loops.some(l => l.id === loop.id)) {
      loops.unshift(loop);
      DB.set('eravors_question_loops', loops);
      _latticeRefreshIfVisible();
    }
    if (typeof renderQuestionLoops === 'function') renderQuestionLoops();
    showToast('❓ ' + (loop.askedBy || 'Your partner') + ' asked you something');
  }
})());

syncStream.register(new (class extends Gate {
  constructor() { super('question:answer'); }
  transform(ev) {
    const answer = ev.data.answer;
    const answers = DB.get('eravors_question_answers', []);
    if (!answers.some(a => a.id === answer.id)) {
      answers.unshift(answer);
      DB.set('eravors_question_answers', answers);
    }
    if (typeof renderQuestionLoops === 'function') renderQuestionLoops();
    // Only toast if this closes a loop for THIS user too (i.e. they'd
    // already answered) — otherwise it'd read as pressure to hurry up
    // and answer, which is exactly the guilt-driven pull to avoid.
    const loop = DB.get('eravors_question_loops', []).find(l => l.id === answer.loopId);
    const myAnswer = DB.get('eravors_question_answers', []).find(a => a.loopId === answer.loopId && a.answeredBy === S.user?.name);
    if (loop && myAnswer) showToast('✨ You both answered — reveal it in Growth');
  }
})());

syncStream.register(new (class extends Gate {
  constructor() { super('feeling:expressed'); }
  transform(ev) {
    showToast('💗 ' + (ev.from || 'Partner') + ' shared a feeling: ' + (ev.data.emoji || '') + ' ' + (ev.data.feeling || ''));
    const shared = DB.get('shared_partner_feeling_expresses', []);
    shared.unshift({ ...ev.data, from: ev.from, ts: ev.ts });
    DB.set('shared_partner_feeling_expresses', shared.slice(0, 50));
  }
})());

syncStream.register(new (class extends Gate {
  constructor() { super('planner:event_proposed'); }
  transform(ev) {
    const events = DB.get('eravors_planner_events', []);
    if (!events.find(e => e.id === ev.data.event?.id)) {
      events.unshift(ev.data.event);
      DB.set('eravors_planner_events', events.slice(0, 100));
    }
    showToast('📅 ' + (ev.from || 'Partner') + ' proposed: ' + ev.data.event?.title);
    if (typeof renderPlannerEvents === 'function') renderPlannerEvents();
  }
})());

syncStream.register(new (class extends Gate {
  constructor() { super('planner:event_response'); }
  transform(ev) {
    const events = DB.get('eravors_planner_events', []);
    const found = events.find(e => e.id === ev.data.eventId);
    if (found) {
      found.status = ev.data.response;
      found.respondedAt = Date.now();
      found.declineReason = ev.data.response === 'declined' ? (ev.data.reason || null) : null;
      DB.set('eravors_planner_events', events);
    }
    const verb = ev.data.response === 'accepted' ? 'accepted' : 'declined';
    const reasonSuffix = (ev.data.response === 'declined' && ev.data.reason) ? (': "' + ev.data.reason.slice(0, 60) + '"') : '';
    showToast('📅 ' + (ev.from || 'Partner') + ' ' + verb + ' your event' + reasonSuffix);
    if (typeof renderPlannerEvents === 'function') renderPlannerEvents();
  }
})());

syncStream.register(new (class extends Gate {
  constructor() { super('planner:event_outcome'); }
  transform(ev) {
    const events = DB.get('eravors_planner_events', []);
    const found = events.find(e => e.id === ev.data.eventId);
    if (found) { found.outcome = ev.data.outcome; DB.set('eravors_planner_events', events); }
    if (typeof renderPlannerEvents === 'function') renderPlannerEvents();
    showToast('📅 ' + (ev.from || 'Partner') + ' logged the outcome for "' + (found?.title || 'an event') + '"');
  }
})());

// ═══════════════════════════════════════════════════════════════════
// COMMITMENTS & PROMISES — Phase 3 (03-FEATURE-SPECS.md §Commitments,
// 02-DATA-SCHEMAS.md `Commitment`). Ownership (c) joint-log, same
// shape as PlannerEvent — both partners write directly to one shared
// list. Cross-cutting/kernel-resident: the storage update has to land
// regardless of which tab is open, same reasoning as Planner events —
// the future Relational Health derived view (next in this phase) will
// read shared_commitments from whatever tab it lives in, so this data
// has to be correct at all times, not just while Commitments happens
// to be mounted.
// ═══════════════════════════════════════════════════════════════════

function _commitments() { return DB.get('shared_commitments', []); }
function _commitmentsSet(list) { DB.set('shared_commitments', list); }

syncStream.register(new (class extends Gate {
  constructor() { super('commitment:created'); }
  transform(ev) {
    const c = ev.data.commitment;
    if (!c || !c.id) return;
    const list = _commitments();
    if (list.some(x => x.id === c.id)) return; // already have it (e.g. our own optimistic local write)
    list.unshift(c);
    _commitmentsSet(list);
    if (typeof renderCommitments === 'function') renderCommitments();
    showToast('🤝 ' + (ev.from || 'Partner') + ' made a commitment: "' + (c.text || '').slice(0, 60) + '"');
    _latticeRefreshIfVisible();
  }
})());

syncStream.register(new (class extends Gate {
  constructor() { super('commitment:status_changed'); }
  transform(ev) {
    const list = _commitments();
    const c = list.find(x => x.id === ev.data.id);
    if (!c) return; // residue-safe: don't have this commitment locally, ignore rather than guess
    c.status = ev.data.status;
    c.status_history = ev.data.status_history; // full history travels each time — simpler than trying to merge partial diffs, and it's small
    c.reflection = ev.data.reflection != null ? ev.data.reflection : c.reflection;
    _commitmentsSet(list);
    if (typeof renderCommitments === 'function') renderCommitments();
    if (typeof renderRelationalHealthField === 'function') renderRelationalHealthField();
    showToast('🤝 ' + (ev.from || 'Partner') + ' marked "' + (c.text || '').slice(0, 40) + '" as ' + ev.data.status);
    _latticeRefreshIfVisible();
  }
})());

syncStream.register(new (class extends Gate {
  constructor() { super('meaning:added'); }
  transform(ev) {
    const entry = ev.data.entry;
    if (!entry || !entry.id) return;
    const list = _meaningArchive();
    if (list.some(e => e.id === entry.id)) return;
    list.unshift(entry);
    _meaningArchiveSet(list);
    if (typeof renderMeaningArchive === 'function') renderMeaningArchive();
  }
})());

syncStream.register(new (class extends Gate {
  constructor() { super('struggles:checklist_shared'); }
  transform(ev) {
    DB.set('eravors_partner_struggles_checklist', ev.data.selected || []);
    if (typeof renderStruggles === 'function') renderStruggles();
    showToast('💗 ' + (ev.from || 'Partner') + ' shared what they\'re working through — check Struggles');
    _latticeRefreshIfVisible();
  }
})());

syncStream.register(new (class extends Gate {
  constructor() { super('struggles:checklist_unshared'); }
  transform(ev) {
    DB.set('eravors_partner_struggles_checklist', []);
    if (typeof renderStruggles === 'function') renderStruggles();
    _latticeRefreshIfVisible();
  }
})());

syncStream.register(new (class extends Gate {
  constructor() { super('struggles:story_shared'); }
  transform(ev) {
    DB.set('eravors_partner_struggles_story', ev.data.story || null);
    if (typeof renderStruggles === 'function') renderStruggles();
    showToast('💗 ' + (ev.from || 'Partner') + ' shared their story with you');
    _latticeRefreshIfVisible();
  }
})());

syncStream.register(new (class extends Gate {
  constructor() { super('struggles:story_unshared'); }
  transform(ev) {
    DB.set('eravors_partner_struggles_story', null);
    if (typeof renderStruggles === 'function') renderStruggles();
    _latticeRefreshIfVisible();
  }
})());

syncStream.register(new (class extends Gate {
  constructor() { super('presence:availability'); }
  transform(ev) { if (ev.data.available) showToast('✅ ' + (ev.from || 'Partner') + ' is available'); }
})());

syncStream.register(new (class extends Gate {
  constructor() { super('mode:duo_requested'); }
  transform(ev) {
    showActionToast(`💫 ${ev.from || 'Partner'} wants to switch to Co-Creation together — a shared space for both of you`, {
      acceptLabel: '💫 Yes, together',
      timeoutMs: 30000,
      onAccept: () => {
        emitSync('mode:duo_accepted', {}, { queueOnFail: false });
        applyMode('duo');
      },
      onTimeout: () => {
        emitSync('mode:duo_declined', {}, { queueOnFail: false });
      },
    });
  }
})());

syncStream.register(new (class extends Gate {
  constructor() { super('mode:duo_accepted'); }
  transform(ev) {
    applyMode('duo');
    showToast('💫 ' + (ev.from || 'Partner') + ' agreed — Co-Creation active for both of you');
  }
})());

syncStream.register(new (class extends Gate {
  constructor() { super('mode:duo_declined'); }
  transform(ev) {
    showToast((ev.from || 'Partner') + ' didn\'t switch to Co-Creation — staying solo for now');
  }
})());

// message:sent — the single convergence point for every former
// dynamic `'msg_' + subtype` type (msg_love, msg_poem, msg_text,
// msg_feeling, msg_need, ...) plus the never-reachable `'message'` /
// `msgType:'one_way'` branch (dead: nothing ever sent that shape —
// the real one-way path always sent `msg_text`/etc, so `msg.msgType`
// was never actually `'one_way'` on arrival; one-way-ness is carried
// correctly below via `ev.data.subtype === 'one_way'` instead).
syncStream.register(new (class extends Gate {
  constructor() { super('message:sent'); }
  transform(ev) {
    const msg = { ...ev.data, from: ev.from, ts: ev.ts, id: ev.data.id || ev.uuid };
    if (msg.subtype === 'love' && msg.text && msg.text.length > 80) {
      showLoveLetterDisplay(msg.text, ev.from);
      DB.set('eravors_last_one_way_received', Date.now());
      _offerMeaningArchiveDelayed('love_note', 'sent_love_note', msg.id, msg.text);
      return;
    }
    if (msg.subtype === 'one_way') {
      DB.set('eravors_last_one_way_received', Date.now());
      showToast('💌 One-way message arrived — 10 min to just receive it');
    }
    receiveMessage(msg);
    if (msg.subtype === 'need' && typeof renderPartnerBox === 'function') renderPartnerBox();
  }
})());

syncStream.register(new (class extends Gate {
  constructor() { super('message:ack'); }
  transform(ev) { showToast('💗 ' + (ev.from || 'Partner') + ' acknowledged your message'); }
})());

syncStream.register(new (class extends Gate {
  constructor() { super('poke:sent'); }
  transform(ev) { receivePoke({ ...ev.data, from: ev.from, ts: ev.ts }); }
})());

syncStream.register(new (class extends Gate {
  constructor() { super('presence:need_signal'); }
  transform(ev) {
    // Was: targeted #partner-need-signal-display, which was never
    // actually defined anywhere in any markup (found while building the
    // Partner Box) — the signal has been landing nowhere visible since
    // this gate was written. Now it has a real home.
    DB.set('eravors_partner_signal_latest', { signal: ev.data.signal || null, from: ev.from, ts: ev.ts });
    if (typeof renderPartnerBox === 'function') renderPartnerBox();
    if (ev.data.signal) showToast('🫀 ' + (ev.from || 'Partner') + ': "' + ev.data.signal + '"');
  }
})());

syncStream.register(new (class extends Gate {
  constructor() { super('safety:requested'); }
  transform(ev) {
    const reqs = DB.get('eravors_safety_requests', []);
    reqs.unshift({ ...ev.data, from: ev.from, ts: ev.ts || Date.now() });
    DB.set('eravors_safety_requests', reqs.slice(0, 20));
    renderSafetyRequests();
    showToast('💬 ' + (ev.from || 'Partner') + ' sent a safety request');
  }
})());

// ═══════════════════════════════════════════════════════════════════
// PHASE 1 — SESSION LIFECYCLE
// ═══════════════════════════════════════════════════════════════════

const SESSION = {
  id:        null,
  active:    false,
  mode:      null,       // 'solo' | 'duo'
  startedAt: null,
  lastSync:  null,
  _autosaveTimer: null,
  _autoResumeKey: 'eravors_last_session',
};

// ── Partner online popup ───────────────────────────────────────────
function _onPartnerOnline(name) {
  // If already in duo session, just toast
  if (SESSION.active && SESSION.mode === 'duo') {
    showToast('✓ ' + name + ' is here');
    return;
  }
  // Quiet, no-pressure ask — but not more than once a day after a
  // decline. "Stay Solo" means stay solo, not "ask me again in 12
  // seconds every time you reconnect."
  const lastDeclined = DB.get('eravors_duo_ask_declined_at', 0);
  const today = new Date().toDateString();
  if (lastDeclined && new Date(lastDeclined).toDateString() === today) return;
  _showPartnerOnlinePopup(name);
}

function _declineDuoAsk(popupId) {
  DB.set('eravors_duo_ask_declined_at', Date.now());
  const el = document.getElementById(popupId);
  if (el) el.remove();
}

function _showPartnerOnlinePopup(name) {
  // Remove any existing popup
  const old = document.getElementById('partner-online-popup');
  if (old) old.remove();

  const popup = document.createElement('div');
  popup.id = 'partner-online-popup'; popup.classList.add('ambient-popup');
  popup.innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
      <span style="font-size:1.2rem">💫</span>
      <div>
        <div style="font-family:var(--fd);font-size:.9rem;color:var(--amber)">${name} is around, if you want</div>
        <div class="small" style="color:var(--dim);margin-top:2px">No pressure either way.</div>
      </div>
    </div>
    <div style="display:flex;gap:8px">
      <button class="btn g" style="flex:1;font-size:.78rem" onclick="_declineDuoAsk('partner-online-popup')">Stay Solo</button>
      <button class="btn p" style="flex:1;font-size:.78rem" onclick="startDuoSession();document.getElementById('partner-online-popup').remove()">💫 Start Session</button>
    </div>`;
  popup.style.cssText = `
    position:fixed;bottom:${_ambientPopupBottom()}px;right:20px;z-index:9400;
    background:linear-gradient(160deg,rgba(22,11,18,.97),rgba(10,5,8,.99));
    border:1px solid rgba(255,106,0,.25);border-radius:16px;
    padding:16px 18px;width:min(300px,90vw);
    box-shadow:0 8px 32px rgba(0,0,0,.5);
    animation:slideInRight .35s cubic-bezier(.34,1.56,.64,1);`;
  document.body.appendChild(popup);

  // Auto-dismiss after 12 seconds — dismissing this way is not a
  // decline (person may just not have been looking at the screen), so
  // it does NOT set eravors_duo_ask_declined_at. Only an explicit "Stay
  // Solo" tap counts as a decline for the once-a-day throttle.
  setTimeout(() => { if (popup.parentNode) popup.remove(); }, 12000);
}

// ── Session start / end ────────────────────────────────────────────
function startDuoSession() {
  if (SESSION.active && SESSION.mode === 'duo') return;

  SESSION.id        = 'sess-' + Date.now();
  SESSION.active    = true;
  SESSION.mode      = 'duo';
  SESSION.startedAt = Date.now();
  SESSION.lastSync  = Date.now();

  // Switch to duo mode
  applyMode('duo');

  // Notify partner
  emitSync('session:start', { sessionId: SESSION.id }, { queueOnFail: false });

  // Save for resume
  DB.set(SESSION._autoResumeKey, { id: SESSION.id, startedAt: SESSION.startedAt, mode: 'duo' });

  // Start autosave
  _startSessionAutosave();

  showToast('💫 Co-Creation session started');
  log('Session started: ' + SESSION.id, 'ok');
}

function startSoloSession() {
  SESSION.id        = 'solo-' + Date.now();
  SESSION.active    = true;
  SESSION.mode      = 'solo';
  SESSION.startedAt = Date.now();
  SESSION.lastSync  = Date.now();
  _startSessionAutosave();
  log('Solo session: ' + SESSION.id, 'info');
}

function endSession(silent) {
  if (!SESSION.active) return;
  const summary = _buildSessionSummary();
  emitSync('session:end', { sessionId: SESSION.id }, { queueOnFail: false });
  _stopSessionAutosave();
  _saveSessionRecord(summary);
  SESSION.active = false;
  SESSION.id     = null;
  DB.set(SESSION._autoResumeKey, null);
  if (!silent) {
    showToast('✓ Session saved');
    _offerSessionExport(summary);
  }
  log('Session ended', 'ok');
}

function _onSessionStart(msg) {
  showToast('💫 ' + (msg.from||'Partner') + ' started a session — join?');
  // Show same popup for the receiving side
  const popup = document.getElementById('partner-online-popup');
  if (!popup) _showPartnerOnlinePopup(msg.from || 'Partner');
}

function _onSessionEnd(msg) {
  showToast((msg.from||'Partner') + ' ended the session');
  if (SESSION.active && SESSION.mode === 'duo') {
    _stopSessionAutosave();
    SESSION.active = false;
    applyMode('solo');
  }
}

// ── Auto-resume ────────────────────────────────────────────────────
function _checkSessionResume() {
  const last = DB.get(SESSION._autoResumeKey, null);
  if (!last) return;
  const elapsed = Date.now() - last.startedAt;
  const RESUME_WINDOW_MS = 30 * 60 * 1000; // 30 minutes
  if (elapsed < RESUME_WINDOW_MS) {
    // Offer resume
    setTimeout(() => {
      const popup = document.createElement('div');
      popup.innerHTML = `
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
          <span style="font-size:1.2rem">🔄</span>
          <div>
            <div style="font-family:var(--fd);font-size:.9rem;color:var(--amber)">Resume session?</div>
            <div class="small" style="color:var(--dim);margin-top:2px">Your last session was ${Math.round(elapsed/60000)}m ago</div>
          </div>
        </div>
        <div style="display:flex;gap:8px">
          <button class="btn p" style="flex:1;font-size:.78rem" onclick="startDuoSession();this.closest('[id]').remove()">↩ Resume</button>
          <button class="btn g" style="font-size:.78rem" onclick="DB.set('${SESSION._autoResumeKey}',null);this.closest('[id]').remove()">New Session</button>
        </div>`;
      popup.id = 'session-resume-popup'; popup.classList.add('ambient-popup');
      popup.style.cssText = `position:fixed;bottom:${_ambientPopupBottom()}px;right:20px;z-index:9400;background:linear-gradient(160deg,rgba(22,11,18,.97),rgba(10,5,8,.99));border:1px solid rgba(255,106,0,.25);border-radius:16px;padding:16px 18px;width:min(300px,90vw);box-shadow:0 8px 32px rgba(0,0,0,.5);animation:slideInRight .35s cubic-bezier(.34,1.56,.64,1)`;
      document.body.appendChild(popup);
      setTimeout(() => { if (popup.parentNode) popup.remove(); }, 15000);
    }, 2500);
  } else {
    // Too old — clear
    DB.set(SESSION._autoResumeKey, null);
  }
}

// ── Daily feelings check-in — real global popup, once a day ─────────
// Used to be a card embedded inside the Struggles tab, so "once a day"
// only meant anything if you happened to open that tab — most days it
// just sat there unseen while Feelings itself stayed open to unlimited
// manual entries with no daily rhythm at all. One mechanism now: fires
// once per calendar day on boot, regardless of which tab is open,
// same trigger point as the session-resume popup above. Disableable;
// dismissing via "I don't want to talk about it" counts as handled for
// today, same as answering — no re-asking, no forcing (§ non-negotiable
// "nothing is forced").
function _todayStr() { return new Date().toDateString(); }

/** Real, direct fix for a confirmed bug: partner-online-popup,
    session-resume-popup, daily-checkin-popup,
    daily-checkin-express-popup, and spar-reflection-popup all
    independently hardcoded the identical position:fixed;bottom:80px;
    right:20px -- if more than one was ever on screen at once (real,
    seen directly: partner-online + daily-checkin together), they sat
    exactly on top of each other, and none of them left room for the
    partner FAB (bottom:28px, its own ~50px tall) sitting in the same
    corner. This computes a real, current stack offset from whatever
    ambient popups already exist, so a new one always lands above both
    the FAB and any popup already showing, never on top of either. */
function _ambientPopupBottom() {
  const FAB_CLEARANCE = 90; // bottom:28px + ~50px height + a real gap, not guessed
  const GAP = 12;
  const existing = Array.from(document.querySelectorAll('.ambient-popup'));
  let stacked = FAB_CLEARANCE;
  for (const el of existing) stacked += el.offsetHeight + GAP;
  return stacked;
}

// ═══════════════════════════════════════════════════════════════════
// EMERGENCE RELATIONAL ANALYSIS — direct request: "wire it to eravos
// and the relational field." Real capability confirmed to already
// exist server-side (emergence/loop.js's tick(), proxied at
// POST /api/emergence/tick, both already real and working before this
// pass) but never called from anywhere in this app until now.
//
// Standing constraint this whole app is already built on — "reflects,
// never predicts" — governs everything below: a detected signal is
// offered as a real, dismissible suggestion, never a silently
// auto-created rupture/need/feeling entry. Gated behind the real
// 'emergence' feature (shared/eravos-features.js), off by default,
// sensitive, requires pairing — same consent discipline as every other
// sensitive feature this session (Desires, Triggers, Commitments).
// ═══════════════════════════════════════════════════════════════════

let _lastEmergenceTick = null;      // most recent real tick, read by computeRelationalHealth() below
let _emergenceTickInFlight = false; // real, simple rate-limit -- never queue ticks faster than they resolve
let _lastRuptureSuggestAt = 0;      // real cooldown so one tense exchange doesn't produce a suggestion per message

const EMERGENCE_TICK_TEXT_MAX = 2000;       // real, stated bound -- matches this app's own MAX_TEXT-style caps elsewhere
const EMERGENCE_RUPTURE_SUGGEST_THRESHOLD = 0.55; // real, chosen value -- rupture_severity is 0-1; a live test against a genuinely tense real sentence returned 0.135, so this sits meaningfully above ordinary friction, not triggered by every mildly negative message
const EMERGENCE_RUPTURE_SUGGEST_COOLDOWN_MS = 20 * 60 * 1000; // 20 real minutes -- long enough that a single hard conversation doesn't produce a suggestion for every message in it

/** Real, direct call to the real, already-working server endpoint.
    Silent on failure (§1.2 -- logged, not thrown at the person; a
    background analysis failing should never interrupt a conversation). */
async function _tickEmergence(text) {
  if (!text || !text.trim()) return;
  if (!window.eravosFeatures || !eravosFeatures.enabled('emergence')) return;
  if (_emergenceTickInFlight) return;
  _emergenceTickInFlight = true;
  try {
    const res = await fetch('/api/emergence/tick', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: text.slice(0, EMERGENCE_TICK_TEXT_MAX) }),
    });
    if (!res.ok) { console.warn('[emergence] tick returned HTTP ' + res.status); return; }
    const result = await res.json();
    _lastEmergenceTick = { ...result, ts: Date.now() };
    if (typeof renderRelationalHealthField === 'function') renderRelationalHealthField();
    _maybeSuggestFromEmergenceTick(result);
  } catch (e) {
    console.warn('[emergence] tick failed: ' + e.message);
  } finally {
    _emergenceTickInFlight = false;
  }
}

/** Real suggestion, never an auto-created entry -- the "reflects, never
    predicts" rule applied directly. Rate-limited so this can't spam a
    hard conversation with a popup per message. */
function _maybeSuggestFromEmergenceTick(result) {
  const obs = result && result.observation;
  if (!obs) return;
  const severity = obs.rupture_severity || 0;
  if (!obs.rupture_active && severity < EMERGENCE_RUPTURE_SUGGEST_THRESHOLD) return;
  if (Date.now() - _lastRuptureSuggestAt < EMERGENCE_RUPTURE_SUGGEST_COOLDOWN_MS) return;
  _lastRuptureSuggestAt = Date.now();

  const popup = document.createElement('div');
  popup.id = 'emergence-rupture-suggest-popup';
  popup.classList.add('ambient-popup');
  popup.style.cssText = `position:fixed;bottom:${_ambientPopupBottom()}px;right:20px;z-index:9400;background:linear-gradient(160deg,rgba(22,11,18,.97),rgba(10,5,8,.99));border:1px solid var(--line-rose);border-radius:16px;padding:16px 18px;width:min(300px,90vw);box-shadow:0 8px 32px rgba(0,0,0,.5);animation:slideInRight .35s cubic-bezier(.34,1.56,.64,1)`;
  popup.innerHTML = `
    <div style="font-family:var(--fd);font-size:.85rem;color:var(--rose);margin-bottom:6px">This conversation sounds tense</div>
    <div class="small" style="color:var(--dim);margin-bottom:12px;line-height:1.6">Not a diagnosis — just a real pattern noticed in what was actually said. Want to log what's happening?</div>
    <div class="flex gap8">
      <button class="btn p" style="font-size:.75rem" onclick="this.closest('.ambient-popup').remove();(async()=>{await eravosStampTab('rupture');switchTab('rupture');})()">Log it</button>
      <button class="btn g" style="font-size:.75rem" onclick="this.closest('.ambient-popup').remove()">Not now</button>
    </div>`;
  document.body.appendChild(popup);
  setTimeout(() => { if (popup.parentNode) popup.remove(); }, 30000);
}

// Real, direct wire-in -- fires on every real message, sent or
// received, both sides' text genuinely relevant to relational
// analysis. eravosChat.on() already safely catches a throwing
// listener (confirmed directly in shared/eravos-chat.js's own
// _emit()), so a tick failure here can never break message sending.
if (typeof eravosChat !== 'undefined' && eravosChat && typeof eravosChat.on === 'function') {
  eravosChat.on('message', (msg) => { if (msg && msg.text) _tickEmergence(msg.text); });
}

function _checkDailyFeelingsCheckin() {
  const enabled = DB.get(_userKey('daily_feelings_checkin_enabled'), true);
  const lastHandled = DB.get(_userKey('daily_feelings_checkin_last_handled'), null);
  if (!enabled || lastHandled === _todayStr()) return;
  setTimeout(_showDailyFeelingsCheckinPopup, 1800);
}

function _showDailyFeelingsCheckinPopup() {
  if (document.getElementById('daily-checkin-popup')) return; // already up
  const popup = document.createElement('div');
  popup.id = 'daily-checkin-popup'; popup.classList.add('ambient-popup');
  popup.innerHTML = `
    <div style="font-family:var(--fd);font-size:.9rem;color:var(--amber);margin-bottom:4px">🌤 How are you doing today?</div>
    <div class="small" style="color:var(--dim);margin-bottom:12px">Once a day, just checking in.</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px">
      <button class="btn" style="font-size:.78rem" onclick="_answerDailyFeelingsCheckin('fantastic')">✨ Fantastic</button>
      <button class="btn" style="font-size:.78rem" onclick="_answerDailyFeelingsCheckin('good')">🙂 Good</button>
      <button class="btn" style="font-size:.78rem" onclick="_answerDailyFeelingsCheckin('meh')">😐 Meh</button>
      <button class="btn" style="font-size:.78rem" onclick="_answerDailyFeelingsCheckin('not_good')">😔 Not good</button>
      <button class="btn" style="font-size:.78rem" onclick="_answerDailyFeelingsCheckin('horrible')">😞 Horrible</button>
    </div>
    <button class="btn g" style="font-size:.72rem" onclick="_answerDailyFeelingsCheckin('dont_want_to_talk')">I don't want to talk about it</button>`;
  popup.style.cssText = `position:fixed;bottom:${_ambientPopupBottom()}px;right:20px;z-index:9400;background:linear-gradient(160deg,rgba(22,11,18,.97),rgba(10,5,8,.99));border:1px solid rgba(255,106,0,.25);border-radius:16px;padding:16px 18px;width:min(320px,90vw);box-shadow:0 8px 32px rgba(0,0,0,.5);animation:slideInRight .35s cubic-bezier(.34,1.56,.64,1)`;
  document.body.appendChild(popup);
}

function _answerDailyFeelingsCheckin(mood) {
  DB.set(_userKey('daily_feelings_checkin_last_handled'), _todayStr());
  const popup = document.getElementById('daily-checkin-popup');
  if (mood === 'dont_want_to_talk') {
    if (popup) popup.remove();
    showToast('Okay. No more asking today.');
    return;
  }
  const moodData = STRUGGLES_CHECKIN_MOODS[mood];
  if (!moodData) return;
  // Reuses FeelingEvent's own shape/storage — entered through a
  // different door, not a parallel schema for the same kind of data.
  S.feelingHistory = S.feelingHistory || [];
  S.feelingHistory.unshift({ ...moodData, note: 'Daily check-in', ts: Date.now() });
  const saved = DB.set('eravors_feeling_history', S.feelingHistory);
  if (!saved) {
    S.feelingHistory.shift();
    showToast('⚠ Could not save — storage may be full.');
    if (popup) popup.remove();
    return;
  }
  if (typeof renderFeelingHistory === 'function') renderFeelingHistory();
  _latticeRefreshIfVisible();
  if (popup) popup.remove();
  _offerDailyCheckinExpress(moodData);
}

function _offerDailyCheckinExpress(moodData) {
  const popup = document.createElement('div');
  popup.id = 'daily-checkin-express-popup'; popup.classList.add('ambient-popup');
  popup.dataset.mood = JSON.stringify(moodData);
  popup.innerHTML = `
    <div style="font-family:var(--fd);font-size:.82rem;color:var(--amber);margin-bottom:10px">Want to let your partner know?</div>
    <div style="display:flex;gap:8px">
      <button class="btn p" style="font-size:.78rem;flex:1" onclick="_shareDailyCheckinWithPartner()">💗 Yes, let them know</button>
      <button class="btn g" style="font-size:.78rem" onclick="document.getElementById('daily-checkin-express-popup').remove()">Keep this private</button>
    </div>`;
  popup.style.cssText = `position:fixed;bottom:${_ambientPopupBottom()}px;right:20px;z-index:9400;background:linear-gradient(160deg,rgba(22,11,18,.97),rgba(10,5,8,.99));border:1px solid rgba(255,106,0,.25);border-radius:16px;padding:16px 18px;width:min(320px,90vw);box-shadow:0 8px 32px rgba(0,0,0,.5);animation:slideInRight .35s cubic-bezier(.34,1.56,.64,1)`;
  document.body.appendChild(popup);
}

function _shareDailyCheckinWithPartner() {
  const el = document.getElementById('daily-checkin-express-popup');
  const moodData = el ? JSON.parse(el.dataset.mood || '{}') : null;
  if (moodData) emitSync('feeling:set', moodData);
  if (el) el.remove();
  showToast('💗 Let them know');
}



function _startSessionAutosave() {
  _stopSessionAutosave();
  SESSION._autosaveTimer = setInterval(() => {
    const summary = _buildSessionSummary();
    DB.set('eravors_session_autosave', summary);
    SESSION.lastSync = Date.now();
    showToast('✦ Session auto-saved', 1800);
    log('Session autosaved', 'info');
  }, SESSION_AUTOSAVE_MS);
}

function _stopSessionAutosave() {
  if (SESSION._autosaveTimer) {
    clearInterval(SESSION._autosaveTimer);
    SESSION._autosaveTimer = null;
  }
}

// ── Session summary builder ────────────────────────────────────────
function _buildSessionSummary() {
  return {
    sessionId:   SESSION.id,
    mode:        SESSION.mode,
    startedAt:   SESSION.startedAt,
    endedAt:     Date.now(),
    durationMs:  SESSION.startedAt ? Date.now() - SESSION.startedAt : 0,
    user:        S.user?.name || '?',
    feeling:     S.feeling,
    sparCount:   DB.get('eravors_spar_history', []).length,
    savedAt:     Date.now(),
  };
}

function _saveSessionRecord(summary) {
  const log = DB.get('eravors_session_log', []);
  log.unshift(summary);
  DB.set('eravors_session_log', log.slice(0, 50));
}

// ── Session export ─────────────────────────────────────────────────
function _offerSessionExport(summary) {
  const exportData = {
    ...summary,
    feeling_history: DB.get('eravors_feeling_history', []).slice(0, 20),
    spar_log:        DB.get('eravors_spar_history', []).slice(0, 10),
    growth_log:      DB.get('eravors_growth', []).slice(0, 10),
  };
  const blob = new Blob([JSON.stringify(exportData, null, 2)], {type:'application/json'});
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = `eravos-session-${new Date().toISOString().slice(0,10)}.json`;
  // Offer via toast with download action
  showToast('💾 Session saved — tap to export', 5000, () => a.click());
}

// ═══════════════════════════════════════════════════════════════════
// GUIDED FEELING FLOW (GFF) — 5-step branching modal
// ═══════════════════════════════════════════════════════════════════

const GFF = {
  step: 0,
  data: { feeling: null, intensity: 5, body: null, need: null, path: null, note: '' },
};

function openFeelingModal() {
  GFF.step = 0;
  GFF.data = { feeling: null, intensity: 5, body: null, need: null, path: null, note: '' };
  renderFeelingSectors();
  document.querySelectorAll('.gff-pane').forEach((p,i) => p.style.display = i===0?'':'none');
  _gffUpdateSteps(0);
  document.getElementById('feeling-modal').classList.add('open');

  // Sync intensity label
  const inp = document.getElementById('feeling-intensity');
  if (inp) {
    inp.value = 5;
    inp.oninput = () => {
      GFF.data.intensity = parseInt(inp.value);
      const lbl = document.getElementById('gff-intensity-label');
      if (lbl) lbl.textContent = inp.value;
    };
  }
}

function closeFeelingModal() {
  document.getElementById('feeling-modal').classList.remove('open');
}

function _gffUpdateSteps(active) {
  document.querySelectorAll('.gff-step').forEach((el, i) => {
    el.classList.toggle('active', i === active);
    el.classList.toggle('done',   i < active);
  });
  const titles = ['💗 How are you feeling?', '🫀 Where do you feel it?', '🌱 What do you need?', '💭 What feels right?', '✦ Almost done'];
  const titleEl = document.getElementById('gff-title');
  if (titleEl) titleEl.textContent = titles[active] || '💗 Feeling';
}

function gffNext(from) {
  // Collect data from current step
  if (from === 0) {
    GFF.data.intensity = parseInt(document.getElementById('feeling-intensity')?.value || 5);
  }
  const to = from + 1;
  document.getElementById('gff-pane-' + from).style.display = 'none';
  document.getElementById('gff-pane-' + to).style.display = '';
  _gffUpdateSteps(to);
  GFF.step = to;
}

function gffBack(from) {
  const to = from - 1;
  document.getElementById('gff-pane-' + from).style.display = 'none';
  document.getElementById('gff-pane-' + to).style.display = '';
  _gffUpdateSteps(to);
  GFF.step = to;
}

function gffSelectChip(el, group) {
  const container = el.closest('.flex');
  container.querySelectorAll('.gff-chip').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');
  GFF.data[group] = el.dataset.val;
}

function gffSkipToSave() {
  // Save whatever we have and close
  _gffSave();
  closeFeelingModal();
}

function gffChoosePath(path) {
  GFF.data.path = path;
  // Populate closing step based on path
  const el = document.getElementById('gff-closing-content');
  const feeling = GFF.data.feeling?.name || 'your feeling';
  const need    = GFF.data.need || null;

  if (path === 'express') {
    el.innerHTML = `
      <p class="small" style="color:var(--dim);margin-bottom:14px;line-height:1.7">A message will be prepared for your partner. You choose what to send.</p>
      <div class="small" style="color:var(--amber);margin-bottom:10px">Feeling: ${feeling}${need ? ' · Need: ' + need : ''}</div>
      <textarea id="gff-express-note" rows="3" placeholder="Add anything you want them to know..." style="margin-bottom:12px"></textarea>
      <label class="small" style="color:var(--dim);display:block;margin-bottom:8px">Would you like your partner to:</label>
      <div class="fc gap8">
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer"><input type="radio" name="partner-role" value="listen" checked> Just listen, without advice</label>
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer"><input type="radio" name="partner-role" value="validate"> Validate how I feel</label>
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer"><input type="radio" name="partner-role" value="hold"> Just be with me</label>
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer"><input type="radio" name="partner-role" value="space"> Give me space for now</label>
      </div>`;
  } else if (path === 'oracle') {
    el.innerHTML = `<p class="small" style="color:var(--dim);margin-bottom:14px;line-height:1.7">The Oracle will receive your full feeling context when you close this.</p>
      <div class="card" style="background:rgba(255,106,0,.06)">
        <div class="small" style="color:var(--amber)">Context being sent:</div>
        <div class="small" style="color:var(--dim);margin-top:6px">Feeling: ${feeling} (intensity ${GFF.data.intensity}/10)<br>${GFF.data.body ? 'Body: '+GFF.data.body+'<br>' : ''}${need ? 'Need: '+need : ''}</div>
      </div>`;
  } else if (path === 'grounding') {
    el.innerHTML = `<p class="small" style="color:var(--dim);margin-bottom:14px;line-height:1.7">Grounding first. This is the right call.</p>
      <div class="card" style="background:rgba(0,229,204,.04);border-color:rgba(0,229,204,.15)">
        <div style="font-family:var(--fd);font-size:.85rem;color:var(--teal);margin-bottom:10px">🌿 Box Breathing</div>
        <div class="small" style="color:var(--dim);line-height:1.8">In for 4 · Hold for 4 · Out for 6 · Hold for 2<br>Repeat 4 times.<br><br>Feel your feet on the floor.<br>You are here. That is enough.</div>
      </div>
      <div id="gff-grounding-ai" class="ai-out mt12" style="min-height:60px"><em class="small" style="color:var(--dim)">Loading grounding guidance...</em></div>`;
    // Async load grounding guidance
    setTimeout(() => {
      callAI('You are a somatic therapist. Keep responses under 80 words.',
        `Offer one gentle grounding practice for someone feeling: ${feeling}. Somatic, present, soft.`,
        'gff-grounding-ai', { context: 'grounding' });
    }, 300);
  } else if (path === 'hold') {
    el.innerHTML = `<div style="text-align:center;padding:20px 0">
      <div style="font-size:2rem;margin-bottom:12px">🕯</div>
      <div style="font-family:var(--fd);font-size:.95rem;color:var(--amber);margin-bottom:12px">Holding it quietly</div>
      <p class="small" style="color:var(--dim);line-height:1.8;max-width:360px;margin:0 auto">Your feeling has been witnessed. You don't need to do anything with it right now.<br><br>It will be here when you're ready.</p>
    </div>`;
  } else if (path === 'journal') {
    el.innerHTML = `<textarea id="gff-journal-entry" rows="6" placeholder="Write freely. This is only for you." style="margin-bottom:8px"></textarea>
      <div class="small" style="color:var(--dim)">Saved privately. Can be converted to a codex entry later.</div>`;
  }

  gffNext(3);
}

function gffComplete() {
  // Handle express path — send to partner
  if (GFF.data.path === 'express') {
    const note     = document.getElementById('gff-express-note')?.value?.trim() || '';
    const roleEl   = document.querySelector('input[name="partner-role"]:checked');
    const role     = roleEl?.value || 'listen';
    const roleText = { listen: 'Just listen, without advice', validate: 'Validate how I feel', hold: 'Just be with me', space: 'Give me space for now' };
    emitSync('feeling:expressed', {
      feeling:     GFF.data.feeling?.name || '',
      emoji:       GFF.data.feeling?.emoji || '💗',
      intensity:   GFF.data.intensity,
      need:        GFF.data.need,
      note,
      partnerRole: roleText[role],
    });
    showToast('💌 Feeling shared with ' + getPartnerDisplayName());
  }

  // Handle journal path — save privately
  if (GFF.data.path === 'journal') {
    const entry = document.getElementById('gff-journal-entry')?.value?.trim();
    if (entry) {
      const journal = DB.get('eravors_journal', []);
      journal.unshift({ id: 'j'+Date.now(), entry, feeling: GFF.data.feeling?.name, ts: Date.now() });
      DB.set('eravors_journal', journal.slice(0, 200));
    }
  }

  // Handle oracle path — pre-load context
  if (GFF.data.path === 'oracle') {
    window._gffOracleContext = GFF.data;
    closeFeelingModal();
    switchTab('oracle');
    setTimeout(() => {
      const q = `I'm feeling ${GFF.data.feeling?.name || 'something hard to name'} at intensity ${GFF.data.intensity}/10. ${GFF.data.body ? 'I feel it in my '+GFF.data.body+'.' : ''} ${GFF.data.need ? 'The underlying need may be: '+GFF.data.need+'.' : ''} What do you offer?`;
      const inp = document.querySelector('#panel-oracle textarea');
      if (inp) inp.value = q;
    }, 200);
    return;
  }

  _gffSave();
  closeFeelingModal();
  if (GFF.data.path === 'express' && typeof openRelationalMirrorPrompt === 'function') {
    openRelationalMirrorPrompt('feeling', 'feeling_' + Date.now());
  }
}

function _gffSave() {
  if (!GFF.data.feeling) return;
  S.feeling = {
    name:      GFF.data.feeling.name,
    emoji:     GFF.data.feeling.emoji,
    color:     GFF.data.feeling.color,
    intensity: GFF.data.intensity,
    body:      GFF.data.body,
    need:      GFF.data.need,
    path:      GFF.data.path,
    ts:        Date.now(),
  };
  DB.set('eravors_feeling', S.feeling);
  // Real, found bug: this used to build `hist` as a fresh local array
  // (DB.get('eravors_feeling_history', [])) and only ever write THAT to
  // disk -- S.feelingHistory, the actual in-memory array
  // renderFeelingHistory() reads from (tabs/relational/feelings/
  // feelings.js, checked directly), was never touched. Every feeling
  // set through the Guided Feeling Flow -- the only feeling-setting UI
  // in this app, confirmed by tracing every real caller -- saved
  // correctly to disk and then simply never appeared on screen. Fixed
  // by updating S.feelingHistory itself, same array saveFeelingState()
  // (this function's own never-called counterpart) already updates
  // correctly. Same save-verification pattern too: don't leave
  // something showing as logged in memory if the disk write failed.
  S.feelingHistory = S.feelingHistory || [];
  S.feelingHistory.unshift(S.feeling);
  if (S.feelingHistory.length > 100) S.feelingHistory = S.feelingHistory.slice(0, 100);
  const savedHistory = DB.set('eravors_feeling_history', S.feelingHistory);
  if (!savedHistory) S.feelingHistory.shift();
  updateFeelingBar();
  if (typeof renderFeelingHistory === 'function') renderFeelingHistory();
  emitSync('feeling:set', { ...S.feeling });
}

// Wire feeling sector click → GFF.data.feeling
const _origSelectFeeling = window.selectFeeling;
window.selectFeeling = function(name, emoji, color) {
  GFF.data.feeling = { name, emoji, color };
  if (typeof _origSelectFeeling === 'function') _origSelectFeeling(name, emoji, color);
};

// ═══════════════════════════════════════════════════════════════════
// SHARED PLANNER
// ═══════════════════════════════════════════════════════════════════

// Coordinate rounding by consented precision — applied BEFORE the
// coordinates ever leave this device, not just displayed rounded while
// sending the exact value. Decimal-place truncation is the standard,
// well-understood approximation for this (not uniform in km across
// latitudes, but close enough and it's the documented method, not a
// silent guess): ~2 decimal places ("neighborhood") is roughly 1km at
// the equator, ~1 decimal place ("city") is roughly 11km.
function _roundCoordsForPrecision(lat, lon, precision) {
  if (precision === 'precise') return [lat, lon];
  const places = precision === 'neighborhood' ? 2 : precision === 'city' ? 1 : null;
  if (places == null) return [lat, lon];
  const f = Math.pow(10, places);
  return [Math.round(lat * f) / f, Math.round(lon * f) / f];
}

function _getGeolocation() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) { resolve(null); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve([pos.coords.latitude, pos.coords.longitude]),
      () => resolve(null), // denied or unavailable — never blocks proposing the event itself
      { timeout: 8000 }
    );
  });
}

async function proposePlannerEvent() {
  const type     = document.getElementById('planner-type')?.value || 'date';
  const title    = document.getElementById('planner-title')?.value?.trim();
  const datetime = document.getElementById('planner-datetime')?.value;
  const notes    = document.getElementById('planner-notes')?.value?.trim() || '';
  const ftag     = document.getElementById('planner-feeling-tag')?.value?.trim() || '';
  const statusEl = document.getElementById('planner-status');

  if (!title) { if (statusEl) { statusEl.textContent = 'Add a title first.'; statusEl.style.color = 'var(--rose)'; } return; }

  // Was: stored the raw <input type="datetime-local"> string as-is and
  // re-parsed it with `new Date(string)` at RENDER time — that string
  // has no timezone info, so whoever's browser rendered it interpreted
  // it as ITS OWN local time, not the proposer's. Two people in
  // different timezones would see two different actual times for the
  // same event. Confirmed real, not assumed, matching the spec's own
  // flag on this ("a map-before-build check, not assumed correct").
  // Fixed: convert to a true UTC epoch at proposal time (`new
  // Date(datetimeLocalString).getTime()` correctly reads it as THIS
  // device's local time since that's what the input represents), then
  // every viewer's `new Date(epoch)` naturally renders in their own
  // timezone with no further conversion needed.
  const start_ts = datetime ? new Date(datetime).getTime() : null;
  const timezone_created_in = Intl.DateTimeFormat().resolvedOptions().timeZone;

  // Real, soft check against space-distance's actual computed overlap
  // window -- not a hard gate (the person's own judgment about their
  // relationship's real schedule always wins), just real information
  // they might not have: a 2am proposal genuinely might be the one
  // time that works for both of them, or it might be an honest
  // mistake made while not thinking about the time difference. Fails
  // silently/non-fatally if Emergence isn't attached -- same pattern
  // as every other real Emergence hook in this file.
  if (start_ts) {
    try {
      const res = await fetch('/api/emergence/space/check-time', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timestamp: start_ts }),
      });
      const check = await res.json();
      if (check.checked && check.withinOverlap === false) {
        showToast('🕐 Heads up — that time is outside your usual overlap window');
      }
    } catch (e) {
      // non-fatal, same as every other Emergence hook here
    }
  }

  // Location — structural default is shared:false (per
  // 02-DATA-SCHEMAS.md); only captured at all if the checkbox is on,
  // and rounded to the chosen precision before it's ever stored, not
  // just before display.
  const shareLocation = document.getElementById('planner-share-location')?.checked || false;
  let location = null;
  if (shareLocation) {
    const precision = document.getElementById('planner-location-precision')?.value || 'neighborhood';
    const raw = await _getGeolocation();
    location = raw
      ? { shared: true, precision, coords: _roundCoordsForPrecision(raw[0], raw[1], precision) }
      : { shared: false, precision: null, coords: null }; // permission denied/unavailable — don't claim shared when nothing was captured
  }

  const event = {
    id:        'evt-' + Date.now(),
    type,
    title,
    start_ts,
    timezone_created_in,
    notes,
    feelingTag: ftag,
    location,
    proposedBy: S.user?.name,
    proposedAt: Date.now(),
    status:    'pending',  // pending | accepted | declined
    outcome:   null,
  };

  // Save to shared DB
  const events = DB.get('eravors_planner_events', []);
  events.unshift(event);
  DB.set('eravors_planner_events', events.slice(0, 100));

  // Notify partner
  emitSync('planner:event_proposed', { event });

  // Clear form
  ['planner-title','planner-notes','planner-feeling-tag'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  const dt = document.getElementById('planner-datetime');
  if (dt) dt.value = '';
  const shareLocEl = document.getElementById('planner-share-location');
  if (shareLocEl) shareLocEl.checked = false;
  const precRow = document.getElementById('planner-location-precision-row');
  if (precRow) precRow.style.display = 'none';

  if (statusEl) { statusEl.textContent = '✓ Event proposed — waiting for response'; statusEl.style.color = 'var(--teal)'; }
  showToast('📅 Event proposed to ' + getPartnerDisplayName());
  renderPlannerEvents();
}

function renderPlannerEvents() {
  const el = document.getElementById('planner-event-list');
  if (!el) return;
  const events = DB.get('eravors_planner_events', []);
  if (!events.length) {
    el.innerHTML = '<p class="small italic" style="color:var(--dim)">No events yet. Propose something.</p>';
    return;
  }
  const typeEmoji = { date:'💕', call:'📞', checkin:'🌿', rest:'🌙', sleep:'😴', meetup:'🤝', custom:'✦' };
  const statusColor = { pending:'var(--amber)', accepted:'var(--teal)', declined:'var(--rose)' };
  const now = Date.now();
  el.innerHTML = events.map(ev => {
    // Graceful fallback for events created before start_ts existed —
    // old ones only have the ambiguous `datetime` string; render it the
    // same way it always was rather than pretending it's now correct.
    const epoch = ev.start_ts != null ? ev.start_ts : (ev.datetime ? new Date(ev.datetime).getTime() : null);
    const dt = epoch ? new Date(epoch).toLocaleString([], {weekday:'short',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}) : 'No time set';
    const mine = ev.proposedBy === S.user?.name;
    const isPast = epoch && epoch < now;
    const needsOutcome = isPast && ev.status === 'accepted' && !ev.outcome;
    return `<div class="planner-event ${ev.status}">
      <div class="planner-event-type">${typeEmoji[ev.type]||'✦'} ${(ev.type||'').toUpperCase()} · <span style="color:${statusColor[ev.status]||'var(--dim)'}">${(ev.status||'').toUpperCase()}</span></div>
      <div class="planner-event-title">${ev.title}</div>
      <div class="planner-event-time">${dt}</div>
      ${ev.notes ? `<div class="small" style="color:var(--dim);margin-bottom:8px">${ev.notes}</div>` : ''}
      ${ev.feelingTag ? `<div class="small" style="color:var(--violet);margin-bottom:8px">Feeling: ${ev.feelingTag}</div>` : ''}
      ${ev.location && ev.location.shared && ev.location.coords ? `
        <button class="btn g" style="font-size:.72rem;margin-bottom:8px" onclick="toggleEventLocationMap('${ev.id}', ${ev.location.coords[0]}, ${ev.location.coords[1]}, '${ev.location.precision}')">📍 ${ev.location.precision === 'precise' ? 'Exact location' : ev.location.precision + '-level location'} shared — view</button>
        <div id="planner-map-${ev.id}" class="planner-mini-map" style="display:none"></div>` : ''}
      ${!mine && ev.status === 'pending' ? `<div class="flex gap8" id="respond-row-${ev.id}">
        <button class="btn p" style="font-size:.72rem" onclick="respondPlannerEvent('${ev.id}','accepted')">✓ Accept</button>
        <button class="btn g" style="font-size:.72rem" onclick="openDeclineEventForm('${ev.id}')">✕ Decline</button>
      </div>` : ''}
      ${mine ? `<div class="small" style="color:var(--dim);font-family:var(--fm);font-size:.6rem">Proposed by you</div>` : ''}
      ${ev.status === 'declined' && ev.declineReason ? `
        <div class="small" style="color:var(--dim);margin-top:8px;padding-top:8px;border-top:1px solid var(--border2)">
          Declined: ${ev.declineReason}
        </div>` : ''}
      ${needsOutcome ? `
        <div class="planner-outcome-prompt" id="outcome-prompt-${ev.id}">
          <div class="small" style="color:var(--amber);margin-bottom:8px">Did this happen?</div>
          <div class="flex gap8">
            <button class="btn g" style="font-size:.72rem" onclick="setEventOutcome('${ev.id}', true)">✓ Yes</button>
            <button class="btn g" style="font-size:.72rem" onclick="openMissedEventForm('${ev.id}')">Not quite</button>
          </div>
        </div>` : ''}
      ${ev.outcome && ev.outcome.happened === false ? `
        <div class="small" style="color:var(--dim);margin-top:8px;padding-top:8px;border-top:1px solid var(--border2)">
          Didn't happen${ev.outcome.missed_reason ? ': ' + ev.outcome.missed_reason : ''}${ev.outcome.how_it_felt ? ' · Feeling: ' + ev.outcome.how_it_felt : ''}
        </div>` : ''}
      ${ev.outcome && ev.outcome.happened === true ? `<div class="small" style="color:var(--teal);margin-top:8px">✓ It happened</div>` : ''}
    </div>`;
  }).join('');
}

// Shows a precision-appropriate uncertainty circle, not always a
// precise pin regardless of the consented precision level — a
// "neighborhood"-level share should visually look imprecise, not just
// be labeled that way while showing an exact marker.
const _plannerMaps = {}; // one Leaflet map instance per event id, reused on re-toggle
function toggleEventLocationMap(id, lat, lon, precision) {
  const container = document.getElementById('planner-map-' + id);
  if (!container) return;
  const showing = container.style.display !== 'none';
  if (showing) { container.style.display = 'none'; return; }
  container.style.display = 'block';
  if (_plannerMaps[id]) { _plannerMaps[id].invalidateSize(); return; } // already built, just re-shown

  if (typeof L === 'undefined') {
    container.innerHTML = '<div class="small" style="color:var(--dim);padding:10px">Map library unavailable.</div>';
    return;
  }
  const radiusMeters = precision === 'precise' ? 0 : precision === 'neighborhood' ? 1000 : 10000;
  const zoom = precision === 'precise' ? 15 : precision === 'neighborhood' ? 13 : 10;
  const map = L.map(container, { zoomControl: false, attributionControl: true }).setView([lat, lon], zoom);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18,
    attribution: '© OpenStreetMap contributors',
  }).addTo(map);
  if (radiusMeters > 0) {
    L.circle([lat, lon], { radius: radiusMeters, color: '#00e5cc', fillColor: '#00e5cc', fillOpacity: 0.15 }).addTo(map);
  } else {
    L.marker([lat, lon]).addTo(map);
  }
  _plannerMaps[id] = map;
}

function setEventOutcome(id, happened, missedReason, howItFelt) {
  const events = DB.get('eravors_planner_events', []);
  const ev = events.find(e => e.id === id);
  if (!ev) return;
  ev.outcome = { happened, missed_reason: missedReason || null, how_it_felt: howItFelt || null };
  DB.set('eravors_planner_events', events);
  emitSync('planner:event_outcome', { eventId: id, outcome: ev.outcome }, { queueOnFail: false });
  renderPlannerEvents();
  showToast(happened ? '✓ Marked as happened' : 'Logged — thank you for saying so');

  // Real contact evidence for space-distance's learned cadence baseline
  // -- a confirmed planner event is exactly the kind of real signal
  // that component needs and, until now, never received (its own
  // logContact() existed and was tested directly, but nothing in the
  // real app ever called it). Only the types that genuinely represent
  // real contact between two people are logged -- 'rest'/'sleep'/
  // 'custom' are skipped on purpose, stated here rather than guessed:
  // a solo rest day isn't evidence of togetherness, and 'custom' is
  // too ambiguous to force into space-distance's fixed enum honestly.
  const PLANNER_TO_CONTACT_TYPE = { call: 'call', date: 'in-person', meetup: 'in-person', checkin: 'call' };
  const contactType = PLANNER_TO_CONTACT_TYPE[ev.type];
  if (happened && contactType) {
    fetch('/api/emergence/space/contact', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contactType, timestamp: Date.now() }),
    }).catch(e => console.warn('[eravos] space-distance contact log failed (non-fatal):', e.message));
  }
}

// Missed-event follow-up: why not, how it feels — folded into one
// natural free-text prompt each rather than inventing a fourth schema
// field for "what can be done" that 02-DATA-SCHEMAS.md doesn't define.
function openMissedEventForm(id) {
  const el = document.getElementById('outcome-prompt-' + id);
  if (!el) return;
  el.innerHTML = `
    <label class="fl">What got in the way? (optional)</label>
    <textarea id="missed-reason-${id}" rows="2" placeholder="What happened, and what might help next time..."></textarea>
    <label class="fl mt8">How do you feel about it? (optional)</label>
    <input type="text" id="missed-feeling-${id}" placeholder="">
    <div class="flex gap8 mt10">
      <button class="btn p" style="font-size:.72rem" onclick="setEventOutcome('${id}', false, document.getElementById('missed-reason-${id}').value.trim(), document.getElementById('missed-feeling-${id}').value.trim())">Save</button>
    </div>`;
}

// Decline-with-reason, same structural pattern as Meaning's
// decline-with-reason (03-FEATURE-SPECS.md §Meaning) and the planner's
// own missed-event reason: optional, free-text, framed compassionately
// rather than a forced field — declining with no reason given is still
// a complete, valid action.
function openDeclineEventForm(id) {
  const el = document.getElementById('respond-row-' + id);
  if (!el) return;
  el.innerHTML = `
    <div class="fc gap8" style="width:100%">
      <label class="fl">Let them know why (optional)</label>
      <textarea id="decline-reason-${id}" rows="2" placeholder="No pressure to explain, but if it helps..."></textarea>
      <div class="flex gap8">
        <button class="btn g" style="font-size:.72rem" onclick="respondPlannerEvent('${id}','declined', document.getElementById('decline-reason-${id}').value.trim())">✕ Confirm decline</button>
        <button class="btn" style="font-size:.72rem" onclick="renderPlannerEvents()">Cancel</button>
      </div>
    </div>`;
}

function respondPlannerEvent(id, response, reason) {
  const events = DB.get('eravors_planner_events', []);
  const ev = events.find(e => e.id === id);
  if (!ev) return;
  ev.status = response;
  ev.respondedAt = Date.now();
  ev.respondedBy = S.user?.name;
  ev.declineReason = response === 'declined' ? (reason || null) : null;
  DB.set('eravors_planner_events', events);
  emitSync('planner:event_response', { eventId: id, response, reason: ev.declineReason });
  showToast(response === 'accepted' ? '✓ Event accepted' : 'Event declined');
  renderPlannerEvents();
}

function setAvailable(state) {
  const el = document.getElementById('availability-status');
  emitSync('presence:availability', { available: state }, { queueOnFail: false });
  if (el) { el.textContent = state ? '✓ Partner notified you are available' : 'Partner notified'; el.style.color = 'var(--teal)'; }
  showToast(state ? '✅ Partner knows you are available' : 'Availability updated');
}

// ═══════════════════════════════════════════════════════════════════
// LOVE LETTER FULL-SCREEN DISPLAY
// ═══════════════════════════════════════════════════════════════════

var _currentLoveLetter = null;

function showLoveLetterDisplay(message, from) {
  _currentLoveLetter = { message, from, ts: Date.now() };
  const el   = document.getElementById('love-letter-display');
  const text = document.getElementById('love-letter-text');
  const fromEl = document.getElementById('love-letter-from');
  if (!el || !text) return;
  text.textContent  = message;
  if (fromEl) fromEl.textContent = '— ' + (from || 'Your partner') + ', ' + new Date().toLocaleDateString('en-US', { month:'long', day:'numeric' });
  el.classList.add('open');
  // Gentle entrance animation
  el.style.opacity = '0';
  setTimeout(() => { el.style.transition = 'opacity 1.2s ease'; el.style.opacity = '1'; }, 50);
}

function closeLoveLetter() {
  const el = document.getElementById('love-letter-display');
  if (!el) return;
  el.style.opacity = '0';
  setTimeout(() => { el.classList.remove('open'); el.style.opacity = '1'; el.style.transition = ''; }, 800);
}

function saveLetterToVault() {
  if (!_currentLoveLetter) return;
  const vault = DB.get('eravors_vault', []);
  vault.unshift({
    id:      'letter-' + Date.now(),
    type:    'love_letter',
    title:   'Love Letter from ' + (_currentLoveLetter.from || 'Partner'),
    content: _currentLoveLetter.message,
    from:    _currentLoveLetter.from,
    ts:      _currentLoveLetter.ts,
  });
  DB.set('eravors_vault', vault.slice(0, 200));
  showToast('🗂 Saved to Vault');
  closeLoveLetter();
}

// ═══════════════════════════════════════════════════════════════════
// ONE-WAY MESSAGE — 10-minute reply lock
// ═══════════════════════════════════════════════════════════════════

const ONE_WAY_LOCK_MS = 10 * 60 * 1000;

function _checkOneWayLock() {
  const lastOneWay = DB.get('eravors_last_one_way_received', null);
  if (!lastOneWay) return false;
  return (Date.now() - lastOneWay) < ONE_WAY_LOCK_MS;
}

function _formatLockRemaining() {
  const lastOneWay = DB.get('eravors_last_one_way_received', null);
  if (!lastOneWay) return '';
  const remaining = ONE_WAY_LOCK_MS - (Date.now() - lastOneWay);
  if (remaining <= 0) return '';
  const mins = Math.floor(remaining / 60000);
  const secs = Math.floor((remaining % 60000) / 1000);
  return `${mins}:${secs.toString().padStart(2,'0')}`;
}

// ═══════════════════════════════════════════════════════════════════
// P2P MESSAGE HANDLERS — planner + love letter + feeling express
// ═══════════════════════════════════════════════════════════════════

// Migrated to syncStream gates (feeling:expressed, planner:event_proposed,
// planner:event_response, presence:availability, message:sent) — see the
// SYNC STREAM block earlier in this file. This used to be a
// window.handleP2PMessage monkey-patch layer; removed as part of the
// Phase 1 sync envelope migration (04-PHASEMAP.md).

// ═══════════════════════════════════════════════════════════════════
// ONBOARDING SYSTEM — 10 steps, persistent draft, "Other" on each
// ═══════════════════════════════════════════════════════════════════

var OB_DATA = {};
var OB_STEP = 0;

const OB_STEPS = [
  { id:'welcome', title:'Welcome to Eravos', skip:false,
    render:() => `<div style="text-align:center;padding:8px 0 20px">
      <div style="font-size:3rem;margin-bottom:16px">🔥</div>
      <p style="font-family:var(--fb);font-size:1.05rem;color:var(--amber);margin-bottom:16px;line-height:1.7">This is your co-created space.</p>
      <p class="small" style="color:var(--dim);line-height:1.8;max-width:400px;margin:0 auto">These questions shape how Eravos speaks to you. No wrong answers. Everything is skippable. Change anything anytime in Profile settings.</p>
    </div>`,
    save:()=>{}},

  { id:'names', title:'What do we call you?', skip:true,
    render:() => `
      <label class="fl">Your display name</label>
      <input type="text" id="ob-display-name" placeholder="James" value="${OB_DATA.displayName||''}" style="margin-bottom:14px">
      <label class="fl">What does your partner call you? <span style="color:var(--dim);font-size:.75rem">(optional)</span></label>
      <input type="text" id="ob-pet-name" placeholder="a nickname..." value="${OB_DATA.petName||''}" style="margin-bottom:14px">
      <label class="fl">What do you call your relationship? <span style="color:var(--dim);font-size:.75rem">(optional)</span></label>
      <input type="text" id="ob-rel-name" placeholder="us, our fire, the space between..." value="${OB_DATA.relName||''}">`,
    save:()=>{
      OB_DATA.displayName = document.getElementById('ob-display-name')?.value?.trim()||OB_DATA.displayName;
      OB_DATA.petName     = document.getElementById('ob-pet-name')?.value?.trim()||'';
      OB_DATA.relName     = document.getElementById('ob-rel-name')?.value?.trim()||'';
      if(OB_DATA.displayName&&S.user){S.user.name=OB_DATA.displayName;DB.set('eravors_user',S.user);}
    }},

  { id:'identity', title:'How do you identify?', skip:true,
    render:() => `
      <p class="small" style="color:var(--dim);margin-bottom:14px;line-height:1.7">Helps the Oracle speak to you accurately. All optional.</p>
      <label class="fl">Gender identity</label>
      <div class="flex gap8 wrap" style="margin-bottom:14px" id="ob-gender-chips">
        ${(window.EravosConfig?.onboarding?.genderOptions || ["Man","Woman","Non-binary","Genderfluid","Gender non-conforming","Agender","Trans man","Trans woman","Other"]).map(g=>
          `<button class="gff-chip${OB_DATA.gender===g?' selected':''}" onclick="obChipSelect(this,'gender')" data-val="${g}">${g}</button>`).join('')}
      </div>
      <label class="fl">Sexual orientation <span style="color:var(--dim);font-size:.75rem">(optional)</span></label>
      <div class="flex gap8 wrap" style="margin-bottom:14px" id="ob-orient-chips">
        ${(window.EravosConfig?.onboarding?.orientationOptions || ["Straight","Gay","Lesbian","Bisexual","Pansexual","Queer","Asexual","Other"]).map(o=>
          `<button class="gff-chip${OB_DATA.orientation===o?' selected':''}" onclick="obChipSelect(this,'orientation')" data-val="${o}">${o}</button>`).join('')}
      </div>
      <label class="fl">Pronouns <span style="color:var(--dim);font-size:.75rem">(optional)</span></label>
      <input type="text" id="ob-pronouns" placeholder="he/him, she/her, they/them..." value="${OB_DATA.pronouns||''}">`,
    save:()=>{OB_DATA.pronouns=document.getElementById('ob-pronouns')?.value?.trim()||'';}},

  { id:'love_meaning', title:'What does love mean to you?', skip:true,
    render:() => `
      <p class="small" style="color:var(--dim);margin-bottom:14px;line-height:1.7">No right answer. Your answer shapes how the Oracle speaks about love.</p>
      <textarea id="ob-love-meaning" rows="4" placeholder="Love is...">${OB_DATA.love_meaning||''}</textarea>`,
    save:()=>{OB_DATA.love_meaning=document.getElementById('ob-love-meaning')?.value?.trim()||'';}},

  { id:'love_lang', title:'What makes you feel most loved?', skip:true,
    render:() => `
      <p class="small" style="color:var(--dim);margin-bottom:14px">Select all that resonate.</p>
      <div class="flex gap8 wrap" id="ob-love-lang-chips">
        ${[['words','Words of affirmation'],['touch','Physical touch'],['time','Quality time'],['acts','Acts of service'],['gifts','Thoughtful gestures'],['music','Music'],['understanding','Being truly understood'],['space','Respectful space']].map(([v,l])=>
          `<button class="gff-chip${(OB_DATA.love_lang||[]).includes(v)?' selected':''}" onclick="obChipMulti(this,'love_lang')" data-val="${v}">${l}</button>`).join('')}
      </div>
      <input type="text" id="ob-love-lang-other" placeholder="Something else..." value="${OB_DATA.love_lang_other||''}" style="margin-top:12px">`,
    save:()=>{OB_DATA.love_lang_other=document.getElementById('ob-love-lang-other')?.value?.trim()||'';}},

  { id:'comm_style', title:'How do you communicate best when something is hard?', skip:true,
    render:() => `
      <div class="fc gap8" id="ob-comm-chips">
        ${[['talk','Talk it through right away'],['write','Write first, then talk'],['space','Need space before engaging'],['physical','Touch and presence, then words'],['mixed','It depends on the day']].map(([v,l])=>
          `<button class="gff-chip${OB_DATA.comm_style===v?' selected':''}" onclick="obChipSelect(this,'comm_style')" data-val="${v}" style="width:100%;text-align:left">${l}</button>`).join('')}
      </div>
      <input type="text" id="ob-comm-other" placeholder="Or something else..." value="${OB_DATA.comm_other||''}" style="margin-top:12px">`,
    save:()=>{OB_DATA.comm_other=document.getElementById('ob-comm-other')?.value?.trim()||'';}},

  { id:'non_negotiable', title:'What is non-negotiable for you?', skip:true,
    render:() => `
      <p class="small" style="color:var(--dim);margin-bottom:14px;line-height:1.7">The Oracle holds these with reverence. It will never suggest anything that contradicts them.</p>
      <textarea id="ob-non-neg" rows="4" placeholder="Honesty. Presence. Being seen...">${OB_DATA.non_negotiable||''}</textarea>`,
    save:()=>{OB_DATA.non_negotiable=document.getElementById('ob-non-neg')?.value?.trim()||'';}},

  { id:'romance_style', title:'Your romance style', skip:true,
    render:() => `
      <p class="small" style="color:var(--dim);margin-bottom:14px">Select all that resonate.</p>
      <div class="flex gap8 wrap" id="ob-romance-chips">
        ${[['dark','Dark Romance'],['old','Old-school, classic'],['poetic','Poetic & literary'],['wild','Wild & alive'],['tender','Tender & slow'],['mystical','Mystical'],['playful','Playful & light'],['intense','Intense & consuming']].map(([v,l])=>
          `<button class="gff-chip${(OB_DATA.romance_style||[]).includes(v)?' selected':''}" onclick="obChipMulti(this,'romance_style')" data-val="${v}">${l}</button>`).join('')}
      </div>`,
    save:()=>{}},

  { id:'attachment', title:'Your attachment pattern', skip:true,
    render:() => `
      <p class="small" style="color:var(--dim);margin-bottom:14px;line-height:1.7">Not a label — a compass. The Oracle uses this to meet you where you are.</p>
      <div class="fc gap8" id="ob-attach-chips">
        ${[['secure','Secure — comfortable with closeness and distance'],['anxious','Anxious — I reach toward connection when uncertain'],['avoidant','Avoidant — I pull away when it gets intense'],['disorganized','Both, depending on the moment'],['unsure','Still learning my patterns']].map(([v,l])=>
          `<button class="gff-chip${OB_DATA.attachment===v?' selected':''}" onclick="obChipSelect(this,'attachment')" data-val="${v}" style="width:100%;text-align:left">${l}</button>`).join('')}
      </div>`,
    save:()=>{}},

  { id:'intention', title:'What brings you here?', skip:true,
    render:() => `
      <p class="small" style="color:var(--dim);margin-bottom:14px;line-height:1.7">The Oracle keeps this. It shapes everything.</p>
      <textarea id="ob-intention" rows="4" placeholder="I am here because...">${OB_DATA.intention||''}</textarea>`,
    save:()=>{OB_DATA.intention=document.getElementById('ob-intention')?.value?.trim()||'';}},
];

function obChipSelect(el, key) {
  el.closest('[id]').querySelectorAll('.gff-chip').forEach(c=>c.classList.remove('selected'));
  el.classList.toggle('selected');
  OB_DATA[key] = el.classList.contains('selected') ? el.dataset.val : null;
}

function obChipMulti(el, key) {
  el.classList.toggle('selected');
  if(!OB_DATA[key]) OB_DATA[key]=[];
  const val=el.dataset.val;
  if(el.classList.contains('selected')){ if(!OB_DATA[key].includes(val)) OB_DATA[key].push(val); }
  else { OB_DATA[key]=OB_DATA[key].filter(v=>v!==val); }
}

function obRenderStep(idx) {
  const step=OB_STEPS[idx]; if(!step) return;
  const c=document.getElementById('ob-steps-container'); if(c) c.innerHTML=step.render();
  const t=document.getElementById('ob-title'); if(t) t.textContent=step.title;
  // Progress counts the ACTIVE steps. Showing "3 / 10" when four of the ten
  // no longer apply is a progress bar that lies.
  const A=(typeof obActiveSteps==='function')?obActiveSteps():OB_STEPS;
  const ai=Math.max(0,A.indexOf(step));
  const p=document.getElementById('ob-progress'); if(p) p.textContent=(ai+1)+' / '+A.length;
  const b=document.getElementById('ob-progress-bar'); if(b) b.style.width=(((ai+1)/A.length)*100)+'%';
  const back=document.getElementById('ob-back-btn'); if(back) back.style.display=ai>0?'':'none';
  const next=document.getElementById('ob-next-btn'); if(next) next.textContent=ai===A.length-1?'✓ Finish':'Continue →';
  const skip=document.getElementById('ob-skip-btn'); if(skip) skip.style.display=step.skip?'':'none';
  OB_STEP=idx; _obAutosave();
}

function obNext() {
  const step=OB_STEPS[OB_STEP]; if(step?.save) step.save(); _obAutosave();
  // Recomputed AFTER save, so an answer given on this step can remove a later
  // one immediately — that is what makes it targeted rather than a fixed march.
  const A=obActiveSteps(); const i=A.indexOf(step);
  if(i>=A.length-1){obComplete();}else{obRenderStep(OB_STEPS.indexOf(A[i+1]));}
}
function obBack() {
  const step=OB_STEPS[OB_STEP]; if(step?.save) try{step.save();}catch(_){}
  const A=obActiveSteps(); const i=A.indexOf(step);
  if(i>0) obRenderStep(OB_STEPS.indexOf(A[i-1]));
}
// ── EMERGENT / TARGETED ONBOARDING (v0.13.0) ──────────────────────
// A fixed ten-step march asks everyone the same questions regardless of what
// they have already said. That is its own small disrespect: being asked about
// your relationship stage after answering "solo", or drilled on attachment
// after answering "still learning my patterns", tells you nothing was heard.
//
// Steps now declare an optional `when(data)`. The ACTIVE list is recomputed
// after every answer, so progress reflects what is actually still relevant
// rather than a constant that was decided before you said anything.
function obActiveSteps() {
  return OB_STEPS.filter(s => {
    if (typeof s.when !== 'function') return true;
    try { return !!s.when(OB_DATA); }
    catch (e) { console.error('[eravos] onboarding when() threw for "' + s.id + '":', e.message); return true; }
  });
}

// Declared here rather than inline on each step so the whole adaptive rule
// set is readable in one place (§13.2 — every edge named).
const OB_RELEVANCE = {
  // solo people are not asked about a partner they have not got
  romance:      d => d.mode !== 'solo',
  attachment:   d => d.mode !== 'solo',
  // no point drilling attachment style at someone who just said they are
  // still working it out
  attach_depth: d => d.attachment && d.attachment !== 'unsure',
};
OB_STEPS.forEach(s => { if (OB_RELEVANCE[s.id]) s.when = OB_RELEVANCE[s.id]; });

function obSkip() { _obAutosave(); const A=obActiveSteps(); const i=A.indexOf(OB_STEPS[OB_STEP]);
  if(i>=A.length-1){obComplete();return;} obRenderStep(OB_STEPS.indexOf(A[i+1])); }

/**
 * SKIP THE WHOLE THING. Keeps whatever was already answered (§0.3) and marks
 * onboarding as done so it never reappears on its own. "Answer later" from
 * the profile still opens it.
 */
function obSkipAll() {
  OB_DATA.skippedAt = Date.now();
  OB_DATA.completedAt = OB_DATA.completedAt || null;
  DB.set('eravors_onboarding', OB_DATA);
  DB.set('eravors_onboarding_draft', null);
  const modal=document.getElementById('onboarding-modal'); if(modal) modal.style.display='none';
  if (typeof showToast === 'function') showToast('Skipped. Nothing here needs answering — you can fill it in any time from your profile.');
  if (typeof renderOnboardingAnswers === 'function') renderOnboardingAnswers();
}
if (typeof window !== 'undefined') Object.assign(window, { obSkipAll, obActiveSteps });
function _obAutosave() { DB.set('eravors_onboarding_draft',{data:OB_DATA,step:OB_STEP,ts:Date.now()}); }

function obComplete() {
  OB_DATA.completedAt=Date.now();
  DB.set('eravors_onboarding',OB_DATA);
  DB.set('eravors_onboarding_draft',null);
  const modal=document.getElementById('onboarding-modal'); if(modal) modal.style.display='none';
  if(OB_DATA.displayName&&S.user){S.user.name=OB_DATA.displayName;DB.set('eravors_user',S.user);const e=document.getElementById('user-name-display');if(e) e.textContent=OB_DATA.displayName;}
  showToast('✦ Welcome to Eravos');
  if(typeof renderOnboardingAnswers==='function') renderOnboardingAnswers();
  log('Onboarding complete','ok');
}

function checkOnboarding() {
  if(DB.get('eravors_onboarding',null)) return;
  const draft=DB.get('eravors_onboarding_draft',null);
  if(draft?.data) { Object.assign(OB_DATA,draft.data); OB_STEP=draft.step||0; }
  const modal=document.getElementById('onboarding-modal');
  if(modal){ modal.style.display='flex'; obRenderStep(OB_STEP); }
}

function openOnboardingEdit() {
  const existing=DB.get('eravors_onboarding',null);
  if(existing) Object.assign(OB_DATA,existing);
  OB_STEP=0;
  const modal=document.getElementById('onboarding-modal');
  if(modal){ modal.style.display='flex'; obRenderStep(0); }
}

// ═══════════════════════════════════════════════════════════════════
// MESSAGE SYSTEM — FIXES
// ═══════════════════════════════════════════════════════════════════

// Alias for P2P handler
window.renderMessageInbox = function() { if(typeof renderInbox==='function') renderInbox(); };

// Fix generateLoveLetter to use callAI (Guardian→Ollama→ChatGPT→Claude→offline)
window.generateLoveLetter = async function() {
  const status=document.getElementById('msg-oracle-generating');
  if(status){status.style.display='block';status.textContent='✦ Oracle writing...';}
  const feeling=S.feeling?.name?`Current feeling: ${S.feeling.emoji} ${S.feeling.name} at intensity ${S.feeling.intensity}/10.`:'';
  const text=await callAI(
    `You are the Eravos Oracle. Write a deeply personal, poetic love letter — intimate, specific, 3-4 paragraphs. Not generic. No "Dear" opener. ${feeling}`,
    'Write a love letter for my partner.', null, {context:'poetry'}
  );
  const ta=document.getElementById('msg-compose');
  if(ta&&text&&!text.includes('configure an AI')) ta.value=text;
  if(status) status.style.display='none';
};

// ═══════════════════════════════════════════════════════════════════
// RUPTURE REPAIR FLOW
// ═══════════════════════════════════════════════════════════════════

// REPAIR FLOW (openRepairFlow/markRepairStep/getRepairGuidance/
// markRuptureResolved) and the duplicate renderRuptures() override that
// used to live here -- both moved to tabs/rupture/rupture.js, merged
// into one real, correct renderRuptures() there (see that file's own
// header for the real duplicate-definition bug this found and fixed).

// ═══════════════════════════════════════════════════════════════════
// CALL REACTIONS + POST-CALL PROBE
// ═══════════════════════════════════════════════════════════════════

function sendCallReaction(emoji) {
  // Send to partner
  emitSync('call:reaction', { emoji }, { queueOnFail: false });
  // Show own reaction
  _showReactionOverlay(emoji);
}

function _showReactionOverlay(emoji) {
  const el = document.getElementById('call-reaction-display');
  if (!el) return;
  el.textContent = emoji;
  el.style.opacity = '1';
  el.style.transform = 'translateY(0)';
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(-20px)';
  }, 1800);
}

// call:reaction is now a syncStream gate (see SYNC STREAM block earlier
// in this file) — this monkey-patch layer is retired.

// Post-call feeling probe — fires 30s after endCall
const _origEndCall = window.endCall;
window.endCall = function(remote) {
  if (typeof _origEndCall === 'function') _origEndCall(remote);
  // Wait 30s then softly ask how they feel
  setTimeout(() => {
    if (document.getElementById('feeling-modal')?.classList.contains('open')) return;
    const probe = document.createElement('div');
    probe.id = 'post-call-probe'; probe.classList.add('ambient-popup');
    probe.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
        <span style="font-size:1.2rem">💗</span>
        <div>
          <div style="font-family:var(--fd);font-size:.9rem;color:var(--amber)">How do you feel after the call?</div>
          <div class="small" style="color:var(--dim);margin-top:2px">Take a moment to check in.</div>
        </div>
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn p" style="flex:1;font-size:.78rem" onclick="document.getElementById('post-call-probe').remove();openFeelingModal()">💗 Check In</button>
        <button class="btn g" style="font-size:.78rem" onclick="document.getElementById('post-call-probe').remove()">Later</button>
      </div>`;
    probe.style.cssText = `position:fixed;bottom:${_ambientPopupBottom()}px;right:20px;z-index:9400;background:linear-gradient(160deg,rgba(22,11,18,.97),rgba(10,5,8,.99));border:1px solid rgba(255,106,0,.2);border-radius:16px;padding:16px 18px;width:min(290px,90vw);box-shadow:0 8px 32px rgba(0,0,0,.5);animation:slideInRight .35s cubic-bezier(.34,1.56,.64,1)`;
    document.body.appendChild(probe);
    setTimeout(() => { if (probe.parentNode) probe.remove(); }, 15000);
  }, 30000);
};

// ═══════════════════════════════════════════════════════════════════
// ORACLE — wire onboarding context into getPrimingPrefix
// ═══════════════════════════════════════════════════════════════════

const _origGetPrimingPrefix = window.getPrimingPrefix || function() { return ''; };
window.getPrimingPrefix = function() {
  const base  = typeof _origGetPrimingPrefix === 'function' ? _origGetPrimingPrefix() : '';
  const ob    = DB.get('eravors_onboarding', null);
  if (!ob) return base;

  const parts = [];
  if (ob.displayName) parts.push(`User's name: ${ob.displayName}.`);
  if (ob.pronouns)    parts.push(`Pronouns: ${ob.pronouns}.`);
  if (ob.petName)     parts.push(`Their partner calls them: ${ob.petName}.`);
  if (ob.relName)     parts.push(`They call their relationship: "${ob.relName}".`);
  if (ob.love_meaning) parts.push(`What love means to them: ${ob.love_meaning.slice(0,120)}.`);
  if (ob.love_lang?.length) parts.push(`Love languages: ${ob.love_lang.join(', ')}.`);
  if (ob.comm_style)  parts.push(`Communication style: ${ob.comm_style}.`);
  if (ob.non_negotiable) parts.push(`Non-negotiables: ${ob.non_negotiable.slice(0,100)}.`);
  if (ob.romance_style?.length) parts.push(`Romance style: ${ob.romance_style.join(', ')}.`);
  if (ob.attachment)  parts.push(`Attachment pattern: ${ob.attachment}.`);
  if (ob.intention)   parts.push(`Their intention in Eravos: ${ob.intention.slice(0,120)}.`);

  return base + (parts.length ? '\n\n[User context: ' + parts.join(' ') + ']' : '');
};

// Also add CSS for call reaction buttons
(function() {
  const s = document.createElement('style');
  s.textContent = `
    .call-react-btn {
      width:40px;height:40px;font-size:1.3rem;border-radius:50%;
      border:1px solid var(--border2);background:var(--glass);
      cursor:pointer;transition:transform .15s,border-color .15s;
      display:flex;align-items:center;justify-content:center;
    }
    .call-react-btn:hover { transform:scale(1.25);border-color:var(--fire); }
  `;
  document.head.appendChild(s);
})();

function _initSession() {
  _checkSessionResume();
  _checkDailyFeelingsCheckin();
}

// ── Inline animation for popup slide-in ──────────────────────────
(function _addSessionCSS() {
  const style = document.createElement('style');
  style.textContent = `
    @keyframes slideInRight {
      from { opacity:0; transform:translateX(60px) scale(.95); }
      to   { opacity:1; transform:translateX(0) scale(1); }
    }
    #partner-online-popup, #session-resume-popup {
      backdrop-filter: blur(12px);
    }
  `;
  document.head.appendChild(style);
})();

// ═══════════════════════════════════════════════════════════════════
// VOICE / VIDEO CALL ENGINE
// CALL TAB -- moved to tabs/call/call.js as part of the folder-per-tab
// split (Phase S, spec/PHASEMAP-v4.md). 33 real functions + 20 module-
// level state variables moved (_localStream/_activeCall/_pendingCall/
// _callType/CLARITY_CONFIG_URL and the rest, through startCall/answerCall/
// toggleScreenShare/toggleCallTranscription/callReconnectP2P). See that
// file's own header for the real extraction boundary -- showPartnerAIResponse()
// (below) looked like it belonged here but is a generic, cross-tab handler,
// confirmed by tracing its real caller before moving anything.

function showPartnerAIResponse(text, from) {
  // Create or update a floating partner response card
  let card = document.getElementById('partner-ai-card');
  if (!card) {
    card = document.createElement('div');
    card.id = 'partner-ai-card';
    card.style.cssText = 'position:fixed;bottom:80px;right:16px;max-width:320px;background:rgba(8,5,10,0.97);border:1px solid var(--border);border-radius:14px;padding:16px;z-index:500;box-shadow:0 0 30px rgba(255,106,0,0.15)';
    card.innerHTML = `<div style="display:flex;justify-content:space-between;margin-bottom:8px"><span style="font-family:var(--fm);font-size:.65rem;color:var(--fire)">✦ ${from||'PARTNER'} SAW</span><button onclick="this.parentElement.parentElement.remove()" style="background:none;border:none;color:var(--dim);cursor:pointer">✕</button></div><div id="partner-ai-text" style="font-size:.88rem;line-height:1.6;color:var(--text)"></div>`;
    document.body.appendChild(card);
  }
  document.getElementById('partner-ai-text').textContent = text;
  setTimeout(() => { if(card.parentNode) card.remove(); }, 30000);
}


// ═══════════════════════════════════════════════════════════════════
// EROS PIPELINE — offline-send outbox.
//
// Was referenced (ErosPipeline.push(payload)) from 5 call sites —
// love letters, needs, pokes, safety requests, feeling sync — as the
// fallback whenever sendP2P() returned false (partner offline), but was
// never actually defined anywhere in the codebase. Every one of those
// paths threw an uncaught ReferenceError instead of queuing anything,
// silently: the "Queued — will send when partner connects" toast never
// showed because the throw happened on the line before it, and the
// message was just lost. This is the real implementation.
//
// One queue per role (_userKey('outbox')), persisted immediately on
// push so a page reload doesn't lose it. Replayed in ts order on the
// next real P2P connection-open event (setupPeerConn's conn.on('open',
// ...) — see below), not polled. A send that still fails on replay
// (partner dropped again mid-replay) stops the replay for this round
// rather than burning through the rest of the queue against a channel
// that just proved it isn't open — the remainder stays queued for the
// next open.
// ═══════════════════════════════════════════════════════════════════
const ErosPipeline = {
  _key() { return _userKey('outbox'); },

  push(payload) {
    if (!payload || !payload.type) return;
    const q = DB.get(this._key(), []);
    q.push({ payload, queuedAt: Date.now() });
    DB.set(this._key(), q);
    log('Outbox: queued ' + payload.type + ' (' + q.length + ' pending)', 'info');
    this._renderBadge();
  },

  pending() {
    return DB.get(this._key(), []).length;
  },

  replay() {
    const q = DB.get(this._key(), []);
    if (!q.length) return;
    log('Outbox: replaying ' + q.length + ' queued message(s)', 'info');
    let i = 0;
    for (; i < q.length; i++) {
      const ok = sendP2P(q[i].payload);
      if (!ok) break; // connection dropped again mid-replay — stop, keep the rest queued
    }
    const remaining = q.slice(i);
    DB.set(this._key(), remaining);
    this._renderBadge();
    if (remaining.length < q.length) {
      showToast('📤 ' + (q.length - remaining.length) + ' queued message' + (q.length - remaining.length === 1 ? '' : 's') + ' sent');
    }
  },

  _renderBadge() {
    const el = document.getElementById('outbox-badge');
    if (!el) return;
    const n = this.pending();
    el.textContent = n;
    el.style.display = n > 0 ? 'inline-block' : 'none';
  },
};

// Serializes the async encrypt step so concurrent sendP2P() calls still
// hit the wire in call order — matters for §4.2(c) jointly-owned,
// append-only data, where "never overwritten by an older ts" assumes
// arrival order roughly tracks send order.
let _sendChain = Promise.resolve();

function _rawSend(wireData) {
  if (window.MESH?.connected && window.meshSend) {
    return window.meshSend(wireData);
  }
  return false;
}

function sendP2P(data) {
  const channelOpen = !!(window.MESH?.connected && window.meshSend);
  if (!channelOpen) {
    log('P2P: not connected (relay offline)', 'warn');
    return false;
  }
  // `hello` itself can never be encrypted — the pubkey exchange IS the
  // handshake that makes encryption possible afterward.
  const canEncrypt = _cryptoSession.ready && data.type !== 'presence:hello';
  if (!canEncrypt && data.type !== 'presence:hello' && window.EravosCrypto?.available) {
    log('[crypto] Sending ' + data.type + ' unencrypted — session key not ready yet', 'warn');
  }
  _sendChain = _sendChain.then(async () => {
    try {
      const wire = canEncrypt ? await window.EravosCrypto.encrypt(_cryptoSession.aesKey, data) : data;
      _rawSend(wire);
    } catch (e) {
      // Real, named limitation: if the channel drops in the gap between
      // the synchronous "channel open" check above and this async send
      // actually firing, the failure lands here instead of at the
      // emitSync() call site — so it can't be queued to ErosPipeline.
      // Narrow window (same-tick race), not solved by this file.
      log('P2P send failed after channel appeared open: ' + e.message, 'warn');
    }
  });
  return true; // Channel was open at call time — same simplification §4.4
               // already documents: "delivered" = accepted by the local
               // channel, not confirmed received by the partner.
}

function disconnectPartner() {
  _clearLivenessTimers();
  if (_sessionStartedAt) _recordConnectionEvent('manual');
  if (_mesh) { try { _mesh.close(); } catch(e){} _mesh = null; }
  window.MESH = { connected: false };
  _partnerOnline = false;
  if (peer) { try { peer.destroy(); } catch(e){} peer = null; } // calling transport — no partner to call in solo mode either
  updateRTCStatus('disconnected');
  rtcLog('Disconnected.');
}

// fallbackP2PConnect() removed — its only caller was initRTC's
// PeerJS-CDN-load-failure branch, which no longer exists (data sync no
// longer depends on any CDN load; native WebSocket needs nothing to
// load). Its own comment already documented that the fallback's sender
// side was never wired up in the first place.

function rtcLog(msg) {
  const els = [document.getElementById('rtc-log'), document.getElementById('rtc-log-spar'), document.getElementById('rtc-log-sys')];
  els.forEach(el => { if (el) el.textContent = msg; });
}

function updateRTCStatus(state) {
  const statusMap = {
    'connected': { text: '🟢 Connected to partner', color: 'var(--teal)' },
    'connecting': { text: '🟡 Connecting...', color: 'var(--amber)' },
    'ready': { text: '🟡 Waiting for partner...', color: 'var(--amber)' },
    'waiting': { text: '🟠 Partner offline, retrying...', color: 'var(--amber)' },
    'reconnecting': { text: '🟡 Reconnecting...', color: 'var(--amber)' },
    'disconnected': { text: '🔴 Disconnected', color: 'var(--rose)' },
    'error': { text: '🔴 Error, retrying...', color: 'var(--rose)' },
    'connected (local)': { text: '🟡 Local connection only', color: 'var(--amber)' }
  };
  const s = statusMap[state] || { text: state, color: 'var(--dim)' };
  const els = [document.getElementById('rtc-status'), document.getElementById('rtc-status-spar'), document.getElementById('p2p-settings-status')];
  els.forEach(el => { if (el) { el.textContent = s.text; el.style.color = s.color; } });
  // Update p2p dots
  const dotStatus = state === 'connected' ? 'ok' : (state === 'disconnected' || state === 'error') ? 'error' : 'pending';
  setDots('p2p', dotStatus);
}

// ── updateRTCStatus: drives header dot + all status elements ────────────────
const _callStatusPatch = updateRTCStatus;
updateRTCStatus = function(state) {
  _callStatusPatch(state);

  const states = {
    connected:           { dot:'var(--teal)',  glow:'0 0 8px var(--teal)',  label:'Partner online',    border:'rgba(0,229,204,.3)' },
    connecting:          { dot:'var(--amber)', glow:'0 0 6px var(--amber)', label:'Connecting…',       border:'rgba(255,179,71,.2)' },
    // Was called 'ready' with label "Waiting…", while a DIFFERENT state
    // (below) was called 'waiting' with label "Partner offline" — two
    // states with confusingly crossed names. This one fires the moment
    // THIS device's own peer registers with the signaling server, just
    // before it tries reaching the partner — genuinely a "reaching out"
    // moment, not a passive wait.
    reaching_out:        { dot:'var(--amber)', glow:'0 0 6px var(--amber)', label:'Reaching out to partner…', border:'rgba(255,179,71,.2)' },
    partner_offline:     { dot:'var(--amber)', glow:'0 0 6px var(--amber)', label:'Partner offline',   border:'rgba(255,179,71,.15)' },
    reconnecting:        { dot:'var(--amber)', glow:'0 0 6px var(--amber)', label:'Reconnecting…',     border:'rgba(255,179,71,.2)' },
    disconnected:        { dot:'var(--rose)',  glow:'0 0 5px var(--rose)',  label:'Disconnected',      border:'rgba(238,9,121,.15)' },
    error:               { dot:'var(--rose)',  glow:'0 0 5px var(--rose)',  label:'Error',             border:'rgba(238,9,121,.15)' },
    'connected (local)': { dot:'var(--amber)', glow:'0 0 6px var(--amber)', label:'Local only',        border:'rgba(255,179,71,.2)' },
  };
  const s = states[state] || { dot:'var(--dim)', glow:'none', label: state, border:'rgba(255,255,255,.06)' };

  // Header indicator
  const hDot   = document.getElementById('header-p2p-dot');
  const hLabel = document.getElementById('header-p2p-label');
  const hWrap  = document.getElementById('header-p2p-indicator');
  if (hDot)   { hDot.style.background  = s.dot;   hDot.style.boxShadow = s.glow; }
  if (hLabel) { hLabel.textContent = s.label; hLabel.style.color = s.dot; }
  if (hWrap)  { hWrap.style.borderColor = s.border; }

  // Partner Box status row — same s.label/s.dot the header pill just
  // used above, not a second independent computation of "are we
  // connected."
  const pbStatus = document.getElementById('partner-box-status');
  if (pbStatus) { pbStatus.textContent = s.label; pbStatus.style.color = s.dot; }

  // Settings display IDs
  const sDot    = document.getElementById('p2p-indicator-dot');
  const sStatus = document.getElementById('rtc-status');
  if (sDot)    { sDot.style.background = s.dot; sDot.style.boxShadow = s.glow; }
  if (sStatus) { sStatus.textContent = s.label.toUpperCase(); sStatus.style.color = s.dot; }

  // Sync display fields
  const myDisplay      = document.getElementById('my-room-code-display');
  const partnerDisplay = document.getElementById('partner-id-display');
  const myHidden       = document.getElementById('my-room-code');
  const partnerHidden  = document.getElementById('partner-room-code');
  if (myDisplay && myHidden)           myDisplay.textContent      = myHidden.value      || '—';
  if (partnerDisplay && partnerHidden) partnerDisplay.textContent = partnerHidden.value || '—';

  // Sync System tab -sys variants
  const sDotSys  = document.getElementById('p2p-indicator-dot-sys');
  const sStSys   = document.getElementById('rtc-status-sys');
  const myDisSys = document.getElementById('my-room-code-display-sys');
  const pDisSys  = document.getElementById('partner-id-display-sys');
  const logSys   = document.getElementById('rtc-log-sys');
  if (sDotSys) { sDotSys.style.background = s.dot; sDotSys.style.boxShadow = s.glow; }
  if (sStSys)  { sStSys.textContent = s.label.toUpperCase(); sStSys.style.color = s.dot; }
  if (myDisSys && myHidden)    myDisSys.textContent  = myHidden.value    || '—';
  if (pDisSys && partnerHidden) pDisSys.textContent  = partnerHidden.value || '—';

  // Call tab dot
  const dot = document.getElementById('call-p2p-dot');
  const txt = document.getElementById('call-p2p-status');
  if (dot) { dot.style.background = s.dot; dot.style.boxShadow = s.glow; }
  if (txt) txt.textContent = s.label;
};

// ── Heartbeat system (Guardian-style: pulse every 30s, heartbeat at 55s) ────
let _heartbeatInterval = null;
let _heartbeatHandshakeTs = 0;
const HB_PULSE_MS     = 30000;   // pulse every 30s
const HB_RENEW_MS     = 55000;   // renew token at 55s (before 60s TTL)
const HB_GUARDIAN_URL = () => DB.get('claude_bridge_url', null);

function _startHeartbeat() {
  if (_heartbeatInterval) clearInterval(_heartbeatInterval);
  _heartbeatHandshakeTs = Date.now();
  _heartbeatInterval = setInterval(() => {
    const now = Date.now();
    const guardianUrl = HB_GUARDIAN_URL();
    // Co-Creation presence ping
    if (window.MESH?.connected) {
      try { emitSync('presence:ping', {}, { queueOnFail: false }); } catch(_) {}
    }
    // Guardian heartbeat renewal
    if (guardianUrl && window.GuardianLink && _guardianConnected) {
      if (now - _heartbeatHandshakeTs >= HB_RENEW_MS) {
        fetch(guardianUrl + '/guardian/heartbeat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Guardian-Token': (_guardianToken||'') },
          body: JSON.stringify({ ts: now })
        }).then(r => r.ok && (_heartbeatHandshakeTs = now)).catch(() => {
          // If heartbeat fails, re-do full handshake
          if (window.GuardianLink) guardianHandshake(guardianUrl, true);
          _heartbeatHandshakeTs = now;
        });
      }
    }
  }, HB_PULSE_MS);
}

// _startHeartbeat() is now triggered directly from initMesh()'s auth_ok
// handler, above. It used to be wired via a wrapper around setupPeerConn
// (PeerJS DataConnection's 'open' event) — that function no longer
// exists, so the wrapper would have silently never fired again. Found
// by tracing why 'presence:ping' — which _startLivenessWatchdog's whole
// staleness check depends on — stopped firing at all once PeerJS was
// removed from the data path, not assumed still working.

// ── P2P SPARRING PANEL helpers (kept for compatibility) ──
// copyRoomCode() removed — no caller left once the manual room-code
// entry UI in tabs/sparring.html was replaced with implicit auto-connect
// (connection is peer-id-derived from role, never a code either of you
// types in; see getPeerIdForUser/getPartnerPeerIdForUser above).
// connectToPartnerSpar() moved to tabs/sparring/sparring.js — verified
// no cross-file callers (only sparring.html's own button).

// initRTC already populates both code fields (merged above)

// Theme-aware particle shim (runs after all functions defined)
window.addEventListener('DOMContentLoaded', function() {
  const _realCreate = createParticles;
  window.createParticles = function() {
    _realCreate();
  };
});

// ══════════════════════════════════════════════
// SEND LOVE — push to partner dashboard via P2P
// ══════════════════════════════════════════════
const LOVE_MESSAGES = [
  'You crossed my mind like starlight crosses dark water.',
  'In every version of every life, I would find you.',
  'You are seen. You are held. You are loved.',
  'The distance between us is just space — not separation.',
  'My heart just sent yours a signal.',
  'There is a warmth that lives exactly where you are.',
  'You matter to me in ways language keeps failing.',
  'Whatever you are carrying right now — you don\'t carry it alone.',
  'You are the most beautiful disruption I have ever known.',
  'I just wanted you to know I\'m thinking of you.'
];

function sendLove(customMsg) {
  const msg = customMsg || LOVE_MESSAGES[Math.floor(Math.random()*LOVE_MESSAGES.length)];
  // Was: checked window._dc / window._bc, two globals nothing in this
  // codebase ever assigns — this button has always shown "Connect to
  // Raven first" regardless of actual connection state. Now uses the
  // real pipeline (see the SYNC STREAM block's shadowing note for how
  // this was found).
  const sent = emitSync('love:sent', { message: msg });
  showToast(sent ? '💌 Love sent' : '📤 Love queued — will send when partner connects');
  // Also save to local log
  const sentLog = DB.get('eravors_love_sent', []);
  sentLog.unshift({ msg, ts: Date.now() });
  DB.set('eravors_love_sent', sentLog.slice(0,20));
}

// receiveLove() retired — superseded by the love:sent syncStream gate
// (SYNC STREAM block, earlier in this file), which was already the
// live receive path via the old handleP2PMessage. This function was
// never called from anywhere; kept out rather than left as dead code.

function showLoveBloom(msg, from) {
  // Remove existing
  const existing = document.getElementById('love-bloom');
  if (existing) existing.remove();

  const bloom = document.createElement('div');
  bloom.id = 'love-bloom';
  bloom.innerHTML = `
    <div class="love-bloom-inner">
      <div class="love-bloom-icon">💌</div>
      <div class="love-bloom-from">${from || 'James'} sent you love</div>
      <div class="love-bloom-msg">${msg}</div>
      <button class="btn p" onclick="document.getElementById('love-bloom').remove()" style="margin-top:16px;font-size:.75rem">Close ✕</button>
    </div>
  `;
  document.body.appendChild(bloom);
  setTimeout(() => { if(bloom.parentNode) bloom.style.opacity='0'; setTimeout(()=>bloom.remove(),600); }, 12000);
}

// ═══════════════════════════════════════════════════════════════════
// TOAST SYSTEM — was: every call creates a new fixed-position div at
// the exact same coordinates as every other toast, with no dedup and
// no stacking. Harmless when toasts are rare, but the mesh
// reconnect/presence cycle can fire the same message ("Partner
// offline"/"Co-Creation · Synced") repeatedly in a short window, and
// they'd all render directly on top of each other — illegible, not
// just untidy. Two real fixes, not one cosmetic one:
//   1. De-dupe: an identical message already showing just extends its
//      timer instead of stacking a second copy.
//   2. Stack: genuinely different simultaneous toasts get vertically
//      offset instead of overlapping.
// ═══════════════════════════════════════════════════════════════════
// _activeToasts hoisted to the top of the file -- see the note there.

function _restackToasts() {
  const gap = 8;
  let offset = 0;
  // Stack upward from the CSS-defined base position — last in the
  // array (most recent) stays at the base, older ones push up above it.
  for (let i = _activeToasts.length - 1; i >= 0; i--) {
    const { el } = _activeToasts[i];
    el.style.setProperty('--toast-stack-offset', offset + 'px');
    offset += el.offsetHeight + gap;
  }
}

function _dismissToast(entry) {
  const idx = _activeToasts.indexOf(entry);
  if (idx === -1) return;
  _activeToasts.splice(idx, 1);
  entry.el.style.opacity = '0';
  setTimeout(() => { entry.el.remove(); _restackToasts(); }, 400);
}

function showToast(msg) {
  // De-dupe: same message already on screen — refresh its timer rather
  // than stack an identical second one.
  const existing = _activeToasts.find(t => t.msg === msg);
  if (existing) {
    clearTimeout(existing.dismissTimer);
    existing.dismissTimer = setTimeout(() => _dismissToast(existing), 3000);
    return;
  }

  const t = document.createElement('div');
  t.className = 'eravors-toast';
  t.textContent = msg;
  document.body.appendChild(t);

  const entry = { el: t, msg, dismissTimer: null };
  _activeToasts.push(entry);
  _restackToasts();

  entry.dismissTimer = setTimeout(() => _dismissToast(entry), 3000);
}

// Extends the same toast system with an action button and a visible
// countdown, instead of a second, separate UI pattern. Used for spar
// match invites and rule proposals — anything shaped like "someone
// proposed X, you have N seconds to accept." Not accepting in time is
// not a decline; it just lapses (§ removes pressure to respond).
let _actionToastSeq = 0;
function showActionToast(msg, { acceptLabel = 'Accept', declineLabel = null, timeoutMs = 30000, onAccept, onDecline, onTimeout } = {}) {
  const id = 'action-toast-' + (++_actionToastSeq);
  const t = document.createElement('div');
  t.className = 'eravors-toast eravors-toast-action';
  t.id = id;
  const secsEl = 'toast-secs-' + id;
  t.innerHTML = `
    <div style="margin-bottom:8px">${msg}</div>
    <div class="flex gap8 ac">
      <button class="btn p" style="font-size:.72rem;padding:4px 12px" id="${id}-accept">${acceptLabel}</button>
      ${declineLabel ? `<button class="btn g" style="font-size:.72rem;padding:4px 12px" id="${id}-decline">${declineLabel}</button>` : ''}
      <span class="small" style="color:var(--dim)" id="${secsEl}">${Math.ceil(timeoutMs/1000)}s</span>
    </div>`;
  document.body.appendChild(t);

  let remaining = Math.ceil(timeoutMs / 1000);
  const tick = setInterval(() => {
    remaining--;
    const el = document.getElementById(secsEl);
    if (el) el.textContent = remaining + 's';
    if (remaining <= 0) finish('timeout');
  }, 1000);

  let done = false;
  function finish(outcome) {
    if (done) return;
    done = true;
    clearInterval(tick);
    if (t.parentNode) { t.style.opacity = '0'; setTimeout(() => t.remove(), 400); }
    if (outcome === 'accept' && onAccept) onAccept();
    if (outcome === 'decline' && onDecline) onDecline();
    if (outcome === 'timeout' && onTimeout) onTimeout();
  }

  const acceptBtn = document.getElementById(id + '-accept');
  if (acceptBtn) acceptBtn.onclick = () => finish('accept');
  const declineBtn = document.getElementById(id + '-decline');
  if (declineBtn) declineBtn.onclick = () => finish('decline');

  return { close: () => finish('timeout') };
}

function renderLoveInbox() {
  const el = document.getElementById('love-inbox-list');
  if (!el) return;
  const inbox = DB.get('eravors_love_inbox', []);
  if (!inbox.length) { el.innerHTML = '<div class="small" style="color:var(--dim);font-style:italic">No love messages yet...</div>'; return; }
  el.innerHTML = inbox.map(m => `
    <div class="love-inbox-item">
      <div class="love-inbox-msg">${m.message}</div>
      <div class="love-inbox-meta small">${m.from || 'James'} · ${new Date(m.ts).toLocaleString()}</div>
    </div>
  `).join('');
}


// sendSparToOracle() moved to tabs/sparring/sparring.js — verified no
// cross-file callers.

// setCouplesMode()/initCouplesToggle() removed along with the Duo Spar
// Mode Settings card (tabs/settings/subtabs/system.html) -- controlled
// whether solo spar prompts were duo-flavored. Solo mode itself is
// gone (Sparring rebuilt as just a chat window, no oracle, no prompt
// system -- a match's "reason" is user-typed during setup instead),
// so this had nothing left to affect.

// Solo spar functions removed entirely (SPAR_PROMPTS, getSparPrompt,
// setSparTimer, startSpar, pauseSpar, resetSpar, updateSparDisplay,
// updateSparCharCount, saveSparEntry, sendSparToPartner, clearSpar,
// connectToPartnerSpar, sendSparToOracle) -- tabs/sparring/sparring.js
// now only has the Duo Match chat system.


/* ==== next inline <script> block ==== */


// ═══════════════════════════════════════════════════════════════════
// DUO SPAR MATCH — turn-based, timed, real-time (§ requested: "like
// the button chess players hit" — throw words, hit send, partner has
// N seconds to answer and hit send, alternating until match time runs
// out). Cross-cutting/kernel-resident, not tab-owned: an invite has to
// be answerable and a turn has to land even if the person isn't
// currently looking at the Sparring tab — same reasoning as the poke
// pipeline (poke.contract.json) and the partner-online popup.
//
// Data model — one shared-shape match object, each device keeps its
// own local copy synced via the gates below (DB key
// 'eravors_spar_match'):
//   { id, status: 'inviting'|'active'|'ended', turnSeconds, matchSeconds,
//     promptType, prompt, startedAt, endsAt, players: [nameA, nameB],
//     currentTurnNum, currentTurnBy, currentTurnDeadline,
//     turns: [{turnNum, from, text, ts, autoSent}],
//     rules: [{id, text, proposedBy, acceptedAt}],
//     pendingProposals: [{id, text, proposedBy, expiresAt}],
//     proposedRuleTextsEver: [normalizedText, ...] }
//
// Honest limitation, not solved here: if both people propose a match
// at the exact same moment, both invites fire independently — whoever
// accepts first starts a match; the other invite just goes stale and
// times out harmlessly. Not handled as a special case; low-stakes for
// two people, not worth the complexity this pass.
// ═══════════════════════════════════════════════════════════════════

function _sparMatch() { return DB.get('eravors_spar_match', null); }
function _sparMatchSet(m) { DB.set('eravors_spar_match', m); }

let _sparWatchdogInterval = null;
function _sparStartWatchdog() {
  if (_sparWatchdogInterval) return;
  _sparWatchdogInterval = setInterval(_sparWatchdogTick, 1000);
}
function _sparStopWatchdog() {
  if (_sparWatchdogInterval) { clearInterval(_sparWatchdogInterval); _sparWatchdogInterval = null; }
}

function _archiveSparMatch(match) {
  const history = DB.get('eravors_spar_history', []);
  history.unshift({
    id: match.id,
    players: match.players,
    reason: match.reason || null,
    boundaries: match.boundaries || null,
    rules: (match.rules || []).map(r => r.text),
    turnCount: (match.turns || []).length,
    // Previously discarded here — turnCount was kept but the actual
    // words weren't, so a finished match's language was gone the
    // moment it archived (§0.3 "information must never be lost" /
    // §2.1 "persistence is the golden rule" — this was a real gap,
    // not a stylistic choice). Kept now, trimmed to what matters:
    // who said it and what was said, not the full turn-timing detail
    // that only mattered while the match was live.
    turns: (match.turns || []).map(t => ({ from: t.from, text: t.text, ts: t.ts })),
    endedReason: match.endedReason || 'time_up',
    endedAt: Date.now(),
  });
  DB.set('eravors_spar_history', history.slice(0, 100));
  if (typeof renderSparHistory === 'function') renderSparHistory();
  _latticeRefreshIfVisible();
  _promptSparReflection(match);
}

// ── End-of-spar reflection — rule-based, zero AI ─────────────────────
// Picks 1 question by priority order, cheapest/most-relevant signal
// first, entirely from data already on this device — no model call,
// per the spec's "AI comes last" non-negotiable and the explicit
// "no AI assistance yet" instruction this was built under. Every path
// has a real skip (§ nothing is forced) and "log this" seeds Growth's
// own form via the same growth:seed_requested event growthFromRupture
// already uses, rather than Sparring writing into Growth's storage
// directly (§5.9/§5.10 — sovereignty, interaction through contracts).
function _sparReflectionQuestion(match) {
  // 1. An unresolved rupture outranks everything — if one's open, the
  // spar just happened in its shadow whether it was named or not.
  const openRupture = (S.ruptures || []).find(r => r.status !== 'resolved');
  if (openRupture) {
    return { text: `There's still an open thread from "${(openRupture.what || '').slice(0, 70)}" — did any of that come up just now, even sideways?`, seedCat: 'conflict' };
  }
  // 2. Friction language in this exact match's own turns (reuses the
  // same LATTICE_FRICTION_WORDS/_latticeTokenize the lattice already
  // has — one detector, not a second copy of the word list).
  const ownTriggers = (typeof _triggerMap === 'function' ? _triggerMap() : []) || [];
  const matchText = (match.turns || []).map(t => t.text).join(' ');
  const frictionHit = typeof _latticeTokenize === 'function' && (match.turns || []).length
    ? _latticeTokenize(matchText).some(w => LATTICE_FRICTION_WORDS.has(w))
    : false;
  if (frictionHit && ownTriggers.length) {
    return { text: `Something in how that went land close to a place you've already mapped for yourself? No pressure to name which one.`, seedCat: 'emotional' };
  }
  if (frictionHit) {
    return { text: `That had some edge to it. Anything from it worth naming before it just... settles?`, seedCat: 'emotional' };
  }
  // 3. Recent growth cadence — reinforce it rather than starting cold.
  const recentGrowth = (S.growthLog || [])[0];
  const recentGrowthIsFresh = recentGrowth && (Date.now() - recentGrowth.ts) < 3 * 24 * 60 * 60 * 1000;
  if (recentGrowthIsFresh) {
    return { text: `You logged "${(recentGrowth.what || '').slice(0, 60)}" a few days ago — did that spar feel like more of that, or something different?`, seedCat: recentGrowth.cat || 'shared' };
  }
  // 4. Generic fallback — still specific to this match, not boilerplate.
  const turnCount = (match.turns || []).length;
  if (!turnCount) return null; // nothing was actually said (e.g. instant time-out) — nothing to reflect on
  return { text: `What's one thing from that spar you want to remember later?`, seedCat: 'shared' };
}

function _promptSparReflection(match) {
  const q = _sparReflectionQuestion(match);
  if (!q) return;
  const popup = document.createElement('div');
  popup.id = 'spar-reflection-popup'; popup.classList.add('ambient-popup');
  popup.dataset.what = q.text;
  popup.dataset.cat = q.seedCat;
  popup.innerHTML = `
    <div style="font-family:var(--fd);font-size:.85rem;color:var(--amber);margin-bottom:4px">⚔ After that spar…</div>
    <div class="small" style="line-height:1.6;margin-bottom:12px">${q.text}</div>
    <div style="display:flex;gap:8px">
      <button class="btn p" style="font-size:.76rem;flex:1" onclick="_logSparReflection()">📝 Say more</button>
      <button class="btn g" style="font-size:.76rem" onclick="document.getElementById('spar-reflection-popup').remove()">Not now</button>
    </div>`;
  popup.style.cssText = `position:fixed;bottom:${_ambientPopupBottom()}px;right:20px;z-index:9400;background:linear-gradient(160deg,rgba(22,11,18,.97),rgba(10,5,8,.99));border:1px solid rgba(255,106,0,.25);border-radius:16px;padding:16px 18px;width:min(320px,90vw);box-shadow:0 8px 32px rgba(0,0,0,.5);animation:slideInRight .35s cubic-bezier(.34,1.56,.64,1)`;
  document.body.appendChild(popup);
  setTimeout(() => { if (popup.parentNode) popup.remove(); }, 45000);
}

function _logSparReflection() {
  const el = document.getElementById('spar-reflection-popup');
  const what = el?.dataset.what || 'Reflection after a spar';
  const cat = el?.dataset.cat || 'connection';
  if (el) el.remove();
  // Same event Rupture's "log the growth from this" button emits —
  // Sparring doesn't reach into Growth's form/state directly.
  appStream.emit(new SEvent('growth:seed_requested', { what: 'After sparring: ' + what, why: '', cat }));
}

function _sparWatchdogTick() {
  const match = _sparMatch();
  if (!match || match.status !== 'active') { _sparStopWatchdog(); return; }
  const now = Date.now();
  if (now >= match.endsAt) {
    match.status = 'ended';
    match.endedReason = 'time_up';
    _sparMatchSet(match);
    _archiveSparMatch(match);
    emitSync('spar:match_end', { matchId: match.id, reason: 'time_up' }, { queueOnFail: false });
    _sparStopWatchdog();
    if (typeof renderSparMatch === 'function') renderSparMatch();
    showToast("⚔ Time's up — match ended");
    return;
  }
  if (match.currentTurnBy === S.user?.name && now >= match.currentTurnDeadline) {
    // My turn expired — no punishment, whatever was typed (or nothing)
    // auto-sends and the turn just passes.
    if (typeof sendSparTurn === 'function') {
      sendSparTurn(true);
    } else {
      // Sparring tab not mounted — can't read what they were typing.
      // Auto-pass with empty text rather than leaving the match stuck
      // waiting on someone who isn't looking at it.
      const turnRecord = { turnNum: match.currentTurnNum, from: S.user?.name, text: '', ts: now, autoSent: true };
      emitSync('spar:turn', { matchId: match.id, turnNum: turnRecord.turnNum, text: '', autoSent: true }, { queueOnFail: false });
      _sparApplyTurn(match, turnRecord);
    }
  }
  if (typeof renderSparMatch === 'function') renderSparMatch(); // keep the live countdown current
}

function _sparApplyTurn(match, turnRecord) {
  match.turns = match.turns || [];
  match.turns.push(turnRecord);
  const now = Date.now();
  if (now >= match.endsAt) {
    match.status = 'ended';
    match.endedReason = 'time_up';
  } else {
    const next = (match.players || []).find(p => p !== turnRecord.from) || turnRecord.from;
    match.currentTurnNum = turnRecord.turnNum + 1;
    match.currentTurnBy = next;
    match.currentTurnDeadline = Math.min(now + match.turnSeconds * 1000, match.endsAt);
  }
  _sparMatchSet(match);
  if (match.status === 'ended') _archiveSparMatch(match);
  if (typeof renderSparMatch === 'function') renderSparMatch();
  return match;
}

// proposeDuoSparMatch() moved to tabs/sparring/sparring.js — only
// triggered from that tab's own button, and uses SPAR_PROMPTS which
// lives there too now.

function respondToSparInvite(matchId, accept) {
  if (!accept) { emitSync('spar:match_decline', { matchId }, { queueOnFail: false }); return; }
  const invite = _sparMatch();
  if (!invite || invite.id !== matchId) return;
  // Was: jumped straight to an active, clock-running match on accept.
  // Now: a 'setup' stage first — reason, boundaries, rules — per direct
  // request ("loads the next set of options... rules, boundaries,
  // reason, etc."). The clock doesn't start until someone explicitly
  // starts it (startSparMatchClock below), so time spent in setup
  // doesn't eat into the match.
  _sparMatchSet({
    ...invite, status: 'setup',
    players: [invite.proposedBy, S.user?.name],
    reason: null, boundaries: null,
    turns: [], rules: [], pendingProposals: [], proposedRuleTextsEver: [],
  });
  emitSync('spar:match_accept', { matchId }, { queueOnFail: false });
  _gotoSparringTab();
  if (typeof renderSparMatch === 'function') renderSparMatch();
  showToast('⚔ Match accepted — set it up together');
}

// Both sides land on the Sparring tab once a match is accepted, rather
// than the accepter going there on their own action while the proposer
// has to remember to navigate over manually.
function _gotoSparringTab() {
  if (typeof eravosStampTab === 'function') {
    eravosStampTab('sparring').then(() => switchTab('sparring'));
  } else {
    switchTab('sparring');
  }
}

// Floating "Invite to Spar" button (persistent shell, index.html) —
// reachable from any tab, so this can't read the Sparring tab's own
// form fields (spar-duo-turn-secs/spar-duo-match-secs) the way
// proposeDuoSparMatch() does. Sensible defaults instead (10s/turn,
// 5 min match) — either partner can still propose a different match
// length from within the Sparring tab itself once there.
/** Real toggle, closes on: another click, an outside click, or picking
    any menu item (each item's onclick calls toggleSparFabMenu(false)
    itself before running its real action). */
function toggleSparFabMenu(force) {
  const menu = document.getElementById('partner-fab-menu');
  if (!menu) return;
  const open = typeof force === 'boolean' ? force : !menu.classList.contains('open');
  menu.classList.toggle('open', open);
  // always remove first -- avoids accumulating a new listener every
  // open if the previous close happened via the FAB button itself
  // rather than an outside click (the only path {once:true} alone
  // would have cleaned up on its own)
  document.removeEventListener('click', _sparFabMenuOutsideClick);
  if (open) {
    setTimeout(() => {
      document.addEventListener('click', _sparFabMenuOutsideClick);
    }, 0);
  }
}
function _sparFabMenuOutsideClick(e) {
  const wrap = document.getElementById('partner-fab-wrap');
  if (wrap && !wrap.contains(e.target)) toggleSparFabMenu(false);
}

/** Real, centralized gate for every partner-facing FAB action. Direct
    request: the FAB is now visible in solo mode too (discoverable
    before pairing, not just after), so each item needs its own real
    answer to "what happens if I'm not actually paired yet" -- the
    same pattern already used for the CO-CREATE button (requestModeSwitch),
    reused here rather than reimplemented per-item. */
function _fabRequirePartner(action) {
  toggleSparFabMenu(false);
  if (window.eravosPairing && eravosPairing.state().paired) {
    action();
  } else if (typeof openInvitePartner === 'function') {
    openInvitePartner();
  }
}

function fabInviteToSpar() {
  const existing = _sparMatch();
  if (existing && existing.status !== 'ended') {
    // Already have a match going (or pending) — go straight there
    // instead of stepping on it with a second invite.
    _gotoSparringTab();
    return;
  }
  const matchId = 'sparmatch_' + Date.now();
  const turnSeconds = 10, matchSeconds = 300;
  const sent = emitSync('spar:match_invite', { matchId, turnSeconds, matchSeconds }, { queueOnFail: false });
  if (!sent) { showToast('⚠ Partner not connected'); return; }
  _sparMatchSet({ id: matchId, status: 'inviting', turnSeconds, matchSeconds, proposedBy: S.user?.name });
  _gotoSparringTab();
  showToast('⚔ Invite sent — waiting for them to accept');
}

syncStream.register(new (class extends Gate {
  constructor() { super('spar:match_invite'); }
  transform(ev) {
    const { matchId, turnSeconds, matchSeconds } = ev.data;
    _sparMatchSet({ id: matchId, status: 'inviting', turnSeconds, matchSeconds, proposedBy: ev.from });
    if (typeof renderSparMatch === 'function') renderSparMatch();
    showActionToast(`⚔ ${ev.from || 'Partner'} wants to spar — ${matchSeconds}s match, ${turnSeconds}s per turn`, {
      acceptLabel: '⚔ Accept',
      timeoutMs: 30000,
      onAccept: () => respondToSparInvite(matchId, true),
      onTimeout: () => respondToSparInvite(matchId, false),
    });
  }
})());

syncStream.register(new (class extends Gate {
  constructor() { super('spar:match_accept'); }
  transform(ev) {
    const match = _sparMatch();
    if (!match || match.id !== ev.data.matchId || match.status !== 'inviting') return;
    _sparMatchSet({
      ...match, status: 'setup',
      players: [S.user?.name, ev.from],
      reason: null, boundaries: null,
      turns: [], rules: [], pendingProposals: [], proposedRuleTextsEver: [],
    });
    _gotoSparringTab();
    if (typeof renderSparMatch === 'function') renderSparMatch();
    showToast('⚔ Accepted — set it up together');
  }
})());

// Setup-stage shared fields (reason/boundaries) — simple last-write-wins
// sync, not the formal propose/accept ritual rules use. A boundary or
// reason someone states doesn't need the other person to formally
// ratify it the way an in-session rule change does.
function updateSparSetup(reason, boundaries) {
  const match = _sparMatch();
  if (!match || match.status !== 'setup') return;
  match.reason = reason;
  match.boundaries = boundaries;
  _sparMatchSet(match);
  emitSync('spar:setup_updated', { matchId: match.id, reason, boundaries }, { queueOnFail: false });
  if (typeof renderSparMatch === 'function') renderSparMatch();
}

syncStream.register(new (class extends Gate {
  constructor() { super('spar:setup_updated'); }
  transform(ev) {
    const match = _sparMatch();
    if (!match || match.id !== ev.data.matchId) return;
    match.reason = ev.data.reason;
    match.boundaries = ev.data.boundaries;
    _sparMatchSet(match);
    if (typeof renderSparMatch === 'function') renderSparMatch();
  }
})());

// Either partner can start the clock once setup feels done. Computed
// once, by whoever clicks Start, and sent to the other side — so both
// devices use the identical startedAt/endsAt/deadline rather than each
// independently computing its own (avoiding clock skew between the two
// devices' local clocks).
function startSparMatchClock() {
  const match = _sparMatch();
  if (!match || match.status !== 'setup') return;
  const startedAt = Date.now();
  const endsAt = startedAt + match.matchSeconds * 1000;
  const currentTurnDeadline = startedAt + match.turnSeconds * 1000;
  match.status = 'active';
  match.startedAt = startedAt;
  match.endsAt = endsAt;
  match.currentTurnNum = 1;
  match.currentTurnBy = match.players[0]; // whoever's listed first goes first — arbitrary but deterministic, same on both sides
  match.currentTurnDeadline = currentTurnDeadline;
  _sparMatchSet(match);
  emitSync('spar:match_start', { matchId: match.id, startedAt, endsAt, currentTurnDeadline, currentTurnBy: match.currentTurnBy });
  _sparStartWatchdog();
  if (typeof renderSparMatch === 'function') renderSparMatch();
  showToast('⚔ Match started' + (match.currentTurnBy === S.user?.name ? ' — your turn first' : ' — their turn first'));
}

syncStream.register(new (class extends Gate {
  constructor() { super('spar:match_start'); }
  transform(ev) {
    const match = _sparMatch();
    if (!match || match.id !== ev.data.matchId || match.status !== 'setup') return;
    match.status = 'active';
    match.startedAt = ev.data.startedAt;
    match.endsAt = ev.data.endsAt;
    match.currentTurnNum = 1;
    match.currentTurnBy = ev.data.currentTurnBy;
    match.currentTurnDeadline = ev.data.currentTurnDeadline;
    _sparMatchSet(match);
    _sparStartWatchdog();
    if (typeof renderSparMatch === 'function') renderSparMatch();
    showToast('⚔ Match started' + (match.currentTurnBy === S.user?.name ? ' — your turn first' : ' — their turn first'));
  }
})());

syncStream.register(new (class extends Gate {
  constructor() { super('spar:match_decline'); }
  transform(ev) {
    const match = _sparMatch();
    if (match && match.id === ev.data.matchId && match.status === 'inviting') {
      _sparMatchSet(null);
      if (typeof renderSparMatch === 'function') renderSparMatch();
      showToast('Match declined');
    }
  }
})());

syncStream.register(new (class extends Gate {
  constructor() { super('spar:turn'); }
  transform(ev) {
    let match = _sparMatch();
    if (!match || match.id !== ev.data.matchId || match.status !== 'active') return; // stale/unknown match — residue-safe, not an error
    match = _sparApplyTurn(match, { turnNum: ev.data.turnNum, from: ev.from, text: ev.data.text, ts: ev.ts, autoSent: !!ev.data.autoSent });
    if (match.status === 'ended') {
      emitSync('spar:match_end', { matchId: match.id, reason: 'time_up' }, { queueOnFail: false });
      _sparStopWatchdog();
      showToast('⚔ Match ended');
    } else {
      showToast('⚔ Your turn!');
    }
  }
})());

syncStream.register(new (class extends Gate {
  constructor() { super('spar:match_end'); }
  transform(ev) {
    const match = _sparMatch();
    if (match && match.id === ev.data.matchId && match.status !== 'ended') {
      match.status = 'ended';
      match.endedReason = ev.data.reason || 'time_up';
      _sparMatchSet(match);
      _archiveSparMatch(match);
      _sparStopWatchdog();
      if (typeof renderSparMatch === 'function') renderSparMatch();
      showToast('⚔ Match ended');
    }
  }
})());

// proposeSparRule() moved to tabs/sparring/sparring.js — only
// triggered from that tab's own rule-propose input/button.

function respondToSparRuleProposal(matchId, ruleId, accepted) {
  const match = _sparMatch();
  if (!match || match.id !== matchId) return;
  const proposal = (match.pendingProposals || []).find(p => p.id === ruleId);
  match.pendingProposals = (match.pendingProposals || []).filter(p => p.id !== ruleId);
  if (accepted && proposal) {
    match.rules = (match.rules || []).concat([{ id: ruleId, text: proposal.text, proposedBy: proposal.proposedBy, acceptedAt: Date.now() }]);
    emitSync('spar:rule_accept', { matchId, ruleId }, { queueOnFail: false });
  }
  _sparMatchSet(match);
  if (typeof renderSparMatch === 'function') renderSparMatch();
  showToast(accepted ? '✓ Rule added' : 'Rule proposal expired');
}

syncStream.register(new (class extends Gate {
  constructor() { super('spar:rule_propose'); }
  transform(ev) {
    const match = _sparMatch();
    if (!match || match.id !== ev.data.matchId) return;
    const { ruleId, text, expiresAt } = ev.data;
    const norm = text.toLowerCase();
    if ((match.proposedRuleTextsEver || []).includes(norm)) return; // already covered this match — don't re-surface it
    match.proposedRuleTextsEver = (match.proposedRuleTextsEver || []).concat([norm]);
    match.pendingProposals = (match.pendingProposals || []).concat([{ id: ruleId, text, proposedBy: ev.from, expiresAt }]);
    _sparMatchSet(match);
    if (typeof renderSparMatch === 'function') renderSparMatch();
    showActionToast(`📜 ${ev.from || 'Partner'} proposes a rule: "${text}"`, {
      acceptLabel: '✓ Accept',
      timeoutMs: Math.max(1000, expiresAt - Date.now()),
      onAccept: () => respondToSparRuleProposal(match.id, ruleId, true),
      onTimeout: () => respondToSparRuleProposal(match.id, ruleId, false),
    });
  }
})());

syncStream.register(new (class extends Gate {
  constructor() { super('spar:rule_accept'); }
  transform(ev) {
    const match = _sparMatch();
    if (!match || match.id !== ev.data.matchId) return;
    const proposal = (match.pendingProposals || []).find(p => p.id === ev.data.ruleId);
    match.pendingProposals = (match.pendingProposals || []).filter(p => p.id !== ev.data.ruleId);
    if (proposal) {
      match.rules = (match.rules || []).concat([{ id: ev.data.ruleId, text: proposal.text, proposedBy: proposal.proposedBy, acceptedAt: Date.now() }]);
    }
    _sparMatchSet(match);
    if (typeof renderSparMatch === 'function') renderSparMatch();
    showToast('✓ Your rule was accepted');
  }
})());

// Resume the watchdog if a match was already active across a page
// reload (match state persists in DB; the setInterval does not).
(function _sparResumeWatchdogOnBoot() {
  const m = _sparMatch();
  if (m && m.status === 'active') _sparStartWatchdog();
})();

// clearSpar() and renderSparHistory() live in tabs/sparring/sparring.js
// only — found and removed a leftover duplicate pair here from the
// earlier Sparring split (the deletion that moved the rest of the solo
// spar engine didn't reach these two, since the new Duo Spar Match
// block got inserted between them at the time). Byte-identical to the
// sparring.js copies, so no behavior changed, but it's exactly the
// "two copies waiting to drift" shape the codebase's own principles
// warn against — caught before anyone edited one without the other.

// ═══════════════════════════════════════════════════════════════════
// TRIGGERS — trauma-aware activation map + real-time hold-to-signal.
// Phase 2 (03-FEATURE-SPECS.md §Triggers, 02-DATA-SCHEMAS.md
// TriggerMapEntry/TriggeredSignal). Cross-cutting/kernel-resident:
// receiving a TriggeredSignal has to interrupt regardless of which tab
// is open, same reasoning as Urgent poke — this is explicitly NOT the
// alarm-red Urgent-poke treatment though (§ spec: "activation calls for
// calm, not alarm"), so it gets its own soft overlay, not a reuse of
// showUrgentPoke()'s styling.
//
// Storage: <role>_trigger_map (personal, full list incl. unshared
// entries) via _userKey(); eravors_partner_trigger_map_shared (this
// device's cached view of the partner's *shared* entries only, kept in
// sync via the trigger:shared_entry / trigger:unshare gates below).
// ═══════════════════════════════════════════════════════════════════

function _triggerMap() { return DB.get(_userKey('trigger_map'), []); }
function _triggerMapSet(list) { DB.set(_userKey('trigger_map'), list); }
function _partnerTriggerMap() { return DB.get('eravors_partner_trigger_map_shared', []); }

syncStream.register(new (class extends Gate {
  constructor() { super('trigger:shared_entry'); }
  transform(ev) {
    const entry = ev.data.entry;
    if (!entry || !entry.id) return;
    let list = _partnerTriggerMap().filter(e => e.id !== entry.id);
    list.push({ ...entry, from: ev.from });
    DB.set('eravors_partner_trigger_map_shared', list);
    if (typeof renderPartnerTriggerMap === 'function') renderPartnerTriggerMap();
    _latticeRefreshIfVisible();
  }
})());

syncStream.register(new (class extends Gate {
  constructor() { super('trigger:unshare'); }
  transform(ev) {
    const list = _partnerTriggerMap().filter(e => e.id !== ev.data.id);
    DB.set('eravors_partner_trigger_map_shared', list);
    if (typeof renderPartnerTriggerMap === 'function') renderPartnerTriggerMap();
  }
})());

syncStream.register(new (class extends Gate {
  constructor() { super('triggered:signal'); }
  transform(ev) {
    showTriggeredOverlay({
      from: ev.from,
      ts: ev.ts,
      holdDurationMs: ev.data.hold_duration_ms,
      linkedEntry: ev.data.linked_map_entry_id
        ? _partnerTriggerMap().find(e => e.id === ev.data.linked_map_entry_id)
        : null,
    });
  }
})());

function _triggeredGenericText() {
  return DB.get('eravors_triggered_generic_text', null) ||
    "This isn't about fixing it in this moment. Presence, patience, and no pressure to explain yet — that's usually the whole ask.";
}

function showTriggeredOverlay(signal) {
  const old = document.getElementById('triggered-overlay');
  if (old) old.remove();
  const div = document.createElement('div');
  div.id = 'triggered-overlay';
  div.className = 'triggered-overlay';
  const entry = signal.linkedEntry;
  div.innerHTML = `
    <div class="triggered-box">
      <div style="font-size:2.2rem;margin-bottom:14px">🌊</div>
      <div style="font-family:var(--fm);font-size:.65rem;letter-spacing:.2em;color:var(--teal);margin-bottom:10px">${(signal.from || 'PARTNER').toUpperCase()} IS ACTIVATED RIGHT NOW</div>
      ${entry ? `
        <div style="text-align:left;margin-bottom:16px">
          <div class="small" style="color:var(--dim);margin-bottom:4px">${entry.label || ''}</div>
          ${entry.how_to_hold_me ? `<div style="font-size:1rem;line-height:1.7;margin-bottom:10px">${entry.how_to_hold_me}</div>` : ''}
          ${entry.what_not_to_do ? `<div class="small" style="color:var(--rose)">Avoid: ${entry.what_not_to_do}</div>` : ''}
        </div>` : `
        <div style="font-size:1rem;line-height:1.8;margin-bottom:16px;font-style:italic">${_triggeredGenericText()}</div>`}
      <button class="btn p" style="width:100%" onclick="document.getElementById('triggered-overlay').remove()">I'm here</button>
    </div>`;
  document.body.appendChild(div);
  if (navigator.vibrate) navigator.vibrate([150, 80, 150]);
}

// ═══════════════════════════════════════════════════════════════════
// RELATIONAL MIRROR — solutions-oriented reflection. 02-DATA-SCHEMAS.md
// "RelationalMirror". Deliberately not a tab (§16.4 — "a question, not
// a new noun in the system"): a shared modal (#mirror-modal, persistent
// shell) invoked as an optional final step from two different places —
// the Guided Feeling Flow's express path (gffComplete, above) and
// Rupture repair (cycleRuptureStatus/markRuptureResolved, above) — so
// it has to be cross-cutting/kernel-resident, reachable from both
// regardless of which tab either flow happens to be running in.
//
// Ownership shape (b), "mirrored": the question is personal, but once
// an answer is sent with visibility:"shared", it becomes visible to
// the partner it's about. Storage: <role>_relational_mirror_log (own
// full log, private+shared entries both); eravors_partner_mirror_received
// (this device's cached view of the partner's *shared* entries, same
// pattern as Triggers' partner-shared cache).
// ═══════════════════════════════════════════════════════════════════

function _mirrorLog() { return DB.get(_userKey('relational_mirror_log'), []); }
function _mirrorLogSet(list) { DB.set(_userKey('relational_mirror_log'), list); }
function _partnerMirrorReceived() { return DB.get('eravors_partner_mirror_received', []); }

function openRelationalMirrorPrompt(sourceType, sourceId) {
  window._pendingMirrorSource = { type: sourceType, id: sourceId };
  const el = document.getElementById('mirror-q1');
  const el2 = document.getElementById('mirror-q2');
  if (el) el.value = '';
  if (el2) el2.value = '';
  const modal = document.getElementById('mirror-modal');
  if (modal) modal.classList.add('open');
}

function closeRelationalMirrorPrompt() {
  const modal = document.getElementById('mirror-modal');
  if (modal) modal.classList.remove('open');
  window._pendingMirrorSource = null;
}

function skipRelationalMirrorPrompt() {
  closeRelationalMirrorPrompt();
}

function submitRelationalMirror(shared) {
  const source = window._pendingMirrorSource;
  if (!source) return;
  const q1 = document.getElementById('mirror-q1')?.value.trim() || null;
  const q2 = document.getElementById('mirror-q2')?.value.trim() || null;
  if (!q1 && !q2) { closeRelationalMirrorPrompt(); return; } // both left blank — same as skipping

  const entry = {
    id: 'mirror_' + Date.now(),
    user_id: S.user?.name || 'me',
    ts: Date.now(),
    source,
    what_could_help_next_time: q1,
    what_would_have_helped_then: q2,
    visibility: shared ? 'shared' : 'private',
    acknowledged_by_partner: false,
  };
  _mirrorLogSet(_mirrorLog().concat([entry]));

  if (shared) {
    const sent = emitSync('mirror:shared', { entry });
    showToast(sent ? '💗 Shared with your partner' : '📤 Queued — will send when connected');
  } else {
    showToast('🔒 Kept private');
  }
  closeRelationalMirrorPrompt();
}

function acknowledgeMirror(id) {
  const list = _partnerMirrorReceived();
  const entry = list.find(e => e.id === id);
  if (!entry) return;
  entry.acknowledged_by_partner = true;
  DB.set('eravors_partner_mirror_received', list);
  emitSync('mirror:acknowledged', { id }, { queueOnFail: false });
  if (typeof renderPartnerMirrors === 'function') renderPartnerMirrors();
  showToast('💗 Acknowledged — they\'ll see you received it');
}

syncStream.register(new (class extends Gate {
  constructor() { super('mirror:shared'); }
  transform(ev) {
    const entry = ev.data.entry;
    if (!entry || !entry.id) return;
    const list = _partnerMirrorReceived().filter(e => e.id !== entry.id);
    list.unshift({ ...entry, from: ev.from });
    DB.set('eravors_partner_mirror_received', list);
    if (typeof renderPartnerMirrors === 'function') renderPartnerMirrors();
    showToast('💗 ' + (ev.from || 'Partner') + ' shared a reflection with you');
  }
})());

syncStream.register(new (class extends Gate {
  constructor() { super('mirror:acknowledged'); }
  transform(ev) {
    const list = _mirrorLog();
    const entry = list.find(e => e.id === ev.data.id);
    if (entry) { entry.acknowledged_by_partner = true; _mirrorLogSet(list); }
    showToast((ev.from || 'Partner') + ' saw your reflection — witnessed, not necessarily resolved');
  }
})());


// showToast defined above

// ═══════════════════════════════════════════════════════════════════
// OLLAMA BRIDGE CODE ACTIVATION  (mirrors data pipeline pattern)
// ═══════════════════════════════════════════════════════════════════

window.activateOllamaCode = async function() {
  const code = (document.getElementById('ollama-code-input')?.value || '').trim().toUpperCase();
  const statusEl  = document.getElementById('ollama-code-status');
  const activeEl  = document.getElementById('ollama-active-info');
  const modelEl   = document.getElementById('ollama-active-model');
  const badge     = document.getElementById('ai-engine-ollama-badge');

  if (!code) {
    if (statusEl) { statusEl.textContent = 'Enter an endpoint code first.'; statusEl.style.color = 'var(--rose)'; }
    return;
  }
  if (statusEl) { statusEl.textContent = 'Connecting…'; statusEl.style.color = 'var(--cyan)'; }

  try {
    await OllamaBridge.connect(code);

    // Connection opened — wait briefly for models to arrive
    await new Promise(r => setTimeout(r, 1200));

    const models  = OllamaClient.getModels();
    const model   = OllamaClient.getModel() || (models[0]?.name || models[0] || '');
    if (model) OllamaClient.setModel(model);

    // Persist
    DB.set('eravors_ollama_code', code);
    DB.set('eravors_ollama_model', model);

    if (statusEl) { statusEl.textContent = '✓ Ollama connected'; statusEl.style.color = 'var(--teal)'; }
    if (activeEl) activeEl.style.display = 'block';
    if (modelEl)  modelEl.textContent = model || 'Connected — no model yet';
    if (badge)    { badge.style.display = 'inline'; badge.textContent = '⚡ ' + (model || 'Ollama'); }

    // Populate model dropdown
    _restoreOllamaModelDropdown(models);

    log('Ollama connected: ' + (model || code), 'ok');
    showToast('⚡ Ollama connected' + (model ? ': ' + model : ''));

  } catch(e) {
    if (statusEl) { statusEl.textContent = '✗ ' + e.message; statusEl.style.color = 'var(--rose)'; }
    log('Ollama connect failed: ' + e.message, 'error');
  }
};

window.clearOllamaCode = function() {
  OllamaBridge.disconnect();
  DB.set('eravors_ollama_code', '');
  DB.set('eravors_ollama_model', '');

  const inp      = document.getElementById('ollama-code-input');
  const statusEl = document.getElementById('ollama-code-status');
  const activeEl = document.getElementById('ollama-active-info');
  const badge    = document.getElementById('ai-engine-ollama-badge');

  if (inp)      inp.value = '';
  if (statusEl) { statusEl.textContent = 'Disconnected.'; statusEl.style.color = 'var(--dim)'; }
  if (activeEl) activeEl.style.display = 'none';
  if (badge)    badge.style.display = 'none';
  showToast('Ollama disconnected');
};

function _restoreOllamaModelDropdown(models) {
  const modelEl = document.getElementById('ollama-active-model');
  const model   = OllamaClient.getModel();
  if (modelEl && model) modelEl.textContent = model;
  const sel = document.getElementById('ollama-model-select');
  if (sel) {
    sel.innerHTML = (models || []).map(m => {
      const name = m.name || m;
      return `<option value="${name}"${name === model ? ' selected' : ''}>${name}</option>`;
    }).join('');
    sel.style.display = (models && models.length) ? '' : 'none';
  }
}

// setOllamaModel() and the auto-restore-on-load IIFE that used to live
// here were removed along with the Ollama Bridge UI in ai.html --
// every element they referenced (ollama-code-input, ollama-active-info,
// ollama-code-status, ollama-active-model) is confirmed gone. See the
// real Clear-Glass AI Bridge integration instead (_callViaAiBridge(),
// checkAiBridgeStatus()).

// ── Data pipeline restore (was lost from original) ────────────────
(function restorePipelineCode() {
  const code = DB.get('eros_pipeline_code', '') || DB.get('eravors_pipeline_code', '');
  const name = DB.get('eros_pipeline_name', '') || DB.get('eravors_pipeline_name', '');
  if (!code) return;
  const inp      = document.getElementById('pipeline-code-input');
  const activeEl = document.getElementById('pipeline-active-info');
  const nameEl   = document.getElementById('pipeline-active-name');
  if (inp)      inp.value = code;
  if (activeEl) activeEl.style.display = 'block';
  if (nameEl)   nameEl.textContent = name || code;
})();

window.activatePipelineCode = async function() {
  const code     = (document.getElementById('pipeline-code-input')?.value || '').trim().toUpperCase();
  const statusEl = document.getElementById('pipeline-code-status');
  const activeEl = document.getElementById('pipeline-active-info');
  const nameEl   = document.getElementById('pipeline-active-name');
  if (!code) { if(statusEl){statusEl.textContent='Enter a pipeline code first.';statusEl.style.color='var(--rose)';}return; }
  if(statusEl){statusEl.textContent='Verifying…';statusEl.style.color='var(--cyan)';}
  try {
    const r = await fetch('/api/pipeline/activate', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({code})
    });
    const j = await r.json();
    if (j.ok) {
      DB.set('eravors_pipeline_code', code);
      DB.set('eravors_pipeline_name', j.name || code);
      if(statusEl){statusEl.textContent='✓ Pipeline activated';statusEl.style.color='var(--teal)';}
      if(activeEl) activeEl.style.display='block';
      if(nameEl)   nameEl.textContent = j.name || code;
      log('Pipeline activated: '+(j.name||code), 'ok');
    } else {
      if(statusEl){statusEl.textContent='✗ Invalid code: '+(j.error||'rejected');statusEl.style.color='var(--rose)';}
    }
  } catch(e) {
    if(statusEl){statusEl.textContent='✗ Server error: '+e.message;statusEl.style.color='var(--rose)';}
  }
};

window.clearPipelineCode = function() {
  DB.set('eravors_pipeline_code', '');
  DB.set('eravors_pipeline_name', '');
  const inp      = document.getElementById('pipeline-code-input');
  const statusEl = document.getElementById('pipeline-code-status');
  const activeEl = document.getElementById('pipeline-active-info');
  if(inp)      inp.value = '';
  if(statusEl){statusEl.textContent='Pipeline cleared.';statusEl.style.color='var(--dim)';}
  if(activeEl) activeEl.style.display='none';
};

// ── Cache clear UI ────────────────────────────────────────────────
window.erosClearCacheUI = function() {
  const st = document.getElementById('sw-cache-status');
  if (st) st.textContent = 'Clearing…';
  if (typeof window.erosClearCache === 'function') {
    window.erosClearCache();
  } else if ('caches' in window) {
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k.startsWith('eravos-') || k.startsWith('eros-')).map(k => caches.delete(k)))
    ).then(() => { if (st) st.textContent = '✓ Cache cleared — reload to apply'; });
  } else {
    if (st) st.textContent = 'Cache API not available';
  }
  setTimeout(() => { if (st && st.textContent === 'Clearing…') st.textContent = '✓ Done'; }, 1600);
  setTimeout(() => { if (st) st.textContent = ''; }, 5000);
};



// ═══════════════════════════════════════════════════════════════════
// MESSAGING & COMMUNICATION ENGINE
// Full P2P-wired, inbox, vault-integrated, feeling-aware
// ═══════════════════════════════════════════════════════════════════

// ── State ──────────────────────────────────────────────────────────
let _msgType = 'text';
let _msgAckTimer = null;
let _inboxFilter = 'all';
let _pokeCustomMsg = '';

// ── Message type selector ──────────────────────────────────────────
function setMsgType(type) {
  _msgType = type;
  document.querySelectorAll('.msg-type-btn').forEach(b => b.classList.remove('active'));
  const btn = document.getElementById('msgtype-' + type);
  if (btn) btn.classList.add('active');

  const hints = {
    text:    "A message that arrives with space. Your partner can't reply for 10 minutes — this is for receiving, not reacting.",
    love:    "A love letter. Arrives as a full-screen bloom. Automatically saved to the Vault for both of you.",
    feeling: "Share your current feeling directly. It will arrive with context and land with care.",
    need:    "Express a need. Arrives as a need card your partner can respond to gently.",
    poem:    "A poem — written by you or generated by the Oracle. Arrives formatted, beautiful."
  };
  const hint = document.getElementById('msg-type-hint');
  if (hint) hint.textContent = hints[type] || '';

  const feelingAttach = document.getElementById('msg-feeling-attach');
  if (feelingAttach) feelingAttach.style.display = (type === 'feeling') ? 'block' : 'none';

  const oracleTools = document.getElementById('msg-oracle-tools');
  if (oracleTools) oracleTools.style.display = (type === 'love' || type === 'poem') ? 'block' : 'none';

  const label = document.getElementById('msg-compose-label');
  const labels = { text:'Your message', love:'Your love letter', feeling:'Any words to add (optional)', need:'What you need', poem:'Your poem' };
  if (label) label.textContent = labels[type] || 'Your message';

  const ta = document.getElementById('msg-compose');
  const placeholders = {
    text:    'Write from your heart. This will arrive with space and care...',
    love:    'My love... (or let the Oracle write it for you)',
    feeling: 'Any words to accompany this feeling... (optional)',
    need:    'What do you need right now?',
    poem:    'Begin your poem... (or let the Oracle write it for you)'
  };
  if (ta) ta.placeholder = placeholders[type] || '';

  // Update feeling preview
  updateMsgFeelingPreview();
}

function updateMsgFeelingPreview() {
  const el = document.getElementById('msg-feeling-preview');
  if (!el) return;
  if (S.feeling && S.feeling.name) {
    el.textContent = `${S.feeling.emoji || ''} ${S.feeling.name} (${S.feeling.intensity}/10)`;
    el.style.color = S.feeling.color || 'var(--amber)';
  } else {
    el.textContent = '— no feeling set —';
    el.style.color = 'var(--dim)';
  }
  // Also update needs panel feeling display
  const needFeel = document.getElementById('need-feeling-display');
  if (needFeel) {
    needFeel.textContent = (S.feeling && S.feeling.name)
      ? `${S.feeling.emoji || ''} ${S.feeling.name} (${S.feeling.intensity}/10)`
      : '— no feeling set —';
    needFeel.style.color = (S.feeling && S.feeling.name) ? (S.feeling.color || 'var(--amber)') : 'var(--dim)';
  }
}

// ── Oracle generators ──────────────────────────────────────────────
// These used to write a finished letter/poem/affirmation directly into
// msg-compose — so what your partner received was the Oracle's words
// wearing your name. Now they coach: they teach structure and technique
// in a separate guidance panel, with at most one short labeled example
// fragment, and leave the actual compose box for your own words.

function _showOracleGuidance(text) {
  const el = document.getElementById('msg-oracle-guidance');
  if (el) { el.style.display = 'block'; el.textContent = text; }
}

async function generateLoveLetter() {
  const status = document.getElementById('msg-oracle-generating');
  if (status) { status.style.display = 'block'; status.textContent = '✦ Oracle thinking...'; }
  try {
    const feeling = S.feeling?.name ? `Their current feeling: ${S.feeling.emoji} ${S.feeling.name}.` : '';
    const text = await callAI(
      `You are the Eravos Oracle, coaching someone on how to write their own love letter — you are not writing it for them. ${feeling} Teach: (1) one way to open without "Dear ___", (2) how to be specific instead of generic (name one concrete memory/detail technique), (3) how to close with warmth. Then give ONE short example fragment (a single sentence, clearly labeled "example fragment — adapt this, don't copy it") of the kind of specificity you mean. Keep the whole thing under 150 words.`,
      'Coach me on writing a love letter to my partner.',
      null
    );
    if (text) _showOracleGuidance(text);
  } catch(e) { showToast('✦ Oracle unreachable: ' + e.message); }
  if (status) status.style.display = 'none';
}

async function generateLovePoem() {
  const status = document.getElementById('msg-oracle-generating');
  if (status) { status.style.display = 'block'; status.textContent = '✦ Oracle thinking...'; }
  try {
    const feeling = S.feeling?.name ? `inspired by the feeling: ${S.feeling.emoji} ${S.feeling.name}` : 'about longing, love, and interdependence';
    const text = await callAI(
      `You are the Eravos Oracle, coaching someone on writing their own short poem for their partner, ${feeling} — you are not writing the poem for them. Teach: (1) one concrete image-over-abstraction technique (e.g. "their hands" beats "your love"), (2) how line breaks control pacing/breath, (3) permission that it doesn't need to rhyme. Give ONE example line, clearly labeled "example line — not for reuse". Under 130 words.`,
      'Coach me on writing a poem for my partner.',
      null
    );
    if (text) _showOracleGuidance(text);
  } catch(e) { showToast('✦ Oracle unreachable'); }
  if (status) status.style.display = 'none';
}

async function generateAffirmation() {
  const status = document.getElementById('msg-oracle-generating');
  if (status) { status.style.display = 'block'; status.textContent = '✦ Oracle thinking...'; }
  try {
    const text = await callAI(
      `You are the Eravos Oracle, coaching someone on writing a real affirmation for their partner — you are not writing it for them. Teach the one core move: naming a SPECIFIC thing you witnessed in them (an action, a quality they showed recently) rather than a generic compliment — that's what makes it land like truth instead of flattery. Give ONE example structure (not filled in with their partner's actual traits, just the shape), labeled "structure — fill in your own specifics". Under 100 words.`,
      'Coach me on writing an affirmation for my partner.',
      null
    );
    if (text) _showOracleGuidance(text);
  } catch(e) { showToast('✦ Oracle unreachable'); }
  if (status) status.style.display = 'none';
}

// callAI: using shared definition above

// ── Send message ───────────────────────────────────────────────────
function sendMessage() {
  const ta = document.getElementById('msg-compose');
  const text = ta?.value?.trim();
  if (!text && _msgType !== 'feeling') {
    showToast('✍ Write something first');
    return;
  }

  const payload = {
    subtype: _msgType,
    text: text || '',
    id: 'msg_' + Date.now() + '_' + Math.random().toString(36).slice(2,7),
    feeling: (S.feeling && S.feeling.name) ? {
      name: S.feeling.name,
      emoji: S.feeling.emoji,
      intensity: S.feeling.intensity,
      color: S.feeling.color
    } : null,
    read: false
  };

  // Send via P2P pipeline (message:sent gate on the receiving side —
  // see SYNC STREAM block. emitSync queues to ErosPipeline on failure.)
  const sent = emitSync('message:sent', payload);
  showToast(sent
    ? (_msgType === 'love' ? '💌 Love letter sent' : '💌 Message sent')
    : '📤 Queued — will send when partner connects');

  // Save to sent log
  const sentLog = DB.get('eravors_msg_sent', []);
  sentLog.unshift({ ...payload, from: S.user?.name || 'Partner', ts: Date.now() });
  DB.set('eravors_msg_sent', sentLog.slice(0, 50));

  // Save love letters to vault too
  if (_msgType === 'love' || _msgType === 'poem') {
    saveToVault(_msgType === 'love' ? 'love_letter' : 'poem', text);
  }

  // Clear form
  if (ta) ta.value = '';
  const status = document.getElementById('msg-send-status');
  if (status) {
    status.textContent = `✓ ${_msgType === 'love' ? 'Love letter' : 'Message'} sent at ${new Date().toLocaleTimeString()}`;
    setTimeout(() => { status.textContent = ''; }, 4000);
  }

  renderSentLog();
  deleteDraft(); // clear draft on send
}

// ── Draft ──────────────────────────────────────────────────────────
function saveDraftMessage() {
  const ta = document.getElementById('msg-compose');
  const text = ta?.value?.trim();
  if (!text) return;
  DB.set('eravors_msg_draft', { text, type: _msgType, ts: Date.now() });
  showToast('📝 Draft saved');
  const card = document.getElementById('msg-draft-card');
  if (card) {
    card.style.display = 'block';
    const preview = document.getElementById('msg-draft-preview');
    if (preview) preview.textContent = text.slice(0, 80) + (text.length > 80 ? '…' : '');
  }
}

function loadDraft() {
  const draft = DB.get('eravors_msg_draft', null);
  if (!draft) return;
  const ta = document.getElementById('msg-compose');
  if (ta) ta.value = draft.text;
  setMsgType(draft.type || 'text');
}

function deleteDraft() {
  DB.set('eravors_msg_draft', null);
  const card = document.getElementById('msg-draft-card');
  if (card) card.style.display = 'none';
}

function clearCompose() {
  const ta = document.getElementById('msg-compose');
  if (ta) ta.value = '';
  const status = document.getElementById('msg-send-status');
  if (status) status.textContent = '';
}

// ── Render sent log ────────────────────────────────────────────────
function renderSentLog() {
  const el = document.getElementById('msg-sent-list');
  if (!el) return;
  const sent = DB.get('eravors_msg_sent', []);
  if (!sent.length) { el.innerHTML = '<p class="small italic" style="color:var(--dim)">Messages you\'ve sent will appear here.</p>'; return; }
  const typeIcons = { text:'✍', love:'💌', feeling:'💗', need:'🫀', poem:'📜', soft:'💛', attention:'💌', urgent:'🔴' };
  el.innerHTML = sent.slice(0, 15).map(m => `
    <div class="sent-item">
      <div class="sent-item-meta">${typeIcons[m.subtype || m.type] || '•'} ${(m.subtype || m.type || '').toUpperCase()} · ${new Date(m.ts).toLocaleString()}</div>
      <div class="sent-item-text">${(m.text || '').slice(0, 100)}${(m.text || '').length > 100 ? '…' : ''}</div>
      ${m.feeling ? `<div style="font-size:.72rem;color:var(--dim);margin-top:3px">${m.feeling.emoji || ''} ${m.feeling.name}</div>` : ''}
    </div>`).join('');
}

// ── Inbox ──────────────────────────────────────────────────────────
function filterInbox(filter) {
  _inboxFilter = filter;
  renderInbox();
}

function renderInbox() {
  const el = document.getElementById('msg-inbox-list');
  if (!el) return;
  const fullInbox = DB.get('eravors_inbox', []);
  // Track each item's REAL index in the full inbox array alongside it —
  // found while continuing the same audit that caught renderPartnerNeeds()
  // doing this wrong: markRead/saveInboxItemToVault/respondToNeed/
  // feelingReply/deleteInboxItem all index the FULL eravors_inbox array,
  // but this function was building cards from a filtered array and
  // embedding THAT array's position instead. Whenever any inbox filter
  // other than "All" was active, every action button in the inbox
  // (including Delete) acted on the wrong message. Confirmed by
  // inspection of all five functions before fixing — same bug class,
  // this time in the highest-traffic list in the whole app.
  let entries = fullInbox.map((m, i) => ({ m, i }));
  if (_inboxFilter !== 'all') {
    entries = entries.filter(({ m }) => {
      const sub = m.subtype || m.type || '';
      if (_inboxFilter === 'poke') return sub.includes('poke') || ['soft','attention','urgent'].includes(sub);
      return sub.includes(_inboxFilter);
    });
  }
  if (!entries.length) { el.innerHTML = '<p class="small italic" style="color:var(--dim)">No messages yet.</p>'; return; }

  const typeIcons  = { text:'✍', love:'💌', feeling:'💗', need:'🫀', poem:'📜', soft:'💛', attention:'💌 Attention', urgent:'🔴 URGENT', poke_soft:'💛', poke_attention:'💌', poke_urgent:'🔴', partner_invite:'🔗' };
  const typeLabels = { text:'Message', love:'Love Letter', feeling:'Feeling Share', need:'Need', poem:'Poem', soft:'Soft Poke', attention:'Attention Request', urgent:'URGENT', poke_soft:'Soft Poke', poke_attention:'Attention Request', poke_urgent:'URGENT ALERT', partner_invite:'Partner Connected' };

  el.innerHTML = entries.slice(0, 30).map(({ m, i }) => {
    const sub = m.subtype || m.type || 'message';
    const icon = typeIcons[sub] || '•';
    const label = typeLabels[sub] || sub.toUpperCase();
    const unread = !m.read ? ' unread' : '';
    return `<div class="inbox-item${unread}" data-idx="${i}">
      <div class="inbox-item-type">${icon} ${label} · from ${m.from || 'Partner'}</div>
      ${m.feeling ? `<div class="inbox-item-feeling">${m.feeling.emoji || ''} ${m.feeling.name} ${m.feeling.intensity ? '('+m.feeling.intensity+'/10)' : ''}</div>` : ''}
      ${m.text ? `<div class="inbox-item-text">${m.text.slice(0, 200)}${m.text.length > 200 ? '…' : ''}</div>` : ''}
      <div class="inbox-item-meta">${new Date(m.ts).toLocaleString()}</div>
      <div class="inbox-item-actions">
        ${sub === 'partner_invite'
          ? `<span class="small" style="color:var(--dim)">✓ Connected</span>`
          : `<button class="btn g" style="font-size:.7rem;padding:3px 9px" onclick="markRead(${i})">✓ Read</button>
        ${m.subtype === 'love' || m.subtype === 'poem' ? `<button class="btn g" style="font-size:.7rem;padding:3px 9px" onclick="saveInboxItemToVault(${i})">💾 Vault</button>` : ''}
        ${m.subtype === 'need' ? `<button class="btn g" style="font-size:.7rem;padding:3px 9px" onclick="respondToNeed(${i})">🫀 Respond</button>` : ''}
        ${m.subtype === 'feeling' ? `<button class="btn g" style="font-size:.7rem;padding:3px 9px" onclick="feelingReply(${i})">💗 Reflect back</button>` : ''}`}
        <button class="btn g" style="font-size:.7rem;padding:3px 9px;color:var(--rose)" onclick="deleteInboxItem(${i})">✕</button>
      </div>
    </div>`;
  }).join('');
}

function updateInboxBadge() {
  const inbox = DB.get('eravors_inbox', []);
  const unread = inbox.filter(m => !m.read).length;
  const badge = document.getElementById('inbox-badge');
  if (badge) {
    badge.textContent = unread;
    badge.style.display = unread > 0 ? 'inline-block' : 'none';
  }
  // Header bell badge mirrors the same inbox — kept in sync from one
  // source of truth (eravors_inbox) rather than a second counter.
  const headerBadge = document.getElementById('notif-badge');
  if (headerBadge) {
    headerBadge.textContent = unread;
    headerBadge.style.display = unread > 0 ? 'flex' : 'none';
  }
}

// ── Header quick-actions ─────────────────────────────────────────────
// History of this one, briefly, because it moved three times:
// 1. openAppPopout(kind, {...}) — a shared right-edge slide-in side
//    panel. Retired: no side panels anywhere in the app.
// 2. openMessagesInline() — mounted Messages as an in-app tab. Also
//    wrong: explicitly asked for a full separate HTML file, not a tab.
// 3. messages.html — a full standalone page. Also not what was wanted
//    once actually used: "didn't want messages to be the whole screen
//    just a popup."
// Landed on: a centered modal (#messages-modal, same convention as
// #pipeline-modal) — not a side panel, not a tab, not a full page.
// Poke is folded into it too (was a separate tab; retired as one) —
// consolidated per direct request rather than staying two surfaces
// that both show partner-communication state.
function openMessagesModal() {
  const modal = document.getElementById('messages-modal');
  if (!modal) return;
  modal.classList.add('open');
  const box = document.getElementById('messages-modal-box');
  if (box) box.scrollTop = 0; // same class of bug as switchTab()/switchSettingsTab() — this box scrolls independently
  if (typeof renderInbox === 'function') renderInbox();
  if (typeof renderSentLog === 'function') renderSentLog();
  if (typeof updateInboxBadge === 'function') updateInboxBadge();
  if (typeof updateMsgFeelingPreview === 'function') updateMsgFeelingPreview();
  if (typeof renderPokeHistory === 'function') renderPokeHistory();
  const draft = DB.get('eravors_msg_draft', null);
  const card = document.getElementById('msg-draft-card');
  if (card) card.style.display = draft ? 'block' : 'none';
  if (draft) {
    const preview = document.getElementById('msg-draft-preview');
    if (preview) preview.textContent = (draft.text || '').slice(0, 80);
  }
}

function closeMessagesModal() {
  const modal = document.getElementById('messages-modal');
  if (modal) modal.classList.remove('open');
}

function openCommHub() { openMessagesModal(); }

// setNeedSignal — was briefly tab-owned in tabs/poke/poke.js when Poke
// was its own lazy-loaded tab. Now that Poke is folded into the always-
// present Messages modal (not lazy-loaded), there's no more "is the tab
// mounted yet" question for anything reachable only from there, so this
// just lives alongside the rest of the poke/messages pipeline.
function setNeedSignal(val) {
  DB.set('eravors_need_signal', val || null);
  document.querySelectorAll('.need-signal-btn').forEach(btn => {
    btn.classList.toggle('active', btn.textContent.includes(val) && val !== '');
  });
  const statusEl = document.getElementById('need-signal-status');
  if (statusEl) statusEl.textContent = val ? `Signal set: "${val}"` : 'Signal cleared.';
  emitSync('presence:need_signal', { signal: val }, { queueOnFail: false });
  showToast(val ? `🫀 Signal set: "${val}"` : 'Signal cleared');
}

// Sync the header badge as soon as the shell finishes booting, so it
// reflects real unread state immediately instead of staying at the
// static "0" markup until the Messages tab happens to be opened.
document.addEventListener('eravos:mounted', () => {
  try { updateInboxBadge(); } catch (e) { /* non-fatal */ }
});

function markRead(idx) {
  const inbox = DB.get('eravors_inbox', []);
  if (inbox[idx]) { inbox[idx].read = true; DB.set('eravors_inbox', inbox); renderInbox(); updateInboxBadge(); }
  if (typeof renderRelationalHealthField === 'function') renderRelationalHealthField();
}

function markAllRead() {
  const inbox = DB.get('eravors_inbox', []);
  inbox.forEach(m => m.read = true);
  DB.set('eravors_inbox', inbox);
  renderInbox();
  updateInboxBadge();
  showToast('✓ All messages marked as read');
}

function deleteInboxItem(idx) {
  const inbox = DB.get('eravors_inbox', []);
  inbox.splice(idx, 1);
  DB.set('eravors_inbox', inbox);
  renderInbox();
  updateInboxBadge();
}

function saveInboxItemToVault(idx) {
  const inbox = DB.get('eravors_inbox', []);
  const m = inbox[idx];
  if (!m) return;
  saveToVault(m.subtype === 'love' ? 'love_letter' : 'poem', `From ${m.from || 'Partner'} — ${new Date(m.ts).toLocaleDateString()}\n\n${m.text}`);
  showToast('💾 Saved to Vault');
}

function saveIncomingToVault() {
  const text = document.getElementById('msg-overlay-text')?.textContent;
  const from = document.getElementById('msg-overlay-from')?.textContent;
  if (text) { saveToVault('love_letter', `${from}\n\n${text}`); showToast('💾 Saved to Vault'); }
}

// ── Need response ──────────────────────────────────────────────────
function respondToNeed(idx) {
  const inbox = DB.get('eravors_inbox', []);
  const m = inbox[idx];
  if (!m) return;
  const ta = document.getElementById('msg-compose');
  if (ta) ta.value = `I see you. I hear that you need: ${m.text}. I'm here.`;
  setMsgType('text');
  openMessagesModal();
  markRead(idx);
}

function feelingReply(idx) {
  const inbox = DB.get('eravors_inbox', []);
  const m = inbox[idx];
  if (!m || !m.feeling) return;
  const ta = document.getElementById('msg-compose');
  if (ta) ta.value = `I receive your ${m.feeling.emoji || ''} ${m.feeling.name}. I hold it with you.`;
  setMsgType('text');
  openMessagesModal();
  markRead(idx);
}

// ── Incoming message full-screen overlay ──────────────────────────
function showMessageOverlay(msg) {
  const overlay = document.getElementById('msg-incoming-overlay');
  if (!overlay) return;

  const icons = { love:'💌', feeling:'💗', need:'🫀', poem:'📜', text:'✉', soft:'💛', attention:'💌', urgent:'🔴' };
  const sub = msg.subtype || msg.type || 'text';

  const iconEl   = document.getElementById('msg-overlay-icon');
  const fromEl   = document.getElementById('msg-overlay-from');
  const textEl   = document.getElementById('msg-overlay-text');
  const feelEl   = document.getElementById('msg-overlay-feeling');
  const cdEl     = document.getElementById('msg-overlay-countdown');
  const ackBtn   = document.getElementById('msg-overlay-ack');
  const saveBtn  = document.getElementById('msg-overlay-save');

  if (iconEl)  iconEl.textContent  = icons[sub] || '💌';
  if (fromEl)  fromEl.textContent  = (msg.from || 'Partner').toUpperCase() + ' SENT YOU ' + (sub === 'love' ? 'LOVE' : sub.toUpperCase());
  if (textEl)  textEl.textContent  = msg.text || '';
  if (feelEl)  {
    if (msg.feeling && msg.feeling.name) {
      feelEl.style.display = 'block';
      feelEl.textContent = `${msg.feeling.emoji || ''} ${msg.feeling.name} (intensity ${msg.feeling.intensity || '?'}/10)`;
      feelEl.style.color = msg.feeling.color || 'var(--amber)';
    } else { feelEl.style.display = 'none'; }
  }
  if (ackBtn)  ackBtn.style.display = 'none';
  if (saveBtn) saveBtn.style.display = 'none';

  overlay.classList.add('show');
  overlay.style.display = 'flex';

  // 10 second countdown before ACK button appears
  let secs = 10;
  if (cdEl) cdEl.textContent = `Please receive this fully. Acknowledge in ${secs}s...`;
  const countdown = setInterval(() => {
    secs--;
    if (secs > 0) {
      if (cdEl) cdEl.textContent = `Please receive this fully. Acknowledge in ${secs}s...`;
    } else {
      clearInterval(countdown);
      if (cdEl) cdEl.textContent = '';
      if (ackBtn) ackBtn.style.display = 'block';
      if (saveBtn && (sub === 'love' || sub === 'poem')) saveBtn.style.display = 'block';
    }
  }, 1000);

  // Store the msg for ack
  window._pendingAckMsg = msg;
}

function acknowledgeMessage() {
  // Close overlay
  const overlay = document.getElementById('msg-incoming-overlay');
  if (overlay) { overlay.classList.remove('show'); overlay.style.display = 'none'; }

  // Send acknowledgment back
  if (window._pendingAckMsg) {
    emitSync('message:ack', { id: window._pendingAckMsg.id }, { queueOnFail: false });
    window._pendingAckMsg = null;
  }
  showToast('💗 Acknowledged');
}

// ── Incoming message router (called from handleP2PMessage) ─────────
// Do Not Disturb — personal, not shared (each person sets their own).
// Suppresses interruptions (the full-screen message overlay, toasts,
// the meaning-archive auto-surface prompt) without blocking anything:
// the message still saves to inbox and the badge still updates, so
// it's there whenever they do check — DND softens the interruption,
// it doesn't drop the message. Urgent poke and Triggered signals are
// explicitly NOT suppressed by this (see their own gates) — those are
// the app's two already-established "this breaks through" tiers.
function _isDND() { return !!DB.get('eravors_dnd', false); }

function toggleDND() {
  const on = !_isDND();
  DB.set('eravors_dnd', on);
  _renderDNDButton(on);
  showToast(on ? '🔕 Do Not Disturb on — messages still arrive, just quietly' : '🔔 Do Not Disturb off');
}

// Moved from a standalone header button into the profile dropdown menu,
// per direct request — the avatar itself now carries a small status
// dot so DND state is visible at a glance without opening the menu.
function _renderDNDButton(on) {
  const label = document.getElementById('ume-dnd-label');
  if (label) label.textContent = on ? 'Do Not Disturb (on)' : 'Do Not Disturb';
  const item = document.getElementById('ume-dnd-item');
  if (item) item.style.color = on ? 'var(--amber)' : '';
  const dot = document.getElementById('user-avatar-status-dot');
  if (dot) dot.style.display = on ? 'block' : 'none';
  const dot2 = document.getElementById('ume-avatar-status-dot');
  if (dot2) dot2.style.display = on ? 'block' : 'none';
}

function receiveMessage(msg) {
  // Save to inbox
  const inbox = DB.get('eravors_inbox', []);
  const sub = msg.subtype || msg.type || 'text';

  // Deduplicate by id
  if (msg.id && inbox.some(m => m.id === msg.id)) return;

  inbox.unshift({ ...msg, read: false });
  DB.set('eravors_inbox', inbox.slice(0, 100));

  // Render
  renderInbox();
  updateInboxBadge();
  renderSentLog();

  const dnd = _isDND();

  // Special handling per type
  if (sub === 'love' || sub === 'poem') {
    // Save to vault automatically
    if (msg.text) saveToVault(sub === 'love' ? 'love_letter' : 'poem',
      `From ${msg.from || 'Partner'} — ${new Date(msg.ts).toLocaleDateString()}\n\n${msg.text}`);
    // Show full-screen bloom/overlay
    if (!dnd) {
      showMessageOverlay(msg);
      showToast('💌 ' + (msg.from || 'Partner') + ' sent you a love letter');
      _offerMeaningArchiveDelayed(sub, 'sent_message', msg.id, msg.text);
    }
  } else if (sub === 'feeling') {
    if (!dnd) {
      showMessageOverlay(msg);
      showToast('💗 ' + (msg.from || 'Partner') + ' shared their feeling');
      _offerMeaningArchiveDelayed('message', 'sent_message', msg.id, msg.text);
    }
  } else if (sub === 'need') {
    if (!dnd) {
      showMessageOverlay(msg);
      showToast('🫀 ' + (msg.from || 'Partner') + ' expressed a need');
    }
    renderPartnerNeeds(); // always — the Needs tab's own list should reflect it regardless of DND, only the interruption is suppressed
  } else if (sub === 'text') {
    if (!dnd) showToast('✉ ' + (msg.from || 'Partner') + ': ' + (msg.text || '').slice(0, 50));
  }
}

// Delayed so the auto-surface offer doesn't stack immediately on top of
// the incoming-message overlay this message already showed — asked a
// few seconds later, once there's been a moment with it.
function _offerMeaningArchiveDelayed(type, source, contentRef, previewText) {
  setTimeout(() => {
    if (typeof openMeaningAddPrompt === 'function') openMeaningAddPrompt(type, source, contentRef, previewText);
  }, 4000);
}

// ── Poke system ────────────────────────────────────────────────────
// Poke was its own lazy-loaded tab once, then Quick Poke buttons also
// lived on the messages.html standalone page; both are gone now —
// Poke is folded into the always-present #messages-modal (see
// openMessagesModal() above). sendPoke()/receivePoke() live here
// because they're called from a gate ('poke:sent') that fires
// regardless of whether the modal has ever been opened, same
// cross-cutting reasoning as everything else in the sync layer.
function sendPoke(tier, customMsg) {
  const labels = { soft: 'Thinking of you 💛', attention: 'Could use some attention 💌', urgent: 'URGENT — please check in 🔴' };
  const payload = {
    subtype: tier,
    tier,
    text: customMsg || labels[tier] || tier,
    id: 'poke_' + Date.now()
  };

  const sent = emitSync('poke:sent', payload);
  if (sent) {
    const toasts = { soft: '💛 Soft poke sent', attention: '💌 Attention request sent', urgent: '🔴 Urgent alert sent' };
    showToast(toasts[tier] || '💛 Poke sent');
  } else {
    showToast('📤 Poke queued — will send when partner connects');
  }

  // Log
  const ph = DB.get('eravors_poke_history', []);
  ph.unshift({ ...payload, from: S.user?.name || 'Partner', ts: Date.now(), direction: 'sent' });
  DB.set('eravors_poke_history', ph.slice(0, 50));
  renderPokeHistory();
}

function sendPokeWithMsg(tier) {
  const msg = prompt(`Custom message for ${tier} poke:`);
  if (msg) sendPoke(tier, msg);
}

function receivePoke(msg) {
  // Save to inbox and poke history
  const inbox = DB.get('eravors_inbox', []);
  inbox.unshift({ ...msg, read: false });
  DB.set('eravors_inbox', inbox.slice(0, 100));

  const ph = DB.get('eravors_poke_history', []);
  ph.unshift({ ...msg, direction: 'received' });
  DB.set('eravors_poke_history', ph.slice(0, 50));

  renderInbox();
  updateInboxBadge();
  renderPokeHistory();

  if (msg.tier === 'urgent') {
    // Always breaks through DND — the tier's own framing ("use
    // sparingly, reserved for real emergencies") already means it's
    // for exactly the situations DND shouldn't silence.
    showUrgentPoke(msg);
  } else if (_isDND()) {
    // Soft/attention tiers ARE the kind of thing DND exists to soften
    // — still saved above, just not interrupting right now.
    return;
  } else if (msg.tier === 'attention') {
    showToast('💌 ' + (msg.from || 'Partner') + ' needs your attention');
    // Vibrate if available
    if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
  } else {
    showToast('💛 ' + (msg.from || 'Partner') + ' is thinking of you');
    if (navigator.vibrate) navigator.vibrate(200);
  }
}

function showUrgentPoke(msg) {
  const div = document.createElement('div');
  div.className = 'poke-urgent-overlay';
  div.id = 'poke-urgent-overlay';
  div.innerHTML = `
    <div class="poke-urgent-box">
      <div style="font-size:3rem;margin-bottom:16px;animation:pulse 1s infinite">🔴</div>
      <div style="font-family:var(--fd);font-size:1.2rem;color:var(--rose);margin-bottom:10px">URGENT</div>
      <div style="font-family:var(--fm);font-size:.65rem;letter-spacing:.2em;color:var(--dim);margin-bottom:16px">FROM ${(msg.from || 'PARTNER').toUpperCase()}</div>
      <div style="font-size:1rem;line-height:1.7;margin-bottom:24px;color:var(--text)">${msg.text || 'Please check in.'}</div>
      <div id="urgent-countdown" style="font-family:var(--fm);font-size:.7rem;color:var(--dim);margin-bottom:16px"></div>
      <button id="urgent-dismiss" class="btn p" style="display:none;width:100%" onclick="document.getElementById('poke-urgent-overlay').remove()">✓ I see this</button>
    </div>`;
  document.body.appendChild(div);
  if (navigator.vibrate) navigator.vibrate([400, 200, 400, 200, 400]);

  let secs = 10;
  const cd = div.querySelector('#urgent-countdown');
  const btn = div.querySelector('#urgent-dismiss');
  if (cd) cd.textContent = `Cannot dismiss for ${secs}s`;
  const t = setInterval(() => {
    secs--;
    if (secs > 0) { if (cd) cd.textContent = `Cannot dismiss for ${secs}s`; }
    else { clearInterval(t); if (cd) cd.textContent = ''; if (btn) btn.style.display = 'block'; }
  }, 1000);
}

function renderPokeHistory() {
  const el = document.getElementById('poke-history-list');
  if (!el) return;
  const ph = DB.get('eravors_poke_history', []);
  if (!ph.length) { el.innerHTML = '<p class="small italic" style="color:var(--dim)">No pokes yet.</p>'; return; }
  const icons = { soft: '💛', attention: '💌', urgent: '🔴' };
  el.innerHTML = ph.slice(0, 20).map(p => `
    <div class="sent-item">
      <div class="sent-item-meta">${icons[p.tier] || '•'} ${p.direction === 'sent' ? 'Sent' : 'Received'} · ${new Date(p.ts).toLocaleString()}</div>
      <div class="sent-item-text">${p.text || p.tier}</div>
    </div>`).join('');
}

// ── Presence signal ────────────────────────────────────────────────
// setNeedSignal() now lives near openCommHub()/openMessagesModal()
// above — see that section's comment for why.

// ── Needs panel ────────────────────────────────────────────────────
function sendNeedCard() {
  const what = document.getElementById('need-what')?.value?.trim();
  const help = document.getElementById('need-help')?.value?.trim();
  const know = document.getElementById('need-know')?.value?.trim();
  if (!what) { showToast('⚠ What do you need?'); return; }

  const payload = {
    subtype: 'need',
    text: what,
    help: help || '',
    know: know || '',
    id: 'need_' + Date.now(),
    feeling: (S.feeling && S.feeling.name) ? { name: S.feeling.name, emoji: S.feeling.emoji, intensity: S.feeling.intensity, color: S.feeling.color } : null,
    read: false
  };

  const sent = emitSync('message:sent', payload);
  showToast(sent ? '🫀 Need card sent' : '📤 Need card queued');

  // Local log (private)
  const nh = DB.get('eravors_need_history', []);
  nh.unshift({ ...payload, from: S.user?.name || 'Partner', ts: Date.now() });
  DB.set('eravors_need_history', nh.slice(0, 50));
  renderNeedHistory();

  // Status
  const statusEl = document.getElementById('need-send-status');
  if (statusEl) { statusEl.textContent = '✓ Need card sent at ' + new Date().toLocaleTimeString(); setTimeout(() => statusEl.textContent = '', 4000); }

  // Clear form
  ['need-what','need-help','need-know'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
}

function saveNeedPrivate() {
  const what = document.getElementById('need-what')?.value?.trim();
  if (!what) return;
  const nh = DB.get('eravors_need_history', []);
  nh.unshift({ text: what, help: document.getElementById('need-help')?.value||'', know: document.getElementById('need-know')?.value||'', private: true, ts: Date.now(), feeling: S.feeling && S.feeling.name ? S.feeling : null });
  DB.set('eravors_need_history', nh.slice(0, 50));
  renderNeedHistory();
  showToast('🔒 Saved privately');
}

function clearNeedForm() {
  ['need-what','need-help','need-know'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  document.getElementById('need-send-status').textContent = '';
}

function renderPartnerNeeds() {
  const el = document.getElementById('partner-needs-list');
  if (!el) return;
  const fullInbox = DB.get('eravors_inbox', []);
  // Keep each need's REAL index in the full inbox array alongside it —
  // found while adding search: respondToNeed(idx) looks up
  // eravors_inbox[idx] (the full array), but this function was passing
  // the filtered need-only position instead. With any non-need message
  // in the inbox before a need card, "Write response" opened the wrong
  // message entirely. Confirmed with a test before fixing.
  const needEntries = fullInbox.map((m, i) => ({ m, i })).filter(x => x.m.subtype === 'need');

  if (!needEntries.length) { el.innerHTML = '<p class="small italic" style="color:var(--dim)">When your partner sends a need card, it appears here.</p>'; return; }

  const query = (document.getElementById('partner-needs-search')?.value || '').trim().toLowerCase();
  const filtered = query
    ? needEntries.filter(({ m }) => (m.text || '').toLowerCase().includes(query) || (m.help || '').toLowerCase().includes(query) || (m.know || '').toLowerCase().includes(query))
    : needEntries;

  if (!filtered.length) {
    el.innerHTML = `<p class="small italic" style="color:var(--dim)">No needs match "${query}".</p>`;
    return;
  }

  el.innerHTML = filtered.slice(0, 5).map(({ m, i }) => `
    <div class="partner-need-card ${m.read ? '' : 'unread'}">
      ${m.feeling ? `<div class="small" style="color:${m.feeling.color||'var(--amber)'};margin-bottom:6px">${m.feeling.emoji||''} ${m.feeling.name} · ${m.feeling.intensity}/10</div>` : ''}
      <div style="font-size:.9rem;line-height:1.65;margin-bottom:6px">${m.text}</div>
      ${m.help ? `<div class="small" style="color:var(--dim);margin-bottom:4px">What would help: ${m.help}</div>` : ''}
      ${m.know ? `<div class="small" style="color:var(--dim)">They want you to know: ${m.know}</div>` : ''}
      <div class="small" style="color:var(--dim);margin-top:6px">${new Date(m.ts).toLocaleString()}</div>
      <div class="partner-need-response">
        <button class="btn g" style="font-size:.75rem" onclick="sendNeedResponse('I see you. I\'m here.')">💗 I see you</button>
        <button class="btn g" style="font-size:.75rem" onclick="sendNeedResponse('I hear you. Let\'s talk soon.')">💬 Let\'s talk</button>
        <button class="btn g" style="font-size:.75rem" onclick="respondToNeed(${i})">✍ Write response</button>
      </div>
    </div>`).join('');
}

function sendNeedResponse(text) {
  const ta = document.getElementById('msg-compose');
  if (ta) ta.value = text;
  setMsgType('text');
  openMessagesModal();
}

function renderNeedHistory() {
  const el = document.getElementById('need-history-list');
  if (!el) return;
  const nh = DB.get('eravors_need_history', []);
  if (!nh.length) { el.innerHTML = '<p class="small italic" style="color:var(--dim)">No needs logged yet.</p>'; return; }

  const query = (document.getElementById('need-history-search')?.value || '').trim().toLowerCase();
  const filtered = query
    ? nh.filter(n => (n.text || '').toLowerCase().includes(query) || (n.help || '').toLowerCase().includes(query) || (n.know || '').toLowerCase().includes(query))
    : nh;

  if (!filtered.length) {
    el.innerHTML = `<p class="small italic" style="color:var(--dim)">No needs match "${query}".</p>`;
    return;
  }

  el.innerHTML = filtered.slice(0, 10).map(n => `
    <div class="sent-item">
      <div class="sent-item-meta">${n.private ? '🔒 Private' : '📤 Sent'} · ${new Date(n.ts).toLocaleString()}${n.feeling ? ' · ' + (n.feeling.emoji||'') + ' ' + n.feeling.name : ''}</div>
      <div class="sent-item-text">${n.text.slice(0, 80)}${n.text.length>80?'…':''}</div>
    </div>`).join('');
}

// ── Safety requests ────────────────────────────────────────────────
function renderSafetyRequests() {
  const el = document.getElementById('safety-requests-list');
  if (!el) return;
  const reqs = DB.get('eravors_safety_requests', []);
  if (!reqs.length) { el.innerHTML = '<p class="small italic" style="color:var(--dim)">No pending safety requests.</p>'; return; }
  el.innerHTML = reqs.slice(0, 5).map((r, i) => `
    <div class="safety-request-card">
      <div class="small" style="font-family:var(--fm);color:var(--cyan);margin-bottom:6px">${r.from || 'Partner'} needs:</div>
      <div style="font-size:.9rem;color:var(--amber);margin-bottom:8px">"${r.safety}"</div>
      <div class="small" style="color:var(--dim)">${new Date(r.ts).toLocaleString()}</div>
      <div class="flex gap8 mt8 wrap">
        <button class="btn g" style="font-size:.75rem" onclick="respondSafety(${i}, 'ready')">✓ I\'m ready to listen</button>
        <button class="btn g" style="font-size:.75rem" onclick="respondSafety(${i}, 'later')">⏱ Give me a moment</button>
      </div>
    </div>`).join('');
}

function renderPartnerMirrors() {
  const el = document.getElementById('partner-mirrors-list');
  if (!el) return;
  const list = _partnerMirrorReceived();
  if (!list.length) { el.innerHTML = '<p class="small italic" style="color:var(--dim)">Nothing shared yet.</p>'; return; }
  el.innerHTML = list.slice(0, 10).map(m => `
    <div class="partner-need-card" style="border-color:rgba(0,229,204,.25)">
      <div class="small" style="color:var(--dim);margin-bottom:6px">${m.source?.type === 'rupture' ? 'From a repaired rupture' : 'From a shared feeling'} · ${new Date(m.ts).toLocaleString()}</div>
      ${m.what_could_help_next_time ? `<div style="font-size:.9rem;line-height:1.6;margin-bottom:8px"><span style="color:var(--teal)">Next time:</span> ${m.what_could_help_next_time}</div>` : ''}
      ${m.what_would_have_helped_then ? `<div style="font-size:.9rem;line-height:1.6;margin-bottom:8px"><span style="color:var(--teal)">In the moment:</span> ${m.what_would_have_helped_then}</div>` : ''}
      ${m.acknowledged_by_partner
        ? `<div class="small" style="color:var(--dim)">✓ Acknowledged</div>`
        : `<button class="btn g" style="font-size:.75rem" onclick="acknowledgeMirror('${m.id}')">💗 I see this, I'm holding it</button>`}
    </div>`).join('');
}

function respondSafety(idx, response) {
  const reqs = DB.get('eravors_safety_requests', []);
  const r = reqs[idx];
  if (!r) return;
  const text = response === 'ready' ? 'I\'m ready to listen. I\'m here.' : 'Give me just a few minutes and then I\'m fully here for you.';
  const ta = document.getElementById('msg-compose');
  if (ta) ta.value = text;
  setMsgType('text');
  openMessagesModal();
  reqs.splice(idx, 1);
  DB.set('eravors_safety_requests', reqs);
  renderSafetyRequests();
}

// Migrated to syncStream gates (message:sent, poke:sent,
// presence:need_signal, safety:requested, message:ack) — see the SYNC
// STREAM block earlier in this file. This was the third and final
// window.handleP2PMessage monkey-patch layer; it's the one whose
// `type.startsWith('msg_') || [...].includes(type)` check shadowed the
// original handler's 'love'/'feeling' branches (see the note at the
// top of the SYNC STREAM block for what that broke).

// ── Feeling save wired: syncFeelingToPartner is defined above in core ─

// ═══════════════════════════════════════════════════════════════════
// SETTINGS SUB-TABS
// ═══════════════════════════════════════════════════════════════════
function switchSettingsTab(tab) {
  // Real guard, not just button hiding — button visibility alone is
  // client-side cosmetic and can be bypassed by calling this function
  // directly. This is still not server-side security (there's no server —
  // each person only ever runs their own device's client), but it means
  // the gate holds even if something calls switchSettingsTab('admin')
  // programmatically instead of clicking the (hidden) button.
  const ADMIN_ONLY_TABS = ['ai', 'admin'];
  const isAdmin = S.user?.role === 'admin' || S.user?.isAdmin;
  if (ADMIN_ONLY_TABS.includes(tab) && !isAdmin) {
    showToast('🔐 Admin only');
    tab = 'system';
  }
  ['features','ai','system','admin'].forEach(t => {
    const pane = document.getElementById('settings-pane-' + t);
    const btn  = document.getElementById('stab-' + t);
    if (pane) pane.style.display = t === tab ? '' : 'none';
    if (btn)  btn.classList.toggle('active', t === tab);
  });
  if (tab === 'admin') {
    if (typeof renderAccountPartnerRow === 'function') renderAccountPartnerRow();
    if (typeof renderRelaySettings === 'function') renderRelaySettings();
  }
  if (tab === 'features') renderFeaturesIndex();
  if (tab === 'ai') {
    renderAIToggles();
    // Was: Guardian status + preferred-provider restore + OpenAI/Claude
    // key field population — all removed along with those cards. This
    // block called setGuardianProvider(), which no longer exists;
    // calling it here would have thrown the next time anyone opened
    // Settings -> AI. Restoring the Ollama card's state is already
    // handled by EravosSettingsSubtabInitRenderers.ai (fires on this
    // subtab's own mount), so nothing needs to happen here anymore.
  }
  if (tab === 'system') {
    // Sync P2P display IDs from the hidden originals
    const myHidden = document.getElementById('my-room-code');
    const myDisplay = document.getElementById('my-room-code-display-sys');
    if (myDisplay && myHidden) myDisplay.textContent = myHidden.value || '—';
    const pHidden = document.getElementById('partner-room-code');
    const pDisplay = document.getElementById('partner-id-display-sys');
    if (pDisplay && pHidden) pDisplay.textContent = pHidden.value || '—';
    // Account & Partner card lives here now (§16.1 — moved off the admin
    // gate), so it needs the same refresh-on-switch the admin pane below
    // already gets.
    if (typeof renderAccountPartnerRow === 'function') renderAccountPartnerRow();
  }
  if (tab === 'admin') {
    const ta = document.getElementById('ticker-editor');
    if (ta) {
      const saved = DB.get('eravors_ticker_phrases', null);
      ta.value = (saved && saved.length ? saved : TICKER_DEFAULT).join('\n');
    }
  }
  window.scrollTo(0, 0); // same reset as switchTab() — same missing-reset bug here too
}

// ═══════════════════════════════════════════════════════════════════
// FEATURES INDEX — every feature with a toggle and summary
// ═══════════════════════════════════════════════════════════════════
// v0.14.0 — the three new features. Registered here so Settings > Features
// picks them up, and gated for real by shared/eravos-features.js (before
// this release the toggles wrote a boolean and gated nothing at all).
const FEATURE_DEFS = [
  // Relational
  { id:'oracle',      tab:'oracle',      cat:'Relational',     label:'Oracle',            summary:'AI guidance for feelings, creativity, and your inner world.' },
  { id:'feelings',    tab:'feelings',    cat:'Relational',     label:'Feelings',          summary:'Set, log, and track your emotional state over time.' },
  { id:'bond',        tab:'relational',  cat:'Relational',     label:'Bond / Pulse',      summary:'Relationship pulse sliders, pulse history, and bond tracking.' },
  { id:'rupture',     tab:'rupture',     cat:'Relational',     label:'Rupture Tracker',   summary:'Log and repair relationship ruptures. Track what was resolved.' },
  { id:'sparring',    tab:'sparring',    cat:'Relational',     label:'Sparring',          summary:'Turn-based real-time chat match with your partner — chess-clock style, no solo mode.' },
  { id:'growth',      tab:'growth',      cat:'Relational',     label:'Growth Tracker',    summary:'Log growth moments and see patterns in your relationship evolution.' },
  { id:'triggers',    tab:'triggers',    cat:'Relational',     label:'Triggers & Patterns', summary:'Map trigger patterns and shadow material — optional, and yours to define.' },
  { id:'commitments', tab:'commitments', cat:'Relational',     label:'Commitments',       summary:'Track promises made and kept — pinky promise, promise, or your word.' },
  { id:'struggles',   tab:'struggles',   cat:'Relational',     label:'Struggles',         summary:'A compassionate space to name what you\'re working through, shared only if you choose.' },
  { id:'meaning',     tab:'meaning',     cat:'Creating',        label:'Meaning & Memories', summary:'Love notes, photos, and moments worth looking back on together.' },
  // hardtalk / roadmap_shared / desires are deliberately NOT listed here --
  // they're NEW_FEATURES's own job (see eravos-features.js), which already
  // carries their real gating metadata (requiresPartner, requires, defaultOn,
  // sensitive) that a plain entry here would not. FeatureRegistry's
  // constructor concats NEW_FEATURES onto this list itself; duplicating
  // them here created a genuine collision that its own hard-error-on-
  // duplicate check (by design, and covered by a real test) correctly
  // threw on -- silently halting eravos-kernel.js's own script at
  // eravosFeatures's construction, confirmed directly by testing.
  // Communication
  { id:'call',        tab:'call',        cat:'Communication',  label:'Voice / Video Call',summary:'Encrypted P2P calls directly to your partner. No server.' },
  { id:'poke',        tab:'messages',    cat:'Communication',  label:'Poke System',       summary:'Three-tier attention signals: soft, attention request, urgent. Lives in the Messages & Poke popup (bell icon), not a separate tab.' },
  { id:'messages',    tab:'messages',    cat:'Communication',  label:'Messages',          summary:'One-way messages, love letters, feeling shares, needs, poems. Opens as a popup from the bell icon, not a full page or a tab.' },
  { id:'needs',       tab:'needs',       cat:'Communication',  label:'Needs Express',     summary:'Express needs as cards your partner receives with space to respond.' },
  { id:'planner',     tab:'planner',     cat:'Communication',  label:'Shared Planner',    summary:'Schedule dates, calls, and events synced between timezones.' },
  // Creating
  { id:'poetry',      tab:'poetry',      cat:'Creating',       label:'Poetry',            summary:'Write, generate, and send poetry. Oracle-guided or freeform.' },
  { id:'mythos',      tab:'mythos',      cat:'Creating',       label:'Mythos',            summary:'Build your shared mythology: archetypes, symbols, origin stories.' },
  { id:'editor',      tab:'mythos',      cat:'Creating',       label:'Sacred Editor',     summary:'Full inline writing editor with markdown, preview, and AI guidance.' },
  { id:'canvas',      tab:'canvas',      cat:'Creating',       label:'Free Space',        summary:'Unstructured freewrite canvas with AI enhancement.' },
  { id:'mutator',     tab:'mutator',     cat:'Creating',       label:'Image Mutator',     summary:'Transform text and ideas into image generation prompts.' },
  { id:'rituals',     tab:'rituals',     cat:'Creating',       label:'Rituals',           summary:'Build creative rituals. Track streaks and practice cadence.' },
  { id:'music',       tab:'music',       cat:'Creating',       label:'Mood / Music',      summary:'Mood board and ambient sound generation based on feeling state.' },
  { id:'ideas',       tab:'ideas',       cat:'Creating',       label:'Ideas',             summary:'Personal idea log with AI expansion and stage tracking.' },
  // Space
  { id:'codex',       tab:'codex',       cat:'Space',          label:'Codex',             summary:'Sacred record of insights, memories, vows, and symbols.' },
  { id:'vault',       tab:'vault',       cat:'Space',          label:'Vault',             summary:'Store creative works, images, essays. Encrypted private vault.' },
  { id:'lattice',     tab:'lattice',     cat:'Space',          label:'Word Lattice',      summary:'Living map of your relationship language built from sessions.' },
  // System
  { id:'priming',     tab:'settings',    cat:'System',         label:'Priming',           summary:'Set an AI context state that shapes all oracle and AI outputs.' },
  { id:'p2p',         tab:'settings',    cat:'System',         label:'P2P Connection',    summary:'Direct device-to-device connection with your partner. No servers.' },
  { id:'pipeline',    tab:'settings',    cat:'System',         label:'Data Pipeline',     summary:'Connect external data sources via pipeline codes.' },
  // Relational — additional spec features
  { id:'sovereignty',  tab:'relational',  cat:'Relational',     label:'Sovereignty Mode',  summary:'A safe space for the hardest moments — separation, rupture, or the fear of losing someone. Longing as compass.' },
  { id:'selfcheckin',  tab:'relational',  cat:'Relational',     label:'Self Check-In',     summary:'Space just for you. Self-care, centering, love given or noticed, finding your center.' },
  { id:'journal',      tab:'feelings',    cat:'Relational',     label:'Journal',           summary:'Branch from any feeling into a guided journal entry. Tagged, convertible to poem or codex.' },
  { id:'gratitude',    tab:'relational',  cat:'Relational',     label:'Gratitude Prompts', summary:'Non-forced, optional. What are you grateful for — to your partner, to yourself. No Mount Everest required.' },
  { id:'guided_flow',  tab:'feelings',    cat:'Relational',     label:'Guided Feeling Flow', summary:'5-step branching feeling modal. Skippable at every step. Never an interrogation.' },
  // Communication — missing
  { id:'location',     tab:'planner',     cat:'Communication',  label:'Location Sharing',  summary:'Consent-gated, session-scoped, precision-controlled. Disables on session end. No API key.' },
  { id:'love_letters', tab:'messages',    cat:'Communication',  label:'Love Letters',      summary:'Full-screen elegant display. Oracle guides you to feel and articulate — never writes it for you.' },
  { id:'one_way_msg',  tab:'messages',    cat:'Communication',  label:'One-Way Message',   summary:'Arrives with space. Partner cannot reply for 10 minutes — for receiving, not reacting.' },
  // Creating — missing
  { id:'cocreate',     tab:'cocreate',    cat:'Creating',       label:'Co-Create',         summary:'Shared creative space. Build something together — story, world, relationship mythology.' },
  { id:'music_mood',   tab:'music',       cat:'Creating',       label:'Mood / Music',      summary:'Ambient sound generation and mood board based on your current feeling state.' },
];

// AI-enabled feature subset
const AI_FEATURE_DEFS = [
  { id:'ai_oracle',      label:'Oracle Guidance',      summary:'Generates contextual guidance for your feeling/intention state.' },
  { id:'ai_feelings',    label:'Feeling Intelligence', summary:'Suggests needs, somatic awareness, and next steps from feelings.' },
  { id:'ai_poetry',      label:'Poetry Generation',    summary:'Generates and improves poetry from your prompts.' },
  { id:'ai_mythos',      label:'Mythos Generation',    summary:'Generates origin stories, archetypes, and sacred symbols.' },
  { id:'ai_editor',      label:'Sacred Editor AI',     summary:'Oracle guidance and AI enhancement inside the sacred editor.' },
  { id:'ai_canvas',      label:'Canvas Enhancement',   summary:'AI rewrites and enhances freewrite canvas content.' },
  { id:'ai_sparring',    label:'Sparr Prompts',        summary:'AI generates sparring prompts tailored to your relationship.' },
  { id:'ai_needs',       label:'Needs Finder',         summary:'NVC-based AI analysis of feelings to surface underlying needs.' },
  { id:'ai_grounding',   label:'Grounding Exercises',  summary:'Generates somatic/breathing exercises for your specific feeling.' },
  { id:'ai_growth',      label:'Growth Insights',      summary:'AI reflection on growth patterns from your logged repairs.' },
  { id:'ai_translation', label:'Communication Bridge', summary:'Translates partner messages to help understand communication style.' },
];

function _featureToggleHTML(id, label, summary, checked) {
  return `<div class="feat-row" id="feat-row-${id}">
    <div class="feat-info">
      <div class="feat-label">${label}</div>
      <div class="feat-summary">${summary}</div>
    </div>
    <label class="feat-switch" title="${checked?'On':'Off'}">
      <input type="checkbox" ${checked?'checked':''} onchange="setFeature('${id}',this.checked)">
      <span class="feat-switch-track"><span class="feat-switch-thumb"></span></span>
    </label>
  </div>`;
}

function renderFeaturesIndex() {
  const list = document.getElementById('features-index-list');
  if (!list) return;
  let html = '';
  let lastCat = '';
  FEATURE_DEFS.forEach(f => {
    if (f.cat !== lastCat) {
      if (lastCat) html += '</div>';
      html += `<div class="feat-cat-label">${f.cat}</div><div class="feat-cat-group">`;
      lastCat = f.cat;
    }
    const on = DB.get('feat_' + f.id, true) !== false;
    html += _featureToggleHTML('feat_' + f.id, f.label, f.summary, on);
  });
  if (lastCat) html += '</div>';
  list.innerHTML = html;
}

function renderAIToggles() {
  const list = document.getElementById('ai-features-list');
  if (!list) return;
  const masterOn = DB.get('ai_assist', true) !== false;

  // Master toggle — full-width prominent row
  let html = `<div class="ai-master-row" id="feat-row-ai_assist">
    <div class="feat-info">
      <div class="feat-label" style="font-size:.9rem;color:var(--amber)">🤖 AI Assistance</div>
      <div class="feat-summary">Master switch — disabling this turns off all AI features below.</div>
    </div>
    <label class="feat-switch">
      <input type="checkbox" ${masterOn?'checked':''} onchange="setFeature('ai_assist',this.checked)">
      <span class="feat-switch-track"><span class="feat-switch-thumb"></span></span>
    </label>
  </div>
  <div class="ai-subhead">Per-feature AI toggles</div>`;

  AI_FEATURE_DEFS.forEach(f => {
    const on = masterOn && DB.get(f.id, true) !== false;
    html += _featureToggleHTML(f.id, f.label, f.summary, on);
  });
  list.innerHTML = html;

  // Dim sub-rows if master is off
  if (!masterOn) {
    list.querySelectorAll('.feat-row').forEach(r => { r.style.opacity = '.4'; const inp = r.querySelector('input'); if(inp) inp.disabled=true; });
  }
}

// ── FEATURE GATING (v0.14.0) ──────────────────────────────────────
// Before this, every switch in Settings > Features was cosmetic: setFeature()
// wrote a boolean and showed a toast, featOn() was never called for a feat_
// key, and nothing anywhere hid a tab. You could turn Rupture Tracker off and
// it stayed there, fully working. A §6.1 violation in shipped code — an
// interface claiming a capability it does not have.
const eravosFeatures = (typeof FeatureRegistry !== 'undefined')
  ? new FeatureRegistry({ defs: FEATURE_DEFS })
  : null;
if (typeof window !== 'undefined') window.eravosFeatures = eravosFeatures;

/** Hide the nav buttons of every disabled feature. */
function applyFeatureGates() {
  if (!eravosFeatures || typeof document === 'undefined') return;
  const hidden = eravosFeatures.hiddenTabs();
  document.querySelectorAll('[data-tab]').forEach(btn => {
    const t = btn.dataset.tab;
    btn.style.display = hidden.includes(t) ? 'none' : '';
  });
}
if (typeof window !== 'undefined') window.applyFeatureGates = applyFeatureGates;

function setFeature(key, val) {
  DB.set(key, val);
  if (key === 'ai_assist') {
    // Re-render the whole AI list so sub-rows reflect new master state
    renderAIToggles();
    showToast(val ? '🤖 AI assistance on' : '⊘ AI assistance off');
    return;
  }
  if (eravosFeatures && key.indexOf('feat_') === 0) {
    const id = key.slice(5);
    if (eravosFeatures.def(id)) {
      const r = eravosFeatures.set(id, val);
      applyFeatureGates();
      // §1.2 — a dependency taking something else down is REPORTED, not
      // discovered later as a missing tab.
      if (r.cascaded.length) {
        showToast('Also hidden: ' + r.cascaded.map(c => (eravosFeatures.def(c) || {}).label || c).join(', '));
      } else if (!val && r.note) {
        showToast(r.note);
      }
      // if the person is standing on the tab they just turned off, move them
      if (!val && S.tab && eravosFeatures.def(id).tab === S.tab) switchTab('oracle');
      return;
    }
  }
  if (key === 'feat_oracle' && !val) showToast('⊘ Oracle disabled');
}

// Helper to check if a feature is enabled
function featOn(id) {
  if (DB.get('ai_assist', true) === false && id.startsWith('ai_')) return false;
  return DB.get(id, true) !== false;
}

// Admin helpers
// exportSharedDB() / inspectSharedDB() now defined above, built on the
// real .erav module — the old versions here filtered localStorage keys
// prefixed 'shared_', but every actual key in this app is prefixed
// 'eravors_'. That meant this button had always silently exported an
// empty {} — found while wiring in the real implementation, not before.

function saveTicker() {
  const ta = document.getElementById('ticker-editor');
  const st = document.getElementById('ticker-save-status');
  if (!ta) return;
  const lines = ta.value.split('\n')
    .map(l => l.trim())
    .filter(Boolean);
  if (lines.length === 0) {
    resetTicker();
    return;
  }
  DB.set('eravors_ticker_phrases', lines);
  renderTicker();
  if (st) { st.style.color='var(--teal)'; st.textContent='✓ Saved · ' + lines.length + ' phrases'; }
  showToast('📜 Ticker updated');
}

function resetTicker() {
  const ta = document.getElementById('ticker-editor');
  const st = document.getElementById('ticker-save-status');
  DB.set('eravors_ticker_phrases', TICKER_DEFAULT);
  if (ta) ta.value = TICKER_DEFAULT.join('\n');
  renderTicker();
  if (st) { st.style.color='var(--dim)'; st.textContent='↺ Restored to defaults'; }
  showToast('↺ Ticker restored');
}

// Show admin tab only for admin role
function _syncAdminTab() {
  const isAdmin = S.user?.role === 'admin' || S.user?.isAdmin;
  const adminBtn = document.getElementById('stab-admin');
  if (adminBtn) adminBtn.style.display = isAdmin ? '' : 'none';
}

// feat-pill: clicking the pill div triggers the hidden checkbox via label wrapping.
// No extra delegate needed — the <label> handles it natively.
// We only need to keep the pill visual in sync when the input changes.
// feat-switch visual sync — CSS :checked selector handles the track/thumb visuals automatically.
// The onchange on each input calls setFeature() directly — nothing else needed here.

// Init feature index state on load
(function _initFeatures() {
  // Ensure all features default to on if never set
  FEATURE_DEFS.forEach(f => {
    if (DB.get('feat_' + f.id, null) === null) DB.set('feat_' + f.id, true);
  });
  AI_FEATURE_DEFS.forEach(f => {
    if (DB.get(f.id, null) === null) DB.set(f.id, true);
  });
})();

// ═══════════════════════════════════════════════════════════════════
// SACRED EDITOR — embedded blank editor for Mythos tab
// ═══════════════════════════════════════════════════════════════════
let _editorAutoSaveTimer = null;

function openMythosEditor(prefill) {
  const modal = document.getElementById('mythos-editor-modal');
  if (!modal) return;
  modal.style.display = 'flex';
  // Restore draft if any
  const draft = DB.get('eravors_editor_draft', null);
  const titleEl = document.getElementById('editor-modal-title');
  const bodyEl  = document.getElementById('editor-modal-body');
  if (draft && !prefill) {
    if (titleEl) titleEl.value = draft.title || '';
    if (bodyEl)  bodyEl.value  = draft.body  || '';
    if (draft.type) {
      const typeEl = document.getElementById('editor-modal-type');
      if (typeEl) typeEl.value = draft.type;
    }
  } else if (prefill) {
    if (titleEl) titleEl.value = prefill.title || '';
    if (bodyEl)  bodyEl.value  = prefill.body  || '';
    if (prefill.type) {
      const typeEl = document.getElementById('editor-modal-type');
      if (typeEl) typeEl.value = prefill.type;
    }
  } else {
    if (titleEl) titleEl.value = '';
    if (bodyEl)  bodyEl.value  = '';
  }
  editorUpdateWordCount();
  editorUpdatePreview();
  editorBindEvents();
}

function openMythosEditorWith(source) {
  let text = '', title = '', type = 'freewrite';
  if (source === 'mythos') {
    text  = getEl('mythos-output') || '';
    title = document.getElementById('mythos-seed')?.value || 'Untitled Mythos';
    type  = 'mythos';
  } else if (source === 'vault') {
    const vault = DB.get('eravors_vault', []);
    if (vault.length) {
      text  = vault[0].text || '';
      title = vault[0].title || 'Vault Entry';
      type  = vault[0].type || 'freewrite';
    }
  } else if (source === 'mythos-output-el') {
    text  = document.getElementById('mythos-output')?.innerText || '';
    title = document.getElementById('mythos-seed')?.value || 'Untitled Mythos';
    type  = 'mythos';
  }
  openMythosEditor({ title, body: text, type });
}

function closeMythosEditor() {
  const modal = document.getElementById('mythos-editor-modal');
  if (modal) modal.style.display = 'none';
  if (_editorAutoSaveTimer) { clearInterval(_editorAutoSaveTimer); _editorAutoSaveTimer = null; }
}

function editorBindEvents() {
  const bodyEl  = document.getElementById('editor-modal-body');
  const titleEl = document.getElementById('editor-modal-title');
  if (!bodyEl) return;
  bodyEl.oninput = () => {
    editorUpdateWordCount();
    editorUpdatePreview();
    editorDraftSave();
  };
  if (titleEl) titleEl.oninput = editorDraftSave;
  // Auto-save every 30s
  if (!_editorAutoSaveTimer) {
    _editorAutoSaveTimer = setInterval(editorDraftSave, 30000);
  }
}

function editorDraftSave() {
  const title = document.getElementById('editor-modal-title')?.value || '';
  const body  = document.getElementById('editor-modal-body')?.value  || '';
  const type  = document.getElementById('editor-modal-type')?.value  || 'freewrite';
  DB.set('eravors_editor_draft', { title, body, type, ts: Date.now() });
  const saved = document.getElementById('editor-modal-saved');
  if (saved) saved.textContent = 'draft saved ' + new Date().toLocaleTimeString();
}

function editorUpdateWordCount() {
  const body = document.getElementById('editor-modal-body')?.value || '';
  const words = body.trim() ? body.trim().split(/\s+/).length : 0;
  const el = document.getElementById('editor-modal-wordcount');
  if (el) el.textContent = words + (words === 1 ? ' word' : ' words');
}

function editorUpdatePreview() {
  const body = document.getElementById('editor-modal-body')?.value || '';
  const previewEl = document.getElementById('editor-preview-content');
  if (!previewEl) return;
  // Basic markdown-lite render
  let html = body
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/^# (.+)$/gm,'<h3 style="font-family:\'Cinzel Decorative\',serif;color:#b8965a;font-size:1rem;margin:16px 0 8px;letter-spacing:.06em">$1</h3>')
    .replace(/^## (.+)$/gm,'<h4 style="font-family:\'Cinzel\',serif;color:#b8965a;font-size:.9rem;margin:12px 0 6px">$1</h4>')
    .replace(/^> (.+)$/gm,'<blockquote style="border-left:2px solid rgba(184,150,90,.4);padding-left:12px;color:rgba(200,191,175,.7);font-style:italic;margin:8px 0">$1</blockquote>')
    .replace(/^---$/gm,'<hr style="border:none;border-top:1px solid rgba(184,150,90,.2);margin:16px 0">')
    .replace(/\*\*(.+?)\*\*/g,'<strong style="color:#d4b078">$1</strong>')
    .replace(/\*(.+?)\*/g,'<em>$1</em>')
    .replace(/\n/g,'<br>');
  previewEl.innerHTML = html || '<em style="color:rgba(200,191,175,0.3)">Your writing will preview here...</em>';
}

function editorSwitchTab(tab) {
  const previewPanel = document.getElementById('editor-panel-preview');
  const aiPanel = document.getElementById('editor-panel-ai');
  const tabPreview = document.getElementById('editor-tab-preview');
  const tabAI = document.getElementById('editor-tab-ai');
  if (tab === 'preview') {
    if (previewPanel) previewPanel.style.display = 'block';
    if (aiPanel) aiPanel.style.display = 'none';
    if (tabPreview) { tabPreview.style.borderBottomColor='#b8965a'; tabPreview.style.color='#b8965a'; tabPreview.style.background='rgba(184,150,90,.06)'; }
    if (tabAI) { tabAI.style.borderBottomColor='transparent'; tabAI.style.color='rgba(200,191,175,.4)'; tabAI.style.background='none'; }
  } else {
    if (previewPanel) previewPanel.style.display = 'none';
    if (aiPanel) aiPanel.style.display = 'block';
    if (tabAI) { tabAI.style.borderBottomColor='#b8965a'; tabAI.style.color='#b8965a'; tabAI.style.background='rgba(184,150,90,.06)'; }
    if (tabPreview) { tabPreview.style.borderBottomColor='transparent'; tabPreview.style.color='rgba(200,191,175,.4)'; tabPreview.style.background='none'; }
  }
}

function editorInsert(before, after) {
  const ta = document.getElementById('editor-modal-body');
  if (!ta) return;
  const start = ta.selectionStart, end = ta.selectionEnd;
  const sel = ta.value.slice(start, end);
  const replacement = before + (sel || 'text') + after;
  ta.setRangeText(replacement, start, end, 'select');
  ta.focus();
  editorUpdateWordCount(); editorUpdatePreview(); editorDraftSave();
}

function editorInsertLine(prefix) {
  const ta = document.getElementById('editor-modal-body');
  if (!ta) return;
  const start = ta.selectionStart;
  const lineStart = ta.value.lastIndexOf('\n', start - 1) + 1;
  ta.setRangeText(prefix, lineStart, lineStart, 'end');
  ta.focus();
  editorUpdateWordCount(); editorUpdatePreview(); editorDraftSave();
}

async function editorAIEnhance() {
  const body = document.getElementById('editor-modal-body')?.value || '';
  const type = document.getElementById('editor-modal-type')?.value || 'freewrite';
  if (!body.trim()) { showToast('Write something first'); return; }
  editorSwitchTab('ai');
  const aiOut = document.getElementById('editor-ai-out');
  if (aiOut) aiOut.textContent = '✦ Enhancing...';
  const prompt = `You are the Oracle — a sacred writing guide for a couple's relational intelligence platform called Eravos.

The user has written the following ${type}. Your role is NOT to rewrite it for them. Instead:
- Reflect what is most powerful and alive in their writing
- Point to what wants to be deepened or felt further
- Offer 1-3 questions or invitations, not corrections
- If something is genuinely beautiful, name it specifically
- Be brief, warm, and non-judgmental. Stay out of the relationship itself.

Their writing:
"""
${body}
"""

Respond as the Oracle: brief, warm, specific. 2-4 sentences max.`;
  await _editorCallAI(prompt, aiOut);
}

async function editorAIGuide() {
  const type = document.getElementById('editor-modal-type')?.value || 'freewrite';
  const title = document.getElementById('editor-modal-title')?.value || '';
  const feeling = S.feeling?.name ? `${S.feeling.emoji} ${S.feeling.name}` : '';
  editorSwitchTab('ai');
  const aiOut = document.getElementById('editor-ai-out');
  if (aiOut) aiOut.textContent = '✦ Consulting the oracle...';
  const prompt = `You are the Oracle for Eravos — a sacred relational platform. Guide this user to begin writing.

Type: ${type}. Title/seed: "${title}". ${feeling ? 'Current feeling: '+feeling+'.' : ''}

Give them a single sentence invitation to start writing. Not instructions — a door. Then offer one optional prompt if they want more. Be poetic, brief, grounded.`;
  await _editorCallAI(prompt, aiOut);
}

async function _editorCallAI(prompt, outputEl) {
  const key = DB.get('claude_key','') || DB.get('eravors_claude_key','');
  if (!key) {
    if (outputEl) outputEl.textContent = '⚠ Add your Claude API key in Settings to use AI guidance here.';
    return;
  }
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method:'POST',
      headers:{'Content-Type':'application/json','x-api-key':key,'anthropic-version':'2023-06-01'},
      body:JSON.stringify({ model:'claude-sonnet-4-20250514', max_tokens:400,
        system: 'You are a writing guide, not a ghostwriter — open a door for them to write through, never write the piece itself.',
        messages:[{role:'user',content:prompt}]
      })
    });
    const data = await res.json();
    const text = data.content?.[0]?.text || 'The oracle is silent.';
    if (outputEl) {
      outputEl.textContent = '';
      let i = 0;
      const tick = setInterval(() => {
        if (i >= text.length) { clearInterval(tick); return; }
        outputEl.textContent += text[i++];
      }, 18);
    }
  } catch(e) {
    if (outputEl) outputEl.textContent = '⚠ AI error: ' + e.message;
  }
}

function editorSaveToVault() {
  const title = document.getElementById('editor-modal-title')?.value || 'Untitled';
  const body  = document.getElementById('editor-modal-body')?.value  || '';
  const type  = document.getElementById('editor-modal-type')?.value  || 'freewrite';
  if (!body.trim()) { showToast('Nothing to save yet'); return; }
  saveToVault(type, `${title}\n\n${body}`, title);
  DB.del('eravors_editor_draft');
  const saved = document.getElementById('editor-modal-saved');
  if (saved) saved.textContent = '✓ saved to vault ' + new Date().toLocaleTimeString();
  showToast('💾 Saved to Vault');
}

function editorSendToCodex() {
  const title = document.getElementById('editor-modal-title')?.value || 'Untitled';
  const body  = document.getElementById('editor-modal-body')?.value  || '';
  if (!body.trim()) { showToast('Nothing to send'); return; }
  // Inject into codex form
  const codexTitle = document.getElementById('codex-title');
  const codexContent = document.getElementById('codex-content');
  if (codexTitle) codexTitle.value = title;
  if (codexContent) codexContent.value = body;
  const codexType = document.getElementById('codex-type');
  const editorType = document.getElementById('editor-modal-type')?.value || 'insight';
  if (codexType) codexType.value = ['poem','journal','letter','mythos','vow'].includes(editorType) ? editorType : 'creation';
  document.getElementById('codex-form') && (document.getElementById('codex-form').style.display = 'block');
  closeMythosEditor();
  switchTab('codex');
  showToast('📖 Ready to save to Codex');
}

function editorSendToPartner() {
  const title = document.getElementById('editor-modal-title')?.value || '';
  const body  = document.getElementById('editor-modal-body')?.value  || '';
  const type  = document.getElementById('editor-modal-type')?.value  || 'freewrite';
  if (!body.trim()) { showToast('Nothing to send'); return; }
  // Pre-fill message compose
  const ta = document.getElementById('msg-compose');
  if (ta) ta.value = (title ? title + '\n\n' : '') + body;
  const msgType = (type === 'letter' || type === 'mythos') ? 'love' : type === 'poem' ? 'poem' : 'text';
  if (typeof setMsgType === 'function') setMsgType(msgType);
  closeMythosEditor();
  openMessagesModal();
  showToast('💌 Ready to send — review and confirm in Messages');
}

function editorClear() {
  if (!confirm('Clear the editor? Your draft will be lost.')) return;
  const bodyEl  = document.getElementById('editor-modal-body');
  const titleEl = document.getElementById('editor-modal-title');
  if (bodyEl) bodyEl.value = '';
  if (titleEl) titleEl.value = '';
  DB.del('eravors_editor_draft');
  editorUpdateWordCount(); editorUpdatePreview();
  const saved = document.getElementById('editor-modal-saved');
  if (saved) saved.textContent = 'cleared';
}

function editorCopyAll() {
  const body = document.getElementById('editor-modal-body')?.value || '';
  navigator.clipboard.writeText(body).then(() => showToast('📋 Copied to clipboard'));
}

// Close editor on Escape
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    const modal = document.getElementById('mythos-editor-modal');
    if (modal && modal.style.display !== 'none') { editorDraftSave(); closeMythosEditor(); }
  }
});

// ── Wire feeling flow safety request ──────────────────────────────
window.sendSafetyRequest = function(safetyChoice) {
  // Found during migration: this used to call sendP2P(payload) AND
  // unconditionally ErosPipeline.push(payload) regardless of whether
  // the send succeeded — every safety request got queued even when
  // delivered live, guaranteeing a duplicate resend on next reconnect.
  // emitSync only queues on actual failure.
  emitSync('safety:requested', { safety: safetyChoice });
  showToast('💬 Safety request sent');
};

// ── Init: render all on load ───────────────────────────────────────
(function initMessagingUI() {
  // On tab switch, refresh inbox
  const _origST = window.switchTab;
  window.switchTab = function(name) {
    if (typeof _origST === 'function') _origST(name);
    // 'messages' and 'poke' conditionals removed — neither is a real
    // tab switchTab() is ever called with anymore (both retired in
    // favor of the Messages & Poke modal; see openMessagesModal(),
    // which does this same refresh work directly).
    if (name === 'needs')    { renderPartnerNeeds(); renderNeedHistory(); renderSafetyRequests(); renderPartnerMirrors(); updateMsgFeelingPreview(); }
    // Phase D — tell them where I am, IF I am sharing. ChatEngine owns that
    // gate; this never decides on the person's behalf.
    if (typeof eravosPresence !== 'undefined' && eravosPresence) {
      try { eravosPresence.enteredTab(name); } catch (e) { console.error('[eravos] presence broadcast failed:', e.message); }
    }
  };

  // Update badge on init
  setTimeout(updateInboxBadge, 500);
})();



/* ==== next inline <script> block ==== */


(function() {
'use strict';

// ── Eravos identity (the node UUID — not a server connection) ──────────────
var ERAVOS_IDENTITY = {
  uuid:    DB.get('eravos_node_uuid', null),
  label:   'eravos',
  version: '2.0.0',
};
// Generate stable UUID on first load — this is Eravos's permanent identity
if (!ERAVOS_IDENTITY.uuid) {
  ERAVOS_IDENTITY.uuid = 'eravos-' + Array.from(
    crypto.getRandomValues(new Uint8Array(16))
  ).map(b => b.toString(16).padStart(2,'0')).join('').replace(
    /(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5'
  );
  DB.set('eravos_node_uuid', ERAVOS_IDENTITY.uuid);
}

// ── BroadcastChannel — same channel Guardian uses ─────────────────────────
var _channel    = null;
var _connected  = false;
var _pending    = {};  // reqId → { resolve, reject, timer }
var _handlers   = {};  // type → fn

function _openChannel() {
  if (typeof BroadcastChannel === 'undefined') return;
  try {
    _channel = new BroadcastChannel('guardian-bridge');
    _channel.onmessage = _onMessage;
    // Register Eravos as a callto target so Guardian knows we exist
    _channel.postMessage({
      type:     'CALLTO_REGISTER',
      callto: {
        id:       ERAVOS_IDENTITY.uuid,
        label:    'Eravos',
        selector: 'eravos:dashboard',
        action:   'focus',
        source:   'eravos',
        version:  ERAVOS_IDENTITY.version,
        capabilities: ['ai_receive', 'feeling_sync', 'session'],
      },
    });
    _connected = true;
    log('[Guardian] Channel open — registered as callto: eravos', 'ok');
  } catch(e) {
    log('[Guardian] BroadcastChannel unavailable — offline mode', 'info');
  }
}

function _onMessage(evt) {
  var msg = evt.data;
  if (!msg || !msg.type) return;

  // AI response from Guardian (claude.ai or chatgpt.com tab)
  if (msg.type === 'AI_RESPONSE' || msg.type === 'guardian.chat.response') {
    var text = msg.text || msg.content || msg.data?.text || '';
    var reqId = msg.reqId || msg.requestId;
    if (reqId && _pending[reqId]) {
      clearTimeout(_pending[reqId].timer);
      _pending[reqId].resolve({ ok: true, text, _via: 'guardian' });
      delete _pending[reqId];
    }
    // Also dispatch to any registered handlers
    (_handlers['ai_response'] || []).forEach(function(fn) { try { fn(text, msg); } catch(_) {} });
    return;
  }

  // Connection state updates
  if (msg.type === 'HANDSHAKE_STATE') {
    var wasConnected = _connected;
    _connected = msg.state?.status === 'connected';
    if (_connected !== wasConnected) _updateIndicator(_connected);
    return;
  }
  if (msg.type === 'CONNECTION_RESTORED') { _connected = true; _updateIndicator(true); return; }
  if (msg.type === 'CONNECTION_DEGRADED') { _connected = false; _updateIndicator(false); return; }
  if (msg.type === 'FORCE_DISCONNECT')    { _connected = false; _updateIndicator(false); return; }

  // Dispatch to registered handlers
  var handlers = _handlers[msg.type] || [];
  handlers.forEach(function(fn) { try { fn(msg); } catch(_) {} });
}

// ── Send an AI request through Guardian ───────────────────────────────────
// Guardian picks this up and routes to the active claude.ai or chatgpt.com tab
window.guardianAI = function(messages, opts) {
  opts = opts || {};
  return new Promise(function(resolve, reject) {
    if (!_channel || !_connected) {
      return resolve({ ok: false, error: 'Guardian not connected' });
    }
    var reqId = 'eravos-ai-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);
    var timer = setTimeout(function() {
      delete _pending[reqId];
      resolve({ ok: false, error: 'Guardian AI timeout' });
    }, opts.timeoutMs || 30000);

    _pending[reqId] = { resolve, reject, timer };

    _channel.postMessage({
      type:     'AI_REQUEST',
      reqId,
      messages,
      provider: opts.provider || DB.get('guardian_ai_provider', 'chatgpt'),
      source:   'eravos',
      ts:       Date.now(),
    });
  });
};

// ── Emit a callto to Guardian ──────────────────────────────────────────────
window.guardianEmit = function(event, payload) {
  if (!_channel) return;
  _channel.postMessage({
    type:    'CALLTO_EMIT',
    event,
    payload: payload || {},
    source:  'eravos',
    uuid:    ERAVOS_IDENTITY.uuid,
    ts:      Date.now(),
  });
};

// ── Register a handler for Guardian messages ───────────────────────────────
window.guardianOn = function(type, fn) {
  if (!_handlers[type]) _handlers[type] = [];
  _handlers[type].push(fn);
};

// ── Check connection ───────────────────────────────────────────────────────
function _updateIndicator(online) {
  // System tab bridge indicator
  var dot   = document.getElementById('bridge-dot-sys');
  var label = document.getElementById('bridge-label-sys');
  if (dot)   { dot.style.background = online ? 'var(--teal)' : 'var(--dim)'; dot.style.boxShadow = online ? '0 0 6px var(--teal)' : 'none'; }
  if (label) label.textContent = online ? 'Guardian connected' : 'Offline';
  // Note: this bridge system is no longer coupled to AI at all — callAI()
  // dropped its GuardianLink/guardianAI calls when the Guardian Mode AI
  // provider card was stripped. GuardianLink itself is a broader
  // handshake/channel system (its own identity, its own channel), out
  // of scope for that AI-provider cleanup, so left as-is here.
}

// ── Legacy handshake stub (for bridge URL path still in System tab) ────────
// When node IS running, this still works. When it isn't, no error.
window.guardianHandshake = async function(url, silent) {
  if (url) {
    DB.set('claude_bridge_url', url.replace(/\/+$/, ''));
  }
  // Try bridge health check — if bridge is running, great. If not, Guardian channel is enough.
  var bridgeUrl = DB.get('claude_bridge_url', '');
  if (!bridgeUrl) return null;
  try {
    var bar = document.getElementById('guardian-handshake-bar');
    if (bar) bar.classList.add('active');
    var resp = await fetch(bridgeUrl + '/health', { signal: AbortSignal.timeout(3000) });
    var d = await resp.json();
    if (bar) bar.classList.remove('active');
    if (d.ok) {
      if (!silent) showToast('⚡ Bridge connected · ' + (d.uuid||'').slice(0,8));
      log('[Bridge] Connected: ' + (d.uuid||'?'), 'ok');
    }
    return d;
  } catch(_) {
    var bar = document.getElementById('guardian-handshake-bar');
    if (bar) bar.classList.remove('active');
    if (!silent) log('[Bridge] Offline — Guardian channel active', 'info');
    return null;
  }
};

// ── Public API ─────────────────────────────────────────────────────────────
window.GuardianLink = {
  isConnected:  function() { return _connected; },
  getIdentity:  function() { return { ...ERAVOS_IDENTITY }; },
  getChannel:   function() { return _channel; },
  emit:         window.guardianEmit,
  ai:           window.guardianAI,
  on:           window.guardianOn,
  status: function() {
    return { connected: _connected, uuid: ERAVOS_IDENTITY.uuid, label: ERAVOS_IDENTITY.label };
  },
};

// ── Auto-open on load ──────────────────────────────────────────────────────
_openChannel();

// Try bridge if URL saved (optional — works without it)
(function() {
  var saved = DB.get('claude_bridge_url', null);
  if (saved) guardianHandshake(saved, true);
})();

})();
