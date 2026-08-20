
import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Link } from 'react-router-dom';
import { CalendarEvent, LoanRecord, Resignation, PaymentRegistry, User } from '../types';
import { format, isAfter, isBefore, addDays, parseISO, startOfDay, isSameDay } from 'date-fns';
import { es } from 'date-fns/locale';

const getProcesoColor = (proceso: string | undefined, defaultColor: string | undefined) => {
    if (!proceso) return defaultColor || '#6366f1';
    const colors = ['#f43f5e', '#ec4899', '#d946ef', '#a855f7', '#8b5cf6', '#6366f1', '#3b82f6', '#0ea5e9', '#06b6d4', '#14b8a6', '#10b981', '#22c55e', '#84cc16', '#eab308', '#f59e0b', '#f97316'];
    let hash = 0;
    for (let i = 0; i < proceso.length; i++) {
        hash = proceso.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
};

export const Dashboard: React.FC<{ user: User | null }> = ({ user }) => {
  const [loading, setLoading] = useState(true);
  
  // Data
  const [upcomingEvents, setUpcomingEvents] = useState<CalendarEvent[]>([]);
  const [overdueLoans, setOverdueLoans] = useState<LoanRecord[]>([]);
  const [pendingResignations, setPendingResignations] = useState<Resignation[]>([]);
  const [pendingTransfers, setPendingTransfers] = useState<PaymentRegistry[]>([]);
  const [upcomingReservationsCount, setUpcomingReservationsCount] = useState(0);
  const [upcomingSemesterStr, setUpcomingSemesterStr] = useState<string>('');
  const [reservationCounts, setReservationCounts] = useState<{semester: string, count: number}[]>([]);
  const [assignedFilesCount, setAssignedFilesCount] = useState(0);

  useEffect(() => {
    fetchDashboardData();
  }, [user]);

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      const today = startOfDay(new Date());

      // 0. Expedientes Asignados Pendientes
      if (user?.id) {
        try {
          const { data: assignedData } = await supabase
            .from('expedientes')
            .select('id')
            .eq('assigned_to', user.id)
            .eq('assignment_status', 'pending');
          if (assignedData) {
            setAssignedFilesCount(assignedData.length);
          }
        } catch (err) {
          console.error("Error fetching assigned files:", err);
        }
      }


      // 1. Eventos Próximos (Desde hoy, próximos 30 días o los siguientes 5 eventos)
      const { data: eventsData } = await supabase
        .from('eventos')
        .select('*')
        .gte('start_date', today.toISOString())
        .order('start_date', { ascending: true })
        .limit(10);
      
      if (eventsData) setUpcomingEvents(eventsData);

      // 2. Préstamos Vencidos (estado_prestamo = 'Vencido' o fecha_limite < today y estado_prestamo = 'Activo')
      const { data: loansData } = await supabase
        .from('prestamos')
        .select(`*, inventario_bienes(*)`)
        .in('estado_prestamo', ['Vencido', 'Activo']);
      
      if (loansData) {
          const overdue = loansData.filter(loan => {
              if (loan.estado_prestamo === 'Vencido') return true;
              if (loan.fecha_limite) {
                  return isBefore(parseISO(loan.fecha_limite), today);
              }
              return false;
          });
          setOverdueLoans(overdue);
      }

      // 3. Renuncias Pendientes
      const { data: resignationsData } = await supabase
        .from('renuncias')
        .select('*')
        .neq('status', 'Finalizado');
      
      if (resignationsData) setPendingResignations(resignationsData);

      // 4. Transferencias por Notificar (status === 'Finalizado', type === 'TRANSFERENCIA', transfer_notified !== true)
      const { data: transfersData } = await supabase
        .from('padron_pagos')
        .select('*')
        .eq('status', 'Finalizado')
        .eq('type', 'TRANSFERENCIA')
        .not('transfer_notified', 'is', true);
      
      if (transfersData) {
          setPendingTransfers(transfersData);
      }

      // 5. Reservas Próximas
      const { data: reservationsData } = await supabase
        .from('reserva_vacantes_detalles')
        .select('starting_semester')
        .eq('is_withdrawn', false);
      
      if (reservationsData && reservationsData.length > 0) {
          const currentYear = new Date().getFullYear().toString();
          const futureReservations = reservationsData.filter(r => r.starting_semester && r.starting_semester.localeCompare(currentYear) >= 0);
          
          if (futureReservations.length > 0) {
              const counts: Record<string, number> = {};
              futureReservations.forEach(r => {
                  counts[r.starting_semester] = (counts[r.starting_semester] || 0) + 1;
              });
              const nearestSemester = Object.keys(counts).sort()[0];
              setUpcomingSemesterStr(nearestSemester);
              setUpcomingReservationsCount(counts[nearestSemester]);
              
              const sortedCounts = Object.keys(counts).sort().map(k => ({ semester: k, count: counts[k] }));
              setReservationCounts(sortedCounts);
          } else {
              setUpcomingSemesterStr('Próximas');
              setUpcomingReservationsCount(0);
              setReservationCounts([]);
          }
      } else {
          setUpcomingSemesterStr('Próximas');
          setUpcomingReservationsCount(0);
          setReservationCounts([]);
      }

    } catch (e) {
      console.error("Error fetching dashboard data", e);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
      return (
          <div className="flex-1 flex flex-col items-center justify-center p-20">
              <span className="material-symbols-outlined text-5xl text-primary animate-spin mb-4">progress_activity</span>
              <p className="text-slate-400 font-black uppercase tracking-widest text-xs">Cargando Panel de Control...</p>
          </div>
      );
  }

  const hasAgendaAccess = user?.role === 'Administrador' || (user?.role === 'Operador' && user?.permissions?.includes('view_agenda'));
  const hasLoansAccess = user?.role === 'Administrador' || (user?.role === 'Operador' && user?.permissions?.includes('view_prestamos'));
  const hasReservationAccess = user?.role === 'Administrador' || (user?.role === 'Operador' && user?.permissions?.includes('view_reserva'));
  const hasResignationsAccess = user?.role === 'Administrador' || (user?.role === 'Operador' && user?.permissions?.includes('view_renuncias'));

  return (
    <div className="flex flex-col gap-8 max-w-[1600px] mx-auto w-full p-6 md:p-8 font-sans">
      
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div className="flex flex-col gap-2">
            <h1 className="text-slate-900 text-3xl md:text-4xl font-black leading-tight tracking-tight uppercase">
              Panel de Control
            </h1>
            <p className="text-slate-500 text-base font-medium">Resumen general y estado de operaciones</p>
          </div>
      </div>

      {/* EXPEDIENTES ASIGNADOS ALERT BANNER */}
      {assignedFilesCount > 0 && (
          <Link 
              to="/incoming?filter=Asignados%20a%20M%C3%AD" 
              className="bg-gradient-to-r from-orange-500 to-amber-500 text-white p-6 rounded-3xl flex items-center justify-between gap-6 hover:shadow-xl hover:-translate-y-0.5 transition-all shadow-lg active:scale-[0.99] animate-in fade-in slide-in-from-top-4 duration-500"
          >
              <div className="flex flex-col sm:flex-row sm:items-center gap-5">
                  <div className="size-14 bg-white/10 backdrop-blur-md rounded-2xl flex items-center justify-center text-3xl shrink-0">
                      <span className="material-symbols-outlined text-white font-black">assignment</span>
                  </div>
                  <div>
                      <h4 className="font-black text-lg tracking-tight">Tienes expedientes pendientes asignados</h4>
                      <p className="text-white/80 text-xs font-semibold uppercase tracking-wider mt-0.5">Tienes {assignedFilesCount} {assignedFilesCount === 1 ? 'expediente' : 'expedientes'} esperando tu revisión o atención en el sistema.</p>
                  </div>
              </div>
              <div className="flex items-center gap-2 bg-white text-orange-600 px-5 py-2.5 rounded-xl font-black text-xs uppercase tracking-wider shadow-md shrink-0">
                  <span>ATENDER</span>
                  <span className="material-symbols-outlined text-sm">arrow_forward</span>
              </div>
          </Link>
      )}

      {/* STAT CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
          
          {hasAgendaAccess ? (
              <Link to="/calendar" className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex items-center gap-6 hover:shadow-lg hover:-translate-y-1 transition-all group">
                  <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-4xl shrink-0 bg-indigo-50 text-indigo-600 group-hover:scale-110 transition-transform">
                      <span className="material-symbols-outlined">event</span>
                  </div>
                  <div>
                      <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest leading-tight mb-1">Eventos<br/>Próximos</p>
                      <p className="text-3xl font-black text-slate-900 leading-none">{upcomingEvents.length}</p>
                  </div>
              </Link>
          ) : (
              <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100 shadow-none flex items-center gap-6 opacity-70">
                  <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-4xl shrink-0 bg-slate-200 text-slate-400">
                      <span className="material-symbols-outlined">lock</span>
                  </div>
                  <div>
                      <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest leading-tight mb-1">Agenda de<br/>Eventos</p>
                      <p className="text-xs font-bold text-slate-500 leading-none mt-2">Sin Acceso</p>
                  </div>
              </div>
          )}

          {hasLoansAccess ? (
              <Link to="/loans" className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex items-center gap-6 hover:shadow-lg hover:-translate-y-1 transition-all group">
                  <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-4xl shrink-0 bg-red-50 text-red-600 group-hover:scale-110 transition-transform">
                      <span className="material-symbols-outlined">warning</span>
                  </div>
                  <div>
                      <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest leading-tight mb-1">Préstamos<br/>Vencidos</p>
                      <p className="text-3xl font-black text-slate-900 leading-none">{overdueLoans.length}</p>
                  </div>
              </Link>
          ) : (
              <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100 shadow-none flex items-center gap-6 opacity-70">
                  <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-4xl shrink-0 bg-slate-200 text-slate-400">
                      <span className="material-symbols-outlined">lock</span>
                  </div>
                  <div>
                      <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest leading-tight mb-1">Control de<br/>Préstamos</p>
                      <p className="text-xs font-bold text-slate-500 leading-none mt-2">Sin Acceso</p>
                  </div>
              </div>
          )}

          {hasReservationAccess ? (
              <Link to="/vacancy" className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex items-center gap-6 hover:shadow-lg hover:-translate-y-1 transition-all group">
                  <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-4xl shrink-0 bg-blue-50 text-blue-600 group-hover:scale-110 transition-transform">
                      <span className="material-symbols-outlined">event_seat</span>
                  </div>
                  <div>
                      <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest leading-tight mb-1">Reservas<br/>{upcomingSemesterStr || 'Próximas'}</p>
                      <p className="text-3xl font-black text-slate-900 leading-none">{upcomingReservationsCount}</p>
                  </div>
              </Link>
          ) : (
              <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100 shadow-none flex items-center gap-6 opacity-70">
                  <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-4xl shrink-0 bg-slate-200 text-slate-400">
                      <span className="material-symbols-outlined">lock</span>
                  </div>
                  <div>
                      <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest leading-tight mb-1">Reservas de<br/>Vacantes</p>
                      <p className="text-xs font-bold text-slate-500 leading-none mt-2">Sin Acceso</p>
                  </div>
              </div>
          )}

          {hasResignationsAccess ? (
              <Link to="/resignations" className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex items-center gap-6 hover:shadow-lg hover:-translate-y-1 transition-all group">
                  <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-4xl shrink-0 bg-emerald-50 text-emerald-600 group-hover:scale-110 transition-transform">
                      <span className="material-symbols-outlined">how_to_reg</span>
                  </div>
                  <div>
                      <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest leading-tight mb-1">Renuncias<br/>Pendientes</p>
                      <p className="text-3xl font-black text-slate-900 leading-none">{pendingResignations.length}</p>
                  </div>
              </Link>
          ) : (
              <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100 shadow-none flex items-center gap-6 opacity-70">
                  <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-4xl shrink-0 bg-slate-200 text-slate-400">
                      <span className="material-symbols-outlined">lock</span>
                  </div>
                  <div>
                      <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest leading-tight mb-1">Control de<br/>Renuncias</p>
                      <p className="text-xs font-bold text-slate-500 leading-none mt-2">Sin Acceso</p>
                  </div>
              </div>
          )}

      </div>

      {/* DETAILS PANELS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 animate-in fade-in slide-in-from-bottom-8 duration-700">
          
          {/* Panel: Upcoming Events */}
          {hasAgendaAccess ? (
          <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm flex flex-col h-[500px] lg:h-[800px]">
              <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                  <div>
                      <h3 className="text-lg font-black text-slate-900 uppercase">Agenda de Eventos</h3>
                      <p className="text-xs font-semibold text-slate-500">Próximas actividades programadas</p>
                  </div>
                  <Link to="/calendar" className="text-indigo-600 bg-indigo-50 hover:bg-indigo-100 p-2 rounded-xl transition-colors shrink-0">
                      <span className="material-symbols-outlined block">open_in_new</span>
                  </Link>
              </div>
              <div className="p-6 flex-1 overflow-y-auto">
                  {upcomingEvents.length === 0 ? (
                      <div className="h-full flex flex-col items-center justify-center text-slate-400">
                          <span className="material-symbols-outlined text-4xl mb-2">event_busy</span>
                          <p className="font-bold text-sm">No hay eventos próximos registrados</p>
                      </div>
                  ) : (
                      <div className="relative border-l border-slate-200 ml-4 space-y-8">
                          {upcomingEvents.map((ev, i) => {
                              const eventColor = getProcesoColor(ev.proceso, ev.color);
                              const isToday = isSameDay(parseISO(ev.start_date), new Date());
                              return (
                              <div key={ev.id} className="relative pl-6">
                                  <div className={`absolute -left-1.5 top-1.5 w-3 h-3 rounded-full border-2 border-white ${isToday ? 'animate-pulse' : ''}`} style={{ backgroundColor: eventColor }}></div>
                                  <div 
                                    className={`p-4 rounded-2xl border transition-colors flex flex-col md:flex-row md:items-center justify-between gap-4 ${isToday ? 'border-transparent text-white shadow-md' : 'bg-slate-50 border-slate-100 hover:border-slate-300'}`}
                                    style={isToday ? { backgroundColor: eventColor } : {}}
                                  >
                                      <div className="flex-1">
                                          <div className="flex flex-wrap gap-2 mb-2 items-center">
                                              {isToday ? (
                                                  <span className="text-[10px] font-black uppercase tracking-widest bg-white px-2 py-0.5 rounded-full" style={{ color: eventColor }}>¡HOY! {ev.type}</span>
                                              ) : (
                                                  <span className="text-[10px] font-black uppercase tracking-widest text-white px-2 py-0.5 rounded-full" style={{ backgroundColor: eventColor }}>{ev.type}</span>
                                              )}
                                              {ev.proceso && <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${isToday ? 'bg-white/20 text-white' : 'text-slate-500 bg-white border border-slate-200'}`}>{ev.proceso}</span>}
                                          </div>
                                          <h4 className={`font-bold text-sm leading-snug ${isToday ? 'text-white' : 'text-slate-900'}`}>{ev.title}</h4>
                                          {ev.description && <p className={`text-xs italic mt-1 ${isToday ? 'text-white/80' : 'text-slate-500'}`}>"{ev.description}"</p>}
                                      </div>
                                      <div className="shrink-0 md:text-right">
                                          <p className={`text-sm font-black whitespace-nowrap`} style={isToday ? { color: '#ffffff' } : { color: eventColor }}>
                                              {format(parseISO(ev.start_date), "dd 'de' MMMM, yyyy", { locale: es })}
                                          </p>
                                          <p className={`text-[11px] font-bold`} style={isToday ? { color: '#ffffff', opacity: 0.9 } : { color: eventColor, opacity: 0.8 }}>
                                              {format(parseISO(ev.start_date), "HH:mm")}
                                              {ev.end_date && ev.end_date !== ev.start_date && ' - ' + format(parseISO(ev.end_date), "HH:mm")}
                                          </p>
                                      </div>
                                  </div>
                              </div>
                          )})}
                      </div>
                  )}
              </div>
          </div>
          ) : (
          <div className="bg-slate-50 border border-slate-200 border-dashed rounded-3xl overflow-hidden shadow-none flex flex-col h-[500px] lg:h-[800px] items-center justify-center opacity-70">
              <span className="material-symbols-outlined text-5xl text-slate-300 mb-4 cursor-default">lock</span>
              <h3 className="text-lg font-black text-slate-500 uppercase">Agenda de Eventos</h3>
              <p className="text-sm font-bold text-slate-400 mt-2">No tienes permiso para ver este panel</p>
          </div>
          )}

          <div className="flex flex-col gap-8">
              
              {/* Panel: Overdue Loans */}
              {hasLoansAccess ? (
              <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm flex flex-col flex-1 h-[230px]">
                  <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-red-50/30">
                      <div className="flex items-center gap-3">
                          <span className="material-symbols-outlined text-red-500 text-2xl">warning</span>
                          <div>
                              <h3 className="font-black text-slate-900 uppercase">Préstamos Vencidos</h3>
                              <p className="text-xs font-semibold text-slate-500">Requieren atención inmediata ({overdueLoans.length})</p>
                          </div>
                      </div>
                      <Link to="/loans" className="text-red-600 bg-red-50 hover:bg-red-100 p-2 rounded-xl transition-colors shrink-0">
                          <span className="material-symbols-outlined block text-[20px]">chevron_right</span>
                      </Link>
                  </div>
                  <div className="p-0 overflow-y-auto flex-1">
                      {overdueLoans.length === 0 ? (
                          <div className="h-full flex flex-col items-center justify-center text-slate-400">
                              <span className="material-symbols-outlined text-3xl mb-1">done_all</span>
                              <p className="font-bold text-xs uppercase tracking-widest">Todo al día</p>
                          </div>
                      ) : (
                          <div className="flex flex-col divide-y divide-slate-50">
                              {overdueLoans.slice(0, 5).map(loan => (
                                  <div key={loan.id} className="p-4 hover:bg-slate-50 transition-colors flex items-center justify-between gap-4">
                                      <div className="min-w-0">
                                          <p className="text-sm font-bold text-slate-900 truncate">{loan.inventario_bienes?.nombre_bien || 'Bien Desconocido'}</p>
                                          <p className="text-xs text-slate-500 truncate">Prestado a: <span className="font-medium text-slate-700">{loan.prestatario_nombre}</span></p>
                                      </div>
                                      <div className="shrink-0 text-right">
                                          <span className="text-[10px] font-black uppercase px-2 py-1 bg-red-100 border border-red-200 text-red-700 rounded block mb-1">Vencido</span>
                                          <span className="text-[10px] text-slate-500 font-bold block">{loan.fecha_limite ? format(parseISO(loan.fecha_limite), 'dd MMM yyyy', {locale:es}) : '-'}</span>
                                      </div>
                                  </div>
                              ))}
                              {overdueLoans.length > 5 && (
                                  <Link to="/loans" className="block p-3 text-center text-xs font-bold text-slate-500 bg-slate-50 hover:bg-slate-100 transition-colors uppercase tracking-widest">
                                      Ver {overdueLoans.length - 5} más...
                                  </Link>
                              )}
                          </div>
                      )}
                  </div>
              </div>
              ) : (
              <div className="bg-slate-50 border border-slate-200 border-dashed rounded-3xl overflow-hidden shadow-none flex flex-col flex-1 h-[230px] items-center justify-center opacity-70">
                  <span className="material-symbols-outlined text-4xl text-slate-300 mb-3 cursor-default">lock</span>
                  <h3 className="font-black text-slate-500 uppercase text-sm">Préstamos Vencidos</h3>
                  <p className="text-xs font-bold text-slate-400 mt-1">Acceso restringido</p>
              </div>
              )}

              {/* Panel: Pending Transfers */}
              <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm flex flex-col flex-1 h-[250px]">
                  <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-amber-50/30">
                      <div className="flex items-center gap-3">
                          <span className="material-symbols-outlined text-amber-500 text-2xl">receipt_long</span>
                          <div>
                              <h3 className="font-black text-slate-900 uppercase">Transferencias Pendientes</h3>
                              <p className="text-xs font-semibold text-slate-500">Aprobadas por notificar ({pendingTransfers.length})</p>
                          </div>
                      </div>
                      <Link to="/transfer-refunds" className="text-amber-600 bg-amber-50 hover:bg-amber-100 p-2 rounded-xl transition-colors shrink-0">
                          <span className="material-symbols-outlined block text-[20px]">chevron_right</span>
                      </Link>
                  </div>
                  <div className="p-0 overflow-y-auto flex-1">
                      {pendingTransfers.length === 0 ? (
                          <div className="h-full flex flex-col items-center justify-center text-slate-400">
                              <span className="material-symbols-outlined text-3xl mb-1">done_all</span>
                              <p className="font-bold text-xs uppercase tracking-widest">Sin pendientes</p>
                          </div>
                      ) : (
                          <div className="flex flex-col divide-y divide-slate-50">
                              {pendingTransfers.slice(0, 5).map(t => (
                                  <div key={t.id} className="p-4 hover:bg-slate-50 transition-colors flex items-center justify-between gap-4">
                                      <div className="min-w-0 flex-1">
                                          <p className="text-sm font-bold text-slate-900 truncate">{t.student_name}</p>
                                          <p className="text-xs text-slate-500 truncate">{t.concurso} - <span className="font-medium text-slate-700">{t.type}</span></p>
                                      </div>
                                      <div className="shrink-0 text-right">
                                          <span className="text-[10px] font-black uppercase px-2 py-1 bg-amber-50 border border-amber-200 text-amber-700 rounded block">
                                              Pendiente a {t.target_exam || 'Examen'}
                                          </span>
                                      </div>
                                  </div>
                              ))}
                              {pendingTransfers.length > 5 && (
                                  <Link to="/transfer-refunds" className="block p-3 text-center text-xs font-bold text-slate-500 bg-slate-50 hover:bg-slate-100 transition-colors uppercase tracking-widest">
                                      Ver {pendingTransfers.length - 5} más...
                                  </Link>
                              )}
                          </div>
                      )}
                  </div>
              </div>

              {/* Panel: Upcoming Reservations */}
              {hasReservationAccess ? (
              <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm flex flex-col flex-1 h-[250px]">
                  <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-blue-50/30">
                      <div className="flex items-center gap-3">
                          <span className="material-symbols-outlined text-blue-500 text-2xl">event_seat</span>
                          <div>
                              <h3 className="font-black text-slate-900 uppercase">Reservas de Vacantes</h3>
                              <p className="text-xs font-semibold text-slate-500">Próximos Semestres / Procesos</p>
                          </div>
                      </div>
                      <Link to="/vacancy-reservation" className="text-blue-600 bg-blue-50 hover:bg-blue-100 p-2 rounded-xl transition-colors shrink-0">
                          <span className="material-symbols-outlined block text-[20px]">chevron_right</span>
                      </Link>
                  </div>
                  <div className="p-0 overflow-y-auto flex-1">
                      {reservationCounts.length === 0 ? (
                          <div className="h-full flex flex-col items-center justify-center text-slate-400">
                              <span className="material-symbols-outlined text-3xl mb-1">done_all</span>
                              <p className="font-bold text-xs uppercase tracking-widest">Sin reservas activas</p>
                          </div>
                      ) : (
                          <div className="flex flex-col divide-y divide-slate-50">
                              {reservationCounts.map(rc => (
                                  <div key={rc.semester} className="flex justify-between items-center p-4 hover:bg-slate-50 transition-colors">
                                      <p className="text-sm font-bold text-slate-900">Semestre {rc.semester}</p>
                                      <span className="text-xs font-black tracking-widest bg-blue-100 border border-blue-200 text-blue-700 px-3 py-1 rounded-lg text-center shadow-sm">
                                          {rc.count}
                                      </span>
                                  </div>
                              ))}
                          </div>
                      )}
                  </div>
              </div>
              ) : (
              <div className="bg-slate-50 border border-slate-200 border-dashed rounded-3xl overflow-hidden shadow-none flex flex-col flex-1 h-[250px] items-center justify-center opacity-70">
                  <span className="material-symbols-outlined text-4xl text-slate-300 mb-3 cursor-default">lock</span>
                  <h3 className="font-black text-slate-500 uppercase text-sm">Reservas de Vacantes</h3>
              </div>
              )}

          </div>
      </div>
    </div>
  );
};

