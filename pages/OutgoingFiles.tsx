
import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';
import { OutgoingFile, User, TrackingEvent } from '../types';
import Papa from 'papaparse';
import { UnifiedTimelineModal } from '../components/UnifiedTimelineModal';
import { PendingFollowupModal } from '../components/PendingFollowupModal';

interface GroupedOutgoingFile extends OutgoingFile {
  count: number;
  history: OutgoingFile[];
}

export const OutgoingFiles: React.FC<{ user: User }> = ({ user }) => {
  const [files, setFiles] = useState<GroupedOutgoingFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const [unifiedTimelineExpediente, setUnifiedTimelineExpediente] = useState<{refNumber?: string, outgoingFileId?: string} | null>(null);

  const [docType, setDocType] = useState('Oficio');
  const [docNumber, setDocNumber] = useState('');
  const [refNumber, setRefNumber] = useState('');
  const [subject, setSubject] = useState('');
  const [destination, setDestination] = useState('');
  const [status, setStatus] = useState<'Pendiente' | 'Finalizado' | 'Observado' | 'Archivado'>('Pendiente');
  const [destinationSuggestions, setDestinationSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [driveUrl, setDriveUrl] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);

  const [isTrackingModalOpen, setIsTrackingModalOpen] = useState(false);
  const [trackingEvents, setTrackingEvents] = useState<TrackingEvent[]>([]);
  const [trackingNote, setTrackingNote] = useState('');
  const [selectedTrackingFile, setSelectedTrackingFile] = useState<OutgoingFile | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [currentFilter, setCurrentFilter] = useState('Todos');
  const [isPendingReportOpen, setIsPendingReportOpen] = useState(false);

  useEffect(() => {
    fetchFiles();
  }, [currentFilter, searchQuery]);

  const fetchFiles = async () => {
    try {
      setLoading(true);
      let query = supabase.from('expedientes_salida').select('*');
      if (currentFilter !== 'Todos') query = query.eq('status', currentFilter);
      if (searchQuery.trim()) query = query.or(`doc_number.ilike.%${searchQuery.trim()}%,subject.ilike.%${searchQuery.trim()}%,ref_number.ilike.%${searchQuery.trim()}%`);
      const { data } = await query.order('created_at', { ascending: false });
      if (data) {
        const groupedMap = new Map<string, GroupedOutgoingFile>();

        data.forEach((item: any) => {
            const currentFile: OutgoingFile = {
                id: item.id,
                docType: item.doc_type,
                docNumber: item.doc_number,
                refNumber: item.ref_number || '-',
                subject: item.subject,
                destination: item.destination || '-',
                status: item.status || 'Pendiente',
                pdfUrl: item.pdf_url,
                dateTime: new Date(item.created_at).toLocaleString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
            };

            const groupKey = currentFile.refNumber !== '-' ? currentFile.refNumber : currentFile.id;

            if (groupedMap.has(groupKey)) {
                const existing = groupedMap.get(groupKey)!;
                existing.count += 1;
                existing.history.push(currentFile);
            } else {
                groupedMap.set(groupKey, {
                    ...currentFile,
                    count: 1,
                    history: [currentFile]
                });
            }
        });

        setFiles(Array.from(groupedMap.values()));
        
        const uniqueDestinations = Array.from(new Set(data.map((item: any) => item.destination).filter(Boolean))) as string[];
        setDestinationSuggestions(uniqueDestinations);
      }
    } catch (err) { console.error(err); } finally { setLoading(false); }
  };

  const handleSave = async () => {
      if (!docNumber.trim() || !subject.trim()) return;
      setIsSubmitting(true);
      try {
          let publicUrl = driveUrl.trim();
          
          if (selectedFile) {
              const sanitizedName = selectedFile.name.replace(/[^a-zA-Z0-9.]/g, '_');
              const fileName = `${Date.now()}-${sanitizedName}`;
              const { error: uploadError } = await supabase.storage
                  .from('documentos')
                  .upload(`salidas/${fileName}`, selectedFile, {
                      contentType: 'application/pdf',
                      upsert: true
                  });

              if (uploadError) throw uploadError;

              const { data: urlData } = supabase.storage
                  .from('documentos')
                  .getPublicUrl(`salidas/${fileName}`);
              publicUrl = urlData.publicUrl;
          }

          if (editingId) {
              const { error } = await supabase.from('expedientes_salida').update({
                  doc_type: docType,
                  doc_number: docNumber.trim(),
                  ref_number: refNumber.trim(),
                  subject: subject.trim().toUpperCase(),
                  destination: destination.trim().toUpperCase(),
                  status: status,
                  pdf_url: publicUrl || undefined // Only update if a new one was provided, otherwise keep existing (handled by DB if we don't pass it, but here we pass publicUrl which might be empty string if not changed. Wait, if driveUrl is empty and no file, publicUrl is empty. Let's handle this better.)
              }).eq('id', editingId);
              if (error) throw error;
          } else {
              const { error } = await supabase.from('expedientes_salida').insert([{
                  doc_type: docType,
                  doc_number: docNumber.trim(),
                  ref_number: refNumber.trim(),
                  subject: subject.trim().toUpperCase(),
                  destination: destination.trim().toUpperCase(),
                  status: status,
                  pdf_url: publicUrl,
                  created_by: user.id
              }]);
              if (error) throw error;
          }
          
          fetchFiles(); 
          closeModal();
      } catch (err: any) { alert(err.message); } finally { setIsSubmitting(false); }
  };

  const handleEdit = (file: any) => {
      setEditingId(file.id);
      setDocType(file.docType);
      setDocNumber(file.docNumber);
      setRefNumber(file.refNumber === '-' ? '' : file.refNumber);
      setSubject(file.subject);
      setDestination(file.destination === '-' ? '' : file.destination);
      setStatus(file.status || 'Pendiente');
      setDriveUrl(file.pdfUrl || '');
      setSelectedFile(null);
      setIsModalOpen(true);
  };

  const handleDelete = async (id: string) => {
      if (!window.confirm('¿Está seguro de eliminar este registro?')) return;
      try {
          const { error } = await supabase.from('expedientes_salida').delete().eq('id', id);
          if (error) throw error;
          fetchFiles();
      } catch (err: any) {
          alert(err.message);
      }
  };

  const handleImportCSV = () => {
      if (!csvFile) return;
      setIsSubmitting(true);
      
      Papa.parse(csvFile, {
          header: true,
          skipEmptyLines: true,
          complete: async (results) => {
              try {
                  const recordsToInsert = results.data.map((row: any) => {
                      // Map CSV headers to DB columns
                      // Expected headers: TIPO, DOCUMENTO, EXPEDIENTE, DESTINO, ASUNTO, ESTADO, FECHA, ENLACE
                      
                      // Handle optional date parsing if provided
                      let createdAt = new Date().toISOString();
                      if (row.FECHA) {
                          // Extract just the date part if it contains time (e.g., "5/01/2026 12:39:30" -> "5/01/2026")
                          const dateOnly = row.FECHA.split(' ')[0];
                          
                          // Try to parse DD/MM/YYYY or YYYY-MM-DD
                          const parts = dateOnly.split('/');
                          if (parts.length === 3) {
                              // Assuming DD/MM/YYYY
                              // Pad day and month with leading zeros if necessary
                              const day = parts[0].padStart(2, '0');
                              const month = parts[1].padStart(2, '0');
                              const year = parts[2];
                              
                              // Create a valid ISO string date
                              const d = new Date(`${year}-${month}-${day}T12:00:00Z`);
                              if (!isNaN(d.getTime())) {
                                  createdAt = d.toISOString();
                              }
                          } else {
                              const d = new Date(dateOnly);
                              if (!isNaN(d.getTime())) {
                                  createdAt = d.toISOString();
                              }
                          }
                      }

                      let status = 'Pendiente';
                      if (row.ESTADO) {
                          const s = row.ESTADO.toUpperCase();
                          if (s.includes('FINALIZADO')) status = 'Finalizado';
                          else if (s.includes('OBSERVADO')) status = 'Observado';
                          else if (s.includes('ARCHIVADO')) status = 'Archivado';
                      }

                      return {
                          doc_type: row.TIPO || 'Oficio',
                          doc_number: row.DOCUMENTO || '',
                          ref_number: row.EXPEDIENTE || '',
                          destination: (row.DESTINO || '').toUpperCase(),
                          subject: (row.ASUNTO || '').toUpperCase(),
                          status: status,
                          pdf_url: row.ENLACE ? row.ENLACE.trim() : '',
                          created_at: createdAt
                      };
                  });

                  // Filter out empty rows
                  const validRecords = recordsToInsert.filter(r => r.doc_number && r.subject).map(r => ({ ...r, created_by: user.id }));

                  if (validRecords.length === 0) {
                      throw new Error("No se encontraron registros válidos en el CSV. Verifique los encabezados.");
                  }

                  const { error } = await supabase.from('expedientes_salida').insert(validRecords);
                  if (error) throw error;

                  alert(`Se importaron ${validRecords.length} registros correctamente.`);
                  setIsImportModalOpen(false);
                  setCsvFile(null);
                  fetchFiles();
              } catch (err: any) {
                  alert(`Error al importar: ${err.message}`);
              } finally {
                  setIsSubmitting(false);
              }
          },
          error: (error) => {
              alert(`Error al leer CSV: ${error.message}`);
              setIsSubmitting(false);
          }
      });
  };

  const closeModal = () => {
      setIsModalOpen(false); setEditingId(null); setDocNumber(''); setRefNumber(''); setSubject(''); setDestination(''); setStatus('Pendiente'); setDriveUrl(''); setSelectedFile(null);
  };

  const handleOpenUnifiedTimeline = (file: OutgoingFile) => {
      setUnifiedTimelineExpediente({
          refNumber: file.refNumber,
          outgoingFileId: file.id
      });
  };

  const handleOpenTracking = async (file: OutgoingFile) => {
      setSelectedTrackingFile(file);
      setIsTrackingModalOpen(true);
      setTrackingEvents([]);
      try {
          const { data, error } = await supabase
              .from('tramite_seguimiento')
              .select('*')
              .eq('expediente_id', file.id)
              .order('created_at', { ascending: false });
          if (error) throw error;
          if (data) setTrackingEvents(data);
      } catch (err: any) {
          console.error('Error fetching tracking events:', err.message);
      }
  };

  const handleAddTrackingNote = async () => {
      if (!trackingNote.trim() || !selectedTrackingFile) return;
      setIsSubmitting(true);
      try {
          const newEvent = {
              expediente_id: selectedTrackingFile.id,
              action_type: 'Nota',
              description: trackingNote.trim(),
              user_name: user.name
          };
          const { error } = await supabase.from('tramite_seguimiento').insert([newEvent]);
          if (error) throw error;
          
          setTrackingNote('');
          // Refresh tracking events
          handleOpenTracking(selectedTrackingFile);
      } catch (err: any) {
          alert('Error al agregar nota: ' + err.message);
      } finally {
          setIsSubmitting(false);
      }
  };

  const handleQuickStatusChange = async (fileId: string, newStatus: string) => {
      // Optimistic UI update to prevent table reload/flicker
      setFiles(prev => prev.map(f => f.id === fileId ? { ...f, status: newStatus as any } : f));
      
      try {
          const { error } = await supabase.from('expedientes_salida').update({ status: newStatus }).eq('id', fileId);
          if (error) throw error;
          
          // Add tracking event for status change
          await supabase.from('tramite_seguimiento').insert([{
              expediente_id: fileId,
              action_type: 'Estado',
              description: `Estado actualizado a ${newStatus}`,
              user_name: user.name
          }]);
          
          // No need to call fetchFiles() since we updated the local state optimistically
      } catch (err: any) {
          // Revert on error by fetching the real data
          fetchFiles();
          alert(`Error al actualizar estado: ${err.message}`);
      }
  };

  return (
    <div className="flex flex-col gap-6 w-full p-6 md:p-8 h-full overflow-hidden max-w-[1400px] mx-auto">
      
      {isModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in zoom-in-95">
              <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col">
                  <div className="px-8 py-6 border-b flex justify-between items-center bg-slate-50">
                      <h3 className="font-black text-slate-900 uppercase tracking-tight">{editingId ? 'EDITAR SALIDA' : 'REGISTRAR SALIDA'}</h3>
                      <button onClick={closeModal} className="text-slate-400 hover:text-slate-600"><span className="material-symbols-outlined">close</span></button>
                  </div>
                  <div className="p-8 flex flex-col gap-5 overflow-y-auto max-h-[70vh]">
                      <div className="grid grid-cols-2 gap-4">
                          <label className="flex flex-col gap-1">
                              <span className="text-[10px] font-black text-slate-500 uppercase">Tipo</span>
                              <select value={docType} onChange={e => setDocType(e.target.value)} className="h-12 px-3 rounded-xl border-2 border-slate-100 bg-slate-50 text-sm font-bold"><option>Oficio</option><option>Informe</option><option>Circular</option><option>Carta</option><option>Proveido</option></select>
                          </label>
                          <label className="flex flex-col gap-1">
                              <span className="text-[10px] font-black text-slate-500 uppercase">Nº Documento</span>
                              <input value={docNumber} onChange={e => setDocNumber(e.target.value)} className="h-12 px-4 rounded-xl border-2 border-slate-100 bg-slate-50 font-bold text-sm" placeholder="Ej: 015-2024" />
                          </label>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                          <label className="flex flex-col gap-1">
                              <span className="text-[10px] font-black text-slate-500 uppercase">Nº Expediente</span>
                              <input value={refNumber} onChange={e => setRefNumber(e.target.value)} className="h-12 px-4 rounded-xl border-2 border-slate-100 bg-slate-50 text-sm font-bold" placeholder="Ej: 202412345" />
                          </label>
                          <label className="flex flex-col gap-1">
                              <span className="text-[10px] font-black text-slate-500 uppercase">Estado</span>
                              <select value={status} onChange={e => setStatus(e.target.value as any)} className="h-12 px-3 rounded-xl border-2 border-slate-100 bg-slate-50 text-sm font-bold">
                                  <option value="Pendiente">Pendiente</option>
                                  <option value="Finalizado">Finalizado</option>
                                  <option value="Observado">Observado</option>
                                  <option value="Archivado">Archivado</option>
                              </select>
                          </label>
                      </div>
                      <div className="relative flex flex-col gap-1">
                          <span className="text-[10px] font-black text-slate-500 uppercase">Destino</span>
                          <input 
                              value={destination} 
                              onChange={e => {
                                  setDestination(e.target.value.toUpperCase());
                                  setShowSuggestions(true);
                              }} 
                              onFocus={() => setShowSuggestions(true)}
                              onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                              className="h-12 px-4 rounded-xl border-2 border-slate-100 bg-slate-50 text-sm font-bold" 
                              placeholder="Oficina de destino..." 
                          />
                          {showSuggestions && destinationSuggestions.filter(s => s.toLowerCase().includes(destination.toLowerCase()) && s !== destination).length > 0 && (
                              <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-50 max-h-40 overflow-y-auto">
                                  {destinationSuggestions
                                      .filter(s => s.toLowerCase().includes(destination.toLowerCase()) && s !== destination)
                                      .map((s, i) => (
                                          <button 
                                              key={i} 
                                              onClick={() => {
                                                  setDestination(s);
                                                  setShowSuggestions(false);
                                              }}
                                              className="w-full text-left px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
                                          >
                                              {s}
                                          </button>
                                      ))
                                  }
                              </div>
                          )}
                      </div>
                      <label className="flex flex-col gap-1">
                          <span className="text-[10px] font-black text-slate-500 uppercase">Asunto</span>
                          <textarea value={subject} onChange={e => setSubject(e.target.value.toUpperCase())} className="h-24 p-4 rounded-xl border-2 border-slate-100 bg-slate-50 text-xs font-bold resize-none" placeholder="Detalle el asunto..." />
                      </label>
                      
                      <div className="border-t pt-4 flex flex-col gap-4">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Adjuntar Documentación PDF</span>
                        <input value={driveUrl} onChange={e => setDriveUrl(e.target.value)} className="h-12 px-4 rounded-xl border-2 border-slate-100 bg-slate-50 text-xs font-mono" placeholder="Pegar enlace de Google Drive..." />
                        <div className="relative">
                            <input type="file" ref={fileInputRef} onChange={e => setSelectedFile(e.target.files?.[0] || null)} className="hidden" accept=".pdf" />
                            <button onClick={() => fileInputRef.current?.click()} className={`w-full h-14 border-2 border-dashed rounded-2xl flex items-center justify-center gap-3 text-xs font-black uppercase transition-all ${selectedFile ? 'border-primary bg-primary/5 text-primary' : 'border-slate-200 text-slate-400 hover:bg-slate-50'}`}>
                                <span className="material-symbols-outlined">{selectedFile ? 'verified' : 'upload_file'}</span>
                                {selectedFile ? selectedFile.name : 'SUBIR ARCHIVO PDF LOCAL'}
                            </button>
                        </div>
                      </div>
                  </div>
                  <div className="px-8 py-6 bg-slate-50 border-t flex justify-end gap-3">
                      <button onClick={closeModal} className="px-6 py-2 text-xs font-black uppercase text-slate-400">Cancelar</button>
                      <button onClick={handleSave} disabled={isSubmitting || !docNumber || !subject} className="px-10 py-4 bg-primary text-white rounded-2xl text-xs font-black uppercase shadow-xl shadow-primary/30">
                          {isSubmitting ? 'GUARDANDO...' : (editingId ? 'ACTUALIZAR' : 'REGISTRAR SALIDA')}
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* UNIFIED TIMELINE MODAL */}
      {unifiedTimelineExpediente && (
        <UnifiedTimelineModal
          expedienteNumber={unifiedTimelineExpediente.refNumber}
          outgoingFileId={unifiedTimelineExpediente.outgoingFileId}
          onClose={() => setUnifiedTimelineExpediente(null)}
        />
      )}

      {/* TRACKING MODAL */}
      {isTrackingModalOpen && selectedTrackingFile && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in zoom-in-95">
              <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
                  <div className="px-8 py-6 border-b flex justify-between items-center bg-slate-50">
                      <div className="flex flex-col">
                          <h3 className="font-black text-slate-900 uppercase tracking-tight">Seguimiento de Trámite</h3>
                          <p className="text-xs font-bold text-primary">Nº Exp: {selectedTrackingFile.refNumber}</p>
                      </div>
                      <button onClick={() => setIsTrackingModalOpen(false)} className="text-slate-400 hover:text-slate-600"><span className="material-symbols-outlined">close</span></button>
                  </div>
                  
                  <div className="p-8 flex flex-col gap-6 overflow-y-auto flex-1 bg-slate-50/50">
                      {/* Original File Info */}
                      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col gap-2">
                          <div className="flex justify-between items-start">
                              <span className="text-xs font-black text-slate-400 uppercase tracking-widest">Documento Inicial</span>
                              <span className={`px-2 py-1 rounded-md text-[10px] font-black uppercase ${
                                  selectedTrackingFile.status === 'Finalizado' ? 'bg-emerald-100 text-emerald-700' :
                                  selectedTrackingFile.status === 'Observado' ? 'bg-amber-100 text-amber-700' :
                                  selectedTrackingFile.status === 'Archivado' ? 'bg-slate-200 text-slate-600' :
                                  'bg-blue-100 text-blue-700'
                              }`}>
                                  {selectedTrackingFile.status}
                              </span>
                          </div>
                          <p className="font-bold text-slate-800">{selectedTrackingFile.docType} {selectedTrackingFile.docNumber}</p>
                          <p className="text-sm text-slate-600">{selectedTrackingFile.subject}</p>
                          <p className="text-xs text-slate-500 font-medium mt-2">Destino: <span className="font-bold">{selectedTrackingFile.destination}</span></p>
                      </div>

                      {/* Add Note */}
                      <div className="flex flex-col gap-2">
                          <span className="text-[10px] font-black text-slate-500 uppercase">Agregar Nota al Historial</span>
                          <div className="flex gap-2">
                              <input 
                                  value={trackingNote}
                                  onChange={e => setTrackingNote(e.target.value)}
                                  placeholder="Ej: Se llamó a la oficina, dicen que falta firma..."
                                  className="flex-1 h-12 px-4 rounded-xl border-2 border-slate-200 bg-white text-sm font-medium"
                                  onKeyDown={e => e.key === 'Enter' && handleAddTrackingNote()}
                              />
                              <button 
                                  onClick={handleAddTrackingNote}
                                  disabled={isSubmitting || !trackingNote.trim()}
                                  className="h-12 px-6 bg-slate-900 text-white rounded-xl font-black text-xs uppercase hover:bg-slate-800 transition-colors disabled:opacity-50"
                              >
                                  Agregar
                              </button>
                          </div>
                      </div>

                      {/* Timeline */}
                      <div className="flex flex-col gap-0 mt-4 relative">
                          <div className="absolute left-[15px] top-2 bottom-2 w-0.5 bg-slate-200"></div>
                          
                          {trackingEvents.length === 0 ? (
                              <div className="pl-12 py-4 text-sm text-slate-400 font-medium italic">No hay eventos registrados en el historial.</div>
                          ) : (
                              trackingEvents.map((event, idx) => (
                                  <div key={event.id} className="relative pl-12 py-4">
                                      <div className={`absolute left-0 top-5 w-8 h-8 rounded-full flex items-center justify-center border-4 border-slate-50 z-10 ${
                                          event.action_type === 'Nota' ? 'bg-amber-400 text-white' : 
                                          event.action_type === 'Estado' ? 'bg-blue-500 text-white' : 
                                          'bg-emerald-500 text-white'
                                      }`}>
                                          <span className="material-symbols-outlined text-[14px]">
                                              {event.action_type === 'Nota' ? 'edit_note' : 
                                               event.action_type === 'Estado' ? 'sync' : 'check_circle'}
                                          </span>
                                      </div>
                                      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col gap-1">
                                          <div className="flex justify-between items-center">
                                              <span className="text-xs font-black text-slate-800">{event.user_name}</span>
                                              <span className="text-[10px] font-bold text-slate-400">{new Date(event.created_at).toLocaleString('es-PE')}</span>
                                          </div>
                                          <p className="text-sm text-slate-600 leading-snug">{event.description}</p>
                                      </div>
                                  </div>
                              ))
                          )}
                      </div>
                  </div>
              </div>
          </div>
      )}

      <div className="flex flex-wrap items-end justify-between gap-4 shrink-0">
        <div className="flex flex-col gap-2">
            <h1 className="text-slate-900 text-3xl font-black leading-tight tracking-tight">Expedientes de Salida</h1>
            <p className="text-slate-500 text-sm font-medium">Control institucional de documentos emitidos por la oficina.</p>
        </div>
        <div className="flex items-center gap-3">
            <button onClick={() => setIsPendingReportOpen(true)} className="flex items-center gap-2 bg-indigo-50 border-2 border-indigo-100 text-indigo-700 hover:border-indigo-200 hover:bg-indigo-100 h-12 px-6 rounded-xl font-black text-xs uppercase transition-all active:scale-95">
                <span className="material-symbols-outlined">analytics</span>
                Reportes
            </button>
            {(user.role === 'Administrador' || (user.role === 'Operador' && user.permissions?.includes('upload_csv'))) && (
              <button onClick={() => setIsImportModalOpen(true)} className="flex items-center gap-2 bg-white border-2 border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-50 h-12 px-6 rounded-xl font-black text-xs uppercase transition-all active:scale-95">
                  <span className="material-symbols-outlined">upload_file</span>
                  Importar CSV
              </button>
            )}
            {(user.role === 'Administrador' || user.role === 'Operador' || user.role === 'Director') && (
              <button onClick={() => setIsModalOpen(true)} className="flex items-center gap-2 bg-slate-900 text-white h-12 px-6 rounded-xl font-black text-xs uppercase shadow-xl transition-all active:scale-95">
                  <span className="material-symbols-outlined">add</span>
                  Registrar Salida
              </button>
            )}
        </div>
      </div>

      <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-white p-2 rounded-2xl border border-slate-200 shadow-sm shrink-0">
          <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto pb-2 md:pb-0 hide-scrollbar px-2">
              {['Todos', 'Pendiente', 'Finalizado', 'Observado', 'Archivado'].map(filter => (
                  <button 
                      key={filter} 
                      onClick={() => setCurrentFilter(filter)}
                      className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest whitespace-nowrap transition-all ${currentFilter === filter ? 'bg-slate-900 text-white shadow-md' : 'text-slate-500 hover:bg-slate-100'}`}
                  >
                      {filter}
                  </button>
              ))}
          </div>
          <div className="relative w-full md:w-96 px-2 md:px-0 pr-2">
              <span className="material-symbols-outlined absolute left-5 top-1/2 -translate-y-1/2 text-slate-400">search</span>
              <input 
                  type="text" 
                  placeholder="Buscar por documento, expediente o asunto..." 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full h-12 pl-12 pr-4 bg-slate-50 border-2 border-slate-100 rounded-xl text-sm font-bold focus:bg-white focus:border-primary outline-none transition-all"
              />
          </div>
      </div>

      {/* IMPORT MODAL */}
      {isImportModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in zoom-in-95">
              <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col">
                  <div className="px-8 py-6 border-b flex justify-between items-center bg-slate-50">
                      <h3 className="font-black text-slate-900 uppercase tracking-tight">IMPORTAR REGISTROS (CSV)</h3>
                      <button onClick={() => { setIsImportModalOpen(false); setCsvFile(null); }} className="text-slate-400 hover:text-slate-600"><span className="material-symbols-outlined">close</span></button>
                  </div>
                  <div className="p-8 flex flex-col gap-6">
                      <div className="bg-blue-50 text-blue-800 p-4 rounded-xl border border-blue-100 text-sm">
                          <p className="font-bold mb-2">Instrucciones:</p>
                          <p className="mb-2">El archivo CSV debe contener exactamente los siguientes encabezados en la primera fila:</p>
                          <code className="block bg-white p-2 rounded border border-blue-200 font-mono text-xs font-bold text-blue-900">
                              TIPO, DOCUMENTO, EXPEDIENTE, DESTINO, ASUNTO, ESTADO, FECHA, ENLACE
                          </code>
                          <ul className="list-disc pl-5 mt-2 text-xs space-y-1">
                              <li><strong>TIPO:</strong> Oficio, Informe, Carta, etc.</li>
                              <li><strong>DOCUMENTO:</strong> Ej. 015-2024</li>
                              <li><strong>EXPEDIENTE:</strong> Ej. 202412345 (Opcional)</li>
                              <li><strong>DESTINO:</strong> (Opcional) Oficina o persona a la que se envía</li>
                              <li><strong>ASUNTO:</strong> Descripción del documento</li>
                              <li><strong>ESTADO:</strong> Pendiente, Finalizado, Observado, Archivado (Opcional)</li>
                              <li><strong>FECHA:</strong> (Opcional) Formato DD/MM/YYYY o YYYY-MM-DD</li>
                              <li><strong>ENLACE:</strong> (Opcional) URL del documento en Drive</li>
                          </ul>
                      </div>

                      <div className="relative">
                          <input type="file" ref={csvInputRef} onChange={e => setCsvFile(e.target.files?.[0] || null)} className="hidden" accept=".csv" />
                          <button onClick={() => csvInputRef.current?.click()} className={`w-full h-16 border-2 border-dashed rounded-2xl flex items-center justify-center gap-3 text-sm font-black uppercase transition-all ${csvFile ? 'border-primary bg-primary/5 text-primary' : 'border-slate-300 text-slate-500 hover:bg-slate-50'}`}>
                              <span className="material-symbols-outlined">{csvFile ? 'verified' : 'upload_file'}</span>
                              {csvFile ? csvFile.name : 'SELECCIONAR ARCHIVO CSV'}
                          </button>
                      </div>
                  </div>
                  <div className="px-8 py-6 bg-slate-50 border-t flex justify-end gap-3">
                      <button onClick={() => { setIsImportModalOpen(false); setCsvFile(null); }} className="px-6 py-2 text-xs font-black uppercase text-slate-400">Cancelar</button>
                      <button onClick={handleImportCSV} disabled={isSubmitting || !csvFile} className="px-10 py-4 bg-primary text-white rounded-2xl text-xs font-black uppercase shadow-xl shadow-primary/30">
                          {isSubmitting ? 'IMPORTANDO...' : 'INICIAR IMPORTACIÓN'}
                      </button>
                  </div>
              </div>
          </div>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden flex-1 flex flex-col">
        {loading ? (
             <div className="flex-1 flex flex-col items-center justify-center"><span className="material-symbols-outlined text-4xl text-primary animate-spin">progress_activity</span></div>
        ) : (
            <div className="flex-1 overflow-auto">
                <table className="w-full text-left border-collapse min-w-[1000px]">
                    <thead className="sticky top-0 z-20 bg-slate-50 border-b">
                        <tr>
                            <th className="px-6 py-4 text-slate-500 text-[10px] font-black uppercase w-32">Nº Expediente</th>
                            <th className="px-6 py-4 text-slate-500 text-[10px] font-black uppercase w-40">Documento</th>
                            <th className="px-6 py-4 text-slate-500 text-[10px] font-black uppercase w-32">Fecha Emisión</th>
                            <th className="px-6 py-4 text-slate-500 text-[10px] font-black uppercase w-48">Destino</th>
                            <th className="px-6 py-4 text-slate-500 text-[10px] font-black uppercase">Asunto</th>
                            <th className="px-6 py-4 text-slate-500 text-[10px] font-black uppercase text-center w-32">Estado</th>
                            <th className="px-6 py-4 text-slate-500 text-[10px] font-black uppercase text-right w-24 pr-10">Acciones</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                        {files.map((file) => (
                            <tr key={file.id} className="hover:bg-slate-50 transition-colors">
                                <td className="px-6 py-4 font-mono font-bold text-slate-500 text-xs">
                                    <div className="flex items-center gap-2">
                                        {file.refNumber}
                                        {file.count > 1 && (
                                            <span className="bg-indigo-100 text-indigo-700 text-[10px] font-black px-1.5 py-0.5 rounded-md">
                                                x{file.count}
                                            </span>
                                        )}
                                    </div>
                                </td>
                                <td className="px-6 py-4 font-mono font-bold text-slate-700 text-sm">
                                    <div className="flex flex-col">
                                        <span>{file.docNumber}</span>
                                        <span className="text-[9px] text-slate-400 uppercase tracking-widest">{file.docType}</span>
                                    </div>
                                </td>
                                <td className="px-6 py-4">
                                    <span className="text-xs font-bold text-slate-500">{file.dateTime.split(',')[0]}</span>
                                </td>
                                <td className="px-6 py-4"><p className="text-slate-700 text-xs font-bold uppercase line-clamp-2">{file.destination}</p></td>
                                <td className="px-6 py-4"><p className="text-slate-900 text-sm font-bold uppercase leading-snug whitespace-normal min-w-[250px]">{file.subject}</p></td>
                                <td className="px-6 py-4 text-center">
                                    <select
                                        value={file.status}
                                        onChange={(e) => handleQuickStatusChange(file.id, e.target.value)}
                                        className={`inline-flex items-center justify-center px-2 py-1 rounded-md text-[10px] font-black uppercase tracking-wider outline-none cursor-pointer appearance-none text-center ${
                                            file.status === 'Finalizado' ? 'bg-emerald-100 text-emerald-700' :
                                            file.status === 'Observado' ? 'bg-amber-100 text-amber-700' :
                                            file.status === 'Archivado' ? 'bg-slate-200 text-slate-600' :
                                            'bg-blue-100 text-blue-700'
                                        }`}
                                    >
                                        <option value="Pendiente" className="bg-white text-slate-900">PENDIENTE</option>
                                        <option value="Finalizado" className="bg-white text-slate-900">FINALIZADO</option>
                                        <option value="Observado" className="bg-white text-slate-900">OBSERVADO</option>
                                        <option value="Archivado" className="bg-white text-slate-900">ARCHIVADO</option>
                                    </select>
                                </td>
                                <td className="px-6 py-4 text-right pr-10 relative">
                                    <button 
                                        onClick={(e) => { e.stopPropagation(); setActiveMenuId(activeMenuId === file.id ? null : file.id); }}
                                        className="size-8 rounded-full hover:bg-slate-200 text-slate-400 flex items-center justify-center transition-colors ml-auto"
                                        title="Opciones"
                                    >
                                        <span className="material-symbols-outlined text-lg">more_vert</span>
                                    </button>
                                    {activeMenuId === file.id && (
                                        <div className="absolute right-10 top-10 mt-1 w-40 bg-white rounded-xl shadow-xl border border-slate-100 py-1 z-50 text-left">
                                            <button 
                                                onClick={(e) => { e.stopPropagation(); handleOpenTracking(file); setActiveMenuId(null); }}
                                                className="w-full text-left px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                                            >
                                                <span className="material-symbols-outlined text-[16px]">route</span> Seguimiento
                                            </button>
                                            <button 
                                                onClick={(e) => { e.stopPropagation(); handleOpenUnifiedTimeline(file); setActiveMenuId(null); }}
                                                className="w-full text-left px-4 py-2 text-xs font-bold text-indigo-600 hover:bg-indigo-50 flex items-center gap-2"
                                            >
                                                <span className="material-symbols-outlined text-[16px]">history</span> Historial
                                            </button>
                                            {file.pdfUrl && (
                                                <a 
                                                    href={file.pdfUrl} 
                                                    target="_blank" 
                                                    rel="noopener noreferrer"
                                                    onClick={(e) => e.stopPropagation()}
                                                    className="w-full text-left px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                                                >
                                                    <span className="material-symbols-outlined text-[16px]">picture_as_pdf</span> Ver PDF
                                                </a>
                                            )}
                                            {(user.role === 'Administrador' || user.role === 'Operador' || user.role === 'Director') && (
                                                <>
                                                    <button 
                                                        onClick={(e) => { e.stopPropagation(); handleEdit(file); setActiveMenuId(null); }}
                                                        className="w-full text-left px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                                                    >
                                                        <span className="material-symbols-outlined text-[16px]">edit</span> Editar
                                                    </button>
                                                    <button 
                                                        onClick={(e) => { e.stopPropagation(); handleDelete(file.id); setActiveMenuId(null); }}
                                                        className="w-full text-left px-4 py-2 text-xs font-bold text-rose-600 hover:bg-rose-50 flex items-center gap-2"
                                                    >
                                                        <span className="material-symbols-outlined text-[16px]">delete</span> Eliminar
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        )}
      </div>

      {/* PENDING FOLLOWUP REPORT MODAL */}
      {isPendingReportOpen && (
        <PendingFollowupModal onClose={() => setIsPendingReportOpen(false)} />
      )}
    </div>
  );
};
