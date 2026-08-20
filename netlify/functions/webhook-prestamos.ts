import nodemailer from 'nodemailer';

export const handler = async (event: any) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const payload = JSON.parse(event.body || '{}');

    if (!payload || !payload.type || !payload.record) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Payload no válido de Supabase." }),
      };
    }

    const { type, record, old_record } = payload;
    
    const prestatarioCorreo = record.prestatario_correo;
    const prestatarioNombre = record.prestatario_nombre;
    
    if (!prestatarioCorreo) {
      return {
        statusCode: 200,
        body: JSON.stringify({ message: "No hay correo para notificar, omitiendo." }),
      };
    }

    const gmailUser = process.env.GMAIL_USER || "admision@unsaac.edu.pe";
    const gmailPass = process.env.GMAIL_APP_PASSWORD || "oaki mixo wlwa pecc";

    if (!gmailUser || !gmailPass) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "Credenciales de correo no configuradas." }),
      };
    }

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: gmailUser,
        pass: gmailPass,
      },
    });

    // Trigger redeploy to pick up the defined environment variables from Netlify API
    // Fetch the item name from inventory natively using fetch
    const supabaseUrl = process.env.VITE_SUPABASE_URL || "https://cnqpzyanmmwspvemcfeb.supabase.co";
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";
    
    let nombreBien = 'Bien sin nombre';
    let codigoBien = record.bien_id;

    try {
      const response = await fetch(`${supabaseUrl}/rest/v1/inventario_bienes?id=eq.${record.bien_id}&select=nombre_bien,codigo_barras`, {
        method: 'GET',
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Profile': 'public'
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data && data.length > 0) {
          nombreBien = data[0].nombre_bien || nombreBien;
          codigoBien = data[0].codigo_barras || codigoBien;
        }
      } else {
        console.error("Error fetching inventario_bienes status:", response.status);
      }
    } catch (e) {
      console.error("Error executing fetch:", e);
    }

    if (type === 'INSERT') {
        const safeFechaLimite = record.fecha_limite ? new Date(record.fecha_limite).toLocaleDateString() : 'N/A';
        
        const subject = 'Confirmación de Préstamo de Bienes - UNSAAC';
        const text = `Hola ${prestatarioNombre},\n\nTe escribimos de la Oficina de Admisión UNSAAC para confirmar el registro del préstamo del siguiente bien:\n\n- ${nombreBien} (Cod: ${codigoBien})\n\nTe comprometes a devolver este bien con fecha límite: ${safeFechaLimite}.\n\nSaludos cordiales,\nOficina de Admisión UNSAAC`;
        
        await transporter.sendMail({
          from: `"Admisión UNSAAC" <${gmailUser}>`,
          to: prestatarioCorreo,
          subject,
          text,
        });
        
        return {
          statusCode: 200,
          body: JSON.stringify({ success: true, message: "Correo de préstamo enviado exitosamente." }),
        };
    } else if (type === 'UPDATE' && record.estado_prestamo === 'Devuelto' && old_record && old_record.estado_prestamo === 'Activo') {
        const subject = 'Confirmación de Devolución de Bienes - UNSAAC';
        const text = `Hola ${prestatarioNombre},\n\nTe escribimos de la Oficina de Admisión UNSAAC para agradecerte la devolución del siguiente bien:\n\n- ${nombreBien} (Cod: ${codigoBien})\n\nTu registro se encuentra ahora actualizado.\n\nSaludos cordiales,\nOficina de Admisión UNSAAC`;
        
        await transporter.sendMail({
          from: `"Admisión UNSAAC" <${gmailUser}>`,
          to: prestatarioCorreo,
          subject,
          text,
        });
        
        return {
          statusCode: 200,
          body: JSON.stringify({ success: true, message: "Correo de devolución enviado exitosamente." }),
        };
    } else {
        return {
          statusCode: 200,
          body: JSON.stringify({ message: "No applicable event to process." }),
        };
    }
    
  } catch (error: any) {
    console.error("Webhook Prestamos Error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
};
