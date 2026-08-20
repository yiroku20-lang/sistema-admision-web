import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL || '', process.env.VITE_SUPABASE_ANON_KEY || '');

async function test() {
  const { data: vData, error: e1 } = await supabase.from("adjudicacion_vacantes").select("modalidad");
  const { data: rData, error: e2 } = await supabase.from("adjudicacion_ranking").select("modalidad");
  
  console.log("vData:", vData?.length, "error:", e1);
  console.log("rData:", rData?.length, "error:", e2);
}
test();
