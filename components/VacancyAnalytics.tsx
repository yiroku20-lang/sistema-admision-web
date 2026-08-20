import React, { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';
import { ToastMessage } from '../types';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  LineChart, Line
} from 'recharts';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import html2canvas from 'html2canvas';

interface VacancyAnalyticsProps {
  onBack: () => void;
  notify: (msg: string, type?: ToastMessage['type']) => void;
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316', '#14b8a6', '#f43f5e'];

export const VacancyAnalytics: React.FC<VacancyAnalyticsProps> = ({ onBack, notify }) => {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any[]>([]);
  
  const [selectedYears, setSelectedYears] = useState<string[]>([]);
  const [filterArea, setFilterArea] = useState<string>('Todas');
  const [filterEscuela, setFilterEscuela] = useState<string>('Todas');
  const [showModalidad, setShowModalidad] = useState<boolean>(false);
  
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const chartRef = useRef<HTMLDivElement>(null);

  const [isYearsDropdownOpen, setIsYearsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchAnalyticsData();
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsYearsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchAnalyticsData = async () => {
    setLoading(true);
    try {
      const { data: cuadros, error: errCuadros } = await supabase.from('cv_cuadros_anuales').select('*');
      if (errCuadros) throw errCuadros;

      if (!cuadros || cuadros.length === 0) {
        setData([]);
        setLoading(false);
        return;
      }

      const cuadroIds = cuadros.map(c => c.id);
      const { data: modalidades, error: errMods } = await supabase.from('cv_modalidades').select('*').in('cuadro_id', cuadroIds);
      if (errMods) throw errMods;

      const modIds = modalidades?.map(m => m.id) || [];
      
      let allVacantes: any[] = [];
      let from = 0;
      let count = 1000;
      let hasMore = true;

      while (hasMore) {
        const { data: chunk, error: errVac } = await supabase
          .from('cv_vacantes')
          .select('*')
          .in('modalidad_id', modIds)
          .order('id')
          .range(from, from + count - 1);
        
        if (errVac) throw errVac;
        
        if (chunk && chunk.length > 0) {
          allVacantes = [...allVacantes, ...chunk];
        }
        
        if (!chunk || chunk.length < count) {
          hasMore = false;
        } else {
          from += count;
        }
      }

      const { data: escuelas, error: errEsc } = await supabase.from('cv_escuelas').select('*');
      if (errEsc) throw errEsc;

      const combinedData = allVacantes.map(v => {
        const mod = modalidades?.find(m => m.id === v.modalidad_id);
        const esc = escuelas?.find(e => e.id === v.escuela_id);
        const cuadro = cuadros.find(c => c.id === mod?.cuadro_id);

        return {
          anio: cuadro?.anio || 'Desconocido',
          escuela: esc?.nombre || 'Desconocido',
          area: esc?.area || 'Desconocida',
          modalidad: mod?.nombre || 'Desconocida',
          cantidad: v.cantidad || 0
        };
      }) || [];

      setData(combinedData);
      
      // Initialize selected years with all available years
      const availableYears = Array.from(new Set(combinedData.map(d => d.anio))).sort();
      setSelectedYears(availableYears);

    } catch (err: any) {
      notify('Error al cargar estadísticas: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setFilterEscuela('Todas');
  }, [filterArea]);

  const years = useMemo(() => Array.from(new Set(data.map(d => d.anio))).sort(), [data]);
  const areas = useMemo(() => Array.from(new Set(data.map(d => d.area))).sort(), [data]);
  const escuelasList = useMemo(() => {
    return Array.from(new Set(data.filter(d => filterArea === 'Todas' || d.area === filterArea).map(d => d.escuela))).sort();
  }, [data, filterArea]);

  const yearColors = useMemo(() => {
    const map: Record<string, string> = {};
    years.forEach((y, i) => map[y] = COLORS[i % COLORS.length]);
    return map;
  }, [years]);

  const filteredData = useMemo(() => {
    return data.filter(d => 
      selectedYears.includes(d.anio) && 
      (filterArea === 'Todas' || d.area === filterArea) &&
      (filterEscuela === 'Todas' || d.escuela === filterEscuela)
    );
  }, [data, selectedYears, filterArea, filterEscuela]);

  // Chart 1: Evolución Histórica (Total de todos los años, sin filtro de año para generales, pero filtra años para escuela específica)
  const chartEvolucion = useMemo(() => {
    const isSingleEscuela = filterEscuela !== 'Todas';
    const grouped = data.filter(d => 
      (filterArea === 'Todas' || d.area === filterArea) &&
      (filterEscuela === 'Todas' || d.escuela === filterEscuela) &&
      (!isSingleEscuela || selectedYears.includes(d.anio))
    ).reduce((acc, curr) => {
      if (!acc[curr.anio]) acc[curr.anio] = 0;
      acc[curr.anio] += curr.cantidad;
      return acc;
    }, {} as Record<string, number>);
    return Object.entries(grouped).map(([anio, total]) => ({ anio, total })).sort((a, b) => a.anio.localeCompare(b.anio));
  }, [data, filterArea, filterEscuela, selectedYears]);

  // Chart 2: Distribución por Área (Cruzado por años seleccionados, ignora filtro de área y filtra por escuela si existe)
  const chartAreas = useMemo(() => {
    const areaMap: Record<string, any> = {};
    data.filter(d => 
      selectedYears.includes(d.anio) &&
      (filterEscuela === 'Todas' || d.escuela === filterEscuela)
    ).forEach(d => {
      if (!areaMap[d.area]) areaMap[d.area] = { name: `Área ${d.area}` };
      areaMap[d.area][d.anio] = (areaMap[d.area][d.anio] || 0) + d.cantidad;
    });
    return Object.values(areaMap).sort((a, b) => a.name.localeCompare(b.name));
  }, [data, selectedYears, filterEscuela]);

  // Data that powers the specific Table View (Groups by Area, then by Escuela)
  const tableDataGrouped = useMemo(() => {
    const grouped: Record<string, Record<string, { area: string; escuela: string; modalidades: Record<string, Record<string, number>>; [anio: string]: any }>> = {};
    const relevantData = data.filter(d => 
      selectedYears.includes(d.anio) && 
      (filterArea === 'Todas' || d.area === filterArea) &&
      (filterEscuela === 'Todas' || d.escuela === filterEscuela)
    );
    
    relevantData.forEach(d => {
      if (!grouped[d.area]) grouped[d.area] = {};
      if (!grouped[d.area][d.escuela]) {
        grouped[d.area][d.escuela] = { area: d.area, escuela: d.escuela, modalidades: {} };
      }
      grouped[d.area][d.escuela][d.anio] = (grouped[d.area][d.escuela][d.anio] || 0) + d.cantidad;
      
      const mod = d.modalidad || 'Sin Modalidad';
      if (!grouped[d.area][d.escuela].modalidades[mod]) {
        grouped[d.area][d.escuela].modalidades[mod] = {};
      }
      grouped[d.area][d.escuela].modalidades[mod][d.anio] = (grouped[d.area][d.escuela].modalidades[mod][d.anio] || 0) + d.cantidad;
    });
    return grouped;
  }, [data, selectedYears, filterArea, filterEscuela]);

  const yearTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    selectedYears.forEach(y => totals[y] = 0);

    Object.values(tableDataGrouped).forEach(areaGroup => {
      Object.values(areaGroup).forEach(esc => {
        selectedYears.forEach(y => {
          totals[y] += (esc[y] || 0);
        });
      });
    });
    
    return totals;
  }, [tableDataGrouped, selectedYears]);

  const sortedYears = useMemo(() => [...selectedYears].sort((a,b) => b.localeCompare(a)), [selectedYears]);

  const exportReportToPDF = async () => {
    if (selectedYears.length === 0) {
      notify("Debe seleccionar al menos un año para exportar el reporte.");
      return;
    }

    setIsGeneratingPDF(true);
    try {
      const doc = new jsPDF('l', 'mm', 'a4');
      doc.setFontSize(16);
      doc.setFont("helvetica", "bold");
      doc.text("REPORTE: CUADRO DE VACANTES", 14, 20);
      
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.text(`Años: ${selectedYears.join(', ')} | Filtro: ${filterArea === 'Todas' ? 'Todas las Áreas' : `Área ${filterArea}`}${filterEscuela !== 'Todas' ? ` | Escuela: ${filterEscuela}` : ''}`, 14, 28);
      
      let currentY = 35;

      // Capture and add the chart image if it exists
      if (chartRef.current) {
        const canvas = await html2canvas(chartRef.current, { scale: 2 });
        const imgData = canvas.toDataURL('image/png');
        const pdfWidth = doc.internal.pageSize.getWidth() - 28;
        const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
        
        doc.text("Evolución Histórica General", 14, currentY);
        currentY += 5;
        doc.addImage(imgData, 'PNG', 14, currentY, pdfWidth, pdfHeight);
        currentY += pdfHeight + 15;
      }

      const isSingleEscuela = filterEscuela !== 'Todas';
      
      const ascYears = [...selectedYears].sort((a,b) => a.localeCompare(b));
      
      const headRow: any[] = [
        { content: 'ESCUELAS PROFESIONALES', styles: { halign: 'left' } },
        ...sortedYears.map(y => ({ content: `TOTAL ${y}`, styles: { halign: 'center' } }))
      ];
      if (!isSingleEscuela) {
        headRow.push({ content: 'TENDENCIA', styles: { halign: 'center' } }); // Trendline column
      }

      const bodyRows: any[] = [];
      
      const areasSorted = Object.keys(tableDataGrouped).sort();

      areasSorted.forEach(area => {
        if (!isSingleEscuela) {
          bodyRows.push([
            { content: `ÁREA ${area}`, colSpan: selectedYears.length + 2, styles: { halign: 'center', fontStyle: 'bold', fillColor: [254, 242, 242], textColor: [123, 21, 35] } }
          ]);
        }
        
        const escuelas = Object.values(tableDataGrouped[area] as Record<string, any>).sort((a,b) => a.escuela.localeCompare(b.escuela)) as any[];
        
        const areaTotals: Record<string, number> = {};
        selectedYears.forEach(y => areaTotals[y] = 0);

        escuelas.forEach(esc => {
          selectedYears.forEach(y => {
            areaTotals[y] += (esc[y] || 0);
          });
          const row: any[] = [
            { content: esc.escuela },
            ...sortedYears.map(y => ({ content: (esc[y] || 0).toString(), styles: { halign: 'center' } }))
          ];
          if (!isSingleEscuela) {
            row.push({ content: '', _trendData: ascYears.map(y => esc[y] || 0) });
          }
          bodyRows.push(row);
          
          if (showModalidad && esc.modalidades) {
            sortedYears.forEach(y => {
              const modsForYear = Object.keys(esc.modalidades).filter(mod => esc.modalidades[mod][y]);
              if (modsForYear.length === 0) return;
              
              const semRow: any[] = [
                { content: `   Semestre ${y}`, styles: { textColor: [100, 100, 100], fontStyle: 'bold' } },
                ...sortedYears.map(() => ({ content: '' }))
              ];
              if (!isSingleEscuela) semRow.push({ content: '' });
              bodyRows.push(semRow);

              modsForYear.sort().forEach(mod => {
                const modRow: any[] = [
                  { content: `     - ${mod}`, styles: { textColor: [100, 100, 100], fontStyle: 'italic' } },
                  ...sortedYears.map(colYear => ({ 
                    content: y === colYear ? (esc.modalidades[mod][y] || 0).toString() : '', 
                    styles: { halign: 'center', textColor: [100, 100, 100] } 
                  }))
                ];
                if (!isSingleEscuela) modRow.push({ content: '' });
                bodyRows.push(modRow);
              });
            });
          }
        });
        
        if (!isSingleEscuela) {
          // Subtotal row
          bodyRows.push([
            { content: `SUBTOTAL ÁREA ${area}`, styles: { halign: 'right', fontStyle: 'bold', fillColor: [248, 250, 252] } }, // slate-50
            ...sortedYears.map(y => ({ content: areaTotals[y].toString(), styles: { halign: 'center', fontStyle: 'bold', textColor: [123, 21, 35], fillColor: [248, 250, 252] } })),
            { content: '', _trendData: ascYears.map(y => areaTotals[y]), styles: { fillColor: [248, 250, 252] } }
          ]);
        }
      });

      const footRow: any[] = [
        { content: 'TOTAL GENERAL', styles: { halign: 'right', fontStyle: 'bold', fillColor: [123, 21, 35], textColor: 255 } },
        ...sortedYears.map(y => ({ content: yearTotals[y].toString(), styles: { halign: 'center', fontStyle: 'bold', fillColor: [123, 21, 35], textColor: 255 } }))
      ];
      if (!isSingleEscuela) {
        footRow.push({ content: '', styles: { fillColor: [123, 21, 35] } });
      }

      // The autotable signature can be finicky depending on the version, doc passes context
      const margin = { top: 20, right: 14, bottom: 20, left: 14 };
      if (currentY + 20 > doc.internal.pageSize.getHeight() - margin.bottom) {
        doc.addPage();
        currentY = margin.top;
      }

      autoTable(doc as any, {
        startY: currentY,
        head: [headRow],
        body: bodyRows as any,
        foot: [footRow],
        theme: 'grid',
        headStyles: { fillColor: [123, 21, 35], textColor: 255, fontStyle: 'bold' },
        styles: { fontSize: 8, cellPadding: 2 },
          columnStyles: { 
            0: { cellWidth: 80 },
            // dynamically target the trendline column which is the last one
            [(selectedYears.length + 1).toString()]: { cellWidth: 30 }
          },
          didDrawCell: (data: any) => {
             if (data.section === 'body' && data.column.index === selectedYears.length + 1) {
                const rawCell = data.row.raw[data.column.index];
                if (rawCell && rawCell._trendData) {
                   const values = rawCell._trendData;
                   if (values.length > 1) {
                      const padding = 2;
                      const startX = data.cell.x + padding;
                      const startY = data.cell.y + padding + 1; // Slight downward offset
                      const drawWidth = data.cell.width - (padding * 2);
                      const drawHeight = data.cell.height - (padding * 2) - 2;

                      const max = Math.max(...values);
                      const min = Math.min(...values);
                      const range = max - min === 0 ? 1 : max - min;

                      const stepX = drawWidth / (values.length - 1);
                      
                      doc.setDrawColor(123, 21, 35); // Institutional red trendline
                      doc.setLineWidth(1); // Make it slightly thicker for visibility

                      let prevX = 0, prevY = 0;
                      for (let i = 0; i < values.length; i++) {
                          const px = startX + (i * stepX);
                          let py = startY + drawHeight - (((values[i] - min) / range) * drawHeight);
                          if (max === min) py = startY + drawHeight / 2; // Middle if constant

                          if (i > 0) {
                              doc.line(prevX, prevY, px, py);
                          }
                          prevX = px;
                          prevY = py;
                      }
                   }
                }
             }
          }
        });

        doc.save(`Reporte_Vacantes_${new Date().toISOString().split('T')[0]}.pdf`);
        notify("Reporte exportado exitosamente", "success");
      } catch (err: any) {
        notify("Error al exportar a PDF: " + err.message, "error");
      } finally {
        setIsGeneratingPDF(false);
      }
  };

  if (loading) {
    return (
      <div className="flex flex-col h-full items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600 mb-4"></div>
        <p className="text-slate-500 font-bold uppercase tracking-widest text-xs">Procesando datos...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4 shrink-0">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="size-10 rounded-full bg-white border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-900 flex items-center justify-center transition-all">
            <span className="material-symbols-outlined">arrow_back</span>
          </button>
          <div>
            <h1 className="text-xl font-black text-slate-900 tracking-tight uppercase flex items-center gap-2">
              <span className="material-symbols-outlined text-emerald-600">bar_chart</span>
              Dashboard de Vacantes
            </h1>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
              Análisis cruzado por Áreas y Escuelas
            </p>
          </div>
        </div>
        
        <div className="flex gap-3 items-center">
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setIsYearsDropdownOpen(!isYearsDropdownOpen)}
              className="h-10 px-4 rounded-xl border-2 border-slate-100 bg-slate-50 text-xs font-bold text-slate-700 outline-none hover:border-emerald-500 flex items-center gap-2 transition-all"
            >
              <span className="material-symbols-outlined text-[16px] text-slate-400">calendar_month</span>
              <span>Años ({selectedYears.length})</span>
              <span className="material-symbols-outlined text-[18px]">expand_more</span>
            </button>
            {isYearsDropdownOpen && (
              <div className="absolute top-full mt-2 right-0 w-48 bg-white border border-slate-200 rounded-xl shadow-xl z-50 py-2 flex flex-col gap-1">
                <div className="px-4 py-2 border-b border-slate-100 flex justify-between items-center">
                  <span className="text-[10px] font-black uppercase text-slate-400">Seleccionar Años</span>
                  <button 
                    onClick={() => setSelectedYears(selectedYears.length === years.length ? [] : [...years])}
                    className="text-[9px] font-bold text-emerald-600 hover:underline"
                  >
                    {selectedYears.length === years.length ? 'Ninguno' : 'Todos'}
                  </button>
                </div>
                {years.map(y => (
                  <label key={y} className="flex items-center gap-3 px-4 py-2 hover:bg-slate-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedYears.includes(y)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedYears([...selectedYears, y].sort());
                        } else {
                          setSelectedYears(selectedYears.filter(year => year !== y));
                        }
                      }}
                      className="size-4 accent-emerald-600 rounded cursor-pointer"
                    />
                    <span className="text-xs font-bold text-slate-700">{y}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          <select 
            value={filterArea} 
            onChange={e => setFilterArea(e.target.value)}
            className="h-10 max-w-[150px] truncate px-4 rounded-xl border-2 border-slate-100 bg-slate-50 text-xs font-bold text-slate-700 outline-none focus:border-emerald-500"
          >
            <option value="Todas">Todas las Áreas</option>
            {areas.map(a => <option key={a} value={a}>Área {a}</option>)}
          </select>

          <select 
            value={filterEscuela} 
            onChange={e => setFilterEscuela(e.target.value)}
            className="h-10 max-w-[200px] truncate px-4 rounded-xl border-2 border-slate-100 bg-slate-50 text-xs font-bold text-slate-700 outline-none focus:border-emerald-500"
          >
            <option value="Todas">Todas las Escuelas</option>
            {escuelasList.map(e => <option key={e} value={e}>{e}</option>)}
          </select>
          
          <label className="flex items-center gap-2 cursor-pointer h-10 px-4 rounded-xl border-2 border-slate-100 bg-slate-50 text-xs font-bold text-slate-700 hover:border-slate-200 transition-colors">
            <input 
              type="checkbox" 
              className="sr-only peer"
              checked={showModalidad}
              onChange={(e) => setShowModalidad(e.target.checked)}
            />
            <div className="w-8 h-4 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500 relative flex items-center justify-center">
              <div className="absolute left-[2px] w-[14px] h-[14px] bg-white rounded-full shadow-sm transition-transform peer-checked:translate-x-4"></div>
            </div>
            <span>Mostrar Modalidades</span>
          </label>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          {/* KPI 1 */}
          <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm flex items-center gap-4">
            <div className="size-14 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center">
              <span className="material-symbols-outlined text-3xl">groups</span>
            </div>
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Vacantes (Selección)</p>
              <p className="text-3xl font-black text-slate-900">{filteredData.reduce((sum, d) => sum + d.cantidad, 0).toLocaleString()}</p>
            </div>
          </div>
          {/* KPI 2 */}
          <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm flex items-center gap-4">
            <div className="size-14 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center">
              <span className="material-symbols-outlined text-3xl">analytics</span>
            </div>
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Promedio Anual</p>
              <p className="text-3xl font-black text-slate-900">
                {selectedYears.length > 0 ? Math.round(filteredData.reduce((sum, d) => sum + d.cantidad, 0) / selectedYears.length).toLocaleString() : 0}
              </p>
            </div>
          </div>
          {/* KPI 3 */}
          <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm flex items-center gap-4">
            <div className="size-14 bg-purple-50 text-purple-600 rounded-2xl flex items-center justify-center">
              <span className="material-symbols-outlined text-3xl">school</span>
            </div>
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Escuelas Involucradas</p>
              <p className="text-3xl font-black text-slate-900">{new Set(filteredData.filter(d => d.cantidad > 0).map(d => d.escuela)).size}</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* Chart 1 */}
          <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm" ref={chartRef}>
            <h3 className="font-black text-slate-900 uppercase tracking-tight mb-6">Evolución Histórica General</h3>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartEvolucion}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="anio" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b', fontWeight: 700 }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b', fontWeight: 700 }} />
                  <Tooltip cursor={{ fill: '#f8fafc' }} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} />
                  <Line type="monotone" dataKey="total" name="Total Vacantes" stroke="#10b981" strokeWidth={4} dot={{ r: 6, strokeWidth: 2, fill: '#fff' }} activeDot={{ r: 8 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Chart 2 */}
          <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm">
            <h3 className="font-black text-slate-900 uppercase tracking-tight mb-6">Distribución por Área (Comparativa)</h3>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartAreas}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b', fontWeight: 700 }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b', fontWeight: 700 }} />
                  <Tooltip cursor={{ fill: '#f8fafc' }} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} />
                  <Legend wrapperStyle={{ paddingTop: '20px', fontSize: '12px', fontWeight: 'bold', color: '#64748b' }} />
                  {selectedYears.map(year => (
                    <Bar key={year} dataKey={year} name={year} fill={yearColors[year]} radius={[4, 4, 0, 0]} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Tabla Detallada Reporte con Tendencia */}
        <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm flex flex-col">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-black text-slate-900 uppercase tracking-tight">Reporte: Cuadro de Vacantes por Escuelas</h3>
            <button 
              onClick={exportReportToPDF}
              disabled={isGeneratingPDF || selectedYears.length === 0}
              className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-xl font-black tracking-widest text-[10px] uppercase flex items-center gap-2 shadow-lg shadow-red-200 disabled:opacity-50"
            >
              {isGeneratingPDF ? (
                <span className="material-symbols-outlined text-[16px] animate-spin">refresh</span>
              ) : (
                <span className="material-symbols-outlined text-[16px]">picture_as_pdf</span>
              )}
              {isGeneratingPDF ? 'Generando...' : 'Descargar PDF'}
            </button>
          </div>
          
          {Object.keys(tableDataGrouped).length === 0 ? (
            <div className="h-32 flex items-center justify-center text-slate-400 font-bold text-sm">
              No hay datos para mostrar con los filtros actuales.
            </div>
          ) : (
            <div className="overflow-x-auto w-full border border-slate-200 rounded-xl rounded-b-none">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="bg-[#7b1523] border-b border-[#7b1523]">
                  <tr>
                    <th className="p-3 font-black text-white">ESCUELAS PROFESIONALES</th>
                    {sortedYears.map(y => (
                      <th key={y} className="p-3 font-black text-white text-center">TOTAL {y}</th>
                    ))}
                    {filterEscuela === 'Todas' && (
                      <th className="p-3 font-black text-white text-center">TENDENCIA</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {Object.keys(tableDataGrouped).sort().map(area => {
                    const ascYears = [...selectedYears].sort((a,b) => a.localeCompare(b));
                    const escuelas = Object.values(tableDataGrouped[area] as Record<string, any>).sort((a, b) => a.escuela.localeCompare(b.escuela)) as any[];
                    const areaTotals: Record<string, number> = {};
                    sortedYears.forEach(y => areaTotals[y] = 0);
                    escuelas.forEach(esc => {
                      sortedYears.forEach(y => {
                        areaTotals[y] += (esc[y] || 0);
                      });
                    });
                    const subtotalSparklineData = ascYears.map(y => ({ val: areaTotals[y] }));

                    return (
                      <React.Fragment key={area}>
                        {filterEscuela === 'Todas' && (
                          <tr>
                            <td colSpan={sortedYears.length + 2} className="bg-red-50 p-2 font-black text-[#7b1523] text-center uppercase tracking-widest border-y border-[#7b1523]/20 text-xs">
                              Área {area}
                            </td>
                          </tr>
                        )}
                        {escuelas.map(esc => {
                          const sparklineData = ascYears.map(y => ({ val: esc[y] || 0 }));
                          return (
                            <React.Fragment key={esc.escuela}>
                              <tr className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                                <td className="p-3 font-bold text-slate-700 text-xs whitespace-normal min-w-[280px]">{esc.escuela}</td>
                                {sortedYears.map(y => (
                                  <td key={y} className="p-3 text-center text-slate-600 font-medium">{esc[y] || 0}</td>
                                ))}
                                {filterEscuela === 'Todas' && (
                                  <td className="p-1 px-3 text-center">
                                    <div className="w-[100px] h-[25px] inline-block mt-1">
                                      <ResponsiveContainer width="100%" height="100%">
                                        <LineChart data={sparklineData}>
                                          <Line type="monotone" dataKey="val" stroke="#7b1523" strokeWidth={2} dot={false} isAnimationActive={false} />
                                        </LineChart>
                                      </ResponsiveContainer>
                                    </div>
                                  </td>
                                )}
                              </tr>
                              {showModalidad && sortedYears.map(y => {
                                const modsForYear = Object.keys(esc.modalidades || {}).filter(mod => esc.modalidades[mod][y]);
                                if (modsForYear.length === 0) return null;
                                return (
                                  <React.Fragment key={`${esc.escuela}-${y}`}>
                                    <tr className="bg-slate-50/50">
                                      <td className="pl-8 p-1 font-bold text-slate-600 text-[10px] uppercase tracking-widest bg-slate-100/50">Semestre {y}</td>
                                      {sortedYears.map(colYear => (
                                        <td key={`sem-${colYear}`} className="p-1"></td>
                                      ))}
                                      {filterEscuela === 'Todas' && <td className="p-1"></td>}
                                    </tr>
                                    {modsForYear.sort().map(mod => (
                                      <tr key={`${esc.escuela}-${y}-${mod}`} className="border-b border-slate-50 hover:bg-slate-50 transition-colors bg-slate-50/20">
                                        <td className="pl-12 p-2 font-medium text-slate-500 text-xs whitespace-normal min-w-[280px]">- {mod}</td>
                                        {sortedYears.map(colYear => (
                                          <td key={colYear} className="p-2 text-center text-slate-500 text-xs">
                                            {colYear === y ? esc.modalidades[mod][y] || 0 : ''}
                                          </td>
                                        ))}
                                        {filterEscuela === 'Todas' && <td className="p-2"></td>}
                                      </tr>
                                    ))}
                                  </React.Fragment>
                                );
                              })}
                            </React.Fragment>
                          );
                        })}
                        {/* Subtotal row */}
                        {filterEscuela === 'Todas' && (
                          <tr className="bg-slate-50 border-b border-slate-200">
                            <td className="p-3 font-black text-slate-800 text-xs text-right uppercase">Subtotal Área {area}</td>
                            {sortedYears.map(y => (
                              <td key={`subtotal-${y}`} className="p-3 text-center text-[#7b1523] font-black">{areaTotals[y]}</td>
                            ))}
                            <td className="p-1 px-3 text-center">
                              <div className="w-[100px] h-[25px] inline-block mt-1">
                                <ResponsiveContainer width="100%" height="100%">
                                  <LineChart data={subtotalSparklineData}>
                                    <Line type="monotone" dataKey="val" stroke="#7b1523" strokeWidth={2} dot={false} isAnimationActive={false} />
                                  </LineChart>
                                </ResponsiveContainer>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
                <tfoot className="bg-[#7b1523] border-t border-[#7b1523]">
                  <tr>
                    <td className="p-3 font-black text-white text-right uppercase tracking-widest text-xs">TOTAL GENERAL</td>
                    {sortedYears.map(y => (
                      <td key={`total-${y}`} className="p-3 font-black text-white text-center text-sm">{yearTotals[y]}</td>
                    ))}
                    {filterEscuela === 'Todas' && (
                      <td className="p-3"></td>
                    )}
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
