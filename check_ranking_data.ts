import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL || '', process.env.VITE_SUPABASE_ANON_KEY || '');

async function test() {
  const { data, error } = await supabase
    .from('adjudicacion_ranking')
    .select('*')
    .limit(10);
    
  console.log("adjudicacion_ranking:", JSON.stringify(data, null, 2), error);
}
test();
