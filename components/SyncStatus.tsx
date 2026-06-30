import React, { useState, useEffect } from "react";

interface SyncStatusData {
  online: boolean;
  syncing: boolean;
  pendingMutationsCount: number;
  periodo: string;
}

export const SyncStatus: React.FC = () => {
  const [status, setStatus] = useState<SyncStatusData>({
    online: false,
    syncing: false,
    pendingMutationsCount: 0,
    periodo: "..."
  });
  
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [updateDownloaded, setUpdateDownloaded] = useState(false);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);

  const API_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:5000";

  // 1. Consultar estado del backend local
  const fetchStatus = async () => {
    try {
      const res = await fetch(`${API_URL}/api/sync/status`);
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
      }
    } catch (err) {
      // Si el backend no responde, asumir desconexión completa de la app local
      setStatus(prev => ({ ...prev, online: false, syncing: false }));
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 10000); // Polling cada 10 segundos
    return () => clearInterval(interval);
  }, []);

  // 2. Escuchar eventos de actualización de Electron
  useEffect(() => {
    if (window.electronAPI) {
      const unsubscribeAvailable = window.electronAPI.onUpdateAvailable(() => {
        setUpdateAvailable(true);
      });

      const unsubscribeDownloaded = window.electronAPI.onUpdateDownloaded(() => {
        setUpdateAvailable(false);
        setUpdateDownloaded(true);
      });

      return () => {
        unsubscribeAvailable();
        unsubscribeDownloaded();
      };
    }
  }, []);

  // 3. Forzar Sincronización Manual
  const handleForceSync = async () => {
    setLoadingAction("sync");
    try {
      const res = await fetch(`${API_URL}/api/sync/trigger`, { method: "POST" });
      if (res.ok) {
        alert("Sincronización manual iniciada en segundo plano.");
        fetchStatus();
      }
    } catch (err) {
      alert("Error al intentar conectar con el servidor local.");
    } finally {
      setLoadingAction(null);
    }
  };

  // 4. Forzar Respaldo Físico Manual (de los 400 GB)
  const handleForceBackup = async () => {
    setLoadingAction("backup");
    try {
      const res = await fetch(`${API_URL}/api/sync/backup`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        alert(`Copia de seguridad física exitosa! Archivos respaldados: ${data.filesCopied}`);
      } else {
        const errData = await res.json();
        alert(`Error en respaldo: ${errData.error}`);
      }
    } catch (err) {
      alert("Error de conexión al ejecutar el respaldo.");
    } finally {
      setLoadingAction(null);
    }
  };

  const applyUpdate = () => {
    if (window.electronAPI) {
      window.electronAPI.restartAppForUpdate();
    }
  };

  return (
    <div style={styles.container}>
      {/* Indicador de Periodo Activo */}
      <div style={styles.badge}>
        <span>Periodo: <strong>{status.periodo}</strong></span>
      </div>

      {/* Indicador de Red */}
      <div style={styles.statusGroup}>
        {status.online ? (
          <span style={{ ...styles.badge, ...styles.online }}>
            🟢 Conectado a la Nube (Supabase)
          </span>
        ) : (
          <span style={{ ...styles.badge, ...styles.offline }}>
            🔴 Trabajando en Local (Offline)
          </span>
        )}
        
        {status.syncing && (
          <span style={{ ...styles.badge, ...styles.syncing }}>
            ⏳ Sincronizando datos...
          </span>
        )}

        {status.pendingMutationsCount > 0 && (
          <span style={{ ...styles.badge, ...styles.pendingCount }} title="Cambios locales pendientes de subir a Supabase">
            📦 {status.pendingMutationsCount} pendientes
          </span>
        )}
      </div>

      {/* Acciones Rápidas */}
      <div style={styles.actions}>
        <button 
          onClick={handleForceSync} 
          disabled={!status.online || status.syncing || loadingAction !== null}
          style={styles.button}
        >
          {loadingAction === "sync" ? "Sincronizando..." : "Sincronizar"}
        </button>

        <button 
          onClick={handleForceBackup} 
          disabled={loadingAction !== null}
          style={styles.button}
          title="Respaldar físicamente archivos de C:/Sistema_Archivos/"
        >
          {loadingAction === "backup" ? "Respaldando..." : "Respaldo Físico"}
        </button>
      </div>

      {/* Notificación de Actualización */}
      {updateDownloaded && (
        <div style={styles.updateBanner}>
          <span>¡Nueva versión disponible y descargada! </span>
          <button onClick={applyUpdate} style={styles.updateButton}>
            Reiniciar y Aplicar
          </button>
        </div>
      )}
      {updateAvailable && !updateDownloaded && (
        <div style={{ ...styles.updateBanner, backgroundColor: "#e6c200" }}>
          <span>Descargando actualización en segundo plano... ⏳</span>
        </div>
      )}
    </div>
  );
};

// Declaración global para evitar errores de compilación TS en React
declare global {
  interface Window {
    electronAPI?: {
      getAppVersion: () => Promise<string>;
      restartAppForUpdate: () => Promise<void>;
      onUpdateAvailable: (callback: (info: any) => void) => () => void;
      onUpdateDownloaded: (callback: (info: any) => void) => () => void;
    };
  }
}

const styles = {
  container: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "8px 16px",
    backgroundColor: "#1e293b",
    color: "#f8fafc",
    fontFamily: "'Segoe UI', Roboto, sans-serif",
    fontSize: "14px",
    gap: "16px",
    borderBottom: "1px solid #334155"
  },
  statusGroup: {
    display: "flex",
    gap: "8px"
  },
  badge: {
    display: "flex",
    alignItems: "center",
    padding: "4px 8px",
    borderRadius: "4px",
    backgroundColor: "#334155",
    color: "#f8fafc"
  },
  online: {
    backgroundColor: "#065f46",
    color: "#34d399",
    fontWeight: "600" as const
  },
  offline: {
    backgroundColor: "#991b1b",
    color: "#fca5a5",
    fontWeight: "600" as const
  },
  syncing: {
    backgroundColor: "#854d0e",
    color: "#fef08a"
  },
  pendingCount: {
    backgroundColor: "#1e3a8a",
    color: "#93c5fd"
  },
  actions: {
    display: "flex",
    gap: "8px"
  },
  button: {
    padding: "6px 12px",
    backgroundColor: "#4f46e5",
    color: "white",
    border: "none",
    borderRadius: "4px",
    cursor: "pointer",
    fontSize: "12px",
    fontWeight: "500" as const
  },
  updateBanner: {
    padding: "6px 12px",
    backgroundColor: "#16a34a",
    color: "white",
    borderRadius: "4px",
    display: "flex",
    alignItems: "center",
    gap: "8px"
  },
  updateButton: {
    padding: "4px 8px",
    backgroundColor: "white",
    color: "#16a34a",
    border: "none",
    borderRadius: "3px",
    cursor: "pointer",
    fontWeight: "bold" as const,
    fontSize: "12px"
  }
};
