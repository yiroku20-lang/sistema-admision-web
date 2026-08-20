
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { User, ToastMessage, CalendarEvent } from '../types';
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
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    start_date: format(new Date(), 'yyyy-MM-dd'),
    end_date: format(new Date(), 'yyyy-MM-dd'),
    type: 'Evento' as CalendarEvent['type'],
    color: '#0ea5e9',
    proceso: '',
    audiencia: 'Público General' as CalendarEvent['audiencia']
  });

  // Extract unique process labels from data
  const procesosUnicos = useMemo(() => {
     const p = events.map(e => e.proceso).filter(Boolean);
     return ['Todos', ...Array.from(new Set(p))];
  }, [events]);

  const filteredEvents = useMemo(() => {
      return events.filter(e => {
         const matchProceso = filterProceso === 'Todos' || e.proceso === filterProceso;
         const matchAudiencia = filterAudiencia === 'Todas' || e.audiencia === filterAudiencia;
         const matchSearch = searchQuery.trim() === '' || e.title.toLowerCase().includes(searchQuery.toLowerCase());
         return matchProceso && matchAudiencia && matchSearch;
      });
  }, [events, filterProceso, filterAudiencia, searchQuery]);

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
      setEvents(data || []);
    } catch (err: any) {
      notify(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!formData.title) {
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
      const eventData = {
        ...formData,
        user_id: user.id
      };

      if (selectedEvent) {
        const { error } = await supabase
          .from('eventos')
          .update(eventData)
          .eq('id', selectedEvent.id);
        if (error) throw error;
        notify('Evento actualizado exitosamente');
      } else {
        const { error } = await supabase
          .from('eventos')
          .insert([eventData]);
        if (error) throw error;
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
        audiencia: 'Público General'
      });
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
                             audiencia: 'Público General'
                         });
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
                        setFormData({
                            ...formData,
                            start_date: format(day, 'yyyy-MM-dd'),
                            end_date: format(day, 'yyyy-MM-dd')
                        });
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
                              audiencia: event.audiencia || 'Público General'
                            });
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
                              <span className="text-[10px] font-bold break-words whitespace-normal leading-tight w-full">
                                {isStart && isMultiDay && <span className="mr-1 mt-0.5 inline-block">▶</span>}
                                {isEnd && isMultiDay && !isStart && <span className="mr-1 mt-0.5 inline-block">■</span>}
                                {event.title}
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
              className="bg-white rounded-[40px] shadow-2xl w-full max-w-lg overflow-hidden flex flex-col"
            >
              <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50">
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
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Complete los detalles del evento</p>
                  </div>
                </div>
                <button onClick={() => setIsModalOpen(false)} className="p-3 text-slate-400 hover:bg-white rounded-full transition-all shadow-sm">
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>

              <div className="p-8 space-y-6">
                <div>
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Título del Evento</label>
                  <input
                    type="text"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    className="w-full h-14 px-6 rounded-2xl border-2 border-slate-100 bg-slate-50 focus:border-indigo-600 focus:bg-white outline-none font-bold transition-all mt-2"
                    placeholder="Ej. Inscripción Extraordinaria..."
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Fecha Inicio</label>
                    <input
                      type="date"
                      value={formData.start_date}
                      onChange={(e) => {
                          const newStart = e.target.value;
                          // If it's a new event or end was same as start, sync it
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
                        onClick={() => setFormData({ ...formData, type: type.label as any })}
                        className={`py-3 rounded-xl border-2 transition-all text-[10px] font-black uppercase tracking-tighter ${
                          formData.type === type.label 
                            ? `border-indigo-600 ${type.bg} text-indigo-700` 
                            : 'border-slate-100 text-slate-400 hover:bg-slate-50'
                        }`}
                      >
                        {type.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Contexto y Agrupación</label>
                  <div className="grid grid-cols-1 gap-4 mt-2 bg-slate-50 p-4 rounded-2xl border-2 border-slate-100">
                    <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 block">Proceso de Admisión Asociado (Opcional)</label>
                        <input
                            type="text"
                            list="procesos-list"
                            placeholder="Ej: Ordinario 2026-I"
                            value={formData.proceso}
                            onChange={(e) => setFormData({ ...formData, proceso: e.target.value })}
                            className="w-full h-12 px-4 rounded-xl border border-slate-200 focus:border-indigo-600 outline-none font-bold text-sm bg-white"
                        />
                        <datalist id="procesos-list">
                            {procesosUnicos.filter(p => p !== 'Todos').map(p => (
                                <option key={p} value={p} />
                            ))}
                        </datalist>
                    </div>
                    <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 block">Audiencia del Evento</label>
                        <div className="flex gap-2">
                             <button
                                type="button"
                                onClick={() => setFormData({ ...formData, audiencia: 'Público General' })}
                                className={`flex-1 py-2 rounded-xl border-2 text-[10px] font-black uppercase tracking-tighter transition-all ${
                                    formData.audiencia === 'Público General' 
                                        ? 'border-indigo-600 bg-indigo-50 text-indigo-700' 
                                        : 'border-slate-200 text-slate-400 hover:bg-white'
                                }`}
                             >
                                 Público General
                             </button>
                             <button
                                type="button"
                                onClick={() => setFormData({ ...formData, audiencia: 'Personal Interno' })}
                                className={`flex-1 py-2 rounded-xl border-2 text-[10px] font-black uppercase tracking-tighter transition-all ${
                                    formData.audiencia === 'Personal Interno' 
                                        ? 'border-indigo-600 bg-indigo-50 text-indigo-700' 
                                        : 'border-slate-200 text-slate-400 hover:bg-white'
                                }`}
                             >
                                 Personal Interno
                             </button>
                        </div>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Descripción</label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="w-full h-24 p-6 rounded-2xl border-2 border-slate-100 bg-slate-50 focus:border-indigo-600 focus:bg-white outline-none font-bold transition-all mt-2 resize-none"
                    placeholder="Detalles adicionales..."
                  />
                </div>
              </div>

              <div className="p-8 bg-slate-50 border-t border-slate-100 flex gap-4">
                {selectedEvent && !showDeleteConfirm && (
                    <button
                        type="button"
                        onClick={() => setShowDeleteConfirm(true)}
                        className="size-14 bg-white border-2 border-red-100 text-red-500 rounded-2xl hover:bg-red-50 transition-all flex items-center justify-center shrink-0 title-['Eliminar Evento']"
                    >
                        <span className="material-symbols-outlined">delete</span>
                    </button>
                )}
                {selectedEvent && showDeleteConfirm && (
                    <div className="flex bg-red-50 border-2 border-red-200 rounded-2xl overflow-hidden shadow-inner">
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
