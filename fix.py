with open('pages/ExamBudget.tsx', 'r') as f:
    content = f.read()

bad_block = """                {!isLocked && (
                  {/* Expand/Collapse All Floating Button */}
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

good_block = """
                {/* Expand/Collapse All Floating Button */}
                <button 
                  onClick={toggleAll}
                  className="fixed bottom-6 right-6 w-12 h-12 bg-white border border-slate-200 rounded-full shadow-lg flex items-center justify-center text-slate-500 hover:text-primary hover:border-primary transition-all z-50 print:hidden"
                  title={isAllCollapsed ? 'Expandir Todo' : 'Contraer Todo'}
                >
                  <span className="material-symbols-outlined text-[24px]">
                    {isAllCollapsed ? 'unfold_more' : 'unfold_less'}
                  </span>
                </button>

                {!isLocked && (
                  <div className="mt-4 print:hidden">
                     {isAddModalOpen ? ("""

content = content.replace(bad_block, good_block)

with open('pages/ExamBudget.tsx', 'w') as f:
    f.write(content)
