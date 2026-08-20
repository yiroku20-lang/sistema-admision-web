-- Migrar usuarios existentes de public.usuarios a auth.users
DO $$
DECLARE
  rec RECORD;
  encrypted_pw text;
  user_email text;
BEGIN
  FOR rec IN SELECT * FROM public.usuarios LOOP
    user_email := trim(rec.dni) || '@admin.unsaac.pe';

    -- Solo migrar si el usuario no existe ya en auth.users
    IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = rec.id) THEN
      
      -- Encriptar la contraseña
      encrypted_pw := extensions.crypt(rec.password, extensions.gen_salt('bf'));

      -- Insertar en auth.users (manteniendo la misma ID!)
      INSERT INTO auth.users (
        instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
      ) VALUES (
        '00000000-0000-0000-0000-000000000000', rec.id, 'authenticated', 'authenticated', user_email, encrypted_pw, now(), '{"provider":"email","providers":["email"]}', '{}', rec.created_at, now()
      );

      -- Insertar en auth.identities
      INSERT INTO auth.identities (
        id, user_id, identity_data, provider, created_at, updated_at
      ) VALUES (
        rec.id, rec.id, format('{"sub":"%s","email":"%s"}', rec.id::text, user_email)::jsonb, 'email', rec.created_at, now()
      );
      
      RAISE NOTICE 'Migrado DNI: %', rec.dni;
    ELSE
      RAISE NOTICE 'Saltado DNI: % (ya en auth.users)', rec.dni;
    END IF;
  END LOOP;
END;
$$;
