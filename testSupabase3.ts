import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://cnqpzyanmmwspvemcfeb.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNucXB6eWFubW13c3B2ZW1jZmViIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk4MTU3NDMsImV4cCI6MjA4NTM5MTc0M30.A-aFJv-V4JJvlvWxf4OAYo5xZ-RIkha3O7Umqh4yETs'
);

async function run() {
  let res2 = await supabase.from('asistencia').select('*, usuarios(name)').order('timestamp', { ascending: false }).limit(20);
  if (res2.data) {
     for (const r of res2.data) {
        console.log(`[${r.id}] tipo: ${r.tipo}, fecha: ${r.fecha}, hora: ${r.hora}, timestamp: ${r.timestamp}`);
     }
  }
}

run();
