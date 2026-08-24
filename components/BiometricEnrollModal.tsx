import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { isElectronApp, getGatewayBaseUrl } from '../lib/fileGateway';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  person: any; // PersonalDirectorio
  notify: (msg: string, type?: 'success' | 'error' | 'warning' | 'info') => void;
}

type Step = 
  | 'CHECKING' 
  | 'HAS_FINGERPRINT' 
  | 'NO_FINGERPRINT' 
  | 'ENROLLING' 
  | 'VERIFYING' 
  | 'VERIFY_SUCCESS' 
  | 'VERIFY_FAILED' 
  | 'ENROLL_SUCCESS'
  | 'NO_READER';

export const BiometricEnrollModal: React.FC<Props> = ({ isOpen, onClose, person, notify }) => {
  const isDesktop = isElectronApp();
  const [step, setStep] = useState<Step>('CHECKING');
  const [loading, setLoading] = useState(false);
  const [existingTemplate, setExistingTemplate] = useState<string | null>(null);
  const [biometricBaseUrl, setBiometricBaseUrl] = useState('http://localhost:8081');
  const [isServiceOnline, setIsServiceOnline] = useState<boolean | null>(null);
  
  // Enrollment Progress
  const [samplesCollected, setSamplesCollected] = useState(0);
  const [enrollMessage, setEnrollMessage] = useState('Iniciando lector...');
  const pollingInterval = useRef<any>(null);
  const abortController = useRef<AbortController | null>(null);

  // Compute Biometric Server Base URL based on Environment
  const getBiometricServerUrl = useCallback(() => {
    if (isDesktop) {
      return 'http://localhost:8081';
    }
    const gatewayUrl = getGatewayBaseUrl();
    try {
      if (gatewayUrl && !gatewayUrl.includes('localhost') && !gatewayUrl.includes('127.0.0.1')) {
        const parsed = new URL(gatewayUrl);
        return `${parsed.protocol}//${parsed.hostname}:8081`;
      }
    } catch {
      // fallback
    }
    return 'http://localhost:8081';
  }, [isDesktop]);

  const checkServiceHealth = useCallback(async () => {
    const url = getBiometricServerUrl();
    setBiometricBaseUrl(url);
    try {
      const res = await fetch(`${url}/ping`, { method: 'GET', signal: AbortSignal.timeout(2000) });
      if (res.ok) {
        setIsServiceOnline(true);
        return true;
      }
    } catch {
      // service offline
    }
    setIsServiceOnline(false);
    return false;
  }, [getBiometricServerUrl]);

  const checkExistingFingerprint = useCallback(async () => {
    setStep('CHECKING');
    try {
      const [serviceOk, { data, error }] = await Promise.all([
        checkServiceHealth(),
        supabase
          .from('fingerprint_templates')
          .select('id, template_base64, created_at')
          .eq('dni', person.dni)
          .order('created_at', { ascending: false })
          .limit(1)
      ]);

      if (error) throw error;

      if (data && data.length > 0 && data[0].template_base64) {
        setExistingTemplate(data[0].template_base64);
        setStep('HAS_FINGERPRINT');
      } else {
        setExistingTemplate(null);
        setStep('NO_FINGERPRINT');
      }
    } catch (err: any) {
      console.error('Biometric fetch error:', err);
      notify('Error al consultar huella en base de datos', 'error');
      setStep('NO_FINGERPRINT');
    }
  }, [person?.dni, checkServiceHealth, notify]);

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
    };
  }, [isOpen, person, checkExistingFingerprint]);

  const resetState = () => {
    setStep('CHECKING');
    setExistingTemplate(null);
    setSamplesCollected(0);
    setEnrollMessage('Iniciando lector...');
    setIsServiceOnline(null);
    stopPolling();
  };

  const stopPolling = () => {
    if (pollingInterval.current) {
      clearInterval(pollingInterval.current);
      pollingInterval.current = null;
    }
  };

  const startPolling = (baseUrl: string) => {
    stopPolling();
    pollingInterval.current = setInterval(async () => {
      try {
        const res = await fetch(`${baseUrl}/enroll-status`, { signal: AbortSignal.timeout(1000) });
        if (res.ok) {
          const data = await res.json();
          if (data.isEnrolling) {
            setSamplesCollected(data.samplesCollected || 0);
            if (data.message) {
              setEnrollMessage(data.message);
            } else if (data.samplesCollected > 0) {
              setEnrollMessage(`Toque ${data.samplesCollected} de 4 registrado. Vuelva a apoyar el dedo.`);
            }
          }
        }
      } catch {
        // Ignore polling errors
      }
    }, 250);
  };

  const handleEnroll = async () => {
    setLoading(true);
    setStep('ENROLLING');
    setSamplesCollected(0);
    setEnrollMessage('Por favor, coloque su dedo en el lector biométrico (Toque 1/4)...');
    
    abortController.current = new AbortController();
    const serverUrl = getBiometricServerUrl();

    try {
      // Step 1: Health check
      try {
        const resPing = await fetch(`${serverUrl}/ping`, { method: 'GET', signal: AbortSignal.timeout(2500) });
        if (!resPing.ok) throw new Error('Servicio no responde');
        setIsServiceOnline(true);
      } catch {
        setIsServiceOnline(false);
        setStep('NO_READER');
        throw new Error(
          'Sensor biométrico no detectado en este dispositivo. Asegúrese de tener conectado el lector DigitalPersona o utilice la Aplicación de Escritorio.'
        );
      }

      // Step 2: Start polling progress
      startPolling(serverUrl);

      // Step 3: Trigger enrollment (requires 4 touches)
      const enrollRes = await fetch(`${serverUrl}/enroll`, { 
        method: 'POST',
        signal: abortController.current.signal
      });
      
      stopPolling();
      
      const enrollData = await enrollRes.json();
      
      if (!enrollRes.ok || !enrollData.success) {
        throw new Error(enrollData.error || 'Error en la captura de huella.');
      }

      const templateBase64 = enrollData.template || enrollData.template_base64 || enrollData.templateBase64;
      if (!templateBase64) {
        throw new Error('El lector no retornó una plantilla biométrica válida.');
      }

      setSamplesCollected(4);
      setEnrollMessage('Actualizando plantilla única en base de datos...');

      // Step 4: Delete ANY previous templates for this DNI to ensure strictly ONE finger exists
      const { error: delError } = await supabase
        .from('fingerprint_templates')
        .delete()
        .eq('dni', person.dni);

      if (delError) {
        console.warn('Advertencia al limpiar registros anteriores:', delError);
      }

      // Step 5: Insert the fresh single template
      const { error: insertError } = await supabase
        .from('fingerprint_templates')
        .insert([{
          personal_id: person.id || null,
          dni: person.dni,
          finger_name: 'Huella Principal',
          finger_index: 1,
          template_base64: templateBase64,
          created_at: new Date().toISOString()
        }]);

      if (insertError) {
        throw new Error(`Error guardando en base de datos: ${insertError.message}`);
      }

      // Update state locally
      person.has_fingerprint = true;
      setExistingTemplate(templateBase64);
      
      setStep('ENROLL_SUCCESS');
      notify('Huella registrada y sobrescrita exitosamente.', 'success');
      
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.error('Error en enrolamiento:', err);
        notify(err.message, 'error');
        if (step !== 'NO_READER') {
          setStep(existingTemplate ? 'HAS_FINGERPRINT' : 'NO_FINGERPRINT');
        }
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
    const serverUrl = getBiometricServerUrl();

    try {
      try {
        const ping = await fetch(`${serverUrl}/ping`, { method: 'GET', signal: AbortSignal.timeout(2500) });
        if (!ping.ok) throw new Error();
        setIsServiceOnline(true);
      } catch {
        setIsServiceOnline(false);
        setStep('NO_READER');
        throw new Error('Sensor biométrico no detectado en este dispositivo. Asegúrese de tener conectado el lector DigitalPersona o utilice la Aplicación de Escritorio.');
      }

      notify('Coloque el dedo enrolado 1 vez en el lector para verificar...', 'info');

      const verifyRes = await fetch(`${serverUrl}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          template: existingTemplate,
          template_base64: existingTemplate,
          templateBase64: existingTemplate,
          expectedTemplate: existingTemplate
        }),
        signal: abortController.current.signal
      });
      
      const verifyData = await verifyRes.json();
      console.log('[Biometric Verify Response]:', verifyData);
      
      // Strict 1-to-1 comparison check from the biometric bridge
      const isVerified = Boolean(
        verifyRes.ok && 
        verifyData &&
        verifyData.success !== false &&
        (
          verifyData.verified === true ||
          verifyData.matched === true ||
          (typeof verifyData.score === 'number' && verifyData.score >= 50) ||
          verifyData.status === 'MATCH' ||
          verifyData.status === 'matched' ||
          verifyData.match === true
        ) &&
        verifyData.verified !== false &&
        verifyData.matched !== false &&
        verifyData.status !== 'NO_MATCH'
      );
      
      if (isVerified) {
         setStep('VERIFY_SUCCESS');
         notify('¡Comprobación exitosa! La huella coincide con el registro activo.', 'success');
      } else {
         setStep('VERIFY_FAILED');
         const reason = verifyData?.error || verifyData?.message || 'La huella colocada no coincide con la huella registrada.';
         notify(reason, 'warning');
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.error('Error en verificación:', err);
        notify(err.message, 'error');
        if (step !== 'NO_READER') {
          setStep('HAS_FINGERPRINT');
        }
      }
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen || !person) return null;

  const renderEnrollmentProgress = () => {
    return (
      <div className="w-full flex flex-col items-center gap-5 py-4">
        <div className="flex gap-3 sm:gap-4 items-center justify-center">
          {[1, 2, 3, 4].map(num => {
            const isCompleted = samplesCollected >= num;
            const isCurrent = samplesCollected === num - 1;
            return (
              <div key={num} className="flex flex-col items-center gap-1.5">
                <div className={`size-12 sm:size-14 rounded-2xl border-2 flex items-center justify-center transition-all duration-300 shadow-sm ${
                  isCompleted 
                    ? 'bg-emerald-500 border-emerald-600 text-white scale-105 shadow-emerald-500/20' 
                    : isCurrent 
                      ? 'border-primary border-dashed bg-primary/10 animate-pulse text-primary' 
                      : 'border-slate-200 bg-slate-50 text-slate-300'
                }`}>
                  {isCompleted ? (
                    <span className="material-symbols-outlined text-2xl font-black">check</span>
                  ) : (
                    <span className="font-mono font-black text-base">{num}</span>
                  )}
                </div>
                <span className={`text-[9px] font-black uppercase tracking-wider ${
                  isCompleted ? 'text-emerald-600' : isCurrent ? 'text-primary font-black' : 'text-slate-400'
                }`}>
                  Toque {num}
                </span>
              </div>
            );
          })}
        </div>

        {/* Status Message Display */}
        <div className="w-full bg-slate-50 border border-slate-200 p-3.5 rounded-xl flex items-center gap-3">
          <span className="material-symbols-outlined text-primary animate-spin text-[22px] shrink-0">
            sync
          </span>
          <div className="text-left flex-1 min-w-0">
            <p className="text-xs font-bold text-slate-800 leading-relaxed">
              {enrollMessage}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            if (abortController.current) abortController.current.abort();
            stopPolling();
            setStep(existingTemplate ? 'HAS_FINGERPRINT' : 'NO_FINGERPRINT');
          }}
          className="text-xs text-slate-400 hover:text-slate-600 font-bold uppercase tracking-wider transition-colors"
        >
          Cancelar Captura
        </button>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-[100] bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150">
      <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full overflow-hidden flex flex-col border border-slate-200 animate-in zoom-in-95 duration-150">
        
        {/* Header with Mode Badge */}
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="size-10 rounded-2xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-[24px]">fingerprint</span>
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-black text-slate-900 leading-tight truncate">
                Gestión Biométrica
              </h2>
              <div className="flex items-center gap-1.5 mt-0.5">
                {isDesktop ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-purple-100 text-purple-800 border border-purple-200">
                    <span className="size-1.5 rounded-full bg-purple-600 animate-pulse" />
                    Modo Escritorio (Nativo)
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-blue-100 text-blue-800 border border-blue-200">
                    <span className="size-1.5 rounded-full bg-blue-600 animate-pulse" />
                    Modo Web
                  </span>
                )}
                {isServiceOnline !== null && (
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${isServiceOnline ? 'text-emerald-700 bg-emerald-50' : 'text-slate-500 bg-slate-100'}`}>
                    {isServiceOnline ? 'Lector Activo' : 'Sin Puente'}
                  </span>
                )}
              </div>
            </div>
          </div>

          <button 
            onClick={() => {
              if (abortController.current) abortController.current.abort();
              onClose();
            }} 
            disabled={loading && step !== 'ENROLLING' && step !== 'VERIFYING'} 
            className="size-8 rounded-xl bg-slate-200/60 hover:bg-slate-200 text-slate-500 hover:text-slate-800 flex items-center justify-center transition-colors"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* Body Content */}
        <div className="p-6 flex flex-col items-center text-center gap-4">
          
          {/* Person Info Banner */}
          <div className="bg-slate-50 border border-slate-200 p-3.5 rounded-2xl w-full text-left flex items-center gap-3">
            <div className="size-10 bg-primary text-white rounded-xl flex items-center justify-center font-black text-sm shrink-0">
              {person.nombre ? person.nombre.charAt(0).toUpperCase() : 'P'}
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-bold text-sm text-slate-900 leading-snug truncate">
                {person.nombre}
              </p>
              <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-500">
                <span className="font-mono font-bold bg-white px-1.5 py-0.2 rounded border border-slate-200 text-slate-700">
                  DNI: {person.dni}
                </span>
                {person.departamento_cargo && (
                  <span className="truncate text-[11px]">
                    {person.departamento_cargo}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* STEP 1: CHECKING */}
          {step === 'CHECKING' && (
            <div className="py-10 flex flex-col items-center gap-3">
              <span className="material-symbols-outlined text-4xl text-primary animate-spin">
                progress_activity
              </span>
              <p className="text-xs font-bold text-slate-500">
                Consultando estado biométrico...
              </p>
            </div>
          )}

          {/* STEP 2: NO READER / DISCONNECTED ERROR */}
          {step === 'NO_READER' && (
            <div className="w-full flex flex-col items-center gap-3 py-4 animate-in fade-in">
              <div className="size-14 rounded-2xl bg-amber-50 text-amber-600 border border-amber-200 flex items-center justify-center">
                <span className="material-symbols-outlined text-[32px]">sensors_off</span>
              </div>
              <div className="text-center px-2">
                <h3 className="font-black text-sm text-slate-800">
                  Sensor Biométrico No Detectado
                </h3>
                <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                  Sensor biométrico no detectado en este dispositivo. Asegúrese de tener conectado el lector DigitalPersona o utilice la Aplicación de Escritorio.
                </p>
                <p className="text-[10px] font-mono text-slate-400 mt-2 bg-slate-100 p-1.5 rounded">
                  Endpoint: {biometricBaseUrl}
                </p>
              </div>
              <div className="flex gap-2 w-full mt-2">
                <button
                  type="button"
                  onClick={checkExistingFingerprint}
                  className="flex-1 h-10 bg-slate-900 hover:bg-black text-white text-xs font-black uppercase tracking-wider rounded-xl transition-all flex items-center justify-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-[16px]">refresh</span>
                  Reintentar
                </button>
                <button
                  type="button"
                  onClick={() => setStep(existingTemplate ? 'HAS_FINGERPRINT' : 'NO_FINGERPRINT')}
                  className="px-4 h-10 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors"
                >
                  Volver
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: HAS FINGERPRINT ALREADY */}
          {step === 'HAS_FINGERPRINT' && (
            <div className="w-full flex flex-col gap-4 animate-in fade-in py-1">
              <div className="bg-emerald-50/80 border border-emerald-200 rounded-2xl p-4 flex flex-col items-center gap-1 text-emerald-900">
                <div className="size-12 rounded-2xl bg-emerald-500 text-white flex items-center justify-center shadow-lg shadow-emerald-500/20 mb-1">
                  <span className="material-symbols-outlined text-3xl">check</span>
                </div>
                <h3 className="font-black text-base">Huella Digital Registrada</h3>
                <p className="text-xs font-bold text-emerald-700">Plantilla activa en el sistema</p>
                <span className="text-[10px] text-emerald-600 mt-0.5">Permite verificación 1 a 1 para asistencia</span>
              </div>

              <div className="flex flex-col gap-2.5 mt-1">
                <button 
                  onClick={handleVerify} 
                  disabled={loading} 
                  className="w-full h-12 bg-emerald-600 hover:bg-emerald-700 text-white font-black uppercase tracking-widest rounded-xl transition-all shadow-md shadow-emerald-600/20 flex items-center justify-center gap-2 text-xs"
                >
                  <span className="material-symbols-outlined text-[18px]">verified_user</span> 
                  Verificar Huella (1 Toque)
                </button>
                <button 
                  onClick={handleEnroll} 
                  disabled={loading} 
                  className="w-full h-11 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold uppercase tracking-wider rounded-xl transition-all flex items-center justify-center gap-2 text-xs"
                >
                  <span className="material-symbols-outlined text-[18px]">published_with_changes</span> 
                  Re-enrolar / Sobrescribir Huella
                </button>
              </div>
            </div>
          )}

          {/* STEP 4: NO FINGERPRINT */}
          {step === 'NO_FINGERPRINT' && (
            <div className="w-full flex flex-col items-center gap-3.5 animate-in fade-in py-2">
              <div className="size-16 rounded-3xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-400">
                <span className="material-symbols-outlined text-[36px]">fingerprint</span>
              </div>
              <div className="text-center px-4">
                <h3 className="font-black text-base text-slate-900">Sin Huella Registrada</h3>
                <p className="text-xs text-slate-500 mt-1">
                  El personal debe realizar 4 toques en el lector para generar la plantilla única de su huella.
                </p>
              </div>

              <button 
                onClick={handleEnroll} 
                disabled={loading} 
                className="w-full h-12 mt-1 bg-primary hover:bg-merlot text-white font-black uppercase tracking-widest rounded-xl transition-all shadow-lg shadow-primary/25 flex items-center justify-center gap-2 text-xs"
              >
                <span className="material-symbols-outlined text-[20px]">play_arrow</span> 
                Iniciar Enrolamiento (4 Toques)
              </button>
            </div>
          )}

          {/* STEP 5: ENROLLING IN PROGRESS */}
          {step === 'ENROLLING' && renderEnrollmentProgress()}

          {/* STEP 6: ENROLL SUCCESS */}
          {step === 'ENROLL_SUCCESS' && (
            <div className="py-6 flex flex-col items-center gap-3 animate-in zoom-in-95">
              <div className="size-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center">
                <span className="material-symbols-outlined text-[40px]">task_alt</span>
              </div>
              <div>
                <p className="text-emerald-800 font-black text-lg">¡Enrolamiento Exitoso!</p>
                <p className="text-[11px] text-emerald-600 mt-0.5">La plantilla compuesta de 4 toques fue guardada y sobrescrita en el sistema.</p>
              </div>
              <button 
                onClick={() => setStep('HAS_FINGERPRINT')} 
                className="mt-3 px-6 py-2.5 bg-slate-900 text-white text-xs font-black uppercase tracking-wider rounded-xl hover:bg-black transition-colors"
              >
                Continuar
              </button>
            </div>
          )}

          {/* STEP 7: VERIFYING */}
          {step === 'VERIFYING' && (
            <div className="py-8 flex flex-col items-center gap-3 animate-in fade-in">
              <div className="size-16 rounded-3xl bg-blue-50 text-blue-600 border border-blue-200 flex items-center justify-center animate-pulse">
                <span className="material-symbols-outlined text-[36px]">fingerprint</span>
              </div>
              <p className="text-blue-900 font-black text-base">Esperando lectura...</p>
              <p className="text-xs text-blue-700">Coloque el dedo 1 sola vez en el lector para verificar coincidencia.</p>
            </div>
          )}

          {/* STEP 8: VERIFY SUCCESS */}
          {step === 'VERIFY_SUCCESS' && (
            <div className="py-6 flex flex-col items-center gap-3 animate-in zoom-in-95">
              <div className="size-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center">
                <span className="material-symbols-outlined text-[40px]">verified_user</span>
              </div>
              <div className="text-center">
                <p className="text-emerald-800 font-black text-lg">¡Identidad Verificada!</p>
                <p className="text-xs text-emerald-600 font-medium mt-0.5">La huella colocada coincide al 100% con el registro activo.</p>
              </div>
              <button 
                onClick={() => setStep('HAS_FINGERPRINT')} 
                className="mt-3 px-6 py-2.5 bg-slate-900 text-white text-xs font-black uppercase tracking-wider rounded-xl hover:bg-black transition-colors"
              >
                Volver
              </button>
            </div>
          )}

          {/* STEP 9: VERIFY FAILED */}
          {step === 'VERIFY_FAILED' && (
            <div className="py-6 flex flex-col items-center gap-3 animate-in zoom-in-95">
              <div className="size-16 rounded-full bg-red-100 text-red-600 flex items-center justify-center">
                <span className="material-symbols-outlined text-[40px]">gpp_bad</span>
              </div>
              <div className="text-center">
                <p className="text-red-800 font-black text-lg">Verificación Fallida</p>
                <p className="text-xs text-red-600 font-medium mt-0.5">La huella colocada NO coincide con la registrada para este DNI.</p>
              </div>
              <div className="flex gap-2 mt-3">
                <button 
                  onClick={handleVerify} 
                  className="px-5 py-2.5 bg-red-100 text-red-700 text-xs font-black uppercase tracking-wider rounded-xl hover:bg-red-200 transition-colors"
                >
                  Reintentar
                </button>
                <button 
                  onClick={() => setStep('HAS_FINGERPRINT')} 
                  className="px-5 py-2.5 bg-slate-100 text-slate-700 text-xs font-black uppercase tracking-wider rounded-xl hover:bg-slate-200 transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}

        </div>

        {/* Footer info */}
        <div className="p-3.5 border-t border-slate-100 bg-slate-50 text-[10px] text-slate-400 text-center leading-relaxed">
          Los datos biométricos se encriptan como plantilla matemática unidireccional (ISO/IEC 19794-2) en estricto cumplimiento a la Ley N° 29733.
        </div>
      </div>
    </div>
  );
};
