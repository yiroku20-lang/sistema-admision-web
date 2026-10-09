import { safeStorage } from './safeStorage';

export interface DriveConfig {
  folderUrl: string;
  folderId: string;
  folderName: string;
  webhookUrl: string;
  autoUploadEnabled: boolean;
}

const STORAGE_KEY_CONFIG = 'unsaac_drive_outgoing_config';

export const DEFAULT_DRIVE_CONFIG: DriveConfig = {
  folderUrl: 'https://drive.google.com/drive/folders/1_90qY33PZYA0o2bIrmaQVs-KuMjY0CuF',
  folderId: '1_90qY33PZYA0o2bIrmaQVs-KuMjY0CuF',
  folderName: 'Expedientes de Salida - Admisión UNSAAC',
  webhookUrl: 'https://script.google.com/macros/s/AKfycby2HWpuos2D4e-Vv3AkMJSbVA-6b-pHTWUSJL0IJRcEWUghjK2qlWb27jiYazQZl5RK/exec',
  autoUploadEnabled: true,
};

/**
 * Extrae el ID de una carpeta de Google Drive a partir de una URL o texto.
 * Soporta formatos:
 * - https://drive.google.com/drive/folders/1wXyZ...
 * - https://drive.google.com/drive/u/0/folders/1wXyZ...
 * - https://drive.google.com/drive/u/1/folders/1wXyZ...
 * - https://drive.google.com/open?id=1wXyZ...
 * - 1wXyZ... (ID directo)
 */
export function extractDriveFolderId(urlOrId: string): string {
  if (!urlOrId) return '';
  const trimmed = urlOrId.trim();

  // /folders/ID
  const folderMatch = trimmed.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (folderMatch && folderMatch[1]) {
    return folderMatch[1];
  }

  // ?id=ID o &id=ID
  const idParamMatch = trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (idParamMatch && idParamMatch[1]) {
    return idParamMatch[1];
  }

  // ID directo (alfanumérico de 15 a 65 caracteres)
  if (/^[a-zA-Z0-9_-]{15,65}$/.test(trimmed)) {
    return trimmed;
  }

  return trimmed;
}

/**
 * Extrae el ID de un archivo individual de Google Drive a partir de un enlace.
 * Soporta formatos:
 * - https://drive.google.com/file/d/1ABCxyz.../view
 * - https://drive.google.com/file/d/1ABCxyz...
 * - https://drive.google.com/open?id=1ABCxyz...
 * - https://drive.google.com/uc?id=1ABCxyz...
 */
export function extractDriveFileId(urlOrId: string): string | null {
  if (!urlOrId) return null;
  const trimmed = urlOrId.trim();

  const fileMatch = trimmed.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (fileMatch && fileMatch[1]) {
    return fileMatch[1];
  }

  const idParamMatch = trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (idParamMatch && idParamMatch[1]) {
    return idParamMatch[1];
  }

  if (/^[a-zA-Z0-9_-]{20,65}$/.test(trimmed)) {
    return trimmed;
  }

  return null;
}

/**
 * Normaliza cualquier enlace de archivo de Drive a una URL limpia de visualización web.
 */
export function formatDriveViewUrl(fileUrlOrId: string): string {
  const fileId = extractDriveFileId(fileUrlOrId);
  if (fileId) {
    return `https://drive.google.com/file/d/${fileId}/view`;
  }
  return fileUrlOrId;
}

/**
 * Normaliza un enlace de archivo de Drive para previsualización embebida en iframe.
 */
export function formatDrivePreviewUrl(fileUrlOrId: string): string {
  const fileId = extractDriveFileId(fileUrlOrId);
  if (fileId) {
    return `https://drive.google.com/file/d/${fileId}/preview`;
  }
  return fileUrlOrId;
}

/**
 * Normaliza un enlace de archivo de Drive para descarga directa.
 */
export function formatDriveDownloadUrl(fileUrlOrId: string): string {
  const fileId = extractDriveFileId(fileUrlOrId);
  if (fileId) {
    return `https://drive.google.com/uc?export=download&id=${fileId}`;
  }
  return fileUrlOrId;
}

/**
 * Verifica si una URL dada pertenece al ecosistema de Google Drive o Docs.
 */
export function isGoogleDriveUrl(url?: string | null): boolean {
  if (!url) return false;
  return (
    url.includes('drive.google.com') ||
    url.includes('docs.google.com') ||
    url.includes('drive.usercontent.google.com')
  );
}

/**
 * Construye la URL para abrir la carpeta directamente en el navegador de Google Drive.
 */
export function buildDriveFolderUrl(folderIdOrUrl: string): string {
  const id = extractDriveFolderId(folderIdOrUrl);
  if (id) {
    return `https://drive.google.com/drive/folders/${id}`;
  }
  if (folderIdOrUrl.startsWith('http')) {
    return folderIdOrUrl;
  }
  return 'https://drive.google.com';
}

/**
 * Obtiene la configuración actual de Google Drive guardada en almacenamiento local.
 */
export function getDriveConfig(): DriveConfig {
  const raw = safeStorage.getItem(STORAGE_KEY_CONFIG);
  if (!raw) return { ...DEFAULT_DRIVE_CONFIG };
  try {
    const parsed = JSON.parse(raw);
    const folderUrl = (parsed.folderUrl && parsed.folderUrl.trim()) ? parsed.folderUrl.trim() : DEFAULT_DRIVE_CONFIG.folderUrl;
    const folderId = (parsed.folderId && parsed.folderId.trim()) ? parsed.folderId.trim() : (extractDriveFolderId(folderUrl) || DEFAULT_DRIVE_CONFIG.folderId);
    const webhookUrl = (parsed.webhookUrl && parsed.webhookUrl.trim()) ? parsed.webhookUrl.trim() : DEFAULT_DRIVE_CONFIG.webhookUrl;
    return {
      folderUrl,
      folderId,
      folderName: parsed.folderName || DEFAULT_DRIVE_CONFIG.folderName,
      webhookUrl,
      autoUploadEnabled: parsed.autoUploadEnabled !== false,
    };
  } catch {
    return { ...DEFAULT_DRIVE_CONFIG };
  }
}

/**
 * Guarda la configuración de Google Drive en almacenamiento local.
 */
export function saveDriveConfig(config: Partial<DriveConfig>): DriveConfig {
  const current = getDriveConfig();
  const folderId = config.folderId || extractDriveFolderId(config.folderUrl || current.folderUrl);
  
  const updated: DriveConfig = {
    folderUrl: config.folderUrl !== undefined ? config.folderUrl.trim() : current.folderUrl,
    folderId: folderId.trim(),
    folderName: config.folderName !== undefined ? config.folderName.trim() : current.folderName,
    webhookUrl: config.webhookUrl !== undefined ? config.webhookUrl.trim() : current.webhookUrl,
    autoUploadEnabled: config.autoUploadEnabled !== undefined ? config.autoUploadEnabled : current.autoUploadEnabled,
  };

  safeStorage.setItem(STORAGE_KEY_CONFIG, JSON.stringify(updated));

  // Sincronizar en segundo plano con el servidor para que todos los usuarios y operadores compartan la configuración
  if (typeof fetch !== 'undefined') {
    fetch('/api/drive-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated),
    }).catch(() => {});
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('drive-config-updated', { detail: updated }));
  }

  return updated;
}

/**
 * Sincroniza la configuración de Google Drive entre el almacenamiento local y el servidor central.
 */
export async function syncDriveConfigWithServer(): Promise<DriveConfig> {
  const local = getDriveConfig();
  if (typeof fetch === 'undefined') return local;

  try {
    // Si la máquina actual ya tiene enlaces configurados, los persiste en el servidor
    if (local.webhookUrl && local.folderId) {
      fetch('/api/drive-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(local),
      }).catch(() => {});
      return local;
    }

    // Si la máquina actual no tiene enlaces pero el servidor sí, los hidrata automáticamente
    const res = await fetch('/api/drive-config').catch(() => null);
    if (res && res.ok) {
      const serverConfig = await res.json();
      if (serverConfig && (serverConfig.webhookUrl || serverConfig.folderId)) {
        safeStorage.setItem(STORAGE_KEY_CONFIG, JSON.stringify(serverConfig));
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('drive-config-updated', { detail: serverConfig }));
        }
        return serverConfig;
      }
    }
  } catch (e) {
    console.warn('Sync drive config warning:', e);
  }
  return local;
}

// Iniciar sincronización automática al cargar el módulo en el navegador
if (typeof window !== 'undefined') {
  setTimeout(() => {
    syncDriveConfigWithServer().catch(() => {});
  }, 100);
}

/**
 * Convierte un objeto File a Base64 string puro (sin el prefijo data:...;base64,).
 */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Remover header 'data:application/pdf;base64,'
      const base64Index = result.indexOf(';base64,');
      if (base64Index !== -1) {
        resolve(result.substring(base64Index + 8));
      } else {
        resolve(result);
      }
    };
    reader.onerror = (error) => reject(error);
    reader.readAsDataURL(file);
  });
}

export interface DriveUploadResult {
  success: boolean;
  fileUrl?: string;
  fileId?: string;
  fileName?: string;
  error?: string;
}

/**
 * Sube un archivo PDF directamente a la carpeta de Google Drive utilizando el conector Webhook institucional de Google Apps Script.
 */
export async function uploadPdfToGoogleDrive(
  file: File,
  options?: {
    customFileName?: string;
    targetFolderId?: string;
    customWebhookUrl?: string;
  }
): Promise<DriveUploadResult> {
  const config = getDriveConfig();
  const folderId = (options?.targetFolderId || config.folderId).trim();
  const webhookUrl = (options?.customWebhookUrl || config.webhookUrl).trim();

  if (!folderId && !webhookUrl) {
    return {
      success: false,
      error: 'No se ha configurado la conexión institucional con Google Drive.',
    };
  }

  try {
    const base64Content = await fileToBase64(file);
    const sanitizedName = (options?.customFileName || file.name)
      .replace(/[^\w\s.-]/gi, '_')
      .trim();
    const finalFileName = sanitizedName.endsWith('.pdf') ? sanitizedName : `${sanitizedName}.pdf`;

    // 1. Intentar primero a través del proxy backend (/api/drive-upload) para máxima estabilidad y evitar CORS del navegador
    try {
      const proxyRes = await fetch('/api/drive-upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          webhookUrl,
          folderId,
          fileName: finalFileName,
          mimeType: 'application/pdf',
          fileBase64: base64Content,
        }),
      });

      let proxyErrorMessage = '';
      if (proxyRes.ok) {
        const proxyData = await proxyRes.json();
        if (proxyData && proxyData.success) {
          const finalViewUrl = formatDriveViewUrl(
            proxyData.fileUrl || (proxyData.fileId ? `https://drive.google.com/file/d/${proxyData.fileId}/view` : '')
          );
          return {
            success: true,
            fileUrl: finalViewUrl,
            fileId: proxyData.fileId,
            fileName: proxyData.fileName || sanitizedName,
          };
        } else if (proxyData && proxyData.error) {
          proxyErrorMessage = proxyData.error;
          console.warn('Proxy de subida a Drive reportó error:', proxyData.error);
        }
      } else {
        const errJson = await proxyRes.json().catch(() => null);
        proxyErrorMessage = errJson?.error || `Error del proxy HTTP ${proxyRes.status}`;
      }
    } catch (proxyErr: any) {
      console.warn('Proxy de subida a Drive reportó aviso, reintentando directo si es necesario:', proxyErr?.message);
    }

    // 2. Si no fue por proxy o falló la red interna, intentar directo a Google Apps Script
    if (webhookUrl) {
      const payload = {
        action: 'upload',
        folderId: folderId,
        fileName: finalFileName,
        mimeType: 'application/pdf',
        fileBase64: base64Content,
      };

      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain;charset=utf-8',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok && response.status !== 302) {
        throw new Error(`El conector de Google Drive respondió con error HTTP ${response.status}`);
      }

      const result = await response.json();

      if (result && result.success) {
        const finalViewUrl = formatDriveViewUrl(
          result.fileUrl || (result.fileId ? `https://drive.google.com/file/d/${result.fileId}/view` : '')
        );
        return {
          success: true,
          fileUrl: finalViewUrl,
          fileId: result.fileId,
          fileName: result.fileName || sanitizedName,
        };
      } else {
        return {
          success: false,
          error: result?.error || 'Respuesta no exitosa del conector de Google Drive.',
        };
      }
    }

    return {
      success: false,
      error: 'No se pudo conectar con Google Drive ni a través del proxy ni de forma directa.',
    };
  } catch (err: any) {
    console.error('Error al subir a Google Drive:', err);
    return {
      success: false,
      error: err.message || 'Error de comunicación con el conector de Google Drive.',
    };
  }
}

/**
 * Prueba la conectividad con el conector / Webhook de Google Drive.
 */
export async function testDriveWebhookHealth(
  webhookUrl: string,
  folderId?: string
): Promise<{ ok: boolean; message: string; latency?: number }> {
  const cleanUrl = webhookUrl.trim();
  if (!cleanUrl) {
    return { ok: false, message: 'La URL del conector no puede estar vacía.' };
  }

  const start = Date.now();
  try {
    const payload = {
      action: 'ping',
      folderId: folderId || '',
    };

    const response = await fetch(cleanUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8',
      },
      body: JSON.stringify(payload),
    });

    const latency = Date.now() - start;
    if (response.ok) {
      const data = await response.json().catch(() => null);
      if (data && data.success) {
        return {
          ok: true,
          message: `Conexión exitosa con Google Drive (${latency}ms). Carpeta detectada: ${data.folderName || 'Válida'}`,
          latency,
        };
      }
      return {
        ok: true,
        message: `Servicio en línea (${latency}ms). Respuesta recibida.`,
        latency,
      };
    }
    return {
      ok: false,
      message: `El conector respondió con estado HTTP ${response.status}`,
    };
  } catch (err: any) {
    return {
      ok: false,
      message: `No se pudo conectar con el conector: ${err.message || 'Error de red o CORS'}`,
    };
  }
}

/**
 * Plantilla oficial de Google Apps Script para desplegar en la cuenta institucional de Google.
 * Esta plantilla se ejecuta en Google Cloud / Workspace de forma 100% gratuita.
 */
export function getGoogleAppsScriptTemplate(): string {
  return `/**
 * CONECTOR INSTITUCIONAL GOOGLE DRIVE - ADMISIÓN UNSAAC
 * Guarda archivos PDF enviados desde la Mesa de Salidas en una carpeta oficial de Drive.
 * 
 * INSTRUCCIONES DE DESPLIEGUE (1 MINUTO):
 * 1. Abre https://script.google.com/ e inicia sesión con la cuenta institucional de Admisión.
 * 2. Crea un "Nuevo proyecto".
 * 3. Borra todo el código y pega este contenido completo.
 * 4. Haz clic en "Implementar" > "Nueva implementación".
 * 5. Tipo: Selecciona el ícono de engranaje y elige "Aplicación web".
 * 6. Configura:
 *    - Ejecutar como: "Yo" (tu cuenta)
 *    - Quién tiene acceso: "Cualquier usuario" (Anyone)
 * 7. Haz clic en "Implementar" y autoriza los permisos de Drive.
 * 8. Copia la "URL de la aplicación web" (termina en /exec) y pégala en el sistema.
 */

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return jsonResponse({ success: false, error: "No se recibieron datos en la solicitud" });
    }

    var request = JSON.parse(e.postData.contents);
    
    // Acción: Ping / Prueba de salud
    if (request.action === "ping") {
      var folderInfo = "No especificada";
      if (request.folderId) {
        try {
          var testFolder = DriveApp.getFolderById(request.folderId);
          folderInfo = testFolder.getName();
        } catch (fErr) {
          folderInfo = "Carpeta no encontrada o sin acceso: " + fErr.toString();
        }
      }
      return jsonResponse({
        success: true,
        status: "OK",
        folderName: folderInfo,
        timestamp: new Date().toISOString()
      });
    }

    // Acción: Subida de archivo
    var folderId = request.folderId;
    var fileName = request.fileName || ("DOCUMENTO_SALIDA_" + new Date().getTime() + ".pdf");
    var base64Data = request.fileBase64;
    var mimeType = request.mimeType || "application/pdf";

    if (!base64Data) {
      return jsonResponse({ success: false, error: "Contenido del archivo no provisto" });
    }

    var targetFolder;
    if (folderId) {
      try {
        targetFolder = DriveApp.getFolderById(folderId);
      } catch (err) {
        return jsonResponse({ success: false, error: "Error al acceder a la carpeta de Drive: " + err.toString() });
      }
    } else {
      targetFolder = DriveApp.getRootFolder();
    }

    // Decodificar Base64 y crear el archivo
    var decoded = Utilities.base64Decode(base64Data);
    var blob = Utilities.newBlob(decoded, mimeType, fileName);
    var file = targetFolder.createFile(blob);

    // Otorgar permisos de lectura a cualquiera con el enlace (para que los operadores y autoridades puedan abrirlo)
    try {
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    } catch (shareErr) {
      // Ignorar si las políticas del dominio institucional requieren acceso restringido al dominio
    }

    var fileUrl = file.getUrl();
    var fileId = file.getId();

    return jsonResponse({
      success: true,
      fileId: fileId,
      fileUrl: fileUrl,
      fileName: file.getName(),
      folderName: targetFolder.getName()
    });

  } catch (globalErr) {
    return jsonResponse({
      success: false,
      error: "Error interno en Google Apps Script: " + globalErr.toString()
    });
  }
}

function doGet(e) {
  return jsonResponse({
    success: true,
    message: "Conector de Google Drive para Admisión UNSAAC activo y listo para recibir documentos.",
    timestamp: new Date().toISOString()
  });
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
`;
}
