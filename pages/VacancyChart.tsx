import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../lib/supabaseClient';
import { User, ToastMessage, CVEscuela, CVCuadroAnual, CVModalidad, CVVacante } from '../types';
import * as XLSX from 'xlsx';


import { VacancyAnalytics } from '../components/VacancyAnalytics';

const splitTextIntoLines = (text: string, maxChars: number): string[] => {
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';
  words.forEach(word => {
    if ((currentLine + word).length > maxChars) {
      if (currentLine) lines.push(currentLine.trim());
      currentLine = word + ' ';
    } else {
      currentLine += word + ' ';
    }
  });
  if (currentLine) lines.push(currentLine.trim());
  return lines;
};

export const VacancyChart: React.FC<{ user: User, notify: (msg: string, type?: ToastMessage['type']) => void }> = ({ user, notify }) => {
  const [view, setView] = useState<'dashboard' | 'editor' | 'preview' | 'analytics'>('dashboard');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [cuadros, setCuadros] = useState<CVCuadroAnual[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Editor State
  const [selectedCuadro, setSelectedCuadro] = useState<CVCuadroAnual | null>(null);
  const [escuelas, setEscuelas] = useState<CVEscuela[]>([]);
  const [modalidades, setModalidades] = useState<CVModalidad[]>([]);
  const [vacantesMap, setVacantesMap] = useState<Record<string, number | ''>>({}); // key: `${escuela_id}_${modalidad_id}`
  const [isSavingCell, setIsSavingCell] = useState(false);
  const [isEditLocked, setIsEditLocked] = useState(true);

  // Filters for preview
  const [filterArea, setFilterArea] = useState<string>('Todas');
  const [filterSemestre, setFilterSemestre] = useState<string>('Todos');
  const [filterModalidades, setFilterModalidades] = useState<string[]>([]);
  const [isModalidadesDropdownOpen, setIsModalidadesDropdownOpen] = useState(false);

  // Modals
  const [isNewCuadroModalOpen, setIsNewCuadroModalOpen] = useState(false);
  const [newAnio, setNewAnio] = useState('');
  
  const [isDeleteModalidadModalOpen, setIsDeleteModalidadModalOpen] = useState(false);

  const [isEscuelasModalOpen, setIsEscuelasModalOpen] = useState(false);
  const csvInputRef = useRef<HTMLInputElement>(null);
  const [csvPreview, setCsvPreview] = useState<any[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [allEscuelas, setAllEscuelas] = useState<CVEscuela[]>([]);

  const [isModalidadModalOpen, setIsModalidadModalOpen] = useState(false);
  const [editingModalityId, setEditingModalityId] = useState<string | null>(null);
  const [modForm, setModForm] = useState({ semestre: '2026-I', nombre: '', peso_porcentaje: '100%', orden: 0 });

  const [isCloseModalOpen, setIsCloseModalOpen] = useState(false);
  const [closeForm, setCloseForm] = useState({ resolution_number: '', resolution_date: '' });
  const [resolutionFile, setResolutionFile] = useState<File | null>(null);
  const [cuadroResolutions, setCuadroResolutions] = useState<any[]>([]);

  const previewRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchCuadros();
  }, []);

  const fetchCuadros = async () => {
    setLoading(true);
    const { data, error } = await supabase.from('cv_cuadros_anuales').select('*').order('anio', { ascending: false });
    if (error) {
      notify('Error al cargar cuadros: ' + error.message, 'error');
    } else {
      setCuadros(data || []);
    }
    setLoading(false);
  };

  const fetchAllEscuelas = async () => {
    const { data, error } = await supabase.from('cv_escuelas').select('*').order('area', { ascending: true }).order('orden', { ascending: true }).order('nombre', { ascending: true });
    if (!error && data) {
      setAllEscuelas(data);
    }
  };

  const handleToggleHideEscuela = async (escuela: CVEscuela) => {
    try {
      const newHiddenState = !escuela.is_hidden;
      const { error } = await supabase.from('cv_escuelas').update({ is_hidden: newHiddenState }).eq('id', escuela.id);
      if (error) throw error;
      notify(`Escuela ${newHiddenState ? 'ocultada' : 'restaurada'} correctamente`, 'success');
      fetchAllEscuelas();
      if (selectedCuadro) loadEditorData(selectedCuadro);
    } catch (err: any) {
      notify('Error al actualizar: ' + err.message, 'error');
    }
  };

  const handleToggleReception = async (cuadro: CVCuadroAnual) => {
    try {
      const newState = !cuadro.recepcion_abierta;
      const { error } = await supabase
        .from('cv_cuadros_anuales')
        .update({ recepcion_abierta: newState })
        .eq('id', cuadro.id);

      if (error) throw error;
      
      notify(`Recepción de vacantes ${newState ? 'activada' : 'desactivada'} para el proceso ${cuadro.anio}`, 'success');
      fetchCuadros();
    } catch (err: any) {
      notify('Error al actualizar estado de recepción: ' + err.message, 'error');
    }
  };

  const loadEditorData = async (cuadro: CVCuadroAnual) => {
    setLoading(true);
    setSelectedCuadro(cuadro);
    
    try {
      // Fetch Modalidades
      const { data: modData, error: modErr } = await supabase.from('cv_modalidades').select('*').eq('cuadro_id', cuadro.id).order('semestre', { ascending: true }).order('orden', { ascending: true });
      if (modErr) throw modErr;
      setModalidades(modData || []);

      // Fetch Vacantes
      const vMap: Record<string, number | ''> = {};
      if (modData && modData.length > 0) {
        const modIds = modData.map(m => m.id);
        const { data: vacData, error: vacErr } = await supabase.from('cv_vacantes').select('*').in('modalidad_id', modIds);
        if (vacErr) throw vacErr;
        
        vacData?.forEach(v => {
          vMap[`${v.escuela_id}_${v.modalidad_id}`] = v.cantidad;
        });
        setVacantesMap(vMap);
      } else {
        setVacantesMap({});
      }

      // Fetch Escuelas
      const { data: escData, error: escErr } = await supabase.from('cv_escuelas').select('*').order('area', { ascending: true }).order('orden', { ascending: true }).order('nombre', { ascending: true });
      if (escErr) throw escErr;
      
      const allEscuelas = escData || [];
      if (cuadro.estado === 'Aprobado') {
        const activeEscuelas = allEscuelas.filter(esc => {
          return modData?.some(m => (vMap[`${esc.id}_${m.id}`] || 0) > 0);
        });
        setEscuelas(activeEscuelas);
      } else {
        setEscuelas(allEscuelas.filter(e => !e.is_hidden || modData?.some(m => (vMap[`${e.id}_${m.id}`] || 0) > 0)));
      }

      // Fetch Resolutions if approved
      if (cuadro.resolucion_id) {
        const { data: resData } = await supabase.from('resolutions')
          .select('*')
          .or(`id.eq.${cuadro.resolucion_id},parent_id.eq.${cuadro.resolucion_id}`)
          .order('date', { ascending: true });
        setCuadroResolutions(resData || []);
      } else {
        setCuadroResolutions([]);
      }
      
      setView('editor');
    } catch (err: any) {
      notify('Error al cargar datos del editor: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateCuadro = async () => {
    if (!newAnio.trim()) return;
    
    try {
      const { data: newCuadro, error } = await supabase.from('cv_cuadros_anuales').insert([{ anio: newAnio, estado: 'Borrador' }]).select().single();
      if (error) throw error;

      // Find most recent cuadro to clone modalities
      const { data: lastCuadros } = await supabase.from('cv_cuadros_anuales')
        .select('id')
        .neq('id', newCuadro.id)
        .order('anio', { ascending: false })
        .limit(1);

      if (lastCuadros && lastCuadros.length > 0) {
        const lastCuadroId = lastCuadros[0].id;
        const { data: oldMods } = await supabase.from('cv_modalidades').select('*').eq('cuadro_id', lastCuadroId);
        
        if (oldMods && oldMods.length > 0) {
          const newMods = oldMods.map(m => ({
            cuadro_id: newCuadro.id,
            semestre: m.semestre.replace(/\d{4}/, newAnio), // e.g. 2026-I -> 2027-I
            nombre: m.nombre,
            peso_porcentaje: m.peso_porcentaje,
            orden: m.orden
          }));
          await supabase.from('cv_modalidades').insert(newMods);
        }
      }

      notify('Cuadro creado exitosamente', 'success');
      setIsNewCuadroModalOpen(false);
      setNewAnio('');
      fetchCuadros();
      loadEditorData(newCuadro);
    } catch (err: any) {
      notify('Error al crear cuadro: ' + err.message, 'error');
    }
  };

  const handleCsvFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
        const content = evt.target?.result as string;
        const lines = content.split(/\r?\n/);
        const results = [];
        for (let i = 1; i < lines.length; i++) {
            if (!lines[i].trim()) continue;
            const cols = lines[i].split(',').map(c => c.trim());
            // Expected: 1. Nombre | 2. Codigo | 3. Area | 4. Filial
            results.push({
                nombre: cols[0] || '',
                codigo_carrera: cols[1] || '',
                area: cols[2] || '',
                filial: cols[3] || 'CUSCO'
            });
        }
        setCsvPreview(results);
    };
    reader.readAsText(file);
  };

  const processEscuelasImport = async () => {
    if (csvPreview.length === 0) return;
    setIsImporting(true);
    try {
      const { error } = await supabase.from('cv_escuelas').insert(csvPreview);
      if (error) throw error;
      notify(`Se importaron ${csvPreview.length} escuelas correctamente.`, 'success');
      setIsEscuelasModalOpen(false);
      setCsvPreview([]);
      if (view === 'editor' && selectedCuadro) {
        loadEditorData(selectedCuadro);
      }
    } catch (err: any) {
      notify('Error al importar: ' + err.message, 'error');
    } finally {
      setIsImporting(false);
    }
  };

  const openEditModalidad = (m: CVModalidad) => {
    setEditingModalityId(m.id);
    setModForm({
      semestre: m.semestre,
      nombre: m.nombre,
      peso_porcentaje: m.peso_porcentaje,
      orden: m.orden
    });
    setIsModalidadModalOpen(true);
  };

  const handleSaveModalidad = async () => {
    if (!selectedCuadro || !modForm.nombre.trim() || !modForm.semestre.trim()) return;
    try {
      if (editingModalityId) {
        const { error } = await supabase.from('cv_modalidades').update({
          semestre: modForm.semestre,
          nombre: modForm.nombre,
          peso_porcentaje: modForm.peso_porcentaje,
          orden: modForm.orden
        }).eq('id', editingModalityId);
        if (error) throw error;
        notify('Modalidad actualizada', 'success');
      } else {
        const { error } = await supabase.from('cv_modalidades').insert([{
          cuadro_id: selectedCuadro.id,
          semestre: modForm.semestre,
          nombre: modForm.nombre,
          peso_porcentaje: modForm.peso_porcentaje,
          orden: modForm.orden
        }]);
        if (error) throw error;
        notify('Modalidad agregada', 'success');
      }
      setIsModalidadModalOpen(false);
      setEditingModalityId(null);
      setModForm({ semestre: '2026-I', nombre: '', peso_porcentaje: '100%', orden: modalidades.length + 1 });
      loadEditorData(selectedCuadro);
    } catch (err: any) {
      notify('Error: ' + err.message, 'error');
    }
  };

  const handleDeleteModalidad = async () => {
    setIsDeleteModalidadModalOpen(true);
  };

  const confirmDeleteModalidad = async () => {
    if (!editingModalityId) return;
    setIsDeleteModalidadModalOpen(false);
    try {
      const { error } = await supabase.from('cv_modalidades').delete().eq('id', editingModalityId);
      if (error) throw error;
      notify('Modalidad eliminada', 'success');
      setIsModalidadModalOpen(false);
      setEditingModalityId(null);
      loadEditorData(selectedCuadro!);
    } catch (err: any) {
      notify('Error al eliminar: ' + err.message, 'error');
    }
  };

  const handleAliasChange = (escuelaId: string, newAlias: string) => {
    setEscuelas(prev => prev.map(esc => esc.id === escuelaId ? { ...esc, alias: newAlias } : esc));
  };

  const saveAlias = async (escuelaId: string, newAlias: string) => {
    try {
      await supabase.from('cv_escuelas').update({ alias: newAlias }).eq('id', escuelaId);
    } catch (err) {
      console.error('Error saving alias:', err);
    }
  };

  const handleDragStart = (e: React.DragEvent, id: string) => {
    e.dataTransfer.setData('text/plain', id);
  };

  const handleDrop = async (e: React.DragEvent, targetId: string, area: string) => {
    e.preventDefault();
    const draggedId = e.dataTransfer.getData('text/plain');
    if (draggedId === targetId) return;

    const areaEscuelas = escuelas.filter(esc => esc.area === area);
    const draggedIdx = areaEscuelas.findIndex(esc => esc.id === draggedId);
    const targetIdx = areaEscuelas.findIndex(esc => esc.id === targetId);

    if (draggedIdx === -1 || targetIdx === -1) return;

    const newAreaEscuelas = [...areaEscuelas];
    const [draggedItem] = newAreaEscuelas.splice(draggedIdx, 1);
    newAreaEscuelas.splice(targetIdx, 0, draggedItem);

    // Update local state
    const newEscuelas = escuelas.map(esc => {
      if (esc.area === area) {
        const newOrder = newAreaEscuelas.findIndex(e => e.id === esc.id);
        return { ...esc, orden: newOrder };
      }
      return esc;
    });
    
    // Sort the new array so it renders correctly immediately
    newEscuelas.sort((a, b) => {
      if (a.area !== b.area) return a.area.localeCompare(b.area);
      const orderA = a.orden || 0;
      const orderB = b.orden || 0;
      if (orderA !== orderB) return orderA - orderB;
      return a.nombre.localeCompare(b.nombre);
    });
    
    setEscuelas(newEscuelas);

    // Update DB
    try {
      const updates = newAreaEscuelas.map((esc, idx) => ({
        id: esc.id,
        orden: idx
      }));
      for (const update of updates) {
        await supabase.from('cv_escuelas').update({ orden: update.orden }).eq('id', update.id);
      }
    } catch (err) {
      console.error('Error updating order:', err);
    }
  };

  const handleCellChange = async (escuelaId: string, modalidadId: string, value: string) => {
    if (!selectedCuadro || selectedCuadro.estado === 'Aprobado') return;
    
    const finalValue = value === '' ? '' : (parseInt(value, 10) || 0);
    const dbValue = finalValue === '' ? 0 : finalValue;
    
    const escuela = escuelas.find(e => e.id === escuelaId);
    const modalidad = modalidades.find(m => m.id === modalidadId);
    if (!escuela || !modalidad) return;

    // Identificar si es columna pivote
    const modsInSem = modalidades.filter(m => m.semestre === modalidad.semestre);
    const isCusco = escuela.filial === 'CUSCO';
    const pivotModId = isCusco ? modsInSem[0]?.id : modsInSem[1]?.id;
    const oppositePivotModId = isCusco ? modsInSem[1]?.id : modsInSem[0]?.id;
    const isPivot = modalidadId === pivotModId;

    const updatesToMap: Record<string, number | ''> = { [`${escuelaId}_${modalidadId}`]: finalValue };
    const dbUpserts: any[] = [{
      escuela_id: escuelaId,
      modalidad_id: modalidadId,
      cantidad: dbValue
    }];

    // Si es pivote, calcular las demás modalidades del mismo semestre
    if (isPivot && finalValue !== '') {
      modsInSem.forEach(m => {
        if (m.id !== modalidadId) {
          let calcValue = 0;
          if (m.id === oppositePivotModId) {
            calcValue = 0;
          } else {
            const pctStr = m.peso_porcentaje.replace('%', '').replace(',', '.').trim();
            const pct = parseFloat(pctStr) || 0;
            calcValue = Math.round(dbValue * (pct / 100));
          }
          
          updatesToMap[`${escuelaId}_${m.id}`] = calcValue;
          dbUpserts.push({
            escuela_id: escuelaId,
            modalidad_id: m.id,
            cantidad: calcValue
          });
        }
      });
    }

    // Optimistic update
    setVacantesMap(prev => ({ ...prev, ...updatesToMap }));

    setIsSavingCell(true);
    try {
      const { error } = await supabase.from('cv_vacantes').upsert(dbUpserts, { onConflict: 'escuela_id, modalidad_id' });
      
      if (error) throw error;
    } catch (err: any) {
      notify('Error al guardar celda: ' + err.message, 'error');
    } finally {
      setIsSavingCell(false);
    }
  };

  const handleCloseCuadro = async () => {
    if (!selectedCuadro || !closeForm.resolution_number || !resolutionFile) {
      notify('Debe completar todos los campos y adjuntar el PDF', 'warning');
      return;
    }
    
    setIsImporting(true);
    try {
      const fileExt = resolutionFile.name.split('.').pop();
      const fileName = `cuadro_${selectedCuadro.anio}_${Date.now()}.${fileExt}`;
      
      const { error: uploadError } = await supabase.storage
          .from('documentos')
          .upload(`resoluciones/${fileName}`, resolutionFile);

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
          .from('documentos')
          .getPublicUrl(`resoluciones/${fileName}`);

      // Create resolution record
      const isFeDeErratas = !!selectedCuadro.resolucion_id;
      const resPayload = {
        number: closeForm.resolution_number,
        date: closeForm.resolution_date || new Date().toISOString().split('T')[0],
        subject: isFeDeErratas ? `MODIFICACIÓN CUADRO DE VACANTES ${selectedCuadro.anio}` : `CUADRO DE VACANTES ${selectedCuadro.anio}`,
        tag: 'Cuadro de Vacantes',
        pdf_url: urlData.publicUrl,
        parent_id: isFeDeErratas ? selectedCuadro.resolucion_id : null
      };

      const { data: newRes, error: resError } = await supabase.from('resolutions').insert([resPayload]).select().single();
      if (resError) throw resError;

      const { error: updateError } = await supabase.from('cv_cuadros_anuales').update({
        estado: 'Aprobado',
        resolucion_id: isFeDeErratas ? selectedCuadro.resolucion_id : newRes.id
      }).eq('id', selectedCuadro.id);

      if (updateError) throw updateError;

      notify('Cuadro cerrado y aprobado exitosamente', 'success');
      setIsCloseModalOpen(false);
      setResolutionFile(null);
      setCloseForm({ resolution_number: '', resolution_date: '' });
      fetchCuadros();
      loadEditorData({ ...selectedCuadro, estado: 'Aprobado', resolucion_id: isFeDeErratas ? selectedCuadro.resolucion_id : newRes.id });
    } catch (err: any) {
      notify('Error al cerrar cuadro: ' + err.message, 'error');
    } finally {
      setIsImporting(false);
    }
  };

  const handleExportExcel = () => {
    if (!selectedCuadro) return;
    
    // Create a simple worksheet from the table
    const table = document.querySelector('.exportable-table') || document.querySelector('table');
    if (!table) return;
    
    const wb = XLSX.utils.table_to_book(table, { sheet: "Cuadro Vacantes" });
    XLSX.writeFile(wb, `Cuadro_Vacantes_${selectedCuadro.anio}.xlsx`);
  };

  const handleExportPDF = () => {
    window.print();
    
  };

  // Calculations
  const getRowTotal = (escuelaId: string, semestre?: string, mods = modalidades) => {
    let total = 0;
    mods.forEach(m => {
      if (!semestre || m.semestre === semestre) {
        const val = vacantesMap[`${escuelaId}_${m.id}`];
        total += (typeof val === 'number' ? val : 0);
      }
    });
    return total;
  };

  const getColTotal = (modalidadId: string, area?: string, escs = escuelas) => {
    let total = 0;
    escs.forEach(e => {
      if (!area || e.area === area) {
        const val = vacantesMap[`${e.id}_${modalidadId}`];
        total += (typeof val === 'number' ? val : 0);
      }
    });
    return total;
  };

  const getAreaTotal = (area: string, semestre?: string, escs = escuelas, mods = modalidades) => {
    let total = 0;
    escs.filter(e => e.area === area).forEach(e => {
      total += getRowTotal(e.id, semestre, mods);
    });
    return total;
  };

  const getGrandTotal = (semestre?: string, escs = escuelas, mods = modalidades) => {
    let total = 0;
    escs.forEach(e => {
      total += getRowTotal(e.id, semestre, mods);
    });
    return total;
  };

  // Grouping
  const areas = Array.from(new Set(escuelas.map(e => e.area))).sort() as string[];
  const semestres = Array.from(new Set(modalidades.map(m => m.semestre))).sort() as string[];
  const filiales = Array.from(new Set(escuelas.map(e => e.filial))).sort() as string[];

  // Filtered data for preview
  const filteredEscuelas = escuelas.filter(e => {
    if (filterArea !== 'Todas' && e.area !== filterArea) return false;
    return true;
  });

  const filteredModalidades = modalidades.filter(m => {
    if (filterSemestre !== 'Todos' && m.semestre !== filterSemestre) return false;
    if (filterModalidades.length > 0 && !filterModalidades.includes(m.id)) return false;
    return true;
  });

  const filteredAreas = Array.from(new Set(filteredEscuelas.map(e => e.area))).sort() as string[];
  const filteredSemestres = Array.from(new Set(filteredModalidades.map(m => m.semestre))).sort() as string[];

  const page1Areas = filteredAreas.filter(a => ['A', 'B'].includes(a));
  const page2Areas = filteredAreas.filter(a => !['A', 'B'].includes(a));
  const pdfPages: string[][] = [];
  if (page1Areas.length > 0) pdfPages.push(page1Areas);
  if (page2Areas.length > 0) pdfPages.push(page2Areas);

  return (
    <div className="w-full max-w-[1600px] mx-auto flex flex-col gap-6 p-4 md:p-8 h-full overflow-hidden">
      {view === 'dashboard' ? (
        <>
          <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-6 shrink-0">
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-3">
                <div className="size-10 bg-indigo-100 text-indigo-600 rounded-xl flex items-center justify-center">
                  <span className="material-symbols-outlined">grid_on</span>
                </div>
                <h1 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight uppercase">Cuadro de Vacantes</h1>
              </div>
              <p className="text-sm font-bold text-slate-500 uppercase tracking-widest">Gestión de vacantes por proceso de admisión</p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setView('analytics')} className="flex items-center gap-2 rounded-xl h-12 px-5 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 text-emerald-700 text-sm font-bold shadow-sm transition-all">
                <span className="material-symbols-outlined text-[20px]">bar_chart</span>
                Estadísticas Globales
              </button>
              <button onClick={() => { setIsEscuelasModalOpen(true); fetchAllEscuelas(); }} className="flex items-center gap-2 rounded-xl h-12 px-5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-sm font-bold shadow-sm transition-all">
                <span className="material-symbols-outlined text-[20px]">domain</span>
                Gestionar Escuelas
              </button>
              <button onClick={() => setIsNewCuadroModalOpen(true)} className="flex items-center gap-2 rounded-xl h-12 px-6 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-black uppercase tracking-widest shadow-lg shadow-indigo-200 transition-all active:scale-95">
                <span className="material-symbols-outlined text-[20px]">add</span>
                Nuevo Cuadro
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-auto">
            {loading ? (
              <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
              </div>
            ) : cuadros.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-slate-400 gap-4">
                <span className="material-symbols-outlined text-6xl opacity-20">grid_off</span>
                <p className="font-bold uppercase tracking-widest text-sm">No hay cuadros registrados</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {cuadros.map(c => (
                  <div key={c.id} className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm hover:shadow-md transition-all flex flex-col gap-4">
                    <div className="flex justify-between items-start">
                      <div className="size-14 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center font-black text-xl border border-indigo-100">
                        {c.anio}
                      </div>
                      <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border ${c.estado === 'Aprobado' ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : 'bg-amber-50 text-amber-600 border-amber-200'}`}>
                        {c.estado}
                      </span>
                    </div>
                    <div>
                      <h3 className="font-black text-slate-900 text-lg uppercase">Proceso {c.anio}</h3>
                      {c.estado === 'Aprobado' && c.resolution_number && (
                        <p className="text-xs font-bold text-slate-500 mt-1 flex items-center gap-1">
                          <span className="material-symbols-outlined text-[14px]">gavel</span>
                          {c.resolution_number}
                        </p>
                      )}
                      
                      {c.estado === 'Borrador' && (
                        <div className="mt-3 flex items-center justify-between bg-slate-50 p-3 rounded-2xl border border-slate-100">
                          <div className="flex items-center gap-2">
                             <div className={`size-2 rounded-full ${c.recepcion_abierta ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}`}></div>
                             <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                               Recepción: {c.recepcion_abierta ? 'Abierta' : 'Cerrada'}
                             </span>
                          </div>
                          <button 
                            onClick={() => handleToggleReception(c)}
                            className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${c.recepcion_abierta ? 'bg-emerald-600 text-white hover:bg-emerald-700' : 'bg-slate-200 text-slate-600 hover:bg-slate-300'}`}
                          >
                            <span className="material-symbols-outlined text-[14px]">{c.recepcion_abierta ? 'lock_open' : 'lock'}</span>
                            {c.recepcion_abierta ? 'Cerrar' : 'Abrir'}
                          </button>
                        </div>
                      )}
                    </div>
                    <div className="mt-auto pt-4 border-t border-slate-100 flex gap-2">
                      <button onClick={() => loadEditorData(c)} className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all">
                        {c.estado === 'Aprobado' ? 'Ver Cuadro' : 'Editar Cuadro'}
                      </button>
                      {c.estado === 'Aprobado' && c.resolution_pdf && (
                        <a href={c.resolution_pdf} target="_blank" rel="noopener noreferrer" className="size-10 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 rounded-xl flex items-center justify-center transition-all border border-emerald-100" title="Ver Resolución">
                          <span className="material-symbols-outlined text-[20px]">download</span>
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      ) : view === 'analytics' ? (
        <VacancyAnalytics onBack={() => setView('dashboard')} notify={notify} />
      ) : (
        /* EDITOR VIEW */
        <div className="flex flex-col h-full overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4 shrink-0">
            <div className="flex items-center gap-4">
              <button onClick={() => setView('dashboard')} className="size-10 rounded-full bg-white border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-900 flex items-center justify-center transition-all">
                <span className="material-symbols-outlined">arrow_back</span>
              </button>
              <div>
                <h1 className="text-xl font-black text-slate-900 tracking-tight uppercase flex items-center gap-2">
                  Cuadro de Vacantes {selectedCuadro?.anio}
                  {selectedCuadro?.estado === 'Aprobado' && <span className="material-symbols-outlined text-emerald-500 text-[20px]" title="Aprobado">verified</span>}
                </h1>
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                  {selectedCuadro?.estado === 'Borrador' ? 'Modo Edición' : 'Modo Lectura'} {isSavingCell && '• Guardando...'}
                </p>
              </div>
            </div>
            
            <div className="flex gap-2">
              <button onClick={() => setView(view === 'preview' ? 'editor' : 'preview')} className={`flex items-center gap-2 rounded-xl h-10 px-4 text-xs font-bold shadow-sm transition-all border ${view === 'preview' ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200' : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border-indigo-200'}`}>
                <span className="material-symbols-outlined text-[18px]">{view === 'preview' ? 'edit' : 'preview'}</span>
                {view === 'preview' ? 'Volver a Edición' : 'Vista Previa / Reporte'}
              </button>
              
              <button onClick={() => setIsFullscreen(!isFullscreen)} className="flex items-center gap-2 rounded-xl h-10 px-4 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold shadow-sm transition-all">
                <span className="material-symbols-outlined text-[18px]">{isFullscreen ? 'fullscreen_exit' : 'fullscreen'}</span>
                {isFullscreen ? 'Minimizar' : 'Pantalla Completa'}
              </button>

              {view === 'editor' && selectedCuadro?.estado === 'Borrador' && (
                <>
                  <button 
                    onClick={() => setIsEditLocked(!isEditLocked)} 
                    className={`flex items-center gap-2 rounded-xl h-10 px-4 text-xs font-bold shadow-sm transition-all ${isEditLocked ? 'bg-amber-100 text-amber-700 hover:bg-amber-200' : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'}`}
                    title={isEditLocked ? 'Desbloquear edición' : 'Bloquear edición'}
                  >
                    <span className="material-symbols-outlined text-[18px]">{isEditLocked ? 'lock' : 'lock_open'}</span>
                    {isEditLocked ? 'Desbloquear Edición' : 'Bloquear Edición'}
                  </button>
                  <button onClick={() => { setEditingModalityId(null); setModForm({ semestre: selectedCuadro?.anio + '-I', nombre: '', peso_porcentaje: '100%', orden: modalidades.length + 1 }); setIsModalidadModalOpen(true); }} className="flex items-center gap-2 rounded-xl h-10 px-4 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold shadow-sm transition-all">
                    <span className="material-symbols-outlined text-[18px]">view_column</span>
                    Agregar Modalidad
                  </button>
                  <button onClick={() => setIsCloseModalOpen(true)} className="flex items-center gap-2 rounded-xl h-10 px-5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black uppercase tracking-widest shadow-lg shadow-emerald-200 transition-all active:scale-95">
                    <span className="material-symbols-outlined text-[18px]">check_circle</span>
                    {selectedCuadro.resolucion_id ? 'Aprobar Modificación' : 'Cerrar Cuadro'}
                  </button>
                </>
              )}
              {view === 'editor' && selectedCuadro?.estado === 'Aprobado' && (
                <>
                  <button onClick={async () => {
                    const { error } = await supabase.from('cv_cuadros_anuales').update({ estado: 'Borrador' }).eq('id', selectedCuadro.id);
                    if (error) notify('Error al habilitar edición', 'error');
                    else {
                      notify('Modo edición habilitado (Fe de Erratas)', 'success');
                      fetchCuadros();
                      loadEditorData({ ...selectedCuadro, estado: 'Borrador' });
                    }
                  }} className="flex items-center gap-2 rounded-xl h-10 px-4 bg-amber-500 hover:bg-amber-600 text-white text-xs font-black uppercase tracking-widest shadow-lg shadow-amber-200 transition-all active:scale-95">
                    <span className="material-symbols-outlined text-[18px]">edit_note</span>
                    Fe de Erratas
                  </button>
                  <button onClick={handleExportExcel} className="flex items-center gap-2 rounded-xl h-10 px-5 bg-slate-800 hover:bg-slate-900 text-white text-xs font-black uppercase tracking-widest shadow-lg transition-all active:scale-95">
                    <span className="material-symbols-outlined text-[18px]">download</span>
                    Exportar Excel
                  </button>
                </>
              )}
            </div>
          </div>

          {cuadroResolutions.length > 0 && (
            <div className="flex items-center gap-2 mt-4 overflow-x-auto pb-2">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-widest mr-2">Resoluciones:</span>
              {cuadroResolutions.map((res, idx) => (
                <a key={res.id} href={res.pdf_url} target="_blank" rel="noreferrer" className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${idx === 0 ? 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100' : 'bg-amber-50 text-amber-700 hover:bg-amber-100'}`}>
                  <span className="material-symbols-outlined text-[16px]">picture_as_pdf</span>
                  {res.number}
                  {idx > 0 && <span className="text-[10px] opacity-75 ml-1">(Modificatoria)</span>}
                </a>
              ))}
            </div>
          )}

          {view === 'editor' && (() => {
            const editorContent = (
              <>
                {loading ? (
                  <div className="flex items-center justify-center h-full">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
                  </div>
                ) : (
                  <div className="min-w-max">
                    <table className="w-full text-left border-collapse text-[10px] md:text-xs">
                      <thead className="sticky top-0 z-20 bg-slate-100 shadow-sm">
                    {/* Semestre Headers */}
                    <tr>
                      <th className="p-3 border-b border-r border-slate-200 bg-slate-100 z-30 sticky left-0 font-black uppercase text-slate-700 text-center align-middle" rowSpan={2}>
                        Escuelas Profesionales
                      </th>
                      {semestres.map(sem => {
                        const modsInSem = modalidades.filter(m => m.semestre === sem);
                        return (
                          <th key={sem} colSpan={modsInSem.length + 1} className="p-2 border-b border-r border-slate-200 font-black uppercase text-center bg-slate-200 text-slate-800">
                            {sem}
                          </th>
                        );
                      })}
                      <th className="p-2 border-b border-slate-200 font-black uppercase text-center bg-slate-800 text-white" rowSpan={2}>
                        TOTAL {selectedCuadro?.anio}
                      </th>
                    </tr>
                    {/* Modalidad Headers */}
                    <tr>
                      {semestres.map(sem => {
                        const modsInSem = modalidades.filter(m => m.semestre === sem);
                        return (
                          <React.Fragment key={`mods-${sem}`}>
                            {modsInSem.map(m => (
                              <th key={m.id} className="p-2 border-b border-r border-slate-200 font-bold text-center w-20 bg-white relative group" title={m.nombre}>
                                {selectedCuadro?.estado === 'Borrador' && (
                                  <button 
                                    onClick={() => openEditModalidad(m)}
                                    className="absolute top-1 right-1 size-5 bg-slate-100 hover:bg-indigo-100 text-slate-400 hover:text-indigo-600 rounded flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all"
                                    title="Editar Modalidad"
                                  >
                                    <span className="material-symbols-outlined text-[12px]">edit</span>
                                  </button>
                                )}
                                <div className="[writing-mode:vertical-rl] rotate-180 h-32 mx-auto text-[9px] tracking-wider text-slate-600">
                                  {m.nombre}
                                </div>
                                <div className="mt-2 border-t border-slate-100 pt-1 text-primary font-black">{m.peso_porcentaje}</div>
                              </th>
                            ))}
                            <th className="p-2 border-b border-r border-slate-200 font-black text-center w-20 bg-slate-100 text-slate-800">
                              <div className="[writing-mode:vertical-rl] rotate-180 h-32 mx-auto text-[10px] tracking-widest">
                                TOTAL {sem}
                              </div>
                            </th>
                          </React.Fragment>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {areas.map(area => (
                      <React.Fragment key={`area-${area}`}>
                        {/* Area Header */}
                        <tr className="bg-slate-50">
                          <td className="p-2 font-black text-slate-800 uppercase sticky left-0 bg-slate-50 border-r border-slate-200 z-10" colSpan={1}>
                            ÁREA {area}
                          </td>
                          <td colSpan={modalidades.length + semestres.length + 1} className="p-2 font-black text-slate-400 text-center tracking-[0.5em]">
                            V A C A N T E S
                          </td>
                        </tr>
                        
                        {/* Escuelas in Area */}
                        {escuelas.filter(e => e.area === area).map(escuela => (
                          <tr 
                            key={escuela.id} 
                            className="hover:bg-blue-50/30 transition-colors group/row"
                            draggable={selectedCuadro?.estado === 'Borrador' && !isEditLocked}
                            onDragStart={(e) => handleDragStart(e, escuela.id)}
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={(e) => handleDrop(e, escuela.id, area)}
                          >
                            <td className="p-2 border-r border-slate-200 sticky left-0 bg-white group-hover/row:bg-blue-50/30 z-10 transition-colors">
                              <div className="flex items-center gap-2">
                                {selectedCuadro?.estado === 'Borrador' && !isEditLocked && (
                                  <span className="material-symbols-outlined text-slate-300 cursor-grab active:cursor-grabbing text-[16px] hover:text-indigo-500 transition-colors shrink-0" title="Arrastrar para reordenar">drag_indicator</span>
                                )}
                                <div className="flex-1 min-w-0">
                                  {selectedCuadro?.estado === 'Borrador' ? (
                                    <input
                                      value={escuela.alias ?? escuela.nombre ?? ''}
                                      onChange={(e) => handleAliasChange(escuela.id, e.target.value)}
                                      onBlur={(e) => saveAlias(escuela.id, e.target.value)}
                                      readOnly={isEditLocked}
                                      className={`font-bold text-slate-700 uppercase bg-transparent border-b border-transparent outline-none w-full text-xs transition-colors ${isEditLocked ? 'cursor-not-allowed opacity-80' : 'hover:border-slate-300 focus:border-indigo-500'}`}
                                      title={`Nombre original: ${escuela.nombre}`}
                                      placeholder={escuela.nombre}
                                    />
                                  ) : (
                                    <p className="font-bold text-slate-700 uppercase text-xs truncate" title={`Nombre original: ${escuela.nombre}`}>
                                      {escuela.alias || escuela.nombre}
                                    </p>
                                  )}
                                  {escuela.filial !== 'CUSCO' && <p className="text-[9px] text-slate-400 font-black uppercase tracking-widest">({escuela.filial})</p>}
                                </div>
                              </div>
                            </td>
                            
                            {semestres.map(sem => {
                              const modsInSem = modalidades.filter(m => m.semestre === sem);
                              return (
                                <React.Fragment key={`cells-${escuela.id}-${sem}`}>
                                  {modsInSem.map(m => (
                                    <td key={`${escuela.id}-${m.id}`} className="p-0 border-r border-slate-200 text-center">
                                      {selectedCuadro?.estado === 'Aprobado' ? (
                                        <div className="w-full h-full p-2 text-slate-700 font-medium">{vacantesMap[`${escuela.id}_${m.id}`] || ''}</div>
                                      ) : (
                                        <input 
                                          type="number" 
                                          min="0"
                                          value={vacantesMap[`${escuela.id}_${m.id}`] || ''}
                                          onChange={(e) => handleCellChange(escuela.id, m.id, e.target.value)}
                                          readOnly={isEditLocked}
                                          className={`w-full h-full p-2 text-center outline-none font-medium text-slate-700 bg-transparent ${isEditLocked ? 'cursor-not-allowed opacity-80' : 'focus:bg-blue-50 focus:ring-2 focus:ring-inset focus:ring-blue-400'}`}
                                        />
                                      )}
                                    </td>
                                  ))}
                                  <td className="p-2 border-r border-slate-200 text-center font-black bg-slate-50 text-slate-800">
                                    {getRowTotal(escuela.id, sem)}
                                  </td>
                                </React.Fragment>
                              );
                            })}
                            <td className="p-2 text-center font-black bg-slate-800 text-white">
                              {getRowTotal(escuela.id)}
                            </td>
                          </tr>
                        ))}
                        
                        {/* Area Subtotal */}
                        <tr className="bg-slate-100 border-t-2 border-slate-300">
                          <td className="p-2 font-black text-slate-800 uppercase sticky left-0 bg-slate-100 border-r border-slate-200 z-10 text-right">
                            SUBTOTAL ÁREA {area}
                          </td>
                          {semestres.map(sem => {
                              const modsInSem = modalidades.filter(m => m.semestre === sem);
                              return (
                                <React.Fragment key={`subtotal-${area}-${sem}`}>
                                  {modsInSem.map(m => (
                                    <td key={`subtotal-${area}-${m.id}`} className="p-2 border-r border-slate-200 text-center font-bold text-slate-700">
                                      {getColTotal(m.id, area)}
                                    </td>
                                  ))}
                                  <td className="p-2 border-r border-slate-200 text-center font-black text-slate-900">
                                    {getAreaTotal(area, sem)}
                                  </td>
                                </React.Fragment>
                              );
                          })}
                          <td className="p-2 text-center font-black bg-slate-700 text-white">
                            {getAreaTotal(area)}
                          </td>
                        </tr>
                      </React.Fragment>
                    ))}
                  </tbody>
                  <tfoot className="sticky bottom-0 z-20 bg-slate-800 text-white shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)]">
                    <tr>
                      <td className="p-3 font-black uppercase sticky left-0 bg-slate-800 border-r border-slate-700 z-30 text-right text-sm">
                        TOTAL GENERAL
                      </td>
                      {semestres.map(sem => {
                          const modsInSem = modalidades.filter(m => m.semestre === sem);
                          return (
                            <React.Fragment key={`grand-${sem}`}>
                              {modsInSem.map(m => (
                                <td key={`grand-${m.id}`} className="p-2 border-r border-slate-700 text-center font-bold">
                                  {getColTotal(m.id)}
                                </td>
                              ))}
                              <td className="p-2 border-r border-slate-700 text-center font-black text-amber-400">
                                {getGrandTotal(sem)}
                              </td>
                            </React.Fragment>
                          );
                      })}
                      <td className="p-3 text-center font-black text-emerald-400 text-lg">
                        {getGrandTotal()}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </>
        );

        if (isFullscreen) {
          return createPortal(
            <div className="fixed inset-0 z-[9999] bg-slate-900/80 backdrop-blur-sm p-4 md:p-8 flex flex-col animate-in fade-in duration-200">
              <div className="flex-1 overflow-hidden bg-white border border-slate-200 rounded-2xl shadow-2xl flex flex-col">
                <div className="sticky top-0 z-50 bg-white border-b border-slate-200 p-4 flex justify-between items-center shrink-0">
                  <h2 className="font-black text-slate-800 text-lg uppercase tracking-tight">Modo Edición - {selectedCuadro?.anio}</h2>
                  <button onClick={() => setIsFullscreen(false)} className="flex items-center gap-2 rounded-xl h-10 px-4 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold shadow-sm transition-all">
                    <span className="material-symbols-outlined text-[18px]">fullscreen_exit</span>
                    Minimizar
                  </button>
                </div>
                <div className="flex-1 overflow-auto relative">
                  {editorContent}
                </div>
              </div>
            </div>,
            document.body
          );
        }

        return (
          <div className="flex-1 overflow-auto mt-4 bg-white border border-slate-200 rounded-2xl shadow-sm relative">
            {editorContent}
          </div>
        );
      })()}

          {view === 'preview' && (() => {
            const previewContent = (
              <>
                {/* Filters */}
                <div className="flex flex-wrap gap-4 mb-4 shrink-0 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                <div className="flex-1 min-w-[150px]">
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Área</label>
                  <select value={filterArea} onChange={e => setFilterArea(e.target.value)} className="w-full h-10 rounded-xl border border-slate-200 px-3 text-sm font-bold text-slate-700 focus:ring-2 focus:ring-indigo-500 outline-none">
                    <option value="Todas">Todas las Áreas</option>
                    {areas.map(a => <option key={a} value={a}>{a}</option>)}
                  </select>
                </div>
                <div className="flex-1 min-w-[150px]">
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Semestre</label>
                  <select value={filterSemestre} onChange={e => setFilterSemestre(e.target.value)} className="w-full h-10 rounded-xl border border-slate-200 px-3 text-sm font-bold text-slate-700 focus:ring-2 focus:ring-indigo-500 outline-none">
                    <option value="Todos">Todos los Semestres</option>
                    {semestres.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div className="flex-1 min-w-[200px] relative">
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Modalidades</label>
                  <div className="relative">
                    <button 
                      onClick={() => setIsModalidadesDropdownOpen(!isModalidadesDropdownOpen)}
                      className="w-full h-10 rounded-xl border border-slate-200 px-3 text-sm font-bold text-slate-700 bg-white text-left flex items-center justify-between focus:ring-2 focus:ring-indigo-500 outline-none"
                    >
                      <span className="truncate">
                        {filterModalidades.length === 0 ? 'Todas las Modalidades' : `${filterModalidades.length} seleccionadas`}
                      </span>
                      <span className="material-symbols-outlined text-[18px]">expand_more</span>
                    </button>
                    {isModalidadesDropdownOpen && (
                      <>
                        <div className="fixed inset-0 z-40" onClick={() => setIsModalidadesDropdownOpen(false)}></div>
                        <div className="absolute top-full left-0 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-lg z-50 max-h-60 overflow-y-auto p-2">
                          <label className="flex items-center gap-2 p-2 hover:bg-slate-50 rounded cursor-pointer relative z-50">
                            <input 
                              type="checkbox" 
                              checked={filterModalidades.length === 0}
                              onChange={() => setFilterModalidades([])}
                              className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                            />
                            <span className="text-sm font-medium text-slate-700">Todas las Modalidades</span>
                          </label>
                          <div className="h-px bg-slate-100 my-1 relative z-50"></div>
                          {modalidades.filter(m => filterSemestre === 'Todos' || m.semestre === filterSemestre).map(m => (
                            <label key={m.id} className="flex items-center gap-2 p-2 hover:bg-slate-50 rounded cursor-pointer relative z-50">
                              <input 
                                type="checkbox" 
                                checked={filterModalidades.includes(m.id)}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setFilterModalidades([...filterModalidades, m.id]);
                                  } else {
                                    setFilterModalidades(filterModalidades.filter(id => id !== m.id));
                                  }
                                }}
                                className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                              />
                              <span className="text-sm font-medium text-slate-700 truncate" title={m.nombre}>{m.nombre}</span>
                            </label>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                </div>
                <div className="flex items-end gap-2 w-full md:w-auto">
                  <button onClick={handleExportPDF} className="flex-1 md:flex-none h-10 px-5 bg-[#7b1523] hover:bg-[#9b192d] text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-md transition-all flex items-center justify-center gap-2">
                    <span className="material-symbols-outlined text-[18px]">picture_as_pdf</span>
                    Exportar PDF
                  </button>
                  <button onClick={handleExportExcel} className="flex-1 md:flex-none h-10 px-5 bg-[#e8a134] hover:bg-[#d69020] text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-md transition-all flex items-center justify-center gap-2">
                    <span className="material-symbols-outlined text-[18px]">table</span>
                    Exportar Excel
                  </button>
                </div>
              </div>

              {/* Preview Container */}
              <div className="flex-1 overflow-auto bg-slate-100 p-4 md:p-8 rounded-2xl border border-slate-200">
                <div ref={previewRef} className="mx-auto" style={{ width: 'max-content', minWidth: '100%', fontFamily: "'Poppins', sans-serif" }}>
                  {pdfPages.map((pageAreas, pageIndex) => (
                    <div key={pageIndex} className={`bg-white p-2 shadow-sm flex items-stretch ${pageIndex > 0 ? 'page-break-row mt-8' : ''}`}>
                      {/* Vertical Header for PDF */}
                      <div className="flex flex-col items-center justify-between border-r-2 pr-4 mr-2 w-[80px] shrink-0 pt-4" style={{ borderColor: '#7b1523' }}>
                        <div className="w-16 h-16 flex items-center justify-center shrink-0">
                          <img src="https://cnqpzyanmmwspvemcfeb.supabase.co/storage/v1/object/public/logos/escudo%20oficial-02%20(2).png" alt="UNSAAC" className="h-full object-contain" crossOrigin="anonymous" />
                        </div>
                        
                        <div className="flex-1 flex flex-col items-center justify-center w-full relative overflow-visible min-h-[500px]">
                          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 -rotate-90 whitespace-nowrap flex flex-col items-center gap-1 w-[800px]">
                            <h1 className="text-[#7b1523] text-lg font-black tracking-widest uppercase m-0 leading-tight">UNIVERSIDAD NACIONAL DE SAN ANTONIO ABAD DEL CUSCO</h1>
                            <h2 className="text-[#9b192d] text-sm font-bold tracking-widest uppercase m-0 leading-tight">DIRECCIÓN DE ADMISIÓN</h2>
                            <p className="text-slate-600 text-[11px] font-medium tracking-widest uppercase m-0 leading-tight">CUADRO DE VACANTES {selectedCuadro?.anio}</p>
                          </div>
                        </div>

                        <div className="w-16 h-16 flex items-center justify-center shrink-0 mb-4">
                          <img src="https://cnqpzyanmmwspvemcfeb.supabase.co/storage/v1/object/public/logos/logo%20admision%201.png" alt="Admisión" className="h-full object-contain" crossOrigin="anonymous" />
                        </div>
                      </div>

                      {/* Table Container */}
                      <div className="flex-1 overflow-hidden pl-1">
                        <table className="w-full text-left border-collapse text-[10px]" style={{ backgroundColor: 'white' }}>
                          <thead>
                            <tr>
                              <th className="p-1 border" style={{ backgroundColor: '#7b1523', color: 'white', borderColor: '#9b192d', width: '190px', minWidth: '190px', maxWidth: '190px' }} rowSpan={2}>Escuelas Profesionales</th>
                            {filteredSemestres.map(sem => {
                              const modsInSem = filteredModalidades.filter(m => m.semestre === sem);
                              return (
                                <th key={sem} colSpan={modsInSem.length + 1} className="p-1 border text-center font-bold" style={{ backgroundColor: '#9b192d', color: 'white', borderColor: '#7b1523' }}>
                                  {sem}
                                </th>
                              );
                            })}
                            <th className="p-0 border text-center font-black" style={{ backgroundColor: '#e8a134', color: 'white', borderColor: '#d69020', width: '50px', minWidth: '50px', maxWidth: '50px' }} rowSpan={2}>
                              <div className="relative w-[50px] h-[180px] flex items-center justify-center mx-auto overflow-visible">
                                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 -rotate-90 w-[170px] text-center text-[12px] font-black leading-snug tracking-wide uppercase">
                                  Total General
                                </div>
                              </div>
                            </th>
                          </tr>
                          <tr>
                            {filteredSemestres.map(sem => {
                              const modsInSem = filteredModalidades.filter(m => m.semestre === sem);
                              return (
                                <React.Fragment key={`mods-${sem}`}>
                                  {modsInSem.map(m => (
                                    <th key={m.id} className="p-0 border text-center font-medium" style={{ backgroundColor: '#f8f9fa', color: '#7b1523', borderColor: '#e1e1e1', height: '180px', verticalAlign: 'middle', minWidth: '38px', width: '38px' }}>
                                      <div className="relative w-[38px] h-[180px] flex items-center justify-center mx-auto overflow-visible">
                                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 -rotate-90 w-[170px] text-center text-[10px] font-[600] leading-snug tracking-wide">
                                          {m.nombre}
                                        </div>
                                      </div>
                                    </th>
                                  ))}
                                  <th className="p-0 border text-center font-bold" style={{ backgroundColor: '#f1f5f9', color: '#9b192d', borderColor: '#e1e1e1', height: '180px', verticalAlign: 'middle', minWidth: '40px', width: '40px' }}>
                                    <div className="relative w-[40px] h-[180px] flex items-center justify-center mx-auto overflow-visible">
                                      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 -rotate-90 w-[170px] text-center text-[11px] font-bold leading-snug tracking-wide">
                                        Total {sem}
                                      </div>
                                    </div>
                                  </th>
                                </React.Fragment>
                              );
                            })}
                          </tr>
                        </thead>
                        <tbody>
                          {pageAreas.map(area => {
                            const escuelasInArea = filteredEscuelas.filter(e => e.area === area);
                            if (escuelasInArea.length === 0) return null;
                            
                            return (
                              <React.Fragment key={area}>
                                {/* Area Header */}
                                <tr>
                                  <td colSpan={1 + filteredModalidades.length + filteredSemestres.length + 1} className="px-2 py-1 border font-black uppercase" style={{ backgroundColor: '#f8f9fa', color: '#7b1523', borderColor: '#e1e1e1' }}>
                                    Área {area}
                                  </td>
                                </tr>
                                {/* Escuelas */}
                                {escuelasInArea.map((escuela, idx) => (
                                  <tr key={escuela.id} style={{ backgroundColor: idx % 2 === 0 ? 'white' : '#fcfcfc' }}>
                                    <td className="px-2 py-1 border font-medium text-slate-700" style={{ borderColor: '#e1e1e1' }}>{escuela.alias || escuela.nombre} {escuela.filial !== 'CUSCO' && escuela.filial !== 'Cusco' ? `(${escuela.filial})` : ''}</td>
                                    {filteredSemestres.map(sem => {
                                      const modsInSem = filteredModalidades.filter(m => m.semestre === sem);
                                      return (
                                        <React.Fragment key={`${escuela.id}-${sem}`}>
                                          {modsInSem.map(m => (
                                            <td key={`${escuela.id}-${m.id}`} className="px-2 py-1 border text-center text-slate-600" style={{ borderColor: '#e1e1e1' }}>
                                              {vacantesMap[`${escuela.id}_${m.id}`] || 0}
                                            </td>
                                          ))}
                                          <td className="px-2 py-1 border text-center font-bold" style={{ color: '#9b192d', borderColor: '#e1e1e1', backgroundColor: '#fdfdfd' }}>
                                            {getRowTotal(escuela.id, sem, filteredModalidades)}
                                          </td>
                                        </React.Fragment>
                                      );
                                    })}
                                    <td className="px-2 py-1 border text-center font-black" style={{ color: '#7b1523', borderColor: '#e1e1e1', backgroundColor: '#fffbf5' }}>
                                      {getRowTotal(escuela.id, undefined, filteredModalidades)}
                                    </td>
                                  </tr>
                                ))}
                                {/* Area Totals */}
                                <tr>
                                  <td className="px-2 py-1 border font-bold text-right" style={{ backgroundColor: '#f8f9fa', color: '#7b1523', borderColor: '#e1e1e1' }}>Total Área {area}</td>
                                  {filteredSemestres.map(sem => {
                                    const modsInSem = filteredModalidades.filter(m => m.semestre === sem);
                                    return (
                                      <React.Fragment key={`total-${area}-${sem}`}>
                                        {modsInSem.map(m => (
                                          <td key={`total-${area}-${m.id}`} className="px-2 py-1 border text-center font-bold" style={{ backgroundColor: '#f8f9fa', color: '#7b1523', borderColor: '#e1e1e1' }}>
                                            {getColTotal(m.id, area, filteredEscuelas)}
                                          </td>
                                        ))}
                                        <td className="px-2 py-1 border text-center font-black" style={{ backgroundColor: '#f1f5f9', color: '#9b192d', borderColor: '#e1e1e1' }}>
                                          {getAreaTotal(area, sem, filteredEscuelas, filteredModalidades)}
                                        </td>
                                      </React.Fragment>
                                    );
                                  })}
                                  <td className="px-2 py-1 border text-center font-black" style={{ backgroundColor: '#fff8ed', color: '#d69020', borderColor: '#e1e1e1' }}>
                                    {getAreaTotal(area, undefined, filteredEscuelas, filteredModalidades)}
                                  </td>
                                </tr>
                              </React.Fragment>
                            );
                          })}
                        </tbody>
                        {pageIndex === pdfPages.length - 1 && (
                          <tfoot>
                            <tr>
                              <td className="px-2 py-2 border font-black text-right uppercase" style={{ backgroundColor: '#7b1523', color: 'white', borderColor: '#9b192d' }}>Total General</td>
                              {filteredSemestres.map(sem => {
                                const modsInSem = filteredModalidades.filter(m => m.semestre === sem);
                                return (
                                  <React.Fragment key={`grand-${sem}`}>
                                    {modsInSem.map(m => (
                                      <td key={`grand-${m.id}`} className="px-2 py-2 border text-center font-bold" style={{ backgroundColor: '#9b192d', color: 'white', borderColor: '#7b1523' }}>
                                        {getColTotal(m.id, undefined, filteredEscuelas)}
                                      </td>
                                    ))}
                                    <td className="px-2 py-2 border text-center font-black" style={{ backgroundColor: '#7b1523', color: 'white', borderColor: '#9b192d' }}>
                                      {getGrandTotal(sem, filteredEscuelas, filteredModalidades)}
                                    </td>
                                  </React.Fragment>
                                );
                              })}
                              <td className="px-2 py-2 border text-center font-black text-lg" style={{ backgroundColor: '#e8a134', color: 'white', borderColor: '#d69020' }}>
                                {getGrandTotal(undefined, filteredEscuelas, filteredModalidades)}
                              </td>
                            </tr>
                          </tfoot>
                        )}
                      </table>
                    </div>
                  </div>
                ))}
              </div>
                
                {/* Hidden table for Excel export */}
                <table className="hidden exportable-table">
                  {/* ... Excel table content ... */}
                  <thead>
                    <tr>
                      <th>Escuelas Profesionales</th>
                      {filteredSemestres.map(sem => {
                        const modsInSem = filteredModalidades.filter(m => m.semestre === sem);
                        return (
                          <th key={sem} colSpan={modsInSem.length + 1}>{sem}</th>
                        );
                      })}
                      <th>Total General</th>
                    </tr>
                    <tr>
                      <th></th>
                      {filteredSemestres.map(sem => {
                        const modsInSem = filteredModalidades.filter(m => m.semestre === sem);
                        return (
                          <React.Fragment key={`excel-mods-${sem}`}>
                            {modsInSem.map(m => (
                              <th key={m.id}>{m.nombre}</th>
                            ))}
                            <th>Total {sem}</th>
                          </React.Fragment>
                        );
                      })}
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAreas.map(area => {
                      const escuelasInArea = filteredEscuelas.filter(e => e.area === area);
                      if (escuelasInArea.length === 0) return null;
                      
                      return (
                        <React.Fragment key={`excel-${area}`}>
                          <tr>
                            <td colSpan={1 + filteredModalidades.length + filteredSemestres.length + 1}>Área {area}</td>
                          </tr>
                          {escuelasInArea.map((escuela) => (
                            <tr key={`excel-${escuela.id}`}>
                              <td>{escuela.alias || escuela.nombre} {escuela.filial !== 'CUSCO' && escuela.filial !== 'Cusco' ? `(${escuela.filial})` : ''}</td>
                              {filteredSemestres.map(sem => {
                                const modsInSem = filteredModalidades.filter(m => m.semestre === sem);
                                return (
                                  <React.Fragment key={`excel-${escuela.id}-${sem}`}>
                                    {modsInSem.map(m => (
                                      <td key={`excel-${escuela.id}-${m.id}`}>
                                        {vacantesMap[`${escuela.id}_${m.id}`] || 0}
                                      </td>
                                    ))}
                                    <td>{getRowTotal(escuela.id, sem, filteredModalidades)}</td>
                                  </React.Fragment>
                                );
                              })}
                              <td>{getRowTotal(escuela.id, undefined, filteredModalidades)}</td>
                            </tr>
                          ))}
                          <tr>
                            <td>Total Área {area}</td>
                            {filteredSemestres.map(sem => {
                              const modsInSem = filteredModalidades.filter(m => m.semestre === sem);
                              return (
                                <React.Fragment key={`excel-total-${area}-${sem}`}>
                                  {modsInSem.map(m => (
                                    <td key={`excel-total-${area}-${m.id}`}>
                                      {getColTotal(m.id, area, filteredEscuelas)}
                                    </td>
                                  ))}
                                  <td>{getAreaTotal(area, sem, filteredEscuelas, filteredModalidades)}</td>
                                </React.Fragment>
                              );
                            })}
                            <td>{getAreaTotal(area, undefined, filteredEscuelas, filteredModalidades)}</td>
                          </tr>
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td>Total General</td>
                      {filteredSemestres.map(sem => {
                        const modsInSem = filteredModalidades.filter(m => m.semestre === sem);
                        return (
                          <React.Fragment key={`excel-grand-${sem}`}>
                            {modsInSem.map(m => (
                              <td key={`excel-grand-${m.id}`}>
                                {getColTotal(m.id, undefined, filteredEscuelas)}
                              </td>
                            ))}
                            <td>{getGrandTotal(sem, filteredEscuelas, filteredModalidades)}</td>
                          </React.Fragment>
                        );
                      })}
                      <td>{getGrandTotal(undefined, filteredEscuelas, filteredModalidades)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </>
          );

          if (isFullscreen) {
            return createPortal(
              <div className="fixed inset-0 z-[9999] bg-slate-900/80 backdrop-blur-sm p-4 md:p-8 flex flex-col animate-in fade-in duration-200">
                <div className="flex-1 overflow-hidden bg-white border border-slate-200 rounded-2xl shadow-2xl flex flex-col p-4">
                  <div className="shrink-0 bg-white border-b border-slate-200 pb-4 mb-4 flex justify-between items-center">
                    <h2 className="font-black text-slate-800 text-lg uppercase tracking-tight">Vista Previa - {selectedCuadro?.anio}</h2>
                    <button onClick={() => setIsFullscreen(false)} className="flex items-center gap-2 rounded-xl h-10 px-4 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold shadow-sm transition-all">
                      <span className="material-symbols-outlined text-[18px]">fullscreen_exit</span>
                      Minimizar
                    </button>
                  </div>
                  {previewContent}
                </div>
              </div>,
              document.body
            );
          }

          return (
            <div className="flex flex-col h-full overflow-hidden mt-4">
              {previewContent}
            </div>
          );
        })()}
        </div>
      )}

      {/* MODALS */}
      
      {/* New Cuadro Modal */}
      {isNewCuadroModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in zoom-in-95">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-8">
                <h3 className="font-black text-slate-900 uppercase text-xl tracking-tight mb-6">Nuevo Cuadro</h3>
                <div className="flex flex-col gap-4">
                    <div>
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Año del Proceso</label>
                        <input 
                            type="text" 
                            value={newAnio} 
                            onChange={e => setNewAnio(e.target.value)} 
                            className="w-full h-12 px-4 rounded-xl border-2 border-slate-100 bg-slate-50 outline-none font-bold focus:border-indigo-500 focus:bg-white transition-all mt-1" 
                            placeholder="Ej: 2026"
                            maxLength={4}
                        />
                    </div>
                    <div className="flex gap-3 mt-4">
                        <button onClick={() => setIsNewCuadroModalOpen(false)} className="flex-1 h-12 rounded-xl font-bold text-slate-500 hover:bg-slate-100 transition-all">Cancelar</button>
                        <button onClick={handleCreateCuadro} disabled={!newAnio.trim()} className="flex-1 h-12 rounded-xl font-black uppercase tracking-widest text-xs bg-indigo-600 text-white shadow-lg shadow-indigo-200 hover:bg-indigo-700 transition-all disabled:opacity-50">Crear</button>
                    </div>
                </div>
            </div>
        </div>
      )}

      {/* Escuelas CSV Modal */}
      {isEscuelasModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in zoom-in-95">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl p-8 flex flex-col max-h-[90vh]">
                <div className="flex justify-between items-center mb-6">
                  <h3 className="font-black text-slate-900 uppercase text-xl tracking-tight">Catálogo de Escuelas</h3>
                  <button onClick={() => { setIsEscuelasModalOpen(false); setCsvPreview([]); }} className="p-2 text-slate-400 hover:bg-slate-100 rounded-full transition-colors"><span className="material-symbols-outlined">close</span></button>
                </div>
                
                <div className="flex flex-col md:flex-row gap-6 flex-1 overflow-hidden">
                  {/* Left Side: Import */}
                  <div className="flex-1 flex flex-col gap-4 border-r border-slate-100 pr-6">
                    <h4 className="font-bold text-slate-700 uppercase tracking-widest text-xs">Importar Nuevas Escuelas</h4>
                    <div className="bg-blue-50 p-4 rounded-2xl border border-blue-100">
                        <p className="text-xs text-blue-800 font-bold mb-2">Formato CSV requerido (4 columnas):</p>
                        <p className="text-[10px] text-blue-700 font-mono bg-blue-100/50 p-2 rounded-lg">1. Nombre | 2. Código | 3. Área (A,B,C,D) | 4. Filial (CUSCO, SICUANI...)</p>
                    </div>

                    <div 
                      className="border-3 border-dashed border-slate-200 rounded-3xl p-8 text-center cursor-pointer hover:border-indigo-500 hover:bg-indigo-50 transition-all group shrink-0" 
                      onClick={() => csvInputRef.current?.click()}
                    >
                        <span className="material-symbols-outlined text-4xl text-slate-300 group-hover:text-indigo-500 transition-colors">upload_file</span>
                        <p className="text-sm font-black text-slate-700 mt-2 uppercase tracking-widest">{csvPreview.length > 0 ? `${csvPreview.length} escuelas detectadas` : 'Subir CSV de Escuelas'}</p>
                        <input type="file" accept=".csv" ref={csvInputRef} className="hidden" onChange={handleCsvFile}/>
                    </div>

                    {csvPreview.length > 0 && (
                      <div className="mt-2 flex-1 overflow-auto border border-slate-100 rounded-xl">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-slate-50 sticky top-0">
                            <tr>
                              <th className="p-2 font-bold text-slate-500">Nombre</th>
                              <th className="p-2 font-bold text-slate-500">Área</th>
                              <th className="p-2 font-bold text-slate-500">Filial</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {csvPreview.slice(0, 50).map((r, i) => (
                              <tr key={i}>
                                <td className="p-2 font-medium">{r.nombre}</td>
                                <td className="p-2">{r.area}</td>
                                <td className="p-2">{r.filial}</td>
                              </tr>
                            ))}
                            {csvPreview.length > 50 && <tr><td colSpan={3} className="p-2 text-center text-slate-400 italic">... y {csvPreview.length - 50} más</td></tr>}
                          </tbody>
                        </table>
                      </div>
                    )}
                    
                    <div className="mt-auto pt-4">
                      <button onClick={processEscuelasImport} disabled={csvPreview.length === 0 || isImporting} className="w-full py-3 rounded-xl font-black uppercase tracking-widest text-xs bg-indigo-600 text-white shadow-lg shadow-indigo-200 hover:bg-indigo-700 transition-all disabled:opacity-50">
                        {isImporting ? 'Importando...' : 'Guardar Importación'}
                      </button>
                    </div>
                  </div>

                  {/* Right Side: Existing */}
                  <div className="flex-1 flex flex-col gap-4 overflow-hidden">
                    <h4 className="font-bold text-slate-700 uppercase tracking-widest text-xs">Escuelas Registradas ({allEscuelas.length})</h4>
                    <div className="flex-1 overflow-auto border border-slate-100 rounded-xl">
                      <table className="w-full text-left text-[10px]">
                        <thead className="bg-slate-50 sticky top-0 z-10">
                          <tr>
                            <th className="p-2 font-bold text-slate-500 uppercase">Código</th>
                            <th className="p-2 font-bold text-slate-500 uppercase">Nombre</th>
                            <th className="p-2 font-bold text-slate-500 uppercase text-center">Área</th>
                            <th className="p-2 font-bold text-slate-500 uppercase text-center">Acción</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {allEscuelas.map(esc => (
                            <tr key={esc.id} className={`hover:bg-slate-50 ${esc.is_hidden ? 'opacity-50' : ''}`}>
                              <td className="p-2 font-mono text-slate-500">{esc.codigo_carrera}</td>
                              <td className="p-2 font-bold text-slate-700">
                                {esc.nombre}
                                {esc.filial !== 'CUSCO' && <span className="ml-1 text-slate-400">({esc.filial})</span>}
                                {esc.is_hidden && <span className="ml-2 text-[9px] bg-slate-200 text-slate-500 px-1.5 py-0.5 rounded-md uppercase tracking-widest">Oculto</span>}
                              </td>
                              <td className="p-2 text-center font-black text-slate-500">{esc.area}</td>
                              <td className="p-2 text-center">
                                <button onClick={() => handleToggleHideEscuela(esc)} className={`p-1 rounded transition-colors ${esc.is_hidden ? 'text-slate-400 hover:text-slate-600 hover:bg-slate-100' : 'text-emerald-500 hover:text-emerald-700 hover:bg-emerald-50'}`} title={esc.is_hidden ? "Mostrar en cuadros" : "Ocultar de cuadros"}>
                                  <span className="material-symbols-outlined text-[16px]">{esc.is_hidden ? 'visibility_off' : 'visibility'}</span>
                                </button>
                              </td>
                            </tr>
                          ))}
                          {allEscuelas.length === 0 && (
                            <tr>
                              <td colSpan={4} className="p-8 text-center text-slate-400 italic font-bold uppercase tracking-widest">No hay escuelas registradas</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
            </div>
        </div>
      )}

      {/* Add/Edit Modalidad Modal */}
      {isModalidadModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in zoom-in-95">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-8">
                <h3 className="font-black text-slate-900 uppercase text-xl tracking-tight mb-6">{editingModalityId ? 'Editar Modalidad' : 'Agregar Modalidad'}</h3>
                <div className="flex flex-col gap-4">
                    <div>
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Semestre / Agrupación</label>
                        <input 
                            type="text" 
                            value={modForm.semestre} 
                            onChange={e => setModForm({...modForm, semestre: e.target.value.toUpperCase()})} 
                            className="w-full h-12 px-4 rounded-xl border-2 border-slate-100 bg-slate-50 outline-none font-bold focus:border-indigo-500 focus:bg-white transition-all mt-1" 
                            placeholder="Ej: 2026-I"
                        />
                    </div>
                    <div>
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Nombre de la Modalidad</label>
                        <input 
                            type="text" 
                            value={modForm.nombre} 
                            onChange={e => setModForm({...modForm, nombre: e.target.value.toUpperCase()})} 
                            className="w-full h-12 px-4 rounded-xl border-2 border-slate-100 bg-slate-50 outline-none font-bold focus:border-indigo-500 focus:bg-white transition-all mt-1" 
                            placeholder="Ej: CEPRU ORDINARIO"
                        />
                    </div>
                    <div className="flex gap-4">
                      <div className="flex-1">
                          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Peso (%)</label>
                          <input 
                              type="text" 
                              value={modForm.peso_porcentaje} 
                              onChange={e => setModForm({...modForm, peso_porcentaje: e.target.value})} 
                              className="w-full h-12 px-4 rounded-xl border-2 border-slate-100 bg-slate-50 outline-none font-bold focus:border-indigo-500 focus:bg-white transition-all mt-1" 
                              placeholder="Ej: 100%"
                          />
                      </div>
                      <div className="w-24">
                          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Orden</label>
                          <input 
                              type="number" 
                              value={modForm.orden} 
                              onChange={e => setModForm({...modForm, orden: parseInt(e.target.value) || 0})} 
                              className="w-full h-12 px-4 rounded-xl border-2 border-slate-100 bg-slate-50 outline-none font-bold focus:border-indigo-500 focus:bg-white transition-all mt-1 text-center" 
                          />
                      </div>
                    </div>
                    <div className="flex justify-between gap-3 mt-4">
                        {editingModalityId ? (
                          <button onClick={handleDeleteModalidad} className="h-12 px-4 rounded-xl font-bold text-red-500 hover:bg-red-50 transition-all flex items-center justify-center gap-2">
                            <span className="material-symbols-outlined text-[18px]">delete</span>
                          </button>
                        ) : (
                          <div></div>
                        )}
                        <div className="flex gap-3 flex-1">
                          <button onClick={() => { setIsModalidadModalOpen(false); setEditingModalityId(null); }} className="flex-1 h-12 rounded-xl font-bold text-slate-500 hover:bg-slate-100 transition-all">Cancelar</button>
                          <button onClick={handleSaveModalidad} disabled={!modForm.nombre.trim() || !modForm.semestre.trim()} className="flex-1 h-12 rounded-xl font-black uppercase tracking-widest text-xs bg-indigo-600 text-white shadow-lg shadow-indigo-200 hover:bg-indigo-700 transition-all disabled:opacity-50">
                            {editingModalityId ? 'Guardar' : 'Agregar'}
                          </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
      )}

      {/* Delete Modalidad Modal */}
      {isDeleteModalidadModalOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in zoom-in-95">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-8">
            <div className="size-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="material-symbols-outlined text-3xl">warning</span>
            </div>
            <h3 className="font-black text-slate-900 uppercase text-xl tracking-tight text-center mb-2">Eliminar Modalidad</h3>
            
            <p className="text-sm text-slate-600 text-center mb-6 font-medium">
              ¿Estás seguro de eliminar esta modalidad? Se perderán las vacantes registradas en ella.
            </p>
            
            <div className="flex gap-3 mt-4">
              <button onClick={() => setIsDeleteModalidadModalOpen(false)} className="flex-1 h-12 rounded-xl font-bold text-slate-500 hover:bg-slate-100 transition-all">Cancelar</button>
              <button onClick={confirmDeleteModalidad} className="flex-1 h-12 rounded-xl font-black uppercase tracking-widest text-xs bg-red-600 text-white shadow-lg shadow-red-200 hover:bg-red-700 transition-all">
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Close Cuadro Modal */}
      {isCloseModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in zoom-in-95">
              <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-8">
                  <div className="size-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4">
                      <span className="material-symbols-outlined text-3xl">verified</span>
                  </div>
                  <h3 className="font-black text-slate-900 uppercase text-xl tracking-tight text-center mb-2">Aprobar Cuadro</h3>
                  <p className="text-xs text-slate-500 text-center mb-6 font-medium">Al aprobar, el cuadro quedará bloqueado y no se podrán modificar las vacantes.</p>
                  
                  <div className="flex flex-col gap-4">
                      <div>
                          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">N° de Resolución</label>
                          <input 
                              type="text" 
                              value={closeForm.resolution_number} 
                              onChange={e => setCloseForm({...closeForm, resolution_number: e.target.value.toUpperCase()})} 
                              className="w-full h-12 px-4 rounded-xl border-2 border-slate-100 bg-slate-50 outline-none font-bold focus:border-emerald-500 focus:bg-white transition-all mt-1" 
                              placeholder="Ej: CU-001-2026"
                          />
                      </div>
                      <div>
                          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Fecha de Resolución</label>
                          <input 
                              type="date" 
                              value={closeForm.resolution_date} 
                              onChange={e => setCloseForm({...closeForm, resolution_date: e.target.value})} 
                              className="w-full h-12 px-4 rounded-xl border-2 border-slate-100 bg-slate-50 outline-none font-bold focus:border-emerald-500 focus:bg-white transition-all mt-1" 
                          />
                      </div>
                      <div>
                          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">PDF de Resolución</label>
                          <input 
                              type="file" 
                              accept=".pdf"
                              onChange={e => setResolutionFile(e.target.files?.[0] || null)} 
                              className="w-full p-3 rounded-xl border-2 border-slate-100 bg-slate-50 outline-none text-xs font-bold mt-1 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-black file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100" 
                          />
                      </div>
                      <div className="flex gap-3 mt-4">
                          <button onClick={() => setIsCloseModalOpen(false)} className="flex-1 h-12 rounded-xl font-bold text-slate-500 hover:bg-slate-100 transition-all">Cancelar</button>
                          <button onClick={handleCloseCuadro} disabled={!closeForm.resolution_number || !resolutionFile || isImporting} className="flex-1 h-12 rounded-xl font-black uppercase tracking-widest text-xs bg-emerald-600 text-white shadow-lg shadow-emerald-200 hover:bg-emerald-700 transition-all disabled:opacity-50">
                              {isImporting ? 'Guardando...' : 'Aprobar y Cerrar'}
                          </button>
                      </div>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};
