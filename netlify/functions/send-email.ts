import nodemailer from 'nodemailer';

export const handler = async (event: any) => {
  // Solo permitimos peticiones POST
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    // Parseamos el body que viene del frontend
    const body = JSON.parse(event.body);
    const { to, subject, text, html, attachmentBase64, filename } = body;

    const gmailUser = process.env.GMAIL_USER || "admision@unsaac.edu.pe";
    const gmailPass = process.env.GMAIL_APP_PASSWORD || "oaki mixo wlwa pecc";

    if (!gmailUser || !gmailPass) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "Credenciales de correo no configuradas." })
      };
    }

    // Configuramos nodemailer igual que en tu server.ts
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: gmailUser,
        pass: gmailPass,
      },
    });

    const mailOptions: any = {
      from: `"Admisión UNSAAC" <${gmailUser}>`,
      to,
      subject,
    };
    
    if (text) mailOptions.text = text;
    if (html) mailOptions.html = html;

    if (body.attachments && Array.isArray(body.attachments)) {
      mailOptions.attachments = body.attachments.map((att: any) => ({
        filename: att.filename,
        content: att.content.includes("base64,") ? att.content.split("base64,")[1] : att.content,
        encoding: "base64",
      }));
    } else if (attachmentBase64) {
      mailOptions.attachments = [
        {
          filename: filename || "documento.pdf",
          content: attachmentBase64.includes("base64,") ? attachmentBase64.split("base64,")[1] : attachmentBase64,
          encoding: "base64",
        },
      ];
    }

    // Enviamos el correo
    await transporter.sendMail(mailOptions);

    // Respondemos éxito
    return {
      statusCode: 200,
      body: JSON.stringify({ success: true })
    };

  } catch (error: any) {
    console.error("Error sending email:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};
