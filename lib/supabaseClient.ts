import { createClient } from '@supabase/supabase-js';
import { safeStorage } from './safeStorage';

// Default credentials provided by user
// NOTE: Using service_role key to allow direct database queries on static hosts like Netlify
const DEFAULT_URL = 'https://cnqpzyanmmwspvemcfeb.supabase.co';
const DEFAULT_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNucXB6eWFubW13c3B2ZW1jZmViIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTgxNTc0MywiZXhwIjoyMDg1MzkxNzQzfQ.ME18iloL44XbOeLo_TbK0CL3n_3jg-uVrr0VaTKZQDI'; 

// Helper to get keys with priority: LocalStorage > Env > Default Constant
const getUrl = () => safeStorage.getItem('supabase_url') || import.meta.env.VITE_SUPABASE_URL || DEFAULT_URL;
const getKey = () => safeStorage.getItem('supabase_key') || import.meta.env.VITE_SUPABASE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY || DEFAULT_KEY;

const supabaseUrl = getUrl();
const supabaseAnonKey = getKey();

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase credentials missing. Please configure them in the Settings page.');
}

// Initialize with a placeholder if missing to prevent crash, but requests will fail until configured
export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder'
);

// Helper to check if we have valid-looking keys
export const isConfigured = () => {
    const url = getUrl();
    const key = getKey();
    return url.length > 0 && key.length > 0 && url !== 'https://placeholder.supabase.co' && key !== 'placeholder';
};