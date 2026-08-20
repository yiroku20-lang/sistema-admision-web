import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL || '', process.env.VITE_SUPABASE_ANON_KEY || '');

async function test() {
  const { data, error } = await supabase
    .from('cv_vacantes')
    .select('cantidad, cv_escuelas(nombre, area)')
    .limit(1);

  console.log("Joined vacantes:", JSON.stringify(data, null, 2), error);
}
test();
