import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data, error } = await supabase.from('cv_modalidades').select('nombre, semestre');
  if (error) {
    console.error('Error fetching data:', error);
    return;
  }
  
  const bySemestre: Record<string, Set<string>> = {};

  for (const row of data || []) {
    const sem = row.semestre;
    if (sem && sem >= '2020') {
      if (!bySemestre[sem]) bySemestre[sem] = new Set();
      bySemestre[sem].add(row.nombre.trim());
    }
  }
  
  for (const sem of Object.keys(bySemestre).sort()) {
    console.log(`\n**Semestre: ${sem}**`);
    Array.from(bySemestre[sem]).sort().forEach(m => console.log(`- ${m}`));
  }
}

run();
