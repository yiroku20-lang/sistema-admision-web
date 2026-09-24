-- =====================================================================================
-- PERMISOS Y RLS PARA CONTROL DE ASISTENCIA Y USUARIOS
-- Ejecutar este script en el Editor SQL de Supabase para habilitar lectura de personal
-- =====================================================================================

-- 1. Habilitar RLS en la tabla usuarios (por si aún no está activo)
ALTER TABLE public.usuarios ENABLE ROW LEVEL SECURITY;

-- 2. Permitir lectura de la tabla usuarios a clientes (anon y authenticated)
-- Esto permite que el Control de Asistencia pueda listar al personal y validar DNI
DROP POLICY IF EXISTS "Acceso lectura usuarios" ON public.usuarios;
CREATE POLICY "Acceso lectura usuarios" 
ON public.usuarios 
FOR SELECT 
TO anon, authenticated 
USING (true);

-- 3. Asegurar permisos GRANT a nivel de rol de PostgreSQL
GRANT SELECT ON public.usuarios TO anon, authenticated;

-- 4. Asegurar permisos en la tabla asistencia (para lecturas e inserciones de marcación)
ALTER TABLE public.asistencia ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Acceso total asistencia" ON public.asistencia;
CREATE POLICY "Acceso total asistencia" 
ON public.asistencia 
FOR ALL 
TO anon, authenticated 
USING (true) 
WITH CHECK (true);

GRANT ALL ON public.asistencia TO anon, authenticated;

-- 5. Opcional: Si personal_directorio se usa como directorio general, habilitar lectura
ALTER TABLE IF EXISTS public.personal_directorio ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Acceso lectura personal_directorio" ON public.personal_directorio;
CREATE POLICY "Acceso lectura personal_directorio" 
ON public.personal_directorio 
FOR SELECT 
TO anon, authenticated 
USING (true);

GRANT SELECT ON public.personal_directorio TO anon, authenticated;
