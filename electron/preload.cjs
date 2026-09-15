const { contextBridge, ipcRenderer } = require("electron");

// Una API pequeña y explícita. La página no recibe acceso a Node ni a ipcRenderer.
contextBridge.exposeInMainWorld("jarvisDesktop", {
  status: () => ipcRenderer.invoke("desktop:status"),
  checkUpdates: () => ipcRenderer.invoke("desktop:check-updates"),
  installUpdate: () => ipcRenderer.invoke("desktop:install-update"),
  setLogin: (enabled) => ipcRenderer.invoke("desktop:set-login", enabled),
  openData: () => ipcRenderer.invoke("desktop:open-data"),
  testNotification: () => ipcRenderer.invoke("desktop:test-notification"),
  prepareAI: () => ipcRenderer.invoke("desktop:prepare-ai"),
  onStatus: (callback) => {
    const listener = (_event, status) => callback(status);
    ipcRenderer.on("desktop:status", listener);
    return () => ipcRenderer.removeListener("desktop:status", listener);
  },
});
