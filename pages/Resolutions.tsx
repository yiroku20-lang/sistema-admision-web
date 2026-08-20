
import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Resolution, User } from '../types';
import Papa from 'papaparse';

export const Resolutions: React.FC<{ user: User }> = ({ user }) => {
  const [resolutions, setResolutions] = useState<Resolution[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  const [editingId, setEditingId] = useState<string | null>(null);
  const [parentId, setParentId] = useState<string | null>(null);
  const [number, setNumber] = useState('');
  const [date, setDate] = useState('');
  const [subject, setSubject] = useState('');
  const [driveUrl, setDriveUrl] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Import Modal State
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchResolutions();
  }, [searchQuery]);

  const fetchResolutions = async () => {
    try {
      setLoading(true);
      let query = supabase.from('resolutions').select('*, children:resolutions(*)').is('parent_id', null);
      if (searchQuery.trim()) query = query.or(`number.ilike.%${searchQuery.trim()}%,subject.ilike.%${searchQuery.trim()}%`);
      const { data } = await query.order('date', { ascending: false });
      if (data) {
        setResolutions(data.map((item: any) => ({
            id: item.id, number: item.number, date: item.date,
            subject: item.subject, pdfUrl: item.pdf_url, tag: item.tag,
            children: item.children ? item.children.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime()) : []
        })));
      }
    } catch (err) { console.error(err); } finally { setLoading(false); }
  };

  const handleSave = async () => {
      if (!number || !date) return;
      setIsSubmitting(true);
      
      let finalPdfUrl = driveUrl.trim();

      try {
          if (selectedFile) {
              const fileExt = selectedFile.name.split('.').pop();
              const fileName = `res_${Date.now()}.${fileExt}`;
              const { error: uploadError } = await supabase.storage
                  .from('documentos')
                  .upload(`resoluciones/${fileName}`, selectedFile, {
                      contentType: 'application/pdf',
                      upsert: true
                  });
              
              if (uploadError) throw uploadError;
              
              const { data: urlData } = supabase.storage
                  .from('documentos')
                  .getPublicUrl(`resoluciones/${fileName}`);
                  
              finalPdfUrl = urlData.publicUrl;
          }

          const payload: any = { number, date, subject: subject.toUpperCase(), pdf_url: finalPdfUrl, parent_id: parentId };
          
          if (editingId) {
              await supabase.from('resolutions').update(payload).eq('id', editingId);
          } else {
              await supabase.from('resolutions').insert([payload]);
          }
          fetchResolutions(); closeModal();
      } catch (err: any) { 
          alert(`Error al guardar: ${err.message}`);
          console.error(err); 
      } finally { 
          setIsSubmitting(false); 
      }
  };

  const openComplementary = (parent: Resolution) => {
      setParentId(parent.id);
      setSubject(`COMPLEMENTARIA A ${parent.number}`);
      setIsModalOpen(true);
  };

  const openEdit = (res: Resolution) => {
      setEditingId(res.id);
      setNumber(res.number);
      setDate(res.date);
      setSubject(res.subject);
      setDriveUrl(res.pdfUrl || '');
      setIsModalOpen(true);
  };

  const closeModal = () => {
      setIsModalOpen(false); setEditingId(null); setParentId(null); setNumber(''); setDate(''); setSubject(''); setDriveUrl(''); setSelectedFile(null);
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
                      // Expected headers: NUMERO, FECHA, ASUNTO, ENLACE
                      
                      // Handle optional date parsing if provided
                      let resDate = null;
                      if (row.FECHA) {
                          // Try to parse DD/MM/YYYY or YYYY-MM-DD
                          const parts = row.FECHA.split('/');
                          if (parts.length === 3) {
                              // Assuming DD/MM/YYYY
                              resDate = `${parts[2]}-${parts[1]}-${parts[0]}`;
                          } else {
                              const d = new Date(row.FECHA);
                              if (!isNaN(d.getTime())) {
                                  resDate = d.toISOString().split('T')[0];
                              }
                          }
                      }

                      return {
                          number: row.NUMERO || '',
                          date: resDate,
                          subject: (row.ASUNTO || '').toUpperCase(),
                          pdf_url: row.ENLACE || '',
                          parent_id: null // Assuming imported records are top-level for simplicity
                      };
                  });

                  // Filter out empty rows
                  const validRecords = recordsToInsert.filter(r => r.number && r.subject);

                  if (validRecords.length === 0) {
                      throw new Error("No se encontraron registros válidos en el CSV. Verifique los encabezados.");
                  }

                  const { error } = await supabase.from('resolutions').insert(validRecords);
                  if (error) throw error;

                  alert(`Se importaron ${validRecords.length} registros correctamente.`);
                  setIsImportModalOpen(false);
                  setCsvFile(null);
                  fetchResolutions();
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

  return (
    <div className="w-full max-w-[1400px] mx-auto flex flex-col gap-6 p-6 md:p-8 h-full overflow-hidden">
      
      {/* MODAL REGISTRO / COMPLEMENTARIA */}
      {isModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in zoom-in-95">
              <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden">
                  <div className="px-8 py-6 border-b bg-slate-50 flex justify-between items-center">
                      <h3 className="font-black text-slate-900 uppercase">
                          {editingId ? 'Editar Resolución' : parentId ? 'Añadir Complementaria' : 'Nueva Resolución'}
                      </h3>
                      <button onClick={closeModal}><span className="material-symbols-outlined">close</span></button>
                  </div>
                  <div className="p-8 flex flex-col gap-4">
                      <div className="grid grid-cols-2 gap-4">
                          <label className="flex flex-col gap-1">
                              <span className="text-[10px] font-black text-slate-500 uppercase">Número</span>
                              <input value={number} onChange={e => setNumber(e.target.value)} className="h-12 px-4 rounded-xl border-2 border-slate-100 bg-slate-50 font-bold outline-none" placeholder="R-2024..." />
                          </label>
                          <label className="flex flex-col gap-1">
                              <span className="text-[10px] font-black text-slate-500 uppercase">Fecha</span>
                              <input type="date" value={date} onChange={e => setDate(e.target.value)} className="h-12 px-4 rounded-xl border-2 border-slate-100 bg-slate-50 outline-none font-bold" />
                          </label>
                      </div>
                      <label className="flex flex-col gap-1">
                          <span className="text-[10px] font-black text-slate-500 uppercase">Asunto / Resumen</span>
                          <textarea value={subject} onChange={e => setSubject(e.target.value.toUpperCase())} className="h-24 p-4 rounded-xl border-2 border-slate-100 bg-slate-50 font-bold resize-none text-xs" />
                      </label>
                      <div className="border-t pt-4 flex flex-col gap-4">
                          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Adjuntar Resolución PDF</span>
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
                      <button onClick={closeModal} className="px-4 py-2 text-xs font-black text-slate-400 uppercase">Cancelar</button>
                      <button onClick={handleSave} disabled={isSubmitting} className="px-10 py-3 bg-primary text-white rounded-xl text-xs font-black uppercase shadow-xl">
                          {isSubmitting ? 'GUARDANDO...' : 'GUARDAR CAMBIOS'}
                      </button>
                  </div>
              </div>
          </div>
      )}

      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-6 shrink-0">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl sm:text-4xl font-black leading-tight tracking-tighter text-slate-900">Repositorio de Resoluciones</h1>
          <p className="text-slate-500 text-base font-normal">Archivo digital con jerarquía de documentos complementarios.</p>
        </div>
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 w-full md:w-auto">
            <div className="relative w-full sm:w-64">
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[20px]">search</span>
                <input 
                    type="text" 
                    placeholder="Buscar resolución..." 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full h-11 pl-10 pr-4 rounded-lg border-2 border-slate-200 bg-white text-sm font-bold text-slate-700 outline-none focus:border-primary transition-colors"
                />
            </div>
            {(user.role === 'Administrador' || (user.role === 'Operador' && user.permissions?.includes('upload_csv'))) && (
              <button onClick={() => setIsImportModalOpen(true)} className="flex items-center justify-center gap-2 bg-white border-2 border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-50 h-11 px-6 rounded-lg font-bold transition-all active:scale-95 w-full sm:w-auto">
                  <span className="material-symbols-outlined">upload_file</span>
                  Importar CSV
              </button>
            )}
            {(user.role === 'Administrador' || user.role === 'Operador' || user.role === 'Director') && (
              <button onClick={() => setIsModalOpen(true)} className="flex items-center justify-center gap-2 bg-slate-900 text-white h-11 px-6 rounded-lg font-bold shadow-lg shadow-slate-900/20 active:scale-95 transition-all w-full sm:w-auto">
                <span className="material-symbols-outlined">add</span>
                Nueva Resolución
              </button>
            )}
        </div>
      </div>

      {/* IMPORT MODAL */}
      {isImportModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in zoom-in-95">
              <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col">
                  <div className="px-8 py-6 border-b flex justify-between items-center bg-slate-50">
                      <h3 className="font-black text-slate-900 uppercase tracking-tight">IMPORTAR RESOLUCIONES (CSV)</h3>
                      <button onClick={() => { setIsImportModalOpen(false); setCsvFile(null); }} className="text-slate-400 hover:text-slate-600"><span className="material-symbols-outlined">close</span></button>
                  </div>
                  <div className="p-8 flex flex-col gap-6">
                      <div className="bg-blue-50 text-blue-800 p-4 rounded-xl border border-blue-100 text-sm">
                          <p className="font-bold mb-2">Instrucciones:</p>
                          <p className="mb-2">El archivo CSV debe contener exactamente los siguientes encabezados en la primera fila:</p>
                          <code className="block bg-white p-2 rounded border border-blue-200 font-mono text-xs font-bold text-blue-900">
                              NUMERO, FECHA, ASUNTO, ENLACE
                          </code>
                          <ul className="list-disc pl-5 mt-2 text-xs space-y-1">
                              <li><strong>NUMERO:</strong> Ej. R-001-2024-VRAC</li>
                              <li><strong>FECHA:</strong> Formato DD/MM/YYYY o YYYY-MM-DD</li>
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

      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm flex-1 flex flex-col">
        {loading ? (
             <div className="flex-1 flex flex-col items-center justify-center"><span className="material-symbols-outlined text-4xl text-primary animate-spin">progress_activity</span></div>
        ) : (
            <div className="flex-1 overflow-auto">
                <table className="w-full text-left border-collapse min-w-[1000px]">
                    <thead className="sticky top-0 z-10 bg-slate-50 shadow-sm">
                        <tr>
                            <th className="px-6 py-4 text-[10px] font-black uppercase text-slate-500 w-32">Nº Res.</th>
                            <th className="px-6 py-4 text-[10px] font-black uppercase text-slate-500 w-32">Fecha</th>
                            <th className="px-6 py-4 text-[10px] font-black uppercase text-slate-500">Asunto</th>
                            <th className="px-6 py-4 text-[10px] font-black uppercase text-slate-500 text-right pr-10 w-48">Gestión</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {resolutions.map((res) => (
                            <React.Fragment key={res.id}>
                                <tr className="hover:bg-slate-50 transition-colors bg-white">
                                    <td className="px-6 py-4 font-mono font-bold text-slate-700 text-sm">{res.number}</td>
                                    <td className="px-6 py-4 text-xs font-bold text-slate-400">{res.date}</td>
                                    <td className="px-6 py-4"><p className="text-sm font-bold text-slate-900 line-clamp-1">{res.subject}</p></td>
                                    <td className="px-6 py-4 text-right pr-10">
                                        <div className="flex justify-end gap-2">
                                            {(user.role === 'Administrador' || user.role === 'Operador' || user.role === 'Director') && (
                                              <>
                                                <button onClick={() => openComplementary(res)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded" title="Complementaria"><span className="material-symbols-outlined">account_tree</span></button>
                                                <button onClick={() => openEdit(res)} className="p-1.5 text-slate-400 hover:bg-slate-100 rounded" title="Editar"><span className="material-symbols-outlined">edit</span></button>
                                              </>
                                            )}
                                            {res.pdfUrl && <button onClick={() => window.open(res.pdfUrl, '_blank')} className="p-1.5 text-red-600 hover:bg-red-50 rounded" title="Ver PDF"><span className="material-symbols-outlined">open_in_new</span></button>}
                                        </div>
                                    </td>
                                </tr>
                                {res.children?.map((child: any) => (
                                    <tr key={child.id} className="bg-slate-50/50 hover:bg-slate-50 transition-colors">
                                        <td className="px-10 py-3 font-mono text-[11px] font-bold text-slate-500">↳ {child.number}</td>
                                        <td className="px-6 py-3 text-[10px] font-bold text-slate-400">{child.date}</td>
                                        <td className="px-6 py-3"><p className="text-xs font-medium text-slate-600 italic">Complemento: {child.subject}</p></td>
                                        <td className="px-6 py-3 text-right pr-10">
                                            <div className="flex justify-end gap-1">
                                                {(user.role === 'Administrador' || user.role === 'Operador' || user.role === 'Director') && (
                                                  <button onClick={() => openEdit(child)} className="p-1 text-slate-400 hover:text-slate-900 transition-colors"><span className="material-symbols-outlined text-[16px]">edit</span></button>
                                                )}
                                                {child.pdf_url && <button onClick={() => window.open(child.pdf_url, '_blank')} className="p-1 text-red-600 hover:text-red-900 transition-colors"><span className="material-symbols-outlined text-[16px]">picture_as_pdf</span></button>}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </React.Fragment>
                        ))}
                    </tbody>
                </table>
            </div>
        )}
      </div>
    </div>
  );
};
