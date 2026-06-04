const { contextBridge, ipcRenderer } = require('electron');

const listeners = new Map();

function subscribe(channel, callback) {
  const wrapped = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, wrapped);
  listeners.set(callback, { channel, wrapped });
  return () => ipcRenderer.removeListener(channel, wrapped);
}

contextBridge.exposeInMainWorld('lanlink', {
  getInfo: () => ipcRenderer.invoke('app:get-info'),
  pickFile: () => ipcRenderer.invoke('dialog:pick-file'),
  sendMessage: (payload) => ipcRenderer.invoke('chat:send', payload),
  sendFile: (payload) => ipcRenderer.invoke('file:send', payload),
  sendSignal: (payload) => ipcRenderer.invoke('webrtc:signal', payload),
  sendCallEvent: (payload) => ipcRenderer.invoke('call:event', payload),
  connectPeer: (ip) => ipcRenderer.invoke('lan:connect-peer', ip),
  getInterfaces: () => ipcRenderer.invoke('app:get-interfaces'),
  setActiveIp: (ip) => ipcRenderer.invoke('app:set-active-ip', ip),
  rescan: () => ipcRenderer.invoke('lan:rescan'),
  scanCustomSubnet: (prefix) => ipcRenderer.invoke('lan:scan-custom-subnet', prefix),
  acceptInvite: (sessionId) => ipcRenderer.invoke('lan:accept-invite', sessionId),
  declineInvite: (sessionId) => ipcRenderer.invoke('lan:decline-invite', sessionId),
  cancelTransfer: (sessionId) => ipcRenderer.invoke('lan:cancel-transfer', sessionId),
  togglePauseTransfer: (sessionId) => ipcRenderer.invoke('lan:toggle-pause-transfer', sessionId),
  getChatHistory: () => ipcRenderer.invoke('db:get-chat-history'),
  saveChatMessage: (msg) => ipcRenderer.invoke('db:save-chat-message', msg),
  getTransmissions: () => ipcRenderer.invoke('db:get-transmissions'),
  saveTransmission: (trans) => ipcRenderer.invoke('db:save-transmission', trans),
  deleteTransferFromDb: (transferId) => ipcRenderer.invoke('db:delete-transmission', transferId),
  pingPeer: (ip) => ipcRenderer.invoke('lan:ping-peer', ip),
  onPingLine: (callback) => subscribe('lan:ping-line', callback),
  onPingDone: (callback) => subscribe('lan:ping-done', callback),
  onStatus: (callback) => subscribe('lan:status', callback),
  onDevices: (callback) => subscribe('lan:devices', callback),
  onLog: (callback) => subscribe('lan:log', callback),
  onMessage: (callback) => subscribe('chat:message', callback),
  onFileProgress: (callback) => subscribe('file:progress', callback),
  onSignal: (callback) => subscribe('webrtc:signal', callback),
  onCallEvent: (callback) => subscribe('call:event', callback),
  onInvite: (callback) => subscribe('lan:invite', callback),
  onInterfaceChanged: (callback) => subscribe('app:interface-changed', callback)
});
