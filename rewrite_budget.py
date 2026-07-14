import re

content = """import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';
import { User, BudgetRole, RoleSchedule, ScheduleEvent, ExamBudgetRecord } from '../types';

interface ExamBudgetProps {
  user: User;
  notify?: (msg: string, type?: 'success' | 'error' | 'warning' | 'info') => void;
}

const MAX_PAYMENT = 6000;

export const AutoResizeTextarea = ({ value, onChange, readOnly, placeholder, className }: any) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const adjustHeight = () => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${textarea.scrollHeight}px`;
    }
  };
  useEffect(() => {
    adjustHeight();
  }, [value]);
  return (
    <textarea
      ref={textareaRef}
      value={value}
      onChange={onChange}
      readOnly={readOnly}
      rows={1}
      placeholder={placeholder}
      className={className}
      style={{
        resize: 'none',
        overflow: 'hidden',
        width: '100%',
        background: 'transparent',
        outline: 'none'
      }}
    />
  );
};

export const ExamBudget: React.FC<ExamBudgetProps> = ({ user, notify }) => {
  const [view, setView] = useState<'dashboard' | 'editor'>('dashboard');
  const [activeTab, setActiveTab] = useState<'Presupuesto' | 'Cronograma'>('Presupuesto');
  const [isLoading, setIsLoading] = useState(true);
  
  const [cuadros, setCuadros] = useState<any[]>([]);
  const [modalidades, setModalidades] = useState<any[]>([]);
  const [savedBudgets, setSavedBudgets] = useState<ExamBudgetRecord[]>([]);
  
  const [currentBudget, setCurrentBudget] = useState<ExamBudgetRecord | null>(null);

  // Editor states
  const [selectedCuadro, setSelectedCuadro] = useState<string>('');
  const [selectedModalidad, setSelectedModalidad] = useState<string>('');
  const [budgetItems, setBudgetItems] = useState<BudgetRole[]>([]);
  const [roleSchedules, setRoleSchedules] = useState<RoleSchedule[]>([]);
  const [isLocked, setIsLocked] = useState(false);

  useEffect(() => {
    fetchConfig();
    loadSavedBudgets();
  }, []);

  useEffect(() => {
    if (currentBudget) {
      const locked = localStorage.getItem(`unsaac_budget_locked_${currentBudget.id}`) === 'true';
      setIsLocked(locked);
    } else {
      setIsLocked(false);
    }
  }, [currentBudget]);

  const toggleLock = () => {
    if (!currentBudget) return;
    const newLock = !isLocked;
    setIsLocked(newLock);
    localStorage.setItem(`unsaac_budget_locked_${currentBudget.id}`, String(newLock));
    notify?.(newLock ? 'Presupuesto bloqueado' : 'Presupuesto desbloqueado', 'info');
  };

  const fetchConfig = async () => {
    setIsLoading(true);
    try {
      const [cuadrosRes, modalidadesRes] = await Promise.all([
        supabase.from('cv_cuadros_anuales').select('*').order('created_at', { ascending: false }),
        supabase.from('cv_modalidades').select('*')
      ]);

      if (cuadrosRes.data) setCuadros(cuadrosRes.data);
      if (modalidadesRes.data) setModalidades(modalidadesRes.data);
    } catch (error) {
      console.error(error);
    }
    setIsLoading(false);
  };

  const loadSavedBudgets = () => {
    const data = localStorage.getItem('exam_budgets');
    if (data) {
      setSavedBudgets(JSON.parse(data));
    }
  };

  const persistBudgets = (budgets: ExamBudgetRecord[]) => {
    localStorage.setItem('exam_budgets', JSON.stringify(budgets));
    setSavedBudgets(budgets);
  };

  const handleCreateNew = () => {
    setCurrentBudget(null);
    setSelectedCuadro('');
    setSelectedModalidad('');
    setBudgetItems([]);
    setRoleSchedules([]);
    setActiveTab('Presupuesto');
    setView('editor');
  };

  const handleEditBudget = (budget: ExamBudgetRecord) => {
    setCurrentBudget(budget);
    setSelectedCuadro(budget.cuadro_anual_id);
    setSelectedModalidad(budget.modalidad_id);
    setBudgetItems(budget.items || []);
    setRoleSchedules(budget.schedules || []);
    setActiveTab('Presupuesto');
    setView('editor');
  };

  const handleDeleteBudget = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('¿Está seguro de eliminar este presupuesto?')) {
      const updated = savedBudgets.filter(b => b.id !== id);
      persistBudgets(updated);
      notify?.('Presupuesto eliminado', 'success');
    }
  };

  const saveCurrentBudget = () => {
    if (!selectedCuadro || !selectedModalidad) {
      notify?.('Seleccione un cuadro y modalidad antes de guardar', 'warning');
      return;
    }
    
    const total_general = budgetItems.reduce((acc, item) => acc + item.total, 0);

    const record: ExamBudgetRecord = {
      id: currentBudget ? currentBudget.id : crypto.randomUUID(),
      cuadro_anual_id: selectedCuadro,
      modalidad_id: selectedModalidad,
      items: budgetItems,
      total_general,
      schedules: roleSchedules,
      created_at: currentBudget ? currentBudget.created_at : new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    let newBudgets = [...savedBudgets];
    if (currentBudget) {
      newBudgets = newBudgets.map(b => b.id === record.id ? record : b);
    } else {
      newBudgets.push(record);
    }

    persistBudgets(newBudgets);
    setCurrentBudget(record);
    notify?.('Presupuesto y cronograma guardados exitosamente', 'success');
  };

  const handlePrint = () => {
    window.print();
  };

  // Rest of budget logic
  const loadTemplate = () => {
    if (isLocked) return;
    const template: BudgetRole[] = [
      { id: crypto.randomUUID(), rubro: '1', category: 'AUTORIDADES', subcategory: '', role: 'Rector', condition: 'D', indicator: 1.0, quantity: 1, unit_cost: 0, total: 0 },
      { id: crypto.randomUUID(), rubro: '1', category: 'AUTORIDADES', subcategory: '', role: 'Vicerrector Académico', condition: 'D', indicator: 0.98, quantity: 1, unit_cost: 0, total: 0 },
      { id: crypto.randomUUID(), rubro: '1', category: 'AUTORIDADES', subcategory: '', role: 'Decano Comisión Elaboradora de Prueba', condition: 'D', indicator: 1.0, quantity: 2, unit_cost: 6000, total: 12000 },
      { id: crypto.randomUUID(), rubro: '2', category: 'DIRECCIÓN DE ADMISIÓN', subcategory: '', role: 'Director General de Admisión', condition: 'D', indicator: 1.0, quantity: 1, unit_cost: 6000, total: 6000 },
      { id: crypto.randomUUID(), rubro: '3.1', category: 'PERSONAL DOCENTE Y APOYO', subcategory: 'Inscripcion del postulante', role: 'Coordinador Responsable de Inscripción', condition: 'D', indicator: 0.30, quantity: 3, unit_cost: 1800, total: 5400 },
    ];
    setBudgetItems(template);
    notify?.('Plantilla cargada', 'success');
  };

  const addBudgetItem = () => {
    if (isLocked) return;
    setBudgetItems([...budgetItems, { id: crypto.randomUUID(), rubro: '', category: '', subcategory: '', role: '', condition: '', indicator: 0, quantity: 1, unit_cost: 0, total: 0 }]);
  };

  const updateBudgetItem = (id: string, field: keyof BudgetRole, value: string | number) => {
    if (isLocked) return;
    setBudgetItems(items => items.map(item => {
      if (item.id === id) {
        const updated = { ...item, [field]: value };
        if (field === 'indicator') {
          updated.unit_cost = MAX_PAYMENT * Number(updated.indicator);
        }
        updated.total = Number(updated.quantity) * Number(updated.unit_cost);
        return updated;
      }
      return item;
    }));
  };

  const removeBudgetItem = (id: string) => {
    if (isLocked) return;
    setBudgetItems(items => items.filter(i => i.id !== id));
  };

  const totalGeneral = budgetItems.reduce((acc, item) => acc + item.total, 0);
  const totalPersonal = budgetItems.reduce((acc, item) => (item.condition === 'D' || item.condition === 'A') ? acc + item.quantity : acc, 0);

  const rolesWithStaff = budgetItems.filter(i => i.quantity > 0 && i.role.trim() !== '' && (i.condition === 'D' || i.condition === 'A'));
  const getScheduleForRole = (roleName: string) => roleSchedules.find(s => s.roleName === roleName) || { id: crypto.randomUUID(), roleName, events: [] };

  const addEventToRole = (roleName: string) => {
    if (isLocked) return;
    setRoleSchedules(prev => {
      const existing = prev.find(s => s.roleName === roleName);
      const newEvent: ScheduleEvent = { id: crypto.randomUUID(), time: '08:00', activity: 'Nueva actividad', location: 'Pabellón' };
      if (existing) {
        return prev.map(s => s.roleName === roleName ? { ...s, events: [...s.events, newEvent].sort((a,b)=>a.time.localeCompare(b.time)) } : s);
      } else {
        return [...prev, { id: crypto.randomUUID(), roleName, events: [newEvent] }];
      }
    });
  };

  const updateEvent = (roleName: string, eventId: string, field: keyof ScheduleEvent, value: string) => {
    if (isLocked) return;
    setRoleSchedules(prev => prev.map(s => s.roleName === roleName ? { ...s, events: s.events.map(e => e.id === eventId ? { ...e, [field]: value } : e).sort((a,b)=>a.time.localeCompare(b.time)) } : s));
  };

  const removeEvent = (roleName: string, eventId: string) => {
    if (isLocked) return;
    setRoleSchedules(prev => prev.map(s => s.roleName === roleName ? { ...s, events: s.events.filter(e => e.id !== eventId) } : s));
  };

  const getCuadroName = (id: string) => cuadros.find(c => c.id === id)?.anio || 'Cuadro Desconocido';
  const getModalidadName = (id: string) => modalidades.find(m => m.id === id)?.nombre || 'Modalidad Desconocida';

  if (isLoading) return <div className="p-8 flex justify-center"><span className="material-symbols-outlined animate-spin text-4xl text-primary">progress_activity</span></div>;

  if (view === 'dashboard') {
    return (
      <div className="flex flex-col h-full bg-slate-50">
        <header className="bg-white px-8 py-6 border-b border-slate-200 shrink-0 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-black text-slate-800 uppercase tracking-tighter">Presupuestos de Examen</h1>
            <p className="text-sm font-bold text-slate-400 mt-1">Administre los presupuestos y cronogramas por modalidad.</p>
          </div>
          <button onClick={handleCreateNew} className="px-4 py-2.5 bg-primary hover:bg-primary/90 text-white rounded-xl text-sm font-bold uppercase tracking-wider transition-colors flex items-center gap-2 shadow-sm">
            <span className="material-symbols-outlined text-[20px]">add</span>
            Nuevo Presupuesto
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-8">
          <div className="max-w-7xl mx-auto">
            {savedBudgets.length === 0 ? (
              <div className="text-center p-12 border-2 border-dashed border-slate-300 rounded-3xl bg-white shadow-sm flex flex-col items-center justify-center">
                <span className="material-symbols-outlined text-6xl text-slate-300 mb-4">request_quote</span>
                <p className="text-slate-500 font-bold text-lg">No hay presupuestos creados aún.</p>
                <p className="text-slate-400 text-sm mt-2 max-w-md">Cree un nuevo presupuesto seleccionando un Cuadro Anual y una Modalidad aprobada para empezar a gestionar los rubros y el cronograma del examen.</p>
                <button onClick={handleCreateNew} className="mt-6 px-6 py-2.5 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-sm font-bold uppercase tracking-wider transition-colors">
                  Empezar Ahora
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {savedBudgets.map(budget => (
                  <div key={budget.id} onClick={() => handleEditBudget(budget)} className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm hover:shadow-md hover:border-primary/30 transition-all cursor-pointer group relative">
                    <button onClick={(e) => handleDeleteBudget(budget.id, e)} className="absolute top-4 right-4 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">
                       <span className="material-symbols-outlined text-[20px]">delete</span>
                    </button>
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center text-primary">
                        <span className="material-symbols-outlined text-2xl">account_balance_wallet</span>
                      </div>
                      <div>
                        <h3 className="font-black text-slate-800 uppercase tracking-tight text-sm line-clamp-2">{getModalidadName(budget.modalidad_id)}</h3>
                        <p className="text-[10px] font-bold text-slate-400 tracking-wider">CUADRO ANUAL {getCuadroName(budget.cuadro_anual_id)}</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-100">
                      <div>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Costo Total</p>
                        <p className="font-black text-emerald-600">S/ {budget.total_general.toLocaleString('es-PE', { minimumFractionDigits: 2 })}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Personal</p>
                        <p className="font-bold text-slate-700">{budget.items?.reduce((acc, i) => (i.condition === 'D' || i.condition === 'A') ? acc + i.quantity : acc, 0) || 0} Req.</p>
                      </div>
                    </div>
                    <p className="text-[10px] text-slate-400 font-bold mt-4 text-center">Última modif. {new Date(budget.updated_at).toLocaleDateString()}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-slate-50 print:bg-white print:text-black">
      <header className="bg-white px-8 py-6 border-b border-slate-200 shrink-0 flex items-center justify-between print:hidden">
        <div className="flex items-center gap-4">
          <button onClick={() => setView('dashboard')} className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-full transition-colors flex items-center justify-center">
            <span className="material-symbols-outlined text-[20px]">arrow_back</span>
          </button>
          <div>
            <h1 className="text-xl font-black text-slate-800 uppercase tracking-tighter">
              {currentBudget ? 'Editar Presupuesto' : 'Nuevo Presupuesto'}
            </h1>
            <p className="text-xs font-bold text-slate-400 mt-1">Configure los rubros y el cronograma del examen.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {currentBudget && (
             <button onClick={toggleLock} className={`px-4 py-2 border rounded-xl text-sm font-bold uppercase tracking-wider transition-colors flex items-center gap-2 shadow-sm ${isLocked ? 'bg-red-50 text-red-600 border-red-200 hover:bg-red-100' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>
                <span className="material-symbols-outlined text-[18px]">{isLocked ? 'lock' : 'lock_open'}</span>
                {isLocked ? 'Bloqueado' : 'Desbloqueado'}
             </button>
          )}
          <button onClick={handlePrint} className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-sm font-bold uppercase tracking-wider transition-colors flex items-center gap-2 shadow-sm">
            <span className="material-symbols-outlined text-[20px]">print</span>
            Imprimir
          </button>
          <button onClick={saveCurrentBudget} disabled={isLocked} className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-bold uppercase tracking-wider transition-colors flex items-center gap-2 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed">
            <span className="material-symbols-outlined text-[20px]">save</span>
            Guardar Cambios
          </button>
        </div>
      </header>

      {/* Título solo visible en impresión */}
      <div className="hidden print:block p-8 pb-4">
        <h1 className="text-2xl font-black text-black uppercase tracking-tighter text-center">Presupuesto de Examen de Admisión</h1>
        <p className="text-sm font-bold text-gray-600 mt-1 text-center">
          Cuadro Anual: {getCuadroName(selectedCuadro)} | Modalidad: {getModalidadName(selectedModalidad)}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-8 print:p-0 print:overflow-visible">
        <div className="max-w-7xl mx-auto space-y-6 print:max-w-none print:w-full">
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 print:shadow-none print:border-none print:p-0">
            <h2 className="text-sm font-black text-slate-800 uppercase tracking-wider mb-4 print:hidden">Contexto de Planificación</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 print:hidden">
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">Cuadro Anual</label>
                <select 
                  className="w-full p-3 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 focus:outline-none focus:border-primary bg-slate-50 disabled:opacity-50"
                  value={selectedCuadro}
                  onChange={(e) => setSelectedCuadro(e.target.value)}
                  disabled={isLocked}
                >
                  <option value="">Seleccione Cuadro</option>
                  {cuadros.map(c => (
                    <option key={c.id} value={c.id}>{c.anio}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">Modalidad</label>
                <select 
                  className="w-full p-3 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 focus:outline-none focus:border-primary bg-slate-50 disabled:opacity-50"
                  value={selectedModalidad}
                  onChange={(e) => setSelectedModalidad(e.target.value)}
                  disabled={!selectedCuadro || isLocked}
                >
                  <option value="">Seleccione Modalidad</option>
                  {modalidades.filter(m => m.cuadro_id === selectedCuadro).map(m => (
                    <option key={m.id} value={m.id}>{m.nombre}</option>
                  ))}
                </select>
              </div>
            </div>
            
            <div className="hidden print:flex justify-between items-center bg-gray-100 p-4 rounded-lg font-bold">
               <div>Total Personal: {totalPersonal} req.</div>
               <div>Presupuesto Total: S/ {totalGeneral.toLocaleString('es-PE', { minimumFractionDigits: 2 })}</div>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden print:shadow-none print:border-none print:rounded-none">
            <div className="flex border-b border-slate-100 print:hidden">
              <button 
                onClick={() => setActiveTab('Presupuesto')}
                className={`flex-1 p-4 text-sm font-black uppercase tracking-wider transition-colors border-b-2 ${activeTab === 'Presupuesto' ? 'border-primary text-primary bg-primary/5' : 'border-transparent text-slate-500 hover:bg-slate-50'}`}
              >
                1. Rubros del Presupuesto
              </button>
              <button 
                onClick={() => setActiveTab('Cronograma')}
                className={`flex-1 p-4 text-sm font-black uppercase tracking-wider transition-colors border-b-2 ${activeTab === 'Cronograma' ? 'border-primary text-primary bg-primary/5' : 'border-transparent text-slate-500 hover:bg-slate-50'}`}
              >
                2. Instructivos y Cronograma
              </button>
            </div>

            {activeTab === 'Presupuesto' && (
              <div className="p-6 print:p-0">
                <div className="flex justify-between items-center mb-4 print:hidden">
                  <h3 className="text-sm font-black text-slate-800 uppercase tracking-tight">Detalle de Costos Operativos</h3>
                  <button onClick={loadTemplate} disabled={isLocked} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold uppercase tracking-wider transition-colors flex items-center gap-2 disabled:opacity-50">
                    <span className="material-symbols-outlined text-[16px]">library_add</span>
                    Cargar Plantilla Base
                  </button>
                </div>

                <div className="overflow-x-auto rounded-xl border border-slate-200 print:border-none print:rounded-none">
                  <table className="w-full text-left print:text-xs">
                    <thead className="bg-slate-50 text-[10px] font-black text-slate-500 uppercase tracking-wider print:bg-gray-100 print:text-black">
                      <tr>
                        <th className="p-3 w-16">Rubro</th>
                        <th className="p-3">Categoría / Rol</th>
                        <th className="p-3 w-16 text-center">Cond.</th>
                        <th className="p-3 w-20 text-center">Ind.</th>
                        <th className="p-3 w-20 text-center">Cant.</th>
                        <th className="p-3 w-28 text-right">Cost. Un. (S/)</th>
                        <th className="p-3 w-28 text-right">Total (S/)</th>
                        <th className="p-3 w-10 text-center print:hidden"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-sm print:divide-gray-200 print:text-black">
                      {budgetItems.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="p-8 text-center text-slate-400 font-bold print:hidden">
                            No hay rubros añadidos. Carga una plantilla o agrega uno nuevo.
                          </td>
                        </tr>
                      ) : (
                        budgetItems.map((item, index) => (
                          <tr key={`${currentBudget?.id || 'new'}-${item.id}-${index}`} className="hover:bg-slate-50/50 print:break-inside-avoid">
                            <td className="p-2 align-top">
                              <input type="text" value={item.rubro} onChange={e => updateBudgetItem(item.id, 'rubro', e.target.value)} readOnly={isLocked} className="w-full p-2 border border-slate-200 rounded-lg focus:border-primary outline-none font-mono text-xs bg-white disabled:bg-slate-50 print:border-none print:p-0 print:bg-transparent print:text-black" placeholder="1.1" />
                            </td>
                            <td className="p-2 align-top">
                               <div className="flex flex-col gap-1">
                                  <input type="text" value={item.category} onChange={e => updateBudgetItem(item.id, 'category', e.target.value)} readOnly={isLocked} className="w-full p-1 border border-transparent hover:border-slate-200 rounded focus:border-primary outline-none font-black text-[10px] uppercase text-slate-400 disabled:bg-transparent print:border-none print:p-0 print:text-gray-500" placeholder="CATEGORÍA..." />
                                  <AutoResizeTextarea value={item.role} onChange={(e: any) => updateBudgetItem(item.id, 'role', e.target.value)} readOnly={isLocked} className="font-bold text-slate-700 disabled:text-slate-500 print:text-black" placeholder="Descripción del cargo o bien..." />
                               </div>
                            </td>
                            <td className="p-2 align-top">
                              <input type="text" value={item.condition} onChange={e => updateBudgetItem(item.id, 'condition', e.target.value)} readOnly={isLocked} className="w-full p-2 border border-slate-200 rounded-lg focus:border-primary outline-none text-center font-bold bg-white uppercase disabled:bg-slate-50 print:border-none print:p-0 print:bg-transparent print:text-black" placeholder="A/D" />
                            </td>
                            <td className="p-2 align-top">
                              <input type="number" min="0" step="0.01" value={item.indicator} onChange={e => updateBudgetItem(item.id, 'indicator', parseFloat(e.target.value) || 0)} readOnly={isLocked} className="w-full p-2 border border-slate-200 rounded-lg focus:border-primary outline-none text-center font-mono bg-white disabled:bg-slate-50 print:border-none print:p-0 print:bg-transparent print:text-black" />
                            </td>
                            <td className="p-2 align-top">
                              <input type="number" min="0" value={item.quantity} onChange={e => updateBudgetItem(item.id, 'quantity', parseFloat(e.target.value) || 0)} readOnly={isLocked} className="w-full p-2 border border-slate-200 rounded-lg focus:border-primary outline-none text-center font-bold bg-white disabled:bg-slate-50 print:border-none print:p-0 print:bg-transparent print:text-black" />
                            </td>
                            <td className="p-2 align-top">
                              <input type="number" min="0" value={item.unit_cost} onChange={e => updateBudgetItem(item.id, 'unit_cost', parseFloat(e.target.value) || 0)} readOnly={isLocked} className="w-full p-2 border border-slate-200 rounded-lg focus:border-primary outline-none text-right font-mono bg-white disabled:bg-slate-50 print:border-none print:p-0 print:bg-transparent print:text-black" />
                            </td>
                            <td className="p-2 align-top text-right font-black text-emerald-600 bg-emerald-50/30 rounded-lg print:bg-transparent print:text-black">
                              {item.total.toLocaleString('es-PE', { minimumFractionDigits: 2 })}
                            </td>
                            <td className="p-2 align-top text-center print:hidden">
                              {!isLocked && (
                                <button onClick={() => removeBudgetItem(item.id)} className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors mx-auto">
                                  <span className="material-symbols-outlined text-[18px]">delete</span>
                                </button>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                    <tfoot className="bg-slate-800 text-white border-t border-slate-200 print:bg-gray-100 print:text-black">
                      <tr>
                        <td colSpan={4} className="p-4 font-black uppercase tracking-tight text-xs print:text-black">
                           Total Personal: <span className="text-emerald-400 print:text-black">{totalPersonal} req.</span>
                        </td>
                        <td colSpan={2} className="p-4 text-right font-black uppercase tracking-tight print:text-black">Presupuesto Total</td>
                        <td className="p-4 text-right font-black text-lg text-emerald-400 print:text-black">S/ {totalGeneral.toLocaleString('es-PE', { minimumFractionDigits: 2 })}</td>
                        <td className="print:hidden"></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {!isLocked && (
                  <button onClick={addBudgetItem} className="mt-4 w-full py-4 border-2 border-dashed border-slate-300 rounded-xl text-sm font-bold text-slate-500 hover:text-primary hover:border-primary hover:bg-primary/5 transition-colors flex items-center justify-center gap-2 uppercase tracking-wider print:hidden">
                    <span className="material-symbols-outlined">add_circle</span>
                    Añadir Nuevo Rubro
                  </button>
                )}
              </div>
            )}

            {activeTab === 'Cronograma' && (
              <div className="p-6 print:p-0">
                <div className="flex justify-between items-center mb-6 print:hidden">
                  <div>
                    <h3 className="text-sm font-black text-slate-800 uppercase tracking-tight">Cronograma e Instructivos por Rol</h3>
                    <p className="text-xs text-slate-500 mt-1">Genere la línea de tiempo de instrucciones para el personal programado.</p>
                  </div>
                </div>

                {rolesWithStaff.length === 0 ? (
                  <div className="text-center p-12 border-2 border-dashed border-slate-300 rounded-2xl bg-slate-50 print:hidden">
                    <span className="material-symbols-outlined text-5xl text-slate-300 mb-3">assignment_late</span>
                    <p className="text-slate-600 font-bold text-lg">No hay personal operativo definido.</p>
                    <p className="text-slate-400 text-sm mt-1">Agregue rubros con cantidades mayores a 0 en la pestaña de Presupuesto para generar los roles.</p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {rolesWithStaff.map((role, idx) => {
                      const schedule = getScheduleForRole(role.role);
                      return (
                        <div key={idx} className="border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-sm print:border-none print:shadow-none print:mb-8 print:break-inside-avoid">
                          <div className="bg-slate-800 p-4 border-b border-slate-200 flex justify-between items-center print:bg-gray-100 print:border-b-2 print:border-black">
                            <div>
                              <h4 className="font-black text-white text-sm uppercase print:text-black">{role.role}</h4>
                              <p className="text-[10px] text-slate-400 font-bold tracking-wider mt-0.5 print:text-gray-600">CANTIDAD: {role.quantity} | CONDICIÓN: {role.condition}</p>
                            </div>
                            {!isLocked && (
                               <button onClick={() => addEventToRole(role.role)} className="px-3 py-1.5 bg-white/10 hover:bg-white text-white hover:text-slate-900 border border-white/20 rounded-lg text-xs font-bold transition-colors flex items-center gap-1 print:hidden">
                                 <span className="material-symbols-outlined text-[16px]">add_task</span>
                                 Añadir Actividad
                               </button>
                            )}
                          </div>
                          <div className="p-5 bg-slate-50/50 print:bg-white print:p-2">
                            {schedule.events.length === 0 ? (
                              <p className="text-sm text-slate-400 italic text-center py-4 print:text-black">Sin actividades programadas para este rol.</p>
                            ) : (
                              <div className="space-y-4 print:space-y-2">
                                {schedule.events.map((ev, eIdx) => (
                                  <div key={`${currentBudget?.id || 'new'}-${ev.id}`} className="flex flex-col md:flex-row gap-4 items-start bg-white p-4 rounded-xl border border-slate-200 shadow-sm relative group print:border-b print:rounded-none print:shadow-none print:p-2">
                                    {!isLocked && (
                                      <button onClick={() => removeEvent(role.role, ev.id)} className="absolute -top-2 -right-2 w-6 h-6 bg-red-100 text-red-600 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-sm border border-red-200 hover:bg-red-500 hover:text-white print:hidden">
                                         <span className="material-symbols-outlined text-[14px]">close</span>
                                      </button>
                                    )}
                                    
                                    <div className="w-full md:w-32 shrink-0">
                                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1 print:hidden">Hora</label>
                                      <input 
                                        type="time" 
                                        value={ev.time} 
                                        onChange={e => updateEvent(role.role, ev.id, 'time', e.target.value)} 
                                        readOnly={isLocked}
                                        className="w-full p-2 border border-slate-200 rounded-lg text-sm font-bold focus:border-primary outline-none bg-slate-50 disabled:bg-slate-50 print:border-none print:p-0 print:bg-transparent print:text-black"
                                      />
                                    </div>
                                    
                                    <div className="flex-1 w-full space-y-3 print:space-y-1">
                                      <div>
                                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1 print:hidden">Instrucción / Actividad</label>
                                        <input 
                                          type="text" 
                                          placeholder="¿Qué debe hacer?"
                                          value={ev.activity} 
                                          onChange={e => updateEvent(role.role, ev.id, 'activity', e.target.value)} 
                                          readOnly={isLocked}
                                          className="w-full p-2 border border-slate-200 rounded-lg text-sm font-bold text-slate-800 focus:border-primary outline-none disabled:bg-slate-50 print:border-none print:p-0 print:bg-transparent print:text-black"
                                        />
                                      </div>
                                      <div>
                                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1 print:hidden">Ubicación (Opcional)</label>
                                        <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-2 focus-within:border-primary print:border-none print:bg-transparent print:px-0">
                                          <span className="material-symbols-outlined text-[16px] text-slate-400 print:text-black">location_on</span>
                                          <input 
                                            type="text" 
                                            placeholder="Ej. Puerta Principal, Pabellón A..."
                                            value={ev.location} 
                                            onChange={e => updateEvent(role.role, ev.id, 'location', e.target.value)} 
                                            readOnly={isLocked}
                                            className="w-full p-2 text-xs font-bold text-slate-600 border-none outline-none bg-transparent disabled:opacity-70 print:text-black print:p-0"
                                          />
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
"""

with open('pages/ExamBudget.tsx', 'w') as f:
    f.write(content)

print("pages/ExamBudget.tsx rewritten")
