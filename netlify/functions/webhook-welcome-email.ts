import nodemailer from 'nodemailer';

export const handler = async (event: any) => {
  // Manejo de preflight CORS (método OPTIONS)
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
      },
      body: ''
    };
  }

  if (event.httpMethod !== 'POST') {
    return { 
      statusCode: 405, 
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: 'Method Not Allowed' 
    };
  }

  try {
    const body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
    // Support direct payloads and Supabase insert webhooks
    const payload = body.record ? body.record : body;
    let { id, correo, nombre, carrera_interes, resultados_test } = payload;

    // Si carrera_interes no viene directa, extraerla de resultados_test si está disponible
    if (!carrera_interes && resultados_test) {
      try {
        const tests = typeof resultados_test === 'string' ? JSON.parse(resultados_test) : resultados_test;
        if (Array.isArray(tests) && tests.length > 0) {
          const lastTest = tests[tests.length - 1];
          if (lastTest.escuelas_recomendadas && Array.isArray(lastTest.escuelas_recomendadas) && lastTest.escuelas_recomendadas.length > 0) {
            carrera_interes = lastTest.escuelas_recomendadas[0].carreras || lastTest.escuelas_recomendadas[0].area || '';
          } else if (lastTest.perfil) {
            carrera_interes = lastTest.perfil;
          }
        }
      } catch (parseErr) {
        console.warn("No se pudo extraer carrera de resultados_test:", parseErr);
      }
    }

    if (!correo || !nombre) {
      return {
        statusCode: 400,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: "Nombre y correo son requeridos." })
      };
    }

    const gmailUser = process.env.GMAIL_USER || "admision@unsaac.edu.pe";
    const gmailPass = process.env.GMAIL_APP_PASSWORD || "oaki mixo wlwa pecc";

    if (!gmailUser || !gmailPass) {
      return {
        statusCode: 500,
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: "Credenciales de correo no configuradas." })
      };
    }

    const welcomeHtml = `
      <div style="font-family: sans-serif; padding: 20px;">
        <h2 style="color: #7b1523;">¡Bienvenido(a) a la plataforma de Atención y Orientación al Postulante UNSAAC!</h2>
        <p>Hola <strong>${nombre}</strong>,</p>
        <p>Gracias por realizar nuestro Test de Orientación Vocacional. Estamos muy felices de acompañarte en este paso tan importante que es decidir tu futuro profesional.</p>
        ${carrera_interes 
          ? `<p>Hemos notado tu interés en la carrera de <strong>${carrera_interes}</strong>. ¡Es una excelente elección!</p>` 
          : '<p>Esperamos que el test te haya ayudado a descubrir la carrera ideal a tu perfil.</p>'}
        <p>A partir de ahora, recibirás notificaciones y novedades sobre fechas de exámenes de admisión, ferias vocacionales y noticias importantes directamente en tu correo.</p>
        <br/>
        <p>Te invitamos a revisar los perfiles de todas nuestras escuelas profesionales en el siguiente enlace:</p>
        <div style="margin: 20px 0;">
          <a href="https://drive.google.com/file/d/1PjlN342ZH-b5p_c1-GB9VJUVUZf_w3LF/view?usp=sharing" target="_blank" style="background-color: #7b1523; color: white; padding: 10px 20px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Ver Brochure de Carreras Profesionales</a>
        </div>
        <br/>
        <p>Además, te recomendamos visitar nuestra <a href="https://admision.unsaac.edu.pe/" target="_blank" style="color: #7b1523; text-decoration: underline; font-weight: bold;">página web oficial</a> para conocer el temario, cuadro de vacantes, cronogramas de admisión, modalidades de ingreso y tutoriales para tu postulación.</p>
        <br/>
        <p>¡Mucho éxito en tu preparación!</p>
        <p>Saludos cordiales,<br/><strong>Dirección de Admisión UNSAAC</strong></p>
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
      subject: `¡Bienvenido(a) a Atención y Orientación al Postulante UNSAAC, ${nombre}!`,
      html: welcomeHtml,
    };

    await transporter.sendMail(mailOptions);

    return {
      statusCode: 200,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ success: true, message: "Correo de bienvenida enviado por Webhook" })
    };

  } catch (error: any) {
    console.error("Webhook Email Error:", error);
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: error.message })
    };
  }
};

