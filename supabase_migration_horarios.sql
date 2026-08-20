-- Ejecuta este script en el SQL Editor de tu panel de Supabase

-- Agregar la columna JSONB a la tabla personal_sorteos para almacenar los horarios generados
ALTER TABLE public.personal_sorteos 
ADD COLUMN IF NOT EXISTS horario_data JSONB;

-- Comentario explicativo
COMMENT ON COLUMN public.personal_sorteos.horario_data IS 'Almacena un array JSON con el cronograma y turnos asignados a esta persona. Ej: [{"fecha": "2026-02-02", "hora_inicio": "08:00", "hora_fin": "11:00", "grupo": "Grupo 1"}]';
