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
            .eq('ref_number', expedienteNumber);

          if (!outgoingError && outgoingData) {
            outgoingData.forEach((item: any) => {
              outgoingIds.push(item.id);
              timelineEvents.push({
                id: `out_${item.id}`,
                type: 'outgoing',
                date: new Date(item.created_at),
                title: `Salida: ${item.doc_type} ${item.doc_number}`,
                subtitle: `Destino: ${item.destination} | Asunto: ${item.subject}`,
                status: item.status,
                user: item.created_by,
                pdfUrl: item.pdf_url,
                docType: item.doc_type,
              });
            });
          }
        }

        if (outgoingFileId && !outgoingIds.includes(outgoingFileId)) {
            outgoingIds.push(outgoingFileId);
            // Also fetch the outgoing file details to show it in the timeline
            const { data: singleOutgoingData, error: singleOutgoingError } = await supabase
              .from('expedientes_salida')
              .select('*')
              .eq('id', outgoingFileId)
              .single();
              
            if (!singleOutgoingError && singleOutgoingData) {
                timelineEvents.push({
                    id: `out_${singleOutgoingData.id}`,
                    type: 'outgoing',
                    date: new Date(singleOutgoingData.created_at),
                    title: `Salida: ${singleOutgoingData.doc_type} ${singleOutgoingData.doc_number}`,
                    subtitle: `Destino: ${singleOutgoingData.destination} | Asunto: ${singleOutgoingData.subject}`,
                    status: singleOutgoingData.status,
                    user: singleOutgoingData.created_by,
                    pdfUrl: singleOutgoingData.pdf_url,
                    docType: singleOutgoingData.doc_type,
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
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded-md ${
                          event.type === 'incoming' ? 'bg-emerald-50 text-emerald-600' :
                          event.type === 'outgoing' ? 'bg-indigo-50 text-indigo-600' :
                          'bg-amber-50 text-amber-600'
                        }`}>
                          {event.type === 'incoming' ? 'Entrante' : event.type === 'outgoing' ? 'Salida' : 'Seguimiento'}
                        </span>
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
                        <a href={event.pdfUrl} target="_blank" rel="noopener noreferrer" className="text-[10px] font-black uppercase text-red-500 hover:text-red-600 flex items-center gap-1 transition-colors">
                          <span className="material-symbols-outlined text-[14px]">picture_as_pdf</span>
                          Ver Documento
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
