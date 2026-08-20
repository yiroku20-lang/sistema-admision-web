CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Eliminar la función existente primero
DROP FUNCTION IF EXISTS admin_create_user(text, text, text, text, jsonb);

-- Función para crear un usuario en supabase auth y public.usuarios
CREATE OR REPLACE FUNCTION admin_create_user(
  p_dni text,
  p_password text,
  p_name text,
  p_role text,
  p_permissions jsonb DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  new_user_id uuid;
  encrypted_pw text;
  user_email text;
BEGIN
  -- Verificar si el DNI ya existe en public.usuarios
  IF EXISTS (SELECT 1 FROM public.usuarios WHERE dni = p_dni) THEN
    RAISE EXCEPTION 'El usuario con DNI % ya existe', p_dni;
  END IF;

  user_email := p_dni || '@admin.unsaac.pe';

  -- Generar nueva ID de usuario
  new_user_id := gen_random_uuid();
  
  -- Encriptar la contraseña (usando el gen_salt explícito)
  encrypted_pw := extensions.crypt(p_password, extensions.gen_salt('bf'));

  -- Insertar en auth.users
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) VALUES (
    '00000000-0000-0000-0000-000000000000', new_user_id, 'authenticated', 'authenticated', user_email, encrypted_pw, now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()
  );

  -- Insertar en auth.identities
  INSERT INTO auth.identities (
    id, provider_id, user_id, identity_data, provider, created_at, updated_at
  ) VALUES (
    gen_random_uuid(), new_user_id::text, new_user_id, jsonb_build_object('sub', new_user_id, 'email', user_email), 'email', now(), now()
  );

  -- Insertar en public.usuarios (perfil)
  INSERT INTO public.usuarios (id, dni, password, name, role, permissions)
  VALUES (new_user_id, p_dni, p_password, p_name, p_role, p_permissions);

END;
$$;

-- Eliminar la función existente primero
DROP FUNCTION IF EXISTS admin_update_user_password(uuid, text);

-- Función para actualizar la contraseña de un usuario
CREATE OR REPLACE FUNCTION admin_update_user_password(
  p_user_id uuid,
  p_new_password text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  encrypted_pw text;
BEGIN
  -- Encriptar la nueva contraseña
  encrypted_pw := extensions.crypt(p_new_password, extensions.gen_salt('bf'));

  -- Actualizar en auth.users
  UPDATE auth.users
  SET encrypted_password = encrypted_pw,
      updated_at = now()
  WHERE id = p_user_id;

  -- Actualizar en public.usuarios 
  UPDATE public.usuarios
  SET password = p_new_password
  WHERE id = p_user_id;

END;
$$;
