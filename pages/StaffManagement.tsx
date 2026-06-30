import React, { useState, useEffect, useRef, useMemo } from 'react';
import Papa from 'papaparse';
import { supabase } from '../lib/supabaseClient';
import { User, PersonalDirectorio, PersonalProceso, PersonalNecesidad, PersonalSorteo, CVModalidad, PersonalCargo } from '../types';
import { useReactToPrint } from 'react-to-print';
import { ScheduleBuilderModal } from '../components/ScheduleBuilderModal';

interface StaffManagementProps {
  user: User;
  notify: (msg: string, type?: 'success' | 'error' | 'warning' | 'info') => void;
}

const DEFAULT_CARGOS = [
  'VERIFICACIÓN DE DOCUMENTOS Y FOTOGRAFÍA',
  'RECEPCIÓN DE EXPEDIENTES DE INGRESANTES',
  'SERVICIO DE CARPETEROS',
  'SERVICIOS DIVERSOS(SOLO VARONES)',
  'SERVICIO DE SEGURIDAD(SOLO VARONES)',
  'SERVICIO DE LIMPIEZA DE PABELLONES Y SSHH',
  'CAMAROGRAFOS',
  'PERIFONISTA'
];

type TabConfig = 'directorio' | 'procesos' | 'sorteos';

export const StaffManagement: React.FC<StaffManagementProps> = ({ user, notify }) => {
  const [activeTab, setActiveTab] = useState<TabConfig>('directorio');
  const [loading, setLoading] = useState(false);

  // Directorio State
  const [directorio, setDirectorio] = useState<PersonalDirectorio[]>([]);
  const [dirSearch, setDirSearch] = useState('');
  const [dirPage, setDirPage] = useState(0);
  const [dirTotalItems, setDirTotalItems] = useState(0);
  const [dirSearchTrigger, setDirSearchTrigger] = useState(0); // To trigger fetch on search button/enter
  
  const [showAddDirModal, setShowAddDirModal] = useState(false);
  const [newDirPerson, setNewDirPerson] = useState({ dni: '', nombre: '', condicion: '', departamento_cargo: '', escuela_profesional: '', correo: '', telefono: '' });
  const dirFileInput = useRef<HTMLInputElement>(null);

  // Procesos State
  const [procesos, setProcesos] = useState<PersonalProceso[]>([]);
  const [modalidades, setModalidades] = useState<any[]>([]); // For selector
  const [selectedProceso, setSelectedProceso] = useState<PersonalProceso | null>(null);
  const [necesidades, setNecesidades] = useState<PersonalNecesidad[]>([]);
  
  // New Proceso Form
  const [showNewProceso, setShowNewProceso] = useState(false);
  const [newProcesoName, setNewProcesoName] = useState('');
  const [newProcesoModalidad, setNewProcesoModalidad] = useState('');
  const [newNecesidades, setNewNecesidades] = useState<{cargo: string, cantidad: number}[]>([]);

  // Cargos State
  const [dbCargos, setDbCargos] = useState<PersonalCargo[]>([]);

  // Sorteos State
  const [sorteos, setSorteos] = useState<PersonalSorteo[]>([]);
  const [selectedSorteoProceso, setSelectedSorteoProceso] = useState<string>('');
  const [isImportSorteosModalOpen, setIsImportSorteosModalOpen] = useState(false);
  const sortFileInput = useRef<HTMLInputElement>(null);

  // Schedule Builder State
  const [scheduleBuilderOpen, setScheduleBuilderOpen] = useState(false);
  const [scheduleBuilderCargo, setScheduleBuilderCargo] = useState('');
  const [scheduleBuilderProcesoName, setScheduleBuilderProcesoName] = useState('');
  const [scheduleBuilderUsers, setScheduleBuilderUsers] = useState<any[]>([]);

  // -> New states for Edit Necesidades and Sorteo Manual/Filters
  const [isEditingNecesidades, setIsEditingNecesidades] = useState(false);
  const [editNecesidadesRows, setEditNecesidadesRows] = useState<{id?: string, cargo: string, cantidad: number}[]>([]);

  const [showAddSorteo, setShowAddSorteo] = useState(false);
  const [newSorteo, setNewSorteo] = useState({ dni: '', nombres: '', cargo: '', condicion_sorteo: 'Titular', email_personal: '', telefono: '' });
  
  // Autocomplete states
  const [dirSearchResults, setDirSearchResults] = useState<PersonalDirectorio[]>([]);
  const [showDirSearch, setShowDirSearch] = useState(false);

  const [sorteoFilters, setSorteoFilters] = useState({ search: '', cargo: '', condicion: '', estado: '' });

  // Email Notification Modal State
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [emailTemplate, setEmailTemplate] = useState('');
  const [emailSubject, setEmailSubject] = useState('');
  const [emailFechaLimite, setEmailFechaLimite] = useState('');
  const [emailFechaExamen, setEmailFechaExamen] = useState('');
  const [emailProgress, setEmailProgress] = useState<{ current: number, total: number, message: string } | null>(null);

  // Reject Modal State
  const [showRejectModal, setShowRejectModal] = useState<{ isOpen: boolean; sorteoId: string | null }>({ isOpen: false, sorteoId: null });
  const [rejectReason, setRejectReason] = useState('');
  const [isFullScreen, setIsFullScreen] = useState(false);

  // Print Ref
  const printSorteosRef = useRef<HTMLDivElement>(null);
  const handlePrintSorteos = useReactToPrint({
      contentRef: printSorteosRef,
      documentTitle: 'Reporte_Personal_Sorteado',
  });

  useEffect(() => {
    fetchDbCargos();
    if (activeTab === 'directorio') {
      fetchDirectorio();
    } else if (activeTab === 'procesos') {
      fetchProcesos();
      fetchModalidades();
    } else if (activeTab === 'sorteos') {
      fetchProcesos();
    }
  }, [activeTab, dirPage, dirSearchTrigger]);

  useEffect(() => {
      if (activeTab === 'sorteos' && selectedSorteoProceso) {
          fetchSorteos(selectedSorteoProceso);
          fetchNecesidades(selectedSorteoProceso);

          const channel = supabase.channel('sorteos-changes')
              .on('postgres_changes', 
                  { event: '*', schema: 'public', table: 'personal_sorteos', filter: `proceso_id=eq.${selectedSorteoProceso}` }, 
                  (payload) => {
                      console.log('Realtime update received:', payload);
                      fetchSorteos(selectedSorteoProceso, true); // silent fetch on change
                  }
              )
              .subscribe();

          return () => {
              supabase.removeChannel(channel);
          };
      }
  }, [selectedSorteoProceso, activeTab]);

  const fetchDirectorio = async () => {
    setLoading(true);
    const from = dirPage * 100;
    const to = from + 99;
    
    let query = supabase.from('personal_directorio').select('*', { count: 'exact' });
    
    if (dirSearch.trim()) {
        const term = `%${dirSearch.trim().toUpperCase()}%`;
        query = query.or(`nombre.ilike.${term},dni.ilike.${term}`);
    }
    
    const { data, error, count } = await query.order('nombre', { ascending: true }).range(from, to);
    
    if (!error && data) {
        setDirectorio(data);
        if (count !== null) setDirTotalItems(count);
    }
    setLoading(false);
  };

  const handleSearchDirectorio = () => {
    setDirPage(0);
    setDirSearchTrigger(prev => prev + 1);
  };

  const handleSaveAddDirPerson = async () => {
    if (!newDirPerson.dni || !newDirPerson.nombre) {
        notify('Debe ingresar al menos DNI y Apellidos Nombres', 'warning'); return;
    }
    setLoading(true);
    try {
        const { error } = await supabase.from('personal_directorio').insert([{
            dni: newDirPerson.dni,
            nombre: newDirPerson.nombre.toUpperCase(),
            condicion: newDirPerson.condicion,
            departamento_cargo: newDirPerson.departamento_cargo,
            escuela_profesional: newDirPerson.escuela_profesional,
            correo: newDirPerson.correo,
            telefono: newDirPerson.telefono
        }]);
        if (error) throw error;
        
        notify('Personal añadido al directorio exitosamente.', 'success');
        setShowAddDirModal(false);
        setNewDirPerson({ dni: '', nombre: '', condicion: '', departamento_cargo: '', escuela_profesional: '', correo: '', telefono: '' });
        fetchDirectorio();
    } catch(err: any) {
        notify(err.message, 'error');
    } finally {
        setLoading(false);
    }
  };

  const fetchDbCargos = async () => {
    const { data, error } = await supabase.from('personal_cargos').select('*').order('nombre');
    if (!error && data) setDbCargos(data);
  };

  const fetchProcesos = async () => {
    setLoading(true);
    const { data, error } = await supabase.from('personal_procesos').select('*, cv_modalidades(nombre)').order('created_at', { ascending: false });
    
    if (error) {
        console.error("Error al obtener procesos:", error);
        notify("Error al cargar procesos. Revisa si falta la llave foránea en Supabase.", "error");
    }

    if (!error && data) {
         // Supabase returns relations using the table name if not explicitly aliased in some cases, or aliased.
         // Let's format it to match what the UI expects.
         const formattedData = data.map(d => ({
             ...d,
             modalidad: Array.isArray(d.cv_modalidades) ? d.cv_modalidades[0] : d.cv_modalidades
         }));
         setProcesos(formattedData as any[]);
    }
    setLoading(false);
  };

  const fetchModalidades = async () => {
    const { data, error } = await supabase.from('cv_modalidades').select('id, nombre, cv_cuadros_anuales!inner(anio, estado)').eq('cv_cuadros_anuales.estado', 'Aprobado');
    // Fetch currently active (or recent) modalities via query join
    if (!error && data) {
        setModalidades(data);
    }
  };

  const fetchNecesidades = async (procesoId: string) => {
    setLoading(true);
    const { data, error } = await supabase.from('personal_necesidades').select('*').eq('proceso_id', procesoId);
    if (!error && data) setNecesidades(data);
    setLoading(false);
  }

  const fetchSorteos = async (procesoId: string, silent = false) => {
      if (!silent) setLoading(true);
      const { data, error } = await supabase.from('personal_sorteos').select('*').eq('proceso_id', procesoId);
      if (!error && data) setSorteos(data);
      if (!silent) setLoading(false);
  }

  // == Directorio Functions ==
  const handleDirectorioUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        try {
          const validRecords = results.data.map((row: any) => ({
            cod_trab: row['COD. TRAB.'] || row['COD. TRAB'] || row['cod_trab'] || '',
            dni: row['DNI'] || row['dni'] || '',
            nombre: row['NOMBRE'] || row['NOMBRES'] || row['nombre'] || '',
            condicion: row['CONDICION'] || row['condicion'] || '',
            categoria_regimen: row['CATEGORIA REGIMEN / GRUPO NIVEL'] || row['CATEGORIA'] || '',
            facultad_dependencia: row['FACULTAD / DEPENDENCIA'] || row['FACULTAD'] || '',
            departamento_cargo: row['DEPARTAMENTO / CARGO'] || row['DEPARTAMENTO'] || '',
            escuela_profesional: row['ESCUELA PROFESIONAL'] || row['ESCUELA'] || ''
          })).filter(r => r.dni && r.nombre);

          if (validRecords.length === 0) {
              notify('No se encontraron registros válidos (debe tener DNI y NOMBRE)', 'error');
              setLoading(false);
              return;
          }

          // Insert or upsert
          // Note: using insert. A robust mechanism might upsert by DNI if constraint exists,
          // but for now we just insert or update via direct JS check.
          // Simplest is to just insert. I will use standard insert.
          const { error } = await supabase.from('personal_directorio').insert(validRecords);
          if (error) {
              throw error;
          }
          notify(`Importados ${validRecords.length} registros exitosamente.`);
          fetchDirectorio();
        } catch (err: any) {
             notify(err.message || 'Error en importación', 'error');
        } finally {
            setLoading(false);
            if (dirFileInput.current) dirFileInput.current.value = '';
        }
      }
    });
  };

  // == Procesos Functions ==
  const handleEditNecesidades = () => {
      setEditNecesidadesRows(necesidades.map(n => ({ id: n.id, cargo: n.cargo, cantidad: n.cantidad_requerida })));
      setIsEditingNecesidades(true);
  }

  const handleSaveEditedNecesidades = async () => {
      if (!selectedProceso) return;
      setLoading(true);
      try {
          const { error: delError } = await supabase.from('personal_necesidades').delete().eq('proceso_id', selectedProceso.id);
          if (delError) throw delError;

          const necToInsert = editNecesidadesRows.filter(n => n.cantidad > 0).map(n => ({
              proceso_id: selectedProceso.id,
              cargo: n.cargo,
              cantidad_requerida: n.cantidad
          }));

          if (necToInsert.length > 0) {
              const { error: insError } = await supabase.from('personal_necesidades').insert(necToInsert);
              if (insError) throw insError;
          }

          notify('Cuadro de necesidades actualizado', 'success');
          setIsEditingNecesidades(false);
          fetchNecesidades(selectedProceso.id);
      } catch(err:any) {
          notify(err.message, 'error');
      } finally {
          setLoading(false);
      }
  }

  const handleAddNecesidadRow = () => {
      setNewNecesidades([...newNecesidades, { cargo: dbCargos.length > 0 ? dbCargos[0].nombre : '', cantidad: 0 }]);
  }

  const handleUpdateNecesidad = (idx: number, field: string, value: any) => {
      const updated = [...newNecesidades];
      updated[idx] = { ...updated[idx], [field]: value };
      setNewNecesidades(updated);
  }

  const handleDeleteNecesidad = (idx: number) => {
      const updated = newNecesidades.filter((_, i) => i !== idx);
      setNewNecesidades(updated);
  }

  const handleSaveProceso = async () => {
      if (!newProcesoName || !newProcesoModalidad) {
          notify('Por favor, ingresa el nombre y selecciona la modalidad.', 'warning');
          return;
      }
      setLoading(true);
      try {
          const { data: proceso, error: procError } = await supabase.from('personal_procesos').insert([{
              nombre: newProcesoName,
              modalidad_id: newProcesoModalidad,
              estado: 'Borrador'
          }]).select().single();

          if (procError) throw procError;

          if (newNecesidades.length > 0) {
              const necToInsert = newNecesidades.filter(n => n.cantidad > 0).map(n => ({
                  proceso_id: proceso.id,
                  cargo: n.cargo,
                  cantidad_requerida: n.cantidad
              }));
              if (necToInsert.length > 0) {
                  const { error: necError } = await supabase.from('personal_necesidades').insert(necToInsert);
                  if (necError) throw necError;
              }
          }
          
          notify('Proceso y necesidades guardados.', 'success');
          setShowNewProceso(false);
          setNewProcesoName('');
          setNewProcesoModalidad('');
          setNewNecesidades([]);
          fetchProcesos();
      } catch (err: any) {
          notify(err.message, 'error');
      } finally {
          setLoading(false);
      }
  }

  const showProcesoDetails = (proceso: PersonalProceso) => {
      setSelectedProceso(proceso);
      setIsEditingNecesidades(false);
      fetchNecesidades(proceso.id);
  }

  // == Sorteos Functions ==
  const handleSorteoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedSorteoProceso) return;
    setLoading(true);
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        try {
          const validRecords = results.data.map((row: any) => ({
            proceso_id: selectedSorteoProceso,
            cargo: row['cargo'] || row['CARGO'] || '',
            dni: row['dni'] || row['DNI'] || '',
            nombres: row['nombres'] || row['NOMBRES'] || '',
            condicion_sorteo: row['sorteado'] || row['SORTEADO'] || 'Suplente',
            email_personal: row['emailpersonal'] || row['EMAILPERSONAL'] || row['email'] || '',
            telefono: row['telefono'] || row['TELEFONO'] || '',
            estado_confirmacion: 'Pendiente'
          })).filter(r => r.dni && r.nombres);

          if (validRecords.length === 0) {
              notify('No se encontraron registros válidos.', 'error');
              setLoading(false);
              return;
          }

          // In a real app we'd map to directorio here, but currently it's optional
          const { error } = await supabase.from('personal_sorteos').insert(validRecords);
          if (error) throw error;
          
          // Sincronizar directorio
          const recordsToSync = validRecords.filter(r => r.email_personal || r.telefono);
          if (recordsToSync.length > 0) {
              const syncPromises = recordsToSync.map(r => {
                  const updateData: any = {};
                  if (r.email_personal) updateData.correo = r.email_personal;
                  if (r.telefono) updateData.telefono = r.telefono;
                  return supabase.from('personal_directorio').update(updateData).eq('dni', r.dni);
              });
              await Promise.allSettled(syncPromises); // Run in parallel, ignore errors to not break main flow
          }

          notify(`Importados ${validRecords.length} sorteados exitosamente.`);
          fetchSorteos(selectedSorteoProceso);
        } catch (err: any) {
             notify(err.message, 'error');
        } finally {
            setLoading(false);
            if (sortFileInput.current) sortFileInput.current.value = '';
        }
      }
    });
  };

  const handleDownloadSorteosTemplate = () => {
    const templateData = [
      {
        CARGO: 'DOCENTE DE AULA',
        DNI: '12345678',
        NOMBRES: 'JUAN PEREZ',
        SORTEADO: 'Titular',
        EMAILPERSONAL: 'juan@example.com',
        TELEFONO: '987654321'
      }
    ];
    const csv = Papa.unparse(templateData, { delimiter: ';' });
    const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csv], { type: 'text/csv;charset=utf-8;' }); // Add BOM
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'Plantilla_Sorteos.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

// Removed old notifyAllSorteados

  const confirmParticipant = async (sorteoId: string, newState: 'Confirmado' | 'Rechazado' | 'Pendiente', motivo?: string) => {
      try {
          if (newState === 'Rechazado' && motivo === undefined) {
              setRejectReason('');
              setShowRejectModal({ isOpen: true, sorteoId });
              return;
          }
          
          const updateData: any = { estado_confirmacion: newState };
          if (newState === 'Rechazado') {
              updateData.motivo_rechazo = motivo || null;
          }

          // Optimistic update
          setSorteos(prev => prev.map(s => s.id === sorteoId ? { ...s, ...updateData } : s));

          if (newState === 'Rechazado') {
              setShowRejectModal({ isOpen: false, sorteoId: null });
              notify('Participación rechazada exitosamente', 'success');
          } else {
             notify(`Estado cambiado a ${newState}`, 'success');
          }

          const { error } = await supabase.from('personal_sorteos').update(updateData).eq('id', sorteoId);
          if (error) throw error;
          
          fetchSorteos(selectedSorteoProceso, true); // silent reload in background
      } catch(err: any) {
          notify(err.message, 'error');
          if (selectedSorteoProceso) fetchSorteos(selectedSorteoProceso); // rollback
      }
  }

  const handleSaveNewSorteo = async () => {
      if(!selectedSorteoProceso || !newSorteo.dni || !newSorteo.nombres || !newSorteo.cargo) {
          notify('Por favor completa DNI, Nombres y Cargo', 'warning'); return;
      }
      setLoading(true);
      try {
          const { error } = await supabase.from('personal_sorteos').insert([{
              proceso_id: selectedSorteoProceso,
              dni: newSorteo.dni,
              nombres: newSorteo.nombres.toUpperCase(),
              cargo: newSorteo.cargo.toUpperCase(),
              condicion_sorteo: newSorteo.condicion_sorteo,
              email_personal: newSorteo.email_personal,
              telefono: newSorteo.telefono,
              estado_confirmacion: 'Pendiente'
          }]);
          if (error) throw error;
          
          // Sincronizar correo y teléfono en la tabla directorio si existen
          if (newSorteo.email_personal || newSorteo.telefono) {
              const updateData: any = {};
              if (newSorteo.email_personal) updateData.correo = newSorteo.email_personal;
              if (newSorteo.telefono) updateData.telefono = newSorteo.telefono;
              
              await supabase.from('personal_directorio').update(updateData).eq('dni', newSorteo.dni);
          }

          notify('Personal añadido manualmente', 'success');
          setShowAddSorteo(false);
          setNewSorteo({ dni: '', nombres: '', cargo: '', condicion_sorteo: 'Titular', email_personal: '', telefono: '' });
          fetchSorteos(selectedSorteoProceso);
      } catch(err:any) {
           notify(err.message, 'error');
      } finally {
          setLoading(false);
      }
  }

  // == Autocomplete logic ==
  const searchDirectorioAutocomplete = async (term: string) => {
      setNewSorteo(prev => ({...prev, nombres: term}));
      if (term.length < 3) {
          setDirSearchResults([]);
          setShowDirSearch(false);
          return;
      }
      const { data } = await supabase.from('personal_directorio')
          .select('*')
          .ilike('nombre', `%${term}%`)
          .limit(6);
          
      if (data) {
          setDirSearchResults(data);
          setShowDirSearch(data.length > 0);
      }
  };

  const handleSelectPersonForSorteo = async (person: PersonalDirectorio) => {
      let email = newSorteo.email_personal;
      let telefono = newSorteo.telefono;
      
      const { data } = await supabase.from('personal_sorteos')
          .select('email_personal, telefono')
          .eq('dni', person.dni)
          .not('email_personal', 'is', null)
          .order('created_at', { ascending: false })
          .limit(1);

      if (data && data.length > 0) {
          if (data[0].email_personal) email = data[0].email_personal;
          if (data[0].telefono) telefono = data[0].telefono;
      }

      setNewSorteo({
          ...newSorteo,
          dni: person.dni,
          nombres: person.nombre,
          email_personal: email,
          telefono: telefono
      });
      setShowDirSearch(false);
  };

  // == Filtros Memorizados y Ordenamiento ==
  const filteredSorteos = useMemo(() => {
        let result = sorteos.filter(s => {
            const searchVal = sorteoFilters.search.toLowerCase();
            const matchSearch = searchVal === '' || s.dni.includes(searchVal) || s.nombres.toLowerCase().includes(searchVal);
            const matchCargo = sorteoFilters.cargo === '' || s.cargo === sorteoFilters.cargo;
            const matchCondicion = sorteoFilters.condicion === '' || s.condicion_sorteo === sorteoFilters.condicion;
            
            let matchEstado = true;
            const isExpired = s.fecha_limite_confirmacion && new Date(s.fecha_limite_confirmacion).getTime() < new Date().getTime();
            
            if (sorteoFilters.estado === 'Expirado') {
                matchEstado = s.estado_confirmacion === 'Pendiente' && isExpired;
            } else if (sorteoFilters.estado === 'Pendiente') {
                matchEstado = s.estado_confirmacion === 'Pendiente' && !isExpired;
            } else if (sorteoFilters.estado !== '') {
                matchEstado = s.estado_confirmacion === sorteoFilters.estado;
            }

            return matchSearch && matchCargo && matchCondicion && matchEstado;
        });
      
      // Order by Cargo first, then Condicion (Titular first), then Name
      result.sort((a, b) => {
          const cargoCompare = (a.cargo || '').localeCompare(b.cargo || '');
          if (cargoCompare !== 0) return cargoCompare;
          
          const condA = (a.condicion_sorteo || '').toUpperCase();
          const condB = (b.condicion_sorteo || '').toUpperCase();
          if (condA === 'TITULAR' && condB !== 'TITULAR') return -1;
          if (condA !== 'TITULAR' && condB === 'TITULAR') return 1;

          return (a.nombres || '').localeCompare(b.nombres || '');
      });
      return result;
  }, [sorteos, sorteoFilters]);

  // == Dashboard Summary ==
  const sorteoDashboardStats = useMemo(() => {
      if (!selectedSorteoProceso) return [];
      return necesidades.map(nec => {
          const matchingSorteos = sorteos.filter(s => s.cargo === nec.cargo);
          const confirmados = matchingSorteos.filter(s => s.estado_confirmacion === 'Confirmado').length;
          
          const pendientes = matchingSorteos.filter(s => 
              s.estado_confirmacion === 'Pendiente' && 
              s.notificado && 
              (!s.fecha_limite_confirmacion || new Date(s.fecha_limite_confirmacion).getTime() >= new Date().getTime())
          ).length;

          return {
              cargo: nec.cargo,
              requerida: nec.cantidad_requerida,
              confirmados,
              pendientes
          };
      }).sort((a, b) => a.cargo.localeCompare(b.cargo));
  }, [necesidades, sorteos, selectedSorteoProceso]);

  const handleOpenEmailModal = () => {
    const pendientes = filteredSorteos.filter(s => s.estado_confirmacion === 'Pendiente' && s.email_personal && !s.notificado);
    if (pendientes.length === 0) {
        notify('No hay personal en la lista actual que falte notificar (pendientes con correo).', 'info');
        return;
    }
    const proc = procesos.find(p => p.id === selectedSorteoProceso);
    const procNombre = proc?.nombre || 'proceso de admisión';
    
    setEmailSubject(`Convocatoria ${procNombre}`);
    setEmailFechaLimite('');
    setEmailFechaExamen('');
    setEmailTemplate(`Estimado/a **{nombre}**,

Reciba un cordial saludo.

Por medio del presente, le informamos que, según el sorteo realizado para la designación de personal administrativo que participará en el **${procNombre}**, usted ha sido seleccionado/a para desempeñarse en el rubro **{cargo}**.

El examen se llevará a cabo el día **{fecha_examen}**.

Para confirmar su participación, le solicitamos hacer clic en el siguiente enlace hasta el **{fecha_limite}**:

{enlace_confirmacion}

En caso de presentar algún impedimento que le imposibilite participar, le agradeceremos comunicarlo a la brevedad posible ingresando al mismo enlace, a fin de realizar las coordinaciones correspondientes.

Agradecemos de antemano su compromiso y colaboración con el proceso de admisión.

Atentamente,
Dirección de Admisión
UNSAAC`);
    setShowEmailModal(true);
  };

  const sendEmailNotifications = async () => {
    if (!emailFechaLimite || !emailFechaExamen) {
        notify('Por favor completa la Fecha del Examen y la Fecha Límite', 'warning');
        return;
    }

    const pendientes = filteredSorteos.filter(s => s.estado_confirmacion === 'Pendiente' && s.email_personal && !s.notificado); // Solo no notificados
    
    setShowEmailModal(false);
    setLoading(true);
    let successCount = 0;
    
    setEmailProgress({ current: 0, total: pendientes.length, message: `Iniciando envío a ${pendientes.length} personas...` });

    try {
        for (let i = 0; i < pendientes.length; i++) {
            const persona = pendientes[i];
            
            setEmailProgress({ 
                current: i + 1, 
                total: pendientes.length, 
                message: `Enviando correo a ${persona.nombres} (${i + 1}/${pendientes.length})...` 
            });

            const confirmLinkBase = `${window.location.origin}/#/staff-confirm?id=${persona.id}`;
            const formattedLimite = emailFechaLimite 
                ? new Date(emailFechaLimite).toLocaleString('es-PE', { dateStyle: 'long', timeStyle: 'short' })
                : '';

            const body = emailTemplate
                .replace(/\*\*(.*?)\*\*/g, '$1')
                .replace(/{nombre}/g, persona.nombres)
                .replace(/{cargo}/g, persona.cargo)
                .replace(/{fecha_examen}/g, emailFechaExamen)
                .replace(/{fecha_limite}/g, formattedLimite)
                .replace(/{enlace_confirmacion}/g, `Confirmar: ${confirmLinkBase}&action=confirm\nRechazar: ${confirmLinkBase}&action=decline`);
                
            const buttonsHtml = `
              <div style="text-align: center; margin: 30px 0; font-family: sans-serif;">
                <p style="margin-bottom: 20px; font-weight: bold; color: #1e1e24;">Por favor, indíquenos su disponibilidad:</p>
                <div style="display: flex; justify-content: center; gap: 16px;">
                  <a href="${confirmLinkBase}&action=confirm" style="display:inline-block;padding:12px 24px;background-color:#10b981;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:bold;font-size:14px;min-width:120px;">SÍ, CONFIRMO</a>
                  <a href="${confirmLinkBase}&action=decline" style="display:inline-block;padding:12px 24px;background-color:#ef4444;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:bold;font-size:14px;min-width:120px;">NO PODRÉ</a>
                </div>
              </div>
            `;

            const htmlBody = emailTemplate
                .replace(/\n/g, '<br/>')
                .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                .replace(/{nombre}/g, persona.nombres)
                .replace(/{cargo}/g, persona.cargo)
                .replace(/{fecha_examen}/g, emailFechaExamen)
                .replace(/{fecha_limite}/g, formattedLimite)
                .replace(/{enlace_confirmacion}/g, buttonsHtml);
            
            const res = await fetch('/api/send-email', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    to: persona.email_personal,
                    subject: emailSubject,
                    text: body,
                    html: htmlBody
                })
            });

            if (res.ok) {
                // Update the DB
                const { error } = await supabase
                    .from('personal_sorteos')
                    .update({ 
                        notificado: true,
                        fecha_limite_confirmacion: emailFechaLimite ? new Date(emailFechaLimite).toISOString() : null
                    })
                    .eq('id', persona.id);
                
                if (!error) {
                    successCount++;
                    // Update local state incrementally
                    setSorteos(prev => prev.map(s => s.id === persona.id ? { ...s, notificado: true } : s));
                }
            }
        }

        if (successCount > 0) {
            if (successCount === pendientes.length) {
                notify(`¡Se notificó a las ${successCount} personas exitosamente!`, 'success');
            } else {
                notify(`Se notificó a ${successCount} de ${pendientes.length} personas.`, 'warning');
            }
        } else {
            notify('Hubo un error al enviar las notificaciones. Verifica tu configuración de correo.', 'error');
        }
    } catch (e: any) {
        console.error(e);
        notify('Error al enviar notificaciones: ' + e.message, 'error');
    } finally {
        setLoading(false);
        setEmailProgress(null);
    }
  };

  const getCargoColorStyle = (cargo: string) => {
      if (!cargo) return 'hover:bg-slate-50';
      const colors = [
          'border-l-blue-500 bg-blue-100 hover:bg-blue-200',
          'border-l-emerald-500 bg-emerald-100 hover:bg-emerald-200',
          'border-l-amber-500 bg-amber-100 hover:bg-amber-200',
          'border-l-purple-500 bg-purple-100 hover:bg-purple-200',
          'border-l-rose-500 bg-rose-100 hover:bg-rose-200',
          'border-l-teal-500 bg-teal-100 hover:bg-teal-200',
          'border-l-indigo-500 bg-indigo-100 hover:bg-indigo-200',
          'border-l-orange-500 bg-orange-100 hover:bg-orange-200'
      ];
      let hash = 0;
      for (let i = 0; i < cargo.length; i++) {
          hash = cargo.charCodeAt(i) + ((hash << 5) - hash);
      }
      return 'border-l-4 ' + colors[Math.abs(hash) % colors.length];
  };

  // Extraer valores únicos para dropdowns
  const uniqueCargosSorteos = useMemo(() => Array.from(new Set(sorteos.map(s => s.cargo))).filter(Boolean), [sorteos]);
  const uniqueCondicionesSorteos = useMemo(() => Array.from(new Set(sorteos.map(s => s.condicion_sorteo))).filter(Boolean), [sorteos]);
  const uniqueEstadosSorteos = ['Pendiente', 'Confirmado', 'Rechazado', 'Expirado'];


  return (
    <div className="p-6 max-w-7xl mx-auto flex flex-col gap-6 h-full overflow-y-auto">
      <div className="flex flex-col gap-2">
         <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <span className="material-symbols-outlined text-primary">badge</span>
            Gestión de Personal y Procesos
         </h1>
         <p className="text-slate-500 text-sm">Directorio, cuadros de necesidades y confirmación de personal para admisiones.</p>
      </div>

      <div className="flex bg-slate-100 p-1.5 justify-start rounded-2xl w-fit">
        <button 
          onClick={() => { setActiveTab('directorio'); setSelectedProceso(null); }}
          className={`px-4 py-2 text-xs font-black uppercase tracking-widest rounded-xl transition-all ${activeTab === 'directorio' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
        >
          Directorio
        </button>
        <button 
          onClick={() => { setActiveTab('procesos'); }}
          className={`px-4 py-2 text-xs font-black uppercase tracking-widest rounded-xl transition-all ${activeTab === 'procesos' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
        >
          Procesos y Necesidades
        </button>
        <button 
          onClick={() => { setActiveTab('sorteos'); setSelectedProceso(null); }}
          className={`px-4 py-2 text-xs font-black uppercase tracking-widest rounded-xl transition-all ${activeTab === 'sorteos' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
        >
          Sorteos y Confirmación
        </button>
      </div>

      {loading && <div className="text-slate-500 text-xs text-center py-4">Cargando...</div>}

      {/* DIRECTORIO TAB */}
      {!loading && activeTab === 'directorio' && (
          <div className="flex flex-col gap-6">
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col xl:flex-row xl:items-start justify-between gap-4">
                  <div className="flex-1">
                      <h3 className="text-sm font-bold text-slate-900 mb-4">Gestión del Directorio</h3>
                      
                      <div className="flex flex-col sm:flex-row gap-3">
                        <div className="relative flex-1 max-w-sm">
                            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[18px]">search</span>
                            <input 
                                type="text" 
                                placeholder="Buscar por DNI o Apellidos..." 
                                value={dirSearch}
                                onChange={e => setDirSearch(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && handleSearchDirectorio()}
                                className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-xl text-xs font-medium focus:ring-1 focus:ring-primary outline-none bg-slate-50"
                            />
                        </div>
                        <button onClick={handleSearchDirectorio} className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-sm">
                            Buscar
                        </button>
                      </div>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-3">
                      <div>
                          <p className="text-xs text-slate-500 mb-2 font-medium">CSVs válidos: COD. TRAB., DNI, NOMBRE...</p>
                          <input type="file" accept=".csv" ref={dirFileInput} onChange={handleDirectorioUpload} className="hidden" id="dir-csv-upload" />
                          <label htmlFor="dir-csv-upload" className="bg-slate-900 hover:bg-black text-white px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-2 shadow-sm w-full sm:w-auto">
                             <span className="material-symbols-outlined text-[18px]">upload</span>
                             Importar CSV
                          </label>
                      </div>
                      
                      <div className="flex items-end">
                         <button onClick={() => setShowAddDirModal(true)} className="bg-primary hover:bg-primary/90 text-white px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-sm w-full sm:w-auto">
                             <span className="material-symbols-outlined text-[18px]">person_add</span>
                             Agregar
                         </button>
                      </div>
                  </div>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                     <h3 className="font-bold text-slate-900">Directorio Actual (Muestra)</h3>
                     <span className="text-xs font-black bg-slate-100 text-slate-600 px-2 py-1 rounded-md">{directorio.length} registros</span>
                  </div>
                  <div className="overflow-x-auto max-h-[500px]">
                      <table className="w-full text-left border-collapse">
                          <thead className="bg-slate-50 uppercase text-[10px] font-black text-slate-500 tracking-wider sticky top-0">
                              <tr>
                                  <th className="p-4 border-b border-slate-200">DNI</th>
                                  <th className="p-4 border-b border-slate-200">Nombres</th>
                                  <th className="p-4 border-b border-slate-200">Condición</th>
                                  <th className="p-4 border-b border-slate-200">Cargo / Dept</th>
                                  <th className="p-4 border-b border-slate-200">Esc. Profesional</th>
                                   <th className="p-4 border-b border-slate-200">Contactos</th>
                              </tr>
                          </thead>
                          <tbody className="text-xs text-slate-700 divide-y divide-slate-100">
                              {directorio.map(p => (
                                  <tr key={p.id} className="hover:bg-slate-50">
                                      <td className="p-4 font-mono font-medium">{p.dni}</td>
                                      <td className="p-4 font-bold">{p.nombre}</td>
                                      <td className="p-4">{p.condicion} {p.categoria_regimen && <span className="text-slate-400">({p.categoria_regimen})</span>}</td>
                                      <td className="p-4">{p.departamento_cargo}</td>
                                      <td className="p-4">{p.escuela_profesional}</td>
                                      <td className="p-4 text-[10px] min-w-[120px]">
                                         {p.correo && <p className="text-primary truncate max-w-[150px]">{p.correo}</p>}
                                         {p.telefono && <p className="text-slate-500">{p.telefono}</p>}
                                         {(!p.correo && !p.telefono) && <span className="text-slate-400 italic">Sin datos</span>}
                                      </td>
                                  </tr>
                              ))}
                              {directorio.length === 0 && (
                                  <tr>
                                      <td colSpan={6} className="p-8 text-center text-slate-500">No hay registros de personal.</td>
                                  </tr>
                              )}
                          </tbody>
                      </table>
                  </div>
                  
                  {dirTotalItems > 0 && (
                      <div className="p-4 border-t border-slate-100 flex items-center justify-between text-xs font-medium text-slate-500 bg-slate-50">
                          <div>
                              Mostrando {dirPage * 100 + 1} a {Math.min((dirPage + 1) * 100, dirTotalItems)} de {dirTotalItems} resultados
                          </div>
                          <div className="flex items-center gap-2">
                              <button 
                                  disabled={dirPage === 0} 
                                  onClick={() => setDirPage(p => Math.max(0, p - 1))}
                                  className="p-1 rounded hover:bg-slate-200 disabled:opacity-50 transition-colors"
                              >
                                  <span className="material-symbols-outlined text-[18px]">chevron_left</span>
                              </button>
                              <span className="font-bold text-slate-700">Página {dirPage + 1}</span>
                              <button 
                                  disabled={(dirPage + 1) * 100 >= dirTotalItems} 
                                  onClick={() => setDirPage(p => p + 1)}
                                  className="p-1 rounded hover:bg-slate-200 disabled:opacity-50 transition-colors"
                              >
                                  <span className="material-symbols-outlined text-[18px]">chevron_right</span>
                              </button>
                          </div>
                      </div>
                  )}
              </div>
          </div>
      )}

      {/* PROCESOS TAB */}
      {!loading && activeTab === 'procesos' && !selectedProceso && (
          <div className="flex flex-col gap-6">
             <div className="flex items-center justify-between">
                <h3 className="font-black text-slate-900">Procesos de Admisión</h3>
                <button onClick={() => setShowNewProceso(!showNewProceso)} className="bg-primary hover:bg-primary/90 text-white px-4 py-2 rounded-xl text-xs font-bold transition-all inline-flex items-center gap-2">
                   <span className="material-symbols-outlined text-[18px]">{showNewProceso ? 'close' : 'add'}</span>
                   {showNewProceso ? 'Cancelar' : 'Nuevo Proceso'}
                </button>
             </div>

             {showNewProceso && (
                 <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col gap-6 animate-in slide-in-from-top-4">
                    <h4 className="font-bold text-slate-900">Crear Cuadro de Necesidades</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="flex flex-col gap-2">
                           <label className="text-xs font-bold text-slate-700">Nombre del Proceso</label>
                           <input type="text" value={newProcesoName} onChange={e => setNewProcesoName(e.target.value.toUpperCase())} className="border border-slate-200 rounded-xl p-3 text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none" placeholder="Ej. EXAMEN ORDINARIO 2026-I" />
                        </div>
                        <div className="flex flex-col gap-2">
                           <label className="text-xs font-bold text-slate-700">Modalidad Asociada</label>
                           <select value={newProcesoModalidad} onChange={e => setNewProcesoModalidad(e.target.value)} className="border border-slate-200 rounded-xl p-3 text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none">
                               <option value="">-- Seleccionar --</option>
                               {modalidades.map(m => (
                                   <option key={m.id} value={m.id}>{m.nombre} ({m.cv_cuadros_anuales?.anio})</option>
                               ))}
                           </select>
                        </div>
                    </div>

                    <div className="flex flex-col gap-4 mt-2">
                        <div className="flex items-center justify-between">
                           <label className="text-xs font-bold text-slate-700">Necesidades por Cargo</label>
                           <button onClick={handleAddNecesidadRow} className="text-xs font-bold text-primary hover:text-primary/80 flex items-center gap-1">
                               <span className="material-symbols-outlined text-[16px]">add_circle</span> Añadir Cargo
                           </button>
                        </div>
                        
                        {newNecesidades.map((n, idx) => (
                            <div key={idx} className="flex gap-4 items-center bg-slate-50 p-3 rounded-xl border border-slate-100">
                                <div className="flex-1">
                                   <select value={n.cargo} onChange={e => handleUpdateNecesidad(idx, 'cargo', e.target.value)} className="w-full text-xs p-2 border border-slate-200 rounded-lg outline-none uppercase font-bold text-slate-700">
                                       <option value="">-- SELECCIONAR CARGO --</option>
                                       {dbCargos.map(c => <option key={c.id} value={c.nombre}>{c.nombre}</option>)}
                                   </select>
                                </div>
                                <div className="w-32 flex items-center gap-2">
                                    <span className="text-xs text-slate-500 font-bold">Cant:</span>
                                    <input type="number" min="0" value={n.cantidad} onChange={e => handleUpdateNecesidad(idx, 'cantidad', parseInt(e.target.value)||0)} className="w-20 text-xs p-2 border border-slate-200 rounded-lg outline-none text-right font-mono" />
                                </div>
                                <button onClick={() => handleDeleteNecesidad(idx)} className="text-red-400 hover:text-red-600 p-1">
                                    <span className="material-symbols-outlined">delete</span>
                                </button>
                            </div>
                        ))}
                    </div>

                    <div className="flex justify-end mt-4">
                        <button onClick={handleSaveProceso} className="bg-slate-900 hover:bg-black text-white px-6 py-3 rounded-xl text-xs font-bold transition-all shadow-md active:scale-95">Guardar Proceso</button>
                    </div>
                 </div>
             )}

             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                 {procesos.map(proc => (
                     <div key={proc.id} onClick={() => showProcesoDetails(proc)} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:border-primary hover:shadow-md cursor-pointer transition-all flex flex-col gap-3 group">
                        <div className="flex justify-between items-start">
                            <span className="material-symbols-outlined text-slate-300 group-hover:text-primary transition-colors text-3xl">assignment</span>
                            <span className={`px-2 py-1 text-[10px] font-black rounded uppercase tracking-widest ${proc.estado === 'Borrador' ? 'bg-slate-100 text-slate-500' : 'bg-green-100 text-green-700'}`}>{proc.estado}</span>
                        </div>
                        <div>
                           <h4 className="font-black text-slate-800 text-sm leading-tight">{proc.nombre}</h4>
                           <p className="text-xs text-slate-500 font-medium mt-1 truncate">{(proc as any).modalidad?.nombre || 'General'}</p>
                        </div>
                     </div>
                 ))}
                 {procesos.length === 0 && !showNewProceso && (
                     <div className="col-span-full text-center text-slate-500 py-10 bg-white rounded-2xl border border-dashed border-slate-300">
                         No hay procesos creados. Crea el primero.
                     </div>
                 )}
             </div>
          </div>
      )}

      {/* DETALLE DEL PROCESO */}
      {!loading && activeTab === 'procesos' && selectedProceso && (
          <div className="flex flex-col gap-6 animate-in slide-in-from-right-4">
             <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <button onClick={() => setSelectedProceso(null)} className="p-2 bg-white border border-slate-200 rounded-full hover:bg-slate-50 transition-all text-slate-500 shadow-sm">
                       <span className="material-symbols-outlined">arrow_back</span>
                    </button>
                    <div>
                      <h3 className="font-black text-slate-900 text-lg">{selectedProceso.nombre}</h3>
                      <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Requerimientos de Personal</p>
                    </div>
                </div>
                {!isEditingNecesidades ? (
                    <button onClick={handleEditNecesidades} className="bg-primary hover:bg-primary/90 text-white px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-md flex items-center gap-1">
                        <span className="material-symbols-outlined text-[16px]">edit</span> Editar Cuadro
                    </button>
                ) : (
                    <div className="flex gap-2">
                        <button onClick={() => setIsEditingNecesidades(false)} className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-sm">
                           Cancelar
                        </button>
                        <button onClick={handleSaveEditedNecesidades} className="bg-slate-900 hover:bg-black text-white px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-md flex items-center gap-1">
                           <span className="material-symbols-outlined text-[16px]">save</span> Guardar
                        </button>
                    </div>
                )}
             </div>

             <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                {!isEditingNecesidades ? (
                    <table className="w-full text-left">
                        <thead className="bg-slate-50 border-b border-slate-200 text-[10px] font-black text-slate-500 uppercase tracking-widest">
                           <tr>
                               <th className="p-4">Cargo / Función</th>
                               <th className="p-4 text-right">Cantidad Requerida</th>
                           </tr>
                        </thead>
                        <tbody className="text-xs text-slate-800 divide-y divide-slate-100 font-bold">
                            {necesidades.map(n => (
                                <tr key={n.id}>
                                    <td className="p-4">{n.cargo}</td>
                                    <td className="p-4 text-right">{n.cantidad_requerida}</td>
                                </tr>
                            ))}
                            {necesidades.length === 0 && (
                                <tr>
                                    <td colSpan={2} className="p-8 text-center text-slate-500">No hay roles definidos. Haz clic en "Editar Cuadro".</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                ) : (
                    <div className="p-6 flex flex-col gap-4">
                        {editNecesidadesRows.map((n, idx) => (
                            <div key={idx} className="flex gap-4 items-center bg-slate-50 p-3 rounded-xl border border-slate-100">
                                <div className="flex-1">
                                   <select value={n.cargo} onChange={e => {
                                       const updated = [...editNecesidadesRows];
                                       updated[idx].cargo = e.target.value;
                                       setEditNecesidadesRows(updated);
                                   }} className="w-full text-xs p-2 border border-slate-200 rounded-lg outline-none uppercase font-bold text-slate-700">
                                       <option value="">-- SELECCIONAR CARGO --</option>
                                       {dbCargos.map(c => <option key={c.id} value={c.nombre}>{c.nombre}</option>)}
                                   </select>
                                </div>
                                <div className="w-32 flex items-center gap-2">
                                    <span className="text-xs text-slate-500 font-bold">Cant:</span>
                                    <input type="number" min="0" value={n.cantidad} onChange={e => {
                                        const updated = [...editNecesidadesRows];
                                        updated[idx].cantidad = parseInt(e.target.value) || 0;
                                        setEditNecesidadesRows(updated);
                                    }} className="w-20 text-xs p-2 border border-slate-200 rounded-lg outline-none text-right font-mono" />
                                </div>
                                <button onClick={() => {
                                    const updated = editNecesidadesRows.filter((_, i) => i !== idx);
                                    setEditNecesidadesRows(updated);
                                }} className="text-red-400 hover:text-red-600 p-1">
                                    <span className="material-symbols-outlined">delete</span>
                                </button>
                            </div>
                        ))}
                        <button onClick={() => setEditNecesidadesRows([...editNecesidadesRows, { cargo: '', cantidad: 0 }])} className="text-xs font-bold text-primary hover:text-primary/80 flex items-center gap-1 w-fit mt-2">
                            <span className="material-symbols-outlined text-[16px]">add_circle</span> Añadir Fila de Cargo
                        </button>
                    </div>
                )}
             </div>
          </div>
      )}

      {/* SORTEOS TAB */}
      {!loading && activeTab === 'sorteos' && (
          <div className={isFullScreen ? "fixed inset-0 z-[100] bg-slate-50 flex flex-col h-screen overflow-hidden p-4 gap-4" : "flex flex-col gap-4"}>
              
              {isFullScreen && (
                  <div className="bg-white px-4 py-3 rounded-xl border border-slate-200 flex items-center justify-between shadow-sm shrink-0">
                      <h2 className="font-bold text-lg text-slate-800 flex items-center gap-2">
                         <span className="material-symbols-outlined text-primary">fullscreen</span>
                         Modo Extendido - Sorteos y Confirmación
                      </h2>
                      <button onClick={() => setIsFullScreen(false)} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-700 font-bold transition-colors text-sm flex items-center gap-2">
                          <span className="material-symbols-outlined text-[18px]">close_fullscreen</span> Salir
                      </button>
                  </div>
              )}

              {/* COMPACT TOOLBAR */}
              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between shrink-0">
                  {/* Select Process */}
                  <div className="flex items-center gap-3 w-full sm:w-auto bg-slate-50 rounded-lg p-1 pr-3 border border-slate-100 focus-within:border-primary focus-within:ring-1 focus-within:ring-primary transition-all">
                      <div className="bg-white p-2 rounded-md shadow-sm text-slate-400 flex items-center justify-center">
                         <span className="material-symbols-outlined text-[18px]">event_list</span>
                      </div>
                      <select value={selectedSorteoProceso} onChange={e => setSelectedSorteoProceso(e.target.value)} className="border-none bg-transparent font-black text-slate-800 text-xs sm:text-sm focus:ring-0 outline-none cursor-pointer p-1 w-full sm:max-w-md truncate appearance-none">
                           <option value="">-- Seleccionar Proceso --</option>
                           {procesos.map(p => (
                               <option key={p.id} value={p.id}>{p.nombre}</option>
                           ))}
                      </select>
                  </div>

                  {/* Actions (Only show if process selected) */}
                  {selectedSorteoProceso && (
                      <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                          {!isFullScreen && (
                              <button onClick={() => setIsFullScreen(true)} className="bg-slate-800 text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-slate-900 shadow-sm flex items-center gap-1.5 transition-colors">
                                 <span className="material-symbols-outlined text-[16px]">fullscreen</span> <span className="hidden sm:inline">Modo Extendido</span>
                              </button>
                          )}
                          <input type="file" accept=".csv" ref={sortFileInput} onChange={handleSorteoUpload} className="hidden" id="sorteo-csv" />
                          <button onClick={() => setIsImportSorteosModalOpen(true)} className="bg-white border border-slate-200 text-slate-700 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-slate-50 cursor-pointer shadow-sm flex items-center gap-1.5 transition-colors">
                             <span className="material-symbols-outlined text-[16px]">upload_file</span> <span className="hidden sm:inline">Importar</span>
                          </button>

                          <button onClick={() => setShowAddSorteo(!showAddSorteo)} className={`px-3 py-1.5 rounded-lg text-xs font-bold shadow-sm flex items-center gap-1.5 transition-colors ${showAddSorteo ? 'bg-slate-800 text-white hover:bg-slate-900 border border-slate-800' : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'}`}>
                             <span className="material-symbols-outlined text-[16px]">{showAddSorteo ? 'close' : 'person_add'}</span> <span className="hidden sm:inline">{showAddSorteo ? 'Cerrar' : 'Añadir'}</span>
                          </button>
                          
                          <button onClick={() => handlePrintSorteos()} className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg text-xs font-bold shadow-sm flex items-center gap-1.5 transition-colors border border-emerald-600">
                             <span className="material-symbols-outlined text-[16px]">print</span> Reporte <span className="hidden lg:inline">PDF</span>
                          </button>

                          <button onClick={handleOpenEmailModal} className="bg-primary hover:bg-primary/90 text-white px-3 py-1.5 rounded-lg text-xs font-bold shadow-sm flex items-center gap-1.5 transition-colors border border-primary ml-auto sm:ml-0">
                             <span className="material-symbols-outlined text-[16px]">forward_to_inbox</span> Notificar <span className="hidden lg:inline">a Visibles</span>
                          </button>
                      </div>
                  )}
              </div>

              {selectedSorteoProceso && (
                  <div className={`flex gap-4 animate-in fade-in flex-1 overflow-hidden ${isFullScreen ? 'flex-row' : 'flex-col'}`}>
                     
                     {/* LEFT COLUMN (Table & Tools) */}
                     <div className={`flex flex-col gap-4 flex-1 ${isFullScreen ? 'overflow-hidden' : 'overflow-visible'}`}>
                         {/* Dashboard (Top when not fullscreen) */}
                         {!isFullScreen && sorteoDashboardStats.length > 0 && (
                             <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm shrink-0">
                                 <h4 className="font-bold text-slate-900 text-sm mb-3 flex items-center gap-2">
                                    <span className="material-symbols-outlined text-primary">monitoring</span>
                                    Progreso de Confirmaciones
                                 </h4>
                                 <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                                     {sorteoDashboardStats.map(stat => {
                                         const pct = stat.requerida > 0 ? Math.round((stat.confirmados / stat.requerida) * 100) : 0;
                                         return (
                                            <div key={stat.cargo} className={`p-3 rounded-xl border bg-white flex flex-col relative overflow-hidden transition-all hover:bg-slate-50 ${pct >= 100 ? 'border-emerald-200' : 'border-slate-200'}`}>
                                                <div className="font-bold text-[10px] text-slate-600 uppercase tracking-wider mb-2 leading-tight min-h-[28px]">{stat.cargo}</div>
                                                <div className="flex items-end gap-1.5">
                                                    <span className={`text-2xl font-black leading-none ${pct >= 100 ? 'text-emerald-600' : 'text-slate-900'}`}>{stat.confirmados}</span>
                                                    <span className="text-xs font-medium text-slate-500 mb-0.5 whitespace-nowrap">/ {stat.requerida} requeridos</span>
                                                </div>
                                                <div className="mt-2 text-[10px] font-bold text-indigo-600 flex items-center gap-1 bg-indigo-50 w-fit px-1.5 py-0.5 rounded mb-2">
                                                    <span className="material-symbols-outlined text-[14px]">hourglass_top</span>
                                                    {stat.pendientes} notif. pendientes
                                                </div>
                                                
                                                {stat.confirmados > 0 && (
                                                    <button 
                                                        onClick={() => {
                                                            const filtered = sorteos.filter(s => s.cargo === stat.cargo && s.estado_confirmacion === 'Confirmado');
                                                            setScheduleBuilderUsers(filtered);
                                                            setScheduleBuilderCargo(stat.cargo);
                                                            setScheduleBuilderProcesoName(procesos.find(p => p.id === selectedSorteoProceso)?.nombre || 'Proceso Activo');
                                                            setScheduleBuilderOpen(true);
                                                        }}
                                                        className="mt-1 w-full text-[10px] font-black uppercase tracking-wider bg-slate-100 hover:bg-slate-200 text-slate-700 py-1.5 rounded-lg active:scale-95 transition-all flex items-center justify-center gap-1"
                                                    >
                                                        <span className="material-symbols-outlined text-[14px]">calendar_add_on</span> Generar Horario
                                                    </button>
                                                )}

                                                <div className="absolute bottom-0 left-0 h-1.5 bg-slate-100 w-full" />
                                                <div className={`absolute bottom-0 left-0 h-1.5 transition-all ${pct >= 100 ? 'bg-emerald-500' : 'bg-primary'}`} style={{ width: `${Math.min(pct, 100)}%` }} />
                                            </div>
                                         )
                                     })}
                                 </div>
                             </div>
                         )}

                         {showAddSorteo && (
                             <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col gap-4 overflow-visible relative border-t-4 border-t-slate-800 shrink-0">
                             <h4 className="font-bold text-slate-900 text-sm">Añadir Persona al Sorteo</h4>
                             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                 <input type="text" placeholder="DNI" value={newSorteo.dni} onChange={e=>setNewSorteo({...newSorteo, dni: e.target.value})} className="border border-slate-200 rounded-lg p-2.5 text-xs focus:ring-1 focus:ring-primary outline-none font-mono" />
                                 
                                 <div className="relative">
                                     <input type="text" placeholder="NOMBRES COMPLETOS (Escribe para buscar)" value={newSorteo.nombres} onChange={e=>searchDirectorioAutocomplete(e.target.value)} onFocus={() => { if(dirSearchResults.length > 0) setShowDirSearch(true); }} className="w-full border border-slate-200 rounded-lg p-2.5 text-xs focus:ring-1 focus:ring-primary outline-none uppercase font-bold" />
                                     {showDirSearch && (
                                         <div className="absolute z-50 top-full mt-1 left-0 right-0 bg-white border border-slate-200 rounded-lg shadow-xl overflow-hidden max-h-48 overflow-y-auto">
                                            {dirSearchResults.map(p => (
                                                <button key={p.id} onClick={() => handleSelectPersonForSorteo(p)} className="w-full text-left px-3 py-2 hover:bg-slate-50 border-b border-slate-100 last:border-0">
                                                    <div className="text-xs font-bold text-slate-800">{p.nombre}</div>
                                                    <div className="text-[10px] text-slate-500 font-mono">{p.dni} - {p.departamento_cargo || 'Sin Area'}</div>
                                                </button>
                                            ))}
                                            <button onClick={() => setShowDirSearch(false)} className="w-full text-center text-[10px] font-bold text-slate-400 p-2 bg-slate-50 hover:text-slate-600">Cerrar</button>
                                         </div>
                                     )}
                                 </div>
                                 
                                 <select value={newSorteo.cargo} onChange={e=>setNewSorteo({...newSorteo, cargo: e.target.value})} className="border border-slate-200 rounded-lg p-2.5 text-xs focus:ring-1 focus:ring-primary outline-none uppercase font-bold text-slate-700">
                                       <option value="">-- SELECCIONAR CARGO --</option>
                                       {dbCargos.map(c => <option key={c.id} value={c.nombre}>{c.nombre}</option>)}
                                 </select>
                                 
                                 <select value={newSorteo.condicion_sorteo} onChange={e=>setNewSorteo({...newSorteo, condicion_sorteo: e.target.value})} className="border border-slate-200 rounded-lg p-2.5 text-xs focus:ring-1 focus:ring-primary outline-none">
                                     <option value="Titular">Titular</option>
                                     <option value="Suplente">Suplente</option>
                                 </select>
                                 <input type="email" placeholder="CORREO ELECTRÓNICO (Opcional)" value={newSorteo.email_personal} onChange={e=>setNewSorteo({...newSorteo, email_personal: e.target.value})} className="border border-slate-200 rounded-lg p-2.5 text-xs focus:ring-1 focus:ring-primary outline-none" />
                                 <input type="text" placeholder="TELÉFONO (Opcional)" value={newSorteo.telefono} onChange={e=>setNewSorteo({...newSorteo, telefono: e.target.value})} className="border border-slate-200 rounded-lg p-2.5 text-xs focus:ring-1 focus:ring-primary outline-none" />
                             </div>
                             <div className="flex justify-end pt-2 border-t border-slate-100">
                                 <button onClick={handleSaveNewSorteo} className="bg-slate-900 hover:bg-black text-white px-6 py-2 rounded-lg text-xs font-bold transition-all shadow-md">Guardar</button>
                             </div>
                         </div>
                     )}

                     {/* Table Container */}
                     <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
                        <div className="p-3 border-b border-slate-100 bg-slate-50 flex flex-wrap gap-3 items-center relative z-0">
                            <h4 className="text-xs font-black text-slate-500 uppercase tracking-widest mr-2">Filtros:</h4>
                            <div className="flex bg-white border border-slate-200 rounded-lg overflow-hidden focus-within:ring-1 focus-within:ring-primary">
                                <span className="material-symbols-outlined text-slate-400 p-2 text-[18px]">search</span>
                                <input type="text" placeholder="Buscar DNI o Nombre..." value={sorteoFilters.search} onChange={e => setSorteoFilters({...sorteoFilters, search: e.target.value})} className="p-2 text-xs outline-none w-48 text-slate-700 font-medium" />
                            </div>
                            <select value={sorteoFilters.cargo} onChange={e => setSorteoFilters({...sorteoFilters, cargo: e.target.value})} className="p-2 text-xs border border-slate-200 rounded-lg outline-none cursor-pointer bg-white">
                                <option value="">Todos los Cargos</option>
                                {uniqueCargosSorteos.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                            <select value={sorteoFilters.condicion} onChange={e => setSorteoFilters({...sorteoFilters, condicion: e.target.value})} className="p-2 text-xs border border-slate-200 rounded-lg outline-none cursor-pointer bg-white">
                                <option value="">Toda Condición</option>
                                {uniqueCondicionesSorteos.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                            <select value={sorteoFilters.estado} onChange={e => setSorteoFilters({...sorteoFilters, estado: e.target.value})} className="p-2 text-xs border border-slate-200 rounded-lg outline-none cursor-pointer bg-white">
                                <option value="">Todos los Estados</option>
                                {uniqueEstadosSorteos.map(e => <option key={e} value={e}>{e}</option>)}
                            </select>
                        </div>
                        <div className="overflow-x-auto max-h-[600px]">
                            <table className="w-full text-left border-collapse">
                                <thead className="bg-slate-50 uppercase text-[10px] font-black text-slate-500 tracking-wider sticky top-0">
                                   <tr>
                                       <th className="p-4 border-b border-slate-200">Personal</th>
                                       <th className="p-4 border-b border-slate-200">Cargo</th>
                                       <th className="p-4 border-b border-slate-200">Condición</th>
                                       <th className="p-4 border-b border-slate-200">Contacto</th>
                                       <th className="p-4 border-b border-slate-200">Estado Confirmación</th>
                                       <th className="p-4 border-b border-slate-200 text-center">Acción Manual</th>
                                   </tr>
                                </thead>
                                <tbody className="text-xs text-slate-700 divide-y divide-slate-100">
                                   {filteredSorteos.map(s => (
                                       <tr key={s.id} className={`transition-all border-b border-slate-100 last:border-b-0 ${getCargoColorStyle(s.cargo)}`}>
                                           <td className="p-4">
                                              <p className="font-bold text-slate-900 leading-tight flex items-center gap-1">
                                                 {s.nombres}
                                                 {s.notificado && <span className="bg-blue-100 text-blue-700 text-[8px] px-1.5 py-0.5 rounded-sm font-black uppercase tracking-wider ml-1" title="Notificado por Correo">Notificado</span>}
                                              </p>
                                              <p className="font-mono text-[10px] text-slate-500 mt-0.5">{s.dni}</p>
                                           </td>
                                           <td className="p-4 font-bold text-slate-700 text-[10px] uppercase leading-tight max-w-[150px]">
                                              {s.cargo}
                                           </td>
                                           <td className="p-4">
                                              <span className={`px-2 py-1 rounded-md font-black text-[9px] uppercase tracking-wider ${s.condicion_sorteo.toLowerCase() === 'titular' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>
                                                 {s.condicion_sorteo}
                                              </span>
                                           </td>
                                           <td className="p-4 text-[10px]">
                                              {s.email_personal && <p className="text-primary truncate max-w-[150px]">{s.email_personal}</p>}
                                              {s.telefono && <p className="text-slate-500">{s.telefono}</p>}
                                           </td>
                                       <td className="p-4">
                                           {s.estado_confirmacion === 'Pendiente' && (!s.fecha_limite_confirmacion || new Date(s.fecha_limite_confirmacion).getTime() >= new Date().getTime()) && <span className="bg-yellow-100 text-yellow-700 px-2 py-1 rounded font-bold text-[10px] uppercase">Pendiente</span>}
                                           {s.estado_confirmacion === 'Pendiente' && s.fecha_limite_confirmacion && new Date(s.fecha_limite_confirmacion).getTime() < new Date().getTime() && <span title="Tiempo límite finalizado" className="bg-orange-100 text-orange-800 px-2 py-1 rounded font-bold text-[10px] uppercase flex items-center gap-1 w-fit cursor-help"><span className="material-symbols-outlined text-[14px]">timer_off</span>Expirado</span>}
                                           {s.estado_confirmacion === 'Confirmado' && <span className="bg-emerald-100 text-emerald-700 px-2 py-1 rounded font-bold text-[10px] uppercase flex items-center gap-1 w-fit"><span className="material-symbols-outlined text-[14px]">check_circle</span>Confirmado</span>}
                                           {s.estado_confirmacion === 'Rechazado' && (
                                               <span title={s.motivo_rechazo || 'Sin motivo'} className="bg-red-100 text-red-700 px-2 py-1 rounded font-bold text-[10px] uppercase flex items-center gap-1 w-fit cursor-help">
                                                   <span className="material-symbols-outlined text-[14px]">cancel</span>Rechazado
                                               </span>
                                           )}
                                       </td>
                                           <td className="p-4">
                                                <div className="flex gap-1 justify-center">
                                                    <button onClick={() => confirmParticipant(s.id, 'Confirmado')} title="Confirmar Manual" className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition-colors">
                                                       <span className="material-symbols-outlined text-[16px]">how_to_reg</span>
                                                    </button>
                                                    <button onClick={() => confirmParticipant(s.id, 'Rechazado')} title="Marcar Rechazo" className="p-1.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 transition-colors">
                                                       <span className="material-symbols-outlined text-[16px]">person_off</span>
                                                    </button>
                                                </div>
                                           </td>
                                       </tr>
                                   ))}
                                   {filteredSorteos.length === 0 && (
                                       <tr><td colSpan={6} className="text-center p-8 text-slate-500">No hay registros que coincidan con los filtros o aún no hay personal asignado para este proceso.</td></tr>
                                   )}
                                </tbody>
                            </table>
                        </div>
                     </div>
                  </div>

                  {/* Dashboard (Right Side when fullscreen) */}
                  {isFullScreen && sorteoDashboardStats.length > 0 && (
                      <div className="w-80 flex-shrink-0 flex flex-col gap-3 overflow-y-auto pr-1 pb-4">
                          <div className="sticky top-0 bg-slate-50 pb-2 z-10 border-b border-slate-200/50 mb-1">
                              <h4 className="font-bold text-slate-800 flex items-center gap-2">
                                 <span className="material-symbols-outlined text-primary">monitoring</span>
                                 Progreso
                              </h4>
                          </div>
                          {sorteoDashboardStats.map(stat => {
                              const pct = stat.requerida > 0 ? Math.round((stat.confirmados / stat.requerida) * 100) : 0;
                              return (
                                 <div key={stat.cargo} className={`p-3 rounded-xl border bg-white flex flex-col relative overflow-hidden transition-all hover:bg-slate-50 shadow-sm ${pct >= 100 ? 'border-emerald-200' : 'border-slate-200'}`}>
                                     <div className="font-bold text-[10px] text-slate-600 uppercase tracking-wider mb-2 leading-tight min-h-[28px]">{stat.cargo}</div>
                                     <div className="flex items-end gap-1.5 mb-2">
                                         <span className={`text-3xl font-black leading-none tracking-tighter ${pct >= 100 ? 'text-emerald-600' : 'text-slate-900'}`}>{stat.confirmados}</span>
                                         <span className="text-xs font-medium text-slate-500 mb-0.5 whitespace-nowrap">/ {stat.requerida}</span>
                                     </div>
                                     <div className="text-[10px] font-bold text-blue-600 flex items-center gap-1 bg-blue-50 w-fit px-1.5 py-0.5 rounded border border-blue-100">
                                         <span className="material-symbols-outlined text-[14px]">hourglass_top</span>
                                         {stat.pendientes} pendientes
                                     </div>
                                     <div className="absolute bottom-0 left-0 h-1.5 bg-slate-100 w-full" />
                                     <div className={`absolute bottom-0 left-0 h-1.5 transition-all ${pct >= 100 ? 'bg-emerald-500' : 'bg-primary'}`} style={{ width: `${Math.min(pct, 100)}%` }} />
                                 </div>
                              )
                          })}
                      </div>
                  )}
                  </div>
              )}
          </div>
      )}

      {/* Add Directorio Person Modal */}
      {showAddDirModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in">
            <div className="bg-white rounded-2xl w-full max-w-lg shadow-xl overflow-hidden flex flex-col">
                <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                    <h3 className="font-bold text-slate-900 flex items-center gap-2">
                        <span className="material-symbols-outlined text-primary">person_add</span> 
                        Agregar Persona al Directorio
                    </h3>
                    <button onClick={() => setShowAddDirModal(false)} className="text-slate-400 hover:text-slate-600">
                        <span className="material-symbols-outlined">close</span>
                    </button>
                </div>
                <div className="p-5 overflow-y-auto max-h-[70vh] flex flex-col gap-4 text-sm">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1">DNI *</label>
                            <input type="text" value={newDirPerson.dni} onChange={e=>setNewDirPerson({...newDirPerson, dni: e.target.value})} className="w-full border border-slate-200 rounded-lg p-2 outline-none focus:border-primary focus:ring-1 focus:ring-primary font-mono" />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1">Condición</label>
                            <input type="text" value={newDirPerson.condicion} onChange={e=>setNewDirPerson({...newDirPerson, condicion: e.target.value})} className="w-full border border-slate-200 rounded-lg p-2 outline-none focus:border-primary focus:ring-1 focus:ring-primary uppercase" placeholder="Ej. NOMBRADO" />
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">Nombres y Apellidos *</label>
                        <input type="text" value={newDirPerson.nombre} onChange={e=>setNewDirPerson({...newDirPerson, nombre: e.target.value})} className="w-full border border-slate-200 rounded-lg p-2 outline-none focus:border-primary focus:ring-1 focus:ring-primary" placeholder="Ej. LOPEZ PEREZ JUAN" />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">Cargo / Departamento</label>
                        <input type="text" value={newDirPerson.departamento_cargo} onChange={e=>setNewDirPerson({...newDirPerson, departamento_cargo: e.target.value})} className="w-full border border-slate-200 rounded-lg p-2 outline-none focus:border-primary focus:ring-1 focus:ring-primary" />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1">Escuela Profesional</label>
                        <input type="text" value={newDirPerson.escuela_profesional} onChange={e=>setNewDirPerson({...newDirPerson, escuela_profesional: e.target.value})} className="w-full border border-slate-200 rounded-lg p-2 outline-none focus:border-primary focus:ring-1 focus:ring-primary" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1">Correo Electrónico</label>
                            <input type="email" value={newDirPerson.correo} onChange={e=>setNewDirPerson({...newDirPerson, correo: e.target.value})} className="w-full border border-slate-200 rounded-lg p-2 outline-none focus:border-primary focus:ring-1 focus:ring-primary" />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1">Teléfono</label>
                            <input type="tel" value={newDirPerson.telefono} onChange={e=>setNewDirPerson({...newDirPerson, telefono: e.target.value})} className="w-full border border-slate-200 rounded-lg p-2 outline-none focus:border-primary focus:ring-1 focus:ring-primary" />
                        </div>
                    </div>
                </div>
                <div className="p-4 border-t border-slate-100 flex justify-end gap-3 bg-slate-50">
                    <button onClick={() => setShowAddDirModal(false)} className="px-5 py-2 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-200 transition-colors">Cancelar</button>
                    <button onClick={handleSaveAddDirPerson} disabled={loading} className="px-5 py-2 rounded-xl text-sm font-bold text-white bg-primary hover:bg-primary/90 transition-colors flex items-center gap-2">
                        <span className="material-symbols-outlined text-[18px]">save</span> Guardar
                    </button>
                </div>
            </div>
        </div>
      )}

      {/* Email Notification Modal */}
      {showEmailModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
            <div className="bg-white rounded-2xl w-full max-w-2xl shadow-xl overflow-hidden flex flex-col max-h-[90vh]">
                <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                    <h3 className="font-bold text-slate-900 flex items-center gap-2">
                        <span className="material-symbols-outlined text-primary">mail</span> 
                        Generar Notificación de Correo
                    </h3>
                    <button onClick={() => setShowEmailModal(false)} className="text-slate-400 hover:text-slate-600">
                        <span className="material-symbols-outlined">close</span>
                    </button>
                </div>
                <div className="p-4 overflow-y-auto flex-1 flex flex-col gap-4">
                    <div className="bg-blue-50 text-blue-800 p-3 rounded-lg text-sm flex gap-2">
                        <span className="material-symbols-outlined text-[20px]">info</span>
                        <p>Se enviará este correo a <strong>{filteredSorteos.filter(s => s.estado_confirmacion === 'Pendiente' && s.email_personal && !s.notificado).length}</strong> persona(s) filtrada(s) que tienen estado PENDIENTE, tienen correo registrado y NO han sido notificadas.</p>
                    </div>

                    <div>
                        <label className="block text-xs font-bold tracking-wider text-slate-500 mb-1">ASUNTO DEL CORREO</label>
                        <input type="text" value={emailSubject} onChange={e => setEmailSubject(e.target.value)} className="w-full border border-slate-200 rounded-lg p-2.5 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary font-bold text-slate-800" />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="bg-blue-50/50 p-3 rounded-xl border border-blue-100">
                            <label className="block text-xs font-bold tracking-wider text-blue-800 mb-1">
                                FECHA DEL EXAMEN <span className="text-blue-500 font-normal normal-case">(Ej. Sábado, 24 de Enero)</span>
                            </label>
                            <input 
                                type="text" 
                                value={emailFechaExamen} 
                                onChange={e => setEmailFechaExamen(e.target.value)} 
                                placeholder="Escribe la fecha aquí..."
                                className="w-full border border-blue-200 rounded-lg p-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" 
                            />
                        </div>
                        <div className="bg-amber-50/50 p-3 rounded-xl border border-amber-100">
                            <label className="block text-xs font-bold tracking-wider text-amber-800 mb-1">
                                FECHA LÍMITE DE RESPUESTA
                            </label>
                            <input 
                                type="datetime-local" 
                                value={emailFechaLimite} 
                                onChange={e => setEmailFechaLimite(e.target.value)} 
                                className="w-full border border-amber-200 rounded-lg p-2 text-sm outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500" 
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-bold tracking-wider text-slate-500 mb-1">CUERPO DEL CORREO (Puedes editarlo)</label>
                        <div className="text-xs text-slate-500 mb-2 leading-relaxed bg-slate-100 p-2 rounded-lg">
                            <strong>Etiquetas dinámicas (se reemplazan solas):</strong> <br/>
                            <div className="grid grid-cols-2 gap-1 mt-1">
                                <span><code>{'{nombre}'}</code> = Nombre de la persona</span>
                                <span><code>{'{cargo}'}</code> = Cargo asignado</span>
                                <span><code>{'{enlace_confirmacion}'}</code> = Botón de enlace</span>
                                <span><code>{'{fecha_examen}'}</code> = Fecha descrita arriba</span>
                                <span><code>{'{fecha_limite}'}</code> = Fecha límite (formateada)</span>
                            </div>
                            <div className="mt-2"><strong>Formato:</strong> Usa <code>**texto**</code> para poner palabras en <strong>negrilla</strong>.</div>
                        </div>
                        <textarea 
                            value={emailTemplate} 
                            onChange={e => setEmailTemplate(e.target.value)} 
                            className="w-full border border-slate-200 rounded-lg p-3 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary font-mono bg-slate-50 min-h-[350px]"
                        ></textarea>
                    </div>
                </div>
                <div className="p-4 border-t border-slate-100 flex justify-end gap-3 bg-slate-50">
                    <button onClick={() => setShowEmailModal(false)} className="px-5 py-2 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-200 transition-colors">Cancelar</button>
                    <button onClick={sendEmailNotifications} className="px-5 py-2 rounded-xl text-sm font-bold text-white bg-primary hover:bg-primary/90 transition-colors flex items-center gap-2">
                        <span className="material-symbols-outlined text-[18px]">send</span> Enviar Correos
                    </button>
                </div>
            </div>
        </div>
      )}

      {/* Import Sorteos Modal */}
      {isImportSorteosModalOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
            <div className="bg-white rounded-2xl w-full max-w-lg shadow-xl overflow-hidden flex flex-col">
                <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                    <h3 className="font-bold text-slate-900 flex items-center gap-2">
                        <span className="material-symbols-outlined text-primary">upload_file</span> 
                        Importar Sorteo y Conformación
                    </h3>
                    <button onClick={() => setIsImportSorteosModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                        <span className="material-symbols-outlined">close</span>
                    </button>
                </div>
                <div className="p-6 overflow-y-auto flex-1 flex flex-col gap-6">
                    <div>
                        <p className="text-sm text-slate-600 mb-4">
                            Para importar el personal de manera masiva mediante un archivo CSV, asegúrate de que el documento incluya exactamente las siguientes cabeceras:
                        </p>
                        <div className="grid grid-cols-2 gap-2 mb-4">
                            <div className="bg-slate-50 p-2 rounded border border-slate-200 text-xs font-mono font-bold text-slate-700">CARGO</div>
                            <div className="bg-slate-50 p-2 rounded border border-slate-200 text-xs font-mono font-bold text-slate-700">DNI</div>
                            <div className="bg-slate-50 p-2 rounded border border-slate-200 text-xs font-mono font-bold text-slate-700">NOMBRES</div>
                            <div className="bg-slate-50 p-2 rounded border border-slate-200 text-xs font-mono font-bold text-slate-700">SORTEADO</div>
                            <div className="bg-slate-50 p-2 rounded border border-slate-200 text-xs font-mono font-bold text-slate-700">EMAILPERSONAL</div>
                            <div className="bg-slate-50 p-2 rounded border border-slate-200 text-xs font-mono font-bold text-slate-700">TELEFONO</div>
                        </div>
                        <p className="text-xs text-slate-500 bg-blue-50 text-blue-800 p-3 rounded-lg border border-blue-100">
                            <strong>Nota:</strong> Puedes descargar una plantilla de ejemplo para llenarla con tus datos. El campo <span className="font-mono">SORTEADO</span> debe contener el valor "Titular" o "Suplente".
                        </p>
                    </div>
                </div>
                <div className="p-4 border-t border-slate-100 flex justify-between gap-3 bg-slate-50">
                    <button onClick={handleDownloadSorteosTemplate} className="px-5 py-2 rounded-xl text-sm font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 transition-colors flex items-center gap-2">
                        <span className="material-symbols-outlined text-[18px]">download</span> Descargar Plantilla
                    </button>
                    <div className="flex gap-2">
                        <button onClick={() => setIsImportSorteosModalOpen(false)} className="px-5 py-2 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-200 transition-colors">Cancelar</button>
                        <button onClick={() => { setIsImportSorteosModalOpen(false); document.getElementById('sorteo-csv')?.click(); }} className="px-5 py-2 rounded-xl text-sm font-bold text-white bg-slate-900 hover:bg-black transition-colors flex items-center gap-2">
                            <span className="material-symbols-outlined text-[18px]">upload</span> Subir CSV
                        </button>
                    </div>
                </div>
            </div>
        </div>
      )}

      {/* Reject Modal */}
      {showRejectModal.isOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
            <div className="bg-white rounded-2xl w-full max-w-md shadow-xl overflow-hidden flex flex-col">
                <div className="p-4 border-b border-red-100 flex items-center justify-between bg-red-50">
                    <h3 className="font-bold text-red-900 flex items-center gap-2">
                        <span className="material-symbols-outlined text-red-600">person_off</span> 
                        Marcar Rechazo
                    </h3>
                    <button onClick={() => setShowRejectModal({ isOpen: false, sorteoId: null })} className="text-red-400 hover:text-red-600">
                        <span className="material-symbols-outlined">close</span>
                    </button>
                </div>
                <div className="p-4 overflow-y-auto flex-1 flex flex-col gap-4">
                    <p className="text-sm text-slate-600">Por favor, indique el motivo por el cual la persona rechaza su participación (opcional).</p>
                    <textarea 
                        value={rejectReason} 
                        onChange={e => setRejectReason(e.target.value)} 
                        placeholder="Ejemplo: Problemas de salud, viaje programado..."
                        className="w-full border border-slate-200 rounded-lg p-3 text-sm outline-none focus:border-red-400 focus:ring-1 focus:ring-red-400 min-h-[120px]"
                    ></textarea>
                </div>
                <div className="p-4 border-t border-slate-100 flex justify-end gap-3 bg-slate-50">
                    <button onClick={() => setShowRejectModal({ isOpen: false, sorteoId: null })} className="px-5 py-2 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-200 transition-colors">Cancelar</button>
                    <button 
                        onClick={() => {
                            if (showRejectModal.sorteoId) {
                                confirmParticipant(showRejectModal.sorteoId, 'Rechazado', rejectReason);
                            }
                        }} 
                        className="px-5 py-2 rounded-xl text-sm font-bold text-white bg-red-600 hover:bg-red-700 transition-colors flex items-center gap-2"
                    >
                        Confirmar Rechazo
                    </button>
                </div>
            </div>
        </div>
      )}

      {/* COMPONENTE OCULTO PARA IMPRESIÓN */}
      <div className="absolute left-[-9999px] top-[-9999px] opacity-0 pointer-events-none" aria-hidden="true">
        <div ref={printSorteosRef} style={{ padding: '20px', fontFamily: 'sans-serif' }}>
          <style>{`
            @media print {
              @page { size: A4 portrait; margin: 15mm; }
              body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
              table { width: 100%; border-collapse: collapse; }
              th, td { border: 1px solid #ccc; padding: 6px 8px; font-size: 11px; text-align: left; }
              th { background-color: #f1f5f9; font-weight: bold; text-transform: uppercase; }
            }
          `}</style>
          
          <div style={{ textAlign: 'center', marginBottom: '20px' }}>
            <h2 style={{ fontSize: '20px', fontWeight: 'bold', margin: '0 0 5px 0' }}>Reporte de Sorteos y Personal</h2>
            <p style={{ fontSize: '12px', color: '#666', margin: 0 }}>
               Proceso: {procesos.find(p => p.id === selectedSorteoProceso)?.nombre || 'No seleccionado'}
            </p>
            <p style={{ fontSize: '12px', color: '#666', margin: '5px 0 0 0' }}>
               Total Listados: {filteredSorteos.length} personas
            </p>
          </div>

          <table>
            <thead>
              <tr>
                <th style={{ width: '40px', textAlign: 'center' }}>N°</th>
                <th>DNI</th>
                <th>Nombres</th>
                <th>Condición</th>
                <th>Cargo Asignado</th>
                <th>Celular / Correo</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {filteredSorteos.map((s, idx) => (
                <tr key={s.id}>
                  <td style={{ textAlign: 'center' }}>{idx + 1}</td>
                  <td>{s.dni}</td>
                  <td style={{ fontWeight: 'bold' }}>{s.nombres}</td>
                  <td>{s.condicion_sorteo}</td>
                  <td>{s.cargo}</td>
                  <td>
                    <div>{s.telefono || '-'}</div>
                    <div style={{ color: '#666', fontSize: '9px' }}>{s.email_personal || ''}</div>
                  </td>
                  <td>{s.estado_confirmacion}</td>
                </tr>
              ))}
              {filteredSorteos.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '20px' }}>No hay registros para mostrar con los filtros actuales.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Progress Overlay for Email Sending */}
      {emailProgress && (
          <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
              <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl p-6 flex flex-col items-center gap-4 text-center">
                  <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 mb-2">
                      <span className="material-symbols-outlined text-3xl animate-pulse">mail</span>
                  </div>
                  <h3 className="text-lg font-bold text-slate-900">Enviando Notificaciones</h3>
                  <p className="text-sm text-slate-600">{emailProgress.message}</p>
                  
                  <div className="w-full bg-slate-100 rounded-full h-3 mb-2 overflow-hidden border border-slate-200">
                      <div 
                          className="bg-blue-600 h-3 rounded-full transition-all duration-300 ease-out" 
                          style={{ width: `${(emailProgress.current / emailProgress.total) * 100}%` }}
                      ></div>
                  </div>
                  
                  <div className="flex justify-between w-full text-xs font-bold text-slate-500">
                      <span>{emailProgress.current} enviados</span>
                      <span>{emailProgress.total} total</span>
                  </div>
              </div>
          </div>
      )}

      <ScheduleBuilderModal
          isOpen={scheduleBuilderOpen}
          onClose={() => setScheduleBuilderOpen(false)}
          users={scheduleBuilderUsers}
          cargo={scheduleBuilderCargo}
          procesoName={scheduleBuilderProcesoName}
          procesoId={selectedSorteoProceso}
      />

    </div>
  );
};
