import { createClient } from "@supabase/supabase-js";

export const handler = async (event: any) => {
  // Solo permitimos GET
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: 'Metodo no permitido' };
  }

  try {
    // URL path starts with /.netlify/functions/participantes/DNI or handled via rewrite
    // It's easier to just pick the DNI from the end of the path
    const pathParts = event.path.split('/');
    const dniNumber = pathParts[pathParts.length - 1];

    if (!dniNumber || dniNumber === 'participantes') {
      return { statusCode: 400, body: JSON.stringify({ error: "Falta proporcionar el DNI del participante." }) };
    }

    // Security layer using an API Key
    const apiKey = event.headers['x-api-key'] || event.headers['X-Api-Key'];
    const validApiKey = process.env.PUBLIC_API_REST_KEY || "admision_unsaac_2026_read_key";
    
    if (!apiKey || apiKey !== validApiKey) {
      return {
        statusCode: 401,
        body: JSON.stringify({ error: "Acceso denegado. Se requiere un API KEY válido de la Oficina de Admisión UNSAAC." })
      };
    }

    // Initialize Database Connection
    const supabaseUrl = process.env.VITE_SUPABASE_URL || "https://cnqpzyanmmwspvemcfeb.supabase.co"; 
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNucXB6eWFubW13c3B2ZW1jZmViIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTgxNTc0MywiZXhwIjoyMDg1MzkxNzQzfQ.ME18iloL44XbOeLo_TbK0CL3n_3jg-uVrr0VaTKZQDI";
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Search database for student
    const { data, error } = await supabase
      .from('participantes')
      .select('dni, nombres, carrera_nom, condicion')
      .eq('dni', dniNumber)
      .single();
    
    if (error && error.code !== 'PGRST116') {
      throw error;
    }

    if (!data) {
      return {
        statusCode: 404,
        body: JSON.stringify({ success: false, message: "Participante no encontrado." })
      };
    }

    // Return the JSON Payload
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        success: true,
        data: {
          dni: data.dni,
          nombres_completos: data.nombres,
          carrera: data.carrera_nom,
          estado_admision: data.condicion,
          fuente: "Sistema Central - Admisión UNSAAC"
        }
      })
    };
    
  } catch (error: any) {
    console.error("API Error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};
