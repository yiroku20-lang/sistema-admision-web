import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabaseClient';
import { User, ToastMessage, CharlaSolicitud, CharlaDisponibilidad, PersonalDirectorio } from '../types';
import { format, addDays, parseISO, isWeekend } from 'date-fns';
import { es } from 'date-fns/locale';

interface SchoolVisitsManagementProps {
  user: User;
  notify: (message: string, type?: ToastMessage['type']) => void;
}

export const SchoolVisitsManagement: React.FC<SchoolVisitsManagementProps> = ({ user, notify }) => {
  // Tab principal: Solicitudes o Disponibilidad de Cupos
  const [activeTab, setActiveTab] = useState<'solicitudes' | 'disponibilidad'>('solicitudes');

  // Estados para Solicitudes
  const [solicitudes, setSolicitudes] = useState<CharlaSolicitud[]>([]);
  const [disponibilidades, setDisponibilidades] = useState<CharlaDisponibilidad[]>([]);
  const [personalList, setPersonalList] = useState<PersonalDirectorio[]>([]);
  const [loading, setLoading] = useState(true);

  // Filtros
  const [statusFilter, setStatusFilter] = useState<string>('Todos');
  const [modalidadFilter, setModalidadFilter] = useState<string>('Todas');
  const [regionFilter, setRegionFilter] = useState<string>('Todas');
  const [searchTerm, setSearchTerm] = useState('');

  // Modales
  const [selectedSolicitud, setSelectedSolicitud] = useState<CharlaSolicitud | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const [isObservationModalOpen, setIsObservationModalOpen] = useState(false);
  const [observationReason, setObservationReason] = useState('');

  // Generador de cupos
  const [isGeneratingSlots, setIsGeneratingSlots] = useState(false);
  const [slotGenerationSuccess, setSlotGenerationSuccess] = useState<string | null>(null);

  // Nuevo slot manual
  const [showAddSlotModal, setShowAddSlotModal] = useState(false);
  const [newSlotData, setNewSlotData] = useState({
    fecha: format(addDays(new Date(), 1), 'yyyy-MM-dd'),
    turno: 'Mañana' as 'Mañana' | 'Tarde',
    hora_inicio: '09:00',
    hora_fin: '11:00',
    modalidad_permitida: 'Ambas' as 'Presencial' | 'Virtual' | 'Ambas',
    cupo_maximo: 2,
    notas: ''
  });

  // Carga inicial de datos
  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      await Promise.all([fetchSolicitudes(), fetchDisponibilidades(), fetchPersonal()]);
    } catch (err: any) {
      console.error('Error fetching data:', err);
      notify('Error cargando los datos del sistema', 'error');
    } finally {
      setLoading(false);
    }
  };

  const fetchSolicitudes = async () => {
    const { data, error } = await supabase
      .from('charlas_solicitudes')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching solicitudes:', error);
      throw error;
    }
    setSolicitudes(data || []);
  };

  const fetchDisponibilidades = async () => {
    const { data, error } = await supabase
      .from('charlas_disponibilidad')
      .select('*')
      .order('fecha', { ascending: true })
      .order('hora_inicio', { ascending: true });

    if (error) {
      console.error('Error fetching disponibilidades:', error);
      throw error;
    }
    setDisponibilidades(data || []);
  };

  const fetchPersonal = async () => {
    const { data, error } = await supabase
      .from('personal_directorio')
      .select('id, dni, nombre, cargo_actual, telefono, correo')
      .order('nombre', { ascending: true });

    if (!error && data) {
      setPersonalList(data as PersonalDirectorio[]);
    }
  };

  // Mapeo del personal en solicitudes
  const enrichedSolicitudes = useMemo(() => {
    const map = new Map<string, PersonalDirectorio>();
    personalList.forEach(p => map.set(p.id, p));

    return solicitudes.map(sol => ({
      ...sol,
      personal_directorio: sol.ponente_id && map.has(sol.ponente_id) ? {
        id: map.get(sol.ponente_id)!.id,
        nombre: map.get(sol.ponente_id)!.nombre,
        cargo_actual: map.get(sol.ponente_id)!.cargo_actual,
        telefono: map.get(sol.ponente_id)!.telefono
      } : undefined
    }));
  }, [solicitudes, personalList]);

  // Regiones únicas para filtro
  const availableRegions = useMemo(() => {
    const set = new Set<string>();
    solicitudes.forEach(s => {
      if (s.departamento) set.add(s.departamento.trim().toUpperCase());
    });
    return Array.from(set).sort();
  }, [solicitudes]);

  // Filtrado de solicitudes
  const filteredSolicitudes = useMemo(() => {
    return enrichedSolicitudes.filter(item => {
      // Estado
      if (statusFilter !== 'Todos' && item.estado !== statusFilter) return false;
      // Modalidad
      if (modalidadFilter !== 'Todas' && item.modalidad !== modalidadFilter) return false;
      // Región
      if (regionFilter !== 'Todas' && item.departamento?.toUpperCase() !== regionFilter) return false;
      // Búsqueda
      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase();
        const matchName = item.nombre_ie?.toLowerCase().includes(query);
        const matchModular = item.codigo_modular?.toLowerCase().includes(query);
        const matchDirector = item.director_nombre?.toLowerCase().includes(query);
        const matchDist = item.distrito?.toLowerCase().includes(query);
        const matchProv = item.provincia?.toLowerCase().includes(query);
        const matchCode = item.codigo_seguimiento?.toLowerCase().includes(query);
        return matchName || matchModular || matchDirector || matchDist || matchProv || matchCode;
      }
      return true;
    });
  }, [enrichedSolicitudes, statusFilter, modalidadFilter, regionFilter, searchTerm]);

  // Estadísticas KPI de Impacto
  const stats = useMemo(() => {
    const total = solicitudes.length;
    const pendientes = solicitudes.filter(s => s.estado === 'Pendiente').length;
    const confirmadas = solicitudes.filter(s => s.estado === 'Cita Confirmada' || s.estado === 'Completada').length;
    const aprobadasReserva = solicitudes.filter(s => s.estado === 'Aprobada para Reserva').length;
    const observadas = solicitudes.filter(s => s.estado === 'Observada').length;

    // Colegios únicos confirmados
    const uniqueColegios = new Set(
      solicitudes
        .filter(s => s.estado === 'Cita Confirmada' || s.estado === 'Completada')
        .map(s => s.codigo_modular || s.nombre_ie)
    ).size;

    // Total alumnos impactados
    const totalAlumnos = solicitudes
      .filter(s => s.estado === 'Cita Confirmada' || s.estado === 'Completada')
      .reduce((sum, s) => sum + (Number(s.alumnos_4to) || 0) + (Number(s.alumnos_5to) || 0), 0);

    const presenciales = solicitudes.filter(s => s.modalidad === 'Presencial').length;
    const virtuales = solicitudes.filter(s => s.modalidad === 'Virtual').length;

    return {
      total,
      pendientes,
      confirmadas,
      aprobadasReserva,
      observadas,
      uniqueColegios,
      totalAlumnos,
      presenciales,
      virtuales
    };
  }, [solicitudes]);

  // Generador de Cupos a 3 Semanas (Lunes a Viernes, Turnos Mañana y Tarde)
  const handleGenerateThreeWeeksSlots = async () => {
    if (!window.confirm('¿Desea generar automáticamente los cupos de atención para los próximos 21 días (lunes a viernes, turnos mañana y tarde)?')) {
      return;
    }

    setIsGeneratingSlots(true);
    setSlotGenerationSuccess(null);
    try {
      const today = new Date();
      const newSlots: Partial<CharlaDisponibilidad>[] = [];

      // Consultar fechas/turnos ya existentes para no duplicar
      const existingKeySet = new Set(
        disponibilidades.map(d => `${d.fecha}_${d.turno === 'Manana' ? 'Mañana' : d.turno}`)
      );

      for (let i = 1; i <= 21; i++) {
        const date = addDays(today, i);
        // Excluir fines de semana
        if (isWeekend(date)) continue;

        const dateStr = format(date, 'yyyy-MM-dd');

        // Turno Mañana (09:00 - 11:00)
        if (!existingKeySet.has(`${dateStr}_Mañana`)) {
          newSlots.push({
            fecha: dateStr,
            turno: 'Mañana',
            hora_inicio: '09:00:00',
            hora_fin: '11:00:00',
            modalidad_permitida: 'Ambas',
            cupo_maximo: 2,
            cupo_reservado: 0,
            activo: true,
            notas: 'Generado automáticamente'
          });
        }

        // Turno Tarde (15:00 - 17:00)
        if (!existingKeySet.has(`${dateStr}_Tarde`)) {
          newSlots.push({
            fecha: dateStr,
            turno: 'Tarde',
            hora_inicio: '15:00:00',
            hora_fin: '17:00:00',
            modalidad_permitida: 'Ambas',
            cupo_maximo: 2,
            cupo_reservado: 0,
            activo: true,
            notas: 'Generado automáticamente'
          });
        }
      }

      if (newSlots.length === 0) {
        notify('Los cupos para las próximas 3 semanas ya se encontraban creados.', 'info');
        setIsGeneratingSlots(false);
        return;
      }

      // Usar endpoint administrativo con service_role y fallback
      try {
        const res = await fetch('/api/charlas/disponibilidad/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ slots: newSlots })
        });
        if (!res.ok) {
          const { error } = await supabase.from('charlas_disponibilidad').insert(newSlots);
          if (error) throw error;
        }
      } catch (insertErr) {
        const { error } = await supabase.from('charlas_disponibilidad').insert(newSlots);
        if (error) throw error;
      }

      notify(`¡Se generaron con éxito ${newSlots.length} nuevos turnos de atención!`, 'success');
      setSlotGenerationSuccess(`Generados ${newSlots.length} cupos exitosamente.`);
      await fetchDisponibilidades();
    } catch (err: any) {
      console.error('Error generando cupos:', err);
      notify('Error al generar cupos de disponibilidad: ' + (err.message || ''), 'error');
    } finally {
      setIsGeneratingSlots(false);
    }
  };

  // Crear slot individual manual
  const handleCreateSingleSlot = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        fecha: newSlotData.fecha,
        turno: newSlotData.turno,
        hora_inicio: `${newSlotData.hora_inicio}:00`,
        hora_fin: `${newSlotData.hora_fin}:00`,
        modalidad_permitida: newSlotData.modalidad_permitida,
        cupo_maximo: Number(newSlotData.cupo_maximo) || 1,
        cupo_reservado: 0,
        activo: true,
        notas: newSlotData.notas
      };

      try {
        const res = await fetch('/api/charlas/disponibilidad', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (!res.ok) {
          const { error } = await supabase.from('charlas_disponibilidad').insert([payload]);
          if (error) throw error;
        }
      } catch {
        const { error } = await supabase.from('charlas_disponibilidad').insert([payload]);
        if (error) throw error;
      }

      notify('Turno de disponibilidad creado correctamente', 'success');
      setShowAddSlotModal(false);
      await fetchDisponibilidades();
    } catch (err: any) {
      console.error('Error creating slot:', err);
      notify('Error al crear turno: ' + err.message, 'error');
    }
  };

  // Alternar estado activo de un slot de disponibilidad
  const handleToggleSlotActive = async (slot: CharlaDisponibilidad) => {
    try {
      const newActive = !slot.activo;
      try {
        const res = await fetch(`/api/charlas/disponibilidad/${slot.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ activo: newActive, updated_at: new Date().toISOString() })
        });
        if (!res.ok) throw new Error();
      } catch {
        const { error } = await supabase
          .from('charlas_disponibilidad')
          .update({ activo: newActive, updated_at: new Date().toISOString() })
          .eq('id', slot.id);
        if (error) throw error;
      }

      setDisponibilidades(prev =>
        prev.map(s => (s.id === slot.id ? { ...s, activo: newActive } : s))
      );
      notify(`Turno ${newActive ? 'activado' : 'pausado'} correctamente`, 'success');
    } catch (err: any) {
      notify('Error actualizando disponibilidad', 'error');
    }
  };

  // Eliminar slot sin reservas
  const handleDeleteSlot = async (slot: CharlaDisponibilidad) => {
    if (slot.cupo_reservado > 0) {
      notify('No se puede eliminar un turno que ya tiene cupos reservados.', 'warning');
      return;
    }
    if (!window.confirm(`¿Seguro que deseas eliminar el turno del ${slot.fecha} (${slot.turno})?`)) return;

    try {
      try {
        const res = await fetch(`/api/charlas/disponibilidad/${slot.id}`, { method: 'DELETE' });
        if (!res.ok) throw new Error();
      } catch {
        const { error } = await supabase.from('charlas_disponibilidad').delete().eq('id', slot.id);
        if (error) throw error;
      }
      setDisponibilidades(prev => prev.filter(s => s.id !== slot.id));
      notify('Turno eliminado correctamente', 'success');
    } catch (err: any) {
      notify('Error al eliminar turno: ' + err.message, 'error');
    }
  };

  // Asignar ponente directamente desde la lista o modal
  const handleAssignPonente = async (solicitudId: string, ponenteId: string) => {
    try {
      const payload = {
        ponente_id: ponenteId || null,
        updated_at: new Date().toISOString()
      };
      try {
        const res = await fetch(`/api/charlas/solicitudes/${solicitudId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (!res.ok) throw new Error();
      } catch {
        const { error } = await supabase
          .from('charlas_solicitudes')
          .update(payload)
          .eq('id', solicitudId);
        if (error) throw error;
      }

      setSolicitudes(prev =>
        prev.map(s => (s.id === solicitudId ? { ...s, ponente_id: ponenteId || null } : s))
      );

      if (selectedSolicitud && selectedSolicitud.id === solicitudId) {
        setSelectedSolicitud(prev => prev ? { ...prev, ponente_id: ponenteId || null } : null);
      }

      notify('Ponente asignado correctamente', 'success');
    } catch (err: any) {
      console.error('Error assigning ponente:', err);
      notify('Error al asignar ponente', 'error');
    }
  };

  // Actualizar estado de la solicitud
  const handleUpdateStatus = async (
    solicitud: CharlaSolicitud,
    nuevoEstado: CharlaSolicitud['estado'],
    extraFields?: Partial<CharlaSolicitud>
  ) => {
    try {
      const isUuid = user?.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(user.id);
      const updatePayload: any = {
        estado: nuevoEstado,
        reviewed_by: isUuid ? user.id : null,
        reviewed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        ...extraFields
      };

      try {
        const res = await fetch(`/api/charlas/solicitudes/${solicitud.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updatePayload)
        });
        if (!res.ok) throw new Error();
      } catch {
        const { error } = await supabase
          .from('charlas_solicitudes')
          .update(updatePayload)
          .eq('id', solicitud.id);
        if (error) throw error;
      }

      // Sincronización automática con la Agenda / Calendario al confirmar cita
      if (nuevoEstado === 'Cita Confirmada') {
        await syncWithCalendarEvent({
          ...solicitud,
          ...updatePayload
        });

        // Si tiene un disponibilidad_id asignado, incrementar cupo_reservado
        const dispId = extraFields?.disponibilidad_id || solicitud.disponibilidad_id;
        if (dispId) {
          const targetSlot = disponibilidades.find(d => d.id === dispId);
          if (targetSlot) {
            try {
              await fetch(`/api/charlas/disponibilidad/${dispId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  cupo_reservado: (targetSlot.cupo_reservado || 0) + 1,
                  updated_at: new Date().toISOString()
                })
              });
            } catch {
              await supabase
                .from('charlas_disponibilidad')
                .update({
                  cupo_reservado: (targetSlot.cupo_reservado || 0) + 1,
                  updated_at: new Date().toISOString()
                })
                .eq('id', dispId);
            }
            fetchDisponibilidades();
          }
        }
      }

      notify(`Solicitud actualizada a: ${nuevoEstado}`, 'success');
      await fetchSolicitudes();

      if (selectedSolicitud && selectedSolicitud.id === solicitud.id) {
        setSelectedSolicitud(prev => prev ? { ...prev, ...updatePayload } : null);
      }
    } catch (err: any) {
      console.error('Error updating status:', err);
      notify('Error al actualizar estado: ' + err.message, 'error');
    }
  };

  // Sincronizar con la tabla eventos (Agenda / Calendario)
  const syncWithCalendarEvent = async (solicitud: CharlaSolicitud) => {
    try {
      const ponente = personalList.find(p => p.id === solicitud.ponente_id);
      const totalAlumnos = (Number(solicitud.alumnos_4to) || 0) + (Number(solicitud.alumnos_5to) || 0);

      const fechaCharla = solicitud.fecha_charla || format(new Date(), 'yyyy-MM-dd');
      const horaCharla = solicitud.hora_charla || '09:00 AM';

      const eventPayload = {
        title: `Charla Vocacional: ${solicitud.nombre_ie}`,
        description: `Charla vocacional ${solicitud.modalidad} para ${totalAlumnos} escolares (4to y 5to de secundaria).\nDirector(a): ${solicitud.director_nombre} (Cel: ${solicitud.director_telefono}).\nPonente: ${ponente ? ponente.nombre : 'Por asignar'}.\nCódigo Seguimiento: ${solicitud.codigo_seguimiento}.${solicitud.link_reunion ? `\nEnlace Virtual: ${solicitud.link_reunion}` : ''}`,
        start_date: fechaCharla,
        end_date: fechaCharla,
        type: 'Visita a Colegios',
        color: '#8b5cf6', // Violeta característico de colegios
        audiencia: 'Público General',
        lugar: `${solicitud.nombre_ie} - ${solicitud.distrito}, ${solicitud.provincia} (${solicitud.departamento})`,
        hora: horaCharla,
        estado_evento: 'Programado',
        colegios_itinerario: [
          {
            codigo_modular: solicitud.codigo_modular,
            nombre_ie: solicitud.nombre_ie,
            distrito: solicitud.distrito,
            provincia: solicitud.provincia,
            departamento: solicitud.departamento
          }
        ],
        personal_asignado: ponente ? [
          {
            id: ponente.id,
            nombre: ponente.nombre,
            cargo_rol: 'Ponente Asignado'
          }
        ] : []
      };

      const { error } = await supabase.from('eventos').insert([eventPayload]);
      if (!error) {
        notify('📅 Evento sincronizado automáticamente en la Agenda', 'info');
      } else {
        console.warn('Could not sync to eventos table:', error.message);
      }
    } catch (e) {
      console.error('Error syncing calendar event:', e);
    }
  };

  // Guardar observación de solicitud
  const handleSaveObservation = async () => {
    if (!selectedSolicitud) return;
    if (!observationReason.trim()) {
      notify('Por favor ingrese el motivo de la observación', 'warning');
      return;
    }

    await handleUpdateStatus(selectedSolicitud, 'Observada', {
      motivo_observacion: observationReason.trim()
    });
    setIsObservationModalOpen(false);
    setObservationReason('');
  };

  // Helper para enlace directo de WhatsApp al Director o Coordinador
  const openWhatsApp = (phone?: string, recipientName?: string, type: 'general' | 'confirmada' | 'aprobada' | 'observada' = 'general') => {
    if (!phone) {
      notify('No se registró teléfono de contacto', 'warning');
      return;
    }
    const cleanPhone = phone.replace(/\D/g, '');
    const fullNumber = cleanPhone.length === 9 ? `51${cleanPhone}` : cleanPhone;

    let text = `Estimado(a) Director(a) ${recipientName || ''}, le saludamos de la Dirección de Admisión de la Universidad Nacional de San Antonio Abad del Cusco (UNSAAC).`;
    
    if (type === 'aprobada') {
      text = `Estimado(a) Director(a) ${recipientName || ''}, le informamos que su solicitud para la Charla de Orientación Vocacional UNSAAC ha sido *APROBADA*. Ya puede ingresar con su código de seguimiento para coordinar la fecha exacta.`;
    } else if (type === 'confirmada') {
      text = `Estimado(a) Director(a) ${recipientName || ''}, le confirmamos que la Charla Vocacional UNSAAC para su Institución Educativa ha sido *CONFIRMADA*. Estaremos en comunicación para los detalles finales. ¡Muchas gracias!`;
    } else if (type === 'observada') {
      text = `Estimado(a) Director(a) ${recipientName || ''}, le comunicamos que su solicitud de Charla Vocacional presenta una pequeña observación. Por favor comuníquese con nosotros para subsanarla a la brevedad.`;
    }

    const url = `https://wa.me/${fullNumber}?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  };

  // Exportar solicitudes filtradas a CSV
  const handleExportCSV = () => {
    if (filteredSolicitudes.length === 0) {
      notify('No hay solicitudes para exportar', 'warning');
      return;
    }

    const headers = [
      'Código Seguimiento',
      'Institución Educativa',
      'Código Modular',
      'Departamento',
      'Provincia',
      'Distrito',
      'Tipo Gestión',
      'Director',
      'DNI',
      'Teléfono',
      'Email',
      'Alumnos 4to',
      'Alumnos 5to',
      'Total Alumnos',
      'Modalidad',
      'Fecha Charla',
      'Hora Charla',
      'Estado',
      'Ponente Asignado',
      'Fecha Creación'
    ];

    const rows = filteredSolicitudes.map(s => [
      `"${s.codigo_seguimiento || ''}"`,
      `"${(s.nombre_ie || '').replace(/"/g, '""')}"`,
      `"${s.codigo_modular || ''}"`,
      `"${s.departamento || ''}"`,
      `"${s.provincia || ''}"`,
      `"${s.distrito || ''}"`,
      `"${s.tipo_gestion || ''}"`,
      `"${(s.director_nombre || '').replace(/"/g, '""')}"`,
      `"${s.director_dni || ''}"`,
      `"${s.director_telefono || ''}"`,
      `"${s.director_email || ''}"`,
      s.alumnos_4to || 0,
      s.alumnos_5to || 0,
      (Number(s.alumnos_4to) || 0) + (Number(s.alumnos_5to) || 0),
      `"${s.modalidad || ''}"`,
      `"${s.fecha_charla || ''}"`,
      `"${s.hora_charla || ''}"`,
      `"${s.estado || ''}"`,
      `"${s.personal_directorio?.nombre || 'Sin asignar'}"`,
      `"${s.created_at ? format(parseISO(s.created_at), 'dd/MM/yyyy HH:mm') : ''}"`
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Charlas_Colegios_UNSAAC_${format(new Date(), 'yyyyMMdd_HHmm')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    notify('Reporte exportado exitosamente', 'success');
  };

  // Badge del estado
  const renderStatusBadge = (estado: CharlaSolicitud['estado']) => {
    switch (estado) {
      case 'Pendiente':
        return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black tracking-wide bg-amber-100 text-amber-800 border border-amber-200">⏳ Pendiente</span>;
      case 'Aprobada para Reserva':
        return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black tracking-wide bg-blue-100 text-blue-800 border border-blue-200">📅 Aprobada para Reserva</span>;
      case 'Cita Confirmada':
        return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black tracking-wide bg-emerald-100 text-emerald-800 border border-emerald-200">✅ Cita Confirmada</span>;
      case 'Observada':
        return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black tracking-wide bg-orange-100 text-orange-800 border border-orange-200">⚠️ Observada</span>;
      case 'Rechazada':
        return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black tracking-wide bg-rose-100 text-rose-800 border border-rose-200">❌ Rechazada</span>;
      case 'Completada':
        return <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black tracking-wide bg-purple-100 text-purple-800 border border-purple-200">🎓 Charla Realizada</span>;
      default:
        return <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700">{estado}</span>;
    }
  };

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Encabezado y Acciones Principales */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-[28px]">co_present</span>
            <h1 className="text-xl md:text-2xl font-black text-slate-900 tracking-tight uppercase">
              Charlas y Citas de Colegios
            </h1>
          </div>
          <p className="text-xs md:text-sm font-semibold text-slate-500 mt-1">
            Gestión de solicitudes vocacionales, cupos de atención, confirmación de fechas y asignación de ponentes UNSAAC.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Selector de Pestañas */}
          <div className="flex bg-slate-100 p-1 rounded-2xl border border-slate-200">
            <button
              onClick={() => setActiveTab('solicitudes')}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black transition-all ${
                activeTab === 'solicitudes'
                  ? 'bg-white text-primary shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span className="material-symbols-outlined text-base">inbox</span>
              Solicitudes ({solicitudes.length})
            </button>
            <button
              onClick={() => setActiveTab('disponibilidad')}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black transition-all ${
                activeTab === 'disponibilidad'
                  ? 'bg-white text-primary shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span className="material-symbols-outlined text-base">calendar_month</span>
              Cupos y Turnos ({disponibilidades.length})
            </button>
          </div>

          {activeTab === 'solicitudes' ? (
            <button
              onClick={handleExportCSV}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-black transition-all shadow-sm"
              title="Descargar reporte en formato Excel / CSV"
            >
              <span className="material-symbols-outlined text-base">download</span>
              Exportar CSV
            </button>
          ) : (
            <button
              onClick={handleGenerateThreeWeeksSlots}
              disabled={isGeneratingSlots}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-xs font-black transition-all shadow-sm disabled:opacity-50"
              title="Genera turnos de mañana y tarde para los próximos 21 días (lunes a viernes)"
            >
              <span className="material-symbols-outlined text-base">auto_mode</span>
              {isGeneratingSlots ? 'Generando...' : 'Generar Cupos (3 Semanas)'}
            </button>
          )}

          <button
            onClick={fetchData}
            className="p-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
            title="Recargar datos"
          >
            <span className={`material-symbols-outlined text-lg ${loading ? 'animate-spin' : ''}`}>sync</span>
          </button>
        </div>
      </div>

      {/* Tarjetas KPI de Métricas e Impacto */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[10px] font-black uppercase tracking-wider">Total Solicitudes</span>
            <span className="material-symbols-outlined text-lg text-slate-500">assignment</span>
          </div>
          <div className="mt-2">
            <span className="text-2xl font-black text-slate-900">{stats.total}</span>
            <p className="text-[10px] text-slate-400 font-bold mt-0.5">Recibidas en portal</p>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-amber-200/80 bg-amber-50/20 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-amber-500">
            <span className="text-[10px] font-black uppercase tracking-wider">Por Revisar</span>
            <span className="material-symbols-outlined text-lg">pending_actions</span>
          </div>
          <div className="mt-2">
            <span className="text-2xl font-black text-amber-700">{stats.pendientes}</span>
            <p className="text-[10px] text-amber-600 font-bold mt-0.5">Pendientes de evaluación</p>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-blue-200/80 bg-blue-50/20 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-blue-500">
            <span className="text-[10px] font-black uppercase tracking-wider">Por Agendar</span>
            <span className="material-symbols-outlined text-lg">event_available</span>
          </div>
          <div className="mt-2">
            <span className="text-2xl font-black text-blue-700">{stats.aprobadasReserva}</span>
            <p className="text-[10px] text-blue-600 font-bold mt-0.5">Aprobadas p/ reservar</p>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-emerald-200/80 bg-emerald-50/20 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-emerald-500">
            <span className="text-[10px] font-black uppercase tracking-wider">Citas Confirmadas</span>
            <span className="material-symbols-outlined text-lg">check_circle</span>
          </div>
          <div className="mt-2">
            <span className="text-2xl font-black text-emerald-700">{stats.confirmadas}</span>
            <p className="text-[10px] text-emerald-600 font-bold mt-0.5">{stats.uniqueColegios} colegios únicos</p>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-violet-200/80 bg-violet-50/20 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-violet-500">
            <span className="text-[10px] font-black uppercase tracking-wider">Alumnos Impactados</span>
            <span className="material-symbols-outlined text-lg">groups</span>
          </div>
          <div className="mt-2">
            <span className="text-2xl font-black text-violet-700">{stats.totalAlumnos.toLocaleString()}</span>
            <p className="text-[10px] text-violet-600 font-bold mt-0.5">Escolares de 4to y 5to</p>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[10px] font-black uppercase tracking-wider">Modalidad</span>
            <span className="material-symbols-outlined text-lg text-slate-500">sync_alt</span>
          </div>
          <div className="mt-2 space-y-1">
            <div className="flex justify-between text-[11px] font-bold">
              <span className="text-slate-600">Presencial:</span>
              <span className="text-slate-900">{stats.presenciales}</span>
            </div>
            <div className="flex justify-between text-[11px] font-bold">
              <span className="text-slate-600">Virtual:</span>
              <span className="text-slate-900">{stats.virtuales}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Contenido según la pestaña activa */}
      {activeTab === 'solicitudes' ? (
        <div className="space-y-4">
          {/* Barra de Filtros y Búsqueda */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col md:flex-row gap-3 items-center justify-between">
            <div className="w-full md:w-80 relative">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg">
                search
              </span>
              <input
                type="text"
                placeholder="Buscar colegio, modular, director, distrito..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-primary focus:bg-white transition-all"
              />
            </div>

            <div className="w-full md:w-auto flex flex-wrap items-center gap-2">
              {/* Filtro por Estado */}
              <div className="flex items-center gap-1.5 bg-slate-50 px-2.5 py-1.5 rounded-xl border border-slate-200 text-xs">
                <span className="text-slate-400 font-bold text-[10px] uppercase">Estado:</span>
                <select
                  value={statusFilter}
                  onChange={e => setStatusFilter(e.target.value)}
                  className="bg-transparent font-bold text-slate-700 outline-none cursor-pointer"
                >
                  <option value="Todos">Todos ({solicitudes.length})</option>
                  <option value="Pendiente">Pendiente</option>
                  <option value="Aprobada para Reserva">Aprobada para Reserva</option>
                  <option value="Cita Confirmada">Cita Confirmada</option>
                  <option value="Observada">Observada</option>
                  <option value="Rechazada">Rechazada</option>
                  <option value="Completada">Completada</option>
                </select>
              </div>

              {/* Filtro por Modalidad */}
              <div className="flex items-center gap-1.5 bg-slate-50 px-2.5 py-1.5 rounded-xl border border-slate-200 text-xs">
                <span className="text-slate-400 font-bold text-[10px] uppercase">Modalidad:</span>
                <select
                  value={modalidadFilter}
                  onChange={e => setModalidadFilter(e.target.value)}
                  className="bg-transparent font-bold text-slate-700 outline-none cursor-pointer"
                >
                  <option value="Todas">Todas</option>
                  <option value="Presencial">Presencial</option>
                  <option value="Virtual">Virtual</option>
                </select>
              </div>

              {/* Filtro por Región */}
              {availableRegions.length > 0 && (
                <div className="flex items-center gap-1.5 bg-slate-50 px-2.5 py-1.5 rounded-xl border border-slate-200 text-xs">
                  <span className="text-slate-400 font-bold text-[10px] uppercase">Región:</span>
                  <select
                    value={regionFilter}
                    onChange={e => setRegionFilter(e.target.value)}
                    className="bg-transparent font-bold text-slate-700 outline-none cursor-pointer"
                  >
                    <option value="Todas">Todas</option>
                    {availableRegions.map(reg => (
                      <option key={reg} value={reg}>{reg}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>

          {/* Tabla de Solicitudes */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-black uppercase text-[10px] tracking-wider">
                    <th className="py-3.5 px-4">Institución Educativa</th>
                    <th className="py-3.5 px-4">Ubicación</th>
                    <th className="py-3.5 px-4">Contacto / Director</th>
                    <th className="py-3.5 px-4">Alumnos / Mod.</th>
                    <th className="py-3.5 px-4">Fecha Solicitada</th>
                    <th className="py-3.5 px-4">Ponente Asignado</th>
                    <th className="py-3.5 px-4">Estado</th>
                    <th className="py-3.5 px-4 text-center">Oficio PDF</th>
                    <th className="py-3.5 px-4 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loading ? (
                    <tr>
                      <td colSpan={9} className="py-12 text-center text-slate-400">
                        <span className="material-symbols-outlined animate-spin text-3xl">progress_activity</span>
                        <p className="mt-2 font-bold text-xs">Cargando solicitudes de colegios...</p>
                      </td>
                    </tr>
                  ) : filteredSolicitudes.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-12 text-center text-slate-400">
                        <span className="material-symbols-outlined text-4xl text-slate-300">school</span>
                        <p className="mt-2 font-black text-slate-700">No se encontraron solicitudes registradas</p>
                        <p className="text-xs text-slate-400">Ajusta los filtros o espera nuevas solicitudes desde el portal vocacional.</p>
                      </td>
                    </tr>
                  ) : (
                    filteredSolicitudes.map(sol => {
                      const totalAlumnos = (Number(sol.alumnos_4to) || 0) + (Number(sol.alumnos_5to) || 0);

                      return (
                        <tr key={sol.id} className="hover:bg-slate-50/70 transition-colors">
                          {/* Institución Educativa */}
                          <td className="py-3 px-4">
                            <div className="font-black text-slate-900 leading-snug">{sol.nombre_ie}</div>
                            <div className="flex items-center gap-1.5 text-[10px] text-slate-400 mt-0.5">
                              <span className="font-mono bg-slate-100 px-1 py-0.2 rounded font-semibold text-slate-600">
                                {sol.codigo_modular}
                              </span>
                              <span>•</span>
                              <span className="font-mono text-violet-700 font-bold">
                                {sol.codigo_seguimiento}
                              </span>
                            </div>
                          </td>

                          {/* Ubicación */}
                          <td className="py-3 px-4">
                            <div className="font-bold text-slate-800">{sol.distrito}, {sol.provincia}</div>
                            <div className="text-[10px] text-slate-400">{sol.departamento}</div>
                          </td>

                          {/* Contacto / Director */}
                          <td className="py-3 px-4">
                            <div className="font-bold text-slate-900">{sol.director_nombre}</div>
                            <div className="flex items-center gap-2 text-[10px] text-slate-500 mt-0.5">
                              <span>📱 {sol.director_telefono}</span>
                              {sol.director_telefono && (
                                <button
                                  onClick={() => openWhatsApp(sol.director_telefono, sol.director_nombre, 'general')}
                                  className="text-emerald-600 hover:text-emerald-700 transition-colors font-black"
                                  title="Contactar al Director por WhatsApp"
                                >
                                  WhatsApp
                                </button>
                              )}
                            </div>
                          </td>

                          {/* Alumnos / Modalidad */}
                          <td className="py-3 px-4">
                            <div className="font-black text-slate-900">{totalAlumnos} alumnos</div>
                            <div className="flex items-center gap-1 mt-0.5">
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                                sol.modalidad === 'Presencial'
                                  ? 'bg-blue-50 text-blue-700 border border-blue-200'
                                  : 'bg-purple-50 text-purple-700 border border-purple-200'
                              }`}>
                                {sol.modalidad === 'Presencial' ? '🏛️ Presencial' : '💻 Virtual'}
                              </span>
                            </div>
                          </td>

                          {/* Fecha / Hora Charla */}
                          <td className="py-3 px-4">
                            {sol.fecha_charla ? (
                              <div>
                                <div className="font-bold text-slate-900">
                                  {format(parseISO(sol.fecha_charla), "dd 'de' MMM, yyyy", { locale: es })}
                                </div>
                                <div className="text-[10px] font-semibold text-slate-500">
                                  ⏰ {sol.hora_charla || 'Horario por coordinar'}
                                </div>
                              </div>
                            ) : (
                              <span className="text-[10px] italic text-slate-400 font-semibold">Sin fecha definida</span>
                            )}
                          </td>

                          {/* Ponente Asignado */}
                          <td className="py-3 px-4">
                            <select
                              value={sol.ponente_id || ''}
                              onChange={e => handleAssignPonente(sol.id, e.target.value)}
                              className="w-40 bg-slate-50 border border-slate-200 rounded-lg p-1 text-[11px] font-bold text-slate-700 focus:outline-none focus:border-primary truncate"
                            >
                              <option value="">-- Sin Ponente --</option>
                              {personalList.map(p => (
                                <option key={p.id} value={p.id}>
                                  {p.nombre} {p.cargo_actual ? `(${p.cargo_actual})` : ''}
                                </option>
                              ))}
                            </select>
                          </td>

                          {/* Estado */}
                          <td className="py-3 px-4">
                            {renderStatusBadge(sol.estado)}
                          </td>

                          {/* Oficio PDF */}
                          <td className="py-3 px-4 text-center">
                            {sol.oficio_pdf_url ? (
                              <button
                                onClick={() => setPdfPreviewUrl(sol.oficio_pdf_url!)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-black text-[10px] transition-colors"
                                title="Ver Oficio de Solicitud en PDF"
                              >
                                <span className="material-symbols-outlined text-sm text-rose-600">picture_as_pdf</span>
                                Ver Oficio
                              </button>
                            ) : (
                              <span className="text-[10px] text-slate-400 italic font-semibold">Sin archivo</span>
                            )}
                          </td>

                          {/* Acciones */}
                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={() => {
                                  setSelectedSolicitud(sol);
                                  setIsDetailModalOpen(true);
                                }}
                                className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors"
                                title="Ver detalles y gestionar solicitud"
                              >
                                <span className="material-symbols-outlined text-base">visibility</span>
                              </button>

                              {/* Acciones rápidas según estado */}
                              {sol.estado === 'Pendiente' && (
                                <>
                                  <button
                                    onClick={() => handleUpdateStatus(sol, 'Aprobada para Reserva')}
                                    className="p-1.5 rounded-lg text-blue-600 hover:bg-blue-50 transition-colors"
                                    title="Aprobar para que el colegio elija fecha de reserva"
                                  >
                                    <span className="material-symbols-outlined text-base">check</span>
                                  </button>
                                  <button
                                    onClick={() => {
                                      setSelectedSolicitud(sol);
                                      setObservationReason('');
                                      setIsObservationModalOpen(true);
                                    }}
                                    className="p-1.5 rounded-lg text-orange-600 hover:bg-orange-50 transition-colors"
                                    title="Observar solicitud con motivo"
                                  >
                                    <span className="material-symbols-outlined text-base">warning</span>
                                  </button>
                                </>
                              )}

                              {sol.estado === 'Aprobada para Reserva' && (
                                <button
                                  onClick={() => {
                                    setSelectedSolicitud(sol);
                                    setIsDetailModalOpen(true);
                                  }}
                                  className="px-2 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[10px] transition-colors"
                                  title="Confirmar Cita Oficial y Sincronizar Calendario"
                                >
                                  Confirmar Cita
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
      ) : (
        /* Pestaña: Gestión de Cupos y Turnos de Disponibilidad */
        <div className="space-y-4">
          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col md:flex-row items-center justify-between gap-3">
            <div>
              <h2 className="font-black text-slate-900 text-sm uppercase tracking-tight">
                Disponibilidad y Turnos de Atención UNSAAC
              </h2>
              <p className="text-xs text-slate-500 font-semibold mt-0.5">
                Fechas y turnos configurados para que los colegios con solicitud aprobada elijan su cita.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowAddSlotModal(true)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-black transition-all"
              >
                <span className="material-symbols-outlined text-base">add</span>
                Agregar Turno Individual
              </button>
              <button
                onClick={handleGenerateThreeWeeksSlots}
                disabled={isGeneratingSlots}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-xs font-black transition-all shadow-sm disabled:opacity-50"
              >
                <span className="material-symbols-outlined text-base">auto_mode</span>
                {isGeneratingSlots ? 'Generando...' : 'Generar Próximas 3 Semanas'}
              </button>
            </div>
          </div>

          {slotGenerationSuccess && (
            <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-3 rounded-2xl text-xs font-bold flex items-center justify-between">
              <span>{slotGenerationSuccess}</span>
              <button onClick={() => setSlotGenerationSuccess(null)} className="text-emerald-700 font-black">✕</button>
            </div>
          )}

          {/* Listado de Cupos */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {disponibilidades.map(slot => {
              const isFull = slot.cupo_reservado >= slot.cupo_maximo;
              const formattedDate = format(parseISO(slot.fecha), "EEEE dd 'de' MMMM", { locale: es });

              return (
                <div
                  key={slot.id}
                  className={`bg-white rounded-2xl border p-4 shadow-sm transition-all flex flex-col justify-between ${
                    !slot.activo
                      ? 'border-slate-200 opacity-60 bg-slate-50/50'
                      : isFull
                      ? 'border-rose-200 bg-rose-50/20'
                      : 'border-slate-200/80 hover:border-violet-300'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-md ${
                        slot.turno === 'Mañana' || slot.turno === 'Manana'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-indigo-100 text-indigo-800'
                      }`}>
                        🌅 {slot.turno}
                      </span>
                      <button
                        onClick={() => handleToggleSlotActive(slot)}
                        className={`text-[10px] font-black px-2 py-0.5 rounded-full transition-colors ${
                          slot.activo ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'
                        }`}
                        title="Clic para pausar o activar este turno"
                      >
                        {slot.activo ? 'Activo' : 'Pausado'}
                      </button>
                    </div>

                    <div className="mt-2">
                      <h3 className="font-black text-slate-900 text-sm capitalize">{formattedDate}</h3>
                      <p className="text-xs text-slate-500 font-semibold mt-0.5">
                        🕒 {slot.hora_inicio.slice(0, 5)} - {slot.hora_fin.slice(0, 5)}
                      </p>
                    </div>

                    <div className="mt-3 flex items-center justify-between text-xs font-bold">
                      <span className="text-slate-500">Cupos:</span>
                      <span className={`px-2 py-0.5 rounded-md text-[11px] ${
                        isFull
                          ? 'bg-rose-100 text-rose-800'
                          : slot.cupo_reservado > 0
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-slate-100 text-slate-800'
                      }`}>
                        {slot.cupo_reservado} / {slot.cupo_maximo} reservados
                      </span>
                    </div>

                    <div className="mt-2 text-[10px] font-semibold text-slate-400">
                      Modalidad: <span className="text-slate-700 font-bold">{slot.modalidad_permitida}</span>
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                    <span className="text-[10px] text-slate-400 truncate">{slot.notas || 'Sin observaciones'}</span>
                    {slot.cupo_reservado === 0 && (
                      <button
                        onClick={() => handleDeleteSlot(slot)}
                        className="text-slate-400 hover:text-rose-600 transition-colors p-1"
                        title="Eliminar este turno"
                      >
                        <span className="material-symbols-outlined text-sm">delete</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* MODAL 1: Detalle y Gestión de la Solicitud */}
      {isDetailModalOpen && selectedSolicitud && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-slate-200">
            {/* Cabecera */}
            <div className="sticky top-0 bg-white px-6 py-4 border-b border-slate-100 flex items-center justify-between z-10">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-black text-slate-900 uppercase">
                    Detalle de Solicitud de Charla
                  </h2>
                  {renderStatusBadge(selectedSolicitud.estado)}
                </div>
                <p className="text-xs text-slate-400 font-mono mt-0.5">
                  Cód. Seguimiento: <span className="font-bold text-violet-700">{selectedSolicitud.codigo_seguimiento}</span>
                </p>
              </div>
              <button
                onClick={() => setIsDetailModalOpen(false)}
                className="p-1.5 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors"
              >
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>

            {/* Cuerpo del Modal */}
            <div className="p-6 space-y-6 text-xs">
              {/* Sección Institución Educativa */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/80 space-y-3">
                <div className="flex items-center gap-1.5 text-primary font-black uppercase text-[11px]">
                  <span className="material-symbols-outlined text-base">school</span>
                  Institución Educativa
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold uppercase">Nombre Colegio:</span>
                    <p className="font-black text-slate-900">{selectedSolicitud.nombre_ie}</p>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold uppercase">Código Modular:</span>
                    <p className="font-mono font-bold text-slate-800">{selectedSolicitud.codigo_modular}</p>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold uppercase">Ubicación Geográfica:</span>
                    <p className="font-bold text-slate-800">{selectedSolicitud.distrito}, {selectedSolicitud.provincia} ({selectedSolicitud.departamento})</p>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold uppercase">Gestión / Dirección:</span>
                    <p className="font-bold text-slate-800">{selectedSolicitud.tipo_gestion} {selectedSolicitud.direccion_ie ? `• ${selectedSolicitud.direccion_ie}` : ''}</p>
                  </div>
                </div>
              </div>

              {/* Sección Contacto y Autoridades */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/80 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-primary font-black uppercase text-[11px]">
                    <span className="material-symbols-outlined text-base">person</span>
                    Director(a) y Contacto
                  </div>
                  {selectedSolicitud.director_telefono && (
                    <button
                      onClick={() => openWhatsApp(selectedSolicitud.director_telefono, selectedSolicitud.director_nombre, 'general')}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-black text-[10px] transition-colors"
                    >
                      <span>WhatsApp Director</span>
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold uppercase">Nombre Director(a):</span>
                    <p className="font-black text-slate-900">{selectedSolicitud.director_nombre} (DNI: {selectedSolicitud.director_dni})</p>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold uppercase">Teléfono / Celular:</span>
                    <p className="font-bold text-slate-800">{selectedSolicitud.director_telefono || 'No registrado'}</p>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold uppercase">Correo Electrónico:</span>
                    <p className="font-bold text-slate-800">{selectedSolicitud.director_email || 'No registrado'}</p>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold uppercase">Coordinador(a) / Tutor:</span>
                    <p className="font-bold text-slate-800">{selectedSolicitud.coordinador_nombre || 'No asignado'} {selectedSolicitud.coordinador_telefono ? `(${selectedSolicitud.coordinador_telefono})` : ''}</p>
                  </div>
                </div>
              </div>

              {/* Sección Detalles de la Charla */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/80 space-y-3">
                <div className="flex items-center gap-1.5 text-primary font-black uppercase text-[11px]">
                  <span className="material-symbols-outlined text-base">co_present</span>
                  Detalles de la Charla y Asistencia Estimada
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold uppercase">Modalidad:</span>
                    <p className="font-black text-slate-900">{selectedSolicitud.modalidad}</p>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold uppercase">Alumnos 4to:</span>
                    <p className="font-bold text-slate-800">{selectedSolicitud.alumnos_4to} estudiantes</p>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 font-bold uppercase">Alumnos 5to:</span>
                    <p className="font-bold text-slate-800">{selectedSolicitud.alumnos_5to} estudiantes</p>
                  </div>
                  <div className="col-span-3">
                    <span className="text-[10px] text-slate-400 font-bold uppercase">Total Estimado de Impacto:</span>
                    <p className="font-black text-violet-700 text-sm">
                      {(Number(selectedSolicitud.alumnos_4to) || 0) + (Number(selectedSolicitud.alumnos_5to) || 0)} escolares
                    </p>
                  </div>
                </div>
              </div>

              {/* Asignación de Fecha, Horario y Ponente */}
              <div className="p-4 rounded-2xl border border-violet-200 bg-violet-50/30 space-y-3">
                <div className="flex items-center gap-1.5 text-violet-900 font-black uppercase text-[11px]">
                  <span className="material-symbols-outlined text-base">event_note</span>
                  Programación y Ponente UNSAAC
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
                      Fecha de la Charla:
                    </label>
                    <input
                      type="date"
                      value={selectedSolicitud.fecha_charla || ''}
                      onChange={e => setSelectedSolicitud({ ...selectedSolicitud, fecha_charla: e.target.value })}
                      className="w-full bg-white border border-slate-200 rounded-xl p-2 font-bold text-slate-800 text-xs"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
                      Hora / Horario:
                    </label>
                    <input
                      type="text"
                      placeholder="Ej: 09:30 AM"
                      value={selectedSolicitud.hora_charla || ''}
                      onChange={e => setSelectedSolicitud({ ...selectedSolicitud, hora_charla: e.target.value })}
                      className="w-full bg-white border border-slate-200 rounded-xl p-2 font-bold text-slate-800 text-xs"
                    />
                  </div>

                  <div className="col-span-2">
                    <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
                      Ponente Responsable de Admisión:
                    </label>
                    <select
                      value={selectedSolicitud.ponente_id || ''}
                      onChange={e => setSelectedSolicitud({ ...selectedSolicitud, ponente_id: e.target.value || null })}
                      className="w-full bg-white border border-slate-200 rounded-xl p-2 font-bold text-slate-800 text-xs"
                    >
                      <option value="">-- Seleccionar Ponente del Directorio --</option>
                      {personalList.map(p => (
                        <option key={p.id} value={p.id}>
                          {p.nombre} {p.cargo_actual ? `(${p.cargo_actual})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  {selectedSolicitud.modalidad === 'Virtual' && (
                    <div className="col-span-2">
                      <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
                        Enlace de Reunión (Google Meet / Zoom):
                      </label>
                      <input
                        type="url"
                        placeholder="https://meet.google.com/..."
                        value={selectedSolicitud.link_reunion || ''}
                        onChange={e => setSelectedSolicitud({ ...selectedSolicitud, link_reunion: e.target.value })}
                        className="w-full bg-white border border-slate-200 rounded-xl p-2 font-bold text-slate-800 text-xs"
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Botón Oficio PDF si existe */}
              {selectedSolicitud.oficio_pdf_url && (
                <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-100 border border-slate-200">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-rose-600 text-2xl">description</span>
                    <div>
                      <div className="font-black text-slate-900">Oficio Escaneado del Colegio</div>
                      <div className="text-[10px] text-slate-500">Documento formal de solicitud</div>
                    </div>
                  </div>
                  <button
                    onClick={() => setPdfPreviewUrl(selectedSolicitud.oficio_pdf_url!)}
                    className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs flex items-center gap-1"
                  >
                    <span className="material-symbols-outlined text-sm">visibility</span>
                    Ver Documento
                  </button>
                </div>
              )}

              {/* Observación anterior si existe */}
              {selectedSolicitud.motivo_observacion && (
                <div className="p-3 bg-amber-50 rounded-2xl border border-amber-200 text-amber-900 text-xs">
                  <div className="font-bold uppercase text-[10px] text-amber-700">Motivo de Observación Registrado:</div>
                  <p className="mt-1">{selectedSolicitud.motivo_observacion}</p>
                </div>
              )}
            </div>

            {/* Botones de Acción al Pie */}
            <div className="sticky bottom-0 bg-white px-6 py-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => openWhatsApp(selectedSolicitud.director_telefono, selectedSolicitud.director_nombre, 'general')}
                  className="px-3 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 font-bold text-slate-700 text-xs flex items-center gap-1.5"
                >
                  <span>💬 WhatsApp</span>
                </button>
              </div>

              <div className="flex items-center gap-2">
                {selectedSolicitud.estado === 'Pendiente' && (
                  <>
                    <button
                      onClick={() => {
                        setIsObservationModalOpen(true);
                        setObservationReason('');
                      }}
                      className="px-3 py-2 rounded-xl bg-orange-100 hover:bg-orange-200 text-orange-800 font-bold text-xs"
                    >
                      Observar
                    </button>
                    <button
                      onClick={() => handleUpdateStatus(selectedSolicitud, 'Aprobada para Reserva')}
                      className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-sm"
                    >
                      Aprobar Solicitud
                    </button>
                  </>
                )}

                {selectedSolicitud.estado === 'Aprobada para Reserva' && (
                  <button
                    onClick={() => {
                      if (!selectedSolicitud.fecha_charla) {
                        notify('Por favor especifique la fecha de la charla antes de confirmar', 'warning');
                        return;
                      }
                      handleUpdateStatus(selectedSolicitud, 'Cita Confirmada', {
                        fecha_charla: selectedSolicitud.fecha_charla,
                        hora_charla: selectedSolicitud.hora_charla,
                        ponente_id: selectedSolicitud.ponente_id,
                        link_reunion: selectedSolicitud.link_reunion
                      });
                    }}
                    className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs shadow-sm flex items-center gap-1.5"
                  >
                    <span className="material-symbols-outlined text-sm">calendar_month</span>
                    Confirmar Cita Oficial
                  </button>
                )}

                {selectedSolicitud.estado === 'Cita Confirmada' && (
                  <button
                    onClick={() => handleUpdateStatus(selectedSolicitud, 'Completada')}
                    className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs shadow-sm"
                  >
                    Marcar como Realizada
                  </button>
                )}

                <button
                  onClick={async () => {
                    // Guardar cambios sin alterar el estado
                    try {
                      await supabase.from('charlas_solicitudes').update({
                        fecha_charla: selectedSolicitud.fecha_charla,
                        hora_charla: selectedSolicitud.hora_charla,
                        ponente_id: selectedSolicitud.ponente_id,
                        link_reunion: selectedSolicitud.link_reunion,
                        updated_at: new Date().toISOString()
                      }).eq('id', selectedSolicitud.id);
                      notify('Datos de la charla guardados correctamente', 'success');
                      setIsDetailModalOpen(false);
                      fetchSolicitudes();
                    } catch (e: any) {
                      notify('Error guardando cambios: ' + e.message, 'error');
                    }
                  }}
                  className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs"
                >
                  Guardar Cambios
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: Visor de Oficio PDF */}
      {pdfPreviewUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-3xl w-full max-w-4xl h-[85vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-rose-600">picture_as_pdf</span>
                <span className="font-black text-slate-900 text-sm">Oficio Escaneado del Colegio</span>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={pdfPreviewUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="px-3 py-1 bg-white border border-slate-200 hover:bg-slate-100 rounded-lg text-xs font-bold text-slate-700 flex items-center gap-1"
                >
                  <span className="material-symbols-outlined text-xs">open_in_new</span>
                  Abrir en pestaña nueva
                </a>
                <button
                  onClick={() => setPdfPreviewUrl(null)}
                  className="p-1 rounded-full hover:bg-slate-200 text-slate-500"
                >
                  <span className="material-symbols-outlined text-base">close</span>
                </button>
              </div>
            </div>

            <div className="flex-1 bg-slate-100 p-2">
              <iframe
                src={pdfPreviewUrl}
                title="Oficio Escaneado"
                className="w-full h-full rounded-2xl border border-slate-300"
              />
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: Registrar Observación */}
      {isObservationModalOpen && selectedSolicitud && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center gap-2 text-orange-600 font-black">
              <span className="material-symbols-outlined text-2xl">warning</span>
              <h3 className="text-sm uppercase tracking-tight">Observar Solicitud</h3>
            </div>
            <p className="text-xs text-slate-500 font-semibold">
              Indique el motivo por el cual la solicitud no puede ser aprobada de momento (falta sello, firma de director, datos incompletos):
            </p>

            <textarea
              rows={4}
              value={observationReason}
              onChange={e => setObservationReason(e.target.value)}
              placeholder="Ej: El oficio no cuenta con firma ni sello del Director de la I.E..."
              className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:border-orange-500 focus:bg-white transition-all"
            />

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setIsObservationModalOpen(false)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 font-bold text-xs hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveObservation}
                className="px-4 py-2 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-bold text-xs shadow-sm"
              >
                Confirmar Observación
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: Agregar Turno Individual Manual */}
      {showAddSlotModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-black text-slate-900 text-sm uppercase">Nuevo Turno de Disponibilidad</h3>
              <button onClick={() => setShowAddSlotModal(false)} className="text-slate-400 hover:text-slate-600">
                <span className="material-symbols-outlined text-base">close</span>
              </button>
            </div>

            <form onSubmit={handleCreateSingleSlot} className="space-y-3 text-xs">
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Fecha:</label>
                <input
                  type="date"
                  required
                  value={newSlotData.fecha}
                  onChange={e => setNewSlotData({ ...newSlotData, fecha: e.target.value })}
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Turno:</label>
                  <select
                    value={newSlotData.turno}
                    onChange={e => setNewSlotData({ ...newSlotData, turno: e.target.value as any })}
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-xs"
                  >
                    <option value="Mañana">Mañana</option>
                    <option value="Tarde">Tarde</option>
                  </select>
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Cupo Máximo:</label>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={newSlotData.cupo_maximo}
                    onChange={e => setNewSlotData({ ...newSlotData, cupo_maximo: Number(e.target.value) })}
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Hora Inicio:</label>
                  <input
                    type="time"
                    required
                    value={newSlotData.hora_inicio}
                    onChange={e => setNewSlotData({ ...newSlotData, hora_inicio: e.target.value })}
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-xs"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Hora Fin:</label>
                  <input
                    type="time"
                    required
                    value={newSlotData.hora_fin}
                    onChange={e => setNewSlotData({ ...newSlotData, hora_fin: e.target.value })}
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Modalidad Permitida:</label>
                <select
                  value={newSlotData.modalidad_permitida}
                  onChange={e => setNewSlotData({ ...newSlotData, modalidad_permitida: e.target.value as any })}
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-xs"
                >
                  <option value="Ambas">Ambas (Presencial y Virtual)</option>
                  <option value="Presencial">Solo Presencial</option>
                  <option value="Virtual">Solo Virtual</option>
                </select>
              </div>

              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">Notas Internas:</label>
                <input
                  type="text"
                  placeholder="Ej: Solo colegios de provincias..."
                  value={newSlotData.notas}
                  onChange={e => setNewSlotData({ ...newSlotData, notas: e.target.value })}
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl font-semibold text-xs"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddSlotModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 font-bold text-xs"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-bold text-xs shadow-sm"
                >
                  Guardar Turno
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
