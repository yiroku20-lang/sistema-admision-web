import re

with open('pages/ExamBudget.tsx', 'r') as f:
    content = f.read()

# 1. Add states for modal
state_idx = content.find("const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>({});")
content = content[:state_idx] + "const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);\n  const [tempCuadro, setTempCuadro] = useState('');\n  const [tempModalidad, setTempModalidad] = useState('');\n  " + content[state_idx:]

# 2. Modify handleCreateNew and add confirmCreateNew
old_handle = """  const handleCreateNew = () => {
    setCurrentBudget(null);
    setSelectedCuadro('');
    setSelectedModalidad('');
    setBudgetItems([]);
    setRoleSchedules([]);
    setActiveTab('Presupuesto');
    setView('editor');
  };"""

new_handle = """  const handleCreateNew = () => {
    setTempCuadro(cuadros[0]?.id || '');
    setTempModalidad(modalidades[0]?.id || '');
    setIsCreateModalOpen(true);
  };

  const confirmCreateNew = () => {
    if (!tempCuadro || !tempModalidad) {
      notify?.('Debe seleccionar un Cuadro Anual y una Modalidad', 'warning');
      return;
    }
    setCurrentBudget(null);
    setSelectedCuadro(tempCuadro);
    setSelectedModalidad(tempModalidad);
    setBudgetItems([]);
    setRoleSchedules([]);
    setActiveTab('Presupuesto');
    setView('editor');
    setIsCreateModalOpen(false);
  };"""

content = content.replace(old_handle, new_handle)

# 3. Modify editor header
old_editor_header_p = """<p className="text-xs font-bold text-slate-400 mt-1">Configure los rubros y el cronograma del examen.</p>"""
new_editor_header_p = """<p className="text-xs font-bold text-slate-400 mt-1">Cuadro: {getCuadroName(selectedCuadro)} | Modalidad: {getModalidadName(selectedModalidad)}</p>"""
content = content.replace(old_editor_header_p, new_editor_header_p)

# 4. Remove Contexto de Planificacion
old_context = """          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 print:shadow-none print:border-none print:p-0">
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
                  disabled={isLocked}
                >
                  <option value="">Seleccione Modalidad</option>
                  {modalidades.map(m => (
                    <option key={m.id} value={m.id}>{m.nombre}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>"""

# Ensure we actually find and replace it
if old_context in content:
    content = content.replace(old_context, "")
else:
    print("Warning: Could not find old context to replace.")

# 5. Inject the Create Modal into the dashboard view, just before `</div>` (the main wrapper of dashboard view)
# We can find the end of `view === 'dashboard'` block
dashboard_end_marker = """            )}
          </div>
        </div>
      </div>
    );
  }"""

new_dashboard_end = """            )}
          </div>
        </div>
        
        {isCreateModalOpen && (
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
              <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                <h3 className="font-black text-slate-800 uppercase tracking-tight text-sm">Nuevo Presupuesto</h3>
                <button onClick={() => setIsCreateModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                  <span className="material-symbols-outlined text-[20px]">close</span>
                </button>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">Cuadro Anual</label>
                  <select 
                    className="w-full p-3 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 focus:outline-none focus:border-primary bg-slate-50"
                    value={tempCuadro}
                    onChange={(e) => setTempCuadro(e.target.value)}
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
                    className="w-full p-3 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 focus:outline-none focus:border-primary bg-slate-50"
                    value={tempModalidad}
                    onChange={(e) => setTempModalidad(e.target.value)}
                  >
                    <option value="">Seleccione Modalidad</option>
                    {modalidades.map(m => (
                      <option key={m.id} value={m.id}>{m.nombre}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-2 bg-slate-50/50">
                <button 
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-200 bg-slate-100 rounded-xl text-xs font-bold uppercase tracking-wider transition-colors"
                >
                  Cancelar
                </button>
                <button 
                  onClick={confirmCreateNew}
                  className="px-4 py-2 bg-primary hover:bg-primary/90 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-colors shadow-sm"
                >
                  Crear Presupuesto
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }"""

content = content.replace(dashboard_end_marker, new_dashboard_end)

with open('pages/ExamBudget.tsx', 'w') as f:
    f.write(content)

print("Modal patched")
