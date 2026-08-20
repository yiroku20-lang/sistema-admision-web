import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL || '', process.env.VITE_SUPABASE_ANON_KEY || '');

async function test() {
  const { data, error } = await supabase
    .from('adjudicacion_vacantes')
    .select('modalidad')
    .limit(1);

  console.log("Vacantes select error:", error);

  const { data: rank, error: rankErr } = await supabase
    .from('adjudicacion_ranking')
    .select('modalidad')
    .limit(1);

  console.log("Ranking select error:", rankErr);
}
test();
