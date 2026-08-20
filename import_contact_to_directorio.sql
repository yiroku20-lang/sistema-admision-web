-- This script will copy the 'email_personal' and 'telefono' from 'personal_sorteos' 
-- back into 'personal_directorio' where there is a match by 'dni'.

UPDATE public.personal_directorio pd
SET 
  correo = subquery.email_personal,
  telefono = subquery.telefono
FROM (
  SELECT dni, email_personal, telefono
  FROM public.personal_sorteos
  WHERE email_personal IS NOT NULL 
     OR telefono IS NOT NULL
) AS subquery
WHERE pd.dni = subquery.dni;
