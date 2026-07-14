import re

with open('pages/ExamBudget.tsx', 'r') as f:
    content = f.read()

bad_block = """      <div className="flex-1 overflow-y-auto p-8 print:p-0 print:overflow-visible">
        <div className="max-w-7xl mx-auto space-y-6 print:max-w-none print:w-full">
               <div>Total Personal: {totalPersonal} req.</div>
               <div>Presupuesto Total: S/ {totalGeneral.toLocaleString('es-PE', { minimumFractionDigits: 2 })}</div>
            </div>
          </div>"""

good_block = """      <div className="flex-1 overflow-y-auto p-8 print:p-0 print:overflow-visible">
        <div className="max-w-7xl mx-auto space-y-6 print:max-w-none print:w-full">
          <div className="hidden print:flex justify-between items-center bg-gray-100 p-4 rounded-lg font-bold mb-6">
             <div>Total Personal: {totalPersonal} req.</div>
             <div>Presupuesto Total: S/ {totalGeneral.toLocaleString('es-PE', { minimumFractionDigits: 2 })}</div>
          </div>"""

if bad_block in content:
    content = content.replace(bad_block, good_block)
else:
    print("Warning: could not find bad_block")

with open('pages/ExamBudget.tsx', 'w') as f:
    f.write(content)
