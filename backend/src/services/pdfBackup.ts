import fs from "fs";
import path from "path";
import { supabase } from "../config/index.js";
import { config } from "../config/index.js";

// Lista de tablas y columnas que contienen archivos de Supabase a respaldar
const CONFIG_TABLES = [
  { table: "expedientes_salida", columns: ["pdf_url"] },
  { table: "renuncias", columns: ["informe_pdf", "resolution_pdf"] },
  { table: "reserva_vacantes_bloques", columns: ["resolution_pdf"] },
  { table: "resolutions", columns: ["pdf_url"] },
  { table: "padron_pagos", columns: ["resolution_pdf"] },
  { table: "prestamos", columns: ["firma_url"] },
];

/**
 * Resuelve el directorio raíz local para guardar los archivos respaldados.
 * Prioriza la unidad H: si está disponible, y tiene fallbacks seguros.
 */
function getBackupDir(): string {
  const backupFolder = "respaldo_nube";
  
  // 1. Detectar dinámicamente la letra del disco donde se está ejecutando el sistema actualmente (ej: "E:\" o "H:\")
  const currentDrive = path.parse(path.resolve("./")).root;
  const exactPathOnCurrentDrive = path.join(currentDrive, "FOTOS_ARHIVOS_ADMISION_CEPRU", "Documentos_Admision");
  
  if (fs.existsSync(exactPathOnCurrentDrive)) {
    return path.join(exactPathOnCurrentDrive, backupFolder);
  }
  
  // 2. Fallback clásico a la unidad H:\ fija si el script corre en otra unidad (como C: o E:)
  const exactHPath = "H:\\FOTOS_ARHIVOS_ADMISION_CEPRU\\Documentos_Admision";
  if (fs.existsSync(exactHPath)) {
    return path.join(exactHPath, backupFolder);
  }
  
  // Fallback 1: Directorio configurado LOCAL_FILES_DIR (ej. C:/Sistema_Archivos)
  const fallbackDir = path.resolve(config.LOCAL_FILES_DIR);
  try {
    if (!fs.existsSync(fallbackDir)) {
      fs.mkdirSync(fallbackDir, { recursive: true });
    }
    return path.join(fallbackDir, backupFolder);
  } catch (err) {
    // Fallback 2: Carpeta dentro del proyecto backend local
    const absoluteLocal = path.resolve("./db/respaldo_nube");
    if (!fs.existsSync(absoluteLocal)) {
      fs.mkdirSync(absoluteLocal, { recursive: true });
    }
    return absoluteLocal;
  }
}

/**
 * Convierte un URL público de Supabase Storage en su nombre de bucket y ruta relativa interna.
 * Retorna null si la URL no pertenece a Supabase Storage.
 */
function parseSupabaseUrl(urlStr: string): { bucket: string; storagePath: string } | null {
  if (!urlStr || typeof urlStr !== 'string') return null;
  
  // Coincide con /storage/v1/object/public/[bucket]/[storagePath]
  const match = urlStr.match(/\/storage\/v1\/object\/public\/([^\/]+)\/(.+)$/);
  if (match) {
    return {
      bucket: match[1],
      storagePath: decodeURIComponent(match[2])
    };
  }
  return null;
}

let _isBackupRunning = false;

/**
 * Ejecuta el respaldo físico y actualización de los registros.
 */
export async function runPdfBackup(): Promise<{ success: boolean; processedCount: number; errors: string[] }> {
  if (_isBackupRunning) {
    console.log("[PDF Backup] Sincronización de respaldo ya está en curso. Omitiendo llamada.");
    return { success: true, processedCount: 0, errors: [] };
  }
  
  _isBackupRunning = true;
  console.log("[PDF Backup] === Iniciando Ciclo de Respaldo de Archivos Supabase a Local ===");
  
  const backupDir = getBackupDir();
  console.log(`[PDF Backup] Directorio de destino local: ${backupDir}`);
  
  if (!backupDir.includes("FOTOS_ARHIVOS_ADMISION_CEPRU")) {
    console.warn(`[PDF Backup] [ADVERTENCIA] No se encontro la carpeta de destino en el disco extraible (FOTOS_ARHIVOS_ADMISION_CEPRU). Los archivos se guardaran temporalmente en la PC local: ${backupDir}. Por favor, conecte el SSD o verifique su letra.`);
  }
  
  const errors: string[] = [];
  let processedCount = 0;

  try {
    // Validar permisos de escritura en la carpeta destino
    try {
      if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
      }
      
      // Test rápido de escritura
      const testFile = path.join(backupDir, ".write_test");
      fs.writeFileSync(testFile, "test");
      fs.unlinkSync(testFile);
    } catch (err: any) {
      const errorMsg = `No se puede escribir en el directorio de respaldo (${backupDir}): ${err.message || String(err)}`;
      console.error(`[PDF Backup] [ERROR CRITICO] ${errorMsg}`);
      return { success: false, processedCount: 0, errors: [errorMsg] };
    }
    
    // Calcular fecha de corte (30 días atrás)
    const cutOffDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    console.log(`[PDF Backup] Fecha límite de corte (30 días de antigüedad): ${cutOffDate}`);
    
    for (const item of CONFIG_TABLES) {
      const { table, columns } = item;
      console.log(`[PDF Backup] Procesando tabla '${table}' para columnas: ${columns.join(", ")}`);
      
      try {
        // Determinamos el campo de fecha de corte para cada tabla
        let dateField = "created_at";
        if (table === "resolutions") {
          dateField = "date";
        }
        
        // Consultamos a Supabase con filtro de fecha
        const { data: records, error: queryError } = await supabase
          .from(table)
          .select("*")
          .lt(dateField, cutOffDate);
          
        if (queryError) {
          console.warn(`[PDF Backup] Falló filtro por fecha en '${table}' utilizando '${dateField}': ${queryError.message}. Intentando obtener y filtrar en memoria...`);
          
          // Si falla por fecha (ej. no existe esa columna específica), traemos todo y filtramos en memoria
          const { data: allRecords, error: fallbackError } = await supabase.from(table).select("*");
          if (fallbackError) {
            throw new Error(`Fallo al consultar tabla de Supabase: ${fallbackError.message}`);
          }
          
          const filtered = (allRecords || []).filter(rec => {
            const recDateStr = rec.created_at || rec.createdAt || rec.date || rec.dateTime;
            if (!recDateStr) return true; // Procesar registros sin fecha por seguridad
            return new Date(recDateStr).getTime() < new Date(cutOffDate).getTime();
          });
          
          await processRecords(table, columns, filtered);
        } else {
          await processRecords(table, columns, records || []);
        }
      } catch (err: any) {
        const errMsg = `Error en tabla '${table}': ${err.message || String(err)}`;
        console.error(`[PDF Backup] ${errMsg}`);
        errors.push(errMsg);
      }
    }
    
    console.log(`[PDF Backup] === Ciclo de Respaldo Finalizado. Archivos movidos: ${processedCount}. Errores: ${errors.length} ===`);
    return { success: errors.length === 0, processedCount, errors };

    // Procesa una lista de registros para una tabla específica
    async function processRecords(tableName: string, colNames: string[], records: any[]) {
      for (const record of records) {
        for (const colName of colNames) {
          const fileUrl = record[colName];
          
          // Parsear URL para determinar si pertenece a Supabase Storage
          const parsed = parseSupabaseUrl(fileUrl);
          if (!parsed) {
            continue; // Ya es local, está vacío, o es una URL externa (como Google Drive)
          }
          
          const { bucket, storagePath } = parsed;
          console.log(`[PDF Backup] Encontrado archivo en Supabase -> Tabla: ${tableName}, Columna: ${colName}, ID: ${record.id}`);
          
          let localPath = "";
          try {
            // 1. Descargar el archivo desde Supabase Storage
            const { data: fileData, error: downloadError } = await supabase.storage
              .from(bucket)
              .download(storagePath);
              
            if (downloadError) {
              const errMsg = downloadError.message || "";
              const errStatus = (downloadError as any).status || (downloadError as any).statusCode || 0;
              const isNotFound = 
                errMsg.includes("Object not found") || 
                errStatus === 404 || 
                JSON.stringify(downloadError).includes("Object not found");
                
              if (isNotFound) {
                console.warn(`[PDF Backup] [ADVERTENCIA] Archivo no encontrado en Supabase Storage (ID: ${record.id}, Tabla: ${tableName}, Columna: ${colName}, Ruta: ${storagePath}). Marcando como NULL en la BD para limpiar el enlace roto.`);
                
                const { error: updateError } = await supabase
                  .from(tableName)
                  .update({ [colName]: null })
                  .eq("id", record.id);
                  
                if (updateError) {
                  throw new Error(`Error al limpiar URL rota en la base de datos: ${updateError.message}`);
                }
                continue; // Continúa con el siguiente archivo sin incrementar errores
              }
              
              throw new Error(`Error en descarga de Storage: ${downloadError.message}`);
            }
            
            if (!fileData) {
              throw new Error(`El archivo descargado está vacío o es nulo.`);
            }
            
            // 2. Resolver la ruta física del archivo local
            localPath = path.join(backupDir, storagePath);
            
            // Crear directorios intermedios necesarios de forma recursiva
            fs.mkdirSync(path.dirname(localPath), { recursive: true });
            
            // Escribir el buffer
            const arrayBuffer = await fileData.arrayBuffer();
            fs.writeFileSync(localPath, Buffer.from(arrayBuffer));
            
            // 3. Actualizar la base de datos de Supabase con la URL relativa local
            const relativeUrl = `/api/files/stream-document?path=respaldo_nube/${storagePath.replace(/\\/g, "/")}`;
            
            const { error: updateError } = await supabase
              .from(tableName)
              .update({ [colName]: relativeUrl })
              .eq("id", record.id);
              
            if (updateError) {
              // Rollback del archivo guardado físicamente si no se pudo actualizar la BD
              if (fs.existsSync(localPath)) {
                fs.unlinkSync(localPath);
              }
              throw new Error(`Error al actualizar URL en la base de datos: ${updateError.message}`);
            }
            
            console.log(`[PDF Backup] Respaldo local y registro en BD exitoso: ${storagePath}`);
            
            // 4. Eliminar el archivo original de Supabase Storage para liberar espacio
            const { error: deleteError } = await supabase.storage
              .from(bucket)
              .remove([storagePath]);
              
            if (deleteError) {
              console.warn(`[PDF Backup] [ADVERTENCIA] Archivo respaldado localmente, pero falló eliminación en la nube: ${deleteError.message}`);
            } else {
              console.log(`[PDF Backup] Archivo original eliminado del Storage de Supabase.`);
            }
            
            processedCount++;
          } catch (err: any) {
            const errMsg = `Fallo en registro ID ${record.id} (${tableName}.${colName}): ${err.message || String(err)}`;
            console.error(`[PDF Backup] [FILA FALLIDA] ${errMsg}`);
            errors.push(errMsg);
          }
        }
      }
    }
  } finally {
    _isBackupRunning = false;
  }
}

// Planificador del servicio de respaldo en segundo plano
let pdfBackupInterval: NodeJS.Timeout | null = null;

export function startPdfBackupScheduler(hours: number = 24) {
  const intervalMs = hours * 60 * 60 * 1000;
  
  if (pdfBackupInterval) {
    clearInterval(pdfBackupInterval);
  }
  
  // Ejecución inicial después de 30 segundos del arranque
  setTimeout(() => {
    runPdfBackup().catch((error) => {
      console.error("[PDF Backup Scheduler] Error al ejecutar respaldo inicial:", error);
    });
  }, 30000);
  
  // Ejecución periódica según el intervalo configurado
  pdfBackupInterval = setInterval(() => {
    runPdfBackup().catch((error) => {
      console.error("[PDF Backup Scheduler] Error en ciclo de respaldo programado:", error);
    });
  }, intervalMs);
  
  console.log(`[PDF Backup Scheduler] Servicio programado para ejecutarse cada ${hours} horas.`);
}

export function stopPdfBackupScheduler() {
  if (pdfBackupInterval) {
    clearInterval(pdfBackupInterval);
    pdfBackupInterval = null;
    console.log("[PDF Backup Scheduler] Servicio detenido.");
  }
}
