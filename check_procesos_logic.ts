import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL || '', process.env.VITE_SUPABASE_ANON_KEY || '');

async function fetchProcesos() {
    try {
      const { data: vData, error: e1 } = await supabase
        .from("adjudicacion_vacantes")
        .select("modalidad");
      const { data: rData, error: e2 } = await supabase
        .from("adjudicacion_ranking")
        .select("modalidad");

      console.error(e1, e2);
      const mods = new Set<string>();
      if (vData) vData.forEach((d) => mods.add(d.modalidad));
      if (rData) rData.forEach((d) => mods.add(d.modalidad));

      console.log(Array.from(mods));
    } catch (e) {
      console.error(e);
    }
  };
fetchProcesos();
