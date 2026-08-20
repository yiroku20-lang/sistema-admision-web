import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY! || process.env.VITE_SUPABASE_ANON_KEY!);

async function main() {
  const { error } = await supabase.rpc('execute_sql', {
    sql_query: "ALTER TABLE prospectos_vocacionales ADD COLUMN IF NOT EXISTS grado_academico TEXT;"
  });
  console.log("RPC Error (if any):", error);
}
main();
