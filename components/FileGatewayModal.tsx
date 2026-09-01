import React, { useState, useEffect } from 'react';
import { 
  getGatewayBaseUrl, 
  setGatewayBaseUrl, 
  testGatewayHealth, 
  isElectronApp, 
  DEFAULT_ELECTRON_GATEWAY, 
  DEFAULT_WEB_FALLBACK,
  GatewayHealthResult 
} from '../lib/fileGateway';

interface FileGatewayModalProps {
  isOpen: boolean;
  onClose: () => void;
  onGatewayUpdated?: (newUrl: string) => void;
}

export const FileGatewayModal: React.FC<FileGatewayModalProps> = ({
  isOpen,
  onClose,
  onGatewayUpdated
}) => {
  const [urlInput, setUrlInput] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<GatewayHealthResult | null>(null);
  const [isElectron, setIsElectron] = useState(false);

  useEffect(() => {
    if (isOpen) {
      const currentUrl = getGatewayBaseUrl();
      setUrlInput(currentUrl);
      setIsElectron(isElectronApp());
      setTestResult(null);
      
      // Auto test current connection upon opening
      testCurrentUrl(currentUrl);
    }
  }, [isOpen]);

  const testCurrentUrl = async (targetUrl: string) => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await testGatewayHealth(targetUrl);
      setTestResult(res);
    } catch (err: any) {
      setTestResult({
        ok: false,
        error: err.message || 'Error al conectar',
        url: targetUrl
      });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = () => {
    const cleanUrl = setGatewayBaseUrl(urlInput);
    if (onGatewayUpdated) {
      onGatewayUpdated(cleanUrl);
    }
    onClose();
  };

  const handleApplyPreset = (preset: string) => {
    setUrlInput(preset);
    testCurrentUrl(preset);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
        
        {/* Modal Header */}
        <div className="bg-slate-900 text-white px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-xl bg-primary/20 flex items-center justify-center text-primary-300 border border-primary/40">
              <span className="material-symbols-outlined text-[24px]">dns</span>
            </div>
            <div>
              <h3 className="font-black text-base uppercase tracking-wider">Puerta de Enlace / Servidor de Archivos</h3>
              <p className="text-slate-400 text-xs font-medium mt-0.5">Configuración de acceso al repositorio físico (H:)</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="size-8 rounded-lg bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white flex items-center justify-center transition-colors"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 flex flex-col gap-5 overflow-y-auto max-h-[80vh]">
          
          {/* Environment Badge */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200">
            <div className="flex items-center gap-2.5">
              <span className="material-symbols-outlined text-slate-500 text-[20px]">
                {isElectron ? 'desktop_windows' : 'language'}
              </span>
              <div>
                <p className="text-xs font-bold text-slate-800">
                  Entorno de Ejecución: <span className="text-primary font-black uppercase">{isElectron ? 'App de Escritorio (Electron)' : 'Navegador Web'}</span>
                </p>
                <p className="text-[11px] text-slate-500">
                  {isElectron 
                    ? 'El backend Express local en localhost:5000 se detecta y enlaza de forma automática.' 
                    : 'Configure la IP o URL institucional donde se hospeda el servicio de expedientes.'}
                </p>
              </div>
            </div>
            <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${isElectron ? 'bg-indigo-50 text-indigo-700 border border-indigo-200' : 'bg-blue-50 text-blue-700 border border-blue-200'}`}>
              {isElectron ? 'Desktop' : 'Web App'}
            </span>
          </div>

          {/* URL Input */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-black uppercase tracking-widest text-slate-700">
              Dirección URL / IP del Servidor de Archivos
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <span className="material-symbols-outlined absolute left-3 top-3 text-slate-400 text-[20px]">
                  link
                </span>
                <input
                  type="text"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  placeholder="ej. http://localhost:5000 o http://192.168.1.50:5000"
                  className="w-full h-11 pl-10 pr-4 rounded-xl border border-slate-300 bg-slate-50 text-slate-900 text-sm font-mono focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
                />
              </div>
              <button
                type="button"
                onClick={() => testCurrentUrl(urlInput)}
                disabled={testing || !urlInput.trim()}
                className="px-4 h-11 bg-slate-800 hover:bg-slate-900 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shrink-0"
              >
                {testing ? (
                  <>
                    <span className="material-symbols-outlined text-[16px] animate-spin">sync</span>
                    <span>Probando...</span>
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-[16px]">network_check</span>
                    <span>Probar</span>
                  </>
                )}
              </button>
            </div>
            <p className="text-[11px] text-slate-500">
              Se utiliza para invocar los endpoints <code className="bg-slate-100 px-1 py-0.5 rounded text-slate-700">/api/files/student-documents/:dni</code> y <code className="bg-slate-100 px-1 py-0.5 rounded text-slate-700">/api/files/stream-document</code>.
            </p>
          </div>

          {/* Quick Presets */}
          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Accesos Rápidos / Presets</span>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => handleApplyPreset(DEFAULT_ELECTRON_GATEWAY)}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors"
              >
                <span className="material-symbols-outlined text-[14px]">computer</span>
                Localhost (Puerto 5000)
              </button>
              <button
                type="button"
                onClick={() => handleApplyPreset('http://10.10.16.214:5000')}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors"
              >
                <span className="material-symbols-outlined text-[14px]">router</span>
                Servidor Oficina (10.10.16.214)
              </button>
              <button
                type="button"
                onClick={() => handleApplyPreset(DEFAULT_WEB_FALLBACK)}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors"
              >
                <span className="material-symbols-outlined text-[14px]">restart_alt</span>
                Restablecer Predeterminado
              </button>
            </div>
          </div>

          {/* Live Status Result */}
          {testResult && (
            <div className={`p-4 rounded-xl border transition-all ${testResult.ok ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-red-50 border-red-200 text-red-900'}`}>
              <div className="flex items-center gap-2.5">
                <span className={`material-symbols-outlined text-[22px] ${testResult.ok ? 'text-emerald-600' : 'text-red-600'}`}>
                  {testResult.ok ? 'check_circle' : 'error'}
                </span>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-black uppercase tracking-wider">
                      {testResult.ok ? 'Servidor de Archivos Conectado' : 'Fallo de Conexión al Servidor'}
                    </p>
                    {testResult.latency !== undefined && (
                      <span className="text-[10px] font-mono font-bold bg-white/80 px-2 py-0.5 rounded border border-emerald-200">
                        {testResult.latency} ms
                      </span>
                    )}
                  </div>
                  <p className="text-xs mt-1 text-slate-600 font-medium">
                    {testResult.ok 
                      ? `Conexión establecida exitosamente con ${testResult.url}. Los documentos físicos y expedientes responderán con normalidad.` 
                      : (testResult.error || 'No se pudo recibir respuesta del servidor. Compruebe que el servicio de archivos esté ejecutándose en la red local o puerto 5000.')}
                  </p>
                </div>
              </div>
            </div>
          )}

        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-slate-600 hover:bg-slate-200 rounded-xl text-xs font-bold uppercase tracking-wider transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="px-6 py-2.5 bg-primary hover:bg-merlot text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-lg shadow-primary/20 transition-all active:scale-95 flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-[18px]">save</span>
            Guardar y Aplicar
          </button>
        </div>

      </div>
    </div>
  );
};
