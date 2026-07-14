import { createClient } from '@supabase/supabase-js';
const supabase = createClient('https://cnqpzyanmmwspvemcfeb.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNucXB6eWFubW13c3B2ZW1jZmViIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk4MTU3NDMsImV4cCI6MjA4NTM5MTc0M30.A-aFJv-V4JJvlvWxf4OAYo5xZ-RIkha3O7Umqh4yETs');
async function test() {
  const { data, error } = await supabase.rpc('get_columns_for_table', { table_name: 'pre_revision_archivos' });
  console.log(data, error);
}
test();
