import { config } from "../config/index.js";

let _isOnline = false;
let checkInterval: NodeJS.Timeout | null = null;

/**
 * Verifica si hay conexión activa con la base de datos de Supabase.
 */
export async function checkOnlineStatus(): Promise<boolean> {
  if (!config.SUPABASE_URL) {
    _isOnline = false;
    return false;
  }
  
  try {
    // Intentar un fetch rápido al health check o url base de Supabase
    // con un timeout bajo (3 segundos) para no congelar hilos
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 3000);
    
    // Llamar a la API REST de PostgREST de Supabase (url base)
    const response = await fetch(`${config.SUPABASE_URL}/rest/v1/`, {
      method: "GET",
      headers: {
        "apikey": config.SUPABASE_SERVICE_ROLE_KEY
      },
      signal: controller.signal
    });
    
    clearTimeout(id);
    _isOnline = true; // Si el servidor respondió (incluso con 401/403/404), estamos conectados a la nube
  } catch (error) {
    _isOnline = false;
  }
  
  return _isOnline;
}

type StatusCallback = (online: boolean) => void;
const statusListeners: StatusCallback[] = [];

export function onNetworkStatusChange(callback: StatusCallback) {
  statusListeners.push(callback);
}

/**
 * Obtiene el estado actual guardado en memoria.
 */
export function isOnline(): boolean {
  return _isOnline;
}

/**
 * Inicia el monitoreo continuo de red.
 */
export function startNetworkMonitoring(intervalMs: number = 15000) {
  checkOnlineStatus();
  
  if (checkInterval) {
    clearInterval(checkInterval);
  }
  
  checkInterval = setInterval(async () => {
    const oldStatus = _isOnline;
    const status = await checkOnlineStatus();
    if (status !== oldStatus) {
      console.log(`[Network Service] Conexión cambió a: ${status ? "ONLINE 🟢" : "OFFLINE 🔴"}`);
      for (const listener of statusListeners) {
        try {
          listener(status);
        } catch (err) {
          console.error("[Network Service] Error en callback de cambio de red:", err);
        }
      }
    }
  }, intervalMs);
}

/**
 * Detiene el monitoreo continuo de red.
 */
export function stopNetworkMonitoring() {
  if (checkInterval) {
    clearInterval(checkInterval);
    checkInterval = null;
  }
}
