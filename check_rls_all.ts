import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!);

async function check() {
  const { data: m, error: me } = await supabase.from('cv_modalidades').select('*');
  const { data: v, error: ve } = await supabase.from('cv_vacantes').select('*');
  const { data: e, error: ee } = await supabase.from('cv_escuelas').select('*');
  console.log("Mods:", m?.length, me);
  console.log("Vacs:", v?.length, ve);
  console.log("Escs:", e?.length, ee);
}
check();
