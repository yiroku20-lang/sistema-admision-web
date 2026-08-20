import { createClient } from '@supabase/supabase-js';
import { safeStorage } from './safeStorage';

export const DEFAULT_URL = 'https://cnqpzyanmmwspvemcfeb.supabase.co';

// Clave pública anónima válida y activa de Supabase
export const VALID_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNucXB6eWFubW13c3B2ZW1jZmViIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk4MTU3NDMsImV4cCI6MjA4NTM5MTc0M30.A-aFJv-V4JJvlvWxf4OAYo5xZ-RIkha3O7Umqh4yETs';

// Limpieza de overrides obsoletos en localStorage
try {
  safeStorage.removeItem('supabase_key');
  safeStorage.removeItem('supabase_url');
} catch (e) {
  // ignore
}

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || DEFAULT_URL;
const envKey = import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_KEY;

// Si la variable de entorno contiene la clave corrupta antigua (407B6...) o no es un JWT válido, se usa VALID_ANON_KEY
const supabaseAnonKey = (envKey && envKey.startsWith('eyJ') && !envKey.includes('407B6-8OaE4eS3nL')) 
  ? envKey 
  : VALID_ANON_KEY;

// Helper to safely clear invalid or expired refresh tokens
export const clearStaleAuthTokens = () => {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key && (key.startsWith('sb-') || key.includes('supabase.auth.token'))) {
        localStorage.removeItem(key);
      }
    }
  } catch (e) {
    // ignore
  }
};

// Main public client initialized with anon credentials
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: false,
    detectSessionInUrl: false,
    storage: safeStorage,
    lock: async (_name: string, _acquireTimeout: number, fn: () => Promise<any>) => {
      return await fn();
    },
  },
  global: {
    headers: {
      'apikey': supabaseAnonKey,
      'Authorization': `Bearer ${supabaseAnonKey}`,
    },
  },
});

// Public alias for components to ensure service_role key is never exposed in browser bundles
export const supabaseAdmin = supabase;

export const isConfigured = () => true;
