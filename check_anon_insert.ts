import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseAnon = createClient(
  process.env.VITE_SUPABASE_URL || '',
  process.env.VITE_SUPABASE_ANON_KEY || ''
);

async function run() {
    const { data, error } = await supabaseAnon.from('tramite_seguimiento').insert([{
        action_type: 'Test',
        description: 'Test anon',
        user_name: 'Anon'
    }]).select();
    console.log("Insert data:", data);
    console.log("Insert error:", error);
}
run();
