import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';

export interface LogEntry {
  id: string;
  user: string;
  action: string;
  actionColor: string;
  timestamp: Date;
  details: string;
  source: string;
}

export const SystemLogs: React.FC = () => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('Todos');
  const [userSearch, setUserSearch] = useState('');

  useEffect(() => {
    fetchAllLogs();
  }, []);

  const fetchAllLogs = async () => {
    setLoading(true);
    try {
      const allLogs: LogEntry[] = [];

      // Fetch users to map created_by to username
      const { data: usersData } = await supabase.from('usuarios').select('id, name');
      const userMap = new Map(usersData?.map(u => [u.id, u.name]) || []);

      // 1. Tramite Seguimiento (Has exact user)
      const { data: tracking } = await supabase.from('tramite_seguimiento').select('*').order('created_at', { ascending: false }).limit(200);
      if (tracking) {
        tracking.forEach(t => {
          let source = 'Seguimiento';
          let actionColor = t.action_type === 'Estado' ? 'bg-blue-100 text-blue-800' : 'bg-amber-100 text-amber-800';
          let action = t.action_type === 'Estado' ? 'Cambio de Estado' : 'Nota Agregada';
          
          if (t.action_type === 'Sistema') {
              source = 'Sistema';
              actionColor = 'bg-slate-100 text-slate-800';
              action = 'Actividad de Sesión';
          } else if (t.action_type === 'Registro') {
              actionColor = 'bg-emerald-100 text-emerald-800';
              action = 'Importación / Registro';
          }

          allLogs.push({
            id: `trk-${t.id}`,
            user: t.user_name || 'Sistema',
            action,
            actionColor,
            timestamp: new Date(t.created_at),
            details: t.description,
            source
          });
        });
      }

      // 2. Expedientes (Entradas)
      const { data: entradas } = await supabase.from('expedientes').select('*').order('created_at', { ascending: false }).limit(200);
      if (entradas) {
        entradas.forEach(e => {
          allLogs.push({
            id: `ent-${e.id}`,
            user: userMap.get(e.created_by) || 'Operador / Sistema',
            action: 'Registro de Entrada',
            actionColor: 'bg-emerald-100 text-emerald-800',
            timestamp: new Date(e.created_at),
            details: `Expediente Nº ${e.number} - ${e.subject}`,
            source: 'Entradas'
          });
        });
      }

      // 3. Expedientes Salida
      const { data: salidas } = await supabase.from('expedientes_salida').select('*').order('created_at', { ascending: false }).limit(200);
      if (salidas) {
        salidas.forEach(s => {
          allLogs.push({
            id: `sal-${s.id}`,
            user: userMap.get(s.created_by) || 'Operador / Sistema',
            action: 'Registro de Salida',
            actionColor: 'bg-indigo-100 text-indigo-800',
            timestamp: new Date(s.created_at),
            details: `${s.doc_type} Nº ${s.doc_number} - ${s.subject}`,
            source: 'Salidas'
          });
        });
      }

      // 4. Padron Pagos
      const { data: pagos } = await supabase.from('padron_pagos').select('*').order('created_at', { ascending: false }).limit(200);
      if (pagos) {
        pagos.forEach(p => {
          allLogs.push({
            id: `pag-${p.id}`,
            user: userMap.get(p.created_by) || 'Operador / Sistema',
            action: 'Registro de Pago',
            actionColor: 'bg-purple-100 text-purple-800',
            timestamp: new Date(p.created_at),
            details: `${p.type} - ${p.student_name} (DNI: ${p.dni})`,
            source: 'Pagos'
          });
        });
      }

      // Sort by timestamp descending
      allLogs.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
      
      setLogs(allLogs);
    } catch (error) {
      console.error('Error fetching logs:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredLogs = logs.filter(l => {
      const matchFilter = filter === 'Todos' || l.source === filter;
      const matchUser = userSearch === '' || l.user.toLowerCase().includes(userSearch.toLowerCase());
      return matchFilter && matchUser;
  });

  return (
    <div className="flex flex-col gap-6 max-w-[1200px] mx-auto w-full p-6 md:p-8 h-full overflow-hidden">
      {/* Page Heading */}
      <div className="flex flex-wrap justify-between items-end gap-3 mb-2 shrink-0">
        <div className="flex flex-col gap-2">
           <h1 className="text-slate-900 text-3xl md:text-4xl font-black leading-tight tracking-[-0.033em]">
             Auditoría y Registros
           </h1>
           <p className="text-slate-500 text-base font-normal">
             Rastree la actividad y el historial de documentos en tiempo real.
           </p>
        </div>
        <div className="flex gap-3">
          <button onClick={fetchAllLogs} className="flex items-center justify-center rounded-xl h-12 px-6 bg-white border-2 border-slate-200 text-slate-700 text-xs font-black uppercase shadow-sm hover:bg-slate-50 transition-all active:scale-95">
            <span className="material-symbols-outlined mr-2 text-[18px]">refresh</span>
            Actualizar
          </button>
        </div>
      </div>

      {/* Filters & Search */}
      <div className="flex flex-col md:flex-row gap-4 shrink-0">
          <div className="flex gap-2 overflow-x-auto pb-2 hide-scrollbar">
              {['Todos', 'Entradas', 'Salidas', 'Seguimiento', 'Pagos', 'Sistema'].map(f => (
                  <button 
                      key={f}
                      onClick={() => setFilter(f)}
                      className={`px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest whitespace-nowrap transition-all ${filter === f ? 'bg-slate-900 text-white shadow-md' : 'bg-white border border-slate-200 text-slate-500 hover:bg-slate-50'}`}
                  >
                      {f}
                  </button>
              ))}
          </div>
          <div className="flex-1 max-w-sm relative">
              <span className="material-symbols-outlined absolute left-3 top-2.5 text-slate-400">search</span>
              <input
                  type="text"
                  placeholder="Buscar por nombre de usuario..."
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-medium focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition-all placeholder:text-slate-400 text-slate-700"
              />
          </div>
      </div>

      {/* Table Container */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden flex-1 flex flex-col">
        {loading ? (
            <div className="flex-1 flex flex-col items-center justify-center">
                <span className="material-symbols-outlined text-4xl text-primary animate-spin">progress_activity</span>
                <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mt-4">Cargando registros...</p>
            </div>
        ) : (
            <div className="flex-1 overflow-auto">
              <table className="w-full min-w-[900px] text-left border-collapse">
                <thead className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-6 py-4 text-slate-500 text-[10px] font-black uppercase tracking-widest w-48">Fecha y Hora</th>
                    <th className="px-6 py-4 text-slate-500 text-[10px] font-black uppercase tracking-widest w-40">Usuario</th>
                    <th className="px-6 py-4 text-slate-500 text-[10px] font-black uppercase tracking-widest w-48">Acción</th>
                    <th className="px-6 py-4 text-slate-500 text-[10px] font-black uppercase tracking-widest">Detalles del Registro</th>
                    <th className="px-6 py-4 text-slate-500 text-[10px] font-black uppercase tracking-widest w-32 text-center">Módulo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredLogs.length === 0 ? (
                      <tr>
                          <td colSpan={5} className="px-6 py-12 text-center text-slate-400 text-sm font-bold">No se encontraron registros.</td>
                      </tr>
                  ) : (
                      filteredLogs.map((log) => (
                        <tr key={log.id} className="hover:bg-slate-50 transition-colors group">
                          <td className="px-6 py-4">
                            <div className="flex flex-col">
                                <span className="text-slate-900 text-sm font-bold">{log.timestamp.toLocaleDateString('es-PE')}</span>
                                <span className="text-slate-400 text-[10px] font-black tracking-widest uppercase">{log.timestamp.toLocaleTimeString('es-PE')}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className="size-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 border border-slate-200 shrink-0">
                                <span className="material-symbols-outlined text-sm">{log.user === 'Sistema' ? 'smart_toy' : 'person'}</span>
                              </div>
                              <span className="text-slate-700 text-xs font-bold uppercase">{log.user}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <span className={`inline-flex items-center rounded-lg px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${log.actionColor}`}>
                              {log.action}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                              <p className="text-slate-700 text-sm font-medium line-clamp-2 leading-snug">{log.details}</p>
                          </td>
                          <td className="px-6 py-4 text-center">
                              <span className="text-slate-400 text-[10px] font-black uppercase tracking-widest bg-slate-100 px-2 py-1 rounded-md">
                                  {log.source}
                              </span>
                          </td>
                        </tr>
                      ))
                  )}
                </tbody>
              </table>
            </div>
        )}
      </div>
    </div>
  );
};