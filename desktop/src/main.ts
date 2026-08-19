import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import path from 'path';
import { autoUpdater } from 'electron-updater';
import log from 'electron-log';
import isDev from 'electron-is-dev';

// Configurar logger para electron-updater
log.transports.file.level = 'info';
autoUpdater.logger = log;
autoUpdater.autoDownload = false; // Descargar tras confirmación o aviso

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1366,
    height: 850,
    minWidth: 1024,
    minHeight: 700,
    title: 'UNSAAC - Consola de Administración',
    icon: path.join(__dirname, '../build/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
    },
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:3000');
    mainWindow.webContents.openDevTools();
  } else {
    // En producción carga la distribución compilada
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
    if (!isDev) {
      autoUpdater.checkForUpdatesAndNotify().catch((err) => {
        log.error('Error al verificar actualizaciones:', err);
      });
    }
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// ==========================================
// AUTO-UPDATER EVENTS & IPC COMUNICACIÓN
// ==========================================

autoUpdater.on('checking-for-update', () => {
  log.info('Comprobando actualizaciones...');
  sendToWindow('update-status', { status: 'checking', message: 'Buscando actualizaciones...' });
});

autoUpdater.on('update-available', (info) => {
  log.info('Actualización disponible:', info.version);
  sendToWindow('update-status', {
    status: 'available',
    version: info.version,
    releaseDate: info.releaseDate,
    message: `Nueva versión ${info.version} disponible.`,
  });

  if (mainWindow) {
    dialog
      .showMessageBox(mainWindow, {
        type: 'info',
        title: 'Actualización disponible',
        message: `Se ha encontrado una nueva versión (${info.version}). ¿Deseas descargarla ahora?`,
        buttons: ['Descargar e instalar', 'Recordar más tarde'],
        defaultId: 0,
        cancelId: 1,
      })
      .then((result) => {
        if (result.response === 0) {
          autoUpdater.downloadUpdate();
        }
      });
  }
});

autoUpdater.on('update-not-available', (info) => {
  log.info('La aplicación está actualizada:', info.version);
  sendToWindow('update-status', { status: 'not-available', message: 'La aplicación está al día.' });
});

autoUpdater.on('error', (err) => {
  log.error('Error en el auto-updater:', err);
  sendToWindow('update-status', { status: 'error', error: err.message });
});

autoUpdater.on('download-progress', (progressObj) => {
  const percent = Math.round(progressObj.percent);
  log.info(`Descargando actualización: ${percent}%`);
  sendToWindow('update-status', {
    status: 'downloading',
    percent,
    bytesPerSecond: progressObj.bytesPerSecond,
    transferred: progressObj.transferred,
    total: progressObj.total,
  });
});

autoUpdater.on('update-downloaded', (info) => {
  log.info('Actualización descargada:', info.version);
  sendToWindow('update-status', {
    status: 'downloaded',
    version: info.version,
    message: 'Actualización lista para instalar.',
  });

  if (mainWindow) {
    dialog
      .showMessageBox(mainWindow, {
        type: 'info',
        title: 'Actualización lista',
        message: `La versión ${info.version} se descargó correctamente. La aplicación se reiniciará para aplicar los cambios.`,
        buttons: ['Reiniciar y Actualizar'],
      })
      .then(() => {
        autoUpdater.quitAndInstall(false, true);
      });
  }
});

// Canales IPC invocables desde el frontend
ipcMain.handle('app-version', () => {
  return app.getVersion();
});

ipcMain.handle('check-for-updates', async () => {
  if (isDev) {
    return { status: 'dev-mode', message: 'Auto-updater deshabilitado en modo desarrollo.' };
  }
  return await autoUpdater.checkForUpdates();
});

ipcMain.handle('download-update', async () => {
  return await autoUpdater.downloadUpdate();
});

ipcMain.handle('quit-and-install', () => {
  autoUpdater.quitAndInstall(false, true);
});

function sendToWindow(channel: string, data: any) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, data);
  }
}
