import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data, error } = await supabase.from('participantes').select('MODALIDAD, FECHAINGRESO');
  if (error) {
    console.error('Error fetching data:', error);
    return;
  }
  
  const allModalidades = new Set<string>();
  for (const row of data || []) {
    if (row.MODALIDAD) {
      allModalidades.add(`${row.MODALIDAD.trim()} [${row.FECHAINGRESO}]`);
    }
  }
  
  console.log("=== TODAS LAS MODALIDADES CON SUS FECHAS ===");
  Array.from(allModalidades).sort().forEach(m => console.log(m));
}
run();
