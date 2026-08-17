import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || "https://cnqpzyanmmwspvemcfeb.supabase.co";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseKey) {
  console.error("❌ ERROR: Falta la variable SUPABASE_SERVICE_ROLE_KEY en el archivo .env");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Configuración de las tablas y las columnas a restaurar
const CONFIG_TABLES = [
  { table: "expedientes_salida", columns: ["pdf_url"] },
  { table: "renuncias", columns: ["informe_pdf", "resolution_pdf"] },
  { table: "reserva_vacantes_bloques", columns: ["resolution_pdf"] },
  { table: "resolutions", columns: ["pdf_url"] },
  { table: "padron_pagos", columns: ["resolution_pdf"] },
  { table: "prestamos", columns: ["firma_url"] },
];

// Obtener el directorio de respaldo local dinámicamente
function getBackupDir(): string {
  const currentDrive = path.parse(path.resolve("./")).root;
  const exactPathOnCurrentDrive = path.join(currentDrive, "FOTOS_ARHIVOS_ADMISION_CEPRU", "Documentos_Admision");
  if (fs.existsSync(exactPathOnCurrentDrive)) {
    return path.join(exactPathOnCurrentDrive, "respaldo_nube");
  }
  return "H:\\FOTOS_ARHIVOS_ADMISION_CEPRU\\Documentos_Admision\\respaldo_nube";
}

async function runRestore() {
  console.log("==================================================");
  console.log("🚀 INICIANDO RESTAURACIÓN DE ARCHIVOS A LA NUBE (SUPABASE)");
  console.log("==================================================");

  const backupDir = getBackupDir();
  console.log(`📂 Carpeta de respaldos local: ${backupDir}`);

  if (!fs.existsSync(backupDir)) {
    console.error(`❌ ERROR: No existe la carpeta de respaldos local: ${backupDir}`);
    console.error("Por favor, asegúrate de que el disco SSD H: está conectado.");
    process.exit(1);
  }

  let totalFound = 0;
  let totalRestored = 0;
  let totalErrors = 0;

  for (const item of CONFIG_TABLES) {
    const { table, columns } = item;
    console.log(`\n--------------------------------------------------`);
    console.log(`📋 Procesando tabla: '${table}'`);
    console.log(`--------------------------------------------------`);

    try {
      // Obtener todos los registros de la tabla
      const { data: records, error: fetchError } = await supabase.from(table).select("*");
      if (fetchError) {
        console.error(`❌ Error al consultar tabla '${table}': ${fetchError.message}`);
        totalErrors++;
        continue;
      }

      if (!records || records.length === 0) {
        console.log(`ℹ️ No hay registros en la tabla '${table}'.`);
        continue;
      }

      for (const record of records) {
        for (const col of columns) {
          const urlVal = record[col];

          // Comprobar si es un enlace de respaldo local
          if (urlVal && typeof urlVal === "string" && urlVal.includes("respaldo_nube")) {
            totalFound++;
            
            // Extraer la ruta relativa del archivo
            // Ejemplo: /api/files/stream-document?path=respaldo_nube/salidas/archivo.pdf
            const urlObj = new URL(urlVal, "http://localhost");
            const pathParam = urlObj.searchParams.get("path");
            
            if (!pathParam) {
              console.warn(`⚠️ No se pudo extraer el parámetro 'path' del valor: ${urlVal}`);
              totalErrors++;
              continue;
            }

            // Eliminar el prefijo 'respaldo_nube/' de la ruta relativa
            const relativePath = pathParam.replace(/^respaldo_nube\//, "");
            const localFilePath = path.join(backupDir, relativePath);

            console.log(`🔍 Registro ID: ${record.id} -> Archivo local: ${relativePath}`);

            if (!fs.existsSync(localFilePath)) {
              console.warn(`⚠️ ADVERTENCIA: El archivo local no existe físicamente en: ${localFilePath}`);
              totalErrors++;
              continue;
            }

            try {
              // 1. Leer el archivo local
              const fileBuffer = fs.readFileSync(localFilePath);

              // Determinar el Content-Type adecuado
              const ext = path.extname(localFilePath).toLowerCase();
              let contentType = "application/octet-stream";
              if (ext === ".pdf") contentType = "application/pdf";
              else if (ext === ".png") contentType = "image/png";
              else if (ext === ".jpg" || ext === ".jpeg") contentType = "image/jpeg";

              // 2. Subir el archivo de regreso a Supabase Storage (bucket: documentos)
              console.log(`   ⬆️ Subiendo a Supabase Storage: bucket 'documentos', ruta: '${relativePath}'...`);
              const { error: uploadError } = await supabase.storage
                .from("documentos")
                .upload(relativePath, fileBuffer, {
                  contentType: contentType,
                  upsert: true, // Reemplazar si ya existe
                });

              if (uploadError) {
                throw new Error(`Error en subida de Storage: ${uploadError.message}`);
              }

              // 3. Obtener el nuevo enlace público del archivo en Supabase
              const newPublicUrl = `${supabaseUrl}/storage/v1/object/public/documentos/${relativePath}`;

              // 4. Actualizar el registro en la base de datos con la nueva URL pública
              console.log(`   💾 Actualizando registro en la base de datos...`);
              const { error: updateError } = await supabase
                .from(table)
                .update({ [col]: newPublicUrl })
                .eq("id", record.id);

              if (updateError) {
                throw new Error(`Error al actualizar fila en BD: ${updateError.message}`);
              }

              console.log(`   ✅ RESTAURADO CON ÉXITO: ${newPublicUrl}`);
              totalRestored++;

            } catch (err: any) {
              console.error(`   ❌ FALLÓ RESTAURACIÓN (ID: ${record.id}): ${err.message || String(err)}`);
              totalErrors++;
            }
          }
        }
      }
    } catch (tableErr: any) {
      console.error(`❌ Error general procesando tabla '${table}': ${tableErr.message || String(tableErr)}`);
      totalErrors++;
    }
  }

  console.log("\n==================================================");
  console.log("📊 RESUMEN DE LA RESTAURACIÓN:");
  console.log("==================================================");
  console.log(`🔍 Registros locales encontrados: ${totalFound}`);
  console.log(`✅ Registros restaurados con éxito a la nube: ${totalRestored}`);
  console.log(`❌ Registros con errores o archivos faltantes: ${totalErrors}`);
  console.log("==================================================");
  
  if (totalFound === totalRestored) {
    console.log("🎉 ¡Restauración completada al 100% con éxito!");
  } else {
    console.warn("⚠️ Hubo algunos archivos que no se pudieron restaurar. Revisa los mensajes de arriba.");
  }
  console.log("==================================================");
}

runRestore().catch((err) => {
  console.error("❌ Error fatal en la ejecución del script:", err);
});
