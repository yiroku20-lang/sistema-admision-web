import re

with open('pages/ExamBudget.tsx', 'r') as f:
    content = f.read()

# 1. Add collapsedCategories state
state_match = re.search(r"const \[isAddModalOpen, setIsAddModalOpen\] = useState\(false\);", content)
if state_match:
    content = content[:state_match.start()] + "const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>({});\n  " + content[state_match.start():]

# 2. Add updateCategoryRubro and toggle functions
functions_to_add = """
  const updateCategoryRubro = (category: string, newRubro: string) => {
    if (isLocked) return;
    setBudgetItems(items => items.map(item => {
      if ((item.category || 'SIN CATEGORÍA') === category) {
        return { ...item, rubro: newRubro };
      }
      return item;
    }));
  };

  const toggleCategory = (category: string) => {
    setCollapsedCategories(prev => ({ ...prev, [category]: !prev[category] }));
  };

  const isAllCollapsed = Object.keys(groupedItems).length > 0 && Object.keys(groupedItems).every(cat => collapsedCategories[cat]);
  const toggleAll = () => {
    if (isAllCollapsed) {
      setCollapsedCategories({});
    } else {
      const all: Record<string, boolean> = {};
      Object.keys(groupedItems).forEach(cat => {
        all[cat] = true;
      });
      setCollapsedCategories(all);
    }
  };
"""

# Insert before 'if (isLoading)'
insert_idx = content.find("if (isLoading)")
content = content[:insert_idx] + functions_to_add + "\n  " + content[insert_idx:]

# 3. Update groupedItems logic
old_grouping = """  // Grouping logic for rendering
  const groupedItems = budgetItems.reduce((acc, item) => {
    const cat = item.category || 'SIN CATEGORÍA';
    const sub = item.subcategory || '';
    
    if (!acc[cat]) {
      acc[cat] = { total: 0, subcategories: {} };
    }
    acc[cat].total += item.total;
    
    if (!acc[cat].subcategories[sub]) {
      acc[cat].subcategories[sub] = { total: 0, items: [] };
    }
    acc[cat].subcategories[sub].total += item.total;
    acc[cat].subcategories[sub].items.push(item);
    
    return acc;
  }, {} as Record<string, { total: number, subcategories: Record<string, { total: number, items: BudgetRole[] }> }>);"""

new_grouping = """  // Grouping logic for rendering
  const groupedItems = budgetItems.reduce((acc, item) => {
    const cat = item.category || 'SIN CATEGORÍA';
    const sub = item.subcategory || '';
    
    if (!acc[cat]) {
      acc[cat] = { total: 0, rubro: item.rubro || '', subcategories: {} };
    }
    // If the category doesn't have a rubro set but this item does, adopt it
    if (!acc[cat].rubro && item.rubro) {
        acc[cat].rubro = item.rubro;
    }
    acc[cat].total += item.total;
    
    if (!acc[cat].subcategories[sub]) {
      acc[cat].subcategories[sub] = { total: 0, items: [] };
    }
    acc[cat].subcategories[sub].total += item.total;
    acc[cat].subcategories[sub].items.push(item);
    
    return acc;
  }, {} as Record<string, { total: number, rubro: string, subcategories: Record<string, { total: number, items: BudgetRole[] }> }>);"""

content = content.replace(old_grouping, new_grouping)

# 4. Update the Table rendering for categories and items
old_tbody = """                    <tbody className="divide-y divide-slate-100 text-sm print:divide-gray-200 print:text-black">
                      {budgetItems.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="p-8 text-center text-slate-400 font-bold print:hidden">
                            No hay rubros añadidos. Carga una plantilla o agrega uno nuevo.
                          </td>
                        </tr>
                      ) : (
                        Object.entries(groupedItems).map(([category, catData]) => (
                          <React.Fragment key={category}>
                            {/* Fila de Categoría Principal */}
                            <tr className="bg-slate-100/80 print:bg-gray-200">
                              <td colSpan={6} className="p-2 pl-4 font-black text-slate-800 uppercase text-xs print:text-black">
                                {category}
                              </td>
                              <td className="p-2 text-right font-black text-slate-800 print:text-black">
                                {catData.total.toLocaleString('es-PE', { minimumFractionDigits: 2 })}
                              </td>
                              <td className="print:hidden"></td>
                            </tr>
                            
                            {/* Iteración de Subcategorías */}
                            {Object.entries(catData.subcategories).map(([subcategory, subData]) => (
                              <React.Fragment key={`${category}-${subcategory}`}>
                                {/* Fila de Subcategoría (solo si existe) */}
                                {subcategory && (
                                  <tr className="bg-slate-50 print:bg-gray-100">
                                    <td colSpan={6} className="p-2 pl-8 font-bold text-slate-600 uppercase text-xs print:text-black">
                                      {subcategory}
                                    </td>
                                    <td className="p-2 text-right font-bold text-slate-600 print:text-black">
                                      {subData.total.toLocaleString('es-PE', { minimumFractionDigits: 2 })}
                                    </td>
                                    <td className="print:hidden"></td>
                                  </tr>
                                )}
                                
                                {/* Items de la (Sub)Categoría */}
                                {subData.items.map((item, index) => (
                                  <tr key={item.id} className="hover:bg-slate-50/50 print:break-inside-avoid border-b border-slate-50">
                                    <td className="p-2 align-top">
                                      <input type="text" value={item.rubro} onChange={e => updateBudgetItem(item.id, 'rubro', e.target.value)} readOnly={isLocked} className="w-full p-2 border border-slate-200 rounded-lg focus:border-primary outline-none font-mono text-xs bg-white disabled:bg-transparent print:border-none print:p-0 print:bg-transparent print:text-black" placeholder="-" />
                                    </td>
                                    <td className="p-2 align-top pl-4">
                                      <AutoResizeTextarea value={item.role} onChange={(e: any) => updateBudgetItem(item.id, 'role', e.target.value)} readOnly={isLocked} className="font-medium text-slate-700 disabled:text-slate-900 print:text-black" placeholder="Descripción del cargo o bien..." />
                                    </td>
                                    <td className="p-2 align-top">
                                      <input type="text" value={item.condition} onChange={e => updateBudgetItem(item.id, 'condition', e.target.value)} readOnly={isLocked} className="w-full p-2 border border-slate-200 rounded-lg focus:border-primary outline-none text-center font-bold bg-white uppercase disabled:bg-transparent print:border-none print:p-0 print:bg-transparent print:text-black" placeholder="-" />
                                    </td>
                                    <td className="p-2 align-top">
                                      <input type="number" min="0" step="0.01" value={item.indicator} onChange={e => updateBudgetItem(item.id, 'indicator', parseFloat(e.target.value) || 0)} readOnly={isLocked} className="w-full p-2 border border-slate-200 rounded-lg focus:border-primary outline-none text-center font-mono bg-white disabled:bg-transparent print:border-none print:p-0 print:bg-transparent print:text-black" />
                                    </td>
                                    <td className="p-2 align-top">
                                      <input type="number" min="0" value={item.quantity} onChange={e => updateBudgetItem(item.id, 'quantity', parseFloat(e.target.value) || 0)} readOnly={isLocked} className="w-full p-2 border border-slate-200 rounded-lg focus:border-primary outline-none text-center font-bold bg-white disabled:bg-transparent print:border-none print:p-0 print:bg-transparent print:text-black" />
                                    </td>
                                    <td className="p-2 align-top">
                                      <input type="number" min="0" value={item.unit_cost} onChange={e => updateBudgetItem(item.id, 'unit_cost', parseFloat(e.target.value) || 0)} readOnly={isLocked} className="w-full p-2 border border-slate-200 rounded-lg focus:border-primary outline-none text-right font-mono bg-white disabled:bg-transparent print:border-none print:p-0 print:bg-transparent print:text-black" />
                                    </td>
                                    <td className="p-2 align-top text-right font-mono font-medium text-slate-700 bg-transparent print:text-black">
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
                                ))}
                              </React.Fragment>
                            ))}
                          </React.Fragment>
                        ))
                      )}
                    </tbody>"""

new_tbody = """                    <tbody className="divide-y divide-slate-100 text-sm print:divide-gray-200 print:text-black">
                      {budgetItems.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="p-8 text-center text-slate-400 font-bold print:hidden">
                            No hay rubros añadidos. Carga una plantilla o agrega uno nuevo.
                          </td>
                        </tr>
                      ) : (
                        Object.entries(groupedItems).map(([category, catData]) => {
                          const isCollapsed = collapsedCategories[category] || false;
                          return (
                          <React.Fragment key={category}>
                            {/* Fila de Categoría Principal */}
                            <tr className="bg-slate-100/80 print:bg-gray-200 group">
                              <td className="p-2">
                                <input 
                                  type="text" 
                                  value={catData.rubro} 
                                  onChange={e => updateCategoryRubro(category, e.target.value)} 
                                  readOnly={isLocked} 
                                  className="w-full p-2 border border-slate-200 rounded-lg focus:border-primary outline-none font-mono text-xs bg-white disabled:bg-transparent print:border-none print:p-0 print:bg-transparent print:text-black" 
                                  placeholder="Código SIAF" 
                                />
                              </td>
                              <td colSpan={5} className="p-2 pl-4 cursor-pointer" onClick={() => toggleCategory(category)}>
                                <div className="flex items-center gap-2">
                                  <span className="material-symbols-outlined text-slate-400 text-[18px] transition-transform duration-200 print:hidden" style={{ transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}>expand_more</span>
                                  <span className="font-black text-slate-800 uppercase text-xs print:text-black">
                                    {category}
                                  </span>
                                </div>
                              </td>
                              <td className="p-2 text-right font-black text-slate-800 print:text-black">
                                {catData.total.toLocaleString('es-PE', { minimumFractionDigits: 2 })}
                              </td>
                              <td className="print:hidden"></td>
                            </tr>
                            
                            {/* Items / Subcategories */}
                            {!isCollapsed && Object.entries(catData.subcategories).map(([subcategory, subData]) => (
                              <React.Fragment key={`${category}-${subcategory}`}>
                                {/* Fila de Subcategoría (solo si existe) */}
                                {subcategory && (
                                  <tr className="bg-slate-50 print:bg-gray-100">
                                    <td colSpan={6} className="p-2 pl-8 font-bold text-slate-600 uppercase text-xs print:text-black">
                                      {subcategory}
                                    </td>
                                    <td className="p-2 text-right font-bold text-slate-600 print:text-black">
                                      {subData.total.toLocaleString('es-PE', { minimumFractionDigits: 2 })}
                                    </td>
                                    <td className="print:hidden"></td>
                                  </tr>
                                )}
                                
                                {/* Items de la (Sub)Categoría */}
                                {subData.items.map((item, index) => (
                                  <tr key={item.id} className="hover:bg-slate-50/50 print:break-inside-avoid border-b border-slate-50">
                                    <td className="p-2 align-top text-center text-slate-300 font-black">
                                      -
                                    </td>
                                    <td className="p-2 align-top pl-4">
                                      <AutoResizeTextarea value={item.role} onChange={(e: any) => updateBudgetItem(item.id, 'role', e.target.value)} readOnly={isLocked} className="font-medium text-slate-700 disabled:text-slate-900 print:text-black" placeholder="Descripción del cargo o bien..." />
                                    </td>
                                    <td className="p-2 align-top">
                                      <input type="text" value={item.condition} onChange={e => updateBudgetItem(item.id, 'condition', e.target.value)} readOnly={isLocked} className="w-full p-2 border border-slate-200 rounded-lg focus:border-primary outline-none text-center font-bold bg-white uppercase disabled:bg-transparent print:border-none print:p-0 print:bg-transparent print:text-black" placeholder="-" />
                                    </td>
                                    <td className="p-2 align-top">
                                      <input type="number" min="0" step="0.01" value={item.indicator} onChange={e => updateBudgetItem(item.id, 'indicator', parseFloat(e.target.value) || 0)} readOnly={isLocked} className="w-full p-2 border border-slate-200 rounded-lg focus:border-primary outline-none text-center font-mono bg-white disabled:bg-transparent print:border-none print:p-0 print:bg-transparent print:text-black" />
                                    </td>
                                    <td className="p-2 align-top">
                                      <input type="number" min="0" value={item.quantity} onChange={e => updateBudgetItem(item.id, 'quantity', parseFloat(e.target.value) || 0)} readOnly={isLocked} className="w-full p-2 border border-slate-200 rounded-lg focus:border-primary outline-none text-center font-bold bg-white disabled:bg-transparent print:border-none print:p-0 print:bg-transparent print:text-black" />
                                    </td>
                                    <td className="p-2 align-top">
                                      <input type="number" min="0" value={item.unit_cost} onChange={e => updateBudgetItem(item.id, 'unit_cost', parseFloat(e.target.value) || 0)} readOnly={isLocked} className="w-full p-2 border border-slate-200 rounded-lg focus:border-primary outline-none text-right font-mono bg-white disabled:bg-transparent print:border-none print:p-0 print:bg-transparent print:text-black" />
                                    </td>
                                    <td className="p-2 align-top text-right font-mono font-medium text-slate-700 bg-transparent print:text-black">
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
                                ))}
                              </React.Fragment>
                            ))}
                          </React.Fragment>
                        )})
                      )}
                    </tbody>"""

content = content.replace(old_tbody, new_tbody)

# 5. Add floating button
old_floating_anchor = """                  <div className="mt-4 print:hidden">
                     {isAddModalOpen ? ("""

new_floating_anchor = """                  {/* Expand/Collapse All Floating Button */}
                  <button 
                    onClick={toggleAll}
                    className="fixed bottom-6 right-6 w-12 h-12 bg-white border border-slate-200 rounded-full shadow-lg flex items-center justify-center text-slate-500 hover:text-primary hover:border-primary transition-all z-50 print:hidden"
                    title={isAllCollapsed ? 'Expandir Todo' : 'Contraer Todo'}
                  >
                    <span className="material-symbols-outlined text-[24px]">
                      {isAllCollapsed ? 'unfold_more' : 'unfold_less'}
                    </span>
                  </button>

                  <div className="mt-4 print:hidden">
                     {isAddModalOpen ? ("""

content = content.replace(old_floating_anchor, new_floating_anchor)

with open('pages/ExamBudget.tsx', 'w') as f:
    f.write(content)

print("Budget file updated successfully")
