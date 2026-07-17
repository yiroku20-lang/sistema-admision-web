
import React, { useState, useEffect } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { supabase } from './lib/supabaseClient';
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
import { Login } from './pages/Login';
import { Unsubscribe } from './pages/Unsubscribe';
import { ChatBot } from './components/ChatBot';
import { ToastContainer } from './components/Toast';
import { User, ToastMessage } from './types';

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);

  useEffect(() => {
    // Check active session on load
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        // Fetch the user's profile from the 'usuarios' table
        supabase.from('usuarios').select('*').eq('id', session.user.id).maybeSingle()
          .then(({ data }) => {
            if (data) setUser(data as User);
            setIsCheckingAuth(false);
          });
      } else {
        setIsCheckingAuth(false);
      }
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        setUser(null);
      }
    });

    return () => {
      authListener.subscription.unsubscribe();
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

  if (isCheckingAuth) {
    return <div className="flex h-screen items-center justify-center bg-slate-900"><span className="material-symbols-outlined animate-spin text-white text-4xl">progress_activity</span></div>;
  }

  if (!user) {
    return (
      <HashRouter>
        <Routes>
          <Route path="/login" element={<Login onLogin={(u) => { setUser(u); addToast(`Bienvenido, ${u.name}`); }} />} />
          <Route path="/staff-confirm" element={<StaffConfirmation />} />
          <Route path="/unsubscribe" element={<Unsubscribe />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
        <ToastContainer toasts={toasts} onClose={removeToast} />
      </HashRouter>
    );
  }

  return (
    <HashRouter>
      <div className="flex h-screen w-full bg-[#f8fafc] overflow-hidden">
        <ChatBot />
        <ToastContainer toasts={toasts} onClose={removeToast} />
        <Sidebar user={user} onLogout={async () => {
          try {
              await supabase.from('tramite_seguimiento').insert([{
                  action_type: 'Sistema',
                  description: 'Cierre de Sesión',
                  user_name: user?.name || 'Usuario'
              }]);
          } catch(e) {}
          setUser(null); 
          await supabase.auth.signOut(); 
        }} isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />
        
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
              {(user.role === 'Administrador' || user.role === 'Director') && (
                <Route path="/vacancy-evolution" element={<VacancyEvolution user={user} notify={addToast} />} />
              )}
              {(user.role === 'Administrador' || user.role === 'Director' || user.role === 'Operador') && (
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
    </HashRouter>
  );
}

export default App;
