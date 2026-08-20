-- Actas de Sesiones (Meeting Minutes)
CREATE TABLE IF NOT EXISTS public.actas_sesiones (
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    numero text COLLATE pg_catalog."default",
    fecha date NOT NULL DEFAULT CURRENT_DATE,
    titulo text COLLATE pg_catalog."default" NOT NULL,
    tipo_sesion text COLLATE pg_catalog."default" NOT NULL,
    estado text COLLATE pg_catalog."default" NOT NULL DEFAULT 'Borrador'::text,
    contenido_bruto text COLLATE pg_catalog."default",
    contenido_refinado text COLLATE pg_catalog."default",
    archivo_pdf text COLLATE pg_catalog."default",
    firmantes jsonb NOT NULL DEFAULT '[]'::jsonb,
    created_by uuid,
    created_at timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT actas_sesiones_pkey PRIMARY KEY (id),
    CONSTRAINT actas_sesiones_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users (id)
);

-- Policies for actas_sesiones
ALTER TABLE public.actas_sesiones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Actas - Lectura general"
    ON public.actas_sesiones
    FOR SELECT
    USING (auth.uid() IS NOT NULL);

CREATE POLICY "Actas - Inserción"
    ON public.actas_sesiones
    FOR INSERT
    WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Actas - Actualización"
    ON public.actas_sesiones
    FOR UPDATE
    USING (auth.uid() IS NOT NULL);

-- Asegurarte que el bucket "documentos" exista en storage
INSERT INTO storage.buckets (id, name, public) 
VALUES ('documentos', 'documentos', true)
ON CONFLICT (id) DO NOTHING;

-- Policies para Storage "documentos"
CREATE POLICY "Permitir leer documentos a todos"
ON storage.objects FOR SELECT
USING ( bucket_id = 'documentos' );

CREATE POLICY "Permitir subir documentos a usuarios auth"
ON storage.objects FOR INSERT
WITH CHECK ( bucket_id = 'documentos' AND auth.role() = 'authenticated' );

CREATE POLICY "Permitir actualizar documentos a usuarios auth"
ON storage.objects FOR UPDATE
USING ( bucket_id = 'documentos' AND auth.role() = 'authenticated' );
