-- Ejecuta este script en el SQL Editor de tu panel de Supabase
-- Agrega la columna JSONB para el itinerario de colegios de las Giras Vocacionales

ALTER TABLE public.eventos 
ADD COLUMN IF NOT EXISTS colegios_itinerario JSONB DEFAULT '[]'::jsonb;

-- Comentario explicativo
COMMENT ON COLUMN public.eventos.colegios_itinerario IS 'Almacena el listado ordenado de colegios a visitar durante una Gira Vocacional. Ej: [{"nombre_ie": "Ciencias", "distrito": "Cusco", "provincia": "Cusco", "dia_estimado": "Día 1"}]';
