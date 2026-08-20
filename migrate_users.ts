import dotenv from 'dotenv';
dotenv.config();
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL!;
// We MUST use the service role key to insert into auth.users directly via API, 
// OR we can just use the admin_create_user RPC we just made!
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function migrateUsers() {
  console.log('Fetching users from public.usuarios...');
  
  const { data: users, error } = await supabase.from('usuarios').select('*');
  
  if (error) {
    console.error('Error fetching users:', error);
    return;
  }
  
  if (!users || users.length === 0) {
    console.log('No users found to migrate.');
    return;
  }
  
  console.log(`Found ${users.length} users. Migrating to Supabase Auth...`);
  
  for (const user of users) {
    console.log(`Processing user: ${user.name} (DNI: ${user.dni})...`);
    
    // Check if user already exists in Auth
    const email = `${user.dni.trim()}@admin.unsaac.pe`;
    
    // We can just call our admin_create_user RPC!
    // But since it inserts into public.usuarios and they ALREADY exist in public.usuarios, it will fail with "El usuario ya existe"
    // So we need a special RPC for migration, or we just insert them directly via SQL.
  }
}

migrateUsers();
