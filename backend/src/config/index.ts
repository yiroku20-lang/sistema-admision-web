import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Cargar .env desde la raíz del backend
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

export const config = {
  PORT: process.env.PORT ? parseInt(process.env.PORT) : 5000,
  SUPABASE_URL: process.env.SUPABASE_URL || "",
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || "",
  JWT_SECRET: process.env.JWT_SECRET || "default_local_jwt_secret",
  LOCAL_FILES_DIR: process.env.LOCAL_FILES_DIR || "C:/Sistema_Archivos",
  BACKUP_DEST_DIR: process.env.BACKUP_DEST_DIR || "./db/backup_files",
  CURRENT_PERIODO: process.env.CURRENT_PERIODO || "2026-I"
};

// Validar credenciales mínimas (evitar caída, solo advertir)
if (!config.SUPABASE_URL || !config.SUPABASE_SERVICE_ROLE_KEY) {
  console.warn("ADVERTENCIA: SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY no configurados en el archivo .env");
}

// Inicializar Supabase Client (bypasando RLS al usar Service Role para sincronización)
export const supabase = createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  }
});
