
import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { NavItem, User } from '../types';

interface SidebarProps {
  user: User;
  onLogout: () => void;
  isOpen?: boolean;
  onClose?: () => void;
}

const navItems: (NavItem & { permission?: string })[] = [
  { label: 'Panel Principal', icon: 'dashboard', path: '/' },
  { label: 'Expedientes Entrantes', icon: 'move_to_inbox', path: '/incoming', permission: 'view_expedientes' },
  { label: 'Expedientes Salida', icon: 'outbox', path: '/outgoing', permission: 'view_expedientes' },
  { label: 'Transferencias y Devol.', icon: 'payments', path: '/payments', permission: 'view_transferencias' },
  { label: 'Trámite Renuncias', icon: 'block', path: '/resignations', roles: ['Administrador'], permission: 'view_renuncias' },
  { label: 'Reserva Vacante', icon: 'calendar_month', path: '/vacancy', roles: ['Administrador'], permission: 'view_reserva' },
  { label: 'Cuadro Vacantes', icon: 'grid_on', path: '/vacancies', roles: ['Administrador'], permission: 'view_cuadro_vacantes' },
  { label: 'Búsqueda Estudiante', icon: 'assignment_ind', path: '/lookup', permission: 'view_busqueda' },
  { label: 'Marketing y Prospectos', icon: 'campaign', path: '/orientation', permission: 'view_orientacion' },
  { label: 'Préstamo de Bienes', icon: 'devices', path: '/loans', permission: 'view_prestamos' },
  { label: 'Gestión Plantillas', icon: 'article', path: '/templates', roles: ['Administrador'], permission: 'view_plantillas' },
  { label: 'Resoluciones', icon: 'gavel', path: '/resolutions', permission: 'view_resoluciones' },
  { label: 'Actas de Sesiones', icon: 'history_edu', path: '/actas', roles: ['Administrador', 'Director'], permission: 'view_actas' },
  { label: 'Agenda de Eventos', icon: 'calendar_today', path: '/calendar', permission: 'view_agenda' },
  { label: 'Control Asistencia', icon: 'fingerprint', path: '/attendance', permission: 'view_asistencia' },
  { label: 'Adjudicaciones', icon: 'stars', path: '/adjudication', roles: ['Administrador', 'Director'], permission: 'view_adjudicaciones' },
  { label: 'Evolución Vacantes', icon: 'trending_up', path: '/vacancy-evolution', roles: ['Administrador', 'Director'], permission: 'view_vacancy_evolution' },
  { label: 'Pre-revisión Postulantes', icon: 'plagiarism', path: '/pre-review', roles: ['Administrador', 'Director'], permission: 'view_pre_review' },
  { label: 'Presupuesto Examen', icon: 'request_quote', path: '/budget', roles: ['Administrador', 'Director'], permission: 'view_presupuesto' },
  { label: 'Auditoría y Logs', icon: 'bar_chart', path: '/logs', roles: ['Administrador'], permission: 'view_auditoria' },
  { label: 'Limpieza de Datos', icon: 'cleaning_services', path: '/data-cleanup', roles: ['Administrador'] },
  { label: 'Reporte Ingresantes', icon: 'school', path: '/reporte-ingresantes', roles: ['Administrador', 'Director', 'Operador'], permission: 'view_reporte_ingresantes' },
  { label: 'Gestión de Personal', icon: 'badge', path: '/staff', roles: ['Administrador', 'Director'], permission: 'view_personal' },
];

export const Sidebar: React.FC<SidebarProps> = ({ user, onLogout, isOpen, onClose }) => {
  const location = useLocation();
  const navigate = useNavigate();

  let filteredNavItems = navItems.filter(item => {
    // 1. Si es Operador y la pestaña tiene un permiso específico configurado
    if (user.role === 'Operador' && item.permission) {
      return user.permissions?.includes(item.permission);
    }
    
    // 2. Para los demás roles (o si la pestaña no tiene permiso específico), verificamos el arreglo de roles
    if (item.roles && !item.roles.includes(user.role)) {
      return false;
    }
    
    return true;
  });

  // Si es un operador sin permiso general de expedientes, añadimos "Mis Expedientes"
  if (user.role === 'Operador' && !user.permissions?.includes('view_expedientes')) {
    filteredNavItems = [
      ...filteredNavItems.slice(0, 1), // Después de "Panel Principal"
      { label: 'Mis Expedientes', icon: 'assignment', path: '/incoming?filter=Asignados%20a%20M%C3%AD' },
      ...filteredNavItems.slice(1)
    ];
  }

  return (
    <>
      {/* Mobile Overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/50 z-40 md:hidden backdrop-blur-sm transition-opacity"
          onClick={onClose}
        />
      )}
      
      <aside className={`fixed md:static inset-y-0 left-0 flex h-full w-72 flex-col border-r border-slate-200 bg-white shadow-2xl z-50 transition-transform duration-300 ease-in-out print:hidden ${isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
        <div className="flex flex-col h-full justify-between p-6">
          <div className="flex flex-col gap-8">
            <div className="flex gap-4 items-center justify-between">
              <div className="flex gap-4 items-center">
                <div className="bg-primary/5 p-3 rounded-2xl border border-primary/10">
                    <img src="https://lh3.googleusercontent.com/d/1yN0_dziHYCbHPOnDb1Y7qYvHno-mUY7M" alt="Logo Admisión" className="size-10 object-contain"/>
                </div>
                <div className="flex flex-col">
                  <h1 className="text-slate-900 text-sm font-black uppercase tracking-tighter leading-tight">Admisión UNSAAC</h1>
                  <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest leading-none mt-1">Consola Admin</p>
                </div>
              </div>
              <button onClick={onClose} className="md:hidden p-2 text-slate-400 hover:text-slate-900">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

          <div className="bg-slate-50 p-4 rounded-2xl flex items-center gap-3 border border-slate-100 shadow-inner">
             <div className="size-10 rounded-full bg-primary text-white flex items-center justify-center font-black text-sm border-2 border-white shadow-sm">
                {user.name.charAt(0)}
             </div>
             <div className="flex flex-col overflow-hidden">
                <p className="text-xs font-black text-slate-800 truncate">{user.name}</p>
                <p className="text-[9px] font-black text-primary uppercase tracking-widest">{user.role}</p>
             </div>
          </div>

          <nav className="flex flex-col gap-1 overflow-y-auto hide-scrollbar max-h-[calc(100vh-350px)]">
            {filteredNavItems.map((item) => {
              const isActive = location.pathname.startsWith(item.path) && (item.path !== '/' || location.pathname === '/');
              return (
                <button
                  key={item.path}
                  onClick={() => { navigate(item.path); onClose?.(); }}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-left group ${
                    isActive
                      ? 'bg-primary text-white shadow-lg shadow-primary/20 scale-[1.02]'
                      : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
                  }`}
                >
                  <span className={`material-symbols-outlined text-[20px] ${isActive ? 'text-white' : 'text-slate-400 group-hover:text-primary'}`}>
                    {item.icon}
                  </span>
                  <p className="text-xs font-black uppercase tracking-tight">
                    {item.label}
                  </p>
                </button>
              );
            })}
          </nav>
        </div>

        <div className="flex flex-col gap-2 pt-6">
            <button 
                onClick={() => { navigate('/settings'); onClose?.(); }}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-left ${
                    location.pathname === '/settings' ? 'bg-slate-800 text-white shadow-lg' : 'text-slate-500 hover:bg-slate-50'
                }`}
            >
                <span className="material-symbols-outlined text-[20px]">settings</span>
                <span className="text-xs font-black uppercase tracking-tight">Configuración</span>
            </button>
            <button 
                onClick={() => { onLogout(); onClose?.(); }}
                className="flex w-full items-center gap-3 rounded-xl py-3 px-4 hover:bg-red-50 text-red-600 transition-all group"
            >
                <span className="material-symbols-outlined text-[20px]">logout</span>
                <span className="text-xs font-black uppercase tracking-tight">
                    Cerrar Sesión
                </span>
            </button>
        </div>
        </div>
      </aside>
    </>
  );
};
