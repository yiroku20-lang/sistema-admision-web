import { createClient } from '@supabase/supabase-js';
import { safeStorage } from './safeStorage';

export const DEFAULT_URL = 'https://cnqpzyanmmwspvemcfeb.supabase.co';

// Clean up stale local storage overrides if present
try {
  safeStorage.removeItem('supabase_key');
  safeStorage.removeItem('supabase_url');
} catch (e) {
  // ignore
}

// 1. Initialize Supabase client using strictly public anon key or env variables
const VALID_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNucXB6eWFubW13c3B2ZW1jZmViIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk4MTU3NDMsImV4cCI6MjA4NTM5MTc0M30.A-aFJv-V4JJvlvWxf4OAYo5xZ-RIkha3O7Umqh4yETs';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || DEFAULT_URL;
const envKey = import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_KEY;

// Si envKey existe pero es la clave alterada antigua (407B6...), usar VALID_ANON_KEY
const supabaseAnonKey = (envKey && !envKey.includes('407B6-8OaE4eS3nL')) ? envKey : VALID_ANON_KEY;

// Main public client initialized with anon credentials
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Public alias for components to ensure service_role key is never exposed in browser bundles
export const supabaseAdmin = supabase;

export const isConfigured = () => true;
