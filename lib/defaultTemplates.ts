export interface OfficialTemplateDefinition {
  id: string;
  name: string;
  description: string;
  category: 'Certificados' | 'Admisión' | 'Varios';
  thumbnail: string;
  content: string;
  lastModified?: string;
}

// Las 5 Plantillas Oficiales Aprobadas de la Dirección de Admisión UNSAAC (Tabla 'templates')
export const DEFAULT_OFFICIAL_TEMPLATES: OfficialTemplateDefinition[] = [
  {
    id: '13b05103-3352-4c74-a2a4-28af259fe001',
    name: 'INFORME DE INCLUSIÓN DE DATOS',
    description: 'Informe técnico oficial para la inclusión y registro de postulantes en la base de datos de Centro de Cómputo.',
    category: 'Admisión',
    thumbnail: 'https://placehold.co/400x500/1e293b/ffffff?text=INFORME+INCLUSIÓN',
    lastModified: '9/7/2026',
    content: `<div style="width: 100%; height: 100%; position: relative; font-family: 'Arial', sans-serif; color: #333; font-size: 13px; line-height: 1.5; box-sizing: border-box; overflow: hidden; padding: 35px 40px;">
    <!-- Encabezado Institucional -->
    <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #7b1523; padding-bottom: 12px; margin-bottom: 25px;">
        <div style="display: flex; align-items: center; gap: 15px;">
            <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/b/b8/Coat_of_arms_of_Cusco.svg/600px-Coat_of_arms_of_Cusco.svg.png" style="height: 55px;" />
            <div>
                <h2 style="margin: 0; font-size: 16px; color: #7b1523; font-family: 'Times New Roman', serif; font-weight: bold; text-transform: uppercase;">UNIVERSIDAD NACIONAL DE SAN ANTONIO ABAD DEL CUSCO</h2>
                <p style="margin: 2px 0 0 0; font-size: 12px; color: #444; font-weight: bold; letter-spacing: 1px;">DIRECCIÓN DE ADMISIÓN</p>
            </div>
        </div>
        <div style="text-align: right; color: #7b1523; font-size: 11px; font-weight: bold;">
            <span>ÁREA DE TRÁMITE Y SISTEMAS</span>
        </div>
    </div>

    <!-- Título del Documento -->
    <div style="text-align: center; margin-bottom: 25px;">
        <h3 style="margin: 0; font-size: 15px; font-weight: bold; text-decoration: underline; text-transform: uppercase; color: #111;">
            INFORME TÉCNICO N° {{INFORME}}-DA-UNSAAC
        </h3>
    </div>

    <!-- Metadatos del Informe -->
    <table style="width: 100%; margin-bottom: 22px; font-size: 13px; border-collapse: collapse;">
        <tr>
            <td style="width: 90px; vertical-align: top; font-weight: bold; padding: 4px 0;">DE</td>
            <td style="width: 15px; vertical-align: top; padding: 4px 0;">:</td>
            <td style="vertical-align: top; padding: 4px 0;">
                <b>DR. DOMINGO GONZALES GALLEGOS</b><br>
                <span style="font-size: 11px; color: #555;">Director de la Dirección de Admisión</span>
            </td>
        </tr>
        <tr>
            <td style="vertical-align: top; font-weight: bold; padding: 4px 0;">A</td>
            <td style="vertical-align: top; padding: 4px 0;">:</td>
            <td style="vertical-align: top; padding: 4px 0;">
                <b>ING. AGUEDO HUAMANI HUAYHUA</b><br>
                <span style="font-size: 11px; color: #555;">Jefe de la Unidad de Centro de Cómputo de la UNSAAC</span>
            </td>
        </tr>
        <tr>
            <td style="font-weight: bold; padding: 4px 0;">REF.</td>
            <td style="padding: 4px 0;">:</td>
            <td style="padding: 4px 0;">Expediente N° <b>{{EXP}}</b></td>
        </tr>
        <tr>
            <td style="font-weight: bold; padding: 4px 0;">ASUNTO</td>
            <td style="padding: 4px 0;">:</td>
            <td style="padding: 4px 0; font-weight: bold; color: #7b1523;">INCLUSIÓN DE DATOS EN LA BASE DE ADMISIÓN</td>
        </tr>
        <tr>
            <td style="font-weight: bold; padding: 4px 0;">FECHA</td>
            <td style="padding: 4px 0;">:</td>
            <td style="padding: 4px 0;">Cusco, {{fecha_actual}}</td>
        </tr>
    </table>

    <div style="border-top: 1px solid #ddd; margin-bottom: 18px;"></div>

    <!-- Cuerpo -->
    <div style="text-align: justify; margin-bottom: 20px; font-size: 13px; line-height: 1.6;">
        <p style="margin-bottom: 14px;">
            Por medio del presente me dirijo a usted para saludarlo cordialmente y a la vez remitir el expediente de inclusión de datos del estudiante <b>{{nombres}} {{apellidos}}</b>, quien participó en el Proceso de Admisión <b>{{semestre}}</b>, modalidad <b>{{modalidad}}</b>, con código de postulante <b>{{codigo}}</b> para la Escuela Profesional de <b>{{escuela}}</b>.
        </p>
        <p style="margin-bottom: 14px;">
            Habiéndose verificado las Actas Físicas de Resultados y el Padrón Oficial que obran en esta Dirección, se constata que el administrado obtuvo el puntaje de <b>{{nota}}</b> y el Orden de Mérito N° <b>{{omerito}}</b>, por lo que corresponde su debida inclusión en el sistema académico.
        </p>
    </div>

    <!-- Tabla Detalle -->
    <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 12px;">
        <tr style="background: #f8fafc;">
            <th style="border: 1px solid #333; padding: 6px 10px; text-align: left; width: 35%;">DATOS A INCLUIR</th>
            <th style="border: 1px solid #333; padding: 6px 10px; text-align: left;">DETALLE REGISTRAL</th>
        </tr>
        <tr>
            <td style="border: 1px solid #333; padding: 6px 10px; font-weight: bold;">Postulante / Ingresante</td>
            <td style="border: 1px solid #333; padding: 6px 10px;">{{nombres}} {{apellidos}}</td>
        </tr>
        <tr>
            <td style="border: 1px solid #333; padding: 6px 10px; font-weight: bold;">Código / DNI</td>
            <td style="border: 1px solid #333; padding: 6px 10px;">{{codigo}}</td>
        </tr>
        <tr>
            <td style="border: 1px solid #333; padding: 6px 10px; font-weight: bold;">Escuela Profesional</td>
            <td style="border: 1px solid #333; padding: 6px 10px;">{{escuela}}</td>
        </tr>
        <tr>
            <td style="border: 1px solid #333; padding: 6px 10px; font-weight: bold;">Recibo de Pago / Boucher</td>
            <td style="border: 1px solid #333; padding: 6px 10px;">{{BOUCHER}}</td>
        </tr>
    </table>

    <p style="margin-bottom: 30px; font-size: 13px;">
        Es cuanto informo a usted para su conocimiento y fines consiguientes.
    </p>

    <!-- Pie de Firma -->
    <div style="margin-top: 40px; display: flex; justify-content: flex-end;">
        <div style="text-align: center; width: 260px;">
            <div style="border-top: 1px solid #000; padding-top: 5px;">
                <p style="margin: 0; font-weight: bold; font-size: 12px; color: #7b1523;">Dr. Domingo Gonzales Gallegos</p>
                <p style="margin: 0; font-size: 10px; color: #444;">DIRECTOR DE LA DIRECCIÓN DE ADMISIÓN</p>
                <p style="margin: 0; font-size: 9px; color: #777;">UNSAAC</p>
            </div>
        </div>
    </div>
</div>`
  },
  {
    id: '7dcac6d8-42fe-44a7-907b-95477c157002',
    name: 'CONSTANCIA DE INGRESO',
    description: 'Constancia oficial de ingreso a la UNSAAC con barra lateral granate, marca de agua, firmas institucionales y detalles de mérito.',
    category: 'Certificados',
    thumbnail: 'https://placehold.co/400x500/7b1523/ffffff?text=CONSTANCIA+DE+INGRESO',
    lastModified: '15/7/2026',
    content: `<div style="width: 100%; height: 100%; border: 1px solid #ccc; display: flex; font-family: 'Poppins', sans-serif; background: white; position: relative; box-sizing: border-box; overflow: hidden;">
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
                    Que, Don(ña): <b style="font-size: 14px; color: #000; font-weight: 700;">{{nombres}} {{apellidos}}</b>, INGRESÓ a la UNIVERSIDAD NACIONAL DE SAN ANTONIO ABAD DEL CUSCO, a la Escuela Profesional de: <b style="color: #7b1523; font-weight: 700;">{{escuela}}</b> el <b>{{fecha_ingreso}}</b>, bajo la modalidad de <b>{{modalidad}}</b> cumpliendo con las exigencias del Reglamento de Admisión del año <b>{{anio}}</b>, con el siguiente detalle:
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
                     <p style="font-size: 9px; font-weight: 800; margin: 0; color: #7b1523;">Lic. LAURA SAMUDIO GONZALES</p>
                     <p style="font-size: 8px; margin: 0; color: #555;">Jefa Administrativa de la Dirección de Admisión</p>
                 </div>
             </div>

             <div style="display: flex; justify-content: space-between; font-size: 8px; font-weight: 700; border-top: 2px solid #7b1523; padding-top: 6px; color: #555;">
                 <span>Recibo de Pago N°. {{BOUCHER}}</span>
                 <span>Expediente N° {{EXP}}</span>
                 <span>Usuario: JCH / SISTEMA</span>
             </div>
        </div>
    </div>
</div>`
  },
  {
    id: '7fbb8db2-c5dc-46a2-b50f-96745bd40003',
    name: 'RECTIFICACIÓN DE DATOS JUDICIAL',
    description: 'Informe técnico de rectificación de datos personales ordenado por mandato judicial / resolución de juzgado.',
    category: 'Admisión',
    thumbnail: 'https://placehold.co/400x500/1e293b/ffffff?text=RECTIFICACIÓN+JUDICIAL',
    lastModified: '15/7/2026',
    content: `<div style="width: 100%; height: 100%; position: relative; font-family: 'Arial', sans-serif; color: #333; font-size: 13px; line-height: 1.5; box-sizing: border-box; overflow: hidden; padding: 35px 40px;">
    <!-- Encabezado Institucional -->
    <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #7b1523; padding-bottom: 12px; margin-bottom: 25px;">
        <div style="display: flex; align-items: center; gap: 15px;">
            <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/b/b8/Coat_of_arms_of_Cusco.svg/600px-Coat_of_arms_of_Cusco.svg.png" style="height: 55px;" />
            <div>
                <h2 style="margin: 0; font-size: 16px; color: #7b1523; font-family: 'Times New Roman', serif; font-weight: bold; text-transform: uppercase;">UNIVERSIDAD NACIONAL DE SAN ANTONIO ABAD DEL CUSCO</h2>
                <p style="margin: 2px 0 0 0; font-size: 12px; color: #444; font-weight: bold; letter-spacing: 1px;">DIRECCIÓN DE ADMISIÓN</p>
            </div>
        </div>
        <div style="text-align: right; color: #7b1523; font-size: 11px; font-weight: bold;">
            <span>MANDATO JUDICIAL</span>
        </div>
    </div>

    <!-- Título del Documento -->
    <div style="text-align: center; margin-bottom: 25px;">
        <h3 style="margin: 0; font-size: 15px; font-weight: bold; text-decoration: underline; text-transform: uppercase; color: #111;">
            INFORME N° {{INFORME}}-DA-UNSAAC (JUDICIAL)
        </h3>
    </div>

    <!-- Metadatos del Informe -->
    <table style="width: 100%; margin-bottom: 22px; font-size: 13px; border-collapse: collapse;">
        <tr>
            <td style="width: 90px; vertical-align: top; font-weight: bold; padding: 4px 0;">DE</td>
            <td style="width: 15px; vertical-align: top; padding: 4px 0;">:</td>
            <td style="vertical-align: top; padding: 4px 0;">
                <b>DR. DOMINGO GONZALES GALLEGOS</b><br>
                <span style="font-size: 11px; color: #555;">Director de la Dirección de Admisión</span>
            </td>
        </tr>
        <tr>
            <td style="vertical-align: top; font-weight: bold; padding: 4px 0;">A</td>
            <td style="vertical-align: top; padding: 4px 0;">:</td>
            <td style="vertical-align: top; padding: 4px 0;">
                <b>ING. AGUEDO HUAMANI HUAYHUA</b><br>
                <span style="font-size: 11px; color: #555;">Jefe de la Unidad de Centro de Cómputo de la UNSAAC</span>
            </td>
        </tr>
        <tr>
            <td style="font-weight: bold; padding: 4px 0;">REF.</td>
            <td style="padding: 4px 0;">:</td>
            <td style="padding: 4px 0;">Expediente N° <b>{{EXP}}</b> / Mandato Judicial</td>
        </tr>
        <tr>
            <td style="font-weight: bold; padding: 4px 0;">ASUNTO</td>
            <td style="padding: 4px 0;">:</td>
            <td style="padding: 4px 0; font-weight: bold; color: #7b1523;">RECTIFICACIÓN DE DATOS POR MANDATO JUDICIAL</td>
        </tr>
        <tr>
            <td style="font-weight: bold; padding: 4px 0;">FECHA</td>
            <td style="padding: 4px 0;">:</td>
            <td style="padding: 4px 0;">Cusco, {{fecha_actual}}</td>
        </tr>
    </table>

    <div style="border-top: 1px solid #ddd; margin-bottom: 18px;"></div>

    <!-- Cuerpo -->
    <div style="text-align: justify; margin-bottom: 20px; font-size: 13px; line-height: 1.6;">
        <p style="margin-bottom: 14px;">
            Por medio del presente, la Dirección de Admisión eleva a su Despacho el informe de rectificación de datos personales en cumplimiento estricto a la Sentencia / Mandato Judicial remitido en autos del administrado con código de postulante N° <b>{{codigo}}</b>.
        </p>
        <p style="margin-bottom: 14px;">
            El recurrente ingresó a la Escuela Profesional de <b>{{escuela}}</b> en la modalidad <b>{{modalidad}}</b>. Por consiguiente, se solicita la modificación registral en la Base de Datos institucional conforme al siguiente cuadro:
        </p>
    </div>

    <!-- Tabla Dice / Debe Decir -->
    <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 13px;">
        <tr>
            <td style="border: 1px solid #000; padding: 8px 12px; width: 30%; font-weight: bold; background: #fafafa;">DICE</td>
            <td style="border: 1px solid #000; padding: 8px 12px;">{{nombres}} {{apellidos}}</td>
        </tr>
        <tr>
            <td style="border: 1px solid #000; padding: 8px 12px; font-weight: bold; background: #fafafa; color: #7b1523;">DEBE DECIR</td>
            <td style="border: 1px solid #000; padding: 8px 12px; font-weight: bold; color: #7b1523;">{{NOMBRECORRE}}</td>
        </tr>
    </table>

    <p style="margin-bottom: 30px; font-size: 13px;">
        Se adjunta copia de la resolución judicial, copia de DNI y recibo de pago N° {{BOUCHER}}. Es cuanto informo a usted para su ejecución inmediata.
    </p>

    <!-- Firma -->
    <div style="margin-top: 40px; display: flex; justify-content: flex-end;">
        <div style="text-align: center; width: 260px;">
            <div style="border-top: 1px solid #000; padding-top: 5px;">
                <p style="margin: 0; font-weight: bold; font-size: 12px; color: #7b1523;">Dr. Domingo Gonzales Gallegos</p>
                <p style="margin: 0; font-size: 10px; color: #444;">DIRECTOR DE LA DIRECCIÓN DE ADMISIÓN</p>
                <p style="margin: 0; font-size: 9px; color: #777;">UNSAAC</p>
            </div>
        </div>
    </div>
</div>`
  },
  {
    id: '9bd46bdd-40ba-4b39-8c06-39562ea00004',
    name: 'INFORME DE RECTIFICACIÓN',
    description: 'Informe técnico administrativo para corrección y rectificación de datos personales en el sistema.',
    category: 'Admisión',
    thumbnail: 'https://placehold.co/400x500/1e293b/ffffff?text=INFORME+DE+RECTIFICACIÓN',
    lastModified: '15/7/2026',
    content: `<div style="width: 100%; height: 100%; position: relative; font-family: 'Arial', sans-serif; color: #333; font-size: 13px; line-height: 1.5; box-sizing: border-box; overflow: hidden; padding: 35px 40px;">
    <!-- Encabezado Institucional -->
    <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #7b1523; padding-bottom: 12px; margin-bottom: 25px;">
        <div style="display: flex; align-items: center; gap: 15px;">
            <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/b/b8/Coat_of_arms_of_Cusco.svg/600px-Coat_of_arms_of_Cusco.svg.png" style="height: 55px;" />
            <div>
                <h2 style="margin: 0; font-size: 16px; color: #7b1523; font-family: 'Times New Roman', serif; font-weight: bold; text-transform: uppercase;">UNIVERSIDAD NACIONAL DE SAN ANTONIO ABAD DEL CUSCO</h2>
                <p style="margin: 2px 0 0 0; font-size: 12px; color: #444; font-weight: bold; letter-spacing: 1px;">DIRECCIÓN DE ADMISIÓN</p>
            </div>
        </div>
        <div style="text-align: right; color: #7b1523; font-size: 11px; font-weight: bold;">
            <span>RECTIFICACIÓN ADMINISTRATIVA</span>
        </div>
    </div>

    <!-- Título del Documento -->
    <div style="text-align: center; margin-bottom: 25px;">
        <h3 style="margin: 0; font-size: 15px; font-weight: bold; text-decoration: underline; text-transform: uppercase; color: #111;">
            {{INFORME}}-DA-UNSAAC
        </h3>
    </div>

    <!-- Metadatos del Informe -->
    <table style="width: 100%; margin-bottom: 22px; font-size: 13px; border-collapse: collapse;">
        <tr>
            <td style="width: 90px; vertical-align: top; font-weight: bold; padding: 4px 0;">DE</td>
            <td style="width: 15px; vertical-align: top; padding: 4px 0;">:</td>
            <td style="vertical-align: top; padding: 4px 0;">
                <b>DR. DOMINGO GONZALES GALLEGOS</b><br>
                <span style="font-size: 11px; color: #555;">Director de la Dirección de Admisión</span>
            </td>
        </tr>
        <tr>
            <td style="vertical-align: top; font-weight: bold; padding: 4px 0;">A</td>
            <td style="vertical-align: top; padding: 4px 0;">:</td>
            <td style="vertical-align: top; padding: 4px 0;">
                <b>ING. AGUEDO HUAMANI HUAYHUA</b><br>
                <span style="font-size: 11px; color: #555;">Jefe de la Unidad de Centro de Cómputo de la UNSAAC</span>
            </td>
        </tr>
        <tr>
            <td style="font-weight: bold; padding: 4px 0;">REF.</td>
            <td style="padding: 4px 0;">:</td>
            <td style="padding: 4px 0;">Expediente N° <b>{{EXP}}</b></td>
        </tr>
        <tr>
            <td style="font-weight: bold; padding: 4px 0;">ASUNTO</td>
            <td style="padding: 4px 0;">:</td>
            <td style="padding: 4px 0; font-weight: bold; color: #7b1523;">SOLICITA RECTIFICACIÓN DE DATOS</td>
        </tr>
        <tr>
            <td style="font-weight: bold; padding: 4px 0;">FECHA</td>
            <td style="padding: 4px 0;">:</td>
            <td style="padding: 4px 0;">Cusco, {{fecha_actual}}</td>
        </tr>
    </table>

    <div style="border-top: 1px solid #ddd; margin-bottom: 18px;"></div>

    <!-- Cuerpo -->
    <div style="text-align: justify; margin-bottom: 20px; font-size: 13px; line-height: 1.6;">
        <p style="margin-bottom: 14px;">
            Por medio del presente, la Dirección de Admisión tiene a bien presentar a su consideración el informe de rectificación de datos personales del estudiante <b>{{nombres}} {{apellidos}}</b>, identificado con código N° <b>{{codigo}}</b>.
        </p>
        <p style="margin-bottom: 14px;">
            El estudiante antes mencionado solicita la rectificación de: <b>{{MOTIVO}}</b> en la base de datos de Centro de Cómputo.
        </p>
        <p style="margin-bottom: 14px;">
            Según los registros de la Dirección de Admisión, el(la) estudiante ingresó a la Escuela Profesional de <b>{{escuela}}</b> en la modalidad <b>{{modalidad}}</b> bajo el nombre de <b>{{nombres}} {{apellidos}}</b>. Tal como consta en los documentos que obran en esta Dependencia, por lo que se solicita la actualización de los registros académicos con los siguientes datos:
        </p>
    </div>

    <!-- Tabla Dice / Debe Decir -->
    <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 13px;">
        <tr>
            <td style="border: 1px solid #000; padding: 8px 12px; width: 30%; font-weight: bold; background: #fafafa;">DICE</td>
            <td style="border: 1px solid #000; padding: 8px 12px;">{{nombres}} {{apellidos}}</td>
        </tr>
        <tr>
            <td style="border: 1px solid #000; padding: 8px 12px; font-weight: bold; background: #fafafa; color: #7b1523;">DEBE DECIR</td>
            <td style="border: 1px solid #000; padding: 8px 12px; font-weight: bold; color: #7b1523;">{{NOMBRECORRE}}</td>
        </tr>
    </table>

    <p style="margin-bottom: 30px; font-size: 13px;">
        Se adjunta recibo de pago N° {{BOUCHER}} y una copia del DNI del estudiante. Es cuanto informo a usted para su conocimiento y fines consiguientes.
    </p>

    <!-- Firma -->
    <div style="margin-top: 40px; display: flex; justify-content: flex-end;">
        <div style="text-align: center; width: 260px;">
            <div style="border-top: 1px solid #000; padding-top: 5px;">
                <p style="margin: 0; font-weight: bold; font-size: 12px; color: #7b1523;">Dr. Domingo Gonzales Gallegos</p>
                <p style="margin: 0; font-size: 10px; color: #444;">DIRECTOR DE LA DIRECCIÓN DE ADMISIÓN</p>
                <p style="margin: 0; font-size: 9px; color: #777;">UNSAAC</p>
            </div>
        </div>
    </div>
</div>`
  },
  {
    id: 'c6c55255-3da6-4cb3-904c-adbc61000005',
    name: 'INFORME DE RENUNCIA',
    description: 'Informe técnico oficial para trámite de renuncia voluntaria a vacante de ingreso a la UNSAAC.',
    category: 'Admisión',
    thumbnail: 'https://placehold.co/400x500/1e293b/ffffff?text=INFORME+DE+RENUNCIA',
    lastModified: '22/6/2026',
    content: `<div style="width: 100%; height: 100%; position: relative; font-family: 'Arial', sans-serif; color: #333; font-size: 13px; line-height: 1.5; box-sizing: border-box; overflow: hidden; padding: 35px 40px;">
    <!-- Encabezado Institucional -->
    <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #7b1523; padding-bottom: 12px; margin-bottom: 25px;">
        <div style="display: flex; align-items: center; gap: 15px;">
            <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/b/b8/Coat_of_arms_of_Cusco.svg/600px-Coat_of_arms_of_Cusco.svg.png" style="height: 55px;" />
            <div>
                <h2 style="margin: 0; font-size: 16px; color: #7b1523; font-family: 'Times New Roman', serif; font-weight: bold; text-transform: uppercase;">UNIVERSIDAD NACIONAL DE SAN ANTONIO ABAD DEL CUSCO</h2>
                <p style="margin: 2px 0 0 0; font-size: 12px; color: #444; font-weight: bold; letter-spacing: 1px;">DIRECCIÓN DE ADMISIÓN</p>
            </div>
        </div>
        <div style="text-align: right; color: #7b1523; font-size: 11px; font-weight: bold;">
            <span>RENUNCIA DE VACANTE</span>
        </div>
    </div>

    <!-- Título del Documento -->
    <div style="text-align: center; margin-bottom: 25px;">
        <h3 style="margin: 0; font-size: 15px; font-weight: bold; text-decoration: underline; text-transform: uppercase; color: #111;">
            INFORME DE RENUNCIA N° {{INFORME}}-DA-UNSAAC
        </h3>
    </div>

    <!-- Metadatos del Informe -->
    <table style="width: 100%; margin-bottom: 22px; font-size: 13px; border-collapse: collapse;">
        <tr>
            <td style="width: 90px; vertical-align: top; font-weight: bold; padding: 4px 0;">DE</td>
            <td style="width: 15px; vertical-align: top; padding: 4px 0;">:</td>
            <td style="vertical-align: top; padding: 4px 0;">
                <b>DR. DOMINGO GONZALES GALLEGOS</b><br>
                <span style="font-size: 11px; color: #555;">Director de la Dirección de Admisión</span>
            </td>
        </tr>
        <tr>
            <td style="vertical-align: top; font-weight: bold; padding: 4px 0;">A</td>
            <td style="vertical-align: top; padding: 4px 0;">:</td>
            <td style="vertical-align: top; padding: 4px 0;">
                <b>VICERRECTORADO ACADÉMICO / DIRECCIÓN DE SERVICIOS ACADÉMICOS</b>
            </td>
        </tr>
        <tr>
            <td style="font-weight: bold; padding: 4px 0;">REF.</td>
            <td style="padding: 4px 0;">:</td>
            <td style="padding: 4px 0;">Expediente N° <b>{{EXP}}</b> - Solicitud de Renuncia</td>
        </tr>
        <tr>
            <td style="font-weight: bold; padding: 4px 0;">ASUNTO</td>
            <td style="padding: 4px 0;">:</td>
            <td style="padding: 4px 0; font-weight: bold; color: #7b1523;">RENUNCIA VOLUNTARIA A VACANTE DE INGRESO</td>
        </tr>
        <tr>
            <td style="font-weight: bold; padding: 4px 0;">FECHA</td>
            <td style="padding: 4px 0;">:</td>
            <td style="padding: 4px 0;">Cusco, {{fecha_actual}}</td>
        </tr>
    </table>

    <div style="border-top: 1px solid #ddd; margin-bottom: 18px;"></div>

    <!-- Cuerpo -->
    <div style="text-align: justify; margin-bottom: 20px; font-size: 13px; line-height: 1.6;">
        <p style="margin-bottom: 14px;">
            Por medio del presente, la Dirección de Admisión pone en conocimiento que el(la) postulante <b>{{nombres}} {{apellidos}}</b>, identificado(a) con DNI/Código N° <b>{{codigo}}</b>, quien obtuvo vacante de ingreso a la Escuela Profesional de <b>{{escuela}}</b> en el proceso <b>{{semestre}}</b>, modalidad <b>{{modalidad}}</b>, ha presentado su renuncia expresa y voluntaria a la vacante adjudicada.
        </p>
        <p style="margin-bottom: 14px;">
            Revisados los antecedentes y el expediente de referencia N° <b>{{EXP}}</b>, se emite la presente para que se proceda con la anulación de la vacante respectiva y se disponga lo pertinente conforme a la normativa universitaria.
        </p>
    </div>

    <!-- Tabla Resumen -->
    <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 12px;">
        <tr style="background: #f8fafc;">
            <th style="border: 1px solid #333; padding: 6px 10px; text-align: left; width: 35%;">CAMPO</th>
            <th style="border: 1px solid #333; padding: 6px 10px; text-align: left;">DETALLE</th>
        </tr>
        <tr>
            <td style="border: 1px solid #333; padding: 6px 10px; font-weight: bold;">Postulante Renunciante</td>
            <td style="border: 1px solid #333; padding: 6px 10px;">{{nombres}} {{apellidos}}</td>
        </tr>
        <tr>
            <td style="border: 1px solid #333; padding: 6px 10px; font-weight: bold;">Escuela Profesional</td>
            <td style="border: 1px solid #333; padding: 6px 10px;">{{escuela}}</td>
        </tr>
        <tr>
            <td style="border: 1px solid #333; padding: 6px 10px; font-weight: bold;">Puntaje Obtenido</td>
            <td style="border: 1px solid #333; padding: 6px 10px;">{{nota}}</td>
        </tr>
        <tr>
            <td style="border: 1px solid #333; padding: 6px 10px; font-weight: bold;">Recibo de Trámite</td>
            <td style="border: 1px solid #333; padding: 6px 10px;">{{BOUCHER}}</td>
        </tr>
    </table>

    <p style="margin-bottom: 30px; font-size: 13px;">
        Es cuanto informo para los fines de ley correspondientes.
    </p>

    <!-- Firma -->
    <div style="margin-top: 40px; display: flex; justify-content: flex-end;">
        <div style="text-align: center; width: 260px;">
            <div style="border-top: 1px solid #000; padding-top: 5px;">
                <p style="margin: 0; font-weight: bold; font-size: 12px; color: #7b1523;">Dr. Domingo Gonzales Gallegos</p>
                <p style="margin: 0; font-size: 10px; color: #444;">DIRECTOR DE LA DIRECCIÓN DE ADMISIÓN</p>
                <p style="margin: 0; font-size: 9px; color: #777;">UNSAAC</p>
            </div>
        </div>
    </div>
</div>`
  }
];
