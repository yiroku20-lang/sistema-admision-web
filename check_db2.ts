import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
supabase.from('expedientes').select('created_by').limit(5).then(({ data, error }) => {
  if (error) console.error("expedientes error:", error);
  else console.log("expedientes created_by:", data);
});
