
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { supabase } from '../lib/supabaseClient';
import { PaymentRegistry, User } from '../types';
import { useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';

const ITEMS_PER_PAGE = 50;

export const TransferRefunds: React.FC<{ user: User }> = ({ user }) => {
  const navigate = useNavigate();
  const [data, setData] = useState<PaymentRegistry[]>([]);
  const [loading, setLoading] = useState(true);
  const [tableMissing, setTableMissing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('Todos');
  const [currentPage, setCurrentPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);

  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [expandedBlocks, setExpandedBlocks] = useState<Set<string>>(new Set());

  const toggleBlockExpand = (blockId: string) => {
    setExpandedBlocks(prev => {
      const next = new Set(prev);
      if (next.has(blockId)) next.delete(blockId);
      else next.add(blockId);
      return next;
    });
  };

  const expandAllBlocks = () => {
    if (groupedBlocks) {
      setExpandedBlocks(new Set(Object.keys(groupedBlocks)));
    }
  };

  const collapseAllBlocks = () => {
    setExpandedBlocks(new Set());
  };

  const [isBatchModalOpen, setIsBatchModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isResolutionModalOpen, setIsResolutionModalOpen] = useState(false);
  const [isTransferControlOpen, setIsTransferControlOpen] = useState(false);
  const [transferData, setTransferData] = useState<PaymentRegistry[]>([]);
  const [loadingTransfers, setLoadingTransfers] = useState(false);
  const [selectedBlock, setSelectedBlock] = useState<string | null>(null);
  const [resolutionFile, setResolutionFile] = useState<File | null>(null);
  const [resolutionLink, setResolutionLink] = useState('');
  const [resolutionNumber, setResolutionNumber] = useState('');
  const [resolutionDate, setResolutionDate] = useState('');
  const [isDownloadModalOpen, setIsDownloadModalOpen] = useState(false);
  const [blockToDownload, setBlockToDownload] = useState<{ id: string, items: PaymentRegistry[] } | null>(null);
  
  // New state for Completar Expediente
  const [expedientesData, setExpedientesData] = useState<Record<string, any>>({});
  const [isExpedienteModalOpen, setIsExpedienteModalOpen] = useState(false);
  const [selectedBlockForExpediente, setSelectedBlockForExpediente] = useState<string | null>(null);
  const [expedienteRefNumber, setExpedienteRefNumber] = useState('');
  const [expedienteDestination, setExpedienteDestination] = useState('');
  const [expedienteFile, setExpedienteFile] = useState<File | null>(null);

  // New state for Rejecting Refunds
  const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
  const [itemToReject, setItemToReject] = useState<PaymentRegistry | null>(null);
  const [blockToRejectRefunds, setBlockToRejectRefunds] = useState<{ blockId: string; items: PaymentRegistry[] } | null>(null);
  const [rejectionReasonInput, setRejectionReasonInput] = useState('');
  const [rejectionScope, setRejectionScope] = useState<'single' | 'all_refunds'>('single');

  const [isSubmitting, setIsSubmitting] = useState(false);

  const [csvPreview, setCsvPreview] = useState<any[]>([]);
  const csvInputRef = useRef<HTMLInputElement>(null);

  const [reportNumber, setReportNumber] = useState('');

  useEffect(() => {
    fetchData();
  }, [currentPage, searchQuery, statusFilter]);

  const fetchData = async () => {
    try {
      setLoading(true);
      let query = supabase.from('padron_pagos').select('*', { count: 'exact' });
      
      if (statusFilter === 'Todos') {
          // No filter, show all
      } else if (statusFilter === 'Aptos (Recibido)') {
          query = query.eq('status', 'Apto');
      } else if (statusFilter === 'En Bloque') {
          query = query.eq('status', 'En Bloque');
      } else if (statusFilter === 'Finalizado') {
          query = query.eq('status', 'Finalizado');
      } else if (statusFilter === 'Rechazados') {
          query = query.eq('status', 'Rechazado');
      }

      if (searchQuery.trim()) query = query.or(`student_name.ilike.%${searchQuery.trim()}%,dni.eq.${searchQuery.trim()}`);
      
      const from = currentPage * ITEMS_PER_PAGE;
      const to = from + ITEMS_PER_PAGE - 1;
      
      // FIX: Sort by block number first when viewing grouped statuses to keep blocks together
      if (statusFilter === 'En Bloque' || statusFilter === 'Finalizado') {
          query = query.order('outgoing_doc_number', { ascending: false, nullsFirst: false }).order('student_name', { ascending: true });
      } else {
          query = query.order('student_name', { ascending: true });
      }
      
      query = query.range(from, to);

      const { data: res, error, count } = await query;
      if (error && (error.code === 'PGRST205' || error.code === '42P01')) setTableMissing(true);
      
      if (res) { 
          let finalData = res;
          
          // FIX: Ensure complete blocks are loaded even if they span across pagination pages
          if ((statusFilter === 'En Bloque' || statusFilter === 'Finalizado') && res.length > 0) {
              const blockIds = Array.from(new Set(res.map(r => r.outgoing_doc_number).filter(Boolean))) as string[];
              if (blockIds.length > 0) {
                  const { data: fullBlocksData, error: fullBlocksError } = await supabase
                      .from('padron_pagos')
                      .select('*')
                      .in('outgoing_doc_number', blockIds)
                      .order('outgoing_doc_number', { ascending: false })
                      .order('student_name', { ascending: true });
                  
                  if (!fullBlocksError && fullBlocksData) {
                      finalData = fullBlocksData;
                  }
              }
          }
          
          setData(finalData); 
          setTotalCount(count || 0); 
      }
    } catch (err) { console.error(err); } finally { setLoading(false); }
  };

  const fetchTransferData = async () => {
      try {
          setLoadingTransfers(true);
          const { data: res, error } = await supabase
              .from('padron_pagos')
              .select('*')
              .eq('type', 'TRANSFERENCIA')
              .order('student_name', { ascending: true });
          if (error) throw error;
          if (res) setTransferData(res);
      } catch (err) {
          console.error(err);
      } finally {
          setLoadingTransfers(false);
      }
  };

  const fetchExpedientesData = async (blockIds: string[]) => {
      if (blockIds.length === 0) return;
      try {
          const { data, error } = await supabase
              .from('expedientes_salida')
              .select('*')
              .in('doc_number', blockIds);
          
          if (error) throw error;
          
          if (data) {
              const map: Record<string, any> = {};
              data.forEach(item => {
                  map[item.doc_number] = item;
              });
              setExpedientesData(map);
          }
      } catch (err) {
          console.error("Error fetching expedientes:", err);
      }
  };

  const openExpedienteModal = (blockId: string) => {
      setSelectedBlockForExpediente(blockId);
      const existingData = expedientesData[blockId];
      setExpedienteRefNumber(existingData?.ref_number || '');
      setExpedienteDestination(existingData?.destination || '');
      setExpedienteFile(null);
      setIsExpedienteModalOpen(true);
  };

  const saveExpediente = async () => {
      if (!selectedBlockForExpediente || !expedienteRefNumber.trim()) return;
      setIsSubmitting(true);
      try {
          let publicUrl = expedientesData[selectedBlockForExpediente]?.pdf_url || null;
          
          if (expedienteFile) {
              const sanitizedName = expedienteFile.name.replace(/[^a-zA-Z0-9.]/g, '_');
              const fileName = `${Date.now()}-${sanitizedName}`;
              const { error: uploadError } = await supabase.storage
                  .from('documentos')
                  .upload(`salidas/${fileName}`, expedienteFile, {
                      contentType: 'application/pdf',
                      upsert: true
                  });

              if (uploadError) throw uploadError;

              const { data: urlData } = supabase.storage
                  .from('documentos')
                  .getPublicUrl(`salidas/${fileName}`);
              publicUrl = urlData.publicUrl;
          }

          const { error } = await supabase.from('expedientes_salida').update({
              ref_number: expedienteRefNumber.trim(),
              destination: expedienteDestination.trim().toUpperCase(),
              pdf_url: publicUrl
          }).eq('doc_number', selectedBlockForExpediente);

          if (error) throw error;

          alert(`✅ Expediente completado exitosamente.`);
          setIsExpedienteModalOpen(false);
          
          // Refresh expedientes data
          if (groupedBlocks) {
              fetchExpedientesData(Object.keys(groupedBlocks));
          }
      } catch (err: any) { alert(err.message); } finally { setIsSubmitting(false); }
  };

  const openRejectSingleModal = (item: PaymentRegistry) => {
      setItemToReject(item);
      setBlockToRejectRefunds(null);
      setRejectionScope('single');
      setRejectionReasonInput('');
      setIsRejectModalOpen(true);
  };

  const openRejectBlockRefundsModal = (blockId: string, items: PaymentRegistry[]) => {
      const refundsOnly = items.filter(i => !i.type.toUpperCase().includes('TRANS'));
      if (refundsOnly.length === 0) {
          alert('Este bloque no contiene trámites de devolución para rechazar.');
          return;
      }
      setItemToReject(null);
      setBlockToRejectRefunds({ blockId, items: refundsOnly });
      setRejectionScope('all_refunds');
      setRejectionReasonInput('');
      setIsRejectModalOpen(true);
  };

  const confirmRejection = async () => {
      if (!rejectionReasonInput.trim()) {
          alert('Por favor ingrese el motivo u oficio del rechazo.');
          return;
      }

      setIsSubmitting(true);
      try {
          const nowISO = new Date().toISOString();
          const targetItems = rejectionScope === 'single' && itemToReject
              ? [itemToReject]
              : (blockToRejectRefunds?.items || []);

          if (targetItems.length === 0) return;

          const idsToReject = targetItems.map(i => i.id);
          const reasonText = rejectionReasonInput.trim();

          // Actualizar registros:
          // 1. Estado a 'Rechazado'
          // 2. Liberar outgoing_doc_number para que ya no ocupen el bloque activo
          // 3. Registrar metadata de rechazo en los campos dedicados (o fallback en reason)
          for (const item of targetItems) {
              const prevBlock = item.outgoing_doc_number || 'Bloque anterior';
              const formattedObservation = `[RECHAZO DEVOLUCIÓN ${new Date().toLocaleDateString('es-PE')}]: ${reasonText} (Bloque: ${prevBlock})`;
              
              // Armamos el payload con campos de rechazo y trazabilidad
              const payload: any = {
                  status: 'Rechazado',
                  outgoing_doc_number: null, // Se desvincula del bloque activo
                  rejection_reason: reasonText,
                  rejection_date: nowISO,
                  rejected_by: user.name || 'Operador',
                  previous_block_id: prevBlock,
                  reason: item.reason ? `${item.reason} | ${formattedObservation}` : formattedObservation
              };

              const { error } = await supabase
                  .from('padron_pagos')
                  .update(payload)
                  .eq('id', item.id);

              if (error) {
                  // Fallback si las nuevas columnas aún no se han creado en Supabase
                  console.warn("Retrying with standard columns fallback:", error.message);
                  await supabase
                      .from('padron_pagos')
                      .update({
                          status: 'Rechazado',
                          outgoing_doc_number: null,
                          reason: item.reason ? `${item.reason} | ${formattedObservation}` : formattedObservation
                      })
                      .eq('id', item.id);
              }
          }

          // Registrar en auditoría de seguimiento
          try {
              const auditDesc = rejectionScope === 'single' && itemToReject
                  ? `Devolución rechazada para DNI ${itemToReject.dni} (${itemToReject.student_name}). Motivo: ${reasonText}. Bloque liberado: ${itemToReject.outgoing_doc_number || '-'}`
                  : `Devoluciones rechazadas en bloque ${blockToRejectRefunds?.blockId} (${targetItems.length} alumnos). Motivo: ${reasonText}.`;

              await supabase.from('tramite_seguimiento').insert([{
                  action_type: 'Rechazo Devolución',
                  description: auditDesc,
                  user_name: user.name || 'Operador'
              }]);
          } catch (auditErr) {
              console.warn("No se pudo registrar log de auditoría:", auditErr);
          }

          alert(`✅ Trámite(s) de devolución marcado(s) como RECHAZADO(S).\n\nLos postulantes han sido desbloqueados y ahora pueden ser atendidos con un nuevo expediente como TRANSFERENCIA.`);
          
          setIsRejectModalOpen(false);
          setItemToReject(null);
          setBlockToRejectRefunds(null);
          setRejectionReasonInput('');
          fetchData();
      } catch (err: any) {
          alert('Error al rechazar trámite: ' + err.message);
      } finally {
          setIsSubmitting(false);
      }
  };

  const openTransferControl = () => {
      fetchTransferData();
      setIsTransferControlOpen(true);
  };

  const toggleTransferNotified = async (id: string, currentStatus: boolean | undefined) => {
      try {
          const newStatus = !currentStatus;
          const { error } = await supabase
              .from('padron_pagos')
              .update({ transfer_notified: newStatus })
              .eq('id', id);
          if (error) throw error;
          
          // Update local state
          setTransferData(prev => prev.map(item => 
              item.id === id ? { ...item, transfer_notified: newStatus } : item
          ));
      } catch (err: any) {
          alert('Error al actualizar estado: ' + err.message);
      }
  };

  const groupedTransfers = useMemo(() => {
      const groups: Record<string, PaymentRegistry[]> = {};
      transferData.forEach(item => {
          const exam = item.target_exam || 'Examen No Especificado';
          if (!groups[exam]) groups[exam] = [];
          groups[exam].push(item);
      });
      return groups;
  }, [transferData]);

  const [selectedTransferExam, setSelectedTransferExam] = useState<string | null>(null);

  useEffect(() => {
      if (isTransferControlOpen && !selectedTransferExam && Object.keys(groupedTransfers).length > 0) {
          setSelectedTransferExam(Object.keys(groupedTransfers)[0]);
      }
  }, [isTransferControlOpen, groupedTransfers, selectedTransferExam]);

  const handleCsvFile = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (evt) => {
          const content = evt.target?.result as string;
          const lines = content.split(/\r?\n/);
          const results = [];
          for (let i = 1; i < lines.length; i++) {
              if (!lines[i].trim()) continue;
              const cols = lines[i].split(',').map(c => c.trim());
              let cleanType = (cols[11] || '').toUpperCase().includes('TRANS') ? 'TRANSFERENCIA' : 'DEVOLUCION';
              
              // Normalize status if provided, otherwise null
              let rawStatus = (cols[13] || '').trim();
              let normalizedStatus = null;
              if (rawStatus.toUpperCase() === 'FINALIZADO') normalizedStatus = 'Finalizado';
              else if (rawStatus.toUpperCase() === 'EN BLOQUE') normalizedStatus = 'En Bloque';
              else if (rawStatus.toUpperCase() === 'APTO') normalizedStatus = 'Apto';
              else if (rawStatus.toUpperCase() === 'OBSERVADO') normalizedStatus = 'Observado';
              else if (rawStatus.toUpperCase() === 'PENDIENTE ORIGINALES') normalizedStatus = 'Pendiente Originales';
              else if (rawStatus) normalizedStatus = rawStatus; // Fallback to raw if it doesn't match exactly but is not empty

              results.push({
                  concurso: cols[0] || '', dni: cols[1] || '', student_name: (cols[2] || '').toUpperCase(),
                  phone: cols[3] || '', birth_date: cols[4] || '', age: cols[5] || '',
                  parent_name: (cols[6] || '').toUpperCase(), parent_phone: cols[7] || '',
                  payment_date: cols[8] || '', amount: cols[9] || '', reason: cols[10] || '',
                  type: cleanType, target_exam: cols[12] || '', status: normalizedStatus,
                  incoming_file_number: cols[14] || '', outgoing_doc_number: cols[15] || '',
                  resolution_number: cols[16] || '', resolution_date: cols[17] || '',
                  resolution_pdf: cols[18] || ''
              });
          }
          setCsvPreview(results);
      };
      reader.readAsText(file);
  };

  const processImport = async () => {
      if (csvPreview.length === 0) return;
      setIsSubmitting(true);
      try {
          const { error } = await supabase.from('padron_pagos').insert(csvPreview);
          if (error) throw error;
          
          try {
              await supabase.from('tramite_seguimiento').insert([{
                  action_type: 'Registro',
                  description: `Se importó un lote de ${csvPreview.length} registros de Pagos/Transferencias.`,
                  user_name: user?.name || 'Operador / Sistema'
              }]);
          } catch (e) { console.error('Audit error:', e); }

          alert(`✅ Importación exitosa: ${csvPreview.length} registros.`);
          setIsImportModalOpen(false); fetchData();
      } catch (err: any) { alert(err.message); } finally { setIsSubmitting(false); }
  };

  const generateBatchReport = async () => {
      if (selectedIds.size === 0 || !reportNumber) return;
      setIsSubmitting(true);
      try {
          const selectedItems = data.filter(d => selectedIds.has(d.id));
          const fullReportCode = `REP. ${reportNumber} - ${new Date().getFullYear()}`;
          
          // 1. Registrar el reporte como un documento de salida
          await supabase.from('expedientes_salida').insert([{
                  doc_type: 'Informe', doc_number: fullReportCode,
                  subject: `REPORTE DE REMESA DIGA: ${selectedItems.length} alumnos agrupados para trámite económico.`,
          }]);

          // 2. Actualizar estado de los alumnos a 'En Bloque'
          await supabase.from('padron_pagos').update({ 
              status: 'En Bloque', 
              outgoing_doc_number: fullReportCode 
          }).in('id', Array.from(selectedIds));

          // 3. GENERAR EL PDF CON LAS 2 PLANTILLAS DIFERENCIADAS
          generateDIGAReportPDF(selectedItems, fullReportCode);

          alert(`✅ Reporte ${fullReportCode} generado.`);
          setIsBatchModalOpen(false); setSelectedIds(new Set()); setReportNumber(''); fetchData();
      } catch (err: any) { alert(err.message); } finally { setIsSubmitting(false); }
  };

  const generateDIGAReportPDF = (items: PaymentRegistry[], reportCode: string) => {
      const printWindow = window.open('', '_blank');
      if (!printWindow) return;

      const transfers = items.filter(i => i.type.toUpperCase().includes('TRANS')).sort((a, b) => a.student_name.localeCompare(b.student_name));
      const refunds = items.filter(i => !i.type.toUpperCase().includes('TRANS')).sort((a, b) => a.student_name.localeCompare(b.student_name));

      let content = `
          <html>
          <head>
              <title></title>
              <style>
                  @page { size: A4 landscape; margin: 0; }
                  body { padding: 15mm; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #1a1a1a; font-size: 11px; line-height: 1.4; }
                  .header { text-align: center; border-bottom: 2px solid #9b192d; margin-bottom: 20px; padding-bottom: 10px; }
                  .header h1 { color: #9b192d; margin: 0; font-size: 18px; text-transform: uppercase; }
                  .header p { margin: 3px 0; font-weight: bold; font-size: 10px; }
                  .section-title { background: #f8fafc; padding: 8px; border-left: 4px solid #9b192d; font-weight: bold; margin: 25px 0 10px 0; font-size: 12px; text-transform: uppercase; }
                  table { width: 100%; border-collapse: collapse; margin-bottom: 20px; table-layout: fixed; word-wrap: break-word; }
                  th { background: #f1f5f9; border: 1px solid #cbd5e1; padding: 6px; text-align: left; font-size: 8px; text-transform: uppercase; color: #475569; }
                  td { border: 1px solid #e2e8f0; padding: 6px; font-size: 8px; vertical-align: top; }
                  .footer { margin-top: 50px; display: flex; justify-content: space-between; align-items: flex-end; }
                  .signature { text-align: center; width: 200px; border-top: 1px solid #333; padding-top: 5px; font-weight: bold; font-size: 10px; }
              </style>
          </head>
          <body>
              <div class="header">
                  <h1>Universidad Nacional de San Antonio Abad del Cusco</h1>
                  <p>DIRECCIÓN DE ADMISIÓN</p>
                  <p style="font-size: 12px; margin-top: 10px;">OFICIO N° ${reportCode}</p>
              </div>
      `;

      if (transfers.length > 0) {
          content += `
              <div class="section-title">RELACIÓN PARA TRANSFERENCIA DE EXAMEN</div>
              <table>
                  <thead>
                      <tr>
                          <th style="width: 30px;">#</th>
                          <th style="width: 90px;">Concurso</th>
                          <th style="width: 80px;">DNI</th>
                          <th>Nombre Completo</th>
                          <th style="width: 90px;">Expediente</th>
                          <th>EXAM A TRANSFERIR</th>
                      </tr>
                  </thead>
                  <tbody>
                      ${transfers.map((i, idx) => `
                          <tr>
                              <td style="text-align:center;">${idx + 1}</td>
                              <td>${i.concurso}</td>
                              <td>${i.dni}</td>
                              <td><b>${i.student_name}</b></td>
                              <td>${i.incoming_file_number || '-'}</td>
                              <td>${i.target_exam || 'NO ESPECIFICADO'}</td>
                          </tr>
                      `).join('')}
                  </tbody>
              </table>
          `;
      }

      if (refunds.length > 0) {
          content += `
              <div class="section-title">RELACIÓN PARA DEVOLUCIÓN</div>
              <table>
                  <thead>
                      <tr>
                          <th style="width: 25px;">#</th>
                          <th style="width: 70px;">Concurso</th>
                          <th style="width: 65px;">DNI</th>
                          <th style="width: 140px;">Nombre</th>
                          <th style="width: 70px;">Expediente</th>
                          <th style="width: 60px;">Telefono</th>
                          <th style="width: 55px;">F. Nac.</th>
                          <th style="width: 30px;">Edad</th>
                          <th style="width: 100px;">Nombre Apoderado</th>
                          <th style="width: 65px;">Telf. Apoderado</th>
                          <th style="width: 65px;">F. Pago</th>
                          <th style="width: 45px;">Monto</th>
                          <th>Motivo</th>
                      </tr>
                  </thead>
                  <tbody>
                      ${refunds.map((i, idx) => `
                          <tr>
                              <td style="text-align:center;">${idx + 1}</td>
                              <td>${i.concurso}</td>
                              <td>${i.dni}</td>
                              <td><b>${i.student_name}</b></td>
                              <td>${i.incoming_file_number || '-'}</td>
                              <td>${i.phone || '-'}</td>
                              <td>${i.birth_date || '-'}</td>
                              <td>${i.age || '-'}</td>
                              <td>${i.parent_name || '-'}</td>
                              <td>${i.parent_phone || '-'}</td>
                              <td>${i.payment_date || '-'}</td>
                              <td>S/ ${i.amount}</td>
                              <td style="font-size: 7px;">${i.reason || '-'}</td>
                          </tr>
                      `).join('')}
                  </tbody>
              </table>
          `;
      }

      const formatLongDate = (date: Date) => {
          const months = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
          return `${date.getDate()} de ${months[date.getMonth()]} de ${date.getFullYear()}`;
      };

      content += `
              <div class="footer">
                  <p>Fecha de impresión: ${formatLongDate(new Date())}</p>
                  <div class="signature">
                      Firma y Sello<br>Director de Admisión
                  </div>
              </div>
          </body>
          </html>
      `;

      printWindow.document.write(content);
      printWindow.document.close();
      printWindow.print();
  };

  const generateDIGAReportExcel = (items: PaymentRegistry[], reportCode: string) => {
      const transfers = items.filter(i => i.type.toUpperCase().includes('TRANS')).sort((a, b) => a.student_name.localeCompare(b.student_name));
      const refunds = items.filter(i => !i.type.toUpperCase().includes('TRANS')).sort((a, b) => a.student_name.localeCompare(b.student_name));

      const wb = XLSX.utils.book_new();

      if (transfers.length > 0) {
          const transferData = transfers.map((i, idx) => ({
              '#': idx + 1,
              'Concurso': i.concurso,
              'DNI': i.dni,
              'Nombre Completo': i.student_name,
              'Exp. Petición': i.incoming_file_number || '-',
              'EXAM A TRANSFERIR': i.target_exam || 'NO ESPECIFICADO'
          }));
          const wsTransfers = XLSX.utils.json_to_sheet(transferData);
          XLSX.utils.book_append_sheet(wb, wsTransfers, 'Transferencias');
      }

      if (refunds.length > 0) {
          const refundData = refunds.map((i, idx) => ({
              '#': idx + 1,
              'Concurso': i.concurso,
              'DNI': i.dni,
              'Nombre': i.student_name,
              'Exp. Petición': i.incoming_file_number || '-',
              'Telefono': i.phone || '-',
              'F. Nac.': i.birth_date || '-',
              'Edad': i.age || '-',
              'Nombre Apoderado': i.parent_name || '-',
              'Telf. Apoderado': i.parent_phone || '-',
              'F. Pago': i.payment_date || '-',
              'Monto': `S/ ${i.amount}`,
              'Motivo': i.reason || '-'
          }));
          const wsRefunds = XLSX.utils.json_to_sheet(refundData);
          XLSX.utils.book_append_sheet(wb, wsRefunds, 'Devoluciones');
      }

      XLSX.writeFile(wb, `Reporte_${reportCode.replace(/[^a-zA-Z0-9]/g, '_')}.xlsx`);
  };

  const handleDownloadReport = (format: 'pdf' | 'excel') => {
      if (!blockToDownload) return;
      if (format === 'pdf') {
          generateDIGAReportPDF(blockToDownload.items, blockToDownload.id);
      } else {
          generateDIGAReportExcel(blockToDownload.items, blockToDownload.id);
      }
      setIsDownloadModalOpen(false);
      setBlockToDownload(null);
  };

  const toggleSelection = (id: string) => {
      const next = new Set(selectedIds);
      if (next.has(id)) next.delete(id); else next.add(id);
      setSelectedIds(next);
  };

  const markAsApto = async (id: string) => {
      if(!confirm("¿Confirmar recepción de documentos físicos?")) return;
      try {
          const { error } = await supabase.from('padron_pagos').update({ status: 'Apto' }).eq('id', id);
          if (error) throw error; fetchData();
      } catch (err: any) { alert(err.message); }
  };

  const markAsObserved = async (id: string) => {
      if(!confirm("¿Desea marcar este expediente como OBSERVADO por falta de requisitos físicos?")) return;
      try {
          const { error } = await supabase.from('padron_pagos').update({ status: 'Observado' }).eq('id', id);
          if (error) throw error; fetchData();
      } catch (err: any) { alert(err.message); }
  };

  const uploadResolution = async () => {
      if (!selectedBlock || (!resolutionFile && !resolutionLink) || !resolutionNumber || !resolutionDate) return;
      setIsSubmitting(true);
      try {
          let finalUrl = resolutionLink;

          if (resolutionFile) {
              const sanitizedName = resolutionFile.name.replace(/[^a-zA-Z0-9.]/g, '_');
              const fileName = `${Date.now()}-${sanitizedName}`;
              const { error: uploadError } = await supabase.storage
                  .from('documentos')
                  .upload(`resoluciones/${fileName}`, resolutionFile, {
                      contentType: 'application/pdf',
                      upsert: true
                  });

              if (uploadError) throw uploadError;

              const { data: urlData } = supabase.storage
                  .from('documentos')
                  .getPublicUrl(`resoluciones/${fileName}`);
              
              finalUrl = urlData.publicUrl;
          }
          
          // Update all students in this block to 'Finalizado' and save resolution URL, number and date
          await supabase.from('padron_pagos').update({ 
              status: 'Finalizado',
              resolution_pdf: finalUrl,
              resolution_number: resolutionNumber,
              resolution_date: resolutionDate
          }).eq('outgoing_doc_number', selectedBlock);

          alert(`✅ Resolución subida y bloque finalizado.`);
          setIsResolutionModalOpen(false);
          setResolutionFile(null);
          setResolutionLink('');
          setResolutionNumber('');
          setResolutionDate('');
          setSelectedBlock(null);
          fetchData();
      } catch (err: any) { alert(err.message); } finally { setIsSubmitting(false); }
  };

  const groupedBlocks = useMemo(() => {
      if (statusFilter !== 'En Bloque' && statusFilter !== 'Finalizado') return null;
      const blocks: Record<string, PaymentRegistry[]> = {};
      data.forEach(item => {
          const blockId = item.outgoing_doc_number || 'Sin Bloque Asignado';
          if (!blocks[blockId]) blocks[blockId] = [];
          blocks[blockId].push(item);
      });
      return blocks;
  }, [data, statusFilter]);

  const sortedBlockEntries = useMemo(() => {
      if (!groupedBlocks) return [];
      const entries = Object.entries(groupedBlocks) as [string, PaymentRegistry[]][];

      return entries.sort(([blockA, itemsA], [blockB, itemsB]) => {
          if (blockA === 'Sin Bloque Asignado') return 1;
          if (blockB === 'Sin Bloque Asignado') return -1;

          const expA = expedientesData[blockA];
          const expB = expedientesData[blockB];

          const timeA = expA?.created_at ? new Date(expA.created_at).getTime() : 0;
          const timeB = expB?.created_at ? new Date(expB.created_at).getTime() : 0;

          // Criterio principal: Timestamp de creación del oficio/expediente de salida (más reciente primero)
          if (timeA && timeB && timeA !== timeB) {
              return timeB - timeA;
          }
          if (timeA && !timeB) return -1;
          if (!timeA && timeB) return 1;

          // Criterio secundario: Timestamp más reciente de los alumnos registrados en el bloque
          const itemTimeA = Math.max(...itemsA.map(i => i.created_at ? new Date(i.created_at).getTime() : 0), 0);
          const itemTimeB = Math.max(...itemsB.map(i => i.created_at ? new Date(i.created_at).getTime() : 0), 0);
          if (itemTimeA && itemTimeB && itemTimeA !== itemTimeB) {
              return itemTimeB - itemTimeA;
          }

          // Criterio de respaldo: Orden alfanumérico natural descendente (ej: REP. 10 - 2026 antes de REP. 2 - 2026)
          return blockB.localeCompare(blockA, undefined, { numeric: true, sensitivity: 'base' });
      });
  }, [groupedBlocks, expedientesData]);

  useEffect(() => {
      const blockIds = new Set<string>();
      if (groupedBlocks) {
          Object.keys(groupedBlocks).forEach(id => {
              if (id !== 'Sin Bloque Asignado') blockIds.add(id);
          });
      }
      if (data) {
          data.forEach(item => {
              if (item.outgoing_doc_number) blockIds.add(item.outgoing_doc_number);
          });
      }
      const idsArray = Array.from(blockIds);
      if (idsArray.length > 0) {
          fetchExpedientesData(idsArray);
      }
  }, [groupedBlocks, data]);

  return (
    <div className="w-full max-w-[1500px] mx-auto flex flex-col gap-6 p-4 md:p-8 h-full overflow-hidden">
      {tableMissing && (
          <div className="bg-amber-50 border-l-4 border-amber-500 p-4 rounded-r-lg shadow-sm flex items-start gap-3">
              <span className="material-symbols-outlined text-amber-600 mt-0.5">database_off</span>
              <div>
                  <h3 className="font-bold text-amber-900">Configuración Requerida</h3>
                  <p className="text-amber-800 text-sm mt-1">Ejecute el script actualizado en Configuración.</p>
              </div>
          </div>
      )}

      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-6 shrink-0">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-black leading-tight text-slate-900 flex items-center gap-3">
            <span className="bg-amber-100 text-amber-700 p-2 rounded-xl material-symbols-outlined text-3xl">currency_exchange</span>
            Trámites de Pagos (Padrón)
          </h1>
          <p className="text-slate-500 text-base font-medium">Gestión administrativa de expedientes económicos para remisión a DIGA.</p>
        </div>
        <div className="flex gap-3">
            <button 
                onClick={openTransferControl} 
                className="flex items-center gap-2 rounded-xl h-12 px-5 bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 text-sm font-black shadow-sm transition-all active:scale-95"
            >
                <span className="material-symbols-outlined text-[20px]">move_up</span>
                Control de Transferencias
            </button>
            {(user.role === 'Administrador' || (user.role === 'Operador' && user.permissions?.includes('upload_csv'))) && (
              <button onClick={() => setIsImportModalOpen(true)} className="flex items-center gap-2 rounded-xl h-12 px-5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-sm font-bold shadow-sm transition-all"><span className="material-symbols-outlined text-[20px]">upload_file</span>Importar CSV</button>
            )}
            {(user.role === 'Administrador' || user.role === 'Operador' || user.role === 'Director') && (
              <button onClick={() => setIsBatchModalOpen(true)} disabled={selectedIds.size === 0} className="flex items-center gap-2 rounded-xl h-12 px-8 bg-slate-900 hover:bg-slate-800 text-white text-sm font-black shadow-xl shadow-slate-900/20 disabled:opacity-50 transition-all active:scale-95">
                  <span className="material-symbols-outlined text-[20px]">analytics</span>
                  GENERAR REPORTE ({selectedIds.size})
              </button>
            )}
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-4 justify-between items-center bg-white p-4 rounded-xl border border-slate-200 shadow-sm shrink-0">
         <div className="w-full lg:w-96 relative">
            <span className="material-symbols-outlined absolute left-3 top-2.5 text-slate-400">search</span>
            <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="w-full h-10 pl-10 pr-4 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium focus:bg-white outline-none transition-all" placeholder="Buscar por DNI o Nombre..."/>
         </div>
         <div className="flex gap-2 overflow-x-auto hide-scrollbar">
            {['Todos', 'Aptos (Recibido)', 'En Bloque', 'Finalizado', 'Rechazados'].map(f => (
                <button key={f} onClick={() => { setStatusFilter(f); setCurrentPage(0); }} className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase border transition-all whitespace-nowrap ${statusFilter === f ? (f === 'Rechazados' ? 'bg-red-600 text-white border-red-600 shadow-md' : 'bg-primary text-white border-primary shadow-md') : 'bg-white text-slate-500 hover:bg-slate-50 border-slate-200'}`}>
                    {f}
                </button>
            ))}
         </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm flex-1 flex flex-col">
        {groupedBlocks ? (
            <div className="flex-1 overflow-auto p-4 md:p-6 flex flex-col gap-4 bg-slate-50/50">
                {Object.keys(groupedBlocks).length > 0 && (
                    <div className="flex items-center justify-between bg-white px-5 py-3 rounded-xl border border-slate-200 shadow-sm shrink-0">
                        <div className="flex items-center gap-2">
                            <span className="material-symbols-outlined text-slate-500 text-[20px]">folder_copy</span>
                            <span className="text-xs font-black uppercase text-slate-700 tracking-wider">
                                {Object.keys(groupedBlocks).length} {Object.keys(groupedBlocks).length === 1 ? 'Bloque / Oficio registrado' : 'Bloques / Oficios registrados'}
                            </span>
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={expandAllBlocks}
                                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition-all flex items-center gap-1"
                            >
                                <span className="material-symbols-outlined text-[16px]">unfold_more</span>
                                Expandir todos
                            </button>
                            <button
                                onClick={collapseAllBlocks}
                                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition-all flex items-center gap-1"
                            >
                                <span className="material-symbols-outlined text-[16px]">unfold_less</span>
                                Colapsar todos
                            </button>
                        </div>
                    </div>
                )}

                {sortedBlockEntries.map(([blockId, items]) => {
                    const isExpanded = expandedBlocks.has(blockId);
                    const totalMonto = items.reduce((acc, curr) => acc + (parseFloat(curr.amount) || 0), 0);
                    const transfersCount = items.filter(i => i.type.toUpperCase().includes('TRANS')).length;
                    const refundsCount = items.length - transfersCount;

                    return (
                        <div key={blockId} className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden shrink-0 flex flex-col transition-all">
                            {/* Header del Bloque (Inline Accordion) */}
                            <div className="p-4 md:p-5 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 bg-slate-50 hover:bg-slate-100/70 transition-colors">
                                <div 
                                    onClick={() => toggleBlockExpand(blockId)}
                                    className="flex items-center gap-3 cursor-pointer select-none flex-1"
                                >
                                    <button 
                                        type="button"
                                        className={`size-8 rounded-lg flex items-center justify-center transition-all ${isExpanded ? 'bg-indigo-600 text-white shadow-sm' : 'bg-white border border-slate-200 text-slate-500 hover:bg-slate-200'}`}
                                    >
                                        <span className={`material-symbols-outlined text-[20px] transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}>
                                            chevron_right
                                        </span>
                                    </button>
                                    <div>
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <h3 className="font-black text-slate-900 text-base md:text-lg flex items-center gap-2">
                                                <span className="material-symbols-outlined text-indigo-600 text-[20px]">folder_zip</span>
                                                {blockId}
                                            </h3>
                                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-indigo-50 text-indigo-700 border border-indigo-200">
                                                {items.length} {items.length === 1 ? 'persona' : 'personas'}
                                            </span>
                                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-emerald-50 text-emerald-700 border border-emerald-200">
                                                S/ {totalMonto.toFixed(2)}
                                            </span>
                                            {transfersCount > 0 && (
                                                <span className="px-2 py-0.5 rounded text-[9px] font-bold uppercase bg-purple-50 text-purple-700 border border-purple-200">
                                                    {transfersCount} Transferencias
                                                </span>
                                            )}
                                            {refundsCount > 0 && (
                                                <span className="px-2 py-0.5 rounded text-[9px] font-bold uppercase bg-blue-50 text-blue-700 border border-blue-200">
                                                    {refundsCount} Devoluciones
                                                </span>
                                            )}
                                        </div>

                                        {expedientesData[blockId]?.ref_number && (
                                            <p className="text-xs font-black text-emerald-600 mt-1 flex items-center gap-1">
                                                <span className="material-symbols-outlined text-[15px]">inventory_2</span>
                                                EXP: {expedientesData[blockId].ref_number}
                                                {expedientesData[blockId]?.destination && ` ➔ ${expedientesData[blockId].destination}`}
                                            </p>
                                        )}
                                    </div>
                                </div>

                                <div className="flex gap-2 w-full lg:w-auto flex-wrap justify-end items-center" onClick={e => e.stopPropagation()}>
                                    {expedientesData[blockId]?.pdf_url && (
                                        <a 
                                            href={expedientesData[blockId].pdf_url} 
                                            target="_blank" 
                                            rel="noopener noreferrer" 
                                            className="bg-slate-800 text-white px-3.5 py-2 rounded-xl text-xs font-black uppercase tracking-wider hover:bg-slate-700 transition-all flex items-center gap-1.5 shadow-sm active:scale-95"
                                        >
                                            <span className="material-symbols-outlined text-[16px]">visibility</span>
                                            Expediente PDF
                                        </a>
                                    )}
                                    {statusFilter === 'En Bloque' && !expedientesData[blockId]?.ref_number && blockId !== 'Sin Bloque Asignado' && (
                                        <button 
                                            onClick={() => openExpedienteModal(blockId)} 
                                            className="bg-amber-100 text-amber-800 px-3.5 py-2 rounded-xl text-xs font-black uppercase tracking-wider hover:bg-amber-200 transition-all shadow-sm flex items-center gap-1.5 active:scale-95"
                                        >
                                            <span className="material-symbols-outlined text-[16px]">post_add</span>
                                            Completar Exp.
                                        </button>
                                    )}
                                    {statusFilter === 'En Bloque' && items.some(i => !i.type.toUpperCase().includes('TRANS')) && (user.role === 'Administrador' || user.role === 'Operador' || user.role === 'Director') && (
                                        <button
                                            onClick={() => openRejectBlockRefundsModal(blockId, items)}
                                            className="bg-red-50 text-red-700 hover:bg-red-100 border border-red-200 px-3.5 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-sm flex items-center gap-1.5 active:scale-95"
                                            title="Rechazar devoluciones de este bloque para liberarlas a transferencias"
                                        >
                                            <span className="material-symbols-outlined text-[16px]">cancel</span>
                                            Rechazar Devoluciones
                                        </button>
                                    )}
                                    <button
                                        onClick={() => { setBlockToDownload({ id: blockId, items }); setIsDownloadModalOpen(true); }}
                                        className="bg-slate-100 text-slate-700 px-3.5 py-2 rounded-xl text-xs font-black uppercase tracking-wider hover:bg-slate-200 transition-all shadow-sm flex items-center gap-1.5 active:scale-95"
                                    >
                                        <span className="material-symbols-outlined text-[16px]">download</span>
                                        Reporte
                                    </button>
                                    {statusFilter === 'En Bloque' && (user.role === 'Administrador' || user.role === 'Director') && (
                                        <button 
                                            onClick={() => { setSelectedBlock(blockId); setIsResolutionModalOpen(true); }} 
                                            className="bg-indigo-600 text-white px-3.5 py-2 rounded-xl text-xs font-black uppercase tracking-wider hover:bg-indigo-700 transition-all shadow-sm flex items-center gap-1.5 active:scale-95"
                                        >
                                            <span className="material-symbols-outlined text-[16px]">upload_file</span>
                                            Subir Res.
                                        </button>
                                    )}
                                    {statusFilter === 'Finalizado' && items[0]?.resolution_pdf && (
                                        <a 
                                            href={items[0].resolution_pdf} 
                                            target="_blank" 
                                            rel="noopener noreferrer" 
                                            className="bg-emerald-100 text-emerald-700 px-3.5 py-2 rounded-xl text-xs font-black uppercase tracking-wider hover:bg-emerald-200 transition-all flex items-center gap-1.5 active:scale-95"
                                        >
                                            <span className="material-symbols-outlined text-[16px]">gavel</span>
                                            Resolución
                                        </a>
                                    )}
                                    <button
                                        onClick={() => toggleBlockExpand(blockId)}
                                        className={`px-3.5 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-1.5 ${
                                            isExpanded 
                                            ? 'bg-indigo-50 text-indigo-700 border border-indigo-200' 
                                            : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
                                        }`}
                                    >
                                        <span className="material-symbols-outlined text-[16px]">
                                            {isExpanded ? 'expand_less' : 'list_alt'}
                                        </span>
                                        {isExpanded ? 'Ocultar Lista' : `Ver Lista (${items.length})`}
                                    </button>
                                </div>
                            </div>

                            {/* Detalle Inline Desplegable */}
                            {isExpanded && (
                                <div className="border-t border-slate-200 bg-white overflow-x-auto">
                                    <table className="w-full text-left border-collapse min-w-[900px]">
                                        <thead className="bg-slate-50 border-b border-slate-100 text-[10px] font-black uppercase text-slate-400 tracking-wider">
                                            <tr>
                                                <th className="px-4 py-3 w-12 text-center">#</th>
                                                <th className="px-4 py-3">Estudiante / DNI</th>
                                                <th className="px-4 py-3">Concurso</th>
                                                <th className="px-4 py-3 text-center">Tipo Trámite</th>
                                                <th className="px-4 py-3">Destino / Motivo</th>
                                                <th className="px-4 py-3">Exp. Petición</th>
                                                <th className="px-4 py-3 text-right">Monto</th>
                                                <th className="px-4 py-3">Contacto / Apoderado</th>
                                                {statusFilter === 'En Bloque' && (
                                                    <th className="px-4 py-3 text-center">Acción</th>
                                                )}
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100 text-xs">
                                            {items.map((item, idx) => (
                                                <tr key={item.id} className="hover:bg-indigo-50/30 transition-colors">
                                                    <td className="px-4 py-3 text-center font-bold text-slate-400">
                                                        {idx + 1}
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <div className="flex items-center gap-2.5">
                                                            <div className="size-7 rounded-full bg-slate-100 text-slate-600 font-bold text-xs flex items-center justify-center shrink-0">
                                                                {item.student_name.charAt(0)}
                                                            </div>
                                                            <div>
                                                                <p className="font-bold text-slate-900 uppercase leading-tight">{item.student_name}</p>
                                                                <p className="text-[10px] text-slate-500 font-mono font-bold">DNI: {item.dni}</p>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-3 font-semibold text-slate-600 text-[11px]">
                                                        {item.concurso}
                                                    </td>
                                                    <td className="px-4 py-3 text-center">
                                                        <span className={`inline-flex px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider border ${
                                                            item.type.includes('TRANS') ? 'bg-purple-50 text-purple-700 border-purple-200' : 'bg-blue-50 text-blue-700 border-blue-200'
                                                        }`}>
                                                            {item.type}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-3 text-[11px] text-slate-600 max-w-xs truncate">
                                                        {item.type.includes('TRANS') ? (
                                                            <span className="font-bold text-purple-700 flex items-center gap-1">
                                                                <span className="material-symbols-outlined text-[13px]">arrow_right_alt</span>
                                                                {item.target_exam || 'No especificado'}
                                                            </span>
                                                        ) : (
                                                            <span className="text-slate-600 italic">
                                                                {item.reason || '-'}
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-3 font-mono text-[11px] font-bold text-slate-700">
                                                        {item.incoming_file_number || '-'}
                                                    </td>
                                                    <td className="px-4 py-3 text-right font-mono font-black text-slate-900">
                                                        S/ {item.amount}
                                                    </td>
                                                    <td className="px-4 py-3 text-[10px] text-slate-500">
                                                        {item.phone && <p className="font-semibold text-slate-700">Telf: {item.phone}</p>}
                                                        {item.parent_name && <p className="truncate max-w-[150px]">Apod: {item.parent_name}</p>}
                                                        {!item.phone && !item.parent_name && '-'}
                                                    </td>
                                                    {statusFilter === 'En Bloque' && (
                                                        <td className="px-4 py-3 text-center">
                                                            {!item.type.toUpperCase().includes('TRANS') ? (
                                                                <button
                                                                    onClick={() => openRejectSingleModal(item)}
                                                                    className="bg-red-50 text-red-600 hover:bg-red-100 hover:text-red-700 border border-red-200 px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all inline-flex items-center gap-1"
                                                                    title="Rechazar devolución y desbloquear al estudiante"
                                                                >
                                                                    <span className="material-symbols-outlined text-[14px]">cancel</span>
                                                                    Rechazar
                                                                </button>
                                                            ) : (
                                                                <span className="text-slate-300 text-[10px] font-bold">-</span>
                                                            )}
                                                        </td>
                                                    )}
                                                </tr>
                                            ))}
                                        </tbody>
                                        <tfoot className="bg-slate-50 border-t border-slate-200 text-xs font-bold">
                                            <tr>
                                                <td colSpan={6} className="px-4 py-2.5 text-right text-slate-600 font-bold uppercase text-[10px] tracking-wider">
                                                    Total del Bloque ({items.length} expedientes):
                                                </td>
                                                <td className="px-4 py-2.5 text-right font-mono font-black text-indigo-700 text-sm">
                                                    S/ {totalMonto.toFixed(2)}
                                                </td>
                                                <td colSpan={statusFilter === 'En Bloque' ? 2 : 1}></td>
                                            </tr>
                                        </tfoot>
                                    </table>
                                </div>
                            )}
                        </div>
                    );
                })}
                {Object.keys(groupedBlocks).length === 0 && (
                    <div className="flex flex-col items-center justify-center h-64 text-slate-400 gap-4">
                        <span className="material-symbols-outlined text-6xl opacity-20">folder_off</span>
                        <p className="font-bold uppercase tracking-widest text-sm">No hay bloques en este estado</p>
                    </div>
                )}
            </div>
        ) : (
            <div className="flex-1 overflow-auto">
                <table className="w-full text-left border-collapse min-w-[1200px]">
                <thead className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200 shadow-sm">
                    <tr>
                        <th className="px-4 py-4 w-12 text-center">Sel</th>
                        <th className="px-6 py-4 text-[10px] font-black uppercase text-slate-400 tracking-widest">Estudiante / Identificación</th>
                        <th className="px-6 py-4 text-[10px] font-black uppercase text-slate-400 tracking-widest">Trámite / Monto</th>
                        <th className="px-6 py-4 text-[10px] font-black uppercase text-slate-400 tracking-widest">Expedientes</th>
                        <th className="px-6 py-4 text-[10px] font-black uppercase text-slate-400 tracking-widest">Estado Actual</th>
                        <th className="px-6 py-4 text-[10px] font-black uppercase text-slate-400 tracking-widest text-right pr-10">Gestión</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                    {data.map((item) => (
                        <React.Fragment key={item.id}>
                            <tr className={`group hover:bg-slate-50 transition-colors ${selectedIds.has(item.id) ? 'bg-primary/5' : ''}`}>
                                <td className="px-4 py-4 text-center">
                                    {item.status === 'Apto' ? (
                                        <input type="checkbox" checked={selectedIds.has(item.id)} onChange={() => toggleSelection(item.id)} className="size-5 rounded-md accent-primary cursor-pointer"/>
                                    ) : <span className="material-symbols-outlined text-slate-200 text-[20px]">lock</span>}
                                </td>
                                <td className="px-6 py-4">
                                    <button onClick={() => setExpandedRow(expandedRow === item.id ? null : item.id)} className="flex items-center gap-3 text-left">
                                        <div className={`p-1 rounded-md transition-colors ${expandedRow === item.id ? 'bg-primary text-white' : 'bg-slate-100 text-slate-400'}`}>
                                            <span className={`material-symbols-outlined text-[20px] transition-transform ${expandedRow === item.id ? 'rotate-90' : ''}`}>chevron_right</span>
                                        </div>
                                        <div>
                                            <p className="font-bold text-slate-900 text-sm uppercase leading-tight">{item.student_name}</p>
                                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{item.dni} • {item.concurso}</p>
                                        </div>
                                    </button>
                                </td>
                                <td className="px-6 py-4">
                                    <div className="flex flex-col gap-1">
                                        <p className="font-black text-slate-800 text-sm">S/ {item.amount}</p>
                                        <span className={`inline-flex w-fit px-2 py-0.5 rounded text-[9px] font-black uppercase border ${item.type.includes('TRANS') ? 'bg-purple-50 text-purple-700 border-purple-200' : 'bg-blue-50 text-blue-700 border-blue-200'}`}>
                                            {item.type}
                                        </span>
                                    </div>
                                </td>
                                <td className="px-6 py-4 text-[10px] font-bold">
                                    {item.incoming_file_number && <p className="text-slate-600 flex items-center gap-1"><span className="material-symbols-outlined text-[14px]">login</span> EXP: {item.incoming_file_number}</p>}
                                    {item.outgoing_doc_number && (
                                        <div className="mt-1 p-1.5 bg-slate-50 rounded border border-slate-100">
                                            <p className="text-blue-600 flex items-center gap-1"><span className="material-symbols-outlined text-[14px]">logout</span> OFICIO: {item.outgoing_doc_number}</p>
                                            {expedientesData[item.outgoing_doc_number]?.ref_number && (
                                                <p className="text-emerald-600 flex items-center gap-1 mt-0.5"><span className="material-symbols-outlined text-[14px]">inventory_2</span> EXP: {expedientesData[item.outgoing_doc_number].ref_number}</p>
                                            )}
                                        </div>
                                    )}
                                </td>
                                 <td className="px-6 py-4">
                                    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                                        item.status === 'Apto' ? 'bg-green-50 text-green-700 border-green-200' :
                                        item.status === 'En Bloque' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                                        item.status === 'Finalizado' ? 'bg-indigo-50 text-indigo-700 border-indigo-200' :
                                        item.status === 'Rechazado' ? 'bg-red-50 text-red-700 border-red-200' :
                                        'bg-slate-50 text-slate-500 border-slate-200'
                                    }`}>
                                        <span className={`size-1.5 rounded-full ${!item.status ? 'bg-slate-400' : 'bg-current opacity-60'}`}></span>
                                        {item.status || 'No Solicitado'}
                                    </span>
                                </td>
                                <td className="px-6 py-4 text-right pr-10">
                                    <div className="flex justify-end items-center gap-2">
                                        {item.status === 'En Bloque' && !item.type.toUpperCase().includes('TRANS') && (
                                            <button
                                                onClick={() => openRejectSingleModal(item)}
                                                className="bg-red-50 text-red-600 hover:bg-red-100 hover:text-red-700 border border-red-200 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 flex items-center gap-1"
                                                title="Rechazar Devolución"
                                            >
                                                <span className="material-symbols-outlined text-[14px]">cancel</span>
                                                Rechazar
                                            </button>
                                        )}
                                        {item.status === 'Rechazado' && (
                                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-600 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-xl">
                                                <span className="material-symbols-outlined text-[14px]">lock_open</span>
                                                Desbloqueado p/ Transferencia
                                            </span>
                                        )}
                                        {item.outgoing_doc_number && expedientesData[item.outgoing_doc_number]?.pdf_url && (
                                            <a 
                                                href={expedientesData[item.outgoing_doc_number].pdf_url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="bg-slate-100 text-slate-600 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-200 transition-all active:scale-95 flex items-center gap-1"
                                                title="Ver Expediente PDF"
                                            >
                                                <span className="material-symbols-outlined text-[14px]">inventory_2</span>
                                                Expediente
                                            </a>
                                        )}
                                        {item.status === 'Finalizado' && item.resolution_pdf && (
                                            <a 
                                                href={item.resolution_pdf}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="bg-indigo-50 text-indigo-600 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-100 transition-all active:scale-95 flex items-center gap-1"
                                                title="Ver Resolución PDF"
                                            >
                                                <span className="material-symbols-outlined text-[14px]">gavel</span>
                                                Resolución
                                            </a>
                                        )}
                                    </div>
                                </td>
                            </tr>
                            {expandedRow === item.id && (
                                <tr className="bg-slate-50/70 animate-in fade-in slide-in-from-top-1">
                                    <td colSpan={6} className="px-12 py-6 border-l-4 border-primary">
                                        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
                                            <div className="flex flex-col gap-2">
                                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Contacto Estudiante</p>
                                                <p className="text-xs font-bold text-slate-700 flex items-center gap-2"><span className="material-symbols-outlined text-slate-400">call</span> {item.phone || 'N/R'}</p>
                                                <p className="text-xs font-bold text-slate-700 flex items-center gap-2"><span className="material-symbols-outlined text-slate-400">cake</span> {item.birth_date} ({item.age} años)</p>
                                            </div>
                                            <div className="flex flex-col gap-2">
                                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Información Apoderado</p>
                                                <p className="text-xs font-bold text-slate-700 flex items-center gap-2"><span className="material-symbols-outlined text-slate-400">person</span> {item.parent_name || 'N/R'}</p>
                                                <p className="text-xs font-bold text-slate-700 flex items-center gap-2"><span className="material-symbols-outlined text-slate-400">call</span> {item.parent_phone || 'N/R'}</p>
                                            </div>
                                            <div className="flex flex-col gap-2">
                                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Detalle Pago / Trámite</p>
                                                <p className="text-xs font-bold text-slate-700 flex items-center gap-2"><span className="material-symbols-outlined text-slate-400">event</span> {item.payment_date || '-'}</p>
                                                {item.type.includes('TRANS') && <p className="text-xs font-bold text-purple-700 flex items-center gap-2"><span className="material-symbols-outlined text-purple-400">move_up</span> {item.target_exam || 'Sin destino'}</p>}
                                            </div>
                                            <div className="flex flex-col gap-2 col-span-1">
                                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Sustento del Trámite</p>
                                                <p className="text-[11px] text-slate-600 leading-relaxed italic border-l-2 border-slate-200 pl-3">"${item.reason || 'Sin observación adicional.'}"</p>
                                            </div>
                                        </div>
                                        {item.status === 'Rechazado' && (
                                            <div className="mt-4 p-4 rounded-xl bg-red-50 border border-red-200 flex flex-col md:flex-row md:items-center justify-between gap-3">
                                                <div className="flex items-center gap-3">
                                                    <div className="size-8 rounded-lg bg-red-100 text-red-600 flex items-center justify-center shrink-0">
                                                        <span className="material-symbols-outlined text-[18px]">history</span>
                                                    </div>
                                                    <div>
                                                        <p className="text-xs font-black text-red-800 uppercase tracking-wider">Historial de Rechazo de Devolución</p>
                                                        <p className="text-[11px] text-red-700 mt-0.5"><span className="font-bold">Motivo:</span> {item.rejection_reason || 'No especificado'}</p>
                                                    </div>
                                                </div>
                                                <div className="text-[10px] font-bold text-red-600 text-right shrink-0">
                                                    <p>Fecha: {item.rejection_date ? new Date(item.rejection_date).toLocaleDateString('es-PE') : '-'}</p>
                                                    {item.rejected_by && <p>Por: {item.rejected_by}</p>}
                                                    {item.previous_block_id && <p>Bloque Origen: {item.previous_block_id}</p>}
                                                </div>
                                            </div>
                                        )}
                                    </td>
                                </tr>
                            )}
                        </React.Fragment>
                    ))}
                </tbody>
            </table>
        </div>
        )}
        <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between shrink-0">
            <p className="text-xs text-slate-500 font-bold">Mostrando {data.length} de {totalCount} registros</p>
            <div className="flex gap-2">
                <button 
                    onClick={() => setCurrentPage(p => Math.max(0, p - 1))} 
                    disabled={currentPage === 0}
                    className="px-4 py-2 bg-white border border-slate-200 rounded-lg text-xs font-black text-slate-600 disabled:opacity-50 hover:bg-slate-50 transition-colors"
                >
                    Anterior
                </button>
                <button 
                    onClick={() => setCurrentPage(p => p + 1)} 
                    disabled={(currentPage + 1) * ITEMS_PER_PAGE >= totalCount}
                    className="px-4 py-2 bg-white border border-slate-200 rounded-lg text-xs font-black text-slate-600 disabled:opacity-50 hover:bg-slate-50 transition-colors"
                >
                    Siguiente
                </button>
            </div>
        </div>
      </div>

      {/* MODAL COMPLETAR EXPEDIENTE */}
      {isExpedienteModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
              <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-10 text-center animate-in zoom-in-95">
                  <div className="size-20 bg-amber-50 text-amber-600 rounded-full flex items-center justify-center mx-auto mb-6 border border-amber-100">
                      <span className="material-symbols-outlined text-5xl">inventory_2</span>
                  </div>
                  <h3 className="font-black text-slate-900 uppercase text-xl tracking-tight">Completar Expediente</h3>
                  <p className="text-xs text-slate-500 mt-3 mb-8 font-medium leading-relaxed px-6">
                      Añade el número de expediente oficial y el documento escaneado para el bloque <b>{selectedBlockForExpediente}</b>.
                  </p>
                  
                  <div className="flex flex-col gap-4 text-left mb-8">
                      <label className="flex flex-col gap-1">
                          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Nº Expediente</span>
                          <input 
                              value={expedienteRefNumber} 
                              onChange={e => setExpedienteRefNumber(e.target.value)} 
                              className="h-12 px-4 rounded-xl border-2 border-slate-100 bg-slate-50 text-sm font-bold focus:border-amber-400 focus:bg-white outline-none transition-all" 
                              placeholder="Ej: 202612345" 
                          />
                      </label>
                      <label className="flex flex-col gap-1">
                          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Destino (Oficina)</span>
                          <input 
                              value={expedienteDestination} 
                              onChange={e => setExpedienteDestination(e.target.value)} 
                              className="h-12 px-4 rounded-xl border-2 border-slate-100 bg-slate-50 text-sm font-bold focus:border-amber-400 focus:bg-white outline-none transition-all" 
                              placeholder="Ej: DIGA" 
                          />
                      </label>
                      <div className="flex flex-col gap-1 mt-2">
                          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Archivo PDF (Escaneo)</span>
                          <input 
                              type="file" 
                              accept=".pdf"
                              onChange={e => setExpedienteFile(e.target.files?.[0] || null)}
                              className="w-full border-2 border-dashed border-slate-200 rounded-2xl p-4 text-sm text-slate-600 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-black file:bg-amber-50 file:text-amber-700 hover:file:bg-amber-100 cursor-pointer bg-slate-50 transition-all hover:border-amber-300"
                          />
                      </div>
                  </div>

                  <div className="flex gap-4">
                      <button onClick={() => setIsExpedienteModalOpen(false)} className="flex-1 font-black text-slate-400 uppercase tracking-widest text-[10px] hover:text-slate-600 transition-colors">Cancelar</button>
                      <button 
                        onClick={saveExpediente} 
                        disabled={!expedienteRefNumber.trim() || isSubmitting} 
                        className="flex-[2] h-14 bg-amber-500 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] shadow-xl shadow-amber-500/30 flex items-center justify-center gap-3 active:scale-95 transition-all disabled:opacity-50"
                      >
                          {isSubmitting ? 'GUARDANDO...' : 'GUARDAR EXPEDIENTE'}
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* MODAL SUBIR RESOLUCIÓN */}
      {isResolutionModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
              <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-10 text-center animate-in zoom-in-95">
                  <div className="size-20 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center mx-auto mb-6 border border-indigo-100">
                      <span className="material-symbols-outlined text-5xl">upload_file</span>
                  </div>
                  <h3 className="font-black text-slate-900 uppercase text-xl tracking-tight">Subir Resolución</h3>
                  <p className="text-xs text-slate-500 mt-3 mb-8 font-medium leading-relaxed px-6">
                      Adjunte el PDF de la resolución para el bloque <b>{selectedBlock}</b>. Esto finalizará el trámite para todos los estudiantes incluidos.
                  </p>
                  
                  <div className="flex flex-col gap-4 text-left mb-10">
                      <label className="flex flex-col gap-1">
                          <span className="text-[10px] font-black text-slate-500 uppercase">Nº Resolución VRAC</span>
                          <input value={resolutionNumber} onChange={e => setResolutionNumber(e.target.value)} className="h-12 px-4 rounded-xl border-2 border-slate-100 bg-slate-50 font-bold outline-none" placeholder="R-001-2024-VRAC" />
                      </label>
                      <label className="flex flex-col gap-1">
                          <span className="text-[10px] font-black text-slate-500 uppercase">Fecha Emisión</span>
                          <input type="date" value={resolutionDate} onChange={e => setResolutionDate(e.target.value)} className="h-12 px-4 rounded-xl border-2 border-slate-100 bg-slate-50 font-bold outline-none" />
                      </label>

                      <div className="flex flex-col gap-2 p-4 bg-slate-50 rounded-2xl border border-slate-100 mt-2">
                          <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Documento de Resolución</span>
                          
                          <label className="flex flex-col gap-1.5">
                              <span className="text-[10px] font-bold text-slate-400 uppercase">Subir Archivo PDF</span>
                              <div className="relative">
                                  <input 
                                      type="file" 
                                      accept=".pdf"
                                      onChange={e => {
                                          setResolutionFile(e.target.files?.[0] || null);
                                          if (e.target.files?.[0]) setResolutionLink('');
                                      }}
                                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                                      disabled={!!resolutionLink}
                                  />
                                  <div className={`h-12 px-4 rounded-xl border-2 border-dashed flex items-center justify-between transition-all ${resolutionLink ? 'bg-slate-100 border-slate-200 opacity-50' : resolutionFile ? 'bg-indigo-50 border-indigo-200' : 'bg-white border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/30'}`}>
                                      <span className={`text-xs font-bold truncate pr-4 ${resolutionFile ? 'text-indigo-700' : 'text-slate-400'}`}>
                                          {resolutionFile ? resolutionFile.name : 'Seleccionar archivo PDF...'}
                                      </span>
                                      <span className={`material-symbols-outlined text-lg ${resolutionFile ? 'text-indigo-500' : 'text-slate-300'}`}>
                                          {resolutionFile ? 'check_circle' : 'upload_file'}
                                      </span>
                                  </div>
                              </div>
                          </label>

                          <div className="flex items-center gap-4 my-1">
                              <div className="h-px bg-slate-200 flex-1"></div>
                              <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">O</span>
                              <div className="h-px bg-slate-200 flex-1"></div>
                          </div>

                          <label className="flex flex-col gap-1.5">
                              <span className="text-[10px] font-bold text-slate-400 uppercase">Enlace de Drive</span>
                              <input 
                                  type="url" 
                                  placeholder="https://drive.google.com/..."
                                  value={resolutionLink}
                                  onChange={e => {
                                      setResolutionLink(e.target.value);
                                      if (e.target.value) setResolutionFile(null);
                                  }}
                                  className="h-12 px-4 rounded-xl border-2 border-slate-100 bg-white text-xs font-mono outline-none focus:border-indigo-300 transition-all disabled:opacity-50 disabled:bg-slate-100"
                                  disabled={!!resolutionFile}
                              />
                          </label>
                      </div>
                  </div>

                  <div className="flex gap-4">
                      <button onClick={() => { setIsResolutionModalOpen(false); setResolutionFile(null); setResolutionLink(''); setResolutionNumber(''); setResolutionDate(''); }} className="flex-1 font-black text-slate-400 uppercase tracking-widest text-[10px] hover:text-slate-600 transition-colors">Cancelar</button>
                      <button 
                        onClick={uploadResolution} 
                        disabled={(!resolutionFile && !resolutionLink) || !resolutionNumber || !resolutionDate || isSubmitting} 
                        className="flex-[2] h-16 bg-indigo-600 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] shadow-2xl shadow-indigo-600/30 flex items-center justify-center gap-3 active:scale-95 transition-all disabled:opacity-50"
                      >
                          {isSubmitting ? 'SUBIENDO...' : 'SUBIR Y FINALIZAR'}
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* MODAL IMPORTACIÓN */}
      {isImportModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl p-8 animate-in zoom-in-95">
                  <div className="flex justify-between items-center mb-6">
                      <h3 className="font-black text-slate-900 uppercase tracking-tight text-xl">Importar Padrón de Pagos</h3>
                      <button onClick={() => setIsImportModalOpen(false)} className="text-slate-400 hover:text-slate-600 transition-colors"><span className="material-symbols-outlined">close</span></button>
                  </div>
                  <div className="bg-blue-50 p-5 rounded-2xl border border-blue-100 mb-8 flex flex-col gap-3">
                      <div className="flex items-start gap-3">
                          <span className="material-symbols-outlined text-blue-600 mt-0.5">info</span>
                          <div className="flex flex-col gap-2">
                              <p className="text-xs text-blue-800 font-bold">El archivo CSV debe tener las siguientes 19 columnas en este orden exacto (separadas por comas):</p>
                              <p className="text-[10px] text-blue-700 font-mono bg-blue-100/50 p-2 rounded-lg leading-relaxed">
                                  1. Concurso | 2. DNI | 3. Nombres | 4. Teléfono | 5. F. Nacimiento | 6. Edad | 7. Nombre Apoderado | 8. Telf. Apoderado | 9. Fecha Pago | 10. Monto | 11. Motivo | 12. Tipo (Trans/Dev) | 13. Examen Destino | 14. Estado | 15. N° Expediente | 16. N° Salida | 17. N° Resolución | 18. Fecha Resolución | 19. PDF Resolución
                              </p>
                          </div>
                      </div>
                  </div>
                  <div 
                    className="border-3 border-dashed border-slate-200 rounded-3xl p-12 text-center cursor-pointer hover:border-primary hover:bg-slate-50 transition-all group" 
                    onClick={() => csvInputRef.current?.click()}
                  >
                      <span className="material-symbols-outlined text-5xl text-slate-300 group-hover:text-primary group-hover:scale-110 transition-all">cloud_upload</span>
                      <p className="text-sm font-black text-slate-700 mt-4 uppercase tracking-widest">{csvPreview.length > 0 ? `${csvPreview.length} registros detectados` : 'Seleccionar archivo CSV'}</p>
                      <input type="file" accept=".csv" ref={csvInputRef} className="hidden" onChange={handleCsvFile}/>
                  </div>
                  <div className="flex justify-end gap-4 mt-10">
                      <button onClick={() => setIsImportModalOpen(false)} className="text-xs font-black text-slate-400 uppercase tracking-widest px-4 transition-colors hover:text-slate-600">Cancelar</button>
                      <button onClick={processImport} disabled={csvPreview.length === 0 || isSubmitting} className="px-10 py-4 bg-primary text-white rounded-2xl font-black uppercase tracking-widest text-xs shadow-xl shadow-primary/30 disabled:opacity-50 active:scale-95 transition-all">Cargar a Base de Datos</button>
                  </div>
              </div>
          </div>
      )}

      {/* MODAL CONTROL DE TRANSFERENCIAS */}
      {isTransferControlOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
              <div className="bg-white rounded-3xl shadow-2xl w-full max-w-6xl h-[85vh] flex flex-col overflow-hidden animate-in zoom-in-95">
                  <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50 shrink-0">
                      <div className="flex items-center gap-4">
                          <div className="size-12 bg-purple-100 text-purple-600 rounded-2xl flex items-center justify-center">
                              <span className="material-symbols-outlined text-2xl">move_up</span>
                          </div>
                          <div>
                              <h3 className="font-black text-slate-900 uppercase text-xl tracking-tight">Control de Transferencias</h3>
                              <p className="text-xs text-slate-500 font-bold">Gestión y notificación de estudiantes por examen destino</p>
                          </div>
                      </div>
                      <button onClick={() => setIsTransferControlOpen(false)} className="size-10 rounded-full bg-white border border-slate-200 text-slate-400 hover:text-slate-600 hover:bg-slate-50 flex items-center justify-center transition-all"><span className="material-symbols-outlined">close</span></button>
                  </div>

                  <div className="flex flex-1 overflow-hidden">
                      {/* Sidebar: Exámenes Destino */}
                      <div className="w-1/3 max-w-[300px] border-r border-slate-100 bg-slate-50/50 flex flex-col">
                          <div className="p-4 border-b border-slate-100 shrink-0">
                              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Exámenes Destino</p>
                          </div>
                          <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-1">
                              {loadingTransfers ? (
                                  <div className="p-8 text-center text-slate-400">
                                      <span className="material-symbols-outlined animate-spin text-3xl">progress_activity</span>
                                  </div>
                              ) : Object.keys(groupedTransfers).length === 0 ? (
                                  <div className="p-8 text-center text-slate-400">
                                      <p className="text-xs font-bold">No hay transferencias registradas.</p>
                                  </div>
                              ) : (
                                  (Object.entries(groupedTransfers) as [string, PaymentRegistry[]][]).map(([exam, items]) => {
                                      const pendingCount = items.filter(i => !i.transfer_notified).length;
                                      return (
                                          <button 
                                              key={exam}
                                              onClick={() => setSelectedTransferExam(exam)}
                                              className={`w-full text-left p-4 rounded-xl transition-all flex flex-col gap-2 ${selectedTransferExam === exam ? 'bg-white border border-purple-200 shadow-sm' : 'hover:bg-slate-100 border border-transparent'}`}
                                          >
                                              <div className="flex justify-between items-start">
                                                  <span className="font-black text-sm text-slate-800 leading-tight">{exam}</span>
                                                  <span className="material-symbols-outlined text-slate-300 text-[18px]">chevron_right</span>
                                              </div>
                                              <div className="flex gap-2">
                                                  <span className="text-[10px] font-bold bg-slate-100 text-slate-500 px-2 py-0.5 rounded-md">{items.length} Total</span>
                                                  {pendingCount > 0 && (
                                                      <span className="text-[10px] font-bold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-md">{pendingCount} Pendientes</span>
                                                  )}
                                              </div>
                                          </button>
                                      );
                                  })
                              )}
                          </div>
                      </div>

                      {/* Main Content: Lista de Estudiantes */}
                      <div className="flex-1 bg-white flex flex-col overflow-hidden">
                          {selectedTransferExam && groupedTransfers[selectedTransferExam] ? (
                              <>
                                  <div className="p-6 border-b border-slate-100 shrink-0 flex justify-between items-center bg-white">
                                      <div>
                                          <h4 className="font-black text-slate-800 text-lg">{selectedTransferExam}</h4>
                                          <p className="text-xs text-slate-500 font-medium mt-1">Lista de estudiantes que solicitaron transferencia a este examen.</p>
                                      </div>
                                  </div>
                                  <div className="flex-1 overflow-y-auto p-6">
                                      <div className="flex flex-col gap-3">
                                          {groupedTransfers[selectedTransferExam].map(student => (
                                              <div key={student.id} className={`flex flex-col md:flex-row items-start md:items-center justify-between p-4 rounded-2xl border transition-all ${student.transfer_notified ? 'bg-slate-50 border-slate-200 opacity-60' : 'bg-white border-slate-200 shadow-sm hover:border-purple-200'}`}>
                                                  <div className="flex items-center gap-4 mb-4 md:mb-0">
                                                      <button 
                                                          onClick={() => toggleTransferNotified(student.id, student.transfer_notified)}
                                                          className={`size-8 rounded-lg flex items-center justify-center border-2 transition-all ${student.transfer_notified ? 'bg-emerald-500 border-emerald-500 text-white' : 'bg-white border-slate-300 text-transparent hover:border-emerald-400'}`}
                                                      >
                                                          <span className="material-symbols-outlined text-[18px] font-bold">check</span>
                                                      </button>
                                                      <div>
                                                          <p className={`font-black uppercase ${student.transfer_notified ? 'text-slate-500 line-through decoration-slate-300' : 'text-slate-900'}`}>{student.student_name}</p>
                                                          <div className="flex items-center gap-3 mt-1">
                                                              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{student.dni}</span>
                                                              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">•</span>
                                                              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">S/ {student.amount}</span>
                                                          </div>
                                                      </div>
                                                  </div>
                                                  <div className="flex items-center gap-3 w-full md:w-auto pl-12 md:pl-0">
                                                      {(student.resolution_number || student.resolution_pdf) && (
                                                          <a 
                                                              href={student.resolution_pdf && student.resolution_pdf.startsWith('http') ? student.resolution_pdf : '#'} 
                                                              target="_blank" 
                                                              rel="noopener noreferrer" 
                                                              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border transition-colors ${student.resolution_pdf && student.resolution_pdf.startsWith('http') ? 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100' : 'bg-slate-50 text-slate-500 border-slate-200 cursor-default'}`} 
                                                              title={student.resolution_pdf && student.resolution_pdf.startsWith('http') ? "Ver Resolución" : "Resolución registrada sin documento"}
                                                              onClick={(e) => !(student.resolution_pdf && student.resolution_pdf.startsWith('http')) && e.preventDefault()}
                                                          >
                                                              <span className="material-symbols-outlined text-[18px]">description</span>
                                                              <span className="text-[10px] font-bold uppercase tracking-wider">{student.resolution_number && student.resolution_number.trim() !== '' ? student.resolution_number : 'VER RESOLUCIÓN'}</span>
                                                          </a>
                                                      )}
                                                      <div className="flex flex-col items-start md:items-end ml-2">
                                                          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Celular</span>
                                                          <span className="font-bold text-slate-700">{student.phone || 'No registrado'}</span>
                                                      </div>
                                                      {student.phone && (
                                                          <a 
                                                              href={`https://wa.me/51${student.phone.replace(/\D/g, '')}?text=${encodeURIComponent(`Hola ${student.student_name}, te saludamos de Admisión UNSAAC. Te informamos que ya iniciaron las inscripciones para el examen ${student.target_exam} al cual solicitaste transferencia.`)}`}
                                                              target="_blank"
                                                              rel="noopener noreferrer"
                                                              className="size-10 bg-[#25D366] text-white rounded-xl flex items-center justify-center shadow-md shadow-[#25D366]/20 hover:bg-[#1ebe57] transition-all active:scale-95 ml-2"
                                                              title="Enviar WhatsApp"
                                                          >
                                                              <span className="material-symbols-outlined">chat</span>
                                                          </a>
                                                      )}
                                                  </div>
                                              </div>
                                          ))}
                                      </div>
                                  </div>
                              </>
                          ) : (
                              <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
                                  <span className="material-symbols-outlined text-6xl opacity-20 mb-4">touch_app</span>
                                  <p className="font-bold">Selecciona un examen de la lista</p>
                              </div>
                          )}
                      </div>
                  </div>
              </div>
          </div>
      )}

      {/* MODAL DESCARGAR REPORTE */}
      {isDownloadModalOpen && blockToDownload && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
              <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-10 text-center animate-in zoom-in-95">
                  <div className="size-20 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-6 border border-blue-100">
                      <span className="material-symbols-outlined text-5xl">download</span>
                  </div>
                  <h3 className="font-black text-slate-900 uppercase text-xl tracking-tight">Descargar Reporte</h3>
                  <p className="text-xs text-slate-500 mt-3 mb-8 font-medium leading-relaxed px-6">¿En qué formato deseas descargar el reporte del bloque <b>{blockToDownload.id}</b>?</p>
                  
                  <div className="flex flex-col gap-4">
                      <button 
                        onClick={() => handleDownloadReport('pdf')} 
                        className="w-full h-14 bg-red-50 text-red-700 border border-red-200 rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-red-100 transition-all flex items-center justify-center gap-3 active:scale-95"
                      >
                          <span className="material-symbols-outlined text-[20px]">picture_as_pdf</span>
                          Descargar PDF
                      </button>
                      <button 
                        onClick={() => handleDownloadReport('excel')} 
                        className="w-full h-14 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-emerald-100 transition-all flex items-center justify-center gap-3 active:scale-95"
                      >
                          <span className="material-symbols-outlined text-[20px]">table_view</span>
                          Descargar Excel
                      </button>
                  </div>

                  <button onClick={() => { setIsDownloadModalOpen(false); setBlockToDownload(null); }} className="mt-6 font-black text-slate-400 uppercase tracking-widest text-[10px] hover:text-slate-600 transition-colors w-full">Cancelar</button>
              </div>
          </div>
      )}

      {/* MODAL GENERAR REPORTE (BÚSQUEDA DE REMESA) */}
      {isBatchModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
              <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md p-10 text-center animate-in zoom-in-95">
                  <div className="size-20 bg-amber-50 text-amber-600 rounded-full flex items-center justify-center mx-auto mb-6 border border-amber-100">
                      <span className="material-symbols-outlined text-5xl">print_connect</span>
                  </div>
                  <h3 className="font-black text-slate-900 uppercase text-xl tracking-tight">Generar Reporte de Remesa</h3>
                  <p className="text-xs text-slate-500 mt-3 mb-8 font-medium leading-relaxed px-6">Se agruparán <b>{selectedIds.size}</b> alumnos en un nuevo informe para la DIGA. Se generará un PDF inteligente con los formatos requeridos.</p>
                  
                  <div className="flex flex-col gap-2 text-left mb-10">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Número Correlativo de Remesa</span>
                      <div className="relative">
                          <input 
                            value={reportNumber} 
                            onChange={e => setReportNumber(e.target.value)} 
                            className="w-full h-16 px-6 bg-slate-50 border-2 border-slate-200 rounded-2xl font-black text-2xl text-center focus:border-primary focus:bg-white outline-none transition-all" 
                            placeholder="001"
                            autoFocus
                          />
                          <span className="absolute right-6 top-5 text-slate-400 font-black text-sm">/ {new Date().getFullYear()}</span>
                      </div>
                  </div>

                  <div className="flex gap-4">
                      <button onClick={() => setIsBatchModalOpen(false)} className="flex-1 font-black text-slate-400 uppercase tracking-widest text-[10px] hover:text-slate-600 transition-colors">Cancelar</button>
                      <button 
                        onClick={generateBatchReport} 
                        disabled={!reportNumber || isSubmitting} 
                        className="flex-[2] h-16 bg-slate-900 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] shadow-2xl shadow-slate-900/40 flex items-center justify-center gap-3 active:scale-95 transition-all disabled:opacity-50"
                      >
                          <span className="material-symbols-outlined text-[20px]">file_download</span>
                          PROCEDER E IMPRIMIR
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* MODAL RECHAZAR DEVOLUCIÓN (DESBLOQUEO PARA TRANSFERENCIA) */}
      {isRejectModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
              <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg p-8 animate-in zoom-in-95 border border-slate-100 flex flex-col gap-5">
                  <div className="flex items-center gap-4 border-b border-slate-100 pb-5">
                      <div className="size-14 rounded-2xl bg-red-50 text-red-600 border border-red-200 flex items-center justify-center shrink-0 shadow-sm">
                          <span className="material-symbols-outlined text-3xl">cancel</span>
                      </div>
                      <div>
                          <h3 className="font-black text-slate-900 uppercase text-lg tracking-tight">
                              {rejectionScope === 'single' ? 'Rechazar Trámite de Devolución' : 'Rechazar Devoluciones del Bloque'}
                          </h3>
                          <p className="text-xs text-slate-500 font-medium mt-0.5">
                              {rejectionScope === 'single' 
                                  ? 'Desvincula al postulante del bloque para que pueda ingresar como transferencia.' 
                                  : `Se desvincularán ${blockToRejectRefunds?.items.length || 0} devoluciones de este oficio.`}
                          </p>
                      </div>
                  </div>

                  {/* Resumen del/los afectado(s) */}
                  {rejectionScope === 'single' && itemToReject && (
                      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex flex-col gap-2">
                          <div className="flex justify-between items-start">
                              <div>
                                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Postulante</span>
                                  <p className="font-black text-slate-900 uppercase text-sm">{itemToReject.student_name}</p>
                              </div>
                              <span className="font-mono text-xs font-bold bg-white border border-slate-200 px-2 py-0.5 rounded-lg text-slate-700">DNI: {itemToReject.dni}</span>
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t border-slate-200/60">
                              <div>
                                  <span className="text-[10px] font-bold text-slate-400 uppercase">Monto:</span>
                                  <p className="font-black text-indigo-700">S/ {itemToReject.amount}</p>
                              </div>
                              <div>
                                  <span className="text-[10px] font-bold text-slate-400 uppercase">Bloque actual:</span>
                                  <p className="font-bold text-slate-700 truncate">{itemToReject.outgoing_doc_number || '-'}</p>
                              </div>
                          </div>
                      </div>
                  )}

                  {rejectionScope === 'block' && blockToRejectRefunds && (
                      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
                          <div className="flex items-center gap-2 text-amber-800 font-bold text-xs mb-2">
                              <span className="material-symbols-outlined text-[18px]">warning</span>
                              <span>Bloque: {blockToRejectRefunds.blockId}</span>
                          </div>
                          <p className="text-xs text-amber-900 font-medium">
                              Se liberarán <b className="font-black text-amber-950">{blockToRejectRefunds.items.length}</b> solicitudes de devolución asociadas a este oficio. Los registros quedarán en estado <b>Rechazado</b> con su historial archivado.
                          </p>
                      </div>
                  )}

                  {/* Input de motivo */}
                  <div className="flex flex-col gap-2">
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                          Motivo del Rechazo / Justificación <span className="text-red-500">*</span>
                      </label>
                      <textarea
                          value={rejectionReasonInput}
                          onChange={e => setRejectionReasonInput(e.target.value)}
                          placeholder="Ej: Rechazado por DGA - Postulante opta por cambio a Transferencia de Examen..."
                          className="w-full h-24 p-3 bg-slate-50 border-2 border-slate-200 rounded-2xl text-xs font-medium focus:bg-white focus:border-red-500 outline-none transition-all resize-none"
                          autoFocus
                      />
                      <p className="text-[10px] text-slate-400 italic">
                          ℹ️ Al confirmar, el postulante quedará desbloqueado y disponible para registrar su nuevo trámite de transferencia en la mesa de partes.
                      </p>
                  </div>

                  <div className="flex gap-3 pt-2">
                      <button
                          onClick={() => {
                              setIsRejectModalOpen(false);
                              setItemToReject(null);
                              setBlockToRejectRefunds(null);
                              setRejectionReasonInput('');
                          }}
                          className="flex-1 h-12 bg-slate-100 text-slate-600 rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-slate-200 transition-all active:scale-95"
                          disabled={isSubmitting}
                      >
                          Cancelar
                      </button>
                      <button
                          onClick={confirmRejection}
                          disabled={!rejectionReasonInput.trim() || isSubmitting}
                          className="flex-[2] h-12 bg-red-600 hover:bg-red-700 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] shadow-lg shadow-red-600/30 flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                          <span className="material-symbols-outlined text-[18px]">lock_open</span>
                          {isSubmitting ? 'Procesando...' : 'Confirmar Rechazo y Desbloquear'}
                      </button>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};
