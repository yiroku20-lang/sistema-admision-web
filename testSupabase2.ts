import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://cnqpzyanmmwspvemcfeb.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNucXB6eWFubW13c3B2ZW1jZmViIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk4MTU3NDMsImV4cCI6MjA4NTM5MTc0M30.A-aFJv-V4JJvlvWxf4OAYo5xZ-RIkha3O7Umqh4yETs'
);

async function run() {
  const { data, error } = await supabase
    .from('asistencia')
    .select('*, usuarios(name)')
    .eq('fecha', '2026-04-20')
    .order('timestamp', { ascending: false });
  console.log(`Querying 2026-04-20. Total today records:`, data?.length);
  if (data) {
     for (const r of data) {
         console.log(r.id, r.usuarios);
     }
  }
}
run();
