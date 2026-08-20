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
  
  const byYear: Record<string, Set<string>> = {};

  for (const row of data || []) {
    if (!row.FECHAINGRESO) continue;
    
    // Extract year from date string (like "21/12/2017" or "2020-01-01" or whatever it is)
    let year = "Unknown";
    const dateStr = row.FECHAINGRESO.trim();
    
    // Try to find a 4 digit year
    const yearMatch = dateStr.match(/\b(201\d|202\d)\b/);
    if (yearMatch) {
      year = yearMatch[1];
    } else {
      year = dateStr; // fallback
    }

    if (year >= '2020' && year <= '2027') {
      if (!byYear[year]) byYear[year] = new Set();
      byYear[year].add(row.MODALIDAD);
    }
  }
  
  for (const year of Object.keys(byYear).sort()) {
    console.log(`\n**Año: ${year}**`);
    Array.from(byYear[year]).sort().forEach(m => console.log(`- ${m ? m.trim() : 'Null/Empty'}`));
  }
  
  // Also just list all distinct modalities that have a date >= 2020 just in case
  console.log("\n**TODAS LAS MODALIDADES DE LA TABLA PARTICIPANTES (2020+)**");
  const allModalidades = new Set<string>();
  for (const row of data || []) {
    const dateStr = row.FECHAINGRESO ? row.FECHAINGRESO.trim() : '';
    const yearMatch = dateStr.match(/\b(201\d|202\d)\b/);
    const year = yearMatch ? yearMatch[1] : '';
    if (year >= '2020') {
      if (row.MODALIDAD) allModalidades.add(row.MODALIDAD.trim());
    }
  }
  Array.from(allModalidades).sort().forEach(m => console.log(`- ${m}`));
}

run();
