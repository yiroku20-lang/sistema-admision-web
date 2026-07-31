import { supabase } from './supabase';

export interface PreRevisionArchivo {
  id: string;
  modalidad_id: string;
  csv_data: any;
  created_at?: string;
}

export const getPreRevisiones = async (): Promise<PreRevisionArchivo[]> => {
  try {
    const { data, error } = await supabase
      .from('pre_revision_archivos')
      .select('id, modalidad_id, csv_data');
    if (error) {
      console.error('Error cargando pre-revisiones de Supabase:', error);
      return [];
    }
    return (data as PreRevisionArchivo[]) || [];
  } catch (err) {
    console.error('Error de red al consultar pre_revision_archivos:', err);
    return [];
  }
};
