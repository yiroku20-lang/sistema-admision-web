import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!);

async function testUpdate() {
  const { data, error } = await supabase
    .from('usuarios')
    .update({ permissions: ['test'] })
    .eq('dni', '00000000'); // Dummy DNI
  
  if (error) {
    console.error("Update error:", error);
  } else {
    console.log("Update success:", data);
  }
}

testUpdate();
