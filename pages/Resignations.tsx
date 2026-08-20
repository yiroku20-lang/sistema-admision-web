
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Resignation, User } from '../types';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';

export const Resignations: React.FC<{ user: User }> = ({ user }) => {
  const [resignations, setResignations] = useState<Resignation[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentFilter, setCurrentFilter] = useState('Pendiente Resolución');
  
  // New filters for Finalizados
  const [semesterFilter, setSemesterFilter] = useState('Todos');
  const [modalityFilter, setModalityFilter] = useState('Todos');
  
  // Finalize Modal State
  const [isFinalizeModalOpen, setIsFinalizeModalOpen] = useState(false);
  const [targetResignation, setTargetResignation] = useState<Resignation | null>(null);
  const [resNumber, setResNumber] = useState('');
  const [resDate, setResDate] = useState('');
  const [resDriveUrl, setResDriveUrl] = useState('');
  const [resFile, setResFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Import Modal State
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchResignations();
  }, [searchQuery, currentFilter]);

  const fetchResignations = async () => {
    try {
      setLoading(true);
      let query = supabase.from('renuncias').select('*');
      if (currentFilter !== 'Todos') query = query.eq('status', currentFilter);
      if (searchQuery.trim()) query = query.or(`student_name.ilike.%${searchQuery.trim()}%,student_code.ilike.%${searchQuery.trim()}%`);
      const { data } = await query
        .order('resolution_date', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false });
      
      if (data) {
        const studentCodes = data.map(r => r.student_code).filter(Boolean);
        if (studentCodes.length > 0) {
            const { data: partData } = await supabase.from('participantes')
                .select('CODPOSTULANTE, MODALIDAD')
                .in('CODPOSTULANTE', studentCodes);
            
            const modalityMap = new Map();
            if (partData) {
                partData.forEach(p => modalityMap.set(p.CODPOSTULANTE, p.MODALIDAD));
            }
            
            const enrichedData = data.map(r => ({
                ...r,
                modality: modalityMap.get(r.student_code) || 'NO REGISTRADA'
            }));
            setResignations(enrichedData);
        } else {
            setResignations(data);
        }
      }
    } catch (err) { console.error(err); } finally { setLoading(false); }
  };

  const handleFinalize = async () => {
      if (!targetResignation || !resNumber || !resDate) return;
      setIsSubmitting(true);
      try {
          let finalUrl = resDriveUrl.trim();

          if (resFile) {
              const sanitizedName = resFile.name.replace(/[^a-zA-Z0-9.]/g, '_');
              const fileName = `${Date.now()}-${sanitizedName}`;
              const { error: uploadError } = await supabase.storage
                  .from('documentos')
                  .upload(`resoluciones/${fileName}`, resFile, {
                      contentType: 'application/pdf',
                      upsert: true
                  });

              if (uploadError) throw uploadError;

              const { data: urlData } = supabase.storage
                  .from('documentos')
                  .getPublicUrl(`resoluciones/${fileName}`);
              
              finalUrl = urlData.publicUrl;
          }

          await supabase.from('renuncias').update({
              status: 'Finalizado',
              resolution_number: resNumber,
              resolution_date: resDate,
              resolution_pdf: finalUrl
          }).eq('id', targetResignation.id);
          setIsFinalizeModalOpen(false);
          setResFile(null);
          setResDriveUrl('');
          fetchResignations();
      } catch (err) { console.error(err); } finally { setIsSubmitting(false); }
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
                      // Helper to find value by case-insensitive key
                      const getVal = (possibleKeys: string[]) => {
                          const foundKey = Object.keys(row).find(k => 
                              possibleKeys.some(pk => pk.toLowerCase() === k.toLowerCase().trim())
                          );
                          return foundKey ? row[foundKey] : '';
                      };

                      return {
                          student_name: (getVal(['ESTUDIANTE', 'NOMBRE', 'STUDENT_NAME']) || '').toUpperCase(),
                          student_code: getVal(['CODIGO', 'COD', 'STUDENT_CODE']),
                          school: (getVal(['ESCUELA', 'SCHOOL', 'FACULTAD']) || '').toUpperCase(),
                          semester: getVal(['SEMESTRE', 'SEMESTER']),
                          expediente_number: getVal(['EXPEDIENTE', 'EXPEDIENTE_NUMBER', 'EXP']),
                          informe_number: getVal(['INFORME_NUM', 'INFORME_NUMBER', 'NRO_INFORME']),
                          status: getVal(['ESTADO', 'STATUS']) || 'Pendiente Resolución',
                          informe_pdf: getVal(['INFORME_PDF', 'LINK_INFORME']),
                          resolution_pdf: getVal(['RESOLUCION_PDF', 'LINK_RESOLUCION', 'RES_PDF']),
                          resolution_number: getVal(['RESOLUCION_NUM', 'RESOLUTION_NUMBER', 'NRO_RESOLUCION']),
                          resolution_date: getVal(['RESOLUCION_FECHA', 'RESOLUTION_DATE', 'FECHA_RESOLUCION']) || null
                      };
                  });

                  // Filter out empty rows
                  const validRecords = recordsToInsert.filter(r => r.student_name && r.student_code);

                  if (validRecords.length === 0) {
                      throw new Error("No se encontraron registros válidos. Asegúrese de que las columnas tengan los nombres correctos (ESTUDIANTE, CODIGO, ESCUELA, SEMESTRE, EXPEDIENTE, INFORME_NUM, RESOLUCION_NUM).");
                  }

                  const { error } = await supabase.from('renuncias').insert(validRecords);
                  if (error) throw error;

                  alert(`Se importaron ${validRecords.length} registros correctamente.`);
                  setIsImportModalOpen(false);
                  setCsvFile(null);
                  fetchResignations();
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

  const filteredResignations = useMemo(() => {
    return resignations.filter(r => {
      if (currentFilter === 'Finalizado') {
        if (semesterFilter !== 'Todos' && r.semester !== semesterFilter) return false;
        if (modalityFilter !== 'Todos' && r.modality !== modalityFilter) return false;
      }
      return true;
    });
  }, [resignations, currentFilter, semesterFilter, modalityFilter]);

  const uniqueSemesters = useMemo(() => {
    const sems = new Set(resignations.map(r => r.semester).filter(Boolean));
    return Array.from(sems).sort();
  }, [resignations]);

  const uniqueModalities = useMemo(() => {
    const mods = new Set(resignations.map(r => r.modality).filter(Boolean));
    return Array.from(mods).sort();
  }, [resignations]);

  const handleExportExcel = () => {
    const dataToExport = filteredResignations.map(r => ({
      'ESTADO': r.status,
      'ESTUDIANTE': r.student_name,
      'CÓDIGO': r.student_code,
      'ESCUELA': r.school,
      'SEMESTRE': r.semester,
      'MODALIDAD': r.modality || 'NO REGISTRADA',
      'Nº EXPEDIENTE': r.expediente_number,
      'Nº INFORME': r.informe_number,
      'Nº RESOLUCIÓN': r.resolution_number || '',
      'FECHA RESOLUCIÓN': r.resolution_date || '',
      'FECHA REGISTRO': new Date(r.created_at).toLocaleDateString()
    }));

    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Renuncias");
    XLSX.writeFile(wb, `Reporte_Renuncias_${new Date().getTime()}.xlsx`);
  };

  return (
    <div className="w-full max-w-[1400px] mx-auto flex flex-col gap-6 p-6 md:p-8 h-full overflow-hidden">
      
      {/* MODAL FINALIZAR (CONCLUIR TRÁMITE) */}
      {isFinalizeModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
              <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-8 animate-in zoom-in-95">
                  <h3 className="font-black text-slate-900 uppercase text-xl mb-2 text-center">Concluir Renuncia</h3>
                  <p className="text-xs text-slate-500 mb-8 text-center uppercase font-bold tracking-tight">ALUMNO: {targetResignation?.student_name}</p>
                  
                  <div className="flex flex-col gap-4">
                      <label className="flex flex-col gap-1">
                          <span className="text-[10px] font-black text-slate-500 uppercase">Nº Resolución VRAC</span>
                          <input value={resNumber} onChange={e => setResNumber(e.target.value)} className="h-12 px-4 rounded-xl border-2 border-slate-100 bg-slate-50 font-bold outline-none" placeholder="R-001-2024-VRAC" />
                      </label>
                      <label className="flex flex-col gap-1">
                          <span className="text-[10px] font-black text-slate-500 uppercase">Fecha Emisión</span>
                          <input type="date" value={resDate} onChange={e => setResDate(e.target.value)} className="h-12 px-4 rounded-xl border-2 border-slate-100 bg-slate-50 font-bold outline-none" />
                      </label>
                      
                      <div className="flex flex-col gap-2 p-4 bg-slate-50 rounded-2xl border border-slate-100">
                          <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Documento de Resolución</span>
                          
                          <label className="flex flex-col gap-1.5">
                              <span className="text-[10px] font-bold text-slate-400 uppercase">Subir Archivo PDF</span>
                              <div className="relative">
                                  <input 
                                      type="file" 
                                      accept=".pdf"
                                      onChange={e => {
                                          if (e.target.files && e.target.files[0]) {
                                              setResFile(e.target.files[0]);
                                              setResDriveUrl('');
                                          }
                                      }}
                                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                                      disabled={!!resDriveUrl}
                                  />
                                  <div className={`h-12 px-4 rounded-xl border-2 border-dashed flex items-center justify-between transition-all ${resDriveUrl ? 'bg-slate-100 border-slate-200 opacity-50' : resFile ? 'bg-indigo-50 border-indigo-200' : 'bg-white border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/30'}`}>
                                      <span className={`text-xs font-bold truncate pr-4 ${resFile ? 'text-indigo-700' : 'text-slate-400'}`}>
                                          {resFile ? resFile.name : 'Seleccionar archivo PDF...'}
                                      </span>
                                      <span className={`material-symbols-outlined text-lg ${resFile ? 'text-indigo-500' : 'text-slate-300'}`}>
                                          {resFile ? 'check_circle' : 'upload_file'}
                                      </span>
                                  </div>
                              </div>
                          </label>

                          <div className="flex items-center gap-3 my-1">
                              <div className="h-px bg-slate-200 flex-1"></div>
                              <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">O</span>
                              <div className="h-px bg-slate-200 flex-1"></div>
                          </div>

                          <label className="flex flex-col gap-1.5">
                              <span className="text-[10px] font-bold text-slate-400 uppercase">Enlace de Drive</span>
                              <input 
                                  value={resDriveUrl} 
                                  onChange={e => {
                                      setResDriveUrl(e.target.value);
                                      if (e.target.value) setResFile(null);
                                  }} 
                                  className="h-12 px-4 rounded-xl border-2 border-slate-100 bg-white text-xs font-mono outline-none focus:border-indigo-300 transition-all disabled:opacity-50 disabled:bg-slate-100" 
                                  placeholder="https://drive.google.com/..." 
                                  disabled={!!resFile}
                              />
                          </label>
                      </div>
                  </div>

                  <div className="flex gap-3 mt-10">
                      <button onClick={() => { setIsFinalizeModalOpen(false); setResFile(null); setResDriveUrl(''); }} className="flex-1 font-black text-slate-400 uppercase text-xs">Cancelar</button>
                      <button onClick={handleFinalize} disabled={isSubmitting || !resNumber || !resDate || (!resFile && !resDriveUrl)} className="flex-[2] py-4 bg-green-600 text-white rounded-2xl font-black uppercase text-xs shadow-xl active:scale-95 transition-all disabled:opacity-50">
                          {isSubmitting ? 'PROCESANDO...' : 'FINALIZAR TRÁMITE'}
                      </button>
                  </div>
              </div>
          </div>
      )}

      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-6 shrink-0">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl sm:text-4xl font-black leading-tight tracking-tight text-slate-900">Trámite de Renuncias</h1>
          <p className="text-slate-500 text-base font-normal">Gestión integral de desvinculación académica.</p>
        </div>
        {(user.role === 'Administrador' || (user.role === 'Operador' && user.permissions?.includes('upload_csv'))) && (
          <button onClick={() => setIsImportModalOpen(true)} className="flex items-center gap-2 bg-white border-2 border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-50 h-12 px-6 rounded-xl font-black text-xs uppercase transition-all active:scale-95">
              <span className="material-symbols-outlined">upload_file</span>
              Importar CSV
          </button>
        )}
      </div>

      {/* IMPORT MODAL */}
      {isImportModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in zoom-in-95">
              <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col">
                  <div className="px-8 py-6 border-b flex justify-between items-center bg-slate-50">
                      <h3 className="font-black text-slate-900 uppercase tracking-tight">IMPORTAR RENUNCIAS (CSV)</h3>
                      <button onClick={() => { setIsImportModalOpen(false); setCsvFile(null); }} className="text-slate-400 hover:text-slate-600"><span className="material-symbols-outlined">close</span></button>
                  </div>
                  <div className="p-8 flex flex-col gap-6">
                      <div className="bg-blue-50 text-blue-800 p-4 rounded-xl border border-blue-100 text-sm">
                          <p className="font-bold mb-2">Instrucciones:</p>
                          <p className="mb-2">El archivo CSV debe contener los siguientes encabezados (no importa si son mayúsculas o minúsculas):</p>
                          <code className="block bg-white p-2 rounded border border-blue-200 font-mono text-[10px] font-bold text-blue-900 leading-relaxed">
                              ESTUDIANTE, CODIGO, ESCUELA, SEMESTRE, EXPEDIENTE, INFORME_NUM, ESTADO, INFORME_PDF, RESOLUCION_NUM, RESOLUCION_FECHA, RESOLUCION_PDF
                          </code>
                          <ul className="list-disc pl-5 mt-2 text-[10px] space-y-1">
                              <li><strong>ESTADO:</strong> "Pendiente Resolución" o "Finalizado" (Opcional)</li>
                              <li><strong>RESOLUCION_NUM:</strong> Solo si el estado es "Finalizado"</li>
                              <li><strong>RESOLUCION_PDF:</strong> Enlace de Drive/PDF</li>
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

      <div className="flex flex-col gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-sm shrink-0">
        <div className="flex flex-col lg:flex-row gap-4 justify-between items-center">
          <div className="w-full lg:w-96 relative">
            <span className="material-symbols-outlined absolute left-3 top-2.5 text-slate-400">search</span>
            <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="w-full h-10 pl-10 pr-4 rounded-lg border border-slate-200 bg-slate-50 text-sm focus:bg-white outline-none" placeholder="Buscar estudiante..." />
          </div>
          <div className="flex gap-2">
              {['Todos', 'Pendiente Resolución', 'Finalizado'].map(f => (
                  <button key={f} onClick={() => setCurrentFilter(f)} className={`px-4 py-1.5 rounded-full text-xs font-bold border transition-colors ${currentFilter === f ? 'bg-slate-800 text-white shadow-md' : 'bg-white text-slate-500 border-slate-200'}`}>{f === 'Pendiente Resolución' ? 'Pendientes' : f}</button>
              ))}
          </div>
        </div>

        {currentFilter === 'Finalizado' && (
          <div className="flex flex-col sm:flex-row gap-4 items-center justify-between pt-4 border-t border-slate-100">
            <div className="flex gap-4 w-full sm:w-auto">
              <label className="flex flex-col gap-1 w-full sm:w-48">
                <span className="text-[10px] font-black text-slate-500 uppercase">Semestre</span>
                <select value={semesterFilter} onChange={e => setSemesterFilter(e.target.value)} className="h-9 px-3 rounded-lg border border-slate-200 bg-slate-50 text-xs font-bold outline-none">
                  <option value="Todos">Todos los semestres</option>
                  {uniqueSemesters.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1 w-full sm:w-48">
                <span className="text-[10px] font-black text-slate-500 uppercase">Modalidad</span>
                <select value={modalityFilter} onChange={e => setModalityFilter(e.target.value)} className="h-9 px-3 rounded-lg border border-slate-200 bg-slate-50 text-xs font-bold outline-none">
                  <option value="Todos">Todas las modalidades</option>
                  {uniqueModalities.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </label>
            </div>
            <button onClick={handleExportExcel} className="flex items-center gap-2 bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 h-9 px-4 rounded-lg font-black text-xs uppercase transition-all whitespace-nowrap">
              <span className="material-symbols-outlined text-sm">download</span>
              Exportar Excel
            </button>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm flex-1 flex flex-col">
        {loading ? (
             <div className="flex-1 flex flex-col items-center justify-center"><span className="material-symbols-outlined text-4xl text-primary animate-spin">progress_activity</span></div>
        ) : (
            <div className="flex-1 overflow-auto">
                <table className="w-full text-left border-collapse min-w-[1000px]">
                    <thead className="sticky top-0 z-10 bg-slate-50 shadow-sm border-b">
                        <tr>
                            <th className="px-6 py-4 text-[10px] font-black uppercase text-slate-500">Estudiante</th>
                            <th className="px-6 py-4 text-[10px] font-black uppercase text-slate-500">Documentación</th>
                            <th className="px-6 py-4 text-[10px] font-black uppercase text-slate-500">Estado</th>
                            <th className="px-6 py-4 text-[10px] font-black uppercase text-slate-500 text-right pr-10">Acción</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                        {filteredResignations.map((item) => (
                            <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                                <td className="px-6 py-4">
                                    <p className="font-bold text-slate-900 text-sm uppercase">{item.student_name}</p>
                                    <p className="text-[10px] text-slate-400 font-bold uppercase">{item.student_code} • {item.school}</p>
                                    {item.modality && item.modality !== 'NO REGISTRADA' && (
                                        <p className="text-[9px] text-indigo-500 font-black uppercase mt-1 truncate max-w-[250px]" title={item.modality}>{item.modality}</p>
                                    )}
                                </td>
                                <td className="px-6 py-4">
                                    <div className="flex gap-2">
                                        {item.informe_pdf && <button onClick={() => window.open(item.informe_pdf, '_blank')} className="px-2 py-0.5 bg-blue-50 text-blue-600 rounded text-[9px] font-black border border-blue-100 uppercase">Ver Informe</button>}
                                        {item.resolution_pdf && <button onClick={() => window.open(item.resolution_pdf, '_blank')} className="px-2 py-0.5 bg-red-50 text-red-600 rounded text-[9px] font-black border border-red-100 uppercase">Ver Res.</button>}
                                    </div>
                                </td>
                                <td className="px-6 py-4">
                                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase border ${item.status === 'Finalizado' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-orange-50 text-orange-700 border-orange-200 animate-pulse'}`}>{item.status}</span>
                                </td>
                                <td className="px-6 py-4 text-right pr-10">
                                {item.status !== 'Finalizado' && user.role === 'Administrador' && (
                                        <button 
                                            onClick={() => { setTargetResignation(item); setResNumber(''); setResDate(''); setIsFinalizeModalOpen(true); }}
                                            className="px-4 py-1.5 bg-slate-900 text-white rounded-lg text-[10px] font-black uppercase hover:scale-105 transition-transform"
                                        >
                                            Finalizar
                                        </button>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        )}
      </div>
    </div>
  );
};
