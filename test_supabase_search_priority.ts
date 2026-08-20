import dotenv from 'dotenv';
dotenv.config();
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const removeAccents = (str: string) => str ? str.normalize("NFD").replace(/[\u0300-\u036f]/g, "") : "";

async function run() {
  const text = "SA";
  const region = "Apurimac / Aymaraes / Tintay";
  
  const cleanText = text.trim();
  const searchPattern = `%${cleanText.replace(/\s+/g, '%')}%`;
  const searchPatternNoAccents = removeAccents(searchPattern);
  
  let resultData: any[] = [];
  
  const parts = region.split('/').map(s => s.trim());
  const provincia = parts[1] || parts[0]; 

  console.log("Searching in province:", provincia, "with pattern:", searchPattern);

  const { data: provData, error: e1 } = await supabase
    .from('colegios')
    .select('nombre_ie, codigo_modular, departamento_provincia_distrito')
    .ilike('departamento_provincia_distrito', `%${provincia}%`)
    .or(`nombre_ie.ilike.${searchPattern},nombre_ie.ilike.${searchPatternNoAccents}`)
    .limit(10);
    
  console.log("Provincial matches:");
  console.log(provData);
  if (e1) console.error(e1);

  const { data: generalData, error: e2 } = await supabase
    .from('colegios')
    .select('nombre_ie, codigo_modular, departamento_provincia_distrito')
    .or(`nombre_ie.ilike.${searchPattern},nombre_ie.ilike.${searchPatternNoAccents}`)
    .limit(5);
    
  console.log("General matches:");
  console.log(generalData);
  if (e2) console.error(e2);
}

run();
