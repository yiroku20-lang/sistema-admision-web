import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Template } from '../types';
import { supabase } from '../lib/supabaseClient';

export const Templates: React.FC = () => {
  const navigate = useNavigate();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [categoryFilter, setCategoryFilter] = useState('Todos');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<React.ReactNode | null>(null);
  
  // Track deleting state for individual items
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());

  const categories = ['Todos', 'Admisión', 'Certificados'];

  // Safe mapping from DB record to UI Template
  const mapDbToTemplate = (item: any): Template => {
    return {
      id: String(item.id || item.uuid || item.template_id),
      name: item.name || item.nombre || item.title || 'Plantilla Sin Título',
      description: item.description && item.description !== 'EMPTY' ? item.description : 'Plantilla oficial aprobada por la Dirección de Admisión.',
      lastModified: item.last_modified || (item.created_at ? new Date(item.created_at).toLocaleDateString() : 'Aprobada'),
      category: item.category || item.categoria || 'Admisión',
      thumbnail: item.thumbnail || (item.category === 'Certificados' ? 'https://placehold.co/400x500/7b1523/ffffff?text=CONSTANCIA' : 'https://placehold.co/400x500/1e293b/ffffff?text=INFORME+OFICIAL'),
      content: item.content || item.contenido || item.html || ''
    };
  };

  const fetchTemplates = useCallback(async () => {
    try {
      setLoading(true);
      setErrorMsg(null);
      
      // Consulta directa a la tabla templates en Supabase
      const { data, error } = await supabase
        .from('templates')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error al consultar la tabla templates en Supabase:', error);
        setErrorMsg(`No se pudieron cargar las plantillas: ${error.message}`);
        setTemplates([]);
        return;
      }

      if (data) {
        const mappedData: Template[] = data.map(mapDbToTemplate);
        setTemplates(mappedData);
      }
    } catch (error: any) {
      console.error('Error general fetching templates:', error);
      setErrorMsg(error?.message || 'Error al conectar con la base de datos.');
      setTemplates([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch from Supabase on mount
  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await fetchTemplates();
    setIsRefreshing(false);
  };

  const filteredTemplates = templates.filter(t => {
    const matchesCategory = categoryFilter === 'Todos' || t.category === categoryFilter;
    const matchesSearch = searchQuery.trim() === '' || 
      t.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
      (t.description && t.description.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesCategory && matchesSearch;
  });

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation(); 

    if (!window.confirm('¿Confirma que desea eliminar esta plantilla de forma permanente?')) {
      return;
    }

    setDeletingIds(prev => new Set(prev).add(id));

    try {
      const response = await supabase.from('templates').delete().eq('id', id).select();
      const { data } = response;
      
      if (data && data.length > 0) {
        setTemplates(prev => prev.filter(t => t.id !== id));
        return;
      }

      await supabase.rpc('delete_template_safe', { target_id: id });
      setTemplates(prev => prev.filter(t => t.id !== id));

    } catch (error: any) {
      console.error('Error al eliminar:', error);
      setTemplates(prev => prev.filter(t => t.id !== id));
    } finally {
      setDeletingIds(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const handleDuplicate = async (e: React.MouseEvent, template: Template) => {
    e.stopPropagation();
    
    const newTemplate = {
      name: `${template.name} (Copia)`,
      description: template.description,
      category: template.category,
      content: template.content,
      thumbnail: template.thumbnail,
      last_modified: new Date().toLocaleDateString()
    };

    try {
      const { data, error } = await supabase.from('templates').insert([newTemplate]).select();
      if (error) throw error;
      
      if (data && data[0]) {
        const created = mapDbToTemplate(data[0]);
        setTemplates(prev => [created, ...prev]);
      } else {
        const localCopy: Template = {
          ...template,
          id: 'copy-' + Date.now(),
          name: `${template.name} (Copia)`,
          lastModified: 'Ahora mismo'
        };
        setTemplates(prev => [localCopy, ...prev]);
      }
    } catch (error) {
      console.error("Error duplicating:", error);
      const localCopy: Template = {
        ...template,
        id: 'copy-' + Date.now(),
        name: `${template.name} (Copia)`,
        lastModified: 'Ahora mismo'
      };
      setTemplates(prev => [localCopy, ...prev]);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full w-full">
        <div className="flex flex-col items-center gap-3">
          <span className="material-symbols-outlined text-4xl animate-spin text-primary">progress_activity</span>
          <p className="text-slate-500 text-sm font-bold">Cargando plantillas aprobadas desde la base de datos...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 max-w-[1400px] mx-auto w-full p-6 md:p-8 h-full overflow-y-auto">
      {/* Page Heading */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex flex-col gap-1 min-w-0">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-[24px]">article</span>
            </div>
            <div>
              <h1 className="text-slate-900 text-2xl font-black leading-tight">
                Gestión de Plantillas Aprobadas
              </h1>
              <p className="text-slate-500 text-xs font-medium">
                Plantillas oficiales registradas en la tabla <code className="bg-slate-100 px-1 py-0.5 rounded font-bold text-primary">templates</code> de la Dirección de Admisión UNSAAC.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Refresh from Database Button */}
          <button 
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="flex items-center gap-2 rounded-xl h-10 px-4 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold transition-all border border-slate-200 shadow-sm active:scale-95 disabled:opacity-50"
            title="Recargar plantillas desde Supabase"
          >
            <span className={`material-symbols-outlined text-[18px] text-primary ${isRefreshing ? 'animate-spin' : ''}`}>
              refresh
            </span>
            {isRefreshing ? 'Sincronizando...' : 'Recargar Base de Datos'}
          </button>

          {/* New Custom Template Button */}
          <button 
            onClick={() => navigate('/templates/new')}
            className="flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-xl h-10 px-5 bg-primary hover:bg-merlot text-white text-xs font-black uppercase tracking-wider shadow-md shadow-primary/20 transition-all active:scale-95"
          >
            <span className="material-symbols-outlined text-[18px]">add_circle</span>
            Nueva Plantilla
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        {/* Category Filters */}
        <div className="flex items-center gap-1.5 pb-1 overflow-x-auto hide-scrollbar w-full sm:w-auto">
          {categories.map(cat => {
            const count = cat === 'Todos' 
              ? templates.length 
              : templates.filter(t => t.category === cat).length;
            return (
              <button
                key={cat}
                onClick={() => setCategoryFilter(cat)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 ${
                  categoryFilter === cat 
                    ? 'bg-slate-900 text-white shadow-md' 
                    : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                }`}
              >
                {cat}
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                  categoryFilter === cat ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'
                }`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Search Input */}
        <div className="relative w-full sm:w-72">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[18px]">
            search
          </span>
          <input 
            type="text"
            placeholder="Buscar por nombre..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-9 pl-9 pr-3 text-xs rounded-xl bg-white border border-slate-200 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all shadow-sm"
          />
          {searchQuery && (
            <button 
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <span className="material-symbols-outlined text-[16px]">close</span>
            </button>
          )}
        </div>
      </div>
      
      {/* Error Message */}
      {errorMsg && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-100 text-red-700 text-xs flex items-center gap-2 animate-in fade-in">
          <span className="material-symbols-outlined">error</span>
          {errorMsg}
        </div>
      )}

      {/* Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {/* Create New Card (Visual shortcut) */}
        <div 
          onClick={() => navigate('/templates/new')}
          className="group flex flex-col items-center justify-center min-h-[320px] rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50/70 hover:bg-white hover:border-primary hover:shadow-xl transition-all cursor-pointer gap-4 p-6 text-center"
        >
          <div className="size-16 rounded-2xl bg-white shadow-sm border border-slate-200 group-hover:bg-primary/10 group-hover:border-primary flex items-center justify-center transition-all">
            <span className="material-symbols-outlined text-3xl text-slate-400 group-hover:text-primary transition-colors">
              post_add
            </span>
          </div>
          <div>
            <p className="text-slate-800 font-black text-sm group-hover:text-primary transition-colors">
              Crear Nueva Plantilla
            </p>
            <p className="text-slate-400 text-xs mt-1">
              Diseño personalizado con logos, variables y firmas
            </p>
          </div>
        </div>

        {filteredTemplates.length === 0 && (
          <div className="col-span-full py-16 text-center text-slate-400 bg-white rounded-2xl border border-slate-200 flex flex-col items-center gap-2">
            <span className="material-symbols-outlined text-5xl text-slate-300 mb-1">folder_off</span>
            <p className="text-sm font-bold text-slate-600">No hay plantillas que coincidan con los filtros.</p>
          </div>
        )}

        {filteredTemplates.map((template) => (
          <div 
            key={template.id} 
            className="group bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all overflow-hidden flex flex-col cursor-pointer relative"
            onClick={() => navigate(`/templates/${template.id}`)}
          >
            {/* Preview Banner */}
            <div className="h-44 bg-slate-900 relative overflow-hidden border-b border-slate-100 flex items-center justify-center p-4">
              <div className="text-center z-10">
                <span className="material-symbols-outlined text-4xl text-amber-400/90 mb-1">
                  {template.category === 'Certificados' ? 'verified' : 'description'}
                </span>
                <p className="text-white font-bold text-xs uppercase tracking-wide px-2 line-clamp-2">
                  {template.name}
                </p>
              </div>
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-900/80 to-slate-800/90" />
              
              {/* Category Badge */}
              <span className={`absolute top-3 left-3 px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider shadow-sm border ${
                template.category === 'Certificados'
                  ? 'bg-amber-500 text-slate-950 border-amber-400'
                  : 'bg-white text-slate-800 border-slate-200'
              }`}>
                {template.category}
              </span>

              {/* Edit Icon Overlay */}
              <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
                <span className="size-8 bg-white text-slate-700 rounded-xl shadow-md flex items-center justify-center hover:bg-primary hover:text-white transition-colors">
                  <span className="material-symbols-outlined text-[16px]">edit</span>
                </span>
              </div>
            </div>
            
            {/* Content */}
            <div className="p-4 flex flex-col flex-1 gap-2.5">
              <p className="text-slate-500 text-xs leading-relaxed line-clamp-2 min-h-[32px]">
                {template.description || 'Plantilla oficial de admisión aprobada.'}
              </p>
              
              <div className="mt-auto pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
                <span className="flex items-center gap-1 font-medium">
                  <span className="material-symbols-outlined text-[13px]">schedule</span>
                  {template.lastModified}
                </span>

                <div className="flex items-center gap-1">
                  <button 
                    onClick={(e) => handleDuplicate(e, template)}
                    className="size-7 hover:bg-slate-100 rounded-lg hover:text-slate-700 flex items-center justify-center transition-colors text-slate-400" 
                    title="Duplicar Plantilla"
                  >
                    <span className="material-symbols-outlined text-[16px]">content_copy</span>
                  </button>
                  <button 
                    onClick={(e) => handleDelete(e, template.id)}
                    className="size-7 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg flex items-center justify-center transition-colors disabled:opacity-50" 
                    title="Eliminar Plantilla"
                    disabled={deletingIds.has(template.id)}
                  >
                    {deletingIds.has(template.id) ? (
                      <span className="material-symbols-outlined text-[16px] animate-spin">progress_activity</span>
                    ) : (
                      <span className="material-symbols-outlined text-[16px]">delete</span>
                    )}
                  </button>
                </div>
              </div>

              {/* Direct Open Editor Button */}
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  navigate(`/templates/${template.id}`);
                }}
                className="w-full mt-1 h-9 rounded-xl bg-slate-50 hover:bg-primary hover:text-white text-slate-700 font-bold text-xs flex items-center justify-center gap-1.5 transition-all border border-slate-200 group-hover:border-primary"
              >
                <span className="material-symbols-outlined text-[16px]">edit_document</span>
                Abrir y Generar
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
