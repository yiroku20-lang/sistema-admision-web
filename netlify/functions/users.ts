import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || "https://cnqpzyanmmwspvemcfeb.supabase.co";
const SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNucXB6eWFubW13c3B2ZW1jZmViIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTgxNTc0MywiZXhwIjoyMDg1MzkxNzQzfQ.ME18iloL44XbOeLo_TbK0CL3n_3jg-uVrr0VaTKZQDI";

const adminSupabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

export const handler = async (event: any) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    // 1. GET: List users
    if (event.httpMethod === 'GET') {
      const { data, error } = await adminSupabase
        .from('usuarios')
        .select('id, dni, name, role, permissions, created_at, password')
        .order('name', { ascending: true });

      if (error) throw error;
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(data || [])
      };
    }

    // 2. POST: Create user or update-password action
    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');

      if (body.action === 'update-password') {
        const { user_id, password } = body;
        if (!user_id || !password) {
          return { statusCode: 400, headers, body: JSON.stringify({ error: 'Faltan parámetros' }) };
        }
        await adminSupabase.auth.admin.updateUserById(user_id, { password });
        await adminSupabase.from('usuarios').update({ password }).eq('id', user_id);
        return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
      }

      // Create new user
      const { dni, password, name, role, permissions } = body;
      if (!dni || !password || !name || !role) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Faltan datos obligatorios' }) };
      }

      const email = `${dni}@admin.unsaac.pe`;
      const { data: authData, error: authError } = await adminSupabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true
      });

      if (authError) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: authError.message }) };
      }

      const userId = authData.user.id;
      const { error: dbError } = await adminSupabase.from('usuarios').insert([{
        id: userId,
        dni,
        password,
        name,
        role,
        permissions: permissions || null
      }]);

      if (dbError) {
        await adminSupabase.auth.admin.deleteUser(userId);
        return { statusCode: 400, headers, body: JSON.stringify({ error: dbError.message }) };
      }

      return { statusCode: 200, headers, body: JSON.stringify({ success: true, userId }) };
    }

    // 3. PUT: Update user
    if (event.httpMethod === 'PUT') {
      const { id, dni, name, role, permissions } = JSON.parse(event.body || '{}');
      if (!id || !dni || !name || !role) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Faltan datos obligatorios' }) };
      }

      const { error } = await adminSupabase.from('usuarios').update({
        dni: String(dni).trim(),
        name: String(name).trim(),
        role,
        permissions: role === 'Operador' ? permissions : null
      }).eq('id', id);

      if (error) throw error;
      return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
    }

    // 4. DELETE: Delete user
    if (event.httpMethod === 'DELETE') {
      const { id } = JSON.parse(event.body || '{}');
      if (!id) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'ID requerido' }) };
      }

      await adminSupabase.from('usuarios').delete().eq('id', id);
      try {
        await adminSupabase.auth.admin.deleteUser(id);
      } catch (e) {}

      return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
    }

    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Método no permitido' }) };
  } catch (err: any) {
    console.error('Users Netlify Function Error:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message || 'Error en servidor' })
    };
  }
};
