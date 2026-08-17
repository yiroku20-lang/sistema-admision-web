import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import path from "path";

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || "https://cnqpzyanmmwspvemcfeb.supabase.co";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseKey) {
  console.error("Missing SUPABASE_SERVICE_ROLE_KEY in .env");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const CONFIG_TABLES = [
  { table: "expedientes_salida", columns: ["pdf_url"] },
  { table: "renuncias", columns: ["informe_pdf", "resolution_pdf"] },
  { table: "reserva_vacantes_bloques", columns: ["resolution_pdf"] },
  { table: "resolutions", columns: ["pdf_url"] },
  { table: "padron_pagos", columns: ["resolution_pdf"] },
  { table: "prestamos", columns: ["firma_url"] },
];

async function run() {
  console.log("=== Backed Up Records ===");
  for (const item of CONFIG_TABLES) {
    const { table, columns } = item;
    const { data, error } = await supabase.from(table).select("*");
    if (error) {
      console.error(`Error fetching ${table}:`, error.message);
      continue;
    }
    if (!data) continue;
    
    let tableHasBackups = false;
    for (const record of data) {
      for (const col of columns) {
        const val = record[col];
        if (val && val.includes("respaldo_nube")) {
          if (!tableHasBackups) {
            console.log(`\nTable: ${table}`);
            tableHasBackups = true;
          }
          console.log(`  ID: ${record.id} | Column: ${col} | Value: ${val}`);
        }
      }
    }
  }
}

run();
