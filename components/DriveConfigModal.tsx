import React, { useState, useEffect } from 'react';
import {
  DriveConfig,
  getDriveConfig,
  saveDriveConfig,
  extractDriveFolderId,
  testDriveWebhookHealth,
  getGoogleAppsScriptTemplate,
  buildDriveFolderUrl,
  syncDriveConfigWithServer
} from '../lib/googleDriveService';

interface DriveConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfigSaved?: (config: DriveConfig) => void;
}

export const DriveConfigModal: React.FC<DriveConfigModalProps> = ({
  isOpen,
  onClose,
  onConfigSaved
}) => {
  const [folderUrl, setFolderUrl] = useState('');
  const [folderName, setFolderName] = useState('');
  const [webhookUrl, setWebhookUrl] = useState('');
  const [autoUpload, setAutoUpload] = useState(true);

  const [activeTab, setActiveTab] = useState<'config' | 'guide'>('config');
  const [testingHealth, setTestingHealth] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [copiedScript, setCopiedScript] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    if (isOpen) {
      const cfg = getDriveConfig();
      setFolderUrl(cfg.folderUrl || (cfg.folderId ? `https://drive.google.com/drive/folders/${cfg.folderId}` : ''));
      setFolderName(cfg.folderName || 'Expedientes de Salida');
      setWebhookUrl(cfg.webhookUrl || '');
      setAutoUpload(cfg.autoUploadEnabled);
      setTestResult(null);
      setSaveSuccess(false);

      syncDriveConfigWithServer().then(serverCfg => {
        if (serverCfg && (serverCfg.webhookUrl || serverCfg.folderId)) {
          setFolderUrl(serverCfg.folderUrl || (serverCfg.folderId ? `https://drive.google.com/drive/folders/${serverCfg.folderId}` : ''));
          setFolderName(serverCfg.folderName || 'Expedientes de Salida');
          setWebhookUrl(serverCfg.webhookUrl || '');
          setAutoUpload(serverCfg.autoUploadEnabled);
        }
      });
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const detectedFolderId = extractDriveFolderId(folderUrl);

  const handleTestConnection = async () => {
    if (!webhookUrl.trim()) {
      setTestResult({ ok: false, message: 'Ingrese primero la URL del conector de Google Apps Script.' });
      return;
    }
    setTestingHealth(true);
    setTestResult(null);
    try {
      const res = await testDriveWebhookHealth(webhookUrl, detectedFolderId);
      setTestResult({ ok: res.ok, message: res.message });
    } catch (e: any) {
      setTestResult({ ok: false, message: e.message || 'Error de conexión' });
    } finally {
      setTestingHealth(false);
    }
  };

  const handleSave = () => {
    const saved = saveDriveConfig({
      folderUrl: folderUrl.trim(),
      folderId: detectedFolderId,
      folderName: folderName.trim() || 'Expedientes de Salida',
      webhookUrl: webhookUrl.trim(),
      autoUploadEnabled: autoUpload,
    });

    setSaveSuccess(true);
    if (onConfigSaved) onConfigSaved(saved);
    setTimeout(() => {
      onClose();
    }, 900);
  };

  const handleCopyScript = () => {
    const code = getGoogleAppsScriptTemplate();
    navigator.clipboard.writeText(code);
    setCopiedScript(true);
    setTimeout(() => setCopiedScript(false), 2500);
  };

  const openDriveFolder = () => {
    if (detectedFolderId || folderUrl) {
      window.open(buildDriveFolderUrl(detectedFolderId || folderUrl), '_blank');
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-2.5 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in zoom-in-95">
      <div className="bg-white rounded-2xl sm:rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-4 sm:px-8 py-3.5 sm:py-5 border-b flex justify-between items-center bg-slate-50 shrink-0">
          <div className="flex items-center gap-2.5 sm:gap-3">
            <div className="size-9 sm:size-11 rounded-xl sm:rounded-2xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center border border-emerald-500/20 shrink-0">
              <span className="material-symbols-outlined text-xl sm:text-2xl">add_to_drive</span>
            </div>
            <div>
              <h3 className="font-black text-slate-900 text-sm sm:text-lg uppercase tracking-tight">
                Almacenamiento en Google Drive
              </h3>
              <p className="text-[11px] sm:text-xs text-slate-500 font-medium">
                Ahorro de cuota en Supabase: guarda los archivos en Drive y el enlace en la BD.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="size-8 sm:size-9 rounded-xl hover:bg-slate-200 text-slate-400 hover:text-slate-600 flex items-center justify-center transition-colors shrink-0"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-slate-100 px-4 sm:px-8 bg-white gap-2 sm:gap-4 shrink-0 overflow-x-auto hide-scrollbar">
          <button
            onClick={() => setActiveTab('config')}
            className={`py-3 text-[11px] sm:text-xs font-black uppercase tracking-wider border-b-2 flex items-center gap-1.5 sm:gap-2 transition-all whitespace-nowrap ${
              activeTab === 'config'
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-slate-400 hover:text-slate-600'
            }`}
          >
            <span className="material-symbols-outlined text-sm sm:text-base">tune</span>
            Configurar Conexión
          </button>
          <button
            onClick={() => setActiveTab('guide')}
            className={`py-3 text-[11px] sm:text-xs font-black uppercase tracking-wider border-b-2 flex items-center gap-1.5 sm:gap-2 transition-all whitespace-nowrap ${
              activeTab === 'guide'
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-slate-400 hover:text-slate-600'
            }`}
          >
            <span className="material-symbols-outlined text-sm sm:text-base">integration_instructions</span>
            Guía del Conector
          </button>
        </div>

        {/* Content Body */}
        <div className="p-4 sm:p-8 flex flex-col gap-4 sm:gap-6 overflow-y-auto flex-1 bg-slate-50/50">
          {activeTab === 'config' ? (
            <>
              {/* Highlight Note */}
              <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 text-xs text-emerald-900 flex items-start gap-3">
                <span className="material-symbols-outlined text-emerald-600 text-xl shrink-0 mt-0.5">
                  cloud_done
                </span>
                <div className="flex-1">
                  <p className="font-bold text-emerald-950">Ahorro de Espacio Activo:</p>
                  <p className="text-[11px] text-emerald-800 mt-0.5 leading-relaxed">
                    Al adjuntar un PDF en Expedientes de Salida, el archivo se depositará en tu carpeta
                    específica de Google Drive institucional. En Supabase solo se resguarda el enlace web oficial,
                    manteniendo el almacenamiento de Supabase libre de archivos pesados.
                  </p>
                </div>
              </div>

              {/* Folder URL Input */}
              <div className="flex flex-col gap-2">
                <div className="flex justify-between items-center">
                  <span className="text-[11px] font-black text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-amber-500 text-sm">folder</span>
                    Enlace o ID de la Carpeta de Google Drive
                  </span>
                  {detectedFolderId && (
                    <button
                      type="button"
                      onClick={openDriveFolder}
                      className="text-[10px] font-black text-emerald-600 hover:text-emerald-800 flex items-center gap-1 hover:underline"
                    >
                      <span className="material-symbols-outlined text-[13px]">open_in_new</span>
                      Abrir en Google Drive
                    </button>
                  )}
                </div>
                <input
                  type="text"
                  value={folderUrl}
                  onChange={(e) => setFolderUrl(e.target.value)}
                  placeholder="https://drive.google.com/drive/folders/1ABCxyz987654321..."
                  className="h-12 px-4 rounded-xl border-2 border-slate-200 bg-white font-mono text-xs focus:border-emerald-500 outline-none transition-all"
                />
                <div className="flex justify-between items-center text-[10px]">
                  <span className="text-slate-400">
                    Pega aquí el enlace de tu carpeta de Drive (debe tener permisos de lectura/edición).
                  </span>
                  {detectedFolderId ? (
                    <span className="font-mono font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                      ID: {detectedFolderId}
                    </span>
                  ) : (
                    <span className="text-amber-500 font-bold">Sin carpeta asignada</span>
                  )}
                </div>
              </div>

              {/* Webhook URL Input */}
              <div className="flex flex-col gap-2">
                <div className="flex justify-between items-center">
                  <span className="text-[11px] font-black text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-indigo-500 text-sm">bolt</span>
                    URL del Conector / Webhook de Google Apps Script (Automático)
                  </span>
                  <button
                    type="button"
                    onClick={() => setActiveTab('guide')}
                    className="text-[10px] font-black text-indigo-600 hover:text-indigo-800 flex items-center gap-1 hover:underline"
                  >
                    ¿Cómo obtenerlo?
                  </button>
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={webhookUrl}
                    onChange={(e) => setWebhookUrl(e.target.value)}
                    placeholder="https://script.google.com/macros/s/AKfycb.../exec"
                    className="flex-1 h-12 px-4 rounded-xl border-2 border-slate-200 bg-white font-mono text-xs focus:border-emerald-500 outline-none transition-all"
                  />
                  <button
                    type="button"
                    onClick={handleTestConnection}
                    disabled={testingHealth || !webhookUrl.trim()}
                    className="px-4 h-12 bg-slate-900 hover:bg-black text-white text-xs font-black uppercase tracking-wider rounded-xl transition-all disabled:opacity-40 flex items-center gap-2 shrink-0"
                  >
                    <span className={`material-symbols-outlined text-sm ${testingHealth ? 'animate-spin' : ''}`}>
                      {testingHealth ? 'sync' : 'network_check'}
                    </span>
                    {testingHealth ? 'Probando...' : 'Probar'}
                  </button>
                </div>
                {testResult && (
                  <div
                    className={`p-3 rounded-xl text-xs font-medium flex items-center gap-2 ${
                      testResult.ok
                        ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                        : 'bg-rose-50 text-rose-800 border border-rose-200'
                    }`}
                  >
                    <span className="material-symbols-outlined text-sm">
                      {testResult.ok ? 'check_circle' : 'error'}
                    </span>
                    <span>{testResult.message}</span>
                  </div>
                )}
                <span className="text-[10px] text-slate-400">
                  Permite la subida automática con un clic al seleccionar cualquier PDF local.
                </span>
              </div>

              {/* Auto Upload Checkbox */}
              <label className="flex items-center gap-3 bg-white p-3.5 rounded-xl border border-slate-200 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={autoUpload}
                  onChange={(e) => setAutoUpload(e.target.checked)}
                  className="size-4 text-emerald-600 rounded focus:ring-emerald-500 cursor-pointer"
                />
                <div className="flex flex-col">
                  <span className="text-xs font-black text-slate-800 uppercase">
                    Subir automáticamente a Google Drive al registrar salida
                  </span>
                  <span className="text-[10px] text-slate-500">
                    Si está desmarcado o no hay webhook, el sistema te solicitará abrir la carpeta y pegar el enlace directo.
                  </span>
                </div>
              </label>
            </>
          ) : (
            /* Guide Tab */
            <div className="flex flex-col gap-5 text-slate-700 text-xs leading-relaxed">
              <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-4 text-indigo-950 flex items-start gap-3">
                <span className="material-symbols-outlined text-indigo-600 text-xl shrink-0 mt-0.5">
                  lightbulb
                </span>
                <div>
                  <p className="font-bold">¿Cómo funciona el Conector en Google Drive?</p>
                  <p className="text-[11px] text-indigo-800 mt-1">
                    Google Apps Script es un servicio nativo, gratuito y seguro provisto por Google.
                    Permite a tu cuenta de Admisión recibir PDFs y guardarlos automáticamente en tu carpeta
                    sin servidores adicionales ni costos de almacenamiento.
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-3">
                <h4 className="font-black text-slate-900 uppercase text-xs tracking-wider">
                  Pasos de configuración (Demora menos de 1 minuto):
                </h4>
                <ol className="list-decimal pl-5 space-y-2 text-slate-600 font-medium text-xs">
                  <li>
                    Abre{' '}
                    <a
                      href="https://script.google.com"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-emerald-600 font-bold underline hover:text-emerald-800"
                    >
                      script.google.com
                    </a>{' '}
                    con tu cuenta institucional de Google.
                  </li>
                  <li>
                    Haz clic en el botón <strong>"Nuevo proyecto"</strong> en la esquina superior izquierda.
                  </li>
                  <li>
                    Borra cualquier código existente en el editor, copia el código que aparece abajo y pégalo ahí.
                  </li>
                  <li>
                    Haz clic en el botón azul <strong>"Implementar"</strong> &gt; <strong>"Nueva implementación"</strong>.
                  </li>
                  <li>
                    En el ícono de engranaje (⚙️), selecciona <strong>"Aplicación web"</strong>.
                  </li>
                  <li>
                    Configura:
                    <ul className="list-disc pl-5 mt-1 space-y-1 text-slate-700">
                      <li><strong>Ejecutar como:</strong> Yo (tu cuenta)</li>
                      <li><strong>Quién tiene acceso:</strong> Cualquier usuario (Anyone)</li>
                    </ul>
                  </li>
                  <li>
                    Haz clic en <strong>"Implementar"</strong>, concede los permisos de Drive que te pida Google,
                    copia la <strong>URL de la aplicación web</strong> generada (termina en <code className="bg-slate-200 px-1 py-0.5 rounded font-mono text-[10px]">/exec</code>)
                    y pégala en la pestaña <strong>"Configurar Carpeta y Conexión"</strong>.
                  </li>
                </ol>
              </div>

              <div className="flex flex-col gap-2 mt-2">
                <div className="flex justify-between items-center">
                  <span className="text-[11px] font-black text-slate-900 uppercase">
                    Código Oficial del Conector:
                  </span>
                  <button
                    onClick={handleCopyScript}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-black text-[11px] uppercase tracking-wider flex items-center gap-1.5 transition-colors shadow-sm"
                  >
                    <span className="material-symbols-outlined text-sm">
                      {copiedScript ? 'check' : 'content_copy'}
                    </span>
                    {copiedScript ? '¡Copiado!' : 'Copiar Código'}
                  </button>
                </div>
                <pre className="bg-slate-900 text-emerald-400 p-4 rounded-2xl text-[11px] font-mono overflow-x-auto max-h-48 border border-slate-800">
                  {getGoogleAppsScriptTemplate()}
                </pre>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-4 sm:px-8 py-3.5 sm:py-5 bg-slate-50 border-t flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-2.5 sm:gap-3 shrink-0">
          <div>
            {saveSuccess && (
              <span className="text-xs font-bold text-emerald-600 flex items-center gap-1 animate-in fade-in">
                <span className="material-symbols-outlined text-sm">check_circle</span>
                Configuración guardada correctamente
              </span>
            )}
          </div>
          <div className="flex items-center justify-end gap-2 sm:gap-3">
            <button
              onClick={onClose}
              className="px-4 sm:px-6 py-2.5 text-xs font-black uppercase text-slate-400 hover:text-slate-600 transition-colors"
            >
              Cerrar
            </button>
            <button
              onClick={handleSave}
              className="flex-1 sm:flex-initial px-6 sm:px-8 py-2.5 sm:py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl sm:rounded-2xl text-xs font-black uppercase tracking-wider shadow-lg shadow-emerald-600/20 active:scale-95 transition-all text-center"
            >
              Guardar Configuración
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
