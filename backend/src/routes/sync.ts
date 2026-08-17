import { Router, Request, Response } from "express";
import { isOnline, checkOnlineStatus } from "../services/network.js";
import { isSyncing, runFullSync } from "../services/sync.js";
import { runPhysicalBackup } from "../services/files.js";
import { db } from "../db/db.js";
import { offlineMutations } from "../db/schema.js";
import { sql } from "drizzle-orm";
import { config } from "../config/index.js";

const router = Router();

/**
 * Obtener estado de red y sincronización en tiempo real.
 * Usado por React para pintar los badges y el icono del header.
 */
router.get("/status", async (req: Request, res: Response) => {
  try {
    // Verificar red rápidamente al consultar status si es necesario
    const online = isOnline();
    
    // Contar mutaciones locales pendientes
    const [countResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(offlineMutations);
      
    res.status(200).json({
      online,
      syncing: isSyncing(),
      pendingMutationsCount: countResult?.count || 0,
      periodo: config.CURRENT_PERIODO
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Disparar ciclo de sincronización manual
 */
router.post("/trigger", async (req: Request, res: Response) => {
  const online = isOnline();
  
  if (!online) {
    return res.status(400).json({ error: "Dispositivo offline. No se puede sincronizar." });
  }
  
  if (isSyncing()) {
    return res.status(409).json({ message: "Sincronización ya se encuentra ejecutándose." });
  }
  
  // Ejecutar de forma asíncrona para no colgar la llamada HTTP
  runFullSync();
  
  res.status(202).json({ message: "Sincronización iniciada en segundo plano." });
});

/**
 * Disparar copia de seguridad física de archivos grandes
 */
router.post("/backup", async (req: Request, res: Response) => {
  try {
    const result = await runPhysicalBackup();
    if (result.success) {
      res.status(200).json({ message: "Copia de seguridad completada con éxito.", filesCopied: result.filesCount });
    } else {
      res.status(500).json({ error: "Fallo al realizar copia de seguridad.", details: result.error });
    }
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
