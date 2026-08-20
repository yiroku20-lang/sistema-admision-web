import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!);

async function check() {
  const { data, error } = await supabase.from('usuarios').select('permissions').eq('name', 'ELIANA').single();
  console.log("Type:", typeof data?.permissions, Array.isArray(data?.permissions));
}
check();
