import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabaseClient';
import { User } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

const sqlScript = `-- 1. Crear la tabla de secuencia de procesos
CREATE TABLE IF NOT EXISTS public.secuencia_procesos (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    proceso_general text NOT NULL, -- Ej: '2026-II', '2027-I'
    modalidad_origen_id uuid REFERENCES public.cv_modalidades(id) ON DELETE CASCADE,
    modalidad_destino_id uuid REFERENCES public.cv_modalidades(id) ON DELETE CASCADE,
    orden_secuencial integer NOT NULL,
    transfer_mode text NOT NULL DEFAULT 'TOTAL', -- 'TOTAL' o 'CUSCO_ONLY'
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
    CONSTRAINT secuencia_procesos_pkey PRIMARY KEY (id),
    CONSTRAINT secuencia_procesos_uniqueness UNIQUE (proceso_general, orden_secuencial)
);

-- 2. Crear la tabla de bitácora de transferencias
CREATE TABLE IF NOT EXISTS public.transferencias_vacantes (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    proceso_general text NOT NULL,
    modalidad_origen_id uuid REFERENCES public.cv_modalidades(id) ON DELETE CASCADE,
    modalidad_destino_id uuid REFERENCES public.cv_modalidades(id) ON DELETE CASCADE,
    escuela_id uuid REFERENCES public.cv_escuelas(id) ON DELETE CASCADE,
    cantidad_transferida integer NOT NULL,
    fecha_transferencia timestamp with time zone DEFAULT timezone('utc'::text, now()),
    usuario_responsable text NOT NULL,
    CONSTRAINT transferencias_vacantes_pkey PRIMARY KEY (id)
);

-- 3. Modificar la tabla adjudicacion_vacantes para añadir vacantes_transferidas
ALTER TABLE public.adjudicacion_vacantes 
ADD COLUMN IF NOT EXISTS vacantes_transferidas integer NOT NULL DEFAULT 0;

-- 4. RLS: Deshabilitar RLS temporalmente en las nuevas tablas
ALTER TABLE public.secuencia_procesos DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.transferencias_vacantes DISABLE ROW LEVEL SECURITY;`;

interface VacancyEvolutionProps {
  user: User;
  notify?: (msg: string, type?: 'success' | 'error' | 'warning' | 'info') => void;
}

// Interfaces based on requested Supabase schema & logical models
interface EscuelaVacante {
  escuela: string;
  area: string;
  base: number;
  heredadas: number;
  total: number;
  ingresantes: number;
  sobrantes: number;
  filial?: string; // 'CUSCO' or branch name
}

interface ProcesoNodo {
  id: string; // Ex: 'node-cepru-2026'
  nombre: string; // Ex: 'CEPRU- ORDINARIO 2026-I'
  orden_secuencial: number;
  vacantes_base: number;
  vacantes_heredadas: number;
  vacantes_totales: number;
  ingresantes: number;
  sobrantes: number;
  isProcessed: boolean;
  escuelas: EscuelaVacante[];
}

interface SecuenciaTransferencia {
  id: string;
  origen_id: string;
  destino_id: string;
  transfer_mode: 'TOTAL' | 'CUSCO_ONLY';
  isExecuted: boolean;
  cantidad_total_transferida?: number;
}

// Static Default Mock Scenarios for Simulation Mode
const DEFAULT_SCENARIOS = {
  '2026-II': {
    name: 'Proceso de Admisión 2026-II',
    description: 'CEPRU Ordinario 2026-I ➔ Examen Ordinario 2026-II ➔ Examen Filiales 2026-II',
    nodos: [
      {
        id: 'node-cepru-2026',
        nombre: 'CEPRU- ORDINARIO 2026-I',
        orden_secuencial: 1,
        vacantes_base: 180,
        vacantes_heredadas: 0,
        vacantes_totales: 180,
        ingresantes: 145,
        sobrantes: 35,
        isProcessed: true,
        escuelas: [
          { escuela: 'MATEMATICA', area: 'A', base: 20, heredadas: 0, total: 20, ingresantes: 12, sobrantes: 8, filial: 'CUSCO' },
          { escuela: 'QUIMICA', area: 'A', base: 15, heredadas: 0, total: 15, ingresantes: 8, sobrantes: 7, filial: 'CUSCO' },
          { escuela: 'INGENIERIA AGROPECUARIA (SEDE ANDAHUAYLAS)', area: 'B', base: 15, heredadas: 0, total: 15, ingresantes: 13, sobrantes: 2, filial: 'ANDAHUAYLAS' },
          { escuela: 'INGENIERIA AGROINDUSTRIAL (SEDE SICUANI)', area: 'A', base: 20, heredadas: 0, total: 20, ingresantes: 18, sobrantes: 2, filial: 'SICUANI' },
          { escuela: 'INGENIERIA METALURGICA', area: 'A', base: 20, heredadas: 0, total: 20, ingresantes: 15, sobrantes: 5, filial: 'CUSCO' },
          { escuela: 'MEDICINA VETERINARIA(Sicuani)', area: 'B', base: 15, heredadas: 0, total: 15, ingresantes: 12, sobrantes: 3, filial: 'SICUANI' },
          { escuela: 'INGENIERIA QUIMICA', area: 'A', base: 25, heredadas: 0, total: 25, ingresantes: 21, sobrantes: 4, filial: 'CUSCO' },
          { escuela: 'MEDICINA HUMANA', area: 'B', base: 15, heredadas: 0, total: 15, ingresantes: 15, sobrantes: 0, filial: 'CUSCO' },
          { escuela: 'INGENIERIA DE SISTEMAS', area: 'A', base: 15, heredadas: 0, total: 15, ingresantes: 15, sobrantes: 0, filial: 'CUSCO' },
          { escuela: 'ADMINISTRACION', area: 'C', base: 20, heredadas: 0, total: 20, ingresantes: 16, sobrantes: 4, filial: 'CUSCO' }
        ]
      },
      {
        id: 'node-ordinario-2026',
        nombre: 'CONCURSO DE ADMISIÓN ORDINARIO 2026-II',
        orden_secuencial: 2,
        vacantes_base: 330,
        vacantes_heredadas: 0,
        vacantes_totales: 330,
        ingresantes: 290,
        sobrantes: 40,
        isProcessed: false,
        escuelas: [
          { escuela: 'MATEMATICA', area: 'A', base: 35, heredadas: 0, total: 35, ingresantes: 30, sobrantes: 5, filial: 'CUSCO' },
          { escuela: 'QUIMICA', area: 'A', base: 25, heredadas: 0, total: 25, ingresantes: 20, sobrantes: 5, filial: 'CUSCO' },
          { escuela: 'INGENIERIA AGROPECUARIA (SEDE ANDAHUAYLAS)', area: 'B', base: 30, heredadas: 0, total: 30, ingresantes: 24, sobrantes: 6, filial: 'ANDAHUAYLAS' },
          { escuela: 'INGENIERIA AGROINDUSTRIAL (SEDE SICUANI)', area: 'A', base: 30, heredadas: 0, total: 30, ingresantes: 26, sobrantes: 4, filial: 'SICUANI' },
          { escuela: 'INGENIERIA METALURGICA', area: 'A', base: 35, heredadas: 0, total: 35, ingresantes: 31, sobrantes: 4, filial: 'CUSCO' },
          { escuela: 'MEDICINA VETERINARIA(Sicuani)', area: 'B', base: 30, heredadas: 0, total: 30, ingresantes: 23, sobrantes: 7, filial: 'SICUANI' },
          { escuela: 'INGENIERIA QUIMICA', area: 'A', base: 45, heredadas: 0, total: 45, ingresantes: 42, sobrantes: 3, filial: 'CUSCO' },
          { escuela: 'MEDICINA HUMANA', area: 'B', base: 30, heredadas: 0, total: 30, ingresantes: 30, sobrantes: 0, filial: 'CUSCO' },
          { escuela: 'INGENIERIA DE SISTEMAS', area: 'A', base: 35, heredadas: 0, total: 35, ingresantes: 33, sobrantes: 2, filial: 'CUSCO' },
          { escuela: 'ADMINISTRACION', area: 'C', base: 35, heredadas: 0, total: 35, ingresantes: 31, sobrantes: 4, filial: 'CUSCO' }
        ]
      },
      {
        id: 'node-filiales-2026',
        nombre: 'CONCURSO DE ADMISIÓN DE FILIALES 2026-II',
        orden_secuencial: 3,
        vacantes_base: 140,
        vacantes_heredadas: 0,
        vacantes_totales: 140,
        ingresantes: 105,
        sobrantes: 35,
        isProcessed: false,
        escuelas: [
          { escuela: 'INGENIERIA AGROPECUARIA (SEDE ANDAHUAYLAS)', area: 'B', base: 40, heredadas: 0, total: 40, ingresantes: 32, sobrantes: 8, filial: 'ANDAHUAYLAS' },
          { escuela: 'INGENIERIA AGROINDUSTRIAL (SEDE SICUANI)', area: 'A', base: 50, heredadas: 0, total: 50, ingresantes: 40, sobrantes: 10, filial: 'SICUANI' },
          { escuela: 'MEDICINA VETERINARIA(Sicuani)', area: 'B', base: 50, heredadas: 0, total: 50, ingresantes: 33, sobrantes: 17, filial: 'SICUANI' }
        ]
      }
    ],
    secuencias: [
      { id: 'seq-1', origen_id: 'node-cepru-2026', destino_id: 'node-ordinario-2026', transfer_mode: 'TOTAL', isExecuted: false },
      { id: 'seq-2', origen_id: 'node-ordinario-2026', destino_id: 'node-filiales-2026', transfer_mode: 'TOTAL', isExecuted: false }
    ] as SecuenciaTransferencia[]
  },
  '2027-I': {
    name: 'Proceso de Admisión 2027-I',
    description: 'CEPRU 1ra Op. ➔ Admisión 1ra Op. (Traspaso Total); Exonerados ➔ Ordinario (Solo Cusco); Ordinario ➔ Filiales (Traspaso Total)',
    nodos: [
      {
        id: 'node-cepru1-2027',
        nombre: 'CEPRU DE PRIMERA OPORTUNIDAD 2027',
        orden_secuencial: 1,
        vacantes_base: 150,
        vacantes_heredadas: 0,
        vacantes_totales: 150,
        ingresantes: 125,
        sobrantes: 25,
        isProcessed: true,
        escuelas: [
          { escuela: 'MATEMATICA', area: 'A', base: 15, heredadas: 0, total: 15, ingresantes: 10, sobrantes: 5, filial: 'CUSCO' },
          { escuela: 'QUIMICA', area: 'A', base: 15, heredadas: 0, total: 15, ingresantes: 8, sobrantes: 7, filial: 'CUSCO' },
          { escuela: 'INGENIERIA METALURGICA', area: 'A', base: 20, heredadas: 0, total: 20, ingresantes: 14, sobrantes: 6, filial: 'CUSCO' },
          { escuela: 'INGENIERIA QUIMICA', area: 'A', base: 20, heredadas: 0, total: 20, ingresantes: 18, sobrantes: 2, filial: 'CUSCO' },
          { escuela: 'MEDICINA HUMANA', area: 'B', base: 15, heredadas: 0, total: 15, ingresantes: 15, sobrantes: 0, filial: 'CUSCO' },
          { escuela: 'INGENIERIA DE SISTEMAS', area: 'A', base: 15, heredadas: 0, total: 15, ingresantes: 15, sobrantes: 0, filial: 'CUSCO' },
          { escuela: 'ADMINISTRACION', area: 'C', base: 25, heredadas: 0, total: 25, ingresantes: 21, sobrantes: 4, filial: 'CUSCO' },
          { escuela: 'INGENIERIA AGROINDUSTRIAL (SEDE SICUANI)', area: 'A', base: 25, heredadas: 0, total: 25, ingresantes: 24, sobrantes: 1, filial: 'SICUANI' }
        ]
      },
      {
        id: 'node-1raop-2027',
        nombre: 'CONCURSO DE ADMISIÓN DE PRIMERA OPORTUNIDAD 2027',
        orden_secuencial: 2,
        vacantes_base: 200,
        vacantes_heredadas: 0,
        vacantes_totales: 200,
        ingresantes: 170,
        sobrantes: 30,
        isProcessed: false,
        escuelas: [
          { escuela: 'MATEMATICA', area: 'A', base: 20, heredadas: 0, total: 20, ingresantes: 15, sobrantes: 5, filial: 'CUSCO' },
          { escuela: 'QUIMICA', area: 'A', base: 20, heredadas: 0, total: 20, ingresantes: 15, sobrantes: 5, filial: 'CUSCO' },
          { escuela: 'INGENIERIA METALURGICA', area: 'A', base: 25, heredadas: 0, total: 25, ingresantes: 21, sobrantes: 4, filial: 'CUSCO' },
          { escuela: 'INGENIERIA QUIMICA', area: 'A', base: 25, heredadas: 0, total: 25, ingresantes: 23, sobrantes: 2, filial: 'CUSCO' },
          { escuela: 'MEDICINA HUMANA', area: 'B', base: 20, heredadas: 0, total: 20, ingresantes: 20, sobrantes: 0, filial: 'CUSCO' },
          { escuela: 'INGENIERIA DE SISTEMAS', area: 'A', base: 20, heredadas: 0, total: 20, ingresantes: 20, sobrantes: 0, filial: 'CUSCO' },
          { escuela: 'ADMINISTRACION', area: 'C', base: 35, heredadas: 0, total: 35, ingresantes: 28, sobrantes: 7, filial: 'CUSCO' },
          { escuela: 'INGENIERIA AGROINDUSTRIAL (SEDE SICUANI)', area: 'A', base: 35, heredadas: 0, total: 35, ingresantes: 28, sobrantes: 7, filial: 'SICUANI' }
        ]
      },
      {
        id: 'node-exon-2027',
        nombre: 'ADMISIÓN POR EXONERACIÓN DEL CONCURSO ORD (1° Y 2° PUESTO DE E.S.)',
        orden_secuencial: 3,
        vacantes_base: 90,
        vacantes_heredadas: 0,
        vacantes_totales: 90,
        ingresantes: 60,
        sobrantes: 30,
        isProcessed: true,
        escuelas: [
          { escuela: 'MATEMATICA', area: 'A', base: 10, heredadas: 0, total: 10, ingresantes: 4, sobrantes: 6, filial: 'CUSCO' },
          { escuela: 'QUIMICA', area: 'A', base: 10, heredadas: 0, total: 10, ingresantes: 3, sobrantes: 7, filial: 'CUSCO' },
          { escuela: 'INGENIERIA METALURGICA', area: 'A', base: 15, heredadas: 0, total: 15, ingresantes: 10, sobrantes: 5, filial: 'CUSCO' },
          { escuela: 'INGENIERIA QUIMICA', area: 'A', base: 15, heredadas: 0, total: 15, ingresantes: 11, sobrantes: 4, filial: 'CUSCO' },
          { escuela: 'MEDICINA HUMANA', area: 'B', base: 10, heredadas: 0, total: 10, ingresantes: 10, sobrantes: 0, filial: 'CUSCO' },
          { escuela: 'INGENIERIA AGROINDUSTRIAL (SEDE SICUANI)', area: 'A', base: 15, heredadas: 0, total: 15, ingresantes: 10, sobrantes: 5, filial: 'SICUANI' },
          { escuela: 'MEDICINA VETERINARIA(Sicuani)', area: 'B', base: 15, heredadas: 0, total: 15, ingresantes: 12, sobrantes: 3, filial: 'SICUANI' }
        ]
      },
      {
        id: 'node-ordinario-2027',
        nombre: 'CONCURSO DE ADMISIÓN ORDINARIO 2027-I',
        orden_secuencial: 4,
        vacantes_base: 310,
        vacantes_heredadas: 0,
        vacantes_totales: 310,
        ingresantes: 275,
        sobrantes: 35,
        isProcessed: false,
        escuelas: [
          { escuela: 'MATEMATICA', area: 'A', base: 35, heredadas: 0, total: 35, ingresantes: 28, sobrantes: 7, filial: 'CUSCO' },
          { escuela: 'QUIMICA', area: 'A', base: 25, heredadas: 0, total: 25, ingresantes: 20, sobrantes: 5, filial: 'CUSCO' },
          { escuela: 'INGENIERIA METALURGICA', area: 'A', base: 35, heredadas: 0, total: 35, ingresantes: 30, sobrantes: 5, filial: 'CUSCO' },
          { escuela: 'INGENIERIA QUIMICA', area: 'A', base: 45, heredadas: 0, total: 45, ingresantes: 42, sobrantes: 3, filial: 'CUSCO' },
          { escuela: 'MEDICINA HUMANA', area: 'B', base: 30, heredadas: 0, total: 30, ingresantes: 30, sobrantes: 0, filial: 'CUSCO' },
          { escuela: 'INGENIERIA DE SISTEMAS', area: 'A', base: 35, heredadas: 0, total: 35, ingresantes: 35, sobrantes: 0, filial: 'CUSCO' },
          { escuela: 'ADMINISTRACION', area: 'C', base: 40, heredadas: 0, total: 40, ingresantes: 36, sobrantes: 4, filial: 'CUSCO' },
          { escuela: 'INGENIERIA AGROINDUSTRIAL (SEDE SICUANI)', area: 'A', base: 35, heredadas: 0, total: 35, ingresantes: 29, sobrantes: 6, filial: 'SICUANI' },
          { escuela: 'MEDICINA VETERINARIA(Sicuani)', area: 'B', base: 30, heredadas: 0, total: 30, ingresantes: 25, sobrantes: 5, filial: 'SICUANI' }
        ]
      },
      {
        id: 'node-filiales-2027',
        nombre: 'CONCURSO DE ADMISIÓN DE FILIALES 2027-I',
        orden_secuencial: 5,
        vacantes_base: 100,
        vacantes_heredadas: 0,
        vacantes_totales: 100,
        ingresantes: 70,
        sobrantes: 30,
        isProcessed: false,
        escuelas: [
          { escuela: 'INGENIERIA AGROINDUSTRIAL (SEDE SICUANI)', area: 'A', base: 50, heredadas: 0, total: 50, ingresantes: 38, sobrantes: 12, filial: 'SICUANI' },
          { escuela: 'MEDICINA VETERINARIA(Sicuani)', area: 'B', base: 50, heredadas: 0, total: 50, ingresantes: 32, sobrantes: 18, filial: 'SICUANI' }
        ]
      }
    ],
    secuencias: [
      { id: 'seq-1', origen_id: 'node-cepru1-2027', destino_id: 'node-1raop-2027', transfer_mode: 'TOTAL', isExecuted: false },
      { id: 'seq-2', origen_id: 'node-exon-2027', destino_id: 'node-ordinario-2027', transfer_mode: 'CUSCO_ONLY', isExecuted: false },
      { id: 'seq-3', origen_id: 'node-ordinario-2027', destino_id: 'node-filiales-2027', transfer_mode: 'TOTAL', isExecuted: false }
    ] as SecuenciaTransferencia[]
  }
};

export const VacancyEvolution: React.FC<VacancyEvolutionProps> = ({ user, notify }) => {
  const [isSimulation, setIsSimulation] = useState<boolean>(true);
  const [activeScenarioKey, setActiveScenarioKey] = useState<'2026-II' | '2027-I'>('2026-II');
  
  // Real-time editable scenarios state
  const [scenariosData, setScenariosData] = useState<typeof DEFAULT_SCENARIOS>(() => {
    const saved = localStorage.getItem('unsaac_vacancy_cascade_data');
    return saved ? JSON.parse(saved) : DEFAULT_SCENARIOS;
  });

  // Table filters
  const [filterArea, setFilterArea] = useState<string>('Todos');
  const [searchTerm, setSearchTerm] = useState<string>('');

  // DB Verification & State
  const [isDbChecking, setIsDbChecking] = useState<boolean>(false);
  const [dbStatus, setDbStatus] = useState<{
    ready: boolean;
    errorMsg?: string;
  }>({ ready: false });
  const [showSqlDialog, setShowSqlDialog] = useState<boolean>(false);

  // Sync to localStorage
  useEffect(() => {
    localStorage.setItem('unsaac_vacancy_cascade_data', JSON.stringify(scenariosData));
  }, [scenariosData]);

  // Read production DB when switching off simulation
  useEffect(() => {
    if (!isSimulation) {
      checkAndLoadProductionData();
    }
  }, [isSimulation, activeScenarioKey]);

  // Checks and loads actual Supabase data mapping to columns
  const checkAndLoadProductionData = async () => {
    setIsDbChecking(true);
    try {
      const { error: errSeq } = await supabase.from('secuencia_procesos').select('*').limit(1);
      const { error: errTrans } = await supabase.from('transferencias_vacantes').select('*').limit(1);
      const { data: dataVac } = await supabase.from('adjudicacion_vacantes').select('*').limit(1);

      const hasSeq = !errSeq;
      const hasTrans = !errTrans;
      const hasVacCol = dataVac && dataVac[0] && ('vacantes_transferidas' in dataVac[0]);

      if (!hasSeq || !hasTrans || !hasVacCol) {
        setDbStatus({
          ready: false,
          errorMsg: "La base de datos física no tiene las tablas de Secuencia ni la columna de Vacantes Heredadas. Ejecuta el script SQL."
        });
        notify?.("Se requiere aplicar la migración SQL en Supabase.", "warning");
        setIsSimulation(true);
        return;
      }

      setDbStatus({ ready: true });
      notify?.("Esquema de base de datos verificado. Cargando datos reales...", "info");

      // Load Real Adjudicacion data
      const activeModalidades = DEFAULT_SCENARIOS[activeScenarioKey].nodos.map(n => n.nombre);
      const { data: dbVacantes, error: errFetch } = await supabase
        .from('adjudicacion_vacantes')
        .select('*')
        .in('modalidad', activeModalidades);

      if (errFetch) throw errFetch;

      if (!dbVacantes || dbVacantes.length === 0) {
        notify?.("No se encontraron registros de vacantes cargados en la tabla adjudicacion_vacantes para estas modalidades.", "warning");
        return;
      }

      // Reconstruct nodes using DB rows
      const updatedNodos = DEFAULT_SCENARIOS[activeScenarioKey].nodos.map(nodo => {
        const matchingDbRows = dbVacantes.filter(r => r.modalidad === nodo.nombre);
        
        const updatedEscuelas = nodo.escuelas.map(esc => {
          const dbRow = matchingDbRows.find(r => r.escuela === esc.escuela);
          if (dbRow) {
            const total = dbRow.vacantes_totales || 0;
            const sobrantes = dbRow.vacantes_disponibles || 0;
            const heredadas = dbRow.vacantes_transferidas || 0;
            const base = total - heredadas;
            const ingresantes = total - sobrantes;

            return {
              ...esc,
              base: Math.max(0, base),
              heredadas,
              total,
              ingresantes: Math.max(0, ingresantes),
              sobrantes
            };
          }
          return { ...esc, base: 0, heredadas: 0, total: 0, ingresantes: 0, sobrantes: 0 };
        });

        const totalBase = updatedEscuelas.reduce((sum, e) => sum + e.base, 0);
        const totalHeredadas = updatedEscuelas.reduce((sum, e) => sum + e.heredadas, 0);
        const totalOfertadas = totalBase + totalHeredadas;
        const totalIngresantes = updatedEscuelas.reduce((sum, e) => sum + e.ingresantes, 0);
        const totalSobrantes = updatedEscuelas.reduce((sum, e) => sum + e.sobrantes, 0);

        return {
          ...nodo,
          vacantes_base: totalBase,
          vacantes_heredadas: totalHeredadas,
          vacantes_totales: totalOfertadas,
          ingresantes: totalIngresantes,
          sobrantes: totalSobrantes,
          escuelas: updatedEscuelas
        };
      });

      // Load executed transfer logs
      const { data: dbLogs } = await supabase
        .from('transferencias_vacantes')
        .select('*')
        .eq('proceso_general', activeScenarioKey);

      const updatedSecuencias = DEFAULT_SCENARIOS[activeScenarioKey].secuencias.map(seq => {
        const hasLog = dbLogs && dbLogs.some(l => 
          l.modalidad_origen_id === seq.origen_id && l.modalidad_destino_id === seq.destino_id
        );
        const targetNodo = updatedNodos.find(n => n.id === seq.destino_id);
        const hasTransfer = targetNodo && targetNodo.vacantes_heredadas > 0;

        return {
          ...seq,
          isExecuted: !!(hasLog || hasTransfer)
        };
      });

      setScenariosData(prev => ({
        ...prev,
        [activeScenarioKey]: {
          ...prev[activeScenarioKey],
          nodos: updatedNodos,
          secuencias: updatedSecuencias
        }
      }));

      notify?.("Datos reales de producción sincronizados exitosamente.", "success");
    } catch (err: any) {
      notify?.("Error al conectar con Supabase: " + err.message, "error");
    } finally {
      setIsDbChecking(false);
    }
  };

  const handleResetSimulation = () => {
    setScenariosData(DEFAULT_SCENARIOS);
    notify?.("Valores de simulación restablecidos por defecto.", "info");
  };

  // Helper helper to check Cusco vs branch
  const isCuscoSchool = (escuelaName: string): boolean => {
    const name = escuelaName.toLowerCase();
    return !name.includes('(') && 
           !name.includes('sede') && 
           !name.includes('filial') && 
           !name.includes('espinar') && 
           !name.includes('sicuani') && 
           !name.includes('canas') && 
           !name.includes('andahuaylas') && 
           !name.includes('puerto maldonado') && 
           !name.includes('santo tomas');
  };

  const currentScenario = scenariosData[activeScenarioKey];

  // Extranct unique union of all offered schools in this scenario
  const uniqueEscuelas = useMemo(() => {
    const list: Array<{ escuela: string; area: string; filial: string }> = [];
    currentScenario.nodos.forEach(node => {
      node.escuelas.forEach(esc => {
        if (!list.some(l => l.escuela === esc.escuela)) {
          list.push({
            escuela: esc.escuela,
            area: esc.area || 'A',
            filial: esc.filial || (isCuscoSchool(esc.escuela) ? 'CUSCO' : 'FILIAL')
          });
        }
      });
    });
    // Sort alphabetically
    return list.sort((a, b) => a.escuela.localeCompare(b.escuela));
  }, [currentScenario]);

  // Helper to compute amount to transfer for a specific school and sequence, considering skipping and accumulation
  const getAmountToTransfer = (schoolName: string, filial: string, seq: SecuenciaTransferencia) => {
    if (seq.transfer_mode === 'CUSCO_ONLY' && filial !== 'CUSCO') {
      return 0;
    }

    let pending = 0;
    const sortedNodes = [...currentScenario.nodos].sort((a, b) => a.orden_secuencial - b.orden_secuencial);
    const tempComputedLeftovers: Record<string, number> = {};

    sortedNodes.forEach((node) => {
      const raw = node.escuelas.find(e => e.escuela === schoolName);
      const base = raw ? raw.base : 0;
      const ingresantes = raw ? raw.ingresantes : 0;

      let heredadas = 0;
      const seqIncoming = currentScenario.secuencias.find(s => s.destino_id === node.id);

      if (seqIncoming && seqIncoming.isExecuted) {
        const sourceLeftover = tempComputedLeftovers[seqIncoming.origen_id] || 0;
        if (seqIncoming.transfer_mode === 'CUSCO_ONLY' && filial !== 'CUSCO') {
          pending += sourceLeftover;
        } else {
          heredadas = sourceLeftover + pending;
          pending = 0;
        }
      }

      const total = base + heredadas;
      const sobrantes = (total > 0) ? Math.max(0, total - ingresantes) : 0;
      tempComputedLeftovers[node.id] = sobrantes;
    });

    const sourceLeftover = tempComputedLeftovers[seq.origen_id] || 0;
    return sourceLeftover + pending;
  };

  // RECONCILE/CALCULATE THE CASCADE RECOGNIZING ALL INTERMEDIATE REMANENTS AND TRANSFER RUNS
  const computedCascade = useMemo(() => {
    const computedNodes: Record<string, {
      id: string;
      nombre: string;
      orden_secuencial: number;
      escuelas: Record<string, {
        base: number;
        heredadas: number;
        total: number;
        ingresantes: number;
        sobrantes: number;
      }>;
    }> = {};

    // Sort by order of execution
    const sortedNodes = [...currentScenario.nodos].sort((a, b) => a.orden_secuencial - b.orden_secuencial);

    // Initialize map
    sortedNodes.forEach(node => {
      computedNodes[node.id] = {
        id: node.id,
        nombre: node.nombre,
        orden_secuencial: node.orden_secuencial,
        escuelas: {}
      };
    });

    uniqueEscuelas.forEach(({ escuela, filial }) => {
      let pending_remanentes = 0; // Cumulative leftovers that skipped steps

      sortedNodes.forEach((node) => {
        const raw = node.escuelas.find(e => e.escuela === escuela);
        
        // Base is 0 if school not offered in this node
        const base = raw ? raw.base : 0;
        const ingresantes = raw ? raw.ingresantes : 0;

        let heredadas = 0;
        const seqIncoming = currentScenario.secuencias.find(s => s.destino_id === node.id);

        if (seqIncoming) {
          const isApplied = seqIncoming.isExecuted;
          if (isApplied) {
            const sourceNodeComputed = computedNodes[seqIncoming.origen_id];
            const sourceLeftover = sourceNodeComputed?.escuelas[escuela]?.sobrantes || 0;

            if (seqIncoming.transfer_mode === 'CUSCO_ONLY' && filial !== 'CUSCO') {
              // Sicuani is filial, but transfer is Cusco only, so we skip it but accumulate!
              pending_remanentes += sourceLeftover;
            } else {
              // Sicuani is either Cusco, or transfer is TOTAL, so we inherit the source leftover + any pending accumulated leftovers!
              heredadas = sourceLeftover + pending_remanentes;
              pending_remanentes = 0; // Reset after successful transfer
            }
          }
        }

        const total = base + heredadas;
        const sobrantes = (total > 0) ? Math.max(0, total - ingresantes) : 0;

        computedNodes[node.id].escuelas[escuela] = {
          base,
          heredadas,
          total,
          ingresantes,
          sobrantes
        };
      });
    });

    return computedNodes;
  }, [currentScenario, uniqueEscuelas]);

  // Node column totals calculated dynamically for headers & footer sums
  const nodeTotals = useMemo(() => {
    const totals: Record<string, {
      base: number;
      heredadas: number;
      total: number;
      ingresantes: number;
      sobrantes: number;
    }> = {};

    Object.keys(computedCascade).forEach(nodeId => {
      const nodeData = computedCascade[nodeId];
      let bSum = 0;
      let hSum = 0;
      let tSum = 0;
      let iSum = 0;
      let sSum = 0;

      Object.values(nodeData.escuelas).forEach(school => {
        bSum += school.base;
        hSum += school.heredadas;
        tSum += school.total;
        iSum += school.ingresantes;
        sSum += school.sobrantes;
      });

      totals[nodeId] = {
        base: bSum,
        heredadas: hSum,
        total: tSum,
        ingresantes: iSum,
        sobrantes: sSum
      };
    });

    return totals;
  }, [computedCascade]);

  // Execute sequence trigger (Traspasar)
  const handleTriggerTransfer = async (seq: SecuenciaTransferencia) => {
    const sourceNode = currentScenario.nodos.find(n => n.id === seq.origen_id);
    const destNode = currentScenario.nodos.find(n => n.id === seq.destino_id);

    if (!sourceNode || !destNode) {
      notify?.("Error interno: nodos de secuencia no encontrados.", "error");
      return;
    }

    // Check remaining vacancies of source
    const sourceCalculated = computedCascade[seq.origen_id];
    const totalSobrantes = Object.values(sourceCalculated?.escuelas || {}).reduce((acc, val) => acc + val.sobrantes, 0);

    // Calculate total amount to transfer considering skipped ones
    let totalToTransferCount = 0;
    uniqueEscuelas.forEach(({ escuela, filial }) => {
      totalToTransferCount += getAmountToTransfer(escuela, filial, seq);
    });

    if (totalToTransferCount <= 0 && totalSobrantes <= 0) {
      notify?.(`No hay vacantes sobrantes para transferir desde "${sourceNode.nombre}".`, "warning");
      return;
    }

    if (isSimulation) {
      // --- SIMULATION RUN ---
      const updatedSecuencias = currentScenario.secuencias.map(s => {
        if (s.id === seq.id) {
          return { ...s, isExecuted: true };
        }
        return s;
      });

      setScenariosData(prev => ({
        ...prev,
        [activeScenarioKey]: {
          ...prev[activeScenarioKey],
          secuencias: updatedSecuencias
        }
      }));

      notify?.(`Traspaso de vacantes simulado con éxito de "${sourceNode.nombre}" a "${destNode.nombre}" (${seq.transfer_mode}).`, "success");
    } else {
      // --- PRODUCTION RUN ---
      try {
        notify?.("Iniciando ejecución de transferencia en producción...", "info");

        // Fetch target row entries in production
        const { data: currentTargetRows, error: errTarget } = await supabase
          .from('adjudicacion_vacantes')
          .select('*')
          .eq('modalidad', destNode.nombre);

        if (errTarget) throw errTarget;

        let totalTransferredCount = 0;

        // Iterate through each school to transfer the exact amount (including accumulated skipped ones)
        for (const { escuela, filial } of uniqueEscuelas) {
          const transferAmount = getAmountToTransfer(escuela, filial, seq);

          if (transferAmount > 0) {
            totalTransferredCount += transferAmount;

            // Find target row
            const targetRow = currentTargetRows?.find(r => r.escuela === escuela);
            if (targetRow) {
              const currentHeredadas = targetRow.vacantes_transferidas || 0;
              const newHeredadas = currentHeredadas + transferAmount;
              const newTotal = (targetRow.vacantes_totales || 0) + transferAmount;
              const newDisponibles = (targetRow.vacantes_disponibles || 0) + transferAmount;

              const { error: errUpdate } = await supabase
                .from('adjudicacion_vacantes')
                .update({
                  vacantes_transferidas: newHeredadas,
                  vacantes_totales: newTotal,
                  vacantes_disponibles: newDisponibles
                })
                .eq('id', targetRow.id);

              if (errUpdate) console.error(`Error actualizando ${escuela}:`, errUpdate.message);
            }

            // Save Transfer Log
            await supabase.from('transferencias_vacantes').insert({
              proceso_general: activeScenarioKey,
              modalidad_origen_id: seq.origen_id,
              modalidad_destino_id: seq.destino_id,
              escuela_id: targetRow?.id, // relative reference if exists
              cantidad_transferida: transferAmount,
              usuario_responsable: user.name
            });
          }
        }

        // Refresh view
        await checkAndLoadProductionData();
        notify?.(`Traspaso registrado en producción. ${totalTransferredCount} vacantes heredadas correctamente.`, "success");
      } catch (err: any) {
        notify?.("Error ejecutando transferencia en producción: " + err.message, "error");
      }
    }
  };

  // Modify base and ingresantes directly inside the simulation grid cells
  const handleCellChange = (nodeId: string, escuelaName: string, field: 'base' | 'ingresantes', val: string) => {
    if (!isSimulation) return;
    const intVal = Math.max(0, parseInt(val) || 0);

    const updatedNodos = currentScenario.nodos.map(node => {
      if (node.id === nodeId) {
        const updatedEscuelas = node.escuelas.map(esc => {
          if (esc.escuela === escuelaName) {
            return {
              ...esc,
              [field]: intVal
            };
          }
          return esc;
        });

        // Sum values
        const tBase = updatedEscuelas.reduce((sum, e) => sum + e.base, 0);
        const tIngresantes = updatedEscuelas.reduce((sum, e) => sum + e.ingresantes, 0);

        return {
          ...node,
          vacantes_base: tBase,
          ingresantes: tIngresantes,
          escuelas: updatedEscuelas
        };
      }
      return node;
    });

    setScenariosData(prev => ({
      ...prev,
      [activeScenarioKey]: {
        ...prev[activeScenarioKey],
        nodos: updatedNodos
      }
    }));
  };

  // Careers filtered list
  const filteredEscuelasList = useMemo(() => {
    return uniqueEscuelas.filter(esc => {
      const matchesArea = filterArea === 'Todos' || esc.area === filterArea;
      const matchesSearch = esc.escuela.toLowerCase().includes(searchTerm.toLowerCase());
      return matchesArea && matchesSearch;
    });
  }, [uniqueEscuelas, filterArea, searchTerm]);

  // Horizontal excel export structure
  const handleExportExcel = () => {
    const workbook = XLSX.utils.book_new();

    // Grouping rows header manually
    const excelRows: any[] = [];

    // Header 1 (Top groupings)
    const headerRow1 = ['', '', '', ''];
    // Header 2 (Exact columns)
    const headerRow2 = ['N°', 'Carrera/Escuela Profesional', 'Área', 'Sede/Filial'];

    currentScenario.nodos.forEach(node => {
      const hasIncoming = currentScenario.secuencias.some(s => s.destino_id === node.id);
      const spanCount = hasIncoming ? 5 : 3;
      headerRow1.push(node.nombre);
      for (let i = 1; i < spanCount; i++) headerRow1.push('');

      if (hasIncoming) {
        headerRow2.push('Base', 'Hered.', 'Total', 'Ingres.', 'Sobr.');
      } else {
        headerRow2.push('Base', 'Ingres.', 'Sobr.');
      }
    });

    excelRows.push(headerRow1);
    excelRows.push(headerRow2);

    // Populate data
    filteredEscuelasList.forEach((esc, idx) => {
      const row: any[] = [
        idx + 1,
        esc.escuela,
        esc.area,
        esc.filial
      ];

      currentScenario.nodos.forEach(node => {
        const hasIncoming = currentScenario.secuencias.some(s => s.destino_id === node.id);
        const cellData = computedCascade[node.id]?.escuelas[esc.escuela];
        
        if (cellData) {
          if (hasIncoming) {
            row.push(cellData.base, cellData.heredadas, cellData.total, cellData.ingresantes, cellData.sobrantes);
          } else {
            row.push(cellData.base, cellData.ingresantes, cellData.sobrantes);
          }
        } else {
          if (hasIncoming) {
            row.push(0, 0, 0, 0, 0);
          } else {
            row.push(0, 0, 0);
          }
        }
      });

      excelRows.push(row);
    });

    // Add footer totals
    const footerRow: (string | number)[] = ['TOTALES', '', '', ''];
    currentScenario.nodos.forEach(node => {
      const hasIncoming = currentScenario.secuencias.some(s => s.destino_id === node.id);
      const totals = nodeTotals[node.id];
      if (totals) {
        if (hasIncoming) {
          footerRow.push(totals.base, totals.heredadas, totals.total, totals.ingresantes, totals.sobrantes);
        } else {
          footerRow.push(totals.base, totals.ingresantes, totals.sobrantes);
        }
      }
    });
    excelRows.push(footerRow);

    const worksheet = XLSX.utils.aoa_to_sheet(excelRows);
    XLSX.utils.book_append_sheet(workbook, worksheet, "Cascada Vacantes");

    XLSX.writeFile(workbook, `Cascada_Evolucion_Vacantes_${activeScenarioKey}.xlsx`);
    notify?.("Estructura de cascada exportada a Excel.", "success");
  };

  // Landscape A4 PDF export
  const handleExportPDF = () => {
    const doc = new jsPDF('l', 'mm', 'a4'); // Landscape

    // Header Institutional
    doc.setFillColor(153, 27, 27); // UNSAAC Crimson Red
    doc.rect(0, 0, 297, 30, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text("UNIVERSIDAD NACIONAL DE SAN ANTONIO ABAD DEL CUSCO", 15, 11);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text("VICERRECTORADO ACADÉMICO • OFICINA DE ADMISIÓN", 15, 17);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text(`CONSOLIDADO EN CASCADA DE EVOLUCIÓN DE VACANTES - PROCESO ${activeScenarioKey}`, 15, 23);

    // Meta Info
    doc.setTextColor(51, 65, 85);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text(`Responsable: ${user.name} (${user.role})`, 15, 38);
    doc.text(`Fecha de Reporte: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`, 15, 42);
    doc.text(`Modo: ${isSimulation ? 'SIMULACIÓN (CONTROL INTERNO)' : 'PRODUCCIÓN (BASE DE DATOS REAL)'}`, 15, 46);

    // Build Table structure
    const headers: string[][] = [
      // Double Row 1
      ['N°', 'Escuela Profesional', 'Área', 'Sede'],
      // Double Row 2 placeholder
      ['', '', '', '']
    ];

    // Populate headers
    currentScenario.nodos.forEach(node => {
      const hasIncoming = currentScenario.secuencias.some(s => s.destino_id === node.id);
      
      // We append column sub-headers
      if (hasIncoming) {
        headers[0].push(`${node.nombre.substring(0, 18)}...`, '', '', '', '');
        headers[1].push('Bse', 'Her', 'Tot', 'Ing', 'Sob');
      } else {
        headers[0].push(`${node.nombre.substring(0, 18)}...`, '', '');
        headers[1].push('Bse', 'Ing', 'Sob');
      }
    });

    const body: any[][] = [];

    filteredEscuelasList.forEach((esc, idx) => {
      const row: any[] = [
        idx + 1,
        esc.escuela.length > 35 ? `${esc.escuela.substring(0, 32)}...` : esc.escuela,
        esc.area,
        esc.filial
      ];

      currentScenario.nodos.forEach(node => {
        const hasIncoming = currentScenario.secuencias.some(s => s.destino_id === node.id);
        const cell = computedCascade[node.id]?.escuelas[esc.escuela];
        if (cell) {
          if (hasIncoming) {
            row.push(cell.base, cell.heredadas, cell.total, cell.ingresantes, cell.sobrantes);
          } else {
            row.push(cell.base, cell.ingresantes, cell.sobrantes);
          }
        } else {
          if (hasIncoming) row.push(0, 0, 0, 0, 0);
          else row.push(0, 0, 0);
        }
      });
      body.push(row);
    });

    // Totals row
    const totalsRow: (string | number)[] = ['TOTAL', '', '', ''];
    currentScenario.nodos.forEach(node => {
      const hasIncoming = currentScenario.secuencias.some(s => s.destino_id === node.id);
      const t = nodeTotals[node.id];
      if (t) {
        if (hasIncoming) totalsRow.push(t.base, t.heredadas, t.total, t.ingresantes, t.sobrantes);
        else totalsRow.push(t.base, t.ingresantes, t.sobrantes);
      }
    });
    body.push(totalsRow);

    autoTable(doc, {
      startY: 50,
      head: headers,
      body: body,
      theme: 'grid',
      styles: {
        fontSize: 6,
        cellPadding: 1,
        valign: 'middle',
        halign: 'center'
      },
      headStyles: {
        fillColor: [15, 23, 42],
        textColor: [255, 255, 255],
        fontSize: 6,
        fontStyle: 'bold'
      },
      columnStyles: {
        1: { halign: 'left', fontStyle: 'bold', cellWidth: 42 }
      },
      didParseCell: (data) => {
        if (data.row.index === body.length - 1) {
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.fillColor = [241, 245, 249];
        }
      }
    });

    doc.save(`Cascada_Evolucion_Vacantes_${activeScenarioKey}.pdf`);
    notify?.("Reporte PDF en formato horizontal descargado.", "success");
  };

  return (
    <div id="vacancy-evolution-page" className="p-6 max-w-[1600px] mx-auto flex flex-col gap-6">
      
      {/* Top Bar with Brand & Mode Switcher */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="bg-red-800 text-amber-500 p-3 rounded-2xl border border-red-900/10">
            <span className="material-symbols-outlined text-[32px]">trending_up</span>
          </div>
          <div>
            <h1 className="text-slate-900 text-lg font-black uppercase tracking-tight">Evolución de Vacantes</h1>
            <p className="text-slate-500 text-xs mt-0.5">Cascada cronológica unificada de asignación, ingresos y traspasos de remanentes.</p>
          </div>
        </div>

        {/* Action Controls & Switcher */}
        <div className="flex items-center gap-3">
          {isSimulation && (
            <button
              onClick={handleResetSimulation}
              className="flex items-center gap-2 px-3 py-2 text-xs font-black uppercase tracking-tight text-slate-500 bg-slate-50 hover:bg-slate-100 hover:text-slate-800 rounded-xl transition-all border border-slate-200"
            >
              <span className="material-symbols-outlined text-[16px]">restart_alt</span>
              Reiniciar Simulación
            </button>
          )}

          <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200">
            <button
              onClick={() => setIsSimulation(true)}
              className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-tight transition-all ${
                isSimulation 
                  ? 'bg-red-800 text-white shadow-sm' 
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Simulación
            </button>
            <button
              onClick={() => setIsSimulation(false)}
              className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-tight transition-all ${
                !isSimulation 
                  ? 'bg-amber-600 text-white shadow-sm' 
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Producción
            </button>
          </div>
        </div>
      </div>

      {/* SQL Missing / Schema Warnings */}
      <AnimatePresence>
        {!isSimulation && !dbStatus.ready && (
          <motion.div 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4"
          >
            <div className="flex gap-3 items-start">
              <span className="material-symbols-outlined text-amber-600 text-[24px] shrink-0 mt-0.5">warning</span>
              <div>
                <h3 className="text-amber-800 text-xs font-black uppercase tracking-wider">Esquema físico ausente</h3>
                <p className="text-amber-700 text-xs mt-0.5">{dbStatus.errorMsg}</p>
              </div>
            </div>
            <button
              onClick={() => setShowSqlDialog(true)}
              className="flex items-center justify-center gap-2 text-xs font-black uppercase bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded-xl transition-all shadow-sm shrink-0"
            >
              <span className="material-symbols-outlined text-[16px]">terminal</span>
              Ver Script de Migración SQL
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Process Selection Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row items-center gap-4">
        <span className="text-slate-700 text-xs font-black uppercase tracking-wider shrink-0">Proceso Activo:</span>
        <div className="flex gap-2 w-full sm:w-auto">
          {(Object.keys(scenariosData) as Array<'2026-II' | '2027-I'>).map((key) => (
            <button
              key={key}
              onClick={() => setActiveScenarioKey(key)}
              className={`flex-1 sm:flex-none px-4 py-2 rounded-xl text-xs font-black uppercase tracking-tight transition-all border ${
                activeScenarioKey === key
                  ? 'bg-red-800 text-white border-red-900 shadow-sm'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}
            >
              {key}
            </button>
          ))}
        </div>
        <div className="text-slate-400 text-xs truncate sm:ml-auto font-medium">
          {currentScenario.description}
        </div>
      </div>

      {/* Transfer Execution Dashboard Board */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <h2 className="text-slate-800 text-xs font-black uppercase tracking-wider mb-4">Panel de Traspaso Cronológico (Secuencia de Flujo)</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {currentScenario.secuencias.map((seq, idx) => {
            const srcNode = currentScenario.nodos.find(n => n.id === seq.origen_id);
            const targetNode = currentScenario.nodos.find(n => n.id === seq.destino_id);
            const calculatedSource = computedCascade[seq.origen_id];
            
            // Calculate real-time source remaining vacancies
            const rawSobrantes = Object.values(calculatedSource?.escuelas || {}).reduce((acc, v) => acc + v.sobrantes, 0);

            return (
              <div 
                key={seq.id}
                className={`p-5 rounded-xl border flex flex-col justify-between gap-4 transition-all ${
                  seq.isExecuted 
                    ? 'bg-emerald-50/50 border-emerald-200' 
                    : 'bg-slate-50/50 border-slate-200 hover:bg-slate-50'
                }`}
              >
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Traspaso Paso #{idx + 1}</span>
                    <span className={`text-[8px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                      seq.transfer_mode === 'TOTAL' ? 'bg-indigo-100 text-indigo-800' : 'bg-amber-100 text-amber-800'
                    }`}>
                      Regla: {seq.transfer_mode}
                    </span>
                  </div>

                  <h3 className="text-slate-800 text-[11px] font-black uppercase tracking-tight leading-snug">
                    {srcNode?.nombre.replace('CONCURSO DE ADMISIÓN ', '')} ➔ {targetNode?.nombre.replace('CONCURSO DE ADMISIÓN ', '')}
                  </h3>

                  <div className="flex gap-4 mt-3">
                    <div>
                      <p className="text-[8px] text-slate-400 uppercase font-bold">Remanentes Origen</p>
                      <p className={`font-black text-sm ${rawSobrantes > 0 ? 'text-red-600' : 'text-slate-400'}`}>
                        {rawSobrantes} vacantes
                      </p>
                    </div>
                    {seq.isExecuted && (
                      <div className="border-l border-slate-200 pl-4">
                        <p className="text-[8px] text-slate-400 uppercase font-bold">Estado</p>
                        <p className="text-emerald-600 font-bold text-xs flex items-center gap-1 mt-0.5">
                          <span className="material-symbols-outlined text-[14px]">check_circle</span>
                          Aplicado
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {seq.isExecuted ? (
                  <button
                    disabled
                    className="w-full text-center text-[10px] font-bold uppercase tracking-wider text-emerald-800 bg-emerald-100/50 py-2 rounded-xl cursor-default"
                  >
                    Ya Ejecutado
                  </button>
                ) : (
                  <button
                    onClick={() => handleTriggerTransfer(seq)}
                    className="w-full text-center text-[10px] font-black uppercase tracking-wider bg-amber-500 hover:bg-amber-600 text-white py-2 rounded-xl shadow-sm transition-all flex items-center justify-center gap-1"
                  >
                    <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
                    Traspasar Remanentes
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Master Unified Cascade Table & Detail Filters */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
        
        {/* Table Toolbar */}
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-col md:flex-row items-center justify-between gap-4">
          
          {/* Left: Filters */}
          <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
            <div className="relative w-full sm:w-64">
              <span className="material-symbols-outlined absolute left-3 top-2.5 text-slate-400 text-[18px]">search</span>
              <input
                type="text"
                placeholder="Buscar carrera profesional..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-xs rounded-xl border border-slate-200 bg-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-red-800 focus:border-red-800"
              />
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <span className="text-slate-500 text-[10px] font-black uppercase tracking-wider">Área:</span>
              <select
                value={filterArea}
                onChange={(e) => setFilterArea(e.target.value)}
                className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium focus:outline-none focus:ring-1 focus:ring-red-800"
              >
                <option value="Todos">Todas las Áreas</option>
                <option value="A">Área A</option>
                <option value="B">Área B</option>
                <option value="C">Área C</option>
                <option value="D">Área D</option>
              </select>
            </div>
          </div>

          {/* Right: Export buttons */}
          <div className="flex items-center gap-2 w-full sm:w-auto shrink-0 justify-end">
            <button
              onClick={handleExportExcel}
              className="flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl text-xs font-black uppercase transition-all shadow-sm"
            >
              <span className="material-symbols-outlined text-[16px]">grid_on</span>
              Exportar Excel
            </button>
            <button
              onClick={handleExportPDF}
              className="flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 text-white px-4 py-2 rounded-xl text-xs font-black uppercase transition-all shadow-sm"
            >
              <span className="material-symbols-outlined text-[16px]">picture_as_pdf</span>
              Exportar PDF (Horizontal)
            </button>
          </div>
        </div>

        {/* Horizontal Scroll Unified Cascade Table Wrapper */}
        <div className="overflow-x-auto max-w-full">
          <table className="min-w-full border-collapse text-left text-xs">
            
            {/* Dynamic Double-Height Headers */}
            <thead>
              {/* Row 1: Exam Groupings */}
              <tr className="bg-slate-900 text-white border-b border-slate-800">
                <th colSpan={4} className="p-3 uppercase tracking-wider font-bold text-[10px] bg-slate-950 border-r border-slate-800 sticky left-0 z-20 shadow-[2px_0_5px_rgba(0,0,0,0.15)]">
                  Datos Generales de la Carrera
                </th>
                {currentScenario.nodos.map((node) => {
                  const hasIncoming = currentScenario.secuencias.some(s => s.destino_id === node.id);
                  const span = hasIncoming ? 5 : 3;

                  return (
                    <th 
                      key={node.id} 
                      colSpan={span} 
                      className="p-3 text-center border-r border-slate-800 uppercase tracking-widest text-[9px] font-black bg-slate-900"
                    >
                      <div className="flex flex-col items-center gap-0.5">
                        <span className="text-amber-500 font-extrabold text-[8px] tracking-widest uppercase">EXAMEN PASO #{node.orden_secuencial}</span>
                        <span className="truncate max-w-[200px] text-[10px]">{node.nombre}</span>
                      </div>
                    </th>
                  );
                })}
              </tr>

              {/* Row 2: Sub-column fields */}
              <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                <th className="p-3 text-center w-12 sticky left-0 bg-slate-100 z-10 font-bold border-r border-slate-200 shadow-[1px_0_3px_rgba(0,0,0,0.05)]">N°</th>
                <th className="p-3 w-64 sticky left-12 bg-slate-100 z-10 font-black border-r border-slate-200 shadow-[2px_0_5px_rgba(0,0,0,0.05)]">Escuela Profesional</th>
                <th className="p-3 w-20 text-center border-r border-slate-200">Área</th>
                <th className="p-3 w-24 text-center border-r border-slate-200">Sede/Filial</th>
                
                {currentScenario.nodos.map((node) => {
                  const hasIncoming = currentScenario.secuencias.some(s => s.destino_id === node.id);
                  if (hasIncoming) {
                    return (
                      <React.Fragment key={`${node.id}-sub`}>
                        <th className="p-2 text-center text-[9px] font-bold w-12 bg-slate-50 border-r border-slate-200">Base</th>
                        <th className="p-2 text-center text-[9px] font-bold w-12 bg-amber-50/50 text-amber-800 border-r border-slate-200">Hered.</th>
                        <th className="p-2 text-center text-[9px] font-bold w-12 bg-slate-100/50 border-r border-slate-200">Total</th>
                        <th className="p-2 text-center text-[9px] font-bold w-14 bg-slate-50 border-r border-slate-200">Ingres.</th>
                        <th className="p-2 text-center text-[9px] font-bold w-14 bg-red-50 text-red-800 border-r border-slate-300">Sobr.</th>
                      </React.Fragment>
                    );
                  } else {
                    return (
                      <React.Fragment key={`${node.id}-sub`}>
                        <th className="p-2 text-center text-[9px] font-bold w-12 bg-slate-50 border-r border-slate-200">Base</th>
                        <th className="p-2 text-center text-[9px] font-bold w-14 bg-slate-50 border-r border-slate-200">Ingres.</th>
                        <th className="p-2 text-center text-[9px] font-bold w-14 bg-red-50 text-red-800 border-r border-slate-300">Sobr.</th>
                      </React.Fragment>
                    );
                  }
                })}
              </tr>
            </thead>

            {/* Table Body rows */}
            <tbody>
              {filteredEscuelasList.length === 0 ? (
                <tr>
                  <td colSpan={30} className="p-8 text-center text-slate-400 font-medium">
                    No se encontraron carreras con los filtros seleccionados.
                  </td>
                </tr>
              ) : (
                filteredEscuelasList.map((esc, idx) => {
                  return (
                    <tr 
                      key={esc.escuela}
                      className="border-b border-slate-150 hover:bg-slate-50/70 transition-all text-[11px]"
                    >
                      {/* Sticky N° Column */}
                      <td className="p-3 text-center text-slate-400 font-bold sticky left-0 bg-white z-10 border-r border-slate-200 shadow-[1px_0_3px_rgba(0,0,0,0.05)]">
                        {idx + 1}
                      </td>
                      
                      {/* Sticky Career Column */}
                      <td className="p-3 font-extrabold text-slate-800 uppercase tracking-tight sticky left-12 bg-white z-10 border-r border-slate-200 shadow-[2px_0_5px_rgba(0,0,0,0.05)] truncate max-w-xs">
                        {esc.escuela}
                      </td>

                      <td className="p-3 text-center border-r border-slate-200">
                        <span className="px-2 py-0.5 rounded-md font-bold bg-slate-100 text-slate-700">
                          {esc.area}
                        </span>
                      </td>

                      <td className="p-3 text-center border-r border-slate-200 font-medium text-slate-500">
                        {esc.filial}
                      </td>

                      {/* Dynamic Columns rendering cascade calculation */}
                      {currentScenario.nodos.map((node) => {
                        const hasIncoming = currentScenario.secuencias.some(s => s.destino_id === node.id);
                        const cellValues = computedCascade[node.id]?.escuelas[esc.escuela];
                        const offered = cellValues && (cellValues.base > 0 || cellValues.heredadas > 0 || cellValues.total > 0);

                        if (!offered) {
                          // Render blank/dash if not offered in this exam
                          const cellSpan = hasIncoming ? 5 : 3;
                          return (
                            <td 
                              key={`${node.id}-${esc.escuela}-blank`} 
                              colSpan={cellSpan} 
                              className="p-2 text-center text-slate-300 border-r border-slate-200 bg-slate-50/30 select-none"
                            >
                              -
                            </td>
                          );
                        }

                        return (
                          <React.Fragment key={`${node.id}-${esc.escuela}-cells`}>
                            
                            {/* BASE COLUMN */}
                            <td className="p-1 border-r border-slate-200 text-center bg-slate-50/50">
                              {isSimulation ? (
                                <input
                                  type="number"
                                  min={0}
                                  value={cellValues.base}
                                  onChange={(e) => handleCellChange(node.id, esc.escuela, 'base', e.target.value)}
                                  className="w-12 text-center font-bold bg-transparent border-b border-transparent hover:border-slate-300 focus:border-red-800 focus:bg-white focus:ring-0 p-0.5 rounded transition-all"
                                />
                              ) : (
                                <span className="font-bold text-slate-700">{cellValues.base}</span>
                              )}
                            </td>

                            {/* HEREDADAS (If step receives transfer) */}
                            {hasIncoming && (
                              <td className="p-2 text-center border-r border-slate-200 bg-amber-50/20 font-extrabold text-amber-600">
                                {cellValues.heredadas > 0 ? `+${cellValues.heredadas}` : '0'}
                              </td>
                            )}

                            {/* TOTAL OFFERED (If step receives transfer) */}
                            {hasIncoming && (
                              <td className="p-2 text-center border-r border-slate-200 font-black text-slate-800 bg-slate-100/30">
                                {cellValues.total}
                              </td>
                            )}

                            {/* INGRESANTES COLUMN */}
                            <td className="p-1 border-r border-slate-200 text-center">
                              {isSimulation ? (
                                <input
                                  type="number"
                                  min={0}
                                  value={cellValues.ingresantes}
                                  onChange={(e) => handleCellChange(node.id, esc.escuela, 'ingresantes', e.target.value)}
                                  className="w-12 text-center font-bold text-emerald-600 bg-transparent border-b border-transparent hover:border-slate-300 focus:border-red-800 focus:bg-white focus:ring-0 p-0.5 rounded transition-all"
                                />
                              ) : (
                                <span className="font-extrabold text-emerald-600">{cellValues.ingresantes}</span>
                              )}
                            </td>

                            {/* SOBRANTES COLUMN (Remanent calculated dynamically) */}
                            <td className="p-2 text-center border-r border-slate-300 bg-red-50/50 font-black text-red-600 text-xs">
                              {cellValues.sobrantes}
                            </td>

                          </React.Fragment>
                        );
                      })}
                    </tr>
                  );
                })
              )}
            </tbody>

            {/* Table Footer Totals */}
            <tfoot>
              <tr className="bg-slate-100 text-slate-900 border-t border-slate-300 font-extrabold text-[11px]">
                <td colSpan={4} className="p-3 text-right bg-slate-100 border-r border-slate-300 uppercase tracking-wider font-black sticky left-0 z-10 shadow-[2px_0_5px_rgba(0,0,0,0.1)]">
                  TOTALES GENERALES
                </td>
                
                {currentScenario.nodos.map((node) => {
                  const hasIncoming = currentScenario.secuencias.some(s => s.destino_id === node.id);
                  const totals = nodeTotals[node.id];

                  if (!totals) {
                    return (
                      <td colSpan={hasIncoming ? 5 : 3} key={`${node.id}-tot-null`} className="p-3 text-center border-r border-slate-300">
                        -
                      </td>
                    );
                  }

                  if (hasIncoming) {
                    return (
                      <React.Fragment key={`${node.id}-tot`}>
                        <td className="p-3 text-center bg-slate-50 border-r border-slate-200 text-slate-800 font-black">{totals.base}</td>
                        <td className="p-3 text-center bg-amber-50 text-amber-700 border-r border-slate-200 font-black">{totals.heredadas}</td>
                        <td className="p-3 text-center bg-slate-100 border-r border-slate-200 text-slate-900 font-black">{totals.total}</td>
                        <td className="p-3 text-center bg-slate-50 text-emerald-600 border-r border-slate-200 font-black">{totals.ingresantes}</td>
                        <td className="p-3 text-center bg-red-50 text-red-600 border-r border-slate-300 font-black">{totals.sobrantes}</td>
                      </React.Fragment>
                    );
                  } else {
                    return (
                      <React.Fragment key={`${node.id}-tot`}>
                        <td className="p-3 text-center bg-slate-50 border-r border-slate-200 text-slate-800 font-black">{totals.base}</td>
                        <td className="p-3 text-center bg-slate-50 text-emerald-600 border-r border-slate-200 font-black">{totals.ingresantes}</td>
                        <td className="p-3 text-center bg-red-50 text-red-600 border-r border-slate-300 font-black">{totals.sobrantes}</td>
                      </React.Fragment>
                    );
                  }
                })}
              </tr>
            </tfoot>

          </table>
        </div>

      </div>

      {/* SQL Migration Script Dialog Modal */}
      {showSqlDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-3xl flex flex-col max-h-[85vh]">
            
            <div className="p-6 border-b border-slate-200 flex items-center justify-between bg-red-900 text-white rounded-t-3xl">
              <div className="flex items-center gap-3">
                <span className="material-symbols-outlined text-amber-500">terminal</span>
                <h3 className="font-black uppercase tracking-tight text-sm">Script de Migración SQL para Supabase</h3>
              </div>
              <button 
                onClick={() => setShowSqlDialog(false)}
                className="text-white/80 hover:text-white material-symbols-outlined"
              >
                close
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex flex-col gap-4">
              <p className="text-slate-600 text-xs">
                Para que la pestaña funcione en <strong>Modo Producción</strong> conectada a los datos de tu Supabase, debes ejecutar el siguiente script SQL en el editor de consultas (SQL Editor) de tu consola de Supabase:
              </p>

              <pre className="p-4 bg-slate-900 text-amber-400 font-mono text-[10px] rounded-xl overflow-x-auto whitespace-pre select-all shadow-inner border border-slate-800">
                {sqlScript}
              </pre>

              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-3 text-amber-800 text-xs leading-normal">
                <span className="material-symbols-outlined text-[20px] shrink-0">info</span>
                <p>
                  Este script creará la secuencia de procesos, la bitácora de transferencias, añadirá la columna para acumular vacantes transferidas en la tabla original <code>adjudicacion_vacantes</code> y deshabilitará temporalmente el RLS para mantener compatibilidad offline-first.
                </p>
              </div>
            </div>

            <div className="p-4 border-t border-slate-200 bg-slate-50 flex justify-end rounded-b-3xl">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(sqlScript);
                  notify?.("Script copiado al portapapeles.", "success");
                }}
                className="flex items-center gap-2 bg-red-800 hover:bg-red-900 text-white px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider shadow-sm transition-all"
              >
                <span className="material-symbols-outlined text-[16px]">content_copy</span>
                Copiar Código
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};
