import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL || '', process.env.VITE_SUPABASE_ANON_KEY || '');

async function test() {
  const { data: d1 } = await supabase.from('clasificacion').select('*').limit(1);
  const { data: d2 } = await supabase.from('clasificaciones').select('*').limit(1);
  const { data: d3 } = await supabase.from('Clasificacion_de_adjudicacion').select('*').limit(1);
  const { data: d4 } = await supabase.from('cv_clasificacion_adjudicacion').select('*').limit(1);
  
  console.log("d3:", d3);
}
test();
