import { createClient } from '@supabase/supabase-js';
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://cnqpzyanmmwspvemcfeb.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNucXB6eWFubW13c3B2ZW1jZmViIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTgxNTc0MywiZXhwIjoyMDg1MzkxNzQzfQ.ME18iloL44XbOeLo_TbK0CL3n_3jg-uVrr0VaTKZQDI';
const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_KEY);

async function patch() {
  const funcStr = `
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;

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
SET search_path = public
AS $$
DECLARE
  new_user_id uuid;
  encrypted_pw text;
  user_email text;
BEGIN
  IF EXISTS (SELECT 1 FROM public.usuarios WHERE dni = p_dni) THEN
    RAISE EXCEPTION 'El usuario con DNI % ya existe', p_dni;
  END IF;

  user_email := p_dni || '@admin.unsaac.pe';
  new_user_id := gen_random_uuid();
  encrypted_pw := public.crypt(p_password, public.gen_salt('bf'));

  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) VALUES (
    '00000000-0000-0000-0000-000000000000', new_user_id, 'authenticated', 'authenticated', user_email, encrypted_pw, now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()
  );

  INSERT INTO auth.identities (
    id, user_id, identity_data, provider, created_at, updated_at
  ) VALUES (
    new_user_id, new_user_id, format('{"sub":"%s","email":"%s"}', new_user_id::text, user_email)::jsonb, 'email', now(), now()
  );

  INSERT INTO public.usuarios (id, dni, password, name, role, permissions)
  VALUES (new_user_id, p_dni, p_password, p_name, p_role, p_permissions);
END;
$$;
  `;
  
  // Note: we can't just send plain SQL to standard SDK unless it's an RPC.
  // We can't do arbitrary queries. 
  // Maybe we can create a temporary RPC to execute this?
}
patch();
