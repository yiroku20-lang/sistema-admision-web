import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { User } from '../types';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export interface ExtraColumnDef {
  id: string;
  label: string;
  category: 'Contacto' | 'Personal' | 'Colegio' | 'Adjudicación';
  defaultVisible?: boolean;
}

export const AVAILABLE_EXTRA_COLUMNS: ExtraColumnDef[] = [
  { id: 'telefono', label: 'Teléfono / Celular', category: 'Contacto' },
  { id: 'email', label: 'Correo Electrónico', category: 'Contacto' },
  { id: 'direccion', label: 'Dirección Domicilio', category: 'Contacto' },
  { id: 'ubigeo', label: 'Ubigeo / Lugar Nacimiento', category: 'Personal' },
  { id: 'fecha_nacimiento', label: 'Fecha de Nacimiento', category: 'Personal' },
  { id: 'sexo', label: 'Sexo', category: 'Personal' },
  { id: 'discapacidad', label: 'Discapacidad', category: 'Personal' },
  { id: 'colegio', label: 'Colegio de Procedencia', category: 'Colegio' },
  { id: 'promedio_colegio', label: 'Promedio Colegio', category: 'Colegio' },
  { id: 'escuela_adjudicada', label: 'Escuela Adjudicada', category: 'Adjudicación' },
  { id: 'estado_adjudicacion', label: 'Estado Adjudicación', category: 'Adjudicación' },
  { id: 'area', label: 'Área Académica', category: 'Adjudicación' },
];

export const getExtraColumnValue = (item: any, colId: string): string => {
  if (!item) return '—';
  switch (colId) {
    case 'telefono':
      return item.telefono || item.TELEFONO || item.celular || item.CELULAR || item.phone || item.TELEFONO_APODERADO || '—';
    case 'email':
      return item.email || item.EMAIL || item.correo || item.CORREO || item.email_postulante || '—';
    case 'direccion':
      return item.direccion || item.DIRECCION || item.domicilio || item.DOMICILIO || item.DIR_POSTULANTE || '—';
    case 'ubigeo':
      return item.ubigeo || item.UBIGEO || item.lugar_nacimiento || item.LUGAR_NACIMIENTO || item.distrito || item.DISTRITO || '—';
    case 'fecha_nacimiento':
      return item.fecha_nacimiento || item.FECHA_NACIMIENTO || item.fecnac || item.FECNAC || item.FECHA_NAC || item.FEC_NACIMIENTO || '—';
    case 'sexo':
      return item.sexo || item.SEXO || item.genero || item.GENERO || '—';
    case 'discapacidad':
      return item.discapacidad || item.DISCAPACIDAD || '—';
    case 'colegio':
      return item.colegio || item.COLEGIO || item.colegio_procedencia || item.COLEGIO_PROCEDENCIA || item.NOM_COLEGIO || '—';
    case 'promedio_colegio':
      return item.promedio_colegio || item.PROMEDIO_COLEGIO || item.promedio || item.PROMEDIO || item.POND_COLEGIO || '—';
    case 'escuela_adjudicada':
      return item.escuela_adjudicada || item.ESCUELA_ADJUDICADA || item.carrera_adjudicada || item.CARRERA_ADJUDICADA || item.CARRERA || '—';
    case 'estado_adjudicacion':
      return item.estado_adjudicacion || item.ESTADO_ADJUDICACION || item.estado || item.ESTADO || (item.NOTA ? 'Adjudicado' : '—');
    case 'area':
      return item.area || item.AREA || item.area_academica || item.AREA_ACADEMICA || item.grupo || item.GRUPO || '—';
    default:
      return item[colId] || item[colId.toUpperCase()] || '—';
  }
};

export const IngresantesReport: React.FC<{ user: User; notify?: (msg: string, type?: 'success' | 'error' | 'warning') => void }> = ({ user, notify }) => {
  // Check permission
  const hasPermission =
    user.role === 'Administrador' ||
    user.role === 'Director' ||
    (user.role === 'Operador' && user.permissions?.includes('view_reporte_ingresantes'));

  // Filter states
  const [reportYear, setReportYear] = useState<string>('2026');
  const [reportSemester, setReportSemester] = useState<string>('2026-II');
  const [reportCareer, setReportCareer] = useState<string>('Todas');
  const [reportModality, setReportModality] = useState<string>('Todas');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Custom Extra Columns configuration
  const [selectedExtraColumns, setSelectedExtraColumns] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('ingresantes_report_extra_cols');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [showColumnModal, setShowColumnModal] = useState<boolean>(false);

  // Dropdown reference lists
  const [yearsList, setYearsList] = useState<string[]>([]);
  const [semestersList, setSemestersList] = useState<string[]>([]);
  const [careersList, setCareersList] = useState<string[]>([]);
  const [modalitiesList, setModalitiesList] = useState<string[]>([]);

  // Results & Loading
  const [ingresantes, setIngresantes] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [loadingFilters, setLoadingFilters] = useState<boolean>(true);

  // UI Pagination
  const [currentPage, setCurrentPage] = useState<number>(1);
  const itemsPerPage = 50;

  // Save extra column selection
  const handleToggleColumn = (colId: string) => {
    setSelectedExtraColumns(prev => {
      const updated = prev.includes(colId) ? prev.filter(id => id !== colId) : [...prev, colId];
      try {
        localStorage.setItem('ingresantes_report_extra_cols', JSON.stringify(updated));
      } catch (e) {
        console.error('Error saving extra columns:', e);
      }
      return updated;
    });
  };

  const handleSelectAllColumns = () => {
    const allIds = AVAILABLE_EXTRA_COLUMNS.map(c => c.id);
    setSelectedExtraColumns(allIds);
    try {
      localStorage.setItem('ingresantes_report_extra_cols', JSON.stringify(allIds));
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeselectAllColumns = () => {
    setSelectedExtraColumns([]);
    try {
      localStorage.setItem('ingresantes_report_extra_cols', JSON.stringify([]));
    } catch (e) {
      console.error(e);
    }
  };

  const handleToggleCategory = (category: string) => {
    const categoryCols = AVAILABLE_EXTRA_COLUMNS.filter(c => c.category === category).map(c => c.id);
    const allSelected = categoryCols.every(id => selectedExtraColumns.includes(id));
    
    setSelectedExtraColumns(prev => {
      let updated: string[];
      if (allSelected) {
        updated = prev.filter(id => !categoryCols.includes(id));
      } else {
        updated = Array.from(new Set([...prev, ...categoryCols]));
      }
      try {
        localStorage.setItem('ingresantes_report_extra_cols', JSON.stringify(updated));
      } catch (e) {
        console.error(e);
      }
      return updated;
    });
  };

  // 1. Initial Load of Reference Filters (Years, Careers, Semesters, Modalities)
  useEffect(() => {
    if (!hasPermission) return;
    loadInitialFilters();
  }, [hasPermission]);

  // 2. Load modalities when Year or Semester changes
  useEffect(() => {
    if (!hasPermission) return;
    loadModalitiesForFilter(reportYear, reportSemester);
  }, [reportYear, reportSemester, hasPermission]);

  const loadInitialFilters = async () => {
    setLoadingFilters(true);
    try {
      // 1. Intentar cargar filtros consolidados mediante RPC optimizado
      const { data: rpcData, error: rpcError } = await supabase.rpc('get_reporte_ingresantes_filtros');
      if (!rpcError && rpcData) {
        if (rpcData.anios && Array.isArray(rpcData.anios)) {
          const sortedYears = rpcData.anios.map((y: any) => String(y).trim()).filter(Boolean).sort((a: string, b: string) => b.localeCompare(a));
          setYearsList(sortedYears);
        }
        if (rpcData.semestres && Array.isArray(rpcData.semestres)) {
          const sortedSemesters = rpcData.semestres.map((s: any) => String(s).trim()).filter(Boolean).sort((a: string, b: string) => b.localeCompare(a));
          setSemestersList(sortedSemesters);
        }
        if (rpcData.carreras && Array.isArray(rpcData.carreras)) {
          const sortedCareers = rpcData.carreras.map((c: any) => String(c).trim()).filter(Boolean).sort((a: string, b: string) => a.localeCompare(b));
          setCareersList(sortedCareers);
        }
        return;
      }

      // Fallback si no existe la función RPC
      // Load Years (cv_cuadros_anuales + participantes)
      const { data: cData } = await supabase.from('cv_cuadros_anuales').select('anio');
      const { data: pData } = await supabase.from('participantes').select('ANIO').not('ANIO', 'is', null).limit(3000);
      
      const yrSet = new Set<string>();
      if (cData) cData.forEach(c => c.anio && yrSet.add(String(c.anio).trim()));
      if (pData) pData.forEach(p => p.ANIO && yrSet.add(String(p.ANIO).trim()));
      if (yrSet.size === 0) ['2026', '2025', '2024'].forEach(y => yrSet.add(y));
      const sortedYears = Array.from(yrSet).sort((a, b) => b.localeCompare(a));
      setYearsList(sortedYears);

      // Load Schools/Careers (cv_escuelas + participantes)
      const { data: escData } = await supabase.from('cv_escuelas').select('nombre').order('nombre', { ascending: true });
      const { data: pCareers } = await supabase.from('participantes').select('CARRERA').not('CARRERA', 'is', null).limit(3000);
      const carSet = new Set<string>();
      if (escData) escData.forEach(e => e.nombre && carSet.add(e.nombre.trim()));
      if (pCareers) pCareers.forEach(p => p.CARRERA && carSet.add(p.CARRERA.trim()));
      const sortedCareers = Array.from(carSet).filter(Boolean).sort((a, b) => a.localeCompare(b));
      setCareersList(sortedCareers);

      // Load Semesters (cv_modalidades + participantes)
      const { data: semData } = await supabase.from('cv_modalidades').select('semestre').not('semestre', 'is', null);
      const { data: pSemesters } = await supabase.from('participantes').select('SEMESTRE').not('SEMESTRE', 'is', null).limit(3000);
      const semSet = new Set<string>();
      if (semData) semData.forEach(s => s.semestre && semSet.add(s.semestre.trim()));
      if (pSemesters) pSemesters.forEach(p => p.SEMESTRE && semSet.add(p.SEMESTRE.trim()));
      if (semSet.size === 0) {
        semSet.add('2026-II');
        semSet.add('2026-I');
        semSet.add('2025-II');
        semSet.add('2025-I');
      }
      setSemestersList(Array.from(semSet).sort((a, b) => b.localeCompare(a)));

    } catch (e: any) {
      console.error('Error loading initial report filters:', e);
    } finally {
      setLoadingFilters(false);
    }
  };

  const loadModalitiesForFilter = async (year: string, semester: string) => {
    try {
      const { data, error } = await supabase.rpc('get_distinct_modalidades', {
        p_anio: year,
        p_semestre: semester
      });

      if (!error && data) {
        const uniqueMods: string[] = data.map((r: any) => (r.modalidad || r.MODALIDAD)?.trim()).filter(Boolean);
        setModalitiesList(Array.from(new Set<string>(uniqueMods)).sort((a, b) => a.localeCompare(b)));
        return;
      }

      // Fallback con paginación si no estuviera el RPC
      let allMods: string[] = [];
      let start = 0;
      const step = 1000;
      let hasMore = true;
      while (hasMore && start < 10000) {
        let q = supabase.from('participantes').select('MODALIDAD').not('MODALIDAD', 'is', null).range(start, start + step - 1);
        if (year !== 'Todos') q = q.eq('ANIO', year);
        if (semester !== 'Todos') q = q.eq('SEMESTRE', semester);
        const { data: chunk } = await q;
        if (chunk && chunk.length > 0) {
          chunk.forEach(p => { if (p.MODALIDAD?.trim()) allMods.push(p.MODALIDAD.trim()); });
          if (chunk.length < step) hasMore = false;
          else start += step;
        } else {
          hasMore = false;
        }
      }
      setModalitiesList(Array.from(new Set(allMods)).sort((a, b) => a.localeCompare(b)));
    } catch (e: any) {
      console.error('Error loading modalities:', e);
    }
  };

  // Execute Direct Query to Supabase
  const handleSearch = async () => {
    setLoading(true);
    setCurrentPage(1);
    try {
      let allResults: any[] = [];
      let start = 0;
      const step = 1000;
      let hasMore = true;

      while (hasMore) {
        let query = supabase
          .from('participantes')
          .select('*')
          .range(start, start + step - 1)
          .order('CARRERA', { ascending: true });

        if (reportYear !== 'Todos') {
          query = query.eq('ANIO', reportYear.trim());
        }
        if (reportSemester !== 'Todos') {
          query = query.eq('SEMESTRE', reportSemester.trim());
        }
        if (reportCareer !== 'Todas') {
          query = query.eq('CARRERA', reportCareer.trim());
        }
        if (reportModality !== 'Todas') {
          query = query.eq('MODALIDAD', reportModality.trim());
        }

        if (searchQuery.trim() !== '') {
          const term = searchQuery.trim();
          query = query.or(`CODPOSTULANTE.ilike.%${term}%,NOMBRE.ilike.%${term}%`);
        }

        const { data, error } = await query;
        if (error) throw error;

        if (data && data.length > 0) {
          allResults.push(...data);
          if (data.length < step) {
            hasMore = false;
          } else {
            start += step;
          }
        } else {
          hasMore = false;
        }
      }

      setIngresantes(allResults);
      if (allResults.length === 0) {
        notify?.('No se encontraron registros de ingresantes con los filtros seleccionados.', 'warning');
      } else {
        notify?.(`Reporte generado con éxito: ${allResults.length} ingresantes.`, 'success');
      }
    } catch (e: any) {
      console.error('Error fetching ingresantes report:', e);
      notify?.(`Error al consultar ingresantes: ${e.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleResetFilters = () => {
    setReportYear('2026');
    setReportSemester('2026-II');
    setReportCareer('Todas');
    setReportModality('Todas');
    setSearchQuery('');
    setIngresantes([]);
  };

  // Export to Excel (.xlsx)
  const exportToExcel = () => {
    if (ingresantes.length === 0) {
      notify?.('No hay datos para exportar.', 'warning');
      return;
    }

    const exportData = ingresantes.map((item, index) => {
      const row: Record<string, any> = {
        'N°': index + 1,
        'ORDEN MÉRITO': item.OMERITO || '—',
        'DNI / CÓDIGO': item.CODPOSTULANTE || '',
        'APELLIDOS Y NOMBRES': item.NOMBRE || '',
        'ESCUELA PROFESIONAL': item.CARRERA || '',
        'CÓDIGO CARRERA': item.codigo_carrera || '',
        'FILIAL': item.FILIAL || 'CUSCO',
        'MODALIDAD': item.MODALIDAD || '',
        'PUNTAJE / NOTA': item.NOTA || '',
        'SEMESTRE': item.SEMESTRE || '',
        'AÑO': item.ANIO || '',
        'FECHA INGRESO': item.FECHAINGRESO || ''
      };

      // Append custom extra columns
      selectedExtraColumns.forEach(colId => {
        const colDef = AVAILABLE_EXTRA_COLUMNS.find(c => c.id === colId);
        if (colDef) {
          row[colDef.label.toUpperCase()] = getExtraColumnValue(item, colId);
        }
      });

      return row;
    });

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    
    // Auto fit columns width
    const colWidths = Object.keys(exportData[0] || {}).map(key => ({
      wch: Math.max(key.length + 3, 15)
    }));
    colWidths[3] = { wch: 38 }; // Nombres
    colWidths[4] = { wch: 35 }; // Carrera
    colWidths[7] = { wch: 28 }; // Modalidad
    worksheet['!cols'] = colWidths;

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Ingresantes');

    const fileName = `Reporte_Ingresantes_${reportYear}_${reportSemester}_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(workbook, fileName);
    notify?.('Archivo Excel exportado exitosamente con columnas personalizadas.', 'success');
  };

  // Export to PDF
  const exportToPDF = () => {
    if (ingresantes.length === 0) {
      notify?.('No hay datos para exportar.', 'warning');
      return;
    }

    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

    // Header Title
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(123, 21, 35); // Merlot UNSAAC
    doc.text('UNIVERSIDAD NACIONAL DE SAN ANTONIO ABAD DEL CUSCO', 14, 14);

    doc.setFontSize(11);
    doc.setTextColor(30, 41, 59);
    doc.text('DIRECCIÓN DE ADMISIÓN - REPORTE OFICIAL DE INGRESANTES', 14, 21);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    const filterInfo = `Proceso: ${reportYear} - ${reportSemester} | Carrera: ${reportCareer} | Modalidad: ${reportModality} | Total: ${ingresantes.length} ingresantes`;
    doc.text(filterInfo, 14, 27);
    doc.text(`Fecha de emisión: ${new Date().toLocaleString()}`, 200, 27);

    // Active extra column definitions
    const activeExtraDefs = AVAILABLE_EXTRA_COLUMNS.filter(c => selectedExtraColumns.includes(c.id));

    // Table Columns
    const tableColumns = [
      'N°',
      'OM',
      'DNI',
      'APELLIDOS Y NOMBRES',
      'ESCUELA PROFESIONAL',
      'CÓD. CAR.',
      'FILIAL',
      'MODALIDAD',
      'NOTA',
      ...activeExtraDefs.map(c => c.label.toUpperCase())
    ];

    const tableRows = ingresantes.map((item, idx) => [
      idx + 1,
      item.OMERITO || '—',
      item.CODPOSTULANTE || '',
      item.NOMBRE || '',
      item.CARRERA || '',
      item.codigo_carrera || '',
      item.FILIAL || 'CUSCO',
      item.MODALIDAD || '',
      item.NOTA || '',
      ...activeExtraDefs.map(c => getExtraColumnValue(item, c.id))
    ]);

    autoTable(doc, {
      head: [tableColumns],
      body: tableRows,
      startY: 32,
      styles: { fontSize: activeExtraDefs.length > 2 ? 6 : 7, cellPadding: 1.2 },
      headStyles: { fillColor: [123, 21, 35], textColor: [255, 255, 255], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 250, 252] }
    });

    const fileName = `Reporte_Ingresantes_${reportYear}_${reportSemester}_${new Date().toISOString().split('T')[0]}.pdf`;
    doc.save(fileName);
    notify?.('Documento PDF generado exitosamente.', 'success');
  };

  if (!hasPermission) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[500px] p-8 text-center">
        <span className="material-symbols-outlined text-6xl text-slate-300 mb-4">lock</span>
        <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tight">Acceso No Autorizado</h2>
        <p className="text-slate-500 text-sm mt-2 max-w-md">No tienes los permisos necesarios para ver el Reporte Oficial de Ingresantes. Contacta al Administrador si requieres este acceso.</p>
      </div>
    );
  }

  // Calculate stats
  const totalIngresantes = ingresantes.length;
  const uniqueCareersCount = new Set(ingresantes.map(i => i.CARRERA).filter(Boolean)).size;
  const uniqueModalitiesCount = new Set(ingresantes.map(i => i.MODALIDAD).filter(Boolean)).size;

  // Categories list for modal grouping
  const categories: Array<'Contacto' | 'Personal' | 'Colegio' | 'Adjudicación'> = ['Contacto', 'Personal', 'Colegio', 'Adjudicación'];
  const categoryIcons: Record<string, string> = {
    'Contacto': 'call',
    'Personal': 'person',
    'Colegio': 'school',
    'Adjudicación': 'verified'
  };

  // Pagination slice
  const totalPages = Math.ceil(ingresantes.length / itemsPerPage);
  const currentData = ingresantes.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  return (
    <div className="flex flex-col gap-6 p-6 md:p-8 max-w-[1600px] mx-auto w-full pb-24">
      {/* Page Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-6">
        <div className="flex items-center gap-4">
          <div className="bg-primary/10 text-primary p-3 rounded-2xl border border-primary/20">
            <span className="material-symbols-outlined text-3xl">school</span>
          </div>
          <div className="flex flex-col">
            <h1 className="text-slate-900 text-2xl md:text-3xl font-black uppercase tracking-tight">
              Reporte Oficial de Ingresantes
            </h1>
            <p className="text-slate-500 text-xs md:text-sm font-semibold">
              Consulta, filtrado directo y consolidado de ingresantes en la tabla de participantes.
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Customize Columns Button */}
          <button
            onClick={() => setShowColumnModal(true)}
            className="flex items-center gap-2 bg-white border border-slate-300 hover:border-primary/50 hover:bg-primary/5 text-slate-700 h-11 px-4 rounded-xl font-bold text-xs uppercase tracking-wider transition-all cursor-pointer shadow-sm active:scale-95"
            title="Personalizar columnas adicionales visibles en la tabla y exportaciones"
          >
            <span className="material-symbols-outlined text-lg text-primary">view_column</span>
            <span>Columnas Extra</span>
            {selectedExtraColumns.length > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-primary text-white text-[10px] font-black">
                {selectedExtraColumns.length}
              </span>
            )}
          </button>

          <button
            onClick={exportToExcel}
            disabled={ingresantes.length === 0}
            className="flex items-center gap-2 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-40 text-white h-11 px-5 rounded-xl font-black text-xs uppercase tracking-wider shadow-md shadow-emerald-700/20 active:scale-95 transition-all cursor-pointer"
          >
            <span className="material-symbols-outlined text-lg">description</span>
            Exportar Excel
          </button>
          <button
            onClick={exportToPDF}
            disabled={ingresantes.length === 0}
            className="flex items-center gap-2 bg-red-700 hover:bg-red-800 disabled:opacity-40 text-white h-11 px-5 rounded-xl font-black text-xs uppercase tracking-wider shadow-md shadow-red-700/20 active:scale-95 transition-all cursor-pointer"
          >
            <span className="material-symbols-outlined text-lg">picture_as_pdf</span>
            Exportar PDF
          </button>
        </div>
      </div>

      {/* Filter Control Box */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 flex flex-col gap-5">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2 text-slate-800 font-black text-xs uppercase tracking-wider">
            <span className="material-symbols-outlined text-primary text-lg">tune</span>
            Filtros del Proceso de Admisión
          </div>
          {loadingFilters && (
            <span className="flex items-center gap-2 text-xs font-bold text-slate-400">
              <span className="material-symbols-outlined animate-spin text-sm">progress_activity</span>
              Cargando opciones...
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Año */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-black uppercase tracking-wider text-slate-500">Año Proceso</label>
            <select
              value={reportYear}
              onChange={e => setReportYear(e.target.value)}
              className="h-11 px-3 rounded-xl border border-slate-200 bg-slate-50 focus:border-primary focus:bg-white text-xs font-bold text-slate-800 outline-none transition-all cursor-pointer"
            >
              <option value="Todos">Todos los Años</option>
              {yearsList.map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>

          {/* Semestre */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-black uppercase tracking-wider text-slate-500">Semestre / Periodo</label>
            <select
              value={reportSemester}
              onChange={e => setReportSemester(e.target.value)}
              className="h-11 px-3 rounded-xl border border-slate-200 bg-slate-50 focus:border-primary focus:bg-white text-xs font-bold text-slate-800 outline-none transition-all cursor-pointer"
            >
              <option value="Todos">Todos los Semestres</option>
              {semestersList.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          {/* Escuela / Carrera */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-black uppercase tracking-wider text-slate-500">Escuela Profesional</label>
            <select
              value={reportCareer}
              onChange={e => setReportCareer(e.target.value)}
              className="h-11 px-3 rounded-xl border border-slate-200 bg-slate-50 focus:border-primary focus:bg-white text-xs font-bold text-slate-800 outline-none transition-all cursor-pointer"
            >
              <option value="Todas">Todas las Escuelas</option>
              {careersList.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          {/* Modalidad */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-black uppercase tracking-wider text-slate-500">Modalidad de Ingreso</label>
            <select
              value={reportModality}
              onChange={e => setReportModality(e.target.value)}
              className="h-11 px-3 rounded-xl border border-slate-200 bg-slate-50 focus:border-primary focus:bg-white text-xs font-bold text-slate-800 outline-none transition-all cursor-pointer"
            >
              <option value="Todas">Todas las Modalidades ({modalitiesList.length})</option>
              {modalitiesList.map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Second Row: Search query & Filter buttons */}
        <div className="flex flex-col sm:flex-row items-center gap-4 pt-2 border-t border-slate-100">
          <div className="relative flex-1 w-full">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg">search</span>
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Buscar por DNI, Código de postulante o Nombres..."
              className="w-full h-11 pl-10 pr-4 rounded-xl border border-slate-200 bg-slate-50 focus:border-primary focus:bg-white text-xs font-semibold text-slate-800 outline-none transition-all"
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
            />
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              onClick={handleSearch}
              disabled={loading}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-2 bg-primary hover:bg-merlot text-white h-11 px-6 rounded-xl font-black text-xs uppercase tracking-wider shadow-lg shadow-primary/20 active:scale-95 transition-all cursor-pointer disabled:opacity-50"
            >
              {loading ? (
                <span className="material-symbols-outlined animate-spin text-lg">progress_activity</span>
              ) : (
                <span className="material-symbols-outlined text-lg">filter_alt</span>
              )}
              {loading ? 'Consultando...' : 'Buscar Reporte'}
            </button>

            <button
              onClick={handleResetFilters}
              disabled={loading}
              className="flex items-center justify-center gap-1.5 border border-slate-300 hover:bg-slate-100 text-slate-600 h-11 px-4 rounded-xl font-bold text-xs uppercase tracking-wider transition-all cursor-pointer"
            >
              <span className="material-symbols-outlined text-base">restart_alt</span>
              Limpiar
            </button>
          </div>
        </div>
      </div>

      {/* Summary Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200 p-5 flex items-center gap-4 shadow-sm">
          <div className="bg-primary/10 text-primary p-3 rounded-xl">
            <span className="material-symbols-outlined text-2xl">groups</span>
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Total Ingresantes</span>
            <span className="text-2xl font-black text-slate-900">{totalIngresantes.toLocaleString()}</span>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-5 flex items-center gap-4 shadow-sm">
          <div className="bg-blue-50 text-blue-600 p-3 rounded-xl">
            <span className="material-symbols-outlined text-2xl">account_balance</span>
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Escuelas / Carreras</span>
            <span className="text-2xl font-black text-slate-900">{uniqueCareersCount}</span>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-5 flex items-center gap-4 shadow-sm">
          <div className="bg-amber-50 text-amber-600 p-3 rounded-xl">
            <span className="material-symbols-outlined text-2xl">category</span>
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Modalidades Incluidas</span>
            <span className="text-2xl font-black text-slate-900">{uniqueModalitiesCount}</span>
          </div>
        </div>

        <div 
          onClick={() => setShowColumnModal(true)}
          className="bg-white hover:bg-slate-50 transition-all cursor-pointer rounded-2xl border border-slate-200 p-5 flex items-center gap-4 shadow-sm group"
        >
          <div className="bg-emerald-50 text-emerald-600 group-hover:bg-emerald-100 p-3 rounded-xl transition-all">
            <span className="material-symbols-outlined text-2xl">view_column</span>
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Columnas Adicionales</span>
            <span className="text-2xl font-black text-slate-900">
              {selectedExtraColumns.length} <span className="text-xs font-semibold text-slate-500">/ {AVAILABLE_EXTRA_COLUMNS.length}</span>
            </span>
          </div>
        </div>
      </div>

      {/* Results Table Section */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
        {/* Table Top Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4 bg-slate-50">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-slate-500 text-lg">format_list_bulleted</span>
              <span className="text-xs font-black uppercase tracking-wider text-slate-800">
                Listado de Ingresantes {ingresantes.length > 0 && `(${ingresantes.length} registros)`}
              </span>
            </div>

            {/* Active columns indicator badge */}
            {selectedExtraColumns.length > 0 && (
              <div className="flex items-center gap-1.5 bg-primary/10 border border-primary/20 px-2.5 py-1 rounded-lg">
                <span className="material-symbols-outlined text-primary text-[14px]">view_column</span>
                <span className="text-[11px] font-bold text-primary">
                  {selectedExtraColumns.length} extra {selectedExtraColumns.length === 1 ? 'columna activa' : 'columnas activas'}
                </span>
                <button
                  onClick={() => setShowColumnModal(true)}
                  className="ml-1 text-primary hover:underline text-[10px] font-black uppercase"
                >
                  Editar
                </button>
              </div>
            )}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center gap-2 text-xs font-bold text-slate-600">
              <span>Página {currentPage} de {totalPages}</span>
              <button
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                className="p-1 rounded bg-white border border-slate-200 hover:bg-slate-100 disabled:opacity-30 cursor-pointer"
              >
                <span className="material-symbols-outlined text-base">chevron_left</span>
              </button>
              <button
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                className="p-1 rounded bg-white border border-slate-200 hover:bg-slate-100 disabled:opacity-30 cursor-pointer"
              >
                <span className="material-symbols-outlined text-base">chevron_right</span>
              </button>
            </div>
          )}
        </div>

        {/* Table Content */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-100/70 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 text-[10px] font-black uppercase text-slate-500 text-center w-12 sticky left-0 bg-slate-100 z-10">#</th>
                <th className="px-4 py-3 text-[10px] font-black uppercase text-slate-500 text-center">OM</th>
                <th className="px-4 py-3 text-[10px] font-black uppercase text-slate-500">DNI / Código</th>
                <th className="px-6 py-3 text-[10px] font-black uppercase text-slate-500">Apellidos y Nombres</th>
                <th className="px-6 py-3 text-[10px] font-black uppercase text-slate-500">Escuela Profesional</th>
                <th className="px-4 py-3 text-[10px] font-black uppercase text-slate-500">Filial</th>
                <th className="px-6 py-3 text-[10px] font-black uppercase text-slate-500">Modalidad</th>
                <th className="px-4 py-3 text-[10px] font-black uppercase text-slate-500 text-center">Puntaje</th>
                <th className="px-4 py-3 text-[10px] font-black uppercase text-slate-500 text-center">Semestre</th>

                {/* Custom Extra Columns Headers */}
                {selectedExtraColumns.map(colId => {
                  const colDef = AVAILABLE_EXTRA_COLUMNS.find(c => c.id === colId);
                  if (!colDef) return null;
                  return (
                    <th
                      key={colDef.id}
                      className="px-4 py-3 text-[10px] font-black uppercase text-primary bg-primary/5 border-l border-slate-200 whitespace-nowrap"
                    >
                      <div className="flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-[13px] text-primary/70">{categoryIcons[colDef.category] || 'tag'}</span>
                        <span>{colDef.label}</span>
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={9 + selectedExtraColumns.length} className="px-6 py-16 text-center">
                    <div className="flex flex-col items-center justify-center gap-3">
                      <span className="material-symbols-outlined animate-spin text-primary text-4xl">progress_activity</span>
                      <span className="text-xs font-black text-slate-600 uppercase tracking-wider">Cargando reporte de ingresantes...</span>
                    </div>
                  </td>
                </tr>
              ) : ingresantes.length === 0 ? (
                <tr>
                  <td colSpan={9 + selectedExtraColumns.length} className="px-6 py-16 text-center">
                    <div className="flex flex-col items-center justify-center gap-2 text-slate-400">
                      <span className="material-symbols-outlined text-5xl">manage_search</span>
                      <span className="text-sm font-bold text-slate-600">No hay datos que mostrar</span>
                      <p className="text-xs max-w-sm">Ajusta los filtros de Año, Semestre, Escuela o Modalidad y haz clic en "Buscar Reporte".</p>
                    </div>
                  </td>
                </tr>
              ) : (
                currentData.map((item, index) => {
                  const globalIdx = (currentPage - 1) * itemsPerPage + index + 1;
                  return (
                    <tr key={item.id || `${item.CODPOSTULANTE}-${index}`} className="hover:bg-slate-50/80 transition-colors text-xs">
                      <td className="px-4 py-3 text-center font-bold text-slate-400 sticky left-0 bg-white z-0">{globalIdx}</td>
                      <td className="px-4 py-3 text-center">
                        <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-mono font-bold text-[11px]">
                          {item.OMERITO || '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono font-bold text-slate-800">{item.CODPOSTULANTE}</td>
                      <td className="px-6 py-3 font-extrabold text-slate-900 uppercase">{item.NOMBRE}</td>
                      <td className="px-6 py-3 font-semibold text-slate-700">{item.CARRERA}</td>
                      <td className="px-4 py-3 font-medium text-slate-500">{item.FILIAL || 'CUSCO'}</td>
                      <td className="px-6 py-3">
                        <span className="inline-block px-2.5 py-1 rounded-lg bg-primary/10 text-primary font-bold text-[10px] uppercase">
                          {item.MODALIDAD}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center font-mono font-bold text-emerald-700">{item.NOTA || '—'}</td>
                      <td className="px-4 py-3 text-center font-bold text-slate-600">{item.SEMESTRE}</td>

                      {/* Custom Extra Columns Data Cells */}
                      {selectedExtraColumns.map(colId => (
                        <td key={colId} className="px-4 py-3 font-medium text-slate-700 border-l border-slate-100 bg-slate-50/40 whitespace-nowrap">
                          {getExtraColumnValue(item, colId)}
                        </td>
                      ))}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Bottom Pagination */}
        {totalPages > 1 && (
          <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-between bg-slate-50">
            <span className="text-xs font-semibold text-slate-500">
              Mostrando {((currentPage - 1) * itemsPerPage) + 1} - {Math.min(currentPage * itemsPerPage, ingresantes.length)} de {ingresantes.length}
            </span>

            <div className="flex items-center gap-1">
              <button
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(1)}
                className="px-2.5 py-1 text-xs font-bold rounded border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-30 cursor-pointer"
              >
                Primero
              </button>
              <button
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                className="p-1 rounded border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-30 cursor-pointer"
              >
                <span className="material-symbols-outlined text-base">chevron_left</span>
              </button>

              <span className="px-3 py-1 text-xs font-black text-slate-800">
                {currentPage} / {totalPages}
              </span>

              <button
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                className="p-1 rounded border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-30 cursor-pointer"
              >
                <span className="material-symbols-outlined text-base">chevron_right</span>
              </button>
              <button
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(totalPages)}
                className="px-2.5 py-1 text-xs font-bold rounded border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-30 cursor-pointer"
              >
                Último
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal: Customize Columns */}
      {showColumnModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="bg-primary/10 text-primary p-2.5 rounded-xl border border-primary/20">
                  <span className="material-symbols-outlined text-xl">view_column</span>
                </div>
                <div>
                  <h3 className="text-sm font-black uppercase tracking-tight text-slate-800">
                    Personalizar Columnas y Datos Adicionales
                  </h3>
                  <p className="text-[11px] text-slate-500 font-semibold">
                    Selecciona qué datos complementarios deseas visualizar en la tabla y exportaciones.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowColumnModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-200/60 transition-colors"
              >
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>

            {/* Quick Actions Toolbar */}
            <div className="px-6 py-2.5 bg-slate-100/70 border-b border-slate-200 flex items-center justify-between text-xs">
              <span className="font-bold text-slate-600">
                {selectedExtraColumns.length} de {AVAILABLE_EXTRA_COLUMNS.length} seleccionadas
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleSelectAllColumns}
                  className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-[11px] transition-colors"
                >
                  Marcar Todas
                </button>
                <button
                  onClick={handleDeselectAllColumns}
                  className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-[11px] transition-colors"
                >
                  Desmarcar Todas
                </button>
              </div>
            </div>

            {/* Modal Body: Categories & Columns */}
            <div className="p-6 overflow-y-auto space-y-6">
              {categories.map(category => {
                const categoryCols = AVAILABLE_EXTRA_COLUMNS.filter(c => c.category === category);
                const allSelected = categoryCols.every(c => selectedExtraColumns.includes(c.id));
                const someSelected = categoryCols.some(c => selectedExtraColumns.includes(c.id)) && !allSelected;

                return (
                  <div key={category} className="space-y-2.5">
                    {/* Category Header */}
                    <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
                      <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-primary text-base">
                          {categoryIcons[category]}
                        </span>
                        <span className="text-xs font-black uppercase text-slate-800 tracking-wider">
                          {category}
                        </span>
                      </div>
                      <button
                        onClick={() => handleToggleCategory(category)}
                        className="text-[10px] font-bold text-primary hover:underline uppercase"
                      >
                        {allSelected ? 'Desmarcar grupo' : 'Marcar grupo'}
                      </button>
                    </div>

                    {/* Category Column Pills / Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {categoryCols.map(col => {
                        const isSelected = selectedExtraColumns.includes(col.id);
                        return (
                          <div
                            key={col.id}
                            onClick={() => handleToggleColumn(col.id)}
                            className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between select-none ${
                              isSelected
                                ? 'bg-primary/5 border-primary/40 shadow-sm'
                                : 'bg-slate-50 border-slate-200 hover:border-slate-300 hover:bg-slate-100/70'
                            }`}
                          >
                            <div className="flex items-center gap-2.5">
                              <div
                                className={`w-4 h-4 rounded flex items-center justify-center border transition-colors ${
                                  isSelected
                                    ? 'bg-primary border-primary text-white'
                                    : 'border-slate-300 bg-white'
                                }`}
                              >
                                {isSelected && (
                                  <span className="material-symbols-outlined text-[13px] font-bold leading-none">
                                    check
                                  </span>
                                )}
                              </div>
                              <span className={`text-xs font-bold ${isSelected ? 'text-slate-900' : 'text-slate-700'}`}>
                                {col.label}
                              </span>
                            </div>
                            <span className="text-[9px] font-mono font-bold text-slate-400 bg-white px-1.5 py-0.5 rounded border border-slate-200">
                              {col.id}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
              <span className="text-xs text-slate-500 font-semibold">
                Los cambios se aplican inmediatamente y se conservan para tu sesión.
              </span>
              <button
                onClick={() => setShowColumnModal(false)}
                className="bg-primary hover:bg-merlot text-white px-6 h-10 rounded-xl font-black text-xs uppercase tracking-wider shadow-md shadow-primary/20 active:scale-95 transition-all cursor-pointer"
              >
                Guardar y Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default IngresantesReport;
