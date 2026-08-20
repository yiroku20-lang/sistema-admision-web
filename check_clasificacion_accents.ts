import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL || '', process.env.VITE_SUPABASE_ANON_KEY || '');

async function test() {
  const { data, error } = await supabase
    .from('clasificación_de_adjudicación')
    .select('*')
    .limit(1);

  console.log("clasificación_de_adjudicación:", data, error);
}
test();
