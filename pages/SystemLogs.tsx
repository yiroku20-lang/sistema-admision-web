import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabaseClient';
import { getAllUsers, AdminUserItem } from '../lib/usersApi';
import * as XLSX from 'xlsx';

export type AuditModule =
  | 'Todos'
  | 'Pre-Revisión'
  | 'Plantillas'
  | 'Emisión'
  | 'Mesa de Partes'
  | 'Cuadro de Vacantes'
  | 'Adjudicación'
  | 'Pagos'
  | 'Seguridad'
  | 'Contingencias'
  | 'Sistema';

export type AuditActionFilter =
  | 'Todos'
  | 'Sistema'
  | 'Emisión'
  | 'Plantilla'
  | 'Estado'
  | 'Edición'
  | 'Registro'
  | 'Seguridad'
  | 'Nota'
  | 'Vacantes'
  | 'Contingencia'
  | 'Pago';

export interface LogEntry {
  id: string;
  user: string;
  userRole: string;
  userId?: string;
  userDni?: string;
  action: string;
  actionType:
    | 'Emisión'
    | 'Plantilla'
    | 'Edición'
    | 'Estado'
    | 'Registro'
    | 'Eliminación'
    | 'Seguridad'
    | 'Sistema'
    | 'Nota'
    | 'Contingencia'
    | 'Vacantes'
    | 'Pago'
    | 'Otro';
  module: Exclude<AuditModule, 'Todos'>;
  actionColor: string;
  moduleBadgeColor: string;
  moduleIcon: string;
  timestamp: Date;
  details: string;
  source: string;
  referenceId?: string;
  pdfUrl?: string | null;
  rawMetadata?: any;
}

export const SystemLogs: React.FC = () => {
  // Navigation Tabs: 'historial' (Full Audit Log) vs 'rastreo_usuario' (User Audit Trail)
  const [activeTab, setActiveTab] = useState<'historial' | 'rastreo_usuario'>('historial');

  // Logs state
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [usersList, setUsersList] = useState<AdminUserItem[]>([]);

  // Filters
  const [selectedModule, setSelectedModule] = useState<AuditModule>('Todos');
  const [selectedActionType, setSelectedActionType] = useState<AuditActionFilter>('Todos');
  const [selectedUser, setSelectedUser] = useState<string>('Todos');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [dateRange, setDateRange] = useState<'todo' | 'hoy' | '7dias' | '30dias' | 'custom'>('todo');
  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');

  // Selected User for "Rastreo por Usuario" Tab
  const [trackedUser, setTrackedUser] = useState<string>('');

  // Modal for forensic detail inspection
  const [inspectedLog, setInspectedLog] = useState<LogEntry | null>(null);
  const [copyFeedback, setCopyFeedback] = useState(false);

  // Pagination
  const [pageSize, setPageSize] = useState<number>(25);
  const [currentPage, setCurrentPage] = useState<number>(1);

  useEffect(() => {
    fetchAllLogs();
  }, []);

  const fetchAllLogs = async () => {
    setLoading(true);
    try {
      const allLogs: LogEntry[] = [];

      // 1. Fetch system users for resolution
      const usersData = await getAllUsers();
      setUsersList(usersData || []);
      const userMap = new Map<string, AdminUserItem>();
      usersData?.forEach((u) => {
        if (u.id) userMap.set(u.id, u);
        if (u.dni) userMap.set(u.dni, u);
      });

      // 2. Fetch tramite_seguimiento (Core audit log of actions)
      const { data: tracking } = await supabase
        .from('tramite_seguimiento')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(600);

      if (tracking) {
        tracking.forEach((t) => {
          let mod: Exclude<AuditModule, 'Todos'> = 'Mesa de Partes';
          let actionColor = 'bg-blue-100 text-blue-800';
          let actionTitle = 'Acción Registrada';
          let actType: LogEntry['actionType'] = 'Estado';
          let modIcon = 'inbox';
          let modBadge = 'bg-blue-50 text-blue-700 border-blue-200';

          const descLower = (t.description || '').toLowerCase();
          const actionTypeLower = (t.action_type || '').toLowerCase();

          // Identify module and action type
          if (actionTypeLower === 'plantilla' || descLower.includes('plantilla')) {
            mod = 'Plantillas';
            actType = 'Plantilla';
            actionTitle = descLower.includes('creó') ? 'Plantilla Creada' : 'Plantilla Modificada';
            actionColor = 'bg-purple-100 text-purple-800';
            modIcon = 'edit_document';
            modBadge = 'bg-purple-50 text-purple-700 border-purple-200';
          } else if (actionTypeLower === 'emisión' || descLower.includes('constancia') || descLower.includes('emitió')) {
            mod = 'Emisión';
            actType = 'Emisión';
            actionTitle = 'Emisión de Constancia';
            actionColor = 'bg-emerald-100 text-emerald-800';
            modIcon = 'verified';
            modBadge = 'bg-emerald-50 text-emerald-700 border-emerald-200';
          } else if (descLower.includes('pre-revisión') || descLower.includes('lote') || descLower.includes('postulante')) {
            mod = 'Pre-Revisión';
            actType = 'Registro';
            actionTitle = 'Gestión de Postulantes';
            actionColor = 'bg-teal-100 text-teal-800';
            modIcon = 'school';
            modBadge = 'bg-teal-50 text-teal-700 border-teal-200';
          } else if (actionTypeLower === 'vacantes' || descLower.includes('vacante') || descLower.includes('cuadro anual')) {
            mod = 'Cuadro de Vacantes';
            actType = 'Vacantes';
            actionTitle = 'Ajuste de Vacantes';
            actionColor = 'bg-cyan-100 text-cyan-800';
            modIcon = 'bar_chart';
            modBadge = 'bg-cyan-50 text-cyan-700 border-cyan-200';
          } else if (actionTypeLower === 'seguridad' || descLower.includes('usuario') || descLower.includes('permiso') || descLower.includes('contraseña')) {
            mod = 'Seguridad';
            actType = 'Seguridad';
            actionTitle = 'Control de Acceso / Roles';
            actionColor = 'bg-rose-100 text-rose-800';
            modIcon = 'shield_person';
            modBadge = 'bg-rose-50 text-rose-700 border-rose-200';
          } else if (descLower.includes('anulado') || descLower.includes('reprogramado') || descLower.includes('cu-224')) {
            mod = 'Contingencias';
            actType = 'Contingencia';
            actionTitle = 'Auditoría Forense Res. CU-224';
            actionColor = 'bg-orange-100 text-orange-800';
            modIcon = 'warning';
            modBadge = 'bg-orange-50 text-orange-700 border-orange-200';
          } else if (actionTypeLower === 'estado') {
            mod = 'Mesa de Partes';
            actType = 'Estado';
            actionTitle = 'Cambio de Estado';
            actionColor = 'bg-blue-100 text-blue-800';
            modIcon = 'inbox';
            modBadge = 'bg-blue-50 text-blue-700 border-blue-200';
          } else if (actionTypeLower === 'nota') {
            mod = 'Mesa de Partes';
            actType = 'Nota';
            actionTitle = 'Nota de Trámite';
            actionColor = 'bg-amber-100 text-amber-800';
            modIcon = 'note_add';
            modBadge = 'bg-amber-50 text-amber-700 border-amber-200';
          } else if (actionTypeLower === 'asignación') {
            mod = 'Mesa de Partes';
            actType = 'Edición';
            actionTitle = 'Derivación / Asignación';
            actionColor = 'bg-sky-100 text-sky-800';
            modIcon = 'assignment_ind';
            modBadge = 'bg-sky-50 text-sky-700 border-sky-200';
          } else if (actionTypeLower.includes('devolución') || actionTypeLower.includes('pago')) {
            mod = 'Pagos';
            actType = 'Pago';
            actionTitle = 'Gestión Financiera / Pago';
            actionColor = 'bg-indigo-100 text-indigo-800';
            modIcon = 'payments';
            modBadge = 'bg-indigo-50 text-indigo-700 border-indigo-200';
          } else if (
            actionTypeLower === 'sistema' ||
            actionTypeLower === 'sistema web' ||
            actionTypeLower === 'sistema desktop' ||
            descLower.includes('sesión') ||
            descLower.includes('acceso') ||
            descLower.includes('ingreso a la web') ||
            descLower.includes('login')
          ) {
            mod = 'Sistema';
            actType = 'Sistema';
            if (descLower.includes('cierre') || descLower.includes('logout')) {
              actionTitle = 'Cierre de Sesión';
              actionColor = 'bg-slate-100 text-slate-700';
              modIcon = 'logout';
              modBadge = 'bg-slate-50 text-slate-700 border-slate-200';
            } else {
              actionTitle = 'Inicio de Sesión';
              actionColor = 'bg-emerald-100 text-emerald-800 font-bold';
              modIcon = 'login';
              modBadge = 'bg-emerald-50 text-emerald-700 border-emerald-200';
            }
          }

          // Clean description from [Módulo: ...] prefix if present
          let cleanDesc = t.description || '';
          if (cleanDesc.startsWith('[')) {
            const closingIdx = cleanDesc.indexOf(']');
            if (closingIdx !== -1) {
              cleanDesc = cleanDesc.substring(closingIdx + 1).trim();
            }
          }

          // Determine user role
          const userNameNormalized = (t.user_name || '').toUpperCase().trim();
          let matchedRole = 'Operador';
          if (userNameNormalized.includes('JHONATAN') || userNameNormalized.includes('ADMIN')) {
            matchedRole = 'Administrador';
          }

          allLogs.push({
            id: `trk-${t.id}`,
            user: userNameNormalized || 'OPERADOR / SISTEMA',
            userRole: matchedRole,
            action: actionTitle,
            actionType: actType,
            module: mod,
            actionColor,
            moduleBadgeColor: modBadge,
            moduleIcon: modIcon,
            timestamp: new Date(t.created_at),
            details: cleanDesc,
            source: 'tramite_seguimiento',
            referenceId: t.expediente_id || undefined,
            rawMetadata: t
          });
        });
      }

      // 3. Fetch expedientes_salida (Official Document Emissions)
      const { data: salidas } = await supabase
        .from('expedientes_salida')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(300);

      if (salidas) {
        salidas.forEach((s) => {
          let studentName = '';
          let studentDni = s.ref_number || '';
          let studentCareer = '';
          let issuedUser = '';
          let parsedMeta: any = null;

          if (s.destination && s.destination.startsWith('{')) {
            try {
              parsedMeta = JSON.parse(s.destination);
              studentName = parsedMeta.estudiante_nombre || '';
              studentDni = parsedMeta.estudiante_dni || studentDni;
              studentCareer = parsedMeta.carrera || '';
              issuedUser = parsedMeta.usuario_nombre || '';
            } catch (e) {
              // ignore
            }
          }

          // Resolve user name
          if (!issuedUser && s.created_by) {
            const userObj = userMap.get(s.created_by);
            if (userObj) issuedUser = userObj.name;
          }
          if (!issuedUser) {
            issuedUser = 'OPERADOR / SISTEMA';
          }

          const descDetail = studentName
            ? `Emitió ${s.doc_type || 'Constancia Oficial'} Nº ${s.doc_number || ''} para ${studentName} (DNI: ${studentDni})${studentCareer ? ` - Carrera: ${studentCareer}` : ''}`
            : `${s.doc_type || 'Documento Oficial'} Nº ${s.doc_number || ''} - ${s.subject || ''}`;

          allLogs.push({
            id: `sal-${s.id}`,
            user: issuedUser.toUpperCase().trim(),
            userRole: 'Operador',
            action: 'Emisión de Constancia',
            actionType: 'Emisión',
            module: 'Emisión',
            actionColor: 'bg-emerald-100 text-emerald-800',
            moduleBadgeColor: 'bg-emerald-50 text-emerald-700 border-emerald-200',
            moduleIcon: 'verified',
            timestamp: new Date(s.created_at),
            details: descDetail,
            source: 'expedientes_salida',
            referenceId: s.doc_number || studentDni,
            pdfUrl: s.pdf_url,
            rawMetadata: parsedMeta || s
          });
        });
      }

      // 4. Fetch postulantes_examenes_anulados (Res. CU-224 Forensic Records)
      const { data: anulados } = await supabase
        .from('postulantes_examenes_anulados')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (anulados) {
        anulados.forEach((a) => {
          allLogs.push({
            id: `anul-${a.id}`,
            user: 'CONSEJO UNIVERSITARIO / COMISIÓN',
            userRole: 'Director',
            action: 'Auditoría Forense Res. CU-224',
            actionType: 'Contingencia',
            module: 'Contingencias',
            actionColor: 'bg-orange-100 text-orange-800',
            moduleBadgeColor: 'bg-orange-50 text-orange-700 border-orange-200',
            moduleIcon: 'warning',
            timestamp: new Date(a.created_at),
            details: `Registro de anulación/reprogramación para ${a.nombre_completo} (DNI: ${a.dni}) - Carrera: ${a.carrera_nombre}. Nota Anulada: ${a.nota_anulada} (OM: ${a.omerito_anulado}) / Nota Reprogramada: ${a.nota_reprogramado} (OM: ${a.omerito_reprogramado}) - ${a.condicion_final}`,
            source: 'postulantes_examenes_anulados',
            referenceId: a.dni,
            rawMetadata: a
          });
        });
      }

      // 5. Fetch padron_pagos (Financial / Payments)
      const { data: pagos } = await supabase
        .from('padron_pagos')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(150);

      if (pagos) {
        pagos.forEach((p) => {
          let userName = 'OPERADOR / CAJA';
          if (p.created_by && userMap.has(p.created_by)) {
            userName = userMap.get(p.created_by)!.name;
          }

          allLogs.push({
            id: `pag-${p.id}`,
            user: userName.toUpperCase().trim(),
            userRole: 'Operador',
            action: 'Validación de Pago',
            actionType: 'Pago',
            module: 'Pagos',
            actionColor: 'bg-indigo-100 text-indigo-800',
            moduleBadgeColor: 'bg-indigo-50 text-indigo-700 border-indigo-200',
            moduleIcon: 'payments',
            timestamp: new Date(p.created_at),
            details: `Validó pago ${p.type || 'PAGO'} de S/. ${p.amount || 0} para ${p.student_name || 'Postulante'} (DNI: ${p.dni || 'S/DNI'}) - Recibo: ${p.receipt_number || 'S/N'}`,
            source: 'padron_pagos',
            referenceId: p.dni || p.receipt_number,
            rawMetadata: p
          });
        });
      }

      // 6. Fetch expedientes (Entradas / Mesa de Partes)
      const { data: entradas } = await supabase
        .from('expedientes')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(150);

      if (entradas) {
        entradas.forEach((e) => {
          let userName = 'MESA DE PARTES / SISTEMA';
          if (e.created_by && userMap.has(e.created_by)) {
            userName = userMap.get(e.created_by)!.name;
          }

          allLogs.push({
            id: `ent-${e.id}`,
            user: userName.toUpperCase().trim(),
            userRole: 'Operador',
            action: 'Recepción de Expediente',
            actionType: 'Registro',
            module: 'Mesa de Partes',
            actionColor: 'bg-teal-100 text-teal-800',
            moduleBadgeColor: 'bg-blue-50 text-blue-700 border-blue-200',
            moduleIcon: 'inbox',
            timestamp: new Date(e.created_at),
            details: `Ingresó expediente Nº ${e.number || 'S/N'} - Asunto: ${e.subject || 'Sin asunto'}${e.applicant ? ` - Solicitante: ${e.applicant}` : ''}`,
            source: 'expedientes',
            referenceId: e.number,
            rawMetadata: e
          });
        });
      }

      // Sort all logs strictly descending by timestamp
      allLogs.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

      setLogs(allLogs);

      // Pre-select first user with activity if none selected
      if (!trackedUser && allLogs.length > 0) {
        const topUser = allLogs.find((l) => l.user && l.user !== 'SISTEMA' && !l.user.includes('CONSEJO'));
        if (topUser) setTrackedUser(topUser.user);
      }
    } catch (error) {
      console.error('Error fetching comprehensive audit logs:', error);
    } finally {
      setLoading(false);
    }
  };

  // Distinct list of users detected across logs for filtering and tracking
  const uniqueUsersInLogs = useMemo(() => {
    const counts: Record<string, number> = {};
    logs.forEach((l) => {
      if (l.user) counts[l.user] = (counts[l.user] || 0) + 1;
    });

    const userArray = Object.keys(counts).map((name) => ({
      name,
      count: counts[name]
    }));

    userArray.sort((a, b) => b.count - a.count);
    return userArray;
  }, [logs]);

  // Filtered Logs
  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      // 1. Module filter
      if (selectedModule !== 'Todos' && log.module !== selectedModule) return false;

      // 2. Action Type filter
      if (selectedActionType !== 'Todos' && log.actionType !== selectedActionType) return false;

      // 3. User filter
      if (selectedUser !== 'Todos' && log.user !== selectedUser) return false;

      // 4. Date Range filter
      const logTime = log.timestamp.getTime();
      const now = new Date().getTime();
      if (dateRange === 'hoy') {
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);
        if (logTime < startOfDay.getTime()) return false;
      } else if (dateRange === '7dias') {
        const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
        if (logTime < sevenDaysAgo) return false;
      } else if (dateRange === '30dias') {
        const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
        if (logTime < thirtyDaysAgo) return false;
      } else if (dateRange === 'custom') {
        if (customStartDate) {
          const sDate = new Date(`${customStartDate}T00:00:00`).getTime();
          if (logTime < sDate) return false;
        }
        if (customEndDate) {
          const eDate = new Date(`${customEndDate}T23:59:59`).getTime();
          if (logTime > eDate) return false;
        }
      }

      // 5. Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchUser = log.user.toLowerCase().includes(q);
        const matchDetails = log.details.toLowerCase().includes(q);
        const matchAction = log.action.toLowerCase().includes(q);
        const matchRef = (log.referenceId || '').toLowerCase().includes(q);
        const matchMod = log.module.toLowerCase().includes(q);
        if (!matchUser && !matchDetails && !matchAction && !matchRef && !matchMod) {
          return false;
        }
      }

      return true;
    });
  }, [logs, selectedModule, selectedActionType, selectedUser, dateRange, customStartDate, customEndDate, searchQuery]);

  // Tracked User Data (Tab 2)
  const trackedUserData = useMemo(() => {
    if (!trackedUser) return null;
    const userLogs = logs.filter((l) => l.user.toLowerCase() === trackedUser.toLowerCase());

    const moduleBreakdown: Record<string, number> = {};
    const actionBreakdown: Record<string, number> = {};
    let emissionsCount = 0;
    let templatesCount = 0;
    let statesCount = 0;
    let loginsCount = 0;

    userLogs.forEach((l) => {
      moduleBreakdown[l.module] = (moduleBreakdown[l.module] || 0) + 1;
      actionBreakdown[l.actionType] = (actionBreakdown[l.actionType] || 0) + 1;
      if (l.actionType === 'Emisión') emissionsCount++;
      if (l.actionType === 'Plantilla') templatesCount++;
      if (l.actionType === 'Estado') statesCount++;
      if (
        l.actionType === 'Sistema' &&
        (l.action.includes('Inicio') ||
          l.details.toLowerCase().includes('sesión') ||
          l.details.toLowerCase().includes('acceso') ||
          l.details.toLowerCase().includes('ingreso'))
      ) {
        loginsCount++;
      }
    });

    const sysUser = usersList.find((u) => u.name.toUpperCase().trim() === trackedUser.toUpperCase().trim());

    return {
      userName: trackedUser,
      dni: sysUser?.dni || 'N/A',
      role: sysUser?.role || (trackedUser.includes('JHONATAN') ? 'Administrador' : 'Operador'),
      totalActions: userLogs.length,
      lastActive: userLogs.length > 0 ? userLogs[0].timestamp : null,
      emissionsCount,
      templatesCount,
      statesCount,
      loginsCount,
      moduleBreakdown,
      logs: userLogs
    };
  }, [trackedUser, logs, usersList]);

  // Overall KPI Metrics
  const stats = useMemo(() => {
    let emissions = 0;
    let criticalActions = 0;
    logs.forEach((l) => {
      if (l.actionType === 'Emisión') emissions++;
      if (['Plantilla', 'Estado', 'Vacantes', 'Seguridad', 'Contingencia'].includes(l.actionType)) {
        criticalActions++;
      }
    });

    return {
      total: logs.length,
      operators: uniqueUsersInLogs.length,
      emissions,
      criticalActions
    };
  }, [logs, uniqueUsersInLogs]);

  // Pagination logic
  const totalPages = Math.ceil(filteredLogs.length / pageSize) || 1;
  const paginatedLogs = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredLogs.slice(start, start + pageSize);
  }, [filteredLogs, currentPage, pageSize]);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedModule, selectedActionType, selectedUser, dateRange, customStartDate, customEndDate, searchQuery, pageSize]);

  // Export to Excel (.xlsx)
  const handleExportExcel = () => {
    try {
      const rows = filteredLogs.map((l, index) => ({
        'Nº': index + 1,
        'Fecha': l.timestamp.toLocaleDateString('es-PE'),
        'Hora': l.timestamp.toLocaleTimeString('es-PE'),
        'Operador': l.user,
        'Rol': l.userRole,
        'Módulo': l.module,
        'Tipo de Acción': l.action,
        'Detalle Completo': l.details,
        'Referencia / Código / DNI': l.referenceId || 'N/A',
        'Enlace PDF': l.pdfUrl || 'N/A',
        'Origen': l.source
      }));

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(rows);

      // Auto-fit column widths
      ws['!cols'] = [
        { wch: 6 },
        { wch: 12 },
        { wch: 12 },
        { wch: 28 },
        { wch: 14 },
        { wch: 18 },
        { wch: 22 },
        { wch: 60 },
        { wch: 25 },
        { wch: 35 },
        { wch: 20 }
      ];

      XLSX.utils.book_append_sheet(wb, ws, 'Auditoría Oficial UNSAAC');
      const dateStr = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(wb, `Auditoria_UNSAAC_Admision_${dateStr}.xlsx`);
    } catch (e) {
      console.error('Error al exportar a Excel:', e);
      alert('Error al generar archivo Excel.');
    }
  };

  // Export to CSV
  const handleExportCsv = () => {
    try {
      const headers = ['Nº', 'Fecha', 'Hora', 'Operador', 'Rol', 'Módulo', 'Acción', 'Detalle', 'Referencia', 'Enlace PDF'];
      const rows = filteredLogs.map((l, idx) => [
        idx + 1,
        l.timestamp.toLocaleDateString('es-PE'),
        l.timestamp.toLocaleTimeString('es-PE'),
        `"${l.user.replace(/"/g, '""')}"`,
        `"${l.userRole}"`,
        `"${l.module}"`,
        `"${l.action}"`,
        `"${l.details.replace(/"/g, '""')}"`,
        `"${(l.referenceId || '').replace(/"/g, '""')}"`,
        `"${l.pdfUrl || ''}"`
      ]);

      const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `Auditoria_UNSAAC_${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (e) {
      console.error('Error al exportar CSV:', e);
    }
  };

  const copyInspectorReport = (log: LogEntry) => {
    const reportText = `[REGISTRO OFICIAL DE AUDITORÍA UNSAAC]
ID Evento: ${log.id}
Fecha y Hora: ${log.timestamp.toLocaleDateString('es-PE')} ${log.timestamp.toLocaleTimeString('es-PE')} (Zona Horaria Perú)
Operador: ${log.user} (Rol: ${log.userRole})
Módulo: ${log.module}
Tipo de Acción: ${log.action}
Detalles: ${log.details}
Referencia / Código: ${log.referenceId || 'N/A'}
${log.pdfUrl ? `Documento PDF: ${log.pdfUrl}\n` : ''}Origen: ${log.source}`;

    navigator.clipboard.writeText(reportText);
    setCopyFeedback(true);
    setTimeout(() => setCopyFeedback(false), 2500);
  };

  const formatRelativeTime = (d: Date) => {
    const diffMs = new Date().getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'Hace instantes';
    if (diffMin < 60) return `Hace ${diffMin} min`;
    const diffHrs = Math.floor(diffMin / 60);
    if (diffHrs < 24) return `Hace ${diffHrs} h`;
    const diffDays = Math.floor(diffHrs / 24);
    if (diffDays === 1) return 'Ayer';
    if (diffDays < 7) return `Hace ${diffDays} días`;
    return d.toLocaleDateString('es-PE');
  };

  return (
    <div className="flex flex-col gap-6 max-w-[1400px] mx-auto w-full p-4 md:p-8 h-full overflow-y-auto">
      {/* Page Heading & Institutional Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div className="flex items-center gap-4">
          <div className="size-14 rounded-2xl bg-slate-900 text-white flex items-center justify-center shadow-md shrink-0">
            <span className="material-symbols-outlined text-3xl">policy</span>
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <h1 className="text-slate-900 text-2xl md:text-3xl font-black leading-tight tracking-tight">
                Auditoría y Rastreo de Operadores
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-800">
                En Vivo
              </span>
            </div>
            <p className="text-slate-500 text-sm font-medium mt-0.5">
              Supervisión forense de trámites, emisión de constancias, cambios en plantillas y trazabilidad de usuarios.
            </p>
          </div>
        </div>

        {/* Global Action Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={fetchAllLogs}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 text-slate-700 text-xs font-black uppercase rounded-xl hover:bg-slate-50 shadow-sm transition-all active:scale-95 disabled:opacity-50"
            title="Recargar todos los eventos"
          >
            <span className={`material-symbols-outlined text-lg ${loading ? 'animate-spin text-primary' : ''}`}>
              refresh
            </span>
            <span>Actualizar</span>
          </button>

          <button
            onClick={handleExportExcel}
            disabled={filteredLogs.length === 0}
            className="flex items-center gap-2 px-4 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-black uppercase rounded-xl shadow-sm transition-all active:scale-95 disabled:opacity-50"
            title="Exportar a Excel"
          >
            <span className="material-symbols-outlined text-lg">table_view</span>
            <span>Exportar Excel</span>
          </button>

          <button
            onClick={handleExportCsv}
            disabled={filteredLogs.length === 0}
            className="flex items-center gap-2 px-3 py-2.5 bg-slate-800 hover:bg-slate-900 text-white text-xs font-black uppercase rounded-xl shadow-sm transition-all active:scale-95 disabled:opacity-50"
            title="Exportar archivo CSV estándar"
          >
            <span className="material-symbols-outlined text-lg">download</span>
            <span>CSV</span>
          </button>
        </div>
      </div>

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Events */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-[11px] font-black uppercase tracking-wider text-slate-400">Total de Eventos</span>
            <span className="text-3xl font-black text-slate-900 mt-1">{stats.total.toLocaleString()}</span>
            <span className="text-xs font-semibold text-slate-500 mt-0.5">Acciones registradas en el sistema</span>
          </div>
          <div className="size-12 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center">
            <span className="material-symbols-outlined text-2xl">history</span>
          </div>
        </div>

        {/* Active Operators */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-[11px] font-black uppercase tracking-wider text-slate-400">Operadores Activos</span>
            <span className="text-3xl font-black text-slate-900 mt-1">{stats.operators}</span>
            <span className="text-xs font-semibold text-slate-500 mt-0.5">Usuarios con actividad rastreada</span>
          </div>
          <div className="size-12 rounded-xl bg-purple-50 text-purple-700 flex items-center justify-center">
            <span className="material-symbols-outlined text-2xl">group</span>
          </div>
        </div>

        {/* Emitted Documents */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-[11px] font-black uppercase tracking-wider text-slate-400">Constancias Emitidas</span>
            <span className="text-3xl font-black text-emerald-600 mt-1">{stats.emissions.toLocaleString()}</span>
            <span className="text-xs font-semibold text-slate-500 mt-0.5">Con verificación QR y código oficial</span>
          </div>
          <div className="size-12 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center">
            <span className="material-symbols-outlined text-2xl">verified</span>
          </div>
        </div>

        {/* Critical Operations */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-[11px] font-black uppercase tracking-wider text-slate-400">Acciones Críticas</span>
            <span className="text-3xl font-black text-amber-600 mt-1">{stats.criticalActions.toLocaleString()}</span>
            <span className="text-xs font-semibold text-slate-500 mt-0.5">Plantillas, vacantes y estados</span>
          </div>
          <div className="size-12 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center">
            <span className="material-symbols-outlined text-2xl">security</span>
          </div>
        </div>
      </div>

      {/* Main Tab Navigation */}
      <div className="flex items-center gap-2 border-b border-slate-200">
        <button
          onClick={() => setActiveTab('historial')}
          className={`flex items-center gap-2 px-5 py-3 border-b-2 text-sm font-black uppercase tracking-wide transition-all ${
            activeTab === 'historial'
              ? 'border-slate-900 text-slate-900'
              : 'border-transparent text-slate-400 hover:text-slate-700'
          }`}
        >
          <span className="material-symbols-outlined text-lg">list_alt</span>
          <span>Historial Completo ({filteredLogs.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('rastreo_usuario')}
          className={`flex items-center gap-2 px-5 py-3 border-b-2 text-sm font-black uppercase tracking-wide transition-all ${
            activeTab === 'rastreo_usuario'
              ? 'border-slate-900 text-slate-900'
              : 'border-transparent text-slate-400 hover:text-slate-700'
          }`}
        >
          <span className="material-symbols-outlined text-lg">person_search</span>
          <span>Rastreo Individual por Operador</span>
        </button>
      </div>

      {/* TAB 1: HISTORIAL COMPLETO */}
      {activeTab === 'historial' && (
        <div className="flex flex-col gap-5">
          {/* Module Pills Selector */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 hide-scrollbar">
            {(
              [
                'Todos',
                'Emisión',
                'Plantillas',
                'Mesa de Partes',
                'Pre-Revisión',
                'Cuadro de Vacantes',
                'Contingencias',
                'Pagos',
                'Seguridad',
                'Sistema'
              ] as AuditModule[]
            ).map((mod) => (
              <button
                key={mod}
                onClick={() => setSelectedModule(mod)}
                className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider whitespace-nowrap transition-all border ${
                  selectedModule === mod
                    ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                }`}
              >
                {mod}
              </button>
            ))}
          </div>

          {/* Advanced Filter Bar */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex flex-col md:flex-row flex-wrap items-center gap-3">
            {/* Search Input */}
            <div className="flex-1 min-w-[280px] w-full relative">
              <span className="material-symbols-outlined absolute left-3 top-2.5 text-slate-400 text-lg">
                search
              </span>
              <input
                type="text"
                placeholder="Buscar por operador, DNI, constancia, expediente o detalle..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50/50 text-sm font-medium focus:ring-2 focus:ring-slate-900 focus:bg-white outline-none transition-all placeholder:text-slate-400 text-slate-700"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600"
                >
                  <span className="material-symbols-outlined text-sm">close</span>
                </button>
              )}
            </div>

            {/* Operator Filter */}
            <div className="w-full md:w-auto min-w-[200px]">
              <select
                value={selectedUser}
                onChange={(e) => setSelectedUser(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-xs font-bold uppercase tracking-wider text-slate-700 focus:ring-2 focus:ring-slate-900 outline-none"
              >
                <option value="Todos">Todos los Operadores ({uniqueUsersInLogs.length})</option>
                {uniqueUsersInLogs.map((u) => (
                  <option key={u.name} value={u.name}>
                    {u.name} ({u.count} eventos)
                  </option>
                ))}
              </select>
            </div>

            {/* Action Type Filter */}
            <div className="w-full md:w-auto min-w-[170px]">
              <select
                value={selectedActionType}
                onChange={(e) => setSelectedActionType(e.target.value as AuditActionFilter)}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-xs font-bold uppercase tracking-wider text-slate-700 focus:ring-2 focus:ring-slate-900 outline-none"
              >
                <option value="Todos">Tipo de Acción: Todas</option>
                <option value="Sistema">🟢 Inicios de Sesión y Accesos</option>
                <option value="Emisión">Emisión de Constancia</option>
                <option value="Plantilla">Plantillas Oficiales</option>
                <option value="Estado">Cambio de Estado</option>
                <option value="Edición">Edición / Modificación</option>
                <option value="Registro">Registro / Carga</option>
                <option value="Vacantes">Cuadro de Vacantes</option>
                <option value="Contingencia">Contingencias (Res. CU-224)</option>
                <option value="Seguridad">Seguridad / Usuarios</option>
                <option value="Nota">Notas de Trámite</option>
                <option value="Pago">Validación de Pagos</option>
              </select>
            </div>

            {/* Date Range Selector */}
            <div className="w-full md:w-auto min-w-[150px]">
              <select
                value={dateRange}
                onChange={(e) => setDateRange(e.target.value as any)}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-xs font-bold uppercase tracking-wider text-slate-700 focus:ring-2 focus:ring-slate-900 outline-none"
              >
                <option value="todo">Todo el Histórico</option>
                <option value="hoy">Hoy</option>
                <option value="7dias">Últimos 7 días</option>
                <option value="30dias">Últimos 30 días</option>
                <option value="custom">Rango Personalizado</option>
              </select>
            </div>

            {/* Custom Dates Inputs */}
            {dateRange === 'custom' && (
              <div className="flex items-center gap-2 w-full md:w-auto">
                <input
                  type="date"
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  className="px-3 py-2 border border-slate-200 rounded-xl text-xs font-bold"
                />
                <span className="text-slate-400 text-xs font-bold">a</span>
                <input
                  type="date"
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  className="px-3 py-2 border border-slate-200 rounded-xl text-xs font-bold"
                />
              </div>
            )}
          </div>

          {/* Logs Table Container */}
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden flex flex-col">
            {loading ? (
              <div className="py-24 flex flex-col items-center justify-center gap-3">
                <span className="material-symbols-outlined text-4xl text-slate-900 animate-spin">
                  progress_activity
                </span>
                <p className="text-slate-500 text-xs font-black uppercase tracking-widest">
                  Cargando trazabilidad forense...
                </p>
              </div>
            ) : filteredLogs.length === 0 ? (
              <div className="py-20 flex flex-col items-center justify-center gap-3 text-center px-4">
                <div className="size-16 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
                  <span className="material-symbols-outlined text-3xl">search_off</span>
                </div>
                <h3 className="text-slate-800 font-bold text-base">No se encontraron eventos coincidentes</h3>
                <p className="text-slate-500 text-xs max-w-md">
                  Pruebe a cambiar los filtros de módulo, operador o el rango de fechas para encontrar los registros deseados.
                </p>
                <button
                  onClick={() => {
                    setSelectedModule('Todos');
                    setSelectedActionType('Todos');
                    setSelectedUser('Todos');
                    setDateRange('todo');
                    setSearchQuery('');
                  }}
                  className="mt-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-black uppercase rounded-xl transition-all"
                >
                  Restablecer filtros
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[1000px]">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-[10px] font-black uppercase tracking-widest">
                      <th className="py-4 px-5 w-48">Fecha y Hora</th>
                      <th className="py-4 px-5 w-60">Operador Responsable</th>
                      <th className="py-4 px-5 w-44">Módulo</th>
                      <th className="py-4 px-5 w-44">Tipo de Acción</th>
                      <th className="py-4 px-5">Detalle del Evento</th>
                      <th className="py-4 px-5 w-36 text-center">Referencia</th>
                      <th className="py-4 px-5 w-24 text-center">Forense</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {paginatedLogs.map((log) => {
                      const initials = log.user
                        .split(/[\s-]+/)
                        .filter(Boolean)
                        .slice(0, 2)
                        .map((p) => p[0])
                        .join('')
                        .toUpperCase();

                      return (
                        <tr
                          key={log.id}
                          className="hover:bg-slate-50/80 transition-colors group cursor-pointer"
                          onClick={() => setInspectedLog(log)}
                        >
                          {/* Date and Time */}
                          <td className="py-3.5 px-5">
                            <div className="flex flex-col">
                              <span className="text-slate-900 text-xs font-bold">
                                {log.timestamp.toLocaleDateString('es-PE')}
                              </span>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <span className="text-slate-500 text-[10px] font-mono">
                                  {log.timestamp.toLocaleTimeString('es-PE')}
                                </span>
                                <span className="text-[10px] font-medium text-slate-400">
                                  ({formatRelativeTime(log.timestamp)})
                                </span>
                              </div>
                            </div>
                          </td>

                          {/* Operator */}
                          <td className="py-3.5 px-5">
                            <div className="flex items-center gap-2.5">
                              <div className="size-8 rounded-full bg-slate-900 text-white flex items-center justify-center text-[11px] font-black shrink-0 shadow-sm">
                                {initials || 'OP'}
                              </div>
                              <div className="flex flex-col overflow-hidden">
                                <span className="text-slate-800 text-xs font-black truncate" title={log.user}>
                                  {log.user}
                                </span>
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                  {log.userRole}
                                </span>
                              </div>
                            </div>
                          </td>

                          {/* Module */}
                          <td className="py-3.5 px-5">
                            <span
                              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider border ${log.moduleBadgeColor}`}
                            >
                              <span className="material-symbols-outlined text-[13px]">{log.moduleIcon}</span>
                              {log.module}
                            </span>
                          </td>

                          {/* Action Type */}
                          <td className="py-3.5 px-5">
                            <span
                              className={`inline-flex items-center px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider ${log.actionColor}`}
                            >
                              {log.action}
                            </span>
                          </td>

                          {/* Details */}
                          <td className="py-3.5 px-5">
                            <p className="text-slate-700 text-xs font-medium leading-relaxed line-clamp-2">
                              {log.details}
                            </p>
                          </td>

                          {/* Reference / PDF */}
                          <td className="py-3.5 px-5 text-center">
                            {log.pdfUrl ? (
                              <a
                                href={log.pdfUrl}
                                target="_blank"
                                rel="noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 text-[10px] font-black uppercase transition-all"
                                title="Abrir constancia emitida en PDF"
                              >
                                <span className="material-symbols-outlined text-xs">picture_as_pdf</span>
                                <span>Ver PDF</span>
                              </a>
                            ) : log.referenceId ? (
                              <span
                                className="inline-block px-2 py-0.5 rounded bg-slate-100 text-slate-600 text-[10px] font-mono font-bold max-w-[130px] truncate"
                                title={log.referenceId}
                              >
                                {log.referenceId}
                              </span>
                            ) : (
                              <span className="text-slate-300 text-xs">-</span>
                            )}
                          </td>

                          {/* Inspect Button */}
                          <td className="py-3.5 px-5 text-center">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setInspectedLog(log);
                              }}
                              className="size-8 rounded-lg bg-slate-100 text-slate-500 hover:bg-slate-900 hover:text-white flex items-center justify-center transition-all mx-auto"
                              title="Inspeccionar detalle completo"
                            >
                              <span className="material-symbols-outlined text-base">visibility</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination Controls */}
            {filteredLogs.length > 0 && (
              <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2 text-slate-500 font-medium">
                  <span>
                    Mostrando {(currentPage - 1) * pageSize + 1} a{' '}
                    {Math.min(currentPage * pageSize, filteredLogs.length)} de {filteredLogs.length} eventos
                  </span>
                  <span className="text-slate-300">|</span>
                  <div className="flex items-center gap-1.5">
                    <span>Por página:</span>
                    <select
                      value={pageSize}
                      onChange={(e) => setPageSize(Number(e.target.value))}
                      className="bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs font-bold"
                    >
                      <option value={25}>25</option>
                      <option value={50}>50</option>
                      <option value={100}>100</option>
                    </select>
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
                    disabled={currentPage === 1}
                    className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-white"
                  >
                    <span className="material-symbols-outlined text-sm">chevron_left</span>
                  </button>

                  <span className="px-3 font-bold text-slate-700">
                    Página {currentPage} de {totalPages}
                  </span>

                  <button
                    onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
                    disabled={currentPage === totalPages}
                    className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-white"
                  >
                    <span className="material-symbols-outlined text-sm">chevron_right</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: RASTREO INDIVIDUAL POR OPERADOR */}
      {activeTab === 'rastreo_usuario' && (
        <div className="flex flex-col gap-6">
          {/* User Selector Header */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex flex-col">
              <span className="text-xs font-black uppercase tracking-wider text-slate-400">
                Seleccione el Operador a Rastrear
              </span>
              <p className="text-slate-700 text-sm font-medium mt-1">
                Visualice el expediente de actividad completo, constancias expedidas y modificaciones efectuadas por el usuario.
              </p>
            </div>

            <div className="w-full md:w-80">
              <select
                value={trackedUser}
                onChange={(e) => setTrackedUser(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border-2 border-slate-900 bg-white text-sm font-black uppercase text-slate-800 focus:ring-2 focus:ring-primary outline-none shadow-sm"
              >
                {uniqueUsersInLogs.map((u) => (
                  <option key={u.name} value={u.name}>
                    {u.name} — ({u.count} acciones)
                  </option>
                ))}
              </select>
            </div>
          </div>

          {trackedUserData && (
            <div className="flex flex-col gap-6">
              {/* Operator Profile Card & Metrics */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Profile Overview */}
                <div className="bg-slate-900 text-white rounded-2xl p-6 shadow-md flex flex-col justify-between">
                  <div className="flex items-start gap-4">
                    <div className="size-16 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center text-xl font-black text-white shrink-0">
                      {trackedUserData.userName
                        .split(/[\s-]+/)
                        .filter(Boolean)
                        .slice(0, 2)
                        .map((p) => p[0])
                        .join('')}
                    </div>
                    <div className="flex flex-col overflow-hidden">
                      <span className="text-[10px] font-black uppercase tracking-widest text-emerald-400">
                        Ficha de Operador
                      </span>
                      <h2 className="text-lg font-black text-white leading-snug mt-0.5 truncate">
                        {trackedUserData.userName}
                      </h2>
                      <div className="flex items-center gap-2 mt-2">
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-white/20 text-white">
                          {trackedUserData.role}
                        </span>
                        {trackedUserData.dni !== 'N/A' && (
                          <span className="text-xs font-mono text-slate-300">DNI: {trackedUserData.dni}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="pt-6 border-t border-white/10 mt-6 flex flex-col gap-1 text-xs text-slate-300 font-medium">
                    <span>
                      Última acción registrada:{' '}
                      <strong className="text-white">
                        {trackedUserData.lastActive
                          ? `${trackedUserData.lastActive.toLocaleDateString('es-PE')} a las ${trackedUserData.lastActive.toLocaleTimeString('es-PE')}`
                          : 'Sin registros'}
                      </strong>
                    </span>
                  </div>
                </div>

                {/* Productivity Indicators */}
                <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex flex-col justify-between">
                    <div className="size-10 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center mb-3">
                      <span className="material-symbols-outlined text-xl">analytics</span>
                    </div>
                    <span className="text-slate-400 text-[10px] font-black uppercase tracking-widest">
                      Intervenciones Totales
                    </span>
                    <span className="text-3xl font-black text-slate-900 mt-1">
                      {trackedUserData.totalActions}
                    </span>
                    <span className="text-[11px] text-slate-500 mt-0.5 font-medium">
                      Acciones auditadas
                    </span>
                  </div>

                  <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex flex-col justify-between">
                    <div className="size-10 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center mb-3">
                      <span className="material-symbols-outlined text-xl">login</span>
                    </div>
                    <span className="text-slate-400 text-[10px] font-black uppercase tracking-widest">
                      Inicios de Sesión
                    </span>
                    <span className="text-3xl font-black text-teal-700 mt-1">
                      {trackedUserData.loginsCount}
                    </span>
                    <span className="text-[11px] text-slate-500 mt-0.5 font-medium">
                      Accesos a la web app
                    </span>
                  </div>

                  <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex flex-col justify-between">
                    <div className="size-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center mb-3">
                      <span className="material-symbols-outlined text-xl">verified</span>
                    </div>
                    <span className="text-slate-400 text-[10px] font-black uppercase tracking-widest">
                      Constancias Emitidas
                    </span>
                    <span className="text-3xl font-black text-emerald-600 mt-1">
                      {trackedUserData.emissionsCount}
                    </span>
                    <span className="text-[11px] text-slate-500 mt-0.5 font-medium">
                      Con código QR oficial
                    </span>
                  </div>

                  <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex flex-col justify-between">
                    <div className="size-10 rounded-xl bg-purple-50 text-purple-700 flex items-center justify-center mb-3">
                      <span className="material-symbols-outlined text-xl">tune</span>
                    </div>
                    <span className="text-slate-400 text-[10px] font-black uppercase tracking-widest">
                      Plantillas y Trámites
                    </span>
                    <span className="text-3xl font-black text-purple-600 mt-1">
                      {trackedUserData.templatesCount + trackedUserData.statesCount}
                    </span>
                    <span className="text-[11px] text-slate-500 mt-0.5 font-medium">
                      {trackedUserData.templatesCount} plant., {trackedUserData.statesCount} est.
                    </span>
                  </div>
                </div>
              </div>

              {/* User Chronological Activity Timeline */}
              <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col gap-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-slate-700">timeline</span>
                    <h3 className="text-slate-900 text-base font-black uppercase tracking-tight">
                      Línea de Tiempo Cronológica del Operador
                    </h3>
                  </div>
                  <span className="text-xs font-black text-slate-500">
                    {trackedUserData.logs.length} registros
                  </span>
                </div>

                <div className="relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-3 before:bottom-3 before:w-0.5 before:bg-slate-200">
                  {trackedUserData.logs.map((log) => (
                    <div key={log.id} className="relative group">
                      {/* Timeline dot */}
                      <div className="absolute -left-6 top-1.5 size-5 rounded-full border-2 border-white bg-slate-900 shadow-sm flex items-center justify-center" />

                      <div className="bg-slate-50 hover:bg-slate-100/80 rounded-xl p-4 border border-slate-200 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex flex-col gap-1.5 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-bold text-slate-900 font-mono">
                              {log.timestamp.toLocaleDateString('es-PE')} {log.timestamp.toLocaleTimeString('es-PE')}
                            </span>
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider border ${log.moduleBadgeColor}`}
                            >
                              <span className="material-symbols-outlined text-xs">{log.moduleIcon}</span>
                              {log.module}
                            </span>
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider ${log.actionColor}`}
                            >
                              {log.action}
                            </span>
                          </div>
                          <p className="text-slate-700 text-xs font-medium leading-relaxed">
                            {log.details}
                          </p>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {log.pdfUrl && (
                            <a
                              href={log.pdfUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-black uppercase flex items-center gap-1 shadow-sm transition-all"
                            >
                              <span className="material-symbols-outlined text-xs">picture_as_pdf</span>
                              <span>PDF</span>
                            </a>
                          )}
                          <button
                            onClick={() => setInspectedLog(log)}
                            className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-[10px] font-black uppercase transition-all shadow-sm"
                          >
                            Detalle
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* FORENSIC INSPECTION MODAL */}
      {inspectedLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden animate-scaleUp">
            {/* Modal Header */}
            <div className="px-6 py-5 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="size-10 rounded-xl bg-white/10 flex items-center justify-center text-white">
                  <span className="material-symbols-outlined text-xl">{inspectedLog.moduleIcon}</span>
                </div>
                <div>
                  <h3 className="text-base font-black tracking-tight text-white">
                    Inspección Forense de Auditoría
                  </h3>
                  <span className="text-xs text-slate-400 font-mono">ID: {inspectedLog.id}</span>
                </div>
              </div>

              <button
                onClick={() => setInspectedLog(null)}
                className="size-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-all"
              >
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 overflow-y-auto space-y-5 text-sm">
              {/* Operator block */}
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="size-12 rounded-full bg-slate-900 text-white flex items-center justify-center text-sm font-black shadow-sm">
                    {inspectedLog.user
                      .split(/[\s-]+/)
                      .filter(Boolean)
                      .slice(0, 2)
                      .map((p) => p[0])
                      .join('')}
                  </div>
                  <div>
                    <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">
                      Operador Responsable
                    </span>
                    <h4 className="text-sm font-black text-slate-900">{inspectedLog.user}</h4>
                    <span className="text-xs font-bold text-slate-500">Rol: {inspectedLog.userRole}</span>
                  </div>
                </div>

                <div className="text-right">
                  <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Fecha / Hora Oficial</span>
                  <div className="text-xs font-black text-slate-800">
                    {inspectedLog.timestamp.toLocaleDateString('es-PE')}
                  </div>
                  <div className="text-xs font-mono text-slate-500">
                    {inspectedLog.timestamp.toLocaleTimeString('es-PE')}
                  </div>
                </div>
              </div>

              {/* Module & Action badges */}
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-black uppercase border ${inspectedLog.moduleBadgeColor}`}
                >
                  <span className="material-symbols-outlined text-sm">{inspectedLog.moduleIcon}</span>
                  <span>Módulo: {inspectedLog.module}</span>
                </span>

                <span
                  className={`inline-flex items-center px-3 py-1.5 rounded-xl text-xs font-black uppercase ${inspectedLog.actionColor}`}
                >
                  Acción: {inspectedLog.action}
                </span>

                <span className="inline-flex items-center px-3 py-1.5 rounded-xl text-xs font-mono bg-slate-100 text-slate-600 font-bold">
                  Origen: {inspectedLog.source}
                </span>
              </div>

              {/* Event Description */}
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-black uppercase tracking-wider text-slate-400">
                  Descripción Exhaustiva del Evento
                </span>
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl text-slate-800 font-medium leading-relaxed whitespace-pre-wrap text-sm">
                  {inspectedLog.details}
                </div>
              </div>

              {/* Constancia / Student Metadata (if available) */}
              {inspectedLog.rawMetadata && typeof inspectedLog.rawMetadata === 'object' && (
                <div className="flex flex-col gap-1.5">
                  <span className="text-xs font-black uppercase tracking-wider text-slate-400">
                    Metadatos Vinculados del Documento / Entidad
                  </span>
                  <div className="grid grid-cols-2 gap-3 p-4 bg-slate-50 border border-slate-200 rounded-2xl text-xs">
                    {inspectedLog.rawMetadata.estudiante_nombre && (
                      <div>
                        <span className="text-slate-400 font-bold">Estudiante:</span>
                        <div className="font-black text-slate-800">{inspectedLog.rawMetadata.estudiante_nombre}</div>
                      </div>
                    )}
                    {inspectedLog.rawMetadata.estudiante_dni && (
                      <div>
                        <span className="text-slate-400 font-bold">DNI:</span>
                        <div className="font-mono font-bold text-slate-800">{inspectedLog.rawMetadata.estudiante_dni}</div>
                      </div>
                    )}
                    {inspectedLog.rawMetadata.carrera && (
                      <div>
                        <span className="text-slate-400 font-bold">Carrera:</span>
                        <div className="font-black text-slate-800">{inspectedLog.rawMetadata.carrera}</div>
                      </div>
                    )}
                    {inspectedLog.rawMetadata.modalidad && (
                      <div>
                        <span className="text-slate-400 font-bold">Modalidad:</span>
                        <div className="font-medium text-slate-800">{inspectedLog.rawMetadata.modalidad}</div>
                      </div>
                    )}
                    {inspectedLog.referenceId && (
                      <div className="col-span-2">
                        <span className="text-slate-400 font-bold">Código Oficial de Verificación / Ref:</span>
                        <div className="font-mono font-black text-slate-900 bg-white p-2 rounded-lg border border-slate-200 mt-1 select-all">
                          {inspectedLog.referenceId}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Direct PDF Link */}
              {inspectedLog.pdfUrl && (
                <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-2xl text-emerald-700">picture_as_pdf</span>
                    <div>
                      <div className="font-black text-emerald-900 text-xs">Documento Oficial en Formato PDF</div>
                      <div className="text-[11px] text-emerald-700">Constancia digital generada y almacenada</div>
                    </div>
                  </div>
                  <a
                    href={inspectedLog.pdfUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-black text-xs uppercase shadow-sm transition-all"
                  >
                    Descargar / Ver PDF
                  </a>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
              <button
                onClick={() => copyInspectorReport(inspectedLog)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 text-xs font-black uppercase transition-all shadow-sm"
              >
                <span className="material-symbols-outlined text-base">
                  {copyFeedback ? 'check' : 'content_copy'}
                </span>
                <span>{copyFeedback ? '¡Copiado!' : 'Copiar Registro Forense'}</span>
              </button>

              <button
                onClick={() => setInspectedLog(null)}
                className="px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-black text-white text-xs font-black uppercase shadow-sm transition-all"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};