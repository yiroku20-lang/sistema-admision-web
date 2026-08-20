import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const supabase = createClient(process.env.VITE_SUPABASE_URL || '', process.env.VITE_SUPABASE_ANON_KEY || '');
async function main() {
  const { data, error } = await supabase.from('clasificacion_de_adjudicacion').select('*').limit(5);
  console.log("View data:", data);
  console.log("View error:", error);
}
main();
