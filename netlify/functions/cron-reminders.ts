import nodemailer from 'nodemailer';
import { createClient } from "@supabase/supabase-js";

export const handler = async (event: any) => {
  // Permitimos GET y POST
  if (event.httpMethod !== 'POST' && event.httpMethod !== 'GET') {
    return { statusCode: 405, body: 'Metodo no permitido' };
  }

  try {
    // Security Check (Verify that the cron job gave us the correct password)
    // Handle possible browser translations of "Authorization" to "Autorización" and "Bearer" to "Portador"
    const authHeader = event.headers.authorization || event.headers.Authorization || event.headers['autorización'] || event.headers['Autorización'] || event.headers['autorizacion'];
    const cronSecret = process.env.CRON_SECRET || "UnsaacAdminCron2026_SuperSecreto!";
    
    const token = (authHeader ? authHeader.replace(/^Bearer\s+/i, '').replace(/^Portador\s+/i, '') : '') || event.queryStringParameters?.token || event.queryStringParameters?.key;
    
    if (!token || token !== cronSecret) {
      return {
        statusCode: 401,
        body: JSON.stringify({ error: "No autorizado. Token de CRON inválido o no configurado.", receivedHeader: authHeader })
      };
    }

    // Initialize Supabase with Service Role Key
    const supabaseUrl = process.env.VITE_SUPABASE_URL || "https://cnqpzyanmmwspvemcfeb.supabase.co";
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNucXB6eWFubW13c3B2ZW1jZmViIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTgxNTc0MywiZXhwIjoyMDg1MzkxNzQzfQ.ME18iloL44XbOeLo_TbK0CL3n_3jg-uVrr0VaTKZQDI";
    
    if (!supabaseUrl || !supabaseKey) {
      return { statusCode: 500, body: JSON.stringify({ error: "Credenciales de Supabase faltantes." }) };
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const todayStr = new Date().toISOString().split('T')[0];

    // Fetch loans
    const { data: loans, error } = await supabase
      .from('prestamos')
      .select('*, inventario_bienes(nombre_bien)')
      .in('estado_prestamo', ['Activo', 'Vencido'])
      .lte('fecha_limite', todayStr)
      .not('prestatario_correo', 'is', null)
      .neq('prestatario_correo', '');

    if (error) throw error;

    if (!loans || loans.length === 0) {
      return {
        statusCode: 200,
        body: JSON.stringify({ message: "No hay préstamos pendientes por notificar hoy." })
      };
    }

    // Prepare Nodemailer
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.GMAIL_USER || "admision@unsaac.edu.pe", // Add fallback just in case
        pass: process.env.GMAIL_APP_PASSWORD || "oakimixowlwapecc",
      },
    });

    let sentCount = 0;
    
    const groupedLoans = loans.reduce((acc: any, loan: any) => {
      const key = loan.prestatario_correo;
      if (!acc[key]) acc[key] = [];
      acc[key].push(loan);
      return acc;
    }, {});

    for (const [email, userLoans] of Object.entries(groupedLoans) as [string, any[]][]) {
      const first = userLoans[0];
      const bienesList = userLoans.map(i => `- ${i.inventario_bienes?.nombre_bien || 'Bien sin nombre'}`).join('\n');
      
      const rawDate = first.fecha_limite.includes('T') ? first.fecha_limite.split('T')[0] : first.fecha_limite;
      const dLimite = new Date(rawDate + 'T12:00:00').toLocaleDateString();
      
      await transporter.sendMail({
        from: `"Admisión UNSAAC" <${process.env.GMAIL_USER || "admision@unsaac.edu.pe"}>`,
        to: email,
        subject: 'URGENTE: Recordatorio Automático de Devolución - UNSAAC',
        text: `Hola ${first.prestatario_nombre},\n\nTe escribimos de la Oficina de Admisión UNSAAC de manera automática para recordarte que la fecha límite para la devolución de los siguientes bienes fue/es el ${dLimite}.\n\nBienes pendientes:\n${bienesList}\n\nPor favor, acércate a la oficina con urgencia para regularizar la situación del equipo.\n\nSaludos cordiales,\nSistema Automático de Admisión UNSAAC`,
      });
      
      sentCount++;
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, emailsSent: sentCount })
    };

  } catch (error: any) {
    console.error("Cron Error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};
