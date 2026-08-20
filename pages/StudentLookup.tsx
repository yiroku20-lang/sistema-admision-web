import React, { useState, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Participant, User } from '../types';
import { useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

type SearchMode = 'individual' | 'batch' | 'import';

interface BatchResult {
    originalCode: string;
    originalName: string;
    found: boolean;
    status: 'EXACT' | 'PROBABLE' | 'NOT_FOUND';
    allMatches: Participant[];
}

export const StudentLookup: React.FC<{ user: User }> = ({ user }) => {
  const navigate = useNavigate();
  const [activeMode, setActiveMode] = useState<SearchMode>('individual');
  
  // Local API configuration (Cloudflare URL)
  const defaultApiUrl = 'https://june-entertainment-thanks-include.trycloudflare.com';
  const [localApiUrl] = useState(() => {
    const stored = localStorage.getItem('local_api_url');
    if (stored && (stored.includes('night-fan-profiles-sides') || (stored.includes('trycloudflare.com') && !stored.includes('june-entertainment-thanks-include')))) {
       localStorage.setItem('local_api_url', defaultApiUrl);
       return defaultApiUrl;
    }
    return stored || (import.meta as any).env?.VITE_API_URL || defaultApiUrl;
  });
  
  // State for toggling individual folders in local documents
  const [expandedFolders, setExpandedFolders] = useState<{[key: string]: boolean}>({});

  // Individual Search State
  const [searchQuery, setSearchQuery] = useState('');
  const [studentHistory, setStudentHistory] = useState<Participant[]>([]);
  const [candidates, setCandidates] = useState<Participant[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<React.ReactNode | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  // Batch Search State
  const [batchResults, setBatchResults] = useState<BatchResult[]>([]);
  const [isProcessingBatch, setIsProcessingBatch] = useState(false);
  const [batchProgress, setBatchProgress] = useState(0);
  const [batchStatusText, setBatchStatusText] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Import State
  const [importData, setImportData] = useState<any[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const importFileInputRef = useRef<HTMLInputElement>(null);

  // Modal State for Batch Detail
  const [selectedBatchHistory, setSelectedBatchHistory] = useState<Participant[] | null>(null);

  const [isEditing, setIsEditing] = useState(false);
  const [editingRecord, setEditingRecord] = useState<Participant | null>(null);
  const [editForm, setEditForm] = useState<Partial<Participant>>({});
  const [showSyncNameOption, setShowSyncNameOption] = useState(false);

  const [isAddingNew, setIsAddingNew] = useState(false);
  const [newStudentForm, setNewStudentForm] = useState<Partial<Participant>>({});

  const [renuncias, setRenuncias] = useState<any[]>([]);
  const [reservas, setReservas] = useState<any[]>([]);
  
  // Local Documents State
  const [localDocuments, setLocalDocuments] = useState<any[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [docsError, setDocsError] = useState<string | null>(null);

  const fetchExtraInfo = async (history: Participant[]) => {
      setExpandedFolders({});
      const studentCodes = Array.from(new Set(history.map(s => s.CODPOSTULANTE).filter(Boolean)));
      if (studentCodes.length === 0) {
          setRenuncias([]);
          setReservas([]);
          setLocalDocuments([]);
          return;
      }
      
      // Auto-fetch local documents from hybrid local API for the first code
      setLoadingDocs(true);
      setDocsError(null);
      try {
          const apiUrl = localApiUrl ? localApiUrl.replace(/\/$/, "") : 'https://night-fan-profiles-sides.trycloudflare.com';
          const resDocs = await fetch(`${apiUrl}/api/files/student-documents/${studentCodes[0]}`);
          if (!resDocs.ok) {
              if (resDocs.status === 404) {
                 setLocalDocuments([]);
                 setDocsError('No se encontraron documentos en el disco local.');
              } else {
                 throw new Error('Servidor local apagado o desconectado.');
              }
          } else {
              const data = await resDocs.json();
              // Array could be data or data.documents depending on how the other AI returned it
              setLocalDocuments(data.documents || data || []);
          }
      } catch (err: any) {
          setDocsError(err.message);
          setLocalDocuments([]);
      } finally {
          setLoadingDocs(false);
      }

      try {
          const [renReq, resReq] = await Promise.all([
              supabase.from('renuncias').select('*').in('student_code', studentCodes).eq('status', 'Finalizado'),
              supabase.from('reserva_vacantes_detalles').select('*, batch:reserva_vacantes_bloques(*)').in('student_code', studentCodes)
          ]);
          setRenuncias(renReq.data || []);
          setReservas(resReq.data || []);
      } catch (err) {
          console.error("Error fetching extra info:", err);
      }
  };


  const fixEncoding = (text: string | undefined | null) => {
      if (!text) return '';
      let fixed = text;
      fixed = fixed.replace(/INGENIER[\uFFFD?]A/g, 'INGENIERÍA'); 
      fixed = fixed.replace(/EL[\uFFFD?]CTRICA/g, 'ELÉCTRICA');   
      fixed = fixed.replace(/MEC[\uFFFD?]NICA/g, 'MECÁNICA');
      fixed = fixed.replace(/INFORM[\uFFFD?]TICA/g, 'INFORMÁTICA');
      fixed = fixed.replace(/MATEM[\uFFFD?]TICA/g, 'MATEMÁTICA');
      fixed = fixed.replace(/EDUCACI[\uFFFD?]N/g, 'EDUCACIÓN');
      fixed = fixed.replace(/COMUNICACI[\uFFFD?]N/g, 'COMUNICACIÓN');
      fixed = fixed.replace(/ADMINISTRACI[\uFFFD?]N/g, 'ADMINISTRACIÓN');
      fixed = fixed.replace(/BIOLOG[\uFFFD?]A/g, 'BIOLOGÍA');
      fixed = fixed.replace(/ARQUEOLOG[\uFFFD?]A/g, 'ARQUEOLOGÍA');
      fixed = fixed.replace(/ANTROPOLOG[\uFFFD?]A/g, 'ANTROPOLOGÍA');
      fixed = fixed.replace(/PSICOLOG[\uFFFD?]A/g, 'PSICOLOGÍA');
      fixed = fixed.replace(/OBSTETRICI[\uFFFD?]A/g, 'OBSTETRICIA');
      fixed = fixed.replace(/ENFERMER[\uFFFD?]A/g, 'ENFERMERÍA');
      fixed = fixed.replace(/NU[\uFFFD?]EZ/g, 'NUÑEZ').replace(/MU[\uFFFD?]OZ/g, 'MUÑOZ').replace(/ZU[\uFFFD?]IGA/g, 'ZUÑIGA');
      return fixed;
  };

  const getModalityAndSemesterFromPath = (pathStr: string | undefined | null) => {
      if (!pathStr || typeof pathStr !== 'string') {
          return 'EXPEDIENTE GENERAL';
      }
      const segments = pathStr.split(/[\/\\]/).map(s => s.trim()).filter(Boolean);
      let targetFolder = '';
      
      // Look back starting from the parent of the filename (segments.length - 2)
      for (let i = segments.length - 2; i >= 0; i--) {
          const seg = segments[i];
          const isNumeric = /^\d+$/.test(seg);
          const isDrive = /^[a-zA-Z]:$/.test(seg);
          // Ignore parent folders of the whole structure that are generic
          const isGenericRoot = seg.toUpperCase() === 'FOTOS_ARCHIVOS_ADMISION_CEPRU' || seg.toUpperCase() === 'FOTOS_ARCHIVOS_ADMISION';
          const isSystem = ['API', 'FILES', 'STUDENT-DOCUMENTS', 'STUDENT_DOCUMENTS'].includes(seg.toUpperCase());
          
          if (!isNumeric && !isDrive && !isGenericRoot && !isSystem) {
              targetFolder = seg;
              break;
          }
      }
      
      if (!targetFolder) {
          if (segments.length >= 2) {
              targetFolder = segments[segments.length - 2];
          } else {
              targetFolder = 'EXPEDIENTE GENERAL';
          }
      }
      
      let displayName = targetFolder.toUpperCase().replace(/_/g, ' ').trim();
      
      // Strip out common verbose prefix phrases so folder looks clean and professional
      displayName = displayName
          .replace(/^DOCUMENTOS ADMISION DE EL /g, '')
          .replace(/^DOCUMENTOS ADMISION DE LA /g, '')
          .replace(/^DOCUMENTOS ADMISION DE /g, '')
          .replace(/^DOCUMENTOS DE ADMISION /g, '')
          .replace(/^DOCUMENTOS ADMISION /g, '')
          .replace(/^DOCUMENTOS /g, '')
          .replace(/^ARCHIVOS ADMISION /g, '')
          .trim();
          
      // Ensure we format the year-semester code with a hyphen elegantly (e.g. 2023 I -> 2023-I, 2024 II -> 2024-II, 2025_II -> 2025-II)
      displayName = displayName.replace(/(\d{4})\s+(I+|X+)/g, "$1-$2");
      displayName = displayName.replace(/(\d{4})-(I+|X+)/g, "$1-$2");
      
      return displayName;
  };

  const getGroupedDocuments = (docs: any[]) => {
      const groups: { [key: string]: any[] } = {};
      if (!docs || !Array.isArray(docs)) return groups;
      
      docs.forEach(doc => {
          if (!doc) return;
          // Prefer relativePath since it's the exact clean path inside the H: drive root
          const rawPath = typeof doc === 'string' ? doc : (doc.relativePath || doc.path || doc.file_path || doc.url || '');
          
          let cleanPath = rawPath;
          if (rawPath.includes('?path=')) {
              try {
                  const match = rawPath.match(/[?&]path=([^&]+)/);
                  if (match) {
                      cleanPath = decodeURIComponent(match[1]);
                  }
              } catch (e) {
                  console.error("Error decoding path parameter:", e);
              }
          }
          
          const filename = typeof doc === 'string' 
              ? doc.split(/[\/\\]/).pop()! 
              : (doc.name || doc.filename || (cleanPath && typeof cleanPath === 'string' ? cleanPath.split(/[\/\\]/).pop() : '') || 'Documento sin nombre');
          
          const groupLabel = getModalityAndSemesterFromPath(cleanPath);
          
          if (!groups[groupLabel]) {
              groups[groupLabel] = [];
          }
          groups[groupLabel].push({
              path: cleanPath,
              filename,
              originalDoc: doc
          });
      });

      Object.keys(groups).forEach(groupLabel => {
          // Sort documents inside this folder alphabetically to guarantee sequential ordering of files (e.g., 1_1_*, 2_1_*, 3_1_*)
          groups[groupLabel].sort((a, b) => (a.filename || '').localeCompare(b.filename || ''));
          
          let pdfCounter = 1;
          
          groups[groupLabel] = groups[groupLabel].map(doc => {
              const ext = (doc.filename && typeof doc.filename === 'string' ? doc.filename.split('.').pop() : '')?.toUpperCase() || '';
              const isPdf = ext === 'PDF';
              const isImage = ['JPG', 'JPEG', 'PNG', 'WEBP', 'GIF'].includes(ext);
              
              let friendlyName = doc.filename;
              let docTypeLabel = '';
              
              const description = doc.originalDoc?.description;
              
              if (isImage) {
                  friendlyName = description || 'Foto';
                  docTypeLabel = 'Foto';
              } else if (isPdf) {
                  friendlyName = description || `Doc ${pdfCounter}`;
                  docTypeLabel = description || `Doc ${pdfCounter}`;
                  if (!description) {
                      pdfCounter++;
                  }
              } else {
                  friendlyName = description || doc.filename;
                  docTypeLabel = ext;
              }

              return {
                  ...doc,
                  isPdf,
                  isImage,
                  ext,
                  friendlyName,
                  docTypeLabel
              };
          });
      });
      
      return groups;
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setLoading(true); setError(null); setStudentHistory([]); setCandidates([]); setHasSearched(true);
    setRenuncias([]); setReservas([]);
    try {
      const term = searchQuery.trim();
      const isNumeric = /^\d+$/.test(term);
      
      let query = supabase.from('participantes').select('*');
      if (isNumeric) {
          query = query.eq('CODPOSTULANTE', term);
      } else {
          // Split by spaces, commas, hyphens and slashes to support any order/separators (like hyphenated names in the DB)
          const words = term.split(/[\s,\-/]+/).filter(Boolean);
          words.forEach(word => {
            // Replace vowels with '_' to be completely accent-insensitive and spelling-forgiving
            const agnostic = word.replace(/[aeiouáéíóúüAEIOUÁÉÍÓÚÜ]/g, '_');
            query = query.ilike('NOMBRE', `%${agnostic}%`);
          });
      }
      
      const { data, error: err } = await query.order('ANIO', { ascending: false }).order('SEMESTRE', { ascending: false });
      
      if (err) throw err;
      
      if (data && data.length > 0) {
          const uniqueNames = Array.from(new Set(data.map(d => d.NOMBRE)));
          if (uniqueNames.length === 1) {
              setStudentHistory(data);
              fetchExtraInfo(data);
          } else {
              const seen = new Set();
              const uniqueCandidates = data.filter(item => {
                  const key = item.NOMBRE;
                  return seen.has(key) ? false : seen.add(key);
              });
              setCandidates(uniqueCandidates);
          }
      }
    } catch (err: any) {
      setError(err.code === 'PGRST205' ? 'Tabla no configurada.' : 'Error al buscar.');
    } finally { setLoading(false); }
  };

  const selectCandidate = async (candidate: Participant) => {
      setLoading(true);
      setRenuncias([]); setReservas([]);
      try {
          const { data } = await supabase
            .from('participantes')
            .select('*')
            .eq('NOMBRE', candidate.NOMBRE)
            .order('ANIO', { ascending: false })
            .order('SEMESTRE', { ascending: false });
          if (data) {
              setStudentHistory(data);
              fetchExtraInfo(data);
          }
      } catch (err) {
          console.error(err);
      } finally {
          setLoading(false);
      }
  };

  const handleUpdateRecord = async (syncName: boolean = false) => {
    if (!editingRecord || !editForm.NOMBRE?.trim()) return;
    setLoading(true);
    try {
      // 1. Update the specific record by ID
      const { error } = await supabase
        .from('participantes')
        .update({
          NOMBRE: editForm.NOMBRE.toUpperCase(),
          ANIO: editForm.ANIO,
          OMERITO: editForm.OMERITO,
          FECHAINGRESO: editForm.FECHAINGRESO,
          CODPOSTULANTE: editForm.CODPOSTULANTE,
          CARRERA: editForm.CARRERA?.toUpperCase(),
          FILIAL: editForm.FILIAL?.toUpperCase(),
          MODALIDAD: editForm.MODALIDAD?.toUpperCase(),
          SEMESTRE: editForm.SEMESTRE,
          NOTA: editForm.NOTA
        })
        .eq('id', editingRecord.id);
      
      if (error) throw error;

      // 2. If syncName is requested, update all records that had the original name
      if (syncName && editingRecord.NOMBRE !== editForm.NOMBRE.toUpperCase()) {
          await supabase
            .from('participantes')
            .update({ NOMBRE: editForm.NOMBRE.toUpperCase() })
            .eq('NOMBRE', editingRecord.NOMBRE);
      }
      
      // Update local state
      if (syncName) {
          setStudentHistory(prev => prev.map(s => s.NOMBRE === editingRecord.NOMBRE ? { ...s, ...editForm, NOMBRE: editForm.NOMBRE!.toUpperCase() } : s));
      } else {
          setStudentHistory(prev => prev.map(s => s.id === editingRecord.id ? { ...s, ...editForm, NOMBRE: editForm.NOMBRE!.toUpperCase() } : s));
      }
      
      setIsEditing(false);
      setEditingRecord(null);
      setShowSyncNameOption(false);
    } catch (err: any) {
      alert('Error al actualizar: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateStudent = async () => {
    if (!newStudentForm.NOMBRE?.trim() || !newStudentForm.CODPOSTULANTE?.trim()) {
       alert("DNI y Nombres son obligatorios");
       return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.from('participantes').insert([{
          ...newStudentForm,
          NOMBRE: newStudentForm.NOMBRE.toUpperCase(),
          CODPOSTULANTE: newStudentForm.CODPOSTULANTE,
          CARRERA: newStudentForm.CARRERA?.toUpperCase() || '',
          MODALIDAD: newStudentForm.MODALIDAD?.toUpperCase() || '',
          FILIAL: newStudentForm.FILIAL?.toUpperCase() || 'CUSCO',
          ANIO: newStudentForm.ANIO || '',
          SEMESTRE: newStudentForm.SEMESTRE || '',
          NOTA: newStudentForm.NOTA || '',
          OMERITO: newStudentForm.OMERITO || '',
          FECHAINGRESO: newStudentForm.FECHAINGRESO || ''
      }]).select('*').single();
      if (error) throw error;
      
      alert('Estudiante agregado con éxito');
      setIsAddingNew(false);
      setNewStudentForm({});
      // Optionally search for the newly added student
      setSearchQuery(data.CODPOSTULANTE);
      // Let the user click search, or we could trigger handleSearch
    } catch (err: any) {
      alert('Error al agregar estudiante: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async (evt) => {
          const content = evt.target?.result as string;
          const lines = content.split(/\r?\n/).filter(line => line.trim());
          if (lines.length <= 1) return;

          setIsProcessingBatch(true);
          setBatchProgress(0);
          setBatchStatusText('Analizando archivo CSV...');

          const firstLine = lines[0];
          const delimiter = firstLine.includes(';') ? ';' : ',';

          const rawData = lines.slice(1).map(line => {
              const parts = line.split(delimiter).map(p => p.trim().replace(/^"|"$/g, ''));
              return { code: parts[0] || '', name: (parts[1] || '').toUpperCase() };
          }).filter(item => item.code !== '' || item.name !== '');

          const exactCodes = Array.from(new Set(rawData.map(d => d.code).filter(Boolean)));
          const exactNames = Array.from(new Set(rawData.map(d => d.name).filter(Boolean)));
          
          try {
              let dbMatches: any[] = [];
              const chunkSize = 200;
              
              setBatchStatusText('Consultando base de datos por DNI...');
              const totalCodeChunks = Math.ceil(exactCodes.length / chunkSize);
              for (let i = 0; i < exactCodes.length; i += chunkSize) {
                  const chunk = exactCodes.slice(i, i + chunkSize);
                  const { data, error } = await supabase
                      .from('participantes')
                      .select('*')
                      .in('CODPOSTULANTE', chunk);
                  if (error) throw error;
                  if (data) dbMatches = dbMatches.concat(data);
                  
                  const currentChunk = Math.floor(i / chunkSize) + 1;
                  setBatchProgress(Math.round((currentChunk / (totalCodeChunks || 1)) * 40));
              }

              setBatchStatusText('Consultando base de datos por Nombres...');
              const totalNameChunks = Math.ceil(exactNames.length / chunkSize);
              for (let i = 0; i < exactNames.length; i += chunkSize) {
                  const chunk = exactNames.slice(i, i + chunkSize);
                  const { data, error } = await supabase
                      .from('participantes')
                      .select('*')
                      .in('NOMBRE', chunk);
                  if (error) throw error;
                  if (data) {
                      const newMatches = data.filter(d => !dbMatches.some(dm => dm.id === d.id));
                      dbMatches = dbMatches.concat(newMatches);
                  }
                  
                  const currentChunk = Math.floor(i / chunkSize) + 1;
                  setBatchProgress(40 + Math.round((currentChunk / (totalNameChunks || 1)) * 40));
              }

              setBatchStatusText('Cruzando información...');
              
              const codeMap = new Map<string, Participant[]>();
              const nameMap = new Map<string, Participant[]>();

              dbMatches.forEach(m => {
                  const codeKey = String(m.CODPOSTULANTE).trim();
                  const nameKey = String(m.NOMBRE).trim();

                  if (codeKey) {
                      if (!codeMap.has(codeKey)) codeMap.set(codeKey, []);
                      codeMap.get(codeKey)!.push(m);
                  }
                  if (nameKey) {
                      if (!nameMap.has(nameKey)) nameMap.set(nameKey, []);
                      nameMap.get(nameKey)!.push(m);
                  }
              });

              const results: BatchResult[] = [];
              const batchProcessingSize = 500;
              
              for (let i = 0; i < rawData.length; i += batchProcessingSize) {
                  const chunk = rawData.slice(i, i + batchProcessingSize);
                  
                  chunk.forEach(item => {
                      const targetCode = String(item.code || '').trim();
                      const targetName = String(item.name || '').trim();

                      const codeMatches = targetCode ? (codeMap.get(targetCode) || []) : [];
                      const nameMatches = targetName ? (nameMap.get(targetName) || []) : [];
                      
                      let exactMatches: Participant[] = [];
                      let probableMatches: Participant[] = [];

                      const hasCodeStr = !!targetCode;
                      const hasNameStr = !!targetName;

                      const seenIds = new Set<string>();

                      if (hasCodeStr && hasNameStr) {
                          const nameMatchesSet = new Set(nameMatches.map(m => m.id));
                          codeMatches.forEach(m => {
                              if (nameMatchesSet.has(m.id)) {
                                  exactMatches.push(m);
                              } else {
                                  probableMatches.push(m);
                              }
                              seenIds.add(m.id);
                          });
                          
                          nameMatches.forEach(m => {
                              if (!seenIds.has(m.id)) {
                                  probableMatches.push(m);
                                  seenIds.add(m.id);
                              }
                          });

                      } else if (hasNameStr) {
                          exactMatches = nameMatches;
                      } else if (hasCodeStr) {
                          exactMatches = codeMatches;
                      }

                      const finalMatches = exactMatches.length > 0 ? exactMatches : probableMatches;
                      let s: 'EXACT' | 'PROBABLE' | 'NOT_FOUND' = 'NOT_FOUND';
                      if (exactMatches.length > 0) s = 'EXACT';
                      else if (probableMatches.length > 0) s = 'PROBABLE';

                      results.push({
                          originalCode: item.code,
                          originalName: item.name,
                          found: finalMatches.length > 0,
                          status: s,
                          allMatches: finalMatches
                      });
                  });

                  setBatchProgress(80 + Math.round(((i + chunk.length) / rawData.length) * 20));
                  await new Promise(r => setTimeout(r, 0));
              }

              setBatchResults(results);
          } catch (error: any) {
              console.error("Batch Error:", error);
              alert("Error al consultar la base de datos: " + error.message);
          } finally {
              setIsProcessingBatch(false);
              setBatchProgress(100);
              setBatchStatusText('');
              if (e.target) e.target.value = '';
          }
      };
      reader.readAsText(file);
  };

  const handleExportCruceCC = async () => {
      if (batchResults.length === 0) return;
      setIsProcessingBatch(true);
      setBatchStatusText('Generando Reporte CC...');
      setBatchProgress(10);
      
      try {
          const { data: escuelas, error } = await supabase.from('cv_escuelas').select('*');
          if (error) throw error;
          
          const escuelasMap = new Map<string, any>();
          escuelas?.forEach(e => {
              escuelasMap.set(e.nombre.toUpperCase(), e);
              if (e.alias) escuelasMap.set(e.alias.toUpperCase(), e);
          });
          
          setBatchProgress(50);
          
          const formattedData: any[] = [];
          
          batchResults.forEach(res => {
              if (res.allMatches.length > 0) {
                  const sortedMatches = [...res.allMatches].sort((a, b) => {
                      const anioA = parseInt(a.ANIO || '0');
                      const anioB = parseInt(b.ANIO || '0');
                      if (anioA !== anioB) return anioB - anioA;
                      return (b.SEMESTRE || '').localeCompare(a.SEMESTRE || '');
                  });

                  sortedMatches.forEach(match => {
                      const carreraStr = (match.CARRERA || '').toUpperCase();
                      let escuela = escuelasMap.get(carreraStr);
                      if (!escuela) {
                          const found = escuelas?.find(e => carreraStr.includes(e.nombre.toUpperCase()) || (e.alias && carreraStr.includes(e.alias.toUpperCase())));
                          if (found) escuela = found;
                      }
                      
                      formattedData.push({
                          'DNI': match.CODPOSTULANTE || res.originalCode,
                          'NOMBRE': match.NOMBRE || res.originalName,
                          'SIGLA': escuela?.siglas || '--',
                          'CÓDIGO DE ESCUELA': escuela?.codigo_carrera || '--',
                          'CARRERA': match.CARRERA,
                          'MODALIDAD': match.MODALIDAD,
                          'PROCESO': `${match.SEMESTRE || ''}-${match.ANIO || ''}`
                      });
                  });
              } else {
                  formattedData.push({
                      'DNI': res.originalCode,
                      'NOMBRE': res.originalName,
                      'SIGLA': 'NO ENCONTRADO',
                      'CÓDIGO DE ESCUELA': '--',
                      'CARRERA': '--',
                      'MODALIDAD': '--',
                      'PROCESO': '--'
                  });
              }
          });
          
          setBatchProgress(90);
          
          const worksheet = XLSX.utils.json_to_sheet(formattedData);
          const workbook = XLSX.utils.book_new();
          XLSX.utils.book_append_sheet(workbook, worksheet, 'Reporte_CC');
          XLSX.writeFile(workbook, `Reporte_CC_${new Date().getTime()}.xlsx`);
          
      } catch (err: any) {
          console.error(err);
          alert("Error al generar reporte CC: " + err.message);
      } finally {
          setIsProcessingBatch(false);
          setBatchStatusText('');
          setBatchProgress(0);
      }
  };

  const handleExportCruceExcel = () => {
      if (batchResults.length === 0) return;
      
      const formattedData = batchResults.map(res => {
          const statusMap = { 'EXACT': 'CONFIRMADO', 'PROBABLE': 'PROBABLE', 'NOT_FOUND': 'NO ENCONTRADO' };
          const found = statusMap[res.status];
          let detail = '';
          if (res.allMatches.length === 1) {
              detail = `${res.allMatches[0].CARRERA} - ${res.allMatches[0].SEMESTRE || res.allMatches[0].ANIO || 'N/A'} - MODALIDAD: ${res.allMatches[0].MODALIDAD || 'N/A'}`;
          } else if (res.allMatches.length > 1) {
              detail = `Múltiples ingresos (${res.allMatches.length})`;
          }
          
          return {
              'Código/DNI Original': res.originalCode,
              'Nombre Original': res.originalName,
              'Estado': found,
              'Detalle Encontrado': detail,
              'Nombres Coincidentes': res.allMatches.map(m => m.NOMBRE).join(' | ')
          };
      });

      const worksheet = XLSX.utils.json_to_sheet(formattedData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Resultados_Cruce');
      
      XLSX.writeFile(workbook, `Reporte_Cruce_Masivo_${new Date().getTime()}.xlsx`);
  };

  const handleExportCrucePdf = () => {
      if (batchResults.length === 0) return;
      
      const doc = new jsPDF('landscape');
      
      doc.setFontSize(16);
      doc.text('Reporte de Cruce Masivo de Ingresantes', 14, 20);
      
      doc.setFontSize(10);
      doc.text(`Fecha de generación: ${new Date().toLocaleString()}`, 14, 28);
      
      const exactCount = batchResults.filter(r => r.status === 'EXACT').length;
      const probCount = batchResults.filter(r => r.status === 'PROBABLE').length;
      const notFoundCount = batchResults.filter(r => r.status === 'NOT_FOUND').length;
      
      doc.text(`Total procesados: ${batchResults.length} | Confirmados: ${exactCount} | Probables: ${probCount} | No Encontrados: ${notFoundCount}`, 14, 34);

      const tableData = batchResults.map(res => {
          let detail = '';
          if (res.allMatches.length === 1) {
              detail = `${res.allMatches[0].CARRERA}\n${res.allMatches[0].SEMESTRE || res.allMatches[0].ANIO || 'N/A'}`;
          } else if (res.allMatches.length > 1) {
              detail = `Múltiples ingresos (${res.allMatches.length})`;
          }
          
          const statusMap = { 'EXACT': 'CONFIRMADO', 'PROBABLE': 'PROBABLE', 'NOT_FOUND': 'NO ENCONTRADO' };
          
          return [
              res.originalCode || '-',
              res.originalName || '-',
              statusMap[res.status],
              detail || '-',
              res.allMatches.map(m => m.NOMBRE).join('\n') || '-'
          ];
      });

      autoTable(doc, {
          startY: 40,
          head: [['Código/DNI', 'Nombre Buscado', 'Estado', 'Carrera/Periodo', 'Nombres Equivalentes']],
          body: tableData,
          theme: 'striped',
          headStyles: { fillColor: [15, 23, 42] },
          styles: { fontSize: 8 },
          columnStyles: {
              0: { cellWidth: 25 },
              1: { cellWidth: 50 },
              2: { cellWidth: 25 },
              3: { cellWidth: 70 },
              4: { cellWidth: 'auto' }
          }
      });

      doc.save(`Reporte_Cruce_Masivo_${new Date().getTime()}.pdf`);
  };

  // Import Logic
  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (evt) => {
          const content = evt.target?.result as string;
          const lines = content.split(/\r?\n/).filter(line => line.trim());
          if (lines.length <= 1) return;

          const delimiter = lines[0].includes(';') ? ';' : ',';
          const headers = lines[0].split(delimiter).map(h => h.trim().toUpperCase());
          
          const parsed = lines.slice(1).map(line => {
              const cols = line.split(delimiter).map(c => c.trim().replace(/^"|"$/g, ''));
              return {
                  CODPOSTULANTE: cols[0] || '',
                  NOMBRE: (cols[1] || '').toUpperCase(),
                  CARRERA: (cols[2] || '').toUpperCase(),
                  FILIAL: (cols[3] || 'CUSCO').toUpperCase(),
                  MODALIDAD: (cols[4] || '').toUpperCase(),
                  SEMESTRE: cols[5] || '',
                  ANIO: cols[6] || '',
                  NOTA: cols[7] || '0',
                  OMERITO: cols[8] || '0',
                  FECHAINGRESO: cols[9] || ''
              };
          }).filter(item => item.CODPOSTULANTE !== '');

          setImportData(parsed);
      };
      reader.readAsText(file);
  };

  const processImport = async () => {
      if (importData.length === 0) return;
      setIsImporting(true);
      setImportProgress(0);
      
      const CHUNK_SIZE = 100;
      let successCount = 0;

      try {
          for (let i = 0; i < importData.length; i += CHUNK_SIZE) {
              const chunk = importData.slice(i, i + CHUNK_SIZE);
              const { error } = await supabase.from('participantes').insert(chunk);
              if (error) throw error;
              
              successCount += chunk.length;
              setImportProgress(Math.round((successCount / importData.length) * 100));
          }
          alert(`✅ Importación finalizada con éxito: ${successCount} ingresantes registrados.`);
          setImportData([]);
          setActiveMode('individual');
      } catch (err: any) {
          console.error(err);
          alert(`Error durante la importación: ${err.message}`);
      } finally {
          setIsImporting(false);
          setImportProgress(0);
      }
  };

  const mainStudent = studentHistory.length > 0 ? studentHistory[0] : null;

  const getTimelineEvents = () => {
      const events: any[] = [];
      studentHistory.forEach(s => {
          events.push({
              id: `ingreso-${s.id}`,
              type: 'ingreso',
              sortKey: `${s.ANIO}-${s.SEMESTRE === 'I' ? '1' : s.SEMESTRE === 'II' ? '2' : '3'}-ingreso`,
              data: s
          });
      });
      renuncias.forEach(r => {
          const [anio, sem] = (r.semester || '0000-0').split('-');
          events.push({
              id: `renuncia-${r.id}`,
              type: 'renuncia',
              sortKey: `${anio}-${sem === 'I' ? '1' : sem === 'II' ? '2' : '3'}-renuncia`,
              data: r
          });
      });
      reservas.forEach(r => {
          const [anio, sem] = (r.starting_semester || '0000-0').split('-');
          events.push({
              id: `reserva-${r.id}`,
              type: 'reserva',
              sortKey: `${anio}-${sem === 'I' ? '1' : sem === 'II' ? '2' : '3'}-reserva`,
              data: r
          });
          if (r.is_withdrawn) {
              events.push({
                  id: `reserva-ret-${r.id}`,
                  type: 'retiro_reserva',
                  sortKey: `${anio}-${sem === 'I' ? '1' : sem === 'II' ? '2' : '3'}-retiro`,
                  data: r
              });
          }
      });
  
      return events.sort((a, b) => {
          if (a.sortKey > b.sortKey) return -1;
          if (a.sortKey < b.sortKey) return 1;
          return 0;
      });
  };

  const timelineEvents = getTimelineEvents();

  return (
    <div className="flex-1 w-full max-w-[1600px] mx-auto p-4 md:p-6 lg:p-8 flex flex-col gap-6 h-full overflow-hidden">
      
      {/* MODAL DE EDICIÓN COMPLETO */}
      {isEditing && editingRecord && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300">
              <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl flex flex-col overflow-hidden animate-in zoom-in-95">
                  <div className="bg-slate-50 border-b border-slate-200 p-6 flex justify-between items-center">
                      <div className="flex items-center gap-4">
                          <div className="size-12 bg-primary text-white rounded-2xl flex items-center justify-center">
                              <span className="material-symbols-outlined">edit</span>
                          </div>
                          <div>
                              <h3 className="text-xl font-black text-slate-900 uppercase">Editar Registro de Ingreso</h3>
                              <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">ID: {editingRecord.id}</p>
                          </div>
                      </div>
                      <button 
                        onClick={() => { setIsEditing(false); setEditingRecord(null); setShowSyncNameOption(false); }}
                        className="size-10 rounded-full hover:bg-slate-200 text-slate-400 flex items-center justify-center transition-colors"
                      >
                          <span className="material-symbols-outlined">close</span>
                      </button>
                  </div>
                  <div className="p-8 overflow-y-auto max-h-[70vh]">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div className="md:col-span-2">
                              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Nombre Completo (Pivot)</label>
                              <input 
                                  value={editForm.NOMBRE || ''} 
                                  onChange={e => {
                                      setEditForm({...editForm, NOMBRE: e.target.value});
                                      setShowSyncNameOption(e.target.value.toUpperCase() !== editingRecord.NOMBRE);
                                  }} 
                                  className="w-full h-12 px-4 rounded-xl border-2 border-slate-100 bg-slate-50 outline-none font-bold focus:border-primary focus:bg-white transition-all mt-1 uppercase"
                              />
                          </div>
                          {showSyncNameOption && (
                              <div className="md:col-span-2 bg-amber-50 border border-amber-200 p-4 rounded-xl flex items-center gap-3 animate-in slide-in-from-top-2">
                                  <span className="material-symbols-outlined text-amber-600">info</span>
                                  <p className="text-xs font-bold text-amber-800">Has cambiado el nombre. ¿Deseas actualizarlo en todos sus otros registros de ingreso también?</p>
                              </div>
                          )}
                          <div>
                              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Año de Proceso (ANIO)</label>
                              <input 
                                  value={editForm.ANIO || ''} 
                                  onChange={e => setEditForm({...editForm, ANIO: e.target.value})} 
                                  className="w-full h-12 px-4 rounded-xl border-2 border-slate-100 bg-slate-50 outline-none font-bold focus:border-primary focus:bg-white transition-all mt-1"
                              />
                          </div>
                          <div>
                              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Orden Mérito (OMERITO)</label>
                              <input 
                                  value={editForm.OMERITO || ''} 
                                  onChange={e => setEditForm({...editForm, OMERITO: e.target.value})} 
                                  className="w-full h-12 px-4 rounded-xl border-2 border-slate-100 bg-slate-50 outline-none font-bold focus:border-primary focus:bg-white transition-all mt-1"
                              />
                          </div>
                          <div>
                              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Fecha de Ingreso (FECHAINGRESO)</label>
                              <input 
                                  value={editForm.FECHAINGRESO || ''} 
                                  onChange={e => setEditForm({...editForm, FECHAINGRESO: e.target.value})} 
                                  className="w-full h-12 px-4 rounded-xl border-2 border-slate-100 bg-slate-50 outline-none font-bold focus:border-primary focus:bg-white transition-all mt-1"
                                  placeholder="Ej: DD/MM/AAAA"
                              />
                          </div>
                          <div>
                              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Código / DNI</label>
                              <input 
                                  value={editForm.CODPOSTULANTE || ''} 
                                  onChange={e => setEditForm({...editForm, CODPOSTULANTE: e.target.value})} 
                                  className="w-full h-12 px-4 rounded-xl border-2 border-slate-100 bg-slate-50 outline-none font-bold focus:border-primary focus:bg-white transition-all mt-1"
                              />
                          </div>
                          <div>
                              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Carrera</label>
                              <input 
                                  value={editForm.CARRERA || ''} 
                                  onChange={e => setEditForm({...editForm, CARRERA: e.target.value})} 
                                  className="w-full h-12 px-4 rounded-xl border-2 border-slate-100 bg-slate-50 outline-none font-bold focus:border-primary focus:bg-white transition-all mt-1 uppercase"
                              />
                          </div>
                          <div>
                              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Semestre</label>
                              <input 
                                  value={editForm.SEMESTRE || ''} 
                                  onChange={e => setEditForm({...editForm, SEMESTRE: e.target.value})} 
                                  className="w-full h-12 px-4 rounded-xl border-2 border-slate-100 bg-slate-50 outline-none font-bold focus:border-primary focus:bg-white transition-all mt-1"
                              />
                          </div>
                      </div>
                  </div>
                  <div className="p-6 bg-slate-50 border-t border-slate-200 flex flex-wrap justify-end gap-3">
                       <button onClick={() => { setIsEditing(false); setEditingRecord(null); setShowSyncNameOption(false); }} className="px-6 py-3 font-bold text-slate-500 hover:bg-slate-200 rounded-xl transition-all">Cancelar</button>
                       
                       {showSyncNameOption ? (
                           <div className="flex gap-2">
                               <button 
                                onClick={() => handleUpdateRecord(false)} 
                                disabled={loading}
                                className="px-6 py-3 bg-slate-800 text-white rounded-xl font-black text-xs uppercase tracking-widest active:scale-95 transition-all disabled:opacity-50"
                               >
                                   Solo esta fila
                               </button>
                               <button 
                                onClick={() => handleUpdateRecord(true)} 
                                disabled={loading}
                                className="px-6 py-3 bg-primary text-white rounded-xl font-black text-xs uppercase tracking-widest active:scale-95 transition-all shadow-lg shadow-primary/20 disabled:opacity-50"
                               >
                                   Sincronizar nombre en todos
                               </button>
                           </div>
                       ) : (
                           <button 
                            onClick={() => handleUpdateRecord(false)} 
                            disabled={loading}
                            className="px-10 py-3 bg-primary text-white rounded-xl font-black text-xs uppercase tracking-widest active:scale-95 transition-all shadow-lg shadow-primary/20 disabled:opacity-50"
                           >
                               {loading ? 'Guardando...' : 'Guardar Cambios'}
                           </button>
                       )}
                  </div>
              </div>
          </div>
      )}

      {/* MODAL DE DETALLE (PARA MODO EN BLOQUE) */}
      {selectedBatchHistory && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300">
              <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95">
                  <div className="bg-slate-50 border-b border-slate-200 p-6 flex justify-between items-center">
                      <div className="flex items-center gap-4">
                          <div className="size-12 bg-primary text-white rounded-2xl flex items-center justify-center">
                              <span className="material-symbols-outlined">person_outline</span>
                          </div>
                          <div>
                              <h3 className="text-xl font-black text-slate-900 uppercase">{fixEncoding(selectedBatchHistory[0]?.NOMBRE)}</h3>
                              <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">CÓDIGO: {selectedBatchHistory[0]?.CODPOSTULANTE}</p>
                          </div>
                      </div>
                      <button 
                        onClick={() => setSelectedBatchHistory(null)}
                        className="size-10 rounded-full hover:bg-slate-200 text-slate-400 flex items-center justify-center transition-colors"
                      >
                          <span className="material-symbols-outlined">close</span>
                      </button>
                  </div>
                  <div className="flex-1 overflow-y-auto p-8">
                        <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-8 border-b pb-2">Trayectoria de Ingresos Detallada</h4>
                        <div className="space-y-10 relative">
                             <div className="absolute left-5 top-0 bottom-0 w-0.5 bg-slate-100"></div>
                             {selectedBatchHistory.map((item, idx) => (
                                 <div key={idx} className="flex gap-8 relative group">
                                     <div className={`size-10 rounded-full flex items-center justify-center shrink-0 z-10 ${idx === 0 ? 'bg-green-600 text-white shadow-lg shadow-green-200' : 'bg-slate-100 text-slate-400'}`}>
                                         <span className="material-symbols-outlined text-xl">{idx === 0 ? 'verified' : 'history'}</span>
                                     </div>
                                     <div className="flex-1 bg-slate-50 rounded-2xl p-6 border border-slate-100 group-hover:border-primary/20 transition-all">
                                         <div className="flex flex-wrap justify-between items-start gap-4 mb-4">
                                             <div>
                                                <p className="font-black text-lg text-slate-900 uppercase leading-tight">{fixEncoding(item.CARRERA)}</p>
                                                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">PROCESO: {item.SEMESTRE}-{item.ANIO}</p>
                                             </div>
                                             <div className="bg-white px-4 py-2 rounded-xl border border-slate-200 text-center min-w-[100px]">
                                                 <p className="text-[10px] font-black text-slate-400 uppercase">Puntaje</p>
                                                 <p className="text-lg font-black text-primary">{item.NOTA}</p>
                                             </div>
                                         </div>
                                         <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                                             <div><p className="text-[9px] font-black text-slate-400 uppercase">Modalidad</p><p className="text-xs font-bold text-slate-700">{item.MODALIDAD}</p></div>
                                             <div><p className="text-[9px] font-black text-slate-400 uppercase">Orden Mérito</p><p className="text-xs font-bold text-slate-700">{item.OMERITO}</p></div>
                                             <div><p className="text-[9px] font-black text-slate-400 uppercase">Sede/Filial</p><p className="text-xs font-bold text-slate-700">{item.FILIAL || 'CUSCO'}</p></div>
                                             <div><p className="text-[9px] font-black text-slate-400 uppercase">F. Ingreso</p><p className="text-xs font-bold text-slate-700">{item.FECHAINGRESO}</p></div>
                                         </div>
                                     </div>
                                 </div>
                             ))}
                        </div>
                  </div>
                  <div className="p-6 bg-slate-50 border-t border-slate-200 flex justify-end">
                       <button onClick={() => setSelectedBatchHistory(null)} className="px-8 py-3 bg-slate-900 text-white rounded-xl font-black text-xs uppercase tracking-widest active:scale-95 transition-all">Cerrar Expediente</button>
                  </div>
              </div>
          </div>
      )}

      {/* MODAL DE AGREGAR ESTUDIANTE */}
      {isAddingNew && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300">
              <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl flex flex-col overflow-hidden animate-in zoom-in-95">
                  <div className="bg-slate-50 border-b border-slate-200 p-6 flex justify-between items-center">
                      <div className="flex items-center gap-4">
                          <div className="size-12 bg-primary text-white rounded-2xl flex items-center justify-center">
                              <span className="material-symbols-outlined">person_add</span>
                          </div>
                          <div>
                              <h3 className="text-xl font-black text-slate-900 uppercase">Agregar Nuevo Estudiante</h3>
                              <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">REGISTRAR NUEVO INGRESO</p>
                          </div>
                      </div>
                      <button 
                        onClick={() => { setIsAddingNew(false); setNewStudentForm({}); }}
                        className="size-10 rounded-full hover:bg-slate-200 text-slate-400 flex items-center justify-center transition-colors"
                      >
                          <span className="material-symbols-outlined">close</span>
                      </button>
                  </div>
                  <div className="p-8 overflow-y-auto max-h-[70vh]">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div className="md:col-span-2">
                              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Nombre Completo *</label>
                              <input 
                                  value={newStudentForm.NOMBRE || ''} 
                                  onChange={e => setNewStudentForm({...newStudentForm, NOMBRE: e.target.value})} 
                                  className="w-full h-12 px-4 rounded-xl border-2 border-slate-100 bg-slate-50 outline-none font-bold focus:border-primary focus:bg-white transition-all mt-1 uppercase"
                              />
                          </div>
                          <div>
                              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Código / DNI *</label>
                              <input 
                                  value={newStudentForm.CODPOSTULANTE || ''} 
                                  onChange={e => setNewStudentForm({...newStudentForm, CODPOSTULANTE: e.target.value})} 
                                  className="w-full h-12 px-4 rounded-xl border-2 border-slate-100 bg-slate-50 outline-none font-bold focus:border-primary focus:bg-white transition-all mt-1"
                              />
                          </div>
                          <div>
                              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Año de Proceso (ANIO)</label>
                              <input 
                                  value={newStudentForm.ANIO || ''} 
                                  onChange={e => setNewStudentForm({...newStudentForm, ANIO: e.target.value})} 
                                  className="w-full h-12 px-4 rounded-xl border-2 border-slate-100 bg-slate-50 outline-none font-bold focus:border-primary focus:bg-white transition-all mt-1"
                              />
                          </div>
                          <div>
                              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Semestre</label>
                              <input 
                                  value={newStudentForm.SEMESTRE || ''} 
                                  onChange={e => setNewStudentForm({...newStudentForm, SEMESTRE: e.target.value})} 
                                  className="w-full h-12 px-4 rounded-xl border-2 border-slate-100 bg-slate-50 outline-none font-bold focus:border-primary focus:bg-white transition-all mt-1"
                                  placeholder="Ej: I, II"
                              />
                          </div>
                          <div>
                              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Modalidad</label>
                              <input 
                                  value={newStudentForm.MODALIDAD || ''} 
                                  onChange={e => setNewStudentForm({...newStudentForm, MODALIDAD: e.target.value})} 
                                  className="w-full h-12 px-4 rounded-xl border-2 border-slate-100 bg-slate-50 outline-none font-bold focus:border-primary focus:bg-white transition-all mt-1 uppercase"
                              />
                          </div>
                          <div>
                              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Carrera</label>
                              <input 
                                  value={newStudentForm.CARRERA || ''} 
                                  onChange={e => setNewStudentForm({...newStudentForm, CARRERA: e.target.value})} 
                                  className="w-full h-12 px-4 rounded-xl border-2 border-slate-100 bg-slate-50 outline-none font-bold focus:border-primary focus:bg-white transition-all mt-1 uppercase"
                              />
                          </div>
                          <div>
                              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Sede / Filial</label>
                              <input 
                                  value={newStudentForm.FILIAL || ''} 
                                  onChange={e => setNewStudentForm({...newStudentForm, FILIAL: e.target.value})} 
                                  className="w-full h-12 px-4 rounded-xl border-2 border-slate-100 bg-slate-50 outline-none font-bold focus:border-primary focus:bg-white transition-all mt-1 uppercase"
                                  placeholder="CUSCO"
                              />
                          </div>
                          <div>
                              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Orden Mérito (OMERITO)</label>
                              <input 
                                  value={newStudentForm.OMERITO || ''} 
                                  onChange={e => setNewStudentForm({...newStudentForm, OMERITO: e.target.value})} 
                                  className="w-full h-12 px-4 rounded-xl border-2 border-slate-100 bg-slate-50 outline-none font-bold focus:border-primary focus:bg-white transition-all mt-1"
                              />
                          </div>
                          <div>
                              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Nota</label>
                              <input 
                                  value={newStudentForm.NOTA || ''} 
                                  onChange={e => setNewStudentForm({...newStudentForm, NOTA: e.target.value})} 
                                  className="w-full h-12 px-4 rounded-xl border-2 border-slate-100 bg-slate-50 outline-none font-bold focus:border-primary focus:bg-white transition-all mt-1"
                              />
                          </div>
                          <div>
                              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Fecha de Ingreso</label>
                              <input 
                                  value={newStudentForm.FECHAINGRESO || ''} 
                                  onChange={e => setNewStudentForm({...newStudentForm, FECHAINGRESO: e.target.value})} 
                                  className="w-full h-12 px-4 rounded-xl border-2 border-slate-100 bg-slate-50 outline-none font-bold focus:border-primary focus:bg-white transition-all mt-1"
                                  placeholder="Ej: DD/MM/AAAA"
                              />
                          </div>
                      </div>
                  </div>
                  <div className="p-6 bg-slate-50 border-t border-slate-200 flex flex-wrap justify-end gap-3">
                       <button onClick={() => { setIsAddingNew(false); setNewStudentForm({}); }} className="px-6 py-3 font-bold text-slate-500 hover:bg-slate-200 rounded-xl transition-all">Cancelar</button>
                       <button 
                        onClick={handleCreateStudent} 
                        disabled={loading}
                        className="px-10 py-3 bg-primary text-white rounded-xl font-black text-xs uppercase tracking-widest active:scale-95 transition-all shadow-lg shadow-primary/20 disabled:opacity-50"
                       >
                           {loading ? 'Guardando...' : 'Agregar Estudiante'}
                       </button>
                  </div>
              </div>
          </div>
      )}

      <div className="flex flex-wrap justify-between items-end gap-4 shrink-0">
        <div className="flex flex-col gap-2">
            <h1 className="text-slate-900 text-3xl font-black leading-tight">Gestión de Ingresantes</h1>
            <p className="text-slate-500 text-sm font-medium">Búsqueda individual, cruce masivo o importación de nuevos registros.</p>
        </div>
        <div className="flex bg-slate-200 p-1 rounded-xl shadow-inner shrink-0">
            {[
                {id: 'individual', label: 'Individual', icon: 'person'},
                {id: 'batch', label: 'Cruce Masivo', icon: 'compare_arrows'},
                {id: 'import', label: 'Importar Datos', icon: 'upload_file', adminOnly: true}
            ].filter(m => !m.adminOnly || user.role === 'Administrador' || (user.role === 'Operador' && user.permissions?.includes('upload_csv'))).map((m) => (
                <button 
                    key={m.id}
                    onClick={() => setActiveMode(m.id as any)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${activeMode === m.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                    <span className="material-symbols-outlined text-[18px]">{m.icon}</span>
                    {m.label}
                </button>
            ))}
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        {activeMode === 'individual' ? (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start h-full overflow-y-auto pr-2">
                <aside className="lg:col-span-4 flex flex-col gap-6 w-full">
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-bold flex items-center gap-2 text-slate-900">
                        <span className="material-symbols-outlined text-primary">person_search</span>
                        Criterios de Búsqueda
                        </h3>
                        <button onClick={() => setIsAddingNew(true)} className="flex items-center gap-1 text-xs font-bold text-primary hover:text-merlot transition-colors bg-primary/10 hover:bg-primary/20 px-3 py-1.5 rounded-lg">
                            <span className="material-symbols-outlined text-[16px]">person_add</span>
                            Agregar
                        </button>
                    </div>
                    <div className="flex flex-col gap-4">
                        <div className="relative">
                        <span className="material-symbols-outlined absolute left-3 top-3 text-slate-400">search</span>
                        <input
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                            className="w-full rounded-lg border border-slate-300 bg-slate-50 text-slate-900 h-11 pl-10 pr-14 focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all placeholder:text-slate-400 uppercase"
                            placeholder="DNI O NOMBRE..."
                        />
                        <button onClick={handleSearch} disabled={loading} className="absolute right-1 top-1 h-9 w-9 bg-primary hover:bg-merlot text-white rounded-lg flex items-center justify-center transition-colors">
                            {loading ? <span className="material-symbols-outlined text-[18px] animate-spin">progress_activity</span> : <span className="material-symbols-outlined text-[18px]">arrow_forward</span>}
                        </button>
                        </div>
                    </div>
                </div>

                {candidates.length > 0 && studentHistory.length === 0 && (
                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden animate-in fade-in slide-in-from-bottom-2">
                        <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                            <h4 className="font-bold text-slate-700 text-xs uppercase tracking-wider">Resultados ({candidates.length})</h4>
                        </div>
                        <div className="max-h-[400px] overflow-y-auto">
                            {candidates.map((c, i) => (
                                <button key={i} onClick={() => selectCandidate(c)} className="w-full text-left p-4 border-b border-slate-100 hover:bg-slate-50 transition-colors flex items-center gap-3">
                                    <div className="size-10 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center"><span className="material-symbols-outlined">person</span></div>
                                    <div className="flex-1 min-w-0">
                                        <p className="font-bold text-slate-900 text-sm truncate uppercase">{fixEncoding(c.NOMBRE)}</p>
                                        <p className="text-[10px] text-slate-500 truncate uppercase">{c.CODPOSTULANTE} • {fixEncoding(c.CARRERA)}</p>
                                    </div>
                                    <span className="material-symbols-outlined text-slate-300">chevron_right</span>
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {mainStudent && (
                    <div className="bg-white rounded-xl shadow-xl border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-300">
                        <div className="h-24 bg-gradient-to-r from-primary to-merlot relative p-4 flex justify-end">
                            <button onClick={() => { setStudentHistory([]); setCandidates([]); setSearchQuery(''); setEditingRecord(null); setIsEditing(false); }} className="size-8 bg-white/20 text-white rounded-lg flex items-center justify-center hover:bg-white/40"><span className="material-symbols-outlined text-[18px]">close</span></button>
                        </div>
                        <div className="px-6 pb-6 relative">
                            <div className="size-20 rounded-2xl border-4 border-white bg-slate-100 -mt-10 mb-4 flex items-center justify-center shadow-md"><span className="material-symbols-outlined text-4xl text-slate-400">person</span></div>
                            
                            <div className="flex items-center justify-between gap-2">
                                <h3 className="text-xl font-black text-slate-900 uppercase leading-tight truncate">{fixEncoding(mainStudent.NOMBRE)}</h3>
                            </div>
                            
                            <p className="text-primary font-black text-[10px] uppercase tracking-widest mt-1">CÓDIGO: {mainStudent.CODPOSTULANTE}</p>
                            <div className="mt-6 pt-6 border-t border-slate-100 flex flex-col gap-4">
                                <div className="bg-blue-50 p-3 rounded-lg border border-blue-100">
                                    <p className="text-[10px] font-black text-blue-800 uppercase tracking-widest mb-1">Último Ingreso</p>
                                    <p className="font-bold text-blue-900 text-sm">{fixEncoding(mainStudent.CARRERA)}</p>
                                    <p className="text-[10px] text-blue-700 font-bold mt-1 uppercase">{mainStudent.MODALIDAD} • {mainStudent.SEMESTRE}-{mainStudent.ANIO}</p>
                                </div>
                                <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                                    <div className="flex justify-between items-center mb-2">
                                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Expediente Físico (H:)</p>
                                        <div className="flex items-center gap-1.5">
                                            <span className="material-symbols-outlined text-slate-400 text-[14px]">folder_open</span>
                                        </div>
                                    </div>

                                    {loadingDocs ? (
                                        <div className="flex items-center gap-2 text-slate-400 text-xs font-bold">
                                            <span className="material-symbols-outlined text-[14px] animate-spin">sync</span>
                                            Buscando en servidor local...
                                        </div>
                                    ) : docsError ? (
                                        <div className="flex flex-col gap-1">
                                            <div className="bg-red-50 text-red-600 text-[10px] p-2 rounded border border-red-100 font-bold">
                                                {docsError}
                                            </div>
                                            <p className="text-[9px] text-slate-400">
                                                Asegúrate de que el servidor local (H:) esté activo y conectado adecuadamente.
                                            </p>
                                        </div>
                                    ) : localDocuments.length > 0 ? (
                                        <div className="flex flex-col gap-3">
                                            {Object.entries(getGroupedDocuments(localDocuments))
                                                .sort(([labelA], [labelB]) => {
                                                    const yearMatchA = labelA.match(/\b\d{4}\b/);
                                                    const yearMatchB = labelB.match(/\b\d{4}\b/);
                                                    const yearA = yearMatchA ? parseInt(yearMatchA[0], 10) : 0;
                                                    const yearB = yearMatchB ? parseInt(yearMatchB[0], 10) : 0;
                                                    
                                                    if (yearA !== yearB) {
                                                        return yearB - yearA; // Recientes primero
                                                    }
                                                    
                                                    const getSemesterVal = (label: string) => {
                                                        if (/\b(II|2|SEGUNDO)\b/i.test(label) || label.includes('-II') || label.includes('_II')) return 2;
                                                        if (/\b(I|1|PRIMERO|PRIMERA)\b/i.test(label) || label.includes('-I') || label.includes('_I')) return 1;
                                                        return 0;
                                                    };
                                                    
                                                    const semA = getSemesterVal(labelA);
                                                    const semB = getSemesterVal(labelB);
                                                    
                                                    if (semA !== semB) {
                                                        return semB - semA; // II antes que I
                                                    }
                                                    
                                                    return labelA.localeCompare(labelB);
                                                })
                                                .map(([folderLabel, docsInFolder], groupIdx) => {
                                                    const isExpanded = !!expandedFolders[folderLabel];
                                                return (
                                                    <div key={groupIdx} className="border border-slate-200 rounded-lg overflow-hidden bg-white shadow-sm">
                                                        {/* Folder Header */}
                                                        <button
                                                            onClick={() => setExpandedFolders(prev => ({ ...prev, [folderLabel]: !isExpanded }))}
                                                            type="button"
                                                            className="w-full flex items-center justify-between p-2 bg-slate-100 hover:bg-slate-200 transition-colors border-b border-slate-200"
                                                        >
                                                            <div className="flex items-center gap-2 text-left min-w-0">
                                                                <span className="material-symbols-outlined text-amber-500 text-[18px] shrink-0">folder</span>
                                                                <span className="text-[10px] font-black text-slate-800 uppercase tracking-tight truncate">
                                                                    {folderLabel}
                                                                </span>
                                                                <span className="bg-slate-200 text-slate-700 text-[8px] font-black px-1.5 py-0.5 rounded-full shrink-0">
                                                                    {docsInFolder.length}
                                                                </span>
                                                            </div>
                                                            <span className="material-symbols-outlined text-slate-500 text-[15px] shrink-0">
                                                                {isExpanded ? 'expand_less' : 'expand_more'}
                                                            </span>
                                                        </button>
                                                        
                                                        {/* Documents in Folder */}
                                                        {isExpanded && (
                                                            <div className="p-1.5 flex flex-col gap-1.5 bg-slate-55/30">
                                                                {docsInFolder.map((doc, i) => {
                                                                    const baseUrl = localApiUrl ? localApiUrl.replace(/\/$/, "") : defaultApiUrl;
                                                                    const docUrl = `${baseUrl}/api/files/stream-document?path=${encodeURIComponent(doc.path)}`;
                                                                    
                                                                    return (
                                                                        <a
                                                                            key={i}
                                                                            href={docUrl}
                                                                            target="_blank"
                                                                            rel="noopener noreferrer"
                                                                            className="flex items-center gap-2 bg-white border border-slate-150 rounded p-1.5 hover:border-primary hover:shadow-sm transition-all group relative overflow-hidden"
                                                                        >
                                                                            {/* Accent Left Bar */}
                                                                            <div className={`absolute left-0 top-0 bottom-0 w-0.5 ${doc.isPdf ? 'bg-red-500' : doc.isImage ? 'bg-blue-500' : 'bg-slate-400'}`} />
                                                                            
                                                                            <span className={`material-symbols-outlined shrink-0 text-[16px] ${doc.isPdf ? 'text-red-500' : doc.isImage ? 'text-blue-500' : 'text-slate-400'} pl-0.5`}>
                                                                                {doc.isPdf ? 'picture_as_pdf' : doc.isImage ? 'image' : 'description'}
                                                                            </span>
                                                                            
                                                                            <div className="flex-1 min-w-0 pr-1">
                                                                                <p className="text-[9px] font-bold text-slate-800 group-hover:text-primary leading-tight truncate">
                                                                                    {doc.friendlyName}
                                                                                </p>
                                                                                <p className="text-[7.5px] text-slate-400 font-mono truncate select-all mt-0.5">
                                                                                    {doc.filename}
                                                                                </p>
                                                                            </div>
                                                                            
                                                                            <div className="flex items-center gap-1 shrink-0">
                                                                                <span className={`text-[7.5px] font-black px-1 py-0.2 rounded uppercase tracking-wider ${
                                                                                    doc.isPdf 
                                                                                        ? 'bg-red-50 text-red-600 border border-red-100' 
                                                                                        : doc.isImage 
                                                                                            ? 'bg-blue-50 text-blue-600 border border-blue-100' 
                                                                                            : 'bg-slate-50 text-slate-600 border border-slate-100'
                                                                                }`}>
                                                                                    {doc.ext}
                                                                                </span>
                                                                                <span className="material-symbols-outlined text-transparent group-hover:text-primary text-[12px] transition-all">
                                                                                    open_in_new
                                                                                </span>
                                                                            </div>
                                                                        </a>
                                                                    );
                                                                })}
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    ) : (
                                        <p className="text-[10px] font-bold text-slate-500">No hay documentos registrados.</p>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                )}
                </aside>

                <section className={`lg:col-span-8 h-full transition-all duration-500 ${studentHistory.length === 0 ? 'opacity-30 grayscale' : 'opacity-100'}`}>
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm h-full p-8 flex flex-col overflow-hidden">
                         {studentHistory.length === 0 ? (
                             <div className="flex-1 flex flex-col items-center justify-center text-center">
                                <span className="material-symbols-outlined text-6xl text-slate-200 mb-4">history_edu</span>
                                <h3 className="text-slate-400 font-black uppercase tracking-widest">Historial Académico Institucional</h3>
                             </div>
                         ) : (
                             <div className="w-full text-left flex flex-col h-full">
                                 <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-6 border-b pb-2 shrink-0">Trayectoria de Ingresos UNSAAC</h4>
                                 <div className="flex-1 overflow-y-auto pr-4 space-y-8 relative">
                                     <div className="absolute left-5 top-0 bottom-0 w-0.5 bg-slate-100"></div>
                                     {timelineEvents.map((evt, idx) => {
                                         if (evt.type === 'ingreso') {
                                             const item = evt.data;
                                             return (
                                                 <div key={evt.id} className="flex gap-6 relative group">
                                                     <div className={`size-10 rounded-full flex items-center justify-center shrink-0 z-10 transition-all ${idx === 0 ? 'bg-green-600 text-white shadow-lg shadow-green-200 scale-110' : 'bg-slate-100 text-slate-400 group-hover:bg-primary/10 group-hover:text-primary'}`}>
                                                         <span className="material-symbols-outlined text-xl">{idx === 0 ? 'verified' : 'history'}</span>
                                                     </div>
                                                     <div className="flex-1 pb-2">
                                                         <div className="flex justify-between items-start">
                                                             <div>
                                                                <p className={`font-black text-sm uppercase ${idx === 0 ? 'text-slate-900' : 'text-slate-500'}`}>{fixEncoding(item.CARRERA)}</p>
                                                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Admisión: {item.SEMESTRE}-{item.ANIO}</p>
                                                             </div>
                                                             <button 
                                                                onClick={() => { setEditingRecord(item); setEditForm(item); setIsEditing(true); }}
                                                                className="p-2 text-slate-400 hover:text-primary transition-colors"
                                                             >
                                                                <span className="material-symbols-outlined text-[20px]">edit</span>
                                                             </button>
                                                         </div>
                                                         <div className="mt-3 flex gap-2">
                                                             <span className="bg-slate-50 text-slate-600 border border-slate-200 px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest">{item.MODALIDAD}</span>
                                                             <span className="bg-slate-50 text-slate-600 border border-slate-200 px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest">{item.FILIAL || 'CUSCO'}</span>
                                                             {item.OMERITO && <span className="bg-emerald-50 text-emerald-700 border border-emerald-100 px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest">Puesto: {item.OMERITO}</span>}
                                                             {item.FECHAINGRESO && <span className="bg-blue-50 text-blue-700 border border-blue-100 px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest">{item.FECHAINGRESO}</span>}
                                                         </div>
                                                     </div>
                                                 </div>
                                             );
                                         }
                                         
                                         if (evt.type === 'renuncia') {
                                             const item = evt.data;
                                             return (
                                                 <div key={evt.id} className="flex gap-6 relative group">
                                                     <div className={`size-10 rounded-full flex items-center justify-center shrink-0 z-10 transition-all bg-red-100 text-red-500`}>
                                                         <span className="material-symbols-outlined text-xl">cancel</span>
                                                     </div>
                                                     <div className="flex-1 pb-2">
                                                         <div className="flex justify-between items-start">
                                                             <div>
                                                                <p className={`font-black text-sm uppercase text-slate-700`}>Renuncia de Vacante: {item.school}</p>
                                                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">PROCESO: {item.semester}</p>
                                                             </div>
                                                         </div>
                                                         <div className="mt-3 flex gap-2">
                                                             <span className="bg-red-50 text-red-700 border border-red-200 px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest">Res: {item.resolution_number}</span>
                                                             {item.resolution_date && <span className="bg-slate-50 text-slate-600 border border-slate-200 px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest">{item.resolution_date}</span>}
                                                         </div>
                                                     </div>
                                                 </div>
                                             );
                                         }

                                         if (evt.type === 'reserva') {
                                             const item = evt.data;
                                             return (
                                                 <div key={evt.id} className="flex gap-6 relative group">
                                                     <div className={`size-10 rounded-full flex items-center justify-center shrink-0 z-10 transition-all bg-amber-100 text-amber-600`}>
                                                         <span className="material-symbols-outlined text-xl">bookmark</span>
                                                     </div>
                                                     <div className="flex-1 pb-2">
                                                         <div className="flex justify-between items-start">
                                                             <div>
                                                                <p className={`font-black text-sm uppercase text-slate-700`}>Reserva de Vacante</p>
                                                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Retorno: {item.starting_semester}</p>
                                                             </div>
                                                         </div>
                                                         <div className="mt-3 flex gap-2">
                                                             {item.batch?.resolution_number && <span className="bg-amber-50 text-amber-700 border border-amber-200 px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest">Res: {item.batch.resolution_number}</span>}
                                                             <span className="bg-slate-50 text-slate-600 border border-slate-200 px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest">Iniciará: {item.starting_semester}</span>
                                                         </div>
                                                     </div>
                                                 </div>
                                             );
                                         }
                                         
                                         if (evt.type === 'retiro_reserva') {
                                             const item = evt.data;
                                             return (
                                                 <div key={evt.id} className="flex gap-6 relative group">
                                                     <div className={`size-10 rounded-full flex items-center justify-center shrink-0 z-10 transition-all bg-slate-200 text-slate-500`}>
                                                         <span className="material-symbols-outlined text-xl">block</span>
                                                     </div>
                                                     <div className="flex-1 pb-2">
                                                         <div className="flex justify-between items-start">
                                                             <div>
                                                                <p className={`font-black text-sm uppercase text-slate-700`}>Retiro Definitivo (Tras Reserva)</p>
                                                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">PROCESO: {item.starting_semester}</p>
                                                             </div>
                                                         </div>
                                                         <div className="mt-3 flex gap-2">
                                                             {item.withdrawal_resolution_number && <span className="bg-slate-100 text-slate-600 border border-slate-200 px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest">Res Retiro: {item.withdrawal_resolution_number}</span>}
                                                         </div>
                                                     </div>
                                                 </div>
                                             );
                                         }

                                         return null;
                                     })}
                                 </div>
                             </div>
                         )}
                    </div>
                </section>
            </div>
        ) : activeMode === 'batch' ? (
            <div className="h-full flex flex-col gap-4 animate-in fade-in slide-in-from-right-4 overflow-hidden">
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm shrink-0">
                    <div className="flex flex-col md:flex-row justify-between items-center gap-6">
                        <div className="flex items-center gap-4">
                            <div className="size-14 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center shrink-0 border border-amber-100 shadow-sm"><span className="material-symbols-outlined text-3xl">view_timeline</span></div>
                            <div>
                                <h3 className="font-black text-slate-800 uppercase text-sm tracking-tight">Verificación Multi-Ingreso</h3>
                                <p className="text-xs text-slate-500 font-medium">Contraste listas con la base de datos oficial. Formato CSV: Columna 1 = DNI/Código, Columna 2 = Nombres (con encabezados en la primera fila).</p>
                            </div>
                        </div>
                        <input type="file" accept=".csv" ref={fileInputRef} className="hidden" onChange={handleFileUpload}/>
                        <div className="flex flex-wrap gap-2 justify-end">
                             {batchResults.length > 0 && (
                                 <>
                                     <button onClick={handleExportCruceCC} className="px-5 h-12 bg-blue-50 text-blue-600 rounded-xl text-xs font-black uppercase hover:bg-blue-100 transition-colors flex items-center gap-2">
                                         <span className="material-symbols-outlined text-sm">laptop_mac</span> Reporte CC
                                     </button>
                                     <button onClick={handleExportCruceExcel} className="px-5 h-12 bg-green-50 text-green-600 rounded-xl text-xs font-black uppercase hover:bg-green-100 transition-colors flex items-center gap-2">
                                         <span className="material-symbols-outlined text-sm">table_view</span> Excel
                                     </button>
                                     <button onClick={handleExportCrucePdf} className="px-5 h-12 bg-red-50 text-red-600 rounded-xl text-xs font-black uppercase hover:bg-red-100 transition-colors flex items-center gap-2">
                                         <span className="material-symbols-outlined text-sm">picture_as_pdf</span> PDF
                                     </button>
                                     <button onClick={() => setBatchResults([])} className="px-5 h-12 rounded-xl text-xs font-black uppercase text-slate-400 hover:bg-slate-100 transition-colors">Limpiar</button>
                                 </>
                             )}
                             <button onClick={() => fileInputRef.current?.click()} disabled={isProcessingBatch} className="px-8 h-12 bg-slate-900 text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-xl shadow-slate-900/20 active:scale-95 transition-all flex items-center gap-2">
                                 {isProcessingBatch ? <span className="material-symbols-outlined animate-spin">progress_activity</span> : <span className="material-symbols-outlined">add</span>}
                                 {isProcessingBatch ? 'BUSCANDO...' : 'PROCESAR CSV'}
                             </button>
                        </div>
                    </div>
                </div>
                <div className="flex-1 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
                    {isProcessingBatch && (
                         <div className="p-4 border-b border-slate-100 bg-blue-50/50">
                             <div className="flex justify-between items-center mb-2">
                                 <p className="text-xs font-bold text-blue-800">{batchStatusText}</p>
                                 <p className="text-xs font-black text-blue-900">{batchProgress}%</p>
                             </div>
                             <div className="w-full bg-blue-100 h-2 rounded-full overflow-hidden">
                                 <div className="bg-blue-600 h-full transition-all duration-300 ease-out" style={{ width: `${batchProgress}%` }}></div>
                             </div>
                         </div>
                    )}
                    <div className="flex-1 overflow-auto">
                        <table className="w-full text-left border-collapse">
                            <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 z-10 shadow-sm">
                                <tr>
                                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest w-40">Código / DNI</th>
                                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Nombre (CSV)</th>
                                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest w-32 text-center">Estatus</th>
                                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Carrera / Semestre</th>
                                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right pr-10">Acciones</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {batchResults.length === 0 ? (
                                    <tr><td colSpan={5} className="py-20 text-center text-slate-400 italic font-bold">Sin datos procesados.</td></tr>
                                ) : (
                                    batchResults.map((res, i) => (
                                        <tr key={i} className={`hover:bg-slate-50 transition-colors ${!res.found ? 'bg-red-50/20' : ''}`}>
                                            <td className="px-6 py-4 font-mono text-xs font-bold text-slate-700">{res.originalCode}</td>
                                            <td className="px-6 py-4 font-black text-slate-800 text-xs uppercase">{res.originalName}</td>
                                            <td className="px-6 py-4 text-center">
                                                <span className={`inline-flex px-2 py-0.5 rounded text-[9px] font-black uppercase border ${
                                                    res.status === 'EXACT' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 
                                                    (res.status === 'PROBABLE' ? 'bg-amber-50 text-amber-700 border-amber-200' : 
                                                    'bg-red-50 text-red-700 border-red-200')
                                                }`}>
                                                    {res.status === 'EXACT' ? 'CONFIRMADO' : (res.status === 'PROBABLE' ? 'PROBABLE' : 'NO REGISTRADO')}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4">
                                                {res.found ? (
                                                    <div className="flex flex-col">
                                                        <p className="font-bold text-xs uppercase text-slate-900">{fixEncoding(res.allMatches[0].CARRERA)}</p>
                                                        <p className="text-[10px] text-slate-400 font-bold uppercase">{res.allMatches[0].SEMESTRE}-{res.allMatches[0].ANIO}</p>
                                                    </div>
                                                ) : '--'}
                                            </td>
                                            <td className="px-6 py-4 text-right pr-10">
                                                {res.found && (
                                                    <button onClick={() => setSelectedBatchHistory(res.allMatches)} className="size-9 bg-primary/10 text-primary rounded-xl flex items-center justify-center hover:bg-primary hover:text-white transition-all"><span className="material-symbols-outlined text-[20px]">visibility</span></button>
                                                )}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        ) : (
            <div className="h-full flex flex-col gap-6 animate-in fade-in slide-in-from-right-4 overflow-hidden">
                <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm shrink-0 flex flex-col items-center text-center gap-6">
                    <div className="size-20 bg-primary/10 text-primary rounded-full flex items-center justify-center border border-primary/20"><span className="material-symbols-outlined text-4xl">upload_file</span></div>
                    <div>
                        <h2 className="text-xl font-black text-slate-900 uppercase">Cargar Nuevos Ingresantes</h2>
                        <p className="text-slate-500 text-sm max-w-lg mt-1">Suba un archivo CSV con el formato: <br/><code className="bg-slate-100 px-2 rounded font-bold">CÓDIGO, NOMBRE, CARRERA, FILIAL, MODALIDAD, SEMESTRE, AÑO, NOTA, OMÉRITO, FECHA_INGRESO</code></p>
                    </div>
                    <input type="file" accept=".csv" ref={importFileInputRef} className="hidden" onChange={handleImportFile}/>
                    <div className="flex gap-4">
                        <button onClick={() => importFileInputRef.current?.click()} className="px-10 h-14 bg-white border-2 border-slate-900 text-slate-900 rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-slate-50 transition-all active:scale-95">Seleccionar Archivo</button>
                        {importData.length > 0 && (
                            <button onClick={processImport} disabled={isImporting} className="px-10 h-14 bg-primary text-white rounded-2xl text-xs font-black uppercase tracking-widest shadow-xl shadow-primary/30 hover:bg-merlot transition-all active:scale-95 flex items-center gap-2">
                                {isImporting ? <span className="material-symbols-outlined animate-spin">progress_activity</span> : <span className="material-symbols-outlined">save</span>}
                                {isImporting ? 'PROCESANDO...' : `GUARDAR ${importData.length} REGISTROS`}
                            </button>
                        )}
                    </div>
                    {isImporting && (
                        <div className="w-full max-w-md">
                            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                                <div className="h-full bg-primary transition-all duration-300" style={{width: `${importProgress}%`}}></div>
                            </div>
                            <p className="text-[10px] font-black text-slate-400 mt-2 uppercase tracking-widest">Progreso de Carga: {importProgress}%</p>
                        </div>
                    )}
                </div>

                <div className="flex-1 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
                    <div className="p-4 border-b bg-slate-50 flex justify-between items-center">
                        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Vista Previa de Importación</h4>
                        {importData.length > 0 && <button onClick={() => setImportData([])} className="text-[10px] font-black text-red-600 uppercase hover:underline">Cancelar Carga</button>}
                    </div>
                    <div className="flex-1 overflow-auto">
                        <table className="w-full text-left border-collapse">
                            <thead className="sticky top-0 bg-white border-b border-slate-200 z-10 shadow-sm">
                                <tr>
                                    <th className="px-6 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest">Código</th>
                                    <th className="px-6 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest">Ingresante</th>
                                    <th className="px-6 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest">E. Profesional</th>
                                    <th className="px-6 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest">Modalidad</th>
                                    <th className="px-6 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest">Proceso</th>
                                    <th className="px-6 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest text-right pr-6">Ptje/OM</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {importData.length === 0 ? (
                                    <tr><td colSpan={6} className="py-20 text-center text-slate-300 italic text-sm">Cargue un archivo para previsualizar.</td></tr>
                                ) : (
                                    importData.slice(0, 50).map((row, idx) => (
                                        <tr key={idx} className="hover:bg-slate-50/50">
                                            <td className="px-6 py-3 font-mono text-[10px] font-bold text-slate-700">{row.CODPOSTULANTE}</td>
                                            <td className="px-6 py-3 font-black text-slate-800 text-xs uppercase">{row.NOMBRE}</td>
                                            <td className="px-6 py-3 text-xs uppercase text-slate-500 font-medium">{row.CARRERA}</td>
                                            <td className="px-6 py-3 text-[10px] uppercase font-bold text-slate-400">{row.MODALIDAD}</td>
                                            <td className="px-6 py-3 text-[10px] font-black text-slate-600">{row.SEMESTRE}-{row.ANIO}</td>
                                            <td className="px-6 py-3 text-right pr-6 font-bold text-xs text-primary">{row.NOTA} / {row.OMERITO}</td>
                                        </tr>
                                    ))
                                )}
                                {importData.length > 50 && (
                                    <tr className="bg-slate-50/30"><td colSpan={6} className="py-3 text-center text-[10px] text-slate-400 font-bold uppercase italic">Y {importData.length - 50} registros más...</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        )}
      </div>
    </div>
  );
};