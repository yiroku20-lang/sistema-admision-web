import { contextBridge, ipcRenderer } from 'electron';

export interface ElectronUpdateStatus {
  status: 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error' | 'dev-mode';
  version?: string;
  percent?: number;
  message?: string;
  error?: string;
}

// Exponer APIs seguras al proceso de renderizado (React)
contextBridge.exposeInMainWorld('electronAPI', {
  getVersion: () => ipcRenderer.invoke('app-version'),
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  downloadUpdate: () => ipcRenderer.invoke('download-update'),
  quitAndInstall: () => ipcRenderer.invoke('quit-and-install'),
  onUpdateStatus: (callback: (status: ElectronUpdateStatus) => void) => {
    const subscription = (_event: any, value: ElectronUpdateStatus) => callback(value);
    ipcRenderer.on('update-status', subscription);
    return () => {
      ipcRenderer.removeListener('update-status', subscription);
    };
  },
});
