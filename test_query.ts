import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!);

async function testQuery() {
  const escuelaNombre = 'Medicina Humana'; // Example

  const { data, error } = await supabase
    .from('cv_vacantes')
    .select(`
      cantidad,
      cv_escuelas!inner (
        nombre,
        area,
        filial
      ),
      cv_modalidades!inner (
        nombre,
        semestre,
        cv_cuadros_anuales!inner (
          anio,
          estado
        )
      )
    `)
    .eq('cv_escuelas.nombre', escuelaNombre)
    .eq('cv_modalidades.cv_cuadros_anuales.estado', 'Aprobado');

  if (error) {
    console.error("Error:", error);
  } else {
    console.log("Data:", JSON.stringify(data, null, 2));
  }
}

testQuery();
