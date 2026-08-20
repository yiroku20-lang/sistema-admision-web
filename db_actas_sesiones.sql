-- Script para agregar soporte a Actas de Sesiones y Autoridades

-- 1. Agregar campos a personal_directorio
ALTER TABLE public.personal_directorio ADD COLUMN IF NOT EXISTS titulo_academico text;
ALTER TABLE public.personal_directorio ADD COLUMN IF NOT EXISTS cargo_actual text;

-- 2. Crear tabla actas_sesiones
CREATE TABLE IF NOT EXISTS public.actas_sesiones (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamp with time zone DEFAULT now(),
  numero text, -- ej. "Acta Nro 001-2024"
  fecha date NOT NULL,
  titulo text NOT NULL,
  tipo_sesion text NOT NULL, -- Ordinaria, Extraordinaria
  estado text DEFAULT 'Borrador', -- Borrador, Refinada, Cerrada
  contenido_bruto text,
  contenido_refinado text,
  firmantes jsonb DEFAULT '[]'::jsonb, -- Array de objetos
  created_by uuid REFERENCES auth.users(id)
);

ALTER TABLE public.actas_sesiones ENABLE ROW LEVEL SECURITY;

-- Mantenemos políticas simples para usuarios logueados (como el resto del sistema actual)
DROP POLICY IF EXISTS "Permitir select actas" ON public.actas_sesiones;
CREATE POLICY "Permitir select actas" ON public.actas_sesiones FOR SELECT USING (true);

DROP POLICY IF EXISTS "Permitir insert actas" ON public.actas_sesiones;
CREATE POLICY "Permitir insert actas" ON public.actas_sesiones FOR INSERT WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Permitir update actas" ON public.actas_sesiones;
CREATE POLICY "Permitir update actas" ON public.actas_sesiones FOR UPDATE USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Permitir delete actas" ON public.actas_sesiones;
CREATE POLICY "Permitir delete actas" ON public.actas_sesiones FOR DELETE USING (auth.role() = 'authenticated');
