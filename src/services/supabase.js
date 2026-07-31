import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://cnqpzyanmmwspvemcfeb.supabase.co';
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNucXB6eWFubW13c3B2ZW1jZmViIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk4MTU3NDMsImV4cCI6MjA4NTM5MTc0M30.407B6-8OaE4eS3nL-y4c9w2m8o_v60-31y_613p81-o';

export const supabase = createClient(supabaseUrl, supabaseKey);
