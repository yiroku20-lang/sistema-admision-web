import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL || '', process.env.VITE_SUPABASE_ANON_KEY || '');

async function tryTables(tables: string[]) {
  for (const t of tables) {
    const { data: d, error: e } = await supabase.from(t).select('modalidad').limit(1);
    if (!e) {
      console.log(`✅ FOUND: ${t}`);
      return;
    }
  }
  console.log("None found");
}

tryTables([
  "clasificacion_de_adjudicacion",
  "clasificacion_de_adjudicaciones",
  "clasificaciones_de_adjudicacion",
  "clasificacion_adjudicacion",
  "clasificacion_adjudicaciones",
  "clasificacion",
  "adjudicacion_clasificacion",
  "ranking_adjudicacion",
  "clasificion_de_adjudicacion",
  "clasificacion_de_adjudicacion_2026",
  "clasificacion_adjudicacion_ordinario",
  "clasificacion_ordinario"
]);
