import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!);

async function check() {
  const { data, error } = await supabase.from('cv_cuadros_anuales').select(`
    id,
    anio,
    cv_modalidades (
      id,
      cv_vacantes (
        id
      )
    )
  `);
  console.log(JSON.stringify(data, null, 2));
}
check();
