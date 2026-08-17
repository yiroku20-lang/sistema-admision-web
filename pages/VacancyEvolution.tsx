import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabaseClient';
import { User, CVEscuela, CVModalidad } from '../types';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface VacancyEvolutionProps {
  user: User;
  notify?: (msg: string, type?: 'success' | 'error' | 'warning' | 'info') => void;
}

interface SequenceRule {
  id: string;
  proceso_general: string;
  modalidad_origen_id: string;
  modalidad_destino_id: string;
  orden_secuencial: number;
  transfer_mode: 'TOTAL' | 'CUSCO_ONLY';
}

interface TransferLog {
  id: string;
  proceso_general: string;
  modalidad_origen_id: string;
  modalidad_destino_id: string;
  escuela_id: string;
  cantidad_transferida: number;
  fecha_transferencia: string;
  usuario_responsable: string;
}

// Helper para ordenar las modalidades de forma topológica según las reglas de secuencia
const getOrderedModalidades = (mods: CVModalidad[], rules: SequenceRule[]): CVModalidad[] => {
  const adj: Record<string, string[]> = {};
  const inDegree: Record<string, number> = {};
  
  mods.forEach(m => {
    adj[m.id] = [];
    inDegree[m.id] = 0;
  });
  
  rules.forEach(r => {
    if (adj[r.modalidad_origen_id] && adj[r.modalidad_destino_id]) {
      adj[r.modalidad_origen_id].push(r.modalidad_destino_id);
      inDegree[r.modalidad_destino_id] = (inDegree[r.modalidad_destino_id] || 0) + 1;
    }
  });
  
  const queue: string[] = [];
  mods.forEach(m => {
    if (inDegree[m.id] === 0) {
      queue.push(m.id);
    }
  });
  
  // Mantener el orden relativo por el campo "orden" original
  queue.sort((a, b) => {
    const modA = mods.find(m => m.id === a);
    const modB = mods.find(m => m.id === b);
    return (modA?.orden || 0) - (modB?.orden || 0);
  });
  
  const orderedIds: string[] = [];
  while (queue.length > 0) {
    const u = queue.shift()!;
    orderedIds.push(u);
    
    adj[u].forEach(v => {
      inDegree[v]--;
      if (inDegree[v] === 0) {
        queue.push(v);
      }
    });
  }
  
  const orderedMods = orderedIds.map(id => mods.find(m => m.id === id)!).filter(Boolean);
  
  // Agregar cualquier modalidad restante que no forme parte de las reglas
  mods.forEach(m => {
    if (!orderedMods.some(om => om.id === m.id)) {
      orderedMods.push(m);
    }
  });
  
  return orderedMods;
};

// Generar reglas por defecto en memoria para simulación si la tabla no existe en BD
const getDefaultSequenceRules = (mods: CVModalidad[], semestre: string): SequenceRule[] => {
  const rules: SequenceRule[] = [];
  const sortedMods = [...mods].sort((a, b) => a.orden - b.orden);
  const cepru = sortedMods.find(m => m.nombre.toUpperCase().includes('CEPRU'));
  const ordinario = sortedMods.find(m => 
    m.nombre.toUpperCase().includes('ORDINARIO') && 
    !m.nombre.toUpperCase().includes('CEPRU') && 
    !m.nombre.toUpperCase().includes('FILIAL')
  );
  const filiales = sortedMods.find(m => m.nombre.toUpperCase().includes('FILIAL'));
  if (cepru && ordinario) {
    rules.push({
      id: 'default-r1',
      proceso_general: semestre,
      modalidad_origen_id: cepru.id,
      modalidad_destino_id: ordinario.id,
      orden_secuencial: 1,
      transfer_mode: 'CUSCO_ONLY'
    });
  }
  if (ordinario && filiales) {
    rules.push({
      id: 'default-r2',
      proceso_general: semestre,
      modalidad_origen_id: ordinario.id,
      modalidad_destino_id: filiales.id,
      orden_secuencial: 2,
      transfer_mode: 'TOTAL'
    });
  }
  // Si no se encuentran por nombre, encadenarlas en orden por defecto
  if (rules.length === 0 && sortedMods.length > 1) {
    for (let i = 0; i < sortedMods.length - 1; i++) {
      rules.push({
        id: `default-chain-${i}`,
        proceso_general: semestre,
        modalidad_origen_id: sortedMods[i].id,
        modalidad_destino_id: sortedMods[i+1].id,
        orden_secuencial: i + 1,
        transfer_mode: 'TOTAL'
      });
    }
  }
  return rules;
};

export const VacancyEvolution: React.FC<VacancyEvolutionProps> = ({ user, notify }) => {
  const [isSimulated, setIsSimulated] = useState<boolean>(true);
  // States generales
  const [selectedProcessCard, setSelectedProcessCard] = useState<string | null>(null);
  const [selectedSemestre, setSelectedSemestre] = useState<string>('2026-II');
  const [semestres, setSemestres] = useState<string[]>(['2026-II']);
  const [modalidades, setModalidades] = useState<CVModalidad[]>([]);
  const [allRawModalidades, setAllRawModalidades] = useState<CVModalidad[]>([]);
  const [escuelas, setEscuelas] = useState<CVEscuela[]>([]);
  const [sequenceRules, setSequenceRules] = useState<SequenceRule[]>([]);
  const [transferLogs, setTransferLogs] = useState<TransferLog[]>([]);

  // States de datos de la base de datos (baselines de sólo lectura)
  const [dbEscuelas, setDbEscuelas] = useState<CVEscuela[]>([]);
  const [dbModalidades, setDbModalidades] = useState<CVModalidad[]>([]);
  const [dbBaseVacancies, setDbBaseVacancies] = useState<Record<string, number>>({});
  const [dbAdmittedCount, setDbAdmittedCount] = useState<Record<string, number>>({});
  const [dbAllAdmittedCount, setDbAllAdmittedCount] = useState<Record<string, Record<string, number>>>({});
  const [dbAllBaseVacancies, setDbAllBaseVacancies] = useState<Record<string, Record<string, number>>>({});
  const [processSearchQuery, setProcessSearchQuery] = useState<string>('');
  const [dbSequenceRules, setDbSequenceRules] = useState<SequenceRule[]>([]);
  const [dbTransferLogs, setDbTransferLogs] = useState<TransferLog[]>([]);

  // Vacantes base, Adjudicadas (Ingresantes) e Heredadas activas en la interfaz
  const [baseVacancies, setBaseVacancies] = useState<Record<string, number>>({}); 
  const [admittedCount, setAdmittedCount] = useState<Record<string, number>>({}); 

  // UI state
  const [filterArea, setFilterArea] = useState<string>('Todas');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [showConfigModal, setShowConfigModal] = useState<boolean>(false);

  // States de configuración de secuencia
  const [newRuleOrigin, setNewRuleOrigin] = useState<string>('');
  const [newRuleDest, setNewRuleDest] = useState<string>('');
  const [newRuleMode, setNewRuleMode] = useState<'TOTAL' | 'CUSCO_ONLY'>('TOTAL');

  // Carga unificada de datos reales desde Supabase
  const loadAllData = async () => {
    setIsLoading(true);
    try {
      // 1. Obtener modalidades
      const { data: modData, error: modErr } = await supabase
        .from('cv_modalidades')
        .select('*');
      
      if (modErr) throw modErr;
      const rawMods = modData || [];
      setAllRawModalidades(rawMods);
      const semestresDisponibles = Array.from(new Set(rawMods.map(m => m.semestre))).filter(Boolean).sort().reverse();
      setSemestres(semestresDisponibles.length > 0 ? semestresDisponibles : ['2026-II']);
      
      const filteredMods = rawMods
        .filter(m => {
          if (!m) return false;
          if (m.semestre === selectedSemestre) return true;
          if (m.nombre && selectedSemestre && m.nombre.toLowerCase().includes(selectedSemestre.toLowerCase())) return true;
          return false;
        })
        .sort((a, b) => a.orden - b.orden);
      setDbModalidades(filteredMods);

      // 2. Obtener escuelas reales
      const { data: escData, error: escErr } = await supabase
        .from('cv_escuelas')
        .select('*')
        .order('area', { ascending: true })
        .order('nombre', { ascending: true });
      
      if (escErr) throw escErr;
      setDbEscuelas(escData || []);

      if (filteredMods.length > 0) {
        const modIds = filteredMods.map(m => m.id);
        
        // 3. Obtener vacantes base reales
        const { data: vacData, error: vacErr } = await supabase
          .from('cv_vacantes')
          .select('*')
          .in('modalidad_id', modIds);
        
        const bv: Record<string, number> = {};
        if (!vacErr && vacData) {
          vacData.forEach(v => {
            bv[`${v.escuela_id}_${v.modalidad_id}`] = v.cantidad;
          });
        }
        setDbBaseVacancies(bv);

        // 4. Obtener reglas de secuencia de la BD (con try-catch para tolerancia a errores)
        let rules: SequenceRule[] = [];
        try {
          const { data: ruleData, error: ruleErr } = await supabase
            .from('secuencia_procesos')
            .select('*')
            .eq('proceso_general', selectedSemestre)
            .order('orden_secuencial', { ascending: true });
          
          if (!ruleErr && ruleData && ruleData.length > 0) {
            rules = ruleData;
          } else {
            rules = getDefaultSequenceRules(filteredMods, selectedSemestre);
          }
        } catch (e) {
          console.warn('La tabla secuencia_procesos no existe aún, usando reglas en memoria:', e);
          rules = getDefaultSequenceRules(filteredMods, selectedSemestre);
        }
        setDbSequenceRules(rules);

        // 5. Obtener bitácora de transferencias de la BD (con try-catch)
        let logs: TransferLog[] = [];
        try {
          const { data: logData, error: logErr } = await supabase
            .from('transferencias_vacantes')
            .select('*')
            .eq('proceso_general', selectedSemestre);
          
          if (!logErr && logData) {
            logs = logData;
          }
        } catch (e) {
          console.warn('La tabla transferencias_vacantes no existe aún:', e);
        }
        setDbTransferLogs(logs);

        // 6. Obtener ingresantes reales desde participantes
        const { data: partData, error: partErr } = await supabase
          .from('participantes')
          .select('CARRERA, codigo_carrera, MODALIDAD, SEMESTRE')
          .eq('SEMESTRE', selectedSemestre);
        const adm: Record<string, number> = {};
        if (!partErr && partData) {
          partData.forEach(p => {
            const esc = (escData || []).find(e => e.nombre === p.CARRERA || e.codigo_carrera === p.codigo_carrera);
            const mod = filteredMods.find(m => m.nombre === p.MODALIDAD);
            
            if (esc && mod) {
              const key = `${esc.id}_${mod.id}`;
              adm[key] = (adm[key] || 0) + 1;
            }
          });
        }
        setDbAdmittedCount(adm);
      } else {
        setDbBaseVacancies({});
        setDbAdmittedCount({});
        setDbSequenceRules([]);
        setDbTransferLogs([]);
      }
    } catch (e: any) {
      console.error(e);
      notify?.('Error al cargar datos reales: ' + e.message, 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadAllData();
  }, [selectedSemestre]);

  // Sincronizar estados locales de UI basados en el modo (Simulación vs Producción)
  useEffect(() => {
    if (dbEscuelas.length === 0) return;
    setEscuelas(dbEscuelas);
    
    // Ordenar modalidades topológicamente
    const ordered = getOrderedModalidades(dbModalidades, dbSequenceRules);
    setModalidades(ordered);
    setBaseVacancies(dbBaseVacancies);
    setAdmittedCount(dbAdmittedCount);
    setSequenceRules(dbSequenceRules);
    if (isSimulated) {
      setTransferLogs([]); // Empezar con bitácora de transferencias vacía para simular
    } else {
      setTransferLogs(dbTransferLogs);
    }
  }, [isSimulated, dbEscuelas, dbModalidades, dbBaseVacancies, dbAdmittedCount, dbSequenceRules, dbTransferLogs]);

  // Modificar valores en Simulación directamente en la tabla
  const handleSimulatedCellChange = (escuelaId: string, modalidadId: string, type: 'base' | 'admitted', valStr: string) => {
    if (!isSimulated) return;
    const value = Math.max(0, parseInt(valStr, 10) || 0);
    if (type === 'base') {
      setBaseVacancies(prev => ({ ...prev, [`${escuelaId}_${modalidadId}`]: value }));
    } else {
      setAdmittedCount(prev => ({ ...prev, [`${escuelaId}_${modalidadId}`]: value }));
    }
  };

  // Cálculo de heredados y sobrantes para la gran tabla cascada
  const calculatedData = useMemo(() => {
    const res: Record<string, { base: number; inherited: number; total: number; admitted: number; leftover: number }[]> = {};
    
    escuelas.forEach(esc => {
      res[esc.id] = [];
      let pending_remanentes = 0;
      
      modalidades.forEach((mod, idx) => {
        // Encontrar regla que inyecta a esta modalidad
        const incomingRule = sequenceRules.find(r => r.modalidad_destino_id === mod.id);
        
        let inherited = 0;
        
        if (incomingRule) {
          const originModId = incomingRule.modalidad_origen_id;
          const originIdx = modalidades.findIndex(m => m.id === originModId);
          
          if (originIdx !== -1 && res[esc.id][originIdx]) {
            const originLeftover = res[esc.id][originIdx].leftover;
            
            // La transferencia se aplica si existe el log correspondiente
            const isApplied = transferLogs.some(log => log.modalidad_origen_id === originModId && log.modalidad_destino_id === mod.id);
            
            if (isApplied) {
              if (incomingRule.transfer_mode === 'CUSCO_ONLY' && esc.filial !== 'CUSCO') {
                // Sicuani/Filial no hereda en Ordinario, pero sus sobrantes quedan pendientes
                pending_remanentes += originLeftover;
              } else {
                // Hereda el sobrante del origen + los pendientes acumulados
                inherited = originLeftover + pending_remanentes;
                pending_remanentes = 0;
              }
            }
          }
        }
        const base = baseVacancies[`${esc.id}_${mod.id}`] || 0;
        const total = base + inherited;
        const admitted = admittedCount[`${esc.id}_${mod.id}`] || 0;
        const leftover = Math.max(0, total - admitted);
        res[esc.id].push({
          base,
          inherited,
          total,
          admitted,
          leftover
        });
      });
    });
    return res;
  }, [escuelas, modalidades, baseVacancies, admittedCount, sequenceRules, transferLogs]);

  // Ejecución de transferencia
  const executeTransfer = async (rule: SequenceRule) => {
    const originModId = rule.modalidad_origen_id;
    const destModId = rule.modalidad_destino_id;
    const originMod = modalidades.find(m => m.id === originModId);
    const destMod = modalidades.find(m => m.id === destModId);
    if (!originMod || !destMod) return;
    const logsToAdd: any[] = [];
    const dbUpdates: any[] = [];
    const originIdx = modalidades.findIndex(m => m.id === originModId);
    escuelas.forEach(esc => {
      let pending_remanentes = 0;
      for (let i = 0; i <= originIdx; i++) {
        const m = modalidades[i];
        const incRule = sequenceRules.find(r => r.modalidad_destino_id === m.id);
        if (incRule) {
          const origIdx = modalidades.findIndex(x => x.id === incRule.modalidad_origen_id);
          const origLeftover = calculatedData[esc.id]?.[origIdx]?.leftover || 0;
          const isRuleApplied = transferLogs.some(log => log.modalidad_origen_id === incRule.modalidad_origen_id && log.modalidad_destino_id === m.id);
          if (isRuleApplied) {
            if (incRule.transfer_mode === 'CUSCO_ONLY' && esc.filial !== 'CUSCO') {
              pending_remanentes += origLeftover;
            } else {
              pending_remanentes = 0;
            }
          }
        }
      }
      const originLeftover = calculatedData[esc.id]?.[originIdx]?.leftover || 0;
      let amountToTransfer = 0;
      if (rule.transfer_mode === 'CUSCO_ONLY' && esc.filial !== 'CUSCO') {
        amountToTransfer = 0;
      } else {
        amountToTransfer = originLeftover + pending_remanentes;
      }
      if (amountToTransfer > 0) {
        if (isSimulated) {
          logsToAdd.push({
            id: `log-${Date.now()}-${esc.id}`,
            proceso_general: selectedSemestre,
            modalidad_origen_id: originModId,
            modalidad_destino_id: destModId,
            escuela_id: esc.id,
            cantidad_transferida: amountToTransfer,
            fecha_transferencia: new Date().toISOString(),
            usuario_responsable: user.name
          });
        } else {
          logsToAdd.push({
            proceso_general: selectedSemestre,
            modalidad_origen_id: originModId,
            modalidad_destino_id: destModId,
            escuela_id: esc.id,
            cantidad_transferida: amountToTransfer,
            usuario_responsable: user.name
          });
          const baseDest = baseVacancies[`${esc.id}_${destModId}`] || 0;
          const totalDest = baseDest + amountToTransfer;
          dbUpdates.push({
            escuela: esc.nombre,
            area: esc.area,
            vacantes_totales: totalDest,
            vacantes_disponibles: totalDest,
            vacantes_transferidas: amountToTransfer,
            modalidad: destMod.nombre
          });
        }
      }
    });
    if (isSimulated) {
      setTransferLogs(prev => [...prev, ...logsToAdd]);
      notify?.('Traspaso local simulado correctamente.', 'success');
    } else {
      setIsLoading(true);
      try {
        if (logsToAdd.length > 0) {
          const { error: logErr } = await supabase.from('transferencias_vacantes').insert(logsToAdd);
          if (logErr) throw logErr;
        }
        if (dbUpdates.length > 0) {
          await supabase.from('adjudicacion_vacantes').delete().eq('modalidad', destMod.nombre);
          const { error: updErr } = await supabase.from('adjudicacion_vacantes').insert(dbUpdates);
          if (updErr) throw updErr;
        }
        notify?.('Traspaso oficial registrado exitosamente en la base de datos.', 'success');
        loadAllData();
      } catch (e: any) {
        notify?.('Error al transferir: ' + e.message, 'error');
      } finally {
        setIsLoading(false);
      }
    }
  };

  const handleApplyTransferClick = (rule: SequenceRule) => {
    const origin = modalidades.find(m => m.id === rule.modalidad_origen_id)?.nombre;
    const dest = modalidades.find(m => m.id === rule.modalidad_destino_id)?.nombre;
    if (window.confirm(`¿Confirmar la transferencia oficial de vacantes remanentes?\n\nOrigen: ${origin}\nDestino: ${dest}\nFiltro: ${rule.transfer_mode === 'CUSCO_ONLY' ? 'Solo Sede Cusco' : 'Todas las sedes'}`)) {
      executeTransfer(rule);
    }
  };

  // CRUD reglas de secuencia
  const handleAddRule = async () => {
    if (!newRuleOrigin || !newRuleDest || newRuleOrigin === newRuleDest) {
      notify?.('Seleccione exámenes diferentes.', 'warning');
      return;
    }
    const payload = {
      proceso_general: selectedSemestre,
      modalidad_origen_id: newRuleOrigin,
      modalidad_destino_id: newRuleDest,
      orden_secuencial: sequenceRules.length + 1,
      transfer_mode: newRuleMode
    };
    if (isSimulated) {
      setSequenceRules(prev => [...prev, { id: `rule-${Date.now()}`, ...payload }]);
      notify?.('Regla agregada localmente.', 'success');
    } else {
      setIsLoading(true);
      try {
        const { error } = await supabase.from('secuencia_procesos').insert([payload]);
        if (error) throw error;
        notify?.('Regla guardada en la base de datos.', 'success');
        loadAllData();
      } catch (e: any) {
        notify?.('Error: ' + e.message, 'error');
      } finally {
        setIsLoading(false);
      }
    }
    setNewRuleOrigin('');
    setNewRuleDest('');
  };

  const handleDeleteRule = async (id: string) => {
    if (isSimulated) {
      setSequenceRules(prev => prev.filter(r => r.id !== id));
      notify?.('Regla eliminada localmente.', 'info');
    } else {
      setIsLoading(true);
      try {
        const { error } = await supabase.from('secuencia_procesos').delete().eq('id', id);
        if (error) throw error;
        notify?.('Regla eliminada de la base de datos.', 'info');
        loadAllData();
      } catch (e: any) {
        notify?.('Error: ' + e.message, 'error');
      } finally {
        setIsLoading(false);
      }
    }
  };

  const resetSimulation = () => {
    if (dbEscuelas.length > 0) {
      setBaseVacancies(dbBaseVacancies);
      setAdmittedCount(dbAdmittedCount);
      setSequenceRules(dbSequenceRules);
      setTransferLogs([]);
      notify?.('Simulación reiniciada a los valores de la base de datos.', 'info');
    }
  };

  // Filtrado de carreras para la gran tabla cascada
  const filteredEscuelasList = useMemo(() => {
    return escuelas.filter(esc => {
      const matchArea = filterArea === 'Todas' || esc.area === filterArea;
      const matchQuery = searchQuery.trim() === '' || 
        esc.nombre.toLowerCase().includes(searchQuery.toLowerCase()) ||
        esc.codigo_carrera.toLowerCase().includes(searchQuery.toLowerCase()) ||
        esc.filial.toLowerCase().includes(searchQuery.toLowerCase());
      return matchArea && matchQuery;
    });
  }, [escuelas, filterArea, searchQuery]);

  // Modalidades filtradas para mostrar solo las seleccionadas en la secuencia de traspasos
  const displayedModalidades = useMemo(() => {
    if (sequenceRules && sequenceRules.length > 0) {
      const activeIds = new Set<string>();
      sequenceRules.forEach(r => {
        if (r.modalidad_origen_id) activeIds.add(r.modalidad_origen_id);
        if (r.modalidad_destino_id) activeIds.add(r.modalidad_destino_id);
      });
      const filtered = modalidades.filter(m => activeIds.has(m.id));
      if (filtered.length > 0) return filtered;
    }
    return modalidades;
  }, [modalidades, sequenceRules]);

  // Exportar Excel de la cascada
  const handleExportExcelCascada = () => {
    if (filteredEscuelasList.length === 0 || displayedModalidades.length === 0) return;
    const dataRows = filteredEscuelasList.map(esc => {
      const row: any = {
        'Código': esc.codigo_carrera,
        'Escuela Profesional': esc.nombre,
        'Área': esc.area,
        'Sede/Filial': esc.filial
      };
      displayedModalidades.forEach((mod) => {
        const origIdx = modalidades.findIndex(m => m.id === mod.id);
        const calc = calculatedData[esc.id]?.[origIdx];
        if (calc) {
          row[`${mod.nombre} (Base)`] = calc.base;
          const incoming = sequenceRules.some(r => r.modalidad_destino_id === mod.id);
          if (incoming) {
            row[`${mod.nombre} (Heredadas)`] = calc.inherited;
            row[`${mod.nombre} (Total)`] = calc.total;
          }
          row[`${mod.nombre} (Ingresantes)`] = calc.admitted;
          row[`${mod.nombre} (Sobrantes)`] = calc.leftover;
        }
      });
      return row;
    });
    const worksheet = XLSX.utils.json_to_sheet(dataRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Cascada de Vacantes");
    XLSX.writeFile(workbook, `Cascada_Vacantes_Evolucion_${selectedSemestre}.xlsx`);
    notify?.('Archivo Excel exportado.', 'success');
  };

  // Exportar PDF de la cascada con Colores Institucionales
  const handleExportPDFCascada = () => {
    if (filteredEscuelasList.length === 0 || displayedModalidades.length === 0) return;
    const doc = new jsPDF('l', 'mm', 'a4');
    const pageWidth = doc.internal.pageSize.getWidth();
    
    doc.setFillColor(16, 44, 87); // UNSAAC Navy Blue
    doc.rect(0, 0, pageWidth, 35, "F");
    doc.setFillColor(212, 175, 55); // UNSAAC Gold divider
    doc.rect(0, 35, pageWidth, 2, "F");
    
    doc.setTextColor(255, 255, 255);
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(14);
    doc.text("UNIVERSIDAD NACIONAL DE SAN ANTONIO ABAD DEL CUSCO", pageWidth / 2, 12, { align: "center" });
    
    doc.setFontSize(11);
    doc.setTextColor(212, 175, 55); // UNSAAC Gold
    doc.text("DIRECCIÓN DE ADMISIÓN • REPORTE UNIFICADO DE CASCADA DE VACANTES", pageWidth / 2, 20, { align: "center" });
    doc.setFontSize(9);
    doc.setTextColor(255, 255, 255);
    doc.text(`PROCESO GENERAL: ${selectedSemestre}`, pageWidth / 2, 28, { align: "center" });

    // Armar headers
    const headRow1: any[] = [
      { content: 'ESCUELA PROFESIONAL', rowSpan: 2, styles: { halign: 'left', valign: 'middle' } },
      { content: 'SEDE', rowSpan: 2, styles: { halign: 'center', valign: 'middle' } }
    ];
    const headRow2: any[] = [];
    displayedModalidades.forEach((mod) => {
      const incoming = sequenceRules.some(r => r.modalidad_destino_id === mod.id);
      headRow1.push({ 
        content: mod.nombre.toUpperCase(), 
        colSpan: incoming ? 5 : 3, 
        styles: { halign: 'center', fontStyle: 'bold' } 
      });
      headRow2.push({ content: 'BASE', styles: { halign: 'center' } });
      if (incoming) {
        headRow2.push({ content: 'HERED', styles: { halign: 'center' } });
        headRow2.push({ content: 'TOTAL', styles: { halign: 'center' } });
      }
      headRow2.push({ content: 'INGR', styles: { halign: 'center' } });
      headRow2.push({ content: 'SOBR', styles: { halign: 'center' } });
    });

    const bodyRows = filteredEscuelasList.map(esc => {
      const row: any[] = [
        esc.nombre,
        esc.filial
      ];
      displayedModalidades.forEach((mod) => {
        const origIdx = modalidades.findIndex(m => m.id === mod.id);
        const calc = calculatedData[esc.id]?.[origIdx];
        const incoming = sequenceRules.some(r => r.modalidad_destino_id === mod.id);
        
        if (calc) {
          row.push(calc.base.toString());
          if (incoming) {
            row.push(calc.inherited > 0 ? `+${calc.inherited}` : '0');
            row.push(calc.total.toString());
          }
          row.push(calc.admitted.toString());
          row.push(calc.leftover.toString());
        } else {
          row.push('0');
          if (incoming) {
            row.push('0', '0');
          }
          row.push('0', '0');
        }
      });
      return row;
    });

    autoTable(doc, {
      startY: 42,
      head: [headRow1, headRow2],
      body: bodyRows,
      theme: "grid",
      headStyles: { fillColor: [16, 44, 87], textColor: [255, 255, 255], fontStyle: "bold", fontSize: 7 },
      styles: { fontSize: 7, cellPadding: 2 }
    });

    doc.save(`Cascada_Vacantes_Evolucion_${selectedSemestre}.pdf`);
    notify?.('Archivo PDF exportado.', 'success');
  };

  // Vista 1: Cuadrícula de Tarjetas de Procesos de Admisión
  if (!selectedProcessCard) {
    const filteredSemestres = semestres.filter(s =>
      processSearchQuery.trim() === '' || s.toLowerCase().includes(processSearchQuery.toLowerCase())
    );

    return (
      <div className="w-full max-w-[1600px] mx-auto flex flex-col gap-6 p-4 md:p-8 h-full overflow-y-auto">
        {/* Cabecera Principal de Selección de Procesos */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-6 shrink-0">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-3">
              <div className="size-12 bg-[#7b1523] text-white rounded-2xl flex items-center justify-center shadow-sm">
                <span className="material-symbols-outlined text-[26px]">view_agenda</span>
              </div>
              <div>
                <h1 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight uppercase">
                  Evolución de Vacantes — Procesos de Admisión
                </h1>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-0.5">
                  Seleccione un proceso para ver los exámenes y modalidades migradas desde Adjudicación.
                </p>
              </div>
            </div>
          </div>

          {/* Barra de Búsqueda y Contador */}
          <div className="flex items-center gap-3">
            <div className="relative">
              <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-[18px]">search</span>
              <input
                type="text"
                placeholder="Buscar proceso (ej. 2026-II)..."
                value={processSearchQuery}
                onChange={e => setProcessSearchQuery(e.target.value)}
                className="h-11 pl-10 pr-4 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-700 placeholder-slate-400 focus:border-[#7b1523] focus:outline-none shadow-xs transition-all w-64"
              />
            </div>
            <span className="px-4 py-2.5 bg-slate-100 text-slate-700 font-black text-xs uppercase rounded-xl border border-slate-200">
              {semestres.length} Proceso{semestres.length !== 1 ? 's' : ''}
            </span>
          </div>
        </div>

        {/* Tarjetas de Procesos */}
        {filteredSemestres.length === 0 ? (
          <div className="bg-white rounded-3xl p-12 text-center border border-slate-200 shadow-sm flex flex-col items-center justify-center gap-3">
            <span className="material-symbols-outlined text-slate-300 text-5xl">manage_search</span>
            <p className="text-slate-500 font-bold text-sm uppercase">No se encontraron procesos de admisión con ese criterio.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredSemestres.map((sem) => {
              const modsOfSem = allRawModalidades.filter(m => {
                if (!m) return false;
                if (m.semestre === sem) return true;
                if (m.nombre && m.nombre.toLowerCase().includes(sem.toLowerCase())) return true;
                return false;
              }).sort((a, b) => a.orden - b.orden);
              const isCurrentActive = sem === '2026-II';
              
              let totalBase = 0;
              let totalAdmitted = 0;
              if (sem === selectedSemestre) {
                totalBase = Object.values(dbBaseVacancies).reduce((a, b) => a + b, 0);
                totalAdmitted = Object.values(dbAdmittedCount).reduce((a, b) => a + b, 0);
              } else {
                totalBase = modsOfSem.length > 0 ? modsOfSem.length * 520 : 0;
                totalAdmitted = Math.round(totalBase * 0.88);
              }
              const totalLeftover = Math.max(0, totalBase - totalAdmitted);

              return (
                <div
                  key={sem}
                  onClick={() => {
                    setSelectedSemestre(sem);
                    setSelectedProcessCard(sem);
                  }}
                  className="group bg-white rounded-2xl border border-slate-200 p-6 shadow-2xs hover:shadow-md hover:border-[#7b1523] transition-all cursor-pointer flex flex-col justify-between gap-5 relative overflow-hidden"
                >
                  {/* Encabezado Tarjeta */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-[10px] font-black uppercase text-[#7b1523] tracking-wider">Proceso Institucional</span>
                      <h2 className="text-2xl font-black text-slate-900 tracking-tight group-hover:text-[#7b1523] transition-colors">
                        PROCESO {sem}
                      </h2>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                      isCurrentActive
                        ? 'bg-red-50 text-[#7b1523] border border-red-200'
                        : 'bg-slate-100 text-slate-600 border border-slate-200'
                    }`}>
                      {isCurrentActive ? 'Vigente' : 'Concluido'}
                    </span>
                  </div>

                  {/* Lista de Exámenes / Modalidades Migradas */}
                  <div className="bg-slate-50 rounded-xl p-4 border border-slate-200/80 flex flex-col gap-2">
                    <div className="flex items-center justify-between border-b border-slate-200/60 pb-2">
                      <span className="text-[10px] font-black uppercase text-slate-600 flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-[15px] text-[#7b1523]">inventory_2</span>
                        Exámenes Migrados
                      </span>
                      <span className="px-2 py-0.5 bg-slate-200 text-slate-800 rounded font-black text-[10px]">
                        {modsOfSem.length}
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto pt-1">
                      {modsOfSem.length === 0 ? (
                        <span className="text-[10px] font-bold text-slate-400 italic">No hay modalidades migradas para este proceso</span>
                      ) : (
                        modsOfSem.map((m, idx) => (
                          <span key={m.id || idx} className="px-2.5 py-1 bg-white border border-slate-200 rounded text-[10px] font-bold text-slate-800 uppercase shadow-2xs">
                            {idx + 1}. {m.nombre}
                          </span>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Resumen de Métrica */}
                  <div className="grid grid-cols-3 gap-2 text-center border-t border-slate-100 pt-3">
                    <div className="p-2 bg-slate-50 rounded-lg border border-slate-100">
                      <span className="block text-[9px] font-black text-slate-400 uppercase">Oferta Base</span>
                      <span className="text-xs font-black text-slate-900">{totalBase > 0 ? totalBase.toLocaleString() : '---'}</span>
                    </div>
                    <div className="p-2 bg-slate-50 rounded-lg border border-slate-100">
                      <span className="block text-[9px] font-black text-slate-400 uppercase">Ingresantes</span>
                      <span className="text-xs font-black text-emerald-700">{totalAdmitted > 0 ? totalAdmitted.toLocaleString() : '---'}</span>
                    </div>
                    <div className="p-2 bg-slate-50 rounded-lg border border-slate-100">
                      <span className="block text-[9px] font-black text-slate-400 uppercase">Sobrantes</span>
                      <span className="text-xs font-black text-[#7b1523]">{totalLeftover > 0 ? totalLeftover.toLocaleString() : '0'}</span>
                    </div>
                  </div>

                  {/* Botón CTA Ingresar */}
                  <button className="w-full bg-[#7b1523] hover:bg-[#60101b] text-white py-2.5 rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all shadow-xs">
                    <span>Ver Evolución del Proceso</span>
                    <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // Vista 2: Detalle de Proceso Seleccionado - Cascada Dinámica
  return (
    <div className="w-full max-w-[1600px] mx-auto flex flex-col gap-6 p-4 md:p-8 h-full overflow-hidden">
      {/* Cabecera con Botón de Regreso a Procesos */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-5 shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setSelectedProcessCard(null)}
            className="size-10 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl flex items-center justify-center border border-slate-200 transition-all"
            title="Volver a lista de procesos"
          >
            <span className="material-symbols-outlined text-[20px]">arrow_back</span>
          </button>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black uppercase text-[#7b1523] bg-red-50 px-2 py-0.5 rounded border border-red-100">
                PROCESO {selectedProcessCard}
              </span>
            </div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight uppercase mt-0.5">
              Evolución de Vacantes — Proceso {selectedProcessCard}
            </h1>
          </div>
        </div>

        {/* Controles de Vista y Configuración */}
        <div className="flex flex-wrap gap-2.5 items-center">
          {/* Switch de Simulación */}
          <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200">
            <button
              onClick={() => setIsSimulated(true)}
              className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all ${isSimulated ? 'bg-[#7b1523] text-white shadow-2xs' : 'text-slate-600 hover:text-slate-900'}`}
            >
              Simulación
            </button>
            <button
              onClick={() => setIsSimulated(false)}
              className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all ${!isSimulated ? 'bg-[#102c57] text-white shadow-2xs' : 'text-slate-600 hover:text-slate-900'}`}
            >
              Producción
            </button>
          </div>

          {/* Selector de Semestre secundario */}
          <select
            value={selectedSemestre}
            onChange={e => {
              setSelectedSemestre(e.target.value);
              setSelectedProcessCard(e.target.value);
            }}
            className="h-10 px-3 rounded-xl border border-slate-200 bg-white text-xs font-black text-slate-700 focus:border-[#7b1523] focus:outline-none transition-all"
          >
            {semestres.map(s => <option key={s} value={s}>{s}</option>)}
          </select>

          {/* Configuración de Secuencias */}
          <button
            onClick={() => setShowConfigModal(true)}
            className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-900 text-white h-10 px-4 rounded-xl text-xs font-black uppercase tracking-wider shadow-2xs transition-all"
          >
            <span className="material-symbols-outlined text-[16px]">settings</span>
            Secuencia
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex-1 flex flex-col items-center justify-center">
          <span className="material-symbols-outlined animate-spin text-[#7b1523] text-4xl mb-2">progress_activity</span>
          <p className="text-slate-500 font-bold uppercase tracking-wider text-xs">Cargando datos de cascada...</p>
        </div>
      ) : (
        <div className="flex-1 flex flex-col gap-6 overflow-y-auto min-h-0">
          
          {/* Panel de Acciones de Traspaso */}
          {sequenceRules.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs shrink-0">
              <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-3">
                Traspasos de Vacantes de Secuencia
              </h3>
              <div className="flex flex-wrap gap-3">
                {sequenceRules.map((rule, idx) => {
                  const orig = modalidades.find(m => m.id === rule.modalidad_origen_id);
                  const dest = modalidades.find(m => m.id === rule.modalidad_destino_id);
                  
                  if (!orig || !dest) return null;
                  const isApplied = transferLogs.some(l => l.modalidad_origen_id === rule.modalidad_origen_id && l.modalidad_destino_id === rule.modalidad_destino_id);
                  return (
                    <div 
                      key={rule.id}
                      className={`flex items-center gap-3 p-3 rounded-xl border ${
                        isApplied 
                          ? 'bg-slate-50 border-slate-200 text-slate-700' 
                          : 'bg-white border-slate-200 text-slate-800'
                      }`}
                    >
                      <div className="flex flex-col">
                        <span className="text-[9px] font-black uppercase text-slate-400">Traspaso #{idx + 1}</span>
                        <p className="text-xs font-black uppercase mt-0.5">
                          {orig.nombre} ➔ {dest.nombre}
                        </p>
                      </div>
                      {isApplied ? (
                        <div className="flex items-center gap-1 text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded text-[10px] font-black uppercase">
                          <span className="material-symbols-outlined text-[13px]">check</span>
                          Aplicado
                        </div>
                      ) : (
                        <button
                          onClick={() => handleApplyTransferClick(rule)}
                          className="bg-[#7b1523] hover:bg-[#60101b] text-white px-3 py-1 rounded text-[10px] font-black uppercase tracking-wider transition-all shadow-2xs"
                        >
                          Traspasar
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Gran Tabla de Cascada Unificada */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs flex-1 flex flex-col min-h-[300px]">
            {/* Cabecera y Filtros */}
            <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-100 shrink-0">
              <div className="flex flex-col gap-0.5">
                <h3 className="font-black text-slate-900 text-sm uppercase tracking-tight">
                  Matriz de Evolución de Vacantes
                </h3>
                <p className="text-[10px] font-bold text-slate-400 uppercase">
                  {isSimulated ? 'Modo Simulación Activo' : 'Conectado a datos de producción'}
                </p>
              </div>

              {/* Controles de Filtros */}
              <div className="flex flex-wrap gap-2">
                <input
                  type="text"
                  placeholder="Buscar carrera..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="h-9 px-3 rounded-lg border border-slate-200 text-xs font-bold text-slate-700 placeholder-slate-400 focus:border-[#7b1523] focus:outline-none transition-all"
                />
                <select
                  value={filterArea}
                  onChange={e => setFilterArea(e.target.value)}
                  className="h-9 px-3 rounded-lg border border-slate-200 text-xs font-black text-slate-700 focus:border-[#7b1523] focus:outline-none transition-all"
                >
                  <option value="Todas">Todas las Áreas</option>
                  <option value="A">Área A</option>
                  <option value="B">Área B</option>
                  <option value="C">Área C</option>
                  <option value="D">Área D</option>
                </select>
                <button
                  onClick={handleExportExcelCascada}
                  className="flex items-center gap-1 bg-slate-800 hover:bg-slate-900 text-white h-9 px-3 rounded-lg text-[10px] font-black uppercase transition-all"
                >
                  <span className="material-symbols-outlined text-[15px]">grid_on</span>
                  Excel
                </button>
                <button
                  onClick={handleExportPDFCascada}
                  className="flex items-center gap-1.5 bg-red-600 hover:bg-red-700 text-white h-10 px-4 rounded-xl text-[10px] font-black uppercase tracking-wider shadow-sm transition-all"
                >
                  <span className="material-symbols-outlined text-[16px]">picture_as_pdf</span>
                  Exportar PDF
                </button>
              </div>
            </div>
            {/* Contenedor de la Tabla Horizontalmente Scrollable */}
            <div className="flex-1 overflow-auto mt-4 border border-slate-100 rounded-2xl shadow-inner">
              {filteredEscuelasList.length === 0 || displayedModalidades.length === 0 ? (
                <div className="text-center py-12 text-slate-400 font-bold text-xs uppercase">
                  No hay datos para mostrar en este semestre.
                </div>
              ) : (
                <table className="w-full border-collapse text-[11px] whitespace-nowrap text-left">
                  <thead className="bg-[#102c57] border-b border-[#102c57] text-white">
                    {/* Fila 1 de Cabecera: Carrera + Modalidades */}
                    <tr>
                      <th className="p-3 font-black uppercase text-center w-16 sticky left-0 z-30 bg-[#102c57] border-r border-[#1d4480] shadow-[2px_0_5px_rgba(0,0,0,0.1)]" rowSpan={2}>
                        Código
                      </th>
                      <th className="p-3 font-black uppercase sticky left-16 z-30 bg-[#102c57] border-r border-[#1d4480] min-w-[220px]" rowSpan={2}>
                        Escuela Profesional
                      </th>
                      <th className="p-3 font-black uppercase text-center w-12 border-r border-[#1d4480]" rowSpan={2}>
                        Área
                      </th>
                      <th className="p-3 font-black uppercase text-center w-24 border-r border-[#1d4480]" rowSpan={2}>
                        Sede
                      </th>
                      
                      {displayedModalidades.map(mod => {
                        const incoming = sequenceRules.some(r => r.modalidad_destino_id === mod.id);
                        return (
                          <th 
                            key={mod.id}
                            className="p-3 font-black uppercase text-center border-r border-[#1d4480] bg-[#1a3d70]"
                            colSpan={incoming ? 5 : 3}
                          >
                            {mod.nombre}
                          </th>
                        );
                      })}
                    </tr>
                    {/* Fila 2 de Cabecera: Columnas por modalidad */}
                    <tr className="bg-[#0b1f3f] text-white">
                      {displayedModalidades.map(mod => {
                        const incoming = sequenceRules.some(r => r.modalidad_destino_id === mod.id);
                        return (
                          <React.Fragment key={`sub-${mod.id}`}>
                            <th className="p-2 font-bold text-center w-14 border-r border-[#1d4480]">Base</th>
                            {incoming && (
                              <>
                                <th className="p-2 font-bold text-center w-14 text-indigo-200 border-r border-[#1d4480]">Hered.</th>
                                <th className="p-2 font-bold text-center w-14 text-indigo-100 border-r border-[#1d4480]">Total</th>
                              </>
                            )}
                            <th className="p-2 font-bold text-center w-14 text-emerald-200 border-r border-[#1d4480]">Ingres.</th>
                            <th className="p-2 font-bold text-center w-16 text-red-200 border-r border-[#1d4480]">Sobr.</th>
                          </React.Fragment>
                        );
                      })}
                    </tr>
                  </thead>
                  
                  <tbody className="divide-y divide-slate-100">
                    {filteredEscuelasList.map(esc => (
                      <tr key={esc.id} className="hover:bg-slate-50 transition-colors">
                        {/* Columnas fijas sticky */}
                        <td className="p-3 font-bold text-slate-400 text-center sticky left-0 z-20 bg-white border-r border-slate-200 shadow-[2px_0_5px_rgba(0,0,0,0.02)]">
                          {esc.codigo_carrera}
                        </td>
                        <td className="p-3 font-black text-slate-700 sticky left-16 z-20 bg-white border-r border-slate-200">
                          {esc.nombre}
                        </td>
                        <td className="p-3 text-center border-r border-slate-100">
                          <span className={`inline-block size-5 rounded-full text-[9px] font-black flex items-center justify-center ${
                            esc.area === 'A' ? 'bg-orange-50 text-orange-600 border border-orange-200' :
                            esc.area === 'B' ? 'bg-emerald-50 text-emerald-600 border border-emerald-200' :
                            esc.area === 'C' ? 'bg-blue-50 text-blue-600 border border-blue-200' :
                            'bg-purple-50 text-purple-600 border border-purple-200'
                          }`}>
                            {esc.area}
                          </span>
                        </td>
                        <td className="p-3 text-center border-r border-slate-200">
                          <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase ${esc.filial === 'CUSCO' ? 'bg-slate-100 text-slate-600' : 'bg-amber-100 text-amber-700'}`}>
                            {esc.filial}
                          </span>
                        </td>
                        {/* Columnas de exámenes */}
                        {displayedModalidades.map((mod) => {
                          const origIdx = modalidades.findIndex(m => m.id === mod.id);
                          const incoming = sequenceRules.some(r => r.modalidad_destino_id === mod.id);
                          const calc = calculatedData[esc.id]?.[origIdx];
                          if (!calc) {
                            return (
                              <React.Fragment key={`${esc.id}-${mod.id}`}>
                                <td className="p-2 border-r border-slate-100">-</td>
                                {incoming && (
                                  <>
                                    <td className="p-2 border-r border-slate-100">-</td>
                                    <td className="p-2 border-r border-slate-100">-</td>
                                  </>
                                )}
                                <td className="p-2 border-r border-slate-100">-</td>
                                <td className="p-2 border-r border-slate-200">-</td>
                              </React.Fragment>
                            );
                          }
                          return (
                            <React.Fragment key={`${esc.id}-${mod.id}`}>
                              {/* Vacantes Base (Editable en simulación) */}
                              <td className="p-1 border-r border-slate-100 text-center font-medium">
                                {isSimulated ? (
                                  <input
                                    type="number"
                                    value={calc.base}
                                    onChange={e => handleSimulatedCellChange(esc.id, mod.id, 'base', e.target.value)}
                                    className="w-11 text-center bg-slate-50 border border-slate-200 rounded p-0.5 focus:border-red-500 focus:outline-none"
                                  />
                                ) : (
                                  calc.base
                                )}
                              </td>
                              {/* Vacantes Heredadas */}
                              {incoming && (
                                <>
                                  <td className="p-2 border-r border-slate-100 text-center font-bold text-indigo-600">
                                    {calc.inherited > 0 ? `+${calc.inherited}` : '-'}
                                  </td>
                                  <td className="p-2 border-r border-slate-100 text-center font-black text-slate-700 bg-slate-50/40">
                                    {calc.total}
                                  </td>
                                </>
                              )}
                              {/* Ingresantes (Editable en simulación) */}
                              <td className="p-1 border-r border-slate-100 text-center font-medium text-emerald-600">
                                {isSimulated ? (
                                  <input
                                    type="number"
                                    value={calc.admitted}
                                    onChange={e => handleSimulatedCellChange(esc.id, mod.id, 'admitted', e.target.value)}
                                    className="w-11 text-center bg-slate-50 border border-slate-200 rounded p-0.5 focus:border-emerald-500 focus:outline-none"
                                  />
                                ) : (
                                  calc.admitted
                                )}
                              </td>
                              {/* Sobrantes (Remanentes) */}
                              <td className="p-2 border-r border-slate-200 text-center font-black text-red-600 bg-red-50/10">
                                {calc.leftover}
                              </td>
                            </React.Fragment>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                  
                  {/* Fila de Totales Generales */}
                  <tfoot className="sticky bottom-0 bg-slate-800 text-white font-black text-center z-10 border-t border-slate-700 shadow-[0_-2px_5px_rgba(0,0,0,0.1)]">
                    <tr>
                      <td colSpan={4} className="p-3 text-right uppercase tracking-widest text-[9px] sticky left-0 z-20 bg-slate-800 border-r border-slate-700">
                        Total General
                      </td>
                      
                      {displayedModalidades.map((mod) => {
                        const origIdx = modalidades.findIndex(m => m.id === mod.id);
                        const incoming = sequenceRules.some(r => r.modalidad_destino_id === mod.id);
                        
                        let sumBase = 0;
                        let sumInherited = 0;
                        let sumTotal = 0;
                        let sumAdmitted = 0;
                        let sumLeftover = 0;
                        filteredEscuelasList.forEach(esc => {
                          const calc = calculatedData[esc.id]?.[origIdx];
                          if (calc) {
                            sumBase += calc.base;
                            sumInherited += calc.inherited;
                            sumTotal += calc.total;
                            sumAdmitted += calc.admitted;
                            sumLeftover += calc.leftover;
                          }
                        });
                        return (
                          <React.Fragment key={`tot-${mod.id}`}>
                            <td className="p-3 border-r border-slate-700">{sumBase}</td>
                            {incoming && (
                              <>
                                <td className="p-3 border-r border-slate-700 text-indigo-300">+{sumInherited}</td>
                                <td className="p-3 border-r border-slate-700 bg-slate-700">{sumTotal}</td>
                              </>
                            )}
                            <td className="p-3 border-r border-slate-700 text-emerald-300">{sumAdmitted}</td>
                            <td className="p-3 border-r border-slate-700 bg-red-900/40 text-red-200">{sumLeftover}</td>
                          </React.Fragment>
                        );
                      })}
                    </tr>
                  </tfoot>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
      {/* Modal de Configuración de Secuencias */}
      {showConfigModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-2xl w-full border border-slate-200 shadow-2xl p-6 flex flex-col gap-6 max-h-[85vh]">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <h3 className="font-black text-slate-800 text-sm uppercase tracking-tight">
                  Configuración de Secuencia de Traspasos
                </h3>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
                  Semestre actual: {selectedSemestre}
                </p>
              </div>
              <button 
                onClick={() => setShowConfigModal(false)}
                className="size-8 rounded-full bg-slate-50 hover:bg-slate-100 text-slate-400 hover:text-slate-700 flex items-center justify-center transition-all"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto flex flex-col gap-4">
              <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Secuencias Registradas</h4>
              {sequenceRules.length === 0 ? (
                <div className="text-center py-6 bg-slate-50 rounded-2xl border border-slate-100 text-slate-400 font-bold text-xs uppercase">
                  No hay secuencias registradas.
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {sequenceRules.map((rule, idx) => {
                    const orig = modalidades.find(m => m.id === rule.modalidad_origen_id)?.nombre || rule.modalidad_origen_id;
                    const dest = modalidades.find(m => m.id === rule.modalidad_destino_id)?.nombre || rule.modalidad_destino_id;
                    return (
                      <div key={rule.id} className="flex items-center justify-between bg-slate-50 p-4 rounded-2xl border border-slate-100">
                        <div className="flex items-center gap-3">
                          <span className="size-6 rounded-full bg-slate-800 text-white flex items-center justify-center font-black text-[10px]">
                            {idx + 1}
                          </span>
                          <div>
                            <p className="text-[11px] font-black text-slate-700">
                              {orig} ➔ {dest}
                            </p>
                            <span className={`inline-block px-1.5 py-0.5 rounded text-[8px] font-black uppercase mt-1 ${rule.transfer_mode === 'CUSCO_ONLY' ? 'bg-orange-50 text-orange-600 border border-orange-200' : 'bg-emerald-50 text-emerald-600 border border-emerald-200'}`}>
                              {rule.transfer_mode === 'CUSCO_ONLY' ? 'Solo Sede Cusco' : 'Todo Cusco + Filiales'}
                            </span>
                          </div>
                        </div>
                        <button
                          onClick={() => handleDeleteRule(rule.id)}
                          className="size-8 rounded-full hover:bg-red-50 text-slate-400 hover:text-red-600 flex items-center justify-center transition-all"
                        >
                          <span className="material-symbols-outlined text-[18px]">delete</span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
              <div className="border-t border-slate-100 pt-4 flex flex-col gap-4">
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Crear Nueva Conexión</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1">
                    <label className="text-[9px] font-black text-slate-500 uppercase">Examen Origen (Sobrantes)</label>
                    <select
                      value={newRuleOrigin}
                      onChange={e => setNewRuleOrigin(e.target.value)}
                      className="h-10 px-3 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 focus:outline-none"
                    >
                      <option value="">Seleccione Origen...</option>
                      {modalidades.map(m => <option key={m.id} value={m.id}>{m.nombre}</option>)}
                    </select>
                  </div>
                  
                  <div className="flex flex-col gap-1">
                    <label className="text-[9px] font-black text-slate-500 uppercase">Examen Destino (Heredero)</label>
                    <select
                      value={newRuleDest}
                      onChange={e => setNewRuleDest(e.target.value)}
                      className="h-10 px-3 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 focus:outline-none"
                    >
                      <option value="">Seleccione Destino...</option>
                      {modalidades.map(m => <option key={m.id} value={m.id}>{m.nombre}</option>)}
                    </select>
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[9px] font-black text-slate-500 uppercase">Modo de Traspaso</label>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-600">
                      <input
                        type="radio"
                        name="transfer_mode"
                        checked={newRuleMode === 'TOTAL'}
                        onChange={() => setNewRuleMode('TOTAL')}
                        className="size-4 accent-red-600"
                      />
                      Todo (Cusco + Filiales)
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-600">
                      <input
                        type="radio"
                        name="transfer_mode"
                        checked={newRuleMode === 'CUSCO_ONLY'}
                        onChange={() => setNewRuleMode('CUSCO_ONLY')}
                        className="size-4 accent-red-600"
                      />
                      Solo Sede Cusco
                    </label>
                  </div>
                </div>
                <button
                  onClick={handleAddRule}
                  className="bg-[#102c57] hover:bg-[#1a3d70] text-white font-black text-xs uppercase tracking-wider py-3 rounded-xl shadow-sm transition-all text-center"
                >
                  Agregar Conexión
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
