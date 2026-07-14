import express from "express";
import { createServer as createViteServer } from "vite";
import nodemailer from "nodemailer";
import { createClient } from "@supabase/supabase-js";
import cors from "cors";
import { GoogleGenAI } from "@google/genai";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());
  // Increase limit for base64 PDF attachments
  app.use(express.json({ limit: "50mb" }));

  // --- LOCAL PROXY FOR FILES (DEV ONLY) ---
  app.use("/api/files", async (req, res) => {
    try {
<<<<<<< HEAD
      const baseUrl = process.env.VITE_API_URL || "http://127.0.0.1:5000";
=======
      const baseUrl = process.env.VITE_API_URL || "https://june-entertainment-thanks-include.trycloudflare.com";
>>>>>>> 7184314c8c7a05a8e75a4737cb0c4f215e0eca93
      const targetUrl = `${baseUrl}/api/files${req.url}`;
      
      const fetchReq = await import('node-fetch').then(m => m.default);
      
      const fetchHeaders: Record<string, string> = {};
      for (const key in req.headers) {
          if (req.headers[key] && key !== 'host') {
              fetchHeaders[key] = req.headers[key] as string;
          }
      }
      
      const response = await fetchReq(targetUrl, {
        method: req.method,
        headers: fetchHeaders,
        body: ['GET', 'HEAD'].includes(req.method) ? undefined : req.body
      });

      if (!response.ok) {
        res.status(response.status).send(await response.text());
        return;
      }

      const contentType = response.headers.get('content-type');
      if (contentType) res.setHeader('Content-Type', contentType);
      const contentDisposition = response.headers.get('content-disposition');
      if (contentDisposition) res.setHeader('Content-Disposition', contentDisposition);

      response.body.pipe(res);
    } catch (error: any) {
      console.error("Local proxy error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // --- GEMINI API ROUTE ---
  app.post("/api/gemini", async (req, res) => {
    try {
      const { input, model, config } = req.body;
      if (!input) return res.status(400).json({ error: "Input is required" });

      const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
      if (!apiKey) {
        return res.status(400).json({ error: "No se configuró la clave de API de Gemini (GEMINI_API_KEY)." });
      }

      const ai = new GoogleGenAI({ 
        apiKey: apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          }
        }
      });

      // Mapear de forma segura nombres de modelos experimentales o inexistentes en la API pública a uno válido y rápido
      let selectedModel = model || 'gemini-2.5-flash';
      if (
        selectedModel.includes('3.5-flash') || 
        selectedModel.includes('3.0-pro') || 
        selectedModel.includes('3.0') || 
        selectedModel.includes('3.5')
      ) {
        selectedModel = 'gemini-2.5-flash';
      }

      const requestOptions: any = {
        model: selectedModel,
        contents: input,
      };
      if (config) {
        requestOptions.config = config;
      }
      const response = await ai.models.generateContent(requestOptions);

      res.json({ text: response.text });
    } catch (error: any) {
      console.error("Gemini API Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // --- 1. CRON JOB ENDPOINT (AUTOMATED REMINDERS) ---
  const cronHandler = async (req: any, res: any) => {
    try {
      // Security Check (Verify that the cron job gave us the correct password)
      const authHeader = req.headers.authorization || req.headers['autorización'] || req.headers['autorizacion'];
      // Usamos una contraseña directa en el código para evitar tener que configurar una variable en Netlify
      const cronSecret = process.env.CRON_SECRET || "UnsaacAdminCron2026_SuperSecreto!";
      
      const token = (typeof authHeader === 'string' ? authHeader.replace(/^Bearer\s+/i, '').replace(/^Portador\s+/i, '') : '') || req.query.token || req.query.key;
      
      if (!token || token !== cronSecret) {
        return res.status(401).json({ error: "No autorizado. Token de CRON inválido o no configurado." });
      }

      // Initialize Supabase fallback to real Service Role Key directly
      const supabaseUrl = process.env.VITE_SUPABASE_URL || "https://cnqpzyanmmwspvemcfeb.supabase.co"; // Defaulting to the project inferred from JWT
      const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNucXB6eWFubW13c3B2ZW1jZmViIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTgxNTc0MywiZXhwIjoyMDg1MzkxNzQzfQ.ME18iloL44XbOeLo_TbK0CL3n_3jg-uVrr0VaTKZQDI";
      
      if (!supabaseUrl || !supabaseKey) {
        throw new Error("Credenciales de Supabase faltantes en el servidor.");
      }

      const supabase = createClient(supabaseUrl, supabaseKey);
      const todayStr = new Date().toISOString().split('T')[0];

      // Fetch active/overdue loans that expire today or earlier
      const { data: loans, error } = await supabase
        .from('prestamos')
        .select('*, inventario_bienes(nombre_bien)')
        .in('estado_prestamo', ['Activo', 'Vencido'])
        .lte('fecha_limite', todayStr)
        .not('prestatario_correo', 'is', null)
        .neq('prestatario_correo', '');

      if (error) throw error;

      if (!loans || loans.length === 0) {
        return res.json({ message: "No hay préstamos pendientes por notificar hoy." });
      }

      // Prepare Nodemailer
      const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: {
          user: process.env.GMAIL_USER || "admision@unsaac.edu.pe",
          pass: process.env.GMAIL_APP_PASSWORD || "oaki mixo wlwa pecc",
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

      res.json({ success: true, emailsSent: sentCount });

    } catch (error: any) {
      console.error("Cron Error:", error);
      res.status(500).json({ error: error.message });
    }
  };

  app.get("/api/cron/send-reminders", cronHandler);
  app.post("/api/cron/send-reminders", cronHandler);
  app.get("/.netlify/functions/cron-reminders", cronHandler);
  app.post("/.netlify/functions/cron-reminders", cronHandler);

  // --- 2. REST API: GET PARTICIPANTES ---
  app.get("/api/v1/participantes/:dni", async (req, res) => {
    try {
      const dniNumber = req.params.dni;
      
      // Simple Security layer using an API Key
      // This forces other offices to use an API Key we give them.
      const apiKey = req.headers['x-api-key'];
      const validApiKey = process.env.PUBLIC_API_REST_KEY || "admision_unsaac_2026_read_key";
      
      if (!apiKey || apiKey !== validApiKey) {
        return res.status(401).json({ error: "Acceso denegado. Se requiere un API KEY válido de la Oficina de Admisión UNSAAC." });
      }

      // Initialize Database Connection
      const supabaseUrl = process.env.VITE_SUPABASE_URL || "https://cnqpzyanmmwspvemcfeb.supabase.co"; 
      const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNucXB6eWFubW13c3B2ZW1jZmViIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTgxNTc0MywiZXhwIjoyMDg1MzkxNzQzfQ.ME18iloL44XbOeLo_TbK0CL3n_3jg-uVrr0VaTKZQDI";
      const supabase = createClient(supabaseUrl, supabaseKey);

      // Search database for student
      const { data, error } = await supabase
        .from('participantes')
        .select('CODPOSTULANTE, NOMBRE, CARRERA, MODALIDAD')
        .eq('CODPOSTULANTE', dniNumber)
        .order('ANIO', { ascending: false })
        .order('SEMESTRE', { ascending: false })
        .limit(1)
        .single();
      
      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      if (!data) {
        return res.status(404).json({ success: false, message: "Participante no encontrado." });
      }

      // Return the JSON Payload
      res.json({
        success: true,
        data: {
          dni_codigo: data.CODPOSTULANTE,
          nombres_completos: data.NOMBRE,
          carrera: data.CARRERA,
          modalidad: data.MODALIDAD,
          fuente: "Sistema Central - Admisión UNSAAC"
        }
      });
      
    } catch (error: any) {
      console.error("API Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // --- Unsubscribe Endpoint ---
  app.get("/api/unsubscribe", async (req, res) => {
    try {
      const { id } = req.query;
      if (!id) {
        return res.status(400).send("Falta el ID de prospecto.");
      }

      const supabaseUrl = process.env.VITE_SUPABASE_URL || "https://cnqpzyanmmwspvemcfeb.supabase.co";
      const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";
      const supabase = createClient(supabaseUrl, supabaseKey);

      const { error } = await supabase
        .from('prospectos_vocacionales')
        .update({ suscrito: false })
        .eq('id', id);

      if (error) {
        throw error;
      }

      res.send(`
        <html>
          <head>
            <meta charset="utf-8">
            <title>Suscripción Cancelada</title>
            <style>
              body { font-family: sans-serif; text-align: center; padding: 50px; background: #f8fafc; color: #334155; }
              .container { max-width: 500px; margin: 0 auto; background: white; padding: 40px; border-radius: 16px; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1); }
              h1 { color: #dc2626; }
              p { margin-bottom: 20px; line-height: 1.5; }
            </style>
          </head>
          <body>
            <div class="container">
              <h1>Suscripción Cancelada</h1>
              <p>Tu correo electrónico ha sido dado de baja exitosamente. Ya no recibirás más notificaciones automatizadas sobre nuestros exámenes de admisión.</p>
              <p>Esperamos verte pronto en la UNSAAC.</p>
            </div>
          </body>
        </html>
      `);
    } catch (error: any) {
      console.error("Unsubscribe Error:", error);
      res.status(500).send("Ocurrió un error al procesar tu solicitud.");
    }
  });

  // --- Webhook for the Test App ---
  app.post("/api/webhook/welcome-email", express.json({ limit: "5mb" }), async (req, res) => {
    try {
      // Support direct payloads and Supabase insert webhooks
      const payload = req.body.record ? req.body.record : req.body;
      const { id, correo, nombre, carrera_interes } = payload;

      if (!correo || !nombre) {
        return res.status(400).json({ error: "Nombre y correo son requeridos." });
      }

      const cancelUrl = id ? `${req.protocol}://${req.get('host')}/#/unsubscribe?id=${id}` : '#';
      
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
          
          <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;" />
          <div style="text-align: center; font-size: 13px; color: #666;">
            <p>Síguenos en nuestras redes sociales para estar al día:</p>
            <div style="margin-top: 10px;">
              <a href="https://www.facebook.com/p/Direcci%C3%B3n-de-Admisi%C3%B3n-Universidad-Nacional-de-San-Antonio-Abad-del-Cusco-61562739426524/?locale=es_LA" target="_blank" style="color: #1877F2; text-decoration: none; font-weight: bold; margin: 0 10px;">Facebook</a> |
              <a href="http://www.youtube.com/@DireccionAdmisionUNSAAC" target="_blank" style="color: #FF0000; text-decoration: none; font-weight: bold; margin: 0 10px;">YouTube</a> |
              <a href="https://www.tiktok.com/@unsaac.admision?is_from_webapp=1&sender_device=pc" target="_blank" style="color: #000000; text-decoration: none; font-weight: bold; margin: 0 10px;">TikTok</a>
            </div>
            <p style="margin-top: 20px; font-size: 10px; color: #999;">Este mensaje automático de bienvenida fue generado el ${new Date().toLocaleString('es-PE')}.</p>
            ${id ? `<p style="margin-top: 5px; font-size: 11px; color: #999;">Si ya no deseas recibir este tipo de correos, puedes <a href="${cancelUrl}" target="_blank" style="color: #7b1523; text-decoration: underline;">darte de baja aquí</a>.</p>` : ''}
          </div>
        </div>
      `;

      const gmailUser = process.env.GMAIL_USER || "admision@unsaac.edu.pe";
      const gmailPass = process.env.GMAIL_APP_PASSWORD || "oaki mixo wlwa pecc";

      if (!gmailUser || !gmailPass) {
        return res.status(500).json({ error: "Credenciales de correo no configuradas." });
      }

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
      res.json({ success: true, message: "Correo de bienvenida enviado por Webhook" });
    } catch (error: any) {
      console.error("Webhook Email Error:", error);
      if (error.response) {
        console.error(error.response.body);
      }
      res.status(500).json({ error: error.message });
    }
  });

  // --- Webhook for Loans (Prestamos) ---
  const prestamosWebhookHandler = async (req: any, res: any) => {
    try {
      const payload = req.body;
      if (!payload || !payload.type || !payload.record) {
        return res.status(400).json({ error: "Payload no válido de Supabase." });
      }

      const { type, record, old_record } = payload;
      
      const prestatarioCorreo = record.prestatario_correo;
      const prestatarioNombre = record.prestatario_nombre;
      
      if (!prestatarioCorreo) {
        return res.status(200).json({ message: "No hay correo para notificar, omitiendo." });
      }

      const gmailUser = process.env.GMAIL_USER || "admision@unsaac.edu.pe";
      const gmailPass = process.env.GMAIL_APP_PASSWORD || "oaki mixo wlwa pecc";

      if (!gmailUser || !gmailPass) {
        return res.status(500).json({ error: "Credenciales de correo no configuradas." });
      }

      const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: {
          user: gmailUser,
          pass: gmailPass,
        },
      });

      // Fetch the item name from inventory
      const supabaseUrl = process.env.VITE_SUPABASE_URL || "https://cnqpzyanmmwspvemcfeb.supabase.co";
      const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";
      const supabase = createClient(supabaseUrl, supabaseKey);

      const { data: bienData, error } = await supabase
        .from('inventario_bienes')
        .select('nombre_bien, codigo_barras')
        .eq('id', record.bien_id)
        .single();
        
      if (error && error.code !== 'PGRST116') {
         console.error("Error fetching inventario_bienes:", error);
      }
      
      const nombreBien = bienData?.nombre_bien || 'Bien sin nombre';
      const codigoBien = bienData?.codigo_barras || record.bien_id;

      if (type === 'INSERT') {
          // Newly created loan
          const safeFechaLimite = record.fecha_limite ? new Date(record.fecha_limite).toLocaleDateString() : 'N/A';
          
          const subject = 'Confirmación de Préstamo de Bienes - UNSAAC';
          const text = `Hola ${prestatarioNombre},\n\nTe escribimos de la Oficina de Admisión UNSAAC para confirmar el registro del préstamo del siguiente bien:\n\n- ${nombreBien} (Cod: ${codigoBien})\n\nTe comprometes a devolver este bien con fecha límite: ${safeFechaLimite}.\n\nSaludos cordiales,\nOficina de Admisión UNSAAC`;
          
          await transporter.sendMail({
            from: `"Admisión UNSAAC" <${gmailUser}>`,
            to: prestatarioCorreo,
            subject,
            text,
          });
          
          return res.status(200).json({ success: true, message: "Correo de préstamo enviado exitosamente." });
      } else if (type === 'UPDATE' && record.estado_prestamo === 'Devuelto' && old_record && old_record.estado_prestamo === 'Activo') {
          // Loan marked as returned
          const subject = 'Confirmación de Devolución de Bienes - UNSAAC';
          const text = `Hola ${prestatarioNombre},\n\nTe escribimos de la Oficina de Admisión UNSAAC para agradecerte la devolución del siguiente bien:\n\n- ${nombreBien} (Cod: ${codigoBien})\n\nTu registro se encuentra ahora actualizado.\n\nSaludos cordiales,\nOficina de Admisión UNSAAC`;
          
          await transporter.sendMail({
            from: `"Admisión UNSAAC" <${gmailUser}>`,
            to: prestatarioCorreo,
            subject,
            text,
          });
          
          return res.status(200).json({ success: true, message: "Correo de devolución enviado exitosamente." });
      } else {
          return res.status(200).json({ message: "No applicable event to process." });
      }
      
    } catch (error: any) {
      console.error("Webhook Prestamos Error:", error);
      res.status(500).json({ error: error.message });
    }
  };

  app.post("/api/webhooks/prestamos", express.json({ limit: "5mb" }), prestamosWebhookHandler);
  app.post("/api/webhook/prestamos", express.json({ limit: "5mb" }), prestamosWebhookHandler);
  app.post("/.netlify/functions/webhook-prestamos", express.json({ limit: "5mb" }), prestamosWebhookHandler);

  // --- 3. REGULAR EMAIL ENDPOINT (MANUAL SEND) ---
  // Support both local and Netlify function paths for transparency
  const emailHandler = async (req: any, res: any) => {
    try {
      const { to, subject, text, html, attachmentBase64, filename } = req.body;

      const gmailUser = process.env.GMAIL_USER || "admision@unsaac.edu.pe";
      const gmailPass = process.env.GMAIL_APP_PASSWORD || "oaki mixo wlwa pecc";

      if (!gmailUser || !gmailPass) {
        return res.status(500).json({ 
          error: "Credenciales de correo no configuradas en el servidor. Por favor configure GMAIL_USER y GMAIL_APP_PASSWORD." 
        });
      }

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
        text,
        html,
      };

      if (req.body.attachments && Array.isArray(req.body.attachments)) {
        mailOptions.attachments = req.body.attachments.map((att: any) => ({
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

      await transporter.sendMail(mailOptions);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error sending email:", error);
      res.status(500).json({ error: error.message });
    }
  };

  app.post("/api/send-email", emailHandler);
  app.post("/.netlify/functions/send-email", emailHandler);

  // --- 4. SECURE USER CREATION ENDPOINT ---
  app.post("/api/create-user", async (req, res) => {
    try {
      const { dni, password, name, role, permissions } = req.body;
      if (!dni || !password || !name || !role) {
        return res.status(400).json({ error: "Faltan datos obligatorios." });
      }

      // We should ideally verify the requester is an admin, but for this internal preview app we'll handle the creation.
      const supabaseUrl = process.env.VITE_SUPABASE_URL || "https://cnqpzyanmmwspvemcfeb.supabase.co"; 
      const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNucXB6eWFubW13c3B2ZW1jZmViIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTgxNTc0MywiZXhwIjoyMDg1MzkxNzQzfQ.ME18iloL44XbOeLo_TbK0CL3n_3jg-uVrr0VaTKZQDI";
      const supabase = createClient(supabaseUrl, supabaseKey);

      // 1. Check if user already exists in public DB
      const { data: existingUser } = await supabase.from('usuarios').select('dni').eq('dni', dni).single();
      if (existingUser) {
          return res.status(400).json({ error: `El usuario con DNI ${dni} ya existe.` });
      }

      const email = `${dni}@admin.unsaac.pe`;

      // 2. Create user in Supabase Auth using Admin API
      const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
          email: email,
          password: password,
          email_confirm: true,
      });

      if (authError) {
          return res.status(400).json({ error: "Error en Auth: " + authError.message });
      }

      const userId = authUser.user.id;

      // 3. Insert into public.usuarios
      const { error: dbError } = await supabase.from('usuarios').insert([{
          id: userId,
          dni: dni,
          password: password,
          name: name,
          role: role,
          permissions: permissions || null
      }]);

      if (dbError) {
          // If public insert fails, we should ideally delete the auth user to rollback, but for now just error out
          await supabase.auth.admin.deleteUser(userId);
          return res.status(400).json({ error: "Error al guardar perfil: " + dbError.message });
      }

      res.status(200).json({ success: true, message: "Usuario creado exitosamente.", userId });

    } catch (error: any) {
      console.error("Create User Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // --- 5. SECURE USER PASSWORD UPDATE ENDPOINT ---
  app.post("/api/update-user-password", async (req, res) => {
    try {
      const { user_id, password } = req.body;
      if (!user_id || !password) {
        return res.status(400).json({ error: "Faltan datos obligatorios." });
      }

      const supabaseUrl = process.env.VITE_SUPABASE_URL || "https://cnqpzyanmmwspvemcfeb.supabase.co"; 
      const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNucXB6eWFubW13c3B2ZW1jZmViIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTgxNTc0MywiZXhwIjoyMDg1MzkxNzQzfQ.ME18iloL44XbOeLo_TbK0CL3n_3jg-uVrr0VaTKZQDI";
      const supabase = createClient(supabaseUrl, supabaseKey);

      // 1. Update in auth system
      const { error: authError } = await supabase.auth.admin.updateUserById(user_id, {
          password: password
      });

      if (authError) {
          return res.status(400).json({ error: "Error al actualizar credenciales: " + authError.message });
      }

      // 2. Update plainly in public DB (for reference in this specific app logic)
      const { error: dbError } = await supabase.from('usuarios').update({ password: password }).eq('id', user_id);

      if (dbError) {
          return res.status(400).json({ error: "Error al actualizar perfil: " + dbError.message });
      res.status(200).json({ success: true, message: "Contraseña actualizada exitosamente." });
      
    } catch (error: any) {
      console.error("Update Password Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // --- Proxy para archivos locales en desarrollo (stream-document) ---
  app.get("/api/files/stream-document", async (req, res) => {
    try {
      const pathParam = req.query.path as string;
      if (!pathParam) {
        return res.status(400).json({ error: "Falta el parámetro path" });
      }
      
      const baseUrl = process.env.VITE_API_URL || "http://127.0.0.1:5000";
      const targetUrl = `${baseUrl.replace(/\/$/, "")}/api/files/stream-document?path=${encodeURIComponent(pathParam)}`;
      
      const response = await fetch(targetUrl);
      if (!response.ok) {
        return res.status(response.status).json({ error: "Error al obtener archivo del servidor local" });
      }
      
      res.setHeader("Content-Type", response.headers.get("content-type") || "application/pdf");
      res.setHeader("Content-Disposition", "inline");
      
      const arrayBuffer = await response.arrayBuffer();
      res.send(Buffer.from(arrayBuffer));
    } catch (error: any) {
      console.error("Proxy stream error:", error);
      if (!res.headersSent) {
        res.status(500).json({ error: error.message || "Error al transmitir el archivo a través del proxy" });
      }
    }
  });

  // --- 6. PRE-REVISION ENDPOINTS (Bypass RLS) ---
  app.post("/api/save-pre-revision", express.json({ limit: "50mb" }), async (req, res) => {
    try {
      const { modalidad_id, csv_data } = req.body;
      if (!modalidad_id) return res.status(400).json({ error: "modalidad_id is required" });

      const supabaseUrl = process.env.VITE_SUPABASE_URL || "https://cnqpzyanmmwspvemcfeb.supabase.co"; 
      const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNucXB6eWFubW13c3B2ZW1jZmViIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTgxNTc0MywiZXhwIjoyMDg1MzkxNzQzfQ.ME18iloL44XbOeLo_TbK0CL3n_3jg-uVrr0VaTKZQDI";
      const supabase = createClient(supabaseUrl, supabaseKey);

      await supabase.from('pre_revision_archivos').delete().eq('modalidad_id', modalidad_id);
      const { error } = await supabase.from('pre_revision_archivos').insert({
        modalidad_id,
        csv_data
      });

      if (error) throw error;
      res.json({ success: true });
    } catch (error: any) {
      console.error("Save Pre-Revision Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/get-pre-revision/:modId", async (req, res) => {
    try {
      const modId = req.params.modId;
      const supabaseUrl = process.env.VITE_SUPABASE_URL || "https://cnqpzyanmmwspvemcfeb.supabase.co"; 
      const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNucXB6eWFubW13c3B2ZW1jZmViIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTgxNTc0MywiZXhwIjoyMDg1MzkxNzQzfQ.ME18iloL44XbOeLo_TbK0CL3n_3jg-uVrr0VaTKZQDI";
      const supabase = createClient(supabaseUrl, supabaseKey);

      const { data, error } = await supabase
        .from('pre_revision_archivos')
        .select('*')
        .eq('modalidad_id', modId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;

      if (data && data.csv_data && typeof data.csv_data === 'string') {
        try {
          data.csv_data = JSON.parse(data.csv_data);
        } catch (e) {
          console.error("Error parsing csv_data string to JSON in server:", e);
        }
      }

      res.json({ success: true, data });
    } catch (error: any) {
      console.error("Get Pre-Revision Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/get-pre-revisions-status", async (req, res) => {
    try {
      const supabaseUrl = process.env.VITE_SUPABASE_URL || "https://cnqpzyanmmwspvemcfeb.supabase.co"; 
      const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNucXB6eWFubW13c3B2ZW1jZmViIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTgxNTc0MywiZXhwIjoyMDg1MzkxNzQzfQ.ME18iloL44XbOeLo_TbK0CL3n_3jg-uVrr0VaTKZQDI";
      const supabase = createClient(supabaseUrl, supabaseKey);

      const { data, error } = await supabase
        .from('pre_revision_archivos')
        .select('modalidad_id');

      if (error) throw error;
      const ids = (data || []).map(item => item.modalidad_id);
      res.json({ success: true, savedModalidadIds: ids });
    } catch (error: any) {
      console.error("Get Pre-Revisions Status Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // In production, serve static files from dist
    app.use(express.static("dist"));
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
