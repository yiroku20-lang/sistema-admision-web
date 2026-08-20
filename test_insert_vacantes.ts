import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL || '', process.env.VITE_SUPABASE_ANON_KEY || '');

async function testInsert() {
  const { error } = await supabase.from('adjudicacion_vacantes').insert([
    { escuela: 'Test', area: 'A', vacantes_totales: 1, vacantes_disponibles: 1, modalidad: 'Test' }
  ]);
  console.log("Insert error:", error);
}
testInsert();
