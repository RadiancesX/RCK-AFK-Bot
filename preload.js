const { contextBridge, ipcRenderer } = require('electron');

const on = (channel, fn) => {
  const wrapped = (_event, payload) => fn(payload);
  ipcRenderer.on(channel, wrapped);
  return () => ipcRenderer.removeListener(channel, wrapped);
};

contextBridge.exposeInMainWorld('rck', {
  connect: (opts) => ipcRenderer.invoke('app:connect', opts),
  disconnect: () => ipcRenderer.invoke('app:disconnect'),
  say: (text) => ipcRenderer.invoke('app:say', text),
  settings: (cfg) => ipcRenderer.invoke('app:settings', cfg),
  openUrl: (url) => ipcRenderer.invoke('app:open-url', url),
  selectHotbar: (slot) => ipcRenderer.invoke('app:select-hotbar', slot),
  useItem: () => ipcRenderer.invoke('app:use-item'),
  useCompass: () => ipcRenderer.invoke('app:use-compass'),
  clickSlot: (slot) => ipcRenderer.invoke('app:click-slot', slot),
  closeGui: () => ipcRenderer.invoke('app:close-gui'),
  takeScreenshot: () => ipcRenderer.invoke('app:screenshot'),
  openScreenshots: () => ipcRenderer.invoke('app:open-screenshots'),
  account: {
    getToken: () => ipcRenderer.invoke('account:get-token'),
    setToken: (token) => ipcRenderer.invoke('account:set-token', token),
    clearToken: () => ipcRenderer.invoke('account:clear-token')
  },
  local: {
    getData: (name) => ipcRenderer.invoke('local:get-data', name),
    saveData: (name, data) => ipcRenderer.invoke('local:save-data', name, data)
  },

  win: {
    minimize: () => ipcRenderer.invoke('win:minimize'),
    maximize: () => ipcRenderer.invoke('win:maximize'),
    close: () => ipcRenderer.invoke('win:close')
  },

  onState: (fn) => on('bot:state', fn),
  onChat: (fn) => on('bot:chat', fn),
  onOutgoing: (fn) => on('bot:outgoing', fn),
  onSystem: (fn) => on('bot:system', fn),
  onStats: (fn) => on('bot:stats', fn),
  onVitals: (fn) => on('bot:vitals', fn),
  onPulse: (fn) => on('bot:pulse', fn),
  onReconnectTick: (fn) => on('bot:reconnect-tick', fn),
  onAlert: (fn) => on('bot:alert', fn),
  onWindow: (fn) => on('bot:window', fn),
  onHotbar: (fn) => on('bot:hotbar', fn)
});
