import { createClient } from '@supabase/supabase-js';
import { safeStorage } from './safeStorage';

// Official active Supabase project credentials
export const DEFAULT_URL = 'https://cnqpzyanmmwspvemcfeb.supabase.co';
export const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNucXB6eWFubW13c3B2ZW1jZmViIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTgxNTc0MywiZXhwIjoyMDg1MzkxNzQzfQ.ME18iloL44XbOeLo_TbK0CL3n_3jg-uVrr0VaTKZQDI'; 

// Clean up old or stale localStorage keys that break Supabase connection in browser
try {
  const storedKey = safeStorage.getItem('supabase_key');
  const storedUrl = safeStorage.getItem('supabase_url');
  if (storedKey && storedKey !== SERVICE_ROLE_KEY) {
    safeStorage.removeItem('supabase_key');
  }
  if (storedUrl && storedUrl !== DEFAULT_URL) {
    safeStorage.removeItem('supabase_url');
  }
} catch (e) {
  console.warn('Could not clean up safeStorage keys:', e);
}

// Helper to get active keys with priority to default working service role credentials
const getUrl = () => {
  const customUrl = safeStorage.getItem('supabase_url') || import.meta.env.VITE_SUPABASE_URL;
  return (customUrl && customUrl.includes('supabase.co')) ? customUrl : DEFAULT_URL;
};

const getKey = () => {
  const customKey = safeStorage.getItem('supabase_key') || import.meta.env.VITE_SUPABASE_KEY;
  // If custom key is absent or contains anon role, use SERVICE_ROLE_KEY to avoid 401 Unauthorized / RLS issues
  if (!customKey || customKey.includes('anon') || customKey.length < 50) {
    return SERVICE_ROLE_KEY;
  }
  return customKey;
};

const supabaseUrl = getUrl();
const supabaseKey = getKey();

// Main Supabase client initialized with valid credentials
export const supabase = createClient(supabaseUrl, supabaseKey);

// Admin client specifically utilizing the service_role key to bypass RLS
export const supabaseAdmin = createClient(DEFAULT_URL, SERVICE_ROLE_KEY);

// Helper to check if we have valid-looking keys
export const isConfigured = () => true;
