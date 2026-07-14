import React, { useState, useEffect, useRef, useMemo } from 'react';
import { supabase } from '../lib/supabaseClient';
import { safeStorage } from '../lib/safeStorage';
import { User, CVCuadroAnual, CVModalidad, CVEscuela, CVVacante } from '../types';
import Papa from 'papaparse';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
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
    'ESTADO', 'estado', 'resultado', 'RESULTADO'
  ]).toUpperCase();
  
  // Regla de descarte para evitar falsos positivos con "NO INGRESA", "NO INGRESANTE", "NO INGRESO", "NO ADMITIDO", "NO_INGRESA"
  if (val.includes('NO INGRESA') || val.includes('NO INGRESANTE') || val.includes('NO INGRESO') || val.includes('NO ADMITIDO') || val.includes('NO_INGRESA')) {
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
    const hasObsColumn = rowKeysLower.some(k => k.includes('observa') || k.includes('estado') || k.includes('result'));
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
  const nota = getRowValue(row, ['Nota', 'nota', 'NOTA', 'Puntaje', 'puntaje', 'PUNTAJE']);
  const pos = getRowValue(row, ['POS', 'Pos', 'pos', 'posicion', 'Posicion', 'puesto', 'Puesto', 'OMERITO', 'omerito', 'orden_merito']);
  
  // --- 1. Detección de la escuela a la que postuló ---
  // Primero buscamos en Escuela1 (campo clave de postulación) y sus sinónimos
  const rawPostula = getRowValue(row, ['Escuela1', 'escuela1', 'ESCUELA1', 'carrera_postula', 'CARRERA_POSTULA', 'carrera_opcion', 'CARRERA_OPCION', 'opcion', 'OPCION']);
  let schoolPostula = null;
  if (rawPostula) {
    schoolPostula = findSchool(rawPostula, escuelas);
  }
  
  // Si no se encuentra, caemos en los campos generales de carrera
  if (!schoolPostula) {
    const rawCarrera = getRowValue(row, ['Carrera', 'carrera', 'CARRERA', 'escuela', 'Escuela', 'ESCUELA', 'Programa', 'programa', 'PROGRAMA', 'Programa_Estudios', 'programa_estudio', 'PROGRAMA_ESTUDIO', 'E.P.', 'EP', 'Escuela_Profesional', 'Especialidad', 'especialidad']);
    schoolPostula = findSchool(rawCarrera, escuelas);
  }
  
  const carreraPostula = schoolPostula ? schoolPostula.codigo_carrera : (rawPostula || '');
  // --- 2. Detección de la escuela de ingreso (solo si es ingresante) ---
  const isIngresante = isAdmittedRow(row);
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
    
    // Si no se detectó un código de ingreso explícito, asumimos que ingresó a la misma carrera a la que postuló
    carreraIngreso = schoolIngreso ? schoolIngreso.codigo_carrera : (carreraPostula || '');
  }
  const grupo = getRowValue(row, ['grupo', 'Grupo', 'GRUPO', 'area', 'Area', 'AREA', 'especialidad', 'Especialidad', 'filial', 'FILIAL']);
  return {
    ...row,
    NroDocumento: dni,
    alumno: dni,
    nombre,
    Nota: nota,
    POS: pos,
    CarreraPostula: carreraPostula,
    CarreraIngreso: isIngresante ? carreraIngreso : '',
    OBSERVACION: isIngresante ? 'INGRESANTE' : '',
    grupo
  };
};

interface ApplicantPreReviewProps {
  user: User;
  notify?: (msg: string, type?: 'success'|'error'|'warning'|'info') => void;
}

export const ApplicantPreReview: React.FC<ApplicantPreReviewProps> = ({ user, notify }) => {
  const [cuadros, setCuadros] = useState<CVCuadroAnual[]>([]);
  const [modalidades, setModalidades] = useState<CVModalidad[]>([]);
  const [escuelas, setEscuelas] = useState<CVEscuela[]>([]);
  const [vacantes, setVacantes] = useState<CVVacante[]>([]);
  const [adjudicacionVacantes, setAdjudicacionVacantes] = useState<any[]>([]);

  const [selectedCuadro, setSelectedCuadro] = useState(() => safeStorage.getItem('pre_rev_selectedCuadro') || '');
  const [selectedSemestre, setSelectedSemestre] = useState(() => safeStorage.getItem('pre_rev_selectedSemestre') || '');
  const [selectedModalidad, setSelectedModalidad] = useState('');
  
  const [csvData, setCsvData] = useState<any[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  
  const [activeTab, setActiveTab] = useState<'Cobertura' | 'Lista' | 'Ranking' | 'Dashboard'>('Cobertura');
  
  const [coberturaFilterStatus, setCoberturaFilterStatus] = useState('Todos los Estados');
  const [coberturaFilterArea, setCoberturaFilterArea] = useState('Todas las Áreas');
  const [coberturaSearchQuery, setCoberturaSearchQuery] = useState('');
  const [coberturaFilterVacancies, setCoberturaFilterVacancies] = useState<'todos' | 'con-vacantes' | 'sin-vacantes'>('todos');
  const [coberturaSortBy, setCoberturaSortBy] = useState<string>('area-asc');
  
  const [listSearchTerm, setListSearchTerm] = useState('');

  const [isSaving, setIsSaving] = useState(false);
  const [isFinalized, setIsFinalized] = useState(false);
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

  const [isLoadingConfig, setIsLoadingConfig] = useState(true);
  const [isFetchingPreRevision, setIsFetchingPreRevision] = useState(false);
  const [fetchingPreRevisionMessage, setFetchingPreRevisionMessage] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

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

        if (statusRes && statusRes.success && Array.isArray(statusRes.savedModalidadIds)) {
          setSavedModalidadIds(statusRes.savedModalidadIds);
        }
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

  useEffect(() => {
    if (selectedModalidad) {
      fetchVacantesForModality(selectedModalidad);
    } else {
      setVacantes([]);
    }
  }, [selectedModalidad, allModalidades, modalidades]);

  const checkPreRevision = async (modId: string) => {
    setIsFetchingPreRevision(true);
    setFetchingPreRevisionMessage('Estableciendo conexión...');
    try {
      await new Promise(resolve => setTimeout(resolve, 150));
      setFetchingPreRevisionMessage('Descargando archivo de resultados...');
      const res = await fetch(`/api/get-pre-revision/${modId}`);
      if (!res.ok) throw new Error("Error en la respuesta del servidor");
      
      setFetchingPreRevisionMessage('Procesando y decodificando datos del archivo...');
      const result = await res.json();
      
      if (result.data && result.data.csv_data) {
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
        setCsvData(Array.isArray(parsedData) ? parsedData : []);
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
      setActiveTab('Cobertura');

      if (selectedModalidad) {
         try {
           setFetchingPreRevisionMessage('Subiendo y persistiendo archivo en el servidor...');
           const res = await fetch('/api/save-pre-revision', {
             method: 'POST',
             headers: { 'Content-Type': 'application/json' },
             body: JSON.stringify({
               modalidad_id: selectedModalidad,
               csv_data: dataToProcess
             })
           });
           const data = await res.json();
           if (!res.ok || data.error) {
             console.error("Error saving pre_revision:", data.error);
             notify?.('Archivo cargado pero no se pudo guardar en pre-revisión.', 'warning');
           } else {
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
    return (csvData || []).map(row => normalizeRow(row, escuelas));
  }, [csvData, escuelas]);

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

  const { admittedBySchool, totalApplicantsBySchool } = useMemo(() => {
    const admitted: Record<string, number> = {};
    const totalApplicants: Record<string, number> = {};
    
    // Inicializar ambas estructuras
    escuelas.forEach(e => {
      totalApplicants[e.codigo_carrera] = 0;
      admitted[e.codigo_carrera] = 0;
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
        // Contamos el ingreso solo si se consolidó como ingresante y tiene código de ingreso
        if (row.OBSERVACION === 'INGRESANTE' && row.CarreraIngreso) {
          const codeIngreso = row.CarreraIngreso;
          if (admitted[codeIngreso] !== undefined) {
            admitted[codeIngreso]++;
          }
        }
      }
    });
    return { admittedBySchool: admitted, totalApplicantsBySchool: totalApplicants };
  }, [escuelas, normalizedCsvData]);

  const coberturaRows = useMemo(() => {
    return escuelas.map(e => {
      const vac = vacanciesBySchool[e.codigo_carrera] || 0;
      const adm = admittedBySchool[e.codigo_carrera] || 0;
      const totalApp = totalApplicantsBySchool[e.codigo_carrera] || 0;
      
      if (vac > 0 || adm > 0 || totalApp > 0) {
        let status = 'Cubierto';
        if (adm < vac) status = 'Sobran Vacantes';
        if (adm > vac) status = 'Exceso de Ingresantes';

        const ratio = vac > 0 ? (totalApp / vac).toFixed(1) : '—';
        const admissionRate = totalApp > 0 ? ((adm / totalApp) * 100).toFixed(1) : '0.0';

        return {
          schoolName: e.nombre,
          schoolCode: e.codigo_carrera,
          area: e.area,
          vacancies: vac,
          admitted: adm,
          applicants: totalApp,
          difference: vac - adm,
          ratio,
          admissionRate,
          status: status
        };
      }
      return null;
    }).filter(Boolean) as any[];
  }, [escuelas, vacanciesBySchool, admittedBySchool, totalApplicantsBySchool]);

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
        if (row.OBSERVACION === 'INGRESANTE') return false;
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
  const filteredList = useMemo(() => {
    const term = listSearchTerm.toLowerCase().trim();
    if (!term) return normalizedCsvData;
    return normalizedCsvData.filter(row => {
      if (!row) return false;
      return (row.NroDocumento || '').toLowerCase().includes(term) ||
             (row.nombre || '').toLowerCase().includes(term) ||
             (row.CarreraIngreso || '').toLowerCase().includes(term) ||
             (row.CarreraPostula || '').toLowerCase().includes(term) ||
             (row.OBSERVACION || '').toLowerCase().includes(term);
    });
  }, [normalizedCsvData, listSearchTerm]);

  const getSchoolName = (code: string) => {
    if (!code) return '';
    const school = escuelas.find(e => e.codigo_carrera === code);
    return school ? school.nombre : code;
  };

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
        if (row.OBSERVACION === 'INGRESANTE') {
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
    const schoolCounts: Record<string, { total: number, admitted: number, code: string }> = {};
    normalizedCsvData.forEach(row => {
      let schVal = getRowValue(row, ['nombrecolegio', 'colegio', 'COLEGIO', 'Colegio', 'colegio_origen', 'COLEGIO_ORIGEN', 'institucion', 'IE', 'I.E.', 'nombre_ie']);
      let schCode = getRowValue(row, ['cod_colegio', 'codigo_colegio', 'COD_COLEGIO', 'CODIGO_COLEGIO', 'cod_modular', 'cod_mod']);
      
      if (!schVal && schCode) {
        schVal = `IE COD. ${schCode}`;
      } else if (!schVal) {
        schVal = 'NO ESPECIFICADO';
      } else {
        schVal = schVal.toUpperCase().replace(/\s+/g, ' ').trim();
      }
      
      const key = schCode ? `${schCode} - ${schVal}` : schVal;
      
      if (!schoolCounts[key]) {
        schoolCounts[key] = { total: 0, admitted: 0, code: schCode };
      }
      schoolCounts[key].total++;
      if (row.OBSERVACION === 'INGRESANTE') {
        schoolCounts[key].admitted++;
      }
    });

    return Object.entries(schoolCounts)
      .map(([name, stats]) => ({
        name,
        code: stats.code,
        total: stats.total,
        admitted: stats.admitted,
        ratio: stats.total > 0 ? ((stats.admitted / stats.total) * 100).toFixed(1) : '0'
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

        const isIngresante = row.OBSERVACION === 'INGRESANTE';

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
      <div className="p-6 border-b border-slate-200 bg-white">
        {isLoaded && (
          <div className="mb-4">
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
        <p className="text-slate-500 text-sm mt-1">Valide la cobertura de vacantes y cargue resultados antes de su migración oficial.</p>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        
        {/* Setup Section (Hidden if loaded) */}
        {!isLoaded && (
          <div className="max-w-3xl mx-auto space-y-6">
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-6">
            <h2 className="text-lg font-black text-slate-800 uppercase tracking-tight border-b border-slate-100 pb-2">1. Configuración de Carga</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Año (Cuadro Anual)</label>
                <select 
                  className="w-full p-3 rounded-xl border border-slate-200 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary text-sm"
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
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Semestre</label>
                <select 
                  className="w-full p-3 rounded-xl border border-slate-200 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary text-sm disabled:bg-slate-50 disabled:text-slate-400"
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
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Modalidad</label>
                <select 
                  className="w-full p-3 rounded-xl border border-slate-200 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary text-sm disabled:bg-slate-50 disabled:text-slate-400"
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
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Archivo CSV de Resultados</label>
                {isFinalized ? (
                  <div className="bg-slate-50 border-2 border-slate-200 rounded-2xl p-8 text-center flex flex-col items-center justify-center">
                    <span className="material-symbols-outlined text-4xl text-emerald-600 mb-2">verified_user</span>
                    <span className="text-sm font-black text-slate-700 uppercase tracking-wide">Proceso Aprobado y Migrado</span>
                    <p className="text-xs text-slate-500 mt-1.5 max-w-xs leading-relaxed font-semibold">
                      Este proceso ha sido cerrado de forma definitiva. Toda la información ha sido migrada con éxito a participantes y se encuentra congelada.
                    </p>
                  </div>
                ) : (
                  <div className="border-2 border-dashed border-slate-300 rounded-2xl p-8 text-center hover:bg-slate-50 transition-colors">
                    <input 
                      type="file" 
                      accept=".csv"
                      className="hidden"
                      id="csv-upload"
                      ref={fileInputRef}
                      onChange={handleFileUpload}
                    />
                    <label htmlFor="csv-upload" className="cursor-pointer flex flex-col items-center">
                      <span className="material-symbols-outlined text-4xl text-slate-400 mb-2">upload_file</span>
                      <span className="text-sm font-bold text-primary">Haz clic para subir el archivo CSV</span>
                      <span className="text-xs text-slate-500 mt-1">o arrastra y suelta aquí</span>
                    </label>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* List of active pre-revisions */}
          {savedModalidadIds.length > 0 && (
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-4">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
                <span className="material-symbols-outlined text-amber-500">list_alt</span>
                <h2 className="text-lg font-black text-slate-800 uppercase tracking-tight">Pre-revisiones guardadas activas ({savedModalidadIds.length})</h2>
              </div>
              <p className="text-slate-500 text-xs">Las siguientes modalidades ya tienen una pre-revisión de resultados cargada y guardada. Haga clic en cualquiera de ellas para ingresar y revisarla directamente.</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[300px] overflow-y-auto pr-1">
                {savedModalidadIds.map(id => {
                  const modality = allModalidades.find(m => m.id === id);
                  if (!modality) return null;
                  const cuadro = cuadros.find(c => c.id === modality.cuadro_id);
                  const isSelected = selectedModalidad === id;
                  return (
                    <button
                      key={id}
                      onClick={() => {
                        setSelectedCuadro(modality.cuadro_id);
                        setSelectedSemestre(modality.semestre);
                        setSelectedModalidad(modality.id);
                      }}
                      className={`text-left p-4 rounded-xl border transition-all flex flex-col justify-between h-full gap-2 hover:border-amber-500 hover:shadow-sm ${isSelected ? 'border-primary bg-blue-50/50' : 'border-slate-100 bg-slate-50/50'}`}
                    >
                      <div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="inline-block bg-slate-200 text-slate-700 font-bold text-[10px] px-2 py-0.5 rounded-full uppercase tracking-wider">
                            Año {cuadro ? cuadro.anio : '—'} • Sem. {modality.semestre}
                          </span>
                          <span className="flex items-center gap-0.5 text-[11px] font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> Guardado
                          </span>
                        </div>
                        <h3 className="text-sm font-bold text-slate-800 mt-2 line-clamp-2 leading-snug">{modality.nombre}</h3>
                      </div>
                      <div className="flex items-center gap-1 text-primary text-xs font-bold mt-1 uppercase tracking-wider">
                        <span className="material-symbols-outlined text-[16px]">arrow_circle_right</span>
                        Ingresar a pre-revisión
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
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
                <button 
                  onClick={clearData}
                  className="px-4 py-2 rounded-xl text-sm font-bold uppercase tracking-wider border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors flex items-center gap-2"
                >
                  <span className="material-symbols-outlined text-[18px]">clear_all</span>
                  Limpiar
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

            {/* Cobertura Tab */}
            {activeTab === 'Cobertura' && (
              <div className="space-y-6">
                
                {/* Stats */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200/80 flex items-center gap-4 relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-1 h-full bg-blue-500"></div>
                    <div className="size-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                      <span className="material-symbols-outlined text-2xl">group</span>
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Total Postulantes</p>
                      <p className="text-2xl font-black text-slate-800 tracking-tight">{normalizedCsvData.length}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">Cargados en archivo</p>
                    </div>
                  </div>
                  <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200/80 flex items-center gap-4 relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500"></div>
                    <div className="size-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                      <span className="material-symbols-outlined text-2xl">how_to_reg</span>
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Ingresantes</p>
                      <p className="text-2xl font-black text-emerald-600 tracking-tight">
                        {normalizedCsvData.filter(r => r.OBSERVACION === 'INGRESANTE').length}
                      </p>
                      <p className="text-[10px] text-slate-400 mt-0.5">Vacantes cubiertas</p>
                    </div>
                  </div>
                  <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200/80 flex items-center gap-4 relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-1 h-full bg-purple-500"></div>
                    <div className="size-12 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
                      <span className="material-symbols-outlined text-2xl">school</span>
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Vacantes Oferta</p>
                      <p className="text-2xl font-black text-slate-800 tracking-tight">
                        {(Object.values(vacanciesBySchool) as number[]).reduce((a,b) => a+b, 0)}
                      </p>
                      <p className="text-[10px] text-slate-400 mt-0.5">Disponibles en el cuadro</p>
                    </div>
                  </div>
                  <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200/80 flex items-center gap-4 relative overflow-hidden">
                    {(() => {
                      const totalVac = (Object.values(vacanciesBySchool) as number[]).reduce((a,b) => a+b, 0);
                      const totalAdm = normalizedCsvData.filter(r => r.OBSERVACION === 'INGRESANTE').length;
                      const diff = totalVac - totalAdm;
                      const isNegative = diff < 0;
                      return (
                        <>
                          <div className={`absolute top-0 left-0 w-1 h-full ${isNegative ? 'bg-rose-500' : 'bg-amber-500'}`}></div>
                          <div className={`size-12 rounded-xl flex items-center justify-center shrink-0 ${isNegative ? 'bg-rose-50 text-rose-600' : 'bg-amber-50 text-amber-600'}`}>
                            <span className="material-symbols-outlined text-2xl">event_seat</span>
                          </div>
                          <div>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">{isNegative ? 'Sobrecupo' : 'Vacantes Libres'}</p>
                            <p className={`text-2xl font-black tracking-tight ${isNegative ? 'text-rose-600' : 'text-slate-800'}`}>
                              {Math.abs(diff)}
                            </p>
                            <p className="text-[10px] text-slate-400 mt-0.5">{isNegative ? 'Exceso de ingresantes' : 'Sin adjudicar'}</p>
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
                    <p className="text-xs text-slate-400 mt-1">Análisis consolidado de vacantes, postulantes totales, ingresantes y tasa de cobertura.</p>
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
                          <th className="p-4 font-black text-center">Ingresantes</th>
                          <th className="p-4 font-black text-center">Diferencia</th>
                          <th className="p-4 font-black text-center">Ratio Competencia</th>
                          <th className="p-4 font-black text-center">Tasa de Ingreso</th>
                          <th className="p-4 font-black">Estado</th>
                        </tr>
                      </thead>
                      <tbody className="text-sm divide-y divide-slate-100">
                        {sortedCoberturaRows.length === 0 ? (
                           <tr><td colSpan={9} className="text-center p-8 text-slate-400 font-bold text-xs">No hay datos que coincidan con los filtros seleccionados</td></tr>
                        ) : (() => {
                          let lastArea = '';
                          return sortedCoberturaRows.map((row, idx) => {
                            const showAreaHeader = coberturaSortBy === 'area-asc' && row.area !== lastArea;
                            lastArea = row.area;
                            return (
                              <React.Fragment key={idx}>
                                {showAreaHeader && (
                                  <tr className="bg-slate-100/40">
                                    <td colSpan={9} className="p-3 pl-4 font-black text-xs uppercase tracking-wider text-slate-600 bg-slate-100/60">
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
                                  <td className="p-4 text-center font-black text-emerald-600">{row.admitted}</td>
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
                <div className="p-4 border-b border-slate-100 flex items-center justify-between gap-4 bg-slate-50">
                  <div className="relative flex-1 max-w-md">
                    <span className="material-symbols-outlined absolute left-3 top-2 text-slate-400">search</span>
                    <input 
                      type="text" 
                      placeholder="Buscar por DNI, alumno o nombre..." 
                      value={listSearchTerm}
                      onChange={(e) => setListSearchTerm(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                    />
                  </div>
                  <span className="text-xs font-bold text-slate-400">Mostrando {filteredList.length} registros</span>
                </div>
                <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
                  <table className="w-full text-left border-collapse">
                    <thead className="sticky top-0 bg-white shadow-sm z-10">
                      <tr className="text-slate-500 text-[10px] uppercase tracking-wider">
                        <th className="p-4 font-black">Nro Doc</th>
                        <th className="p-4 font-black">Nombre del Postulante</th>
                        <th className="p-4 font-black text-center">Nota</th>
                        <th className="p-4 font-black text-center">Puesto</th>
                        <th className="p-4 font-black">Escuela (Ingreso)</th>
                        <th className="p-4 font-black">Observación</th>
                      </tr>
                    </thead>
                    <tbody className="text-sm divide-y divide-slate-100">
                      {filteredList.map((row, idx) => {
                        const isIngresante = row.OBSERVACION?.trim().toUpperCase() === 'INGRESANTE';
                        return (
                          <tr key={idx} className={`transition-colors ${isIngresante ? 'bg-emerald-50/30 hover:bg-emerald-50' : 'hover:bg-slate-50'}`}>
                            <td className="p-4 font-mono text-slate-600">{row.NroDocumento || row.alumno}</td>
                            <td className="p-4 font-bold text-slate-800">{row.nombre}</td>
                            <td className="p-4 text-center font-black text-slate-700">{row.Nota}</td>
                            <td className="p-4 text-center font-bold text-slate-500">{row.POS}</td>
                            <td className="p-4">
                              {isIngresante ? (
                                <p className="font-bold text-primary">{getSchoolName(row.CarreraIngreso)}</p>
                              ) : (
                                <p className="text-slate-400 italic text-xs">--</p>
                              )}
                            </td>
                            <td className="p-4">
                              {isIngresante ? (
                                <span className="bg-emerald-100 text-emerald-700 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full">
                                  Ingresante
                                </span>
                              ) : null}
                            </td>
                          </tr>
                        );
                      })}
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
                        {normalizedCsvData.filter(r => r.OBSERVACION === 'INGRESANTE').length}
                      </p>
                      <p className="text-xs font-bold text-emerald-500 bg-emerald-50 px-1.5 py-0.5 rounded">
                        {normalizedCsvData.length > 0 ? ((normalizedCsvData.filter(r => r.OBSERVACION === 'INGRESANTE').length / normalizedCsvData.length) * 100).toFixed(1) : '0'}%
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
                                <span className={`shrink-0 text-[10px] font-black px-2 py-0.5 rounded-full uppercase ${
                                  parseFloat(school.ratio) > 20 ? 'bg-emerald-100 text-emerald-700' :
                                  parseFloat(school.ratio) > 5 ? 'bg-blue-100 text-blue-700' :
                                  'bg-slate-100 text-slate-600'
                                }`}>
                                  {school.ratio}% de éxito
                                </span>
                              </div>
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
    </div>
  );
};

export default ApplicantPreReview;
