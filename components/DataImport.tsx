import React, { useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import Papa from 'papaparse';

export const DataImport: React.FC<{ notify?: (msg: string, type?: 'success'|'error'|'warning') => void }> = ({ notify }) => {
  const [loadingColegios, setLoadingColegios] = useState(false);
  const [loadingUbigeos, setLoadingUbigeos] = useState(false);

  const sqlColegios = `
-- EJECUTAR ESTE SCRIPT EN EL PANEL DE SQL BÁSICO DE SUPABASE
DROP TABLE IF EXISTS public.colegios;
CREATE TABLE public.colegios (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  codigo_modular text,
  codigo_institucion text,
  nombre_ie text,
  nivel_modalidad text,
  tipo_gestion text,
  dependencia text,
  direccion_ie text,
  departamento_provincia_distrito text,
  departamento text,
  provincia text,
  distrito text
);
ALTER TABLE public.colegios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Permitir lectura colegios" ON public.colegios FOR SELECT USING (true);
CREATE POLICY "Permitir insertar colegios" ON public.colegios FOR INSERT WITH CHECK (true);

-- Si ya importaste la tabla antes, corre esto para separar las columnas:
-- ALTER TABLE public.colegios ADD COLUMN IF NOT EXISTS departamento TEXT, ADD COLUMN IF NOT EXISTS provincia TEXT, ADD COLUMN IF NOT EXISTS distrito TEXT;
-- UPDATE public.colegios SET departamento = trim(split_part(departamento_provincia_distrito, '/', 1)), provincia = trim(split_part(departamento_provincia_distrito, '/', 2)), distrito = trim(split_part(departamento_provincia_distrito, '/', 3)) WHERE departamento_provincia_distrito IS NOT NULL AND departamento IS NULL;
`.trim();

  const sqlUbigeos = `
-- EJECUTAR ESTE SCRIPT EN EL PANEL DE SQL BÁSICO DE SUPABASE
DROP TABLE IF EXISTS public.ubigeos;
CREATE TABLE public.ubigeos (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  ubigeo text,
  distrito text,
  provincia text,
  departamento text
);
ALTER TABLE public.ubigeos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Permitir lectura ubigeos" ON public.ubigeos FOR SELECT USING (true);
CREATE POLICY "Permitir insertar ubigeos" ON public.ubigeos FOR INSERT WITH CHECK (true);
`.trim();

  const handleImportColegios = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoadingColegios(true);
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        try {
          const formattedData = results.data.map((row: any) => {
            const rawLugar = row['Departamento / Provincia / Distrito'] || row['lugar'] || row['departamento_provincia_distrito'] || null;
            const parts = rawLugar ? rawLugar.split('/').map((s: string) => s.trim()) : [];
            return {
              codigo_modular: row['Codigo modular'] || row['codigo_modular'] || null,
              codigo_institucion: row['Codigo de institución'] || row['codigo_institucion'] || null,
              nombre_ie: row['Nombre de IE'] || row['nombre_ie'] || null,
              nivel_modalidad: row['Nivel / Modalidad'] || row['nivel_modalidad'] || null,
              tipo_gestion: row['Tipo de Gestion'] || row['tipo_gestion'] || null,
              dependencia: row['Dependencia'] || row['dependencia'] || null,
              direccion_ie: row['Direccion de IE'] || row['direccion_ie'] || null,
              departamento_provincia_distrito: rawLugar,
              departamento: parts[0] || null,
              provincia: parts[1] || null,
              distrito: parts[2] || null,
            };
          });

          // Insert in chunks of 500
          for (let i = 0; i < formattedData.length; i += 500) {
            const chunk = formattedData.slice(i, i + 500);
            const { error } = await supabase.from('colegios').insert(chunk);
            if (error) {
              if (error.code === 'PGRST204' || error.message.includes('relation "public.colegios" does not exist')) {
                 throw new Error("La tabla 'colegios' no existe en Supabase. Ejecute el script SQL primero.");
              }
              throw error;
            }
          }
          notify?.(`Se importaron exitosamente ${formattedData.length} colegios.`, 'success');
        } catch (err: any) {
          notify?.(`Error al importar colegios: ${err.message}`, 'error');
        } finally {
          setLoadingColegios(false);
          e.target.value = ''; // Reset input
        }
      },
      error: (error) => {
        notify?.(`Error parseando CSV: ${error.message}`, 'error');
        setLoadingColegios(false);
      }
    });
  };

  const handleImportUbigeos = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoadingUbigeos(true);
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        try {
          const formattedData = results.data.map((row: any) => ({
            ubigeo: row['Ubigeo'] || row['ubigeo'] || null,
            distrito: row['Distrito'] || row['distrito'] || null,
            provincia: row['Provincia'] || row['provincia'] || null,
            departamento: row['Departamento'] || row['departamento'] || null,
          }));

          // Insert in chunks of 500
          for (let i = 0; i < formattedData.length; i += 500) {
            const chunk = formattedData.slice(i, i + 500);
            const { error } = await supabase.from('ubigeos').insert(chunk);
            if (error) {
              if (error.code === 'PGRST204' || error.message.includes('relation "public.ubigeos" does not exist')) {
                 throw new Error("La tabla 'ubigeos' no existe en Supabase. Ejecute el script SQL primero.");
              }
              throw error;
            }
          }
          notify?.(`Se importaron exitosamente ${formattedData.length} ubigeos.`, 'success');
        } catch (err: any) {
          notify?.(`Error al importar ubigeos: ${err.message}`, 'error');
        } finally {
          setLoadingUbigeos(false);
          e.target.value = ''; // Reset input
        }
      },
      error: (error) => {
        notify?.(`Error parseando CSV: ${error.message}`, 'error');
        setLoadingUbigeos(false);
      }
    });
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 lg:col-span-3 mt-4">
      <div className="flex items-center gap-3 mb-6">
        <div className="size-10 bg-indigo-50 rounded-xl flex items-center justify-center text-indigo-600">
          <span className="material-symbols-outlined">database</span>
        </div>
        <div>
          <h2 className="text-lg font-black text-slate-800">Importación de Datos Maestros</h2>
          <p className="text-xs text-slate-500 font-medium">Sube tus archivos CSV para actualizar Colegios y Ubigeos (RENIEC).</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Panel Colegios */}
        <div className="bg-slate-50 border border-slate-200 p-5 rounded-xl flex flex-col gap-4">
          <h3 className="font-bold text-slate-800 flex items-center gap-2">
            <span className="material-symbols-outlined text-slate-400">school</span>
            Colegios (MINEDU)
          </h3>
          <p className="text-xs text-slate-500">
            Formato CSV con encabezados: <b>Codigo modular</b>, <b>Codigo de institución</b>, <b>Nombre de IE</b>, <b>Nivel / Modalidad</b>, <b>Tipo de Gestion</b>, <b>Dependencia</b>, <b>Direccion de IE</b>, <b>Departamento / Provincia / Distrito</b>.
          </p>
          <div className="bg-black/80 rounded-lg p-3 relative group">
            <button onClick={() => { navigator.clipboard.writeText(sqlColegios); notify?.('Script copiado.', 'success'); }} className="absolute top-2 right-2 bg-white/10 hover:bg-white/20 text-white text-[10px] px-2 py-1 rounded transition-colors">Copiar SQL</button>
            <code className="text-[9px] font-mono text-indigo-300 whitespace-pre block overflow-x-auto h-24 scrollbar-thin scrollbar-thumb-indigo-900">{sqlColegios}</code>
          </div>
          <div className="mt-auto">
            <label className="flex items-center justify-center gap-2 w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl cursor-pointer transition-colors shadow-lg shadow-indigo-600/20 active:scale-[0.98]">
              {loadingColegios ? <span className="material-symbols-outlined animate-spin text-[18px]">progress_activity</span> : <span className="material-symbols-outlined text-[18px]">upload_file</span>}
              {loadingColegios ? 'PROCESANDO...' : 'CARGAR CSV COLEGIOS'}
              <input type="file" accept=".csv" className="hidden" disabled={loadingColegios} onChange={handleImportColegios} />
            </label>
          </div>
        </div>

        {/* Panel Ubigeos */}
        <div className="bg-slate-50 border border-slate-200 p-5 rounded-xl flex flex-col gap-4">
          <h3 className="font-bold text-slate-800 flex items-center gap-2">
            <span className="material-symbols-outlined text-slate-400">map</span>
            Ubigeos (RENIEC)
          </h3>
          <p className="text-xs text-slate-500">
            Formato CSV con encabezados: <b>Ubigeo</b>, <b>Distrito</b>, <b>Provincia</b>, <b>Departamento</b>.
          </p>
          <div className="bg-black/80 rounded-lg p-3 relative group">
            <button onClick={() => { navigator.clipboard.writeText(sqlUbigeos); notify?.('Script copiado.', 'success'); }} className="absolute top-2 right-2 bg-white/10 hover:bg-white/20 text-white text-[10px] px-2 py-1 rounded transition-colors">Copiar SQL</button>
            <code className="text-[9px] font-mono text-indigo-300 whitespace-pre block overflow-x-auto h-24 scrollbar-thin scrollbar-thumb-indigo-900">{sqlUbigeos}</code>
          </div>
          <div className="mt-auto">
            <label className="flex items-center justify-center gap-2 w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl cursor-pointer transition-colors shadow-lg shadow-indigo-600/20 active:scale-[0.98]">
              {loadingUbigeos ? <span className="material-symbols-outlined animate-spin text-[18px]">progress_activity</span> : <span className="material-symbols-outlined text-[18px]">upload_file</span>}
              {loadingUbigeos ? 'PROCESANDO...' : 'CARGAR CSV UBIGEOS'}
              <input type="file" accept=".csv" className="hidden" disabled={loadingUbigeos} onChange={handleImportUbigeos} />
            </label>
          </div>
        </div>
      </div>
    </div>
  );
};
