-- ==============================================================================
-- 1. Crear función RPC que consolida todos los años y semestres únicos en 1 solo JSON liviano
-- ==============================================================================
CREATE OR REPLACE FUNCTION get_filtros_ingresantes()
RETURNS json AS $$
SELECT json_build_object(
  'anios', COALESCE(
    (SELECT json_agg(DISTINCT "ANIO" ORDER BY "ANIO" DESC) 
     FROM participantes 
     WHERE "ANIO" IS NOT NULL AND "ANIO" != ''),
    '[]'::json
  ),
  'semestres', COALESCE(
    (SELECT json_agg(DISTINCT "SEMESTRE" ORDER BY "SEMESTRE" DESC) 
     FROM participantes 
     WHERE "SEMESTRE" IS NOT NULL AND "SEMESTRE" != ''),
    '[]'::json
  )
);
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ==============================================================================
-- 2. Otorgar permisos de ejecución para la app web y de escritorio
-- ==============================================================================
GRANT EXECUTE ON FUNCTION get_filtros_ingresantes() TO anon, authenticated, service_role;
