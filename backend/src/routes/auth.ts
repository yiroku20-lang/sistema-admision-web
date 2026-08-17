import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import { db } from "../db/db.js";
import { usuarios } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { supabase } from "../config/index.js";
import { isOnline } from "../services/network.js";

const router = Router();

router.post("/login", async (req: Request, res: Response) => {
  const { email, password } = req.body;
  
  if (!email || !password) {
    return res.status(400).json({ error: "Email y password son requeridos" });
  }
  
  const online = isOnline();
  
  if (online) {
    try {
      console.log(`[Auth Service] Intentando login online para: ${email}`);
      // 1. Intentar iniciar sesion con Supabase Auth
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      });
      
      if (error) {
        return res.status(error.status || 401).json({ error: error.message });
      }
      
      const user = data.user;
      const session = data.session;
      
      if (user && session) {
        // Encriptar password localmente para caché offline
        const salt = bcrypt.genSaltSync(10);
        const hash = bcrypt.hashSync(password, salt);
        
        // Consultar el perfil real de la tabla public.usuarios de Supabase
        const { data: dbUser, error: dbUserErr } = await supabase
          .from("usuarios")
          .select("*")
          .eq("id", user.id)
          .maybeSingle();
          
        if (dbUserErr) {
          console.warn("[Auth Service] Advertencia al obtener perfil de usuarios en Supabase:", dbUserErr.message);
        }

        const name = dbUser?.name || user.user_metadata?.nombres || user.user_metadata?.name || user.email?.split("@")[0] || "Usuario";
        const role = dbUser?.role || user.user_metadata?.role || "Operador";
        const dniVal = dbUser?.dni || user.email?.split("@")[0] || "";
        
        // El campo permissions puede venir como array, lo guardamos como JSON stringificado
        const permissionsVal = dbUser?.permissions ? JSON.stringify(dbUser.permissions) : null;
        
        const localUserData = {
          id: user.id,
          dni: dniVal,
          name: name,
          role: role,
          passwordHash: hash,
          permissions: permissionsVal,
          createdAt: dbUser?.created_at || user.created_at || new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        
        // Guardar en base de datos local SQLite
        await db
          .insert(usuarios)
          .values(localUserData)
          .onConflictDoUpdate({
            target: usuarios.id,
            set: localUserData
          });
          
        console.log(`[Auth Service] Perfil de usuario '${name}' (DNI: ${dniVal}) guardado/actualizado en caché local.`);
      }
      
      return res.status(200).json(data);
    } catch (err: any) {
      console.error(`[Auth Service] Error en login online, se intentará offline fallback:`, err);
      // Continuar al bloque offline si ocurre algún fallo de red inesperado durante el login
    }
  }
  
  // LOGIN OFFLINE
  try {
    // Extraer el DNI del email (por ejemplo, "47773611@admin.unsaac.pe" -> "47773611")
    const dniFromEmail = email.includes("@") ? email.split("@")[0] : email;
    
    console.log(`[Auth Service] Conexión Offline. Intentando login local para DNI: ${dniFromEmail}`);
    
    // Buscar en caché local de SQLite por columna DNI
    const localUserResult = await db
      .select()
      .from(usuarios)
      .where(eq(usuarios.dni, dniFromEmail))
      .limit(1);
      
    if (localUserResult.length === 0) {
      return res.status(401).json({ 
        error: "Credenciales inválidas. (No hay caché local de este usuario, inicie sesión en línea primero)" 
      });
    }
    
    const localUser = localUserResult[0];
    
    // Validar contraseña
    const isPasswordMatch = bcrypt.compareSync(password, localUser.passwordHash);
    if (!isPasswordMatch) {
      return res.status(401).json({ error: "Credenciales locales incorrectas" });
    }
    
    // Simular una respuesta en formato Supabase Auth Session
    const mockSession = {
      user: {
        id: localUser.id,
        email: `${localUser.dni}@admin.unsaac.pe`,
        user_metadata: { 
          name: localUser.name, 
          role: localUser.role,
          nombres: localUser.name
        },
        role: "authenticated",
        created_at: localUser.createdAt
      },
      session: {
        access_token: `mock-local-jwt-${localUser.id}-${Date.now()}`,
        refresh_token: "mock-local-refresh-token",
        expires_in: 3600,
        token_type: "bearer",
        user: {
          id: localUser.id,
          email: `${localUser.dni}@admin.unsaac.pe`,
          user_metadata: {
            name: localUser.name,
            role: localUser.role,
            nombres: localUser.name
          }
        }
      }
    };
    
    console.log(`[Auth Service] Login Offline Exitoso para ${email}`);
    return res.status(200).json(mockSession);
  } catch (err: any) {
    console.error(`[Auth Service] Error en login offline:`, err);
    return res.status(500).json({ error: "Error en el servidor de autenticación local" });
  }
});

export default router;
