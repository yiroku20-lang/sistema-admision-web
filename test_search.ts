import { supabase } from './lib/supabaseClient';

async function main() {
  const { data: d1, error: e1 } = await supabase.from('ubigeos').select('*').eq('ubigeo', '81302');
  console.log("For 81302:", d1, e1);

  const { data: d2, error: e2 } = await supabase.from('ubigeos').select('*').eq('ubigeo', '081302');
  console.log("For 081302:", d2, e2);
}
main();

