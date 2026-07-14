import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || ''
);

async function check() {
  const { data, error } = await supabase.rpc('query_rls', { table_name: 'tramite_seguimiento' });
  if (error) {
    console.error(error);
    const { data: qData, error: qError } = await supabase.from('tramite_seguimiento').select('*').limit(1);
    console.log(qError);
  } else {
    console.log(data);
  }
}
check();
