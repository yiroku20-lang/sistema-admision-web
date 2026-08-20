import re

with open('pages/ExamBudget.tsx', 'r') as f:
    content = f.read()

# Modify loadSavedBudgets
old_load = """  const loadSavedBudgets = () => {
    const data = localStorage.getItem('exam_budgets');
    if (data) {
      setSavedBudgets(JSON.parse(data));
    }
  };"""

new_load = """  const loadSavedBudgets = async () => {
    try {
      const { data, error } = await supabase.from('cv_exam_budgets').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      if (data && data.length > 0) {
        setSavedBudgets(data);
      } else {
        // Fallback to local storage if empty or table doesn't exist yet
        const localData = localStorage.getItem('exam_budgets');
        if (localData) {
          setSavedBudgets(JSON.parse(localData));
        }
      }
    } catch (error) {
      console.error('Error loading budgets from Supabase:', error);
      const localData = localStorage.getItem('exam_budgets');
      if (localData) {
        setSavedBudgets(JSON.parse(localData));
      }
    }
  };"""

content = content.replace(old_load, new_load)

# Modify saveCurrentBudget
old_save = """  const saveCurrentBudget = () => {
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
  };"""

new_save = """  const saveCurrentBudget = async () => {
    if (!selectedCuadro || !selectedModalidad) {
      notify?.('Seleccione un cuadro y modalidad antes de guardar', 'warning');
      return;
    }
    
    const total_general = budgetItems.reduce((acc, item) => acc + item.total, 0);

    const record = {
      id: currentBudget ? currentBudget.id : crypto.randomUUID(),
      cuadro_anual_id: selectedCuadro,
      modalidad_id: selectedModalidad,
      items: budgetItems,
      total_general,
      schedules: roleSchedules,
      is_locked: isLocked,
      updated_at: new Date().toISOString()
    };
    
    if (!currentBudget) {
      (record as any).created_at = new Date().toISOString();
    }

    try {
      const { error } = await supabase.from('cv_exam_budgets').upsert(record);
      if (error) throw error;
      
      notify?.('Presupuesto y cronograma guardados exitosamente', 'success');
      loadSavedBudgets();
      
      setCurrentBudget({ ...currentBudget, ...record } as ExamBudgetRecord);
    } catch (error: any) {
      console.error('Error saving budget to Supabase:', error);
      notify?.('Guardado localmente. La tabla en base de datos podría no existir aún.', 'info');
      
      const fallbackRecord: ExamBudgetRecord = {
        ...record,
        created_at: currentBudget ? currentBudget.created_at : new Date().toISOString()
      };
      
      let newBudgets = [...savedBudgets];
      if (currentBudget) {
        newBudgets = newBudgets.map(b => b.id === fallbackRecord.id ? fallbackRecord : b);
      } else {
        newBudgets.push(fallbackRecord);
      }
      localStorage.setItem('exam_budgets', JSON.stringify(newBudgets));
      setSavedBudgets(newBudgets);
      setCurrentBudget(fallbackRecord);
    }
  };"""

content = content.replace(old_save, new_save)

old_delete = """  const handleDeleteBudget = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('¿Está seguro de eliminar este presupuesto?')) {
      const updated = savedBudgets.filter(b => b.id !== id);
      persistBudgets(updated);
      notify?.('Presupuesto eliminado', 'success');
    }
  };"""

new_delete = """  const handleDeleteBudget = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('¿Está seguro de eliminar este presupuesto?')) {
      try {
        const { error } = await supabase.from('cv_exam_budgets').delete().eq('id', id);
        if (error) throw error;
        
        setSavedBudgets(savedBudgets.filter(b => b.id !== id));
        notify?.('Presupuesto eliminado', 'success');
      } catch (error) {
        console.error(error);
        const updated = savedBudgets.filter(b => b.id !== id);
        localStorage.setItem('exam_budgets', JSON.stringify(updated));
        setSavedBudgets(updated);
        notify?.('Presupuesto eliminado localmente', 'success');
      }
    }
  };"""

content = content.replace(old_delete, new_delete)

old_toggle = """  const toggleLock = () => {
    if (!currentBudget) return;
    const newLock = !isLocked;
    setIsLocked(newLock);
    localStorage.setItem(`unsaac_budget_locked_${currentBudget.id}`, String(newLock));
    notify?.(newLock ? 'Presupuesto bloqueado' : 'Presupuesto desbloqueado', 'info');
  };"""

new_toggle = """  const toggleLock = async () => {
    if (!currentBudget) return;
    const newLock = !isLocked;
    setIsLocked(newLock);
    
    try {
      await supabase.from('cv_exam_budgets').update({ is_locked: newLock }).eq('id', currentBudget.id);
    } catch (e) {
      console.error(e);
    }
    
    localStorage.setItem(`unsaac_budget_locked_${currentBudget.id}`, String(newLock));
    notify?.(newLock ? 'Presupuesto bloqueado' : 'Presupuesto desbloqueado', 'info');
  };"""

content = content.replace(old_toggle, new_toggle)

old_effect = """  useEffect(() => {
    if (currentBudget) {
      const locked = localStorage.getItem(`unsaac_budget_locked_${currentBudget.id}`) === 'true';
      setIsLocked(locked);
    } else {
      setIsLocked(false);
    }
  }, [currentBudget]);"""

new_effect = """  useEffect(() => {
    if (currentBudget) {
      const locked = (currentBudget as any).is_locked || localStorage.getItem(`unsaac_budget_locked_${currentBudget.id}`) === 'true';
      setIsLocked(locked);
    } else {
      setIsLocked(false);
    }
  }, [currentBudget]);"""

content = content.replace(old_effect, new_effect)

with open('pages/ExamBudget.tsx', 'w') as f:
    f.write(content)

