const fs = require('fs');
let content = fs.readFileSync('pages/ApplicantPreReview.tsx', 'utf8');

// Add selectedSemestre
content = content.replace(
  "const [selectedCuadro, setSelectedCuadro] = useState('');",
  "const [selectedCuadro, setSelectedCuadro] = useState('');\n  const [selectedSemestre, setSelectedSemestre] = useState('');"
);

// Update useEffect for selectedCuadro
content = content.replace(
  "setSelectedModalidad('');\n  }, [selectedCuadro]);",
  "setSelectedModalidad('');\n    setSelectedSemestre('');\n  }, [selectedCuadro]);"
);

// Get available semesters and filtered modalidades
content = content.replace(
  "const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {",
  "const availableSemesters = Array.from(new Set(modalidades.map(m => m.semestre))).sort();\n  const filteredModalidades = modalidades.filter(m => m.semestre === selectedSemestre);\n\n  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {"
);

// Update UI
const oldGrid = `<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Cuadro Anual</label>
                <select 
                  className="w-full p-3 rounded-xl border border-slate-200 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary text-sm"
                  value={selectedCuadro}
                  onChange={(e) => setSelectedCuadro(e.target.value)}
                >
                  <option value="">Seleccione un cuadro</option>
                  {cuadros.map(c => (
                    <option key={c.id} value={c.id}>{c.anio} - {c.estado}</option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Modalidad</label>
                <select 
                  className="w-full p-3 rounded-xl border border-slate-200 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary text-sm disabled:bg-slate-50 disabled:text-slate-400"
                  value={selectedModalidad}
                  onChange={(e) => setSelectedModalidad(e.target.value)}
                  disabled={!selectedCuadro}
                >
                  <option value="">Seleccione una modalidad</option>
                  {modalidades.map(m => (
                    <option key={m.id} value={m.id}>{m.nombre}</option>
                  ))}
                </select>
              </div>
            </div>`;

const newGrid = `<div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Año (Cuadro Anual)</label>
                <select 
                  className="w-full p-3 rounded-xl border border-slate-200 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary text-sm"
                  value={selectedCuadro}
                  onChange={(e) => setSelectedCuadro(e.target.value)}
                >
                  <option value="">Seleccione el año</option>
                  {cuadros.filter(c => c.estado === 'Aprobado').map(c => (
                    <option key={c.id} value={c.id}>{c.anio} - {c.estado}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Semestre</label>
                <select 
                  className="w-full p-3 rounded-xl border border-slate-200 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary text-sm disabled:bg-slate-50 disabled:text-slate-400"
                  value={selectedSemestre}
                  onChange={(e) => {
                    setSelectedSemestre(e.target.value);
                    setSelectedModalidad('');
                  }}
                  disabled={!selectedCuadro}
                >
                  <option value="">Seleccione el semestre</option>
                  {availableSemesters.map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Modalidad</label>
                <select 
                  className="w-full p-3 rounded-xl border border-slate-200 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary text-sm disabled:bg-slate-50 disabled:text-slate-400"
                  value={selectedModalidad}
                  onChange={(e) => setSelectedModalidad(e.target.value)}
                  disabled={!selectedSemestre}
                >
                  <option value="">Seleccione una modalidad</option>
                  {filteredModalidades.map(m => (
                    <option key={m.id} value={m.id}>{m.nombre}</option>
                  ))}
                </select>
              </div>
            </div>`;

content = content.replace(oldGrid, newGrid);

fs.writeFileSync('pages/ApplicantPreReview.tsx', content);
