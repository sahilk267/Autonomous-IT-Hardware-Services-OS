const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('apexDesktop', Object.freeze({
  getSetupToken: workspaceId => ipcRenderer.invoke('desktop:get-setup-token', workspaceId || ''),
  openSettings: () => ipcRenderer.invoke('desktop:open-settings'),
}));

// The main process rejects ALL configuration IPC unless the request originates
// from the exact, trusted local setup.html window.
contextBridge.exposeInMainWorld('apexDesktopSetup', Object.freeze({
  getConfig: () => ipcRenderer.invoke('desktop:setup-config'),
  chooseDirectory: () => ipcRenderer.invoke('desktop:choose-directory'),
  save: value => ipcRenderer.invoke('desktop:save-config', value),
}));
