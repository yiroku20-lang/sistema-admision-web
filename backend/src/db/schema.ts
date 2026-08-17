import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

// 1. Tabla de Participantes (Postulantes)
export const participantes = sqliteTable("participantes", {
  id: text("id").primaryKey(), // UUID de Supabase
  CODPOSTULANTE: text("CODPOSTULANTE").notNull(),
  NOMBRE: text("NOMBRE").notNull(),
  CARRERA: text("CARRERA").notNull(),
  codigo_carrera: text("codigo_carrera"),
  FILIAL: text("FILIAL").notNull(),
  MODALIDAD: text("MODALIDAD").notNull(),
  SEMESTRE: text("SEMESTRE").notNull(),
  ANIO: text("ANIO").notNull(),
  NOTA: text("NOTA").notNull(),
  OMERITO: text("OMERITO").notNull(),
  FECHAINGRESO: text("FECHAINGRESO").notNull(),
  
  // Columnas de sincronización
  periodo: text("periodo").default("2026-I").notNull(), // Para partición local
  syncStatus: text("sync_status").default("synced").notNull(), // 'synced', 'pending', 'conflict'
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull()
});

// 2. Tabla de CV Vacantes (Vacantes)
export const cvVacantes = sqliteTable("cv_vacantes", {
  id: text("id").primaryKey(),
  escuela_id: text("escuela_id").notNull(),
  modalidad_id: text("modalidad_id").notNull(),
  cantidad: integer("cantidad").notNull(),
  
  // Columnas de sincronización
  periodo: text("periodo").default("2026-I").notNull(),
  syncStatus: text("sync_status").default("synced").notNull(),
  createdAt: text("created_at").default("").notNull(),
  updatedAt: text("updated_at").default("").notNull()
});

// 3. Tabla de Padrón de Pagos (Pagos)
export const padronPagos = sqliteTable("padron_pagos", {
  id: text("id").primaryKey(),
  concurso: text("concurso"),
  dni: text("dni"),
  student_name: text("student_name"),
  phone: text("phone"),
  birth_date: text("birth_date"),
  age: text("age"),
  parent_name: text("parent_name"),
  parent_phone: text("parent_phone"),
  payment_date: text("payment_date"),
  amount: text("amount"),
  reason: text("reason"),
  type: text("type"), // 'Devolución' o 'Transferencia'
  target_exam: text("target_exam"),
  status: text("status"), // 'Pendiente Originales', 'Apto', etc.
  incoming_file_number: text("incoming_file_number"),
  outgoing_doc_number: text("outgoing_doc_number"),
  resolution_number: text("resolution_number"),
  resolution_date: text("resolution_date"),
  resolution_pdf: text("resolution_pdf"),
  transfer_notified: integer("transfer_notified"), // boolean (0 o 1)

  // Columnas de sincronización
  periodo: text("periodo").default("2026-I").notNull(),
  syncStatus: text("sync_status").default("synced").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull()
});

// 4. Tabla de Archivos Recibidos (Incoming Files / Documentos)
export const incomingFiles = sqliteTable("incoming_files", {
  id: text("id").primaryKey(),
  number: text("number").notNull(),
  subject: text("subject").notNull(),
  dateTime: text("dateTime").notNull(),
  type: text("type").notNull(), // 'General', 'Especial'
  status: text("status").notNull(), // 'Pendiente', 'En Progreso', etc.
  
  // Archivo Físico Local
  nombre_archivo: text("nombre_archivo"),
  ruta_local: text("ruta_local"),
  tamano_bytes: integer("tamano_bytes"),

  // Columnas de sincronización
  periodo: text("periodo").default("2026-I").notNull(),
  syncStatus: text("sync_status").default("synced").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull()
});

// 5. Tabla de Usuarios (Caché local con contraseña cifrada)
export const usuarios = sqliteTable("usuarios", {
  id: text("id").primaryKey(), // UUID de Supabase Auth
  dni: text("dni").notNull().unique(), // DNI del usuario (p.ej. 47773611)
  name: text("name").notNull(),
  role: text("role").notNull(), // 'Administrador', 'Director', 'Operador'
  passwordHash: text("password_hash").notNull(), // Hash local con bcryptjs para login offline
  permissions: text("permissions"), // Permisos del usuario en formato JSON stringificado
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull()
});

// 6. Cola de Mutaciones Offline
export const offlineMutations = sqliteTable("offline_mutations", {
  id: text("id").primaryKey(),
  tableName: text("table_name").notNull(),
  operation: text("operation").notNull(), // 'INSERT', 'UPDATE', 'DELETE'
  recordId: text("record_id").notNull(),
  dataJson: text("data_json"),
  createdAt: text("created_at").notNull()
});

// 7. Registro de Conflictos de Sincronización
export const syncConflictLogs = sqliteTable("sync_conflict_logs", {
  id: text("id").primaryKey(),
  tableName: text("table_name").notNull(),
  recordId: text("record_id").notNull(),
  localData: text("local_data").notNull(),
  cloudData: text("cloud_data").notNull(),
  resolvedAt: text("resolved_at").notNull()
});
