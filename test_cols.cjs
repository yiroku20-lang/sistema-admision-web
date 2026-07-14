const { createClient } = require('@supabase/supabase-js');
const supabase = createClient('https://cnqpzyanmmwspvemcfeb.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNucXB6eWFubW13c3B2ZW1jZmViIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk4MTU3NDMsImV4cCI6MjA4NTM5MTc0M30.A-aFJv-V4JJvlvWxf4OAYo5xZ-RIkha3O7Umqh4yETs');

async function checkCol(colName) {
  const { error } = await supabase.from('pre_revision_archivos').insert([{ [colName]: null }]);
  if (error && error.code === 'PGRST204') {
    return false; // Column does not exist
  }
  return true; // Column exists (RLS or something else)
}

async function main() {
  const cols = ['cuadro_id', 'semestre', 'modalidad_id', 'datos', 'data', 'json_data', 'csv_data', 'archivo_json', 'estado'];
  for (const col of cols) {
    const exists = await checkCol(col);
    console.log(`${col}: ${exists}`);
  }
}
main();
