import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { fetchDocumentVerification, DocumentVerificationData } from '../lib/templateVerification';

export const PublicDocumentVerification: React.FC = () => {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<DocumentVerificationData | null>(null);
  const [searchCode, setSearchCode] = useState(code || '');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadVerification = async (targetCode: string) => {
    if (!targetCode.trim()) {
      setData(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setErrorMessage(null);

    try {
      const result = await fetchDocumentVerification(targetCode.trim());
      if (result) {
        setData(result);
      } else {
        setData(null);
        setErrorMessage('El código ingresado no corresponde a ningún documento emitido o válido en los registros oficiales de la Dirección de Admisión.');
      }
    } catch (err: any) {
      console.error('Error fetching verification:', err);
      setData(null);
      setErrorMessage(err?.message || 'Error de conexión al consultar el servicio de verificación.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (code) {
      setSearchCode(code);
      loadVerification(code);
    } else {
      setLoading(false);
    }
  }, [code]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchCode.trim()) {
      navigate(`/validar/${encodeURIComponent(searchCode.trim())}`);
      loadVerification(searchCode.trim());
    }
  };

  const handlePrintCertificate = () => {
    window.print();
  };

  const formatDate = (isoString?: string) => {
    if (!isoString) return 'Fecha no registrada';
    try {
      const d = new Date(isoString);
      if (isNaN(d.getTime())) return isoString;
      return d.toLocaleDateString('es-PE', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return isoString;
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 text-slate-800 flex flex-col font-sans selection:bg-[#7b1523] selection:text-white">
      {/* Top Header Institucional */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-xs">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 h-18 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img
              src="https://upload.wikimedia.org/wikipedia/commons/thumb/b/b8/Coat_of_arms_of_Cusco.svg/600px-Coat_of_arms_of_Cusco.svg.png"
              alt="Escudo UNSAAC"
              className="h-10 w-auto object-contain"
            />
            <div>
              <span className="block text-xs uppercase tracking-wider font-semibold text-slate-500">
                Portal Oficial de Autenticidad
              </span>
              <h1 className="text-sm sm:text-base font-bold text-[#7b1523] tracking-tight leading-tight">
                DIRECCIÓN DE ADMISIÓN · UNSAAC
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate('/login')}
              className="text-xs text-slate-500 hover:text-[#7b1523] transition-colors py-1.5 px-3 rounded border border-slate-200 hover:border-[#7b1523]/30"
            >
              Acceso Administrativo
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-4xl w-full mx-auto px-4 sm:px-6 py-8">
        {/* Barra de Búsqueda Rápida de Código */}
        <section className="mb-6">
          <form onSubmit={handleSearchSubmit} className="flex gap-2">
            <div className="relative flex-1">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xl pointer-events-none">
                qr_code_scanner
              </span>
              <input
                type="text"
                value={searchCode}
                onChange={(e) => setSearchCode(e.target.value)}
                placeholder="Ingrese o pegue el código de verificación (Ej: UNSAAC-CONST-2026-XXXXXX)"
                className="w-full pl-10 pr-4 py-2.5 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#7b1523]/30 focus:border-[#7b1523] transition-all font-mono"
              />
            </div>
            <button
              type="submit"
              className="px-5 py-2.5 bg-[#7b1523] hover:bg-red-900 text-white rounded-lg text-sm font-semibold transition-colors shadow-xs flex items-center gap-1.5 shrink-0"
            >
              <span className="material-symbols-outlined text-[18px]">verified</span>
              Verificar
            </button>
          </form>
        </section>

        {/* Loading State */}
        {loading && (
          <div className="bg-white rounded-xl border border-slate-200 p-12 text-center shadow-xs">
            <span className="material-symbols-outlined text-4xl text-[#7b1523] animate-spin mb-3">
              progress_activity
            </span>
            <h3 className="text-base font-semibold text-slate-800">Consultando Registro Oficial...</h3>
            <p className="text-xs text-slate-500 mt-1">Validando hash y firma electrónica en los servidores de la Dirección de Admisión.</p>
          </div>
        )}

        {/* Error / Not Found State */}
        {!loading && !data && (
          <div className="bg-white rounded-xl border border-red-200 p-8 text-center shadow-xs">
            <div className="size-14 rounded-full bg-red-50 text-red-600 flex items-center justify-center mx-auto mb-4 border border-red-100">
              <span className="material-symbols-outlined text-3xl">gpp_maybe</span>
            </div>
            <h2 className="text-lg font-bold text-slate-900 mb-2">Documento No Encontrado o Inválido</h2>
            <p className="text-sm text-slate-600 max-w-lg mx-auto mb-6">
              {errorMessage || 'El código escaneado no coincide con ninguna constancia emitida registrada en el sistema. Asegúrese de que el código sea correcto y no haya sido alterado.'}
            </p>
            <div className="p-4 bg-slate-50 rounded-lg text-xs text-slate-500 max-w-md mx-auto border border-slate-200 text-left">
              <p className="font-semibold text-slate-700 mb-1">Nota Institucional:</p>
              <p>Las constancias emitidas por la Dirección de Admisión de la UNSAAC cuentan con código de verificación alfanumérico registrado en libro oficial de actas y expedientes de salida.</p>
            </div>
          </div>
        )}

        {/* Verified Document Card */}
        {!loading && data && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden print:border-none print:shadow-none">
            {/* Banner de Estado de Autenticidad */}
            <div className="bg-emerald-700 text-white px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="size-10 rounded-full bg-white/15 flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-2xl text-emerald-200">verified</span>
                </div>
                <div>
                  <span className="text-[11px] uppercase tracking-wider font-semibold text-emerald-100 block">
                    Resultado de Autenticidad
                  </span>
                  <h2 className="text-base sm:text-lg font-bold tracking-tight">
                    DOCUMENTO OFICIAL VÁLIDO Y REGISTRADO
                  </h2>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handlePrintCertificate}
                  className="px-3 py-1.5 text-xs font-semibold bg-white text-emerald-800 rounded hover:bg-emerald-50 transition-colors flex items-center gap-1 shadow-xs print:hidden"
                  title="Imprimir comprobante de validación"
                >
                  <span className="material-symbols-outlined text-[16px]">print</span>
                  Imprimir Ficha
                </button>
              </div>
            </div>

            {/* Código de Verificación y Resumen */}
            <div className="p-6 border-b border-slate-200 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <span className="text-xs text-slate-500 font-medium block">Tipo de Documento:</span>
                <span className="text-base font-bold text-slate-900 block mt-0.5">
                  {data.documentType}
                </span>
                <span className="text-xs text-slate-500 mt-1 block">
                  Expedido en cumplimiento del Reglamento Oficial de Admisión UNSAAC
                </span>
              </div>

              <div className="sm:text-right bg-white sm:bg-transparent p-3 sm:p-0 rounded border sm:border-none border-slate-200">
                <span className="text-xs text-slate-500 font-medium block">Código Único de Verificación:</span>
                <span className="font-mono text-sm sm:text-base font-bold text-[#7b1523] tracking-wide block mt-0.5 select-all">
                  {data.verificationCode}
                </span>
                <span className="text-[11px] text-emerald-700 font-semibold flex items-center sm:justify-end gap-1 mt-0.5">
                  <span className="size-1.5 rounded-full bg-emerald-600"></span>
                  Firma Electrónica Válida
                </span>
              </div>
            </div>

            {/* Datos del Estudiante / Ingresante */}
            <div className="p-6">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-4 pb-2 border-b border-slate-100 flex items-center gap-2">
                <span className="material-symbols-outlined text-[18px] text-[#7b1523]">school</span>
                Datos del Postulante / Ingresante Titular
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4 text-sm">
                <div>
                  <span className="text-xs text-slate-500 block">Nombres y Apellidos Completos:</span>
                  <span className="font-bold text-slate-900 text-base block mt-0.5">
                    {data.studentName || '—'}
                  </span>
                </div>

                <div>
                  <span className="text-xs text-slate-500 block">DNI / Documento de Identidad:</span>
                  <span className="font-mono font-semibold text-slate-800 block mt-0.5">
                    {data.studentDni || '—'}
                  </span>
                </div>

                <div>
                  <span className="text-xs text-slate-500 block">Escuela Profesional (Carrera):</span>
                  <span className="font-bold text-[#7b1523] block mt-0.5">
                    {data.career || '—'}
                  </span>
                </div>

                <div>
                  <span className="text-xs text-slate-500 block">Modalidad de Ingreso:</span>
                  <span className="font-semibold text-slate-800 block mt-0.5">
                    {data.modality || '—'}
                  </span>
                </div>

                {data.studentCode && (
                  <div>
                    <span className="text-xs text-slate-500 block">Código de Postulante / Matrícula:</span>
                    <span className="font-mono font-bold text-slate-800 block mt-0.5">
                      {data.studentCode}
                    </span>
                  </div>
                )}

                {data.semester && (
                  <div>
                    <span className="text-xs text-slate-500 block">Semestre / Proceso de Admisión:</span>
                    <span className="font-semibold text-slate-800 block mt-0.5">
                      {data.semester}
                    </span>
                  </div>
                )}

                {data.score && (
                  <div>
                    <span className="text-xs text-slate-500 block">Puntaje Oficial:</span>
                    <span className="font-mono font-bold text-slate-900 block mt-0.5">
                      {data.score}
                    </span>
                  </div>
                )}

                {data.meritOrder && (
                  <div>
                    <span className="text-xs text-slate-500 block">Orden de Mérito:</span>
                    <span className="font-mono font-semibold text-slate-800 block mt-0.5">
                      Puesto N° {data.meritOrder}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Metadatos de Emisión y Trazabilidad Administrativa */}
            <div className="p-6 bg-slate-50/70 border-t border-slate-200">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-4 pb-2 border-b border-slate-200 flex items-center gap-2">
                <span className="material-symbols-outlined text-[18px] text-[#7b1523]">badge</span>
                Trazabilidad Administrativa y Emisión
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                <div>
                  <span className="text-slate-500 block">Fecha y Hora de Emisión:</span>
                  <span className="font-medium text-slate-800 block mt-0.5">
                    {formatDate(data.issuedAt)}
                  </span>
                </div>

                <div>
                  <span className="text-slate-500 block">Usuario Emisor (Siglas):</span>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="font-mono font-bold text-[#7b1523] bg-red-50 border border-red-200 px-2 py-0.5 rounded text-xs">
                      {data.userInitials || 'DA'}
                    </span>
                    {data.userName && (
                      <span className="text-slate-600 truncate text-[11px]" title={data.userName}>
                        ({data.userName})
                      </span>
                    )}
                  </div>
                </div>

                <div>
                  <span className="text-slate-500 block">Entidad Emisora:</span>
                  <span className="font-semibold text-slate-800 block mt-0.5">
                    Dirección de Admisión · UNSAAC
                  </span>
                </div>

                {data.expNumber && (
                  <div>
                    <span className="text-slate-500 block">N° de Expediente:</span>
                    <span className="font-mono font-semibold text-slate-800 block mt-0.5">
                      {data.expNumber}
                    </span>
                  </div>
                )}

                {data.receiptNumber && (
                  <div>
                    <span className="text-slate-500 block">Recibo de Pago / Boucher:</span>
                    <span className="font-mono font-semibold text-slate-800 block mt-0.5">
                      {data.receiptNumber}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Pie Informativo de Seguridad */}
            <div className="p-4 bg-white border-t border-slate-200 text-center text-xs text-slate-500 flex flex-col sm:flex-row items-center justify-between gap-2">
              <span className="flex items-center gap-1 text-slate-600">
                <span className="material-symbols-outlined text-[16px] text-emerald-600">lock</span>
                Registro firmado y certificado por los sistemas informáticos de Admisión UNSAAC.
              </span>
              <span className="font-mono text-[11px] text-slate-400">
                Cusco, Perú
              </span>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 py-4 text-center text-xs text-slate-500 mt-auto">
        <p className="m-0">
          © {new Date().getFullYear()} Universidad Nacional de San Antonio Abad del Cusco · Dirección de Admisión
        </p>
        <p className="text-[11px] text-slate-400 mt-1">
          Av. de la Cultura N° 733, Cusco · Portal de Transparencia y Verificación
        </p>
      </footer>
    </div>
  );
};
