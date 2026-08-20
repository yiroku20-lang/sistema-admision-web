import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();
const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);
async function run() {
  const { data: yData, error: yErr } = await supabase.from('participantes').select('ANIO');
  const years = [...new Set(yData.map(d => d.ANIO).filter(Boolean))].sort();
  console.log('Years:', years);
  
  const { data: sData, error: sErr } = await supabase.from('participantes').select('SEMESTRE');
  const semesters = [...new Set(sData.map(d => d.SEMESTRE).filter(Boolean))].sort();
  console.log('Semesters:', semesters);
}
run();
