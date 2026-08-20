import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL || '', 
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || ''
);

async function run() {
  console.log("running sql via RPC or testing if RLS is effectively disabled...");
  const { error } = await supabaseAdmin.from('adjudicacion_vacantes').insert([
    { escuela: 'Test', area: 'A', vacantes_totales: 1, vacantes_disponibles: 1, modalidad: 'Test_RLS' }
  ]);
  console.log("Insert error with anon:", error);
}
run();
