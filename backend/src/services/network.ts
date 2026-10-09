import { config } from "../config/index.js";

let _isOnline = false;
let checkInterval: NodeJS.Timeout | null = null;
let consecutiveFailures = 0;
const MAX_FAILURES_BEFORE_OFFLINE = 3;

/**
 * Verifica si hay conexión activa con la base de datos de Supabase.
 * Aplica tolerancia a latencia y fallos intermitentes para evitar fluctuaciones falsas.
 */
export async function checkOnlineStatus(): Promise<boolean> {
  if (!config.SUPABASE_URL) {
    _isOnline = false;
    return false;
  }
  
  try {
    // Timeout prudente de 8 segundos para absorber picos temporales de red o consultas
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 8000);
    
    // Llamar a la API REST de PostgREST de Supabase (url base)
    const response = await fetch(`${config.SUPABASE_URL}/rest/v1/`, {
      method: "GET",
      headers: {
        "apikey": config.SUPABASE_SERVICE_ROLE_KEY
      },
      signal: controller.signal
    });
    
    clearTimeout(id);
    consecutiveFailures = 0;
    _isOnline = true;
  } catch (error) {
    consecutiveFailures++;
    // Solo si falla 3 veces consecutivas declaramos el estado como OFFLINE
    if (consecutiveFailures >= MAX_FAILURES_BEFORE_OFFLINE) {
      _isOnline = false;
    }
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
 * Inicia el monitoreo continuo de red (cada 30s por defecto).
 */
export function startNetworkMonitoring(intervalMs: number = 30000) {
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

