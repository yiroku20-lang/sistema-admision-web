
import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';
import { OutgoingFile, User, TrackingEvent } from '../types';
import Papa from 'papaparse';
import { UnifiedTimelineModal } from '../components/UnifiedTimelineModal';
import { PendingFollowupModal } from '../components/PendingFollowupModal';
import { logOutgoingAction } from '../lib/auditLogger';
import {
  DriveConfig,
  getDriveConfig,
  isGoogleDriveUrl,
  formatDriveViewUrl,
  extractDriveFileId,
  uploadPdfToGoogleDrive,
  buildDriveFolderUrl,
  syncDriveConfigWithServer
} from '../lib/googleDriveService';
import { DriveConfigModal } from '../components/DriveConfigModal';

export const DEFAULT_DESTINATIONS = [
  'ABASTECIMIENTO',
  'ARQUITECTURA',
  'ASESORIA JURIDICA',
  'BIBLIOTECA',
  'BIENESTAR',
  'CALIDAD',
  'CEPRU',
  'CIENCIAS SOCIALES',
  'COMPUTO',
  'COOPERACION',
  'DIGA',
  'DISTRIBUCIONES',
  'EDITORIAL',
  'ESCALAFON',
  'ESCUELA DE POSGRADO',
  'ESTUDIANTE',
  'ESTUDIOS GENERALES',
  'FACULTADES',
  'FORMULADORA',
  'GESTION ACADEMICA',
  'IMAGEN INSTITUC',
  'INFORMACION EXAMEN',
  'INSTITUTO DE IDIOMAS',
  'INTERESADO',
  'LOGISTICA',
  'MANTENIMIENTO',
  'OBRAS',
  'OCI',
  'PATRIMONIO',
  'PLANIFICACION',
  'POSTGRADO',
  'PRESUPUESTO',
  'PRONABEC',
  'RCU',
  'RECTORADO',
  'RECURSOS HUMANOS',
  'REMUNERACIONES',
  'SECRETARIA GENERAL',
  'SEGURIDAD',
  'SINDUC',
  'SINTUC',
  'SUBUNIDAD DE REMUNERACIONES',
  'TECNOLOGIAS INFORMATICA',
  'TESORERIA',
  'TRAMITE',
  'TRANSPORTE',
  'UNIDAD DE ABASTECIMIENTO',
  'UNIDAD DE CENTRO DE CÓMPUTO',
  'VICERRECTORADO ACADÉMICO',
  'VRAC',
  'VRIN',
  'OTROS'
];

interface GroupedOutgoingFile extends OutgoingFile {
  count: number;
  history: OutgoingFile[];
}

export const OutgoingFiles: React.FC<{ user: User; notify?: (message: string, type?: 'success' | 'error' | 'info') => void }> = ({ user, notify }) => {
  const isAdmin = user?.role === 'Administrador' || user?.role?.toLowerCase().includes('admin');
  const [files, setFiles] = useState<GroupedOutgoingFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isDriveConfigOpen, setIsDriveConfigOpen] = useState(false);
  const [driveConfig, setDriveConfig] = useState<DriveConfig>(getDriveConfig());
  const [uploadProgressText, setUploadProgressText] = useState('');
  const [modalError, setModalError] = useState<string | null>(null);
  const [actionFeedback, setActionFeedback] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const [unifiedTimelineExpediente, setUnifiedTimelineExpediente] = useState<{refNumber?: string, outgoingFileId?: string} | null>(null);

  const [docType, setDocType] = useState('Oficio');
  const [docNumber, setDocNumber] = useState('');
  const [refNumber, setRefNumber] = useState('');
  const [subject, setSubject] = useState('');
  const [destination, setDestination] = useState('');
  const [destinationList, setDestinationList] = useState<string[]>(DEFAULT_DESTINATIONS);
  const [isCustomDestination, setIsCustomDestination] = useState(false);
  const [status, setStatus] = useState<'Pendiente' | 'Finalizado' | 'Observado' | 'Archivado'>('Pendiente');
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
    syncDriveConfigWithServer().then(cfg => {
      if (cfg) setDriveConfig(cfg);
    });

    const handleDriveUpdate = (e: any) => {
      if (e.detail) setDriveConfig(e.detail);
      else setDriveConfig(getDriveConfig());
    };
    window.addEventListener('drive-config-updated', handleDriveUpdate);
    return () => window.removeEventListener('drive-config-updated', handleDriveUpdate);
  }, []);

  useEffect(() => {
    const handleClickOutside = () => setActiveMenuId(null);
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

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
            let cleanDestination = item.destination || '-';
            let isGenerated = false;
            let studentName = '';

            if (item.destination && item.destination.startsWith('{')) {
              try {
                const meta = JSON.parse(item.destination);
                cleanDestination = meta.estudiante_nombre
                  ? `ESTUDIANTE: ${meta.estudiante_nombre}`
                  : (meta.tipo_documento || 'ESTUDIANTE');
                isGenerated = true;
                studentName = meta.estudiante_nombre || '';
              } catch (e) {}
            }
            if (item.doc_number && (item.doc_number.startsWith('UNSAAC-CONST-') || item.doc_number.startsWith('UNSAAC-INF-'))) {
              isGenerated = true;
            }

            const currentFile: OutgoingFile = {
                id: item.id,
                docType: item.doc_type,
                docNumber: item.doc_number,
                refNumber: item.ref_number || '-',
                subject: item.subject,
                destination: cleanDestination,
                status: item.status || 'Pendiente',
                pdfUrl: item.pdf_url,
                dateTime: new Date(item.created_at).toLocaleString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
                isSystemGenerated: isGenerated,
                hasAttachedPdf: Boolean(item.pdf_url),
                studentName: studentName || undefined
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
        
        const cleanDbDestinations = (data || [])
          .map((item: any) => {
            const raw = item.destination;
            if (!raw) return null;
            if (raw.startsWith('{') || raw.startsWith('[') || raw === '-') return null;
            return raw.trim().toUpperCase();
          })
          .filter(Boolean) as string[];

        const uniqueDestinations = Array.from(new Set([...DEFAULT_DESTINATIONS, ...cleanDbDestinations])).sort((a, b) => a.localeCompare(b));
        setDestinationList(uniqueDestinations);
      }
    } catch (err) { console.error(err); } finally { setLoading(false); }
  };

  const openCreateModal = () => {
      closeModal();
      setIsModalOpen(true);
  };

  const handleSave = async () => {
      setModalError(null);
      const cleanDocNumber = docNumber.trim();
      const cleanSubject = subject.trim();

      if (!cleanDocNumber) {
          setModalError('Debe ingresar el Número de Documento (ej: 015-2024 o 003-2026).');
          return;
      }
      if (!cleanSubject) {
          setModalError('Debe detallar el Asunto del documento a registrar.');
          return;
      }

      setIsSubmitting(true);
      setUploadProgressText('Procesando datos del expediente...');
      try {
          let publicUrl = driveUrl.trim();
          
          if (publicUrl && isGoogleDriveUrl(publicUrl)) {
              publicUrl = formatDriveViewUrl(publicUrl);
          }

          if (selectedFile) {
              const cleanDocNo = cleanDocNumber.replace(/[^a-zA-Z0-9_-]/g, '_');
              const cleanType = docType.trim().toUpperCase();
              const sanitizedName = `${cleanType}_${cleanDocNo}_${Date.now()}.pdf`;

              let activeConfig = driveConfig;
              if (!activeConfig.folderId || !activeConfig.webhookUrl) {
                  activeConfig = await syncDriveConfigWithServer();
              }

              let uploadSuccess = false;

              // 1. Intento de subida a Google Drive mediante conector institucional
              if (activeConfig.webhookUrl || activeConfig.folderId) {
                  try {
                      setUploadProgressText('Guardando documento en Google Drive...');
                      const driveRes = await uploadPdfToGoogleDrive(selectedFile, {
                          customFileName: sanitizedName,
                          targetFolderId: activeConfig.folderId,
                          customWebhookUrl: activeConfig.webhookUrl
                      });

                      if (driveRes.success && driveRes.fileUrl) {
                          publicUrl = driveRes.fileUrl;
                          uploadSuccess = true;
                          setUploadProgressText('Documento archivado en Google Drive. Registrando salida...');
                      } else {
                          console.warn('Subida a Google Drive no completada:', driveRes.error);
                      }
                  } catch (driveErr) {
                      console.warn('Excepción al conectar con Google Drive:', driveErr);
                  }
              }

              // 2. Respaldo automático en Supabase Storage para que el registro nunca se bloquee
              if (!uploadSuccess) {
                  setUploadProgressText('Guardando respaldo del documento en almacenamiento del sistema...');
                  try {
                      const { error: uploadError } = await supabase.storage
                          .from('documentos')
                          .upload(`salidas/${sanitizedName}`, selectedFile, { upsert: true });

                      if (!uploadError) {
                          const { data: urlData } = supabase.storage
                              .from('documentos')
                              .getPublicUrl(`salidas/${sanitizedName}`);
                          if (urlData?.publicUrl) {
                              publicUrl = urlData.publicUrl;
                              uploadSuccess = true;
                          }
                      } else {
                          console.warn('Supabase storage error:', uploadError);
                      }
                  } catch (storageErr) {
                      console.warn('Excepción en storage de respaldo:', storageErr);
                  }
              }

              if (!uploadSuccess && !publicUrl) {
                  throw new Error('No se pudo subir el archivo PDF adjunto. Verifique su conexión y vuelva a intentarlo.');
              }
          }

          const isValidUuid = (val?: string | null) => {
              if (!val) return false;
              return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);
          };

          const cleanDestination = destination.trim().toUpperCase() || 'UNIDAD DE ADMISIÓN';

          if (editingId) {
              const updateData: any = {
                  doc_type: docType,
                  doc_number: cleanDocNumber,
                  ref_number: refNumber.trim() || '-',
                  subject: cleanSubject.toUpperCase(),
                  destination: cleanDestination,
                  status: status,
                  pdf_url: publicUrl || null
              };
              if (isValidUuid(user?.id)) {
                  updateData.updated_by = user.id;
              }

              const { error } = await supabase.from('expedientes_salida').update(updateData).eq('id', editingId);
              if (error) throw error;

              try {
                await logOutgoingAction('Edición', docType, cleanDocNumber, cleanDestination, Boolean(publicUrl), selectedFile?.name);
              } catch (e) {}

              if (notify) notify('Expediente actualizado exitosamente', 'success');
              else setActionFeedback({ message: 'Expediente actualizado exitosamente', type: 'success' });
          } else {
              const insertData: any = {
                  doc_type: docType,
                  doc_number: cleanDocNumber,
                  ref_number: refNumber.trim() || '-',
                  subject: cleanSubject.toUpperCase(),
                  destination: cleanDestination,
                  status: status,
                  pdf_url: publicUrl || null
              };
              if (isValidUuid(user?.id)) {
                  insertData.created_by = user.id;
              }

              const { error } = await supabase.from('expedientes_salida').insert([insertData]);
              if (error) throw error;

              try {
                await logOutgoingAction('Registro', docType, cleanDocNumber, cleanDestination, Boolean(publicUrl), selectedFile?.name);
              } catch (e) {}

              if (notify) notify('Expediente de salida registrado exitosamente', 'success');
              else setActionFeedback({ message: 'Expediente de salida registrado exitosamente', type: 'success' });
          }
          
          await fetchFiles(); 
          closeModal();
      } catch (err: any) { 
          console.error('Error al guardar expediente de salida:', err);
          const errorMsg = err?.message || 'Error desconocido al guardar en base de datos.';
          setModalError(errorMsg);
          if (notify) notify(errorMsg, 'error');
      } finally { 
          setIsSubmitting(false); 
          setUploadProgressText('');
      }
  };

  const closeModal = () => {
      setIsModalOpen(false); 
      setEditingId(null); 
      setDocNumber(''); 
      setRefNumber(''); 
      setSubject(''); 
      setDestination(''); 
      setIsCustomDestination(false);
      setStatus('Pendiente'); 
      setDriveUrl(''); 
      setSelectedFile(null);
      setUploadProgressText('');
      setModalError(null);
  };

  const handleEdit = (file: any) => {
      setModalError(null);
      setEditingId(file.id);
      setDocType(file.docType);
      setDocNumber(file.docNumber);
      setRefNumber(file.refNumber === '-' ? '' : file.refNumber);
      setSubject(file.subject);
      const dest = file.destination === '-' ? '' : file.destination;
      setDestination(dest);
      if (dest && !DEFAULT_DESTINATIONS.includes(dest) && !destinationList.includes(dest)) {
          setIsCustomDestination(true);
      } else {
          setIsCustomDestination(false);
      }
      setStatus(file.status || 'Pendiente');
      setDriveUrl(file.pdfUrl || '');
      setSelectedFile(null);
      setUploadProgressText('');
      setIsModalOpen(true);
  };

  const handleDelete = async (id: string) => {
      if (!window.confirm('¿Está seguro de eliminar este registro?')) return;
      try {
          const { error } = await supabase.from('expedientes_salida').delete().eq('id', id);
          if (error) throw error;
          if (notify) notify('Expediente eliminado correctamente', 'info');
          else setActionFeedback({ message: 'Expediente eliminado correctamente', type: 'success' });
          fetchFiles();
      } catch (err: any) {
          if (notify) notify(err.message, 'error');
          else setActionFeedback({ message: err.message, type: 'error' });
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
                          pdf_url: row.ENLACE ? (isGoogleDriveUrl(row.ENLACE.trim()) ? formatDriveViewUrl(row.ENLACE.trim()) : row.ENLACE.trim()) : '',
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

                  if (notify) notify(`Se importaron ${validRecords.length} registros correctamente.`, 'success');
                  else setActionFeedback({ message: `Se importaron ${validRecords.length} registros correctamente.`, type: 'success' });
                  setIsImportModalOpen(false);
                  setCsvFile(null);
                  fetchFiles();
              } catch (err: any) {
                  if (notify) notify(`Error al importar: ${err.message}`, 'error');
                  else setActionFeedback({ message: `Error al importar: ${err.message}`, type: 'error' });
              } finally {
                  setIsSubmitting(false);
              }
          },
          error: (error) => {
              if (notify) notify(`Error al leer CSV: ${error.message}`, 'error');
              else setActionFeedback({ message: `Error al leer CSV: ${error.message}`, type: 'error' });
              setIsSubmitting(false);
          }
      });
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
          if (notify) notify('Error al agregar nota: ' + err.message, 'error');
          else setActionFeedback({ message: 'Error al agregar nota: ' + err.message, type: 'error' });
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
          if (notify) notify(`Error al actualizar estado: ${err.message}`, 'error');
          else setActionFeedback({ message: `Error al actualizar estado: ${err.message}`, type: 'error' });
      }
  };

  return (
    <div className="flex flex-col gap-3.5 sm:gap-6 w-full p-2.5 sm:p-5 md:p-8 min-h-full max-w-[1400px] mx-auto pb-10">
      
      {isModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-2.5 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-in zoom-in-95">
              <div className="bg-white rounded-2xl sm:rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[94vh]">
                  <div className="px-4 sm:px-8 py-3.5 sm:py-5 border-b flex justify-between items-center bg-slate-50 shrink-0">
                      <h3 className="font-black text-slate-900 text-sm sm:text-base uppercase tracking-tight">{editingId ? 'EDITAR SALIDA' : 'REGISTRAR SALIDA'}</h3>
                      <button onClick={closeModal} className="text-slate-400 hover:text-slate-600 p-1"><span className="material-symbols-outlined">close</span></button>
                  </div>
                  <div className="p-4 sm:p-6 md:p-8 flex flex-col gap-3.5 sm:gap-5 overflow-y-auto">
                      {modalError && (
                        <div className="bg-rose-50 border-2 border-rose-200 rounded-2xl p-3 sm:p-4 text-xs text-rose-800 flex items-start gap-2.5 animate-in fade-in shadow-sm">
                          <span className="material-symbols-outlined text-rose-600 text-lg sm:text-xl shrink-0">error</span>
                          <div className="flex-1">
                            <p className="font-black text-rose-950 uppercase tracking-tight">Atención al guardar expediente:</p>
                            <p className="text-xs text-rose-800 mt-1 font-medium">{modalError}</p>
                          </div>
                          <button type="button" onClick={() => setModalError(null)} className="text-rose-400 hover:text-rose-700">
                            <span className="material-symbols-outlined text-base">close</span>
                          </button>
                        </div>
                      )}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                          <label className="flex flex-col gap-1">
                              <span className="text-[10px] font-black text-slate-500 uppercase">Tipo</span>
                              <select value={docType} onChange={e => setDocType(e.target.value)} className="h-11 sm:h-12 px-3 rounded-xl border-2 border-slate-100 bg-slate-50 text-xs sm:text-sm font-bold"><option>Oficio</option><option>Informe</option><option>Circular</option><option>Carta</option><option>Proveido</option></select>
                          </label>
                          <label className="flex flex-col gap-1">
                              <span className="text-[10px] font-black text-slate-500 uppercase">Nº Documento</span>
                              <input value={docNumber} onChange={e => setDocNumber(e.target.value)} className="h-11 sm:h-12 px-3.5 sm:px-4 rounded-xl border-2 border-slate-100 bg-slate-50 font-bold text-xs sm:text-sm" placeholder="Ej: 015-2024" />
                          </label>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                          <label className="flex flex-col gap-1">
                              <span className="text-[10px] font-black text-slate-500 uppercase">Nº Expediente</span>
                              <input value={refNumber} onChange={e => setRefNumber(e.target.value)} className="h-11 sm:h-12 px-3.5 sm:px-4 rounded-xl border-2 border-slate-100 bg-slate-50 text-xs sm:text-sm font-bold" placeholder="Ej: 202412345" />
                          </label>
                          <label className="flex flex-col gap-1">
                              <span className="text-[10px] font-black text-slate-500 uppercase">Estado</span>
                              <select value={status} onChange={e => setStatus(e.target.value as any)} className="h-11 sm:h-12 px-3 rounded-xl border-2 border-slate-100 bg-slate-50 text-xs sm:text-sm font-bold">
                                  <option value="Pendiente">Pendiente</option>
                                  <option value="Finalizado">Finalizado</option>
                                  <option value="Observado">Observado</option>
                                  <option value="Archivado">Archivado</option>
                              </select>
                          </label>
                      </div>
                      {!isCustomDestination ? (
                          <div className="flex flex-col gap-1">
                              <span className="text-[10px] font-black text-slate-500 uppercase">Destino</span>
                              <select 
                                  value={destination} 
                                  onChange={e => {
                                      if (e.target.value === '__custom__') {
                                          setIsCustomDestination(true);
                                          setDestination('');
                                      } else {
                                          setDestination(e.target.value);
                                      }
                                  }} 
                                  className="h-11 sm:h-12 px-3 rounded-xl border-2 border-slate-100 bg-slate-50 text-xs sm:text-sm font-bold uppercase focus:bg-white focus:border-primary outline-none transition-all"
                              >
                                  <option value="">-- SELECCIONE DESTINO DE LA LISTA --</option>
                                  {destinationList.map(dest => (
                                      <option key={dest} value={dest}>{dest}</option>
                                  ))}
                                  <option value="__custom__">➕ OTRO / ESCRIBIR NUEVO DESTINO...</option>
                              </select>
                          </div>
                      ) : (
                          <div className="flex flex-col gap-1 animate-in fade-in">
                              <div className="flex items-center justify-between">
                                  <span className="text-[10px] font-black text-primary uppercase flex items-center gap-1">
                                      <span className="material-symbols-outlined text-[13px]">edit</span>
                                      Escribir Nuevo Destino
                                  </span>
                                  <button
                                      type="button"
                                      onClick={() => {
                                          setIsCustomDestination(false);
                                          if (!destinationList.includes(destination)) {
                                              setDestination('');
                                          }
                                      }}
                                      className="text-[10px] font-bold text-slate-500 hover:text-slate-800 flex items-center gap-1 hover:underline"
                                  >
                                      <span className="material-symbols-outlined text-[13px]">list</span>
                                      Elegir de la lista
                                  </button>
                              </div>
                              <div className="relative flex items-center">
                                  <input 
                                      type="text" 
                                      list="destinos-datalist"
                                      value={destination} 
                                      onChange={e => setDestination(e.target.value.toUpperCase())} 
                                      className="w-full h-11 sm:h-12 px-3.5 sm:px-4 rounded-xl border-2 border-primary/40 bg-primary/5 text-xs sm:text-sm font-bold uppercase focus:bg-white focus:border-primary outline-none transition-all" 
                                      placeholder="Escriba el nombre del destino..." 
                                      autoFocus
                                  />
                                  <datalist id="destinos-datalist">
                                      {destinationList.map(d => (
                                          <option key={d} value={d} />
                                      ))}
                                  </datalist>
                              </div>
                          </div>
                      )}
                      <label className="flex flex-col gap-1">
                          <span className="text-[10px] font-black text-slate-500 uppercase">Asunto</span>
                          <textarea value={subject} onChange={e => setSubject(e.target.value.toUpperCase())} className="h-20 sm:h-24 p-3 sm:p-4 rounded-xl border-2 border-slate-100 bg-slate-50 text-xs font-bold resize-none" placeholder="Detalle el asunto..." />
                      </label>
                      
                      {/* SECCIÓN ADJUNTAR DOCUMENTACIÓN */}
                      <div className="border-t border-slate-200 pt-3.5 sm:pt-4 flex flex-col gap-2.5 sm:gap-3">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                            <span className="material-symbols-outlined text-slate-400 text-sm">attach_file</span>
                            Adjuntar Documento PDF (Opcional)
                          </span>
                          {isAdmin && (
                            <button
                              type="button"
                              onClick={() => setIsDriveConfigOpen(true)}
                              className="text-[10px] font-bold text-slate-400 hover:text-emerald-700 flex items-center gap-1 transition-colors"
                              title="Configuración de almacenamiento en Google Drive"
                            >
                              <span className="material-symbols-outlined text-[12px]">settings</span>
                              Ajustes de Almacenamiento
                            </button>
                          )}
                        </div>

                        {/* Selector de archivo PDF */}
                        <div className="relative">
                            <input 
                              type="file" 
                              ref={fileInputRef} 
                              onChange={e => {
                                const f = e.target.files?.[0] || null;
                                setSelectedFile(f);
                              }} 
                              className="hidden" 
                              accept=".pdf" 
                            />
                            
                            {selectedFile ? (
                              <div className="p-3 bg-slate-50 border-2 border-slate-200 rounded-2xl flex items-center justify-between gap-2.5 animate-in fade-in">
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <div className="size-8 sm:size-9 rounded-xl bg-rose-50 text-rose-600 border border-rose-200 flex items-center justify-center shrink-0">
                                    <span className="material-symbols-outlined text-base sm:text-lg">picture_as_pdf</span>
                                  </div>
                                  <div className="flex flex-col min-w-0">
                                    <span className="text-xs font-black text-slate-800 truncate">{selectedFile.name}</span>
                                    <span className="text-[10px] font-semibold text-slate-500 flex items-center gap-1">
                                      <span className="material-symbols-outlined text-[12px] text-emerald-600">check_circle</span>
                                      {(selectedFile.size / 1024).toFixed(1)} KB &bull; Archivo listo
                                    </span>
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => setSelectedFile(null)}
                                  className="size-7 sm:size-8 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-slate-200 flex items-center justify-center transition-colors shrink-0"
                                  title="Quitar archivo seleccionado"
                                >
                                  <span className="material-symbols-outlined text-base">close</span>
                                </button>
                              </div>
                            ) : (
                              <button 
                                type="button" 
                                onClick={() => fileInputRef.current?.click()} 
                                className="w-full h-12 sm:h-14 border-2 border-dashed border-slate-200 hover:border-slate-400 hover:bg-slate-50 rounded-2xl flex items-center justify-center gap-2 text-xs font-black uppercase text-slate-500 hover:text-slate-800 transition-all"
                              >
                                  <span className="material-symbols-outlined text-slate-400 text-lg">upload_file</span>
                                  Seleccionar Archivo PDF
                              </button>
                            )}
                        </div>

                        {/* Si estamos editando y ya tenía enlace previo */}
                        {editingId && driveUrl && !selectedFile && (
                          <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between text-xs">
                            <span className="text-[11px] font-bold text-slate-600 flex items-center gap-1.5 truncate">
                              <span className="material-symbols-outlined text-sm text-indigo-600">description</span>
                              Documento PDF actualmente adjunto
                            </span>
                            <a 
                              href={formatDriveViewUrl(driveUrl)} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="text-[10px] font-black uppercase text-indigo-600 hover:underline flex items-center gap-1 shrink-0"
                            >
                              Ver Documento
                              <span className="material-symbols-outlined text-[12px]">open_in_new</span>
                            </a>
                          </div>
                        )}

                        {/* Mensaje de progreso durante guardado */}
                        {uploadProgressText && (
                          <div className="p-2.5 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-800 text-xs font-bold flex items-center gap-2 animate-pulse">
                            <span className="material-symbols-outlined text-sm animate-spin">sync</span>
                            <span>{uploadProgressText}</span>
                          </div>
                        )}
                      </div>
                  </div>
                  <div className="px-4 sm:px-8 py-3.5 sm:py-5 bg-slate-50 border-t flex flex-col-reverse sm:flex-row justify-end items-stretch sm:items-center gap-2 sm:gap-3 shrink-0">
                      <button type="button" onClick={closeModal} className="px-4 py-2.5 text-xs font-black uppercase text-slate-400 hover:text-slate-600 transition-colors text-center">
                          Cancelar
                      </button>
                      <button 
                          type="button" 
                          onClick={handleSave} 
                          disabled={isSubmitting} 
                          className="w-full sm:w-auto justify-center px-6 sm:px-10 py-3 sm:py-3.5 bg-primary hover:bg-primary/95 text-white rounded-xl sm:rounded-2xl text-xs font-black uppercase shadow-xl shadow-primary/30 transition-all flex items-center gap-2.5 disabled:opacity-50"
                      >
                          {isSubmitting && <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span>}
                          <span>{isSubmitting ? (uploadProgressText || 'GUARDANDO...') : (editingId ? 'ACTUALIZAR EXPEDIENTE' : 'REGISTRAR SALIDA')}</span>
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
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-2.5 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-in zoom-in-95">
              <div className="bg-white rounded-2xl sm:rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[94vh]">
                  <div className="px-4 sm:px-8 py-3.5 sm:py-5 border-b flex justify-between items-center bg-slate-50 shrink-0">
                      <div className="flex flex-col">
                          <h3 className="font-black text-slate-900 text-sm sm:text-base uppercase tracking-tight">Seguimiento de Trámite</h3>
                          <p className="text-xs font-bold text-primary">Nº Exp: {selectedTrackingFile.refNumber}</p>
                      </div>
                      <button onClick={() => setIsTrackingModalOpen(false)} className="text-slate-400 hover:text-slate-600 p-1"><span className="material-symbols-outlined">close</span></button>
                  </div>
                  
                  <div className="p-3.5 sm:p-6 md:p-8 flex flex-col gap-3.5 sm:gap-6 overflow-y-auto flex-1 bg-slate-50/50">
                      {/* Original File Info */}
                      <div className="bg-white p-3.5 sm:p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col gap-2">
                          <div className="flex justify-between items-start">
                              <span className="text-[10px] sm:text-xs font-black text-slate-400 uppercase tracking-widest">Documento Inicial</span>
                              <span className={`px-2 py-0.5 sm:py-1 rounded-md text-[10px] font-black uppercase ${
                                  selectedTrackingFile.status === 'Finalizado' ? 'bg-emerald-100 text-emerald-700' :
                                  selectedTrackingFile.status === 'Observado' ? 'bg-amber-100 text-amber-700' :
                                  selectedTrackingFile.status === 'Archivado' ? 'bg-slate-200 text-slate-600' :
                                  'bg-blue-100 text-blue-700'
                              }`}>
                                  {selectedTrackingFile.status}
                              </span>
                          </div>
                          <p className="font-bold text-slate-800 text-sm sm:text-base">{selectedTrackingFile.docType} {selectedTrackingFile.docNumber}</p>
                          <p className="text-xs sm:text-sm text-slate-600 leading-snug">{selectedTrackingFile.subject}</p>
                          <p className="text-xs text-slate-500 font-medium mt-0.5">Destino: <span className="font-bold">{selectedTrackingFile.destination}</span></p>
                      </div>

                      {/* Add Note */}
                      <div className="flex flex-col gap-1.5 sm:gap-2">
                          <span className="text-[10px] font-black text-slate-500 uppercase">Agregar Nota al Historial</span>
                          <div className="flex flex-col sm:flex-row gap-2">
                              <input 
                                  value={trackingNote}
                                  onChange={e => setTrackingNote(e.target.value)}
                                  placeholder="Ej: Se coordinó con oficina destino..."
                                  className="flex-1 h-10 sm:h-12 px-3.5 sm:px-4 rounded-xl border-2 border-slate-200 bg-white text-xs sm:text-sm font-medium"
                                  onKeyDown={e => e.key === 'Enter' && handleAddTrackingNote()}
                              />
                              <button 
                                  onClick={handleAddTrackingNote}
                                  disabled={isSubmitting || !trackingNote.trim()}
                                  className="h-10 sm:h-12 px-5 sm:px-6 bg-slate-900 text-white rounded-xl font-black text-xs uppercase hover:bg-slate-800 transition-colors disabled:opacity-50 shrink-0"
                              >
                                  Agregar
                              </button>
                          </div>
                      </div>

                      {/* Timeline */}
                      <div className="flex flex-col gap-0 mt-2 sm:mt-4 relative">
                          <div className="absolute left-[15px] top-2 bottom-2 w-0.5 bg-slate-200"></div>
                          
                          {trackingEvents.length === 0 ? (
                              <div className="pl-10 sm:pl-12 py-4 text-xs sm:text-sm text-slate-400 font-medium italic">No hay eventos registrados en el historial.</div>
                          ) : (
                              trackingEvents.map((event) => (
                                  <div key={event.id} className="relative pl-10 sm:pl-12 py-3 sm:py-4">
                                      <div className={`absolute left-0 top-4 sm:top-5 size-7 sm:size-8 rounded-full flex items-center justify-center border-4 border-slate-50 z-10 ${
                                          event.action_type === 'Nota' ? 'bg-amber-400 text-white' : 
                                          event.action_type === 'Estado' ? 'bg-blue-500 text-white' : 
                                          'bg-emerald-500 text-white'
                                      }`}>
                                          <span className="material-symbols-outlined text-[13px] sm:text-[14px]">
                                              {event.action_type === 'Nota' ? 'edit_note' : 
                                               event.action_type === 'Estado' ? 'sync' : 'check_circle'}
                                          </span>
                                      </div>
                                      <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col gap-1">
                                          <div className="flex justify-between items-center">
                                              <span className="text-xs font-black text-slate-800">{event.user_name}</span>
                                              <span className="text-[10px] font-bold text-slate-400">{new Date(event.created_at).toLocaleString('es-PE')}</span>
                                          </div>
                                          <p className="text-xs sm:text-sm text-slate-600 leading-snug">{event.description}</p>
                                      </div>
                                  </div>
                              ))
                          )}
                      </div>
                  </div>
              </div>
          </div>
      )}

      {/* HEADER PRINCIPAL */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 sm:gap-4 shrink-0">
        <div className="flex flex-col gap-1">
            <h1 className="text-slate-900 text-2xl sm:text-3xl font-black leading-tight tracking-tight">Expedientes de Salida</h1>
            <p className="text-slate-500 text-xs sm:text-sm font-medium">Control institucional de documentos emitidos por la oficina.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 w-full sm:w-auto">
            {isAdmin && (
              <button 
                  onClick={() => setIsDriveConfigOpen(true)} 
                  className={`flex items-center justify-center gap-1.5 sm:gap-2 h-10 sm:h-12 px-3 sm:px-5 rounded-xl font-black text-[11px] sm:text-xs uppercase transition-all active:scale-95 border-2 ${
                    driveConfig.folderId
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-800 hover:bg-emerald-100 hover:border-emerald-300'
                      : 'bg-white border-amber-300 text-amber-800 hover:bg-amber-50'
                  }`}
                  title="Configuración institucional de Google Drive (Solo Administrador)"
              >
                  <span className="material-symbols-outlined text-[18px] sm:text-[20px] text-emerald-600">
                    {driveConfig.folderId ? 'folder_shared' : 'add_to_drive'}
                  </span>
                  <span className="whitespace-nowrap">{driveConfig.folderId ? 'Drive Conectado' : 'Configurar Drive'}</span>
                  {driveConfig.folderId && (
                    <span className="size-2 rounded-full bg-emerald-500 animate-pulse ml-0.5" />
                  )}
              </button>
            )}
            <button 
                onClick={() => setIsPendingReportOpen(true)} 
                className="flex items-center justify-center gap-1.5 sm:gap-2 bg-indigo-50 border-2 border-indigo-100 text-indigo-700 hover:border-indigo-200 hover:bg-indigo-100 h-10 sm:h-12 px-3 sm:px-5 rounded-xl font-black text-[11px] sm:text-xs uppercase transition-all active:scale-95"
            >
                <span className="material-symbols-outlined text-[18px] sm:text-[20px]">analytics</span>
                <span>Reportes</span>
            </button>
            {(user.role === 'Administrador' || (user.role === 'Operador' && user.permissions?.includes('upload_csv'))) && (
              <button 
                  onClick={() => setIsImportModalOpen(true)} 
                  className="flex items-center justify-center gap-1.5 sm:gap-2 bg-white border-2 border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-50 h-10 sm:h-12 px-3 sm:px-5 rounded-xl font-black text-[11px] sm:text-xs uppercase transition-all active:scale-95"
              >
                  <span className="material-symbols-outlined text-[18px] sm:text-[20px]">upload_file</span>
                  <span>Importar CSV</span>
              </button>
            )}
            {(user.role === 'Administrador' || user.role === 'Operador' || user.role === 'Director') && (
              <button 
                  onClick={openCreateModal} 
                  className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 sm:gap-2 bg-slate-900 hover:bg-slate-800 text-white h-10 sm:h-12 px-4 sm:px-6 rounded-xl font-black text-[11px] sm:text-xs uppercase shadow-lg shadow-slate-900/20 transition-all active:scale-95"
              >
                  <span className="material-symbols-outlined text-[18px] sm:text-[20px]">add</span>
                  <span>Registrar Salida</span>
              </button>
            )}
        </div>
      </div>

      {/* FILTROS Y BÚSQUEDA */}
      <div className="flex flex-col sm:flex-row gap-2.5 sm:gap-4 items-stretch sm:items-center justify-between bg-white p-2 sm:p-2.5 rounded-2xl border border-slate-200 shadow-sm shrink-0">
          <div className="flex items-center gap-1.5 sm:gap-2 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0 hide-scrollbar px-1">
              {['Todos', 'Pendiente', 'Finalizado', 'Observado', 'Archivado'].map(filter => (
                  <button 
                      key={filter} 
                      onClick={() => setCurrentFilter(filter)}
                      className={`px-3 sm:px-4 py-2 rounded-xl text-[11px] sm:text-xs font-black uppercase tracking-wider whitespace-nowrap transition-all shrink-0 ${currentFilter === filter ? 'bg-slate-900 text-white shadow-md' : 'text-slate-500 hover:bg-slate-100'}`}
                  >
                      {filter}
                  </button>
              ))}
          </div>
          <div className="relative w-full sm:w-80 md:w-96 px-1 sm:px-0">
              <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-lg sm:text-xl pointer-events-none">search</span>
              <input 
                  type="text" 
                  placeholder="Buscar documento, expediente o asunto..." 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full h-10 sm:h-12 pl-11 pr-4 bg-slate-50 border-2 border-slate-100 rounded-xl text-xs sm:text-sm font-bold focus:bg-white focus:border-primary outline-none transition-all placeholder:text-slate-400"
              />
          </div>
      </div>

      {/* IMPORT MODAL */}
      {isImportModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-in zoom-in-95">
              <div className="bg-white rounded-2xl sm:rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[92vh]">
                  <div className="px-5 sm:px-8 py-4 sm:py-6 border-b flex justify-between items-center bg-slate-50 shrink-0">
                      <h3 className="font-black text-slate-900 text-sm sm:text-base uppercase tracking-tight">IMPORTAR REGISTROS (CSV)</h3>
                      <button onClick={() => { setIsImportModalOpen(false); setCsvFile(null); }} className="text-slate-400 hover:text-slate-600"><span className="material-symbols-outlined">close</span></button>
                  </div>
                  <div className="p-4 sm:p-8 flex flex-col gap-4 sm:gap-6 overflow-y-auto">
                      <div className="bg-blue-50 text-blue-800 p-3.5 sm:p-4 rounded-xl border border-blue-100 text-xs sm:text-sm">
                          <p className="font-bold mb-1.5">Instrucciones:</p>
                          <p className="mb-2 text-xs">El archivo CSV debe contener exactamente los siguientes encabezados:</p>
                          <code className="block bg-white p-2 rounded border border-blue-200 font-mono text-[11px] font-bold text-blue-900 break-all">
                              TIPO, DOCUMENTO, EXPEDIENTE, DESTINO, ASUNTO, ESTADO, FECHA, ENLACE
                          </code>
                          <ul className="list-disc pl-4 mt-2 text-[11px] space-y-1">
                              <li><strong>TIPO:</strong> Oficio, Informe, Carta, etc.</li>
                              <li><strong>DOCUMENTO:</strong> Ej. 015-2024</li>
                              <li><strong>EXPEDIENTE:</strong> Ej. 202412345 (Opcional)</li>
                              <li><strong>DESTINO:</strong> (Opcional) Oficina o persona</li>
                              <li><strong>ASUNTO:</strong> Descripción del documento</li>
                              <li><strong>ESTADO:</strong> Pendiente, Finalizado, etc.</li>
                              <li><strong>FECHA:</strong> DD/MM/YYYY o YYYY-MM-DD</li>
                              <li><strong>ENLACE:</strong> URL en Drive (Opcional)</li>
                          </ul>
                      </div>

                      <div className="relative">
                          <input type="file" ref={csvInputRef} onChange={e => setCsvFile(e.target.files?.[0] || null)} className="hidden" accept=".csv" />
                          <button onClick={() => csvInputRef.current?.click()} className={`w-full h-14 sm:h-16 border-2 border-dashed rounded-2xl flex items-center justify-center gap-2.5 text-xs sm:text-sm font-black uppercase transition-all ${csvFile ? 'border-primary bg-primary/5 text-primary' : 'border-slate-300 text-slate-500 hover:bg-slate-50'}`}>
                              <span className="material-symbols-outlined text-lg">{csvFile ? 'verified' : 'upload_file'}</span>
                              <span className="truncate max-w-[280px]">{csvFile ? csvFile.name : 'SELECCIONAR ARCHIVO CSV'}</span>
                          </button>
                      </div>
                  </div>
                  <div className="px-5 sm:px-8 py-3.5 sm:py-5 bg-slate-50 border-t flex flex-col-reverse sm:flex-row justify-end gap-2 sm:gap-3 shrink-0">
                      <button onClick={() => { setIsImportModalOpen(false); setCsvFile(null); }} className="px-4 py-2.5 text-xs font-black uppercase text-slate-400 hover:text-slate-600 text-center">Cancelar</button>
                      <button onClick={handleImportCSV} disabled={isSubmitting || !csvFile} className="px-6 sm:px-10 py-3 sm:py-3.5 bg-primary text-white rounded-xl sm:rounded-2xl text-xs font-black uppercase shadow-xl shadow-primary/30 disabled:opacity-50">
                          {isSubmitting ? 'IMPORTANDO...' : 'INICIAR IMPORTACIÓN'}
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* CONTENEDOR DE EXPEDIENTES (VISTA RESPONSIVA MÓVIL Y TABLA ESCRITORIO) */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden flex-1 flex flex-col">
        {loading ? (
             <div className="py-20 flex-1 flex flex-col items-center justify-center gap-2">
               <span className="material-symbols-outlined text-4xl text-primary animate-spin">progress_activity</span>
               <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Cargando expedientes...</span>
             </div>
        ) : files.length === 0 ? (
             <div className="py-16 px-4 flex flex-col items-center justify-center text-center gap-3">
               <div className="size-14 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center">
                 <span className="material-symbols-outlined text-2xl">folder_off</span>
               </div>
               <p className="text-slate-700 font-bold text-sm">No se encontraron expedientes de salida</p>
               <p className="text-slate-400 text-xs max-w-sm">
                 {searchQuery || currentFilter !== 'Todos'
                   ? 'No hay resultados para los filtros aplicados. Pruebe cambiando la búsqueda o el filtro de estado.'
                   : 'Comience registrando una nueva salida institucional con el botón "Registrar Salida".'}
               </p>
             </div>
        ) : (
            <>
                {/* 1. VISTA MÓVIL (TARJETAS TOTALMENTE RESPONSIVAS PARA SMARTPHONES) */}
                <div className="block md:hidden divide-y divide-slate-100 overflow-y-auto">
                    {files.map((file) => {
                        const isMenuOpen = activeMenuId === `m-${file.id}`;
                        return (
                            <div key={file.id} className="p-3.5 sm:p-4 hover:bg-slate-50/70 transition-colors flex flex-col gap-2.5">
                                {/* Encabezado de la tarjeta móvil */}
                                <div className="flex items-start justify-between gap-2">
                                    <div className="flex flex-col min-w-0">
                                        <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 leading-none mb-1">{file.docType}</span>
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                            <span className="font-mono font-bold text-slate-900 text-sm">{file.docNumber}</span>
                                            {file.count > 1 && (
                                                <span className="bg-indigo-100 text-indigo-700 text-[10px] font-black px-1.5 py-0.5 rounded-md">
                                                    x{file.count}
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-1.5 shrink-0 relative">
                                        {/* Selector rápido de estado */}
                                        <select
                                            value={file.status}
                                            onChange={(e) => handleQuickStatusChange(file.id, e.target.value)}
                                            className={`px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider outline-none cursor-pointer appearance-none text-center font-sans ${
                                                file.status === 'Finalizado' ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' :
                                                file.status === 'Observado' ? 'bg-amber-100 text-amber-800 border border-amber-200' :
                                                file.status === 'Archivado' ? 'bg-slate-200 text-slate-700 border border-slate-300' :
                                                'bg-blue-100 text-blue-800 border border-blue-200'
                                            }`}
                                        >
                                            <option value="Pendiente" className="bg-white text-slate-900">PENDIENTE</option>
                                            <option value="Finalizado" className="bg-white text-slate-900">FINALIZADO</option>
                                            <option value="Observado" className="bg-white text-slate-900">OBSERVADO</option>
                                            <option value="Archivado" className="bg-white text-slate-900">ARCHIVADO</option>
                                        </select>

                                        {/* Botón 3 puntos */}
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setActiveMenuId(isMenuOpen ? null : `m-${file.id}`);
                                            }}
                                            className="size-8 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700 flex items-center justify-center transition-colors"
                                            title="Opciones"
                                        >
                                            <span className="material-symbols-outlined text-lg">more_vert</span>
                                        </button>

                                        {/* Dropdown 3 puntos en móvil */}
                                        {isMenuOpen && (
                                            <div 
                                                onClick={(e) => e.stopPropagation()} 
                                                className="absolute right-0 top-9 mt-1 w-52 bg-white rounded-2xl shadow-2xl border border-slate-200 py-1.5 z-50 text-left animate-in fade-in zoom-in-95"
                                            >
                                                <button 
                                                    onClick={() => { handleOpenTracking(file); setActiveMenuId(null); }}
                                                    className="w-full text-left px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-2.5"
                                                >
                                                    <span className="material-symbols-outlined text-[17px] text-slate-500">route</span> Seguimiento
                                                </button>
                                                <button 
                                                    onClick={() => { handleOpenUnifiedTimeline(file); setActiveMenuId(null); }}
                                                    className="w-full text-left px-4 py-2.5 text-xs font-bold text-indigo-600 hover:bg-indigo-50 flex items-center gap-2.5"
                                                >
                                                    <span className="material-symbols-outlined text-[17px]">history</span> Historial
                                                </button>
                                                {file.pdfUrl && (
                                                    <a 
                                                        href={isGoogleDriveUrl(file.pdfUrl) ? formatDriveViewUrl(file.pdfUrl) : file.pdfUrl} 
                                                        target="_blank" 
                                                        rel="noopener noreferrer"
                                                        onClick={() => setActiveMenuId(null)}
                                                        className="w-full text-left px-4 py-2.5 text-xs font-bold text-emerald-700 hover:bg-emerald-50 flex items-center gap-2.5"
                                                    >
                                                        <span className="material-symbols-outlined text-[17px] text-emerald-600">description</span>
                                                        Ver Documento PDF
                                                    </a>
                                                )}
                                                {(user.role === 'Administrador' || user.role === 'Operador' || user.role === 'Director') && (
                                                    <>
                                                        <button 
                                                            onClick={() => { handleEdit(file); setActiveMenuId(null); }}
                                                            className="w-full text-left px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-2.5 border-t border-slate-100"
                                                        >
                                                            <span className="material-symbols-outlined text-[17px] text-slate-500">edit</span> Editar
                                                        </button>
                                                        <button 
                                                            onClick={() => { handleDelete(file.id); setActiveMenuId(null); }}
                                                            className="w-full text-left px-4 py-2.5 text-xs font-bold text-rose-600 hover:bg-rose-50 flex items-center gap-2.5"
                                                        >
                                                            <span className="material-symbols-outlined text-[17px]">delete</span> Eliminar
                                                        </button>
                                                    </>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Destino y Expediente */}
                                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                                    <div className="flex items-center gap-1.5 text-slate-700 font-bold uppercase min-w-0">
                                        <span className="material-symbols-outlined text-[15px] text-slate-400 shrink-0">send</span>
                                        <span className="truncate">{file.destination}</span>
                                    </div>
                                    {file.refNumber && file.refNumber !== '-' && (
                                        <div className="flex items-center gap-1 text-[11px] text-slate-500 font-mono">
                                            <span className="text-slate-400 font-sans font-bold">Exp:</span>
                                            <span className="font-bold">{file.refNumber}</span>
                                        </div>
                                    )}
                                </div>

                                {/* Asunto */}
                                <p className="text-xs font-bold text-slate-800 uppercase leading-relaxed bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                                    {file.subject}
                                </p>

                                {/* Pie de tarjeta móvil: Fecha + Botón directo a PDF si existe */}
                                <div className="flex items-center justify-between pt-1 text-[11px] text-slate-400">
                                    <div className="flex items-center gap-1 font-medium">
                                        <span className="material-symbols-outlined text-[14px]">calendar_today</span>
                                        <span>{file.dateTime}</span>
                                    </div>
                                    {file.pdfUrl && (
                                        <a 
                                            href={isGoogleDriveUrl(file.pdfUrl) ? formatDriveViewUrl(file.pdfUrl) : file.pdfUrl} 
                                            target="_blank" 
                                            rel="noopener noreferrer"
                                            className="inline-flex items-center gap-1 text-xs font-black text-indigo-600 hover:text-indigo-800 hover:underline"
                                        >
                                            <span className="material-symbols-outlined text-[14px]">open_in_new</span>
                                            Ver PDF
                                        </a>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* 2. VISTA ESCRITORIO / TABLET (TABLA COMPLETA CON CABECERA FIJA) */}
                <div className="hidden md:block flex-1 overflow-auto">
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
                                        <div className="flex flex-col items-start gap-0.5">
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
                                            <div 
                                                onClick={(e) => e.stopPropagation()}
                                                className="absolute right-10 top-10 mt-1 w-48 bg-white rounded-xl shadow-xl border border-slate-100 py-1 z-50 text-left"
                                            >
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
                                                        href={isGoogleDriveUrl(file.pdfUrl) ? formatDriveViewUrl(file.pdfUrl) : file.pdfUrl} 
                                                        target="_blank" 
                                                        rel="noopener noreferrer"
                                                        onClick={(e) => e.stopPropagation()}
                                                        className="w-full text-left px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                                                    >
                                                        <span className="material-symbols-outlined text-[16px] text-emerald-600">
                                                          description
                                                        </span>
                                                        Ver Documento PDF
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
            </>
        )}
      </div>

      {/* PENDING FOLLOWUP REPORT MODAL */}
      {isPendingReportOpen && (
        <PendingFollowupModal onClose={() => setIsPendingReportOpen(false)} />
      )}

      {/* GOOGLE DRIVE CONFIGURATION MODAL (SOLO ADMIN) */}
      {isAdmin && (
        <DriveConfigModal
          isOpen={isDriveConfigOpen}
          onClose={() => setIsDriveConfigOpen(false)}
          onConfigSaved={(cfg) => setDriveConfig(cfg)}
        />
      )}

      {/* ACTION FEEDBACK TOAST */}
      {actionFeedback && (
        <div className={`fixed bottom-6 right-6 z-50 px-5 py-3.5 rounded-2xl shadow-2xl flex items-center gap-3 animate-in slide-in-from-bottom ${actionFeedback.type === 'success' ? 'bg-emerald-800 text-white' : 'bg-rose-800 text-white'}`}>
          <span className="material-symbols-outlined text-lg">{actionFeedback.type === 'success' ? 'check_circle' : 'error'}</span>
          <span className="text-xs font-bold">{actionFeedback.message}</span>
          <button type="button" onClick={() => setActionFeedback(null)} className="ml-2 opacity-70 hover:opacity-100">
            <span className="material-symbols-outlined text-sm">close</span>
          </button>
        </div>
      )}
    </div>
  );
};
