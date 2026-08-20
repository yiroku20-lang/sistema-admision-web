import nodemailer from 'nodemailer';

export const handler = async (event: any) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const body = JSON.parse(event.body);
    // Support direct payloads and Supabase insert webhooks
    const payload = body.record ? body.record : body;
    const { id, correo, nombre, carrera_interes } = payload;

    if (!correo || !nombre) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Nombre y correo son requeridos." })
      };
    }

    const gmailUser = process.env.GMAIL_USER || "admision@unsaac.edu.pe";
    const gmailPass = process.env.GMAIL_APP_PASSWORD || "oaki mixo wlwa pecc";

    if (!gmailUser || !gmailPass) {
      return {
        statusCode: 500,
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
      body: JSON.stringify({ success: true, message: "Correo de bienvenida enviado por Webhook" })
    };

  } catch (error: any) {
    console.error("Webhook Email Error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};
