import express from "express";
import cors from "cors";
import { config } from "./config/index.js";
import { runMigrations } from "./db/migrate.js";
import { startNetworkMonitoring, onNetworkStatusChange } from "./services/network.js";
import { startSyncScheduler, runFullSync } from "./services/sync.js";
import { startWeeklyBackupScheduler } from "./services/files.js";
import { startPdfBackupScheduler } from "./services/pdfBackup.js";

// Importación de rutas
import authRouter from "./routes/auth.js";
import filesRouter from "./routes/files.js";
import syncRouter from "./routes/sync.js";
import dataRouter from "./routes/data.js";

const app = express();

// Manejo global de errores para asegurar alta disponibilidad ininterrumpida
process.on("unhandledRejection", (reason) => {
  console.error("[Server] Unhandled Rejection evitada:", reason);
});
process.on("uncaughtException", (err) => {
  console.error("[Server] Uncaught Exception capturada:", err);
});

// Middlewares globales
app.use(cors());
app.use(express.json());

// Montaje de APIs
app.use("/api/auth", authRouter);
app.get("/api/users", (req, res, next) => {
  // Redirigir internamente al handler de /api/auth/users
  req.url = "/users";
  authRouter(req, res, next);
});
app.use("/api/files", filesRouter);
app.use("/api/sync", syncRouter);
app.use("/api", dataRouter); // CRUD principal (/api/postulantes, etc.)

// Ruta raíz para confirmación visual en navegador
app.get("/", (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="es">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Servidor Local Admisión - UNSAAC</title>
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #0f172a;
            color: #f8fafc;
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            padding: 20px;
          }
          .card {
            background: #1e293b;
            border: 1px solid #334155;
            border-radius: 16px;
            padding: 32px;
            max-width: 480px;
            width: 100%;
            text-align: center;
            box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5);
          }
          .badge {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            background: rgba(16, 185, 129, 0.15);
            color: #10b981;
            padding: 6px 14px;
            border-radius: 9999px;
            font-size: 14px;
            font-weight: 600;
            margin-bottom: 20px;
          }
          .dot {
            width: 8px;
            height: 8px;
            background: #10b981;
            border-radius: 50%;
            animation: pulse 2s infinite;
          }
          @keyframes pulse {
            0%, 100% { opacity: 1; transform: scale(1); }
            50% { opacity: 0.5; transform: scale(1.2); }
          }
          h1 { font-size: 22px; font-weight: 700; margin-bottom: 8px; color: #f8fafc; }
          p { color: #94a3b8; font-size: 14px; line-height: 1.5; margin-bottom: 24px; }
          .info-box {
            background: #0f172a;
            border: 1px solid #334155;
            border-radius: 10px;
            padding: 16px;
            text-align: left;
            font-size: 13px;
            margin-bottom: 20px;
          }
          .info-row {
            display: flex;
            justify-content: space-between;
            padding: 6px 0;
            border-bottom: 1px solid #1e293b;
          }
          .info-row:last-child { border-bottom: none; }
          .label { color: #64748b; }
          .val { font-family: monospace; color: #38bdf8; font-weight: 600; }
          .btn {
            display: inline-block;
            background: #2563eb;
            color: white;
            text-decoration: none;
            padding: 10px 20px;
            border-radius: 8px;
            font-size: 14px;
            font-weight: 500;
            transition: background 0.2s;
          }
          .btn:hover { background: #1d4ed8; }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="badge">
            <span class="dot"></span> Servidor Backend Activo
          </div>
          <h1>Sistema de Admisión UNSAAC</h1>
          <p>El servidor local está funcionando correctamente y escuchando peticiones en la red.</p>
          <div class="info-box">
            <div class="info-row">
              <span class="label">Puerto</span>
              <span class="val">${config.PORT}</span>
            </div>
            <div class="info-row">
              <span class="label">IP Local</span>
              <span class="val">10.10.16.214</span>
            </div>
            <div class="info-row">
              <span class="label">Período</span>
              <span class="val">${config.CURRENT_PERIODO}</span>
            </div>
            <div class="info-row">
              <span class="label">Estado</span>
              <span class="val" style="color: #10b981;">ONLINE</span>
            </div>
          </div>
          <a href="/health" class="btn">Verificar API Health (/health)</a>
        </div>
      </body>
    </html>
  `);
});

// Ruta básica de salud
app.get("/health", (req, res) => {
  res.status(200).json({ status: "OK", timestamp: new Date().toISOString() });
});

// Función de inicialización
async function bootstrap() {
  console.log("=== Inicializando Servidor Local Admision ===");
  
  // 1. Ejecutar migraciones SQLite locales para asegurar que la estructura esté al día
  await runMigrations();
  
  // 2. Iniciar el servicio de monitoreo de red (revisa conexión cada 15 segundos)
  startNetworkMonitoring(15000);
  
  // Registrar sincronización reactiva al recuperar conexión a internet
  onNetworkStatusChange((online) => {
    if (online) {
      console.log("[Server] Conexion recuperada. Iniciando sincronizacion automatica e inmediata...");
      runFullSync().catch((err) => {
        console.error("[Server] Error al disparar la sincronizacion reactiva:", err);
      });
    }
  });
  
  // 3. Iniciar el planificador del Sync Engine (cada 3 horas por defecto)
  startSyncScheduler(3);
  
  // 4. Iniciar el planificador de copia de seguridad física de archivos de 400 GB (cada 7 días)
  startWeeklyBackupScheduler(7);
  
  // 5. Iniciar el planificador de respaldo de PDFs de Supabase a almacenamiento local (cada 24 horas)
  // startPdfBackupScheduler(24);
  
  // 6. Iniciar escucha del servidor HTTP en todas las interfaces de red (0.0.0.0)
  app.listen(config.PORT, "0.0.0.0", () => {
    console.log(`[Server] Servidor backend Express escuchando en http://0.0.0.0:${config.PORT} (Red: http://10.10.16.214:${config.PORT})`);
  });
}

bootstrap().catch((error: any) => {
  if (error.code === "EADDRINUSE") {
    console.error(`\n[Server] [ERROR CRITICO] El puerto ${config.PORT} ya esta siendo utilizado por otra aplicacion.`);
    console.error(`[Server] Por favor, cierra cualquier otra ventana de comandos o ejecuta 'update.bat' para liberar los puertos y volver a intentarlo.\n`);
  } else {
    console.error("[Bootstrap] Error crítico al arrancar la aplicación backend:", error);
  }
  process.exit(1);
});
