import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';

export const Unsubscribe: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const id = searchParams.get('id');

  useEffect(() => {
    if (!id) {
      setStatus('error');
      setErrorMessage('Enlace inválido o no se proporcionó el ID del prospecto.');
      setLoading(false);
    } else {
      setLoading(false);
    }
  }, [id]);

  const handleUnsubscribe = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const { error } = await supabase
        .from('prospectos_vocacionales')
        .update({ suscrito: false })
        .eq('id', id);

      if (error) throw error;
      
      setStatus('success');
    } catch (err: any) {
      console.error(err);
      setStatus('error');
      setErrorMessage('Ocurrió un error al procesar tu solicitud. Intenta nuevamente o contacta a soporte.');
    } finally {
      setLoading(false);
    }
  };

  if (loading && status === 'idle') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <span className="material-symbols-outlined animate-spin text-slate-400 text-4xl">progress_activity</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <div className="bg-white p-8 md:p-12 rounded-2xl shadow-xl max-w-lg w-full text-center border border-slate-100">
        <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-6">
          <span className="material-symbols-outlined text-3xl">unsubscribe</span>
        </div>
        
        <h1 className="text-2xl font-black text-slate-800 mb-4 tracking-tight">Darse de Baja</h1>
        
        {status === 'success' ? (
          <div>
            <p className="text-emerald-600 bg-emerald-50 p-4 rounded-xl text-sm font-medium border border-emerald-100 mb-6">
              Tu correo electrónico ha sido dado de baja exitosamente. Ya no recibirás más notificaciones automatizadas.
            </p>
            <p className="text-sm text-slate-500">
              Esperamos verte pronto en la UNSAAC.
            </p>
          </div>
        ) : status === 'error' ? (
          <div>
            <p className="text-red-600 bg-red-50 p-4 rounded-xl text-sm font-medium border border-red-100 mb-6">
              {errorMessage}
            </p>
          </div>
        ) : (
          <div>
            <p className="text-slate-600 mb-8 leading-relaxed">
              ¿Estás seguro de que deseas cancelar tu suscripción? Dejarás de recibir notificaciones, recordatorios, y novedades sobre nuestros procesos de admisión.
            </p>
            <button
              onClick={handleUnsubscribe}
              disabled={loading}
              className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3.5 px-6 rounded-xl transition-all active:scale-[0.98] flex items-center justify-center gap-2"
            >
              {loading ? (
                <span className="material-symbols-outlined animate-spin text-xl">progress_activity</span>
              ) : (
                <span className="material-symbols-outlined text-xl">block</span>
              )}
              {loading ? 'Procesando...' : 'Sí, Darse de Baja'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
