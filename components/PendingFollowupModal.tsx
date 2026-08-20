import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

interface PendingFollowupModalProps {
  onClose: () => void;
}

interface FileWithTracking {
  id: string;
  doc_type: string;
  doc_number: string;
  ref_number: string;
  subject: string;
  destination: string;
  status: string;
  created_at: string;
  trackingEvents: any[];
}

export const PendingFollowupModal: React.FC<PendingFollowupModalProps> = ({ onClose }) => {
  const [data, setData] = useState<FileWithTracking[]>([]);
  const [loading, setLoading] = useState(true);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  
  const reportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchPendingFiles();
  }, []);

  const fetchPendingFiles = async () => {
    try {
      setLoading(true);
      // Fetch all Pending outgoing files
      const { data: filesData, error: filesError } = await supabase
        .from('expedientes_salida')
        .select('*')
        .eq('status', 'Pendiente')
        .order('created_at', { ascending: false });

      if (filesError) throw filesError;

      if (!filesData || filesData.length === 0) {
        setData([]);
        return;
      }

      const fileIds = filesData.map(f => f.id);

      // Fetch tracking events for these files
      const { data: trackingData, error: trackingError } = await supabase
        .from('tramite_seguimiento')
        .select('*')
        .in('expediente_id', fileIds)
        .order('created_at', { ascending: true }); // chronological order

      if (trackingError) throw trackingError;

      const trackingMap = new Map<string, any[]>();
      if (trackingData) {
        trackingData.forEach(t => {
          if (!trackingMap.has(t.expediente_id)) {
            trackingMap.set(t.expediente_id, []);
          }
          trackingMap.get(t.expediente_id)!.push(t);
        });
      }

      const combined: FileWithTracking[] = filesData.map(f => ({
        ...f,
        trackingEvents: trackingMap.get(f.id) || []
      }));

      setData(combined);
    } catch (err: any) {
      console.error(err);
      alert('Error fetching pending files: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const calculateDaysAgo = (dateStr: string) => {
    const today = new Date();
    const date = new Date(dateStr);
    const diffTime = Math.abs(today.getTime() - date.getTime());
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  const handleExportPDF = async () => {
    if (!reportRef.current) return;
    setGeneratingPdf(true);
    try {
      const pdf = new jsPDF('l', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      
      const margin = 10;
      let currentY = margin;
      
      const headerEl = reportRef.current.querySelector('.report-header') as HTMLElement;
      if (headerEl) {
        const headerCanvas = await html2canvas(headerEl, { scale: 2, useCORS: true, logging: false });
        const headerImgData = headerCanvas.toDataURL('image/png');
        const headerHeight = (headerCanvas.height * (pdfWidth - margin * 2)) / headerCanvas.width;
        pdf.addImage(headerImgData, 'PNG', margin, currentY, pdfWidth - margin * 2, headerHeight);
        currentY += headerHeight + 10;
      }

      const items = reportRef.current.querySelectorAll('.report-item');
      
      for (let i = 0; i < items.length; i++) {
        const item = items[i] as HTMLElement;
        const itemCanvas = await html2canvas(item, { scale: 2, useCORS: true, logging: false, backgroundColor: '#ffffff' });
        const itemImgData = itemCanvas.toDataURL('image/png');
        const itemHeight = (itemCanvas.height * (pdfWidth - margin * 2)) / itemCanvas.width;
        
        if (currentY + itemHeight > pdfHeight - margin) {
          pdf.addPage();
          currentY = margin;
        }
        
        pdf.addImage(itemImgData, 'PNG', margin, currentY, pdfWidth - margin * 2, itemHeight);
        currentY += itemHeight + 5; // Spacing
      }
      
      pdf.save(`Reporte_Pendientes_Seguimiento_${new Date().toISOString().split('T')[0]}.pdf`);
    } catch (err: any) {
      alert("Error al generar PDF: " + err.message);
    } finally {
      setGeneratingPdf(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in zoom-in-95">
      <div className="bg-slate-50 rounded-3xl shadow-2xl w-full max-w-5xl overflow-hidden flex flex-col h-[90vh]">
        {/* Header */}
        <div className="px-8 py-6 border-b flex justify-between items-center bg-white shrink-0">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-amber-100 text-amber-700 rounded-full flex items-center justify-center">
              <span className="material-symbols-outlined text-2xl">pending_actions</span>
            </div>
            <div>
              <h3 className="font-black text-xl text-slate-900 uppercase tracking-tight">Reporte de Pendientes</h3>
              <p className="text-xs font-bold text-slate-500">
                {data.length} expedientes esperando atención
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <button 
              onClick={handleExportPDF}
              disabled={generatingPdf || loading || data.length === 0}
              className="flex items-center gap-2 px-6 py-3 bg-red-50 text-red-700 hover:bg-red-100 rounded-xl text-xs font-black uppercase transition-colors disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-[18px]">picture_as_pdf</span>
              {generatingPdf ? 'Generando...' : 'Exportar PDF'}
            </button>
            <button onClick={onClose} className="p-3 text-slate-400 hover:bg-slate-100 rounded-xl transition-colors">
              <span className="material-symbols-outlined">close</span>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-8 overflow-auto flex-1 hide-scrollbar">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-64 text-slate-400">
              <span className="material-symbols-outlined text-4xl animate-spin mb-4">progress_activity</span>
              <p className="font-bold">Cargando reporte...</p>
            </div>
          ) : data.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-slate-400 bg-white rounded-3xl border border-slate-200">
              <span className="material-symbols-outlined text-4xl mb-4">check_circle</span>
              <p className="font-bold">No hay expedientes pendientes.</p>
            </div>
          ) : (
            <div ref={reportRef} className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm flex flex-col gap-8 min-w-[900px]">
              {/* Report Header for PDF */}
              <div className="report-header text-center pb-6 border-b border-slate-100 bg-white">
                <h1 className="text-2xl font-black text-slate-900 uppercase">Estado de Expedientes Pendientes</h1>
                <p className="text-sm font-bold text-slate-500 mt-2">
                  Generado el: {new Date().toLocaleString('es-PE')}
                </p>
              </div>

              {/* List of pending files */}
              <div className="flex flex-col gap-4 w-full">
                {data.map((file) => {
                  const daysPending = calculateDaysAgo(file.created_at);
                  
                  return (
                    <div key={file.id} className="report-item bg-white flex flex-row gap-4 p-4 border border-slate-200 rounded-xl w-full">
                      {/* Left: Document Details */}
                      <div className="flex-[0.8] flex flex-col gap-1.5 pr-4 border-r border-slate-100 min-w-[260px]">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-black text-slate-900">{file.doc_type} {file.doc_number}</span>
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase ${
                              daysPending > 15 ? 'bg-red-100 text-red-700' :
                              daysPending > 5 ? 'bg-amber-100 text-amber-700' :
                              'bg-emerald-100 text-emerald-700'
                          }`}>
                              Hace {daysPending} d
                          </span>
                        </div>
                        
                        {file.ref_number && file.ref_number !== '-' && (
                            <div className="flex items-center gap-1.5">
                              <span className="text-[9px] text-slate-400 font-bold uppercase tracking-widest bg-slate-50 px-1 rounded border border-slate-100">Exp</span>
                              <span className="font-black text-slate-800 text-xs">{file.ref_number}</span>
                            </div>
                        )}

                        <p className="text-xs text-slate-700 font-medium leading-tight mt-1">{file.subject}</p>
                        
                        {file.destination && file.destination !== '-' && (
                          <div className="mt-auto pt-2 text-[10px] font-bold uppercase text-slate-400">
                            Destino: <span className="text-slate-700">{file.destination}</span>
                          </div>
                        )}
                      </div>

                      {/* Right: Tracking Timeline */}
                      <div className="flex-[1.2] flex flex-col justify-start relative w-full">
                        {file.trackingEvents.length === 0 ? (
                          <div className="py-1 text-xs text-slate-400 font-bold italic">
                            Sin seguimientos registrados.
                          </div>
                        ) : (
                          <div className="flex flex-col gap-3 border-l-2 border-slate-100 ml-1 pl-4 relative my-1">
                            {file.trackingEvents.map((event, idx) => (
                              <div key={event.id} className="relative">
                                <div className="absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full bg-indigo-200 border-2 border-white"></div>
                                <div className="flex flex-col">
                                  <div className="flex items-center gap-2 mb-0.5">
                                    <span className="text-[10px] font-black text-slate-500">
                                      {new Date(event.created_at).toLocaleDateString('es-PE')}
                                    </span>
                                    <span className="text-[9px] font-bold text-slate-500 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100">
                                      {event.user_name}
                                    </span>
                                  </div>
                                  <p className="text-xs font-medium text-slate-700 leading-snug bg-slate-50 px-2.5 py-1.5 rounded-lg border border-slate-100 text-pretty">
                                    {event.description}
                                  </p>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
