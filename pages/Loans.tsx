import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';
import { User, InventoryItem, LoanRecord } from '../types';
import * as XLSX from 'xlsx';
import Barcode from 'react-barcode';
import { useReactToPrint } from 'react-to-print';

interface LoansProps {
  user: User;
  notify: (message: string, type?: 'success' | 'error' | 'warning' | 'info') => void;
}

export const Loans: React.FC<LoansProps> = ({ user, notify }) => {
  const [activeTab, setActiveTab] = useState<'prestamos' | 'inventario'>('prestamos');
  
  // Constancia printing states
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [loanToPrint, setLoanToPrint] = useState<LoanRecord[] | null>(null);
  const [operatorDni, setOperatorDni] = useState('');
  const [operatorName, setOperatorName] = useState(user.name || '');
  const constanciaPrintRef = useRef<HTMLDivElement>(null);

  // States for signature custom positioning/scale adjustments
  const [sigScale, setSigScale] = useState(1.0);
  const [sigOffsetX, setSigOffsetX] = useState(0);
  const [sigOffsetY, setSigOffsetY] = useState(0);
  const [showAdvancedSigPos, setShowAdvancedSigPos] = useState(false);
  const [isDraggingSig, setIsDraggingSig] = useState(false);
  const dragStartPos = useRef({ x: 0, y: 0 });
  const dragStartOffset = useRef({ x: 0, y: 0 });

  useEffect(() => {
    if (!isDraggingSig) return;

    const handleMouseMove = (e: MouseEvent) => {
      const dx = e.clientX - dragStartPos.current.x;
      const dy = e.clientY - dragStartPos.current.y;
      setSigOffsetX(dragStartOffset.current.x + dx);
      setSigOffsetY(dragStartOffset.current.y + dy);
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 0) return;
      const dx = e.touches[0].clientX - dragStartPos.current.x;
      const dy = e.touches[0].clientY - dragStartPos.current.y;
      setSigOffsetX(dragStartOffset.current.x + dx);
      setSigOffsetY(dragStartOffset.current.y + dy);
    };

    const handleMouseUp = () => {
      setIsDraggingSig(false);
    };

    const handleTouchEnd = () => {
      setIsDraggingSig(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('touchmove', handleTouchMove, { passive: false });
    window.addEventListener('touchend', handleTouchEnd);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
    };
  }, [isDraggingSig]);

  const handleSigMouseDown = (e: React.MouseEvent<HTMLImageElement>) => {
    e.preventDefault();
    setIsDraggingSig(true);
    dragStartPos.current = { x: e.clientX, y: e.clientY };
    dragStartOffset.current = { x: sigOffsetX, y: sigOffsetY };
  };

  const handleSigTouchStart = (e: React.TouchEvent<HTMLImageElement>) => {
    setIsDraggingSig(true);
    dragStartPos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    dragStartOffset.current = { x: sigOffsetX, y: sigOffsetY };
  };

  useEffect(() => {
    if (user?.name) {
      setOperatorName(user.name);
    }
  }, [user?.name]);

  useEffect(() => {
    const fetchUserDni = async () => {
      if (!user?.id) return;
      try {
        const { data, error } = await supabase
          .from('usuarios')
          .select('dni')
          .eq('id', user.id)
          .maybeSingle();
        if (!error && data?.dni) {
          setOperatorDni(data.dni);
        }
      } catch (e) {
        console.error("Error fetching operator Dni", e);
      }
    };
    fetchUserDni();
  }, [user?.id]);

  const handlePrintConstancia = useReactToPrint({
    contentRef: constanciaPrintRef,
    documentTitle: loanToPrint && loanToPrint.length > 0 
      ? `Constancia_Prestamo_${loanToPrint[0].prestatario_dni}` 
      : 'Constancia_Prestamo',
  });
  
  // Inventario State
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [loadingInventory, setLoadingInventory] = useState(false);
  const [isInventoryModalOpen, setIsInventoryModalOpen] = useState(false);
  const [newItem, setNewItem] = useState({ codigo_barras: '', nombre_bien: '', descripcion_estado: '' });
  const [searchInventoryQuery, setSearchInventoryQuery] = useState('');
  const [inventoryFilter, setInventoryFilter] = useState<'Todos' | 'Disponible' | 'Prestado' | 'En Mantenimiento'>('Todos');
  const printComponentRef = useRef<HTMLDivElement>(null);
  
  // Préstamos State
  const [loans, setLoans] = useState<LoanRecord[]>([]);
  const [loadingLoans, setLoadingLoans] = useState(false);
  const [isLoanModalOpen, setIsLoanModalOpen] = useState(false);
  const [loanFilter, setLoanFilter] = useState<'Todos' | 'Activo' | 'Vencido' | 'Devuelto'>('Todos');
  const [searchQuery, setSearchQuery] = useState('');
  
  // New Loan Form State
  const [newLoan, setNewLoan] = useState({
    bienes_seleccionados: [] as InventoryItem[],
    prestatario_dni: '',
    prestatario_nombre: '',
    prestatario_correo: '',
    prestatario_celular: '',
    fecha_limite: ''
  });
  
  // Person Search State for Autocomplete
  const [personSearchResults, setPersonSearchResults] = useState<any[]>([]);
  const [showPersonDropdown, setShowPersonDropdown] = useState(false);
  const [selectedPersonFromDropdown, setSelectedPersonFromDropdown] = useState(false);

  useEffect(() => {
    const searchPerson = async () => {
      // Don't search if we just selected from dropdown
      if (selectedPersonFromDropdown) {
        setSelectedPersonFromDropdown(false);
        return;
      }
      if (newLoan.prestatario_nombre.length < 3) {
        setPersonSearchResults([]);
        setShowPersonDropdown(false);
        return;
      }
      
      const { data } = await supabase
        .from('personal_directorio')
        .select('*')
        .ilike('nombre', `%${newLoan.prestatario_nombre}%`)
        .limit(10);
      
      if (data && data.length > 0) {
        setPersonSearchResults(data);
        setShowPersonDropdown(true);
      } else {
        setShowPersonDropdown(false);
      }
    };

    const debounceId = setTimeout(searchPerson, 300);
    return () => clearTimeout(debounceId);
  }, [newLoan.prestatario_nombre, selectedPersonFromDropdown]);
  
  // Custom dropdown state for inventory search
  const [searchBienTerm, setSearchBienTerm] = useState('');
  const [showBienDropdown, setShowBienDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  
  // Signature State (Basic Canvas)
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);

  // Email API State
  const [sendingEmailId, setSendingEmailId] = useState<string | null>(null);

  useEffect(() => {
    fetchInventory();
    fetchLoans();
  }, []); // Load both on mount
  
  useEffect(() => {
    // Also re-fetch selectively if tab changes, just to keep it fresh
    if (activeTab === 'inventario') fetchInventory();
    else fetchLoans();
  }, [activeTab]);

  // Handle clicking outside the dropdown to close it
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowBienDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchInventory = async () => {
    setLoadingInventory(true);
    try {
      const { data, error } = await supabase.from('inventario_bienes').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      setInventory(data || []);
    } catch (error: any) {
      notify(`Error cargando inventario: ${error.message}`, 'error');
    } finally {
      setLoadingInventory(false);
    }
  };

  const fetchLoans = async () => {
    setLoadingLoans(true);
    try {
      const { data, error } = await supabase
        .from('prestamos')
        .select('*, inventario_bienes(*)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      
      // Auto-update status to Vencido if past due date and still Activo
      const now = new Date();
      let updatedData = data || [];
      let needsUpdate = false;
      
      updatedData = updatedData.map(loan => {
        if (loan.estado_prestamo === 'Activo' && new Date(loan.fecha_limite) < now) {
          needsUpdate = true;
          // We don't await here to not block UI, we'll do a background update
          supabase.from('prestamos').update({ estado_prestamo: 'Vencido' }).eq('id', loan.id).then();
          return { ...loan, estado_prestamo: 'Vencido' };
        }
        return loan;
      });

      setLoans(updatedData);
    } catch (error: any) {
      notify(`Error cargando préstamos: ${error.message}`, 'error');
    } finally {
      setLoadingLoans(false);
    }
  };

  const handleCreateInventoryItem = async () => {
    if (!newItem.codigo_barras || !newItem.nombre_bien) return;
    try {
      const { error } = await supabase.from('inventario_bienes').insert([{
        ...newItem,
        estado_actual: 'Disponible'
      }]);
      if (error) throw error;
      notify('Bien registrado correctamente');
      setIsInventoryModalOpen(false);
      setNewItem({ codigo_barras: '', nombre_bien: '', descripcion_estado: '' });
      fetchInventory();
    } catch (error: any) {
      notify(`Error: ${error.message}`, 'error');
    }
  };

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (!hasSignature) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    let clientX, clientY;
    if ('touches' in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = (e as React.MouseEvent).clientX;
      clientY = (e as React.MouseEvent).clientY;
    }
    
    const x = (clientX - rect.left) * scaleX;
    const y = (clientY - rect.top) * scaleY;

    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#000000';
    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawing(true);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    let clientX, clientY;
    if ('touches' in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = (e as React.MouseEvent).clientX;
      clientY = (e as React.MouseEvent).clientY;
    }
    
    const x = (clientX - rect.left) * scaleX;
    const y = (clientY - rect.top) * scaleY;

    ctx.lineTo(x, y);
    ctx.stroke();
    setHasSignature(true);
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const clearSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
  };

  const handleCreateLoan = async () => {
    if (newLoan.bienes_seleccionados.length === 0 || !newLoan.prestatario_dni || !newLoan.prestatario_nombre || !newLoan.fecha_limite) {
      notify('Por favor complete los campos obligatorios y seleccione al menos un bien', 'warning');
      return;
    }

    try {
      let firmaUrl = null;
      
      // Upload signature if exists
      if (hasSignature && canvasRef.current) {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        let blob: Blob | null = null;
        
        if (ctx) {
            try {
                const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                const data = imgData.data;
                let minX = canvas.width, minY = canvas.height, maxX = 0, maxY = 0;
                let hasPixels = false;
                
                for (let y = 0; y < canvas.height; y++) {
                    for (let x = 0; x < canvas.width; x++) {
                        const idx = (y * canvas.width + x) * 4;
                        if (data[idx + 3] > 0) {
                            hasPixels = true;
                            if (x < minX) minX = x;
                            if (x > maxX) maxX = x;
                            if (y < minY) minY = y;
                            if (y > maxY) maxY = y;
                        }
                    }
                }
                
                if (hasPixels) {
                    const padding = 10;
                    minX = Math.max(0, minX - padding);
                    minY = Math.max(0, minY - padding);
                    maxX = Math.min(canvas.width, maxX + padding);
                    maxY = Math.min(canvas.height, maxY + padding);
                    
                    const cropWidth = maxX - minX;
                    const cropHeight = maxY - minY;
                    
                    const cropCanvas = document.createElement('canvas');
                    cropCanvas.width = cropWidth;
                    cropCanvas.height = cropHeight;
                    const cropCtx = cropCanvas.getContext('2d');
                    
                    if (cropCtx) {
                        cropCtx.putImageData(ctx.getImageData(minX, minY, cropWidth, cropHeight), 0, 0);
                        blob = await new Promise<Blob | null>(resolve => cropCanvas.toBlob(resolve, 'image/png'));
                    } else {
                        blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
                    }
                } else {
                    blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
                }
            } catch(e) {
                console.error('Error cropping signature:', e);
                blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
            }
        } else {
            blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
        }

        if (blob) {
          const fileName = `firma_${Date.now()}.png`;
          const { error: uploadError } = await supabase.storage
            .from('documentos')
            .upload(`firmas/${fileName}`, blob);
            
          if (!uploadError) {
            const { data } = supabase.storage.from('documentos').getPublicUrl(`firmas/${fileName}`);
            firmaUrl = data.publicUrl;
          }
        }
      }

      // Create Loans
      const loansToInsert = newLoan.bienes_seleccionados.map(bien => ({
        bien_id: bien.id,
        prestatario_dni: newLoan.prestatario_dni,
        prestatario_nombre: newLoan.prestatario_nombre,
        prestatario_correo: newLoan.prestatario_correo || null,
        prestatario_celular: newLoan.prestatario_celular || null,
        fecha_limite: newLoan.fecha_limite,
        estado_prestamo: 'Activo',
        firma_url: firmaUrl,
        usuario_entrega: user.name
      }));

      const { error: loanError } = await supabase.from('prestamos').insert(loansToInsert);
      if (loanError) throw loanError;

      // Actualizar o insertar en el directorio
      const { data: existingPerson } = await supabase.from('personal_directorio').select('*').eq('dni', newLoan.prestatario_dni).maybeSingle();
      if (existingPerson) {
         if ((newLoan.prestatario_correo && !existingPerson.correo) || (newLoan.prestatario_celular && !existingPerson.telefono)) {
             await supabase.from('personal_directorio').update({
                 correo: newLoan.prestatario_correo || existingPerson.correo,
                 telefono: newLoan.prestatario_celular || existingPerson.telefono
             }).eq('dni', newLoan.prestatario_dni);
         }
      } else {
         await supabase.from('personal_directorio').insert([{
             dni: newLoan.prestatario_dni,
             nombre: newLoan.prestatario_nombre,
             correo: newLoan.prestatario_correo || null,
             telefono: newLoan.prestatario_celular || null
         }]);
      }

      // Update Inventory Status
      const { error: invError } = await supabase.from('inventario_bienes')
          .update({ estado_actual: 'Prestado' })
          .in('id', newLoan.bienes_seleccionados.map(b => b.id));
      if (invError) throw invError;

      if (newLoan.prestatario_correo) {
          notify('Préstamos registrados. El correo de confirmación será enviado automáticamente por el sistema.', 'success');
      } else {
          notify('Préstamos registrados correctamente');
      }
      setIsLoanModalOpen(false);
      setNewLoan({ bienes_seleccionados: [], prestatario_dni: '', prestatario_nombre: '', prestatario_correo: '', prestatario_celular: '', fecha_limite: '' });
      setSearchBienTerm('');
      clearSignature();
      fetchLoans();
    } catch (error: any) {
      notify(`Error: ${error.message}`, 'error');
    }
  };

  const handleReceive = async (loan: LoanRecord) => {
    // Confirmación nativa sin window.confirm para entornos iframe
    // Aquí podemos omitir el window.confirm y hacer la acción directa
    // ya que en iframes puede bloquearse
    try {
      const { error: err1 } = await supabase.from('prestamos').update({
        estado_prestamo: 'Devuelto',
        fecha_recepcion: new Date().toISOString(),
        usuario_recepcion: user.name
      }).eq('id', loan.id);
      if (err1) throw err1;

      const { error: err2 } = await supabase.from('inventario_bienes').update({ estado_actual: 'Disponible' }).eq('id', loan.bien_id);
      if (err2) throw err2;

      if (loan.prestatario_correo) {
          notify('Bien recepcionado. El correo de agradecimiento será enviado automáticamente por el sistema.', 'success');
      } else {
          notify('Bien recepcionado correctamente', 'success');
      }
      fetchLoans();
    } catch (error: any) {
      notify(`Error: ${error.message}`, 'error');
    }
  };

  const handleSendEmail = async (items: LoanRecord[]) => {
    const first = items[0];
    if (!first.prestatario_correo) {
      notify('El prestatario no tiene un correo registrado', 'warning');
      return;
    }
    
    setSendingEmailId(first.id);
    try {
      const bienesList = items.map(i => `- ${i.inventario_bienes?.nombre_bien || 'Bien sin nombre'} (Cod: ${i.inventario_bienes?.codigo_barras || i.bien_id})`).join('\n');
      const safeFechaLimite = (first.fecha_limite.includes('T') ? first.fecha_limite.split('T')[0] : first.fecha_limite) + 'T12:00:00';

      const payload = {
        to: first.prestatario_correo,
        subject: 'Recordatorio de Devolución de Bienes - UNSAAC',
        text: `Hola ${first.prestatario_nombre},\n\nTe escribimos de la Oficina de Admisión UNSAAC para recordarte la devolución de los bienes prestados:\n\n${bienesList}\n\nFecha Límite: ${new Date(safeFechaLimite).toLocaleDateString()}\n\nPor favor, acércate a la oficina a la brevedad posible para regularizar el estado de tu préstamo y devolver los bienes.\n\nSaludos cordiales,\nSistema de Admisión UNSAAC`
      };

      const response = await fetch('/api/send-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Falló la conexión con el endpoint de correo.');
      }

      notify('Correo enviado exitosamente de forma directa', 'success');
    } catch (err: any) {
      notify('No se pudo enviar el correo: ' + err.message, 'error');
    } finally {
      setSendingEmailId(null);
    }
  };

  const filteredLoans = loans.filter(loan => {
    const matchesFilter = loanFilter === 'Todos' || loan.estado_prestamo === loanFilter;
    const matchesSearch = 
      loan.prestatario_nombre.toLowerCase().includes(searchQuery.toLowerCase()) ||
      loan.prestatario_dni.includes(searchQuery) ||
      loan.inventario_bienes?.nombre_bien.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  const filteredInventory = inventory.filter(item => {
    const matchesFilter = inventoryFilter === 'Todos' || item.estado_actual === inventoryFilter;
    const matchesSearch = 
      item.nombre_bien.toLowerCase().includes(searchInventoryQuery.toLowerCase()) ||
      item.codigo_barras.toLowerCase().includes(searchInventoryQuery.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  const handleExportExcel = () => {
    if (filteredInventory.length === 0) {
      notify('No hay bienes para exportar', 'warning');
      return;
    }
    const wsData = filteredInventory.map(item => ({
      'Código de Barras': item.codigo_barras,
      'Nombre del Bien': item.nombre_bien,
      'Descripción / Estado': item.descripcion_estado || '-',
      'Estado Actual': item.estado_actual
    }));
    const ws = XLSX.utils.json_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Inventario");
    XLSX.writeFile(wb, "Inventario_Bienes.xlsx");
  };

  const handlePrintBarcodes = useReactToPrint({
    contentRef: printComponentRef,
    documentTitle: 'Codigos_de_Barras_Inventario',
  });

  return (
    <div className="w-full max-w-[1500px] mx-auto flex flex-col gap-6 p-4 md:p-8 h-full overflow-hidden">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shrink-0">
        <div>
          <h1 className="text-2xl md:text-3xl font-black text-slate-900 uppercase tracking-tighter">Préstamo de Bienes</h1>
          <p className="text-slate-500 text-xs md:text-sm font-medium mt-1">Control de inventario y préstamos de oficina</p>
        </div>
        
        <div className="flex bg-slate-100 p-1 rounded-xl">
          <button 
            onClick={() => setActiveTab('prestamos')}
            className={`px-6 py-2.5 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${activeTab === 'prestamos' ? 'bg-white text-primary shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            Préstamos
          </button>
          <button 
            onClick={() => setActiveTab('inventario')}
            className={`px-6 py-2.5 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${activeTab === 'inventario' ? 'bg-white text-primary shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            Inventario
          </button>
        </div>
      </div>

      {activeTab === 'prestamos' ? (
        <div className="flex-1 flex flex-col gap-4 overflow-hidden">
          <div className="flex flex-col md:flex-row gap-4 justify-between shrink-0">
            <div className="flex gap-2 bg-slate-100 p-1 rounded-xl overflow-x-auto">
              {['Todos', 'Activo', 'Vencido', 'Devuelto'].map(f => (
                <button 
                  key={f}
                  onClick={() => setLoanFilter(f as any)}
                  className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest whitespace-nowrap transition-all ${loanFilter === f ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  {f}
                </button>
              ))}
            </div>
            
            <div className="flex gap-3">
              <div className="relative">
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">search</span>
                <input 
                  type="text" 
                  placeholder="Buscar persona o bien..." 
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="h-10 pl-10 pr-4 rounded-xl border border-slate-200 text-sm focus:border-primary outline-none w-full md:w-64"
                />
              </div>
              <button 
                onClick={() => setIsLoanModalOpen(true)}
                className="h-10 px-6 bg-primary text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-lg shadow-primary/20 hover:scale-105 transition-all flex items-center gap-2 whitespace-nowrap"
              >
                <span className="material-symbols-outlined text-sm">add</span>
                Nuevo Préstamo
              </button>
            </div>
          </div>

          <div className="flex-1 bg-white border border-slate-200 rounded-3xl shadow-sm overflow-hidden flex flex-col p-6">
            <div className="overflow-y-auto flex-1 pr-2 space-y-6">
              {loadingLoans ? (
                <div className="flex flex-col items-center justify-center p-12 text-slate-400">
                  <span className="material-symbols-outlined text-4xl mb-3 animate-spin">refresh</span>
                  <p className="font-bold text-sm">Cargando préstamos...</p>
                </div>
              ) : filteredLoans.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-12 text-slate-400">
                  <span className="material-symbols-outlined text-4xl mb-3">inbox</span>
                  <p className="font-bold text-sm">No hay préstamos registrados.</p>
                </div>
              ) : (
                (Object.entries(
                  filteredLoans.reduce((acc, loan) => {
                    const gKey = `${loan.prestatario_dni}_${loan.fecha_salida.substring(0, 16)}`;
                    if (!acc[gKey]) acc[gKey] = [];
                    acc[gKey].push(loan);
                    return acc;
                  }, {} as Record<string, LoanRecord[]>)
                ) as [string, LoanRecord[]][]).map(([key, items]) => {
                  const first = items[0];
                  const hasVencido = items.some(i => i.estado_prestamo === 'Vencido');
                  const hasActivo = items.some(i => i.estado_prestamo === 'Activo');
                  const groupStatus = hasVencido ? 'Vencido' : hasActivo ? 'Activo' : 'Devuelto';

                  return (
                    <div key={key} className="border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                      {/* Cabecera del Grupo */}
                      <div className="bg-slate-50/50 p-5 border-b border-slate-200 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                        <div>
                          <h4 className="font-black text-slate-900 text-base">{first.prestatario_nombre}</h4>
                          <p className="text-xs text-slate-500 font-bold tracking-wide mt-1">
                            {first.prestatario_dni} {first.prestatario_celular ? `• ${first.prestatario_celular}` : ''}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-6">
                          <div className="text-right">
                            <p className="text-xs text-slate-600"><span className="font-bold">Salida:</span> {new Date(first.fecha_salida).toLocaleDateString()}</p>
                            <p className="text-xs text-slate-600"><span className="font-bold text-red-500">Límite:</span> {new Date((first.fecha_limite.includes('T') ? first.fecha_limite.split('T')[0] : first.fecha_limite) + 'T12:00:00').toLocaleDateString()}</p>
                          </div>
                          
                          <div className="flex items-center gap-2">
                            <span className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest ${
                              groupStatus === 'Activo' ? 'bg-emerald-100 text-emerald-700' :
                              groupStatus === 'Vencido' ? 'bg-red-100 text-red-700 animate-pulse' :
                              'bg-slate-100 text-slate-600'
                            }`}>
                              {groupStatus}
                            </span>
                          </div>

                          <div className="flex items-center gap-2 border-l border-slate-200 pl-4">
                            {first.prestatario_celular && (
                              <a 
                                href={`https://wa.me/51${first.prestatario_celular}?text=Hola ${first.prestatario_nombre}, te escribimos de la oficina para recordarte la devolución de los bienes prestados el ${new Date(first.fecha_salida).toLocaleDateString()}.`}
                                target="_blank" rel="noopener noreferrer"
                                className="size-9 rounded-xl bg-green-50 text-green-600 hover:bg-green-100 flex items-center justify-center transition-colors"
                                title="Enviar mensaje por WhatsApp"
                              >
                                <span className="material-symbols-outlined text-sm">chat</span>
                              </a>
                            )}
                            {first.prestatario_correo && (
                              <button 
                                onClick={() => handleSendEmail(items)}
                                disabled={sendingEmailId === first.id}
                                className={`size-9 rounded-xl flex items-center justify-center transition-colors ${sendingEmailId === first.id ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-blue-50 text-blue-600 hover:bg-blue-100'}`}
                                title="Recordatorio por Correo"
                              >
                                {sendingEmailId === first.id ? (
                                  <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span>
                                ) : (
                                  <span className="material-symbols-outlined text-sm">mail</span>
                                )}
                              </button>
                            )}
                            {first.firma_url && (
                              <a href={first.firma_url} target="_blank" rel="noopener noreferrer" className="size-9 rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200 flex items-center justify-center transition-colors" title="Ver Firma">
                                <span className="material-symbols-outlined text-sm">draw</span>
                              </a>
                            )}
                            <button 
                              onClick={() => {
                                setLoanToPrint(items);
                                setIsPrintModalOpen(true);
                              }}
                              className="size-9 rounded-xl bg-violet-50 text-violet-600 hover:bg-violet-100 flex items-center justify-center transition-colors"
                              title="Emitir Constancia de Préstamo (PDF)"
                            >
                              <span className="material-symbols-outlined text-sm">picture_as_pdf</span>
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Lista de Bienes */}
                      <div className="bg-white divide-y divide-slate-100">
                        {items.map(loan => (
                          <div key={loan.id} className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
                            <div className="flex items-center gap-4">
                              <div className={`w-1.5 h-8 rounded-full ${loan.estado_prestamo === 'Devuelto' ? 'bg-slate-200' : 'bg-primary'}`}></div>
                              <div>
                                <p className={`font-bold text-sm ${loan.estado_prestamo === 'Devuelto' ? 'text-slate-400 line-through' : 'text-slate-900'}`}>{loan.inventario_bienes?.nombre_bien}</p>
                                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{loan.inventario_bienes?.codigo_barras}</p>
                              </div>
                            </div>
                            
                            <div className="flex items-center gap-4">
                              {loan.estado_prestamo === 'Devuelto' ? (
                                <div className="flex items-center gap-2">
                                  <span className="material-symbols-outlined text-emerald-500 text-lg">check_circle</span>
                                  <span className="text-xs font-bold text-slate-500">Devuelto el {new Date(loan.fecha_recepcion || '').toLocaleDateString()}</span>
                                </div>
                              ) : (
                                <button 
                                  onClick={() => handleReceive(loan)}
                                  className="px-4 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg text-xs font-black uppercase tracking-widest transition-colors flex items-center gap-2"
                                  title="Registrar Recepción de este Bien"
                                >
                                  <span className="material-symbols-outlined text-[16px]">inventory_2</span>
                                  Recepcionar
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col gap-4 overflow-hidden">
          <div className="flex flex-col md:flex-row gap-4 justify-between shrink-0">
            <div className="flex gap-2 bg-slate-100 p-1 rounded-xl overflow-x-auto">
              {['Todos', 'Disponible', 'Prestado', 'En Mantenimiento'].map(f => (
                <button 
                  key={f}
                  onClick={() => setInventoryFilter(f as any)}
                  className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest whitespace-nowrap transition-all ${inventoryFilter === f ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  {f}
                </button>
              ))}
            </div>
            
            <div className="flex gap-3 overflow-x-auto">
              <div className="relative min-w-[200px]">
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">search</span>
                <input 
                  type="text" 
                  placeholder="Buscar bien..." 
                  value={searchInventoryQuery}
                  onChange={e => setSearchInventoryQuery(e.target.value)}
                  className="h-10 pl-10 pr-4 rounded-xl border border-slate-200 text-sm focus:border-primary outline-none w-full md:w-64"
                />
              </div>
              
              <button 
                onClick={() => handlePrintBarcodes()}
                disabled={filteredInventory.length === 0}
                className="h-10 px-4 bg-white border border-slate-200 text-slate-700 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-slate-50 transition-all flex items-center gap-2 whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
                title="Generar PDF con Código de Barras"
              >
                <span className="material-symbols-outlined text-sm">print</span>
              </button>

              <button 
                onClick={handleExportExcel}
                disabled={filteredInventory.length === 0}
                className="h-10 px-4 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-emerald-100 transition-all flex items-center gap-2 whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
                title="Exportar Filtrados a Excel"
              >
                <span className="material-symbols-outlined text-sm">table_view</span>
              </button>

              <button 
                onClick={() => setIsInventoryModalOpen(true)}
                className="h-10 px-6 bg-slate-900 text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-lg hover:scale-105 transition-all flex items-center gap-2 whitespace-nowrap"
              >
                <span className="material-symbols-outlined text-sm">add</span>
                Registrar Bien
              </button>
            </div>
          </div>

          <div className="flex-1 bg-white border border-slate-200 rounded-3xl shadow-sm overflow-hidden flex flex-col">
            <div className="overflow-x-auto flex-1">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Código de Barras</th>
                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Nombre del Bien</th>
                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Descripción / Estado</th>
                    <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Estado Actual</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loadingInventory ? (
                    <tr><td colSpan={4} className="p-8 text-center text-slate-400">Cargando inventario...</td></tr>
                  ) : filteredInventory.length === 0 ? (
                    <tr><td colSpan={4} className="p-8 text-center text-slate-400">No hay bienes que coincidan.</td></tr>
                  ) : filteredInventory.map(item => (
                    <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4 font-mono text-xs font-bold text-slate-600">{item.codigo_barras}</td>
                      <td className="px-6 py-4 font-bold text-slate-900 text-sm">{item.nombre_bien}</td>
                      <td className="px-6 py-4 text-xs text-slate-500">{item.descripcion_estado || '-'}</td>
                      <td className="px-6 py-4">
                        <span className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest ${
                          item.estado_actual === 'Disponible' ? 'bg-emerald-100 text-emerald-700' :
                          item.estado_actual === 'Prestado' ? 'bg-amber-100 text-amber-700' :
                          'bg-red-100 text-red-700'
                        }`}>
                          {item.estado_actual}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* MODAL NUEVO BIEN */}
      {isInventoryModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-8 animate-in zoom-in-95">
            <h3 className="font-black text-slate-900 uppercase tracking-tight text-xl mb-6">Registrar Nuevo Bien</h3>
            <div className="flex flex-col gap-4">
              <label className="flex flex-col gap-1">
                <span className="text-[10px] font-black text-slate-500 uppercase">Código de Barras *</span>
                <input value={newItem.codigo_barras} onChange={e => setNewItem({...newItem, codigo_barras: e.target.value})} className="h-12 px-4 rounded-xl border-2 border-slate-100 bg-slate-50 font-bold outline-none focus:border-primary" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[10px] font-black text-slate-500 uppercase">Nombre del Bien *</span>
                <input value={newItem.nombre_bien} onChange={e => setNewItem({...newItem, nombre_bien: e.target.value})} className="h-12 px-4 rounded-xl border-2 border-slate-100 bg-slate-50 font-bold outline-none focus:border-primary" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[10px] font-black text-slate-500 uppercase">Descripción / Observaciones</span>
                <textarea value={newItem.descripcion_estado} onChange={e => setNewItem({...newItem, descripcion_estado: e.target.value})} className="h-24 p-4 rounded-xl border-2 border-slate-100 bg-slate-50 text-sm outline-none focus:border-primary resize-none" />
              </label>
            </div>
            <div className="flex gap-4 mt-8">
              <button onClick={() => setIsInventoryModalOpen(false)} className="flex-1 font-black text-slate-400 uppercase tracking-widest text-[10px] hover:text-slate-600">Cancelar</button>
              <button onClick={handleCreateInventoryItem} className="flex-[2] h-12 bg-slate-900 text-white rounded-xl font-black uppercase tracking-widest text-[10px] shadow-xl hover:bg-slate-800">Guardar Bien</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL NUEVO PRÉSTAMO */}
      {isLoanModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl p-8 animate-in zoom-in-95 max-h-[90vh] overflow-y-auto">
            <h3 className="font-black text-slate-900 uppercase tracking-tight text-xl mb-6">Registrar Préstamo</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="flex flex-col gap-4">
                <h4 className="text-xs font-black text-primary uppercase tracking-widest border-b pb-2">1. Seleccionar Bienes</h4>
                <div className="flex flex-col gap-1 relative" ref={dropdownRef}>
                  <span className="text-[10px] font-black text-slate-500 uppercase">Buscar Bien (puede seleccionar varios) *</span>
                  <input 
                    type="text"
                    value={searchBienTerm}
                    onChange={e => {
                      setSearchBienTerm(e.target.value);
                      setShowBienDropdown(true);
                    }}
                    onFocus={() => setShowBienDropdown(true)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        const matches = inventory.filter(i => 
                          i.estado_actual === 'Disponible' && 
                          !loans.some(l => l.bien_id === i.id && l.estado_prestamo !== 'Devuelto') &&
                          !newLoan.bienes_seleccionados.find(b => b.id === i.id) &&
                          (i.nombre_bien.toLowerCase().includes(searchBienTerm.toLowerCase()) || i.codigo_barras.includes(searchBienTerm))
                        );
                        if (matches.length === 1) {
                          setNewLoan({...newLoan, bienes_seleccionados: [...newLoan.bienes_seleccionados, matches[0]]});
                          setSearchBienTerm('');
                          setShowBienDropdown(false);
                        }
                      }
                    }}
                    placeholder="Escanear código o buscar nombre..."
                    className="h-12 px-4 rounded-xl border-2 border-slate-100 bg-slate-50 font-bold outline-none focus:border-primary"
                  />
                  {showBienDropdown && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 shadow-xl max-h-52 overflow-y-auto rounded-xl z-50 animate-in fade-in">
                      {inventory.filter(i => 
                        i.estado_actual === 'Disponible' && 
                        !loans.some(l => l.bien_id === i.id && l.estado_prestamo !== 'Devuelto') &&
                        !newLoan.bienes_seleccionados.find(b => b.id === i.id) &&
                        (i.nombre_bien.toLowerCase().includes(searchBienTerm.toLowerCase()) || i.codigo_barras.includes(searchBienTerm))
                      ).length === 0 ? (
                         <div className="p-4 text-xs text-slate-500 text-center font-bold">No hay bienes listos con ese código o nombre.</div>
                      ) : (
                        inventory
                          .filter(i => 
                            i.estado_actual === 'Disponible' && 
                            !loans.some(l => l.bien_id === i.id && l.estado_prestamo !== 'Devuelto') &&
                            !newLoan.bienes_seleccionados.find(b => b.id === i.id) &&
                            (i.nombre_bien.toLowerCase().includes(searchBienTerm.toLowerCase()) || i.codigo_barras.includes(searchBienTerm))
                          )
                          .map(item => (
                          <div 
                            key={item.id}
                            onClick={() => {
                              setNewLoan({...newLoan, bienes_seleccionados: [...newLoan.bienes_seleccionados, item]});
                              setSearchBienTerm('');
                              setShowBienDropdown(false);
                            }}
                            className="p-3 hover:bg-slate-50 cursor-pointer border-b border-slate-100 last:border-0"
                          >
                            <p className="text-sm font-bold text-slate-900">{item.nombre_bien}</p>
                            <p className="text-[10px] font-mono text-primary bg-primary/10 inline-block px-1 rounded mt-0.5">{item.codigo_barras}</p>
                          </div>
                          ))
                      )}
                    </div>
                  )}
                </div>

                {newLoan.bienes_seleccionados.length > 0 && (
                  <div className="flex flex-col gap-2">
                     <span className="text-[10px] font-black text-slate-500 uppercase">Bienes Seleccionados ({newLoan.bienes_seleccionados.length})</span>
                     <div className="flex flex-col gap-2 max-h-32 overflow-y-auto pr-1">
                        {newLoan.bienes_seleccionados.map((item, idx) => (
                           <div key={idx} className="flex justify-between items-center bg-slate-50 p-2 rounded-xl border border-slate-100">
                              <div>
                                <p className="text-xs font-bold text-slate-900 leading-tight">{item.nombre_bien}</p>
                                <p className="text-[9px] font-mono text-slate-500 uppercase tracking-widest leading-none mt-0.5">{item.codigo_barras}</p>
                              </div>
                              <button 
                                onClick={() => {
                                  const newList = newLoan.bienes_seleccionados.filter(b => b.id !== item.id);
                                  setNewLoan({...newLoan, bienes_seleccionados: newList});
                                }}
                                className="size-6 bg-red-50 text-red-600 rounded-lg flex items-center justify-center hover:bg-red-100 shrink-0"
                              >
                                <span className="material-symbols-outlined text-[14px]">close</span>
                              </button>
                           </div>
                        ))}
                     </div>
                  </div>
                )}

                <label className="flex flex-col gap-1 mt-auto pt-2">
                  <span className="text-[10px] font-black text-slate-500 uppercase">Fecha Límite de Devolución *</span>
                  <input type="date" value={newLoan.fecha_limite} onChange={e => setNewLoan({...newLoan, fecha_limite: e.target.value})} className="h-12 px-4 rounded-xl border-2 border-slate-100 bg-slate-50 font-bold outline-none focus:border-primary" />
                </label>
              </div>

              <div className="flex flex-col gap-4">
                <h4 className="text-xs font-black text-primary uppercase tracking-widest border-b pb-2">2. Datos del Prestatario</h4>
                <div className="grid grid-cols-2 gap-4">
                  <label className="flex flex-col gap-1">
                    <span className="text-[10px] font-black text-slate-500 uppercase">DNI *</span>
                    <input value={newLoan.prestatario_dni} onChange={e => setNewLoan({...newLoan, prestatario_dni: e.target.value})} className="h-12 px-4 rounded-xl border-2 border-slate-100 bg-slate-50 font-bold outline-none focus:border-primary" />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-[10px] font-black text-slate-500 uppercase">Celular</span>
                    <input value={newLoan.prestatario_celular} onChange={e => setNewLoan({...newLoan, prestatario_celular: e.target.value})} className="h-12 px-4 rounded-xl border-2 border-slate-100 bg-slate-50 font-bold outline-none focus:border-primary" />
                  </label>
                </div>
                <label className="flex flex-col gap-1 relative">
                  <span className="text-[10px] font-black text-slate-500 uppercase">Nombre Completo *</span>
                  <input 
                    value={newLoan.prestatario_nombre} 
                    onChange={e => {
                        setSelectedPersonFromDropdown(false);
                        setNewLoan({...newLoan, prestatario_nombre: e.target.value});
                        setShowPersonDropdown(true);
                    }} 
                    onFocus={() => setShowPersonDropdown(true)}
                    onBlur={() => setTimeout(() => setShowPersonDropdown(false), 200)}
                    className="h-12 px-4 rounded-xl border-2 border-slate-100 bg-slate-50 font-bold outline-none focus:border-primary" 
                  />
                  {showPersonDropdown && personSearchResults.length > 0 && (
                      <div className="absolute top-14 left-0 w-full z-[100] bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden">
                          {personSearchResults.map(p => (
                              <div key={p.id} 
                                   className="px-4 py-3 hover:bg-slate-50 cursor-pointer border-b border-slate-100 last:border-0"
                                   onMouseDown={() => {
                                       setNewLoan({...newLoan, prestatario_nombre: p.nombre, prestatario_dni: p.dni, prestatario_correo: p.correo || '', prestatario_celular: p.telefono || ''});
                                       setSelectedPersonFromDropdown(true);
                                       setShowPersonDropdown(false);
                                   }}
                              >
                                  <div className="font-bold text-slate-900 text-sm">{p.nombre}</div>
                                  <div className="text-[10px] text-slate-500 font-bold">DNI: {p.dni}</div>
                              </div>
                          ))}
                      </div>
                  )}
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[10px] font-black text-slate-500 uppercase">Correo Electrónico</span>
                  <input type="email" value={newLoan.prestatario_correo} onChange={e => setNewLoan({...newLoan, prestatario_correo: e.target.value})} className="h-12 px-4 rounded-xl border-2 border-slate-100 bg-slate-50 font-bold outline-none focus:border-primary" />
                </label>
              </div>
            </div>

            <div className="mt-6 flex flex-col gap-2">
              <div className="flex justify-between items-center">
                <h4 className="text-xs font-black text-primary uppercase tracking-widest">3. Firma Digital (Opcional)</h4>
                {hasSignature && <button onClick={clearSignature} className="text-[10px] font-bold text-red-500 hover:text-red-600">Limpiar Firma</button>}
              </div>
              <div className="border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50 overflow-hidden relative h-32">
                <canvas 
                  ref={canvasRef}
                  width={600}
                  height={128}
                  onMouseDown={startDrawing}
                  onMouseMove={draw}
                  onMouseUp={stopDrawing}
                  onMouseLeave={stopDrawing}
                  onTouchStart={startDrawing}
                  onTouchMove={draw}
                  onTouchEnd={stopDrawing}
                  className="w-full h-full cursor-crosshair touch-none"
                />
                {!hasSignature && <div className="absolute inset-0 pointer-events-none flex items-center justify-center text-slate-300 text-sm font-bold">Firme aquí</div>}
              </div>
            </div>

            <div className="flex gap-4 mt-8">
              <button onClick={() => { setIsLoanModalOpen(false); clearSignature(); setSearchBienTerm(''); }} className="flex-1 font-black text-slate-400 uppercase tracking-widest text-[10px] hover:text-slate-600">Cancelar</button>
              <button onClick={handleCreateLoan} className="flex-[2] h-14 bg-primary text-white rounded-xl font-black uppercase tracking-widest text-xs shadow-xl shadow-primary/30 hover:scale-[1.02] transition-all">Registrar Préstamo</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE CONSTATACIÓN Y VISTA DE IMPRESIÓN */}
      {isPrintModalOpen && loanToPrint && loanToPrint.length > 0 && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-slate-100 rounded-3xl shadow-2xl w-full max-w-4xl p-6 md:p-8 animate-in zoom-in-95 max-h-[95vh] flex flex-col overflow-hidden text-left">
            
            {/* Header del modal */}
            <div className="flex justify-between items-center pb-4 border-b border-slate-200 shrink-0">
              <div>
                <h3 className="font-black text-slate-900 uppercase tracking-tight text-lg flex items-center gap-2">
                  <span className="material-symbols-outlined text-violet-600">picture_as_pdf</span>
                  Emitir Constancia de Préstamo
                </h3>
                <p className="text-slate-500 text-xs">Revise el borrador antes de mandar a imprimir el documento físico</p>
              </div>
              <button 
                onClick={() => setIsPrintModalOpen(false)}
                className="size-8 bg-slate-200 text-slate-600 rounded-full flex items-center justify-center hover:bg-slate-300 transition-all shrink-0"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            {/* Contenido principal: Controles a la izquierda, Borrador de papel a la derecha */}
            <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 my-6 overflow-y-auto pr-2">
              
              {/* Columna Controles (4 cols) */}
              <div className="lg:col-span-4 flex flex-col gap-4 shrink-0 bg-white p-5 rounded-2xl border border-slate-200/60 shadow-sm self-start">
                <span className="text-[10px] font-black text-primary uppercase tracking-widest block border-b pb-2">DATOS DE LA POST-FIRMA</span>
                
                <label className="flex flex-col gap-1.5">
                  <span className="text-[10px] font-black text-slate-500 uppercase">Nombre del Operador *</span>
                  <input 
                    type="text" 
                    value={operatorName} 
                    onChange={e => setOperatorName(e.target.value)}
                    placeholder="Nombre completo"
                    className="h-10 px-3 rounded-lg border border-slate-200 bg-slate-50 font-bold text-xs focus:bg-white focus:border-primary outline-none transition-all"
                  />
                </label>

                <label className="flex flex-col gap-1.5">
                  <span className="text-[10px] font-black text-slate-500 uppercase">DNI del Operador *</span>
                  <input 
                    type="text" 
                    value={operatorDni} 
                    onChange={e => setOperatorDni(e.target.value)}
                    placeholder="Número de DNI"
                    maxLength={8}
                    className="h-10 px-3 rounded-lg border border-slate-200 bg-slate-50 font-bold text-xs focus:bg-white focus:border-primary outline-none transition-all"
                  />
                  <p className="text-[9px] text-slate-400">Este DNI se carga del perfil de usuario automáticamente.</p>
                </label>

                <div className="pt-2 border-t border-slate-100 flex flex-col gap-2 mt-2">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Prestatario</span>
                  <p className="text-xs font-black text-slate-800 leading-tight">{loanToPrint[0].prestatario_nombre}</p>
                  <p className="text-[10px] text-slate-500 font-bold">DNI: {loanToPrint[0].prestatario_dni}</p>
                  {loanToPrint[0].prestatario_celular && <p className="text-[10px] text-slate-500 font-bold">Cel: {loanToPrint[0].prestatario_celular}</p>}
                </div>

                {/* Ajuste fino de la Firma militar/centrado */}
                <div className="pt-3 border-t border-slate-100 flex flex-col gap-2.5 mt-1">
                  <button
                    type="button"
                    onClick={() => setShowAdvancedSigPos(!showAdvancedSigPos)}
                    className="flex justify-between items-center w-full py-1.5 px-2 bg-slate-50 hover:bg-slate-100 rounded-lg text-slate-750 border border-slate-200 transition-all text-left group"
                  >
                    <span className="text-[11px] font-black uppercase tracking-wider flex items-center gap-1.5 text-slate-700 group-hover:text-primary">
                      <span className="material-symbols-outlined text-[16px] text-slate-500 group-hover:text-primary transition-all">settings</span>
                      Calibración Avanzada de Firma
                    </span>
                    <span className="material-symbols-outlined text-[16px] text-slate-400">
                      {showAdvancedSigPos ? 'expand_less' : 'expand_more'}
                    </span>
                  </button>
                  
                  {showAdvancedSigPos && (
                    <div className="flex flex-col gap-3 bg-slate-50/80 p-3 rounded-xl border border-slate-200/80 transition-all animate-fadeIn">
                      <label className="flex flex-col gap-1">
                        <div className="flex justify-between text-[9px] font-extrabold text-slate-500 uppercase">
                          <span>Tamaño (Escala)</span>
                          <span className="text-primary font-mono font-bold">{(sigScale * 100).toFixed(0)}%</span>
                        </div>
                        <input 
                          type="range" 
                          min="0.3" 
                          max="2.0" 
                          step="0.05" 
                          value={sigScale} 
                          onChange={e => setSigScale(parseFloat(e.target.value))} 
                          className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-primary"
                        />
                      </label>

                      <label className="flex flex-col gap-1">
                        <div className="flex justify-between text-[9px] font-extrabold text-slate-500 uppercase">
                          <span>Desplazamiento horizontal (X)</span>
                          <span className="text-primary font-mono font-bold">{sigOffsetX}px</span>
                        </div>
                        <input 
                          type="range" 
                          min="-150" 
                          max="150" 
                          step="2" 
                          value={sigOffsetX} 
                          onChange={e => setSigOffsetX(parseInt(e.target.value))} 
                          className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-primary"
                        />
                      </label>

                      <label className="flex flex-col gap-1">
                        <div className="flex justify-between text-[9px] font-extrabold text-slate-500 uppercase">
                          <span>Desplazamiento vertical (Y)</span>
                          <span className="text-primary font-mono font-bold">{sigOffsetY}px</span>
                        </div>
                        <input 
                          type="range" 
                          min="-150" 
                          max="150" 
                          step="2" 
                          value={sigOffsetY} 
                          onChange={e => setSigOffsetY(parseInt(e.target.value))} 
                          className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-primary"
                        />
                      </label>

                      <div className="flex gap-2 justify-end mt-1">
                        <button 
                          type="button"
                          onClick={() => {
                            setSigScale(1.0);
                            setSigOffsetX(0);
                            setSigOffsetY(0);
                          }}
                          className="text-[9px] font-black text-slate-650 bg-slate-200 hover:bg-slate-250 py-1.5 px-3 rounded-lg transition-all uppercase tracking-wider"
                        >
                          Restaurar Valores
                        </button>
                      </div>

                      <div className="flex items-center gap-1.5 p-2 bg-blue-50 border border-blue-100 rounded-lg text-[9px] text-blue-700 leading-normal">
                        <span className="material-symbols-outlined text-[13px] shrink-0">touch_app</span>
                        <span>¡Puedes arrastrar la firma directamente sobre la hoja para ubicarla libremente!</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Columna Hoja de Papel (8 cols) - Se asemeja al PDF físico que saldrá */}
              <div className="lg:col-span-8 flex flex-col gap-2">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Previsualización del Documento</span>
                
                <div className="bg-white border border-slate-305 rounded-2xl shadow-inner p-8 font-sans text-slate-850 overflow-x-auto max-w-full">
                  {/* Contenedor emulado de hoja papel */}
                  <div className="min-w-[550px] mx-auto text-slate-900 leading-relaxed text-xs">
                    
                    {/* Encabezado UNSAAC con Logos */}
                    <div className="flex items-center justify-between pb-4 border-b-2 border-double border-slate-300 mb-6 gap-4">
                      <img 
                        src="https://cnqpzyanmmwspvemcfeb.supabase.co/storage/v1/object/public/logos/escudo%20oficial-02%20(2).png" 
                        alt="Escudo UNSAAC" 
                        className="h-14 w-auto object-contain shrink-0"
                      />
                      <div className="flex-1 text-center">
                        <h4 className="font-black text-[11px] md:text-[12px] tracking-tight text-slate-900 leading-tight">UNIVERSIDAD NACIONAL DE SAN ANTONIO ABAD DEL CUSCO</h4>
                        <h5 className="font-bold text-[9px] md:text-[10px] text-slate-700 mt-1">OFICINA DE ADMISIÓN</h5>
                        <h5 className="font-bold text-[8px] md:text-[9px] text-slate-500 mt-0.5">DIRECCIÓN DE ADMISIÓN</h5>
                      </div>
                      <img 
                        src="https://cnqpzyanmmwspvemcfeb.supabase.co/storage/v1/object/public/logos/logo_admision_cuadrado.png" 
                        alt="Logo Admisión" 
                        className="h-14 w-auto object-contain shrink-0"
                      />
                    </div>

                    {/* Título de Constancia */}
                    <div className="text-center mb-6">
                      <h3 className="font-black text-sm uppercase tracking-wider text-slate-900">CONSTANCIA DE PRÉSTAMO DE BIENES</h3>
                      <p className="font-mono text-[8px] text-slate-500 mt-1 uppercase">COD: REF-{loanToPrint[0].prestatario_dni}-{loanToPrint[0].fecha_salida.substring(0,10).replace(/[^0-9]/g, '')}</p>
                    </div>

                    {/* Texto Introductorio formal */}
                    <div className="mb-6 text-justify leading-relaxed">
                      La Dirección de Admisión de la Universidad Nacional de San Antonio Abad del Cusco (UNSAAC), hace constar por medio del presente documento que se ha entregado en calidad de <strong>PRÉSTAMO TEMPORAL</strong> los siguientes bienes de oficina al solicitante cuyos datos se detallan a continuación:
                    </div>

                    {/* Tabla de Datos de la Persona */}
                    <div className="grid grid-cols-2 gap-x-6 gap-y-2 bg-slate-50 p-4 rounded-xl border border-slate-200 mb-6 font-bold">
                      <div>
                        <span className="text-[8px] font-bold text-slate-500 block uppercase">Nombres y Apellidos:</span>
                        <span className="text-slate-900">{loanToPrint[0].prestatario_nombre}</span>
                      </div>
                      <div>
                        <span className="text-[8px] font-bold text-slate-500 block uppercase">Número de D.N.I.:</span>
                        <span className="text-slate-950">{loanToPrint[0].prestatario_dni}</span>
                      </div>
                      <div>
                        <span className="text-[8px] font-bold text-slate-500 block uppercase">Fecha de Entrega:</span>
                        <span className="text-slate-900 font-medium">{new Date(loanToPrint[0].fecha_salida).toLocaleString('es-PE')}</span>
                      </div>
                      <div>
                        <span className="text-[8px] font-bold text-slate-500 block uppercase">Fecha de Devolución Límite:</span>
                        <span className="text-red-700 font-black">{new Date((loanToPrint[0].fecha_limite.includes('T') ? loanToPrint[0].fecha_limite.split('T')[0] : loanToPrint[0].fecha_limite) + 'T12:00:00').toLocaleDateString('es-PE')}</span>
                      </div>
                    </div>

                    {/* Tabla de descripción de bienes */}
                    <div className="mb-6">
                      <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-2">Detalle de Bienes Prestados:</span>
                      <table className="w-full border-collapse border border-slate-350">
                        <thead>
                          <tr className="bg-slate-100">
                            <th className="border border-slate-300 p-2 text-left font-black text-[9px] w-8">Nº</th>
                            <th className="border border-slate-300 p-2 text-left font-black text-[9px] w-32">Código de Barras</th>
                            <th className="border border-slate-300 p-2 text-left font-black text-[9px]">Descripción del Bien / Nombre</th>
                            <th className="border border-slate-300 p-2 text-left font-black text-[9px] w-32">Estado al Entregar</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200">
                          {loanToPrint.map((loan, idx) => (
                            <tr key={idx}>
                              <td className="border border-slate-300 p-2 font-bold text-center text-slate-600">{idx + 1}</td>
                              <td className="border border-slate-300 p-2 font-mono text-slate-900 font-bold">{loan.inventario_bienes?.codigo_barras || 'S/C'}</td>
                              <td className="border border-slate-300 p-2 font-bold text-slate-950">{loan.inventario_bienes?.nombre_bien}</td>
                              <td className="border border-slate-300 p-2 font-medium text-slate-600 italic">{loan.inventario_bienes?.descripcion_estado || 'Buen estado'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Compromiso cláusula */}
                    <div className="mb-10 text-justify text-[10px] leading-relaxed italic border-l-4 border-slate-300 pl-4 text-slate-600">
                      "El prestatario declara recibir los bienes en mención a entera satisfacción y se compromete formalmente a su devolución en las mismas condiciones, haciéndose responsable civil y administrativamente por cualquier merma, desperfecto o pérdida de la infraestructura entregada."
                    </div>

                    {/* Firmas */}
                    <div className="grid grid-cols-2 gap-10 mt-12 pt-6">
                      {/* Firma Prestatario */}
                      <div className="flex flex-col items-center text-center justify-end">
                        <div className="h-24 w-full flex items-end justify-center mb-1 overflow-visible relative">
                          {loanToPrint[0].firma_url ? (
                            <img 
                              src={loanToPrint[0].firma_url} 
                              alt="Firma del Prestatario" 
                              onMouseDown={showAdvancedSigPos ? handleSigMouseDown : undefined}
                              onTouchStart={showAdvancedSigPos ? handleSigTouchStart : undefined}
                              className="max-h-24 max-w-[200px] object-contain mx-auto transition-all duration-75 origin-bottom"
                              style={{
                                transform: `translate(${sigOffsetX}px, ${sigOffsetY}px) scale(${sigScale})`,
                                mixBlendMode: 'multiply',
                                cursor: showAdvancedSigPos ? (isDraggingSig ? 'grabbing' : 'grab') : 'default',
                                userSelect: 'none',
                              }}
                              title={showAdvancedSigPos ? "¡Arrastra la firma para moverla en el papel!" : undefined}
                            />
                          ) : (
                            <span className="text-[10px] text-slate-300 font-bold italic mb-4">Sin firma registrada</span>
                          )}
                        </div>
                        <div className="w-48 border-t border-slate-400 my-1"></div>
                        <span className="font-black text-slate-900 uppercase text-[10px]">{loanToPrint[0].prestatario_nombre}</span>
                        <span className="text-[9px] text-slate-500 font-bold">PRESTATARIO / SOLICITANTE</span>
                        <span className="text-[9px] text-slate-500 font-bold">D.N.I.: {loanToPrint[0].prestatario_dni}</span>
                      </div>

                      {/* Firma Operador */}
                      <div className="flex flex-col items-center text-center justify-end">
                        <div className="h-24 flex items-end justify-center mb-1 font-bold italic text-slate-300 text-[10px]">
                          {/* Espacio en blanco amplio para la firma física real tras la impresión */}
                        </div>
                        <div className="w-48 border-t border-slate-400 my-1"></div>
                        <span className="font-black text-slate-900 uppercase text-[10px]">{operatorName || 'Administrador'}</span>
                        <span className="text-[9px] text-slate-500 font-bold">ENTREGADO POR (OPERADOR)</span>
                        <span className="text-[9px] text-slate-500 font-bold">D.N.I.: {operatorDni || '--------'}</span>
                      </div>
                    </div>

                  </div>
                </div>
              </div>

            </div>

            {/* Footer de acción del modal */}
            <div className="flex flex-col md:flex-row justify-between items-center gap-4 pt-4 border-t border-slate-200 shrink-0">
              <div className="flex items-center gap-2 text-slate-500 bg-amber-50 border border-amber-200 rounded-xl p-3 text-[11px] leading-normal w-full md:max-w-md text-left">
                <span className="material-symbols-outlined text-[18px] text-amber-600 shrink-0">info</span>
                <span>
                  <strong>Tip de Impresión:</strong> Debido a las restricciones de seguridad para descargar PDFs en previsualización de AI Studio, <strong>abra la app en una Pestaña Nueva</strong> para poder descargar o guardar en PDF sin bloqueos.
                </span>
              </div>
              <div className="flex gap-3 justify-end w-full md:w-auto shrink-0">
                <button 
                  onClick={() => setIsPrintModalOpen(false)}
                  className="px-5 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl text-xs font-black uppercase tracking-wider transition-all"
                >
                  Cerrar
                </button>
                <button 
                  onClick={() => handlePrintConstancia()}
                  className="px-6 py-2.5 bg-primary text-white rounded-xl text-xs font-black uppercase tracking-wider shadow-lg shadow-primary/20 hover:scale-[1.02] flex items-center gap-2 transition-all animate-bounce"
                >
                  <span className="material-symbols-outlined text-sm">print</span>
                  Imprimir Constancia (PDF)
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* SECCIÓN OCULTA EXCLUSIVA PARA LA IMPRESIÓN DE LA CONSTANCIA */}
      <div className="absolute left-[-9999px] top-[-9999px] opacity-0 pointer-events-none" aria-hidden="true">
        <div ref={constanciaPrintRef} style={{ padding: '20px 20px', fontFamily: 'Arial, sans-serif', color: '#000', backgroundColor: '#fff', width: '210mm', minHeight: '297mm', boxSizing: 'border-box' }}>
          <style>{`
            @media print {
              @page { size: A4; margin: 0; }
              body { -webkit-print-color-adjust: exact; print-color-adjust: exact; background-color: #fff !important; }
              .constancia-print-container { padding: 25mm 20mm !important; }
            }
          `}</style>
          
          {loanToPrint && loanToPrint.length > 0 && (
            <div className="constancia-print-container" style={{ width: '100%', display: 'flex', flexDirection: 'column' }}>
              {/* Cabecera UNSAAC con Logos */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '2px double #000', paddingBottom: '12px', marginBottom: '25px' }}>
                <img 
                  src="https://cnqpzyanmmwspvemcfeb.supabase.co/storage/v1/object/public/logos/escudo%20oficial-02%20(2).png" 
                  alt="Escudo UNSAAC" 
                  style={{ height: '60px', width: 'auto', objectFit: 'contain' }}
                />
                <div style={{ textAlign: 'center', flex: 1, padding: '0 15px' }}>
                  <h2 style={{ fontSize: '12px', fontWeight: 'bold', margin: '0', textTransform: 'uppercase', letterSpacing: '0.5px', lineHeight: '1.3' }}>UNIVERSIDAD NACIONAL DE SAN ANTONIO ABAD DEL CUSCO</h2>
                  <h3 style={{ fontSize: '10px', fontWeight: 'bold', margin: '4px 0 0', color: '#111', letterSpacing: '0.3px' }}>OFICINA DE ADMISIÓN</h3>
                  <h4 style={{ fontSize: '9px', fontWeight: 'bold', margin: '2px 0 0', color: '#444', letterSpacing: '0.2px' }}>DIRECCIÓN DE ADMISIÓN</h4>
                </div>
                <img 
                  src="https://cnqpzyanmmwspvemcfeb.supabase.co/storage/v1/object/public/logos/logo_admision_cuadrado.png" 
                  alt="Logo Admisión" 
                  style={{ height: '60px', width: 'auto', objectFit: 'contain' }}
                />
              </div>

              {/* Título */}
              <div style={{ textAlign: 'center', marginBottom: '30px' }}>
                <h1 style={{ fontSize: '17px', fontWeight: 'bold', margin: '0', textTransform: 'uppercase', letterSpacing: '1px' }}>CONSTANCIA DE PRÉSTAMO DE BIENES</h1>
                <p style={{ fontFamily: 'monospace', fontSize: '9px', color: '#666', margin: '5px 0 0', textTransform: 'uppercase' }}>
                  REF-{loanToPrint[0].prestatario_dni}-{loanToPrint[0].fecha_salida.substring(0,10).replace(/[^0-9]/g, '')}
                </p>
              </div>

              {/* Cuerpo de texto */}
              <p style={{ fontSize: '11px', lineHeight: '1.6', textAlign: 'justify', marginBottom: '25px', textIndent: '30px' }}>
                La Dirección de Admisión de la Universidad Nacional de San Antonio Abad del Cusco (UNSAAC), deja constancia formal por intermedio del presente documento que, en la fecha, se ha entregado en calidad de <strong>PRÉSTAMO TEMPORAL</strong> los bienes patrimoniales que se detallan a continuación al solicitante debidamente identificado:
              </p>

              {/* Tabla Datos del Prestatario */}
              <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '25px', fontSize: '10px' }}>
                <tbody>
                  <tr>
                    <td style={{ padding: '6px 10px', border: '1px solid #ddd', backgroundColor: '#f9f9f9', width: '200px', fontWeight: 'bold' }}>NOMBRES Y APELLIDOS:</td>
                    <td style={{ padding: '6px 10px', border: '1px solid #ddd', fontWeight: 'bold' }}>{loanToPrint[0].prestatario_nombre}</td>
                  </tr>
                  <tr>
                    <td style={{ padding: '6px 10px', border: '1px solid #ddd', backgroundColor: '#f9f9f9', fontWeight: 'bold' }}>DOCUMENTO DE IDENTIDAD (DNI):</td>
                    <td style={{ padding: '6px 10px', border: '1px solid #ddd', fontWeight: 'bold' }}>{loanToPrint[0].prestatario_dni}</td>
                  </tr>
                  <tr>
                    <td style={{ padding: '6px 10px', border: '1px solid #ddd', backgroundColor: '#f9f9f9', fontWeight: 'bold' }}>FECHA DE EMISIÓN/ENTREGA:</td>
                    <td style={{ padding: '6px 10px', border: '1px solid #ddd' }}>{new Date(loanToPrint[0].fecha_salida).toLocaleString('es-PE')}</td>
                  </tr>
                  <tr>
                    <td style={{ padding: '6px 10px', border: '1px solid #ddd', backgroundColor: '#f9f9f9', fontWeight: 'bold' }}>FECHA LÍMITE DE DEVOLUCIÓN:</td>
                    <td style={{ padding: '6px 10px', border: '1px solid #ddd', fontWeight: 'bold', color: '#a00' }}>{new Date((loanToPrint[0].fecha_limite.includes('T') ? loanToPrint[0].fecha_limite.split('T')[0] : loanToPrint[0].fecha_limite) + 'T12:00:00').toLocaleDateString('es-PE')}</td>
                  </tr>
                </tbody>
              </table>

              {/* Tabla de descripción de bienes */}
              <h3 style={{ fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase', marginBottom: '8px' }}>Detalles de los Bienes Prestados:</h3>
              <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '30px', fontSize: '10px' }}>
                <thead>
                  <tr style={{ backgroundColor: '#f1f1f1' }}>
                    <th style={{ border: '1px solid #000', padding: '6px', textAlign: 'center', width: '35px', fontWeight: 'bold' }}>Nº</th>
                    <th style={{ border: '1px solid #000', padding: '6px', textAlign: 'left', width: '130px', fontWeight: 'bold' }}>CÓDIGO BARRAS</th>
                    <th style={{ border: '1px solid #000', padding: '6px', textAlign: 'left', fontWeight: 'bold' }}>DESCRIPCIÓN DEL BIEN</th>
                    <th style={{ border: '1px solid #000', padding: '6px', textAlign: 'left', width: '150px', fontWeight: 'bold' }}>ESTADO</th>
                  </tr>
                </thead>
                <tbody>
                  {loanToPrint.map((loan, idx) => (
                    <tr key={idx}>
                      <td style={{ border: '1px solid #000', padding: '6px', textAlign: 'center' }}>{idx + 1}</td>
                      <td style={{ border: '1px solid #000', padding: '6px', fontFamily: 'monospace', fontWeight: 'bold' }}>{loan.inventario_bienes?.codigo_barras || 'S/C'}</td>
                      <td style={{ border: '1px solid #000', padding: '6px', fontWeight: 'bold' }}>{loan.inventario_bienes?.nombre_bien}</td>
                      <td style={{ border: '1px solid #000', padding: '6px', fontStyle: 'italic' }}>{loan.inventario_bienes?.descripcion_estado || 'Buen estado'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Cláusula */}
              <p style={{ fontSize: '10px', lineHeight: '1.5', textAlign: 'justify', borderLeft: '3px solid #000', paddingLeft: '12px', margin: '0 0 45px 0', fontStyle: 'italic', color: '#444' }}>
                "El prestatario declara bajo juramento haber recibido los bienes descritos a entera conformidad y asume la total responsabilidad civil, administrativa y patrimonial por la conservación, mantenimiento y devolución a tiempo de los mismos de forma íntegra a la Oficina de Admisión."
              </p>

              {/* Firmas */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '50px', marginTop: 'auto', paddingTop: '40px' }}>
                
                {/* Prestatario */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'end', textAlign: 'center' }}>
                  <div style={{ height: '70px', display: 'flex', alignItems: 'end', justifyContent: 'center', marginBottom: '4px', overflow: 'visible', position: 'relative' }}>
                    {loanToPrint[0].firma_url ? (
                      <img 
                        src={loanToPrint[0].firma_url} 
                        alt="Firma" 
                        style={{ 
                          maxHeight: '70px', 
                          maxWidth: '180px', 
                          objectFit: 'contain',
                          transform: `translate(${sigOffsetX}px, ${sigOffsetY}px) scale(${sigScale})`,
                          transformOrigin: 'bottom center',
                          mixBlendMode: 'multiply'
                        }}
                      />
                    ) : (
                      <span style={{ fontSize: '9px', color: '#999', fontStyle: 'italic', marginBottom: '10px' }}>(Pendiente de firma)</span>
                    )}
                  </div>
                  <div style={{ width: '180px', borderTop: '1px solid #000', marginBottom: '3px' }}></div>
                  <span style={{ fontSize: '9px', fontWeight: 'bold', textTransform: 'uppercase' }}>{loanToPrint[0].prestatario_nombre}</span>
                  <span style={{ fontSize: '8px', color: '#444', fontWeight: 'bold' }}>D.N.I.: {loanToPrint[0].prestatario_dni}</span>
                  <span style={{ fontSize: '7.5px', color: '#666' }}>SOLICITANTE / PRESTATARIO</span>
                </div>

                {/* Operador de Turno */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'end', textAlign: 'center' }}>
                  <div style={{ height: '70px', display: 'flex', alignItems: 'end', justifyContent: 'center', marginBottom: '4px' }}>
                    {/* Espacio para la firma manual al momento de imprimir */}
                  </div>
                  <div style={{ width: '180px', borderTop: '1px solid #000', marginBottom: '3px' }}></div>
                  <span style={{ fontSize: '9px', fontWeight: 'bold', textTransform: 'uppercase' }}>{operatorName}</span>
                  <span style={{ fontSize: '8px', color: '#444', fontWeight: 'bold' }}>D.N.I.: {operatorDni || '--------'}</span>
                  <span style={{ fontSize: '7.5px', color: '#666' }}>ENTREGADO POR (OPERADOR DE TURNO)</span>
                </div>

              </div>
            </div>
          )}
        </div>
      </div>

      {/* COMPONENTE OCULTO PARA IMPRESIÓN */}
      <div className="absolute left-[-9999px] top-[-9999px] opacity-0 pointer-events-none" aria-hidden="true">
        <div ref={printComponentRef} style={{ padding: '20px', fontFamily: 'sans-serif' }}>
          <style>{`
            @media print {
              @page { size: A4; margin: 15mm; }
              body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            }
          `}</style>
          
          <div style={{ textAlign: 'center', marginBottom: '20px' }}>
            <h2 style={{ fontSize: '24px', fontWeight: 'bold' }}>Etiquetas de Inventario</h2>
            <p style={{ fontSize: '14px', color: '#666' }}>Documento generado para impresión</p>
          </div>

          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(4, 1fr)', 
            gap: '20px', 
            width: '100%' 
          }}>
            {filteredInventory.map(item => (
              <div key={item.id} style={{ 
                border: '1px solid #ccc', 
                padding: '10px', 
                borderRadius: '8px', 
                display: 'flex', 
                flexDirection: 'column', 
                alignItems: 'center', 
                justifyContent: 'center',
                textAlign: 'center',
                pageBreakInside: 'avoid'
              }}>
                <p style={{ fontSize: '12px', fontWeight: 'bold', marginBottom: '8px', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', width: '100%' }}>
                  {item.nombre_bien}
                </p>
                <Barcode 
                  value={item.codigo_barras} 
                  height={40} 
                  width={1.2} 
                  fontSize={10} 
                  displayValue={true} 
                  margin={0}
                />
              </div>
            ))}
          </div>
        </div>
      </div>

    </div>
  );
};
