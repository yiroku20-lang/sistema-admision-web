import dotenv from 'dotenv';
dotenv.config();
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const text = "Cusco Anta";
  const words = text.split(/[\s,/]+/).filter(w => w.trim().length > 0);

  let query = supabase
    .from('ubigeos')
    .select('distrito, provincia, departamento');

  words.forEach(word => {
    query = query.or(`distrito.ilike.%${word}%,provincia.ilike.%${word}%,departamento.ilike.%${word}%`);
  });

  const { data, error } = await query.limit(5);

  console.log("Data:", data);
  console.log("Error:", error);
}

run();
