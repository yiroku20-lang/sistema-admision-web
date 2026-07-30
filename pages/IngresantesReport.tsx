import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { User } from '../types';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

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
      // Load Years
      const { data: cData } = await supabase.from('cv_cuadros_anuales').select('anio');
      const { data: pData } = await supabase.from('participantes').select('ANIO').not('ANIO', 'is', null).limit(1000);
      
      const yrSet = new Set<string>();
      if (cData) cData.forEach(c => c.anio && yrSet.add(String(c.anio)));
      if (pData) pData.forEach(p => p.ANIO && yrSet.add(String(p.ANIO)));
      if (yrSet.size === 0) ['2026', '2025', '2024'].forEach(y => yrSet.add(y));
      const sortedYears = Array.from(yrSet).sort((a, b) => b.localeCompare(a));
      setYearsList(sortedYears);

      // Load Schools/Careers
      const { data: escData } = await supabase.from('cv_escuelas').select('nombre').order('nombre', { ascending: true });
      if (escData) {
        const escNames = Array.from(new Set(escData.map(e => e.nombre.trim()))).filter(Boolean);
        setCareersList(escNames);
      }

      // Load Semesters
      const { data: semData } = await supabase.from('cv_modalidades').select('semestre').not('semestre', 'is', null);
      const semSet = new Set<string>();
      semSet.add('2026-II');
      semSet.add('2026-I');
      semSet.add('2025-II');
      semSet.add('2025-I');
      if (semData) semData.forEach(s => s.semestre && semSet.add(s.semestre.trim()));
      setSemestersList(Array.from(semSet).sort((a, b) => b.localeCompare(a)));

    } catch (e: any) {
      console.error('Error loading initial report filters:', e);
    } finally {
      setLoadingFilters(false);
    }
  };

  const loadModalitiesForFilter = async (year: string, semester: string) => {
    try {
      const modSet = new Set<string>();

      // A) Query cv_modalidades
      let modQuery = supabase.from('cv_modalidades').select('nombre, semestre, cv_cuadros_anuales(anio)');
      if (semester !== 'Todos') {
        modQuery = modQuery.eq('semestre', semester);
      }
      const { data: cvMods } = await modQuery;
      if (cvMods) {
        cvMods.forEach(m => {
          const modAnio = (m.cv_cuadros_anuales as any)?.anio ? String((m.cv_cuadros_anuales as any).anio) : '';
          if (year === 'Todos' || !modAnio || modAnio === year) {
            if (m.nombre) modSet.add(m.nombre.trim());
          }
        });
      }

      // B) Query distinct MODALIDAD from participantes for complete coverage
      let partQuery = supabase.from('participantes').select('MODALIDAD');
      if (year !== 'Todos') partQuery = partQuery.eq('ANIO', year);
      if (semester !== 'Todos') partQuery = partQuery.eq('SEMESTRE', semester);
      const { data: partMods } = await partQuery.limit(2000);
      if (partMods) {
        partMods.forEach(p => {
          if (p.MODALIDAD && p.MODALIDAD.trim() !== '') {
            modSet.add(p.MODALIDAD.trim());
          }
        });
      }

      const sortedMods = Array.from(modSet).sort((a, b) => a.localeCompare(b));
      setModalitiesList(sortedMods);
    } catch (e: any) {
      console.error('Error loading modalities list:', e);
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
          query = query.eq('ANIO', reportYear);
        }
        if (reportSemester !== 'Todos') {
          query = query.eq('SEMESTRE', reportSemester);
        }
        if (reportCareer !== 'Todas') {
          query = query.eq('CARRERA', reportCareer);
        }
        if (reportModality !== 'Todas') {
          query = query.eq('MODALIDAD', reportModality);
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

    const exportData = ingresantes.map((item, index) => ({
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
    }));

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
    notify?.('Archivo Excel exportado exitosamente.', 'success');
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

    // Table Columns
    const tableColumns = ['N°', 'OM', 'DNI', 'APELLIDOS Y NOMBRES', 'ESCUELA PROFESIONAL', 'CÓD. CAR.', 'FILIAL', 'MODALIDAD', 'NOTA'];
    const tableRows = ingresantes.map((item, idx) => [
      idx + 1,
      item.OMERITO || '—',
      item.CODPOSTULANTE || '',
      item.NOMBRE || '',
      item.CARRERA || '',
      item.codigo_carrera || '',
      item.FILIAL || 'CUSCO',
      item.MODALIDAD || '',
      item.NOTA || ''
    ]);

    autoTable(doc, {
      head: [tableColumns],
      body: tableRows,
      startY: 32,
      styles: { fontSize: 7, cellPadding: 1.5 },
      headStyles: { fillColor: [123, 21, 35], textColor: [255, 255, 255], fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: {
        0: { cellWidth: 12 },
        1: { cellWidth: 12 },
        2: { cellWidth: 22 },
        3: { cellWidth: 65 },
        4: { cellWidth: 60 },
        5: { cellWidth: 18 },
        6: { cellWidth: 22 },
        7: { cellWidth: 45 },
        8: { cellWidth: 15 }
      }
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
        <div className="flex items-center gap-2">
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
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
      </div>

      {/* Results Table Section */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
        {/* Table Top Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-4 bg-slate-50">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-slate-500 text-lg">format_list_bulleted</span>
            <span className="text-xs font-black uppercase tracking-wider text-slate-800">
              Listado de Ingresantes {ingresantes.length > 0 && `(${ingresantes.length} registros)`}
            </span>
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
                <th className="px-4 py-3 text-[10px] font-black uppercase text-slate-500 text-center w-12">#</th>
                <th className="px-4 py-3 text-[10px] font-black uppercase text-slate-500 text-center">OM</th>
                <th className="px-4 py-3 text-[10px] font-black uppercase text-slate-500">DNI / Código</th>
                <th className="px-6 py-3 text-[10px] font-black uppercase text-slate-500">Apellidos y Nombres</th>
                <th className="px-6 py-3 text-[10px] font-black uppercase text-slate-500">Escuela Profesional</th>
                <th className="px-4 py-3 text-[10px] font-black uppercase text-slate-500">Filial</th>
                <th className="px-6 py-3 text-[10px] font-black uppercase text-slate-500">Modalidad</th>
                <th className="px-4 py-3 text-[10px] font-black uppercase text-slate-500 text-center">Puntaje</th>
                <th className="px-4 py-3 text-[10px] font-black uppercase text-slate-500 text-center">Semestre</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={9} className="px-6 py-16 text-center">
                    <div className="flex flex-col items-center justify-center gap-3">
                      <span className="material-symbols-outlined animate-spin text-primary text-4xl">progress_activity</span>
                      <span className="text-xs font-black text-slate-600 uppercase tracking-wider">Cargando reporte de ingresantes...</span>
                    </div>
                  </td>
                </tr>
              ) : ingresantes.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-6 py-16 text-center">
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
                      <td className="px-4 py-3 text-center font-bold text-slate-400">{globalIdx}</td>
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
    </div>
  );
};

export default IngresantesReport;
