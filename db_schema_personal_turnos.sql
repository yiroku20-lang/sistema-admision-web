-- Nuevo esquema para la gestión de turnos y asignaciones de labores (Personal Confirmado)

CREATE TABLE IF NOT EXISTS public.personal_rubros_turnos (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    proceso_id uuid REFERENCES public.personal_procesos(id) ON DELETE CASCADE,
    nombre text NOT NULL, -- Ej: 'Día del Examen - Turno Mañana', 'Grupo Capacitación A'
    fecha date NOT NULL,
    hora_inicio time NOT NULL,
    hora_fin time NOT NULL,
    cupo integer DEFAULT 0, -- 0 significa sin limite
    created_at timestamp with time zone DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.personal_rubros_turnos ENABLE ROW LEVEL SECURITY;

-- Políticas (Lectura/Escritura full para usuarios logueados o roles permitidos - ajustable)
CREATE POLICY "Turnos view access" ON public.personal_rubros_turnos
    FOR SELECT TO authenticated USING (true);
CREATE POLICY "Turnos write access" ON public.personal_rubros_turnos
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

-----------------------------------------------------

CREATE TABLE IF NOT EXISTS public.personal_asignaciones (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    turno_id uuid REFERENCES public.personal_rubros_turnos(id) ON DELETE CASCADE,
    sorteo_id uuid REFERENCES public.personal_sorteos(id) ON DELETE CASCADE,
    created_at timestamp with time zone DEFAULT now(),
    UNIQUE(turno_id, sorteo_id)
);

-- Habilitar RLS
ALTER TABLE public.personal_asignaciones ENABLE ROW LEVEL SECURITY;

-- Políticas
CREATE POLICY "Asignaciones view access" ON public.personal_asignaciones
    FOR SELECT TO authenticated USING (true);
CREATE POLICY "Asignaciones write access" ON public.personal_asignaciones
    FOR ALL TO authenticated USING (true) WITH CHECK (true);
