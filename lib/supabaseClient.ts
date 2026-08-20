import { createClient } from '@supabase/supabase-js';
import { safeStorage } from './safeStorage';

export const DEFAULT_URL = 'https://cnqpzyanmmwspvemcfeb.supabase.co';
export const VALID_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNucXB6eWFubW13c3B2ZW1jZmViIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk4MTU3NDMsImV4cCI6MjA4NTM5MTc0M30.A-aFJv-V4JJvlvWxf4OAYo5xZ-RIkha3O7Umqh4yETs';

// Limpieza de overrides obsoletos en localStorage
try {
  safeStorage.removeItem('supabase_key');
  safeStorage.removeItem('supabase_url');
} catch (e) {}

const supabaseUrl = (import.meta as any).env?.VITE_SUPABASE_URL || DEFAULT_URL;
const envKey = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || (import.meta as any).env?.VITE_SUPABASE_KEY;

const supabaseAnonKey = (envKey && envKey.startsWith('eyJ') && !envKey.includes('407B6-8OaE4eS3nL')) 
  ? envKey 
  : VALID_ANON_KEY;

export const clearStaleAuthTokens = () => {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key && (key.startsWith('sb-') || key.includes('supabase.auth.token'))) {
        localStorage.removeItem(key);
      }
    }
  } catch (e) {}
};

// Custom fetch con reintento automático
const customFetchWithRetry = async (url: RequestInfo | URL, options?: RequestInit): Promise<Response> => {
  try {
    const res = await fetch(url, options);
    if (!res.ok && (res.status === 502 || res.status === 503 || res.status === 504)) {
      await new Promise(r => setTimeout(r, 600));
      return await fetch(url, options);
    }
    return res;
  } catch (err: any) {
    await new Promise(r => setTimeout(r, 600));
    return await fetch(url, options);
  }
};

// Cliente Supabase conectado sin bloquear Authorization header
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    storage: safeStorage,
    lock: async (_name: string, _acquireTimeout: number, fn: () => Promise<any>) => {
      return await fn();
    },
  },
  global: {
    fetch: customFetchWithRetry,
    headers: {
      'apikey': supabaseAnonKey,
    },
  },
});

export const supabaseAdmin = supabase;
export const isConfigured = () => true;
