import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  person: any; // PersonalDirectorio
  notify: (msg: string, type?: 'success' | 'error' | 'warning' | 'info') => void;
}

export const BiometricEnrollModal: React.FC<Props> = ({ isOpen, onClose, person, notify }) => {
  const [step, setStep] = useState<'IDLE' | 'ENROLLING' | 'SUCCESS'>('IDLE');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setStep('IDLE');
    }
  }, [isOpen]);

  if (!isOpen || !person) return null;

  const handleEnroll = async () => {
    setLoading(true);
    setStep('ENROLLING');
    try {
      // Check if BiometricBridge is online
      try {
        const res = await fetch('http://localhost:8081/ping', { method: 'GET', signal: AbortSignal.timeout(2500) });
        if (!res.ok) throw new Error('Servicio no responde');
      } catch (err) {
        throw new Error('No se detectó el servicio BiometricBridge.exe en esta PC. Asegúrate de iniciarlo.');
      }

      notify('Por favor coloque su [Dedo Índice Derecho] 4 veces en el lector cuando el led parpadee.', 'info');
      
      const enrollRes = await fetch('http://localhost:8081/enroll', { 
        method: 'POST',
        signal: AbortSignal.timeout(30000) // 30 seconds for 4 touches
      });
      const enrollData = await enrollRes.json();

      if (!enrollRes.ok || !enrollData.success) {
        throw new Error(enrollData.error || 'Error en la captura de huella.');
      }

      const templateBase64 = enrollData.template;

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

      setStep('SUCCESS');
      notify('Huella registrada exitosamente en la base de datos.', 'success');

      // Quick verification
      notify('Por favor coloque el dedo 1 vez más para comprobación de verificación...', 'info');
      const verifyRes = await fetch('http://localhost:8081/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template: templateBase64 }),
        signal: AbortSignal.timeout(10000)
      });
      const verifyData = await verifyRes.json();
      
      if (verifyRes.ok && verifyData.success && verifyData.verified) {
         notify('¡Comprobación exitosa! La huella funciona al 100%.', 'success');
      } else {
         notify('La comprobación falló, recomendamos enrolar nuevamente.', 'warning');
      }

    } catch (err: any) {
      console.error(err);
      notify(err.message, 'error');
      setStep('IDLE');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full overflow-hidden flex flex-col">
        <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <h2 className="text-lg font-black text-slate-800 flex items-center gap-2">
            <span className="material-symbols-outlined text-primary">fingerprint</span>
            Enrolar Huella Digital
          </h2>
          <button onClick={onClose} disabled={loading} className="text-slate-400 hover:text-slate-600">
             <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="p-6 flex flex-col items-center text-center gap-4">
           <div className="bg-blue-50 text-blue-800 p-4 rounded-xl w-full text-left text-sm font-medium">
             Personal: <span className="font-black">{person.nombre}</span> <br/>
             DNI: <span className="font-black">{person.dni}</span>
           </div>

           {step === 'IDLE' && (
             <div className="flex flex-col items-center gap-2">
                <span className="material-symbols-outlined text-[64px] text-slate-300">touch_app</span>
                <p className="text-slate-600 text-sm">
                  Asegúrese de conectar el lector DigitalPersona e inicie el servicio BiometricBridge.exe
                </p>
                <p className="text-xs font-bold text-slate-800 bg-amber-100 px-3 py-1 rounded-full mt-2">
                  Dedo recomendado: Índice Derecho
                </p>
             </div>
           )}

           {step === 'ENROLLING' && (
             <div className="flex flex-col items-center gap-4 animate-pulse">
                <span className="material-symbols-outlined text-[64px] text-primary">sensors</span>
                <p className="text-primary font-bold">Por favor coloque el dedo 4 veces...</p>
             </div>
           )}

           {step === 'SUCCESS' && (
             <div className="flex flex-col items-center gap-4">
                <span className="material-symbols-outlined text-[64px] text-emerald-500">check_circle</span>
                <p className="text-emerald-700 font-bold">¡Huella enrolada correctamente!</p>
             </div>
           )}
        </div>

        <div className="p-6 border-t border-slate-100 bg-slate-50 flex flex-col gap-3">
          {step === 'IDLE' && (
             <button onClick={handleEnroll} disabled={loading} className="w-full bg-primary hover:bg-primary/90 text-white font-black uppercase text-xs tracking-wider py-3 rounded-xl transition-all active:scale-95 flex justify-center gap-2">
               <span className="material-symbols-outlined text-[16px]">play_arrow</span> Iniciar Enrolamiento
             </button>
          )}
          {step === 'SUCCESS' && (
             <button onClick={onClose} className="w-full bg-slate-800 hover:bg-black text-white font-black uppercase text-xs tracking-wider py-3 rounded-xl transition-all active:scale-95">
               Finalizar
             </button>
          )}
          
          <p className="text-[9px] text-slate-400 text-center leading-tight">
             Nota legal: Los datos biométricos son procesados de forma encriptada como plantilla matemática unidireccional, sin almacenar imágenes de la huella, en cumplimiento a la Ley de Protección de Datos Personales N° 29733.
          </p>
        </div>
      </div>
    </div>
  );
}
