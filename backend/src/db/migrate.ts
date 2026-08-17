import { migrate } from "drizzle-orm/libsql/migrator";
import { db, client } from "./db.js";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function runMigrations() {
  console.log("=== Iniciando Migraciones de Base de Datos Local (LibSQL) ===");
  try {
    let migrationsFolder = path.resolve(__dirname, "./migrations-sqlite");
    
    // Si no existe en dist/db, buscar en src/db/migrations-sqlite
    const fs = await import("fs");
    if (!fs.existsSync(migrationsFolder)) {
      migrationsFolder = path.resolve(__dirname, "../../src/db/migrations-sqlite");
    }
    
    if (fs.existsSync(migrationsFolder)) {
      await migrate(db, { migrationsFolder });
      console.log("=== Migraciones completadas con éxito ===");
    } else {
      console.warn("=== [Migración] Carpeta de migraciones no encontrada. Se omite migración y se continúa inicio del servidor normalmente. ===");
    }
  } catch (error) {
    console.warn("ADVERTENCIA: No se pudieron aplicar migraciones locales. Continuando arranque del servidor Express:", error);
  }
}

// Permitir ejecutarlo directamente desde la CLI si se invoca este archivo
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runMigrations().then(() => {
    client.close();
  });
}
