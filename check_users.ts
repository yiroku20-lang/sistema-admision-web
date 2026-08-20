import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://cnqpzyanmmwspvemcfeb.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNucXB6eWFubW13c3B2ZW1jZmViIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTgxNTc0MywiZXhwIjoyMDg1MzkxNzQzfQ.ME18iloL44XbOeLo_TbK0CL3n_3jg-uVrr0VaTKZQDI';

const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_KEY);

async function check() {
  console.log('--- Public Usuarios ---');
  const { data: dbUsers, error: dbErr } = await supabaseAdmin.from('usuarios').select('*');
  console.log('DB Users:', JSON.stringify(dbUsers, null, 2));

  console.log('--- Auth Users ---');
  const { data: { users }, error: authErr } = await supabaseAdmin.auth.admin.listUsers();
  console.log('Auth Users:', users?.map(u => ({ id: u.id, email: u.email, created_at: u.created_at })));
}
check();

