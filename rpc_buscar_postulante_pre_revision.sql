CREATE OR REPLACE FUNCTION public.buscar_postulante_pre_revision(p_termino text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_results json;
  v_term text;
  v_is_numeric boolean;
  v_max_files int;
BEGIN
  v_term := TRIM(p_termino);
  
  IF v_term IS NULL OR v_term = '' THEN
    RETURN '[]'::json;
  END IF;

  v_is_numeric := v_term ~ '^[0-9]+$';

  IF NOT v_is_numeric AND length(v_term) < 3 THEN
    RETURN '[]'::json;
  END IF;

  v_max_files := CASE WHEN v_is_numeric THEN 5 ELSE 3 END;

  WITH matching_files AS (
    SELECT 
      p.id as pre_revision_id,
      p.modalidad_id,
      m.nombre as modalidad_nombre,
      m.semestre as modalidad_semestre,
      ca.anio as modalidad_anio,
      p.csv_data::jsonb as json_content
    FROM public.pre_revision_archivos p
    LEFT JOIN public.cv_modalidades m ON m.id = p.modalidad_id
    LEFT JOIN public.cv_cuadros_anuales ca ON ca.id = m.cuadro_id
    WHERE p.csv_data LIKE ('%' || v_term || '%')
    LIMIT v_max_files
  ),
  unpacked_rows AS (
    SELECT 
      mf.pre_revision_id,
      mf.modalidad_id,
      mf.modalidad_nombre,
      mf.modalidad_semestre,
      mf.modalidad_anio,
      CASE 
        WHEN jsonb_typeof(mf.json_content) = 'array' THEN mf.json_content
        WHEN jsonb_typeof(mf.json_content->'postulantes') = 'array' THEN mf.json_content->'postulantes'
        WHEN jsonb_typeof(mf.json_content->'data') = 'array' THEN mf.json_content->'data'
        WHEN jsonb_typeof(mf.json_content->'rows') = 'array' THEN mf.json_content->'rows'
        ELSE '[]'::jsonb
      END as arr
    FROM matching_files mf
  ),
  matched_applicants AS (
    SELECT 
      (elem || jsonb_build_object(
        '_preRevisionId', u.pre_revision_id,
        '_modalidadId', u.modalidad_id,
        '_modalidadNombre', COALESCE(u.modalidad_nombre, ''),
        '_semestre', COALESCE(u.modalidad_semestre, ''),
        '_anio', COALESCE(u.modalidad_anio, '')
      )) as applicant_obj
    FROM unpacked_rows u,
    LATERAL jsonb_array_elements(u.arr) as elem
    WHERE 
      CASE 
        WHEN v_is_numeric THEN
          COALESCE(elem->>'NroDocumento', elem->>'alumno', elem->>'dni', elem->>'DNI', elem->>'CODPOSTULANTE', elem->>'DOCUMENTO', '') = v_term
        ELSE
          UPPER(COALESCE(elem->>'nombre', elem->>'Nombre', elem->>'NOMBRE', elem->>'POSTULANTE', '')) LIKE ('%' || UPPER(v_term) || '%')
      END
    LIMIT 30
  )
  SELECT json_agg(applicant_obj) INTO v_results FROM matched_applicants;

  RETURN COALESCE(v_results, '[]'::json);

EXCEPTION
  WHEN OTHERS THEN
    RETURN '[]'::json;
END;
$$;

-- Permisos de ejecución
GRANT EXECUTE ON FUNCTION public.buscar_postulante_pre_revision(text) TO anon, authenticated, service_role;


