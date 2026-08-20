import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL || '', process.env.VITE_SUPABASE_ANON_KEY || '');

async function test() {
  const { data, error } = await supabase
    .from('cv_escuelas')
    .select('*')
    .limit(1);

  console.log("cv_escuelas:", data, error);
}
test();
