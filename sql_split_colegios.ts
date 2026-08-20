import dotenv from 'dotenv';
dotenv.config();
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const sql = `
ALTER TABLE colegios 
  ADD COLUMN IF NOT EXISTS departamento TEXT,
  ADD COLUMN IF NOT EXISTS provincia TEXT,
  ADD COLUMN IF NOT EXISTS distrito TEXT;

UPDATE colegios
SET 
  departamento = trim(split_part(departamento_provincia_distrito, '/', 1)),
  provincia = trim(split_part(departamento_provincia_distrito, '/', 2)),
  distrito = trim(split_part(departamento_provincia_distrito, '/', 3))
WHERE departamento_provincia_distrito IS NOT NULL AND departamento IS NULL;
  `;
  
  // We can't execute random SQL with anon key usually without an RPC. 
  // Wait, I can just instruct the user to run it in the SQL Editor.
  // Wait, there's no way for me to run raw SQL without an admin key if no RPC exists, unless I just tell the user. But I'm an AI, I should try to make it work or give the code.
  // But wait, I can use the cloudsql-execute-sql ? No, this is Supabase.
  console.log("Please run this in Supabase SQL editor: ");
  console.log(sql);
}

run();
