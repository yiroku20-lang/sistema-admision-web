const { contextBridge, ipcRenderer } = require("electron");

// Exponer APIs seguras y limitadas al Frontend de React
contextBridge.exposeInMainWorld("electronAPI", {
  getAppVersion: () => ipcRenderer.invoke("get-app-version"),
  restartAppForUpdate: () => ipcRenderer.invoke("restart-app-for-update"),
  
  // Suscriptores de Eventos para actualizaciones automáticas
  onUpdateAvailable: (callback) => {
    const subscription = (event, info) => callback(info);
    ipcRenderer.on("update-available", subscription);
    return () => ipcRenderer.removeListener("update-available", subscription);
  },
  
  onUpdateDownloaded: (callback) => {
    const subscription = (event, info) => callback(info);
    ipcRenderer.on("update-downloaded", subscription);
    return () => ipcRenderer.removeListener("update-downloaded", subscription);
  }
});
