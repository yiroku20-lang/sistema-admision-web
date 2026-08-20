import React, { useState, useEffect, useRef, useMemo } from 'react';
import { supabase } from '../lib/supabaseClient';
import { User, BudgetRole, RoleSchedule, ScheduleEvent, ExamBudgetRecord } from '../types';
import { initialRoles } from '../src/data/initialRoles';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface ExamBudgetProps {
  user: User;
  notify?: (msg: string, type?: 'success' | 'error' | 'warning' | 'info') => void;
}

const MAX_PAYMENT = 6000;

export const AutoResizeTextarea = ({ value, onChange, readOnly, placeholder, className }: any) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const adjustHeight = () => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${textarea.scrollHeight}px`;
    }
  };
  useEffect(() => {
    adjustHeight();
  }, [value]);
  return (
    <textarea
      ref={textareaRef}
      value={value}
      onChange={onChange}
      readOnly={readOnly}
      rows={1}
      placeholder={placeholder}
      className={className}
      style={{
        resize: 'none',
        overflow: 'hidden',
        width: '100%',
        background: 'transparent',
        outline: 'none'
      }}
    />
  );
};


interface GeneralScheduleEvent {
  id: string;
  group: string;
  date: string;
  time: string;
  activity: string;
  location: string;
}

const INITIAL_GENERAL_SCHEDULE: GeneralScheduleEvent[] = [
  {
    id: 'g1',
    group: 'HORARIOS GENERALES DEL EXAMEN',
    date: 'Sábado 07 de Febrero de 2026',
    time: '07:30 a 09:30',
    activity: 'Ingreso de Postulantes',
    location: 'CIUDAD UNIVERSITARIA DE PERAYOC (Av. de la Cultura Nº 733)'
  },
  {
    id: 'g2',
    group: 'HORARIOS GENERALES DEL EXAMEN',
    date: 'Sábado 07 de Febrero de 2026',
    time: '10:00',
    activity: 'Distribución y llenado de fichas OMR',
    location: 'Aulas asignadas'
  },
  {
    id: 'g3',
    group: 'HORARIOS GENERALES DEL EXAMEN',
    date: 'Sábado 07 de Febrero de 2026',
    time: '10:30',
    activity: 'Inicio de examen',
    location: 'Aulas de la Ciudad Universitaria'
  },
  {
    id: 'g4',
    group: 'HORARIOS GENERALES DEL EXAMEN',
    date: 'Sábado 07 de Febrero de 2026',
    time: '13:00',
    activity: 'Finalización de examen',
    location: 'Ciudad Universitaria de Perayoc'
  },
  {
    id: 'g5',
    group: 'HORARIOS GENERALES DEL EXAMEN',
    date: 'Sábado 07 de Febrero de 2026',
    time: '07:30 a 09:30',
    activity: 'Distribución de Puertas por Grupos: \n- Grupo A: Puerta 2 - Av. de la Cultura (Pabellón de Enfermería)\n- Grupo B: Puerta 3 - Av. de la Cultura (Puente peatonal)\n- Grupo C: Puerta 1 - Av. de la Cultura (Av. Víctor Raúl Haya de la Torre)\n- Grupo D: Puerta 6 - Av. Universitaria (Urb. Mariscal Gamarra)\n- Discapacitados: Puerta 6 - Av. Universitaria',
    location: 'Puertas de ingreso del campus'
  },
  {
    id: 'g6',
    group: 'ELABORACIÓN DE PRUEBA',
    date: 'Viernes 06 de Febrero de 2026',
    time: '08:00',
    activity: 'Sorteo de Elaboradores en Consejo Universitario',
    location: 'Rectorado / Sala de Consejo'
  },
  {
    id: 'g7',
    group: 'ELABORACIÓN DE PRUEBA',
    date: 'Viernes 06 de Febrero de 2026',
    time: '17:30 a 18:00',
    activity: 'Ingreso a local de Elaboración (Enclaustramiento)',
    location: 'Local de Elaboración - CEPRU'
  },
  {
    id: 'g8',
    group: 'ELABORACIÓN DE PRUEBA',
    date: 'Sábado 07 de Febrero de 2026',
    time: '12:45',
    activity: 'Salida de personal de Elaboración de Prueba',
    location: 'Local de Elaboración - CEPRU'
  },
  {
    id: 'g9',
    group: 'COORDINADORES DE TARJETAS',
    date: 'Miércoles 04 de Febrero de 2026',
    time: '10:00 a 13:00',
    activity: 'Control de ratificación de jurados receptores de prueba',
    location: 'Patio del pabellón de Control de Calidad'
  },
  {
    id: 'g10',
    group: 'COORDINADORES DE TARJETAS',
    date: 'Jueves 05 y Viernes 06 de Febrero de 2026',
    time: '08:00 a 13:00 y 14:00 a 17:00',
    activity: 'Preparación de bolsas y arpilleras con tarjetas OMR (Grupos A, B, C, D) y entrega a elaboración',
    location: 'Pabellón de Control de Calidad'
  },
  {
    id: 'g11',
    group: 'COORDINADORES DE TARJETAS',
    date: 'Sábado 07 de Febrero de 2026',
    time: '05:15 a 05:30',
    activity: 'Ingreso de Coordinadores de Tarjetas por la Puerta N° 5',
    location: 'Ciudad Universitaria de Perayoc'
  },
  {
    id: 'g12',
    group: 'JURADO RECEPTORES DE PRUEBA',
    date: 'Martes 03 de Febrero de 2026',
    time: '09:00',
    activity: 'Sorteo de Jurados Receptores de Prueba',
    location: 'Rectorado / Consejo Universitario'
  },
  {
    id: 'g13',
    group: 'JURADO RECEPTORES DE PRUEBA',
    date: 'Miércoles 04 de Febrero de 2026',
    time: '10:00 a 13:00',
    activity: 'Ratificación de participación de los Jurados Receptores (Firmas)',
    location: 'Patio del pabellón de Control de Calidad'
  },
  {
    id: 'g14',
    group: 'JURADO RECEPTORES DE PRUEBA',
    date: 'Sábado 07 de Febrero de 2026',
    time: '06:00 a 06:30',
    activity: 'Ingreso de Jurados Receptores de Prueba por la Puerta N° 5',
    location: 'Ciudad Universitaria de Perayoc'
  },
  {
    id: 'g15',
    group: 'JURADO RECEPTORES DE PRUEBA',
    date: 'Sábado 07 de Febrero de 2026',
    time: '06:30 a 07:00',
    activity: 'Charla de inducción obligatoria para Jurados Receptores',
    location: 'Auditorio de Facultad de Ciencias Sociales'
  },
  {
    id: 'g16',
    group: 'COORDINADORES DE PLANTA FÍSICA Y CARPETEROS',
    date: 'Viernes 06 de Febrero de 2026',
    time: '08:00 a 13:00 y 14:00 a 17:00',
    activity: 'Etiquetado de carpetas y pegado de listados de postulantes en aulas (Grupos A, B, C y D)',
    location: 'Aulas asignadas'
  },
  {
    id: 'g17',
    group: 'COORDINADORES DE PLANTA FÍSICA Y CARPETEROS',
    date: 'Sábado 07 de Febrero de 2026',
    time: '05:15 a 05:30',
    activity: 'Ingreso de Coordinadores de Planta Física y Carpeteros por la Puerta N° 5',
    location: 'Ciudad Universitaria'
  },
  {
    id: 'g18',
    group: 'COORDINADORES DE PLANTA FÍSICA Y CARPETEROS',
    date: 'Sábado 07 de Febrero de 2026',
    time: '05:30 a 06:00',
    activity: 'Verificar apertura de aulas y listados en puertas por parte de los carpeteros',
    location: 'Pabellones y aulas'
  },
  {
    id: 'g19',
    group: 'COORDINADORES DE PLANTA FÍSICA Y CARPETEROS',
    date: 'Sábado 07 de Febrero de 2026',
    time: '13:00 a 13:30',
    activity: 'Recoger listados de postulantes de las puertas, cerrar aulas y devolver llaves a los responsables',
    location: 'Aulas del campus'
  },
  {
    id: 'g20',
    group: 'RECTOR',
    date: 'Viernes 06 de Febrero de 2026',
    time: '17:00',
    activity: 'Supervisar el local de Elaboración – CEPRU',
    location: 'Local de Elaboración'
  },
  {
    id: 'g21',
    group: 'RECTOR',
    date: 'Viernes 06 de Febrero de 2026',
    time: '17:30 a 18:00',
    activity: 'Supervisar el ingreso del personal de elaboración',
    location: 'Puerta del local de Elaboración - CEPRU'
  },
  {
    id: 'g22',
    group: 'RECTOR',
    date: 'Sábado 07 de Febrero de 2026',
    time: '05:30',
    activity: 'Ingreso a la Ciudad Universitaria y coordinación de apertura de la Puerta N° 5',
    location: 'Puerta N° 5'
  },
  {
    id: 'g23',
    group: 'RECTOR',
    date: 'Sábado 07 de Febrero de 2026',
    time: '06:00',
    activity: 'Apertura de puerta para ingreso de Decanos, Autoridades, personal Docente y Administrativo',
    location: 'Puerta N° 5'
  },
  {
    id: 'g24',
    group: 'RECTOR',
    date: 'Sábado 07 de Febrero de 2026',
    time: '06:30',
    activity: 'Asistir a charla de Inducción de Jurados Receptores',
    location: 'Auditorio de la Facultad de Ciencias Sociales'
  },
  {
    id: 'g25',
    group: 'RECTOR',
    date: 'Sábado 07 de Febrero de 2026',
    time: '07:30',
    activity: 'Apertura de las 4 puertas principales para ingreso de postulantes',
    location: 'Puertas principales'
  },
  {
    id: 'g26',
    group: 'RECTOR',
    date: 'Sábado 07 de Febrero de 2026',
    time: '09:30',
    activity: 'Disponer cierre definitivo de puertas de ingreso al campus universitario',
    location: 'Puertas del campus'
  },
  {
    id: 'g27',
    group: 'RECTOR',
    date: 'Sábado 07 de Febrero de 2026',
    time: '10:00',
    activity: 'Recepción de cuadernillos de preguntas de la sala de Elaboración en CEPRU',
    location: 'Local CEPRU'
  },
  {
    id: 'g28',
    group: 'RECTOR',
    date: 'Sábado 07 de Febrero de 2026',
    time: '12:45',
    activity: 'Apertura de sala de Elaboración para salida de personal de elaboración',
    location: 'Local CEPRU'
  },
  {
    id: 'g29',
    group: 'RECTOR',
    date: 'Sábado 07 de Febrero de 2026',
    time: '13:00',
    activity: 'Dirigirse al Centro de Cómputo para la recepción de Tarjetas OMR para la calificación y publicación',
    location: 'Centro de Cómputo'
  },
  {
    id: 'g30',
    group: 'DECANOS Y OTRAS AUTORIDADES',
    date: 'Sábado 07 de Febrero de 2026',
    time: '06:00 a 06:30',
    activity: 'Ingreso a la Ciudad Universitaria de Perayoc',
    location: 'Puerta N° 5'
  },
  {
    id: 'g31',
    group: 'FUNCIONARIOS Y PERSONAL ADMINISTRATIVO',
    date: 'Sábado 07 de Febrero de 2026',
    time: '06:00 a 06:30',
    activity: 'Ingreso a la Ciudad Universitaria de Perayoc',
    location: 'Puerta N° 5'
  },
  {
    id: 'g32',
    group: 'FUNCIONARIOS Y PERSONAL ADMINISTRATIVO',
    date: 'Sábado 07 de Febrero de 2026',
    time: '07:20 a 09:30',
    activity: 'Ubicación de labores encomendadas por la Dirección de Admisión (control, orientación, etc.)',
    location: 'Zonas y puertas asignadas'
  },
  {
    id: 'g33',
    group: 'PERSONAL DE CONTROL DE PUERTAS',
    date: 'Sábado 07 de Febrero de 2026',
    time: '06:00 a 06:30',
    activity: 'Ingreso a la Ciudad Universitaria (Identificación de postulantes, camarógrafos y perifonistas)',
    location: 'Puertas asignadas'
  },
  {
    id: 'g34',
    group: 'PERSONAL DE CONTROL DE PUERTAS',
    date: 'Sábado 07 de Febrero de 2026',
    time: '06:30 a 07:15',
    activity: 'Instalación de equipos de cómputo de control, cámaras, equipos de sonido bajo responsabilidad',
    location: 'Puertas de ingreso'
  },
  {
    id: 'g35',
    group: 'PERSONAL DE CONTROL DE PUERTAS',
    date: 'Sábado 07 de Febrero de 2026',
    time: '07:30 a 09:30',
    activity: 'Revisar, identificar y controlar el ingreso de postulantes en las puertas asignadas',
    location: 'Puertas de ingreso'
  }
];

// Helper to convert date strings to a numeric timestamp for sorting
const parseDateStringToValue = (dateStr: string): number => {
  if (!dateStr) return 0;
  
  // Format: "Día DD de Mes de YYYY" (e.g., "Miércoles 04 de Febrero de 2026")
  const regex = /(\d+)\s+de\s+(\w+)\s+de\s+(\d+)/i;
  const match = dateStr.match(regex);
  if (match) {
    const day = parseInt(match[1], 10);
    const monthName = match[2].toLowerCase();
    const year = parseInt(match[3], 10);
    
    const months: Record<string, number> = {
      enero: 0, febrero: 1, marzo: 2, abril: 3, mayo: 4, junio: 5,
      julio: 6, agosto: 7, septiembre: 8, octubre: 9, noviembre: 10, diciembre: 11
    };
    
    const month = months[monthName] !== undefined ? months[monthName] : 0;
    return new Date(year, month, day).getTime();
  }
  
  // fallback: try to find any number in the string
  const numMatch = dateStr.match(/\d+/);
  if (numMatch) {
    return parseInt(numMatch[0], 10);
  }
  return 0;
};

// Helper to convert time ranges or strings to minutes for sorting
const parseTimeStringToValue = (timeStr: string): number => {
  if (!timeStr) return 0;
  const match = timeStr.match(/(\d+):(\d+)/);
  if (match) {
    const hours = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);
    return hours * 60 + minutes;
  }
  return 0;
};

// Sort events chronologically by date first, then by time
const sortEvents = (events: any[]): any[] => {
  return [...events].sort((a, b) => {
    const dateA = parseDateStringToValue(a.date || '');
    const dateB = parseDateStringToValue(b.date || '');
    if (dateA !== dateB) return dateA - dateB;
    
    const timeA = parseTimeStringToValue(a.time || '');
    const timeB = parseTimeStringToValue(b.time || '');
    return timeA - timeB;
  });
};

export const ExamBudget: React.FC<ExamBudgetProps> = ({ user, notify }) => {
  const [view, setView] = useState<'dashboard' | 'editor'>('dashboard');
  const [activeTab, setActiveTab] = useState<'Presupuesto' | 'CronogramaGeneral' | 'Cronograma'>('Presupuesto');
  const [generalSchedules, setGeneralSchedules] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isExportingPdf, setIsExportingPdf] = useState(false);

  const safeConfirm = (message: string): boolean => {
    try {
      const isIframe = window.self !== window.top;
      if (isIframe) {
        return true;
      }
      return window.confirm(message);
    } catch (e) {
      return true;
    }
  };
  
  const [cuadros, setCuadros] = useState<any[]>([]);
  const [modalidades, setModalidades] = useState<any[]>([]);
  const [savedBudgets, setSavedBudgets] = useState<ExamBudgetRecord[]>([]);
  
  const [currentBudget, setCurrentBudget] = useState<ExamBudgetRecord | null>(null);

  // Editor states
  const [selectedCuadro, setSelectedCuadro] = useState<string>('');
  const [selectedModalidad, setSelectedModalidad] = useState<string>('');
  const [budgetItems, setBudgetItems] = useState<BudgetRole[]>([]);
  const rolesWithStaff = useMemo(() => {
    return budgetItems.filter(i => i.quantity > 0 && i.role.trim() !== '' && (i.condition === 'D' || i.condition === 'A'));
  }, [budgetItems]);
  const [roleSchedules, setRoleSchedules] = useState<RoleSchedule[]>([]);
  const [isLocked, setIsLocked] = useState(false);

  // Add Item Modal states
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [tempCuadro, setTempCuadro] = useState('');
  const [tempModalidad, setTempModalidad] = useState('');
  const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>({});
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newItemCategory, setNewItemCategory] = useState('');
  const [newItemSubcategory, setNewItemSubcategory] = useState('');

  // Add Event to Role Modal states
  const [showAddEventModal, setShowAddEventModal] = useState(false);
  const [activeRoleForAddEvent, setActiveRoleForAddEvent] = useState<string>('');
  const [isCustomDate, setIsCustomDate] = useState(false);
  const [addEventSource, setAddEventSource] = useState<'custom' | 'general'>('custom');
  const [selectedGeneralGroup, setSelectedGeneralGroup] = useState<string>('');
  const [selectedGeneralActivityId, setSelectedGeneralActivityId] = useState<string>('');
  const [newEventForm, setNewEventForm] = useState({
    date: 'Sábado 07 de Febrero de 2026',
    time: '08:00',
    activity: '',
    location: ''
  });

  // AI Instructive states
  const [showInstructiveModal, setShowInstructiveModal] = useState(false);
  const [isGeneratingInstructive, setIsGeneratingInstructive] = useState(false);
  const [instructiveRole, setInstructiveRole] = useState('');
  const [instructiveText, setInstructiveText] = useState('');
  const [isSavingInstructivePdf, setIsSavingInstructivePdf] = useState(false);

  const openInstructiveModal = (roleName: string) => {
    setInstructiveRole(roleName);
    setShowInstructiveModal(true);
    
    const schedule = getScheduleForRole(roleName);
    const modalName = getModalidadName(selectedModalidad);
    const cuadroName = getCuadroName(selectedCuadro);
    
    // Sort events chronologically: First by day of month, then by hour/minute
    const sortedEvents = [...schedule.events].sort((a: any, b: any) => {
      const getDayNum = (dateStr: string) => {
        const match = dateStr.match(/(\d+)/);
        return match ? parseInt(match[1], 10) : 99;
      };
      const getTimeParts = (timeStr: string) => {
        const match = timeStr.match(/(\d+)[:.](\d+)/);
        return match ? { h: parseInt(match[1], 10), m: parseInt(match[2], 10) } : { h: 0, m: 0 };
      };
      const dayA = getDayNum(a.date || '');
      const dayB = getDayNum(b.date || '');
      if (dayA !== dayB) return dayA - dayB;
      const tA = getTimeParts(a.time || '');
      const tB = getTimeParts(b.time || '');
      if (tA.h !== tB.h) return tA.h - tB.h;
      return tA.m - tB.m;
    });

    let activitiesTable = '';
    if (sortedEvents.length > 0) {
      activitiesTable = `| FECHA | HORARIO | ACTIVIDAD / FUNCIÓN OFICIAL | LUGAR ASIGNADO |\n| :--- | :--- | :--- | :--- |\n` + 
        sortedEvents.map((ev: any) => {
          return `| ${ev.date || 'Sin Fecha'} | \`${ev.time || 'Sin Hora'}\` | ${ev.activity || ''} | ${ev.location || 'Sin Ubicación'} |`;
        }).join('\n');
    } else {
      activitiesTable = '*No hay actividades o tareas específicas programadas oficialmente aún para este rol operativo.*';
    }

    const baseTemplate = `# INSTRUCTIVO OFICIAL DE FUNCIONES Y PROTOCOLO DE ADMISIÓN

**DOCUMENTO OFICIAL DE ADMISIÓN UNSAAC**
**ÓRGANO DESIGNADOR:** Dirección de Admisión
**CARGO OPERATIVO:** ${roleName.toUpperCase()}
**PROCESO ACADÉMICO:** Examen de Admisión
**MODALIDAD DE INGRESO:** ${modalName} (${cuadroName})

---

## 1. PRESENTACIÓN Y MARCO INSTITUCIONAL
La Universidad Nacional de San Antonio Abad del Cusco (UNSAAC), a través de su Dirección de Admisión, promulga el presente documento de asignación de funciones con carácter vinculante y de estricto cumplimiento obligatorio para todo el personal designado bajo el cargo operativo de **${roleName}**.

Este rol reviste una responsabilidad civil, administrativa y de seguridad de primer orden en la salvaguarda de la transparencia, la idoneidad y la legalidad del proceso de selección. Todo miembro de la comisión operativa está sujeto a los principios de probidad, reserva extrema y ética pública con arreglo a ley.

---

## 2. CRONOGRAMA DE ACTIVIDADES Y CUADRO DE HORARIOS OFICIALES
El cumplimiento del siguiente cronograma es de carácter obligatorio, improrrogable e indelegable. El personal asignado deberá presentarse puntualmente en las fechas, horarios y ubicaciones detallados en el siguiente cuadro oficial:

${activitiesTable}

---

## 3. DEBERES, OBLIGACIONES Y PROHIBICIONES GENERALES DEL PERSONAL
El personal operativo en ejercicio de sus funciones debe cumplir rigurosamente las siguientes disposiciones bajo apercibimiento de sanción:
1. **Puntualidad Absoluta:** Concurrir con antelación obligatoria a los lugares indicados en el cronograma. El ingreso al campus estará restringido estrictamente fuera del horario establecido.
2. **Presentación e Identificación:** Mantener la credencial oficial proporcionada por la Dirección de Admisión colocada de forma visible sobre el pecho en todo momento, acompañada del DNI físico. Se exige vestimenta formal e idónea.
3. **PROHIBICIÓN ABSOLUTA DE DISPOSITIVOS ELECTRÓNICOS:** Queda terminantemente prohibido portar, usar o mantener encendidos teléfonos celulares, relojes inteligentes (smartwatches), tablets, laptops, audífonos o cualquier equipo analógico o digital de transmisión o captura de datos. Su sola posesión dentro del recinto del examen será causal de retiro inmediato, sanción administrativa y denuncia legal según corresponda.
4. **Reserva y Confidencialidad:** Guardar reserva extrema y confidencialidad absoluta sobre los detalles del proceso de evaluación, material del examen o pormenores logísticos.
5. **No Abandono:** Queda prohibido ausentarse del puesto o aula de asignación sin la autorización expresa del Coordinador de Pabellón respectivo.

---

## 4. PROTOCOLO DE ACTUACIÓN ANTE INCIDENCIAS Y EMERGENCIAS
En caso de eventualidades durante el desarrollo de la prueba, se procederá bajo el siguiente protocolo institucional:
* **Detección de Copia, Suplantación o Fraude:** Manteniendo la calma y sin alterar el orden del aula o sector, informe de manera reservada e inmediata al **Coordinador de Pabellón** o personal de seguridad para que tomen el control y elaboren la respectiva acta oficial.
* **Inconsistencia de Materiales:** Ante faltantes o fallas en el número de folios, cuadernillos o fichas ópticas OMR asignadas, repórtelo inmediatamente al Supervisor para la debida subsanación antes del inicio oficial de la evaluación.
* **Emergencias de Salud:** Si se suscita una emergencia médica con algún postulante, avise en el acto al personal de salud y ambulancia asignados al sector, priorizando la calma y sin descuidar el control del aula de evaluación.
`;

    setInstructiveText(baseTemplate);
  };

  const improveInstructiveWithAI = async () => {
    setIsGeneratingInstructive(true);
    try {
      const promptText = `
Eres la Inteligencia Artificial oficial de la Oficina de Admisión de la Universidad Nacional de San Antonio Abad del Cusco (UNSAAC).
Tu tarea es tomar el borrador del "INSTRUCTIVO OFICIAL DE FUNCIONES" provisto y refinarlo, expandirlo o mejorarlo para que tenga una redacción EXTREMADAMENTE FORMAL, INSTITUCIONAL, RIGUROSA Y DETALLADA, propicia para un proceso oficial de admisión en Cusco.

BORRADOR ACTUAL DEL DOCUMENTO:
${instructiveText}

REGLAS DE REFINAMIENTO (OBLIGATORIAS):
1. Redacta en un tono sumamente formal, oficial, legal y administrativo, representativo de la Dirección de Admisión de la UNSAAC.
2. Utiliza una excelente sintaxis, vocabulario técnico-jurídico-administrativo (ej. "en estricta salvaguarda", "bajo apercibimiento de sanción", "con arreglo a ley", "bajo responsabilidad civil y administrativa").
3. MANTÉN ESTRICTAMENTE EL FORMATO DE TABLA/CUADRO CRONOLÓGICO: El cronograma de actividades DEBE mantenerse estrictamente estructurado en formato de Tabla de Markdown con las columnas correspondientes (| FECHA | HORARIO | ACTIVIDAD / FUNCIÓN OFICIAL | LUGAR ASIGNADO |). No lo destruyas ni lo conviertas en texto plano.
4. NO ADIVINES NI INVENTES ACTIVIDADES: Limítate estrictamente a las actividades y horarios reales que ya figuran en la tabla actual del borrador, sin añadir tareas ficticias o fechas imaginarias.
5. El resultado final debe conservar únicamente el texto Markdown refinado. Evita cualquier tipo de saludo, aclaración o comentario informal antes o después del texto.
6. NO MENCIONES NI INCLUYAS a 'Vicerrectorado Académico' como órgano designador o emisor principal; el único órgano oficial emisor del instructivo debe ser la Dirección de Admisión de la UNSAAC.
`;

      const res = await fetch('/api/gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          input: promptText,
          model: 'gemini-2.5-flash',
          config: {
            temperature: 0.25,
            maxOutputTokens: 8192,
          }
        })
      });

      const resData = await res.json();
      if (!res.ok) {
        throw new Error(resData.error || "Error en la respuesta de la IA.");
      }

      let resText = resData.text || '';
      resText = resText.replace(/^```[a-z]*\n?/gm, '').replace(/```$/gm, '').trim();
      setInstructiveText(resText);
      notify?.('¡Instructivo personalizado con IA exitosamente!', 'success');
    } catch (err: any) {
      console.error('Error refinando instructivo con IA:', err);
      notify?.('Error al conectar con la IA: ' + err.message, 'error');
    } finally {
      setIsGeneratingInstructive(false);
    }
  };

  const handlePrintInstructivePdf = async () => {
    setIsSavingInstructivePdf(true);
    notify?.('Generando PDF oficial del instructivo...', 'info');

    setTimeout(async () => {
      try {
        const element = document.getElementById('role-instructive-pdf-area');
        if (!element) {
          throw new Error('No se encontró el área de impresión del instructivo');
        }

        const html2pdf = await new Promise<any>((resolve, reject) => {
          if ((window as any).html2pdf) {
            resolve((window as any).html2pdf);
            return;
          }
          const script = document.createElement('script');
          script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
          script.onload = () => resolve((window as any).html2pdf);
          script.onerror = () => reject(new Error('No se pudo cargar la librería de exportación de PDF.'));
          document.head.appendChild(script);
        });

        const cleanRoleName = instructiveRole.replace(/[^a-zA-Z0-9]/g, '_');
        const cleanModalidadName = getModalidadName(selectedModalidad).replace(/[^a-zA-Z0-9]/g, '_');
        const fileName = `Instructivo_Oficial_${cleanRoleName}_${cleanModalidadName}.pdf`;

        const opt = {
          margin:       [0.5, 0.5, 0.5, 0.5],
          filename:     fileName,
          image:        { type: 'jpeg', quality: 0.98 },
          html2canvas:  { 
            scale: 2, 
            useCORS: true, 
            logging: false,
            letterRendering: true
          },
          jsPDF:        { unit: 'in', format: 'letter', orientation: 'portrait' },
          pagebreak:    { mode: ['css', 'legacy'] }
        };

        await html2pdf().set(opt).from(element).save();
        notify?.('¡Instructivo de Rol descargado exitosamente!', 'success');
      } catch (err: any) {
        console.error('Error generando PDF de instructivo:', err);
        notify?.('Error al exportar a PDF: ' + err.message, 'error');
      } finally {
        setIsSavingInstructivePdf(false);
      }
    }, 400);
  };

  useEffect(() => {
    fetchConfig();
    loadSavedBudgets();
  }, []);

  useEffect(() => {
    if (currentBudget) {
      const locked = (currentBudget as any).is_locked || localStorage.getItem(`unsaac_budget_locked_${currentBudget.id}`) === 'true';
      setIsLocked(locked);
    } else {
      setIsLocked(false);
    }
  }, [currentBudget]);

  useEffect(() => {
    if (activeTab === 'Cronograma' && generalSchedules.length > 0) {
      setRoleSchedules(prev => {
        let changed = false;
        const updated = [...prev];

        rolesWithStaff.forEach(role => {
          const existing = updated.find(s => s.roleName === role.role);
          if (!existing || existing.events.length === 0) {
            changed = true;
            const normRole = role.role.toLowerCase();
            const matchedEvents = generalSchedules.filter(ev => {
              const group = (ev.group || '').toLowerCase();
              if (group === normRole) return true;
              if (normRole.includes(group) || group.includes(normRole)) return true;
              if (group.includes('jurado') && (normRole.includes('jurado') || normRole.includes('receptor'))) return true;
              if (group.includes('tarjeta') && normRole.includes('tarjeta')) return true;
              if (group.includes('planta') && (normRole.includes('planta') || normRole.includes('carpetero'))) return true;
              if (group.includes('rector') && normRole.includes('rector')) return true;
              if (group.includes('puerta') && (normRole.includes('puerta') || normRole.includes('control de puerta'))) return true;
              if (group.includes('autoridades') && (normRole.includes('decano') || normRole.includes('autoridad') || normRole.includes('autoridades'))) return true;
              if (group.includes('administrativo') && (normRole.includes('administrativo') || normRole.includes('funcionarios'))) return true;
              return false;
            });

            const newEvents = matchedEvents.map(ev => ({
              id: crypto.randomUUID(),
              date: ev.date || '',
              time: ev.time || '',
              activity: ev.activity || '',
              location: ev.location || ''
            }));

            const sortedEvents = sortEvents(newEvents);

            if (existing) {
              existing.events = sortedEvents;
            } else {
              updated.push({
                id: crypto.randomUUID(),
                roleName: role.role,
                events: sortedEvents
              });
            }
          }
        });

        return changed ? updated : prev;
      });
    }
  }, [activeTab, generalSchedules, rolesWithStaff]);

  const toggleLock = async () => {
    if (!currentBudget) return;
    const newLock = !isLocked;
    setIsLocked(newLock);
    
    try {
      await supabase.from('cv_exam_budgets').update({ is_locked: newLock }).eq('id', currentBudget.id);
    } catch (e) {
      console.error(e);
    }
    
    localStorage.setItem(`unsaac_budget_locked_${currentBudget.id}`, String(newLock));
    notify?.(newLock ? 'Presupuesto bloqueado' : 'Presupuesto desbloqueado', 'info');
  };

  const fetchConfig = async () => {
    setIsLoading(true);
    try {
      const [cuadrosRes, modalidadesRes] = await Promise.all([
        supabase.from('cv_cuadros_anuales').select('*').order('created_at', { ascending: false }),
        supabase.from('cv_modalidades').select('*')
      ]);

      if (cuadrosRes.data) setCuadros(cuadrosRes.data);
      if (modalidadesRes.data) setModalidades(modalidadesRes.data);
    } catch (error) {
      console.error(error);
    }
    setIsLoading(false);
  };

  const addGeneralScheduleEvent = (groupName?: string) => {
    if (isLocked) return;
    const newEvent = {
      id: crypto.randomUUID(),
      group: groupName || 'HORARIOS GENERALES DEL EXAMEN',
      date: 'Sábado 07 de Febrero de 2026',
      time: '08:00',
      activity: 'Nueva actividad',
      location: 'Ciudad Universitaria'
    };
    setGeneralSchedules([...generalSchedules, newEvent]);
    notify?.('Nueva actividad agregada al cronograma general', 'success');
  };

  const updateGeneralScheduleEvent = (id: string, field: string, value: any) => {
    if (isLocked) return;
    setGeneralSchedules(
      generalSchedules.map(ev => ev.id === id ? { ...ev, [field]: value } : ev)
    );
  };

  const deleteGeneralScheduleEvent = (id: string) => {
    if (isLocked) return;
    setGeneralSchedules(generalSchedules.filter(ev => ev.id !== id));
    notify?.('Actividad eliminada del cronograma general', 'info');
  };

  const loadGeneralScheduleTemplate = () => {
    if (isLocked) return;
    if (safeConfirm('¿Está seguro de cargar la plantilla? Esto reemplazará el cronograma general actual.')) {
      setGeneralSchedules(INITIAL_GENERAL_SCHEDULE);
      notify?.('Plantilla de cronograma general cargada con éxito', 'success');
    }
  };

  const loadSavedBudgets = async () => {
    try {
      const { data, error } = await supabase.from('cv_exam_budgets').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      if (data && data.length > 0) {
        setSavedBudgets(data);
      } else {
        // Fallback to local storage if empty or table doesn't exist yet
        const localData = localStorage.getItem('exam_budgets');
        if (localData && localData !== 'undefined' && localData !== 'null') {
          try {
            setSavedBudgets(JSON.parse(localData));
          } catch (e) {
            console.error('Error parsing local exam_budgets:', e);
          }
        }
      }
    } catch (error) {
      console.error('Error loading budgets from Supabase:', error);
      const localData = localStorage.getItem('exam_budgets');
      if (localData && localData !== 'undefined' && localData !== 'null') {
        try {
          setSavedBudgets(JSON.parse(localData));
        } catch (e) {
          console.error('Error parsing local exam_budgets fallback:', e);
        }
      }
    }
  };

  const persistBudgets = (budgets: ExamBudgetRecord[]) => {
    localStorage.setItem('exam_budgets', JSON.stringify(budgets));
    setSavedBudgets(budgets);
  };

  const handleCreateNew = () => {
    setTempCuadro('');
    setTempModalidad('');
    setIsCreateModalOpen(true);
  };

  const confirmCreateNew = () => {
    if (!tempCuadro || !tempModalidad) {
      notify?.('Debe seleccionar un Cuadro Anual y una Modalidad', 'warning');
      return;
    }
    setCurrentBudget(null);
    setSelectedCuadro(tempCuadro);
    setSelectedModalidad(tempModalidad);
    setBudgetItems([]);
    setRoleSchedules([]);
    setGeneralSchedules(INITIAL_GENERAL_SCHEDULE);
    setActiveTab('Presupuesto');
    setView('editor');
    setIsCreateModalOpen(false);
  };

  const handleEditBudget = (budget: ExamBudgetRecord) => {
    setCurrentBudget(budget);
    setSelectedCuadro(budget.cuadro_anual_id);
    setSelectedModalidad(budget.modalidad_id);
    setBudgetItems(budget.items || []);
    setRoleSchedules(budget.schedules || []);
    setGeneralSchedules(budget.general_schedule || INITIAL_GENERAL_SCHEDULE);
    setActiveTab('Presupuesto');
    setView('editor');
  };

  const handleDeleteBudget = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (safeConfirm('¿Está seguro de eliminar este presupuesto?')) {
      try {
        const { error } = await supabase.from('cv_exam_budgets').delete().eq('id', id);
        if (error) throw error;
        
        setSavedBudgets(savedBudgets.filter(b => b.id !== id));
        notify?.('Presupuesto eliminado', 'success');
      } catch (error) {
        console.error(error);
        const updated = savedBudgets.filter(b => b.id !== id);
        localStorage.setItem('exam_budgets', JSON.stringify(updated));
        setSavedBudgets(updated);
        notify?.('Presupuesto eliminado localmente', 'success');
      }
    }
  };

  const saveCurrentBudget = async () => {
    if (!selectedCuadro || !selectedModalidad) {
      notify?.('Seleccione un cuadro y modalidad antes de guardar', 'warning');
      return;
    }
    
    const total_general = budgetItems.reduce((acc, item) => acc + item.total, 0);

    const record = {
      id: currentBudget ? currentBudget.id : crypto.randomUUID(),
      cuadro_anual_id: selectedCuadro,
      modalidad_id: selectedModalidad,
      items: budgetItems,
      total_general,
      schedules: roleSchedules,
      general_schedule: generalSchedules,
      is_locked: isLocked,
      updated_at: new Date().toISOString()
    };
    
    if (!currentBudget) {
      (record as any).created_at = new Date().toISOString();
    }

    try {
      const { error } = await supabase.from('cv_exam_budgets').upsert(record);
      if (error) throw error;
      
      notify?.('Presupuesto y cronograma guardados exitosamente', 'success');
      loadSavedBudgets();
      
      setCurrentBudget({ ...currentBudget, ...record } as ExamBudgetRecord);
    } catch (error: any) {
      console.error('Error saving budget to Supabase:', error);
      notify?.('Guardado localmente. La tabla en base de datos podría no existir aún.', 'info');
      
      const fallbackRecord: ExamBudgetRecord = {
        ...record,
        created_at: currentBudget ? currentBudget.created_at : new Date().toISOString()
      };
      
      let newBudgets = [...savedBudgets];
      if (currentBudget) {
        newBudgets = newBudgets.map(b => b.id === fallbackRecord.id ? fallbackRecord : b);
      } else {
        newBudgets.push(fallbackRecord);
      }
      localStorage.setItem('exam_budgets', JSON.stringify(newBudgets));
      setSavedBudgets(newBudgets);
      setCurrentBudget(fallbackRecord);
    }
  };

  const handlePrint = async () => {
    setIsExportingPdf(true);
    notify?.('Generando PDF oficial con los logos institucionales de admisión... espere un momento.', 'info');
    
    // Dejar un tiempo corto para que el DOM de React se actualice con isExportingPdf = true
    setTimeout(async () => {
      try {
        const element = document.getElementById('exam-budget-print-area');
        if (!element) {
          throw new Error('No se encontró el contenedor de impresión');
        }

        // Cargar dinámicamente html2pdf.js desde cdnjs
        const html2pdf = await new Promise<any>((resolve, reject) => {
          if ((window as any).html2pdf) {
            resolve((window as any).html2pdf);
            return;
          }
          const script = document.createElement('script');
          script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
          script.onload = () => resolve((window as any).html2pdf);
          script.onerror = () => reject(new Error('No se pudo cargar la librería de exportación de PDF.'));
          document.head.appendChild(script);
        });

        const activeTitle = activeTab === 'Presupuesto' ? 'Presupuesto' : (activeTab === 'CronogramaGeneral' ? 'Cronograma_General' : 'Instructivos_por_Rol');
        const cleanModalidadName = getModalidadName(selectedModalidad).replace(/[^a-zA-Z0-9]/g, '_');
        const fileName = `UNSAAC_Admision_${activeTitle}_${cleanModalidadName}.pdf`;

        const opt = {
          margin:       [0.4, 0.4, 0.4, 0.4], // 0.4 inch margin all sides for professional fit
          filename:     fileName,
          image:        { type: 'jpeg', quality: 0.98 },
          html2canvas:  { 
            scale: 2, 
            useCORS: true, 
            logging: false,
            letterRendering: true
          },
          jsPDF:        { unit: 'in', format: 'letter', orientation: 'portrait' },
          pagebreak:    { mode: ['avoid-all', 'css', 'legacy'] }
        };

        // Generar y descargar el PDF
        await html2pdf().set(opt).from(element).save();
        notify?.('¡PDF oficial descargado exitosamente!', 'success');
      } catch (err: any) {
        console.error('Error generando PDF:', err);
        notify?.('Error al exportar a PDF: ' + err.message + '. Abriendo diálogo de impresión estándar...', 'warning');
        window.focus();
        window.print();
      } finally {
        setIsExportingPdf(false);
      }
    }, 400);
  };

  const loadTemplate = () => {
    if (isLocked) return;
    
    const template: BudgetRole[] = initialRoles.map(role => ({
      ...role,
      id: crypto.randomUUID(),
      unit_cost: role.indicator > 0 && role.indicator <= 1.0 ? Number((MAX_PAYMENT * role.indicator).toFixed(2)) : role.unit_cost,
      total: role.indicator > 0 && role.indicator <= 1.0 ? Number((role.quantity * MAX_PAYMENT * role.indicator).toFixed(2)) : role.total
    }));
    
    setBudgetItems(template);
    notify?.('Plantilla cargada exitosamente', 'success');
  };

  const confirmAddItem = () => {
    if (isLocked) return;
    setBudgetItems([...budgetItems, { 
      id: crypto.randomUUID(), 
      rubro: '', 
      category: newItemCategory, 
      subcategory: newItemSubcategory, 
      role: '', 
      condition: '', 
      indicator: 0, 
      quantity: 1, 
      unit_cost: 0, 
      total: 0 
    }]);
    setIsAddModalOpen(false);
    setNewItemCategory('');
    setNewItemSubcategory('');
  };

  const updateBudgetItem = (id: string, field: keyof BudgetRole, value: string | number) => {
    if (isLocked) return;
    setBudgetItems(items => items.map(item => {
      if (item.id === id) {
        const updated = { ...item, [field]: value };
        if (field === 'indicator') {
          updated.unit_cost = Number((MAX_PAYMENT * Number(updated.indicator)).toFixed(2));
        }
        updated.total = Number((Number(updated.quantity) * Number(updated.unit_cost)).toFixed(2));
        return updated;
      }
      return item;
    }));
  };

  const removeBudgetItem = (id: string) => {
    if (isLocked) return;
    setBudgetItems(items => items.filter(i => i.id !== id));
  };

  const totalGeneral = budgetItems.reduce((acc, item) => acc + item.total, 0);
  const totalPersonal = budgetItems.reduce((acc, item) => (item.condition === 'D' || item.condition === 'A') ? acc + item.quantity : acc, 0);

  const getScheduleForRole = (roleName: string): RoleSchedule => {
    // 1. Obtener la personalización guardada del rol (si existe)
    const savedRoleSchedule = roleSchedules.find(s => s.roleName === roleName);
    
    // 2. Filtrar eventos del Cronograma General que pertenecen a este rol por nombre de grupo
    const normRole = roleName.toLowerCase();
    const matchedGeneralEvents = generalSchedules.filter(ev => {
      const group = (ev.group || '').toLowerCase();
      if (group === normRole) return true;
      if (normRole.includes(group) || group.includes(normRole)) return true;
      if (group.includes('jurado') && (normRole.includes('jurado') || normRole.includes('receptor'))) return true;
      if (group.includes('tarjeta') && normRole.includes('tarjeta')) return true;
      if (group.includes('planta') && (normRole.includes('planta') || normRole.includes('carpetero'))) return true;
      if (group.includes('rector') && normRole.includes('rector')) return true;
      if (group.includes('puerta') && (normRole.includes('puerta') || normRole.includes('control de puerta'))) return true;
      if (group.includes('autoridades') && (normRole.includes('decano') || normRole.includes('autoridad') || normRole.includes('autoridades'))) return true;
      if (group.includes('administrativo') && (normRole.includes('administrativo') || normRole.includes('funcionarios'))) return true;
      return false;
    });
    // 3. Mapear los eventos generales inyectando sobreescrituras locales ("overrides")
    const resolvedEvents = matchedGeneralEvents.map(baseEv => {
      const override = savedRoleSchedule?.events.find(e => e.baseEventId === baseEv.id);
      
      return {
        id: override ? override.id : baseEv.id,
        baseEventId: baseEv.id,
        date: override?.date || baseEv.date || '',
        time: override?.time || baseEv.time || '',
        activity: override?.activity || baseEv.activity || '',
        location: override?.location || baseEv.location || '',
        isOverride: !!override
      };
    });
    // 4. Agregar eventos 100% personalizados creados en este rol (que no vienen del cronograma general)
    const customOnlyEvents = savedRoleSchedule?.events.filter(e => !e.baseEventId) || [];
    
    // Unificar y ordenar de forma cronológica
    const allEvents = sortEvents([...resolvedEvents, ...customOnlyEvents]);
    return {
      id: savedRoleSchedule?.id || crypto.randomUUID(),
      roleName,
      events: allEvents,
      instructiveText: savedRoleSchedule?.instructiveText || ''
    };
  };

  const addEventToRole = (roleName: string) => {
    if (isLocked) return;
    setActiveRoleForAddEvent(roleName);
    
    // Try to find a default date from existing events of this role
    const existing = roleSchedules.find(s => s.roleName === roleName);
    const defaultDate = existing?.events?.[0]?.date || 'Sábado 07 de Febrero de 2026';
    
    setNewEventForm({
      date: defaultDate,
      time: '08:00',
      activity: '',
      location: ''
    });
    setIsCustomDate(false);
    setAddEventSource('custom');
    setSelectedGeneralGroup('');
    setSelectedGeneralActivityId('');
    setShowAddEventModal(true);
  };

  const saveNewEvent = () => {
    if (!newEventForm.activity.trim()) {
      notify?.('La actividad es obligatoria', 'warning');
      return;
    }
    
    setRoleSchedules(prev => {
      const existing = prev.find(s => s.roleName === activeRoleForAddEvent);
      const newEvent: ScheduleEvent = {
        id: crypto.randomUUID(),
        date: newEventForm.date,
        time: newEventForm.time,
        activity: newEventForm.activity,
        location: newEventForm.location
      };
      
      if (existing) {
        const updatedEvents = sortEvents([...existing.events, newEvent]);
        return prev.map(s => s.roleName === activeRoleForAddEvent ? { ...s, events: updatedEvents } : s);
      } else {
        const updatedEvents = [newEvent];
        return [...prev, { id: crypto.randomUUID(), roleName: activeRoleForAddEvent, events: updatedEvents }];
      }
    });
    
    setShowAddEventModal(false);
    notify?.('Actividad agregada exitosamente', 'success');
  };

  const handleSelectGeneralActivity = (activityId: string) => {
    setSelectedGeneralActivityId(activityId);
    const act = generalSchedules.find(g => g.id === activityId);
    if (act) {
      setNewEventForm({
        date: act.date || '',
        time: act.time || '',
        activity: act.activity || '',
        location: act.location || ''
      });
      const uniqueScheduleDates = Array.from(new Set(generalSchedules.map(ev => ev.date).filter(Boolean))) as string[];
      if (!uniqueScheduleDates.includes(act.date)) {
        setIsCustomDate(true);
      } else {
        setIsCustomDate(false);
      }
    }
  };

  const updateEvent = (roleName: string, eventId: string, field: keyof ScheduleEvent, value: string) => {
    if (isLocked) return;
    setRoleSchedules(prev => {
      const roleSchedule = prev.find(s => s.roleName === roleName);
      
      if (roleSchedule) {
        // Buscar si el evento ya existe en las sobreescrituras
        const existingEvent = roleSchedule.events.find(e => e.id === eventId || e.baseEventId === eventId);
        
        let updatedEvents;
        if (existingEvent) {
          // Si ya existe la sobreescritura, la actualizamos
          updatedEvents = roleSchedule.events.map(e => 
            (e.id === eventId || e.baseEventId === eventId) ? { ...e, [field]: value } : e
          );
        } else {
          // Si es la primera vez que se edita el evento general desde este rol:
          // Obtenemos los valores base y creamos el registro de sobreescritura (override)
          const baseEv = generalSchedules.find(g => g.id === eventId);
          const newOverride: ScheduleEvent = {
            id: crypto.randomUUID(),
            baseEventId: eventId,
            date: baseEv?.date || '',
            time: baseEv?.time || '',
            activity: baseEv?.activity || '',
            location: baseEv?.location || '',
            [field]: value // Sobreescribimos el campo editado
          };
          updatedEvents = [...roleSchedule.events, newOverride];
        }
        
        return prev.map(s => s.roleName === roleName ? { ...s, events: updatedEvents } : s);
      } else {
        // Si el rol no tenía ninguna personalización previa, inicializamos el objeto
        const baseEv = generalSchedules.find(g => g.id === eventId);
        const newOverride: ScheduleEvent = {
          id: crypto.randomUUID(),
          baseEventId: eventId,
          date: baseEv?.date || '',
          time: baseEv?.time || '',
          activity: baseEv?.activity || '',
          location: baseEv?.location || '',
          [field]: value
        };
        return [...prev, {
          id: crypto.randomUUID(),
          roleName,
          events: [newOverride]
        }];
      }
    });
  };

  const removeEvent = (roleName: string, eventId: string) => {
    if (isLocked) return;
    setRoleSchedules(prev => prev.map(s => {
      if (s.roleName === roleName) {
        // Elimina la personalización/override (lo que hace que vuelva a heredar los valores del general)
        // O elimina el evento completamente si era un evento 100% personalizado (sin baseEventId)
        return { 
          ...s, 
          events: s.events.filter(e => e.id !== eventId && e.baseEventId !== eventId) 
        };
      }
      return s;
    }));
  };

  const loadOfficialSchedulesTemplate = () => {
    if (isLocked) return;
    if (safeConfirm('¿Está seguro de cargar las plantillas oficiales de instructivos por rol? Esto reemplazará las actividades actuales de los roles existentes.')) {
      const updatedSchedules = rolesWithStaff.map(role => {
        const name = role.role.toLowerCase();
        let events: any[] = [];

        if (name.includes('jurado') || name.includes('receptor') || name.includes('retenes')) {
          events = [
            {
              id: crypto.randomUUID(),
              time: '06:00-06:30',
              activity: 'INGRESO DE DOCENTES JURADOS RECEPTORES DE PRUEBA.\nLos jurados receptores de prueba deberán registrar su ingreso a la Ciudad Universitaria por la Puerta Nº 6 de la avenida UNIVERSITARIA (altura de la Urb. Mariscal Gamarra) y entregarán la ficha de asistencia debidamente firmada, al equipo de Control de la Unidad de Recursos Humanos.\n\n“Colega docente, conforme disponen los Arts. 96º, 97º, 98º, 99º, 101°, 102º y 103º del Reglamento del Concurso de Admisión a la UNSAAC. USTED SERÁ IMPEDIDO DE INGRESAR Y SERÁ SANCIONADO, SI: porta mochilas, cuadernillo de banco de preguntas, libros, celular, USBs, lapiceros, joyas, monederos, aretes, collares, anillos, relojes, llaves, cartera u otros enseres que pongan en duda su honestidad”. Usted de preferencia prevea su alimentación antes del ingreso a la Universidad, excepcionalmente el cafetín - SINDUC atenderá solo en los horarios de 06:00 a 06:25 horas y después de la charla de inducción de 07:00 a 07:20 horas, el control de estos períodos serán estrictos en su cumplimiento.\n\nLos docentes jurados que lleguen fuera de hora o en condiciones inapropiadas, no ingresarán a la Ciudad Universitaria.',
              location: 'Puerta Nº 6 (Av. Universitaria)'
            },
            {
              id: crypto.randomUUID(),
              time: '06:05-06:35',
              activity: 'Ratificar su asistencia y permanencia ante el Coordinador de tarjetas (Pabellón de Ingeniería Química), este acto valida su asistencia al examen de admisión, su incumplimiento es dado como no se presentó y será reemplazado por el docente retén inmediatamente. El presidente de aula recibe un reloj para el control de los tiempos el mismo que debe devolver al finalizar el examen a su coordinador respectivo.',
              location: 'Pabellón de Ingeniería Química'
            },
            {
              id: crypto.randomUUID(),
              time: '06:35-07:00',
              activity: 'Asistencia obligatoria a la CHARLA DE INDUCCIÓN en el pabellón de la Facultad de Ciencias Sociales.',
              location: 'Facultad de Ciencias Sociales'
            },
            {
              id: crypto.randomUUID(),
              time: '07:30-07:40',
              activity: 'El presidente e integrantes del jurado receptor de prueba iniciarán su labor verificando las fichas de los postulantes en las carpetas con el listado adherido en la puerta; las mismas que no deben ser cambiadas de lugar, bajo responsabilidad.',
              location: 'Aulas asignadas'
            },
            {
              id: crypto.randomUUID(),
              time: '07:40-13:00',
              activity: 'El presidente e integrantes del jurado receptor de prueba debe permanecer en el aula asignada hasta la culminación del examen, bajo responsabilidad.',
              location: 'Aula asignada'
            },
            {
              id: crypto.randomUUID(),
              time: '07:30-09:30',
              activity: 'INGRESO DE POSTULANTES a la Ciudad Universitaria:\n- Grupo A: Puerta 3 - Av. de la Cultura (altura del puente peatonal)\n- Grupo B: Puerta 2 - Av. de la Cultura (altura Pabellón de Enfermería)\n- Grupo C: Puerta 1 - Av. Víctor Raúl Haya de la Torre (Medicina Humana)\n- Grupo D: Puerta 6 - Av. Universitaria (altura Urb. Mariscal Gamarra)',
              location: 'Puertas de ingreso del campus'
            },
            {
              id: crypto.randomUUID(),
              time: '09:30-09:50',
              activity: 'El presidente del Jurado Receptor de Prueba recibirá, del coordinador de TARJETAS, una bolsa con el siguiente contenido: tarjetas OMR en un sobre manila, acta de inicio, acta de finalización, hoja de ocurrencias, relación de alumnos por aula (orden de carpeta), padrón de alumnos por aula (jurados), sobre para postulantes inasistentes, sobre manila para tarjetas OMR-identificación, sobre manila para tarjetas OMR-respuestas, lapicero, tampón, lápices, tajadores y borradores.',
              location: 'Aula asignada'
            },
            {
              id: crypto.randomUUID(),
              time: '09:50-10:10',
              activity: 'El presidente del Jurado Receptor de Pruebas dispondrá la DISTRIBUCIÓN DE TARJETAS OMR (IDENTIFICACIÓN Y RESPUESTA) a los postulantes, para que procedan con el llenado correcto de la Hoja de Identificación de acuerdo con el modelo que se muestra en las carpetas.',
              location: 'Aula asignada'
            },
            {
              id: crypto.randomUUID(),
              time: '10:00-10:20',
              activity: 'El presidente de jurado recepcionará del coordinador de tarjetas, otro paquete que contendrá los cuadernillos de preguntas.',
              location: 'Aula asignada'
            },
            {
              id: crypto.randomUUID(),
              time: '10:20',
              activity: 'DISTRIBUCIÓN DEL CUADERNILLO DE PREGUNTAS, las mismas que deben ser verificadas por el postulante, comprobando que el compaginado corresponda al mismo tema y el orden de las 80 preguntas sea correlativo. En caso que el cuadernillo de preguntas se encuentre incompleto u otra deficiencia el jurado debe cambiar con el mismo tipo de prueba.',
              location: 'Aula asignada'
            },
            {
              id: crypto.randomUUID(),
              time: '10:20-10:30',
              activity: 'El presidente de jurado indicará a los estudiantes que deben marcar el tipo de tema en la hoja de identificación y completar los datos del postulante en la carátula del cuadernillo de preguntas.\n\nLos integrantes del jurado deben VERIFICAR, el TIPO DE TEMA esté correctamente marcado en la hoja de identificación (como corresponde al cuadernillo de preguntas), con lápiz negro Nº 2B. (Responsabilidad del jurado receptor de prueba).\n\nEl presidente de jurado DEBE DAR LECTURA DE FORMA OBLIGATORIA EL LINEAMIENTO DE RESOLVER LAS PREGUNTAS DEL EXAMEN e invitar a los postulantes que, si tienen algún dispositivo electrónico de comunicación, ellos deberán entregar a los jurados; caso contrario serán expulsados y puestos a disposición de las autoridades universitarias y la Fiscalía, sin derecho a participar en los posteriores exámenes de admisión.',
              location: 'Aula asignada'
            },
            {
              id: crypto.randomUUID(),
              time: '10:30',
              activity: 'INICIO DE EXAMEN (duración: 2 horas con 30 minutos) y recojo de las etiquetas de postulantes inasistentes que se encuentran adheridas a la carpeta; luego, debe colocarlas dentro del sobre blanco tamaño oficio y entregarlas al coordinador de tarjetas. (Los jurados receptores de prueba están prohibidos de resolver preguntas de la prueba).',
              location: 'Aula asignada'
            },
            {
              id: crypto.randomUUID(),
              time: '10:40-11:30',
              activity: 'Verificar que el postulante llene correctamente: nombre(s), apellidos, código de postulante (DNI), firma, tipo de tema en la ficha de identificación, además el llenado correcto del padrón del postulante con tipo de tema, huella digital y firma. Desglosar la hoja de identificación y colocar en el sobre respectivo.\n\nIMPORTANTE: El jurado receptor de prueba deberá desglosar y recoger las tarjetas de identificación de cada uno de las postulantes correctamente llenadas. El jurado debe verificar previamente: los apellidos y nombres, código en números, tipo de tema y su respectivo burbujeo, que correspondan a la misma persona (identificar al postulante con su DNI, carnet de identificación, tipo de tema y ficha de carpeta). Luego deberá contabilizar las tarjetas OMR-identificación para ser colocadas junto con el acta de inicio en el sobre manila, para su entrega al coordinador de tarjetas, con nombres y firmas. El jurado en pleno es responsable de esta labor.',
              location: 'Aula asignada'
            },
            {
              id: crypto.randomUUID(),
              time: '11:30-12:10',
              activity: 'Entregar, al coordinador, las tarjetas de identificación en el sobre manila y el acta de inicio. Así mismo entregar las etiquetas de postulantes inasistentes. Está terminantemente PROHIBIDO que el cuadernillo de preguntas y Tarjetas OMR salgan fuera del aula (bajo responsabilidad). Solo los coordinadores de tarjeta, deben portar los cuadernillos de preguntas fuera del aula. (Después que el coordinador haya recogido las tarjetas de identificación del aula, el jurado no podrá cambiar la Tarjeta OMR a ningún postulante). Así mismo entregar al Coordinador de Tarjetas lo siguiente: listados de postulantes, cuadernillo de preguntas sobrantes no distribuidas y tampón.',
              location: 'Aula asignada'
            },
            {
              id: crypto.randomUUID(),
              time: '13:00',
              activity: 'FINALIZACIÓN DE EXAMEN (HORA EXACTA). El presidente del Jurado Receptor de Prueba, anunciará la finalización oficial del examen y dispondrá que los postulantes cierren el cuadernillo de preguntas y sobre la carátula de este, colocarán la hoja de respuestas en forma visible. Asimismo, indicará a los postulantes que deben permanecer en el aula debidamente sentados hasta terminar el conteo de las tarjetas de respuestas.',
              location: 'Aula asignada'
            },
            {
              id: crypto.randomUUID(),
              time: '13:00-13:10',
              activity: 'LOS MIEMBROS DEL JURADO PROCEDERÁN A RECOGER LAS TARJETAS DE RESPUESTAS, CUADERNILLO DE PREGUNTAS, CARNET DE IDENTIFICACIÓN, FICHA DE CARPETA E INSTRUCTIVO DEL JURADO RECEPTOR. En el sobre manila colocar las tarjetas OMR- respuestas junto con el acta de finalización. Los cuadernillos de preguntas, los carnets de identificación, la ficha de carpeta y las instrucciones de cada jurado receptor de prueba, con su nombre rotulado, deberá colocarlas en la bolsa proporcionada, la cual debe ser lacrada. Previamente, el jurado debe verificar que el cuadernillo de preguntas tenga las hojas completas y el número total de cuadernillos coincida con el número de hoja de respuestas. Todo ello bajo responsabilidad.',
              location: 'Aula asignada'
            },
            {
              id: crypto.randomUUID(),
              time: '13:10–13:20',
              activity: 'ENTREGA A LOS COORDINADORES DE TARJETAS EN EL PATIO DEL PABELLÓN DE DERECHO: el sobre de las tarjetas de respuestas, acta de finalización y el formato b (ocurrencias), la bolsa con los cuadernillos de preguntas, carnet de identificación, ficha de carpeta y las instrucciones de cada jurado receptor de prueba, bajo responsabilidad. El presidente y el coordinador de tarjetas dan su conformidad.',
              location: 'Patio del Pabellón de Derecho'
            }
          ];
        } else if (name.includes('tarjeta')) {
          events = [
            {
              id: crypto.randomUUID(),
              time: '05:15-05:30',
              activity: 'Ingreso de Coordinadores de Tarjetas por la Puerta N° 5 de la Ciudad Universitaria de Perayoc.',
              location: 'Puerta N° 5 (Ciudad Universitaria)'
            },
            {
              id: crypto.randomUUID(),
              time: '05:30-08:00',
              activity: 'Recepción y ordenamiento de sobres manila, actas de inicio/finalización, hojas de ocurrencias, padrones de firmas, tampón, lápices 2B, tajadores, borradores, sobres de inasistentes, y tarjetas OMR de control.',
              location: 'Pabellón de Control de Calidad'
            },
            {
              id: crypto.randomUUID(),
              time: '09:30-09:50',
              activity: 'Distribución y entrega de bolsas oficiales con material OMR a los presidentes de aula correspondientes en cada pabellón.',
              location: 'Aulas y pabellones asignados'
            },
            {
              id: crypto.randomUUID(),
              time: '10:00-10:20',
              activity: 'Distribución y entrega de los paquetes sellados con cuadernillos de preguntas a los presidentes de aula, verificando que coincida la cantidad y tipo de tema.',
              location: 'Aulas asignadas'
            },
            {
              id: crypto.randomUUID(),
              time: '11:30-12:10',
              activity: 'Recojo obligatorio de las tarjetas OMR de Identificación, actas de inicio y etiquetas de inasistentes de las aulas asignadas. Verificación inmediata de firmas y cantidades.',
              location: 'Aulas asignadas'
            },
            {
              id: crypto.randomUUID(),
              time: '13:10-13:20',
              activity: 'Recepción de las tarjetas OMR de Respuestas, actas de finalización, formato B (ocurrencias), y bolsas lacradas con material sobrante de cada jurado de aula.',
              location: 'Patio del Pabellón de Derecho'
            }
          ];
        } else if (name.includes('planta') || name.includes('carpetero')) {
          events = [
            {
              id: crypto.randomUUID(),
              time: 'Viernes 08:00',
              activity: 'Etiquetado de carpetas y pegado de listados de postulantes en aulas asignadas correspondientes a los Grupos A, B, C y D.',
              location: 'Aulas asignadas'
            },
            {
              id: crypto.randomUUID(),
              time: '05:15-05:30',
              activity: 'Ingreso de Coordinadores de Planta Física y Carpeteros por la Puerta N° 5 de la Ciudad Universitaria.',
              location: 'Puerta N° 5 (Ciudad Universitaria)'
            },
            {
              id: crypto.randomUUID(),
              time: '05:30-06:00',
              activity: 'Verificar la correcta apertura de aulas, estado del mobiliario (carpetas) y listados en las puertas de ingreso por parte de los carpeteros.',
              location: 'Pabellones y aulas asignadas'
            },
            {
              id: crypto.randomUUID(),
              time: '07:30-13:00',
              activity: 'Permanecer en el pabellón brindando apoyo logístico inmediato ante cualquier incidencia en las aulas (luces, servicios higiénicos, pizarras, cerrojos).',
              location: 'Pabellones asignados'
            },
            {
              id: crypto.randomUUID(),
              time: '13:00-13:30',
              activity: 'Recoger listados de postulantes de las puertas de las aulas, cerrar con llave todas las aulas del pabellón y devolver las llaves a la Oficina de Mantenimiento.',
              location: 'Pabellones y aulas'
            }
          ];
        } else if (name.includes('rector')) {
          events = [
            {
              id: crypto.randomUUID(),
              time: 'Viernes 17:00',
              activity: 'Supervisar el local de Elaboración – CEPRU y coordinar la seguridad del enclaustramiento.',
              location: 'Local de Elaboración'
            },
            {
              id: crypto.randomUUID(),
              time: 'Viernes 17:30',
              activity: 'Supervisar el ingreso de los docentes sorteados para la elaboración de la prueba de admisión.',
              location: 'Puerta de Elaboración - CEPRU'
            },
            {
              id: crypto.randomUUID(),
              time: '05:30',
              activity: 'Ingreso a la Ciudad Universitaria de Perayoc y coordinación de apertura de la Puerta N° 5.',
              location: 'Puerta N° 5'
            },
            {
              id: crypto.randomUUID(),
              time: '06:00',
              activity: 'Apertura de puerta para el ingreso de Decanos, Autoridades, personal Docente y Administrativo.',
              location: 'Puerta N° 5'
            },
            {
              id: crypto.randomUUID(),
              time: '06:30',
              activity: 'Participar y dar las palabras de bienvenida en la charla de Inducción obligatoria para Jurados Receptores.',
              location: 'Auditorio de Facultad de Ciencias Sociales'
            },
            {
              id: crypto.randomUUID(),
              time: '07:30',
              activity: 'Autorizar y disponer el inicio del ingreso de los postulantes por las 4 puertas principales del campus.',
              location: 'Puertas principales de ingreso'
            },
            {
              id: crypto.randomUUID(),
              time: '09:30',
              activity: 'Disponer el cierre definitivo y resguardo estricto de todas las puertas de ingreso al campus universitario.',
              location: 'Puertas del campus'
            },
            {
              id: crypto.randomUUID(),
              time: '10:00',
              activity: 'Recepción oficial de los cuadernillos de preguntas impresos de la sala de Elaboración en CEPRU y autorizar el inicio del traslado de los mismos.',
              location: 'Local CEPRU'
            },
            {
              id: crypto.randomUUID(),
              time: '12:45',
              activity: 'Autorizar la apertura de la sala de Elaboración para la salida segura de todo el personal enclaustrado.',
              location: 'Local CEPRU'
            },
            {
              id: crypto.randomUUID(),
              time: '13:00',
              activity: 'Dirigirse al Centro de Cómputo para la recepción de Tarjetas OMR para iniciar el proceso automatizado de calificación y publicación de resultados.',
              location: 'Centro de Cómputo'
            }
          ];
        } else if (name.includes('puerta') || name.includes('control de puertas')) {
          events = [
            {
              id: crypto.randomUUID(),
              time: '06:00-06:30',
              activity: 'Ingreso a la Ciudad Universitaria. Retiro de credenciales de identificación para postulantes, camarógrafos y perifonistas asignados a su puerta.',
              location: 'Puertas de ingreso asignadas'
            },
            {
              id: crypto.randomUUID(),
              time: '06:30-07:15',
              activity: 'Instalación de equipos de cómputo de control de accesos, cámaras biométricas, arcos detectores de metal y equipos de sonido.',
              location: 'Puertas de ingreso'
            },
            {
              id: crypto.randomUUID(),
              time: '07:30-09:30',
              activity: 'Revisar minuciosamente, identificar mediante DNI/Carnet y controlar de forma estricta el ingreso de postulantes según el grupo correspondiente.',
              location: 'Puerta asignada'
            },
            {
              id: crypto.randomUUID(),
              time: '09:30',
              activity: 'Proceder al cierre definitivo de la puerta asignada, reportar inasistencias y resguardar la seguridad perimetral.',
              location: 'Puerta asignada'
            }
          ];
        } else if (name.includes('asistencia') || name.includes('recursos humanos') || name.includes('urh')) {
          events = [
            {
              id: crypto.randomUUID(),
              time: '05:30-06:00',
              activity: 'Instalar mesas de control de asistencia de docentes jurados y personal administrativo de apoyo en la Puerta N° 5 y Puerta N° 6.',
              location: 'Puertas N° 5 and N° 6'
            },
            {
              id: crypto.randomUUID(),
              time: '06:00-06:45',
              activity: 'Registrar la firma de ingreso de docentes jurados receptores de prueba, recolectar sus declaraciones juradas firmadas y entregarles sus fotochecks.',
              location: 'Mesas de control de ingreso'
            },
            {
              id: crypto.randomUUID(),
              time: '07:00-13:00',
              activity: 'Consolidar las inasistencias y procesar de inmediato el reemplazo por los docentes retenes sorteados.',
              location: 'Oficina de Recursos Humanos'
            },
            {
              id: crypto.randomUUID(),
              time: '13:00-13:45',
              activity: 'Registrar la firma de salida de los jurados y personal administrativo una vez devueltos sus materiales.',
              location: 'Mesas de control de salida'
            }
          ];
        } else {
          events = [
            {
              id: crypto.randomUUID(),
              time: '06:00-06:30',
              activity: 'Ingresar por la Puerta N° 5 con credencial oficial y registrar firma de asistencia ante la Unidad de Recursos Humanos.',
              location: 'Puerta N° 5 / Control URH'
            },
            {
              id: crypto.randomUUID(),
              time: '07:00-07:30',
              activity: 'Recibir instrucciones específicas de su comisión y ubicarse en la zona asignada para cumplir sus labores.',
              location: 'Zona asignada'
            },
            {
              id: crypto.randomUUID(),
              time: '07:30-13:00',
              activity: 'Desarrollo de las labores específicas asignadas en la resolución o directiva de admisión, bajo responsabilidad.',
              location: 'Zona asignada'
            },
            {
              id: crypto.randomUUID(),
              time: '13:00-13:30',
              activity: 'Finalización de labores, ordenamiento de la zona, entrega de informes de ocurrencias si los hubiere y registro de firma de salida.',
              location: 'Zona de control'
            }
          ];
        }

        return {
          id: crypto.randomUUID(),
          roleName: role.role,
          events: events
        };
      });

      setRoleSchedules(updatedSchedules);
      notify?.('Plantillas de instructivos UNSAAC cargadas exitosamente para los roles activos', 'success');
    }
  };

  const syncAllFromGeneralSchedule = () => {
    if (isLocked) return;
    if (safeConfirm('¿Está seguro de regenerar todos los instructivos por rol desde el Cronograma General? Esto reemplazará las actividades modificadas por las del cronograma general.')) {
      setRoleSchedules(rolesWithStaff.map(role => {
        const normRole = role.role.toLowerCase();
        const matchedEvents = generalSchedules.filter(ev => {
          const group = (ev.group || '').toLowerCase();
          if (group === normRole) return true;
          if (normRole.includes(group) || group.includes(normRole)) return true;
          if (group.includes('jurado') && (normRole.includes('jurado') || normRole.includes('receptor'))) return true;
          if (group.includes('tarjeta') && normRole.includes('tarjeta')) return true;
          if (group.includes('planta') && (normRole.includes('planta') || normRole.includes('carpetero'))) return true;
          if (group.includes('rector') && normRole.includes('rector')) return true;
          if (group.includes('puerta') && (normRole.includes('puerta') || normRole.includes('control de puerta'))) return true;
          if (group.includes('autoridades') && (normRole.includes('decano') || normRole.includes('autoridad') || normRole.includes('autoridades'))) return true;
          if (group.includes('administrativo') && (normRole.includes('administrativo') || normRole.includes('funcionarios'))) return true;
          return false;
        });

        const newEvents = matchedEvents.map(ev => ({
          id: crypto.randomUUID(),
          date: ev.date || '',
          time: ev.time || '',
          activity: ev.activity || '',
          location: ev.location || ''
        }));

        return {
          id: crypto.randomUUID(),
          roleName: role.role,
          events: sortEvents(newEvents)
        };
      }));
      notify?.('Instructivos sincronizados con el Cronograma General', 'success');
    }
  };


  const getCuadroName = (id: string) => cuadros.find(c => c.id === id)?.anio || 'Cuadro Desconocido';
  const getModalidadName = (id: string) => modalidades.find(m => m.id === id)?.nombre || 'Modalidad Desconocida';

  // Grouping logic for rendering
  const groupedItems = budgetItems.reduce((acc, item) => {
    const cat = item.category || 'SIN CATEGORÍA';
    const sub = item.subcategory || '';
    
    if (!acc[cat]) {
      acc[cat] = { total: 0, rubro: item.rubro || '', subcategories: {} };
    }
    // If the category doesn't have a rubro set but this item does, adopt it
    if (!acc[cat].rubro && item.rubro) {
        acc[cat].rubro = item.rubro;
    }
    acc[cat].total += item.total;
    
    if (!acc[cat].subcategories[sub]) {
      acc[cat].subcategories[sub] = { total: 0, items: [] };
    }
    acc[cat].subcategories[sub].total += item.total;
    acc[cat].subcategories[sub].items.push(item);
    
    return acc;
  }, {} as Record<string, { total: number, rubro: string, subcategories: Record<string, { total: number, items: BudgetRole[] }> }>);

  // Extract unique categories/subcategories for the modal dropdowns
  const uniqueCategories = Array.from(new Set(budgetItems.map(i => i.category).filter(Boolean)));
  const uniqueSubcategories = Array.from(new Set(budgetItems.filter(i => i.category === newItemCategory).map(i => i.subcategory).filter(Boolean)));
  const uniqueScheduleDates = Array.from(new Set(generalSchedules.map(ev => ev.date).filter(Boolean))) as string[];


  
  const updateCategoryRubro = (category: string, newRubro: string) => {
    if (isLocked) return;
    setBudgetItems(items => items.map(item => {
      if ((item.category || 'SIN CATEGORÍA') === category) {
        return { ...item, rubro: newRubro };
      }
      return item;
    }));
  };

  const toggleCategory = (category: string) => {
    setCollapsedCategories(prev => ({ ...prev, [category]: !prev[category] }));
  };

  const isAllCollapsed = Object.keys(groupedItems).length > 0 && Object.keys(groupedItems).every(cat => collapsedCategories[cat]);
  const toggleAll = () => {
    if (isAllCollapsed) {
      setCollapsedCategories({});
    } else {
      const all: Record<string, boolean> = {};
      Object.keys(groupedItems).forEach(cat => {
        all[cat] = true;
      });
      setCollapsedCategories(all);
    }
  };

  if (isLoading) return <div className="p-8 flex justify-center"><span className="material-symbols-outlined animate-spin text-4xl text-primary">progress_activity</span></div>;

  if (view === 'dashboard') {
    return (
      <div className="flex flex-col h-full bg-slate-50">
        <header className="bg-white px-8 py-6 border-b border-slate-200 shrink-0 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-black text-slate-800 uppercase tracking-tighter">Presupuestos de Examen</h1>
            <p className="text-sm font-bold text-slate-400 mt-1">Administre los presupuestos y cronogramas por modalidad.</p>
          </div>
          <button onClick={handleCreateNew} className="px-4 py-2.5 bg-primary hover:bg-primary/90 text-white rounded-xl text-sm font-bold uppercase tracking-wider transition-colors flex items-center gap-2 shadow-sm">
            <span className="material-symbols-outlined text-[20px]">add</span>
            Nuevo Presupuesto
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-8">
          <div className="max-w-7xl mx-auto">
            {savedBudgets.length === 0 ? (
              <div className="text-center p-12 border-2 border-dashed border-slate-300 rounded-3xl bg-white shadow-sm flex flex-col items-center justify-center">
                <span className="material-symbols-outlined text-6xl text-slate-300 mb-4">request_quote</span>
                <p className="text-slate-500 font-bold text-lg">No hay presupuestos creados aún.</p>
                <p className="text-slate-400 text-sm mt-2 max-w-md">Cree un nuevo presupuesto seleccionando un Cuadro Anual y una Modalidad aprobada para empezar a gestionar los rubros y el cronograma del examen.</p>
                <button onClick={handleCreateNew} className="mt-6 px-6 py-2.5 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-sm font-bold uppercase tracking-wider transition-colors">
                  Empezar Ahora
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {savedBudgets.map(budget => (
                  <div key={budget.id} onClick={() => handleEditBudget(budget)} className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm hover:shadow-md hover:border-primary/30 transition-all cursor-pointer group relative">
                    <button onClick={(e) => handleDeleteBudget(budget.id, e)} className="absolute top-4 right-4 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">
                       <span className="material-symbols-outlined text-[20px]">delete</span>
                    </button>
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center text-primary">
                        <span className="material-symbols-outlined text-2xl">account_balance_wallet</span>
                      </div>
                      <div>
                        <h3 className="font-black text-slate-800 uppercase tracking-tight text-sm line-clamp-2">{getModalidadName(budget.modalidad_id)}</h3>
                        <p className="text-[10px] font-bold text-slate-400 tracking-wider">CUADRO ANUAL {getCuadroName(budget.cuadro_anual_id)}</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-100">
                      <div>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Costo Total</p>
                        <p className="font-black text-emerald-600">S/ {budget.total_general.toLocaleString('es-PE', { minimumFractionDigits: 2 })}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Personal</p>
                        <p className="font-bold text-slate-700">{budget.items?.reduce((acc, i) => (i.condition === 'D' || i.condition === 'A') ? acc + i.quantity : acc, 0) || 0} Req.</p>
                      </div>
                    </div>
                    <p className="text-[10px] text-slate-400 font-bold mt-4 text-center">Última modif. {new Date(budget.updated_at).toLocaleDateString()}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        
        {isCreateModalOpen && (
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
              <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                <h3 className="font-black text-slate-800 uppercase tracking-tight text-sm">Nuevo Presupuesto</h3>
                <button onClick={() => setIsCreateModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                  <span className="material-symbols-outlined text-[20px]">close</span>
                </button>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">Cuadro Anual</label>
                  <select 
                    className="w-full p-3 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 focus:outline-none focus:border-primary bg-slate-50"
                    value={tempCuadro}
                    onChange={(e) => setTempCuadro(e.target.value)}
                  >
                    <option value="">Seleccione Cuadro</option>
                    {cuadros.map(c => (
                      <option key={c.id} value={c.id}>{c.anio}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">Modalidad</label>
                  <select 
                    className="w-full p-3 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 focus:outline-none focus:border-primary bg-slate-50 disabled:opacity-50"
                    value={tempModalidad}
                    onChange={(e) => setTempModalidad(e.target.value)}
                    disabled={!tempCuadro}
                  >
                    <option value="">Seleccione Modalidad</option>
                    {modalidades.filter(m => m.cuadro_id === tempCuadro).map(m => (
                      <option key={m.id} value={m.id}>{m.nombre}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-2 bg-slate-50/50">
                <button 
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-200 bg-slate-100 rounded-xl text-xs font-bold uppercase tracking-wider transition-colors"
                >
                  Cancelar
                </button>
                <button 
                  onClick={confirmCreateNew}
                  className="px-4 py-2 bg-primary hover:bg-primary/90 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-colors shadow-sm"
                >
                  Crear Presupuesto
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div id="exam-budget-print-area" className={`flex flex-col h-full ${isExportingPdf ? 'bg-white text-black p-8' : 'bg-slate-50 print:bg-white print:text-black'}`}>
      <header className={`bg-white px-8 py-6 border-b border-slate-200 shrink-0 flex items-center justify-between print:hidden ${isExportingPdf ? 'hidden' : ''}`}>
        <div className="flex items-center gap-4">
          <button onClick={() => setView('dashboard')} className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-full transition-colors flex items-center justify-center">
            <span className="material-symbols-outlined text-[20px]">arrow_back</span>
          </button>
          <div>
            <h1 className="text-xl font-black text-slate-800 uppercase tracking-tighter">
              {currentBudget ? 'Editar Presupuesto' : 'Nuevo Presupuesto'}
            </h1>
            <p className="text-xs font-bold text-slate-400 mt-1">Cuadro: {getCuadroName(selectedCuadro)} | Modalidad: {getModalidadName(selectedModalidad)}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {currentBudget && (
             <button onClick={toggleLock} className={`px-4 py-2 border rounded-xl text-sm font-bold uppercase tracking-wider transition-colors flex items-center gap-2 shadow-sm ${isLocked ? 'bg-red-50 text-red-600 border-red-200 hover:bg-red-100' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>
                <span className="material-symbols-outlined text-[18px]">{isLocked ? 'lock' : 'lock_open'}</span>
                {isLocked ? 'Bloqueado' : 'Desbloqueado'}
             </button>
          )}
          <button onClick={handlePrint} className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-sm font-bold uppercase tracking-wider transition-colors flex items-center gap-2 shadow-sm">
            <span className="material-symbols-outlined text-[20px]">picture_as_pdf</span>
            Descargar PDF
          </button>
          <button onClick={saveCurrentBudget} disabled={isLocked} className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-bold uppercase tracking-wider transition-colors flex items-center gap-2 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed">
            <span className="material-symbols-outlined text-[20px]">save</span>
            Guardar Cambios
          </button>
        </div>
      </header>

      {/* Estilo dinámico cuando se está exportando a PDF para ocultar controles interactivos, scrollbars y expandir tablas */}
      {isExportingPdf && (
        <style>{`
          .print\\:hidden, [class*="print:hidden"], .print-hidden-pdf {
            display: none !important;
          }
          button, .fixed {
            display: none !important;
          }
          .overflow-y-auto, .overflow-x-auto, [class*="overflow-y-auto"], [class*="overflow-x-auto"] {
            overflow: visible !important;
            height: auto !important;
            max-height: none !important;
          }
          #exam-budget-print-area {
            background-color: white !important;
            color: black !important;
            padding: 24px !important;
            height: auto !important;
            min-height: auto !important;
            max-height: none !important;
          }
          /* Quitar bordes redondeados y sombras del contenedor en PDF */
          #exam-budget-print-area .rounded-2xl,
          #exam-budget-print-area .border,
          #exam-budget-print-area .shadow-sm {
            border: none !important;
            box-shadow: none !important;
            border-radius: 0 !important;
          }
          /* Quitar el padding extra en el contenedor de la tabla */
          #exam-budget-print-area .p-6, #exam-budget-print-area .p-8 {
            padding: 0 !important;
          }
          /* Diseño de cuadrícula formal para la tabla de presupuesto en el PDF */
          #exam-budget-print-area table {
            width: 100% !important;
            border-collapse: collapse !important;
            border: 1.5px solid #0f172a !important;
            margin-bottom: 20px !important;
            page-break-inside: auto !important;
          }
          #exam-budget-print-area tr {
            page-break-inside: avoid !important;
            page-break-after: auto !important;
          }
          #exam-budget-print-area thead {
            display: table-header-group !important;
          }
          #exam-budget-print-area th {
            background-color: #f1f5f9 !important;
            color: #0f172a !important;
            font-weight: 800 !important;
            font-size: 10px !important;
            padding: 8px 10px !important;
            border: 1px solid #94a3b8 !important;
            border-bottom: 2px solid #0f172a !important;
            text-transform: uppercase !important;
          }
          #exam-budget-print-area td {
            color: #000000 !important;
            border: 1px solid #cbd5e1 !important;
            padding: 8px 10px !important;
            font-size: 11px !important;
            vertical-align: top !important;
          }
          input, textarea {
            border: none !important;
            background: transparent !important;
            padding: 0 !important;
            resize: none !important;
            color: black !important;
          }
        `}</style>
      )}

      {/* Cabecera Profesional de Impresión y PDF con Logos Oficiales */}
      <div className={`${isExportingPdf ? 'flex' : 'hidden print:flex'} flex-row justify-between items-center border-b-2 border-slate-900 pb-4 mb-6 bg-white text-black`}>
        <img 
          src="https://cnqpzyanmmwspvemcfeb.supabase.co/storage/v1/object/public/logos/escudo%20oficial-02%20(2).png" 
          alt="Escudo UNSAAC" 
          className="h-20 w-auto object-contain" 
          referrerPolicy="no-referrer" 
        />
        <div className="text-center flex-1 mx-4">
          <h1 className="text-sm font-black text-black uppercase tracking-wide leading-tight">
            Universidad Nacional de San Antonio Abad del Cusco
          </h1>
          <h2 className="text-xs font-black text-slate-700 uppercase tracking-wider mt-0.5">
            Vicerrectorado Académico - Oficina de Admisión
          </h2>
          <div className="w-16 h-0.5 bg-slate-400 mx-auto my-1.5"></div>
          <h3 className="text-[13px] font-black text-slate-900 uppercase tracking-widest leading-none mt-1">
            {activeTab === 'Presupuesto' && 'Presupuesto de Costos Operativos de Admisión'}
            {activeTab === 'CronogramaGeneral' && 'Cronograma General del Examen de Admisión'}
            {activeTab === 'Cronograma' && 'Cronograma e Instructivos por Rol'}
          </h3>
          <p className="text-[10px] font-bold text-slate-500 uppercase mt-1">
            Cuadro Anual: {getCuadroName(selectedCuadro)} | Modalidad: {getModalidadName(selectedModalidad)}
          </p>
        </div>
        <img 
          src="https://cnqpzyanmmwspvemcfeb.supabase.co/storage/v1/object/public/logos/logo%20admision%201.png" 
          alt="Oficina de Admisión Logo" 
          className="h-32 w-auto object-contain" 
          referrerPolicy="no-referrer" 
        />
      </div>

      <div className="flex-1 overflow-y-auto p-8 print:p-0 print:overflow-visible">
        <div className="max-w-7xl mx-auto space-y-6 print:max-w-none print:w-full">
          {activeTab === 'Presupuesto' && (
            <div className={`${isExportingPdf ? 'flex' : 'hidden print:flex'} justify-between items-center bg-gray-100 p-4 rounded-lg font-bold mb-6`}>
               <div>Total Personal: {totalPersonal} req.</div>
               <div>Presupuesto Total: S/ {totalGeneral.toLocaleString('es-PE', { minimumFractionDigits: 2 })}</div>
            </div>
          )}

          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden print:shadow-none print:border-none print:rounded-none">
            <div className={`flex border-b border-slate-100 ${isExportingPdf ? 'hidden' : 'print:hidden'}`}>
              <button 
                onClick={() => setActiveTab('Presupuesto')}
                className={`flex-1 p-4 text-sm font-black uppercase tracking-wider transition-colors border-b-2 ${activeTab === 'Presupuesto' ? 'border-primary text-primary bg-primary/5' : 'border-transparent text-slate-500 hover:bg-slate-50'}`}
              >
                1. Rubros del Presupuesto
              </button>
              <button 
                onClick={() => setActiveTab('CronogramaGeneral')}
                className={`flex-1 p-4 text-sm font-black uppercase tracking-wider transition-colors border-b-2 ${activeTab === 'CronogramaGeneral' ? 'border-primary text-primary bg-primary/5' : 'border-transparent text-slate-500 hover:bg-slate-50'}`}
              >
                2. Cronograma General
              </button>
              <button 
                onClick={() => setActiveTab('Cronograma')}
                className={`flex-1 p-4 text-sm font-black uppercase tracking-wider transition-colors border-b-2 ${activeTab === 'Cronograma' ? 'border-primary text-primary bg-primary/5' : 'border-transparent text-slate-500 hover:bg-slate-50'}`}
              >
                3. Instructivos por Rol
              </button>
            </div>

            {activeTab === 'Presupuesto' && (
              <div className="p-6 print:p-0">
                <div className="flex justify-between items-center mb-4 print:hidden">
                  <h3 className="text-sm font-black text-slate-800 uppercase tracking-tight">Detalle de Costos Operativos</h3>
                  <button onClick={loadTemplate} disabled={isLocked} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold uppercase tracking-wider transition-colors flex items-center gap-2 disabled:opacity-50">
                    <span className="material-symbols-outlined text-[16px]">library_add</span>
                    Cargar Plantilla Base
                  </button>
                </div>

                <div className="overflow-x-auto rounded-xl border border-slate-200 print:border-none print:rounded-none">
                  <table className="w-full text-left print:text-xs">
                    <thead className="bg-slate-50 text-[10px] font-black text-slate-500 uppercase tracking-wider print:bg-gray-100 print:text-black">
                      <tr>
                        <th className="p-3 w-16">Rubro</th>
                        <th className="p-3">Detalle</th>
                        <th className="p-3 w-16 text-center">Cond.</th>
                        <th className="p-3 w-20 text-center">Ind.</th>
                        <th className="p-3 w-20 text-center">Cant.</th>
                        <th className="p-3 w-28 text-right">Cost. Un.</th>
                        <th className="p-3 w-28 text-right">Total</th>
                        <th className="p-3 w-10 text-center print:hidden"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-sm print:divide-gray-200 print:text-black">
                      {budgetItems.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="p-8 text-center text-slate-400 font-bold print:hidden">
                            No hay rubros añadidos. Carga una plantilla o agrega uno nuevo.
                          </td>
                        </tr>
                      ) : (
                        Object.entries(groupedItems).map(([category, catData]: [string, any]) => {
                          const isCollapsed = collapsedCategories[category] || false;
                          return (
                          <React.Fragment key={category}>
                            {/* Fila de Categoría Principal */}
                            <tr className="bg-slate-100/80 print:bg-gray-200 group">
                              <td className="p-2">
                                {isExportingPdf ? (
                                  <div className="font-mono text-xs text-slate-800 font-bold text-center">{catData.rubro || '-'}</div>
                                ) : (
                                  <input 
                                    type="text" 
                                    value={catData.rubro} 
                                    onChange={e => updateCategoryRubro(category, e.target.value)} 
                                    readOnly={isLocked} 
                                    className="w-full p-2 border border-slate-200 rounded-lg focus:border-primary outline-none font-mono text-xs bg-white disabled:bg-transparent print:border-none print:p-0 print:bg-transparent print:text-black" 
                                    placeholder="Código SIAF" 
                                  />
                                )}
                              </td>
                              <td colSpan={5} className="p-2 pl-4 cursor-pointer" onClick={() => toggleCategory(category)}>
                                <div className="flex items-center gap-2">
                                  <span className="material-symbols-outlined text-slate-400 text-[18px] transition-transform duration-200 print:hidden" style={{ transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}>expand_more</span>
                                  <span className="font-black text-slate-800 uppercase text-xs print:text-black">
                                    {category}
                                  </span>
                                </div>
                              </td>
                              <td className="p-2 text-right font-black text-slate-800 print:text-black">
                                {catData.total.toLocaleString('es-PE', { minimumFractionDigits: 2 })}
                              </td>
                              <td className="print:hidden"></td>
                            </tr>
                            
                            {/* Items / Subcategories */}
                            {!isCollapsed && Object.entries(catData.subcategories).map(([subcategory, subData]: [string, any]) => (
                              <React.Fragment key={`${category}-${subcategory}`}>
                                {/* Fila de Subcategoría (solo si existe) */}
                                {subcategory && (
                                  <tr className="bg-slate-50 print:bg-gray-100">
                                    <td colSpan={6} className="p-2 pl-8 font-bold text-slate-600 uppercase text-xs print:text-black">
                                      {subcategory}
                                    </td>
                                    <td className="p-2 text-right font-bold text-slate-600 print:text-black">
                                      {subData.total.toLocaleString('es-PE', { minimumFractionDigits: 2 })}
                                    </td>
                                    <td className="print:hidden"></td>
                                  </tr>
                                )}
                                
                                {/* Items de la (Sub)Categoría */}
                                {subData.items.map((item, index) => (
                                  <tr key={item.id} className="hover:bg-slate-50/50 print:break-inside-avoid border-b border-slate-50">
                                    <td className="p-2 align-top text-center text-slate-300 font-black">
                                      -
                                    </td>
                                    <td className="p-2 align-top pl-4">
                                      {isExportingPdf ? (
                                        <div className="font-bold text-slate-800 text-xs text-left whitespace-pre-wrap leading-relaxed">{item.role}</div>
                                      ) : (
                                        <AutoResizeTextarea value={item.role} onChange={(e: any) => updateBudgetItem(item.id, 'role', e.target.value)} readOnly={isLocked} className="font-medium text-slate-700 disabled:text-slate-900 print:text-black" placeholder="Descripción del cargo o bien..." />
                                      )}
                                    </td>
                                    <td className="p-2 align-top">
                                      {isExportingPdf ? (
                                        <div className="text-center font-black text-slate-800 text-xs">{item.condition || '-'}</div>
                                      ) : (
                                        <input type="text" value={item.condition} onChange={e => updateBudgetItem(item.id, 'condition', e.target.value)} readOnly={isLocked} className="w-full p-2 border border-slate-200 rounded-lg focus:border-primary outline-none text-center font-bold bg-white uppercase disabled:bg-transparent print:border-none print:p-0 print:bg-transparent print:text-black" placeholder="-" />
                                      )}
                                    </td>
                                    <td className="p-2 align-top">
                                      {isExportingPdf ? (
                                        <div className="text-center font-mono font-bold text-slate-800 text-xs">{item.indicator}</div>
                                      ) : (
                                        <input type="number" min="0" step="0.01" value={item.indicator} onChange={e => updateBudgetItem(item.id, 'indicator', parseFloat(e.target.value) || 0)} readOnly={isLocked} className="w-full p-2 border border-slate-200 rounded-lg focus:border-primary outline-none text-center font-mono bg-white disabled:bg-transparent print:border-none print:p-0 print:bg-transparent print:text-black" />
                                      )}
                                    </td>
                                    <td className="p-2 align-top">
                                      {isExportingPdf ? (
                                        <div className="text-center font-black text-slate-800 text-xs">{item.quantity}</div>
                                      ) : (
                                        <input type="number" min="0" value={item.quantity} onChange={e => updateBudgetItem(item.id, 'quantity', parseFloat(e.target.value) || 0)} readOnly={isLocked} className="w-full p-2 border border-slate-200 rounded-lg focus:border-primary outline-none text-center font-bold bg-white disabled:bg-transparent print:border-none print:p-0 print:bg-transparent print:text-black" />
                                      )}
                                    </td>
                                    <td className="p-2 align-top">
                                      {isExportingPdf ? (
                                        <div className="text-right font-mono font-bold text-slate-800 text-xs">{item.unit_cost.toLocaleString('es-PE', { minimumFractionDigits: 2 })}</div>
                                      ) : (
                                        <input type="number" min="0" value={item.unit_cost} onChange={e => updateBudgetItem(item.id, 'unit_cost', parseFloat(e.target.value) || 0)} readOnly={isLocked} className="w-full p-2 border border-slate-200 rounded-lg focus:border-primary outline-none text-right font-mono bg-white disabled:bg-transparent print:border-none print:p-0 print:bg-transparent print:text-black" />
                                      )}
                                    </td>
                                    <td className="p-2 align-top text-right font-mono font-bold text-slate-800 text-xs bg-transparent print:text-black">
                                      {item.total.toLocaleString('es-PE', { minimumFractionDigits: 2 })}
                                    </td>
                                    <td className="p-2 align-top text-center print:hidden">
                                      {!isLocked && (
                                        <button onClick={() => removeBudgetItem(item.id)} className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors mx-auto">
                                          <span className="material-symbols-outlined text-[18px]">delete</span>
                                        </button>
                                      )}
                                    </td>
                                  </tr>
                                ))}
                              </React.Fragment>
                            ))}
                          </React.Fragment>
                        )})
                      )}
                    </tbody>
                    <tfoot className="bg-slate-800 text-white border-t border-slate-200 print:bg-gray-800 print:text-white">
                      <tr>
                        <td colSpan={4} className="p-4 font-black uppercase tracking-tight text-xs print:text-white">
                           Total Personal: <span className="text-emerald-400">{totalPersonal} req.</span>
                        </td>
                        <td colSpan={2} className="p-4 text-right font-black uppercase tracking-tight print:text-white">Presupuesto Total</td>
                        <td className="p-4 text-right font-black text-lg text-emerald-400 print:text-white">S/ {totalGeneral.toLocaleString('es-PE', { minimumFractionDigits: 2 })}</td>
                        <td className="print:hidden"></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>


                {/* Expand/Collapse All Floating Button */}
                <button 
                  onClick={toggleAll}
                  className="fixed bottom-6 right-6 w-12 h-12 bg-white border border-slate-200 rounded-full shadow-lg flex items-center justify-center text-slate-500 hover:text-primary hover:border-primary transition-all z-50 print:hidden"
                  title={isAllCollapsed ? 'Expandir Todo' : 'Contraer Todo'}
                >
                  <span className="material-symbols-outlined text-[24px]">
                    {isAllCollapsed ? 'unfold_more' : 'unfold_less'}
                  </span>
                </button>

                {!isLocked && (
                  <div className="mt-4 print:hidden">
                     {isAddModalOpen ? (
                        <div className="bg-white border border-primary/30 rounded-xl p-4 shadow-sm animate-in fade-in zoom-in-95 duration-200">
                           <h4 className="text-sm font-black text-slate-800 uppercase tracking-wider mb-3">Añadir Nuevo Rubro</h4>
                           <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                              <div>
                                 <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">Categoría</label>
                                 <input 
                                    type="text" 
                                    list="categories-list"
                                    value={newItemCategory} 
                                    onChange={(e) => setNewItemCategory(e.target.value)}
                                    className="w-full p-2.5 border border-slate-200 rounded-lg text-sm font-bold text-slate-700 focus:border-primary outline-none"
                                    placeholder="Ej. PERSONAL DOCENTE Y APOYO"
                                 />
                                 <datalist id="categories-list">
                                    {uniqueCategories.map(c => <option key={c} value={c} />)}
                                 </datalist>
                              </div>
                              <div>
                                 <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">Subcategoría (Opcional)</label>
                                 <input 
                                    type="text" 
                                    list="subcategories-list"
                                    value={newItemSubcategory} 
                                    onChange={(e) => setNewItemSubcategory(e.target.value)}
                                    className="w-full p-2.5 border border-slate-200 rounded-lg text-sm font-bold text-slate-700 focus:border-primary outline-none"
                                    placeholder="Ej. Elaboracion de Prueba"
                                 />
                                 <datalist id="subcategories-list">
                                    {uniqueSubcategories.map(s => <option key={s} value={s} />)}
                                 </datalist>
                              </div>
                           </div>
                           <div className="flex gap-2 justify-end">
                              <button onClick={() => setIsAddModalOpen(false)} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors">Cancelar</button>
                              <button onClick={confirmAddItem} className="px-4 py-2 bg-primary hover:bg-primary/90 text-white rounded-lg text-xs font-bold uppercase tracking-wider transition-colors shadow-sm">Confirmar</button>
                           </div>
                        </div>
                     ) : (
                        <button onClick={() => setIsAddModalOpen(true)} className="w-full py-4 border-2 border-dashed border-slate-300 rounded-xl text-sm font-bold text-slate-500 hover:text-primary hover:border-primary hover:bg-primary/5 transition-colors flex items-center justify-center gap-2 uppercase tracking-wider">
                           <span className="material-symbols-outlined">add_circle</span>
                           Añadir Nuevo Rubro
                        </button>
                     )}
                  </div>
                )}
              </div>
            )}

            
            {activeTab === 'CronogramaGeneral' && (
              <div className="p-6 print:p-0">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6 print:hidden">
                  <div>
                    <h3 className="text-sm font-black text-slate-800 uppercase tracking-tight">Cronograma General del Examen (Pilares)</h3>
                    <p className="text-xs text-slate-500 mt-1">Establezca los horarios de labores principales de todas las comisiones. Estos horarios servirán como referencia y base para los instructivos individuales por rol.</p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button 
                      onClick={loadGeneralScheduleTemplate} 
                      disabled={isLocked}
                      className="px-4 py-2 bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 rounded-xl text-xs font-bold uppercase tracking-wider transition-colors flex items-center gap-2 disabled:opacity-50"
                    >
                      <span className="material-symbols-outlined text-[16px]">restart_alt</span>
                      Restaurar Plantilla de Ejemplo
                    </button>
                    {!isLocked && (
                      <button 
                        onClick={() => addGeneralScheduleEvent()} 
                        className="px-4 py-2 bg-primary hover:bg-primary/95 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-colors flex items-center gap-2"
                      >
                        <span className="material-symbols-outlined text-[16px]">add</span>
                        Nueva Actividad
                      </button>
                    )}
                  </div>
                </div>

                {generalSchedules.length === 0 ? (
                  <div className="text-center p-12 border-2 border-dashed border-slate-300 rounded-2xl bg-slate-50 print:hidden">
                    <span className="material-symbols-outlined text-5xl text-slate-300 mb-3">calendar_today</span>
                    <p className="text-slate-600 font-bold text-lg">No hay actividades registradas en el cronograma general.</p>
                    <p className="text-slate-400 text-sm mt-1">Haga clic en 'Restaurar Plantilla de Ejemplo' para cargar los horarios predeterminados.</p>
                  </div>
                ) : (
                  <div className="space-y-8">
                    {/* Render unique groups dynamically */}
                    {(Array.from(new Set(generalSchedules.map(ev => (ev.group || 'HORARIOS GENERALES DEL EXAMEN') as string))) as string[]).map((groupName, gIdx) => {
                      const groupEvents = generalSchedules.filter(ev => (ev.group || 'HORARIOS GENERALES DEL EXAMEN') === groupName);
                      return (
                        <div key={gIdx} className="border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-sm print:border-none print:shadow-none print:mb-6 print:break-inside-avoid">
                          <div className="bg-slate-100 p-4 border-b border-slate-200 flex justify-between items-center print:bg-gray-200 print:border-b-2 print:border-black">
                            <div className="flex items-center gap-2">
                              <span className="material-symbols-outlined text-slate-600 print:hidden text-[18px]">group_work</span>
                              <h4 className="font-black text-slate-800 text-xs uppercase tracking-wider print:text-black">{groupName}</h4>
                            </div>
                            {!isLocked && (
                              <button 
                                onClick={() => addGeneralScheduleEvent(groupName)} 
                                className="px-2.5 py-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-colors flex items-center gap-1 print:hidden shadow-sm"
                              >
                                <span className="material-symbols-outlined text-[14px]">add</span>
                                Añadir Fila
                              </button>
                            )}
                          </div>
                          
                          <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                              <thead>
                                <tr className="bg-slate-50/50 border-b border-slate-100 text-[10px] font-black text-slate-400 uppercase tracking-wider print:border-b print:text-black">
                                  <th className="p-3 w-1/4">Fecha / Día</th>
                                  <th className="p-3 w-1/6">Hora</th>
                                  <th className="p-3 w-2/5">Actividad / Labor encomendada</th>
                                  <th className="p-3 w-1/4">Lugar / Ubicación</th>
                                  {!isLocked && <th className="p-3 w-[80px] print:hidden">Acciones</th>}
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {groupEvents.map((ev, eIdx) => (
                                  <tr key={ev.id} className="hover:bg-slate-50/30 transition-colors">
                                    <td className="p-1 text-sm">
                                      {(isLocked || isExportingPdf) ? (
                                        <span className="px-2 py-1.5 text-slate-700 font-bold block">{ev.date}</span>
                                      ) : (
                                        <input 
                                          type="text"
                                          value={ev.date}
                                          onChange={e => updateGeneralScheduleEvent(ev.id, 'date', e.target.value)}
                                          placeholder="Ej. Sábado 07 de Febrero"
                                          className="w-full px-2 py-1.5 bg-transparent border border-transparent hover:border-slate-200 hover:bg-slate-50/50 focus:bg-white focus:border-primary focus:ring-1 focus:ring-primary outline-none rounded-lg text-xs font-bold text-slate-700 transition-all"
                                        />
                                      )}
                                    </td>
                                    <td className="p-1 text-sm">
                                      {(isLocked || isExportingPdf) ? (
                                        <span className="px-2 py-1.5 text-slate-700 font-bold block">{ev.time}</span>
                                      ) : (
                                        <input 
                                          type="text"
                                          value={ev.time}
                                          onChange={e => updateGeneralScheduleEvent(ev.id, 'time', e.target.value)}
                                          placeholder="Ej. 07:30 a 09:30"
                                          className="w-full px-2 py-1.5 bg-transparent border border-transparent hover:border-slate-200 hover:bg-slate-50/50 focus:bg-white focus:border-primary focus:ring-1 focus:ring-primary outline-none rounded-lg text-xs font-bold text-slate-700 transition-all"
                                        />
                                      )}
                                    </td>
                                    <td className="p-1 text-sm">
                                      {(isLocked || isExportingPdf) ? (
                                        <span className="px-2 py-1.5 text-slate-700 whitespace-pre-line block leading-relaxed">{ev.activity}</span>
                                      ) : (
                                        <AutoResizeTextarea
                                          value={ev.activity}
                                          onChange={(e: any) => updateGeneralScheduleEvent(ev.id, 'activity', e.target.value)}
                                          placeholder="¿Qué labor se realiza?"
                                          className="w-full px-2 py-1.5 bg-transparent border border-transparent hover:border-slate-200 hover:bg-slate-50/50 focus:bg-white focus:border-primary focus:ring-1 focus:ring-primary outline-none rounded-lg text-xs font-bold text-slate-700 transition-all font-sans"
                                        />
                                      )}
                                    </td>
                                    <td className="p-1 text-sm">
                                      {(isLocked || isExportingPdf) ? (
                                        <span className="px-2 py-1.5 text-slate-600 block">{ev.location}</span>
                                      ) : (
                                        <input 
                                          type="text"
                                          value={ev.location}
                                          onChange={e => updateGeneralScheduleEvent(ev.id, 'location', e.target.value)}
                                          placeholder="Ej. Puerta 5, Pabellón..."
                                          className="w-full px-2 py-1.5 bg-transparent border border-transparent hover:border-slate-200 hover:bg-slate-50/50 focus:bg-white focus:border-primary focus:ring-1 focus:ring-primary outline-none rounded-lg text-xs font-bold text-slate-600 transition-all"
                                        />
                                      )}
                                    </td>
                                    {!isLocked && (
                                      <td className="p-1 text-center print:hidden">
                                        <button 
                                          onClick={() => deleteGeneralScheduleEvent(ev.id)}
                                          className="p-1.5 hover:bg-red-50 text-slate-400 hover:text-red-500 rounded-lg transition-colors"
                                          title="Eliminar actividad"
                                        >
                                          <span className="material-symbols-outlined text-[18px]">delete</span>
                                        </button>
                                      </td>
                                    )}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'Cronograma' && (
              <div className="p-6 print:p-0">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6 print:hidden">
                  <div>
                    <h3 className="text-sm font-black text-slate-800 uppercase tracking-tight">Cronograma e Instructivos por Rol</h3>
                    <p className="text-xs text-slate-500 mt-1">Genere la línea de tiempo de instrucciones para el personal programado de manera individual.</p>
                  </div>
                  <div className="flex gap-2 shrink-0 flex-wrap">
                    <button 
                      onClick={syncAllFromGeneralSchedule} 
                      disabled={isLocked}
                      className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-colors flex items-center gap-2 disabled:opacity-50"
                    >
                      <span className="material-symbols-outlined text-[16px]">sync</span>
                      Sincronizar desde Cronograma General
                    </button>
                    <button 
                      onClick={loadOfficialSchedulesTemplate} 
                      disabled={isLocked}
                      className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold uppercase tracking-wider transition-colors flex items-center gap-2 disabled:opacity-50"
                    >
                      <span className="material-symbols-outlined text-[16px]">restart_alt</span>
                      Cargar Instructivos UNSAAC
                    </button>
                  </div>
                </div>

                {rolesWithStaff.length === 0 ? (
                  <div className="text-center p-12 border-2 border-dashed border-slate-300 rounded-2xl bg-slate-50 print:hidden">
                    <span className="material-symbols-outlined text-5xl text-slate-300 mb-3">assignment_late</span>
                    <p className="text-slate-600 font-bold text-lg">No hay personal operativo definido.</p>
                    <p className="text-slate-400 text-sm mt-1">Agregue rubros con cantidades mayores a 0 en la pestaña de Presupuesto para generar los roles.</p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {rolesWithStaff.map((role, idx) => {
                      const schedule = getScheduleForRole(role.role);
                      return (
                        <div key={idx} className="border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-sm print:border-none print:shadow-none print:mb-8 print:break-inside-avoid">
                          <div className="bg-slate-800 p-4 border-b border-slate-200 flex justify-between items-center print:bg-gray-100 print:border-b-2 print:border-black">
                            <div>
                              <h4 className="font-black text-white text-sm uppercase print:text-black">{role.role}</h4>
                              <p className="text-[10px] text-slate-400 font-bold tracking-wider mt-0.5 print:text-gray-600">CANTIDAD: {role.quantity} | CONDICIÓN: {role.condition}</p>
                            </div>
                            <div className="flex items-center gap-2">
                              <button 
                                onClick={() => openInstructiveModal(role.role)} 
                                className="px-3 py-1.5 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-xs font-bold transition-all duration-200 flex items-center gap-1.5 shadow-sm print:hidden"
                                title="Generar instructivo de funciones oficial en PDF con Inteligencia Artificial"
                              >
                                <span className="material-symbols-outlined text-[15px] animate-pulse">auto_awesome</span>
                                Instructivo IA (PDF)
                              </button>
                              {!isLocked && (
                                 <button onClick={() => addEventToRole(role.role)} className="px-3 py-1.5 bg-white/10 hover:bg-white text-white hover:text-slate-900 border border-white/20 rounded-lg text-xs font-bold transition-colors flex items-center gap-1 print:hidden">
                                   <span className="material-symbols-outlined text-[16px]">add_task</span>
                                   Añadir Actividad
                                 </button>
                              )}
                            </div>
                          </div>
                          <div className="p-4 bg-slate-50/50 print:bg-white print:p-2">
                            {schedule.events.length === 0 ? (
                              <p className="text-sm text-slate-400 italic text-center py-4 print:text-black">Sin actividades programadas para este rol.</p>
                            ) : (
                              <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm print:border-none print:shadow-none">
                                <table className="w-full text-left border-collapse">
                                  <thead>
                                    <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-black text-slate-400 uppercase tracking-wider print:border-b print:text-black">
                                      <th className="p-3 w-1/4">Fecha / Día</th>
                                      <th className="p-3 w-1/6">Hora</th>
                                      <th className="p-3 w-2/5">Instrucción / Actividad</th>
                                      <th className="p-3 w-1/4">Lugar / Ubicación</th>
                                      {!isLocked && <th className="p-3 w-[80px] print:hidden text-center">Acciones</th>}
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100">
                                    {schedule.events.map((ev, eIdx) => (
                                      <tr key={ev.id} className="hover:bg-slate-50/30 transition-colors">
                                        <td className="p-1 text-sm">
                                          {(isLocked || isExportingPdf) ? (
                                            <span className="px-2 py-1.5 text-slate-700 font-bold block">{ev.date || ''}</span>
                                          ) : (
                                            <input 
                                              type="text"
                                              value={ev.date || ''}
                                              onChange={e => updateEvent(role.role, ev.id, 'date', e.target.value)}
                                              placeholder="Ej. Sábado 07 de Febrero"
                                              className="w-full px-2 py-1.5 bg-transparent border border-transparent hover:border-slate-200 hover:bg-slate-50/50 focus:bg-white focus:border-primary focus:ring-1 focus:ring-primary outline-none rounded-lg text-xs font-bold text-slate-700 transition-all"
                                            />
                                          )}
                                        </td>
                                        <td className="p-1 text-sm">
                                          {(isLocked || isExportingPdf) ? (
                                            <span className="px-2 py-1.5 text-slate-700 font-bold block">{ev.time}</span>
                                          ) : (
                                            <input 
                                              type="text"
                                              value={ev.time}
                                              onChange={e => updateEvent(role.role, ev.id, 'time', e.target.value)}
                                              placeholder="Ej. 06:00 a 06:30"
                                              className="w-full px-2 py-1.5 bg-transparent border border-transparent hover:border-slate-200 hover:bg-slate-50/50 focus:bg-white focus:border-primary focus:ring-1 focus:ring-primary outline-none rounded-lg text-xs font-bold text-slate-700 transition-all"
                                            />
                                          )}
                                        </td>
                                        <td className="p-1 text-sm">
                                          {(isLocked || isExportingPdf) ? (
                                            <span className="px-2 py-1.5 text-slate-700 whitespace-pre-line block leading-relaxed">{ev.activity}</span>
                                          ) : (
                                            <AutoResizeTextarea
                                              value={ev.activity}
                                              onChange={(e: any) => updateEvent(role.role, ev.id, 'activity', e.target.value)}
                                              placeholder="¿Qué labor realiza?"
                                              className="w-full px-2 py-1.5 bg-transparent border border-transparent hover:border-slate-200 hover:bg-slate-50/50 focus:bg-white focus:border-primary focus:ring-1 focus:ring-primary outline-none rounded-lg text-xs font-bold text-slate-700 transition-all font-sans"
                                            />
                                          )}
                                        </td>
                                        <td className="p-1 text-sm">
                                          {(isLocked || isExportingPdf) ? (
                                            <span className="px-2 py-1.5 text-slate-600 block">{ev.location}</span>
                                          ) : (
                                            <input 
                                              type="text"
                                              value={ev.location}
                                              onChange={e => updateEvent(role.role, ev.id, 'location', e.target.value)}
                                              placeholder="Ej. Puerta 5, Pabellón..."
                                              className="w-full px-2 py-1.5 bg-transparent border border-transparent hover:border-slate-200 hover:bg-slate-50/50 focus:bg-white focus:border-primary focus:ring-1 focus:ring-primary outline-none rounded-lg text-xs font-bold text-slate-600 transition-all"
                                            />
                                          )}
                                        </td>
                                        {!isLocked && (
                                          <td className="p-1 text-center print:hidden">
                                            <button 
                                              onClick={() => removeEvent(role.role, ev.id)}
                                              className="p-1.5 hover:bg-red-50 text-slate-400 hover:text-red-500 rounded-lg transition-colors"
                                              title="Eliminar actividad"
                                            >
                                              <span className="material-symbols-outlined text-[18px]">delete</span>
                                            </button>
                                          </td>
                                        )}
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        
        {showAddEventModal && (
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 print:hidden">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200">
              <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                <h3 className="font-black text-slate-800 uppercase tracking-tight text-sm">
                  Añadir Actividad para {activeRoleForAddEvent}
                </h3>
                <button onClick={() => setShowAddEventModal(false)} className="text-slate-400 hover:text-slate-600">
                  <span className="material-symbols-outlined text-[20px]">close</span>
                </button>
              </div>
              <div className="p-6 space-y-4">
                {/* Selector de Origen de Actividad */}
                <div className="flex bg-slate-100 p-1 rounded-xl">
                  <button
                    type="button"
                    onClick={() => setAddEventSource('custom')}
                    className={`flex-1 py-1.5 text-xs font-black uppercase tracking-wider rounded-lg transition-all ${
                      addEventSource === 'custom'
                        ? 'bg-white text-slate-950 shadow-sm'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    ✍️ Personalizada
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAddEventSource('general');
                      setSelectedGeneralGroup('');
                      setSelectedGeneralActivityId('');
                    }}
                    className={`flex-1 py-1.5 text-xs font-black uppercase tracking-wider rounded-lg transition-all ${
                      addEventSource === 'general'
                        ? 'bg-white text-slate-950 shadow-sm'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    📋 Del Cronograma General
                  </button>
                </div>

                {addEventSource === 'general' && (
                  <div className="p-4 bg-slate-50 rounded-xl border border-slate-200/60 space-y-3">
                    <div>
                      <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1">
                        1. Seleccionar Rubro / Comisión
                      </label>
                      <select
                        value={selectedGeneralGroup}
                        onChange={e => {
                          setSelectedGeneralGroup(e.target.value);
                          setSelectedGeneralActivityId('');
                        }}
                        className="w-full p-2.5 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:border-primary bg-white"
                      >
                        <option value="">-- Seleccione un Rubro --</option>
                        {Array.from(new Set(generalSchedules.map((g: any) => g.group).filter(Boolean))).map((groupName: any) => (
                          <option key={groupName} value={groupName}>{groupName}</option>
                        ))}
                      </select>
                    </div>

                    {selectedGeneralGroup && (
                      <div>
                        <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1">
                          2. Seleccionar Actividad del Cronograma
                        </label>
                        <select
                          value={selectedGeneralActivityId}
                          onChange={e => handleSelectGeneralActivity(e.target.value)}
                          className="w-full p-2.5 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:border-primary bg-white"
                        >
                          <option value="">-- Seleccione una Actividad --</option>
                          {generalSchedules
                            .filter((g: any) => g.group === selectedGeneralGroup)
                            .map((act: any) => (
                              <option key={act.id} value={act.id}>
                                [{act.time}] {act.activity.length > 50 ? act.activity.substring(0, 50) + '...' : act.activity}
                              </option>
                            ))}
                        </select>
                      </div>
                    )}
                  </div>
                )}

                {addEventSource === 'general' && selectedGeneralActivityId && (
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider pt-2 border-t border-dashed border-slate-200">
                    Confirmar o Ajustar Datos de la Actividad:
                  </p>
                )}

                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">Fecha</label>
                  {!isCustomDate && uniqueScheduleDates.length > 0 ? (
                    <div className="flex gap-2">
                      <select 
                        value={newEventForm.date}
                        onChange={e => {
                          if (e.target.value === '__custom__') {
                            setIsCustomDate(true);
                            setNewEventForm(prev => ({ ...prev, date: '' }));
                          } else {
                            setNewEventForm(prev => ({ ...prev, date: e.target.value }));
                          }
                        }}
                        className="w-full p-3 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 focus:outline-none focus:border-primary bg-slate-50"
                      >
                        {uniqueScheduleDates.map(d => (
                          <option key={d} value={d}>{d}</option>
                        ))}
                        <option value="__custom__">✍️ Escribir fecha personalizada...</option>
                      </select>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <input 
                        type="text"
                        placeholder="Ej. Sábado 07 de Febrero de 2026"
                        value={newEventForm.date}
                        onChange={e => setNewEventForm(prev => ({ ...prev, date: e.target.value }))}
                        className="w-full p-3 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 focus:outline-none focus:border-primary bg-slate-50"
                      />
                      {uniqueScheduleDates.length > 0 && (
                        <button 
                          type="button" 
                          onClick={() => {
                            setIsCustomDate(false);
                            setNewEventForm(prev => ({ ...prev, date: uniqueScheduleDates[0] }));
                          }} 
                          className="text-xs font-bold text-primary hover:underline flex items-center gap-1"
                        >
                          <span className="material-symbols-outlined text-[14px]">arrow_back</span>
                          Volver a fechas predefinidas
                        </button>
                      )}
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">Rango de Horas / Hora</label>
                  <input 
                    type="text"
                    placeholder="Ej. 08:00, 10:00 a 12:00..."
                    value={newEventForm.time}
                    onChange={e => setNewEventForm(prev => ({ ...prev, time: e.target.value }))}
                    className="w-full p-3 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 focus:outline-none focus:border-primary bg-slate-50"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">Ubicación (Opcional)</label>
                  <input 
                    type="text"
                    placeholder="Ej. Aula asignada, Pabellón de Química..."
                    value={newEventForm.location}
                    onChange={e => setNewEventForm(prev => ({ ...prev, location: e.target.value }))}
                    className="w-full p-3 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 focus:outline-none focus:border-primary bg-slate-50"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">Instrucción / Actividad</label>
                  <textarea 
                    rows={4}
                    placeholder="Escriba detalladamente la instrucción..."
                    value={newEventForm.activity}
                    onChange={e => setNewEventForm(prev => ({ ...prev, activity: e.target.value }))}
                    className="w-full p-3 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 focus:outline-none focus:border-primary bg-slate-50 font-sans"
                  />
                </div>
              </div>
              <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-2 bg-slate-50/50">
                <button 
                  onClick={() => setShowAddEventModal(false)}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-200 bg-slate-100 rounded-xl text-xs font-bold uppercase tracking-wider transition-colors"
                >
                  Cancelar
                </button>
                <button 
                  onClick={saveNewEvent}
                  className="px-4 py-2 bg-primary hover:bg-primary/90 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-colors shadow-sm"
                >
                  Agregar Actividad
                </button>
              </div>
            </div>
          </div>
        )}

        {showInstructiveModal && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 print:hidden">
            <div className="bg-slate-100 rounded-2xl shadow-2xl w-full max-w-6xl h-[90vh] overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200 border border-slate-200">
              {/* Header */}
              <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-center bg-white">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary text-[20px]">description</span>
                  <div>
                    <h3 className="font-black text-slate-800 uppercase tracking-tight text-sm">Instructivo de Rol Oficial UNSAAC</h3>
                    <p className="text-[10px] text-slate-500 font-bold uppercase">Rol: {instructiveRole}</p>
                  </div>
                </div>
                <button 
                  onClick={() => setShowInstructiveModal(false)} 
                  className="text-slate-400 hover:text-slate-600 transition-colors"
                >
                  <span className="material-symbols-outlined text-[20px]">close</span>
                </button>
              </div>

              {/* Split Content Pane */}
              <div className="flex-1 overflow-hidden flex flex-col lg:flex-row">
                {/* Left panel - Raw text editor */}
                <div className="w-full lg:w-1/2 p-6 flex flex-col border-b lg:border-b-0 lg:border-r border-slate-200 bg-white relative">
                  <div className="flex justify-between items-center mb-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Texto del Instructivo (Editable)</label>
                    <span className="text-[9px] text-slate-400 font-bold">Edite el texto directamente para personalizar el PDF</span>
                  </div>
                  
                  <div className="flex-1 relative flex flex-col">
                    <textarea
                      value={instructiveText}
                      onChange={(e) => setInstructiveText(e.target.value)}
                      disabled={isGeneratingInstructive}
                      className="flex-1 w-full p-4 border border-slate-200 rounded-xl font-sans text-xs text-slate-700 leading-relaxed focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary bg-slate-50/50 resize-none overflow-y-auto"
                      placeholder="Contenido del instructivo institucional..."
                    />

                    {isGeneratingInstructive && (
                      <div className="absolute inset-0 bg-white/85 backdrop-blur-[1px] flex flex-col items-center justify-center text-center p-4 rounded-xl animate-in fade-in duration-200">
                        <div className="w-10 h-10 border-4 border-slate-200 border-t-primary rounded-full animate-spin mb-3"></div>
                        <p className="font-bold text-xs text-slate-800 uppercase">Personalizando con IA...</p>
                        <p className="text-[10px] text-slate-500 max-w-xs mt-1">Estructurando con lenguaje formal y riguroso de la Oficina de Admisión.</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Right panel - Paper print Preview */}
                <div className="w-full lg:w-1/2 p-6 flex flex-col bg-slate-100 overflow-hidden">
                  <div className="mb-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Vista de Impresión Oficial (PDF)</label>
                  </div>
                  
                  {/* The formal document container */}
                  <div className="flex-1 overflow-y-auto bg-white border border-slate-200 rounded-xl p-8 shadow-inner relative max-h-full">
                    {/* Document Sheet Start */}
                    <div id="role-instructive-pdf-area" className="bg-white text-black p-2 font-sans select-none instructive-markdown-content">
                      {/* Styles for rendering the markdown beautiful */}
                      <style>{`
                        .instructive-markdown-content h1 {
                          font-size: 13px !important;
                          font-weight: 800 !important;
                          text-transform: uppercase !important;
                          margin-top: 16px !important;
                          margin-bottom: 8px !important;
                          border-bottom: 1.5px solid #0f172a !important;
                          padding-bottom: 2px !important;
                          color: #0f172a !important;
                        }
                        .instructive-markdown-content h2 {
                          font-size: 11px !important;
                          font-weight: 800 !important;
                          text-transform: uppercase !important;
                          margin-top: 12px !important;
                          margin-bottom: 6px !important;
                          color: #1e293b !important;
                        }
                        .instructive-markdown-content h3 {
                          font-size: 10px !important;
                          font-weight: 700 !important;
                          margin-top: 8px !important;
                          margin-bottom: 4px !important;
                          color: #334155 !important;
                        }
                        .instructive-markdown-content p {
                          font-size: 10px !important;
                          line-height: 1.5 !important;
                          margin-bottom: 8px !important;
                          text-align: justify !important;
                          color: #1e293b !important;
                        }
                        .instructive-markdown-content ul, .instructive-markdown-content ol {
                          margin-bottom: 10px !important;
                          padding-left: 16px !important;
                        }
                        .instructive-markdown-content li {
                          font-size: 10px !important;
                          line-height: 1.5 !important;
                          margin-bottom: 4px !important;
                          color: #1e293b !important;
                          list-style-type: disc !important;
                        }
                        .instructive-markdown-content strong {
                          font-weight: 700 !important;
                          color: #0f172a !important;
                        }
                        .instructive-markdown-content table {
                          width: 100% !important;
                          border-collapse: collapse !important;
                          margin-top: 10px !important;
                          margin-bottom: 12px !important;
                          font-size: 9px !important;
                        }
                        .instructive-markdown-content th {
                          background-color: #f8fafc !important;
                          border: 1px solid #cbd5e1 !important;
                          padding: 6px 8px !important;
                          font-weight: 800 !important;
                          text-align: left !important;
                          text-transform: uppercase !important;
                          color: #0f172a !important;
                        }
                        .instructive-markdown-content tr {
                          page-break-inside: avoid !important;
                        }
                        .instructive-markdown-content td {
                          border: 1px solid #cbd5e1 !important;
                          padding: 6px 8px !important;
                          color: #334155 !important;
                          vertical-align: top !important;
                        }
                      `}</style>

                      {/* Letterhead */}
                      <div className="flex items-center pb-4 border-b-2 border-slate-900 mb-6" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                        <div style={{ width: '80px', textAlign: 'left' }}>
                          <img 
                            src="https://cnqpzyanmmwspvemcfeb.supabase.co/storage/v1/object/public/logos/escudo%20oficial-02%20(2).png" 
                            alt="UNSAAC Escudo" 
                            className="h-16 w-auto object-contain" 
                            referrerPolicy="no-referrer" 
                          />
                        </div>
                        <div style={{ flex: 1, textAlign: 'center', padding: '0 10px' }}>
                          <h2 className="font-extrabold text-[12px] text-slate-900 uppercase leading-tight tracking-wider" style={{ margin: 0, padding: 0, textAlign: 'center' }}>Universidad Nacional de San Antonio Abad del Cusco</h2>
                          <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest" style={{ margin: '4px 0 0 0', padding: 0, textAlign: 'center' }}>Oficina de Admisión</p>
                        </div>
                        <div style={{ width: '80px', textAlign: 'right' }}>
                          <img 
                            src="https://cnqpzyanmmwspvemcfeb.supabase.co/storage/v1/object/public/logos/logo%20admision%201.png" 
                            alt="Oficina de Admisión Logo" 
                            className="h-16 w-auto object-contain" 
                            referrerPolicy="no-referrer" 
                          />
                        </div>
                      </div>

                      {/* Document Title */}
                      <div className="text-center mb-6">
                        <h1 className="text-[13px] font-black text-slate-900 uppercase tracking-wide leading-tight">
                          INSTRUCTIVO OFICIAL DE FUNCIONES, DEBERES Y PROTOCOLOS
                        </h1>
                        <p className="text-[10px] font-black text-primary uppercase tracking-widest mt-1">
                          CARGO OPERATIVO: {instructiveRole}
                        </p>
                        <p className="text-[9px] font-semibold text-slate-500 uppercase mt-0.5">
                          Proceso: {getModalidadName(selectedModalidad)} | Cuadro: {getCuadroName(selectedCuadro)}
                        </p>
                      </div>

                      {/* Markdown Generated Content */}
                      <div className="markdown-body">
                        <Markdown remarkPlugins={[remarkGfm]}>{instructiveText}</Markdown>
                      </div>

                      {/* Signatures Footer */}
                      <div className="mt-12 flex justify-around items-center pt-8 border-t border-slate-200">
                        <div className="text-center">
                          <div className="w-40 h-0.5 bg-slate-400 mx-auto mb-1"></div>
                          <p className="text-[9px] font-black uppercase text-slate-700">Director de Admisión</p>
                          <p className="text-[8px] text-slate-500">Oficina de Admisión - UNSAAC</p>
                        </div>
                        <div className="text-center">
                          <div className="w-40 h-0.5 bg-slate-400 mx-auto mb-1"></div>
                          <p className="text-[9px] font-black uppercase text-slate-700">Vicerrector Académico</p>
                          <p className="text-[8px] text-slate-500">UNSAAC</p>
                        </div>
                      </div>
                    </div>
                    {/* Document Sheet End */}
                  </div>
                </div>
              </div>

              {/* Footer Controls */}
              <div className="px-6 py-4 border-t border-slate-200 flex justify-between items-center bg-white">
                <button
                  onClick={improveInstructiveWithAI}
                  disabled={isGeneratingInstructive}
                  className="px-4 py-2 text-primary border border-primary/30 hover:bg-primary/5 disabled:opacity-50 rounded-xl text-xs font-bold uppercase tracking-wider transition-colors flex items-center gap-1.5 shadow-sm"
                  title="Optimiza y refina el contenido utilizando la Inteligencia Artificial de Gemini"
                >
                  {isGeneratingInstructive ? (
                    <>
                      <div className="w-3 h-3 border-2 border-primary/25 border-t-primary rounded-full animate-spin"></div>
                      Personalizando...
                    </>
                  ) : (
                    <>
                      <span className="material-symbols-outlined text-[16px] animate-pulse">auto_awesome</span>
                      Personalizar con IA (Gemini)
                    </>
                  )}
                </button>
                <div className="flex gap-2">
                  <button 
                    onClick={() => setShowInstructiveModal(false)}
                    className="px-4 py-2 text-slate-600 hover:bg-slate-200 bg-slate-100 rounded-xl text-xs font-bold uppercase tracking-wider transition-colors"
                  >
                    Cerrar
                  </button>
                  <button 
                    onClick={handlePrintInstructivePdf}
                    disabled={isSavingInstructivePdf || !instructiveText}
                    className="px-5 py-2 bg-primary hover:bg-primary/90 disabled:opacity-50 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-colors shadow-sm flex items-center gap-1.5"
                  >
                    {isSavingInstructivePdf ? (
                      <>
                        <div className="w-3 h-3 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                        Generando PDF...
                      </>
                    ) : (
                      <>
                        <span className="material-symbols-outlined text-[16px]">picture_as_pdf</span>
                        Descargar PDF Oficial
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
