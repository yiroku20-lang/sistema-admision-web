import { db } from "../db/db.js";
import { 
  offlineMutations, 
  syncConflictLogs, 
  participantes, 
  cvVacantes, 
  padronPagos, 
  incomingFiles 
} from "../db/schema.js";
import { eq, asc } from "drizzle-orm";
import { supabase } from "../config/index.js";
import { isOnline } from "./network.js";
import { config } from "../config/index.js";

// Estado de sincronización en ejecución
let _isSyncing = false;
let syncInterval: NodeJS.Timeout | null = null;

export function isSyncing(): boolean {
  return _isSyncing;
}

// Mapeo de nombres de tablas de cadena a esquemas de Drizzle y Supabase API endpoints
const TABLES_MAP: Record<string, any> = {
  participantes: participantes,
  cv_vacantes: cvVacantes,
  padron_pagos: padronPagos,
  incoming_files: incomingFiles
};

/**
 * 1. PROCESAR ESCRITURAS OFFLINE (PUSH)
 */
export async function pushOfflineMutations() {
  if (!isOnline()) return;
  
  const mutations = await db
    .select()
    .from(offlineMutations)
    .orderBy(asc(offlineMutations.createdAt));
    
  if (mutations.length === 0) return;
  
  console.log(`[Sync Engine] Detectadas ${mutations.length} mutaciones offline pendientes. Subiendo a Supabase...`);
  
  for (const mutation of mutations) {
    try {
      const tableSchema = TABLES_MAP[mutation.tableName];
      if (!tableSchema) {
        console.warn(`[Sync Engine] Tabla desconocida en cola: ${mutation.tableName}`);
        continue;
      }
      
      const localRecord = JSON.parse(mutation.dataJson || "{}");
      
      // Consultar registro actual en la nube para detectar conflictos
      const { data: cloudRecord, error: fetchError } = await supabase
        .from(mutation.tableName)
        .select("*")
        .eq("id", mutation.recordId)
        .maybeSingle();
        
      if (fetchError) {
        console.error(`[Sync Engine] Error al verificar registro en Supabase para ${mutation.tableName}:${mutation.recordId}`, fetchError);
        continue;
      }
      
      let shouldPush = true;
      
      // Si el registro existe en la nube y tiene timestamps
      if (cloudRecord && cloudRecord.updated_at && localRecord.updatedAt) {
        const cloudTime = new Date(cloudRecord.updated_at).getTime();
        const localTime = new Date(localRecord.updatedAt).getTime();
        
        // Si el registro en la nube es más nuevo que el local
        if (cloudTime > localTime) {
          shouldPush = false;
          console.warn(`[Sync Conflict] Conflicto detectado en ${mutation.tableName}:${mutation.recordId}. La nube es mas reciente. Aplicando Last-Write-Wins (Nube gana).`);
          
          // Registrar el conflicto localmente para auditoría
          const conflictId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
          await db.insert(syncConflictLogs).values({
            id: conflictId,
            tableName: mutation.tableName,
            recordId: mutation.recordId,
            localData: JSON.stringify(localRecord),
            cloudData: JSON.stringify(cloudRecord),
            resolvedAt: new Date().toISOString()
          });
          
          // Sobrescribir el SQLite local con los datos más nuevos de la nube
          await db.transaction(async (tx) => {
            // Eliminar syncStatus 'pending'
            const updatedCloudRecord = { ...cloudRecord, syncStatus: "synced" };
            
            // Drizzle SQLite upsert para actualizar el registro local
            await tx
              .insert(tableSchema)
              .values(updatedCloudRecord)
              .onConflictDoUpdate({
                target: tableSchema.id,
                set: updatedCloudRecord
              });
          });
        }
      }
      
      if (shouldPush) {
        // Ejecutar operacion de subida a Supabase
        if (mutation.operation === "INSERT" || mutation.operation === "UPDATE") {
          // Limpiar la clave syncStatus antes de enviar a Supabase (ya que Supabase no necesita esa columna)
          const { syncStatus, ...dataToPush } = localRecord;
          
          const { error: upsertError } = await supabase
            .from(mutation.tableName)
            .upsert(dataToPush);
            
          if (upsertError) {
            console.error(`[Sync Engine] Fallo al subir datos a Supabase para ${mutation.tableName}:${mutation.recordId}`, upsertError);
            continue;
          }
        } else if (mutation.operation === "DELETE") {
          const { error: deleteError } = await supabase
            .from(mutation.tableName)
            .delete()
            .eq("id", mutation.recordId);
            
          if (deleteError) {
            console.error(`[Sync Engine] Fallo al eliminar en Supabase para ${mutation.tableName}:${mutation.recordId}`, deleteError);
            continue;
          }
        }
        
        // Actualizar el estado local a synced (en caso de insert/update que sobrevive)
        if (mutation.operation !== "DELETE") {
          await db
            .update(tableSchema)
            .set({ syncStatus: "synced" })
            .where(eq(tableSchema.id, mutation.recordId));
        }
      }
      
      // Eliminar mutación procesada de la cola
      await db.delete(offlineMutations).where(eq(offlineMutations.id, mutation.id));
      
    } catch (err) {
      console.error(`[Sync Engine] Error critico procesando mutacion local ${mutation.id}:`, err);
    }
  }
  
  console.log(`[Sync Engine] Sincronizacion de subida (Push) completada.`);
}

/**
 * 2. DESCARGAR CAMBIOS Y BACKUP PROGRAMADO (PULL)
 * Sincroniza desde Supabase hacia SQLite de forma paginada y filtrada por Periodo Activo.
 */
export async function pullSupabaseBackup() {
  if (!isOnline()) return;
  
  console.log(`[Sync Engine] Iniciando descarga de backup (Pull) desde Supabase para el periodo: ${config.CURRENT_PERIODO}`);
  
  const tables = ["cv_vacantes", "participantes", "padron_pagos", "incoming_files"];
  
  for (const tableName of tables) {
    try {
      const tableSchema = TABLES_MAP[tableName];
      if (!tableSchema) continue;
      
      let offset = 0;
      const limit = 1000;
      let hasMore = true;
      let totalFetched = 0;
      
      while (hasMore) {
        // Consultar a Supabase con paginacion y filtro por periodo activo
        let query = supabase
          .from(tableName)
          .select("*")
          .range(offset, offset + limit - 1);
          
        // cv_vacantes e incoming_files no tienen columna de periodo para filtrar en Supabase
        if (tableName !== "cv_vacantes" && tableName !== "incoming_files") {
          // El padron de pagos usa concurso, la tabla participantes usa SEMESTRE y ANIO
          if (tableName === "participantes") {
            const [anio] = config.CURRENT_PERIODO.split("-");
            query = query.eq("ANIO", anio).eq("SEMESTRE", config.CURRENT_PERIODO);
          } else if (tableName === "padron_pagos") {
            // Búsqueda parcial de concurso que contenga el periodo actual (ej. '%2026-I%')
            query = query.ilike("concurso", `%${config.CURRENT_PERIODO}%`);
          } else {
            query = query.eq("periodo", config.CURRENT_PERIODO);
          }
        }
        
        const { data, error } = await query;
          
        if (error) {
          console.error(`[Sync Engine] Error descargando tabla ${tableName} de Supabase:`, error);
          hasMore = false;
          continue;
        }
        
        if (!data || data.length === 0) {
          hasMore = false;
          continue;
        }
        
        totalFetched += data.length;
        
        // Vuelco a base local SQLite mediante una transaccion rapida
        await db.transaction(async (tx) => {
          for (const item of data) {
            // Mapear campos para compatibilidad local si difieren
            const localItem: any = {
              ...item,
              periodo: config.CURRENT_PERIODO,
              syncStatus: "synced"
            };
            
            // Drizzle SQLite requiere fechas en formato de texto
            if (item.created_at) localItem.createdAt = new Date(item.created_at).toISOString();
            if (item.updated_at) localItem.updatedAt = new Date(item.updated_at).toISOString();
            
            // Campos vacíos por defecto
            if (!localItem.createdAt) localItem.createdAt = new Date().toISOString();
            if (!localItem.updatedAt) localItem.updatedAt = new Date().toISOString();
            
            await tx
              .insert(tableSchema)
              .values(localItem)
              .onConflictDoUpdate({
                target: tableSchema.id,
                set: localItem
              });
          }
        });
        
        if (data.length < limit) {
          hasMore = false;
        } else {
          offset += limit;
        }
      }
      
      console.log(`[Sync Engine] Tabla '${tableName}' sincronizada localmente. Registros actualizados: ${totalFetched}`);
      
    } catch (err) {
      console.error(`[Sync Engine] Error critico en Pull Sync de la tabla ${tableName}:`, err);
    }
  }
  
  console.log(`[Sync Engine] Sincronizacion de descarga (Pull) finalizada.`);
}

/**
 * Función principal que orquesta la sincronización completa.
 */
export async function runFullSync() {
  if (_isSyncing) {
    console.log("[Sync Engine] Sincronización en curso. Omitiendo llamada.");
    return;
  }
  
  _isSyncing = true;
  console.log("[Sync Engine] === Iniciando Ciclo de Sincronizacion Bidireccional ===");
  
  try {
    const online = await isOnline();
    if (online) {
      // 1. Primero subir cambios locales (para no machacarlos con el backup)
      await pushOfflineMutations();
      // 2. Traer la base actualizada de la nube
      await pullSupabaseBackup();
    } else {
      console.log("[Sync Engine] Dispositivo Offline. No es posible sincronizar con Supabase.");
    }
  } catch (error) {
    console.error("[Sync Engine] Error en ciclo de sincronizacion:", error);
  } finally {
    _isSyncing = false;
    console.log("[Sync Engine] === Fin del Ciclo de Sincronizacion ===");
  }
}

/**
 * Inicia el planificador de sincronización automática.
 * Ejecuta Full Sync cada X horas y al iniciar.
 */
export function startSyncScheduler(hours: number = 3) {
  // Ejecutar al arrancar después de validar la red inicial (delay de 5 segundos)
  setTimeout(() => {
    runFullSync();
  }, 5000);
  
  const intervalMs = hours * 60 * 60 * 1000;
  
  if (syncInterval) {
    clearInterval(syncInterval);
  }
  
  syncInterval = setInterval(() => {
    runFullSync();
  }, intervalMs);
}

/**
 * Detiene el programador.
 */
export function stopSyncScheduler() {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
  }
}
