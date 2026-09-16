import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import path from "path";
import fs from "fs";
import * as schema from "./schema.js";

// Determinar el directorio de datos persistente (evitando intentar escribir dentro de app.asar de solo lectura)
let dbDir: string;
if (process.env.APPDATA) {
  dbDir = path.join(process.env.APPDATA, "SistemaAdmision", "db");
} else {
  dbDir = path.resolve(__dirname, "../../db");
}

if (!fs.existsSync(dbDir)) {
  try {
    fs.mkdirSync(dbDir, { recursive: true });
  } catch (e) {
    dbDir = path.resolve("./db");
    if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });
  }
}

const dbPath = path.join(dbDir, "local.sqlite");

// Inicializar el cliente de LibSQL (SQLite local persistente)
const client = createClient({
  url: `file:${dbPath}`
});

export const db = drizzle(client, { schema });
export { client };
