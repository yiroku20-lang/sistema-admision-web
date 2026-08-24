import React, { useState } from 'react';
import { StudentDocument } from '../lib/fileGateway';

interface DocumentViewerModalProps {
  document: StudentDocument | null;
  streamUrl: string;
  onClose: () => void;
}

export const DocumentViewerModal: React.FC<DocumentViewerModalProps> = ({
  document,
  streamUrl,
  onClose
}) => {
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);

  if (!document) return null;

  const handleZoomIn = () => setZoom(prev => Math.min(prev + 0.25, 3));
  const handleZoomOut = () => setZoom(prev => Math.max(prev - 0.25, 0.5));
  const handleRotate = () => setRotation(prev => (prev + 90) % 360);
  const handleReset = () => {
    setZoom(1);
    setRotation(0);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-slate-900 text-white w-full max-w-5xl h-[88vh] rounded-2xl shadow-2xl border border-slate-700 flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
        
        {/* Modal Top Bar */}
        <div className="px-6 py-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className={`size-10 rounded-xl flex items-center justify-center shrink-0 ${
              document.isPdf 
                ? 'bg-red-500/20 text-red-400 border border-red-500/30' 
                : document.isImage 
                  ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' 
                  : 'bg-slate-800 text-slate-300'
            }`}>
              <span className="material-symbols-outlined text-[24px]">
                {document.icon || (document.isPdf ? 'picture_as_pdf' : document.isImage ? 'image' : 'description')}
              </span>
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-primary/20 text-primary border border-primary/30">
                  {document.categoryLabel}
                </span>
                {document.prefixCode && (
                  <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">
                    Prefijo: {document.prefixCode}
                  </span>
                )}
              </div>
              <h3 className="font-bold text-sm text-slate-100 truncate mt-0.5">
                {document.friendlyName}
              </h3>
              <p className="text-[11px] font-mono text-slate-400 truncate">
                {document.filename}
              </p>
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-2 shrink-0">
            {document.isImage && (
              <div className="flex items-center bg-slate-800 p-1 rounded-xl border border-slate-700 gap-1 mr-2">
                <button
                  type="button"
                  onClick={handleZoomOut}
                  title="Reducir zoom"
                  className="size-8 rounded-lg hover:bg-slate-700 text-slate-300 hover:text-white flex items-center justify-center transition-colors"
                >
                  <span className="material-symbols-outlined text-[18px]">zoom_out</span>
                </button>
                <span className="text-[11px] font-mono text-slate-300 px-1 font-bold">
                  {Math.round(zoom * 100)}%
                </span>
                <button
                  type="button"
                  onClick={handleZoomIn}
                  title="Aumentar zoom"
                  className="size-8 rounded-lg hover:bg-slate-700 text-slate-300 hover:text-white flex items-center justify-center transition-colors"
                >
                  <span className="material-symbols-outlined text-[18px]">zoom_in</span>
                </button>
                <button
                  type="button"
                  onClick={handleRotate}
                  title="Rotar 90°"
                  className="size-8 rounded-lg hover:bg-slate-700 text-slate-300 hover:text-white flex items-center justify-center transition-colors"
                >
                  <span className="material-symbols-outlined text-[18px]">rotate_right</span>
                </button>
                <button
                  type="button"
                  onClick={handleReset}
                  title="Restablecer"
                  className="size-8 rounded-lg hover:bg-slate-700 text-slate-300 hover:text-white flex items-center justify-center transition-colors"
                >
                  <span className="material-symbols-outlined text-[18px]">restart_alt</span>
                </button>
              </div>
            )}

            <a
              href={streamUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors border border-slate-700"
              title="Abrir en pestaña nueva"
            >
              <span className="material-symbols-outlined text-[16px]">open_in_new</span>
              <span className="hidden sm:inline">Nueva Pestaña</span>
            </a>

            <a
              href={streamUrl}
              download={document.filename}
              className="px-3 py-1.5 bg-primary hover:bg-merlot text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1.5 transition-all shadow-md shadow-primary/30"
              title="Descargar archivo"
            >
              <span className="material-symbols-outlined text-[16px]">download</span>
              <span className="hidden sm:inline">Descargar</span>
            </a>

            <button
              onClick={onClose}
              className="size-9 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-colors ml-1"
            >
              <span className="material-symbols-outlined text-[20px]">close</span>
            </button>
          </div>
        </div>

        {/* Modal Content Viewport */}
        <div className="flex-1 bg-slate-950 flex items-center justify-center overflow-auto p-4 relative select-none">
          {document.isPdf ? (
            <iframe
              src={`${streamUrl}#toolbar=1&navpanes=0`}
              title={document.friendlyName}
              className="w-full h-full rounded-xl border border-slate-800 bg-white"
            />
          ) : document.isImage ? (
            <div className="flex items-center justify-center w-full h-full overflow-auto">
              <img
                src={streamUrl}
                alt={document.friendlyName}
                style={{
                  transform: `scale(${zoom}) rotate(${rotation}deg)`,
                  transition: 'transform 0.2s ease-out'
                }}
                className="max-h-full max-w-full object-contain rounded-lg shadow-2xl"
              />
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center text-center p-8 bg-slate-900 rounded-2xl border border-slate-800 max-w-md">
              <span className="material-symbols-outlined text-6xl text-slate-500 mb-4">
                draft
              </span>
              <h4 className="text-base font-bold text-slate-200">
                Visualización no disponible directamente
              </h4>
              <p className="text-xs text-slate-400 mt-2 mb-6">
                Este tipo de archivo ({document.ext || 'Desconocido'}) debe ser abierto con una aplicación externa o descargado.
              </p>
              <a
                href={streamUrl}
                download={document.filename}
                className="px-6 py-3 bg-primary hover:bg-merlot text-white rounded-xl font-black text-xs uppercase tracking-widest flex items-center gap-2"
              >
                <span className="material-symbols-outlined text-[18px]">download</span>
                Descargar Documento
              </a>
            </div>
          )}
        </div>

      </div>
    </div>
  );
};
