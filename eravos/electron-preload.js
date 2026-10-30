'use strict';
/* ══════════════════════════════════════════════════════════════════════════
   ERAVOS PRELOAD  ·  electron-preload.js  ·  v0.28.0
   ══════════════════════════════════════════════════════════════════════════

   The only bridge between the page and the main process.

   contextIsolation is on and nodeIntegration is off, so the renderer cannot
   reach fs, child_process or require. That matters more here than in most
   Electron apps: THIS PAGE RENDERS TEXT WRITTEN BY ANOTHER PERSON OVER A
   NETWORK. A renderer with Node access turns a message into a way to run
   code on your machine.

   Three things, all narrow, none able to read a file or spawn anything.
   ══════════════════════════════════════════════════════════════════════════ */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('eravosDesktop', {
  version: '0.28.0',
  platform: process.platform,

  /** An `eravos://pair/…` link arriving from the OS. */
  onPair(fn) {
    if (typeof fn !== 'function') return () => {};
    const h = (_e, payload) => {
      try { fn(payload); }
      catch (err) { console.error('[preload] onPair handler threw:', err); }
    };
    ipcRenderer.on('eravos:pair', h);
    return () => ipcRenderer.removeListener('eravos:pair', h);
  },

  /** A native notification. Strings only — no options object passes through. */
  notify(title, body) {
    ipcRenderer.send('eravos:notify', {
      title: String(title == null ? '' : title).slice(0, 120),
      body: String(body == null ? '' : body).slice(0, 300),
    });
  },
});
