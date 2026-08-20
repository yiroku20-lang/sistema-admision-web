import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL || '', process.env.VITE_SUPABASE_ANON_KEY || '');

async function fixRLS() {
  const sql = `
    ALTER TABLE adjudicacion_vacantes DISABLE ROW LEVEL SECURITY;
    ALTER TABLE adjudicacion_ranking DISABLE ROW LEVEL SECURITY;
  `;

  console.log("Executing SQL...");
  const { error } = await supabase.rpc('execute_sql', {
    sql_query: sql
  });

  if (error) {
    console.error("RPC failed, but often it might just mean the RPC doesn't exist.", error);
  } else {
    console.log("Success.");
  }
}

fixRLS();
