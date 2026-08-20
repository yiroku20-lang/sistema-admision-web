import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';
import { User, PersonalDirectorio, ActaSesion, ActaFirmante } from '../types';
import { Search, Plus, Save, Edit, Trash2, CheckCircle, FileText, FileSignature, Wand2, ArrowLeft, Users, X, UserPlus, Eye, Printer, UploadCloud, Download } from 'lucide-react';

interface Props {
  user: User | null;
  notify?: (message: string, type: 'success' | 'error' | 'warning' | 'info') => void;
}

export const MeetingMinutes: React.FC<Props> = ({ user, notify }) => {
  const [activeTab, setActiveTab] = useState<'actas' | 'autoridades'>('actas');
  
  return (
    <div className="flex-1 p-8 pt-20 md:pt-8 bg-slate-50 min-h-screen overflow-y-auto">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
              <FileSignature className="w-8 h-8 text-indigo-600" />
              Gestión de Actas y Sesiones
            </h1>
            <p className="text-slate-500 mt-1">
              Crea, edita y refina actas de sesiones oficiales.
            </p>
          </div>
          
          <div className="flex gap-2">
            <button
              onClick={() => setActiveTab('actas')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${activeTab === 'actas' ? 'bg-indigo-100 text-indigo-700' : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'}`}
            >
              <FileText className="w-4 h-4 inline mr-2" />
              Actas
            </button>
            <button
              onClick={() => setActiveTab('autoridades')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${activeTab === 'autoridades' ? 'bg-indigo-100 text-indigo-700' : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'}`}
            >
              <Users className="w-4 h-4 inline mr-2" />
              Autoridades
            </button>
          </div>
        </div>

        {activeTab === 'actas' && (
          <ActasTab user={user} notify={notify} />
        )}
        
        {activeTab === 'autoridades' && (
          <AutoridadesTab user={user} notify={notify} />
        )}
      </div>
    </div>
  );
};

const AutoridadesTab: React.FC<Props> = ({ notify }) => {
  const [autoridades, setAutoridades] = useState<PersonalDirectorio[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  
  // For Add Modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<PersonalDirectorio[]>([]);
  const [selectedPerson, setSelectedPerson] = useState<PersonalDirectorio | null>(null);

  // Forms
  const [titulo, setTitulo] = useState('');
  const [cargo, setCargo] = useState('');
  const [correo, setCorreo] = useState('');
  const [telefono, setTelefono] = useState('');

  const fetchAutoridades = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('personal_directorio')
      .select('*')
      .not('cargo_actual', 'is', null) // Only fetch people that we've designated as an authority (have a role)
      .order('nombre');
    if (!error && data) {
      setAutoridades(data);
    }
    setLoading(false);
  };

  const searchDirectory = async (q: string) => {
    setSearchQuery(q);
    if (!q) {
      setSearchResults([]);
      return;
    }
    const { data } = await supabase
      .from('personal_directorio')
      .select('*')
      .ilike('nombre', `%${q}%`)
      .limit(10);
    setSearchResults(data || []);
  };

  useEffect(() => {
    fetchAutoridades();
  }, []);

  const handleSave = async (id: string, remove: boolean = false) => {
    try {
      const payload = remove 
        ? { titulo_academico: null, cargo_actual: null } 
        : { titulo_academico: titulo, cargo_actual: cargo, correo: correo, telefono: telefono };
        
      const { error } = await supabase
        .from('personal_directorio')
        .update(payload)
        .eq('id', id);

      if (error) throw error;
      notify?.(remove ? 'Autoridad removida.' : (showAddModal ? 'Autoridad agregada.' : 'Autoridad actualizada.'), 'success');
      setEditingId(null);
      if (showAddModal) {
        setShowAddModal(false);
        setSelectedPerson(null);
        setSearchQuery('');
        setSearchResults([]);
      }
      fetchAutoridades();
    } catch (err) {
      console.error(err);
      notify?.('Error al guardar.', 'error');
    }
  };

  const startEdit = (person: PersonalDirectorio) => {
    setEditingId(person.id);
    setTitulo(person.titulo_academico || '');
    setCargo(person.cargo_actual || '');
    setCorreo(person.correo || '');
    setTelefono(person.telefono || '');
  };

  const filtered = autoridades.filter(a => 
    a.nombre?.toLowerCase().includes(search.toLowerCase()) || 
    a.cargo_actual?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col relative h-[600px]">
      <div className="p-4 border-b border-slate-200 bg-slate-50 flex gap-4 items-center">
        <div className="relative flex-1">
          <Search className="w-5 h-5 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar autoridades agregadas..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
          />
        </div>
        <button 
          onClick={() => {
            setShowAddModal(true);
            setSearchQuery('');
            setSearchResults([]);
            setSelectedPerson(null);
          }}
          className="flex items-center px-4 py-2 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 transition"
        >
          <Plus className="w-4 h-4 mr-2" /> Agregar Autoridad
        </button>
      </div>
      
      <div className="overflow-x-auto flex-1">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 text-sm">
              <th className="p-4 font-semibold">Nombre Completo</th>
              <th className="p-4 font-semibold">DNI</th>
              <th className="p-4 font-semibold">Tít. Académico</th>
              <th className="p-4 font-semibold">Cargo de Autoridad</th>
              <th className="p-4 font-semibold">Contacto</th>
              <th className="p-4 font-semibold text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr><td colSpan={6} className="p-8 text-center text-slate-500">Cargando autoridades...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={6} className="p-8 text-center text-slate-500">No hay autoridades agregadas al directorio. Usa el botón "Agregar Autoridad" para incluirlas.</td></tr>
            ) : (
              filtered.map(person => (
                <tr key={person.id} className="hover:bg-slate-50 transition-colors">
                  <td className="p-4 text-slate-800">{person.nombre}</td>
                  <td className="p-4 text-slate-500">{person.dni}</td>
                  <td className="p-4">
                    {editingId === person.id ? (
                      <input 
                        type="text" 
                        value={titulo} 
                        onChange={e => setTitulo(e.target.value)}
                        placeholder="Ej. Dr."
                        className="w-full p-2 border border-slate-300 rounded focus:ring-2 focus:ring-indigo-500 text-sm"
                      />
                    ) : (
                      <span className="text-slate-700">{person.titulo_academico || '-'}</span>
                    )}
                  </td>
                  <td className="p-4">
                    {editingId === person.id ? (
                      <input 
                        type="text" 
                        value={cargo} 
                        onChange={e => setCargo(e.target.value)}
                        placeholder="Ej. Rector"
                        className="w-full p-2 border border-slate-300 rounded focus:ring-2 focus:ring-indigo-500 text-sm"
                      />
                    ) : (
                      <span className={`px-2 py-1 rounded text-xs font-medium bg-blue-100 text-blue-700`}>
                        {person.cargo_actual}
                      </span>
                    )}
                  </td>
                  <td className="p-4">
                    {editingId === person.id ? (
                      <div className="flex flex-col gap-1">
                        <input 
                          type="email" 
                          value={correo} 
                          onChange={e => setCorreo(e.target.value)}
                          placeholder="Correo"
                          className="w-full p-1 border border-slate-300 rounded focus:ring-2 focus:ring-indigo-500 text-xs"
                        />
                        <input 
                          type="text" 
                          value={telefono} 
                          onChange={e => setTelefono(e.target.value)}
                          placeholder="Teléfono"
                          className="w-full p-1 border border-slate-300 rounded focus:ring-2 focus:ring-indigo-500 text-xs"
                        />
                      </div>
                    ) : (
                      <div className="flex flex-col gap-0.5 text-xs text-slate-500 whitespace-nowrap">
                        {person.correo && <div className="flex items-center gap-1"><span className="material-symbols-outlined text-[14px]">mail</span> {person.correo}</div>}
                        {person.telefono && <div className="flex items-center gap-1"><span className="material-symbols-outlined text-[14px]">call</span> {person.telefono}</div>}
                        {!person.correo && !person.telefono && <span>-</span>}
                      </div>
                    )}
                  </td>
                  <td className="p-4 text-right flex items-center justify-end gap-2">
                    {editingId === person.id ? (
                      <>
                        <button onClick={() => setEditingId(null)} className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200">
                          <X className="w-5 h-5" />
                        </button>
                        <button onClick={() => handleSave(person.id, false)} className="p-2 text-indigo-600 hover:text-indigo-700 rounded-lg hover:bg-indigo-50">
                          <CheckCircle className="w-5 h-5" />
                        </button>
                      </>
                    ) : (
                      <>
                        <button onClick={() => startEdit(person)} className="p-2 text-slate-400 hover:text-indigo-600 rounded-lg hover:bg-indigo-50 transition-colors" title="Editar carga de autoridad">
                          <Edit className="w-5 h-5" />
                        </button>
                        <button onClick={() => { if(window.confirm('¿Remover autoridad de la lista? No borrará a la persona del directorio general.')) handleSave(person.id, true) }} className="p-2 text-slate-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors" title="Remover de Autoridades">
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showAddModal && (
        <div className="absolute inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full flex flex-col max-h-full">
            <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50 rounded-t-xl">
              <h3 className="font-semibold text-slate-800">Agregar Autoridad</h3>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 overflow-y-auto">
              {!selectedPerson ? (
                <>
                  <p className="text-sm text-slate-600 mb-4">Busca a la persona en el directorio general de la universidad para designarla como Autoridad.</p>
                  <div className="relative mb-4">
                    <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                    <input 
                      type="text" 
                      placeholder="Buscar por nombres o apellidos..."
                      value={searchQuery}
                      onChange={e => searchDirectory(e.target.value)}
                      className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                  </div>
                  {searchQuery && searchResults.length > 0 && (
                    <div className="border border-slate-200 rounded-lg overflow-hidden divide-y divide-slate-100">
                      {searchResults.map(p => (
                        <div key={p.id} className="p-3 bg-white hover:bg-slate-50 flex justify-between items-center">
                          <div>
                            <div className="font-medium text-slate-800 text-sm">{p.nombre}</div>
                            <div className="text-xs text-slate-500">DNI: {p.dni}</div>
                          </div>
                          <button 
                            onClick={() => {
                               setSelectedPerson(p);
                               setTitulo(p.titulo_academico || '');
                               setCargo(p.cargo_actual || '');
                               setCorreo(p.correo || '');
                               setTelefono(p.telefono || '');
                            }} 
                            className="text-xs px-3 py-1.5 bg-indigo-50 text-indigo-700 font-medium rounded hover:bg-indigo-100"
                          >
                            Seleccionar
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  {searchQuery && searchResults.length === 0 && (
                    <div className="text-sm text-slate-500 p-4 text-center">No se encontraron resultados en el directorio de la universidad.</div>
                  )}
                </>
              ) : (
                <div className="space-y-4">
                  <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 flex justify-between">
                     <div>
                        <div className="font-semibold text-slate-800 text-sm">{selectedPerson.nombre}</div>
                        <div className="text-xs text-slate-500">DNI: {selectedPerson.dni}</div>
                     </div>
                     <button onClick={() => setSelectedPerson(null)} className="text-xs text-indigo-600 hover:underline">Cambiar persona</button>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Título Académico</label>
                    <input 
                      type="text" 
                      value={titulo}
                      onChange={e => setTitulo(e.target.value)}
                      placeholder="Ej. Dr., Mg., Ing."
                      className="w-full p-2 border border-slate-300 rounded-md outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Cargo a Designar *</label>
                    <input 
                      type="text" 
                      value={cargo}
                      onChange={e => setCargo(e.target.value)}
                      placeholder="Ej. Director de Admisión"
                      className="w-full p-2 border border-slate-300 rounded-md outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <p className="text-xs text-slate-500 mt-1">Este cargo aparecerá en sus firmas de actas.</p>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Correo Electrónico</label>
                      <input 
                        type="email" 
                        value={correo}
                        onChange={e => setCorreo(e.target.value)}
                        placeholder="ejemplo@unsaac.edu.pe"
                        className="w-full p-2 border border-slate-300 rounded-md outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 uppercase mb-1">Teléfono</label>
                      <input 
                        type="text" 
                        value={telefono}
                        onChange={e => setTelefono(e.target.value)}
                        placeholder="Ej. 987654321"
                        className="w-full p-2 border border-slate-300 rounded-md outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
            {selectedPerson && (
               <div className="p-4 border-t border-slate-200 bg-slate-50 rounded-b-xl flex justify-end gap-2">
                 <button onClick={() => setShowAddModal(false)} className="px-4 py-2 text-slate-600 hover:text-slate-800 font-medium">Cancelar</button>
                 <button 
                   onClick={() => handleSave(selectedPerson.id, false)} 
                   disabled={!cargo.trim()}
                   className="px-4 py-2 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                 >
                   Guardar y Agregar
                 </button>
               </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const ActasTab: React.FC<Props> = ({ user, notify }) => {
  const [actas, setActas] = useState<ActaSesion[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingActa, setEditingActa] = useState<ActaSesion | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const fetchActas = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('actas_sesiones')
      .select('*')
      .order('fecha', { ascending: false });
    
    if (error) {
      notify?.('Error al cargar actas', 'error');
    } else if (data) {
      setActas(data as ActaSesion[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchActas();
  }, []);

  if (editingActa || isCreating) {
    return (
      <ActaEditor 
        acta={editingActa} 
        onBack={() => { setEditingActa(null); setIsCreating(false); fetchActas(); }} 
        notify={notify} 
        user={user} 
      />
    );
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="p-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
        <h2 className="font-semibold text-slate-800">Historial de Actas</h2>
        <button 
          onClick={() => setIsCreating(true)}
          className="bg-indigo-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-indigo-700 transition-colors flex items-center gap-2"
        >
          <Plus className="w-5 h-5" />
          Nueva Acta
        </button>
      </div>
      <div className="p-0">
        {loading ? (
          <div className="p-8 text-center text-slate-500">Cargando actas...</div>
        ) : actas.length === 0 ? (
          <div className="p-12 text-center flex flex-col items-center">
            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4 text-slate-400">
              <FileSignature className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-semibold text-slate-700">No hay actas registradas</h3>
            <p className="text-slate-500 mt-1 max-w-sm">
              Inicia creando una nueva acta para tener un registro estructurado de las sesiones de admisión.
            </p>
          </div>
        ) : (
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 text-sm">
                <th className="p-4">Nro / Título</th>
                <th className="p-4">Fecha</th>
                <th className="p-4">Tipo</th>
                <th className="p-4">Estado</th>
                <th className="p-4 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {actas.map(acta => (
                <tr key={acta.id} className="hover:bg-slate-50">
                  <td className="p-4">
                    <div className="font-medium text-slate-800">{acta.numero || 'Sin Número'}</div>
                    <div className="text-sm text-slate-500">{acta.titulo}</div>
                  </td>
                  <td className="p-4 text-slate-600">{new Date(acta.fecha).toLocaleDateString()}</td>
                  <td className="p-4 text-slate-600">{acta.tipo_sesion}</td>
                  <td className="p-4">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                      acta.estado === 'Borrador' ? 'bg-amber-100 text-amber-700' :
                      acta.estado === 'Refinada' ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'
                    }`}>
                      {acta.estado}
                    </span>
                  </td>
                  <td className="p-4 text-right">
                    <button 
                      onClick={() => setEditingActa(acta)}
                      className="p-2 text-slate-400 hover:text-indigo-600 rounded-lg hover:bg-slate-100 transition-colors"
                      title="Editar Acta"
                    >
                      <Edit className="w-5 h-5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

interface ActaEditorProps {
  acta: ActaSesion | null;
  onBack: () => void;
  notify?: (msg: string, type: 'success' | 'error' | 'warning' | 'info') => void;
  user: User | null;
}

const ActaEditor: React.FC<ActaEditorProps> = ({ acta, onBack, notify, user }) => {
  const [numero, setNumero] = useState(acta?.numero || '');
  const [titulo, setTitulo] = useState(acta?.titulo || '');
  const [fecha, setFecha] = useState(acta?.fecha || new Date().toISOString().split('T')[0]);
  const [tipo, setTipo] = useState(acta?.tipo_sesion || 'Ordinaria');
  const [bruto, setBruto] = useState(acta?.contenido_bruto || '');
  const [refinado, setRefinado] = useState(acta?.contenido_refinado || '');
  const [estado, setEstado] = useState(acta?.estado || 'Borrador');
  const [firmantes, setFirmantes] = useState<ActaFirmante[]>(acta?.firmantes || []);
  
  const [autoridades, setAutoridades] = useState<PersonalDirectorio[]>([]);
  const [loadingAI, setLoadingAI] = useState(false);
  const [showMetadataModal, setShowMetadataModal] = useState(!acta);
  const [previewMode, setPreviewMode] = useState(!!acta?.contenido_refinado);
  
  const [mentionQuery, setMentionQuery] = useState<{ text: string, startIndex: number } | null>(null);
  
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!acta && !numero) {
      const fetchNextNumero = async () => {
        const { data, error } = await supabase
          .from('actas_sesiones')
          .select('numero')
          .order('created_at', { ascending: false })
          .limit(1);
        
        if (data && data.length > 0 && data[0].numero) {
          const lastNum = data[0].numero;
          const match = lastNum.match(/^(\d+)(.*)/);
          if (match) {
            const nextNum = parseInt(match[1], 10) + 1;
            const paddedNum = nextNum.toString().padStart(match[1].length, '0');
            setNumero(`${paddedNum}${match[2]}`);
          }
        } else {
          setNumero(`001-${new Date().getFullYear()}`);
        }
      };
      fetchNextNumero();
    }
  }, [acta, numero]);

  useEffect(() => {
    const fetchAutoridades = async () => {
      const { data } = await supabase.from('personal_directorio').select('*').order('nombre');
      if (data) setAutoridades(data);
    };
    fetchAutoridades();
  }, []);



  const handleSave = async () => {
    try {
      const payload = {
        numero,
        titulo: titulo || 'Acta sin título',
        fecha,
        tipo_sesion: tipo,
        contenido_bruto: bruto,
        contenido_refinado: refinado,
        estado,
        firmantes,
        created_by: user?.id
      };

      if (acta?.id) {
        const { error } = await supabase.from('actas_sesiones').update(payload).eq('id', acta.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('actas_sesiones').insert([payload]);
        if (error) throw error;
      }
      notify?.('Acta guardada correctamente.', 'success');
      onBack();
    } catch (err) {
      console.error(err);
      notify?.('Error al guardar el acta.', 'error');
    }
  };

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setBruto(val);
    
    // Check for @mention
    const cursor = e.target.selectionStart;
    const textBefore = val.slice(0, cursor);
    const match = /(?:^|\s)@([a-zA-ZñÑáéíóúÁÉÍÓÚ\s]{0,20})$/.exec(textBefore);
    
    if (match) {
      setMentionQuery({
        text: match[1],
        startIndex: cursor - match[1].length - 1 // index of '@'
      });
    } else {
      setMentionQuery(null);
    }
  };

  const applyMention = (person: PersonalDirectorio) => {
    if (!mentionQuery || !textareaRef.current) return;
    
    let formattedName = person.nombre;
    const parts = person.nombre.split(' ');
    if (parts.length >= 3) {
      const surname = parts.slice(0, 2).join(' ');
      const names = parts.slice(2).join(' ');
      formattedName = `${names} ${surname}`;
    }

    const titlePrefix = person.titulo_academico ? `${person.titulo_academico} ` : '';
    const mentionText = `${titlePrefix}${formattedName}${person.cargo_actual ? `, ${person.cargo_actual}` : ''}`;

    const before = bruto.slice(0, mentionQuery.startIndex);
    const after = bruto.slice(textareaRef.current.selectionStart);
    
    const newText = before + mentionText + " " + after;
    setBruto(newText);
    setMentionQuery(null);

    if (!firmantes.find(f => f.id === person.id)) {
      setFirmantes([...firmantes, {
        id: person.id,
        nombre_formateado: `${titlePrefix}${formattedName}`,
        cargo: person.cargo_actual || 'Sin cargo',
        firmado: false
      }]);
    }

    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        const cur = mentionQuery.startIndex + mentionText.length + 1;
        textareaRef.current.selectionStart = cur;
        textareaRef.current.selectionEnd = cur;
      }
    }, 0);
  };

  const handleRefine = async () => {
    if (!bruto.trim()) {
      notify?.('Escribe algo en el lienzo primero.', 'warning');
      return;
    }
    setLoadingAI(true);
    try {
      const promptText = `
Eres un asistente de redacción institucional especializado en actas de sesión universitaria.
Tu tarea es reescribir el borrador provisto usando un lenguaje formal, pulcro y adecuado.

REGLAS CRÍTICAS / DE CARÁCTER OBLIGATORIO:
1. NO RESUMAS ni omitas información. Mantén TODOS los acuerdos, debates y detalles mencionados. Extiende la redacción formalizando todo el contenido.
2. Devuelve ESTRICTAMENTE un JSON con este formato: {"titulo_sugerido": "...", "contenido_redactado": "..."} donde "titulo_sugerido" es UN ASUNTO CORTO (e.g., "PRÉSTAMO DE EQUIPOS AL CEPRU", SIN incluir la frase "Acta de sesión...").
3. NO incluyas NINGÚN tipo de saludo, introducción o texto fuera del JSON. Ni formato markdown \`\`\`json.
4. Las declaraciones entre comillas dobles (" ") son Citas Exactas. Mantenlas literalmente en el texto final.

Contenido Borrador:
${bruto}
`;

      const res = await fetch('/api/gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          input: promptText,
          model: 'gemini-3.0-pro',
          config: {
            responseMimeType: "application/json",
            temperature: 0.3,
            maxOutputTokens: 8192,
          }
        })
      });
      
      const resData = await res.json();
      
      if (!res.ok) {
        throw new Error(resData.error || "Error en la respuesta del servidor");
      }
      
      let resText = resData.text || '';
      resText = resText.replace(/^```[a-z]*\n?/gm, '').replace(/```$/gm, '').trim();
      
      try {
        const parsed = JSON.parse(resText);
        setRefinado(parsed.contenido_redactado || '');
        if (parsed.titulo_sugerido) {
          setTitulo(parsed.titulo_sugerido);
        }
      } catch (e) {
        // Fallback in case AI doesn't return JSON
        setRefinado(resText);
      }
      
      setEstado('Refinada');
      notify?.('Contenido refinado con éxito.', 'success');
      setPreviewMode(true); // Switch to preview automatically
    } catch (error: any) {
      console.error(error);
      if (error?.status === 429 || error?.message?.includes('429') || error?.message?.includes('quota')) {
        notify?.('Límite de uso excedido (Error 429). Por favor, intenta de nuevo más tarde.', 'error');
      } else {
        notify?.('Error al conectar con la IA.', 'error');
      }
    }
    setLoadingAI(false);
  };

  const toggleFirmante = (personId: string) => {
    if (firmantes.find(f => f.id === personId)) {
      setFirmantes(firmantes.filter(f => f.id !== personId));
    } else {
      const p = autoridades.find(a => a.id === personId);
      if (p) {
        let formattedName = p.nombre;
        const parts = p.nombre.split(' ');
        if (parts.length >= 3) {
          const surname = parts.slice(0, 2).join(' ');
          const names = parts.slice(2).join(' ');
          formattedName = `${names} ${surname}`;
        }
        const titlePrefix = p.titulo_academico ? `${p.titulo_academico} ` : '';
        setFirmantes([...firmantes, {
          id: p.id,
          nombre_formateado: `${titlePrefix}${formattedName}`,
          cargo: p.cargo_actual || 'Sin cargo',
          firmado: false
        }]);
      }
    }
  };

  const [imprimiendo, setImprimiendo] = useState(false);
  const printableRef = useRef<HTMLDivElement>(null);
  
  const handlePrint = () => {
    window.print();
  };

  const handleSendEmail = async () => {
    // Collect emails from actual firmantes
    const recipients = firmantes
      .map(f => {
        const aut = autoridades.find(a => a.id === f.id);
        return aut ? { email: aut.correo, nombre: aut.nombre } : null;
      })
      .filter(r => r && r.email && r.nombre);

    if (recipients.length === 0) {
      notify?.('No hay correos registrados entre los firmantes de esta acta.', 'warning');
      return;
    }
    
    if (!acta?.archivo_pdf) {
      notify?.('Sube el PDF firmado primero.', 'warning');
      return;
    }

    try {
      notify?.('Enviando correos, por favor espera...', 'info');

      for (const r of recipients) {
        if (!r) continue;
        const response = await fetch('/api/send-email', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            to: r.email,
            subject: `Acta de Sesión: ${acta.titulo || 'Sin Asunto'}`,
            html: `
              <div style="font-family: sans-serif; padding: 20px;">
                <h2 style="color: #7b1523;">Dirección de Admisión UNSAAC</h2>
                <p>Estimado(a) <strong>${r.nombre}</strong>,</p>
                <p>Se le hace entrega del Acta de Sesión correspondiente a:</p>
                <div style="background: #f8fafc; padding: 15px; border-left: 4px solid #7b1523; margin: 20px 0;">
                  <strong>Sesión:</strong> ${tipo}<br/>
                  <strong>Asunto:</strong> ${acta.titulo || 'Sin Asunto'}<br/>
                  <strong>Fecha:</strong> ${new Date(fecha).toLocaleDateString('es-PE')}
                </div>
                <p>Puede visualizar y descargar el documento PDF firmado ingresando al siguiente enlace de nuestro repositorio institucional:</p>
                <div style="margin: 20px 0;">
                  <a href="${acta.archivo_pdf}" target="_blank" style="background-color: #7b1523; color: white; padding: 10px 20px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Ver Acta PDF</a>
                </div>
                <p>Atentamente,<br/><strong>Dirección de Admisión UNSAAC</strong></p>
              </div>
            `
          })
        });

        if (!response.ok) {
           const errData = await response.json();
           throw new Error(errData.error || 'Error desconocido del servidor.');
        }
      }

      notify?.('Correos enviados satisfactoriamente.', 'success');
    } catch(err: any) {
      console.error(err);
      notify?.('Error al enviar los correos: ' + err.message, 'error');
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !acta?.id) return;
    
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${acta.id}_firmada.${fileExt}`;
      const filePath = `actas_sesiones/${fileName}`;

      notify?.('Subiendo archivo...', 'info');

      const { error: uploadError } = await supabase.storage
        .from('documentos')
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('documentos')
        .getPublicUrl(filePath);

      const docUrl = urlData.publicUrl;

      const { error: updateError } = await supabase
        .from('actas_sesiones')
        .update({ archivo_pdf: docUrl, estado: 'Cerrada' })
        .eq('id', acta.id);

      if (updateError) throw updateError;
      
      notify?.('Acta firmada subida correctamente. Estado movido a Cerrada.', 'success');
      onBack();
    } catch (err: any) {
      console.error(err);
      notify?.(`Error al subir el archivo: ${err.message}`, 'error');
    }
  };

  const filteredAutoridades = mentionQuery 
    ? autoridades.filter(a => a.nombre.toLowerCase().includes(mentionQuery.text.toLowerCase()) || (a.cargo_actual && a.cargo_actual.toLowerCase().includes(mentionQuery.text.toLowerCase())))
    : autoridades;

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col h-full absolute inset-0 z-10 m-4 md:m-8">
      {/* Top Bar */}
      <style>{`
        @media print {
          @page { size: auto; margin: 15mm; }
          body * { visibility: hidden; }
          #printable-acta, #printable-acta * { visibility: visible; }
          
          /* Hide all UI elements that take up space */
          aside, header, nav, button, .print\\:hidden { display: none !important; }
          
          /* Break out of all scrollable / fixed height containers */
          html, body, #root {
            height: auto !important;
            min-height: auto !important;
            overflow: visible !important;
            position: static !important;
          }

          /* Extremely important to let containers flow */
          .overflow-hidden, .overflow-y-auto, .flex, .grid, .absolute, .inset-0, .h-full, .h-screen, .flex-1, main, section, div {
            overflow: visible !important;
            height: auto !important;
            min-height: auto !important;
            max-height: none !important;
            page-break-inside: auto !important;
          }
          
          #printable-acta {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            max-width: none !important;
            margin: 0 !important;
            padding: 0 !important;
            border: none !important;
            box-shadow: none !important;
            background: white !important;
            display: block !important;
          }

          /* Ensure text area expands and shows full content */
          #preview-textarea { display: none !important; }
        }
      `}</style>
      <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between shrink-0 print:hidden">
        <button onClick={onBack} className="flex items-center text-slate-500 hover:text-slate-700 font-medium">
          <ArrowLeft className="w-5 h-5 mr-1" />
          Volver
        </button>
        <div className="flex flex-1 justify-center items-center gap-4">
          <button 
            onClick={() => {
              if (estado !== 'Cerrada') setShowMetadataModal(true);
            }} 
            className={`flex flex-col items-center group transition-colors ${estado === 'Cerrada' ? 'cursor-default' : 'cursor-pointer'}`}
          >
            <span className={`text-sm font-bold text-slate-800 ${estado !== 'Cerrada' ? 'group-hover:text-indigo-600' : ''}`}>
              {titulo || 'Acta Nueva'}
            </span>
            <span className={`text-xs text-slate-500 ${estado !== 'Cerrada' ? 'group-hover:text-indigo-500' : ''}`}>
              {numero ? `Nro. ${numero}` : 'Sin número'} · {tipo}
            </span>
          </button>
        </div>
        <div className="flex gap-2">
          {estado !== 'Cerrada' && (
            <button 
              onClick={() => setPreviewMode(!previewMode)}
              className={`flex items-center px-4 py-2 font-medium rounded-lg transition ${previewMode ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
            >
              {previewMode ? <Edit className="w-5 h-5 mr-2" /> : <Eye className="w-5 h-5 mr-2" />}
              {previewMode ? 'Modo Edición' : 'Vista Previa'}
            </button>
          )}
          {estado !== 'Cerrada' && (
            <button 
              onClick={handleSave}
              className="flex items-center px-4 py-2 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 transition"
            >
              <Save className="w-5 h-5 mr-2" />
              Guardar
            </button>
          )}
        </div>
      </div>
      
      {/* Main Content Area */}
      <div className="flex-1 overflow-hidden grid grid-cols-1 lg:grid-cols-4">
        {/* Editor or Preview Pane */}
        <div className="lg:col-span-3 p-6 flex flex-col h-full bg-slate-100 overflow-y-auto">
          {previewMode ? (
            <div className="flex flex-col gap-4 mx-auto max-w-4xl w-full">
              {/* Preview Action Bar */}
              <div className="bg-white border border-slate-200 shadow-sm p-4 rounded-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4 print:hidden">
                <div className="flex flex-wrap items-center gap-3">
                  <span className={`px-3 py-1.5 rounded-full text-[11px] font-black uppercase tracking-wider flex-shrink-0 ${
                    estado === 'Cerrada' ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' :
                    estado === 'Refinada' ? 'bg-indigo-100 text-indigo-800 border border-indigo-200' :
                    'bg-slate-100 text-slate-800 border border-slate-200'
                  }`}>
                    {estado}
                  </span>
                  {acta?.archivo_pdf && (
                      <a href={acta.archivo_pdf} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 px-4 py-2 bg-red-50 hover:bg-red-100 text-red-700 rounded-lg text-[13px] font-bold transition border border-red-200 shadow-sm">
                        <FileSignature className="w-4 h-4" /> Ver Documento Firmado
                      </a>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2 md:gap-3 w-full md:w-auto">
                  <button onClick={handlePrint} className="flex-1 md:flex-none flex justify-center items-center px-4 py-2 bg-white hover:bg-slate-50 text-slate-700 font-medium text-[13px] rounded-lg transition shadow-sm border border-slate-200">
                    <Printer className="w-4 h-4 md:mr-2" /> <span className="hidden md:inline">Imprimir / Visualizar</span>
                  </button>
                  {acta?.id && (
                    <label className="flex-1 md:flex-none flex justify-center items-center px-4 py-2 bg-white hover:bg-emerald-50 text-emerald-700 font-medium text-[13px] rounded-lg transition shadow-sm cursor-pointer border border-emerald-200">
                      <UploadCloud className="w-4 h-4 md:mr-2" /> 
                      <span className="whitespace-nowrap">{acta.archivo_pdf ? 'Actualizar PDF' : 'Subir Firmado'}</span>
                      <input type="file" accept="application/pdf" className="hidden" onChange={handleFileUpload} />
                    </label>
                  )}
                  {estado === 'Cerrada' && (
                    <button onClick={handleSendEmail} className="w-full md:w-auto flex justify-center items-center px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-[13px] rounded-lg transition shadow-sm">
                      <span className="material-symbols-outlined text-[16px] mr-2">send</span> Enviar a Firmantes
                    </button>
                  )}
                </div>
              </div>

              {/* Institutional Document */}
              <div id="printable-acta" className="bg-white border-y-[12px] border-y-[#7B1E32] shadow-xl p-10 lg:p-20 text-slate-900 font-serif leading-relaxed min-h-[1056px] flex flex-col items-center">
                
                {/* Header UNSAAC-like */}
                <div className="w-full text-center border-b-[2px] border-slate-300 pb-8 mb-10">
                  <h1 className="text-xl md:text-2xl font-bold uppercase tracking-[0.15em] text-[#7B1E32]">Universidad Nacional de San Antonio Abad del Cusco</h1>
                  <h2 className="text-md md:text-lg font-semibold uppercase tracking-widest text-slate-600 mt-2">Dirección de Admisión</h2>
                </div>

                <div className="w-full text-center mb-10">
                  <h3 className="text-2xl font-bold uppercase tracking-wide px-4">ACTA DE SESIÓN</h3>
                  <h4 className="text-lg font-semibold uppercase tracking-wide text-slate-700 mt-3 px-8 leading-snug">{titulo || 'ASUNTO NO ESPECIFICADO'}</h4>
                  <div className="text-sm font-bold text-slate-500 mt-6 uppercase tracking-widest border border-slate-300 inline-block px-4 py-2 rounded-sm bg-slate-50">
                    Sesión {tipo} — Nro. {numero || 'S/N'} — Fecha: {new Date(fecha).toLocaleDateString('es-PE', { day: 'numeric', month: 'long', year: 'numeric'})}
                  </div>
                </div>
                
                <div className="relative w-full min-h-[400px]">
                  {/* Div invisible para forzar el alto real del texto y para impresión */}
                  <div 
                    className="w-full font-serif text-[1.05rem] p-0 text-justify whitespace-pre-wrap leading-[1.8] invisible print:visible print:block"
                    aria-hidden="true"
                  >
                    {refinado || ' '}
                  </div>
                  
                  {/* Textarea para edición sobrepuesta al div invisible */}
                  <textarea
                    id="preview-textarea"
                    value={refinado}
                    onChange={e => setRefinado(e.target.value)}
                    placeholder="El texto refinado aparecerá aquí. Ajusta cualquier detalle directamente."
                    className="absolute inset-0 w-full h-full border-none focus:ring-0 resize-none font-serif text-[1.05rem] bg-transparent p-0 text-justify overflow-hidden leading-[1.8] outline-none selection:bg-indigo-200 print:hidden"
                  />
                </div>

                {firmantes.length > 0 && (
                  <div className="w-full mt-24 pt-10">
                    <div className="grid grid-cols-2 gap-x-12 gap-y-32">
                      {firmantes.map(f => (
                        <div key={f.id} className="text-center px-4">
                           <div className="border-t border-slate-400 w-full mb-3 max-w-[250px] mx-auto"></div>
                          <div className="font-bold text-sm tracking-wide text-slate-800">{f.nombre_formateado}</div>
                          <div className="text-xs text-slate-500 tracking-wider uppercase mt-1">{f.cargo}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                {/* Footer Stamp */}
                <div className="w-full mt-24 border-t-[1px] border-slate-200 pt-6 text-center">
                   <p className="text-[10px] text-slate-400 font-sans tracking-widest uppercase">Documento Oficial generado por el Sistema de Admisión UNSAAC</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col h-full max-w-4xl w-full mx-auto bg-white border border-slate-200 shadow-sm rounded-xl overflow-hidden relative">
              <div className="p-3 border-b border-slate-100 bg-slate-50 flex justify-between items-center shrink-0">
                <span className="font-semibold text-slate-700 text-sm">Contenido Bruto (Borrador)</span>
                <button 
                  onClick={handleRefine} 
                  disabled={loadingAI} 
                  className="text-sm flex items-center px-4 py-1.5 bg-purple-100 text-purple-700 hover:bg-purple-200 disabled:opacity-50 rounded-full font-bold transition shadow-sm"
                >
                  <Wand2 className="w-4 h-4 mr-1.5" /> {loadingAI ? 'Refinando...' : 'Refinar con IA ✨'}
                </button>
              </div>
              <div className="relative flex-1 p-0">
                <textarea
                  ref={textareaRef}
                  value={bruto}
                  onChange={handleTextareaChange}
                  placeholder='Escribe los acuerdos de la sesión. 
Para mencionar o agregar a una autoridad, escribe "@".
Ejemplo: "@Juan Perez..."
Citas textuales entre comillas: "..."'
                  className="w-full h-full p-6 outline-none resize-none font-mono text-sm leading-relaxed text-slate-800"
                />
                
                {/* Floating mentions menu */}
                {mentionQuery && (
                  <div className="absolute top-0 right-4 mt-4 w-72 bg-white border border-slate-200 shadow-2xl rounded-xl z-20 max-h-64 flex flex-col overflow-hidden">
                    <div className="p-2 bg-indigo-50 border-b border-indigo-100 flex items-center gap-2 shrink-0">
                      <Search className="w-4 h-4 text-indigo-400" />
                      <span className="text-xs font-semibold text-indigo-800 flex-1 truncate">
                        Sugerencias para: <span className="font-mono bg-white px-1 rounded text-indigo-600">@{mentionQuery.text}</span>
                      </span>
                    </div>
                    <div className="flex-1 overflow-y-auto p-1">
                      {filteredAutoridades.map(person => (
                        <button 
                          key={person.id} 
                          onClick={() => applyMention(person)} 
                          className="w-full text-left p-2 hover:bg-indigo-50 focus:bg-indigo-50 outline-none text-sm border-b border-slate-50 last:border-0 rounded-lg group"
                        >
                          <div className="font-medium text-slate-800 group-hover:text-indigo-700">{person.nombre}</div>
                          <div className="text-xs text-slate-500">{person.cargo_actual || 'Sin cargo asignado'}</div>
                        </button>
                      ))}
                      {filteredAutoridades.length === 0 && (
                        <div className="p-4 text-center text-sm text-slate-500">
                          No se encontraron coincidencias.
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Sidebar: Posfirmas */}
        <div className="bg-white border-l border-slate-200 flex flex-col h-full lg:col-span-1 border-t lg:border-t-0 p-6 overflow-y-auto">
          <h3 className="font-bold text-slate-800 flex items-center gap-2 mb-2">
            <FileSignature className="w-5 h-5 text-indigo-600" />
            Posfirmas (Firmantes)
          </h3>
          <p className="text-xs text-slate-500 mb-6 leading-relaxed">
            Se agregan automáticamente al mencionar (<b>@</b>) a una autoridad en el lienzo. También puedes añadirlas abajo.
          </p>
          
          <div className="space-y-3 mb-6 flex-1">
            {firmantes.map(f => (
              <div key={f.id} className="flex justify-between items-center bg-slate-50 p-3 rounded-lg border border-slate-200">
                <div className="min-w-0 pr-3">
                  <div className="font-semibold text-sm text-slate-800 truncate" title={f.nombre_formateado}>{f.nombre_formateado}</div>
                  <div className="text-xs text-slate-500 truncate" title={f.cargo}>{f.cargo}</div>
                </div>
                <button onClick={() => toggleFirmante(f.id)} className="text-slate-400 hover:text-rose-500 hover:bg-rose-50 p-1.5 rounded-md transition shrink-0">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
            {firmantes.length === 0 && (
               <div className="h-32 border-2 border-dashed border-slate-200 rounded-xl flex flex-col items-center justify-center text-slate-400 text-sm">
                 <UserPlus className="w-6 h-6 mb-2 text-slate-300" />
                 Sin firmantes
               </div>
            )}
          </div>

          <div className="shrink-0 mt-4 pt-4 border-t border-slate-100">
            <label className="block text-xs font-bold text-slate-600 uppercase mb-2">Agregar Manualmente</label>
            <select 
              className="w-full p-2.5 border border-slate-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
              onChange={(e) => {
                if (e.target.value) {
                  toggleFirmante(e.target.value);
                  e.target.value = '';
                }
              }}
              defaultValue=""
            >
              <option value="" disabled>Seleccione una autoridad...</option>
              {autoridades.filter(a => !firmantes.find(f => f.id === a.id)).map(a => (
                <option key={a.id} value={a.id}>{a.nombre}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Metadata Modal */}
      {showMetadataModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl overflow-hidden flex flex-col">
            <div className="p-6 border-b border-slate-100">
              <h2 className="text-xl font-bold text-slate-800">Datos Principales del Acta</h2>
              <p className="text-sm text-slate-500 mt-1">Configura la información cabecera de la sesión para comenzar a redactar.</p>
            </div>
            
            <div className="p-6 space-y-4 flex-1 overflow-y-auto">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Título del Acta</label>
                <input 
                  value={titulo} 
                  autoFocus
                  onChange={e => setTitulo(e.target.value)} 
                  placeholder="Ej. Aprobación de resultados Pre-U..." 
                  className="w-full p-2.5 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500" 
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Número u Oficio</label>
                  <input 
                    value={numero} 
                    onChange={e => setNumero(e.target.value)} 
                    placeholder="001-2024" 
                    className="w-full p-2.5 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500" 
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Fecha</label>
                  <input 
                    type="date" 
                    value={fecha} 
                    onChange={e => setFecha(e.target.value)} 
                    className="w-full p-2.5 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500" 
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Tipo de Sesión</label>
                  <select 
                    value={tipo} 
                    onChange={e => setTipo(e.target.value)} 
                    className="w-full p-2.5 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                  >
                    <option value="Ordinaria">Ordinaria</option>
                    <option value="Extraordinaria">Extraordinaria</option>
                  </select>
                </div>
              </div>
            </div>
            
            <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3 shrink-0">
              {acta && (
                <button 
                  onClick={() => setShowMetadataModal(false)}
                  className="px-4 py-2 text-slate-600 font-medium hover:bg-slate-200 rounded-lg transition"
                >
                  Cancelar
                </button>
              )}
              <button 
                onClick={() => {
                  if(!titulo) {
                     setTitulo('Nueva Acta (Sin Título)');
                  }
                  setShowMetadataModal(false);
                }}
                className="px-6 py-2 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 transition"
              >
                {acta ? 'Actualizar Datos' : 'Ir al Editor'} 
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

