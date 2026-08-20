import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Template } from '../types';
import { supabase } from '../lib/supabaseClient';

export const Templates: React.FC = () => {
  const navigate = useNavigate();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [categoryFilter, setCategoryFilter] = useState('Todos');
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<React.ReactNode | null>(null);
  
  // Track deleting state for individual items
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());

  const categories = ['Todos', 'Admisión', 'Certificados', 'Resoluciones', 'Varios'];
  
  // Fetch from Supabase
  useEffect(() => {
    fetchTemplates();
  }, []);

  const fetchTemplates = async () => {
    try {
      setLoading(true);
      setErrorMsg(null);
      
      const { data, error } = await supabase
        .from('templates')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
          // Specific check for missing table
          if (error.code === 'PGRST205') {
              throw new Error("TABLE_MISSING");
          }
          throw error;
      }

      if (data) {
        // Map Supabase snake_case to our types if necessary, or ensure DB columns match types
        const mappedData: Template[] = data.map((item: any) => ({
          id: item.id,
          name: item.name,
          description: item.description,
          lastModified: item.last_modified || new Date(item.created_at).toLocaleDateString(),
          category: item.category,
          thumbnail: item.thumbnail || 'https://placehold.co/400x500/f1f5f9/94a3b8?text=Plantilla',
          content: item.content
        }));
        setTemplates(mappedData);
      }
    } catch (error: any) {
      console.error('Error fetching templates:', error);
      if (error.message === "TABLE_MISSING") {
          setErrorMsg(
            <span>
                La tabla <strong>templates</strong> no existe en la base de datos.
                <button onClick={() => navigate('/settings')} className="ml-2 underline font-bold hover:text-red-800">
                    Ir a Configuración para crearla
                </button>
            </span>
          );
      } else {
        setErrorMsg('No se pudo conectar a la base de datos o hubo un error desconocido.');
      }
    } finally {
      setLoading(false);
    }
  };

  const filteredTemplates = categoryFilter === 'Todos' 
    ? templates 
    : templates.filter(t => t.category === categoryFilter);

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation(); 
    console.log("Intentando eliminar plantilla ID:", id); 

    if (!window.confirm('¿Confirma que desea eliminar esta plantilla de forma permanente?')) {
        return;
    }

    setDeletingIds(prev => new Set(prev).add(id));

    try {
        // 1. INTENTO ESTÁNDAR
        const response = await supabase.from('templates').delete().eq('id', id).select();
        const { data, error } = response;
        
        // 2. CHECK: Si funcionó o si falló silenciosamente (data vacío)
        if (data && data.length > 0) {
             console.log("Eliminado con método estándar:", id);
             setTemplates(prev => prev.filter(t => t.id !== id));
             return;
        }

        // 3. INTENTO FALLBACK (RPC) si el método estándar no borró nada
        console.warn("Fallo estándar (0 filas), intentando método RPC seguro...");
        
        const { error: rpcError } = await supabase.rpc('delete_template_safe', { target_id: id });
        
        if (rpcError) {
             console.error("Error RPC:", rpcError);
             if (rpcError.message.includes("function delete_template_safe") && rpcError.message.includes("does not exist")) {
                 alert("⚠️ LA FUNCIÓN DE BORRADO NO ESTÁ INSTALADA.\n\nPor favor:\n1. Ve a 'Configuración'.\n2. Busca la tarjeta VERDE AZULADA 'Instalar Función de Borrado Seguro'.\n3. Copia y ejecuta el script en Supabase.");
             } else {
                 throw rpcError;
             }
             return;
        }

        // Si llegamos aquí, el RPC funcionó (o no dio error)
        // Verificamos si realmente se borró consultando de nuevo o asumiendo éxito
        console.log("Eliminado con éxito vía RPC:", id);
        setTemplates(prev => prev.filter(t => t.id !== id));

    } catch (error: any) {
        console.error('Error fatal al eliminar:', error);
        alert(`Error al eliminar: ${error.message || 'Error desconocido'}`);
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
             const created: Template = {
                id: data[0].id,
                name: data[0].name,
                description: data[0].description,
                category: data[0].category,
                thumbnail: data[0].thumbnail || template.thumbnail,
                lastModified: 'Ahora mismo',
                content: data[0].content
             };
             setTemplates(prev => [created, ...prev]);
        }
    } catch (error) {
        console.error("Error duplicating:", error);
        alert('No se pudo duplicar. Verifique la conexión.');
    }
  };

  if (loading) {
      return (
          <div className="flex items-center justify-center h-full w-full">
              <div className="flex flex-col items-center gap-2">
                  <span className="material-symbols-outlined text-4xl animate-spin text-primary">progress_activity</span>
                  <p className="text-slate-500 text-sm">Cargando plantillas...</p>
              </div>
          </div>
      );
  }

  return (
    <div className="flex flex-col gap-6 max-w-[1400px] mx-auto w-full p-6 md:p-8 h-full overflow-y-auto">
      {/* Page Heading */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-slate-900 text-3xl font-black leading-tight">
            Gestión de Plantillas
          </h1>
          <p className="text-slate-500 text-base font-normal max-w-2xl">
            Cree, edite y administre las plantillas de documentos oficiales. Utilice el editor para añadir firmas, logos y variables dinámicas.
          </p>
        </div>
        <button 
          onClick={() => navigate('/templates/new')}
          className="flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-lg h-11 px-6 bg-primary hover:bg-blue-600 text-white text-sm font-bold shadow-md shadow-blue-500/20 transition-all active:scale-95"
        >
          <span className="material-symbols-outlined">add_circle</span>
          Nueva Plantilla
        </button>
      </div>

      {/* Filter Bar */}
      <div className="flex items-center gap-2 pb-2 overflow-x-auto hide-scrollbar">
         {categories.map(cat => (
             <button
                key={cat}
                onClick={() => setCategoryFilter(cat)}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-colors whitespace-nowrap ${
                    categoryFilter === cat 
                    ? 'bg-slate-800 text-white shadow-md' 
                    : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                }`}
             >
                 {cat}
             </button>
         ))}
      </div>
      
      {/* Error Message */}
      {errorMsg && (
        <div className="p-4 rounded-lg bg-red-50 border border-red-100 text-red-700 text-sm flex items-center gap-2 animate-in fade-in slide-in-from-top-2">
            <span className="material-symbols-outlined">error</span>
            {errorMsg}
        </div>
      )}

      {/* Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          
          {/* Create New Card (Visual shortcut) */}
          <div 
             onClick={() => navigate('/templates/new')}
             className="group flex flex-col items-center justify-center min-h-[300px] rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 hover:bg-white hover:border-primary hover:shadow-lg transition-all cursor-pointer gap-4"
          >
              <div className="size-16 rounded-full bg-slate-200 group-hover:bg-blue-50 flex items-center justify-center transition-colors">
                  <span className="material-symbols-outlined text-4xl text-slate-400 group-hover:text-primary">post_add</span>
              </div>
              <p className="text-slate-500 font-bold group-hover:text-primary">Crear desde cero</p>
          </div>

          {!errorMsg && filteredTemplates.length === 0 && (
             <div className="col-span-full py-12 text-center text-slate-400">
                <span className="material-symbols-outlined text-4xl mb-2">folder_off</span>
                <p>No hay plantillas registradas en esta categoría.</p>
             </div>
          )}

          {filteredTemplates.map((template) => (
            <div 
                key={template.id} 
                className="group bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all overflow-hidden flex flex-col cursor-pointer"
                onClick={() => navigate(`/templates/${template.id}`)}
            >
                {/* Preview Image */}
                <div className="h-48 bg-slate-100 relative overflow-hidden border-b border-slate-100">
                    <img src={template.thumbnail} alt={template.name} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" />
                    <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
                         <button className="size-8 bg-white rounded-full shadow-sm flex items-center justify-center hover:bg-primary hover:text-white transition-colors">
                            <span className="material-symbols-outlined text-sm">edit</span>
                         </button>
                    </div>
                     <span className="absolute bottom-3 left-3 px-2 py-1 bg-white/90 backdrop-blur-sm rounded text-xs font-bold text-slate-700 shadow-sm">
                        {template.category}
                    </span>
                </div>
                
                {/* Content */}
                <div className="p-5 flex flex-col flex-1">
                    <div className="flex justify-between items-start mb-2">
                        <h3 className="font-bold text-slate-900 text-lg leading-tight group-hover:text-primary transition-colors">{template.name}</h3>
                    </div>
                    <p className="text-slate-500 text-sm mb-4 line-clamp-2">{template.description || 'Sin descripción'}</p>
                    
                    <div className="mt-auto pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400">
                        <span className="flex items-center gap-1">
                            <span className="material-symbols-outlined text-[14px]">calendar_today</span>
                            {template.lastModified}
                        </span>
                        <div className="flex gap-1">
                             <button 
                                onClick={(e) => handleDuplicate(e, template)}
                                className="p-2 hover:bg-slate-100 rounded-full hover:text-slate-600 transition-colors" 
                                title="Duplicar"
                             >
                                <span className="material-symbols-outlined text-[18px]">content_copy</span>
                             </button>
                             <button 
                                onClick={(e) => handleDelete(e, template.id)}
                                className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-full transition-colors disabled:opacity-50" 
                                title="Eliminar"
                                disabled={deletingIds.has(template.id)}
                             >
                                {deletingIds.has(template.id) ? (
                                    <span className="material-symbols-outlined text-[18px] animate-spin">progress_activity</span>
                                ) : (
                                    <span className="material-symbols-outlined text-[18px]">delete</span>
                                )}
                             </button>
                        </div>
                    </div>
                </div>
            </div>
          ))}
      </div>
    </div>
  );
};