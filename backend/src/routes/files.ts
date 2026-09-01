import { Router, Request, Response } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { db } from "../db/db.js";
import { incomingFiles, offlineMutations } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { saveFileLocal, deleteFileLocal, storageDir } from "../services/files.js";
import { isOnline } from "../services/network.js";
import { supabase } from "../config/index.js";
import { config } from "../config/index.js";
import { randomUUID } from "crypto";
import { runPdfBackup } from "../services/pdfBackup.js";

const router = Router();

// Configurar directorio temporal para multer
const tempDir = path.resolve("./db/temp");
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

const upload = multer({ dest: tempDir });

/**
 * Subir documento (Archivo Pesado)
 * Guarda físicamente en el disco local y registra metadata en Supabase/SQLite.
 */
router.post("/upload", upload.single("file"), async (req: Request, res: Response) => {
  try {
    const file = req.file;
    const { number, subject, type, status } = req.body;
    
    if (!file) {
      return res.status(400).json({ error: "No se cargo ningun archivo" });
    }
    if (!number || !subject || !type || !status) {
      // Eliminar archivo temporal si la peticion es invalida
      if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
      return res.status(400).json({ error: "number, subject, type y status son obligatorios" });
    }
    
    // Mover archivo del temporal al directorio permanente local
    const saved = await saveFileLocal(file.path, file.originalname);
    
    const docId = randomUUID();
    const newDoc = {
      id: docId,
      number,
      subject,
      dateTime: new Date().toISOString(),
      type,
      status,
      nombre_archivo: saved.filename,
      ruta_local: saved.relativePath,
      tamano_bytes: saved.sizeBytes,
      periodo: config.CURRENT_PERIODO,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    const online = isOnline();
    
    if (online) {
      // 1. Guardar metadatos en Supabase
      const { error: cloudError } = await supabase
        .from("incoming_files")
        .insert({
          id: newDoc.id,
          number: newDoc.number,
          subject: newDoc.subject,
          dateTime: newDoc.dateTime,
          type: newDoc.type,
          status: newDoc.status,
          nombre_archivo: newDoc.nombre_archivo,
          ruta_local: newDoc.ruta_local,
          tamano_bytes: newDoc.tamano_bytes,
          periodo: newDoc.periodo
        });
        
      if (cloudError) {
        console.error("[File Upload] Error guardando metadata en Supabase:", cloudError);
        // Deshacer guardado fisico
        await deleteFileLocal(saved.filename);
        return res.status(500).json({ error: "Error al registrar archivo en la nube de Supabase" });
      }
      
      // 2. Guardar en SQLite local
      await db.insert(incomingFiles).values({
        ...newDoc,
        syncStatus: "synced"
      });
      
      console.log(`[File Upload] Archivo subido y sincronizado: ${saved.filename}`);
      return res.status(201).json({ ...newDoc, syncStatus: "synced" });
    } else {
      // MODO OFFLINE: Guardar localmente y registrar en cola de mutaciones
      const localDoc = {
        ...newDoc,
        syncStatus: "pending"
      };
      
      await db.transaction(async (tx) => {
        // Escribir registro local
        await tx.insert(incomingFiles).values(localDoc);
        
        // Registrar mutacion para subir luego
        await tx.insert(offlineMutations).values({
          id: randomUUID(),
          tableName: "incoming_files",
          operation: "INSERT",
          recordId: docId,
          dataJson: JSON.stringify(localDoc),
          createdAt: new Date().toISOString()
        });
      });
      
      console.log(`[File Upload] Modo Offline: Archivo guardado localmente y encolado para sincronización.`);
      return res.status(201).json(localDoc);
    }
  } catch (error: any) {
    console.error("[File Upload] Error critico en proceso de carga:", error);
    return res.status(500).json({ error: error.message || "Error interno del servidor local" });
  }
});

/**
 * Descargar / Servir Archivo Físico
 * Hace streaming del archivo desde C:/Sistema_Archivos/ directamente.
 */
router.get("/download/:filename", (req: Request, res: Response) => {
  const filename = req.params.filename;
  const filePath = path.join(storageDir, filename);
  
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: "El archivo no existe en este servidor local" });
  }
  
  res.sendFile(filePath, (err) => {
    if (err) {
      console.error(`[File Service] Error al enviar archivo:`, err);
      if (!res.headersSent) {
        res.status(500).json({ error: "Error al descargar el archivo" });
      }
    }
  });
});

/**
 * Eliminar Documento
 */
router.delete("/:id", async (req: Request, res: Response) => {
  const docId = req.params.id;
  
  try {
    // Buscar el archivo local para borrarlo fisicamente
    const localResult = await db.select().from(incomingFiles).where(eq(incomingFiles.id, docId)).limit(1);
    
    if (localResult.length === 0) {
      return res.status(404).json({ error: "Documento no encontrado localmente" });
    }
    
    const doc = localResult[0];
    
    const online = isOnline();
    
    // Eliminar archivo fisico
    if (doc.nombre_archivo) {
      await deleteFileLocal(doc.nombre_archivo);
    }
    
    if (online) {
      // Borrar en Supabase
      const { error: cloudError } = await supabase.from("incoming_files").delete().eq("id", docId);
      if (cloudError) {
        return res.status(500).json({ error: cloudError.message });
      }
      
      // Borrar en SQLite
      await db.delete(incomingFiles).where(eq(incomingFiles.id, docId));
      return res.status(200).json({ message: "Documento eliminado de forma física y en la nube." });
    } else {
      // Borrar localmente y encolar DELETE
      await db.transaction(async (tx) => {
        await tx.delete(incomingFiles).where(eq(incomingFiles.id, docId));
        
        await tx.insert(offlineMutations).values({
          id: randomUUID(),
          tableName: "incoming_files",
          operation: "DELETE",
          recordId: docId,
          dataJson: JSON.stringify({ id: docId }),
          createdAt: new Date().toISOString()
        });
      });
      
      return res.status(200).json({ message: "Documento eliminado localmente y encolado para borrado en la nube." });
    }
  } catch (error: any) {
    console.error("[File Service] Error eliminando documento:", error);
    return res.status(500).json({ error: error.message || "Error interno al procesar eliminación" });
  }
});

function isExactCodeMatch(filename: string, queryCode: string): boolean {
  if (!filename || !queryCode) return false;
  const baseName = path.parse(filename).name;
  const tokens = baseName.split(/[^a-zA-Z0-9]+/);
  const q = String(queryCode).trim().toLowerCase();
  const qNoZero = q.replace(/^0+/, '');
  
  for (const token of tokens) {
    const t = token.toLowerCase();
    if (t === q) return true;
    if (qNoZero && t.replace(/^0+/, '') === qNoZero && qNoZero.length >= 5) {
      return true;
    }
  }
  return false;
}

/**
 * Buscar documentos cargados por DNI en el disco H:
 */
function searchDniInBaseDir(baseDir: string, dni: string): Array<any> {
  const results: any[] = [];
  if (!fs.existsSync(baseDir)) return results;
  
  try {
    // Nivel 1: Periodos (2025-I, etc.)
    const periodDirs = fs.readdirSync(baseDir, { withFileTypes: true })
      .filter(d => d.isDirectory());
      
    for (const periodDir of periodDirs) {
      const periodPath = path.join(baseDir, periodDir.name);
      
      // Nivel 2: Concursos (EXAMEN ORDINARIO 2025-I, etc.)
      const concursoDirs = fs.readdirSync(periodPath, { withFileTypes: true })
        .filter(d => d.isDirectory());
        
      for (const concursoDir of concursoDirs) {
        const concursoPath = path.join(periodPath, concursoDir.name);
        
        // Nivel 3: Archivos
        const files = fs.readdirSync(concursoPath, { withFileTypes: true })
          .filter(f => f.isFile() && isExactCodeMatch(f.name, dni));
          
        for (const file of files) {
          const fullPath = path.join(concursoPath, file.name);
          const relativePath = `${periodDir.name}/${concursoDir.name}/${file.name}`;
          results.push({
            name: file.name,
            periodo: periodDir.name,
            concurso: concursoDir.name,
            relativePath: relativePath,
            fullPath: fullPath
          });
        }
      }
    }
  } catch (e) {
    console.error("[File Service] Error al escanear directorio H: ", e);
  }
  return results;
}

/**
 * Obtener lista de requisitos/documentos cargados para un DNI
 */
router.get("/student-documents/:dni", (req: Request, res: Response) => {
  const dni = req.params.dni;
  
  // Obtener letra de la unidad de ejecución actual de forma dinámica
  const currentDrive = path.parse(path.resolve("./")).root;
  const exactPathOnCurrentDrive = path.join(currentDrive, "FOTOS_ARHIVOS_ADMISION_CEPRU", "Documentos_Admision");
  const exactHPath = "H:\\FOTOS_ARHIVOS_ADMISION_CEPRU\\Documentos_Admision";
  
  let baseDir = exactPathOnCurrentDrive;
  if (!fs.existsSync(baseDir)) {
    baseDir = exactHPath;
  }
  
  if (!fs.existsSync(baseDir)) {
    console.warn(`[File Service] Directorio base de documentos no disponible: ${baseDir}`);
    return res.status(200).json([]); // Retornar vacío si el disco no está conectado
  }
  
  try {
    const files = searchDniInBaseDir(baseDir, dni);
    const mapped = files.map(file => {
      let description = "Documento Adicional";
      let prefix = "";
      
      if (file.name.startsWith("1_1_")) {
        prefix = "1_1_";
        description = "Foto / Ficha de Inscripción";
      } else if (file.name.startsWith("2_1_")) {
        prefix = "2_1_";
        description = "Documento de Identidad (DNI)";
      } else if (file.name.startsWith("3_1_")) {
        prefix = "3_1_";
        description = "Certificado de Estudios / Requisitos";
      } else {
        const match = file.name.match(/^(\d+_\d+_)/);
        if (match) prefix = match[1];
      }
      
      return {
        name: file.name,
        periodo: file.periodo,
        concurso: file.concurso,
        description: description,
        prefix: prefix,
        relativePath: file.relativePath,
        url: `http://127.0.0.1:5000/api/files/stream-document?path=${encodeURIComponent(file.relativePath)}`
      };
    });
    
    return res.status(200).json(mapped);
  } catch (error: any) {
    console.error(`[File Service] Error buscando documentos para DNI ${dni}:`, error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * Transmitir (Stream) un documento del disco H:
 */
router.get("/stream-document", (req: Request, res: Response) => {
  const relPath = req.query.path as string;
  if (!relPath) {
    return res.status(400).json({ error: "Falta el parámetro path" });
  }
  
  // Evitar Directory Traversal
  const cleanPath = path.normalize(relPath).replace(/^(\.\.[\/\\])+/, "");
  
  // Obtener letra de la unidad de ejecución actual de forma dinámica
  const currentDrive = path.parse(path.resolve("./")).root;
  const exactPathOnCurrentDrive = path.join(currentDrive, "FOTOS_ARHIVOS_ADMISION_CEPRU", "Documentos_Admision");
  const exactHPath = "H:\\FOTOS_ARHIVOS_ADMISION_CEPRU\\Documentos_Admision";
  
  let baseDir = exactPathOnCurrentDrive;
  if (!fs.existsSync(baseDir)) {
    baseDir = exactHPath;
  }
  
  // Lista de posibles ubicaciones físicas del archivo (disco extraíble dinámico, fallback local, fallback en app)
  const candidatePaths = [
    path.join(baseDir, cleanPath),
    path.join(path.resolve(config.LOCAL_FILES_DIR), cleanPath),
    path.join(path.resolve("./db"), cleanPath)
  ];
  
  let resolvedPath = "";
  for (const p of candidatePaths) {
    if (fs.existsSync(p)) {
      resolvedPath = p;
      break;
    }
  }
  
  if (!resolvedPath) {
    return res.status(404).json({ error: "El archivo no existe en ninguna de las rutas de almacenamiento configuradas" });
  }
  
  res.sendFile(resolvedPath, (err) => {
    if (err) {
      console.error(`[File Service] Error al enviar archivo desde: ${resolvedPath}`, err);
      if (!res.headersSent) {
        res.status(500).json({ error: "Error al transmitir el archivo" });
      }
    }
  });
});

/**
 * Endpoint para ejecutar manualmente el respaldo de PDFs de Supabase a Local.
 */
router.post("/run-backup", async (req: Request, res: Response) => {
  try {
    const result = await runPdfBackup();
    if (result.success) {
      return res.status(200).json({
        message: "Respaldo manual completado con éxito.",
        filesProcessed: result.processedCount,
        errors: result.errors
      });
    } else {
      return res.status(500).json({
        message: "El respaldo manual finalizó con algunos errores.",
        filesProcessed: result.processedCount,
        errors: result.errors
      });
    }
  } catch (error: any) {
    console.error("[File Route] Error en endpoint /run-backup:", error);
    return res.status(500).json({ error: error.message || "Error interno al ejecutar respaldo" });
  }
});

export default router;
