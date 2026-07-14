-- ==========================================
-- SCRIPT DE INSTALACIÓN Y ACTUALIZACIÓN PARA EXAM BUDGETS
-- Ejecuta este código en el SQL Editor de tu panel de Supabase
-- (https://supabase.com/dashboard)
-- ==========================================

-- SI YA TIENES LA TABLA CREADA, ejecuta esta línea para agregar la columna faltante del Cronograma General:
ALTER TABLE public.cv_exam_budgets ADD COLUMN IF NOT EXISTS general_schedule jsonb NOT NULL DEFAULT '[]'::jsonb;

-- 1. Crear la tabla cv_exam_budgets si no existe
CREATE TABLE IF NOT EXISTS public.cv_exam_budgets (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    cuadro_anual_id uuid NOT NULL,
    modalidad_id uuid NOT NULL,
    items jsonb NOT NULL DEFAULT '[]'::jsonb,
    total_general numeric NOT NULL DEFAULT 0,
    schedules jsonb NOT NULL DEFAULT '[]'::jsonb,
    general_schedule jsonb NOT NULL DEFAULT '[]'::jsonb,
    is_locked boolean NOT NULL DEFAULT false,
    created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT cv_exam_budgets_pkey PRIMARY KEY (id),
    CONSTRAINT cv_exam_budgets_cuadro_anual_fkey FOREIGN KEY (cuadro_anual_id) REFERENCES public.cv_cuadros_anuales (id) ON DELETE CASCADE,
    CONSTRAINT cv_exam_budgets_modalidad_fkey FOREIGN KEY (modalidad_id) REFERENCES public.cv_modalidades (id) ON DELETE CASCADE
);

-- 2. Habilitar Seguridad a Nivel de Fila (RLS)
ALTER TABLE public.cv_exam_budgets ENABLE ROW LEVEL SECURITY;

-- 3. Crear Políticas de Acceso para cv_exam_budgets
-- Se permite acceso a todos los usuarios autenticados, o puedes ajustar según tus roles (ej. Administrador/Operador)
DROP POLICY IF EXISTS "Permitir lectura de presupuestos a usuarios autenticados" ON public.cv_exam_budgets;
CREATE POLICY "Permitir lectura de presupuestos a usuarios autenticados"
ON public.cv_exam_budgets
FOR SELECT
USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Permitir inserción de presupuestos a usuarios autenticados" ON public.cv_exam_budgets;
CREATE POLICY "Permitir inserción de presupuestos a usuarios autenticados"
ON public.cv_exam_budgets
FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Permitir actualización de presupuestos a usuarios autenticados" ON public.cv_exam_budgets;
CREATE POLICY "Permitir actualización de presupuestos a usuarios autenticados"
ON public.cv_exam_budgets
FOR UPDATE
USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Permitir eliminación de presupuestos a usuarios autenticados" ON public.cv_exam_budgets;
CREATE POLICY "Permitir eliminación de presupuestos a usuarios autenticados"
ON public.cv_exam_budgets
FOR DELETE
USING (auth.uid() IS NOT NULL);

-- 4. Agregar disparador para mantener actualizado updated_at automáticamente
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_updated_at ON public.cv_exam_budgets;
CREATE TRIGGER set_updated_at
    BEFORE UPDATE ON public.cv_exam_budgets
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

-- Comentario informativo
COMMENT ON TABLE public.cv_exam_budgets IS 'Tabla para presupuestos y cronogramas de exámenes de admisión con políticas RLS habilitadas.';
