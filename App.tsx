
import React, { useState, useEffect } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { supabase, clearStaleAuthTokens } from './lib/supabaseClient';
import { initKeepAliveSystem } from './lib/keepAlive';
import { Sidebar } from './components/Sidebar';
import { Dashboard } from './pages/Dashboard';
import { IncomingFiles } from './pages/IncomingFiles';
import { OutgoingFiles } from './pages/OutgoingFiles';
import { StudentLookup } from './pages/StudentLookup';
import { Templates } from './pages/Templates';
import { TemplateEditor } from './pages/TemplateEditor';
import { Resolutions } from './pages/Resolutions';
import { Resignations } from './pages/Resignations';
import { TransferRefunds } from './pages/TransferRefunds';
import { Loans } from './pages/Loans';
import { VacancyReservation } from './pages/VacancyReservation';
import { VacancyChart } from './pages/VacancyChart';
import { Attendance } from './pages/Attendance';
import { CalendarEvents } from './pages/CalendarEvents';
import { VocationalOrientation } from './pages/VocationalOrientation';
import { SystemLogs } from './pages/SystemLogs';
import { Settings } from './pages/Settings';
import { DataCleanup } from './pages/DataCleanup';
import { StaffManagement } from './pages/StaffManagement';
import { StaffConfirmation } from './pages/StaffConfirmation';
import { MeetingMinutes } from './pages/MeetingMinutes';
import ApplicantPreReview from './pages/ApplicantPreReview';
import Adjudication from './pages/Adjudication';
import { VacancyEvolution } from './pages/VacancyEvolution';
import { ExamBudget } from './pages/ExamBudget';
import { IngresantesReport } from './pages/IngresantesReport';
import { Login } from './pages/Login';
import { Unsubscribe } from './pages/Unsubscribe';
import { ChatBot } from './components/ChatBot';
import { ToastContainer } from './components/Toast';
import { User, ToastMessage } from './types';

function App() {
  const [user, setUser] = useState<User | null>(() => {
    try {
      const saved = localStorage.getItem('unsaac_auth_user');
      if (saved) return JSON.parse(saved);
    } catch(e) {}
    return null;
  });
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(() => {
    try {
      return !localStorage.getItem('unsaac_auth_user');
    } catch(e) {
      return true;
    }
  });

  useEffect(() => {
    let isMounted = true;

    // Initialize Supabase Keep-Alive & Auto-Reconnect system
    const cleanupKeepAlive = initKeepAliveSystem();

    // Safety timeout: ensure loading spinner never blocks the user for more than 500ms
    const safetyTimeout = setTimeout(() => {
      if (isMounted) {
        setIsCheckingAuth(false);
      }
    }, 500);

    const initAuth = () => {
      try {
        const savedUserStr = localStorage.getItem('unsaac_auth_user');
        if (savedUserStr) {
          try {
            const parsed = JSON.parse(savedUserStr);
            if (parsed && isMounted) {
              setUser(parsed);
            }
          } catch (e) {}
        }
      } catch (err: any) {
        console.warn('Session check warning:', err);
      } finally {
        if (isMounted) {
          setIsCheckingAuth(false);
        }
      }
    };

    initAuth();

    return () => {
      isMounted = false;
      clearTimeout(safetyTimeout);
      cleanupKeepAlive();
    };
  }, []);

  const addToast = (message: string, type: ToastMessage['type'] = 'success') => {
    const id = Date.now().toString();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => removeToast(id), 5000);
  };

  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  const handleLogout = async () => {
    try {
      if (user?.name) {
        await supabase.from('tramite_seguimiento').insert([{
          action_type: 'Sistema',
          description: 'Cierre de Sesión',
          user_name: user.name
        }]);
      }
    } catch(e) {}
    try {
      localStorage.removeItem('unsaac_auth_user');
    } catch(e) {}
    setUser(null);
    clearStaleAuthTokens();
    try {
      await supabase.auth.signOut({ scope: 'local' });
    } catch(e) {}
  };

  if (isCheckingAuth) {
    return <div className="flex h-screen items-center justify-center bg-slate-900"><span className="material-symbols-outlined animate-spin text-white text-4xl">progress_activity</span></div>;
  }

  return (
    <HashRouter>
      <ToastContainer toasts={toasts} onClose={removeToast} />
      {!user ? (
        <Routes>
          <Route path="/login" element={<Login onLogin={(u) => { setUser(u); addToast(`Bienvenido, ${u.name}`); }} />} />
          <Route path="/staff-confirm" element={<StaffConfirmation />} />
          <Route path="/unsubscribe" element={<Unsubscribe />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      ) : (
        <div className="flex h-screen w-full bg-[#f8fafc] overflow-hidden">
          <ChatBot />
          <Sidebar user={user} onLogout={handleLogout} isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />
          
          <main className="flex-1 flex flex-col h-full overflow-hidden bg-[#f8fafc] relative">
            <header className="md:hidden flex items-center justify-between p-4 bg-white border-b border-slate-200 shrink-0 print:hidden">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary">school</span>
                <span className="font-bold text-lg">UNSAAC</span>
              </div>
              <button className="p-2" onClick={() => setIsSidebarOpen(true)}><span className="material-symbols-outlined">menu</span></button>
            </header>

            <div className="flex-1 overflow-y-auto">
              <Routes>
                <Route path="/" element={<Dashboard user={user} />} />
                <Route path="/incoming" element={<IncomingFiles user={user} notify={addToast} />} />
                <Route path="/outgoing" element={<OutgoingFiles user={user} />} />
                <Route path="/lookup" element={<StudentLookup user={user} />} />
                <Route path="/resolutions" element={<Resolutions user={user} />} />
                <Route path="/payments" element={<TransferRefunds user={user} />} />
                
                {/* Rutas Protegidas por Rol y Permisos */}
                {(user.role === 'Administrador' || (user.role === 'Operador' && user.permissions?.includes('view_prestamos'))) && (
                  <Route path="/loans" element={<Loans user={user} notify={addToast} />} />
                )}
                {(user.role === 'Administrador' || (user.role === 'Operador' && user.permissions?.includes('view_orientacion'))) && (
                  <Route path="/orientation" element={<VocationalOrientation user={user} notify={addToast} />} />
                )}
                {(user.role === 'Administrador' || (user.role === 'Operador' && user.permissions?.includes('view_plantillas'))) && (
                  <>
                    <Route path="/templates" element={<Templates />} />
                    <Route path="/templates/:id" element={<TemplateEditor user={user} />} />
                  </>
                )}
                {(user.role === 'Administrador' || (user.role === 'Operador' && user.permissions?.includes('view_renuncias'))) && (
                  <Route path="/resignations" element={<Resignations user={user} />} />
                )}
                {(user.role === 'Administrador' || (user.role === 'Operador' && user.permissions?.includes('view_reserva'))) && (
                  <Route path="/vacancy" element={<VacancyReservation user={user} notify={addToast} />} />
                )}
                {(user.role === 'Administrador' || (user.role === 'Operador' && user.permissions?.includes('view_cuadro_vacantes'))) && (
                  <Route path="/vacancies" element={<VacancyChart user={user} notify={addToast} />} />
                )}
                {(user.role === 'Administrador' || (user.role === 'Operador' && user.permissions?.includes('view_asistencia'))) && (
                  <Route path="/attendance" element={<Attendance user={user} notify={addToast} />} />
                )}
                {(user.role === 'Administrador' || user.role === 'Director' || (user.role === 'Operador' && user.permissions?.includes('view_actas'))) && (
                  <Route path="/actas" element={<MeetingMinutes user={user} notify={addToast} />} />
                )}
                {/* Adjudicación */}
                {(user.role === 'Administrador' || user.role === 'Director' || (user.role === 'Operador' && user.permissions?.includes('view_adjudicaciones'))) && (
                  <Route path="/adjudication" element={<Adjudication />} />
                )}
                {(user.role === 'Administrador' || user.role === 'Director' || (user.role === 'Operador' && user.permissions?.includes('view_vacancy_evolution'))) && (
                  <Route path="/vacancy-evolution" element={<VacancyEvolution user={user} notify={addToast} />} />
                )}
                {(user.role === 'Administrador' || user.role === 'Director' || (user.role === 'Operador' && user.permissions?.includes('view_pre_review'))) && (
                  <Route path="/pre-review" element={<ApplicantPreReview user={user} notify={addToast} />} />
                )}
                
                {(user.role === 'Administrador' || user.role === 'Director' || (user.role === 'Operador' && user.permissions?.includes('view_presupuesto'))) && (
                  <Route path="/budget" element={<ExamBudget user={user} notify={addToast} />} />
                )}
                
                {/* Agenda / Calendario */}
                {(user.role === 'Administrador' || (user.role === 'Operador' && user.permissions?.includes('view_agenda'))) && (
                  <Route path="/calendar" element={<CalendarEvents user={user} notify={addToast} />} />
                )}
                
                {(user.role === 'Administrador' || (user.role === 'Operador' && user.permissions?.includes('view_auditoria'))) && (
                  <Route path="/logs" element={<SystemLogs />} />
                )}
                
                {user.role === 'Administrador' && (
                  <Route path="/data-cleanup" element={<DataCleanup user={user} />} />
                )}
                
                {(user.role === 'Administrador' || user.role === 'Director' || (user.role === 'Operador' && user.permissions?.includes('view_personal'))) && (
                  <Route path="/staff" element={<StaffManagement user={user} notify={addToast} />} />
                )}
                
                {(user.role === 'Administrador' || user.role === 'Director' || (user.role === 'Operador' && user.permissions?.includes('view_reporte_ingresantes'))) && (
                  <Route path="/reporte-ingresantes" element={<IngresantesReport user={user} notify={addToast} />} />
                )}
                
                <Route path="/staff-confirm" element={<StaffConfirmation />} />
                <Route path="/unsubscribe" element={<Unsubscribe />} />

                <Route path="/settings" element={<Settings user={user} notify={addToast} />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
              <footer className="p-6 text-center text-[10px] font-black text-slate-300 uppercase tracking-widest border-t border-slate-100 mt-auto">
                © 2024 Dirección de Admisión UNSAAC • Conectado como {user.name} ({user.role})
              </footer>
            </div>
          </main>
        </div>
      )}
    </HashRouter>
  );
}

export default App;
