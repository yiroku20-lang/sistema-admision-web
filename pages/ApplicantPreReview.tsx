import React, { useState, useEffect, useRef, useMemo } from 'react';
import { supabase, supabaseAdmin } from '../lib/supabaseClient';
import { safeStorage } from '../lib/safeStorage';
import { User, CVCuadroAnual, CVModalidad, CVEscuela, CVVacante } from '../types';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell
} from 'recharts';

// Flexible value getter supporting common casing, spaces, underscores, and synonyms
const getRowValue = (row: any, fieldKeys: string[]): string => {
  if (!row) return '';
  for (const k of fieldKeys) {
    if (row[k] !== undefined && row[k] !== null) {
      return String(row[k]).trim();
    }
  }
  const rowKeys = Object.keys(row);
  const normalizedKeys = fieldKeys.map(k => k.toLowerCase().replace(/[\s_-]/g, ''));
  for (const rk of rowKeys) {
    const rkNorm = rk.toLowerCase().replace(/[\s_-]/g, '');
    if (normalizedKeys.includes(rkNorm)) {
      return String(row[rk]).trim();
    }
  }
  return '';
};

const cleanUbigeoCode = (val: any): string => {
  if (val === undefined || val === null || val === '') return '';
  let str = String(val).trim();
  
  if (str.includes('.')) {
    str = str.split('.')[0].trim();
  }
  
  if (/^\d+$/.test(str)) {
    return str.padStart(6, '0');
  }
  return str;
};

const convertIneiToReniec = (ineiCode: string): string => {
  if (!ineiCode) return '';
  // Ensure we have a clean 6-digit code padded with leading zeroes
  const cleanCode = cleanUbigeoCode(ineiCode);
  if (cleanCode.length !== 6 || !/^\d+$/.test(cleanCode)) {
    return cleanCode;
  }

  // Translate first two digits (INEI -> RENIEC department mapping)
  const deptInei = cleanCode.slice(0, 2);
  const rest = cleanCode.slice(2);
  let deptReniec = deptInei;
  
  const deptNum = parseInt(deptInei, 10);
  if (!isNaN(deptNum)) {
    if (deptNum === 7) {
      deptReniec = '24'; // Callao
    } else if (deptNum >= 8 && deptNum <= 24) {
      deptReniec = String(deptNum - 1).padStart(2, '0');
    } else if (deptNum === 25) {
      deptReniec = '25'; // Ucayali
    }
  }
  
  return deptReniec + rest;
};

const isAdmittedRow = (row: any): boolean => {
  const val = getRowValue(row, [
    'OBSERVACION', 'Observacion', 'observacion', 
    'OBSERVACIONES', 'observaciones', 
    'ESTADO', 'estado', 'resultado', 'RESULTADO',
    'CONDICION', 'condicion', 'CONDICIÓN', 'condición'
  ]).toUpperCase();
  
  // Regla de descarte para evitar falsos positivos con "NO INGRESA", "NO INGRESANTE", "NO INGRESO", "NO ADMITIDO", "NO_INGRESA" o "NSP"
  if (
    val.includes('NO INGRESA') || 
    val.includes('NO INGRESANTE') || 
    val.includes('NO INGRESO') || 
    val.includes('NO ADMITIDO') || 
    val.includes('NO_INGRESA') ||
    val.includes('NSP') ||
    val.includes('NO SE PRESENTO') ||
    val.includes('NO SE PRESENTÓ')
  ) {
    return false;
  }
  if (val.includes('INGRESA') || val.includes('INGRESO') || val.includes('ADMITIDO') || val === 'SI' || val.includes('INGRESANTE')) {
    return true;
  }
  
  // Fallback: Check if we have a non-empty CarreraIngreso and NO observation column at all
  const carreraIng = getRowValue(row, [
    'CarreraIngreso', 'carreraIngreso', 'CARRERA_INGRESO', 
    'carrera_ingreso', 'Carrera', 'carrera', 'CARRERA', 
    'escuela', 'Escuela', 'ESCUELA', 'codigo_carrera', 'COD_CARRERA'
  ]);
  if (!val && carreraIng) {
    const rowKeysLower = Object.keys(row).map(k => k.toLowerCase().replace(/[\s_-]/g, ''));
    const hasObsColumn = rowKeysLower.some(k => k.includes('observa') || k.includes('estado') || k.includes('result') || k.includes('condic'));
    if (!hasObsColumn) {
      return true; 
    }
  }
  return false;
};

const normalizeText = (str: string) => {
  if (!str) return '';
  return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
};

const schoolCache = new Map<string, any>();
const findSchool = (val: string, escuelas: any[]) => {
  if (!val) return null;
  const cacheKey = `${val}_${escuelas.length}`;
  if (schoolCache.has(cacheKey)) {
    return schoolCache.get(cacheKey);
  }
  const cleanVal = normalizeText(val);
  let school = escuelas.find(e => e.codigo_carrera === val || normalizeText(e.codigo_carrera) === cleanVal);
  if (school) {
    schoolCache.set(cacheKey, school);
    return school;
  }
  school = escuelas.find(e => normalizeText(e.nombre) === cleanVal);
  if (school) {
    schoolCache.set(cacheKey, school);
    return school;
  }
  school = escuelas.find(e => {
    const eName = normalizeText(e.nombre);
    return eName.includes(cleanVal) || cleanVal.includes(eName);
  });
  if (school) {
    schoolCache.set(cacheKey, school);
    return school;
  }
  
  const words = cleanVal.split(/\s+/).filter(w => w.length > 3 && w !== 'ingenieria' && w !== 'educacion' && w !== 'ciencias');
  if (words.length > 0) {
    school = escuelas.find(e => {
      const eName = normalizeText(e.nombre);
      return words.every(w => eName.includes(w));
    });
    if (school) {
      schoolCache.set(cacheKey, school);
      return school;
    }
  }
  schoolCache.set(cacheKey, null);
  return null;
};

const normalizeRow = (row: any, escuelas: any[]) => {
  if (!row) return row;
  const dni = getRowValue(row, ['NroDocumento', 'nroDocumento', 'NRODOCUMENTO', 'DNI', 'dni', 'Documento', 'documento', 'alumno', 'ALUMNO', 'CODPOSTULANTE', 'codpostulante']);
  const nombre = getRowValue(row, ['nombre', 'Nombre', 'NOMBRE', 'postulante', 'POSTULANTE', 'nombres', 'Nombres', 'NOMBRES', 'ApeNom', 'apenom']);
  const nota = getRowValue(row, ['Nota', 'nota', 'NOTA', 'Puntaje', 'puntaje', 'PUNTAJE', 'notavigesimal', 'notavigesimal', 'NOTA_VIGESIMAL', 'nota_vigesimal']);
  const pos = getRowValue(row, ['POS', 'Pos', 'pos', 'posicion', 'Posicion', 'puesto', 'Puesto', 'OMERITO', 'omerito', 'orden_merito']);
  
  // --- 1. Detección de las carreras de elección ---
  // Carrera 1 (Opción 1)
  const rawCarrera1 = getRowValue(row, [
    'Carrera 1', 'carrera 1', 'CARRERA 1', 
    'Carrera1', 'carrera1', 'CARRERA1',
    'Escuela1', 'escuela1', 'ESCUELA1', 
    'carrera_postula', 'CARRERA_POSTULA', 
    'carrera_opcion', 'CARRERA_OPCION', 
    'opcion', 'OPCION', 'Opcion 1', 'opcion 1', 'OPCION 1'
  ]);
  
  // Carrera 2 (Opción 2)
  const rawCarrera2 = getRowValue(row, [
    'Carrera 2', 'carrera 2', 'CARRERA 2', 
    'Carrera2', 'carrera2', 'CARRERA2',
    'Escuela2', 'escuela2', 'ESCUELA2', 
    'Opcion 2', 'opcion 2', 'OPCION 2',
    'carrera_opcion2', 'CARRERA_OPCION2', 'opcion2', 'OPCION2'
  ]);
  
  let school1 = rawCarrera1 ? findSchool(rawCarrera1, escuelas) : null;
  let school2 = rawCarrera2 ? findSchool(rawCarrera2, escuelas) : null;
  
  if (!school1) {
    const rawCarrera = getRowValue(row, ['Carrera', 'carrera', 'CARRERA', 'escuela', 'Escuela', 'ESCUELA', 'Programa', 'programa', 'PROGRAMA', 'Programa_Estudios', 'programa_estudio', 'PROGRAMA_ESTUDIO', 'E.P.', 'EP', 'Escuela_Profesional', 'Especialidad', 'especialidad']);
    school1 = findSchool(rawCarrera, escuelas);
  }
  
  const codigoCarrera1 = school1 ? school1.codigo_carrera : (rawCarrera1 || '');
  const codigoCarrera2 = school2 ? school2.codigo_carrera : (rawCarrera2 || '');
  
  // --- 2. Detección del Ingreso y Condición ---
  const isIngresante = isAdmittedRow(row);
  
  // Estandarizar la condición original
  const originalCondicion = getRowValue(row, [
    'CONDICION', 'condicion', 'CONDICIÓN', 'condición',
    'OBSERVACION', 'Observacion', 'observacion', 
    'OBSERVACIONES', 'observaciones', 
    'ESTADO', 'estado', 'resultado', 'RESULTADO'
  ]).trim().toUpperCase();
  
  let condicionFinal = '';
  if (originalCondicion.includes('NSP') || originalCondicion.includes('NO SE PRESENTO') || originalCondicion.includes('NO SE PRESENTÓ')) {
    condicionFinal = 'NSP';
  } else if (originalCondicion.includes('INGRESANTE S.O.') || originalCondicion.includes('INGRESANTE SO') || originalCondicion.includes('SEGUNDA OPCION') || originalCondicion.includes('SEGUNDA OPCIÓN')) {
    condicionFinal = 'INGRESANTE S.O.';
  } else if (isIngresante) {
    condicionFinal = 'INGRESANTE';
  } else {
    condicionFinal = originalCondicion || 'NO INGRESA';
  }
  
  let carreraIngreso = '';
  if (isIngresante) {
    const rawCode = getRowValue(row, ['codigo_carrera', 'COD_CARRERA', 'codigo', 'Codigo', 'COD_CAR', 'cod_car', 'COD_ESC', 'cod_esc', 'COD_ESCP', 'cod_escp', 'CODIGO_CARRERA', 'CODIGO_ESCUELA', 'carrera_codigo', 'CODIGO', 'cod_carrera', 'CodCarrera']);
    let schoolIngreso = null;
    if (rawCode) {
      const cleanCode = String(rawCode).trim();
      schoolIngreso = escuelas.find(e => e.codigo_carrera === cleanCode || normalizeText(e.codigo_carrera) === normalizeText(cleanCode));
    }
    
    if (!schoolIngreso) {
      const rawIngreso = getRowValue(row, ['CarreraIngreso', 'carreraIngreso', 'CARRERA_INGRESO', 'carrera_ingreso', 'carrera_adjudicada', 'CARRERA_ADJUDICADA']);
      schoolIngreso = findSchool(rawIngreso, escuelas);
    }
    
    // Si ingresó por segunda opción (S.O.) y no hay carreraIngreso detectada, asignamos Carrera 2
    if (!schoolIngreso && condicionFinal === 'INGRESANTE S.O.') {
      carreraIngreso = codigoCarrera2 || '';
    } else {
      carreraIngreso = schoolIngreso ? schoolIngreso.codigo_carrera : (codigoCarrera1 || '');
    }
  }
  
  const grupo = getRowValue(row, ['grupo', 'Grupo', 'GRUPO', 'area', 'Area', 'AREA', 'especialidad', 'Especialidad', 'filial', 'FILIAL']);
  
  return {
    ...row,
    NroDocumento: dni,
    alumno: dni,
    nombre,
    Nota: nota,
    POS: pos,
    CarreraPostula: codigoCarrera1,
    Carrera1: codigoCarrera1,
    Carrera2: codigoCarrera2,
    CarreraIngreso: isIngresante ? carreraIngreso : '',
    OBSERVACION: condicionFinal,
    grupo
  };
};

interface ApplicantPreReviewProps {
  user: User;
  notify?: (msg: string, type?: 'success'|'error'|'warning'|'info') => void;
}

interface GroupedPreRevisions {
  [year: string]: {
    [semester: string]: {
      id: string;
      modality: CVModalidad;
      cuadro?: CVCuadroAnual;
    }[];
  };
}

const sortYears = (a: string, b: string) => {
  if (a === "Otros Años") return 1;
  if (b === "Otros Años") return -1;
  return b.localeCompare(a);
};

const sortSemesters = (a: string, b: string) => {
  const order: Record<string, number> = {
    "Proceso I": 1,
    "Proceso II": 2,
    "Proceso III": 3,
    "Proceso IV": 4,
    "Primera Opción": 5,
    "Otros": 10,
  };
  return (order[a] || 99) - (order[b] || 99);
};

const getGroupedPreRevisions = (
  ids: string[],
  allModalidades: CVModalidad[],
  cuadros: CVCuadroAnual[]
): GroupedPreRevisions => {
  const groups: GroupedPreRevisions = {};
  
  ids.forEach(id => {
    const modality = allModalidades.find(m => m.id === id);
    if (!modality) return;
    const cuadro = cuadros.find(c => c.id === modality.cuadro_id);
    
    const year = cuadro ? cuadro.anio.toString() : "Otros Años";
    const semester = modality.semestre ? `Proceso ${modality.semestre}` : "Otros";
    
    if (!groups[year]) {
      groups[year] = {};
    }
    if (!groups[year][semester]) {
      groups[year][semester] = [];
    }
    groups[year][semester].push({ id, modality, cuadro });
  });
  
  return groups;
};

export const ApplicantPreReview: React.FC<ApplicantPreReviewProps> = ({ user, notify }) => {
  const [cuadros, setCuadros] = useState<CVCuadroAnual[]>([]);
  const [modalidades, setModalidades] = useState<CVModalidad[]>([]);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [escuelas, setEscuelas] = useState<CVEscuela[]>([]);
  const [vacantes, setVacantes] = useState<CVVacante[]>([]);
  const [adjudicacionVacantes, setAdjudicacionVacantes] = useState<any[]>([]);
  const [adjudicadosList, setAdjudicadosList] = useState<any[]>([]);

  const [selectedCuadro, setSelectedCuadro] = useState(() => safeStorage.getItem('pre_rev_selectedCuadro') || '');
  const [selectedSemestre, setSelectedSemestre] = useState(() => safeStorage.getItem('pre_rev_selectedSemestre') || '');
  const [selectedModalidad, setSelectedModalidad] = useState('');
  
  const [csvData, setCsvData] = useState<any[]>([]);
  const [pagosData, setPagosData] = useState<any[]>([]);
  const [validacionesData, setValidacionesData] = useState<any[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  
  const [activeTab, setActiveTab] = useState<'Cobertura' | 'Lista' | 'Ranking' | 'Dashboard'>('Cobertura');
  
  const [coberturaFilterStatus, setCoberturaFilterStatus] = useState('Todos los Estados');
  const [coberturaFilterArea, setCoberturaFilterArea] = useState('Todas las Áreas');
  const [coberturaSearchQuery, setCoberturaSearchQuery] = useState('');
  const [coberturaFilterVacancies, setCoberturaFilterVacancies] = useState<'todos' | 'con-vacantes' | 'sin-vacantes'>('todos');
  const [coberturaSortBy, setCoberturaSortBy] = useState<string>('area-asc');
  
  const [listSearchTerm, setListSearchTerm] = useState('');
  const [listSchoolFilter, setListSchoolFilter] = useState('TODAS');
  const [selectedApplicantDetail, setSelectedApplicantDetail] = useState<any | null>(null);

  const [isSaving, setIsSaving] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncTotal, setSyncTotal] = useState(0);
  const [syncProcessed, setSyncProcessed] = useState(0);
  const [isFinalized, setIsFinalized] = useState(false);
  const [expandedSchool, setExpandedSchool] = useState<string | null>(null);
  const [savedModalidadIds, setSavedModalidadIds] = useState<string[]>([]);
  const [allModalidades, setAllModalidades] = useState<CVModalidad[]>([]);

  // Geographic Ubigeo Resolution & Filters state
  const [ubigeoMap, setUbigeoMap] = useState<Record<string, { departamento: string; provincia: string; distrito: string }>>({});
  const [geoViewLevel, setGeoViewLevel] = useState<'departamento' | 'provincia' | 'distrito'>('distrito');
  const [geoFilterDept, setGeoFilterDept] = useState('Todos');
  const [geoFilterProv, setGeoFilterProv] = useState('Todas');

  // Competitividad y Selectividad table filters
  const [schoolsSearchQuery, setSchoolsSearchQuery] = useState('');
  const [schoolsSortBy, setSchoolsSortBy] = useState<'postulantes-desc' | 'postulantes-asc' | 'ingresantes-desc' | 'vacantes-desc' | 'ratio-desc' | 'tasa-desc' | 'nombre-asc'>('postulantes-desc');
  const [schoolsFilterVacancies, setSchoolsFilterVacancies] = useState<'todos' | 'con-vacantes' | 'sin-vacantes'>('todos');
  const [schoolsFilterArea, setSchoolsFilterArea] = useState('Todas las Áreas');

  // Controles de Análisis Temporal de Pagos y Validaciones
  const [temporalViewMode, setTemporalViewMode] = useState<'dias' | 'horas'>('dias');
  const [temporalChartType, setTemporalChartType] = useState<'barras' | 'lineas' | 'area'>('barras');

  const [isLoadingConfig, setIsLoadingConfig] = useState(true);
  const [isFetchingPreRevision, setIsFetchingPreRevision] = useState(false);
  const [fetchingPreRevisionMessage, setFetchingPreRevisionMessage] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  const downloadXlsxTemplate = () => {
    const headers = [
      'DNI',
      'POSTULANTE',
      'NOTA',
      'POS',
      'ESCUELA1',
      'ESTADO',
      'COD_CARRERA',
      'CARRERA_INGRESO',
      'GRUPO',
      'SEXO',
      'EDAD',
      'FECHA_NACIMIENTO',
      'UBIGEO'
    ];

    const data = [
      {
        'DNI': '12345678',
        'POSTULANTE': 'QUISPE QUISPE JUAN CARLOS',
        'NOTA': '14.520',
        'POS': '1',
        'ESCUELA1': 'INGENIERÍA DE SISTEMAS',
        'ESTADO': 'INGRESANTE',
        'COD_CARRERA': '01',
        'CARRERA_INGRESO': 'INGENIERÍA DE SISTEMAS',
        'GRUPO': 'Área A',
        'SEXO': 'M',
        'EDAD': '18',
        'FECHA_NACIMIENTO': '15/04/2008',
        'UBIGEO': '080101'
      },
      {
        'DNI': '87654321',
        'POSTULANTE': 'MAMANI CONDORI MARIA LUZ',
        'NOTA': '13.110',
        'POS': '2',
        'ESCUELA1': 'MEDICINA HUMANA',
        'ESTADO': 'INGRESANTE',
        'COD_CARRERA': '15',
        'CARRERA_INGRESO': 'MEDICINA HUMANA',
        'GRUPO': 'Área A',
        'SEXO': 'F',
        'EDAD': '19',
        'FECHA_NACIMIENTO': '22/11/2007',
        'UBIGEO': '080108'
      },
      {
        'DNI': '44556677',
        'POSTULANTE': 'HUAMAN OBLITAS RENE',
        'NOTA': '9.500',
        'POS': '24',
        'ESCUELA1': 'DERECHO',
        'ESTADO': 'NO INGRESANTE',
        'COD_CARRERA': '',
        'CARRERA_INGRESO': '',
        'GRUPO': 'Área C',
        'SEXO': 'M',
        'EDAD': '17',
        'FECHA_NACIMIENTO': '01/01/2009',
        'UBIGEO': '080601'
      }
    ];

    try {
      const ws = XLSX.utils.json_to_sheet(data, { header: headers });
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Plantilla de Resultados');
      XLSX.writeFile(wb, 'plantilla_pre_revision_resultados.xlsx');
      notify?.('Plantilla de resultados descargada correctamente.', 'success');
    } catch (error: any) {
      console.error('Error generating template:', error);
      notify?.(`Error al generar la plantilla: ${error.message}`, 'error');
    }
  };

  useEffect(() => {
    const fetchData = async () => {
      setIsLoadingConfig(true);
      try {
        const [cuadrosRes, escuelasRes, modalidadesRes, statusRes] = await Promise.all([
          supabase.from('cv_cuadros_anuales').select('*').order('created_at', { ascending: false }),
          supabase.from('cv_escuelas').select('*'),
          supabase.from('cv_modalidades').select('*'),
          fetch('/api/get-pre-revisions-status').then(r => r.ok ? r.json() : { success: false, savedModalidadIds: [] }).catch(() => ({ success: false, savedModalidadIds: [] }))
        ]);

        if (cuadrosRes.error) {
          console.error("Error fetching cuadros:", cuadrosRes.error);
          notify?.(`Error al cargar cuadros anuales: ${cuadrosRes.error.message}`, 'error');
        } else if (cuadrosRes.data) {
          setCuadros(cuadrosRes.data);
        }

        if (escuelasRes.error) {
          console.error("Error fetching escuelas:", escuelasRes.error);
          notify?.(`Error al cargar escuelas: ${escuelasRes.error.message}`, 'error');
        } else if (escuelasRes.data) {
          setEscuelas(escuelasRes.data);
        }

        if (modalidadesRes.error) {
          console.error("Error fetching all modalities:", modalidadesRes.error);
        } else if (modalidadesRes.data) {
          setAllModalidades(modalidadesRes.data);
        }

        let savedIds: string[] = [];
        if (statusRes && statusRes.success && Array.isArray(statusRes.savedModalidadIds) && statusRes.savedModalidadIds.length > 0) {
          savedIds = statusRes.savedModalidadIds;
        }
        // Direct Supabase query as fallback for static deploys (Netlify)
        const { data: dbPreData } = await supabaseAdmin.from('pre_revision_archivos').select('modalidad_id');
        if (dbPreData && dbPreData.length > 0) {
          const directIds = dbPreData.map(item => item.modalidad_id).filter(Boolean);
          savedIds = Array.from(new Set([...savedIds, ...directIds]));
        }
        setSavedModalidadIds(savedIds);
      } catch (err) {
        console.error("Error in parallel initial mount fetching:", err);
      } finally {
        setIsLoadingConfig(false);
      }
    };
    fetchData();
  }, []);

  useEffect(() => {
    safeStorage.setItem('pre_rev_selectedCuadro', selectedCuadro);
  }, [selectedCuadro]);

  useEffect(() => {
    safeStorage.setItem('pre_rev_selectedSemestre', selectedSemestre);
  }, [selectedSemestre]);

  useEffect(() => {
    safeStorage.setItem('pre_rev_selectedModalidad', selectedModalidad);
  }, [selectedModalidad]);

  useEffect(() => {
    if (selectedCuadro) {
      supabase.from('cv_modalidades').select('*').eq('cuadro_id', selectedCuadro).order('orden', { ascending: true }).then(({ data, error }) => {
        if (error) {
          console.error("Error fetching modalidades:", error);
          notify?.(`Error al cargar modalidades: ${error.message}`, 'error');
        }
        if (data) setModalidades(data);
      });
    } else {
      setModalidades([]);
    }
  }, [selectedCuadro]);

  const availableSemesters = Array.from(new Set(modalidades.filter(m => m && m.semestre).map(m => m.semestre))).sort();
  const filteredModalidades = modalidades.filter(m => m && m.semestre === selectedSemestre);

  useEffect(() => {
    if (selectedModalidad) {
      checkPreRevision(selectedModalidad);
      checkIfFinalized(selectedModalidad);
    } else {
      clearData();
      setIsFinalized(false);
    }
  }, [selectedModalidad, selectedCuadro]);

  const checkIfFinalized = async (modId: string) => {
    try {
      const cuadro = cuadros.find(c => c.id === selectedCuadro);
      const modality = modalidades.find(m => m.id === modId) || allModalidades.find(m => m.id === modId);
      if (!cuadro || !modality) {
        setIsFinalized(false);
        return;
      }
      const anio = cuadro.anio || new Date().getFullYear().toString();
      const semestre = modality.semestre || "—";
      
      const { count, error } = await supabase
        .from('participantes')
        .select('*', { count: 'exact', head: true })
        .eq('MODALIDAD', modality.nombre)
        .eq('SEMESTRE', semestre)
        .eq('ANIO', anio);
        
      if (!error && count !== null && count > 0) {
        setIsFinalized(true);
      } else {
        setIsFinalized(false);
      }
    } catch (e) {
      console.error("Error checking finalization state:", e);
      setIsFinalized(false);
    }
  };

  const fetchVacantesForModality = async (modId: string) => {
    try {
      // Buscar modalidades homólogas (mismo nombre y cuadro) para mantener el soporte de fallback
      const currentMod = allModalidades.find(m => m.id === modId) || modalidades.find(m => m.id === modId);
      let targetModIds = [modId];
      if (currentMod) {
        const peerModIds = allModalidades
          .filter(m => m.nombre === currentMod.nombre && m.cuadro_id === currentMod.cuadro_id)
          .map(m => m.id);
        targetModIds = Array.from(new Set([...targetModIds, ...peerModIds]));
      }
      // Consultamos únicamente las vacantes asociadas a esta modalidad y sus pares
      const { data, error } = await supabase
        .from('cv_vacantes')
        .select('*')
        .in('modalidad_id', targetModIds);
      if (error) {
        console.error("Error fetching vacantes for modality:", error);
        notify?.(`Error al cargar vacantes: ${error.message}`, 'error');
      } else if (data) {
        setVacantes(data);
      }
    } catch (err: any) {
      console.error("Error in fetchVacantesForModality:", err);
    }
  };

  const fetchAdjudicadosForModality = async (modId: string) => {
    try {
      const currentMod = allModalidades.find(m => m.id === modId) || modalidades.find(m => m.id === modId);
      if (!currentMod) {
        setAdjudicadosList([]);
        return;
      }
      const normName = (s: string) => (s || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[\s_-]+/g, " ").trim();
      const targetNorm = normName(currentMod.nombre);

      // Consultar adjudicacion_ranking
      const { data: adjRank } = await supabase
        .from("adjudicacion_ranking")
        .select("*")
        .not("escuela_adjudicada", "is", null);

      let list: any[] = [];
      if (adjRank) {
        list = adjRank.filter(r => {
          const rNorm = normName(r.modalidad || '');
          return rNorm === targetNorm || rNorm.includes(targetNorm) || targetNorm.includes(rNorm);
        });
      }

      // Consultar la tabla de participantes por si ya fue migrado
      const { data: partData } = await supabase
        .from("participantes")
        .select("*")
        .ilike("OBSERVACION", "%ADJUDICA%");

      if (partData) {
        const partMatched = partData.filter(p => {
          const pNorm = normName(p.MODALIDAD || '');
          return pNorm === targetNorm || pNorm.includes(targetNorm) || targetNorm.includes(pNorm);
        });

        partMatched.forEach(p => {
          const doc = String(p.CODPOSTULANTE || '').trim();
          if (doc && !list.some(x => String(x.dni).trim() === doc)) {
            list.push({
              dni: doc,
              nombre: p.NOMBRE || '',
              nota: p.NOTA || 0,
              orden_merito: p.OMERITO || '--',
              escuela_adjudicada: p.CARRERA || '',
              modalidad: p.MODALIDAD,
              area: ''
            });
          }
        });
      }

      setAdjudicadosList(list);
    } catch (err) {
      console.error("Error in fetchAdjudicadosForModality:", err);
      setAdjudicadosList([]);
    }
  };

  useEffect(() => {
    if (selectedModalidad) {
      fetchVacantesForModality(selectedModalidad);
      fetchAdjudicadosForModality(selectedModalidad);
    } else {
      setVacantes([]);
      setAdjudicadosList([]);
    }
  }, [selectedModalidad, allModalidades, modalidades]);

  const checkPreRevision = async (modId: string) => {
    setIsFetchingPreRevision(true);
    setFetchingPreRevisionMessage('Estableciendo conexión...');
    try {
      await new Promise(resolve => setTimeout(resolve, 150));
      setFetchingPreRevisionMessage('Descargando archivo de resultados...');
      
      let result: any = null;
      try {
        const res = await fetch(`/api/get-pre-revision/${modId}`);
        if (res.ok) {
          result = await res.json();
        }
      } catch (err) {
        console.warn("API fetch failed, trying direct Supabase query:", err);
      }

      if (!result || !result.data) {
        const { data: dbRow, error: dbErr } = await supabaseAdmin
          .from('pre_revision_archivos')
          .select('*')
          .eq('modalidad_id', modId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (dbErr) throw dbErr;
        if (dbRow) {
          result = { data: dbRow };
        }
      }

      setFetchingPreRevisionMessage('Procesando y decodificando datos del archivo...');

      if (result && result.data && result.data.csv_data) {
        setFetchingPreRevisionMessage('Analizando y estructurando postulantes...');
        let parsedData = result.data.csv_data;
        if (typeof parsedData === 'string') {
          try {
            parsedData = JSON.parse(parsedData);
          } catch (e) {
            console.error("Error parsing csv_data string on client:", e);
            parsedData = [];
          }
        }
        if (parsedData && !Array.isArray(parsedData) && typeof parsedData === 'object') {
          const postulantes = Array.isArray(parsedData.postulantes) ? parsedData.postulantes : [];
          const pagos = Array.isArray(parsedData.pagos) ? parsedData.pagos : [];
          const validaciones = Array.isArray(parsedData.validaciones) ? parsedData.validaciones : [];
          
          setCsvData(postulantes);
          setPagosData(pagos);
          setValidacionesData(validaciones);
        } else {
          setCsvData(Array.isArray(parsedData) ? parsedData : []);
          setPagosData([]);
          setValidacionesData([]);
        }
        setIsLoaded(true);
        setActiveTab('Cobertura');
        notify?.('Pre-revisión cargada correctamente.', 'success');
      } else {
        clearData();
      }
    } catch (e: any) {
      console.error(e);
      notify?.(`Error al recuperar pre-revisión: ${e.message}`, 'error');
    } finally {
      setIsFetchingPreRevision(false);
      setFetchingPreRevisionMessage('');
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsFetchingPreRevision(true);
    setFetchingPreRevisionMessage('Leyendo archivo CSV local...');

    const processData = async (dataToProcess: any[]) => {
      setCsvData(dataToProcess);
      setIsLoaded(true);
      setShowUploadModal(false);      if (selectedModalidad) { 
         try {
           setFetchingPreRevisionMessage('Subiendo y persistiendo archivo en el servidor...');
           let savedOk = false;
           try {
             const res = await fetch('/api/save-pre-revision', {
               method: 'POST',
               headers: { 'Content-Type': 'application/json' },
               body: JSON.stringify({
                 modalidad_id: selectedModalidad,
                 csv_data: dataToProcess
               })
             });
             if (res.ok) {
               const data = await res.json();
               if (data && data.success) savedOk = true;
             }
           } catch (e) {
             console.warn("API save failed, falling back to direct Supabase save:", e);
           }

           if (!savedOk) {
             await supabaseAdmin.from('pre_revision_archivos').delete().eq('modalidad_id', selectedModalidad);
             const { error: insErr } = await supabaseAdmin.from('pre_revision_archivos').insert({
               modalidad_id: selectedModalidad,
               csv_data: dataToProcess
             });
             if (insErr) {
               console.error("Error saving pre_revision in Supabase:", insErr);
               notify?.('Archivo cargado pero no se pudo guardar en pre-revisión.', 'warning');
             } else {
               savedOk = true;
             }
           }

           if (savedOk) {
             notify?.('Archivo guardado en pre-revisión correctamente.', 'success');
             setSavedModalidadIds(prev => prev.includes(selectedModalidad) ? prev : [...prev, selectedModalidad]);
           }
         } catch (e) {
           console.error(e);
           notify?.('Ocurrió un error al persistir el archivo en el servidor.', 'error');
         } finally {
           setIsFetchingPreRevision(false);
           setFetchingPreRevisionMessage('');
         }
      } else {
        setIsFetchingPreRevision(false);
        setFetchingPreRevisionMessage('');
      }
    };

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      encoding: "ISO-8859-1",
      complete: async (results) => {
        let parsedData = results.data;
        if (parsedData && parsedData.length > 0) {
          const keys = Object.keys(parsedData[0]);
          if (keys.length === 1) {
            const singleKey = keys[0];
            let detectedDelimiter = '';
            if (singleKey.includes(';')) {
              detectedDelimiter = ';';
            } else if (singleKey.includes('\t')) {
              detectedDelimiter = '\t';
            } else if (singleKey.includes('|')) {
              detectedDelimiter = '|';
            }

            if (detectedDelimiter) {
              setFetchingPreRevisionMessage(`Detectando delimitador "${detectedDelimiter}" y re-procesando...`);
              Papa.parse(file, {
                header: true,
                skipEmptyLines: true,
                encoding: "ISO-8859-1",
                delimiter: detectedDelimiter,
                complete: (reparsedResults) => {
                  processData(reparsedResults.data);
                },
                error: (error) => {
                  setIsFetchingPreRevision(false);
                  setFetchingPreRevisionMessage('');
                  notify?.(`Error al re-leer el archivo con delimitador: ${error.message}`, 'error');
                }
              });
              return;
            }
          }
        }
        processData(parsedData);
      },
      error: (error) => {
        setIsFetchingPreRevision(false);
        setFetchingPreRevisionMessage('');
        notify?.(`Error al leer el archivo: ${error.message}`, 'error');
      }
    });
  };

  const clearData = () => {
    setCsvData([]);
    setPagosData([]);
    setValidacionesData([]);
    setIsLoaded(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
    setActiveTab('Cobertura');
  };

  const currentModalityName = useMemo(() => {
    if (!selectedModalidad) return '';
    const m = allModalidades.find(mod => mod.id === selectedModalidad) || modalidades.find(mod => mod.id === selectedModalidad);
    return m ? m.nombre : '';
  }, [selectedModalidad, allModalidades, modalidades]);

  // --- Geographic Code Auto-Detection (INEI vs RENIEC) ---
  const usesInei = useMemo(() => {
    let count08 = 0; // Cusco en INEI
    let count07 = 0; // Cusco en RENIEC
    
    (csvData || []).forEach(row => {
      let code = getRowValue(row, [
        'Ubigeo_Domicilio_Actual', 'ubigeo_domicilio', 'UBIGEO_DOMICILIO',
        'ubigeo_domicilio_actual', 'UBIGEO_DOMICILIO_ACTUAL',
        'LugarNacimiento', 'lugar_nac', 'LUGAR_NAC',
        'ubigeo', 'Ubigeo', 'UBIGEO', 'codigo_ubigeo', 'COD_UBIGEO', 'ubigeo_procedencia'
      ]);
      code = cleanUbigeoCode(code);
      if (code) {
        if (code.startsWith('08') || (code.length === 5 && code.startsWith('8'))) {
          count08++;
        } else if (code.startsWith('07') || (code.length === 5 && code.startsWith('7'))) {
          count07++;
        }
      }
    });
    
    return count08 > count07;
  }, [csvData]);

  // --- Dynamic Normalization and Mapping ---
  const normalizedCsvData = useMemo(() => {
    const baseRows = (csvData || []).map(row => normalizeRow(row, escuelas));
    if (!adjudicadosList || adjudicadosList.length === 0) {
      return baseRows;
    }

    const baseDniMap = new Map<string, number>();
    baseRows.forEach((row, idx) => {
      const doc = String(row.NroDocumento || row.alumno || '').trim();
      if (doc) baseDniMap.set(doc, idx);
    });

    const mergedRows = [...baseRows];

    adjudicadosList.forEach(adj => {
      const doc = String(adj.dni || '').trim();
      const sch = findSchool(adj.escuela_adjudicada, escuelas);
      const schCode = sch ? sch.codigo_carrera : '';
      const schName = sch ? sch.nombre : adj.escuela_adjudicada;

      if (doc && baseDniMap.has(doc)) {
        const existingIdx = baseDniMap.get(doc)!;
        const existingRow = mergedRows[existingIdx];
        
        mergedRows[existingIdx] = {
          ...existingRow,
          OBSERVACION: "INGRESANTE ADJUDICACIÓN",
          CarreraIngreso: schCode || existingRow.CarreraIngreso || '',
          CarreraIngresoNombre: schName || existingRow.CarreraIngresoNombre || '',
          isAdjudicado: true,
          tipoIngreso: "Adjudicación"
        };
      } else {
        mergedRows.push({
          NroDocumento: doc,
          nombre: adj.nombre || '',
          Nota: String(adj.nota || '0'),
          POS: String(adj.orden_merito || '--'),
          OBSERVACION: "INGRESANTE ADJUDICACIÓN",
          CarreraIngreso: schCode,
          CarreraIngresoNombre: schName,
          CarreraPostula: schCode,
          grupo: adj.area || '',
          isAdjudicado: true,
          tipoIngreso: "Adjudicación"
        });
      }
    });

    return mergedRows;
  }, [csvData, escuelas, adjudicadosList]);

  // Mapas de consulta cruzada rápida por DNI
  const pagosMap = useMemo(() => {
    const map = new Map<string, any>();
    (pagosData || []).forEach(p => {
      if (p && p.alumno) {
        map.set(String(p.alumno).trim(), p);
      }
    });
    return map;
  }, [pagosData]);

  const validacionesMap = useMemo(() => {
    const map = new Map<string, any[]>();
    (validacionesData || []).forEach(v => {
      const doc = String(v?.nro_documento || v?.alumno || '').trim();
      if (doc) {
        if (!map.has(doc)) map.set(doc, []);
        map.get(doc)!.push(v);
      }
    });
    return map;
  }, [validacionesData]);

  // Helper para analizar el estado consolidado de un requisito detectando subsanaciones
  const getReqSubsanacionInfo = (valList: any[], reqId: number) => {
    const items = (valList || [])
      .filter(v => Number(v?.id_requisito) === reqId)
      .sort((a, b) => {
        const tA = String(a?.fecha_subida || a?.fecha_validacion || '');
        const tB = String(b?.fecha_subida || b?.fecha_validacion || '');
        return tA.localeCompare(tB);
      });

    if (items.length === 0) {
      return {
        status: 'sin_registro' as const,
        latest: null,
        hasSubsanacion: false,
        history: [],
        obsPrevia: null
      };
    }

    const latest = items[items.length - 1];
    const previousObsItems = items.slice(0, items.length - 1).filter(
      x => Number(x?.valido) === 0 || (x?.observaciones && String(x.observaciones).trim() !== '')
    );

    const hasSubsanacion = Number(latest?.valido) === 1 && (
      previousObsItems.length > 0 || items.some(x => Number(x?.valido) === 0 || (x?.observaciones && String(x.observaciones).trim() !== ''))
    );

    let status: 'aprobado' | 'subsanado' | 'observado' | 'sin_registro' = 'sin_registro';
    if (Number(latest?.valido) === 1) {
      status = hasSubsanacion ? 'subsanado' : 'aprobado';
    } else {
      status = 'observado';
    }

    const obsPrevia = previousObsItems.length > 0 ? previousObsItems[previousObsItems.length - 1] : null;

    return {
      status,
      latest,
      hasSubsanacion,
      history: items,
      obsPrevia
    };
  };

  const subsanacionesTotalCount = useMemo(() => {
    let count = 0;
    validacionesMap.forEach((valList) => {
      [1, 2, 3].forEach(reqId => {
        const info = getReqSubsanacionInfo(valList, reqId);
        if (info.hasSubsanacion) count++;
      });
    });
    return count;
  }, [validacionesMap]);

  useEffect(() => {
    const fetchUbigeoMappings = async () => {
      if (!normalizedCsvData || normalizedCsvData.length === 0) return;

      // Extraer ubigeos únicos del CSV
      const rawUbigeos = normalizedCsvData.map(row => {
        let code = getRowValue(row, [
          'Ubigeo_Domicilio_Actual', 'ubigeo_domicilio', 'UBIGEO_DOMICILIO',
          'ubigeo_domicilio_actual', 'UBIGEO_DOMICILIO_ACTUAL',
          'LugarNacimiento', 'lugar_nac', 'LUGAR_NAC',
          'ubigeo', 'Ubigeo', 'UBIGEO', 'codigo_ubigeo', 'COD_UBIGEO', 'ubigeo_procedencia'
        ]);
        return cleanUbigeoCode(code);
      }).filter(Boolean);

      const uniqueUbigeos = Array.from(new Set(rawUbigeos)) as string[];
      if (uniqueUbigeos.length === 0) return;

      const queryUbigeos: string[] = [];
      uniqueUbigeos.forEach((u: string) => {
        // Si el CSV usa INEI, convertimos a RENIEC para que coincida con la base de datos
        const targetCode = usesInei ? convertIneiToReniec(u) : u;
        queryUbigeos.push(targetCode);
        if (targetCode.startsWith('0') && targetCode.length === 6) {
          queryUbigeos.push(targetCode.slice(1));
        }
        // También buscamos el código original por precaución
        queryUbigeos.push(u);
        if (u.startsWith('0') && u.length === 6) {
          queryUbigeos.push(u.slice(1));
        }
      });

      try {
        const { data, error } = await supabase
          .from('ubigeos')
          .select('ubigeo, departamento, provincia, distrito')
          .in('ubigeo', Array.from(new Set(queryUbigeos)));

        if (error) {
          console.error("Error fetching ubigeos:", error);
          return;
        }

        if (data) {
          const map: Record<string, { departamento: string; provincia: string; distrito: string }> = {};
          data.forEach(u => {
            if (u.ubigeo) {
              const info = {
                departamento: u.departamento || '',
                provincia: u.provincia || '',
                distrito: u.distrito || ''
              };
              map[u.ubigeo] = info;
              if (u.ubigeo.length === 5) {
                map['0' + u.ubigeo] = info;
              }
              if (u.ubigeo.length === 6 && u.ubigeo.startsWith('0')) {
                map[u.ubigeo.slice(1)] = info;
              }
            }
          });
          setUbigeoMap(map);
        }
      } catch (err) {
        console.error("Error loading ubigeos mapping:", err);
      }
    };

    fetchUbigeoMappings();
  }, [normalizedCsvData, usesInei]);

  const getGeographicInfo = (row: any) => {
    let ubigeoCode = getRowValue(row, [
      'Ubigeo_Domicilio_Actual', 'ubigeo_domicilio', 'UBIGEO_DOMICILIO',
      'ubigeo_domicilio_actual', 'UBIGEO_DOMICILIO_ACTUAL',
      'LugarNacimiento', 'lugar_nac', 'LUGAR_NAC',
      'ubigeo', 'Ubigeo', 'UBIGEO', 'codigo_ubigeo', 'COD_UBIGEO', 'ubigeo_procedencia'
    ]);

    ubigeoCode = cleanUbigeoCode(ubigeoCode);

    // Si el CSV usa INEI, convertimos a RENIEC para buscarlo en nuestro mapa local
    const lookupCode = usesInei ? convertIneiToReniec(ubigeoCode) : ubigeoCode;
    let matched = ubigeoMap[lookupCode];
    if (!matched && lookupCode.startsWith('0') && lookupCode.length === 6) {
      matched = ubigeoMap[lookupCode.slice(1)];
    }

    // Fallback al código original si no coincide con el convertido
    if (!matched) {
      matched = ubigeoMap[ubigeoCode];
      if (!matched && ubigeoCode.startsWith('0') && ubigeoCode.length === 6) {
        matched = ubigeoMap[ubigeoCode.slice(1)];
      }
    }

    if (matched) {
      return {
        code: ubigeoCode,
        departamento: matched.departamento,
        provincia: matched.provincia,
        distrito: matched.distrito
      };
    }

    const depVal = getRowValue(row, ['departamento', 'DEPARTAMENTO', 'dep', 'DEP', 'Region', 'region', 'REGION']);
    const provVal = getRowValue(row, ['provincia', 'PROVINCIA', 'prov', 'PROV']);
    const distVal = getRowValue(row, ['distrito', 'DISTRITO', 'dist', 'DIST', 'procedencia', 'PROCEDENCIA', 'Procedencia']);

    return {
      code: ubigeoCode || '',
      departamento: depVal || 'NO ESPECIFICADO',
      provincia: provVal || 'NO ESPECIFICADO',
      distrito: distVal || 'NO ESPECIFICADO'
    };
  };

  // --- Calculations for Cobertura ---
  const vacanciesBySchool = useMemo<Record<string, number>>(() => {
    const map: Record<string, number> = {};
    
    // Initialize with 0 for all schools first to make sure every school has a starting value
    escuelas.forEach(e => {
      map[e.codigo_carrera] = 0;
    });

    const normalizeString = (s: string) => {
      if (!s) return '';
      return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().replace(/[\s_-]+/g, ' ');
    };

    const currentMod = allModalidades.find(m => m.id === selectedModalidad) || modalidades.find(m => m.id === selectedModalidad);
    let currentModName = currentMod ? currentMod.nombre : '';

    // FALLBACK 1: If selectedModalidad is empty but we have saved pre-revisions status,
    // try to infer from the savedModalidadIds
    if (!selectedModalidad && savedModalidadIds && savedModalidadIds.length > 0) {
      const fallbackModId = savedModalidadIds[0];
      const fallbackMod = allModalidades.find(m => m.id === fallbackModId) || modalidades.find(m => m.id === fallbackModId);
      if (fallbackMod) {
        currentModName = fallbackMod.nombre;
      }
    }

    const normalizedCurrentModName = normalizeString(currentModName);

    // Layer 1: Gather peer modalities in cv_modalidades that are highly similar by name
    let peerModIds: string[] = [];
    if (selectedModalidad) {
      peerModIds.push(selectedModalidad);
    }
    if (currentModName) {
      const siblingMods = allModalidades.filter(m => {
        const mNorm = normalizeString(m.nombre);
        return mNorm === normalizedCurrentModName || mNorm.includes(normalizedCurrentModName) || normalizedCurrentModName.includes(mNorm);
      });
      
      // Prioritize peer modalities in the same Cuadro, then expand to any Cuadro
      const sameCuadroSiblings = siblingMods.filter(m => m.cuadro_id === currentMod?.cuadro_id);
      const selectedSiblings = sameCuadroSiblings.length > 0 ? sameCuadroSiblings : siblingMods;
      selectedSiblings.forEach(m => {
        if (!peerModIds.includes(m.id)) {
          peerModIds.push(m.id);
        }
      });
    }

    // Populate from cv_vacantes
    const filteredVacantes = vacantes.filter(v => peerModIds.includes(v.modalidad_id));
    filteredVacantes.forEach(v => {
      const escuela = escuelas.find(e => e.id === v.escuela_id);
      if (escuela) {
        // Use the maximum value in case of multiple matches
        map[escuela.codigo_carrera] = Math.max(map[escuela.codigo_carrera] || 0, v.cantidad);
      }
    });

    // Layer 2: Also extract and merge from adjudicacion_vacantes table for absolute robust fallback
    if (currentModName && adjudicacionVacantes && adjudicacionVacantes.length > 0) {
      const relatedAdjVacs = adjudicacionVacantes.filter(av => {
        const avNorm = normalizeString(av.modalidad || '');
        return avNorm === normalizedCurrentModName || avNorm.includes(normalizedCurrentModName) || normalizedCurrentModName.includes(avNorm);
      });

      relatedAdjVacs.forEach(av => {
        const escuela = findSchool(av.escuela || '', escuelas);
        if (escuela) {
          map[escuela.codigo_carrera] = Math.max(map[escuela.codigo_carrera] || 0, av.vacantes_totales || 0);
        }
      });
    }

    // LAST RESORT FALLBACK: If total vacancies sum up to 0, but we have vacantes or adjudicacion_vacantes
    // in the selected Cuadro, use those to prevent showing 0 everywhere!
    const totalSum = Object.values(map).reduce((a, b) => a + b, 0);
    if (totalSum === 0) {
      // Attempt to search vacantes from the same Cuadro selecting any modality belonging to it
      if (selectedCuadro) {
        const cuadroMods = allModalidades.filter(m => m.cuadro_id === selectedCuadro).map(m => m.id);
        const fallbackVacs = vacantes.filter(v => cuadroMods.includes(v.modalidad_id));
        if (fallbackVacs.length > 0) {
          fallbackVacs.forEach(v => {
            const escuela = escuelas.find(e => e.id === v.escuela_id);
            if (escuela) {
              map[escuela.codigo_carrera] = Math.max(map[escuela.codigo_carrera] || 0, v.cantidad);
            }
          });
        }
      }
      
      // If still 0, merge from adjudicacion_vacantes in general
      const finalSum = Object.values(map).reduce((a, b) => a + b, 0);
      if (finalSum === 0 && adjudicacionVacantes && adjudicacionVacantes.length > 0) {
        adjudicacionVacantes.forEach(av => {
          const escuela = findSchool(av.escuela || '', escuelas);
          if (escuela) {
            map[escuela.codigo_carrera] = Math.max(map[escuela.codigo_carrera] || 0, av.vacantes_totales || 0);
          }
        });
      }
    }

    return map;
  }, [vacantes, selectedModalidad, modalidades, allModalidades, escuelas, savedModalidadIds, adjudicacionVacantes, selectedCuadro]);

  const { admittedBySchool, admittedDirectBySchool, admittedAdjBySchool, totalApplicantsBySchool } = useMemo(() => {
    const admitted: Record<string, number> = {};
    const admittedDirect: Record<string, number> = {};
    const admittedAdj: Record<string, number> = {};
    const totalApplicants: Record<string, number> = {};
    
    // Inicializar ambas estructuras
    escuelas.forEach(e => {
      totalApplicants[e.codigo_carrera] = 0;
      admitted[e.codigo_carrera] = 0;
      admittedDirect[e.codigo_carrera] = 0;
      admittedAdj[e.codigo_carrera] = 0;
    });
    normalizedCsvData.forEach(row => {
      if (row) {
        // Contamos el postulante en su carrera de postulación
        if (row.CarreraPostula) {
          const codePostula = row.CarreraPostula;
          if (totalApplicants[codePostula] !== undefined) {
            totalApplicants[codePostula]++;
          }
        }
        
        const obsUpper = (row.OBSERVACION || '').toUpperCase();
        const isIngresante = isAdmittedRow(row);
        const isAdj = row.isAdjudicado || obsUpper.includes('ADJUDICA');

        // Contamos el ingreso solo si se consolidó como ingresante y tiene código de ingreso
        if (isIngresante && row.CarreraIngreso) {
          const codeIngreso = row.CarreraIngreso;
          if (admitted[codeIngreso] !== undefined) {
            admitted[codeIngreso]++;
            if (isAdj) {
              admittedAdj[codeIngreso] = (admittedAdj[codeIngreso] || 0) + 1;
            } else {
              admittedDirect[codeIngreso] = (admittedDirect[codeIngreso] || 0) + 1;
            }
          }
        }
      }
    });
    return { 
      admittedBySchool: admitted, 
      admittedDirectBySchool: admittedDirect,
      admittedAdjBySchool: admittedAdj,
      totalApplicantsBySchool: totalApplicants 
    };
  }, [escuelas, normalizedCsvData]);

  const coberturaRows = useMemo(() => {
    return escuelas.map(e => {
      const vac = vacanciesBySchool[e.codigo_carrera] || 0;
      const admTotal = admittedBySchool[e.codigo_carrera] || 0;
      const admDirect = admittedDirectBySchool[e.codigo_carrera] || 0;
      const admAdj = admittedAdjBySchool[e.codigo_carrera] || 0;
      const totalApp = totalApplicantsBySchool[e.codigo_carrera] || 0;
      
      if (vac > 0 || admTotal > 0 || totalApp > 0) {
        let status = 'Cubierto';
        if (admTotal < vac) status = 'Sobran Vacantes';
        if (admTotal > vac) status = 'Exceso de Ingresantes';

        const ratio = vac > 0 ? (totalApp / vac).toFixed(1) : '—';
        const admissionRate = totalApp > 0 ? ((admTotal / totalApp) * 100).toFixed(1) : '0.0';

        return {
          schoolName: e.nombre,
          schoolCode: e.codigo_carrera,
          area: e.area,
          vacancies: vac,
          admittedDirect: admDirect,
          admittedAdj: admAdj,
          admitted: admTotal,
          applicants: totalApp,
          difference: vac - admTotal,
          ratio,
          admissionRate,
          status: status
        };
      }
      return null;
    }).filter(Boolean) as any[];
  }, [escuelas, vacanciesBySchool, admittedBySchool, admittedDirectBySchool, admittedAdjBySchool, totalApplicantsBySchool]);

  const sortedCoberturaRows = useMemo(() => {
    const filteredCoberturaRows = coberturaRows.filter(row => {
      const matchStatus = coberturaFilterStatus === 'Todos los Estados' || row.status === coberturaFilterStatus;
      const matchArea = coberturaFilterArea === 'Todas las Áreas' || row.area === coberturaFilterArea.replace('Área ', '');
      
      // Vacancy filter
      let matchVacancies = true;
      if (coberturaFilterVacancies === 'con-vacantes') {
        matchVacancies = row.vacancies > 0;
      } else if (coberturaFilterVacancies === 'sin-vacantes') {
        matchVacancies = row.vacancies === 0;
      }

      // Search query filter
      let matchSearch = true;
      if (coberturaSearchQuery.trim() !== '') {
        const q = coberturaSearchQuery.toLowerCase().trim();
        matchSearch = row.schoolName.toLowerCase().includes(q) || row.schoolCode.toLowerCase().includes(q);
      }

      return matchStatus && matchArea && matchVacancies && matchSearch;
    });

    return [...filteredCoberturaRows].sort((a, b) => {
      if (coberturaSortBy === 'area-asc') {
        const areaA = a.area || '';
        const areaB = b.area || '';
        const areaCompare = areaA.localeCompare(areaB);
        if (areaCompare !== 0) return areaCompare;
        
        const nameA = a.schoolName || '';
        const nameB = b.schoolName || '';
        return nameA.localeCompare(nameB);
      }
      if (coberturaSortBy === 'postulantes-desc') {
        return b.applicants - a.applicants;
      }
      if (coberturaSortBy === 'postulantes-asc') {
        return a.applicants - b.applicants;
      }
      if (coberturaSortBy === 'ingresantes-desc') {
        return b.admitted - a.admitted;
      }
      if (coberturaSortBy === 'vacantes-desc') {
        return b.vacancies - a.vacancies;
      }
      if (coberturaSortBy === 'difference-desc') {
        return b.difference - a.difference;
      }
      if (coberturaSortBy === 'ratio-desc') {
        const rA = a.ratio === '—' ? -1 : parseFloat(a.ratio) || 0;
        const rB = b.ratio === '—' ? -1 : parseFloat(b.ratio) || 0;
        return rB - rA;
      }
      if (coberturaSortBy === 'tasa-desc') {
        const tA = parseFloat(a.admissionRate) || 0;
        const tB = parseFloat(b.admissionRate) || 0;
        return tB - tA;
      }
      if (coberturaSortBy === 'nombre-asc') {
        return a.schoolName.localeCompare(b.schoolName);
      }
      return 0;
    });
  }, [coberturaRows, coberturaFilterStatus, coberturaFilterArea, coberturaFilterVacancies, coberturaSearchQuery, coberturaSortBy]);

  // --- Calculations for Ranking ---
  const rankingData = useMemo(() => {
    const filtered = normalizedCsvData
      .filter(row => {
        if (!row) return false;
        if (row.OBSERVACION?.toUpperCase().includes('INGRESANTE')) return false;
        const n = parseFloat(row.Nota);
        return !isNaN(n) && n >= 9;
      })
      .map(row => ({
        row,
        parsedNota: parseFloat(row.Nota) || 0
      }));
    filtered.sort((a, b) => {
      if (b.parsedNota !== a.parsedNota) return b.parsedNota - a.parsedNota;
      return (a.row.nombre || '').localeCompare(b.row.nombre || '');
    });
    return filtered.map((item, idx) => ({
      orden_merito: idx + 1,
      dni: item.row.NroDocumento || '',
      nombre: item.row.nombre || '',
      area: item.row.grupo || '',
      nota: item.row.Nota || ''
    }));
  }, [normalizedCsvData]);

  const groupedRankingData = useMemo(() => {
    const groups: Record<string, typeof rankingData> = {};
    rankingData.forEach(item => {
      let areaKey = 'Sin Grupo';
      if (item.area) {
        const clean = item.area.replace(/^(á|a)rea\s+/i, '').replace(/^grupo\s+/i, '').trim().toUpperCase();
        if (clean) {
          areaKey = clean;
        }
      }
      if (!groups[areaKey]) {
        groups[areaKey] = [];
      }
      groups[areaKey].push(item);
    });

    const sortedGroupKeys = Object.keys(groups).sort((a, b) => {
      const predefined = ['A', 'B', 'C', 'D'];
      const idxA = predefined.indexOf(a);
      const idxB = predefined.indexOf(b);
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return a.localeCompare(b);
    });

    return sortedGroupKeys.map(key => ({
      key,
      title: ['A', 'B', 'C', 'D'].includes(key) ? `Área ${key}` : key === 'Sin Grupo' ? 'Sin Área' : `Grupo ${key}`,
      items: groups[key]
    }));
  }, [rankingData]);

  // --- Calculations for Lista ---
  const getSchoolName = (code: string) => {
    if (!code) return '';
    const school = escuelas.find(e => e.codigo_carrera === code || e.nombre === code);
    return school ? school.nombre : code;
  };

  const listSchoolOptions = useMemo(() => {
    const set = new Set<string>();
    normalizedCsvData.forEach(row => {
      if (row.CarreraPostula) set.add(row.CarreraPostula);
      if (row.CarreraIngreso) set.add(row.CarreraIngreso);
      if (row.Carrera1) set.add(row.Carrera1);
      if (row.Carrera2) set.add(row.Carrera2);
    });
    escuelas.forEach(e => {
      if (e.codigo_carrera) set.add(e.codigo_carrera);
    });
    const codes = Array.from(set).filter(Boolean);

    const optionsMap = new Map<string, { code: string; name: string }>();
    codes.forEach(code => {
      const sch = escuelas.find(e => e.codigo_carrera === code || e.nombre === code);
      const name = sch ? `${sch.codigo_carrera} - ${sch.nombre}` : code;
      const key = sch ? sch.codigo_carrera : code;
      if (!optionsMap.has(key)) {
        optionsMap.set(key, { code: key, name });
      }
    });

    const result = Array.from(optionsMap.values());
    result.sort((a, b) => a.name.localeCompare(b.name));
    return result;
  }, [normalizedCsvData, escuelas]);

  const filteredList = useMemo(() => {
    let list = normalizedCsvData;

    if (listSchoolFilter && listSchoolFilter !== 'TODAS') {
      const targetSchool = escuelas.find(e => e.codigo_carrera === listSchoolFilter || e.nombre === listSchoolFilter);
      const targetCode = targetSchool ? targetSchool.codigo_carrera.toLowerCase().trim() : listSchoolFilter.toLowerCase().trim();
      const targetName = targetSchool ? targetSchool.nombre.toLowerCase().trim() : listSchoolFilter.toLowerCase().trim();

      const rowMatchesTargetSchool = (val: string) => {
        if (!val) return false;
        const v = String(val).trim().toLowerCase();
        if (targetCode && v === targetCode) return true;
        if (targetName && v === targetName) return true;
        const sch = escuelas.find(e => e.codigo_carrera.toLowerCase() === v || e.nombre.toLowerCase() === v);
        if (sch && targetSchool) {
          return sch.id === targetSchool.id || sch.codigo_carrera === targetSchool.codigo_carrera;
        }
        return false;
      };

      const mappedList = list.map(row => {
        if (!row) return null;
        const isIngresante = isAdmittedRow(row);
        const obs = (row.OBSERVACION || '').trim().toUpperCase();
        const isSO = obs === 'INGRESANTE S.O.' || obs.includes('SEGUNDA OPCION') || obs.includes('SEGUNDA OPCIÓN');

        const isIngresoTarget = isIngresante && rowMatchesTargetSchool(row.CarreraIngreso);
        const isC1Target = rowMatchesTargetSchool(row.Carrera1 || row.CarreraPostula);
        const isC2Target = rowMatchesTargetSchool(row.Carrera2);

        // Para Carrera 2, solo debe aparecer si ingresó a la carrera filtrada (isIngresoTarget)
        if (!isIngresoTarget && !isC1Target) {
          return null;
        }

        let _groupPriority = 4; // 4 = No Ingresó a esta carrera
        if (isIngresoTarget) {
          if (row.isAdjudicado || obs.includes('ADJUDICA')) {
            _groupPriority = 3; // 3 = Ingresante por Adjudicación
          } else if (isSO) {
            _groupPriority = 2; // 2 = Ingresante por Segunda Opción (S.O.)
          } else {
            _groupPriority = 1; // 1 = Ingresante Directo / Primera Opción
          }
        }

        return {
          ...row,
          _groupPriority,
          _isIngresoTarget: isIngresoTarget,
          _isC1Target: isC1Target,
          _isC2Target: isC2Target
        };
      }).filter(Boolean) as any[];

      mappedList.sort((a, b) => {
        if (a._groupPriority !== b._groupPriority) {
          return a._groupPriority - b._groupPriority;
        }
        const posA = Number(a.POS) || 999999;
        const posB = Number(b.POS) || 999999;
        if (posA !== posB) return posA - posB;

        const notaA = Number(a.Nota) || 0;
        const notaB = Number(b.Nota) || 0;
        return notaB - notaA;
      });

      list = mappedList;
    }

    const term = listSearchTerm.toLowerCase().trim();
    if (!term) return list;

    return list.filter(row => {
      if (!row) return false;
      const schoolNamePost = getSchoolName(row.CarreraPostula || '');
      const schoolNameIng = getSchoolName(row.CarreraIngreso || '');
      const schoolName1 = getSchoolName(row.Carrera1 || '');
      const schoolName2 = getSchoolName(row.Carrera2 || '');
      return (row.NroDocumento || '').toLowerCase().includes(term) ||
             (row.nombre || '').toLowerCase().includes(term) ||
             (row.CarreraIngreso || '').toLowerCase().includes(term) ||
             (row.CarreraPostula || '').toLowerCase().includes(term) ||
             schoolNamePost.toLowerCase().includes(term) ||
             schoolNameIng.toLowerCase().includes(term) ||
             schoolName1.toLowerCase().includes(term) ||
             schoolName2.toLowerCase().includes(term) ||
             (row.OBSERVACION || '').toLowerCase().includes(term);
    });
  }, [normalizedCsvData, listSearchTerm, listSchoolFilter, escuelas]);

  // Calcular los puestos correlativos locales por escuela para todos los ingresantes (incluyendo adjudicados)
  const localPuestosMap = useMemo(() => {
    const map: Record<string, number> = {}; 
    // Agrupar ingresantes por escuela de ingreso
    const ingresantesPorEscuela: Record<string, any[]> = {};
    normalizedCsvData.forEach(row => {
      const obsUpper = (row.OBSERVACION || '').toUpperCase();
      const isIng = isAdmittedRow(row) || row.isAdjudicado || obsUpper.includes('INGRESANTE');
      if (row && isIng && row.CarreraIngreso) {
        const esc = row.CarreraIngreso;
        if (!ingresantesPorEscuela[esc]) {
          ingresantesPorEscuela[esc] = [];
        }
        ingresantesPorEscuela[esc].push(row);
      }
    });
    // Calcular la posición local en cada escuela
    Object.keys(ingresantesPorEscuela).forEach(escCode => {
      const list = ingresantesPorEscuela[escCode];
      
      const isAdjRow = (r: any) => Boolean(r.isAdjudicado || (r.OBSERVACION || '').toUpperCase().includes('ADJUDICA'));
      const isSoRow = (r: any) => !isAdjRow(r) && (r.OBSERVACION || '').toUpperCase().includes('S.O.');

      // Separar primera opción / regular, segunda opción y adjudicación
      const regular = list.filter(r => !isAdjRow(r) && !isSoRow(r));
      const so = list.filter(r => isSoRow(r));
      const adj = list.filter(r => isAdjRow(r));

      // Ordenar por nota descendente. En caso de empate, por puesto original o nombre
      const sortFn = (a: any, b: any) => {
        const notaA = parseFloat(a.Nota) || 0;
        const notaB = parseFloat(b.Nota) || 0;
        if (notaB !== notaA) return notaB - notaA;
        
        const posA = parseInt(a.POS) || 9999;
        const posB = parseInt(b.POS) || 9999;
        if (posA !== posB) return posA - posB;
        
        return (a.nombre || '').localeCompare(b.nombre || '');
      };
      regular.sort(sortFn);
      so.sort(sortFn);
      adj.sort(sortFn);

      let maxDirectPos = regular.length + so.length;
      const combinedDirect = [...regular, ...so];
      combinedDirect.forEach((row, index) => {
        const doc = String(row.NroDocumento || row.alumno || row.dni || '').trim();
        const parsedPos = parseInt(row.POS) || 0;
        if (parsedPos > maxDirectPos) {
          maxDirectPos = parsedPos;
        }
        if (doc) {
          const key = `${doc}_${escCode}`;
          map[key] = parsedPos > 0 ? parsedPos : (index + 1);
        }
      });

      // Para los adjudicados, el número de orden de mérito continúa a partir del último que ingresó
      adj.forEach((row, index) => {
        const doc = String(row.NroDocumento || row.alumno || row.dni || '').trim();
        if (doc) {
          const key = `${doc}_${escCode}`;
          map[key] = maxDirectPos + index + 1;
        }
      });
    });
    return map;
  }, [normalizedCsvData]);

  // --- Dynamic Dashboard & Analytical Calculations ---
  const sexData = useMemo(() => {
    let masc = 0;
    let fem = 0;
    let unknown = 0;
    normalizedCsvData.forEach(row => {
      const sexVal = getRowValue(row, ['Sexo', 'sexo', 'SEXO', 'genero', 'Genero', 'GENERO', 'sex', 'Sex', 'SEX']).toUpperCase().trim();
      if (sexVal.startsWith('M') && !sexVal.startsWith('F')) {
        masc++;
      } else if (sexVal.startsWith('F') || sexVal.startsWith('FEM')) {
        fem++;
      } else {
        unknown++;
      }
    });
    const total = masc + fem + unknown;
    return {
      masculino: masc,
      femenino: fem,
      desconocido: unknown,
      total,
      chartData: [
        { name: 'Masculino', value: masc, pct: total > 0 ? ((masc / total) * 100).toFixed(1) : '0' },
        { name: 'Femenino', value: fem, pct: total > 0 ? ((fem / total) * 100).toFixed(1) : '0' },
        ...(unknown > 0 ? [{ name: 'No especificado', value: unknown, pct: total > 0 ? ((unknown / total) * 100).toFixed(1) : '0' }] : [])
      ]
    };
  }, [normalizedCsvData]);

  const ageData = useMemo(() => {
    let under17 = 0;
    let age17_18 = 0;
    let age19_20 = 0;
    let age21_22 = 0;
    let age23_25 = 0;
    let over25 = 0;
    let unknown = 0;

    normalizedCsvData.forEach(row => {
      let ageNum = NaN;
      const ageStr = getRowValue(row, ['Edad', 'edad', 'EDAD', 'age', 'Age', 'AGE']);
      if (ageStr) {
        ageNum = parseInt(ageStr, 10);
      }
      
      if (isNaN(ageNum) || ageNum < 10 || ageNum > 100) {
        const birthStr = getRowValue(row, ['FechaNacimiento', 'f_nac', 'fecha_nac', 'nacimiento', 'FECHA_NAC', 'FECHANAC', 'BirthDate', 'birth_date']);
        if (birthStr) {
          const match = birthStr.match(/\b(19\d\d|20[0-2]\d)\b/);
          if (match) {
            const birthYear = parseInt(match[1], 10);
            ageNum = 2026 - birthYear;
          }
        }
      }

      if (isNaN(ageNum) || ageNum < 10 || ageNum > 100) {
        unknown++;
      } else if (ageNum < 17) {
        under17++;
      } else if (ageNum <= 18) {
        age17_18++;
      } else if (ageNum <= 20) {
        age19_20++;
      } else if (ageNum <= 22) {
        age21_22++;
      } else if (ageNum <= 25) {
        age23_25++;
      } else {
        over25++;
      }
    });

    const total = normalizedCsvData.length;
    const validTotal = total - unknown;

    return {
      chartData: [
        { range: '< 17 años', cantidad: under17 },
        { range: '17 - 18 años', cantidad: age17_18 },
        { range: '19 - 20 años', cantidad: age19_20 },
        { range: '21 - 22 años', cantidad: age21_22 },
        { range: '23 - 25 años', cantidad: age23_25 },
        { range: '> 25 años', cantidad: over25 }
      ],
      unknown,
      validTotal
    };
  }, [normalizedCsvData]);

  const ageLineData = useMemo(() => {
    const counts: Record<number, { postulantes: number; ingresantes: number }> = {};
    let sum = 0;
    let count = 0;
    
    normalizedCsvData.forEach(row => {
      let ageNum = NaN;
      const ageStr = getRowValue(row, ['Edad', 'edad', 'EDAD', 'age', 'Age', 'AGE']);
      if (ageStr) {
        ageNum = parseInt(ageStr, 10);
      }
      
      if (isNaN(ageNum) || ageNum < 10 || ageNum > 100) {
        const birthStr = getRowValue(row, ['FechaNacimiento', 'f_nac', 'fecha_nac', 'nacimiento', 'FECHA_NAC', 'FECHANAC', 'BirthDate', 'birth_date']);
        if (birthStr) {
          const match = birthStr.match(/\b(19\d\d|20[0-2]\d)\b/);
          if (match) {
            const birthYear = parseInt(match[1], 10);
            ageNum = 2026 - birthYear;
          }
        }
      }

      if (!isNaN(ageNum) && ageNum >= 10 && ageNum <= 90) {
        sum += ageNum;
        count++;
        if (!counts[ageNum]) {
          counts[ageNum] = { postulantes: 0, ingresantes: 0 };
        }
        counts[ageNum].postulantes++;
        if (row.OBSERVACION?.toUpperCase().includes('INGRESANTE')) {
          counts[ageNum].ingresantes++;
        }
      }
    });

    const ages = Object.keys(counts).map(Number).sort((a, b) => a - b);
    if (ages.length === 0) return { chartData: [], average: '0.0' };

    const minAge = Math.max(13, Math.min(...ages));
    const maxAge = Math.min(60, Math.max(...ages));
    
    const chartData = [];
    for (let a = minAge; a <= maxAge; a++) {
      chartData.push({
        edad: a,
        postulantes: counts[a]?.postulantes || 0,
        ingresantes: counts[a]?.ingresantes || 0
      });
    }

    const average = count > 0 ? (sum / count).toFixed(1) : '0.0';

    return {
      chartData,
      average
    };
  }, [normalizedCsvData]);

  const schoolOriginsData = useMemo(() => {
    const schoolCounts: Record<string, { total: number, admitted: number, code: string, areas: Record<string, { total: number, admitted: number }> }> = {};
    normalizedCsvData.forEach(row => {
      const originalRow = row._raw || row;
      let schVal = getRowValue(originalRow, ['nombrecolegio', 'colegio', 'COLEGIO', 'Colegio', 'colegio_origen', 'COLEGIO_ORIGEN', 'institucion', 'IE', 'I.E.', 'nombre_ie']);
      let schCode = getRowValue(originalRow, ['cod_colegio', 'codigo_colegio', 'COD_COLEGIO', 'CODIGO_COLEGIO', 'cod_modular', 'cod_mod']);
      
      if (!schCode) {
        const potentialCode = getRowValue(originalRow, ['colegio', 'COLEGIO', 'Colegio']);
        if (potentialCode && potentialCode !== schVal) {
          schCode = potentialCode;
        }
      }
      
      if (!schVal && schCode) {
        schVal = `IE COD. ${schCode}`;
      } else if (!schVal) {
        schVal = 'NO ESPECIFICADO';
      } else {
        schVal = schVal.toUpperCase().replace(/\s+/g, ' ').trim();
      }
      
      const key = schCode ? `${schCode} - ${schVal}` : schVal;
      
      if (!schoolCounts[key]) {
        schoolCounts[key] = { 
          total: 0, 
          admitted: 0, 
          code: schCode,
          areas: {}
        };
      }
      
      schoolCounts[key].total++;
      
      // Obtener el área del postulante (A, B, C, D)
      const area = row.grupo || 'SIN ÁREA';
      if (!schoolCounts[key].areas[area]) {
        schoolCounts[key].areas[area] = { total: 0, admitted: 0 };
      }
      schoolCounts[key].areas[area].total++;
      if (row.OBSERVACION?.toUpperCase().includes('INGRESANTE')) {
        schoolCounts[key].admitted++;
        schoolCounts[key].areas[area].admitted++;
      }
    });
    return Object.entries(schoolCounts)
      .map(([name, stats]) => ({
        name,
        code: stats.code,
        total: stats.total,
        admitted: stats.admitted,
        ratio: stats.total > 0 ? ((stats.admitted / stats.total) * 100).toFixed(1) : '0',
        areas: stats.areas
      }))
      .sort((a, b) => b.total - a.total);
  }, [normalizedCsvData]);

  const resolvedGeoData = useMemo(() => {
    return normalizedCsvData.map(row => {
      const geo = getGeographicInfo(row);
      return {
        ...row,
        _geoCode: geo.code,
        _departamento: geo.departamento.toUpperCase().trim(),
        _provincia: geo.provincia.toUpperCase().trim(),
        _distrito: geo.distrito.toUpperCase().trim()
      };
    });
  }, [normalizedCsvData, ubigeoMap]);

  const geoDeptsData = useMemo(() => {
    const counts: Record<string, number> = {};
    resolvedGeoData.forEach(row => {
      const key = row._departamento || 'NO ESPECIFICADO';
      counts[key] = (counts[key] || 0) + 1;
    });
    const total = resolvedGeoData.length;
    return Object.entries(counts)
      .map(([name, value]) => ({
        name,
        value,
        pct: total > 0 ? ((value / total) * 100).toFixed(1) : '0'
      }))
      .sort((a, b) => b.value - a.value);
  }, [resolvedGeoData]);

  const geoProvsData = useMemo(() => {
    const counts: Record<string, number> = {};
    resolvedGeoData.forEach(row => {
      const key = row._provincia || 'NO ESPECIFICADO';
      counts[key] = (counts[key] || 0) + 1;
    });
    const total = resolvedGeoData.length;
    return Object.entries(counts)
      .map(([name, value]) => ({
        name,
        value,
        pct: total > 0 ? ((value / total) * 100).toFixed(1) : '0'
      }))
      .sort((a, b) => b.value - a.value);
  }, [resolvedGeoData]);

  const geoDistsData = useMemo(() => {
    const counts: Record<string, number> = {};
    resolvedGeoData.forEach(row => {
      const key = row._distrito || 'NO ESPECIFICADO';
      counts[key] = (counts[key] || 0) + 1;
    });
    const total = resolvedGeoData.length;
    return Object.entries(counts)
      .map(([name, value]) => ({
        name,
        value,
        pct: total > 0 ? ((value / total) * 100).toFixed(1) : '0'
      }))
      .sort((a, b) => b.value - a.value);
  }, [resolvedGeoData]);

  const unmatchedUbigeos = useMemo(() => {
    const counts: Record<string, number> = {};
    normalizedCsvData.forEach(row => {
      let code = getRowValue(row, [
        'Ubigeo_Domicilio_Actual', 'ubigeo_domicilio', 'UBIGEO_DOMICILIO',
        'ubigeo_domicilio_actual', 'UBIGEO_DOMICILIO_ACTUAL',
        'LugarNacimiento', 'lugar_nac', 'LUGAR_NAC',
        'ubigeo', 'Ubigeo', 'UBIGEO', 'codigo_ubigeo', 'COD_UBIGEO', 'ubigeo_procedencia'
      ]);
      const clean = cleanUbigeoCode(code);
      if (clean) {
        let hasMatch = !!ubigeoMap[clean];
        if (!hasMatch) {
          const reniecCode = convertIneiToReniec(clean);
          hasMatch = !!ubigeoMap[reniecCode] || (reniecCode.startsWith('0') && !!ubigeoMap[reniecCode.slice(1)]);
        }
        if (!hasMatch) {
          counts[clean] = (counts[clean] || 0) + 1;
        }
      } else {
        counts['VACÍO / NO ENCONTRADO'] = (counts['VACÍO / NO ENCONTRADO'] || 0) + 1;
      }
    });
    return Object.entries(counts)
      .map(([code, count]) => ({ code, count }))
      .sort((a, b) => b.count - a.count);
  }, [normalizedCsvData, ubigeoMap]);

  const geoDepartments = useMemo(() => {
    const depts = new Set<string>();
    resolvedGeoData.forEach(row => {
      if (row._departamento && row._departamento !== 'NO ESPECIFICADO') {
        depts.add(row._departamento);
      }
    });
    return ['Todos', ...Array.from(depts).sort()];
  }, [resolvedGeoData]);

  const geoProvinces = useMemo(() => {
    const provs = new Set<string>();
    resolvedGeoData.forEach(row => {
      const matchDept = geoFilterDept === 'Todos' || row._departamento === geoFilterDept;
      if (matchDept && row._provincia && row._provincia !== 'NO ESPECIFICADO') {
        provs.add(row._provincia);
      }
    });
    return ['Todas', ...Array.from(provs).sort()];
  }, [resolvedGeoData, geoFilterDept]);

  const geographicData = useMemo(() => {
    const filteredRows = resolvedGeoData.filter(row => {
      const matchDept = geoFilterDept === 'Todos' || row._departamento === geoFilterDept;
      const matchProv = geoFilterProv === 'Todas' || row._provincia === geoFilterProv;
      return matchDept && matchProv;
    });

    const counts: Record<string, number> = {};
    filteredRows.forEach(row => {
      let key = 'NO ESPECIFICADO';
      if (geoViewLevel === 'departamento') {
        key = row._departamento;
      } else if (geoViewLevel === 'provincia') {
        key = row._provincia;
      } else {
        key = row._distrito;
      }
      if (!key) key = 'NO ESPECIFICADO';
      counts[key] = (counts[key] || 0) + 1;
    });

    const total = filteredRows.length;

    return Object.entries(counts)
      .map(([name, count]) => ({
        name,
        value: count,
        pct: total > 0 ? ((count / total) * 100).toFixed(1) : '0'
      }))
      .sort((a, b) => b.value - a.value);
  }, [resolvedGeoData, geoViewLevel, geoFilterDept, geoFilterProv]);

  const gradeStats = useMemo(() => {
    let sum = 0;
    let count = 0;
    let max = -1;
    let min = 999;
    
    let p_0_5 = 0, i_0_5 = 0;
    let p_5_9 = 0, i_5_9 = 0;
    let p_9_11 = 0, i_9_11 = 0;
    let p_11_14 = 0, i_11_14 = 0;
    let p_14_17 = 0, i_14_17 = 0;
    let p_17_20 = 0, i_17_20 = 0;

    normalizedCsvData.forEach(row => {
      const notaVal = parseFloat(row.Nota);
      if (!isNaN(notaVal) && notaVal > 0) { // Exclude 0/absentees as requested
        sum += notaVal;
        count++;
        if (notaVal > max) max = notaVal;
        if (notaVal < min) min = notaVal;

        const isIngresante = row.OBSERVACION?.toUpperCase().includes('INGRESANTE');

        if (notaVal < 5) {
          p_0_5++;
          if (isIngresante) i_0_5++;
        } else if (notaVal < 9) {
          p_5_9++;
          if (isIngresante) i_5_9++;
        } else if (notaVal < 11) {
          p_9_11++;
          if (isIngresante) i_9_11++;
        } else if (notaVal < 14) {
          p_11_14++;
          if (isIngresante) i_11_14++;
        } else if (notaVal < 17) {
          p_14_17++;
          if (isIngresante) i_14_17++;
        } else {
          p_17_20++;
          if (isIngresante) i_17_20++;
        }
      }
    });

    const avg = count > 0 ? (sum / count).toFixed(2) : '0.00';
    const actualMin = min === 999 ? '0.00' : min.toFixed(2);
    const actualMax = max === -1 ? '0.00' : max.toFixed(2);

    return {
      avg,
      min: actualMin,
      max: actualMax,
      count,
      chartData: [
        { range: '0.1 - 4.9', postulantes: p_0_5, ingresantes: i_0_5 },
        { range: '5.0 - 8.9', postulantes: p_5_9, ingresantes: i_5_9 },
        { range: '9.0 - 10.9', postulantes: p_9_11, ingresantes: i_9_11 },
        { range: '11.0 - 13.9', postulantes: p_11_14, ingresantes: i_11_14 },
        { range: '14.0 - 16.9', postulantes: p_14_17, ingresantes: i_14_17 },
        { range: '17.0 - 20.0', postulantes: p_17_20, ingresantes: i_17_20 }
      ]
    };
  }, [normalizedCsvData]);

  // --- Analytics for Pagos y Validaciones por Fecha y Hora ---
  const temporalAnalytics = useMemo(() => {
    const pagosByDate: Record<string, number> = {};
    const pagosByHour: number[] = Array(24).fill(0);
    let totalPagos = 0;

    (pagosData || []).forEach(p => {
      const dateStr = String(p.fecha_pago || p.FechaPago || '').trim();
      if (!dateStr) return;
      
      const datePart = dateStr.split(' ')[0] || dateStr.split('T')[0];
      if (datePart && /^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
        pagosByDate[datePart] = (pagosByDate[datePart] || 0) + 1;
        totalPagos++;
      }

      const timePart = dateStr.split(' ')[1] || dateStr.split('T')[1] || '';
      if (timePart) {
        const hour = parseInt(timePart.split(':')[0], 10);
        if (!isNaN(hour) && hour >= 0 && hour < 24) {
          pagosByHour[hour]++;
        }
      }
    });

    const validacionesByDate: Record<string, number> = {};
    const validacionesByHour: number[] = Array(24).fill(0);
    let totalValidaciones = 0;

    (validacionesData || []).forEach(v => {
      const dateStr = String(v.fecha_validacion || v.fecha_subida || v.FechaValidacion || '').trim();
      if (!dateStr) return;

      const datePart = dateStr.split(' ')[0] || dateStr.split('T')[0];
      if (datePart && /^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
        validacionesByDate[datePart] = (validacionesByDate[datePart] || 0) + 1;
        totalValidaciones++;
      }

      const timePart = dateStr.split(' ')[1] || dateStr.split('T')[1] || '';
      if (timePart) {
        const hour = parseInt(timePart.split(':')[0], 10);
        if (!isNaN(hour) && hour >= 0 && hour < 24) {
          validacionesByHour[hour]++;
        }
      }
    });

    const allDates = Array.from(new Set([...Object.keys(pagosByDate), ...Object.keys(validacionesByDate)])).sort();

    const daysData = allDates.map(dateKey => {
      const pagosCount = pagosByDate[dateKey] || 0;
      const validacionesCount = validacionesByDate[dateKey] || 0;

      const [year, month, day] = dateKey.split('-');
      const d = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
      const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
      const dayNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
      
      const dayName = !isNaN(d.getTime()) ? dayNames[d.getDay()] : '';
      const formattedLabel = !isNaN(d.getTime()) ? `${dayName} ${day}/${month}` : dateKey;
      const fullFormattedDate = !isNaN(d.getTime()) ? `${day}/${month}/${year}` : dateKey;

      return {
        dateKey,
        fullFormattedDate,
        dayName,
        label: formattedLabel,
        pagos: pagosCount,
        validaciones: validacionesCount,
        pagosPct: totalPagos > 0 ? parseFloat(((pagosCount / totalPagos) * 100).toFixed(1)) : 0,
        validacionesPct: totalValidaciones > 0 ? parseFloat(((validacionesCount / totalValidaciones) * 100).toFixed(1)) : 0,
      };
    });

    let peakPagoDay = { label: '--', count: 0, dateKey: '' };
    let peakValidacionDay = { label: '--', count: 0, dateKey: '' };

    daysData.forEach(d => {
      if (d.pagos > peakPagoDay.count) {
        peakPagoDay = { label: d.fullFormattedDate, count: d.pagos, dateKey: d.dateKey };
      }
      if (d.validaciones > peakValidacionDay.count) {
        peakValidacionDay = { label: d.fullFormattedDate, count: d.validaciones, dateKey: d.dateKey };
      }
    });

    const hoursData = Array.from({ length: 24 }, (_, h) => {
      const hourStr = `${String(h).padStart(2, '0')}:00`;
      const pCount = pagosByHour[h];
      const vCount = validacionesByHour[h];
      return {
        hour: hourStr,
        hourNum: h,
        pagos: pCount,
        validaciones: vCount,
      };
    });

    let peakPagoHour = { hour: '--', count: 0 };
    let peakValidacionHour = { hour: '--', count: 0 };
    hoursData.forEach(h => {
      if (h.pagos > peakPagoHour.count) {
        peakPagoHour = { hour: `${h.hour} - ${String(h.hourNum + 1).padStart(2, '0')}:00`, count: h.pagos };
      }
      if (h.validaciones > peakValidacionHour.count) {
        peakValidacionHour = { hour: `${h.hour} - ${String(h.hourNum + 1).padStart(2, '0')}:00`, count: h.validaciones };
      }
    });

    return {
      totalPagos,
      totalValidaciones,
      daysData,
      hoursData,
      peakPagoDay,
      peakValidacionDay,
      peakPagoHour,
      peakValidacionHour
    };
  }, [pagosData, validacionesData]);

  const schoolsApplicantsData = useMemo(() => {
    let list = coberturaRows.map(item => ({
      code: item.schoolCode,
      name: item.schoolName,
      area: item.area,
      total: item.applicants,
      admitted: item.admitted,
      ratio: item.ratio,
      vacancies: item.vacancies
    }));
    // Apply area filter
    if (schoolsFilterArea !== 'Todas las Áreas') {
      const areaClean = schoolsFilterArea.replace('Área ', '');
      list = list.filter(item => item.area === areaClean);
    }
    // Apply vacancy filter
    if (schoolsFilterVacancies === 'con-vacantes') {
      list = list.filter(item => item.vacancies > 0);
    } else if (schoolsFilterVacancies === 'sin-vacantes') {
      list = list.filter(item => item.vacancies === 0);
    }
    // Apply search query filter
    if (schoolsSearchQuery.trim() !== '') {
      const q = schoolsSearchQuery.toLowerCase().trim();
      list = list.filter(item => 
        item.name.toLowerCase().includes(q) || 
        item.code.toLowerCase().includes(q)
      );
    }
    // Apply sorting
    list.sort((a, b) => {
      if (schoolsSortBy === 'postulantes-desc') {
        return b.total - a.total;
      }
      if (schoolsSortBy === 'postulantes-asc') {
        return a.total - b.total;
      }
      if (schoolsSortBy === 'ingresantes-desc') {
        return b.admitted - a.admitted;
      }
      if (schoolsSortBy === 'vacantes-desc') {
        return b.vacancies - a.vacancies;
      }
      if (schoolsSortBy === 'ratio-desc') {
        const rA = a.ratio === '—' ? -1 : parseFloat(a.ratio) || 0;
        const rB = b.ratio === '—' ? -1 : parseFloat(b.ratio) || 0;
        return rB - rA;
      }
      if (schoolsSortBy === 'tasa-desc') {
        const tA = a.total > 0 ? (a.admitted / a.total) : 0;
        const tB = b.total > 0 ? (b.admitted / b.total) : 0;
        return tB - tA;
      }
      if (schoolsSortBy === 'nombre-asc') {
        return a.name.localeCompare(b.name);
      }
      return b.total - a.total;
    });
    return list;
  }, [
    coberturaRows,
    schoolsSearchQuery,
    schoolsSortBy,
    schoolsFilterVacancies,
    schoolsFilterArea
  ]);

  // Group the sorted schoolsApplicantsData by area
  const groupedSchoolsApplicantsData = useMemo(() => {
    const groups: Record<string, typeof schoolsApplicantsData> = {};
    
    schoolsApplicantsData.forEach(item => {
      const areaKey = item.area ? `Área ${item.area}` : 'SIN ÁREA';
      if (!groups[areaKey]) {
        groups[areaKey] = [];
      }
      groups[areaKey].push(item);
    });
    
    // Ordenar las áreas alfabéticamente (Área A, Área B, etc.)
    return Object.keys(groups).sort().reduce((acc, key) => {
      acc[key] = groups[key];
      return acc;
    }, {} as Record<string, typeof schoolsApplicantsData>);
  }, [schoolsApplicantsData]);

  const generateCompetitivityReport = () => {
    const doc = new jsPDF('p', 'mm', 'a4');
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 14;
    let y = margin;
    const currentMod = allModalidades.find(m => m.id === selectedModalidad) || modalidades.find(m => m.id === selectedModalidad);
    const modalidadName = currentMod ? currentMod.nombre : 'MODALIDAD NO SELECCIONADA';
    const fechaReporte = new Date().toLocaleDateString('es-PE', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    // Portada
    doc.setFillColor(16, 44, 87); // UNSAAC Navy Blue
    doc.rect(0, 0, pageWidth, 45, 'F');
    doc.setFillColor(212, 175, 55); // UNSAAC Gold
    doc.rect(0, 45, pageWidth, 3, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.text('UNIVERSIDAD NACIONAL DE', pageWidth / 2, 18, { align: 'center' });
    doc.text('SAN ANTONIO ABAD DEL CUSCO', pageWidth / 2, 28, { align: 'center' });
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('Dirección de Admisión - Oficina de Sistemas', pageWidth / 2, 38, { align: 'center' });
    y = 65;
    doc.setTextColor(16, 44, 87); // UNSAAC Navy Blue
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('REPORTE DE COMPETITIVIDAD Y SELECTIVIDAD', pageWidth / 2, y, { align: 'center' });
    y += 10;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(71, 85, 105);
    doc.text(`Modalidad: ${modalidadName}`, pageWidth / 2, y, { align: 'center' });
    y += 6;
    doc.text(`Generado: ${fechaReporte}`, pageWidth / 2, y, { align: 'center' });
    y += 10;
    doc.setDrawColor(212, 175, 55); // UNSAAC Gold
    doc.setLineWidth(0.5);
    doc.line(margin + 20, y, pageWidth - margin - 20, y);
    // 1. Resumen Ejecutivo
    y += 15;
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(16, 44, 87); // UNSAAC Navy Blue
    doc.text('1. RESUMEN EJECUTIVO', margin, y);
    y += 2;
    doc.setDrawColor(212, 175, 55); // UNSAAC Gold
    doc.setLineWidth(0.8);
    doc.line(margin, y, margin + 50, y);
    y += 8;
    const totalPostulantes = normalizedCsvData.length;
    const totalIngresantesDirectos = normalizedCsvData.filter(r => isAdmittedRow(r) && !r.isAdjudicado && !(r.OBSERVACION||'').toUpperCase().includes('ADJUDICA')).length;
    const totalIngresantesAdj = normalizedCsvData.filter(r => r.isAdjudicado || (r.OBSERVACION||'').toUpperCase().includes('ADJUDICA')).length;
    const totalIngresantes = normalizedCsvData.filter(r => isAdmittedRow(r)).length;
    const tasaGlobal = totalPostulantes > 0 ? ((totalIngresantes / totalPostulantes) * 100).toFixed(1) : '0.0';
    const boxW = (pageWidth - margin * 2 - 12) / 5;
    const metrics = [
      { l: 'Postulantes', v: String(totalPostulantes), c: [16, 44, 87] as [number, number, number] },
      { l: 'Ing. Directos', v: String(totalIngresantesDirectos), c: [16, 185, 129] as [number, number, number] },
      { l: 'Adjudicados', v: String(totalIngresantesAdj), c: [147, 51, 234] as [number, number, number] },
      { l: 'Ing. Totales', v: String(totalIngresantes), c: [79, 70, 229] as [number, number, number] },
      { l: 'Tasa Global', v: `${tasaGlobal}%`, c: [245, 158, 11] as [number, number, number] }
    ];
    metrics.forEach((m, idx) => {
      const bx = margin + idx * (boxW + 3);
      doc.setFillColor(248, 250, 252);
      doc.roundedRect(bx, y, boxW, 25, 2, 2, 'F');
      doc.setDrawColor(m.c[0], m.c[1], m.c[2]);
      doc.setLineWidth(0.8);
      doc.line(bx, y, bx + boxW, y);
      doc.setFontSize(7.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 116, 139);
      doc.text(m.l.toUpperCase(), bx + boxW / 2, y + 8, { align: 'center' });
      doc.setFontSize(13);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(m.c[0], m.c[1], m.c[2]);
      doc.text(m.v, bx + boxW / 2, y + 18, { align: 'center' });
    });
    y += 33;
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(71, 85, 105);
    doc.text(`Rango de Notas Registradas: Mínimo ${gradeStats.min} | Máximo ${gradeStats.max}`, margin, y);
    // 2. Género y Notas
    y += 12;
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(16, 44, 87); // UNSAAC Navy Blue
    doc.text('2. DISTRIBUCIÓN POR GÉNERO Y CALIFICACIONES', margin, y);
    y += 6;
    autoTable(doc, {
      startY: y,
      head: [['Género', 'Postulantes', 'Porcentaje']],
      body: sexData.chartData.map(item => [item.name, String(item.value), `${item.pct}%`]),
      styles: { fontSize: 8.5, cellPadding: 3.5 },
      headStyles: { fillColor: [16, 44, 87] }, // UNSAAC Navy Blue
      theme: 'grid',
      margin: { left: margin, right: margin }
    });
    y = (doc as any).lastAutoTable.finalY + 12;
    if (y > pageHeight - 80) { doc.addPage(); y = margin; }
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(16, 44, 87); // UNSAAC Navy Blue
    doc.text('3. DISTRIBUCIÓN DE NOTAS POR RANGOS', margin, y);
    y += 6;
    autoTable(doc, {
      startY: y,
      head: [['Rango de Notas', 'Postulantes', 'Ingresantes', 'Tasa de Ingreso']],
      body: gradeStats.chartData.map(item => [
        item.range,
        String(item.postulantes),
        String(item.ingresantes),
        item.postulantes > 0 ? `${((item.ingresantes / item.postulantes) * 100).toFixed(1)}%` : '0.0%'
      ]),
      styles: { fontSize: 8.5, cellPadding: 3 },
      headStyles: { fillColor: [16, 44, 87] }, // UNSAAC Navy Blue
      theme: 'grid',
      margin: { left: margin, right: margin }
    });
    // 4. Geografía
    y = (doc as any).lastAutoTable.finalY + 12;
    if (y > pageHeight - 90) { doc.addPage(); y = margin; }
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(16, 44, 87); // UNSAAC Navy Blue
    doc.text('4. GEOGRAFÍA DE ORIGEN (TOP 5)', margin, y);
    y += 6;
    const geoDataRows = [];
    const maxGeo = Math.max(geoDeptsData.length, geoProvsData.length, geoDistsData.length);
    for (let i = 0; i < Math.min(maxGeo, 5); i++) {
      geoDataRows.push([
        geoDeptsData[i] ? `${geoDeptsData[i].name} (${geoDeptsData[i].value} / ${geoDeptsData[i].pct}%)` : '—',
        geoProvsData[i] ? `${geoProvsData[i].name} (${geoProvsData[i].value} / ${geoProvsData[i].pct}%)` : '—',
        geoDistsData[i] ? `${geoDistsData[i].name} (${geoDistsData[i].value} / ${geoDistsData[i].pct}%)` : '—'
      ]);
    }
    autoTable(doc, {
      startY: y,
      head: [['Departamento', 'Provincia', 'Distrito']],
      body: geoDataRows,
      styles: { fontSize: 8, cellPadding: 3.5 },
      headStyles: { fillColor: [16, 44, 87] }, // UNSAAC Navy Blue
      theme: 'grid',
      margin: { left: margin, right: margin }
    });
    // 5. Colegios con desglose por Áreas en el PDF
    y = (doc as any).lastAutoTable.finalY + 12;
    if (y > pageHeight - 90) { doc.addPage(); y = margin; }
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(16, 44, 87); // UNSAAC Navy Blue
    doc.text('5. TOP 10 COLEGIOS DE PROCEDENCIA CON DESGLOSE POR ÁREA', margin, y);
    y += 2;
    doc.setDrawColor(212, 175, 55); // UNSAAC Gold
    doc.line(margin, y, margin + 80, y);
    y += 6;
    // Estructurar filas de colegios + áreas
    const schoolReportRows: any[] = [];
    schoolOriginsData.slice(0, 10).forEach((school, idx) => {
      // Fila principal del colegio
      schoolReportRows.push([
        String(idx + 1),
        school.name,
        String(school.total),
        String(school.admitted),
        `${school.ratio}%`,
        'GLOBAL'
      ]);
      // Filas secundarias para cada área que tenga postulantes
      Object.entries(school.areas)
        .sort(([a], [b]) => a.localeCompare(b))
        .forEach(([area, stats]: [string, any]) => {
          const areaRatio = stats.total > 0 ? ((stats.admitted / stats.total) * 100).toFixed(0) : '0';
          schoolReportRows.push([
            '',
            `   ↳ Área Académica ${area}`,
            String(stats.total),
            String(stats.admitted),
            `${areaRatio}%`,
            'DETALLE'
          ]);
        });
    });
    autoTable(doc, {
      startY: y,
      head: [['N°', 'Colegio / Área', 'Postulantes', 'Ingresantes', 'Éxito', 'Tipo']],
      body: schoolReportRows,
      styles: { fontSize: 7.5, cellPadding: 2 },
      headStyles: { fillColor: [16, 44, 87] }, // UNSAAC Navy Blue
      columnStyles: {
        0: { halign: 'center', cellWidth: 8 },
        1: { cellWidth: 105 },
        2: { halign: 'center', cellWidth: 20 },
        3: { halign: 'center', cellWidth: 20 },
        4: { halign: 'center', cellWidth: 15 }
      },
      // Filtrar la columna 'Tipo' y dar formato especial a las subfilas de desglose
      didParseCell: (data) => {
        if (data.column.index === 5) {
          data.cell.text = []; // ocultar la columna tipo
        }
        if (data.section === 'body') {
          const rowType = data.row.raw[5];
          if (rowType === 'DETALLE') {
            data.cell.styles.fillColor = [248, 250, 252]; // slate-50
            data.cell.styles.textColor = [100, 116, 139]; // slate-500
            if (data.column.index === 1) {
              data.cell.styles.fontStyle = 'italic';
            }
          } else {
            data.cell.styles.fontStyle = 'bold';
            data.cell.styles.textColor = [16, 44, 87]; // UNSAAC Navy Blue
          }
        }
      },
      theme: 'grid',
      margin: { left: margin, right: margin }
    });
    // 6. Detalle Completo por Escuelas Profesional
    y = (doc as any).lastAutoTable.finalY + 12;
    if (y > pageHeight - 50) { doc.addPage(); y = margin; }
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(16, 44, 87); // UNSAAC Navy Blue
    doc.text('6. ANÁLISIS DE COMPETITIVIDAD Y SELECTIVIDAD POR ESCUELA', margin, y);
    y += 8;
    const areaGroups: Record<string, typeof coberturaRows> = {};
    coberturaRows.forEach(item => {
      const areaKey = item.area ? `Área ${item.area}` : 'SIN ÁREA';
      if (!areaGroups[areaKey]) areaGroups[areaKey] = [];
      areaGroups[areaKey].push(item);
    });
    Object.entries(areaGroups).sort(([a], [b]) => a.localeCompare(b)).forEach(([areaName, items]) => {
      if (y > pageHeight - 40) { doc.addPage(); y = margin; }
      doc.setFillColor(241, 245, 249);
      doc.rect(margin, y - 3, pageWidth - margin * 2, 7, 'F');
      doc.setFontSize(8.5);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(16, 44, 87); // UNSAAC Navy Blue
      doc.text(`${areaName} (${items.length} escuelas profesionales)`, margin + 3, y + 2);
      y += 6;
      autoTable(doc, {
        startY: y,
        head: [['Carrera Profesional', 'Cód.', 'Vacantes', 'Postulantes', 'Ing. Dir.', 'Adjud.', 'Total Ing.', 'Ratio', 'Tasa']],
        body: items.map(item => [
          item.schoolName,
          item.schoolCode,
          String(item.vacancies),
          String(item.applicants),
          String(item.admittedDirect || 0),
          String(item.admittedAdj || 0),
          String(item.admitted),
          item.ratio === '—' ? '—' : `${item.ratio} p/v`,
          `${item.admissionRate}%`
        ]),
        styles: { fontSize: 6.5, cellPadding: 1.8 },
        headStyles: { fillColor: [16, 44, 87] }, // UNSAAC Navy Blue
        columnStyles: {
          0: { fontStyle: 'bold', cellWidth: 55 },
          1: { halign: 'center', cellWidth: 10 },
          2: { halign: 'center', cellWidth: 14 },
          3: { halign: 'center', cellWidth: 16 },
          4: { halign: 'center', cellWidth: 14 },
          5: { halign: 'center', cellWidth: 12 },
          6: { halign: 'center', cellWidth: 14 },
          7: { halign: 'center', cellWidth: 14 },
          8: { halign: 'center', cellWidth: 14 }
        },
        theme: 'grid',
        margin: { left: margin, right: margin }
      });
      y = (doc as any).lastAutoTable.finalY + 8;
    });
    // 7. Consolidado por Áreas
    if (y > pageHeight - 65) { doc.addPage(); y = margin; }
    y += 4;
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(16, 44, 87); // UNSAAC Navy Blue
    doc.text('7. CONSOLIDADO RESUMEN POR ÁREAS ACADÉMICAS', margin, y);
    y += 6;
    const areaSummary = Object.entries(areaGroups).sort(([a], [b]) => a.localeCompare(b)).map(([areaName, items]) => {
      const totalVac = items.reduce((sum, i) => sum + i.vacancies, 0);
      const totalApp = items.reduce((sum, i) => sum + i.applicants, 0);
      const totalAdm = items.reduce((sum, i) => sum + i.admitted, 0);
      const ratio = totalVac > 0 ? (totalApp / totalVac).toFixed(1) : '—';
      const tasa = totalApp > 0 ? ((totalAdm / totalApp) * 100).toFixed(1) : '0.0';
      return [areaName, String(items.length), String(totalVac), String(totalApp), String(totalAdm), ratio, `${tasa}%`];
    });
    // Añadir total general
    const grandVac = coberturaRows.reduce((sum, i) => sum + i.vacancies, 0);
    const grandApp = coberturaRows.reduce((sum, i) => sum + i.applicants, 0);
    const grandAdm = coberturaRows.reduce((sum, i) => sum + i.admitted, 0);
    const grandRatio = grandVac > 0 ? (grandApp / grandVac).toFixed(1) : '—';
    const grandTasa = grandApp > 0 ? ((grandAdm / grandApp) * 100).toFixed(1) : '0.0';
    areaSummary.push(['TOTAL GENERAL', String(coberturaRows.length), String(grandVac), String(grandApp), String(grandAdm), grandRatio, `${grandTasa}%`]);
    autoTable(doc, {
      startY: y,
      head: [['Área Académica', 'Carreras', 'Vacantes', 'Postulantes', 'Ingresantes', 'Ratio', 'Tasa Gral.']],
      body: areaSummary,
      styles: { fontSize: 8.5, cellPadding: 3.5 },
      headStyles: { fillColor: [16, 44, 87] }, // UNSAAC Navy Blue
      columnStyles: {
        0: { fontStyle: 'bold' },
        1: { halign: 'center' },
        2: { halign: 'center' },
        3: { halign: 'center' },
        4: { halign: 'center' },
        5: { halign: 'center' },
        6: { halign: 'center' }
      },
      didParseCell: (data) => {
        if (data.section === 'body' && data.row.index === areaSummary.length - 1) {
          data.cell.styles.fillColor = [226, 232, 240];
          data.cell.styles.fontStyle = 'bold';
        }
      },
      theme: 'grid',
      margin: { left: margin, right: margin }
    });
    // Paginación y pie de página en cada hoja
    const totalPages = doc.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.3);
      doc.line(margin, pageHeight - 12, pageWidth - margin, pageHeight - 12);
      doc.setFontSize(7);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(148, 163, 184);
      doc.text('UNSAAC — Oficina de Dirección de Admisión | Módulo de Pre-Revisión Analítico', margin, pageHeight - 8);
      doc.text(`Página ${i} de ${totalPages}`, pageWidth - margin, pageHeight - 8, { align: 'right' });
    }
    const safeName = modalidadName.replace(/[^a-zA-Z0-9áéíóúÁÉÍÓÚñÑ\s-]/g, '').replace(/\s+/g, '_');
    doc.save(`Reporte_Competitividad_${safeName}_${new Date().getTime()}.pdf`);
  };

  const handleSyncParticipantesOmerito = async () => {
    setIsSyncing(true);
    setSyncProcessed(0);
    setSyncTotal(0);
    try {
      const ingresantes = normalizedCsvData.filter(row => row.OBSERVACION?.toUpperCase().includes('INGRESANTE'));
      
      if (ingresantes.length === 0) {
        notify?.('No se encontraron ingresantes en el archivo actual para sincronizar.', 'warning');
        setIsSyncing(false);
        return;
      }
      if (!window.confirm(`¿Sincronizar puestos (correlativos locales) en Supabase para los ${ingresantes.length} ingresantes de este proceso? Esto corregirá los registros guardados en la tabla 'participantes'.`)) {
        setIsSyncing(false);
        return;
      }

      setSyncTotal(ingresantes.length);

      // Estructurar el payload para enviar al backend
      const allUpdates = ingresantes.map(ing => {
        const key = `${ing.NroDocumento || ing.alumno}_${ing.CarreraIngreso}`;
        const localPuesto = localPuestosMap[key];
        return {
          dni: ing.NroDocumento || ing.alumno,
          omerito: localPuesto ? localPuesto.toString() : (ing.POS || ''),
          codigo_carrera: ing.CarreraIngreso,
          semestre: selectedSemestre
        };
      });

      // Procesar en lotes/chunks de 20 para mostrar progreso fluido y evitar timeouts
      const chunkSize = 20;
      let totalUpdatedCount = 0;

      for (let i = 0; i < allUpdates.length; i += chunkSize) {
        const chunk = allUpdates.slice(i, i + chunkSize);
        
        let chunkSuccess = false;
        try {
          const res = await fetch('/api/sync-participantes-omerito', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ updates: chunk })
          });
          if (res.ok) {
            const data = await res.json();
            if (data && data.success) {
              totalUpdatedCount += data.updatedCount || 0;
              chunkSuccess = true;
            }
          }
        } catch (e) {
          console.warn("API sync failed, falling back to direct Supabase updates:", e);
        }

        if (!chunkSuccess) {
          let cCount = 0;
          for (const item of chunk) {
            const { dni, omerito, codigo_carrera, semestre } = item;
            if (!dni || !omerito || !semestre) continue;
            const { error: upErr } = await supabaseAdmin
              .from('participantes')
              .update({
                OMERITO: omerito,
                codigo_carrera: codigo_carrera || null
              })
              .eq('CODPOSTULANTE', dni)
              .eq('SEMESTRE', semestre);
            if (!upErr) cCount++;
          }
          totalUpdatedCount += cCount;
        }

        setSyncProcessed(prev => Math.min(prev + chunk.length, ingresantes.length));
      }

      notify?.(`Se sincronizaron con éxito ${totalUpdatedCount} registros en la tabla de participantes.`, 'success');
    } catch (e: any) {
      console.error(e);
      notify?.(`Error en la sincronización: ${e.message}`, 'error');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleApproveAndMigrate = async () => {
    if (isFinalized) {
      notify?.("Este proceso ya ha sido aprobado y migrado permanentemente. No se puede volver a exportar.", "error");
      return;
    }
    setIsSaving(true);
    try {
      // Find the selected Cuadro to get Semestre and Anio
      const cuadro = cuadros.find(c => c.id === selectedCuadro);
      const modalidad = modalidades.find(m => m.id === selectedModalidad);
      
      if (!cuadro || !modalidad) {
         throw new Error("Debe seleccionar Cuadro y Modalidad");
      }
      // Validar si ya existen registros previos en adjudicacion_ranking para evitar sobreescribir accidentalmente
      const { data: existingRank } = await supabase
        .from('adjudicacion_ranking')
        .select('id')
        .eq('modalidad', modalidad.nombre)
        .limit(1);
      if (existingRank && existingRank.length > 0) {
        if (!window.confirm("¡ATENCIÓN! Ya existen datos de adjudicación para esta modalidad (asistencias o adjudicados registrados). Si continúas, SE BORRARÁ TODO EL PROGRESO de la ceremonia y se reiniciará el proceso. ¿Realmente deseas volver a exportar?")) {
          setIsSaving(false);
          return;
        }
      }
      // Limpiar datos previos en las tablas de adjudicación para evitar duplicaciones
      await supabase.from('adjudicacion_ranking').delete().eq('modalidad', modalidad.nombre);
      await supabase.from('adjudicacion_vacantes').delete().eq('modalidad', modalidad.nombre);
      // 1. Migrar Ranking a 'adjudicacion_ranking'
      if (rankingData.length > 0) {
        const rankingPayload = rankingData.map(row => ({
          orden_merito: row.orden_merito,
          dni: row.dni,
          nombre: row.nombre,
          area: row.area,
          nota: parseFloat(row.nota) || 0,
          modalidad: modalidad.nombre,
          estado_asistencia: false
        }));
        const { error: rankErr } = await supabase.from('adjudicacion_ranking').insert(rankingPayload);
        if (rankErr) throw new Error(`Error insertando ranking: ${rankErr.message}`);
      }
      // 2. Migrar Vacantes Sobrantes a 'adjudicacion_vacantes'
      const leftoverVacancies = coberturaRows.filter(row => row.difference > 0);
      if (leftoverVacancies.length > 0) {
        const vacanciesPayload = leftoverVacancies.map(row => ({
          escuela: row.schoolName,
          area: row.area,
          vacantes_totales: row.difference,
          vacantes_disponibles: row.difference,
          modalidad: modalidad.nombre
        }));
        const { error: vacErr } = await supabase.from('adjudicacion_vacantes').insert(vacanciesPayload);
        if (vacErr) throw new Error(`Error insertando vacantes sobrantes: ${vacErr.message}`);
      }
      notify?.('Ranking y vacantes exportados a Adjudicación exitosamente', 'success');
      clearData();
    } catch (error: any) {
      notify?.(`Error en exportación: ${error.message}`, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoadingConfig) {
    return (
      <div className="flex flex-col h-full bg-[#f8fafc]">
        <div className="p-6 border-b border-slate-200 bg-white">
          <div className="h-8 bg-slate-200 rounded-lg w-64 animate-pulse mb-2"></div>
          <div className="h-4 bg-slate-100 rounded-lg w-96 animate-pulse"></div>
        </div>
        <div className="flex-1 overflow-y-auto p-6 max-w-3xl mx-auto w-full space-y-6">
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-6">
            <div className="h-6 bg-slate-200 rounded w-48 animate-pulse mb-4"></div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[1, 2, 3].map(i => (
                <div key={i} className="space-y-2">
                  <div className="h-3 bg-slate-100 rounded w-16 animate-pulse"></div>
                  <div className="h-10 bg-slate-100 rounded-xl animate-pulse"></div>
                </div>
              ))}
            </div>
          </div>
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-4">
            <div className="h-6 bg-slate-200 rounded w-56 animate-pulse"></div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {[1, 2].map(i => (
                <div key={i} className="border border-slate-100 bg-slate-50/50 p-4 rounded-xl h-24 animate-pulse"></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-[#f8fafc] relative">
      {isFetchingPreRevision && (
        <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center z-50 transition-all duration-300">
          <div className="bg-white p-8 rounded-3xl shadow-xl max-w-md w-full mx-4 text-center border border-slate-100 flex flex-col items-center gap-5">
            <div className="relative flex items-center justify-center size-20">
              <div className="absolute inset-0 rounded-full border-4 border-slate-100 border-t-primary animate-spin"></div>
              <span className="material-symbols-outlined text-4xl text-primary animate-pulse">database</span>
            </div>
            <div>
              <h3 className="font-black text-slate-800 text-lg uppercase tracking-tight">Procesando Resultados</h3>
              <p className="text-sm text-slate-500 mt-2 font-semibold min-h-[40px] flex items-center justify-center px-4 bg-slate-50 rounded-xl py-2">
                {fetchingPreRevisionMessage || 'Estableciendo conexión...'}
              </p>
            </div>
            <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
              <div className="bg-primary h-full animate-pulse rounded-full" style={{ width: '100%' }}></div>
            </div>
          </div>
        </div>
      )}
      <div className="p-6 border-b border-slate-200 bg-white flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          {isLoaded && (
            <div className="mb-2">
              <button
                onClick={() => {
                  setSelectedModalidad('');
                  clearData();
                }}
                className="flex items-center gap-2 text-slate-500 hover:text-slate-900 font-bold text-sm transition-colors"
              >
                <span className="material-symbols-outlined text-[18px]">
                  arrow_back
                </span>
                Volver a la lista
              </button>
            </div>
          )}
          <h1 className="text-2xl font-black text-slate-800 uppercase tracking-tighter">
            {isLoaded && currentModalityName ? `PRE-REVISIÓN: ${currentModalityName}` : 'Pre-revisión de Ingresantes'}
          </h1>
          <p className="text-slate-500 text-sm mt-1 font-medium">Valide la cobertura de vacantes y cargue resultados antes de su migración oficial.</p>
        </div>
        
        {!isLoaded && (
          <button
            onClick={() => {
              setShowUploadModal(true);
              if (cuadros.length > 0 && !selectedCuadro) {
                const approved = cuadros.find(c => c.estado === 'Aprobado');
                if (approved) setSelectedCuadro(approved.id);
              }
            }}
            className="px-5 py-2.5 bg-primary hover:bg-primary-dark text-white rounded-xl font-black text-xs uppercase tracking-wider flex items-center gap-2 shadow-lg shadow-primary/20 hover:scale-[1.02] transition-all cursor-pointer w-fit shrink-0 self-start sm:self-center"
          >
            <span className="material-symbols-outlined text-sm">add_circle</span>
            Nueva Pre-Revisión
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        
        {/* Main List Section (Hidden if loaded) */}
        {!isLoaded && (
          <div className="space-y-8">
            {savedModalidadIds.length === 0 ? (
              <div className="text-center py-20 bg-white border border-slate-200 border-dashed rounded-3xl max-w-3xl mx-auto space-y-4">
                <span className="material-symbols-outlined text-5xl text-slate-300">
                  find_in_page
                </span>
                <h3 className="text-lg font-black text-slate-700 uppercase tracking-tight">Sin Pre-revisiones Activas</h3>
                <p className="text-slate-500 font-medium text-xs max-w-md mx-auto leading-relaxed">
                  No hay pre-revisiones de resultados guardadas en el sistema. Comience cargando una nueva pre-revisión de postulantes.
                </p>
                <button
                  onClick={() => {
                    setShowUploadModal(true);
                    if (cuadros.length > 0 && !selectedCuadro) {
                      const approved = cuadros.find(c => c.estado === 'Aprobado');
                      if (approved) setSelectedCuadro(approved.id);
                    }
                  }}
                  className="px-5 py-2.5 bg-primary hover:bg-primary-dark text-white rounded-xl font-black text-xs uppercase tracking-wider inline-flex items-center gap-2 shadow-lg shadow-primary/20 hover:scale-105 transition-all cursor-pointer"
                >
                  <span className="material-symbols-outlined text-sm">upload_file</span>
                  Cargar Nueva Pre-Revisión
                </button>
              </div>
            ) : (
              (() => {
                const grouped = getGroupedPreRevisions(savedModalidadIds, allModalidades, cuadros);
                return Object.keys(grouped)
                  .sort(sortYears)
                  .map((year) => (
                    <div key={year} className="bg-white p-8 rounded-3xl border border-slate-200/85 shadow-sm space-y-6 max-w-4xl mx-auto">
                      <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
                        <span className="material-symbols-outlined text-amber-500 text-2xl">
                          calendar_today
                        </span>
                        <h2 className="text-xl font-black text-slate-900 tracking-tight">
                          Año Académico: {year}
                        </h2>
                      </div>
                      
                      <div className="space-y-6">
                        {Object.keys(grouped[year])
                          .sort(sortSemesters)
                          .map((semester) => (
                            <div key={semester} className="space-y-3">
                              <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
                                {semester}
                              </h3>
                              
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {grouped[year][semester].map(({ id, modality, cuadro }) => {
                                  const isSelected = selectedModalidad === id;
                                  return (
                                    <button
                                      key={id}
                                      onClick={() => {
                                        setSelectedCuadro(modality.cuadro_id);
                                        setSelectedSemestre(modality.semestre);
                                        setSelectedModalidad(modality.id);
                                      }}
                                      className={`text-left p-5 rounded-2xl border transition-all flex flex-col justify-between h-full gap-4 hover:border-amber-500 hover:shadow-md ${
                                        isSelected 
                                          ? 'border-primary bg-blue-50/50' 
                                          : 'border-slate-200 bg-slate-50/50 hover:bg-white'
                                      } group`}
                                    >
                                      <div>
                                        <div className="flex items-center justify-between gap-2">
                                          <span className="inline-block bg-slate-200 text-slate-700 font-extrabold text-[9px] px-2.5 py-1 rounded-md uppercase tracking-wider">
                                            Año {cuadro ? cuadro.anio : '—'} • Sem. {modality.semestre}
                                          </span>
                                          <span className="flex items-center gap-1 text-[10px] font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md uppercase tracking-widest">
                                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> Guardado
                                          </span>
                                        </div>
                                        <h3 className="text-base font-black text-slate-800 mt-2.5 line-clamp-2 leading-snug group-hover:text-primary transition-colors">
                                          {modality.nombre}
                                        </h3>
                                      </div>
                                      <div className="flex items-center gap-1 text-primary text-xs font-black uppercase tracking-widest mt-1">
                                        <span className="material-symbols-outlined text-[16px]">arrow_circle_right</span>
                                        Ingresar a pre-revisión
                                      </div>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          ))}
                      </div>
                    </div>
                  ));
              })()
            )}
          </div>
        )}

        {/* Modal Overlay for upload settings */}
        {showUploadModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm overflow-y-auto">
            <div className="bg-white rounded-3xl max-w-2xl w-full shadow-2xl p-8 border border-slate-150 relative max-h-[90vh] overflow-y-auto my-8">
              {/* Close Button */}
              <button
                onClick={() => setShowUploadModal(false)}
                className="absolute top-5 right-5 text-slate-400 hover:text-slate-600 cursor-pointer size-8 rounded-full flex items-center justify-center hover:bg-slate-100 transition-colors"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
              
              <h2 className="text-lg font-black text-slate-900 uppercase tracking-tight border-b border-slate-100 pb-3 pr-8 flex items-center gap-2">
                <span className="material-symbols-outlined text-primary">upload_file</span>
                Nueva Carga de Pre-Revisión
              </h2>
              <p className="text-slate-500 font-bold text-xs mt-2 leading-relaxed">
                Configure los parámetros del año y semestre académico para habilitar la carga de postulantes en formato CSV.
              </p>

              <div className="mt-6 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Año (Cuadro Anual)</label>
                    <select 
                      className="w-full p-3 rounded-xl border border-slate-200 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary text-xs font-bold text-slate-700 bg-slate-50"
                      value={selectedCuadro}
                      onChange={(e) => {
                        setSelectedCuadro(e.target.value);
                        setSelectedSemestre('');
                        setSelectedModalidad('');
                      }}
                    >
                      <option value="">Seleccione el año</option>
                      {cuadros.filter(c => c.estado === 'Aprobado').map(c => (
                        <option key={c.id} value={c.id}>{c.anio} - {c.estado}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Semestre</label>
                    <select 
                      className="w-full p-3 rounded-xl border border-slate-200 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary text-xs font-bold text-slate-700 bg-slate-50 disabled:bg-slate-50 disabled:text-slate-400"
                      value={selectedSemestre}
                      onChange={(e) => {
                        setSelectedSemestre(e.target.value);
                        setSelectedModalidad('');
                      }}
                      disabled={!selectedCuadro}
                    >
                      <option value="">Seleccione el semestre</option>
                      {availableSemesters.map(s => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                  
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Modalidad</label>
                    <select 
                      className="w-full p-3 rounded-xl border border-slate-200 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary text-xs font-bold text-slate-700 bg-slate-50 disabled:bg-slate-50 disabled:text-slate-400"
                      value={selectedModalidad}
                      onChange={(e) => setSelectedModalidad(e.target.value)}
                      disabled={!selectedSemestre}
                    >
                      <option value="">Seleccione una modalidad</option>
                      {filteredModalidades.map(m => {
                        const hasSaved = savedModalidadIds.includes(m.id);
                        return (
                          <option key={m.id} value={m.id}>
                            {m.nombre}{hasSaved ? ' 📝 [Guardada]' : ''}
                          </option>
                        );
                      })}
                    </select>
                  </div>
                </div>

                {selectedModalidad && (
                  <div className="space-y-5">
                    <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-4">
                      <div className="flex gap-3">
                        <span className="material-symbols-outlined text-primary text-[22px] shrink-0">info_outline</span>
                        <div className="space-y-1">
                          <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider">Estructura del archivo CSV / Excel</h4>
                          <p className="text-[11px] text-slate-500 font-semibold leading-relaxed">
                            El sistema procesa y normaliza las columnas de forma flexible (mayúsculas/minúsculas, guiones o espacios). Para que los postulantes se lean correctamente, el archivo debe cumplir con la siguiente estructura:
                          </p>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-[11px] bg-white p-4 rounded-xl border border-slate-100 font-semibold text-slate-600">
                        <div className="space-y-1.5">
                          <p className="font-bold text-slate-800 uppercase tracking-wide text-[10px] flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span> Campos Obligatorios:
                          </p>
                          <ul className="list-disc list-inside space-y-1 pl-1 text-slate-500">
                            <li><span className="font-bold font-mono text-[10px] text-primary">DNI</span> <span className="text-slate-400">(NroDocumento, DNI, alumno)</span></li>
                            <li><span className="font-bold font-mono text-[10px] text-primary">POSTULANTE</span> <span className="text-slate-400">(Nombre, Nombre completo)</span></li>
                            <li><span className="font-bold font-mono text-[10px] text-primary">NOTA</span> <span className="text-slate-400">(Puntaje, Nota)</span></li>
                            <li><span className="font-bold font-mono text-[10px] text-primary">POS</span> <span className="text-slate-400">(Posicion, Puesto, OMERITO)</span></li>
                            <li><span className="font-bold font-mono text-[10px] text-primary">ESCUELA1</span> <span className="text-slate-400">(Carrera a la que postula)</span></li>
                          </ul>
                        </div>

                        <div className="space-y-1.5">
                          <p className="font-bold text-slate-800 uppercase tracking-wide text-[10px] flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span> Campos de Ingreso y Datos Opcionales:
                          </p>
                          <ul className="list-disc list-inside space-y-1 pl-1 text-slate-500">
                            <li><span className="font-bold font-mono text-[10px] text-primary">ESTADO</span> <span className="text-slate-400">(Observación: 'INGRESANTE' para vacantes cubiertas)</span></li>
                            <li><span className="font-bold font-mono text-[10px] text-primary">COD_CARRERA</span> <span className="text-slate-400">(Código de escuela de ingreso)</span></li>
                            <li><span className="font-bold font-mono text-[10px] text-primary">GRUPO</span> <span className="text-slate-400">(Área, Grupo de examen)</span></li>
                            <li><span className="font-bold font-mono text-[10px] text-primary">UBIGEO</span> <span className="text-slate-400">(6 dígitos)</span>, Sexo, Edad, FechaNacimiento</li>
                          </ul>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2 pt-1">
                        <button
                          type="button"
                          onClick={downloadXlsxTemplate}
                          className="px-4 py-2 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-800 transition-all flex items-center gap-2 shadow-md hover:shadow-lg active:scale-95 cursor-pointer"
                        >
                          <span className="material-symbols-outlined text-[16px]">download</span>
                          Descargar Plantilla Excel (.XLSX)
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Archivo CSV de Resultados</label>
                      {isFinalized ? (
                        <div className="bg-slate-50 border-2 border-slate-200 rounded-2xl p-8 text-center flex flex-col items-center justify-center">
                          <span className="material-symbols-outlined text-4xl text-emerald-600 mb-2">verified_user</span>
                          <span className="text-sm font-black text-slate-700 uppercase tracking-wide">Proceso Aprobado y Migrado</span>
                          <p className="text-xs text-slate-500 mt-1.5 max-w-xs leading-relaxed font-semibold">
                            Este proceso ha sido cerrado de forma definitiva. Toda la información ha sido migrada con éxito a participantes y se encuentra congelada.
                          </p>
                        </div>
                      ) : (
                        <div className="border-2 border-dashed border-slate-300 hover:border-primary rounded-2xl p-8 text-center hover:bg-slate-50/50 transition-colors">
                          <input 
                            type="file" 
                            accept=".csv"
                            className="hidden"
                            id="csv-upload"
                            ref={fileInputRef}
                            onChange={(e) => {
                              handleFileUpload(e);
                            }}
                          />
                          <label htmlFor="csv-upload" className="cursor-pointer flex flex-col items-center">
                            <span className="material-symbols-outlined text-4xl text-slate-400 mb-2">upload_file</span>
                            <span className="text-sm font-black text-primary uppercase tracking-wider text-xs">Haz clic para subir el archivo CSV</span>
                            <span className="text-[11px] font-bold text-slate-400 mt-1">Soporta codificación UTF-8 / ISO-8859-1</span>
                          </label>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Results Section */}
        {isLoaded && (
          <div className="space-y-6">
            
            {/* Action Bar */}
            <div className="flex flex-wrap gap-4 items-center justify-between bg-white p-4 rounded-2xl shadow-sm border border-slate-200">
              <div className="flex gap-2">
                <button 
                  onClick={() => setActiveTab('Cobertura')}
                  className={`px-4 py-2 rounded-xl text-sm font-bold uppercase tracking-wider transition-colors ${activeTab === 'Cobertura' ? 'bg-primary text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                >
                  Cobertura
                </button>
                <button 
                  onClick={() => setActiveTab('Lista')}
                  className={`px-4 py-2 rounded-xl text-sm font-bold uppercase tracking-wider transition-colors ${activeTab === 'Lista' ? 'bg-primary text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                >
                  Lista General
                </button>
                <button 
                  onClick={() => setActiveTab('Ranking')}
                  className={`px-4 py-2 rounded-xl text-sm font-bold uppercase tracking-wider transition-colors ${activeTab === 'Ranking' ? 'bg-primary text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                >
                  Ranking (Nota &ge; 9)
                </button>
                <button 
                  onClick={() => setActiveTab('Dashboard')}
                  className={`px-4 py-2 rounded-xl text-sm font-bold uppercase tracking-wider transition-colors ${activeTab === 'Dashboard' ? 'bg-primary text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                >
                  Competitividad
                </button>
              </div>
              <div className="flex gap-3">
                {/* NUEVO: Botón de Sincronizar Puestos en la BD */}
                <button 
                  onClick={handleSyncParticipantesOmerito}
                  disabled={isSyncing || isSaving}
                  className="px-4 py-2 rounded-xl text-sm font-bold uppercase tracking-wider bg-indigo-600 text-white hover:bg-indigo-700 transition-colors flex items-center gap-2 disabled:opacity-50"
                >
                  {isSyncing ? (
                    <span className="material-symbols-outlined animate-spin text-[18px]">progress_activity</span>
                  ) : (
                    <span className="material-symbols-outlined text-[18px]">sync</span>
                  )}
                  Sincronizar Puestos
                </button>
                {isFinalized ? (
                  <button 
                    disabled={true}
                    className="px-4 py-2 rounded-xl text-sm font-bold uppercase tracking-wider bg-slate-100 text-slate-400 border border-slate-200 transition-colors flex items-center gap-2 cursor-not-allowed"
                    title="Este proceso ya ha sido aprobado y migrado de manera definitiva."
                  >
                    <span className="material-symbols-outlined text-[18px]">lock</span>
                    Proceso Finalizado
                  </button>
                ) : (
                  <button 
                    onClick={handleApproveAndMigrate}
                    disabled={isSaving}
                    className="px-4 py-2 rounded-xl text-sm font-bold uppercase tracking-wider bg-emerald-600 text-white hover:bg-emerald-700 transition-colors flex items-center gap-2 disabled:opacity-50"
                  >
                    {isSaving ? (
                      <span className="material-symbols-outlined animate-spin text-[18px]">progress_activity</span>
                    ) : (
                      <span className="material-symbols-outlined text-[18px]">export_notes</span>
                    )}
                    Exportar a Adjudicación
                  </button>
                )}
              </div>
            </div>

            {/* Sincronizando Progreso */}
            {isSyncing && (
              <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-5 shadow-sm flex flex-col md:flex-row gap-4 items-center justify-between animate-fade-in">
                <div className="flex items-center gap-4 w-full md:w-auto">
                  <div className="size-11 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center shrink-0 animate-spin">
                    <span className="material-symbols-outlined text-2xl">sync</span>
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-800 text-sm">Sincronizando Puestos Correlativos Locales</h4>
                    <p className="text-xs text-slate-500 font-medium mt-0.5">
                      Actualizando registros en la base de datos: <span className="font-bold text-indigo-700">{syncProcessed}</span> de <span className="font-bold text-slate-700">{syncTotal}</span> ingresantes ({Math.round((syncProcessed / (syncTotal || 1)) * 100)}%)
                    </p>
                  </div>
                </div>
                <div className="w-full md:w-80 shrink-0">
                  <div className="h-2.5 w-full bg-slate-200 rounded-full overflow-hidden border border-slate-300/30">
                    <div 
                      className="h-full bg-indigo-600 rounded-full transition-all duration-300"
                      style={{ width: `${Math.round((syncProcessed / (syncTotal || 1)) * 100)}%` }}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Cobertura Tab */}
            {activeTab === 'Cobertura' && (
              <div className="space-y-6">
                
                {/* Stats */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
                  <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200/80 flex items-center gap-3 relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-1 h-full bg-blue-500"></div>
                    <div className="size-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                      <span className="material-symbols-outlined text-xl">group</span>
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Total Postulantes</p>
                      <p className="text-xl font-black text-slate-800 tracking-tight">{normalizedCsvData.length}</p>
                      <p className="text-[10px] text-slate-400">Cargados en archivo</p>
                    </div>
                  </div>

                  <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200/80 flex items-center gap-3 relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500"></div>
                    <div className="size-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                      <span className="material-symbols-outlined text-xl">how_to_reg</span>
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Ing. Directos</p>
                      <p className="text-xl font-black text-emerald-600 tracking-tight">
                        {normalizedCsvData.filter(r => isAdmittedRow(r) && !r.isAdjudicado && !(r.OBSERVACION||'').toUpperCase().includes('ADJUDICA')).length}
                      </p>
                      <p className="text-[10px] text-slate-400">Regular / Directo</p>
                    </div>
                  </div>

                  <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200/80 flex items-center gap-3 relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-1 h-full bg-purple-500"></div>
                    <div className="size-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
                      <span className="material-symbols-outlined text-xl">gavel</span>
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Adjudicados</p>
                      <p className="text-xl font-black text-purple-700 tracking-tight">
                        {normalizedCsvData.filter(r => r.isAdjudicado || (r.OBSERVACION||'').toUpperCase().includes('ADJUDICA')).length}
                      </p>
                      <p className="text-[10px] text-purple-500 font-bold">Por Adjudicación</p>
                    </div>
                  </div>

                  <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200/80 flex items-center gap-3 relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-1 h-full bg-indigo-600"></div>
                    <div className="size-10 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center shrink-0">
                      <span className="material-symbols-outlined text-xl">school</span>
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Vacantes Oferta</p>
                      <p className="text-xl font-black text-slate-800 tracking-tight">
                        {(Object.values(vacanciesBySchool) as number[]).reduce((a,b) => a+b, 0)}
                      </p>
                      <p className="text-[10px] text-slate-400">En cuadro anual</p>
                    </div>
                  </div>

                  <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200/80 flex items-center gap-3 relative overflow-hidden">
                    {(() => {
                      const totalVac = (Object.values(vacanciesBySchool) as number[]).reduce((a,b) => a+b, 0);
                      const totalAdm = normalizedCsvData.filter(r => isAdmittedRow(r)).length;
                      const diff = totalVac - totalAdm;
                      const isNegative = diff < 0;
                      return (
                        <>
                          <div className={`absolute top-0 left-0 w-1 h-full ${isNegative ? 'bg-rose-500' : 'bg-amber-500'}`}></div>
                          <div className={`size-10 rounded-xl flex items-center justify-center shrink-0 ${isNegative ? 'bg-rose-50 text-rose-600' : 'bg-amber-50 text-amber-600'}`}>
                            <span className="material-symbols-outlined text-xl">event_seat</span>
                          </div>
                          <div>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">{isNegative ? 'Sobrecupo' : 'Vacantes Libres'}</p>
                            <p className={`text-xl font-black tracking-tight ${isNegative ? 'text-rose-600' : 'text-slate-800'}`}>
                              {Math.abs(diff)}
                            </p>
                            <p className="text-[10px] text-slate-400">{isNegative ? 'Exceso ingresantes' : 'Sin ocupar'}</p>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                </div>

                {/* Cobertura Table */}
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
                  <div className="p-4 border-b border-slate-100 bg-slate-50/20">
                    <h3 className="font-black text-slate-800 uppercase tracking-tight text-sm">Análisis de Cobertura y Demanda por Escuela</h3>
                    <p className="text-xs text-slate-400 mt-1">Análisis consolidado de vacantes, postulantes totales, ingresantes directos, adjudicados e ingresantes totales.</p>
                  </div>
                  
                  {/* Filter and Search Bar */}
                  <div className="p-4 border-b border-slate-200 bg-slate-50/40 flex flex-col md:flex-row md:items-center justify-between gap-3">
                    <div className="relative flex-1 max-w-sm">
                      <span className="material-symbols-outlined absolute left-3 top-2.5 text-slate-400 text-xs">search</span>
                      <input
                        type="text"
                        placeholder="Buscar escuela por nombre o código..."
                        className="pl-9 pr-4 py-1.5 w-full text-xs font-bold rounded-lg border border-slate-200 focus:outline-none bg-white text-slate-700 shadow-sm"
                        value={coberturaSearchQuery}
                        onChange={(e) => setCoberturaSearchQuery(e.target.value)}
                      />
                    </div>
                    
                    <div className="flex flex-wrap items-center gap-2">
                      <select 
                        className="p-2 text-xs font-bold rounded-lg border border-slate-200 focus:outline-none bg-white text-slate-700 shadow-sm"
                        value={coberturaFilterArea}
                        onChange={(e) => setCoberturaFilterArea(e.target.value)}
                      >
                        <option>Todas las Áreas</option>
                        <option>Área A</option>
                        <option>Área B</option>
                        <option>Área C</option>
                        <option>Área D</option>
                      </select>

                      <select 
                        className="p-2 text-xs font-bold rounded-lg border border-slate-200 focus:outline-none bg-white text-slate-700 shadow-sm"
                        value={coberturaFilterStatus}
                        onChange={(e) => setCoberturaFilterStatus(e.target.value)}
                      >
                        <option>Todos los Estados</option>
                        <option>Cubierto</option>
                        <option>Sobran Vacantes</option>
                        <option>Exceso de Ingresantes</option>
                      </select>

                      <select
                        className="p-2 text-xs font-bold rounded-lg border border-slate-200 focus:outline-none bg-white text-slate-700 shadow-sm"
                        value={coberturaFilterVacancies}
                        onChange={(e) => setCoberturaFilterVacancies(e.target.value as any)}
                      >
                        <option value="todos">Todas las Vacantes</option>
                        <option value="con-vacantes">Con Vacantes (&gt; 0)</option>
                        <option value="sin-vacantes">Sin Vacantes (= 0)</option>
                      </select>

                      <select
                        className="p-2 text-xs font-bold rounded-lg border border-slate-200 focus:outline-none bg-white text-slate-700 shadow-sm"
                        value={coberturaSortBy}
                        onChange={(e) => setCoberturaSortBy(e.target.value)}
                      >
                        <option value="area-asc">Por Área y Nombre (A-Z)</option>
                        <option value="postulantes-desc">Postulantes (Mayor a Menor)</option>
                        <option value="postulantes-asc">Postulantes (Menor a Mayor)</option>
                        <option value="ingresantes-desc">Ingresantes (Mayor a Menor)</option>
                        <option value="vacantes-desc">Vacantes (Mayor a Menor)</option>
                        <option value="difference-desc">Diferencia (Mayor a Menor)</option>
                        <option value="ratio-desc">Ratio Competencia (Mayor a Menor)</option>
                        <option value="tasa-desc">Tasa de Ingreso (Mayor a Menor)</option>
                        <option value="nombre-asc">Nombre (A-Z)</option>
                      </select>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50 text-slate-500 text-[10px] uppercase tracking-wider">
                          <th className="p-4 font-black">Escuela Profesional</th>
                          <th className="p-4 font-black text-center">Área</th>
                          <th className="p-4 font-black text-center">Vacantes</th>
                          <th className="p-4 font-black text-center">Postulantes</th>
                          <th className="p-4 font-black text-center">Ing. Directos</th>
                          <th className="p-4 font-black text-center">Adjudicados</th>
                          <th className="p-4 font-black text-center">Ingresantes Totales</th>
                          <th className="p-4 font-black text-center">Diferencia</th>
                          <th className="p-4 font-black text-center">Ratio Competencia</th>
                          <th className="p-4 font-black text-center">Tasa de Ingreso</th>
                          <th className="p-4 font-black">Estado</th>
                        </tr>
                      </thead>
                      <tbody className="text-sm divide-y divide-slate-100">
                        {sortedCoberturaRows.length === 0 ? (
                           <tr><td colSpan={11} className="text-center p-8 text-slate-400 font-bold text-xs">No hay datos que coincidan con los filtros seleccionados</td></tr>
                        ) : (() => {
                          let lastArea = '';
                          return sortedCoberturaRows.map((row, idx) => {
                            const showAreaHeader = coberturaSortBy === 'area-asc' && row.area !== lastArea;
                            lastArea = row.area;
                            return (
                              <React.Fragment key={idx}>
                                {showAreaHeader && (
                                  <tr className="bg-slate-100/40">
                                    <td colSpan={11} className="p-3 pl-4 font-black text-xs uppercase tracking-wider text-slate-600 bg-slate-100/60">
                                      Área {row.area || 'Sin Área'}
                                    </td>
                                  </tr>
                                )}
                                <tr className="hover:bg-slate-50 transition-colors">
                                  <td className="p-4">
                                    <p className="font-bold text-slate-800">{row.schoolName}</p>
                                    <p className="text-[10px] text-slate-400 font-mono">{row.schoolCode}</p>
                                  </td>
                                  <td className="p-4 text-center font-bold text-slate-600">{row.area}</td>
                                  <td className="p-4 text-center font-black text-slate-700">{row.vacancies}</td>
                                  <td className="p-4 text-center font-black text-blue-600">{row.applicants}</td>
                                  <td className="p-4 text-center font-black text-emerald-600">{row.admittedDirect || 0}</td>
                                  <td className="p-4 text-center font-black text-purple-700">{row.admittedAdj || 0}</td>
                                  <td className="p-4 text-center font-black text-indigo-700">{row.admitted}</td>
                                  <td className="p-4 text-center font-bold">
                                    <span className={row.difference < 0 ? 'text-rose-500' : 'text-emerald-600'}>
                                      {row.difference > 0 ? '+' : ''}{row.difference}
                                    </span>
                                  </td>
                                  <td className="p-4 text-center">
                                    <span className={`inline-block font-black text-xs px-2 py-0.5 rounded ${
                                      row.ratio !== '—' && parseFloat(row.ratio) > 8 ? 'bg-rose-50 text-rose-600' :
                                      row.ratio !== '—' && parseFloat(row.ratio) > 3 ? 'bg-amber-50 text-amber-600' :
                                      'bg-slate-50 text-slate-600'
                                    }`}>
                                      {row.ratio === '—' ? '—' : `${row.ratio} post/vac`}
                                    </span>
                                  </td>
                                  <td className="p-4 text-center">
                                    <div className="flex flex-col items-center gap-1 justify-center">
                                      <div className="flex items-center gap-1.5 justify-center">
                                        <span className="text-[10px] font-bold text-slate-400 uppercase">Tasa:</span>
                                        <span className="text-xs font-black text-slate-700">{row.admissionRate}%</span>
                                      </div>
                                      <div className="w-16 bg-slate-100 rounded-full h-1.5 overflow-hidden hidden sm:block">
                                        <div 
                                          className={`h-full rounded-full ${
                                            row.status === 'Cubierto' ? 'bg-emerald-500' :
                                            row.status === 'Sobran Vacantes' ? 'bg-blue-500' :
                                            'bg-rose-500'
                                          }`} 
                                          style={{ width: `${Math.min(parseFloat(row.admissionRate), 100)}%` }}
                                        ></div>
                                      </div>
                                    </div>
                                  </td>
                                  <td className="p-4">
                                    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full ${
                                      row.status === 'Cubierto' ? 'bg-emerald-100 text-emerald-700' :
                                      row.status === 'Sobran Vacantes' ? 'bg-blue-100 text-blue-700' :
                                      'bg-red-100 text-red-700'
                                    }`}>
                                      {row.status}
                                    </span>
                                  </td>
                                </tr>
                              </React.Fragment>
                            );
                          });
                        })()}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* Lista Tab */}
            {activeTab === 'Lista' && (
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
                <div className="p-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-4 bg-slate-50">
                  <div className="flex flex-wrap items-center gap-3 flex-1 max-w-2xl">
                    {/* Buscador de Texto */}
                    <div className="relative flex-1 min-w-[220px]">
                      <span className="material-symbols-outlined absolute left-3 top-2.5 text-slate-400 text-[18px]">search</span>
                      <input 
                        type="text" 
                        placeholder="Buscar por DNI, alumno o nombre..." 
                        value={listSearchTerm}
                        onChange={(e) => setListSearchTerm(e.target.value)}
                        className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary bg-white"
                      />
                    </div>

                    {/* Filtro por Carrera / Escuela */}
                    <div className="relative min-w-[220px] max-w-[320px]">
                      <select
                        value={listSchoolFilter}
                        onChange={(e) => setListSchoolFilter(e.target.value)}
                        className="w-full pl-3 pr-8 py-2 text-xs font-bold border border-slate-200 rounded-xl focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary bg-white text-slate-700 appearance-none shadow-2xs truncate"
                      >
                        <option value="TODAS">🏫 Todas las Carreras ({listSchoolOptions.length})</option>
                        {listSchoolOptions.map(opt => (
                          <option key={opt.code} value={opt.code}>
                            {opt.name}
                          </option>
                        ))}
                      </select>
                      <span className="material-symbols-outlined absolute right-2.5 top-2 text-slate-400 pointer-events-none text-[20px]">
                        arrow_drop_down
                      </span>
                    </div>

                    {/* Botón de reset de filtro */}
                    {(listSearchTerm || listSchoolFilter !== 'TODAS') && (
                      <button
                        onClick={() => {
                          setListSearchTerm('');
                          setListSchoolFilter('TODAS');
                        }}
                        className="px-3 py-2 text-xs font-bold text-slate-600 hover:text-slate-900 bg-slate-200/80 hover:bg-slate-200 rounded-xl transition-colors flex items-center gap-1 shadow-2xs"
                        title="Restablecer filtros de búsqueda"
                      >
                        <span className="material-symbols-outlined text-[16px]">restart_alt</span>
                        Limpiar filtros
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    {pagosData.length > 0 && (
                      <span className="px-3 py-1 bg-emerald-50 text-emerald-700 font-bold text-xs rounded-xl border border-emerald-200 flex items-center gap-1">
                        <span className="material-symbols-outlined text-[15px]">payments</span>
                        {pagosData.length.toLocaleString()} Pagos Vinculados
                      </span>
                    )}
                    {validacionesData.length > 0 && (
                      <span className="px-3 py-1 bg-indigo-50 text-indigo-700 font-bold text-xs rounded-xl border border-indigo-200 flex items-center gap-1">
                        <span className="material-symbols-outlined text-[15px]">fact_check</span>
                        {validacionesData.length.toLocaleString()} Validaciones
                      </span>
                    )}
                    {subsanacionesTotalCount > 0 && (
                      <span className="px-3 py-1 bg-teal-50 text-teal-800 font-bold text-xs rounded-xl border border-teal-200/80 flex items-center gap-1 shadow-2xs" title="Casos donde un requisito tuvo observación previa y fue posteriormente subsanado y aprobado">
                        <span className="material-symbols-outlined text-[15px] text-teal-600">published_with_changes</span>
                        {subsanacionesTotalCount.toLocaleString()} Subsanaciones Detectadas
                      </span>
                    )}
                    <span className="text-xs font-bold text-slate-400">Mostrando {filteredList.length} registros</span>
                  </div>
                </div>
                <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
                  <table className="w-full text-left border-collapse">
                    <thead className="sticky top-0 bg-white shadow-sm z-10">
                      <tr className="text-slate-500 text-[10px] uppercase tracking-wider border-b border-slate-100">
                        <th className="p-4 font-black">Nro Doc</th>
                        <th className="p-4 font-black">Nombre del Postulante</th>
                        <th className="p-4 font-black text-center">Validación Requisitos</th>
                        <th className="p-4 font-black text-center">Nota</th>
                        <th className="p-4 font-black text-center">Puesto</th>
                        <th className="p-4 font-black">Escuela (Ingreso)</th>
                        <th className="p-4 font-black">Observación</th>
                        <th className="p-4 font-black text-center">Detalle</th>
                      </tr>
                    </thead>
                    <tbody className="text-sm divide-y divide-slate-100">
                      {(() => {
                        let prevGroupPriority: number | null = null;
                        return filteredList.map((row, idx) => {
                          const obs = row.OBSERVACION?.trim().toUpperCase() || '';
                          const isIngresante = obs.includes('INGRESANTE');
                          const isSO = obs === 'INGRESANTE S.O.';
                          const isNSP = obs === 'NSP';

                          const currentPriority = row._groupPriority;
                          const showDivider = listSchoolFilter !== 'TODAS' && currentPriority !== undefined && currentPriority !== prevGroupPriority;
                          if (showDivider) {
                            prevGroupPriority = currentPriority;
                          }

                          const dni = String(row.NroDocumento || row.alumno || '').trim();
                          const valList = validacionesMap.get(dni) || [];
                          const r1 = getReqSubsanacionInfo(valList, 1);
                          const r2 = getReqSubsanacionInfo(valList, 2);
                          const r3 = getReqSubsanacionInfo(valList, 3);
                          
                          return (
                            <React.Fragment key={idx}>
                              {showDivider && (
                                <tr className="border-y-2 border-slate-200">
                                  <td colSpan={8} className="p-0">
                                    {currentPriority === 1 && (
                                      <div className="bg-emerald-100/90 text-emerald-950 font-black text-xs px-4 py-2 flex items-center justify-between border-l-4 border-l-emerald-600">
                                        <span className="flex items-center gap-2 uppercase tracking-wider">
                                          <span className="material-symbols-outlined text-[18px] text-emerald-700">stars</span>
                                          1. Ingresantes Directos / Primera Opción a esta Escuela
                                        </span>
                                        <span className="bg-emerald-200 text-emerald-900 text-[11px] px-2.5 py-0.5 rounded-full font-bold">
                                          {filteredList.filter(r => r._groupPriority === 1).length} ingresantes
                                        </span>
                                      </div>
                                    )}
                                    {currentPriority === 2 && (
                                      <div className="bg-amber-100/90 text-amber-950 font-black text-xs px-4 py-2 flex items-center justify-between border-l-4 border-l-amber-600">
                                        <span className="flex items-center gap-2 uppercase tracking-wider">
                                          <span className="material-symbols-outlined text-[18px] text-amber-700">published_with_changes</span>
                                          2. Ingresantes por Segunda Opción (S.O.) a esta Escuela
                                        </span>
                                        <span className="bg-amber-200 text-amber-900 text-[11px] px-2.5 py-0.5 rounded-full font-bold">
                                          {filteredList.filter(r => r._groupPriority === 2).length} ingresantes S.O.
                                        </span>
                                      </div>
                                    )}
                                    {currentPriority === 3 && (
                                      <div className="bg-purple-100/90 text-purple-950 font-black text-xs px-4 py-2 flex items-center justify-between border-l-4 border-l-purple-600">
                                        <span className="flex items-center gap-2 uppercase tracking-wider">
                                          <span className="material-symbols-outlined text-[18px] text-purple-700">gavel</span>
                                          3. Ingresantes por Adjudicación a esta Escuela
                                        </span>
                                        <span className="bg-purple-200 text-purple-900 text-[11px] px-2.5 py-0.5 rounded-full font-bold">
                                          {filteredList.filter(r => r._groupPriority === 3).length} ingresantes por adjudicación
                                        </span>
                                      </div>
                                    )}
                                    {currentPriority === 4 && (
                                      <div className="bg-slate-200/90 text-slate-900 font-black text-xs px-4 py-2 flex items-center justify-between border-l-4 border-l-slate-500">
                                        <span className="flex items-center gap-2 uppercase tracking-wider">
                                          <span className="material-symbols-outlined text-[18px] text-slate-600">person_off</span>
                                          4. Postulantes No Ingresantes (Postularon en 1ra Opción a esta Escuela)
                                        </span>
                                        <span className="bg-slate-300 text-slate-800 text-[11px] px-2.5 py-0.5 rounded-full font-bold">
                                          {filteredList.filter(r => r._groupPriority === 4).length} postulantes
                                        </span>
                                      </div>
                                    )}
                                  </td>
                                </tr>
                              )}
                              <tr className={`transition-colors ${isIngresante ? (isSO ? 'bg-amber-50/20 hover:bg-amber-50/40' : (row.isAdjudicado || obs.includes('ADJUDICA')) ? 'bg-purple-50/30 hover:bg-purple-50' : 'bg-emerald-50/30 hover:bg-emerald-50') : 'hover:bg-slate-50'}`}>
                            <td className="p-4 font-mono text-slate-600 font-bold">{dni}</td>
                            
                            {/* Visualización de Nombre + Carreras de Elección */}
                            <td className="p-4">
                              <p className="font-bold text-slate-800">{row.nombre}</p>
                              {(row.Carrera1 || row.Carrera2) && (
                                <p className="text-[10px] text-slate-400 mt-0.5">
                                  {row.Carrera1 && <span>1ra: <strong className="text-slate-500">{getSchoolName(row.Carrera1)}</strong></span>}
                                  {row.Carrera1 && row.Carrera2 && <span className="mx-1.5">•</span>}
                                  {row.Carrera2 && <span>2da: <strong className="text-slate-500">{getSchoolName(row.Carrera2)}</strong></span>}
                                </p>
                              )}
                            </td>

                            {/* Validación de Requisitos con Detección de Subsanación */}
                            <td className="p-4 text-center">
                              <div className="flex items-center justify-center gap-1.5">
                                {[
                                  { label: 'Foto', emoji: '📷', info: r1 },
                                  { label: 'DNI', emoji: '🪪', info: r2 },
                                  { label: 'Certificado', emoji: '📜', info: r3 }
                                ].map((reqItem, rIdx) => {
                                  const { status, latest, obsPrevia, history } = reqItem.info;
                                  
                                  let bgStyle = 'bg-slate-100 text-slate-400 border border-slate-200';
                                  let tooltipMsg = `${reqItem.label}: No registrado`;

                                  if (status === 'aprobado') {
                                    bgStyle = 'bg-emerald-100 text-emerald-800 border border-emerald-300';
                                    tooltipMsg = `${reqItem.label}: Aprobado Directo (@${latest?.usuario_validacion || 'Sistemas'})`;
                                  } else if (status === 'subsanado') {
                                    bgStyle = 'bg-teal-100 text-teal-900 border-2 border-teal-500 shadow-2xs font-black relative';
                                    tooltipMsg = `${reqItem.label}: APROBADO - SUBSANADO (Observación previa: "${obsPrevia?.observaciones || 'Observado previamente'}"). Total revisiones: ${history.length}`;
                                  } else if (status === 'observado') {
                                    bgStyle = 'bg-amber-100 text-amber-800 border border-amber-300';
                                    tooltipMsg = `${reqItem.label}: Observado ("${latest?.observaciones || 'En revisión'}")`;
                                  }

                                  return (
                                    <span 
                                      key={rIdx}
                                      title={tooltipMsg}
                                      className={`size-6 rounded-md flex items-center justify-center text-[12px] font-bold relative transition-transform hover:scale-110 cursor-help ${bgStyle}`}
                                    >
                                      {reqItem.emoji}
                                      {status === 'subsanado' && (
                                        <span className="absolute -top-1 -right-1 size-2.5 bg-teal-600 rounded-full border border-white flex items-center justify-center text-[7px] text-white font-black" title="Subsanado">
                                          ✓
                                        </span>
                                      )}
                                    </span>
                                  );
                                })}
                              </div>
                            </td>
                            
                            <td className="p-4 text-center font-black text-slate-700">{row.Nota}</td>
                            
                            {/* Mostrar Puesto Correlativo Local para ingresantes, u original para no-ingresantes */}
                            <td className="p-4 text-center">
                              {isIngresante ? (
                                <span className="font-black text-slate-800 bg-slate-100 px-2 py-0.5 rounded border border-slate-200 shadow-sm">
                                  {localPuestosMap[`${row.NroDocumento || row.alumno}_${row.CarreraIngreso}`] || '--'}
                                </span>
                              ) : (
                                <span className="font-bold text-slate-500">{row.POS || '--'}</span>
                              )}
                            </td>
                            
                            <td className="p-4">
                              {isIngresante ? (
                                <p className="font-bold text-primary">{getSchoolName(row.CarreraIngreso)}</p>
                              ) : (
                                <p className="text-slate-400 italic text-xs">--</p>
                              )}
                            </td>
                            
                            {/* Badges de condición específicos */}
                            <td className="p-4">
                              {isIngresante ? (
                                isSO ? (
                                  <span className="bg-amber-100 text-amber-700 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full border border-amber-200 shadow-sm">
                                    Ingresante S.O.
                                  </span>
                                ) : (row.isAdjudicado || obs.includes('ADJUDICA')) ? (
                                  <span className="bg-purple-100 text-purple-800 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1.5 rounded-full border border-purple-300 shadow-xs flex items-center gap-1 w-fit">
                                    <span className="material-symbols-outlined text-[13px]">gavel</span>
                                    Ingresante Adjudicación
                                  </span>
                                ) : (
                                  <span className="bg-emerald-100 text-emerald-700 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full border border-emerald-200 shadow-sm">
                                    Ingresante
                                  </span>
                                )
                              ) : isNSP ? (
                                <span className="bg-rose-100 text-rose-700 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full border border-rose-200 shadow-sm">
                                  NSP (Faltó)
                                </span>
                              ) : (
                                <span className="bg-slate-100 text-slate-600 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full border border-slate-200">
                                  No Ingresó
                                </span>
                              )}
                            </td>

                            <td className="p-4 text-center">
                              <button
                                onClick={() => setSelectedApplicantDetail(row)}
                                className="px-2.5 py-1 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-1 mx-auto"
                              >
                                <span className="material-symbols-outlined text-[15px]">visibility</span>
                                Ver
                              </button>
                            </td>
                          </tr>
                        </React.Fragment>
                      );
                    });
                  })()}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Ranking Tab */}
            {activeTab === 'Ranking' && (
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
                <div className="p-4 border-b border-slate-100 bg-slate-50">
                  <h3 className="font-black text-slate-800 uppercase tracking-tight">Ranking de Postulantes (Nota &ge; 9)</h3>
                  <p className="text-xs text-slate-500 mt-1">Lista de estudiantes que no ingresaron pero obtuvieron nota destacada para adjudicación.</p>
                </div>
                <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
                  <table className="w-full text-left border-collapse">
                    <thead className="sticky top-0 bg-white shadow-sm z-10">
                      <tr className="text-slate-500 text-[10px] uppercase tracking-wider">
                        <th className="p-4 font-black text-center">Orden Mérito</th>
                        <th className="p-4 font-black">DNI</th>
                        <th className="p-4 font-black">Nombre del Postulante</th>
                        <th className="p-4 font-black text-center">Área</th>
                        <th className="p-4 font-black text-center">Nota</th>
                      </tr>
                    </thead>
                    <tbody className="text-sm divide-y divide-slate-100">
                      {groupedRankingData.length === 0 || rankingData.length === 0 ? (
                         <tr><td colSpan={5} className="text-center p-8 text-slate-400">No hay postulantes en este ranking.</td></tr>
                      ) : (
                        groupedRankingData.map((group) => (
                          <React.Fragment key={group.key}>
                            {/* Academic Group Header */}
                            <tr className="bg-slate-50/80 border-y border-slate-100">
                              <td colSpan={5} className="px-4 py-2 bg-slate-100/60 text-[10px] font-black text-slate-600 uppercase tracking-widest">
                                {group.title} ({group.items.length} {group.items.length === 1 ? 'postulante' : 'postulantes'})
                              </td>
                            </tr>
                            {group.items.map((row, idx) => (
                              <tr key={`${group.key}-${idx}`} className="hover:bg-slate-50 transition-colors">
                                <td className="p-4 text-center font-black text-slate-400">
                                  #{idx + 1}
                                  <span className="text-[10px] font-normal text-slate-400 block">(Global: #{row.orden_merito})</span>
                                </td>
                                <td className="p-4 font-mono text-slate-600">{row.dni}</td>
                                <td className="p-4 font-bold text-slate-800">{row.nombre}</td>
                                <td className="p-4 text-center font-bold text-slate-600">{row.area}</td>
                                <td className="p-4 text-center font-black text-primary">{row.nota}</td>
                              </tr>
                            ))}
                          </React.Fragment>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Dashboard Tab */}
            {activeTab === 'Dashboard' && (
              <div className="space-y-6">
                
                {/* Summary Metrics */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200/80 flex flex-col justify-between relative overflow-hidden h-32">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-blue-50 rounded-full -mr-8 -mt-8 flex items-center justify-center text-blue-100 font-bold text-7xl select-none">#</div>
                    <div>
                      <span className="material-symbols-outlined text-blue-600 text-3xl">people</span>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mt-1">Postulantes Analizados</p>
                    </div>
                    <p className="text-3xl font-black text-slate-800 tracking-tight">{normalizedCsvData.length}</p>
                  </div>

                  <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200/80 flex flex-col justify-between relative overflow-hidden h-32">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-50 rounded-full -mr-8 -mt-8 flex items-center justify-center text-emerald-100 font-bold text-7xl select-none">%</div>
                    <div>
                      <span className="material-symbols-outlined text-emerald-600 text-3xl">emoji_events</span>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mt-1">Ingresantes</p>
                    </div>
                    <div className="flex items-baseline gap-2">
                      <p className="text-3xl font-black text-emerald-600 tracking-tight">
                        {normalizedCsvData.filter(r => r.OBSERVACION?.toUpperCase().includes('INGRESANTE')).length}
                      </p>
                      <p className="text-xs font-bold text-emerald-500 bg-emerald-50 px-1.5 py-0.5 rounded">
                        {normalizedCsvData.length > 0 ? ((normalizedCsvData.filter(r => r.OBSERVACION?.toUpperCase().includes('INGRESANTE')).length / normalizedCsvData.length) * 100).toFixed(1) : '0'}%
                      </p>
                    </div>
                  </div>

                  <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200/80 flex flex-col justify-between relative overflow-hidden h-32">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-purple-50 rounded-full -mr-8 -mt-8 flex items-center justify-center text-purple-100 font-bold text-7xl select-none">x̄</div>
                    <div>
                      <span className="material-symbols-outlined text-purple-600 text-3xl">grade</span>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mt-1">Nota Promedio General</p>
                    </div>
                    <p className="text-3xl font-black text-slate-800 tracking-tight">{gradeStats.avg}</p>
                  </div>

                  <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200/80 flex flex-col justify-between relative overflow-hidden h-32">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-amber-50 rounded-full -mr-8 -mt-8 flex items-center justify-center text-amber-100 font-bold text-7xl select-none">↑</div>
                    <div>
                      <span className="material-symbols-outlined text-amber-600 text-3xl">trending_up</span>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mt-1">Rango de Calificaciones</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-slate-400">Min</span>
                      <span className="text-lg font-extrabold text-slate-700">{gradeStats.min}</span>
                      <span className="text-slate-300">|</span>
                      <span className="text-sm font-bold text-slate-400">Max</span>
                      <span className="text-lg font-extrabold text-amber-600">{gradeStats.max}</span>
                    </div>
                  </div>
                </div>

                {/* Panel de Análisis Temporal de Pagos y Validaciones */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col space-y-6">
                  {/* Encabezado y Selector de Vistas */}
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-100">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-emerald-600">finance_mode</span>
                        <h4 className="font-black text-slate-800 uppercase tracking-tight text-base">
                          Análisis Temporal: Pagos Registrados y Validaciones de Requisitos
                        </h4>
                      </div>
                      <p className="text-xs text-slate-500 mt-1">
                        Estadísticas cronológicas por día y hora para identificar los picos de actividad de vouchers de pago y verificación de requisitos.
                      </p>
                    </div>

                    {/* Botones de Control de Vista */}
                    <div className="flex flex-wrap items-center gap-2">
                      {/* Toggle Días vs Horas */}
                      <div className="bg-slate-100 p-1 rounded-xl flex items-center gap-1 border border-slate-200/60">
                        <button
                          onClick={() => setTemporalViewMode('dias')}
                          className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1 ${
                            temporalViewMode === 'dias'
                              ? 'bg-white text-slate-800 shadow-xs'
                              : 'text-slate-500 hover:text-slate-800'
                          }`}
                        >
                          <span className="material-symbols-outlined text-sm">calendar_month</span>
                          Por Días
                        </button>
                        <button
                          onClick={() => setTemporalViewMode('horas')}
                          className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1 ${
                            temporalViewMode === 'horas'
                              ? 'bg-white text-slate-800 shadow-xs'
                              : 'text-slate-500 hover:text-slate-800'
                          }`}
                        >
                          <span className="material-symbols-outlined text-sm">schedule</span>
                          Por Hora (24h)
                        </button>
                      </div>

                      {/* Toggle Tipo de Gráfico */}
                      <div className="bg-slate-100 p-1 rounded-xl flex items-center gap-1 border border-slate-200/60">
                        <button
                          onClick={() => setTemporalChartType('barras')}
                          className={`px-2.5 py-1.5 text-xs font-bold rounded-lg transition-all ${
                            temporalChartType === 'barras'
                              ? 'bg-emerald-600 text-white shadow-xs'
                              : 'text-slate-500 hover:text-slate-800'
                          }`}
                          title="Gráfico de Barras"
                        >
                          <span className="material-symbols-outlined text-sm block">bar_chart</span>
                        </button>
                        <button
                          onClick={() => setTemporalChartType('lineas')}
                          className={`px-2.5 py-1.5 text-xs font-bold rounded-lg transition-all ${
                            temporalChartType === 'lineas'
                              ? 'bg-emerald-600 text-white shadow-xs'
                              : 'text-slate-500 hover:text-slate-800'
                          }`}
                          title="Gráfico de Líneas"
                        >
                          <span className="material-symbols-outlined text-sm block">show_chart</span>
                        </button>
                        <button
                          onClick={() => setTemporalChartType('area')}
                          className={`px-2.5 py-1.5 text-xs font-bold rounded-lg transition-all ${
                            temporalChartType === 'area'
                              ? 'bg-emerald-600 text-white shadow-xs'
                              : 'text-slate-500 hover:text-slate-800'
                          }`}
                          title="Gráfico de Área"
                        >
                          <span className="material-symbols-outlined text-sm block">area_chart</span>
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* 4 Cards de Métricas Específicas de Pagos & Validaciones */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="bg-emerald-50/50 p-4 rounded-xl border border-emerald-100 flex flex-col justify-between">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black text-emerald-800 uppercase tracking-wider">Total Pagos</span>
                        <span className="material-symbols-outlined text-emerald-600 text-xl">payments</span>
                      </div>
                      <div className="mt-2">
                        <span className="text-2xl font-black text-emerald-900">{temporalAnalytics.totalPagos.toLocaleString()}</span>
                        <p className="text-[11px] font-bold text-emerald-700 mt-0.5">
                          Día Pico: <span className="underline">{temporalAnalytics.peakPagoDay.label}</span> ({temporalAnalytics.peakPagoDay.count.toLocaleString()} pagos)
                        </p>
                      </div>
                    </div>

                    <div className="bg-indigo-50/50 p-4 rounded-xl border border-indigo-100 flex flex-col justify-between">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black text-indigo-800 uppercase tracking-wider">Total Validaciones</span>
                        <span className="material-symbols-outlined text-indigo-600 text-xl">fact_check</span>
                      </div>
                      <div className="mt-2">
                        <span className="text-2xl font-black text-indigo-900">{temporalAnalytics.totalValidaciones.toLocaleString()}</span>
                        <p className="text-[11px] font-bold text-indigo-700 mt-0.5">
                          Día Pico: <span className="underline">{temporalAnalytics.peakValidacionDay.label}</span> ({temporalAnalytics.peakValidacionDay.count.toLocaleString()} val.)
                        </p>
                      </div>
                    </div>

                    <div className="bg-amber-50/50 p-4 rounded-xl border border-amber-100 flex flex-col justify-between">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black text-amber-800 uppercase tracking-wider">Hora Pico de Pago</span>
                        <span className="material-symbols-outlined text-amber-600 text-xl">schedule</span>
                      </div>
                      <div className="mt-2">
                        <span className="text-xl font-black text-amber-900">{temporalAnalytics.peakPagoHour.hour}</span>
                        <p className="text-[11px] font-bold text-amber-700 mt-0.5">
                          {temporalAnalytics.peakPagoHour.count.toLocaleString()} pagos en ese rango
                        </p>
                      </div>
                    </div>

                    <div className="bg-blue-50/50 p-4 rounded-xl border border-blue-100 flex flex-col justify-between">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black text-blue-800 uppercase tracking-wider">Hora Pico de Validación</span>
                        <span className="material-symbols-outlined text-blue-600 text-xl">bolt</span>
                      </div>
                      <div className="mt-2">
                        <span className="text-xl font-black text-blue-900">{temporalAnalytics.peakValidacionHour.hour}</span>
                        <p className="text-[11px] font-bold text-blue-700 mt-0.5">
                          {temporalAnalytics.peakValidacionHour.count.toLocaleString()} validaciones en ese rango
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Gráfico Recharts Principal */}
                  <div className="min-h-[300px] w-full pt-2">
                    <ResponsiveContainer width="100%" height={320}>
                      {temporalChartType === 'barras' ? (
                        <BarChart
                          data={temporalViewMode === 'dias' ? temporalAnalytics.daysData : temporalAnalytics.hoursData}
                          margin={{ top: 10, right: 10, left: -10, bottom: 20 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                          <XAxis
                            dataKey={temporalViewMode === 'dias' ? 'label' : 'hour'}
                            tick={{ fontSize: 10, fontWeight: 700, fill: '#64748b' }}
                            axisLine={false}
                            tickLine={false}
                            interval={0}
                            angle={temporalViewMode === 'dias' ? -35 : 0}
                            textAnchor={temporalViewMode === 'dias' ? 'end' : 'middle'}
                            height={45}
                          />
                          <YAxis tick={{ fontSize: 10, fontWeight: 700, fill: '#64748b' }} axisLine={false} tickLine={false} />
                          <Tooltip
                            formatter={(value: any, name: any, item: any) => {
                              const isPago = item?.dataKey === 'pagos' || String(name).toLowerCase().includes('pago');
                              const labelText = isPago ? 'Pagos (Vouchers)' : 'Validaciones Requisitos';
                              const unitText = isPago ? 'pagos' : 'validaciones';
                              return [`${Number(value).toLocaleString()} ${unitText}`, labelText];
                            }}
                            labelFormatter={(label) => `${temporalViewMode === 'dias' ? 'Fecha' : 'Hora'}: ${label}`}
                          />
                          <Legend verticalAlign="top" height={36} iconType="circle" wrapperStyle={{ fontSize: '11px', fontWeight: 700 }} />
                          <Bar dataKey="pagos" name="Pagos (Vouchers)" fill="#10b981" radius={[4, 4, 0, 0]} isAnimationActive={true} animationDuration={350} />
                          <Bar dataKey="validaciones" name="Validaciones Requisitos" fill="#6366f1" radius={[4, 4, 0, 0]} isAnimationActive={true} animationDuration={350} />
                        </BarChart>
                      ) : temporalChartType === 'lineas' ? (
                        <LineChart
                          data={temporalViewMode === 'dias' ? temporalAnalytics.daysData : temporalAnalytics.hoursData}
                          margin={{ top: 10, right: 10, left: -10, bottom: 20 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                          <XAxis
                            dataKey={temporalViewMode === 'dias' ? 'label' : 'hour'}
                            tick={{ fontSize: 10, fontWeight: 700, fill: '#64748b' }}
                            axisLine={false}
                            tickLine={false}
                            interval={0}
                            angle={temporalViewMode === 'dias' ? -35 : 0}
                            textAnchor={temporalViewMode === 'dias' ? 'end' : 'middle'}
                            height={45}
                          />
                          <YAxis tick={{ fontSize: 10, fontWeight: 700, fill: '#64748b' }} axisLine={false} tickLine={false} />
                          <Tooltip
                            formatter={(value: any, name: any, item: any) => {
                              const isPago = item?.dataKey === 'pagos' || String(name).toLowerCase().includes('pago');
                              const labelText = isPago ? 'Pagos (Vouchers)' : 'Validaciones Requisitos';
                              const unitText = isPago ? 'pagos' : 'validaciones';
                              return [`${Number(value).toLocaleString()} ${unitText}`, labelText];
                            }}
                            labelFormatter={(label) => `${temporalViewMode === 'dias' ? 'Fecha' : 'Hora'}: ${label}`}
                          />
                          <Legend verticalAlign="top" height={36} iconType="circle" wrapperStyle={{ fontSize: '11px', fontWeight: 700 }} />
                          <Line type="monotone" dataKey="pagos" name="Pagos (Vouchers)" stroke="#10b981" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} isAnimationActive={true} animationDuration={350} />
                          <Line type="monotone" dataKey="validaciones" name="Validaciones Requisitos" stroke="#6366f1" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} isAnimationActive={true} animationDuration={350} />
                        </LineChart>
                      ) : (
                        <AreaChart
                          data={temporalViewMode === 'dias' ? temporalAnalytics.daysData : temporalAnalytics.hoursData}
                          margin={{ top: 10, right: 10, left: -10, bottom: 20 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                          <XAxis
                            dataKey={temporalViewMode === 'dias' ? 'label' : 'hour'}
                            tick={{ fontSize: 10, fontWeight: 700, fill: '#64748b' }}
                            axisLine={false}
                            tickLine={false}
                            interval={0}
                            angle={temporalViewMode === 'dias' ? -35 : 0}
                            textAnchor={temporalViewMode === 'dias' ? 'end' : 'middle'}
                            height={45}
                          />
                          <YAxis tick={{ fontSize: 10, fontWeight: 700, fill: '#64748b' }} axisLine={false} tickLine={false} />
                          <Tooltip
                            formatter={(value: any, name: any, item: any) => {
                              const isPago = item?.dataKey === 'pagos' || String(name).toLowerCase().includes('pago');
                              const labelText = isPago ? 'Pagos (Vouchers)' : 'Validaciones Requisitos';
                              const unitText = isPago ? 'pagos' : 'validaciones';
                              return [`${Number(value).toLocaleString()} ${unitText}`, labelText];
                            }}
                            labelFormatter={(label) => `${temporalViewMode === 'dias' ? 'Fecha' : 'Hora'}: ${label}`}
                          />
                          <Legend verticalAlign="top" height={36} iconType="circle" wrapperStyle={{ fontSize: '11px', fontWeight: 700 }} />
                          <Area type="monotone" dataKey="pagos" name="Pagos (Vouchers)" stroke="#10b981" fill="#10b981" fillOpacity={0.2} strokeWidth={2} isAnimationActive={true} animationDuration={350} />
                          <Area type="monotone" dataKey="validaciones" name="Validaciones Requisitos" stroke="#6366f1" fill="#6366f1" fillOpacity={0.2} strokeWidth={2} isAnimationActive={true} animationDuration={350} />
                        </AreaChart>
                      )}
                    </ResponsiveContainer>
                  </div>

                  {/* Tabla Desglosada Detallada por Día */}
                  {temporalViewMode === 'dias' && temporalAnalytics.daysData.length > 0 && (
                    <div className="border border-slate-200 rounded-xl overflow-hidden bg-slate-50/50 pt-2">
                      <div className="px-4 py-2 border-b border-slate-200 flex items-center justify-between">
                        <h5 className="font-bold text-xs text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                          <span className="material-symbols-outlined text-sm text-slate-500">table_chart</span>
                          Detalle Diario Registrado
                        </h5>
                        <span className="text-[10px] font-bold text-slate-400">
                          {temporalAnalytics.daysData.length} Días con Actividad
                        </span>
                      </div>
                      <div className="max-h-64 overflow-y-auto">
                        <table className="w-full text-left text-xs border-collapse">
                          <thead className="bg-slate-100 text-slate-600 uppercase text-[10px] font-black sticky top-0 border-b border-slate-200">
                            <tr>
                              <th className="p-2.5 pl-4">Fecha</th>
                              <th className="p-2.5">Día</th>
                              <th className="p-2.5 text-right">Pagos</th>
                              <th className="p-2.5 w-1/4">% Pagos</th>
                              <th className="p-2.5 text-right">Validaciones</th>
                              <th className="p-2.5 w-1/4">% Validaciones</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200/60 bg-white">
                            {temporalAnalytics.daysData.map((row, idx) => {
                              const isPeakP = row.dateKey === temporalAnalytics.peakPagoDay.dateKey;
                              const isPeakV = row.dateKey === temporalAnalytics.peakValidacionDay.dateKey;

                              return (
                                <tr key={idx} className="hover:bg-slate-50 transition-colors">
                                  <td className="p-2.5 pl-4 font-mono font-bold text-slate-800">
                                    {row.fullFormattedDate}
                                  </td>
                                  <td className="p-2.5 font-semibold text-slate-600">
                                    {row.dayName}
                                  </td>
                                  <td className="p-2.5 text-right font-black text-emerald-700">
                                    {row.pagos.toLocaleString()}
                                    {isPeakP && (
                                      <span className="ml-1 text-[9px] bg-emerald-100 text-emerald-800 px-1 rounded font-bold">Pico</span>
                                    )}
                                  </td>
                                  <td className="p-2.5">
                                    <div className="flex items-center gap-2">
                                      <div className="flex-1 bg-slate-100 h-2 rounded-full overflow-hidden">
                                        <div className="bg-emerald-500 h-full rounded-full" style={{ width: `${Math.min(row.pagosPct * 2.5, 100)}%` }}></div>
                                      </div>
                                      <span className="text-[10px] font-bold text-slate-500 w-10 text-right">{row.pagosPct}%</span>
                                    </div>
                                  </td>
                                  <td className="p-2.5 text-right font-black text-indigo-700">
                                    {row.validaciones.toLocaleString()}
                                    {isPeakV && (
                                      <span className="ml-1 text-[9px] bg-indigo-100 text-indigo-800 px-1 rounded font-bold">Pico</span>
                                    )}
                                  </td>
                                  <td className="p-2.5">
                                    <div className="flex items-center gap-2">
                                      <div className="flex-1 bg-slate-100 h-2 rounded-full overflow-hidden">
                                        <div className="bg-indigo-500 h-full rounded-full" style={{ width: `${Math.min(row.validacionesPct * 2.5, 100)}%` }}></div>
                                      </div>
                                      <span className="text-[10px] font-bold text-slate-500 w-10 text-right">{row.validacionesPct}%</span>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>

                {/* Analytical Charts Row 1 */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  
                  {/* Sex/Gender Panel */}
                  <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col">
                    <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-100">
                      <div>
                        <h4 className="font-black text-slate-800 uppercase tracking-tight text-sm">Distribución por Sexo</h4>
                        <p className="text-xs text-slate-400 mt-0.5">Participación por género en esta modalidad</p>
                      </div>
                      <span className="material-symbols-outlined text-slate-400">wc</span>
                    </div>
                    <div className="flex flex-col sm:flex-row items-center justify-around flex-1 gap-6 min-h-[220px]">
                      <div className="w-48 h-48 relative">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={sexData.chartData}
                              cx="50%"
                              cy="50%"
                              innerRadius={55}
                              outerRadius={75}
                              paddingAngle={5}
                              dataKey="value"
                              isAnimationActive={true}
                              animationDuration={350}
                            >
                              {sexData.chartData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.name === 'Masculino' ? '#3b82f6' : entry.name === 'Femenino' ? '#ec4899' : '#94a3b8'} />
                              ))}
                            </Pie>
                            <Tooltip formatter={(value) => [`${value} postulantes`, 'Cantidad']} />
                          </PieChart>
                        </ResponsiveContainer>
                        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                          <span className="text-2xl font-black text-slate-800">{sexData.total}</span>
                          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Total</span>
                        </div>
                      </div>
                      
                      <div className="space-y-3 w-full max-w-xs">
                        {sexData.chartData.map((item, idx) => {
                          const isMasc = item.name === 'Masculino';
                          const isFem = item.name === 'Femenino';
                          return (
                            <div key={idx} className="flex items-center justify-between p-3 rounded-xl border border-slate-100 bg-slate-50/40">
                              <div className="flex items-center gap-2.5">
                                <span className={`size-3 rounded-full ${isMasc ? 'bg-blue-500' : isFem ? 'bg-pink-500' : 'bg-slate-400'}`}></span>
                                <span className="text-xs font-black text-slate-700 uppercase tracking-tight">{item.name}</span>
                              </div>
                              <div className="text-right">
                                <span className="text-sm font-black text-slate-800">{item.value}</span>
                                <span className="text-xs font-bold text-slate-400 ml-1.5">({item.pct}%)</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Age Distribution Panel */}
                  <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col">
                    <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-100">
                      <div>
                        <h4 className="font-black text-slate-800 uppercase tracking-tight text-sm">Distribución de Edad de Postulantes</h4>
                        <p className="text-xs text-slate-400 mt-0.5">Edad promedio: <span className="font-bold text-slate-700">{ageLineData.average} años</span> al momento del examen</p>
                      </div>
                      <span className="material-symbols-outlined text-slate-400">cake</span>
                    </div>
                    <div className="flex-1 min-h-[220px]">
                      <ResponsiveContainer width="100%" height={220}>
                        <LineChart data={ageLineData.chartData} margin={{ top: 10, right: 10, left: -20, bottom: 10 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                          <XAxis dataKey="edad" tick={{ fontSize: 10, fontWeight: 700, fill: '#64748b' }} axisLine={false} tickLine={false} label={{ value: 'Edad (Años)', position: 'insideBottom', offset: -5, fontSize: 10, fontWeight: 700, fill: '#64748b' }} height={35} />
                          <YAxis tick={{ fontSize: 10, fontWeight: 700, fill: '#64748b' }} axisLine={false} tickLine={false} />
                          <Tooltip formatter={(value, name) => [`${value} ${String(name).toLowerCase()}`, name]} />
                          <Legend verticalAlign="top" height={36} iconType="circle" wrapperStyle={{ fontSize: '11px', fontWeight: 700 }} />
                          <Line type="monotone" dataKey="postulantes" name="Postulantes" stroke="#991b1b" strokeWidth={2} activeDot={{ r: 5 }} dot={{ r: 3 }} isAnimationActive={true} animationDuration={350} />
                          <Line type="monotone" dataKey="ingresantes" name="Ingresantes" stroke="#d97706" strokeWidth={2} activeDot={{ r: 5 }} dot={{ r: 3 }} isAnimationActive={true} animationDuration={350} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                </div>

                {/* Analytical Row 2 - Grades Performance */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col mt-6">
                  <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-100">
                    <div>
                      <h4 className="font-black text-slate-800 uppercase tracking-tight text-sm">Rendimiento Académico</h4>
                      <p className="text-xs text-slate-400 mt-0.5">Nota promedio: <span className="font-bold text-slate-700">{gradeStats.avg}</span> | Rango: <span className="font-bold text-slate-700">{gradeStats.min} - {gradeStats.max}</span></p>
                    </div>
                    <span className="material-symbols-outlined text-slate-400">insights</span>
                  </div>
                  <div className="flex-1 min-h-[220px]">
                    <ResponsiveContainer width="100%" height={220}>
                      <LineChart data={gradeStats.chartData} margin={{ top: 10, right: 10, left: -20, bottom: 10 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis dataKey="range" tick={{ fontSize: 10, fontWeight: 700, fill: '#64748b' }} axisLine={false} tickLine={false} label={{ value: 'Rango de Notas', position: 'insideBottom', offset: -5, fontSize: 10, fontWeight: 700, fill: '#64748b' }} height={35} />
                        <YAxis tick={{ fontSize: 10, fontWeight: 700, fill: '#64748b' }} axisLine={false} tickLine={false} />
                        <Tooltip formatter={(value, name) => [`${value} ${String(name).toLowerCase()}`, name]} />
                        <Legend verticalAlign="top" height={36} iconType="circle" wrapperStyle={{ fontSize: '11px', fontWeight: 700 }} />
                        <Line type="monotone" dataKey="postulantes" name="Postulantes" stroke="#991b1b" strokeWidth={2} activeDot={{ r: 5 }} dot={{ r: 3 }} isAnimationActive={true} animationDuration={350} />
                        <Line type="monotone" dataKey="ingresantes" name="Ingresantes" stroke="#d97706" strokeWidth={2} activeDot={{ r: 5 }} dot={{ r: 3 }} isAnimationActive={true} animationDuration={350} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Analytical Row 3 - Geographic Procedencia */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col mt-6">
                  <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-100">
                    <div>
                      <h4 className="font-black text-slate-800 uppercase tracking-tight text-sm">Geografía de Procedencia</h4>
                      <p className="text-xs text-slate-400 mt-0.5">Análisis completo de origen geográfico por Departamento, Provincia y Distrito</p>
                    </div>
                    <span className="material-symbols-outlined text-slate-400">map</span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* Departamento Column */}
                    <div className="bg-slate-50/50 p-4 rounded-xl border border-slate-100 flex flex-col h-[320px]">
                      <div className="flex items-center gap-2 mb-3 pb-2 border-b border-slate-200/60">
                        <span className="material-symbols-outlined text-slate-500 text-sm">domain</span>
                        <h5 className="font-black text-xs text-slate-700 uppercase tracking-wider">Departamentos</h5>
                      </div>
                      <div className="flex-1 overflow-y-auto pr-1 space-y-3.5">
                        {geoDeptsData.length === 0 ? (
                          <p className="text-center text-slate-400 text-[11px] py-12">No hay datos disponibles</p>
                        ) : (
                          geoDeptsData.slice(0, 10).map((item, idx) => (
                            <div key={idx} className="space-y-1">
                              <div className="flex items-center justify-between text-[11px]">
                                <span className="font-black text-slate-700 uppercase tracking-tight truncate max-w-[150px]">{idx + 1}. {item.name}</span>
                                <span className="font-black text-slate-500">{item.value} <span className="text-[9px] font-bold text-slate-400">({item.pct}%)</span></span>
                              </div>
                              <div className="w-full bg-slate-200/60 h-1.5 rounded-full overflow-hidden">
                                <div className="bg-blue-500 h-full rounded-full" style={{ width: `${item.pct}%` }}></div>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    {/* Provincia Column */}
                    <div className="bg-slate-50/50 p-4 rounded-xl border border-slate-100 flex flex-col h-[320px]">
                      <div className="flex items-center gap-2 mb-3 pb-2 border-b border-slate-200/60">
                        <span className="material-symbols-outlined text-slate-500 text-sm">location_city</span>
                        <h5 className="font-black text-xs text-slate-700 uppercase tracking-wider">Provincias</h5>
                      </div>
                      <div className="flex-1 overflow-y-auto pr-1 space-y-3.5">
                        {geoProvsData.length === 0 ? (
                          <p className="text-center text-slate-400 text-[11px] py-12">No hay datos disponibles</p>
                        ) : (
                          geoProvsData.slice(0, 10).map((item, idx) => (
                            <div key={idx} className="space-y-1">
                              <div className="flex items-center justify-between text-[11px]">
                                <span className="font-black text-slate-700 uppercase tracking-tight truncate max-w-[150px]">{idx + 1}. {item.name}</span>
                                <span className="font-black text-slate-500">{item.value} <span className="text-[9px] font-bold text-slate-400">({item.pct}%)</span></span>
                              </div>
                              <div className="w-full bg-slate-200/60 h-1.5 rounded-full overflow-hidden">
                                <div className="bg-purple-500 h-full rounded-full" style={{ width: `${item.pct}%` }}></div>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    {/* Distrito Column */}
                    <div className="bg-slate-50/50 p-4 rounded-xl border border-slate-100 flex flex-col h-[320px]">
                      <div className="flex items-center gap-2 mb-3 pb-2 border-b border-slate-200/60">
                        <span className="material-symbols-outlined text-slate-500 text-sm">home_work</span>
                        <h5 className="font-black text-xs text-slate-700 uppercase tracking-wider">Distritos</h5>
                      </div>
                      <div className="flex-1 overflow-y-auto pr-1 space-y-3.5">
                        {geoDistsData.length === 0 ? (
                          <p className="text-center text-slate-400 text-[11px] py-12">No hay datos disponibles</p>
                        ) : (
                          geoDistsData.slice(0, 10).map((item, idx) => (
                            <div key={idx} className="space-y-1">
                              <div className="flex items-center justify-between text-[11px]">
                                <span className="font-black text-slate-700 uppercase tracking-tight truncate max-w-[150px]">{idx + 1}. {item.name}</span>
                                <span className="font-black text-slate-500">{item.value} <span className="text-[9px] font-bold text-slate-400">({item.pct}%)</span></span>
                              </div>
                              <div className="w-full bg-slate-200/60 h-1.5 rounded-full overflow-hidden">
                                <div className="bg-cyan-500 h-full rounded-full" style={{ width: `${item.pct}%` }}></div>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Diagnostics Panel */}
                  <div className="mt-4 border-t border-slate-100 pt-4">
                    <details className="group border border-slate-200 rounded-xl bg-slate-50 overflow-hidden">
                      <summary className="flex items-center justify-between p-3.5 font-black text-xs text-slate-600 uppercase tracking-wider cursor-pointer select-none hover:bg-slate-100/80 transition-colors">
                        <div className="flex items-center gap-2">
                          <span className="material-symbols-outlined text-amber-500 text-sm">analytics</span>
                          <span>Diagnóstico de Ubigeos / Códigos no encontrados</span>
                        </div>
                        <span className="material-symbols-outlined transition-transform duration-200 group-open:rotate-180">expand_more</span>
                      </summary>
                      <div className="p-4 bg-white border-t border-slate-200 text-xs text-slate-600 space-y-3">
                        <p className="font-bold">
                          Este panel te ayuda a ver qué códigos numéricos de la columna de domicilio (<span className="text-amber-600 bg-amber-50 px-1 py-0.5 rounded font-black">Ubigeo_Domicilio_Actual</span>) en tu archivo de postulantes no tienen correspondencia en la tabla <span className="font-mono text-slate-800 bg-slate-100 px-1 py-0.5 rounded font-black">ubigeos</span> de Supabase.
                        </p>
                        {unmatchedUbigeos.length === 0 ? (
                          <div className="p-3 bg-emerald-50 text-emerald-800 border border-emerald-100 rounded-xl flex items-center gap-2 font-black">
                            <span className="material-symbols-outlined">check_circle</span>
                            <span>¡Excelente! Todos los códigos de ubigeo en el archivo CSV se mapearon correctamente en la base de datos de Supabase.</span>
                          </div>
                        ) : (
                          <div className="space-y-3">
                            <div className="p-3 bg-amber-50 text-amber-800 border border-amber-100 rounded-xl flex items-center gap-2 font-bold">
                              <span className="material-symbols-outlined">warning</span>
                              <span>Se encontraron {unmatchedUbigeos.length} valores de ubigeo no mapeados en la base de datos de Supabase. El más repetido es el ubigeo <span className="font-black text-amber-900 bg-amber-100 px-1 py-0.5 rounded">"{unmatchedUbigeos[0]?.code}"</span> (con {unmatchedUbigeos[0]?.count} ocurrencias).</span>
                            </div>
                            <div className="max-h-[160px] overflow-y-auto border border-slate-200 rounded-lg">
                              <table className="w-full text-left border-collapse">
                                <thead>
                                  <tr className="bg-slate-50 border-b border-slate-200 text-[10px] uppercase font-black text-slate-500 tracking-wider">
                                    <th className="p-2 pl-4">Código Ubigeo del CSV</th>
                                    <th className="p-2 pr-4 text-right">Cantidad de Postulantes</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 text-[11px]">
                                  {unmatchedUbigeos.map((u, i) => (
                                    <tr key={i} className="hover:bg-slate-50">
                                      <td className="p-2 pl-4 font-mono font-bold text-slate-700">{u.code}</td>
                                      <td className="p-2 pr-4 text-right font-black text-slate-900">{u.count}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}
                      </div>
                    </details>
                  </div>
                </div>

                {/* Top 10 Feeder Schools */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col">
                  <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-100">
                    <div>
                      <h4 className="font-black text-slate-800 uppercase tracking-tight text-sm">Top 10 Colegios de Origen</h4>
                      <p className="text-xs text-slate-400 mt-0.5">Colegios de procedencia con mayor número de postulantes e ingresantes</p>
                    </div>
                    <span className="material-symbols-outlined text-slate-400">school</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-3 max-h-[360px] overflow-y-auto pr-1">
                      {schoolOriginsData.length === 0 ? (
                        <p className="text-center text-slate-400 text-sm py-12">No hay información de colegios disponible</p>
                      ) : (
                        schoolOriginsData.slice(0, 10).map((school, idx) => {
                          const pctPostulantes = normalizedCsvData.length > 0 ? ((school.total / normalizedCsvData.length) * 100).toFixed(1) : '0';
                          const isExpanded = expandedSchool === school.name;
                          return (
                            <div key={idx} className="p-3.5 rounded-2xl border border-slate-100 bg-slate-50/40 hover:bg-slate-50 hover:border-slate-200 transition-all">
                              <div className="flex justify-between items-start gap-3">
                                <div className="flex-1 min-w-0">
                                  <h5 className="font-black text-xs text-slate-700 truncate uppercase tracking-tight">{idx + 1}. {school.name}</h5>
                                  <div className="flex gap-4 mt-1.5 text-[10px] font-bold text-slate-400">
                                    <span>Postulantes: <span className="text-slate-700 font-extrabold">{school.total}</span> ({pctPostulantes}%)</span>
                                    <span>Ingresaron: <span className="text-emerald-600 font-extrabold">{school.admitted}</span></span>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className={`shrink-0 text-[10px] font-black px-2 py-0.5 rounded-full uppercase ${
                                    parseFloat(school.ratio) > 20 ? 'bg-emerald-100 text-emerald-700' :
                                    parseFloat(school.ratio) > 5 ? 'bg-blue-100 text-blue-700' :
                                    'bg-slate-100 text-slate-600'
                                  }`}>
                                    {school.ratio}% éxito
                                  </span>
                                  <button
                                    onClick={() => setExpandedSchool(isExpanded ? null : school.name)}
                                    className="p-1 rounded bg-slate-200 hover:bg-slate-300 text-slate-600 transition-colors flex items-center justify-center"
                                    title="Ver detalle por áreas"
                                  >
                                    <span className="material-symbols-outlined text-[16px] pointer-events-none">
                                      {isExpanded ? 'expand_less' : 'expand_more'}
                                    </span>
                                  </button>
                                </div>
                              </div>
                              {/* Desglose inline por áreas */}
                              {isExpanded && (
                                <div className="mt-3 p-3 bg-white rounded-xl border border-slate-150 text-[10px] space-y-1.5 shadow-inner">
                                  <div className="grid grid-cols-4 text-center font-black text-slate-500 uppercase tracking-wider border-b border-slate-100 pb-1">
                                    <div>Área Académica</div>
                                    <div>Postulantes</div>
                                    <div>Ingresantes</div>
                                    <div>Tasa de Éxito</div>
                                  </div>
                                  {Object.entries(school.areas)
                                    .sort(([a], [b]) => a.localeCompare(b))
                                    .map(([areaName, areaStats]: [string, any]) => (
                                      <div key={areaName} className="grid grid-cols-4 text-center items-center py-1 border-b border-slate-50 last:border-b-0">
                                        <div className="font-bold text-slate-700 uppercase">Área {areaName}</div>
                                        <div className="font-bold text-slate-600">{areaStats.total}</div>
                                        <div className="font-black text-emerald-600">{areaStats.admitted}</div>
                                        <div>
                                          <span className="bg-slate-100 text-slate-700 font-extrabold px-1.5 py-0.5 rounded text-[9px]">
                                            {areaStats.total > 0 ? ((areaStats.admitted / areaStats.total) * 100).toFixed(0) : 0}%
                                          </span>
                                        </div>
                                      </div>
                                    ))}
                                </div>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                    <div className="flex items-center justify-center bg-slate-50/50 rounded-2xl p-6 border border-dashed border-slate-200 text-center flex-col gap-3">
                      <span className="material-symbols-outlined text-4xl text-primary animate-pulse">analytics</span>
                      <h5 className="font-black text-slate-800 uppercase tracking-tight text-sm">Análisis de Atracción de Talento</h5>
                      <p className="text-xs text-slate-500 max-w-xs leading-relaxed">
                        Este cuadro resalta las instituciones educativas (I.E.) públicas y privadas que canalizan el mayor volumen de postulantes. Optimice campañas de orientación y focalización en base a estos resultados.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Botón Generar Reporte PDF */}
                <div className="flex justify-end mb-4">
                  <button
                    onClick={generateCompetitivityReport}
                    disabled={normalizedCsvData.length === 0}
                    className="px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white font-black text-xs uppercase tracking-wider rounded-xl flex items-center gap-2 transition-all shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <span className="material-symbols-outlined text-[18px]">picture_as_pdf</span>
                    Generar Reporte PDF
                  </button>
                </div>

                {/* Demanda y Selectividad por Escuela */}
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                  <div className="p-6 border-b border-slate-100 bg-slate-50/40">
                    <h4 className="font-black text-slate-800 uppercase tracking-tight text-sm">Competitividad y Selectividad por Escuela Profesional</h4>
                    <p className="text-xs text-slate-400 mt-1">Análisis detallado de vacantes, postulantes totales, ingresantes adjudicados y ratio de selectividad.</p>
                  </div>

                  {/* Filter and Search Bar */}
                  <div className="p-4 bg-slate-50/60 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-3">
                    <div className="relative flex-1 max-w-sm">
                      <span className="material-symbols-outlined absolute left-3 top-2.5 text-slate-400 text-xs">search</span>
                      <input
                        type="text"
                        placeholder="Buscar escuela por nombre o código..."
                        className="pl-9 pr-4 py-1.5 w-full text-xs font-bold rounded-lg border border-slate-200 focus:outline-none bg-white text-slate-700 shadow-sm"
                        value={schoolsSearchQuery}
                        onChange={(e) => setSchoolsSearchQuery(e.target.value)}
                      />
                    </div>
                    
                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        className="p-2 text-xs font-bold rounded-lg border border-slate-200 focus:outline-none bg-white text-slate-700 shadow-sm"
                        value={schoolsFilterArea}
                        onChange={(e) => setSchoolsFilterArea(e.target.value)}
                      >
                        <option>Todas las Áreas</option>
                        <option>Área A</option>
                        <option>Área B</option>
                        <option>Área C</option>
                        <option>Área D</option>
                      </select>
                      
                      <select
                        className="p-2 text-xs font-bold rounded-lg border border-slate-200 focus:outline-none bg-white text-slate-700 shadow-sm"
                        value={schoolsFilterVacancies}
                        onChange={(e) => setSchoolsFilterVacancies(e.target.value as any)}
                      >
                        <option value="todos">Todas las Vacantes</option>
                        <option value="con-vacantes">Con Vacantes (&gt; 0)</option>
                        <option value="sin-vacantes">Sin Vacantes (= 0)</option>
                      </select>

                      <select
                        className="p-2 text-xs font-bold rounded-lg border border-slate-200 focus:outline-none bg-white text-slate-700 shadow-sm"
                        value={schoolsSortBy}
                        onChange={(e) => setSchoolsSortBy(e.target.value as any)}
                      >
                        <option value="postulantes-desc">Postulantes (Mayor a Menor)</option>
                        <option value="postulantes-asc">Postulantes (Menor a Mayor)</option>
                        <option value="ingresantes-desc">Ingresantes (Mayor a Menor)</option>
                        <option value="vacantes-desc">Vacantes (Mayor a Menor)</option>
                        <option value="ratio-desc">Ratio Competencia (Mayor a Menor)</option>
                        <option value="tasa-desc">Tasa de Ingreso (Mayor a Menor)</option>
                        <option value="nombre-asc">Nombre (A-Z)</option>
                      </select>
                    </div>
                  </div>

                  {/* Informative alert for 0 vacancies */}
                  {schoolsApplicantsData.some(s => s.vacancies === 0) && (
                    <div className="m-4 p-3 bg-amber-50/80 border border-amber-100 rounded-xl flex items-start gap-2.5 text-xs text-amber-800">
                      <span className="material-symbols-outlined text-amber-500 mt-0.5 text-sm">info</span>
                      <p className="leading-relaxed">
                        Se observan carreras con <span className="font-bold">0 vacantes</span>. Esto ocurre si la carrera no oferta vacantes bajo la modalidad seleccionada (<span className="font-bold">{allModalidades.find(m => m.id === selectedModalidad)?.nombre || modalidades.find(m => m.id === selectedModalidad)?.nombre || 'Ninguna'}</span>) en el Cuadro Anual de Vacantes. Puede usar los filtros superiores para aislar o reordenar estos datos.
                      </p>
                    </div>
                  )}

                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50 text-slate-500 text-[10px] uppercase tracking-wider">
                          <th className="p-4 font-black">Escuela Profesional</th>
                          <th className="p-4 font-black text-center">Área</th>
                          <th className="p-4 font-black text-center">Vacantes</th>
                          <th className="p-4 font-black text-center">Postulantes</th>
                          <th className="p-4 font-black text-center">Ingresantes</th>
                          <th className="p-4 font-black text-center">Ratio Competencia</th>
                          <th className="p-4 font-black text-center">Tasa de Ingreso</th>
                        </tr>
                      </thead>
                      <tbody className="text-sm divide-y divide-slate-100">
                        {schoolsApplicantsData.length === 0 ? (
                          <tr>
                            <td colSpan={7} className="p-8 text-center text-xs text-slate-400 font-bold">
                              No se encontraron escuelas que coincidan con los filtros aplicados.
                            </td>
                          </tr>
                        ) : (
                          Object.entries(groupedSchoolsApplicantsData).map(([area, items]) => {
                            const schoolItems = items as any[];
                            return (
                              <React.Fragment key={area}>
                                {/* Subcabecera elegante del Área Académica */}
                                <tr className="bg-slate-50/80 border-y border-slate-100">
                                  <td colSpan={7} className="px-4 py-2 bg-slate-100/60 text-[10px] font-black text-slate-600 uppercase tracking-widest">
                                    {area} ({schoolItems.length} {schoolItems.length === 1 ? 'carrera' : 'carreras'})
                                  </td>
                                </tr>
                                {schoolItems.map((item, idx) => {
                                  const ratioCompetencia = item.ratio;
                                  const tasaIngreso = item.total > 0 ? ((item.admitted / item.total) * 100).toFixed(1) : '0.0';
                                  return (
                                    <tr key={`${area}-${idx}`} className="hover:bg-slate-50/50 transition-colors">
                                      <td className="p-4 font-bold text-slate-800">
                                        {item.name}
                                        <span className="block text-[10px] text-slate-400 font-mono font-normal mt-0.5">{item.code}</span>
                                      </td>
                                      <td className="p-4 text-center font-bold text-slate-500">{item.area}</td>
                                      <td className="p-4 text-center font-black text-slate-700">{item.vacancies}</td>
                                      <td className="p-4 text-center font-black text-blue-600">{item.total}</td>
                                      <td className="p-4 text-center font-black text-emerald-600">{item.admitted}</td>
                                      <td className="p-4 text-center">
                                        <span className={`inline-block font-black text-xs px-2 py-0.5 rounded ${
                                          ratioCompetencia !== '—' && parseFloat(ratioCompetencia) > 8 ? 'bg-rose-50 text-rose-600' :
                                          ratioCompetencia !== '—' && parseFloat(ratioCompetencia) > 3 ? 'bg-amber-50 text-amber-600' :
                                          'bg-slate-50 text-slate-600'
                                        }`}>
                                          {ratioCompetencia === '—' ? '—' : `${ratioCompetencia} post/vac`}
                                        </span>
                                      </td>
                                      <td className="p-4 text-center">
                                        <div className="flex items-center gap-2 justify-center">
                                          <div className="w-12 bg-slate-100 rounded-full h-1.5 overflow-hidden">
                                            <div className="bg-emerald-500 h-full rounded-full" style={{ width: `${Math.min(parseFloat(tasaIngreso), 100)}%` }}></div>
                                          </div>
                                          <span className="text-xs font-bold text-slate-600">{tasaIngreso}%</span>
                                        </div>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </React.Fragment>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

              </div>
            )}

          </div>
        )}

      </div>

      {/* Modal de Detalle de Postulante, Pago y Validaciones de Requisitos */}
      {selectedApplicantDetail && (() => {
        const row = selectedApplicantDetail;
        const dni = String(row.NroDocumento || row.alumno || '').trim();
        const pagoInfo = pagosMap.get(dni);
        const valList = validacionesMap.get(dni) || [];
        const r1 = getReqSubsanacionInfo(valList, 1);
        const r2 = getReqSubsanacionInfo(valList, 2);
        const r3 = getReqSubsanacionInfo(valList, 3);
        const obs = row.OBSERVACION?.trim().toUpperCase() || '';
        const isIngresante = obs.includes('INGRESANTE');

        return (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
              {/* Modal Header */}
              <div className="bg-[#102c57] text-white p-5 flex items-start justify-between gap-4 shrink-0">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-blue-300">account_circle</span>
                    <span className="text-xs font-bold uppercase tracking-wider text-blue-200 font-mono">
                      DNI: {dni}
                    </span>
                  </div>
                  <h2 className="text-lg font-black text-white mt-1 leading-tight">{row.nombre}</h2>
                  <p className="text-xs text-slate-300 mt-0.5">
                    Modalidad: <span className="font-semibold text-white">{currentModalityName}</span>
                  </p>
                </div>
                <button 
                  onClick={() => setSelectedApplicantDetail(null)}
                  className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"
                >
                  <span className="material-symbols-outlined text-base">close</span>
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-6 overflow-y-auto space-y-6 flex-1 text-slate-700">
                {/* Grid de Resumen de Resultados */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80">
                    <span className="block text-[10px] font-bold text-slate-400 uppercase">Nota Examen</span>
                    <span className="text-base font-black text-slate-800">{row.Nota || '--'}</span>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80">
                    <span className="block text-[10px] font-bold text-slate-400 uppercase">Puesto</span>
                    <span className="text-base font-black text-slate-800">
                      {isIngresante ? (localPuestosMap[`${dni}_${row.CarreraIngreso}`] || '--') : (row.POS || '--')}
                    </span>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 col-span-2">
                    <span className="block text-[10px] font-bold text-slate-400 uppercase">Condición / Observación</span>
                    <span className="text-xs font-bold text-slate-800">{row.OBSERVACION || '--'}</span>
                  </div>
                </div>

                {/* Sección 1: Registro de Pago */}
                <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/50">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                      <span className="material-symbols-outlined text-emerald-600">payments</span>
                      Registro de Pago de Inscripción
                    </h3>
                    {pagoInfo ? (
                      <span className="bg-emerald-100 text-emerald-800 text-[10px] font-black px-2.5 py-0.5 rounded-full border border-emerald-200 flex items-center gap-1">
                        <span className="material-symbols-outlined text-[13px]">check_circle</span>
                        Pago Verificado
                      </span>
                    ) : (
                      <span className="bg-slate-100 text-slate-500 text-[10px] font-bold px-2 py-0.5 rounded border border-slate-200">
                        Sin Registro
                      </span>
                    )}
                  </div>

                  {pagoInfo ? (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-white p-3 rounded-lg border border-slate-200/70 text-xs">
                      <div>
                        <span className="block text-slate-400 text-[10px] font-bold uppercase">ID Pago / Voucher</span>
                        <span className="font-mono font-bold text-slate-800">#{pagoInfo.id_pago}</span>
                      </div>
                      <div>
                        <span className="block text-slate-400 text-[10px] font-bold uppercase">Fecha de Pago</span>
                        <span className="font-semibold text-slate-700">{pagoInfo.fecha_pago}</span>
                      </div>
                      <div>
                        <span className="block text-slate-400 text-[10px] font-bold uppercase">Titular / Nombre</span>
                        <span className="font-semibold text-slate-700 truncate block">{pagoInfo.nombre}</span>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500 italic">No se encontró registro de comprobante de pago vinculado a este DNI.</p>
                  )}
                </div>

                {/* Sección 2: Validación de Requisitos */}
                <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/50">
                  <h3 className="font-bold text-sm text-slate-900 flex items-center justify-between mb-3">
                    <span className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-indigo-600">fact_check</span>
                      Validación de Requisitos Exigidos (Pre-Revisión)
                    </span>
                    {(r1.hasSubsanacion || r2.hasSubsanacion || r3.hasSubsanacion) && (
                      <span className="bg-teal-100 text-teal-900 font-bold text-[10px] px-2.5 py-0.5 rounded-full border border-teal-300 flex items-center gap-1">
                        <span className="material-symbols-outlined text-[13px] text-teal-700">published_with_changes</span>
                        Subsanación Detectada
                      </span>
                    )}
                  </h3>

                  <div className="space-y-3">
                    {[
                      { title: 'Requisito 1: Fotografías del Postulante', emoji: '📷', info: r1 },
                      { title: 'Requisito 2: Documento Nacional de Identidad (DNI)', emoji: '🪪', info: r2 },
                      { title: 'Requisito 3: Certificado de Estudios Secundaria', emoji: '📜', info: r3 }
                    ].map((reqItem, rIdx) => {
                      const { status, latest, hasSubsanacion, history, obsPrevia } = reqItem.info;

                      return (
                        <div key={rIdx} className="bg-white p-3 rounded-xl border border-slate-200/80 text-xs shadow-2xs">
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="font-bold text-slate-800 flex items-center gap-1.5">
                              <span>{reqItem.emoji}</span> {reqItem.title}
                            </span>
                            {status === 'aprobado' && (
                              <span className="bg-emerald-100 text-emerald-800 font-bold text-[10px] px-2 py-0.5 rounded border border-emerald-300">
                                ✅ Aprobado Directo
                              </span>
                            )}
                            {status === 'subsanado' && (
                              <span className="bg-teal-100 text-teal-900 font-black text-[10px] px-2.5 py-0.5 rounded border border-teal-400 shadow-2xs flex items-center gap-1">
                                🔄 Aprobado (Subsanado)
                              </span>
                            )}
                            {status === 'observado' && (
                              <span className="bg-amber-100 text-amber-800 font-bold text-[10px] px-2 py-0.5 rounded border border-amber-300">
                                ⚠️ Observado
                              </span>
                            )}
                            {status === 'sin_registro' && (
                              <span className="bg-slate-100 text-slate-400 font-bold text-[10px] px-2 py-0.5 rounded border border-slate-200">
                                No registrado
                              </span>
                            )}
                          </div>

                          {/* Banner de alerta de subsanación */}
                          {hasSubsanacion && (
                            <div className="my-2 p-2 bg-teal-50 border border-teal-200 rounded-lg text-teal-900 text-[11px] flex items-start gap-2">
                              <span className="material-symbols-outlined text-teal-600 text-sm mt-0.5 shrink-0">published_with_changes</span>
                              <div>
                                <strong className="font-bold">Observación Previa Subsanada:</strong>
                                <p className="text-teal-800 text-[10px] mt-0.5 leading-snug">
                                  Este requisito registró una observación previa ({obsPrevia?.fecha_validacion || obsPrevia?.fecha_subida || 'anterior'}) que fue subsanada y aprobada.
                                </p>
                              </div>
                            </div>
                          )}

                          {/* Historial de revisiones del requisito */}
                          {history.length > 0 && (
                            <div className="mt-2 border-t border-slate-100 pt-2 text-[11px]">
                              <span className="block font-bold text-slate-400 text-[9px] uppercase tracking-wider mb-1.5">
                                Historial de Revisiones ({history.length} {history.length === 1 ? 'registro' : 'registros'})
                              </span>
                              <div className="space-y-1.5">
                                {history.map((item: any, hIdx: number) => {
                                  const isApp = Number(item.valido) === 1;
                                  return (
                                    <div key={hIdx} className={`p-2 rounded-lg border ${isApp ? 'bg-emerald-50/50 border-emerald-200/60' : 'bg-amber-50/50 border-amber-200/60'}`}>
                                      <div className="flex items-center justify-between font-bold">
                                        <span className={`flex items-center gap-1 ${isApp ? 'text-emerald-800' : 'text-amber-800'}`}>
                                          {isApp ? '✅ Intento #' + (hIdx + 1) + ' — Aprobado' : '⚠️ Intento #' + (hIdx + 1) + ' — Observado'}
                                        </span>
                                        <span className="text-slate-400 text-[10px] font-mono">
                                          {item.fecha_validacion || item.fecha_subida || '--'}
                                        </span>
                                      </div>
                                      <p className="text-slate-600 text-[11px] mt-0.5">
                                        <strong className="text-slate-700">Validador:</strong> @{item.usuario_validacion || 'Sistemas'}
                                      </p>
                                      {item.observaciones && (
                                        <p className="text-amber-900 font-medium text-[11px] mt-1 bg-amber-100/70 p-1.5 rounded border border-amber-200/60 leading-snug">
                                          <strong>Observación:</strong> {item.observaciones}
                                        </p>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="bg-slate-50 border-t border-slate-200 p-4 flex justify-end shrink-0">
                <button
                  onClick={() => setSelectedApplicantDetail(null)}
                  className="px-5 py-2 bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs rounded-xl transition-colors"
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};

export default ApplicantPreReview;
