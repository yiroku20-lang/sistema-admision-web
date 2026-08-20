import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!);

async function check() {
  const { data, error } = await supabase.from('cv_cuadros_anuales').select('id').limit(1);
  if (data && data.length > 0) {
      console.log("Found cuadro:", data[0].id);
      // Try to delete a non-existent one to see if RLS blocks it or just returns no rows
      const { error: delError } = await supabase.from('cv_cuadros_anuales').delete().eq('id', '00000000-0000-0000-0000-000000000000');
      console.log("Delete error:", delError);
  }
}
check();
