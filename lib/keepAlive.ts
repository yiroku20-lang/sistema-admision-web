import { DEFAULT_URL, VALID_ANON_KEY } from './supabaseClient';

let heartbeatTimer: any = null;
let lastPingTime = 0;

/**
 * Pings the Supabase REST endpoint with a lightweight HEAD/GET request
 * to keep TCP/TLS sockets warm and detect connectivity.
 */
export async function pingSupabase(): Promise<boolean> {
  const now = Date.now();
  // Throttle consecutive pings if called within 5 seconds
  if (now - lastPingTime < 5000) {
    return true;
  }
  lastPingTime = now;

  try {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || DEFAULT_URL;
    const envKey = import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_KEY;
    const apiKey = (envKey && envKey.startsWith('eyJ') && !envKey.includes('407B6-8OaE4eS3nL'))
      ? envKey
      : VALID_ANON_KEY;

    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timeoutId = controller ? setTimeout(() => controller.abort(), 6000) : null;

    const response = await fetch(`${supabaseUrl}/rest/v1/`, {
      method: 'GET',
      headers: {
        'apikey': apiKey,
        'Accept': 'application/json',
      },
      signal: controller?.signal,
      cache: 'no-store',
    });

    if (timeoutId) clearTimeout(timeoutId);
    return response.ok || response.status === 200 || response.status === 404;
  } catch (err) {
    // Network offline or timeout - ping failed silently
    return false;
  }
}

/**
 * Initializes the Keep-Alive & Auto-Reconnect system:
 * 1. 90-second heartbeat ping to prevent proxy/NAT TCP socket drops.
 * 2. Immediate reconnection trigger on tab focus or visibility change.
 * 3. Network online listener to restore socket health instantly.
 */
export function initKeepAliveSystem(): () => void {
  if (typeof window === 'undefined') {
    return () => {};
  }

  // 1. Start periodic 90s heartbeat
  const startHeartbeat = () => {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    heartbeatTimer = setInterval(() => {
      // Only ping if document is visible or if window has focus to save bandwidth/battery
      if (!document.hidden) {
        pingSupabase();
      }
    }, 90000); // 90 seconds
  };

  // 2. React to tab visibility change / focus
  const handleVisibilityOrFocus = () => {
    if (!document.hidden) {
      // User returned to tab -> trigger immediate wake-up ping
      pingSupabase();
    }
  };

  // 3. React to network coming back online
  const handleOnline = () => {
    pingSupabase();
  };

  // Initial immediate warm-up ping
  pingSupabase();
  startHeartbeat();

  // Attach event listeners
  window.addEventListener('focus', handleVisibilityOrFocus);
  document.addEventListener('visibilitychange', handleVisibilityOrFocus);
  window.addEventListener('online', handleOnline);

  // Return cleanup function
  return () => {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
    window.removeEventListener('focus', handleVisibilityOrFocus);
    document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
    window.removeEventListener('online', handleOnline);
  };
}
