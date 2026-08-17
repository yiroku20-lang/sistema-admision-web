import { Router, Request, Response } from "express";
import { randomUUID } from "crypto";
import { db } from "../db/db.js";
import { 
  participantes, 
  cvVacantes, 
  padronPagos, 
  incomingFiles, 
  offlineMutations, 
  usuarios 
} from "../db/schema.js";
import { eq, and, ilike, desc, asc } from "drizzle-orm";
import { config } from "../config/index.js";

const router = Router();

// Mapeo de tablas para consultas dinámicas
const TABLES_MAP: Record<string, any> = {
  participantes: participantes,
  cv_vacantes: cvVacantes,
  padron_pagos: padronPagos,
  incoming_files: incomingFiles,
  usuarios: usuarios
};

// ==========================================
// TRADUCTOR GENÉRICO POSTGREST ↔ SQLITE (OFFLINE GATEWAY)
// Permite que supabase-js consulte localmente sin modificar el frontend.
// ==========================================

// 1. GET - Buscar / Consultar registros
router.get("/offline/:table", async (req: Request, res: Response) => {
  const { table } = req.params;
  const tableSchema = TABLES_MAP[table];
  
  if (!tableSchema) {
    return res.status(404).json({ error: `Tabla '${table}' no soportada localmente.` });
  }
  
  try {
    let query = db.select().from(tableSchema);
    const conditions: any[] = [];
    
    // Parsear parámetros de consulta de PostgREST
    for (const [key, val] of Object.entries(req.query)) {
      if (!val) continue;
      
      // Omitir palabras clave del SDK de Supabase que no son filtros
      if (['select', 'order', 'limit', 'offset', 'apikey'].includes(key)) {
        continue;
      }
      
      const valStr = String(val);
      
      // Filtro de igualdad: eq.valor
      if (valStr.startsWith("eq.")) {
        const value = valStr.substring(3);
        if (key in tableSchema) {
          conditions.push(eq(tableSchema[key as keyof typeof tableSchema], value));
        }
      } 
      // Filtro de búsqueda textual parcial: ilike.%valor%
      else if (valStr.startsWith("ilike.")) {
        let value = valStr.substring(6);
        // Limpiar comodines de SQL
        value = value.replace(/%/g, "").replace(/\*/g, "");
        if (key in tableSchema) {
          conditions.push(ilike(tableSchema[key as keyof typeof tableSchema], `%${value}%`));
        }
      }
    }
    
    // Aplicar condiciones si existen
    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as any;
    }
    
    // Parsear ordenamiento: order=columna.desc o order=columna.asc
    if (req.query.order) {
      const orderStr = String(req.query.order);
      // Puede venir compuesto por comas: ANIO.desc,SEMESTRE.desc
      const orderSpecs = orderStr.split(",");
      for (const spec of orderSpecs) {
        const [col, dir] = spec.split(".");
        if (col && col in tableSchema) {
          query = query.orderBy(
            dir === "desc" 
              ? desc(tableSchema[col as keyof typeof tableSchema]) 
              : asc(tableSchema[col as keyof typeof tableSchema])
          ) as any;
        }
      }
    }
    
    // Parsear límite
    if (req.query.limit) {
      const limitVal = parseInt(String(req.query.limit));
      if (!isNaN(limitVal)) {
        query = query.limit(limitVal) as any;
      }
    }
    
    let result = await query;
    
    // Si se consulta la tabla de usuarios, parseamos la columna de permisos de JSON string a array
    if (table === "usuarios" && Array.isArray(result)) {
      result = result.map((u: any) => {
        const userCopy = { ...u };
        if (userCopy.permissions && typeof userCopy.permissions === "string") {
          try {
            userCopy.permissions = JSON.parse(userCopy.permissions);
          } catch (e) {
            userCopy.permissions = null;
          }
        }
        return userCopy;
      });
    }
    
    // Supabase .maybeSingle() espera un objeto o null, no un array si devuelve 1 fila
    // Pero el traductor responde array por defecto. supabase-js maneja la respuesta array adecuadamente.
    return res.status(200).json(result);
  } catch (error: any) {
    console.error(`[Offline Gateway] Error en GET para la tabla ${table}:`, error);
    return res.status(500).json({ error: error.message });
  }
});

// 2. POST - Insertar un nuevo registro
router.post("/offline/:table", async (req: Request, res: Response) => {
  const { table } = req.params;
  const tableSchema = TABLES_MAP[table];
  
  if (!tableSchema) {
    return res.status(404).json({ error: `Tabla '${table}' no soportada.` });
  }
  
  try {
    const record = req.body;
    
    // Asignar ID si falta
    if (!record.id) {
      record.id = randomUUID();
    }
    
    const localRecord = {
      ...record,
      periodo: config.CURRENT_PERIODO,
      syncStatus: "pending",
      createdAt: record.createdAt || record.created_at || new Date().toISOString(),
      updatedAt: record.updatedAt || record.updated_at || new Date().toISOString()
    };
    
    // Eliminar campos relacionales anidados si los hubiera
    delete localRecord.inventario_bienes;
    delete localRecord.batch;
    
    await db.transaction(async (tx) => {
      // Inserción en SQLite local
      await tx.insert(tableSchema).values(localRecord).onConflictDoUpdate({
        target: tableSchema.id,
        set: localRecord
      });
      
      // Encolar mutación offline
      await tx.insert(offlineMutations).values({
        id: randomUUID(),
        tableName: table,
        operation: "INSERT",
        recordId: localRecord.id,
        dataJson: JSON.stringify(localRecord),
        createdAt: new Date().toISOString()
      });
    });
    
    console.log(`[Offline Gateway] Registrada insercion local (INSERT) en tabla ${table}: ${localRecord.id}`);
    return res.status(201).json(localRecord);
  } catch (error: any) {
    console.error(`[Offline Gateway] Error en POST para la tabla ${table}:`, error);
    return res.status(500).json({ error: error.message });
  }
});

// 3. PATCH - Actualizar registros
router.patch("/offline/:table", async (req: Request, res: Response) => {
  const { table } = req.params;
  const tableSchema = TABLES_MAP[table];
  
  if (!tableSchema) {
    return res.status(404).json({ error: `Tabla '${table}' no soportada.` });
  }
  
  try {
    // Buscar el id en los parámetros de filtro (id=eq.some-uuid)
    let recordId = "";
    for (const [key, val] of Object.entries(req.query)) {
      if (key === "id" && String(val).startsWith("eq.")) {
        recordId = String(val).substring(3);
      }
    }
    
    if (!recordId) {
      return res.status(400).json({ error: "Filtro 'id=eq.X' es requerido para actualizar." });
    }
    
    const recordUpdate = req.body;
    const updatedAt = new Date().toISOString();
    
    await db.transaction(async (tx) => {
      // Actualizar localmente
      await tx
        .update(tableSchema)
        .set({ ...recordUpdate, syncStatus: "pending", updatedAt })
        .where(eq(tableSchema.id, recordId));
        
      // Obtener el registro resultante completo
      const updatedRows = await tx.select().from(tableSchema).where(eq(tableSchema.id, recordId)).limit(1);
      
      if (updatedRows.length > 0) {
        // Encolar actualización
        await tx.insert(offlineMutations).values({
          id: randomUUID(),
          tableName: table,
          operation: "UPDATE",
          recordId: recordId,
          dataJson: JSON.stringify(updatedRows[0]),
          createdAt: new Date().toISOString()
        });
      }
    });
    
    const updatedRows = await db.select().from(tableSchema).where(eq(tableSchema.id, recordId)).limit(1);
    console.log(`[Offline Gateway] Registrada actualizacion local (UPDATE) en tabla ${table}: ${recordId}`);
    return res.status(200).json(updatedRows);
  } catch (error: any) {
    console.error(`[Offline Gateway] Error en PATCH para la tabla ${table}:`, error);
    return res.status(500).json({ error: error.message });
  }
});

// 4. DELETE - Eliminar registros
router.delete("/offline/:table", async (req: Request, res: Response) => {
  const { table } = req.params;
  const tableSchema = TABLES_MAP[table];
  
  if (!tableSchema) {
    return res.status(404).json({ error: `Tabla '${table}' no soportada.` });
  }
  
  try {
    let recordId = "";
    for (const [key, val] of Object.entries(req.query)) {
      if (key === "id" && String(val).startsWith("eq.")) {
        recordId = String(val).substring(3);
      }
    }
    
    if (!recordId) {
      return res.status(400).json({ error: "Filtro 'id=eq.X' es requerido para eliminar." });
    }
    
    await db.transaction(async (tx) => {
      // Borrar local
      await tx.delete(tableSchema).where(eq(tableSchema.id, recordId));
      
      // Encolar eliminación
      await tx.insert(offlineMutations).values({
        id: randomUUID(),
        tableName: table,
        operation: "DELETE",
        recordId: recordId,
        dataJson: JSON.stringify({ id: recordId }),
        createdAt: new Date().toISOString()
      });
    });
    
    console.log(`[Offline Gateway] Registrada eliminacion local (DELETE) en tabla ${table}: ${recordId}`);
    return res.status(200).json({ success: true });
  } catch (error: any) {
    console.error(`[Offline Gateway] Error en DELETE para la tabla ${table}:`, error);
    return res.status(500).json({ error: error.message });
  }
});

export default router;
