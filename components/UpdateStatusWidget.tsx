import React, { useEffect, useState } from 'react';
import { RefreshCw, Download, CheckCircle, AlertCircle } from 'lucide-react';

declare global {
  interface Window {
    electronAPI?: {
      getVersion: () => Promise<string>;
      checkForUpdates: () => Promise<any>;
      downloadUpdate: () => Promise<any>;
      quitAndInstall: () => void;
      onUpdateStatus: (callback: (status: any) => void) => () => void;
    };
  }
}

export const UpdateStatusWidget: React.FC = () => {
  const [appVersion, setAppVersion] = useState<string>('');
  const [status, setStatus] = useState<string>('idle');
  const [message, setMessage] = useState<string>('');
  const [downloadProgress, setDownloadProgress] = useState<number>(0);
  const [isElectron, setIsElectron] = useState<boolean>(false);

  useEffect(() => {
    if (window.electronAPI) {
      setIsElectron(true);
      window.electronAPI.getVersion().then((v) => setAppVersion(v));

      const unsubscribe = window.electronAPI.onUpdateStatus((data: any) => {
        setStatus(data.status);
        if (data.message) setMessage(data.message);
        if (data.percent !== undefined) setDownloadProgress(data.percent);
      });

      return () => {
        if (unsubscribe) unsubscribe();
      };
    }
  }, []);

  if (!isElectron) {
    return null; // Ocultar widget si se ejecuta en navegador web
  }

  const handleCheckUpdates = async () => {
    setStatus('checking');
    setMessage('Buscando actualizaciones...');
    try {
      await window.electronAPI?.checkForUpdates();
    } catch (e: any) {
      setStatus('error');
      setMessage(e.message || 'Error al buscar actualizaciones');
    }
  };

  const handleDownload = async () => {
    setStatus('downloading');
    try {
      await window.electronAPI?.downloadUpdate();
    } catch (e: any) {
      setStatus('error');
      setMessage(e.message || 'Error al iniciar descarga');
    }
  };

  const handleRestart = () => {
    window.electronAPI?.quitAndInstall();
  };

  return (
    <div className="p-3 bg-slate-900 text-white rounded-2xl border border-slate-800 text-xs shadow-lg flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="font-semibold text-slate-300">Versión Desktop: v{appVersion || '1.0.0'}</span>
        <button
          onClick={handleCheckUpdates}
          disabled={status === 'checking' || status === 'downloading'}
          className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition disabled:opacity-50"
          title="Comprobar actualizaciones"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${status === 'checking' ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {status === 'available' && (
        <div className="flex items-center justify-between gap-2 bg-indigo-950/60 border border-indigo-500/30 p-2 rounded-xl">
          <span className="text-[11px] text-indigo-200">{message}</span>
          <button
            onClick={handleDownload}
            className="flex items-center gap-1 bg-indigo-600 hover:bg-indigo-500 text-white px-2.5 py-1 rounded-lg font-bold text-[10px] transition shadow"
          >
            <Download className="w-3 h-3" /> Descargar
          </button>
        </div>
      )}

      {status === 'downloading' && (
        <div className="flex flex-col gap-1 bg-slate-800/80 p-2 rounded-xl">
          <div className="flex justify-between text-[10px] text-slate-400">
            <span>Descargando...</span>
            <span>{downloadProgress}%</span>
          </div>
          <div className="w-full bg-slate-700 h-1.5 rounded-full overflow-hidden">
            <div
              className="bg-indigo-500 h-full transition-all duration-300 rounded-full"
              style={{ width: `${downloadProgress}%` }}
            />
          </div>
        </div>
      )}

      {status === 'downloaded' && (
        <div className="flex items-center justify-between gap-2 bg-emerald-950/60 border border-emerald-500/30 p-2 rounded-xl">
          <div className="flex items-center gap-1 text-emerald-300 text-[11px]">
            <CheckCircle className="w-3.5 h-3.5" /> Lista para instalar
          </div>
          <button
            onClick={handleRestart}
            className="bg-emerald-600 hover:bg-emerald-500 text-white px-2.5 py-1 rounded-lg font-bold text-[10px] transition shadow"
          >
            Reiniciar
          </button>
        </div>
      )}

      {status === 'error' && (
        <div className="flex items-center gap-1.5 text-rose-400 bg-rose-950/40 border border-rose-500/20 p-2 rounded-xl text-[10px]">
          <AlertCircle className="w-3 h-3 shrink-0" />
          <span className="truncate">{message || 'Error de conexión'}</span>
        </div>
      )}
    </div>
  );
};
