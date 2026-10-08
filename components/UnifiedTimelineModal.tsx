import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';

interface UnifiedTimelineEvent {
  id: string;
  type: 'incoming' | 'outgoing' | 'tracking';
  date: Date;
  title: string;
  subtitle?: string;
  status?: string;
  user?: string;
  pdfUrl?: string;
  docType?: string;
  isGenerated?: boolean;
  isAttachedManual?: boolean;
}

interface UnifiedTimelineModalProps {
  expedienteNumber?: string;
  outgoingFileId?: string;
  onClose: () => void;
}

export const UnifiedTimelineModal: React.FC<UnifiedTimelineModalProps> = ({ expedienteNumber, outgoingFileId, onClose }) => {
  const [events, setEvents] = useState<UnifiedTimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchTimeline = async () => {
      if ((!expedienteNumber || expedienteNumber === '-') && !outgoingFileId) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const timelineEvents: UnifiedTimelineEvent[] = [];
        let outgoingIds: string[] = [];

        if (expedienteNumber && expedienteNumber !== '-') {
          // 1. Fetch Incoming Files
          const { data: incomingData, error: incomingError } = await supabase
            .from('expedientes')
            .select('*')
            .eq('number', expedienteNumber);

          if (!incomingError && incomingData) {
            incomingData.forEach((item: any) => {
              timelineEvents.push({
                id: `in_${item.id}`,
                type: 'incoming',
                date: new Date(item.created_at),
                title: `Ingreso: ${item.subject}`,
                subtitle: `Remitente: ${item.sender}`,
                status: item.status,
                user: item.created_by,
                pdfUrl: item.pdf_url,
              });
            });
          }

          // 2. Fetch Outgoing Files
          const { data: outgoingData, error: outgoingError } = await supabase
            .from('expedientes_salida')
            .select('*')
            .or(`ref_number.eq.${expedienteNumber},destination.ilike.%"expediente_numero":"${expedienteNumber}"%`);

          if (!outgoingError && outgoingData) {
            // Resolver pdf_urls cruzados por doc_number si uno vino null
            const pdfByDocNum = new Map<string, string>();
            outgoingData.forEach((item: any) => {
              if (item.doc_number && item.pdf_url) {
                pdfByDocNum.set(item.doc_number, item.pdf_url);
              }
            });

            outgoingData.forEach((item: any) => {
              outgoingIds.push(item.id);

              let destText = item.destination || '-';
              let isGen = false;
              if (item.destination && item.destination.startsWith('{')) {
                try {
                  const meta = JSON.parse(item.destination);
                  destText = meta.estudiante_nombre ? `Estudiante: ${meta.estudiante_nombre}` : (meta.tipo_documento || 'Estudiante');
                  isGen = true;
                } catch (e) {}
              }
              if (item.doc_number && (item.doc_number.startsWith('UNSAAC-CONST-') || item.doc_number.startsWith('UNSAAC-INF-') || item.doc_type?.toLowerCase().includes('informe') || item.doc_type?.toLowerCase().includes('constancia'))) {
                isGen = true;
              }
              const effectivePdf = item.pdf_url || (item.doc_number ? pdfByDocNum.get(item.doc_number) : undefined);
              const hasPdf = Boolean(effectivePdf);
              const isAttachedManual = hasPdf && !isGen;

              timelineEvents.push({
                id: `out_${item.id}`,
                type: 'outgoing',
                date: new Date(item.created_at),
                title: `Salida: ${item.doc_type} ${item.doc_number}`,
                subtitle: `Destino: ${destText} | Asunto: ${item.subject}`,
                status: item.status,
                user: item.created_by,
                pdfUrl: effectivePdf,
                docType: item.doc_type,
                isGenerated: isGen,
                isAttachedManual
              });
            });
          }
        }

        if (outgoingFileId && !outgoingIds.includes(outgoingFileId)) {
            outgoingIds.push(outgoingFileId);
            const { data: singleOutgoingData, error: singleOutgoingError } = await supabase
              .from('expedientes_salida')
              .select('*')
              .eq('id', outgoingFileId)
              .single();
              
            if (!singleOutgoingError && singleOutgoingData) {
                let destText = singleOutgoingData.destination || '-';
                let isGen = false;
                if (singleOutgoingData.destination && singleOutgoingData.destination.startsWith('{')) {
                  try {
                    const meta = JSON.parse(singleOutgoingData.destination);
                    destText = meta.estudiante_nombre ? `Estudiante: ${meta.estudiante_nombre}` : (meta.tipo_documento || 'Estudiante');
                    isGen = true;
                  } catch (e) {}
                }
                if (singleOutgoingData.doc_number && (singleOutgoingData.doc_number.startsWith('UNSAAC-CONST-') || singleOutgoingData.doc_number.startsWith('UNSAAC-INF-') || singleOutgoingData.doc_type?.toLowerCase().includes('informe') || singleOutgoingData.doc_type?.toLowerCase().includes('constancia'))) {
                  isGen = true;
                }
                const hasPdf = Boolean(singleOutgoingData.pdf_url);
                const isAttachedManual = hasPdf && !isGen;

                timelineEvents.push({
                    id: `out_${singleOutgoingData.id}`,
                    type: 'outgoing',
                    date: new Date(singleOutgoingData.created_at),
                    title: `Salida: ${singleOutgoingData.doc_type} ${singleOutgoingData.doc_number}`,
                    subtitle: `Destino: ${destText} | Asunto: ${singleOutgoingData.subject}`,
                    status: singleOutgoingData.status,
                    user: singleOutgoingData.created_by,
                    pdfUrl: singleOutgoingData.pdf_url,
                    docType: singleOutgoingData.doc_type,
                    isGenerated: isGen,
                    isAttachedManual
                });
            }
        }

        // 3. Fetch Tracking Events (Seguimiento) for the outgoing files
        if (outgoingIds.length > 0) {
          const { data: trackingData, error: trackingError } = await supabase
            .from('tramite_seguimiento')
            .select('*')
            .in('expediente_id', outgoingIds);

          if (!trackingError && trackingData) {
            trackingData.forEach((item: any) => {
              timelineEvents.push({
                id: `trk_${item.id}`,
                type: 'tracking',
                date: new Date(item.created_at),
                title: `Seguimiento: ${item.action_type}`,
                subtitle: item.description,
                user: item.user_name,
              });
            });
          }
        }

        // Sort by date descending
        timelineEvents.sort((a, b) => b.date.getTime() - a.date.getTime());
        setEvents(timelineEvents);
      } catch (error) {
        console.error('Error fetching timeline:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchTimeline();
  }, [expedienteNumber, outgoingFileId]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in zoom-in-95">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="px-8 py-6 border-b flex justify-between items-center bg-slate-50 shrink-0">
          <div>
            <h3 className="font-black text-slate-900 uppercase tracking-tight text-xl">Historial del Expediente</h3>
            <p className="text-sm font-bold text-primary mt-1">
                {expedienteNumber && expedienteNumber !== '-' ? `Nº Exp: ${expedienteNumber}` : 'Historial de Salida'}
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <span className="material-symbols-outlined text-2xl">close</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-8 bg-slate-50/50">
          {loading ? (
            <div className="flex justify-center items-center h-40">
              <span className="material-symbols-outlined text-4xl text-primary animate-spin">progress_activity</span>
            </div>
          ) : events.length === 0 ? (
            <div className="text-center text-slate-400 font-bold py-10">No hay historial para este expediente.</div>
          ) : (
            <div>
              {/* BANNER DESTACADO SI HAY PDF GENERADO / ADJUNTO */}
              {(() => {
                const primaryPdfEvent = events.find(e => e.pdfUrl && e.type === 'outgoing') || events.find(e => e.pdfUrl);
                if (!primaryPdfEvent?.pdfUrl) return null;
                return (
                  <div className="mb-6 p-4 rounded-2xl bg-gradient-to-r from-emerald-50 to-teal-50 border-2 border-emerald-300 flex items-center justify-between shadow-sm">
                    <div className="flex items-center gap-3">
                      <div className="size-12 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-md shrink-0">
                        <span className="material-symbols-outlined text-2xl">picture_as_pdf</span>
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">
                            {primaryPdfEvent.isAttachedManual ? 'Documento Adjunto (Manual)' : 'Documento Oficial Generado (PDF)'}
                          </span>
                          <span className="text-xs font-bold text-slate-500">
                            {primaryPdfEvent.date.toLocaleDateString('es-PE')}
                          </span>
                        </div>
                        <h4 className="font-black text-slate-900 text-sm mt-0.5">{primaryPdfEvent.title}</h4>
                      </div>
                    </div>
                    <a
                      href={primaryPdfEvent.pdfUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black uppercase shadow-lg shadow-emerald-600/20 flex items-center gap-2 transition-all active:scale-95 shrink-0"
                    >
                      <span className="material-symbols-outlined text-base">open_in_new</span>
                      <span>ABRIR PDF GENERADO</span>
                    </a>
                  </div>
                );
              })()}

              <div className="relative border-l-2 border-slate-200 ml-4 space-y-8">
                {events.map((event, idx) => (
                  <div key={event.id} className="relative pl-8">
                    <div className={`absolute -left-[11px] top-1 size-5 rounded-full border-4 border-white shadow-sm flex items-center justify-center ${
                      event.type === 'incoming' ? 'bg-emerald-500' :
                      event.type === 'outgoing' ? 'bg-indigo-500' :
                      'bg-amber-500'
                    }`}>
                      <span className="material-symbols-outlined text-[10px] text-white font-bold">
                        {event.type === 'incoming' ? 'login' : event.type === 'outgoing' ? 'logout' : 'route'}
                      </span>
                    </div>
                    
                    <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 hover:shadow-md transition-shadow">
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded-md ${
                            event.type === 'incoming' ? 'bg-emerald-50 text-emerald-600' :
                            event.type === 'outgoing' ? 'bg-indigo-50 text-indigo-600' :
                            'bg-amber-50 text-amber-600'
                          }`}>
                            {event.type === 'incoming' ? 'Entrante' : event.type === 'outgoing' ? 'Salida' : 'Seguimiento'}
                          </span>
                          {event.isGenerated && (
                            <span className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-200">
                              Generado QR
                            </span>
                          )}
                          {event.isAttachedManual && (
                            <span className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200">
                              Adjunto Manual
                            </span>
                          )}
                          <span className="text-xs font-bold text-slate-400">
                            {event.date.toLocaleString('es-PE', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        {event.status && (
                          <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded-md ${
                            event.status === 'Finalizado' || event.status === 'Atendido' ? 'bg-emerald-100 text-emerald-700' :
                            event.status === 'Observado' ? 'bg-amber-100 text-amber-700' :
                            event.status === 'Archivado' ? 'bg-slate-200 text-slate-600' :
                            'bg-blue-100 text-blue-700'
                          }`}>
                            {event.status}
                          </span>
                        )}
                      </div>
                      
                      <h4 className="font-bold text-slate-800 text-sm mb-1">{event.title}</h4>
                      {event.subtitle && <p className="text-xs text-slate-600 leading-relaxed">{event.subtitle}</p>}
                      
                      <div className="mt-4 pt-3 border-t border-slate-50 flex items-center justify-between">
                        <div className="flex items-center gap-1 text-slate-400">
                          <span className="material-symbols-outlined text-[14px]">person</span>
                          <span className="text-[10px] font-bold uppercase">{event.user || 'Sistema'}</span>
                        </div>
                        {event.pdfUrl && (
                          <a 
                            href={event.pdfUrl} 
                            target="_blank" 
                            rel="noopener noreferrer" 
                            className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase flex items-center gap-1.5 transition-all shadow-sm ${
                              event.isAttachedManual 
                                ? 'bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300' 
                                : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/20'
                            }`}
                          >
                            <span className="material-symbols-outlined text-sm">picture_as_pdf</span>
                            <span>{event.isAttachedManual ? 'Ver PDF Adjunto (Manual)' : 'Ver PDF Generado Oficial'}</span>
                            <span className="material-symbols-outlined text-xs">open_in_new</span>
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
