const { contextBridge, ipcRenderer } = require("electron");

// Exposer API segura e integral al Frontend de React
contextBridge.exposeInMainWorld("electronAPI", {
  getVersion: () => ipcRenderer.invoke("get-app-version"),
  getAppVersion: () => ipcRenderer.invoke("get-app-version"),
  checkForUpdates: () => ipcRenderer.invoke("check-for-updates"),
  downloadUpdate: () => ipcRenderer.invoke("download-update"),
  quitAndInstall: () => ipcRenderer.invoke("quit-and-install"),
  restartAppForUpdate: () => ipcRenderer.invoke("restart-app-for-update"),
  restartApp: () => ipcRenderer.invoke("restart-app"),
  login: (credentials) => ipcRenderer.invoke("auth-login", credentials),
  getUsers: () => ipcRenderer.invoke("users-get"),
  createUser: (data) => ipcRenderer.invoke("users-create", data),
  updateUser: (id, data) => ipcRenderer.invoke("users-update", { id, ...data }),
  deleteUser: (id) => ipcRenderer.invoke("users-delete", { id }),
  updateUserPassword: (userId, password) => ipcRenderer.invoke("users-update-password", { userId, password }),
  
  onUpdateStatus: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on("update-status", subscription);
    return () => ipcRenderer.removeListener("update-status", subscription);
  },
  
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
