
import React, { useState, useRef, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { VacancyReservationBatch, VacancyReservationDetail, Participant, User } from '../types';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

type ViewMode = 'nueva' | 'historial' | 'padron';

interface TempReservation {
    code: string;
    name: string;
    found: boolean;
    alreadyReserved: boolean;
    prevResolution?: string;
    carrera: string;
    startingSemester: string;
    gradeLevel: string;
    admissionModality: string;
    multiIngreso: boolean;
    allOptions?: Participant[];
    selectedOptionIndex?: number;
}

interface VacancyReservationProps {
  user: User;
  notify?: (message: string, type?: 'success' | 'error' | 'warning' | 'info') => void;
}

export const VacancyReservation: React.FC<VacancyReservationProps> = ({ user, notify }) => {
  const [activeView, setActiveView] = useState<ViewMode>('padron');
  const [tempList, setTempList] = useState<TempReservation[]>([]);
  const [csvSummary, setCsvSummary] = useState<{
    total: number;
    found: number;
    notFound: number;
    alreadyReserved: number;
    apt: number;
  } | null>(null);
  const [isProcessingCsv, setIsProcessingCsv] = useState(false);
  const [selectedForBatch, setSelectedForBatch] = useState<Set<number>>(new Set());
  const [batches, setBatches] = useState<VacancyReservationBatch[]>([]);
  const [globalDetails, setGlobalDetails] = useState<(VacancyReservationDetail & { batch?: VacancyReservationBatch })[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  
  const [filterModality, setFilterModality] = useState('');
  const [filterSchool, setFilterSchool] = useState('');
  const [filterSemester, setFilterSemester] = useState('');

  const [loading, setLoading] = useState(false);
  const [uploadingPdf, setUploadingPdf] = useState(false);
  
  const [isSaveBatchModalOpen, setIsSaveBatchModalOpen] = useState(false);
  const [reportCode, setReportCode] = useState('');
  const [expedienteNum, setExpedienteNum] = useState('');
  
  const [isResUpdateModalOpen, setIsResUpdateModalOpen] = useState(false);
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
  const [resNum, setResNum] = useState('');
  const [resDate, setResDate] = useState('');
  const [resPdf, setResPdf] = useState('');

  const [isResignationModalOpen, setIsResignationModalOpen] = useState(false);
  const [selectedDetailId, setSelectedDetailId] = useState<string | null>(null);
  const [withdrawnResNum, setWithdrawnResNum] = useState('');
  const [withdrawnResDate, setWithdrawnResDate] = useState('');
  const [withdrawnResPdf, setWithdrawnResPdf] = useState('');

  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);
  const [selectedPreviewBatch, setSelectedPreviewBatch] = useState<VacancyReservationBatch | null>(null);
  const [previewStudents, setPreviewStudents] = useState<VacancyReservationDetail[]>([]);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [hasPreviewChanges, setHasPreviewChanges] = useState(false);
  const [savingPreview, setSavingPreview] = useState(false);
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);

  const csvInputRef = useRef<HTMLInputElement>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);

  const currentYear = new Date().getFullYear();
  const semesterOptions = [
      `${currentYear - 1}-I`, // Ej: 2025-I
      `${currentYear}-I`,     // Ej: 2026-I
      `${currentYear + 1}-I`,
      `${currentYear + 2}-I`,
      `${currentYear + 3}-I`,
      `${currentYear + 4}-I`,
  ];

  useEffect(() => {
    const handleClickOutside = () => setActiveMenuId(null);
    window.addEventListener('click', handleClickOutside);
    return () => window.removeEventListener('click', handleClickOutside);
  }, []);

  useEffect(() => {
    if (activeView === 'historial') fetchBatches();
    if (activeView === 'padron') fetchGlobal();
  }, [activeView]);

  const fetchBatches = async () => {
    setLoading(true);
    const { data } = await supabase.from('reserva_vacantes_bloques').select('*').order('created_at', { ascending: false });
    if (data) setBatches(data);
    setLoading(false);
  };

  const fetchGlobal = async () => {
    setLoading(true);
    const { data } = await supabase.from('reserva_vacantes_detalles').select('*, batch:reserva_vacantes_bloques(*)').order('student_name', { ascending: true });
    if (data) setGlobalDetails(data as any);
    setLoading(false);
  };

  const handleResignation = async () => {
    if (!selectedDetailId || !withdrawnResNum) return;
    setLoading(true);
    try {
        const { error } = await supabase.from('reserva_vacantes_detalles').update({
            is_withdrawn: true,
            withdrawal_resolution_number: withdrawnResNum,
            withdrawal_resolution_date: withdrawnResDate,
            withdrawal_resolution_pdf: withdrawnResPdf
        }).eq('id', selectedDetailId);

        if (error) throw error;
        if (notify) notify('Renuncia registrada correctamente', 'success');
        setIsResignationModalOpen(false);
        setWithdrawnResNum('');
        setWithdrawnResDate('');
        setWithdrawnResPdf('');
        fetchGlobal();
    } catch (err: any) {
        if (notify) notify(err.message, 'error');
    } finally {
        setLoading(false);
    }
  };

  const calculateStartingSemester = (grade: string): string => {
      const g = grade.trim().toUpperCase();
      const currentYear = new Date().getFullYear();
      if (g === 'QUINTO') return `${currentYear + 1}-I`;
      if (g === 'CUARTO') return `${currentYear + 2}-I`;
      if (g === 'TERCERO') return `${currentYear + 3}-I`;
      return `${currentYear + 1}-I`;
  };

  const handleCsvUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
        const content = evt.target?.result as string;
        const lines = content.split(/\r?\n/).filter(line => line.trim());
        if (lines.length <= 1) return;

        setIsProcessingCsv(true);
        const delimiter = lines[0].includes(';') ? ';' : ',';
        const raw = lines.slice(1).map(line => {
            const parts = line.split(delimiter).map(p => p.trim().replace(/^"|"$/g, ''));
            return { code: parts[0] || '', name: (parts[1] || '').toUpperCase(), grade: (parts[2] || 'QUINTO').toUpperCase() };
        });

        const codes = raw.map(r => r.code);
        const { data: dbMatches } = await supabase.from('participantes').select('*').in('CODPOSTULANTE', codes);
        const { data: existingReservations } = await supabase.from('reserva_vacantes_detalles').select('student_code, is_withdrawn, batch:reserva_vacantes_bloques(resolution_number)').in('student_code', codes);

        const mapped = raw.map(item => {
            const matches = dbMatches?.filter(m => String(m.CODPOSTULANTE).trim() === String(item.code).trim()) || [];
            const match = matches[0];
            const prevRes = existingReservations?.find(r => String(r.student_code).trim() === String(item.code).trim() && !r.is_withdrawn);

            return {
                code: item.code,
                name: item.name,
                found: matches.length > 0,
                alreadyReserved: !!prevRes,
                prevResolution: prevRes ? (prevRes.batch as any)?.resolution_number || 'PENDIENTE' : undefined,
                carrera: match ? match.CARRERA : 'NO ENCONTRADO',
                admissionModality: match ? match.MODALIDAD : '',
                gradeLevel: item.grade,
                startingSemester: calculateStartingSemester(item.grade),
                multiIngreso: matches.length > 1,
                allOptions: matches,
                selectedOptionIndex: matches.length > 0 ? 0 : undefined
            };
        });

        setTempList(mapped);
        const summary = {
            total: mapped.length,
            found: mapped.filter(it => it.found).length,
            notFound: mapped.filter(it => !it.found).length,
            alreadyReserved: mapped.filter(it => it.alreadyReserved).length,
            apt: mapped.filter(it => it.found).length
        };
        setCsvSummary(summary);
        setSelectedForBatch(new Set(mapped.map((it, i) => (it.found) ? i : -1).filter(i => i !== -1)));
        setIsProcessingCsv(false);
    };
    reader.readAsText(file);
  };

  const handleSaveBatch = async () => {
      if (!reportCode || !expedienteNum) return;
      setLoading(true);
      try {
          const { data: batch, error: batchError } = await supabase.from('reserva_vacantes_bloques').insert([{
              report_code: reportCode.trim(),
              expediente_number: expedienteNum.trim(),
              status: 'Tramite'
          }]).select().single();

          if (batchError) throw batchError;

          const selectedDetails = tempList.filter((_, i) => selectedForBatch.has(i));
          const details = selectedDetails.map(it => ({
              batch_id: batch.id,
              student_code: it.code,
              student_name: it.name,
              carrera: it.carrera,
              grade_level: it.gradeLevel,
              starting_semester: it.startingSemester,
              admission_modality: it.admissionModality
          }));

          const { error: detailError } = await supabase.from('reserva_vacantes_detalles').insert(details);
          if (detailError) throw detailError;

          // Generar PDF
          generatePDFReport(batch.report_code, batch.expediente_number, selectedDetails);

          if (notify) notify("Bloque guardado y reporte generado. Procesando trámites económicos...");
          setTempList([]);
          setCsvSummary(null);
          setSelectedForBatch(new Set());
          setIsSaveBatchModalOpen(false);
          setActiveView('historial');
      } catch (err: any) { alert(err.message); } finally { setLoading(false); }
  };

  const generatePreviewPDFReport = () => {
      const doc = new jsPDF({
          orientation: 'landscape',
          unit: 'mm',
          format: 'a4'
      });

      const unsaacRed: [number, number, number] = [165, 29, 45]; 

      // Header Title
      doc.setFontSize(16);
      doc.setTextColor(unsaacRed[0], unsaacRed[1], unsaacRed[2]);
      doc.setFont('helvetica', 'bold');
      doc.text('UNSAAC - DIRECCIÓN DE ADMISIÓN', 148, 15, { align: 'center' });
      
      doc.setFontSize(10);
      doc.setTextColor(60, 60, 60);
      doc.setFont('helvetica', 'normal');
      doc.text('REPORTE PREVIO DE RESERVA DE VACANTES', 148, 22, { align: 'center' });

      // Horizontal Line
      doc.setDrawColor(unsaacRed[0], unsaacRed[1], unsaacRed[2]);
      doc.setLineWidth(0.5);
      doc.line(20, 26, 277, 26);

      // Table
      const tableData = tempList.map((s, index) => {
          let estado = s.found ? (s.alreadyReserved ? `YA RESERVADO (${s.prevResolution})` : 'APTO') : 'NO ENCONTRADO';
          let multiples = s.multiIngreso ? `Sí (${s.allOptions?.length} ingresos)` : 'No';

          return [
              index + 1,
              s.code,
              s.name,
              s.carrera,
              s.admissionModality,
              s.gradeLevel,
              multiples,
              estado
          ];
      });

      autoTable(doc, {
          startY: 35,
          head: [['Nº', 'CÓDIGO', 'NOMBRE COMPLETO', 'ESCUELA', 'MODALIDAD', 'AÑO SEC.', 'MÚLTIPLES ING.', 'ESTADO']],
          body: tableData,
          theme: 'grid',
          headStyles: { 
              fillColor: [241, 245, 249], 
              textColor: [71, 85, 105], 
              fontStyle: 'bold',
              lineWidth: 0.1,
              lineColor: [226, 232, 240]
          },
          styles: { 
              fontSize: 7, 
              cellPadding: 2,
              lineColor: [226, 232, 240],
              lineWidth: 0.1
          },
          didDrawPage: (data) => {
              doc.setFontSize(8);
              doc.setTextColor(150, 150, 150);
              doc.text(`Página ${data.pageNumber}`, 148, 200, { align: 'center' });
          }
      });

      doc.save(`Reporte_Previo_Reserva_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  const generatePDFReport = (oficio: string, expediente: string, students: TempReservation[]) => {
      const doc = new jsPDF({
          orientation: 'portrait',
          unit: 'mm',
          format: 'a4'
      });

      const unsaacRed: [number, number, number] = [165, 29, 45]; // #A51D2D

      // Header Title
      doc.setFontSize(16);
      doc.setTextColor(unsaacRed[0], unsaacRed[1], unsaacRed[2]);
      doc.setFont('helvetica', 'bold');
      doc.text('UNSAAC - DIRECCIÓN DE ADMISIÓN', 105, 15, { align: 'center' });
      
      doc.setFontSize(10);
      doc.setTextColor(60, 60, 60);
      doc.setFont('helvetica', 'normal');
      doc.text('RESERVA DE VACANTE', 105, 22, { align: 'center' });

      // Horizontal Line
      doc.setDrawColor(unsaacRed[0], unsaacRed[1], unsaacRed[2]);
      doc.setLineWidth(0.5);
      doc.line(20, 26, 190, 26);

      // Batch Info
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(0, 0, 0);
      doc.text(`OFICIO Nº ${oficio}`, 20, 35);
      
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 100, 100);
      doc.text(`Expediente: ${expediente}`, 190, 35, { align: 'right' });

      // Intro Text
      doc.setFontSize(9);
      doc.setTextColor(80, 80, 80);
      doc.text('Relación de ingresantes que solicitan reserva de vacante por cursar estudios secundarios:', 20, 45);

      // Table
      const tableData = students.map((s, index) => [
          index + 1,
          s.code,
          s.name,
          `${s.carrera}\n(${s.admissionModality})`,
          s.gradeLevel,
          s.startingSemester
      ]);

      autoTable(doc, {
          startY: 50,
          head: [['Nº', 'CÓDIGO', 'NOMBRE COMPLETO', 'ESCUELA / MODALIDAD', 'AÑO SECUNDARIA', 'INICIO SEMESTRE']],
          body: tableData,
          theme: 'grid',
          headStyles: { 
              fillColor: [241, 245, 249], 
              textColor: [71, 85, 105], 
              fontStyle: 'bold',
              lineWidth: 0.1,
              lineColor: [226, 232, 240]
          },
          styles: { 
              fontSize: 8, 
              cellPadding: 3,
              lineColor: [226, 232, 240],
              lineWidth: 0.1
          },
          columnStyles: {
              0: { cellWidth: 10, halign: 'center' },
              1: { cellWidth: 20 },
              2: { cellWidth: 'auto', fontStyle: 'bold' },
              3: { cellWidth: 55 },
              4: { cellWidth: 25 },
              5: { cellWidth: 25, fontStyle: 'bold', textColor: unsaacRed }
          },
          didDrawPage: (data) => {
              // Footer
              doc.setFontSize(8);
              doc.setTextColor(150, 150, 150);
              doc.text(`Página ${data.pageNumber}`, 105, 285, { align: 'center' });
          }
      });

      doc.save(`Reporte_Reserva_${oficio.replace(/\//g, '-')}.pdf`);
  };

  const downloadBatchPdf = async (batch: VacancyReservationBatch) => {
      setLoading(true);
      try {
          const { data, error } = await supabase
              .from('reserva_vacantes_detalles')
              .select('*')
              .eq('batch_id', batch.id)
              .order('student_name', { ascending: true });
          
          if (error) throw error;
          
          const students = (data as VacancyReservationDetail[]).map(d => ({
              code: d.student_code,
              name: d.student_name,
              carrera: d.carrera,
              admissionModality: d.admission_modality || '',
              gradeLevel: d.grade_level,
              startingSemester: d.starting_semester,
              found: true,
              alreadyReserved: false,
              multiIngreso: false
          }));
          
          generatePDFReport(batch.report_code, batch.expediente_number, students);
          if (notify) notify("PDF generado correctamente", "success");
      } catch (err: any) {
          if (notify) notify("Error al generar PDF: " + err.message, "error");
      } finally {
          setLoading(false);
      }
  };

  const downloadBatchExcel = async (batch: VacancyReservationBatch) => {
      setLoading(true);
      try {
          const { data, error } = await supabase
              .from('reserva_vacantes_detalles')
              .select('*')
              .eq('batch_id', batch.id)
              .order('student_name', { ascending: true });
          
          if (error) throw error;
          
          const exportData = data.map((d: any, index: number) => ({
              'Nº': index + 1,
              'CÓDIGO': d.student_code,
              'NOMBRE COMPLETO': d.student_name,
              'ESCUELA': d.carrera,
              'MODALIDAD': d.admission_modality,
              'COLEGIO': '',
              'AÑO SECUNDARIA': d.grade_level,
              'INICIO SEMESTRE': d.starting_semester,
              'ESTADO': d.is_withdrawn ? 'RENUNCIA' : 'ACTIVO'
          }));
          
          const worksheet = XLSX.utils.json_to_sheet(exportData);
          const workbook = XLSX.utils.book_new();
          XLSX.utils.book_append_sheet(workbook, worksheet, "Bloque");
          XLSX.writeFile(workbook, `Reporte_Reserva_Bloque_${batch.report_code.replace(/\//g, '-')}.xlsx`);
          
          if (notify) notify("Excel generado correctamente", "success");
      } catch (err: any) {
          if (notify) notify("Error al generar Excel: " + err.message, "error");
      } finally {
          setLoading(false);
      }
  };

  const handleOpenPreview = async (batch: VacancyReservationBatch) => {
      setHasPreviewChanges(false);
      setSelectedPreviewBatch(batch);
      setIsPreviewModalOpen(true);
      setLoadingPreview(true);
      try {
          const { data, error } = await supabase
              .from('reserva_vacantes_detalles')
              .select('*')
              .eq('batch_id', batch.id)
              .order('student_name', { ascending: true });
          
          if (error) throw error;
          setPreviewStudents(data as VacancyReservationDetail[]);
      } catch (err: any) {
          if (notify) notify("Error al cargar estudiantes: " + err.message, "error");
      } finally {
          setLoadingPreview(false);
      }
  };

  const handleSavePreviewChanges = async () => {
      setSavingPreview(true);
      try {
          for (const student of previewStudents) {
              const { error } = await supabase
                  .from('reserva_vacantes_detalles')
                  .update({
                      grade_level: student.grade_level,
                      starting_semester: student.starting_semester
                  })
                  .eq('id', student.id);
              if (error) throw error;
          }
          if (notify) notify("Cambios guardados correctamente", "success");
          setHasPreviewChanges(false);
          fetchGlobal(); // Update the main padron list too
      } catch (err: any) {
          if (notify) notify("Error al guardar cambios: " + err.message, "error");
      } finally {
          setSavingPreview(false);
      }
  };

  const downloadPadronExcel = () => {
      const exportData = filteredGlobal.map((d, index) => ({
          'Nº': index + 1,
          'CÓDIGO': d.student_code,
          'NOMBRE COMPLETO': d.student_name,
          'ESCUELA': d.carrera,
          'MODALIDAD': d.admission_modality,
          'COLEGIO': '',
          'AÑO SECUNDARIA': d.grade_level,
          'INICIO SEMESTRE': d.starting_semester,
          'INFORME/OFICIO': d.batch?.report_code || '',
          'EXPEDIENTE': d.batch?.expediente_number || '',
          'RESOLUCIÓN': d.batch?.resolution_number || 'PENDIENTE',
          'ESTADO': d.is_withdrawn ? 'RENUNCIA' : 'ACTIVO',
          'RES. RENUNCIA': d.withdrawal_resolution_number || ''
      }));
      
      const worksheet = XLSX.utils.json_to_sheet(exportData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Padron");
      XLSX.writeFile(workbook, `Padron_Reserva_Vacantes_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const updateResolution = async () => {
      if (!selectedBatchId || !resNum) return;
      setLoading(true);
      try {
          const { error } = await supabase.from('reserva_vacantes_bloques').update({
              resolution_number: resNum,
              resolution_date: resDate,
              resolution_pdf: resPdf,
              status: 'Finalizado'
          }).eq('id', selectedBatchId);
          if (error) throw error;
          if (notify) notify("Resolución registrada correctamente");
          setIsResUpdateModalOpen(false);
          fetchBatches();
      } catch (err: any) { alert(err.message); } finally { setLoading(false); }
  };

  const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      
      setUploadingPdf(true);
      try {
          const fileExt = file.name.split('.').pop();
          const fileName = `reserva_${Date.now()}.${fileExt}`;
          const filePath = `resoluciones_reservas/${fileName}`;

          const { error: uploadError } = await supabase.storage
              .from('documentos') 
              .upload(filePath, file);

          if (uploadError) throw uploadError;

          const { data: { publicUrl } } = supabase.storage
              .from('documentos')
              .getPublicUrl(filePath);

          setResPdf(publicUrl);
          if (notify) notify("PDF subido correctamente", "success");
      } catch (err: any) {
          console.error(err);
          if (notify) notify("Error al subir PDF: " + err.message, "error");
      } finally {
          setUploadingPdf(false);
      }
  };

  const uniqueModalities = Array.from(new Set(globalDetails.map(d => d.admission_modality).filter(Boolean))).sort();
  const uniqueSchools = Array.from(new Set(globalDetails.map(d => d.carrera).filter(Boolean))).sort();
  const uniqueSemesters = Array.from(new Set(globalDetails.map(d => d.starting_semester).filter(Boolean))).sort();

  const filteredGlobal = globalDetails.filter(d => {
      const matchesSearch = d.student_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                            d.student_code.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesModality = filterModality ? d.admission_modality === filterModality : true;
      const matchesSchool = filterSchool ? d.carrera === filterSchool : true;
      const matchesSemester = filterSemester ? d.starting_semester === filterSemester : true;
      
      return matchesSearch && matchesModality && matchesSchool && matchesSemester;
  });

  return (
    <div className="flex-1 w-full max-w-[1500px] mx-auto p-6 md:p-8 flex flex-col gap-6 h-full overflow-hidden">
      
      {isSaveBatchModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in zoom-in-95">
              <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-10">
                  <h3 className="font-black text-slate-900 uppercase tracking-tight text-xl mb-8">Confirmar Bloque</h3>
                  <div className="flex flex-col gap-5">
                      <label className="flex flex-col gap-1.5">
                          <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Informe / Oficio</span>
                          <input value={reportCode} onChange={e => setReportCode(e.target.value)} className="h-14 px-5 rounded-2xl border-2 border-slate-100 bg-slate-50 font-bold outline-none focus:border-primary transition-all" placeholder="Ej: INF-050-2024" />
                      </label>
                      <label className="flex flex-col gap-1.5">
                          <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Nº Expediente</span>
                          <input value={expedienteNum} onChange={e => setExpedienteNum(e.target.value)} className="h-14 px-5 rounded-2xl border-2 border-slate-100 bg-slate-50 font-bold outline-none focus:border-primary transition-all" placeholder="Ej: 224850" />
                      </label>
                  </div>
                  <div className="mt-10 flex gap-4">
                      <button onClick={() => setIsSaveBatchModalOpen(false)} className="flex-1 font-black text-slate-400 uppercase text-xs tracking-widest">Cancelar</button>
                      <button onClick={handleSaveBatch} disabled={loading || !reportCode || !expedienteNum} className="flex-[2] py-4 bg-primary text-white rounded-2xl font-black uppercase text-xs shadow-xl shadow-primary/30">
                          {loading ? 'PROCESANDO...' : `GUARDAR (${selectedForBatch.size})`}
                      </button>
                  </div>
              </div>
          </div>
      )}

      {isResUpdateModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in zoom-in-95">
              <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-10">
                  <h3 className="font-black text-slate-900 uppercase text-xl mb-8">Adjuntar Resolución</h3>
                  <div className="flex flex-col gap-5">
                      <label className="flex flex-col gap-1.5">
                          <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Nº Resolución</span>
                          <input value={resNum} onChange={e => setResNum(e.target.value)} className="h-14 px-5 rounded-2xl border-2 border-slate-100 bg-slate-50 font-bold focus:border-primary outline-none" placeholder="R-2024-..." />
                      </label>
                      <label className="flex flex-col gap-1.5">
                          <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Fecha</span>
                          <input type="date" value={resDate} onChange={e => setResDate(e.target.value)} className="h-14 px-5 rounded-2xl border-2 border-slate-100 bg-slate-50 font-bold focus:border-primary outline-none" />
                      </label>
                      <label className="flex flex-col gap-1.5">
                          <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Link Drive PDF</span>
                          <div className="flex gap-2">
                              <input value={resPdf} onChange={e => setResPdf(e.target.value)} className="flex-1 h-14 px-5 rounded-2xl border-2 border-slate-100 bg-slate-50 text-xs font-mono focus:border-primary outline-none" placeholder="https://drive.google.com/..." />
                              <input type="file" accept=".pdf" ref={pdfInputRef} className="hidden" onChange={handlePdfUpload} />
                              <button 
                                  type="button"
                                  onClick={() => pdfInputRef.current?.click()}
                                  disabled={uploadingPdf}
                                  className="h-14 px-4 bg-slate-900 text-white rounded-2xl flex items-center justify-center hover:bg-slate-800 transition-all disabled:opacity-50"
                              >
                                  <span className="material-symbols-outlined">{uploadingPdf ? 'sync' : 'upload_file'}</span>
                              </button>
                          </div>
                      </label>
                  </div>
                  <div className="mt-10 flex gap-4">
                      <button onClick={() => setIsResUpdateModalOpen(false)} className="flex-1 font-black text-slate-400 uppercase text-xs tracking-widest">Cerrar</button>
                      <button onClick={updateResolution} disabled={loading || !resNum} className="flex-[2] py-4 bg-green-600 text-white rounded-2xl font-black uppercase text-xs shadow-xl active:scale-95 transition-all">FINALIZAR TRÁMITE</button>
                  </div>
              </div>
          </div>
      )}

      {isResignationModalOpen && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in zoom-in-95">
              <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-10">
                  <div className="flex items-center gap-4 mb-8">
                      <div className="size-12 rounded-2xl bg-red-50 flex items-center justify-center">
                          <span className="material-symbols-outlined text-red-600">person_remove</span>
                      </div>
                      <div>
                          <h3 className="text-xl font-black text-slate-900">Registrar Renuncia</h3>
                          <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest">Anular reserva de vacante</p>
                      </div>
                  </div>

                  <div className="flex flex-col gap-5">
                      <label className="flex flex-col gap-1.5">
                          <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Nº Resolución de Renuncia</span>
                          <input value={withdrawnResNum} onChange={e => setWithdrawnResNum(e.target.value)} className="h-14 px-5 rounded-2xl border-2 border-slate-100 bg-slate-50 font-bold focus:border-red-500 outline-none" placeholder="R.U. Nro 0542-2024-UNSAAC" />
                      </label>
                      <label className="flex flex-col gap-1.5">
                          <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Fecha</span>
                          <input type="date" value={withdrawnResDate} onChange={e => setWithdrawnResDate(e.target.value)} className="h-14 px-5 rounded-2xl border-2 border-slate-100 bg-slate-50 font-bold focus:border-red-500 outline-none" />
                      </label>
                      <label className="flex flex-col gap-1.5">
                          <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Link PDF Renuncia</span>
                          <input value={withdrawnResPdf} onChange={e => setWithdrawnResPdf(e.target.value)} className="h-14 px-5 rounded-2xl border-2 border-slate-100 bg-slate-50 text-xs font-mono focus:border-red-500 outline-none" placeholder="https://drive.google.com/..." />
                      </label>
                  </div>

                  <div className="mt-10 flex gap-4">
                      <button onClick={() => setIsResignationModalOpen(false)} className="flex-1 font-black text-slate-400 uppercase text-xs tracking-widest">Cancelar</button>
                      <button onClick={handleResignation} disabled={loading || !withdrawnResNum} className="flex-[2] py-4 bg-red-600 text-white rounded-2xl font-black uppercase text-xs shadow-xl shadow-red-200 active:scale-95 transition-all">CONFIRMAR RENUNCIA</button>
                  </div>
              </div>
          </div>
      )}

      {isPreviewModalOpen && selectedPreviewBatch && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in zoom-in-95">
              <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl flex flex-col max-h-[90vh]">
                  <div className="px-8 py-6 border-b flex justify-between items-center bg-slate-50 shrink-0">
                      <div>
                          <h3 className="font-black text-slate-900 uppercase tracking-tight text-xl">Estudiantes del Bloque</h3>
                          <p className="text-sm font-bold text-primary mt-1">Oficio: {selectedPreviewBatch.report_code} | Exp: {selectedPreviewBatch.expediente_number}</p>
                      </div>
                      <div className="flex items-center gap-4">
                          {hasPreviewChanges && (
                              <button 
                                  onClick={handleSavePreviewChanges} 
                                  disabled={savingPreview}
                                  className="px-4 py-2 bg-primary text-white text-xs font-black uppercase rounded-xl shadow-lg shadow-primary/30 hover:scale-105 transition-all active:scale-95 disabled:opacity-50"
                              >
                                  {savingPreview ? 'GUARDANDO...' : 'GUARDAR CAMBIOS'}
                              </button>
                          )}
                          <button onClick={() => setIsPreviewModalOpen(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                              <span className="material-symbols-outlined text-2xl">close</span>
                          </button>
                      </div>
                  </div>
                  
                  <div className="flex-1 overflow-y-auto p-6 bg-slate-50/50">
                      {loadingPreview ? (
                          <div className="flex justify-center items-center h-40">
                              <span className="material-symbols-outlined text-4xl text-primary animate-spin">progress_activity</span>
                          </div>
                      ) : (
                          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                              <table className="w-full text-left">
                                  <thead className="bg-slate-50 border-b">
                                      <tr>
                                          <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase">Nº</th>
                                          <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase">Código</th>
                                          <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase">Nombre Completo</th>
                                          <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase">Escuela / Modalidad</th>
                                          <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase">Año Sec.</th>
                                          <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase">Inicio</th>
                                          <th className="px-4 py-3 text-[10px] font-black text-slate-500 uppercase">Estado</th>
                                      </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100">
                                      {previewStudents.map((student, idx) => (
                                          <tr key={student.id} className="hover:bg-slate-50">
                                              <td className="px-4 py-3 text-xs font-bold text-slate-500">{idx + 1}</td>
                                              <td className="px-4 py-3 text-xs font-mono font-bold text-slate-700">{student.student_code}</td>
                                              <td className="px-4 py-3 text-xs font-black uppercase text-slate-900">{student.student_name}</td>
                                              <td className="px-4 py-3">
                                                  <p className="text-[10px] font-bold text-slate-700 uppercase">{student.carrera}</p>
                                                  <p className="text-[9px] font-black text-indigo-500 uppercase">{student.admission_modality}</p>
                                              </td>
                                              <td className="px-4 py-3">
                                                  <input 
                                                      value={student.grade_level}
                                                      onChange={(e) => {
                                                          const newList = [...previewStudents];
                                                          newList[idx].grade_level = e.target.value;
                                                          setPreviewStudents(newList);
                                                          setHasPreviewChanges(true);
                                                      }}
                                                      className="w-20 px-2 py-1 text-[10px] font-bold text-slate-600 bg-slate-50 border border-slate-200 rounded outline-none focus:border-primary"
                                                  />
                                              </td>
                                              <td className="px-4 py-3">
                                                  <select
                                                      value={student.starting_semester}
                                                      onChange={(e) => {
                                                          const newList = [...previewStudents];
                                                          newList[idx].starting_semester = e.target.value;
                                                          setPreviewStudents(newList);
                                                          setHasPreviewChanges(true);
                                                      }}
                                                      className="px-2 py-1 text-[10px] font-black text-primary bg-primary/5 border border-primary/20 rounded outline-none focus:border-primary"
                                                  >
                                                      {semesterOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                                  </select>
                                              </td>
                                              <td className="px-4 py-3">
                                                  {student.is_withdrawn ? (
                                                      <span className="px-2 py-1 bg-red-50 text-red-600 text-[9px] font-black rounded uppercase border border-red-100">Renuncia</span>
                                                  ) : (
                                                      <span className="px-2 py-1 bg-green-50 text-green-600 text-[9px] font-black rounded uppercase border border-green-100">Activo</span>
                                                  )}
                                              </td>
                                          </tr>
                                      ))}
                                  </tbody>
                              </table>
                          </div>
                      )}
                  </div>
              </div>
          </div>
      )}

      <div className="flex flex-wrap justify-between items-end gap-4 shrink-0">
        <div className="flex flex-col gap-2">
            <h1 className="text-slate-900 text-3xl font-black leading-tight tracking-tight">Reserva de Vacante</h1>
            <p className="text-slate-500 text-sm font-medium">Detector inteligente de duplicados y gestión de aplazamiento.</p>
        </div>
        <div className="flex bg-slate-200 p-1 rounded-2xl shadow-inner">
            {['nueva', 'historial', 'padron'].map(tab => (
                <button key={tab} onClick={() => setActiveView(tab as any)} className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeView === tab ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                    {tab === 'nueva' ? 'Nuevo CSV' : tab === 'historial' ? 'Bloques' : 'Padrón Global'}
                </button>
            ))}
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
          {activeView === 'nueva' ? (
              <div className="flex flex-col gap-4 h-full">
                  <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex flex-col md:flex-row justify-between items-center gap-6">
                      <div className="flex items-center gap-5">
                          <div className="size-16 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center shrink-0 border border-indigo-100 shadow-sm"><span className="material-symbols-outlined text-4xl">upload_file</span></div>
                          <div>
                              <h3 className="font-black text-slate-800 uppercase text-sm tracking-tight">Procesar Listado Masivo</h3>
                              <p className="text-xs text-slate-500 font-medium">Formato: Código, Nombre, Grado (Secundaria)</p>
                          </div>
                      </div>
                      <div className="flex gap-3">
                          <input type="file" accept=".csv" ref={csvInputRef} className="hidden" onChange={handleCsvUpload}/>
                          {(user.role === 'Administrador' || (user.role === 'Operador' && user.permissions?.includes('upload_csv'))) && (
                            <>
                              <button onClick={() => csvInputRef.current?.click()} className="px-6 h-12 bg-white border-2 border-slate-100 text-slate-700 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-50 transition-all">SUBIR CSV</button>
                              {tempList.length > 0 && (
                                  <button onClick={generatePreviewPDFReport} className="px-6 h-12 bg-white border-2 border-slate-100 text-slate-700 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-50 transition-all">REPORTE PREVIO (PDF)</button>
                              )}
                              <button onClick={() => setIsSaveBatchModalOpen(true)} disabled={selectedForBatch.size === 0} className="px-8 h-12 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl disabled:opacity-50 transition-all active:scale-95">GENERAR BLOQUE ({selectedForBatch.size})</button>
                            </>
                          )}
                      </div>
                  </div>

                  {csvSummary && (
                      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 animate-in fade-in slide-in-from-top-4">
                          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col gap-1">
                              <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Total CSV</span>
                              <span className="text-xl font-black text-slate-900">{csvSummary.total}</span>
                          </div>
                          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col gap-1">
                              <span className="text-[9px] font-black text-green-500 uppercase tracking-widest">Encontrados</span>
                              <span className="text-xl font-black text-green-600">{csvSummary.found}</span>
                          </div>
                          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col gap-1">
                              <span className="text-[9px] font-black text-red-500 uppercase tracking-widest">No Encontrados</span>
                              <span className="text-xl font-black text-red-600">{csvSummary.notFound}</span>
                          </div>
                          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col gap-1">
                              <span className="text-[9px] font-black text-orange-500 uppercase tracking-widest">Duplicados</span>
                              <span className="text-xl font-black text-orange-600">{csvSummary.alreadyReserved}</span>
                          </div>
                          <div className="bg-indigo-600 p-4 rounded-2xl shadow-lg shadow-indigo-200 flex flex-col gap-1">
                              <span className="text-[9px] font-black text-indigo-100 uppercase tracking-widest">Aptos</span>
                              <span className="text-xl font-black text-white">{csvSummary.apt}</span>
                          </div>
                      </div>
                  )}

                  <div className="flex-1 bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
                      <div className="flex-1 overflow-auto">
                          <table className="w-full text-left border-collapse">
                              <thead className="sticky top-0 bg-slate-50 border-b border-slate-200 z-10 shadow-sm">
                                  <tr>
                                      <th className="px-6 py-4 w-12 text-center">Sel</th>
                                      <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Código</th>
                                      <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Estudiante</th>
                                      <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Modalidad</th>
                                      <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Estado / Alerta</th>
                                      <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right pr-10">Inicio</th>
                                  </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                  {tempList.length === 0 ? (
                                      <tr><td colSpan={6} className="py-24 text-center text-slate-400 italic font-black text-xs uppercase tracking-widest opacity-30">No hay datos procesados</td></tr>
                                  ) : (
                                      tempList.map((row, i) => (
                                          <tr key={i} className={`hover:bg-slate-50 transition-colors ${row.alreadyReserved ? 'bg-red-50/50' : ''}`}>
                                              <td className="px-6 py-4 text-center">
                                                  <input type="checkbox" disabled={!row.found} checked={selectedForBatch.has(i)} onChange={() => {
                                                      const next = new Set(selectedForBatch);
                                                      if (next.has(i)) next.delete(i); else next.add(i);
                                                      setSelectedForBatch(next);
                                                  }} className="size-5 accent-primary cursor-pointer"/>
                                              </td>
                                              <td className="px-6 py-4 font-mono text-xs font-bold text-slate-700">{row.code}</td>
                                              <td className="px-6 py-4">
                                                  <p className="font-black text-slate-800 text-xs uppercase">{row.name}</p>
                                                  {row.multiIngreso ? (
                                                       <div className="mt-1 flex flex-col gap-1">
                                                           <span className="text-[8px] font-black text-indigo-600 uppercase">Múltiple Ingreso Detectado:</span>
                                                           <select 
                                                               value={row.selectedOptionIndex} 
                                                               onChange={(e) => {
                                                                   const idx = parseInt(e.target.value);
                                                                   const option = row.allOptions![idx];
                                                                   const newList = [...tempList];
                                                                   newList[i] = {
                                                                       ...row,
                                                                       selectedOptionIndex: idx,
                                                                       carrera: option.CARRERA,
                                                                       admissionModality: option.MODALIDAD
                                                                   };
                                                                   setTempList(newList);
                                                               }}
                                                               className="text-[9px] font-bold uppercase bg-indigo-50 border border-indigo-100 rounded px-1 py-0.5 outline-none focus:border-indigo-300"
                                                           >
                                                               {row.allOptions?.map((opt, idx) => (
                                                                   <option key={idx} value={idx}>{opt.CARRERA} ({opt.MODALIDAD})</option>
                                                               ))}
                                                           </select>
                                                       </div>
                                                   ) : (
                                                       <p className="text-[9px] text-slate-400 font-bold uppercase truncate max-w-[200px]">{row.carrera}</p>
                                                   )}
                                              </td>
                                              <td className="px-6 py-4">
                                                  <span className="text-[9px] font-black text-indigo-600 uppercase bg-indigo-50 px-2 py-1 rounded-lg border border-indigo-100">{row.admissionModality || '-'}</span>
                                              </td>
                                              <td className="px-6 py-4">
                                                  {row.alreadyReserved ? (
                                                      <span className="inline-flex items-center gap-2 px-3 py-1 rounded-xl bg-red-600 text-white text-[9px] font-black uppercase shadow-lg shadow-red-200">
                                                           {row.prevResolution === 'PENDIENTE' ? 'TRÁMITE EN CURSO' : `YA RESERVADO: ${row.prevResolution}`}
                                                       </span>
                                                  ) : !row.found ? (
                                                      <span className="text-[9px] font-black text-red-400 uppercase tracking-widest flex items-center gap-1"><span className="material-symbols-outlined text-xs">warning</span> NO ENCONTRADO</span>
                                                  ) : (
                                                      <span className="text-[9px] font-black text-green-600 uppercase flex items-center gap-1"><span className="material-symbols-outlined text-xs">check_circle</span> APTO - {row.gradeLevel}</span>
                                                  )}
                                              </td>
                                              <td className="px-6 py-4 text-right pr-10">
                                                  <select
                                                      value={row.startingSemester}
                                                      onChange={(e) => {
                                                          const newList = [...tempList];
                                                          newList[i].startingSemester = e.target.value;
                                                          setTempList(newList);
                                                      }}
                                                      className="px-3 py-1.5 bg-primary text-white text-[9px] font-black rounded-lg shadow-lg shadow-primary/10 outline-none cursor-pointer"
                                                  >
                                                      {semesterOptions.map(opt => <option key={opt} value={opt} className="bg-white text-slate-800">{opt}</option>)}
                                                  </select>
                                              </td>
                                          </tr>
                                      ))
                                  )}
                              </tbody>
                          </table>
                      </div>
                  </div>
              </div>
          ) : activeView === 'historial' ? (
              <div className="h-full bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
                  <div className="flex-1 overflow-auto">
                      <table className="w-full text-left">
                          <thead className="bg-slate-50 border-b">
                              <tr>
                                  <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Documentación</th>
                                  <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Estado</th>
                                  <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest">Resolución</th>
                                  <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest text-right pr-10">Gestión</th>
                              </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                              {batches.map(b => (
                                  <tr key={b.id} className="hover:bg-slate-50 transition-colors">
                                      <td className="px-6 py-4">
                                          <p className="font-black text-slate-900 text-xs">{b.report_code}</p>
                                          <p className="text-[9px] font-bold text-slate-400 uppercase">EXP: {b.expediente_number}</p>
                                      </td>
                                      <td className="px-6 py-4">
                                          <span className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase border ${b.status === 'Finalizado' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-orange-50 text-orange-700 border-orange-200'}`}>{b.status}</span>
                                      </td>
                                      <td className="px-6 py-4">
                                          {b.resolution_number ? (
                                              <div className="text-[9px] font-black text-slate-800 uppercase">{b.resolution_number}<br/><span className="text-slate-400">{b.resolution_date}</span></div>
                                          ) : <p className="text-[9px] text-slate-300 italic font-bold">Sin resolución aún</p>}
                                      </td>
                                      <td className="px-6 py-4 text-right pr-10">
                                          <div className="relative inline-block text-left">
                                              <button 
                                                  onClick={(e) => { e.stopPropagation(); setActiveMenuId(activeMenuId === b.id ? null : b.id); }}
                                                  className="size-8 rounded-full hover:bg-slate-100 text-slate-400 flex items-center justify-center transition-colors ml-auto"
                                                  title="Opciones"
                                              >
                                                  <span className="material-symbols-outlined text-lg">more_vert</span>
                                              </button>
                                              {activeMenuId === b.id && (
                                                  <div className="absolute right-0 top-full mt-1 w-48 bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden z-50 animate-in fade-in slide-in-from-top-2">
                                                      <button onClick={(e) => { e.stopPropagation(); handleOpenPreview(b); setActiveMenuId(null); }} className="w-full text-left px-4 py-3 text-xs font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-3 transition-colors">
                                                          <span className="material-symbols-outlined text-[18px] text-blue-500">visibility</span> Ver Estudiantes
                                                      </button>
                                                      <button onClick={(e) => { e.stopPropagation(); downloadBatchPdf(b); setActiveMenuId(null); }} className="w-full text-left px-4 py-3 text-xs font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-3 transition-colors">
                                                          <span className="material-symbols-outlined text-[18px] text-indigo-500">picture_as_pdf</span> PDF Reporte
                                                      </button>
                                                      <button onClick={(e) => { e.stopPropagation(); downloadBatchExcel(b); setActiveMenuId(null); }} className="w-full text-left px-4 py-3 text-xs font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-3 transition-colors">
                                                          <span className="material-symbols-outlined text-[18px] text-emerald-500">table_view</span> Excel
                                                      </button>
                                                      {user.role === 'Administrador' && (
                                                          <button onClick={(e) => { e.stopPropagation(); setSelectedBatchId(b.id); setResNum(b.resolution_number || ''); setResDate(b.resolution_date || ''); setResPdf(b.resolution_pdf || ''); setIsResUpdateModalOpen(true); setActiveMenuId(null); }} className="w-full text-left px-4 py-3 text-xs font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-3 transition-colors border-t border-slate-50">
                                                              <span className="material-symbols-outlined text-[18px] text-slate-500">edit_document</span> Editar Res.
                                                          </button>
                                                      )}
                                                      {b.resolution_pdf && (
                                                          <button onClick={(e) => { e.stopPropagation(); window.open(b.resolution_pdf, '_blank'); setActiveMenuId(null); }} className="w-full text-left px-4 py-3 text-xs font-bold text-red-600 hover:bg-red-50 flex items-center gap-3 transition-colors border-t border-slate-50">
                                                              <span className="material-symbols-outlined text-[18px]">open_in_new</span> Ver Resolución
                                                          </button>
                                                      )}
                                                  </div>
                                              )}
                                          </div>
                                      </td>
                                  </tr>
                              ))}
                          </tbody>
                      </table>
                  </div>
              </div>
          ) : (
              <div className="h-full bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
                  <div className="p-6 border-b border-slate-100 flex flex-col gap-4">
                      <div className="flex justify-between items-center gap-4">
                          <div className="relative flex-1 max-w-md">
                              <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">search</span>
                              <input 
                                  type="text" 
                                  placeholder="Buscar por nombre o código..." 
                                  value={searchQuery}
                                  onChange={e => setSearchQuery(e.target.value)}
                                  className="w-full h-12 pl-12 pr-5 rounded-2xl border-2 border-slate-100 bg-slate-50 font-bold outline-none focus:border-primary transition-all text-sm"
                              />
                          </div>
                          <div className="flex items-center gap-4">
                              <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                  Total: {filteredGlobal.length} registros
                              </div>
                              <button onClick={downloadPadronExcel} className="flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-600 rounded-xl text-xs font-black uppercase hover:bg-emerald-100 transition-colors border border-emerald-200">
                                  <span className="material-symbols-outlined text-[16px]">table_view</span>
                                  Exportar Excel
                              </button>
                          </div>
                      </div>
                      <div className="flex flex-wrap gap-4">
                          <select value={filterModality} onChange={e => setFilterModality(e.target.value)} className="h-10 px-4 rounded-xl border-2 border-slate-100 bg-slate-50 text-xs font-bold text-slate-600 outline-none focus:border-primary">
                              <option value="">Todas las Modalidades</option>
                              {uniqueModalities.map(m => <option key={m} value={m}>{m}</option>)}
                          </select>
                          <select value={filterSchool} onChange={e => setFilterSchool(e.target.value)} className="h-10 px-4 rounded-xl border-2 border-slate-100 bg-slate-50 text-xs font-bold text-slate-600 outline-none focus:border-primary">
                              <option value="">Todas las Escuelas</option>
                              {uniqueSchools.map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                          <select value={filterSemester} onChange={e => setFilterSemester(e.target.value)} className="h-10 px-4 rounded-xl border-2 border-slate-100 bg-slate-50 text-xs font-bold text-slate-600 outline-none focus:border-primary">
                              <option value="">Todos los Inicios</option>
                              {uniqueSemesters.map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                      </div>
                  </div>
                  <div className="flex-1 overflow-auto">
                      <table className="w-full text-left">
                          <thead className="bg-slate-50 border-b">
                              <tr>
                                  <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase">Ingresante</th>
                                  <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase">Escuela / Modalidad</th>
                                  <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase">Inicio Est.</th>
                                  <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase">Resolución</th>
                                  <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase text-right pr-10">Acciones</th>
                              </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                              {filteredGlobal.map(d => (
                                  <tr key={d.id} className={`hover:bg-slate-50 transition-colors ${d.is_withdrawn ? 'bg-red-50/30' : ''}`}>
                                      <td className="px-6 py-4">
                                          <p className="text-xs font-black uppercase text-slate-900">{d.student_name}</p>
                                          <p className="text-[9px] text-slate-400 font-mono font-bold">{d.student_code}</p>
                                      </td>
                                      <td className="px-6 py-4">
                                          <p className="text-[10px] font-bold text-slate-700 uppercase">{d.carrera}</p>
                                          <p className="text-[9px] font-black text-indigo-500 uppercase">{d.admission_modality}</p>
                                      </td>
                                      <td className="px-6 py-4">
                                          <span className="px-2 py-1 bg-primary/5 text-primary text-[10px] font-black rounded-lg">{d.starting_semester}</span>
                                      </td>
                                      <td className="px-6 py-4">
                                          {d.is_withdrawn ? (
                                              <div className="flex flex-col">
                                                  <span className="text-[10px] font-black text-slate-400 line-through uppercase">{d.batch?.resolution_number}</span>
                                                  <span className="text-[8px] font-bold text-red-500 uppercase">ANULADA POR RENUNCIA</span>
                                              </div>
                                          ) : d.batch?.resolution_number ? (
                                              d.batch.resolution_pdf ? (
                                                  <a href={d.batch.resolution_pdf} target="_blank" rel="noopener noreferrer" className="text-[10px] font-black text-indigo-600 hover:text-indigo-800 uppercase bg-indigo-50 hover:bg-indigo-100 px-2 py-1 rounded-lg border border-indigo-200 transition-colors inline-flex items-center gap-1">
                                                      {d.batch.resolution_number}
                                                      <span className="material-symbols-outlined text-[10px]">open_in_new</span>
                                                  </a>
                                              ) : (
                                                  <span className="text-[10px] font-black text-slate-800 uppercase bg-slate-100 px-2 py-1 rounded-lg border border-slate-200">{d.batch.resolution_number}</span>
                                              )
                                          ) : (
                                              <span className="text-[9px] font-black text-orange-600 uppercase bg-orange-50 px-2 py-1 rounded-lg border border-orange-100 animate-pulse">PENDIENTE</span>
                                          )}
                                      </td>
                                      <td className="px-6 py-4 text-right pr-10">
                                          <div className="flex justify-end gap-2 items-center">
                                              {d.is_withdrawn ? (
                                                  <div className="flex flex-col items-end">
                                                      <span className="px-2 py-1 bg-red-600 text-white text-[8px] font-black rounded uppercase shadow-sm">RENUNCIA REGISTRADA</span>
                                                      <span className="text-[7px] font-bold text-slate-400 mt-0.5">RES: {d.withdrawal_resolution_number}</span>
                                                  </div>
                                              ) : (
                                                  <>
                                                      <span className="text-[8px] font-bold text-slate-300 uppercase tracking-tighter mr-2">{d.batch?.report_code}</span>
                                                      {d.batch?.status === 'Finalizado' && user.role === 'Administrador' && (
                                                          <button 
                                                              onClick={() => {
                                                                  setSelectedDetailId(d.id);
                                                                  setIsResignationModalOpen(true);
                                                              }}
                                                              className="p-1.5 bg-slate-100 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors group relative"
                                                              title="Registrar Renuncia"
                                                          >
                                                              <span className="material-symbols-outlined text-sm">person_remove</span>
                                                          </button>
                                                      )}
                                                  </>
                                              )}
                                          </div>
                                      </td>
                                  </tr>
                              ))}
                          </tbody>
                      </table>
                  </div>
              </div>
          )}
      </div>
    </div>
  );
};
