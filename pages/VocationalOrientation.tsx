import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';
import { User, ToastMessage, Prospecto } from '../types';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';

const REGIONES_PERU = [
  "AMAZONAS", "ÁNCASH", "APURÍMAC", "AREQUIPA", "AYACUCHO", "CAJAMARCA",
  "CALLAO", "CUSCO", "HUANCAVELICA", "HUÁNUCO", "ICA", "JUNÍN", "LA LIBERTAD",
  "LAMBAYEQUE", "LIMA", "LORETO", "MADRE DE DIOS", "MOQUEGUA", "PASCO",
  "PIURA", "PUNO", "SAN MARTÍN", "TACNA", "TUMBES", "UCAYALI"
];

const AREAS_UNSAAC = [
  "Área A — Ingeniería y Ciencias Básicas",
  "Área B — Ciencias de la Salud",
  "Área C — Ciencias Empresariales",
  "Área D — Ciencias Sociales"
];

interface VocationalOrientationProps {
  user: User;
  notify: (message: string, type?: ToastMessage['type']) => void;
}

export const VocationalOrientation: React.FC<VocationalOrientationProps> = ({ user, notify }) => {
  const [prospects, setProspects] = useState<Prospecto[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'Todos' | 'Pendiente' | 'Contactado'>('Todos');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
  const [selectedProspect, setSelectedProspect] = useState<Prospecto | null>(null);
  const [emailAttachment, setEmailAttachment] = useState<{ base64: string, name: string } | null>(null);
  const [viewingTests, setViewingTests] = useState<Prospecto | null>(null);
  const [campaignTarget, setCampaignTarget] = useState<'Pendientes' | 'Todos' | 'Especifico'>('Pendientes');
  const [campaignSpecificId, setCampaignSpecificId] = useState<string>('');
  const [campaignSpecificSearch, setCampaignSpecificSearch] = useState('');
  const [showSpecificSuggestions, setShowSpecificSuggestions] = useState(false);
  const [campaignModality, setCampaignModality] = useState<string>('Todas');
  const [selectedEventId, setSelectedEventId] = useState<string>('Ninguno');
  const [sendingProgress, setSendingProgress] = useState({ current: 0, total: 0, isSending: false });
  const [ingresantesDict, setIngresantesDict] = useState<Record<string, any[]>>({});
  const [viewingIngresos, setViewingIngresos] = useState<any[] | null>(null);

  const [regionFilter, setRegionFilter] = useState('Todas');
  const [carreraFilter, setCarreraFilter] = useState('Todas');
  const [areaFilter, setAreaFilter] = useState('Todas');
  const [escuelas, setEscuelas] = useState<string[]>([]);
  const [escuelasData, setEscuelasData] = useState<any[]>([]);

  const [upcomingEvents, setUpcomingEvents] = useState<any[]>([]);

  const [isDniValidated, setIsDniValidated] = useState(false);
  const [formData, setFormData] = useState({
    nombre: '',
    dni: '',
    correo: '',
    celular: '',
    colegio_procedencia: '',
    grado_academico: '',
    carrera_interes: '',
    area_interes: '',
    modalidades_interes: [] as string[],
    region: '',
    estado_contacto: 'Pendiente' as Prospecto['estado_contacto'],
    suscrito: true
  });

  const [emailSubject, setEmailSubject] = useState('Invitación a los próximos Exámenes de Admisión - {nombre}');
  const [emailBody, setEmailBody] = useState(`¡Hola **{nombre}**!

Hemos notado tu gran interés en las modalidades de admisión de la Universidad Nacional de San Antonio Abad del Cusco (UNSAAC), y queremos brindarte la información necesaria para tu proceso de postulación.

{info_examen}
Te recordamos que las inscripciones y el proceso de admisión se realizan exclusivamente a través de nuestra **[Página Web Oficial](https://admision.unsaac.edu.pe/)**, allí también podrás acceder al temario de evaluación, cuadro de vacantes, cronogramas de admisión y tutoriales para tu postulación.

¡Te esperamos en la UNSAAC!

Síguenos en nuestras redes sociales para estar siempre informado:
- **[Facebook](https://www.facebook.com/p/Direcci%C3%B3n-de-Admisi%C3%B3n-Universidad-Nacional-de-San-Antonio-Abad-del-Cusco-61562739426524/?locale=es_LA)**
- **[YouTube](http://www.youtube.com/@DireccionAdmisionUNSAAC)**
- **[TikTok](https://www.tiktok.com/@unsaac.admision?is_from_webapp=1&sender_device=pc)**

Atentamente,
Dirección de Admisión`);

  const [colegioSearch, setColegioSearch] = useState('');
  const [colegiosData, setColegiosData] = useState<any[]>([]);
  const [showColegios, setShowColegios] = useState(false);
  const [ubigeoSearch, setUbigeoSearch] = useState('');
  const [ubigeosData, setUbigeosData] = useState<any[]>([]);
  const [showUbigeos, setShowUbigeos] = useState(false);

  useEffect(() => {
    fetchProspects();
    fetchEscuelas();
    fetchEvents();
  }, []);

  const fetchEvents = async () => {
    try {
      const { data } = await supabase
        .from('eventos')
        .select('*')
        .eq('type', 'Examen')
        .order('start_date', { ascending: true })
        .gte('end_date', new Date().toISOString().split('T')[0]); // Only upcoming
      
      if (data) setUpcomingEvents(data);
    } catch (e) {}
  };

  const fetchEscuelas = async () => {
    try {
      const { data, error } = await supabase
        .from('cv_escuelas')
        .select('nombre, area, is_hidden')
        .eq('is_hidden', false)
        .order('nombre', { ascending: true });
      if (data) {
        setEscuelas(data.map(e => e.nombre));
        setEscuelasData(data);
      }
    } catch (err) {}
  };

  const fetchProspects = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('prospectos_vocacionales')
      .select('*')
      .order('fecha_registro', { ascending: false });

    if (error) {
      if (error.code === '42P01') {
        notify('La tabla "prospectos_vocacionales" no existe. Por favor ejecuta el script SQL en la base de datos.', 'error');
      } else {
        notify(`Error al cargar prospectos: ${error.message}`, 'error');
      }
    } else {
      const prospectsData = data || [];
      setProspects(prospectsData);
      
      const dnis = [...new Set(prospectsData.map(p => p.dni))].filter(d => d && d.trim().length >= 8).slice(0, 500);
      if (dnis.length > 0) {
        try {
          const { data: participData } = await supabase
            .from('participantes')
            .select('*')
            .in('CODPOSTULANTE', dnis);
            
          if (participData) {
            const dict: Record<string, any[]> = {};
            participData.forEach(p => {
              if (!dict[p.CODPOSTULANTE]) dict[p.CODPOSTULANTE] = [];
              dict[p.CODPOSTULANTE].push(p);
            });
            setIngresantesDict(dict);
          }
        } catch (e) {
          console.error("Error fetching ingresantes:", e);
        }
      }
    }
    setLoading(false);
  };

  const checkDniInParticipantes = async (dni: string) => {
    if (dni.trim().length >= 8) {
      setLoading(true);
      try {
        const { data } = await supabase
          .from('participantes')
          .select('NOMBRE')
          .eq('CODPOSTULANTE', dni.trim())
          .limit(1);
          
        if (data && data.length > 0 && !formData.nombre) {
          setFormData(prev => ({ ...prev, nombre: data[0].NOMBRE }));
          notify('Nombre autocompletado desde la base de ingresantes históricos', 'info');
        }
      } catch (e) {}
      setLoading(false);
      setIsDniValidated(true);
    }
  };

  const latestColegioSearch = useRef('');
  const latestUbigeoSearch = useRef('');

  const removeAccents = (str: string) => str ? str.normalize("NFD").replace(/[\u0300-\u036f]/g, "") : "";

  const searchColegios = async (text: string) => {
    setColegioSearch(text);
    setFormData(prev => ({ ...prev, colegio_procedencia: text }));
    setShowColegios(true);
    
    latestColegioSearch.current = text;
    
    if (text.length < 3) {
      setColegiosData([]);
      return;
    }
    
    const cleanText = text.trim();
    // Replace multiple spaces with a `%` to allow fuzzy searching words in order (e.g., 'san antonio' -> '%san%antonio%')
    const searchPattern = `%${cleanText.replace(/\s+/g, '%')}%`;
    const searchPatternNoAccents = removeAccents(searchPattern);
    
    let resultData: any[] = [];
    const seenCodes = new Set<string>();
    
    // Extract region data in real time
    const parts = (formData.region || '').split('/').map(s => s.trim());
    const departamento = parts[0] || '';
    const provincia = parts[1] || '';
    
    // Fase 1: Provincia Exacta
    if (provincia) {
      const { data: provData } = await supabase
        .from('colegios')
        .select('nombre_ie, codigo_modular, departamento_provincia_distrito')
        .ilike('departamento_provincia_distrito', `% / ${provincia} / %`)
        .or(`nombre_ie.ilike.${searchPattern},nombre_ie.ilike.${searchPatternNoAccents}`)
        .limit(10);
        
      if (provData) {
        provData.forEach(item => {
          if (!seenCodes.has(item.codigo_modular)) {
            seenCodes.add(item.codigo_modular);
            resultData.push(item);
          }
        });
      }
    }
    
    // Fase 2: Triangulación por Región (Departamento)
    if (resultData.length < 15 && departamento) {
      const { data: depData } = await supabase
        .from('colegios')
        .select('nombre_ie, codigo_modular, departamento_provincia_distrito')
        // Starts with departamento
        .ilike('departamento_provincia_distrito', `${departamento} / %`)
        .or(`nombre_ie.ilike.${searchPattern},nombre_ie.ilike.${searchPatternNoAccents}`)
        .limit(15 - resultData.length);
        
      if (depData) {
        depData.forEach(item => {
          if (!seenCodes.has(item.codigo_modular)) {
            seenCodes.add(item.codigo_modular);
            resultData.push(item);
          }
        });
      }
    }
    
    // Fase 3: Búsqueda Nacional / Global
    if (resultData.length < 15) {
      const { data: globalData } = await supabase
        .from('colegios')
        .select('nombre_ie, codigo_modular, departamento_provincia_distrito')
        .or(`nombre_ie.ilike.${searchPattern},nombre_ie.ilike.${searchPatternNoAccents}`)
        .limit(15 - resultData.length);
        
      if (globalData) {
        globalData.forEach(item => {
          if (!seenCodes.has(item.codigo_modular)) {
            seenCodes.add(item.codigo_modular);
            resultData.push(item);
          }
        });
      }
    }
    
    if (latestColegioSearch.current === text) {
      setColegiosData(resultData);
    }
  };

  const searchUbigeos = async (text: string) => {
    setUbigeoSearch(text);
    setFormData(prev => ({ ...prev, region: text }));
    setShowUbigeos(true);
    
    latestUbigeoSearch.current = text;
    
    if (text.length < 3) {
      setUbigeosData([]);
      return;
    }
    
    const cleanText = text.trim();
    const words = cleanText.split(/[\s,/]+/).filter(w => w.length > 0);
    
    let query = supabase
      .from('ubigeos')
      .select('distrito, provincia, departamento');

    words.forEach(word => {
      query = query.or(`distrito.ilike.%${word}%,provincia.ilike.%${word}%,departamento.ilike.%${word}%`);
    });

    const { data } = await query.limit(15);
      
    if (latestUbigeoSearch.current === text) {
      setUbigeosData(data || []);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.nombre || !formData.dni || !formData.correo) {
      notify('El nombre, DNI y correo son obligatorios', 'warning');
      return;
    }

    setLoading(true);
    try {
      const dataToSave = {
        ...formData,
        nombre: (formData.nombre || '').trim().toUpperCase(),
        colegio_procedencia: (formData.colegio_procedencia || '').trim().toUpperCase(),
        grado_academico: formData.grado_academico || null,
        carrera_interes: (formData.carrera_interes || '').trim().toUpperCase(),
        area_interes: formData.area_interes || null,
      };

      if (selectedProspect) {
        const { error } = await supabase
          .from('prospectos_vocacionales')
          .update(dataToSave)
          .eq('id', selectedProspect.id);
        if (error) throw error;
        notify('Prospecto actualizado correctamente', 'success');
      } else {
        const { data: insertedData, error } = await supabase
          .from('prospectos_vocacionales')
          .insert([dataToSave])
          .select('id')
          .single();
        if (error) throw error;
        
        // Enviar correo de bienvenida al nuevo prospecto
        try {
          const originResolver = window.location.origin.includes('localhost') && import.meta.env.VITE_API_URL ? import.meta.env.VITE_API_URL : window.location.origin;
          const cancelUrl = insertedData ? `${originResolver}/#/unsubscribe?id=${insertedData.id}` : '#';
          const welcomeHtml = `
            <div style="font-family: sans-serif; padding: 20px;">
              <h2 style="color: #7b1523;">¡Bienvenido(a) a la plataforma de Atención y Orientación al Postulante UNSAAC!</h2>
              <p>Hola <strong>${dataToSave.nombre}</strong>,</p>
              <p>Gracias por unirte a nuestra plataforma. Estamos muy felices de acompañarte en este paso tan importante que es decidir tu futuro profesional.</p>
              ${dataToSave.carrera_interes 
                ? `<p>Hemos notado tu interés en la carrera de <strong>${dataToSave.carrera_interes}</strong>. ¡Es una excelente elección!</p>` 
                : '<p>Te guiaremos para que descubras la carrera ideal a tu perfil.</p>'}
              <p>A partir de ahora, recibirás notificaciones y novedades sobre fechas de exámenes de admisión, ferias vocacionales y noticias importantes directamente en tu correo.</p>
              <br/>
              <p>Te invitamos a revisar los perfiles de todas nuestras escuelas profesionales en el siguiente enlace:</p>
              <div style="margin: 20px 0;">
                <a href="https://drive.google.com/file/d/1PjlN342ZH-b5p_c1-GB9VJUVUZf_w3LF/view?usp=sharing" target="_blank" style="background-color: #7b1523; color: white; padding: 10px 20px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Ver Brochure de Carreras Profesionales</a>
              </div>
              <br/>
              <p>Además, te recomendamos visitar nuestra <a href="https://admision.unsaac.edu.pe/" target="_blank" style="color: #7b1523; text-decoration: underline; font-weight: bold;">página web oficial</a> para conocer el temario, cuadro de vacantes, cronogramas de admisión, modalidades de ingreso y tutoriales para tu postulación.</p>
              <br/>
              <p>¡Mucho éxito en tu preparación!</p>
              <p>Saludos cordiales,<br/><strong>Dirección de Admisión UNSAAC</strong></p>
              
              <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;" />
              <div style="text-align: center; font-size: 13px; color: #666;">
                <p>Síguenos en nuestras redes sociales para estar al día:</p>
                <div style="margin-top: 10px;">
                  <a href="https://www.facebook.com/p/Direcci%C3%B3n-de-Admisi%C3%B3n-Universidad-Nacional-de-San-Antonio-Abad-del-Cusco-61562739426524/?locale=es_LA" target="_blank" style="color: #1877F2; text-decoration: none; font-weight: bold; margin: 0 10px;">Facebook</a> |
                  <a href="http://www.youtube.com/@DireccionAdmisionUNSAAC" target="_blank" style="color: #FF0000; text-decoration: none; font-weight: bold; margin: 0 10px;">YouTube</a> |
                  <a href="https://www.tiktok.com/@unsaac.admision?is_from_webapp=1&sender_device=pc" target="_blank" style="color: #000000; text-decoration: none; font-weight: bold; margin: 0 10px;">TikTok</a>
                </div>
                <p style="margin-top: 20px; font-size: 10px; color: #999;">Este mensaje automático de bienvenida fue generado el ${new Date().toLocaleString('es-PE')}.</p>
                <p style="margin-top: 5px; font-size: 11px; color: #999;">Si ya no deseas recibir este tipo de correos, puedes <a href="${cancelUrl}" target="_blank" style="color: #7b1523; text-decoration: underline;">darte de baja aquí</a>.</p>
              </div>
            </div>
          `;
          await fetch('/api/send-email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              to: formData.correo,
              subject: `¡Bienvenido(a) a Atención y Orientación al Postulante UNSAAC, ${dataToSave.nombre}!`,
              html: welcomeHtml
            })
          });
          notify('Nuevo prospecto registrado y correo enviado', 'success');
        } catch (mailErr) {
          console.error("Error sending welcome mail", mailErr);
          notify('Nuevo prospecto registrado (Sin correo)', 'success');
        }
      }
      setIsModalOpen(false);
      fetchProspects();
    } catch (err: any) {
      notify(`Error: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('¿Estás seguro de eliminar este prospecto?')) {
      const { error } = await supabase.from('prospectos_vocacionales').delete().eq('id', id);
      if (error) {
        notify(`Error al eliminar: ${error.message}`, 'error');
      } else {
        notify('Prospecto eliminado', 'info');
        fetchProspects();
      }
    }
  };

  const toggleSuscripcion = async (p: Prospecto) => {
    try {
      const isSub = p.suscrito !== false; // defaults to true if undefined
      const { error } = await supabase
        .from('prospectos_vocacionales')
        .update({ suscrito: !isSub })
        .eq('id', p.id);
      
      if (error) throw error;
      notify(isSub ? 'Prospecto dado de baja de correos' : 'Prospecto suscrito nuevamente', 'info');
      fetchProspects();
    } catch (err: any) {
      notify(`Error: ${err.message}`, 'error');
    }
  };

  const handleWhatsAppSend = (p: Prospecto) => {
    if (!p.celular) {
      notify('El prospecto no tiene número de celular registrado.', 'warning');
      return;
    }
    
    // Convertir el celular limpiando todo lo que no sea dígito
    let phoneNum = p.celular.replace(/\D/g, '');
    
    // Si metieron algún "0" adelante, se limpia
    while (phoneNum.startsWith('0')) {
      phoneNum = phoneNum.substring(1);
    }

    // Si tiene 9 dígitos o si no empieza con 51
    if (phoneNum.length === 9 || (!phoneNum.startsWith('51') && phoneNum.length <= 10)) {
      // Por si acasito nos quedamos con los últimos 9 dígitos (formato peruano)
      if (phoneNum.length > 9) {
        phoneNum = phoneNum.slice(-9);
      }
      phoneNum = '51' + phoneNum;
    }

    const hasTakenTest = Array.isArray(p.resultados_test) && p.resultados_test.length > 0;
    const testLink = hasTakenTest 
      ? '' 
      : `\n\n¿Aún no sabes qué estudiar?\nRealiza nuestro Test Vocacional gratis aquí:\n👉 https://test-prueba-admision.netlify.app/`;

    const shortMsg = `¡Hola *${p.nombre}*!

Notamos tu interés en postular a la UNSAAC${p.carrera_interes ? ` (*${p.carrera_interes}*)` : ''}.

*Enlaces útiles para tu postulación:*
- Brochure: https://drive.google.com/file/d/1PjlN342ZH-b5p_c1-GB9VJUVUZf_w3LF/view
- Web Oficial (Cronogramas y Temarios): https://admision.unsaac.edu.pe${testLink}

Búscanos en Facebook, YouTube y TikTok como: *Dirección de Admisión UNSAAC*

Si tienes dudas, avísanos.
_Dirección de Admisión UNSAAC_`;

    
    const encodedMsg = encodeURIComponent(shortMsg);
    window.open(`https://wa.me/${phoneNum}?text=${encodedMsg}`, '_blank');
  };

  const handleSendEmails = async () => {
    let listToSend: Prospecto[] = [];
    if (campaignTarget === 'Especifico') {
      const specificP = prospects.find(p => p.id === campaignSpecificId);
      if (specificP && specificP.correo) {
        // En envío específico ignoramos la suscripción porque es una acción directa manual
        listToSend = [specificP];
      }
    } else {
      listToSend = filteredProspects.filter(p => {
        if (!p.correo || p.suscrito === false) return false;
        if (campaignTarget === 'Pendientes' && p.estado_contacto !== 'Pendiente') return false;
        if (campaignModality !== 'Todas' && (!p.modalidades_interes || !p.modalidades_interes.includes(campaignModality))) return false;
        return true;
      });
    }

    if (emailBody.includes('{info_examen}') && selectedEventId === 'Ninguno') {
      notify('Por favor, selecciona un "Evento del Calendario" para generar las fechas, o remueve {info_examen} del mensaje.', 'error');
      return;
    }

    if (listToSend.length === 0) {
      notify(`No hay prospectos válidos para la campaña (${campaignTarget}${campaignModality !== 'Todas' ? ' - ' + campaignModality : ''}).`, 'warning');
      return;
    }

    setIsEmailModalOpen(false);
    setLoading(true);
    let successCount = 0;
    notify(`Enviando ${listToSend.length} correos...`, 'info');

    let extraInfoText = '';
    const selectedEvent = upcomingEvents.find(e => e.id === selectedEventId);

    if (selectedEvent) {
      const formattedExamDate = format(parseISO(selectedEvent.start_date), "d 'de' MMMM 'del' yyyy", { locale: es });
      extraInfoText = `Te informamos que el **${selectedEvent.title}** está programado para el **${formattedExamDate}**.\n`;
      
      if (selectedEvent.proceso) {
        try {
          const { data: related, error: relatedErr } = await supabase
            .from('eventos')
            .select('title, start_date, end_date')
            .eq('proceso', selectedEvent.proceso)
            .eq('audiencia', 'Público General')
            .neq('id', selectedEvent.id)
            .order('start_date', { ascending: true });
            
          if (!relatedErr && related && related.length > 0) {
            extraInfoText += `\n**Fechas importantes adicionales para este proceso:**\n`;
            for (const rel of related) {
               const dStart = format(parseISO(rel.start_date), "d 'de' MMMM", { locale: es });
               const dEnd = format(parseISO(rel.end_date), "d 'de' MMMM", { locale: es });
               const dates = rel.start_date === rel.end_date ? dStart : `del ${dStart} al ${dEnd}`;
               extraInfoText += `- **${rel.title}**: ${dates}\n`;
            }
            extraInfoText += '\n';
          }
        } catch (err) {
          console.error("Error fetching related events:", err);
        }
      }
    }

    setSendingProgress({ current: 0, total: listToSend.length, isSending: true });

    for (let i = 0; i < listToSend.length; i++) {
      const p = listToSend[i];
      setSendingProgress({ current: i + 1, total: listToSend.length, isSending: true });
      try {
        let finalBody = emailBody
          .replace(/{nombre}/g, p.nombre)
          .replace(/{carrera_interes}/g, p.carrera_interes || 'tu carrera de interés');
        
        if (selectedEvent) {
          if (finalBody.includes('{info_examen}')) {
             finalBody = finalBody.replace(/{info_examen}\n?/g, extraInfoText);
          } else {
             // Fallback if the user wiped out the variable from the textbox
             finalBody += `\n\n${extraInfoText}`;
          }
          finalBody = finalBody
            .replace(/{evento_titulo}/g, selectedEvent.title)
            .replace(/{evento_fecha}/g, format(parseISO(selectedEvent.start_date), "d 'de' MMMM", { locale: es }))
            .replace(/{evento_proceso}/g, selectedEvent.proceso || 'Proceso Regular');
        } else {
          finalBody = finalBody.replace(/{info_examen}\n?/g, '');
        }

        const textBody = finalBody
          .replace(/\*\*(.*?)\*\*/g, '$1')
          .replace(/\[(.*?)\]\((.*?)\)/g, '$1 ($2)');
          
        const htmlContent = finalBody
          .replace(/\n/g, '<br/>')
          .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
          .replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" target="_blank" style="color: #7b1523; text-decoration: underline; font-weight: bold;">$1</a>');
          
        const originResolver = window.location.origin.includes('localhost') && import.meta.env.VITE_API_URL ? import.meta.env.VITE_API_URL : window.location.origin;
        const cancelUrl = `${originResolver}/#/unsubscribe?id=${p.id}`;
        const finalHtmlBody = `<div style="font-family: sans-serif; padding: 20px; color: #333; line-height: 1.6;">${htmlContent}</div>
        <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;" />
        <div style="text-align: center; font-size: 11px; color: #999;">
          Si ya no deseas recibir este tipo de correos, puedes <a href="${cancelUrl}" target="_blank" style="color: #7b1523; text-decoration: underline;">darte de baja aquí</a>.
        </div>`;

        let finalSubject = emailSubject.replace(/{nombre}/g, p.nombre);

        const res = await fetch('/api/send-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: p.correo,
            subject: finalSubject,
            text: textBody,
            html: finalHtmlBody,
            attachmentBase64: emailAttachment?.base64,
            filename: emailAttachment?.name
          })
        });

        if (res.ok) {
          await supabase.from('prospectos_vocacionales').update({ estado_contacto: 'Contactado' }).eq('id', p.id);
          successCount++;
        }
        
        if (i < listToSend.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 800)); // 800ms de pausa entre envios
        }
      } catch (err) {
        console.error('Error enviando a:', p.correo, err);
      }
    }
    
    setSendingProgress({ current: listToSend.length, total: listToSend.length, isSending: false });
    notify(`Se enviaron ${successCount} correos exitosamente.`, 'success');
    fetchProspects();
    setLoading(false);
  };

  const handleAttachmentSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      setEmailAttachment(null);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setEmailAttachment({
        base64: reader.result as string,
        name: file.name
      });
    };
    reader.readAsDataURL(file);
  };

  const openNewProspect = () => {
    setSelectedProspect(null);
    setIsDniValidated(false);
    setColegioSearch('');
    setUbigeoSearch('');
    setFormData({ nombre: '', dni: '', correo: '', celular: '', colegio_procedencia: '', grado_academico: '', carrera_interes: '', area_interes: '', modalidades_interes: [], region: '', estado_contacto: 'Pendiente', suscrito: true });
    setIsModalOpen(true);
  };

  const openEditProspect = (p: Prospecto) => {
    setSelectedProspect(p);
    setIsDniValidated(true);
    setColegioSearch(p.colegio_procedencia || '');
    setUbigeoSearch(p.region || '');
    setFormData({
      nombre: p.nombre,
      dni: p.dni,
      correo: p.correo,
      celular: p.celular || '',
      colegio_procedencia: p.colegio_procedencia || '',
      grado_academico: p.grado_academico || '',
      carrera_interes: p.carrera_interes || '',
      area_interes: p.area_interes || '',
      modalidades_interes: p.modalidades_interes || [],
      region: p.region || '',
      estado_contacto: p.estado_contacto,
      suscrito: p.suscrito !== false
    });
    setIsModalOpen(true);
  };

  const getStatusColor = (status: string) => {
    switch(status) {
      case 'Pendiente': return 'bg-amber-100 text-amber-800 border-amber-200';
      case 'Contactado': return 'bg-emerald-100 text-emerald-800 border-emerald-200';
      default: return 'bg-slate-100 text-slate-800 border-slate-200';
    }
  };

  const filteredProspects = prospects.filter(p => {
    const matchesFilter = statusFilter === 'Todos' || p.estado_contacto === statusFilter;
    const matchesRegion = regionFilter === 'Todas' || p.region === regionFilter;
    const matchesCarrera = carreraFilter === 'Todas' || p.carrera_interes === carreraFilter;
    const matchesArea = areaFilter === 'Todas' || (p.area_interes && p.area_interes.startsWith(areaFilter.substring(0, 6))); // "Área X"
    const matchesSearch = p.nombre.toLowerCase().includes(searchQuery.toLowerCase()) || p.dni.includes(searchQuery) || (p.carrera_interes?.toLowerCase() || '').includes(searchQuery.toLowerCase());
    return matchesFilter && matchesRegion && matchesCarrera && matchesArea && matchesSearch;
  });

  return (
    <div className="p-6 h-full flex flex-col gap-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-4">
          <div className="size-12 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-lg shadow-indigo-200">
            <span className="material-symbols-outlined text-2xl">campaign</span>
          </div>
          <div>
            <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tighter">Marketing y Prospectos</h2>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Base de datos de campañas y prospectos orientados</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button 
            onClick={() => setIsEmailModalOpen(true)}
            className="h-11 px-5 bg-white border border-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all hover:bg-slate-50 flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-[18px]">campaign</span>
            Crear Campaña
          </button>
          <button 
            onClick={openNewProspect}
            className="h-11 px-5 bg-indigo-600 text-white rounded-xl text-xs font-bold shadow-lg shadow-indigo-200 hover:bg-indigo-700 active:scale-95 transition-all flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
            Nuevo Registro
          </button>
        </div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 shrink-0">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col gap-1">
          <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Total Registrados</p>
          <h3 className="text-2xl font-black text-slate-800">{prospects.length}</h3>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col gap-1">
          <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Pendientes</p>
          <h3 className="text-2xl font-black text-amber-600">{prospects.filter(p => p.estado_contacto === 'Pendiente').length}</h3>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col gap-1">
          <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Contactados</p>
          <h3 className="text-2xl font-black text-emerald-600">{prospects.filter(p => p.estado_contacto === 'Contactado').length}</h3>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col gap-1">
          <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Ingresantes Detectados</p>
          <h3 className="text-2xl font-black text-indigo-600">{prospects.filter(p => ingresantesDict[p.dni]?.some(d => parseFloat(d.NOTA) > 0)).length}</h3>
        </div>
      </div>

      {/* Filters Base */}
      <div className="bg-white p-2 rounded-2xl border border-slate-200 shadow-sm flex flex-col gap-2 shrink-0">
        <div className="flex flex-col md:flex-row gap-2">
          <div className="flex-1 flex items-center gap-2 px-3 border-b md:border-b-0 md:border-r border-slate-100 pb-2 md:pb-0">
            <span className="material-symbols-outlined text-slate-400">search</span>
            <input 
              type="text" 
              placeholder="Buscar por DNI, Nombre..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full text-sm font-bold text-slate-700 outline-none bg-transparent placeholder:text-slate-300"
            />
          </div>
          <div className="flex items-center gap-1 overflow-x-auto pb-1 md:pb-0 scrollbar-hide px-2">
            {['Todos', 'Pendiente', 'Contactado'].map(status => (
               <button 
                 key={status}
                 onClick={() => setStatusFilter(status as any)}
                 className={`px-4 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${statusFilter === status ? 'bg-indigo-600 text-white shadow-md' : 'bg-slate-50 text-slate-500 hover:bg-slate-100'}`}
               >
                 {status}
               </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 px-3 pt-1 border-t border-slate-100">
           <select value={regionFilter} onChange={e => setRegionFilter(e.target.value)} className="bg-slate-50 border border-slate-200 text-xs font-bold text-slate-700 px-3 py-1.5 rounded-lg outline-none focus:border-indigo-500">
             <option value="Todas">Todas las Regiones</option>
             {REGIONES_PERU.map(r => <option key={r} value={r}>{r}</option>)}
           </select>
           <select value={areaFilter} onChange={e => setAreaFilter(e.target.value)} className="bg-slate-50 border border-slate-200 text-xs font-bold text-slate-700 px-3 py-1.5 rounded-lg outline-none focus:border-indigo-500 max-w-[200px] truncate">
             <option value="Todas">Todas las Áreas</option>
             {AREAS_UNSAAC.map(a => <option key={a} value={a}>{a.replace('Área ', '')}</option>)}
           </select>
           <select value={carreraFilter} onChange={e => setCarreraFilter(e.target.value)} className="bg-slate-50 border border-slate-200 text-xs font-bold text-slate-700 px-3 py-1.5 rounded-lg outline-none focus:border-indigo-500 max-w-[250px] truncate">
             <option value="Todas">Todas las Carreras</option>
             {escuelas.map(c => <option key={c} value={c}>{c}</option>)}
           </select>
        </div>
      </div>

      {/* Table Area */}
      <div className="flex-1 min-h-0 bg-white border border-slate-200 rounded-3xl shadow-sm overflow-hidden flex flex-col">
          <div className="overflow-auto flex-1 relative">
            <table className="w-full text-left border-collapse min-w-[800px]">
              <thead className="bg-slate-50 sticky top-0 z-10 shadow-sm">
                <tr>
                  <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-100">Prospecto</th>
                  <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-100">Contacto</th>
                  <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-100">Interés / Colegio</th>
                  <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-100">Estado</th>
                  <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-100">Registro</th>
                  <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-100 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                 {loading ? (
                    <tr>
                      <td colSpan={6} className="text-center py-12">
                        <span className="material-symbols-outlined animate-spin text-slate-300 text-3xl">refresh</span>
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-2">Cargando datos...</p>
                      </td>
                    </tr>
                 ) : filteredProspects.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center py-12">
                        <span className="material-symbols-outlined text-slate-300 text-4xl mb-3">manage_search</span>
                        <p className="text-sm font-bold text-slate-500">No se encontraron prospectos</p>
                      </td>
                    </tr>
                 ) : (
                   filteredProspects.map(p => (
                     <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                       <td className="px-6 py-3">
                         <div className="font-bold text-sm text-slate-800">{p.nombre}</div>
                         <div className="text-[10px] font-black text-slate-400 font-mono">DNI: {p.dni}</div>
                         {ingresantesDict[p.dni] && ingresantesDict[p.dni].some(d => parseFloat(d.NOTA) > 0) && (
                           <button onClick={() => setViewingIngresos(ingresantesDict[p.dni])} className="mt-1 inline-flex items-center gap-1 bg-yellow-100 text-yellow-800 px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-widest hover:bg-yellow-200 transition-colors">
                             <span className="material-symbols-outlined text-[12px]">workspace_premium</span> Es Ingresante
                           </button>
                         )}
                       </td>
                       <td className="px-6 py-3">
                         <div className="flex items-center gap-1 text-xs text-slate-600 mb-0.5 font-medium">
                           <span className="material-symbols-outlined text-[12px] opacity-50">mail</span> 
                           {p.correo}
                           {p.suscrito === false && <span className="bg-rose-100 text-rose-600 px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-widest ml-1">De Baja</span>}
                         </div>
                         {p.celular && <div className="flex items-center gap-1 text-[10px] font-mono text-slate-500"><span className="material-symbols-outlined text-[12px] opacity-50">call</span> {p.celular}</div>}
                       </td>
                       <td className="px-6 py-3">
                         <div className="font-bold text-xs text-indigo-700">{p.carrera_interes || p.area_interes || '-'}</div>
                         <div className="text-[10px] text-slate-500 truncate max-w-[200px]">
                           {p.area_interes && p.area_interes !== p.carrera_interes && <span className="block mb-0.5 text-slate-600 font-medium">{p.area_interes}</span>}
                           {p.colegio_procedencia || '-'}
                           {p.grado_academico && <span className="block mt-0.5 text-slate-500 font-medium">{p.grado_academico}</span>}
                           {p.region && <span className="block mt-0.5 text-slate-400 font-medium">Región: {p.region}</span>}
                         </div>
                       </td>
                       <td className="px-6 py-3">
                         <span className={`px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-widest border ${getStatusColor(p.estado_contacto)}`}>
                           {p.estado_contacto}
                         </span>
                       </td>
                       <td className="px-6 py-3">
                         <div className="text-[11px] font-bold text-slate-600">{format(new Date(p.fecha_registro), 'dd MMM yyyy', { locale: es })}</div>
                       </td>
                       <td className="px-6 py-3 text-right">
                         <div className="flex items-center justify-end gap-1">
                           <button onClick={() => handleWhatsAppSend(p)} className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors" title="Enviar WhatsApp">
                             <span className="material-symbols-outlined text-[18px]">chat</span>
                           </button>
                           {p.resultados_test && p.resultados_test.length > 0 && (
                             <button onClick={() => setViewingTests(p)} className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors" title="Ver Resultados de Test">
                               <span className="material-symbols-outlined text-[18px]">assignment</span>
                             </button>
                           )}
                           <button onClick={() => toggleSuscripcion(p)} className={`p-2 rounded-lg transition-colors ${p.suscrito === false ? 'text-emerald-500 hover:bg-emerald-50' : 'text-slate-400 hover:bg-slate-100'}`} title={p.suscrito === false ? "Volver a Suscribir" : "Dar de baja"}>
                             <span className="material-symbols-outlined text-[18px]">
                               {p.suscrito === false ? 'mark_email_read' : 'unsubscribe'}
                             </span>
                           </button>
                           <button onClick={() => openEditProspect(p)} className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors">
                             <span className="material-symbols-outlined text-[18px]">edit</span>
                           </button>
                           <button onClick={() => handleDelete(p.id)} className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors">
                             <span className="material-symbols-outlined text-[18px]">delete</span>
                           </button>
                         </div>
                       </td>
                     </tr>
                   ))
                 )}
              </tbody>
            </table>
          </div>
      </div>

       {/* Form Modal */}
       {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <h3 className="font-black text-slate-800 uppercase tracking-tighter">
                {selectedProspect ? 'Editar Prospecto' : 'Nuevo Prospecto'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            
            <form onSubmit={handleSave} className="p-6 flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-4">
                <label className={`flex flex-col gap-1 ${!isDniValidated ? 'col-span-2' : ''}`}>
                    <span className="text-[10px] font-black text-slate-500 uppercase">Documento DNI *</span>
                    <div className="flex gap-2">
                       <input type="text" required value={formData.dni} onChange={e => {
                         setFormData({...formData, dni: e.target.value});
                         if(e.target.value.trim().length >= 8) checkDniInParticipantes(e.target.value);
                       }} disabled={isDniValidated && selectedProspect !== null} className="w-full h-11 px-4 rounded-xl border border-slate-200 bg-slate-50 font-medium text-sm outline-none focus:border-indigo-500 focus:bg-white transition-all disabled:opacity-60" />
                       {!isDniValidated && (
                         <button type="button" onClick={() => checkDniInParticipantes(formData.dni)} disabled={formData.dni.length < 8 || loading} className="px-5 rounded-xl bg-slate-900 text-white font-bold text-xs disabled:opacity-50 flex items-center justify-center shrink-0">
                            {loading ? <span className="material-symbols-outlined animate-spin text-[16px]">refresh</span> : 'Verificar'}
                         </button>
                       )}
                    </div>
                </label>
                
                {isDniValidated && (
                  <>
                    <label className="flex flex-col gap-1">
                        <span className="text-[10px] font-black text-slate-500 uppercase">Celular</span>
                        <input type="text" value={formData.celular} onChange={e => setFormData({...formData, celular: e.target.value})} className="h-11 px-4 rounded-xl border border-slate-200 bg-slate-50 font-medium text-sm outline-none focus:border-indigo-500 focus:bg-white transition-all" />
                    </label>
                    <label className="flex flex-col gap-1 col-span-2">
                        <span className="text-[10px] font-black text-slate-500 uppercase">Nombres y Apellidos *</span>
                        <input type="text" required value={formData.nombre} onChange={e => setFormData({...formData, nombre: e.target.value})} className="h-11 px-4 rounded-xl border border-slate-200 bg-slate-50 font-medium text-sm outline-none focus:border-indigo-500 focus:bg-white transition-all" />
                    </label>
                    <label className="flex flex-col gap-1 col-span-2">
                        <span className="text-[10px] font-black text-slate-500 uppercase">Correo Electrónico *</span>
                        <input type="email" required value={formData.correo} onChange={e => setFormData({...formData, correo: e.target.value})} className="h-11 px-4 rounded-xl border border-slate-200 bg-slate-50 font-medium text-sm outline-none focus:border-indigo-500 focus:bg-white transition-all" />
                    </label>
                    <label className="flex flex-col gap-1 col-span-2 relative">
                        <span className="text-[10px] font-black text-slate-500 uppercase">Región / Departamento (Distrito)</span>
                        <input 
                          type="text" 
                          value={ubigeoSearch} 
                          onChange={e => searchUbigeos(e.target.value)} 
                          onFocus={() => setShowUbigeos(true)}
                          onBlur={() => setTimeout(() => setShowUbigeos(false), 200)}
                          className="h-11 px-4 rounded-xl border border-slate-200 bg-slate-50 font-medium text-sm outline-none focus:border-indigo-500 focus:bg-white transition-all" 
                          placeholder="Buscar por distrito..."
                        />
                        {showUbigeos && ubigeosData.length > 0 && (
                          <div 
                            className="absolute top-full mt-1 w-full bg-white border border-slate-200 shadow-xl rounded-xl max-h-48 overflow-y-auto z-50 p-1"
                            onMouseDown={(e) => e.preventDefault()}
                          >
                            {ubigeosData.map((u, i) => (
                              <div 
                                key={i} 
                                className="px-4 py-2 hover:bg-slate-50 cursor-pointer rounded-lg transition-colors border-b border-slate-50 last:border-0"
                                onClick={() => {
                                  const text = `${u.departamento} / ${u.provincia} / ${u.distrito}`;
                                  setUbigeoSearch(text);
                                  setFormData({...formData, region: text});
                                  setShowUbigeos(false);
                                  
                                  // Trigger a small refresh in school search context if needed
                                  if (colegioSearch) searchColegios(colegioSearch);
                                }}
                              >
                                <div className="font-bold text-slate-700 text-xs">{u.distrito}</div>
                                <div className="text-[10px] text-slate-500">{u.provincia}, {u.departamento}</div>
                              </div>
                            ))}
                          </div>
                        )}
                    </label>
                    <label className="flex flex-col gap-1 col-span-2 relative">
                        <span className="text-[10px] font-black text-slate-500 uppercase">Colegio de Procedencia</span>
                        <input 
                          type="text" 
                          value={colegioSearch} 
                          onChange={e => searchColegios(e.target.value)} 
                          onFocus={() => setShowColegios(true)}
                          onBlur={() => setTimeout(() => setShowColegios(false), 200)}
                          className="h-11 px-4 rounded-xl border border-slate-200 bg-slate-50 font-medium text-sm outline-none focus:border-indigo-500 focus:bg-white transition-all" 
                          placeholder="Escribe para buscar colegio..."
                        />
                        {showColegios && colegiosData.length > 0 && (
                          <div 
                            className="absolute top-full mt-1 w-full bg-white border border-slate-200 shadow-xl rounded-xl max-h-48 overflow-y-auto z-50 p-1"
                            onMouseDown={(e) => e.preventDefault()}
                          >
                            {colegiosData.map((c, i) => (
                              <div 
                                key={i} 
                                className="px-4 py-2 hover:bg-slate-50 cursor-pointer rounded-lg transition-colors border-b border-slate-50 last:border-0"
                                onClick={() => {
                                  setColegioSearch(c.nombre_ie);
                                  setFormData(prev => ({...prev, colegio_procedencia: c.nombre_ie}));
                                  setShowColegios(false);
                                }}
                              >
                                <div className="font-bold text-slate-700 text-xs">{c.nombre_ie}</div>
                                <div className="text-[10px] text-slate-500">{c.codigo_modular} - {c.departamento_provincia_distrito}</div>
                              </div>
                            ))}
                          </div>
                        )}
                        <input type="hidden" value={formData.colegio_procedencia} />
                    </label>
                    <label className="flex flex-col gap-1 col-span-2">
                        <span className="text-[10px] font-black text-slate-500 uppercase">Grado Académico / Año de Estudios</span>
                        <select value={formData.grado_academico} onChange={e => setFormData({...formData, grado_academico: e.target.value})} className="h-11 px-4 rounded-xl border border-slate-200 bg-slate-50 font-medium text-sm outline-none focus:border-indigo-500 focus:bg-white transition-all">
                          <option value="">— Selecciona tu grado —</option>
                          <option value="1º de Secundaria">1º de Secundaria</option>
                          <option value="2º de Secundaria">2º de Secundaria</option>
                          <option value="3º de Secundaria">3º de Secundaria</option>
                          <option value="4º de Secundaria">4º de Secundaria</option>
                          <option value="5º de Secundaria">5º de Secundaria</option>
                          <option value="Egresado de Secundaria">Egresado de Secundaria</option>
                        </select>
                    </label>
                    <label className="flex flex-col gap-1">
                        <span className="text-[10px] font-black text-slate-500 uppercase">Área Recomendada / Interés</span>
                        <select value={formData.area_interes} onChange={e => setFormData({...formData, area_interes: e.target.value, carrera_interes: ''})} className="h-11 px-4 rounded-xl border border-slate-200 bg-slate-50 font-medium text-sm outline-none focus:border-indigo-500 focus:bg-white transition-all">
                          <option value="">Seleccione un Área (Opcional)</option>
                          {AREAS_UNSAAC.map(area => (
                            <option key={area} value={area}>{area}</option>
                          ))}
                        </select>
                    </label>
                    <label className="flex flex-col gap-1">
                        <span className="text-[10px] font-black text-slate-500 uppercase">Carrera de Interés</span>
                        <select value={formData.carrera_interes} onChange={e => setFormData({...formData, carrera_interes: e.target.value})} className="h-11 px-4 rounded-xl border border-slate-200 bg-slate-50 font-medium text-sm outline-none focus:border-indigo-500 focus:bg-white transition-all">
                          <option value="">Seleccione una carrera (Opcional)</option>
                          {escuelasData.filter(c => formData.area_interes ? c.area === formData.area_interes.match(/Área ([A-Z])/)?.[1] : true).map(c => <option key={c.nombre} value={c.nombre}>{c.nombre}</option>)}
                        </select>
                    </label>
                    <label className="flex flex-col gap-1">
                        <span className="text-[10px] font-black text-slate-500 uppercase">Estado</span>
                        <select required value={formData.estado_contacto} onChange={e => setFormData({...formData, estado_contacto: e.target.value as any})} className="h-11 px-4 rounded-xl border border-slate-200 bg-slate-50 font-medium text-sm outline-none focus:border-indigo-500 focus:bg-white transition-all">
                          <option value="Pendiente">Pendiente</option>
                          <option value="Contactado">Contactado</option>
                        </select>
                    </label>
                    <div className="flex flex-col gap-2 col-span-2 mt-2">
                        <span className="text-[10px] font-black text-slate-500 uppercase">Modalidades de Interés</span>
                        <div className="flex flex-wrap gap-2">
                          {['Ordinario', 'Primera Oportunidad', 'Dirimente', 'CEPRU', 'Discapacitados', 'Víctimas', 'Deportistas', 'Traslados Internos', 'Traslados Externos', 'Graduados'].map(mod => (
                            <label key={mod} className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-bold cursor-pointer transition-all ${formData.modalidades_interes.includes(mod) ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                              <input 
                                type="checkbox" 
                                className="hidden"
                                checked={formData.modalidades_interes.includes(mod)}
                                onChange={(e) => {
                                  const newMods = e.target.checked 
                                    ? [...formData.modalidades_interes, mod]
                                    : formData.modalidades_interes.filter(m => m !== mod);
                                  setFormData({...formData, modalidades_interes: newMods});
                                }}
                              />
                              <div className={`size-4 rounded flex items-center justify-center border ${formData.modalidades_interes.includes(mod) ? 'border-indigo-500 bg-indigo-500' : 'border-slate-300'}`}>
                                {formData.modalidades_interes.includes(mod) && <span className="material-symbols-outlined text-[12px] text-white">check</span>}
                              </div>
                              {mod}
                            </label>
                          ))}
                        </div>
                    </div>
                  </>
                )}
              </div>

              <div className="flex gap-3 justify-end mt-4">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-5 py-2.5 rounded-xl text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors">
                  Cancelar
                </button>
                <button type="submit" disabled={loading} className="px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 shadow-md shadow-indigo-200 transition-all">
                  Guardar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Email Campaign Modal */}
      {isEmailModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col h-[80vh]">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 shrink-0">
              <div>
                <h3 className="font-black text-slate-800 uppercase tracking-tighter">Campaña de Promoción</h3>
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  <span className="text-[10px] font-bold text-slate-500">Enviar a:</span>
                  <select value={campaignTarget} onChange={e => setCampaignTarget(e.target.value as any)} className="bg-slate-100 border border-slate-200 text-xs font-bold text-slate-700 px-2 py-1 rounded-md outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500">
                    <option value="Pendientes">Solo Pendientes</option>
                    <option value="Todos">Todos (Excepto bajas)</option>
                    <option value="Especifico">Específico</option>
                  </select>
                  
                  {campaignTarget === 'Especifico' ? (
                    <div className="flex items-center gap-2 relative">
                       <span className="text-[10px] font-bold text-slate-500 ml-2">Prospecto:</span>
                       <input 
                         type="text" 
                         placeholder="Buscar por nombre o DNI..."
                         value={campaignSpecificSearch}
                         onChange={e => {
                           setCampaignSpecificSearch(e.target.value);
                           setShowSpecificSuggestions(true);
                           if (campaignSpecificId) setCampaignSpecificId('');
                         }}
                         onFocus={() => setShowSpecificSuggestions(true)}
                         className="bg-slate-100 border border-slate-200 text-xs font-bold text-slate-700 px-3 py-1.5 rounded-md outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 min-w-[250px]"
                       />
                       {showSpecificSuggestions && campaignSpecificSearch && (
                         <div className="absolute top-full left-[75px] w-[300px] mt-1 bg-white border border-slate-200 rounded-md shadow-lg max-h-48 overflow-y-auto z-50">
                           {prospects
                             .filter(p => p.correo && (p.nombre.toLowerCase().includes(campaignSpecificSearch.toLowerCase()) || p.dni.includes(campaignSpecificSearch)))
                             .slice(0, 10)
                             .map(p => (
                               <div 
                                 key={p.id} 
                                 className="px-3 py-2 text-xs cursor-pointer hover:bg-slate-50 border-b border-slate-50 last:border-0"
                                 onClick={() => {
                                   setCampaignSpecificId(p.id);
                                   setCampaignSpecificSearch(`${p.nombre} (${p.dni})`);
                                   setShowSpecificSuggestions(false);
                                 }}
                               >
                                 <div className="font-bold text-slate-700">{p.nombre}</div>
                                 <div className="font-mono text-[10px] text-slate-500 mt-0.5">{p.dni} | {p.correo}</div>
                               </div>
                           ))}
                           {prospects.filter(p => p.correo && (p.nombre.toLowerCase().includes(campaignSpecificSearch.toLowerCase()) || p.dni.includes(campaignSpecificSearch))).length === 0 && (
                             <div className="px-3 py-4 text-xs text-slate-500 text-center italic">No se encontraron resultados</div>
                           )}
                         </div>
                       )}
                    </div>
                  ) : (
                    <>
                      <span className="text-[10px] font-bold text-slate-500 ml-2">Modalidad:</span>
                      <select value={campaignModality} onChange={e => setCampaignModality(e.target.value)} className="bg-slate-100 border border-slate-200 text-xs font-bold text-slate-700 px-2 py-1 rounded-md outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500">
                        <option value="Todas">Todas</option>
                        {['Ordinario', 'Primera Oportunidad', 'Dirimente', 'CEPRU', 'Discapacitados', 'Víctimas', 'Deportistas', 'Traslados Internos', 'Traslados Externos', 'Graduados'].map(mod => (
                          <option key={mod} value={mod}>{mod}</option>
                        ))}
                      </select>
                    </>
                  )}
                </div>
              </div>
              <button onClick={() => setIsEmailModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            
            <div className="p-6 flex-1 overflow-y-auto flex flex-col gap-4">
               <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 flex flex-col gap-2">
                 <label className="text-[10px] font-bold text-amber-800 uppercase">Vincular Evento del Calendario</label>
                 <select value={selectedEventId} onChange={e => setSelectedEventId(e.target.value)} className="bg-white border border-amber-200 text-xs font-bold text-amber-900 px-3 py-2 rounded-lg outline-none focus:border-amber-500 w-full">
                    <option value="Ninguno">No vincular ningún evento</option>
                    {upcomingEvents.map(ev => (
                      <option key={ev.id} value={ev.id}>{ev.title} ({new Date(ev.start_date).toLocaleDateString()})</option>
                    ))}
                 </select>
               </div>

               <div className="bg-indigo-50 text-indigo-800 p-4 rounded-xl text-[11px] font-medium border border-indigo-100">
                  <span className="font-bold flex items-center gap-2 mb-2"><span className="material-symbols-outlined text-[16px]">info</span> Variables Soportadas:</span>
                  <div className="flex flex-wrap gap-2 text-indigo-900 bg-indigo-100/50 p-2 rounded-lg">
                    <code>{'{nombre}'}</code>
                    <code>{'{carrera_interes}'}</code>
                    {selectedEventId !== 'Ninguno' && (
                      <>
                        <code>{'{evento_titulo}'}</code>
                        <code>{'{evento_fecha}'}</code>
                        <code>{'{evento_proceso}'}</code>
                      </>
                    )}
                  </div>
                  <div className="mt-2 text-[10px] opacity-80">Puedes usar <code>**texto**</code> para hacer negritas.</div>
               </div>

               <label className="flex flex-col gap-1 mt-2">
                    <span className="text-[10px] font-black text-slate-500 uppercase">Asunto del Correo</span>
                    <input type="text" required value={emailSubject} onChange={e => setEmailSubject(e.target.value)} className="h-11 px-4 rounded-xl border border-slate-200 bg-slate-50 font-medium text-sm outline-none focus:border-indigo-500 focus:bg-white transition-all" />
                </label>

                <label className="flex flex-col gap-1 flex-1">
                    <span className="text-[10px] font-black text-slate-500 uppercase">Cuerpo / Mensaje</span>
                    <textarea 
                       required 
                       value={emailBody} 
                       onChange={e => setEmailBody(e.target.value)} 
                       className="flex-1 min-h-[150px] p-4 rounded-xl border border-slate-200 bg-slate-50 font-medium text-sm outline-none focus:border-indigo-500 focus:bg-white transition-all resize-none font-mono" 
                    />
                </label>

                <div className="flex flex-col gap-2 p-4 bg-slate-50 border border-slate-200 rounded-xl shrink-0">
                  <span className="text-[10px] font-black text-slate-500 uppercase flex items-center gap-2">
                    <span className="material-symbols-outlined text-[14px]">attach_file</span> 
                    Archivo Adjunto
                  </span>
                  <div className="flex items-center gap-3">
                    <label className="cursor-pointer px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-lg text-xs font-bold hover:bg-slate-100 transition-colors">
                      Elegir Archivo PDF / Imagen
                      <input type="file" accept=".pdf,image/png,image/jpeg" onChange={handleAttachmentSelect} className="hidden" />
                    </label>
                    {emailAttachment && (
                      <div className="flex items-center gap-2 text-xs font-bold text-indigo-700 bg-indigo-50 px-3 py-1.5 rounded-lg border border-indigo-100">
                        {emailAttachment.name}
                        <button type="button" onClick={() => setEmailAttachment(null)} className="text-indigo-400 hover:text-indigo-600">
                          <span className="material-symbols-outlined text-[14px]">close</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
            </div>
            
            <div className="px-6 py-4 border-t border-slate-100 flex gap-3 justify-between bg-slate-50 shrink-0">
               <div className="text-[10px] font-bold text-slate-500 py-2">
                 Se enviará a: <span className="font-black text-indigo-600">{
                   campaignTarget === 'Especifico' ? 
                     (prospects.find(p => p.id === campaignSpecificId)?.correo ? 1 : 0) : 
                     filteredProspects.filter(p => {
                        if (!p.correo || p.suscrito === false) return false;
                        if (campaignTarget === 'Pendientes' && p.estado_contacto !== 'Pendiente') return false;
                        if (campaignModality !== 'Todas' && (!p.modalidades_interes || !p.modalidades_interes.includes(campaignModality))) return false;
                        return true;
                     }).length
                 } prospectos <span className="text-slate-400 font-normal">(aplicando filtros de tabla y campaña)</span></span>
               </div>
               <div className="flex gap-2">
                  <button type="button" onClick={() => { setIsEmailModalOpen(false); setEmailAttachment(null); }} className="px-5 py-2.5 rounded-xl text-xs font-bold text-slate-600 bg-white border border-slate-200 hover:bg-slate-100 transition-colors">
                    Cancelar
                  </button>
                  <button type="button" onClick={handleSendEmails} disabled={loading || (campaignTarget === 'Especifico' ? !prospects.find(p => p.id === campaignSpecificId)?.correo : filteredProspects.filter(p => {
                    if (!p.correo || p.suscrito === false) return false;
                    if (campaignTarget === 'Pendientes' && p.estado_contacto !== 'Pendiente') return false;
                    if (campaignModality !== 'Todas' && (!p.modalidades_interes || !p.modalidades_interes.includes(campaignModality))) return false;
                    return true;
                  }).length === 0)} className="px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 shadow-md shadow-indigo-200 transition-all disabled:opacity-50 flex items-center gap-2">
                    <span className="material-symbols-outlined text-[16px]">send</span> Enviar Correos
                  </button>
               </div>
            </div>
          </div>
        </div>
      )}

      {/* Ingresos Modal */}
      {viewingIngresos && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[85vh]">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 shrink-0">
              <h3 className="font-black text-slate-800 uppercase tracking-tighter">Historial de Ingresos</h3>
              <button onClick={() => setViewingIngresos(null)} className="text-slate-400 hover:text-slate-600">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className="p-6 flex-1 overflow-y-auto flex flex-col gap-6 bg-slate-50">
              <div className="flex items-center justify-between bg-indigo-600 text-white p-6 rounded-2xl shadow-lg">
                <div>
                  <h4 className="text-xl font-black">{viewingIngresos[0]?.NOMBRE}</h4>
                  <p className="text-indigo-200 text-xs font-bold font-mono tracking-widest uppercase mt-1">DNI: {viewingIngresos[0]?.CODPOSTULANTE}</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-indigo-300 font-bold uppercase tracking-widest">Total Ingresos</p>
                  <p className="text-3xl font-black">{viewingIngresos.filter(i => parseFloat(i.NOTA) > 0).length}</p>
                </div>
              </div>

              <div className="flex flex-col gap-4">
                {viewingIngresos.filter(i => parseFloat(i.NOTA) > 0).map((ingreso, index) => (
                  <div key={index} className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5 animate-in fade-in slide-in-from-bottom-4" style={{ animationDelay: `${index * 100}ms` }}>
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
                      <div>
                        <span className="px-2.5 py-1 bg-yellow-100 text-yellow-800 text-[10px] font-black uppercase tracking-widest rounded-md border border-yellow-200 mb-2 inline-block">
                          {ingreso.ANIO} - {ingreso.SEMESTRE}
                        </span>
                        <h5 className="font-black text-slate-800 text-lg uppercase leading-tight">{ingreso.CARRERA}</h5>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Puntaje</p>
                        <p className="font-bold text-xl text-indigo-600">{ingreso.NOTA}</p>
                      </div>
                    </div>
                    <div className="pt-4 border-t border-slate-100 flex items-center gap-2">
                       <span className="material-symbols-outlined text-slate-400 text-[16px]">school</span>
                       <span className="text-xs font-bold text-slate-600 uppercase tracking-wide">{ingreso.MODALIDAD}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tests Modal */}
      {viewingTests && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[85vh]">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 shrink-0">
              <h3 className="font-black text-slate-800 uppercase tracking-tighter">Historial de Test Vocacionales</h3>
              <button onClick={() => setViewingTests(null)} className="text-slate-400 hover:text-slate-600">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className="p-6 flex-1 overflow-y-auto flex flex-col gap-8 bg-slate-50">
              <div className="flex items-center justify-between bg-indigo-600 text-white p-6 rounded-2xl shadow-lg">
                <div>
                  <h4 className="text-xl font-black">{viewingTests.nombre}</h4>
                  <p className="text-indigo-200 text-xs font-bold font-mono tracking-widest uppercase mt-1">DNI: {viewingTests.dni}</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-indigo-300 font-bold uppercase tracking-widest">Total Tests Completados</p>
                  <p className="text-3xl font-black">{viewingTests.resultados_test?.length || 0}</p>
                </div>
              </div>

              <div className="flex flex-col gap-6">
                {(viewingTests.resultados_test || []).map((test, index) => (
                  <div key={test.id || index} className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden animate-in fade-in slide-in-from-bottom-4" style={{ animationDelay: `${index * 100}ms` }}>
                    <div className="bg-slate-50 px-6 py-4 border-b border-slate-100 flex justify-between items-center">
                      <div className="flex items-center gap-3">
                        <span className="material-symbols-outlined text-indigo-500">assignment_turned_in</span>
                        <h5 className="font-black text-slate-800 uppercase tracking-widest">
                          Perfil: <span className="text-indigo-600 text-lg">{test.perfil}</span>
                        </h5>
                      </div>
                      <span className="text-xs font-bold text-slate-500">
                        {format(new Date(test.fecha), "dd 'de' MMMM, yyyy", { locale: es })}
                      </span>
                    </div>

                    <div className="p-6 flex flex-col md:flex-row gap-8">
                      <div className="flex-1 flex flex-col gap-4">
                        <h6 className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-2">Áreas Dominantes</h6>
                        <div className="flex flex-col gap-3">
                          {test.areas?.map((area, i) => (
                            <div key={i} className="flex flex-col gap-1">
                              <div className="flex justify-between items-end">
                                <span className="text-xs font-bold text-slate-700">{area.nombre}</span>
                                <span className="text-[10px] font-black text-slate-400">{area.porcentaje}% • {area.nivel}</span>
                              </div>
                              <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                                <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${area.porcentaje}%` }}></div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="flex-[1.5] border-t md:border-t-0 md:border-l border-slate-100 pt-6 md:pt-0 md:pl-8 flex flex-col gap-4">
                         <h6 className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-2">Escuelas Promedio Recomendadas</h6>
                         <div className="flex flex-col gap-4">
                           {test.escuelas_recomendadas?.map((rec, i) => (
                             <div key={i} className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                               <div className="flex justify-between items-center mb-2">
                                 <h6 className="font-black text-sm text-slate-800">{rec.area}</h6>
                                 <span className="px-2 py-0.5 rounded text-[10px] font-black bg-indigo-100 text-indigo-700">
                                   Compatibilidad: {rec.compatibilidad}%
                                 </span>
                               </div>
                               <p className="text-xs text-slate-600 leading-relaxed font-medium">
                                 {rec.carreras}
                               </p>
                             </div>
                           ))}
                         </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Sending Progress Overlay */}
      {sendingProgress.isSending && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-md">
          <div className="bg-white rounded-3xl shadow-2xl p-8 max-w-md w-full flex flex-col items-center text-center">
            <span className="material-symbols-outlined text-4xl text-indigo-600 animate-bounce mb-4">mail</span>
            <h3 className="font-black text-slate-800 text-xl tracking-tight mb-2">Enviando Campaña...</h3>
            <p className="text-sm font-bold text-slate-500 mb-6">
              Por favor, no cierres esta ventana hasta que el envío finalice.
            </p>
            
            <div className="w-full bg-slate-100 h-3 rounded-full overflow-hidden mb-3">
              <div 
                className="bg-indigo-600 h-full rounded-full transition-all duration-300 ease-out"
                style={{ width: `${(sendingProgress.current / sendingProgress.total) * 100}%` }}
              ></div>
            </div>
            
            <div className="flex justify-between w-full text-xs font-black text-slate-400 uppercase tracking-widest">
              <span>{sendingProgress.current} enviados</span>
              <span>{sendingProgress.total} totales</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
