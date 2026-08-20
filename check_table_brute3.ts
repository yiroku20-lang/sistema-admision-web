import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL || '', process.env.VITE_SUPABASE_ANON_KEY || '');

async function tryTables() {
  const words = ['clasificacion', 'adjudicacion', 'postulantes', 'ranking', 'resultados', 'merito'];
  const tables = new Set<string>();
  
  for (let i of words) {
    for (let j of words) {
        tables.add(i + "_" + j);
        tables.add(i + "_de_" + j);
        tables.add(i + j);
    }
    tables.add(i);
  }
  
  let found = [];
  for (const t of Array.from(tables)) {
    const { data: d, error: e } = await supabase.from(t).select('id').limit(1);
    if (!e) {
      found.push(t);
    }
  }
  console.log("Found:", found);
}

tryTables();
