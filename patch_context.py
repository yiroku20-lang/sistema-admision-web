import re

with open('pages/ExamBudget.tsx', 'r') as f:
    content = f.read()

# 1. Update the modal filtering logic
modal_bad = """                <div>
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
                </div>"""

modal_good = """                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">Modalidad</label>
                  <select 
                    className="w-full p-3 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 focus:outline-none focus:border-primary bg-slate-50 disabled:opacity-50"
                    value={tempModalidad}
                    onChange={(e) => setTempModalidad(e.target.value)}
                    disabled={!tempCuadro}
                  >
                    <option value="">Seleccione Modalidad</option>
                    {modalidades.filter(m => m.cuadro_id === tempCuadro).map(m => (
                      <option key={m.id} value={m.id}>{m.nombre}</option>
                    ))}
                  </select>
                </div>"""

content = content.replace(modal_bad, modal_good)

# 2. Remove Contexto de Planificacion
context_regex = re.compile(r'<div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 print:shadow-none print:border-none print:p-0">\s*<h2 className="text-sm font-black text-slate-800 uppercase tracking-wider mb-4 print:hidden">Contexto de Planificación</h2>.*?</div>\s*</div>', re.DOTALL)

match = context_regex.search(content)
if match:
    # Wait, the end of Contexto includes the print:flex part for Total Personal
    print_flex_replacement = """          <div className="hidden print:flex justify-between items-center bg-gray-100 p-4 rounded-lg font-bold mb-6">
             <div>Total Personal: {totalPersonal} req.</div>
             <div>Presupuesto Total: S/ {totalGeneral.toLocaleString('es-PE', { minimumFractionDigits: 2 })}</div>
          </div>"""
    content = content[:match.start()] + print_flex_replacement + "\n" + content[match.end():]
else:
    print("Warning: Could not find regex for Contexto de Planificacion")

with open('pages/ExamBudget.tsx', 'w') as f:
    f.write(content)
