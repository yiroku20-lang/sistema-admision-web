import { supabase } from './supabaseClient';
import { safeStorage } from './safeStorage';

export type AuditActionType =
  | 'Emisión'
  | 'Plantilla'
  | 'Edición'
  | 'Estado'
  | 'Registro'
  | 'Eliminación'
  | 'Seguridad'
  | 'Sistema'
  | 'Nota'
  | 'Préstamo'
  | 'Orientación'
  | 'Vacantes'
  | 'Asignación'
  | 'Contingencia'
  | 'Devolución'
  | 'Validación';

export type AuditModuleType =
  | 'Pre-Revisión'
  | 'Plantillas'
  | 'Emisión'
  | 'Mesa de Partes'
  | 'Cuadro de Vacantes'
  | 'Adjudicación'
  | 'Pagos'
  | 'Seguridad'
  | 'Contingencias'
  | 'Sistema';

export interface AuditEvent {
  action_type: AuditActionType;
  description: string;
  module?: AuditModuleType;
  user_name?: string;
  user_role?: string;
  expediente_id?: string;
  reference_id?: string;
  metadata?: Record<string, any>;
}

/**
 * Obtiene la información del usuario en sesión activa para auditoría y rastreo.
 */
export function getCurrentUserAuditInfo(): {
  name: string;
  role: string;
  dni: string;
  email: string;
} {
  let name = 'OPERADOR / SISTEMA';
  let role = 'Operador';
  let dni = '';
  let email = '';

  if (typeof window !== 'undefined') {
    try {
      const stored =
        safeStorage.getItem('unsaac_auth_user') ||
        localStorage.getItem('unsaac_auth_user');
      if (stored) {
        const parsed = JSON.parse(stored);
        name = parsed.name || parsed.full_name || parsed.email || name;
        role = parsed.role || role;
        dni = parsed.dni || '';
        email = parsed.email || '';
      }
    } catch (e) {
      // Ignorar error de parsing
    }
  }

  return {
    name: name.toUpperCase().trim(),
    role,
    dni,
    email
  };
}

/**
 * Registra un evento de auditoría y rastreo de usuario en la base de datos central de la UNSAAC (tramite_seguimiento).
 * Si no se proporciona user_name, se extrae automáticamente del usuario en sesión activa.
 */
export async function logAuditEvent(event: AuditEvent): Promise<void> {
  try {
    const userInfo = getCurrentUserAuditInfo();
    const finalUserName = (event.user_name || userInfo.name || 'OPERADOR / SISTEMA')
      .toUpperCase()
      .trim();

    // Formatear descripción con prefijo de módulo si está definido y no existe ya en la cadena
    let finalDescription = event.description.trim();
    if (event.module && !finalDescription.startsWith(`[${event.module}]`)) {
      finalDescription = `[${event.module}] ${finalDescription}`;
    }

    if (event.reference_id && !finalDescription.includes(event.reference_id)) {
      finalDescription += ` (Ref: ${event.reference_id})`;
    }

    const payload: {
      action_type: string;
      description: string;
      user_name: string;
      expediente_id?: string;
    } = {
      action_type: event.action_type,
      description: finalDescription,
      user_name: finalUserName
    };

    if (event.expediente_id) {
      payload.expediente_id = event.expediente_id;
    }

    await supabase.from('tramite_seguimiento').insert([payload]);
  } catch (err) {
    console.warn('Advertencia al registrar auditoría en tramite_seguimiento:', err);
  }
}

/**
 * Registra una acción de auditoría relacionada con la gestión y edición de plantillas oficiales.
 */
export async function logTemplateAction(
  action: 'Creación' | 'Edición' | 'Eliminación',
  templateName: string,
  extraDetails?: string
): Promise<void> {
  const desc = `${action === 'Creación' ? 'Creó' : action === 'Edición' ? 'Modificó' : 'Eliminó'} la plantilla oficial "${templateName}"${
    extraDetails ? `. ${extraDetails}` : ''
  }`;
  await logAuditEvent({
    action_type: 'Plantilla',
    module: 'Plantillas',
    description: desc
  });
}

/**
 * Registra una acción de auditoría sobre emisión de constancias oficiales.
 */
export async function logEmissionAction(
  docType: string,
  studentName: string,
  dni: string,
  verificationCode: string,
  expNumber?: string
): Promise<void> {
  await logAuditEvent({
    action_type: 'Emisión',
    module: 'Emisión',
    description: `Emitió ${docType} para ${studentName} (DNI: ${dni}) con Código de Verificación Oficial: ${verificationCode}`,
    expediente_id: expNumber,
    reference_id: verificationCode
  });
}

/**
 * Registra una acción en el módulo de Cuadro de Vacantes.
 */
export async function logVacancyAction(
  action: string,
  processOrYear: string,
  description: string
): Promise<void> {
  await logAuditEvent({
    action_type: 'Vacantes',
    module: 'Cuadro de Vacantes',
    description: `${action} [${processOrYear}]: ${description}`
  });
}

/**
 * Registra una acción en el módulo de Pre-Revisión de Postulantes o Contingencias.
 */
export async function logPreReviewAction(
  action: string,
  modalityName: string,
  details: string
): Promise<void> {
  await logAuditEvent({
    action_type: 'Registro',
    module: 'Pre-Revisión',
    description: `${action} en modalidad "${modalityName}": ${details}`
  });
}

/**
 * Registra una acción de auditoría en la administración de usuarios, roles y seguridad.
 */
export async function logSecurityAction(
  action: string,
  targetUserName: string,
  details: string
): Promise<void> {
  await logAuditEvent({
    action_type: 'Seguridad',
    module: 'Seguridad',
    description: `${action} para el usuario ${targetUserName}: ${details}`
  });
}

/**
 * Registra el ingreso o inicio de sesión de un usuario/operador en la web app.
 * Permite auditar cuándo ingresó y desde qué plataforma, incluso si solo ingresa a consultar información.
 */
export async function logSessionLogin(
  user: { name?: string; full_name?: string; dni?: string; role?: string; id?: string },
  contextNote?: string
): Promise<void> {
  const platform =
    typeof window !== 'undefined' && (window as any).electronAPI
      ? 'Desktop Electron'
      : 'Plataforma Web';
  const userName = (user.name || user.full_name || 'OPERADOR').toUpperCase().trim();
  const dniStr = user.dni ? ` (DNI: ${user.dni})` : '';
  const roleStr = user.role ? ` [${user.role}]` : '';
  const noteStr = contextNote ? ` - ${contextNote}` : ` - Acceso a ${platform}`;

  await logAuditEvent({
    action_type: 'Sistema',
    module: 'Sistema',
    description: `Inicio de Sesión${noteStr}${dniStr}${roleStr}`,
    user_name: userName,
    reference_id: user.dni || user.id || undefined
  });
}

/**
 * Registra el cierre de sesión voluntario de un usuario.
 */
export async function logSessionLogout(userName: string): Promise<void> {
  await logAuditEvent({
    action_type: 'Sistema',
    module: 'Sistema',
    description: 'Cierre de Sesión voluntario',
    user_name: userName.toUpperCase().trim()
  });
}

