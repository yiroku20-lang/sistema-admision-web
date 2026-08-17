// Archivo principal de Expedientes Entrantes
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { supabase } from '../lib/supabaseClient';
import { IncomingFile, Participant, Template, PaymentRegistry, User } from '../types';
import { UnifiedTimelineModal } from '../components/UnifiedTimelineModal';



const COMMON_SUBJECTS = [
  "CONSTANCIA DE INGRESO",
  "INFORME DE RECTIFICACIÓN DE DATOS",
  "INFORME DE RENUNCIA",
  "DEVOLUCIÓN",
  "TRANSFERENCIA",
  "RECTIFICACIÓN DE DATOS JUDICIAL",
  "INFORME DE INCLUSIÓN"
];

const STATUS_OPTIONS = ['Pendiente', 'En Progreso', 'Atendido', 'Archivado', 'Derivado', 'Devuelto'];

interface IncomingFilesProps {
  user: User;
  notify?: (message: string, type?: 'success' | 'error' | 'warning' | 'info') => void;
}

interface GroupedIncomingFile extends IncomingFile {
  count: number;
  history: {
    id: string;
    subject: string;
    dateTime: string;
    status: string;
  }[];
}

export const IncomingFiles: React.FC<IncomingFilesProps> = ({ user, notify }) => {
  const navigate = useNavigate();
  const [files, setFiles] = useState<GroupedIncomingFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [unifiedTimelineExpediente, setUnifiedTimelineExpediente] = useState<{refNumber?: string, outgoingFileId?: string} | null>(null);
  
  // History Modal State
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [selectedHistory, setSelectedHistory] = useState<GroupedIncomingFile | null>(null);

  // States for "Atender" Wizard
  const [isAttendModalOpen, setIsAttendModalOpen] = useState(false);
  const [fileToAttend, setFileToAttend] = useState<IncomingFile | null>(null);
  const [attendStep, setAttendStep] = useState(1);
  
  // General Flow States
  const [studentQuery, setStudentQuery] = useState('');
  const [candidates, setCandidates] = useState<Participant[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<Participant | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const isConstancia = selectedTemplate ? (selectedTemplate.category === 'Certificados' || selectedTemplate.name.toLowerCase().includes('constancia')) : false;
  
  // Manual Data & Preview States
  const [manualValues, setManualValues] = useState<Record<string, string>>({});
  const [detectedVariables, setDetectedVariables] = useState<string[]>([]);
  const [studentEmail, setStudentEmail] = useState('');
  const [boucherNumber, setBoucherNumber] = useState('');
  const [signedPdf, setSignedPdf] = useState<File | null>(null);
  const [downloadLocal, setDownloadLocal] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);

  // Payment Flow States
  const [paymentQuery, setPaymentQuery] = useState('');
  const [paymentCandidates, setPaymentCandidates] = useState<PaymentRegistry[]>([]);
  const [selectedPayment, setSelectedPayment] = useState<PaymentRegistry | null>(null);
  const [targetExam, setTargetExam] = useState('');
  const [examSuggestions, setExamSuggestions] = useState<string[]>([]);

  // States for New File
  const [newNumber, setNewNumber] = useState('');
  const [newSubject, setNewSubject] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchInputValue, setSearchInputValue] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchQuery(searchInputValue);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchInputValue]);

  const [currentFilter, setCurrentFilter] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const filterParam = params.get('filter');
    if (filterParam) return filterParam;
    const isRestricted = user?.role === 'Operador' && !user?.permissions?.includes('view_expedientes');
    return isRestricted ? 'Asignados a Mí' : 'Todos';
  });

  const isRestrictedOperator = user?.role === 'Operador' && !user?.permissions?.includes('view_expedientes');

  // Operators & Assignment State
  const [operators, setOperators] = useState<any[]>([]);
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [fileToAssign, setFileToAssign] = useState<GroupedIncomingFile | null>(null);
  const [selectedOperatorId, setSelectedOperatorId] = useState('');
  const [assignmentNotes, setAssignmentNotes] = useState('');
  const [assignmentType, setAssignmentType] = useState<'action' | 'info'>('action');

  const [csvPreview, setCsvPreview] = useState<any[]>([]);
  const csvInputRef = useRef<HTMLInputElement>(null);

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingFile, setEditingFile] = useState<GroupedIncomingFile | null>(null);
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const [expandedFiles, setExpandedFiles] = useState<Record<string, boolean>>({});

  const toggleFileDetails = (fileId: string) => {
    setExpandedFiles(prev => ({ ...prev, [fileId]: !prev[fileId] }));
  };

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = () => setActiveMenuId(null);
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  // Outgoing Modal States
  const [isOutgoingModalOpen, setIsOutgoingModalOpen] = useState(false);
  const [outgoingDocType, setOutgoingDocType] = useState('Oficio');
  const [outgoingDocNumber, setOutgoingDocNumber] = useState('');
  const [outgoingRefNumber, setOutgoingRefNumber] = useState('');
  const [outgoingSubject, setOutgoingSubject] = useState('');
  const [outgoingDestination, setOutgoingDestination] = useState('');
  const [isEditingStudent, setIsEditingStudent] = useState(false);
  const [editedStudentName, setEditedStudentName] = useState('');
  const [outgoingDestinationSuggestions, setOutgoingDestinationSuggestions] = useState<string[]>([]);
  const [showOutgoingSuggestions, setShowOutgoingSuggestions] = useState(false);
  const [outgoingDriveUrl, setOutgoingDriveUrl] = useState('');
  const [outgoingFile, setOutgoingFile] = useState<File | null>(null);
  const outgoingFileInputRef = useRef<HTMLInputElement>(null);

  const [matchedOutgoingFile, setMatchedOutgoingFile] = useState<any>(null);
  const [matchedAssignment, setMatchedAssignment] = useState<any>(null);
  const [updateOutgoingStatus, setUpdateOutgoingStatus] = useState(false);

  useEffect(() => {
    fetchOperators();
  }, []);

  const fetchOperators = async () => {
    try {
      const { data, error } = await supabase
        .from('usuarios')
        .select('id, name, role, dni');
      if (error) throw error;
      if (data) {
        setOperators(data);
      }
    } catch (err) {
      console.error("Error fetching operators:", err);
    }
  };

  useEffect(() => {
    fetchFiles();
    fetchExamSuggestions();
    fetchDestinationSuggestions();
  }, [currentFilter, searchQuery]);

  useEffect(() => {
    const checkOutgoing = async () => {
      if (!newNumber.trim()) {
        setMatchedOutgoingFile(null);
        setMatchedAssignment(null);
        return;
      }
      try {
        const { data: outgoingData } = await supabase
          .from('expedientes_salida')
          .select('*')
          .eq('ref_number', newNumber.trim())
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        
        if (outgoingData) {
          setMatchedOutgoingFile(outgoingData);
          setUpdateOutgoingStatus(true);
        } else {
          setMatchedOutgoingFile(null);
        }
      } catch (err) {
        setMatchedOutgoingFile(null);
      }

      try {
        const { data: pendingData } = await supabase
          .from('expedientes')
          .select('*')
          .eq('number', newNumber.trim())
          .eq('assignment_status', 'pending')
          .not('assigned_to', 'is', null)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (pendingData) {
          setMatchedAssignment(pendingData);
        } else {
          setMatchedAssignment(null);
        }
      } catch (err) {
        setMatchedAssignment(null);
      }
    };
    
    const timer = setTimeout(checkOutgoing, 500);
    return () => clearTimeout(timer);
  }, [newNumber]);

  const fetchDestinationSuggestions = async () => {
      try {
          const { data } = await supabase.from('expedientes_salida').select('destination');
          if (data) {
              const uniqueDestinations = Array.from(new Set(data.map((item: any) => item.destination).filter(Boolean))) as string[];
              setOutgoingDestinationSuggestions(uniqueDestinations);
          }
      } catch (err) {
          console.error(err);
      }
  };

  const fetchExamSuggestions = async () => {
      try {
          const { data, error } = await supabase
              .from('padron_pagos')
              .select('target_exam')
              .not('target_exam', 'is', null)
              .not('target_exam', 'eq', '');
          if (error) throw error;
          if (data) {
              const uniqueExams = Array.from(new Set(data.map(d => d.target_exam))).sort();
              setExamSuggestions(uniqueExams);
          }
      } catch (err) {
          console.error("Error fetching exam suggestions:", err);
      }
  };

  const fetchFiles = async () => {
    try {
      setLoading(true);
      const isRestrictedOperator = user?.role === 'Operador' && !user?.permissions?.includes('view_expedientes');
      let query = supabase.from('expedientes').select('*');
      
      if (isRestrictedOperator) {
        if (user?.id) {
          query = query.eq('assigned_to', user.id);
          if (currentFilter === 'Asignados a Mí') {
            query = query.eq('assignment_status', 'pending');
          } else if (currentFilter !== 'Todos') {
            query = query.eq('status', currentFilter);
          }
        } else {
          setFiles([]);
          return;
        }
      } else {
        if (currentFilter === 'Asignados a Mí') {
          if (user?.id) {
            query = query.eq('assigned_to', user.id).eq('assignment_status', 'pending');
          } else {
            setFiles([]);
            return;
          }
        } else if (currentFilter !== 'Todos') {
          query = query.eq('status', currentFilter);
        }
      }

      if (searchQuery.trim()) {
        query = query.or(`number.ilike.%${searchQuery.trim()}%,subject.ilike.%${searchQuery.trim()}%`);
      }
      const { data } = await query.order('created_at', { ascending: false });
      if (data) {
        const groupedMap = new Map<string, GroupedIncomingFile>();

        data.forEach((item: any) => {
            const currentFile = {
                id: item.id,
                number: item.number,
                subject: item.subject,
                dateTime: new Date(item.created_at).toLocaleString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
                status: item.status as any,
                type: 'General' as const,
                assigned_to: item.assigned_to,
                assigned_at: item.assigned_at,
                assigned_by: item.assigned_by,
                assignment_notes: item.assignment_notes,
                assignment_type: item.assignment_type,
                assignment_status: item.assignment_status
            };

            if (groupedMap.has(item.number)) {
                const existing = groupedMap.get(item.number)!;
                existing.count += 1;
                existing.history.push({
                    id: item.id,
                    subject: item.subject,
                    dateTime: currentFile.dateTime,
                    status: item.status
                });
                
                // Propagate assignment info from older records if the newest record doesn't have it
                if (!existing.assigned_to && item.assigned_to) {
                    existing.assigned_to = item.assigned_to;
                    existing.assigned_at = item.assigned_at;
                    existing.assigned_by = item.assigned_by;
                    existing.assignment_notes = item.assignment_notes;
                    existing.assignment_type = item.assignment_type;
                    existing.assignment_status = item.assignment_status;
                }
            } else {
                groupedMap.set(item.number, {
                    ...currentFile,
                    count: 1,
                    history: [{
                        id: item.id,
                        subject: item.subject,
                        dateTime: currentFile.dateTime,
                        status: item.status
                    }]
                });
            }
        });
        
        setFiles(Array.from(groupedMap.values()));
      }
    } catch (err) { 
      console.error(err); 
    } finally { 
      setLoading(false); 
    }
  };

  const handleStatusChange = async (id: string, newStatus: string) => {
    try {
        const targetFile = files.find(f => f.id === id || f.history.some(h => h.id === id));
        const numberVal = targetFile ? targetFile.number : null;

        let query = supabase.from('expedientes').update({ status: newStatus });
        if (numberVal) {
            query = query.eq('number', numberVal);
        } else {
            query = query.eq('id', id);
        }
        
        const { error } = await query;
        if (error) throw error;
        
        // Update local state deeply
        if (numberVal) {
            setFiles(prev => prev.map(f => {
                if (f.number === numberVal) {
                    const updatedHistory = f.history.map(h => ({ ...h, status: newStatus }));
                    return { ...f, status: newStatus as any, history: updatedHistory };
                }
                return f;
            }));
        } else {
            setFiles(prev => prev.map(f => {
                const updatedHistory = f.history.map(h => h.id === id ? { ...h, status: newStatus } : h);
                if (f.id === id) {
                    return { ...f, status: newStatus as any, history: updatedHistory };
                }
                if (f.history.some(h => h.id === id)) {
                    return { ...f, history: updatedHistory };
                }
                return f;
            }));
        }

        // Update selectedHistory if it's open
        if (selectedHistory) {
             setSelectedHistory(prev => {
                 if (!prev) return null;
                 if (numberVal && prev.number === numberVal) {
                     const updatedHistory = prev.history.map(h => ({ ...h, status: newStatus }));
                     return { ...prev, status: newStatus as any, history: updatedHistory };
                 }
                 const updatedHistory = prev.history.map(h => h.id === id ? { ...h, status: newStatus } : h);
                 const newMainStatus = prev.id === id ? newStatus : prev.status;
                 return { ...prev, status: newMainStatus as any, history: updatedHistory };
             });
        }

        if (notify) notify(`Estado actualizado a ${newStatus}`);
    } catch (err: any) {
        if (notify) notify(`Error al actualizar estado: ${err.message}`, 'error');
    }
  };

  const handleAssignFile = async () => {
    if (!fileToAssign) return;
    try {
      setIsSubmitting(true);
      const assigned_at = new Date().toISOString();
      
      const { error } = await supabase
        .from('expedientes')
        .update({
          assigned_to: selectedOperatorId || null,
          assigned_at: selectedOperatorId ? assigned_at : null,
          assigned_by: user.id,
          assignment_notes: assignmentNotes,
          assignment_type: assignmentType,
          assignment_status: 'pending'
        })
        .eq('number', fileToAssign.number);

      if (error) throw error;

      // Send email notification to the assigned operator!
      if (selectedOperatorId) {
        const op = operators.find(o => o.id === selectedOperatorId);
        if (op) {
          let targetEmail = null;
          if (op.dni) {
            try {
              const { data: dirPerson, error: dirError } = await supabase
                .from('personal_directorio')
                .select('correo')
                .eq('dni', op.dni)
                .maybeSingle();
              
              if (dirError) {
                console.error("Error looking up personal_directorio for email:", dirError);
              }
              if (dirPerson && dirPerson.correo) {
                targetEmail = dirPerson.correo.trim();
              } else {
                targetEmail = `${op.dni}@admin.unsaac.pe`;
              }
            } catch (searchErr) {
              console.error("Failed to query personal_directorio:", searchErr);
              targetEmail = `${op.dni}@admin.unsaac.pe`;
            }
          }

          if (targetEmail) {
            const typeLabel = assignmentType === 'info' ? 'Solo conocimiento/Lectura' : 'Atención Requerida (Trámite)';
            const emailSubject = `NUEVO EXPEDIENTE ASIGNADO: Nº ${fileToAssign.number}`;
            const emailHtml = `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 16px; background-color: #ffffff; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
                <div style="text-align: center; margin-bottom: 24px;">
                  <h1 style="color: #0f172a; font-size: 22px; font-weight: 900; margin: 0; text-transform: uppercase; letter-spacing: -0.5px;">UNSAAC - PANEL DE ADMISIÓN</h1>
                  <span style="color: #64748b; font-size: 11px; font-weight: bold; text-transform: uppercase; tracking-widest: 1px; display: inline-block; margin-top: 4px;">Notificación de Asignación</span>
                </div>
                
                <p style="color: #334155; font-size: 14px; line-height: 1.6; margin-top: 0;">Estimado(a) <strong>${op.name}</strong>,</p>
                <p style="color: #334155; font-size: 14px; line-height: 1.6;">Se le ha asignado el siguiente expediente entrante para su atención o conocimiento:</p>
                
                <div style="background-color: #f8fafc; border-left: 4px solid #f97316; padding: 20px; margin: 24px 0; border-radius: 8px; border-top: 1px solid #f1f5f9; border-right: 1px solid #f1f5f9; border-bottom: 1px solid #f1f5f9;">
                  <p style="margin: 0 0 12px 0; font-size: 11px; color: #64748b; text-transform: uppercase; font-weight: 900; tracking-widest: 1px;">Detalles de la Ficha</p>
                  <table style="width: 100%; border-collapse: collapse; font-size: 14px; color: #0f172a;">
                    <tr>
                      <td style="padding: 6px 0; font-weight: bold; width: 140px; color: #64748b;">Nº Expediente:</td>
                      <td style="padding: 6px 0; font-family: monospace; font-weight: bold; font-size: 15px;">${fileToAssign.number}</td>
                    </tr>
                    <tr>
                      <td style="padding: 6px 0; font-weight: bold; color: #64748b;">Asunto:</td>
                      <td style="padding: 6px 0; font-weight: bold; text-transform: uppercase;">${fileToAssign.subject}</td>
                    </tr>
                    <tr>
                      <td style="padding: 6px 0; font-weight: bold; color: #64748b;">Tipo de Asignación:</td>
                      <td style="padding: 6px 0;">
                        <span style="background-color: ${assignmentType === 'info' ? '#ecfdf5' : '#fff7ed'}; color: ${assignmentType === 'info' ? '#047857' : '#c2410c'}; padding: 4px 10px; border-radius: 9999px; font-size: 11px; font-weight: 900; text-transform: uppercase; border: 1px solid ${assignmentType === 'info' ? '#a7f3d0' : '#ffedd5'};">${typeLabel}</span>
                      </td>
                    </tr>
                  </table>
                  ${assignmentNotes ? `
                  <div style="margin-top: 16px; padding-top: 16px; border-top: 1px dashed #e2e8f0;">
                    <p style="margin: 0 0 8px 0; font-size: 11px; color: #64748b; text-transform: uppercase; font-weight: 900; tracking-widest: 1px;">Notas del Administrador</p>
                    <p style="margin: 0; font-style: italic; background-color: #ffffff; padding: 12px; border-radius: 8px; border: 1px solid #e2e8f0; font-size: 13px; color: #334155; line-height: 1.5;">${assignmentNotes}</p>
                  </div>` : ''}
                </div>
                
                <div style="margin: 24px 0; padding: 16px; background-color: #eff6ff; border: 1px solid #bfdbfe; border-radius: 12px;">
                  <h4 style="margin: 0 0 6px 0; color: #1e40af; font-size: 13px; font-weight: bold; text-transform: uppercase; tracking-widest: 0.5px;">Documentos de Referencia Oficiales</h4>
                  <p style="margin: 0 0 12px 0; font-size: 13px; color: #1e3a8a; line-height: 1.4;">Los documentos y antecedentes de este trámite se encuentran cargados en la plataforma PLADDES (Trámite Documentario UNSAAC):</p>
                  <div style="text-align: center;">
                    <a href="https://tramite.unsaac.edu.pe/login" target="_blank" style="background-color: #2563eb; color: #ffffff; padding: 10px 20px; border-radius: 8px; text-decoration: none; font-size: 12px; font-weight: bold; display: inline-block; border: 1px solid #1d4ed8; box-shadow: 0 2px 4px rgba(37,99,235,0.2);">IR A PLADDES (Trámite Documentario)</a>
                  </div>
                </div>

                <div style="text-align: center; margin: 24px 0 0 0;">
                  <a href="${window.location.origin.includes('localhost') && import.meta.env.VITE_API_URL ? import.meta.env.VITE_API_URL : window.location.origin}/incoming?filter=Asignados%20a%20M%C3%AD" target="_blank" style="background-color: #0f172a; color: #ffffff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-size: 12px; font-weight: bold; display: inline-block; box-shadow: 0 4px 6px rgba(15,23,42,0.15);">Revisar en Consola de Admisión</a>
                </div>
                
                <hr style="border: 0; border-top: 1px solid #f1f5f9; margin: 28px 0 20px 0;" />
                <p style="color: #94a3b8; font-size: 11px; text-align: center; margin: 0;">Este correo es de carácter informativo. Por favor, no responda directamente a este mensaje.</p>
              </div>
            `;
            
            await fetch('/api/send-email', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                to: targetEmail,
                subject: emailSubject,
                html: emailHtml
              })
            });
          }
        }
      }

      if (notify) notify(`Expediente asignado correctamente y correo enviado.`, 'success');
      setIsAssignModalOpen(false);
      setFileToAssign(null);
      setSelectedOperatorId('');
      setAssignmentNotes('');
      fetchFiles();
    } catch (err: any) {
      console.error("Error assigning file:", err);
      if (notify) notify(`Error al asignar expediente: ${err.message}`, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCompleteAssignment = async (file: GroupedIncomingFile) => {
    try {
      setLoading(true);
      const { error } = await supabase
        .from('expedientes')
        .update({
          assignment_status: 'completed'
        })
        .eq('number', file.number);
        
      if (error) throw error;
      if (notify) notify(`Asignación completada correctamente.`, 'success');
      fetchFiles();
    } catch (err: any) {
      console.error("Error completing assignment:", err);
      if (notify) notify(`Error al completar asignación: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleCloseRegistrationModal = () => {
    setIsModalOpen(false);
    setNewNumber('');
    setNewSubject('');
    setMatchedOutgoingFile(null);
    setMatchedAssignment(null);
    setUpdateOutgoingStatus(false);
  };

  const handleSaveIndividual = async () => {
    if (!newNumber.trim() || !newSubject.trim()) return;
    setIsSubmitting(true);
    try {
      // Detect and auto-complete pending assignments for this number
      const { data: existingPending } = await supabase
        .from('expedientes')
        .select('id')
        .eq('number', newNumber.trim())
        .eq('assignment_status', 'pending');

      if (existingPending && existingPending.length > 0) {
        await supabase
          .from('expedientes')
          .update({ assignment_status: 'completed' })
          .eq('number', newNumber.trim())
          .eq('assignment_status', 'pending');
          
        await supabase.from('tramite_seguimiento').insert([{
          action_type: 'Asignación',
          description: `Asignación de operador finalizada automáticamente al registrar el reingreso del expediente Nº ${newNumber.trim()}.`,
          user_name: user.name
        }]);
      }

      // SIEMPRE INSERTAR NUEVO REGISTRO para mantener historial
      const { error } = await supabase.from('expedientes').insert([{
        number: newNumber.trim(),
        subject: newSubject.trim().toUpperCase(),
        status: 'Pendiente',
        created_by: user.id
      }]);
      
      if (error) throw error;

      if (matchedOutgoingFile && updateOutgoingStatus) {
          await supabase.from('expedientes_salida').update({ status: 'Finalizado' }).eq('id', matchedOutgoingFile.id);
          await supabase.from('tramite_seguimiento').insert([{
              expediente_id: matchedOutgoingFile.id,
              action_type: 'Estado',
              description: `Se recibió respuesta y se cambió el estado a Finalizado.`,
              user_name: user.name
          }]);
      }

      if (notify) notify("Expediente registrado correctamente");

      setIsModalOpen(false);
      setNewNumber('');
      setNewSubject('');
      setMatchedOutgoingFile(null);
      setMatchedAssignment(null);
      setUpdateOutgoingStatus(false);
      fetchFiles();
    } catch (err: any) {
      if (notify) notify(err.message, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateFile = async () => {
    if (!editingFile || !editingFile.number.trim() || !editingFile.subject.trim()) return;
    setIsSubmitting(true);
    try {
      const idsToUpdate = editingFile.history.map(h => h.id);
      const { error } = await supabase
        .from('expedientes')
        .update({
          number: editingFile.number.trim(),
          subject: editingFile.subject.trim().toUpperCase()
        })
        .in('id', idsToUpdate);
      
      if (error) throw error;
      if (notify) notify("Expediente actualizado correctamente");
      setIsEditModalOpen(false);
      setEditingFile(null);
      fetchFiles();
    } catch (err: any) {
      if (notify) notify(`Error al actualizar: ${err.message}`, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteFile = async (file: GroupedIncomingFile) => {
    if (!window.confirm('¿Está seguro de eliminar este expediente y todo su historial? Esta acción no se puede deshacer.')) return;
    try {
      const idsToDelete = file.history.map(h => h.id);
      const { error } = await supabase.from('expedientes').delete().in('id', idsToDelete);
      if (error) throw error;
      if (notify) notify("Expediente eliminado correctamente");
      fetchFiles();
    } catch (err: any) {
      if (notify) notify(`Error al eliminar: ${err.message}`, 'error');
    }
  };

  const handleRegisterOutgoing = async () => {
      if (!outgoingDocNumber.trim() || !outgoingSubject.trim() || !fileToAttend) return;
      setIsSubmitting(true);
      try {
          let publicUrl = outgoingDriveUrl.trim();
          
          if (outgoingFile) {
              const sanitizedName = outgoingFile.name.replace(/[^a-zA-Z0-9.]/g, '_');
              const fileName = `${Date.now()}-${sanitizedName}`;
              const { error: uploadError } = await supabase.storage
                  .from('documentos')
                  .upload(`salidas/${fileName}`, outgoingFile, {
                      contentType: 'application/pdf',
                      upsert: true
                  });

              if (uploadError) throw uploadError;

              const { data: urlData } = supabase.storage
                  .from('documentos')
                  .getPublicUrl(`salidas/${fileName}`);
              publicUrl = urlData.publicUrl;
          }

          // 1. Register Outgoing
          const { error } = await supabase.from('expedientes_salida').insert([{
              doc_type: outgoingDocType,
              doc_number: outgoingDocNumber.trim(),
              ref_number: outgoingRefNumber.trim(),
              subject: outgoingSubject.trim().toUpperCase(),
              destination: outgoingDestination.trim().toUpperCase(),
              status: 'Pendiente',
              pdf_url: publicUrl,
              created_by: user.id
          }]);
          if (error) throw error;

          // 2. Update Incoming Status
          await handleStatusChange(fileToAttend.id, 'Atendido');
          
          if (notify) notify("Salida registrada y expediente atendido.");
          setIsOutgoingModalOpen(false);
          
      } catch (err: any) {
          if (notify) notify(err.message, 'error');
      } finally {
          setIsSubmitting(false);
      }
  };

  const openAttendWizard = async (file: IncomingFile) => {
      setFileToAttend(file);
      setAttendStep(1);
      
      // Reset General Flow
      setCandidates([]);
      setStudentQuery('');
      setSelectedStudent(null);
      setSelectedTemplate(null);
      setManualValues({});
      setDetectedVariables([]);
      
      // Reset Payment Flow
      setPaymentCandidates([]);
      setPaymentQuery('');
      setSelectedPayment(null);
      setTargetExam('');

      // Determinar flujo
      const isRecurrent = COMMON_SUBJECTS.some(s => file.subject.toUpperCase().includes(s));
      const isPayment = file.subject.includes('DEVOLUCIÓN') || file.subject.includes('TRANSFERENCIA');

      if (isRecurrent) {
          if (!isPayment) {
              // Cargar plantillas y auto-seleccionar
              try {
                const { data } = await supabase.from('templates').select('*');
                const loadedTemplates = data || [];
                setTemplates(loadedTemplates);
                
                // Auto-selección difusa
                const match = loadedTemplates.find(t => 
                    file.subject.toUpperCase().includes(t.name.toUpperCase()) || 
                    t.name.toUpperCase().includes(file.subject.toUpperCase())
                );
                if (match) setSelectedTemplate(match);
                
              } catch (err) {
                console.error("Error al cargar plantillas", err);
              }
          }
          setIsAttendModalOpen(true);
      } else {
          // Flujo "Otros" -> Registrar Salida
          setOutgoingDocType('Oficio');
          setOutgoingDocNumber('');
          setOutgoingRefNumber(file.number);
          setOutgoingSubject(`RESPUESTA A: ${file.subject}`);
          setOutgoingDriveUrl('');
          setOutgoingFile(null);
          setIsOutgoingModalOpen(true);
      }
  };

  const handleSearchStudent = async () => {
      if (!studentQuery.trim()) return;
      const { data } = await supabase.from('participantes').select('*').or(`CODPOSTULANTE.eq.${studentQuery},NOMBRE.ilike.%${studentQuery}%`).limit(10);
      setCandidates(data || []);
  };

  const handleUpdateStudent = async () => {
    if (!selectedStudent || !editedStudentName.trim()) return;
    setIsSubmitting(true);
    try {
      const { error } = await supabase
        .from('participantes')
        .update({ NOMBRE: editedStudentName.toUpperCase() })
        .eq('id', selectedStudent.id);
      
      if (error) throw error;
      
      const updatedStudent = { ...selectedStudent, NOMBRE: editedStudentName.toUpperCase() };
      setSelectedStudent(updatedStudent);
      setCandidates(prev => prev.map(c => c.id === selectedStudent.id ? updatedStudent : c));
      setIsEditingStudent(false);
      if (notify) notify('Datos del estudiante actualizados correctamente.');
    } catch (err: any) {
      if (notify) notify('Error al actualizar: ' + err.message, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSearchPayment = async () => {
      if (!paymentQuery.trim()) return;
      const { data } = await supabase.from('padron_pagos').select('*')
        .or(`dni.eq.${paymentQuery},student_name.ilike.%${paymentQuery}%`)
        .limit(10);
      setPaymentCandidates(data || []);
  };

  const getNextReportNumber = async () => {
      const currentYear = new Date().getFullYear();
      const { data } = await supabase
          .from('expedientes_salida')
          .select('doc_number')
          .eq('doc_type', 'Informe')
          .ilike('doc_number', `INFORME %-${currentYear}`);
      
      let maxSeq = 0;
      if (data && data.length > 0) {
          data.forEach(item => {
              // Expected format: "INFORME 001-2026"
              // Remove "INFORME " prefix
              const clean = item.doc_number.replace('INFORME ', '');
              const parts = clean.split('-');
              if (parts.length === 2) {
                  const seq = parseInt(parts[0], 10);
                  if (!isNaN(seq) && seq > maxSeq) maxSeq = seq;
              }
          });
      }
      return `INFORME ${(maxSeq + 1).toString().padStart(3, '0')}-${currentYear}`;
  };

  const prepareManualDataStep = async () => {
      if (!selectedTemplate) return;
      
      // Detect variables in template
      const regex = /{{(.*?)}}/g;
      const matches = selectedTemplate.content.match(regex);
      const uniqueVars = matches ? Array.from(new Set(matches.map(m => m.replace(/{{|}}/g, '').trim()))) : [];
      
      // Filter out known system variables
      const systemVars = ['nombres', 'apellidos', 'dni', 'codigo', 'escuela', 'modalidad', 'nota', 'omerito', 'fecha_ingreso', 'anio', 'semestre', 'fecha_actual', 'FECHA_ACTUAL', 'EXP', 'NOMBRE', 'CARRERA', 'MODALIDAD', 'CODIGO', 'fecha', 'FECHA'];
      // codigo_estudi is NOT in systemVars, so it will automatically be included in manualVars
      const manualVars = uniqueVars.filter((v: string) => !systemVars.includes(v));
      
      setDetectedVariables(manualVars);

      // Pre-fill logic
      const preFilledValues: Record<string, string> = {};
      
      if (manualVars.includes('INFORME')) {
          preFilledValues['INFORME'] = await getNextReportNumber();
      }
      
      if (manualVars.includes('NOMBRECORRE') && selectedStudent) {
          preFilledValues['NOMBRECORRE'] = selectedStudent.NOMBRE;
      }

      setManualValues(prev => ({ ...prev, ...preFilledValues }));
      setAttendStep(4);
  };

  const getProcessedContent = () => {
      if (!selectedTemplate || !selectedStudent || !fileToAttend) return '';
      
      let content = selectedTemplate.content;
      
      const formatLongDate = (date: Date) => {
          const months = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
          return `${date.getDate()} de ${months[date.getMonth()]} de ${date.getFullYear()}`;
      };

      const dateStr = formatLongDate(new Date());

      // Helper to format academic dates if they are in YYYY-MM-DD or similar
      const formatAcademicDate = (dateVal: string | null | undefined) => {
          if (!dateVal) return '';
          
          // Check for DD/MM/YYYY format
          const dtRegex = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
          const match = dateVal.match(dtRegex);
          if (match) {
              const [, day, month, year] = match;
              const d = new Date(parseInt(year, 10), parseInt(month, 10) - 1, parseInt(day, 10));
              if (!isNaN(d.getTime())) return formatLongDate(d);
          }

          // Check for YYYY-MM-DD format explicitly to avoid timezone shifts
          const dtRegexISO = /^(\d{4})-(\d{1,2})-(\d{1,2})$/;
          const matchISO = dateVal.match(dtRegexISO);
          if (matchISO) {
              const [, year, month, day] = matchISO;
              const d = new Date(parseInt(year, 10), parseInt(month, 10) - 1, parseInt(day, 10));
              if (!isNaN(d.getTime())) return formatLongDate(d);
          }

          const d = new Date(dateVal);
          if (isNaN(d.getTime())) return dateVal; // Return as is if not a valid date
          return formatLongDate(d);
      };

      // 1. System Replacements
      const systemReplacements: Record<string, string> = {
          '{{nombres}}': selectedStudent.NOMBRE,
          '{{NOMBRE}}': selectedStudent.NOMBRE,
          '{{apellidos}}': '', 
          '{{dni}}': selectedStudent.CODPOSTULANTE,
          '{{codigo}}': selectedStudent.CODPOSTULANTE,
          '{{CODIGO}}': selectedStudent.CODPOSTULANTE,
          '{{escuela}}': selectedStudent.CARRERA,
          '{{CARRERA}}': selectedStudent.CARRERA,
          '{{modalidad}}': selectedStudent.MODALIDAD,
          '{{MODALIDAD}}': selectedStudent.MODALIDAD,
          '{{nota}}': selectedStudent.NOTA,
          '{{omerito}}': selectedStudent.OMERITO,
          '{{fecha_ingreso}}': formatAcademicDate(selectedStudent.FECHAINGRESO),
          '{{anio}}': selectedStudent.ANIO,
          '{{semestre}}': selectedStudent.SEMESTRE,
          '{{fecha_actual}}': dateStr,
          '{{FECHA_ACTUAL}}': dateStr,
          '{{fecha}}': dateStr,
          '{{FECHA}}': dateStr,
          '{{EXP}}': fileToAttend.number
      };

      Object.entries(systemReplacements).forEach(([key, value]) => {
          // Escape special regex characters in key (especially { and })
          const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          content = content.replace(new RegExp(escapedKey, 'g'), value || '');
      });

      // 2. Manual Replacements
      Object.entries(manualValues).forEach(([key, value]) => {
          const escapedKey = `{{${key}}}`.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          content = content.replace(new RegExp(escapedKey, 'g'), value || '');
      });

      // 3. Clean justification styles that collapse spaces in HTML canvas rendering
      content = content.replace(/text-align\s*:\s*justify/gi, 'text-align: left;');

      return content;
  };

  const removeWhiteBackgrounds = async (element: HTMLElement) => {
      const images = element.querySelectorAll('img');
      const originalSrcs: { img: HTMLImageElement, src: string, mixBlendMode: string }[] = [];
      
      const promises = Array.from(images).map(img => {
          return new Promise<void>((resolve) => {
              if (img.style.mixBlendMode === 'multiply') {
                  const canvas = document.createElement('canvas');
                  const ctx = canvas.getContext('2d', { willReadFrequently: true });
                  const imageObj = new Image();
                  
                  if (img.src.startsWith('http')) {
                      imageObj.crossOrigin = "Anonymous";
                  }
                  
                  originalSrcs.push({ img, src: img.src, mixBlendMode: img.style.mixBlendMode });

                  imageObj.onload = () => {
                      // Usar el tamaño original de la imagen para que html2canvas no baje la resolución
                      canvas.width = imageObj.width;
                      canvas.height = imageObj.height;
                      
                      if (ctx) {
                          ctx.drawImage(imageObj, 0, 0);
                          const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                          const data = imgData.data;
                          
                          // Recorre pixel por pixel y convierte el blanco/gris claro en transparente
                          for (let i = 0; i < data.length; i += 4) {
                              const r = data[i];
                              const g = data[i + 1];
                              const b = data[i + 2];
                              const a = data[i + 3];
                              
                              if (a === 0) continue;
                              
                              if (r > 200 && g > 200 && b > 200) {
                                  data[i + 3] = 0; // Transparente
                              } else if (r > 120 && g > 120 && b > 120 && Math.abs(r-g) < 25 && Math.abs(g-b) < 25) {
                                  // Bordes suaves
                                  data[i + 3] = 255 - ((r + g + b) / 3);
                                  data[i] = 0;
                                  data[i + 1] = 0;
                                  data[i + 2] = 0;
                              }
                          }
                          ctx.putImageData(imgData, 0, 0);
                          
                          // Usar base64 e inyectarlo en el MISMO elemento img evita problemas con html2canvas y reemplazos de nodos
                          img.src = canvas.toDataURL('image/png', 1.0);
                          img.style.mixBlendMode = 'normal'; // HTML2Canvas soporta normal
                      }
                      resolve();
                  };
                  imageObj.onerror = () => {
                      console.error("No se pudo cargar la imagen para fondo transparente:", img.src);
                      resolve();
                  };
                  // Add a timestamp cache buster purely to force a clean CORS download if it got cached without CORS
                  const sep = img.src.includes('?') ? '&' : '?';
                  imageObj.src = img.src.startsWith('http') ? `${img.src}${sep}cors_bypass=${Date.now()}` : img.src;
              } else {
                  resolve();
              }
          });
      });
      await Promise.all(promises);
      
      return () => {
          // Restaurar a sus urls publicas y mixBlendMode original
          originalSrcs.forEach(({ img, src, mixBlendMode }) => {
              img.src = src;
              img.style.mixBlendMode = mixBlendMode;
          });
      };
  };

  const generatePdfBlobFromElement = async (element: HTMLElement): Promise<Blob> => {
      // 1. Esperar a que las fuentes personalizadas (Poppins, Cinzel) estén cargadas
      if (document.fonts && document.fonts.ready) {
          await document.fonts.ready;
      }

      // 2. Crear un contenedor temporal aislado en document.body para renderizado perfecto a escala 1:1 (A4)
      const tempContainer = document.createElement('div');
      tempContainer.style.position = 'fixed';
      tempContainer.style.left = '-9999px';
      tempContainer.style.top = '0';
      tempContainer.style.width = '210mm';
      tempContainer.style.height = '296.5mm';
      tempContainer.style.background = '#ffffff';
      tempContainer.style.zIndex = '-9999';
      tempContainer.style.transform = 'none';
      tempContainer.style.webkitTransform = 'none';
      tempContainer.style.zoom = '1';
      tempContainer.style.boxSizing = 'border-box';
      tempContainer.style.overflow = 'hidden';

      // 3. Clonar el elemento
      const clone = element.cloneNode(true) as HTMLElement;
      clone.style.transform = 'none';
      clone.style.webkitTransform = 'none';
      clone.style.zoom = '1';
      clone.style.margin = '0';
      clone.style.width = '210mm';
      clone.style.height = '296.5mm';
      clone.style.boxSizing = 'border-box';

      // 4. Sanitizar estilos en el clon para forzar alineación izquierda y evitar colapso de espacios por justificación o letter-spacing
      const sanitizeNode = (node: HTMLElement) => {
          const style = node.getAttribute('style') || '';
          if (/text-align\s*:\s*justify/i.test(style) || node.style.textAlign === 'justify') {
              node.setAttribute('style', style.replace(/text-align\s*:\s*justify/gi, 'text-align: left;'));
              node.style.textAlign = 'left';
          }
          node.style.letterSpacing = 'normal';
          node.style.wordSpacing = 'normal';

          const tag = node.tagName.toLowerCase();
          if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tag)) {
              node.style.lineHeight = '1.3';
          }
      };

      sanitizeNode(clone);
      const allChildren = clone.querySelectorAll<HTMLElement>('*');
      allChildren.forEach(sanitizeNode);

      tempContainer.appendChild(clone);
      document.body.appendChild(tempContainer);

      try {
          const canvas = await html2canvas(clone, {
              scale: 2,
              useCORS: true,
              logging: false,
              backgroundColor: '#ffffff',
              width: clone.offsetWidth || 794,
              height: clone.offsetHeight || 1121,
              windowWidth: 794,
              windowHeight: 1121,
          });

          const imgData = canvas.toDataURL('image/jpeg', 0.98);
          const pdf = new jsPDF({
              orientation: 'portrait',
              unit: 'mm',
              format: 'a4'
          });

          const pdfWidth = pdf.internal.pageSize.getWidth();
          const pdfHeight = pdf.internal.pageSize.getHeight();
          pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight);

          return pdf.output('blob');
      } finally {
          if (document.body.contains(tempContainer)) {
              document.body.removeChild(tempContainer);
          }
      }
  };

  const downloadDraftOnly = async () => {
      if (!fileToAttend || !previewRef.current || !selectedStudent) return;
      setIsSubmitting(true);
      let restoreDOM: (() => void) | null = null;
      try {
          const sanitizedStudentName = selectedStudent.NOMBRE.replace(/[^a-zA-Z0-9]/g, '_');
          const filename = `BORRADOR_${fileToAttend.number}_${sanitizedStudentName}.pdf`;
          
          const element = previewRef.current;
          restoreDOM = await removeWhiteBackgrounds(element);
          
          const pdfBlob = await generatePdfBlobFromElement(element);
          
          const url = window.URL.createObjectURL(pdfBlob);
          const a = document.createElement('a');
          a.href = url;
          a.download = filename;
          document.body.appendChild(a);
          a.click();
          a.remove();
          
          if (notify) notify("Borrador descargado con éxito. Puede firmarlo y adjuntarlo.");
      } catch (err: any) {
          console.error(err);
          if (notify) notify("Error al descargar borrador: " + err.message, 'error');
      } finally {
          setIsSubmitting(false);
          if (restoreDOM) restoreDOM();
      }
  };

  const finalizeAndDownload = async () => {
      if (!fileToAttend || !previewRef.current || !selectedStudent) return;
      setIsSubmitting(true);
      let restoreDOM: (() => void) | null = null;
      
      try {
          const sanitizedStudentName = selectedStudent.NOMBRE.replace(/[^a-zA-Z0-9]/g, '_');
          const filename = `${fileToAttend.number}_${sanitizedStudentName}.pdf`;
          
          let finalPdfBlob: Blob;
          
          if (signedPdf) {
              finalPdfBlob = signedPdf;
          } else {
              // 1. Generate PDF Blob
              const element = previewRef.current;
              restoreDOM = await removeWhiteBackgrounds(element);
              
              finalPdfBlob = await generatePdfBlobFromElement(element);
          }

          // 2. Upload to Supabase Storage
          const storagePath = `salidas/${Date.now()}_${filename}`;
          const { error: uploadError } = await supabase.storage
              .from('documentos')
              .upload(storagePath, finalPdfBlob, { contentType: 'application/pdf' });
          
          if (uploadError) throw uploadError;

          const { data: urlData } = supabase.storage
              .from('documentos')
              .getPublicUrl(storagePath);

          // 3. Update Status
          await supabase.from('expedientes').update({ status: 'Atendido' }).eq('number', fileToAttend.number);

          // 4. Register in Outgoing Files
          if (manualValues['INFORME'] || isConstancia) {
              await supabase.from('expedientes_salida').insert([{
                  doc_type: isConstancia ? 'Constancia' : 'Informe',
                  doc_number: manualValues['INFORME'] || manualValues['CONSTANCIA'] || `C-${fileToAttend.number}`,
                  ref_number: fileToAttend.number,
                  subject: fileToAttend.subject,
                  destination: isConstancia ? 'ESTUDIANTE' : 'COMPUTO',
                  status: 'Finalizado',
                  pdf_url: urlData.publicUrl,
                  created_by: user.id
              }]);

              if (fileToAttend.subject.toUpperCase().includes('RENUNCIA')) {
                  await supabase.from('renuncias').insert([{
                      student_name: selectedStudent.NOMBRE,
                      student_code: selectedStudent.CODPOSTULANTE,
                      school: selectedStudent.CARRERA,
                      semester: selectedStudent.SEMESTRE || '',
                      expediente_number: fileToAttend.number,
                      informe_number: manualValues['INFORME'],
                      informe_pdf: urlData.publicUrl,
                      status: 'Pendiente Resolución'
                  }]);
              }
          }
          
          // 5. Trigger Download (Automatic only if it's not a constancia, e.g. it's an Informe or general document)
          if (!isConstancia && !signedPdf) {
              const url = window.URL.createObjectURL(finalPdfBlob);
              const a = document.createElement('a');
              a.href = url;
              a.download = filename;
              document.body.appendChild(a);
              a.click();
              a.remove();
          }
          
          // 6. Send Email if provided and is Constancia
          if (studentEmail && isConstancia) {
              const reader = new FileReader();
              reader.readAsDataURL(finalPdfBlob);
              reader.onloadend = async () => {
                  const base64data = reader.result;
                  try {
                      const response = await fetch('/.netlify/functions/send-email', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                              to: studentEmail,
                              subject: `Constancia de Ingreso - ${selectedStudent.NOMBRE}`,
                              text: `Estimado(a) ${selectedStudent.NOMBRE},\n\nAdjuntamos su constancia de ingreso solicitada.\n\nNúmero de Expediente: ${fileToAttend.number}\n\nAtentamente,\nDirección de Admisión UNSAAC`,
                              attachmentBase64: base64data,
                              filename: filename
                          })
                      });
                      
                      const contentType = response.headers.get("content-type");
                      let errData: any = {};
                      if (contentType && contentType.indexOf("application/json") !== -1) {
                          errData = await response.json();
                      } else {
                          const text = await response.text();
                          errData = { error: text || 'Error respuesta no JSON del servidor' };
                      }

                      if (!response.ok) {
                          throw new Error(errData.error || 'Error al enviar correo');
                      }
                      
                      if (notify) notify(`Constancia enviada exitosamente a ${studentEmail}`);
                  } catch (e: any) {
                      console.error("Error enviando correo", e);
                      if (notify) notify(`Error al enviar correo: ${e.message}`, 'error');
                  }
              }
          } else {
              if (notify) notify("Documento generado, guardado y trámite finalizado.");
          }

          setIsAttendModalOpen(false);
          fetchFiles();

      } catch (err: any) {
          console.error(err);
          if (notify) notify("Error al procesar: " + err.message, 'error');
      } finally {
          setIsSubmitting(false);
          if (restoreDOM) restoreDOM();
      }
  };

  const finalizePaymentAttention = async () => {
      if (!fileToAttend || !selectedPayment) return;
      
      const isTransfer = fileToAttend.subject.toUpperCase().includes('TRANS') || selectedPayment.type.toUpperCase().includes('TRANS');

      if (isTransfer && !targetExam.trim()) {
          if (notify) notify('Debe ingresar el examen de destino para la transferencia.', 'error');
          return;
      }
      
      setIsSubmitting(true);
      try {
          // 1. Vincular expediente al pago y actualizar estado a Apto (Recibido Físico)
          const updateData: any = { 
              incoming_file_number: fileToAttend.number,
              status: 'Apto', // This means "Recibido Físico"
              type: isTransfer ? 'TRANSFERENCIA' : 'DEVOLUCION'
          };
          
          if (isTransfer) {
              updateData.target_exam = targetExam.trim().toUpperCase();
          }

          await supabase.from('padron_pagos').update(updateData).eq('id', selectedPayment.id);

          // 2. Marcar expediente como Atendido
          await supabase.from('expedientes').update({ status: 'Atendido' }).eq('number', fileToAttend.number);

          if (notify) notify(`Expediente vinculado al pago de ${selectedPayment.student_name} y marcado como ATENDIDO.`);
          
          setIsAttendModalOpen(false);
          fetchFiles();
      } catch (err: any) {
          if (notify) notify(err.message, 'error');
      } finally {
          setIsSubmitting(false);
      }
  };

  const handleCsvFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
        const content = evt.target?.result as string;
        const lines = content.split(/\r?\n/).filter(l => l.trim());
        if (lines.length < 2) return;

        // Detectar delimitador (Tab, Punto y coma, o Coma)
        let delimiter = ',';
        if (lines[0].includes('\t')) delimiter = '\t';
        else if (lines[0].includes(';')) delimiter = ';';

        const results = lines.slice(1).map(line => {
            // Limpiar caracteres especiales invisibles y comillas
            const cols = line.split(delimiter).map(c => c.trim().replace(/^"|"$/g, '').replace(/[\u200B-\u200D\uFEFF]/g, ''));
            
            // Procesar fecha (Soporta DD/MM/YYYY con o sin hora)
            let formattedDate = new Date().toISOString();
            if (cols[0]) {
                // Separar fecha de la hora si existe
                const dateOnly = cols[0].split(' ')[0];
                const dateParts = dateOnly.split(/[\/\-]/);
                
                if (dateParts.length === 3) {
                    const [d, m, y] = dateParts;
                    // Validar que el año tenga 4 dígitos
                    const fullYear = y.length === 2 ? `20${y}` : y;
                    formattedDate = `${fullYear}-${m.padStart(2, '0')}-${d.padStart(2, '0')}T12:00:00Z`;
                } else {
                    try {
                        const parsed = new Date(cols[0]);
                        if (!isNaN(parsed.getTime())) formattedDate = parsed.toISOString();
                    } catch (e) { /* fallback to now */ }
                }
            }

            // Normalizar estado para que coincida con los filtros y colores (Ej: ATENDIDO -> Atendido)
            const rawStatus = cols[4]?.trim().toUpperCase() || 'PENDIENTE';
            let normalizedStatus: 'Pendiente' | 'En Progreso' | 'Atendido' | 'Archivado' | 'Derivado' | 'Devuelto' = 'Pendiente';
            
            if (rawStatus.includes('ATENDIDO')) normalizedStatus = 'Atendido';
            else if (rawStatus.includes('PROGRESO')) normalizedStatus = 'En Progreso';
            else if (rawStatus.includes('ARCHIVADO')) normalizedStatus = 'Archivado';
            else if (rawStatus.includes('DERIVADO')) normalizedStatus = 'Derivado';
            else if (rawStatus.includes('DEVUELTO')) normalizedStatus = 'Devuelto';

            return { 
              created_at: formattedDate,
              number: cols[1]?.replace(/[º°]/g, '').trim(), // Limpiar símbolo de grado
              subject: cols[2]?.toUpperCase(), 
              type: cols[3] || 'General',
              status: normalizedStatus,
              created_by: user.id
            };
        }).filter(r => r.number && r.subject);
        setCsvPreview(results);
    };
    reader.readAsText(file);
  };

  const processImport = async () => {
    if (csvPreview.length === 0) return;
    setIsSubmitting(true);
    try {
        // Detect and auto-complete pending assignments for imported numbers
        const importedNumbers = Array.from(new Set(csvPreview.map(r => r.number).filter(Boolean)));
        if (importedNumbers.length > 0) {
            const { data: existingPending } = await supabase
                .from('expedientes')
                .select('id, number')
                .in('number', importedNumbers)
                .eq('assignment_status', 'pending');

            if (existingPending && existingPending.length > 0) {
                const pendingNumbers = Array.from(new Set(existingPending.map(p => p.number)));
                await supabase
                    .from('expedientes')
                    .update({ assignment_status: 'completed' })
                    .in('number', pendingNumbers)
                    .eq('assignment_status', 'pending');
                
                // Add tracking logs
                const logs = pendingNumbers.map(num => ({
                    action_type: 'Asignación',
                    description: `Asignación de operador finalizada automáticamente al importar el reingreso del expediente Nº ${num}.`,
                    user_name: user.name
                }));
                await supabase.from('tramite_seguimiento').insert(logs);
            }
        }

        // En importación masiva usamos 'upsert' por el número de expediente si tienes una constraint, 
        // pero aquí simulamos inserción limpia
        const recordsToInsert = csvPreview.map(record => ({ ...record, created_by: user.id }));
        const { error } = await supabase.from('expedientes').insert(recordsToInsert);
        if (error) throw error;
        if (notify) notify(`Importación exitosa: ${csvPreview.length} expedientes.`);
        setIsImportModalOpen(false);
        setCsvPreview([]);
        fetchFiles();
    } catch (err: any) {
        if (notify) notify(err.message, 'error');
    } finally {
        setIsSubmitting(false);
    }
  };

  const getDaysElapsed = (assignedAtStr?: string) => {
    if (!assignedAtStr) return '';
    const assignedAt = new Date(assignedAtStr);
    const now = new Date();
    const diffTime = now.getTime() - assignedAt.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    if (diffDays <= 0) {
      const diffHours = Math.floor(diffTime / (1000 * 60 * 60));
      if (diffHours <= 0) return 'hace unos minutos';
      return `hace ${diffHours} ${diffHours === 1 ? 'hora' : 'horas'}`;
    }
    return `hace ${diffDays} ${diffDays === 1 ? 'día' : 'días'}`;
  };

  const isPaymentFlow = fileToAttend?.subject.includes('DEVOLUCIÓN') || fileToAttend?.subject.includes('TRANSFERENCIA');

  return (
    <div className="flex flex-col gap-6 w-full p-6 md:p-8 h-full overflow-hidden max-w-[1400px] mx-auto">
      
      {/* MODAL IMPORTACIÓN MASIVA */}
      {isImportModalOpen && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
              <div className="bg-white rounded-3xl shadow-2xl w-full max-w-xl overflow-hidden flex flex-col animate-in zoom-in-95">
                  <div className="px-8 py-6 border-b bg-slate-50 flex justify-between items-center">
                      <div className="flex items-center gap-3">
                          <div className="size-10 bg-blue-100 text-blue-600 rounded-xl flex items-center justify-center">
                              <span className="material-symbols-outlined">upload_file</span>
                          </div>
                          <h3 className="font-black text-slate-900 uppercase tracking-tight">Importar Expedientes</h3>
                      </div>
                      <button onClick={() => { setIsImportModalOpen(false); setCsvPreview([]); }} className="text-slate-400 hover:text-slate-600"><span className="material-symbols-outlined">close</span></button>
                  </div>
                  
                  <div className="p-8 flex flex-col gap-6">
                      <div className="bg-amber-50 border border-amber-100 p-4 rounded-2xl flex gap-3">
                          <span className="material-symbols-outlined text-amber-600">info</span>
                          <div className="flex flex-col gap-1">
                              <p className="text-[11px] font-black text-amber-800 uppercase tracking-wider">Formato del archivo CSV (5 columnas):</p>
                              <p className="text-[10px] text-amber-700 font-bold leading-relaxed">
                                  El archivo debe seguir este orden exacto:<br/>
                                  <span className="font-mono bg-white/50 px-1 rounded">1. Fecha (AAAA-MM-DD)</span> | 
                                  <span className="font-mono bg-white/50 px-1 rounded ml-1">2. Nº Expediente</span> | 
                                  <span className="font-mono bg-white/50 px-1 rounded ml-1">3. Asunto</span> |
                                  <span className="font-mono bg-white/50 px-1 rounded ml-1">4. Tipo (General/Especial)</span> |
                                  <span className="font-mono bg-white/50 px-1 rounded ml-1">5. Estado</span>
                              </p>
                          </div>
                      </div>

                      <div 
                          onClick={() => csvInputRef.current?.click()}
                          className={`border-3 border-dashed rounded-3xl p-10 text-center cursor-pointer transition-all group ${csvPreview.length > 0 ? 'border-primary bg-primary/5' : 'border-slate-200 hover:border-primary hover:bg-slate-50'}`}
                      >
                          <input type="file" ref={csvInputRef} onChange={handleCsvFile} accept=".csv" className="hidden" />
                          <span className={`material-symbols-outlined text-5xl mb-4 transition-transform group-hover:scale-110 ${csvPreview.length > 0 ? 'text-primary' : 'text-slate-300'}`}>
                              {csvPreview.length > 0 ? 'task' : 'cloud_upload'}
                          </span>
                          <p className="text-sm font-black text-slate-700 uppercase tracking-widest">
                              {csvPreview.length > 0 ? `${csvPreview.length} Expedientes Listos` : 'Seleccionar Archivo CSV'}
                          </p>
                          <p className="text-[10px] text-slate-400 font-bold mt-2 uppercase">O arrastra el archivo aquí</p>
                      </div>

                      {csvPreview.length > 0 && (
                          <div className="max-h-32 overflow-y-auto border rounded-xl bg-slate-50 p-2">
                              <table className="w-full text-[9px] font-bold uppercase text-slate-500">
                                  <tbody className="divide-y">
                                      {csvPreview.slice(0, 5).map((row, i) => (
                                          <tr key={i}>
                                              <td className="py-1 px-2">{row.created_at.split('T')[0]}</td>
                                              <td className="py-1 px-2">{row.number}</td>
                                              <td className="py-1 px-2">{row.subject}</td>
                                              <td className="py-1 px-2">{row.type}</td>
                                          </tr>
                                      ))}
                                      {csvPreview.length > 5 && <tr><td colSpan={2} className="text-center py-1 text-primary">... y {csvPreview.length - 5} más</td></tr>}
                                  </tbody>
                              </table>
                          </div>
                      )}
                  </div>

                  <div className="px-8 py-6 bg-slate-50 border-t flex justify-end gap-3">
                      <button onClick={() => { setIsImportModalOpen(false); setCsvPreview([]); }} className="px-6 py-2 text-xs font-black uppercase text-slate-400 hover:text-slate-600">Cancelar</button>
                      <button 
                          onClick={processImport} 
                          disabled={isSubmitting || csvPreview.length === 0}
                          className="px-10 py-4 bg-primary text-white rounded-2xl text-xs font-black uppercase shadow-xl shadow-primary/30 active:scale-95 transition-all disabled:opacity-50"
                      >
                          {isSubmitting ? 'PROCESANDO...' : 'INICIAR IMPORTACIÓN'}
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* MODAL ASIGNACIÓN DE OPERADOR */}
      {isAssignModalOpen && fileToAssign && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
              <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col animate-in zoom-in-95">
                  <div className="px-8 py-6 border-b bg-slate-50 flex justify-between items-center">
                      <div className="flex items-center gap-3">
                          <div className="size-10 bg-orange-100 text-orange-600 rounded-xl flex items-center justify-center">
                              <span className="material-symbols-outlined">assignment_ind</span>
                          </div>
                          <div>
                              <h3 className="font-black text-slate-900 uppercase tracking-tight">Asignar Expediente</h3>
                              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Nº {fileToAssign.number}</p>
                          </div>
                      </div>
                      <button onClick={() => { setIsAssignModalOpen(false); setFileToAssign(null); }} className="text-slate-400 hover:text-slate-600"><span className="material-symbols-outlined">close</span></button>
                  </div>
                  
                  <div className="p-8 flex flex-col gap-6">
                      <div className="bg-slate-50 border border-slate-100 p-4 rounded-2xl">
                          <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Asunto del Trámite</p>
                          <p className="text-xs font-bold text-slate-800 uppercase mt-0.5 leading-snug">{fileToAssign.subject}</p>
                      </div>

                      <div className="flex flex-col gap-1.5">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Seleccionar Operador</label>
                          <select 
                              value={selectedOperatorId} 
                              onChange={e => setSelectedOperatorId(e.target.value)}
                              className="w-full h-12 px-4 rounded-xl border border-slate-200 bg-slate-50 text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:bg-white transition-all"
                          >
                              <option value="">-- Sin asignar (Quitar asignación) --</option>
                              {operators.map(op => (
                                  <option key={op.id} value={op.id}>{op.name} ({op.role})</option>
                              ))}
                          </select>
                      </div>

                      <div className="flex flex-col gap-2">
                          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Propósito de Asignación</span>
                          <div className="grid grid-cols-2 gap-3">
                              <button 
                                  type="button"
                                  onClick={() => setAssignmentType('action')}
                                  className={`h-12 rounded-xl border-2 flex items-center justify-center gap-2 font-black text-xs uppercase transition-all ${assignmentType === 'action' ? 'border-orange-500 bg-orange-50 text-orange-700' : 'border-slate-100 bg-slate-50 text-slate-500 hover:bg-slate-100'}`}
                              >
                                  <span className="material-symbols-outlined text-lg">work_outline</span>
                                  Para Atención
                              </button>
                              <button 
                                  type="button"
                                  onClick={() => setAssignmentType('info')}
                                  className={`h-12 rounded-xl border-2 flex items-center justify-center gap-2 font-black text-xs uppercase transition-all ${assignmentType === 'info' ? 'border-teal-500 bg-teal-50 text-teal-700' : 'border-slate-100 bg-slate-50 text-slate-500 hover:bg-slate-100'}`}
                              >
                                  <span className="material-symbols-outlined text-lg">visibility</span>
                                  Solo Conocimiento
                              </button>
                          </div>
                      </div>

                      <div className="flex flex-col gap-1.5">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Instrucciones o Notas</label>
                          <textarea 
                              value={assignmentNotes} 
                              onChange={e => setAssignmentNotes(e.target.value)}
                              placeholder="Escriba aquí indicaciones específicas para el operador..."
                              rows={3}
                              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:bg-white transition-all resize-none"
                          />
                      </div>

                      <div className="bg-blue-50 border border-blue-100 p-4 rounded-2xl flex gap-3">
                          <span className="material-symbols-outlined text-blue-600">info</span>
                          <div className="flex flex-col gap-1">
                              <p className="text-[11px] font-black text-blue-800 uppercase tracking-wider">Notificación de Trámite</p>
                              <p className="text-[10px] text-blue-700 font-medium leading-relaxed">
                                  Al asignar este expediente, se le enviará un correo electrónico automático al operador con los detalles del trámite y el enlace directo de consulta oficial en <strong>PLADDES</strong>.
                              </p>
                          </div>
                      </div>
                  </div>

                  <div className="px-8 py-6 bg-slate-50 border-t flex justify-end gap-3">
                      <button onClick={() => { setIsAssignModalOpen(false); setFileToAssign(null); }} className="px-6 py-2 text-xs font-black uppercase text-slate-400 hover:text-slate-600">Cancelar</button>
                      <button 
                          onClick={handleAssignFile} 
                          disabled={isSubmitting}
                          className="px-10 py-4 bg-orange-600 text-white rounded-2xl text-xs font-black uppercase shadow-xl shadow-orange-600/30 active:scale-95 transition-all"
                      >
                          {isSubmitting ? 'GUARDANDO...' : 'ASIGNAR EXPEDIENTE'}
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* UNIFIED TIMELINE MODAL */}
      {unifiedTimelineExpediente && (
        <UnifiedTimelineModal
          expedienteNumber={unifiedTimelineExpediente.refNumber}
          outgoingFileId={unifiedTimelineExpediente.outgoingFileId}
          onClose={() => setUnifiedTimelineExpediente(null)}
        />
      )}

      {/* MODAL REGISTRO INDIVIDUAL */}
      {isModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in zoom-in-95 duration-200">
              <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col">
                  <div className="px-8 py-6 border-b flex justify-between items-center bg-slate-50">
                      <h3 className="font-black text-slate-900 uppercase tracking-tight">REGISTRAR EXPEDIENTE</h3>
                      <button onClick={handleCloseRegistrationModal} className="text-slate-400 hover:text-slate-600 font-bold"><span className="material-symbols-outlined">close</span></button>
                  </div>
                  <div className="p-8 flex flex-col gap-5">
                      <label className="flex flex-col gap-1.5">
                          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Nº Expediente</span>
                          <input 
                            value={newNumber} 
                            onChange={e => setNewNumber(e.target.value)} 
                            className="h-14 px-5 rounded-2xl border-2 border-slate-100 bg-slate-50 text-slate-900 font-bold outline-none focus:border-primary focus:bg-white transition-all text-xl" 
                            placeholder="Ej: 224050" 
                            autoFocus 
                          />
                      </label>
                      
                      {matchedAssignment && (
                          <div className="bg-orange-50 border border-orange-200 rounded-2xl p-4 flex flex-col gap-3 animate-in fade-in slide-in-from-top-2">
                              <div className="flex items-center gap-2 text-orange-800">
                                  <span className="material-symbols-outlined text-xl">assignment_ind</span>
                                  <span className="text-xs font-black uppercase tracking-widest">Reingreso de Expediente Asignado Detectado</span>
                              </div>
                              <div className="bg-white p-3 rounded-xl border border-orange-100 text-sm flex flex-col gap-1.5">
                                  <p className="text-xs text-slate-500 font-bold uppercase">
                                      Asignado a: <span className="text-slate-800 font-extrabold">{operators.find(op => op.id === matchedAssignment.assigned_to)?.name || 'Operador'}</span>
                                  </p>
                                  {matchedAssignment.assigned_at && (
                                      <p className="text-[11px] text-slate-400 font-bold uppercase">
                                          Fecha de Asignación: <span className="text-slate-600">{new Date(matchedAssignment.assigned_at).toLocaleString('es-PE')}</span>
                                      </p>
                                  )}
                                  {matchedAssignment.assignment_type && (
                                      <p className="text-[11px] text-slate-400 font-bold uppercase">
                                          Propósito: <span className={`font-extrabold ${matchedAssignment.assignment_type === 'info' ? 'text-teal-600' : 'text-orange-600'}`}>{matchedAssignment.assignment_type === 'info' ? 'Solo Conocimiento' : 'Para Atención'}</span>
                                      </p>
                                  )}
                                  {matchedAssignment.assignment_notes && (
                                      <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100 text-xs text-slate-600 mt-1 italic">
                                          <strong>Instrucciones:</strong> "{matchedAssignment.assignment_notes}"
                                      </div>
                                  )}
                              </div>
                              <div className="bg-orange-100/50 p-2.5 rounded-xl text-[10px] text-orange-800 font-black uppercase leading-relaxed text-center">
                                  ⚠️ La asignación se completará automáticamente al registrar este reingreso.
                              </div>
                          </div>
                      )}
                      
                      {matchedOutgoingFile && (
                          <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 flex flex-col gap-3 animate-in fade-in slide-in-from-top-2">
                              <div className="flex items-center gap-2 text-blue-700">
                                  <span className="material-symbols-outlined text-xl">info</span>
                                  <span className="text-xs font-black uppercase tracking-widest">Expediente de Retorno Detectado</span>
                              </div>
                              <div className="bg-white p-3 rounded-xl border border-blue-100 text-sm flex flex-col gap-1">
                                  <p className="font-bold text-slate-800">{matchedOutgoingFile.doc_type} {matchedOutgoingFile.doc_number}</p>
                                  <p className="text-slate-600 line-clamp-2">{matchedOutgoingFile.subject}</p>
                                  <div className="flex justify-between items-center mt-1 text-xs text-slate-500">
                                      <span>Destino: <strong className="text-slate-700">{matchedOutgoingFile.destination}</strong></span>
                                      <span>{new Date(matchedOutgoingFile.created_at).toLocaleDateString('es-PE')}</span>
                                  </div>
                              </div>
                              <label className="flex items-center gap-3 cursor-pointer mt-1 group">
                                  <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${updateOutgoingStatus ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-slate-300 group-hover:border-blue-400'}`}>
                                      {updateOutgoingStatus && <span className="material-symbols-outlined text-[14px] font-bold">check</span>}
                                  </div>
                                  <input 
                                      type="checkbox" 
                                      className="hidden" 
                                      checked={updateOutgoingStatus} 
                                      onChange={(e) => setUpdateOutgoingStatus(e.target.checked)} 
                                  />
                                  <span className="text-xs font-bold text-slate-700 select-none">Marcar trámite de salida como FINALIZADO</span>
                              </label>
                          </div>
                      )}

                      <label className="flex flex-col gap-2">
                          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Asunto</span>
                          <div className="flex flex-wrap gap-2 mb-2">
                              {COMMON_SUBJECTS.map(s => (
                                  <button key={s} onClick={() => setNewSubject(s)} className={`px-3 py-1.5 rounded-xl text-[9px] font-black uppercase border transition-all ${newSubject === s ? 'bg-primary text-white border-primary shadow-lg' : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-white'}`}>
                                      {s}
                                  </button>
                              ))}
                          </div>
                          <textarea 
                            value={newSubject} 
                            onChange={e => setNewSubject(e.target.value.toUpperCase())} 
                            className="h-28 p-5 rounded-2xl border-2 border-slate-100 bg-slate-50 font-bold outline-none focus:border-primary resize-none text-xs leading-relaxed" 
                            placeholder="Describa el asunto..." 
                          />
                      </label>
                  </div>
                  <div className="px-8 py-6 bg-slate-50 border-t flex justify-between items-center">
                      <button onClick={handleCloseRegistrationModal} className="px-6 py-2 text-xs font-black uppercase text-slate-400 hover:text-slate-600 transition-colors">CANCELAR</button>
                      <button onClick={handleSaveIndividual} disabled={isSubmitting || !newNumber || !newSubject} className="px-10 py-4 bg-primary text-white rounded-2xl text-xs font-black uppercase shadow-xl shadow-primary/30 active:scale-95 transition-all">
                          {isSubmitting ? 'GUARDANDO...' : 'REGISTRAR'}
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* MODAL ATENCIÓN ASISTIDA */}
      {isAttendModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
              <div className={`bg-white rounded-3xl shadow-2xl w-full ${attendStep === 4 ? 'max-w-6xl h-[90vh]' : 'max-w-2xl max-h-[90vh]'} overflow-hidden flex flex-col animate-in zoom-in-95 transition-all duration-300`}>
                  <div className="px-8 py-6 border-b bg-slate-50 flex justify-between items-center shrink-0">
                      <div className="flex flex-col">
                        <h3 className="font-black text-slate-900 uppercase">Atender Expediente</h3>
                        <p className="text-xs font-bold text-primary">{fileToAttend?.number} • {fileToAttend?.subject}</p>
                      </div>
                      <button onClick={() => setIsAttendModalOpen(false)} className="text-slate-400 hover:text-slate-600"><span className="material-symbols-outlined">close</span></button>
                  </div>
                  
                  <div className="p-8 overflow-y-auto flex-1">
                      
                      {/* FLUJO DE PAGOS (DEVOLUCIÓN / TRANSFERENCIA) */}
                      {isPaymentFlow ? (
                          <>
                             {attendStep === 1 && (
                                <div className="flex flex-col gap-5">
                                    <div className="flex flex-col gap-2">
                                        <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Paso 1: Buscar en Padrón de Pagos</p>
                                        <div className="flex gap-2">
                                            <input 
                                                value={paymentQuery} 
                                                onChange={e => setPaymentQuery(e.target.value)} 
                                                onKeyDown={e => e.key === 'Enter' && handleSearchPayment()} 
                                                className="flex-1 h-14 px-5 rounded-2xl border-2 border-slate-100 bg-slate-50 outline-none font-bold focus:border-primary focus:bg-white" 
                                                placeholder="DNI o Nombre del solicitante..." 
                                                autoFocus
                                            />
                                            <button onClick={handleSearchPayment} className="bg-primary text-white px-5 rounded-2xl shadow-lg shadow-primary/20 active:scale-95 transition-all"><span className="material-symbols-outlined">search</span></button>
                                        </div>
                                    </div>
                                    <div className="max-h-60 overflow-y-auto border border-slate-100 rounded-2xl divide-y bg-slate-50/50">
                                        {paymentCandidates.length === 0 ? (
                                            <div className="p-10 text-center text-slate-300 font-bold uppercase text-[10px] tracking-widest italic">No se encontraron pagos</div>
                                        ) : (
                                            paymentCandidates.map(c => {
                                                const isBlocked = c.status === 'En Bloque' || c.status === 'Finalizado';
                                                return (
                                                    <button 
                                                        key={c.id} 
                                                        onClick={() => { 
                                                            if (!isBlocked) {
                                                                setSelectedPayment(c); 
                                                                setAttendStep(2); 
                                                            }
                                                        }} 
                                                        disabled={isBlocked}
                                                        className={`w-full p-4 text-left transition-colors flex justify-between items-center group ${isBlocked ? 'opacity-60 cursor-not-allowed bg-slate-100' : 'hover:bg-white'}`}
                                                    >
                                                        <div>
                                                            <p className="text-sm font-black uppercase text-slate-800">{c.student_name}</p>
                                                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tighter">{c.dni} • S/ {c.amount} • {c.type}</p>
                                                            {isBlocked && (
                                                                <p className="text-[10px] text-red-600 font-bold mt-1 flex items-center gap-1">
                                                                    <span className="material-symbols-outlined text-[12px]">warning</span>
                                                                    Ya tiene un trámite registrado ({c.status})
                                                                </p>
                                                            )}
                                                        </div>
                                                        {!isBlocked && <span className="material-symbols-outlined text-slate-200 group-hover:text-primary transition-colors">chevron_right</span>}
                                                    </button>
                                                );
                                            })
                                        )}
                                    </div>
                                </div>
                             )}

                             {attendStep === 2 && selectedPayment && (
                                <div className="flex flex-col gap-6 animate-in slide-in-from-right-5 duration-300">
                                    <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Paso 2: Confirmar Vinculación</p>
                                    <div className="bg-blue-50 p-6 rounded-2xl border border-blue-100 flex flex-col gap-4">
                                        <div className="flex items-center gap-4">
                                            <div className="size-12 bg-blue-600 text-white rounded-full flex items-center justify-center font-black text-lg shadow-md">
                                                <span className="material-symbols-outlined">payments</span>
                                            </div>
                                            <div>
                                                <p className="text-sm font-black text-slate-900 uppercase">{selectedPayment.student_name}</p>
                                                <p className="text-xs text-blue-700 font-bold uppercase">Monto: S/ {selectedPayment.amount} • {selectedPayment.type}</p>
                                            </div>
                                        </div>
                                        <p className="text-xs text-slate-600 leading-relaxed">
                                            Se vinculará el expediente <b>{fileToAttend?.number}</b> a este registro de pago. El expediente se marcará como <b>ATENDIDO</b> y el registro aparecerá en el módulo de Transferencias/Devoluciones como <b>Apto (Recibido Físico)</b>.
                                        </p>
                                        
                                        {(fileToAttend?.subject.toUpperCase().includes('TRANS') || selectedPayment.type.toUpperCase().includes('TRANS')) && (
                                            <div className="mt-2 flex flex-col gap-2">
                                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Examen de Destino (Obligatorio)</label>
                                                <input 
                                                    value={targetExam}
                                                    onChange={e => setTargetExam(e.target.value)}
                                                    className="w-full h-12 px-4 rounded-xl border border-blue-200 bg-white font-bold text-sm focus:border-blue-500 outline-none transition-all"
                                                    placeholder="Ej: DIRIMENCIA 2026-I"
                                                    list="exam-suggestions"
                                                    autoFocus
                                                />
                                                <datalist id="exam-suggestions">
                                                    {examSuggestions.map((exam, idx) => (
                                                        <option key={idx} value={exam} />
                                                    ))}
                                                </datalist>
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex justify-between items-center mt-2">
                                        <button onClick={() => setAttendStep(1)} className="text-xs font-black text-slate-400 uppercase tracking-widest hover:text-slate-600 transition-colors">ATRÁS</button>
                                        <button onClick={finalizePaymentAttention} disabled={isSubmitting || ((fileToAttend?.subject.toUpperCase().includes('TRANS') || selectedPayment.type.toUpperCase().includes('TRANS')) && !targetExam.trim())} className="px-8 py-3 bg-slate-900 text-white rounded-xl text-xs font-black uppercase shadow-lg hover:bg-slate-800 transition-all disabled:opacity-50">
                                            {isSubmitting ? 'PROCESANDO...' : 'CONFIRMAR Y FINALIZAR'}
                                        </button>
                                    </div>
                                </div>
                             )}
                          </>
                      ) : (
                          /* FLUJO GENERAL (CONSTANCIAS / INFORMES) */
                          <>
                            {attendStep === 1 && (
                                <div className="flex flex-col gap-5">
                                    <div className="flex flex-col gap-2">
                                        <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Paso 1: Vincular Alumno del Padrón</p>
                                        <div className="flex gap-2">
                                            <input 
                                                value={studentQuery} 
                                                onChange={e => setStudentQuery(e.target.value)} 
                                                onKeyDown={e => e.key === 'Enter' && handleSearchStudent()} 
                                                className="flex-1 h-14 px-5 rounded-2xl border-2 border-slate-100 bg-slate-50 outline-none font-bold focus:border-primary focus:bg-white" 
                                                placeholder="Ingrese DNI o Nombre del alumno..." 
                                                autoFocus
                                            />
                                            <button onClick={handleSearchStudent} className="bg-primary text-white px-5 rounded-2xl shadow-lg shadow-primary/20 active:scale-95 transition-all"><span className="material-symbols-outlined">search</span></button>
                                        </div>
                                    </div>
                                    <div className="max-h-60 overflow-y-auto border border-slate-100 rounded-2xl divide-y bg-slate-50/50">
                                        {candidates.length === 0 ? (
                                            <div className="p-10 text-center text-slate-300 font-bold uppercase text-[10px] tracking-widest italic">No se han realizado búsquedas</div>
                                        ) : (
                                            candidates.map(c => (
                                                <button key={c.id} onClick={() => { setSelectedStudent(c); setAttendStep(2); }} className="w-full p-4 text-left hover:bg-white transition-colors flex justify-between items-center group">
                                                    <div>
                                                        <p className="text-sm font-black uppercase text-slate-800">{c.NOMBRE}</p>
                                                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tighter">{c.CODPOSTULANTE} • {c.CARRERA}</p>
                                                    </div>
                                                    <span className="material-symbols-outlined text-slate-200 group-hover:text-primary transition-colors">chevron_right</span>
                                                </button>
                                            ))
                                        )}
                                    </div>
                                </div>
                            )}

                            {attendStep === 2 && selectedStudent && (
                                <div className="flex flex-col gap-6 animate-in slide-in-from-right-5 duration-300">
                                    <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Paso 2: Verificación de Datos</p>
                                    
                                    <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100 flex flex-col gap-4">
                                        <div className="flex items-center gap-4 border-b border-slate-200 pb-4">
                                            <div className="size-12 bg-primary text-white rounded-full flex items-center justify-center font-black text-lg shadow-md shrink-0">
                                                {selectedStudent.NOMBRE.charAt(0)}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                {isEditingStudent ? (
                                                    <div className="flex flex-col gap-2">
                                                        <input 
                                                            value={editedStudentName} 
                                                            onChange={e => setEditedStudentName(e.target.value)} 
                                                            className="w-full h-10 px-3 rounded-xl border-2 border-primary bg-white outline-none font-bold text-sm uppercase"
                                                            autoFocus
                                                        />
                                                        <div className="flex gap-2">
                                                            <button onClick={handleUpdateStudent} disabled={isSubmitting} className="px-3 py-1 bg-primary text-white rounded-lg text-[10px] font-black uppercase">
                                                                {isSubmitting ? '...' : 'Guardar'}
                                                            </button>
                                                            <button onClick={() => setIsEditingStudent(false)} className="px-3 py-1 bg-slate-200 text-slate-600 rounded-lg text-[10px] font-black uppercase">Cancelar</button>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div className="flex items-center justify-between gap-2">
                                                        <div className="min-w-0">
                                                            <p className="text-sm font-black text-slate-900 uppercase truncate">{selectedStudent.NOMBRE}</p>
                                                            <p className="text-xs text-slate-500 font-medium uppercase truncate">{selectedStudent.CARRERA}</p>
                                                        </div>
                                                        <button 
                                                            onClick={() => { setIsEditingStudent(true); setEditedStudentName(selectedStudent.NOMBRE); }} 
                                                            className="p-2 text-slate-400 hover:text-primary transition-colors shrink-0"
                                                            title="Editar nombre"
                                                        >
                                                            <span className="material-symbols-outlined text-[20px]">edit</span>
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                        
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="flex flex-col">
                                                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Código</span>
                                                <span className="text-sm font-bold text-slate-700">{selectedStudent.CODPOSTULANTE}</span>
                                            </div>
                                            <div className="flex flex-col">
                                                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Modalidad</span>
                                                <span className="text-sm font-bold text-slate-700">{selectedStudent.MODALIDAD}</span>
                                            </div>
                                            <div className="flex flex-col">
                                                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Semestre</span>
                                                <span className="text-sm font-bold text-slate-700">{selectedStudent.SEMESTRE} - {selectedStudent.ANIO}</span>
                                            </div>
                                            <div className="flex flex-col">
                                                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Puntaje</span>
                                                <span className="text-sm font-bold text-slate-700">{selectedStudent.NOTA} pts.</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex justify-between items-center mt-2">
                                        <button onClick={() => setAttendStep(1)} className="text-xs font-black text-slate-400 uppercase tracking-widest hover:text-slate-600 transition-colors">ATRÁS</button>
                                        <button onClick={() => setAttendStep(3)} className="px-8 py-3 bg-slate-900 text-white rounded-xl text-xs font-black uppercase shadow-lg hover:bg-slate-800 transition-all">
                                            CONFIRMAR DATOS
                                        </button>
                                    </div>
                                </div>
                            )}

                            {attendStep === 3 && (
                                <div className="flex flex-col gap-6 animate-in slide-in-from-right-5 duration-300">
                                    <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Paso 3: Generar Documento</p>
                                    
                                    <div className="flex flex-col gap-2">
                                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Plantilla Seleccionada</span>
                                        {selectedTemplate ? (
                                            <div className="p-4 bg-green-50 border border-green-200 rounded-xl flex items-center gap-3">
                                                <span className="material-symbols-outlined text-green-600">check_circle</span>
                                                <div>
                                                    <p className="text-xs font-black text-green-800 uppercase">{selectedTemplate.name}</p>
                                                    <p className="text-[10px] text-green-600">Seleccionada automáticamente por coincidencia</p>
                                                </div>
                                            </div>
                                        ) : (
                                            <select 
                                                onChange={e => setSelectedTemplate(templates.find(t => t.id === e.target.value) || null)} 
                                                className="h-14 px-5 rounded-2xl border-2 border-slate-100 bg-slate-50 outline-none font-bold focus:border-primary text-slate-700"
                                            >
                                                <option value="">-- Seleccionar Manualmente --</option>
                                                {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                                            </select>
                                        )}
                                    </div>

                                    <div className="flex justify-between items-center mt-6">
                                        <button onClick={() => setAttendStep(2)} className="text-xs font-black text-slate-400 uppercase tracking-widest hover:text-slate-600 transition-colors">ATRÁS</button>
                                        <button 
                                            onClick={prepareManualDataStep} 
                                            disabled={!selectedTemplate} 
                                            className="px-10 py-4 bg-primary text-white rounded-2xl text-xs font-black uppercase shadow-xl shadow-primary/30 active:scale-95 transition-all"
                                        >
                                            CONTINUAR A VISTA PREVIA
                                        </button>
                                    </div>
                                </div>
                            )}

                            {attendStep === 4 && (
                                <div className="flex h-full gap-8 animate-in slide-in-from-right-5 duration-300">
                                    {/* COLUMNA IZQUIERDA: DATOS MANUALES */}
                                    <div className="w-1/3 flex flex-col gap-6 overflow-y-auto pr-2">
                                        <div className="flex flex-col gap-2">
                                            <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Paso 4: Completar Datos</p>
                                            <h3 className="font-bold text-slate-800 text-lg leading-tight">Datos Faltantes</h3>
                                            <p className="text-xs text-slate-500">Complete los campos que no se encontraron en la base de datos.</p>
                                        </div>

                                        <div className="flex flex-col gap-4">
                                            {detectedVariables.length === 0 ? (
                                                <div className="p-4 bg-green-50 text-green-700 rounded-xl text-xs font-bold flex items-center gap-2">
                                                    <span className="material-symbols-outlined">check_circle</span>
                                                    Todos los datos están completos.
                                                </div>
                                            ) : (
                                                detectedVariables.map(variable => (
                                                    <label key={variable} className="flex flex-col gap-1.5">
                                                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">{variable}</span>
                                                        <input 
                                                            value={manualValues[variable] || ''}
                                                            onChange={e => setManualValues(prev => ({...prev, [variable]: e.target.value}))}
                                                            className="h-12 px-4 rounded-xl border border-slate-200 bg-slate-50 font-bold text-sm focus:bg-white focus:border-primary outline-none transition-all"
                                                            placeholder={`Ingrese ${variable}...`}
                                                        />
                                                    </label>
                                                ))
                                            )}

                                            {/* Opcional: Correo del Estudiante (Solo Constancias) */}
                                            {isConstancia && (
                                                <div className="flex flex-col gap-4 mt-4 border-t border-slate-100 pt-4">
                                                    <label className="flex flex-col gap-1.5">
                                                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Correo del Estudiante</span>
                                                        <input 
                                                            type="email"
                                                            required
                                                            value={studentEmail}
                                                            onChange={e => setStudentEmail(e.target.value)}
                                                            className="h-12 px-4 rounded-xl border border-slate-200 bg-slate-50 font-bold text-sm focus:bg-white focus:border-primary outline-none transition-all"
                                                            placeholder="alumno@email.com"
                                                        />
                                                        <span className="text-[10px] text-slate-400 ml-1">La constancia se generará y se enviará automáticamente de forma directa a este correo.</span>
                                                    </label>
                                                </div>
                                            )}
                                        </div>

                                        <div className="mt-auto pt-4 border-t border-slate-100 flex flex-col gap-3">
                                            <button 
                                                onClick={finalizeAndDownload} 
                                                disabled={isSubmitting || (isConstancia && !studentEmail.trim())}
                                                className="w-full h-14 bg-primary text-white rounded-2xl text-xs font-black uppercase shadow-xl shadow-primary/30 active:scale-95 transition-all flex items-center justify-center gap-2 mt-2 disabled:opacity-50"
                                            >
                                                {isSubmitting ? (
                                                    <span className="material-symbols-outlined animate-spin">progress_activity</span>
                                                ) : (
                                                    <span className="material-symbols-outlined">{isConstancia ? 'mail' : 'download'}</span>
                                                )}
                                                {isSubmitting 
                                                    ? 'PROCESANDO...' 
                                                    : isConstancia 
                                                        ? 'FINALIZAR Y ENVIAR AL CORREO' 
                                                        : 'FINALIZAR Y DESCARGAR INFORME'
                                                }
                                            </button>
                                            <button onClick={() => setAttendStep(3)} className="w-full py-3 text-xs font-black text-slate-400 uppercase tracking-widest hover:text-slate-600 transition-colors">
                                                ATRÁS
                                            </button>
                                        </div>
                                    </div>

                                    {/* COLUMNA DERECHA: VISTA PREVIA */}
                                    <div className="flex-1 bg-slate-100 rounded-2xl border border-slate-200 overflow-hidden flex flex-col relative">
                                        <div className="absolute top-4 right-4 z-10 bg-white/80 backdrop-blur px-3 py-1 rounded-full text-[10px] font-bold text-slate-500 border border-slate-200 shadow-sm">
                                            VISTA PREVIA
                                        </div>
                                        <div className="flex-1 overflow-auto p-8 flex justify-center">
                                            <div className="origin-top scale-75 md:scale-90 lg:scale-100 transition-transform shadow-2xl">
                                                <div 
                                                    ref={previewRef}
                                                    className="bg-white p-[25mm] relative"
                                                    style={{ width: '210mm', height: '296.5mm', overflow: 'hidden', boxSizing: 'border-box' }}
                                                    dangerouslySetInnerHTML={{ __html: getProcessedContent() }}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                          </>
                      )}
                  </div>
              </div>
          </div>
      )}

      {/* MODAL REGISTRO SALIDA (PARA OTROS) */}
      {isOutgoingModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in zoom-in-95">
              <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col">
                  <div className="px-8 py-6 border-b flex justify-between items-center bg-slate-50">
                      <div className="flex flex-col">
                        <h3 className="font-black text-slate-900 uppercase tracking-tight">ATENDER CON DOCUMENTO</h3>
                        <p className="text-xs font-bold text-primary">Exp: {fileToAttend?.number}</p>
                      </div>
                      <button onClick={() => setIsOutgoingModalOpen(false)} className="text-slate-400 hover:text-slate-600"><span className="material-symbols-outlined">close</span></button>
                  </div>
                  <div className="p-8 flex flex-col gap-5 overflow-y-auto max-h-[70vh]">
                      <div className="grid grid-cols-2 gap-4">
                          <label className="flex flex-col gap-1">
                              <span className="text-[10px] font-black text-slate-500 uppercase">Tipo</span>
                              <select value={outgoingDocType} onChange={e => setOutgoingDocType(e.target.value)} className="h-12 px-3 rounded-xl border-2 border-slate-100 bg-slate-50 text-sm font-bold"><option>Oficio</option><option>Informe</option><option>Circular</option><option>Carta</option><option>Proveido</option></select>
                          </label>
                          <label className="flex flex-col gap-1">
                              <span className="text-[10px] font-black text-slate-500 uppercase">Nº Documento</span>
                              <input value={outgoingDocNumber} onChange={e => setOutgoingDocNumber(e.target.value)} className="h-12 px-4 rounded-xl border-2 border-slate-100 bg-slate-50 font-bold text-sm" placeholder="Ej: 015-2024" autoFocus />
                          </label>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                          <label className="flex flex-col gap-1">
                              <span className="text-[10px] font-black text-slate-500 uppercase">Referencia</span>
                              <input value={outgoingRefNumber} onChange={e => setOutgoingRefNumber(e.target.value)} className="h-12 px-4 rounded-xl border-2 border-slate-100 bg-slate-50 text-sm font-bold" placeholder="Expediente de origen" />
                          </label>
                          <div className="relative flex flex-col gap-1">
                              <span className="text-[10px] font-black text-slate-500 uppercase">Destino</span>
                              <input 
                                  value={outgoingDestination} 
                                  onChange={e => {
                                      setOutgoingDestination(e.target.value.toUpperCase());
                                      setShowOutgoingSuggestions(true);
                                  }} 
                                  onFocus={() => setShowOutgoingSuggestions(true)}
                                  onBlur={() => setTimeout(() => setShowOutgoingSuggestions(false), 200)}
                                  className="h-12 px-4 rounded-xl border-2 border-slate-100 bg-slate-50 text-sm font-bold" 
                                  placeholder="Oficina de destino..." 
                              />
                              {showOutgoingSuggestions && outgoingDestinationSuggestions.filter(s => s.toLowerCase().includes(outgoingDestination.toLowerCase()) && s !== outgoingDestination).length > 0 && (
                                  <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-50 max-h-40 overflow-y-auto">
                                      {outgoingDestinationSuggestions
                                          .filter(s => s.toLowerCase().includes(outgoingDestination.toLowerCase()) && s !== outgoingDestination)
                                          .map((s, i) => (
                                              <button 
                                                  key={i} 
                                                  onClick={() => {
                                                      setOutgoingDestination(s);
                                                      setShowOutgoingSuggestions(false);
                                                  }}
                                                  className="w-full text-left px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
                                              >
                                                  {s}
                                              </button>
                                          ))
                                      }
                                  </div>
                              )}
                          </div>
                      </div>
                      <label className="flex flex-col gap-1">
                          <span className="text-[10px] font-black text-slate-500 uppercase">Asunto</span>
                          <textarea value={outgoingSubject} onChange={e => setOutgoingSubject(e.target.value.toUpperCase())} className="h-24 p-4 rounded-xl border-2 border-slate-100 bg-slate-50 text-xs font-bold resize-none" placeholder="Detalle el asunto..." />
                      </label>
                      
                      <div className="border-t pt-4 flex flex-col gap-4">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Adjuntar Documentación PDF</span>
                        <input value={outgoingDriveUrl} onChange={e => setOutgoingDriveUrl(e.target.value)} className="h-12 px-4 rounded-xl border-2 border-slate-100 bg-slate-50 text-xs font-mono" placeholder="Pegar enlace de Google Drive..." />
                        <div className="relative">
                            <input type="file" ref={outgoingFileInputRef} onChange={e => setOutgoingFile(e.target.files?.[0] || null)} className="hidden" accept=".pdf" />
                            <button onClick={() => outgoingFileInputRef.current?.click()} className={`w-full h-14 border-2 border-dashed rounded-2xl flex items-center justify-center gap-3 text-xs font-black uppercase transition-all ${outgoingFile ? 'border-primary bg-primary/5 text-primary' : 'border-slate-200 text-slate-400 hover:bg-slate-50'}`}>
                                <span className="material-symbols-outlined">{outgoingFile ? 'verified' : 'upload_file'}</span>
                                {outgoingFile ? outgoingFile.name : 'SUBIR ARCHIVO PDF LOCAL'}
                            </button>
                        </div>
                      </div>
                  </div>
                  <div className="px-8 py-6 bg-slate-50 border-t flex justify-end gap-3">
                      <button onClick={() => setIsOutgoingModalOpen(false)} className="px-6 py-2 text-xs font-black uppercase text-slate-400 hover:text-slate-600">Cancelar</button>
                      <button onClick={handleRegisterOutgoing} disabled={isSubmitting || !outgoingDocNumber || !outgoingSubject} className="px-10 py-4 bg-primary text-white rounded-2xl text-xs font-black uppercase shadow-xl shadow-primary/30 active:scale-95 transition-all">
                          {isSubmitting ? 'GUARDANDO...' : 'REGISTRAR Y ATENDER'}
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* HEADER & FILTROS */}
      <div className="flex flex-wrap items-end justify-between gap-4 shrink-0">
        <div className="flex flex-col gap-2">
            <h1 className="text-slate-900 text-3xl font-black leading-tight tracking-tight">
                {user.role === 'Operador' && !user.permissions?.includes('view_expedientes') ? 'Mis Expedientes Asignados' : 'Expedientes Entrantes'}
            </h1>
            <p className="text-slate-500 text-sm font-medium">
                {user.role === 'Operador' && !user.permissions?.includes('view_expedientes') 
                    ? 'Lista de expedientes asignados para tu atención y seguimiento.' 
                    : 'Registro único con acumulación de reingresos y atención asistida.'}
            </p>
        </div>
        <div className="flex gap-2">
            {/* Solo se permite Importar o Registrar a Administradores, Directores o a Operadores con el permiso general de ver todos los expedientes */}
            {(user.role === 'Administrador' || (user.role === 'Operador' && user.permissions?.includes('view_expedientes') && user.permissions?.includes('upload_csv'))) && (
              <button onClick={() => setIsImportModalOpen(true)} className="flex items-center gap-2 bg-white border border-slate-200 hover:bg-slate-50 h-12 px-6 rounded-xl font-black text-xs uppercase shadow-sm transition-all"><span className="material-symbols-outlined">upload_file</span>Importar</button>
            )}
            {(user.role === 'Administrador' || user.role === 'Director' || (user.role === 'Operador' && user.permissions?.includes('view_expedientes'))) && (
              <button onClick={() => setIsModalOpen(true)} className="flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white h-12 px-6 rounded-xl font-black text-xs uppercase shadow-xl transition-all active:scale-95"><span className="material-symbols-outlined">add</span>Registrar</button>
            )}
        </div>
      </div>
      
      <div className="flex flex-col lg:flex-row gap-4 justify-between items-center bg-white p-4 rounded-xl border border-slate-200 shadow-sm shrink-0">
        <div className="w-full lg:w-96 relative">
          <span className="material-symbols-outlined absolute left-3 top-2.5 text-slate-400">search</span>
          <input 
            value={searchInputValue} 
            onChange={e => setSearchInputValue(e.target.value)} 
            className="w-full h-10 pl-10 pr-4 rounded-lg border border-slate-200 bg-slate-50 text-sm focus:bg-white outline-none focus:ring-2 focus:ring-primary/20 transition-all" 
            placeholder="Buscar por número o asunto..." 
          />
        </div>
        <div className="flex gap-2">
            {(user.role === 'Operador' && !user.permissions?.includes('view_expedientes') 
                ? ['Asignados a Mí', 'Todos', 'Pendiente', 'Atendido'] 
                : ['Todos', 'Pendiente', 'Atendido', 'Asignados a Mí']
            ).map(f => (
                <button 
                    key={f} 
                    onClick={() => setCurrentFilter(f)} 
                    className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase border transition-all ${currentFilter === f ? 'bg-slate-800 text-white shadow-md' : 'bg-white text-slate-500 hover:bg-slate-50 border-slate-200'}`}
                >
                    {f === 'Asignados a Mí' && user.role === 'Operador' && !user.permissions?.includes('view_expedientes') ? 'Pendientes de Atención' : f}
                </button>
            ))}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden flex-1 flex flex-col relative">
        {loading ? (
             <div className="flex-1 flex flex-col items-center justify-center min-h-[300px]">
                 <span className="material-symbols-outlined text-4xl text-primary animate-spin">progress_activity</span>
                 <p className="text-slate-400 font-bold uppercase text-[10px] tracking-widest mt-4">Sincronizando Base de Datos...</p>
             </div>
        ) : (
            <div className="flex-1 overflow-auto">
                <table className="w-full text-left border-collapse min-w-[900px]">
                    <thead className="sticky top-0 z-20 bg-slate-50 border-b shadow-sm">
                        <tr>
                            <th className="px-6 py-4 text-slate-500 text-[10px] font-black uppercase w-32 tracking-widest">Nº Exp</th>
                            <th className="px-6 py-4 text-slate-500 text-[10px] font-black uppercase tracking-widest">Asunto</th>
                            <th className="px-6 py-4 text-slate-500 text-[10px] font-black uppercase w-48 tracking-widest">Último Ingreso</th>
                            <th className="px-6 py-4 text-slate-500 text-[10px] font-black uppercase w-40 tracking-widest">Estado</th>
                            <th className="px-6 py-4 text-slate-500 text-[10px] font-black uppercase text-right w-40 pr-10 tracking-widest">Gestión</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                        {files.length === 0 ? (
                            <tr><td colSpan={5} className="py-20 text-center text-slate-300 font-black uppercase text-xs tracking-widest">No hay expedientes para mostrar</td></tr>
                        ) : (
                            files.map((file) => {
                                const assignedUser = file.assigned_to ? operators.find(op => op.id === file.assigned_to) : null;
                                const isAssignedToCurrentUser = file.assigned_to === user.id;
                                return (
                                <tr 
                                    key={file.id} 
                                    className={`transition-colors group ${
                                        isAssignedToCurrentUser && file.assignment_status === 'pending'
                                            ? 'bg-orange-50/70 hover:bg-orange-100/80 border-l-4 border-l-orange-500' 
                                            : file.assignment_status === 'completed' && file.status === 'Pendiente'
                                                ? 'bg-indigo-50/30 hover:bg-indigo-100/40 border-l-4 border-l-indigo-400'
                                                : file.status === 'Pendiente' 
                                                    ? 'bg-amber-50/40 hover:bg-amber-100/50' 
                                                    : 'hover:bg-slate-50'
                                    }`}
                                >
                                    <td className="px-6 py-5 font-mono font-bold text-slate-700 text-sm group-hover:text-primary transition-colors flex items-center gap-2">
                                        {file.number}
                                        {file.count > 1 && (
                                            <span className="bg-amber-100 text-amber-700 text-[10px] px-2 py-0.5 rounded-full border border-amber-200 shrink-0 font-mono">
                                                x{file.count}
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-6 py-5">
                                        <div className="flex flex-col">
                                            <p className="text-slate-900 text-sm font-black uppercase leading-snug whitespace-normal break-words">{file.subject}</p>
                                            
                                            {assignedUser && (
                                                <div className="mt-2.5 flex flex-col gap-2">
                                                    <div className="flex items-center flex-wrap gap-2">
                                                        {file.assignment_status === 'completed' ? (
                                                            file.status === 'Pendiente' ? (
                                                                <span className="inline-flex items-center gap-1.5 bg-indigo-50 text-indigo-800 text-[10px] font-black uppercase px-2.5 py-1 rounded-md border border-indigo-200 shadow-sm">
                                                                    <span className="material-symbols-outlined text-[13px] text-indigo-500">reply_all</span>
                                                                    Retornado / Listo para Atender (por {assignedUser.name})
                                                                </span>
                                                            ) : (
                                                                <span className="inline-flex items-center gap-1 bg-green-50 text-green-700 text-[10px] font-black uppercase px-2 py-0.5 rounded-md border border-green-100">
                                                                    <span className="material-symbols-outlined text-[12px]">check_circle</span>
                                                                    Atendido por {assignedUser.name}
                                                                </span>
                                                            )
                                                        ) : (
                                                            <span className="inline-flex items-center gap-1 bg-orange-50 text-orange-800 text-[10px] font-black uppercase px-2 py-0.5 rounded-md border border-orange-200 shadow-sm">
                                                                    <span className="material-symbols-outlined text-[12px] animate-pulse text-orange-500">pending</span>
                                                                    Asignado a {assignedUser.name} ({getDaysElapsed(file.assigned_at)})
                                                            </span>
                                                        )}
                                                        
                                                        <button 
                                                            onClick={(e) => { e.stopPropagation(); toggleFileDetails(file.id); }}
                                                            className="inline-flex items-center gap-1 text-slate-500 hover:text-slate-800 hover:bg-slate-100 active:scale-95 transition-all text-[9px] font-black uppercase bg-slate-50 px-2 py-0.5 rounded-md border border-slate-200"
                                                        >
                                                            <span className="material-symbols-outlined text-[11px] transition-transform duration-200">
                                                                {expandedFiles[file.id] ? 'unfold_less' : 'info'}
                                                            </span>
                                                            <span>{expandedFiles[file.id] ? 'Menos' : 'Ver Detalles'}</span>
                                                        </button>
                                                    </div>

                                                    {expandedFiles[file.id] && (
                                                        <div className="flex flex-wrap items-center gap-2 bg-slate-50/50 p-2.5 rounded-lg border border-slate-100 mt-0.5 w-full">
                                                            <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-md border ${file.assignment_type === 'info' ? 'bg-teal-50 text-teal-700 border-teal-100' : 'bg-rose-50 text-rose-700 border-rose-100'}`}>
                                                                {file.assignment_type === 'info' ? 'Solo Lectura / Conocimiento' : 'Para Atención'}
                                                            </span>
                                                            {file.assignment_status === 'completed' && file.assigned_at && (
                                                                <span className="inline-flex items-center gap-1 bg-indigo-50 text-indigo-700 text-[9px] font-black uppercase px-2 py-0.5 rounded-md border border-indigo-100">
                                                                    <span className="material-symbols-outlined text-[11px]">schedule</span>
                                                                    Tiempo de Atención: {getDaysElapsed(file.assigned_at)}
                                                                </span>
                                                            )}
                                                            {file.assignment_status === 'pending' && (
                                                                <a 
                                                                    href="https://tramite.unsaac.edu.pe/login" 
                                                                    target="_blank" 
                                                                    rel="noopener noreferrer"
                                                                    onClick={() => {
                                                                        navigator.clipboard.writeText(file.number);
                                                                        if (notify) notify(`Expediente Nº ${file.number} copiado al portapapeles. Redirigiendo a PLADDES...`, 'success');
                                                                    }}
                                                                    className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 text-[9px] font-black uppercase px-2.5 py-0.5 rounded-md border border-blue-200 hover:bg-blue-100 transition-colors cursor-pointer"
                                                                >
                                                                    <span className="material-symbols-outlined text-[11px]">content_copy</span>
                                                                    Documentos en PLADDES
                                                                </a>
                                                            )}
                                                            {file.assignment_notes && (
                                                                <p className="text-[11px] text-slate-500 font-medium italic block w-full mt-1 bg-white p-2 rounded-lg border border-slate-150">
                                                                    <strong>Instrucciones:</strong> {file.assignment_notes}
                                                                </p>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-6 py-5 text-[10px] font-bold text-slate-400 uppercase tracking-tighter">{file.dateTime}</td>
                                    <td className="px-6 py-5">
                                        {isRestrictedOperator ? (
                                            <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase border transition-all inline-block ${
                                                file.status === 'Pendiente' ? 'bg-orange-50 text-orange-700 border-orange-200' : 
                                                file.status === 'Atendido' ? 'bg-green-50 text-green-700 border-green-200' :
                                                file.status === 'Derivado' ? 'bg-purple-50 text-purple-700 border-purple-200' :
                                                file.status === 'Devuelto' ? 'bg-rose-50 text-rose-700 border-rose-200' :
                                                file.status === 'En Progreso' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                                                'bg-slate-100 text-slate-500 border-slate-200'
                                            }`}>
                                                {file.status}
                                            </span>
                                        ) : (
                                            <select 
                                                value={file.status} 
                                                onChange={(e) => handleStatusChange(file.id, e.target.value)}
                                                className={`px-2 py-1 rounded-lg text-[10px] font-black uppercase border outline-none cursor-pointer appearance-none pl-3 pr-6 bg-no-repeat bg-[right_0.5rem_center] bg-[length:12px] transition-all ${
                                                    file.status === 'Pendiente' ? 'bg-orange-50 text-orange-700 border-orange-200' : 
                                                    file.status === 'Atendido' ? 'bg-green-50 text-green-700 border-green-200' :
                                                    file.status === 'Derivado' ? 'bg-purple-50 text-purple-700 border-purple-200' :
                                                    file.status === 'Devuelto' ? 'bg-rose-50 text-rose-700 border-rose-200' :
                                                    file.status === 'En Progreso' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                                                    'bg-slate-100 text-slate-500 border-slate-200'
                                                }`}
                                                style={{ backgroundImage: 'url("data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%23000000%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.5-12.8z%22%2F%3E%3C%2Fsvg%3E")' }}
                                            >
                                                {STATUS_OPTIONS.map(opt => (
                                                    <option key={opt} value={opt}>{opt}</option>
                                                ))}
                                            </select>
                                        )}
                                    </td>
                                    <td className="px-6 py-5 text-right pr-10">
                                        <div className="flex items-center justify-end gap-2">
                                            {(file.count > 1 || file.status === 'Atendido') && (
                                                <button onClick={() => { setUnifiedTimelineExpediente({ refNumber: file.number }); }} className="size-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition-colors" title="Ver Historial">
                                                    <span className="material-symbols-outlined text-sm">history</span>
                                                </button>
                                            )}
                                            {(user.role === 'Administrador' || user.role === 'Director' || (user.role === 'Operador' && !isRestrictedOperator)) && (
                                              <button 
                                                  onClick={() => openAttendWizard(file)} 
                                                  className="px-5 py-2 bg-primary text-white rounded-xl text-[10px] font-black uppercase shadow-lg shadow-primary/20 hover:scale-105 transition-all active:scale-95"
                                              >
                                                  ATENDER
                                              </button>
                                            )}
                                            <div className="relative">
                                                <button 
                                                    onClick={(e) => { e.stopPropagation(); setActiveMenuId(activeMenuId === file.id ? null : file.id); }}
                                                    className="size-8 rounded-full hover:bg-slate-200 text-slate-400 flex items-center justify-center transition-colors"
                                                    title="Opciones"
                                                >
                                                    <span className="material-symbols-outlined text-lg">more_vert</span>
                                                </button>
                                                {activeMenuId === file.id && (
                                                    <div className="absolute right-0 mt-1 w-48 bg-white rounded-xl shadow-xl border border-slate-100 py-1 z-50">
                                                        {(user.role === 'Administrador' || user.role === 'Director') && (
                                                            <button 
                                                                onClick={(e) => { e.stopPropagation(); setFileToAssign(file); setSelectedOperatorId(file.assigned_to || ''); setAssignmentNotes(file.assignment_notes || ''); setAssignmentType(file.assignment_type || 'action'); setIsAssignModalOpen(true); setActiveMenuId(null); }}
                                                                className="w-full text-left px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                                                            >
                                                                <span className="material-symbols-outlined text-[16px]">assignment_ind</span> Asignar Operador
                                                            </button>
                                                        )}

                                                         {file.assigned_to && file.assignment_status === 'pending' && (file.assigned_to === user.id || user.role === 'Administrador' || user.role === 'Director') && (
                                                             <button 
                                                                 onClick={(e) => { e.stopPropagation(); handleCompleteAssignment(file); setActiveMenuId(null); }}
                                                                 className="w-full text-left px-4 py-2 text-xs font-bold text-green-600 hover:bg-green-50 flex items-center gap-2"
                                                                 title={file.assigned_to === user.id ? "Marcar como atendido por mí" : "Marcar como atendido por el operador"}
                                                             >
                                                                 <span className="material-symbols-outlined text-[16px]">task_alt</span> {file.assigned_to === user.id ? 'Finalizar Tarea' : 'Finalizar Tarea del Operador'}
                                                             </button>
                                                         )}

                                                         {(user.role === 'Administrador' || user.role === 'Director' || (user.role === 'Operador' && user.permissions?.includes('view_expedientes'))) && (
                                                            <>
                                                                <button 
                                                                    onClick={(e) => { e.stopPropagation(); setEditingFile(file); setIsEditModalOpen(true); setActiveMenuId(null); }}
                                                                    className="w-full text-left px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-2 border-t border-slate-100 mt-1 pt-2"
                                                                >
                                                                    <span className="material-symbols-outlined text-[16px]">edit</span> Editar
                                                                </button>
                                                                <button 
                                                                    onClick={(e) => { e.stopPropagation(); handleDeleteFile(file); setActiveMenuId(null); }}
                                                                    className="w-full text-left px-4 py-2 text-xs font-bold text-rose-600 hover:bg-rose-50 flex items-center gap-2"
                                                                >
                                                                    <span className="material-symbols-outlined text-[16px]">delete</span> Eliminar
                                                                </button>
                                                            </>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </td>
                                </tr>
                                 );
                             })
                        )}
                    </tbody>
                </table>
            </div>
        )}
      </div>

      {/* Edit Modal */}
      {isEditModalOpen && editingFile && (
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh]">
                  <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                      <h2 className="text-lg font-black text-slate-800 flex items-center gap-2">
                          <span className="material-symbols-outlined text-primary">edit_document</span>
                          Editar Expediente
                      </h2>
                      <button onClick={() => { setIsEditModalOpen(false); setEditingFile(null); }} className="text-slate-400 hover:text-slate-600 transition-colors">
                          <span className="material-symbols-outlined">close</span>
                      </button>
                  </div>
                  <div className="p-6 flex flex-col gap-4 overflow-y-auto">
                      <div className="flex flex-col gap-1.5">
                          <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Número de Expediente</label>
                          <input 
                              type="text" 
                              value={editingFile.number}
                              onChange={e => setEditingFile({...editingFile, number: e.target.value})}
                              placeholder="Ej. 12345-2024"
                              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                          />
                      </div>
                      <div className="flex flex-col gap-1.5">
                          <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Asunto</label>
                          <textarea 
                              value={editingFile.subject}
                              onChange={e => setEditingFile({...editingFile, subject: e.target.value})}
                              placeholder="Descripción del trámite..."
                              rows={4}
                              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all resize-none uppercase"
                          />
                      </div>
                  </div>
                  <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
                      <button 
                          onClick={() => { setIsEditModalOpen(false); setEditingFile(null); }}
                          className="px-5 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-200 bg-slate-100 rounded-xl transition-colors"
                      >
                          Cancelar
                      </button>
                      <button 
                          onClick={handleUpdateFile}
                          disabled={isSubmitting || !editingFile.number.trim() || !editingFile.subject.trim()}
                          className="px-5 py-2.5 text-sm font-bold text-white bg-primary hover:bg-primary/90 rounded-xl transition-all disabled:opacity-50 flex items-center gap-2"
                      >
                          {isSubmitting ? (
                              <><span className="material-symbols-outlined animate-spin text-[18px]">progress_activity</span> Guardando...</>
                          ) : (
                              <><span className="material-symbols-outlined text-[18px]">save</span> Guardar Cambios</>
                          )}
                      </button>
                  </div>
              </div>
          </div>
      )}

    </div>
  );
};
