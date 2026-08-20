import re

with open('pages/ExamBudget.tsx', 'r') as f:
    content = f.read()

bad_init = """  const handleCreateNew = () => {
    setTempCuadro(cuadros[0]?.id || '');
    setTempModalidad(modalidades[0]?.id || '');
    setIsCreateModalOpen(true);
  };"""

good_init = """  const handleCreateNew = () => {
    setTempCuadro('');
    setTempModalidad('');
    setIsCreateModalOpen(true);
  };"""

content = content.replace(bad_init, good_init)

with open('pages/ExamBudget.tsx', 'w') as f:
    f.write(content)
