import nodemailer from 'nodemailer';

export const handler = async (event: any) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: ''
    };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: corsHeaders,
      body: 'Method Not Allowed'
    };
  }

  try {
    const body = typeof event.body === 'string' ? JSON.parse(event.body) : (event.body || {});
    
    // Support direct payloads and Supabase insert/update database webhooks
    const payload = body.record ? body.record : body;
    let { id, correo, nombre, carrera_interes, area_interes, resultados_test } = payload;

    // Normalizar correo y nombre
    correo = (correo || '').trim();
    nombre = (nombre || '').trim();

    // Si carrera_interes no viene directamente, intentar extraerla del último resultado del test
    if (!carrera_interes && Array.isArray(resultados_test) && resultados_test.length > 0) {
      const ultimoTest = resultados_test[resultados_test.length - 1];
      carrera_interes = ultimoTest.top_carrera || ultimoTest.carrera_interes || (ultimoTest.escuelas_recomendadas?.[0]?.carrera) || ultimoTest.perfil || '';
    }

    if (!carrera_interes && area_interes) {
      carrera_interes = area_interes;
    }

    if (!correo || !nombre) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: "Nombre y correo son requeridos." })
      };
    }

    const gmailUser = process.env.GMAIL_USER || "admision@unsaac.edu.pe";
    const gmailPass = process.env.GMAIL_APP_PASSWORD || "oaki mixo wlwa pecc";

    if (!gmailUser || !gmailPass) {
      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({ error: "Credenciales de correo no configuradas." })
      };
    }

    const welcomeHtml = `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 25px; max-width: 600px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px;">
        <div style="text-align: center; margin-bottom: 20px;">
          <h2 style="color: #7b1523; margin: 0; font-size: 22px;">¡Bienvenido(a) a Orientación y Admisión UNSAAC!</h2>
          <p style="color: #64748b; font-size: 14px; margin-top: 5px;">Universidad Nacional de San Antonio Abad del Cusco</p>
        </div>
        
        <p style="font-size: 15px; color: #334155; line-height: 1.6;">Hola <strong>${nombre}</strong>,</p>
        <p style="font-size: 15px; color: #334155; line-height: 1.6;">Gracias por realizar nuestro <strong>Test de Orientación Vocacional</strong>. Estamos muy felices de acompañarte en este paso tan importante que es decidir tu futuro profesional.</p>
        
        ${carrera_interes 
          ? `<div style="background-color: #f8fafc; border-left: 4px solid #7b1523; padding: 12px 16px; margin: 18px 0; border-radius: 4px;">
               <p style="margin: 0; font-size: 15px; color: #1e293b;">🎯 Tu resultado destacó una gran afinidad con: <strong style="color: #7b1523;">${carrera_interes}</strong>.</p>
             </div>` 
          : '<p style="font-size: 15px; color: #334155; line-height: 1.6;">Esperamos que el test te haya ayudado a descubrir la carrera ideal para tu perfil vocacional.</p>'}
        
        <p style="font-size: 15px; color: #334155; line-height: 1.6;">A partir de ahora, recibirás notificaciones y novedades sobre fechas de exámenes de admisión, ferias vocacionales y noticias importantes directamente en tu correo.</p>
        
        <div style="text-align: center; margin: 25px 0;">
          <a href="https://drive.google.com/file/d/1PjlN342ZH-b5p_c1-GB9VJUVUZf_w3LF/view?usp=sharing" target="_blank" style="background-color: #7b1523; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 14px; display: inline-block; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">Ver Brochure de Carreras Profesionales</a>
        </div>
        
        <p style="font-size: 14px; color: #475569; line-height: 1.6;">Además, te recomendamos visitar nuestra <a href="https://admision.unsaac.edu.pe/" target="_blank" style="color: #7b1523; text-decoration: underline; font-weight: bold;">página web oficial</a> para conocer el temario, cuadro de vacantes, cronogramas de admisión, modalidades de ingreso y tutoriales para tu postulación.</p>
        
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 25px 0;" />
        
        <p style="font-size: 14px; color: #64748b; margin-bottom: 5px;">¡Mucho éxito en tu preparación!</p>
        <p style="font-size: 14px; color: #334155; margin-top: 0;"><strong>Dirección de Admisión UNSAAC</strong></p>
      </div>
    `;

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: gmailUser,
        pass: gmailPass,
      },
    });

    const mailOptions = {
      from: `"Admisión UNSAAC" <${gmailUser}>`,
      to: correo,
      subject: `¡Bienvenido(a) a Orientación Vocacional UNSAAC, ${nombre}!`,
      html: welcomeHtml,
    };

    await transporter.sendMail(mailOptions);

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ success: true, message: "Correo de bienvenida enviado exitosamente" })
    };

  } catch (error: any) {
    console.error("Webhook Email Error:", error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: error.message })
    };
  }
};
