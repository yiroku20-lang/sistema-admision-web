CREATE TABLE IF NOT EXISTS public.personal_directorio (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    cod_trab TEXT,
    dni TEXT NOT NULL,
    nombre TEXT NOT NULL,
    condicion TEXT,
    categoria_regimen TEXT,
    facultad_dependencia TEXT,
    departamento_cargo TEXT,
    escuela_profesional TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.personal_procesos (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    modalidad_id UUID NOT NULL REFERENCES public.cv_modalidades(id) ON DELETE CASCADE,
    nombre TEXT NOT NULL,
    estado TEXT DEFAULT 'Borrador',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.personal_necesidades (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    proceso_id UUID REFERENCES public.personal_procesos(id) ON DELETE CASCADE,
    cargo TEXT NOT NULL,
    cantidad_requerida INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.personal_sorteos (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    proceso_id UUID REFERENCES public.personal_procesos(id) ON DELETE CASCADE,
    cargo TEXT NOT NULL,
    dni TEXT NOT NULL,
    nombres TEXT NOT NULL,
    condicion_sorteo TEXT NOT NULL,
    email_personal TEXT,
    telefono TEXT,
    estado_confirmacion TEXT DEFAULT 'Pendiente',
    directorio_id UUID REFERENCES public.personal_directorio(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Configurar RLS (Row-Level Security)
ALTER TABLE public.personal_directorio ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.personal_procesos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.personal_necesidades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.personal_sorteos ENABLE ROW LEVEL SECURITY;

-- Políticas para personal_directorio
CREATE POLICY "Permitir select directorio" ON public.personal_directorio FOR SELECT USING (true);
CREATE POLICY "Permitir insert directorio" ON public.personal_directorio FOR INSERT WITH CHECK (true);
CREATE POLICY "Permitir update directorio" ON public.personal_directorio FOR UPDATE USING (true);
CREATE POLICY "Permitir delete directorio" ON public.personal_directorio FOR DELETE USING (true);

-- Políticas para personal_procesos
CREATE POLICY "Permitir select procesos" ON public.personal_procesos FOR SELECT USING (true);
CREATE POLICY "Permitir insert procesos" ON public.personal_procesos FOR INSERT WITH CHECK (true);
CREATE POLICY "Permitir update procesos" ON public.personal_procesos FOR UPDATE USING (true);
CREATE POLICY "Permitir delete procesos" ON public.personal_procesos FOR DELETE USING (true);

-- Políticas para personal_necesidades
CREATE POLICY "Permitir select necesidades" ON public.personal_necesidades FOR SELECT USING (true);
CREATE POLICY "Permitir insert necesidades" ON public.personal_necesidades FOR INSERT WITH CHECK (true);
CREATE POLICY "Permitir update necesidades" ON public.personal_necesidades FOR UPDATE USING (true);
CREATE POLICY "Permitir delete necesidades" ON public.personal_necesidades FOR DELETE USING (true);

-- Políticas para personal_sorteos
CREATE POLICY "Permitir select sorteos" ON public.personal_sorteos FOR SELECT USING (true);
CREATE POLICY "Permitir insert sorteos" ON public.personal_sorteos FOR INSERT WITH CHECK (true);
CREATE POLICY "Permitir update sorteos" ON public.personal_sorteos FOR UPDATE USING (true);
CREATE POLICY "Permitir delete sorteos" ON public.personal_sorteos FOR DELETE USING (true);
