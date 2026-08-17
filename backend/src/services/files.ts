import fs from "fs";
import path from "path";
import { config } from "../config/index.js";

// Inicializar y validar directorio local
let storageDir = path.resolve(config.LOCAL_FILES_DIR);

try {
  if (!fs.existsSync(storageDir)) {
    fs.mkdirSync(storageDir, { recursive: true });
    console.log(`[File Service] Directorio de archivos pesados creado en: ${storageDir}`);
  }
} catch (error) {
  console.warn(`[File Service] No se pudo crear o acceder a ${storageDir}. Usando carpeta de respaldo en la app.`);
  storageDir = path.resolve("./db/local_storage");
  if (!fs.existsSync(storageDir)) {
    fs.mkdirSync(storageDir, { recursive: true });
  }
}

export { storageDir };

/**
 * Guarda un archivo cargado en el directorio local de almacenamiento.
 * Retorna la ruta física y metadatos del archivo.
 */
export async function saveFileLocal(
  tempPath: string, 
  originalName: string
): Promise<{ filename: string; relativePath: string; sizeBytes: number }> {
  const fileExt = path.extname(originalName);
  const baseName = path.basename(originalName, fileExt);
  
  // Generar un nombre de archivo único para evitar colisiones
  const uniqueId = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
  const finalFilename = `${uniqueId}-${baseName}${fileExt}`;
  const finalPath = path.join(storageDir, finalFilename);
  
  // Mover archivo del temporal al directorio local
  await fs.promises.rename(tempPath, finalPath);
  
  const stats = await fs.promises.stat(finalPath);
  
  return {
    filename: finalFilename,
    relativePath: finalPath,
    sizeBytes: stats.size
  };
}

/**
 * Elimina un archivo físico del directorio local.
 */
export async function deleteFileLocal(filename: string): Promise<void> {
  const filePath = path.join(storageDir, filename);
  if (fs.existsSync(filePath)) {
    await fs.promises.unlink(filePath);
  }
}

/**
 * Ejecuta la copia de seguridad física de la carpeta C:/Sistema_Archivos
 * hacia el destino secundario configurado (ej: NAS o disco externo).
 */
export async function runPhysicalBackup(): Promise<{ success: boolean; filesCount: number; error?: string }> {
  console.log(`[Backup Service] Iniciando copia de seguridad fisica...`);
  const backupDest = path.resolve(config.BACKUP_DEST_DIR);
  
  try {
    if (!fs.existsSync(backupDest)) {
      fs.mkdirSync(backupDest, { recursive: true });
    }
    
    // Respaldar también el archivo de base de datos local SQLite (.sqlite) para evitar pérdidas de datos offline
    let dbSrcPath = path.resolve("./backend/db/local.sqlite");
    if (!fs.existsSync(dbSrcPath)) {
      dbSrcPath = path.resolve("./db/local.sqlite");
    }
    
    if (fs.existsSync(dbSrcPath)) {
      const dbDestPath = path.join(backupDest, "local_database_backup.sqlite");
      try {
        await fs.promises.copyFile(dbSrcPath, dbDestPath);
        console.log(`[Backup Service] Base de datos local SQLite respaldada en: ${dbDestPath}`);
      } catch (dbErr: any) {
        console.error(`[Backup Service] Advertencia: No se pudo respaldar la BD SQLite: ${dbErr.message}`);
      }
    }
    
    // Leer archivos del directorio de origen
    const files = await fs.promises.readdir(storageDir);
    let copiedCount = 0;
    
    for (const file of files) {
      const srcPath = path.join(storageDir, file);
      const destPath = path.join(backupDest, file);
      
      const srcStat = await fs.promises.stat(srcPath);
      
      // Si es un archivo, realizar copia incremental (si no existe o el tamaño difiere)
      if (srcStat.isFile()) {
        let shouldCopy = true;
        if (fs.existsSync(destPath)) {
          const destStat = await fs.promises.stat(destPath);
          if (srcStat.size === destStat.size && srcStat.mtimeMs <= destStat.mtimeMs) {
            shouldCopy = false; // Ya está respaldado e idéntico
          }
        }
        
        if (shouldCopy) {
          await fs.promises.copyFile(srcPath, destPath);
          copiedCount++;
        }
      }
    }
    
    console.log(`[Backup Service] Copia de seguridad física completada con éxito. Archivos procesados/copiados: ${copiedCount}`);
    return { success: true, filesCount: copiedCount };
  } catch (error: any) {
    console.error(`[Backup Service] Error al ejecutar copia de seguridad física:`, error);
    return { success: false, filesCount: 0, error: error.message || String(error) };
  }
}

/**
 * Programa la copia de seguridad física para ejecutarse cada X días (ej. 7 días)
 */
let backupInterval: NodeJS.Timeout | null = null;
export function startWeeklyBackupScheduler(days: number = 7) {
  const intervalMs = days * 24 * 60 * 60 * 1000;
  
  if (backupInterval) {
    clearInterval(backupInterval);
  }
  
  // Ejecutar una vez al inicio después de un delay corto de 10s para no saturar arranque
  setTimeout(() => {
    runPhysicalBackup();
  }, 10000);
  
  backupInterval = setInterval(() => {
    runPhysicalBackup();
  }, intervalMs);
}
