const { createClient } = require('@supabase/supabase-js');
const supabase = createClient('https://cnqpzyanmmwspvemcfeb.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNucXB6eWFubW13c3B2ZW1jZmViIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk4MTU3NDMsImV4cCI6MjA4NTM5MTc0M30.A-aFJv-V4JJvlvWxf4OAYo5xZ-RIkha3O7Umqh4yETs');
async function test() {
  const { error: insErr } = await supabase.from('cv_modalidades').insert({ cuadro_id: '00000000-0000-0000-0000-000000000000', semestre: '2026-I', nombre: 'test', peso_porcentaje: '100%', orden: 1 });
  console.log('insert error cv_modalidades:', insErr);
}
test();
