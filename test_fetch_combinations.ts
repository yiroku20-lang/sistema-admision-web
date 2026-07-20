import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();
const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);
async function run() {
  const { data, error } = await supabase.from('participantes').select('ANIO, SEMESTRE').limit(10000);
  if(error) console.log(error);
  
  const combos = new Set(data.map(d => `${d.ANIO}|${d.SEMESTRE}`));
  console.log(combos);
}
run();
