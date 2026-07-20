import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { User } from '../types';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// --- INDEXEDDB DEFINITION FOR LOCAL OFFLINE STORAGE ---
interface LocalFileRecord {
  id: string; // "table-id"
  name: string;
  url: string;
  size?: number;
  blob: Blob;
  timestamp: number;
  creation_date: string;
  sourceTable: string;
}

const openLocalDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('UnsaacLocalDocsDB', 1);
    request.onupgradeneeded = (event) => {
      const db = request.result;
      if (!db.objectStoreNames.contains('archivos_locales')) {
        db.createObjectStore('archivos_locales', { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

const saveFileToLocalDB = async (file: Omit<LocalFileRecord, 'blob'>, blob: Blob): Promise<void> => {
  const db = await openLocalDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('archivos_locales', 'readwrite');
    const store = transaction.objectStore('archivos_locales');
    const request = store.put({ ...file, blob });
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

const getLocalFileFromDB = async (id: string): Promise<LocalFileRecord | null> => {
  const db = await openLocalDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('archivos_locales', 'readonly');
    const store = transaction.objectStore('archivos_locales');
    const request = store.get(id);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
};

const getAllLocalFilesFromDB = async (): Promise<LocalFileRecord[]> => {
  const db = await openLocalDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('archivos_locales', 'readonly');
    const store = transaction.objectStore('archivos_locales');
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
};

const deleteFileFromLocalDB = async (id: string): Promise<void> => {
  const db = await openLocalDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('archivos_locales', 'readwrite');
    const store = transaction.objectStore('archivos_locales');
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
};

// Helper to extract the filename/storage path from a standard Supabase public Storage URL
const getStoragePathFromUrl = (url: string) => {
  if (!url) return null;
  if (url === 'archivado_local') return null;
  const marker = '/public/documentos/';
  const idx = url.indexOf(marker);
  if (idx !== -1) {
    return decodeURIComponent(url.substring(idx + marker.length));
  }
  return null;
};

export const DataCleanup = ({ user }: { user: User }) => {
  // Navigation Tabs state
  const [activeTab, setActiveTab] = useState<'homologacion' | 'pdf_backups' | 'reporte_ingresantes'>('homologacion');

  // New states for PDF backups
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfFiles, setPdfFiles] = useState<any[]>([]);
  const [localIds, setLocalIds] = useState<Set<string>>(new Set());
  const [syncProgress, setSyncProgress] = useState<{current: number, total: number, active: boolean}>({current: 0, total: 0, active: false});
  const [pdfFilter, setPdfFilter] = useState<'all' | 'pending' | 'saved' | 'archived'>('all');
  const [pdfSearch, setPdfSearch] = useState('');
  const [pdfSyncingId, setPdfSyncingId] = useState<string | null>(null);

  // States for Homologacion
  const [selectedField, setSelectedField] = useState<'CARRERA' | 'MODALIDAD' | 'FILIAL'>('CARRERA');
  const [selectedYear, setSelectedYear] = useState<string>('Todos');
  const [years, setYears] = useState<string[]>([]);
  const [filterCombos, setFilterCombos] = useState<{anio: string, semestre: string, carrera: string, modalidad: string}[]>([]);
  const [dataStats, setDataStats] = useState<{ value: string; count: number }[]>([]);
  
  const [loading, setLoading] = useState(false);
  const [loadingYears, setLoadingYears] = useState(false);
  
  const [replaceTarget, setReplaceTarget] = useState<string | null>(null);
  const [newValue, setNewValue] = useState<string>('');
  const [updating, setUpdating] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [alertMessage, setAlertMessage] = useState<{type: 'success' | 'error' | 'info', text: string} | null>(null);

  const [selectedCode, setSelectedCode] = useState<string>(''); // For the input if they want to edit the suggested code

  // References for suggestions
  const [carrerasData, setCarrerasData] = useState<{nombre: string, codigo_carrera: string}[]>([]);
  const [modalidadesRef, setModalidadesRef] = useState<string[]>([]);

  // States for Reporte Ingresantes
  const [reportYear, setReportYear] = useState<string>('Todos');
  const [reportSemester, setReportSemester] = useState<string>('Todos');
  const [reportCareer, setReportCareer] = useState<string>('Todos');
  const [reportModality, setReportModality] = useState<string>('Todos');
  const [reportData, setReportData] = useState<any[]>([]);
  const [loadingReport, setLoadingReport] = useState(false);
  const [semesters, setSemesters] = useState<string[]>([]);
  const [reportCareers, setReportCareers] = useState<string[]>([]);
  const [reportModalities, setReportModalities] = useState<string[]>([]);
  
  useEffect(() => {
    if (filterCombos.length > 0) {
      let filteredCombos = filterCombos;
      if (reportYear !== 'Todos') {
        filteredCombos = filteredCombos.filter(c => c.anio === reportYear);
      }
      const uniqueSemesters = Array.from(new Set(filteredCombos.map(c => c.semestre).filter(Boolean))).sort();
      setSemesters(uniqueSemesters as string[]);
      
      // If the currently selected semester is not in the new list, reset to 'Todos'
      if (reportSemester !== 'Todos' && !uniqueSemesters.includes(reportSemester)) {
        setReportSemester('Todos');
      }
      
      if (reportSemester !== 'Todos') {
        filteredCombos = filteredCombos.filter(c => c.semestre === reportSemester);
      }
      
      const uniqueCareers = Array.from(new Set(filteredCombos.map(c => c.carrera).filter(Boolean))).sort();
      setReportCareers(uniqueCareers as string[]);
      if (reportCareer !== 'Todos' && !uniqueCareers.includes(reportCareer)) {
        setReportCareer('Todos');
      }
      
      if (reportCareer !== 'Todos') {
        filteredCombos = filteredCombos.filter(c => c.carrera === reportCareer);
      }
      
      const uniqueModalities = Array.from(new Set(filteredCombos.map(c => c.modalidad).filter(Boolean))).sort();
      setReportModalities(uniqueModalities as string[]);
      if (reportModality !== 'Todos' && !uniqueModalities.includes(reportModality)) {
        setReportModality('Todos');
      }
    }
  }, [reportYear, reportSemester, reportCareer, filterCombos]);

  useEffect(() => {
      const fetchRefs = async () => {
          try {
              const { data: escData } = await supabase.from('cv_escuelas').select('nombre, codigo_carrera');
              if (escData) {
                  // Keep the actual objects for the data
                  setCarrerasData(escData);
              }
              
              const { data: modData } = await supabase.from('cv_modalidades').select('nombre');
              if (modData) setModalidadesRef(Array.from(new Set(modData.map(m => m.nombre.toUpperCase()))).sort());
          } catch (e) {
              console.error("Refs error", e);
          }
      };
      fetchRefs();
  }, []);

  const fetchYears = async () => {
     setLoadingYears(true);
     try {
         let allCombos: {anio: string, semestre: string, carrera: string, modalidad: string}[] = [];
         let start = 0;
         let step = 1000;
         let hasMore = true;
         while(hasMore) {
             const { data, error } = await supabase.from('participantes').select('ANIO, SEMESTRE, CARRERA, MODALIDAD').range(start, start + step - 1);
             if (error) break;
             if (data && data.length > 0) {
                 allCombos.push(...data.map(d => ({ anio: d.ANIO, semestre: d.SEMESTRE, carrera: d.CARRERA, modalidad: d.MODALIDAD })));
                 if (data.length < step) hasMore = false;
                 else start += step;
             } else {
                 hasMore = false;
             }
         }
         
         // Remove duplicates
         const uniqueCombosMap = new Map();
         allCombos.forEach(c => {
             const key = `${c.anio}|${c.semestre}|${c.carrera}|${c.modalidad}`;
             if (!uniqueCombosMap.has(key)) {
                 uniqueCombosMap.set(key, c);
             }
         });
         const uniqueCombos = Array.from(uniqueCombosMap.values());
         setFilterCombos(uniqueCombos);
         
         const uniqueYears = Array.from(new Set(uniqueCombos.map(c => c.anio).filter(Boolean))).sort((a: any, b: any) => b - a);
         setYears(uniqueYears as string[]);
         
         const uniqueSemesters = Array.from(new Set(uniqueCombos.map(c => c.semestre).filter(Boolean))).sort();
         setSemesters(uniqueSemesters as string[]);
         
     } finally {
         setLoadingYears(false);
     }
  };

  useEffect(() => {
     fetchYears();
  }, []);

  const fetchDataStats = async () => {
      setLoading(true);
      setDataStats([]);
      try {
          const counts: Record<string, number> = {};
          let start = 0;
          let step = 1000;
          let hasMore = true;
          
          while(hasMore) {
              let query = supabase.from('participantes').select(selectedField).range(start, start + step - 1);
              if (selectedYear !== 'Todos') {
                 query = query.eq('ANIO', selectedYear);
              }
              const { data, error } = await query;
              if (error) throw error;
              if (data && data.length > 0) {
                  data.forEach(d => {
                      const val = d[selectedField];
                      // Trim strictly, treat completely empty or whitespace as SIN ASIGNAR
                      const normalizedVal = (val === null || val === undefined || (typeof val === 'string' && val.trim() === '')) ? 'SIN ASIGNAR' : String(val);
                      counts[normalizedVal] = (counts[normalizedVal] || 0) + 1;
                  });
                  if (data.length < step) hasMore = false;
                  else start += step;
              } else {
                  hasMore = false;
              }
          }
          
          const statsArray = Object.entries(counts).map(([v, c]) => ({ value: v, count: c }));
          statsArray.sort((a, b) => {
              if (a.value === 'SIN ASIGNAR') return 1;
              if (b.value === 'SIN ASIGNAR') return -1;
              return b.count - a.count; // Sort by count descending
          });
          setDataStats(statsArray);
      } catch (err: any) {
          setAlertMessage({ type: 'error', text: 'Error: ' + err.message });
      } finally {
          setLoading(false);
      }
  };

  useEffect(() => {
      fetchDataStats();
      setReplaceTarget(null);
      setNewValue('');
  }, [selectedField, selectedYear]);

  // Normalize string for comparison (remove accents)
  const normalizeForMatch = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim();

  const handleSelectTarget = (targetVal: string) => {
      setReplaceTarget(targetVal);
      if (targetVal === 'SIN ASIGNAR') {
          setNewValue('');
          setSelectedCode('');
          return;
      }
      
      const normalizedTarget = normalizeForMatch(targetVal);
      // Try to find a match (exact after normalization)
      if (selectedField === 'CARRERA') {
          const suggestion = carrerasData.find(r => normalizeForMatch(r.nombre) === normalizedTarget);
          if (suggestion) {
              setNewValue(suggestion.nombre.toUpperCase());
              setSelectedCode(suggestion.codigo_carrera || '');
          } else {
              setNewValue(targetVal); // fallback to same
              setSelectedCode('');
          }
      } else {
          const refs = selectedField === 'MODALIDAD' ? modalidadesRef : [];
          const suggestion = refs.find(r => normalizeForMatch(r) === normalizedTarget);
          
          if (suggestion) {
              setNewValue(suggestion);
          } else {
              setNewValue(targetVal); // fallback to same
          }
          setSelectedCode('');
      }
  };

  const handleUpdateClick = () => {
      if (!replaceTarget || newValue.trim() === '') {
          setAlertMessage({ type: 'error', text: 'Por favor, selecciona un registro y escribe el nuevo valor.' });
          return;
      }
      setShowConfirmModal(true);
  };

  const executeUpdate = async () => {
      setShowConfirmModal(false);
      setUpdating(true);
      const targetIsUnassigned = replaceTarget === 'SIN ASIGNAR';
      try {
          const updateData: any = { [selectedField]: newValue };
          
          if (selectedField === 'CARRERA' && selectedCode.trim() !== '') {
             updateData.codigo_carrera = selectedCode;
          }

          let updateQuery = supabase.from('participantes').update(updateData);
          
          if (targetIsUnassigned) {
              updateQuery = updateQuery.or(`${selectedField}.is.null,${selectedField}.eq.,${selectedField}.eq. `);
          } else {
              updateQuery = updateQuery.eq(selectedField, replaceTarget);
          }

          if (selectedYear !== 'Todos') {
              updateQuery = updateQuery.eq('ANIO', selectedYear);
          }

          const { error, count } = await updateQuery.select('id');
          if (error) throw error;

          setAlertMessage({ type: 'success', text: `¡Actualización completa! Se actualizaron correctamente los registros a "${newValue}".` });
          setReplaceTarget(null);
          setNewValue('');
          fetchDataStats();
      } catch (err: any) {
          console.error("Update Error: ", err);
          setAlertMessage({ type: 'error', text: 'Error al actualizar: ' + err.message });
      } finally {
          setUpdating(false);
      }
  };

  // --- PDF BACKUPS & CLOUD CLEANUP LOGIC ---
  const fetchPdfRecords = async () => {
    setPdfLoading(true);
    try {
      const list: any[] = [];
      const today = new Date();

      // 1. Expedientes Salida
      const { data: expSal } = await supabase
        .from('expedientes_salida')
        .select('id, doc_type, doc_number, destination, pdf_url, created_at')
        .not('pdf_url', 'is', null)
        .neq('pdf_url', '');
      
      if (expSal) {
        expSal.forEach(d => {
          const createDate = new Date(d.created_at);
          const diffDays = Math.ceil(Math.abs(today.getTime() - createDate.getTime()) / (1000 * 60 * 60 * 24));
          const storagePath = getStoragePathFromUrl(d.pdf_url);
          
          list.push({
            id: `expedientes_salida-${d.id}`,
            rawId: d.id,
            name: `${d.doc_type} N° ${d.doc_number || 'S/N'}`,
            detail: `Destinatario: ${d.destination || 'N/A'}`,
            url: d.pdf_url,
            storagePath,
            created_at: d.created_at,
            diffDays,
            table: 'expedientes_salida',
            sourceLabel: 'Expediente de Salida'
          });
        });
      }

      // 2. Renuncias
      const { data: ren } = await supabase
        .from('renuncias')
        .select('id, student_name, expediente_number, informe_pdf, created_at')
        .not('informe_pdf', 'is', null)
        .neq('informe_pdf', '');

      if (ren) {
        ren.forEach(d => {
          const createDate = new Date(d.created_at);
          const diffDays = Math.ceil(Math.abs(today.getTime() - createDate.getTime()) / (1000 * 60 * 60 * 24));
          const storagePath = getStoragePathFromUrl(d.informe_pdf);

          list.push({
            id: `renuncias-${d.id}`,
            rawId: d.id,
            name: `Renuncia: ${d.student_name || 'Estudiante'}`,
            detail: `Expediente de Referencia: ${d.expediente_number || 'N/A'}`,
            url: d.informe_pdf,
            storagePath,
            created_at: d.created_at,
            diffDays,
            table: 'renuncias',
            sourceLabel: 'Renuncias'
          });
        });
      }

      // 3. Resoluciones
      const { data: res } = await supabase
        .from('resolutions')
        .select('id, number, title, pdf_url, created_at')
        .not('pdf_url', 'is', null)
        .neq('pdf_url', '');

      if (res) {
        res.forEach(d => {
          const createDate = new Date(d.created_at);
          const diffDays = Math.ceil(Math.abs(today.getTime() - createDate.getTime()) / (1000 * 60 * 60 * 24));
          const storagePath = getStoragePathFromUrl(d.pdf_url);

          list.push({
            id: `resolutions-${d.id}`,
            rawId: d.id,
            name: `Resolución N° ${d.number || 'S/N'}`,
            detail: d.title || 'Resolución guardada',
            url: d.pdf_url,
            storagePath,
            created_at: d.created_at,
            diffDays,
            table: 'resolutions',
            sourceLabel: 'Resoluciones'
          });
        });
      }

      // 4. Actas de Sesión
      const { data: act } = await supabase
        .from('actas_sesiones')
        .select('id, numero_acta, fecha_sesion, pdf_url, created_at')
        .not('pdf_url', 'is', null)
        .neq('pdf_url', '');

      if (act) {
        act.forEach(d => {
          const createDate = new Date(d.created_at);
          const diffDays = Math.ceil(Math.abs(today.getTime() - createDate.getTime()) / (1000 * 60 * 60 * 24));
          const storagePath = getStoragePathFromUrl(d.pdf_url);

          list.push({
            id: `actas_sesiones-${d.id}`,
            rawId: d.id,
            name: `Acta de Sesión N° ${d.numero_acta || 'S/N'}`,
            detail: `Fecha Sesión: ${d.fecha_sesion || 'N/A'}`,
            url: d.pdf_url,
            storagePath,
            created_at: d.created_at,
            diffDays,
            table: 'actas_sesiones',
            sourceLabel: 'Actas de Sesión'
          });
        });
      }

      // 5. Reserva de Vacantes
      const { data: resVac } = await supabase
        .from('reserva_vacantes_bloques')
        .select('id, resolution_number, report_code, pdf_url, created_at')
        .not('pdf_url', 'is', null)
        .neq('pdf_url', '');

      if (resVac) {
        resVac.forEach(d => {
          const createDate = new Date(d.created_at);
          const diffDays = Math.ceil(Math.abs(today.getTime() - createDate.getTime()) / (1000 * 60 * 60 * 24));
          const storagePath = getStoragePathFromUrl(d.pdf_url);

          list.push({
            id: `reserva_vacantes_bloques-${d.id}`,
            rawId: d.id,
            name: `Ficha Reserva: ${d.resolution_number || d.report_code || 'S/N'}`,
            detail: `Código de Reporte: ${d.report_code || 'N/A'}`,
            url: d.pdf_url,
            storagePath,
            created_at: d.created_at,
            diffDays,
            table: 'reserva_vacantes_bloques',
            sourceLabel: 'Reserva de Vacantes'
          });
        });
      }

      // Sort with oldest documents first (greater diffDays)
      list.sort((a, b) => b.diffDays - a.diffDays);
      setPdfFiles(list);

      // Fetch currently indexed offline files
      const localDocs = await getAllLocalFilesFromDB();
      const localDocIds = new Set(localDocs.map(d => d.id));
      setLocalIds(localDocIds);

    } catch (e: any) {
      console.error("Error cargando registros PDF: ", e);
      setAlertMessage({ type: 'error', text: 'Error al escanear PDFs en la nube: ' + e.message });
    } finally {
      setPdfLoading(false);
    }
  };

  const syncSingleFile = async (item: any) => {
    setPdfSyncingId(item.id);
    try {
      if (item.url === 'archivado_local') {
        throw new Error("El archivo ya fue removido de Supabase. No se puede sincronizar de nuevo.");
      }

      const response = await fetch(item.url);
      if (!response.ok) {
        throw new Error("No se pudo obtener el PDF desde Supabase. Probablemente fue eliminado o el token expiró.");
      }
      const blob = await response.blob();
      
      await saveFileToLocalDB({
        id: item.id,
        name: item.name,
        url: item.url,
        size: blob.size,
        timestamp: Date.now(),
        creation_date: item.created_at,
        sourceTable: item.table
      }, blob);

      setLocalIds(prev => {
        const copy = new Set(prev);
        copy.add(item.id);
        return copy;
      });

      setAlertMessage({ type: 'success', text: `¡"${item.name}" guardado exitosamente en la base de datos local!` });
      return true;
    } catch (err: any) {
      console.error("Error al sincronizar archivo:", err);
      setAlertMessage({ type: 'error', text: `Falló al guardar localmente: ${err.message}` });
      return false;
    } finally {
      setPdfSyncingId(null);
    }
  };

  const syncAllPending = async () => {
    const pendingToSync = pdfFiles.filter(item => item.diffDays > 30 && item.url !== 'archivado_local' && !localIds.has(item.id));
    if (pendingToSync.length === 0) {
      setAlertMessage({ type: 'info', text: "No hay archivos de más de 30 días pendientes de respaldar." });
      return;
    }

    if (!window.confirm(`Se descargarán y guardarán localmente ${pendingToSync.length} archivos de más de 30 días en tu navegador. ¿Proceder?`)) {
      return;
    }

    setSyncProgress({ current: 0, total: pendingToSync.length, active: true });
    let successCount = 0;

    for (let i = 0; i < pendingToSync.length; i++) {
      const item = pendingToSync[i];
      setSyncProgress(prev => ({ ...prev, current: i + 1 }));
      
      try {
        const response = await fetch(item.url);
        if (response.ok) {
          const blob = await response.blob();
          await saveFileToLocalDB({
            id: item.id,
            name: item.name,
            url: item.url,
            size: blob.size,
            timestamp: Date.now(),
            creation_date: item.created_at,
            sourceTable: item.table
          }, blob);
          successCount++;
        }
      } catch (err) {
        console.error(`Error syncing batch file ${item.name}:`, err);
      }
    }

    // Refresh local ids list
    const localDocs = await getAllLocalFilesFromDB();
    const localDocIds = new Set(localDocs.map(d => d.id));
    setLocalIds(localDocIds);

    setSyncProgress({ current: 0, total: 0, active: false });
    setAlertMessage({ type: 'success', text: `Sincronización completa: ${successCount} de ${pendingToSync.length} archivos guardados localmente.` });
  };

  const handleFreeCloudSpace = async (item: any) => {
    if (!localIds.has(item.id)) {
      setAlertMessage({ type: 'error', text: "Primero debes guardar el archivo de forma local antes de eliminarlo de Supabase." });
      return;
    }

    if (!window.confirm(`ATENCIÓN: Se eliminará permanentemente el archivo PDF "${item.name}" de Supabase Storage para liberar espacio. Ya está respaldado en tu base de datos local. ¿Continuar con la eliminación en la nube?`)) {
      return;
    }

    try {
      if (!item.storagePath) {
        throw new Error("No se pudo detectar la ruta del archivo en Supabase Storage.");
      }

      // Delete from storage
      const { error: storageError } = await supabase.storage
        .from('documentos')
        .remove([item.storagePath]);

      if (storageError) {
        console.warn("Storage removal warning:", storageError);
      }

      // Update table index
      let updateCol = 'pdf_url';
      if (item.table === 'renuncias') {
        updateCol = 'informe_pdf';
      }

      const { error: dbError } = await supabase
        .from(item.table)
        .update({ [updateCol]: 'archivado_local' })
        .eq('id', item.rawId);

      if (dbError) throw dbError;

      // Update local state
      setPdfFiles(prev => prev.map(f => {
        if (f.id === item.id) {
          return { ...f, url: 'archivado_local' };
        }
        return f;
      }));

      setAlertMessage({ type: 'success', text: "Espacio liberado en Supabase Storage. El archivo original sigue disponible localmente." });
    } catch (err: any) {
      console.error("Error freeing space:", err);
      setAlertMessage({ type: 'error', text: 'Error al depurar Supabase: ' + err.message });
    }
  };

  const downloadLocalCachedFile = async (item: any) => {
    try {
      const cached = await getLocalFileFromDB(item.id);
      if (!cached || !cached.blob) {
        throw new Error("No se encontró el archivo físico en la base de datos local.");
      }

      const downloadUrl = window.URL.createObjectURL(cached.blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = `${item.name.replace(/[^a-zA-Z0-9.-]/g, '_')}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(downloadUrl);
    } catch (err: any) {
      setAlertMessage({ type: 'error', text: err.message });
    }
  };

  const handleDeleteFromLocal = async (id: string, name: string) => {
    if (!window.confirm(`¿Estás seguro/a de quitar el respaldo local de "${name}"? Si el archivo ya se borró de la nube, se perderá permanentemente.`)) {
      return;
    }
    
    try {
      await deleteFileFromLocalDB(id);
      setLocalIds(prev => {
        const copy = new Set(prev);
        copy.delete(id);
        return copy;
      });
      setAlertMessage({ type: 'success', text: "Respaldo local quitado." });
    } catch (err: any) {
      setAlertMessage({ type: 'error', text: "Error: " + err.message });
    }
  };

  useEffect(() => {
    if (activeTab === 'pdf_backups') {
      fetchPdfRecords();
    }
  }, [activeTab]);

  if (user.role !== 'Administrador') {
    return <div className="p-8 text-center text-slate-500 font-bold uppercase tracking-widest animate-pulse">Acceso Denegado</div>;
  }

  return (
    <div className="h-full flex flex-col pt-4 md:p-8 animate-in fade-in slide-in-from-bottom-4">
      
      {/* Dynamic Header & Tab Navigation */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-6 px-4 md:px-0 shrink-0">
        <div className="flex flex-col gap-0.5">
          <h1 className="text-xl md:text-3xl font-black text-slate-800 tracking-tight flex items-center gap-3">
            <span className="material-symbols-outlined text-primary text-3xl md:text-4xl">cleaning_services</span>
            Mantenimiento y Respaldo de Datos
          </h1>
          <p className="text-xs md:text-sm text-slate-500 font-medium">
            Depura, homologa registros históricos de posgrado y gestiona copias de seguridad locales de PDFs de forma offline.
          </p>
        </div>

        {/* Tab Controls */}
        <div className="flex gap-1 bg-slate-100 p-1 rounded-2xl border border-slate-200 self-start lg:self-auto shrink-0 shadow-sm col-span-2">
          <button 
            onClick={() => setActiveTab('homologacion')} 
            className={`flex items-center gap-1.5 px-4 py-2 text-xs font-black uppercase tracking-wider rounded-xl transition-all cursor-pointer ${activeTab === 'homologacion' ? 'bg-white text-slate-800 shadow-sm font-black' : 'text-slate-500 hover:text-slate-800 font-medium'}`}
          >
            <span className="material-symbols-outlined text-[16px]">edit_road</span>
            Homologación
          </button>
          <button 
            onClick={() => setActiveTab('pdf_backups')} 
            className={`flex items-center gap-1.5 px-4 py-2 text-xs font-black uppercase tracking-wider rounded-xl transition-all relative cursor-pointer ${activeTab === 'pdf_backups' ? 'bg-white text-slate-800 shadow-sm font-black' : 'text-slate-500 hover:text-slate-800 font-medium'}`}
          >
            <span className="material-symbols-outlined text-[16px]">cloud_sync</span>
            Copia Local PDF
            {pdfFiles.filter(f => f.diffDays > 30 && f.url !== 'archivado_local' && !localIds.has(f.id)).length > 0 && (
              <span className="absolute -top-1.5 -right-1.5 flex size-5 bg-amber-500 border-2 border-white text-white font-bold rounded-full text-[8px] items-center justify-center shadow animate-pulse">
                {pdfFiles.filter(f => f.diffDays > 30 && f.url !== 'archivado_local' && !localIds.has(f.id)).length}
              </span>
            )}
          </button>
          <button 
            onClick={() => setActiveTab('reporte_ingresantes')} 
            className={`flex items-center gap-1.5 px-4 py-2 text-xs font-black uppercase tracking-wider rounded-xl transition-all cursor-pointer ${activeTab === 'reporte_ingresantes' ? 'bg-white text-slate-800 shadow-sm font-black' : 'text-slate-500 hover:text-slate-800 font-medium'}`}
          >
            <span className="material-symbols-outlined text-[16px]">summarize</span>
            Reporte Ingresantes
          </button>
        </div>
      </div>

      {activeTab === 'homologacion' && (
        <div className="flex flex-col md:flex-row gap-6 h-full min-h-0 overflow-hidden px-4 md:px-0 pb-4 md:pb-0">
          
          {/* Panel Izquierdo: Controles y Lista */}
          <div className="w-full md:w-2/3 flex flex-col gap-4 min-h-0 shrink-0">
            <div className="flex flex-col sm:flex-row gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm shrink-0">
              <div className="flex-1">
                <label className="block text-[10px] font-black tracking-widest text-slate-400 uppercase mb-1">Campo a Analizar</label>
                <select 
                  value={selectedField}
                  onChange={(e) => setSelectedField(e.target.value as any)}
                  className="w-full bg-slate-50 border border-slate-200 text-slate-800 text-xs font-bold rounded-xl px-4 py-2.5 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all cursor-pointer"
                >
                  <option value="CARRERA">CARRERA / ESCUELA</option>
                  <option value="MODALIDAD">MODALIDAD DE INGRESO</option>
                  <option value="FILIAL">FILIAL</option>
                </select>
              </div>
              <div className="flex-1">
                <label className="block text-[10px] font-black tracking-widest text-slate-400 uppercase mb-1">Filtro de Año</label>
                <select 
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 text-slate-800 text-xs font-bold rounded-xl px-4 py-2.5 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all cursor-pointer"
                >
                  <option value="Todos">Todos los Años (Global)</option>
                  {loadingYears ? <option disabled>Cargando años...</option> : years.map(y => (
                      <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-end">
                  <button 
                    onClick={fetchDataStats}
                    disabled={loading}
                    className="bg-primary hover:bg-primary/90 disabled:opacity-50 text-white font-bold py-2.5 px-4 rounded-xl text-xs flex items-center justify-center gap-2 transition-all h-10 w-full sm:w-auto cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[18px]">refresh</span>
                    {loading ? 'Analizando...' : 'Analizar'}
                  </button>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col min-h-0 flex-1 relative">
              {loading && (
                  <div className="absolute inset-0 bg-white/80 backdrop-blur-sm z-10 flex flex-col items-center justify-center rounded-2xl">
                      <span className="material-symbols-outlined text-primary animate-spin text-4xl mb-4">refresh</span>
                      <p className="font-bold text-slate-600">Escaneando miles de registros...</p>
                      <p className="text-xs text-slate-400">Agrupando valores únicos, por favor espere.</p>
                  </div>
              )}
              
              <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 rounded-t-2xl shrink-0">
                 <h3 className="font-black text-slate-700 text-xs uppercase tracking-widest flex items-center gap-2">
                   <span className="material-symbols-outlined text-[16px] text-slate-400">list_alt</span>
                   Valores Encontrados ({dataStats.length})
                 </h3>
                 <span className="text-[10px] bg-white border border-slate-200 px-2 py-1 rounded-md text-slate-500 font-bold uppercase tracking-widest shadow-sm">
                   {selectedYear === 'Todos' ? 'Histórico Global' : `Año ${selectedYear}`}
                 </span>
              </div>

              <div className="flex-1 overflow-y-auto min-h-0 p-2">
                  {dataStats.length === 0 && !loading && (
                      <div className="h-full flex flex-col items-center justify-center text-slate-400">
                          <span className="material-symbols-outlined text-4xl mb-2 opacity-50">search_off</span>
                          <p className="text-sm font-medium">No se encontraron datos.</p>
                      </div>
                  )}
                  <div className="flex flex-col gap-1">
                      {dataStats.map((item, idx) => (
                          <button 
                            key={idx}
                            onClick={() => handleSelectTarget(item.value)}
                            className={`w-full text-left flex justify-between items-center p-3 rounded-xl border transition-all cursor-pointer ${replaceTarget === item.value ? 'bg-primary/5 border-primary/30 ring-1 ring-primary/20' : 'bg-white border-transparent hover:bg-slate-50 hover:border-slate-200'}`}
                          >
                             <div className="flex items-center gap-3 overflow-hidden">
                                 <div className={`size-8 rounded-full flex items-center justify-center shrink-0 ${replaceTarget === item.value ? 'bg-primary text-white' : 'bg-slate-100 text-slate-400'}`}>
                                   <span className="material-symbols-outlined text-sm">
                                       {item.value === 'SIN ASIGNAR' ? 'warning' : 'label'}
                                   </span>
                                 </div>
                                 <span className={`text-xs font-bold truncate ${item.value === 'SIN ASIGNAR' ? 'text-red-500 italic' : 'text-slate-700'}`}>
                                    {item.value}
                                 </span>
                             </div>
                             <div className="flex flex-col items-end shrink-0 pl-2">
                                 <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-widest">
                                    {item.count} REG.
                                 </span>
                             </div>
                          </button>
                      ))}
                  </div>
              </div>
            </div>
          </div>

          {/* Panel Derecho: Editor de Homologación */}
          <div className="w-full md:w-1/3 flex flex-col gap-4 shrink-0 overflow-y-auto">
             <div className={`bg-white p-5 rounded-2xl border shadow-sm transition-all duration-500 ${replaceTarget ? 'border-primary/40 ring-4 ring-primary/5' : 'border-slate-200 opacity-60'}`}>
                <div className="flex items-center gap-3 mb-6">
                   <div className={`size-10 rounded-xl flex items-center justify-center ${replaceTarget ? 'bg-primary text-white shadow-md shadow-primary/20' : 'bg-slate-100 text-slate-400'}`}>
                      <span className="material-symbols-outlined">edit_note</span>
                   </div>
                   <div>
                      <h2 className="font-black text-slate-800 uppercase tracking-tight text-sm">Ejecutar Corrección</h2>
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Aplicar parche global</p>
                   </div>
                </div>

                {!replaceTarget ? (
                    <div className="text-center p-8 border-2 border-dashed border-slate-200 rounded-xl bg-slate-50">
                       <span className="material-symbols-outlined text-slate-300 text-4xl mb-2">touch_app</span>
                       <p className="text-xs font-medium text-slate-500">Selecciona un valor de la lista de la izquierda para corregirlo.</p>
                    </div>
                ) : (
                    <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-right-4">
                        
                        <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl text-amber-800">
                           <p className="text-xs font-bold mb-1 flex items-center gap-1">
                               <span className="material-symbols-outlined text-sm">info</span>
                               Valor Actual Seleccionado:
                           </p>
                           <p className={`text-sm font-black break-words ${replaceTarget === 'SIN ASIGNAR' ? 'italic' : ''}`}>
                               {replaceTarget}
                           </p>
                           <p className="text-[10px] mt-2 font-bold uppercase tracking-widest opacity-70">
                               Afectará a {dataStats.find(d => d.value === replaceTarget)?.count || 0} registros
                               {selectedYear !== 'Todos' && ` del año ${selectedYear}`}.
                           </p>
                        </div>

                        <div className="flex flex-col gap-1.5 mt-2">
                           <label className="text-[10px] font-black tracking-widest text-slate-400 uppercase">
                               Nuevo Valor Correcto
                           </label>
                           <div className="relative">
                               <input 
                                 type="text" 
                                 value={newValue}
                                 onChange={e => setNewValue(e.target.value.toUpperCase())}
                                 list="suggestionsList"
                                 className="w-full bg-slate-50 border border-slate-200 text-slate-800 font-bold rounded-xl px-4 py-3 pl-10 outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all uppercase"
                                 placeholder="Ej. INGENIERÍA CIVIL"
                               />
                               <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[18px]">
                                  spellcheck
                               </span>
                               <datalist id="suggestionsList">
                                   {selectedField === 'CARRERA' && Array.from(new Set(carrerasData.map(c => c.nombre.toUpperCase()))).sort().map(c => <option key={c} value={c} />)}
                                   {selectedField === 'MODALIDAD' && modalidadesRef.map(m => <option key={m} value={m} />)}
                               </datalist>
                           </div>
                           <p className="text-[10px] text-slate-500 mt-1 pl-1">El valor será convertido a MAYÚSCULAS automáticamente.</p>
                        </div>

                        {selectedField === 'CARRERA' && (
                            <div className="flex flex-col gap-1.5 mt-2">
                               <label className="text-[10px] font-black tracking-widest text-slate-400 uppercase">
                                   Asignar Código de Escuela
                               </label>
                               <div className="relative">
                                   <input 
                                     type="text" 
                                     value={selectedCode}
                                     onChange={e => setSelectedCode(e.target.value)}
                                     className="w-full bg-slate-50 border border-slate-200 text-slate-800 font-bold rounded-xl px-4 py-3 pl-10 outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all uppercase"
                                     placeholder="Ej. 12"
                                   />
                                   <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[18px]">
                                      tag
                                   </span>
                               </div>
                               <p className="text-[10px] text-slate-500 mt-1 pl-1">Se guardará en la tabla participantes. Déjalo en blanco si no aplica.</p>
                            </div>
                        )}

                        <button 
                           onClick={handleUpdateClick}
                           disabled={updating || newValue.trim() === '' || (newValue === replaceTarget && (selectedField !== 'CARRERA' || selectedCode === ''))}
                           className="mt-4 w-full bg-slate-900 hover:bg-black disabled:opacity-50 text-white font-black py-4 px-4 rounded-xl text-xs uppercase tracking-widest flex items-center justify-center gap-2 transition-all shadow-xl shadow-slate-900/10 active:scale-[0.98] cursor-pointer"
                        >
                           {updating ? (
                               <>
                                 <span className="material-symbols-outlined animate-spin text-[18px]">refresh</span>
                                 Ejecutando Parche...
                               </>
                           ) : (
                               <>
                                 <span className="material-symbols-outlined text-[18px]">auto_fix_high</span>
                                 Aplicar Corrección Masiva
                               </>
                           )}
                        </button>
                        
                        {newValue === replaceTarget && replaceTarget !== 'SIN ASIGNAR' && (selectedField !== 'CARRERA' || selectedCode === '') && (
                            <p className="text-center text-[10px] text-red-500 font-bold mt-2">
                                El nuevo valor es idéntico al actual.
                            </p>
                        )}
                    </div>
                )}
             </div>
             
             <div className="bg-blue-50 border border-blue-100 p-4 rounded-2xl flex items-start gap-3">
                <span className="material-symbols-outlined text-blue-500 shrink-0">tips_and_updates</span>
                <div className="flex flex-col gap-1">
                   <p className="text-xs font-black text-blue-900">Consejo de Uso Seguro</p>
                   <p className="text-[10px] text-blue-700 leading-relaxed font-medium">
                      Antes de estandarizar una Escuela Profesional o Modalidad a lo largo de <b>Todos los Años</b>, asegúrate de que el cambio sea retroactivo. Si una carrera tenía otro nombre oficial en 2008 (ej. Administrativas vs Empresas), usa el <b>Filtro de Año</b> para arreglar solo errores de tipeo de ese año manteniendo el nombre histórico oficial.
                   </p>
                </div>
             </div>
          </div>

        </div>
      )}
      
      {activeTab === 'pdf_backups' && (
        /* PDF Backup Tab Content */
        <div className="flex flex-col gap-6 h-full min-h-0 overflow-y-auto px-4 md:px-0 pb-6 animate-in fade-in duration-300">
          
          {/* Overview Info Block */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 shrink-0">
            {/* Total Cloud Documents */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-5">
              <div className="size-12 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-2xl">cloud_done</span>
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-slate-400 text-[10px] font-black uppercase tracking-widest leading-none mb-1">Archivos Detectados</h3>
                <p className="text-2xl font-black text-slate-800 leading-tight">{pdfFiles.length}</p>
                <p className="text-[10px] text-slate-400 font-bold uppercase mt-0.5 truncate">Enlazados en Base de Datos</p>
              </div>
            </div>

            {/* Over 30 days pending storage */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-5">
              <div className="size-12 bg-amber-50 text-amber-500 rounded-2xl flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-2xl animate-pulse">pending_actions</span>
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-slate-400 text-[10px] font-black uppercase tracking-widest leading-none mb-1">Pendientes (+30 Días)</h3>
                <p className="text-2xl font-black text-amber-500 leading-tight">
                  {pdfFiles.filter(f => f.diffDays > 30 && f.url !== 'archivado_local' && !localIds.has(f.id)).length}
                </p>
                <p className="text-[10px] text-slate-400 font-bold uppercase mt-0.5 truncate font-black">Pendientes Copia Local</p>
              </div>
            </div>

            {/* Saved in browser DB */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-5">
              <div className="size-12 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-2xl">offline_pin</span>
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-slate-400 text-[10px] font-black uppercase tracking-widest leading-none mb-1">Base de Datos Local Offline</h3>
                <p className="text-2xl font-black text-emerald-600 leading-tight">{localIds.size}</p>
                <p className="text-[10px] text-slate-400 font-bold uppercase mt-0.5 truncate">Guardados en IndexedDB</p>
              </div>
            </div>
          </div>

          {/* Sync control row */}
          <div className="flex flex-col xl:flex-row justify-between items-stretch xl:items-center bg-white p-4 rounded-2xl border border-slate-200 shadow-sm gap-4 shrink-0">
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => setPdfFilter('all')}
                className={`px-3 py-2 rounded-xl text-xs font-black transition-all cursor-pointer ${pdfFilter === 'all' ? 'bg-slate-800 text-white shadow-sm' : 'bg-slate-50 text-slate-500 hover:bg-slate-100 hover:text-slate-800'}`}
              >
                Todos ({pdfFiles.length})
              </button>
              <button
                onClick={() => setPdfFilter('pending')}
                className={`px-3 py-2 rounded-xl text-xs font-black transition-all cursor-pointer ${pdfFilter === 'pending' ? 'bg-amber-500 text-white shadow shadow-amber-500/10' : 'bg-slate-50 text-slate-500 hover:bg-slate-100 hover:text-slate-800'}`}
              >
                Pendientes {">"}30 Días ({pdfFiles.filter(f => f.diffDays > 30 && f.url !== 'archivado_local' && !localIds.has(f.id)).length})
              </button>
              <button
                onClick={() => setPdfFilter('saved')}
                className={`px-3 py-2 rounded-xl text-xs font-black transition-all cursor-pointer ${pdfFilter === 'saved' ? 'bg-emerald-600 text-white shadow shadow-emerald-600/10' : 'bg-slate-50 text-slate-500 hover:bg-slate-100 hover:text-slate-800'}`}
              >
                Copiados en Local ({pdfFiles.filter(f => localIds.has(f.id)).length})
              </button>
              <button
                onClick={() => setPdfFilter('archived')}
                className={`px-3 py-2 rounded-xl text-xs font-black transition-all cursor-pointer ${pdfFilter === 'archived' ? 'bg-indigo-600 text-white shadow shadow-indigo-600/10' : 'bg-slate-50 text-slate-500 hover:bg-slate-100 hover:text-slate-800'}`}
              >
                Liberado en Nube ({pdfFiles.filter(f => f.url === 'archivado_local').length})
              </button>
            </div>

            <div className="flex gap-2 shrink-0">
              {/* Sync all btn */}
              <button
                onClick={syncAllPending}
                disabled={syncProgress.active || pdfFiles.filter(f => f.diffDays > 30 && f.url !== 'archivado_local' && !localIds.has(f.id)).length === 0}
                className="bg-primary hover:bg-primary/95 disabled:opacity-40 text-white font-black px-4 py-2.5 rounded-xl text-xs flex items-center justify-center gap-2 cursor-pointer transition-all uppercase tracking-wider shadow active:scale-[0.98]"
              >
                <span className="material-symbols-outlined text-[18px]">download_for_offline</span>
                Copia Masiva {">"}30 Días
              </button>
              
              <button
                onClick={fetchPdfRecords}
                disabled={pdfLoading}
                className="bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-700 font-bold px-3 py-2.5 rounded-xl text-xs flex items-center justify-center gap-1.5 cursor-pointer transition-all"
              >
                <span className={`material-symbols-outlined text-[18px] ${pdfLoading ? 'animate-spin' : ''}`}>sync</span>
                Refrescar
              </button>
            </div>
          </div>

          {/* Sync Progress Alert */}
          {syncProgress.active && (
            <div className="bg-primary/5 border border-primary/20 p-4 rounded-2xl flex flex-col gap-2 shrink-0 animate-pulse">
              <div className="flex justify-between items-center text-xs font-bold text-slate-700">
                <span className="flex items-center gap-1.5 text-primary">
                  <span className="animate-spin material-symbols-outlined text-[18px]">refresh</span>
                  Guardando archivos PDF físicamente en la Base de Datos Local (IndexedDB)...
                </span>
                <span>{syncProgress.current} de {syncProgress.total}</span>
              </div>
              <div className="w-full bg-slate-200 h-2.5 rounded-full overflow-hidden">
                <div 
                  className="bg-primary h-full transition-all duration-300"
                  style={{ width: `${(syncProgress.current / syncProgress.total) * 100}%` }}
                />
              </div>
            </div>
          )}

          {/* Search bar inside backups */}
          <div className="relative shrink-0 mx-4 md:mx-0">
            <input
              type="text"
              value={pdfSearch}
              onChange={e => setPdfSearch(e.target.value)}
              className="w-full bg-white border border-slate-200 text-slate-700 text-xs font-bold rounded-xl px-4 py-3 pl-10 outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 transition-all placeholder-slate-400"
              placeholder="Buscar documento por nombre, código de barras, resolución, estudiante o número..."
            />
            <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-[18px]">
              search
            </span>
            {pdfSearch && (
              <button onClick={() => setPdfSearch('')} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            )}
          </div>

          {/* Table list */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow shadow-slate-950/5 flex flex-col mx-4 md:mx-0 overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row gap-2 justify-between items-start sm:items-center bg-slate-50 rounded-t-2xl shrink-0">
              <h3 className="font-black text-slate-700 text-xs uppercase tracking-widest flex items-center gap-2">
                <span className="material-symbols-outlined text-[18px] text-slate-400">inventory</span>
                Documentos para Respaldo y Gestión
              </h3>
              <p className="text-[10px] text-slate-500 font-bold bg-white px-2 py-0.5 rounded border border-slate-200">
                Se sugiere copia local para archivos de más de 30 días
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 text-[9px] font-black text-slate-400 uppercase tracking-widest bg-slate-50/50">
                    <th className="py-3 px-4">Documento / Remitente</th>
                    <th className="py-3 px-4">Ubicación Nube</th>
                    <th className="py-3 px-4">Antigüedad</th>
                    <th className="py-3 px-4">Respaldo Local</th>
                    <th className="py-3 px-4 text-right">Acciones de Calidad</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pdfLoading ? (
                    <tr>
                      <td colSpan={5} className="text-center py-16 text-slate-400">
                        <span className="material-symbols-outlined animate-spin text-3xl mb-2 text-primary">sync</span>
                        <p className="font-bold text-xs uppercase tracking-widest">Escaneando base de datos...</p>
                      </td>
                    </tr>
                  ) : pdfFiles.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="text-center py-16 text-slate-400">
                        <span className="material-symbols-outlined text-4xl mb-2 opacity-50">drafts</span>
                        <p className="text-xs font-semibold">No se encontraron archivos cargados en la nube.</p>
                      </td>
                    </tr>
                  ) : (
                    pdfFiles
                      .filter(item => {
                        // Apply tab filter
                        if (pdfFilter === 'pending') {
                          return item.diffDays > 30 && item.url !== 'archivado_local' && !localIds.has(item.id);
                        }
                        if (pdfFilter === 'saved') {
                          return localIds.has(item.id);
                        }
                        if (pdfFilter === 'archived') {
                          return item.url === 'archivado_local';
                        }
                        return true;
                      })
                      .filter(item => {
                        const s = pdfSearch.toLowerCase();
                        return item.name.toLowerCase().includes(s) || 
                               item.detail.toLowerCase().includes(s) || 
                               item.sourceLabel.toLowerCase().includes(s);
                      })
                      .map((item) => {
                        const isSaved = localIds.has(item.id);
                        const isCloudArchived = item.url === 'archivado_local';
                        const isOver30Days = item.diffDays > 30;

                        return (
                          <tr key={item.id} className="hover:bg-slate-50/50 transition-all text-xs">
                            <td className="py-4 px-4 font-bold text-slate-700">
                              <div className="flex flex-col">
                                <span className="text-slate-800 text-xs font-black truncate max-w-[280px]" title={item.name}>
                                  {item.name}
                                </span>
                                <span className="text-[10px] text-slate-400 font-bold truncate max-w-[280px]">
                                  {item.detail}
                                </span>
                                <span className="inline-flex max-w-fit mt-1 items-center gap-1 text-[8px] uppercase tracking-wider text-slate-500 font-bold bg-slate-100 px-1.5 py-0.5 rounded">
                                  {item.sourceLabel}
                                </span>
                              </div>
                            </td>
                            <td className="py-4 px-4 text-slate-500 font-bold">
                              {isCloudArchived ? (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[9px] font-black uppercase tracking-wider bg-slate-100 text-slate-500 rounded-full border border-slate-200">
                                  <span className="material-symbols-outlined text-[12px]">cloud_off</span>
                                  Liberado de Supabase
                                </span>
                              ) : (
                                <a 
                                  href={item.url} 
                                  target="_blank" 
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[9px] font-black uppercase tracking-wider bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-full border border-indigo-100 transition-colors"
                                >
                                  <span className="material-symbols-outlined text-[12px]">open_in_new</span>
                                  Ver original en Nube
                                </a>
                              )}
                            </td>
                            <td className="py-4 px-4 font-black">
                              <span className={`inline-flex items-center gap-1 ${isOver30Days ? 'bg-amber-50 text-amber-800 font-black border border-amber-200' : 'bg-slate-50 text-slate-600 border border-slate-200'} px-2 py-0.5 rounded-full text-[10px]`}>
                                <span className="material-symbols-outlined text-[14px]">
                                  {isOver30Days ? 'calendar_month' : 'acute'}
                                </span>
                                {item.diffDays} días
                              </span>
                            </td>
                            <td className="py-4 px-4 font-bold text-slate-600">
                              {isSaved ? (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[9px] font-black uppercase tracking-wider bg-emerald-50 text-emerald-700 rounded-full border border-emerald-100">
                                  <span className="material-symbols-outlined text-[12px]">offline_pin</span>
                                  Resguardado OK
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[9px] font-black uppercase tracking-wider bg-slate-50 text-slate-400 rounded-full border border-slate-200/60">
                                  <span className="material-symbols-outlined text-[12px]">cloud_sync</span>
                                  Solo en Nube
                                </span>
                              )}
                            </td>
                            <td className="py-4 px-4 text-right">
                              <div className="flex justify-end gap-2">
                                {/* Download Local File (Available only if saved) */}
                                {isSaved ? (
                                  <button
                                    onClick={() => downloadLocalCachedFile(item)}
                                    className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[10px] font-black flex items-center gap-1 cursor-pointer transition-colors shadow-sm"
                                    title="Descargar desde Base de Datos Local"
                                  >
                                    <span className="material-symbols-outlined text-[14px]">download</span>
                                    Descargar Local
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => syncSingleFile(item)}
                                    disabled={pdfSyncingId === item.id || isCloudArchived}
                                    className="px-2.5 py-1.5 bg-slate-900 hover:bg-black disabled:opacity-40 text-white rounded-lg text-[10px] font-black flex items-center gap-1 cursor-pointer transition-colors shadow-sm"
                                    title="Descargar y Copiar en IndexedDB"
                                  >
                                    <span className="material-symbols-outlined text-[14px] animate-pulse">downloading</span>
                                    {pdfSyncingId === item.id ? 'Copiando...' : 'Copia Local'}
                                  </button>
                                )}

                                {/* Liberar Espacio (Delete from Supabase - Available only if saved locally and not already cleaned) */}
                                {isSaved && !isCloudArchived && (
                                  <button
                                    onClick={() => handleFreeCloudSpace(item)}
                                    className="px-2.5 py-1.5 bg-red-50 text-red-600 hover:bg-red-100 rounded-lg text-[10px] font-black flex items-center gap-1 cursor-pointer transition-colors"
                                    title="Eliminar PDF de la Nube para liberar espacio, conservando el local"
                                  >
                                    <span className="material-symbols-outlined text-[14px]">cloud_off</span>
                                    Liberar Nube
                                  </button>
                                )}

                                {/* Delete from browser */}
                                {isSaved && (
                                  <button
                                    onClick={() => handleDeleteFromLocal(item.id, item.name)}
                                    className="p-1 px-1.5 bg-slate-100 text-slate-500 hover:text-slate-850 hover:bg-slate-200 rounded-lg text-[10px] font-bold flex items-center cursor-pointer transition-colors"
                                    title="Quitar respaldo local de IndexedDB"
                                  >
                                    <span className="material-symbols-outlined text-[14px]">delete</span>
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'reporte_ingresantes' && (
        <div className="flex flex-col gap-6 h-full min-h-0 overflow-y-auto px-4 md:px-0 pb-6 animate-in fade-in duration-300">
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm shrink-0">
            <h2 className="text-lg font-black text-slate-800 tracking-tight flex items-center gap-2 mb-4">
              <span className="material-symbols-outlined text-primary">filter_alt</span>
              Filtros del Reporte
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-[10px] font-black tracking-widest text-slate-400 uppercase mb-1">Año</label>
                <select 
                  value={reportYear}
                  onChange={(e) => setReportYear(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 text-slate-800 text-xs font-bold rounded-xl px-4 py-2.5 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all cursor-pointer"
                >
                  <option value="Todos">Todos</option>
                  {years.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-black tracking-widest text-slate-400 uppercase mb-1">Semestre</label>
                <select 
                  value={reportSemester}
                  onChange={(e) => setReportSemester(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 text-slate-800 text-xs font-bold rounded-xl px-4 py-2.5 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all cursor-pointer"
                >
                  <option value="Todos">Todos</option>
                  {semesters.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-black tracking-widest text-slate-400 uppercase mb-1">Carrera</label>
                <select 
                  value={reportCareer}
                  onChange={(e) => setReportCareer(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 text-slate-800 text-xs font-bold rounded-xl px-4 py-2.5 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all cursor-pointer"
                >
                  <option value="Todos">Todas</option>
                  {reportCareers.map((nombre, i) => <option key={i} value={nombre}>{nombre}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-black tracking-widest text-slate-400 uppercase mb-1">Modalidad</label>
                <select 
                  value={reportModality}
                  onChange={(e) => setReportModality(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 text-slate-800 text-xs font-bold rounded-xl px-4 py-2.5 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all cursor-pointer"
                >
                  <option value="Todos">Todas</option>
                  {reportModalities.map((m, i) => <option key={i} value={m}>{m}</option>)}
                </select>
              </div>
            </div>
            
            <div className="flex flex-wrap items-center gap-3 mt-6 pt-6 border-t border-slate-100">
              <button
                onClick={async () => {
                  setLoadingReport(true);
                  try {
                    let query = supabase.from('participantes').select('*');
                    if (reportYear !== 'Todos') query = query.eq('ANIO', reportYear);
                    if (reportSemester !== 'Todos') query = query.eq('SEMESTRE', reportSemester);
                    if (reportCareer !== 'Todos') query = query.eq('CARRERA', reportCareer);
                    if (reportModality !== 'Todos') query = query.eq('MODALIDAD', reportModality);
                    
                    const { data, error } = await query;
                    if (error) throw error;
                    setReportData(data || []);
                    setAlertMessage({ type: 'success', text: `Reporte generado con ${data?.length || 0} registros.` });
                  } catch (e: any) {
                    setAlertMessage({ type: 'error', text: 'Error al generar reporte: ' + e.message });
                  } finally {
                    setLoadingReport(false);
                  }
                }}
                disabled={loadingReport}
                className="bg-primary hover:bg-primary/90 text-white disabled:opacity-50 font-bold py-2.5 px-6 rounded-xl text-xs flex items-center gap-2 transition-all cursor-pointer shadow-md"
              >
                <span className="material-symbols-outlined text-[18px]">{loadingReport ? 'refresh' : 'search'}</span>
                {loadingReport ? 'Generando...' : 'Generar Reporte'}
              </button>
              
              {reportData.length > 0 && (
                <>
                  <button
                    onClick={() => {
                      const ws = XLSX.utils.json_to_sheet(reportData.map(d => ({
                        'DNI': d.CODPOSTULANTE,
                        'POSTULANTE': d.NOMBRE,
                        'CARRERA': d.CARRERA,
                        'MODALIDAD': d.MODALIDAD,
                        'AÑO': d.ANIO,
                        'SEMESTRE': d.SEMESTRE,
                        'NOTA': d.NOTA,
                        'PUESTO': d.OMERITO,
                        'FECHA INGRESO': d.FECHAINGRESO,
                        'FILIAL': d.FILIAL
                      })));
                      const wb = XLSX.utils.book_new();
                      XLSX.utils.book_append_sheet(wb, ws, 'Ingresantes');
                      XLSX.writeFile(wb, `Reporte_Ingresantes_${new Date().getTime()}.xlsx`);
                    }}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 px-4 rounded-xl text-xs flex items-center gap-2 transition-all cursor-pointer shadow-md"
                  >
                    <span className="material-symbols-outlined text-[18px]">table_view</span>
                    Exportar Excel
                  </button>
                  <button
                    onClick={() => {
                      const doc = new jsPDF('l');
                      doc.text('Reporte de Ingresantes', 14, 15);
                      autoTable(doc, {
                        startY: 20,
                        head: [['DNI', 'Postulante', 'Carrera', 'Modalidad', 'Semestre', 'Nota', 'Puesto']],
                        body: reportData.map(d => [
                          d.CODPOSTULANTE || '', 
                          d.NOMBRE || '', 
                          d.CARRERA || '', 
                          d.MODALIDAD || '', 
                          d.SEMESTRE || '', 
                          d.NOTA || '', 
                          d.OMERITO || ''
                        ]),
                        styles: { fontSize: 8 },
                        headStyles: { fillColor: [15, 23, 42] }
                      });
                      doc.save(`Reporte_Ingresantes_${new Date().getTime()}.pdf`);
                    }}
                    className="bg-red-600 hover:bg-red-700 text-white font-bold py-2.5 px-4 rounded-xl text-xs flex items-center gap-2 transition-all cursor-pointer shadow-md"
                  >
                    <span className="material-symbols-outlined text-[18px]">picture_as_pdf</span>
                    Exportar PDF
                  </button>
                </>
              )}
            </div>
          </div>
          
          {reportData.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex-1 min-h-0 flex flex-col">
              <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                <h3 className="font-black text-slate-700 text-xs uppercase tracking-widest">
                  Resultados del Reporte ({reportData.length})
                </h3>
              </div>
              <div className="flex-1 overflow-auto p-0">
                <table className="w-full text-left border-collapse min-w-[800px]">
                  <thead>
                    <tr className="bg-slate-50 text-[10px] uppercase tracking-widest text-slate-400 font-black border-b border-slate-200">
                      <th className="p-4">DNI</th>
                      <th className="p-4">Postulante</th>
                      <th className="p-4">Carrera</th>
                      <th className="p-4">Modalidad</th>
                      <th className="p-4">Semestre</th>
                      <th className="p-4">Nota</th>
                    </tr>
                  </thead>
                  <tbody className="text-xs">
                    {reportData.slice(0, 50).map((row, idx) => (
                      <tr key={idx} className="border-b border-slate-100 hover:bg-slate-50/50">
                        <td className="p-4 font-mono font-bold text-slate-600">{row.CODPOSTULANTE}</td>
                        <td className="p-4 font-bold text-slate-800">{row.NOMBRE}</td>
                        <td className="p-4 text-slate-600">{row.CARRERA}</td>
                        <td className="p-4 text-slate-600">{row.MODALIDAD}</td>
                        <td className="p-4 font-black text-slate-500">{row.SEMESTRE}</td>
                        <td className="p-4 font-black text-primary">{row.NOTA}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {reportData.length > 50 && (
                  <div className="p-4 text-center text-xs font-bold text-slate-400 bg-slate-50 border-t border-slate-100">
                    Mostrando los primeros 50 registros de {reportData.length} en total.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Confirmation Modal */}
      {showConfirmModal && (
          <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
             <div className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl flex flex-col gap-5 animate-in zoom-in-95">
                <div className="flex flex-col gap-2 relative">
                    <button onClick={() => setShowConfirmModal(false)} className="absolute -top-2 -right-2 text-slate-400 hover:text-slate-600 transition-colors">
                        <span className="material-symbols-outlined">close</span>
                    </button>
                    <div className="size-12 bg-red-50 text-red-600 rounded-full flex items-center justify-center mb-2">
                        <span className="material-symbols-outlined text-2xl">warning</span>
                    </div>
                    <h3 className="text-lg font-black text-slate-800 leading-tight">¿Confirmar Acción?</h3>
                    <p className="text-sm text-slate-600 font-medium">
                        Estás a punto de homologar: <br/>
                        <strong className="text-slate-800">{replaceTarget === 'SIN ASIGNAR' ? 'Datos Vacíos' : replaceTarget}</strong> 
                        <span className="text-primary font-bold"> {" => "} {newValue}</span>
                    </p>
                    <p className="text-[10px] uppercase font-bold tracking-widest text-red-500 mt-2 bg-red-50 p-2 rounded-lg">
                        {dataStats.find(d => d.value === replaceTarget)?.count || 0} registros serán afectados permanentemente.
                    </p>
                </div>
                <div className="flex gap-3 mt-2">
                    <button onClick={() => setShowConfirmModal(false)} className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3 rounded-xl transition-all">
                        Cancelar
                    </button>
                    <button onClick={executeUpdate} className="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-red-600/20 active:scale-[0.98]">
                        <span className="material-symbols-outlined text-[18px]">done_all</span>
                        Confirmar
                    </button>
                </div>
             </div>
          </div>
      )}

      {/* Alert Overlay */}
      {alertMessage && (
          <div className="fixed bottom-6 inset-x-0 mx-auto w-[90%] max-w-sm z-50 flex justify-center animate-in slide-in-from-bottom-5">
              <div className={`p-4 rounded-xl shadow-2xl border flex items-center gap-3 w-full pr-12 relative ${alertMessage.type === 'success' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : alertMessage.type === 'info' ? 'bg-indigo-50 text-indigo-800 border-indigo-200' : 'bg-red-50 text-red-800 border-red-200'}`}>
                   <span className="material-symbols-outlined shrink-0 text-3xl">
                       {alertMessage.type === 'success' ? 'check_circle' : alertMessage.type === 'info' ? 'info' : 'error'}
                   </span>
                   <p className="text-sm font-bold leading-tight flex-1">{alertMessage.text}</p>
                   <button onClick={() => setAlertMessage(null)} className="absolute right-4 text-inherit/50 hover:text-inherit/80 transition-colors">
                        <span className="material-symbols-outlined">close</span>
                   </button>
              </div>
          </div>
      )}
    </div>
  );
};
