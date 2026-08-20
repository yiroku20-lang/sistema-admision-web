import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://cnqpzyanmmwspvemcfeb.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNucXB6eWFubW13c3B2ZW1jZmViIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk4MTU3NDMsImV4cCI6MjA4NTM5MTc0M30.A-aFJv-V4JJvlvWxf4OAYo5xZ-RIkha3O7Umqh4yETs'
);

async function run() {
  const { data, error } = await supabase.from('eventos').insert([
    {
      title: 'Prueba desde agente',
      start_date: '2026-08-18',
      end_date: '2026-08-18',
      type: 'Otro',
      user_id: '2cddaa12-25a3-4806-8eec-148298c28c43'
    }
  ]);
  console.log('Insert attempt:', data, error);
}

run();
