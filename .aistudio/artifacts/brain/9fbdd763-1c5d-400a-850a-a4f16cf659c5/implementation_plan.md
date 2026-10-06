# Integración de Variable QR de Verificación y Usuario Emisor en Plantillas UNSAAC

Arquitectura e implementación técnica para incorporar en el módulo de **Gestión de Plantillas** la generación dinámica de **Código QR de Verificación Pública** (con enlace de validación institucional y registro en base de datos) y la variable de **Iniciales del Usuario Emisor** (`{{usuario_iniciales}}`).

---

## Decisiones Críticas y Preferencias Confirmadas

> [!IMPORTANT]
> A partir de la fase de clarificación con el usuario, se han establecido las siguientes definiciones de diseño y negocio:

- **Mecanismo del Código QR**: Al escanearse el QR desde cualquier teléfono o dispositivo, se abrirá un enlace web público de verificación institucional (`/validar/:codigo`) que consulta el registro oficial y despliega la autenticidad de la constancia.
- **Auditoría y Registro en Base de Datos**: Cada vez que se emita o imprima una constancia, se registrará formalmente en una tabla de auditoría (`documentos_verificacion` / `constancias_emitidas`) con su código único de validación (UUID/hash alfanumérico), datos del ingresante, fecha y hora exacta, e identidad del operador.
- **Formato del Usuario Emisor**: Se utilizará la variable estandarizada `{{usuario_iniciales}}`, la cual procesa el nombre del usuario activo (ej. *Jhonatan Choque Caritas* $\rightarrow$ **JCH**) para imprimir sus siglas de control administrativo en el pie del documento.

---

## 1. Visión General del Módulo y Flujo Funcional

El sistema de admisión de la UNSAAC emite constancias de ingreso, informes técnicos y certificados oficiales a postulantes e ingresantes. Este cambio moderniza las plantillas con dos pilares de seguridad documental:

1. **Trazabilidad de Firma Digital y Autenticidad (QR)**: Permite a facultades, unidades de matrícula, empleadores o entidades externas escanear el QR impreso en el papel o PDF para verificar en tiempo real si el documento fue formalmente expedido por la Dirección de Admisión.
2. **Control Interno de Emisión Administrativa**: Permite identificar inmediatamente qué funcionario de ventanilla generó la constancia mediante sus siglas normalizadas en el pie de página (`Usuario: {{usuario_iniciales}}`), erradicando valores estáticos o quemados en código.

---

## 2. Experiencia de Usuario y Diseño de Interfaz

### A. Editor de Plantillas (`TemplateEditor.tsx`)
- **Panel Lateral de Variables**:
  - Incorporación de dos nuevas variables oficiales:
    - `{{codigo_qr}}`: *Código QR de verificación pública y autenticidad*. Al insertarse, inserta un elemento visual de código QR interactivo o token sustituible.
    - `{{usuario_iniciales}}`: *Iniciales del usuario que emite la constancia (ej. JCH)*.
- **Inserción y Posicionamiento**:
  - El QR se puede insertar como un elemento visual arrastrable/redimensionable en el lienzo del documento o dentro de las tablas y pies de página oficiales.
- **Actualización de Plantillas Oficiales Predefinidas**:
  - La plantilla por defecto (`DEFAULT_CONSTANCIA_HTML`) y las 5 plantillas oficiales (`DEFAULT_OFFICIAL_TEMPLATES` en `lib/defaultTemplates.ts`) reemplazarán el texto estático `Usuario: JCH` por la variable dinámica `Usuario: {{usuario_iniciales}}`, agregando el slot del código QR institucional en el bloque de firmas/seguridad.

### B. Portal Público de Verificación (`/validar/:codigo` o `/verificar/:codigo`)
- **Ruta Pública**: Accesible sin requerir autenticación para que cualquier persona o entidad con un lector de QR pueda certificar el documento.
- **Diseño Institucional UNSAAC**:
  - Encabezado con heráldica y colores oficiales de la UNSAAC (granate `#7b1523` y dorado `#e8a134`).
  - Tarjeta de validación de autenticidad:
    - Indicador de estado: **Documento Oficial Válido y Registrado** con sello de seguridad.
    - Código de Verificación Único y Hash de Integridad.
    - Datos del Estudiante: Nombres completos, DNI, Código de Postulante/Estudiante, Escuela Profesional, Modalidad de Ingreso y Proceso de Admisión.
    - Metadatos de Expedición: Fecha y hora de emisión, Usuario emisor responsable (siglas autorizadas).
  - Estado de documento no encontrado o inválido si el código es alterado o inexistente.

---

## 3. Decisiones Técnicas y de Arquitectura

### A. Generación del Código QR
- **Enfoque Técnico**: Generación vectorial SVG/Canvas client-side utilizando una biblioteca estándar y probada como `qrcode` (o generación de Data URI en SVG/PNG de alta definición 300 DPI para impresión nítida).
- **Contenido del QR**: URL canónica absoluta (ej. `https://<dominio>/validar/<codigo_verificacion>`).
- **Resiliencia**: Funciona tanto en entorno de desarrollo como en producción (`window.location.origin`).

### B. Generación de Iniciales del Usuario
- **Algoritmo de Extracción**:
  ```ts
  export function getInitials(fullName: string | null | undefined): string {
    if (!fullName) return 'DA'; // Dirección de Admisión por defecto
    const clean = fullName.trim().replace(/\s+/g, ' ');
    const parts = clean.split(' ');
    // Extrae la primera letra en mayúscula de cada palabra relevante
    return parts.map(p => p[0]?.toUpperCase() || '').join('');
  }
  ```
- Soporte para nombres compuestos y apellidos múltiples (*Jhonatan Choque Caritas* $\rightarrow$ `JCH`).

### C. Persistencia y Auditoría de Emisión
- **Tabla en Supabase**: `documentos_verificacion`
  - `id`: UUID (Primary Key)
  - `codigo_verificacion`: String único / CUID (ej. `UNSAAC-2026-XXXXX` o UUID v4)
  - `tipo_documento`: String (ej. `CONSTANCIA DE INGRESO`, `INFORME TÉCNICO`)
  - `estudiante_dni`: String
  - `estudiante_nombre`: String
  - `estudiante_codigo`: String
  - `carrera`: String
  - `modalidad`: String
  - `semestre`: String
  - `usuario_id`: String (UUID del usuario emisor)
  - `usuario_nombre`: String
  - `usuario_iniciales`: String
  - `fecha_emision`: Timestamp ISO con zona horaria
  - `metadata`: JSONB (para parámetros adicionales como número de expediente, boucher, mérito)
- **Seguridad**:
  - Inserción permitida para usuarios autenticados del sistema de admisión.
  - Lectura pública (`SELECT`) permitida para la verificación anónima vía PostgREST / Supabase client filtrando por `codigo_verificacion`.

---

## 4. Diagrama del Sistema y Flujo de Datos

```
┌────────────────────────────────────────────────────────────────────────┐
│                   DIRECCIÓN DE ADMISIÓN UNSAAC                         │
│                                                                        │
│   [ Usuario Logueado: "Jhonatan Choque Caritas" (Siglas: JCH) ]        │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│               MÓDULO: GESTIÓN DE PLANTILLAS (TemplateEditor)           │
│                                                                        │
│  1. Variables disponibles:                                             │
│     - {{nombres}}, {{escuela}}, {{modalidad}}, etc.                    │
│     - {{usuario_iniciales}} -> Reemplaza por "JCH"                     │
│     - {{codigo_qr}}         -> Inserta QR de verificación pública      │
│                                                                        │
│  2. Acción: Previsualizar / Imprimir / Emitir                          │
│     - Genera Código Único (ej. "DOC-UNSAAC-8F29A1")                    │
│     - URL: https://app/validar/DOC-UNSAAC-8F29A1                       │
│     - Renderiza QR en lienzo HTML                                      │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│                  BASE DE DATOS SUPABASE / POSTGRES                     │
│                                                                        │
│  Tabla: documentos_verificacion                                        │
│  {                                                                     │
│    codigo: "DOC-UNSAAC-8F29A1",                                        │
│    estudiante: "JUAN PEREZ QUISPE",                                    │
│    carrera: "INGENIERÍA DE SISTEMAS",                                  │
│    emisor_iniciales: "JCH",                                            │
│    fecha_emision: "2026-10-05T..."                                     │
│  }                                                                     │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│          PORTAL PÚBLICO DE VERIFICACIÓN (/validar/:codigo)             │
│                                                                        │
│   Escaneo de QR con smartphone desde papel o PDF oficial:              │
│   ✔ Documento Válido y Auténtico                                       │
│   ✔ Emitido por la Dirección de Admisión UNSAAC                        │
│   ✔ Firma y Visto Electrónico: Operador JCH                            │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 5. Fases de Ejecución

1. **Base de Datos y Utilidades**:
   - Crear la tabla `documentos_verificacion` con sus políticas de lectura pública por código de verificación.
   - Implementar el helper `getInitials(name)` y el generador de código QR para navegador/impresión.
2. **Actualización de Plantillas Oficiales**:
   - Actualizar `DEFAULT_CONSTANCIA_HTML` en `TemplateEditor.tsx`.
   - Actualizar `DEFAULT_OFFICIAL_TEMPLATES` en `lib/defaultTemplates.ts` reemplazando los textos quemados por `{{usuario_iniciales}}` y `{{codigo_qr}}`.
3. **Mejora del Editor (`TemplateEditor.tsx`)**:
   - Añadir `{{usuario_iniciales}}` y `{{codigo_qr}}` a la lista de variables con previsualización en vivo.
   - Conectar la sustitución dinámica con el usuario activo autenticado (`user.name`).
   - Guardar el registro de emisión en Supabase al imprimir o finalizar la constancia.
4. **Página Pública de Verificación (`/validar/:codigo`)**:
   - Crear el componente `PublicDocumentVerification.tsx` con diseño institucional UNSAAC.
   - Añadir la ruta pública en `App.tsx` accesible sin restricción de login.
5. **Verificación y Pruebas**:
   - Compilación y validación de tipos TypeScript.
   - Prueba de generación de constancia con un estudiante y verificación de lectura del QR escaneable.
