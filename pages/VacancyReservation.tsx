
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
    semestre_ingreso?: string;
    gradeLevel: string;
    admissionModality: string;
    multiIngreso: boolean;
    allOptions?: Participant[];
    selectedOptionIndex?: number;
    observation?: string;
}

export interface ParsedResolution {
    originalNumber: string;
    originalDate: string;
    originalPdf: string;
    modNumber: string;
    modDate: string;
    modPdf: string;
    isModified: boolean;
    displayNumber: string;
}

export const parseBatchResolution = (batch?: VacancyReservationBatch | null): ParsedResolution => {
    if (!batch || !batch.resolution_number) {
        return {
            originalNumber: '',
            originalDate: '',
            originalPdf: '',
            modNumber: '',
            modDate: '',
            modPdf: '',
            isModified: false,
            displayNumber: 'PENDIENTE'
        };
    }

    const rawNum = batch.resolution_number || '';
    const numParts = rawNum.split(/\s*\|\|\s*|\s*\|\s*MODIF:\s*|\s*\[MODIF:\s*/i);
    const originalNumber = numParts[0]?.trim() || '';
    let modNumber = numParts[1]?.replace(/\]$/, '').replace(/^MODIF:\s*/i, '').trim() || '';

    if (!modNumber && rawNum.toUpperCase().includes('MODIF')) {
        const match = rawNum.match(/MODIF(?:ICADA\s+POR)?[:\s]+(.+)/i);
        if (match) modNumber = match[1].trim();
    }

    const rawDate = batch.resolution_date || '';
    const dateParts = rawDate.split(/\s*\|\|\s*/);
    const originalDate = dateParts[0]?.trim() || '';
    const modDate = dateParts[1]?.trim() || '';

    const rawPdf = batch.resolution_pdf || '';
    const pdfParts = rawPdf.split(/\s*\|\|\s*/);
    const originalPdf = pdfParts[0]?.trim() || '';
    const modPdf = pdfParts[1]?.trim() || '';

    return {
        originalNumber,
        originalDate,
        originalPdf,
        modNumber,
        modDate,
        modPdf,
        isModified: !!modNumber,
        displayNumber: originalNumber
    };
};

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

  // Preview & Batch Students Edit Modal
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);
  const [selectedPreviewBatch, setSelectedPreviewBatch] = useState<VacancyReservationBatch | null>(null);
  const [previewStudents, setPreviewStudents] = useState<VacancyReservationDetail[]>([]);
  const [initialPreviewStudents, setInitialPreviewStudents] = useState<VacancyReservationDetail[]>([]);
  const [deletedStudentIds, setDeletedStudentIds] = useState<string[]>([]);
  const [isEditingBatchStudents, setIsEditingBatchStudents] = useState(false);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [hasPreviewChanges, setHasPreviewChanges] = useState(false);
  const [savingPreview, setSavingPreview] = useState(false);
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const [confirmDeleteStudent, setConfirmDeleteStudent] = useState<VacancyReservationDetail | null>(null);

  // 2nd Resolution Modification Modal (For Finalized batches)
  const [isModResolutionModalOpen, setIsModResolutionModalOpen] = useState(false);
  const [modResNum, setModResNum] = useState('');
  const [modResDate, setModResDate] = useState('');
  const [modResPdf, setModResPdf] = useState('');
  const [uploadingModPdf, setUploadingModPdf] = useState(false);

  const csvInputRef = useRef<HTMLInputElement>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const modPdfInputRef = useRef<HTMLInputElement>(null);

  const currentYear = new Date().getFullYear();
  const semesterOptions = [
      `${currentYear - 1}-I`, // Ej: 2025-I
      `${currentYear}-I`,     // Ej: 2026-I
      `${currentYear + 1}-I`,
      `${currentYear + 2}-I`,
      `${currentYear + 3}-I`,
      `${currentYear + 4}-I`,
      `${currentYear + 5}-I`,
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
    if (data) {
        const codes = data.map((d: any) => d.student_code);
        const { data: partData } = await supabase.from('participantes').select('CODPOSTULANTE, SEMESTRE').in('CODPOSTULANTE', codes);
        const enhancedData = data.map((d: any) => {
            const part = partData?.find((p: any) => String(p.CODPOSTULANTE).trim() === String(d.student_code).trim());
            return {
                ...d,
                semestre_ingreso: part ? part.SEMESTRE : ''
            };
        });
        setGlobalDetails(enhancedData as any);
    }
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
        const { data: existingReservations } = await supabase.from('reserva_vacantes_detalles').select('student_code, is_withdrawn, carrera, admission_modality, batch:reserva_vacantes_bloques(resolution_number)').in('student_code', codes);

        const mapped = raw.map(item => {
            const matches = dbMatches?.filter(m => String(m.CODPOSTULANTE).trim() === String(item.code).trim()) || [];
            const match = matches[0];
            const studentReservations = existingReservations?.filter(r => String(r.student_code).trim() === String(item.code).trim() && !r.is_withdrawn) || [];
            const prevRes = studentReservations[0];
            
            let obs = '';
            if (matches.length > 1) {
                const multiTexts = matches.map(m => {
                    const r = studentReservations.find(res => res.carrera === m.CARRERA);
                    if (r) {
                        const resNum = (r.batch as any)?.resolution_number || 'TRÁMITE';
                        return `• ${m.CARRERA} (${m.MODALIDAD}) -> RESERVADO: ${resNum}`;
                    }
                    return `• ${m.CARRERA} (${m.MODALIDAD})`;
                });
                obs = `MÚLTIPLES INGRESOS:\n${multiTexts.join('\n')}`;
            } else if (prevRes) {
                const resNum = (prevRes.batch as any)?.resolution_number || 'TRÁMITE';
                obs = `RESERVADO: ${resNum} / ${prevRes.carrera} (${prevRes.admission_modality})`;
            }

            return {
                code: item.code,
                name: match ? match.NOMBRE : item.name,
                found: matches.length > 0,
                alreadyReserved: !!prevRes,
                prevResolution: prevRes ? (prevRes.batch as any)?.resolution_number || 'PENDIENTE' : undefined,
                carrera: match ? match.CARRERA : 'NO ENCONTRADO',
                admissionModality: match ? match.MODALIDAD : '',
                gradeLevel: item.grade,
                startingSemester: calculateStartingSemester(item.grade),
                semestre_ingreso: match ? match.SEMESTRE : '',
                multiIngreso: matches.length > 1,
                allOptions: matches,
                selectedOptionIndex: matches.length > 0 ? 0 : undefined,
                observation: obs
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
          fetchBatches();
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
          let estado = s.found ? (s.alreadyReserved ? `YA RESERVADO` : 'APTO') : 'NO ENCONTRADO';
          let observaciones = s.observation || '-';
          return [
              index + 1,
              s.code,
              s.name,
              s.carrera,
              s.admissionModality,
              s.gradeLevel,
              observaciones,
              estado
          ];
      });

      autoTable(doc, {
          startY: 35,
          head: [['Nº', 'CÓDIGO', 'NOMBRE COMPLETO', 'ESCUELA', 'MODALIDAD', 'AÑO SEC.', 'OBSERVACIONES', 'ESTADO']],
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
          columnStyles: {
              0: { cellWidth: 10, halign: 'center' },
              1: { cellWidth: 18 },
              2: { cellWidth: 40 },
              3: { cellWidth: 45 },
              4: { cellWidth: 25 },
              5: { cellWidth: 15 },
              6: { cellWidth: 'auto' },
              7: { cellWidth: 20 }
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
          orientation: 'landscape',
          unit: 'mm',
          format: 'a4'
      });

      const unsaacRed: [number, number, number] = [165, 29, 45]; // #A51D2D

      // Header Title
      doc.setFontSize(16);
      doc.setTextColor(unsaacRed[0], unsaacRed[1], unsaacRed[2]);
      doc.setFont('helvetica', 'bold');
      doc.text('UNSAAC - DIRECCIÓN DE ADMISIÓN', 148, 15, { align: 'center' });
      
      doc.setFontSize(10);
      doc.setTextColor(60, 60, 60);
      doc.setFont('helvetica', 'normal');
      doc.text('RESERVA DE VACANTE', 148, 22, { align: 'center' });

      // Horizontal Line
      doc.setDrawColor(unsaacRed[0], unsaacRed[1], unsaacRed[2]);
      doc.setLineWidth(0.5);
      doc.line(20, 26, 277, 26);

      // Batch Info
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(0, 0, 0);
      doc.text(`OFICIO Nº ${oficio}`, 20, 35);
      
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 100, 100);
      doc.text(`Expediente: ${expediente}`, 277, 35, { align: 'right' });

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
          s.startingSemester,
          s.observation || '-'
      ]);

      autoTable(doc, {
          startY: 50,
          head: [['Nº', 'CÓDIGO', 'NOMBRE COMPLETO', 'ESCUELA / MODALIDAD', 'AÑO SEC.', 'SEMESTRE', 'OBSERVACIONES']],
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
              0: { cellWidth: 15, halign: 'center' },
              1: { cellWidth: 25 },
              2: { cellWidth: 50, fontStyle: 'bold' },
              3: { cellWidth: 65 },
              4: { cellWidth: 20 },
              5: { cellWidth: 20, fontStyle: 'bold', textColor: unsaacRed },
              6: { cellWidth: 'auto' }
          },
          didDrawPage: (data) => {
              doc.setFontSize(8);
              doc.setTextColor(150, 150, 150);
              doc.text(`Página ${data.pageNumber}`, 148, 195, { align: 'center' });
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
          
          const students = (data as VacancyReservationDetail[]).map(d => {
              const prevRes = globalDetails.find(gd => gd.student_code === d.student_code && gd.batch_id !== batch.id && !gd.is_withdrawn);
              let obs = '';
              if (prevRes) {
                  const resNum = (prevRes.batch as any)?.resolution_number || 'TRÁMITE';
                  obs = `RES: ${resNum} / ${prevRes.carrera} (${prevRes.admission_modality})`;
              }
              return {
                  code: d.student_code,
                  name: d.student_name,
                  carrera: d.carrera,
                  admissionModality: d.admission_modality || '',
                  gradeLevel: d.grade_level || 'QUINTO',
                  startingSemester: d.starting_semester,
                  found: true,
                  alreadyReserved: !!prevRes,
                  multiIngreso: false,
                  observation: obs
              };
          });
          
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

          const codes = data.map((d: any) => d.student_code);
          const { data: partData } = await supabase.from('participantes').select('CODPOSTULANTE, SEMESTRE').in('CODPOSTULANTE', codes);
          
          const exportData = data.map((d: any, index: number) => {
              const part = partData?.find((p: any) => String(p.CODPOSTULANTE).trim() === String(d.student_code).trim());
              return {
                  'Nº': index + 1,
                  'CÓDIGO': d.student_code,
                  'NOMBRE COMPLETO': d.student_name,
                  'ESCUELA': d.carrera,
                  'MODALIDAD': d.admission_modality,
                  'SEMESTRE INGRESO': part ? part.SEMESTRE : '',
                  'AÑO SECUNDARIA': d.grade_level,
                  'INICIO SEMESTRE': d.starting_semester,
                  'ESTADO': d.is_withdrawn ? 'RENUNCIA' : 'ACTIVO'
              };
          });
          
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

  // Open Preview and Load Details + Career options + Admission history
  const handleOpenPreview = async (batch: VacancyReservationBatch) => {
      setHasPreviewChanges(false);
      setIsEditingBatchStudents(false);
      setDeletedStudentIds([]);
      setSelectedPreviewBatch(batch);
      setIsPreviewModalOpen(true);
      setLoadingPreview(true);
      try {
          const { data: detailsData, error: detailsError } = await supabase
              .from('reserva_vacantes_detalles')
              .select('*')
              .eq('batch_id', batch.id)
              .order('student_name', { ascending: true });
          
          if (detailsError) throw detailsError;
          
          const details = (detailsData || []) as VacancyReservationDetail[];
          const codes = details.map(d => d.student_code);
          
          let partData: Participant[] = [];
          if (codes.length > 0) {
              const { data: pData } = await supabase.from('participantes').select('*').in('CODPOSTULANTE', codes);
              partData = pData || [];
          }

          const enhancedStudents: VacancyReservationDetail[] = details.map(d => {
              const options = partData.filter(p => String(p.CODPOSTULANTE).trim() === String(d.student_code).trim());
              return {
                  ...d,
                  admission_options: options
              };
          });

          setPreviewStudents(enhancedStudents);
          setInitialPreviewStudents(JSON.parse(JSON.stringify(enhancedStudents)));
      } catch (err: any) {
          if (notify) notify("Error al cargar estudiantes: " + err.message, "error");
      } finally {
          setLoadingPreview(false);
      }
  };

  // Trigger Save from Preview Modal
  const handleRequestSavePreviewChanges = () => {
      if (!selectedPreviewBatch) return;

      if (selectedPreviewBatch.status === 'Finalizado') {
          // Open 2nd Resolution Modification Modal
          const parsed = parseBatchResolution(selectedPreviewBatch);
          setModResNum(parsed.modNumber || '');
          setModResDate(parsed.modDate || new Date().toISOString().split('T')[0]);
          setModResPdf(parsed.modPdf || '');
          setIsModResolutionModalOpen(true);
      } else {
          // Batch is in 'Tramite' -> Save directly
          handleExecuteSaveTramite();
      }
  };

  // Direct Save for Tramite
  const handleExecuteSaveTramite = async () => {
      if (!selectedPreviewBatch) return;
      setSavingPreview(true);
      try {
          // 1. Delete removed students
          if (deletedStudentIds.length > 0) {
              const { error: delError } = await supabase
                  .from('reserva_vacantes_detalles')
                  .delete()
                  .in('id', deletedStudentIds);
              if (delError) throw delError;
          }

          // 2. Update remaining students
          for (const student of previewStudents) {
              const { error } = await supabase
                  .from('reserva_vacantes_detalles')
                  .update({
                      carrera: student.carrera,
                      admission_modality: student.admission_modality,
                      grade_level: student.grade_level,
                      starting_semester: student.starting_semester
                  })
                  .eq('id', student.id);
              if (error) throw error;
          }

          if (notify) notify("Estudiantes y cambios del bloque en trámite actualizados correctamente", "success");
          setHasPreviewChanges(false);
          setDeletedStudentIds([]);
          setIsEditingBatchStudents(false);
          setInitialPreviewStudents(JSON.parse(JSON.stringify(previewStudents)));
          fetchBatches();
          fetchGlobal();
      } catch (err: any) {
          if (notify) notify("Error al guardar cambios: " + err.message, "error");
      } finally {
          setSavingPreview(false);
      }
  };

  // Save for Finalizado with 2nd Resolution
  const handleExecuteSaveFinalizado = async () => {
      if (!selectedPreviewBatch) return;
      if (!modResNum.trim()) {
          if (notify) notify("Debe ingresar el número de la 2da resolución modificatoria", "warning");
          return;
      }

      setSavingPreview(true);
      try {
          // 1. Delete removed students
          if (deletedStudentIds.length > 0) {
              const { error: delError } = await supabase
                  .from('reserva_vacantes_detalles')
                  .delete()
                  .in('id', deletedStudentIds);
              if (delError) throw delError;
          }

          // 2. Update remaining students
          for (const student of previewStudents) {
              const { error } = await supabase
                  .from('reserva_vacantes_detalles')
                  .update({
                      carrera: student.carrera,
                      admission_modality: student.admission_modality,
                      grade_level: student.grade_level,
                      starting_semester: student.starting_semester
                  })
                  .eq('id', student.id);
              if (error) throw error;
          }

          // 3. Update Batch with 2nd Resolution
          const parsed = parseBatchResolution(selectedPreviewBatch);
          const origNum = parsed.originalNumber || selectedPreviewBatch.resolution_number || 'S/N';
          const origDate = parsed.originalDate || selectedPreviewBatch.resolution_date || '';
          const origPdf = parsed.originalPdf || selectedPreviewBatch.resolution_pdf || '';

          const combinedNum = `${origNum} || MODIF: ${modResNum.trim()}`;
          const combinedDate = `${origDate} || ${modResDate.trim()}`;
          const combinedPdf = `${origPdf} || ${modResPdf.trim()}`;

          const { error: batchUpdateError } = await supabase
              .from('reserva_vacantes_bloques')
              .update({
                  resolution_number: combinedNum,
                  resolution_date: combinedDate,
                  resolution_pdf: combinedPdf,
                  status: 'Finalizado'
              })
              .eq('id', selectedPreviewBatch.id);

          if (batchUpdateError) throw batchUpdateError;

          // Update local state
          const updatedBatch: VacancyReservationBatch = {
              ...selectedPreviewBatch,
              resolution_number: combinedNum,
              resolution_date: combinedDate,
              resolution_pdf: combinedPdf
          };
          setSelectedPreviewBatch(updatedBatch);

          if (notify) notify(`Bloque actualizado y 2da Resolución ${modResNum.trim()} registrada con éxito`, "success");
          
          setIsModResolutionModalOpen(false);
          setHasPreviewChanges(false);
          setDeletedStudentIds([]);
          setIsEditingBatchStudents(false);
          setInitialPreviewStudents(JSON.parse(JSON.stringify(previewStudents)));
          fetchBatches();
          fetchGlobal();
      } catch (err: any) {
          if (notify) notify("Error al guardar modificación: " + err.message, "error");
      } finally {
          setSavingPreview(false);
      }
  };

  // Cancel edit in preview modal
  const handleCancelPreviewEdit = () => {
      setPreviewStudents(JSON.parse(JSON.stringify(initialPreviewStudents)));
      setDeletedStudentIds([]);
      setHasPreviewChanges(false);
      setIsEditingBatchStudents(false);
  };

  // Remove student from preview modal
  const handleConfirmDeleteStudent = () => {
      if (!confirmDeleteStudent) return;
      const idToDelete = confirmDeleteStudent.id;
      setDeletedStudentIds(prev => [...prev, idToDelete]);
      setPreviewStudents(prev => prev.filter(s => s.id !== idToDelete));
      setHasPreviewChanges(true);
      setConfirmDeleteStudent(null);
      if (notify) notify(`Estudiante ${confirmDeleteStudent.student_name} marcado para eliminar del bloque`, 'info');
  };

  const downloadPadronExcel = () => {
      const exportData = filteredGlobal.map((d, index) => {
          const parsed = parseBatchResolution(d.batch);
          return {
              'Nº': index + 1,
              'CÓDIGO': d.student_code,
              'NOMBRE COMPLETO': d.student_name,
              'ESCUELA': d.carrera,
              'MODALIDAD': d.admission_modality,
              'SEMESTRE INGRESO': d.semestre_ingreso || '',
              'AÑO SECUNDARIA': d.grade_level,
              'INICIO SEMESTRE': d.starting_semester,
              'INFORME/OFICIO': d.batch?.report_code || '',
              'EXPEDIENTE': d.batch?.expediente_number || '',
              'RESOLUCIÓN': parsed.originalNumber || d.batch?.resolution_number || 'PENDIENTE',
              '2DA RESOLUCIÓN MODIF': parsed.modNumber || '',
              'ESTADO': d.is_withdrawn ? 'RENUNCIA' : 'ACTIVO',
              'RES. RENUNCIA': d.withdrawal_resolution_number || ''
          };
      });
      
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
          if (notify) notify("Resolución registrada correctamente", "success");
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

  const handleModPdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      
      setUploadingModPdf(true);
      try {
          const fileExt = file.name.split('.').pop();
          const fileName = `reserva_modif_${Date.now()}.${fileExt}`;
          const filePath = `resoluciones_reservas/${fileName}`;

          const { error: uploadError } = await supabase.storage
              .from('documentos') 
              .upload(filePath, file);

          if (uploadError) throw uploadError;

          const { data: { publicUrl } } = supabase.storage
              .from('documentos')
              .getPublicUrl(filePath);

          setModResPdf(publicUrl);
          if (notify) notify("PDF de 2da resolución modificatoria subido correctamente", "success");
      } catch (err: any) {
          console.error(err);
          if (notify) notify("Error al subir PDF: " + err.message, "error");
      } finally {
          setUploadingModPdf(false);
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
      
      {/* Modal Guardar Nuevo Bloque */}
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

      {/* Modal Adjuntar / Editar Resolución Original */}
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
                          <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Link Drive / PDF</span>
                          <div className="flex gap-2">
                              <input value={resPdf} onChange={e => setResPdf(e.target.value)} className="flex-1 h-14 px-5 rounded-2xl border-2 border-slate-100 bg-slate-50 text-xs font-mono focus:border-primary outline-none" placeholder="https://drive.google.com/..." />
                              <input type="file" accept=".pdf" ref={pdfInputRef} className="hidden" onChange={handlePdfUpload} />
                              <button 
                                  type="button"
                                  onClick={() => pdfInputRef.current?.click()}
                                  disabled={uploadingPdf}
                                  className="h-14 px-4 bg-slate-900 text-white rounded-2xl flex items-center justify-center hover:bg-slate-800 transition-all disabled:opacity-50"
                                  title="Subir archivo PDF"
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

      {/* Modal Registrar Renuncia */}
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

      {/* Modal Confirmación de Eliminación de Estudiante */}
      {confirmDeleteStudent && (
          <div className="fixed inset-0 z-[140] flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm animate-in zoom-in-95">
              <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-8 border border-slate-100">
                  <div className="flex items-center gap-4 mb-6">
                      <div className="size-12 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center shrink-0 border border-red-100">
                          <span className="material-symbols-outlined text-2xl">delete_forever</span>
                      </div>
                      <div>
                          <h3 className="font-black text-slate-900 text-lg">¿Eliminar estudiante?</h3>
                          <p className="text-xs text-slate-500 font-medium">Se removerá del listado de este bloque de reserva.</p>
                      </div>
                  </div>
                  
                  <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 mb-6 flex flex-col gap-1">
                      <span className="text-[10px] font-black uppercase text-slate-400">Estudiante a eliminar:</span>
                      <span className="font-black text-slate-800 text-sm">{confirmDeleteStudent.student_name}</span>
                      <span className="font-mono text-xs font-bold text-slate-500">CÓD: {confirmDeleteStudent.student_code}</span>
                      <span className="text-xs text-indigo-600 font-bold uppercase">{confirmDeleteStudent.carrera}</span>
                  </div>

                  <div className="flex gap-3">
                      <button onClick={() => setConfirmDeleteStudent(null)} className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-black text-xs uppercase transition-all">
                          Cancelar
                      </button>
                      <button onClick={handleConfirmDeleteStudent} className="flex-1 py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl font-black text-xs uppercase shadow-lg shadow-red-200 transition-all">
                          Sí, Eliminar
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* Modal 2da Resolución Modificatoria (Al guardar bloque Finalizado) */}
      {isModResolutionModalOpen && selectedPreviewBatch && (
          <div className="fixed inset-0 z-[130] flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm animate-in zoom-in-95">
              <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg p-8 md:p-10 border border-slate-100">
                  <div className="flex items-center gap-4 mb-6">
                      <div className="size-14 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0 border border-amber-100 shadow-sm">
                          <span className="material-symbols-outlined text-3xl">history_edu</span>
                      </div>
                      <div>
                          <h3 className="font-black text-slate-900 text-lg uppercase tracking-tight">2da Resolución Modificatoria</h3>
                          <p className="text-xs text-slate-500 font-medium">Requerida para guardar modificaciones en bloques finalizados.</p>
                      </div>
                  </div>

                  {(() => {
                      const parsed = parseBatchResolution(selectedPreviewBatch);
                      return (
                          <div className="mb-6 p-4 bg-slate-50 rounded-2xl border border-slate-200 flex flex-col gap-1">
                              <span className="text-[9px] font-black uppercase tracking-wider text-slate-400">Resolución Original del Bloque:</span>
                              <span className="font-black text-slate-800 text-xs uppercase">{parsed.originalNumber || selectedPreviewBatch.resolution_number}</span>
                              {parsed.originalDate && <span className="text-[10px] text-slate-500 font-medium">Fecha: {parsed.originalDate}</span>}
                          </div>
                      );
                  })()}

                  <div className="flex flex-col gap-4">
                      <label className="flex flex-col gap-1.5">
                          <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest ml-1">Nº Resolución Modificatoria *</span>
                          <input 
                              value={modResNum} 
                              onChange={e => setModResNum(e.target.value.toUpperCase())} 
                              className="h-13 px-4 rounded-2xl border-2 border-slate-200 bg-white font-bold text-slate-800 focus:border-amber-500 outline-none transition-all text-sm" 
                              placeholder="Ej: RESOLUCIÓN N° 0542-2026-VRAC-UNSAAC" 
                          />
                      </label>
                      <label className="flex flex-col gap-1.5">
                          <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest ml-1">Fecha de la Modificatoria</span>
                          <input 
                              type="date" 
                              value={modResDate} 
                              onChange={e => setModResDate(e.target.value)} 
                              className="h-13 px-4 rounded-2xl border-2 border-slate-200 bg-white font-bold text-slate-800 focus:border-amber-500 outline-none transition-all text-sm" 
                          />
                      </label>
                      <label className="flex flex-col gap-1.5">
                          <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest ml-1">Archivo PDF (Resolución Modificatoria)</span>
                          <div className="flex gap-2">
                              <input 
                                  value={modResPdf} 
                                  onChange={e => setModResPdf(e.target.value)} 
                                  className="flex-1 h-13 px-4 rounded-2xl border-2 border-slate-200 bg-white text-xs font-mono focus:border-amber-500 outline-none transition-all" 
                                  placeholder="https://drive.google.com/..." 
                              />
                              <input type="file" accept=".pdf" ref={modPdfInputRef} className="hidden" onChange={handleModPdfUpload} />
                              <button 
                                  type="button"
                                  onClick={() => modPdfInputRef.current?.click()}
                                  disabled={uploadingModPdf}
                                  className="h-13 px-4 bg-amber-600 hover:bg-amber-700 text-white rounded-2xl flex items-center justify-center transition-all disabled:opacity-50 shadow-md shadow-amber-200"
                                  title="Subir archivo PDF"
                              >
                                  <span className="material-symbols-outlined">{uploadingModPdf ? 'sync' : 'upload_file'}</span>
                              </button>
                          </div>
                      </label>
                  </div>

                  <div className="mt-8 flex gap-3">
                      <button 
                          onClick={() => setIsModResolutionModalOpen(false)} 
                          className="flex-1 py-3.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-2xl font-black text-xs uppercase tracking-wider transition-all"
                      >
                          Volver a Edición
                      </button>
                      <button 
                          onClick={handleExecuteSaveFinalizado} 
                          disabled={savingPreview || !modResNum.trim()} 
                          className="flex-[1.5] py-3.5 bg-amber-600 hover:bg-amber-700 text-white rounded-2xl font-black text-xs uppercase tracking-wider shadow-xl shadow-amber-200 disabled:opacity-50 transition-all active:scale-95 flex items-center justify-center gap-2"
                      >
                          {savingPreview ? <span className="material-symbols-outlined animate-spin text-sm">progress_activity</span> : <span className="material-symbols-outlined text-sm">save</span>}
                          {savingPreview ? 'GUARDANDO...' : 'GUARDAR MODIFICACIÓN'}
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* Modal Principal: Ver / Editar Estudiantes del Bloque */}
      {isPreviewModalOpen && selectedPreviewBatch && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in zoom-in-95">
              <div className="bg-white rounded-3xl shadow-2xl w-full max-w-5xl flex flex-col max-h-[92vh] border border-slate-100 overflow-hidden">
                  
                  {/* Modal Header */}
                  <div className="px-8 py-5 border-b border-slate-100 flex flex-wrap justify-between items-center bg-slate-50/80 shrink-0 gap-4">
                      <div>
                          <div className="flex items-center gap-3">
                              <h3 className="font-black text-slate-900 uppercase tracking-tight text-xl">Estudiantes del Bloque</h3>
                              <span className={`px-3 py-0.5 rounded-full text-[10px] font-black uppercase border ${
                                  selectedPreviewBatch.status === 'Finalizado' 
                                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                                      : 'bg-amber-50 text-amber-700 border-amber-200'
                              }`}>
                                  {selectedPreviewBatch.status === 'Finalizado' ? 'FINALIZADO' : 'EN TRÁMITE'}
                              </span>
                              {isEditingBatchStudents && (
                                  <span className="px-3 py-0.5 rounded-full text-[10px] font-black uppercase bg-blue-50 text-blue-700 border border-blue-200 animate-pulse flex items-center gap-1">
                                      <span className="size-2 rounded-full bg-blue-600"></span> Modo Edición Activo
                                  </span>
                              )}
                          </div>
                          <div className="flex items-center gap-4 text-xs font-bold text-slate-500 mt-1">
                              <span>Oficio: <strong className="text-slate-800 font-black">{selectedPreviewBatch.report_code}</strong></span>
                              <span>•</span>
                              <span>Expediente: <strong className="text-slate-800 font-black">{selectedPreviewBatch.expediente_number}</strong></span>
                              {(() => {
                                  const parsed = parseBatchResolution(selectedPreviewBatch);
                                  if (parsed.originalNumber) {
                                      return (
                                          <>
                                              <span>•</span>
                                              <span>Res: <strong className="text-slate-800 font-black">{parsed.originalNumber}</strong></span>
                                              {parsed.isModified && (
                                                  <span className="bg-amber-100 text-amber-800 px-2 py-0.5 rounded text-[9px] font-black uppercase">
                                                      Modif: {parsed.modNumber}
                                                  </span>
                                              )}
                                          </>
                                      );
                                  }
                                  return null;
                              })()}
                          </div>
                      </div>
                      
                      {/* Action buttons in header */}
                      <div className="flex items-center gap-3">
                          {!isEditingBatchStudents ? (
                              <button 
                                  onClick={() => setIsEditingBatchStudents(true)}
                                  className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-black uppercase tracking-wider rounded-xl shadow-md transition-all active:scale-95 flex items-center gap-2"
                              >
                                  <span className="material-symbols-outlined text-[18px]">edit</span>
                                  Editar Estudiantes
                              </button>
                          ) : (
                              <>
                                  <button 
                                      onClick={handleCancelPreviewEdit}
                                      className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-black uppercase tracking-wider rounded-xl transition-all"
                                  >
                                      Cancelar
                                  </button>
                                  <button 
                                      onClick={handleRequestSavePreviewChanges} 
                                      disabled={savingPreview || (!hasPreviewChanges && deletedStudentIds.length === 0)}
                                      className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black uppercase tracking-wider rounded-xl shadow-lg shadow-emerald-200 transition-all active:scale-95 disabled:opacity-40 flex items-center gap-2"
                                  >
                                      {savingPreview ? <span className="material-symbols-outlined animate-spin text-sm">progress_activity</span> : <span className="material-symbols-outlined text-sm">check</span>}
                                      {savingPreview ? 'GUARDANDO...' : selectedPreviewBatch.status === 'Finalizado' ? 'CONTINUAR CON 2DA RES.' : 'GUARDAR CAMBIOS'}
                                  </button>
                              </>
                          )}
                          <button onClick={() => setIsPreviewModalOpen(false)} className="size-9 rounded-xl hover:bg-slate-200 text-slate-400 hover:text-slate-700 flex items-center justify-center transition-colors">
                              <span className="material-symbols-outlined text-xl">close</span>
                          </button>
                      </div>
                  </div>
                  
                  {/* Modal Body */}
                  <div className="flex-1 overflow-y-auto p-6 bg-slate-50/50">
                      {loadingPreview ? (
                          <div className="flex flex-col justify-center items-center h-48 gap-3">
                              <span className="material-symbols-outlined text-4xl text-primary animate-spin">progress_activity</span>
                              <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Cargando datos y opciones de ingreso...</span>
                          </div>
                      ) : (
                          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
                              {deletedStudentIds.length > 0 && (
                                  <div className="bg-red-50 border-b border-red-100 px-6 py-2.5 flex items-center justify-between text-xs text-red-700 font-bold">
                                      <span>Se han marcado {deletedStudentIds.length} estudiante(s) para ser eliminados del bloque.</span>
                                      <button onClick={() => { setDeletedStudentIds([]); setPreviewStudents(JSON.parse(JSON.stringify(initialPreviewStudents))); }} className="underline font-black hover:text-red-900">Deshacer eliminaciones</button>
                                  </div>
                              )}
                              <div className="overflow-x-auto">
                                  <table className="w-full text-left border-collapse min-w-[750px]">
                                      <thead className="bg-slate-50 border-b border-slate-200">
                                          <tr>
                                              <th className="px-4 py-3.5 text-[10px] font-black text-slate-400 uppercase tracking-widest w-12 text-center">Nº</th>
                                              <th className="px-4 py-3.5 text-[10px] font-black text-slate-400 uppercase tracking-widest w-28">Código</th>
                                              <th className="px-4 py-3.5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Nombre Completo</th>
                                              <th className="px-4 py-3.5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Carrera y Modalidad de Ingreso</th>
                                              <th className="px-4 py-3.5 text-[10px] font-black text-slate-400 uppercase tracking-widest w-24">Año Sec.</th>
                                              <th className="px-4 py-3.5 text-[10px] font-black text-slate-400 uppercase tracking-widest w-32">Inicio Sem.</th>
                                              <th className="px-4 py-3.5 text-[10px] font-black text-slate-400 uppercase tracking-widest w-24 text-center">Estado</th>
                                              {isEditingBatchStudents && (
                                                  <th className="px-4 py-3.5 text-[10px] font-black text-red-500 uppercase tracking-widest w-20 text-center">Acción</th>
                                              )}
                                          </tr>
                                      </thead>
                                      <tbody className="divide-y divide-slate-100">
                                          {previewStudents.length === 0 ? (
                                              <tr>
                                                  <td colSpan={isEditingBatchStudents ? 8 : 7} className="py-16 text-center text-slate-400 italic font-bold">
                                                      No hay estudiantes en este bloque.
                                                  </td>
                                              </tr>
                                          ) : (
                                              previewStudents.map((student, idx) => {
                                                  const rawOptions = student.admission_options || [];
                                                  const uniqueAdmissions: { carrera: string; modalidad: string; label: string; key: string }[] = [];
                                                  const seenKeys = new Set<string>();

                                                  rawOptions.forEach((opt: any) => {
                                                      const carr = (opt.CARRERA || '').trim();
                                                      const mod = (opt.MODALIDAD || '').trim();
                                                      const sem = [opt.SEMESTRE, opt.ANIO].filter(Boolean).join('-');
                                                      const key = `${carr}|||${mod}`;
                                                      if (carr && !seenKeys.has(key)) {
                                                          seenKeys.add(key);
                                                          uniqueAdmissions.push({
                                                              carrera: carr,
                                                              modalidad: mod,
                                                              label: `${carr} (${mod}${sem ? ` - ${sem}` : ''})`,
                                                              key
                                                          });
                                                      }
                                                  });

                                                  const currentKey = `${(student.carrera || '').trim()}|||${(student.admission_modality || '').trim()}`;
                                                  if (student.carrera && !seenKeys.has(currentKey)) {
                                                      uniqueAdmissions.unshift({
                                                          carrera: student.carrera,
                                                          modalidad: student.admission_modality || '',
                                                          label: `${student.carrera} (${student.admission_modality || 'ACTUAL'})`,
                                                          key: currentKey
                                                      });
                                                  }

                                                  const hasMultipleIngresos = uniqueAdmissions.length > 1;

                                                  return (
                                                      <tr key={student.id || idx} className="hover:bg-slate-50/80 transition-colors">
                                                          <td className="px-4 py-3 text-xs font-bold text-slate-400 text-center">{idx + 1}</td>
                                                          <td className="px-4 py-3 text-xs font-mono font-bold text-slate-700">{student.student_code}</td>
                                                          <td className="px-4 py-3 text-xs font-black uppercase text-slate-900">{student.student_name}</td>
                                                          
                                                          {/* Carrera y Modalidad */}
                                                          <td className="px-4 py-3">
                                                              {isEditingBatchStudents && hasMultipleIngresos ? (
                                                                  <div className="flex flex-col gap-1 max-w-sm">
                                                                      <span className="inline-flex items-center gap-1 w-fit px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200 text-[9px] font-black uppercase">
                                                                          <span className="material-symbols-outlined text-[11px]">school</span>
                                                                          {uniqueAdmissions.length} Ingresos Registrados
                                                                      </span>
                                                                      <select 
                                                                          value={`${student.carrera}|||${student.admission_modality || ''}`}
                                                                          onChange={(e) => {
                                                                              const [selCarrera, selMod] = e.target.value.split('|||');
                                                                              const updated = [...previewStudents];
                                                                              updated[idx] = {
                                                                                  ...student,
                                                                                  carrera: selCarrera,
                                                                                  admission_modality: selMod || student.admission_modality
                                                                              };
                                                                              setPreviewStudents(updated);
                                                                              setHasPreviewChanges(true);
                                                                          }}
                                                                          className="w-full text-xs font-bold uppercase bg-indigo-50/90 hover:bg-indigo-100/60 text-indigo-950 border border-indigo-200 rounded-xl px-2.5 py-1.5 outline-none focus:border-indigo-500 shadow-sm cursor-pointer"
                                                                      >
                                                                          {uniqueAdmissions.map((adm, aIdx) => (
                                                                              <option key={aIdx} value={adm.key}>
                                                                                  {adm.label}
                                                                              </option>
                                                                          ))}
                                                                      </select>
                                                                  </div>
                                                              ) : (
                                                                  <div className="flex flex-col">
                                                                      <p className="text-xs font-black text-slate-800 uppercase">{student.carrera}</p>
                                                                      <p className="text-[10px] font-bold text-indigo-600 uppercase">{student.admission_modality || 'SIN MODALIDAD'}</p>
                                                                      {hasMultipleIngresos && !isEditingBatchStudents && (
                                                                          <span className="text-[8px] font-bold text-indigo-500 uppercase mt-0.5">
                                                                              • {uniqueAdmissions.length} carreras ingresadas
                                                                          </span>
                                                                      )}
                                                                  </div>
                                                              )}
                                                          </td>

                                                          {/* Grado Secundaria */}
                                                          <td className="px-4 py-3">
                                                              {!isEditingBatchStudents ? (
                                                                  <span className="text-xs font-bold text-slate-600 uppercase">{student.grade_level || 'QUINTO'}</span>
                                                              ) : (
                                                                  <select
                                                                      value={student.grade_level || 'QUINTO'}
                                                                      onChange={(e) => {
                                                                          const updated = [...previewStudents];
                                                                          updated[idx].grade_level = e.target.value;
                                                                          setPreviewStudents(updated);
                                                                          setHasPreviewChanges(true);
                                                                      }}
                                                                      className="px-2 py-1.5 text-xs font-bold text-slate-700 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-primary"
                                                                  >
                                                                      <option value="QUINTO">QUINTO</option>
                                                                      <option value="CUARTO">CUARTO</option>
                                                                      <option value="TERCERO">TERCERO</option>
                                                                  </select>
                                                              )}
                                                          </td>

                                                          {/* Semestre de Inicio */}
                                                          <td className="px-4 py-3">
                                                              {!isEditingBatchStudents ? (
                                                                  <span className="px-2.5 py-1 bg-primary/10 text-primary text-xs font-black rounded-lg">
                                                                      {student.starting_semester}
                                                                  </span>
                                                              ) : (
                                                                  <select
                                                                      value={student.starting_semester}
                                                                      onChange={(e) => {
                                                                          const updated = [...previewStudents];
                                                                          updated[idx].starting_semester = e.target.value;
                                                                          setPreviewStudents(updated);
                                                                          setHasPreviewChanges(true);
                                                                      }}
                                                                      className="px-2 py-1.5 text-xs font-black text-primary bg-primary/5 border border-primary/20 rounded-lg outline-none focus:border-primary cursor-pointer"
                                                                  >
                                                                      {semesterOptions.map(opt => (
                                                                          <option key={opt} value={opt} className="text-slate-800">{opt}</option>
                                                                      ))}
                                                                  </select>
                                                              )}
                                                          </td>

                                                          {/* Estado */}
                                                          <td className="px-4 py-3 text-center">
                                                              {student.is_withdrawn ? (
                                                                  <span className="px-2 py-0.5 bg-red-50 text-red-600 text-[9px] font-black rounded uppercase border border-red-100">Renuncia</span>
                                                              ) : (
                                                                  <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 text-[9px] font-black rounded uppercase border border-emerald-100">Activo</span>
                                                              )}
                                                          </td>

                                                          {/* Acción Eliminar (en modo edición) */}
                                                          {isEditingBatchStudents && (
                                                              <td className="px-4 py-3 text-center">
                                                                  <button 
                                                                      onClick={() => setConfirmDeleteStudent(student)}
                                                                      className="size-8 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 flex items-center justify-center transition-colors mx-auto"
                                                                      title="Eliminar estudiante de este bloque"
                                                                  >
                                                                      <span className="material-symbols-outlined text-[18px]">delete</span>
                                                                  </button>
                                                              </td>
                                                          )}
                                                      </tr>
                                                  );
                                              })
                                          )}
                                      </tbody>
                                  </table>
                              </div>
                          </div>
                      )}
                  </div>
              </div>
          </div>
      )}

      {/* Main Screen Header */}
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
                              {batches.map(b => {
                                  const parsed = parseBatchResolution(b);
                                  return (
                                      <tr key={b.id} className="hover:bg-slate-50 transition-colors">
                                          <td className="px-6 py-4">
                                              <p className="font-black text-slate-900 text-xs">{b.report_code}</p>
                                              <p className="text-[9px] font-bold text-slate-400 uppercase">EXP: {b.expediente_number}</p>
                                          </td>
                                          <td className="px-6 py-4">
                                              <span className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase border ${
                                                  b.status === 'Finalizado' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-orange-50 text-orange-700 border-orange-200'
                                              }`}>
                                                  {b.status}
                                              </span>
                                          </td>
                                          <td className="px-6 py-4">
                                              {!parsed.originalNumber ? (
                                                  <p className="text-[9px] text-slate-300 italic font-bold">Sin resolución aún</p>
                                              ) : (
                                                  <div className="flex flex-col gap-1.5">
                                                      <div className="flex items-center gap-1.5 flex-wrap">
                                                          <span className="text-[10px] font-black text-slate-800 uppercase">{parsed.originalNumber}</span>
                                                          {parsed.originalPdf && (
                                                              <a href={parsed.originalPdf} target="_blank" rel="noopener noreferrer" className="size-5 rounded bg-indigo-50 text-indigo-600 hover:bg-indigo-100 flex items-center justify-center transition-colors" title="Ver Resolución Original">
                                                                  <span className="material-symbols-outlined text-[13px]">picture_as_pdf</span>
                                                              </a>
                                                          )}
                                                      </div>
                                                      {parsed.originalDate && (
                                                          <span className="text-[9px] font-medium text-slate-400">{parsed.originalDate}</span>
                                                      )}
                                                      {parsed.isModified && (
                                                          <div className="mt-1 p-2 bg-amber-50 border border-amber-200 rounded-xl flex flex-col gap-0.5">
                                                              <div className="flex items-center justify-between gap-1">
                                                                  <span className="text-[8px] font-black text-amber-800 uppercase tracking-tighter flex items-center gap-0.5">
                                                                      <span className="material-symbols-outlined text-[12px]">history_edu</span> Modificado por 2da Res.:
                                                                  </span>
                                                                  {parsed.modPdf && (
                                                                      <a href={parsed.modPdf} target="_blank" rel="noopener noreferrer" className="text-amber-800 hover:text-amber-950 font-black text-[8px] uppercase underline flex items-center gap-0.5">
                                                                          <span className="material-symbols-outlined text-[11px]">picture_as_pdf</span> PDF
                                                                      </a>
                                                                  )}
                                                              </div>
                                                              <span className="text-[9px] font-black text-amber-900 uppercase">{parsed.modNumber}</span>
                                                              {parsed.modDate && <span className="text-[8px] text-amber-700">{parsed.modDate}</span>}
                                                          </div>
                                                      )}
                                                  </div>
                                              )}
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
                                                      <div className="absolute right-0 top-full mt-1 w-52 bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden z-50 animate-in fade-in slide-in-from-top-2">
                                                          <button onClick={(e) => { e.stopPropagation(); handleOpenPreview(b); setActiveMenuId(null); }} className="w-full text-left px-4 py-3 text-xs font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-3 transition-colors">
                                                              <span className="material-symbols-outlined text-[18px] text-blue-500">group</span> Ver Estudiantes
                                                          </button>
                                                          <button onClick={(e) => { e.stopPropagation(); downloadBatchPdf(b); setActiveMenuId(null); }} className="w-full text-left px-4 py-3 text-xs font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-3 transition-colors">
                                                              <span className="material-symbols-outlined text-[18px] text-indigo-500">picture_as_pdf</span> PDF Reporte
                                                          </button>
                                                          <button onClick={(e) => { e.stopPropagation(); downloadBatchExcel(b); setActiveMenuId(null); }} className="w-full text-left px-4 py-3 text-xs font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-3 transition-colors">
                                                              <span className="material-symbols-outlined text-[18px] text-emerald-500">table_view</span> Excel
                                                          </button>
                                                          {user.role === 'Administrador' && (
                                                              <button onClick={(e) => { 
                                                                  e.stopPropagation(); 
                                                                  setSelectedBatchId(b.id); 
                                                                  setResNum(parsed.originalNumber || b.resolution_number || ''); 
                                                                  setResDate(parsed.originalDate || b.resolution_date || ''); 
                                                                  setResPdf(parsed.originalPdf || b.resolution_pdf || ''); 
                                                                  setIsResUpdateModalOpen(true); 
                                                                  setActiveMenuId(null); 
                                                              }} className="w-full text-left px-4 py-3 text-xs font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-3 transition-colors border-t border-slate-50">
                                                                  <span className="material-symbols-outlined text-[18px] text-slate-500">edit_document</span> Editar Res. Original
                                                              </button>
                                                          )}
                                                          {parsed.originalPdf && (
                                                              <button onClick={(e) => { e.stopPropagation(); window.open(parsed.originalPdf, '_blank'); setActiveMenuId(null); }} className="w-full text-left px-4 py-3 text-xs font-bold text-red-600 hover:bg-red-50 flex items-center gap-3 transition-colors border-t border-slate-50">
                                                                  <span className="material-symbols-outlined text-[18px]">open_in_new</span> Ver Res. Original
                                                              </button>
                                                          )}
                                                          {parsed.modPdf && (
                                                              <button onClick={(e) => { e.stopPropagation(); window.open(parsed.modPdf, '_blank'); setActiveMenuId(null); }} className="w-full text-left px-4 py-3 text-xs font-bold text-amber-700 hover:bg-amber-50 flex items-center gap-3 transition-colors border-t border-slate-50">
                                                                  <span className="material-symbols-outlined text-[18px]">open_in_new</span> Ver 2da Res. (Modificatoria)
                                                              </button>
                                                          )}
                                                      </div>
                                                  )}
                                              </div>
                                          </td>
                                      </tr>
                                  );
                              })}
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
                              {filteredGlobal.map(d => {
                                  const parsed = parseBatchResolution(d.batch);
                                  return (
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
                                                      <span className="text-[10px] font-black text-slate-400 line-through uppercase">{parsed.originalNumber || d.batch?.resolution_number}</span>
                                                      <span className="text-[8px] font-bold text-red-500 uppercase">ANULADA POR RENUNCIA</span>
                                                  </div>
                                              ) : !parsed.originalNumber ? (
                                                  <span className="text-[9px] font-black text-orange-600 uppercase bg-orange-50 px-2 py-1 rounded-lg border border-orange-100 animate-pulse">PENDIENTE</span>
                                              ) : (
                                                  <div className="flex flex-col gap-1">
                                                      {parsed.originalPdf ? (
                                                          <a href={parsed.originalPdf} target="_blank" rel="noopener noreferrer" className="text-[10px] font-black text-indigo-600 hover:text-indigo-800 uppercase bg-indigo-50 hover:bg-indigo-100 px-2 py-1 rounded-lg border border-indigo-200 transition-colors inline-flex items-center gap-1">
                                                              {parsed.originalNumber}
                                                              <span className="material-symbols-outlined text-[10px]">open_in_new</span>
                                                          </a>
                                                      ) : (
                                                          <span className="text-[10px] font-black text-slate-800 uppercase bg-slate-100 px-2 py-1 rounded-lg border border-slate-200">{parsed.originalNumber}</span>
                                                      )}
                                                      {parsed.isModified && (
                                                          <div className="flex items-center gap-1">
                                                              <span className="text-[8px] font-black uppercase text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">
                                                                  2da Res: {parsed.modNumber}
                                                              </span>
                                                              {parsed.modPdf && (
                                                                  <a href={parsed.modPdf} target="_blank" rel="noopener noreferrer" className="text-amber-800 hover:text-amber-950" title="Ver PDF 2da Resolución">
                                                                      <span className="material-symbols-outlined text-[12px]">picture_as_pdf</span>
                                                                  </a>
                                                              )}
                                                          </div>
                                                      )}
                                                  </div>
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
                                  );
                              })}
                          </tbody>
                      </table>
                  </div>
              </div>
          )}
      </div>
    </div>
  );
};
