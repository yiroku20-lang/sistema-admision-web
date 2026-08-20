-- =====================================================================================
-- SCRIPT DE CREACIÓN UNIFICADA DE BASE DE DATOS (SUPABASE)
-- Copia y pega esto directamente en el SQL Editor de tu panel de Supabase.
-- =====================================================================================

-- 1. Habilitar extensión para UUIDs
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Eliminar tablas previas (Opcional, precaución si ya tienes datos)
-- DROP TABLE IF EXISTS asistencia, actas, personal_huellas, personal_directorio CASCADE;

-- ==========================================
-- TABLAS PRINCIPALES (PERSONAL Y HUELLAS)
-- ==========================================

CREATE TABLE IF NOT EXISTS personal_directorio (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    dni TEXT UNIQUE NOT NULL,
    nombre TEXT NOT NULL,
    apellidos TEXT,
    rol TEXT DEFAULT 'Colaborador',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS personal_huellas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    dni TEXT UNIQUE NOT NULL REFERENCES personal_directorio(dni) ON DELETE CASCADE,
    huella_template TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ==========================================
-- TABLAS OPERATIVAS (ASISTENCIAS Y ACTAS)
-- ==========================================

CREATE TABLE IF NOT EXISTS asistencia (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    dni TEXT NOT NULL,
    fecha DATE NOT NULL,
    hora TIME NOT NULL,
    firma TEXT, -- Almacena el Base64 de la firma o la foto de la huella
    metodo_validacion TEXT DEFAULT 'MANUAL', -- 'MANUAL' o 'HUELLA'
    proceso_id UUID,
    observaciones TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS actas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    proceso_id UUID,
    titulo TEXT NOT NULL,
    archivo_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ==========================================
-- POLÍTICAS DE SEGURIDAD (RLS - Permisivas para iniciar)
-- ==========================================
-- Habilitamos RLS
ALTER TABLE personal_directorio ENABLE ROW LEVEL SECURITY;
ALTER TABLE personal_huellas ENABLE ROW LEVEL SECURITY;
ALTER TABLE asistencia ENABLE ROW LEVEL SECURITY;
ALTER TABLE actas ENABLE ROW LEVEL SECURITY;

-- Políticas de Acceso Total (Puedes restringir esto luego)
CREATE POLICY "Permitir TODO en personal_directorio" ON personal_directorio FOR ALL USING (true);
CREATE POLICY "Permitir TODO en personal_huellas" ON personal_huellas FOR ALL USING (true);
CREATE POLICY "Permitir TODO en asistencia" ON asistencia FOR ALL USING (true);
CREATE POLICY "Permitir TODO en actas" ON actas FOR ALL USING (true);

-- ==========================================
-- BUCKETS DE ALMACENAMIENTO (DOCUMENTOS Y FIRMAS)
-- ==========================================

-- Insertar bucket de 'documentos' si no existe
INSERT INTO storage.buckets (id, name, public) 
VALUES ('documentos', 'documentos', true)
ON CONFLICT (id) DO NOTHING;

-- Insertar bucket de 'firmas' si no existe (opcional)
INSERT INTO storage.buckets (id, name, public) 
VALUES ('firmas', 'firmas', true)
ON CONFLICT (id) DO NOTHING;

-- Políticas de Storage (Acceso público)
CREATE POLICY "Acceso publico documentos" ON storage.objects FOR ALL USING (bucket_id = 'documentos');
CREATE POLICY "Acceso publico firmas" ON storage.objects FOR ALL USING (bucket_id = 'firmas');

