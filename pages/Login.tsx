
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import logoImg from '../logo_admision.png';

interface Props {
  onLogin: (user: any) => void;
}

export const Login: React.FC<Props> = ({ onLogin }) => {
  const navigate = useNavigate();
  const [dni, setDni] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
        // 1. Iniciar sesión usando Supabase Auth (Seguro, maneja los JWT automáticamente)
        const email = `${dni.trim()}@admin.unsaac.pe`;
        
        const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
            email,
            password: password.trim()
        });

        if (authError) {
            console.error(authError);
            setError('Credenciales incorrectas o usuario no existe.');
            setIsLoading(false);
            return;
        }

        // 2. Obtener los roles y permisos del perfil del usuario
        const { data: userData, error: dbError } = await supabase
            .from('usuarios')
            .select('*')
            .eq('id', authData.user.id)
            .maybeSingle();

        if (dbError || !userData) {
            console.error(dbError);
            setError('No se pudo obtener el perfil de usuario.');
            // Deslogueamos si no hay perfil válido
            await supabase.auth.signOut();
            setIsLoading(false);
            return;
        }

        // Login exitoso
        try {
            await supabase.from('tramite_seguimiento').insert([{
                action_type: 'Sistema',
                description: 'Inicio de Sesión',
                user_name: userData.name,
            }]);
        } catch(e) {}
        onLogin(userData);
        navigate('/');
    } catch (err: any) {
        setError('Error inesperado del servidor.');
        setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-slate-900">
        <div className="absolute inset-0 opacity-40 grayscale pointer-events-none overflow-hidden">
             <img src="https://unsaac.edu.pe/wp-content/uploads/2023/10/banner-unsaac-scaled.jpg" className="w-full h-full object-cover blur-sm" alt="Background" />
        </div>
        
        <div className="relative z-10 w-full max-w-md p-10 bg-white rounded-[40px] shadow-2xl animate-in zoom-in-95 duration-500">
            <div className="flex flex-col items-center mb-10">
                <img src={logoImg} className="h-24 mb-6 object-contain" alt="Admisión UNSAAC" />
                <h1 className="font-cinzel text-2xl font-black text-primary text-center">Gestión Admisión</h1>
                <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest mt-2">Consola de Seguridad Central</p>
            </div>

            <form onSubmit={handleLogin} className="flex flex-col gap-5">
                <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-black text-slate-500 uppercase ml-2">DNI del Usuario</label>
                    <div className="relative">
                        <span className="material-symbols-outlined absolute left-4 top-3.5 text-slate-400">badge</span>
                        <input 
                            type="text" 
                            required 
                            maxLength={8}
                            value={dni}
                            onChange={e => setDni(e.target.value.replace(/\D/g, ''))}
                            className="w-full h-14 pl-12 pr-4 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-primary focus:bg-white outline-none font-bold text-slate-700 transition-all text-xl tracking-widest"
                            placeholder="Ej: 12345678"
                            autoFocus
                        />
                    </div>
                </div>

                <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-black text-slate-500 uppercase ml-2">Contraseña</label>
                    <div className="relative">
                        <span className="material-symbols-outlined absolute left-4 top-3.5 text-slate-400">lock</span>
                        <input 
                            type="password" 
                            required 
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            className="w-full h-14 pl-12 pr-4 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-primary focus:bg-white outline-none font-bold text-slate-700 transition-all placeholder:tracking-normal"
                            placeholder="••••••••"
                        />
                    </div>
                </div>

                {error && (
                    <div className="bg-red-50 border border-red-100 p-3 rounded-xl flex items-center gap-2 animate-bounce">
                        <span className="material-symbols-outlined text-red-500 text-sm">warning</span>
                        <p className="text-[10px] font-black text-red-600 uppercase">{error}</p>
                    </div>
                )}

                <button 
                    disabled={isLoading}
                    className="w-full h-16 bg-primary text-white rounded-3xl font-black uppercase tracking-widest shadow-2xl shadow-primary/30 hover:bg-merlot active:scale-95 transition-all flex items-center justify-center gap-3 mt-4"
                >
                    {isLoading ? <span className="material-symbols-outlined animate-spin">progress_activity</span> : <span className="material-symbols-outlined">verified_user</span>}
                    {isLoading ? 'VERIFICANDO...' : 'ACCEDER AL SISTEMA'}
                </button>
            </form>

            <p className="text-center text-[10px] text-slate-400 font-bold uppercase mt-12 tracking-tighter">
                Personal autorizado únicamente <br/> Dirección de Admisión - UNSAAC
            </p>
        </div>
    </div>
  );
};
