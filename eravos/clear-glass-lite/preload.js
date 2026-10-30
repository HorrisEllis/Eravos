'use strict';
/**
 * preload.js — the only bridge between the sandboxed renderer and Electron.
 * contextIsolation:true + sandbox:true in main.js means the renderer has
 * zero direct Node/Electron access — everything goes through here,
 * explicitly, by name. No `require` exposed, no raw ipcRenderer exposed.
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('hub', {
  getStatus:     () => ipcRenderer.invoke('cgl:get-status'),
  openAccount:   (providerId, accountId) => ipcRenderer.invoke('cgl:open-account', providerId, accountId || null),
  logout:        (providerId, accountId) => ipcRenderer.invoke('cgl:logout', providerId, accountId),
  rename:        (providerId, accountId, label) => ipcRenderer.invoke('cgl:rename', providerId, accountId, label),
  openExternal:  (url) => ipcRenderer.invoke('cgl:open-external', url),
  openScriptsFolder: () => ipcRenderer.invoke('cgl:open-scripts-folder'),
  listScripts:   () => ipcRenderer.invoke('cgl:list-scripts'),
  getConfig:     () => ipcRenderer.invoke('cgl:get-config'),
  setConfig:     (key, value) => ipcRenderer.invoke('cgl:set-config', key, value),
  resetConfig:   () => ipcRenderer.invoke('cgl:reset-config'),
  guardianStatus: () => ipcRenderer.invoke('cgl:guardian-status'),
  restartGuardian: () => ipcRenderer.invoke('cgl:restart-guardian'),
  ledgerQuery:   (table, limit) => ipcRenderer.invoke('cgl:ledger-query', table, limit),
  ledgerTables:  () => ipcRenderer.invoke('cgl:ledger-tables'),
  ledgerDelete:  (table, id) => ipcRenderer.invoke('cgl:ledger-delete', table, id),
  openLog:       () => ipcRenderer.invoke('cgl:open-log'),
  getLog:        (n) => ipcRenderer.invoke('cgl:get-log', n),
  clearLog:      () => ipcRenderer.invoke('cgl:clear-log'),
  onStatusChanged: (cb) => {
    const listener = (_evt, status) => cb(status);
    ipcRenderer.on('status-changed', listener);
    return () => ipcRenderer.removeListener('status-changed', listener);
  },
});
