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

// Middlewares globales
app.use(cors());
app.use(express.json());

// Montaje de APIs
app.use("/api/auth", authRouter);
app.use("/api/files", filesRouter);
app.use("/api/sync", syncRouter);
app.use("/api", dataRouter); // CRUD principal (/api/postulantes, etc.)

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
  
  // 6. Iniciar escucha del servidor HTTP
  app.listen(config.PORT, () => {
    console.log(`[Server] Servidor backend Express escuchando en http://localhost:${config.PORT}`);
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
