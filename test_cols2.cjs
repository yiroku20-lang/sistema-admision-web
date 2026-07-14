const { createClient } = require('@supabase/supabase-js');
const supabase = createClient('https://cnqpzyanmmwspvemcfeb.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNucXB6eWFubW13c3B2ZW1jZmViIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk4MTU3NDMsImV4cCI6MjA4NTM5MTc0M30.A-aFJv-V4JJvlvWxf4OAYo5xZ-RIkha3O7Umqh4yETs');

async function checkCol(colName) {
  const { error } = await supabase.from('pre_revision_archivos').insert([{ [colName]: null }]);
  if (error && error.code === 'PGRST204') {
    return false;
  }
  return true;
}

async function main() {
  const cols = ['id', 'anio_id', 'anio', 'cuadro_anual_id', 'created_at', 'updated_at', 'status', 'is_migrated'];
  for (const col of cols) {
    const exists = await checkCol(col);
    console.log(`${col}: ${exists}`);
  }
}
main();
