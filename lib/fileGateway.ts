/**
 * Gateway de Archivos - Admisión UNSAAC
 * Manejo de conexión universal para Electron (Escritorio) y Navegador Web.
 */

export interface StudentDocument {
  name?: string;
  filename: string;
  relativePath?: string;
  path: string;
  file_path?: string;
  url?: string;
  size?: number;
  lastModified?: string;
  description?: string;
  category: 'FOTO' | 'DNI' | 'CERTIFICADO' | 'DECLARACION' | 'REQUISITO' | 'OTRO';
  categoryLabel: string;
  prefixCode?: string;
  badgeColor: 'blue' | 'emerald' | 'purple' | 'amber' | 'slate' | 'red';
  icon: string;
  isPdf: boolean;
  isImage: boolean;
  ext: string;
  friendlyName: string;
  concursoLabel?: string;
}

export interface GatewayHealthResult {
  ok: boolean;
  latency?: number;
  statusText?: string;
  error?: string;
  url: string;
}

const STORAGE_KEY = 'local_api_url';
export const DEFAULT_ELECTRON_GATEWAY = 'http://localhost:5000';
export const DEFAULT_WEB_FALLBACK = 'http://localhost:5000';

/**
 * Detecta si la aplicación se está ejecutando dentro del entorno Electron
 */
export function isElectronApp(): boolean {
  if (typeof window === 'undefined') return false;
  return Boolean(
    (window as any).electronAPI || 
    (window as any).process?.type === 'renderer' || 
    navigator.userAgent.toLowerCase().includes(' electron/')
  );
}

/**
 * Obtiene la URL base de la Puerta de Enlace / Servidor de Archivos activa
 */
export function getGatewayBaseUrl(): string {
  if (typeof window === 'undefined') return DEFAULT_ELECTRON_GATEWAY;

  // En Electron, por defecto usar localhost:5000 automáticamente
  if (isElectronApp()) {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && stored.trim()) {
      return stored.replace(/\/$/, '').trim();
    }
    return DEFAULT_ELECTRON_GATEWAY;
  }

  // En la Web, usar localStorage o fallback
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored && stored.trim()) {
    // Si contiene urls obsoletas temporales de prueba, mantener limpio
    if (stored.includes('night-fan-profiles-sides')) {
      localStorage.removeItem(STORAGE_KEY);
      return DEFAULT_WEB_FALLBACK;
    }
    return stored.replace(/\/$/, '').trim();
  }

  const envUrl = (import.meta as any).env?.VITE_API_URL;
  if (envUrl && typeof envUrl === 'string' && envUrl.trim()) {
    return envUrl.replace(/\/$/, '').trim();
  }

  return DEFAULT_WEB_FALLBACK;
}

/**
 * Guarda la URL de la Puerta de Enlace en localStorage
 */
export function setGatewayBaseUrl(url: string): string {
  const cleanUrl = url.trim().replace(/\/$/, '');
  if (typeof window !== 'undefined') {
    if (cleanUrl) {
      localStorage.setItem(STORAGE_KEY, cleanUrl);
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
    // Disparar evento personalizado para sincronizar componentes
    window.dispatchEvent(new CustomEvent('gateway-url-changed', { detail: { url: cleanUrl } }));
  }
  return cleanUrl;
}

/**
 * Prueba la conectividad con el servidor de archivos
 */
export async function testGatewayHealth(customUrl?: string): Promise<GatewayHealthResult> {
  const baseUrl = customUrl ? customUrl.trim().replace(/\/$/, '') : getGatewayBaseUrl();
  const startTime = Date.now();

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500);

    // Probar primero el endpoint de estado de archivos o el root
    let response: Response;
    try {
      response = await fetch(`${baseUrl}/api/files/health`, {
        method: 'GET',
        signal: controller.signal
      });
    } catch {
      // Si falla /api/files/health, intentar /api/health o root
      response = await fetch(`${baseUrl}/api/health`, {
        method: 'GET',
        signal: controller.signal
      });
    }

    clearTimeout(timeoutId);
    const latency = Date.now() - startTime;

    if (response.ok) {
      return {
        ok: true,
        latency,
        statusText: `Conectado (${latency}ms)`,
        url: baseUrl
      };
    } else {
      // Incluso si retorna 404 para el endpoint de health pero responde el servidor HTTP
      if (response.status < 500) {
        return {
          ok: true,
          latency,
          statusText: `Servidor respondiendo (${response.status})`,
          url: baseUrl
        };
      }
      return {
        ok: false,
        latency,
        error: `Servidor retornó código HTTP ${response.status}`,
        url: baseUrl
      };
    }
  } catch (err: any) {
    const isTimeout = err.name === 'AbortError';
    return {
      ok: false,
      error: isTimeout ? 'Tiempo de espera agotado (Timeout 3.5s)' : (err.message || 'Servidor fuera de línea'),
      url: baseUrl
    };
  }
}

/**
 * Clasifica y mapea un documento según prefijos estándar (1_1_, 2_1_, 3_1_, etc.)
 */
export function parseDocumentInfo(doc: any, cleanPath: string): StudentDocument {
  const rawPath = cleanPath || (typeof doc === 'string' ? doc : (doc.relativePath || doc.path || doc.file_path || doc.url || ''));
  const filename = typeof doc === 'string' 
    ? doc.split(/[\/\\]/).pop()! 
    : (doc.name || doc.filename || (rawPath ? rawPath.split(/[\/\\]/).pop() : '') || 'Documento sin nombre');

  const ext = (filename.split('.').pop() || '').toUpperCase();
  const isPdf = ext === 'PDF';
  const isImage = ['JPG', 'JPEG', 'PNG', 'WEBP', 'GIF', 'BMP'].includes(ext);

  const upperName = filename.toUpperCase();

  let category: StudentDocument['category'] = 'OTRO';
  let categoryLabel = 'Documento de Postulación';
  let prefixCode = '';
  let badgeColor: StudentDocument['badgeColor'] = 'slate';
  let icon = isPdf ? 'picture_as_pdf' : isImage ? 'image' : 'description';
  let friendlyName = filename;

  // 1. Prefijo 1_1_ o FOTO / FICHA
  if (/^1_1_/i.test(upperName) || upperName.startsWith('1_') || upperName.includes('FOTO') || upperName.includes('FICHA')) {
    category = 'FOTO';
    prefixCode = '1_1';
    categoryLabel = 'Foto / Ficha de Inscripción';
    friendlyName = doc.description || 'Foto del Postulante';
    badgeColor = 'blue';
    icon = 'account_circle';
  }
  // 2. Prefijo 2_1_ o DNI / IDENTIDAD
  else if (/^2_1_/i.test(upperName) || upperName.startsWith('2_') || upperName.includes('DNI') || upperName.includes('IDENTIDAD')) {
    category = 'DNI';
    prefixCode = '2_1';
    categoryLabel = 'Documento de Identidad (DNI)';
    friendlyName = doc.description || 'Documento Nacional de Identidad';
    badgeColor = 'emerald';
    icon = 'badge';
  }
  // 3. Prefijo 3_1_ o CERTIFICADO / CONSTANCIA / LOGRO
  else if (/^3_1_/i.test(upperName) || upperName.startsWith('3_') || upperName.includes('CERTIFICADO') || upperName.includes('CONSTANCIA') || upperName.includes('LOGRO')) {
    category = 'CERTIFICADO';
    prefixCode = '3_1';
    categoryLabel = 'Certificado de Estudios / Logro';
    friendlyName = doc.description || 'Certificado de Estudios Secundarios';
    badgeColor = 'purple';
    icon = 'school';
  }
  // 4. Prefijo 4_1_ o DECLARACION / JURADA
  else if (/^4_1_/i.test(upperName) || upperName.startsWith('4_') || upperName.includes('DECLARACION') || upperName.includes('JURADA')) {
    category = 'DECLARACION';
    prefixCode = '4_1';
    categoryLabel = 'Declaración Jurada';
    friendlyName = doc.description || 'Declaración Jurada de Requisitos';
    badgeColor = 'amber';
    icon = 'history_edu';
  }
  // 5. Otros Requisitos específicos
  else if (upperName.includes('PARTIDA') || upperName.includes('REQUISITO') || upperName.includes('PAGO') || upperName.includes('RECIBO')) {
    category = 'REQUISITO';
    categoryLabel = 'Requisito Específico';
    friendlyName = doc.description || filename.replace(/\.[^/.]+$/, "").replace(/_/g, " ");
    badgeColor = 'amber';
    icon = 'verified_user';
  } else {
    friendlyName = doc.description || filename.replace(/\.[^/.]+$/, "").replace(/_/g, " ");
  }

  return {
    ...doc,
    filename,
    path: rawPath,
    relativePath: doc.relativePath || rawPath,
    ext,
    isPdf,
    isImage,
    category,
    categoryLabel,
    prefixCode,
    badgeColor,
    icon,
    friendlyName
  };
}

/**
 * Consulta la lista de documentos de un estudiante en la Puerta de Enlace
 */
export async function fetchStudentDocumentsFromGateway(
  dniOrCode: string,
  customBaseUrl?: string
): Promise<{ ok: boolean; documents: StudentDocument[]; error?: string }> {
  if (!dniOrCode || !dniOrCode.trim()) {
    return { ok: true, documents: [] };
  }

  const cleanDni = dniOrCode.trim();
  const baseUrl = customBaseUrl ? customBaseUrl.trim().replace(/\/$/, '') : getGatewayBaseUrl();

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    const targetUrl = `${baseUrl}/api/files/student-documents/${encodeURIComponent(cleanDni)}`;
    const response = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      },
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      if (response.status === 404) {
        return { ok: true, documents: [] };
      }
      return { 
        ok: false, 
        documents: [], 
        error: `El servidor de archivos respondió con error (Código ${response.status})` 
      };
    }

    const payload = await response.json();
    const rawList: any[] = Array.isArray(payload) ? payload : (payload.documents || payload.files || payload.data || []);

    const documents = rawList.map(item => {
      const rawPath = typeof item === 'string' ? item : (item.relativePath || item.path || item.file_path || item.url || '');
      let cleanPath = rawPath;
      if (rawPath.includes('?path=')) {
        try {
          const match = rawPath.match(/[?&]path=([^&]+)/);
          if (match) cleanPath = decodeURIComponent(match[1]);
        } catch {
          // ignore
        }
      }
      return parseDocumentInfo(item, cleanPath);
    });

    return { ok: true, documents };
  } catch (err: any) {
    const isTimeout = err.name === 'AbortError';
    return {
      ok: false,
      documents: [],
      error: isTimeout 
        ? 'Tiempo de espera agotado al consultar el servidor de archivos.' 
        : (err.message || 'No se pudo conectar con el servidor de archivos.')
    };
  }
}

/**
 * Obtiene la URL para transmitir/visualizar un documento
 */
export function getDocumentStreamUrl(relativePath: string, customBaseUrl?: string): string {
  const baseUrl = customBaseUrl ? customBaseUrl.trim().replace(/\/$/, '') : getGatewayBaseUrl();
  return `${baseUrl}/api/files/stream-document?path=${encodeURIComponent(relativePath)}`;
}
