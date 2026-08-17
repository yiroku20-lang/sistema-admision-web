CREATE TABLE `cv_vacantes` (
	`id` text PRIMARY KEY NOT NULL,
	`escuela_id` text NOT NULL,
	`modalidad_id` text NOT NULL,
	`cantidad` integer NOT NULL,
	`periodo` text DEFAULT '2026-I' NOT NULL,
	`sync_status` text DEFAULT 'synced' NOT NULL,
	`created_at` text DEFAULT '' NOT NULL,
	`updated_at` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `incoming_files` (
	`id` text PRIMARY KEY NOT NULL,
	`number` text NOT NULL,
	`subject` text NOT NULL,
	`dateTime` text NOT NULL,
	`type` text NOT NULL,
	`status` text NOT NULL,
	`nombre_archivo` text,
	`ruta_local` text,
	`tamano_bytes` integer,
	`periodo` text DEFAULT '2026-I' NOT NULL,
	`sync_status` text DEFAULT 'synced' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `offline_mutations` (
	`id` text PRIMARY KEY NOT NULL,
	`table_name` text NOT NULL,
	`operation` text NOT NULL,
	`record_id` text NOT NULL,
	`data_json` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `padron_pagos` (
	`id` text PRIMARY KEY NOT NULL,
	`concurso` text,
	`dni` text,
	`student_name` text,
	`phone` text,
	`birth_date` text,
	`age` text,
	`parent_name` text,
	`parent_phone` text,
	`payment_date` text,
	`amount` text,
	`reason` text,
	`type` text,
	`target_exam` text,
	`status` text,
	`incoming_file_number` text,
	`outgoing_doc_number` text,
	`resolution_number` text,
	`resolution_date` text,
	`resolution_pdf` text,
	`transfer_notified` integer,
	`periodo` text DEFAULT '2026-I' NOT NULL,
	`sync_status` text DEFAULT 'synced' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `participantes` (
	`id` text PRIMARY KEY NOT NULL,
	`CODPOSTULANTE` text NOT NULL,
	`NOMBRE` text NOT NULL,
	`CARRERA` text NOT NULL,
	`codigo_carrera` text,
	`FILIAL` text NOT NULL,
	`MODALIDAD` text NOT NULL,
	`SEMESTRE` text NOT NULL,
	`ANIO` text NOT NULL,
	`NOTA` text NOT NULL,
	`OMERITO` text NOT NULL,
	`FECHAINGRESO` text NOT NULL,
	`periodo` text DEFAULT '2026-I' NOT NULL,
	`sync_status` text DEFAULT 'synced' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sync_conflict_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`table_name` text NOT NULL,
	`record_id` text NOT NULL,
	`local_data` text NOT NULL,
	`cloud_data` text NOT NULL,
	`resolved_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `usuarios` (
	`id` text PRIMARY KEY NOT NULL,
	`dni` text NOT NULL,
	`name` text NOT NULL,
	`role` text NOT NULL,
	`password_hash` text NOT NULL,
	`permissions` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `usuarios_dni_unique` ON `usuarios` (`dni`);