import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL || '', process.env.VITE_SUPABASE_ANON_KEY || '');

async function test() {
  const { count } = await supabase.from('adjudicacion_ranking').select('*', { count: 'exact', head: true });
  console.log("Total records:", count);
}
test();
