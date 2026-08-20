import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
supabase.from('expedientes').select('*').limit(1).then(({ data, error }) => {
  if (error) console.error("expedientes error:", error);
  else console.log("expedientes keys:", Object.keys(data[0] || {}));
});
supabase.from('expedientes_salida').select('*').limit(1).then(({ data, error }) => {
  if (error) console.error("expedientes_salida error:", error);
  else console.log("expedientes_salida keys:", Object.keys(data[0] || {}));
});
supabase.from('padron_pagos').select('*').limit(1).then(({ data, error }) => {
  if (error) console.error("padron_pagos error:", error);
  else console.log("padron_pagos keys:", Object.keys(data[0] || {}));
});
