import React, { useState } from 'react';
import { Participant } from '../types';
import { StudentDocument, getDocumentStreamUrl } from '../lib/fileGateway';
import { DocumentViewerModal } from './DocumentViewerModal';
import { fixCareerName } from '../pages/StudentLookup';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export interface ApplicantApplicationRecord {
  id: string;
  modalidad: string;
  carrera1?: string;
  carrera2?: string;
  carreraIngreso?: string;
  nota?: string;
  puesto?: string;
  condicion?: string;
  grupo?: string;
  aula?: string;
  rawRow?: any;
}

export interface IntegratedStudentData {
  dni: string;
  fullName: string;
  isIngresanteOficial: boolean;
  isSoloPostulante: boolean;
  hasRenuncia: boolean;
  hasReserva: boolean;
  hasRetiroReserva: boolean;
  
  // Historical admissions from participantes
  admissions: Participant[];
  
  // Applications from pre-revision processes
  applications: ApplicantApplicationRecord[];
  
  // Personal & Contact Info
  phone?: string;
  email?: string;
  address?: string;
  birthDate?: string;
  birthPlace?: string;
  currentUbigeo?: string;
  gender?: string;
  disability?: string;
  nationality?: string;
  
  // School Provenance
  schoolCode?: string;
  schoolName?: string;
  schoolInfo?: {
    nombre_ie?: string;
    tipo_gestion?: string;
    nivel_modalidad?: string;
    dependencia?: string;
    direccion_ie?: string;
    distrito?: string;
    provincia?: string;
    departamento?: string;
  } | null;
  
  // Local Documents & Photo
  documents: StudentDocument[];
  photoDoc?: StudentDocument | null;
  
  // Trámites
  renuncias: any[];
  reservas: any[];
}

interface IntegratedStudentModalProps {
  data: IntegratedStudentData | null;
  gatewayUrl: string;
  onClose: () => void;
}

export const IntegratedStudentModal: React.FC<IntegratedStudentModalProps> = ({
  data,
  gatewayUrl,
  onClose
}) => {
  const [activeTab, setActiveTab] = useState<'perfil' | 'trayectoria' | 'documentos'>('perfil');
  const [selectedDocForViewer, setSelectedDocForViewer] = useState<StudentDocument | null>(null);

  if (!data) return null;

  const photoStreamUrl = data.photoDoc ? getDocumentStreamUrl(data.photoDoc.path, gatewayUrl) : null;

  const cleanPhone = (data.phone || '').replace(/\D/g, '');
  const whatsappUrl = cleanPhone.length >= 9 
    ? `https://wa.me/51${cleanPhone.slice(-9)}`
    : null;

  const generatePDF = () => {
    const doc = new jsPDF();
    
    // Header
    doc.setFillColor(15, 23, 42); // slate-900
    doc.rect(0, 0, 210, 28, 'F');
    
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('FICHA INTEGRAL DE POSTULANTE / INGRESANTE', 14, 12);
    
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text('UNIVERSIDAD NACIONAL DE SAN ANTONIO ABAD DEL CUSCO - DIRECCIÓN DE ADMISIÓN', 14, 18);
    doc.text(`Fecha de emisión: ${new Date().toLocaleDateString('es-PE')} ${new Date().toLocaleTimeString('es-PE')}`, 14, 23);

    // Identificación
    doc.setTextColor(15, 23, 42);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('1. DATOS PERSONALES Y DE CONTACTO', 14, 38);

    const personalData = [
      ['Nombres y Apellidos:', data.fullName, 'DNI / Código:', data.dni],
      ['Teléfono / Celular:', data.phone || 'No registrado', 'Correo Electrónico:', data.email || 'No registrado'],
      ['Dirección Actual:', data.address || 'No registrado', 'Ubigeo Domicilio:', data.currentUbigeo || 'No registrado'],
      ['Fecha de Nacimiento:', data.birthDate || 'No registrado', 'Sexo / Discapacidad:', `${data.gender || 'No reg.'} / ${data.disability || 'Ninguna'}`],
    ];

    autoTable(doc, {
      startY: 42,
      body: personalData,
      theme: 'grid',
      styles: { fontSize: 8.5, cellPadding: 2 },
      columnStyles: {
        0: { fontStyle: 'bold', cellWidth: 35, fillColor: [248, 250, 252] },
        1: { cellWidth: 65 },
        2: { fontStyle: 'bold', cellWidth: 35, fillColor: [248, 250, 252] },
        3: { cellWidth: 45 }
      }
    });

    let currentY = (doc as any).lastAutoTable.finalY + 8;

    // Procedencia Escolar
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('2. PROCEDENCIA ESCOLAR (COLEGIO)', 14, currentY);

    const schoolRows = [
      [
        'Institución Educativa:', 
        data.schoolInfo?.nombre_ie || data.schoolName || 'No registrado', 
        'Código Modular:', 
        data.schoolCode || 'No registrado'
      ],
      [
        'Tipo de Gestión:', 
        data.schoolInfo?.tipo_gestion || 'No registrado', 
        'Nivel / Dependencia:', 
        `${data.schoolInfo?.nivel_modalidad || 'Secundaria'} - ${data.schoolInfo?.dependencia || ''}`
      ],
      [
        'Ubicación Colegio:', 
        data.schoolInfo?.departamento ? `${data.schoolInfo.departamento} / ${data.schoolInfo.provincia} / ${data.schoolInfo.distrito}` : 'No registrado',
        'Dirección I.E.:', 
        data.schoolInfo?.direccion_ie || 'No registrado'
      ]
    ];

    autoTable(doc, {
      startY: currentY + 4,
      body: schoolRows,
      theme: 'grid',
      styles: { fontSize: 8.5, cellPadding: 2 },
      columnStyles: {
        0: { fontStyle: 'bold', cellWidth: 35, fillColor: [248, 250, 252] },
        1: { cellWidth: 65 },
        2: { fontStyle: 'bold', cellWidth: 35, fillColor: [248, 250, 252] },
        3: { cellWidth: 45 }
      }
    });

    currentY = (doc as any).lastAutoTable.finalY + 8;

    // Trayectoria de Ingresos y Postulaciones
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('3. HISTORIAL DE INGRESOS Y POSTULACIONES', 14, currentY);

    const historyRows: any[] = [];
    
    // Ingresos
    data.admissions.forEach(adm => {
      historyRows.push([
        'INGRESO OFICIAL',
        `${adm.SEMESTRE}-${adm.ANIO}`,
        fixCareerName(adm.CARRERA) || 'CARRERA UNIVERSITARIA',
        adm.MODALIDAD,
        adm.NOTA || '-',
        adm.OMERITO ? `Puesto ${adm.OMERITO}` : '-',
        adm.FILIAL || 'CUSCO'
      ]);
    });

    // Applications
    data.applications.forEach(app => {
      historyRows.push([
        app.condicion?.toUpperCase().includes('INGRESA') ? 'INGRESANTE (PROCESO)' : 'POSTULACIÓN',
        app.modalidad,
        fixCareerName(app.carreraIngreso || app.carrera1 || app.carrera2) || '-',
        app.modalidad,
        app.nota || '-',
        app.puesto ? `Puesto ${app.puesto}` : '-',
        app.condicion || 'PARTICIPANTE'
      ]);
    });

    if (historyRows.length === 0) {
      historyRows.push(['Sin registros', '-', '-', '-', '-', '-', '-']);
    }

    autoTable(doc, {
      startY: currentY + 4,
      head: [['Tipo Registro', 'Proceso/Periodo', 'Carrera / Programa', 'Modalidad', 'Puntaje', 'Mérito', 'Condición / Sede']],
      body: historyRows,
      theme: 'striped',
      headStyles: { fillColor: [79, 70, 229], fontSize: 8 },
      styles: { fontSize: 8, cellPadding: 2 }
    });

    // Guardar PDF
    doc.save(`Ficha_Integral_${data.dni}_${data.fullName.replace(/\s+/g, '_')}.pdf`);
  };

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
        <div className="bg-slate-900 text-slate-100 w-full max-w-5xl h-[92vh] rounded-3xl shadow-2xl border border-slate-800 flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
          
          {/* Header */}
          <div className="px-6 py-5 bg-slate-950 border-b border-slate-800 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4 min-w-0">
              {photoStreamUrl ? (
                <div className="size-16 rounded-2xl overflow-hidden border-2 border-primary/50 shadow-md bg-slate-800 shrink-0">
                  <img 
                    src={photoStreamUrl} 
                    alt={data.fullName} 
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLElement).style.display = 'none';
                    }}
                  />
                </div>
              ) : (
                <div className="size-16 rounded-2xl bg-slate-800 border border-slate-700 text-slate-400 flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-3xl">person</span>
                </div>
              )}
              
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  {data.isIngresanteOficial ? (
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                      <span className="material-symbols-outlined text-[14px]">verified</span>
                      INGRESANTE OFICIAL
                    </span>
                  ) : (
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-blue-500/20 text-blue-400 border border-blue-500/30 flex items-center gap-1">
                      <span className="material-symbols-outlined text-[14px]">school</span>
                      SOLO POSTULANTE
                    </span>
                  )}

                  {data.hasRenuncia && (
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-red-500/20 text-red-400 border border-red-500/30 flex items-center gap-1">
                      <span className="material-symbols-outlined text-[14px]">cancel</span>
                      RENUNCIA REGISTRADA
                    </span>
                  )}

                  {data.hasReserva && (
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center gap-1">
                      <span className="material-symbols-outlined text-[14px]">bookmark</span>
                      RESERVA DE VACANTE
                    </span>
                  )}
                </div>

                <h2 className="text-xl sm:text-2xl font-black text-white uppercase tracking-tight truncate">
                  {data.fullName}
                </h2>
                <div className="flex items-center gap-3 text-xs text-slate-400 mt-0.5">
                  <span className="font-mono font-bold text-slate-300">DNI: {data.dni}</span>
                  {data.schoolInfo?.nombre_ie && (
                    <span className="truncate hidden sm:inline text-slate-400">
                      • I.E. {data.schoolInfo.nombre_ie}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Quick Actions in Header */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={generatePDF}
                className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all border border-slate-700"
                title="Descargar Ficha en PDF"
              >
                <span className="material-symbols-outlined text-[16px] text-red-400">picture_as_pdf</span>
                <span className="hidden sm:inline">Exportar Ficha</span>
              </button>

              <button
                type="button"
                onClick={onClose}
                className="size-9 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-colors"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="px-6 py-2.5 bg-slate-950/60 border-b border-slate-800/80 flex items-center gap-2 shrink-0 overflow-x-auto">
            {[
              { id: 'perfil', label: 'Datos Personales y Colegio', icon: 'badge' },
              { id: 'trayectoria', label: 'Historial Académico y Procesos', icon: 'timeline', count: data.admissions.length + data.applications.length },
              { id: 'documentos', label: 'Expediente Digital Gateway', icon: 'folder_open', count: data.documents.length },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  activeTab === tab.id
                    ? 'bg-primary text-white shadow-md shadow-primary/20'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                }`}
              >
                <span className="material-symbols-outlined text-[16px]">{tab.icon}</span>
                {tab.label}
                {tab.count !== undefined && (
                  <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                    activeTab === tab.id ? 'bg-white/20 text-white' : 'bg-slate-800 text-slate-400'
                  }`}>
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {activeTab === 'perfil' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* Contact Card */}
                <div className="bg-slate-950/50 border border-slate-800 rounded-2xl p-5 flex flex-col gap-4">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                    <h3 className="text-xs font-black uppercase tracking-widest text-primary flex items-center gap-2">
                      <span className="material-symbols-outlined text-[18px]">contact_phone</span>
                      Canales de Contacto Directo
                    </h3>
                  </div>

                  <div className="space-y-3">
                    {/* Celular / WhatsApp */}
                    <div className="p-3 bg-slate-900 rounded-xl border border-slate-800 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="size-9 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
                          <span className="material-symbols-outlined text-[20px]">phone</span>
                        </div>
                        <div>
                          <p className="text-[10px] font-bold text-slate-400 uppercase">Celular / Teléfono</p>
                          <p className="text-sm font-bold text-slate-100 font-mono">
                            {data.phone || 'No registrado'}
                          </p>
                        </div>
                      </div>
                      {whatsappUrl && (
                        <a
                          href={whatsappUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm"
                        >
                          <span className="material-symbols-outlined text-[15px]">chat</span>
                          WhatsApp
                        </a>
                      )}
                    </div>

                    {/* Email */}
                    <div className="p-3 bg-slate-900 rounded-xl border border-slate-800 flex items-center justify-between">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="size-9 rounded-lg bg-blue-500/10 text-blue-400 flex items-center justify-center shrink-0">
                          <span className="material-symbols-outlined text-[20px]">mail</span>
                        </div>
                        <div className="min-w-0">
                          <p className="text-[10px] font-bold text-slate-400 uppercase">Correo Electrónico</p>
                          <p className="text-xs font-bold text-slate-100 truncate">
                            {data.email || 'No registrado'}
                          </p>
                        </div>
                      </div>
                      {data.email && (
                        <a
                          href={`mailto:${data.email}`}
                          className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-bold flex items-center gap-1 transition-all border border-slate-700 shrink-0"
                        >
                          <span className="material-symbols-outlined text-[15px]">send</span>
                          Escribir
                        </a>
                      )}
                    </div>

                    {/* Domicilio */}
                    <div className="p-3 bg-slate-900 rounded-xl border border-slate-800">
                      <p className="text-[10px] font-bold text-slate-400 uppercase">Dirección de Domicilio</p>
                      <p className="text-xs font-bold text-slate-200 mt-0.5">
                        {data.address || 'No registrada'}
                      </p>
                      {data.currentUbigeo && (
                        <p className="text-[10px] text-slate-400 font-mono mt-1">
                          Ubigeo: {data.currentUbigeo}
                        </p>
                      )}
                    </div>

                    {/* Datos Personales Extra */}
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <div className="p-2.5 bg-slate-900 rounded-xl border border-slate-800">
                        <p className="text-[9px] font-bold text-slate-400 uppercase">Fecha Nacimiento</p>
                        <p className="text-xs font-bold text-slate-200 mt-0.5 font-mono">{data.birthDate || '-'}</p>
                      </div>
                      <div className="p-2.5 bg-slate-900 rounded-xl border border-slate-800">
                        <p className="text-[9px] font-bold text-slate-400 uppercase">Sexo / Género</p>
                        <p className="text-xs font-bold text-slate-200 mt-0.5">{data.gender || '-'}</p>
                      </div>
                      <div className="p-2.5 bg-slate-900 rounded-xl border border-slate-800">
                        <p className="text-[9px] font-bold text-slate-400 uppercase">Discapacidad</p>
                        <p className="text-xs font-bold text-slate-200 mt-0.5">{data.disability || 'Ninguna'}</p>
                      </div>
                      <div className="p-2.5 bg-slate-900 rounded-xl border border-slate-800">
                        <p className="text-[9px] font-bold text-slate-400 uppercase">Nacionalidad</p>
                        <p className="text-xs font-bold text-slate-200 mt-0.5">{data.nationality || 'PERÚ'}</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* School Provenance Card */}
                <div className="bg-slate-950/50 border border-slate-800 rounded-2xl p-5 flex flex-col gap-4">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                    <h3 className="text-xs font-black uppercase tracking-widest text-primary flex items-center gap-2">
                      <span className="material-symbols-outlined text-[18px]">account_balance</span>
                      Procedencia Escolar (Colegio)
                    </h3>
                    {data.schoolCode && (
                      <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono text-[10px] font-bold border border-slate-700">
                        Cód. Modular: {data.schoolCode}
                      </span>
                    )}
                  </div>

                  <div className="space-y-3">
                    <div className="p-4 bg-slate-900 rounded-xl border border-slate-800">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-[10px] font-bold text-slate-400 uppercase">Nombre Institución Educativa</p>
                          <h4 className="text-base font-black text-white uppercase mt-0.5">
                            {data.schoolInfo?.nombre_ie || data.schoolName || 'Sin datos de colegio'}
                          </h4>
                        </div>
                        {data.schoolInfo?.tipo_gestion && (
                          <span className={`px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider shrink-0 ${
                            data.schoolInfo.tipo_gestion.toLowerCase().includes('públ') || data.schoolInfo.tipo_gestion.toLowerCase().includes('publ')
                              ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                              : 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                          }`}>
                            {data.schoolInfo.tipo_gestion}
                          </span>
                        )}
                      </div>

                      {data.schoolInfo?.direccion_ie && (
                        <p className="text-xs text-slate-300 mt-3 flex items-center gap-1.5">
                          <span className="material-symbols-outlined text-[16px] text-slate-400">location_on</span>
                          {data.schoolInfo.direccion_ie}
                        </p>
                      )}
                    </div>

                    {data.schoolInfo && (
                      <div className="grid grid-cols-3 gap-2">
                        <div className="p-3 bg-slate-900 rounded-xl border border-slate-800">
                          <p className="text-[9px] font-bold text-slate-400 uppercase">Departamento</p>
                          <p className="text-xs font-bold text-slate-200 mt-0.5">{data.schoolInfo.departamento || '-'}</p>
                        </div>
                        <div className="p-3 bg-slate-900 rounded-xl border border-slate-800">
                          <p className="text-[9px] font-bold text-slate-400 uppercase">Provincia</p>
                          <p className="text-xs font-bold text-slate-200 mt-0.5">{data.schoolInfo.provincia || '-'}</p>
                        </div>
                        <div className="p-3 bg-slate-900 rounded-xl border border-slate-800">
                          <p className="text-[9px] font-bold text-slate-400 uppercase">Distrito</p>
                          <p className="text-xs font-bold text-slate-200 mt-0.5">{data.schoolInfo.distrito || '-'}</p>
                        </div>
                      </div>
                    )}

                    <div className="p-3 bg-slate-900 rounded-xl border border-slate-800">
                      <p className="text-[10px] font-bold text-slate-400 uppercase">Dependencia y Modalidad</p>
                      <p className="text-xs font-bold text-slate-300 mt-0.5">
                        {data.schoolInfo?.dependencia || 'Particular/Pública'} • {data.schoolInfo?.nivel_modalidad || 'Educación Secundaria'}
                      </p>
                    </div>
                  </div>
                </div>

              </div>
            )}

            {activeTab === 'trayectoria' && (
              <div className="space-y-6">
                
                {/* Admissions */}
                {data.admissions.length > 0 && (
                  <div>
                    <h3 className="text-xs font-black uppercase tracking-widest text-emerald-400 mb-3 flex items-center gap-2">
                      <span className="material-symbols-outlined text-[18px]">verified</span>
                      Ingresos Universitarios Oficiales (participantes)
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {data.admissions.map((adm, idx) => (
                        <div key={idx} className="bg-slate-950/60 border border-emerald-500/30 rounded-2xl p-5 relative overflow-hidden">
                          <div className="flex justify-between items-start mb-2">
                            <div>
                              <span className="text-[10px] font-black text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 uppercase">
                                Admisión {adm.SEMESTRE}-{adm.ANIO}
                              </span>
                              <h4 className="text-base font-black text-white uppercase mt-1">
                                {fixCareerName(adm.CARRERA)}
                              </h4>
                            </div>
                            {adm.NOTA && (
                              <div className="text-right">
                                <span className="text-[9px] font-bold text-slate-400 uppercase">Puntaje</span>
                                <p className="text-lg font-black text-emerald-400 font-mono">{adm.NOTA}</p>
                              </div>
                            )}
                          </div>

                          <div className="grid grid-cols-3 gap-2 mt-4 pt-3 border-t border-slate-800 text-xs">
                            <div>
                              <span className="text-[9px] font-bold text-slate-400 uppercase">Modalidad</span>
                              <p className="font-bold text-slate-200 truncate">{adm.MODALIDAD}</p>
                            </div>
                            <div>
                              <span className="text-[9px] font-bold text-slate-400 uppercase">Puesto Mérito</span>
                              <p className="font-bold text-slate-200">{adm.OMERITO || '-'}</p>
                            </div>
                            <div>
                              <span className="text-[9px] font-bold text-slate-400 uppercase">Sede / Filial</span>
                              <p className="font-bold text-slate-200">{adm.FILIAL || 'CUSCO'}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Applications from pre-revision processes */}
                {data.applications.length > 0 && (
                  <div>
                    <h3 className="text-xs font-black uppercase tracking-widest text-primary mb-3 flex items-center gap-2">
                      <span className="material-symbols-outlined text-[18px]">assignment_ind</span>
                      Procesos de Postulación y Exámenes Registrados
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {data.applications.map((app, idx) => (
                        <div key={idx} className="bg-slate-950/60 border border-slate-800 rounded-2xl p-5">
                          <div className="flex justify-between items-start mb-2">
                            <div>
                              <span className="text-[10px] font-black text-primary bg-primary/10 px-2 py-0.5 rounded border border-primary/20 uppercase">
                                {app.modalidad}
                              </span>
                              <h4 className="text-base font-black text-white uppercase mt-1">
                                {fixCareerName(app.carreraIngreso || app.carrera1 || app.carrera2) || 'CARRERA NO ESPECIFICADA'}
                              </h4>
                            </div>
                            {app.nota && (
                              <div className="text-right">
                                <span className="text-[9px] font-bold text-slate-400 uppercase">Nota</span>
                                <p className="text-lg font-black text-white font-mono">{app.nota}</p>
                              </div>
                            )}
                          </div>

                          <div className="grid grid-cols-3 gap-2 mt-4 pt-3 border-t border-slate-800 text-xs">
                            <div>
                              <span className="text-[9px] font-bold text-slate-400 uppercase">Condición</span>
                              <p className={`font-bold uppercase truncate ${
                                app.condicion?.includes('INGRESA') ? 'text-emerald-400' : 'text-slate-300'
                              }`}>
                                {app.condicion || 'PARTICIPANTE'}
                              </p>
                            </div>
                            <div>
                              <span className="text-[9px] font-bold text-slate-400 uppercase">Puesto Mérito</span>
                              <p className="font-bold text-slate-200">{app.puesto || '-'}</p>
                            </div>
                            <div>
                              <span className="text-[9px] font-bold text-slate-400 uppercase">Grupo / Aula</span>
                              <p className="font-bold text-slate-200">{app.grupo || app.aula || '-'}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Renuncias y Reservas */}
                {(data.renuncias.length > 0 || data.reservas.length > 0) && (
                  <div>
                    <h3 className="text-xs font-black uppercase tracking-widest text-amber-400 mb-3 flex items-center gap-2">
                      <span className="material-symbols-outlined text-[18px]">gavel</span>
                      Trámites y Resoluciones Administrativas
                    </h3>
                    <div className="space-y-3">
                      {data.renuncias.map((r, idx) => (
                        <div key={idx} className="p-4 bg-red-950/20 border border-red-500/30 rounded-xl flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <span className="material-symbols-outlined text-red-400 text-2xl">cancel</span>
                            <div>
                              <p className="text-sm font-bold text-white uppercase">Renuncia de Vacante: {r.school}</p>
                              <p className="text-xs text-red-300">Resolución: {r.resolution_number} • Proceso: {r.semester}</p>
                            </div>
                          </div>
                          {r.resolution_date && (
                            <span className="text-xs text-slate-400 font-mono">{r.resolution_date}</span>
                          )}
                        </div>
                      ))}

                      {data.reservas.map((res, idx) => (
                        <div key={idx} className="p-4 bg-amber-950/20 border border-amber-500/30 rounded-xl flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <span className="material-symbols-outlined text-amber-400 text-2xl">bookmark</span>
                            <div>
                              <p className="text-sm font-bold text-white uppercase">Reserva de Vacante: {res.carrera}</p>
                              <p className="text-xs text-amber-300">Semestre de Retorno: {res.starting_semester}</p>
                            </div>
                          </div>
                          {res.is_withdrawn && (
                            <span className="px-2 py-1 bg-slate-800 text-slate-300 rounded text-[10px] font-bold uppercase">
                              Retirado
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

              </div>
            )}

            {activeTab === 'documentos' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-slate-400">
                    Documentos digitalizados y fotos recuperados desde el File Gateway local (<code className="text-primary font-mono">{gatewayUrl}</code>).
                  </p>
                  <span className="text-xs font-bold text-slate-300">
                    Total: {data.documents.length} archivos
                  </span>
                </div>

                {data.documents.length === 0 ? (
                  <div className="py-12 text-center bg-slate-950/40 rounded-2xl border border-slate-800">
                    <span className="material-symbols-outlined text-5xl text-slate-600 mb-2">folder_off</span>
                    <h4 className="text-sm font-bold text-slate-300">No se encontraron archivos para este DNI</h4>
                    <p className="text-xs text-slate-500 mt-1">
                      Verifique que el servidor File Gateway esté activo en el puerto 5000 y el disco H:\ esté montado.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                    {data.documents.map((doc, idx) => {
                      const docStreamUrl = getDocumentStreamUrl(doc.path, gatewayUrl);
                      return (
                        <div
                          key={idx}
                          className="bg-slate-950/60 border border-slate-800 hover:border-primary/50 rounded-2xl p-4 flex flex-col justify-between gap-3 transition-all group"
                        >
                          <div className="flex items-start gap-3">
                            <div className={`size-10 rounded-xl flex items-center justify-center shrink-0 ${
                              doc.isPdf 
                                ? 'bg-red-500/20 text-red-400 border border-red-500/30' 
                                : doc.isImage 
                                  ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' 
                                  : 'bg-slate-800 text-slate-300'
                            }`}>
                              <span className="material-symbols-outlined text-[22px]">
                                {doc.icon || (doc.isPdf ? 'picture_as_pdf' : doc.isImage ? 'image' : 'description')}
                              </span>
                            </div>
                            <div className="min-w-0">
                              <span className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">
                                {doc.categoryLabel || 'DOCUMENTO'}
                              </span>
                              <h5 className="font-bold text-xs text-white truncate mt-1 group-hover:text-primary transition-colors">
                                {doc.friendlyName}
                              </h5>
                              <p className="text-[10px] font-mono text-slate-400 truncate mt-0.5">
                                {doc.filename}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                            <button
                              type="button"
                              onClick={() => setSelectedDocForViewer(doc)}
                              className="px-2.5 py-1.5 bg-primary/20 hover:bg-primary text-primary hover:text-white rounded-lg text-xs font-bold flex items-center gap-1 transition-all"
                            >
                              <span className="material-symbols-outlined text-[14px]">visibility</span>
                              Ver
                            </button>
                            <a
                              href={docStreamUrl}
                              download={doc.filename}
                              className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg transition-colors"
                              title="Descargar"
                            >
                              <span className="material-symbols-outlined text-[16px]">download</span>
                            </a>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 bg-slate-950 border-t border-slate-800 flex justify-end">
            <button
              onClick={onClose}
              className="px-6 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs uppercase tracking-wider rounded-xl transition-all"
            >
              Cerrar Ficha
            </button>
          </div>

        </div>
      </div>

      {/* Embedded Document Viewer Modal if a document is selected */}
      {selectedDocForViewer && (
        <DocumentViewerModal
          document={selectedDocForViewer}
          streamUrl={getDocumentStreamUrl(selectedDocForViewer.path, gatewayUrl)}
          onClose={() => setSelectedDocForViewer(null)}
        />
      )}
    </>
  );
};
