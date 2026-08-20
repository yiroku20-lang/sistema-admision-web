import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://cnqpzyanmmwspvemcfeb.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNucXB6eWFubW13c3B2ZW1jZmViIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk4MTU3NDMsImV4cCI6MjA4NTM5MTc0M30.A-aFJv-V4JJvlvWxf4OAYo5xZ-RIkha3O7Umqh4yETs'
);

async function run() {
  console.log('--- USUAL KIOSK QUERY ---');
  let dateToday = new Date().getFullYear() + '-' + String(new Date().getMonth() + 1).padStart(2, '0') + '-' + String(new Date().getDate()).padStart(2, '0');
  let res1 = await supabase.from('asistencia').select('*, usuarios(name)').eq('fecha', dateToday).order('timestamp', { ascending: false });
  console.log(`Querying ${dateToday}. Found:`, res1.data?.length);
  if (res1.data) {
     for (const r of res1.data) {
        console.log(`[${r.id}] user_id: ${r.user_id}, dni: ${r.dni}, tipo: ${r.tipo}, fecha: ${r.fecha}, hora: ${r.hora}, timestamp: ${r.timestamp}, name: ${r.usuarios?.name}`);
     }
  }

  console.log('\n--- ALL MANUAL ENTRIES ---');
  let res2 = await supabase.from('asistencia').select('*, usuarios(name)').order('timestamp', { ascending: false }).limit(20);
  if (res2.data) {
     for (const r of res2.data) {
        console.log(`[${r.id}] user_id: ${r.user_id}, dni: ${r.dni}, tipo: ${r.tipo}, fecha: ${r.fecha}, hora: ${r.hora}, name: ${r.usuarios?.name}`);
     }
  }
}

run();
