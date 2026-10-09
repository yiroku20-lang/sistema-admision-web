# Plan de Implementación: Almacenamiento de PDFs de Expedientes de Salida en Google Drive

## 1. Diagnóstico y Objetivo Central

### Estado Actual en la Mesa de Salidas (`OutgoingFiles.tsx`)
Actualmente, cuando un operador registra un nuevo **Expediente de Salida** y adjunta un archivo PDF mediante el botón "SUBIR ARCHIVO PDF LOCAL", el sistema realiza la subida directa al bucket de almacenamiento de Supabase:
```typescript
await supabase.storage
  .from('documentos')
  .upload(`salidas/${fileName}`, selectedFile, { contentType: 'application/pdf', upsert: true });
```
Esto satura progresivamente la cuota gratuita de almacenamiento de archivos de Supabase (500 MB / 1 GB), generando costos o límites de servicio.

### Objetivo
Desacoplar el almacenamiento binario de Supabase:
1. Al completar un nuevo expediente de salida y adjuntar el PDF, el archivo se almacena en la **carpeta específica de Google Drive** designada por la institución.
2. En Supabase (`expedientes_salida.pdf_url`) se guarda **únicamente la URL o enlace web** del archivo en Google Drive.
3. El consumo de bytes en Supabase Storage para expedientes de salida pasa a ser **cero**.

---

## 2. Arquitectura de Integración con Google Drive

```
+-----------------------------------------------------------------------------------+
|                            EXPEDIENTE DE SALIDA (FRONTEND)                        |
|                                                                                   |
|  [ Formulario de Salida: Oficio / Destino / Asunto ]                              |
|  [ Adjuntar PDF ] + [ Carpeta Destino de Drive Configurada ]                      |
+-----------------------------------------+-----------------------------------------+
                                          |
                        (Envío del archivo PDF binario)
                                          v
+-----------------------------------------------------------------------------------+
|                      CANAL DE SUBIDA A GOOGLE DRIVE                               |
|                                                                                   |
|  Opción Principal: Servicio Webhook / Google Apps Script Institucional             |
|  - Recibe el archivo PDF en base64/multipart con el ID de la carpeta Drive.       |
|  - Inserta el archivo en la carpeta oficial de Drive mediante cuenta institucional.|
|  - Establece permisos de lectura y genera el enlace oficial (webViewLink).        |
|                                                                                   |
|  Opción Alternativa: Google Workspace Drive API (OAuth 2.0)                       |
|  - Autenticación con cuenta de Google del operador para subir vía Drive API v3.   |
+-----------------------------------------+-----------------------------------------+
                                          |
                     (Retorna enlace web oficial de Drive)
                                          v
+-----------------------------------------------------------------------------------+
|                                BASE DE DATOS SUPABASE                             |
|                                                                                   |
|  Tabla: expedientes_salida                                                        |
|  - doc_number: "OFICIO 120-2024"                                                  |
|  - subject: "REMISIÓN DE EXPEDIENTE ACADÉMICO..."                                 |
|  - pdf_url: "https://drive.google.com/file/d/1XyZ.../view" (Solo texto / link)    |
|  * Cero archivos binarios guardados en Supabase Storage *                         |
+-----------------------------------------------------------------------------------+
```

---

## 3. Componentes y Cambios Específicos

### A. Configuración de la Carpeta de Google Drive
- **Ubicación**: En la cabecera o ajustes de la Mesa de Salidas (`OutgoingFiles.tsx`), permitir configurar el enlace o ID de la carpeta de Drive institucional:
  - Ejemplo: `https://drive.google.com/drive/folders/1ABCxyz_ID_DE_CARPETA`
  - Se almacena de forma persistente (en la tabla `configuracion` de Supabase o `localStorage` con respaldo) para que los operadores no tengan que escribirla en cada registro.

### B. Proceso de Subida en el Modal de Salidas (`handleSave`)
- Al seleccionar un PDF local:
  1. El sistema valida el archivo (tamaño, formato PDF).
  2. Muestra un estado visual: *"Subiendo documento a Google Drive institucional..."*.
  3. Transfiere el archivo a la carpeta de Google Drive configurada.
  4. Obtiene el enlace permanente del archivo (`webViewLink`).
  5. Inserta el registro en `expedientes_salida` guardando el enlace de Drive en `pdf_url`.
  6. Si ocurre algún problema de conectividad con Drive, ofrece como alternativa pegar directamente el enlace de Drive generado manualmente para no bloquear la operación.

### C. Visualización y Acceso en la Tabla de Salidas
- En la tabla de expedientes y en el historial de trámites:
  - Si el enlace corresponde a Google Drive (`drive.google.com`), se muestra con el distintivo ícono de Drive o documento en la nube.
  - Al hacer clic en "Ver PDF", se abre en una pestaña nueva o visor embebido con vista previa optimizada.

---

## 4. Plan de Ejecución Paso a Paso

1. **Paso 1: Configuración de la Carpeta de Drive**
   - Incorporar campo de configuración para la URL/ID de la carpeta compartida de Google Drive en `OutgoingFiles.tsx`.
   - Extractor automático del ID de carpeta a partir de cualquier formato de enlace de Google Drive.

2. **Paso 2: Mecanismo de Subida a Google Drive**
   - Implementar el conector de subida para enviar el PDF hacia Google Drive.
   - Proveer la plantilla del script o conector institucional para desplegar en la cuenta de Google institucional (sin cuotas pagadas y con 15 GB+ de espacio gratis o ilimitado de Google Workspace).

3. **Paso 3: Adaptación del Guardado en Supabase**
   - Modificar `handleSave` en `OutgoingFiles.tsx` para no invocar `supabase.storage.from('documentos')` cuando se use Google Drive.
   - Guardar el enlace resultante de Drive en el campo `pdf_url` de `expedientes_salida`.

4. **Paso 4: Verificación y Pruebas**
   - Verificar la subida de un documento de prueba.
   - Confirmar que el espacio en Supabase Storage no se incrementa.
   - Validar que el botón de descarga y previsualización abra el documento en Drive correctamente.
