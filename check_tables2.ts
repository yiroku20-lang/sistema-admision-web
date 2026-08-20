import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL || '', 
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

async function test() {
  const { data, error } = await supabaseAdmin.rpc('get_tables', {});
  console.log("get_tables:", error);
}
test();
