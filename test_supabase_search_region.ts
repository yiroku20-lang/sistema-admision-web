import dotenv from 'dotenv';
dotenv.config();
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const text = "SA";
  const region = "Cusco / Anta / Anta";
  const words = text.split(/[\s,/]+/).filter(w => w.length > 0);

  let regionQuery = supabase
    .from('colegios')
    .select('nombre_ie, codigo_modular, departamento_provincia_distrito')
    .ilike('departamento_provincia_distrito', region);
    
  words.forEach(word => {
    regionQuery = regionQuery.or(`nombre_ie.ilike.%${word}%,departamento_provincia_distrito.ilike.%${word}%`);
  });

  const { data, error } = await regionQuery.limit(10);
  
  console.log("Region Query Data:", data?.length);
  console.log(data);
  console.log("Error:", error);
}

run();
