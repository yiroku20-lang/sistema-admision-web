
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { User, ToastMessage, CalendarEvent, EventoPersonalAsignado, ColegioItinerario } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { 
  format, 
  startOfMonth, 
  endOfMonth, 
  startOfWeek, 
  endOfWeek, 
  eachDayOfInterval, 
  isSameMonth, 
  isSameDay, 
  addMonths, 
  subMonths,
  parseISO,
  isWithinInterval,
  addDays,
  differenceInCalendarMonths
} from 'date-fns';
import { es } from 'date-fns/locale';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface CalendarEventsProps {
  user: User;
  notify: (msg: string, type?: ToastMessage['type']) => void;
}

const EVENT_TYPES = [
  { label: 'Inscripción', color: 'bg-emerald-500', text: 'text-emerald-700', bg: 'bg-emerald-50' },
  { label: 'Examen', color: 'bg-rose-500', text: 'text-rose-700', bg: 'bg-rose-50' },
  { label: 'Reunión', color: 'bg-amber-500', text: 'text-amber-700', bg: 'bg-amber-50' },
  { label: 'Evento', color: 'bg-sky-500', text: 'text-sky-700', bg: 'bg-sky-50' },
  { label: 'Feriado', color: 'bg-purple-600', text: 'text-purple-800', bg: 'bg-purple-50' },
  { label: 'Visita a Colegios', color: 'bg-violet-600', text: 'text-violet-700', bg: 'bg-violet-50' },
  { label: 'Gira Vocacional', color: 'bg-teal-600', text: 'text-teal-700', bg: 'bg-teal-50' },
  { label: 'Feria Vocacional', color: 'bg-pink-600', text: 'text-pink-700', bg: 'bg-pink-50' },
  { label: 'Capacitación', color: 'bg-amber-600', text: 'text-amber-700', bg: 'bg-amber-50' },
  { label: 'Otro', color: 'bg-slate-500', text: 'text-slate-700', bg: 'bg-slate-50' },
];

const PROCESS_PALETTES = [
    { bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-400', dot: 'bg-indigo-400' },
    { bg: 'bg-teal-50', text: 'text-teal-700', border: 'border-teal-400', dot: 'bg-teal-400' },
    { bg: 'bg-pink-50', text: 'text-pink-700', border: 'border-pink-400', dot: 'bg-pink-400' },
    { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-400', dot: 'bg-orange-400' },
    { bg: 'bg-violet-50', text: 'text-violet-700', border: 'border-violet-400', dot: 'bg-violet-400' },
    { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-400', dot: 'bg-blue-400' },
];

export const getProcessColor = (proceso: string | undefined) => {
    if (!proceso || proceso.trim() === '') return null;
    let hash = 0;
    for (let i = 0; i < proceso.length; i++) {
        hash = proceso.charCodeAt(i) + ((hash << 5) - hash);
    }
    const index = Math.abs(hash) % PROCESS_PALETTES.length;
    return PROCESS_PALETTES[index];
};

export const CalendarEvents: React.FC<CalendarEventsProps> = ({ user, notify }) => {
  const [currentMonth, setCurrentMonth] = useState(new Date()); // Represents the logically active viewing month
  const gridRef = useRef<HTMLDivElement>(null);
  const monthRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // 3 años de calendario: 12 meses atrás + mes actual + 24 meses adelante (suficiente para un ciclo universitario sin ser pesado)
  const scrollRange = useMemo(() => {
    return {
       start: startOfWeek(startOfMonth(subMonths(new Date(), 12)), { weekStartsOn: 0 }),
       end: endOfWeek(endOfMonth(addMonths(new Date(), 24)), { weekStartsOn: 0 })
    };
  }, []);

  const [events, setEvents] = useState<CalendarEvent[]>([]);
  
  // Custom Filters
  const [filterProceso, setFilterProceso] = useState<string>('Todos');
  const [filterAudiencia, setFilterAudiencia] = useState<string>('Todas');
  const [filterTipo, setFilterTipo] = useState<string>('Todos');
  const [searchQuery, setSearchQuery] = useState<string>('');
  
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [exportStartMonth, setExportStartMonth] = useState(format(new Date(), 'yyyy-MM'));
  const [exportEndMonth, setExportEndMonth] = useState(format(addMonths(new Date(), 1), 'yyyy-MM'));
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [hoveredEventId, setHoveredEventId] = useState<string | null>(null);

  // Form State with Operational Fields
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    start_date: format(new Date(), 'yyyy-MM-dd'),
    end_date: format(new Date(), 'yyyy-MM-dd'),
    type: 'Evento' as CalendarEvent['type'],
    color: '#0ea5e9',
    proceso: '',
    audiencia: 'Público General' as CalendarEvent['audiencia'],
    lugar: '',
    hora: '',
    estado_evento: 'Programado' as NonNullable<CalendarEvent['estado_evento']>,
    personal_asignado: [] as EventoPersonalAsignado[],
    colegios_itinerario: [] as ColegioItinerario[]
  });

  // Variables de control condicional según el Tipo de Evento
  const isVisita = formData.type === 'Visita a Colegios';
  const isGira = formData.type === 'Gira Vocacional';
  const isFeria = formData.type === 'Feria Vocacional';
  const isCapacitacion = formData.type === 'Capacitación';
  // Define si el evento requiere campos operativos de campo
  const isFieldEvent = isVisita || isGira || isFeria || isCapacitacion;

  // Regiones principales de influencia de la UNSAAC
  const REGIONES_GIRA = ['Cusco', 'Apurímac', 'Puno', 'Madre de Dios', 'Todas'];
  const [selectedRegionColegio, setSelectedRegionColegio] = useState<string>('Cusco');

  // Helper para normalizar caracteres de departamentos de la BD
  const formatDepartamento = (dep?: string) => {
    if (!dep) return '';
    return dep
      .replace(/Apur.*mac/i, 'Apurímac')
      .replace(/Ã¡/g, 'á')
      .replace(/Ã©/g, 'é')
      .replace(/Ã­/g, 'í')
      .replace(/Ã³/g, 'ó')
      .replace(/Ãº/g, 'ú')
      .replace(/Ã±/g, 'ñ')
      .replace(/Ã‘/g, 'Ñ');
  };

  // Estados para autocompletado de Colegios
  const [colegioSearchTerm, setColegioSearchTerm] = useState('');
  const [colegioSearchResults, setColegioSearchResults] = useState<any[]>([]);
  const [showColegioDropdown, setShowColegioDropdown] = useState(false);
  const [isSearchingColegio, setIsSearchingColegio] = useState(false);
  const colegioDropdownRef = useRef<HTMLDivElement>(null);
  const lastSelectedColegioRef = useRef<string>('');

  // Efecto de búsqueda optimizado para Colegios por Región (con debounce y soporte interregional)
  useEffect(() => {
    const term = colegioSearchTerm.trim();
    if (!term || term === lastSelectedColegioRef.current) return;
    if (term.length < 2) {
      setColegioSearchResults([]);
      setShowColegioDropdown(false);
      return;
    }
    const queryPattern = term.replace(/\s+/g, '%');
    const timer = setTimeout(async () => {
      setIsSearchingColegio(true);
      try {
        let query = supabase
          .from('colegios')
          .select('id, codigo_modular, nombre_ie, nivel_modalidad, provincia, distrito, departamento')
          .or(`nombre_ie.ilike.%${queryPattern}%,distrito.ilike.%${queryPattern}%,provincia.ilike.%${queryPattern}%`)
          .order('nivel_modalidad', { ascending: false })
          .limit(8);

        // Si no es 'Todas', filtra por el departamento seleccionado
        if (selectedRegionColegio !== 'Todas') {
          const cleanRegion = selectedRegionColegio.startsWith('Apur')
            ? 'Apur'
            : selectedRegionColegio.replace(/í/g, '_').replace(/á/g, '_');
          query = query.ilike('departamento', `%${cleanRegion}%`);
        }

        const { data, error } = await query;
        if (!error && data && data.length > 0) {
          setColegioSearchResults(data);
          setShowColegioDropdown(true);
        } else {
          setColegioSearchResults([]);
          setShowColegioDropdown(false);
        }
      } catch (err) {
        console.error('Error buscando colegios:', err);
      } finally {
        setIsSearchingColegio(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [colegioSearchTerm, selectedRegionColegio]);

  const handleSelectColegio = (col: any) => {
    lastSelectedColegioRef.current = col.nombre_ie;
    setColegioSearchResults([]);
    setShowColegioDropdown(false);

    if (isGira) {
      handleAddColegioItinerario(col);
    } else {
      const depDisplay = formatDepartamento(col.departamento);
      const depSuffix = depDisplay && depDisplay.toUpperCase() !== 'CUSCO' ? `, ${depDisplay}` : '';
      const formattedLugar = `${col.nombre_ie} (${col.nivel_modalidad || 'Secundaria'} - ${col.distrito || col.provincia}${depSuffix})`;
      setFormData(prev => ({
        ...prev,
        lugar: formattedLugar,
        // Sugerir título si está vacío o es genérico
        title: (!prev.title || prev.title.startsWith('Visita a I.E.')) 
          ? `Visita a I.E. ${col.nombre_ie}` 
          : prev.title
      }));
      setColegioSearchTerm(col.nombre_ie);
    }
  };

  // Agregar colegio al Itinerario de la Gira Vocacional (guardando departamento)
  const handleAddColegioItinerario = (col: any) => {
    const isAlreadyAdded = formData.colegios_itinerario?.some(
      c => (col.codigo_modular && c.codigo_modular === col.codigo_modular) || 
           c.nombre_ie.toLowerCase().trim() === (col.nombre_ie || '').toLowerCase().trim()
    );
    if (isAlreadyAdded) {
      notify('Este colegio ya se encuentra en el itinerario de la gira', 'warning');
      setColegioSearchTerm('');
      lastSelectedColegioRef.current = '';
      return;
    }
    const depDisplay = formatDepartamento(col.departamento) || (selectedRegionColegio !== 'Todas' ? selectedRegionColegio : 'Cusco');
    const nuevoItem: ColegioItinerario = {
      id: col.id || Date.now().toString(),
      codigo_modular: col.codigo_modular,
      nombre_ie: col.nombre_ie,
      nivel_modalidad: col.nivel_modalidad || 'Secundaria',
      distrito: col.distrito || '',
      provincia: col.provincia || 'Cusco',
      departamento: depDisplay,
      dia_estimado: `Día ${(formData.colegios_itinerario?.length || 0) + 1}`
    };
    setFormData(prev => ({
      ...prev,
      colegios_itinerario: [...(prev.colegios_itinerario || []), nuevoItem],
      title: (!prev.title || prev.title.startsWith('Gira Vocacional')) 
        ? `Gira Vocacional: ${prev.lugar || col.provincia || depDisplay || 'Región'}` 
        : prev.title
    }));
    setColegioSearchTerm('');
    lastSelectedColegioRef.current = '';
    setColegioSearchResults([]);
    setShowColegioDropdown(false);
  };

  // Alias para compatibilidad
  const handleAddColegioToItinerario = handleAddColegioItinerario;

  // Agregar colegio manual o personalizado al Itinerario
  const handleAddCustomColegioItinerario = () => {
    const term = colegioSearchTerm.trim();
    if (!term) return;
    const depDisplay = selectedRegionColegio !== 'Todas' ? selectedRegionColegio : 'Cusco';
    const nuevoItem: ColegioItinerario = {
      id: Date.now().toString(),
      nombre_ie: term,
      nivel_modalidad: 'Secundaria',
      distrito: 'Por definir',
      provincia: formData.lugar?.split(/[:,-]/)[0]?.trim() || 'Provincia',
      departamento: depDisplay,
      dia_estimado: `Día ${(formData.colegios_itinerario?.length || 0) + 1}`
    };
    setFormData(prev => ({
      ...prev,
      colegios_itinerario: [...(prev.colegios_itinerario || []), nuevoItem]
    }));
    setColegioSearchTerm('');
    lastSelectedColegioRef.current = '';
    setColegioSearchResults([]);
    setShowColegioDropdown(false);
  };

  // Quitar colegio del itinerario
  const handleRemoveColegioItinerario = (index: number) => {
    setFormData(prev => ({
      ...prev,
      colegios_itinerario: (prev.colegios_itinerario || []).filter((_, i) => i !== index)
    }));
  };

  // Modificar día o turno estimado en el itinerario
  const handleUpdateColegioDia = (index: number, dia: string) => {
    setFormData(prev => ({
      ...prev,
      colegios_itinerario: (prev.colegios_itinerario || []).map((c, i) => 
        i === index ? { ...c, dia_estimado: dia } : c
      )
    }));
  };

  // Staff Search State for personal_directorio Autocomplete
  const [staffSearchTerm, setStaffSearchTerm] = useState('');
  const [staffSearchResults, setStaffSearchResults] = useState<any[]>([]);
  const [showStaffDropdown, setShowStaffDropdown] = useState(false);
  const staffDropdownRef = useRef<HTMLDivElement>(null);

  // Real-time Staff Search from personal_directorio with wildcard % for spaces
  useEffect(() => {
    const searchStaff = async () => {
      const term = staffSearchTerm.trim();
      if (term.length < 2) {
        setStaffSearchResults([]);
        setShowStaffDropdown(false);
        return;
      }
      const queryPattern = term.replace(/\s+/g, '%');
      try {
        const { data, error } = await supabase
          .from('personal_directorio')
          .select('*')
          .or(`nombre.ilike.%${queryPattern}%,dni.ilike.%${queryPattern}%`)
          .limit(10);
        if (!error && data) {
          setStaffSearchResults(data);
          setShowStaffDropdown(true);
        } else {
          setStaffSearchResults([]);
          setShowStaffDropdown(false);
        }
      } catch (err) {
        console.error('Error buscando en personal_directorio:', err);
      }
    };
    const debounceId = setTimeout(searchStaff, 250);
    return () => clearTimeout(debounceId);
  }, [staffSearchTerm]);

  // Click outside to close dropdowns (Staff & Colegios)
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (staffDropdownRef.current && !staffDropdownRef.current.contains(event.target as Node)) {
        setShowStaffDropdown(false);
      }
      if (colegioDropdownRef.current && !colegioDropdownRef.current.contains(event.target as Node)) {
        setShowColegioDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleAddStaff = (person: any) => {
    const alreadyExists = formData.personal_asignado.some(
      p => p.dni === person.dni || p.id === person.id
    );
    if (alreadyExists) {
      notify(`"${person.nombre}" ya está en la delegación de este evento.`, 'warning');
      return;
    }
    const defaultRol: EventoPersonalAsignado['rol_comision'] = 
      formData.personal_asignado.length === 0 ? 'Coordinador' : 'Participante';

    const newMember: EventoPersonalAsignado = {
      id: person.id || person.dni,
      dni: person.dni,
      nombre: person.nombre,
      telefono: person.telefono || '',
      correo: person.correo || '',
      dependencia: person.facultad_dependencia || person.departamento_cargo || '',
      rol_comision: defaultRol
    };

    setFormData(prev => ({
      ...prev,
      personal_asignado: [...prev.personal_asignado, newMember]
    }));
    setStaffSearchTerm('');
    setShowStaffDropdown(false);
    setStaffSearchResults([]);
  };

  const handleUpdateStaffRole = (dni: string, role: EventoPersonalAsignado['rol_comision']) => {
    setFormData(prev => ({
      ...prev,
      personal_asignado: prev.personal_asignado.map(m => m.dni === dni ? { ...m, rol_comision: role } : m)
    }));
  };

  const handleRemoveStaff = (dni: string) => {
    setFormData(prev => ({
      ...prev,
      personal_asignado: prev.personal_asignado.filter(m => m.dni !== dni)
    }));
  };

  // Generador de Ficha de Comisión y Hoja de Ruta de Giras Vocacionales en PDF
  const exportComisionPDF = (eventData?: CalendarEvent | null) => {
    const ev = eventData || selectedEvent || {
      id: 'preview',
      title: formData.title,
      description: formData.description,
      start_date: formData.start_date,
      end_date: formData.end_date,
      type: formData.type,
      color: formData.color,
      proceso: formData.proceso,
      audiencia: formData.audiencia,
      lugar: formData.lugar,
      hora: formData.hora,
      estado_evento: formData.estado_evento,
      personal_asignado: formData.personal_asignado,
      colegios_itinerario: formData.colegios_itinerario,
      created_at: new Date().toISOString()
    };

    if (!ev.title) {
      notify('Por favor ingrese al menos el título de la actividad para generar el documento', 'warning');
      return;
    }

    const isEvGira = ev.type === 'Gira Vocacional';

    try {
      const doc = new jsPDF('portrait');
      const pageWidth = doc.internal.pageSize.width;
      const pageHeight = doc.internal.pageSize.height;

      // Franja superior institucional rojo UNSAAC #7B1523
      doc.setFillColor(123, 21, 35);
      doc.rect(0, 0, pageWidth, 6, 'F');

      // Membrete Superior
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.setTextColor(123, 21, 35);
      doc.text('UNIVERSIDAD NACIONAL DE SAN ANTONIO ABAD DEL CUSCO', pageWidth / 2, 17, { align: 'center' });

      doc.setFontSize(10.5);
      doc.setTextColor(70, 70, 70);
      doc.text('DIRECCIÓN DE ADMISIÓN', pageWidth / 2, 23, { align: 'center' });

      // Banner del Título Oficial
      doc.setFillColor(isEvGira ? 240 : 248, isEvGira ? 253 : 250, isEvGira ? 250 : 252);
      doc.setDrawColor(isEvGira ? 153 : 226, isEvGira ? 219 : 232, isEvGira ? 210 : 240);
      doc.roundedRect(14, 28, pageWidth - 28, 11, 2, 2, 'FD');
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(isEvGira ? 19 : 30, isEvGira ? 78 : 41, isEvGira ? 74 : 59);
      
      const docHeaderTitle = isEvGira 
        ? 'HOJA DE RUTA Y COMISIÓN DE DIFUSIÓN VOCACIONAL'
        : 'HOJA DE COMISIÓN DE VISITA INSTITUCIONAL';
      doc.text(docHeaderTitle, pageWidth / 2, 35, { align: 'center' });

      // Formatear Fechas del Viaje
      const isMultiDay = ev.start_date !== ev.end_date;
      const fechaTexto = isMultiDay
        ? `Del ${format(parseISO(ev.start_date), 'dd/MM/yyyy')} al ${format(parseISO(ev.end_date), 'dd/MM/yyyy')}`
        : format(parseISO(ev.start_date), 'dd/MM/yyyy');

      // 1. Tabla de Datos Operativos y Circuito
      const datosOperativosBody = isEvGira ? [
        ['ACTIVIDAD / GIRA:', (ev.title || '').toUpperCase()],
        ['CIRCUITO / ZONA PROVINCIAL:', (ev.lugar || 'No especificado').toUpperCase()],
        ['FECHAS DEL VIAJE (DESDE - HASTA):', fechaTexto],
        ['HORA DE SALIDA / PARTIDA:', ev.hora || '07:30 AM'],
        ['PROCESO DE ADMISIÓN:', ev.proceso || 'Institucional General'],
        ['ESTADO DE LA GIRA:', ev.estado_evento || 'Programado'],
        ['OBJETIVO / DESCRIPCIÓN:', ev.description || 'Promoción de la oferta académica y difusión de los concursos de admisión de la UNSAAC en colegios secundarios de la región.']
      ] : [
        ['ACTIVIDAD / EVENTO:', (ev.title || '').toUpperCase()],
        ['TIPO DE ACTIVIDAD:', ev.type || 'Evento'],
        ['COLEGIO / INSTITUCIÓN:', (ev.lugar || 'No especificado').toUpperCase()],
        ['FECHA PROGRAMADA:', fechaTexto],
        ['HORA DE ENCUENTRO / SALIDA:', ev.hora || 'Por coordinar'],
        ['PROCESO DE ADMISIÓN:', ev.proceso || 'Institucional General'],
        ['ESTADO DEL EVENTO:', ev.estado_evento || 'Programado'],
        ['OBJETIVO / DESCRIPCIÓN:', ev.description || 'Comisión oficial de difusión de carreras profesionales y orientación vocacional.']
      ];

      autoTable(doc, {
        startY: 42,
        margin: { left: 14, right: 14 },
        theme: 'plain',
        styles: { fontSize: 8.5, cellPadding: 2, textColor: [30, 41, 59] },
        columnStyles: {
          0: { fontStyle: 'bold', cellWidth: 62, textColor: [100, 116, 139] },
          1: { cellWidth: 'auto' },
        },
        body: datosOperativosBody
      });

      let currentY = (doc as any).lastAutoTable.finalY + 6;

      // 2. SI ES GIRA VOCACIONAL: TABLA DE RUTA DE COLEGIOS CON SELLO Y FIRMA
      if (isEvGira) {
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(19, 78, 74); // Teal oscuro
        doc.text('ITINERARIO DE COLEGIOS Y VISITAS (HOJA DE RUTA)', 14, currentY);

        const itinerario = ev.colegios_itinerario || [];
        const itinerarioTableData = itinerario.length > 0
          ? itinerario.map((col, idx) => [
              idx + 1,
              (col.nombre_ie || '').toUpperCase(),
              `${col.distrito || '-'} / ${col.provincia || 'Cusco'}${col.departamento && col.departamento.toUpperCase() !== 'CUSCO' ? ` (${col.departamento})` : ''}`,
              col.dia_estimado || `Día ${idx + 1}`,
              '' // Casillero en blanco para SELLO Y FIRMA DEL DIRECTOR
            ])
          : [
              ['1', (ev.lugar || 'COLEGIOS DE LA RUTA PROVINCIAL').toUpperCase(), 'CUSCO', 'Día 1', '']
            ];

        autoTable(doc, {
          startY: currentY + 3,
          margin: { left: 14, right: 14 },
          head: [['N°', 'COLEGIO / INSTITUCIÓN EDUCATIVA', 'DISTRITO / PROVINCIA', 'DÍA / TURNO', 'SELLO Y FIRMA DEL DIRECTOR']],
          body: itinerarioTableData,
          theme: 'grid',
          headStyles: {
            fillColor: [19, 78, 74],
            textColor: 255,
            fontSize: 7.5,
            fontStyle: 'bold',
            halign: 'center',
            valign: 'middle'
          },
          styles: {
            fontSize: 7.5,
            valign: 'middle',
            minCellHeight: 18, // Espacio amplio para sello físico y firma del director del colegio
            textColor: [30, 41, 59]
          },
          columnStyles: {
            0: { halign: 'center', cellWidth: 10 },
            1: { cellWidth: 62, fontStyle: 'bold' },
            2: { cellWidth: 44 },
            3: { halign: 'center', cellWidth: 26 },
            4: { cellWidth: 40 } // Sello y Firma del Director
          }
        });

        currentY = (doc as any).lastAutoTable.finalY + 6;
      }

      // 3. TABLA DE PERSONAL ASIGNADO / COMISIONADOS
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(123, 21, 35);
      doc.text(isEvGira ? 'PERSONAL COMISIONADO Y DELEGACIÓN INSTITUCIONAL' : 'DELEGACIÓN Y PERSONAL ASIGNADO', 14, currentY);

      const personal = ev.personal_asignado || [];
      const tableData = personal.length > 0
        ? personal.map((p, idx) => [
            idx + 1,
            (p.nombre || '').toUpperCase(),
            p.dni || '-',
            p.rol_comision || 'Participante',
            '' // Casillero en blanco para firma de asistencia
          ])
        : [['-', 'Sin integrantes registrados en la delegación oficial', '-', '-', '']];

      autoTable(doc, {
        startY: currentY + 3,
        margin: { left: 14, right: 14 },
        head: [['N°', 'APELLIDOS Y NOMBRES', 'DNI', 'CARGO / FUNCIÓN', 'FIRMA DE ASISTENCIA']],
        body: tableData,
        theme: 'grid',
        headStyles: {
          fillColor: [123, 21, 35],
          textColor: 255,
          fontSize: 7.5,
          fontStyle: 'bold',
          halign: 'center',
          valign: 'middle'
        },
        styles: {
          fontSize: 7.5,
          valign: 'middle',
          minCellHeight: 13,
          textColor: [30, 41, 59]
        },
        columnStyles: {
          0: { halign: 'center', cellWidth: 10 },
          1: { cellWidth: 78, fontStyle: 'bold' },
          2: { halign: 'center', cellWidth: 26 },
          3: { halign: 'center', cellWidth: 38 },
          4: { cellWidth: 30 }
        }
      });

      const afterTableY = (doc as any).lastAutoTable.finalY;

      // Sección de Firmas de Autoridad al pie
      const sigY = Math.max(afterTableY + 28, pageHeight - 38);

      doc.setDrawColor(180, 180, 180);
      doc.setLineWidth(0.5);

      // Firma Coordinador
      doc.line(24, sigY, 90, sigY);
      doc.setFontSize(7.5);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(70, 70, 70);
      doc.text(isEvGira ? 'COORDINADOR(A) DE LA GIRA' : 'COORDINADOR(A) DE LA COMISIÓN', 57, sigY + 4.5, { align: 'center' });
      doc.setFont('helvetica', 'normal');
      doc.text('Firma y Post Firma', 57, sigY + 8.5, { align: 'center' });

      // Firma Dirección
      doc.line(pageWidth - 90, sigY, pageWidth - 24, sigY);
      doc.setFont('helvetica', 'bold');
      doc.text('DIRECCIÓN DE ADMISIÓN', pageWidth - 57, sigY + 4.5, { align: 'center' });
      doc.setFont('helvetica', 'normal');
      doc.text('UNSAAC - Visto Bueno', pageWidth - 57, sigY + 8.5, { align: 'center' });

      // Pie de Página
      doc.setFontSize(7);
      doc.setTextColor(140, 140, 140);
      doc.text(`Generado el ${format(new Date(), 'dd/MM/yyyy HH:mm')} - Sistema de Admisión UNSAAC`, 14, pageHeight - 5);

      const cleanTitle = (ev.title || (isEvGira ? 'gira_vocacional' : 'comision')).replace(/[^a-zA-Z0-9]/g, '_');
      const filename = isEvGira 
        ? `Hoja_Ruta_Gira_${cleanTitle}_${ev.start_date}.pdf`
        : `Ficha_Comision_${cleanTitle}_${ev.start_date}.pdf`;

      doc.save(filename);
      notify(isEvGira ? 'Hoja de Ruta de Gira Vocacional generada exitosamente' : 'Ficha de Comisión generada exitosamente', 'success');
    } catch (err: any) {
      console.error('Error generando documento PDF:', err);
      notify(`Error al exportar documento: ${err.message}`, 'error');
    }
  };

  // Extract unique process labels from data
  const procesosUnicos = useMemo(() => {
     const p = events.map(e => e.proceso).filter(Boolean);
     return ['Todos', ...Array.from(new Set(p))];
  }, [events]);

  const filteredEvents = useMemo(() => {
      return events.filter(e => {
         const matchProceso = filterProceso === 'Todos' || e.proceso === filterProceso;
         const matchAudiencia = filterAudiencia === 'Todas' || e.audiencia === filterAudiencia;
         const matchTipo = filterTipo === 'Todos' || e.type === filterTipo;
         const matchSearch = searchQuery.trim() === '' || 
           e.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
           (e.lugar && e.lugar.toLowerCase().includes(searchQuery.toLowerCase()));
         return matchProceso && matchAudiencia && matchTipo && matchSearch;
      });
  }, [events, filterProceso, filterAudiencia, filterTipo, searchQuery]);

  // Option 3: Mini-Métricas Mensuales
  const monthMetrics = useMemo(() => {
      const monthStart = startOfMonth(currentMonth);
      const monthEnd = endOfMonth(currentMonth);
      
      const monthEvents = filteredEvents.filter(e => {
          const s = parseISO(e.start_date);
          const end = parseISO(e.end_date);
          // Verificar si el evento cruza con este mes (empieza antes del fin de mes y termina después del inicio)
          return s <= monthEnd && end >= monthStart;
      });

      const feriados = monthEvents.filter(e => e.type === 'Feriado').length;
      const actividades = monthEvents.length - feriados;

      return { actividades, feriados };
  }, [filteredEvents, currentMonth]);

  // Option 1: Búsqueda Inteligente y Auto-Scroll
  useEffect(() => {
      if (searchQuery && filteredEvents.length > 0) {
          // Ordenar eventos para saltar al primero cronológicamente
          const firstMatch = [...filteredEvents].sort((a,b) => a.start_date.localeCompare(b.start_date))[0];
          if (firstMatch) {
              const matchMonth = startOfMonth(parseISO(firstMatch.start_date));
              const key = format(matchMonth, 'yyyy-MM');
              const el = monthRefs.current[key];
              if (el && gridRef.current) {
                  gridRef.current.scrollTo({
                      top: el.offsetTop,
                      behavior: 'smooth'
                  });
              }
          }
      }
  }, [searchQuery]); // Depend deliberately only on search string changes.

  useEffect(() => {
    fetchEvents();
  }, []); // Only fetch entirely on mount and upon saving/deleting

  const fetchEvents = async () => {
    setLoading(true);
    try {
      // Obtenemos los eventos de toda la ventana disponible del scroll (-12 meses hasta +24 meses)
      const start = format(scrollRange.start, 'yyyy-MM-dd');
      const end = format(scrollRange.end, 'yyyy-MM-dd');

      const { data, error } = await supabase
        .from('eventos')
        .select('*')
        .or(`start_date.lte.${end},end_date.gte.${start}`);

      if (error) throw error;

      // Hydrate colegios_itinerario from column or embedded fallback metadata
      const parsedEvents = (data || []).map(ev => {
        let itinerario = ev.colegios_itinerario;
        let desc = ev.description || '';
        if (!itinerario && desc.includes('<!--ITINERARIO_DATA:')) {
          try {
            const match = desc.match(/<!--ITINERARIO_DATA:(.*?)-->/s);
            if (match && match[1]) {
              itinerario = JSON.parse(match[1]);
              desc = desc.replace(/<!--ITINERARIO_DATA:.*?-->/s, '').trim();
            }
          } catch (e) {
            console.warn('Error parsing itinerario fallback', e);
          }
        }
        return {
          ...ev,
          description: desc,
          colegios_itinerario: itinerario || []
        };
      });

      setEvents(parsedEvents);
    } catch (err: any) {
      notify(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!formData.title.trim()) {
        notify('El título es requerido', 'warning');
        return;
    }

    // Check for Holiday overlap
    const newStartStr = formData.start_date;
    const newEndStr = formData.end_date;
    const newStart = parseISO(newStartStr);
    const newEnd = parseISO(newEndStr);
    const interval = { start: newStart, end: newEnd };
    const isMultiDay = newStartStr !== newEndStr;

    const holidays = events.filter(e => e.type === 'Feriado' && (!selectedEvent || e.id !== selectedEvent.id));
    const otherEvents = events.filter(e => e.type !== 'Feriado' && (!selectedEvent || e.id !== selectedEvent.id));

    // If saving a holiday, check if there are any single-day events in that range
    if (formData.type === 'Feriado') {
        const hasOverlapWithSingleDayEvents = otherEvents.some(e => {
            const isOtherMultiDay = e.start_date !== e.end_date;
            if (isOtherMultiDay) return false; // Permitimos que plazos largos existan sobre feriados

            const eStart = parseISO(e.start_date);
            const eEnd = parseISO(e.end_date);
            return isWithinInterval(eStart, interval) || isWithinInterval(eEnd, interval) || 
                   isWithinInterval(newStart, { start: eStart, end: eEnd });
        });
        if (hasOverlapWithSingleDayEvents) {
            notify('No se puede programar un feriado sobre días que ya tienen eventos únicos (1 día).', 'error');
            return;
        }
    } else {
        // Solo aplica la restricción del feriado si el evento normal a crear consta de 1 solo día
        if (!isMultiDay) {
            const hasHolidayOverlap = holidays.some(h => {
                const hStart = parseISO(h.start_date);
                const hEnd = parseISO(h.end_date);
                return isWithinInterval(hStart, interval) || isWithinInterval(hEnd, interval) || 
                       isWithinInterval(newStart, { start: hStart, end: hEnd });
            });
            if (hasHolidayOverlap) {
                notify('No se puede programar un evento único de 1 día en un FERIADO.', 'error');
                return;
            }
        }
    }
    
    setLoading(true);
    setShowDeleteConfirm(false);
    try {
      let finalDesc = formData.description?.trim() || '';
      if (isGira && formData.colegios_itinerario && formData.colegios_itinerario.length > 0) {
        finalDesc = `<!--ITINERARIO_DATA:${JSON.stringify(formData.colegios_itinerario)}-->\n${finalDesc}`.trim();
      }

      const eventData: any = {
        title: formData.title.trim(),
        description: finalDesc || null,
        start_date: formData.start_date,
        end_date: formData.end_date,
        type: formData.type,
        color: formData.color,
        proceso: formData.proceso?.trim() || null,
        audiencia: formData.audiencia,
        lugar: isFieldEvent ? (formData.lugar?.trim() || null) : null,
        hora: isFieldEvent ? (formData.hora?.trim() || null) : null,
        estado_evento: isFieldEvent ? (formData.estado_evento || 'Programado') : 'Programado',
        personal_asignado: isFieldEvent ? (formData.personal_asignado || []) : [],
        colegios_itinerario: isGira ? (formData.colegios_itinerario || []) : [],
        user_id: user.id
      };

      if (selectedEvent) {
        const { error } = await supabase
          .from('eventos')
          .update(eventData)
          .eq('id', selectedEvent.id);
        if (error) {
          if (error.code === '42703') {
            delete eventData.colegios_itinerario;
            const { error: retryErr } = await supabase.from('eventos').update(eventData).eq('id', selectedEvent.id);
            if (retryErr) throw retryErr;
          } else {
            throw error;
          }
        }
        notify('Evento actualizado exitosamente');
      } else {
        const { error } = await supabase
          .from('eventos')
          .insert([eventData]);
        if (error) {
          if (error.code === '42703') {
            delete eventData.colegios_itinerario;
            const { error: retryErr } = await supabase.from('eventos').insert([eventData]);
            if (retryErr) throw retryErr;
          } else {
            throw error;
          }
        }
        notify('Evento creado exitosamente');
      }

      setIsModalOpen(false);
      setSelectedEvent(null);
      setFormData({
        title: '',
        description: '',
        start_date: format(new Date(), 'yyyy-MM-dd'),
        end_date: format(new Date(), 'yyyy-MM-dd'),
        type: 'Evento',
        color: '#0ea5e9',
        proceso: '',
        audiencia: 'Público General',
        lugar: '',
        hora: '',
        estado_evento: 'Programado',
        personal_asignado: [],
        colegios_itinerario: []
      });
      lastSelectedColegioRef.current = '';
      setStaffSearchTerm('');
      setStaffSearchResults([]);
      setShowStaffDropdown(false);
      setColegioSearchTerm('');
      setColegioSearchResults([]);
      setShowColegioDropdown(false);
      setIsSearchingColegio(false);
      fetchEvents();
    } catch (err: any) {
      notify(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    setLoading(true);
    try {
      const { error } = await supabase
        .from('eventos')
        .delete()
        .eq('id', id);
      if (error) throw error;
      notify('Evento eliminado');
      setIsModalOpen(false);
      setSelectedEvent(null);
      setColegioSearchTerm('');
      setColegioSearchResults([]);
      setShowColegioDropdown(false);
      fetchEvents();
    } catch (err: any) {
      notify(err.message, 'error');
    } finally {
      setLoading(false);
      setShowDeleteConfirm(false);
    }
  };

  const exportToPDF = () => {
    const start = parseISO(`${exportStartMonth}-01`);
    const end = parseISO(`${exportEndMonth}-01`);
    const monthsDiff = differenceInCalendarMonths(end, start);
    
    if (monthsDiff < 0) {
        notify('El mes de fin no puede ser anterior al de inicio', 'warning');
        return;
    }

    const doc = new jsPDF('landscape'); // A4 APAISADO
    
    for (let m = 0; m <= monthsDiff; m++) {
        if (m > 0) doc.addPage('a4', 'landscape');
        const currentPDFMonth = addMonths(start, m);
        const monthStartPdf = startOfMonth(currentPDFMonth);
        const monthEndPdf = endOfMonth(monthStartPdf);

        const monthStr = format(currentPDFMonth, 'MMMM yyyy', { locale: es }).toUpperCase();
        
        let subTitleStr = '';
        if (filterProceso !== 'Todos') subTitleStr += ` - PROCESO: ${filterProceso}`;
        if (filterAudiencia !== 'Todas') subTitleStr += ` (${filterAudiencia})`;

        const titleBase = `CALENDARIO DE ACTIVIDADES DE LA DIRECCIÓN DE ADMISIÓN${subTitleStr}`;
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(165, 29, 45); // UNSAAC Red (from other reports)
        doc.text(titleBase, 10, 18);
        
        const textWidth = doc.getTextWidth(titleBase);
        doc.setTextColor(100, 100, 100); // gris
        doc.text(` - ${monthStr}`, 10 + textWidth, 18);
        
        const startOfGrid = startOfWeek(monthStartPdf, { weekStartsOn: 0 }); // Domingo
        const endOfGrid = endOfWeek(monthEndPdf, { weekStartsOn: 0 });
        const days = eachDayOfInterval({ start: startOfGrid, end: endOfGrid });
        
        const weeks = [];
        for (let i = 0; i < days.length; i += 7) {
          weeks.push(days.slice(i, i + 7));
        }
        
        const bodyData = weeks.map(week => {
          return week.map(day => {
            // USAR EVENTOS FILTRADOS AQUI PARA QUE LOS REPORTES SEAN ESPECIFICOS
            const dayEvents = filteredEvents.filter(event => {
                const s = parseISO(event.start_date);
                const e = parseISO(event.end_date);
                return isWithinInterval(day, { start: s, end: e });
            });
            let cellText = '';
            dayEvents.forEach(e => {
              const isStart = isSameDay(parseISO(e.start_date), day);
              const isEnd = isSameDay(parseISO(e.end_date), day);
              const isMultiDay = e.start_date !== e.end_date;
              const isMiddleDay = isMultiDay && !isStart && !isEnd;

              if (!isMiddleDay) {
                let prefix = '• ';
                if (isMultiDay && isStart) prefix = '[ INICIO ] ';
                if (isMultiDay && isEnd) prefix = '[ FIN ] ';
                cellText += `${prefix}${e.title.toUpperCase()}\n\n`; // Double newline para separar bien eventos visualmente
              }
            });
            return cellText.trimEnd();
          });
        });

        const pageWidth = doc.internal.pageSize.width;
        const tableMarginRight = 24;

        autoTable(doc, {
          startY: 23,
          margin: { left: 10, right: tableMarginRight, bottom: 10 },
          head: [['DOMINGO', 'LUNES', 'MARTES', 'MIÉRCOLES', 'JUEVES', 'VIERNES', 'SÁBADO']],
          body: bodyData,
          theme: 'grid',
          columnStyles: {
            0: { cellWidth: 20 }, // DOMINGO delgado
            1: { cellWidth: 40.5 },
            2: { cellWidth: 40.5 },
            3: { cellWidth: 40.5 },
            4: { cellWidth: 40.5 },
            5: { cellWidth: 40.5 },
            6: { cellWidth: 40.5 },
          },
          styles: {
            fontSize: 6,
            font: 'helvetica',
            valign: 'top',
            halign: 'left',
            minCellHeight: 28,
            lineWidth: 0.1,
            lineColor: [200, 200, 200],
            cellPadding: { top: 6, right: 2, bottom: 2, left: 2 }, // Top padding empuja el texto para que NO choque con el número
            textColor: [40, 40, 40],
            overflow: 'linebreak'
          },
          headStyles: {
            fillColor: [123, 21, 35], // Rojo institucional UNSAAC (mismo usado en Asistencias)
            textColor: 255,
            halign: 'center',
            valign: 'middle',
            fontStyle: 'bold',
            fontSize: 8,
          },
          didParseCell: function(data) {
            if (data.section === 'body') {
              const cellIndex = data.column.index;
              const weekIndex = data.row.index;
              const day = days[weekIndex * 7 + cellIndex];
              const dayEvents = getEventsForDay(day);

              const isTargetMonth = isSameMonth(day, currentPDFMonth);
              if (!isTargetMonth) {
                data.cell.styles.textColor = [160, 160, 160];
              }

              // Fondos dinámicos
              const feriado = dayEvents.find(e => e.type === 'Feriado');
              const examen = dayEvents.find(e => e.type === 'Examen');
              const inscripcion = dayEvents.find(e => e.type === 'Inscripción');

              if (feriado) {
                data.cell.styles.fillColor = [254, 202, 202]; // Rojo claro
                data.cell.styles.textColor = [153, 27, 27];
              } else if (examen) {
                data.cell.styles.fillColor = [254, 240, 138]; // Amarillo
              } else if (inscripcion) {
                data.cell.styles.fillColor = [241, 245, 249]; // Azul super claro/grisáceo
              } else if (cellIndex === 0) {
                data.cell.styles.fillColor = [248, 250, 252]; // Domingos
              }
            }
          },
          didDrawCell: function(data) {
            if (data.section === 'body') {
                const cellIndex = data.column.index;
                const weekIndex = data.row.index;
                const day = days[weekIndex * 7 + cellIndex];
                const isTargetMonth = isSameMonth(day, currentPDFMonth);
                
                // Dibujar el número en la esquina superior izquierda
                doc.setFontSize(9);
                doc.setFont('helvetica', isTargetMonth ? 'bold' : 'normal');
                
                const feriado = getEventsForDay(day).find(e => e.type === 'Feriado');
                if (!isTargetMonth) doc.setTextColor(160, 160, 160);
                else if (feriado) doc.setTextColor(153, 27, 27);
                else doc.setTextColor(40, 40, 40);
                
                doc.text(format(day, 'd'), data.cell.x + 2, data.cell.y + 4, { align: 'left' });
            }
          }
        });

        // Franja vertical derecha con el nombre del mes
        const finalY = (doc as any).lastAutoTable.finalY || 180;
        const endY = Math.max(finalY, 150);
        const startY = 23;

        
        doc.setFillColor(123, 21, 35); // Fondo rojo institucional
        doc.rect(pageWidth - 20, startY, 14, endY - startY, 'F');
        
        doc.setTextColor(255, 255, 255); // Texto blanco
        doc.setFontSize(16);
        doc.setFont('helvetica', 'bold');
        
        const monthNameSide = format(currentPDFMonth, 'MMMM', { locale: es }).toUpperCase();
        const chars = monthNameSide.split('');
        let currentY = startY + 15;
        
        chars.forEach(char => {
            doc.text(char, pageWidth - 13, currentY, { align: 'center' });
            currentY += 8;
        });
    }

    doc.save(`calendario_unsaac_${format(start, 'yyyyMM')}_al_${format(end, 'yyyyMM')}.pdf`);
    setIsExportModalOpen(false);
  };


  // Calendar Logic
  const calendarDays = useMemo(() => {
    return eachDayOfInterval({
      start: scrollRange.start,
      end: scrollRange.end,
    });
  }, [scrollRange]);

  const handleScroll = useCallback(() => {
    if (!gridRef.current) return;
    const containerTop = gridRef.current.scrollTop;
    
    let closestMonth = '';
    let minDistance = Infinity;

    Object.entries(monthRefs.current).forEach(([key, el]: [string, any]) => {
        if (el) {
            const distance = Math.abs(el.offsetTop - containerTop);
            if (distance < minDistance) {
                minDistance = distance;
                closestMonth = key;
            }
        }
    });

    if (closestMonth && closestMonth !== format(currentMonth, 'yyyy-MM')) {
       setCurrentMonth(parseISO(`${closestMonth}-01`));
    }
  }, [currentMonth]);

  const scrollToMonth = (date: Date) => {
    const key = format(date, 'yyyy-MM');
    const el = monthRefs.current[key];
    if (el && gridRef.current) {
        gridRef.current.scrollTo({
            top: el.offsetTop,
            behavior: 'smooth'
        });
    }
    setCurrentMonth(date);
  };

  useEffect(() => {
    setTimeout(() => {
        scrollToMonth(new Date());
    }, 100);
  }, []);

  const getEventsForDay = (day: Date) => {
    return filteredEvents.filter(event => {
      const start = parseISO(event.start_date);
      const end = parseISO(event.end_date);
      return isWithinInterval(day, { start, end });
    });
  };

  return (
    <div className={isFullScreen ? "fixed inset-0 z-[100] bg-slate-50 flex flex-col h-screen overflow-hidden p-4 gap-4" : "p-6 h-full flex flex-col gap-6 animate-in fade-in duration-500"}>
       {isFullScreen && (
           <div className="bg-white px-4 py-3 rounded-xl border border-slate-200 flex items-center justify-between shadow-sm shrink-0">
               <h2 className="font-bold text-lg text-slate-800 flex items-center gap-2">
                   <span className="material-symbols-outlined text-indigo-600">fullscreen</span>
                   Modo Extendido - Agenda Institucional
               </h2>
               <button onClick={() => setIsFullScreen(false)} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-700 font-bold transition-colors text-sm flex items-center gap-2">
                   <span className="material-symbols-outlined text-[18px]">close_fullscreen</span> Salir
               </button>
           </div>
       )}

      <div className={`flex flex-1 overflow-hidden ${isFullScreen ? 'flex-row gap-4' : 'flex-col gap-6'}`}>
          <div className={`${isFullScreen ? 'w-64 flex-col justify-start items-stretch bg-white p-4 rounded-xl border border-slate-200 shadow-sm shrink-0 overflow-y-auto' : 'flex flex-col xl:flex-row xl:items-center justify-between shrink-0'} flex gap-4`}>
             {!isFullScreen && (
                 <div className="flex items-center gap-4 shrink-0">
                    <div className="size-12 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-lg shadow-indigo-200">
                      <span className="material-symbols-outlined text-2xl">calendar_today</span>
                    </div>
                    <div>
                      <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tighter">Agenda Institucional</h2>
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Calendarización de eventos y procesos</p>
                    </div>
                 </div>
             )}

             {isFullScreen && (
                  <div className="mb-2 shrink-0">
                    <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest leading-tight">Filtros y Controles</h3>
                  </div>
             )}

             <div className={`flex bg-white ${isFullScreen ? 'flex-col gap-3 rounded-none p-0 border-0 shadow-none' : 'rounded-2xl p-1 border border-slate-200 shadow-sm overflow-x-auto min-w-0'}`}>
                 <div className={`flex flex-col ${isFullScreen ? 'gap-3 w-full' : 'sm:flex-row md:items-center min-w-max gap-2 px-3 py-1'}`}>
                     <div className={`flex items-center gap-2 ${isFullScreen ? 'w-full bg-slate-50 p-2 rounded-lg' : 'border-r border-slate-100 pr-4'}`}>
                          <span className="material-symbols-outlined text-slate-400 text-sm">search</span>
                          <input
                              type="text"
                              placeholder="Buscar evento..."
                              value={searchQuery}
                              onChange={(e) => setSearchQuery(e.target.value)}
                              className={`text-xs font-black uppercase tracking-widest text-slate-600 outline-none bg-transparent placeholder:text-slate-300 transition-all ${isFullScreen ? 'w-full' : 'w-32 focus:w-48'}`}
                          />
                     </div>
                     <div className={`flex items-center gap-2 ${isFullScreen ? 'w-full bg-slate-50 p-2 rounded-lg' : 'border-r border-slate-100 pr-4 pl-2'}`}>
                          <span className="material-symbols-outlined text-slate-400 text-sm">filter_alt</span>
                          <select 
                             value={filterProceso}
                             onChange={(e) => setFilterProceso(e.target.value)}
                             className="text-xs font-black uppercase tracking-widest text-slate-600 outline-none bg-transparent cursor-pointer w-full truncate"
                          >
                              {procesosUnicos.map(p => (
                                  <option key={p} value={p}>{p === 'Todos' ? 'Todos los Procesos' : p}</option>
                              ))}
                          </select>
                     </div>
                     <div className={`flex items-center gap-2 ${isFullScreen ? 'w-full bg-slate-50 p-2 rounded-lg' : 'border-r border-slate-100 pr-4 pl-2'}`}>
                          <span className="material-symbols-outlined text-slate-400 text-sm">category</span>
                          <select 
                             value={filterTipo}
                             onChange={(e) => setFilterTipo(e.target.value)}
                             className="text-xs font-black uppercase tracking-widest text-slate-600 outline-none bg-transparent cursor-pointer w-full"
                          >
                              <option value="Todos">Todos los Tipos</option>
                              {EVENT_TYPES.map(t => (
                                  <option key={t.label} value={t.label}>{t.label}</option>
                              ))}
                          </select>
                     </div>
                     <div className={`flex items-center gap-2 ${isFullScreen ? 'w-full bg-slate-50 p-2 rounded-lg' : 'pl-2'}`}>
                          <span className="material-symbols-outlined text-slate-400 text-sm">group</span>
                          <select 
                             value={filterAudiencia}
                             onChange={(e) => setFilterAudiencia(e.target.value)}
                             className="text-xs font-black uppercase tracking-widest text-slate-600 outline-none bg-transparent cursor-pointer w-full"
                          >
                              <option value="Todas">Todas las Audiencias</option>
                              <option value="Público General">Público General</option>
                              <option value="Personal Interno">Personal Interno</option>
                          </select>
                     </div>
                 </div>
             </div>

             <div className={`flex items-center justify-between border-slate-200 bg-white min-w-0 ${isFullScreen ? 'mt-4 pt-4 border-t flex-col-reverse gap-4 p-0 shadow-none' : 'gap-2 p-1 rounded-2xl border shadow-sm shrink-0'}`}>
                 <div className={`flex items-center justify-between ${isFullScreen ? 'w-full bg-slate-50 rounded-xl p-1 shadow-sm' : ''}`}>
                     <button 
                         onClick={() => scrollToMonth(subMonths(currentMonth, 1))}
                         className={`p-2 hover:bg-slate-50 rounded-xl transition-colors text-slate-600 shrink-0 ${isFullScreen ? 'hover:bg-white' : ''}`}
                     >
                         <span className="material-symbols-outlined">chevron_left</span>
                     </button>
                     <div className="flex flex-col items-center justify-center px-1 py-1 truncate flex-1 min-w-0">
                         <h3 className="text-sm font-black text-slate-700 uppercase tracking-widest text-center w-full">
                             {format(currentMonth, 'MMMM yyyy', { locale: es })}
                         </h3>
                         {!isFullScreen && (
                           <div className="flex items-center gap-2 mt-0.5 truncate max-w-full overflow-hidden">
                               <span className="text-[9px] font-bold text-indigo-500 uppercase tracking-widest bg-indigo-50 px-1.5 py-0.5 rounded-md truncate">
                                   {monthMetrics.actividades} Act.
                               </span>
                               {(monthMetrics.feriados > 0) && (
                                   <span className="text-[9px] font-bold text-rose-500 uppercase tracking-widest bg-rose-50 px-1.5 py-0.5 rounded-md truncate">
                                       {monthMetrics.feriados} Fer.
                                   </span>
                               )}
                           </div>
                         )}
                     </div>
                     <button 
                         onClick={() => scrollToMonth(addMonths(currentMonth, 1))}
                         className={`p-2 hover:bg-slate-50 rounded-xl transition-colors text-slate-600 shrink-0 ${isFullScreen ? 'hover:bg-white' : ''}`}
                     >
                         <span className="material-symbols-outlined">chevron_right</span>
                     </button>
                 </div>
                 
                 {isFullScreen && (
                    <div className="flex flex-col gap-2 w-full shrink-0">
                        <div className="flex justify-between items-center py-2 px-3 bg-indigo-50 text-indigo-700 rounded-lg shadow-inner">
                            <span className="text-[10px] font-black uppercase tracking-widest">Actividades</span>
                            <span className="text-sm font-black">{monthMetrics.actividades}</span>
                        </div>
                        {(monthMetrics.feriados > 0) && (
                           <div className="flex justify-between items-center py-2 px-3 bg-rose-50 text-rose-700 rounded-lg shadow-inner">
                               <span className="text-[10px] font-black uppercase tracking-widest">Feriados</span>
                               <span className="text-sm font-black">{monthMetrics.feriados}</span>
                           </div>
                        )}
                    </div>
                 )}
             </div>

             <div className={`flex ${isFullScreen ? 'flex-col gap-2 mt-auto pt-4 border-t border-slate-100 shrink-0' : 'items-center gap-3 shrink-0'}`}>
                 {!isFullScreen && (
                     <button 
                         onClick={() => setIsFullScreen(true)}
                         className="h-12 px-4 bg-slate-800 text-white rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-slate-900 shadow-lg shadow-slate-200 transition-all flex items-center justify-center gap-2"
                         title="Pantalla Completa"
                     >
                         <span className="material-symbols-outlined text-[18px]">fullscreen</span>
                     </button>
                 )}
                 <button 
                     onClick={() => {
                        setExportStartMonth(format(currentMonth, 'yyyy-MM'));
                        setExportEndMonth(format(addMonths(currentMonth, 1), 'yyyy-MM'));
                        setIsExportModalOpen(true);
                     }}
                     className={`h-12 leading-none bg-white border-2 border-slate-100 text-slate-600 rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-slate-50 transition-all flex items-center justify-center gap-2 ${isFullScreen ? 'w-full px-2' : 'px-6'}`}
                 >
                     <span className="material-symbols-outlined text-[18px]">picture_as_pdf</span>
                     {!isFullScreen && <span>Reporte PDF</span>}
                     {isFullScreen && <span>Exportar</span>}
                 </button>
                 <button 
                     onClick={() => {
                         setSelectedEvent(null);
                         setFormData({
                             title: '',
                             description: '',
                             start_date: format(new Date(), 'yyyy-MM-dd'),
                             end_date: format(new Date(), 'yyyy-MM-dd'),
                             type: 'Evento',
                             color: '#0ea5e9',
                             proceso: '',
                             audiencia: 'Público General',
                             lugar: '',
                             hora: '',
                             estado_evento: 'Programado',
                             personal_asignado: [],
                             colegios_itinerario: []
                         });
                         setStaffSearchTerm('');
                         setStaffSearchResults([]);
                         setShowStaffDropdown(false);
                         setIsModalOpen(true);
                     }}
                     className={`h-12 leading-none bg-indigo-600 text-white rounded-2xl text-xs font-black uppercase tracking-widest shadow-lg shadow-indigo-200 active:scale-95 transition-all flex items-center justify-center gap-2 ${isFullScreen ? 'w-full px-2' : 'px-6'}`}
                 >
                     <span className="material-symbols-outlined text-[18px]">add</span>
                     {!isFullScreen && <span>Nuevo Evento</span>}
                     {isFullScreen && <span>Nuevo</span>}
                 </button>
             </div>
          </div>

          <div className="flex-1 min-h-0 min-w-0 bg-white rounded-[32px] border border-slate-200 shadow-sm overflow-hidden flex flex-col">
        {/* Day Headers */}
        <div className="grid grid-cols-[0.5fr_1fr_1fr_1fr_1fr_1fr_1fr] border-b border-slate-100 shrink-0">
          {['dom', 'lun', 'mar', 'mie', 'jue', 'vie', 'sab'].map((day) => (
            <div key={day} className="py-4 text-center">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">{day}</span>
            </div>
          ))}
        </div>

        {/* Calendar Grid */}
        <div 
            ref={gridRef}
            onScroll={handleScroll}
            className="flex-1 overflow-y-auto min-h-0 grid grid-cols-[0.5fr_1fr_1fr_1fr_1fr_1fr_1fr] border-slate-100 relative"
        >
          {calendarDays.map((day, idx) => {
            const dayEvents = getEventsForDay(day);
            const isToday = isSameDay(day, new Date());
            const isFirstDayOfMonth = day.getDate() === 1;
            const monthKey = format(day, 'yyyy-MM');
            
            const isSunday = day.getDay() === 0;
            const isAlternateMonth = day.getMonth() % 2 !== 0;

            let bgColorClass = isAlternateMonth ? 'bg-slate-100' : 'bg-white';
            if (isSunday) {
                // Domingo más oscuro para marcar diferencia y que no se usa.
                bgColorClass = isAlternateMonth ? 'bg-slate-200' : 'bg-slate-50';
            }

            return (
              <div 
                key={day.toString()} 
                ref={isFirstDayOfMonth ? (el) => { monthRefs.current[monthKey] = el; } : null}
                className={`min-h-[120px] p-2 border-r border-b border-slate-100 relative group transition-colors hover:brightness-95 ${bgColorClass}`}
              >
                <div className="flex justify-between items-center mb-1">
                  <span className={`px-2 py-1 min-w-[28px] text-center rounded-full text-[11px] font-black transition-all ${
                    isToday 
                        ? 'bg-indigo-600 text-white shadow-md' 
                        : isFirstDayOfMonth ? 'text-indigo-600 bg-indigo-50' : 'text-slate-600'
                  }`}>
                    {isFirstDayOfMonth ? format(day, 'd MMM', { locale: es }).toUpperCase() : format(day, 'd')}
                  </span>
                  
                  <button 
                    onClick={() => {
                        setSelectedEvent(null);
                        setFormData({
                            title: '',
                            description: '',
                            start_date: format(day, 'yyyy-MM-dd'),
                            end_date: format(day, 'yyyy-MM-dd'),
                            type: 'Evento',
                            color: '#0ea5e9',
                            proceso: '',
                            audiencia: 'Público General',
                            lugar: '',
                            hora: '',
                            estado_evento: 'Programado',
                            personal_asignado: [],
                            colegios_itinerario: []
                        });
                        setStaffSearchTerm('');
                        setStaffSearchResults([]);
                        setShowStaffDropdown(false);
                        setColegioSearchTerm('');
                        setColegioSearchResults([]);
                        setShowColegioDropdown(false);
                        setIsSearchingColegio(false);
                        setIsModalOpen(true);
                    }}
                    className="p-1 text-slate-200 hover:text-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity relative group/btn"
                  >
                    <span className="material-symbols-outlined text-[16px]">add</span>
                    <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 bg-slate-800 text-white text-[10px] whitespace-nowrap rounded font-bold opacity-0 group-hover/btn:opacity-100 pointer-events-none transition-opacity z-10 shadow-lg">
                        {format(day, "d MMM", { locale: es }).toUpperCase()}
                    </span>
                  </button>
                </div>

                <div className="space-y-0.5 overflow-y-auto max-h-[85px] scrollbar-hide py-1">
                  {dayEvents.map((event) => {
                      const isStart = isSameDay(parseISO(event.start_date), day);
                      const isEnd = isSameDay(parseISO(event.end_date), day);
                      const isMultiDay = event.start_date !== event.end_date;
                      
                      const isMiddleDay = isMultiDay && !isStart && !isEnd;
                      const isHovered = hoveredEventId === event.id;

                      if (isMiddleDay && !isHovered) {
                        return null;
                      }

                      // Visual Styling Configuration
                      const processPalette = getProcessColor(event.proceso);
                      const typePalette = EVENT_TYPES.find(t => t.label === event.type);
                      
                      const bgClass = processPalette ? processPalette.bg : (typePalette?.bg || 'bg-slate-50');
                      const textClass = processPalette ? processPalette.text : (typePalette?.text || 'text-slate-700');
                      const borderClass = processPalette ? processPalette.border : (typePalette?.color.replace('bg-', 'border-') || 'border-slate-200');
                      const middleDotClass = processPalette ? processPalette.dot : (typePalette?.color || 'bg-slate-300');

                      return (
                        <button
                          key={event.id}
                          onMouseEnter={() => setHoveredEventId(event.id)}
                          onMouseLeave={() => setHoveredEventId(null)}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedEvent(event);
                            setFormData({
                              title: event.title,
                              description: event.description || '',
                              start_date: event.start_date,
                              end_date: event.end_date,
                              type: event.type,
                              color: event.color,
                              proceso: event.proceso || '',
                              audiencia: event.audiencia || 'Público General',
                              lugar: event.lugar || '',
                              hora: event.hora || '',
                              estado_evento: event.estado_evento || 'Programado',
                              personal_asignado: Array.isArray(event.personal_asignado) ? event.personal_asignado : [],
                              colegios_itinerario: Array.isArray(event.colegios_itinerario) ? event.colegios_itinerario : []
                            });
                            setStaffSearchTerm('');
                            setStaffSearchResults([]);
                            setShowStaffDropdown(false);
                            lastSelectedColegioRef.current = event.type === 'Visita a Colegios' ? (event.lugar || '') : '';
                            setColegioSearchTerm(event.type === 'Visita a Colegios' ? (event.lugar || '') : '');
                            setColegioSearchResults([]);
                            setShowColegioDropdown(false);
                            setIsSearchingColegio(false);
                            setIsModalOpen(true);
                          }}
                          className={`w-full text-left rounded-md transition-all active:scale-95 flex items-start ${
                             isMiddleDay ? 'px-1 py-0.5 justify-center items-center opacity-80 h-2 my-1' : 'px-2 py-1 uppercase hover:opacity-80'
                          } ${bgClass} ${textClass} border-l-4 ${borderClass}`}
                          title={event.title}
                        >
                          {isMiddleDay ? (
                              <div className={`h-1 w-full rounded-full ${middleDotClass}`}></div>
                          ) : (
                              <span className="text-[10px] font-bold break-words whitespace-normal leading-tight w-full flex items-center flex-wrap gap-1">
                                {isStart && isMultiDay && <span className="inline-block">▶</span>}
                                {isEnd && isMultiDay && !isStart && <span className="inline-block">■</span>}
                                {event.type === 'Visita a Colegios' && (
                                  <span className="material-symbols-outlined text-[13px] text-violet-700 leading-none shrink-0" title="Visita a Colegio">school</span>
                                )}
                                {event.type === 'Gira Vocacional' && (
                                  <span className="material-symbols-outlined text-[13px] text-teal-700 leading-none shrink-0" title="Gira Vocacional">alt_route</span>
                                )}
                                <span>{event.title}</span>
                                {event.personal_asignado && event.personal_asignado.length > 0 && (
                                  <span 
                                    className="inline-flex items-center text-[9px] font-black bg-black/10 text-slate-800 px-1 py-0.2 rounded shrink-0 leading-tight"
                                    title={`${event.personal_asignado.length} personas asignadas`}
                                  >
                                    👥 {event.personal_asignado.length}
                                  </span>
                                )}
                              </span>
                          )}
                        </button>
                      );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      </div>

      {/* Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className={`bg-white rounded-[40px] shadow-2xl w-full overflow-hidden flex flex-col max-h-[92vh] transition-all ${isFieldEvent ? 'max-w-2xl' : 'max-w-lg'}`}
            >
              <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50 shrink-0">
                <div className="flex items-center gap-3">
                  <div className="size-12 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-lg shadow-indigo-100">
                    <span className="material-symbols-outlined text-2xl">
                      {selectedEvent ? 'edit_calendar' : 'add_task'}
                    </span>
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-slate-900 uppercase tracking-tighter">
                      {selectedEvent ? 'Editar Evento' : 'Nuevo Evento'}
                    </h3>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{isFieldEvent ? 'Detalles operativos de campo y delegación' : 'Complete los detalles del evento'}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {(isFieldEvent || formData.personal_asignado.length > 0) && (
                    <button
                      type="button"
                      onClick={() => exportComisionPDF()}
                      className={`px-4 py-2 border rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-1.5 shadow-sm ${
                        isGira
                          ? 'bg-teal-50 border-teal-200 hover:bg-teal-100 text-teal-800'
                          : 'bg-violet-50 border-violet-200 hover:bg-violet-100 text-violet-800'
                      }`}
                      title={isGira ? "Imprimir Hoja de Ruta y Comisión de Difusión Vocacional (PDF)" : "Imprimir Ficha de Comisión (PDF)"}
                    >
                      <span className="material-symbols-outlined text-[18px]">
                        {isGira ? 'alt_route' : 'assignment'}
                      </span>
                      <span className="hidden sm:inline">
                        {isGira ? 'Hoja de Ruta PDF' : 'Ficha Comisión'}
                      </span>
                    </button>
                  )}
                  <button onClick={() => setIsModalOpen(false)} className="p-3 text-slate-400 hover:bg-white rounded-full transition-all shadow-sm">
                    <span className="material-symbols-outlined">close</span>
                  </button>
                </div>
              </div>

              <div className="p-6 md:p-8 space-y-6 overflow-y-auto max-h-[calc(92vh-170px)]">
                <div>
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Título del Evento *</label>
                  <input
                    type="text"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    className="w-full h-14 px-6 rounded-2xl border-2 border-slate-100 bg-slate-50 focus:border-indigo-600 focus:bg-white outline-none font-bold transition-all mt-2 text-sm"
                    placeholder="Ej. Visita Vocacional y Difusión 2026..."
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Fecha Inicio</label>
                    <input
                      type="date"
                      value={formData.start_date}
                      onChange={(e) => {
                          const newStart = e.target.value;
                          if (!selectedEvent || formData.start_date === formData.end_date) {
                              setFormData({ ...formData, start_date: newStart, end_date: newStart });
                          } else {
                              setFormData({ ...formData, start_date: newStart });
                          }
                      }}
                      className="w-full h-14 px-6 rounded-2xl border-2 border-slate-100 bg-slate-50 focus:border-indigo-600 focus:bg-white outline-none font-bold transition-all mt-2"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Fecha Fin</label>
                    <input
                      type="date"
                      value={formData.end_date}
                      min={formData.start_date}
                      onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                      className="w-full h-14 px-6 rounded-2xl border-2 border-slate-100 bg-slate-50 focus:border-indigo-600 focus:bg-white outline-none font-bold transition-all mt-2"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Tipo de Evento</label>
                  <div className="grid grid-cols-3 gap-2 mt-2">
                    {EVENT_TYPES.map(type => (
                      <button
                        key={type.label}
                        type="button"
                        onClick={() => setFormData({ ...formData, type: type.label as any })}
                        className={`py-2.5 px-2 rounded-xl border-2 transition-all text-[10px] font-black uppercase tracking-tighter ${
                          formData.type === type.label 
                            ? `border-indigo-600 ${type.bg} text-indigo-700 shadow-sm` 
                            : 'border-slate-100 text-slate-400 hover:bg-slate-50'
                        }`}
                      >
                        {type.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 1. SECCIÓN DE SALIDA DE CAMPO (Visita a Colegios, Gira Vocacional, Feria o Capacitación) */}
                {isFieldEvent && (
                  <div className={`p-5 rounded-3xl border-2 flex flex-col gap-4 animate-in fade-in ${
                    isGira 
                      ? 'bg-teal-50/60 border-teal-200' 
                      : 'bg-violet-50/60 border-violet-100'
                  }`}>
                    <div className="flex items-center justify-between border-b pb-2 border-slate-200/60">
                      <div className="flex items-center gap-2">
                        <span className={`material-symbols-outlined text-lg ${isGira ? 'text-teal-600' : 'text-violet-600'}`}>
                          {isGira ? 'alt_route' : isVisita ? 'school' : isFeria ? 'campaign' : 'model_training'}
                        </span>
                        <h4 className={`text-xs font-black uppercase tracking-widest ${isGira ? 'text-teal-900' : 'text-violet-900'}`}>
                          {isGira 
                            ? 'Detalles de la Gira Vocacional (Ruta Multi-Colegio)' 
                            : isVisita 
                              ? 'Detalles de la Visita al Colegio' 
                              : 'Detalles Operativos de la Salida'}
                        </h4>
                      </div>
                      {isGira && (
                        <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-teal-100 text-teal-800 border border-teal-200">
                          Multi-Colegio
                        </span>
                      )}
                    </div>

                    {/* A. CASO GIRA VOCACIONAL: Circuito Provincial + Buscador con '+ Agregar al Itinerario' + Lista Acumulada */}
                    {isGira && (
                      <div className="space-y-4">
                        {/* Campo Zona / Circuito Provincial */}
                        <div>
                          <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest">
                            Zona / Circuito Provincial *
                          </label>
                          <input
                            type="text"
                            value={formData.lugar || ''}
                            onChange={(e) => {
                              const val = e.target.value;
                              setFormData(prev => ({
                                ...prev,
                                lugar: val,
                                title: (!prev.title || prev.title.startsWith('Gira Vocacional'))
                                  ? `Gira Vocacional: ${val || 'Cusco'}`
                                  : prev.title
                              }));
                            }}
                            placeholder="Ej: Provincias Altas: Canas, Canchis y Quispicanchi"
                            className="w-full h-12 px-4 rounded-xl border border-teal-200 bg-white focus:border-teal-600 outline-none font-bold text-xs mt-1 shadow-sm"
                          />
                        </div>

                        {/* Buscador de Colegios con Selector de Ámbito Geográfico */}
                        <div className="flex flex-col gap-2 relative" ref={colegioDropdownRef}>
                          <div className="flex flex-wrap justify-between items-center gap-2">
                            <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest flex items-center gap-1">
                              <span className="material-symbols-outlined text-[15px] text-teal-600">public</span>
                              Ámbito Geográfico de Búsqueda
                            </label>
                            <div className="flex gap-1 bg-teal-100/70 p-0.5 rounded-lg">
                              {REGIONES_GIRA.map(reg => (
                                <button
                                  key={reg}
                                  type="button"
                                  onClick={() => {
                                    setSelectedRegionColegio(reg);
                                    lastSelectedColegioRef.current = '';
                                  }}
                                  className={`px-2 py-0.5 rounded-md text-[9px] font-black uppercase transition-all ${
                                    selectedRegionColegio === reg 
                                      ? 'bg-teal-700 text-white shadow-sm' 
                                      : 'text-teal-900 hover:text-teal-950 hover:bg-white/40'
                                  }`}
                                >
                                  {reg}
                                </button>
                              ))}
                            </div>
                          </div>

                          <div className="flex gap-2">
                            <div className="relative flex-1">
                              <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-lg">
                                search
                              </span>
                              <input
                                type="text"
                                value={colegioSearchTerm}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  if (val !== lastSelectedColegioRef.current) {
                                    lastSelectedColegioRef.current = '';
                                  }
                                  setColegioSearchTerm(val);
                                }}
                                onFocus={() => {
                                  if (colegioSearchResults.length > 0) setShowColegioDropdown(true);
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    if (colegioSearchResults.length > 0) {
                                      handleSelectColegio(colegioSearchResults[0]);
                                    } else if (colegioSearchTerm.trim()) {
                                      handleAddCustomColegioItinerario();
                                    }
                                  }
                                }}
                                placeholder={
                                  selectedRegionColegio === 'Todas' 
                                    ? "Buscar colegio, distrito o provincia en todo el Perú..." 
                                    : `Buscar en ${selectedRegionColegio} (ej: colegio, distrito o provincia)...`
                                }
                                className="w-full h-12 pl-11 pr-4 rounded-xl border border-teal-200 bg-white focus:border-teal-600 outline-none font-bold text-xs shadow-sm"
                              />
                            </div>
                            <button
                              type="button"
                              onClick={handleAddCustomColegioItinerario}
                              disabled={!colegioSearchTerm.trim()}
                              className="px-4 h-12 bg-teal-600 hover:bg-teal-700 disabled:opacity-40 text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1.5 transition-all shadow-sm shrink-0"
                              title="Agregar al Itinerario"
                            >
                              <span className="material-symbols-outlined text-[18px]">add_location_alt</span>
                              <span className="hidden sm:inline">+ Agregar al Itinerario</span>
                              <span className="sm:hidden">+ Agregar</span>
                            </button>
                          </div>

                          {isSearchingColegio && (
                            <span className="text-[9px] font-bold text-teal-600 animate-pulse">
                              Buscando en {selectedRegionColegio === 'Todas' ? 'todas las regiones' : selectedRegionColegio}...
                            </span>
                          )}

                          {/* Dropdown de resultados de colegios con Región */}
                          {showColegioDropdown && colegioSearchResults.length > 0 && (
                            <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-teal-100 rounded-2xl shadow-2xl overflow-hidden z-50 max-h-60 overflow-y-auto">
                              {colegioSearchResults.map(col => (
                                <div
                                  key={col.id || col.codigo_modular}
                                  onClick={() => handleAddColegioToItinerario(col)}
                                  className="p-3 hover:bg-teal-50 cursor-pointer border-b border-slate-100 last:border-0 transition-colors flex items-center justify-between gap-2"
                                >
                                  <div className="min-w-0 flex-1">
                                    <div className="font-bold text-slate-900 text-xs truncate">{col.nombre_ie}</div>
                                    <div className="text-[10px] text-slate-500 flex items-center gap-2 mt-0.5">
                                      <span className="bg-slate-100 px-1.5 py-0.5 rounded font-mono text-[9px]">{col.nivel_modalidad || 'Secundaria'}</span>
                                      <span>📍 {col.distrito} - {col.provincia}</span>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2 shrink-0">
                                    <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-teal-100 text-teal-800 border border-teal-200">
                                      {formatDepartamento(col.departamento) || selectedRegionColegio}
                                    </span>
                                    <button
                                      type="button"
                                      className="px-2.5 py-1 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-[10px] font-black uppercase tracking-wider flex items-center gap-1 transition-colors"
                                    >
                                      <span className="material-symbols-outlined text-[14px]">add</span>
                                      <span>Agregar</span>
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Lista Acumulada del Itinerario de Colegios */}
                        <div>
                          <div className="flex justify-between items-center mb-1.5">
                            <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest flex items-center gap-1">
                              <span className="material-symbols-outlined text-[16px] text-teal-600">route</span>
                              Itinerario de Colegios de la Gira ({formData.colegios_itinerario?.length || 0})
                            </label>
                            {formData.colegios_itinerario && formData.colegios_itinerario.length > 0 && (
                              <span className="text-[9px] font-bold text-slate-400">
                                Organice el día o turno de cada visita
                              </span>
                            )}
                          </div>

                          {formData.colegios_itinerario && formData.colegios_itinerario.length > 0 ? (
                            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                              {formData.colegios_itinerario.map((col, idx) => (
                                <div
                                  key={col.id || idx}
                                  className="p-3 bg-white border border-teal-100 rounded-2xl flex items-center justify-between gap-2.5 shadow-sm hover:border-teal-300 transition-all"
                                >
                                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                    <span className="size-6 rounded-lg bg-teal-50 text-teal-800 text-[10px] font-black flex items-center justify-center shrink-0">
                                      {idx + 1}
                                    </span>
                                    <div className="min-w-0 flex-1">
                                      <p className="text-xs font-black text-slate-800 truncate">
                                        {col.nombre_ie}
                                      </p>
                                      <p className="text-[10px] text-slate-500 font-bold truncate">
                                        📍 {col.distrito} • {col.provincia} {col.departamento && col.departamento.toUpperCase() !== 'CUSCO' ? `(${col.departamento})` : ''}
                                      </p>
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-1.5 shrink-0">
                                    <input
                                      type="text"
                                      value={col.dia_estimado || ''}
                                      onChange={(e) => handleUpdateColegioDia(idx, e.target.value)}
                                      placeholder="Ej: Día 1 / Mañana"
                                      className="w-28 h-8 px-2 rounded-lg border border-slate-200 text-[11px] font-bold bg-slate-50 text-slate-700 outline-none focus:border-teal-600 text-center"
                                      title="Día o turno estimado para este colegio"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => handleRemoveColegioItinerario(idx)}
                                      className="size-8 rounded-lg bg-slate-50 border border-slate-200 hover:bg-rose-50 hover:border-rose-200 text-slate-400 hover:text-rose-600 flex items-center justify-center transition-colors"
                                      title="Quitar del itinerario"
                                    >
                                      <span className="material-symbols-outlined text-[16px]">close</span>
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="p-4 bg-white/70 border border-dashed border-teal-200 rounded-2xl text-center text-teal-700 text-xs font-bold">
                              Aún no ha agregado colegios al itinerario de esta gira. Busque por nombre o distrito arriba y presione <span className="font-extrabold underline">+ Agregar al Itinerario</span>.
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* B. CASO VISITA A COLEGIOS REGULAR (1 Colegio principal) */}
                    {isVisita && (
                      <div className="flex flex-col gap-2 relative" ref={colegioDropdownRef}>
                        <div className="flex flex-wrap justify-between items-center gap-2">
                          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                            Colegio / Destino
                          </label>
                          <div className="flex gap-1 bg-slate-100 p-0.5 rounded-lg">
                            {REGIONES_GIRA.map(reg => (
                              <button
                                key={reg}
                                type="button"
                                onClick={() => {
                                  setSelectedRegionColegio(reg);
                                  lastSelectedColegioRef.current = '';
                                }}
                                className={`px-2 py-0.5 rounded-md text-[9px] font-black uppercase transition-all ${
                                  selectedRegionColegio === reg 
                                    ? 'bg-violet-600 text-white shadow-sm' 
                                    : 'text-slate-600 hover:text-slate-900'
                                }`}
                              >
                                {reg}
                              </button>
                            ))}
                          </div>
                        </div>
                        <input
                          type="text"
                          value={colegioSearchTerm || formData.lugar || ''}
                          onChange={(e) => {
                            const val = e.target.value;
                            if (val !== lastSelectedColegioRef.current) {
                              lastSelectedColegioRef.current = '';
                            }
                            setColegioSearchTerm(val);
                            setFormData({ ...formData, lugar: val });
                          }}
                          onFocus={() => {
                            if (colegioSearchResults.length > 0) setShowColegioDropdown(true);
                          }}
                          placeholder={
                            selectedRegionColegio === 'Todas' 
                              ? "Buscar colegio, distrito o provincia en todo el Perú..." 
                              : `Buscar en ${selectedRegionColegio} (ej: colegio o distrito)...`
                          }
                          className="w-full h-12 px-4 rounded-xl border border-violet-200 bg-white focus:border-violet-600 outline-none font-bold text-xs shadow-sm"
                        />
                        {/* Dropdown de resultados de colegios mostrando la Región */}
                        {showColegioDropdown && colegioSearchResults.length > 0 && (
                          <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-2xl shadow-xl overflow-hidden z-50 max-h-56 overflow-y-auto">
                            {colegioSearchResults.map(col => (
                              <div
                                key={col.id || col.codigo_modular}
                                onClick={() => handleSelectColegio(col)}
                                className="p-3 hover:bg-violet-50 cursor-pointer border-b border-slate-100 last:border-0 transition-colors flex justify-between items-center"
                              >
                                <div>
                                  <div className="font-bold text-slate-900 text-xs">{col.nombre_ie}</div>
                                  <div className="text-[10px] text-slate-500 flex items-center gap-2 mt-0.5">
                                    <span className="bg-slate-100 px-1 rounded font-mono text-[9px]">{col.nivel_modalidad || 'Secundaria'}</span>
                                    <span>📍 {col.distrito}, {col.provincia}</span>
                                  </div>
                                </div>
                                <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-violet-100 text-violet-700">
                                  {formatDepartamento(col.departamento) || selectedRegionColegio}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* C. CASO FERIA O CAPACITACIÓN: Input de lugar normal */}
                    {!isVisita && !isGira && (
                      <div>
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Lugar o Sede</label>
                        <input
                          type="text"
                          value={formData.lugar || ''}
                          onChange={(e) => setFormData({ ...formData, lugar: e.target.value })}
                          placeholder="Ej: Paraninfo Universitario / Plaza Mayor"
                          className="w-full h-12 px-4 rounded-xl border border-violet-200 bg-white focus:border-violet-600 outline-none font-bold text-xs mt-1 shadow-sm"
                        />
                      </div>
                    )}

                    {/* Horario y Estado */}
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                          {isGira ? 'Hora de Salida / Partida' : 'Hora de Salida / Turno'}
                        </label>
                        <input
                          type="text"
                          value={formData.hora || ''}
                          onChange={(e) => setFormData({ ...formData, hora: e.target.value })}
                          placeholder={isGira ? 'Ej: 07:00 AM' : 'Ej: 08:30 AM o Turno Mañana'}
                          className={`w-full h-12 px-4 rounded-xl border bg-white outline-none font-bold text-xs mt-1 shadow-sm ${
                            isGira ? 'border-teal-200 focus:border-teal-600' : 'border-violet-200 focus:border-violet-600'
                          }`}
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                          {isGira ? 'Estado de la Gira' : 'Estado'}
                        </label>
                        <select
                          value={formData.estado_evento || 'Programado'}
                          onChange={(e) => setFormData({ ...formData, estado_evento: e.target.value as any })}
                          className={`w-full h-12 px-3 rounded-xl border bg-white outline-none font-bold text-xs mt-1 cursor-pointer shadow-sm ${
                            isGira ? 'border-teal-200 focus:border-teal-600' : 'border-violet-200 focus:border-violet-600'
                          }`}
                        >
                          <option value="Programado">🔵 Programado</option>
                          <option value="En Curso">🟡 En Curso</option>
                          <option value="Realizado">🟢 Realizado</option>
                          <option value="Cancelado">🔴 Cancelado</option>
                        </select>
                      </div>
                    </div>
                  </div>
                )}

                {/* 2. DELEGACIÓN / PERSONAL ASIGNADO (Solo si es Visita, Feria o Capacitación) */}
                {isFieldEvent && (
                  <div className="bg-slate-50 p-4 sm:p-5 rounded-3xl border-2 border-slate-100 space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-[18px] text-indigo-600">group</span>
                        Delegación / Personal Asignado ({formData.personal_asignado.length})
                      </label>
                      <span className="text-[9px] font-extrabold text-slate-400 uppercase tracking-wider bg-white px-2 py-0.5 rounded-full border border-slate-200">
                        personal_directorio
                      </span>
                    </div>

                    {/* Selector y Búsqueda en personal_directorio con comodines */}
                    <div className="relative" ref={staffDropdownRef}>
                      <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-lg">
                        person_search
                      </span>
                      <input
                        type="text"
                        value={staffSearchTerm}
                        onChange={(e) => {
                          setStaffSearchTerm(e.target.value);
                          setShowStaffDropdown(true);
                        }}
                        onFocus={() => {
                          if (staffSearchResults.length > 0) setShowStaffDropdown(true);
                        }}
                        placeholder="Buscar trabajador por Apellidos, Nombres o DNI..."
                        className="w-full h-12 pl-12 pr-4 rounded-2xl border-2 border-slate-200 bg-white focus:border-indigo-600 outline-none font-bold text-xs transition-all shadow-sm"
                      />

                      {/* Dropdown de Autocompletado */}
                      {showStaffDropdown && staffSearchResults.length > 0 && (
                        <div className="absolute top-14 left-0 w-full z-[120] bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden max-h-60 overflow-y-auto">
                          {staffSearchResults.map((p) => {
                            const isAlreadyAdded = formData.personal_asignado.some(
                              (m) => m.dni === p.dni
                            );
                            return (
                              <div
                                key={p.id || p.dni}
                                onClick={() => {
                                  if (!isAlreadyAdded) handleAddStaff(p);
                                }}
                                className={`p-3 border-b border-slate-100 last:border-0 flex items-center justify-between transition-colors ${
                                  isAlreadyAdded
                                    ? 'bg-slate-50 opacity-60 cursor-not-allowed'
                                    : 'hover:bg-indigo-50/70 cursor-pointer'
                                }`}
                              >
                                <div className="min-w-0 flex-1 pr-2">
                                  <div className="font-black text-slate-800 text-xs truncate">{p.nombre}</div>
                                  <div className="flex items-center gap-2 mt-0.5 text-[10px] text-slate-500 font-bold">
                                    <span>DNI: {p.dni}</span>
                                    {p.telefono && <span>• Tel: {p.telefono}</span>}
                                    {p.facultad_dependencia && <span className="truncate">• {p.facultad_dependencia}</span>}
                                  </div>
                                </div>
                                {isAlreadyAdded ? (
                                  <span className="text-[9px] font-black text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full uppercase">
                                    Asignado
                                  </span>
                                ) : (
                                  <span className="material-symbols-outlined text-indigo-600 text-xl shrink-0">
                                    add_circle
                                  </span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Listado de Miembros Asignados */}
                    {formData.personal_asignado.length > 0 ? (
                      <div className="space-y-2 max-h-64 overflow-y-auto pr-1 pt-1">
                        {formData.personal_asignado.map((member, idx) => {
                          const cleanPhone = (member.telefono || '').replace(/\D/g, '');
                          const waPhone = cleanPhone.length === 9 ? `51${cleanPhone}` : cleanPhone;
                          const reminderMsg = `Estimado(a) ${member.nombre}, se le recuerda su participación en la comisión institucional: "${formData.title}" para ${formData.lugar || 'la actividad'}, programada el ${formData.start_date}${formData.hora ? ` a las ${formData.hora}` : ''}. Rol: ${member.rol_comision || 'Participante'}. UNSAAC Dirección de Admisión.`;
                          const waUrl = cleanPhone ? `https://wa.me/${waPhone}?text=${encodeURIComponent(reminderMsg)}` : null;

                          return (
                            <div
                              key={member.dni || idx}
                              className="p-3 bg-white border border-slate-200 rounded-2xl flex items-center justify-between gap-3 shadow-sm hover:border-indigo-200 transition-all"
                            >
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <span className="size-6 rounded-lg bg-indigo-50 text-indigo-700 text-[10px] font-black flex items-center justify-center shrink-0">
                                    {idx + 1}
                                  </span>
                                  <p className="text-xs font-black text-slate-800 truncate">
                                    {member.nombre}
                                  </p>
                                </div>
                                <div className="flex items-center gap-3 text-[10px] text-slate-500 font-bold ml-8 mt-0.5">
                                  <span>DNI: {member.dni}</span>
                                  {member.telefono && <span>📱 {member.telefono}</span>}
                                  {member.dependencia && <span className="hidden md:inline truncate">• {member.dependencia}</span>}
                                </div>
                              </div>

                              <div className="flex items-center gap-1.5 shrink-0">
                                {/* Rol en la comisión */}
                                <select
                                  value={member.rol_comision || 'Participante'}
                                  onChange={(e) => handleUpdateStaffRole(member.dni, e.target.value as any)}
                                  className="h-8 px-2 rounded-xl border border-slate-200 text-[11px] font-extrabold bg-slate-50 text-slate-700 outline-none focus:border-indigo-600 cursor-pointer"
                                >
                                  <option value="Coordinador">Coordinador</option>
                                  <option value="Expositor">Expositor</option>
                                  <option value="Apoyo Técnico">Apoyo Técnico</option>
                                  <option value="Conductor">Conductor</option>
                                  <option value="Participante">Participante</option>
                                </select>

                                {/* WhatsApp Directo */}
                                {waUrl ? (
                                  <a
                                    href={waUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="size-8 rounded-xl bg-emerald-50 text-emerald-600 hover:bg-emerald-500 hover:text-white flex items-center justify-center transition-colors border border-emerald-200"
                                    title={`Enviar recordatorio de comisión por WhatsApp a ${member.nombre}`}
                                  >
                                    <span className="material-symbols-outlined text-[16px]">chat</span>
                                  </a>
                                ) : (
                                  <span
                                    className="size-8 rounded-xl bg-slate-100 text-slate-300 flex items-center justify-center cursor-not-allowed"
                                    title="Sin número telefónico registrado"
                                  >
                                    <span className="material-symbols-outlined text-[16px]">chat</span>
                                  </span>
                                )}

                                {/* Eliminar miembro */}
                                <button
                                  type="button"
                                  onClick={() => handleRemoveStaff(member.dni)}
                                  className="size-8 rounded-xl bg-slate-50 border border-slate-200 hover:bg-rose-50 hover:border-rose-200 text-slate-400 hover:text-rose-600 flex items-center justify-center transition-colors"
                                  title="Quitar miembro"
                                >
                                  <span className="material-symbols-outlined text-[16px]">close</span>
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="p-3 bg-white border border-dashed border-slate-200 rounded-2xl text-center text-slate-400 text-xs font-bold">
                        Sin personal asignado a esta actividad. Busque por nombre o DNI arriba para añadir integrantes.
                      </div>
                    )}
                  </div>
                )}

                {/* 3. CONTEXTO Y PROCESO (Limpio para eventos regulares) */}
                <div>
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Contexto y Proceso</label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2 bg-slate-50 p-4 rounded-2xl border-2 border-slate-100">
                    <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 block">Proceso de Admisión (Opcional)</label>
                        <input
                            type="text"
                            list="procesos-list"
                            placeholder="Ej: Ordinario 2026-I"
                            value={formData.proceso}
                            onChange={(e) => setFormData({ ...formData, proceso: e.target.value })}
                            className="w-full h-11 px-4 rounded-xl border border-slate-200 focus:border-indigo-600 outline-none font-bold text-xs bg-white"
                        />
                        <datalist id="procesos-list">
                            {procesosUnicos.filter(p => p !== 'Todos').map(p => (
                                <option key={p} value={p} />
                            ))}
                        </datalist>
                    </div>

                    <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 block">Audiencia</label>
                        <select
                          value={formData.audiencia}
                          onChange={(e) => setFormData({ ...formData, audiencia: e.target.value as any })}
                          className="w-full h-11 px-3 rounded-xl border border-slate-200 focus:border-indigo-600 outline-none font-bold text-xs bg-white cursor-pointer"
                        >
                          <option value="Público General">Público General</option>
                          <option value="Personal Interno">Personal Interno</option>
                        </select>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Descripción / Objetivos</label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="w-full h-24 p-5 rounded-2xl border-2 border-slate-100 bg-slate-50 focus:border-indigo-600 focus:bg-white outline-none font-bold transition-all mt-2 resize-none text-xs"
                    placeholder="Detalles adicionales, objetivos de la visita o materiales a llevar..."
                  />
                </div>
              </div>

              <div className="p-6 bg-slate-50 border-t border-slate-100 flex gap-3 shrink-0">
                {selectedEvent && !showDeleteConfirm && (
                    <button
                        type="button"
                        onClick={() => setShowDeleteConfirm(true)}
                        className="size-14 bg-white border-2 border-red-100 text-red-500 rounded-2xl hover:bg-red-50 transition-all flex items-center justify-center shrink-0"
                        title="Eliminar Evento"
                    >
                        <span className="material-symbols-outlined">delete</span>
                    </button>
                )}
                {selectedEvent && showDeleteConfirm && (
                    <div className="flex bg-red-50 border-2 border-red-200 rounded-2xl overflow-hidden shadow-inner shrink-0">
                        <button
                            type="button"
                            onClick={() => handleDelete(selectedEvent.id)}
                            className="px-4 text-xs font-black tracking-widest text-white bg-red-500 hover:bg-red-600 transition-colors uppercase h-full flex items-center"
                        >
                            Confirmar
                        </button>
                        <button
                            type="button"
                            onClick={() => setShowDeleteConfirm(false)}
                            className="px-4 text-xs font-black tracking-widest text-red-700 hover:bg-red-100 transition-colors uppercase h-full flex items-center"
                        >
                            <span className="material-symbols-outlined text-[18px]">close</span>
                        </button>
                    </div>
                )}

                {(isFieldEvent || formData.personal_asignado.length > 0) && (
                  <button
                    type="button"
                    onClick={() => exportComisionPDF()}
                    className={`h-14 px-5 bg-white border-2 rounded-2xl text-xs font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 shrink-0 ${
                      isGira 
                        ? 'border-teal-200 text-teal-700 hover:bg-teal-50' 
                        : 'border-violet-200 text-violet-700 hover:bg-violet-50'
                    }`}
                    title={isGira ? "Imprimir Hoja de Ruta y Comisión de Difusión Vocacional en PDF" : "Imprimir Ficha de Comisión en PDF"}
                  >
                    <span className="material-symbols-outlined text-[20px]">
                      {isGira ? 'alt_route' : 'assignment'}
                    </span>
                    <span className="hidden md:inline">
                      {isGira ? 'Hoja de Ruta PDF' : 'Ficha PDF'}
                    </span>
                  </button>
                )}

                <button
                  onClick={handleSave}
                  disabled={loading}
                  className="flex-1 h-14 bg-indigo-600 text-white rounded-2xl text-xs font-black uppercase tracking-widest shadow-xl shadow-indigo-200 active:scale-95 transition-all flex items-center justify-center gap-2"
                >
                  {loading ? (
                      <span className="material-symbols-outlined animate-spin">progress_activity</span>
                  ) : (
                      <>
                        <span className="material-symbols-outlined">check_circle</span>
                        {selectedEvent ? 'Guardar Cambios' : 'Crear Evento'}
                      </>
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Export Modal */}
      <AnimatePresence>
        {isExportModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-white rounded-[40px] shadow-2xl w-full max-w-sm overflow-hidden flex flex-col"
            >
              <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                <div className="flex items-center gap-3">
                  <div className="size-12 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-lg shadow-indigo-100">
                    <span className="material-symbols-outlined text-2xl">
                      picture_as_pdf
                    </span>
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-slate-900 uppercase tracking-tighter">
                      Exportar
                    </h3>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Rango de meses</p>
                  </div>
                </div>
                <button onClick={() => setIsExportModalOpen(false)} className="p-3 text-slate-400 hover:bg-white rounded-full transition-all shadow-sm">
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>

              <div className="p-8 space-y-6">
                <div>
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Desde</label>
                  <input
                    type="month"
                    value={exportStartMonth}
                    onChange={(e) => setExportStartMonth(e.target.value)}
                    className="w-full h-14 px-6 rounded-2xl border-2 border-slate-100 bg-slate-50 focus:border-indigo-600 focus:bg-white outline-none font-bold transition-all mt-2"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Hasta</label>
                  <input
                    type="month"
                    value={exportEndMonth}
                    min={exportStartMonth}
                    onChange={(e) => setExportEndMonth(e.target.value)}
                    className="w-full h-14 px-6 rounded-2xl border-2 border-slate-100 bg-slate-50 focus:border-indigo-600 focus:bg-white outline-none font-bold transition-all mt-2"
                  />
                </div>
              </div>

              <div className="p-8 bg-slate-50 border-t border-slate-100">
                <button
                  onClick={exportToPDF}
                  className="w-full h-14 bg-indigo-600 text-white rounded-2xl text-xs font-black uppercase tracking-widest shadow-xl shadow-indigo-200 active:scale-95 transition-all flex items-center justify-center gap-2"
                >
                  <span className="material-symbols-outlined">download</span>
                  Generar PDF
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
