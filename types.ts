
export interface User {
  id: string;
  name: string;
  email: string;
  role: 'Administrador' | 'Director' | 'Operador';
  avatar?: string;
  permissions?: string[];
}

// Added missing interface for ChatBot
export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: Date;
}

export interface InventoryItem {
  id: string;
  codigo_barras: string;
  nombre_bien: string;
  descripcion_estado: string;
  estado_actual: 'Disponible' | 'Prestado' | 'En Mantenimiento';
  created_at: string;
}

export interface LoanRecord {
  id: string;
  bien_id: string;
  prestatario_dni: string;
  prestatario_nombre: string;
  prestatario_correo: string;
  prestatario_celular: string;
  fecha_salida: string;
  fecha_limite: string;
  fecha_recepcion: string | null;
  estado_prestamo: 'Activo' | 'Devuelto' | 'Vencido';
  firma_url: string | null;
  usuario_entrega: string;
  usuario_recepcion: string | null;
  created_at: string;
  inventario_bienes?: InventoryItem; // For joined queries
}

export interface ToastMessage {
  id: string;
  message: string;
  type: 'success' | 'error' | 'warning' | 'info';
}

export interface NavItem {
  label: string;
  icon: string;
  path: string;
  roles?: string[];
}

export interface StatCardProps {
  title: string;
  value: string | number;
  change?: string;
  changeType?: 'positive' | 'negative' | 'neutral';
  icon: string;
  color: string; 
  subtext: string;
}

export interface ActivityLog {
  id: string;
  fileId: string;
  actionType: string;
  actionIcon: string;
  actionColor: string;
  user: string;
  userAvatar: string;
  status: string;
  statusColor: string;
  time: string;
}

// Added missing interface for Logs page
export interface LogEntry {
  id: string;
  user: string;
  email: string;
  avatar: string;
  action: string;
  actionColor: string;
  timestamp: string;
  ip: string;
}

export interface IncomingFile {
  id: string;
  number: string;
  subject: string;
  dateTime: string;
  type: 'General' | 'Especial';
  status: 'Pendiente' | 'En Progreso' | 'Atendido' | 'Archivado' | 'Derivado' | 'Devuelto';
  assigned_to?: string | null;
  assigned_at?: string | null;
  assigned_by?: string | null;
  assignment_notes?: string | null;
  assignment_type?: 'action' | 'info' | null;
  assignment_status?: 'pending' | 'completed' | null;
}

export interface OutgoingFile {
  id: string;
  docType: 'Oficio' | 'Informe' | 'Circular' | 'Carta' | 'Proveido';
  docNumber: string; 
  refNumber: string; 
  subject: string;
  destination?: string;
  status?: 'Pendiente' | 'Finalizado' | 'Observado' | 'Archivado';
  pdfUrl?: string; 
  dateTime: string;
}

export interface TrackingEvent {
  id: string;
  expediente_id: string;
  action_type: string;
  description: string;
  user_name: string;
  created_at: string;
}

export interface CVEscuela {
  id: string;
  nombre: string;
  codigo_carrera: string;
  area: string;
  filial: string;
  is_hidden?: boolean;
  orden?: number;
  alias?: string;
  created_at: string;
}

export interface CVCuadroAnual {
  id: string;
  anio: string;
  estado: 'Borrador' | 'Aprobado';
  resolucion_id?: string;
  recepcion_abierta?: boolean;
  created_at: string;
  resolution_number?: string | null;
  resolution_pdf?: string | null;
}

export interface CVModalidad {
  id: string;
  cuadro_id: string;
  semestre: string;
  nombre: string;
  peso_porcentaje: string;
  orden: number;
  created_at: string;
}

export interface PersonalCargo {
  id: string;
  nombre: string;
  created_at?: string;
}

export interface CVVacante {
  id: string;
  escuela_id: string;
  modalidad_id: string;
  cantidad: number;
}

// Added missing interface for Templates page
export interface Template {
  id: string;
  name: string;
  description: string;
  content: string;
  category: string;
  lastModified: string;
  thumbnail: string;
}

export interface Resolution {
  id: string;
  number: string;
  date: string;
  subject: string;
  subtitle?: string;
  tag?: string;
  tagColor?: string;
  pdfUrl?: string;
  parentId?: string; 
  children?: Resolution[]; 
}

// Added missing interface for Resignations page
export interface Resignation {
  id: string;
  student_name: string;
  student_code: string;
  school: string;
  semester: string;
  expediente_number: string;
  informe_number: string;
  informe_pdf?: string;
  status: 'Pendiente Resolución' | 'Finalizado';
  resolution_number?: string;
  resolution_date?: string;
  resolution_pdf?: string;
  created_at: string;
  modality?: string;
}

export interface PaymentRegistry {
  id: string;
  created_at: string;
  concurso: string;
  dni: string;
  student_name: string;
  phone: string;
  birth_date: string;
  age: number | string;
  parent_name: string;
  parent_phone: string;
  payment_date: string;
  amount: string;
  reason: string;
  type: 'Devolución' | 'Transferencia';
  target_exam?: string; 
  status: 'Pendiente Originales' | 'Observado' | 'Apto' | 'En Bloque' | 'Finalizado';
  incoming_file_number?: string; 
  outgoing_doc_number?: string;
  resolution_number?: string;
  resolution_date?: string;
  resolution_pdf?: string;
  transfer_notified?: boolean;
}

export interface Participant {
  id: string; 
  CODPOSTULANTE: string; 
  NOMBRE: string;   
  CARRERA: string;           
  codigo_carrera?: string;
  FILIAL: string;            
  MODALIDAD: string;         
  SEMESTRE: string;          
  ANIO: string; 
  NOTA: string;         
  OMERITO: string;      
  FECHAINGRESO: string;     
  created_at: string;
}

export interface AttendanceRecord {
  id: string;
  user_id: string;
  dni: string;
  tipo: 'INGRESO' | 'SALIDA';
  fecha: string; // YYYY-MM-DD
  hora: string;  // HH:MM:SS
  timestamp: string;
  created_at: string;
  usuarios?: {
    name: string;
    avatar?: string;
  };
}

export interface VacancyReservationBatch {
    id: string;
    created_at: string;
    report_code: string;
    expediente_number: string;
    status: 'Tramite' | 'Finalizado';
    resolution_number?: string;
    resolution_date?: string;
    resolution_pdf?: string;
}

export interface VacancyReservationDetail {
    id: string;
    batch_id: string;
    student_code: string;
    student_name: string;
    carrera: string;
    starting_semester: string;
    grade_level?: string;
    admission_modality?: string;
    is_withdrawn?: boolean;
    withdrawal_resolution_number?: string;
    withdrawal_resolution_date?: string;
    withdrawal_resolution_pdf?: string;
    batch?: VacancyReservationBatch;
}

export interface CalendarEvent {
  id: string;
  title: string;
  description?: string;
  start_date: string;
  end_date: string;
  type: 'Inscripción' | 'Examen' | 'Reunión' | 'Evento' | 'Feriado' | 'Otro';
  color: string;
  proceso?: string; // Ej: Ordinario 2026-I
  audiencia?: 'Público General' | 'Personal Interno';
  created_at: string;
  user_id?: string;
}

export interface PersonalDirectorio {
  id: string;
  cod_trab?: string;
  dni: string;
  nombre: string;
  condicion?: string;
  categoria_regimen?: string;
  facultad_dependencia?: string;
  departamento_cargo?: string;
  escuela_profesional?: string;
  correo?: string;
  telefono?: string;
  titulo_academico?: string;
  cargo_actual?: string;
  created_at: string;
}

export interface ActaSesion {
  id: string;
  numero: string | null;
  fecha: string;
  titulo: string;
  tipo_sesion: 'Ordinaria' | 'Extraordinaria' | string;
  estado: 'Borrador' | 'Refinada' | 'Cerrada';
  contenido_bruto: string | null;
  contenido_refinado: string | null;
  archivo_pdf?: string | null;
  firmantes: ActaFirmante[];
  created_by?: string;
  created_at: string;
}

export interface ActaFirmante {
  id: string; // ID del personal
  nombre_formateado: string;
  cargo: string;
  firmado?: boolean;
}

export interface PersonalProceso {
  id: string;
  modalidad_id: string;
  nombre: string;
  estado: 'Borrador' | 'Activo' | 'Finalizado';
  created_at: string;
  cv_modalidades?: CVModalidad; // joined relation
}

export interface PersonalNecesidad {
  id: string;
  proceso_id: string;
  cargo: string;
  cantidad_requerida: number;
  created_at: string;
}

export interface Prospecto {
  id: string;
  nombre: string;
  dni: string;
  correo: string;
  celular: string;
  colegio_procedencia?: string;
  carrera_interes?: string;
  area_interes?: string;
  grado_academico?: string;
  modalidades_interes?: string[];
  region?: string;
  estado_contacto: string;
  fecha_registro: string;
  suscrito: boolean;
  resultados_test: TestVocacionalResultado[];
}

export interface AdjudicationRanking {
  id: string;
  orden_merito: number;
  dni: string;
  nombre: string;
  area: string;
  nota: number;
  estado_asistencia: boolean;
  escuela_adjudicada: string | null;
  observacion: string | null;
  modalidad: string;
}

export interface AdjudicationVacancy {
  id: string;
  escuela: string;
  area: string;
  vacantes_totales: number;
  vacantes_disponibles: number;
  modalidad: string;
}

export interface TestVocacionalResultado {

  id: string;
  fecha: string;
  perfil: string;
  descripcion_perfil?: string;
  areas: { nombre: string; porcentaje: number; nivel: string }[];
  escuelas_recomendadas: { area: string; compatibilidad: number; carreras: string }[];
}

export interface PersonalSorteo {
  id: string;
  proceso_id: string;
  cargo: string;
  dni: string;
  nombres: string;
  condicion_sorteo: string; // Titular o Suplente
  email_personal?: string;
  telefono?: string;
  estado_confirmacion: 'Pendiente' | 'Confirmado' | 'Rechazado';
  directorio_id?: string;
  notificado?: boolean;
  motivo_rechazo?: string;
  fecha_limite_confirmacion?: string;
  created_at: string;
}

export interface PreRevisionArchivo {
  id?: string;
  modalidad_id: string;
  csv_data: any[];
  created_at?: string;
}

export interface BudgetRole {
  id: string;
  rubro: string;
  category: string;
  subcategory: string;
  role: string;
  condition: string;
  indicator: number;
  quantity: number;
  unit_cost: number;
  total: number;
}

export interface ExamBudgetRecord {
  id: string;
  cuadro_anual_id: string;
  modalidad_id: string;
  items: BudgetRole[];
  total_general: number;
  schedules?: RoleSchedule[];
  general_schedule?: any[];
  created_at: string;
  updated_at: string;
}

export interface ScheduleEvent {
  id: string;
  time: string;
  activity: string;
  location: string;
  date?: string;
  baseEventId?: string; // Enlace al evento del cronograma general
}

export interface RoleSchedule {
  id: string;
  roleName: string; // e.g., "Director General de Admisión"
  events: ScheduleEvent[];
  instructiveText?: string;
}
