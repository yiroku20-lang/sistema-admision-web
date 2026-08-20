import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { Participant } from '../types';

// PLANTILLA HTML PREDEFINIDA (Optimizada para espacio)
const DEFAULT_CONSTANCIA_HTML = `
<div style="width: 100%; height: 100%; border: 1px solid #ccc; display: flex; font-family: 'Poppins', sans-serif; background: white; position: relative; box-sizing: border-box; overflow: hidden;">
    
    <!-- Barra Lateral Izquierda -->
    <div style="width: 45px; background: #7b1523; display: flex; align-items: center; justify-content: center; flex-shrink: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact;">
        <div style="transform: rotate(-90deg); white-space: nowrap; font-weight: 900; font-size: 16px; letter-spacing: 4px; text-transform: uppercase; color: #ffffff; font-family: 'Poppins', sans-serif;">
            CONSTANCIA OFICIAL
        </div>
    </div>
    
    <!-- Contenido Principal -->
    <div style="flex: 1; padding: 30px 35px; position: relative; display: flex; flex-direction: column;">
        
        <!-- Marca de Agua -->
        <div id="watermark-container" style="position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; pointer-events: none; z-index: 0; opacity: 0.08;">
             <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/b/b8/Coat_of_arms_of_Cusco.svg/600px-Coat_of_arms_of_Cusco.svg.png" style="width: 70%; height: auto; filter: grayscale(100%);" />
        </div>

        <!-- Encabezado -->
        <div style="position: relative; z-index: 1; display: flex; align-items: center; justify-content: center; margin-bottom: 20px;">
            <div style="text-align: center;">
                <h2 style="font-family: 'Cinzel', serif; font-size: 22px; font-weight: 700; margin: 0; line-height: 1.1; color: #7b1523; letter-spacing: 0px; text-transform: uppercase;">
                    UNIVERSIDAD NACIONAL DE SAN ANTONIO<br>ABAD DEL CUSCO
                </h2>
                <div style="width: 50px; height: 3px; background: #e8a134; margin: 8px auto;"></div>
                <h3 style="font-family: 'Poppins', sans-serif; font-size: 14px; font-weight: 600; margin-top: 4px; color: #333; letter-spacing: 2px; text-transform: uppercase;">
                    DIRECCIÓN DE ADMISIÓN
                </h3>
            </div>
        </div>

        <!-- Cuerpo -->
        <div style="position: relative; z-index: 1; flex: 1; display: flex; flex-direction: column; font-size: 12px; line-height: 1.5; padding-top: 5px; color: #333; font-family: 'Poppins', sans-serif;">
             <p style="margin-bottom: 15px; font-size: 13px; font-weight: 500;">El Director de la Dirección de Admisión, que suscribe hace constar:</p>
             
             <div style="border-top: 2px solid #7b1523; border-bottom: 2px solid #7b1523; padding: 15px 0; margin-bottom: 20px; background: rgba(245, 247, 250, 0.3);">
                <p style="text-align: justify; margin-bottom: 15px;">
                    Que, Don(ña): <b style="font-size: 14px; color: #000; font-weight: 700;">{{nombres}}</b>, INGRESÓ a la UNIVERSIDAD NACIONAL DE SAN ANTONIO ABAD DEL CUSCO, a la Escuela Profesional de: <b style="color: #7b1523; font-weight: 700;">{{escuela}}</b> el <b>{{fecha_ingreso}}</b>, bajo la modalidad de <b>{{modalidad}}</b> cumpliendo con las exigencias del Reglamento de Admisión del año <b>{{anio}}</b>, con el siguiente detalle:
                </p>

                <div style="padding-left: 15px;">
                    <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
                        <tr>
                            <td style="padding: 4px 0; color: #555; width: 190px;">● Código de Postulante</td>
                            <td style="font-weight: 700; color: #000;">: {{codigo}}</td>
                        </tr>
                        <tr>
                            <td style="padding: 4px 0; color: #555;">● Puntaje en Conocimientos</td>
                            <td style="font-weight: 700; color: #000;">: {{nota}}</td>
                        </tr>
                        <tr>
                            <td style="padding: 4px 0; color: #555;">● Orden de Mérito</td>
                            <td style="font-weight: 700; color: #000;">: {{omerito}} <span style="font-weight: 400; color: #666; font-style: italic; margin-left: 10px;">en {{escuela}}</span></td>
                        </tr>
                    </table>
                </div>
             </div>

             <p style="text-align: justify; margin-top: 5px;">
                Así consta y aparece en las Actas del Semestre Académico <b>{{semestre}}</b>, que obran en los archivos de la Dirección de Admisión, a los cuales me remito en caso de ser necesario.
             </p>

             <p style="text-align: justify; margin-top: 10px;">
                Se expide la presente a petición virtual de la parte interesada y para los fines que viere conveniente.
             </p>

             <p style="text-align: right; margin-top: 25px; font-size: 13px; font-weight: 700; color: #7b1523;">
                Cusco, {{fecha_actual}}
             </p>
             <div style="flex: 1;"></div>
        </div>

        <!-- Pie de Página -->
        <div style="position: relative; z-index: 1; margin-top: 5px; font-family: 'Poppins', sans-serif;">
             <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 8px;">
                 <div style="text-align: center; width: 45%; position: relative;">
                     <div style="margin-bottom: 25px; color: #7b1523; font-size: 7px; font-weight: 700; line-height: 1.2;">
                         <p style="margin: 0;">Universidad Nacional de San Antonio Abad del Cusco</p>
                         <p style="margin: 0; font-size: 8px; font-weight: 900;">DIRECCIÓN DE ADMISIÓN</p>
                     </div>
                     <div style="height: 30px;"></div>
                     <div style="border-top: 1px dotted #7b1523; width: 90%; margin: 0 auto 4px auto;"></div>
                     <p style="font-size: 9px; font-weight: 800; margin: 0; color: #7b1523;">Dr. DOMINGO GONZALES GALLEGOS</p>
                     <p style="font-size: 8px; margin: 0; color: #555;">Director de la Dirección de Admisión</p>
                 </div>

                 <div style="text-align: center; width: 45%; position: relative;">
                     <div style="margin-bottom: 25px; color: #7b1523; font-size: 7px; font-weight: 700; line-height: 1.2;">
                         <p style="margin: 0;">Universidad Nacional de San Antonio Abad del Cusco</p>
                         <p style="margin: 0; font-size: 8px; font-weight: 900;">DIRECCIÓN DE ADMISIÓN</p>
                     </div>
                     <div style="height: 30px;"></div>
                     <div style="border-top: 1px solid #7b1523; width: 90%; margin: 0 auto 4px auto;"></div>
                     <p style="font-size: 9px; font-weight: 800; margin: 0; color: #7b1523;">Lic. LAURA AMUDIO GONZALES</p>
                     <p style="font-size: 8px; margin: 0; color: #555;">Jefa Administrativa de la Dirección de Admisión</p>
                 </div>
             </div>

             <div style="display: flex; justify-content: space-between; font-size: 8px; font-weight: 700; border-top: 2px solid #7b1523; padding-top: 6px; color: #555;">
                 <span>Recibo de Pago N°. {{BOUCHER}}</span>
                 <span>Expediente N° {{EXP}}</span>
                 <span>Usuario: JCH</span>
             </div>
        </div>
    </div>
</div>
`;

interface Props {
  user?: any;
}

export const TemplateEditor: React.FC<Props> = ({ user }) => {
  const navigate = useNavigate();
  const { id } = useParams();
  const location = useLocation();
  const isNew = !id || id === 'new';
  const editorRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const [documentTitle, setDocumentTitle] = useState('CONSTANCIA DE INGRESO');
  const [category, setCategory] = useState('Certificados');
  const [activeTab, setActiveTab] = useState<'variables' | 'images' | 'settings'>('variables');
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [notification, setNotification] = useState<string | null>(null);
  const [selectedImage, setSelectedImage] = useState<HTMLElement | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [resources, setResources] = useState<{name: string, url: string}[]>([]);
  
  // Signature Drawing State
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);
  const [showSignaturePad, setShowSignaturePad] = useState(false);
  
  // ESTADO PARA CONTENIDO OBTENIDO (Evita condiciones de carrera con el ref)
  const [fetchedContent, setFetchedContent] = useState<string | null>(null);

  // Datos del estudiante pasados por navegación
  const studentData = location.state?.student as Participant | undefined;
  const fileNumber = location.state?.fileNumber as string | undefined;

  // ARRASTRE: Referencias mutables para evitar re-renderizados
  const isDragging = useRef(false);
  const dragTarget = useRef<HTMLElement | null>(null);
  const dragOffset = useRef({ x: 0, y: 0 });

  const variables = [
    { code: '{{nombres}}', desc: 'Nombres del estudiante' },
    { code: '{{apellidos}}', desc: 'Apellidos del estudiante' },
    { code: '{{dni}}', desc: 'DNI' },
    { code: '{{codigo}}', desc: 'Código Postulante/Matrícula' },
    { code: '{{escuela}}', desc: 'Escuela Profesional' },
    { code: '{{modalidad}}', desc: 'Modalidad de Ingreso' },
    { code: '{{nota}}', desc: 'Puntaje de Conocimientos' },
    { code: '{{omerito}}', desc: 'Orden de Mérito' },
    { code: '{{fecha_ingreso}}', desc: 'Fecha de Ingreso' },
    { code: '{{anio}}', desc: 'Año del Proceso' },
    { code: '{{semestre}}', desc: 'Semestre (Ej: 2024-I)' },
    { code: '{{fecha_actual}}', desc: 'Fecha Actual (dd de mes de aaaa)' },
    { code: '{{FECHA}}', desc: 'Alias de Fecha Actual' },
    // Variables Específicas de Informes
    { code: '{{INFORME}}', desc: 'N° de Informe (Ej: 054-2024)' },
    { code: '{{EXP}}', desc: 'N° de Expediente' },
    { code: '{{MOTIVO}}', desc: 'Motivo de Rectificación' },
    { code: '{{NOMBRECORRE}}', desc: 'Nombre Correcto (Para Tabla)' },
    { code: '{{BOUCHER}}', desc: 'N° Recibo de Pago' },
  ];

  const getPaperDimensions = () => {
      return { width: '210mm', height: '297mm' }; 
  };

  const handlePrint = () => {
    if (!editorRef.current) return;
    
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
        alert("Permita las ventanas emergentes para imprimir.");
        return;
    }

    const content = editorRef.current.innerHTML;
    const { width, height } = getPaperDimensions();
    // Replicate the editor padding to ensure WYSIWYG
    const padding = '25mm';

    printWindow.document.write(`
      <html>
        <head>
          <title>${documentTitle}</title>
          <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@400;700&family=Poppins:wght@300;400;500;600;700&display=swap" rel="stylesheet">
          <style>
            @page {
              size: A4;
              margin: 0;
            }
            body {
              margin: 0;
              padding: 0;
              background-color: white;
              display: flex;
              justify-content: center;
              font-family: 'Poppins', sans-serif;
            }
            .page-container {
              width: ${width};
              height: ${height};
              padding: ${padding};
              box-sizing: border-box;
              overflow: hidden;
              position: relative;
            }
            /* Reset typical browser print adjustments */
            * {
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            img {
               max-width: 100%;
            }
          </style>
        </head>
        <body>
          <div class="page-container">
            ${content}
          </div>
          <script>
            window.onload = function() {
              setTimeout(() => {
                window.print();
              }, 500);
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const restoreEditorAttributes = () => {
      if (!editorRef.current) return;
      
      const images = editorRef.current.getElementsByTagName('img');
      for (let i = 0; i < images.length; i++) {
          const img = images[i];
          if (img.style.position === 'absolute' && img.id !== 'watermark-img') {
              img.contentEditable = "false";
              img.draggable = false;
              img.style.cursor = 'grab';
              img.title = 'Arrastra para mover. Clic para seleccionar. Rueda del ratón para cambiar tamaño. Suprimir para borrar.';
          }
      }
  };

  const loadDefaultTemplate = () => {
      if (editorRef.current) {
          editorRef.current.innerHTML = DEFAULT_CONSTANCIA_HTML;
          restoreEditorAttributes();
      }
  };

  // Resize canvas when signature pad opens
  useEffect(() => {
    if (showSignaturePad && canvasRef.current) {
        // Wait a tick for the DOM to render the full screen layout
        setTimeout(() => {
            if (!canvasRef.current) return;
            const canvas = canvasRef.current;
            const container = canvas.parentElement;
            if (container) {
                const rect = container.getBoundingClientRect();
                const dpr = window.devicePixelRatio || 1;
                canvas.width = rect.width * dpr;
                canvas.height = rect.height * dpr;
                canvas.style.width = `${rect.width}px`;
                canvas.style.height = `${rect.height}px`;
                const ctx = canvas.getContext('2d');
                if (ctx) {
                    ctx.clearRect(0, 0, canvas.width, canvas.height); // don't fill white
                }
            }
        }, 50);
    }
  }, [showSignaturePad]);

  // 1. CARGA DE DATOS (Solo actualiza el estado, no el DOM directamente)
  useEffect(() => {
    const fetchTemplate = async () => {
        if (!isNew && id) {
            setIsLoading(true);
            const { data, error } = await supabase
                .from('templates')
                .select('*')
                .eq('id', id)
                .single();
            
            if (data) {
                setDocumentTitle(data.name);
                setCategory(data.category || 'Admisión');
                // Guardamos en estado, NO en el ref todavía
                setFetchedContent(data.content || '');
            } else {
                console.error("Error loading template", error);
            }
            setIsLoading(false);
        } else {
            // Nueva plantilla
            setFetchedContent(DEFAULT_CONSTANCIA_HTML);
        }
    };

    fetchTemplate();
    fetchResources();
  }, [id, isNew]);

  // 2. SINCRONIZACIÓN CON EL EDITOR (Se ejecuta cuando ya no está cargando y el ref existe)
  useEffect(() => {
      if (!isLoading && editorRef.current && fetchedContent) {
          let contentToSet = fetchedContent;
          
          if (studentData) {
              // Replace placeholders
              const formatLongDate = (date: Date) => {
                  const months = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
                  return `${date.getDate()} de ${months[date.getMonth()]} de ${date.getFullYear()}`;
              };

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
                  if (isNaN(d.getTime())) return dateVal;
                  return formatLongDate(d);
              };

              contentToSet = contentToSet
                  .replace(/{{nombres}}/g, studentData.NOMBRE || '')
                  .replace(/{{apellidos}}/g, '') // NOMBRE usually contains full name
                  .replace(/{{dni}}/g, studentData.CODPOSTULANTE || '')
                  .replace(/{{codigo}}/g, studentData.CODPOSTULANTE || '')
                  .replace(/{{escuela}}/g, studentData.CARRERA || '')
                  .replace(/{{modalidad}}/g, studentData.MODALIDAD || '')
                  .replace(/{{nota}}/g, studentData.NOTA || '')
                  .replace(/{{omerito}}/g, studentData.OMERITO || '')
                  .replace(/{{fecha_ingreso}}/g, formatAcademicDate(studentData.FECHAINGRESO))
                  .replace(/{{anio}}/g, studentData.ANIO || '')
                  .replace(/{{semestre}}/g, studentData.SEMESTRE || '');
          }
          
          if (fileNumber) {
               contentToSet = contentToSet.replace(/{{EXP}}/g, fileNumber);
          }

          // Also handle {{fecha_actual}}, {{fecha}}, {{FECHA}}
          const d = new Date();
          const months = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
          const today = `${d.getDate()} de ${months[d.getMonth()]} de ${d.getFullYear()}`;
          contentToSet = contentToSet.replace(/{{fecha_actual}}/g, today);
          contentToSet = contentToSet.replace(/{{FECHA_ACTUAL}}/g, today);
          contentToSet = contentToSet.replace(/{{fecha}}/g, today);
          contentToSet = contentToSet.replace(/{{FECHA}}/g, today);

          editorRef.current.innerHTML = contentToSet;
          restoreEditorAttributes();
      }
  }, [isLoading, fetchedContent, studentData, fileNumber]);

  // MANEJADORES DE ARRASTRE Y EVENTOS (GLOBALES)
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
        if (!isDragging.current || !dragTarget.current || !editorRef.current) return;
        e.preventDefault();

        const editorRect = editorRef.current.getBoundingClientRect();
        const x = e.clientX - editorRect.left - dragOffset.current.x;
        const y = e.clientY - editorRect.top - dragOffset.current.y;

        const xPercent = (x / editorRect.width) * 100;
        const yPercent = (y / editorRect.height) * 100;

        dragTarget.current.style.left = `${xPercent}%`;
        dragTarget.current.style.top = `${yPercent}%`;
    };

    const handleMouseUp = () => {
        if (isDragging.current) {
            isDragging.current = false;
            dragTarget.current = null;
            document.body.style.cursor = 'default';
        }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
        if (selectedImage && (e.key === 'Delete' || e.key === 'Backspace')) {
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
                return;
            }
            e.preventDefault();
            selectedImage.remove();
            setSelectedImage(null);
            showToast('Imagen eliminada');
        }
    };

    const handleWheel = (e: WheelEvent) => {
        if (selectedImage && e.target === selectedImage && editorRef.current) {
            e.preventDefault();
            const editorRect = editorRef.current.getBoundingClientRect();
            
            let currentWidthPercent;
            if (selectedImage.style.width.endsWith('%')) {
                currentWidthPercent = parseFloat(selectedImage.style.width);
            } else {
                const currentWidthPx = parseFloat(selectedImage.style.width) || selectedImage.offsetWidth;
                currentWidthPercent = (currentWidthPx / editorRect.width) * 100;
            }

            const scaleFactor = e.deltaY > 0 ? 0.95 : 1.05; // scroll down = shrink, scroll up = grow
            selectedImage.style.width = `${currentWidthPercent * scaleFactor}%`;
            selectedImage.style.height = 'auto'; // maintain aspect ratio
        }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('keydown', handleKeyDown);
    editorRef.current?.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
        document.removeEventListener('keydown', handleKeyDown);
        editorRef.current?.removeEventListener('wheel', handleWheel);
    };
  }, [selectedImage]);

  const handleContainerMouseDown = (e: React.MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'IMG' && target.style.position === 'absolute' && target.id !== 'watermark-img') {
          e.preventDefault();
          e.stopPropagation();

          if (selectedImage && selectedImage !== target) {
              selectedImage.style.outline = 'none';
          }
          target.style.outline = '2px dashed #3b82f6';
          target.style.outlineOffset = '2px';
          setSelectedImage(target);

          isDragging.current = true;
          dragTarget.current = target;
          document.body.style.cursor = 'grabbing';

          const rect = target.getBoundingClientRect();
          dragOffset.current = {
              x: e.clientX - rect.left,
              y: e.clientY - rect.top
          };
      } else {
          if (selectedImage) {
              selectedImage.style.outline = 'none';
              setSelectedImage(null);
          }
      }
  };

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    let clientX, clientY;
    if ('touches' in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = (e as React.MouseEvent).clientX;
      clientY = (e as React.MouseEvent).clientY;
    }
    
    const x = (clientX - rect.left) * scaleX;
    const y = (clientY - rect.top) * scaleY;

    ctx.lineWidth = 3 * scaleX;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#000000';
    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawing(true);
  };

  const drawSignature = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    let clientX, clientY;
    if ('touches' in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = (e as React.MouseEvent).clientX;
      clientY = (e as React.MouseEvent).clientY;
    }
    
    const x = (clientX - rect.left) * scaleX;
    const y = (clientY - rect.top) * scaleY;

    ctx.lineTo(x, y);
    ctx.stroke();
    setHasSignature(true);
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const clearSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
  };

  const saveSignature = async () => {
    if (!hasSignature || !canvasRef.current) return;
    setIsUploading(true);
    try {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Could not get canvas context');

      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imgData.data;

      let minX = canvas.width, minY = canvas.height, maxX = 0, maxY = 0;
      
      for (let y = 0; y < canvas.height; y++) {
        for (let x = 0; x < canvas.width; x++) {
          const idx = (y * canvas.width + x) * 4;
          const a = data[idx + 3];
          if (a > 0) { // Not transparent
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }

      const padding = 20;
      minX = Math.max(0, minX - padding);
      minY = Math.max(0, minY - padding);
      maxX = Math.min(canvas.width, maxX + padding);
      maxY = Math.min(canvas.height, maxY + padding);

      const width = maxX - minX;
      const height = maxY - minY;

      const cropCanvas = document.createElement('canvas');
      cropCanvas.width = width;
      cropCanvas.height = height;
      const cropCtx = cropCanvas.getContext('2d');
      if (!cropCtx) throw new Error('Could not create crop context');
      
      cropCtx.putImageData(ctx.getImageData(minX, minY, width, height), 0, 0);

      const blob = await new Promise<Blob | null>(resolve => cropCanvas.toBlob(resolve, 'image/png'));
      if (blob) {
        const fileName = `firma_${Date.now()}.png`;
        const { error: uploadError } = await supabase.storage
          .from('plantillas_recursos')
          .upload(fileName, blob);
          
        if (uploadError) throw uploadError;
        showToast('Firma guardada en recursos, con fondo transparente');
        setShowSignaturePad(false);
        clearSignature();
        fetchResources();
      }
    } catch (error: any) {
      console.error(error);
      showToast('Error al guardar firma');
    } finally {
      setIsUploading(false);
    }
  };

  const handleContainerDoubleClick = (e: React.MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'IMG' && target.style.position === 'absolute' && target.id !== 'watermark-img') {
          e.preventDefault();
          e.stopPropagation();
          if(confirm("¿Eliminar esta imagen?")) {
              target.remove();
          }
      }
  };

  const fetchResources = async () => {
      try {
          const { data, error } = await supabase.storage.from('plantillas_recursos').list();
          if (data) {
              const sortedData = data.sort((a, b) => 
                new Date(b.created_at || '').getTime() - new Date(a.created_at || '').getTime()
              );
              const mappedResources = sortedData.map(file => {
                  const { data: urlData } = supabase.storage
                      .from('plantillas_recursos')
                      .getPublicUrl(file.name);
                  return { name: file.name, url: urlData.publicUrl };
              });
              setResources(mappedResources);
          }
      } catch (err) {
          console.error("Error fetching resources:", err);
      }
  };

  const handleDeleteResource = async (fileName: string) => {
      if (!window.confirm('¿Está seguro de eliminar este recurso?')) return;
      try {
          const { error } = await supabase.storage.from('plantillas_recursos').remove([fileName]);
          if (error) throw error;
          showToast('Recurso eliminado');
          await fetchResources();
      } catch (error) {
          console.error('Error al eliminar recurso:', error);
          showToast('Error al eliminar recurso');
      }
  };

  const showToast = (message: string) => {
    setNotification(message);
    setTimeout(() => setNotification(null), 3000);
  };

  const handleFormat = (command: string, value: string | undefined = undefined) => {
    document.execCommand(command, false, value);
    editorRef.current?.focus();
  };

  const handleInsertVariable = (code: string) => {
    if (editorRef.current) {
        editorRef.current.focus();
        const success = document.execCommand('insertText', false, code);
        if(!success) {
             editorRef.current.innerText += ` ${code}`;
        }
    }
  };

  const handleInsertImageHTML = (url: string) => {
      if (editorRef.current) {
        const editorRect = editorRef.current.getBoundingClientRect();
        const scrollTop = editorRef.current.parentElement?.scrollTop || 0;
        
        // Calculate initial position in percentages
        const initialTopPx = scrollTop + 150;
        const topPercent = (initialTopPx / editorRect.height) * 100;
        const leftPercent = (100 / editorRect.width) * 100;
        const widthPercent = (150 / editorRect.width) * 100;
        
        const img = document.createElement('img');
        img.src = url;
        img.style.position = 'absolute';
        img.style.top = `${topPercent}%`; 
        img.style.left = `${leftPercent}%`;
        img.style.width = `${widthPercent}%`; 
        img.style.zIndex = '9999'; 
        img.style.mixBlendMode = 'multiply';
        
        img.style.cursor = 'grab';
        img.contentEditable = "false";
        img.draggable = false;
        img.title = 'Arrastra para mover. Clic para seleccionar. Rueda del ratón para cambiar tamaño. Suprimir para borrar.';
        
        // Ensure the image is appended directly to the editor root so it doesn't get wrapped in paragraphs
        editorRef.current.appendChild(img);
        showToast('Imagen insertada. Arrástrala para ubicarla.');
      }
  };

  const handleSetBackground = (url: string) => {
      if (editorRef.current) {
          const watermarkContainer = editorRef.current.querySelector('#watermark-container');
          if (watermarkContainer) {
              watermarkContainer.innerHTML = `<img id="watermark-img" src="${url}" style="width: 70%; height: auto; filter: grayscale(100%);" />`;
              showToast('Fondo actualizado');
          } else {
              const container = document.createElement('div');
              container.id = 'watermark-container';
              container.style.cssText = "position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; pointer-events: none; z-index: 0; opacity: 0.08;";
              container.innerHTML = `<img id="watermark-img" src="${url}" style="width: 70%; height: auto; filter: grayscale(100%);" />`;
              
              if(editorRef.current.firstChild) {
                  editorRef.current.insertBefore(container, editorRef.current.firstChild);
              } else {
                  editorRef.current.appendChild(container);
              }
              showToast('Fondo añadido');
          }
      }
  };

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      setIsUploading(true);
      try {
          const fileExt = file.name.split('.').pop();
          const fileName = `${Date.now()}.${fileExt}`;
          const { error: uploadError } = await supabase.storage
              .from('plantillas_recursos')
              .upload(fileName, file);

          if (uploadError) throw uploadError;

          const { data: urlData } = supabase.storage
              .from('plantillas_recursos')
              .getPublicUrl(fileName);

          handleInsertImageHTML(urlData.publicUrl);
          await fetchResources();
          
      } catch (error) {
          console.error("Error uploading image:", error);
          showToast('Error al subir imagen');
      } finally {
          setIsUploading(false);
          if (imageInputRef.current) imageInputRef.current.value = '';
      }
  };

  const handleSave = async () => {
    if (!editorRef.current) return;
    setIsSaving(true);
    
    try {
        // 1. CLONAR Y LIMPIAR HTML ANTES DE GUARDAR
        const clone = editorRef.current.cloneNode(true) as HTMLElement;
        const images = clone.getElementsByTagName('img');
        
        for (let i = 0; i < images.length; i++) {
            const img = images[i];
            if (img.style.position === 'absolute') {
                img.style.cursor = ''; 
                img.style.outline = '';
                img.style.outlineOffset = '';
                img.removeAttribute('contenteditable');
                img.removeAttribute('draggable');
                img.removeAttribute('title');
            }
        }
        
        const cleanContent = clone.innerHTML;
        
        if (!cleanContent.trim()) {
            showToast('Error: El contenido parece estar vacío.');
            setIsSaving(false);
            return;
        }

        const payload = {
            name: documentTitle,
            category: category,
            content: cleanContent,
            description: '',
            last_modified: new Date().toLocaleDateString(),
            thumbnail: 'https://placehold.co/400x500/f1f5f9/94a3b8?text=' + encodeURIComponent(documentTitle.substring(0, 15))
        };

        if (isNew) {
            const { error } = await supabase.from('templates').insert([payload]);
            if (error) throw error;
            showToast('Plantilla creada exitosamente');
            try { await supabase.from('tramite_seguimiento').insert([{ action_type: 'Registro', description: `Creó una nueva plantilla: "${documentTitle}"`, user_name: user?.name || 'Operador / Sistema' }]); } catch(e) {}
            setTimeout(() => navigate('/templates'), 1000);
        } else {
            const { error } = await supabase.from('templates').update(payload).eq('id', id);
            if (error) throw error;
            showToast('Cambios guardados');
            try { await supabase.from('tramite_seguimiento').insert([{ action_type: 'Estado', description: `Modificó la plantilla: "${documentTitle}"`, user_name: user?.name || 'Operador / Sistema' }]); } catch(e) {}
        }
    } catch (error: any) {
        console.error("Error saving:", error);
        
        let msg = `Error al guardar: ${error.message || 'Error desconocido'}`;
        
        if (error.code === '42703') { 
             msg = "Error de Base de Datos: La tabla 'templates' no tiene las columnas correctas (falta 'description' o 'thumbnail'). Ve a Configuración y ejecuta el script de 'Plantillas Recurrentes + Fix Estructura'.";
        } else if (error.code === '42P01') { 
             msg = "Error de Base de Datos: La tabla 'templates' no existe. Ve a Configuración y ejecuta el script.";
        } else if (error.code === '42501') { 
             msg = "Permiso denegado (RLS): La base de datos no permite guardar. Ve a Configuración y ejecuta el script para reparar los permisos.";
        }
        
        alert(msg);
        showToast('Error al guardar en base de datos');
    } finally {
        setIsSaving(false);
    }
  };

  const handleFinalize = async () => {
      if (!fileNumber) return;
      if (!confirm("¿Está seguro de finalizar este trámite? El expediente se marcará como ATENDIDO.")) return;
      
      setIsSaving(true);
      try {
          // 1. Update status
          const { error } = await supabase.from('expedientes')
            .update({ status: 'Atendido' })
            .eq('number', fileNumber);
            
          if (error) throw error;
          
          showToast('Trámite finalizado correctamente');
          setTimeout(() => navigate('/incoming'), 1500);
      } catch (err: any) {
          console.error(err);
          showToast('Error al finalizar trámite');
      } finally {
          setIsSaving(false);
      }
  };

  if (isLoading) {
      return (
          <div className="flex items-center justify-center h-full w-full bg-slate-100">
               <div className="flex flex-col items-center gap-2">
                  <span className="material-symbols-outlined text-4xl animate-spin text-primary">progress_activity</span>
                  <p className="text-slate-500 text-sm">Cargando editor...</p>
              </div>
          </div>
      )
  }

  return (
    <div className="flex flex-col h-full bg-slate-100 overflow-hidden relative">
      
      {notification && (
        <div className="absolute top-20 right-8 z-50 bg-slate-800 text-white px-4 py-3 rounded-lg shadow-xl flex items-center gap-2 animate-in fade-in slide-in-from-top-5">
            <span className="material-symbols-outlined text-green-400">check_circle</span>
            {notification}
        </div>
      )}

      {showPreview && (
          <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-slate-200 rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
                  <div className="flex items-center justify-between p-4 border-b border-slate-300 bg-white rounded-t-xl">
                      <h3 className="font-bold text-slate-800">Vista Previa de Impresión</h3>
                      <button onClick={() => setShowPreview(false)} className="text-slate-500 hover:text-slate-800">
                          <span className="material-symbols-outlined">close</span>
                      </button>
                  </div>
                  <div className="flex-1 overflow-auto p-8 flex justify-center bg-slate-200">
                       <div 
                            className="bg-white shadow-lg p-[25mm] relative pointer-events-none origin-top"
                            style={{ 
                                ...getPaperDimensions(),
                                transform: 'scale(0.8)'
                            }} 
                            dangerouslySetInnerHTML={{ __html: editorRef.current?.innerHTML || '' }}
                        />
                  </div>
                  <div className="p-4 bg-white border-t border-slate-300 rounded-b-xl flex justify-end gap-2">
                      <button onClick={() => setShowPreview(false)} className="px-4 py-2 text-slate-600 font-medium">Cerrar</button>
                      <button 
                        onClick={handlePrint}
                        className="px-4 py-2 bg-primary text-white rounded-lg font-medium flex items-center gap-2 hover:bg-red-800 transition-colors"
                      >
                          <span className="material-symbols-outlined text-[18px]">print</span>
                          Imprimir
                      </button>
                  </div>
              </div>
          </div>
      )}

      <header className="bg-white border-b border-slate-200 h-16 px-4 flex items-center justify-between shrink-0 z-10">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => navigate('/templates')}
            className="size-8 flex items-center justify-center rounded-full hover:bg-slate-100 text-slate-500"
          >
            <span className="material-symbols-outlined">arrow_back</span>
          </button>
          <div className="flex flex-col">
            <input 
              value={documentTitle}
              onChange={(e) => setDocumentTitle(e.target.value)}
              className="font-bold text-slate-900 text-sm focus:outline-none focus:border-b focus:border-primary bg-transparent"
              placeholder="Nombre de la plantilla"
            />
            <span className="text-xs text-slate-400">
                {fileNumber ? `Atendiendo Exp: ${fileNumber}` : (isNew ? 'Borrador no guardado' : 'Modo edición')}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
             <button 
                onClick={loadDefaultTemplate}
                className="flex items-center gap-2 px-3 py-2 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg text-xs font-bold transition-colors mr-2 border border-transparent hover:border-red-100"
                title="Reiniciar plantilla al diseño original"
             >
                 <span className="material-symbols-outlined text-[18px]">restart_alt</span>
                 Restaurar Formato
             </button>

             <button 
                onClick={() => setShowPreview(true)}
                className="flex items-center gap-2 px-4 py-2 text-slate-600 hover:bg-slate-50 rounded-lg text-sm font-medium transition-colors"
             >
                 <span className="material-symbols-outlined text-[20px]">visibility</span>
                 Previsualizar
             </button>
             
             {fileNumber && (
                 <button 
                    onClick={handleFinalize}
                    disabled={isSaving}
                    className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-bold shadow-md shadow-green-900/20 transition-colors disabled:opacity-70"
                 >
                     <span className="material-symbols-outlined text-[20px]">check_circle</span>
                     Finalizar Trámite
                 </button>
             )}

             <button 
                onClick={handleSave}
                disabled={isSaving}
                className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-red-800 text-white rounded-lg text-sm font-bold shadow-md shadow-red-900/20 transition-colors disabled:opacity-70 disabled:cursor-not-allowed"
             >
                 {isSaving ? (
                     <span className="material-symbols-outlined text-[20px] animate-spin">progress_activity</span>
                 ) : (
                    <span className="material-symbols-outlined text-[20px]">save</span>
                 )}
                 {isSaving ? 'Guardando...' : 'Guardar Plantilla'}
             </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        
        <aside className="w-80 bg-white border-r border-slate-200 flex flex-col shrink-0 z-10">
            <div className="flex border-b border-slate-200">
                <button 
                    onClick={() => setActiveTab('variables')}
                    className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider ${activeTab === 'variables' ? 'text-primary border-b-2 border-primary' : 'text-slate-500 hover:bg-slate-50'}`}
                >
                    Variables
                </button>
                <button 
                    onClick={() => setActiveTab('images')}
                    className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider ${activeTab === 'images' ? 'text-primary border-b-2 border-primary' : 'text-slate-500 hover:bg-slate-50'}`}
                >
                    Recursos
                </button>
                <button 
                    onClick={() => setActiveTab('settings')}
                    className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider ${activeTab === 'settings' ? 'text-primary border-b-2 border-primary' : 'text-slate-500 hover:bg-slate-50'}`}
                >
                    Ajustes
                </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
                {activeTab === 'variables' && (
                    <div className="flex flex-col gap-3">
                        <p className="text-xs text-slate-500 mb-2">Haga clic para insertar en el documento.</p>
                        {variables.map((v) => (
                            <div 
                                key={v.code} 
                                onClick={() => handleInsertVariable(v.code)}
                                className="group p-3 rounded-lg border border-slate-200 bg-slate-50 hover:border-primary hover:shadow-sm cursor-pointer transition-all select-none active:scale-95"
                            >
                                <div className="flex justify-between items-center mb-1">
                                    <span className="font-mono text-xs font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded border border-primary/20">{v.code}</span>
                                    <span className="material-symbols-outlined text-slate-300 text-[16px] group-hover:text-primary">add_circle</span>
                                </div>
                                <p className="text-xs text-slate-600">{v.desc}</p>
                            </div>
                        ))}
                    </div>
                )}

                {activeTab === 'images' && (
                    <div className="flex flex-col gap-4">
                        <input 
                            type="file" 
                            accept="image/*" 
                            ref={imageInputRef} 
                            className="hidden" 
                            onChange={handleImageUpload}
                        />
                        
                        <div className="flex gap-2">
                            <button 
                                className={`flex-1 border-2 border-dashed border-slate-300 rounded-lg p-4 flex flex-col items-center justify-center text-center cursor-pointer hover:bg-slate-50 hover:border-primary transition-colors active:scale-95 ${isUploading ? 'opacity-50 pointer-events-none' : ''}`}
                                onClick={() => imageInputRef.current?.click()}
                            >
                                {isUploading ? (
                                    <span className="material-symbols-outlined text-primary text-2xl mb-1 animate-spin">progress_activity</span>
                                ) : (
                                    <span className="material-symbols-outlined text-slate-400 text-2xl mb-1">cloud_upload</span>
                                )}
                                <p className="text-[10px] font-bold text-slate-700 uppercase">Subir Archivo</p>
                            </button>

                            <button 
                                className="flex-1 border-2 border-dashed border-slate-300 rounded-lg p-4 flex flex-col items-center justify-center text-center cursor-pointer hover:bg-slate-50 hover:border-primary transition-colors active:scale-95"
                                onClick={() => setShowSignaturePad(true)}
                            >
                                <span className="material-symbols-outlined text-slate-400 text-2xl mb-1">draw</span>
                                <p className="text-[10px] font-bold text-slate-700 uppercase">Dibujar Firma</p>
                            </button>
                        </div>
                        
                        <div>
                            <div className="flex justify-between items-center mb-3">
                                <h4 className="text-xs font-bold text-slate-500 uppercase">Mis Recursos</h4>
                                <button 
                                    onClick={() => fetchResources()} 
                                    className="text-[10px] text-primary hover:underline flex items-center gap-1"
                                >
                                    <span className="material-symbols-outlined text-[12px]">refresh</span>
                                    Actualizar
                                </button>
                            </div>

                            {resources.length === 0 ? (
                                <div className="text-center p-4 bg-slate-50 rounded-lg border border-slate-200 border-dashed">
                                    <span className="material-symbols-outlined text-slate-300 mb-1">image_not_supported</span>
                                    <p className="text-xs text-slate-400">No hay imágenes subidas aún.</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-2 gap-2">
                                    {resources.map((res, index) => (
                                        <div 
                                            key={index}
                                            className="aspect-square bg-slate-100 rounded border border-slate-200 flex items-center justify-center relative group overflow-hidden"
                                        >
                                            <img src={res.url} alt={res.name} className="w-full h-full object-contain p-1" />
                                            <div className="absolute inset-0 bg-slate-900/80 flex flex-col items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity p-2">
                                                <button 
                                                    onClick={() => handleInsertImageHTML(res.url)}
                                                    className="w-full bg-white text-slate-900 text-[10px] font-bold py-1 rounded hover:bg-primary hover:text-white transition-colors"
                                                >
                                                    Insertar
                                                </button>
                                                <button 
                                                    onClick={() => handleSetBackground(res.url)}
                                                    className="w-full bg-slate-700 text-white text-[10px] font-bold py-1 rounded hover:bg-primary transition-colors border border-slate-600"
                                                >
                                                    Fondo
                                                </button>
                                                <button 
                                                    onClick={() => handleDeleteResource(res.name)}
                                                    className="w-full bg-red-600 text-white text-[10px] font-bold py-1 rounded hover:bg-red-700 transition-colors border border-red-800 flex items-center justify-center gap-1"
                                                >
                                                    <span className="material-symbols-outlined text-[12px]">delete</span> Borrar
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                )}
                 {activeTab === 'settings' && (
                    <div className="flex flex-col gap-4">
                       <label className="flex flex-col gap-1">
                           <span className="text-xs font-bold text-slate-700">Categoría</span>
                           <select 
                                value={category}
                                onChange={(e) => setCategory(e.target.value)}
                                className="w-full rounded border border-slate-300 bg-white p-2 text-sm"
                            >
                               <option value="Admisión">Admisión</option>
                               <option value="Certificados">Certificados</option>
                               <option value="Resoluciones">Resoluciones</option>
                               <option value="Varios">Varios</option>
                           </select>
                       </label>
                    </div>
                )}
            </div>
        </aside>

        <div className="flex-1 bg-slate-100 overflow-auto flex justify-center p-8 relative">
            
            <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-white rounded-lg shadow-lg border border-slate-200 p-1 flex items-center gap-1 z-20">
                <button 
                    onMouseDown={(e) => { e.preventDefault(); handleFormat('bold'); }}
                    className="size-8 rounded hover:bg-slate-100 flex items-center justify-center text-slate-600" 
                    title="Negrita"
                >
                    <span className="material-symbols-outlined text-[20px]">format_bold</span>
                </button>
                <button 
                    onMouseDown={(e) => { e.preventDefault(); handleFormat('italic'); }}
                    className="size-8 rounded hover:bg-slate-100 flex items-center justify-center text-slate-600" 
                    title="Cursiva"
                >
                    <span className="material-symbols-outlined text-[20px]">format_italic</span>
                </button>
                <button 
                    onMouseDown={(e) => { e.preventDefault(); handleFormat('underline'); }}
                    className="size-8 rounded hover:bg-slate-100 flex items-center justify-center text-slate-600" 
                    title="Subrayado"
                >
                    <span className="material-symbols-outlined text-[20px]">format_underlined</span>
                </button>
                <div className="w-px h-5 bg-slate-200 mx-1"></div>
                <button 
                    onMouseDown={(e) => { e.preventDefault(); handleFormat('justifyLeft'); }}
                    className="size-8 rounded hover:bg-slate-100 flex items-center justify-center text-slate-600" 
                    title="Izquierda"
                >
                    <span className="material-symbols-outlined text-[20px]">format_align_left</span>
                </button>
                <button 
                    onMouseDown={(e) => { e.preventDefault(); handleFormat('justifyCenter'); }}
                    className="size-8 rounded hover:bg-slate-100 flex items-center justify-center text-slate-600" 
                    title="Centro"
                >
                    <span className="material-symbols-outlined text-[20px]">format_align_center</span>
                </button>
                <button 
                    onMouseDown={(e) => { e.preventDefault(); handleFormat('justifyRight'); }}
                    className="size-8 rounded hover:bg-slate-100 flex items-center justify-center text-slate-600" 
                    title="Derecha"
                >
                    <span className="material-symbols-outlined text-[20px]">format_align_right</span>
                </button>
                <button 
                    onMouseDown={(e) => { e.preventDefault(); handleFormat('justifyFull'); }}
                    className="size-8 rounded hover:bg-slate-100 flex items-center justify-center text-slate-600" 
                    title="Justificado"
                >
                    <span className="material-symbols-outlined text-[20px]">format_align_justify</span>
                </button>
            </div>

            <div 
                ref={editorRef}
                className="bg-white shadow-2xl p-[25mm] relative focus:outline-none transition-all duration-300 mx-auto"
                style={getPaperDimensions()} 
                contentEditable 
                suppressContentEditableWarning={true}
                onMouseDown={handleContainerMouseDown} 
                onDoubleClick={handleContainerDoubleClick}
            />
        </div>

      </div>

        {showSignaturePad && (
            <div className="fixed inset-0 bg-slate-900/90 z-[9999] flex flex-col animate-in fade-in duration-200">
                <div className="p-4 flex justify-between items-center bg-white shadow-md z-10">
                    <h3 className="font-black text-slate-900 uppercase">Firma Digital (Lienzo Completo)</h3>
                    <button className="text-red-500 font-bold px-4 hover:underline" onClick={() => setShowSignaturePad(false)}>Cerrar</button>
                </div>
                <div className="flex-1 relative m-4 md:m-8 rounded-xl shadow-2xl border-2 border-dashed border-slate-300 overflow-hidden" 
                     style={{ 
                         touchAction: 'none',
                         backgroundImage: "url(\"data:image/svg+xml,%3Csvg width='20' height='20' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0 0h10v10H0zm10 10h10v10H10z' fill='%23d1d5db' fill-opacity='0.4' fill-rule='evenodd'/%3E%3C/svg%3E\")",
                         backgroundColor: '#f3f4f6'
                     }}>
                    <div className="absolute top-2 left-2 pointer-events-none opacity-50 text-slate-500 font-bold text-xs">
                         (FONDO TRANSPARENTE)
                    </div>
                    <canvas 
                        ref={canvasRef}
                        onMouseDown={startDrawing}
                        onMouseMove={drawSignature}
                        onMouseUp={stopDrawing}
                        onMouseLeave={stopDrawing}
                        onTouchStart={startDrawing}
                        onTouchMove={drawSignature}
                        onTouchEnd={stopDrawing}
                        className="w-full h-full cursor-crosshair touch-none absolute inset-0"
                    />
                </div>
                <div className="p-4 md:p-8 bg-slate-100 flex gap-4 md:gap-8 border-t border-slate-200">
                    <button onClick={clearSignature} className="flex-1 py-4 md:py-6 bg-white border border-slate-300 text-slate-600 rounded-xl font-bold text-sm md:text-xl hover:bg-slate-50 transition-colors shadow-sm uppercase tracking-widest">Limpiar Lienzo</button>
                    <button onClick={saveSignature} disabled={!hasSignature || isUploading} className="flex-[2] py-4 md:py-6 bg-primary text-white rounded-xl font-bold text-sm md:text-xl hover:bg-red-700 disabled:opacity-50 transition-colors shadow-lg shadow-red-200 flex justify-center items-center gap-2 uppercase tracking-widest">
                       {isUploading ? (
                           <>
                             <span className="material-symbols-outlined animate-spin hidden sm:inline-block">refresh</span>
                             Guardando...
                           </>
                       ) : (
                           <>
                             <span className="material-symbols-outlined hidden sm:inline-block">save</span>
                             Guardar Firma
                           </>
                       )}
                    </button>
                </div>
            </div>
        )}

    </div>
  );
};