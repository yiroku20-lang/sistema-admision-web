import React, { useState, useRef, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Participant, User } from '../types';
import { useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { 
  StudentDocument, 
  getGatewayBaseUrl, 
  testGatewayHealth, 
  fetchStudentDocumentsFromGateway, 
  getDocumentStreamUrl, 
  parseDocumentInfo,
  isElectronApp 
} from '../lib/fileGateway';
import { FileGatewayModal } from '../components/FileGatewayModal';
import { DocumentViewerModal } from '../components/DocumentViewerModal';
import { 
  IntegratedStudentModal, 
  IntegratedStudentData, 
  ApplicantApplicationRecord 
} from '../components/IntegratedStudentModal';
import { parseBatchResolution } from './VacancyReservation';

type SearchMode = 'individual' | 'batch' | 'import';

interface BatchResult {
    originalCode: string;
    originalName: string;
    studentCode?: string;
    found: boolean;
    status: 'EXACT' | 'PROBABLE' | 'NOT_FOUND';
    allMatches: Participant[];
}

// Helpers for decoding and value parsing
export const fixEncoding = (text: string | undefined | null) => {
    if (!text) return '';
    let fixed = String(text);
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

// Global cache for pre-revision files to avoid re-downloading on every keystroke
let preRevisionCache: { data: any[]; timestamp: number } | null = null;

const getPreRevisionRecords = async (): Promise<any[]> => {
    const now = Date.now();
    if (preRevisionCache && (now - preRevisionCache.timestamp) < 5 * 60 * 1000) {
        return preRevisionCache.data;
    }
    try {
        const { data, error } = await supabase.from('pre_revision_archivos').select('id, modalidad_id, csv_data');
        if (error || !data) return preRevisionCache?.data || [];
        
        const allRows: any[] = [];
        for (const item of data) {
            let parsed = item.csv_data;
            if (typeof parsed === 'string') {
                try { parsed = JSON.parse(parsed); } catch (e) { parsed = []; }
            }
            let rows: any[] = [];
            if (Array.isArray(parsed)) {
                rows = parsed;
            } else if (parsed && typeof parsed === 'object') {
                if (Array.isArray(parsed.postulantes)) rows = parsed.postulantes;
                else if (Array.isArray(parsed.data)) rows = parsed.data;
                else if (Array.isArray(parsed.rows)) rows = parsed.rows;
            }

            rows.forEach((r: any) => {
                if (r && typeof r === 'object') {
                    allRows.push({ ...r, _preRevisionId: item.id, _modalidadId: item.modalidad_id });
                }
            });
        }
        preRevisionCache = { data: allRows, timestamp: now };
        return allRows;
    } catch (err) {
        console.error('Error fetching pre_revision_archivos:', err);
        return preRevisionCache?.data || [];
    }
};

export const StudentLookup: React.FC<{ user: User }> = ({ user }) => {
  const navigate = useNavigate();
  const [activeMode, setActiveMode] = useState<SearchMode>('individual');
  
  // File Gateway connection state
  const [gatewayUrl, setGatewayUrl] = useState(() => getGatewayBaseUrl());
  const [gatewayStatus, setGatewayStatus] = useState<{
    connected: boolean;
    latency?: number;
    checking: boolean;
    url: string;
  }>({
    connected: false,
    checking: true,
    url: getGatewayBaseUrl()
  });
  const [isGatewayModalOpen, setIsGatewayModalOpen] = useState(false);
  const [selectedDocForViewer, setSelectedDocForViewer] = useState<StudentDocument | null>(null);
  const [isFichaModalOpen, setIsFichaModalOpen] = useState(false);
  
  // State for toggling individual folders in local documents
  const [expandedFolders, setExpandedFolders] = useState<{[key: string]: boolean}>({});

  // Search State
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<React.ReactNode | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  
  // Candidate list & selected unified profile
  const [candidatesList, setCandidatesList] = useState<IntegratedStudentData[]>([]);
  const [selectedProfile, setSelectedProfile] = useState<IntegratedStudentData | null>(null);

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

  // Edit / Add Ingreso Records
  const [isEditing, setIsEditing] = useState(false);
  const [editingRecord, setEditingRecord] = useState<Participant | null>(null);
  const [editForm, setEditForm] = useState<Partial<Participant>>({});
  const [showSyncNameOption, setShowSyncNameOption] = useState(false);

  const [isAddingNew, setIsAddingNew] = useState(false);
  const [newStudentForm, setNewStudentForm] = useState<Partial<Participant>>({});
  
  // Local Documents State
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [docsError, setDocsError] = useState<string | null>(null);

  // Check gateway health
  const checkGateway = useCallback(async (targetUrl?: string) => {
    const url = targetUrl || getGatewayBaseUrl();
    setGatewayStatus(prev => ({ ...prev, checking: true, url }));
    try {
      const result = await testGatewayHealth(url);
      setGatewayStatus({
        connected: result.ok,
        latency: result.latency,
        checking: false,
        url: result.url
      });
    } catch {
      setGatewayStatus({
        connected: false,
        checking: false,
        url
      });
    }
  }, []);

  useEffect(() => {
    checkGateway();

    const handleGatewayChanged = (e: any) => {
      const newUrl = e.detail?.url || getGatewayBaseUrl();
      setGatewayUrl(newUrl);
      checkGateway(newUrl);
    };

    window.addEventListener('gateway-url-changed', handleGatewayChanged);
    return () => {
      window.removeEventListener('gateway-url-changed', handleGatewayChanged);
    };
  }, [checkGateway]);

  // Fetch full details, school, gateway docs, renuncias and reservas for a profile
  const fetchProfileExtraInfo = async (profile: IntegratedStudentData) => {
      setExpandedFolders({});
      setLoadingDocs(true);
      setDocsError(null);

      const dni = profile.dni;
      let updatedSchoolInfo = profile.schoolInfo;
      let updatedDocuments: StudentDocument[] = [];
      let updatedPhoto: StudentDocument | null = null;
      let updatedRenuncias: any[] = [];
      let updatedReservas: any[] = [];

      // 1. Fetch Gateway Documents from port 5000
      try {
          const resDocs = await fetchStudentDocumentsFromGateway(dni, gatewayUrl);
          if (!resDocs.ok) {
              setDocsError(resDocs.error || 'No se pudo consultar el servidor de archivos.');
              setGatewayStatus(prev => ({ ...prev, connected: false }));
          } else {
              updatedDocuments = resDocs.documents || [];
              if (updatedDocuments.length > 0) {
                  setGatewayStatus(prev => ({ ...prev, connected: true }));
                  // Find photo doc (e.g. 1_1_{dni}.jpg or image)
                  const photoMatch = updatedDocuments.find(d => 
                      d.isImage || (d.filename && d.filename.toLowerCase().startsWith(`1_1_${dni.toLowerCase()}`))
                  );
                  if (photoMatch) updatedPhoto = photoMatch;
              }
          }
      } catch (err: any) {
          setDocsError(err.message || 'Servidor de archivos fuera de línea');
          setGatewayStatus(prev => ({ ...prev, connected: false }));
      } finally {
          setLoadingDocs(false);
      }

      // 2. Fetch Colegio details if schoolCode exists
      if (profile.schoolCode) {
          try {
              const rawCode = profile.schoolCode.trim();
              const unpadded = rawCode.replace(/^0+/, '');
              const padded7 = rawCode.padStart(7, '0');
              const { data: cols } = await supabase
                  .from('colegios')
                  .select('*')
                  .or(`codigo_modular.eq.${rawCode},codigo_modular.eq.${unpadded},codigo_modular.eq.${padded7}`)
                  .limit(1);
              if (cols && cols.length > 0) {
                  updatedSchoolInfo = cols[0];
              }
          } catch (e) {
              console.error('Error fetching colegio:', e);
          }
      }

      // 3. Fetch Renuncias and Reservas
      try {
          const [renReq, resReq] = await Promise.all([
              supabase.from('renuncias').select('*').eq('student_code', dni).eq('status', 'Finalizado'),
              supabase.from('reserva_vacantes_detalles').select('*, batch:reserva_vacantes_bloques(*)').eq('student_code', dni)
          ]);
          updatedRenuncias = renReq.data || [];
          updatedReservas = resReq.data || [];
      } catch (err) {
          console.error("Error fetching renuncias/reservas:", err);
      }

      // Set complete profile
      const hasRen = updatedRenuncias.length > 0;
      const hasRes = updatedReservas.length > 0;
      const hasRet = updatedReservas.some(r => r.is_withdrawn);

      setSelectedProfile(prev => {
          if (!prev || prev.dni !== dni) return prev;
          return {
              ...prev,
              schoolInfo: updatedSchoolInfo,
              documents: updatedDocuments,
              photoDoc: updatedPhoto,
              renuncias: updatedRenuncias,
              reservas: updatedReservas,
              hasRenuncia: hasRen,
              hasReserva: hasRes,
              hasRetiroReserva: hasRet
          };
      });
  };

  const getModalityAndSemesterFromPath = (pathStr: string | undefined | null) => {
      if (!pathStr || typeof pathStr !== 'string') {
          return 'EXPEDIENTE GENERAL';
      }
      const segments = pathStr.split(/[\/\\]/).map(s => s.trim()).filter(Boolean);
      let targetFolder = '';
      
      for (let i = segments.length - 2; i >= 0; i--) {
          const seg = segments[i];
          const isNumeric = /^\d+$/.test(seg);
          const isDrive = /^[a-zA-Z]:$/.test(seg);
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
      displayName = displayName
          .replace(/^DOCUMENTOS ADMISION DE EL /g, '')
          .replace(/^DOCUMENTOS ADMISION DE LA /g, '')
          .replace(/^DOCUMENTOS ADMISION DE /g, '')
          .replace(/^DOCUMENTOS DE ADMISION /g, '')
          .replace(/^DOCUMENTOS ADMISION /g, '')
          .replace(/^DOCUMENTOS /g, '')
          .replace(/^ARCHIVOS ADMISION /g, '')
          .trim();
          
      displayName = displayName.replace(/(\d{4})\s+(I+|X+)/g, "$1-$2");
      displayName = displayName.replace(/(\d{4})-(I+|X+)/g, "$1-$2");
      
      return displayName;
  };

  const getGroupedDocuments = (docs: any[]) => {
      const groups: { [key: string]: StudentDocument[] } = {};
      if (!docs || !Array.isArray(docs)) return groups;
      
      docs.forEach(doc => {
          if (!doc) return;
          const rawPath = typeof doc === 'string' ? doc : (doc.relativePath || doc.path || doc.file_path || doc.url || '');
          
          let cleanPath = rawPath;
          if (rawPath.includes('?path=')) {
              try {
                  const match = rawPath.match(/[?&]path=([^&]+)/);
                  if (match) cleanPath = decodeURIComponent(match[1]);
              } catch (e) {
                  console.error("Error decoding path parameter:", e);
              }
          }
          
          const groupLabel = getModalityAndSemesterFromPath(cleanPath);
          const parsedDoc = parseDocumentInfo(doc, cleanPath);
          parsedDoc.concursoLabel = groupLabel;
          
          if (!groups[groupLabel]) {
              groups[groupLabel] = [];
          }
          groups[groupLabel].push(parsedDoc);
      });

      Object.keys(groups).forEach(groupLabel => {
          groups[groupLabel].sort((a, b) => (a.filename || '').localeCompare(b.filename || ''));
      });
      
      return groups;
  };

  // MULTI-LAYER UNIVERSAL SEARCH
  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setLoading(true); 
    setError(null); 
    setSelectedProfile(null);
    setCandidatesList([]); 
    setHasSearched(true);
    
    try {
      const term = searchQuery.trim();
      const isNumeric = /^\d+$/.test(term);
      
      // 1. Layer 1: Query 'participantes' (Ingresantes oficiales)
      let partQuery = supabase.from('participantes').select('*');
      if (isNumeric) {
          partQuery = partQuery.eq('CODPOSTULANTE', term);
      } else {
          const words = term.split(/[\s,\-/]+/).filter(Boolean);
          words.forEach(word => {
            const agnostic = word.replace(/[aeiouáéíóúüAEIOUÁÉÍÓÚÜ]/g, '_');
            partQuery = partQuery.ilike('NOMBRE', `%${agnostic}%`);
          });
      }
      
      const [partRes, preRows] = await Promise.all([
          partQuery.order('ANIO', { ascending: false }).order('SEMESTRE', { ascending: false }),
          getPreRevisionRecords()
      ]);

      if (partRes.error) throw partRes.error;
      const partData = partRes.data || [];

      // 2. Layer 2: Filter pre_revision_archivos
      const preMatches: any[] = [];
      const searchLower = term.toLowerCase();
      const searchWords = searchLower.split(/[\s,\-/]+/).filter(Boolean);

      preRows.forEach(row => {
          const dni = String(row.NroDocumento || row.alumno || row.dni || row.DNI || row.CODPOSTULANTE || row.DOCUMENTO || '').trim();
          const name = String(row.nombre || row.Nombre || row.NOMBRE || row.POSTULANTE || '').toUpperCase();
          
          if (isNumeric) {
              if (dni === term) {
                  preMatches.push(row);
              }
          } else {
              // Word match
              const allWordsMatch = searchWords.every(w => {
                  const wNorm = w.replace(/[aeiouáéíóúü]/g, '');
                  const nameNorm = name.toLowerCase().replace(/[aeiouáéíóúü]/g, '');
                  return nameNorm.includes(wNorm) || name.toLowerCase().includes(w);
              });
              if (allWordsMatch) {
                  preMatches.push(row);
              }
          }
      });

      // 3. Assemble Unified Person Map
      const personMap = new Map<string, IntegratedStudentData>();

      // Populate from participantes (Admissions)
      partData.forEach(p => {
          const dni = String(p.CODPOSTULANTE).trim();
          if (!dni) return;
          if (!personMap.has(dni)) {
              personMap.set(dni, {
                  dni,
                  fullName: fixEncoding(p.NOMBRE),
                  isIngresanteOficial: true,
                  isSoloPostulante: false,
                  hasRenuncia: false,
                  hasReserva: false,
                  hasRetiroReserva: false,
                  admissions: [],
                  applications: [],
                  documents: [],
                  renuncias: [],
                  reservas: []
              });
          }
          const profile = personMap.get(dni)!;
          profile.admissions.push(p);
      });

      // Populate & Enrich from pre_revision_archivos
      preMatches.forEach(r => {
          const dni = String(r.NroDocumento || r.alumno || r.dni || r.DNI || r.CODPOSTULANTE || r.DOCUMENTO || '').trim();
          if (!dni) return;
          
          const rawName = String(r.nombre || r.Nombre || r.NOMBRE || r.POSTULANTE || '').trim();
          const obs = String(r.OBSERVACION || r.observacion || r.Condicion || r.condicion || r.ESTADO || '').toUpperCase();
          const isAdmittedInProcess = obs.includes('INGRESA') || obs.includes('INGRESO') || obs.includes('ADMITIDO') || obs === 'SI';

          if (!personMap.has(dni)) {
              personMap.set(dni, {
                  dni,
                  fullName: fixEncoding(rawName) || `POSTULANTE DNI ${dni}`,
                  isIngresanteOficial: isAdmittedInProcess,
                  isSoloPostulante: !isAdmittedInProcess,
                  hasRenuncia: false,
                  hasReserva: false,
                  hasRetiroReserva: false,
                  admissions: [],
                  applications: [],
                  documents: [],
                  renuncias: [],
                  reservas: []
              });
          }

          const profile = personMap.get(dni)!;
          if (isAdmittedInProcess) {
              profile.isIngresanteOficial = true;
              profile.isSoloPostulante = false;
          }

          // Contact details
          if (!profile.phone && (r.telefono || r.Telefono || r.celular)) profile.phone = String(r.telefono || r.Telefono || r.celular).trim();
          if (!profile.email && (r.email || r.Email || r.CorreoPersonal)) profile.email = String(r.email || r.Email || r.CorreoPersonal).trim();
          if (!profile.address && (r.Direccion || r.Direccion_1 || r.direccion)) profile.address = String(r.Direccion || r.Direccion_1 || r.direccion).trim();
          if (!profile.birthDate && r.FechaNacimiento) profile.birthDate = String(r.FechaNacimiento).trim();
          if (!profile.birthPlace && r.LugarNacimiento) profile.birthPlace = String(r.LugarNacimiento).trim();
          if (!profile.currentUbigeo && (r.Ubigeo_Domicilio_Actual || r.Ubigeo)) profile.currentUbigeo = String(r.Ubigeo_Domicilio_Actual || r.Ubigeo).trim();
          if (!profile.gender && (r.Sexo || r.sexo)) profile.gender = String(r.Sexo || r.sexo).trim();
          if (!profile.disability && r.Discapacidad) profile.disability = String(r.Discapacidad).trim();
          if (!profile.nationality && r.Nacionalidad) profile.nationality = String(r.Nacionalidad).trim();

          // School
          if (!profile.schoolCode && (r.colegio || r.Colegio)) profile.schoolCode = String(r.colegio || r.Colegio).trim();
          if (!profile.schoolName && (r.nombrecolegio || r.nombreColegio)) profile.schoolName = String(r.nombrecolegio || r.nombreColegio).trim();

          // Application Record
          const appRec: ApplicantApplicationRecord = {
              id: `${dni}-${profile.applications.length}`,
              modalidad: String(r.nombremodalidad || r.Modalidad || 'PROCESO DE ADMISIÓN').toUpperCase(),
              carrera1: fixEncoding(r['Carrera 1'] || r.Escuela1 || r.escuela1 || r.Carrera || r.carrera),
              carrera2: fixEncoding(r['Carrera 2'] || r.Escuela2 || r.escuela2),
              carreraIngreso: fixEncoding(r.CarreraIngreso || r.carreraIngreso || r.carrera_ingreso),
              nota: String(r.Nota || r.notavigesimal || r.nota || r.PUNTAJE || '').trim(),
              puesto: String(r.POS || r.pos || r.PUESTO || r.OMERITO || '').trim(),
              condicion: obs || (isAdmittedInProcess ? 'INGRESANTE' : 'PARTICIPANTE'),
              grupo: String(r.grupo || r.Grupo || '').trim(),
              aula: String(r.aula || r.Aula || '').trim(),
              rawRow: r
          };
          profile.applications.push(appRec);
      });

      const uniqueList = Array.from(personMap.values());

      if (uniqueList.length === 1) {
          const single = uniqueList[0];
          setSelectedProfile(single);
          setCandidatesList([]);
          fetchProfileExtraInfo(single);
      } else if (uniqueList.length > 1) {
          setCandidatesList(uniqueList);
          setSelectedProfile(null);
      } else {
          setCandidatesList([]);
          setSelectedProfile(null);
      }
    } catch (err: any) {
      console.error(err);
      setError('Error al consultar las bases de datos de postulantes e ingresantes.');
    } finally { 
      setLoading(false); 
    }
  };

  const handleSelectCandidate = (candidate: IntegratedStudentData) => {
      setSelectedProfile(candidate);
      setCandidatesList([]);
      fetchProfileExtraInfo(candidate);
  };

  const handleUpdateRecord = async (syncName: boolean = false) => {
    if (!editingRecord || !editForm.NOMBRE?.trim() || !selectedProfile) return;
    setLoading(true);
    try {
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

      if (syncName && editingRecord.NOMBRE !== editForm.NOMBRE.toUpperCase()) {
          await supabase
            .from('participantes')
            .update({ NOMBRE: editForm.NOMBRE.toUpperCase() })
            .eq('NOMBRE', editingRecord.NOMBRE);
      }
      
      // Update state
      setSelectedProfile(prev => {
          if (!prev) return prev;
          const updatedAdms = prev.admissions.map(s => {
              if (syncName && s.NOMBRE === editingRecord.NOMBRE) {
                  return { ...s, ...editForm, NOMBRE: editForm.NOMBRE!.toUpperCase() } as Participant;
              }
              if (s.id === editingRecord.id) {
                  return { ...s, ...editForm, NOMBRE: editForm.NOMBRE!.toUpperCase() } as Participant;
              }
              return s;
          });
          return {
              ...prev,
              fullName: syncName ? editForm.NOMBRE!.toUpperCase() : prev.fullName,
              admissions: updatedAdms
          };
      });
      
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
      setSearchQuery(data.CODPOSTULANTE);
      setTimeout(() => {
          handleSearch();
      }, 100);
    } catch (err: any) {
      alert('Error al agregar estudiante: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Batch Processing
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      
      const fileName = file.name.toLowerCase();
      const isExcel = fileName.endsWith('.xlsx') || fileName.endsWith('.xls');
      const reader = new FileReader();

      reader.onload = async (evt) => {
          try {
              let rows: any[][] = [];

              if (isExcel) {
                  const data = new Uint8Array(evt.target?.result as ArrayBuffer);
                  const workbook = XLSX.read(data, { type: 'array' });
                  const firstSheetName = workbook.SheetNames[0];
                  const worksheet = workbook.Sheets[firstSheetName];
                  const rawExcelRows: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
                  rows = rawExcelRows.filter(r => r && r.some(cell => String(cell ?? '').trim() !== ''));
              } else {
                  const content = evt.target?.result as string;
                  const lines = content.split(/\r?\n/).filter(line => line.trim());
                  if (lines.length === 0) return;

                  const firstLine = lines[0];
                  let delimiter = ',';
                  if (firstLine.includes(';') && (firstLine.split(';').length >= firstLine.split(',').length)) {
                      delimiter = ';';
                  } else if (firstLine.includes('\t')) {
                      delimiter = '\t';
                  }

                  rows = lines.map(line => {
                      return line.split(delimiter).map(p => p.trim().replace(/^"|"$/g, ''));
                  }).filter(r => r && r.some(cell => String(cell ?? '').trim() !== ''));
              }

              if (rows.length === 0) {
                  alert("El archivo no contiene registros válidos.");
                  return;
              }

              setIsProcessingBatch(true);
              setBatchProgress(0);
              setBatchStatusText('Analizando archivo...');

              const firstRow = rows[0].map(c => String(c ?? '').trim().toUpperCase());
              const isHeader = firstRow.some(c => 
                  c.includes('DNI') || c.includes('NOMBRE') || c.includes('POSTULANTE') || 
                  c.includes('ESTUD') || c.includes('ALUM') || c.includes('CODIGO')
              );

              let codeIdx = 0;
              let nameIdx = 1;
              let studentCodeIdx = -1;
              let dataStartIndex = isHeader ? 1 : 0;

              if (isHeader) {
                  const sIdx = firstRow.findIndex(c => 
                      c.includes('ESTUD') || c.includes('ALUM') || c.includes('MATRICULA')
                  );
                  if (sIdx !== -1) studentCodeIdx = sIdx;

                  const dIdx = firstRow.findIndex((c, idx) => 
                      idx !== studentCodeIdx && (c.includes('DNI') || c.includes('DOC') || c.includes('POSTULANTE') || c.includes('CODIGO'))
                  );
                  if (dIdx !== -1) codeIdx = dIdx;

                  const nIdx = firstRow.findIndex((c, idx) => 
                      idx !== studentCodeIdx && idx !== codeIdx && (c.includes('NOMBRE') || c.includes('APELLIDO'))
                  );
                  if (nIdx !== -1) nameIdx = nIdx;
              }

              const rawData = rows.slice(dataStartIndex).map(parts => {
                  const code = String(parts[codeIdx] ?? '').trim();
                  const name = String(parts[nameIdx] ?? '').trim().toUpperCase();
                  const studentCode = studentCodeIdx >= 0 ? String(parts[studentCodeIdx] ?? '').trim() : '';
                  return { code, name, studentCode };
              }).filter(item => item.code !== '' || item.name !== '');

              const exactCodes = Array.from(new Set(rawData.map(d => d.code).filter(Boolean)));
              const exactNames = Array.from(new Set(rawData.map(d => d.name).filter(Boolean)));
              
              let dbMatches: any[] = [];
              const chunkSize = 200;
              
              setBatchStatusText('Consultando base de datos oficial...');
              for (let i = 0; i < exactCodes.length; i += chunkSize) {
                  const chunk = exactCodes.slice(i, i + chunkSize);
                  const { data } = await supabase
                      .from('participantes')
                      .select('*')
                      .in('CODPOSTULANTE', chunk);
                  if (data) dbMatches = dbMatches.concat(data);
                  setBatchProgress(Math.round(((i + chunkSize) / (exactCodes.length || 1)) * 50));
              }

              for (let i = 0; i < exactNames.length; i += chunkSize) {
                  const chunk = exactNames.slice(i, i + chunkSize);
                  const { data } = await supabase
                      .from('participantes')
                      .select('*')
                      .in('NOMBRE', chunk);
                  if (data) {
                      const newMatches = data.filter(d => !dbMatches.some(dm => dm.id === d.id));
                      dbMatches = dbMatches.concat(newMatches);
                  }
                  setBatchProgress(50 + Math.round(((i + chunkSize) / (exactNames.length || 1)) * 40));
              }

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

              const results: BatchResult[] = rawData.map(item => {
                  const codeMatches = item.code ? (codeMap.get(item.code) || []) : [];
                  const nameMatches = item.name ? (nameMap.get(item.name) || []) : [];
                  
                  let exactMatches: Participant[] = [];
                  let probableMatches: Participant[] = [];

                  if (item.code && item.name) {
                      const nameMatchesSet = new Set(nameMatches.map(m => m.id));
                      codeMatches.forEach(m => {
                          if (nameMatchesSet.has(m.id)) exactMatches.push(m);
                          else probableMatches.push(m);
                      });
                      nameMatches.forEach(m => {
                          if (!probableMatches.some(pm => pm.id === m.id) && !exactMatches.some(em => em.id === m.id)) {
                              probableMatches.push(m);
                          }
                      });
                  } else if (item.name) {
                      exactMatches = nameMatches;
                  } else if (item.code) {
                      exactMatches = codeMatches;
                  }

                  const finalMatches = exactMatches.length > 0 ? exactMatches : probableMatches;
                  let s: 'EXACT' | 'PROBABLE' | 'NOT_FOUND' = 'NOT_FOUND';
                  if (exactMatches.length > 0) s = 'EXACT';
                  else if (probableMatches.length > 0) s = 'PROBABLE';

                  return {
                      originalCode: item.code,
                      originalName: item.name,
                      studentCode: item.studentCode,
                      found: finalMatches.length > 0,
                      status: s,
                      allMatches: finalMatches
                  };
              });

              setBatchResults(results);
              setBatchProgress(100);
              setIsProcessingBatch(false);
          } catch (err: any) {
              alert("Error al procesar archivo: " + err.message);
              setIsProcessingBatch(false);
          }
      };

      if (isExcel) reader.readAsArrayBuffer(file);
      else reader.readAsText(file);
  };

  const handleExportCruceExcel = () => {
      if (batchResults.length === 0) return;
      const dataToExport = batchResults.map(res => ({
          'Código/DNI': res.originalCode,
          'Cód. Estudiante': res.studentCode || '',
          'Nombre Buscado': res.originalName,
          'Estado': res.status === 'EXACT' ? 'CONFIRMADO' : (res.status === 'PROBABLE' ? 'PROBABLE' : 'NO REGISTRADO'),
          'Carrera': res.allMatches.length > 0 ? fixEncoding(res.allMatches[0].CARRERA) : '',
          'Semestre-Año': res.allMatches.length > 0 ? `${res.allMatches[0].SEMESTRE}-${res.allMatches[0].ANIO}` : '',
          'Modalidad': res.allMatches.length > 0 ? res.allMatches[0].MODALIDAD : '',
          'Nota': res.allMatches.length > 0 ? res.allMatches[0].NOTA : '',
          'Puesto': res.allMatches.length > 0 ? res.allMatches[0].OMERITO : ''
      }));

      const ws = XLSX.utils.json_to_sheet(dataToExport);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Cruce_Masivo');
      XLSX.writeFile(wb, `Cruce_Masivo_${new Date().getTime()}.xlsx`);
  };

  const handleExportCrucePdf = () => {
      if (batchResults.length === 0) return;
      const doc = new jsPDF();
      doc.setFontSize(14);
      doc.text('REPORTE DE CRUCE MASIVO DE INGRESANTES', 14, 15);
      doc.setFontSize(9);
      doc.text(`Fecha: ${new Date().toLocaleDateString('es-PE')} ${new Date().toLocaleTimeString('es-PE')}`, 14, 22);

      const tableData = batchResults.map(res => [
          res.originalCode,
          res.studentCode || '-',
          res.originalName,
          res.status === 'EXACT' ? 'CONFIRMADO' : (res.status === 'PROBABLE' ? 'PROBABLE' : 'NO REGISTRADO'),
          res.allMatches.length > 0 ? `${fixEncoding(res.allMatches[0].CARRERA)} (${res.allMatches[0].SEMESTRE}-${res.allMatches[0].ANIO})` : '-'
      ]);

      autoTable(doc, {
          startY: 28,
          head: [['Código/DNI', 'Cód. Est.', 'Nombre Buscado', 'Estado', 'Carrera y Proceso']],
          body: tableData,
          theme: 'striped',
          headStyles: { fillColor: [15, 23, 42] },
          styles: { fontSize: 8 }
      });

      doc.save(`Cruce_Masivo_${new Date().getTime()}.pdf`);
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
          alert(`✅ Importación exitosa: ${successCount} registros ingresados.`);
          setImportData([]);
          setActiveMode('individual');
      } catch (err: any) {
          alert(`Error durante la importación: ${err.message}`);
      } finally {
          setIsImporting(false);
          setImportProgress(0);
      }
  };

  // Build unified timeline events for selected profile
  const getUnifiedTimelineEvents = () => {
      if (!selectedProfile) return [];
      const events: any[] = [];
      
      // 1. Official admissions
      selectedProfile.admissions.forEach(adm => {
          events.push({
              id: `ingreso-${adm.id}`,
              type: 'ingreso',
              sortKey: `${adm.ANIO}-${adm.SEMESTRE === 'I' ? '1' : adm.SEMESTRE === 'II' ? '2' : '3'}-ingreso`,
              title: adm.CARRERA,
              subtitle: `ADMISIÓN OFICIAL: ${adm.SEMESTRE}-${adm.ANIO} • ${adm.MODALIDAD}`,
              score: adm.NOTA,
              merit: adm.OMERITO,
              date: adm.FECHAINGRESO,
              branch: adm.FILIAL || 'CUSCO',
              data: adm
          });
      });

      // 2. Applications from pre-revision processes
      selectedProfile.applications.forEach((app, i) => {
          const isIng = app.condicion?.toUpperCase().includes('INGRESA');
          events.push({
              id: `app-${app.id || i}`,
              type: 'postulacion',
              sortKey: `2026-${i}-app`,
              title: app.carreraIngreso || app.carrera1 || 'CARRERA POSTULADA',
              subtitle: `${app.modalidad} • CONDICIÓN: ${app.condicion || 'PARTICIPANTE'}`,
              score: app.nota,
              merit: app.puesto,
              group: app.grupo,
              isAdmitted: isIng,
              data: app
          });
      });

      // 3. Renuncias
      selectedProfile.renuncias.forEach(r => {
          const [anio, sem] = (r.semester || '0000-0').split('-');
          events.push({
              id: `renuncia-${r.id}`,
              type: 'renuncia',
              sortKey: `${anio}-${sem === 'I' ? '1' : sem === 'II' ? '2' : '3'}-renuncia`,
              title: `Renuncia de Vacante: ${r.school}`,
              subtitle: `PROCESO: ${r.semester} • Res: ${r.resolution_number}`,
              date: r.resolution_date,
              data: r
          });
      });

      // 4. Reservas
      selectedProfile.reservas.forEach(res => {
          const [anio, sem] = (res.starting_semester || '0000-0').split('-');
          events.push({
              id: `reserva-${res.id}`,
              type: 'reserva',
              sortKey: `${anio}-${sem === 'I' ? '1' : sem === 'II' ? '2' : '3'}-reserva`,
              title: `Reserva de Vacante: ${res.carrera}`,
              subtitle: `Semestre Retorno: ${res.starting_semester}`,
              data: res
          });
          if (res.is_withdrawn) {
              events.push({
                  id: `reserva-ret-${res.id}`,
                  type: 'retiro_reserva',
                  sortKey: `${anio}-${sem === 'I' ? '1' : sem === 'II' ? '2' : '3'}-retiro`,
                  title: 'Retiro Definitivo (Tras Reserva)',
                  subtitle: `PROCESO: ${res.starting_semester}`,
                  data: res
              });
          }
      });

      return events;
  };

  const timelineEvents = getUnifiedTimelineEvents();

  // Photo URL
  const candidatePhotoUrl = selectedProfile?.photoDoc 
    ? getDocumentStreamUrl(selectedProfile.photoDoc.path, gatewayUrl) 
    : null;

  return (
    <div className="flex-1 w-full max-w-[1600px] mx-auto p-4 md:p-6 lg:p-8 flex flex-col gap-6 h-full overflow-hidden">
      
      {/* MODAL DE EDICIÓN DE REGISTRO OFICIAL */}
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
                              <div className="md:col-span-2 bg-amber-50 border border-amber-200 p-4 rounded-xl flex items-center gap-3">
                                  <span className="material-symbols-outlined text-amber-600">info</span>
                                  <p className="text-xs font-bold text-amber-800">Has modificado el nombre. ¿Deseas sincronizarlo en sus demás registros?</p>
                              </div>
                          )}
                          <div>
                              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Año de Proceso</label>
                              <input 
                                  value={editForm.ANIO || ''} 
                                  onChange={e => setEditForm({...editForm, ANIO: e.target.value})} 
                                  className="w-full h-12 px-4 rounded-xl border-2 border-slate-100 bg-slate-50 outline-none font-bold focus:border-primary focus:bg-white transition-all mt-1"
                              />
                          </div>
                          <div>
                              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Orden Mérito</label>
                              <input 
                                  value={editForm.OMERITO || ''} 
                                  onChange={e => setEditForm({...editForm, OMERITO: e.target.value})} 
                                  className="w-full h-12 px-4 rounded-xl border-2 border-slate-100 bg-slate-50 outline-none font-bold focus:border-primary focus:bg-white transition-all mt-1"
                              />
                          </div>
                          <div>
                              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Fecha de Ingreso</label>
                              <input 
                                  value={editForm.FECHAINGRESO || ''} 
                                  onChange={e => setEditForm({...editForm, FECHAINGRESO: e.target.value})} 
                                  className="w-full h-12 px-4 rounded-xl border-2 border-slate-100 bg-slate-50 outline-none font-bold focus:border-primary focus:bg-white transition-all mt-1"
                                  placeholder="DD/MM/AAAA"
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
                       <button 
                        onClick={() => handleUpdateRecord(showSyncNameOption)} 
                        disabled={loading}
                        className="px-10 py-3 bg-primary text-white rounded-xl font-black text-xs uppercase tracking-widest active:scale-95 transition-all shadow-lg shadow-primary/20 disabled:opacity-50"
                       >
                           {loading ? 'Guardando...' : 'Guardar Cambios'}
                       </button>
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
                              <h3 className="text-xl font-black text-slate-900 uppercase">Agregar Nuevo Ingresante</h3>
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
                              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Año de Proceso</label>
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

      {/* Top Header Bar */}
      <div className="flex flex-wrap justify-between items-end gap-4 shrink-0">
        <div className="flex flex-col gap-1">
            <h1 className="text-slate-900 text-3xl font-black leading-tight">Consulta Integral de Postulantes e Ingresantes</h1>
            <p className="text-slate-500 text-sm font-medium">Búsqueda universal en bases de datos históricas, procesos recientes y servidor local de expedientes.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 shrink-0">
            {/* File Gateway Server Status Button */}
            <button
                type="button"
                onClick={() => setIsGatewayModalOpen(true)}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition-all border shadow-sm active:scale-95 ${
                    gatewayStatus.connected
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100'
                        : gatewayStatus.checking
                            ? 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
                            : 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100'
                }`}
                title={`Servidor de Archivos: ${gatewayStatus.url} (${gatewayStatus.connected ? 'Conectado' : 'Sin conexión'}). Clic para configurar.`}
            >
                <span className={`size-2.5 rounded-full shrink-0 ${
                    gatewayStatus.connected 
                        ? 'bg-emerald-500 animate-pulse' 
                        : gatewayStatus.checking 
                            ? 'bg-slate-400 animate-spin' 
                            : 'bg-amber-500'
                }`} />
                <span className="material-symbols-outlined text-[16px]">dns</span>
                <span className="hidden sm:inline">
                    {gatewayStatus.connected
                        ? `File Gateway Conectado${gatewayStatus.latency !== undefined ? ` (${gatewayStatus.latency}ms)` : ''}`
                        : gatewayStatus.checking
                            ? 'Verificando Servidor...'
                            : 'Servidor File Gateway Offline'}
                </span>
                <span className="material-symbols-outlined text-[14px] text-slate-400">tune</span>
            </button>

            <div className="flex bg-slate-200 p-1 rounded-xl shadow-inner shrink-0">
                {[
                    {id: 'individual', label: 'Búsqueda Individual', icon: 'person_search'},
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
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-hidden">
        {activeMode === 'individual' ? (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start h-full overflow-y-auto pr-1">
                
                {/* Left Search & Profile Overview */}
                <aside className="lg:col-span-4 flex flex-col gap-6 w-full">
                    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-base font-black flex items-center gap-2 text-slate-900 uppercase tracking-tight">
                                <span className="material-symbols-outlined text-primary">search</span>
                                Búsqueda Universal
                            </h3>
                            <button onClick={() => setIsAddingNew(true)} className="flex items-center gap-1 text-xs font-bold text-primary hover:text-merlot transition-colors bg-primary/10 hover:bg-primary/20 px-3 py-1.5 rounded-lg">
                                <span className="material-symbols-outlined text-[16px]">person_add</span>
                                Nuevo
                            </button>
                        </div>
                        <div className="flex flex-col gap-3">
                            <div className="relative">
                                <span className="material-symbols-outlined absolute left-3 top-3 text-slate-400">badge</span>
                                <input
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                                    className="w-full rounded-xl border border-slate-300 bg-slate-50 text-slate-900 h-11 pl-10 pr-14 focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all placeholder:text-slate-400 uppercase font-medium text-sm"
                                    placeholder="DNI O APELLIDOS Y NOMBRES..."
                                />
                                <button onClick={handleSearch} disabled={loading} className="absolute right-1 top-1 h-9 w-9 bg-primary hover:bg-merlot text-white rounded-lg flex items-center justify-center transition-colors shadow-sm">
                                    {loading ? <span className="material-symbols-outlined text-[18px] animate-spin">progress_activity</span> : <span className="material-symbols-outlined text-[18px]">search</span>}
                                </button>
                            </div>
                            <p className="text-[10px] text-slate-400 font-medium">
                                Busca automáticamente en la tabla oficial de ingresantes (<code className="font-mono">participantes</code>) y en expedientes de postulantes (<code className="font-mono">pre_revision_archivos</code>).
                            </p>
                        </div>
                    </div>

                    {/* Candidate Results List (if multiple results found) */}
                    {candidatesList.length > 0 && !selectedProfile && (
                        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden animate-in fade-in slide-in-from-bottom-2">
                            <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                                <h4 className="font-black text-slate-700 text-xs uppercase tracking-wider">
                                    Postulantes Encontrados ({candidatesList.length})
                                </h4>
                            </div>
                            <div className="max-h-[450px] overflow-y-auto divide-y divide-slate-100">
                                {candidatesList.map((c, i) => (
                                    <button 
                                        key={i} 
                                        onClick={() => handleSelectCandidate(c)} 
                                        className="w-full text-left p-4 hover:bg-slate-50 transition-colors flex items-center gap-3 group"
                                    >
                                        <div className={`size-11 rounded-xl flex items-center justify-center shrink-0 ${
                                            c.isIngresanteOficial ? 'bg-emerald-100 text-emerald-700 font-bold' : 'bg-slate-100 text-slate-500'
                                        }`}>
                                            <span className="material-symbols-outlined text-xl">
                                                {c.isIngresanteOficial ? 'verified' : 'school'}
                                            </span>
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-1.5 flex-wrap">
                                                <span className={`text-[8px] font-black uppercase px-1.5 py-0.2 rounded ${
                                                    c.isIngresanteOficial ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-100 text-blue-800'
                                                }`}>
                                                    {c.isIngresanteOficial ? 'INGRESANTE' : 'SOLO POSTULANTE'}
                                                </span>
                                            </div>
                                            <p className="font-black text-slate-900 text-sm truncate uppercase group-hover:text-primary transition-colors mt-0.5">
                                                {c.fullName}
                                            </p>
                                            <p className="text-[10px] text-slate-500 font-mono truncate">
                                                DNI: {c.dni} {c.applications[0]?.modalidad ? `• ${c.applications[0].modalidad}` : ''}
                                            </p>
                                        </div>
                                        <span className="material-symbols-outlined text-slate-300 group-hover:text-primary group-hover:translate-x-1 transition-all">chevron_right</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Selected Student / Applicant Profile Card */}
                    {selectedProfile && (
                        <div className="bg-white rounded-3xl shadow-xl border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-300 flex flex-col">
                            
                            {/* Card Top Banner */}
                            <div className="h-24 bg-gradient-to-r from-slate-900 to-indigo-950 relative p-4 flex justify-between items-start">
                                <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border shadow-sm ${
                                    selectedProfile.isIngresanteOficial 
                                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400/30' 
                                        : 'bg-blue-500/20 text-blue-300 border-blue-400/30'
                                }`}>
                                    {selectedProfile.isIngresanteOficial ? '🟢 INGRESANTE OFICIAL' : '⚪ SOLO POSTULANTE'}
                                </span>
                                
                                <button 
                                    onClick={() => { setSelectedProfile(null); setCandidatesList([]); setSearchQuery(''); }} 
                                    className="size-8 bg-white/20 text-white rounded-lg flex items-center justify-center hover:bg-white/40 transition-colors"
                                >
                                    <span className="material-symbols-outlined text-[18px]">close</span>
                                </button>
                            </div>

                            <div className="px-6 pb-6 relative">
                                
                                {/* Photo / Avatar */}
                                <div className="flex items-end justify-between -mt-10 mb-4">
                                    {candidatePhotoUrl ? (
                                        <div className="size-20 rounded-2xl border-4 border-white bg-slate-800 overflow-hidden shadow-md shrink-0">
                                            <img 
                                                src={candidatePhotoUrl} 
                                                alt={selectedProfile.fullName}
                                                className="w-full h-full object-cover"
                                                onError={(e) => {
                                                    (e.target as HTMLElement).style.display = 'none';
                                                }}
                                            />
                                        </div>
                                    ) : (
                                        <div className="size-20 rounded-2xl border-4 border-white bg-slate-100 text-slate-400 flex items-center justify-center shadow-md shrink-0">
                                            <span className="material-symbols-outlined text-4xl">person</span>
                                        </div>
                                    )}

                                    {/* Open Full Ficha Integral Button */}
                                    <button
                                        type="button"
                                        onClick={() => setIsFichaModalOpen(true)}
                                        className="px-3.5 py-2 bg-primary hover:bg-merlot text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1.5 shadow-md shadow-primary/20 transition-all active:scale-95"
                                    >
                                        <span className="material-symbols-outlined text-[16px]">account_box</span>
                                        Ficha Integral
                                    </button>
                                </div>

                                <h3 className="text-xl font-black text-slate-900 uppercase leading-tight truncate">
                                    {selectedProfile.fullName}
                                </h3>
                                
                                <div className="flex items-center gap-2 mt-1">
                                    <span className="text-primary font-mono font-bold text-xs">
                                        DNI: {selectedProfile.dni}
                                    </span>
                                    <button 
                                        onClick={() => {
                                            navigator.clipboard.writeText(selectedProfile.dni);
                                            alert(`DNI ${selectedProfile.dni} copiado al portapapeles`);
                                        }}
                                        className="text-slate-400 hover:text-slate-600 p-0.5"
                                        title="Copiar DNI"
                                    >
                                        <span className="material-symbols-outlined text-[14px]">content_copy</span>
                                    </button>
                                </div>

                                {/* Status Badges */}
                                <div className="flex flex-wrap gap-1.5 mt-3">
                                    {selectedProfile.isIngresanteOficial && (
                                        <span className="bg-emerald-50 text-emerald-800 border border-emerald-200 px-2 py-0.5 rounded text-[9px] font-black uppercase">
                                            INGRESANTE OFICIAL
                                        </span>
                                    )}
                                    {selectedProfile.isSoloPostulante && (
                                        <span className="bg-slate-100 text-slate-700 border border-slate-200 px-2 py-0.5 rounded text-[9px] font-black uppercase">
                                            SOLO POSTULANTE
                                        </span>
                                    )}
                                    {selectedProfile.hasRenuncia && (
                                        <span className="bg-red-50 text-red-800 border border-red-200 px-2 py-0.5 rounded text-[9px] font-black uppercase">
                                            RENUNCIA REGISTRADA
                                        </span>
                                    )}
                                    {selectedProfile.hasReserva && (
                                        <span className="bg-amber-50 text-amber-800 border border-amber-200 px-2 py-0.5 rounded text-[9px] font-black uppercase">
                                            RESERVA DE VACANTE
                                        </span>
                                    )}
                                </div>

                                {/* Contact and School Preview */}
                                <div className="mt-5 pt-5 border-t border-slate-100 flex flex-col gap-4">
                                    
                                    {/* Contact Section */}
                                    <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Canales de Contacto</p>
                                        <div className="flex flex-col gap-2">
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-2 text-xs">
                                                    <span className="material-symbols-outlined text-[16px] text-slate-500">call</span>
                                                    <span className="font-bold text-slate-700 font-mono">
                                                        {selectedProfile.phone || 'No registrado'}
                                                    </span>
                                                </div>
                                                {selectedProfile.phone && (
                                                    <a 
                                                        href={`https://wa.me/51${selectedProfile.phone.replace(/\D/g, '').slice(-9)}`}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        className="px-2 py-0.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-[10px] font-black uppercase flex items-center gap-1 transition-all"
                                                    >
                                                        <span className="material-symbols-outlined text-[12px]">chat</span>
                                                        WhatsApp
                                                    </a>
                                                )}
                                            </div>

                                            {selectedProfile.email && (
                                                <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-200/60">
                                                    <div className="flex items-center gap-2 truncate">
                                                        <span className="material-symbols-outlined text-[16px] text-slate-500">mail</span>
                                                        <span className="text-slate-700 truncate font-medium">{selectedProfile.email}</span>
                                                    </div>
                                                    <a 
                                                        href={`mailto:${selectedProfile.email}`}
                                                        className="text-primary hover:underline font-bold text-[10px] uppercase shrink-0"
                                                    >
                                                        Enviar
                                                    </a>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* School Section */}
                                    <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Procedencia Escolar (Colegio)</p>
                                        <div className="text-xs">
                                            <p className="font-bold text-slate-800 uppercase">
                                                {selectedProfile.schoolInfo?.nombre_ie || selectedProfile.schoolName || 'Colegio no especificado'}
                                            </p>
                                            {selectedProfile.schoolInfo?.tipo_gestion && (
                                                <span className="inline-block mt-1 bg-slate-200 text-slate-700 px-2 py-0.5 rounded text-[9px] font-black uppercase">
                                                    {selectedProfile.schoolInfo.tipo_gestion}
                                                </span>
                                            )}
                                            {selectedProfile.schoolInfo?.distrito && (
                                                <p className="text-[10px] text-slate-500 mt-1">
                                                    {selectedProfile.schoolInfo.departamento} / {selectedProfile.schoolInfo.provincia} / {selectedProfile.schoolInfo.distrito}
                                                </p>
                                            )}
                                        </div>
                                    </div>

                                    {/* Digital Documents & Photos from File Gateway */}
                                    <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                                        <div className="flex justify-between items-center mb-2.5">
                                            <div className="flex items-center gap-1.5">
                                                <span className="material-symbols-outlined text-primary text-[18px]">folder_special</span>
                                                <p className="text-[10px] font-black text-slate-700 uppercase tracking-widest">
                                                    Expedientes Gateway (Puerto 5000)
                                                </p>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => fetchProfileExtraInfo(selectedProfile)}
                                                disabled={loadingDocs}
                                                className="p-1 rounded-lg hover:bg-slate-200 text-slate-500 hover:text-slate-800 transition-colors"
                                                title="Recargar archivos"
                                            >
                                                <span className={`material-symbols-outlined text-[15px] ${loadingDocs ? 'animate-spin' : ''}`}>sync</span>
                                            </button>
                                        </div>

                                        {loadingDocs ? (
                                            <div className="flex items-center justify-center py-4 gap-2 text-slate-500 text-xs font-bold bg-white rounded-lg border border-slate-200">
                                                <span className="material-symbols-outlined text-[16px] text-primary animate-spin">sync</span>
                                                Consultando disco local...
                                            </div>
                                        ) : docsError ? (
                                            <div className="p-2.5 bg-amber-50 text-amber-900 rounded-lg border border-amber-200 text-[10px]">
                                                <p className="font-bold">File Gateway no accesible:</p>
                                                <p className="text-amber-800 mt-0.5">{docsError}</p>
                                            </div>
                                        ) : selectedProfile.documents.length > 0 ? (
                                            <div className="flex flex-col gap-2">
                                                {Object.entries(getGroupedDocuments(selectedProfile.documents)).map(([folderLabel, docsInFolder], gIdx) => {
                                                    const isExpanded = expandedFolders[folderLabel] !== false;
                                                    return (
                                                        <div key={gIdx} className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm">
                                                            <button
                                                                onClick={() => setExpandedFolders(prev => ({ ...prev, [folderLabel]: !isExpanded }))}
                                                                type="button"
                                                                className="w-full flex items-center justify-between p-2 bg-slate-100 hover:bg-slate-200 transition-colors"
                                                            >
                                                                <div className="flex items-center gap-1.5 text-left min-w-0">
                                                                    <span className="material-symbols-outlined text-amber-500 text-[16px] shrink-0">folder</span>
                                                                    <span className="text-[10px] font-black text-slate-800 uppercase truncate">
                                                                        {folderLabel}
                                                                    </span>
                                                                    <span className="bg-slate-200 text-slate-700 text-[8px] font-black px-1 rounded-full">
                                                                        {docsInFolder.length}
                                                                    </span>
                                                                </div>
                                                                <span className="material-symbols-outlined text-slate-500 text-[14px]">
                                                                    {isExpanded ? 'expand_less' : 'expand_more'}
                                                                </span>
                                                            </button>

                                                            {isExpanded && (
                                                                <div className="p-1.5 flex flex-col gap-1.5 bg-slate-50/50">
                                                                    {docsInFolder.map((doc, docIdx) => (
                                                                        <div key={docIdx} className="p-1.5 bg-white rounded border border-slate-200 flex items-center justify-between gap-2 text-xs">
                                                                            <div className="flex items-center gap-1.5 min-w-0">
                                                                                <span className="material-symbols-outlined text-[16px] text-slate-400 shrink-0">
                                                                                    {doc.icon || (doc.isPdf ? 'picture_as_pdf' : doc.isImage ? 'image' : 'description')}
                                                                                </span>
                                                                                <span className="text-[10px] font-bold text-slate-800 truncate">
                                                                                    {doc.friendlyName}
                                                                                </span>
                                                                            </div>
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => setSelectedDocForViewer(doc)}
                                                                                className="px-2 py-0.5 bg-primary/10 hover:bg-primary text-primary hover:text-white rounded text-[9px] font-black uppercase transition-all shrink-0"
                                                                            >
                                                                                Ver
                                                                            </button>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        ) : (
                                            <div className="p-3 text-center bg-white rounded-lg border border-slate-200">
                                                <p className="text-[10px] font-bold text-slate-400">Sin archivos digitales en el disco local.</p>
                                            </div>
                                        )}
                                    </div>

                                </div>
                            </div>
                        </div>
                    )}
                </aside>

                {/* Right Academic Trajectory & History */}
                <section className={`lg:col-span-8 h-full transition-all duration-500 ${!selectedProfile ? 'opacity-30 grayscale' : 'opacity-100'}`}>
                    <div className="bg-white rounded-3xl border border-slate-200 shadow-sm h-full p-6 md:p-8 flex flex-col overflow-hidden">
                        {!selectedProfile ? (
                            <div className="flex-1 flex flex-col items-center justify-center text-center py-20">
                                <span className="material-symbols-outlined text-6xl text-slate-200 mb-4">history_edu</span>
                                <h3 className="text-slate-400 font-black uppercase tracking-widest text-sm">Historial Académico y Procesos de Admisión</h3>
                                <p className="text-slate-400 text-xs mt-1 max-w-sm">Ingrese un DNI o nombres para consultar la trayectoria completa del postulante o ingresante.</p>
                            </div>
                        ) : (
                            <div className="w-full text-left flex flex-col h-full">
                                <div className="flex items-center justify-between mb-6 pb-3 border-b border-slate-100 shrink-0">
                                    <div>
                                        <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest">
                                            Trayectoria de Admisiones y Postulaciones UNSAAC
                                        </h4>
                                        <p className="text-xs font-bold text-slate-700 mt-0.5">
                                            {selectedProfile.admissions.length} Ingresos Oficiales • {selectedProfile.applications.length} Postulaciones Registradas
                                        </p>
                                    </div>

                                    <button
                                        onClick={() => setIsFichaModalOpen(true)}
                                        className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1.5 shadow-sm transition-all"
                                    >
                                        <span className="material-symbols-outlined text-[16px]">visibility</span>
                                        Ver Ficha Completa
                                    </button>
                                </div>

                                <div className="flex-1 overflow-y-auto pr-3 space-y-6 relative">
                                    <div className="absolute left-5 top-0 bottom-0 w-0.5 bg-slate-100"></div>
                                    
                                    {timelineEvents.map((evt, idx) => {
                                        if (evt.type === 'ingreso') {
                                            const item = evt.data;
                                            return (
                                                <div key={evt.id} className="flex gap-6 relative group">
                                                    <div className={`size-10 rounded-full flex items-center justify-center shrink-0 z-10 transition-all ${
                                                        idx === 0 ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-200 scale-105' : 'bg-slate-100 text-slate-400 group-hover:bg-primary/10 group-hover:text-primary'
                                                    }`}>
                                                        <span className="material-symbols-outlined text-xl">verified</span>
                                                    </div>
                                                    <div className="flex-1 bg-slate-50/80 rounded-2xl p-5 border border-slate-100 hover:border-emerald-200 transition-all">
                                                        <div className="flex justify-between items-start">
                                                            <div>
                                                                <span className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">
                                                                    INGRESO OFICIAL
                                                                </span>
                                                                <p className="font-black text-base uppercase text-slate-900 mt-1">
                                                                    {fixEncoding(item.CARRERA)}
                                                                </p>
                                                                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-0.5">
                                                                    Admisión: {item.SEMESTRE}-{item.ANIO} • {item.MODALIDAD}
                                                                </p>
                                                            </div>
                                                            <button 
                                                                onClick={() => { setEditingRecord(item); setEditForm(item); setIsEditing(true); }}
                                                                className="p-2 text-slate-400 hover:text-primary transition-colors rounded-lg hover:bg-slate-200/60"
                                                                title="Editar registro"
                                                            >
                                                                <span className="material-symbols-outlined text-[18px]">edit</span>
                                                            </button>
                                                        </div>

                                                        <div className="mt-3 flex flex-wrap gap-2 text-xs">
                                                            {item.NOTA && <span className="bg-white text-emerald-800 border border-emerald-100 px-2.5 py-1 rounded-lg text-[10px] font-bold">Puntaje: {item.NOTA}</span>}
                                                            {item.OMERITO && <span className="bg-white text-slate-700 border border-slate-200 px-2.5 py-1 rounded-lg text-[10px] font-bold">Puesto: {item.OMERITO}</span>}
                                                            {item.FILIAL && <span className="bg-white text-slate-700 border border-slate-200 px-2.5 py-1 rounded-lg text-[10px] font-bold">Sede: {item.FILIAL}</span>}
                                                            {item.FECHAINGRESO && <span className="bg-white text-slate-700 border border-slate-200 px-2.5 py-1 rounded-lg text-[10px] font-bold">Fecha: {item.FECHAINGRESO}</span>}
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        }

                                        if (evt.type === 'postulacion') {
                                            const app = evt.data;
                                            return (
                                                <div key={evt.id} className="flex gap-6 relative group">
                                                    <div className={`size-10 rounded-full flex items-center justify-center shrink-0 z-10 transition-all ${
                                                        evt.isAdmitted ? 'bg-emerald-500 text-white shadow-md' : 'bg-slate-200 text-slate-600'
                                                    }`}>
                                                        <span className="material-symbols-outlined text-xl">school</span>
                                                    </div>
                                                    <div className="flex-1 bg-white rounded-2xl p-5 border border-slate-200 hover:border-primary/40 transition-all">
                                                        <div className="flex justify-between items-start">
                                                            <div>
                                                                <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded ${
                                                                    evt.isAdmitted ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-100 text-blue-800'
                                                                }`}>
                                                                    {evt.isAdmitted ? 'INGRESANTE (PROCESO)' : 'POSTULANTE'}
                                                                </span>
                                                                <p className="font-black text-base uppercase text-slate-900 mt-1">
                                                                    {evt.title}
                                                                </p>
                                                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
                                                                    {evt.subtitle}
                                                                </p>
                                                            </div>
                                                        </div>

                                                        <div className="mt-3 flex flex-wrap gap-2 text-xs">
                                                            {evt.score && <span className="bg-slate-50 text-slate-800 border border-slate-200 px-2.5 py-1 rounded-lg text-[10px] font-bold">Puntaje: {evt.score}</span>}
                                                            {evt.merit && <span className="bg-slate-50 text-slate-800 border border-slate-200 px-2.5 py-1 rounded-lg text-[10px] font-bold">Puesto: {evt.merit}</span>}
                                                            {evt.group && <span className="bg-slate-50 text-slate-800 border border-slate-200 px-2.5 py-1 rounded-lg text-[10px] font-bold">Grupo: {evt.group}</span>}
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        }

                                        if (evt.type === 'renuncia') {
                                            const r = evt.data;
                                            return (
                                                <div key={evt.id} className="flex gap-6 relative group">
                                                    <div className="size-10 rounded-full flex items-center justify-center shrink-0 z-10 bg-red-100 text-red-500">
                                                        <span className="material-symbols-outlined text-xl">cancel</span>
                                                    </div>
                                                    <div className="flex-1 bg-red-50/50 rounded-2xl p-5 border border-red-200">
                                                        <p className="font-black text-base uppercase text-red-950">{evt.title}</p>
                                                        <p className="text-[10px] font-bold text-red-700 uppercase tracking-widest mt-0.5">{evt.subtitle}</p>
                                                    </div>
                                                </div>
                                            );
                                        }

                                        if (evt.type === 'reserva') {
                                            const res = evt.data;
                                            return (
                                                <div key={evt.id} className="flex gap-6 relative group">
                                                    <div className="size-10 rounded-full flex items-center justify-center shrink-0 z-10 bg-amber-100 text-amber-600">
                                                        <span className="material-symbols-outlined text-xl">bookmark</span>
                                                    </div>
                                                    <div className="flex-1 bg-amber-50/50 rounded-2xl p-5 border border-amber-200">
                                                        <p className="font-black text-base uppercase text-amber-950">{evt.title}</p>
                                                        <p className="text-[10px] font-bold text-amber-700 uppercase tracking-widest mt-0.5">{evt.subtitle}</p>
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
            /* Batch Search Mode */
            <div className="h-full flex flex-col gap-4 animate-in fade-in slide-in-from-right-4 overflow-hidden">
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm shrink-0">
                    <div className="flex flex-col md:flex-row justify-between items-center gap-6">
                        <div className="flex items-center gap-4">
                            <div className="size-14 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center shrink-0 border border-amber-100 shadow-sm">
                                <span className="material-symbols-outlined text-3xl">view_timeline</span>
                            </div>
                            <div>
                                <h3 className="font-black text-slate-800 uppercase text-sm tracking-tight">Verificación Multi-Ingreso (Cruce Masivo)</h3>
                                <p className="text-xs text-slate-500 font-medium">Contraste listas con la base de datos oficial. Formato CSV o Excel (.xlsx, .csv): Columna 1 = DNI/Código, Columna 2 = Nombres.</p>
                            </div>
                        </div>
                        <input type="file" accept=".csv,.xlsx,.xls" ref={fileInputRef} className="hidden" onChange={handleFileUpload}/>
                        <div className="flex flex-wrap gap-2 justify-end">
                             {batchResults.length > 0 && (
                                 <>
                                     <button onClick={handleExportCruceExcel} className="px-5 h-12 bg-emerald-50 text-emerald-700 rounded-xl text-xs font-black uppercase hover:bg-emerald-100 transition-colors flex items-center gap-2 shadow-sm">
                                         <span className="material-symbols-outlined text-sm">table_view</span> Excel
                                     </button>
                                     <button onClick={handleExportCrucePdf} className="px-5 h-12 bg-red-50 text-red-700 rounded-xl text-xs font-black uppercase hover:bg-red-100 transition-colors flex items-center gap-2 shadow-sm">
                                         <span className="material-symbols-outlined text-sm">picture_as_pdf</span> PDF
                                     </button>
                                     <button onClick={() => setBatchResults([])} className="px-5 h-12 rounded-xl text-xs font-black uppercase text-slate-400 hover:bg-slate-100 transition-colors">Limpiar</button>
                                 </>
                             )}
                             <button onClick={() => fileInputRef.current?.click()} disabled={isProcessingBatch} className="px-8 h-12 bg-slate-900 text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-xl shadow-slate-900/20 active:scale-95 transition-all flex items-center gap-2">
                                 {isProcessingBatch ? <span className="material-symbols-outlined animate-spin">progress_activity</span> : <span className="material-symbols-outlined">upload_file</span>}
                                 {isProcessingBatch ? 'BUSCANDO...' : 'PROCESAR ARCHIVO'}
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
                                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest w-36">Código / DNI</th>
                                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Nombre Buscado</th>
                                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest w-32 text-center">Estatus</th>
                                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Carrera / Semestre</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {batchResults.length === 0 ? (
                                    <tr><td colSpan={4} className="py-20 text-center text-slate-400 italic font-bold">Sin datos procesados. Cargue un archivo CSV o Excel.</td></tr>
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
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        ) : (
            /* Data Import Mode */
            <div className="h-full flex flex-col gap-6 animate-in fade-in slide-in-from-right-4 overflow-hidden">
                <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm shrink-0 flex flex-col items-center text-center gap-6">
                    <div className="size-20 bg-primary/10 text-primary rounded-full flex items-center justify-center border border-primary/20">
                        <span className="material-symbols-outlined text-4xl">upload_file</span>
                    </div>
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
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        )}
      </div>

      {/* Comprehensive Ficha Integral Modal */}
      {isFichaModalOpen && selectedProfile && (
        <IntegratedStudentModal
          data={selectedProfile}
          gatewayUrl={gatewayUrl}
          onClose={() => setIsFichaModalOpen(false)}
        />
      )}

      {/* File Gateway Settings Modal */}
      <FileGatewayModal
        isOpen={isGatewayModalOpen}
        onClose={() => setIsGatewayModalOpen(false)}
        onGatewayUpdated={(newUrl) => {
          setGatewayUrl(newUrl);
          checkGateway(newUrl);
          if (selectedProfile) {
            fetchProfileExtraInfo(selectedProfile);
          }
        }}
      />

      {/* Document In-App Viewer Modal */}
      {selectedDocForViewer && (
        <DocumentViewerModal
          document={selectedDocForViewer}
          streamUrl={getDocumentStreamUrl(selectedDocForViewer.path, gatewayUrl)}
          onClose={() => setSelectedDocForViewer(null)}
        />
      )}
    </div>
  );
};
