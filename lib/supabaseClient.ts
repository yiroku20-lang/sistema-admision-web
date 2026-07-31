import { createClient } from '@supabase/supabase-js';
import { safeStorage } from './safeStorage';

// Default credentials provided by user
const DEFAULT_URL = 'https://cnqpzyanmmwspvemcfeb.supabase.co';
export const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNucXB6eWFubW13c3B2ZW1jZmViIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTgxNTc0MywiZXhwIjoyMDg1MzkxNzQzfQ.ME18iloL44XbOeLo_TbK0CL3n_3jg-uVrr0VaTKZQDI'; 

// Automatically clear stale anon key if previously stored in browser localStorage
const storedKey = safeStorage.getItem('supabase_key');
if (storedKey && storedKey.includes('"role":"anon"')) {
  safeStorage.removeItem('supabase_key');
}

// Helper to get keys with priority: LocalStorage > Env > Default Constant
const getUrl = () => safeStorage.getItem('supabase_url') || import.meta.env.VITE_SUPABASE_URL || DEFAULT_URL;
const getKey = () => {
  const key = safeStorage.getItem('supabase_key') || import.meta.env.VITE_SUPABASE_KEY;
  // If no explicit service key is provided in local storage or env, fallback to SERVICE_ROLE_KEY
  if (!key || key.includes('"role":"anon"')) {
    return SERVICE_ROLE_KEY;
  }
  return key;
};

const supabaseUrl = getUrl();
const supabaseKey = getKey();

if (!supabaseUrl || !supabaseKey) {
  console.warn('Supabase credentials missing. Please configure them in the Settings page.');
}

// Main Supabase client initialized with service role key unless overridden
export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseKey || 'placeholder'
);

// Admin client specifically utilizing the service_role key to bypass RLS for system endpoints
export const supabaseAdmin = createClient(
  DEFAULT_URL,
  SERVICE_ROLE_KEY
);

// Helper to check if we have valid-looking keys
export const isConfigured = () => {
    const url = getUrl();
    const key = getKey();
    return url.length > 0 && key.length > 0 && url !== 'https://placeholder.supabase.co' && key !== 'placeholder';
};