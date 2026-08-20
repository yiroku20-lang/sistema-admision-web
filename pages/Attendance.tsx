
import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';
import { User, ToastMessage, AttendanceRecord } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import Papa from 'papaparse';

interface AttendanceProps {
  user: User;
  notify: (msg: string, type?: ToastMessage['type']) => void;
}

export const Attendance: React.FC<AttendanceProps> = ({ user, notify }) => {
  const getLocalDateString = () => {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  };

  const [dniInput, setDniInput] = useState('');
  const [todayRecords, setTodayRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastMarkedUser, setLastMarkedUser] = useState<{ name: string; type: string; time: string } | null>(null);
  const [activeTab, setActiveTab] = useState<'kiosk' | 'history'>('kiosk');
  
  // History filters
  const [filterDateStart, setFilterDateStart] = useState(getLocalDateString());
  const [filterDateEnd, setFilterDateEnd] = useState(getLocalDateString());
  const [historyRecords, setHistoryRecords] = useState<AttendanceRecord[]>([]);
  const [isSearchingHistory, setIsSearchingHistory] = useState(false);

  // Manual regularization
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [manualForm, setManualForm] = useState({
      dni: '',
      tipo: 'INGRESO' as 'INGRESO' | 'SALIDA',
      fecha: getLocalDateString(),
      hora: new Date().toLocaleTimeString('en-GB', { hour12: false }).substring(0, 5)
  });

  const [reportDateStart, setReportDateStart] = useState(getLocalDateString());
  const [reportDateEnd, setReportDateEnd] = useState(getLocalDateString());
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [selectedUserForReport, setSelectedUserForReport] = useState<any | null>(null);
  const [individualHistory, setIndividualHistory] = useState<any[]>([]);
  const [reportTotalHours, setReportTotalHours] = useState('00:00');
  const [recordToDelete, setRecordToDelete] = useState<string | null>(null);
  
  // CSV Import
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchTodayRecords();
    const interval = setInterval(() => {
        if (activeTab === 'kiosk' && !isManualModalOpen && !isReportModalOpen) {
            inputRef.current?.focus();
        }
    }, 1000);
    return () => clearInterval(interval);
  }, [activeTab, isManualModalOpen, isReportModalOpen]);

  useEffect(() => {
    if (!selectedUserForReport?.id) return;
    
    const fetchFirstRecordDate = async () => {
      try {
        const { data, error } = await supabase
          .from('asistencia')
          .select('fecha')
          .is('proceso_id', null)
          .or(`user_id.eq.${selectedUserForReport.id},dni.eq.${selectedUserForReport.dni}`)
          .order('fecha', { ascending: true })
          .limit(1);
          
        if (!error && data && data.length > 0) {
          setReportDateStart(data[0].fecha);
        }
      } catch (err) {
        console.error("Error fetching first record date", err);
      }
    };
    
    fetchFirstRecordDate();
  }, [selectedUserForReport?.id, selectedUserForReport?.dni]);

  const handleCSVImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        try {
          const rows = results.data as any[];
          if (rows.length === 0) {
            notify('El archivo CSV está vacío', 'error');
            setIsImporting(false);
            return;
          }

          // Fetch all users to map DNI to user_id
          const { data: users, error: userError } = await supabase.from('usuarios').select('id, dni');
          if (userError) throw userError;

          const userMap = new Map();
          users?.forEach(u => userMap.set(u.dni?.toString().trim(), u.id));

          const recordsToInsert: any[] = [];
          const errors: string[] = [];

          // Helper to parse Spanish date/time strings: "18/08/2025 09:10:44 p. m."
          const parseComplexDateTime = (str: string) => {
            if (!str) return null;
            // Normalize: remove weird characters and dots
            const clean = str.toLowerCase().trim();
            if (!clean) return null;

            // Robust AM/PM detection
            const isPM = /p\.?\s*m\.?/i.test(clean);
            const isAM = /a\.?\s*m\.?/i.test(clean);

            const parts = clean.split(' ');
            if (parts.length < 2) return null;

            const datePart = parts[0]; 
            const timePart = parts[1]; 
            
            // Convert DD/MM/YYYY to YYYY-MM-DD
            const dateBits = datePart.split('/');
            let isoDate = datePart;
            if (dateBits.length === 3) {
              isoDate = `${dateBits[2]}-${dateBits[1].padStart(2, '0')}-${dateBits[0].padStart(2, '0')}`;
            }

            // Handle Hour
            const timeBits = timePart.split(':');
            let hours = parseInt(timeBits[0]);
            const mins = (timeBits[1] || '00').substring(0, 2);
            const secs = (timeBits[2] || '00').substring(0, 2);

            if (isPM && hours < 12) hours += 12;
            if (isAM && hours === 12) hours = 0;

            const finalTime = `${hours.toString().padStart(2, '0')}:${mins}:${secs}`;
            
            try {
              const dt = new Date(`${isoDate}T${finalTime}`);
              return { 
                fecha: isoDate, 
                hora: finalTime, 
                timestamp: !isNaN(dt.getTime()) ? dt.toISOString() : new Date().toISOString()
              };
            } catch (e) {
              return null;
            }
          };

          for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            // Normalize keys to lowercase for flexible matching
            const normalizedRow: any = {};
            Object.keys(row).forEach(k => normalizedRow[k.toLowerCase().trim()] = row[k]);

            const dni = (normalizedRow.dni || normalizedRow.documento || '').toString().trim();
            const userId = userMap.get(dni);
            
            if (!dni) continue;
            if (!userId) {
              errors.push(`Fila ${i + 2}: DNI ${dni} no encontrado en usuarios`);
              continue;
            }

            // CASE 1: Standard Single Record (tipo, fecha, hora)
            if (normalizedRow.tipo && normalizedRow.fecha && normalizedRow.hora) {
              const parsed = parseComplexDateTime(`${normalizedRow.fecha} ${normalizedRow.hora}`) || {
                fecha: normalizedRow.fecha,
                hora: normalizedRow.hora.includes(':') ? (normalizedRow.hora.split(':').length === 2 ? normalizedRow.hora + ':00' : normalizedRow.hora) : normalizedRow.hora,
                timestamp: new Date().toISOString()
              };

              recordsToInsert.push({
                user_id: userId,
                dni: dni,
                tipo: normalizedRow.tipo.toUpperCase(),
                fecha: parsed.fecha,
                hora: parsed.hora,
                timestamp: parsed.timestamp
              });
            } 
            // CASE 2: Multi-column Row (ingreso AND salida in same row)
            else if (normalizedRow.ingreso || normalizedRow.salida) {
              if (normalizedRow.ingreso) {
                const dataIn = parseComplexDateTime(normalizedRow.ingreso);
                if (dataIn) {
                  recordsToInsert.push({
                    user_id: userId,
                    dni: dni,
                    tipo: 'INGRESO',
                    fecha: dataIn.fecha,
                    hora: dataIn.hora,
                    timestamp: dataIn.timestamp
                  });
                }
              }
              if (normalizedRow.salida) {
                const dataOut = parseComplexDateTime(normalizedRow.salida);
                if (dataOut) {
                  recordsToInsert.push({
                    user_id: userId,
                    dni: dni,
                    tipo: 'SALIDA',
                    fecha: dataOut.fecha,
                    hora: dataOut.hora,
                    timestamp: dataOut.timestamp
                  });
                }
              }
            } else {
              errors.push(`Fila ${i + 2}: Formato no reconocido (Faltan columnas ingreso/salida o dni/tipo/fecha/hora)`);
            }
          }

          if (recordsToInsert.length > 0) {
            const { error: insertError } = await supabase.from('asistencia').insert(recordsToInsert);
            if (insertError) throw insertError;
            
            notify(`¡Éxito! Se procesaron ${recordsToInsert.length} marcas de asistencia.`, 'success');
            if (errors.length > 0) {
              notify(`Hubo ${errors.length} filas con errores (ver consola).`, 'warning');
              console.warn('Errores de importación:', errors);
            }
            fetchTodayRecords();
            fetchHistory();
            setIsImportModalOpen(false);
          } else {
            notify('No se pudo importar ningún dato. Verifique el formato.', 'error');
            if (errors.length > 0) console.error('Errores:', errors);
          }
        } catch (err: any) {
          notify(`Error crítico: ${err.message}`, 'error');
        } finally {
          setIsImporting(false);
          e.target.value = '';
        }
      },
      error: (error) => {
        notify(`Error al leer CSV: ${error.message}`, 'error');
        setIsImporting(false);
      }
    });
  };

  const fetchTodayRecords = async () => {
    const today = getLocalDateString();
    const { data, error } = await supabase
      .from('asistencia')
      .select('*, usuarios(name)')
      .is('proceso_id', null)
      .eq('fecha', today)
      .order('timestamp', { ascending: false });
    
    if (error) {
      console.error("Error fetching attendance:", error);
    } else {
      setTodayRecords(data || []);
    }
  };

  const fetchHistory = async () => {
    setIsSearchingHistory(true);
    try {
      const { data, error } = await supabase
        .from('asistencia')
        .select('*, usuarios(name)')
        .is('proceso_id', null)
        .gte('fecha', filterDateStart)
        .lte('fecha', filterDateEnd)
        .order('timestamp', { ascending: false });

      if (error) throw error;
      setHistoryRecords(data || []);
    } catch (err: any) {
      notify(err.message, 'error');
    } finally {
      setIsSearchingHistory(false);
    }
  };

  const fetchAllUsers = async () => {
    const { data } = await supabase.from('usuarios').select('id, name, dni').order('name');
    setAllUsers(data || []);
  };

  const generateIndividualReport = async () => {
    if (!selectedUserForReport) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('asistencia')
        .select('*')
        .is('proceso_id', null)
        .or(`user_id.eq.${selectedUserForReport.id},dni.eq.${selectedUserForReport.dni}`)
        .gte('fecha', reportDateStart)
        .lte('fecha', reportDateEnd)
        .order('timestamp', { ascending: true });

      if (error) throw error;

      // Logic: Group by date
      const grouped: { [key: string]: { ingreso?: string, salida?: string, hours?: string } } = {};
      
      data?.forEach(rec => {
          if (!grouped[rec.fecha]) grouped[rec.fecha] = {};
          if (rec.tipo === 'INGRESO' && !grouped[rec.fecha].ingreso) grouped[rec.fecha].ingreso = rec.hora;
          if (rec.tipo === 'SALIDA') grouped[rec.fecha].salida = rec.hora;
      });

      let totalMinutes = 0;
      const finalLines = Object.keys(grouped).sort().map(date => {
          const { ingreso, salida } = grouped[date];
          let diffStr = '--';
          
          if (ingreso && salida) {
              const [h1, m1] = ingreso.split(':').map(Number);
              const [h2, m2] = salida.split(':').map(Number);
              const min1 = h1 * 60 + m1;
              const min2 = h2 * 60 + m2;
              const diffMin = min2 - min1;
              if (diffMin > 0) {
                  totalMinutes += diffMin;
                  const hh = Math.floor(diffMin / 60);
                  const mm = diffMin % 60;
                  diffStr = `${hh}:${mm.toString().padStart(2, '0')}`;
              }
          }
          
          return { date, ingreso, salida, diff: diffStr };
      });

      setIndividualHistory(finalLines);
      const totalHH = Math.floor(totalMinutes / 60);
      const totalMM = totalMinutes % 60;
      setReportTotalHours(`${totalHH}:${totalMM.toString().padStart(2, '0')}`);

    } catch (err: any) {
        notify(err.message, 'error');
    } finally {
        setLoading(false);
    }
  };

  const downloadIndividualPDF = () => {
      const doc = new jsPDF();
      doc.setFontSize(18);
      doc.text("REPORTE DE ASISTENCIA INDIVIDUAL", 14, 22);
      doc.setFontSize(11);
      doc.text(`Personal: ${selectedUserForReport?.name}`, 14, 32);
      doc.text(`DNI: ${selectedUserForReport?.dni}`, 14, 38);
      doc.text(`Periodo: ${filterDateStart} al ${filterDateEnd}`, 14, 44);
      doc.text(`Total Horas Acumuladas: ${reportTotalHours} horas`, 14, 50);

      const tableData = individualHistory.map(h => [
          h.date,
          h.ingreso || 'SIN MARCA',
          h.salida || 'SIN MARCA',
          h.diff
      ]);

      autoTable(doc, {
          startY: 60,
          head: [['Fecha', 'Ingreso', 'Salida', 'Hrs Trabajadas']],
          body: tableData,
          theme: 'striped',
          headStyles: { fillColor: [123, 21, 35] }
      });

      doc.save(`Asistencia_${selectedUserForReport?.dni}_${filterDateStart}.pdf`);
  };

  const handleMarkAttendance = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!dniInput.trim() || loading) return;

    setLoading(true);
    try {
      // 1. Verificar si el usuario existe
      const { data: userData, error: userError } = await supabase
        .from('usuarios')
        .select('id, name')
        .eq('dni', dniInput.trim())
        .single();

      if (userError || !userData) {
        notify('DNI no registrado en el sistema de usuarios.', 'error');
        setDniInput('');
        return;
      }

      // 2. Determinar si es INGRESO o SALIDA (basado en el último registro del día)
      const today = getLocalDateString();
      const { data: lastRecord } = await supabase
        .from('asistencia')
        .select('tipo')
        .is('proceso_id', null)
        .eq('user_id', userData.id)
        .eq('fecha', today)
        .order('timestamp', { ascending: false })
        .limit(1);

      const nextType = (!lastRecord || lastRecord.length === 0 || lastRecord[0].tipo === 'SALIDA') 
        ? 'INGRESO' 
        : 'SALIDA';

      const now = new Date();
      const timeStr = now.toLocaleTimeString('en-GB', { hour12: false });

      // 3. Registrar
      const { error: markError } = await supabase
        .from('asistencia')
        .insert([{
          user_id: userData.id,
          dni: dniInput.trim(),
          tipo: nextType,
          fecha: today,
          hora: timeStr,
          timestamp: now.toISOString()
        }]);

      if (markError) throw markError;

      setLastMarkedUser({
        name: userData.name,
        type: nextType,
        time: timeStr.substring(0, 5)
      });

      notify(`${nextType} registrado para ${userData.name}`, 'success');
      setDniInput('');
      fetchTodayRecords();

      // Clear last marked after 5 seconds
      setTimeout(() => setLastMarkedUser(null), 5000);

    } catch (err: any) {
      notify(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleManualSave = async () => {
      if (!manualForm.dni || !manualForm.fecha || !manualForm.hora) return;
      setLoading(true);
      try {
          // Verify user
          const { data: userData, error: userError } = await supabase
            .from('usuarios')
            .select('id, name')
            .eq('dni', manualForm.dni.trim())
            .single();

          if (userError || !userData) {
              notify('DNI no encontrado.', 'error');
              return;
          }

          let finalTimestamp = new Date().toISOString();
          try {
              // Ensure hora is exactly HH:mm formatting
              const cleanHora = manualForm.hora.substring(0, 5);
              const localDateObj = new Date(`${manualForm.fecha}T${cleanHora}:00`);
              if (!isNaN(localDateObj.getTime())) {
                  finalTimestamp = localDateObj.toISOString();
              }
          } catch(e) {}

          const { error } = await supabase.from('asistencia').insert([{
              user_id: userData.id,
              dni: manualForm.dni.trim(),
              tipo: manualForm.tipo,
              fecha: manualForm.fecha,
              hora: manualForm.hora.substring(0, 5) + ':00',
              timestamp: finalTimestamp
          }]);

          if (error) throw error;
          
          const todayStr = getLocalDateString();
          if (manualForm.fecha === todayStr) {
             notify('Registro manual exitoso. Se refleja en Actividad de Hoy.', 'success');
          } else {
             notify(`Registro Exitoso para la fecha: ${manualForm.fecha}. Revise en Histórico.`, 'success');
          }
          
          setIsManualModalOpen(false);
          if (activeTab === 'kiosk') {
              fetchTodayRecords();
          } else {
              fetchHistory();
          }
          
          // Reset form to avoid accidentaly saving same state
          setManualForm({
            dni: '',
            tipo: 'INGRESO',
            fecha: todayStr,
            hora: new Date().toLocaleTimeString('en-GB', { hour12: false }).substring(0, 5)
          });
      } catch (err: any) {
          notify(err.message, 'error');
      } finally {
          setLoading(false);
      }
  };

  return (
    <div className="flex-1 w-full max-w-[1600px] mx-auto p-4 md:p-6 lg:p-8 flex flex-col gap-6 h-full overflow-hidden">
      
      {/* Header */}
      <div className="flex flex-wrap justify-between items-end gap-4 shrink-0">
        <div className="flex flex-col gap-2">
            <h1 className="text-slate-900 text-3xl font-black leading-tight flex items-center gap-3">
                <span className="material-symbols-outlined text-primary text-4xl">fingerprint</span>
                Control de Asistencia
            </h1>
            <p className="text-slate-500 text-sm font-medium uppercase tracking-widest">Registro de ingresos y salidas del personal</p>
        </div>
        <div className="flex bg-slate-200 p-1 rounded-xl shadow-inner shrink-0">
            <button 
                onClick={() => setActiveTab('kiosk')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${activeTab === 'kiosk' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
                <span className="material-symbols-outlined text-[18px]">nest_remote</span>
                Modo Marcado
            </button>
            <button 
                onClick={() => { setActiveTab('history'); fetchHistory(); }}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${activeTab === 'history' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
                <span className="material-symbols-outlined text-[18px]">history</span>
                Reportes / Historial
            </button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden flex flex-col gap-6">
        {activeTab === 'kiosk' ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-full overflow-hidden">
            
            {/* Kiosk Left Column */}
            <div className="lg:col-span-12 xl:col-span-8 flex flex-col gap-6 overflow-hidden">
                <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-8 md:p-12 flex flex-col items-center justify-center text-center relative overflow-hidden h-full">
                    <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-primary to-indigo-600"></div>
                    
                    <div className="mb-8">
                        <div className="size-24 rounded-full bg-slate-50 border border-slate-100 flex items-center justify-center mx-auto mb-4 shadow-inner">
                            <span className="material-symbols-outlined text-slate-300 text-5xl">qr_code_scanner</span>
                        </div>
                        <h2 className="text-2xl font-black text-slate-900 uppercase">Estación de Marcado</h2>
                        <p className="text-slate-500 font-medium">Use su lector de DNI o ingrese el número manualmente</p>
                    </div>

                    <form onSubmit={handleMarkAttendance} className="w-full max-w-md relative mb-8">
                        <input 
                            ref={inputRef}
                            type="text"
                            value={dniInput}
                            onChange={(e) => setDniInput(e.target.value.replace(/\D/g, '').substring(0, 8))}
                            className="w-full h-20 text-4xl text-center font-black tracking-[0.5em] rounded-2xl border-4 border-slate-100 bg-slate-50 focus:border-primary focus:bg-white focus:ring-0 outline-none transition-all placeholder:text-slate-200"
                            placeholder="DNI"
                            autoFocus
                        />
                        {loading && (
                            <div className="absolute right-4 top-1/2 -translate-y-1/2">
                                <div className="size-8 rounded-full border-4 border-primary/20 border-t-primary animate-spin"></div>
                            </div>
                        )}
                    </form>

                    <div className="flex flex-wrap justify-center gap-4">
                        <button 
                            onClick={handleMarkAttendance}
                            disabled={dniInput.length < 8 || loading}
                            className="h-14 px-10 bg-primary text-white rounded-2xl text-sm font-black uppercase tracking-widest shadow-xl shadow-primary/30 active:scale-95 transition-all disabled:opacity-50 disabled:grayscale"
                        >
                            Marcar Asistencia
                        </button>
                        <button 
                            onClick={() => { fetchAllUsers(); setIsManualModalOpen(true); }}
                            className="h-14 px-10 bg-white border-2 border-slate-100 text-slate-600 rounded-2xl text-sm font-black uppercase tracking-widest hover:bg-slate-50 transition-all active:scale-95"
                        >
                            Regularizar Manual
                        </button>
                    </div>

                    <AnimatePresence>
                        {lastMarkedUser && (
                            <motion.div 
                                initial={{ opacity: 0, y: 50, scale: 0.9 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.9 }}
                                className={`mt-12 p-6 rounded-3xl border-2 flex items-center gap-6 max-w-lg w-full ${lastMarkedUser.type === 'INGRESO' ? 'bg-emerald-50 border-emerald-100 text-emerald-900' : 'bg-amber-50 border-amber-100 text-amber-900'}`}
                            >
                                <div className={`size-16 rounded-2xl flex items-center justify-center shrink-0 ${lastMarkedUser.type === 'INGRESO' ? 'bg-emerald-500' : 'bg-amber-500'} text-white shadow-lg`}>
                                    <span className="material-symbols-outlined text-3xl">
                                        {lastMarkedUser.type === 'INGRESO' ? 'login' : 'logout'}
                                    </span>
                                </div>
                                <div className="text-left flex-1 min-w-0">
                                    <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-60">Marcado Exitoso</p>
                                    <h4 className="text-xl font-black uppercase truncate">{lastMarkedUser.name}</h4>
                                    <div className="flex items-center gap-4 mt-1">
                                        <div className="flex items-center gap-1">
                                            <span className="material-symbols-outlined text-[14px]">event_repeat</span>
                                            <span className="text-xs font-bold uppercase">{lastMarkedUser.type}</span>
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <span className="material-symbols-outlined text-[14px]">schedule</span>
                                            <span className="text-xs font-bold">{lastMarkedUser.time}</span>
                                        </div>
                                    </div>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>

            {/* Kiosk Right Column / Desktop Today's List */}
            <div className="lg:col-span-12 xl:col-span-4 flex flex-col gap-6 overflow-hidden">
                <div className="bg-white rounded-3xl border border-slate-200 shadow-sm flex flex-col h-full overflow-hidden">
                    <div className="p-6 border-b border-slate-100 bg-slate-50 flex justify-between items-center shrink-0">
                        <div className="flex items-center gap-2">
                            <span className="material-symbols-outlined text-slate-400">list_alt</span>
                            <span className="text-xs font-black text-slate-800 uppercase tracking-widest">Actividad de Hoy</span>
                        </div>
                        <span className="bg-primary/10 text-primary px-3 py-1 rounded-full text-[10px] font-black uppercase">{todayRecords.length} MARCAS</span>
                    </div>
                    <div className="flex-1 overflow-y-auto p-2">
                        {todayRecords.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center text-slate-300 p-8 text-center grayscale opacity-50">
                                <span className="material-symbols-outlined text-5xl mb-2">inbox</span>
                                <p className="text-xs font-black uppercase tracking-widest">Sin actividad aún</p>
                            </div>
                        ) : (
                            <div className="space-y-1">
                                {todayRecords.map((record) => (
                                    <div key={record.id} className="p-4 rounded-2xl hover:bg-slate-50 transition-colors border border-transparent hover:border-slate-100 flex items-center justify-between group">
                                        <div className="flex items-center gap-3">
                                            <div className={`size-10 rounded-xl flex items-center justify-center text-white ${record.tipo === 'INGRESO' ? 'bg-emerald-500' : 'bg-amber-500'}`}>
                                                <span className="material-symbols-outlined text-[18px]">{record.tipo === 'INGRESO' ? 'login' : 'logout'}</span>
                                            </div>
                                            <div>
                                                <p className="text-[12px] font-black text-slate-900 uppercase leading-tight">{(record as any).usuarios?.name || 'Usuario'}</p>
                                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">{record.dni}</p>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-sm font-black text-slate-700">{record.hora.substring(0, 5)}</p>
                                            <p className={`text-[9px] font-black uppercase tracking-widest ${record.tipo === 'INGRESO' ? 'text-emerald-600' : 'text-amber-600'}`}>{record.tipo}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
          </div>
        ) : (
          /* HISTORY VIEW */
          <div className="bg-white rounded-3xl shadow-sm border border-slate-200 flex flex-col h-full overflow-hidden">
                <div className="p-6 border-b border-slate-100 bg-slate-50 flex flex-wrap items-center justify-between gap-4 shrink-0">
                    <div className="flex flex-wrap items-center gap-4">
                        <div className="flex flex-col gap-1">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Desde</span>
                            <input 
                                type="date" 
                                value={filterDateStart}
                                onChange={(e) => setFilterDateStart(e.target.value)}
                                className="h-10 px-3 rounded-xl border border-slate-200 bg-white font-bold text-xs focus:ring-2 focus:ring-primary/20 outline-none"
                            />
                        </div>
                        <div className="flex flex-col gap-1">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Hasta</span>
                            <input 
                                type="date" 
                                value={filterDateEnd}
                                onChange={(e) => setFilterDateEnd(e.target.value)}
                                className="h-10 px-3 rounded-xl border border-slate-200 bg-white font-bold text-xs focus:ring-2 focus:ring-primary/20 outline-none"
                            />
                        </div>
                        <button 
                            onClick={fetchHistory}
                            disabled={isSearchingHistory}
                            className="mt-5 h-10 px-6 bg-slate-800 text-white rounded-xl text-xs font-black uppercase tracking-widest active:scale-95 transition-all flex items-center gap-2"
                        >
                            {isSearchingHistory ? <span className="material-symbols-outlined animate-spin text-[18px]">progress_activity</span> : <span className="material-symbols-outlined text-[18px]">search</span>}
                            Filtrar Reporte
                        </button>
                    </div>
                    
                    <div className="flex gap-3 mt-5">
                      <button 
                          onClick={() => { fetchAllUsers(); setIsReportModalOpen(true); }}
                          className="h-10 px-6 bg-indigo-50 border border-indigo-200 text-indigo-700 rounded-xl text-xs font-black uppercase tracking-widest active:scale-95 transition-all flex items-center gap-2"
                      >
                          <span className="material-symbols-outlined text-[18px]">person_search</span>
                          Ficha por Usuario
                      </button>
                      <button 
                          onClick={() => setIsImportModalOpen(true)}
                          className="h-10 px-6 bg-slate-100 border border-slate-200 text-slate-600 rounded-xl text-xs font-black uppercase tracking-widest active:scale-95 transition-all flex items-center gap-2"
                      >
                          <span className="material-symbols-outlined text-[18px]">upload_file</span>
                          Cargar CSV
                      </button>
                      <button 
                          onClick={() => {
                            // Basic Excel Export
                            const headers = ['Fecha', 'Hora', 'DNI', 'Usuario', 'Tipo'];
                            const rows = historyRecords.map(r => [
                                r.fecha,
                                r.hora,
                                r.dni,
                                (r as any).usuarios?.name || 'N/A',
                                r.tipo
                            ]);
                            const csvContent = "data:text/csv;charset=utf-8," 
                                + headers.join(",") + "\n"
                                + rows.map(e => e.join(",")).join("\n");
                            const encodedUri = encodeURI(csvContent);
                            const link = document.createElement("a");
                            link.setAttribute("href", encodedUri);
                            link.setAttribute("download", `asistencia_${filterDateStart}_${filterDateEnd}.csv`);
                            document.body.appendChild(link);
                            link.click();
                            document.body.removeChild(link);
                        }}
                        className="h-10 px-6 bg-emerald-600 text-white rounded-xl text-xs font-black uppercase tracking-widest active:scale-95 transition-all flex items-center gap-2 shadow-lg shadow-emerald-200"
                    >
                        <span className="material-symbols-outlined text-[18px]">download_for_offline</span>
                        Exportar CSV
                    </button>
                </div>
            </div>

                <div className="flex-1 overflow-auto p-6">
                    <table className="w-full text-left border-separate border-spacing-y-2">
                        <thead>
                            <tr className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">
                                <th className="px-6 pb-2">Usuario / DNI</th>
                                <th className="px-6 pb-2">Fecha</th>
                                <th className="px-6 pb-2">Hora</th>
                                <th className="px-6 pb-2">Evento</th>
                                <th className="px-6 pb-2 text-right">Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            {historyRecords.map((record) => (
                                <tr key={record.id} className="group bg-white hover:bg-slate-50 transition-all">
                                    <td className="px-6 py-4 rounded-l-2xl border-y border-l border-slate-100 group-hover:border-slate-200 transition-colors">
                                        <div className="flex items-center gap-3">
                                            <div className="size-10 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center font-black text-xs border border-white group-hover:bg-primary group-hover:text-white transition-all">
                                                {((record as any).usuarios?.name || 'U').charAt(0)}
                                            </div>
                                            <div>
                                                <p className="text-sm font-black text-slate-900 uppercase">{(record as any).usuarios?.name || 'Usuario'}</p>
                                                <p className="text-[10px] font-bold text-slate-400 tracking-widest">{record.dni}</p>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 border-y border-slate-100 group-hover:border-slate-200 font-bold text-slate-600 text-sm">{record.fecha}</td>
                                    <td className="px-6 py-4 border-y border-slate-100 group-hover:border-slate-200 font-bold text-slate-600 text-sm">{record.hora.substring(0, 5)}</td>
                                    <td className="px-6 py-4 border-y border-slate-100 group-hover:border-slate-200">
                                        <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border ${record.tipo === 'INGRESO' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-amber-50 text-amber-600 border-amber-100'}`}>
                                            {record.tipo}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 rounded-r-2xl border-y border-r border-slate-100 group-hover:border-slate-200 text-right">
                                        <button 
                                            onClick={() => setRecordToDelete(record.id)}
                                            className="size-8 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition-all flex items-center justify-center ml-auto"
                                        >
                                            <span className="material-symbols-outlined text-[18px]">delete</span>
                                        </button>
                                    </td>
                                </tr>
                            ))}
                            {historyRecords.length === 0 && !isSearchingHistory && (
                                <tr>
                                    <td colSpan={5} className="py-20 text-center">
                                        <span className="material-symbols-outlined text-6xl text-slate-200 mb-4 block">event_busy</span>
                                        <p className="text-xs font-black text-slate-400 uppercase tracking-widest">No hay registros para este periodo</p>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
          </div>
        )}
      </div>

      {/* Individual Report Modal */}
      {isReportModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in zoom-in-95">
              <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl p-8 max-h-[90vh] flex flex-col">
                  <div className="flex justify-between items-center mb-6">
                      <h3 className="text-xl font-black text-slate-900 uppercase">Ficha de Asistencia Individual</h3>
                      <button onClick={() => { setIsReportModalOpen(false); setSelectedUserForReport(null); setIndividualHistory([]); setReportTotalHours('00:00'); }} className="p-2 text-slate-400 hover:bg-slate-100 rounded-full transition-colors">
                          <span className="material-symbols-outlined">close</span>
                      </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                      <div className="md:col-span-1">
                          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Seleccionar Personal</label>
                          <select 
                            className="w-full h-12 px-4 rounded-xl border-2 border-slate-100 bg-slate-50 outline-none font-bold text-sm mt-1"
                            onChange={(e) => {
                                const user = allUsers.find(u => u.id === e.target.value);
                                setSelectedUserForReport(user);
                            }}
                          >
                              <option value="">Seleccione un usuario...</option>
                              {allUsers.map(u => (
                                  <option key={u.id} value={u.id}>{u.name} ({u.dni})</option>
                              ))}
                          </select>
                      </div>
                      <div className="md:col-span-1">
                          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Fecha Inicio</label>
                          <input 
                              type="date"
                              value={reportDateStart}
                              onChange={e => setReportDateStart(e.target.value)}
                              className="w-full h-12 px-4 rounded-xl border-2 border-slate-100 bg-slate-50 outline-none font-bold text-sm mt-1"
                          />
                      </div>
                      <div className="md:col-span-1">
                          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Fecha Fin</label>
                          <input 
                              type="date"
                              value={reportDateEnd}
                              onChange={e => setReportDateEnd(e.target.value)}
                              className="w-full h-12 px-4 rounded-xl border-2 border-slate-100 bg-slate-50 outline-none font-bold text-sm mt-1"
                          />
                      </div>
                      <div className="md:col-span-1 flex items-end">
                          <button 
                            onClick={generateIndividualReport}
                            disabled={!selectedUserForReport || loading}
                            className="w-full h-12 bg-slate-800 text-white rounded-xl text-xs font-black uppercase tracking-widest active:scale-95 transition-all flex items-center justify-center gap-2"
                          >
                            <span className="material-symbols-outlined text-[18px]">analytics</span>
                            Generar
                          </button>
                      </div>
                  </div>

                  <div className="bg-slate-900 rounded-2xl p-4 flex flex-col justify-center items-center text-white mb-6">
                      <span className="text-[10px] font-black uppercase opacity-60">Horas Acumuladas del Rango</span>
                      <span className="text-2xl font-black text-emerald-400">{reportTotalHours} <span className="text-xs opacity-60">Hrs</span></span>
                  </div>

                  <div className="flex-1 overflow-auto bg-slate-50 rounded-2xl border border-slate-100 p-4">
                      {individualHistory.length === 0 ? (
                          <div className="h-full flex flex-col items-center justify-center text-slate-300 opacity-50 py-10">
                              <span className="material-symbols-outlined text-5xl mb-2">find_in_page</span>
                              <p className="text-xs font-black uppercase tracking-widest">Sin datos generados</p>
                          </div>
                      ) : (
                          <table className="w-full text-left border-separate border-spacing-y-1">
                              <thead>
                                  <tr className="text-[10px] font-black text-slate-400 uppercase">
                                      <th className="px-4 pb-2">Fecha</th>
                                      <th className="px-4 pb-2 text-center">Ingreso</th>
                                      <th className="px-4 pb-2 text-center">Salida</th>
                                      <th className="px-4 pb-2 text-right">Hrs Diarias</th>
                                  </tr>
                              </thead>
                              <tbody>
                                  {individualHistory.map((h, i) => (
                                      <tr key={i} className="bg-white rounded-xl border border-slate-100">
                                          <td className="px-4 py-3 rounded-l-xl font-bold text-slate-700 text-sm">{h.date}</td>
                                          <td className="px-4 py-3 text-center">
                                              {h.ingreso ? <span className="text-emerald-600 font-bold">{h.ingreso.substring(0, 5)}</span> : <span className="text-red-400 italic text-[10px]">Faltante</span>}
                                          </td>
                                          <td className="px-4 py-3 text-center">
                                              {h.salida ? <span className="text-amber-600 font-bold">{h.salida.substring(0, 5)}</span> : <span className="text-red-400 italic text-[10px]">Faltante</span>}
                                          </td>
                                          <td className="px-4 py-3 rounded-r-xl text-right font-black text-slate-900 text-sm">
                                              {h.diff === '--' ? <span className="text-slate-300">--</span> : h.diff}
                                          </td>
                                      </tr>
                                  ))}
                              </tbody>
                          </table>
                      )}
                  </div>

                  {individualHistory.length > 0 && (
                      <div className="mt-6 flex justify-end gap-3 pt-4 border-t border-slate-100">
                          <button 
                            onClick={downloadIndividualPDF}
                            className="h-12 px-6 bg-slate-100 text-slate-700 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-slate-200 transition-all flex items-center gap-2"
                          >
                              <span className="material-symbols-outlined text-[18px]">picture_as_pdf</span>
                              Descargar PDF
                          </button>
                          <button 
                            onClick={() => {
                                // Simple Excel CSV export for individual
                                const headers = ['Fecha', 'Primer Ingreso', 'Ultima Salida', 'Horas'];
                                const rows = individualHistory.map(h => [h.date, h.ingreso || '-', h.salida || '-', h.diff]);
                                const csvContent = "data:text/csv;charset=utf-8," + headers.join(",") + "\n" + rows.map(e => e.join(",")).join("\n");
                                const encodedUri = encodeURI(csvContent);
                                const link = document.createElement("a");
                                link.setAttribute("href", encodedUri);
                                link.setAttribute("download", `Reporte_${selectedUserForReport.dni}.csv`);
                                document.body.appendChild(link);
                                link.click();
                            }}
                            className="h-12 px-6 bg-emerald-600 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-emerald-700 transition-all flex items-center gap-2 shadow-lg shadow-emerald-200"
                          >
                              <span className="material-symbols-outlined text-[18px]">description</span>
                              Exportar Excel
                          </button>
                      </div>
                  )}
              </div>
          </div>
      )}

      {/* CSV Import Modal */}
      {isImportModalOpen && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in zoom-in-95">
              <div className="bg-white rounded-[32px] shadow-2xl w-full max-w-lg p-8 flex flex-col">
                  <div className="flex justify-between items-center mb-6">
                      <div className="flex items-center gap-3">
                        <div className="size-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                          <span className="material-symbols-outlined">upload_file</span>
                        </div>
                        <h3 className="text-xl font-black text-slate-900 uppercase">Importar Asistencias</h3>
                      </div>
                      <button onClick={() => setIsImportModalOpen(false)} className="p-2 text-slate-400 hover:bg-slate-100 rounded-full transition-colors">
                          <span className="material-symbols-outlined">close</span>
                      </button>
                  </div>

                  <div className="bg-amber-50 border border-amber-100 rounded-2xl p-5 mb-6">
                    <h4 className="text-[10px] font-black text-amber-900 uppercase tracking-widest mb-2 flex items-center gap-2">
                      <span className="material-symbols-outlined text-sm">info</span>
                      Requisitos del Archivo CSV
                    </h4>
                    <p className="text-xs text-amber-800 leading-relaxed mb-4">
                      El sistema detectará automáticamente si usas una fila por cada marca o si incluyes ingreso y salida en la misma fila:
                    </p>
                    <div className="bg-white/50 rounded-xl p-3 font-mono text-[9px] text-amber-900 grid grid-cols-3 gap-2 text-center border border-amber-100 overflow-x-auto">
                      <div className="font-bold underline">dni</div>
                      <div className="font-bold underline">ingreso</div>
                      <div className="font-bold underline">salida</div>
                      <div>72491431</div>
                      <div className="text-[8px]">18/08/2025 09:10 a.m.</div>
                      <div className="text-[8px]">18/08/2025 01:45 p.m.</div>
                    </div>
                    <ul className="mt-4 space-y-1 text-[10px] text-amber-800 font-bold uppercase">
                      <li>• dni: 8 dígitos</li>
                      <li>• ingreso/salida: Acepta formatos con AM/PM</li>
                      <li>• Soporta tipos individuales: dni, tipo, fecha, hora</li>
                    </ul>
                  </div>

                  <div className="relative group">
                    <input 
                        type="file" 
                        accept=".csv"
                        onChange={handleCSVImport}
                        disabled={isImporting}
                        className="hidden"
                        id="csv-upload-input"
                    />
                    <label 
                      htmlFor="csv-upload-input"
                      className={`flex flex-col items-center justify-center p-10 border-2 border-dashed rounded-[32px] cursor-pointer transition-all ${isImporting ? 'bg-slate-50 border-slate-200 opacity-50 cursor-not-allowed' : 'bg-slate-50 border-slate-200 hover:border-primary hover:bg-primary/5'}`}
                    >
                      {isImporting ? (
                        <>
                          <div className="size-12 rounded-full border-4 border-primary/20 border-t-primary animate-spin mb-4"></div>
                          <span className="text-xs font-black text-slate-500 uppercase">Procesando archivo...</span>
                        </>
                      ) : (
                        <>
                          <span className="material-symbols-outlined text-4xl text-slate-300 mb-2 group-hover:text-primary transition-colors">cloud_upload</span>
                          <span className="text-xs font-black text-slate-500 uppercase mb-1">Seleccionar Archivo</span>
                          <span className="text-[10px] text-slate-400 font-bold uppercase">Click para buscar CSV</span>
                        </>
                      )}
                    </label>
                  </div>

                  <p className="text-[10px] text-slate-400 text-center mt-6 font-bold uppercase">Solo los DNI registrados en el sistema serán importados.</p>
              </div>
          </div>
      )}

      {/* Manual Regularization Modal */}
      {isManualModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in zoom-in-95">
              <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-8">
                  <div className="flex justify-between items-center mb-6">
                      <h3 className="text-xl font-black text-slate-900 uppercase">Regularizar Marcado</h3>
                      <button onClick={() => setIsManualModalOpen(false)} className="p-2 text-slate-400 hover:bg-slate-100 rounded-full transition-colors">
                          <span className="material-symbols-outlined">close</span>
                      </button>
                  </div>

                  <div className="flex flex-col gap-4">
                      <div>
                          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Seleccionar Personal</label>
                          <select 
                                value={manualForm.dni}
                                onChange={e => setManualForm({...manualForm, dni: e.target.value})}
                                className="w-full h-12 px-4 rounded-xl border-2 border-slate-100 bg-slate-50 focus:border-primary focus:bg-white outline-none font-bold text-sm mt-1"
                          >
                              <option value="">Selecciones un usuario...</option>
                              {allUsers.map(u => (
                                  <option key={u.id} value={u.dni}>{u.name} ({u.dni})</option>
                              ))}
                          </select>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                          <div className="col-span-2">
                              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Tipo de Movimiento</label>
                              <div className="flex bg-slate-100 p-1 rounded-xl mt-1">
                                  <button onClick={() => setManualForm({...manualForm, tipo: 'INGRESO'})} className={`flex-1 h-10 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${manualForm.tipo === 'INGRESO' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500'}`}>Ingreso</button>
                                  <button onClick={() => setManualForm({...manualForm, tipo: 'SALIDA'})} className={`flex-1 h-10 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${manualForm.tipo === 'SALIDA' ? 'bg-white text-amber-600 shadow-sm' : 'text-slate-500'}`}>Salida</button>
                              </div>
                          </div>
                          <div>
                              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Fecha</label>
                              <input 
                                type="date"
                                value={manualForm.fecha}
                                onChange={e => setManualForm({...manualForm, fecha: e.target.value})}
                                className="w-full h-12 px-4 rounded-xl border-2 border-slate-100 bg-slate-50 focus:border-primary focus:bg-white outline-none font-bold transition-all mt-1"
                              />
                          </div>
                          <div>
                              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Hora</label>
                              <input 
                                type="time"
                                value={manualForm.hora}
                                onChange={e => setManualForm({...manualForm, hora: e.target.value})}
                                className="w-full h-12 px-4 rounded-xl border-2 border-slate-100 bg-slate-50 focus:border-primary focus:bg-white outline-none font-bold transition-all mt-1"
                              />
                          </div>
                      </div>

                      <button 
                        onClick={handleManualSave}
                        disabled={loading || !manualForm.dni}
                        className="w-full h-14 bg-slate-800 text-white rounded-2xl text-xs font-black uppercase tracking-widest shadow-xl shadow-slate-200 mt-4 active:scale-95 transition-all"
                      >
                        {loading ? 'Guardando...' : 'Registrar Manualmente'}
                      </button>
                  </div>
              </div>
          </div>
      )}

    </div>
  );
};
