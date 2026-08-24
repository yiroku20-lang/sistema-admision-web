
import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { User } from '../types';
import { DataImport } from '../components/DataImport';
import { DEFAULT_OFFICIAL_TEMPLATES } from '../lib/defaultTemplates';
import {
  getAllUsers,
  createAdminUser,
  updateAdminUser,
  deleteAdminUser,
  updateAdminUserPassword,
  AdminUserItem,
} from '../lib/usersApi';

export const Settings: React.FC<{ user: User, notify?: (msg: string, type?: 'success'|'error'|'warning') => void }> = ({ user, notify }) => {
  const [users, setUsers] = useState<AdminUserItem[]>([]);
  const [userSearch, setUserSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [dbError, setDbError] = useState<string | null>(null);

  // Form State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [dni, setDni] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'Administrador' | 'Director' | 'Operador'>('Operador');
  const [permissions, setPermissions] = useState<string[]>([]);

  // Available Permissions
  const availablePermissions = [
    { id: 'view_expedientes', label: 'Expedientes (Entrantes/Salida)' },
    { id: 'manage_sorteo_asistencia', label: 'Personal Sorteado: Reportes y Regularización' },
    { id: 'view_transferencias', label: 'Transferencias y Devoluciones' },
    { id: 'view_renuncias', label: 'Trámite de Renuncias' },
    { id: 'view_reserva', label: 'Reserva de Vacantes' },
    { id: 'view_cuadro_vacantes', label: 'Cuadro de Vacantes' },
    { id: 'view_busqueda', label: 'Búsqueda de Estudiante' },
    { id: 'view_orientacion', label: 'Marketing y Prospectos' },
    { id: 'view_plantillas', label: 'Gestión de Plantillas' },
    { id: 'view_resoluciones', label: 'Resoluciones' },
    { id: 'view_actas', label: 'Actas de Sesión' },
    { id: 'view_asistencia', label: 'Control de Asistencia' },
    { id: 'view_prestamos', label: 'Préstamo de Bienes' },
    { id: 'view_agenda', label: 'Agenda de Eventos' },
    { id: 'view_auditoria', label: 'Auditoría y Logs' },
    { id: 'view_adjudicaciones', label: 'Adjudicaciones' },
    { id: 'view_vacancy_evolution', label: 'Evolución de Vacantes' },
    { id: 'view_pre_review', label: 'Pre-revisión de Postulantes' },
    { id: 'view_presupuesto', label: 'Presupuesto de Examen' },
    { id: 'upload_csv', label: 'Cargar Archivos CSV / Padrones' },
    { id: 'view_personal', label: 'Gestión de Personal' },
    { id: 'view_reporte_ingresantes', label: 'Reporte Oficial de Ingresantes' }
  ];

  // Own Password State
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  useEffect(() => {
    if (user.role === 'Administrador') {
      fetchUsers();
    }
  }, [user.role]);

  const handleChangeOwnPassword = async () => {
    if (!newPassword || !confirmPassword) {
      notify?.('Por favor complete ambos campos.', 'warning');
      return;
    }
    if (newPassword !== confirmPassword) {
      notify?.('Las contraseñas no coinciden.', 'error');
      return;
    }
    setIsChangingPassword(true);
    try {
      const res = await updateAdminUserPassword(user.id, newPassword.trim());
      if (!res.success) {
        throw new Error(res.error || 'Error al actualizar contraseña.');
      }

      notify?.('Contraseña actualizada exitosamente.', 'success');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      notify?.(`Error al cambiar contraseña: ${err.message}`, 'error');
    } finally {
      setIsChangingPassword(false);
    }
  };

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const data = await getAllUsers();
      setUsers(data || []);
    } catch (err: any) {
      console.error('Error fetching users:', err);
      notify?.(`Error al cargar usuarios: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveUser = async () => {
    if (!dni || !name || (!editingId && !password)) {
      notify?.('Por favor complete todos los campos obligatorios.', 'warning');
      return;
    }

    setIsSubmitting(true);
    setDbError(null);
    try {
      if (editingId) {
        // Update user profile
        const updateRes = await updateAdminUser(editingId, {
          dni: dni.trim(),
          name: name.trim(),
          role: role,
          permissions: role === 'Operador' ? permissions : null
        });

        if (!updateRes.success) {
          throw new Error(updateRes.error || 'Error al actualizar usuario.');
        }

        // If password was provided, update it via our secure API
        if (password) {
          const pwRes = await updateAdminUserPassword(editingId, password.trim());
          if (!pwRes.success) {
            throw new Error(pwRes.error || 'Error al actualizar contraseña.');
          }
        }
      } else {
        // Create new user using secure API
        const createRes = await createAdminUser({
          dni: dni.trim(),
          password: password.trim(),
          name: name.trim(),
          role,
          permissions: role === 'Operador' ? permissions : null
        });

        if (!createRes.success) {
          throw new Error(createRes.error || 'Error al crear usuario.');
        }
      }

      setIsModalOpen(false);
      resetForm();
      fetchUsers();
      notify?.('Usuario guardado exitosamente.', 'success');
    } catch (err: any) {
      if (err.message?.includes('permissions') || err.code === 'PGRST204') {
        setDbError('La columna "permissions" no existe en la tabla "usuarios". Por favor, actualiza la base de datos usando el script SQL en la pestaña "Base de Datos".');
        notify?.('Error de base de datos. Revisa el mensaje arriba.', 'error');
      } else {
        notify?.(`Error al guardar usuario: ${err.message}`, 'error');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const runMigration = async (sqlText: string) => {
    if (!window.confirm('¿Ejecutar este script en el servidor?')) return;
    setIsRestoring(true);
    try {
      const { error } = await supabase.rpc('execute_sql', { sql_query: sqlText });
      
      if (error) {
        if (error.message.includes('No function matches') || error.message.includes('execute_sql does not exist')) {
          notify?.('No se puede ejecutar desde aquí porque Supabase no tiene la función RPC "execute_sql" habilitada por razones de seguridad. Usa el botón "Copiar" y pégalo en el SQL Editor de Supabase (https://supabase.com/dashboard).', 'error');
        } else {
          throw error;
        }
      } else {
        notify?.('Script ejecutado con éxito.', 'success');
      }
    } catch (err: any) {
      console.error(err);
      notify?.('Debes ejecutar el script manualmente en Supabase: ' + err.message, 'error');
    } finally {
      setIsRestoring(false);
    }
  };

  const handleRestoreTemplates = async () => {
    if (!window.confirm('Esto intentará restaurar las plantillas base en la base de datos. ¿Desea continuar?')) return;
    
    setIsRestoring(true);
    try {
      // 1. Check if table exists by trying a simple select
      const { error: checkError } = await supabase.from('templates').select('id').limit(1);
      
      if (checkError && checkError.code === 'PGRST204') {
        throw new Error("La tabla 'templates' no existe. Por favor, ejecute primero el script SQL en el panel de Supabase para crear la tabla.");
      }

      const baseTemplates = DEFAULT_OFFICIAL_TEMPLATES.map(t => ({
        name: t.name,
        description: t.description,
        category: t.category,
        thumbnail: t.thumbnail,
        content: t.content,
        last_modified: new Date().toLocaleDateString()
      }));

      const { error } = await supabase.from('templates').insert(baseTemplates);
      if (error) throw error;

      notify?.('Plantillas restauradas exitosamente.', 'success');
    } catch (err: any) {
      notify?.(`Error: ${err.message}`, 'error');
    } finally {
      setIsRestoring(false);
    }
  };

  const handleDeleteUser = async (id: string) => {
    if (!window.confirm('¿Está seguro de eliminar este usuario?')) return;
    try {
      const res = await deleteAdminUser(id);
      if (!res.success) {
        throw new Error(res.error || 'Error al eliminar usuario');
      }
      fetchUsers();
      notify?.('Usuario eliminado exitosamente.', 'success');
    } catch (err: any) {
      notify?.(`Error al eliminar: ${err.message}`, 'error');
    }
  };

  const openEdit = (user: any) => {
    setEditingId(user.id);
    setDni(user.dni);
    setName(user.name);
    setRole(user.role);
    setPermissions(user.permissions || []);
    setPassword(''); // Don't show password
    setIsModalOpen(true);
  };

  const resetForm = () => {
    setEditingId(null);
    setDni('');
    setName('');
    setPassword('');
    setRole('Operador');
    setPermissions([]);
  };

  const sqlActas = `
-- ACTAS DE SESIONES
CREATE TABLE IF NOT EXISTS public.actas_sesiones (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamp with time zone DEFAULT now(),
  numero text,
  fecha date NOT NULL,
  titulo text NOT NULL,
  tipo_sesion text NOT NULL,
  estado text DEFAULT 'Borrador',
  contenido_bruto text,
  contenido_refinado text,
  archivo_pdf text,
  firmantes jsonb DEFAULT '[]'::jsonb,
  created_by uuid REFERENCES auth.users(id)
);

ALTER TABLE public.actas_sesiones ADD COLUMN IF NOT EXISTS archivo_pdf text;

NOTIFY pgrst, 'reload schema';

ALTER TABLE public.actas_sesiones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Permitir select actas" ON public.actas_sesiones;
CREATE POLICY "Permitir select actas" ON public.actas_sesiones FOR SELECT USING (true);
DROP POLICY IF EXISTS "Permitir insert actas" ON public.actas_sesiones;
CREATE POLICY "Permitir insert actas" ON public.actas_sesiones FOR INSERT WITH CHECK (auth.role() = 'authenticated');
DROP POLICY IF EXISTS "Permitir update actas" ON public.actas_sesiones;
CREATE POLICY "Permitir update actas" ON public.actas_sesiones FOR UPDATE USING (auth.role() = 'authenticated');

-- Storage Bucket para actas
INSERT INTO storage.buckets (id, name, public) VALUES ('documentos', 'documentos', true) ON CONFLICT (id) DO NOTHING;
DROP POLICY IF EXISTS "Permitir leer documentos" ON storage.objects;
CREATE POLICY "Permitir leer documentos" ON storage.objects FOR SELECT USING ( bucket_id = 'documentos' );
DROP POLICY IF EXISTS "Permitir subir documentos" ON storage.objects;
CREATE POLICY "Permitir subir documentos" ON storage.objects FOR INSERT WITH CHECK ( bucket_id = 'documentos' AND auth.role() = 'authenticated' );
DROP POLICY IF EXISTS "Permitir actualizar documentos" ON storage.objects;
CREATE POLICY "Permitir actualizar documentos" ON storage.objects FOR UPDATE USING ( bucket_id = 'documentos' AND auth.role() = 'authenticated' );
`.trim();

  const sqlUsers = `
-- TABLA DE USUARIOS Y ACCESO
CREATE TABLE IF NOT EXISTS public.usuarios (
  id uuid REFERENCES auth.users(id) PRIMARY KEY,
  created_at timestamp with time zone DEFAULT now(),
  dni text UNIQUE NOT NULL,
  password text NOT NULL, -- TODO: deprecate once we confirm all users are properly migrated
  name text NOT NULL,
  role text NOT NULL DEFAULT 'Operador', -- Administrador, Director, Operador
  permissions jsonb -- Array de permisos para Operadores
);

-- Habilitar RLS
ALTER TABLE public.usuarios ENABLE ROW LEVEL SECURITY;
-- Permitir lectura pública temporalmente para no romper el login de otras apps
DROP POLICY IF EXISTS "Acceso lectura usuarios" ON public.usuarios;
CREATE POLICY "Acceso lectura usuarios" ON public.usuarios FOR SELECT USING (true);

-- Aquí irían políticas más estrictas para INSERT/UPDATE/DELETE (e.g. solo Admin)
-- Por ahora la aplicación usa la DB con el service role en varios lados o dejamos esto:
DROP POLICY IF EXISTS "Resto acceso usuarios admin" ON public.usuarios;
CREATE POLICY "Resto acceso usuarios admin" ON public.usuarios FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');

-- TABLA DE ASISTENCIA
CREATE TABLE IF NOT EXISTS public.asistencia (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamp with time zone DEFAULT now(),
  user_id uuid REFERENCES public.usuarios(id) ON DELETE CASCADE,
  dni text NOT NULL,
  tipo text NOT NULL, -- INGRESO, SALIDA
  fecha date NOT NULL DEFAULT CURRENT_DATE,
  hora time NOT NULL DEFAULT CURRENT_TIME,
  timestamp timestamp with time zone DEFAULT now()
);

ALTER TABLE public.asistencia ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Acceso lectura asistencia" ON public.asistencia;
DROP POLICY IF EXISTS "Acceso total asistencia" ON public.asistencia;
CREATE POLICY "Acceso total asistencia" ON public.asistencia FOR ALL USING (true) WITH CHECK (true);
  `.trim();

  const sqlTemplates = `
-- TABLA DE PLANTILLAS (RECREAR)
CREATE TABLE IF NOT EXISTS public.templates (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamp with time zone DEFAULT now(),
  name text NOT NULL,
  description text,
  category text DEFAULT 'Varios',
  thumbnail text,
  content text NOT NULL,
  last_modified text
);

-- Habilitar RLS
ALTER TABLE public.templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Acceso total plantillas" ON public.templates;
CREATE POLICY "Acceso total plantillas" ON public.templates FOR ALL USING (true) WITH CHECK (true);

-- TABLA DE PROSPECTOS VOCACIONALES
CREATE TABLE IF NOT EXISTS public.prospectos_vocacionales (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre text NOT NULL,
  dni text NOT NULL,
  correo text NOT NULL,
  celular text,
  colegio_procedencia text,
  carrera_interes text,
  area_interes text,
  modalidades_interes text[] DEFAULT '{}'::text[],
  region text,
  estado_contacto text DEFAULT 'Pendiente',
  fecha_registro timestamp with time zone DEFAULT now(),
  suscrito boolean DEFAULT true,
  resultados_test jsonb DEFAULT '[]'::jsonb
);
ALTER TABLE public.prospectos_vocacionales ENABLE ROW LEVEL SECURITY;
-- Mantenemos prospectos abiertos para leer y escribir, pero restringimos el borrado a autenticados
DROP POLICY IF EXISTS "Acceso total prospectos_vocacionales" ON public.prospectos_vocacionales;
DROP POLICY IF EXISTS "Permitir SELECT prospectos_vocacionales" ON public.prospectos_vocacionales;
DROP POLICY IF EXISTS "Permitir INSERT prospectos_vocacionales" ON public.prospectos_vocacionales;
DROP POLICY IF EXISTS "Permitir UPDATE prospectos_vocacionales" ON public.prospectos_vocacionales;
DROP POLICY IF EXISTS "Permitir DELETE prospectos_vocacionales" ON public.prospectos_vocacionales;

CREATE POLICY "Permitir SELECT prospectos_vocacionales" ON public.prospectos_vocacionales FOR SELECT USING (true);
CREATE POLICY "Permitir INSERT prospectos_vocacionales" ON public.prospectos_vocacionales FOR INSERT WITH CHECK (true);
CREATE POLICY "Permitir UPDATE prospectos_vocacionales" ON public.prospectos_vocacionales FOR UPDATE USING (true);
CREATE POLICY "Permitir DELETE prospectos_vocacionales" ON public.prospectos_vocacionales FOR DELETE USING (auth.role() = 'authenticated');


-- INSERTAR PLANTILLAS BASE
INSERT INTO public.templates (name, description, category, content, thumbnail)
VALUES 
('CONSTANCIA DE INGRESO', 'Plantilla oficial con barra lateral roja y marca de agua.', 'Certificados', '
<div style="width: 100%; height: 100%; border: 1px solid #ccc; display: flex; font-family: ''Poppins'', sans-serif; background: white; position: relative; box-sizing: border-box; overflow: hidden;">
    <div style="width: 45px; background: #7b1523; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
        <div style="transform: rotate(-90deg); white-space: nowrap; font-weight: 900; font-size: 16px; letter-spacing: 4px; text-transform: uppercase; color: #ffffff;">CONSTANCIA OFICIAL</div>
    </div>
    <div style="flex: 1; padding: 30px 35px; position: relative; display: flex; flex-direction: column;">
        <div style="position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; pointer-events: none; z-index: 0; opacity: 0.08;">
             <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/b/b8/Coat_of_arms_of_Cusco.svg/600px-Coat_of_arms_of_Cusco.svg.png" style="width: 70%; height: auto; filter: grayscale(100%);" />
        </div>
        <div style="position: relative; z-index: 1; text-align: center; margin-bottom: 20px;">
            <h2 style="font-family: ''Cinzel'', serif; font-size: 22px; font-weight: 700; margin: 0; color: #7b1523;">UNIVERSIDAD NACIONAL DE SAN ANTONIO<br>ABAD DEL CUSCO</h2>
            <div style="width: 50px; height: 3px; background: #e8a134; margin: 8px auto;"></div>
            <h3 style="font-size: 14px; font-weight: 600; color: #333; letter-spacing: 2px;">DIRECCIÓN DE ADMISIÓN</h3>
        </div>
        <div style="position: relative; z-index: 1; flex: 1; font-size: 12px; line-height: 1.5; color: #333;">
             <p>El Director de la Dirección de Admisión, que suscribe hace constar:</p>
             <div style="border-top: 2px solid #7b1523; border-bottom: 2px solid #7b1523; padding: 15px 0; margin: 20px 0;">
                <p>Que, Don(ña): <b>{{nombres}}</b>, INGRESÓ a la UNSAAC, a la Escuela de: <b>{{escuela}}</b> el {{fecha_ingreso}}, modalidad {{modalidad}}.</p>
                <table style="width: 100%; margin-top: 10px;">
                    <tr><td>● Código</td><td>: {{codigo}}</td></tr>
                    <tr><td>● Puntaje</td><td>: {{nota}}</td></tr>
                    <tr><td>● Orden</td><td>: {{omerito}}</td></tr>
                </table>
             </div>
             <p>Cusco, {{fecha_actual}}</p>
        </div>
        <div style="display: flex; justify-content: space-between; border-top: 2px solid #7b1523; padding-top: 10px; font-size: 8px;">
            <span>Recibo: {{BOUCHER}}</span>
            <span>Exp: {{EXP}}</span>
        </div>
    </div>
</div>', 'https://placehold.co/400x500/7b1523/ffffff?text=CONSTANCIA'),
('INFORME DE RECTIFICACIÓN', 'Informe técnico para corrección de datos en el sistema.', 'Admisión', '
<div style="width: 100%; height: 100%; position: relative; font-family: ''Arial'', sans-serif; color: #333; font-size: 14px; line-height: 1.5; box-sizing: border-box; overflow: hidden;">
    <!-- Background shapes -->
    <div style="position: absolute; top: -25mm; right: -25mm; width: 250px; height: 250px; background: #7b1523; border-bottom-left-radius: 100%; z-index: 0;"></div>
    <div style="position: absolute; bottom: -25mm; left: -25mm; width: 0; height: 0; border-bottom: 300px solid #7b1523; border-right: 200px solid transparent; z-index: 0;"></div>

    <!-- Content -->
    <div style="position: relative; z-index: 1; height: 100%; display: flex; flex-direction: column;">
        <!-- Header -->
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 40px;">
            <div style="display: flex; align-items: center; gap: 15px;">
                <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/b/b8/Coat_of_arms_of_Cusco.svg/600px-Coat_of_arms_of_Cusco.svg.png" style="height: 60px;" />
                <div>
                    <h2 style="margin: 0; font-size: 18px; color: #7b1523; font-family: ''Times New Roman'', serif;">UNSAAC</h2>
                    <p style="margin: 0; font-size: 10px; color: #555;">Universidad Nacional de<br>San Antonio Abad del Cusco</p>
                </div>
            </div>
            <!-- DA Logo placeholder -->
            <div style="color: white; text-align: center; margin-top: 10px; margin-right: 20px;">
                <div style="font-size: 24px; font-weight: bold; font-family: ''Times New Roman'', serif;">DA</div>
                <div style="font-size: 8px; letter-spacing: 1px;">DIRECCIÓN<br>DE ADMISIÓN</div>
            </div>
        </div>

        <!-- Title -->
        <div style="text-align: center; margin-bottom: 30px;">
            <h3 style="margin: 0; font-size: 16px; text-decoration: underline;">{{INFORME}}-DA-UNSAAC</h3>
        </div>

        <!-- Metadata -->
        <table style="width: 100%; margin-bottom: 30px; font-size: 14px; border: none;">
            <tr>
                <td style="width: 80px; vertical-align: top; font-weight: bold;">DE</td>
                <td style="width: 20px; vertical-align: top;">:</td>
                <td style="vertical-align: top;">
                    <b>DR. DOMINGO GONZALES GALLEGOS.</b><br>
                    <span style="font-size: 12px; color: #555;">Director de la Dirección de Admisión.</span>
                </td>
            </tr>
            <tr><td colspan="3" style="height: 10px;"></td></tr>
            <tr>
                <td style="vertical-align: top; font-weight: bold;">A</td>
                <td style="vertical-align: top;">:</td>
                <td style="vertical-align: top;">
                    <b>ING. AGUEDO HUAMANI HUAYHUA</b><br>
                    <span style="font-size: 12px; color: #555;">Jefe de la unidad de Centro de Cómputo de la UNSAAC</span>
                </td>
            </tr>
            <tr><td colspan="3" style="height: 10px;"></td></tr>
            <tr>
                <td style="font-weight: bold;">REF</td>
                <td>:</td>
                <td>Exp {{EXP}}</td>
            </tr>
            <tr><td colspan="3" style="height: 10px;"></td></tr>
            <tr>
                <td style="font-weight: bold;">ASUNTO</td>
                <td>:</td>
                <td>SOLICITA RECTIFICACIÓN DE DATOS</td>
            </tr>
            <tr><td colspan="3" style="height: 10px;"></td></tr>
            <tr>
                <td style="font-weight: bold;">FECHA</td>
                <td>:</td>
                <td>Cusco, {{fecha_actual}}</td>
            </tr>
        </table>

        <!-- Body -->
        <div style="text-align: justify; margin-bottom: 20px;">
            <p style="margin-bottom: 15px;">Por medio del presente, la Dirección de Admisión tiene a bien presentar a su consideración el informe de rectificación de datos personales del estudiante <b>{{nombres}} {{apellidos}}</b>, identificado con código N° <b>{{codigo}}</b>.</p>
            <p style="margin-bottom: 15px;">El estudiante antes mencionado solicita la rectificación de: <b>{{MOTIVO}}</b> en la base de datos de Centro de Computo.</p>
            <p style="margin-bottom: 20px;">Según los registros de la Dirección de Admisión, el(la) estudiante ingresó a la Escuela Profesional de <b>{{escuela}}</b> en la modalidad <b>{{modalidad}}</b> bajo el nombre de <b>{{nombres}} {{apellidos}}</b>. Tal como consta en los documentos que obran en esta Dependencia, por lo que se solicita la actualización de los registros académicos con los siguientes datos:</p>
        </div>

        <!-- Table -->
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
            <tr>
                <td style="border: 1px solid #000; padding: 8px 15px; width: 30%; font-weight: bold;">Dice</td>
                <td style="border: 1px solid #000; padding: 8px 15px;">{{nombres}} {{apellidos}}</td>
            </tr>
            <tr>
                <td style="border: 1px solid #000; padding: 8px 15px; font-weight: bold;">Debe decir</td>
                <td style="border: 1px solid #000; padding: 8px 15px;">{{NOMBRECORRE}}</td>
            </tr>
        </table>

        <!-- Closing -->
        <div style="margin-bottom: 40px;">
            <p style="margin-bottom: 15px;">Se adjunta recibo de pago N° {{BOUCHER}} y una copia del DNI del estudiante.</p>
            <p>Es cuanto informo a usted, para su conocimiento y fines consiguientes</p>
            <p style="text-align: center; margin-top: 20px;">Atentamente,</p>
        </div>

        <!-- Footer -->
        <div style="margin-top: auto; display: flex; justify-content: space-between; align-items: flex-end;">
            <div style="font-size: 10px; color: #555;">
                <p style="margin: 0;">DA/JACC</p>
                <p style="margin: 0;">c.c.</p>
                <p style="margin: 0;">Archivo.</p>
            </div>
            <div style="text-align: center; width: 250px;">
                <div style="border-top: 1px dashed #000; padding-top: 5px;">
                    <p style="margin: 0; font-weight: bold; font-size: 12px;">Dr. Domingo Gonzales Gallegos</p>
                    <p style="margin: 0; font-size: 10px;">DIRECTOR DE LA DIRECCIÓN DE ADMISIÓN</p>
                </div>
            </div>
        </div>
    </div>
</div>', 'https://placehold.co/400x500/1e293b/ffffff?text=INFORME');
  `.trim();

  if (user.role !== 'Administrador') {
    return (
      <div className="flex flex-col gap-6 max-w-[800px] mx-auto w-full p-6 md:p-8 overflow-y-auto pb-20">
        <div className="flex flex-col gap-2 border-b border-slate-200 pb-6">
          <h1 className="text-slate-900 text-3xl font-black leading-tight">Configuración de Cuenta</h1>
          <p className="text-slate-500 text-base font-normal">Actualice su información de acceso.</p>
        </div>
        
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8">
          <h3 className="font-bold text-slate-900 mb-6 text-lg">Cambiar Contraseña</h3>
          <div className="flex flex-col gap-4 max-w-md">
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-black text-slate-500 uppercase ml-2">Nueva Contraseña</label>
              <input 
                type="password"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                className="h-12 px-4 rounded-xl border-2 border-slate-100 bg-slate-50 focus:border-primary focus:bg-white outline-none font-bold text-slate-700 transition-all"
                placeholder="••••••••"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-black text-slate-500 uppercase ml-2">Confirmar Contraseña</label>
              <input 
                type="password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                className="h-12 px-4 rounded-xl border-2 border-slate-100 bg-slate-50 focus:border-primary focus:bg-white outline-none font-bold text-slate-700 transition-all"
                placeholder="••••••••"
              />
            </div>
            <button 
              onClick={handleChangeOwnPassword}
              disabled={isChangingPassword}
              className="mt-4 h-12 bg-primary text-white rounded-xl text-xs font-black uppercase shadow-xl shadow-primary/20 hover:bg-merlot active:scale-95 transition-all flex items-center justify-center gap-2"
            >
              {isChangingPassword ? <span className="material-symbols-outlined animate-spin text-sm">progress_activity</span> : <span className="material-symbols-outlined text-sm">lock_reset</span>}
              {isChangingPassword ? 'ACTUALIZANDO...' : 'ACTUALIZAR CONTRASEÑA'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 max-w-[1200px] mx-auto w-full p-6 md:p-8 overflow-y-auto pb-20">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-slate-900 text-3xl font-black leading-tight">Control de Usuarios y Seguridad</h1>
          <p className="text-slate-500 text-base font-normal">Administre el acceso, roles y permisos de la plataforma.</p>
        </div>
        <button 
          onClick={() => { resetForm(); setIsModalOpen(true); }}
          className="flex items-center gap-2 bg-primary text-white h-11 px-6 rounded-xl font-bold shadow-lg shadow-primary/20 active:scale-95 transition-all"
        >
          <span className="material-symbols-outlined">person_add</span>
          Nuevo Usuario
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* User List */}
        <div className="lg:col-span-2 flex flex-col gap-4">
          {/* Search & Actions Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex items-center gap-2 flex-1 min-w-[220px] bg-slate-50 px-3 py-2 rounded-xl border border-slate-200">
              <span className="material-symbols-outlined text-slate-400 text-lg">search</span>
              <input
                type="text"
                value={userSearch}
                onChange={e => setUserSearch(e.target.value)}
                placeholder="Buscar por nombre o DNI..."
                className="bg-transparent text-xs text-slate-700 placeholder-slate-400 outline-none w-full font-medium"
              />
              {userSearch && (
                <button onClick={() => setUserSearch('')} className="text-slate-400 hover:text-slate-600">
                  <span className="material-symbols-outlined text-sm">close</span>
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold text-slate-500 bg-slate-100 px-2.5 py-1.5 rounded-lg">
                {users.length} {users.length === 1 ? 'usuario' : 'usuarios'}
              </span>
              <button
                onClick={fetchUsers}
                disabled={loading}
                title="Recargar lista"
                className="p-2 text-slate-500 hover:text-primary hover:bg-slate-50 rounded-xl transition-all border border-slate-200"
              >
                <span className={`material-symbols-outlined text-base ${loading ? 'animate-spin' : ''}`}>refresh</span>
              </button>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-6 py-4 text-[10px] font-black uppercase text-slate-500">Usuario / DNI</th>
                  <th className="px-6 py-4 text-[10px] font-black uppercase text-slate-500">Rol / Permisos</th>
                  <th className="px-6 py-4 text-[10px] font-black uppercase text-slate-500 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={3} className="px-6 py-12 text-center">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <span className="material-symbols-outlined animate-spin text-primary text-3xl">progress_activity</span>
                        <span className="text-xs text-slate-400 font-medium">Cargando usuarios...</span>
                      </div>
                    </td>
                  </tr>
                ) : users.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-6 py-12 text-center text-slate-400 text-sm">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <span className="material-symbols-outlined text-slate-300 text-4xl">group_off</span>
                        <span>No hay usuarios registrados.</span>
                        <button 
                          onClick={() => { resetForm(); setIsModalOpen(true); }}
                          className="mt-2 text-xs text-primary font-bold hover:underline"
                        >
                          Crear primer usuario
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : users.filter(u => {
                  if (!userSearch.trim()) return true;
                  const query = userSearch.toLowerCase().trim();
                  return (
                    (u.name && u.name.toLowerCase().includes(query)) ||
                    (u.dni && u.dni.toLowerCase().includes(query)) ||
                    (u.role && u.role.toLowerCase().includes(query))
                  );
                }).length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-6 py-8 text-center text-slate-400 text-xs">
                      No se encontraron usuarios que coincidan con "{userSearch}".
                    </td>
                  </tr>
                ) : users
                    .filter(u => {
                      if (!userSearch.trim()) return true;
                      const query = userSearch.toLowerCase().trim();
                      return (
                        (u.name && u.name.toLowerCase().includes(query)) ||
                        (u.dni && u.dni.toLowerCase().includes(query)) ||
                        (u.role && u.role.toLowerCase().includes(query))
                      );
                    })
                    .map(u => (
                  <tr key={u.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="font-bold text-slate-900 text-sm">{u.name}</span>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[11px] font-mono font-medium text-slate-500">DNI: {u.dni}</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-1 items-start">
                        <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest ${
                          u.role === 'Administrador' ? 'bg-red-100 text-red-700 border border-red-200' :
                          u.role === 'Director' ? 'bg-blue-100 text-blue-700 border border-blue-200' :
                          'bg-slate-100 text-slate-700 border border-slate-200'
                        }`}>
                          {u.role}
                        </span>
                        {u.role === 'Operador' && Array.isArray(u.permissions) && (
                          <span className="text-[10px] text-slate-400 font-medium">
                            {u.permissions.length} {u.permissions.length === 1 ? 'permiso activo' : 'permisos activos'}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-1.5">
                        <button 
                          onClick={() => openEdit(u)} 
                          title="Editar usuario"
                          className="p-2 text-slate-400 hover:text-primary hover:bg-slate-100 rounded-lg transition-colors"
                        >
                          <span className="material-symbols-outlined text-lg">edit</span>
                        </button>
                        <button 
                          onClick={() => handleDeleteUser(u.id)} 
                          title="Eliminar usuario"
                          className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        >
                          <span className="material-symbols-outlined text-lg">delete</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Info & Scripts */}
        <div className="flex flex-col gap-6">
          <div className="bg-emerald-50 rounded-2xl border border-emerald-200 p-6 border-l-4 border-l-emerald-500">
            <h3 className="font-bold text-emerald-900 mb-2 flex items-center gap-2">
              <span className="material-symbols-outlined">security</span>
              Seguridad de Acceso
            </h3>
            <p className="text-xs text-emerald-800 leading-relaxed">
              Los usuarios con rol <strong>Administrador</strong> tienen acceso total, incluyendo este panel y los logs del sistema.
              Los <strong>Directores</strong> pueden ver y aprobar, mientras que los <strong>Operadores</strong> gestionan el día a día.
            </p>
          </div>

          <div className="bg-slate-900 rounded-2xl p-6 shadow-xl">
            <h3 className="text-white font-bold mb-4 flex items-center gap-2 text-sm">
              <span className="material-symbols-outlined text-emerald-400">terminal</span>
              Script de Usuarios
            </h3>
            <div className="bg-black/50 rounded-lg p-3 relative group">
              <button onClick={() => { navigator.clipboard.writeText(sqlUsers); notify?.('Script copiado.', 'success'); }} className="absolute top-2 right-2 bg-white/10 hover:bg-white/20 text-white text-[10px] px-2 py-1 rounded">Copiar</button>
              <code className="text-[9px] font-mono text-emerald-400 whitespace-pre block overflow-x-auto h-40 scrollbar-thin scrollbar-thumb-emerald-900">{sqlUsers}</code>
            </div>
          </div>

          <div className="bg-slate-900 rounded-2xl p-6 shadow-xl">
            <h3 className="text-white font-bold mb-4 flex items-center gap-2 text-sm">
              <span className="material-symbols-outlined text-blue-400">article</span>
              Plantillas Recurrentes
            </h3>
            <p className="text-[10px] text-slate-400 mb-3">Restaura las plantillas base (Constancias, Informes) y repara la estructura de la tabla.</p>
            
            <button 
              onClick={handleRestoreTemplates}
              disabled={isRestoring}
              className="w-full mb-4 bg-blue-600 hover:bg-blue-500 text-white h-10 rounded-lg text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-sm">{isRestoring ? 'progress_activity' : 'auto_fix_high'}</span>
              {isRestoring ? 'RESTAURANDO...' : 'RESTAURAR AHORA (VÍA API)'}
            </button>

            <div className="bg-black/50 rounded-lg p-3 relative group">
              <button onClick={() => { navigator.clipboard.writeText(sqlTemplates); notify?.('Script de plantillas copiado.', 'success'); }} className="absolute top-2 right-2 bg-white/10 hover:bg-white/20 text-white text-[10px] px-2 py-1 rounded">Copiar</button>
              <code className="text-[9px] font-mono text-blue-400 whitespace-pre block overflow-x-auto h-40 scrollbar-thin scrollbar-thumb-blue-900">{sqlTemplates}</code>
            </div>
          </div>

          <div className="bg-slate-900 rounded-2xl p-6 shadow-xl">
            <h3 className="text-white font-bold mb-4 flex items-center gap-2 text-sm">
              <span className="material-symbols-outlined text-purple-400">gavel</span>
              Script de Actas de Sesiones
            </h3>
            <p className="text-xs text-slate-400 mb-4 tracking-wide leading-relaxed">
              Base de datos para almacenar actas en borrador, refinadas y firmadas, así como el repositorio de PDF. Copia este script o ejecútalo vía API si tienes los permisos y tokens configurados.
            </p>

            <button 
              onClick={() => runMigration(sqlActas)}
              disabled={isRestoring}
              className="mb-4 w-full bg-purple-600/20 hover:bg-purple-600/40 text-purple-400 border border-purple-500/30 rounded-lg p-3 text-xs font-bold font-mono text-left flex items-center gap-2 transition"
            >
              <span className="material-symbols-outlined text-sm">{isRestoring ? 'progress_activity' : 'auto_fix_high'}</span>
              {isRestoring ? 'CREANDO...' : 'CREAR TABLAS (VÍA API)'}
            </button>

            <div className="bg-black/50 rounded-lg p-3 relative group">
              <button onClick={() => { navigator.clipboard.writeText(sqlActas); notify?.('Script de actas copiado.', 'success'); }} className="absolute top-2 right-2 bg-white/10 hover:bg-white/20 text-white text-[10px] px-2 py-1 rounded">Copiar</button>
              <code className="text-[9px] font-mono text-purple-400 whitespace-pre block overflow-x-auto h-40 scrollbar-thin scrollbar-thumb-purple-900">{sqlActas}</code>
            </div>
          </div>
        </div>
      </div>

      {/* Importar Datos Maestros */}
      {user.role === 'Administrador' && (
        <DataImport notify={notify} />
      )}

      {/* User Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
            <div className="px-8 py-6 border-b flex justify-between items-center bg-slate-50">
              <h3 className="font-black text-slate-900 uppercase tracking-tight">
                {editingId ? 'EDITAR USUARIO' : 'NUEVO USUARIO'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            
            <div className="p-8 flex flex-col gap-5">
              {dbError && (
                <div className="bg-red-50 text-red-600 p-4 rounded-xl border border-red-100 text-xs font-bold flex items-start gap-3">
                  <span className="material-symbols-outlined text-[18px]">error</span>
                  <p>{dbError}</p>
                </div>
              )}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-black text-slate-500 uppercase ml-2">DNI (Usuario)</label>
                <input 
                  value={dni}
                  onChange={e => setDni(e.target.value.replace(/\D/g, ''))}
                  maxLength={8}
                  className="h-12 px-4 rounded-xl border-2 border-slate-100 bg-slate-50 focus:border-primary focus:bg-white outline-none font-bold text-slate-700 transition-all"
                  placeholder="Ej: 12345678"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-black text-slate-500 uppercase ml-2">Nombre Completo</label>
                <input 
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="h-12 px-4 rounded-xl border-2 border-slate-100 bg-slate-50 focus:border-primary focus:bg-white outline-none font-bold text-slate-700 transition-all"
                  placeholder="Ej: Juan Perez"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-black text-slate-500 uppercase ml-2">Rol del Sistema</label>
                <select 
                  value={role}
                  onChange={e => setRole(e.target.value as any)}
                  className="h-12 px-4 rounded-xl border-2 border-slate-100 bg-slate-50 focus:border-primary focus:bg-white outline-none font-bold text-slate-700 transition-all appearance-none"
                >
                  <option value="Operador">Operador</option>
                  <option value="Director">Director</option>
                  <option value="Administrador">Administrador</option>
                </select>
              </div>

              {role === 'Operador' && (
                <div className="flex flex-col gap-2 mt-2 bg-slate-50 p-4 rounded-2xl border border-slate-100">
                  <label className="text-[10px] font-black text-slate-500 uppercase">Permisos de Acceso (Solo Operador)</label>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
                    {availablePermissions.map(perm => (
                      <label key={perm.id} className="flex items-center gap-3 cursor-pointer group">
                        <div className={`size-5 rounded-md border-2 flex items-center justify-center transition-all ${permissions.includes(perm.id) ? 'bg-primary border-primary text-white' : 'border-slate-300 bg-white group-hover:border-primary'}`}>
                          {permissions.includes(perm.id) && <span className="material-symbols-outlined text-[14px] font-bold">check</span>}
                        </div>
                        <input 
                          type="checkbox" 
                          className="hidden"
                          checked={permissions.includes(perm.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setPermissions([...permissions, perm.id]);
                            } else {
                              setPermissions(permissions.filter(p => p !== perm.id));
                            }
                          }}
                        />
                        <span className="text-xs font-bold text-slate-700 select-none">{perm.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-black text-slate-500 uppercase ml-2">
                  {editingId ? 'Nueva Contraseña (Opcional)' : 'Contraseña'}
                </label>
                <input 
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="h-12 px-4 rounded-xl border-2 border-slate-100 bg-slate-50 focus:border-primary focus:bg-white outline-none font-bold text-slate-700 transition-all"
                  placeholder="••••••••"
                />
              </div>
            </div>

            <div className="px-8 py-6 bg-slate-50 border-t flex justify-end gap-3">
              <button onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-xs font-black text-slate-400 uppercase hover:text-slate-600 transition-colors">Cancelar</button>
              <button 
                onClick={handleSaveUser}
                disabled={isSubmitting}
                className="px-8 py-3 bg-primary text-white rounded-xl text-xs font-black uppercase shadow-xl shadow-primary/20 hover:bg-merlot active:scale-95 transition-all flex items-center gap-2"
              >
                {isSubmitting ? <span className="material-symbols-outlined animate-spin text-sm">progress_activity</span> : <span className="material-symbols-outlined text-sm">save</span>}
                {isSubmitting ? 'GUARDANDO...' : 'GUARDAR USUARIO'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

