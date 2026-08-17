const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");
const { fork, execFile } = require("child_process");
const { autoUpdater } = require("electron-updater");

let mainWindow = null;
let backendProcess = null;
let biometricProcess = null;

const isDev = !app.isPackaged;

// 1. Iniciar el Servidor Backend en Producción
function startBackend() {
  if (isDev) {
    console.log("[Electron Main] Modo desarrollo: Expreso ya iniciado por concurrently.");
    return;
  }
  
  try {
    const serverPath = path.join(__dirname, "backend/dist/server.js");
    console.log(`[Electron Main] Iniciando backend de producción en: ${serverPath}`);
    
    // Lanzar Express como un proceso secundario (fork)
    backendProcess = fork(serverPath, [], {
      env: { ...process.env, NODE_ENV: "production" }
    });
    
    backendProcess.on("error", (err) => {
      console.error("[Electron Main] Error al arrancar el backend de producción:", err);
    });
    
    backendProcess.on("exit", (code) => {
      console.log(`[Electron Main] El proceso del backend salio con codigo: ${code}`);
    });
  } catch (err) {
    console.error("[Electron Main] Excepcion al arrancar el backend:", err);
  }
}

// 1b. Iniciar el Puente Biométrico DigitalPersona (Puerto 8081)
function startBiometricBridge() {
  try {
    let bridgeExePath;
    if (isDev) {
      bridgeExePath = path.join(__dirname, "biometric/BiometricBridge.exe");
    } else {
      bridgeExePath = path.join(process.resourcesPath, "biometric/BiometricBridge.exe");
    }

    if (!fs.existsSync(bridgeExePath)) {
      console.warn("[Electron Main] BiometricBridge.exe no encontrado en:", bridgeExePath);
      return;
    }

    console.log(`[Electron Main] Iniciando Puente Biométrico DigitalPersona en: ${bridgeExePath}`);

    biometricProcess = execFile(bridgeExePath, [], {
      cwd: path.dirname(bridgeExePath),
      windowsHide: true
    });

    biometricProcess.on("error", (err) => {
      console.error("[Electron Main] Error en proceso BiometricBridge:", err);
    });

    biometricProcess.on("exit", (code) => {
      console.log(`[Electron Main] El puente biometrico finalizo con codigo: ${code}`);
    });
  } catch (err) {
    console.error("[Electron Main] Excepcion al arrancar el puente biometrico:", err);
  }
}

// 2. Crear Ventana Principal
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    title: "Sistema de Admisión Híbrido",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true, // Aislamiento de contexto obligatorio
      nodeIntegration: false  // Desactivar Node directo en frontend
    }
  });
  
  if (isDev) {
    // Apuntar al servidor de desarrollo de la app (Vite + Express en puerto 3000)
    mainWindow.loadURL("http://127.0.0.1:3000");
    mainWindow.webContents.openDevTools();
  } else {
    // Cargar el build compilado estático de React (Soporte multiruta para app.asar y produccion)
    let indexPath = path.join(app.getAppPath(), "frontend/dist/index.html");
    if (!fs.existsSync(indexPath)) {
      indexPath = path.join(__dirname, "frontend/dist/index.html");
    }
    if (!fs.existsSync(indexPath)) {
      indexPath = path.join(__dirname, "../frontend/dist/index.html");
    }
    console.log("[Electron Main] Cargando interfaz gráfica desde:", indexPath);
    mainWindow.loadFile(indexPath).catch((err) => {
      console.error("[Electron Main] Error al cargar index.html:", err);
    });
  }
  
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// 3. Configurar Auto-Actualizador (electron-updater)
function setupAutoUpdater() {
  if (isDev) return;
  
  autoUpdater.on("checking-for-update", () => {
    console.log("[Updater] Buscando actualizaciones...");
  });
  
  autoUpdater.on("update-available", (info) => {
    console.log("[Updater] Nueva actualización disponible.");
    if (mainWindow) {
      mainWindow.webContents.send("update-available", info);
    }
  });
  
  autoUpdater.on("update-not-available", () => {
    console.log("[Updater] Aplicación actualizada.");
  });
  
  autoUpdater.on("error", (err) => {
    console.error("[Updater] Error durante actualización:", err);
  });
  
  autoUpdater.on("update-downloaded", (info) => {
    console.log("[Updater] Actualización descargada. Lista para instalar.");
    if (mainWindow) {
      mainWindow.webContents.send("update-downloaded", info);
    }
  });
  
  // Revisar actualizaciones silenciosamente a los 10 segundos de iniciar
  setTimeout(() => {
    autoUpdater.checkForUpdatesAndNotify();
  }, 10000);
}

// 4. Ciclo de Vida de Electron
app.whenReady().then(() => {
  startBackend();
  startBiometricBridge();
  createWindow();
  setupAutoUpdater();
  
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  // Cerrar procesos secundarios al cerrar la ventana de Electron
  if (backendProcess) {
    try { backendProcess.kill(); } catch (e) {}
  }
  if (biometricProcess) {
    try { biometricProcess.kill(); } catch (e) {}
  }
  if (process.platform !== "darwin") {
    app.quit();
  }
});

// 5. Respuestas a llamadas IPC del Preload (React -> Electron Main)
ipcMain.handle("get-app-version", () => {
  return app.getVersion();
});

ipcMain.handle("restart-app-for-update", () => {
  // Instala la nueva versión descargada y reinicia la app
  autoUpdater.quitAndInstall();
});
