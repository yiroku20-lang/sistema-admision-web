import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';

export const StaffConfirmation = () => {
  const [searchParams] = useSearchParams();
  const id = searchParams.get('id');
  const queryAction = searchParams.get('action'); // 'confirm' or 'decline'
  
  const [loading, setLoading] = useState(true);
  const [sorteo, setSorteo] = useState<any>(null);
  const [proceso, setProceso] = useState<any>(null);
  const [errorStr, setErrorStr] = useState<string>('');
  
  const [action, setAction] = useState<'Confirmar'|'Rechazar'|null>(null);
  const [motivo, setMotivo] = useState('');
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  
  const autoSubmitted = useRef(false);

  useEffect(() => {
    if (id) {
      if (queryAction === 'decline') {
        setAction('Rechazar');
      }
      fetchData();
    } else {
      setErrorStr('Enlace no válido. Falta el ID.');
      setLoading(false);
    }
  }, [id, queryAction]);

  useEffect(() => {
    if (sorteo && queryAction === 'confirm' && !autoSubmitted.current && sorteo.estado_confirmacion === 'Pendiente') {
        const isExpired = sorteo.fecha_limite_confirmacion && new Date(sorteo.fecha_limite_confirmacion).getTime() < new Date().getTime();
        if (!isExpired) {
             autoSubmitted.current = true;
             submitAction('Confirmado');
        }
    }
  }, [sorteo, queryAction]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data: sorteoData, error: sorteoError } = await supabase
        .from('personal_sorteos')
        .select('*')
        .eq('id', id)
        .single();
      
      if (sorteoError || !sorteoData) {
        throw new Error('No se encontró el registro o fue eliminado.');
      }
      setSorteo(sorteoData);

      const { data: procData } = await supabase
        .from('personal_procesos')
        .select('nombre, descripcion')
        .eq('id', sorteoData.proceso_id)
        .single();

      if (procData) {
        setProceso(procData);
      }
    } catch (e: any) {
      setErrorStr(e.message);
    } finally {
      setLoading(false);
    }
  };

  const submitAction = async (state: 'Confirmado' | 'Rechazado') => {
    if (state === 'Rechazado' && !motivo.trim()) {
        alert('Por favor ingrese un motivo breve para rechazar.');
        return;
    }
    setSaving(true);
    try {
        const payload: any = { estado_confirmacion: state };
        if (state === 'Rechazado') {
            payload.motivo_rechazo = motivo;
        }

        const { error } = await supabase
            .from('personal_sorteos')
            .update(payload)
            .eq('id', id);

        if (error) throw error;
        
        let msg = '';
        if (state === 'Confirmado') {
            msg = 'Pronto la Dirección de Admisión se comunicará con usted para brindarle más detalles.';
        } else {
            msg = 'Se ha guardado el motivo de su no participación.';
        }
        
        setSuccessMsg(msg);
        setSorteo({ ...sorteo, estado_confirmacion: state, motivo_rechazo: state === 'Rechazado' ? motivo : null });
    } catch(e: any) {
        alert('Error: ' + e.message);
    } finally {
        setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
         <div className="animate-spin w-8 h-8 rounded-full border-4 border-slate-300 border-t-[#1e1e24]"></div>
      </div>
    );
  }

  if (errorStr) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
         <div className="bg-white p-8 rounded-3xl shadow-2xl max-w-md w-full text-center border-t-8 border-t-[#d32f2f]">
            <span className="material-symbols-outlined text-[64px] text-[#d32f2f] mb-4 block">error</span>
            <h2 className="text-2xl font-black text-[#1e1e24] mb-2 uppercase tracking-tight">Error</h2>
            <p className="text-slate-600 font-medium text-sm">{errorStr}</p>
         </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8fafc] py-6 px-4 sm:py-12 sm:px-6 lg:px-8 font-sans relative">
      <div className="absolute top-0 left-0 w-full h-64 bg-[#1e1e24] -z-10" style={{ backgroundImage: 'radial-gradient(circle at top right, #2a2a35, #1e1e24)' }}></div>
      
      <div className="mx-auto w-full max-w-xl flex flex-col items-center">
          <div className="bg-white p-4 rounded-3xl shadow-xl inline-block mb-6 mt-4 sm:mt-0">
              <img src="https://cnqpzyanmmwspvemcfeb.supabase.co/storage/v1/object/public/logos/logo%20admision%201.png" alt="Logo de Admisión" className="h-20 object-contain" />
          </div>
          
          <div className="w-full bg-white rounded-3xl shadow-2xl overflow-hidden border border-slate-100 relative z-10 mb-8">
          <div className="bg-gradient-to-r from-[#1e1e24] to-[#2a2a35] p-8 text-center border-b-4 border-[#d32f2f]">
              <h1 className="text-2xl font-black text-white tracking-tight uppercase">Confirmación de Participación</h1>
              <p className="text-[#f57c00] text-sm font-bold mt-2 uppercase tracking-widest">{proceso?.nombre || 'Proceso de Admisión'}</p>
          </div>
          
          <div className="p-8">
              {successMsg ? (
                  <div className="bg-emerald-50 border border-emerald-200 p-8 rounded-3xl text-center">
                      <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-6">
                          <span className="material-symbols-outlined text-[48px]">check_circle</span>
                      </div>
                      <h3 className="text-xl font-black text-[#1e1e24] mb-3 tracking-tight">¡Gracias por responder!</h3>
                      <p className="text-slate-700 text-sm font-medium mb-6 leading-relaxed">{successMsg}</p>
                      <button onClick={() => window.close()} className="px-6 py-3 bg-[#1e1e24] hover:bg-black text-white rounded-xl text-sm font-bold shadow-lg transition-colors inline-block text-center cursor-pointer">
                          Cerrar Ventana
                      </button>
                  </div>
              ) : (
                  <>
                      <div className="mb-8">
                          <p className="text-slate-700 text-base leading-relaxed">
                              Estimado(a) <strong className="text-[#1e1e24] font-black">{sorteo?.nombres}</strong>,<br/><br/>
                              Usted ha sido seleccionado(a) como <strong className="uppercase bg-slate-100 px-2 py-0.5 rounded text-slate-800 font-bold border border-slate-200">{sorteo?.condicion_sorteo}</strong> para el cargo de <strong className="text-[#d32f2f] font-black uppercase tracking-tight">{sorteo?.cargo}</strong> en el proceso actual.
                          </p>
                          <div className="bg-amber-50 border-l-4 border-amber-400 p-4 mt-6 rounded-r-xl">
                              <p className="text-amber-800 text-xs font-semibold leading-relaxed">
                                  <strong>Nota importante:</strong> Su respuesta de confirmación o rechazo registrada por este medio es estricta responsabilidad personal y tiene carácter de declaración jurada frente a la institución.
                              </p>
                          </div>
                      </div>

                      {sorteo?.estado_confirmacion !== 'Pendiente' ? (
                          <div className="bg-slate-50 border border-slate-200 p-8 rounded-3xl text-center">
                              <div className="w-16 h-16 bg-slate-200 text-slate-500 rounded-full flex items-center justify-center mx-auto mb-5">
                                  <span className="material-symbols-outlined text-[32px]">info</span>
                              </div>
                              <h3 className="text-lg font-black text-[#1e1e24] mb-2 tracking-tight">Ya has respondido a esta solicitud</h3>
                              <p className="text-slate-600 text-sm mt-2 font-medium">
                                 Tu estado actual es: <strong className={`uppercase px-3 py-1 rounded inline-block ml-1 ${sorteo?.estado_confirmacion === 'Confirmado' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>{sorteo?.estado_confirmacion}</strong>
                              </p>
                          </div>
                      ) : sorteo?.fecha_limite_confirmacion && new Date(sorteo.fecha_limite_confirmacion).getTime() < new Date().getTime() ? (
                          <div className="bg-red-50 border border-red-200 p-8 rounded-3xl text-center">
                              <div className="w-16 h-16 bg-red-100 text-red-500 rounded-full flex items-center justify-center mx-auto mb-5">
                                  <span className="material-symbols-outlined text-[32px]">timer_off</span>
                              </div>
                              <h3 className="text-lg font-black text-[#d32f2f] tracking-tight mb-2">El tiempo de confirmación ha concluido</h3>
                              <p className="text-red-700 text-sm font-medium leading-relaxed">
                                 Ya no es posible registrar su participación porque la fecha límite ha finalizado.
                              </p>
                          </div>
                      ) : (
                          <div className="flex flex-col gap-6">
                              <h3 className="font-black text-[#1e1e24] text-center text-lg uppercase tracking-widest border-b border-slate-100 pb-4">¿Podrá participar en este proceso?</h3>
                              
                              <div className="grid grid-cols-2 gap-4">
                                  <button 
                                      onClick={() => submitAction('Confirmado')} 
                                      disabled={saving}
                                      className="py-5 px-4 rounded-2xl bg-emerald-500 hover:bg-emerald-600 text-white font-black transition-all shadow-md hover:shadow-xl flex flex-col items-center gap-3 border-b-4 border-emerald-700 disabled:opacity-50 group tracking-tight"
                                  >
                                      <span className="material-symbols-outlined text-[36px] group-hover:scale-110 transition-transform">task_alt</span>
                                      <span>SÍ, CONFIRMO</span>
                                  </button>

                                  <button 
                                      onClick={() => setAction('Rechazar')} 
                                      disabled={saving}
                                      className={`py-5 px-4 rounded-2xl font-black transition-all flex flex-col items-center gap-3 border-b-4 tracking-tight group ${action === 'Rechazar' ? 'bg-[#d32f2f] text-white border-red-700 shadow-xl' : 'bg-slate-50 border-slate-300 text-slate-700 hover:bg-slate-100 hover:border-slate-400 shadow-sm'}`}
                                  >
                                      <span className="material-symbols-outlined text-[36px] group-hover:scale-110 transition-transform">block</span>
                                      <span>NO PODRÉ</span>
                                  </button>
                              </div>

                              {action === 'Rechazar' && (
                                  <div className="mt-2 p-6 bg-slate-50 border border-slate-200 rounded-3xl animate-in fade-in slide-in-from-top-4 shadow-inner">
                                      <label className="block text-sm font-bold text-[#1e1e24] mb-3">Por favor, indícanos el motivo brevemente (obligatorio):</label>
                                      <textarea 
                                          value={motivo} 
                                          onChange={e => setMotivo(e.target.value)} 
                                          className="w-full border-2 border-slate-200 bg-white rounded-xl p-4 text-sm font-medium text-slate-700 focus:border-[#d32f2f] outline-none min-h-[100px] mb-4 shadow-sm resize-none"
                                          placeholder="Ej: Problemas de salud, viaje programado, cruce de horarios..."
                                      ></textarea>
                                      <div className="flex gap-3 justify-end border-t border-slate-200 pt-4">
                                        <button onClick={() => setAction(null)} className="px-5 py-2.5 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-200 transition-colors">Cancelar</button>
                                        <button onClick={() => submitAction('Rechazado')} disabled={saving} className="bg-[#1e1e24] hover:bg-black text-white px-6 py-2.5 rounded-xl text-sm font-black disabled:opacity-50 shadow-lg flex items-center gap-2 uppercase tracking-widest transition-colors">
                                            {saving ? 'Guardando...' : 'Guardar Motivo'}
                                        </button>
                                      </div>
                                  </div>
                              )}
                          </div>
                      )}
                  </>
              )}
          </div>
      </div>
      </div>
    </div>
  );
};
