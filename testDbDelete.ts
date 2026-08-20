import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://cnqpzyanmmwspvemcfeb.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNucXB6eWFubW13c3B2ZW1jZmViIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk4MTU3NDMsImV4cCI6MjA4NTM5MTc0M30.A-aFJv-V4JJvlvWxf4OAYo5xZ-RIkha3O7Umqh4yETs'
);

async function run() {
  console.log('Testing delete permission...');
  // Find a record first
  let { data } = await supabase.from('asistencia').select('*').limit(1);
  if (data && data.length > 0) {
      const recordId = data[0].id;
      // We won't actually delete it, maybe we'll insert a dummy one first
      const testId = '00000000-0000-0000-0000-000000000000'; 
      // Insert
      console.log('Inserting dummy...');
      const { error: insertErr } = await supabase.from('asistencia').insert({
          user_id: data[0].user_id,
          dni: '12345678',
          tipo: 'INGRESO',
          fecha: '2020-01-01',
          hora: '00:00:00'
      }).select();
      
      if (insertErr) {
          console.log('Insert err:', insertErr);
          return;
      }
      
      // Get the newly inserted record
      let { data: newRecs } = await supabase.from('asistencia').select('id').eq('fecha', '2020-01-01');
      if (newRecs && newRecs.length > 0) {
          const insertedId = newRecs[0].id;
          console.log('Trying to delete dummy:', insertedId);
          const { error: delErr } = await supabase.from('asistencia').delete().eq('id', insertedId);
          if (delErr) {
              console.log('Delete error!!', delErr);
          } else {
              console.log('Delete Success!');
          }
      }
  } else {
      console.log('No records found to clone');
  }
}
run();
