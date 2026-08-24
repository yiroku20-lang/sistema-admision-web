import { supabase } from './supabaseClient';
import { User } from '../types';

export interface AdminUserItem {
  id: string;
  dni: string;
  name: string;
  role: 'Administrador' | 'Director' | 'Operador';
  permissions?: string[] | null;
  created_at?: string;
  password?: string;
}

// 1. Fetch all users seamlessly across Electron, Express server, Netlify, and Supabase
export async function getAllUsers(): Promise<AdminUserItem[]> {
  // A. Check if running in Electron with IPC
  try {
    if (typeof window !== 'undefined' && (window as any).electronAPI?.getUsers) {
      const res = await (window as any).electronAPI.getUsers();
      if (res && res.success && Array.isArray(res.users)) {
        return res.users;
      }
    }
  } catch (e) {
    console.warn('[usersApi] Electron IPC getUsers failed:', e);
  }

  // B. Try Express Server Auth/Users endpoint
  try {
    const res = await fetch('/api/auth/users');
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        return data;
      }
      if (data && Array.isArray(data.users) && data.users.length > 0) {
        return data.users;
      }
    }
  } catch (e) {
    // try fallback
  }

  // C. Try alternate server route /api/users
  try {
    const res = await fetch('/api/users');
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        return data;
      }
    }
  } catch (e) {
    // try fallback
  }

  // D. Try Netlify function
  try {
    const res = await fetch('/.netlify/functions/users');
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        return data;
      }
    }
  } catch (e) {
    // try fallback
  }

  // E. Fallback to Supabase direct client
  try {
    const { data, error } = await supabase
      .from('usuarios')
      .select('*')
      .order('name', { ascending: true });
    if (!error && Array.isArray(data)) {
      return data as AdminUserItem[];
    }
  } catch (e) {
    console.error('[usersApi] Supabase client fetch error:', e);
  }

  return [];
}

// 2. Create User
export async function createAdminUser(userData: {
  dni: string;
  password: string;
  name: string;
  role: 'Administrador' | 'Director' | 'Operador';
  permissions?: string[] | null;
}): Promise<{ success: boolean; error?: string; userId?: string }> {
  // A. Electron IPC
  try {
    if (typeof window !== 'undefined' && (window as any).electronAPI?.createUser) {
      const res = await (window as any).electronAPI.createUser(userData);
      if (res) return res;
    }
  } catch (e: any) {
    console.warn('[usersApi] Electron IPC createUser error:', e);
  }

  // B. Server API
  try {
    const res = await fetch('/api/create-user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(userData),
    });
    const result = await res.json();
    if (res.ok) {
      return { success: true, userId: result.userId };
    } else {
      return { success: false, error: result.error || 'Error al crear usuario.' };
    }
  } catch (e: any) {
    // C. Netlify function fallback
    try {
      const res = await fetch('/.netlify/functions/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(userData),
      });
      const result = await res.json();
      if (res.ok) return { success: true, userId: result.userId };
      return { success: false, error: result.error || 'Error al crear usuario en Netlify.' };
    } catch (netErr: any) {
      return { success: false, error: e.message || 'Error de conexión al crear usuario.' };
    }
  }
}

// 3. Update User Profile
export async function updateAdminUser(
  id: string,
  userData: {
    dni: string;
    name: string;
    role: 'Administrador' | 'Director' | 'Operador';
    permissions?: string[] | null;
  }
): Promise<{ success: boolean; error?: string }> {
  // A. Electron IPC
  try {
    if (typeof window !== 'undefined' && (window as any).electronAPI?.updateUser) {
      const res = await (window as any).electronAPI.updateUser(id, userData);
      if (res) return res;
    }
  } catch (e: any) {
    console.warn('[usersApi] Electron IPC updateUser error:', e);
  }

  // B. Server API
  try {
    const res = await fetch('/api/update-user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...userData }),
    });
    const result = await res.json();
    if (res.ok) {
      return { success: true };
    }
  } catch (e) {
    // try next
  }

  // C. Netlify function
  try {
    const res = await fetch('/.netlify/functions/users', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...userData }),
    });
    const result = await res.json();
    if (res.ok) return { success: true };
  } catch (e) {
    // try direct supabase
  }

  // D. Supabase direct
  try {
    const { error } = await supabase
      .from('usuarios')
      .update(userData)
      .eq('id', id);
    if (error) throw error;
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Error al actualizar perfil de usuario.' };
  }
}

// 4. Delete User
export async function deleteAdminUser(id: string): Promise<{ success: boolean; error?: string }> {
  // A. Electron IPC
  try {
    if (typeof window !== 'undefined' && (window as any).electronAPI?.deleteUser) {
      const res = await (window as any).electronAPI.deleteUser(id);
      if (res) return res;
    }
  } catch (e: any) {
    console.warn('[usersApi] Electron IPC deleteUser error:', e);
  }

  // B. Server API
  try {
    const res = await fetch('/api/delete-user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    const result = await res.json();
    if (res.ok) return { success: true };
  } catch (e) {
    // try netlify
  }

  // C. Netlify function
  try {
    const res = await fetch('/.netlify/functions/users', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    const result = await res.json();
    if (res.ok) return { success: true };
  } catch (e) {
    // try direct supabase
  }

  // D. Supabase direct
  try {
    const { error } = await supabase
      .from('usuarios')
      .delete()
      .eq('id', id);
    if (error) throw error;
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Error al eliminar usuario.' };
  }
}

// 5. Update Password
export async function updateAdminUserPassword(
  userId: string,
  newPassword: string
): Promise<{ success: boolean; error?: string }> {
  // A. Electron IPC
  try {
    if (typeof window !== 'undefined' && (window as any).electronAPI?.updateUserPassword) {
      const res = await (window as any).electronAPI.updateUserPassword(userId, newPassword);
      if (res) return res;
    }
  } catch (e: any) {
    console.warn('[usersApi] Electron IPC updateUserPassword error:', e);
  }

  // B. Server API
  try {
    const res = await fetch('/api/update-user-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId, password: newPassword.trim() }),
    });
    const result = await res.json();
    if (res.ok) return { success: true };
    return { success: false, error: result.error || 'Error al actualizar contraseña.' };
  } catch (e: any) {
    // C. Netlify function
    try {
      const res = await fetch('/.netlify/functions/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update-password', user_id: userId, password: newPassword.trim() }),
      });
      const result = await res.json();
      if (res.ok) return { success: true };
      return { success: false, error: result.error || 'Error al actualizar contraseña en Netlify.' };
    } catch (netErr: any) {
      return { success: false, error: e.message || 'Error de conexión al actualizar contraseña.' };
    }
  }
}
