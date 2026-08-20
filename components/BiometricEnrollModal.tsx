import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  person: any; // PersonalDirectorio
  notify: (msg: string, type?: 'success' | 'error' | 'warning' | 'info') => void;
}

type Step = 'CHECKING' | 'HAS_FINGERPRINT' | 'NO_FINGERPRINT' | 'ENROLLING' | 'VERIFYING' | 'VERIFY_SUCCESS' | 'VERIFY_FAILED' | 'ENROLL_SUCCESS';

export const BiometricEnrollModal: React.FC<Props> = ({ isOpen, onClose, person, notify }) => {
  const [step, setStep] = useState<Step>('CHECKING');
  const [loading, setLoading] = useState(false);
  const [existingTemplate, setExistingTemplate] = useState<string | null>(null);
  
  // Enrollment Progress
  const [samplesCollected, setSamplesCollected] = useState(0);
  const [enrollMessage, setEnrollMessage] = useState('Iniciando lector...');
  const pollingInterval = useRef<any>(null);
  const abortController = useRef<AbortController | null>(null);

  useEffect(() => {
    if (isOpen && person) {
      checkExistingFingerprint();
    } else {
      resetState();
    }
    return () => {
      stopPolling();
      if (abortController.current) {
        abortController.current.abort();
      }
    }
  }, [isOpen, person]);

  const resetState = () => {
    setStep('CHECKING');
    setExistingTemplate(null);
    setSamplesCollected(0);
    setEnrollMessage('Iniciando lector...');
    stopPolling();
  };

  const checkExistingFingerprint = async () => {
    setStep('CHECKING');
    try {
      const { data, error } = await supabase
        .from('fingerprint_templates')
        .select('template_base64')
        .eq('dni', person.dni)
        .maybeSingle();

      if (error) throw error;

      if (data && data.template_base64) {
        setExistingTemplate(data.template_base64);
        setStep('HAS_FINGERPRINT');
      } else {
        setStep('NO_FINGERPRINT');
      }
    } catch (err: any) {
      console.error(err);
      notify('Error al consultar huella en BD', 'error');
      setStep('NO_FINGERPRINT');
    }
  };

  const stopPolling = () => {
    if (pollingInterval.current) {
      clearInterval(pollingInterval.current);
      pollingInterval.current = null;
    }
  };

  const startPolling = () => {
    stopPolling();
    pollingInterval.current = setInterval(async () => {
      try {
        const res = await fetch('http://localhost:8081/enroll-status', { signal: AbortSignal.timeout(1000) });
        if (res.ok) {
          const data = await res.json();
          if (data.isEnrolling) {
            setSamplesCollected(data.samplesCollected);
            setEnrollMessage(data.message || `Muestra ${data.samplesCollected} de 4`);
          }
        }
      } catch (e) {
        // Ignore polling errors
      }
    }, 250);
  };

  const handleEnroll = async () => {
    setLoading(true);
    setStep('ENROLLING');
    setSamplesCollected(0);
    setEnrollMessage('Por favor, coloque su dedo en el lector...');
    
    abortController.current = new AbortController();

    try {
      // Check if BiometricBridge is online
      try {
        const res = await fetch('http://localhost:8081/ping', { method: 'GET', signal: AbortSignal.timeout(2500) });
        if (!res.ok) throw new Error('Servicio no responde');
      } catch (err) {
        throw new Error('No se detectó el servicio BiometricBridge.exe en esta PC. Asegúrate de iniciarlo.');
      }

      startPolling();

      const enrollRes = await fetch('http://localhost:8081/enroll', { 
        method: 'POST',
        signal: abortController.current.signal
      });
      
      stopPolling();
      
      const enrollData = await enrollRes.json();
      
      if (!enrollRes.ok || !enrollData.success) {
        throw new Error(enrollData.error || 'Error en la captura de huella.');
      }

      const templateBase64 = enrollData.template;
      setSamplesCollected(4);
      setEnrollMessage('Guardando plantilla...');

      // Upsert into Supabase
      const { error } = await supabase.from('fingerprint_templates').upsert({
        personal_id: person.id,
        dni: person.dni,
        finger_name: 'Índice Derecho',
        finger_index: 1,
        template_base64: templateBase64
      }, { onConflict: 'personal_id, finger_index' });

      if (error) {
        throw new Error(`Error guardando en BD: ${error.message}`);
      }

      // Update local state if needed via callback or rely on parent refetching
      person.has_fingerprint = true; // Optimistic update
      setExistingTemplate(templateBase64);
      
      setStep('ENROLL_SUCCESS');
      notify('Huella registrada exitosamente en la base de datos.', 'success');
      
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.error(err);
        notify(err.message, 'error');
        setStep(existingTemplate ? 'HAS_FINGERPRINT' : 'NO_FINGERPRINT');
      }
    } finally {
      stopPolling();
      setLoading(false);
    }
  };

  const handleVerify = async () => {
    if (!existingTemplate) return;
    
    setLoading(true);
    setStep('VERIFYING');
    
    abortController.current = new AbortController();

    try {
      try {
        const ping = await fetch('http://localhost:8081/ping', { method: 'GET', signal: AbortSignal.timeout(2500) });
        if (!ping.ok) throw new Error();
      } catch (err) {
        throw new Error('BiometricBridge no activo. Inicie el servicio local.');
      }

      notify('Coloque el dedo 1 vez en el lector para verificar...', 'info');

      const verifyRes = await fetch('http://localhost:8081/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template: existingTemplate }),
        signal: abortController.current.signal
      });
      
      const verifyData = await verifyRes.json();
      
      if (verifyRes.ok && verifyData.success && verifyData.verified) {
         setStep('VERIFY_SUCCESS');
         notify('¡Comprobación exitosa! La huella coincide 100%.', 'success');
      } else {
         setStep('VERIFY_FAILED');
         notify('La huella no coincide. Intente de nuevo o re-enrole.', 'warning');
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.error(err);
        notify(err.message, 'error');
        setStep('HAS_FINGERPRINT');
      }
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen || !person) return null;

  const renderEnrollmentProgress = () => {
    return (
      <div className="w-full flex flex-col items-center gap-6 py-4">
        <div className="flex gap-4">
          {[1, 2, 3, 4].map(num => {
            const isCompleted = samplesCollected >= num;
            const isCurrent = samplesCollected === num - 1;
            return (
              <div key={num} className="flex flex-col items-center gap-2">
                <div className={`w-14 h-14 rounded-full border-4 flex items-center justify-center transition-all duration-300 ${isCompleted ? 'bg-emerald-500 border-emerald-500 text-white scale-110' : isCurrent ? 'border-blue-500 border-dashed animate-pulse text-blue-500' : 'border-slate-200 text-slate-300'}`}>
                  {isCompleted ? <span className="material-symbols-outlined font-black">check</span> : <span className="font-bold">{num}</span>}
                </div>
                <span className={`text-[10px] font-bold uppercase tracking-wider ${isCompleted ? 'text-emerald-600' : isCurrent ? 'text-blue-600' : 'text-slate-400'}`}>Toque {num}</span>
              </div>
            );
          })}
        </div>
        <p className="text-sm font-bold text-slate-700 bg-slate-100 px-4 py-2 rounded-xl animate-pulse">{enrollMessage}</p>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full overflow-hidden flex flex-col">
        <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <h2 className="text-lg font-black text-slate-800 flex items-center gap-2">
            <span className="material-symbols-outlined text-primary">fingerprint</span>
            Gestión Biométrica
          </h2>
          <button onClick={() => {
              if (abortController.current) abortController.current.abort();
              onClose();
          }} disabled={loading && step !== 'ENROLLING' && step !== 'VERIFYING'} className="text-slate-400 hover:text-slate-600">
             <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="p-6 flex flex-col items-center text-center gap-4">
           <div className="bg-blue-50 text-blue-800 p-4 rounded-xl w-full text-left text-sm font-medium flex items-center gap-3">
             <div className="w-10 h-10 bg-blue-200 rounded-full flex items-center justify-center text-blue-700">
               <span className="material-symbols-outlined">person</span>
             </div>
             <div>
                <span className="font-black text-base">{person.nombre}</span> <br/>
                DNI: <span className="font-bold opacity-80">{person.dni}</span>
             </div>
           </div>

           {step === 'CHECKING' && (
             <div className="py-8 flex flex-col items-center gap-3">
               <span className="material-symbols-outlined text-4xl text-slate-300 animate-spin">refresh</span>
               <p className="text-slate-500 font-medium">Verificando base de datos...</p>
             </div>
           )}

           {step === 'HAS_FINGERPRINT' && (
             <div className="w-full flex flex-col gap-4 animate-fade-in py-2">
                <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-5 flex flex-col items-center gap-2 text-emerald-800">
                    <span className="material-symbols-outlined text-5xl text-emerald-500 mb-1">check_circle</span>
                    <h3 className="font-black text-lg">Huella Registrada</h3>
                    <p className="text-sm font-medium opacity-80">Dedo: Índice Derecho</p>
                </div>
                <div className="flex flex-col gap-3 mt-2">
                    <button onClick={handleVerify} disabled={loading} className="w-full h-12 bg-emerald-600 hover:bg-emerald-700 text-white font-black uppercase tracking-widest rounded-xl transition-all shadow-lg shadow-emerald-600/20 flex items-center justify-center gap-2">
                        <span className="material-symbols-outlined">verified</span> Verificar Huella
                    </button>
                    <button onClick={handleEnroll} disabled={loading} className="w-full h-12 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold uppercase tracking-widest rounded-xl transition-all flex items-center justify-center gap-2">
                        <span className="material-symbols-outlined">published_with_changes</span> Re-enrolar / Actualizar
                    </button>
                </div>
             </div>
           )}

           {step === 'NO_FINGERPRINT' && (
             <div className="w-full flex flex-col items-center gap-4 animate-fade-in py-4">
                <span className="material-symbols-outlined text-[72px] text-slate-300">fingerprint</span>
                <div className="text-center">
                    <h3 className="font-black text-lg text-slate-800">Sin Huella Registrada</h3>
                    <p className="text-sm text-slate-500 mt-1">Este personal aún no ha registrado su huella en el sistema.</p>
                </div>
                <button onClick={handleEnroll} disabled={loading} className="w-full h-14 mt-4 bg-primary hover:bg-primary/90 text-white font-black uppercase tracking-widest rounded-xl transition-all shadow-xl shadow-primary/20 flex items-center justify-center gap-2 text-sm">
                    <span className="material-symbols-outlined">play_circle</span> Iniciar Enrolamiento
                </button>
             </div>
           )}

           {step === 'ENROLLING' && renderEnrollmentProgress()}

           {step === 'ENROLL_SUCCESS' && (
             <div className="py-6 flex flex-col items-center gap-4 animate-fade-in">
                <span className="material-symbols-outlined text-[80px] text-emerald-500">task_alt</span>
                <p className="text-emerald-700 font-black text-xl">¡Enrolamiento Exitoso!</p>
                <button onClick={() => setStep('HAS_FINGERPRINT')} className="mt-4 px-8 py-3 bg-slate-800 text-white font-bold rounded-xl hover:bg-slate-900 transition-colors">Continuar</button>
             </div>
           )}

           {step === 'VERIFYING' && (
             <div className="py-8 flex flex-col items-center gap-4 animate-fade-in">
                <span className="material-symbols-outlined text-[64px] text-blue-500 animate-pulse">fingerprint</span>
                <p className="text-blue-800 font-bold text-lg">Esperando huella...</p>
                <p className="text-sm text-blue-600">Coloque su dedo en el lector para verificar.</p>
             </div>
           )}

           {step === 'VERIFY_SUCCESS' && (
             <div className="py-6 flex flex-col items-center gap-4 animate-fade-in">
                <span className="material-symbols-outlined text-[80px] text-emerald-500">verified_user</span>
                <div className="text-center">
                    <p className="text-emerald-700 font-black text-xl">¡Identidad Verificada!</p>
                    <p className="text-emerald-600 font-medium text-sm mt-1">La huella coincide al 100%.</p>
                </div>
                <button onClick={() => setStep('HAS_FINGERPRINT')} className="mt-4 px-8 py-3 bg-slate-800 text-white font-bold rounded-xl hover:bg-slate-900 transition-colors">Volver</button>
             </div>
           )}

           {step === 'VERIFY_FAILED' && (
             <div className="py-6 flex flex-col items-center gap-4 animate-fade-in">
                <span className="material-symbols-outlined text-[80px] text-red-500">gpp_bad</span>
                <div className="text-center">
                    <p className="text-red-700 font-black text-xl">Verificación Fallida</p>
                    <p className="text-red-600 font-medium text-sm mt-1">La huella no coincide con la base de datos.</p>
                </div>
                <div className="flex gap-3 mt-4">
                    <button onClick={handleVerify} className="px-6 py-3 bg-red-100 text-red-700 font-bold rounded-xl hover:bg-red-200 transition-colors">Reintentar</button>
                    <button onClick={() => setStep('HAS_FINGERPRINT')} className="px-6 py-3 bg-slate-100 text-slate-700 font-bold rounded-xl hover:bg-slate-200 transition-colors">Cancelar</button>
                </div>
             </div>
           )}

        </div>
        <div className="p-4 border-t border-slate-100 bg-slate-50">
          <p className="text-[10px] text-slate-400 text-center leading-relaxed">
             Nota legal: Los datos biométricos son procesados de forma encriptada como plantilla matemática unidireccional, sin almacenar imágenes de la huella, en estricto cumplimiento a la Ley de Protección de Datos Personales N° 29733.
          </p>
        </div>
      </div>
    </div>
  );
}
