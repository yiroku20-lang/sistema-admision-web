const { createClient } = require('@supabase/supabase-js');

const supabase = createClient('https://cnqpzyanmmwspvemcfeb.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNucXB6eWFubW13c3B2ZW1jZmViIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk4MTU3NDMsImV4cCI6MjA4NTM5MTc0M30.A-aFJv-V4JJvlvWxf4OAYo5xZ-RIkha3O7Umqh4yETs');

async function main() {
  console.log("Checking DB state...\n");

  // 1. Check pre_revision_archivos
  const { data: files, error: filesErr } = await supabase.from('pre_revision_archivos').select('id, modalidad_id, created_at');
  if (filesErr) {
    console.error("Error fetching pre_revision_archivos:", filesErr);
  } else {
    console.log("=== pre_revision_archivos ===");
    console.log(`Count: ${files.length}`);
    console.log("Files:", files);
  }

  // 2. Check cv_modalidades
  const { data: modalities, error: modErr } = await supabase.from('cv_modalidades').select('id, nombre');
  if (modErr) {
    console.error("Error fetching cv_modalidades:", modErr);
  } else {
    console.log("\n=== cv_modalidades ===");
    console.log("Modalities:", modalities);
  }

  // 3. Check adjudicacion_ranking
  const { data: rankCount, error: rankErr } = await supabase.from('adjudicacion_ranking').select('id, modalidad, area, orden_merito, dni, nombre, nota').limit(10);
  const { count: totalRank } = await supabase.from('adjudicacion_ranking').select('*', { count: 'exact', head: true });
  if (rankErr) {
    console.error("Error fetching adjudicacion_ranking:", rankErr);
  } else {
    console.log("\n=== adjudicacion_ranking ===");
    console.log(`Total Count in DB: ${totalRank}`);
    console.log("Sample records:", rankCount);
  }

  // 4. Check adjudicacion_vacantes
  const { data: vacCount, error: vacErr } = await supabase.from('adjudicacion_vacantes').select('id, modalidad, area, escuela, vacantes_totales, vacantes_disponibles').limit(10);
  const { count: totalVac } = await supabase.from('adjudicacion_vacantes').select('*', { count: 'exact', head: true });
  if (vacErr) {
    console.error("Error fetching adjudicacion_vacantes:", vacErr);
  } else {
    console.log("\n=== adjudicacion_vacantes ===");
    console.log(`Total Count in DB: ${totalVac}`);
    console.log("Sample records:", vacCount);
  }
}

main();
