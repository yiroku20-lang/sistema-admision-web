import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import * as schema from "./schema.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Asegurarse de que el directorio /backend/db/ existe
const dbDir = path.resolve(__dirname, "../../db");
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const dbPath = path.join(dbDir, "local.sqlite");

// Inicializar el cliente de LibSQL (SQLite local)
const client = createClient({
  url: `file:${dbPath}`
});

export const db = drizzle(client, { schema });
export { client };
