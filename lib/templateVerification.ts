import QRCode from 'qrcode';
import { supabase } from './supabaseClient';
import { logEmissionAction } from './auditLogger';

export interface DocumentVerificationData {
  verificationCode: string;
  documentType: string;
  studentName?: string;
  studentDni?: string;
  studentCode?: string;
  career?: string;
  modality?: string;
  semester?: string;
  score?: string;
  meritOrder?: string;
  admissionDate?: string;
  expNumber?: string;
  receiptNumber?: string;
  userName?: string;
  userInitials?: string;
  issuedAt: string;
  isValid: boolean;
  isAttachedOnly?: boolean;
  attachedPdfUrl?: string;
  warningNote?: string;
}

export interface EmissionRegistrationPayload {
  verificationCode: string;
  documentType?: string;
  studentName?: string;
  studentDni?: string;
  studentCode?: string;
  career?: string;
  modality?: string;
  semester?: string;
  score?: string;
  meritOrder?: string;
  admissionDate?: string;
  expNumber?: string;
  receiptNumber?: string;
  userName?: string;
  userInitials?: string;
  userId?: string;
  pdfUrl?: string;
}

// Catálogo oficial de operadores de la Dirección de Admisión UNSAAC
// Permite discriminar segundos nombres y resolver con exactitud el Primer Nombre + Apellido Paterno
const KNOWN_OPERATORS = [
  { match: 'JHONATAN', paterno: 'CHOQUE', nombre: 'JHONATAN' },
  { match: 'CHOQUE', paterno: 'CHOQUE', nombre: 'JHONATAN' },
  { match: 'WILL', paterno: 'MAYTA', nombre: 'WILL' },
  { match: 'MAYTA', paterno: 'MAYTA', nombre: 'WILL' },
  { match: 'YOHN', paterno: 'SOTO', nombre: 'YOHN' },
  { match: 'SOTO', paterno: 'SOTO', nombre: 'YOHN' },
  { match: 'ARNALDO', paterno: 'TARAPACA', nombre: 'ARNALDO' },
  { match: 'TARAPACA', paterno: 'TARAPACA', nombre: 'ARNALDO' },
  { match: 'JENNIFER', paterno: 'SINCE', nombre: 'JENNIFER' },
  { match: 'SINCE', paterno: 'SINCE', nombre: 'JENNIFER' },
  { match: 'ELIANA', paterno: 'QUISPE', nombre: 'ELIANA' },
  { match: 'QUISPE', paterno: 'QUISPE', nombre: 'ELIANA' },
  { match: 'DENNIS', paterno: 'CANDIA', nombre: 'DENNIS' },
  { match: 'CANDIA', paterno: 'CANDIA', nombre: 'DENNIS' },
  { match: 'OLIVER', paterno: 'PEÑA', nombre: 'OLIVER' },
  { match: 'JUDITH', paterno: 'NINA', nombre: 'JUDITH' },
  { match: 'NINA', paterno: 'NINA', nombre: 'JUDITH' },
  { match: 'LAURA', paterno: 'AMUDIO', nombre: 'LAURA' },
  { match: 'KARIN', paterno: 'PEÑA', nombre: 'KARIN' },
  { match: 'RAHY', paterno: 'PUMA', nombre: 'RAHY' },
  { match: 'TEDIUS', paterno: 'TEDIUS', nombre: 'TEDIUS' },
];

/**
 * Genera de forma inteligente las iniciales del usuario emisor según el formato administrativo UNSAAC.
 * Regla oficial estricta: ÚNICAMENTE Primer Nombre + Dos primeras letras del Apellido Paterno (se discrimina el segundo nombre).
 * Ejemplos:
 *  - "JHONATAN ALEX" -> J (de Jhonatan) + CH (de Choque) => "JCH" (discrimina "ALEX")
 *  - "CHOQUE-CARITAS-JHONATAN ALEX" -> J (de Jhonatan) + CH (de Choque) => "JCH" (discrimina "ALEX")
 *  - "MAYTA-TTITO-WILL EDSON" -> W (de Will) + MA (de Mayta) => "WMA" (discrimina "EDSON")
 *  - "SOTO-SURCO-YOHN ELMER" -> Y (de Yohn) + SO (de Soto) => "YSO" (discrimina "ELMER")
 *  - "PEÑA-SANCHEZ-OLIVER SAUL" -> O (de Oliver) + PE (de Peña) => "OPE" (discrimina "SAUL")
 */
export function getUserInitials(nameOrUser?: string | { name?: string; full_name?: string; dni?: string; id?: string } | null | undefined): string {
  let nameStr = '';
  let userDni = '';
  let userId = '';

  if (typeof nameOrUser === 'string') {
    nameStr = nameOrUser;
  } else if (nameOrUser && typeof nameOrUser === 'object') {
    nameStr = nameOrUser.name || nameOrUser.full_name || '';
    userDni = nameOrUser.dni || '';
    userId = nameOrUser.id || '';
  }

  // Si no se proporcionó nombre directamente, intentar extraerlo de la sesión activa en el navegador
  if (!nameStr && typeof window !== 'undefined') {
    try {
      const stored = localStorage.getItem('unsaac_auth_user');
      if (stored) {
        const parsed = JSON.parse(stored);
        nameStr = parsed.name || parsed.full_name || '';
        if (!userDni) userDni = parsed.dni || '';
        if (!userId) userId = parsed.id || '';
      }
    } catch (e) {
      // Ignorar error de parsing
    }
  }

  // Si coincide con usuario administrador / operador Jhonatan Choque
  if (userDni === '47773611' || userId === '2cddaa12-25a3-4806-8eec-148298c28c43') {
    return 'JCH';
  }

  if (!nameStr || !nameStr.trim()) return 'DA'; // Dirección de Admisión por defecto

  const trimmed = nameStr.trim().toUpperCase();

  // Caso 1: Estándar oficial de la base de datos UNSAAC con guiones: PATERNO-MATERNO-NOMBRES
  // Ej: MAYTA-TTITO-WILL EDSON -> W (primer nombre Will) + MA (paterno Mayta) => WMA (discrimina EDSON)
  // Ej: CHOQUE-CARITAS-JHONATAN ALEX -> J (primer nombre Jhonatan) + CH (paterno Choque) => JCH (discrimina ALEX)
  // Ej: SOTO-SURCO-YOHN ELMER -> Y (primer nombre Yohn) + SO (paterno Soto) => YSO (discrimina ELMER)
  if (trimmed.includes('-')) {
    const parts = trimmed.split('-').map(p => p.trim()).filter(Boolean);
    if (parts.length >= 3) {
      const paterno = parts[0];
      const nombresStr = parts.slice(2).join(' ').trim();
      const firstNombreWord = nombresStr.split(/\s+/)[0] || '';
      const charNombre = firstNombreWord.charAt(0);
      const charsPaterno = paterno.substring(0, 2);
      if (charNombre && charsPaterno) {
        return charNombre + charsPaterno;
      }
    } else if (parts.length === 2) {
      const paterno = parts[0];
      const firstNombreWord = parts[1].split(/\s+/)[0] || '';
      return firstNombreWord.charAt(0) + paterno.substring(0, 2);
    }
  }

  // Caso 2: Formato con coma: APELLIDOS, NOMBRES
  // Ej: CHOQUE CARITAS, JHONATAN ALEX -> J (Jhonatan) + CH (Choque) => JCH (discrimina ALEX)
  if (trimmed.includes(',')) {
    const [apellidosPart, nombresPart] = trimmed.split(',').map(s => s.trim());
    const paterno = apellidosPart.split(/\s+/)[0] || '';
    const firstNombre = nombresPart.split(/\s+/)[0] || '';
    if (paterno && firstNombre) {
      return firstNombre.charAt(0) + paterno.substring(0, 2);
    }
  }

  // Caso 3: Coincidencia con catálogo de operadores (discrimina segundo nombre automáticamente)
  // Ej: "JHONATAN ALEX" -> toma Jhonatan + Choque => "JCH" (evita tomar AL de Alex)
  // Ej: "WILL EDSON" -> toma Will + Mayta => "WMA" (evita tomar ED de Edson)
  // Ej: "YOHN ELMER" -> toma Yohn + Soto => "YSO" (evita tomar EL de Elmer)
  for (const op of KNOWN_OPERATORS) {
    if (trimmed.includes(op.match)) {
      if (op.match === 'TEDIUS') return 'TED';
      return op.nombre.charAt(0) + op.paterno.substring(0, 2);
    }
  }

  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length === 0) return 'DA';
  if (words.length === 1) {
    return words[0].substring(0, 3);
  }

  // Caso 4: 4 palabras separadas por espacios:
  // Si formato es: PRIMER_NOMBRE SEGUNDO_NOMBRE PATERNO MATERNO
  // Ej: JHONATAN ALEX CHOQUE CARITAS -> J (Jhonatan) + CH (Choque) => JCH (discrimina segundo nombre ALEX)
  if (words.length === 4) {
    return words[0].charAt(0) + words[2].substring(0, 2);
  }

  // Caso 5: 3 palabras separadas por espacios:
  // Si formato es: PRIMER_NOMBRE SEGUNDO_NOMBRE PATERNO
  // Ej: JHONATAN ALEX CHOQUE -> J (Jhonatan) + CH (Choque) => JCH (discrimina segundo nombre ALEX)
  if (words.length === 3) {
    return words[0].charAt(0) + words[2].substring(0, 2);
  }

  // Caso 6: 2 palabras: NOMBRE APELLIDO (ej: LAURA AMUDIO -> L + AM => LAM)
  return words[0].charAt(0) + words[1].substring(0, 2);
}

/**
 * Generates a formal institutional verification code for admission documents.
 * Example: "UNSAAC-CONST-2026-F89A12"
 */
export function generateVerificationCode(prefix: string = 'CONST'): string {
  const year = new Date().getFullYear();
  const randomPart = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `UNSAAC-${prefix}-${year}-${randomPart}`;
}

/**
 * Generates a high-resolution QR base64 data URL for a given verification code.
 */
export async function generateQrDataUrl(verificationCode: string): Promise<string> {
  const cleanCode = verificationCode.trim();
  // En HashRouter, la ruta canónica se ubica en #/validar/CODIGO
  let origin = 'https://admision.unsaac.edu.pe';
  if (typeof window !== 'undefined' && window.location && window.location.origin) {
    origin = window.location.origin;
  }
  const validationUrl = `${origin}/#/validar/${encodeURIComponent(cleanCode)}`;

  try {
    const dataUrl = await QRCode.toDataURL(validationUrl, {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 350,
      color: {
        dark: '#7b1523', // Color institucional granate UNSAAC
        light: '#ffffff'
      }
    });
    return dataUrl;
  } catch (error) {
    console.error('Error generating QR code:', error);
    // Fallback con negro estándar
    return await QRCode.toDataURL(validationUrl, {
      margin: 1,
      width: 350
    });
  }
}

/**
 * Registers an emitted certificate/document into database and server for public verification.
 */
export async function registerDocumentEmission(
  payload: EmissionRegistrationPayload
): Promise<{ success: boolean; id?: string; error?: string }> {
  try {
    const initials = payload.userInitials || getUserInitials(payload.userName);
    const nowIso = new Date().toISOString();

    const destinationMeta = {
      tipo_documento: payload.documentType || 'CONSTANCIA DE INGRESO',
      estudiante_nombre: payload.studentName || '',
      estudiante_dni: payload.studentDni || '',
      estudiante_codigo: payload.studentCode || '',
      carrera: payload.career || '',
      modalidad: payload.modality || '',
      semestre: payload.semester || '',
      puntaje: payload.score || '',
      orden_merito: payload.meritOrder || '',
      fecha_ingreso: payload.admissionDate || '',
      expediente_numero: payload.expNumber || '',
      recibo_pago: payload.receiptNumber || '',
      usuario_nombre: payload.userName || '',
      usuario_iniciales: initials,
      fecha_emision: nowIso
    };

    const docRecord: any = {
      doc_type: payload.documentType || 'Constancia Oficial',
      doc_number: payload.verificationCode,
      ref_number: payload.expNumber || payload.studentDni || payload.studentCode || 'OFICIAL',
      subject: `${payload.documentType || 'CONSTANCIA DE INGRESO'} - ${payload.studentName || 'ESTUDIANTE'} - ${payload.career || 'UNSAAC'}`,
      destination: JSON.stringify(destinationMeta),
      status: 'Finalizado'
    };

    if (payload.pdfUrl) {
      docRecord.pdf_url = payload.pdfUrl;
    }
    if (payload.userId) {
      docRecord.created_by = payload.userId;
    }

    // 1. Guardar en Supabase tabla expedientes_salida
    const { data: supaData, error: supaErr } = await supabase
      .from('expedientes_salida')
      .insert([docRecord])
      .select('id')
      .maybeSingle();

    if (supaErr) {
      console.warn('Advertencia al registrar en expedientes_salida:', supaErr.message);
    }

    // Registrar en auditoría central de la UNSAAC
    try {
      await logEmissionAction(
        payload.documentType || 'CONSTANCIA DE INGRESO',
        payload.studentName || 'ESTUDIANTE',
        payload.studentDni || payload.studentCode || 'S/DNI',
        payload.verificationCode,
        payload.expNumber,
        payload.pdfUrl
      );
    } catch (auditErr) {
      console.warn('Advertencia al registrar auditoría de emisión:', auditErr);
    }

    // 2. Notificar / persistir en el backend local/proxy (/api/verificacion/emitir)
    try {
      await fetch('/api/verificacion/emitir', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          verificationCode: payload.verificationCode,
          ...payload,
          userInitials: initials,
          issuedAt: nowIso
        })
      });
    } catch (apiErr) {
      // En despliegue Netlify el endpoint local puede no estar disponible
    }

    return {
      success: true,
      id: supaData?.id || payload.verificationCode
    };
  } catch (err: any) {
    console.error('Error al registrar emisión de documento:', err);
    return {
      success: false,
      error: err?.message || 'Error desconocido al registrar documento'
    };
  }
}

/**
 * Fetches verification data for a document code, querying server and Supabase.
 */
export async function fetchDocumentVerification(
  code: string
): Promise<DocumentVerificationData | null> {
  if (!code) return null;
  let cleanCode = decodeURIComponent(code).trim();
  if (!cleanCode) return null;

  // Extraer código si el usuario ingresó o escaneó la URL completa
  if (cleanCode.includes('/validar/')) {
    cleanCode = cleanCode.split('/validar/').pop()?.split(/[?#&]/)[0] || cleanCode;
  } else if (cleanCode.includes('/verificar/')) {
    cleanCode = cleanCode.split('/verificar/').pop()?.split(/[?#&]/)[0] || cleanCode;
  }
  cleanCode = cleanCode.trim().replace(/^['"]|['"]$/g, '');
  if (!cleanCode) return null;

  // 1. Intentar endpoint backend (si existe el servidor activo)
  try {
    const res = await fetch(`/api/verificacion/${encodeURIComponent(cleanCode)}`);
    if (res.ok) {
      const data = await res.json();
      if (data && data.valid) {
        return {
          verificationCode: data.verificationCode || cleanCode,
          documentType: data.documentType || 'CONSTANCIA DE INGRESO',
          studentName: data.student?.name,
          studentDni: data.student?.dni,
          studentCode: data.student?.code,
          career: data.student?.career,
          modality: data.student?.modality,
          semester: data.student?.semester,
          score: data.student?.score,
          meritOrder: data.student?.meritOrder,
          admissionDate: data.student?.admissionDate,
          expNumber: data.issue?.expNumber,
          receiptNumber: data.issue?.receiptNumber,
          userName: data.issue?.userName,
          userInitials: data.issue?.userInitials,
          issuedAt: data.issue?.date || new Date().toISOString(),
          isValid: true,
          attachedPdfUrl: data.pdfUrl || undefined
        };
      }
    }
  } catch (err) {
    // Continuar a Supabase directo
  }

  // 2. Consulta directa a Supabase tabla expedientes_salida (funciona en Netlify y producción)
  try {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleanCode);

    // Consulta por doc_number usando ilike para ignorar mayúsculas/minúsculas
    let { data: records, error } = await supabase
      .from('expedientes_salida')
      .select('*')
      .ilike('doc_number', cleanCode)
      .order('created_at', { ascending: false });

    // Si no encontró por doc_number, intentar por UUID (sólo si tiene formato UUID para evitar error 22P02 de PostgreSQL)
    if ((!records || records.length === 0) && isUuid) {
      const byId = await supabase
        .from('expedientes_salida')
        .select('*')
        .eq('id', cleanCode);
      if (byId.data && byId.data.length > 0) {
        records = byId.data;
      }
    }

    // Búsqueda por ref_number o dentro del JSON destination
    if (!records || records.length === 0) {
      const byRefOrDest = await supabase
        .from('expedientes_salida')
        .select('*')
        .or(`ref_number.eq.${cleanCode},destination.ilike.%${cleanCode}%`)
        .order('created_at', { ascending: false });
      if (byRefOrDest.data && byRefOrDest.data.length > 0) {
        records = byRefOrDest.data;
      }
    }

    if (records && records.length > 0) {
      // Priorizar el registro que contiene metadatos JSON completos estructurados
      const bestRecord = records.find(r => {
        try {
          if (r.destination && r.destination.startsWith('{')) {
            const m = JSON.parse(r.destination);
            return Boolean(m.tipo_documento || m.estudiante_nombre || m.codigo_verificacion);
          }
        } catch (e) {}
        return false;
      }) || records[0];

      let meta: any = null;
      try {
        if (bestRecord.destination && bestRecord.destination.startsWith('{')) {
          meta = JSON.parse(bestRecord.destination);
        }
      } catch (e) {
        console.warn('Error al parsear metadatos en destination:', e);
      }

      // Si no hay metadatos estructurados pero hay un ref_number (DNI o código de postulante),
      // intentar enriquecer desde el padrón de participantes
      if (!meta?.estudiante_nombre && bestRecord.ref_number) {
        try {
          const { data: part } = await supabase
            .from('participantes')
            .select('nombre_completo, dni, carrera, modalidad, puntaje, orden_merito, proceso')
            .or(`dni.eq.${bestRecord.ref_number},codigo_postulante.eq.${bestRecord.ref_number}`)
            .maybeSingle();
          if (part) {
            meta = {
              ...meta,
              estudiante_nombre: part.nombre_completo,
              estudiante_dni: part.dni,
              carrera: part.carrera,
              modalidad: part.modalidad,
              puntaje: part.puntaje,
              orden_merito: part.orden_merito,
              semestre: part.proceso
            };
          }
        } catch (e) {}
      }

      const hasStructuredMeta = Boolean(meta && (meta.tipo_documento || meta.codigo_verificacion || meta.estudiante_nombre));
      const hasOfficialCodePrefix = Boolean(bestRecord.doc_number && (bestRecord.doc_number.startsWith('UNSAAC-CONST-') || bestRecord.doc_number.startsWith('UNSAAC-INF-')));

      const isSystemGenerated = hasStructuredMeta || hasOfficialCodePrefix;

      if (isSystemGenerated) {
        return {
          verificationCode: bestRecord.doc_number || cleanCode,
          documentType: meta?.tipo_documento || bestRecord.doc_type || 'CONSTANCIA DE INGRESO',
          studentName: meta?.estudiante_nombre || (bestRecord.subject ? bestRecord.subject.split('-')[1]?.trim() : ''),
          studentDni: meta?.estudiante_dni || bestRecord.ref_number || '',
          studentCode: meta?.estudiante_codigo || bestRecord.ref_number || '',
          career: meta?.carrera || (bestRecord.subject ? bestRecord.subject.split('-')[2]?.trim() : ''),
          modality: meta?.modalidad || '',
          semester: meta?.semestre || '',
          score: meta?.puntaje || '',
          meritOrder: meta?.orden_merito || '',
          admissionDate: meta?.fecha_ingreso || '',
          expNumber: meta?.expediente_numero || (bestRecord.ref_number?.length === 8 && bestRecord.ref_number.startsWith('26') ? bestRecord.ref_number : ''),
          receiptNumber: meta?.recibo_pago || '',
          userName: meta?.usuario_nombre || '',
          userInitials: meta?.usuario_iniciales || 'DA',
          issuedAt: meta?.fecha_emision || bestRecord.created_at || new Date().toISOString(),
          isValid: true,
          isAttachedOnly: false,
          attachedPdfUrl: bestRecord.pdf_url || undefined
        };
      } else {
        // Documento en expedientes de salida pero sin generación oficial
        return {
          verificationCode: bestRecord.doc_number || cleanCode,
          documentType: bestRecord.doc_type || 'Expediente de Salida Ordinario',
          studentName: '',
          studentDni: bestRecord.ref_number || '',
          studentCode: bestRecord.ref_number || '',
          career: '',
          issuedAt: bestRecord.created_at || new Date().toISOString(),
          isValid: false,
          isAttachedOnly: true,
          attachedPdfUrl: bestRecord.pdf_url || undefined,
          warningNote: 'Este registro corresponde a un expediente de salida con documento adjuntado manualmente. NO es una constancia oficial generada por el sistema.'
        };
      }
    }
  } catch (err) {
    console.error('Error al consultar Supabase expedientes_salida:', err);
  }

  return null;
}

/**
 * Retorna la fecha formateada según el estándar oficial institucional de la UNSAAC:
 * Formato: "d de mes de aaaa" (ejemplo: "6 de octubre de 2026")
 */
export function getFormattedCurrentDate(date: Date = new Date()): string {
  const months = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  return `${date.getDate()} de ${months[date.getMonth()]} de ${date.getFullYear()}`;
}

/**
 * Expresión regular que detecta fechas fijas precedidas o no de "Cusco," con cualquier variante:
 * "Cusco, 15 de marzo de 2024", "Cusco, 15 de marzo del 2024", "Cusco, 06 de octubre de 2026", etc.
 */
export const CUSCO_DATE_REGEX = /Cusco,?\s*(?:&nbsp;|\s)*\d{1,2}\s+de\s+[a-záéíóúñ]+\s+(?:del?|de)\s+\d{4}\.?/gi;
