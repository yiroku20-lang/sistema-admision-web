import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const { data, error } = await supabase
    .from('participantes')
    .select('CODPOSTULANTE, NOMBRE, CARRERA, MODALIDAD, ANIO, SEMESTRE')
    .gte('ANIO', '2023')
    .limit(10);
  console.log("Sample data:", data);
}
run();
